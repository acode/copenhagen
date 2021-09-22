function CPHHistory (initialValue) {
  this.reset(initialValue);
};

// Can only travel forward / backward in history to these events
CPHHistory.prototype.gotoEnabled = {
  'InsertText': true,
  'RemoveText': true
};

// Don't store duplicates of this event
CPHHistory.prototype.deduplicate = {
  'Select': true
};

CPHHistory.prototype.reset = function (initialValue) {
  initialValue = ((initialValue || '') + '').replace(/\r/gi, ''); // remove carriage returns (windows)
  this.initialValue = initialValue;
  this.acknowledged = {add: -1, remove: -1};
  this.operations = {add: [], remove: []};
  this.awaiting = null;
  this.lookup = {add: {}, remove: {}};
  this.pasts = {};
  this.futures = {};
  this.addEntry(this.createEntry([], null, 'Initialize', [[initialValue], null], initialValue));
  return this.initialValue;
};

CPHHistory.prototype.updateEntryCacheValue = function (uuid, users, value) {
  var entry = this.lookup.add[uuid];
  if (!entry) {
    throw new Error('Could not find history entry: ' + uuid);
  }
  entry.cursorMap = users.reduce(function (cursorMap, user) {
    cursorMap[user.uuid] = user.cursors.map(function (cursor) { return cursor.toObject(); });
    return cursorMap;
  }, {}),
  entry.value = value;
  return entry;
};

CPHHistory.prototype.createEntry = function (users, user, name, args, value) {
  return {
    rev: -1,
    uuid: _unsafe_uuidv4(),
    user_uuid: user ? user.uuid : '',
    cursorMap: users.reduce(function (cursorMap, user) {
      cursorMap[user.uuid] = user.cursors.map(function (cursor) { return cursor.toObject(); });
      return cursorMap;
    }, {}),
    name: name,
    args: args,
    value: value,
    committed: false
  };
};

CPHHistory.prototype.addEntry = function (entry, preserveFutures) {
  var pasts = this.pasts[entry.user_uuid] = this.pasts[entry.user_uuid] || [];
  var futures = this.futures[entry.user_uuid] = this.futures[entry.user_uuid] || [];
  var lastEntry = pasts[pasts.length - 1];
  if (
    lastEntry &&
    this.deduplicate[entry.name] &&
    entry.name === lastEntry.name &&
    JSON.stringify(entry.args) === JSON.stringify(lastEntry.args)
  ) {
    return;
  }
  if (!preserveFutures && this.gotoEnabled[entry.name]) {
    futures.splice(0, futures.length);
  }
  pasts.push(entry);
  if (this.gotoEnabled[entry.name]) {
    var i = pasts.length - 1;
    while (pasts[i] && !pasts[i].committed) {
      pasts[i].committed = true;
      i--;
    }
  }
  this.operations.add.push(entry);
  this.lookup.add[entry.uuid] = entry;
  return entry.uuid;
};

CPHHistory.prototype.removeEntry = function (entry) {
  entry.name = 'NoOp';
  entry.args = [[], null];
  delete entry.cursorMap;
  delete entry.value;
  this.lookup.remove[entry.uuid] = {
    rev: -1,
    uuid: entry.uuid
  };
  this.operations.remove.push(this.lookup.remove[entry.uuid]);
};

CPHHistory.prototype.createFutureEntry = function (entry) {
  return {
    user_uuid: entry.user_uuid,
    name: entry.name,
    args: entry.args
  };
};

CPHHistory.prototype.canGoto = function (user, amount) {
  var pasts = this.pasts[user.uuid] = this.pasts[user.uuid] || [];
  var futures = this.futures[user.uuid] = this.futures[user.uuid] || [];
  return amount >= 0
    ? futures.length > 0
    : !!pasts.find(function (past) { return this.gotoEnabled[past.name]; }.bind(this));
};

CPHHistory.prototype.back = function (user, amount) {
  if (amount > 0) {
    throw new Error('CPHHistory#back expects amount to be <= 0');
  }
  var pasts = this.pasts[user.uuid] = this.pasts[user.uuid] || [];
  var futures = this.futures[user.uuid] = this.futures[user.uuid] || [];
  amount = Math.abs(amount);
  // First, remove non-indexable entries from the top of the stack
  while (pasts.length && !pasts[pasts.length - 1].committed) {
    var entry = pasts.pop();
    this.removeEntry(entry);
  }
  // Now, go back the desired amount
  var queue = [];
  while (pasts.length && amount > 0) {
    var entry = pasts.pop();
    queue.unshift(entry);
    if (this.gotoEnabled[entry.name]) {
      amount--;
    }
  }
  while (queue.length && !this.gotoEnabled[queue[0].name]) {
    pasts.push(queue.shift());
  }
  while (queue.length) {
    var entry = queue.pop();
    futures.unshift(this.createFutureEntry(entry));
    this.removeEntry(entry);
  }
  return this.generateHistory(pasts.length ? pasts[pasts.length - 1].uuid : null);
};

CPHHistory.prototype.generateHistory = function (uuid) {
  var entries = [];
  var found = uuid ? false : true;
  for (var i = this.operations.add.length - 1; i >= 0; i--) {
    var entry = this.operations.add[i];
    entries.unshift(entry);
    found = found || (entry.uuid === uuid);
    if (found && entry.value) {
      return entries;
    }
  }
  return entries;
};

CPHHistory.prototype.replay = function (user, amount) {
  var futures = this.futures[user.uuid] = this.futures[user.uuid] || [];
  var entries = [];
  while (amount > 0) {
    if (!futures.length) {
      break;
    } else {
      var entry = futures.shift();
      entries.push(entry);
      if (this.gotoEnabled[entry.name]) {
        amount--;
      }
    }
  }
  while (futures.length && !this.gotoEnabled[futures[0].name]) {
    entries.push(futures.shift());
  }
  return entries;
};
