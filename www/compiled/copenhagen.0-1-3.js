(function (window, document) {
window['Copenhagen'] = {
  'Editor': CPHEditor,
  'initSelectorAll': function (selector) {
    return [].slice.call(document.querySelectorAll(selector)).map(function (el) {
      var language = el.getAttribute('data-language');
      var attrs = [].slice.call(el.attributes);
      var cfg = attrs
        .filter(function (a) { return a.nodeName.startsWith('data-'); })
        .reduce(function (cfg, a) {
          var key = a.nodeName.slice('data-'.length);
          var value = a.nodeValue;
          cfg[key] = value;
          return cfg;
        }, {});
      var editor = new CPHEditor(cfg);
      editor.open(el, false, true);
      return editor;
    });
  }
};

function EventHandler () {
  this._windowEventList = [];
  this._events = {};
  this._queue = {};
};

EventHandler.prototype.queue = function (event, handler) {

};

EventHandler.prototype.on = function (event, handler) {
  if (event === 'app.added') {
    if (!this.app) {
      throw new Error('Can not listen to "app.added" event - no app detected');
    }
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        if (mutation.addedNodes.length) {
          var els = [].slice.call(mutation.addedNodes);
          for (var i = 0; i < els.length; i++) {
            if (els[i] === this.app.element()) {
              observer.disconnect();
              this.dispatch('app.added', this, this.app);
              return;
            }
          }
        }
      }.bind(this));
    }.bind(this));
    observer.observe(document.body, {childList: true});
  }
  this._events[event] = this._events[event] || [];
  this._events[event].push(handler);
  if (this._queue[event]) {
    while (this._queue[event].length) {
      this.dispatch.apply(this, [event].concat(this._queue[event].shift()));
    }
    this._queue[event] = null;
  }
};

EventHandler.prototype.off = function (event, handler) {
  if (this._events[event]) {
    this._events[event] = this._events[event].filter(function (eHandler) {
      return eHandler !== handler;
    });
  }
};

EventHandler.prototype.trigger = function (event, data) {
  if (this.hasParent && !this.hasParent(document.body)) {
    return;
  }
  data = (typeof data === 'object' ? data : {}) || {};
  this._events[event] &&
    this._events[event].forEach(function (handler) {
      handler.call(null, data);
    });
};

// Better version of trigger
EventHandler.prototype.dispatch = function (event) {
  var args = [].slice.call(arguments, 1);
  var enabled = this._enabled;
  if (this._events[event]) {
    this._events[event].forEach(function (handler) {
      if (enabled === this._enabled) {
        handler.apply(null, args);
      }
    }.bind(this));
  } else {
    var parts = event.split('.');
    if (parts[parts.length - 1] === 'queue') {
      this._queue[event] = this._queue[event] || [];
      this._queue[event].push(args);
    }
  }
};

function Control () {
  EventHandler.call(this);
  this._unloaded = false;
  this._enabled = this.hasOwnProperty('_enabled')
    ? this._enabled
    : true;
  this.elements = this.createElements();
  this.controls = this.createControls(this.elements);
  this.listen();
  this.__initialized__ = true;
}

window.Controls = {};
Control.prototype = Object.create(EventHandler.prototype);

Control.prototype.__initialized__ = false;
Control.prototype.elements = {};
Control.prototype.events = {};
Control.prototype.windowEvents = {};
Control.prototype.eventListeners = {};
Control.prototype.controlActions = {};
Control.prototype.selfActions = {};
Control.prototype.commands = {};
Control.prototype.actions = {};
Control.prototype._mobileEventMap = {
  'mousedown': 'touchstart',
  'mousemove': 'touchmove',
  'mouseup': 'touchend'
};

Control.prototype._mapEvent = function (event) {
  return isMobile()
    ? this._mobileEventMap[event] || event
    : event;
};

Control.prototype.listen = function () {
  var self = this;
  var elements = this.elements;
  // LEGACY: Events, used when .createElements called manually
  var events = this.events;
  Object.keys(events).forEach(function (elementName) {
    var element = elements[elementName];
    Object.keys(events[elementName]).forEach(function (eventName) {
      var fn = events[elementName][eventName];
      eventName = eventName.split('.');
      var disabled = false;
      var event;
      if (eventName[eventName.length - 1] === 'disabled') {
        disabled = true;
        event = eventName.slice(0, -1).join('.');
      } else {
        event = eventName.join('.');
      }
      var wrapperFn = disabled
        ? function () { !self._enabled && fn.apply(self, arguments); }.bind(self)
        : function () { self._enabled && fn.apply(self, arguments); }.bind(self);
      var useCapture = fn.name === 'capture';
      if (!element) {
        console.log('elementName:', elementName);
      }
      element.addEventListener(
        self._mapEvent(event),
        function (e) { wrapperFn.call(self, e, element); },
        useCapture
      );
    });
  });
  // Global window Events
  var windowEvents = this.windowEvents;
  Object.keys(windowEvents).forEach(function (eventName) {
    var fn = windowEvents[eventName];
    eventName = eventName.split('.');
    var disabled = false;
    var event;
    if (eventName[eventName.length - 1] === 'disabled') {
      disabled = true;
      event = eventName.slice(0, -1).join('.');
    } else {
      event = eventName.join('.');
    }
    var wrapperFn = disabled
      ? function () { !self._enabled && fn.apply(self, arguments); }.bind(self)
      : function () { self._enabled && fn.apply(self, arguments); }.bind(self);
    var useCapture = fn.name === 'capture';
    window.addEventListener(self._mapEvent(event), wrapperFn, useCapture);
    self._windowEventList.push({name: self._mapEvent(event), action: wrapperFn, capture: useCapture});
  });
  // Event Listeners, queries selectors
  var eventListeners = this.eventListeners;
  Object.keys(eventListeners).forEach(function (elementSelector) {
    if (elementSelector === '&') {
      var els = [elements.main];
    } else {
      var els = [].slice.call(elements.main.querySelectorAll(elementSelector));
    }
    if (!els.length) {
      console.warn('No selector found for: "' + elementSelector + '" in "' + self.constructor.name + '"');
    }
    els.forEach(function (element) {
      Object.keys(eventListeners[elementSelector]).forEach(function (eventName) {
        var fn = eventListeners[elementSelector][eventName];
        eventName = eventName.split('.');
        var disabled = false;
        var event;
        if (eventName[eventName.length - 1] === 'disabled') {
          disabled = true;
          event = eventName.slice(0, -1).join('.');
        } else {
          event = eventName.join('.');
        }
        var wrapperFn = disabled
          ? function () { !self._enabled && fn.apply(self, arguments); }.bind(self)
          : function () { self._enabled && fn.apply(self, arguments); }.bind(self);
        var useCapture = fn.name === 'capture';
        element.addEventListener(
          self._mapEvent(event),
          function (e) { wrapperFn.call(self, e, element); },
          useCapture
        );
      });
    });
  });
  // Actions (Eventing) for Child Controls
  var controls = this.controls;
  var controlActions = this.controlActions;
  Object.keys(controlActions).forEach(function (ctrlName) {
    var actions = controlActions[ctrlName];
    var control = controls[ctrlName];
    Object.keys(actions).forEach(function (actionName) {
      var fn = actions[actionName];
      actionName = actionName.split('.');
      var disabled = false;
      var action;
      if (actionName[actionName.length - 1] === 'disabled') {
        disabled = true;
        action = actionName.slice(0, -1).join('.');
      } else {
        action = actionName.join('.');
      }
      var wrapperFn = disabled
        ? function () { !control._enabled && fn.apply(self, arguments); }.bind(self)
        : function () { control._enabled && fn.apply(self, arguments); }.bind(self);
      control.on(action, wrapperFn);
    });
  });
  // Actions (Eventing) for Self
  var selfActions = this.selfActions;
  Object.keys(selfActions).forEach(function (actionName) {
    var fn = selfActions[actionName];
    actionName = actionName.split('.');
    var disabled = false;
    var action;
    if (actionName[actionName.length - 1] === 'disabled') {
      disabled = true;
      action = actionName.slice(0, -1).join('.');
    } else {
      action = actionName.join('.');
    }
    var wrapperFn = disabled
      ? function () { !self._enabled && fn.apply(this, arguments); }.bind(self)
      : function () { self._enabled && fn.apply(self, arguments); }.bind(self);
    self.on(action, wrapperFn);
  });
};

Control.prototype.create = function (tag, classes, attributes) {
  var el = document.createElement(tag);
  classes = (classes || []).filter(function (v) { return !!v; });
  el.classList.add.apply(el.classList, classes);
  return Object.keys(attributes || {}).reduce(function (el, key) {
    el.setAttribute(key, attributes[key]);
    return el;
  }, el);
};

Control.prototype.element = function (name) {
  return name ? this.elements[name] : this.elements.main;
};

Control.prototype.getStyle = function (el, prop) {
	return document.defaultView.getComputedStyle(el, null).getPropertyValue(prop);
};

Control.prototype.selector = function (selector) {
  return this.selectorAll(selector)[0] || null;
};

Control.prototype.selectorAll = function (selector) {
  var elements = this.elements;
  return [].slice.call(elements.main.querySelectorAll(selector))
    .filter(function (el) {
      while (el.parentNode) {
        if (el.tagName.toLowerCase() === 'control') {
          if (el !== elements.main) {
            return false;
          } else {
            return true;
          }
        }
        el = el.parentNode;
      }
      return true;
    });
};

Control.prototype.hasControl = function (name) {
  return !!this.controls[name];
};

Control.prototype.control = function (name, ignoreErrors) {
  if (!ignoreErrors && !this.controls[name]) {
    throw new Error('No such control ("' + name + '") added to ' + this.constructor.name + (this.name ? ' ("' + this.name + '")' : ''));
  }
  return this.controls[name];
}

Control.prototype.appendTo = function (el, beforeEl) {
  if (this._unloaded) {
    throw new Error('Cannot execute ' + this.constructor.name + '.appendTo, control has been unloaded');
  }
  if (!this.element()) {
    throw new Error('Can not append - no main element');
  }
  if (!el) {
    throw new Error('Can not append - no element to append to');
  }
  if (beforeEl !== undefined && (!beforeEl || beforeEl.parentNode !== el)) {
    throw new Error('Can not append - beforeEl is not a member of el');
  }
  if (beforeEl) {
    return el.insertBefore(this.element(), beforeEl);
  } else {
    return el.appendChild(this.element());
  }
};

Control.prototype.replaceElement = function (el) {
  if (this._unloaded) {
    throw new Error('Cannot execute ' + this.constructor.name + '.replace, control has been unloaded');
  }
  if (!this.element()) {
    throw new Error('Can not replace - no main element');
  }
  if (!el) {
    throw new Error('Can not replace - no element to append to');
  }
  if (!el.parentNode) {
    throw new Error('Can not replace - no parent element');
  }
  return el.parentNode.replaceChild(this.element(), el);
};

Control.prototype.open = function (el, focus) {
  if (this._unloaded) {
    throw new Error('Cannot execute ' + this.constructor.name + '.open, control has been unloaded');
  }
  focus = focus === undefined ? true : !!focus;
  el = el || document.body;
  this.appendTo(el);
  this.show();
  focus && this.focus();
  this.dispatch('open', this);
};

Control.prototype.openBefore = function (el, beforeEl, focus) {
  if (this._unloaded) {
    throw new Error('Cannot execute ' + this.constructor.name + '.openBefore, control has been unloaded');
  }
  focus = focus === undefined ? true : !!focus;
  el = el || document.body;
  this.appendTo(el, beforeEl || null);
  focus && this.focus();
  this.dispatch('open', this);
};

Control.prototype.detach = function () {
  this.element() &&
    this.element().parentNode &&
    this.element().parentNode.removeChild(this.element());
};

Control.prototype.close = function () {
  this._unloaded = true;
  this.dispatch.apply(this, ['close', this].concat([].slice.call(arguments)));
  var controls = this.controls;
  Object.keys(controls).forEach(function (name) {
    controls[name].close();
  });
  this._windowEventList.forEach(function (event) {
    window.removeEventListener(event.name, event.action, event.capture);
  });
  this._events = {};
  this._queue = [];
  this._windowEventList = [];
  this.detach();
};

Control.prototype.focus = function () {
  this.element().focus();
};

Control.prototype.isVisible = function () {
  return this.element().style.display !== 'none';
};

Control.prototype.isEnabled = function () {
  return !!this._enabled;
};

Control.prototype.show = function () {
  this.element().style.display = '';
  this.dispatch('show', this);
};

Control.prototype.hide = function () {
  this.element().style.display = 'none';
  this.dispatch('hide', this);
};

Control.prototype.toggle = function (force) {
  if (force === true) {
    this.show();
  } else if (force === false) {
    this.hide();
  } else if (this.element().style.display === 'none') {
    this.show();
  } else {
    this.hide();
  }
};

Control.prototype.createElements = function () {
  var controlEl = document.createElement('control');
  var template = this.constructor.template || this.constructor;
  controlEl.setAttribute('control', template.prototype.controlName || template.name);
  controlEl.innerHTML = Template.find(template).render(this);
  return {main: controlEl};
};

Control.prototype.addControl = function (name, ctrl) {
  if (this.__initialized__) {
    throw new Error('Controls can only be added via .addControl before Control constructor called.');
  }
  this.controls = this.controls || {};
  if (!(Control.prototype.isPrototypeOf(ctrl.constructor.prototype))) {
    throw new Error('Invalid Control in .addControl: ' + name);
  }
  this.controls[name] = ctrl;
  return ctrl;
};

Control.prototype.createControls = function (elements) {
  return [].slice.call(elements.main.querySelectorAll('control'))
    .reduce(function (controls, el) {
      var control;
      var cfg = {};
      var fromName = el.getAttribute('name');
      var controlName = el.getAttribute('control');
      if (fromName && !controlName) {
        if (el.getAttributeNames().length > 1) {
          throw new Error('If "name" is specified without "control" on <control> element, loading from .addControl call. Can not specify additional configuration.');
        }
        control = controls[fromName];
        el.parentNode.replaceChild(control.element(), el);
      } else {
        var Ctrl = window.Controls[controlName];
        if (!(Control.prototype.isPrototypeOf(Ctrl.prototype))) {
          throw new Error('Invalid Control in HTML: ' + name);
        }
        cfg = el.getAttributeNames().reduce(function (cfg, name) {
          if (name !== 'control') {
            cfg[name] = el.getAttribute(name);
          }
          return cfg;
        }, {});
        var control = new Ctrl(this.app || null, cfg);
        if (control.element().tagName.toLowerCase() === 'control') {
          var controlEl = control.element();
          el.getAttributeNames().filter(function (name) {
            return name.toLowerCase() !== 'control';
          }).forEach(function (name) {
            controlEl.setAttribute(name, el.getAttribute(name));
          });
          el.parentNode.replaceChild(controlEl, el);
        } else {
          el.appendChild(control.element());
        }
        cfg.name && (controls[cfg.name] = control);
      }
      return controls;
    }.bind(this), this.controls || {});
};

Control.prototype.getKeyChar = function (keyCode) {
  return (keyCode >= 48 && keyCode <= 90) ?
    String.fromCharCode(keyCode).toLowerCase() :
    ({
      32: 'space',
      186: ';',
      187: '+',
      188: ',',
      189: '-',
      190: '.',
      191: '/',
      219: '[',
      220: '\\',
      221: ']',
      222: '\''
    }[keyCode] || null);
};

Control.prototype.disable = function () {
  var enabled = this._enabled;
  this._enabled = false;
  (enabled !== this._enabled) && this.dispatch('disable', this);
};

Control.prototype.enable = function () {
  var enabled = this._enabled;
  this._enabled = true;
  (enabled !== this._enabled) && this.dispatch('enable', this);
};

Control.prototype.keyboardShortcut = function (e) {
  var modifierKey = navigator.platform.match('Mac') ? e.metaKey : e.ctrlKey;
  if (modifierKey) {
    var altKey = e.altKey;
    var shiftKey = e.shiftKey;
    var keyChar = this.getKeyChar(e.keyCode);
    var command = [
      altKey ? 'alt' : '',
      shiftKey ? 'shift' : '',
      keyChar ? keyChar : ''
    ].filter(function (v) { return v; }).join(' ');
    if (this.commands[command]) {
      e.preventDefault();
      e.stopPropagation();
      return this.commands[command].bind(this, e);
    }
  }
  return null;
};

Control.prototype.focusWithin = function () {
  var el = this.element();
  var node = document.activeElement;
  while (el && node) {
    if (node === el) {
      return true;
    }
    node = node.parentNode;
  }
  return false;
};

Control.prototype.hasParent = function (parent) {
  var hasParent = false;
  var el = this.element();
  while (el) {
    if (el === parent) {
      hasParent = true;
      break;
    }
    el = el.parentNode;
  }
  return hasParent;
};

function CPHEditor (app, cfg) {

  if (cfg === undefined) {
    cfg = app;
    app = null;
  }

  cfg = cfg || {};

  this.app = app;
  this.debug = cfg.hasOwnProperty('debug') && cfg.debug !== false;
  this.maximized = cfg.hasOwnProperty('maximized') && cfg.maximized !== false;
  this.rows = Math.max(1, Math.min(parseInt(cfg.rows) || 1, 30));
  this.maxrows = Math.max(1, Math.min(parseInt(cfg.maxrows || cfg.rows) || 30, 30));
  this.tabout = cfg.hasOwnProperty('tabout') && cfg.tabout !== false;
  this.nolines = cfg.hasOwnProperty('nolines') && cfg.nolines !== false;

  this._historyIndex = -1;
  this._history = {
    initialValue: cfg.value === undefined
      ? ''
      : (cfg.value + ''),
    userActions: []
  };

  this.language = '';
  this.lineHeight = 0;
  this.height = 0;
  this.width = 0;

  this._inputDelay = 500;
  this._inputDelayTimeout = null;

  this._contextMenu = null;

  this._preventMobileSelection = false;
  // FUTURE: Better mobile controls
  this._mobileTabDelay = 300;
  this._mobileTabTimeout = null;

  this._lastFindValue = null;
  this._lastViewportValue = '';
  this._lastScrollValue = '0,0';
  this._lastStateValue = '';
  this._lastValue = '';
  this._maxLine = ''; // max line width
  this._formatCache = {}; // keeps track of formatted lines
  this.value = this._history.initialValue || '';

  this.users = [new CPHUser()];
  this.user = this.users[0];

  this._lastFrameValue = '';
  this._lastRenderStartLineIndex = -1;
  this._renderQueue = [];

  this._selecting = false;
  this._initialSelection = null;
  this._selectionQueued = false;

  this.codeCompleter = new CodeCompleter();
  this._suggestion = null;

  this._blockLookup = '';
  this._commentLookup = '';
  this._find = {
    value: '',
    isCaseSensitive: false,
    currentIndex: -1,
    currentValue: '',
    nextIndex: -1,
    nextValue: '',
    prevIndex: -1,
    prevValue: ''
  };
  this._findRE = null;

  this._errorPos = {lineIndex: 0, column: 0, enabled: false};
  this._readOnly = false;

  this._verticalScrollerTimeout = null;
  this._verticalScrollerGrab = null;
  this._horizontalScrollerTimeout = null;
  this._horizontalScrollerGrab = null;
  this._minScrollerSize = 32;

  this._clipboard = [];
  this._metadata = {};
  this._autocompleteFns = {};
  this._autocomplete = null;

  this._emulationMode = false;

  this.hotkeys = Object.keys(this.constructor.prototype.hotkeys)
    .reduce(function (hotkeys, key) {
      hotkeys[key] = this.constructor.prototype.hotkeys[key];
      return hotkeys;
    }.bind(this), {});

  Control.call(this);

  this.nolines && this.element().classList.add('nolines');

  this.lineElements = [];
  this.lineNumberElements = [];
  this.lineHeight = 0;
  this.lineContainerElement = this.selector('.line-container');
  this.numbersElement = this.selector('.line-numbers');
  this.renderElement = this.selector('.render:not(.sample):not(.limit)');
  this.inputElement = this.selector('textarea');
  this.textboxElement = this.selector('.edit-text');
  this.verticalScrollAreaElement = this.selector('.scrollbar.vertical');
  this.verticalScrollerElement = this.selector('.scrollbar.vertical .scroller');
  this.horizontalScrollAreaElement = this.selector('.scrollbar.horizontal');
  this.horizontalScrollerElement = this.selector('.scrollbar.horizontal .scroller');
  this.sampleLineElement = this.selector('.render.sample .line .fill');
  this.limitElement = this.selector('.render.limit');

  this.virtualTop = 0;
  this.virtualLeft = 0;
  this.virtualCursorOffset = 0;
  this.virtualFrameIndex = -1;
  this.virtualFrameStartIndex = -1;

  // HACK: fixScrollTop is for Firefox
  this.fixScrollTop = -1;

  this.setLanguage(cfg.language);
  this.setReadOnly(cfg.hasOwnProperty('readonly') && cfg.readonly !== false);
  if (cfg.hasOwnProperty('disabled') && cfg.disabled !== false) {
    this.disable();
  }
  if (cfg.hasOwnProperty('hidden') && cfg.hidden !== false) {
    this.hide();
  }

  // Set element state ASAP.
  // We'll call this again on initialization.
  this.setMaximized(this.maximized);

  // FUTURE: Mobile support for cursors
  if (isMobile()) {
    this.element().classList.add('is-mobile');
    var selectionchangeListener = function (e) {
      if (this._unloaded) {
        document.removeEventListener('selectionchange', selectionchangeListener);
      } else if (this._preventMobileSelection) {
        this._preventMobileSelection = false;
      } else if (document.activeElement === this.inputElement) {
        if (
          this.inputElement.value.length &&
          this.inputElement.value.length === (this.inputElement.selectionEnd - this.inputElement.selectionStart)
        ) {
          this.select(0, this.value.length);
        } else if (this.user.cursors[0].width() > 1) {
          this._selecting = true;
          this.__cursorEvent(e, false, false);
        } else  {
          this.__cursorEvent(e, false, false);
        }
      }
    }.bind(this);
    document.addEventListener('selectionchange', selectionchangeListener);
  }

  this._initialized = false;
  this.__initialize__();

};

CPHEditor.prototype = Object.create(Control.prototype);
CPHEditor.prototype.constructor = CPHEditor;
CPHEditor.prototype.controlName = 'CPHEditor';
window.Controls['CPHEditor'] = CPHEditor;

