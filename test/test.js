process.env.NODE_ENV = 'test';

var settings = require('../lib/settings').configure({
  mongo: 'mongodb://localhost/litepoll_test',
  redis: 'redis://localhost/1'
});
var Promise = require('bluebird');
var Poll = require('../lib/poll');
var assert = require('chai').assert;
var request = require('request-json');
var server = require('../server');
var port = process.env.PORT || 3001;
var client = request.newClient('http://localhost:' + port);
var co = require('co');
var mongodb = require('mongodb');
var MongoClient = Promise.promisifyAll(mongodb.MongoClient);
Promise.promisifyAll(mongodb.Db.prototype);

server.listen(port, function() { });

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
  describe('#create', function() {
    it('creates a poll', function *() {
      var poll = yield Poll.create({
        title: 'Best color?',
        opts: ['Red', 'Green', 'Blue'],
        votes: [0, 0, 0],
        strict: true,
        creator: '127.0.0.1'
      });

      assert.isNotNull(poll);
    });
  });
});

describe('Server', function() {
  var poll = null;
  beforeEach(function() {
    poll = {
      title: 'Best color?',
      options: ['Red', 'Green', 'Blue'],
      strict: true
    };
  });

  describe('POST /polls', function() {
    it('requires a title value', function(done) {
      delete poll.title;
      client.post('polls',  poll, function(err, res, body) {
        assert.equal(res.statusCode, 400, body);
        done();
      });
    });

    it('requires a non-empty title', function(done) {
      poll.title = ' ';
      client.post('polls',  poll, function(err, res, body) {
        assert.equal(res.statusCode, 400, body);
        done();
      });
    });

    it('requires an option value', function(done) {
      delete poll.options;
      client.post('polls',  poll, function(err, res, body) {
        assert.equal(res.statusCode, 400, body);
        done();
      });
    });

    it('requires at least two options', function(done) {
      poll.options = ['Red'];
      client.post('polls',  poll, function(err, res, body) {
        assert.equal(res.statusCode, 400, body);
        done();
      });
    });

    it('requires non-empty options', function(done) {
      poll.options = ['Red', 'Green', ''];
      client.post('polls',  poll, function(err, res, body) {
        assert.equal(res.statusCode, 400, body);
        done();
      });
    });

    it('requires a strict value', function(done) {
      delete poll.strict;
      client.post('polls',  poll, function(err, res, body) {
        assert.equal(res.statusCode, 400, body);
        done();
      });
    });

    it('successfully creates a poll', function(done) {
      client.post('polls', poll, function(err, res, body) {
        assert.equal(res.statusCode, 201, body);
        assert.isDefined(res.headers.location);
        done();
      });
    });
  });

  describe('GET /polls/:id', function() {
    it('returns 404 when poll does not exist', function(done) {
      client.get('polls/123456789', function(err, res, body) {
        assert.equal(res.statusCode, 404, body);
        done();
      });
    });

    it('returns the poll', function(done) {
      client.post('polls', poll, function(err, res, body) {
        assert.equal(res.statusCode, 201, body);
        var location = res.headers.location;
        client.get(location, function(err, res, newPoll) {
          assert.equal(res.statusCode, 200, newPoll);
          assert(res.headers['content-type'].indexOf('application/json') >= 0);
          assert.equal(newPoll.title, poll.title);
          assert.isUndefined(newPoll.strict);
          assert.equal(newPoll.options.length, poll.options.length);
          done();
        });
      });
    });
  });

  describe('GET /polls/:id/options', function() {
    it('returns 404 when poll does not exist', function(done) {
      client.get('polls/123456789/options', function(err, res, body) {
        assert.equal(res.statusCode, 404, body);
        done();
      });
    });

    it('returns the poll options', function(done) {
      client.post('polls', poll, function(err, res, body) {
        assert.equal(res.statusCode, 201, body);
        var location = res.headers.location;
        client.get(location + '/options', function(err, res, created) {
          assert.equal(res.statusCode, 200, created);
          assert(res.headers['content-type'].indexOf('application/json') >= 0);
          assert.equal(created.title, poll.title);
          assert.deepEqual(created.options, poll.options);
          done();
        });
      });
    });
  });

  describe('PATCH /polls/:id', function() {
    var vote = { vote: 0 };

    it('returns 404 when poll does not exist', function(done) {
      client.patch('polls/123456789', vote, function(err, res, body) {
        assert.equal(res.statusCode, 404, body);
        done();
      });
    });

    it('successfully increments the vote count', function(done) {
      client.post('polls', poll, function(err, res, body) {
        assert.equal(res.statusCode, 201, body);
        var location = res.headers.location;
        client.patch(location, vote, function(err, res, body) {
          assert.equal(res.statusCode, 200, body);
          client.get(location, function(err, res, votedPoll) {
            assert.equal(votedPoll.options[0][1], 1);
            assert.equal(votedPoll.options[1][1], 0);
            assert.equal(votedPoll.options[2][1], 0);
            done();
          });
        });
      });
    });

    it('returns an error when voting multiple times on a strict poll', function(done) {
      client.post('polls', poll, function(err, res, body) {
        assert.equal(res.statusCode, 201, body);
        var location = res.headers.location;
        client.patch(location, vote, function(err, res, body) {
          assert.equal(res.statusCode, 200, body);
          client.patch(location, vote, function(err, res, body) {
            assert.equal(res.statusCode, 400, body);
            done();
          });
        });
      });
    });

    it('allows voting multiple times on a non-strict poll', function(done) {
      poll.strict = false;
      client.post('polls', poll, function(err, res, body) {
        assert.equal(res.statusCode, 201, body);
        var location = res.headers.location;
        client.patch(location, vote, function(err, res, body) {
          assert.equal(res.statusCode, 200, body);
          client.patch(location, vote, function(err, res, body) {
            assert.equal(res.statusCode, 200, body);
            client.get(location, function(err, res, votedPoll) {
              assert.equal(res.statusCode, 200, votedPoll);
              assert.equal(votedPoll.options[0][1], 2);
              assert.equal(votedPoll.options[1][1], 0);
              assert.equal(votedPoll.options[2][1], 0);
              done();
            });
          });
        });
      });
    });
  });
});
