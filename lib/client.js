/*

© 2010 by Brian Noguchi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

*/

var commandConfig = require("./commandConfig"),
    Command = require("./command").Command,
    Reply = require("./reply").Reply,
    Buffer = require("buffer").Buffer,
    CRLF      = "\r\n";

var net = require("net"),
    sys = require("sys"),
    EventEmitter = require("events").EventEmitter,
    ErrorReply     = require("./replies/errorReply").ErrorReply;

exports.COMMAND_ORPHANED_ERROR = "connection lost before reply received";
exports.NO_CONNECTION_ERROR = "failed to establish a connection to Redis";

var toArray = function (args) {
    var i = 0,
        len = args.length,
        arr = new Array(len);
    for ( ; i < len; i++) {
        arr[i] = args[i];
    }
    return arr;
};
   
// Array.prototype.shift is slow, so we use Tim's Queue data structure instead
// that has a faster shift().
//
// Queue class adapted from Tim Caswell's pattern library
// http://github.com/creationix/pattern/blob/master/lib/pattern/queue.js
var Queue = function () {
    this.tail = [];
    this.head = toArray(arguments);
    this.offset = 0;
};

Queue.prototype.peek = function () {
    return this.head[this.offset] || this.tail[0];
    if (this.offset === this.head.length) {
        var tmp = this.head;
        tmp.length = 0;
        this.head = this.tail;
        this.tail = tmp;
        this.offset = 0;
        if (this.head.length === 0) return;
    }
    return this.head[this.offset];
};

Queue.prototype.shift = function () {
    if (this.offset === this.head.length) {
        var tmp = this.head;
        tmp.length = 0;
        this.head = this.tail;
        this.tail = tmp;
        this.offset = 0;
        if (this.head.length === 0) return;
    }
    return this.head[this.offset++];
}

Queue.prototype.push = function (item) {
    return this.tail.push(item);
};

Object.defineProperty(Queue.prototype, 'length', {
    get: function () {
        return this.head.length - this.offset + this.tail.length;
    }
});

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
    [this.DEFAULT_OPTIONS, options].forEach( function (obj) {
        for (var key in obj) if (obj.hasOwnProperty(key)) {
            this[key] = obj[key];
        }
    });

    // The buffer that stores the reply values when parsing the incoming data stream
    // from Redis.
    this.replyBuffer = new Buffer(512);

    // Stores all commands whose responses haven't been sent to a callback
    this.commandHistory = new Queue();
    this.channelCallbacks = {};

    // State specifying if we're in the middle of a transaction or not.
    this.isSendingTxnCmds = false;
    this.isListeningForTxnAcks = false;
    this.currTxnCommands = []; // TODO Change [] to new Queue()
    this.cmdsToRunAfterTxn = [];

    // For storing queued commands that build up when there isn't a connection
    // or if we shouldn't send yet because we're in the middle of a transaction.
    this.queuedCommandHistory = new Queue();
//    this.queuedCommandBuffers = [];

    this.connectionsMade = 0;

    // Setup the TCP connection
    var stream = this.stream = net.createConnection(this.port = port, this.host = host);

    stream.on("data", this.handleData.bind(this));
//    currReply = null;
//    stream.on("data", function (data) {
//        // A partial reply has to outlive data, so it can parse the next incoming data
//        var atDataIndex = 0,
//            dataLen = data.length;
//
//        while (atDataIndex < dataLen) {
//            if (!currReply) {
//                var typeCode = data[atDataIndex++];
//                currReply = Reply.fromTypeCode(typeCode, client);
//                continue;
//            }
//            atDataIndex = currReply.parse(data, atDataIndex);
//            if (currReply.isComplete) {
//                client.emit("reply", currReply);
//                currReply = null;
//            }
//        }
//    });
    this.on("reply", this.handleReply.bind(this));

