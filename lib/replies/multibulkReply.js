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
    Reply.call(this);
    var expected = // Number of replies expected in the multibulk reply
        this.expected = parseInt(firstLineContent.utf8Slice(0, firstLineContent.length), 10);
    this.replies = []; // Stores the array of reply "instances"
    if (expected <= 0) {
        this.replyValue = null;
        this.triggerComplete();
    }
    this.client = client;
    this.context = context;
};

sys.inherits(MultibulkReply, Reply);

MultibulkReply.prototype.loadData = function (data, atDataIndex) {
    Reply.prototype.loadData.call(this, data, atDataIndex);
    var childReplies = this.replies,
        latestReply = childReplies[childReplies.length-1];

    // latestReply could not even have 1st line loaded
    if (latestReply) {
        if (latestReply.loadData) {
            latestReply.loadData(data, atDataIndex);
        } else {
            latestReply.atDataIndex = this.atDataIndex;
            latestReply.isDataExhausted = false;
        }
    }
};

MultibulkReply.prototype.tryToFindChild2ValueFn = function () {
    var childReplies = this.replies,
        childReply1 = childReplies[0],
        data = this.data,
        atDataIndex = this.atDataIndex,
        expected = this.expected;

    if (!childReply1 || !childReply1.line1Done) {
        childReply1 = childReplies[0] = Reply.fromFirstLine(data, atDataIndex, this.client, this.context);
        if (childReply1.isDataExhausted) {
            this._updateAtDataIndex(childReply1.atDataIndex);
//            this.isDataExhausted = true;
            return;
        }
    } else {
        childReply1.loadData(data, atDataIndex);
    }

    if (!childReply1.isComplete) { // In case of integer replies that are complete after #fromFirstLine(...)
        childReply1.parse();
    }

    if (!childReply1.isComplete) {
        this._updateAtDataIndex(childReply1.atDataIndex);
//        this.isDataExhausted = true;
        return;
    }
    // At this point, childReply1 has been completely parsed

    // Peek at first child reply to determine if this is a PUBSUB message
    if (expected === 3 && childReply1.replyValue === "message") {
        this.isMessage = true;
        this.child2ValueFn = this.child2MessageValue;
        this.replyValue = {};
    } else if (expected === 4 && childReply1.replyValue === "pmessage") {
        this.isPMessage = true;
        this.child2ValueFn = this.child2PMessageValue;
        this.replyValue = {};
    } else {
        this.child2ValueFn = this.getTransformerFromContext();
    }
    this.child2ValueFn(); // add this.replies[0].replyValue to this.replyValue
    this._updateAtDataIndex(childReply1.atDataIndex);
};

MultibulkReply.prototype.parse = function () {
    if (this.isComplete) return; // For the case of this.expected <= 0, isComplete
                                 // already is true, which can be ascertained
                                 // by parsing just the reply's leading line
//    sys.log("AAA");
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
//            sys.log("BBB");
            numChildren = childReplies.length;
            latestReply = childReplies[numChildren - 1];
            atDataIndex = latestReply.atDataIndex;


//            sys.log("FROM TOP " + sys.inspect(latestReply.isDataExhausted));
            if (latestReply.isComplete && (expected > numChildren)) {
                // Append a new reply
                latestReply = childReplies[numChildren++] = Reply.fromFirstLine(data, atDataIndex, this.client, this.context);

            // During the previous while, we exhausted the data before we could find the
            // entire leading line to initialize the latest reply
            } else if (!latestReply.line1Done) {
                latestReply = childReplies[numChildren-1] = Reply.fromFirstLine(data, atDataIndex, this.client, this.context);
//                sys.log("AFTER 2nd ELSEIF " + sys.inspect(latestReply.isDataExhausted));
            }

            // Only BulkReply and MultibulkReply define parse(...)
            if (!latestReply.isComplete && !latestReply.isDataExhausted) {//latestReply instanceof BulkReply || latestReply instanceof MultibulkReply) {
                latestReply.parse();
//                sys.log("AFTER PARSE " + sys.inspect(latestReply.isDataExhausted));
            }
            if (latestReply.isComplete) {
                // Then add the child reply to this's reply value
                if (numChildren > 1) this.child2ValueFn(); // We already added most recent child in above if
                // If this latest reply is the last expected one
                if (this.replies.length === expected) {
                    // Then, we're done
                    this.triggerComplete();
                }
            }
            this._updateAtDataIndex(latestReply.atDataIndex); // Updates this.atDataExhausted if necessary
//            sys.log(this.atDataIndex + " ???? " + this.data.length);
//            sys.log(sys.inspect(this.isComplete) + "   " + sys.inspect(this.isDataExhausted) + "     " + sys.inspect(latestReply.isComplete) + "    " + sys.inspect(latestReply.isDataExhausted) + "    " + sys.inspect(this.replies.length) + " exp " + this.expected + "      ... " + latestReply.atDataIndex + "   /   " + data.length);
//            sys.log("AAAAA " + latestReply.atDataIndex + " / " + data.length + " = " + latestReply.replyValue + " , expected = (" + this.replies.length + ") / " + this.expected + " = " + sys.inspect(this.replyValue));
        }
    }
};

// TODO Do we even ever call resets?
MultibulkReply.prototype.reset = function () {
    Reply.prototype.reset.call(this);
    delete this.expected;
    this.replies = [];
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
        childReply = childReplies[numChildReplies-1];
    this.replyValue = this.replyValue || {};
    if (numChildReplies % 2 === 1) {
        this.replyValue._n_e_x_t_key = childReply.replyValue;
    } else {
        this.replyValue[this.replyValue._n_e_x_t_key] = childReply.replyValue;
        delete this.replyValue._n_e_x_t_key;
    }
};

MultibulkReply.prototype.child2ArrayValue = function () {
    var childReplies = this.replies,
        numChildReplies = childReplies.length,
        childReply = childReplies[numChildReplies-1];
    this.replyValue = this.replyValue || [];
    this.replyValue.push(childReply.replyValue);
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
        latest = context.scope;

//    sys.log(sys.inspect(context));
    // If we are in special transaction exiting territory
    if (latest === "exec") {
        return this.child2ArrayValue;
    } else if (latest === "sort") {
        if (!context.parsingSort) return this.child2ArrayValue;
        else return this.child2HashValue;
    } else {
        return this["child2" + this.transformerMap[latest] + "Value"] || this.child2ArrayValue;
    }
};

// How to say "sort by...get"
MultibulkReply.prototype.transformerMap = {
    hgetall: "Hash",
    hmget: "Hash"
};
