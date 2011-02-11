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

var util = require("util");

var PLUS      = 0x2B, // +
    MINUS     = 0x2D, // -
    DOLLAR    = 0x24, // $
    STAR      = 0x2A, // *
    COLON     = 0x3A, // :

    CR        = exports.CR = 0x0D, // \r
    LF        = exports.LF = 0x0A; // \n

var Reply = exports.Reply = function Reply () {};

var ErrorReply = require("./replies/errorReply").ErrorReply,
    InlineReply = require("./replies/inlineReply").InlineReply,
    IntegerReply = require("./replies/integerReply").IntegerReply,
    BulkReply = require("./replies/bulkReply").BulkReply,
    MultiBulkReply = require("./replies/multibulkReply").MultibulkReply;

Reply.type2constructor = {};
Reply.type2constructor[MINUS] = ErrorReply;
Reply.type2constructor[PLUS] = InlineReply;
Reply.type2constructor[COLON] = IntegerReply;
Reply.type2constructor[DOLLAR] = BulkReply;
Reply.type2constructor[STAR] = MultibulkReply;

/**
 * Factory method for creating replies. Figures out what type of reply (error, status,
 * integer, bulk, multibulk) to construct.
*/
Reply.fromTypeCode = function (typeCode, client, context) {
    var replyClass = this.type2constructor[typeCode],
        newContext;
    if (context && (context.scope === "exec")) {
        context.currTxnCmdIndex = (typeof context.currTxnCmdIndex === "undefined") ? -1 : context.currTxnCmdIndex;
        context.currTxnCmdIndex++;
    }
    if (replyClass === MultibulkReply) {
        // Setup the context to pass to the new MULTIBULK reply
        newContext = {};
        if (client.commandHistory.length > 0) { // If this isn't a message or pmessage
            if (!context || !context.scope) {
                newContext.scope = client.commandHistory.peek().commandName;
            } else if (context.scope === "sort") {
                newContext.scope = context.scope;
                newContext.parsingSort = true;
            } else if (context.scope === "exec") {
                newContext.scope = context.scope;
                newContext.currCommandName = client.currTxnCommands[context.currTxnCmdIndex].commandName;
            }
        }
    } else if (!replyClass) {
//        throw new Error("Invalid type code: " + util.inspect(String.fromCharCode(typeCode)));
        return replyClass;
    }
    return new replyClass(client, newContext);
};
