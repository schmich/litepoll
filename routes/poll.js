var Poll = require('../lib/poll');

exports.create = function(req, res) {
  res.render('create');
};

exports.show = function(req, res) {
  return Poll.findEncoded(req.params.id).then(function(poll) {
    res.render('vote', { id: req.params.id });
  });
};

exports.results = function(req, res) {
  return Poll.findEncoded(req.params.id).then(function(poll) {
    res.render('results', { id: req.params.id });
  });
};

exports.share = function(req, res) {
  return Poll.findEncoded(req.params.id).then(function(poll) {
    res.render('share', { id: req.params.id });
  });
};
