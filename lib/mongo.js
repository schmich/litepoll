var mongoose = require('mongoose');

mongoose.connect('mongodb://localhost/litepoll');

module.exports = mongoose.connection;
