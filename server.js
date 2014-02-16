var express = require('express');
var poll = require('./routes/poll');
var http = require('http');
var path = require('path');
var ect = require('ect');
var subdomains = require('express-subdomains');
var streaming = require('./streaming');

var app = express();

subdomains.use('api');

// All environments.
app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ect');
app.use(express.favicon(__dirname + '/public/images/favicon.ico'));
app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(subdomains.middleware);
app.use(app.router);
app.use('/assets', express.static(path.join(__dirname, 'public')));
app.engine('.ect', ect({ watch: app.get('env') == 'development', root: app.get('views') }).render);

// Development only.
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', poll.createForm);
app.post('/poll', poll.create);
app.get('/poll/:id', poll.showJson);
app.get('/poll/:id/options', poll.options);
app.put('/poll/:id', poll.vote);
app.get('/:id', poll.showHtml);
app.get('/:id/r', poll.results);
app.get('/:id/s', poll.share);

var server = http.createServer(app);
streaming.attach(server);

server.listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
