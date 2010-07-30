var sys = require("sys");
var Buffer = require("buffer").Buffer,
    CR        = 0x0D, // \r
    LF        = 0x0A, // \n
    CRLF      = "\r\n";


var Command = exports.Command = function (commandAsArray) {
    this.commandName = commandAsArray.shift().toLowerCase();
    this.commandArgs = commandAsArray;
    if (typeof commandAsArray[commandAsArray.length-1] === "function") {
        this.commandCallback = commandAsArray.pop();
    }
};

Command.prototype = {
requestBuffer: new Buffer(512),
addCallbackIfMissing: function (commandAsArray) {
    if (!this.commandCallback) {
        this.commandCallback = function (err, reply) {
            if (err) sys.log(err);
        };
    }
},

toBuffer: function () {
    var commandArgs = this.commandArgs,
        commandName = this.commandName,
        numArgs = commandArgs.length,
        expectedBulks = 1 + numArgs, // +1 for commandName
        offset = Command.prototype.requestBuffer.utf8Write(
            "*" + expectedBulks + CRLF +    // Bulks to expect
            "$" + commandName.length + CRLF + // Command Name Bytelength
            commandName + CRLF,
        0),
        i, arg;
    for (i = 0; i < numArgs; i++) {
        offset = this._writeArgToRequestBuffer(commandArgs[i], offset);
    }
    return this.requestBuffer.slice(0, offset);
},

_writeArgToRequestBuffer: function (arg, currOffset) {
    var argAsString, argSerialized, extrasLength;
    if (arg instanceof Buffer) {
        extrasLength = 5; // For "$", "\r\n", "\r\n"
        this._maybeResizeRequestBuffer(arg.length.toString().length + arg.length + extrasLength, currOffset);
        currOffset += Command.prototype.requestBuffer.asciiWrite("$" + arg.length + CRLF, currOffset);
        currOffset += arg.copy(Command.prototype.requestBuffer, currOffset, 0);
        currOffset += Command.prototype.requestBuffer.asciiWrite(CRLF, currOffset);
    } else if (arg.toString) {
        argAsString = arg.toString();
        argSerialized = 
            "$" + Buffer.byteLength(argAsString, "binary") + CRLF +
            argAsString + CRLF;
        this._maybeResizeRequestBuffer(Buffer.byteLength(argSerialized, "binary"), currOffset);
        currOffset += Command.prototype.requestBuffer.binaryWrite(argSerialized, currOffset);
    }
    return currOffset;
},
_maybeResizeRequestBuffer: function (atLeast, offset) {
    var currLength = this.requestBuffer.length,
        bufferLen,
        newBuffer;

    if (offset + atLeast > currLength) {
        bufferLen = Math.max(currLength * 2, atLeast * 1.1);
        newBuffer = new Buffer(Math.round(bufferLen));
        this.requestBuffer.copy(newBuffer, 0, 0, offset);
        Command.prototype.requestBuffer = newBuffer;
    }
}
};
