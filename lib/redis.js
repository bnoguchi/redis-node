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
    Buffer = require("buffer").Buffer,
    EventEmitter = require("events").EventEmitter,

    CR        = 0x0D, // \r
    LF        = 0x0A, // \n
    PLUS      = 0x2B, // +
    MINUS     = 0x2D, // -
    DOLLAR    = 0x24, // $
    STAR      = 0x2A, // *
    COLON     = 0x3A, // :

    CRLF      = "\r\n",

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
    this.connectionsMade = 0;

    this.requestBuffer = new Buffer(512);

    var client = this; // For closures

    // Setup the TCP connection
    var stream = this.stream = net.createConnection(this.port = port, this.host = host);

    var replyStream = new ReplyStream(stream);
    replyStream.on("reply", function (reply) {

        /* Handle special case of PubSub */
        if (reply.isMessage || reply.isPMessage) {
            client.handlePubSub(reply);
            return;
        }

        // Now handle all other replies

        // 1. Find the command name corresponding to the reply
        // 2. Find or define a callback (needed for ALL reply types)
        var commandForReply = client.commandHistory.shift(),
            commandName = commandForReply[0],
            commandCallback = commandForReply[commandForReply.length-1];
        if (typeof commandCallback !== "function") {
            // Create a phantom callback if we don't have a callback
            commandCallback = function (err, reply) {
                if (err) sys.log(err);
            };
        }

        /* Handle Errors */
        if (reply.type === ERROR) {
            reply.value = reply.value.utf8Slice(0, reply.value.length);
            commandCallback(reply.value, null);
            return;
        }

        /* Handle Non-errors */
        // FIRST, handle by reply type
        var callbackArg;
        if (reply.type === MULTIBULK && reply.value && reply.value instanceof Array) {
            reply.value = reply.value.map( function (a) {
                return a.value;
            });
        }
        // THEN, handle by specific command names
        if (commandConfig[commandName] && commandConfig[commandName].receive) {
            callbackArg = commandConfig[commandName].receive(reply);
        } else {
            callbackArg = reply.value;
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
//        client.flushQueuedCommands();
        client.emit(eventName);
    });

    stream.on("error", function (e) {
        throw e;
    });

    stream.on("end", function () {
        stream.end();
    });

    stream.on("close", function () {
//        client.maybeReconnect();
    });
};
sys.inherits(Client, EventEmitter);

Client.prototype.handlePubSub = function (reply) {
    var pubsubCallback,
        channelName,
        channelPattern;

    if (reply.isMessage) {
        channelName = reply.value[1].value;
        pubsubCallback = client.channelCallbacks[channelName];
        message = reply.value[2].value;
    } else if (reply.isPMessage) {
        channelName = reply.value[1].value;
        channelPattern = reply.value[2].value;
        pubsubCallback = client.channelCallbacks[channelPattern];
        message = reply.value[3].value;
    }
    pubsubCallback(channelName, message, channelPattern);
};

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

var commands = [ 
    "append",
    "auth",
    "bgsave",
    "blpop",
    "brpop",
    "dbsize",
    "decr",
    "decrby",
    "del",
    "exists",
    "expire",
    "expireat",
    "flushall",
    "flushdb",
    "get",
    "getset",
    "hdel",
    "hexists",
    "hget",
    "hgetall",
    "hincrby",
    "hkeys",
    "hlen",
    "hmget",
    "hmset",
    "hset",
    "hvals",
    "incr",
    "incrby",
    "info",
    "keys",
    "lastsave",
    "len",
    "lindex",
    "llen",
    "lpop",
    "lpush",
    "lrange",
    "lrem",
    "lset",
    "ltrim",
    "mget",
    "move",
    "mset",
    "msetnx",
    "psubscribe",
    "publish",
    "punsubscribe",
    "randomkey",
    "rename",
    "renamenx",
    "rpop",
    "rpoplpush",
    "rpush",
    "sadd",
    "save",
    "scard",
    "sdiff",
    "sdiffstore",
    "select",
    "set",
    "setex",
    "setnx",
    "shutdown",
    "sinter",
    "sinterstore",
    "sismember",
    "smembers",
    "smove",
//    "sort",
    "spop",
    "srandmember",
    "srem",
    "subscribe",
    "sunion",
    "sunionstore",
    "ttl",
    "type",
    "unsubscribe",
    "zadd",
    "zcard",
    "zcount",
    "zincrby",
    "zinterstore",
    "zrange",
    "zrangebyscore",
    "zrank",
    "zrem",
    "zrembyrank",
    "zremrangebyrank",
    "zremrangebyscore",
    "zrevrange",
    "zrevrank",
    "zscore",
    "zunionstore",
];

