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

var sys = require("sys"),
    MULTIBULK = exports.MULTIBULK = "MULTIBULK";

module.exports = {
// TODO Move this functionality into Reply.prototype?
typecastReply: function (commandName, reply) {
    // This could occur with a multibulk reply containing null
    // e.g., lrange padding empty positions with null
    if (reply instanceof Error) return reply;
    if (reply === null) return reply;

    if (this[commandName] && this[commandName].typecastReply) {
        return this[commandName].typecastReply(reply);
    } else {
        return (reply.replyValue !== undefined) ? reply.replyValue : reply;
    }
},

info: {
    typecastReply: function (reply) {
        var info = {};
        reply.replyValue.
            asciiSlice(0, reply.replyValue.length).
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
    buildCommandArray: function (key, options, callback) {
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
//        sys.log("Z");
        return args;
    },

    // TODO Come back and clean this up!
    typecastReply: function (reply) {
        sys.log("X");
        var toMap,
            withReplyValues;

        // For the case where we use SORT ... STORE ...,
        // which returns the number of elements in the new stored list
        if (reply.replyType === "INTEGER") return reply.replyValue;

        // For the case where we're in a transaction after MULTI,
        // which returns the status "QUEUE"
        if (reply.replyType === "INLINE") return reply.replyValue;

        // This occurs when reply is a nested MULTIBULK of a larger
        // MULTIBULK. For example, as the result to a SORT called
        // within a transaction. The result to that sort is returned
        // as the element of a MULTIBULK reply represented by the
        // EXEC reply, which sends back the array of replies for all
        // enclosed transactional commands. Example reply is:
        // [ [ 'body'
        //   , '87 videos made in one day.'
        //   , 'votes'
        //   , '0'
        //   , 'userId'
        //   , '1'
        //   , 'id'
        //   , '1'
        //   ]
        // ]

        if ((reply instanceof Array) && (typeof reply[0].replyValue === "undefined")) {
            toMap = reply;
            withReplyValues = false;

        // Otherwise, this is what we would typically expect...
        } else {
            toMap = reply.replyValue;
            withReplyValues = true;
        }
        return toMap && toMap.map( function (a) {
            var hash = {}, i, len,
                val = withReplyValues ? a.replyValue : a;
            if (val instanceof Array) {
                len = val.length;
                for (i = 0; i < len; i+=2) {
                    if (withReplyValues) {
                        hash[val[i].replyValue] = val[i+1].replyValue;
                    } else {
                        hash[val[i]] = val[i+1];
                    }
                }
                return hash;
            } else {
                return val;
            }
        });
    }
},

hgetall: {
    typecastReply: function (reply) {
        var hash = {},
            replyValue = reply.replyValue;
        for (var i = 0, len = replyValue.length; i < len; i += 2) {
            hash[replyValue[i].replyValue] = replyValue[i+1].replyValue;
        }
        return hash;
    }
},

hmset: {
    buildCommandArray: function (key, kvPairs, callback) {
        var args = ["hmset", key],
            key;
        for (key in kvPairs) {
            if (!kvPairs.hasOwnProperty(key)) continue;
            args.push(key, kvPairs[key]);
        }
        if (callback) {
            args.push(callback);
        }
        return args;
    }
}
};

