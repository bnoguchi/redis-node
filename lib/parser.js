var CR        = 0x0D, // \r
    LF        = 0x0A; // \n

var Parser = exports.Parser = function () {
    this.params = {};
    this.extracted = {};

};

Parser.prototype.loadData = function (data, startFrom) {
    this.data = data;
    this._updateAtDataIndex(startFrom || 0);
};

Parser.prototype.isParsed = function () {
    throw new Error("You must define this in a Parser subclass");
};

Parser.prototype.parse = function () {
    throw new Error("You must define this in a Parser subclass");
};

Parser.prototype.reset = function () {
    this.extracted = {};
    this.params = {};
    delete this.data;
    delete this.atDataIndex;
    delete this.isDataExhausted;
};

Parser.prototype._updateAtDataIndex = function (atDataIndex) {
    this.atDataIndex = atDataIndex;
    this.isDataExhausted = (atDataIndex >= this.data.length);
};