commands.forEach( function (commandName) {
    Client.prototype[commandName] = function () {
        var args = Array.prototype.slice.call(arguments);
        args.unshift(commandName);
        this.call.apply(this, args);
    };
});

Client.prototype.call = function () {
    var stream = this.stream,
        client = this,
        commandAsArray = Array.prototype.slice.call(arguments),
        commandName = commandAsArray[0].toLowerCase(),
        commandAsArrayNoCallback,
        commandBuffer;

    // ensureConnected()
//    if (!isConnected) this.connect(); // TODO REDO because we're evented

    // Handle case where there's no callback
    if (typeof commandAsArray[commandAsArray.length-1] === "function") {
        commandAsArrayNoCallback = commandAsArray.slice(0, commandAsArray.length-1);
    } else {
        commandAsArrayNoCallback = commandAsArray;
    }
    if (stream.writable) {
        this.commandHistory.push(commandAsArray);
        commandBuffer = this._buildCommand(commandAsArrayNoCallback);
        stream.write(commandBuffer, "binary");
    }
};

Client.prototype._maybeResizeRequestBuffer = function (atLeast, offset) {
    var currLength = this.requestBuffer.length,
        bufferLen,
        newBuffer;

    if (offset + atLeast > currLength) {
        bufferLen = Math.max(currLength * 2, atLeast * 1.1);
        newBuffer = new Buffer(Math.round(bufferLen));
        this.requestBuffer.copy(newBuffer, 0, 0, offset);
        this.requestBuffer = newBuffer;
    }
};

Client.prototype._writeArgToRequestBuffer = function (arg, currOffset) {
    var argAsString, argSerialized, extrasLength;
    if (arg instanceof Buffer) {
        extrasLength = 5; // For "$", "\r\n", "\r\n"
        this._maybeResizeRequestBuffer(arg.length.toString().length + arg.length + extrasLength, currOffset);
        currOffset += this.requestBuffer.asciiWrite("$" + arg.length + CRLF, currOffset);
        currOffset += arg.copy(this.requestBuffer, currOffset, 0);
        currOffset += this.requestBuffer.asciiWrite(CRLF, currOffset);
    } else if (arg.toString) {
        argAsString = arg.toString();
        argSerialized = 
            "$" + Buffer.byteLength(argAsString, "binary") + CRLF +
            argAsString + CRLF;
        this._maybeResizeRequestBuffer(Buffer.byteLength(argSerialized, "binary"), currOffset);
        currOffset += this.requestBuffer.binaryWrite(argSerialized, currOffset);
    }
    return currOffset;
};

var commandConfig = {
info: {
    receive: function (reply) {
        var info = {};
        reply.value.
            asciiSlice(0, reply.value.length).
            split(/\r\n/).
            forEach( function (line) {
                var parts = line.split(":");
                if (parts.length === 2) {
                    info[parts[0]] = parts[1];
                }
            });
        return info;
    }
},
sort: {
    send: function (key, options, callback) {
        var args = ["sort", key];
        if (options.by) {
            args.push("by", options.by);
        }
        if (options.limit) {
            args.push("limit", options.limit[0], options.limit[1]);
        }
        if (options.get) {
            args.push("get", options.get);
        }
        if (options.order) {
            args.push(options.order);
        }
        if (options.store) {
            args.push("store", options.store);
        }
        if (callback) {
            args.push(callback);
        }
        this.call.apply(this, args);
    },
    receive: function (reply) {
        return reply.value.map( function (a) {
            var hash = {}, i, len;
            if (a instanceof Array) {
                len = a.length;
                for (i = 0; i < len; i+=2) {
                    hash[a[i].value] = a[i+1].value;
                }
                return hash;
            } else {
                return a;
            }
        });
    }
},

hgetall: {
    receive: function (reply) {
        var hash = {};
        for (var i = 0, len = reply.value.length; i < len; i += 2) {
            hash[reply.value[i].value] = reply.value[i+1].value;
        }
        return hash;
    }
},

hmset: {
    send: function (key, kvPairs, callback) {
        var args = ["hmset", key],
            key;
        for (key in kvPairs) {
            if (!kvPairs.hasOwnProperty(key)) continue;
            args.push(key, kvPairs[key]);
        }
        if (callback) {
            args.push(callback);
        }
        this.call.apply(this, args);
    }
},

multi: {
    // client.multi( function (client) {
    //  client.hmset();
    // });
    // client.multi().abc().def()
    send: function (callback) {
        this.call("multi", function (err, reply) {
            if (err) throw err;
            if (reply) {
                callback();
            }
        });
    }
},
exec: {
    send: function () {
    }
}
};

