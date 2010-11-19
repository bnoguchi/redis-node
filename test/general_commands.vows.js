var vows = require("vows"),
    usingClientFactory = require("./utils").usingClient,
    usingClient = usingClientFactory.gen(),
    usingClient2 = usingClientFactory.gen(),
    usingClient3 = usingClientFactory.gen(),
    assert = require("assert"),
    redis = require("../lib/redis");

// TODO Test flushdb and flushall
vows.describe("Redis General Commands").addBatch({
    'selecting a new DB': {
        topic: function () {
            var client = this.client = redis.createClient();
            client.select(6, this.callback);
        },

        'should return true': function (err, result) {
            assert.isTrue(result);
        },
        teardown: function () {
            this.client.close();
            delete this.client;
        }
    },

    'the command EXISTS': usingClient({
        'on an existing key': {
            topic: function (client) {
                client.set("existing-key", "asdf");
                client.exists("existing-key", this.callback);
            },

            'should return true': function (err, doesExist) {
                assert.isTrue(doesExist);
            }
        },

        'on a non-existing key': {
            topic: function (client) {
                client.exists("non-existing-key", this.callback);
            },

            'should return false': function (err, doesExist) {
                assert.isFalse(doesExist);
            }
        }
    }),

    'the command DEL': usingClient({
        'on one existing key': {
            topic: function (client) {
                client.set("key-to-del", "foo");
                client.del("key-to-del", this.callback);
            },

            'should return 1': function (err, value) {
                assert.equal(value, 1);
            }
        },

        'on multiple existing keys': {
            topic: function (client) {
                client.set("key-to-del-1", "foo");
                client.set("key-to-del-2", "foo");
                client.del("key-to-del-1", "key-to-del-2", this.callback);
            },

            'should return 2': function (err, value) {
                assert.equal(value, 2);
            }
        },

        'on multiple existing keys via array': {
            topic: function (client) {
                client.set("key-to-del-3", "foo");
                client.set("key-to-del-4", "foo");
                client.del(["key-to-del-3", "key-to-del-4"], this.callback);
            },

            'should return 2': function (err, value) {
                assert.equal(value, 2);
            }
        },

        'on a non-existent key': {
            topic: function (client) {
                client.del("non-existent-key", this.callback);
            },

            'should return 0': function (err, value) {
                assert.equal(value, 0);
            }
        }
    }),

    'the command TYPE': usingClient({
        'when a set': {
            topic: function (client) {
                client.sadd("set-type-key", "a");
                client.type("set-type-key", this.callback);
            },
            "should return 'set'": function (err, type) {
                assert.equal(type, 'set');
            }
        },
        'when a zset': {
            topic: function (client) {
                client.zadd("zset-type-key", 2, "a");
                client.type("zset-type-key", this.callback);
            },
            "should return 'zset'": function (err, type) {
                assert.equal(type, 'zset');
            }
        },
        'when a hash': {
            topic: function (client) {
                client.hset("hash-type-key", "k", "v");
                client.type("hash-type-key", this.callback);
            },
            "should return 'hash'": function (err, type) {
                assert.equal(type, 'hash');
            }
        },
        'when a list': {
            topic: function (client) {
                client.rpush("list-type-key", "a");
                client.type("list-type-key", this.callback);
            },
            "should return 'list'": function (err, type) {
                assert.equal(type, 'list');
            }
        },
        'when a string': {
            topic: function (client) {
                client.set("string-type-key", "a");
                client.type("string-type-key", this.callback);
            },
            "should return 'string'": function (err, type) {
                assert.equal(type, 'string');
            }
        },
        'when non-existent': {
            topic: function (client) {
                client.type("non-existent-key", this.callback);
            },
            "should return 'none'": function (err, type) {
                assert.equal(type, 'none');
            }
        }
    }),

    'the command KEYS': usingClient({
        'using .* pattern matching': {
            topic: function (client) {
                client.set("star-suffix-key-1", "v1");
                client.set("star-suffix-key-2", "v2");
                client.keys("star-suffix*", this.callback);
            },

            'should return a list of all matching keys': function (err, list) {
                assert.deepEqual(list, ["star-suffix-key-1", "star-suffix-key-2"]);
            }
        },

        'using * pattern matching': {
            topic: function (client) {
                var client2 = this.client2 = redis.createClient();
                client2.select(7);
                client2.set("a", 1);
                client2.set("b", 2);
                client2.set("the 3rd key", 3);
                client2.keys("*", this.callback);
                client2.flushdb();
            },

            'should return a list of ALL keys': function (err, list) {
                assert.length(list, 3);
                ["a", "b", "the 3rd key"].forEach( function (val) {
                    assert.include(list, val);
                });
            },
            teardown: function () {
                this.client2.close();
                delete this.client2;
            }
        },

        'using ? pattern matching': {
            topic: function (client) {
                var client2 = this.client2 = redis.createClient();
                client2.select(8);
                client2.set("bar", 1);
                client2.set("car", 2);
                client2.set("dar", 3);
                client2.set("far", 4);
                client2.keys("?ar", this.callback);
                client2.flushdb();
            },

            'should return a list of all matching keys': function (err, list) {
                assert.length(list, 4);
                ["bar", "car", "dar", "far"].forEach( function (val) {
                    assert.include(list, val);
                });
            },

            teardown: function () {
                this.client2.close();
                delete this.client2;
            }
        }
    }),

    'the command RANDOMKEY': usingClient({
        topic: function (client) {
            var client2 = this.client2 = redis.createClient();
            client2.select(9);
            client2.set("foo", "bar");
            client2.set("hello", "world");
            client2.randomkey(this.callback);
            client2.flushdb();
        },

        'should return a random key': function (err, key) {
            assert.match(key, /^(foo|hello)$/);
        },
        
        teardown: function () {
            this.client2.close();
            delete this.client2;
        }
    }),

    'the command RENAME': usingClient({
        topic: function (client) {
            client.set("rename-1", "identity crisis");
            client.rename("rename-1", "rename-2", this.callback);
        },
        'should return true': function (err, val) {
            assert.isTrue(val);
        },

        'after execution, when querying the existence of the old key': {
            topic: function (_, client) {
                client.exists("rename-1", this.callback);
            },
            'should return false': function (err, doesExist) {
                assert.isFalse(doesExist);
            }
        },

        'after execution, when querying the existence of the new key': {
            topic: function (_, client) {
                client.exists("rename-2", this.callback);
            },
            'should return true': function (err, doesExist) {
                assert.isTrue(doesExist);
            }
        }
    }),

    'the command RENAMENX': usingClient({
        'renaming to a non-existing key': {
            topic: function (client) {
                client.set("rename-3", "anonymous");
                client.renamenx("rename-3", "rename-4", this.callback);
            },
            'should return 1, specifying the key was renamed': function (err, value) {
                assert.equal(value, 1);
            },
            'after execution, when querying the existence of the old key': {
                topic: function (_, client) {
                    client.exists("rename-3", this.callback);
                },
                'should return false': function (err, doesExist) {
                    assert.isFalse(doesExist);
                }
            },
            'after execution, when querying the existence of the new key': {
                topic: function (_, client) {
                    client.exists("rename-4", this.callback);
                },
                'should return true': function (err, doesExist) {
                    assert.isTrue(doesExist);
                }
            }
        },
        'renaming to an existing key': {
            topic: function (client) {
                client.set("rename-5", "anonymous");
                client.set("rename-6", "anonymous");
                client.renamenx("rename-5", "rename-6", this.callback);
            },
            'should return 0, specifying the target key already exists': function (err, value) {
                assert.equal(value, 0);
            },
            'after execution, when querying the existence of the source key': {
                topic: function (_, client) {
                    client.exists("rename-5", this.callback);
                },
                'should return true': function (err, doesExist) {
                    assert.isTrue(doesExist);
                }
            },
            'after execution, when querying the existence of the target key': {
                topic: function (_, client) {
                    client.exists("rename-6", this.callback);
                },
                'should return true': function (err, doesExist) {
                    assert.isTrue(doesExist);
                }
            }
        }
    }),

    'the command MOVE': {
        'when the key exists in the source db but not the target db': usingClient({
            topic: function (client) {
                client.rpush("db-moving-key", "a");
                client.move("db-moving-key", 5, this.callback);
            },
            'should return an integer reply of 1': function (err, reply) {
                assert.equal(reply, 1);
            },
            'after moving, when in the source database': {
                topic: function (_, client) {
                    client.exists("db-moving-key", this.callback);
                },
                'should be absent from the source database': function (err, doesExist) {
                    assert.isFalse(doesExist);
                },
                'after moving, when in the destination database': {
                    topic: function (_, _, client) {
                        var client2 = this.client2 = redis.createClient();
                        client2.select(5);
                        client2.lrange("db-moving-key", 0, -1, this.callback);
                        client2.flushdb();
                    },
                    'should appear in the destination database': function (err, list) {
                        assert.deepEqual(list, ["a"]);
                    },
                    teardown: function () {
                        this.client2.close();
                        delete this.client2;
                    }
                },
            }
        }),

        'when the key does not exist in the source db': usingClient({
            topic: function (client) {
                client.move("non-existing-db-moving-key", 5, this.callback);
            },
            'should return an integer reply of 0': function (err, reply) {
                assert.equal(reply, 0);
            }
        }),

        'when the key already exists in the target db': usingClient({
            topic: function (client) {
                client.select(5);
                client.set("existing-db-moving-key", "hi");
                client.select(6);
                client.set("existing-db-moving-key", "hi");
                client.move("non-existing-db-moving-key", 5, this.callback);
            },
            'should return an integer reply of 0': function (err, reply) {
                assert.equal(reply, 0);
            }
        })
    }
}).addBatch({
    'the command DBSIZE': usingClient2({
        topic: function (client) {
            client.flushdb();
            client.set("foo", "bar");
            client.set("hello", "world");
            client.dbsize(this.callback);
        },

        'should return the number of keys in the DB': function (err, numKeys) {
            assert.equal(numKeys, 2);
        }
    })
}).addBatch({
    'the command EXPIRE': usingClient3({
        'on a key without a current expiry': {
            topic: function (client) {
                client.set("to-expire", "foo");
                client.expire("to-expire", 2, this.callback);
            },

            'should return 1': function (err, isTimeoutSetStatus) {
                assert.equal(isTimeoutSetStatus, 1);
            },

            'after execution, before the time is up': {
                topic: function (_, client) {
                    client.exists("to-expire", this.callback);
                },

                'should evaluate the key as existing': function (err, doesExist) {
                    assert.isTrue(doesExist);
                }
            },

            'after execution, after the time is up': {
                topic: function (_, client) {
                    var self = this;
                    setTimeout(function () {
                        client.exists("to-expire", self.callback);
                    }, 3000);
                },

                'should evaluate the key as non-existing': function (err, doesExist) {
                    assert.isFalse(doesExist);
                }
            }
        },

        'on a key with a current expiry': {
            topic: function (client) {
                client.set("already-has-expiry", "foo");
                client.expire("already-has-expiry", 2);
                client.expire("already-has-expiry", 12, this.callback);
            },
            "should return 0 to specify that the timeout wasn't set since the key already has an associated timeout": function (err, isTimeoutSetStatus) {
                assert.equal(isTimeoutSetStatus, 0);
            }
        },

        'on a non-existent key': {
            topic: function (client) {
                client.expire("non-existent-key", 2, this.callback);
            },
            "should return 0 to specify that the key doesn't exist": function (err, status) {
                assert.equal(status, 0);
            }
        }
    }),

    // TODO PERSIST
    // TODO Allow passing a date object to EXPIREAT
    'the command EXPIREAT': usingClient3({
        'on a key without a current expiry': {
            topic: function (client) {
                client.set("to-expireat", "foo");
                client.expireat("to-expireat", parseInt((+new Date) / 1000, 10) + 2, this.callback);
            },

            'should return 1': function (err, isTimeoutSetStatus) {
                assert.equal(isTimeoutSetStatus, 1);
            },

            'after execution, before the time is up': {
                topic: function (_, client) {
                    client.exists("to-expireat", this.callback);
                },

                'should evaluate the key as existing': function (err, doesExist) {
                    assert.isTrue(doesExist);
                }
            },

            'after execution, after the time is up': {
                topic: function (_, client) {
                    var self = this;
                    setTimeout(function () {
                        client.exists("to-expireat", self.callback);
                    }, 3000);
                },

                'should evaluate the key as non-existing': function (err, doesExist) {
                    assert.isFalse(doesExist);
                }
            }
        },

        'on a key with a current expiry': {
            topic: function (client) {
                client.set("already-has-expiryat", "foo");
                client.expireat("already-has-expiryat", parseInt((+new Date) / 1000, 10) + 2);
                client.expireat("already-has-expiryat", parseInt((+new Date) / 1000, 10) + 12, this.callback);
            },
            "should return 0 to specify that the timeout wasn't set since the key already has an associated timeout": function (err, isTimeoutSetStatus) {
                assert.equal(isTimeoutSetStatus, 0);
            }
        },

        'on a non-existent key': {
            topic: function (client) {
                client.expireat("non-existent-key", parseInt((+new Date) / 1000, 10) + 2, this.callback);
            },
            "should return 0 to specify that the key doesn't exist": function (err, status) {
                assert.equal(status, 0);
            }
        }
    }),

    'the command TTL': usingClient3({
        'for a key with no expiry': {
            topic: function (client) {
                client.set("ttl-1", "foo");
                client.ttl("ttl-1", this.callback);
            },

            'should return -1': function (err, ttl) {
                assert.equal(ttl, -1);
            }
        },

        'for a key with an expiry': {
            topic: function (client) {
                client.setex("ttl-2", 2, "foo")
                client.ttl("ttl-2", this.callback);
            },

            'should return the remaining ttl in seconds': function (err, ttl) {
                assert.strictEqual(ttl > 0, true);
            }
        }
    })
}).export(module, {});
