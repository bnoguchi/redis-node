var sys = require("sys"),
    Reply = require("../reply").Reply;

var IntegerReply = exports.IntegerReply = function IntegerReply (firstLineContent) {
    Reply.call(this);
    this.replyValue = parseInt(firstLineContent.asciiSlice(0, firstLineContent.length), 10);
    this.triggerComplete();
};
sys.inherits(IntegerReply, Reply);
