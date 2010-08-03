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
    Reply = require("../reply").Reply,
    Buffer = require("buffer").Buffer,
    CR        = 0x0D; // \r

var BulkReply = exports.BulkReply = function BulkReply (firstLineContent) {
    Reply.call(this);
    var expected = // The bulk byte length that's expected
        this.expected = parseInt(firstLineContent.asciiSlice(0, firstLineContent.length), 10);
    if (expected <= 0) {
        this.replyValue = null;
        this.triggerComplete();
    }
};
sys.inherits(BulkReply, Reply);

BulkReply.prototype.reset = function () {
    Reply.prototype.reset.call(this);
    delete this.expected;
    delete this.remaining;
    this.bytesWritten = 0;
};

BulkReply.prototype.valueBuffer = new Buffer(512);

BulkReply.prototype.parse = function () {
    if (this.isComplete) return;

    var data = this.data,
        atDataIndex = this.atDataIndex,
        expected = this.expected,
        remaining = this.remaining = this.remaining || expected,
        sliceTo,
        numNewBytes,
        valueBuffer = this.valueBuffer;
    // Resize if necessary
    if (valueBuffer.length < expected) {
        valueBuffer = BulkReply.prototype.valueBuffer = new Buffer(expected);
    }

    // If the data packet won't contain all the expected data
    sliceTo = atDataIndex + remaining
    if (data.length < sliceTo) {
        sliceTo = data.length;
        data.copy(valueBuffer, this.bytesWritten, atDataIndex, sliceTo);
        numNewBytes = sliceTo - atDataIndex;
        this.bytesWritten += numNewBytes;
        this.remaining -= numNewBytes;
        this.atDataIndex = sliceTo;
        this.isDataExhausted = (sliceTo >= data.length);
//        this._updateAtDataIndex(sliceTo); Removed

    // Else the data packet contains enough data to complete the reply
    } else {
        if (this.bytesWritten > 0) {
            data.copy(valueBuffer, this.bytesWritten, atDataIndex, sliceTo);
            this.replyValue = valueBuffer.utf8Slice(0, expected); // Typecast to utf8
        } else {
            this.replyValue = data.utf8Slice(atDataIndex, sliceTo);
        }

//        if (this.replyValue.length < 1000) { // TODO Remove this hack; this is what makes image storing work
//            this.replyValue = valueBuffer.utf8Slice(0, expected); // Typecast to utf8
//        }

        this.triggerComplete(); // Converts replyValue to UTF8

        // Try advancing beyond CRLF
        var dataLen = data.length;
        if (data[sliceTo] === CR) {
            this.params.didSeeCR = true;
            sliceTo += 2;
            if (sliceTo > dataLen) sliceTo = dataLen;
        }

        this.atDataIndex = sliceTo;
        this.isDataExhausted = (sliceTo >= dataLen);
//        this._updateAtDataIndex(sliceTo);
    }
};
