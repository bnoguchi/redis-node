var commandConfig = require("./commandConfig"),
    Command = require("./command").Command,
    Transaction = require("./transaction").Transaction,
    ReplyStream = require("./replyStream").ReplyStream;

Object.prototype.extend = function () {
  var objects = Array.prototype.slice.call(arguments),
      i, len, object, key;
  for (i = 0, len = objects.length; i < len; i++) {
    object = objects[i];
    for (key in object) if (object.hasOwnProperty(key)) {
      this[key] = object[key];
    }
  }
};

var net = require("net"),
    sys = require("sys"),
    EventEmitter = require("events").EventEmitter,
    FirstLine = require("./firstLine").FirstLine,

    // Type of Replies
    ERROR     = exports.ERROR = "ERROR",
    INLINE    = exports.INLINE = "INLINE",
    INTEGER   = exports.INTEGER = "INTEGER",
    BULK      = exports.BULK = "BULK",
    MULTIBULK = exports.MULTIBULK = "MULTIBULK";

exports.COMMAND_ORPHANED_ERROR = "connection lost before reply received";
exports.NO_CONNECTION_ERROR = "failed to establish a connection to Redis";
    
/**
 * Emits the following events:
 * -connected: when connected
 *  -reconnected: upon a reconnection
 *  -reconnecting: when about to try reconnecting
 *  -noconnection: when a connection or reconnection fails
 * @options is a hash with the following optional keys:
 * -maxReconnectionAttempts
 */
var Client = exports.Client = function Client (port, host, options) {
    // Inherit from EventEmitter
    EventEmitter.call(this);

    // Configure according to options
    options = options || {};
    this.extend(this.DEFAULT_OPTIONS, options);

    // Stores all commands whose responses haven't been sent to a callback
    this.commandHistory = [];
    this.channelCallbacks = {};

    // State specifying if we're in the middle of a transaction or not.
    this.doConsiderCommandsTransactional = false;
    this.isTransacting = false;
    this.cmdsToRunAfterTxn = [];
    this.queuedTransactionBlocks = []; // If more than 1 transaction is called near the same time

    // For storing queued commands that build up when there isn't a connection
    // or if we shouldn't send yet because we're in the middle of a transaction.
    this.queuedCommandHistory = [];
//    this.queuedCommandBuffers = [];

    this.connectionsMade = 0;

    // Re-usable parser used to interpret the leading line of every reply
    this._firstLineParser = new FirstLine();

    // Re-usable request buffer to write commands to
    this.requestBuffer = new Buffer(512);

    // Setup the TCP connection
    var stream = this.stream = net.createConnection(this.port = port, this.host = host);

    var replyStream = new ReplyStream(stream, this);
    replyStream.on("reply", this.handleReply);

    var client = this; // For closures
    stream.on("connect", function () {
        var eventName = client.connectionsMade === 0
                      ? "connected"
                      : "reconnected";

        stream.setNoDelay();
        stream.setTimeout(0);

        client.reconnectionAttempts = 0; // Reset to 0
        client.reconnectionDelay = 500;
        if (client.reconnectionTimer) {
            clearTimeout(client.reconnectionTimer);
            client.reconnectionTimer = null;
        }

        client.connectionsMade++;
        client.expectingClose = false;

        if (client.connectionsMade > 1 && client.commandHistory.length > 0) {
            sys.log("[RECONNECTION] some commands orphaned (" + client.commandHistory.length + "). notifying...");
            client.callbackOrphanedCommandsWithError();
        }
        if (client.currDB) client.select(client.currDB);

        client.flushQueuedCommands();
        client.emit(eventName);
    });

    stream.on("error", function (e) {
        sys.error(e);
        throw e;
    });

    stream.on("end", function () {
        stream.end();
    });

    stream.on("close", function () {
        // Don't reconnect on first connection failure
        // to avoid un-necessary work
        if (client.connectionsMade === 0) {
//            client.callbackOrphanedCommandsWithError(); // TODO
//            client.callbackQueuedCommandsWithError(); // TODO
            client.giveupConnectionAttempts();
        } else {
            client.attemptReconnect();
        }
    });
};
sys.inherits(Client, EventEmitter);

Client.prototype.DEFAULT_OPTIONS = {
  maxReconnectionAttempts: 10,
  reconnectionAttempts: 0,
  reconnectionDelay: 500, // Doubles with every try
  reconnectionTimer: null
};

