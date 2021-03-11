function safeHTML (str) {
  str = (str + '').replace(/^javascript\:/gi, '');
  return str
    .replace(/&/gi, '&amp;')
    .replace(/</gi, '&lt;')
    .replace(/>/gi, '&gt;')
    .replace(/"/gi, '&quot;');
};

function isMobile () {
  return !!/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}


function isMac () {
  return !!navigator.platform.match(/(Mac|iPhone|iPod|iPad)/i);
}

function isWindows() {
  return navigator.platform.indexOf('Win') > -1
}

function isLinux() {
  return navigator.platform.indexOf('Lin') > -1
}

// https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding#The_Unicode_Problem
window['u_atob'] = function u_atob (str) {
  return decodeURIComponent(Array.prototype.map.call(atob(str), function (c) {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
}

window['u_btoa'] = function u_btoa (str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (match, p1) {
    return String.fromCharCode(parseInt(p1, 16));
  }));
}

var timeit = function () {
  var t0 = new Date().valueOf();
  var t = 0;
  return function (msg) {
    var t1 = new Date().valueOf();
    console.log(msg || ++t, 'took ' + (t1 - t0) + 'ms');
    t0 = t1;
  }
}
