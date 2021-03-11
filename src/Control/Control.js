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
