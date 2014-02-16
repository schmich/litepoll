var redis = require('../redis');
var streaming = require('../streaming');

function pollNotFound(res, pollId) {
  notFound(res, "Question '" + pollId + "' does not exist.");
}

function notFound(res, message) {
  error(res, message, 404);
}

function error(res, message, code) {
  res.send(code || 400, { error: message });
}

exports.createForm = function(req, res) {
  res.render('create');
};

exports.create = function(req, res) {
  var title = req.body.title;

  if (!title || !title.trim()) {
    return error(res, "A non-empty 'title' is required.");
  }

  if (title.length > 256) {
    return error(res, "'title' length must not exceed 256 characters.")
  }

  var options = req.body.options;
  if (!options || !options.length) {
    return error(res, "At least two non-empty 'options' are required.");
  }

  options.forEach(function(option) {
    if (!option && !option.trim()) {
      return error(res, "'options' must not be empty.");
    } else if (option.length > 256) {
      return error(res, "Option length must not exceed 256 characters.")
    }
  });

  if (options.length < 2) {
    return error(res, "At least two 'options' are required.");
  } else if (options.length > 32) {
    return error(res, "Number of options must not exceed 32.")
  }

  redis.incr('max-id', function(err, value) {
    var id = (+value).toString(36);
    var qid = 'q:' + id;

    redis.set(qid + ':t', title, function(err) {
      var votes = [];
      for (var i = 0; i < req.body.options.length; ++i) {
        votes.push(0);
        votes.push(i);
      }

      votes.unshift(qid + ':v');

      redis.send_command('zadd', votes, function(err) {
        var args = options.reverse();
        args.unshift(qid + ':o');

        redis.send_command('lpush', args, function(err) {
          res.send(201, { path: { web: '/' + id, api: '/poll/' + id } });
        });
      });
    });
  });
};

// TODO: Validate: must have vote.
// TODO: Check IPs
// TODO: Scrub input (id).
// TODO: Ensure id is within range (zcard)
// PUT /:id
exports.vote = function(req, res) {
  var id = req.params.id;
  if (!id) {
    return error(res, "'id' is required.");
  }

  var vote = req.body.vote;
  if (vote == null) {
    return error(res, "'vote' is required.");
  }

  var voteIndex = +vote;
  if (voteIndex != vote) {
    return error(res, "Integer 'vote' is required.");
  }

  if (voteIndex < 0) {
    return error(res, "'vote' must be in range.");
  }

  var key = 'q:' + id + ':v';
  redis.exists(key, function(err, exists) {
    if (!exists) {
      return pollNotFound(res, id);
    } else {
      redis.zcard(key, function(err, card) {
        if (voteIndex >= card) {
          return error(res, "'vote' must be in range.");
        } else {
          redis.zincrby(key, 1, voteIndex, function(err) {
            res.send({});
            streaming.getClient().publish('/poll/' + id, { vote: voteIndex });
          });
        }
      });
    }
  });
};

exports.showJson = function(req, res) {
  var id = req.params.id;
  var qid = 'q:' + id;
  redis.get(qid + ':t', function(err, title) {
    if (title == null) {
      // A null title means the key (poll) does not exist. 
      return pollNotFound(res, id);
    }

    redis.lrange(qid + ':o', 0, -1, function(err, options) {
      var optionsVotes = [];
      for (var i = 0; i < options.length; ++i) {
        optionsVotes.push({ option: options[i], votes: 0 });
      }

      redis.send_command('zrange', [qid + ':v', '0', '-1', 'withscores'], function(err, votes) {
        for (var i = 0; i < votes.length; i += 2) {
          optionsVotes[+votes[i]].votes = +votes[i + 1];
        }

        res.send({ title: title, options: optionsVotes });
      });
    });
  });
};

// TODO: Handle 404 for invalid poll ID
exports.showHtml = function(req, res) {
  res.render('vote', { id: req.params.id });
};

// TODO: Handle 404 for invalid poll ID
exports.results = function(req, res) {
  res.render('results', { id: req.params.id });
};
