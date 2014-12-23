var co = require('co');
var ip = require('ipaddr.js');
var Promise = require('bluebird');
var mongodb = require('mongodb');
var MongoClient = Promise.promisifyAll(mongodb.MongoClient);
Promise.promisifyAll(mongodb);

// New schema:
/*
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
*/

function migratePoll(poll) {
  var up = {
    title: poll.title,
    opts: poll.opts,
    votes: poll.votes,
    strict: true,
    creator: new Buffer(ip.parse(poll.creator).toByteArray()),
    comments: [],
    allowComments: false,
    key: null,
    maxVotes: 1,
    time: Date.now()
  };

  return up;
}

co.wrap(function *() {
  var db = yield MongoClient.connectAsync('mongodb://localhost/litepoll');

  var pollCollection = db.collection('polls');
  var polls = yield (yield pollCollection.findAsync({})).toArrayAsync();

  for (var i = 0; i < polls.length; ++i) {
    var poll = polls[i];
    var migrated = migratePoll(poll);
    console.log('Updating poll ' + poll._id + '.');
    var res = yield pollCollection.updateAsync({ _id: poll._id }, migrated);
    console.log('Result: ' + res);
  }

  console.log('Renaming auto-increment collection.');
  var autoIncrementCollection = db.collection('mongoose-auto-increments');
  var res = yield autoIncrementCollection.renameAsync('identitycounters');
  console.log('Result: ' + res);

  console.log('Fin.');
})();
