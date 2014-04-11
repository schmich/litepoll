process.env.NODE_ENV = 'test';

var settings = require('../lib/settings').configure({
  mongo: 'mongodb://localhost/litepoll_test',
  redis: 'redis://localhost/1'
});
var Promise = require('bluebird');
var Poll = require('../lib/poll');
var assert = require('chai').assert;
var url = require('url');
var request = require('co-request');
var server = require('../server');
var port = process.env.PORT || 3001;
var co = require('co');
var mocha = require('co-mocha');
var mongodb = require('mongodb');
var ip = require('ip');
var MongoClient = Promise.promisifyAll(mongodb.MongoClient);
Promise.promisifyAll(mongodb.Db.prototype);

server.listen(port, function() { });

function Client(endpoint) {
  this.endpoint = endpoint;

  this.get = function(path, json) {
    return request({
      method: 'GET',
      json: true,
      url: url.resolve(this.endpoint, path)
    });
  }

  this.post = function(path, json) {
    return request({
      method: 'POST',
      json: json,
      url: url.resolve(this.endpoint, path)
    });
  }

  this.patch = function(path, json) {
    return request({
      method: 'PATCH',
      json: json,
      url: url.resolve(this.endpoint, path)
    });
  }
}

var client = new Client('http://localhost:' + port + '/');

after(function *() {
  var db = yield MongoClient.connectAsync(settings.options.mongo);
  yield db.dropDatabaseAsync();
  yield db.closeAsync();
  yield settings.redis.flushdb();
});

before(function *() {
  // Connect to force creation of the test database
  // if it doesn't already exist.
  yield MongoClient.connectAsync(settings.options.mongo);
});

beforeEach(function *() {
  yield Poll.removeAsync({});
  yield settings.redis.flushdb();
});

describe('Poll', function() {
  var pollInfo = {
    title: 'Best color?',
    opts: ['Red', 'Green', 'Blue'],
    votes: [0, 0, 0],
    strict: true,
    creator: '127.0.0.1',
    secret: false,
    choices: 1,
    time: Date.now()
  };

  describe('#create', function() {
    it('creates a poll', function *() {
      var poll = yield Poll.create(pollInfo);
      assert.isNotNull(poll);
    });
  });

  describe('#addComment', function() {
    it('adds a comment', function *() {
      var poll = yield Poll.create(pollInfo);
      assert.isNotNull(poll);
      var added = yield Poll.addComment(poll._id, '1.1.1.1', 'Comment');
      assert(added);
      poll = yield Poll.find(poll._id);
      assert.isNotNull(poll.comments);
      assert.equal(poll.comments.length, 1);
      assert.equal(poll.comments[0].text, 'Comment');
      assert.equal(ip.toString(poll.comments[0].ip), '1.1.1.1');
    });
  });
});

