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
