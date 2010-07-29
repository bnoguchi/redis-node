// TODO Remove this file
var sys = require("sys"),
    Reply = require("../multibulkReply").MultibulkReply;

var ArrayReply = exports.ArrayReply = function ArrayReply (firstLineContent) {
    MultibulkReply.call(this);
};
sys.inherits(ArrayReply, MultibulkReply);

ArrayReply.prototype.parseNextLine = function (data, atDataIndex) {
    if (this.isComplete) return atDataIndex;

    var expected = this.expected,
        childReplies = this.replies,
        replyValue = this.replyValue = this.replyValue || [],
        childReply,
        latestReply = childReplies[childReplies.length-1];
    /* Get the reply to start or continue parsing */
    // If this is our first child reply OR if our most recent child reply is complete
    // Then create a new child reply to parse
    if (!latestReply || latestReply.isComplete) {
        childReply = Reply.fromFirstLine(data, atDataIndex);
        atDataIndex = delete childReply.continueFromIndex;
        if (!(delete childReply.line1Done)) return atDataIndex;

    // Else our most recent child reply is INcomplete
    // Then let's continue to parse the data packet with this child
    } else {
        childReply = latestReply;
    }

    /* Do the reply extraction */
    // If the child reply is already complete, doesn't do anything...yet (see next block)
    atDataIndex = childReply.parseNextLine(data, atDataIndex);

    /* If the child reply's completely extracted, then transform it */
    if (childReply.isComplete) {
        if (this.transaction) {
            commandName = commandFromTxn(this.transaction);
        } else if (this.isMessage() || this.isPMessage()) {
            // Do nothing
        } else {
            replyValue.push(childReply.replyValue);
        }
        if (replyValue.length === expected) {
            this.triggerComplete();
        }
    }
    return atDataIndex;
};