Client.prototype.handleReply = function (reply, client, isParsingExecReply) {
//        sys.log(sys.inspect(reply)); // Uncomment this to see the reply
    /* Handle special case of PubSub */
    var pubSubCallback, replyValue;
    if (reply.isMessage || reply.isPMessage) {
        replyValue = reply.replyValue;
        pubSubCallback = client.channelCallbacks[replyValue.channelPattern || replyValue.channelName];
        pubSubCallback(replyValue.channelName, replyValue.message, replyValue.channelPattern)
        return;
    }

    // Now handle all other replies

    // 1. Find the command name corresponding to the reply
    // 2. Find or define a callback (needed for ALL reply types)
    var commandForReply, txnCommand, commandName, commandCallback;
    if (isParsingExecReply) {
        txnCommand = client.currTxnCommands.shift();
        commandName = txnCommand.commandName;
        commandCallback = txnCommand.callback;
        replyValue = reply;
    } else {
        commandForReply = client.commandHistory.shift();
        commandName = commandForReply.commandName;
        commandCallback = commandForReply.commandCallback;
        replyValue = reply.replyValue;
    }

//        sys.log(sys.inspect(commandForReply)); // Uncomment this to see which command corresponds to this

    /* Handle Errors */
    if (reply.replyType === ERROR) {
        commandCallback(new Error(reply.replyValue), null);
        return;
    }

    /* Handle Non-errors */

    // If we switched database numbers, then save that
    // number in this.currDB, so that we can switch back
    // to the same DB on reconnection. We do this because
    // reconnecting to Redis as a client connects you to 
    // database number 1 always.
    if (commandName === "select") {
        client.currDB = commandForReply.commandArgs[0];
    }

    // Handle specific command result typecasting
    if (commandName === "info") {
        var info = {};
        replyValue.replace(/\r\n$/, '').split("\r\n").forEach( function (line) {
            var parts = line.split(":");
            info[parts[0]] = parts[1];
        });
        replyValue = info;
    } else if (commandName === "exists") {
        replyValue = (replyValue === 1) ? true : false;
    } else if ((commandName === "zrange" || commandName === "zrevrange" || commandName === "zrangebyscore") && commandForReply.commandArgs[commandForReply.commandArgs.length-1] === "withscores" && replyValue) {
        var arr = replyValue, hash, currKey, newArr = [];
        for (var i = 0, len = arr.length; i < len; i++) {
            if ((i % 2) === 0) {
                currKey = arr[i];
            } else {
                hash = {};
                hash[currKey] = arr[i];
                newArr.push(hash);
            }
        }
        replyValue = newArr;
    }

    commandCallback(null, replyValue);
};

Client.prototype.close = function () {
    this.expectingClose = true;
    this.stream.end();
};

Client.prototype.giveupConnectionAttempts = function () {
    this.noConnection = true;
    this.emit("noconnection", this);
};

Client.prototype.attemptReconnect = function () {
    var stream = this.stream,
        maxAttempts,
        delay,
        client;
    if (stream.writable && stream.readable) return;
    if (this.expectingClose) return; // TODO
    maxAttempts = this.maxReconnectionAttempts;
    if (maxAttempts === 0) return;
    if (this.reconnectionAttempts++ >= maxAttempts) {
        return this.giveupConnectionAttempts();
    }

    delay = (this.reconnectionDelay *= 2); // Exponential backoff
    client = this;
    this.reconnectionTimer = setTimeout( function () {
        client.emit("reconnecting", client);
        stream.connect(client.port, client.host);
    }, delay);
};

Client.prototype.flushQueuedCommands = function () {
    var queuedCommands = this.queuedCommandHistory,
        commandHistory = this.commandHistory,
        stream = this.stream,
        i = 0, len = queuedCommands.length,
        command;
    while (stream.writable && (command = queuedCommands.shift())) {
        commandHistory.push(command);
        stream.write(command.toBuffer(), "binary");
        delete command.client; // TODO Cleanup
    }
};

Client.prototype.callbackCommandWithError = function (command, errorMessage) {
    var callback = command[command.length-1];
    if (typeof callback === "function") {
        callback(new Error(errorMessage));
    }
};

Client.prototype.callbackOrphanedCommandsWithError = function () {
    for (var i = 0, len = this.commandHistory.length; i < len; i++) {
        this.callbackCommandWithError(this.commandHistory[i], exports.COMMAND_ORPHANED_ERROR);
    }
    this.commandHistory = [];
};

var commands = require("./commandList");

