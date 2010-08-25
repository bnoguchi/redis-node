var sys = require("sys"),
    vows = require("vows"),
    assert = require("assert"),
    fs = require("fs"),
    redis = require("../lib/redis"),
    ReplyStream = require("../lib/replyStream"),
    Buffer = require("buffer").Buffer;

var setupClient = function () {
    var client = redis.createClient();
    client.select(6);
    client.flushdb();
    return client;
};

var usingClient = function (subContexts) {
    var context = {topic: setupClient};
    var currSubContext;
    if (subContexts.hasOwnProperty("topic")) {
        context[""] = subContexts;
    } else {
        for (var subContextName in subContexts) {
            context[subContextName] = subContexts[subContextName];
        }
    }
    return context;
};

vows.describe("Redis").addBatch({
    'selecting a new DB': {
        topic: function () {
            var client = redis.createClient();
            client.select(6, this.callback);
        },

        'should return true': function (err, result) {
            assert.isTrue(result);
        }
    },

    'the command SET': usingClient({
        'with proper syntax': {
            topic: function (client) {
                client.set("foo", "bar", this.callback);
            },

            'should return true': function (err, result) {
                assert.equal(result, true);
            }
        }
    }),

    'the command SETNX': usingClient({
        'when no such key exists': {
            topic: function (client) {
                client.setnx("bar", "foo", this.callback);
            },

            'should succeed with 1': function (err, result) {
                assert.equal(result, 1);
            }
        },

        'when already set': {
            topic: function (client) {
                client.set("ack", "bar");
                client.setnx("ack", "notbar", this.callback);
            },

            'should fail with 0': function (err, result) {
                assert.equal(result, 0);
            }
        }
    }),

    'the command GET': usingClient({
        'when no such key exists': {
            topic: function (client) {
                client.get("non-existent", this.callback);
            },

            'should return null': function (err, result) {
                assert.equal(result, null);
            }
        },

        'when already set': {
            topic: function (client) {
                client.set("already-set", "yes");
                client.get("already-set", this.callback);
            },

            'should return the set value': function (err, result) {
                assert.equal(result, "yes");
            }
        }
    }),

    'the command MGET': usingClient({
        'retrieving multiple keys': {
            topic: function (client) {
                client.set("mget1", "a");
                client.set("mget2", "b");
                client.mget("mget1", "mget2", this.callback);
            },

            'should return the values': function (err, result) {
                assert.equal(result[0], "a");
                assert.equal(result[1], "b");
            }
        }
    
    }),

    'the command GETSET': usingClient({
        topic: function (client) {
            client.set("getset-key", "getset-from");
            client.getset("getset-key", "getset-to", this.callback);
        },

        'should return the previous value': function (err, prevValue) {
            assert.equal(prevValue, "getset-from");
        },

        'the new value': {
            topic: function (_, client) {
                client.get("getset-key", this.callback);
            },

            'should return the newly set value': function (err, newValue) {
                assert.equal(newValue, "getset-to");
            }
        }
    }),

    'setting and getting multiple bytes': usingClient({
        topic: function (client) {
            var testValue = '\u00F6\u65E5\u672C\u8A9E', // ö日本語
                buffer = new Buffer(32),
                size = buffer.utf8Write(testValue,0);
            client.set("utf8-key", buffer.slice(0, size));
            client.get("utf8-key", this.callback);
        },

        'should return the utf8 value of the buffer': function (err, result) {
            var testValue = '\u00F6\u65E5\u672C\u8A9E'; // ö日本語
            assert.equal(result, testValue);
        }
    }),

    'the command MSET': usingClient({
        'successfully': {
            topic: function (client) {
                client.mset('mset-a', 1, 'mest-b', 2, 'mset-c', 3, 'mset-d', 4, 'mset-e', 5, this.callback);
            },
            'should return 1 to indicate that al keys were set': function (err, result) {
                assert.equal(result, 1);
            }
        },
        'unsuccessfully': {
            topic: function (client) {
                client.set("mset-f", 6);
                client.mset("mset-f", 7, "mset-g", 7, this.callback);
            },
            'should return 0 to indicate that no key was set because at least 1 key already existed': function (err, result) {
                assert.equal(result, 0);
            }
        }
    }),

    'the command INFO': usingClient({
        topic: function (client) {
            client.info(this.callback);
        },

        'should return the information as a hash': function (err, info) {
            assert.isObject(info);
            ['redis_version', 'redis_git_sha1', 'redis_git_dirty', 'arch_bits', 'multiplexing_api', 'process_id', 'uptime_in_seconds', 'uptime_in_days', 'connected_clients', 'connected_slaves', 'blocked_clients', 'used_memory', 'used_memory_human', 'changes_since_last_save', 'bgsave_in_progress', 'last_save_time', 'bgrewriteaof_in_progress', 'total_connections_received', 'total_commands_processed', 'expired_keys', 'hash_max_zipmap_entries', 'hash_max_zipmap_value', 'pubsub_channels', 'pubsub_patterns', 'vm_enabled', 'role', 'db6'].forEach( function (key) {
                assert.include(info, key);
                assert.isString(info[key]);
            });
        }
    }),

    'the command INCR': usingClient({
        'incrementing an undefined key': {
            topic: function (client) {
                client.incr("counter", this.callback);
            },

            'should return 1': function (err, value) {
                assert.equal(value, 1);
            },

            'incrementing a defined key with value 1': {
                topic: function (_, client) {
                    client.incr("counter", this.callback);
                },

                'should return 2': function (err, value) {
                    assert.equal(value, 2);
                }
            }
        }
    }),

    'the command INCRBY': usingClient({
        'incrementing 1 by 2': {
            topic: function (client) {
                client.incr("incrby-key");
                client.incrby("incrby-key", 2, this.callback);
            },

            'should return 3': function (err, value) {
                assert.equal(value, 3);
            },

            'incrementing 3 by -1': {
                topic: function (_, client) {
                    client.incrby("incrby-key", -1, this.callback);
                },

                'should return 2': function (err, value) {
                    assert.equal(value, 2);
                }
            }
        }
    }),

    'the command DECR': usingClient({
        'decrementing an undefined key': {
            topic: function (client) {
                client.decr("decr-key", this.callback);
            },

            'should return -1': function (err, value) {
                assert.equal(value, -1);
            },

            'decrementing a defined key with value -1': {
                topic: function (_, client) {
                    client.decr("decr-key", this.callback);
                },

                'should return -2': function (err, value) {
                    assert.equal(value, -2);
                }
            }
        }
    }),

    'the command DECRBY': usingClient({
        'decrementing 10 by 4': {
            topic: function (client) {
                client.incrby("decrby-key", 10);
                client.decrby("decrby-key", 4, this.callback);
            },

            'should return 6': function (err, value) {
                assert.equal(value, 6);
            },

            'decrementing 6 by -3': {
                topic: function (_, client) {
                    client.decrby("decrby-key", -3, this.callback);
                },

                'should return 9': function (err, value) {
                    assert.equal(value, 9);
                }
            }
        }
    }),

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

        'on a non-existent key': {
            topic: function (client) {
                client.del("non-existent-key", this.callback);
            },

            'should return 0': function (err, value) {
                assert.equal(value, 0);
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
                client.select(7);
                client.set("a", 1);
                client.set("b", 2);
                client.set("the 3rd key", 3);
                client.keys("*", this.callback);
                client.flushdb();
            },

            'should return a list of ALL keys': function (err, list) {
                assert.length(list, 3);
                ["a", "b", "the 3rd key"].forEach( function (val) {
                    assert.include(list, val);
                });
            }
        },

        'using ? pattern matching': {
            topic: function (client) {
                client.select(8);
                client.set("bar", 1);
                client.set("car", 2);
                client.set("dar", 3);
                client.set("far", 4);
                client.keys("?ar", this.callback);
                client.flushdb();
            },

            'should return a list of all matching keys': function (err, list) {
                assert.length(list, 4);
                ["bar", "car", "dar", "far"].forEach( function (val) {
                    assert.include(list, val);
                });
            }
        }
    }),

    'the command RANDOMKEY': usingClient({
        topic: function (client) {
            client.select(9);
            client.set("foo", "bar");
            client.set("hello", "world");
            client.randomkey(this.callback);
            client.flushdb();
        },

        'should return a random key': function (err, key) {
            assert.match(key, /^(foo|hello)$/);
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

    // TODO EXPIREAT
    'the command EXPIRE': usingClient({
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

    'the command SETEX': usingClient({
        topic: function (client) {
            client.setex("to-expire-1", 2, "foo", this.callback);
        },

        'should return true': function (err, status) {
            assert.isTrue(status);
        },

        'after execution, before the time is up': {
            topic: function (_, client) {
                client.exists("to-expire-1", this.callback);
            },

            'should evaluate the key as existing': function (err, doesExist) {
                assert.isTrue(doesExist);
            }
        },

        'after execution, after the time is up': {
            topic: function (_, client) {
                var self = this;
                setTimeout(function () {
                    client.exists("to-expire-1", self.callback);
                }, 3000);
            },

            'should evaluate the key as non-existing': function (err, doesExist) {
                assert.isFalse(doesExist);
            }
        }
    }),

    'the command TTL': usingClient({
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
    }),

    'the command RPUSH': usingClient({
        'on a non-existent key': {
            topic: function (client) {
                client.rpush('list-1', 'foo', this.callback);
            },
            'should return 1 representing the list length after the push': function (err, length) {
                assert.equal(length, 1);
            },
            'on an existing key of type list': {
                topic: function (_, client) {
                    client.rpush('list-1', 'bar', this.callback);
                },
                'should return 2 representing the list length after the push': function (err, length) {
                    assert.equal(length, 2);
                }
            }
        },
        'on an existing key not of type list': {
            topic: function (client) {
                client.set("non-list", 5);
                client.rpush("non-list", "bar", this.callback);
            },

            'should result in an error': function (err, val) {
                assert.instanceOf(err, Error);
                assert.isUndefined(val);
            }
        }
    }),

    'the command LPUSH': usingClient({
        topic: function (client) {
            client.lpush('list-2', 'foo', this.callback);
        },
        'should return 1 representing the list length after the push': function (err, length) {
            assert.equal(length, 1);
        }
    }),

    'the command LLEN': usingClient({
        topic: function (client) {
            client.rpush('list-3', 1);
            client.rpush('list-3', 2);
            client.rpush('list-3', 3);
            client.llen('list-3', this.callback);
        },

        'should return the length of the list': function (err, length) {
            assert.equal(length, 3);
        }
    }),

    'the command LRANGE': usingClient({
        topic: function (client) {
            client.rpush('list-4', 1);
            client.rpush('list-4', 2);
            client.rpush('list-4', 3);
            client.rpush('list-4', 4);
            return client;
        },
        'from 0 to -1': {
            topic: function (client) {
                client.lrange('list-4', 0, -1, this.callback);
            },
            'should return the entire list': function (err, list) {
                assert.deepEqual(list, [1, 2, 3, 4]);
            }
        },
        'from 0 to 0': {
            topic: function (client) {
                client.lrange('list-4', 0, 0, this.callback);
            },
            'should return a 1-element list of the 1st element': function (err, list) {
                assert.deepEqual(list, [1]);
            },
        },
        'from -1 to -1': {
            topic: function (client) {
                client.lrange('list-4', -1, -1, this.callback);
            },
            'should return a 1-element list of the last element': function (err, list) {
                assert.deepEqual(list, [4]);
            }
        }
    }),

    'the command LTRIM': usingClient({
        topic: function (client) {
            client.rpush('list-5', 1);
            client.rpush('list-5', 2);
            client.rpush('list-5', 3);
            client.rpush('list-5', 4);
            return client;
        },

        'from 0 to 1': {
            topic: function (client) {
                client.ltrim('list-5', 0, 1, this.callback);
            },

            'should return true': function (err, status) {
                assert.isTrue(status);
            },

            'after execution, reading the list': {
                topic: function (_, client) {
                    client.lrange('list-5', 0, -1, this.callback);

                },
                'should result in the modified list': function (err, list) {
                    assert.deepEqual(list, [1, 2]);
                }
            }
        }
    }),

    'the command LINDEX': usingClient({
        topic: function (client) {
            client.rpush('list-6', 1);
            client.rpush('list-6', 2);
            client.rpush('list-6', 3);
            client.rpush('list-6', 4);
            return client;
        },

        'with a positive in-range index': {
            topic: function (client) {
                client.lindex('list-6', 2, this.callback);
            },
            'should return the member at the specified index': function (err, val) {
                assert.equal(val, 3);
            }
        },

        'with a negative in-range index': {
            topic: function (client) {
                client.lindex('list-6', -3, this.callback);
            },
            'should return the member at the specified index': function (err, val) {
                assert.equal(val, 2);
            }
        },

        'with an out of range index': {
            topic: function (client) {
                client.lindex('list-6', 4, this.callback);
            },
            'should return the member at the specified index': function (err, val) {
                assert.isNull(val);
            }
        },

        'with a non-list key': {
            topic: function (client) {
                client.set("non-list-key", "hey");
                client.lindex("non-list-key", 0, this.callback);
            },
            'should return an error': function (err, val) {
                assert.instanceOf(err, Error);
            }
        }
    }),

    'the command LSET': usingClient({
        topic: function (client) {
            client.rpush('list-7', 1);
            client.rpush('list-7', 2);
            client.rpush('list-7', 3);
            client.rpush('list-7', 4);
            return client;
        },

        'with a positive in-range index': {
            topic: function (client) {
                client.lset('list-7', 3, 100, this.callback);
            },
            'should return true': function (err, status) {
                assert.isTrue(status);
            },
            'after execution, the value of the list member at the index': {
                topic: function (_, client) {
                    client.lindex('list-7', 3, this.callback);
                },
                'should return the new value': function (err, status) {
                    assert.equal(status, 100);
                }
            }
        },

        'with a negative in-range index': {
            topic: function (client) {
                client.lset('list-7', -3, 150, this.callback);
            },
            'should return true': function (err, status) {
                assert.isTrue(status);
            },
            'after execution, the value of the list member at the index': {
                topic: function (_, client) {
                    client.lindex('list-7', 1, this.callback);
                },
                'should return the new value': function (err, status) {
                    assert.equal(status, 150);
                }
            }
        },

        'with an out of range index': {
            topic: function (client) {
                client.lset('list-7', 4, 200, this.callback);
            },
            'should generate an error': function (err, val) {
                assert.instanceOf(err, Error);
            }
        }
    }),

    'the command LREM': usingClient({
        topic: function (client) {
            client.rpush('list-8', 1);
            client.rpush('list-8', 2);
            client.rpush('list-8', 1);
            client.rpush('list-8', 2);
            client.rpush('list-8', 1);
            client.rpush('list-8', 2);
            return client;
        },

        'with positive count': {
            topic: function (client) {
                client.lrem("list-8", 1, 2, this.callback);
            },
            'should return the number of removed elements': function (err, numRemoved) {
                assert.equal(numRemoved, 1);
            },
            'after execution, when querying the new list': {
                topic: function (_, client) {
                    client.lrange('list-8', 0, -1, this.callback);
                },
                'should read it correctly': function (err, list) {
                    assert.deepEqual(list, [1, 1, 2, 1, 2]);
                }
            },

            'with negative count': {
                topic: function (_, client) {
                    client.lrem("list-8", -1, 2, this.callback);
                },
                'should return the number of removed elements': function (err, numRemoved) {
                    assert.equal(numRemoved, 1);
                },
                'after execution, when querying the new list': {
                    topic: function (_, _, client) {
                        client.lrange('list-8', 0, -1, this.callback);
                    },
                    'should read it correctly': function (err, list) {
                        assert.deepEqual(list, [1, 1, 2, 1]);
                    }
                },

                'with count 0': {
                    topic: function (_, _, client) {
                        client.lrem("list-8", 0, 1, this.callback);
                    },
                    'should return the number of removed elements': function (err, numRemoved) {
                        assert.equal(numRemoved, 3);
                    },
                    'after execution, when querying the new list': {
                        topic: function (_, _, _, client) {
                            client.lrange('list-8', 0, -1, this.callback);
                        },
                        'should read it correctly': function (err, list) {
                            assert.deepEqual(list, [2]);
                        }
                    }
                }
            }
        }
    }),

    'the command LPOP': usingClient({
        'for an existing key in a non-empty list': {
            topic: function (client) {
                client.rpush('list-9', 1);
                client.rpush('list-9', 2);
                client.lpop('list-9', this.callback);
            },
            'should return the recently popped first element': function (err, val) {
                assert.equal(val, 1);
            }
        },
        'for an existing key in an empty list': {
            topic: function (client) {
                client.rpush('list-10', 1);
                client.lpop('list-10');
                client.lpop('list-10', this.callback);
            },
            'should return null': function (err, val) {
                assert.isNull(val);
            }
        },
        'for a non-existing key': {
            topic: function (client) {
                client.lpop('non-existent-key', this.callback);
            },
            'should return null': function (err, val) {
                assert.isNull(val);
            }
        }
    }),

    'the command RPOP': usingClient({
        'for an existing key in a non-empty list': {
            topic: function (client) {
                client.rpush('list-11', 1);
                client.rpush('list-11', 2);
                client.rpop('list-11', this.callback);
            },
            'should return the recently popped last element': function (err, val) {
                assert.equal(val, 2);
            }
        },
        'for an existing key in an empty list': {
            topic: function (client) {
                client.rpush('list-12', 1);
                client.rpop('list-12');
                client.rpop('list-12', this.callback);
            },
            'should return null': function (err, val) {
                assert.isNull(val);
            }
        },
        'for a non-existing key': {
            topic: function (client) {
                client.rpop('non-existent-key', this.callback);
            },
            'should return null': function (err, val) {
                assert.isNull(val);
            }
        }
    }),

    // TODO BRPOP, BLPOP
    // TODO Make the tests more extensive
    'the command RPOPLPUSH': usingClient({
        topic: function (client) {
            client.rpush('list-13', 1);
            client.rpush('list-13', 2);
            client.rpush('list-13', 3);
            client.rpush('list-13', 4);
            client.rpush('list-14', 100);
            client.rpoplpush('list-13', 'list-14', this.callback);
        },
        'should return the transferred value': function (err, val) {
            assert.equal(val, 4);
        },
        'after execution, when querying the source list': {
            topic: function (_, client) {
                client.lrange('list-13', 0, -1, this.callback);
            },
            'should read the new list': function (err, list) {
                assert.deepEqual(list, [1, 2, 3]);
            }
        },
        'after execution, when querying the destination list': {
            topic: function (_, client) {
                client.lrange('list-14', 0, -1, this.callback);
            },
            'should read the new list': function (err, list) {
                assert.deepEqual(list, [4, 100]);
            }
        }
    }),

    'the command SADD': usingClient({
        "adding a member to a set that doesn't contain it": {
            topic: function (client) {
                client.sadd('set-1', 1, this.callback);
            },
            'should return status 1': function (err, status) {
                assert.equal(status, 1)
            },

            "adding a member to a set that does contain it": {
                topic: function (_, client) {
                    client.sadd('set-1', 1, this.callback);
                },
                'should return status 0': function (err, status) {
                    assert.equal(status, 0)
                }
            }
        }
    }),

    'the command SISMEMBER': usingClient({
        topic: function (client) {
            client.sadd('set-2', 1);
            return client;
        },
        'querying for a member': {
            topic: function (client) {
                client.sismember('set-2', 1, this.callback);
            },

            'should return status 1': function (err, result) {
                assert.equal(result, 1);
            }
        },
        'querying for a non-member': {
            topic: function (client) {
                client.sismember('set-2', 2, this.callback);
            },

            'should return status 0': function (err, result) {
                assert.equal(result, 0);
            }
        }
    }),

    'the command SCARD': usingClient({
        topic: function (client) {
            client.sadd('set-3', 10);
            client.sadd('set-3', 20);
            client.scard('set-3', this.callback);
        },
        'should return the size of the set': function (err, cardinality) {
            assert.equal(cardinality, 2);
        }
    }),

    'the command SREM': usingClient({
        topic:  function (client) {
            client.sadd('set-4', 10);
            client.sadd('set-4', 20);
            return client;
        },
        'removing an existing member': {
            topic: function (client) {
                client.srem('set-4', 20, this.callback);
            },
            'should return with status 1': function (err, status) {
                assert.equal(status, 1);
            }
        },
        'attempting to remove a non-member': {
            topic: function (client) {
                client.srem('set-4', 314, this.callback);
            },
            'should return with status 0': function (err, status) {
                assert.equal(status, 0);
            }
        }
    }),

    'the command SPOP': usingClient({
        topic: function (client) {
            client.sadd('set-5', "cat");
            client.sadd('set-5', "dog");
            client.spop('set-5', this.callback);
        },
        'should remove a random element': function (err, val) {
            assert.match(val, /^(cat|dog)$/);
        }
    }),

    'the command SDIFF': usingClient({
        topic: function (client) {
            [1, 2, 3, 4, 5].forEach( function (n) {
                client.sadd('set-6', n);
            });

            [4, 5, 6, 7, 8].forEach( function (n) {
                client.sadd('set-7', n);
            });
            
            client.sdiff('set-6', 'set-7', this.callback);
        },

        'should return the different between the 2 sets': function (err, list) {
            [1, 2, 3].forEach( function (n) {
                assert.include(list, n.toString()); // TODO Can I get by without toString?
            });
        }
    }),

    'the command SDIFFSTORE': usingClient({
        topic: function (client) {
            [1, 2, 3, 4, 5].forEach( function (n) {
                client.sadd('set-8', n);
            });

            [4, 5, 6, 7, 8].forEach( function (n) {
                client.sadd('set-9', n);
            });
            
            client.sdiffstore('set-10', 'set-8', 'set-9', this.callback);
        },
        'should return the number of members in the diff list': function (err, card) {
            assert.equal(card, 3);
        },
        'after executing, when querying the destination key': {
            topic: function (_, client) {
                client.smembers('set-10', this.callback);
            },
            'should return the correct diff': function (err, list) {
                [1, 2, 3].forEach( function (n) {
                    assert.include(list, n.toString());
                });
            }
        }
    }),

    'the command SMEMBERS': usingClient({
        topic: function (client) {
            client.sadd('set-11', 'a');
            client.sadd('set-11', 'c');
            client.sadd('set-11', 'e');
            client.smembers('set-11', this.callback);
        },
        'should return the members of the set': function (err, list) {
            ['a', 'c', 'e'].forEach( function (member) {
                assert.include(list, member);
            });
        }
    }),

    'the command SMOVE': usingClient({
        topic: function (client) {
            client.sadd('set-12', 'a');
            client.sadd('set-12', 'b');
            client.sadd('set-12', 'c');

            client.sadd('set-13', 'x');
            client.sadd('set-13', 'y');
            client.sadd('set-13', 'z');

            return client;
        },
        'on a member': {
            topic: function (client) {
                client.smove('set-12', 'set-13', 'a', this.callback);
            },
            'should return with integer reply 1': function (err, reply) {
                assert.equal(reply, 1);
            },
            'after executing, when querying the source set': {
                topic: function (_, client) {
                    client.sismember('set-12', 'a', this.callback);
                },
                'should specify that the moved element is not present': function (err, isPresent) {
                    assert.equal(isPresent, 0);
                }
            },
            'after executing, when querying the destination set': {
                topic: function (_, client) {
                    client.sismember('set-13', 'a', this.callback);
                },
                'should specify that the moved element is present': function (err, isPresent) {
                    assert.equal(isPresent, 1);
                }
            },
            'after executing, when querying the destination set': {
            }
        },
        'on a non-member': {
            topic: function (client) {
                client.smove('set-12', 'set-13', 'r', this.callback);
            },
            'should return with integer reply 0': function (err, reply) {
                assert.equal(reply, 0);
            }
        }
    }),

    'the command SINTER': usingClient({
        topic: function (client) {
            [1, 2, 3, 4, 5].forEach( function (n) {
                client.sadd('set-14', n);
            });

            [4, 5, 6, 7, 8].forEach( function (n) {
                client.sadd('set-15', n);
            });
            
            [5, 100, 101, 102].forEach( function (n) {
                client.sadd('set-16', n);
            });
            
            client.sinter('set-14', 'set-15', 'set-16', this.callback);
        },
        'should return the intersection': function (err, intersection) {
            assert.deepEqual(intersection, ['5']);
        }
    }),

    'the command SINTERSTORE': usingClient({
        topic: function (client) {
            [1, 2, 3, 4, 5].forEach( function (n) {
                client.sadd('set-17', n);
            });

            [4, 5, 6, 7, 8].forEach( function (n) {
                client.sadd('set-18', n);
            });
            
            client.sinterstore('set-19', 'set-17', 'set-18', this.callback);
        },
        'should return the number of members in the intersection': function (err, card) {
            assert.equal(card, 2);
        },
        'after executing, when querying the destination key': {
            topic: function (_, client) {
                client.smembers('set-19', this.callback);
            },
            'should return the correct intersection': function (err, list) {
                [4, 5].forEach( function (n) {
                    assert.include(list, n.toString());
                });
            }
        }
    }),

    'the command SUNION': usingClient({
        topic: function (client) {
            [1, 2, 3, 4, 5].forEach( function (n) {
                client.sadd('set-20', n);
            });

            [4, 5, 6, 7, 8].forEach( function (n) {
                client.sadd('set-21', n);
            });
            
            [5, 100, 101, 102].forEach( function (n) {
                client.sadd('set-22', n);
            });
            
            client.sunion('set-20', 'set-21', 'set-22', this.callback);
        },
        'should return the union': function (err, intersection) {
            assert.length(intersection, 11);
            [1, 2, 3, 4, 5, 6, 7, 8, 100, 101, 102].forEach( function (n) {
                assert.include(intersection, n.toString());
            });
        }
    }),

    'the command SUNIONSTORE': usingClient({
        topic: function (client) {
            [1, 2, 3, 4, 5].forEach( function (n) {
                client.sadd('set-23', n);
            });

            [4, 5, 6, 7, 8].forEach( function (n) {
                client.sadd('set-24', n);
            });
            
            client.sunionstore('set-25', 'set-23', 'set-24', this.callback);
        },
        'should return the number of members in the union': function (err, card) {
            assert.equal(card, 8);
        },
        'after executing, when querying the destination key': {
            topic: function (_, client) {
                client.smembers('set-25', this.callback);
            },
            'should return the correct union': function (err, list) {
                [1, 2, 3, 4, 5, 6, 7, 8].forEach( function (n) {
                    assert.include(list, n.toString());
                });
            }
        }
    }),
    // TODO SRANDMEMBER

    // TODO What about hash and zset types?
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

    'the command MOVE': usingClient({
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
                    client.select(5);
                    client.lrange("db-moving-key", 0, -1, this.callback);
                    client.flushdb();
                },
                'should appear in the destination database': function (err, list) {
                    assert.deepEqual(list, ["a"]);
                }
            },
        }
    }),

    'the command SORT': usingClient({
        'on a list of strings': {
            topic: function (client) {
                client.rpush("sortable-string-list", "a");
                client.rpush("sortable-string-list", "b");
                client.rpush("sortable-string-list", "c");
                return client;
            },
            'sorting in ascending order': {
                topic: function (client) {
                    client.sort('sortable-string-list', {order: 'asc', alpha: true}, this.callback);
                },
                'should return a list sorted in ascending alphabetic order': function (err, list) {
                    assert.deepEqual(list, ["a", "b", "c"]);
                }
            },
            'sorting in descending order': {
                topic: function (client) {
                    client.sort('sortable-string-list', {order: 'desc', alpha: true}, this.callback);
                },
                'should return a list sorted in descending alphabetic order': function (err, list) {
                    assert.deepEqual(list, ["c", "b", "a"]);
                }
            }
        },
        'on a list of numbers': {
            topic: function (client) {
                client.rpush('sortable-number-list', 1);
                client.rpush('sortable-number-list', 2);
                client.rpush('sortable-number-list', 3);
                return client;
            },
            'sorting in ascending order': {
                topic: function (client) {
                    client.sort('sortable-number-list', {order: 'asc'}, this.callback);
                },
                'should return a list sorted in ascending numeric order': function (err, list) {
                    assert.deepEqual(list, [1, 2, 3]);
                }
            },
            'sorting in descending order': {
                topic: function (client) {
                    client.sort('sortable-number-list', {order: 'desc'}, this.callback);
                },
                'should return a list sorted in descending numeric order': function (err, list) {
                    assert.deepEqual(list, [3, 2, 1]);
                }
            },

            'using external weights with the BY pattern': {
                topic: function (client) {
                    client.set('weight1', 2);
                    client.set('weight2', 3);
                    client.set('weight3', 1);
                    return client;
                },
                'sorting in ascending order by weight': {
                    topic: function (client) {
                        client.sort('sortable-number-list', {order: 'asc', by: 'weight*'}, this.callback);
                    },
                    'should return a list sorted in ascending weighted order': function (err, list) {
                        assert.deepEqual(list, [3, 1, 2]);
                    }
                },
                'sorting in descending order by weight': {
                    topic: function (client) {
                        client.sort('sortable-number-list', {order: 'desc', by: 'weight*'}, this.callback);
                    },
                    'should return a list sorted in descending weighted order': function (err, list) {
                        assert.deepEqual(list, [2, 1, 3]);
                    }
                },

                'using the GET pattern': {
                    topic: function (client) {
                        client.set('deref1', 'a');
                        client.set('deref2', 'b');
                        client.set('deref3', 'c');
                        client.set('2deref1', 'd');
                        client.set('2deref2', 'e');
                        client.set('2deref3', 'f');
                        return client;
                    },
                    'sorting in ascending order by weight with a GET pattern': {
                        topic: function (client) {
                            client.sort('sortable-number-list', {order: 'asc', by: 'weight*', get: 'deref*'}, this.callback);
                        },
                        'should return a list of dereferenced values sorted in ascending weight order': function (err, list) {
                            assert.deepEqual(list, ['c', 'a', 'b']);
                        }
                    },
                    'sorting in descending order by weight with a GET pattern': {
                        topic: function (client) {
                            client.sort('sortable-number-list', {order: 'desc', by: 'weight*', get: 'deref*'}, this.callback);
                        },
                        'should return a list of dereferenced values sorted in descending weight order': function (err, list) {
                            assert.deepEqual(list, ['b', 'a', 'c']);
                        }
                    },

                    'sorting in ascending order by weight with 2 GET patterns': {
                        topic: function (client) {
                            client.sort('sortable-number-list', {order: 'asc', by: 'weight*', get: ['deref*', '2deref*']}, this.callback);
                        },
                        'should return a list of dereferenced values sorted in ascending weight order': function (err, list) {
                            assert.deepEqual(list, ['c', 'f', 'a', 'd', 'b', 'e']);
                        }
                    },

                    'storing the resulting list': {
                        topic: function (client) {
                            client.sort('sortable-number-list', {order: 'asc', by: 'weight*', get: 'deref*', store: 'write-to-from-sort-key'}, this.callback);
                        },
                        'should return an integer result': function (err, result) {
                            assert.equal(result, 3);
                        },

                        'after executing, attempting to query the destination key': {
                            topic: function (_, client) {
                                client.lrange('write-to-from-sort-key', 0, -1, this.callback);
                            },
                            'should read the proper list': function (err, list) {
                                assert.deepEqual(list, ['c', 'a', 'b']);
                            }
                        }
                    }
                }
            }
        }
    }),

    // TODO Test BGSAVE
    'the command SAVE': usingClient({
        topic: function (client) {
            client.save(this.callback);
        },
        'should return a true status': function (err, status) {
            assert.isTrue(status);
        }
    }),

    'the command LASTSAVE': usingClient({
        topic: function (client) {
            client.save();
            client.lastsave(this.callback);
        },
        'should return the integer unix timestamp of the last successful save': function (err, timestamp) {
            assert.deepEqual(timestamp > 0, true);
        }
    })
}).addBatch({
    'the command DBSIZE': usingClient({
        topic: function (client) {
            client.set("foo", "bar");
            client.set("hello", "world");
            client.dbsize(this.callback);
        },

        'should return the number of keys in the DB': function (err, numKeys) {
            assert.equal(numKeys, 2);
        }
    })
}).export(module, {});
