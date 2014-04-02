var db = require('./settings')().mongo;
var mongoose = require('mongoose');
var increment = require('mongoose-auto-increment');
var encoding = require('./encoding');
var Promise = require('bluebird');
var NotFoundError = require('./not-found');
 
increment.initialize(db);

var pollSchema = mongoose.Schema({
  title: String,
  opts: [String],
  votes: [Number],
  strict: Boolean,
  creator: String
});

pollSchema.plugin(increment.plugin, {
  model: 'Poll',
  startAt: 1000
});

var Poll = mongoose.model('Poll', pollSchema);
Promise.promisifyAll(Poll);

Poll.create = function(opts) {
  var poll = new Poll(opts);
  return new Promise(function(resolve, reject) {
    poll.save(function() {
      resolve(poll);
    });
  });
};

Poll.find = function(id) {
  return this.findOneAsync({ _id: id }).then(function(poll) {
    if (poll) {
      return Promise.resolve(poll);
    } else {
      return Promise.reject(new NotFoundError());
    }
  });
};

Poll.findEncoded = function(encodedId) {
  var id = encoding.toNumber(encodedId);
  if (isNaN(id)) {
    return Promise.reject(new NotFoundError());
  }

  return this.find(id);
};

Poll.vote = function(id, optionIndex) {
  var update = { $inc: { } };
  update['$inc']['votes.' + optionIndex] = 1;

  return Poll.findOneAndUpdateAsync({ _id:  id }, update, {}).then(function(poll) {
    if (poll) {
      return Promise.resolve(poll);
    } else {
      return Promise.reject(new NotFoundError());
    }
  });
};

module.exports = Poll;
