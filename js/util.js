/*
Adapted from https://github.com/GoogleChrome/chrome-app-samples/blob/master/samples/gdrive/js/util.js
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

var Util = Util || {};

// Combines two JSON objects in one.
Util.merge = function(obj1, obj2) {
  var obj = {};

  for (var x in obj1) {
    if (obj1.hasOwnProperty(x)) {
      obj[x] = obj1[x];
    }
  }

  for (var x in obj2) {
    if (obj2.hasOwnProperty(x)) {
      obj[x] = obj2[x];
    }
  }

  return obj;
};

/**
 * Turns a NodeList into an array.
 *
 * @param {NodeList} list The array-like object.
 * @return {Array} The NodeList as an array.
 */
Util.toArray = function(list) {
  return Array.prototype.slice.call(list || [], 0);
};

/**
 * Urlencodes a JSON object of key/value query parameters.
 * @param {Object} parameters Key value pairs representing URL parameters.
 * @return {string} query parameters concatenated together.
 */
Util.stringify = function(parameters) {
  var params = [];
  for(var p in parameters) {
    params.push(encodeURIComponent(p) + '=' +
                encodeURIComponent(parameters[p]));
  }
  return params.join('&');
};

/**
 * Creates a JSON object of key/value pairs
 * @param {string} paramStr A string of Url query parmeters.
 *    For example: max-results=5&startindex=2&showfolders=true
 * @return {Object} The query parameters as key/value pairs.
 */
Util.unstringify = function(paramStr) {
  var parts = paramStr.split('&');

  var params = {};
  for (var i = 0, pair; pair = parts[i]; ++i) {
    var param = pair.split('=');
    params[decodeURIComponent(param[0])] = decodeURIComponent(param[1]);
  }
  return params;
};

/**
 * Utility for formatting a date string.
 * @param {string} msg The date in UTC format. Example: 2010-04-01T08:00:00Z.
 * @return {string} The date formated as mm/dd/yy. Example: 04/01/10.
 */
Util.formatDate = function(dateStr) {
  // TODO: allow for other date formats 
  var date = new Date(dateStr.split('T')[0]);
  return [
    date.getFullYear().toString(),
    ("0" + ( date.getMonth() + 1 ) ).slice(-2),
    ("0" + date.getDate() ).slice(-2),
  ].join('-');
};

/**
 * Utility for formatting a Date object as a string in ISO 8601 format using UTC.
 * @param {Date} d The date to format.
 * @return {string} The formated date string in ISO 8601 format.
 */
Util.ISODateString = function(d) {
 var pad = function(n) {
   return n < 10 ? '0' + n : n;
 };
 return d.getUTCFullYear() + '-'
        + pad(d.getUTCMonth() + 1) + '-'
        + pad(d.getUTCDate()) + 'T'
        + pad(d.getUTCHours()) + ':'
        + pad(d.getUTCMinutes()) + ':'
        + pad(d.getUTCSeconds());// + 'Z'
};

/** 
 * Formats a string with the given parameters. The string to format must have
 * placeholders that correspond to the index of the arguments passed and surrounded 
 * by curly braces (e.g. 'Some {0} string {1}').
 *
 * @param {string} var_args The string to be formatted should be the first 
 *     argument followed by the variables to inject into the string
 * @return {string} The string with the specified parameters injected
 */
Util.format = function(var_args) {
  var args = Array.prototype.slice.call(arguments, 1);
  return var_args.replace(/\{(\d+)\}/g, function(m, i) {
    return args[i];
  });
};

/**
 * Generic sort function to pass to sort(), allowing for dynamically choosing
 * the key to sort on at invocation.
 * @param  {string} prop The name of the property to sort on
 * @return {int} Result for use in sort()'s comparison callback
 */
Util.sortBy = function(prop) {
  return function(a, b) {
    if (a[prop] < b[prop]) {
      return 1;
    }
    if (a[prop] > b[prop]) {
      return -1;
    }
    return 0;
  }
}

/**
 * Creates a base-64 encoded ASCII string from a "string" of binary data.
 * @author https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/btoa
 * @param  {string} str Data to encode
 * @return {string} Base-64 encoded version of input
 */
