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
    delete this.continueFromDataIndex; // TODO Keep this?
};

/**
 * Checks for the existence of CR and LF in the data packet, both of which
 * may not exist in this data packet if it was truncated by the
 * server early and is sending the rest in a subsequent data packet.
 * If it finds CR, it updates this.didSeeCR to true.
 * If it find LF, it updates this.didSeeLF to true.
 * atDataIndex may have advanced during this phase, so we return it
 * back to the caller.
 */
Parser.prototype.checkForCRLF = function () {
    var data = this.data,
        params = this.params,
        atDataIndex = this.atDataIndex,
        dataLen = data.length;
    if (data[atDataIndex] === CR) {
        params.didSeeCR = true;
        atDataIndex++;
    }

    if (atDataIndex < dataLen && data[atDataIndex] === LF) {
        params.didSeeCR = true; // Added
        params.didSeeLF = true;
        atDataIndex++; // Move pointer to the beginning of next line
                       // (which may or may not be out of bounds)
    }
    this._updateAtDataIndex(atDataIndex);
};

Parser.prototype._updateAtDataIndex = function (atDataIndex) {
    this.atDataIndex = atDataIndex;
    this.isDataExhausted = (atDataIndex >= this.data.length);
};

