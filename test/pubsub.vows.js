var vows = require("vows"),
    usingClient = require("./utils").usingClient,
    assert = require("assert"),
    redis = require("../lib/redis"),
    sys = require("sys");

vows.describe("Redis PubSub Commands").addBatch({
    'publishing': {
        topic: function () {
            var client = redis.createClient();
            client.select(6);
            client.publish("channel-2", "sending this to no-one", this.callback);
        },
        'should return the number of clients who received the message': function (err, numReceiving) {
            assert.equal(numReceiving, 0);
        }
    },
    'publishing to a subscribed channel': {
        topic: function () {
            var subClient = redis.createClient(),
                pubClient = redis.createClient();
            subClient.select(6);
            pubClient.select(6);
            subClient.subscribeTo("channel-1", this.callback);
            subClient.addListener("connected", function () {
                pubClient.publish("channel-1", "I'm the 1st message");
            });
        },

        'should send the message and channel to the subscriber': function (channel, msg) {
            assert.equal(channel, "channel-1");
            assert.equal(msg, "I'm the 1st message");
        }
    },

    'subscribe and unsubscribe': {
        topic: function () {
            var client = redis.createClient();
            client.select(6);
            return client;
        },
        'subscribing': {
            topic: function (client) {
                client.subscribe("channel-3");
                client.subscribe("channel-4", this.callback);
            },
            'should return [command type, channel, num channels subscribed to]': function (err, triple) {
                assert.deepEqual(triple, ["subscribe", "channel-4", 2]);
            },
            'and then unsubscribing': {
                topic: function (_, client) {
                    client.unsubscribe("channel-3");
                    client.unsubscribe("channel-4", this.callback);
                },
                'should return [command type, channel, num channels subscribed to]': function (err, triple) {
                    assert.deepEqual(triple, ["unsubscribe", "channel-4", 0]);
                }
            }
        }
    },

    'psubscribe and punsubscribe': {
        topic: function () {
            var client = redis.createClient();
            client.select(6);
            return client;
        },
        'psubscribing': {
            topic: function (client) {
                client.psubscribe("channel-5.*", this.callback);
            },
            'should return [command type, channel, num channels subscribed to]': function (err, triple) {
                assert.deepEqual(triple, ["psubscribe", "channel-5.*", 1]);
            },
            'and then punsubscribing': {
                topic: function (_, client) {
                    client.punsubscribe("channel-5.*", this.callback);
                },
                'should return [command type, channel, num channels subscribed to]': function (err, triple) {
                    assert.deepEqual(triple, ["punsubscribe", "channel-5.*", 0]);
                }
            }
        }
    }
}).export(module, {error: false});
