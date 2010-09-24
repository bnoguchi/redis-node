// TODO Remove

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
    this.client = client;
    if (dataStream) dataStream.on("data", this.handleData.bind(this));
};
sys.inherits(ReplyStream, EventEmitter);

ReplyStream.prototype.handleData = function (data) {
    // A partial reply has to outlive data, so it can parse the next incoming data
    var atDataIndex = 0,
        dataLen = data.length,
        currReply = this.currReply;

    while (atDataIndex < dataLen) {
        currReply = this.currReply;
        if (!currReply) {
            var typeCode = data[atDataIndex++];
            currReply = this.currReply = Reply.fromTypeCode(typeCode, this.client);
            continue;
        }
        atDataIndex = currReply.parse(data, atDataIndex);
        if (currReply.isComplete) {
            this.emit("reply", currReply);
            this.currReply = null;
        }
    }
};
