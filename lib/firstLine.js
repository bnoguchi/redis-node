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

    ERROR     = exports.ERROR = "ERROR",
    INLINE    = exports.INLINE = "INLINE",
    INTEGER   = exports.INTEGER = "INTEGER",
    BULK      = exports.BULK = "BULK",
    MULTIBULK = exports.MULTIBULK = "MULTIBULK";

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
            lineBuffer = extracted.line = data.slice(sliceFrom, atDataIndex);

        // Or we're continuing from an incomplete line
        } else {
            lineBuffer = new Buffer(extracted.line.length + (atDataIndex - sliceFrom));
            extracted.line.copy(lineBuffer, 0, 0);
            data.copy(lineBuffer, extracted.line.length, sliceFrom, atDataIndex);
            extracted.line = lineBuffer;
        }
        // At the end of this block, we may still an incomplete line (i.e., not even seen CR)
    }

    this._updateAtDataIndex(atDataIndex);
    this.checkForCRLF();
};

FirstLine.prototype.isParsed = function () {
    var params = this.params;
    return !!params.didSeeCR && !!params.didSeeLF;
};
