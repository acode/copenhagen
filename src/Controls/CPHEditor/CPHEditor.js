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

  this.history = new CPHHistory(cfg.value);
  this.multiplayer = null;

  this.language = '';
  this.lineHeight = 0;
  this.height = 0;
  this.width = 0;

  this._inputDelay = 500;
  this._inputDelayTimeout = null;
  this._inputDisabled = false;

  this._contextMenu = null;

  this._preventMobileSelection = false;
  // TODO: FUTURE: Better mobile controls
  this._mobileTabDelay = 300;
  this._mobileTabTimeout = null;

  this._lastFindValue = null;
  this._lastViewportValue = '';
  this._lastScrollValue = '0,0';
  this._lastStateValue = '';
  this._lastAnnotationsValue = '';
  this._lastValue = '';
  this._maxLine = ''; // max line width
  this._formatCache = {}; // keeps track of formatted lines
  this._annotations = {}; // track annotations
  this.value = this.history.initialValue;

  this.users = [new CPHUser(null, cfg.username)];
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
  this.lineAnnotationElements = [];
  this.lineNumberElements = [];
  this.lineHeight = 0;
  this.lineContainerElement = this.selector('.line-container');
  this.numbersElement = this.selector('.line-numbers');
  this.renderElement = this.selector('.render:not(.sample):not(.limit)');
  this.annotationsElement = this.selector('.annotations');
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

  if (window.ResizeObserver) {
    var resizeObserver = new window.ResizeObserver(function (entries) {
      this.render(this.value, true);
    }.bind(this));
    resizeObserver.observe(this.element());
  }

  if (window.IntersectionObserver) {
    var intersectionObserver = new window.IntersectionObserver(function (entries) {
      // If intersectionRatio is 0, the target is out of view
      // and we do not need to do anything.
      if (entries[0].intersectionRatio <= 0) {
        return;
      }
      this.render(this.value, true);
    }.bind(this));
    intersectionObserver.observe(this.element());
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
    this.userAction('MoveCursorsByDocument', 'up');
    this.scrollToText();
  },
  'ctrl+arrowdown': function (value, cursors) {
    this.userAction('MoveCursorsByDocument', 'down');
    this.scrollToText();
  },
  'ctrl+shift+arrowup': function (value, cursors) {
    this.userAction('MoveCursorsByDocument', 'up', true);
    this.scrollToText();
  },
  'ctrl+shift+arrowdown': function (value, cursors) {
    this.userAction('MoveCursorsByDocument', 'down', true);
    this.scrollToText();
  },
  'ctrl+arrowleft': function (value, cursors) {
    this.userAction('MoveCursorsByLine', 'left');
    this.scrollToText();
  },
  'ctrl+arrowright': function (value, cursors) {
    this.userAction('MoveCursorsByLine', 'right');
    this.scrollToText();
  },
  'ctrl+shift+arrowleft': function (value, cursors) {
    this.userAction('MoveCursorsByLine', 'left', true);
    this.scrollToText();
  },
  'ctrl+shift+arrowright': function (value, cursors) {
    this.userAction('MoveCursorsByLine', 'right', true);
    this.scrollToText();
  },
  'alt+arrowleft': function (value, cursors) {
    this.userAction('MoveCursorsByWord', 'left');
    this.scrollToText();
  },
  'alt+arrowright': function (value, cursors) {
    this.userAction('MoveCursorsByWord', 'right');
    this.scrollToText();
  },
  'alt+shift+arrowleft': function (value, cursors) {
    this.userAction('MoveCursorsByWord', 'left', true);
    this.scrollToText();
  },
  'alt+shift+arrowright': function (value, cursors) {
    this.userAction('MoveCursorsByWord', 'right', true);
    this.scrollToText();
  },
  'ctrl+alt+arrowup': function (value, cursors) {
    this.userAction('MoveCursors', 'up', 1, false, true);
    this.scrollToText();
  },
  'ctrl+alt+arrowdown': function (value, cursors) {
    this.userAction('MoveCursors', 'down', 1, false, true);
    this.scrollToText();
  },
  'ctrl+d': function (value, cursors) {
    this.userAction('CreateNextCursor');
    this.scrollToText();
  },
  'ctrl+u': function (value, cursors) {
    this.userAction('DestroyLastCursor');
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
        this.userAction('ResetCursor');
        this.userAction('Select', this._find.prevIndex, this._find.prevIndex + this._find.prevValue.length)
        this.scrollToText();
      }
    },
    'next': function (ctrl, value, isCaseSensitive) {
      if (this._find.nextIndex !== -1) {
        this.userAction('ResetCursor');
        this.userAction('Select', this._find.nextIndex, this._find.nextIndex + this._find.nextValue.length);
        this.scrollToText();
      }
    },
    'replace': function (ctrl, value, replaceValue, isCaseSensitive) {
      if (this._find.currentIndex !== -1) {
        this.userAction('ResetCursor');
        this.userAction('Select', this._find.currentIndex, this._find.currentIndex + this._find.currentValue.length);
        this.userAction('InsertText', replaceValue);
        this.__renderFindReplace();
        this.userAction('Select', this._find.nextIndex, this._find.nextIndex + this._find.nextValue.length);
        this.scrollToText();
      } else if (this._find.nextIndex !== -1) {
        this.userAction('ResetCursor');
        this.userAction('Select', this._find.nextIndex, this._find.nextIndex + this._find.nextValue.length);
        this.userAction('InsertText', replaceValue);
        this.__renderFindReplace();
        this.userAction('Select', this._find.nextIndex, this._find.nextIndex + this._find.nextValue.length);
        this.scrollToText();
      }
    },
    'replace-all': function (ctrl, value, replaceValue, isCaseSensitive) {
      if (this.isReadOnly() || !this.isEnabled()) {
        this.animateNo();
      } else {
        this.userAction('ResetCursor');
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
      if (this.canGotoHistory(-1)) {
        this._inputDisabled = true;
        document.execCommand('insertText', false, String.fromCharCode(0));
        this._inputDisabled = false;
      }
      if (this.canGotoHistory(1)) {
        this._inputDisabled = true;
        document.execCommand('insertText', false, String.fromCharCode(0));
        document.execCommand('undo', false, null);
        this._inputDisabled = false;
      }
      return;
      // TODO: Deprecated. Use browser native context window.
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
                disabled: !this.history.canGoto(this.user, -1)
              },
              {
                icon: 'rotate-cw',
                title: 'Redo',
                shortcut: 'ctrl+y',
                disabled: !this.history.canGoto(this.user, 1)
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
      e.preventDefault();
      if (this._inputDisabled) {
        return;
      } else {
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
      var cursor = this.user.cursors[0];
      var inString = this.inString(cursor.selectionStart);
      var inComment = this.inComment(cursor.selectionStart);
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
          this.userAction('MoveCursorsByWord', 'left', true);
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
              this.userAction('MoveCursors', 'right');
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
          this.userAction('MoveCursorsByWord', 'right', true);
          this.userAction('RemoveText', 1);
          this.scrollToText();
        } else {
          this.userAction('RemoveText', 1);
          this.scrollToText();
        }
      } else if (!isModified && key !== 'shift') {
        if (key === 'escape') {
          preventDefaultAndStopPropagation();
          this.userAction('ResetCursor');
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
                this.userAction('MoveCursors', 'right', selInfo.linesSuffix.length);
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
            this.userAction('MoveCursors', direction, 1, e.shiftKey);
            this.scrollToText();
          }
        } else if (key.startsWith('page')) {
          preventDefaultAndStopPropagation();
          this.scrollPage(key.slice('page'.length));
        } else if (key === 'end') {
          preventDefaultAndStopPropagation();
          this.userAction('MoveCursorsByLine', 'right');
          this.scrollToText();
        } else if (key === 'home') {
          preventDefaultAndStopPropagation();
          this.userAction('MoveCursorsByLine', 'left');
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
            this.userAction('MoveCursors', 'right', 1);
          } else {
            this.userAction('InsertText', e.key);
          }
          this.scrollToText();
        } else if (
          // do not complement strings if already in string or comment
          fwdComplement &&
          (!strComplement || (strComplement && (!inString && !inComment)))
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
    this.userAction('CreateCursor');
  } else if (createCursor === false) {
    this.userAction('ResetCursor');
  }
  var cursor = this.user.cursors[0];
  var selection = {};
  if (mouseup) {
    this._initialSelection = null;
    this._selecting = false;
    this.userAction('CollapseCursors');
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
        this.userAction('Select', selection.selectionEnd, selection.selectionStart);
      } else {
        this.userAction('Select', selection.selectionStart, selection.selectionEnd);
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
      this.userAction('Select', selection.selectionEnd, selection.selectionStart);
    } else {
      selection.ltr = true;
      selection.selectionStart = this._initialSelection.selectionStart;
      selection.selectionEnd = this.virtualCursorOffset + this.inputElement.selectionEnd;
      this.userAction('Select', selection.selectionStart, selection.selectionEnd);
    }
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
 * Retrieves the a language dictionary for the editor.
 * Languages are added via `CPHEditor.prototype.languages`.
 * @param {string} language The language to retrieve, e.g. javascript. Must be supported in the languages dictionary.
 */
