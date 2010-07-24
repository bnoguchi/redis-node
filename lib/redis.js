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
    Transaction = require("./transaction").Transaction,
    ReplyStream = require("./replyStream").ReplyStream;

Object.prototype.extend = function () {
  var objects = Array.prototype.slice.call(arguments),
      i = 0, len = objects.length, object, key;
  for ( ; i < len; i++) {
    object = objects[i];
    for (key in object) {
      if (!object.hasOwnProperty(key)) continue;
      this[key] = object[key];
    }
  }
};

var net = require("net"),
    sys = require("sys"),
    EventEmitter = require("events").EventEmitter,

    // Type of Replies
    ERROR     = exports.ERROR = "ERROR",
    INLINE    = exports.INLINE = "INLINE",
    INTEGER   = exports.INTEGER = "INTEGER",
    BULK      = exports.BULK = "BULK",
    MULTIBULK = exports.MULTIBULK = "MULTIBULK",
    
    DEFAULT_HOST = "127.0.0.1",
    DEFAULT_PORT = 6379;

exports.createClient = function (port, host, options) {
    return new Client(port || DEFAULT_PORT, host || DEFAULT_HOST, options);
};

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
    this.queuedCommandBuffers = [];

    this.connectionsMade = 0;

    var client = this; // For closures

    // Setup the TCP connection
    var stream = this.stream = net.createConnection(this.port = port, this.host = host);

    var replyStream = new ReplyStream(stream, client);
    replyStream.on("reply", function (reply) {
//        sys.log(sys.inspect(reply)); // Uncomment this to see the reply
        /* Handle special case of PubSub */
        var pubSubCallback;
        if (reply.isMessage() || reply.isPMessage()) {
            pubSubCallback = client.channelCallbacks[reply.channelPattern || reply.channelName];
            pubSubCallback(reply.channelName, reply.message, reply.channelPattern)
            return;
        }

        // Now handle all other replies

        // 1. Find the command name corresponding to the reply
        // 2. Find or define a callback (needed for ALL reply types)
        var commandForReply = client.commandHistory.shift(),
            commandName = commandForReply.commandName,
            commandCallback;

//        sys.log(sys.inspect(commandForReply)); // Uncomment this to see which command corresponds to this

        commandForReply.addCallbackIfMissing();
        commandCallback = commandForReply.commandCallback;

        /* Handle Errors */
        if (reply.replyType === ERROR) {
            commandCallback(reply.replyValue, null);
            return;
        }

        /* Handle Non-errors */
        // Collapse multibulk's replies to just their values:
        // Handle by specific command names using commandConfig import
        var callbackArg = commandConfig.typecastReply(commandName, reply);
        if (reply.replyType === MULTIBULK && callbackArg) {
            callbackArg = collapseToValue(callbackArg);
        }
        commandCallback(null, callbackArg);
    });

    stream.on("connect", function () {
        var eventName = client.connectionsMade === 0
                      ? "connected"
                      : "reconnected";

        stream.setNoDelay();
        stream.setTimeout(0);

        client.reconnectionAttempts = 0;
        client.reconnectionDelay = 500;
        if (client.reconnectionTimer) {
            clearTimeout(client.reconnectionTimer);
            client.reconnectionTimer = null;
        }

        client.connectionsMade++;
        client.expectingClose = false;

        if (client.connectionsMade > 1 && client.commandHistory.length > 0) {
            client.callbackOrphanedCommandsWithError();
        }
        client.flushQueuedCommands();
        client.emit(eventName);
    });

    stream.on("error", function (e) {
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
    if (this.reconnectionAttempts++ >= maxAttempts) return this.giveupConnectionAttempts();

    delay = (this.reconnectionDelay *= 2); // Exponential backoff
    client = this;
    this.reconnectionTimer = setTimeout( function () {
        client.emit("reconnecting", client);
        stream.connect(client.port, client.host);
    }, delay);
};

Client.prototype.flushQueuedCommands = function () {
    var queuedBuffers = this.queuedCommandBuffers,
        queuedCommands = this.queuedCommandHistory,
        commandHistory = this.commandHistory,
        stream = this.stream,
        i = 0, len = queuedBuffers.length,
        commandBuffer, command;
    while (stream.writable && (commandBuffer = queuedBuffers.shift())) {
        command = queuedCommands.shift();
        stream.write(commandBuffer, "binary");
        commandHistory.push(command);
    }
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
        command = new Command(args);
    }
    if (!stream.writable || (this.isTransacting && !insideTransaction)) {
        this.queuedCommandHistory.push(command);
        this.queuedCommandBuffers.push(command.toBuffer());
    } else {
        this.commandHistory.push(command);
        stream.write(command.toBuffer(), "binary");
    }
};

Client.prototype.transaction = function (doStuffInsideTransaction) {
    var txnQueue = this.queuedTransactionBlocks,
        client = this;
    if (this.isTransacting) {
        txnQueue.push(doStuffInsideTransaction);
    } else {
        var txn = new Transaction(this);
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
        // TODO
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

// TODO Remove
var collapseToValue = function (o) {
    if (o instanceof Array) {
        var elt, replyValue;
        for (var i=0, len = o.length; i < len; i++) {
            elt = o[i];
            replyValue = elt.replyValue;
            if (elt.replyType === ERROR) {
                o[i] = new Error(replyValue);
            }
            else if (replyValue !== undefined) {
                if (replyValue instanceof Array) {
                    o[i] = collapseToValue(replyValue);
                } else {
                    o[i] = replyValue;
                }
            } else {
                if (elt instanceof Array) {
                    o[i] = collapseToValue(elt);
                } else {
                    o[i] = elt;
                }
            }
        }
    }
    return o;
};

// TODO Remove
exports.collapseMultibulk = function (o) {
    if (o instanceof Array) {
        for (var i=0; i<o.length; ++i) 
            o[i] = o[i].replyValue;
    } else if (o instanceof Object) {
        var props = Object.getOwnPropertyNames(o);
        for (var i=0; i<props.length; ++i) 
            if (o[props[i]] instanceof Buffer) 
                o[props[i]] = o[props[i]].utf8Slice(0, o[props[i]].length);
    }
};
