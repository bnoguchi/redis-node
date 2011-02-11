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

var Reply = require("../reply").Reply,
    CR = require("../reply").CR,
    LF = require("../reply").LF,
    BulkReply = require("./bulkReply").BulkReply,
    IntegerReply = require("./integerReply").IntegerReply;

MultibulkReply = exports.MultibulkReply = function (client, context) {
    this.client = client;
    this.context = context;
    this.isComplete = false;
    this.replyValue = null;
    this.expectedProxy = {replyValue: "", i: 0, isComplete: false};
};

Object.defineProperty(MultibulkReply.prototype, 'latest', {
    get: function () {
        var ctx = this.context;
        return (ctx.scope === "exec") ?
               ctx.currCommandName :
               ctx.scope;
    }
});

MultibulkReply.prototype.parse = function (data, atDataIndex) {
    var dataLen = data.length,
        childReplies = this.replies,
        expected, expectedProxy;
    while (atDataIndex < dataLen) {
        if (typeof this.expected === "undefined") {
            expectedProxy = this.expectedProxy;
            atDataIndex = IntegerReply.prototype.parse.call(expectedProxy, data, atDataIndex);
            if (expectedProxy.isComplete) {
                expected = this.expected = expectedProxy.replyValue;
                if (expected === -1) {
                    this.replyValue = null;
                    this.isComplete = true;
                    break;
                }
                if (expected === 0) { // For '*0\r\n'
                    this.replyValue = this.isHashValuable[this.latest] ? null : [];
                    this.isComplete = true;
                    break;
                }
                childReplies = this.replies = new Array(expected);
                this.numChildren = 0;
            }
            continue;
        }

        latestReply = childReplies[this.numChildren-1];
        if (latestReply && !latestReply.isComplete) {
            atDataIndex = latestReply.parse(data, atDataIndex);
        } else {
            var newReply = Reply.fromTypeCode( data[atDataIndex++], this.client, this.context );
            if (!newReply) {
                continue;
            }
            latestReply = childReplies[this.numChildren++] = newReply;
        }
        if (latestReply.isComplete) {
            if (this.numChildren === 1) {
                // Find the child2ValueFn to use to add any child replyValue to this.replyValue.
                // We do this by evaluating the first reply in this multibulk. This gives us enough
                // clues about what form this.replyValue should take - either a Message, PMessage,
                // Hash, or Array.

                // Determine if this is a PUBSUB message by peeking at the first child reply
                var childReply1Value = latestReply.replyValue,
                    childReply1ValueLen = childReply1Value && childReply1Value.length;
                if (expected === 3 && childReply1ValueLen === 7 && childReply1Value === "message") {
                    // If this is a PUBSUB message
                    this.isMessage = true;
                    this.child2ValueFn = this.child2MessageValue;
                    this.replyValue = {};
                } else if (expected === 4 && childReply1ValueLen === 8 && childReply1Value === "pmessage") {
                    // If this is a PUBSUB pmessage
                    this.isPMessage = true;
                    this.child2ValueFn = this.child2PMessageValue;
                    this.replyValue = {};
                } else {
                    this.child2ValueFn = this.getTransformerFromContext();
                }
            }
            this.child2ValueFn();
            if (this.expected === this.numChildren) {
                this.isComplete = true;
                break;
            }
        }
    }
    return atDataIndex;
};

MultibulkReply.prototype.child2MessageValue = function () {
    var childReplies = this.replies,
        numChildReplies = this.numChildren,
        childReply = childReplies[numChildReplies-1];
    if (numChildReplies === 1) {
        // Do nothing because the 1st reply is just "message" or "pmessage"
    } else if (numChildReplies === 2) {
        this.replyValue.channelName = childReply.replyValue;
    } else if (numChildReplies === 3) { // === expected
        this.replyValue.message = childReply.replyValue;
    } else {
        throw new Error("Out of bounds unexpected.");
    }
};

MultibulkReply.prototype.child2PMessageValue = function () {
    var childReplies = this.replies,
        numChildReplies = this.numChildren,
        childReply = childReplies[numChildReplies-1];
    if (numChildReplies === 1) {
        // Do nothing because the 1st reply is just "message" or "pmessage"
    } else if (numChildReplies === 2) {
        this.replyValue.channelPattern = childReply.replyValue;
    } else if (numChildReplies === 3) { // === expected
        this.replyValue.channelName = childReply.replyValue;
    } else if (numChildReplies === 4) {
        this.replyValue.message = childReply.replyValue;
    } else {
        throw new Error("Out of bounds unexpected.");
    }
};

MultibulkReply.prototype.child2HashValue = function () {
    var childReplies = this.replies,
        numChildReplies = this.numChildren,
        latestChildReply = childReplies[numChildReplies-1];
    if (numChildReplies % 2 === 1) {
        this.nextKey = latestChildReply.replyValue;
    } else {
        this.replyValue[this.nextKey] = latestChildReply.replyValue;
    }
};

MultibulkReply.prototype.child2ArrayValue = function () {
    var childReplies = this.replies,
        numChildReplies = this.numChildren,
        latestChildReply = childReplies[numChildReplies-1];
    this.replyValue.push(latestChildReply.replyValue);
};

// Multibulks can be found with:
// -Transactions => return an array of replies
// -Sort => return an array where elements are hashes or values
// -Hgetall => return a hash
// -Mget => return an array
// -Others => return an array of values
// Most extreme case is a transaction of sorts
MultibulkReply.prototype.getTransformerFromContext = function () {
    var context = this.context,
        latest = this.latest,
        ret;

    if (latest === "sort") {
        if (!context.parsingSort) {
            ret = this.child2ArrayValue;
            this.replyValue = [];
        }
        else {
            ret = this.child2HashValue;
            this.replyValue = {};
        }
    } else if (this.isHashValuable[latest]) {
        ret = this.child2HashValue;
        this.replyValue = {};
    } else {
        // Among other scenarios, this else also takes care of (latest === "exec") or 
        // when we're in special transaction exiting territory
        ret = this.child2ArrayValue;
        this.replyValue = [];
    }
    return ret;
};

MultibulkReply.prototype.isHashValuable = {
    hgetall: true
};
