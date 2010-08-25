var sys = require("sys"),
    vows = require("vows"),
    assert = require("assert"),
    fs = require("fs"),
    redis = require("../lib/redis"),
    ReplyStream = require("../lib/replyStream"),
    Buffer = require("buffer").Buffer;

vows.describe("Redis").addBatch({
  'selecting a new DB': {
    topic: function () {
      var client = redis.createClient();
      client.select(6, this.callback);
    },

    'should return true': function (err, result) {
      assert.equal(result, true);
    }
  },

  'the command SET': {
    topic: function () {
      var client = redis.createClient();
      client.select(6);
      client.flushdb();
      return client;
    },

    'with proper syntax': {
      topic: function (client) {
        client.set("foo", "bar", this.callback);
      },

      'should return true': function (err, result) {
        assert.equal(result, true);
      }
    }
  },

  'the command SETNX': {
    topic: function () {
      var client = redis.createClient();
      client.select(6);
      client.flushdb();
      return client;
    },

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
  },

  'the command GET': {
    topic: function () {
      var client = redis.createClient();
      client.select(6);
      client.flushdb();
      return client;
    },
  }
}).export(module, {});