CPHEditor.prototype.getLanguageDictionary = function (language) {
  return this.languages[language] || this.languages['text'];
};

/**
 * Retrieves the currently active language dictionary for the editor.
 * Languages are added via `CPHEditor.prototype.languages`.
 */
CPHEditor.prototype.getActiveLanguageDictionary = function () {
  return this.getLanguageDictionary(this.language);
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
  value = value.replace(/\r/gi, ''); // remove carriage returns (windows)
  if (!this.history.pasts.length) {
    this.render(this.value = this.history.reset(value));
  } else {
    this.userAction('ResetCursor');
    this.userAction('Select', 0, this.value.length);
    this.userAction('InsertText', value);
    this.userAction('Select', 0, 0);
  }
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
  this.history.reset(this.value);
};

/**
 * Check if user can go to history, forward or backward.
 * @param {integer} amount
 */
CPHEditor.prototype.canGotoHistory = function (amount) {
  return this.history.canGoto(this.user, amount);
};

/**
 * Navigate the user action history, forward or backward.
 * @param {integer} amount
 */
CPHEditor.prototype.gotoHistory = function (amount) {

  if (this.history.canGoto(this.user, amount)) {

    var userMap = this.users.reduce(function (users, user) {
      users[user.uuid] = user;
      return users;
    }, {});

    var value;
    var entries = this.history.back(this.user, Math.min(0, amount));
    if (entries[0]) {
      value = entries[0].value;
      this.users.forEach(function (user) {
        var cursors = entries[0].cursorMap[user.uuid];
        if (cursors && cursors.length) {
          user.loadCursors(cursors);
        }
      });
    }
    for (i = 0; i < entries.length; i++) {
      var userAction = entries[i];
      var user = userMap[userAction.user_uuid];
      value = this._userAction.apply(
        this,
        [].concat(user, userAction.name, userAction.args, value, false, userAction.uuid)
      );
    }

    if (amount > 0) {
      var value = this.value;
      var entries = this.history.replay(this.user, amount);
      for (i = 0; i < entries.length; i++) {
        var userAction = entries[i];
        var user = userMap[userAction.user_uuid];
        value = this._userAction.apply(
          this,
          [].concat(user, userAction.name, userAction.args, value, true)
        );
      }
    }

    this.syncClients();

  }

  return this.scrollToText();

};

