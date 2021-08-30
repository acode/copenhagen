function CPHUser (uuid, username, color) {
  this.uuid = uuid || uuidv4();
  this.username = username || this.uuid;
  this.color = color || '';
  this.cursors = [new CPHCursor()];
  this._history = {
    index: -1,
    userActions: []
  };
};

CPHUser.prototype.gotoHistory = function () {
  amount = parseInt(amount) || 0;
  var userActions = this._history.userActions;
  var historyIndex = this._history.index + Math.sign(amount);
  // Go back or forward until we hit InsertText or RemoveText
  while (
    userActions[historyIndex] &&
    userActions[historyIndex].arguments[0] !== 'InsertText' &&
    userActions[historyIndex].arguments[0] !== 'RemoveText'
  ) {
    historyIndex = historyIndex + Math.sign(amount);
  }
  if (amount < 0 && historyIndex < 0) {
    // If we hit -1, go to right before the next user text input
    while (
      userActions[historyIndex + 1] &&
      userActions[historyIndex + 1].arguments[0] !== 'InsertText' &&
      userActions[historyIndex + 1].arguments[0] !== 'RemoveText'
    ) {
      historyIndex = historyIndex + 1;
    }
  } else if (amount > 0 && historyIndex > userActions.length - 1) {
    // If we hit the end, go to right after the last user text input
    while (
      userActions[historyIndex - 1] &&
      userActions[historyIndex - 1].arguments[0] !== 'InsertText' &&
      userActions[historyIndex - 1].arguments[0] !== 'RemoveText'
    ) {
      historyIndex = historyIndex - 1;
    }
  }
  historyIndex = Math.max(-1, Math.min(historyIndex, userActions.length - 1));
  return this._history.index = historyIndex;
};

CPHUser.prototype.createHistoryUserAction = function (userAction) {
  this._history.userActions.push(userAction);
  ++this._history.index;
  return userAction;
};

CPHUser.prototype.getHistoryUserActions = function () {
  return this._history.userActions.slice(0, this._history.index + 1);
};

CPHUser.prototype.action = function (name, args, lang, value) {
  if (name === 'NoOp') {
    return {value: value, ranges: []};
  } else if (name === 'CollapseCursors') {
    // If multiple selection ranges overlap
    this.collapseCursors();
    return {value: value, ranges: []};
  } else if (name === 'CreateNextCursor') {
    this.createNextCursor(value);
    return {value: value, ranges: []};
  } else if (name === 'DestroyLastCursor') {
    this.destroyLastCursor();
    return {value: value, ranges: []};
  } if (name === 'CreateCursor') {
    this.createCursor();
    return {value: value, ranges: []};
  } else if (name === 'ResetCursor') {
    this.resetCursor();
    return {value: value, ranges: []};
  } else if (name === 'Select') {
    this.cursors[0].select(args[0], args[1]);
    this.cursors[0].clamp(value);
    return {value: value, ranges: []};
  } else if (name.startsWith('MoveCursors')) {
    var actionName = 'moveCursors' + name.slice('MoveCursors'.length);
    if (!CPHUser.prototype.hasOwnProperty(actionName)) {
      throw new Error('Invalid user action: "' + actionName + '"');
    } else {
      this[actionName].apply(this, [].concat(value, args));
      return {value: value, ranges: []};
    }
  } else {
    var actionName = 'calculate' + name;
    if (!CPHCursor.prototype.hasOwnProperty(actionName)) {
      throw new Error('Invalid user action: "' + name + '"');
    } else {
      // We want to only edit the active area for text.
      // If we're dealing with a huge file (100k LOC),
      //  there's a huge performance bottleneck on string composition
      //  so work on the smallest string we need to while we perform a
      //  large number of cursor operations.
      var sortedCursors = this.getSortedCursors();
      var bigCursor = new CPHCursor(sortedCursors[0].selectionStart, sortedCursors[sortedCursors.length - 1].selectionEnd);
      var bigInfo = bigCursor.getSelectionInformation(value);
      var linesStartIndex = bigInfo.linesStartIndex;
      var linesEndIndex = bigInfo.linesEndIndex;
      if (name === 'RemoveText' && parseInt(args[0]) < 0) { // catch backspaces
        linesStartIndex += parseInt(args[0]);
        linesStartIndex = Math.max(0, linesStartIndex);
      } else if (name === 'InsertText') { // catch complements
        value = value.replace(/\r/gi, ''); // remove carriage returns (windows)
        linesStartIndex -= 1;
        linesStartIndex = Math.max(0, linesStartIndex);
      }
      var startValue = value.slice(0, linesStartIndex);
      var editValue = value.slice(linesStartIndex, linesEndIndex);
      var endValue = value.slice(linesEndIndex);
      var editOffset = linesStartIndex;
      var offset = -editOffset;
      var ranges = [];
      for (var i = 0; i < sortedCursors.length; i++) {
        var cursor = sortedCursors[i];
        var range = {
          selectionStart: cursor.selectionStart,
          selectionEnd: cursor.selectionEnd,
          offset: 0
        };
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
        range.result = result;
        ranges.push(range);
        offset += result.offset;
      }
      value = startValue + editValue + endValue;
      this.getSortedCursors().forEach(function (cursor) { cursor.clamp(value); });
      return {value: value, ranges: ranges};
    }
  }
};

CPHUser.prototype.loadCursors = function (cursors) {
  return this.cursors = cursors.map(function (cursor) {
    if (cursor instanceof CPHCursor) {
      return cursor.clone();
    } else {
      return CPHCursor.fromObject(cursor);
    }
  });
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