CPHEditor.prototype.formatters = {
  'text': function (line) {
    return safeHTML(line);
  },
  'javascript': function (line, inString, inComment) {
    var formatted;
    if (inString) {
      formatted = hljs.highlight('javascript', '`' + line).value.replace(/\`/, '');
    } else if (inComment) {
      formatted = hljs.highlight('javascript', '/*' + line).value.replace(/\/\*/, '');
    } else {
      formatted = hljs.highlight('javascript', line).value;
    }
    return formatted;
  },
  'json': function (line) {
    return hljs.highlight('javascript', line).value;
  },
  'markdown': function (line, inString, inComment) {
    var formatted = hljs.highlight('markdown', line).value;
    return inString
      ? '<span class="hljs-code">' + formatted + '</span>'
      : formatted;
  },
  'css': function (line, inString, inComment, inBlock) {
    var formatted;
    if (inBlock) {
      formatted = hljs.highlight('css', '{' + line).value.replace(/\{/, '');
    } else if (inComment) {
      formatted = hljs.highlight('css', '/*' + line).value.replace(/\/\*/, '');
    } else {
      formatted = hljs.highlight('css', line).value;
    }
    return formatted;
  },
  'html': function (line) {
    return hljs.highlight('html', line).value;
  }
};

CPHEditor.prototype.languages = {
  'text': {
    stringComplements: {
      '"': '"',
    },
    forwardComplements: {
      '{': '}',
      '(': ')',
      '[': ']',
      '"': '"'
    }
  },
  'css': {
    comments: {
      '/*': '*/'
    },
    blocks: {
      '{': '}'
    },
    stringComplements: {
      '"': '"',
    },
    forwardComplements: {
      '{': '}',
      '(': ')',
      '[': ']',
      '"': '"'
    }
  },
  'javascript': {
    tabChar: ' ',
    tabWidth: 2,
    commentString: '//',
    comments: {
      '/*': '*/',
      '//': '\n'
    },
    multiLineStrings: {
      '`': '`'
    },
    tabComplements: {
      '{': '}',
      '(': ')',
      '[': ']'
    },
    stringComplements: {
      '\'': '\'',
      '"': '"',
      '`': '`'
    },
    forwardComplements: {
      '{': '}',
      '(': ')',
      '[': ']',
      '\'': '\'',
      '"': '"',
      '`': '`'
    }
  },
  'json': {
    tabComplements: {
      '{': '}',
      '[': ']',
    },
    stringComplements: {
      '"': '"',
    },
    forwardComplements: {
      '{': '}',
      '[': ']',
      '"': '"',
    }
  },
  'markdown': {
    multiLineStrings: {
      '```': '```'
    },
    tabComplements: {
      '{': '}',
      '(': ')',
      '[': ']'
    },
    stringComplements: {
      '\'': '\'',
      '"': '"',
      '`': '`'
    },
    forwardComplements: {
      '{': '}',
      '(': ')',
      '[': ']',
      '\'': '\'',
      '"': '"',
      '*': '*',
      '`': '`'
    }
  }
};

Object.keys(CPHEditor.prototype.languages).forEach(function (name) {
  var language = CPHEditor.prototype.languages[name];
  language.tabChar = language.tabChar || ' ';
  language.tabWidth = language.tabWidth || 2;
  language.commentString = language.commentString || '';
  language.comments = language.comments || {};
  language.blocks = language.blocks || {};
  language.multiLineStrings = language.multiLineStrings || {};
  language.tabComplements = language.tabComplements || {};
  language.stringComplements = language.stringComplements || {};
  language.forwardComplements = language.forwardComplements || {};
  language.reverseComplements = {};
  Object.keys(language.forwardComplements).forEach(function (key) {
    language.reverseComplements[language.forwardComplements[key]] = key;
  });
});

CPHEditor.prototype.hotkeys = {
  'ctrl+]': function (value, cursors) {
    this.userAction('AddIndent');
  },
  'ctrl+[': function (value, cursors) {
    this.userAction('RemoveIndent');
  },
  'ctrl+/': function (value, cursors) {
    this.userAction('ToggleComment');
  },
  'ctrl+arrowup': function (value, cursors) {
    this.user.moveCursorsByDocument(value, 'up');
    this.scrollToText();
  },
  'ctrl+arrowdown': function (value, cursors) {
    this.user.moveCursorsByDocument(value, 'down');
    this.scrollToText();
  },
  'ctrl+shift+arrowup': function (value, cursors) {
    this.user.moveCursorsByDocument(value, 'up', true);
    this.scrollToText();
  },
  'ctrl+shift+arrowdown': function (value, cursors) {
    this.user.moveCursorsByDocument(value, 'down', true);
    this.scrollToText();
  },
  'ctrl+arrowleft': function (value, cursors) {
    this.user.moveCursorsByLine(value, 'left');
    this.scrollToText();
  },
  'ctrl+arrowright': function (value, cursors) {
    this.user.moveCursorsByLine(value, 'right');
    this.scrollToText();
  },
  'ctrl+shift+arrowleft': function (value, cursors) {
    this.user.moveCursorsByLine(value, 'left', true);
    this.scrollToText();
  },
  'ctrl+shift+arrowright': function (value, cursors) {
    this.user.moveCursorsByLine(value, 'right', true);
    this.scrollToText();
  },
  'alt+arrowleft': function (value, cursors) {
    this.user.moveCursorsByWord(value, 'left');
    this.scrollToText();
  },
  'alt+arrowright': function (value, cursors) {
    this.user.moveCursorsByWord(value, 'right');
    this.scrollToText();
  },
  'alt+shift+arrowleft': function (value, cursors) {
    this.user.moveCursorsByWord(value, 'left', true);
    this.scrollToText();
  },
  'alt+shift+arrowright': function (value, cursors) {
    this.user.moveCursorsByWord(value, 'right', true);
    this.scrollToText();
  },
  'ctrl+alt+arrowup': function (value, cursors) {
    this.user.moveCursors(value, 'up', 1, false, true);
    this.scrollToText();
  },
  'ctrl+alt+arrowdown': function (value, cursors) {
    this.user.moveCursors(value, 'down', 1, false, true);
    this.scrollToText();
  },
  'ctrl+d': function (value, cursors) {
    this.user.createNextCursor(value);
    this.scrollToText();
  },
  'ctrl+u': function (value, cursors) {
    this.user.destroyLastCursor();
    this.scrollToText();
  },
  'ctrl+c': function (value, cursors) {
    document.execCommand('copy');
  },
  'ctrl+x': function (value, cursors) {
    document.execCommand('cut');
  },
  'ctrl+a': function (value, cursors) {
    this.select(0, value.length);
  },
  'ctrl+y': function (value, cursors) {
    this.gotoHistory(1);
  },
  'ctrl+shift+z': function (value, cursors) {
    this.gotoHistory(1);
  },
  'ctrl+z': function (value, cursors) {
    this.gotoHistory(-1);
  },
  'ctrl+s': function (value, cursors) {
    this.save();
  },
  'ctrl+f': function (value, cursors) {
    this.find(value.slice(cursors[0].selectionStart, cursors[0].selectionEnd));
  }
};

CPHEditor.prototype.windowEvents = {
  mousemove: function capture (e) {
    if (this._verticalScrollerGrab) {
      e.preventDefault();
      e.stopPropagation();
      if (e.buttons !== 1) {
        this._verticalScrollerGrab = null;
        this.verticalScrollerElement.classList.remove('manual');
        this._verticalScrollerTimeout = setTimeout(function () {
          this.verticalScrollerElement.classList.remove('scrolling');
        }.bind(this), 1000);
      } else {
        var dx = e.clientX - this._verticalScrollerGrab.x;
        var dy = e.clientY - this._verticalScrollerGrab.y;
        this._verticalScrollerGrab.scrollBy(dx, dy);
      }
    } else if (this._horizontalScrollerGrab) {
      e.preventDefault();
      e.stopPropagation();
      if (e.buttons !== 1) {
        this._horizontalScrollerGrab = null;
        this.horizontalScrollerElement.classList.remove('manual');
        this._horizontalScrollerTimeout = setTimeout(function () {
          this.horizontalScrollerElement.classList.remove('scrolling');
        }.bind(this), 1000);
      } else {
        var dx = e.clientX - this._horizontalScrollerGrab.x;
        var dy = e.clientY - this._horizontalScrollerGrab.y;
        this._horizontalScrollerGrab.scrollBy(dx, dy);
      }
    } else {
      if (e.buttons !== 1) {
        this._selecting = false;
        this._initialSelection = null;
      }
    }
  },
  mouseup: function capture (e) {
    if (this._verticalScrollerGrab) {
      e.preventDefault();
      e.stopPropagation();
      this._verticalScrollerGrab = null;
      this.verticalScrollerElement.classList.remove('manual');
      this._verticalScrollerTimeout = setTimeout(function () {
        this.verticalScrollerElement.classList.remove('scrolling');
      }.bind(this), 1000);
    } else if (this._horizontalScrollerGrab) {
      e.preventDefault();
      e.stopPropagation();
      this._horizontalScrollerGrab = null;
      this.horizontalScrollerElement.classList.remove('manual');
      this._horizontalScrollerTimeout = setTimeout(function () {
        this.horizontalScrollerElement.classList.remove('scrolling');
      }.bind(this), 1000);
    }
  },
  resize: function () {
    var el = this.element();
    while (el = el.parentNode) {
      if (el === document) {
        this.lineHeight = this.sampleLineElement.offsetHeight;
        this.height = this.textboxElement.offsetHeight;
        this.width = this.textboxElement.offsetWidth;
        this.render(this.value);
        break;
      }
    }
  },
  'resize.disabled': function () {
    var el = this.element();
    while (el = el.parentNode) {
      if (el === document) {
        this.lineHeight = this.sampleLineElement.offsetHeight;
        this.height = this.textboxElement.offsetHeight;
        this.width = this.textboxElement.offsetWidth;
        this.render(this.value);
        break;
      }
    }
  }
};

CPHEditor.prototype.controlActions = {
  'find-replace': {
    'hide': function (ctrl) {
      this._find.value = '';
      this._findRE = null;
      this.focus();
      this.render(this.value);
    },
    'change': function (ctrl, value, isCaseSensitive, isRegex) {
      this._find.value = value;
      this._find.isCaseSensitive = isCaseSensitive;
      try {
        this._findRE = new RegExp(
          isRegex
            ? value
            : value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'g' + (isCaseSensitive ? '' : 'i')
        );
      } catch (e) {
        this._findRE = null;
      }
      this.render(this.value);
    },
    'prev': function (ctrl, value, isCaseSensitive) {
      if (this._find.prevIndex !== -1) {
        this.user.resetCursor();
        this.user.cursors[0].select(this._find.prevIndex, this._find.prevIndex + this._find.prevValue.length);
        this.scrollToText();
      }
    },
    'next': function (ctrl, value, isCaseSensitive) {
      if (this._find.nextIndex !== -1) {
        this.user.resetCursor();
        this.user.cursors[0].select(this._find.nextIndex, this._find.nextIndex + this._find.nextValue.length);
        this.scrollToText();
      }
    },
    'replace': function (ctrl, value, replaceValue, isCaseSensitive) {
      if (this._find.currentIndex !== -1) {
        this.user.resetCursor();
        this.user.cursors[0].select(this._find.currentIndex, this._find.currentIndex + this._find.currentValue.length);
        this.userAction('InsertText', replaceValue);
        this.__renderFindReplace();
        this.user.cursors[0].select(this._find.nextIndex, this._find.nextIndex + this._find.nextValue.length);
        this.scrollToText();
      } else if (this._find.nextIndex !== -1) {
        this.user.resetCursor();
        this.user.cursors[0].select(this._find.nextIndex, this._find.nextIndex + this._find.nextValue.length);
        this.userAction('InsertText', replaceValue);
        this.__renderFindReplace();
        this.user.cursors[0].select(this._find.nextIndex, this._find.nextIndex + this._find.nextValue.length);
        this.scrollToText();
      }
    },
    'replace-all': function (ctrl, value, replaceValue, isCaseSensitive) {
      if (this.isReadOnly() || !this.isEnabled()) {
        this.animateNo();
      } else {
        this.user.resetCursor();
        this.setValue(this.value.replace(this._findRE, replaceValue));
        this.render(this.value);
      }
    }
  }
};

CPHEditor.prototype.eventListeners = {
  '.scrollbar.vertical .scroller': {
    mousedown: function (e) {
      if (!this._verticalScrollerGrab) {
        e.preventDefault();
        e.stopPropagation();
        var rect = this.verticalScrollerElement.getBoundingClientRect();
        var parentRect = this.verticalScrollerElement.parentNode.getBoundingClientRect();
        var top = rect.top - parentRect.top;
        var height = rect.height;
        var parentHeight = parentRect.height;
        var scrollBy = function (dx, dy) {
          var y = Math.min(parentHeight - height, Math.max(0, top + dy));
          var pct = y / (parentHeight - height);
          var totalHeight = this.lineHeight * this.value.split('\n').length + this.paddingTop + this.paddingBottom;
          this.scrollTo(null, pct * (totalHeight - this.height));
        }.bind(this);
        this._verticalScrollerGrab = {x: e.clientX, y: e.clientY, scrollBy: scrollBy};
      }
    },
    mouseenter: function (e) {
      this.verticalScrollerElement.classList.add('scrolling');
      this.verticalScrollerElement.classList.add('manual');
      clearTimeout(this._verticalScrollerTimeout);
    },
    mouseleave: function (e) {
      if (!this._verticalScrollerGrab) {
        this._verticalScrollerTimeout = setTimeout(function () {
          this.verticalScrollerElement.classList.remove('scrolling');
          this.verticalScrollerElement.classList.remove('manual');
        }.bind(this), 1000);
      }
    }
  },
  '.scrollbar.horizontal .scroller': {
    mousedown: function (e) {
      if (!this._horizontalScrollerGrab) {
        e.preventDefault();
        e.stopPropagation();
        var rect = this.horizontalScrollerElement.getBoundingClientRect();
        var parentRect = this.horizontalScrollerElement.parentNode.getBoundingClientRect();
        var left = rect.left - parentRect.left;
        var width = rect.width;
        var parentWidth = parentRect.width;
        var scrollBy = function (dx, dy) {
          var x = Math.min(parentWidth - width, Math.max(0, left + dx));
          var pct = x / (parentWidth - width);
          this.scrollTo(pct * (this.inputElement.scrollWidth - this.inputElement.offsetWidth));
        }.bind(this);
        this._horizontalScrollerGrab = {x: e.clientX, y: e.clientY, scrollBy: scrollBy};
      }
    },
    mouseenter: function (e) {
      this.horizontalScrollerElement.classList.add('scrolling');
      this.horizontalScrollerElement.classList.add('manual');
      clearTimeout(this._horizontalScrollerTimeout);
    },
    mouseleave: function (e) {
      if (!this._horizontalScrollerGrab) {
        this._horizontalScrollerTimeout = setTimeout(function () {
          this.horizontalScrollerElement.classList.remove('scrolling');
          this.horizontalScrollerElement.classList.remove('manual');
        }.bind(this), 1000);
      }
    }
  },
  'textarea': {
    focus: function (e) {
      if (!this._emulationMode) {
        this.element().classList.add('focus');
      }
      this.dispatch('focus', this, e);
      this.render(this.value);
    },
    blur: function (e) {
      if (!this._emulationMode) {
        this.element().classList.remove('focus');
      }
      if (this._contextMenu) {
        this._contextMenu.close();
      }
      this._autocomplete = null;
      this.dispatch('blur', this, e);
      this.render(this.value);
    },
    contextmenu: function capture (e) {
      this.dispatch('contextmenu', this, e);
      if (!e.defaultPrevented) {
        e.preventDefault();
        this._contextMenu = new CPHContextMenu(
          this.app,
          {
            parent: this,
            items: [
              {
                icon: 'rotate-ccw',
                title: 'Undo',
                shortcut: 'ctrl+z',
                disabled: this._historyIndex < 0
              },
              {
                icon: 'rotate-cw',
                title: 'Redo',
                shortcut: 'ctrl+y',
                disabled: this._historyIndex === this._history.userActions.length - 1
              },
              '-',
              {
                icon: 'scissors',
                title: 'Cut',
                shortcut: 'ctrl+x'
              },
              {
                icon: 'copy',
                title: 'Copy',
                shortcut: 'ctrl+c'
              },
              {
                icon: 'delete',
                title: 'Delete',
                action: function () {
                  this.userAction('RemoveText', -1);
                }
              },
              {
                icon: 'maximize',
                title: 'Select All',
                shortcut: 'ctrl+a'
              }
            ]
          }
        );
        this._contextMenu.open(e);
        this._contextMenu.on('close', function () {
          this._contextMenu = null;
        }.bind(this));
      }
    },
    mousedown: function (e, el) {
      if (e.type === 'touchstart') { // touchstarts get routed here
        this._initialSelection = null; // reset initial selection
        return; // this is handled by selectionchange
      } else if (e.buttons === 2) {
        return;
      } else if (!this._selecting) {
        if (!e.shiftKey) {
          // Reset selection range so propert selection will populate after
          //  setTimeout (native behavior)
          isMobile() && (this._preventMobileSelection = true);
          this.inputElement.setSelectionRange(0, 0);
        }
        var hasModifier = !!(e.metaKey || ((isWindows() || isLinux()) && e.ctrlKey));
        this._selecting = true;
        this._initialSelection = null; // reset initial selection
        var moveListener = function (e, createCursor, mouseup) {
          setTimeout(function () {
            this.__cursorEvent(e, createCursor, mouseup);
          }.bind(this), 1);
        }.bind(this);
        var mouseupListener = function (e) {
          window.removeEventListener('mousemove', moveListener);
          window.removeEventListener('mouseup', mouseupListener);
          moveListener(e, null, true);
        }.bind(this);
        window.addEventListener('mousemove', moveListener);
        window.addEventListener('mouseup', mouseupListener);
        moveListener(e, hasModifier, false);
      }
    },
    input: function (e) {
      var text = e.data;
      var type = e.inputType;
      if (type === 'insertText') {
        this.userAction('InsertText', text);
        this.scrollToText();
      } else if (type === 'historyUndo') {
        this.gotoHistory(-1);
      } else if (type === 'historyRedo') {
        this.gotoHistory(1);
      } else {
        this.render(this.value);
      }
    },
    cut: function (e) {
      e.preventDefault();
      e.stopPropagation();
      var cursor = this.user.cursors[0];
      e.clipboardData.setData(
        'text/plain',
        this.value.slice(
          cursor.selectionStart,
          cursor.selectionEnd
        )
      );
      this.userAction('RemoveText', 0);
      this.scrollToText();
    },
    copy: function (e) {
      e.preventDefault();
      e.stopPropagation();
      var cursors = this.user.getSortedCursors();
      this._clipboard = cursors.map(function (c) {
        return this.value.slice(c.selectionStart, c.selectionEnd);
      }.bind(this));
      e.clipboardData.setData('text/plain', this._clipboard[0]);
    },
    paste: function (e) {
      e.preventDefault();
      e.stopPropagation();
      var pasteData = e.clipboardData.getData('text');
      if (!this._clipboard.length || pasteData !== this._clipboard[0]) {
        this.userAction('InsertText', pasteData);
      } else {
        this.userAction('InsertText', this._clipboard);
      }
      this.scrollToText();
    },
    keydown: function capture (e) {
      this._selecting = false;
      this._initialSelection = null;
      var preventDefaultAndStopPropagation = function () {
        e.preventDefault();
        e.stopPropagation();
      };
      var ctrlKey = !!(e.metaKey || ((isWindows() || isLinux()) && e.ctrlKey));
      var isModified = e.metaKey || e.ctrlKey || e.altKey;
      var key = (e.key || '').toLowerCase();
      var hotkey = [
        ['', 'ctrl'][ctrlKey | 0],
        ['', 'alt'][e.altKey | 0],
        ['', 'shift'][e.shiftKey | 0],
        key
      ].filter(function (v) { return !!v; }).join('+');
      var lang = this.getActiveLanguageDictionary();
      var fwdComplement = lang.forwardComplements[e.key] || '';
      var revComplement = lang.reverseComplements[e.key] || '';
      var strComplement = lang.stringComplements[e.key] || '';
      if (!key) {
        preventDefaultAndStopPropagation();
      } else if (
        ctrlKey && key === 'v' ||
        ctrlKey && key === 'x' ||
        ctrlKey && key === 'c' ||
        key.endsWith('lock') ||
        key.startsWith('control') ||
        key.startsWith('alt') ||
        key === 'contextmenu' ||
        key === 'altgraph' ||
        key === 'os' ||
        key === 'unidentified'
      ) {
        // Do nothing: allow native behavior
        //  Windows ContextMenu key,
        //  AltGraphic key and OS key,
        //  CapsLock
      } else if (this.hotkeys[hotkey]) {
        preventDefaultAndStopPropagation();
        this.shortcut(hotkey);
      } else if (key === 'backspace') {
        preventDefaultAndStopPropagation();
        if (e.altKey) {
          this.user.moveCursorsByWord(this.value, 'left', true);
          this.userAction('RemoveText', -1);
          this.scrollToText();
        } else {
          if (this.user.cursors.length > 1 || this.user.cursors[0].width()) {
            this.userAction('RemoveText', -1);
            this.scrollToText();
          } else {
            var selInfo = this.user.cursors[0].getSelectionInformation(this.value);
            var nextCharacter = this.value[this.user.cursors[0].selectionStart];
            var prevCharacter = this.value[this.user.cursors[0].selectionStart - 1];
            if (nextCharacter && nextCharacter === lang.forwardComplements[prevCharacter]) {
              this.user.moveCursors(this.value, 'right');
              this.userAction('RemoveText', -2);
              this.scrollToText();
            } else {
              for (var tabChars = 0; tabChars < lang.tabWidth; tabChars++) {
                if (selInfo.linesPrefix[selInfo.linesPrefix.length - tabChars - 1] === lang.tabChar) {
                  continue;
                } else {
                  break;
                }
              }
              if (tabChars) {
                var removeCount = ((selInfo.linesPrefix.length - tabChars) % lang.tabWidth) || tabChars;
                this.userAction('RemoveText', -removeCount);
                this.scrollToText();
              } else {
                this.userAction('RemoveText', -1);
                this.scrollToText();
              }
            }
          }
        }
      } else if (key === 'delete') {
        preventDefaultAndStopPropagation();
        if (e.altKey) {
          this.user.moveCursorsByWord(this.value, 'right', true);
          this.userAction('RemoveText', 1);
          this.scrollToText();
        } else {
          this.userAction('RemoveText', 1);
          this.scrollToText();
        }
      } else if (!isModified && key !== 'shift') {
        if (key === 'escape') {
          preventDefaultAndStopPropagation();
          this.user.resetCursor();
          if (this.control('find-replace').isVisible()) {
            this.control('find-replace').hide();
          }
          if (this._contextMenu) {
            this._contextMenu.close();
          }
          if (this._autocomplete) {
            this._autocomplete = null;
            this.dispatch('autocomplete', this, null, null, null);
          }
          this.dispatch('cancel', this);
        } else if (key === 'enter') {
          preventDefaultAndStopPropagation();
          if (this._autocomplete) {
            this.dispatch(
              'autocomplete/submit',
              this,
              this._autocomplete.name,
              this._autocomplete.result
            );
          } else {
            this.userAction('InsertText', '\n');
            this.scrollToText();
          }
        } else if (key === 'tab') {
          if (e.key.toLowerCase() === 'tab' && this.tabout) {
            return;
          } else {
            preventDefaultAndStopPropagation();
            if (this._autocomplete) {
              this.dispatch(
                'autocomplete/submit',
                this,
                this._autocomplete.name,
                this._autocomplete.result
              );
            } else if (e.shiftKey) {
              this.userAction('RemoveIndent');
            } else if (this.user.cursors.length <= 1 && !this.user.cursors[0].width()) {
              if (this._suggestion) {
                var selInfo = this.user.cursors[0].getSelectionInformation(this.value);
                this.user.moveCursors(this.value, 'right', selInfo.linesSuffix.length);
                this.userAction('InsertText', this._suggestion.value, this._suggestion.adjust, this._suggestion.cursorLength);
              } else {
                this.userAction('InsertText', lang.tabChar.repeat(lang.tabWidth));
              }
            } else {
              this.userAction('AddIndent');
            }
            this.scrollToText();
          }
        } else if (key.startsWith('arrow')) {
          preventDefaultAndStopPropagation();
          var direction = key.slice('arrow'.length);
          if (this._autocomplete && (direction === 'up' || direction === 'down')) {
            this.dispatch(
              'autocomplete/' + direction,
              this,
              this._autocomplete.name,
              this._autocomplete.result
            );
          } else {
            this.user.moveCursors(this.value, direction, 1, e.shiftKey);
            this.scrollToText();
          }
        } else if (key.startsWith('page')) {
          preventDefaultAndStopPropagation();
          this.scrollPage(key.slice('page'.length));
        } else if (key === 'end') {
          preventDefaultAndStopPropagation();
          this.user.moveCursorsByLine(this.value, 'right');
          this.scrollToText();
        } else if (key === 'home') {
          preventDefaultAndStopPropagation();
          this.user.moveCursorsByLine(this.value, 'left');
          this.scrollToText();
        } else if (this.user.cursors.length > 1 || this.user.cursors[0].width()) {
          preventDefaultAndStopPropagation();
          this.userAction('InsertText', e.key);
          this.scrollToText();
        } else if (
          revComplement &&
          this.value[this.user.cursors[0].selectionStart - 1] === revComplement
        ) {
          preventDefaultAndStopPropagation();
          if (this.value[this.user.cursors[0].selectionStart] === e.key) {
            this.user.moveCursors(this.value, 'right', 1);
          } else {
            this.userAction('InsertText', e.key);
          }
          this.scrollToText();
        } else if (
          fwdComplement &&
          this.value[this.user.cursors[0].selectionStart] !== fwdComplement
        ) {
          preventDefaultAndStopPropagation();
          this.userAction('InsertText', e.key + fwdComplement, -1);
          this.scrollToText();
        }
      }
    },
    scroll: function (e) {
      if (this._selecting) {
        this.__cursorEvent(e);
      } else {
        this.render(this.value);
      }
    },
    select: function (e) {
      if (this._selecting) {
        // do nothing
      } else if (
        this.inputElement.value.length &&
        this.inputElement.value.length === (this.inputElement.selectionEnd - this.inputElement.selectionStart)
      ) {
        // If we select it all at once, it's native SelectAll
        // NOTE: We have a rendering hack (denoted HACK:) that prevents this accidentally triggering
        this.select(0, this.value.length);
      } else {
        this.render(this.value);
      }
    }
  }
};

CPHEditor.prototype.__initialize__ = function (backoff) {
  // Only initialize if not hidden
  if (this.isVisible() && !this._initialized) {
    backoff = parseInt(backoff) || 0;

    var el = this.element();
    var initialized = true;
    while (el = el.parentNode) {
      if (el === document) {
        initialized = true;
        break;
      }
    }

    if (
      initialized && (
        document.readyState === 'complete' ||
        document.readyState === 'loaded' ||
        document.readyState === 'interactive'
      )
    ) {
      this._initialized = true;
      this.lineHeight = this.sampleLineElement.offsetHeight;
      this.paddingLeft = parseInt(window.getComputedStyle(this.inputElement, null).getPropertyValue('padding-left')) || 0;
      this.paddingTop = parseInt(window.getComputedStyle(this.inputElement, null).getPropertyValue('padding-top')) || 0;
      this.paddingBottom = parseInt(window.getComputedStyle(this.inputElement, null).getPropertyValue('padding-bottom')) || 0;
      this.setMaximized(this.maximized);
      this.height = this.textboxElement.offsetHeight;
      this.width = this.textboxElement.offsetWidth;
      this.render(this.value);
      // If DOM renders in asynchronously, repeat this...
      window.requestAnimationFrame(function () {
        this.lineHeight = this.sampleLineElement.offsetHeight;
        this.paddingLeft = parseInt(window.getComputedStyle(this.inputElement, null).getPropertyValue('padding-left')) || 0;
        this.paddingTop = parseInt(window.getComputedStyle(this.inputElement, null).getPropertyValue('padding-top')) || 0;
        this.paddingBottom = parseInt(window.getComputedStyle(this.inputElement, null).getPropertyValue('padding-bottom')) || 0;
        this.setMaximized(this.maximized);
        this.height = this.textboxElement.offsetHeight;
        this.width = this.textboxElement.offsetWidth;
        this.render(this.value, true);
      }.bind(this));
    } else if (!backoff) {
      window.requestAnimationFrame(this.__initialize__.bind(this, 1));
    } else {
      // Exponential backoff for initialization
      //  Prevents latency on huge page reflows when editor added dynamically
      setTimeout(this.__initialize__.bind(this, backoff * 2), backoff);
    }
  }
};

CPHEditor.prototype.__cursorEvent = function (e, createCursor, mouseup) {
  if (createCursor === true) {
    this.user.createCursor();
  } else if (createCursor === false) {
    this.user.resetCursor();
  }
  var cursor = this.user.cursors[0];
  var selection = {};
  if (mouseup) {
    this._initialSelection = null;
    this._selecting = false;
    this.user.collapseCursors();
    this.__renderSelection();
  } else {
    if (!this._selecting || !this._initialSelection) {
      selection.ltr = true;
      selection.selectionStart = this.virtualCursorOffset + this.inputElement.selectionStart;
      selection.selectionEnd = this.virtualCursorOffset + this.inputElement.selectionEnd;
      if (e && e.type === 'mousedown' && e.shiftKey) {
        // if continuing select
        selection.selectionStart = Math.min(cursor.selectionStart, selection.selectionStart);
        selection.selectionEnd = Math.max(cursor.selectionEnd, selection.selectionEnd);
        if (selection.selectionStart < cursor.selectionStart) {
          selection.ltr = false;
        }
      }
      selection.virtualCursorOffset = this.virtualCursorOffset;
      selection.inputStart = Math.max(1, this.inputElement.selectionStart); // HACK: SelectAll support
      selection.inputEnd = this.inputElement.selectionEnd;
      if (cursor.direction() === 'rtl') {
        cursor.select(selection.selectionEnd, selection.selectionStart);
      } else {
        cursor.select(selection.selectionStart, selection.selectionEnd);
      }
      this._initialSelection = selection;
    } else if (
      this._initialSelection.inputStart !== Math.max(1, this.inputElement.selectionStart) && // HACK: SelectAll support
      this.virtualCursorOffset <= this._initialSelection.virtualCursorOffset
    ) {
      // If the selectionStart is different and / or we're moving backwards...
      selection.ltr = false;
      selection.selectionStart = this.virtualCursorOffset + this.inputElement.selectionStart;
      selection.selectionEnd = this._initialSelection.selectionEnd;
      selection.inputStart = this.inputElement.selectionStart;
      selection.inputEnd = this.inputElement.selectionEnd;
      cursor.select(selection.selectionEnd, selection.selectionStart);
    } else {
      selection.ltr = true;
      selection.selectionStart = this._initialSelection.selectionStart;
      selection.selectionEnd = this.virtualCursorOffset + this.inputElement.selectionEnd;
      selection.inputStart = this.inputElement.selectionStart;
      selection.inputEnd = this.inputElement.selectionEnd;
      cursor.select(selection.selectionStart, selection.selectionEnd);
    }
    cursor.clamp(this.value);
  }
  // HACK: fixScrollTop is for Firefox
  this.fixScrollTop = this.inputElement.scrollTop;
  this.render(this.value);
};

/**
 * Show the editor (make it visible)
 */
CPHEditor.prototype.show = function () {
  // Initialize when first shown, if hidden to begin with
  Control.prototype.show.call(this, arguments);
  return this.__initialize__();
};

/**
 * Hide the editor (set display = none)
 */
CPHEditor.prototype.hide = function () {
  Control.prototype.hide.call(this, arguments);
};

/**
 * Determine whether the editor is focused, returns true if so
 * @returns {boolean}
 */
CPHEditor.prototype.hasFocus = function () {
  return document.activeElement === this.inputElement;
};

/**
 * Sets focus to the editor
 * @param {boolean} selectAll Whether or not to select entire contents of the editor
 */
CPHEditor.prototype.focus = function (selectAll) {
  this.inputElement.focus();
  selectAll && (this.select(0, this.value.length));
};

/**
 * Blurs the editor (removes focus)
 */
CPHEditor.prototype.blur = function () {
  this.inputElement.blur();
};

/**
 * Sets the language for the editor. This *does not* automatically re-render the editor.
 * @param {string} language The language to set, e.g. javascript. Must be supported in the languages dictionary
 * @returns {string}
 */
CPHEditor.prototype.setLanguage = function (language) {
  language = language || 'text';
  language = language + '';
  if (!this.languages.hasOwnProperty(language)) {
    console.warn('No Language Dictionary found: "' + language + '"');
  }
  this.language = language;
  this.selector('[data-language]').innerHTML = '&nbsp;' + safeHTML(this.language);
  return this.language;
};

/**
 * Retrieve the currently active language for the editor
 */
CPHEditor.prototype.getActiveLanguage = function () {
  return this.language;
};

/**
 * Retrieves the currently active language dictionary for the editor.
 * Languages are added via `CPHEditor.prototype.languages`.
 */
CPHEditor.prototype.getActiveLanguageDictionary = function () {
  return this.languages[this.language] || this.languages['text'];
};

/**
 * Retrieves the current value of the editor
 * @returns {string}
 */
CPHEditor.prototype.getValue = function () {
  return this.value;
};

/**
 * Sets the value of the editor. If a user has already performed an action,
 * this creates a history entry. This will trigger a re-render.
 * @param {string} value The value to set in the editor
 * @returns {string}
 */
CPHEditor.prototype.setValue = function (value) {
  if (!this._history.userActions.length) {
    this._history.initialValue = this.value = value;
  } else {
    this.value = value;
    this.userAction('NoOp');
  }
  this.render(this.value);
};

/**
 * Dispatches a "save" event and creates a history entry if the user has performed an action.
 * You can listen to this action via `editor.on('save', function (editor, value) { ... })`
 * @param {string} value The value to set in the editor
 * @returns {string}
 */
CPHEditor.prototype.save = function () {
  this.setValue(this.value);
  this.dispatch('save', this, this.value);
  return this.value;
};

/**
 * Clears all user action history. This *does not* re-render the editor.
 */
CPHEditor.prototype.clearHistory = function () {
  this._history.userActions = [];
  this._history.initialValue = this.value;
  this._historyIndex = -1;
};

/**
 * Navigate the user action history, forward or backward.
 * @param {integer} amount
 */
CPHEditor.prototype.gotoHistory = function (amount) {
  amount = parseInt(amount) || 0;
  var userActions = this._history.userActions;
  var historyIndex = this._historyIndex;
  while (userActions[historyIndex] && userActions[historyIndex].arguments[0] === 'NoOp') {
    historyIndex = historyIndex + Math.sign(amount);
  }
  historyIndex = Math.max(-1, Math.min(historyIndex + amount, userActions.length - 1));
  if (historyIndex !== this._historyIndex) {
    this._historyIndex = historyIndex;
    if (this._historyIndex === -1) {
      if (userActions[0]) {
        this.user.loadCursors(userActions[0].cursors);
      } else {
        this.user.loadCursors([new CPHCursor()]);
      }
      return this.render(this.value = this._history.initialValue);
    } else {
      this.value = this._history.initialValue;
      for (var i = this._historyIndex; i > 0; i--) {
        var userAction = userActions[i];
        if (userAction.value !== null) {
          break;
        }
      }
      for (i; i <= this._historyIndex; i++) {
        var userAction = userActions[i];
        this.user.loadCursors(userAction.cursors);
        this.value = this._userAction.apply(this, userAction.arguments.concat(userAction.value, true)); // replay
      }
      this.user.getSortedCursors().forEach(function (cursor) { cursor.clamp(this.value); }.bind(this));
      return this.scrollToText();
    }
  }
};

/**
 * Perform a user action. Specific user actions are available on the `CPHCursor`
 * object, prefixed with the word `calculate`.
 * @param {string} name The name of the user action to dispatch
 */
CPHEditor.prototype.userAction = function (name) {
  if (this.isReadOnly() || !this.isEnabled()) {
    this.animateNo();
  } else {
    var args = [].slice.call(arguments, 1);
    return this._userAction(
      name,
      args,
      this.getActiveLanguageDictionary(),
      this.value,
      false
    );
  }
};

/**
 * Emulate a user action. Use this when emulation mode is enabled.
 * Will throw an error if not in emulation mode.
 * Specific user actions are available on the `CPHCursor`
 * object, prefixed with the word `calculate`.
 * @param {string} name The name of the user action to dispatch
 */
CPHEditor.prototype.emulateUserAction = function (name) {
  if (!this._emulationMode) {
    throw new Error('Can only emulateUserAction in EmulationMode')
  } if (!this.isEnabled()) {
    this.animateNo();
  } else {
    var args = [].slice.call(arguments, 1);
    return this._userAction(
      name,
      args,
      this.getActiveLanguageDictionary(),
      this.value,
      false
    );
  }
};

CPHEditor.prototype._userAction = function (name, args, lang, value, replay) {
  value = typeof value === 'string' ? value : null;
  args = args.map(function (arg) { return arg === undefined ? null : arg; });
  lang = lang || this.getActiveLanguageDictionary();
  var actionName = 'calculate' + name;
  if (!CPHCursor.prototype.hasOwnProperty(actionName)) {
    throw new Error('Invalid user action: "' + name + '"');
  }
  if (!replay) {
    this._history.userActions = this._history.userActions.slice(0, this._historyIndex + 1);
    this._history.userActions.push({
      value: value,
      cursors: this.user.cursors.map(function (cursor) { return cursor.clone(); }),
      arguments: [name, args, lang]
    });
    this._historyIndex = this._history.userActions.length - 1;
  }
  value = value === null ? this.value : value;
  // We want to only edit the active area for text.
  // If we're dealing with a huge file (100k LOC),
  //  there's a huge performance bottleneck on string composition
  //  so work on the smallest string we need to while we perform a
  //  large number of cursor operations.
  var sortedCursors = this.user.getSortedCursors();
  var bigCursor = new CPHCursor(sortedCursors[0].selectionStart, sortedCursors[sortedCursors.length - 1].selectionEnd);
  var bigInfo = bigCursor.getSelectionInformation(value);
  var linesStartIndex = bigInfo.linesStartIndex;
  var linesEndIndex = bigInfo.linesEndIndex;
  if (name === 'RemoveText' && parseInt(args[0]) < 0) { // catch backspaces
    linesStartIndex += parseInt(args[0]);
    linesStartIndex = Math.max(0, linesStartIndex);
  } else if (name === 'InsertText') { // catch complements
    linesStartIndex -= 1;
    linesStartIndex = Math.max(0, linesStartIndex);
  }
  var startValue = value.slice(0, linesStartIndex);
  var editValue = value.slice(linesStartIndex, linesEndIndex);
  var endValue = value.slice(linesEndIndex);
  var editOffset = linesStartIndex;
  var offset = -editOffset;
  for (var i = 0; i < sortedCursors.length; i++) {
    var cursor = sortedCursors[i];
    cursor.move(offset);
    var result;
    if (name === 'InsertText' && Array.isArray(args[0])) {
      // Multi-cursor pase
      result = cursor[actionName](editValue, [args[0][i % args[0].length]], lang);
    } else {
      result = cursor[actionName](editValue, args, lang);
    }
    editValue = result.value;
    cursor.move(editOffset);
    cursor.selectRelative(result.selectRelative[0], result.selectRelative[1]);
    offset += result.offset;
  }
  value = startValue + editValue + endValue;
  if (!replay) {
    this.user.getSortedCursors().forEach(function (cursor) { cursor.clamp(value); });
    this.render(this.value = value);
  }
  return value;
};

/**
 * Renders the editor on the next available frame, if applicable.
 * Multiple calls to `.render` will not negatively impact performance, extra
 * calls are debounced.
 * @param {string} value The value to render within the editor, should typically be `editor.value` or `editor.getValue()`
 * @param {boolean} forceRender Force an update on the next frame
 */
CPHEditor.prototype.render = function (value, forceRender) {
  if (this._initialized) {
    this._renderQueue.push(value);
    if (!this.maximized) {
      var lines = value.split('\n');
      this.height = this.paddingTop +
        this.paddingBottom +
        (Math.max(this.rows, Math.min(this.maxrows, lines.length)) * this.lineHeight);
      var viewportValue = [this.width, this.height].join(',');
      if (viewportValue !== this._lastViewportValue) {
        this.textboxElement.style.height = this.height + 'px';
      }
    }
    window.requestAnimationFrame(function () {
      if (this._renderQueue.length) {
        value = this._renderQueue.pop();
        this._renderQueue = [];
        var lastValue = this._lastValue;
        var findValue = JSON.stringify(this._find) + '/' + (this._findRE ? this._findRE.toString() : '');
        var cursorStateValue = this.createCursorStateValue(this.user.cursors, this._errorPos);
        var scrollValue = [this.inputElement.scrollLeft, Math.max(0, this.inputElement.scrollTop + this.fixScrollTop)].join(',');
        var viewportValue = [this.width, this.height].join(',');
        var valueChanged = (value !== lastValue);
        var cursorStateValueChanged = (cursorStateValue !== this._lastStateValue);
        var scrollValueChanged = (scrollValue !== this._lastScrollValue);
        var viewportChanged = (viewportValue !== this._lastViewportValue);
        var findValueChanged = (findValue !== this._lastFindValue);
        var ti = [function () {}, new timeit()][this.debug | 0];
        if (valueChanged) {
          // Tells you whether you're in a comment or a string...
          this.__populateStringLookup();
          // Reset error state
          this._errorPos.enabled = false;
        }
        if (cursorStateValueChanged) {
          var cursor = this.user.cursors[0];
          this._autocomplete = null;
          if (this.canSuggest() && this.hasFocus()) {
            var sel = cursor.getSelectionInformation(value);
            var inString = this.inString(cursor.selectionStart);
            var inComment = this.inComment(cursor.selectionStart);
            var inBlock = this.inBlock(cursor.selectionStart);
            var names = Object.keys(this._autocompleteFns);
            for (var i = 0; i < names.length; i++) {
              var name = names[i];
              var enableFn = this._autocompleteFns[name];
              var result = enableFn(this, sel, inString, inComment, inBlock);
              if (!!result) {
                this._autocomplete = {name: name, result: result};
                break;
              }
            }
          }
        }
        if (
          forceRender ||
          valueChanged ||
          cursorStateValueChanged ||
          scrollValueChanged ||
          viewportChanged ||
          findValueChanged
        ) {
          this.__render(
            value,
            (valueChanged || forceRender),
            (cursorStateValueChanged || forceRender),
            scrollValueChanged,
            (viewportChanged || forceRender),
            findValueChanged
          );
          ti('render complete!');
        }
        if (valueChanged) {
          this.dispatch('change', this, value, this.user.cursors.slice());
          this._inputDelayTimeout && clearTimeout(this._inputDelayTimeout);
          this._inputDelayTimeout = setTimeout(function () {
            this._inputDelayTimeout = null;
            this.dispatch('waiting', this, value, this.user.cursors.slice());
          }.bind(this), this._inputDelay);
        }
        if (cursorStateValueChanged) {
          this.dispatch('cursor', this, value, this.user.cursors.slice());
          var cursor = this.user.cursors[0];
          if (this.user.cursors.length === 1 && !cursor.width()) {
            this.dispatch('singlecursor', this, value, cursor);
          } else {
            this.dispatch('multicursor', this, value, this.user.cursors.slice());
          }
          if (this._autocomplete) {
            var borderEl = this.selector('.selection .border');
            if (borderEl) {
              this.dispatch(
                'autocomplete',
                this,
                this._autocomplete.name,
                this._autocomplete.result,
                borderEl.getBoundingClientRect()
              );
            } else {
              this.dispatch('autocomplete', this, null, null, null);
            }
          } else {
            this.dispatch('autocomplete', this, null, null, null);
          }
        }
        this._lastValue = value;
        this._lastStateValue = cursorStateValue;
        this._lastScrollValue = scrollValue;
        this._lastViewportValue = viewportValue;
        this._lastFindValue = findValue;
      }
    }.bind(this));
    return value;
  }
};

CPHEditor.prototype.__renderFindReplace = function () {
  var firstOffset = -1;
  var firstValue = '';
  var lastOffset = -1;
  var lastValue = '';
  var prevIndex = -1;
  var prevValue = '';
  var nextIndex = -1;
  var nextValue = '';
  var currentIndex = -1;
  var currentValue = '';
  var count = 0;
  var currentCount = 0;
  var cursor = this.user.cursors[0];
  if (this._find.value) {
    this.value.replace(this._findRE, function ($0, offset) {
      count++;
      if (offset === cursor.selectionStart && cursor.width() === $0.length) {
        currentCount = count;
        currentIndex = offset;
        currentValue = $0;
      }
      if (offset + $0.length <= cursor.selectionStart) {
        prevIndex = offset;
        prevValue = $0;
      }
      if (nextIndex === -1 && offset >= cursor.selectionEnd) {
        nextIndex = offset;
        nextValue = $0;
      }
      if (firstOffset === -1) {
        firstOffset = offset;
        firstValue = $0;
      }
      lastOffset = offset;
      lastValue = $0;
    });
    if (firstOffset > -1) {
      if (prevIndex === -1) {
        prevIndex = lastOffset;
        prevValue = lastValue;
      }
      if (nextIndex === -1) {
        nextIndex = firstOffset;
        nextValue = firstValue;
      }
    }
  }
  this._find.currentIndex = currentIndex;
  this._find.currentValue = currentValue;
  this._find.prevIndex = prevIndex;
  this._find.prevValue = prevValue;
  this._find.nextIndex = nextIndex;
  this._find.nextValue = nextValue;
  this.control('find-replace').setPosition(currentCount, count);
};

CPHEditor.prototype.__renderSelection = function (force) {
  var cursor = this.user.cursors[0];
  var frameValue = this.inputElement.value;
  // HACK: Offset by 1 to support SelectAll:
  //  if everything gets selected we know it was a "SelectAll" from user menu
  var selectionStart = Math.min(
    frameValue.length,
    Math.max((!isMobile() | 0), cursor.selectionStart - this.virtualCursorOffset)
  );
  var selectionEnd = Math.min(
    frameValue.length,
    Math.max((!isMobile() | 0), cursor.selectionEnd - this.virtualCursorOffset)
  );
  if (
    force ||
    selectionStart !== this.inputElement.selectionStart ||
    selectionEnd !== this.inputElement.selectionEnd
  ) {
    isMobile() && (this._preventMobileSelection = true);
    this.inputElement.setSelectionRange(
      selectionStart,
      selectionEnd,
      cursor.position >= cursor.pivot
        ? 'forward'
        : 'backward'
    );
  }
};

CPHEditor.prototype.__setScroll = function (scrollTop, scrollLeft) {
  if (
    scrollTop > -1 &&
    Math.min(
      scrollTop,
      this.inputElement.scrollHeight - this.inputElement.offsetHeight
    ) !== this.inputElement.scrollTop
  ) {
    this.inputElement.scrollTop = scrollTop;
  }
  if (
    scrollLeft > -1 &&
    Math.min(
      scrollLeft,
      this.inputElement.scrollWidth - this.inputElement.offsetWidth
    ) !== this.inputElement.scrollLeft
  ) {
    this.inputElement.scrollLeft = scrollLeft
  }
};

CPHEditor.prototype.__render = function (
  value,
  valueChanged,
  cursorStateValueChanged,
  scrollValueChanged,
  viewportChanged,
  findValueChanged,
  recursive
) {

  // HACK: fixScrollTop is for Firefox
  if (
    this.fixScrollTop !== -1 &&
    this.fixScrollTop !== this.inputElement.scrollTop
  ) {
    this.inputElement.scrollTop = this.fixScrollTop;
    this.fixScrollTop = -1;
  }

  // Get constants, can grab them on the fly.
  this.lineHeight = this.sampleLineElement.offsetHeight;
  this.height = this.textboxElement.offsetHeight;
  this.width = this.textboxElement.offsetWidth;
  var top = this.virtualTop + this.inputElement.scrollTop;
  var left = this.inputElement.scrollLeft;

  // Determine the visible line count.
  // Also determine where the view is focused (top and bottom)
  var lines = this.value.split('\n');
  var visibleLineCount = Math.ceil((this.height - (this.paddingTop + this.paddingBottom)) / this.lineHeight) + 1;
  var focusStartLineIndex = Math.max(0, Math.floor(top / this.lineHeight));
  var focusEndLineIndex = Math.min(lines.length, focusStartLineIndex + visibleLineCount);

  // Set max line
  if (valueChanged) {
    this._maxLine = lines.reduce(function (cur, line) { return [line, cur][(line.length < cur.length) | 0] }, '');
  }

  // Split total text chunk into frames.
  // We'll selectively render the visible elements
  //  (textarea, render block) from these.
  var frameCount = Math.ceil(lines.length / visibleLineCount);
  var frameIndex = Math.max(0, Math.min(Math.floor(focusStartLineIndex / visibleLineCount), lines.length - 1));
  var reduceFrames = function (frames) {
    frames = frames.map(function (f) { return Math.max(0, Math.min(f, lines.length - 1)); });
    while (frames.length > 1 && frames[frames.length - 1] === frames[frames.length - 2]) {
      frames.pop();
    }
    while (frames.length > 1 && frames[0] === frames[1]) {
      frames.shift();
    }
    return frames;
  };
  var frames = reduceFrames([frameIndex - 2, frameIndex - 1, frameIndex, frameIndex + 1, frameIndex + 2]);

  // First we'll populate the textarea.
  //  We basically render sections of text like [-2, -1, 0, 1, 2]
  //  i.e. 5x the visible area above and below,
  //  so there's not too much text being rendered at once...
  var frameLines = lines.slice(frames[0] * visibleLineCount, (frames[frames.length - 1] + 1) * visibleLineCount);
  var frameValue = frameLines.join('\n');
  var scrollTop = -1;
  var scrollLeft = -1;
  if (frameIndex !== this.virtualFrameIndex) {
    this.inputElement.value = frameCount > frames.length
      ? frameValue + '\n' + this._maxLine
      : frameValue;
    if (frames[0] !== this.virtualFrameStartIndex) {
      var delta = frameIndex - this.virtualFrameIndex;
      scrollTop = top - this.virtualTop - (delta * visibleLineCount * this.lineHeight);
    } else {
      scrollTop = top - this.virtualTop;
    }
    scrollLeft = left;
    this.virtualTop = frames[0] * visibleLineCount * this.lineHeight;
    this.virtualFrameCount = frames.length;
    this.virtualFrameStartIndex = frames[0];
    this.virtualFrameIndex = frameIndex;
    this.virtualCursorOffset = frames[0]
      ? lines.slice(0, frames[0] * visibleLineCount).join('\n').length + 1 // newline offset
      : 0;
    this._lastFrameValue = frameValue;
    this.__renderSelection();
    window.requestAnimationFrame(function () { // Firefox fix
      this.__setScroll(top - this.virtualTop, left);
    }.bind(this));
  } else if (this._lastFrameValue !== frameValue) {
    this.inputElement.value = frameCount > frames.length
      ? frameValue + '\n' + this._maxLine
      : frameValue;
    scrollTop = top - this.virtualTop;
    scrollLeft = left;
    this.virtualCursorOffset = frames[0]
      ? lines.slice(0, frames[0] * visibleLineCount).join('\n').length + 1 // newline offset
      : 0;
    this._lastFrameValue = frameValue;
    this.__renderSelection();
    window.requestAnimationFrame(function () { // Firefox fix
      this.__setScroll(top - this.virtualTop, left);
    }.bind(this));
  } else {
    this.virtualCursorOffset = frames[0]
      ? lines.slice(0, frames[0] * visibleLineCount).join('\n').length + 1 // newline offset
      : 0;
  }
  this.__setScroll(scrollTop, scrollLeft);
  if (!recursive && this.virtualTop + this.inputElement.scrollTop !== top) {
    // If we changed the scrolltop, render again.
    //  This is to recalculate visible lines and make sure the rendering
    //  doesn't "bounce"
    return this.__render(
      value,
      valueChanged,
      cursorStateValueChanged,
      scrollValueChanged,
      viewportChanged,
      findValueChanged,
      true
    );
  }

  // Update the find and replace...
  if (valueChanged || cursorStateValueChanged || findValueChanged) {
    this.__renderFindReplace();
  }

  // Now, we only render the lines that the user can see
  var renderStartLineIndex = focusStartLineIndex;
  var renderEndLineIndex = focusEndLineIndex;
  var renderLines = lines.slice(renderStartLineIndex, renderEndLineIndex);

  // Next, we'll create necessary <div> elements for the lines
  //  and line numbers on the fly as we need (or don't) need them.
  // Usually this is a no-op.
  var lineElements = this.lineElements;
  var lineNumberElements = this.lineNumberElements;
  var lineFragment = null;
  var lineNumberFragment = null;
  while (lineElements.length < renderLines.length) {
    lineFragment = lineFragment || document.createDocumentFragment();
    lineNumberFragment = lineNumberFragment || document.createDocumentFragment();
    var lineElement = this.create(
      'div',
      ['line'],
      {
        offset: lineElements.length,
        style: 'top: ' + (lineElements.length * this.lineHeight) + 'px'
      }
    );
    lineFragment.appendChild(lineElement);
    lineElements.push(lineElement);
    var lineNumberElement = this.create(
      'div',
      ['number'],
      {
        offset: lineNumberElements.length,
        style: 'top: ' + (lineNumberElements.length * this.lineHeight) + 'px'
      }
    )
    lineNumberFragment.appendChild(lineNumberElement);
    lineNumberElements.push(lineNumberElement);
  }
  lineFragment && this.renderElement.appendChild(lineFragment);
  lineNumberFragment && this.numbersElement.appendChild(lineNumberFragment);
  while (lineElements.length > renderLines.length) {
    var lineElement = lineElements.pop()
    lineElement.parentNode.removeChild(lineElement);
    var lineNumberElement = lineNumberElements.pop()
    lineNumberElement.parentNode.removeChild(lineNumberElement);
  }

  // Only re-render if the value changed, you've scrolled enough to hit a new
  // render start, or the cursor selection has changed
  // This prevents re-rendering when all we really want to do is translateX / translateY
  if (
    valueChanged ||
    cursorStateValueChanged ||
    viewportChanged ||
    findValueChanged ||
    this._lastRenderStartLineIndex !== renderStartLineIndex
  ) {
    var renderCursorOffset = renderStartLineIndex
      ? lines.slice(0, renderStartLineIndex).join('\n').length + 1 // newline offset
      : 0;
    var cursors = this.user.collapseCursors(true);
    // find complements
    var complements = [-1, -1];
    if (
      (valueChanged || cursorStateValueChanged) &&
      this.user.cursors.length === 1 && !this.user.cursors[0].width()
    ) {
      complements = this.findComplements(this.value, this.user.cursors[0].selectionStart);
    }
    // should we show suggestions?
    this._suggestion = null;
    var shouldSuggest = (
      !this._autocomplete &&
      this.canSuggest() &&
      !this.inComment(cursors[0].selectionStart) &&
      !this.inString(cursors[0].selectionStart)
    );
    for (var i = 0; i < renderLines.length; i++) {
      var line = renderLines[i];
      var selectionPts = [];
      var selected = false;
      var highlighted = false;
      var lineError = (
        (
          !this._autocomplete &&
          this._errorPos.lineIndex === (renderStartLineIndex + i) &&
          this._errorPos.enabled
        )
          ? this._errorPos
          : null
      );
      // Find selection points in the current line...
      for (var ci = 0; ci < cursors.length; ci++) {
        var c = cursors[ci];
        var unbound = c.selectionStart < renderCursorOffset && c.selectionEnd > renderCursorOffset + line.length;
        var lbound = c.selectionStart >= renderCursorOffset && c.selectionStart <= renderCursorOffset + line.length;
        var rbound = c.selectionEnd >= renderCursorOffset && c.selectionEnd <= renderCursorOffset + line.length;
        if (unbound) {
          selected = true;
          selectionPts.push([0, line.length, '', c.direction()]);
        } else if (lbound && rbound) {
          selected = true;
          selectionPts.push([c.selectionStart - renderCursorOffset, c.selectionEnd - renderCursorOffset, 'lb rb', c.direction()]);
          if (!c.width()) {
            highlighted = true;
          }
        } else if (lbound) {
          selected = true;
          selectionPts.push([c.selectionStart - renderCursorOffset, line.length, 'lb', c.direction()]);
        } else if (rbound) {
          selected = true;
          selectionPts.push([0, c.selectionEnd - renderCursorOffset, 'rb', c.direction()]);
        }
      }
      // Suggest something to autocomplete if we're in the line and cursor criteria met
      var suggestion = null;
      if (selectionPts.length && shouldSuggest) {
        suggestion = this.codeCompleter.suggest(line, this.language);
        this._suggestion = suggestion;
      }
      var lineNumber = (renderStartLineIndex + i + 1);
      var formattedLine = this.format(
        renderCursorOffset,
        lineNumber,
        line,
        selectionPts,
        highlighted,
        suggestion,
        complements.slice(),
        lineError,
        (
          this._find.value
            ? this._findRE
            : null
        )
      );
      if (formattedLine !== lineElements[i].innerHTML) {
        lineElements[i].innerHTML = formattedLine;
      }
      if (lineNumber !== lineNumberElements[i].innerHTML) {
        lineNumberElements[i].innerHTML = lineNumber;
      }
      if (selected && !lineNumberElements[i].classList.contains('selected')) {
        lineNumberElements[i].classList.add('selected');
      } else if (!selected && lineNumberElements[i].classList.contains('selected')) {
        lineNumberElements[i].classList.remove('selected');
      }
      if (lineError) {
        lineNumberElements[i].classList.add('error');
      } else if (!lineError && lineNumberElements[i].classList.contains('error')) {
        lineNumberElements[i].classList.remove('error');
      }
      renderCursorOffset += renderLines[i].length + 1;
    }
    this._lastRenderStartLineIndex = renderStartLineIndex;
  }

  // Translate the render layer based on scroll position...
  var topOffset = top % this.lineHeight;
  var maxHeight = lines.length * this.lineHeight;
  var height = this.verticalScrollAreaElement.offsetHeight;
  var scrollerHeight = Math.min(
    height,
    Math.max(this._minScrollerSize, (height / maxHeight) * height)
  );
  var scrollerTranslateY = (top / (maxHeight - height)) * (height - scrollerHeight);
  if (
    scrollerHeight < height &&
    scrollValueChanged
  ) {
    this.verticalScrollerElement.classList.add('scrolling');
    clearTimeout(this._verticalScrollerTimeout);
    if (!this._verticalScrollerGrab) {
      this._verticalScrollerTimeout = setTimeout(function () {
        this.verticalScrollerElement.classList.remove('scrolling');
        this.verticalScrollerElement.classList.remove('manual');
      }.bind(this), 1000);
    }
  }
  var maxWidth = this.inputElement.scrollWidth;
  var width = this.horizontalScrollAreaElement.offsetWidth;
  var scrollerWidth = Math.min(
    width,
    Math.max(this._minScrollerSize, (width / maxWidth) * width)
  );
  var scrollerTranslateX = (left / (maxWidth - width)) * (width - scrollerWidth);
  if (
    scrollerWidth < width &&
    scrollValueChanged
  ) {
    this.horizontalScrollerElement.classList.add('scrolling');
    clearTimeout(this._horizontalScrollerTimeout);
    if (!this._horizontalScrollerGrab) {
      this._horizontalScrollerTimeout = setTimeout(function () {
        this.horizontalScrollerElement.classList.remove('scrolling');
        this.horizontalScrollerElement.classList.remove('manual');
      }.bind(this), 1000);
    }
  }
  var translateRenderLayer = function () {
    this.verticalScrollerElement.style.height = scrollerHeight + 'px';
    this.verticalScrollerElement.style.transform = 'translate3d(0px, ' + scrollerTranslateY + 'px, 0px)';
    this.horizontalScrollerElement.style.width = scrollerWidth + 'px';
    this.horizontalScrollerElement.style.transform = 'translate3d(' + scrollerTranslateX + 'px, 0px, 0px)';
    this.renderElement.style.transform = 'translate3d(' + (-(left)) + 'px, ' + (-topOffset) + 'px, 0px)';
    this.limitElement.style.transform = 'translate3d(' + (-(left)) + 'px, 0px, 0px)';
    this.numbersElement.style.transform = 'translate3d(0px, ' + (-topOffset) + 'px, 0px)';
    if (left > 0) {
      this.lineContainerElement.classList.add('scrolled-x');
    } else {
      this.lineContainerElement.classList.remove('scrolled-x');
    }
  }.bind(this);

  // Doubling up helps visible render fidelity.
  //  Prevent jank when scrolling.
  //  Also used to sync cursor blinking rate.
  translateRenderLayer();
  this.renderElement.classList.remove('blink');
  window.requestAnimationFrame(function () {
    translateRenderLayer();
    this.renderElement.classList.add('blink');
  }.bind(this));

};

/**
 * Sets a custom formatter for a language. Custom formatter functions take the
 * form `function (line, inString, inComment) { ... }` where `inString` and
 * `inComment` are determined by the language dictionary.
 * @param {string} language The language the formatter applies to
 * @param {function} fn The formatter function
 */
CPHEditor.prototype.setFormatter = function (language, fn) {
  if (typeof fn !== 'function') {
    throw new Error('.setFormatter fn must be a function');
  }
  this.formatters[language] = fn;
  return language;
};

/**
 * Retrieves the formatter function for a language or return the `text`
 * formatter if it is not found.
 * @param {string} language The language of the formatter
 */
CPHEditor.prototype.getFormatter = function (language) {
  var formatter = this.formatters[language];
  if (!formatter) {
    formatter = this.formatters['text'];
  }
  return formatter;
};

/**
 * Retrieves the active formatter function based on the active language
 */
CPHEditor.prototype.getActiveFormatter = function () {
  return this.getFormatter(this.language);
};

CPHEditor.prototype.format = function (
  offset, lineNumber, value,
  selectionPts, highlighted,
  suggestion, complements, lineError, findRE
) {
  // This makes sure we're in a continuous string, and not starting
  //  a new line with a string character
  var inComment = this.inComment(offset) && this.inComment(offset - 1);
  var inString = this.inString(offset) && this.inString(offset - 1);
  var inBlock = this.inBlock(offset) && this.inBlock(offset - 1);
  if (complements[0] === -1 || complements[0] < offset || complements[0] > offset + value.length) {
    complements.shift();
  }
  if (complements[1] === -1 || complements[1] < offset || complements[1] > offset + value.length) {
    complements.pop();
  }
  var cacheLine = JSON.stringify([].slice.call(arguments, 1, 8).concat((findRE || '').toString(),inComment, inString));
  if (this._formatCache[lineNumber] && this._formatCache[lineNumber][0] === cacheLine) {
    return this._formatCache[lineNumber][1];
  } else {
    var line = value;
    var formatted;
    formatted = this.getActiveFormatter()(line, inString, inComment, inBlock);
    var complementLine = complements.reduce(function (complementLine, n) {
      if (n >= offset && n < offset + value.length) {
        var i = n - offset;
        complementLine.line += (
          safeHTML(line.slice(complementLine.index, i)) +
          '<span class="underline' + (complements[1] === -1 ? ' no-match' : '') + '">' +
          safeHTML(line[i]) +
          '</span>'
        );
        complementLine.index = i + 1;
      }
      return complementLine;
    }, {line: '', index: 0}).line;
    this._formatCache[lineNumber] = [
      cacheLine,
      (
        '<div class="display">' +
          formatted.replace(/^(\t| )+/gi, function ($0) {
            return '<span class="whitespace">' + $0.replace(/\t/gi, '&rarr;&nbsp;').replace(/ /gi, '&middot;') + '</span>';
          }) +
          (
            suggestion
              ? ('<span class="suggestion">' + safeHTML(suggestion.value.replace(/\t/gi, '&rarr; ')).replace(/ /gi, '&middot;').replace(/\n/gi, '↵') + '</span>')
              : ''
          ) +
        '</div>' +
        (
          complementLine
            ? ('<div class="complement">' + complementLine + '</div>')
            : ''
        ) +
        (
          lineError
            ? ('<div class="line-error">' + safeHTML(line.slice(0, lineError.column)) + '<span class="underline">' + safeHTML((line[lineError.column] || '')) + '</span></div>')
            : ''
        ) +
        (
          (selectionPts.length || lineError)
            ? (
                '<div class="selection">' +
                selectionPts.reduce(function (acc, pt) {
                  acc.str = (
                    acc.str +
                    '<span class="spacer">' + safeHTML(value.slice(acc.index, pt[0])) + '</span>' +
                    '<span class="border ' + pt[2] + ' ' + pt[3] + ' length-' + (pt[1] - pt[0]) + '">' +
                      (pt[2] ? '<div class="focus"></div>' : '') +
                      safeHTML(value.slice(pt[0], pt[1])) +
                    '</span>'
                  );
                  acc.index = pt[1];
                  return acc;
                }, {str: '', index: 0}).str +
                '</div>'
              )
            : ''
        ) +
        (
          findRE
            ? ('<div class="find">' + safeHTML(line.replace(findRE, '~~~[~~~$&~~~]~~~')).replace(/~~~\[~~~(.*?)~~~\]~~~/gi, '<span class="found">$1</span>') + '</div>')
            : ''
        ) +
        (
          (highlighted || lineError)
            ? '<div class="line-selection' + (highlighted ? ' highlight' : '') + (lineError ? ' error' : '') + '"></div>'
            : ''
        )
      )
    ];
    return this._formatCache[lineNumber][1];
  }
};

/**
 * Scrolls to the currently selected text in the editor. This *will* trigger
 * a re-render.
 */
CPHEditor.prototype.scrollToText = function () {

  this.__renderSelection(true);

  this.lineHeight = this.sampleLineElement.offsetHeight;
  this.height = this.textboxElement.offsetHeight;
  this.width = this.textboxElement.offsetWidth;
  this.paddingLeft = this.paddingLeft ||
    parseInt(window.getComputedStyle(this.inputElement, null).getPropertyValue('padding-left')) || 0;
  this.paddingTop = this.paddingTop ||
    parseInt(window.getComputedStyle(this.inputElement, null).getPropertyValue('padding-top')) || 0;
  this.paddingBottom = this.paddingBottom ||
    parseInt(window.getComputedStyle(this.inputElement, null).getPropertyValue('padding-bottom')) || 0;

  var cursor = this.user.cursors[0];

  var lines = this.value.split('\n');
  var visibleLineCount = Math.ceil((this.height - (this.paddingTop + this.paddingBottom)) / this.lineHeight);
  var startLineIndex = this.value.slice(0, cursor.selectionStart).split('\n').length - 1;
  var endLineIndex = this.value.slice(0, cursor.selectionEnd).split('\n').length;
  var selectedLines = this.value.slice(cursor.selectionStart, cursor.selectionEnd).split('\n');
  var lineCount = endLineIndex - startLineIndex;

  var widthLines = this.value.slice(
    this.value.slice(0, cursor.selectionStart).lastIndexOf('\n') + 1,
    cursor.selectionEnd
  ).split('\n');
  var maxLine = widthLines.reduce(function (maxLine, line) {
    return maxLine.length > line.length
      ? maxLine
      : line
  }, '');
  this.sampleLineElement.innerHTML = maxLine;
  var width = this.sampleLineElement.offsetWidth;
  var cursorLeftLine = this.value.slice(
    this.value.slice(0, cursor.selectionStart).lastIndexOf('\n') + 1,
    cursor.selectionStart
  );
  this.sampleLineElement.innerHTML = cursorLeftLine;
  var leftOffset = this.sampleLineElement.offsetWidth - (this.paddingLeft * 2);
  if (width - this.width > this.inputElement.scrollLeft) {
    this.inputElement.scrollLeft = width - this.width;
    window.requestAnimationFrame(function () {
      this.inputElement.scrollLeft = width - this.width;
    }.bind(this));
  } else if (leftOffset < this.inputElement.scrollLeft) {
    this.inputElement.scrollLeft = leftOffset;
    window.requestAnimationFrame(function () {
      this.inputElement.scrollLeft = leftOffset;
    }.bind(this));
  }

  var top = this.virtualTop + this.inputElement.scrollTop;
  var yOffset = [
    startLineIndex * this.lineHeight - this.paddingTop,
    endLineIndex * this.lineHeight + this.paddingBottom
  ];
  var deltaOffset = yOffset[1] - yOffset[0];
  var useOffset = cursor.direction() === 'ltr' ? yOffset[1] : yOffset[0];

  if (selectedLines.length <= 1) {
    if (yOffset[1] > top + this.height) {
      this.scrollToLine(endLineIndex - visibleLineCount + 1);
    } else if (yOffset[0] < top) {
      this.scrollToLine(startLineIndex);
    } else {
      this.render(this.value);
    }
  } else {
    if (useOffset > top + this.height) {
      this.scrollToLine(endLineIndex - visibleLineCount + 1);
    } else if (useOffset < top) {
      this.scrollToLine(startLineIndex);
    } else {
      this.render(this.value);
    }
  }

};

/**
 * Scrolls to a specific line index in the editor. This *will* trigger a
 * re-render.
 * @param {integer} index The line index to scroll to
 */
CPHEditor.prototype.scrollToLine = function (index) {
  this.lineHeight = this.sampleLineElement.offsetHeight;
  this.height = this.textboxElement.offsetHeight;
  var visibleLineCount = Math.ceil((this.height - (this.paddingTop + this.paddingBottom)) / this.lineHeight) + 1;
  var lines = this.value.split('\n');
  var index = Math.max(0, Math.min(index, lines.length - 1));
  var frameCount = Math.ceil(lines.length / visibleLineCount);
  var frameIndex = Math.max(0, Math.min(Math.floor(index / visibleLineCount), lines.length - 1));
  var frames = [frameIndex - 2, frameIndex - 1, frameIndex, frameIndex + 1, frameIndex + 2];
  frames = frames.map(function (f) { return Math.max(0, Math.min(f, lines.length - 1)); });
  while (frames.length > 1 && frames[frames.length - 1] === frames[frames.length - 2]) {
    frames.pop();
  }
  while (frames.length > 1 && frames[0] === frames[1]) {
    frames.shift();
  }
  var frameLines = lines.slice(frames[0] * visibleLineCount, (frames[frames.length - 1] + 1) * visibleLineCount);
  var frameValue = frameLines.join('\n');
  this.virtualTop = frames[0] * visibleLineCount * this.lineHeight;
  this.virtualFrameCount = frames.length;
  this.virtualFrameStartIndex = frames[0];
  this.virtualFrameIndex = frameIndex;
  this.virtualCursorOffset = frames[0]
    ? lines.slice(0, frames[0] * visibleLineCount).join('\n').length + 1 // newline offset
    : 0;
  this.inputElement.value = frameCount > frames.length
    ? frameValue + '\n' + this._maxLine
    : frameValue;
  // HACK: fixScrollTop is for Firefox
  this.fixScrollTop = this.inputElement.scrollTop = (index - frames[0] * visibleLineCount) * this.lineHeight;
  this.render(this.value);
};

/**
 * Scrolls the editor by a visible "page" amount based on the height of the
 * editor. This *will* trigger a re-render.
 * @param {string} direction Either "up" or "down"
 */
CPHEditor.prototype.scrollPage = function (direction) {
  this.lineHeight = this.sampleLineElement.offsetHeight;
  this.height = this.textboxElement.offsetHeight;
  var visibleLineCount = Math.ceil((this.height - (this.paddingTop + this.paddingBottom)) / this.lineHeight) + 1;
  var index = Math.floor((this.virtualTop + this.inputElement.scrollTop) / this.lineHeight);
  if (direction === 'up') {
    this.scrollToLine(index - (visibleLineCount - 2));
  } else if (direction === 'down') {
    this.scrollToLine(index + (visibleLineCount - 2));
  }
};

/**
 * Scrolls the editor to a specific [x, y] coordinate from the top left of
 * the editor. This *will* trigger a re-render.
 * @param {integer} x the x coordinate (from left)
 * @param {integer} y the y coordinate (from top)
 */
CPHEditor.prototype.scrollTo = function (x, y) {
  if (x === undefined || x === null) {
    x = this.inputElement.scrollLeft;
  }
  if (y === undefined || y === null) {
    y = this.virtualTop + this.inputElement.scrollTop;
  }
  x = Math.max(0, parseInt(x) || 0);
  y = Math.max(0, parseInt(y) || 0);
  var index = Math.floor(y / this.lineHeight);
  var remainder = y % this.lineHeight;
  this.scrollToLine(index);
  this.fixScrollTop += remainder;
  this.inputElement.scrollLeft = x;
  this.render(this.value);
};

CPHEditor.prototype.createCursorStateValue = function (cursors, errorPos) {
  errorPos = errorPos || null;
  hasFocus = this.hasFocus();
  return JSON.stringify([cursors, errorPos, hasFocus]);
};

/**
 * Selects text in the editor at a specific start and end index.
 * This *will* trigger a re-render.
 * @param {integer} start The start index to select
 * @param {integer} end The end index to select
 */
CPHEditor.prototype.select = function (start, end) {
  this.user.resetCursor();
  this.user.cursors[0].select(start, end);
  this.user.cursors[0].clamp(this.value);
  this.render(this.value);
};

CPHEditor.prototype.__populateStringLookup = function (callback) {
  // Populates a sample string to identify whether position is in a string
  // or comment. Takes single escapes into consideration.
  // This is fast hack that removes the need for a parse tree.
  var commentChar = String.fromCharCode(0);
  var blockChar = String.fromCharCode(1);
  var value = this.value;
  var len = value.length;
  var lang = this.getActiveLanguageDictionary();
  var commentRE = new RegExp(
    (
      '(' +
      Object.keys(lang.comments)
        .map(function (c) {
          var isMultiLine = lang.comments[c] !== '\n';
          var start = c.split('').map(function (c) { return '\\' + c; }).join('');
          var end = lang.comments[c].split('').map(function (c) { return '\\' + c; }).join('');
          return start + '[\\s\\S]*?(' + end + '|$)';
        }).join('|') +
      ')'
    ),
    'gi'
  );
  var blockRE = new RegExp(
    (
      '(' +
      Object.keys(lang.blocks)
        .map(function (c) {
          var isMultiLine = lang.blocks[c] !== '\n';
          var start = c.split('').map(function (c) { return '\\' + c; }).join('');
          var end = lang.blocks[c].split('').map(function (c) { return '\\' + c; }).join('');
          return start + '[\\s\\S]*?(' + end + '|$)';
        }).join('|') +
      ')'
    ),
    'gi'
  );
  var foundString = {};
  var stringRE = new RegExp(
    (
      '(' +
      [].concat(Object.keys(lang.multiLineStrings), Object.keys(lang.stringComplements))
        .map(function (c) {
          if (!foundString[c]) {
            foundString[c] = true;
            var isMultiLine = !!lang.multiLineStrings[c];
            var start = c.split('').map(function (c) { return '\\' + c; }).join('');
            var end = (lang.stringComplements[c] || lang.multiLineStrings[c]).split('').map(function (c) { return '\\' + c; }).join('');
            return start + end + '|' + start + '[\\s\\S]*?([^\\\\]' + end + (isMultiLine ? '|$)' : '|\n)');
          } else {
            return '';
          }
        })
        .filter(function (v) { return !!v; })
        .join('|') +
      ')'
    ),
    'gi'
  );
  var commentLookup = (
    value
      .replace(stringRE, function ($0) {
        var len = $0.length - 1;
        var fc = $0[0];
        var ec = $0[len];
        return fc.repeat(len) + [fc, ec][(ec === '\n') | 0];
      })
      .replace(commentRE, function ($0) { return commentChar.repeat($0.length); })
  );
  this._blockLookup = value.replace(blockRE, function ($0) { return commentChar.repeat($0.length); });
  return this._commentLookup = commentLookup;
};

/**
 * Determines whether a specific character index is within a block or not
 * based on the language dictionary.
 * @param {integer} n The character index to check
 * @returns {boolean}
 */
CPHEditor.prototype.inBlock = function (n) {
  var c = String.fromCharCode(0);
  return this._blockLookup[n] === c ||
    (
      n === this.value.length &&
      this._blockLookup[n - 1] === c
    );
};

/**
 * Determines whether a specific character index is within a comment or not
 * based on the language dictionary.
 * @param {integer} n The character index to check
 * @returns {boolean}
 */
CPHEditor.prototype.inComment = function (n) {
  var c = String.fromCharCode(0);
  return this._commentLookup[n] === c ||
    (
      n === this.value.length &&
      this._commentLookup[n - 1] === c
    );
};

/**
 * Determines whether a specific character index is within a string or not
 * based on the language dictionary.
 * @param {integer} n The character index to check
 * @returns {boolean}
 */
CPHEditor.prototype.inString = function (n) {
  var lang = this.getActiveLanguageDictionary();
  return lang.stringComplements[this._commentLookup[n]] ||
    (
      n === this.value.length &&
      lang.stringComplements[this._commentLookup[n - 1]]
    ) || false;
};

/**
 * Finds the complement of a character at a specific index based on the
 * language dictionary.
 * e.g. finds `}` when `{` is located at the specified index.
 * @param {string} value The value to search through
 * @param {integer} n The character index to check
 * @returns {array} Result in format [leftIndex, rightIndex]
 */
CPHEditor.prototype.findComplements = function (value, n) {
  var str = this.inString(n);
  var lang = this.getActiveLanguageDictionary();
  if (
    !str &&
    !lang.forwardComplements[value[n]] &&
    !lang.reverseComplements[value[n]]
  ) {
    n = n - 1;
    str = this.inString(n);
  }
  var len = value.length;
  var lb = -1;
  var rb = -1;
  var lim = 1024; // max length of complement search
  if (str) {
    lb = value.slice(0, this.inString(n + 1) ? n + 1 : n).lastIndexOf(str);
    while (lb > 0 && value[lb - 1] === '\\') {
      lb = value.slice(0, lb).lastIndexOf(str);
    }
    rb = value.indexOf(str, lb === n ? n + 1 : n);
    while (rb > 0 && value[rb - 1] === '\\') {
      rb = value.indexOf(str, rb + 1);
    }
    if (!lang.multiLineStrings[str] && value.slice(lb, rb).indexOf('\n') > -1) {
      rb = -1;
    }
  } else {
    if (lang.reverseComplements[value[n]]) {
      n -= 1;
    }
    var matches = '';
    var chr;
    var fwd;
    var rev;
    var i;
    var l_lim = n - lim;
    for (i = n; i >= 0; i--) {
      if (i < l_lim) {
        // if over limit, return not found
        return [-1, -1];
      } else if (!this.inString(i) && !this.inComment(i)) {
        chr = value[i];
        fwd = lang.forwardComplements[chr];
        rev = lang.reverseComplements[chr];
        if (fwd) {
          if (matches[0] === fwd) {
            matches = matches.slice(1);
          } else {
            lb = i;
            break;
          }
        } else if (rev) {
          matches = chr + matches;
        }
      }
    }
    if (lb >= 0) {
      rev = fwd;
      fwd = lang.reverseComplements[fwd];
      var r_lim = n + lim;
      for (i = n + 1; i < len; i++) {
        if (i > r_lim) {
          // if over limit, return not found
          return [-1, -1];
        } else if (!this.inString(i) && !this.inComment(i)) {
          chr = value[i];
          if (chr === fwd) {
            matches = matches + chr;
          } else if (chr === rev) {
            if (matches.length) {
              matches = matches.slice(1);
            } else {
              rb = i;
              break;
            }
          }
        }
      }
    }
  }
  return [lb, rb];
};

/**
 * Sets an error state in the editor. This *will* trigger a re-render.
 * @param {integer} lineIndex The line index the error is on, 0-indexed
 * @param {integer} column The column index the error is on, 0-indexed
 * @returns {object}
 */
CPHEditor.prototype.setError = function (lineIndex, column) {
  if (lineIndex === null || lineIndex === undefined || lineIndex === false) {
    this._errorPos.enabled = false;
  } else {
    this._errorPos.lineIndex = lineIndex;
    this._errorPos.column = column;
    this._errorPos.enabled = true;
  }
  this.render(this.value);
  return this._errorPos;
};

/**
 * Set read-only mode on the editor. This *does not* trigger a re-render. You
 * must do that manually.
 * @param {boolean} value if undefined, will set `true`
 */
CPHEditor.prototype.setReadOnly = function (value) {
  value = value === undefined ? true : !!value;
  if (value) {
    this.element().classList.add('readonly');
    this.inputElement.setAttribute('tabindex', '-1');
    this.inputElement.setAttribute('readonly', '');
  } else {
    this.element().classList.remove('readonly');
    this.inputElement.removeAttribute('tabindex');
    this.inputElement.removeAttribute('readonly');
  }
  return this._readOnly = value;
};

/**
 * Retrieve the current read-only status of the editor.
 */
CPHEditor.prototype.isReadOnly = function () {
  return !!this._readOnly;
};

/**
 * Shakes the editor back-and-forth, indicating no action can be taken.
 */
CPHEditor.prototype.animateNo = function () {
  this.element().classList.add('animate-no');
  clearTimeout(this._animateNoTimeout);
  this._animateNoTimeout = setTimeout(function () {
    this.element().classList.remove('animate-no');
  }.bind(this), 200);
};

/**
 * Enables the editor.
 */
CPHEditor.prototype.enable = function () {
  this.element().classList.remove('disabled');
  this.inputElement.removeAttribute('disabled');
  Control.prototype.enable.apply(this, arguments);
};

/**
 * Disables the editor. The user can not make further changes or scroll the
 * editor.
 */
CPHEditor.prototype.disable = function () {
  this.element().classList.add('disabled');
  this.inputElement.setAttribute('disabled', '');
  Control.prototype.disable.apply(this, arguments);
};

CPHEditor.prototype.shortcut = function (hotkey) {
  if (this.hotkeys[hotkey]) {
    this.hotkeys[hotkey].call(this, this.value, this.user.cursors);
  }
};

/**
 * Open the find and replace dialog for the editor.
 * @param {string} value The value to search for
 */
CPHEditor.prototype.find = function (value) {
  this.control('find-replace').show(value);
};

/**
 * Set maximized mode on the editor so that it takes up all of its relative parent's
 * height. This *does not* trigger a re-render. You must do that manually.
 * @param {boolean} value
 */
CPHEditor.prototype.setMaximized = function (maximized) {
  this.maximized = !!maximized;
  if (this.maximized) {
    this.element().setAttribute('data-maximized', '');
    this.textboxElement.style.height = '';
    this.height = this.textboxElement.offsetHeight;
  } else {
    this.element().removeAttribute('data-maximized');
    var lines = this.value.split('\n');
    this.height = this.paddingTop + this.paddingBottom + (Math.min(this.maxrows, lines.length) * this.lineHeight);
    this.textboxElement.style.height = this.height + 'px';
  }
};

/**
 * Sets metadata on the editor, if needed. This will dispatch a `metadata` event
 * and `metadata/${key}` event that can be listener to via `editor.on('metadata', fn)`.
 * @param {string} key The metadata key to set
 * @param {string} value The metadata value to set
 */
CPHEditor.prototype.setMetadata = function (key, value) {
  key = key + '';
  value = value === undefined ? null : value;
  this._metadata[key] = value;
  this.dispatch('metadata', this, key, value);
  this.dispatch('metadata/' + key, this, value);
};

/**
 * Clears metadata on the editor, if needed. This will dispatch a `metadata` event
 * and `metadata/${key}` event that can be listener to via `editor.on('metadata', fn)`.
 * @param {string} key The metadata key to clear
 */
CPHEditor.prototype.clearMetadata = function (key) {
  key = key + '';
  delete this._metadata[key];
  this.dispatch('metadata', this, key, null);
  this.dispatch('metadata/' + key, this, null);
};

/**
 * Retrieves metadata from the editor, if needed
 * @param {string} key The metadata key to retrieve
 * @param {string} defaultValue The default value to return if not set
 */
CPHEditor.prototype.getMetadata = function (key, defaultValue) {
  key = key + '';
  defaultValue = defaultValue === undefined ? null : defaultValue;
  return this._metadata.hasOwnProperty(key)
    ? this._metadata[key]
    : defaultValue;
};

/**
 * Tells us whether or not the editor can currently return typeahead or
 * other suggestions.
 */
CPHEditor.prototype.canSuggest = function () {
  return this.user.cursors.length === 1 &&
    !this.user.cursors[0].width() &&
    this.hasFocus() &&
    !this.isReadOnly() &&
    this.isEnabled();
};

/**
 * Create a custom autocompletion detector to add your own autocomplete box.
 * The `enableFn` takes the form `function (editor, selection, inString, inComment)`
 * and can return any sort of `result` you want. When rendered, if `enableFn()`
 * returns a truthy value, the editor will dispatch an `autocomplete` event
 * with the parameters `(editor, name, result, cursorRectangle)`. You can
 * use this to build your own autcompletion element.
 * @param {string} name The name of the autocompletion handler
 * @param {function} enableFn The autocompletion enablement handler
 */
CPHEditor.prototype.addAutocomplete = function (name, enableFn) {
  name = name + '';
  if (typeof enableFn !== 'function') {
    throw new Error('.addAutocomplete enableFn must be a function');
  }
  this._autocompleteFns[name] = enableFn;
  return name;
};

/**
* Removes an autocompletion detector
* @param {string} name
*/
CPHEditor.prototype.removeAutocomplete = function (name) {
  name = name + '';
  delete this._autocompleteFns[name];
  return true;
};

/**
* Adds a hotkey handler with the format `function (value, cursors) { ... }`
* If a hotkey is added, the default behavior will be prevented.
* @param {string} key Hotkey format in order `ctrl+alt+shift+key`
* @param {function} fn Hotkey handler
*/
CPHEditor.prototype.addHotkey = function (key, fn) {
  key = key + '';
  if (typeof fn !== 'function') {
    throw new Error('.addHotkey fn must be a function');
  }
  this.hotkeys[key] = fn;
  return key;
};

/**
* Removes a hotkey handler
* @param {string} key Hotkey format in order `ctrl+alt+shift+key`
*/
CPHEditor.prototype.removeHotkey = function (key) {
  key = key + '';
  delete this.hotkeys[key];
  return true;
};

/**
* Opens the editor instance. Typically used after an editor is created manually
* via `editor = new Copenhagen.Editor()`.
* @param {HTMLElement} el The element to open the editor on
* @param {boolean} focus Whether or not to focus the editor. Defaults to `true`.
* @param {boolean} replaceText Whether or not to use the existing text inside of the HTMLElement to populate the editor. Defaults to `false`.
*/
CPHEditor.prototype.open = function (el, focus, replaceText) {
  if (replaceText) {
    var text = el.innerHTML;
    text = text.replace(/&gt;/gi, '>').replace(/&lt;/gi, '<').replace(/&amp;/gi, '&');
    el.innerHTML = '';
    var lines = text.split('\n');
    if (!lines[0].trim()) {
      lines.shift();
    }
    if (!lines[lines.length - 1].trim()) {
      lines.pop();
    }
    this.userAction('InsertText', lines.join('\n'));
    this.clearHistory();
  }
  Control.prototype.open.call(this, el, focus);
};

/**
* Sets emulation mode. Turning this on will cause the editor to always appear "in focus".
* It will also allow you to use "emulateUserAction", which can dispatch a user action
* even in "readonly" mode.
* @param {boolean} value Enable or disable emulation, will default to `true`
*/
CPHEditor.prototype.setEmulationMode = function (value) {
  value = value === undefined ? true : !!value;
  if (value || this.hasFocus()) {
    this.element().classList.add('focus');
  } else {
    this.element().classList.remove('focus');
  }
  return this._emulationMode = value;
};

function CPHContextMenu (app, cfg) {

  this.app = app;

  this.items = cfg.items || [];
  this.parent = cfg.parent || this;
  this.data = cfg.data || null;

  this.constructor.activeMenu &&
    this.constructor.activeMenu.close();
  this.constructor.activeMenu = this;

  this.items = this.items.map(function (item) {
    if (item.shortcut && !item.action && this.parent && this.parent.shortcut) {
      item.action = function (data, e) {
        this.parent.focus();
        this.parent.shortcut(item.shortcut);
      }.bind(this);
    }
    return item;
  }.bind(this));

  Control.call(this);

  var itemEls = this.selectorAll('[data-item-index]');

  itemEls.forEach(function (el, i) {
    var index = parseInt(el.getAttribute('data-item-index'));
    var item = this.items[index];
    if (!item) {
      return;
    }
    var hidden = item.hidden;
    hidden = typeof hidden === 'function'
      ? !!hidden.call(this.parent, this.data)
      : !!hidden;
    if (hidden) {
      el.style.display = 'none';
    }
    var disabled = item.disabled || !!item.disabledAsync;
    if (typeof disabled === 'function') {
      disabled = disabled.call(this.parent, this.data);
    } else if (typeof item.disabledAsync === 'function') {
      item.disabledAsync.call(this.parent, this.data, function (result) {
        disabled = !!result;
        !disabled && item.classList.remove('disabled');
      });
    }
    disabled && el.classList.add('disabled');
    el.addEventListener('click', function (e) {
      if (disabled) {
        e.preventDefault();
        return;
      } else if (item.action) {
        e.preventDefault();
        this.close.call(this, item.action.bind(this.parent, this.data, e));
      } else if (item.href) {
        setTimeout(function () {
          this.close();
        }.bind(this), 1);
      }
    }.bind(this), true);
  }.bind(this));

};

CPHContextMenu.prototype = Object.create(Control.prototype);
CPHContextMenu.prototype.constructor = CPHContextMenu;
CPHContextMenu.prototype.controlName = 'CPHContextMenu';
window.Controls['CPHContextMenu'] = CPHContextMenu;

CPHContextMenu.activeMenu = null;

CPHContextMenu.prototype.eventListeners = {
  '&': {
    mousedown: function (e) {
      e.preventDefault();
    },
    mouseleave: function (e) {
      this._boundElement && this.close();
    }
  }
};

CPHContextMenu.prototype.windowEvents = {
  mousedown: function (e) {
    if (this._boundElement) {
      return;
    }
    var el = this.element();
    var target = e.target;
    while (target) {
      if (target === el) {
        return;
      }
      target = target.parentNode
    }
    this.close();
  }
};

CPHContextMenu.prototype.open = function (e, rightAlign) {

  e.preventDefault && e.preventDefault();
  e.stopPropagation && e.stopPropagation();

  var rect;

  if (e instanceof HTMLElement) {
    this._boundElement = e;
    rect = e.getBoundingClientRect();
    e = {clientX: rect.left, clientY: rect.top};
    var evt = function (e) {
      var el = e.relatedTarget;
      var found = false;
      while (el) {
        if (el === this.element()) {
          found = true;
          break;
        }
        el = el.parentNode;
      }
      if (!found) {
        this._boundElement.removeEventListener('mouseleave', evt);
        this.close();
      }
    }.bind(this);
    this._boundElement.addEventListener('mouseleave', evt);
  } else {
    rect = {left: e.clientX, top: e.clientY, width: 0, height: 0};
  }

  Control.prototype.open.apply(this);

  var dim = this.element().getBoundingClientRect();

  var left = e.clientX;
  if (rightAlign || left + dim.width > window.innerWidth) {
    var right = window.innerWidth - left - rect.width;
    this.element().style.right = right + 'px';
  } else {
    this.element().style.left = left + 'px';
  }

  var top = e.clientY + rect.height;
  if (top + dim.height > window.innerHeight) {
    var bottom = window.innerHeight - top + rect.height;
    this.element().style.bottom = bottom + 'px';
  } else {
    this.element().style.top = top + 'px';
  }

  if (this._boundElement) {

    this.element().style[
      ['marginTop', 'marginBottom'][!!this.element().style.bottom | 0]
    ] = '-4px';

    this.element().style[
      [
        [
          'border-top-left-radius',
          'border-top-right-radius'
        ][!this.element().style.left | 0],
        [
          'border-bottom-left-radius',
          'border-bottom-right-radius'
        ][!this.element().style.left | 0]
      ][!!this.element().style.bottom | 0]
    ] = '0px';

  }

};

CPHContextMenu.prototype.close = function (callback) {

  this.constructor.activeMenu = null;
  Control.prototype.close.call(this);
  callback && callback();
  this.dispatch('close', this);

};

CPHContextMenu.prototype.generateShortcut = function (shortcut) {
  return shortcut.split('+').map(function (key) {
    key = key.toLowerCase();
    return (
      {
        'ctrl': function (key) {
          return isMac() ? feather.icons['command'].toSvg() : 'ctrl';
        },
        'alt': function (key) {
          return isMac() ? 'option' : 'alt';
        }
      }[key] || function (key) { return key; }
    )(key);
  }).join('&nbsp;+&nbsp;');
};

function CPHCursor (start, end, offset) {
  this.offset = parseInt(offset) || 0; // use for smart line offsets
  this.select(start, end);
};

CPHCursor.prototype.clone = function () {
  return new CPHCursor(this.pivot, this.position, this.offset);
};

CPHCursor.prototype.move = function (delta) {
  this.select(this.pivot + delta, this.position + delta);
};

CPHCursor.prototype.highlight = function (delta) {
  this.select(this.pivot, this.position + delta);
};

CPHCursor.prototype.selectRelative = function (deltaLeft, deltaRight) {
  deltaLeft = deltaLeft || 0;
  deltaRight = deltaRight || 0;
  if (this.direction() === 'ltr') {
    this.select(this.pivot + deltaLeft, this.position + deltaRight);
  } else {
    this.select(this.pivot + deltaRight, this.position + deltaLeft);
  }
};

CPHCursor.prototype.select = function (start, end) {
  this.pivot = start = start === undefined ? 0 : start;
  this.position = end === undefined ? start : end;
  this.selectionStart = Math.min(this.pivot, this.position);
  this.selectionEnd = Math.max(this.pivot, this.position);
};

CPHCursor.prototype.calculateNoOp = function (value) {
  return {
    value: value,
    selectRelative: [0, 0],
    offset: 0
  };
};

CPHCursor.prototype.calculateRemoveText = function (value, args) {
  var amount = parseInt(args[0]);
  if (isNaN(amount)) {
    throw new Error('"RemoveText" expects a number');
  }
  var selectRelative = [0, 0];
  var selectionStart = this.selectionStart;
  var selectionEnd = this.selectionEnd;
  var offset = 0;
  if (this.width()) {
    value = value.slice(0, selectionStart) + value.slice(selectionEnd);
    selectRelative[1] = selectionStart - selectionEnd;
    offset = selectionStart - selectionEnd;
  } else if (amount > 0) {
    value = value.slice(0, selectionStart) + value.slice(selectionEnd + amount);
    offset = -amount;
  } else if (amount < 0) {
    if (selectionStart + amount < 0) {
      amount = -selectionStart;
    }
    value = value.slice(0, selectionStart + amount) + value.slice(selectionEnd);
    selectRelative[0] = amount;
    selectRelative[1] = amount;
    offset = amount;
  }
  return {
    value: value,
    selectRelative: selectRelative,
    offset: offset
  };
};

CPHCursor.prototype.calculateInsertText = function (value, args, lang) {
  var insertValue = (args[0] || '') + ''; // coerce to string
  var selectAll = args[1] === true;
  var adjust = parseInt(args[1]) || 0;
  var cursorLength = parseInt(args[2]) || 0;
  var replaceValue = value.slice(this.selectionStart, this.selectionEnd);
  if (insertValue === '\n') {
    var sel = this.getSelectionInformation(value);
    var indent = sel.lines[0].replace(/^((\s*)?([\*\-]\s)?).*$/, '$1');
    if (indent.match(/^\s+$/) && indent.length % 2 === 1) {
      indent = indent.slice(0, -1);
    }
    var curComplement = lang.tabComplements[value[this.selectionStart - 1]] || '';
    var nextCharacter = value[this.selectionStart];
    if (curComplement && curComplement === nextCharacter) {
      insertValue = '\n' + indent + lang.tabChar.repeat(lang.tabWidth) + '\n' + indent;
      adjust = -(indent.length + 1);
    } else if (curComplement) {
      insertValue = '\n' + indent + lang.tabChar.repeat(lang.tabWidth);
    } else {
      insertValue = '\n' + indent;
    }
  } else if (this.width() && lang.forwardComplements[insertValue] && !adjust && !cursorLength) {
    var start = insertValue;
    var end = lang.forwardComplements[insertValue];
    var val = value.slice(this.selectionStart, this.selectionEnd);
    insertValue = start + val + end;
    adjust = -val.length - 1;
    cursorLength = val.length;
  } else if (insertValue !== lang.tabChar && insertValue !== lang.tabChar.repeat(lang.tabWidth)) {
    var sel = this.getSelectionInformation(value);
    var indent = sel.lines[0].replace(/^((\s*)?([\*\-]\s)?).*$/, '$1');
    var lines = insertValue.split('\n');
    var adjustLines;
    var adjustLineIndex = -1;
    var adjustColumnOffset = 0;
    if (adjust < 0) {
      // Fix the adjust setting for multiline input
      adjustLines = insertValue.slice(0, adjust).split('\n');
      adjustLineIndex = adjustLines.length - 1;
      adjustColumnOffset = lines[adjustLineIndex].length - adjustLines[adjustLineIndex].length;
    }
    lines = lines.map(function (line, i) {
      var tabs = 0;
      var spaces = 0;
      line = line.replace(/^[\t ]+/gi, function ($0) {
        tabs += $0.split('\t').length - 1;
        spaces += $0.split(' ').length - 1;
        return '';
      });
      return {
        count: (tabs * lang.tabWidth) + spaces,
        line: line
      };
    });
    // Get minimum tab count
    var minCount = Math.min.apply(
      Math,
      lines
        .slice(1)
        .filter(function (l) { return l.line.length > 0; })
        .map(function (l) { return Math.floor(l.count / lang.tabWidth) * lang.tabWidth; })
    );
    insertValue = lines.map(function (l, i) {
      if (!i) {
        return ' '.repeat(l.count % lang.tabWidth) + l.line;
      } else {
        var count = Math.max(0, l.count - minCount);
        var tabs = Math.floor(count / lang.tabWidth);
        var spaces = count % lang.tabWidth;
        return indent + (lang.tabChar.repeat(lang.tabWidth)).repeat(tabs) + ' '.repeat(spaces) + l.line;
      }
    }).join('\n');
    if (adjustLineIndex > -1) {
      // adjust accordingly for multiline input
      adjust = -(
        insertValue.length -
        insertValue.split('\n').slice(0, adjustLineIndex + 1).join('\n').length +
        adjustColumnOffset
      );
    }
  }
  value = value.slice(0, this.selectionStart) + insertValue + value.slice(this.selectionEnd);
  if (selectAll) {
    adjust = -insertValue.length;
    cursorLength = insertValue.length;
  }
  return {
    value: value,
    selectRelative: [insertValue.length + adjust, insertValue.length - replaceValue.length + adjust + cursorLength],
    offset: insertValue.length - (this.selectionEnd - this.selectionStart)
  }
};

CPHCursor.prototype.calculateInsertLines = function (value, args) {
  var insertValue = args[0];
  var sel = this.getSelectionInformation(value);
  var replaceValue = value.slice(sel.linesStartIndex, sel.linesEndIndex);
  var selectRelative = [
    -sel.linesPrefix.length,
    sel.linesSuffix.length + insertValue.length - replaceValue.length
  ];
  var newLines = insertValue.split('\n');
  var firstLineSuffix = sel.lines[0].slice(sel.linesPrefix.length);
  var newFirstLine = newLines[0];
  if (newFirstLine.endsWith(firstLineSuffix)) {
    selectRelative[0] += newFirstLine.length - firstLineSuffix.length;
   }
  var lastLineSuffix = sel.lines[sel.lines.length - 1].slice(sel.lines[sel.lines.length - 1].length - sel.linesSuffix.length);
  var newLastLine = newLines[newLines.length - 1];
  if (newLastLine.endsWith(lastLineSuffix)) {
    selectRelative[1] -= lastLineSuffix.length;
  }
  value = value.slice(0, sel.linesStartIndex) + insertValue + value.slice(sel.linesEndIndex);
  return {
    value: value,
    selectRelative: selectRelative,
    offset: insertValue.length - (sel.linesEndIndex - sel.linesStartIndex)
  };
};

CPHCursor.prototype.calculateAddIndent = function (value, args, lang) {
  var sel = this.getSelectionInformation(value);
  var newLines = sel.lines.map(function (line, i) {
    var count = 0;
    var len = 0;
    while (line[len] === lang.tabChar) {
      len++;
    }
    if (len === line.length) {
      return '';
    } else {
      count = lang.tabWidth - (len % lang.tabWidth);
      return lang.tabChar.repeat(count) + line;
    }
  }.bind(this));
  return this.calculateInsertLines(value, [newLines.join('\n')]);
};

CPHCursor.prototype.calculateRemoveIndent = function (value, args, lang) {
  var sel = this.getSelectionInformation(value);
  var newLines = sel.lines.map(function (line, i) {
    var count = 0;
    var len = 0;
    while (line[len] === lang.tabChar) {
      len++;
    }
    if (!len) {
      return line;
    } else if (len === line.length) {
      return '';
    } else {
      count = (len % lang.tabWidth) || lang.tabWidth;
      return line.slice(count);
    }
  }.bind(this));
  return this.calculateInsertLines(value, [newLines.join('\n')]);
};

CPHCursor.prototype.calculateToggleComment = function (value, args, lang) {
  var sel = this.getSelectionInformation(value);
  var newLines = [];
  var index = sel.lines.findIndex(function (line, i) {
    var count = 0;
    var len = 0;
    while (line[len] === lang.tabChar) {
      len++;
    }
    if (len === line.length) {
      return false;
    } else if (!line.slice(len).startsWith(lang.commentString)) {
      return true;
    } else {
      return false;
    }
  });
  var addComments = index > -1;
  var newLines = sel.lines.map(function (line, i) {
    var count = 0;
    var len = 0;
    while (line[len] === lang.tabChar) {
      len++;
    }
    if (len === line.length) {
      return '';
    } else if (addComments) {
      return line.slice(0, len) + lang.commentString + ' ' + line.slice(len);
    } else {
      var suffix = line.slice(len + lang.commentString.length);
      if (suffix.startsWith(' ')) {
        suffix = suffix.slice(1);
      }
      return line.slice(0, len) + suffix;
    }
  }.bind(this));
  return this.calculateInsertLines(value, [newLines.join('\n')]);
};

CPHCursor.prototype.width = function () {
  return this.selectionEnd - this.selectionStart;
};

CPHCursor.prototype.clamp = function (value) {
  if (typeof value !== 'string') {
    throw new Error('Clamp expects string value');
  }
  this.pivot = Math.min(Math.max(0, this.pivot), value.length);
  this.position = Math.min(Math.max(0, this.position), value.length);
  this.select(this.pivot, this.position);
};

CPHCursor.prototype.getSelectionInformation = function (value) {
  value = value || '';
  var selStart = this.selectionStart;
  var selEnd = this.selectionEnd;
  var pre = value.slice(0, selStart);
  var post = value.slice(selEnd);
  var startIndex = pre.lastIndexOf('\n') + 1;
  var endIndex = (post + '\n').indexOf('\n');
  var lines = value.slice(startIndex, endIndex + selEnd).split('\n');
  return {
    value: value.slice(selStart, selEnd),
    start: selStart,
    end: selEnd,
    length: selEnd - selStart,
    lineNumber: value.slice(0, selStart).split('\n').length,
    column: value.slice(0, selStart).split('\n').pop().length,
    lines: lines,
    linesStartIndex: startIndex,
    linesEndIndex: endIndex + selEnd,
    linesPrefix: pre.slice(startIndex),
    linesSuffix: post.slice(0, endIndex)
  };
};

CPHCursor.prototype.direction = function () {
  if (this.pivot <= this.position) {
    return 'ltr';
  } else {
    return 'rtl';
  }
};

function CPHFindReplace (app, cfg) {

  this.app = app;

  this._currentIndex = 0;
  this._count = 0;

  Control.call(this);

  this.findInput = this.selector('input[name="find"]');
  this.replaceInput = this.selector('input[name="replace"]');
  this.updateState();
  this.hide();

};

CPHFindReplace.prototype = Object.create(Control.prototype);
CPHFindReplace.prototype.constructor = CPHFindReplace;
CPHFindReplace.prototype.controlName = 'CPHFindReplace';
window.Controls['CPHFindReplace'] = CPHFindReplace;

CPHFindReplace.prototype.eventListeners = {
  '&': {
    keydown: function (e) {
      if (e.key.toLowerCase() === 'escape') {
        this.hide();
      }
    }
  },
  'a[name="case"]': {
    click: function (e, el) {
      el.classList.toggle('on');
      this.dispatch('change', this, this.findInput.value, this.isCaseSensitive(), this.isRegex());
    }
  },
  'a[name="regex"]': {
    click: function (e, el) {
      el.classList.toggle('on');
      this.dispatch('change', this, this.findInput.value, this.isCaseSensitive(), this.isRegex());
    }
  },
  'a[name="prev"]': {
    click: function (e) {
      this.dispatch('prev', this, this.findInput.value, this.isCaseSensitive(), this.isRegex());
    }
  },
  'a[name="next"]': {
    click: function (e) {
      this.dispatch('next', this, this.findInput.value, this.isCaseSensitive(), this.isRegex());
    }
  },
  'a[name="close"]': {
    click: function (e) {
      this.hide();
    }
  },
  'a[name="replace-one"]': {
    click: function (e) {
      this.dispatch('replace', this, this.findInput.value, this.replaceInput.value, this.isCaseSensitive(), this.isRegex());
    }
  },
  'a[name="replace-all"]': {
    click: function (e) {
      this.dispatch('replace-all', this, this.findInput.value, this.replaceInput.value, this.isCaseSensitive(), this.isRegex());
    }
  },
  'input[type="text"][name="find"]': {
    input: function (e) {
      this.dispatch('change', this, this.findInput.value, this.isCaseSensitive(), this.isRegex());
      this.updateState();
    },
    keydown: function (e) {
      if (this.findInput.value && e.key.toLowerCase() === 'enter') {
        if (e.shiftKey) {
          this.dispatch('prev', this, this.findInput.value, this.isCaseSensitive(), this.isRegex());
        } else {
          this.dispatch('next', this, this.findInput.value, this.isCaseSensitive(), this.isRegex());
        }
      }
    }
  },
  'input[type="text"][name="replace"]': {
    input: function (e) {
      this.updateState();
    },
    keydown: function (e) {
      if (this.findInput.value && this.replaceInput.value && e.key.toLowerCase() === 'enter') {
        this.dispatch('replace', this, this.findInput.value, this.replaceInput.value, this.isCaseSensitive(), this.isRegex());
      }
    }
  }
};

CPHFindReplace.prototype.updateState = function () {
  if (!this.findInput.value || !this._count) {
    this.selector('a[name="prev"]').setAttribute('disabled', '');
    this.selector('a[name="next"]').setAttribute('disabled', '');
  } else {
    this.selector('a[name="prev"]').removeAttribute('disabled');
    this.selector('a[name="next"]').removeAttribute('disabled');
  }
  if (!this.replaceInput.value || !this.findInput.value || !this._count) {
    this.selector('a[name="replace-one"]').setAttribute('disabled', '');
    this.selector('a[name="replace-all"]').setAttribute('disabled', '');
  } else {
    this.selector('a[name="replace-one"]').removeAttribute('disabled');
    this.selector('a[name="replace-all"]').removeAttribute('disabled');
  }
  if (this.isCaseSensitive()) {
    this.selector('a[name="case"]').setAttribute('title', 'Case sensitive: ON');
  } else {
    this.selector('a[name="case"]').setAttribute('title', 'Case sensitive: OFF');
  }
  if (this.isRegex()) {
    this.selector('a[name="regex"]').setAttribute('title', 'Regular Expressions: ON');
  } else {
    this.selector('a[name="regex"]').setAttribute('title', 'Regular Expressions: OFF');
  }
};

CPHFindReplace.prototype.hide = function () {
  Control.prototype.hide.apply(this, arguments);
};

CPHFindReplace.prototype.show = function (text) {
  setTimeout(function () {
    this.findInput.value = text || '';
    this.findInput.focus();
    this.findInput.setSelectionRange(0, text.length);
    this.updateState();
    this.dispatch('change', this, this.findInput.value, this.isCaseSensitive(), this.isRegex());
  }.bind(this), 1);
  Control.prototype.show.apply(this, arguments);
};

CPHFindReplace.prototype.setPosition = function (currentIndex, count) {
  this._currentIndex = currentIndex;
  this._count = count;
  this.updateState();
  this.selector('[data-position]').innerText = this._currentIndex + ' / ' + this._count;
};

CPHFindReplace.prototype.isCaseSensitive = function () {
  return this.selector('a[name="case"]').classList.contains('on');
};

CPHFindReplace.prototype.isRegex = function () {
  return this.selector('a[name="regex"]').classList.contains('on');
};

function CPHUser () {
  this.cursors = [new CPHCursor()];
};

CPHUser.prototype.loadCursors = function (cursors) {
  this.cursors = cursors.map(function (cursor) { return cursor.clone(); });
};

CPHUser.prototype.createCursor = function (position) {
  position = position || {};
  var cursor = new CPHCursor(position.selectionStart, position.selectionEnd, position.offset);
  this.cursors.unshift(cursor);
  return cursor;
};

CPHUser.prototype.resetCursor = function () {
  this.cursors = this.cursors.slice(0, 1);
  this.cursors[0].offset = 0;
  return this.cursors[0];
};

CPHUser.prototype.createNextCursor = function (value) {
  if (!this.cursors[0].width()) {
    return;
  }
  var len = this.cursors.length;
  var matchValue = value.slice(this.cursors[0].selectionStart, this.cursors[0].selectionEnd);
  if (matchValue.length) {
    var cursors = this.cursors.filter(function (cursor) {
      return matchValue === value.slice(cursor.selectionStart, cursor.selectionEnd);
    });
    if (cursors.length === len) {
      var newestCursor = cursors[0];
      var oldestCursor = cursors[cursors.length - 1];
      var index = value.indexOf(matchValue, newestCursor.selectionEnd);
      if (index === -1 || (this.suffix && index > value.length - this.suffix.length)) {
        index = value.slice(0, oldestCursor.selectionStart).indexOf(matchValue, this.prefix ? this.prefix.length : 0);
      }
      if (
        index > -1 &&
        this.cursors.filter(function (cursor) { return cursor.selectionStart === index; }).length === 0
      ) {
        if (newestCursor.direction() === 'ltr') {
          this.createCursor({selectionStart: index, selectionEnd: index + matchValue.length});
        } else {
          this.createCursor({selectionStart: index + matchValue.length, selectionEnd: index});
        }
      }
    }
  }
  this.collapseCursors();
  return this.cursors[0];
};

CPHUser.prototype.destroyLastCursor = function () {
  if (this.cursors.length > 1) {
    this.cursors.shift();
  }
  return this.cursors[0];
};

CPHUser.prototype.getSortedCursors = function () {
  return this.cursors.slice().sort(function (a, b) {
    return a.selectionStart > b.selectionStart ? 1 : -1;
  });
};

CPHUser.prototype.collapseCursors = function (clone) {
  var sortedCursors = this.getSortedCursors();
  return sortedCursors.reduce(function (cursors, cursor) {
    var prevCursor = cursors[cursors.length - 1];
    if (!prevCursor || cursor.selectionStart >= prevCursor.selectionEnd) {
      cursors.push(clone ? new CPHCursor(cursor.pivot, cursor.position) : cursor);
    } else {
      if (!clone) {
        this.cursors.splice(this.cursors.indexOf(cursor), 1);
      }
      if (prevCursor.direction() === 'ltr') {
        prevCursor.select(
          prevCursor.selectionStart,
          Math.max(prevCursor.selectionEnd, cursor.selectionEnd),
          cursor.offset
        );
      } else {
        prevCursor.select(
          Math.max(prevCursor.selectionEnd, cursor.selectionEnd),
          prevCursor.selectionStart,
          cursor.offset
        );
      }
    }
    return cursors;
  }.bind(this), []);
};

CPHUser.prototype.moveCursorsByDocument = function (value, direction, expandSelection) {
  if (direction === 'up') {
    if (expandSelection) {
      this.cursors.forEach(function (cursor) {
        cursor.select(cursor.pivot, 0);
      });
    } else {
      this.resetCursor();
      this.cursors[0].select(0);
    }
  } else if (direction === 'down') {
    if (expandSelection) {
      this.cursors.forEach(function (cursor) {
        cursor.select(cursor.pivot, value.length);
      });
    } else {
      this.resetCursor();
      this.cursors[0].select(value.length);
    }
  } else {
    throw new Error('Invalid moveCursorsByWord direction: "' + direction + '"');
  }
  this.collapseCursors();
  return this.cursors;
};

CPHUser.prototype.moveCursorsByLine = function (value, direction, expandSelection) {
  if (direction === 'left') {
    this.cursors.forEach(function (cursor) {
      cursor.offset = 0;
      var updateCursor = function (delta) {
        if (expandSelection) {
          cursor.highlight(delta);
        } else {
          cursor.select(cursor.position);
          cursor.move(delta);
        }
      };
      var sel = new CPHCursor(cursor.position).getSelectionInformation(value);
      var prefix = sel.linesPrefix;
      var suffix = sel.linesSuffix;
      var match = prefix.match(/^\s+/);
      match = match ? match[0] : '';
      if (match.length === prefix.length) {
        if (!match.length) {
          var matchSuffix = suffix.match(/^\s+/);
          matchSuffix = matchSuffix ? matchSuffix[0] : '';
          updateCursor(matchSuffix.length);
        } else {
          updateCursor(-match.length);
        }
      } else {
        updateCursor(-prefix.length + match.length);
      }
    }.bind(this));
  } else if (direction === 'right') {
    this.cursors.forEach(function (cursor) {
      cursor.offset = 0;
      var sel = new CPHCursor(cursor.position).getSelectionInformation(value);
      var suffix = sel.linesSuffix;
      if (expandSelection) {
        cursor.highlight(suffix.length);
      } else {
        cursor.select(cursor.position);
        cursor.move(suffix.length);
      }
    }.bind(this));
  } else {
    throw new Error('Invalid moveCursorsByLine direction: "' + direction + '"');
  }
  this.collapseCursors();
  return this.cursors;
};

CPHUser.prototype.moveCursorsByWord = function (value, direction, expandSelection) {
  if (direction === 'left') {
    this.cursors.forEach(function (cursor, i) {
      delete cursor.offset;
      var prefix = value.slice(0, cursor.position);
      var cut = prefix.replace(/[A-Za-z0-9\-_\$]+\s*$/gi, '');
      if (cut === prefix) {
        cut = cut.replace(/\s+$|[^A-Za-z0-9\-_\$]*$/gi, '');
      }
      if (expandSelection) {
        cursor.select(cursor.pivot, cut.length);
      } else {
        cursor.select(cut.length);
      }
    }.bind(this));
  } else if (direction === 'right') {
    this.cursors.forEach(function (cursor) {
      delete cursor.offset;
      var suffix = value.slice(cursor.position);
      var cut = suffix.replace(/^\s*[A-Za-z0-9\-_\$]+/gi, '');
      if (cut === suffix) {
        cut = cut.replace(/^\s+|^[^A-Za-z0-9\-_\$]*/gi, '');
      }
      if (expandSelection) {
        cursor.select(cursor.pivot, cursor.position + suffix.length - cut.length);
      } else {
        cursor.select(cursor.position + suffix.length - cut.length);
      }
    }.bind(this));
  } else {
    throw new Error('Invalid moveCursorsByWord direction: "' + direction + '"');
  }
  this.collapseCursors();
  return this.cursors;
};

CPHUser.prototype.moveCursors = function (value, direction, amount, expandSelection, createCursor) {
  amount = (amount === undefined || amount === null)
    ? 1
    : (parseInt(amount) || 0);
  if (direction === 'left' || direction === 'right') {
    amount = {'left': -(amount), 'right': amount}[direction];
    this.getSortedCursors().forEach(function (cursor) {
      if (expandSelection) {
        cursor.highlight(amount);
      } else if (amount < 0) {
        if (cursor.width()) {
          cursor.select(cursor.selectionStart);
        } else {
          cursor.move(amount);
        }
      } else {
        if (cursor.width()) {
          cursor.select(cursor.selectionEnd);
        } else {
          cursor.move(amount);
        }
      }
      cursor.clamp(value);
    }.bind(this));
  } else if (direction === 'up') {
    // If we're creating a cursor, only do it from most recent
    (createCursor ? this.cursors.slice(0, 1) : this.cursors).forEach(function (cursor) {
      if (cursor.position !== 0) {
        var lastn = value.slice(0, cursor.position).lastIndexOf('\n');
        var offset = Math.max(cursor.offset || 0, cursor.position - (lastn + 1));
        cursor.offset = Math.max(cursor.offset || 0, offset);
        var last2n = value.slice(0, Math.max(lastn, 0)).lastIndexOf('\n');
        if (last2n > -1) {
          var prevline = value.slice(last2n + 1).split('\n')[0];
          expandSelection
            ? cursor.select(cursor.pivot, last2n + 1 + Math.min(offset, prevline.length))
            : createCursor
              ? this.createCursor({selectionStart: last2n + 1 + Math.min(offset, prevline.length), offset: cursor.offset})
              : cursor.select(last2n + 1 + Math.min(offset, prevline.length));
        } else {
          expandSelection
            ? cursor.select(cursor.pivot, 0)
            : createCursor
              ? this.createCursor({selectionStart: 0, offset: cursor.offset})
              : cursor.select(0);
        }
      }
    }.bind(this));
  } else if (direction === 'down') {
    // If we're creating a cursor, only do it from most recent
    (createCursor ? this.cursors.slice(0, 1) : this.cursors).forEach(function (cursor) {
      if (cursor.position !== value.length) {
        var lastn = value.slice(0, cursor.position).lastIndexOf('\n');
        var offset = Math.max(cursor.offset || 0, cursor.position - (lastn + 1));
        cursor.offset = Math.max(cursor.offset || 0, offset);
        var nextn = value.indexOf('\n', cursor.position);
        if (nextn > -1) {
          var nextline = value.slice(nextn + 1).split('\n')[0];
          expandSelection
            ? cursor.select(cursor.pivot, nextn + 1 + Math.min(offset, nextline.length))
            : createCursor
              ? this.createCursor({selectionStart: nextn + 1 + Math.min(offset, nextline.length), offset: cursor.offset})
              : cursor.select(nextn + 1 + Math.min(offset, nextline.length))
        } else {
          expandSelection
            ? cursor.select(cursor.pivot, value.length)
            : createCursor
              ? this.createCursor({selectionStart: value.length, offset: cursor.offset})
              : cursor.select(value.length);
        }
      }
    }.bind(this));
  } else {
    throw new Error('Invalid moveCursors direction: "' + direction + '"');
  }
  this.collapseCursors();
  return this.cursors;
};

function Template (fn) { this._render = typeof fn === 'function' ? fn : function () { return ''; }; }
Template.prototype.render = function (control, it) { return this._render.call(control, it); };
Template._templates = {};
Template.find = function (Control) { var template = Template._templates[Control.name]; if (!template) { throw new Error('Could not find template: "' + name + '"'); } return template; };
Template.add = function (Control, fn) { Template._templates[Control.name] = new Template(fn); };

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

/**
* Autocompletion for code
* @class
*/
function CodeCompleter () {
  this.suggestions = this.generateSuggestions(this.suggestionMap);
};

CodeCompleter.prototype.cursorCharacter = '·';
CodeCompleter.prototype.wildcardWordCharacter = '¤';
CodeCompleter.prototype.wildcardPhraseCharacter = '…';
CodeCompleter.prototype.wildcardReplaceCharacter = '\\$1';

CodeCompleter.prototype.suggestionMap = {
  'javascript': [
    'const ',
    'const ¤ = ',
    'const {…} = ',
    'const […] = ',
    'console.log(`·Got here: A·`);',
    'console.error(`·Error·`);',
    'let ',
    'let ¤ = ',
    'let {…} = ',
    'let […] = ',
    'var ',
    'var ¤ = ',
    'var {…} = ',
    'var […] = ',
    'lib.',
    'module.exports = ',
    'module.exports = async ',
    'return ',
    'require(\'·\')',
    'class ',
    'class ¤ {·}',
    'function ',
    'function (·)',
    'function ¤ (·)',
    'function () {·}',
    'function ¤ () {·}',
    'function (…) {·}',
    'function ¤ (…) {·}',
    'if (·true·)',
    'if () {·}',
    'if (…) {·}',
    'else ',
    'else {·}',
    'else if (·true·)',
    'for (let i = 0; i < ·10·; i++)',
    'for () {·}',
    'for (…) {·}',
    'while (·true·)',
    'while () {·}',
    'while (…) {·}',
    'await ',
    'await lib.',
    'await new Promise((resolve, reject) => {·});',
    'async ',
    'async (·)',
    '() => {·}',
    '(…) => {·}',
    '/**\n * ·\n */',
    '* @param {·}',
    '* @param {…} ·paramName·',
    '* @returns {·}',
    '* @returns {…} ·returnValue·',
    'true',
    'false',
    'null',
    'new ',
    'new Promise((resolve, reject) => {·});',
    'Promise((resolve, reject) => {·});',
    'Promise.all([·]);',
    'setTimeout(() => {·}, 1);',
    'setInterval(() => {·}, 1);',
    'try {·}',
    'catch (e) {·}',
    'catch (…) {·}',
    'throw ',
    'throw new Error(`·Oops!·`);',
    'new Error(`·Oops!·`)',
    'Error(`·Oops!·`)',
    'Error(…)'
  ]
};

CodeCompleter.prototype.generateSuggestions = function () {
  var suggestionMap = this.suggestionMap;
  var cursorCharacter = this.cursorCharacter;
  return Object.keys(suggestionMap).reduce(function (suggestions, language) {
    var phraseList = suggestionMap[language].map(function (value) {
      var cursorStart = value.indexOf(cursorCharacter);
      var cursorEnd = value.lastIndexOf(cursorCharacter);
      var cursorLength = 0;
      if (cursorStart !== cursorEnd) {
        cursorLength = cursorEnd - cursorStart - 1;
        value = value.slice(0, cursorEnd) + value.slice(cursorEnd + 1);
      }
      var adjust = cursorStart === -1
        ? 0
        : cursorStart - value.length + 1;
      if (adjust) {
        value = value.substr(0, value.length + adjust - 1) + value.substr(value.length + adjust);
      }
      return {
        value: value,
        adjust: adjust,
        cursorLength: cursorLength
      };
    }.bind(this));
    suggestions[language] = {
      lookup: this.generateLookupTrie(phraseList),
    };
    return suggestions;
  }.bind(this), {});
};

CodeCompleter.prototype.generateLookupTrie = function (phraseList) {
  var wildcardWord = this.wildcardWordCharacter;
  var wildcardPhrase = this.wildcardPhraseCharacter;
  var root = {};
  var curNode, node, phrase, value;
  var i, j, k;
  for (i = 0; i < phraseList.length; i++) {
    phrase = phraseList[i];
    value = phrase.value;
    for (j = value.length - 1; j >= 0; j--) {
      curNode = root;
      for (k = j; k >= 0; k--) {
        char = value[k];
        curNode[char] = curNode[char] || {};
        if (char === wildcardWord || char === wildcardPhrase) {
          curNode[char][char] = curNode[char][char] || curNode[char];
        }
        curNode = curNode[char];
      }
      curNode.phrases = curNode.phrases || [];
      curNode.phrases.push({
        value: value,
        ranking: i,
        adjust: phrase.adjust,
        cursorLength: phrase.cursorLength,
        re: phrase.re
      });
    }
  }
  return root;
};

CodeCompleter.prototype.complete = function (tree, value, index, subs, inWildcard) {
  index = index || 0;
  subs = subs || [];
  inWildcard = inWildcard || '';
  var wildcardWord = this.wildcardWordCharacter;
  var wildcardPhrase = this.wildcardPhraseCharacter;
  var wildcardReplace = this.wildcardReplaceCharacter;
  var char;
  var results = [];
  var node = tree;
  for (var i = value.length - 1; i >= 0; i--) {
    index++;
    var char = value[i];
    if (node[wildcardWord]) {
      if (char.match(/[0-9a-z_$]/i)) {
        var newSubs = subs.slice();
        if (inWildcard) {
          newSubs[0] = char + newSubs[0];
        } else {
          newSubs.unshift(char);
        }
        results = results.concat(
          this.complete(node[wildcardWord], value.substr(0, i), index - 1, newSubs, wildcardWord)
        );
      }
    }
    if (node[wildcardPhrase]) {
      if (char.match(/[^\(\)\[\]\{\}\"\'\`]/i)) {
        var newSubs = subs.slice();
        if (inWildcard) {
          newSubs[0] = char + newSubs[0];
        } else {
          newSubs.unshift(char);
        }
        results = results.concat(
          this.complete(node[wildcardPhrase], value.substr(0, i), index - 1, newSubs, wildcardPhrase)
        );
      }
    }
    if (node[char]) {
      inWildcard = '';
      if (node.phrases && (char === ' ')) {
        results = results.concat(
          node.phrases.map(function (p) {
            var curSubs = subs.slice();
            return {
              value: p.value.replace(
                new RegExp('(' + [wildcardWord, wildcardPhrase, wildcardReplace].join('|') + ')', 'gi'),
                function ($0) { return curSubs.shift() || ''; }
              ),
              ranking: p.ranking,
              adjust: p.adjust,
              offset: index - 1 + subs.join('').length,
              cursorLength: p.cursorLength
            };
          })
        );
      }
      node = node[char];
    } else {
      break;
    }
  }
  if (node.phrases && (i < 0 || value[i] === ' ')) {
    (i < 0) && index++;
    results = results.concat(
      node.phrases.map(function (p) {
        var curSubs = subs.slice();
        return {
          value: p.value.replace(
            new RegExp('(' + [wildcardWord, wildcardPhrase, wildcardReplace].join('|') + ')', 'gi'),
            function ($0) { return curSubs.shift() || ''; }
          ),
          ranking: p.ranking,
          adjust: p.adjust,
          offset: index - 1 + subs.join('').length,
          cursorLength: p.cursorLength
        };
      })
    );
  }
  return results
    .sort(function (p1, p2) { return p2.offset - p1.offset || p1.ranking - p2.ranking; })
    .filter(function (p) { return p.offset < p.value.length; });
};

CodeCompleter.prototype.suggest = function (line, language, endOffset) {
  endOffset = parseInt(endOffset) || 0;
  var suggestions = this.suggestions[language];
  if (!suggestions) {
    return;
  }
  line = line.substring(0, line.length).replace(/^\s+/, '');
  var phrases = this.complete(suggestions.lookup, line);
  if (!phrases.length) {
    return;
  }
  var suggest = phrases[0];
  return  {
    value: suggest.value.substr(suggest.offset + endOffset),
    adjust: suggest.adjust,
    cursorLength: suggest.cursorLength
  };
};

function caseicon () {
  return '<svg version="1.1" xmlns="https://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 512 512" style="fill: currentColor;" xml:space="preserve"><g><path d="M209.3,330.3H75l-30.5,84.3H0.2l123-322.1h28.3h9.3L284,414.6h-44L209.3,330.3z M196.7,295.6L142,145.1L87.6,295.6H196.7z" /><path d="M505.7,388.4c1.5,8.9,3.5,16.5,6.2,22.7v3.5h-43.1c-2.5-5.8-4.4-14.1-5.8-25c-8.3,8.8-18.2,16-29.8,21.3 c-11.6,5.4-24.3,8.1-38.2,8.1c-15.9,0-30.1-3.1-42.4-9.4c-12.3-6.3-21.8-14.8-28.5-25.6c-6.7-10.8-10.1-22.7-10.1-35.8 c0-17,4.4-31.3,13.2-43.1c8.8-11.8,21.2-20.7,37.4-26.7c16.1-6,35.2-9,57.2-9h40.3v-19c0-14.6-4.3-26.1-12.9-34.4 c-8.6-8.3-21.1-12.5-37.3-12.5c-9.9,0-18.7,1.7-26.5,5.2c-7.8,3.5-13.9,8.1-18.3,13.9c-4.4,5.8-6.5,12.1-6.5,18.9h-41.4 c0-11.6,4-22.9,11.9-33.8c8-10.9,19.2-19.8,33.6-26.7c14.5-6.9,31-10.3,49.6-10.3c17.7,0,33.2,3,46.6,9c13.3,6,23.8,15,31.3,27 c7.5,12,11.3,26.7,11.3,44.1v111.5C503.5,370.8,504.2,379.4,505.7,388.4z M427.5,378.6c8.2-3.3,15.2-7.7,21.1-13.2 c5.9-5.5,10.4-11.4,13.5-17.7v-49.6h-33.6c-23.6,0-41.7,3.7-54.2,11.2c-12.5,7.4-18.8,18.5-18.8,33.1c0,7.8,1.8,14.8,5.3,21 c3.5,6.2,8.7,11.1,15.5,14.7c6.8,3.6,15,5.4,24.8,5.4C410.5,383.6,419.3,381.9,427.5,378.6z"/></g></svg>';
}

function regexicon () {
  return '<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 512 512" style="fill: currentColor;" xml:space="preserve"><g><path d="M26,512V398.6h113.4V512H26z"/><path d="M259.9,101l15.8-48.8C312.1,65,338.5,76.1,355,85.5c-4.3-41.4-6.6-69.9-6.9-85.5h49.8c-0.7,22.7-3.3,51.1-7.9,85.2 c23.6-11.9,50.6-22.9,81-33l15.8,48.8c-29.1,9.6-57.6,16-85.5,19.2c14,12.1,33.7,33.8,59.1,64.9l-41.2,29.2 c-13.3-18.1-29-42.7-47-73.8c-16.9,32.3-31.8,56.9-44.6,73.8L287,185.1c26.6-32.7,45.6-54.4,57-64.9 C314.5,114.5,286.4,108.1,259.9,101z"/></g></svg>';
}

!function(e,n){"object"==typeof exports&&"object"==typeof module?module.exports=n():"function"==typeof define&&define.amd?define([],n):"object"==typeof exports?exports.feather=n():e.feather=n()}("undefined"!=typeof self?self:this,function(){return function(e){var n={};function i(t){if(n[t])return n[t].exports;var l=n[t]={i:t,l:!1,exports:{}};return e[t].call(l.exports,l,l.exports,i),l.l=!0,l.exports}return i.m=e,i.c=n,i.d=function(e,n,t){i.o(e,n)||Object.defineProperty(e,n,{configurable:!1,enumerable:!0,get:t})},i.r=function(e){Object.defineProperty(e,"__esModule",{value:!0})},i.n=function(e){var n=e&&e.__esModule?function(){return e.default}:function(){return e};return i.d(n,"a",n),n},i.o=function(e,n){return Object.prototype.hasOwnProperty.call(e,n)},i.p="",i(i.s=80)}([function(e,n,i){(function(n){var i="object",t=function(e){return e&&e.Math==Math&&e};e.exports=t(typeof globalThis==i&&globalThis)||t(typeof window==i&&window)||t(typeof self==i&&self)||t(typeof n==i&&n)||Function("return this")()}).call(this,i(75))},function(e,n){var i={}.hasOwnProperty;e.exports=function(e,n){return i.call(e,n)}},function(e,n,i){var t=i(0),l=i(11),r=i(33),o=i(62),a=t.Symbol,c=l("wks");e.exports=function(e){return c[e]||(c[e]=o&&a[e]||(o?a:r)("Symbol."+e))}},function(e,n,i){var t=i(6);e.exports=function(e){if(!t(e))throw TypeError(String(e)+" is not an object");return e}},function(e,n){e.exports=function(e){try{return!!e()}catch(e){return!0}}},function(e,n,i){var t=i(8),l=i(7),r=i(10);e.exports=t?function(e,n,i){return l.f(e,n,r(1,i))}:function(e,n,i){return e[n]=i,e}},function(e,n){e.exports=function(e){return"object"==typeof e?null!==e:"function"==typeof e}},function(e,n,i){var t=i(8),l=i(35),r=i(3),o=i(18),a=Object.defineProperty;n.f=t?a:function(e,n,i){if(r(e),n=o(n,!0),r(i),l)try{return a(e,n,i)}catch(e){}if("get"in i||"set"in i)throw TypeError("Accessors not supported");return"value"in i&&(e[n]=i.value),e}},function(e,n,i){var t=i(4);e.exports=!t(function(){return 7!=Object.defineProperty({},"a",{get:function(){return 7}}).a})},function(e,n){e.exports={}},function(e,n){e.exports=function(e,n){return{enumerable:!(1&e),configurable:!(2&e),writable:!(4&e),value:n}}},function(e,n,i){var t=i(0),l=i(19),r=i(17),o=t["__core-js_shared__"]||l("__core-js_shared__",{});(e.exports=function(e,n){return o[e]||(o[e]=void 0!==n?n:{})})("versions",[]).push({version:"3.1.3",mode:r?"pure":"global",copyright:"© 2019 Denis Pushkarev (zloirock.ru)"})},function(e,n,i){"use strict";Object.defineProperty(n,"__esModule",{value:!0});var t=o(i(43)),l=o(i(41)),r=o(i(40));function o(e){return e&&e.__esModule?e:{default:e}}n.default=Object.keys(l.default).map(function(e){return new t.default(e,l.default[e],r.default[e])}).reduce(function(e,n){return e[n.name]=n,e},{})},function(e,n){e.exports=["constructor","hasOwnProperty","isPrototypeOf","propertyIsEnumerable","toLocaleString","toString","valueOf"]},function(e,n,i){var t=i(72),l=i(20);e.exports=function(e){return t(l(e))}},function(e,n){e.exports={}},function(e,n,i){var t=i(11),l=i(33),r=t("keys");e.exports=function(e){return r[e]||(r[e]=l(e))}},function(e,n){e.exports=!1},function(e,n,i){var t=i(6);e.exports=function(e,n){if(!t(e))return e;var i,l;if(n&&"function"==typeof(i=e.toString)&&!t(l=i.call(e)))return l;if("function"==typeof(i=e.valueOf)&&!t(l=i.call(e)))return l;if(!n&&"function"==typeof(i=e.toString)&&!t(l=i.call(e)))return l;throw TypeError("Can't convert object to primitive value")}},function(e,n,i){var t=i(0),l=i(5);e.exports=function(e,n){try{l(t,e,n)}catch(i){t[e]=n}return n}},function(e,n){e.exports=function(e){if(void 0==e)throw TypeError("Can't call method on "+e);return e}},function(e,n){var i=Math.ceil,t=Math.floor;e.exports=function(e){return isNaN(e=+e)?0:(e>0?t:i)(e)}},function(e,n,i){var t;
/*!
  Copyright (c) 2016 Jed Watson.
  Licensed under the MIT License (MIT), see
  http://jedwatson.github.io/classnames
*/
/*!
  Copyright (c) 2016 Jed Watson.
  Licensed under the MIT License (MIT), see
  http://jedwatson.github.io/classnames
*/
!function(){"use strict";var i=function(){function e(){}function n(e,n){for(var i=n.length,t=0;t<i;++t)l(e,n[t])}e.prototype=Object.create(null);var i={}.hasOwnProperty;var t=/\s+/;function l(e,l){if(l){var r=typeof l;"string"===r?function(e,n){for(var i=n.split(t),l=i.length,r=0;r<l;++r)e[i[r]]=!0}(e,l):Array.isArray(l)?n(e,l):"object"===r?function(e,n){for(var t in n)i.call(n,t)&&(e[t]=!!n[t])}(e,l):"number"===r&&function(e,n){e[n]=!0}(e,l)}}return function(){for(var i=arguments.length,t=Array(i),l=0;l<i;l++)t[l]=arguments[l];var r=new e;n(r,t);var o=[];for(var a in r)r[a]&&o.push(a);return o.join(" ")}}();void 0!==e&&e.exports?e.exports=i:void 0===(t=function(){return i}.apply(n,[]))||(e.exports=t)}()},function(e,n,i){var t=i(7).f,l=i(1),r=i(2)("toStringTag");e.exports=function(e,n,i){e&&!l(e=i?e:e.prototype,r)&&t(e,r,{configurable:!0,value:n})}},function(e,n,i){var t=i(20);e.exports=function(e){return Object(t(e))}},function(e,n,i){var t=i(1),l=i(24),r=i(16),o=i(63),a=r("IE_PROTO"),c=Object.prototype;e.exports=o?Object.getPrototypeOf:function(e){return e=l(e),t(e,a)?e[a]:"function"==typeof e.constructor&&e instanceof e.constructor?e.constructor.prototype:e instanceof Object?c:null}},function(e,n,i){"use strict";var t,l,r,o=i(25),a=i(5),c=i(1),p=i(2),y=i(17),h=p("iterator"),x=!1;[].keys&&("next"in(r=[].keys())?(l=o(o(r)))!==Object.prototype&&(t=l):x=!0),void 0==t&&(t={}),y||c(t,h)||a(t,h,function(){return this}),e.exports={IteratorPrototype:t,BUGGY_SAFARI_ITERATORS:x}},function(e,n,i){var t=i(21),l=Math.min;e.exports=function(e){return e>0?l(t(e),9007199254740991):0}},function(e,n,i){var t=i(1),l=i(14),r=i(68),o=i(15),a=r(!1);e.exports=function(e,n){var i,r=l(e),c=0,p=[];for(i in r)!t(o,i)&&t(r,i)&&p.push(i);for(;n.length>c;)t(r,i=n[c++])&&(~a(p,i)||p.push(i));return p}},function(e,n,i){var t=i(0),l=i(11),r=i(5),o=i(1),a=i(19),c=i(36),p=i(37),y=p.get,h=p.enforce,x=String(c).split("toString");l("inspectSource",function(e){return c.call(e)}),(e.exports=function(e,n,i,l){var c=!!l&&!!l.unsafe,p=!!l&&!!l.enumerable,y=!!l&&!!l.noTargetGet;"function"==typeof i&&("string"!=typeof n||o(i,"name")||r(i,"name",n),h(i).source=x.join("string"==typeof n?n:"")),e!==t?(c?!y&&e[n]&&(p=!0):delete e[n],p?e[n]=i:r(e,n,i)):p?e[n]=i:a(n,i)})(Function.prototype,"toString",function(){return"function"==typeof this&&y(this).source||c.call(this)})},function(e,n){var i={}.toString;e.exports=function(e){return i.call(e).slice(8,-1)}},function(e,n,i){var t=i(8),l=i(73),r=i(10),o=i(14),a=i(18),c=i(1),p=i(35),y=Object.getOwnPropertyDescriptor;n.f=t?y:function(e,n){if(e=o(e),n=a(n,!0),p)try{return y(e,n)}catch(e){}if(c(e,n))return r(!l.f.call(e,n),e[n])}},function(e,n,i){var t=i(0),l=i(31).f,r=i(5),o=i(29),a=i(19),c=i(71),p=i(65);e.exports=function(e,n){var i,y,h,x,s,u=e.target,d=e.global,f=e.stat;if(i=d?t:f?t[u]||a(u,{}):(t[u]||{}).prototype)for(y in n){if(x=n[y],h=e.noTargetGet?(s=l(i,y))&&s.value:i[y],!p(d?y:u+(f?".":"#")+y,e.forced)&&void 0!==h){if(typeof x==typeof h)continue;c(x,h)}(e.sham||h&&h.sham)&&r(x,"sham",!0),o(i,y,x,e)}}},function(e,n){var i=0,t=Math.random();e.exports=function(e){return"Symbol(".concat(void 0===e?"":e,")_",(++i+t).toString(36))}},function(e,n,i){var t=i(0),l=i(6),r=t.document,o=l(r)&&l(r.createElement);e.exports=function(e){return o?r.createElement(e):{}}},function(e,n,i){var t=i(8),l=i(4),r=i(34);e.exports=!t&&!l(function(){return 7!=Object.defineProperty(r("div"),"a",{get:function(){return 7}}).a})},function(e,n,i){var t=i(11);e.exports=t("native-function-to-string",Function.toString)},function(e,n,i){var t,l,r,o=i(76),a=i(0),c=i(6),p=i(5),y=i(1),h=i(16),x=i(15),s=a.WeakMap;if(o){var u=new s,d=u.get,f=u.has,g=u.set;t=function(e,n){return g.call(u,e,n),n},l=function(e){return d.call(u,e)||{}},r=function(e){return f.call(u,e)}}else{var v=h("state");x[v]=!0,t=function(e,n){return p(e,v,n),n},l=function(e){return y(e,v)?e[v]:{}},r=function(e){return y(e,v)}}e.exports={set:t,get:l,has:r,enforce:function(e){return r(e)?l(e):t(e,{})},getterFor:function(e){return function(n){var i;if(!c(n)||(i=l(n)).type!==e)throw TypeError("Incompatible receiver, "+e+" required");return i}}}},function(e,n,i){"use strict";Object.defineProperty(n,"__esModule",{value:!0});var t=Object.assign||function(e){for(var n=1;n<arguments.length;n++){var i=arguments[n];for(var t in i)Object.prototype.hasOwnProperty.call(i,t)&&(e[t]=i[t])}return e},l=o(i(22)),r=o(i(12));function o(e){return e&&e.__esModule?e:{default:e}}n.default=function(){var e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};if("undefined"==typeof document)throw new Error("`feather.replace()` only works in a browser environment.");var n=document.querySelectorAll("[data-feather]");Array.from(n).forEach(function(n){return function(e){var n=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},i=function(e){return Array.from(e.attributes).reduce(function(e,n){return e[n.name]=n.value,e},{})}(e),o=i["data-feather"];delete i["data-feather"];var a=r.default[o].toSvg(t({},n,i,{class:(0,l.default)(n.class,i.class)})),c=(new DOMParser).parseFromString(a,"image/svg+xml").querySelector("svg");e.parentNode.replaceChild(c,e)}(n,e)})}},function(e,n,i){"use strict";Object.defineProperty(n,"__esModule",{value:!0});var t,l=i(12),r=(t=l)&&t.__esModule?t:{default:t};n.default=function(e){var n=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};if(console.warn("feather.toSvg() is deprecated. Please use feather.icons[name].toSvg() instead."),!e)throw new Error("The required `key` (icon name) parameter is missing.");if(!r.default[e])throw new Error("No icon matching '"+e+"'. See the complete list of icons at https://feathericons.com");return r.default[e].toSvg(n)}},function(e){e.exports={activity:["pulse","health","action","motion"],airplay:["stream","cast","mirroring"],"alert-circle":["warning","alert","danger"],"alert-octagon":["warning","alert","danger"],"alert-triangle":["warning","alert","danger"],"align-center":["text alignment","center"],"align-justify":["text alignment","justified"],"align-left":["text alignment","left"],"align-right":["text alignment","right"],anchor:[],archive:["index","box"],"at-sign":["mention","at","email","message"],award:["achievement","badge"],aperture:["camera","photo"],"bar-chart":["statistics","diagram","graph"],"bar-chart-2":["statistics","diagram","graph"],battery:["power","electricity"],"battery-charging":["power","electricity"],bell:["alarm","notification","sound"],"bell-off":["alarm","notification","silent"],bluetooth:["wireless"],"book-open":["read","library"],book:["read","dictionary","booklet","magazine","library"],bookmark:["read","clip","marker","tag"],box:["cube"],briefcase:["work","bag","baggage","folder"],calendar:["date"],camera:["photo"],cast:["chromecast","airplay"],circle:["off","zero","record"],clipboard:["copy"],clock:["time","watch","alarm"],"cloud-drizzle":["weather","shower"],"cloud-lightning":["weather","bolt"],"cloud-rain":["weather"],"cloud-snow":["weather","blizzard"],cloud:["weather"],codepen:["logo"],codesandbox:["logo"],code:["source","programming"],coffee:["drink","cup","mug","tea","cafe","hot","beverage"],columns:["layout"],command:["keyboard","cmd","terminal","prompt"],compass:["navigation","safari","travel","direction"],copy:["clone","duplicate"],"corner-down-left":["arrow","return"],"corner-down-right":["arrow"],"corner-left-down":["arrow"],"corner-left-up":["arrow"],"corner-right-down":["arrow"],"corner-right-up":["arrow"],"corner-up-left":["arrow"],"corner-up-right":["arrow"],cpu:["processor","technology"],"credit-card":["purchase","payment","cc"],crop:["photo","image"],crosshair:["aim","target"],database:["storage","memory"],delete:["remove"],disc:["album","cd","dvd","music"],"dollar-sign":["currency","money","payment"],droplet:["water"],edit:["pencil","change"],"edit-2":["pencil","change"],"edit-3":["pencil","change"],eye:["view","watch"],"eye-off":["view","watch","hide","hidden"],"external-link":["outbound"],facebook:["logo","social"],"fast-forward":["music"],figma:["logo","design","tool"],"file-minus":["delete","remove","erase"],"file-plus":["add","create","new"],"file-text":["data","txt","pdf"],film:["movie","video"],filter:["funnel","hopper"],flag:["report"],"folder-minus":["directory"],"folder-plus":["directory"],folder:["directory"],framer:["logo","design","tool"],frown:["emoji","face","bad","sad","emotion"],gift:["present","box","birthday","party"],"git-branch":["code","version control"],"git-commit":["code","version control"],"git-merge":["code","version control"],"git-pull-request":["code","version control"],github:["logo","version control"],gitlab:["logo","version control"],globe:["world","browser","language","translate"],"hard-drive":["computer","server","memory","data"],hash:["hashtag","number","pound"],headphones:["music","audio","sound"],heart:["like","love","emotion"],"help-circle":["question mark"],hexagon:["shape","node.js","logo"],home:["house","living"],image:["picture"],inbox:["email"],instagram:["logo","camera"],key:["password","login","authentication","secure"],layers:["stack"],layout:["window","webpage"],"life-bouy":["help","life ring","support"],link:["chain","url"],"link-2":["chain","url"],linkedin:["logo","social media"],list:["options"],lock:["security","password","secure"],"log-in":["sign in","arrow","enter"],"log-out":["sign out","arrow","exit"],mail:["email","message"],"map-pin":["location","navigation","travel","marker"],map:["location","navigation","travel"],maximize:["fullscreen"],"maximize-2":["fullscreen","arrows","expand"],meh:["emoji","face","neutral","emotion"],menu:["bars","navigation","hamburger"],"message-circle":["comment","chat"],"message-square":["comment","chat"],"mic-off":["record","sound","mute"],mic:["record","sound","listen"],minimize:["exit fullscreen","close"],"minimize-2":["exit fullscreen","arrows","close"],minus:["subtract"],monitor:["tv","screen","display"],moon:["dark","night"],"more-horizontal":["ellipsis"],"more-vertical":["ellipsis"],"mouse-pointer":["arrow","cursor"],move:["arrows"],music:["note"],navigation:["location","travel"],"navigation-2":["location","travel"],octagon:["stop"],package:["box","container"],paperclip:["attachment"],pause:["music","stop"],"pause-circle":["music","audio","stop"],"pen-tool":["vector","drawing"],percent:["discount"],"phone-call":["ring"],"phone-forwarded":["call"],"phone-incoming":["call"],"phone-missed":["call"],"phone-off":["call","mute"],"phone-outgoing":["call"],phone:["call"],play:["music","start"],"pie-chart":["statistics","diagram"],"play-circle":["music","start"],plus:["add","new"],"plus-circle":["add","new"],"plus-square":["add","new"],pocket:["logo","save"],power:["on","off"],printer:["fax","office","device"],radio:["signal"],"refresh-cw":["synchronise","arrows"],"refresh-ccw":["arrows"],repeat:["loop","arrows"],rewind:["music"],"rotate-ccw":["arrow"],"rotate-cw":["arrow"],rss:["feed","subscribe"],save:["floppy disk"],scissors:["cut"],search:["find","magnifier","magnifying glass"],send:["message","mail","email","paper airplane","paper aeroplane"],settings:["cog","edit","gear","preferences"],"share-2":["network","connections"],shield:["security","secure"],"shield-off":["security","insecure"],"shopping-bag":["ecommerce","cart","purchase","store"],"shopping-cart":["ecommerce","cart","purchase","store"],shuffle:["music"],"skip-back":["music"],"skip-forward":["music"],slack:["logo"],slash:["ban","no"],sliders:["settings","controls"],smartphone:["cellphone","device"],smile:["emoji","face","happy","good","emotion"],speaker:["audio","music"],star:["bookmark","favorite","like"],"stop-circle":["media","music"],sun:["brightness","weather","light"],sunrise:["weather","time","morning","day"],sunset:["weather","time","evening","night"],tablet:["device"],tag:["label"],target:["logo","bullseye"],terminal:["code","command line","prompt"],thermometer:["temperature","celsius","fahrenheit","weather"],"thumbs-down":["dislike","bad","emotion"],"thumbs-up":["like","good","emotion"],"toggle-left":["on","off","switch"],"toggle-right":["on","off","switch"],tool:["settings","spanner"],trash:["garbage","delete","remove","bin"],"trash-2":["garbage","delete","remove","bin"],triangle:["delta"],truck:["delivery","van","shipping","transport","lorry"],tv:["television","stream"],twitch:["logo"],twitter:["logo","social"],type:["text"],umbrella:["rain","weather"],unlock:["security"],"user-check":["followed","subscribed"],"user-minus":["delete","remove","unfollow","unsubscribe"],"user-plus":["new","add","create","follow","subscribe"],"user-x":["delete","remove","unfollow","unsubscribe","unavailable"],user:["person","account"],users:["group"],"video-off":["camera","movie","film"],video:["camera","movie","film"],voicemail:["phone"],volume:["music","sound","mute"],"volume-1":["music","sound"],"volume-2":["music","sound"],"volume-x":["music","sound","mute"],watch:["clock","time"],"wifi-off":["disabled"],wifi:["connection","signal","wireless"],wind:["weather","air"],"x-circle":["cancel","close","delete","remove","times","clear"],"x-octagon":["delete","stop","alert","warning","times","clear"],"x-square":["cancel","close","delete","remove","times","clear"],x:["cancel","close","delete","remove","times","clear"],youtube:["logo","video","play"],"zap-off":["flash","camera","lightning"],zap:["flash","camera","lightning"],"zoom-in":["magnifying glass"],"zoom-out":["magnifying glass"]}},function(e){e.exports={activity:'<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>',airplay:'<path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1"></path><polygon points="12 15 17 21 7 21 12 15"></polygon>',"alert-circle":'<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>',"alert-octagon":'<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>',"alert-triangle":'<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',"align-center":'<line x1="18" y1="10" x2="6" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="18" y1="18" x2="6" y2="18"></line>',"align-justify":'<line x1="21" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="3" y2="18"></line>',"align-left":'<line x1="17" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="17" y1="18" x2="3" y2="18"></line>',"align-right":'<line x1="21" y1="10" x2="7" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="7" y2="18"></line>',anchor:'<circle cx="12" cy="5" r="3"></circle><line x1="12" y1="22" x2="12" y2="8"></line><path d="M5 12H2a10 10 0 0 0 20 0h-3"></path>',aperture:'<circle cx="12" cy="12" r="10"></circle><line x1="14.31" y1="8" x2="20.05" y2="17.94"></line><line x1="9.69" y1="8" x2="21.17" y2="8"></line><line x1="7.38" y1="12" x2="13.12" y2="2.06"></line><line x1="9.69" y1="16" x2="3.95" y2="6.06"></line><line x1="14.31" y1="16" x2="2.83" y2="16"></line><line x1="16.62" y1="12" x2="10.88" y2="21.94"></line>',archive:'<polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line>',"arrow-down-circle":'<circle cx="12" cy="12" r="10"></circle><polyline points="8 12 12 16 16 12"></polyline><line x1="12" y1="8" x2="12" y2="16"></line>',"arrow-down-left":'<line x1="17" y1="7" x2="7" y2="17"></line><polyline points="17 17 7 17 7 7"></polyline>',"arrow-down-right":'<line x1="7" y1="7" x2="17" y2="17"></line><polyline points="17 7 17 17 7 17"></polyline>',"arrow-down":'<line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline>',"arrow-left-circle":'<circle cx="12" cy="12" r="10"></circle><polyline points="12 8 8 12 12 16"></polyline><line x1="16" y1="12" x2="8" y2="12"></line>',"arrow-left":'<line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>',"arrow-right-circle":'<circle cx="12" cy="12" r="10"></circle><polyline points="12 16 16 12 12 8"></polyline><line x1="8" y1="12" x2="16" y2="12"></line>',"arrow-right":'<line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline>',"arrow-up-circle":'<circle cx="12" cy="12" r="10"></circle><polyline points="16 12 12 8 8 12"></polyline><line x1="12" y1="16" x2="12" y2="8"></line>',"arrow-up-left":'<line x1="17" y1="17" x2="7" y2="7"></line><polyline points="7 17 7 7 17 7"></polyline>',"arrow-up-right":'<line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline>',"arrow-up":'<line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline>',"at-sign":'<circle cx="12" cy="12" r="4"></circle><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"></path>',award:'<circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>',"bar-chart-2":'<line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>',"bar-chart":'<line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="16"></line>',"battery-charging":'<path d="M5 18H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.19M15 6h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3.19"></path><line x1="23" y1="13" x2="23" y2="11"></line><polyline points="11 6 7 12 13 12 9 18"></polyline>',battery:'<rect x="1" y="6" width="18" height="12" rx="2" ry="2"></rect><line x1="23" y1="13" x2="23" y2="11"></line>',"bell-off":'<path d="M13.73 21a2 2 0 0 1-3.46 0"></path><path d="M18.63 13A17.89 17.89 0 0 1 18 8"></path><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"></path><path d="M18 8a6 6 0 0 0-9.33-5"></path><line x1="1" y1="1" x2="23" y2="23"></line>',bell:'<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>',bluetooth:'<polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5"></polyline>',bold:'<path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>',"book-open":'<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>',book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>',bookmark:'<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>',box:'<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>',briefcase:'<rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>',calendar:'<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>',"camera-off":'<line x1="1" y1="1" x2="23" y2="23"></line><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56"></path>',camera:'<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle>',cast:'<path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"></path><line x1="2" y1="20" x2="2.01" y2="20"></line>',"check-circle":'<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>',"check-square":'<polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>',check:'<polyline points="20 6 9 17 4 12"></polyline>',"chevron-down":'<polyline points="6 9 12 15 18 9"></polyline>',"chevron-left":'<polyline points="15 18 9 12 15 6"></polyline>',"chevron-right":'<polyline points="9 18 15 12 9 6"></polyline>',"chevron-up":'<polyline points="18 15 12 9 6 15"></polyline>',"chevrons-down":'<polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline>',"chevrons-left":'<polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline>',"chevrons-right":'<polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline>',"chevrons-up":'<polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline>',chrome:'<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4"></circle><line x1="21.17" y1="8" x2="12" y2="8"></line><line x1="3.95" y1="6.06" x2="8.54" y2="14"></line><line x1="10.88" y1="21.94" x2="15.46" y2="14"></line>',circle:'<circle cx="12" cy="12" r="10"></circle>',clipboard:'<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>',clock:'<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',"cloud-drizzle":'<line x1="8" y1="19" x2="8" y2="21"></line><line x1="8" y1="13" x2="8" y2="15"></line><line x1="16" y1="19" x2="16" y2="21"></line><line x1="16" y1="13" x2="16" y2="15"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="12" y1="15" x2="12" y2="17"></line><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"></path>',"cloud-lightning":'<path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"></path><polyline points="13 11 9 17 15 17 11 23"></polyline>',"cloud-off":'<path d="M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3"></path><line x1="1" y1="1" x2="23" y2="23"></line>',"cloud-rain":'<line x1="16" y1="13" x2="16" y2="21"></line><line x1="8" y1="13" x2="8" y2="21"></line><line x1="12" y1="15" x2="12" y2="23"></line><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"></path>',"cloud-snow":'<path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"></path><line x1="8" y1="16" x2="8.01" y2="16"></line><line x1="8" y1="20" x2="8.01" y2="20"></line><line x1="12" y1="18" x2="12.01" y2="18"></line><line x1="12" y1="22" x2="12.01" y2="22"></line><line x1="16" y1="16" x2="16.01" y2="16"></line><line x1="16" y1="20" x2="16.01" y2="20"></line>',cloud:'<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>',code:'<polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline>',codepen:'<polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"></polygon><line x1="12" y1="22" x2="12" y2="15.5"></line><polyline points="22 8.5 12 15.5 2 8.5"></polyline><polyline points="2 15.5 12 8.5 22 15.5"></polyline><line x1="12" y1="2" x2="12" y2="8.5"></line>',codesandbox:'<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="7.5 4.21 12 6.81 16.5 4.21"></polyline><polyline points="7.5 19.79 7.5 14.6 3 12"></polyline><polyline points="21 12 16.5 14.6 16.5 19.79"></polyline><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>',coffee:'<path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line>',columns:'<path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7m0-18H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7m0-18v18"></path>',command:'<path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"></path>',compass:'<circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>',copy:'<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>',"corner-down-left":'<polyline points="9 10 4 15 9 20"></polyline><path d="M20 4v7a4 4 0 0 1-4 4H4"></path>',"corner-down-right":'<polyline points="15 10 20 15 15 20"></polyline><path d="M4 4v7a4 4 0 0 0 4 4h12"></path>',"corner-left-down":'<polyline points="14 15 9 20 4 15"></polyline><path d="M20 4h-7a4 4 0 0 0-4 4v12"></path>',"corner-left-up":'<polyline points="14 9 9 4 4 9"></polyline><path d="M20 20h-7a4 4 0 0 1-4-4V4"></path>',"corner-right-down":'<polyline points="10 15 15 20 20 15"></polyline><path d="M4 4h7a4 4 0 0 1 4 4v12"></path>',"corner-right-up":'<polyline points="10 9 15 4 20 9"></polyline><path d="M4 20h7a4 4 0 0 0 4-4V4"></path>',"corner-up-left":'<polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>',"corner-up-right":'<polyline points="15 14 20 9 15 4"></polyline><path d="M4 20v-7a4 4 0 0 1 4-4h12"></path>',cpu:'<rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line>',"credit-card":'<rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line>',crop:'<path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"></path><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"></path>',crosshair:'<circle cx="12" cy="12" r="10"></circle><line x1="22" y1="12" x2="18" y2="12"></line><line x1="6" y1="12" x2="2" y2="12"></line><line x1="12" y1="6" x2="12" y2="2"></line><line x1="12" y1="22" x2="12" y2="18"></line>',database:'<ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>',delete:'<path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path><line x1="18" y1="9" x2="12" y2="15"></line><line x1="12" y1="9" x2="18" y2="15"></line>',disc:'<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle>',"divide-circle":'<line x1="8" y1="12" x2="16" y2="12"></line><line x1="12" y1="16" x2="12" y2="16"></line><line x1="12" y1="8" x2="12" y2="8"></line><circle cx="12" cy="12" r="10"></circle>',"divide-square":'<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="8" y1="12" x2="16" y2="12"></line><line x1="12" y1="16" x2="12" y2="16"></line><line x1="12" y1="8" x2="12" y2="8"></line>',divide:'<circle cx="12" cy="6" r="2"></circle><line x1="5" y1="12" x2="19" y2="12"></line><circle cx="12" cy="18" r="2"></circle>',"dollar-sign":'<line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>',"download-cloud":'<polyline points="8 17 12 21 16 17"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"></path>',download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>',dribbble:'<circle cx="12" cy="12" r="10"></circle><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"></path>',droplet:'<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>',"edit-2":'<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>',"edit-3":'<path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>',edit:'<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>',"external-link":'<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line>',"eye-off":'<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>',eye:'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>',facebook:'<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>',"fast-forward":'<polygon points="13 19 22 12 13 5 13 19"></polygon><polygon points="2 19 11 12 2 5 2 19"></polygon>',feather:'<path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"></path><line x1="16" y1="8" x2="2" y2="22"></line><line x1="17.5" y1="15" x2="9" y2="15"></line>',figma:'<path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z"></path><path d="M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z"></path><path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z"></path><path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z"></path><path d="M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z"></path>',"file-minus":'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="9" y1="15" x2="15" y2="15"></line>',"file-plus":'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line>',"file-text":'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>',file:'<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline>',film:'<rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line>',filter:'<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>',flag:'<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line>',"folder-minus":'<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="9" y1="14" x2="15" y2="14"></line>',"folder-plus":'<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line>',folder:'<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>',framer:'<path d="M5 16V9h14V2H5l14 14h-7m-7 0l7 7v-7m-7 0h7"></path>',frown:'<circle cx="12" cy="12" r="10"></circle><path d="M16 16s-1.5-2-4-2-4 2-4 2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line>',gift:'<polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path>',"git-branch":'<line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path>',"git-commit":'<circle cx="12" cy="12" r="4"></circle><line x1="1.05" y1="12" x2="7" y2="12"></line><line x1="17.01" y1="12" x2="22.96" y2="12"></line>',"git-merge":'<circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><path d="M6 21V9a9 9 0 0 0 9 9"></path>',"git-pull-request":'<circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><path d="M13 6h3a2 2 0 0 1 2 2v7"></path><line x1="6" y1="9" x2="6" y2="21"></line>',github:'<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>',gitlab:'<path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"></path>',globe:'<circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>',grid:'<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>',"hard-drive":'<line x1="22" y1="12" x2="2" y2="12"></line><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path><line x1="6" y1="16" x2="6.01" y2="16"></line><line x1="10" y1="16" x2="10.01" y2="16"></line>',hash:'<line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line>',headphones:'<path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path>',heart:'<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>',"help-circle":'<circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line>',hexagon:'<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>',home:'<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>',image:'<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>',inbox:'<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>',info:'<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>',instagram:'<rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>',italic:'<line x1="19" y1="4" x2="10" y2="4"></line><line x1="14" y1="20" x2="5" y2="20"></line><line x1="15" y1="4" x2="9" y2="20"></line>',key:'<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>',layers:'<polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline>',layout:'<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line>',"life-buoy":'<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4"></circle><line x1="4.93" y1="4.93" x2="9.17" y2="9.17"></line><line x1="14.83" y1="14.83" x2="19.07" y2="19.07"></line><line x1="14.83" y1="9.17" x2="19.07" y2="4.93"></line><line x1="14.83" y1="9.17" x2="18.36" y2="5.64"></line><line x1="4.93" y1="19.07" x2="9.17" y2="14.83"></line>',"link-2":'<path d="M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3"></path><line x1="8" y1="12" x2="16" y2="12"></line>',link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>',linkedin:'<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle>',list:'<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>',loader:'<line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>',lock:'<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',"log-in":'<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line>',"log-out":'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line>',mail:'<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline>',"map-pin":'<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>',map:'<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line>',"maximize-2":'<polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line>',maximize:'<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>',meh:'<circle cx="12" cy="12" r="10"></circle><line x1="8" y1="15" x2="16" y2="15"></line><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line>',menu:'<line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line>',"message-circle":'<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>',"message-square":'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>',"mic-off":'<line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line>',mic:'<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line>',"minimize-2":'<polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line>',minimize:'<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>',"minus-circle":'<circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line>',"minus-square":'<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="8" y1="12" x2="16" y2="12"></line>',minus:'<line x1="5" y1="12" x2="19" y2="12"></line>',monitor:'<rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>',moon:'<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>',"more-horizontal":'<circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle>',"more-vertical":'<circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle>',"mouse-pointer":'<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"></path><path d="M13 13l6 6"></path>',move:'<polyline points="5 9 2 12 5 15"></polyline><polyline points="9 5 12 2 15 5"></polyline><polyline points="15 19 12 22 9 19"></polyline><polyline points="19 9 22 12 19 15"></polyline><line x1="2" y1="12" x2="22" y2="12"></line><line x1="12" y1="2" x2="12" y2="22"></line>',music:'<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>',"navigation-2":'<polygon points="12 2 19 21 12 17 5 21 12 2"></polygon>',navigation:'<polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>',octagon:'<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>',package:'<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>',paperclip:'<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>',"pause-circle":'<circle cx="12" cy="12" r="10"></circle><line x1="10" y1="15" x2="10" y2="9"></line><line x1="14" y1="15" x2="14" y2="9"></line>',pause:'<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>',"pen-tool":'<path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle>',percent:'<line x1="19" y1="5" x2="5" y2="19"></line><circle cx="6.5" cy="6.5" r="2.5"></circle><circle cx="17.5" cy="17.5" r="2.5"></circle>',"phone-call":'<path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94m-1 7.98v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>',"phone-forwarded":'<polyline points="19 1 23 5 19 9"></polyline><line x1="15" y1="5" x2="23" y2="5"></line><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>',"phone-incoming":'<polyline points="16 2 16 8 22 8"></polyline><line x1="23" y1="1" x2="16" y2="8"></line><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>',"phone-missed":'<line x1="23" y1="1" x2="17" y2="7"></line><line x1="17" y1="1" x2="23" y2="7"></line><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>',"phone-off":'<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" y1="1" x2="1" y2="23"></line>',"phone-outgoing":'<polyline points="23 7 23 1 17 1"></polyline><line x1="16" y1="8" x2="23" y2="1"></line><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>',phone:'<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>',"pie-chart":'<path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path>',"play-circle":'<circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon>',play:'<polygon points="5 3 19 12 5 21 5 3"></polygon>',"plus-circle":'<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line>',"plus-square":'<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line>',plus:'<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',pocket:'<path d="M4 3h16a2 2 0 0 1 2 2v6a10 10 0 0 1-10 10A10 10 0 0 1 2 11V5a2 2 0 0 1 2-2z"></path><polyline points="8 10 12 14 16 10"></polyline>',power:'<path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line>',printer:'<polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect>',radio:'<circle cx="12" cy="12" r="2"></circle><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"></path>',"refresh-ccw":'<polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>',"refresh-cw":'<polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>',repeat:'<polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path>',rewind:'<polygon points="11 19 2 12 11 5 11 19"></polygon><polygon points="22 19 13 12 22 5 22 19"></polygon>',"rotate-ccw":'<polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>',"rotate-cw":'<polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>',rss:'<path d="M4 11a9 9 0 0 1 9 9"></path><path d="M4 4a16 16 0 0 1 16 16"></path><circle cx="5" cy="19" r="1"></circle>',save:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline>',scissors:'<circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="20" y1="4" x2="8.12" y2="15.88"></line><line x1="14.47" y1="14.48" x2="20" y2="20"></line><line x1="8.12" y1="8.12" x2="12" y2="12"></line>',search:'<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>',send:'<line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>',server:'<rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line>',settings:'<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>',"share-2":'<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>',share:'<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line>',"shield-off":'<path d="M19.69 14a6.9 6.9 0 0 0 .31-2V5l-8-3-3.16 1.18"></path><path d="M4.73 4.73L4 5v7c0 6 8 10 8 10a20.29 20.29 0 0 0 5.62-4.38"></path><line x1="1" y1="1" x2="23" y2="23"></line>',shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>',"shopping-bag":'<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path>',"shopping-cart":'<circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>',shuffle:'<polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line>',sidebar:'<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line>',"skip-back":'<polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line>',"skip-forward":'<polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line>',slack:'<path d="M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5z"></path><path d="M20.5 10H19V8.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"></path><path d="M9.5 14c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5S8 21.33 8 20.5v-5c0-.83.67-1.5 1.5-1.5z"></path><path d="M3.5 14H5v1.5c0 .83-.67 1.5-1.5 1.5S2 16.33 2 15.5 2.67 14 3.5 14z"></path><path d="M14 14.5c0-.83.67-1.5 1.5-1.5h5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-5c-.83 0-1.5-.67-1.5-1.5z"></path><path d="M15.5 19H14v1.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5z"></path><path d="M10 9.5C10 8.67 9.33 8 8.5 8h-5C2.67 8 2 8.67 2 9.5S2.67 11 3.5 11h5c.83 0 1.5-.67 1.5-1.5z"></path><path d="M8.5 5H10V3.5C10 2.67 9.33 2 8.5 2S7 2.67 7 3.5 7.67 5 8.5 5z"></path>',slash:'<circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>',sliders:'<line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line>',smartphone:'<rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>',smile:'<circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line>',speaker:'<rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><circle cx="12" cy="14" r="4"></circle><line x1="12" y1="6" x2="12.01" y2="6"></line>',square:'<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>',star:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>',"stop-circle":'<circle cx="12" cy="12" r="10"></circle><rect x="9" y="9" width="6" height="6"></rect>',sun:'<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>',sunrise:'<path d="M17 18a5 5 0 0 0-10 0"></path><line x1="12" y1="2" x2="12" y2="9"></line><line x1="4.22" y1="10.22" x2="5.64" y2="11.64"></line><line x1="1" y1="18" x2="3" y2="18"></line><line x1="21" y1="18" x2="23" y2="18"></line><line x1="18.36" y1="11.64" x2="19.78" y2="10.22"></line><line x1="23" y1="22" x2="1" y2="22"></line><polyline points="8 6 12 2 16 6"></polyline>',sunset:'<path d="M17 18a5 5 0 0 0-10 0"></path><line x1="12" y1="9" x2="12" y2="2"></line><line x1="4.22" y1="10.22" x2="5.64" y2="11.64"></line><line x1="1" y1="18" x2="3" y2="18"></line><line x1="21" y1="18" x2="23" y2="18"></line><line x1="18.36" y1="11.64" x2="19.78" y2="10.22"></line><line x1="23" y1="22" x2="1" y2="22"></line><polyline points="16 5 12 9 8 5"></polyline>',tablet:'<rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>',tag:'<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line>',target:'<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle>',terminal:'<polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line>',thermometer:'<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"></path>',"thumbs-down":'<path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>',"thumbs-up":'<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>',"toggle-left":'<rect x="1" y="5" width="22" height="14" rx="7" ry="7"></rect><circle cx="8" cy="12" r="3"></circle>',"toggle-right":'<rect x="1" y="5" width="22" height="14" rx="7" ry="7"></rect><circle cx="16" cy="12" r="3"></circle>',tool:'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>',"trash-2":'<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>',trash:'<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>',trello:'<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><rect x="7" y="7" width="3" height="9"></rect><rect x="14" y="7" width="3" height="5"></rect>',"trending-down":'<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline>',"trending-up":'<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline>',triangle:'<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>',truck:'<rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle>',tv:'<rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect><polyline points="17 2 12 7 7 2"></polyline>',twitch:'<path d="M21 2H3v16h5v4l4-4h5l4-4V2zm-10 9V7m5 4V7"></path>',twitter:'<path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"></path>',type:'<polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line>',umbrella:'<path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7"></path>',underline:'<path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"></path><line x1="4" y1="21" x2="20" y2="21"></line>',unlock:'<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>',"upload-cloud":'<polyline points="16 16 12 12 8 16"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path><polyline points="16 16 12 12 8 16"></polyline>',upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line>',"user-check":'<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><polyline points="17 11 19 13 23 9"></polyline>',"user-minus":'<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="23" y1="11" x2="17" y2="11"></line>',"user-plus":'<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line>',"user-x":'<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="18" y1="8" x2="23" y2="13"></line><line x1="23" y1="8" x2="18" y2="13"></line>',user:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>',users:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',"video-off":'<path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"></path><line x1="1" y1="1" x2="23" y2="23"></line>',video:'<polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>',voicemail:'<circle cx="5.5" cy="11.5" r="4.5"></circle><circle cx="18.5" cy="11.5" r="4.5"></circle><line x1="5.5" y1="16" x2="18.5" y2="16"></line>',"volume-1":'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>',"volume-2":'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>',"volume-x":'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>',volume:'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>',watch:'<circle cx="12" cy="12" r="7"></circle><polyline points="12 9 12 12 13.5 13.5"></polyline><path d="M16.51 17.35l-.35 3.83a2 2 0 0 1-2 1.82H9.83a2 2 0 0 1-2-1.82l-.35-3.83m.01-10.7l.35-3.83A2 2 0 0 1 9.83 1h4.35a2 2 0 0 1 2 1.82l.35 3.83"></path>',"wifi-off":'<line x1="1" y1="1" x2="23" y2="23"></line><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path><path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line>',wifi:'<path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line>',wind:'<path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"></path>',"x-circle":'<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',"x-octagon":'<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',"x-square":'<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line>',x:'<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',youtube:'<path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>',"zap-off":'<polyline points="12.41 6.75 13 2 10.57 4.92"></polyline><polyline points="18.57 12.91 21 10 15.66 10"></polyline><polyline points="8 8 3 14 12 14 11 22 16 16"></polyline><line x1="1" y1="1" x2="23" y2="23"></line>',zap:'<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>',"zoom-in":'<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line>',"zoom-out":'<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line>'}},function(e){e.exports={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"}},function(e,n,i){"use strict";Object.defineProperty(n,"__esModule",{value:!0});var t=Object.assign||function(e){for(var n=1;n<arguments.length;n++){var i=arguments[n];for(var t in i)Object.prototype.hasOwnProperty.call(i,t)&&(e[t]=i[t])}return e},l=function(){function e(e,n){for(var i=0;i<n.length;i++){var t=n[i];t.enumerable=t.enumerable||!1,t.configurable=!0,"value"in t&&(t.writable=!0),Object.defineProperty(e,t.key,t)}}return function(n,i,t){return i&&e(n.prototype,i),t&&e(n,t),n}}(),r=a(i(22)),o=a(i(42));function a(e){return e&&e.__esModule?e:{default:e}}var c=function(){function e(n,i){var l=arguments.length>2&&void 0!==arguments[2]?arguments[2]:[];!function(e,n){if(!(e instanceof n))throw new TypeError("Cannot call a class as a function")}(this,e),this.name=n,this.contents=i,this.tags=l,this.attrs=t({},o.default,{class:"feather feather-"+n})}return l(e,[{key:"toSvg",value:function(){var e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{};return"<svg "+function(e){return Object.keys(e).map(function(n){return n+'="'+e[n]+'"'}).join(" ")}(t({},this.attrs,e,{class:(0,r.default)(this.attrs.class,e.class)}))+">"+this.contents+"</svg>"}},{key:"toString",value:function(){return this.contents}}]),e}();n.default=c},function(e,n,i){"use strict";var t=o(i(12)),l=o(i(39)),r=o(i(38));function o(e){return e&&e.__esModule?e:{default:e}}e.exports={icons:t.default,toSvg:l.default,replace:r.default}},function(e,n,i){e.exports=i(0)},function(e,n,i){var t=i(2)("iterator"),l=!1;try{var r=0,o={next:function(){return{done:!!r++}},return:function(){l=!0}};o[t]=function(){return this},Array.from(o,function(){throw 2})}catch(e){}e.exports=function(e,n){if(!n&&!l)return!1;var i=!1;try{var r={};r[t]=function(){return{next:function(){return{done:i=!0}}}},e(r)}catch(e){}return i}},function(e,n,i){var t=i(30),l=i(2)("toStringTag"),r="Arguments"==t(function(){return arguments}());e.exports=function(e){var n,i,o;return void 0===e?"Undefined":null===e?"Null":"string"==typeof(i=function(e,n){try{return e[n]}catch(e){}}(n=Object(e),l))?i:r?t(n):"Object"==(o=t(n))&&"function"==typeof n.callee?"Arguments":o}},function(e,n,i){var t=i(47),l=i(9),r=i(2)("iterator");e.exports=function(e){if(void 0!=e)return e[r]||e["@@iterator"]||l[t(e)]}},function(e,n,i){"use strict";var t=i(18),l=i(7),r=i(10);e.exports=function(e,n,i){var o=t(n);o in e?l.f(e,o,r(0,i)):e[o]=i}},function(e,n,i){var t=i(2),l=i(9),r=t("iterator"),o=Array.prototype;e.exports=function(e){return void 0!==e&&(l.Array===e||o[r]===e)}},function(e,n,i){var t=i(3);e.exports=function(e,n,i,l){try{return l?n(t(i)[0],i[1]):n(i)}catch(n){var r=e.return;throw void 0!==r&&t(r.call(e)),n}}},function(e,n){e.exports=function(e){if("function"!=typeof e)throw TypeError(String(e)+" is not a function");return e}},function(e,n,i){var t=i(52);e.exports=function(e,n,i){if(t(e),void 0===n)return e;switch(i){case 0:return function(){return e.call(n)};case 1:return function(i){return e.call(n,i)};case 2:return function(i,t){return e.call(n,i,t)};case 3:return function(i,t,l){return e.call(n,i,t,l)}}return function(){return e.apply(n,arguments)}}},function(e,n,i){"use strict";var t=i(53),l=i(24),r=i(51),o=i(50),a=i(27),c=i(49),p=i(48);e.exports=function(e){var n,i,y,h,x=l(e),s="function"==typeof this?this:Array,u=arguments.length,d=u>1?arguments[1]:void 0,f=void 0!==d,g=0,v=p(x);if(f&&(d=t(d,u>2?arguments[2]:void 0,2)),void 0==v||s==Array&&o(v))for(i=new s(n=a(x.length));n>g;g++)c(i,g,f?d(x[g],g):x[g]);else for(h=v.call(x),i=new s;!(y=h.next()).done;g++)c(i,g,f?r(h,d,[y.value,g],!0):y.value);return i.length=g,i}},function(e,n,i){var t=i(32),l=i(54);t({target:"Array",stat:!0,forced:!i(46)(function(e){Array.from(e)})},{from:l})},function(e,n,i){var t=i(6),l=i(3);e.exports=function(e,n){if(l(e),!t(n)&&null!==n)throw TypeError("Can't set "+String(n)+" as a prototype")}},function(e,n,i){var t=i(56);e.exports=Object.setPrototypeOf||("__proto__"in{}?function(){var e,n=!1,i={};try{(e=Object.getOwnPropertyDescriptor(Object.prototype,"__proto__").set).call(i,[]),n=i instanceof Array}catch(e){}return function(i,l){return t(i,l),n?e.call(i,l):i.__proto__=l,i}}():void 0)},function(e,n,i){var t=i(0).document;e.exports=t&&t.documentElement},function(e,n,i){var t=i(28),l=i(13);e.exports=Object.keys||function(e){return t(e,l)}},function(e,n,i){var t=i(8),l=i(7),r=i(3),o=i(59);e.exports=t?Object.defineProperties:function(e,n){r(e);for(var i,t=o(n),a=t.length,c=0;a>c;)l.f(e,i=t[c++],n[i]);return e}},function(e,n,i){var t=i(3),l=i(60),r=i(13),o=i(15),a=i(58),c=i(34),p=i(16)("IE_PROTO"),y=function(){},h=function(){var e,n=c("iframe"),i=r.length;for(n.style.display="none",a.appendChild(n),n.src=String("javascript:"),(e=n.contentWindow.document).open(),e.write("<script>document.F=Object<\/script>"),e.close(),h=e.F;i--;)delete h.prototype[r[i]];return h()};e.exports=Object.create||function(e,n){var i;return null!==e?(y.prototype=t(e),i=new y,y.prototype=null,i[p]=e):i=h(),void 0===n?i:l(i,n)},o[p]=!0},function(e,n,i){var t=i(4);e.exports=!!Object.getOwnPropertySymbols&&!t(function(){return!String(Symbol())})},function(e,n,i){var t=i(4);e.exports=!t(function(){function e(){}return e.prototype.constructor=null,Object.getPrototypeOf(new e)!==e.prototype})},function(e,n,i){"use strict";var t=i(26).IteratorPrototype,l=i(61),r=i(10),o=i(23),a=i(9),c=function(){return this};e.exports=function(e,n,i){var p=n+" Iterator";return e.prototype=l(t,{next:r(1,i)}),o(e,p,!1,!0),a[p]=c,e}},function(e,n,i){var t=i(4),l=/#|\.prototype\./,r=function(e,n){var i=a[o(e)];return i==p||i!=c&&("function"==typeof n?t(n):!!n)},o=r.normalize=function(e){return String(e).replace(l,".").toLowerCase()},a=r.data={},c=r.NATIVE="N",p=r.POLYFILL="P";e.exports=r},function(e,n){n.f=Object.getOwnPropertySymbols},function(e,n,i){var t=i(21),l=Math.max,r=Math.min;e.exports=function(e,n){var i=t(e);return i<0?l(i+n,0):r(i,n)}},function(e,n,i){var t=i(14),l=i(27),r=i(67);e.exports=function(e){return function(n,i,o){var a,c=t(n),p=l(c.length),y=r(o,p);if(e&&i!=i){for(;p>y;)if((a=c[y++])!=a)return!0}else for(;p>y;y++)if((e||y in c)&&c[y]===i)return e||y||0;return!e&&-1}}},function(e,n,i){var t=i(28),l=i(13).concat("length","prototype");n.f=Object.getOwnPropertyNames||function(e){return t(e,l)}},function(e,n,i){var t=i(0),l=i(69),r=i(66),o=i(3),a=t.Reflect;e.exports=a&&a.ownKeys||function(e){var n=l.f(o(e)),i=r.f;return i?n.concat(i(e)):n}},function(e,n,i){var t=i(1),l=i(70),r=i(31),o=i(7);e.exports=function(e,n){for(var i=l(n),a=o.f,c=r.f,p=0;p<i.length;p++){var y=i[p];t(e,y)||a(e,y,c(n,y))}}},function(e,n,i){var t=i(4),l=i(30),r="".split;e.exports=t(function(){return!Object("z").propertyIsEnumerable(0)})?function(e){return"String"==l(e)?r.call(e,""):Object(e)}:Object},function(e,n,i){"use strict";var t={}.propertyIsEnumerable,l=Object.getOwnPropertyDescriptor,r=l&&!t.call({1:2},1);n.f=r?function(e){var n=l(this,e);return!!n&&n.enumerable}:t},function(e,n,i){"use strict";var t=i(32),l=i(64),r=i(25),o=i(57),a=i(23),c=i(5),p=i(29),y=i(2),h=i(17),x=i(9),s=i(26),u=s.IteratorPrototype,d=s.BUGGY_SAFARI_ITERATORS,f=y("iterator"),g=function(){return this};e.exports=function(e,n,i,y,s,v,m){l(i,n,y);var w,M,b,z=function(e){if(e===s&&O)return O;if(!d&&e in H)return H[e];switch(e){case"keys":case"values":case"entries":return function(){return new i(this,e)}}return function(){return new i(this)}},A=n+" Iterator",k=!1,H=e.prototype,V=H[f]||H["@@iterator"]||s&&H[s],O=!d&&V||z(s),j="Array"==n&&H.entries||V;if(j&&(w=r(j.call(new e)),u!==Object.prototype&&w.next&&(h||r(w)===u||(o?o(w,u):"function"!=typeof w[f]&&c(w,f,g)),a(w,A,!0,!0),h&&(x[A]=g))),"values"==s&&V&&"values"!==V.name&&(k=!0,O=function(){return V.call(this)}),h&&!m||H[f]===O||c(H,f,O),x[n]=O,s)if(M={values:z("values"),keys:v?O:z("keys"),entries:z("entries")},m)for(b in M)!d&&!k&&b in H||p(H,b,M[b]);else t({target:n,proto:!0,forced:d||k},M);return M}},function(e,n){var i;i=function(){return this}();try{i=i||Function("return this")()||(0,eval)("this")}catch(e){"object"==typeof window&&(i=window)}e.exports=i},function(e,n,i){var t=i(0),l=i(36),r=t.WeakMap;e.exports="function"==typeof r&&/native code/.test(l.call(r))},function(e,n,i){var t=i(21),l=i(20);e.exports=function(e,n,i){var r,o,a=String(l(e)),c=t(n),p=a.length;return c<0||c>=p?i?"":void 0:(r=a.charCodeAt(c))<55296||r>56319||c+1===p||(o=a.charCodeAt(c+1))<56320||o>57343?i?a.charAt(c):r:i?a.slice(c,c+2):o-56320+(r-55296<<10)+65536}},function(e,n,i){"use strict";var t=i(77),l=i(37),r=i(74),o=l.set,a=l.getterFor("String Iterator");r(String,"String",function(e){o(this,{type:"String Iterator",string:String(e),index:0})},function(){var e,n=a(this),i=n.string,l=n.index;return l>=i.length?{value:void 0,done:!0}:(e=t(i,l,!0),n.index+=e.length,{value:e,done:!1})})},function(e,n,i){i(78),i(55);var t=i(45);e.exports=t.Array.from},function(e,n,i){i(79),e.exports=i(44)}])});
//# sourceMappingURL=feather.min.js.map

/*! highlight.js v9.12.0 | BSD3 License | git.io/hljslicense */
!function(e){var n="object"==typeof window&&window||"object"==typeof self&&self;"undefined"!=typeof exports?e(exports):n&&(n.hljs=e({}),"function"==typeof define&&define.amd&&define([],function(){return n.hljs}))}(function(e){function n(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function t(e){return e.nodeName.toLowerCase()}function r(e,n){var t=e&&e.exec(n);return t&&0===t.index}function a(e){return k.test(e)}function i(e){var n,t,r,i,o=e.className+" ";if(o+=e.parentNode?e.parentNode.className:"",t=B.exec(o))return w(t[1])?t[1]:"no-highlight";for(o=o.split(/\s+/),n=0,r=o.length;r>n;n++)if(i=o[n],a(i)||w(i))return i}function o(e){var n,t={},r=Array.prototype.slice.call(arguments,1);for(n in e)t[n]=e[n];return r.forEach(function(e){for(n in e)t[n]=e[n]}),t}function u(e){var n=[];return function r(e,a){for(var i=e.firstChild;i;i=i.nextSibling)3===i.nodeType?a+=i.nodeValue.length:1===i.nodeType&&(n.push({event:"start",offset:a,node:i}),a=r(i,a),t(i).match(/br|hr|img|input/)||n.push({event:"stop",offset:a,node:i}));return a}(e,0),n}function c(e,r,a){function i(){return e.length&&r.length?e[0].offset!==r[0].offset?e[0].offset<r[0].offset?e:r:"start"===r[0].event?e:r:e.length?e:r}function o(e){function r(e){return" "+e.nodeName+'="'+n(e.value).replace('"',"&quot;")+'"'}s+="<"+t(e)+E.map.call(e.attributes,r).join("")+">"}function u(e){s+="</"+t(e)+">"}function c(e){("start"===e.event?o:u)(e.node)}for(var l=0,s="",f=[];e.length||r.length;){var g=i();if(s+=n(a.substring(l,g[0].offset)),l=g[0].offset,g===e){f.reverse().forEach(u);do c(g.splice(0,1)[0]),g=i();while(g===e&&g.length&&g[0].offset===l);f.reverse().forEach(o)}else"start"===g[0].event?f.push(g[0].node):f.pop(),c(g.splice(0,1)[0])}return s+n(a.substr(l))}function l(e){return e.v&&!e.cached_variants&&(e.cached_variants=e.v.map(function(n){return o(e,{v:null},n)})),e.cached_variants||e.eW&&[o(e)]||[e]}function s(e){function n(e){return e&&e.source||e}function t(t,r){return new RegExp(n(t),"m"+(e.cI?"i":"")+(r?"g":""))}function r(a,i){if(!a.compiled){if(a.compiled=!0,a.k=a.k||a.bK,a.k){var o={},u=function(n,t){e.cI&&(t=t.toLowerCase()),t.split(" ").forEach(function(e){var t=e.split("|");o[t[0]]=[n,t[1]?Number(t[1]):1]})};"string"==typeof a.k?u("keyword",a.k):x(a.k).forEach(function(e){u(e,a.k[e])}),a.k=o}a.lR=t(a.l||/\w+/,!0),i&&(a.bK&&(a.b="\\b("+a.bK.split(" ").join("|")+")\\b"),a.b||(a.b=/\B|\b/),a.bR=t(a.b),a.e||a.eW||(a.e=/\B|\b/),a.e&&(a.eR=t(a.e)),a.tE=n(a.e)||"",a.eW&&i.tE&&(a.tE+=(a.e?"|":"")+i.tE)),a.i&&(a.iR=t(a.i)),null==a.r&&(a.r=1),a.c||(a.c=[]),a.c=Array.prototype.concat.apply([],a.c.map(function(e){return l("self"===e?a:e)})),a.c.forEach(function(e){r(e,a)}),a.starts&&r(a.starts,i);var c=a.c.map(function(e){return e.bK?"\\.?("+e.b+")\\.?":e.b}).concat([a.tE,a.i]).map(n).filter(Boolean);a.t=c.length?t(c.join("|"),!0):{exec:function(){return null}}}}r(e)}function f(e,t,a,i){function o(e,n){var t,a;for(t=0,a=n.c.length;a>t;t++)if(r(n.c[t].bR,e))return n.c[t]}function u(e,n){if(r(e.eR,n)){for(;e.endsParent&&e.parent;)e=e.parent;return e}return e.eW?u(e.parent,n):void 0}function c(e,n){return!a&&r(n.iR,e)}function l(e,n){var t=N.cI?n[0].toLowerCase():n[0];return e.k.hasOwnProperty(t)&&e.k[t]}function p(e,n,t,r){var a=r?"":I.classPrefix,i='<span class="'+a,o=t?"":C;return i+=e+'">',i+n+o}function h(){var e,t,r,a;if(!E.k)return n(k);for(a="",t=0,E.lR.lastIndex=0,r=E.lR.exec(k);r;)a+=n(k.substring(t,r.index)),e=l(E,r),e?(B+=e[1],a+=p(e[0],n(r[0]))):a+=n(r[0]),t=E.lR.lastIndex,r=E.lR.exec(k);return a+n(k.substr(t))}function d(){var e="string"==typeof E.sL;if(e&&!y[E.sL])return n(k);var t=e?f(E.sL,k,!0,x[E.sL]):g(k,E.sL.length?E.sL:void 0);return E.r>0&&(B+=t.r),e&&(x[E.sL]=t.top),p(t.language,t.value,!1,!0)}function b(){L+=null!=E.sL?d():h(),k=""}function v(e){L+=e.cN?p(e.cN,"",!0):"",E=Object.create(e,{parent:{value:E}})}function m(e,n){if(k+=e,null==n)return b(),0;var t=o(n,E);if(t)return t.skip?k+=n:(t.eB&&(k+=n),b(),t.rB||t.eB||(k=n)),v(t,n),t.rB?0:n.length;var r=u(E,n);if(r){var a=E;a.skip?k+=n:(a.rE||a.eE||(k+=n),b(),a.eE&&(k=n));do E.cN&&(L+=C),E.skip||(B+=E.r),E=E.parent;while(E!==r.parent);return r.starts&&v(r.starts,""),a.rE?0:n.length}if(c(n,E))throw new Error('Illegal lexeme "'+n+'" for mode "'+(E.cN||"<unnamed>")+'"');return k+=n,n.length||1}var N=w(e);if(!N)throw new Error('Unknown language: "'+e+'"');s(N);var R,E=i||N,x={},L="";for(R=E;R!==N;R=R.parent)R.cN&&(L=p(R.cN,"",!0)+L);var k="",B=0;try{for(var M,j,O=0;;){if(E.t.lastIndex=O,M=E.t.exec(t),!M)break;j=m(t.substring(O,M.index),M[0]),O=M.index+j}for(m(t.substr(O)),R=E;R.parent;R=R.parent)R.cN&&(L+=C);return{r:B,value:L,language:e,top:E}}catch(T){if(T.message&&-1!==T.message.indexOf("Illegal"))return{r:0,value:n(t)};throw T}}function g(e,t){t=t||I.languages||x(y);var r={r:0,value:n(e)},a=r;return t.filter(w).forEach(function(n){var t=f(n,e,!1);t.language=n,t.r>a.r&&(a=t),t.r>r.r&&(a=r,r=t)}),a.language&&(r.second_best=a),r}function p(e){return I.tabReplace||I.useBR?e.replace(M,function(e,n){return I.useBR&&"\n"===e?"<br>":I.tabReplace?n.replace(/\t/g,I.tabReplace):""}):e}function h(e,n,t){var r=n?L[n]:t,a=[e.trim()];return e.match(/\bhljs\b/)||a.push("hljs"),-1===e.indexOf(r)&&a.push(r),a.join(" ").trim()}function d(e){var n,t,r,o,l,s=i(e);a(s)||(I.useBR?(n=document.createElementNS("http://www.w3.org/1999/xhtml","div"),n.innerHTML=e.innerHTML.replace(/\n/g,"").replace(/<br[ \/]*>/g,"\n")):n=e,l=n.textContent,r=s?f(s,l,!0):g(l),t=u(n),t.length&&(o=document.createElementNS("http://www.w3.org/1999/xhtml","div"),o.innerHTML=r.value,r.value=c(t,u(o),l)),r.value=p(r.value),e.innerHTML=r.value,e.className=h(e.className,s,r.language),e.result={language:r.language,re:r.r},r.second_best&&(e.second_best={language:r.second_best.language,re:r.second_best.r}))}function b(e){I=o(I,e)}function v(){if(!v.called){v.called=!0;var e=document.querySelectorAll("pre code");E.forEach.call(e,d)}}function m(){addEventListener("DOMContentLoaded",v,!1),addEventListener("load",v,!1)}function N(n,t){var r=y[n]=t(e);r.aliases&&r.aliases.forEach(function(e){L[e]=n})}function R(){return x(y)}function w(e){return e=(e||"").toLowerCase(),y[e]||y[L[e]]}var E=[],x=Object.keys,y={},L={},k=/^(no-?highlight|plain|text)$/i,B=/\blang(?:uage)?-([\w-]+)\b/i,M=/((^(<[^>]+>|\t|)+|(?:\n)))/gm,C="</span>",I={classPrefix:"hljs-",tabReplace:null,useBR:!1,languages:void 0};return e.highlight=f,e.highlightAuto=g,e.fixMarkup=p,e.highlightBlock=d,e.configure=b,e.initHighlighting=v,e.initHighlightingOnLoad=m,e.registerLanguage=N,e.listLanguages=R,e.getLanguage=w,e.inherit=o,e.IR="[a-zA-Z]\\w*",e.UIR="[a-zA-Z_]\\w*",e.NR="\\b\\d+(\\.\\d+)?",e.CNR="(-?)(\\b0[xX][a-fA-F0-9]+|(\\b\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?)",e.BNR="\\b(0b[01]+)",e.RSR="!|!=|!==|%|%=|&|&&|&=|\\*|\\*=|\\+|\\+=|,|-|-=|/=|/|:|;|<<|<<=|<=|<|===|==|=|>>>=|>>=|>=|>>>|>>|>|\\?|\\[|\\{|\\(|\\^|\\^=|\\||\\|=|\\|\\||~",e.BE={b:"\\\\[\\s\\S]",r:0},e.ASM={cN:"string",b:"'",e:"'",i:"\\n",c:[e.BE]},e.QSM={cN:"string",b:'"',e:'"',i:"\\n",c:[e.BE]},e.PWM={b:/\b(a|an|the|are|I'm|isn't|don't|doesn't|won't|but|just|should|pretty|simply|enough|gonna|going|wtf|so|such|will|you|your|they|like|more)\b/},e.C=function(n,t,r){var a=e.inherit({cN:"comment",b:n,e:t,c:[]},r||{});return a.c.push(e.PWM),a.c.push({cN:"doctag",b:"(?:TODO|FIXME|NOTE|BUG|XXX):",r:0}),a},e.CLCM=e.C("//","$"),e.CBCM=e.C("/\\*","\\*/"),e.HCM=e.C("#","$"),e.NM={cN:"number",b:e.NR,r:0},e.CNM={cN:"number",b:e.CNR,r:0},e.BNM={cN:"number",b:e.BNR,r:0},e.CSSNM={cN:"number",b:e.NR+"(%|em|ex|ch|rem|vw|vh|vmin|vmax|cm|mm|in|pt|pc|px|deg|grad|rad|turn|s|ms|Hz|kHz|dpi|dpcm|dppx)?",r:0},e.RM={cN:"regexp",b:/\//,e:/\/[gimuy]*/,i:/\n/,c:[e.BE,{b:/\[/,e:/\]/,r:0,c:[e.BE]}]},e.TM={cN:"title",b:e.IR,r:0},e.UTM={cN:"title",b:e.UIR,r:0},e.METHOD_GUARD={b:"\\.\\s*"+e.UIR,r:0},e});hljs.registerLanguage("ruby",function(e){var b="[a-zA-Z_]\\w*[!?=]?|[-+~]\\@|<<|>>|=~|===?|<=>|[<>]=?|\\*\\*|[-/+%^&*~`|]|\\[\\]=?",r={keyword:"and then defined module in return redo if BEGIN retry end for self when next until do begin unless END rescue else break undef not super class case require yield alias while ensure elsif or include attr_reader attr_writer attr_accessor",literal:"true false nil"},c={cN:"doctag",b:"@[A-Za-z]+"},a={b:"#<",e:">"},s=[e.C("#","$",{c:[c]}),e.C("^\\=begin","^\\=end",{c:[c],r:10}),e.C("^__END__","\\n$")],n={cN:"subst",b:"#\\{",e:"}",k:r},t={cN:"string",c:[e.BE,n],v:[{b:/'/,e:/'/},{b:/"/,e:/"/},{b:/`/,e:/`/},{b:"%[qQwWx]?\\(",e:"\\)"},{b:"%[qQwWx]?\\[",e:"\\]"},{b:"%[qQwWx]?{",e:"}"},{b:"%[qQwWx]?<",e:">"},{b:"%[qQwWx]?/",e:"/"},{b:"%[qQwWx]?%",e:"%"},{b:"%[qQwWx]?-",e:"-"},{b:"%[qQwWx]?\\|",e:"\\|"},{b:/\B\?(\\\d{1,3}|\\x[A-Fa-f0-9]{1,2}|\\u[A-Fa-f0-9]{4}|\\?\S)\b/},{b:/<<(-?)\w+$/,e:/^\s*\w+$/}]},i={cN:"params",b:"\\(",e:"\\)",endsParent:!0,k:r},d=[t,a,{cN:"class",bK:"class module",e:"$|;",i:/=/,c:[e.inherit(e.TM,{b:"[A-Za-z_]\\w*(::\\w+)*(\\?|\\!)?"}),{b:"<\\s*",c:[{b:"("+e.IR+"::)?"+e.IR}]}].concat(s)},{cN:"function",bK:"def",e:"$|;",c:[e.inherit(e.TM,{b:b}),i].concat(s)},{b:e.IR+"::"},{cN:"symbol",b:e.UIR+"(\\!|\\?)?:",r:0},{cN:"symbol",b:":(?!\\s)",c:[t,{b:b}],r:0},{cN:"number",b:"(\\b0[0-7_]+)|(\\b0x[0-9a-fA-F_]+)|(\\b[1-9][0-9_]*(\\.[0-9_]+)?)|[0_]\\b",r:0},{b:"(\\$\\W)|((\\$|\\@\\@?)(\\w+))"},{cN:"params",b:/\|/,e:/\|/,k:r},{b:"("+e.RSR+"|unless)\\s*",k:"unless",c:[a,{cN:"regexp",c:[e.BE,n],i:/\n/,v:[{b:"/",e:"/[a-z]*"},{b:"%r{",e:"}[a-z]*"},{b:"%r\\(",e:"\\)[a-z]*"},{b:"%r!",e:"![a-z]*"},{b:"%r\\[",e:"\\][a-z]*"}]}].concat(s),r:0}].concat(s);n.c=d,i.c=d;var l="[>?]>",o="[\\w#]+\\(\\w+\\):\\d+:\\d+>",u="(\\w+-)?\\d+\\.\\d+\\.\\d(p\\d+)?[^>]+>",w=[{b:/^\s*=>/,starts:{e:"$",c:d}},{cN:"meta",b:"^("+l+"|"+o+"|"+u+")",starts:{e:"$",c:d}}];return{aliases:["rb","gemspec","podspec","thor","irb"],k:r,i:/\/\*/,c:s.concat(w).concat(d)}});hljs.registerLanguage("json",function(e){var i={literal:"true false null"},n=[e.QSM,e.CNM],r={e:",",eW:!0,eE:!0,c:n,k:i},t={b:"{",e:"}",c:[{cN:"attr",b:/"/,e:/"/,c:[e.BE],i:"\\n"},e.inherit(r,{b:/:/})],i:"\\S"},c={b:"\\[",e:"\\]",c:[e.inherit(r)],i:"\\S"};return n.splice(n.length,0,t,c),{c:n,k:i,i:"\\S"}});hljs.registerLanguage("python",function(e){var r={keyword:"and elif is global as in if from raise for except finally print import pass return exec else break not with class assert yield try while continue del or def lambda async await nonlocal|10 None True False",built_in:"Ellipsis NotImplemented"},b={cN:"meta",b:/^(>>>|\.\.\.) /},c={cN:"subst",b:/\{/,e:/\}/,k:r,i:/#/},a={cN:"string",c:[e.BE],v:[{b:/(u|b)?r?'''/,e:/'''/,c:[b],r:10},{b:/(u|b)?r?"""/,e:/"""/,c:[b],r:10},{b:/(fr|rf|f)'''/,e:/'''/,c:[b,c]},{b:/(fr|rf|f)"""/,e:/"""/,c:[b,c]},{b:/(u|r|ur)'/,e:/'/,r:10},{b:/(u|r|ur)"/,e:/"/,r:10},{b:/(b|br)'/,e:/'/},{b:/(b|br)"/,e:/"/},{b:/(fr|rf|f)'/,e:/'/,c:[c]},{b:/(fr|rf|f)"/,e:/"/,c:[c]},e.ASM,e.QSM]},s={cN:"number",r:0,v:[{b:e.BNR+"[lLjJ]?"},{b:"\\b(0o[0-7]+)[lLjJ]?"},{b:e.CNR+"[lLjJ]?"}]},i={cN:"params",b:/\(/,e:/\)/,c:["self",b,s,a]};return c.c=[a,s,b],{aliases:["py","gyp"],k:r,i:/(<\/|->|\?)|=>/,c:[b,s,a,e.HCM,{v:[{cN:"function",bK:"def"},{cN:"class",bK:"class"}],e:/:/,i:/[${=;\n,]/,c:[e.UTM,i,{b:/->/,eW:!0,k:"None"}]},{cN:"meta",b:/^[\t ]*@/,e:/$/},{b:/\b(print|exec)\(/}]}});hljs.registerLanguage("bash",function(e){var t={cN:"variable",v:[{b:/\$[\w\d#@][\w\d_]*/},{b:/\$\{(.*?)}/}]},s={cN:"string",b:/"/,e:/"/,c:[e.BE,t,{cN:"variable",b:/\$\(/,e:/\)/,c:[e.BE]}]},a={cN:"string",b:/'/,e:/'/};return{aliases:["sh","zsh"],l:/\b-?[a-z\._]+\b/,k:{keyword:"if then else elif fi for while in do done case esac function",literal:"true false",built_in:"break cd continue eval exec exit export getopts hash pwd readonly return shift test times trap umask unset alias bind builtin caller command declare echo enable help let local logout mapfile printf read readarray source type typeset ulimit unalias set shopt autoload bg bindkey bye cap chdir clone comparguments compcall compctl compdescribe compfiles compgroups compquote comptags comptry compvalues dirs disable disown echotc echoti emulate fc fg float functions getcap getln history integer jobs kill limit log noglob popd print pushd pushln rehash sched setcap setopt stat suspend ttyctl unfunction unhash unlimit unsetopt vared wait whence where which zcompile zformat zftp zle zmodload zparseopts zprof zpty zregexparse zsocket zstyle ztcp",_:"-ne -eq -lt -gt -f -d -e -s -l -a"},c:[{cN:"meta",b:/^#![^\n]+sh\s*$/,r:10},{cN:"function",b:/\w[\w\d_]*\s*\(\s*\)\s*\{/,rB:!0,c:[e.inherit(e.TM,{b:/\w[\w\d_]*/})],r:0},e.HCM,s,a,t]}});hljs.registerLanguage("javascript",function(e){var r="[A-Za-z$_][0-9A-Za-z$_]*",t={keyword:"in of if for while finally var new function do return void else break catch instanceof with throw case default try this switch continue typeof delete let yield const export super debugger as async await static import from as",literal:"true false null undefined NaN Infinity",built_in:"eval isFinite isNaN parseFloat parseInt decodeURI decodeURIComponent encodeURI encodeURIComponent escape unescape Object Function Boolean Error EvalError InternalError RangeError ReferenceError StopIteration SyntaxError TypeError URIError Number Math Date String RegExp Array Float32Array Float64Array Int16Array Int32Array Int8Array Uint16Array Uint32Array Uint8Array Uint8ClampedArray ArrayBuffer DataView JSON Intl arguments require module console window document Symbol Set Map WeakSet WeakMap Proxy Reflect Promise"},a={cN:"number",v:[{b:"\\b(0[bB][01]+)"},{b:"\\b(0[oO][0-7]+)"},{b:e.CNR}],r:0},n={cN:"subst",b:"\\$\\{",e:"\\}",k:t,c:[]},c={cN:"string",b:"`",e:"`",c:[e.BE,n]};n.c=[e.ASM,e.QSM,c,a,e.RM];var s=n.c.concat([e.CBCM,e.CLCM]);return{aliases:["js","jsx"],k:t,c:[{cN:"meta",r:10,b:/^\s*['"]use (strict|asm)['"]/},{cN:"meta",b:/^#!/,e:/$/},e.ASM,e.QSM,c,e.CLCM,e.CBCM,a,{b:/[{,]\s*/,r:0,c:[{b:r+"\\s*:",rB:!0,r:0,c:[{cN:"attr",b:r,r:0}]}]},{b:"("+e.RSR+"|\\b(case|return|throw)\\b)\\s*",k:"return throw case",c:[e.CLCM,e.CBCM,e.RM,{cN:"function",b:"(\\(.*?\\)|"+r+")\\s*=>",rB:!0,e:"\\s*=>",c:[{cN:"params",v:[{b:r},{b:/\(\s*\)/},{b:/\(/,e:/\)/,eB:!0,eE:!0,k:t,c:s}]}]},{b:/</,e:/(\/\w+|\w+\/)>/,sL:"xml",c:[{b:/<\w+\s*\/>/,skip:!0},{b:/<\w+/,e:/(\/\w+|\w+\/)>/,skip:!0,c:[{b:/<\w+\s*\/>/,skip:!0},"self"]}]}],r:0},{cN:"function",bK:"function",e:/\{/,eE:!0,c:[e.inherit(e.TM,{b:r}),{cN:"params",b:/\(/,e:/\)/,eB:!0,eE:!0,c:s}],i:/\[|%/},{b:/\$[(.]/},e.METHOD_GUARD,{cN:"class",bK:"class",e:/[{;=]/,eE:!0,i:/[:"\[\]]/,c:[{bK:"extends"},e.UTM]},{bK:"constructor",e:/\{/,eE:!0}],i:/#(?!!)/}});hljs.registerLanguage("xml",function(s){var e="[A-Za-z0-9\\._:-]+",t={eW:!0,i:/</,r:0,c:[{cN:"attr",b:e,r:0},{b:/=\s*/,r:0,c:[{cN:"string",endsParent:!0,v:[{b:/"/,e:/"/},{b:/'/,e:/'/},{b:/[^\s"'=<>`]+/}]}]}]};return{aliases:["html","xhtml","rss","atom","xjb","xsd","xsl","plist"],cI:!0,c:[{cN:"meta",b:"<!DOCTYPE",e:">",r:10,c:[{b:"\\[",e:"\\]"}]},s.C("<!--","-->",{r:10}),{b:"<\\!\\[CDATA\\[",e:"\\]\\]>",r:10},{b:/<\?(php)?/,e:/\?>/,sL:"php",c:[{b:"/\\*",e:"\\*/",skip:!0}]},{cN:"tag",b:"<style(?=\\s|>|$)",e:">",k:{name:"style"},c:[t],starts:{e:"</style>",rE:!0,sL:["css","xml"]}},{cN:"tag",b:"<script(?=\\s|>|$)",e:">",k:{name:"script"},c:[t],starts:{e:"</script>",rE:!0,sL:["actionscript","javascript","handlebars","xml"]}},{cN:"meta",v:[{b:/<\?xml/,e:/\?>/,r:10},{b:/<\?\w+/,e:/\?>/}]},{cN:"tag",b:"</?",e:"/?>",c:[{cN:"name",b:/[^\/><\s]+/,r:0},t]}]}});hljs.registerLanguage("markdown",function(e){return{aliases:["md","mkdown","mkd"],c:[{cN:"section",v:[{b:"^#{1,6}",e:"$"},{b:"^.+?\\n[=-]{2,}$"}]},{b:"<",e:">",sL:"xml",r:0},{cN:"bullet",b:"^([*+-]|(\\d+\\.))\\s+"},{cN:"strong",b:"[*_]{2}.+?[*_]{2}"},{cN:"emphasis",v:[{b:"\\*.+?\\*"},{b:"_.+?_",r:0}]},{cN:"quote",b:"^>\\s+",e:"$"},{cN:"code",v:[{b:"^```w*s*$",e:"^```s*$"},{b:"`.+?`"},{b:"^( {4}|	)",e:"$",r:0}]},{b:"^[-\\*]{3,}",e:"$"},{b:"\\[.+?\\][\\(\\[].*?[\\)\\]]",rB:!0,c:[{cN:"string",b:"\\[",e:"\\]",eB:!0,rE:!0,r:0},{cN:"link",b:"\\]\\(",e:"\\)",eB:!0,eE:!0},{cN:"symbol",b:"\\]\\[",e:"\\]",eB:!0,eE:!0}],r:10},{b:/^\[[^\n]+\]:/,rB:!0,c:[{cN:"symbol",b:/\[/,e:/\]/,eB:!0,eE:!0},{cN:"link",b:/:\s*/,e:/$/,eB:!0}]}]}});hljs.registerLanguage("css",function(e){var c="[a-zA-Z-][a-zA-Z0-9_-]*",t={b:/[A-Z\_\.\-]+\s*:/,rB:!0,e:";",eW:!0,c:[{cN:"attribute",b:/\S/,e:":",eE:!0,starts:{eW:!0,eE:!0,c:[{b:/[\w-]+\(/,rB:!0,c:[{cN:"built_in",b:/[\w-]+/},{b:/\(/,e:/\)/,c:[e.ASM,e.QSM]}]},e.CSSNM,e.QSM,e.ASM,e.CBCM,{cN:"number",b:"#[0-9A-Fa-f]+"},{cN:"meta",b:"!important"}]}}]};return{cI:!0,i:/[=\/|'\$]/,c:[e.CBCM,{cN:"selector-id",b:/#[A-Za-z0-9_-]+/},{cN:"selector-class",b:/\.[A-Za-z0-9_-]+/},{cN:"selector-attr",b:/\[/,e:/\]/,i:"$"},{cN:"selector-pseudo",b:/:(:)?[a-zA-Z0-9\_\-\+\(\)"'.]+/},{b:"@(font-face|page)",l:"[a-z-]+",k:"font-face page"},{b:"@",e:"[{;]",i:/:/,c:[{cN:"keyword",b:/\w+/},{b:/\s/,eW:!0,eE:!0,r:0,c:[e.ASM,e.QSM,e.CSSNM]}]},{cN:"selector-tag",b:c,r:0},{b:"{",e:"}",i:/\S/,c:[e.CBCM,t]}]}});

Template.add(CPHEditor, function anonymous(it
) {
var out='<div class="editor" ';if(this.debug){out+='data-debug';}out+=' > <control control="CPHFindReplace" name="find-replace"></control> <div class="read-only"> read only <span data-language></span> </div> <div class="line-container"> <div class="line-numbers"></div> </div> <div class="edit-text"> <div class="scrollbar vertical"><div class="scroller"></div></div> <div class="scrollbar horizontal"><div class="scroller"></div></div> <textarea spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" wrap="off" tabIndex="-1"></textarea> <div class="render"></div> <div class="render sample"><div class="line"><span class="fill">x</span></div></div> <div class="render limit"><span class="fill">'+( 'W'.repeat(80) )+'</span></div> </div></div>';return out;
});
Template.add(CPHContextMenu, function anonymous(it
) {
var out='';var arr1=this.items;if(arr1){var item,i=-1,l1=arr1.length-1;while(i<l1){item=arr1[i+=1];out+=' ';if(item === '-'){out+=' <hr> ';}else{out+=' <a class="item" data-item-index="'+( i )+'" ';if(item.href){out+='href="'+( item.href )+'"';}out+=' ';if(item.target){out+='target="'+( item.target )+'"';}out+='> <span class="title"> ';if(item.icon){out+=' '+( item.icon.startsWith('<') ? item.icon : feather.icons[(typeof item.icon === 'function' ? item.icon(this.data) : item.icon) || 'chevron-right'].toSvg() )+' ';}else{out+=' <svg class="empty"></svg> ';}out+=' '+( (typeof item.title === 'function' ? item.title(this.data) : item.title) )+' </span> ';if(item.shortcut){out+=' <span class="shortcut"> '+( this.generateShortcut(typeof item.shortcut === 'function' ? item.shortcut(this.data) : item.shortcut) )+' </span> ';}out+=' </a> ';}} } return out;
});
Template.add(CPHFindReplace, function anonymous(it
) {
var out='<div> <div class="row"> <a name="regex" class="btn" tabIndex="0">'+( regexicon() )+'</a> <a name="case" class="btn" tabIndex="0">'+( caseicon() )+'</a> <input name="find" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Find in text..."> <div class="pos" data-position>0 / 0</div> <div class="spacer"></div> <a name="prev" class="btn" tabIndex="0">'+( feather.icons['chevron-up'].toSvg() )+'</a> <a name="next" class="btn" tabIndex="0">'+( feather.icons['chevron-down'].toSvg() )+'</a> <a name="close" class="btn" tabIndex="0">'+( feather.icons['x'].toSvg() )+'</a> </div> <div class="row"> <a class="btn" disabled><svg></svg></a> <a class="btn" disabled><svg></svg></a> <input name="replace" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Replace with..."> <a name="replace-one" class="btn" tabIndex="0"><span>Replace</span></a> <a name="replace-all" class="btn" tabIndex="0"><span>Replace All</span></a> <div class="spacer"></div> </div></div>';return out;
});
})(window, document);