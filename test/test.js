process.env.NODE_ENV = 'test';

var settings = require('../lib/settings')({
  mongo: 'mongodb://localhost/litepoll_test',
  redis: 'redis://localhost/1'
});

var Poll = require('../lib/poll');
var assert = require('assert');
var request = require('request-json');
var client = request.newClient('http://localhost:3000/');

require('../server');

describe('Poll', function() {
  before(function() {
    Poll.remove({}, function(err) {
      if (err) {
        throw err;
      }
    });
  });

  describe('create', function() {
    it('creates a poll', function(done) {
      Poll.create({
        title: 'Best color?',
        opts: ['Red', 'Green', 'Blue'],
        votes: [0, 0, 0],
        strict: true,
        creator: '127.0.0.1'
      }).then(function(poll) {
        assert.notEqual(poll, null);
        done();
      });
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
      client.post('polls',  poll, function(err, response) {
        assert.equal(400, response.statusCode);
        done();
      });
    });

    it('requires a non-empty title', function(done) {
      poll.title = '';
      client.post('polls',  poll, function(err, response) {
        assert.equal(400, response.statusCode);
        done();
      });
    });

    it('requires an option value', function(done) {
      delete poll.options;
      client.post('polls',  poll, function(err, response) {
        assert.equal(400, response.statusCode);
        done();
      });
    });

    it('requires at least two options', function(done) {
      poll.options = ['Red'];
      client.post('polls',  poll, function(err, response) {
        assert.equal(400, response.statusCode);
        done();
      });
    });

    it('requires non-empty options', function(done) {
      poll.options = ['Red', 'Green', ''];
      client.post('polls',  poll, function(err, response) {
        assert.equal(400, response.statusCode);
        done();
      });
    });

    it('requires a strict value', function(done) {
      delete poll.strict;
      client.post('polls',  poll, function(err, response) {
        assert.equal(400, response.statusCode);
        done();
      });
    });

    it('successfully creates a poll', function(done) {
      client.post('polls', poll, function(err, response) {
        assert.equal(201, response.statusCode);
        done();
      });
    });
  });
});