commands.forEach( function (commandName) {
    Client.prototype[commandName] = function () {
        var args = Array.prototype.slice.call(arguments);
        args.unshift(commandName);
        this.sendCommand.apply(this, args);
    };
});

// During transactions, we need to defer REGULAR command calls until
// after the transaction is exited.
// If we don't do this, then we can't deal with the scenario of:
// 1. Start transaction via MULTI
// 2. Send commands (returns immediately)
// 3. Send exec
// TODO Remove this
//Client.prototype.sendCommandInsideTransaction = function () {
//    var args = Array.prototype.slice.call(arguments);
//    args.push(true); // pass a flag to #sendCommand to indicate we're in a transaction
//    this.sendCommand.apply(this, args);
//};

// sendCommand(commandName[, arg1[, arg2[,...[, callback]]]])
Client.prototype.sendCommand = function () {
    var stream = this.stream,
        client = this,
        args = Array.prototype.slice.call(arguments),
        command;
    if (args[0] !== "discard" && !this.doConsiderCommandsTransactional && this.isTransacting) {// && (this.numUnackedTxnCmds > 0 || this.cmdsToRunAfterTxn.length > 0)) {
        this.cmdsToRunAfterTxn.push(args);
        return;
    }
    command = new Command(args, this);

    if (this.doConsiderCommandsTransactional) { // && command.commandName !== "exec") {
        this.numUnackedTxnCmds++;
//        command.transformCuzPartOfTransaction();
        var intendedCommandCallback = command.commandCallback;
        var currTxnCommands = this.currTxnCommands = this.currTxnCommands || [];
        var ackCallback = function (err, reply) {
            if (!err && reply !== "QUEUED") {
                err = command.commandName + " was not queued in the transaction.";
            }
            if (err) { // If there was an error in the syntax of this command
                // Remove the transaction commands still ahead of me:
                for (var i = 0, len = this.numUnackedTxnCmds; i < len; i++); {
                    client.commandHistory.shift();
                }
                // Tell the Redis server to cancel the transaction,
                // so it doesn't block other clients' commands
                client.isTransacting = false;
                client.discard( function (errDiscard, reply) {
                    client.currTxnCommands = [];
                    client.runPostTxnCommands();
                });
                // TODO How do I inform the user that the transaction was rolled back?
//                throw err;
            } else {
                client.numUnackedTxnCmds--;
                if (client.didRegisterAllCommands && client.numUnackedTxnCmds === 0) {
                    client.sendExecToServer();
                }
            }
        }
        command.commandCallback = ackCallback;
        currTxnCommands.push({commandName: command.commandName, callback: intendedCommandCallback});
    }
    if (!stream.writable) { // TODO Analyze this condition with transaction scenario
        this.queuedCommandHistory.push(command);
//        this.queuedCommandBuffers.push(command.toBuffer());
    } else {
        this.commandHistory.push(command);
        stream.write(command.toBuffer(), "binary");
        delete command.client; // TODO cleanup
    }
};

/**
 * What you call to initiate a transaction.
 * Example:
 * client.transaction( function (t) {
 *    t.rpush("list", "value", function () {
 *        // ... Do stuff with the result of this command
 *    });
 *    t.lpop("list", function () {
 *        // ... Do stuff with the result of this command
 *    });
 * });
 * @param {Function} doStuffInsideTransaction is a function that wraps one or more commands that you want executed inside the transaction.
 */
Client.prototype.transaction = function (doStuffInsideTransaction) {
    // The following if handles nested transactions: e.g., 
    // client.transaction( function (t) {
    // });
    // client.transaction (function (t2) {
    //     // ... Do stuff here
    // }
    if (this.doConsiderCommandsTransactional) {
        doStuffInsideTransaction();
    } else if (!this.isTransacting) {
        this.sendMultiToServer();
        this.isTransacting = true;
        this.doConsiderCommandsTransactional = true;
        this.didRegisterAllCommands = false;
        this.numUnackedTxnCmds = 0;
        doStuffInsideTransaction();
        this.didRegisterAllCommands = true;
        this.doConsiderCommandsTransactional = false;
        if (this.numUnackedTxnCmds === 0) this.sendExecToServer();
    } else {
        this.cmdsToRunAfterTxn.push(doStuffInsideTransaction);
    }
    // TODO Remove this.queuedTransactionBlocks
    // TODO Remove Transaction
};

