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
