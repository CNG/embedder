/**
 * Angular controllers for the views in index.html and the partials folder. There
 * are three views, so here we define three controllers. That's how MVC works, I hear.
 *
 * @todo The parts in the two successCallback() functions below that deal with caching
 * images to the local filesystem may need testing and confirmation. In development, 
 * the console indicated the images were not being saved, but this might have been
 * due to the hacky nature of the documentation for getting OAuth2 to work in 
 * Chrome Packaged Apps before they are actually published to the store. And when
 * using the published version, I can't seem to show the developer toolbar, so I need
 * to look into how to confirm whether this is working or not.
 * 
 * Author: Charlie Gorichanaz (charlie@gorichanaz.com)
 */


/**
 * Create controllers object to which we will attach all the controllers
 */
var embedderControllers = angular.module('embedderControllers', [], function($provide) {
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
 * Controls the settings view (partials/settings.html)
 */
embedderControllers.controller('settingsController', ['$scope', 'settings', function($scope, settings) {

  tracker.sendAppView('settings');


  /**
   * Save settings from the form. Target of save button.
   */
  $scope.save = function(data) {

    /**
     * @todo Was previously wrapping some of these in conditionals to try to detect
     * when the setting was changed, and only record it on changes. But I realized
     * both these would always be equal due to Angular automatically updating
     * scope from the form, so for now I am just always reporting to analytics
     * the settings, but should go back and refine this later.
     * 
     * if( $scope.settings.template != data.template ){ 
     *   // never reach this
     * }
     * if( $scope.settings.tracking != data.tracking ){
     *   // never reach this?
     * }
     */

    // record changes in tracking setting
    tracker.sendEvent(
      'setting saved: tracking',
      data.tracking ? 'enabled' : 'disabled'
    );
    // tell GA the user's tracking preference
    GAService.getConfig().addCallback(function(config) {
      config.setTrackingPermitted($scope.settings.tracking);
    });

    // record changes in template setting
    tracker.sendEvent('setting saved: template', data.template);

    // record image settings
    tracker.sendEvent(
      'settings saved: sort',
      data.sort_by + " " + data.sort_order
    );
    tracker.sendEvent(
      'settings saved: large image',
      ( data.large_width ? data.large_width : '*' )
      + "x"
      + ( data.large_height ? data.large_height : '*' )
      + " @ scale " + data.large_scale
      + ", " + ( data.large_crop ? '' : 'not ' ) + "cropped"
    );
    tracker.sendEvent(
      'settings saved: small image',
      ( data.small_width ? data.small_width : '*' )
      + "x"
      + ( data.small_height ? data.small_height : '*' )
      + " @ scale " + data.small_scale
      + ", " + ( data.small_crop ? '' : 'not ' ) + "cropped"
    );

    // tell settings service about the saved config
    settings.set(data);

  };


  /**
   * Populate form with saved settings. Target of undo button.
   */
  $scope.undo = function(form) {
    tracker.sendEvent('settings', 'undo');
    if (form) {
      form.$setPristine();
      form.$setUntouched();
    }
    settings.get(function(data){
      $scope.$apply(function(){
        $scope.settings = data;
      });
    });
  };

  // set form from saved settings on load
  $scope.undo();

}]);


/**
 * Controls the album list view (partials/album-list.html). This is the list of
 * all albums, not individual photos within a single album.
 */
embedderControllers.controller('albumListController', ['$scope', 'settings', '$http', function($scope, settings, $http) {

  tracker.sendAppView('albums');

  /**
   * Get the settings. I'd like to be able to just get directly from the settings
   * service on demand instead of getting here first, but that would require the
   * service to store the settings instead of getting on demand itself from sync
   * storage, which is an async call. See related note in app.js settings service.
   */
  $scope.settings;
  settings.get(function(data){
    $scope.$apply(function(){
      $scope.settings = data;
      $scope.grantAuth();
    });
  });

  // so we can do something dirty in run()
  $scope.$parent.child = $scope;

  // Allows page to remember the album data if you come back from another page
  $scope.data = $scope.getState('albums');


  /**
   * Response handler passed into fetchData() defined on $rootScope, used by both
   * the album list and photo list controllers.
   */
  $scope.successCallback = function(resp) {
    // clear data each time fetchData() is run else we'd append photos
    $scope.data = [];
    var totalEntries = resp.data.feed.entry.length;
    var totalCached  = 0; // count for later reporting
    var totalFetched = 0; // count for later reporting
    resp.data.feed.entry.forEach(function(entry, i) {

      // collecting only the data we need to build an object to store
      var item = {
        title:     entry.title.$t,
        summary:   entry.summary.$t,
        updated:   entry.updated.$t,
        uDate:     Util.formatDate(entry.updated.$t),
        published: entry.published.$t,
        pubDate:   Util.formatDate(entry.published.$t),
        thumb:     entry.media$group.media$thumbnail[0].url.replace(/\/s160-c\//,'/s320-c/'),
        // this is the feed URL for the album this image represents
        feed:      entry.id.$t.replace("entry","feed")+'&kind=photo&imgmax=d'
      };
      /**
       * To get from the album list to a photo list, we will build a link that
       * encodes all we need to know about the target album: the title and the
       * feed URL. We are essentially passing that state via URL parameters, but
       * encoded in a single URL segment so we don't have to deal with actual
       * URL query string within a Chrome packaged app, which might be a can of 
       * worms if anything else in this project is any indication. So, this works,
       * and I'll stick with it.
       */
      item.encoded = Util.utf8_to_b64(JSON.stringify(
        {title: item.title, feed: item.feed}
      ));

      /**
       * Automatically ignore the automatically generated Google albums.
       * 
       * @todo We should have a setting for showing or hiding these albums. Since
       * I am the only customer right now, I'll just hard code it.
       */
      var re = /^(Hangout\: |Auto Backup)/;
      if( re.test(item.title) ) return true;

      //item.thumb_filename = item.thumb; // apparently this works fine, but example removed the domain
      item.thumb_filename = item.thumb.substring(item.thumb.lastIndexOf('com/') + 1).replace(/\//g,"___");

      /**
       * If file exists, it we'll get back a FileEntry for the filesystem URL.
       * Otherwise, the error callback will fire and we need to XHR it in and 
       * write it to the FS.
       */
      var fsURL = embedder.fs.root.toURL() + embedder.name + '/' + item.thumb_filename;
      //console.log(fsURL);
      //console.log(totalEntries + "  " + i);
      window.webkitResolveLocalFileSystemURL(fsURL, function(entry) {
        totalCached = totalCached + 1;
        item.thumb = entry.toURL(); // should be === to fsURL, but whatevs.
        $scope.data.push(item);
        sortData(i);
      }, function(e) {
        $http.get(item.thumb, {responseType: 'blob'}).then(function(resp) {
          totalFetched = totalFetched + 1;
          var blob = resp.data;
          blob.name = item.thumb; // Add icon filename to blob.
          writeFile(blob); // Write is async, but that's ok.
          item.thumb = window.URL.createObjectURL(blob);
          $scope.data.push(item);
          sortData(i);
        });
      });

    });

    /**
     * This is down here because I need to use in both cases above, and the 
     * structure might need some review because I was and may be still having 
     * "$digest already in progress" issues
     */
    function sortData(i){
      // Only want to sort and call $apply() when we have all entries.
      if (totalEntries - 1 == i) {
        if(         $scope.settings.sort_by == 'dateUpdated'){
          $scope.data.sort(Util.sortBy('updated'));
        } else if ( $scope.settings.sort_by == 'datePublished'){
          $scope.data.sort(Util.sortBy('published'));
        } else if ( $scope.settings.sort_by == 'title'){
          $scope.data.sort(Util.sortBy('title'));
        } else if ( $scope.settings.sort_by == 'description'){
          $scope.data.sort(Util.sortBy('summary'));
        } else {
          $scope.data.sort(Util.sortBy('uDate'));
        }
        if( $scope.settings.sort_order == 'ascending'){
          $scope.data.reverse();
        }
        // following three are clunky here but needed to only run at end, so in this "if"
        var summary = "cached: " + totalCached + ", fetched: " + totalFetched;
        console.log(summary);
        tracker.sendEvent('album list', summary);
      }
    }

    $scope.setState('albums', $scope.data);

  }; // end $scope.successCallback = function(resp)


}]);


/**
 * Controls the photo list view (partials/photo-list.html). This is the list of 
 * individual photos within a single album. The album is determined by the URL,
 * which has an encoded data segment.
 */
embedderControllers.controller('photoListController', ['$scope', 'settings', '$http', '$routeParams', function($scope, settings, $http, $routeParams) {

  tracker.sendAppView('photos');

  /**
   * Get the settings. I'd like to be able to just get directly from the settings
   * service on demand instead of getting here first, but that would require the
   * service to store the settings instead of getting on demand itself from sync
   * storage, which is an async call. See related note in app.js settings service.
   */
  $scope.settings;
  settings.get(function(data){
    $scope.$apply(function(){
      $scope.settings = data;
    });
  });

  // so we can do something dirty in run()
  $scope.$parent.child = $scope;

  $scope.data = []; // all photos in album from picasa
  $scope.photos = []; // chosen photos

  // get album feed URL and title from the URL segment for this page
  $scope.albumData = JSON.parse(Util.b64_to_utf8($routeParams.data));
  $scope.url = $scope.albumData.feed;

  // make sure we are logged in
  $scope.grantAuth($scope.url);

  // get the images for the album determined by the URL
  $scope.fetchData($scope.url);


  /**
   * Response handler passed into fetchData() defined on $rootScope, used by both
   * the album list and photo list controllers.
   */
  $scope.successCallback = function(resp) {
    // clear data each time fetchData() is run else we'd append photos
    $scope.data = [];
    var totalEntries = resp.data.feed.entry.length;
    resp.data.feed.entry.forEach(function(entry, i) {

      // collecting only the data we need to build an object to store
      var item = {
        title:     entry.title.$t,
        summary:   entry.summary.$t,
        updated:   entry.updated.$t,
        published: entry.published.$t,
        thumb:     entry.media$group.media$thumbnail[0].url.replace(/\/s72\//,'/c-s320/'),
        data:      entry
      };

      //item.thumb_filename = item.thumb; // apparently this works fine, but example removed the domain
      item.thumb_filename = item.thumb.substring(item.thumb.lastIndexOf('com/') + 1).replace(/\//g,"___");

      // If file exists, it we'll get back a FileEntry for the filesystem URL.
      // Otherwise, the error callback will fire and we need to XHR it in and write it to the FS.
      var fsURL = embedder.fs.root.toURL() + embedder.name + '/' + item.thumb_filename;
      //console.log(fsURL);
      window.webkitResolveLocalFileSystemURL(fsURL, function(entry) {
        item.thumb = entry.toURL(); // should be === to fsURL, but whatevs.
        $scope.data.push(item);
        // Only want to sort and call $apply() when we have all entries.
        if (totalEntries - 1 == i) {
          $scope.$apply(function() {
            $scope.data.sort(Util.sortBy('updated'));
          });
        }
      }, function(e) {
        $http.get(item.thumb, {responseType: 'blob'}).then(function(resp) {
          var blob = resp.data;
          blob.name = item.thumb; // Add icon filename to blob.
          writeFile(blob); // Write is async, but that's ok.
          item.thumb = window.URL.createObjectURL(blob);
          $scope.data.push(item);
          if (totalEntries - 1 == i) {
            $scope.$apply(function() {
              $scope.data.sort(Util.sortBy('updated'));
            });
          }
        });
      });

    });

  };


  /**
   * For the view to be able to display the number of selected photos
   * @return {int} Number of selected photos
   */
  $scope.photoCount = function(){
    return $scope.photos.length;
  };


  /**
   * For the view to add and remove photos from the selection
   * @param  {event} e The event passed in by the view
   * @param  {int} i The index of the photo in the entire set, passed in by the view
   */
  $scope.togglePhoto = function(e, i){
    /**
     * @todo I switched from storing e.currentTarget to just the index i,
     * so I might have more cleanup to do here
     */
    var index = $scope.photos.indexOf(i);
    // wrap so we can use jqLite since maybe not using jQuery
    var element = angular.element(e.currentTarget);
    if(index === -1) { // add photo

      // add to photos array
      $scope.photos.push(i);
      // mark as selected
      element.addClass('selected');
      // add number div inside
      var numberDiv = document.createElement('div');
      numberDiv.innerHTML = $scope.photoCount();
      numberDiv.className = 'number';
      element.prepend(numberDiv);

    } else { // remove photo

      // remove selected mark
      element.removeClass('selected');
      // decrement all numbers higher than this one
      var removingNumber = e.currentTarget.firstChild.innerHTML;
      if( removingNumber != $scope.photoCount() ){
        var numbers = document.getElementsByClassName('number');
        var i;
        for (i=0; i<numbers.length; i++){
          var otherNumber = Number(numbers[i].innerHTML);
          if( otherNumber > removingNumber ){
            numbers[i].innerHTML = otherNumber - 1;
          }
        }
      } else {
        // this was highest number, no need to do anything beyond remove it
      }
      // remove number
      e.currentTarget.removeChild(e.currentTarget.firstChild);
      $scope.photos.splice(index, 1);

    }
  };


  /**
   * Remove all photos from selection and reset the count.
   */
  $scope.reset = function(){
    var numbers = document.getElementsByClassName('number');
    var i;
    // start at end because removing node changes indexes
    for (i=numbers.length-1; i>=0; i--){
      angular.element(numbers[i].parentNode).removeClass('selected');
      numbers[i].remove();
    }
    $scope.photos = [];
  };


  /**
   * Select all photos.
   */
  $scope.all = function(){
    var divs = document.getElementsByClassName('thumbnail');
    var i;
    for (i = 0; i < divs.length; ++i) {
      var index = $scope.photos.indexOf(i);
      // wrap so we can use jqLite since maybe not using jQuery
      var element = angular.element(divs[i]);
      if(index === -1) { // add photo

        // add to photos array
        $scope.photos.push(i);
        // mark as selected
        element.addClass('selected');
        // add number div inside
        var numberDiv = document.createElement('div');
        numberDiv.innerHTML = $scope.photoCount();
        numberDiv.className = 'number';
        element.prepend(numberDiv);

      }
    }
  };


  /**
   * Export selected photos as HTML in the modal textarea
   */
  $scope.export = function() {

    var output = '';
    var images = [];
    $scope.photos.forEach(function(i){
      var obj = $scope.data[i].data;

      /**
       * Build a new object with all the properties we are interested in,
       * but do it inside a try block in case we messed up one of the checks.
       */
      try {

        // defaault everything to an empty string
        var map = {
          'KEYWORDS'     : '',
          '$EXPOSURE'    : '',
          '$FLASH'       : '',
          '$FOCALLENGTH' : '',
          '$FSTOP'       : '',
          '$UNIQUEID'    : '',
          '$ISO'         : '',
          '$MAKE'        : '',
          '$MODEL'       : '',
          '$TIME'        : '',
          '$LICENSE'     : '',
          '$BYTES'       : '',
          '$TIMESTAMP'   : '',
          '$VERSION'     : '',
          '$CREDIT'      : '',
          '$HEIGHT'      : '',
          '$WIDTH'       : '',
          '$TITLE'       : '',
          '$DESCRIPTION' : '',
          '$DOWNLOAD'    : '',
          '$THUMB'       : '',
          '$PUBLISHED_ISO8601'    : '',
          '$PUBLISHED_YYYY-MM-DD' : '',
          '$UPDATED_ISO8601'      : '',
          '$UPDATED_YYYY-MM-DD'   : ''
        };

        // not sure of data format of keywords
        // map['KEYWORDS'] = obj.media$keywords;

        if(obj.exif$tags) {
          var sub = obj.exif$tags;
          if(sub.exif$exposure      && sub.exif$exposure.$t     ) { map['$EXPOSURE']    = sub.exif$exposure.$t;      }
          if(sub.exif$flash         && sub.exif$flash.$t        ) { map['$FLASH']       = sub.exif$flash.$t;         }
          if(sub.exif$focallength   && sub.exif$focallength.$t  ) { map['$FOCALLENGTH'] = sub.exif$focallength.$t;   }
          if(sub.exif$fstop         && sub.exif$fstop.$t        ) { map['$FSTOP']       = sub.exif$fstop.$t;         }
          if(sub.exif$imageUniqueID && sub.exif$imageUniqueID.$t) { map['$UNIQUEID']    = sub.exif$imageUniqueID.$t; }
          if(sub.exif$iso           && sub.exif$iso.$t          ) { map['$ISO']         = sub.exif$iso.$t;           }
          if(sub.exif$make          && sub.exif$make.$t         ) { map['$MAKE']        = sub.exif$make.$t;          }
          if(sub.exif$model         && sub.exif$model.$t        ) { map['$MODEL']       = sub.exif$model.$t;         }
          if(sub.exif$time          && sub.exif$time.$t         ) { map['$TIME']        = sub.exif$time.$t;          }
        }
        if(obj.gphoto$license       && obj.gphoto$license.name  ) { map['$LICENSE']     = obj.gphoto$license.name;   }
        if(obj.gphoto$size          && obj.gphoto$size.$t       ) { map['$BYTES']       = obj.gphoto$size.$t;        }
        if(obj.gphoto$timestamp     && obj.gphoto$timestamp.$t  ) { map['$TIMESTAMP']   = obj.gphoto$timestamp.$t;   }
        if(obj.gphoto$version       && obj.gphoto$version.$t    ) { map['$VERSION']     = obj.gphoto$version.$t;     }
        if(obj.media$group) {
          var sub = obj.media$group;
          if(sub.media$credit       && sub.media$credit[0]     && sub.media$credit[0].$t     ) { map['$CREDIT']      = sub.media$credit[0].$t;     }
          if(sub.media$content      && sub.media$content[0]    && sub.media$content[0].height) { map['$HEIGHT']      = sub.media$content[0].height;}
          if(sub.media$content      && sub.media$content[0]    && sub.media$content[0].width ) { map['$WIDTH']       = sub.media$content[0].width; }
          if(sub.media$title        && sub.media$title.$t                                    ) { map['$TITLE']       = sub.media$title.$t;         }
          if(sub.media$description  && sub.media$description.$t                              ) { map['$DESCRIPTION'] = sub.media$description.$t;   }
          if(sub.media$content      && sub.media$content[0]    && sub.media$content[0].url   ) { map['$DOWNLOAD']    = sub.media$content[0].url;   }
          if(sub.media$thumbnail    && sub.media$thumbnail[0]  && sub.media$thumbnail[0].url ) { map['$THUMB']       = sub.media$thumbnail[0].url; }
        }
        if(obj.published && obj.published.$t) {
          map['$PUBLISHED_ISO8601']    = obj.published.$t;
          map['$PUBLISHED_YYYY-MM-DD'] = Util.formatDate(obj.published.$t);
        }
        if(obj.updated   && obj.updated.$t  ) {
          map['$UPDATED_ISO8601']      = obj.updated.$t;
          map['$UPDATED_YYYY-MM-DD']   = Util.formatDate(obj.updated.$t);
        }

        // HTML escaped versions of tricky values
        map['$SAFE_CREDIT']      = Util.htmlEscape(map['$CREDIT']);
        map['$SAFE_TITLE']       = Util.htmlEscape(map['$TITLE']);
        map['$SAFE_DESCRIPTION'] = Util.htmlEscape(map['$DESCRIPTION']);

        // small thumbnail
        var props = Util.calcProps(
          $scope.settings.small_crop,
          $scope.settings.small_scale,
          $scope.settings.small_width,
          $scope.settings.small_height,
          map['$WIDTH'],
          map['$HEIGHT']
        );
        map['$SMALL_URL']    = map['$THUMB'].replace(/\/[swh]\d+(\/[^\/]+)$/,props.code+'$1')
        map['$SMALL_WIDTH']  = props.w;
        map['$SMALL_HEIGHT'] = props.h;

        // large thumbnail
        var props = Util.calcProps(
          $scope.settings.large_crop,
          $scope.settings.large_scale,
          $scope.settings.large_width,
          $scope.settings.large_height,
          map['$WIDTH'],
          map['$HEIGHT']
        );
        map['$LARGE_URL']    = map['$THUMB'].replace(/\/[swh]\d+(\/[^\/]+)$/,props.code+'$1')
        map['$LARGE_WIDTH']  = props.w;
        map['$LARGE_HEIGHT'] = props.h;

        // should no longer need this with above verbose checks
        // for (var key in map) {
        //   if (map.hasOwnProperty(key) && map[key] === undefined) {
        //     map[key] = '';
        //   }
        // }

        // save resulting object of final data onto the images array
        images.push(map);

      } catch(e) {
        // log any objects that failed above tests
        console.log(e);
        console.log(obj);
        tracker.sendEvent('export error',  e.stack);
      }

    }); // end $scope.photos.forEach

    /**
     * Now that we have a list of objects of final image data, we can loop through
     * it and replace the template variables with the final data. Add each final
     * string of generated HTML onto the $output variable.
     */
    images.forEach(function(map){
      var code = $scope.settings.template;
      var re = new RegExp(
        Object.keys(map)
          .join("|")
          .replace(/\$/g,'\\$'), // because we are dumb and wanted $ for the variables
        "gi"
      );
      code = code.replace(re, function(matched){
        return map[matched];
      });
      output += code;
    });

    /**
     * Final export to modal
     */
    $scope.embedCode = output;
    $("#modal").modal();
    tracker.sendEvent('export', 'exported ' + images.length + ' out of ' + $scope.photos.length + ' selected');
    /**
     * after switching to getting template from $scope.settings instead of calling it
     * from chrome storage here, suddenly the $scope.apply() didn't work and wasn't necessary
     * $scope.$apply(function(){
     *   $scope.embedCode = output;
     *   $("#modal").modal();
     * });
     */

  }; // end $scope.export = function()


}]);
