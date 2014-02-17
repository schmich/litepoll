var Poll = require('../poll');
var redis = require('../redis');
var streaming = require('../streaming');
var underscore = require('underscore');
var encoding = require('../encoding');

function pollNotFound(res, pollId) {
  notFound(res, "Question '" + pollId + "' does not exist.");
}

function notFound(res, message) {
  error(res, message, 404);
}

function error(res, message, code) {
  res.send(code || 400, { error: message });
}

function mongoGetPoll(id, callback) {
  Poll.findOne({ _id: id }, function(err, poll) {
    if (err) {
      callback(null);
    } else {
      callback(poll);
    }
  });
}

function redisCacheOptions(poll) {
  var cache = { title: poll.title, options: poll.opts };
  var key = 'q:' + poll._id;
  redis.set(key, JSON.stringify(cache), function(err) {
    if (!err) {
      redis.expire(key, 15 * 60 /* 15 minutes */);
    }
  });
}

exports.create = function(req, res) {
  var title = req.body.title;

  if (!title || !title.trim()) {
    return error(res, "A non-empty 'title' is required.");
  }

  if (title.length > 140) {
    return error(res, "'title' length must not exceed 140 characters.")
  }

  var options = req.body.options;
  if (!options || !options.length) {
    return error(res, "At least two non-empty 'options' are required.");
  }

  options.forEach(function(option) {
    if (!option && !option.trim()) {
      return error(res, "'options' must not be empty.");
    } else if (option.length > 140) {
      return error(res, "Option length must not exceed 140 characters.")
    }
  });

  if (options.length < 2) {
    return error(res, "At least two 'options' are required.");
  } else if (options.length > 32) {
    return error(res, "Number of options must not exceed 32.")
  }

  var votes = [];
  for (var i = 0; i < options.length; ++i) {
    votes.push(0);
  }

  var poll = new Poll({
    title: title,
    opts: options,
    votes: votes
  });

  poll.save(function() {
    // TODO: Check for errors.
    var encodedId = encoding.fromNumber(poll._id);
    res.send(201, { path: { web: '/' + encodedId + '/s', api: '/poll/' + encodedId } });

    redisCacheOptions(poll);
  });
};

// TODO: Validate: must have vote.
// TODO: Check IPs
// PUT /:id
exports.vote = function(req, res) {
  var encodedId = req.params.id;
  if (!encodedId) {
    return error(res, "'id' is required.");
  }

  var id = encoding.toNumber(encodedId);
  if (isNaN(id)) {
    return error(res, "'id' is invalid.");
  }

  var ip = req.ip;
  var ipKey = 'q:' + id + ':ip';
  redis.sismember(ipKey, ip, function(err, member) {
    if (member) {
      return error(res, "You have already voted.");
    } else {
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

      var update = { $inc: { } };
      update['$inc']['votes.' + voteIndex] = 1;

      Poll.findOneAndUpdate({ _id:  id }, update, {}, function(err, poll) {
        if (!poll) {
          return error(res, "'id' not found or 'vote' not in range.");
        } else {
          res.send({});

          // Notify clients of vote.
          streaming.getClient().publish('/poll/' + encodedId, poll.votes);

          // Ignore any errors when adding IP to the voted-IP list.
          redis.sadd(ipKey, ip);
        }
      });
    }
  });
};

exports.options = function(req, res) {
  var encodedId = req.params.id;
  if (!encodedId) {
    return error(res, "'id' is required.");
  }

  var id = encoding.toNumber(encodedId);
  if (isNaN(id)) {
    return error(res, "'id' is invalid.");
  }
  
  redis.get('q:' + id, function(err, cache) {
    if (cache) {
      var poll = JSON.parse(cache);
      res.send(poll);
    } else {
      mongoGetPoll(id, function(poll) {
        if (poll) {
          res.send({ title: poll.title, options: poll.opts });
          redisCacheOptions(poll);
        } else {
          return pollNotFound(res, encodedId);
        }
      });
    }
  });
};

exports.show = function(req, res) {
  var encodedId = req.params.id;
  if (!encodedId) {
    return error(res, "'id' is required.");
  }

  var id = encoding.toNumber(encodedId);
  if (isNaN(id)) {
    return error(res, "'id' is invalid.");
  }

  mongoGetPoll(id, function(poll) {
    if (poll) {
      res.send({ title: poll.title, options: underscore.zip(poll.opts, poll.votes) });
    } else {
      return pollNotFound(res, encodedId);
    }
  });
};
