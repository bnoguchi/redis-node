var vows = require("vows"),
    usingClient = require("./utils").usingClient.gen(),
    assert = require("assert"),
    redis = require("../lib/redis");

vows.describe("Redis Sorted Set Commands").addBatch({
    'the command ZADD': usingClient({
        "on a non-existent key": {
            topic: function (client) {
                client.zadd("zset-1", 1, "a", this.callback);
            },
            'should return 1 to specify that the element was added': function (err, reply) {
                assert.equal(reply, 1);
            }
        },
        "to a zset that doesn't contain the member": {
            topic: function (client) {
                client.zadd("zset-2", 1, "a");
                client.zadd("zset-2", 2, "b", this.callback);
            },
            'should return 1 to specify that the element was added': function (err, reply) {
                assert.equal(reply, 1);
            }
        },
        "to a zset that already contains the member": {
            topic: function (client) {
                client.zadd("zset-3", 1, "a");
                client.zadd("zset-3", 2, "a", this.callback);
            },
            'should return 0 to specify that the score was updated': function (err, reply) {
                assert.equal(reply, 0);
            }
        },
        "to a non-zset key": {
            topic: function (client) {
                client.rpush("non-zset-key", "a");
                client.zadd("non-zset-key", 2, "b", this.callback);
            },
            'should return an error': function (err, reply) {
                assert.instanceOf(err, Error);
            }
        }
    }),

    'the command ZREM': usingClient({
        'on a zset that contains the key': {
            topic: function (client) {
                client.zadd("zset-4", 1, "a");
                client.zrem("zset-4", "a", this.callback);
            },
            'should return integer reply 1 to specify removal': function (err, reply) {
                assert.equal(reply, 1);
            }
        },
        "on a zset that doesn't contain the key": {
            topic: function (client) {
                client.zadd("zset-5", 1, "a");
                client.zrem("zset-5", "b", this.callback);
            },
            'should return integer reply 0 to specify non-membership': function (err, reply) {
                assert.equal(reply, 0);
            }
        },
        'on a non-zset key': {
            topic: function (client) {
                client.rpush("non-zset-key-2", "a");
                client.zrem("non-zset-key-2", "a", this.callback);
            },
            'should return an error': function (err, reply) {
                assert.instanceOf(err, Error);
            }
        }
    }),

    'the command ZINCRBY': usingClient({
        'on a zset that contains the member': {
            topic: function (client) {
                client.zadd("zset-6", 1, "a");
                client.zincrby("zset-6", 3, "a", this.callback);
            },
            'should return the new score as a double prec float': function (err, score) {
                assert.equal(score, 4.0);
            }
        },
        "on a zset that doesn't contain the member": {
            topic: function (client) {
                client.zadd("zset-7", 1, "a");
                client.zincrby("zset-7", 3.2, "b", this.callback);
            },
            'should return the score of the added member': function (err, score) {
                assert.equal(score, 3.2);
            }
        },
        'on a non-existing key': {
            topic: function (client) {
                client.zincrby("zset-8", 3.18, "z", this.callback);
            },
            'should return the score of the added member of the added zset': function (err, score) {
                assert.equal(score, 3.18);
            }
        },
        'decrementing a score': {
            topic: function (client) {
                client.zadd("zset-9", 5, "a");
                client.zincrby("zset-9", -3, "a", this.callback);
            },
            'should return the new score': function (err, score) {
                assert.equal(score, 2);
            }
        }
    }),

    'the command ZRANK': usingClient({
        topic: function (client) {
            client.zadd("zset-10", 10, "a");
            client.zadd("zset-10", 20, "b");
            client.zadd("zset-10", 30, "c");
            return client;
        },
        'for an element in the zset': {
            topic: function (client) {
                client.zrank("zset-10", "c", this.callback);
            },
            'should return the rank': function (err, rank) {
                assert.equal(rank, 2); // rank starts from 0-based index
            }
        },
        'for a non-existing element in the zset': {
            topic: function (client) {
                client.zrank("zset-10", "d", this.callback);
            },
            'should return null': function (err, nil) {
                assert.isNull(nil);
            }
        }
    }),

    'the command ZREVANK': usingClient({
        topic: function (client) {
            client.zadd("zset-11", 10, "a");
            client.zadd("zset-11", 20, "b");
            client.zadd("zset-11", 30, "c");
            return client;
        },
        'for an element in the zset': {
            topic: function (client) {
                client.zrevrank("zset-11", "c", this.callback);
            },
            'should return the rank': function (err, rank) {
                assert.equal(rank, 0); // rank starts from 0-based index
            }
        },
        'for a non-existing element in the zset': {
            topic: function (client) {
                client.zrevrank("zset-11", "d", this.callback);
            },
            'should return null': function (err, nil) {
                assert.isNull(nil);
            }
        }
    }),

    // Symmetric with ZREVRANGE
    'the command ZRANGE': usingClient({
        topic: function (client) {
            client.zadd("zset-12", 10, "a");
            client.zadd("zset-12", 20, "b");
            client.zadd("zset-12", 30, "c");
            client.zadd("zset-12", 40, "d");
            return client;
        },

        'with in-range indexes': {
            topic: function (client) {
                client.zrange("zset-12", 0, -1, this.callback);
            },
            'should return the zset in sorted ascending score order': function (err, list) {
                assert.deepEqual(list, ["a", "b", "c", "d"]);
            }
        },
        'with the start > end': {
            topic: function (client) {
                client.zrange("zset-12", 4, 5, this.callback);
            },
            'should return an empty list': function (err, list) {
                assert.deepEqual(list, []);
            }
        },
        "with end >= zset's length": {
            topic: function (client) {
                client.zrange("zset-12", 0, 4, this.callback);
            },
            'should return the entire zset sorted in ascending score order': function (err, list) {
                assert.deepEqual(list, ["a", "b", "c", "d"]);
            }
        },
        'with scores': {
            topic: function (client) {
                client.zrange("zset-12", 0, -1, "withscores", this.callback);
            },
            'should return an array of hashes with the scores': function (err, list) {
                assert.deepEqual(list, [{a: 10}, {b: 20}, {c: 30}, {d: 40}]);
            }
        }
    }),

    // TODO Make the command call more idiomatic
    //  c.zrangebyscore(key, ">=0", "<=3", {offset: 0, count: 2, withscores: true});
    // TODO Add tests for exclusive intervals and infinities
    'the command ZRANGEBYSCORE': usingClient({
        topic: function (client) {
            client.zadd("zset-13", 10, "a");
            client.zadd("zset-13", 20, "b");
            client.zadd("zset-13", 30, "c");
            client.zadd("zset-13", 40, "d");
            return client;
        },
        'with minimum number of parameters (key, min, max)': {
            topic: function (client) {
                client.zrangebyscore("zset-13", 10, 30, this.callback);
            },
            'should return only the items in the zset within the min and max inclusive': function (err, list) {
                assert.deepEqual(list, ["a", "b", "c"]);
            }
        },
        'with LIMIT': {
            topic: function (client) {
                client.zrangebyscore("zset-13", 10, 30, "LIMIT", 1, 2, this.callback);
            },
            'should return only the appropriate items': function (err, list) {
                assert.deepEqual(list, ["b", "c"]);
            }
        },
        'with scores': {
            topic: function (client) {
                client.zrangebyscore("zset-13", 10, 40, "LIMIT", 1, 3, "withscores", this.callback);
            },
            'should return an array of hashes with the scores': function (err, list) {
                assert.deepEqual(list, [{b: 20}, {c: 30}, {d: 40}]);
            }
        }
    }),

    'the command ZCOUNT': usingClient({
        topic: function (client) {
            client.zadd("zset-14", 10, "a");
            client.zadd("zset-14", 20, "b");
            client.zadd("zset-14", 30, "c");
            client.zadd("zset-14", 40, "d");
            client.zcount("zset-14", 20, 30, this.callback);
        },
        'should return the number of elements that match the score range': function (err, card) {
            assert.equal(card, 2);
        }
    }),

    'the command ZCARD': usingClient({
        'for an existing zset': {
            topic: function (client) {
                client.zadd("zset-15", 10, "a");
                client.zadd("zset-15", 20, "b");
                client.zadd("zset-15", 30, "c");
                client.zadd("zset-15", 40, "d");
                client.zcard("zset-15", this.callback);
            },
            'should return the number of members in the zset': function (err, card) {
                assert.equal(card, 4);
            }
        },
        'for a non-existing key': {
            topic: function (client) {
                client.zcard("non-existing-key", this.callback);
            },
            'should return 0': function (err, result) {
                assert.equal(result, 0);
            }
        }
    }),

    'the command ZSCORE': usingClient({
        'for an existing zset': {
            topic: function (client) {
                client.zadd("zset-16", 10, "a");
                return client;
            },
            'containing the element': {
                topic: function (client) {
                    client.zscore("zset-16", "a", this.callback);
                },
                'should return the score': function (err, score) {
                    assert.equal(score, 10.0);
                }
            },
            'not containing the element': {
                topic: function (client) {
                    client.zscore("zset-16", "b", this.callback);
                },
                'should return null': function (err, nil) {
                    assert.isNull(nil);
                }
            }
        },
        'for a non-existing key': {
            topic: function (client) {
                client.zscore("non-existing-key", "a", this.callback);
            },
            'should return null': function (err, nil) {
                assert.isNull(nil);
            }
        }
    }),

    'the command ZREMRANGEBYRANK': usingClient({
        topic: function (client) {
            client.zadd("zset-17", 10, "a");
            client.zadd("zset-17", 20, "b");
            client.zadd("zset-17", 30, "c");
            client.zadd("zset-17", 40, "d");
            client.zremrangebyrank("zset-17", 0, 1, this.callback);
        },
        'should return the number of elements removed': function (err, num) {
            assert.equal(num, 2);
        }
    }),

    'the command ZREMRANGEBYSCORE': usingClient({
        topic: function (client) {
            client.zadd("zset-18", 10, "a");
            client.zadd("zset-18", 20, "b");
            client.zadd("zset-18", 30, "c");
            client.zadd("zset-18", 40, "d");
            client.zremrangebyscore("zset-18", 15, 25, this.callback);
        },
        'should return the number of elements removed': function (err, num) {
            assert.equal(num, 1);
        }
    }),

    'the command ZUNIONSTORE': usingClient({
        topic: function (client) {
            client.zadd("zset-19", 10, "a");
            client.zadd("zset-19", 20, "b");
            client.zadd("zset-19", 30, "c");
            client.zadd("zset-19", 40, "d");
            
            client.zadd("zset-20", 10, "c");
            client.zadd("zset-20", 20, "d");
            client.zadd("zset-20", 30, "e");
            client.zadd("zset-20", 40, "f");

            return client;
        },
        'with bare minimum parameters': {
            topic: function (client) {
                client.zunionstore("zunionstore-dest-1", ["zset-19", "zset-20"], this.callback);
            },
            'should return the number of elements in the sorted set': function (err, card) {
                assert.equal(card, 6);
            }
        },
        'with WEIGHTS': {
            topic: function (client) {
                client.zunionstore("zunionstore-dest-2", {"zset-19": 2, "zset-20": 3}, this.callback);
            },
            'should return the number of elements in the sorted set': function (err, card) {
                assert.equal(card, 6);
            }
        },
        'with AGGREGATE': {
            topic: function (client) {
                client.zunionstore("zunionstore-dest-3", ["zset-19", "zset-20"], "min", this.callback);
            },
            'should return the number of elements in the sorted set': function (err, card) {
                assert.equal(card, 6);
            }
        },
        'with WEIGHTS and AGGREGATE': {
            topic: function (client) {
                client.zunionstore("zunionstore-dest-4", {"zset-19": 2, "zset-20": 3}, "min", this.callback);
            },
            'should return the number of elements in the sorted set': function (err, card) {
                assert.equal(card, 6);
            }
        }
        
    }),

    'the command ZINTERSTORE': usingClient({
        topic: function (client) {
            client.zadd("zset-21", 10, "a");
            client.zadd("zset-21", 20, "b");
            client.zadd("zset-21", 30, "c");
            client.zadd("zset-21", 40, "d");
            
            client.zadd("zset-22", 10, "c");
            client.zadd("zset-22", 20, "d");
            client.zadd("zset-22", 30, "e");
            client.zadd("zset-22", 40, "f");

            return client;
        },
        'with bare minimum parameters': {
            topic: function (client) {
                client.zinterstore("zinterstore-dest-5", ["zset-21", "zset-22"], this.callback);
            },
            'should return the number of elements in the sorted set': function (err, card) {
                assert.equal(card, 2);
            }
        },
        'with WEIGHTS': {
            topic: function (client) {
                client.zinterstore("zinterstore-dest-6", {"zset-21": 2, "zset-22": 3}, this.callback);
            },
            'should return the number of elements in the sorted set': function (err, card) {
                assert.equal(card, 2);
            }
        },
        'with AGGREGATE': {
            topic: function (client) {
                client.zinterstore("zinterstore-dest-7", ["zset-21", "zset-22"], "min", this.callback);
            },
            'should return the number of elements in the sorted set': function (err, card) {
                assert.equal(card, 2);
            }
        },
        'with WEIGHTS and AGGREGATE': {
            topic: function (client) {
                client.zinterstore("zinterstore-dest-8", {"zset-21": 2, "zset-22": 3}, "min", this.callback);
            },
            'should return the number of elements in the sorted set': function (err, card) {
                assert.equal(card, 2);
            }
        }
        
    })
}).export(module, {});
