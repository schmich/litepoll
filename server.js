var express = require('express');
var api = require('./routes/api');
var poll = require('./routes/poll');
var pages = require('./routes/pages');
var http = require('http');
var path = require('path');
var ect = require('ect');
var co = require('co');
var sse = require('./lib/sse');
var favicon = require('serve-favicon');
var bodyParser = require('body-parser');
var morgan = require('morgan');
var errorHandler = require('errorhandler');
var NotFoundError = require('./lib/not-found');
var BadRequestError = require('./lib/bad-request');

var app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ect');
app.use(favicon(__dirname + '/public/img/favicon.ico'));
if (app.settings.env != 'test') {
  app.use(morgan('dev'));
}
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/assets', express.static(path.join(__dirname, 'public')));
app.engine('.ect', ect({ watch: app.get('env') == 'development', root: app.get('views') }).render);

// Enable trust proxy in order to get the forwarded request IP from NGINX.
app.enable('trust proxy');

console.log('Mode: ' + app.settings.env);
if (app.settings.env == 'development') {
  app.use(errorHandler());
}

function handleErrors(handler) {
  return function(req, res) {
    var handle = co.wrap(handler);
    handle(req, res)
      .then(function() {
        // Do nothing.
      }, function(err) {
        if (err) {
          if (err instanceof NotFoundError) {
            code = 404;
            error = 'Not found.';
          } else if (err instanceof BadRequestError) {
            code = 400;
            error = err.message;
          } else {
        console.log(err);
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

var router = express.Router();

router.get('/translate', pages.translate);
router.post('/polls', handleErrors(api.create));
router.get('/polls/:id', handleErrors(api.show));
router.get('/polls/:id/options', handleErrors(api.options));
router.patch('/polls/:id', handleErrors(api.vote));
router.post('/polls/:id/comments', handleErrors(api.comment));
router.get('/polls/:id/events', handleErrors(api.events));
router.patch('/polls/:pollId/comments/:commentIndex', handleErrors(api.voteComment));
router.get('/', poll.create);
router.get('/:id', handleErrors(poll.show));
router.get('/:id/r', handleErrors(poll.results));
router.get('/:id/s', handleErrors(poll.share));
router.use(function(req, res) {
  res.status(404);
  res.render('404');
});

app.use('/', router);

var server = http.createServer(app);

module.exports = server;
