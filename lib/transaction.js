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

var sys = require("sys");
var commandConfig = require("./commandConfig"),
    EventEmitter = require("events").EventEmitter,
    Command = require("./command").Command;

var Transaction = exports.Transaction = function Transaction (client) {
    this.client = client;
    this.didRegisterWithServer = false;
    this.commandQueue = [];
    this.replyHandlers = [];
    this.replies = [];

    // How many of the commands sent through the client have NOT
    // received a +QUERY reply yet.
    this.numUnackedCommands = 0;

    // Whether or not all commands in the block sent to #execute
    // have been sent through the client.
    this.didRegisterAllCommands = false;

    client.isTransacting = true;
    this.on("exit", function () {
        var block,
            nextTxn,
            txnQueue = client.queuedTransactionBlocks;
        if (txnQueue.length === 0) {
            client.isTransacting = false;
            client.flushQueuedCommands();
        } else {
            block = txnQueue.pop();
            client.isTransacting = true;
            nextTxn = new Transaction(client).execute(block);
        }
    });
};
sys.inherits(Transaction, EventEmitter);

Transaction.prototype.delegateCommand = function (commandAsArray) {
    // If we haven't signaled the start of the transaction to the Redis server,
    // then do so now by sending a MULTI command to the Redis server
    if (!this.didRegisterWithServer) this.registerWithServer();

    var command = new Command(commandAsArray),
        client = this.client,
        txn = this,
        ackCallback,
        intendedCommandCallback,
        commandName = command.commandName;

    command.addCallbackIfMissing();
    intendedCommandCallback = command.commandCallback;

    // Replace the callback with one that interprets the acknowledgment
    // for commands called within a transaction.
    ackCallback = function (err, reply) {
        if (!err && reply !== "QUEUED") {
            sys.log(sys.inspect(reply));
            err = commandName + " was not queued in the transaction.";
        }
        if (err) {
            sys.log(err);
            // Remove the transaction commands still ahead of me:
            sys.log(txn.numUnackedCommands);
            for (var i = 0; i < txn.numUnackedCommands; i++); {
                client.commandHistory.shift();
            }
            // Tell the Redis server to cancel the transaction,
            // so it doesn't block other clients' commands
            client.sendCommandInsideTransaction("discard", function (errDiscard, reply) {
                txn.emit("exit");
            });
//                throw err;
        } else {
            txn.numUnackedCommands--;
            if (txn.didRegisterAllCommands && (txn.numUnackedCommands === 0)) {
                txn.appendExec();
            }
        }
    };
    // Replace the intended reply callback with this deferring callback
    command.commandCallback = ackCallback;

    // Place the intendedCallback onto a queue for deferred
    // invocation (once we receive all replies as the response
    // of the EXEC command)
    this.replyHandlers.push({commandName: commandName, callback: intendedCommandCallback});
    this.numUnackedCommands++;
    client.sendCommandInsideTransaction(command);
};

var commands = require("./commandList");
/** Example Use Case
* client.transaction( function (t) {
*   t.hmset("pairs.1", {id: 1, x: 22, y: 4});
*   t.lpush("triplets", 1);
*   t.exec();
* });
*/
// Setup delegator functions - Delegate commands to the client
commands.forEach( function (commandName) {
    Transaction.prototype[commandName] = function () {
        var commandAsArray = Array.prototype.slice.call(arguments);
        commandAsArray.unshift(commandName);
        this.delegateCommand(commandAsArray);
    };
});

var commandFns,
    commandBuilder;
for (var commandName in commandConfig) {
    commandFns = commandConfig[commandName];
    if (commandBuilder = commandFns.buildCommandArray) {
        Transaction.prototype[commandName] = function (commandBuilder) {
            return function () {
                var commandAsArray = commandBuilder.apply(this, arguments);
                this.delegateCommand(commandAsArray);
            };
        }(commandBuilder);
    }
}

// If any DISCARD is called in response to a syntactical error reply 
// (vs a +QUERY reply), it must be called before EXEC; if not, then
// EXEC completes the transaction, and DISCARD doesn't have any effect.
// 
Transaction.prototype.execute = function (block) {
    var commandHistory = this.client.commandHistory,
        lastCommand,
        lastCommandName;
    block(this);
    this.didRegisterAllCommands = true;
    if (this.numUnackedCommands === 0) {
        this.appendExec();
    }
    // By this point, all commands should have been added
    // to this.commandQueue.
    //
    // For convenience, the user doesn not explicitly call
    // t.exec() at the end of the transaction callback,
    // doStuffInsideTransaction. We add it automatically for them.
    // THAT IS WHAT THE FOLLOWING CODE IS FOR
};

Transaction.prototype.appendExec = function () {
    var txn = this;
    this.client.sendCommandInsideTransaction("exec", function (err, replies) {
        if (err) throw err;
        var i = 0, len = replies.length,
            singleReply, handler,
            commandNameForCallback, commandCallback, callbackArg;
        for ( ; i < len; i++) {
            singleReply = replies[i];
            handler = txn.replyHandlers[i];
            commandNameForCallback = handler.commandName;
            commandCallback = handler.callback;
            // FINALLY call the reply callback
            callbackArg = commandConfig.typecastReply(commandNameForCallback, singleReply);
            sys.log("CALLBACK ARG " + sys.inspect(callbackArg));
            if (callbackArg instanceof Error) {
                sys.log("ERROR");
                commandCallback(callbackArg, null);
            } else {
                commandCallback(null, callbackArg);
            }
        }
        txn.emit("exit");
    });
};

Transaction.prototype.registerWithServer = function () {
    this.client.sendCommandInsideTransaction("multi", function (err, reply) {
        if (err) throw new Error(err);
        if (reply !== true) throw new Error("Expected OK. Reply is" + sys.inspect(reply));
    });
    this.didRegisterWithServer = true;
};
