var request = require('co-request');
var url = require('url');
var co = require('co');
var Promise = require('bluebird');
var colors = require('colors');

function rand(low, high) {
  return Math.floor(Math.random() * (high - low + 1) + low);
}

function sleep(ms) {
  return new Promise(function(resolve, reject) {
    setTimeout(function() { resolve(); }, ms);
  });
}

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

function log(msg) {
  console.log('[bot] '.grey + msg);
}

co(function *() {
  var client = new Client('http://localhost:3000/');
  var max = process.env.max;
  var id = process.env.poll;
  log('Automating votes for poll (' + id + ').');

  log('Getting poll info.');
  var res = yield client.get('/polls/' + id);
  var poll = res.body;

  log('Poll:');
  console.log(poll);

  var count = poll.options.length;
  log('Found ' + count + ' options.');
  log('Voting up to ' + max + ' times.');

  for (var i = 0; i < max; ++i) {
    yield sleep(rand(100, 1000));

    var vote = rand(0, count - 1);
    log('Voting for (' + vote + ') ' + poll.options[vote][0] + '.');
    var res = yield client.patch('/polls/' + id, { votes: [vote] });
  }
})();