//    var replyStream = new ReplyStream(stream, this);
//    replyStream.on("reply", this.handleReply.bind(this));

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
        client.emit("connection error", e);
        if (client.listeners("connection error").length === 0) {
            throw e;
        }
    });

    stream.on("end", function () {
        stream.end();
    });

    stream.on("close", function () {
        client.emit("disconnected");
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

Client.prototype.handleData = function (data) {
    // A partial reply has to outlive data, so it can parse the next incoming data
    var atDataIndex = 0,
        dataLen = data.length,
        currReply = this.currReply;

    while (atDataIndex < dataLen) {
        currReply = this.currReply;
        if (!currReply) {
            var typeCode = data[atDataIndex++];
            currReply = this.currReply = Reply.fromTypeCode(typeCode, this);
            continue;
        }
        atDataIndex = currReply.parse(data, atDataIndex);
        if (currReply.isComplete) {
            this.emit("reply", currReply);
            this.currReply = null;
        }
    }
};

Client.prototype.handleReply = function (reply, isParsingExecReply) {
//        sys.log(sys.inspect(reply)); // Uncomment this to see the reply
    /* Handle special case of PubSub */
    var pubSubCallback, replyValue;
    if (reply.isMessage || reply.isPMessage) {
        replyValue = reply.replyValue;
        pubSubCallback = this.channelCallbacks[replyValue.channelPattern || replyValue.channelName];
        pubSubCallback(replyValue.channelName, replyValue.message, replyValue.channelPattern)
        return;
    }

    // Now handle all other replies

    // 1. Find the command name corresponding to the reply
    // 2. Find or define a callback (needed for ALL reply types)
    var commandForReply, txnCommand, commandName, commandCallback;
    if (isParsingExecReply) {
        txnCommand = this.currTxnCommands.shift();
        commandName = txnCommand.commandName;
        commandCallback = txnCommand.callback;
        replyValue = reply; // reply is just an element in an array representing a multibulk reply
    } else {
        commandForReply = this.commandHistory.shift();
        commandName = commandForReply.commandName;
        commandCallback = commandForReply.commandCallback || Command.prototype.commandCallback;
        replyValue = reply.replyValue;
    }

//        sys.log(sys.inspect(commandForReply)); // Uncomment this to see which command corresponds to this

    /* Handle Errors */
    if (reply instanceof ErrorReply) {
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
        this.currDB = commandForReply.db;
    }

    // Handle specific command result typecasting
    if (!isParsingExecReply) {
        if (commandConfig[commandName]) {
            replyValue = commandConfig[commandName].typecastReplyValue(replyValue, commandForReply);
        }
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
//        this.writeCmdToStream(command);
        commandHistory.push(command.toHash());
        command.writeToStream();
    }
};

Client.prototype.callbackCommandWithError = function (command, errorMessage) {
    var callback = command[command.length-1];
    if (typeof callback === "function") {
        callback(new Error(errorMessage));
    }
};

// TODO Remove [i] dependency
Client.prototype.callbackOrphanedCommandsWithError = function () {
    for (var i = 0, len = this.commandHistory.length; i < len; i++) {
        this.callbackCommandWithError(this.commandHistory[i], exports.COMMAND_ORPHANED_ERROR);
    }
    this.commandHistory = new Queue();
};

var commands = require("./commandList");

commands.forEach( function (commandName) {
    Client.prototype[commandName] = function () {
        var len = arguments.length,
            args = new Array(1 + len);
        args[0] = commandName;
        for (var i = 0, len = arguments.length; i < len; i++) {
            args[i+1] = arguments[i];
        }
        this.sendCommand(args);
    };
});

// This is called every time we receive a 'QUEUED' ACKnowledgment from Redis for
// each command sent after MULTI but before EXEC
Client.prototype.onTxnAck = function (err, reply) {
//    if (!err && reply !== "QUEUED") {
//        err = command.commandName + " was not queued in the transaction.";
//    }
    this.numUnackedTxnCmds--;
    if (err) { // If there was an error in the syntax of this command
        // Remove the transaction commands still ahead of me:
        while(this.numUnackedTxnCmds--) {
            this.commandHistory.shift();
        }
        // Tell the Redis server to cancel the transaction,
        // so it doesn't block other clients' commands
        this.isListeningForTxnAcks = false;
        var client = this;
        this.discard( function (errDiscard, reply) {
            client.currTxnCommands.length = 0; // TODO Queue
            client.runPostTxnCommands();
        });
        // TODO How do I inform the user that the transaction was rolled back?
//                throw err;
    } else {
        // Only if we've sent and received acks for all commands in the transaction
        if (this.didRegisterAllTxnCommands && this.numUnackedTxnCmds === 0) {
            this.sendExecToServer();
        }
    }
};


var transactionManager = {
    isSendingTxnCmds: false,

    // true once EXEC is sent
    isListeningForTxnAcks: false,

    didRegisterAllCommands: false,

    numUnackedCmds: 0,

    beforeSendCmd: function (command) {
        var intendedCmdCallback = this.onTxnAck.bind(client);
        this.numUnackedCmds++;
    }
};

/**
 * Send the command to the Redis server.
 *
 * sendCommand([commandName, arg1, arg2,..., callback])
 */
Client.prototype.sendCommand = function (args) {
    // Intercept non-transactional commands when we are still waiting to hear
    // acks for transactional commands.
    if (args[0] !== "discard" && !this.isSendingTxnCmds && this.isListeningForTxnAcks) {// && (this.numUnackedTxnCmds > 0 || this.cmdsToRunAfterTxn.length > 0)) {
        this.cmdsToRunAfterTxn.push(args);
        return;
    }
    var command = new Command(args, this);
//    this.writeCmdToStream(args);

    if (this.isSendingTxnCmds) {
        this.numUnackedTxnCmds++;
//        command.transformCuzPartOfTransaction();
        var intendedCommandCallback = command.commandCallback || Command.prototype.commandCallback;
        command.commandCallback = this.onTxnAck.bind(this);
        this.currTxnCommands.push({commandName: command.commandName, callback: intendedCommandCallback});
    }
    if (command.isPubSub) {
        this.inPubSubMode = true;
    } else {
        if (this.inPubSubMode) throw new Error("Client is in Pub/Sub mode. Only Pub/Sub commands are allowed in this mode. Use another client for other commands.");
    }
    if (!this.stream.writable) { // TODO Analyze this condition with transaction scenario
        this.queuedCommandHistory.push(command);
//        this.queuedCommandBuffers.push(command.toBuffer());
    } else {
        this.commandHistory.push(command.toHash());
        command.writeToStream();
    }
};

Client.prototype.writeCmdToStream = function (commandAsArray) {
    var commandName = commandAsArray.shift(),
        commandCallback,
        cmdStr,
        useBuffer = false,
        stream = this.stream;

    // Remove the callback
    if (typeof commandAsArray[commandAsArray.length-1] === "function") {
        commandCallback = commandAsArray.pop();
    }
    // Derive additional values or derivative values from the commandAsArray
    var numArgs = commandAsArray.length,
        lastArg = commandAsArray[numArgs-1];

    // Handle the transactional scenario
    if (this.isSendingTxnCmds) {
        this.numUnackedTxnCmds++;
        var intendedCmdCallback = commandCallback || Command.prototype.commandCallback;
        commandCallback = this.onTxnAck.bind(this);
        this.currTxnCommands.push({commandName: commandName, callback: intendedCommandCallback});
    }

    // Handle the PubSub scenario
    var isPubSub = /^p(un)?subscribe$/.test(commandName);
    if (isPubSub) {
        this.inPubSubMode = true;
    } else {
        if (this.inPubSubMode) throw new Error("Client is in Pub/Sub mode. Only Pub/Sub commands are allowed in this mode. Use another client for other commands.");
    }

    var i, arg;
    if (!stream.writable) {
        this.queuedCommandHistory.push(commandAsArray);
    } else {
        var hash = {
            commandName: commandName
        };
        if (commandCallback) hash.commandCallback = commandCallback;
        if (commandName === "select") hash.db = commandAsArray[1];
        if (lastArg === "withscores") hash.withscores = true;
        this.commandHistory.push(hash);
        if (commandName === "get" && lastArg && lastArg.encoding) {
            hash.encoding = encoding;
            numArgs--;
        }
        for (i = 0; i < numArgs; i++) {
            if (commandAsArray[i] instanceof Buffer) {
                useBuffer = true;
                break;
            }
        }

        cmdStr = "*" + (numArgs+1) + CRLF +      // Bulks to expect
                 "$" + commandName.length + CRLF + // Command Name Bytelength
                 commandName + CRLF;

        if (useBuffer) {
            stream.write(cmdStr);
            for (i = 0; i < numArgs; i++) {
                arg = commandAsArray[i];
                if (arg instanceof Buffer) {
                    stream.write("$" + arg.length + CRLF);
                    stream.write(arg);
                    stream.write(CRLF);
                } else {
                    arg = arg + '';
                    stream.write("$" + arg.length + CRLF + arg + CRLF);
                }
            }
        } else {
            for (i = 0; i < numArgs; i++) {
                arg = commandAsArray + '';
                cmdStr += "$" + arg.length + CRLF + arg + CRLF;
            }
            stream.write(cmdStr);
        }
    }

};

// redis-node preserves the order of command and transaction calls in your app.

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
    //   client.transaction (function (t2) {
    //       // ... Do stuff here
    //   }
    // });
    if (this.isSendingTxnCmds) {
        doStuffInsideTransaction();
    } else if (!this.isListeningForTxnAcks) {
        this.sendMultiToServer();
        this.isListeningForTxnAcks = true;
        this.isSendingTxnCmds = true;
        this.didRegisterAllTxnCommands = false;
        this.numUnackedTxnCmds = 0;
        doStuffInsideTransaction();
        this.didRegisterAllTxnCommands = true;
        this.isSendingTxnCmds = false;
        if (this.numUnackedTxnCmds === 0) this.sendExecToServer();
    } else {
        this.cmdsToRunAfterTxn.push(doStuffInsideTransaction);
    }
};

Client.prototype.sendMultiToServer = function () {
    this.multi( function (err, reply) {
        if (err) throw err;
        if (reply !== true) throw new Error("Expected 'OK'. Reply is " + sys.inspect(reply));
    });
};

Client.prototype.sendExecToServer = function () {
    var client = this;
    this.isListeningForTxnAcks = false;
    this.exec( function (err, replies) {
        if (err) throw err;
        var reply;
        while (reply = replies.shift()) {
            client.handleReply(reply, true);
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
            this.sendCommand(nextCmdAsArray);
        }
    }
};

//var commandFns,
//    commandBuilder;
//for (var commandName in commandConfig) {
//    commandFns = commandConfig[commandName];
//    if (commandBuilder = commandFns.buildCommandArray) {
//        Client.prototype[commandName] = (function (commandBuilder) {
//            return function () {
//                var args = commandBuilder.apply(this, arguments);
//                this.sendCommand.apply(this, args);
//            };
//        })(commandBuilder);
//    }
//};

Client.prototype.sort = function (key, options, callback) {
    var args = ["sort", key];
    if (options.by) {
        args.push("by", options.by);
    }
    if (options.limit) {
        args.push("limit", options.limit[0], options.limit[1]);
    }
    if (options.get) {
        if (options.get instanceof Array) {
            options.get.forEach( function (target) {
                args.push("get", target);
            });
        } else {
          args.push("get", options.get);
        }
    }
    if (options.order) {
        args.push(options.order);
    }
    if (options.alpha === true) {
        args.push("alpha");
    }
    if (options.store) {
        args.push("store", options.store);
    }
    if (callback) {
        args.push(callback);
    }
    this.sendCommand(args);
};

// TODO Either use this or the version that uses commandConfig
// (in latter case, uncomment hmset in commandList)
Client.prototype.hmset = function (key, hash, callback) {
    var args = ["hmset", key];
    for (var property in hash) if (hash.hasOwnProperty(property)) {
        args.push(property, hash[property]);
    };
    if (callback) args.push(callback);
    this.sendCommand(args);
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
        var args = toArray(arguments),
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
        this.sendCommand(commandArgs);
    };
});
