var sys = require("sys"),
    Reply = require("../reply").Reply;

var InlineReply = exports.InlineReply = function InlineReply (firstLineContent) {
    Reply.call(this);
    this.replyValue = firstLineContent.asciiSlice(0, firstLineContent.length);
    if (this.replyValue === "OK") this.replyValue = true;
    this.triggerComplete();
};
sys.inherits(InlineReply, Reply);
