var redis = require('../lib/settings').settings.redis;
var Poll = require('../lib/poll');
var encoding = require('../lib/encoding');
var moment = require('moment');
var Promise = require('bluebird');
var NotFoundError = require('../lib/not-found');
var BadRequestError = require('../lib/bad-request');
var createKey = require('../lib/key').createKey;
var sse = require('../lib/sse');
var co = require('co');
var ip = require('ip');
var _ = require('underscore');

function err(message) {
  throw new BadRequestError(message);
}

function redisCachePollOptions(poll) {
  var cache = {
    title: poll.title,
    options: poll.opts,
    choices: poll.choices
  };

  var key = 'q:' + poll._id;
  redis.set(key, JSON.stringify(cache), function(err) {
    if (!err) {
      redis.expire(key, 60 * 60 /* 1 hour */);
    }
  });
}

function setNoCache(res) {
  res.set('Cache-Control', 'max-age=0, no-cache, no-store, must-revalidate');
}

function setMaxCache(res, seconds) {
  setCache(res, 60 * 60 * 24 * 365 /* 1 year */);
}

function setCache(res, seconds) {
  var expires = moment().utc().add('years', 1);
  res.set('Cache-Control', 'public, max-age=' + seconds);
  res.set('Expires', expires.format('ddd, DD MMM YYYY HH:mm:ss [GMT]'));
}

exports.create = function *(req, res) {
  var title = req.body.title;

  if (!title || !title.trim()) {
    err("A non-empty 'title' is required.");
  }

  if (title.length > 140) {
    err("'title' length must not exceed 140 characters.")
  }

  var secret = req.body.secret;
  if (secret === undefined) {
    err("A value for 'secret' is required.");
  }

  var options = req.body.options;
  if (!options || !options.length) {
    err("At least two non-empty 'options' are required.");
  }

  for (var i = 0; i < options.length; ++i) {
    var option = options[i];
    if (!option || !option.trim()) {
      err("'options' must not be empty.");
    } else if (option.length > 140) {
      err("Option length must not exceed 140 characters.")
    }
  }

  if (options.length < 2) {
    err("At least two 'options' are required.");
  } else if (options.length > 32) {
    err("Number of options must not exceed 32.")
  }

  var votes = [];
  for (var i = 0; i < options.length; ++i) {
    votes.push(0);
  }

  var strict = req.body.strict;
  if (strict === undefined) {
    err("A value for 'strict' is required.");
  }

  var choices = req.body.choices;
  if (choices === undefined) {
    err("A value for 'choices' is required.");
  }

  var choices = parseInt(choices);
  if (isNaN(choices) || !isFinite(choices)) {
    err("Integer 'choices' is required.");
  }

  if (choices < 1 || choices > options.length) {
    err("'choices' must be between 1 and the number of options.");
  }

  var key = null;
  if (secret) {
    key = yield createKey();
  }

  var poll = yield Poll.create({
    title: title,
    opts: options,
    votes: votes,
    strict: strict ? true : false,
    creator: ip.toBuffer(req.ip),
    comments: [],
    key: key,
    choices: choices,
    time: Date.now()
  });
  
  var id = encoding.fromNumber(poll._id);
  if (secret) {
    id += ':' + key;
  }

  res.set('Location', '/polls/' + id);
  res.send(201, { path: { web: '/' + id + '/s', api: '/polls/' + id } });

  redisCachePollOptions(poll);
};

exports.vote = function *(req, res) {
  var id = req.params.id;

  var votes = req.body.votes;
  if (votes === undefined) {
    err("'votes' is required.");
  }

  if ((typeof votes != 'object') || (votes.length === undefined)) {
    err("'votes' must be an array.");
  }

  if (votes.length == 0) {
    err("'votes' must not be empty.");
  }

  for (var i = 0; i < votes.length; ++i) {
    var index = parseInt(votes[i]);
    if (isNaN(index) || !isFinite(index)) {
      err("Each of 'votes' must be an integer.");
    }

    if (index < 0) {
      err("Each of 'votes' must be in range.");
    }

    votes[i] = index;
  }

  var cache = yield redis.get('q:' + id);
  var poll = cache ? JSON.parse(cache) : yield Poll.find(id);

  if (votes.length > poll.choices) {
    err("'votes' count cannot exceed max poll choices.");
  }

  for (var i = 0; i < votes.length; ++i) {
    if (votes[i] >= (poll.opts || poll.options).length) {
      err("Each of 'votes' must be in range.");
    }
  }

  var commitVote = co(function *() {
    var poll = yield Poll.vote(id, votes);
    res.send(200, { path: { web: '/' + id + '/r' } });
    sse.publish('polls:' + id, 'vote', poll.votes);
  });

  if (poll.strict) {
    var ipKey = 'q:' + id + ':ip';
    var count = yield redis.sadd(ipKey, req.ip);
    if (count == 0) {
      err("You have already voted in this poll.");
    } else {
      commitVote();
    }
  } else {
    commitVote();
  }
};

exports.options = function *(req, res) {
  var id = req.params.id;

  var cache = yield redis.get('q:' + id);
  if (cache) {
    setMaxCache(res);
    res.set('Content-Type', 'application/json');
    res.send(cache);
  } else {
    var poll = yield Poll.find(id);
    setMaxCache(res);
    res.send({
      title: poll.title,
      options: poll.opts,
      choices: poll.choices
    });

    redisCachePollOptions(poll);
  }
};

exports.show = function *(req, res) {
  var id = req.params.id;

  setNoCache(res);

  var poll = yield Poll.find(id);
  res.send({
    id: id,
    title: poll.title,
    options: poll.opts,
    votes: poll.votes,
    comments: _.map(poll.comments, function(c) { return c.text }),
    choices: poll.choices
  });
};

exports.comment = function *(req, res) {
  var id = req.params.id;

  var comment = req.body.comment;
  if (!comment) {
    err("'comment' is required.");
  }

  if (comment.length < 1 || comment.length > 140) {
    err("'comment' length must be between 1-140 characters.");
  }

  var added = yield Poll.addComment(id, req.ip, comment);
  if (added) {
    res.send({});
    sse.publish('polls:' + id, 'comment', comment);
  } else {
    err("You have already commented on this poll.");
  }
};

exports.events = function *(req, res) {
  sse.stream(req, res, 'polls:' + req.params.id);
};
