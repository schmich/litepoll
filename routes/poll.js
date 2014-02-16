var Poll = require('../poll');
var redis = require('../redis');
var streaming = require('../streaming');
var underscore = require('underscore');

function pollNotFound(res, pollId) {
  notFound(res, "Question '" + pollId + "' does not exist.");
}

function notFound(res, message) {
  error(res, message, 404);
}

function error(res, message, code) {
  res.send(code || 400, { error: message });
}

exports.createForm = function(req, res) {
  res.render('create');
};

exports.create = function(req, res) {
  var title = req.body.title;

  if (!title || !title.trim()) {
    return error(res, "A non-empty 'title' is required.");
  }

  if (title.length > 256) {
    return error(res, "'title' length must not exceed 256 characters.")
  }

  var options = req.body.options;
  if (!options || !options.length) {
    return error(res, "At least two non-empty 'options' are required.");
  }

  options.forEach(function(option) {
    if (!option && !option.trim()) {
      return error(res, "'options' must not be empty.");
    } else if (option.length > 256) {
      return error(res, "Option length must not exceed 256 characters.")
    }
  });

  if (options.length < 2) {
    return error(res, "At least two 'options' are required.");
  } else if (options.length > 32) {
    return error(res, "Number of options must not exceed 32.")
  }

  var votes = [];
  for (var i = 0; i < options.length; ++i) {
    votes.push(0);
  }

  var poll = new Poll({
    title: title,
    opts: options,
    votes: votes
  });

  poll.save(function() {
    // TODO: Check for errors.
    var id = poll._id;
    res.send(201, { path: { web: '/' + id, api: '/poll/' + id } });
  });
};

// TODO: Validate: must have vote.
// TODO: Check IPs
// PUT /:id
exports.vote = function(req, res) {
  var encodedId = req.params.id;
  if (!encodedId) {
    return error(res, "'id' is required.");
  }

  var id = parseInt(encodedId, 36);
  if (isNaN(id)) {
    return error(res, "'id' is invalid.");
  }

  var vote = req.body.vote;
  if (vote == null) {
    return error(res, "'vote' is required.");
  }

  var voteIndex = +vote;
  if (voteIndex != vote) {
    return error(res, "Integer 'vote' is required.");
  }

  if (voteIndex < 0) {
    return error(res, "'vote' must be in range.");
  }

  var update = { $inc: { } };
  update['$inc']['votes.' + voteIndex] = 1;

  Poll.update({ _id:  id }, update, {}, function(err, affected) {
    if (affected == 0) {
      return error(res, "'id' not found or 'vote' not in range.");
    } else {
      res.send({});
      streaming.getClient().publish('/poll/' + encodedId, { vote: voteIndex });
    }
  });
};

exports.showJson = function(req, res) {
  var encodedId = req.params.id;
  if (!encodedId) {
    return error(res, "'id' is required.");
  }

  var id = parseInt(encodedId, 36);
  if (isNaN(id)) {
    return error(res, "'id' is invalid.");
  }

  Poll.findOne({ _id: id }, function(err, poll) {
    if (err) {
      return pollNotFound(res, encodedId);
    } else {
      res.send({ title: poll.title, options: underscore.zip(poll.opts, poll.votes) });
    }
  });
};

// TODO: Handle 404 for invalid poll ID
exports.showHtml = function(req, res) {
  res.render('vote', { id: req.params.id });
};

// TODO: Handle 404 for invalid poll ID
exports.results = function(req, res) {
  res.render('results', { id: req.params.id });
};
