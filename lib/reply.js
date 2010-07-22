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

var Reply = exports.Reply = function Reply () {
//    this.replyValue = undefined;
//    this.replyType = undefined;
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
    var expected = this.params.multibulkRepliesExpected = parseInt(content, 10);
    this.params.replies = [];
    if (expected === 0) {
      this.replyValue = null;
      this.isComplete = true;
    }
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
        this.replyValue = childReplies;
//        this.replyValue = "replaceMeWithNormalized";
    }
    
    return atDataIndex;
},

reset: function () {
    delete this.replyType;
    delete this.replyValue;
    this.params = {};
    this.isComplete = false;
    delete this.channelName;
    delete this.message;
    delete this.channelPattern;
    delete this.isMessage; // Erase caches
    delete this.isPMessage; // Erase caches
},

isMessage: function () {
    var replyValue = this.replyValue,
        _isMessage = (this.replyType === MULTIBULK && replyValue !== null && replyValue instanceof Array &&
            replyValue.length === 3 &&
            replyValue[0].replyValue.length === 7 &&
            replyValue[0].replyValue === "message"
//            replyValue[0].replyValue.asciiSlice(0,7) === "message"
        );

    if (_isMessage) {
        // Set new convenience properties on this for PubSub
        this.channelName = this.replyValue[1].replyValue;
        this.message = this.replyValue[2].replyValue;
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
            replyValue[0].replyValue.length === 8 && 
            replyValue[0].replyValue === "pmessage"
//            replyValue[0].replyValue.asciiSlice(0,8) === "pmessage"
        );

    if (_isPMessage) {
        // Set new convenience properties on this for PubSub
        this.channelName = reply.replyValue[1].replyValue;
        this.channelPattern = reply.replyValue[2].replyValue;
        this.message = reply.replyValue[3].replyValue;
    }

    // Cache the calculation
    this.isPMessage = function () {
        return _isPMessage; // Cached at the object (not the prototype) level
    }
    return this.isPMessage();
},

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
    } else if (replyType === MULTIBULK) {
        typecastValue = this.params.replies.map( function (reply) {
            return reply.typecastByReplyType();
        });
        typecastValue = convertMultiBulkBuffersToUTF8Strings(typecastValue);
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

var convertMultiBulkBuffersToUTF8Strings = function (o) {
    if (o instanceof Array) {
        for (var i=0; i<o.length; ++i) 
            if (o[i].replyValue instanceof Buffer) 
                o[i].replyValue = o[i].replyValue.utf8Slice(0, o[i].replyValue.length);
    } else if (o instanceof Object) {
        var props = Object.getOwnPropertyNames(o);
        for (var i=0; i<props.length; ++i) 
            if (o[props[i]] instanceof Buffer) 
                o[props[i]] = o[props[i]].utf8Slice(0, o[props[i]].length);
    }
};
