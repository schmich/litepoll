var Poll = require('../lib/poll');

exports.create = function(req, res) {
  res.render('create');
};

exports.show = function *(req, res) {
  var poll = yield Poll.find(req.params.id);
  res.render('vote', { id: req.params.id });
};

exports.results = function *(req, res) {
  var poll = yield Poll.find(req.params.id);
  res.render('results', { id: req.params.id });
};

exports.share = function *(req, res) {
  var poll = yield Poll.find(req.params.id);
  res.render('share', { id: req.params.id });
};
