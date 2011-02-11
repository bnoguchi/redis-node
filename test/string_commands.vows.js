var vows = require("vows"),
    usingClient = require("./utils").usingClient.gen(),
    usingClient2 = require("./utils").usingClient.gen(),
    assert = require("assert"),
    redis = require("../lib/redis"),
    fs = require("fs"),
    Buffer = require("buffer").Buffer;

vows.describe("Redis String Commands").addBatch({
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

    'setting and getting special characters': usingClient({
        topic: function (client) {
            var specialJson = JSON.stringify({'a': 'ö'});
            client.set("special-json", specialJson);
            client.get("special-json", this.callback);
        },

        'should return the same special characters': function (err, result) {
            var specialJson = JSON.stringify({'a': 'ö'});
            console.log(specialJson);
            console.log(specialJson.length);
            assert.equal(result, specialJson);
        }
    }),

    'setting and getting multiple bytes': usingClient({
        topic: function (client) {
            var testValue = '\u00F6\u65E5\u672C\u8A9E', // ö日本語
                buffer = new Buffer(32),
                size = buffer.write(testValue,0, "utf8");
            client.set("utf8-key", buffer.slice(0, size));
            client.get("utf8-key", this.callback);
        },

        'should return the utf8 value of the buffer': function (err, result) {
            var testValue = '\u00F6\u65E5\u672C\u8A9E'; // ö日本語
            assert.equal(result, testValue);
        }
    }),

    'setting large blobs': usingClient({
        topic: function (client) {
            var self = this;
            fs.readFile(__filename, function (err, fileContents) {    // no encoding = Buffer
                client.set("largetestfile", fileContents, self.callback);
            });
        },
        'should return with a true (+OK) status': function (err, status) {
            assert.isTrue(status);
        },
        'and getting large blobs too': {
            topic: function (_, client) {
                client.get("largetestfile", this.callback);
            },
            'should return the entire large blob back': function (err, str) {
                fs.readFile(__filename, function (err, fileContents) {
                    assert.equal(str, fileContents);
                });
            }
        }
    }),

    // This test is borrowed and adapted from one in node-redis-client
    // To test binary safe values
    'setting an image': usingClient({
        topic: function (client) {
            var paths = [ "sample.png", "test/sample.png" ],
                path = paths.shift();
            while (true) {
              try {
                var fileContents = fs.readFileSync(path, 'binary');
                break;
              } catch (e) {
                path = paths.shift();
              }
            }
            var imageBuffer = new Buffer(Buffer.byteLength(fileContents, 'binary'));
            imageBuffer.write(fileContents, 0, "binary");

            client.set('png_image', imageBuffer, this.callback);
        },
        'should return a true (+OK) status': function (err, status) {
            assert.isTrue(status);
        },
        'and then getting the image, too': {
            topic: function (_, client) {
                client.get('png_image', {encoding: "binary"}, this.callback);
            },
            'should return the entire image': function (err, value) {
                var paths = [ "sample.png", "test/sample.png" ],
                    path = paths.shift();
                while (true) {
                  try {
                    var fileContents = fs.readFileSync(path, 'binary');
                    break;
                  } catch (e) {
                    path = paths.shift();
                  }
                }
                var imageBuffer = new Buffer(Buffer.byteLength(fileContents, 'binary'));
                imageBuffer.write(fileContents, 0, "binary");

                // TODO Make value binary a Buffer vs the current binary string?
                assert.equal(value, imageBuffer.toString("binary"));
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

    'the command MSET': usingClient({
        topic: function (client) {
            client.mset('mset-a', 1, 'mset-b', 2, 'mset-c', 3, 'mset-d', 4, 'mset-e', 5, this.callback);
        },
        'should return with status code true (+OK)': function (err, status) {
            assert.isTrue(status);
        }
    }),

    'the command MSETNX': usingClient({
        'successfully': {
            topic: function (client) {
                client.msetnx('msetnx-a', 1, 'msetnx-b', 2, 'msetnx-c', 3, 'msetnx-d', 4, 'msetnx-e', 5, this.callback);
            },
            'should return 1 to indicate that all keys were set': function (err, result) {
                assert.equal(result, 1);
            }
        },
        'unsuccessfully': {
            topic: function (client) {
                client.set("msetnx-f", 6);
                client.msetnx("msetnx-f", 7, "msetnx-g", 7, this.callback);
            },
            'should return 0 to indicate that no key was set because at least 1 key already existed': function (err, result) {
                assert.equal(result, 0);
            }
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

    'the command APPEND': usingClient({
        'for an existing key': {
            topic: function (client) {
                client.set("appendable-key", "the cat in the");
                client.append("appendable-key", " hat", this.callback);
            },
            'should return the new string length': function (err, length) {
                assert.equal(length, "the cat in the hat".length);
            },
            'after executing, when querying the new string': {
                topic: function (_, client) {
                    client.get('appendable-key', this.callback);
                },
                'should return the new string': function (err, str) {
                    assert.equal(str, "the cat in the hat");
                }
            }
        },

        'for a non existing key': {
            topic: function (client) {
                client.append('unwritten-appendable-key', "hey", this.callback);
            },
            'should return the length of the suffix': function (err, str) {
                assert.equal(str, "hey".length);
            },
            'after executing, when querying the new string': {
                topic: function (_, client) {
                    client.get('unwritten-appendable-key', this.callback);
                },
                'should return the new string': function (err, str) {
                    assert.equal(str, "hey");
                }
            }
        }
    }),

    'the command SUBSTR': usingClient({
        topic: function (client) {
            client.set("key-to-substr", "whenever");
            client.substr("key-to-substr", 4, 7, this.callback);
        },
        'should return the appropriate substring': function (err, substring) {
            assert.equal(substring, "ever");
        }
    })
}).addBatch({
    'the command SETEX': usingClient2({
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
    })
}).export(module, {});
