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
    Buffer = require("buffer").Buffer,
    commandConfig = require("./commandConfig"),

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
    MULTIBULK = exports.MULTIBULK = "MULTIBULK";

var Reply = exports.Reply = function Reply (commandHistory, possibleCommandIndex) {
    this.reset();
    this.commandHistory = commandHistory;
    this.possibleCommandIndex = possibleCommandIndex || 0;
};

Reply.prototype = {
reset: function () {
    delete this.replyType;
    this.replyValue = null;

    delete this.firstLine;
    this.didInterpretFirstLine = false;
    this.resetLine();

    this.params = {};

    this.isComplete = false;

    delete this.channelName;
    delete this.message;
    delete this.channelPattern;
    delete this.isMessage; // Erase caches
    delete this.isPMessage; // Erase caches
},

resetLine: function () {
    this.didSeeCR = false;
    this.didSeeLF = false;
},

// TODO Create a Line class?
parseNextLine: function (data, atDataIndex) {
    if (!this.didInterpretFirstLine) {
        atDataIndex = this.extractFirstLine(data, atDataIndex);
        if (this.didSeeCR && this.didSeeLF) {
            // Interpretation of the first line only depends on the replyType
            this["interpret" + this.replyType + "firstLine"](this.firstLine);
            this.didInterpretFirstLine = true;
            this.resetLine();
        }
    } else { // We're on subsequent lines following a first line, so interpret data differently
        atDataIndex = this.interpretSubsequentLines(data, atDataIndex);
    }
    return atDataIndex;
},

triggerComplete: function () {
    this.isComplete = true;
    this.typecastByReplyType();
    if (this.isMessage() || this.isPMessage()) return;
},

/**
 * By calling 1 or more consecutive times, eventually this parses a whole FIRST
 * line to extract
 * -this.replyType
 * -this.firstLine
 * @returns atDataIndex, the index in the data buffer at which to begin parsing next.
 */
extractFirstLine: function (data, atDataIndex) {
    var sliceFrom, dataLen, lineBuffer;
    /* Begin or continue to parse out the first line */

    // Hack -- remove this?
    while (!this.replyType) {
        this.replyType = this.DATA_TO_TYPE[data[atDataIndex++]];
    }

    if (!this.didSeeCR) {
        sliceFrom = atDataIndex;
        dataLen = data.length;
        while (atDataIndex < dataLen && data[atDataIndex] !== CR) atDataIndex++;
        // Either we're at the beginning of a new line
        if (!this.firstLine) {
            lineBuffer = this.firstLine = data.slice(sliceFrom, atDataIndex);

        // Or we're continuing from an incomplete line
        } else {
            lineBuffer = new Buffer(this.firstLine.length + (atDataIndex - sliceFrom));
            this.firstLine.copy(lineBuffer, 0, 0);
            data.copy(lineBuffer, this.firstLine.length, sliceFrom, atDataIndex);
            this.firstLine = lineBuffer;
        }
        // At the end of this block, we may still an incomplete line (i.e., not even seen CR)
    }

    atDataIndex = this.checkForCRLF(data, atDataIndex);

    return atDataIndex;
},
interpretINLINEfirstLine: function (content) {
    this.replyValue = content;
    this.triggerComplete();
},
interpretERRORfirstLine: function (content) {
    this.replyValue = content;
    this.triggerComplete();
},
interpretINTEGERfirstLine: function (content) {
    this.replyValue = parseInt(content, 10);
    this.triggerComplete();
},
interpretBULKfirstLine: function (content, data, atDataIndex) {
    // Save so we can reference this number in the next line
    var expected = this.params.bulkLengthExpected = parseInt(content, 10);
    if (expected <= 0) {
        this.replyValue = null;
        this.triggerComplete();
    }
},

// Implementation notes: Subsequent lines will depend on this.possibleCommand
interpretSubsequentLines: function (data, atDataIndex) {
    return this["interpret" + this.replyType + "subsequentLine"](data, atDataIndex);
},
interpretBULKsubsequentLine: function (data, atDataIndex) {
    var expected = this.params.bulkLengthExpected,
        sliceTo;

    // If the data packet won't contain all the expected data
    if (data.length < atDataIndex + expected) {
        sliceTo = data.length;
        if (!this.replyValue) {
            this.params.bytesWritten = 0;
            this.replyValue = new Buffer(expected);
            data.copy(this.replyValue, 0, atDataIndex, sliceTo);
        } else { // If we're continuing a replyValue that was only partially
                               // written by a prior data FRAGMENT
            data.copy(this.replyValue, this.params.bytesWritten, atDataIndex, sliceTo);
        }
        this.params.bytesWritten += (sliceTo - atDataIndex);
        this.params.bulkLengthExpected = atDataIndex + expected - data.length;
        return sliceTo;
    } else {
        sliceTo = atDataIndex + expected;
        if (this.replyValue) {
            data.copy(this.replyValue, this.params.bytesWritten, atDataIndex, sliceTo);
            // this.params.bytesWritten += (sliceTo - atDataIndex);
        } else {
            this.replyValue = data.slice(atDataIndex, sliceTo);
        }
        this.triggerComplete(); // Converts replyValue to UTF8
        atDataIndex = this.checkForCRLF(data, sliceTo);
        this.resetLine();
        return atDataIndex;
    }
},

interpretMULTIBULKfirstLine: function (content) {
    var expected = this.params.multibulkRepliesExpected = parseInt(content, 10);
    this.params.replies = [];
    if (expected <= 0) {
      this.replyValue = null;
      this.triggerComplete();
    }
},
// Multibulks can be found with:
// -Transactions => return an array of replies
// -Sort => return an array where elements are hashes or values
// -Hgetall => return a hash
// -Mget => return an array
// -Others => return an array of values
// Most extreme case is a transaction of sorts
interpretMULTIBULKsubsequentLine: function (data, atDataIndex) {
    var expected = this.params.multibulkRepliesExpected,
        childReplies = this.params.replies,
        replyValue = this.replyValue = this.replyValue || this.initializeReplyValue(),
        childReplyForParse,
        latestReply = childReplies[childReplies.length-1];

    if (!replyValue) this.initializeReplyValue(); // Either an array or hash

    /* Get the reply to start or continue parsing */
    // If this is our first child reply OR if our most recent child reply is complete
    // Then create a new child reply to parse
    if (!latestReply || latestReply.isComplete) {
        childReplyForParse = new Reply(this.commandHistory, ++this.possibleCommandIndex);

    // Else our most recent child reply is INcomplete
    // Then let's continue to parse the data packet with this child
    } else {
        childReplyForParse = latestReply;
    }

    /* Do the reply extraction */
    atDataIndex = childReplyForParse.parseNextLine(data, atDataIndex);

    /* If the child reply's completely extracted, then transform it */
    if (childReplyForParse.isComplete) {
        // Convert child reply to insertable value
        var valToInsert = childReplyForParse.valueForCommandCallback();
        if (this.transaction) {
            commandName = commandFromTxn(this.transaction);
        } else if (this.isMessage() || this.isPMessage()) {
            // Do nothing
        } else {
        }
        // Decide how to insert the child: into a hash or an array
        this.insertChild(childReplyForParse);
        replyValue.push(valToPush);
        if (replyValue.length === expected) {
            this.triggerComplete();
        }
    }
    return atDataIndex;
},
valueForCommandCallback: function () {

},

/**
 * Checks for the existence of CR and LF in the data packet, both of which
 * may not exist in this data packet if it was truncated by the
 * server early and is sending the rest in a subsequent data packet.
 * If it finds CR, it updates this.didSeeCR to true.
 * If it find LF, it updates this.didSeeLF to true.
 * atDataIndex may have advanced during this phase, so we return it
 * back to the caller.
 */
checkForCRLF: function (data, atDataIndex) {
    var dataLen = data.length;
    if (data[atDataIndex] === CR) {
        this.didSeeCR = true;
        atDataIndex++;
    }

    if (this.didSeeCR) {
        if (atDataIndex < dataLen && data[atDataIndex] === LF) {
            this.didSeeLF = true;
            atDataIndex++; // Move pointer to the beginning of next line
                           // (which may or may not be out of bounds)
        }
    }
    return atDataIndex;
},

isMessage: function () {
    var replyValue = this.replyValue,
        _isMessage = (this.replyType === MULTIBULK && replyValue !== null && replyValue instanceof Array &&
            replyValue.length === 3 &&
            replyValue[0].length === 7 &&
            replyValue[0] === "message"
        );

    if (_isMessage) {
        // Set new convenience properties on this for PubSub
        this.channelName = replyValue[1];
        this.message = replyValue[2];
    }

    // Cache the calculation
    this.isMessage = function () {
        return _isMessage; // Cached at the object (not the prototype) level
    }
    return this.isMessage();
},

isPMessage: function () {
    var replyValue = this.replyValue,
        _isPMessage = (this.replyType === MULTIBULK && replyValue !== null && replyValue instanceof Array &&
            replyValue.length === 4 && 
            replyValue[0].length === 8 && 
            replyValue[0] === "pmessage"
        );

    if (_isPMessage) {
        // Set new convenience properties on this for PubSub
        this.channelName = replyValue[1];
        this.channelPattern = replyValue[2];
        this.message = replyValue[3];
    }

    // Cache the calculation
    this.isPMessage = function () {
        return _isPMessage; // Cached at the object (not the prototype) level
    }
    return this.isPMessage();
},

//isMessage: function () {
//    var replyValue = this.replyValue,
//        _isMessage = (this.replyType === MULTIBULK && replyValue !== null && replyValue instanceof Array &&
//            replyValue.length === 3 &&
//            replyValue[0].replyValue.length === 7 &&
//            replyValue[0].replyValue === "message"
////            replyValue[0].replyValue.asciiSlice(0,7) === "message"
//        );
//
//    if (_isMessage) {
//        // Set new convenience properties on this for PubSub
//        this.channelName = this.replyValue[1].replyValue;
//        this.message = this.replyValue[2].replyValue;
//    }
//
//    // Cache the calculation
//    this.isMessage = function () {
//        return _isMessage; // Cached at the object (not the prototype) level
//    }
//    return this.isMessage();
//},
//

//isPMessage: function () {
//    var replyValue = this.replyValue,
//        _isPMessage = (this.replyType === MULTIBULK && replyValue !== null && replyValue instanceof Array &&
//            replyValue.length === 4 && 
//            replyValue[0].replyValue.length === 8 && 
//            replyValue[0].replyValue === "pmessage"
////            replyValue[0].replyValue.asciiSlice(0,8) === "pmessage"
//        );
//
//    if (_isPMessage) {
//        // Set new convenience properties on this for PubSub
//        this.channelName = reply.replyValue[1].replyValue;
//        this.channelPattern = reply.replyValue[2].replyValue;
//        this.message = reply.replyValue[3].replyValue;
//    }
//
//    // Cache the calculation
//    this.isPMessage = function () {
//        return _isPMessage; // Cached at the object (not the prototype) level
//    }
//    return this.isPMessage();
//},

// TODO Refactor this
/**
 * Alters this.replyValue based on this.replyType.
 * We want:
 * -ERROR as utf8.
 * -INLINE as ascii
 * -BULK as utf8
 * -MULTIBULK we leave alone as an Array
 */
typecastByReplyType: function () {
    var replyValue = this.replyValue,
        replyType = this.replyType,
        typecastValue;

    if (replyValue === null) {
        typecastValue = null;
    } else if (replyType === ERROR) {
        typecastValue = replyValue.utf8Slice(0, replyValue.length);
    } else if (replyType === INLINE) {
        typecastValue = replyValue.asciiSlice(0, replyValue.length);
        if (typecastValue === "OK") typecastValue = true;
    } else if (replyType === BULK) {
        typecastValue = replyValue.utf8Slice(0, replyValue.length);
//    } else if (replyType === MULTIBULK) {
//        typecastValue = this.params.replies.map( function (reply) {
//            return reply.typecastByReplyType();
//        });
////        typecastValue = convertMultiBulkBuffersToUTF8Strings(typecastValue);
    }
    if (typecastValue) this.replyValue = typecastValue;

    return this;
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

//var convertMultiBulkBuffersToUTF8Strings = function (o) {
//    if (o instanceof Array) {
//        for (var i=0; i<o.length; ++i) 
//            if (o[i].replyValue instanceof Buffer) 
//                o[i].replyValue = o[i].replyValue.utf8Slice(0, o[i].replyValue.length);
//    } else if (o instanceof Object) {
//        var props = Object.getOwnPropertyNames(o);
//        for (var i=0; i<props.length; ++i) 
//            if (o[props[i]] instanceof Buffer) 
//                o[props[i]] = o[props[i]].utf8Slice(0, o[props[i]].length);
//    }
//};
