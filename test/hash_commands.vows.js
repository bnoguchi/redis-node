var vows = require("vows"),
    usingClient = require("./utils").usingClient.gen(),
    assert = require("assert"),
    redis = require("../lib/redis");

vows.describe("Redis Hash Commands").addBatch({
    'the command HSET': usingClient({
        'on a non existing key': {
            topic: function (client) {
                client.hset("hset-1", "foo", "bar", this.callback);
            },
            'should return the integer reply 1': function (err, reply) {
                assert.equal(reply, 1);
            }
        },
        'on an existing key, non-existing field': {
            topic: function (client) {
                client.hset("hset-2", "foo", "bar");
                client.hset("hset-2", "hello", "world", this.callback);
            },
            'should return the integer reply 1': function (err, reply) {
                assert.equal(reply, 1);
            }
        },
        'on an existing key, existing field': {
            topic: function (client) {
                client.hset("hset-3", "foo", "bar");
                client.hset("hset-3", "foo", "foo", this.callback);
            },
            'should return the integer reply 0 to specify an update': function (err, reply) {
                assert.equal(reply, 0);
            }
        }
    }),

    'the command HGET': usingClient({
        topic: function (client) {
            client.hset("hset-4", "foo", "bar");
            return client;
        },
        'if the key holds the hash with the field': {
            topic: function (client) {
                client.hget("hset-4", "foo", this.callback);
            },
            'should return the value': function (err, value) {
                assert.equal(value, "bar");
            }
        },
        'if the key holds a hash without the field': {
            topic: function (client) {
                client.hget("hset-4", "hello", this.callback);
            },
            'should return null': function (err, nil) {
                assert.isNull(nil);
            }
        },
        "if the key doesn't exist": {
            topic: function (client) {
                client.hget("non-existent-key", "foo", this.callback);
            },
            'should return null': function (err, nil) {
                assert.isNull(nil);
            }
        }
    }),

    'the command HMGET': usingClient({
        topic: function (client) {
            client.hset("hset-5", "foo", "bar");
            client.hset("hset-5", "hello", "world");
            return client;
        },

        'where all fields exist': {
            topic: function (client) {
                client.hmget("hset-5", "foo", "hello", this.callback);
            },
            'should return all the values': function (err, list) {
                assert.deepEqual(list, ["bar", "world"]);
            }
        },

        'where some of the specified fields do not exist': {
            topic: function (client) {
                client.hmget("hset-5", "foo", "nope", this.callback);
            },
            'should return nil values for non-existent fields': function (err, list) {
                assert.deepEqual(list, ["bar", null]);
            }
        },

        "where the key doesn't exist": {
            topic: function (client) {
                client.hmget("non-existent-key", "foo", "bar", this.callback);
            },
            'should be treated like empty hashes': function (err, list) {
                assert.deepEqual(list, [null, null]);
            }
        }
    }),

    'the command HMSET': usingClient({
        topic: function (client) {
            client.hmset("hset-6", {foo: "bar", hello: "world"}, this.callback);
        },
        'should always return true (+OK) status': function (err, status) {
            assert.isTrue(status);
        }
    }),

    'the command HINCRBY': usingClient({
        "if the key doesn't exist": {
            topic: function (client) {
                client.hincrby("hset-7", "counter", 10, this.callback);
            },
            'should return the new value at the new hash': function (err, counter) {
                assert.equal(counter, 10);
            }
        },
        "if the key exists but the field doesn't": {
            topic: function (client) {
                client.hset("hset-8", "name", "8th");
                client.hincrby("hset-8", "counter", 20, this.callback);
            },
            'should return the new value at the new field': function (err, counter) {
                assert.equal(counter, 20);
            }
        },
        'if the key exists and the field exists': {
            topic: function (client) {
                client.hset("hset-9", "counter", 15);
                client.hincrby("hset-9", "counter", 20, this.callback);
            },
            'should return the new incremented value': function (err, counter) {
                assert.equal(counter, 35);
            }
        },
        'using a negative increment': {
            topic: function (client) {
                client.hset("hset-10", "counter", 15);
                client.hincrby("hset-10", "counter", -4, this.callback);
            },
            'should return the newly decremented value': function (err, counter) {
                assert.equal(counter, 11);
            }
        }
    }),

    'the command HEXISTS': usingClient({
        topic: function (client) {
            client.hset("hset-11", "foo", "bar");
            return client;
        },
        'if the key exists and the field exists': {
            topic: function (client) {
                client.hexists("hset-11", "foo", this.callback);
            },
            "should return the integer value 1": function (err, reply) {
                assert.equal(reply, 1);
            }
        },
        "if the key exists and the field doesn't exist": {
            topic: function (client) {
                client.hexists("hset-11", "hello", this.callback);
            },
            'should return the integer value 0': function (err, reply) {
                assert.equal(reply, 0);
            }
        },
        "if the key doesn't exist": {
            topic: function (client) {
                client.hexists("non-existent-key", "foo", this.callback);
            },
            'should return the integer value 0': function (err, reply) {
                assert.equal(reply, 0);
            }
        }
    }),

    'the command HDEL': usingClient({
        topic: function (client) {
            client.hset("hset-12", "foo", "bar");
            return client;
        },
        'if the field is present in the hash': {
            topic: function (client) {
                client.hdel("hset-12", "foo", this.callback);
            },
            'should return the integer value 1': function (err, reply) {
                assert.equal(reply, 1);
            }
        },
        "if the field isn't present in the hash": {
            topic: function (client) {
                client.hdel("hset-12", "hello", this.callback);
            },
            'should return the integer value 0': function (err, reply) {
                assert.equal(reply, 0);
            }
        }
    }),

    'the command HLEN': usingClient({
        topic: function (client) {
            client.hmset("hset-13", {foo: "bar", hello: "world"});
            client.hlen("hset-13", this.callback);
        },
        'should return the number of fields contained by the hash': function (err, num) {
            assert.equal(num, 2);
        }
    }),

    'the command HKEYS': usingClient({
        topic: function (client) {
            client.hmset("hset-14", {foo: "bar", hello: "world"});
            client.hkeys("hset-14", this.callback);
        },
        'should return the list of field names': function (err, list) {
            assert.deepEqual(list, ["foo", "hello"]);
        }
    }),

    'the command HVALS': usingClient({
        topic: function (client) {
            client.hmset("hset-15", {foo: "bar", hello: "world"});
            client.hvals("hset-15", this.callback);
        },
        'should return the list of values': function (err, list) {
            assert.deepEqual(list, ["bar", "world"]);
        }
    }),

    'the command HGETALL': usingClient({
        'on an existing hash': {
            topic: function (client) {
                client.hmset("hset-16", {foo: "bar", hello: "world"});
                client.hgetall("hset-16", this.callback);
            },
            'should return the hash': function (err, hash) {
                assert.deepEqual(hash, {foo: "bar", hello: "world"});
            }
        },
        'on a non-existent key': {
            topic: function (client) {
                client.hgetall("hset-non-existent", this.callback);
            },
            'should return null': function (err, hash) {
                assert.isNull(hash);
            }
        }
    })
}).export(module, {});