/**
 * Perform a user action. Specific user actions are available on the `CPHCursor`
 * object, prefixed with the word `calculate`.
 * @param {string} name The name of the user action to dispatch
 */
CPHEditor.prototype.userAction = function (name) {
  if (!this.isEnabled()) {
    this.animateNo();
  } else if (this.isReadOnly() && !name.match(/^(NoOp|Select|ResetCursor|CollapseCursors|Move*)$/)) {
    this.animateNo();
  } else {
    var args = [].slice.call(arguments, 1);
    var result = this._userAction(
      this.user,
      name,
      args,
      this.getActiveLanguage(),
      this.value,
      false
    );
    this.syncClients();
    return result;
  }
};

/**
 * Perform a user action on behalf of a specific user. Can be used to have
 * "bot" users that create input secondary to the primary user.
 * @param {string} name The name of the user action to dispatch
 */
CPHEditor.prototype.executeUserAction = function (user, name) {
  if (!(user instanceof CPHUser)) {
    throw new Error('Cannot "executeUserAction": User not a valid CPHUser');
  }
  if (this.users.indexOf(user) === -1) {
    throw new Error('Cannot "executeUserAction": User "' + user.uuid + '" not found');
  }
  var args = [].slice.call(arguments, 2);
  var result = this._userAction(
    user,
    name,
    args,
    this.getActiveLanguage(),
    this.value,
    false
  );
  this.syncClients();
  return result;
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
    var result = this._userAction(
      this.user,
      name,
      args,
      this.getActiveLanguage(),
      this.value,
      false
    );
    this.syncClients();
    return result;
  }
};

