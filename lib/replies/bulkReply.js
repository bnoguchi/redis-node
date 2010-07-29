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
    Buffer = require("buffer").Buffer;

var BulkReply = exports.BulkReply = function BulkReply (firstLineContent) {
    Reply.call(this);
    var expected = // The bulk byte length that's expected
        this.expected = parseInt(firstLineContent.utf8Slice(0, firstLineContent.length), 10);
    if (expected <= 0) {
        this.replyValue = null;
        this.triggerComplete();
    }
};
sys.inherits(BulkReply, Reply);

BulkReply.prototype.reset = function () {
    Reply.prototype.reset.call(this);
    delete this.expected;
    this.bytesWritten = 0;
};

BulkReply.prototype.parse = function () {
    var data = this.data,
        atDataIndex = this.atDataIndex;

    if (this.isComplete) return;

    var expected = this.expected,
        sliceTo;

    // If the data packet won't contain all the expected data
    if (data.length < atDataIndex + expected) {
        sliceTo = data.length;
        if (!this.replyValue) {
            this.bytesWritten = 0;
            this.replyValue = new Buffer(expected);
        }
        data.copy(this.replyValue, this.bytesWritten, atDataIndex, sliceTo);
        this.bytesWritten += (sliceTo - atDataIndex);
        this.expected = expected - (data.length - atDataIndex);
        this._updateAtDataIndex(sliceTo);
    } else {
        sliceTo = atDataIndex + expected;
        if (this.replyValue) {
            data.copy(this.replyValue, this.bytesWritten, atDataIndex, sliceTo);
        } else {
//            sys.log(sys.inspect(atDataIndex) + " & " + sys.inspect(sliceTo));
//            if (typeof(sliceTo) === "NaN") sys.log(sys.inspect(this));
            this.replyValue = data.slice(atDataIndex, sliceTo);
        }

        if (this.replyValue.length < 1000) { // TODO Remove this hack; this is what makes image storing work
            this.replyValue = this.replyValue.toString('utf8'); // Typecast to utf8
        }

        this.triggerComplete(); // Converts replyValue to UTF8
        this._updateAtDataIndex(sliceTo);
        this.checkForCRLF();
    }
};
