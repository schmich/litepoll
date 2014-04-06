var express = require('express');
var api = require('./routes/api');
var poll = require('./routes/poll');
var pages = require('./routes/pages');
var http = require('http');
var path = require('path');
var ect = require('ect');
var co = require('co');
var streaming = require('./lib/streaming');
var NotFoundError = require('./lib/not-found');
var BadRequestError = require('./lib/bad-request');

var app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ect');
app.use(express.favicon(__dirname + '/public/img/favicon.ico'));
if (app.settings.env != 'test') {
  app.use(express.logger('dev'));
}
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

function handleErrors(handler) {
  return function(req, res) {
    co(handler)(req, res, function(err, _) {
      if (err) {
        if (err instanceof NotFoundError) {
          res.status(404);
          if (req.accepts('html', 'json') == 'html') {
            res.render('404');
          } else {
            res.send({ error: 'Not found.' });
          }
        } else if (err instanceof BadRequestError) {
          res.status(400);
          res.send({ error: err.message });
        } else if (err) {
          res.status(500);
          res.send({ error: 'Unexpected error.' });
        }
      }
    });
  }
}

app.get('/translate', pages.translate);
app.post('/polls', handleErrors(api.create));
app.get('/polls/:id', handleErrors(api.show));
app.get('/polls/:id/options', handleErrors(api.options));
app.patch('/polls/:id', handleErrors(api.vote));
app.get('/', poll.create);
app.get('/:id', handleErrors(poll.show));
app.get('/:id/r', handleErrors(poll.results));
app.get('/:id/s', handleErrors(poll.share));
app.use(function(req, res) {
  res.status(404);
  res.render('404');
});

var server = http.createServer(app);
streaming.attach(server);

module.exports = server;
