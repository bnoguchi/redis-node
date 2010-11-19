var vows = require("vows"),
    usingClient = require("./utils").usingClient.gen(),
    assert = require("assert"),
    redis = require("../lib/redis");
var sys = require("sys");

vows.describe("Redis Transactions").addBatch({
    'with proper syntax': usingClient({
        topic: function (client) {
            var simultClient = this.simultClient = redis.createClient();
            simultClient.select(6);
            var self = this;
            client.transaction( function () {
                client.rpush("txn1", 1);
                client.rpush("txn1", 2);
                client.rpush("txn1", 3, self.callback);
            });
        },
        'should result in changes': function (err, count) {
            assert.equal(count, 3);
        },
        teardown: function () {
            this.simultClient.close();
            delete this.simultClient;
        }
    }),
    'with proper syntax with multibulk': usingClient({
        topic: function (client) {
            var self = this;
            client.rpush("txn1-a", 1);
            client.rpush("txn1-a", 2);
            client.rpush("txn1-a", 3);
            client.transaction( function () {
               client.lrange("txn1-a", 0, -1, self.callback); 
            });
        },
        'should return the correct list': function (err, list) {
          assert.deepEqual(list, [1,2,3]);
        }
    }),
    'with commands that require special reply interpretation': usingClient({
        topic: function (client) {
            var self = this;
            client.zadd("txn1-b", 1, 1);
            client.zadd("txn1-b", 2, 2);
            client.zadd("txn1-b", 3, 3);
            client.transaction( function () {
               client.zrange("txn1-b", 0, -1, self.callback); 
            });
        },
        'should return the correct result': function (err, list) {
            assert.deepEqual(list, [1, 2, 3]);
        }
    }),
    'with hgetall': usingClient({
        topic: function (client) {
            var self = this;
            client.hmset("txn1-c", {a: 1, b: 2});
            client.transaction( function () {
               client.hget("txn1-c", "a"); 
               client.hget("txn1-c", "b"); 
               client.hgetall("txn1-c", self.callback); 
            });
        },
        'should transform the result just as it would outside a transaction': function (err, hash) {
            assert.deepEqual(hash, {a: 1, b: 2});
        }
    }),
    'nested': usingClient({
        topic: function (client) {
            var self = this;
            client.transaction( function () {
                client.rpush("nested-txn", "a");
                client.transaction( function () {
                    client.rpush("nested-txn", "b");
                });
                client.rpush("nested-txn", "c");
                client.rpush("nested-txn", "d", self.callback);
            });
        },
        'should result in changes': function (err, count) {
            assert.equal(count, 4);
        }
    }),
    'with improper syntax': usingClient({
        topic: function (client) {
            client.transaction( function () {
                client.rpush("txn-invalid", 1);
                client.rpush("txn-invalid", 2);
                client.rpush("txn-invalid");
        //        simultClient.rpush("txn", 4, function (err, count) {
        //            if (err) throw new Error(err);
        //            checkEqual(count, 4, "Commands from other clients should fire after a transaction from a competing client");
        //        });
            });
            client.exists("txn-invalid", this.callback);
        },
        // Atomicity
        'should roll back the transaction': function (err, result) {
            assert.equal(result, 0);
        }
        // TODO Should throw an error to notify user of failed transaction
    })
}).export(module, {});
