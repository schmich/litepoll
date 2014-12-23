var db = require('./settings').settings.mongo;
var co = require('co');
var mongoose = require('mongoose');
var increment = require('mongoose-auto-increment');
var encoding = require('./encoding');
var Promise = require('bluebird');
var NotFoundError = require('./not-found');
var BadRequestError = require('./bad-request');
var ip = require('ipaddr.js');
 
increment.initialize(db);

var commentSchema = mongoose.Schema({
  text: String,
  time: Date,
  votes: Number,
  voters: [Buffer],
  ip: Buffer
}, { _id: false });

var pollSchema = mongoose.Schema({
  title: String,
  opts: [String],
  votes: [Number],
  strict: Boolean,
  creator: Buffer,
  comments: [commentSchema],
  allowComments: Boolean,
  key: String,
  maxVotes: Number,
  time: Date
});

pollSchema.plugin(increment.plugin, {
  model: 'Poll',
  startAt: 1000
});

var Poll = mongoose.model('Poll', pollSchema);
Promise.promisifyAll(Poll);

function findParams(id) {
  var key = null;
  if (typeof id != 'number') {
    var parts = id.split(':');

    id = encoding.toNumber(parts[0]);
    if (isNaN(id)) {
      throw new NotFoundError();
    }

    key = parts[1] || null;
  }

  return { _id: id, key: key };
}

Poll.create = function(opts) {
  var poll = new Poll(opts);
  return new Promise(function(resolve, reject) {
    poll.save(function() {
      resolve(poll);
    });
  });
};

Poll.find = function(id) {
  var find = findParams(id);

  return this.findOneAsync(find).then(function(poll) {
    if (poll) {
      return Promise.resolve(poll);
    } else {
      return Promise.reject(new NotFoundError());
    }
  });
};

Poll.vote = function(id, voteIndexes) {
  var find = findParams(id);

  var update = { $inc: { } };
  for (var i = 0; i < voteIndexes.length; ++i) {
    update.$inc['votes.' + voteIndexes[i]] = 1;
  }

  return Poll.findOneAndUpdateAsync(find, update, {}).then(function(poll) {
    if (poll) {
      return Promise.resolve(poll);
    } else {
      return Promise.reject(new NotFoundError());
    }
  });
};

Poll.addComment = function(id, comment, ipAddress) {
  return co(function *() {
    var poll = yield Poll.find(id);
    if (!poll.allowComments) {
      throw new BadRequestError('Comments are not allowed.');
    }

    var ipBuffer = new Buffer(ip.parse(ipAddress).toByteArray());
    var find = findParams(id);
    if (poll.strict) {
      find['comments.ip'] = { $ne: ipBuffer };
    }

    var newComment = {
      text: comment,
      time: Date.now(),
      votes: 0,
      voters: [],
      ip: ipBuffer
    };

    var poll = yield Poll.findOneAndUpdateAsync(
      find,
      { $push: { comments: newComment } },
      { select: 'comments' }
    );

    if (poll) {
      newComment.index = poll.comments.length - 1;
      return newComment;
    } else {
      return null;
    }
  });
};

Poll.voteComment = function(pollId, commentIndex, upvote, ipAddress) {
  return co(function *() {
    var poll = yield Poll.find(pollId);
    if (!poll.allowComments) {
      throw new BadRequestError('Comments are not allowed.');
    }

    if (commentIndex >= poll.comments.length) {
      throw new BadRequestError("'commentIndex' must be in range.");
    }

    var ipBuffer = new Buffer(ip.parse(ipAddress).toByteArray());
    var find = findParams(pollId);
    if (poll.strict) {
      find['comments.' + commentIndex + '.voters'] = { $ne: ipBuffer};
    }

    var update = { $inc: { }, $addToSet: { } };
    update.$inc['comments.' + commentIndex + '.votes'] =  upvote ? 1 : -1;
    update.$addToSet['comments.' + commentIndex + '.voters'] = ipBuffer;

    var poll = yield Poll.findOneAndUpdateAsync(
      find,
      update,
      { select: 'comments' }
    );

    return poll ? poll.comments[commentIndex].votes : null;
  });
};

module.exports = Poll;
