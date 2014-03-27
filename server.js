var express = require('express');
var api = require('./routes/api');
var poll = require('./routes/poll');
var pages = require('./routes/pages');
var http = require('http');
var path = require('path');
var ect = require('ect');
var streaming = require('./lib/streaming');
var NotFoundError = require('./lib/not-found');

var app = express();

app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ect');
app.use(express.favicon(__dirname + '/public/img/favicon.ico'));
app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(app.router);
app.use('/assets', express.static(path.join(__dirname, 'public')));
app.engine('.ect', ect({ watch: app.get('env') == 'development', root: app.get('views') }).render);

// Enable trust proxy in order to get the forwarded request IP from NGINX.
app.enable('trust proxy');

app.configure('development', function() {
  console.log('Mode: development');
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function() {
  console.log('Mode: production');
  app.use(express.errorHandler()); 
});

function handleNotFound(handler) {
  return function(req, res) {
    handler(req, res).catch(function(e) {
      if (e instanceof NotFoundError) {
        res.status(404);
        res.render('404');
      }
    });
  };
}

app.get('/translate', pages.translate);
app.post('/polls', api.create);
app.get('/polls/:id', api.show);
app.get('/polls/:id/options', api.options);
app.put('/polls/:id', api.vote);
app.get('/', poll.create);
app.get('/:id', handleNotFound(poll.show));
app.get('/:id/r', handleNotFound(poll.results));
app.get('/:id/s', handleNotFound(poll.share));

var server = http.createServer(app);
streaming.attach(server);

server.listen(app.get('port'), function() {
  console.log('Express server listening on port ' + app.get('port'));
});
