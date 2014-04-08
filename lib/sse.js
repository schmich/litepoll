function Broker() {
  var id = 0;

  this.subscribers = {};

  this.publish = function(channel, event, data) {
    var subs = this.subscribers[channel];
    if (subs) {
      for (var id in subs) {
        subs[id](event, data);
      }
    }
  };

  this.subscribe = function(channel, callback) {
    if (!this.subscribers[channel]) {
      this.subscribers[channel] = {};
    }

    this.subscribers[channel][id] = callback;

    return id++;
  };

  this.unsubscribe = function(id, channel) {
    var subs = this.subscribers[channel];
    if (subs) {
      delete subs[id];
    }
  };
}

var broker = new Broker();

function stream(req, res, channel) {
  req.socket.setTimeout(Infinity);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'max-age=0, no-cache, no-store, must-revalidate',
    'Connection': 'keep-alive'
  });

  res.write('\n');

  var id = broker.subscribe(channel, function(event, data) {
    var payload = JSON.stringify(data);
    payload = 'data: ' + payload.split('\n').join('\ndata: ');

    res.write('event: ' + event + '\n');
    res.write(payload + '\n\n');
  });

  req.socket.on('close', function() {
    if (id != null) {
      broker.unsubscribe(id, channel);
      id = null;
    }
  });
}

function publish(channel, event, data) {
  broker.publish(channel, event, data);
}

module.exports = {
  stream: stream,
  publish: publish
};
