// TODO Remove the dependency on this file

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
    var cmdConfig = this[commandName],
        typecaster;
    if (cmdConfig && (typecaster = cmdConfig.typecastReply)) {
        return typecaster(reply);
    } else {
        return reply.replyValue;
        // TODO Is is reply.replyValue ever undefined?
//        return (reply.replyValue !== undefined) ? reply.replyValue : reply;
    }
},

info: {
    typecastReply: function (reply) {
        var info = {};
        reply.replyValue.
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
        return args;
    }
},

hmset: {
    buildCommandArray: function (key, kvPairs, callback) {
        var args = ["hmset", key];
        for (var property in kvPairs) {
            if (!kvPairs.hasOwnProperty(property)) continue;
            args.push(property, kvPairs[property]);
        }
        if (callback) args.push(callback);
        return args;
    }
}
};
