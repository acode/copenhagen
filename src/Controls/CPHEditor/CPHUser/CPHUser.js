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
