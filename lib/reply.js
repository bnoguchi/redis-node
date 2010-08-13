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
    Buffer = require("buffer").Buffer,
    commandConfig = require("./commandConfig"),
    Parser = require("./parser").Parser,

    // Type of Replies
    ERROR     = exports.ERROR = "ERROR",
    INLINE    = exports.INLINE = "INLINE",
    INTEGER   = exports.INTEGER = "INTEGER",
    BULK      = exports.BULK = "BULK",
    MULTIBULK = exports.MULTIBULK = "MULTIBULK";
    

var Reply = exports.Reply = function Reply () {
    Parser.call(this);
    this.reset();
};
sys.inherits(Reply, Parser);

// I can't place this above Reply's definition, because BulkReply
// will reference an incomplete reply.js from its own module definition.
var ErrorReply = require("./replies/errorReply").ErrorReply,
    InlineReply = require("./replies/inlineReply").InlineReply,
    IntegerReply = require("./replies/integerReply").IntegerReply,
    BulkReply = require("./replies/bulkReply").BulkReply,
    MultiBulkReply = require("./replies/multibulkReply").MultibulkReply;

/**
 * Factory method for creating replies. Figures out what type of reply (error, status,
 * integer, bulk, multibulk) to construct. If the data packet (data) provides
 * insufficient information to initialize the reply, then it returns an object
 * signalling the calling scope to attempt finishing initialization with the
 * next data packet.
*/
Reply.fromFirstLine = function (data, atDataIndex, client, context) {
    var replyType,
        lineContent,
        firstLine = client._firstLineParser,
        reply,
        newContext,
        command1;

    // Try extracting the first line
    firstLine.data = data;
    firstLine.atDataIndex = atDataIndex;
    firstLine.isDataExhausted = (atDataIndex >= data.length); // TODO Move this to calling scope
    firstLine.parse();
    var isDataExhausted = firstLine.isDataExhausted;

    if (firstLine.params.didSeeCR) {
        replyType = firstLine.extracted.replyType;
        lineContent = firstLine.extracted.line;
        atDataIndex = firstLine.atDataIndex;
        firstLine.reset();
        switch(replyType) {
            case ERROR:
                reply = new ErrorReply(lineContent);
                break;
            case INLINE:
                reply = new InlineReply(lineContent);
                break;
            case INTEGER:
                reply = new IntegerReply(lineContent);
                break;
            case BULK:
                reply = new BulkReply(lineContent);
                if (!isDataExhausted) {
                    reply.data = data;
                    reply.atDataIndex = atDataIndex;
                }
                break;
            case MULTIBULK:
                newContext = {};
                if (!context || !context.scope) {
                    newContext.scope = (client && (command1 = client.commandHistory[0]) && command1.commandName); // 2nd condition is undefined when we encounter a message or pmessage and there are no commands awaiting a reply
                    if (newContext.scope === "exec") {
                        newContext.txnCommandIndex = 0;
                    }
                }  else if (context.scope === "exec") {
                    newContext.scope = client && client.txn.replyHandlers[context.txnCommandIndex].commandName;
                    // TODO Re-evaluate whether we should change to ++context.txnCommandIndex
                    newContext.txnCommandIndex = context.txnCommandIndex + 1;
                } else if (context.scope === "sort") {
                    newContext.scope = context.scope;
                    newContext.parsingSort = true;
                }
                reply = new MultibulkReply(lineContent, client, newContext);
                if (!isDataExhausted) {
                    reply.data = data;
                    reply.atDataIndex = atDataIndex;
                }
                break;
        }
        reply.replyType = replyType;
        reply.atDataIndex = atDataIndex;
        reply.isDataExhausted = isDataExhausted;
        reply.line1Done = true;
        return reply;
    } else { // Data was exhausted and we couldn't get the entire first line
        return {
            line1Done: false,
            isDataExhausted: true,
            atDataIndex: firstLine.atDataIndex // necessary (see ~L150 for scenario where fromFirstLine doesn't have enough data to initialize a true reply
        };
    }
};

Reply.prototype.reset = function () {
    Parser.prototype.reset.call(this); // super
    
    delete this.replyType;
    this.replyValue = null;

    this.isComplete = false;

    delete this.channelName;
    delete this.message;
    delete this.channelPattern;
    delete this.isMessage; // Erase caches
    delete this.isPMessage; // Erase caches
};

Reply.prototype.triggerComplete = function () {
    this.isComplete = true;
};
