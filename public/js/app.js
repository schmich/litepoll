var app = angular.module('litepoll', [])

function ServerEvents(url) {
  var source = new EventSource(url);

  this.on = function(event, callback) {
    source.addEventListener(event, function(e) {
      callback(JSON.parse(e.data), e); 
    });
  };
}

app.config(['$compileProvider', '$httpProvider', function($compileProvider, $httpProvider) {
  $compileProvider.aHrefSanitizationWhitelist(/^\s*(http|https|sms|mailto).*/);
  $httpProvider.defaults.headers.patch = {
    'Content-Type': 'application/json;charset=utf-8'
  };
}]);

app.controller('PollCreateCtrl', function($scope, $http) {
  $scope.modified = [];

  $scope.poll = {
    title: '',
    options: ['', '', '', ''],
    lax: false,
    secret: false,
    multi: false
  };

  $scope.showAdvanced = false;
  $scope.toggleAdvanced = function() {
    $scope.showAdvanced = !$scope.showAdvanced;
  };

  function maybeAddOption(index) {
    var count = $scope.poll.options.length;
    if ((count < 32) && (index == count - 1)) {
      $scope.poll.options.push('');
    }
  }

  $scope.change = function(ev, index) {
    maybeAddOption(index);
  }

  $scope.keydown = function(ev, index) {
    /* Ignore: backspace, tab, shift, ctrl, alt, caps, meta, arrows */
    if ([8, 9, 16, 17, 18, 20, 91, 92, 93, 37, 38, 39, 40].indexOf(ev.keyCode) >= 0) {
      return;
    }

    maybeAddOption(index);
  };

  $scope.createPoll = function() {
    var poll = pollFromForm($scope.poll);
    $http.post('/polls', poll)
      .success(function(res) {
        window.location.pathname = res.path.web;
      })
      .error(function() {
        alert('You must specify a title and at least two options.');
        $scope.showAdvanced = false;
      });
  };

  function pollFromForm(poll) {
    var poll = angular.copy($scope.poll);
    poll.options = [];
    poll.strict = !poll.lax;
    delete poll.lax;

    for (var i = 0; i < $scope.poll.options.length; ++i) {
      var option = $scope.poll.options[i];
      if (option && option.trim()) {
        poll.options.push(option);
      }
    }

    poll.choices = poll.multi ? poll.options.length : 1;
    delete poll.multi;

    return poll;
  }
});

app.controller('PollVoteCtrl', function($scope, $http, $element, localStorageService) {
  var pollId = $element[0].dataset.pollId;

  $scope.poll = null;

  $scope.oneVote = null;
  $scope.multiVote = [];
  $scope.votes = [];

  var votesKey = 'votes:' + pollId;
  $scope.currentVotes = localStorageService.get(votesKey);

  $scope.$watch('oneVote', function(vote) {
    if (vote != null) {
      $scope.votes = [+vote];
    }
  });

  $scope.$watch('multiVote', function(votes) {
    $scope.votes = [];
    for (var index in votes) {
      if (votes[index]) {
        $scope.votes.push(+index);
      }
    }
  }, true);

  $scope.submitVotes = function() {
    $http({ method: 'PATCH', url: '/polls/' + pollId, data: { votes: $scope.votes } })
      .success(function(res) {
        localStorageService.set(votesKey, $scope.votes);
        window.location.pathname = res.path.web;
      })
      .error(function(data) {
        alert(data.error);
      });
  };

  $http.get('/polls/' + pollId + '/options')
    .success(function(res) {
      $scope.poll = res;
    })
    .error(function() {
    });
});

app.controller('CopyCtrl', function($scope) {
  $scope.copied = false;
  $scope.canCopy = false;

  ZeroClipboard.config({ moviePath: "/assets/js/ZeroClipboard.swf" });
  var client = new ZeroClipboard(document.getElementById("copy-link"));

  client.on("load", function(client) {
    $scope.$apply(function() {
      $scope.canCopy = true;
    });
    client.on("complete", function() {
      $scope.$apply(function() {
        $scope.copied = true;
      });
    });
  });
});