Client.prototype.sendMultiToServer = function () {
    this.multi( function (err, reply) {
        if (err) throw err;
        if (reply !== true) throw new Error("Expected 'OK'. Reply is " + sys.inspect(reply));
    });
};

Client.prototype.sendExecToServer = function () {
    var client = this;
    this.isTransacting = false;
    this.exec( function (err, replies) {
        if (err) throw err;
        var reply;
        while (reply = replies.shift()) {
            client.handleReply(reply, client, true);
        }
    });
    this.runPostTxnCommands();
};

Client.prototype.runPostTxnCommands = function () {
    var nextCmds = this.cmdsToRunAfterTxn, nextCmdAsArray;
    while (nextCmdAsArray = nextCmds.shift()) {
        if (typeof nextCmdAsArray === "function") {
            this.transaction(nextCmdAsArray);
            break;
        } else {
            this.sendCommand.apply(this, nextCmdAsArray);
        }
    }
};

var commandFns,
    commandBuilder;
for (var commandName in commandConfig) {
    commandFns = commandConfig[commandName];
    if (commandBuilder = commandFns.buildCommandArray) {
        Client.prototype[commandName] = (function (commandBuilder) {
            return function () {
                var args = commandBuilder.apply(this, arguments);
                this.sendCommand.apply(this, args);
            };
        })(commandBuilder);
    }
};

// TODO Either use this or the version that uses commandConfig
// (in latter case, uncomment hmset in commandList)
Client.prototype.hmset = function (key, hash, callback) {
    var args = ["hmset", key];
    for (var property in hash) if (hash.hasOwnProperty(property)) {
        args.push(property, hash[property]);
    };
    if (callback) args.push(callback);
    this.sendCommand.apply(this, args);
};

Client.prototype.subscribeTo = function (nameOrPattern, callback) {
    var callbacks = this.channelCallbacks,
        methodName;
    if (callbacks[nameOrPattern]) return;
    if (typeof callback !== "function") {
        throw new Error("You must provide a callback function to subscribe");
    }
    callbacks[nameOrPattern] = callback;
    methodName = (/[\*\?\[]/).test(nameOrPattern) ? "psubscribe" : "subscribe";
    this[methodName](nameOrPattern, function (err, reply) {
        if (err) throw err; // TODO Analyze this
    });
};

Client.prototype.unsubscribeFrom = function (nameOrPattern) {
    var callbacks = this.channelCallbacks,
        methodName;
    if (!callbacks[nameOrPattern]) return;
    delete this.channelCallbacks[nameOrPattern];
    methodName = (/[\*\?\[]/).test(nameOrPattern) ? "punsubscribe" : "unsubscribe";
    this[methodName](nameOrPattern);
};

/**
 * Sample calls:
 * client.zunionstore("tokey", ["key1", "key2"]);
 * client.zunionstore("tokey", {key1: 4, key2: 7});
 * client.zunionstore("tokey", {key1: 4, key2: 7}, "sum");
 * client.zunionstore("tokey", {key1: 4, key2: 7}, "min");
 * client.zunionstore("tokey", {key1: 4, key2: 7}, "max");
 */
["zunionstore", "zinterstore"].forEach( function (commandName) {
    Client.prototype[commandName] = function () {
        var args = Array.prototype.slice.call(arguments),
            commandArgs = [commandName],
            dstkey = args.shift(),
            numKeys,
            keys = args.shift(), // Either an array of keys or a hash mapping keys to weights
            aggregateType,
            callback;
        if (typeof args[args.length-1] === "function") {
            callback = args.pop();
        }
        aggregateType = args.shift(); // either "sum", "min", or "max"
        commandArgs.push(dstkey);
        if (keys instanceof Array) {
            numKeys = keys.length;
            commandArgs.push(numKeys);
            for (var i = 0; i < numKeys; i++) {
                commandArgs.push(keys[i]);
            }
        } else if (keys instanceof Object) {
            var weights = [];
            numKeys = 0;
            for (var keyName in keys) if (keys.hasOwnProperty(keyName)) {
                weights.push(keys[keyName]);
                commandArgs.push(keyName);
                numKeys++;
            }
            commandArgs.splice(2, 0, numKeys);
            commandArgs.push("WEIGHTS");
            for (var i = 0; i < numKeys; i++) {
                commandArgs.push(weights[i]);
            }
        }
        if (aggregateType) {
            commandArgs.push("AGGREGATE", aggregateType);
        }
        if (callback) commandArgs.push(callback);
        this.sendCommand.apply(this, commandArgs);
    };
});
