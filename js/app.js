/**
 * Main Angular app and setup.
 * 
 * This is built from lots of pieces, found in the documentsation and elsewhere, which 
 * are generally referenced in the @see lines. Since this is my first Angular app
 * and first Chrome app, I looked at several official sample apps. I found various
 * practices, so I am sure this structure could be improved.
 * 
 * Author: Charlie Gorichanaz (charlie@gorichanaz.com)
 */


/**
 * Set up Google Analytics
 *
 * @see https://github.com/GoogleChrome/chrome-platform-analytics/blob/master/src/example/javascript/main.js
 */
// Initialize the Analytics service object with the name of your app.
var GAService = analytics.getService('embedder');
// Get a Tracker using your Google Analytics app Tracking ID.
var tracker = GAService.getTracker('UA-71574627-2');
// Record an "appView" each time the user launches your app or goes to a new screen
tracker.sendEvent('app', 'loaded');


/**
 * Create the main Angular app
 */
var embedder = angular.module('embedder', [
  'ngRoute',
  'embedderControllers',
], function($provide) {
  /**
   * Prevent Angular from sniffing for the history API
   * since it's not supported in packaged apps.
   *
   * @see https://github.com/angular/angular.js/issues/11932#issuecomment-105035090
   */
  $provide.decorator('$window', function($delegate) {
    $delegate.history = null;
    return $delegate;
  });
});


/**
 * Create Angular directive so we can add "link" attributes to anchor
 * tags to allow linking between views, since the standard "href"
 * will not work in this packaged app due to URL differences.
 *
 * @example <a link="settings">Settings</a>
 */
embedder.directive("link", function ($location) {
  return function (scope, element, attrs) {
    element.bind("click", function () {
      scope.$apply($location.path(attrs.link));
    });
  };
});


/**
 * Declare some "global variables" using Angular syntax
 * @see https://docs.angularjs.org/guide/providers
 */
embedder.value('fs', null); // will point to filesystem later
embedder.service('picasa', [Picasa]); // instantiates the API service


/**
 * Logs to the console; used by writeFile()
 */
function onError(e) {
  console.log(e);
}

/**
 * Provides filesystem support
 * @see https://github.com/GoogleChrome/chrome-app-samples/blob/master/samples/gdrive/js/app.js
 * @param  {blob} blob Data to write to disk
 */
function writeFile(blob) {
  if (!embedder.fs) { return; }
  embedder.fs.root.getDirectory(embedder.name, {create: true}, function(dirEntry) {
    dirEntry.getFile(blob.name, {create: true, exclusive: false}, function(fileEntry) {
      // Create a FileWriter object for our FileEntry, and write out blob.
      fileEntry.createWriter(function(fileWriter) {
        fileWriter.onerror = onError;
        fileWriter.onwriteend = function(e) {
          console.log('Write completed.');
        };
        fileWriter.write(blob);
      }, onError);
    }, onError);
  }, onError);
}


/**
 * Mapping of URLs, views and controllers
 */
embedder.config([
  '$routeProvider',
  function($routeProvider) {
    $routeProvider.
    when('/albums', {
      templateUrl: 'partials/album-list.html',
      controller:  'albumListController'
    }).
    when('/albums/:data', {
      templateUrl: 'partials/photo-list.html',
      controller:  'photoListController'
    }).
    when('/settings', {
      templateUrl: 'partials/settings.html',
      controller:  'settingsController'
    }).
    otherwise({
      redirectTo:  '/settings'
    });
  }
]);


/**
 * Creates the service we will use to interact with the API with
 * underlying communication powered by the previously declared
 * API service just called "picasa". Perhaps these could be combined.
 */
embedder.factory('picasaService', ['picasa', '$http', function(picasa, $http){

  var factory = {}; // this ain't no sweatshop

  factory.state = {}; // used to save album state in controller

  /**
   * Gets photo information from the API and runs successCallback()
   * that is defined within each controller so it has access to the
   * proper $scope.
   * 
   * @param  {function} successCallback Handles data returned by the API
   * @param  {string} url Optional feed URL to get data from. If not
   * provided, the static album feed will be retrieved.
   * @param  {boolean} retry For $http.get() to signal that our access
   * probably needs to be refreshed.
   */
  factory.fetchData = function(successCallback, url, retry) {
    if (picasa.accessToken) {
      var config = {
        params: {'alt': 'json'},
        headers: {
          'Authorization': 'Bearer ' + picasa.accessToken
        }
      };
      // if no specific album URL was given, get the list of albums
      if (!url) url = picasa.ALBUM_FEED; // function param defaults not till C49
      $http.get(url, config).then(
        successCallback,
        function(resp) {
          if (resp.status == 401 && retry) {
            picasa.removeCachedAuthToken(
              /**
               * all the binds here and in picasa.auth seem a bit convoluted, but 
               * will keep because following example app. thinking the second one 
               * below is unnecessary because there is no "this" in fetchData
               */
              picasa.auth.bind(picasa, true, factory.fetchData.bind($scope, false))
            );
          }
        }
      );
    }
  };

  // Toggles the authorization state.
  factory.toggleAuth = function(callback) {
    if (!picasa.accessToken) {
      factory.grantAuth(true, callback);
    } else {
      factory.revokeAuth(callback);
    }
  }

  factory.grantAuth = function(callback) {
    if (!picasa.accessToken) {
      picasa.auth(true, function() {
        callback && callback();
      });
    }
  }

  factory.revokeAuth = function(callback) {
    if (picasa.accessToken) {
      picasa.revokeAuthToken(function() {
        callback && callback();
      });
    }
  }

  // Controls the label of the authorize/deauthorize button.
  factory.authButtonLabel = function() {
    if (picasa.accessToken)
      return 'Log Out';
    else
      return 'Log In';
  };

  return factory;

}]);


