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

var BulkReply = exports.BulkReply = function BulkReply (client, context) {
    this.client = client;
    this.isBinaryData = context && context.isBinaryData; // TODO

    this.isComplete = false;
    this.replyValue = null;
    this.bytesWritten = 0;
    this.expectedProxy = {replyValue: "", i: 0, isComplete: false};
};

BulkReply.prototype.parse = function (data, atDataIndex) {
    var dataLen = data.length,
        sliceTo,
        val,
        client = this.client,
        expected,
        expectedProxy;
    while (atDataIndex < dataLen) {
        if (typeof this.expected === "undefined") {
            expectedProxy = this.expectedProxy;
            atDataIndex = IntegerReply.prototype.parse.call(expectedProxy, data, atDataIndex);
            if (expectedProxy.isComplete) {
                this.remaining = this.expected = expectedProxy.replyValue;
                if (this.expected <= 0) {
                    this.replyValue = null;
                    this.isComplete = true;
                    break;
                }
                // Resize if necessary
                if (client.replyBuffer.length < this.expected) {
                    client.replyBuffer = new Buffer(this.expected);
                }
            }
            continue;
        }
        expected = this.expected;
        sliceTo = atDataIndex + this.remaining;
        // If the data packet won't contain all the expected data
        if (dataLen < sliceTo) {
            sliceTo = dataLen;
            numNewBytes = sliceTo - atDataIndex;
            if (numNewBytes > 12) {
                data.copy(client.replyBuffer, this.bytesWritten, atDataIndex, sliceTo);
                this.bytesWritten += numNewBytes;
            } else {
                for (var j = atDataIndex; j < sliceTo; j++) {
                    client.replyBuffer[this.bytesWritten++] = data[j];
                }
            }
            this.remaining -= numNewBytes;
            atDataIndex = sliceTo; // === dataLen
        } else { // Else the data packet contains enough data to complete the reply
            if (this.bytesWritten > 0) {
                numNewBytes = sliceTo - atDataIndex;
                if (numNewBytes > 12) {
                    data.copy(client.replyBuffer, this.bytesWritten, atDataIndex, sliceTo);
                    this.bytesWritten += numNewBytes;
                } else {
                    for (var j = atDataIndex; j < sliceTo; j++) {
                        client.replyBuffer[this.bytesWritten++] = data[j];
                    }
                }
                this.replyValue = client.replyBuffer.toString(this.encoding || "utf8", 0, expected); // Default typecast to utf8
            } else {
                this.replyValue = data.toString(this.encoding || "utf8", atDataIndex, sliceTo);
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