describe('Server', function() {
  var poll = null;
  beforeEach(function() {
    poll = {
      title: 'Best color?',
      options: ['Red', 'Green', 'Blue'],
      strict: true,
      secret: false,
      choices: 1
    };
  });

  describe('POST /polls', function() {
    it('requires a title value', function *() {
      delete poll.title;
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('requires a non-empty title', function *() {
      poll.title = ' ';
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('requires a title less than 140 characters', function *() {
      poll.title = 'x';
      for (var i = 0; i < 140; ++i)
        poll.title += 'x';

      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('requires an option value', function *() {
      delete poll.options;
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('requires a secret value', function *() {
      delete poll.secret;
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('requires at least 2 options', function *() {
      poll.options = ['Red'];
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('requires less than 32 options', function *() {
      poll.options = ['x'];
      for (var i = 0; i < 32; ++i) {
        poll.options.push('x');
      }

      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('requires option length less than 140 characters', function *() {
      poll.options = ['Red', 'Green', 'x'];
      for (var i = 0; i < 140; ++i) {
        poll.options[2] += 'x';
      }
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('requires non-empty options', function *() {
      poll.options = ['Red', 'Green', ''];
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('requires a strict value', function *() {
      delete poll.strict;
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('successfully creates a poll', function *() {
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      assert.isDefined(res.headers.location);
      assert.isDefined(res.body.path);
      assert.isDefined(res.body.path.web);
      assert.isDefined(res.body.path.api);
    });

    it('successfully creates a secret poll', function *() {
      poll.secret = true;
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      assert.isDefined(res.headers.location);
      assert(res.headers.location.indexOf(':') >= 1);
    });

    it('requires a choices value', function *() {
      delete poll.choices;
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('requires an integer choices', function *() {
      poll.choices = 'foo';
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('requires choices >= 1', function *() {
      poll.choices = 0;
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('requires choices <= options.length', function *() {
      poll.choices = poll.options.length + 1;
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('successfully creates a poll with max choices', function *() {
      poll.choices = poll.options.length;
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      res = yield client.get(location);
      assert.equal(res.statusCode, 200);
      var newPoll = res.body;
      assert.equal(newPoll.choices, poll.choices);
    });
  });

  describe('GET /polls/:id', function() {
    it('returns 404 when poll does not exist', function *() {
      var res = yield client.get('polls/123456789');
      assert.equal(res.statusCode, 404);
    });

    it('returns an error when ID is invalid', function *() {
      var res = yield client.get('polls/b42@');
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('returns the poll', function *() {
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      res = yield client.get(location);
      assert.equal(res.statusCode, 200);
      assert(res.headers['content-type'].indexOf('application/json') >= 0);
      var newPoll = res.body;
      assert.equal(newPoll.title, poll.title);
      assert.isUndefined(newPoll.strict);
      assert.isDefined(newPoll.comments);
      assert.equal(newPoll.comments.length, 0);
      assert.equal(newPoll.options.length, poll.options.length);
      for (var i = 0; i < poll.options.length; ++i) {
        assert.equal(newPoll.options[i], poll.options[i]);
        assert.equal(newPoll.votes[i], 0);
      }
    });

    it('returns the secret poll', function *() {
      poll.secret = true;
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      res = yield client.get(location);
      assert.equal(res.statusCode, 200);
      assert(res.headers['content-type'].indexOf('application/json') >= 0);
      var newPoll = res.body;
      assert.equal(newPoll.title, poll.title);
      assert.isUndefined(newPoll.strict);
      assert.isDefined(newPoll.comments);
      assert.equal(newPoll.comments.length, 0);
      assert.equal(newPoll.options.length, poll.options.length);
      for (var i = 0; i < poll.options.length; ++i) {
        assert.equal(newPoll.options[i], poll.options[i]);
        assert.equal(newPoll.votes[i], 0);
      }
    });

    it('returns an error when key is incorrect', function *() {
      poll.secret = true;
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      var parts = location.split(':');
      assert.equal(parts.length, 2);
      res = yield client.get(parts[0] + ':x');
      assert.equal(res.statusCode, 404);
    });
  });

  describe('GET /polls/:id/options', function() {
    it('returns 404 when poll does not exist', function *() {
      var res = yield client.get('polls/123456789/options');
      assert.equal(res.statusCode, 404);
    });

    it('returns an error when ID is invalid', function *() {
      var res = yield client.get('polls/b42@/options');
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('returns the poll options', function *() {
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      res = yield client.get(location + '/options');
      assert.equal(res.statusCode, 200);
      assert(res.headers['content-type'].indexOf('application/json') >= 0);
      var created = res.body;
      assert.equal(created.title, poll.title);
      assert.deepEqual(created.options, poll.options);
    });

    it('returns the secret poll options', function *() {
      poll.secret = true;
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      res = yield client.get(location + '/options');
      assert.equal(res.statusCode, 200);
      assert(res.headers['content-type'].indexOf('application/json') >= 0);
      var created = res.body;
      assert.equal(created.title, poll.title);
      assert.deepEqual(created.options, poll.options);
    });

    it('returns an error when key is incorrect', function *() {
      poll.secret = true;
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      var parts = location.split(':');
      assert.equal(parts.length, 2);
      res = yield client.get(parts[0] + ':x/options');
      assert.equal(res.statusCode, 404);
    });
  });

  describe('PATCH /polls/:id', function() {
    var votes = { votes: [0] };

    it('returns 404 when poll does not exist', function *() {
      var res = yield client.patch('polls/123456789', votes);
      assert.equal(res.statusCode, 404);
    });

    it('returns an error when ID is invalid', function *() {
      var res = yield client.patch('polls/b42@', votes);
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('requires a votes value', function *() {
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      res = yield client.patch(location, { });
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('requires an integer votes value', function *() {
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      res = yield client.patch(location, { votes: 'asdf' });
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
      res = yield client.patch(location, { votes: ['asdf'] });
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('requires non-empty votes value', function *() {
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      res = yield client.patch(location, { votes: [] });
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('requires a positive integer vote value', function *() {
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      res = yield client.patch(location, { votes: [-1] });
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('requires a vote value in range', function *() {
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      res = yield client.patch(location, { votes: [poll.options.length] });
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('successfully increments the vote count', function *() {
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      res = yield client.patch(location, votes);
      assert.equal(res.statusCode, 200);
      assert.isDefined(res.body.path);
      assert.isDefined(res.body.path.web);
      res = yield client.get(location);
      assert.equal(res.statusCode, 200);
      var votedPoll = res.body;
      assert.equal(votedPoll.votes[0], 1);
      assert.equal(votedPoll.votes[1], 0);
      assert.equal(votedPoll.votes[2], 0);
    });

    it('successfully increments the vote count on a secret poll', function *() {
      poll.secret = true;
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      res = yield client.patch(location, votes);
      assert.equal(res.statusCode, 200);
      assert.isDefined(res.body.path);
      assert.isDefined(res.body.path.web);
      res = yield client.get(location);
      assert.equal(res.statusCode, 200);
      var votedPoll = res.body;
      assert.equal(votedPoll.votes[0], 1);
      assert.equal(votedPoll.votes[1], 0);
      assert.equal(votedPoll.votes[2], 0);
    });

    it('returns an error when voting multiple times on a strict poll', function *() {
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      res = yield client.patch(location, votes);
      assert.equal(res.statusCode, 200);
      res = yield client.patch(location, votes);
      assert.equal(res.statusCode, 400);
    });

    it('allows voting multiple times on a non-strict poll', function *() {
      poll.strict = false;
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      res = yield client.patch(location, votes);
      assert.equal(res.statusCode, 200);
      res = yield client.patch(location, votes);
      assert.equal(res.statusCode, 200);
      res = yield client.get(location);
      assert.equal(res.statusCode, 200);
      var votedPoll = res.body;
      assert.equal(res.statusCode, 200, votedPoll);
      assert.equal(votedPoll.votes[0], 2);
      assert.equal(votedPoll.votes[1], 0);
      assert.equal(votedPoll.votes[2], 0);
    });

    it('returns an error when key is incorrect', function *() {
      poll.secret = true;
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      var parts = location.split(':');
      assert.equal(parts.length, 2);
      res = yield client.patch(parts[0] + ':x', votes);
      assert.equal(res.statusCode, 404);
    });

    it('returns an error when vote count exceeds max choices', function *() {
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      res = yield client.patch(location, { votes: [0, 1] });
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('successfully increments the vote count with multiple choices', function *() {
      poll.choices = poll.options.length;
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      var votes = [];
      for (var i = 0; i < poll.options.length; ++i) {
        votes.push(i);
      }
      res = yield client.patch(location, { votes: votes });
      assert.equal(res.statusCode, 200);
      assert.isDefined(res.body.path);
      assert.isDefined(res.body.path.web);
      res = yield client.get(location);
      assert.equal(res.statusCode, 200);
      var votedPoll = res.body;
      assert.equal(votedPoll.votes[0], 1);
      assert.equal(votedPoll.votes[1], 1);
      assert.equal(votedPoll.votes[2], 1);
    });
  });

  describe('POST /polls/:id/comment', function() {
    var comment = { comment: 'Comment' };

    it('returns 404 when poll does not exist', function *() {
      var res = yield client.post('polls/123456789/comments', comment);
      assert.equal(res.statusCode, 404);
    });

    it('returns an error when ID is invalid', function *() {
      var res = yield client.post('polls/b42@/comments', comment);
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('requires a comment', function *() {
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      res = yield client.post(location + '/comments', { });
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('requires a non-empty comment', function *() {
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      res = yield client.post(location + '/comments', { comment: '' });
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('requires a comment less than 140 characters', function *() {
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      var comment = { comment: 'x' };
      for (var i = 0; i < 140; ++i) {
        comment.comment += 'x';
      }
      res = yield client.post(location + '/comments', comment);
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('creates a comment', function *() {
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      res = yield client.post(location + '/comments', comment);
      assert.equal(res.statusCode, 200);
      res = yield client.get(location);
      var newPoll = res.body;
      assert.isDefined(newPoll.comments);
      assert.equal(newPoll.comments.length, 1);
      assert.equal(newPoll.comments[0].text, comment.comment);
      assert(newPoll.comments[0].time > 0);
    });

    it('creates a comment on a secret poll', function *() {
      poll.secret = true;
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      res = yield client.post(location + '/comments', comment);
      assert.equal(res.statusCode, 200);
      res = yield client.get(location);
      var newPoll = res.body;
      assert.isDefined(newPoll.comments);
      assert.equal(newPoll.comments.length, 1);
      assert.equal(newPoll.comments[0].text, comment.comment);
      assert(newPoll.comments[0].time > 0);
    });

    it('returns an error when commenting multiple times on a strict poll', function *() {
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      res = yield client.post(location + '/comments', comment);
      assert.equal(res.statusCode, 200);
      res = yield client.post(location + '/comments', comment);
      assert.equal(res.statusCode, 400);
      assert.isDefined(res.body.error);
    });

    it('allows commenting multiple times on a non-strict poll', function *() {
      poll.strict = false;
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      res = yield client.post(location + '/comments', { comment: 'Zero' });
      assert.equal(res.statusCode, 200);
      res = yield client.post(location + '/comments', { comment: 'One' });
      assert.equal(res.statusCode, 200);
      res = yield client.get(location);
      var newPoll = res.body;
      assert.isDefined(newPoll.comments);
      assert.equal(newPoll.comments.length, 2);
      assert.equal(newPoll.comments[0].text, 'Zero');
      assert(newPoll.comments[0].time > 0);
      assert.equal(newPoll.comments[1].text, 'One');
      assert(newPoll.comments[1].time > 0);
    });

    it('returns an error when key is incorrect', function *() {
      poll.secret = true;
      var res = yield client.post('polls', poll);
      assert.equal(res.statusCode, 201);
      var location = res.headers.location;
      var parts = location.split(':');
      assert.equal(parts.length, 2);
      res = yield client.post(parts[0] + ':x/comments', comment);
      assert.equal(res.statusCode, 404);
    });
  });
});