/**
 * Angular service to manage settings storage and retrieval
 */
embedder.service('settings', function(){

  /**
   * Save settings directly from form data
   */
  this.set = function(data) {
    chrome.storage.sync.set(data);
  };

  /**
   * Get settings stored in Chrome Sync or local storage.
   *
   * @todo so we can call this on demand, but since it's async, might be better 
   * to have the latest available in the service itself. can we do that? Need to
   * review the docs at https://docs.angularjs.org/guide/providers :
   * "The Service recipe produces a service just like the Value or Factory recipes, but it does so by invoking a constructor with the new operator."
   * 
   * @param  {Function} callback Function that can use the data returned from storage
   */
  this.get = function(callback) {
    chrome.storage.sync.get(null, function(data){ // null gets all values; we only use storage for settings
      if (typeof data.last_page    == 'undefined') { data.last_page    = ''; }
      if (typeof data.save_state   == 'undefined') { data.save_state   = true; }
      if (typeof data.tracking     == 'undefined') { data.tracking     = true; }
      if (typeof data.sort_by      == 'undefined') { data.sort_by      = 'date'; }
      if (typeof data.sort_order   == 'undefined') { data.sort_order   = 'descending'; }
      if (typeof data.large_crop   == 'undefined') { data.large_crop   = false; }
      if (typeof data.large_scale  == 'undefined') { data.large_scale  = 1; }
      if (typeof data.large_height == 'undefined') { data.large_height = undefined; }
      if (typeof data.large_width  == 'undefined') { data.large_width  = 1200; }
      if (typeof data.small_crop   == 'undefined') { data.small_crop   = false; }
      if (typeof data.small_scale  == 'undefined') { data.small_scale  = 1; }
      if (typeof data.small_height == 'undefined') { data.small_height = undefined; }
      if (typeof data.small_width  == 'undefined') { data.small_width  = 620; }
      if (typeof data.template     == 'undefined') { data.template     = '<a href="$LARGE_URL"><img src="$SMALL_URL" width="$SMALL_WIDTH" height="$SMALL_HEIGHT" alt="$SAFE_TITLE" title="$SAFE_DESCRIPTION"></a>\n\n'; }
      callback(data);
    });
  }

});


/**
 * Some things shared between controllers. We will add some functions to the 
 * root scope that is accessible from each controller. Since a few of these
 * need to refer to the local scope in the controller calling it, we do a crazy
 * thing where we create a "child" property on $rootScope and assign it to the
 * local scope from within the controller. This makes me think there is a better
 * way, but DRY made me do it.
 */
embedder.run(function ($rootScope, $location, picasaService) {

  $rootScope.child = {}; // so we can attach successCallback within controllers

  /**
   * These are the functions that get can called by the controllers. They runs the
   * service's related functions and pass callbacks that reference other functions
   * in scope. Doing it this way allows us to not need to pass in picasaService
   * to each controller.
   */

  $rootScope.toggleAuth = function(){
    picasaService.toggleAuth(function(){
      $rootScope.authButtonLabel = picasaService.authButtonLabel;
      $rootScope.fetchData(); // also runs $scope.$apply();
    });
  };

  $rootScope.authButtonLabel = function(){
    return 'Logging in…';
  };

  $rootScope.fetchData = function(url){
    /**
     * We might be able to remove the default url in the service fetchData()
     * if we set it to the album feed here (and below?) instead, but need to 
     * look at it closer and test. 
     */
    if(!url) url = false;
    picasaService.fetchData($rootScope.child.successCallback, url, false);
  };

  /**
   * This is called from controller upon load. I don't think we can just call 
   * here because fetchData needs child scope's successCallback
   * @param  {string} url Feed URL to retrieve.
   */
  $rootScope.grantAuth = function(url){
    // see note just above
    if(!url) url = false;
    picasaService.grantAuth(function(){
      $rootScope.authButtonLabel = picasaService.authButtonLabel;
      $rootScope.fetchData(url); // also runs $scope.$apply();
    });
  };

  $rootScope.getState = function(type){
    return picasaService.state[type];
  };
  
  $rootScope.setState = function(type, data){
    picasaService.state[type] = data;
  };  

});


/**
 * Init setup and attach event listeners. Possibly some of the above stuff outside
 * the angular setup would be better here.
 */
document.addEventListener('DOMContentLoaded', function(e) {

  // fileystem support
  window.webkitRequestFileSystem(TEMPORARY, 1024 * 1024, function(localFs) {
    embedder.fs = localFs;
  }, onError);

});

