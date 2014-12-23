var co = require('co');
var Promise = require('bluebird');
var crypto = Promise.promisifyAll(require('crypto'));

function createKey() {
  return new Promise(function(resolve, reject) {
    co.wrap(function *() {
      var bytes = yield crypto.randomBytesAsync(33);
      var key = bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
      resolve(key);
    })();
  });
}

module.exports = {
  createKey: createKey
};
