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

var sys = require("sys");
var Buffer = require("buffer").Buffer,
    CR        = 0x0D, // \r
    LF        = 0x0A, // \n
    CRLF      = "\r\n";


var Command = exports.Command = function (commandAsArray, client) {
    this.commandName = commandAsArray.shift().toLowerCase();
    if (typeof commandAsArray[commandAsArray.length-1] === "function") {
        this.commandCallback = commandAsArray.pop();
    }

    // Helps the client to accept the option {isExpectingBinary: true} for client.get
    // Useful when retrieving a stored image
    if (this.commandName === "get" && commandAsArray[commandAsArray.length-1] && commandAsArray[commandAsArray.length-1].isExpectingBinary) {
        this.isExpectingBinary = commandAsArray.pop().isExpectingBinary;
    }
    this.commandArgs = commandAsArray;
    this.client = client;
};

Command.prototype = {
// Default Callback in case a commandCallback is not explicitly
// set on the command instance
commandCallback: function (err, reply) {
  if (err) sys.log(err);
},
hasBufferArgs: function () {
    var args = this.commandArgs,
        ret = false;
    for (var i = 0, len = args.length; i < len; i++) {
        if (args[i] instanceof Buffer) {
            ret = true;
            break;
        }
    }
    // Cache the result
    this.hasBufferArgs = function () {
        return ret;
    };
    return ret;
},
/**
 * Returns the command in a form that can get sent over the stream
 * to the Redis server. Either returns a Buffer or a String.
 */
writeToStream: function (stream) {
    var commandArgs = this.commandArgs,
        commandName = this.commandName,
        numArgs = commandArgs.length,
        expectedBulks = 1 + numArgs, // +1 for commandName
        useBuffer = this.hasBufferArgs(),
        cmdStr = "*" + expectedBulks + CRLF +    // Bulks to expect
                 "$" + commandName.length + CRLF + // Command Name Bytelength
                 commandName + CRLF,
        stream = this.client.stream,
        i, arg;
    if (useBuffer) {
        this.client.stream.write(cmdStr);
        for (var i = 0; i < numArgs; i++) {
            arg = commandArgs[i] + '';
            if (arg instanceof Buffer) {
                stream.write("$" + arg.length + CRLF);
                stream.write(arg);
                stream.write(CRLF);
            } else {
                stream.write("$" + arg.length + CRLF + arg + CRLF);
            }
        }
    } else {
        for (var i = 0; i < numArgs; i++) {
            arg = commandArgs[i] + '';
            cmdStr += "$" + arg.length + CRLF + arg + CRLF;
        }
        stream.write(cmdStr);
    }
//    delete this.client; // Removes client from command, so command's easier on the eyes when sys inspecting
},

_transactionAckCallback: function (err, reply) {
    var client = this.client;
    if (!err && reply !== "QUEUED") {
        err = this.commandName + " was not queued in the transaction.";
    }
    if (err) { // If there was an error in the syntax of this command
        // Remove the transaction commands still ahead of me:
        for (var i = 0; i < txn.numUnackedCommands; i++); {
            client.commandHistory.shift();
        }
        // Tell the Redis server to cancel the transaction,
        // so it doesn't block other clients' commands
        client.sendCommandInsideTransaction("discard", function (errDiscard, reply) {
            txn.emit("exit");
        });
//                throw err;
    } else {
        txn.numUnackedCommands--;
        if (txn.didRegisterAllCommands && (txn.numUnackedCommands === 0)) {
            txn.appendExec();
        }
    }
}
};
