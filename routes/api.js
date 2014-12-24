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
var ip = require('ipaddr.js');
var _ = require('underscore');

function err(message) {
  throw new BadRequestError(message);
}

function redisCachePollOptions(poll) {
  var cache = {
    title: poll.title,
    options: poll.opts,
    maxVotes: poll.maxVotes
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
  var expires = moment().utc().add(1, 'years');
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

  var allowComments = req.body.allowComments;
  if (allowComments === undefined) {
    err("A value for 'allowComments' is required.");
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

  var maxVotes = req.body.maxVotes;
  if (maxVotes === undefined) {
    err("A value for 'maxVotes' is required.");
  }

  maxVotes = parseInt(maxVotes);
  if (isNaN(maxVotes) || !isFinite(maxVotes)) {
    err("Integer 'maxVotes' is required.");
  }

  if (maxVotes < 1 || maxVotes > options.length) {
    err("'maxVotes' must be between 1 and the number of options.");
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
    creator: new Buffer(ip.parse(req.ip).toByteArray()),
    comments: [],
    allowComments: allowComments ? true : false,
    key: key,
    maxVotes: maxVotes,
    time: Date.now()
  });
  
  var id = encoding.fromNumber(poll._id);
  if (secret) {
    id += ':' + key;
  }

  res.set('Location', '/polls/' + id);
  res.status(201).send({ path: { web: '/' + id + '/s', api: '/polls/' + id } });

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

  if (votes.length > poll.maxVotes) {
    err("'votes' count cannot exceed max poll vote count.");
  }

  for (var i = 0; i < votes.length; ++i) {
    if (votes[i] >= (poll.opts || poll.options).length) {
      err("Each of 'votes' must be in range.");
    }
  }

  var commitVote = co.wrap(function *() {
    var poll = yield Poll.vote(id, votes);
    res.status(200).send({ path: { web: '/' + id + '/r' } });
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
      maxVotes: poll.maxVotes
    });

    redisCachePollOptions(poll);
  }
};

exports.show = function *(req, res) {
  var id = req.params.id;

  setNoCache(res);

  var poll = yield Poll.find(id);

  var index = 0;
  var comments = _.map(poll.comments, function(c) {
    return {
      text: c.text,
      time: c.time.getTime(),
      votes: c.votes,
      index: index++
    };
  });

  res.send({
    id: id,
    title: poll.title,
    options: poll.opts,
    votes: poll.votes,
    comments: comments,
    time: poll.time.getTime(),
    allowComments: poll.allowComments,
    maxVotes: poll.maxVotes
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

  var comment = yield Poll.addComment(id, comment, req.ip);
  if (comment) {
    res.set('Location', '/polls/' + id + '/comments/' + comment.index);
    res.status(201).send({});
    sse.publish('polls:' + id, 'comment', {
      index: comment.index,
      text: comment.text,
      time: comment.time,
      votes: comment.votes
    });
  } else {
    err("You have already commented on this poll.");
  }
};

exports.voteComment = function *(req, res) {
  var pollId = req.params.pollId;
  var commentIndex = req.params.commentIndex;

  commentIndex = parseInt(commentIndex);
  if (isNaN(commentIndex) || !isFinite(commentIndex)) {
    err("'commentIndex' must be an integer.");
  }

  if (commentIndex < 0) {
    err("'commentIndex' must be in range.");
  }

  var upvote = req.body.upvote;
  if (upvote === undefined) {
    err("'upvote' is required.");
  }

  upvote = upvote ? true : false;

  var votes = yield Poll.voteComment(pollId, commentIndex, upvote, req.ip);
  if (votes !== null) {
    res.send({});
    sse.publish('polls:' + pollId, 'comment:vote', { index: commentIndex, votes: votes });
  } else {
    err("You have already voted on this comment.");
  }
};

exports.events = function *(req, res) {
  sse.stream(req, res, 'polls:' + req.params.id);
};
