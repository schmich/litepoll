var redis = require('../lib/settings')().redis;
var Poll = require('../lib/poll');
var streaming = require('../lib/streaming');
var encoding = require('../lib/encoding');
var moment = require('moment');
var Promise = require('bluebird');
var _ = require('underscore');

Promise.promisifyAll(redis);

function error(res, message, code) {
  res.send(code || 400, { error: message });
}

function redisCacheOptions(poll) {
  var cache = { title: poll.title, options: poll.opts };
  var key = 'q:' + poll._id;
  redis.set(key, JSON.stringify(cache), function(err) {
    if (!err) {
      redis.expire(key, 60 * 60 /* 1 hour */);
    }
  });
}

function maxCache(res, seconds) {
  cache(res, 60 * 60 * 24 * 365 /* 1 year */);
}

function cache(res, seconds) {
  var expires = moment().utc().add('years', 1);
  res.set('Cache-Control', 'public, max-age=' + seconds);
  res.set('Expires', expires.format('ddd, D MMM YYYY HH:mm:ss [GMT]'));
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

  for (var i = 0; i < options.length; ++i) {
    var option = options[i];
    if (!option || !option.trim()) {
      return error(res, "'options' must not be empty.");
    } else if (option.length > 140) {
      return error(res, "Option length must not exceed 140 characters.")
    }
  }

  if (options.length < 2) {
    return error(res, "At least two 'options' are required.");
  } else if (options.length > 32) {
    return error(res, "Number of options must not exceed 32.")
  }

  var votes = [];
  for (var i = 0; i < options.length; ++i) {
    votes.push(0);
  }

  var strict = req.body.strict;
  if (strict === undefined) {
    return error(res, "A value for 'strict' is required.");
  }

  Poll.create({
    title: title,
    opts: options,
    votes: votes,
    strict: strict ? true : false,
    creator: req.ip
  }).then(function(poll) {
    // TODO: Check for errors.
    var encodedId = encoding.fromNumber(poll._id);
    res.set('Location', '/polls/' + encodedId);
    res.send(201, { path: { web: '/' + encodedId + '/s', api: '/polls/' + encodedId } });

    redisCacheOptions(poll);
  });
};

// PUT /:id
exports.vote = function(req, res) {
  var encodedId = req.params.id;

  var id = encoding.toNumber(encodedId);
  if (isNaN(id)) {
    return error(res, "'id' is invalid.");
  }

  var vote = req.body.vote;
  if (vote == null) {
    return error(res, "'vote' is required.");
  }

  var voteIndex = parseInt(vote);
  if (isNaN(voteIndex) || !isFinite(voteIndex)) {
    return error(res, "Integer 'vote' is required.");
  }

  if (voteIndex < 0) {
    return error(res, "'vote' must be in range.");
  }

  var ip = req.ip;
  var ipKey = 'q:' + id + ':ip';
  // TODO: Race condition, multiple votes are actually allowed.
  return redis.sismemberAsync(ipKey, ip).then(function(member) {
    if (member) {
      return error(res, "You have already voted in this poll.");
    } else {
      return Poll.vote(id, voteIndex).then(function(poll) {
        res.send({});

        // Notify clients of vote.
        streaming.getClient().publish('/polls/' + encodedId, { votes: poll.votes });

        // Ignore any errors when adding IP to the voted-IP list.
        redis.sadd(ipKey, ip);
      });
    }
  });
};

exports.options = function(req, res) {
  var id = encoding.toNumber(req.params.id);
  if (isNaN(id)) {
    return error(res, "'id' is invalid.");
  }

  return redis.getAsync('q:' + id).then(function(cache) {
    if (cache) {
      maxCache(res);
      res.set('Content-Type', 'application/json');
      res.send(cache);
      return Promise.resolve();
    } else {
      return Poll.find(id).then(function(poll) {
        maxCache(res);
        res.send({ title: poll.title, options: poll.opts });
        redisCacheOptions(poll);
      });
    }
  });
};

exports.show = function(req, res) {
  return Poll.findEncoded(req.params.id).then(function(poll) {
    res.send({ title: poll.title, options: _.zip(poll.opts, poll.votes) });
  });
};
