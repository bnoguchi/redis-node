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

var CR = require("../reply").CR,
    LF = require("../reply").LF,
    InlineReply = require("./inlineReply").InlineReply;


var toSmallString = require("../perf").toSmallString;

var IntegerReply = exports.IntegerReply = function IntegerReply () {
    this.isComplete = false;
    this.replyValue = "";
    this.i = 0;
};

IntegerReply.prototype.parse = function (data, atDataIndex) {
    var dataLen = data.length,
        line = this.replyValue;
    while (atDataIndex < dataLen) {
        if (data[atDataIndex] === CR) {
            if (++atDataIndex < dataLen) {
                atDataIndex++;
                this.isComplete = true;
                break;
            }
        } else if (data[atDataIndex] === LF) {
            atDataIndex++;
            this.isComplete = true;
            break;
        } else {
            line += String.fromCharCode(data[atDataIndex++]);
        }
    }
    if (this.isComplete) this.replyValue = parseInt(line, 10);
    else this.replyValue = line;

//    atDataIndex = InlineReply.prototype.parse.call(this, data, atDataIndex);
//    if (this.isComplete) {
//        this.replyValue = parseInt(this.replyValue, 10);
//    }
    return atDataIndex;
};
