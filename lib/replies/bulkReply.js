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
    CR        = require("../reply").CR, // \r
    IntegerReply = require("./integerReply").IntegerReply;

var BulkReply = exports.BulkReply = function BulkReply (client, isBinaryData) {
    this.client = client;
    this.isBinaryData = isBinaryData; // TODO

    this.isComplete = false;
    this.replyValue = null;
    this.bytesWritten = 0;
};

BulkReply.prototype.parse = function (data, atDataIndex) {
    var dataLen = data.length,
        sliceTo,
        val,
        client = this.client;
    while (atDataIndex < dataLen) {
        if (typeof this.expected === "undefined") {
            atDataIndex = IntegerReply.prototype.parse.call(this, data, atDataIndex);
            if (this.isComplete) {
                this.isComplete = false;
                this.remaining = this.expected = this.replyValue;
                this.replyValue = null;
                if (this.expected <= 0) {
                    this.replyValue = null;
                    this.isComplete = true;
                    break;
                } else {
                    if (client.replyBuffer.length < this.expected) {
                        client.replyBuffer = new Buffer(this.expected);
                    }
                }
            }
            continue;
        }
        sliceTo = atDataIndex + this.remaining;
        // If the data packet won't contain all the expected data
        if (dataLen < sliceTo) {
            sliceTo = dataLen;
            data.copy(client.replyBuffer, this.bytesWritten, atDataIndex, sliceTo);
            numNewBytes = sliceTo - atDataIndex;
            this.bytesWritten += numNewBytes;
            this.remaining -= numNewBytes;
            atDataIndex = sliceTo; // === dataLen
        } else { // Else the data packet contains enough data to complete the reply
            if (this.bytesWritten > 0) {
                data.copy(client.replyBuffer, this.bytesWritten, atDataIndex, sliceTo);
                this.replyValue = this.isBinaryData ? client.replyBuffer.toString("binary", 0, expected) : client.replyBuffer.toString("utf8", 0, expected); // Typecast to utf8
            } else {
                this.replyValue = this.isBinaryData ? data.toString("binary", atDataIndex, sliceTo) : data.toString("utf8", atDataIndex, sliceTo);
            }

            this.isComplete = true;

            // Try advancing beyond CRLF
            if (data[sliceTo] === CR) {
                atDataIndex = sliceTo + 2;
            } else {
                atDataIndex = sliceTo;
            }
            break;
        }
    }
    return atDataIndex;
};
