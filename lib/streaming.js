var faye = require('faye');
var streaming = new faye.NodeAdapter({ mount: '/stream', timeout: 45 });

module.exports = streaming;
