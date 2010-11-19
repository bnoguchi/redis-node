var vows = require("vows"),
    usingClient = require("./utils").usingClient.gen(),
    assert = require("assert"),
    redis = require("../lib/redis");

vows.describe("Redis Set Commands").addBatch({
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
            return client;
        },
        'on multiple existing keys': {
            topic: function (client) {
                client.sinter('set-14', 'set-15', 'set-16', this.callback);
            },
            'should return the intersection': function (err, intersection) {
                assert.deepEqual(intersection, ['5']);
            }
        },
        'on multiple existing keys via array': {
            topic: function (_, client) {
                client.sinter(['set-14', 'set-15', 'set-16'], this.callback);
            },
            'should return the intersection': function (err, intersection) {
                assert.deepEqual(intersection, ['5']);
            }
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
            return client;
        },
        'on multiple existing keys': {
            topic: function (client) {
                client.sunion('set-20', 'set-21', 'set-22', this.callback);
            },
            'should return the union': function (err, intersection) {
                assert.length(intersection, 11);
                [1, 2, 3, 4, 5, 6, 7, 8, 100, 101, 102].forEach( function (n) {
                    assert.include(intersection, n.toString());
                });
            }
        },
        'on multiple existing keys via array': {
            topic: function (_, client) {
                client.sunion(['set-20', 'set-21', 'set-22'], this.callback);
            },
            'should return the union': function (err, intersection) {
                assert.length(intersection, 11);
                [1, 2, 3, 4, 5, 6, 7, 8, 100, 101, 102].forEach( function (n) {
                    assert.include(intersection, n.toString());
                });
            }
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

    'the command SRANDMEMBER': usingClient({
        'on a non-empty set': {
            topic: function (client) {
                ['a', 'b', 'c'].forEach( function (l) {
                    client.sadd('set-to-rand', l);
                });
                client.srandmember('set-to-rand', this.callback);
            },
            'should return a random member of the set': function (err, member) {
                assert.match(member, /^(a|b|c)$/);
            }
        },
        'on an empty set': {
            topic: function (client) {
                client.sadd('empty-set', 'a');
                client.spop('empty-set');
                client.srandmember('empty-set', this.callback);
            },
            'should return null': function (err, nil) {
                assert.isNull(nil);
            }
        },
        'on a non-existent key': {
            topic: function (client) {
                client.srandmember('non-existing-key', this.callback);
            },
            'should return null': function (err, nil) {
                assert.isNull(nil);
            }
        }
    }),
}).export(module, {});