CPHEditor.prototype._userAction = function (user, name, args, lang, value, replay, historyUUID) {
  value = typeof value === 'string' ? value : this.value;
  args = args.map(function (arg) { return arg === undefined ? null : arg; });
  var historyArguments = [args, lang];
  if (!historyUUID) {
    var historyResult = this.history.addEntry(
      this.history.createEntry(this.users, user, name, historyArguments, value),
      replay
    );
    if (!historyResult) {
      return value;
    }
  } else {
    this.history.updateEntryCacheValue(historyUUID, this.users, value);
  }
  if (user) {
    var actionResult = user.action(name, args, this.getLanguageDictionary(lang), value);
    var adjustCursor = function (c, range) {
      if (c.selectionStart >= range.selectionEnd) {
        // cursor after range
        return [range.result.offset, range.result.offset];
      } else if (c.selectionStart >= range.selectionStart && c.selectionStart <= range.selectionEnd) {
        // cursor start within range
        if (c.selectionEnd <= range.selectionEnd) {
          // cursor entirely inside of range
          return [
            range.selectionStart - c.selectionStart,
            range.selectionStart - c.selectionEnd + range.result.selectRelative[0]
          ];
        }  else {
          // cursor end outside of range
          return [
            range.selectionStart - c.selectionStart,
            range.result.offset
          ];
        }
      } else if (c.selectionStart < range.selectionStart && c.selectionEnd >= range.selectionStart) {
        if (c.selectionEnd <= range.selectionEnd) {
          // cursor start before range, end in range
          return [
            0,
            range.selectionStart - c.selectionEnd + range.result.selectRelative[0]
          ];
        } else {
          // cursor start before range, end after range
          return [
            0,
            range.result.offset
          ];
        }
      } else {
        return [0, 0];
      }
    };
    this.users
      .filter(function (u) { return u !== user; })
      .forEach(function (user) {
        var cursors = user.cursors;
        cursors.forEach(function (c) {
          actionResult.ranges.forEach(function (range) {
            var sel = adjustCursor(c, range);
            c.selectRelative(sel[0], sel[1]);
          });
          c.clamp(actionResult.value);
        });
        user.collapseCursors();
      });
    // Fix user selection if you're highlighting stuff
    if (user !== this.user && this._initialSelection) {
      if (actionResult.ranges.length) {
        actionResult.ranges.forEach(function (range) {
          var sel = adjustCursor(this._initialSelection, range);
          this._initialSelection.selectionStart += sel[0];
          this._initialSelection.selectionEnd += sel[1];
          this._initialSelection.inputStart += sel[0];
          this._initialSelection.inputEnd += sel[1];
        }.bind(this));
        this.inputElement.value = actionResult.value;
        this.__renderSelection();
      }
    }
    this.render(this.value = actionResult.value);
    return actionResult.value;
  } else {
    return this.value;
  }
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
        var annotationsValue = JSON.stringify(this._annotations);
        var findValue = JSON.stringify(this._find) + '/' + (this._findRE ? this._findRE.toString() : '');
        var cursorStateValue = this.createCursorStateValue(this.user.cursors, this._errorPos);
        var scrollValue = [this.inputElement.scrollLeft, Math.max(0, this.inputElement.scrollTop + this.fixScrollTop)].join(',');
        var viewportValue = [this.width, this.height].join(',');
        var valueChanged = (value !== lastValue);
        var cursorStateValueChanged = (cursorStateValue !== this._lastStateValue);
        var scrollValueChanged = (scrollValue !== this._lastScrollValue);
        var viewportChanged = (viewportValue !== this._lastViewportValue);
        var findValueChanged = (findValue !== this._lastFindValue);
        var annotationsValueChanged = (annotationsValue !== this._lastAnnotationsValue);
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
          findValueChanged ||
          annotationsValueChanged
        ) {
          this.__render(
            value,
            (valueChanged || forceRender),
            (cursorStateValueChanged || forceRender),
            scrollValueChanged,
            (viewportChanged || forceRender),
            findValueChanged,
            annotationsValueChanged
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
        this._lastAnnotationsValue = annotationsValue;
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
  annotationsValueChanged,
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
  var lineHeight = this.sampleLineElement.offsetHeight;
  var height = this.textboxElement.offsetHeight;
  var width = this.textboxElement.offsetWidth;
  var top = this.virtualTop + this.inputElement.scrollTop;
  var left = this.inputElement.scrollLeft;

  if (!lineHeight || !height) {
    // If either of these are missing, element not on DOM or initialized properly
    // Will cascade errors (NaN)
    return;
  }

  // Set line height
  this.lineHeight = lineHeight;
  this.height = height;
  this.width = width;

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
      annotationsValueChanged,
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
  var lineAnnotationElements = this.lineAnnotationElements;
  var lineFragment = null;
  var lineNumberFragment = null;
  var lineAnnotationFragment = null;
  while (lineElements.length < renderLines.length) {
    lineFragment = lineFragment || document.createDocumentFragment();
    lineNumberFragment = lineNumberFragment || document.createDocumentFragment();
    lineAnnotationFragment = lineAnnotationFragment || document.createDocumentFragment();
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
    var lineAnnotationElement = this.create(
      'div',
      ['annotation'],
      {
        offset: lineAnnotationElements.length,
        style: 'top: ' + (lineAnnotationElements.length * this.lineHeight) + 'px'
      }
    )
    lineAnnotationFragment.appendChild(lineAnnotationElement);
    lineAnnotationElements.push(lineAnnotationElement);
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
  lineAnnotationFragment && this.annotationsElement.appendChild(lineAnnotationFragment);
  lineNumberFragment && this.numbersElement.appendChild(lineNumberFragment);
  while (lineElements.length > renderLines.length) {
    var lineElement = lineElements.pop()
    lineElement.parentNode.removeChild(lineElement);
    var lineAnnotationElement = lineAnnotationElements.pop()
    lineAnnotationElement.parentNode.removeChild(lineAnnotationElement);
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
    annotationsValueChanged ||
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
      var userSelections = [];
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
      for (var ui = this.users.length - 1; ui >= 0; ui--) {
        var user = this.users[ui];
        var shouldHighlight = user === this.user;
        var userCursors = user.collapseCursors(true);
        var userSelection = {
          user: user,
          color: user.color,
          selected: false,
          highlighted: false,
          selectionPts: []
        };
        for (var ci = 0; ci < userCursors.length; ci++) {
          var c = userCursors[ci];
          var unbound = c.selectionStart < renderCursorOffset && c.selectionEnd > renderCursorOffset + line.length;
          var lbound = c.selectionStart >= renderCursorOffset && c.selectionStart <= renderCursorOffset + line.length;
          var rbound = c.selectionEnd >= renderCursorOffset && c.selectionEnd <= renderCursorOffset + line.length;
          if (unbound) {
            userSelection.selected = true;
            userSelection.selectionPts.push([0, line.length, '', c.direction()]);
          } else if (lbound && rbound) {
            userSelection.selected = true;
            userSelection.selectionPts.push([c.selectionStart - renderCursorOffset, c.selectionEnd - renderCursorOffset, 'lb rb', c.direction()]);
            if (shouldHighlight && !c.width() && userCursors.length === 1) {
              // Should only highlight the active user's line
              userSelection.highlighted = true;
            }
          } else if (lbound) {
            userSelection.selected = true;
            userSelection.selectionPts.push([c.selectionStart - renderCursorOffset, line.length, 'lb', c.direction()]);
          } else if (rbound) {
            userSelection.selected = true;
            userSelection.selectionPts.push([0, c.selectionEnd - renderCursorOffset, 'rb', c.direction()]);
          }
        }
        if (userSelection.selectionPts.length) {
          userSelections.push(userSelection);
        }
      }
      // Suggest something to autocomplete if we're in the line and cursor criteria met
      var suggestion = null;
      if (
        userSelections[0] &&
        userSelections[0].user === this.user &&
        userSelections[0].selectionPts.length &&
        shouldSuggest
      ) {
        suggestion = this.codeCompleter.suggest(line, this.language);
        this._suggestion = suggestion;
      }
      // Set line selected state for line number highlighting
      var lineSelected = (
        userSelections[0] &&
        userSelections[0].user === this.user &&
        userSelections[0].selected
      );
      // Set line error as a new cursor
      if (lineError) {
        userSelections.push({
          user: null,
          color: '#ff0000',
          selected: true,
          highlighted: true,
          selectionPts: [[lineError.column, lineError.column + 1, '', 'ltr']]
        });
      }
      var lineNumber = (renderStartLineIndex + i + 1);
      var formattedLineData = this.format(
        renderCursorOffset,
        lineNumber,
        line,
        userSelections,
        suggestion,
        complements.slice(),
        (
          this._find.value
            ? this._findRE
            : null
        ),
        this.getAnnotationsAt(lineNumber)
      );
      var formattedLine = formattedLineData[0];
      var formattedAnnotation = formattedLineData[1];
      if (formattedLine !== lineElements[i].innerHTML) {
        lineElements[i].innerHTML = formattedLine;
      }
      if (formattedAnnotation !== lineAnnotationElements[i].innerHTML) {
        lineAnnotationElements[i].innerHTML = formattedAnnotation;
      }
      if (lineNumber !== lineNumberElements[i].innerHTML) {
        lineNumberElements[i].innerHTML = lineNumber;
      }
      if (lineSelected && !lineNumberElements[i].classList.contains('selected')) {
        lineNumberElements[i].classList.add('selected');
      } else if (!lineSelected && lineNumberElements[i].classList.contains('selected')) {
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
    this.annotationsElement.style.transform = 'translate3d(0px, ' + (-topOffset) + 'px, 0px)';
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
  userSelections,
  suggestion, complements, findRE, annotations
) {
  var user = this.user;
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
  var cacheLine = JSON.stringify([].slice.call(arguments, 1, 8).concat((findRE || '').toString(), inComment, inString));
  var cacheAnnotation = JSON.stringify(annotations);
  this._formatCache[lineNumber] = this._formatCache[lineNumber] || [];
  var returnArray = [this._formatCache[lineNumber][1], this._formatCache[lineNumber][3]];
  if (this._formatCache[lineNumber][0] !== cacheLine) {
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
    this._formatCache[lineNumber][0] = cacheLine;
    this._formatCache[lineNumber][1] = returnArray[0] = (
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
        findRE
          ? ('<div class="find">' + safeHTML(line.replace(findRE, '~~~[~~~$&~~~]~~~')).replace(/~~~\[~~~(.*?)~~~\]~~~/gi, '<span class="found">$1</span>') + '</div>')
          : ''
      ) +
      userSelections.map(function (userSelection) {
        var otherUser = userSelection.user !== user;
        return (
          '<div class="selection">' +
          userSelection.selectionPts.reduce(function (acc, pt) {
            acc.str = (
              acc.str +
              '<span class="spacer">' + safeHTML(value.slice(acc.index, pt[0])) + '</span>' +
              '<span ' +
                'class="border ' + pt[2] + ' ' + pt[3] + ' length-' + (pt[1] - pt[0]) + ' ' + (otherUser ? 'other-user' : '') + '" ' +
                (
                  userSelection.color
                    ? 'style="color:' + safeHTML(userSelection.color) + '; background-color:' + safeHTML(userSelection.color + '33') + ';"'
                    : ''
                ) +
                '>' +
                (
                  ((pt[2] === 'lb' || pt[2] === 'lb rb') && userSelection.user)
                    ? (
                        otherUser
                          ? '<div class="uuid"><span>' + userSelection.user.username + '</span></div>'
                          : '<div class="focus"></div>'
                     )
                    : ''
                ) +
                safeHTML(value.slice(pt[0], pt[1])) +
              '</span>'
            );
            acc.index = pt[1];
            return acc;
          }, {str: '', index: 0}).str +
          '</div>' +
          (
            (userSelection.highlighted)
              ? (
                  '<div class="line-selection highlight" ' +
                    (
                      userSelection.color
                        ? 'style="background-color:' + safeHTML(userSelection.color) + ';" '
                        : ''
                    ) +
                    '></div>'
                )
              : ''
          )
        );
      }).join('')
    );
  }
  if (this._formatCache[lineNumber][2] !== cacheAnnotation) {
    this._formatCache[lineNumber][2] = cacheAnnotation;
    this._formatCache[lineNumber][3] = returnArray[1] = annotations.map(function (annotation) {
      return [
        '<div class="abody">',
          '<span class="icon">',
            annotation.image
              ? '<img src="' + annotation.image + '">'
              : '',
            feather.icons['more-horizontal'].toSvg(),
          '</span>',
          '<a class="text"' + (annotation.url ? ' href="' + safeHTML(annotation.url) + '" target="_blank"' : '') + '>' + safeHTML(annotation.text) + '</a>',
        '</div>',
      ].join('');
    }).join('');
  }
  return returnArray;
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
  this.sampleLineElement.innerHTML = safeHTML(maxLine);
  var width = this.sampleLineElement.offsetWidth;
  var cursorLeftLine = this.value.slice(
    this.value.slice(0, cursor.selectionStart).lastIndexOf('\n') + 1,
    cursor.selectionStart
  );
  this.sampleLineElement.innerHTML = safeHTML(cursorLeftLine);
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
  this.userAction('ResetCursor');
  this.userAction('Select', start, end);
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
  var commentLookup = value
    .replace(stringRE, function ($0) {
      var len = $0.length - 1;
      var fc = $0[0];
      var ec = $0[len];
      return fc.repeat(len) + [fc, ec][(ec === '\n') | 0];
    })
    .replace(commentRE, function ($0) {
      return commentChar.repeat($0.length);
    });
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
    this.userAction('Select', 0, 0);
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

/**
* Adds a new user session.
* @param {string} username A unique user identifier. Will default to a random uuid.
*/
CPHEditor.prototype.addUser = function (uuid, username, color) {
  var colors = ['#00cc00', '#9900ff', '#00ff99'];
  var user = new CPHUser(uuid, username, colors[(this.users.length - 1) % colors.length]);
  this.users.push(user);
  return user;
};

/**
* Adds line-by-line annotations
* @param {array} annotations an array of [lineNumber, {image: '', text: '', url: ''}]
*/
CPHEditor.prototype.setAnnotations = function (annotationsArray) {
  var annotations = {};
  annotationsArray.forEach(function (a) {
    var lineNumber = Math.max(parseInt(a[0]) || 0, 1);
    annotations[lineNumber] = annotations[lineNumber] || [];
    annotations[lineNumber].push({
      image: typeof a[1].image === 'string' ? a[1].image : null,
      text: typeof a[1].text === 'string' ? a[1].text : null,
      url: typeof a[1].url === 'string' ? a[1].url : null
    });
  });
  return this._annotations = annotations;
};

/**
* Retrieve annotations for a specific line number
* @param {array} annotations an array of {image: '', text: '', url: ''}
*/
CPHEditor.prototype.getAnnotationsAt = function (lineNumber) {
  return (this._annotations[lineNumber] || []).slice();
};

CPHEditor.prototype.syncClients = function () {
  // TODO: add me
};
