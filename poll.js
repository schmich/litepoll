var db = require('./mongo');
var mongoose = require('mongoose');
var increment = require('mongoose-auto-increment');

increment.initialize(db);

var pollSchema = mongoose.Schema({
  title: String,
  opts: [String],
  votes: [Number],
  creator: String
});

pollSchema.plugin(increment.plugin, 'Poll');
var Poll = mongoose.model('Poll', pollSchema);

module.exports = Poll;