var commandFns,
    commandSend;
for (var commandName in commandConfig) {
    commandFns = commandConfig[commandName];
    if (commandSend = commandFns.send) {
        Client.prototype[commandName] = commandSend;
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

/**
 * @commandArr is the command in array form without the callback
 */
Client.prototype._buildCommand = function (commandArr) {
    var commandName = commandArr[0],
        expectedBulks = commandArr.length,
        offset = this.requestBuffer.utf8Write(
            "*" + expectedBulks + CRLF +    // Bulks to expect
            "$" + commandName.length + CRLF + // Command Name Bytelength
            commandName + CRLF,
        0),
        i, arg,
        outBuffer;
    sys.log("ARRAY " + sys.inspect(commandArr));
    for (i = 1; i < expectedBulks; i++) {
        offset = this._writeArgToRequestBuffer(commandArr[i], offset);
    }
    outBuffer = new Buffer(offset);
    this.requestBuffer.copy(outBuffer, 0, 0, offset);
    return outBuffer;
};

exports.convertMultiBulkBuffersToUTF8Strings = function (o) {
    if (o instanceof Array) {
        for (var i=0; i<o.length; ++i) 
            if (o[i] instanceof Buffer) 
                o[i] = o[i].utf8Slice(0, o[i].length);
    } else if (o instanceof Object) {
        var props = Object.getOwnPropertyNames(o);
        for (var i=0; i<props.length; ++i) 
            if (o[props[i]] instanceof Buffer) 
                o[props[i]] = o[props[i]].utf8Slice(0, o[props[i]].length);
    }
};

var ReplyStream = exports.ReplyStream = function ReplyStream (dataStream) {
    var replyStream = this,
        currReply = new Reply();

    this.handleData = function (data) {
        // A partial reply has to outlive data, so it can parse the next incoming data
        var atDataIndex = 0;
        while (atDataIndex < data.length) {
            atDataIndex = currReply.parseNextLine(data, atDataIndex);
            if (currReply.isComplete) {
                replyStream.emit("reply", currReply.normalize());
                currReply.reset();
            }
        }
    };

    if (dataStream) {
        dataStream.on("data", this.handleData);
    }
};
sys.inherits(ReplyStream, EventEmitter);

var Reply = function Reply () {
    this.replyValue = null;
    this.replyType = null;
    this.params = {};
    this.isComplete = false;
};

Reply.prototype = {
parseNextLine: function (data, atDataIndex) {
    var indexOfContentStart, content;
    if (!this.replyType) {
        this.replyType = this.DATA_TO_TYPE[data[atDataIndex]];
        atDataIndex++;
        indexOfContentStart = atDataIndex;
        for ( ; data[atDataIndex] !== CR; atDataIndex++) {}
        content = data.slice(indexOfContentStart, atDataIndex);
        atDataIndex += 2; // Move pointer to beginning of next line
        this["interpret" + this.replyType + "firstLine"](content);
    } else {
        atDataIndex = this["interpret" + this.replyType + "subsequentLine"](data, atDataIndex);
    }
    return atDataIndex;
},
interpretINLINEfirstLine: function (content) {
    this.replyValue = content;
    this.isComplete = true;
},
interpretERRORfirstLine: function (content) {
    this.replyValue = content;
    this.isComplete = true;
},
interpretINTEGERfirstLine: function (content) {
    this.replyValue = parseInt(content, 10);
    this.isComplete = true;
},
interpretBULKfirstLine: function (content, data, atDataIndex) {
    // Save so we can reference this number in the next line
    var expected = this.params.bulkLengthExpected = parseInt(content, 10);
    if (expected <= 0) {
        this.replyValue = null;
        this.isComplete = true;
    }
},
interpretBULKsubsequentLine: function (data, atDataIndex) {
    var expected = this.params.bulkLengthExpected,
        sliceTo;
    if (data.length < atDataIndex + expected) {
        sliceTo = data.length;
        if (this.replyValue) {
            data.copy(this.replyValue, this.params.bytesWritten, atDataIndex, sliceTo);
        } else {
            this.params.bytesWritten = 0;
            this.replyValue = new Buffer(expected);
            data.copy(this.replyValue, 0, atDataIndex, sliceTo);
        }
        this.params.bytesWritten += (sliceTo - atDataIndex);
        this.params.bulkLengthExpected = atDataIndex + expected - data.length;
        return sliceTo;
    } else {
        sliceTo = atDataIndex + expected;
        this.isComplete = true;
        if (this.replyValue) {
            data.copy(this.replyValue, this.params.bytesWritten, atDataIndex, sliceTo);
            // this.params.bytesWritten += (sliceTo - atDataIndex);
        } else {
            this.replyValue = data.slice(atDataIndex, sliceTo);
        }
        return sliceTo + 2; // 2 = LF + 1
    }
},
interpretMULTIBULKfirstLine: function (content) {
    this.params.multibulkRepliesExpected = parseInt(content, 10);
    this.params.replies = [];
},
interpretMULTIBULKsubsequentLine: function (data, atDataIndex) {
    var expected = this.params.multibulkRepliesExpected,
        childReplies = this.params.replies,
        childReplyForParse,
        newReply,
        latestReply = childReplies[childReplies.length-1];
    if (expected <=0) {
        this.isComplete = true;
        this.replyValue = null;
        return atDataIndex;
    }
    // If this is our first child OR if our most recent child is complete
    // Then create a new child reply to parse
    if (!latestReply || latestReply.isComplete) { // If this is our first child reply
        newReply = new Reply();
        childReplies.push(newReply);
        childReplyForParse = newReply;

    // Else our most recent child reply is INcomplete
    // Then pass the data to the child reply to parse
    } else {
        childReplyForParse = latestReply;
    }
    atDataIndex = childReplyForParse.parseNextLine(data, atDataIndex);
    if (childReplyForParse.isComplete && childReplies.length === expected) {
        this.isComplete = true;
        this.replyValue = "replaceMeWithNormalized";
    }
    
    return atDataIndex;
},
reset: function () {
    this.replyType = null;
    this.replyValue = null;
    this.params = {};
    this.isComplete = false;
},
normalize: function () {
    var normalized = {
            type: this.replyType,
            value: this.normalizeValue()
        },
        value = normalized.value;
    if (this.replyType === MULTIBULK && value instanceof Array) {
        normalized.isMessage = (
            value.length === 3 && 
            value[0].value.length === 7 && 
            value[0].value.asciiSlice(0,7) === "message"
        );
        normalized.isPMessage = (
            value.length === 4 && 
            value[0].value.length === 8 && 
            value[0].value.asciiSlice(0,8) === "pmessage"
        );
    }
    return normalized;
},
normalizeValue: function () {
    var replyValue = this.replyValue,
        replyType = this.replyType,
        normalized;
    if (replyValue === null) return null;

    if (replyType === INLINE) {
        normalized = replyValue.asciiSlice(0, replyValue.length);
        if (normalized === "OK") return true;
        return normalized;
    } else if (replyType === MULTIBULK) {
        normalized = this.params.replies.map( function (reply) {
            return reply.normalize();
        });
//        exports.convertMultiBulkBuffersToUTF8Strings(normalized);
        return normalized;
    }
    return replyValue;
}
};
(function (Reply) {
  var data2type = {};
  data2type[MINUS] = ERROR;
  data2type[PLUS] = INLINE;
  data2type[COLON] = INTEGER;
  data2type[DOLLAR] = BULK;
  data2type[STAR] = MULTIBULK;
  Reply.prototype.DATA_TO_TYPE = data2type;
})(Reply);
