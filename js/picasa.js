/*
Adapted from https://github.com/GoogleChrome/chrome-app-samples/blob/master/samples/gdrive/js/gdocs.js
Adapted by: Charlie Gorichanaz (charlie@gorichanaz.com)

Copyright 2012 Google Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

Author: Eric Bidelman (ericbidelman@chromium.org)
*/

"use strict";


function Picasa(selector) {
  var SCOPE_ = 'https://picasaweb.google.com/data/';
  this.lastResponse = null;
  this.__defineGetter__('SCOPE', function() {
    return SCOPE_;
  });
  this.__defineGetter__('ALBUM_FEED', function() {
    return SCOPE_ + 'feed/api/user/default';
  });
};
Picasa.fn = Picasa.prototype;

Picasa.fn.auth = function(interactive, opt_callback) {
  try {
    chrome.identity.getAuthToken({interactive: interactive}, function(token) {
      if (token) {
        this.accessToken = token;
        opt_callback && opt_callback();
      }
    }.bind(this));
  } catch(e) {
    console.log(e);
  }
};

Picasa.fn.removeCachedAuthToken = function(opt_callback) {
  if (this.accessToken) {
    var accessToken = this.accessToken;
    this.accessToken = null;
    // Remove token from the token cache.
    chrome.identity.removeCachedAuthToken({ 
      token: accessToken
    }, function() {
      opt_callback && opt_callback();
    });
  } else {
    opt_callback && opt_callback();
  }
};

Picasa.fn.revokeAuthToken = function(opt_callback) {
  if (this.accessToken) {
    // Make a request to revoke token
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://accounts.google.com/o/oauth2/revoke?token=' +
             this.accessToken);
    xhr.send();
    this.removeCachedAuthToken(opt_callback);
  }
}

/*
 * Generic HTTP AJAX request handler.
 */
Picasa.fn.makeRequest = function(method, url, callback, opt_data, opt_headers) {
  var data = opt_data || null;
  var headers = opt_headers || {};

  var xhr = new XMLHttpRequest();
  xhr.open(method, url, true);

  // Include common headers (auth and version) and add rest. 
  xhr.setRequestHeader('Authorization', 'Bearer ' + this.accessToken);
  for (var key in headers) {
    xhr.setRequestHeader(key, headers[key]);
  }

  xhr.onload = function(e) {
    this.lastResponse = this.response;
    callback(this.lastResponse, this);
  }.bind(this);
  xhr.onerror = function(e) {
    console.log(this, this.status, this.response,
                this.getAllResponseHeaders());
  };
  xhr.send(data);
};
