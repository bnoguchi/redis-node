var vows = require("vows"),
    usingClient = require("./utils").usingClient,
    assert = require("assert"),
    redis = require("../lib/redis");

vows.describe("Redis Transactions").addBatch({
    'with proper syntax': usingClient({
        topic: function (client) {
            var simultClient = redis.createClient();
            simultClient.select(6);
            var self = this;
            client.transaction( function (t) {
                t.rpush("txn1", 1);
                t.rpush("txn1", 2);
                t.rpush("txn1", 3, self.callback);
            });
        },
        'should result in changes': function (err, count) {
            assert.equal(count, 3);
        }
    }),
//    'with improper syntax': usingClient({
//        client.transaction( function (t) {
//            t.rpush("txn", 1);
//            t.rpush("txn", 2);
//    //        simultClient.rpush("txn", 4, function (err, count) {
//    //            if (err) throw new Error(err);
//    //            checkEqual(count, 4, "Commands from other clients should fire after a transaction from a competing client");
//    //        });
//            t.rpush("txn", function (err, count) { // INCORRECT SYNTAX
//                sys.log("ERROR " + err);
//    //            checkEqual(count, 3, "testMULTI");
//            });
//        });
//        client.exists("txn", function (err, result) {
//            checkEqual(result, 0, "Incorrect syntax rolls back transaction");
//        });
//
//        // TODO Check atomicity (i.e., no persistence after a transaction fails)
//    })
}).export(module, {});
