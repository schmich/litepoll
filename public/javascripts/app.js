var $app = angular.module('poll', []);

$app.controller('PollCreateCtrl', function($scope, $http) {
  $scope.modified = [];

  $scope.poll = {
    title: '',
    options: ['', '', '', '']
  };

  $scope.dirtied = function(index) {
    if (index == $scope.poll.options.length - 1) {
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

$app.controller('PollVoteCtrl', function($scope, $http, $element) {
  $scope.poll = null;
  $scope.vote = null;

  var pollId = $element[0].dataset.pollId;

  $scope.submitVote = function() {
    $http.put('/poll/' + pollId, { vote: $scope.vote })
      .success(function(data) {
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

$app.controller('PollResultCtrl', function($scope, $http, $element) {
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
  var subscription = client.subscribe('/poll/' + pollId, function(message) {
    if ($scope.poll == null)
      return;

    var voteIndex = message.vote;
    if (voteIndex != null && voteIndex >= 0 && voteIndex < $scope.poll.options.length) {
      $scope.$apply(function() {
        $scope.poll.options[voteIndex][1]++;
      });
    }
  });
});

$app.filter('plural', function() {
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

$app.filter('percent', function() {
  return function(input, precision) {
    if (isNaN(input) || input == 0) {
      return '0%';
    } else {
      return (input * 100).toFixed(precision) + '%';
    }
  };
});

$app.filter('titleCase', function() {
  return function(input) {
    if (!input)
      return input;

    return input[0].toUpperCase() + input.substr(1);
  };
});

$app.directive('ngEnterTab', function($parse) {
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

$app.directive('ngDirtied', function($parse) {
  return {
    restrict: 'A',
    link: function(scope, elem, attr) {
      var origValue = null;
      elem.on('focus', function() {
        if (origValue == null)
          origValue = elem.val();
      });

      elem.on('keyup', function() {
        if (elem.val() != origValue) {
          scope.$apply(function() {
            scope.$eval(attr.ngDirtied);
          });
        }
      });
    }
  };
});
