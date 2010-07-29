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
    EventEmitter = require("events").EventEmitter,
    Reply = require("./reply").Reply;

var ReplyStream = exports.ReplyStream = function ReplyStream (dataStream, client) {
    var replyStream = this;

    this.client = client;

    // Need this as a closure because
    //   dataStream.on("data", this.handleData)
    // invokes it in the global scope.
    this.handleData = function (data) {
        // A partial reply has to outlive data, so it can parse the next incoming data
        var atDataIndex = 0,
            dataLen = data.length,
            currReply = replyStream.currReply;

        if (!currReply || !currReply.line1Done) {
            currReply = replyStream.currReply = Reply.fromFirstLine(data, atDataIndex, replyStream.client);
//            if (currReply.isDataExhausted) return; // === !currReply.line1Done
        } else {
            currReply.loadData(data, atDataIndex);
        }
        // Anything after this is a currReply that already has 
        // the leading line loaded and replyType determined

        if (currReply.isDataExhausted && currReply.isComplete) {
            replyStream.emit("reply", currReply);
            delete replyStream.currReply;
            return;
        }
        while (!currReply.isDataExhausted) {
//            sys.log("CCC");
            if (!currReply.isComplete) { // === !currReply.isParsed()
                currReply.parse();
            }
            if (currReply.isComplete) {
                replyStream.emit("reply", currReply); // Fire callbacks
                if (currReply.isDataExhausted) {
                    delete replyStream.currReply; // Cleanup; otherwise currReply never changes
                    return;
                }
                atDataIndex = currReply.atDataIndex;
                delete replyStream.currReply; // Cleanup; otherwise currReply never changes
                // Onto the next reply if we still have data to parse
                currReply = replyStream.currReply = Reply.fromFirstLine(data, atDataIndex, replyStream.client);
            }
        }

        // Just in case the last currReply was something like an integer reply
        if (currReply.isDataExhausted && currReply.isComplete) {
            replyStream.emit("reply", currReply);
            delete replyStream.currReply;
        }
    };

    if (dataStream) dataStream.on("data", this.handleData);
};
sys.inherits(ReplyStream, EventEmitter);
