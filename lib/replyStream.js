var sys = require("sys"),
    EventEmitter = require("events").EventEmitter,
    Reply = require("./reply").Reply;

var ReplyStream = exports.ReplyStream = function ReplyStream (dataStream, client) {
    var currReply,
        replyStream = this;

    // Need this as a closure because it's called in the global scope
    // with dataStream.on("data", this.handleData)
    this.handleData = function (data) {
        if (!currReply) currReply = new Reply(commandHistory);

        // A partial reply has to outlive data, so it can parse the next incoming data
        var atDataIndex = 0,
            dataLen = data.length;
        while (atDataIndex < dataLen) {
            atDataIndex = currReply.parseNextLine(data, atDataIndex);
            if (currReply.isComplete) {
                currReply.command = null;
                replyStream.emit("reply", currReply);
//                replyStream.emit("reply", currReply.typecastByReplyType()); // TODO This may be the problem and shared state with currReply
                currReply = new Reply(); // TODO Need to add possibleCommand here
            }
        }
    };

    if (dataStream) {
        dataStream.on("data", this.handleData);
    }
};
sys.inherits(ReplyStream, EventEmitter);
