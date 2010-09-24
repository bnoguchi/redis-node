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
    CR = require("../reply").CR,
    InlineReply = require("./inlineReply").InlineReply;

var toSmallString = require("../perf").toSmallString;

var ErrorReply = exports.ErrorReply = function ErrorReply (client) {
    this.client = client;

    this.isComplete = false;
    this.replyValue = null;
};

ErrorReply.prototype.parse = function (data, atDataIndex) {
    var dataLen = data.length,
        sliceFrom = this.sliceFrom = this.sliceFrom || atDataIndex,
        val,
        client = this.client;
    while (atDataIndex < dataLen) {
        if (data[atDataIndex] === CR) {
            this.isComplete = true;
            break;
        } else {
            atDataIndex++;
        }
    }
    if (!this.line) {
        this.line = data.slice(sliceFrom, atDataIndex);
    } else {
        var minLen = this.line.length + (atDataIndex - sliceFrom);
        // Resize buffer if necessary
        if (client.replyBuffer.length < minLen) {
            client.replyBuffer = new Buffer(minLen);
        }
        this.line.copy(client.replyBuffer, 0, 0);
        data.copy(client.replyBuffer, this.line.length, sliceFrom, atDataIndex);
        this.replyValue = client.replyBuffer.slice(0, minLen);
    }
    if (this.isComplete) {
        this.replyValue = this.line;
        if (this.line.length > 10) {
            this.replyValue = this.line.toString("utf8", 0, this.line.length);
        } else {
            this.replyValue = toSmallString(this.line);
        }
    }
    return atDataIndex;
};