app.controller('PollShareCtrl', function($scope, $http, $element) {
  var pollId = $element[0].dataset.pollId;

  $scope.link = window.location.protocol + '//' + window.location.host + '/' + pollId;
  $scope.shortLink = window.location.host + '/' + pollId;

  $http.get('/polls/' + pollId + '/options')
    .success(function(poll) {
      var u = encodeURIComponent;

      var twitterText = "Vote in my poll: " + poll.title;
      $scope.twitterLink = "https://twitter.com/intent/tweet?text=" + u(twitterText) + "&url=" + u($scope.link);

      var facebookTitle = poll.title;
      var facebookSummary = "Vote in my poll now!";
      $scope.facebookLink = "https://www.facebook.com/sharer.php?s=100&p%5Burl%5D=" + u($scope.link)
        + "&p%5Btitle%5D=" + u(facebookTitle)
        + "&p%5Bsummary%5D=" + u(facebookSummary);

      var redditTitle = "Vote in my poll: " + poll.title;
      $scope.redditLink = "http://www.reddit.com/submit?title=" + u(redditTitle) + "&url=" + u($scope.link);

      var smsBody = "Vote in my poll: " + poll.title + " " + $scope.link;
      $scope.smsLink = "sms:?body=" + u(smsBody);

      var emailSubject = poll.title;
      var emailBody = "Vote in my poll now at " + $scope.link;
      $scope.emailLink = "mailto:?subject=" + u(emailSubject) + "&body=" + u(emailBody);
    })
    .error(function(data) {
    });
});

app.controller('PollResultCtrl', function($scope, $http, $element) {
  $scope.poll = null;
  $scope.totalVotes = null;

  $scope.showComments = function() {
    document.getElementById('comment').focus();
  };

  $scope.$watch('poll.options', function(options) {
    var total = 0;
    angular.forEach(options, function(option) {
      total += option[1];
    });

    $scope.totalVotes = total;
  }, true);

  var pollId = $element[0].dataset.pollId;
  $http.get('/polls/' + pollId)
    .success(function(data) {
      $scope.poll = data;
    })
    .error(function(data) {
    });

  $scope.votes = function(item) {
   return -item[1];
  };
    
  var client = new ServerEvents('/polls/' + pollId + '/events');

  client.on('comment', function(comment) {
    if (!$scope.poll) {
      return;
    }

    $scope.$apply(function() {
      $scope.poll.comments.push(comment);
    });
  });

  client.on('vote', function(votes) {
    if (!$scope.poll) {
      return;
    }

    $scope.$apply(function() {
      var options = $scope.poll.options;
      for (var i = 0; i < options.length; ++i) {
        options[i][1] = votes[i];
      }
    });
  });
});

app.controller('PollCommentCtrl', function($scope, $http, localStorageService) {
  var commentKey = null;
  $scope.hasCommented = false;

  $scope.$watch('poll', function(poll) {
    if (!poll) {
      return;
    }

    commentKey = 'comment:' + poll.id;
    $scope.hasCommented = localStorageService.get(commentKey);
  });

  $scope.addComment = function() {
    var params = { comment: $scope.comment };

    $http.post('/polls/' + $scope.poll.id + '/comments', params)
      .success(function() {
        localStorageService.set(commentKey, true);
        $scope.hasCommented = true;
        $scope.comment = '';
      })
      .error(function(res) {
        alert(res.error);
      });
  };
});

app.filter('reverse', function() {
  return function(items) {
    if (!items) {
      return items;
    }

    return items.slice().reverse();
  };
});

app.filter('plural', function() {
  return function(input, word) {
    if (input == 0) {
      return 'no ' + word + 's';
    } else if (input == 1) {
      return '1 ' + word;
    } else {
      return input + ' ' + word + 's';
    }
  };
});

app.filter('percent', function() {
  return function(input, precision) {
    if (isNaN(input) || input == 0) {
      return '0%';
    } else {
      return (input * 100).toFixed(precision) + '%';
    }
  };
});

app.filter('titleCase', function() {
  return function(input) {
    if (!input)
      return input;

    return input[0].toUpperCase() + input.substr(1);
  };
});

app.factory('localStorageService', function() {
  function supported() {
    var test = "test";
    try {
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  }

  if (supported) {
    return {
      set: function(key, value) {
        localStorage.setItem(key, value);
      },
      get: function(key) {
        return localStorage.getItem(key);
      }
    }
  } else {
    return {
      set: function(key, value) { },
      get: function(key) {
        return null;
      }
    }
  }
});

app.directive('stopEvent', function() {
  return {
    restrict: 'A',
    link: function (scope, element, attr) {
      element.bind(attr.stopEvent, function (e) {
        e.stopPropagation();
        e.preventDefault();
      });
    }
  };
});

app.directive('ngEnterTab', function() {
  return {
    restrict: 'A',
    link: function(scope, elem, attr) {
      elem.on('keydown', function(e) {
        if (e.keyCode != 13 /* Enter */) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        var reverse = e.shiftKey;

        var inputs = document.querySelectorAll('input');
        for (var i = 0; i < inputs.length; ++i) {
          var input = inputs[i];
          if (input == e.srcElement) {
            if (reverse && (i > 0)) {
              inputs[i - 1].focus();
            } else if (!reverse && (i < (inputs.length - 1))) {
              inputs[i + 1].focus();
            }
            break;
          }
        }
      });
    }
  };
});
