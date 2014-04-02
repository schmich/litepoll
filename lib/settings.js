var mongoose = require('mongoose');
var redis = require('redis');
var url = require('url');

function Settings(opts) {
  var parts = url.parse(opts.redis);
  var host = parts.hostname || 'localhost';
  var port = parts.port || 6379;
  var redisClient = redis.createClient(port, host);

  if (parts.pathname && parts.pathname.length > 1) {
    var db = parts.pathname.slice(1);
    redisClient.select(db);
  }

  return {
    mongo: mongoose.connect(opts.mongo).connection,
    redis: redisClient
  };
};

var settings = null;

module.exports = function(opts) {
  if (!settings) {
    settings = new Settings(opts);
  }

  return settings;
};