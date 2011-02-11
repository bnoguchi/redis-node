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

var util = require("util");
var Buffer = require("buffer").Buffer,
    CRLF      = "\r\n";


var Command = exports.Command = function (commandAsArray, client) {
    var commandName = this.commandName = commandAsArray.shift();
    if (typeof commandAsArray[commandAsArray.length-1] === "function") {
        this.commandCallback = commandAsArray.pop();
    }

    // Helps the client to accept the option {encoding: "binary"} for client.get
    // Useful when retrieving a stored image
    if (commandName === "get" && commandAsArray[commandAsArray.length-1].encoding) {
        this.encoding = commandAsArray.pop().encoding;
    }
    this.commandArgs = commandAsArray;
    this.client = client;
    this.isPubSub = /^p?(un)?subscribe$/.test(commandName);
};

Command.prototype = {
// So we keep things lightweight in our commandHistory
toHash: function () {
    var commandName = this.commandName;
    var hash = {
        commandName: commandName
    };
    if (this.hasOwnProperty("commandCallback")) {
        hash.commandCallback = this.commandCallback;
    }
    if (commandName === "select") {
        hash.db = this.commandArgs[0];
    }
    var args = this.commandArgs;
    if (args[args.length-1] === "withscores") {
        hash.withscores = true;
    }
    if (this.encoding) hash.encoding = this.encoding;
    return hash;
},

// Default Callback in case a commandCallback is not explicitly
// set on the command instance
commandCallback: function (err, reply) {
  if (err) util.log(err);
},

hasBufferArgs: function () {
    var args = this.commandArgs;
    for (var i = 0, len = args.length; i < len; i++) {
        if (Buffer.isBuffer(args[i])) {
            return true;
        }
    }
    return false;
},
/**
 * Returns the command in a form that can get sent over the stream
 * to the Redis server. Either returns a Buffer or a String.
 */
writeToStream: function () {
    var commandArgs = this.commandArgs,
        commandName = this.commandName,
        numArgs = commandArgs.length,
        expectedBulks = 1 + numArgs, // +1 for commandName
        useBuffer = this.hasBufferArgs(),
        cmdStr = "*" + (1 + numArgs) + CRLF +    // Bulks to expect; +1 for commandName
                 "$" + commandName.length + CRLF + // Command Name Bytelength
                 commandName + CRLF,
        stream = this.client.stream,
        i, arg;
    if (useBuffer) {
        stream.write(cmdStr);
        for (i = 0; i < numArgs; i++) {
            arg = commandArgs[i];
            if (Buffer.isBuffer(arg)) {
                stream.write("$" + arg.length + CRLF);
                stream.write(arg);
                stream.write(CRLF);
            } else {
                arg = arg + '';
                stream.write("$" + arg.length + CRLF + arg + CRLF);
            }
        }
    } else if (this.client.utf8) {
        stream.write(cmdStr);
        for (i = 0; i < numArgs; i++) {
            arg = commandArgs[i] + '';
            if (!Buffer.isBuffer(arg)) arg = new Buffer(arg);
            stream.write("$" + arg.length + CRLF);
            stream.write(arg);
            stream.write(CRLF);
        }
    } else {
        for (i = 0; i < numArgs; i++) {
            arg = commandArgs[i] + '';
            cmdStr += "$" + arg.length + CRLF + arg + CRLF;
        }
        stream.write(cmdStr);
    }
//    delete this.client; // Removes client from command, so command's easier on the eyes when util inspecting
}
};
