var vows = require("vows"),
    usingClient = require("./utils").usingClient.gen(),
    assert = require("assert"),
    redis = require("../lib/redis");

vows.describe("Redis Sort Commands").addBatch({
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
    })
}).export(module, {});
