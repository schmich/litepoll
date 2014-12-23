var express = require('express');
var api = require('./routes/api');
var poll = require('./routes/poll');
var pages = require('./routes/pages');
var http = require('http');
var path = require('path');
var ect = require('ect');
var co = require('co');
var sse = require('./lib/sse');
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
app.use(app.router);
app.use('/assets', express.static(path.join(__dirname, 'public')));
app.engine('.ect', ect({ watch: app.get('env') == 'development', root: app.get('views') }).render);

// Enable trust proxy in order to get the forwarded request IP from NGINX.
app.enable('trust proxy');

console.log('Mode: ' + app.settings.env);
if (app.settings.env == 'development') {
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
} else if (app.settings.env == 'production') {
  app.use(express.errorHandler()); 
}

function handleErrors(handler) {
  return function(req, res) {
    co(handler)(req, res, function(err, _) {
      if (err) {
        if (err instanceof NotFoundError) {
          code = 404;
          error = 'Not found.';
        } else if (err instanceof BadRequestError) {
          code = 400;
          error = err.message;
        } else {
          code = 500;
          error = 'Unexpected error.';
        }

        res.status(code);
        if (req.accepts('html', 'json') == 'html') {
          res.render(code.toString());
        } else {
          res.send({ error: error });
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
app.post('/polls/:id/comments', handleErrors(api.comment));
app.get('/polls/:id/events', handleErrors(api.events));
app.patch('/polls/:pollId/comments/:commentIndex', handleErrors(api.voteComment));
app.get('/', poll.create);
app.get('/:id', handleErrors(poll.show));
app.get('/:id/r', handleErrors(poll.results));
app.get('/:id/s', handleErrors(poll.share));
app.use(function(req, res) {
  res.status(404);
  res.render('404');
});

var server = http.createServer(app);

module.exports = server;
