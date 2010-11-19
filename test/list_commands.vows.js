var vows = require("vows"),
    usingClient = require("./utils").usingClient.gen(),
    assert = require("assert"),
    redis = require("../lib/redis");

vows.describe("Redis List Commands").addBatch({
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

    // Symmetric to BRPOP
    'the command BLPOP': usingClient({
        'on a non-empty list': {
            topic: function (client) {
                client.rpush("non-empty-list", "a");
                client.blpop("non-empty-list", 2, this.callback);
            },
            'should return a 2-element array [key, popped value]': function (err, element) {
                assert.deepEqual(element, ["non-empty-list", "a"]);
            }
        },
        'on an empty list': {
            topic: function (client) {
                client.blpop("empty-list", 2, this.callback);
            },
            'should return null after the timeout': function (err, nil) {
                assert.isNull(nil);
            },

            'and then an element is pushed onto that list by another client': {
                topic: function (_, client) {
                    var client2 = this.client2 = redis.createClient();
                    client2.select(6);
                    client.blpop("list-to-add-1-to", 2, this.callback);
                    client2.rpush("list-to-add-1-to", "just-in-time");
                },
                'should pop off the newly pushed element and return [key, elt]': function (err, result) {
                    assert.deepEqual(result, ["list-to-add-1-to", "just-in-time"]);
                },
                teardown: function () {
                    this.client2.close();
                    delete this.client2;
                }
            }
        },
        'on a series of empty and non-empty lists': {
            topic: function (client) {
                client.rpush("non-empty-list-1", "a");
                client.rpush("non-empty-list-2", "b");
                client.blpop("empty-list", "non-empty-list-1", "non-empty-list-2", 2, this.callback);
            },
            'should return a 2-element array [key, popped value] from the first non-empty key': function (err, result) {
                assert.deepEqual(result, ["non-empty-list-1", "a"]);
            }
        }
    }),

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
    })
}).export(module, {});
