;(function(cookie, DESCipher, DESExtras) {

var Store = function() {
  this.map = {};

  return this;
}

Store.localStorageAvailable = (function() {
  try {
    return ('localStorage' in window) && window.localStorage !== null;
  }
  catch(e) {
    return false;
  }
})();

if (Store.localStorageAvailable) {
  Store.prototype.get = function(key) {
    return window.localStorage.getItem(key);
  }

  Store.prototype.set = function(key, value) {
    window.localStorage.setItem(key, value);
  }

  Store.prototype.getSecure = function(key) {
    var secret = this.get(key + ".secret");
    var crypto = cookie(key);

    if (secret && secret != "" && crypto) {
      var value = this._decrypt(secret, crypto);
      var length = parseInt(this.get(key + ".length"));

      return value.substring(0, length);
    }

    return undefined;
  }

  Store.prototype.setSecure = function(key, value, options) {
    options = options || {};

    var domain = options.domain ? options.domain : window.location.hostname;

    var secret = this._generateSecret();

    this.set(key + ".secret", secret);
    this.set(key + ".length", value.length);

    var crypto = this._encrypt(secret, value);

    cookie(key, crypto, {"domain": domain});
  }

  Store.prototype._encrypt = function(secret, message) {
    var crypto = DESCipher.des(secret, message, 1/*encrypt=true*/, 0/*vector ? 1 : 0*/, null/*vector*/);
    crypto = DESExtras.stringToHex(crypto);
    return crypto;
  }

  Store.prototype._decrypt = function(secret, crypto) {
    var message = DESExtras.hexToString(crypto);
    message = DESCipher.des(secret, message, 0/*encrypt=false*/, 0/*vector=false*/, null/*vector*/);
    return message;
  }

  Store.prototype._generateSecret = function() {
    var v = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
         'a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z',
         '1','2','3','4','5','6','7','8','9','0']

    for(var j, x, i = v.length; i; j = parseInt(Math.random() * i), x = v[--i], v[i] = v[j], v[j] = x);

    var secret = v.slice(0,8).join("");

    return secret;
  }
}
else {
  Store.prototype.get = function(key) {
    return this.map[key];
  }

  Store.prototype.set = function(key, value) {
    this.map[key] = value;
  }

  Store.prototype.getSecure = Store.prototype.get;
  Store.prototype.setSecure = Store.prototype.set;
}

var Sroc = window.Sroc;

var MercadoLibre = {
  baseURL: "https://api.mercadolibre.com",
  authorizationURL: "http://auth.mercadolibre.com/authorization",

  hash: {},
  callbacks: {},
  store: new Store(),

  init: function(options) {
    this.options = options

    if (this.options.sandbox) this.baseURL = this.baseURL.replace(/api\./, "sandbox.")

    this._silentAuthorization();

    this._triggerSessionChange()
  },

  get: function(url, callback) {
    Sroc.get(this._url(url), {}, callback)
  },

  post: function(url, params, callback) {
    Sroc.post(this._url(url), params, callback)
  },

  getToken: function() {
    var token = this.store.getSecure("access_token");
    return (token && token.length > 0) ? token : null
  },

  requireLogin: function(callback) {
    var token = this.getToken()

    if (!token) {
      this.pendingCallback = callback
      this.login()
    }
    else {
      callback()
    }
  },

  login: function() {
    this._popup(this._authorizationURL(true));
  },

  bind: function(event, callback) {
    if (typeof(this.callbacks[event]) == "undefined") this.callbacks[event] = []
    this.callbacks[event].push(callback)
  },

  trigger: function(event, args) {
    var callbacks = this.callbacks[event]

    if (typeof(callbacks) == "undefined") return

    for (i = 0; i < callbacks.length; i++) {
      callbacks[i].apply(null, args)
    }
  },

  logout: function() {
    this.store.setSecure("access_token", "");
    this._triggerSessionChange()
  },

  _loginComplete: function(hash) {
    if (hash.access_token) {
      this.store.setSecure("access_token", hash.access_token);
    }

    if (this._popupWindow) {
      this._popupWindow.close();
    }

    this._triggerSessionChange()

    if (this.pendingCallback) this.pendingCallback()
  },

  _triggerSessionChange: function() {
    this.trigger("session.change", [this.getToken() ? true : false])
  },

  // Check if we're returning from a redirect
  // after authentication inside an iframe.
  _checkPostAuthorization: function() {
    if (this.hash.state && this.hash.state == "iframe" && !this.hash.error) {
      var p = window.opener || window.parent;

      p.MercadoLibre._loginComplete(this.hash);
    }
  },

  _url: function(url) {
    url = this.baseURL + url

    var token = this.getToken()

    if (token) {
      var append = url.indexOf("?") > -1 ? "&" : "?"

      url += append + "access_token=" + token
    }

    return url
  },

  _parseHash: function() {
    var hash = window.location.hash.substr(1)

    if (hash.length == 0) return

    var self = this

    var pairs = hash.split("&")

    for (var i = 0; i < pairs.length; i++) {
      var pair = null;

      if (pair = pairs[i].match(/([A-Za-z_\-]+)=(.*)$/)) {
        self.hash[pair[1]] = pair[2]
      }
    }
  },

  _popup: function(url) {
    if (!this._popupWindow || this._popupWindow.closed) {
      var width = 830
      var height = 510
      var left = parseInt((screen.availWidth - width) / 2);
      var top = parseInt((screen.availHeight - height) / 2);

      this._popupWindow = (window.open(url, "_blank",
        "toolbar=no,status=no,location=yes,menubar=no,resizable=no,scrollbars=no,width=" + width + ",height=" + height + ",left=" + left + ",top=" + top + "screenX=" + left + ",screenY=" + top
      ))
    }
    else {
      this._popupWindow.focus()
    }
  },

  _silentAuthorization: function() {
    this._iframe = document.createElement("iframe");
    this._iframe.setAttribute("src", this._authorizationURL(false));
    this._iframe.style.width = "0px";
    this._iframe.style.height = "0px";
    this._iframe.style.position = "absolute";
    this._iframe.style.top = "-10px";
    document.body.appendChild(this._iframe);
  },

  _authorizationURL: function(interactive) {
    var xd_url = window.location.protocol + "//" + window.location.host + this.options.xd_url;

    return this.authorizationURL +
      "?redirect_uri=" + escape(xd_url) +
      "&response_type=token" +
      "&client_id=" + this.options.client_id +
      "&state=iframe" +
      "&display=popup" +
      "&interactive=" + (interactive ? 1 : 0);
  }
}

MercadoLibre._parseHash()

MercadoLibre._checkPostAuthorization()

window.MercadoLibre = MercadoLibre;

})(cookie, DESCipher, DESExtras);
