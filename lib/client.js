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
    this.isTransacting = false;
    this.queuedTransactionBlocks = []; // If more than 1 transaction is called near the same time

    // For storing queued commands that build up when there isn't a connection
    // or if we shouldn't send yet because we're in the middle of a transaction.
    this.queuedCommandHistory = [];
//    this.queuedCommandBuffers = [];

    this.connectionsMade = 0;

    var client = this; // For closures

    // Re-usable parser used to interpret the leading line of every reply
    this._firstLineParser = new FirstLine();

    // Re-usable request buffer to write commands to
    this.requestBuffer = new Buffer(512);

    // Setup the TCP connection
    var stream = this.stream = net.createConnection(this.port = port, this.host = host);

    var replyStream = new ReplyStream(stream, client);
    replyStream.on("reply", function (reply) {
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
        var commandForReply = client.commandHistory.shift(),
            commandName = commandForReply.commandName,
            commandCallback = commandForReply.commandCallback;

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
            reply.replyValue.replace(/\r\n$/, '').split("\r\n").forEach( function (line) {
                var parts = line.split(":");
                info[parts[0]] = parts[1];
            });
            reply.replyValue = info;
        } else if (commandName === "exists") {
            reply.replyValue = (reply.replyValue === 1) ? true : false;
        }

        commandCallback(null, reply.replyValue);
    });

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
        if (!(args[0] instanceof Command)) {
            args.unshift(commandName);
        }
        this.sendCommand.apply(this, args);
    };
});

// Need this for transactions because during transactions, we
// need to defer REGULAR command calls until after the
// transaction has exited. If we don't do this, then we cannot
// deal with the following scenario:
// 1. Start transaction via MULTI
// 2. Send commands (returns immediately)
// 3. Send exec
Client.prototype.sendCommandInsideTransaction = function () {
    var args = Array.prototype.slice.call(arguments);
    args.push(true);
    this.sendCommand.apply(this, args);
};

// sendCommand(commandName[, arg1[, arg2[,...[, callback]]]])
Client.prototype.sendCommand = function () {
    var stream = this.stream,
        client = this,
        args = Array.prototype.slice.call(arguments),
        command,
        insideTransaction;

        if (args[args.length-1] === true) {
            insideTransaction = true;
            // Remove insideTransaction flag from args, so it isn't sent to Redis server
            args.pop(); 
        } else {
            insideTransaction = false;
        }

    if (args[0] instanceof Command) {
        command = args[0];
        insideTransaction = true;
    } else {
        command = new Command(args, this);
    }
    if (!stream.writable || (this.isTransacting && !insideTransaction)) {
        this.queuedCommandHistory.push(command);
//        this.queuedCommandBuffers.push(command.toBuffer());
    } else {
        this.commandHistory.push(command);
        stream.write(command.toBuffer(), "binary");
        delete command.client; // TODO cleanup
    }
};

Client.prototype.transaction = function (doStuffInsideTransaction) {
    var txnQueue = this.queuedTransactionBlocks,
        client = this;
    if (this.isTransacting) {
        txnQueue.push(doStuffInsideTransaction);
    } else {
        var txn = new Transaction(this);
        this.txn = txn;
        txn.execute(doStuffInsideTransaction);
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
