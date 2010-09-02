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
    Parser = require("./parser").Parser,
    Buffer = require("buffer").Buffer,

    PLUS      = 0x2B, // +
    MINUS     = 0x2D, // -
    DOLLAR    = 0x24, // $
    STAR      = 0x2A, // *
    COLON     = 0x3A, // :

    CR        = 0x0D, // \r
    LF        = 0x0A, // \n

    ERROR     = require("./reply").ERROR,
    INLINE    = require("./reply").INLINE,
    INTEGER   = require("./reply").INTEGER,
    BULK      = require("./reply").BULK,
    MULTIBULK = require("./reply").MULTIBULK;

var FirstLine = exports.FirstLine = function () {
    Parser.call(this);
};

sys.inherits(FirstLine, Parser);

(function (FirstLine) {
  var data2type = {};
  data2type[MINUS] = ERROR;
  data2type[PLUS] = INLINE;
  data2type[COLON] = INTEGER;
  data2type[DOLLAR] = BULK;
  data2type[STAR] = MULTIBULK;
  FirstLine.prototype.DATA_TO_TYPE = data2type;
})(FirstLine);

// Shared buffer because "new Buffer" is expensive
FirstLine.prototype.lineBuffer = new Buffer(512);

FirstLine.prototype.parse = function () {
    var data = this.data,
        atDataIndex = this.atDataIndex,
        extracted = this.extracted,
        params = this.params,
        sliceFrom,
        dataLen,
        lineBuffer;
    /* Begin or continue to parse out the first line */

    // Hack -- remove this?
    // Remove leading \r and \n, if any
    while (!extracted.replyType) {
        extracted.replyType = this.DATA_TO_TYPE[data[atDataIndex++]];
    }

    if (!params.didSeeCR) {
        sliceFrom = atDataIndex;
        dataLen = data.length;
        while (atDataIndex < dataLen && data[atDataIndex] !== CR) atDataIndex++;

        // Either we're at the beginning of a new line
        if (!extracted.line) {
            extracted.line = data.slice(sliceFrom, atDataIndex);

        // Or we're continuing from an incomplete line
        } else {
            var extractedLen = extracted.line.length,
                minLen = extractedLen + (atDataIndex - sliceFrom),
                lineBuffer = this.lineBuffer;
            if (lineBuffer.length < minLen) {
                lineBuffer = FirstLine.prototype.lineBuffer = new Buffer(minLen);
            }
            extracted.line.copy(lineBuffer, 0, 0);
            data.copy(lineBuffer, extractedLen, sliceFrom, atDataIndex);
            extracted.line = lineBuffer.slice(0, minLen);
        }
        // At the end of this block, we may still be an incomplete line (i.e., not even seen CR)
    }

    // Try advancing beyond CRLF
    if (data[atDataIndex] === CR) {
        params.didSeeCR = true;
        atDataIndex += 2;
        if (atDataIndex > dataLen) atDataIndex = dataLen;
    }
    this.atDataIndex = atDataIndex;
    this.isDataExhausted = (atDataIndex >= data.length);
};