Util.utf8_to_b64 = function(str) {
  return window.btoa(unescape(encodeURIComponent(str)));
}

/**
 * Decodes a base-64 encoded ASCII string to a "string" of binary data.
 * @author https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/btoa
 * @param  {string} str Base-64 encoded string
 * @return {string} UTF8 encoded string
 */
Util.b64_to_utf8 = function(str) {
  return decodeURIComponent(escape(window.atob(str)));
}

/**
 * Escapes all potentially dangerous characters, so the resulting string can be
 * safely inserted into attribute or element text.
 * @author http://stackoverflow.com/a/7124052/172602
 * @param  {string} str String to escape
 * @return {string} HTML escaped string
 */
Util.htmlEscape = function(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Reverses escaping of potentially dangerous characters.
 * @author http://stackoverflow.com/a/7124052/172602
 * @param  {string} str String to escape
 * @return {string} HTML escaped string
 */
Util.htmlUnescape = function(value){
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * The next two functions were totally separate, but I wanted to combine them 
 * since they used the same parameters… but it ended up less graceful than I 
 * hoped due to mw and mh having meaning when explicitly blank
 */

/**
 * Produce URL parameters for retrieving appropriately sized images.
 * 
 * Note Google apparently doesn't support dimension requests larger than 2560 
 * pixels and has a max height of 1060 when width not specified
 * 
 * @param  {bool}  c    Whether to crop the image or not
 * @param  {float} hdpi Scaling factor for high density screens. Anything above 
 * 1 will result in an image URL that generates an image larger than the 
 * dimensions given. This is so the dimensions given can be used in the image 
 * tag, but the source image will be larger for better sharpness.
 * @param  {int}   mw   Max width desired
 * @param  {int}   mh   Max height desired
 * @param  {int}   ow   Original width
 * @param  {int}   oh   Original height
 * @return {str}        returns object with the code needed to generate image 
 * URL and the dimesions for building embed HTML
 */
Util.calcProps = function(c, hdpi, mw, mh, ow, oh) {
  var dims = Util.calcDimensions(mw, mh, ow, oh);
  var h = Math.round( hdpi * dims.h );
  var w = Math.round( hdpi * dims.w );
  var code = '/';
  if(!mw && !mh) {
    code += 'd';
  } else {
    if(!mw) {
      code += 'h' + h;
    } else if(!mh) {
      code += 'w' + w;
    } else {
      if(w == h) {
        code += 's' + w;
      } else {
        code = code + 'w' + w + '-h' + h;
      }
      if(c) code += '-c'; 
    }
  }
  return { code: code, w: dims.w, h: dims.h };
  /**
   * old code that didn't allow crop on mismatched dimensions:
   * 
   * if(c) return '/s' + ( s ? s : Math.min(ow, oh, 2560) ) + '-c';
   * else return '/' + ( (mw || mh) ? '' : 'd' ) + (mw && 'w' + Math.min(mw, 2560)) + ((mw && mh) && '-') + ( mw ? (mh && 'h' + Math.min(mh, 2560)) : (mh && 'h' + Math.min(mh, 1060)) );
   */
}

/**
 * Calculate dimensions based on settings and Google constraints
 * 
 * Note Google apparently doesn't support dimension requests larger than 2560 
 * pixels and has a max height of 1060 when width not specified
 * 
 * @param  {int}   mw   Max width desired
 * @param  {int}   mh   Max height desired
 * @param  {int}   ow   Original width
 * @param  {int}   oh   Original height
 * @return {str}        returns object with the dimensions
 */
Util.calcDimensions = function(mw, mh, ow, oh) {
  var w, h;
  if(!mw && !mh) {
    w = ow; h = oh;
  } else {
    if(!mw) {
      h = Math.min(oh, mh, 1060);
      w = ow / oh * h;
    } else if(!mh) {
      w = Math.min(ow, mw, 2560);
      h = oh / ow * w;
    } else {
      var r = 1; // ratio of dimensions (max/orig)
      if(ow > mw || oh > mh) {
        var rw = mw / ow;
        var rh = mh / oh;
        if(rw > rh) r = rh;
        else r = rw;
      }
      w = ow * r;
      h = oh * r;
    }
  }
  return {
    w: Math.round(w),
    h: Math.round(h)
  };
}

