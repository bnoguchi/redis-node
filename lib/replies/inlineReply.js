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
    CR = require("../reply").CR;

var toSmallString = require("../perf").toSmallString;

var InlineReply = exports.InlineReply = function InlineReply (client) {
    this.client = client;

    this.isComplete = false;
    this.replyValue = "";
    this.i = 0;
};

// TODO Extract this algo into its own re-usable function
InlineReply.prototype.parse = function (data, atDataIndex) {
    // TODO Improve by
    // - Count chars to end
    var dataLen = data.length,
        sliceFrom = this.sliceFrom = this.sliceFrom || atDataIndex,
        client = this.client,
        line = this.replyValue, lineLen;

    while (atDataIndex < dataLen) {
        if (data[atDataIndex] === CR) {
            this.isComplete = true;
            atDataIndex += 2;
            if (line === "OK") this.replyValue = true;
            else this.replyValue = line;
            break;
        } else {
            line += String.fromCharCode(data[atDataIndex++]);
        }
    }

//    line = this.line;
//    
//    if (!line) {
//        line = this.line = data.slice(sliceFrom, atDataIndex);
//    } else {
//        lineLen = line.length;
//        var minLen = lineLen + (atDataIndex - sliceFrom);
//        // Resize buffer if necessary
//        if (client.replyBuffer.length < minLen) {
//            client.replyBuffer = new Buffer(minLen);
//        }
//
//        // Speed hack
//        if (lineLen > 10) {
//            line.copy(client.replyBuffer, 0, 0);
//        } else {
//            for (var i = lineLen-1; i >= 0; i--) {
//                client.replyBuffer[i] = line[i];
//            }
//        }
//
//        // Speed hack
//        if (atDataIndex - sliceFrom > 10) {
//            data.copy(client.replyBuffer, lineLen, sliceFrom, atDataIndex);
//        } else {
//            for (var i = sliceFrom; i < atDataIndex; i++) {
//                client.replyBuffer[i] = data[i];
//            }
//        }
//        line = this.line = client.replyBuffer.slice(0, minLen);
//    }
//    if (this.isComplete) {
//        lineLen = line.length;
//        if (lineLen > 15) {
//            this.replyValue = line.toString("ascii", 0, lineLen);
//        } else {
//            this.replyValue = toSmallString(line);
//        }
//        if (this.replyValue === "OK") this.replyValue = true;
//
//        delete this.line;
//        atDataIndex += 2; // Move beyond the CRLF
//    }
//    delete this.sliceFrom;
    return atDataIndex;
};
