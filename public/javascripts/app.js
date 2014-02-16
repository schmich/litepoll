var app = angular.module('litepoll', ['ngCookies']);

app.config(['$compileProvider', function($compileProvider) {
  $compileProvider.aHrefSanitizationWhitelist(/^\s*(http|https|sms|mailto).*/);
}]);

app.controller('PollCreateCtrl', function($scope, $http) {
  $scope.modified = [];

  $scope.poll = {
    title: '',
    options: ['', '', '', '']
  };

  $scope.keydown = function(ev, index) {
    /* Ignore: tab, shift, ctrl, alt, caps, meta, meta */
    if ([9, 16, 17, 18, 20, 91, 92].indexOf(ev.keyCode) >= 0) {
      return;
    }

    var count = $scope.poll.options.length;
    if ((count < 32) && (index == count - 1)) {
      $scope.poll.options.push('');
    }
  };

  $scope.createPoll = function() {
    var poll = angular.copy($scope.poll);
    poll.options = [];

    for (var i = 0; i < $scope.poll.options.length; ++i) {
      var option = $scope.poll.options[i];
      if (option && option.trim()) {
        poll.options.push(option);
      }
    }

    $http.post('/poll', poll)
      .success(function(data) {
        window.location.pathname = data.path.web;
      })
      .error(function(data) {
      });
  };
});

app.controller('PollVoteCtrl', function($scope, $http, $element, $cookieStore) {
  var pollId = $element[0].dataset.pollId;

  $scope.poll = null;
  $scope.vote = null;

  var voteKey = 'vote/' + pollId;
  $scope.currentVote = $cookieStore.get(voteKey);

  $scope.submitVote = function() {
    $http.put('/poll/' + pollId, { vote: +$scope.vote })
      .success(function(data) {
        $cookieStore.put(voteKey, +$scope.vote);
        // TODO: Pull from response JSON.
        window.location.pathname = '/' + pollId + '/r';
      })
      .error(function(data) {
      });
  };

  $http.get('/poll/' + pollId + '/options')
    .success(function(data) {
      $scope.poll = data;
    })
    .error(function(data) {
    });
});

app.controller('PollShareCtrl', function($scope, $http, $element) {
  var pollId = $element[0].dataset.pollId;

  $scope.link = window.location.protocol + '//' + window.location.host + '/' + pollId;

  $http.get('/poll/' + pollId + '/options')
    .success(function(poll) {
      var u = encodeURIComponent;

      var twitterText = "Vote in my poll: " + poll.title;
      $scope.twitterLink = "https://twitter.com/intent/tweet?text=" + u(twitterText) + "&url=" + u($scope.link);

      // TODO: Add the following to the page to fix FB sharing:
      // <meta property="og:title" content="http://litepoll.com/2ez" />
      // <meta property="og:description" content="poll.title" />
      // <meta property="og:site_name" content="Litepoll">
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

  $scope.$watch('poll.options', function(options) {
    var total = 0;
    angular.forEach(options, function(option) {
      total += option[1];
    });

    $scope.totalVotes = total;
  }, true);

  var pollId = $element[0].dataset.pollId;
  $http.get('/poll/' + pollId)
    .success(function(data) {
      $scope.poll = data;
    })
    .error(function(data) {
    });

  $scope.votes = function(item) {
   return -item[1];
  }
    
  var client = new Faye.Client('/stream');
  var subscription = client.subscribe('/poll/' + pollId, function(votes) {
    if ($scope.poll == null)
      return;

    $scope.$apply(function() {
      var options = $scope.poll.options;
      for (var i = 0; i < options.length; ++i) {
        options[i][1] = votes[i];
      }
    });
  });
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

app.directive('ngEnterTab', function($parse) {
  return {
    restrict: 'A',
    link: function(scope, elem, attr) {
      elem.on('keydown', function(e) {
        if (e.keyCode == 13 /* Enter */) {
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
        }
      });
    }
  };
});
