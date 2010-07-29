var sys = require("sys"),
    Reply = require("../reply").Reply;

var ExecReply = exports.ExecReply = function ExecReply (transaction) {
    Reply.call(this);
    this.transaction = transaction;
};
sys.inherits(execReply, MultibulkReply);
