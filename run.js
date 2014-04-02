var settings = require('./lib/settings')({
  mongo: 'mongodb://localhost/litepoll',
  redis: 'redis://localhost/0'
});

var server = require('./server');

var port = process.env.PORT || 3000;
server.listen(port, function() {
  console.log('Express server listening on port ' + port);
});
