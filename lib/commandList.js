/*

© 2010 by Brian Noguchi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

*/

// Commands that we dynamically define in client.js as wrappers around
// our Client.prototype.sendCommand method
module.exports = [
    "append",
    "auth",
    "bgsave",
    "blpop",
    "brpop",
    "dbsize",
    "decr",
    "decrby",
    "discard",
    "exec",
    "exists",
    "expire",
    "expireat",
    "flushall",
    "flushdb",
    "get",
    "getset",
    "hdel",
    "hexists",
    "hget",
    "hgetall",
    "hincrby",
    "hkeys",
    "hlen",
    "hmget",
    "hset",
    "hvals",
    "incr",
    "incrby",
    "info",
    "keys",
    "lastsave",
    "len",
    "lindex",
    "llen",
    "lpop",
    "lpush",
    "lrange",
    "lrem",
    "lset",
    "ltrim",
    "mget",
    "move",
    "mset",
    "msetnx",
    "multi",
    "psubscribe",
    "publish",
    "punsubscribe",
    "randomkey",
    "rename",
    "renamenx",
    "rpop",
    "rpoplpush",
    "rpush",
    "sadd",
    "save",
    "scard",
    "sdiff",
    "sdiffstore",
    "select",
    "set",
    "setex",
    "setnx",
    "shutdown",
    "sinterstore",
    "sismember",
    "smembers",
    "smove",
    "spop",
    "srandmember",
    "srem",
    "subscribe",
    "substr",
    "sunionstore",
    "ttl",
    "type",
    "unsubscribe",
    "zadd",
    "zcard",
    "zcount",
    "zincrby",
    "zrange",
    "zrangebyscore",
    "zrank",
    "zrem",
    "zrembyrank",
    "zremrangebyrank",
    "zremrangebyscore",
    "zrevrange",
    "zrevrank",
    "zscore"
];

