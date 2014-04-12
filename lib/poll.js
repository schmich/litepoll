var db = require('./settings').settings.mongo;
var co = require('co');
var mongoose = require('mongoose');
var increment = require('mongoose-auto-increment');
var encoding = require('./encoding');
var Promise = require('bluebird');
var NotFoundError = require('./not-found');
var BadRequestError = require('./bad-request');
var ip = require('ip');
 
increment.initialize(db);

var commentSchema = mongoose.Schema({
  text: String,
  ip: Buffer,
  time: Date
}, { _id: false });

var pollSchema = mongoose.Schema({
  title: String,
  opts: [String],
  votes: [Number],
  strict: Boolean,
  creator: Buffer,
  comments: [commentSchema],
  key: String,
  choices: Number,
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
    update['$inc']['votes.' + voteIndexes[i]] = 1;
  }

  return Poll.findOneAndUpdateAsync(find, update, {}).then(function(poll) {
    if (poll) {
      return Promise.resolve(poll);
    } else {
      return Promise.reject(new NotFoundError());
    }
  });
};

Poll.addComment = function(id, ipAddress, comment) {
  return co(function *() {
    var ipBuffer = ip.toBuffer(ipAddress);
    var newComment = { text: comment, ip: ipBuffer, time: Date.now() };
    var update = { $push: { comments: newComment } };
    var select = { select: '_id' };
    var find = findParams(id);

    var poll = yield Poll.find(id);
    if (poll.strict) {
      find['comments.ip'] = { $ne: ipBuffer };
    }

    var updated = yield Poll.findOneAndUpdateAsync(find, update, select);
    return updated ? newComment : null;
  });
};

module.exports = Poll;
