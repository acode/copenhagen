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
