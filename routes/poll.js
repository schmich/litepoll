exports.create = function(req, res) {
  res.render('create');
};

// TODO: Handle 404 for invalid poll ID
exports.show = function(req, res) {
  res.render('vote', { id: req.params.id });
};

// TODO: Handle 404 for invalid poll ID
exports.results = function(req, res) {
  res.render('results', { id: req.params.id });
};

// TODO: Handle 404 for invalid poll ID
exports.share = function(req, res) {
  res.render('share', { id: req.params.id });
};
