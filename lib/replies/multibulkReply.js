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
    Reply = require("../reply").Reply,
    BulkReply = require("./bulkReply").BulkReply;

MultibulkReply = exports.MultibulkReply = function (firstLineContent, client, context) {
    Reply.call(this); // Calls this.reset() implicitly (see MultibulkReply.prototype.reset())
    var expected = // Number of replies expected in the multibulk reply
        this.expected = parseInt(firstLineContent.asciiSlice(0, firstLineContent.length), 10);
    if (expected <= 0) {
        this.replyValue = null;
        this.triggerComplete();
    }
    this.client = client;
    this.context = context;
};

sys.inherits(MultibulkReply, Reply);

MultibulkReply.prototype.tryToFindChild2ValueFn = function () {
    var childReplies = this.replies,
        childReply1 = childReplies[0],
        data = this.data,
        atDataIndex = this.atDataIndex,
        expected = this.expected;

    if (!childReply1 || !childReply1.line1Done) {
        childReply1 = childReplies[0] = Reply.fromFirstLine(data, atDataIndex, this.client, this.context);
        if (childReply1.isDataExhausted) {
            this.atDataIndex = childReply1.atDataIndex;
            this.isDataExhausted = (this.atDataIndex >= data.length);
            return;
        }
    } else {
        // Load data for child
        childReply1.data = data;
        childReply1.atDataIndex = atDataIndex;
        childReply1.isDataExhausted = (atDataIndex >= data.length); // TODO Replace with this.isDataExhausted?
    }

    if (!childReply1.isComplete) { // In case of integer replies that are complete after #fromFirstLine(...)
        childReply1.parse();
    }

    if (!childReply1.isComplete) {
        this.atDataIndex = childReply1.atDataIndex;
        this.isDataExhausted = (this.atDataIndex >= data.length);
        return;
    }
    // At this point, childReply1 has been completely parsed

    // Peek at first child reply to determine if this is a PUBSUB message
    var childReply1Value = childReply1.replyValue,
        childReply1ValueLen = childReply1Value && childReply1Value.length;
    if (expected === 3 && childReply1ValueLen === 7 && childReply1Value === "message") {
        this.isMessage = true;
        this.child2ValueFn = this.child2MessageValue;
        this.replyValue = {};
    } else if (expected === 4 && childReply1ValueLen === 8 && childReply1Value === "pmessage") {
        this.isPMessage = true;
        this.child2ValueFn = this.child2PMessageValue;
        this.replyValue = {};
    } else {
        this.child2ValueFn = this.getTransformerFromContext();
    }
    this.child2ValueFn(); // add this.replies[0].replyValue to this.replyValue
    this.atDataIndex = childReply1.atDataIndex;
    this.isDataExhausted = (this.atDataIndex >= data.length);
    if (expected === 1) this.isComplete = childReply1.isComplete;
};

MultibulkReply.prototype.parse = function () {
    if (this.isComplete) return; // For the case of this.expected <= 0, isComplete
                                 // already is true, which can be ascertained
                                 // by parsing just the reply's leading line
    var data = this.data,
        atDataIndex,
        expected = this.expected,
        replyValue = this.replyValue,
        childReplies = this.replies,
        numChildren,
        latestReply;

    while (!(this.isComplete || this.isDataExhausted)) {
        // Find the appropriate child2ValueFn to add any child replyValue to this.replyValue.
        // We do this by evaluating the first reply in this multibulk. This gives us enough
        // clues about what form this.replyValue should take - either a Message, PMessage,
        // Hash, or Array.
        if (!this.child2ValueFn) { // === !childReply1.isComplete
            this.tryToFindChild2ValueFn(); // Updates this.isDataExhausted
                                           // if certain conditions are met
        } else {
            numChildren = childReplies.length;
            latestReply = childReplies[numChildren - 1];
            atDataIndex = this.atDataIndex;

            if (latestReply.isComplete && (expected > numChildren)) {
                // Append a new reply
                latestReply = childReplies[numChildren++] = Reply.fromFirstLine(data, atDataIndex, this.client, this.context);

            // During the previous while, we exhausted the data before we could find the
            // entire leading line to initialize the latest reply
            } else if (!latestReply.line1Done) {
                latestReply = childReplies[numChildren-1] = Reply.fromFirstLine(data, atDataIndex, this.client, this.context);
            } else if (!latestReply.isComplete) {
                latestReply.data = data;
                latestReply.atDataIndex = this.atDataIndex;
                latestReply.isDataExhausted = this.isDataExhausted; // should be false
            }

            // Only BulkReply and MultibulkReply define parse(...)
            if (!latestReply.isComplete && !latestReply.isDataExhausted) {
                latestReply.parse();
            }
            if (latestReply.isComplete) {
                // Then add the child reply to this's reply value
                if (numChildren > 1) this.child2ValueFn(); // We already added most recent child during tryToFindChild2ValueFn
                // If this latest reply is the last expected one
                if (numChildren === expected) {
                    // Then, we're done
                    this.triggerComplete();
                }
            }
            this.atDataIndex = latestReply.atDataIndex;
            this.isDataExhausted = latestReply.isDataExhausted;//(this.atDataIndex >= data.length);
//            sys.log(sys.inspect(this.isComplete) + "   " + sys.inspect(this.isDataExhausted) + "     " + sys.inspect(latestReply.isComplete) + "    " + sys.inspect(latestReply.isDataExhausted) + "    " + sys.inspect(this.replies.length) + " exp " + this.expected + "      ... " + latestReply.atDataIndex + "   /   " + data.length);
//            sys.log("AAAAA " + latestReply.atDataIndex + " / " + data.length + " = " + latestReply.replyValue + " , expected = (" + this.replies.length + ") / " + this.expected + " = " + sys.inspect(this.replyValue));
        }
    }
};

MultibulkReply.prototype.reset = function () {
    Reply.prototype.reset.call(this);
    delete this.expected;
    this.replies = []; // Stores the array of reply "instances"
};


MultibulkReply.prototype.child2MessageValue = function () {
    var childReplies = this.replies,
        numChildReplies = childReplies.length,
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
        numChildReplies = childReplies.length,
        childReply = childReplies[numChildReplies-1];
    if (numChildReplies === 2) {
        this.replyValue.channelName = childReply.replyValue;
    } else if (numChildReplies === 3) { // === expected
        this.replyValue.channelPattern = childReply.replyValue;
    } else if (numChildReplies === 4) {
        this.replyValue.message = childReply.replyValue;
    } else {
        throw "Out of bounds unexpected.";
    }
};

MultibulkReply.prototype.child2HashValue = function () {
    var childReplies = this.replies,
        numChildReplies = childReplies.length,
        latestChildReply = childReplies[numChildReplies-1];
    if (numChildReplies % 2 === 1) {
        this.nextKey = latestChildReply.replyValue;
    } else {
        this.replyValue[this.nextKey] = latestChildReply.replyValue;
    }
};

MultibulkReply.prototype.child2ArrayValue = function () {
    var childReplies = this.replies,
        numChildReplies = childReplies.length,
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
        latest = context.scope,
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
