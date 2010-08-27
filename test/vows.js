// TODO Allow passing of arrays back to mget
// TODO Allow passing of arrays to mset
// TODO Test sort with STORE option

var sys = require("sys"),
    vows = require("vows"),
    assert = require("assert"),
    redis = require("../lib/redis"),
    fs = require("fs"),
    ReplyStream = require("../lib/replyStream"),
    Buffer = require("buffer").Buffer,
    usingClient = require("./utils").usingClient;

vows.describe("Redis").addBatch({
    'the command INFO': usingClient({
        topic: function (client) {
            client.info(this.callback);
        },

        'should return the information as a hash': function (err, info) {
            assert.isObject(info);
            ['redis_version', 'redis_git_sha1', 'redis_git_dirty', 'arch_bits', 'multiplexing_api', 'process_id', 'uptime_in_seconds', 'uptime_in_days', 'connected_clients', 'connected_slaves', 'blocked_clients', 'used_memory', 'used_memory_human', 'changes_since_last_save', 'bgsave_in_progress', 'last_save_time', 'bgrewriteaof_in_progress', 'total_connections_received', 'total_commands_processed', 'expired_keys', 'hash_max_zipmap_entries', 'hash_max_zipmap_value', 'pubsub_channels', 'pubsub_patterns', 'vm_enabled', 'role'].forEach( function (key) {
                assert.include(info, key);
                assert.isString(info[key]);
            });
        }
    }),
}).addBatch({
    // TODO Test BGSAVE
    'the command SAVE': usingClient({
        topic: function (client) {
            client.save(this.callback);
        },
        'should return a true status': function (err, status) {
            assert.isTrue(status);
        },
        'the command LASTSAVE': {
            topic: function (_, client) {
                client.lastsave(this.callback);
            },
            'should return the integer unix timestamp of the last successful save': function (err, timestamp) {
                assert.deepEqual(timestamp > 0, true);
            }
        }
    })
}).export(module, {});
