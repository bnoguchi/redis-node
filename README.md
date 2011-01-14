## redis-node - Complete Redis Client for Node.js
---

Blog post coming.

### Features include:
- FAST!!!! (See [benchmarks](http://github.com/bnoguchi/redis-node/benchmarks/bench.js))
- A comprehensive test suite.
- Fully asynchronous.
- Support for all Redis commands.
- PUBLISH and SUBSCRIBE support.
- Full transactional support (including nested transactions) (i.e., MULTI/EXEC/DISCARD) (to my knowledge, not present in [redis-node-client](http://github.com/fictorial/redis-node-client)).
- Idiomatic command syntax.
- Automatic re-establishment of connections to the Redis server.

### Installation
    npm install redis-node

### A Quick Tour
    // See ./examples/tour.js
    var sys = require("sys");
    var redis = require("redis-node");
    var client = redis.createClient();    // Create the client
    client.select(2);                     // Select database 2

    // Assign the string "world" to the "hello" key.
    // You can provide a callback to handle the response from Redis
    // that gets asynchronously run upon seeing the response.
    client.set("hello", "world", function (err, status) {
      if (err) throw err;
      console.log(status); // true
    });

    // ... but you don't have to provide a callback.
    client.set("hello", "world");

    // We may or may not be connected yet, but that's ok, since
    // the client queues up any commands.

    // The commands are also idiomatic
    client.hmset("hash", { t: "rex", steg: "asaurus" }, function (err, status) {
      if (err) throw err;
      sys.log(status); // true
    });

    // Support for transactions
    console.log("Transfer from checking to savings.");
    client.transaction( function () {
      client.decrby("checking", 100, function (err, balance) {
        if (err) throw err;
        console.log("Checking Balance: " + balance);
      });
      client.incrby("savings", 100, function (err, balance) {
        if (err) throw err;
        console.log("Savings Balance: " + balance);
      });
    });

    // With automatic transaction discard if there are any syntactic errors
    client.transaction( function () {
      client.set("I'm missing a 2nd argument"); // Our client with automatically discard the transaction
    });

    // Close the connection
    setTimeout( function () {
        client.close();
    }, 1000);

See test/ for examples of each command.

# API Reference
## redis.createClient(port, host, options)
Creates a new Client instance connected to the Redis server running on host:port.
`host` defaults to `127.0.0.1`
`port` defaults to `6379`
You can pass in an options hash, too.  They default to:
- `maxReconnectionAttempts` (10) The number of times to try reconnecting to the Redis server before giving up.
- `reconnectionDelay` (500) How many milliseconds to wait before the 1st reconnection attempt. Using the strategy of exponential backoff, the delay doubles with every re-connection attempt.

## Events
The redis-node client emits important events related to the connection with the Redis
server. You can bind an event handler to any of the following events:
  
- `connected`

  Emitted when the client successfully makes a connection FOR THE FIRST TIME. 
  You usually will not need to bind an event handler to `connected` because the 
  client takes care of queueing up any commands you send it and flushes them 
  to the Redis server once it is connected.

- `disconnected`

  Emitted when we drop a connection with the Redis server. This can happen if the
  connection times out due to no recent activity from the client.

- `reconnecting`

  Emitted just before the client attempts to reconnect to the Redis server.

- `reconnected`

  Emitted when the client successfully makes a successful reconnection.

- `noconnection`

  Emitted when the client gives up its connection attempts.

- `connection error`

  Emitted when the there is an error that is a result of the connection with the
  Redis server. The error object is passed to `callback`. If you do not register
  a listener with this event, then the error is thrown and the program exits.

## Commands operating on all value types

### client.exists(key, callback)
Test if a key exists.
Passes `true` to callback if it exists.
Passes `false` to callback if it does not.
    client.exists("some-key", function (err, doesExist) {
        console.log(doesExist);
    });

### client.del(key1, key2, ..., keyn, callback)
Delete a key.
Passes the number of keys that were deleted to `callback`.
    client.del("key1", "key2", function (err, numRemoved) {
        console.log(numRemoved); // 2
    });

### client.type(key, callback)
Passes the type of value stored at key to `callback`. One of:
- `none` if the key does not exist
- `string` if the key contains a `String` value
- `list` if the key contains a `List` value
- `set` if the key contains a `Set` value
- `zset` if the key contains a `Sorted Set` value
- `hash` if the key contains a `Hash` value
    client.type("key-with-string", function (err, type) {
        console.log(type); // Either: 'none', 'string', 'list', 'set', 'zset', or 'hash'
    });

### client.keys(pattern, callback)
Passes all the keys matching a given pattern to `callback`.
    // The * pattern returns an array of all keys
    client.keys("*", function (err, arrayOfKeys) {
        arrayOfKeys.forEach( function (key) {
            console.log(key);
        });
    });

    // .* patterns
    client.keys("key*", function (err, arrayOfKeys) {
        arrayOfKeys.forEach( function (key) {
            console.log(key);
        });
    });

    // ? patterns
    client.keys("?ar", function (err, arrayOfKeys) {
        arrayOfKeys.forEach( function (key) {
            console.log(key); // e.g., 'car', 'bar', 'far'
        });
    });

### client.randomkey(callback)
Passes a random key from the key space to `callback`.
    client.randomkey( function (err, key) {
        console.log(key);
    });

### client.rename(oldName, newName, callback)
Renames the old key name `oldName` to the new key name `newName`
Passes `true` to `callback`.
    client.rename("old", "new", function (err, didSucceed) {
        console.log(didSucceed); // true
    });

### client.renamenx(oldName, newName, callback)
Renames the old key name `oldName` to the new key name `newName`,
if the `newName` key does not already exist.
Passes `1` if `newName` key did not already exist, to `callback`.
Passes `0` if `newName` key did already exist, to `callback`.
    client.renamenx("old", "new", function (err, didSucceed) {
        console.log(!!didSucceed); // true
    });

### client.dbsize(callback)
Passes the number of keys in the current db.
    client.dbsize( function (err, numKeys) {
        console.log(numKeys);
    });

### client.expire(key, ttl, callback)
Tells Redis to delete the `key` after `ttl` seconds.
If we are using Redis < 2.1.3 and if a `ttl` was already set with 
another prior `client.expire` invocation, then the new `ttl` does 
NOT override the old `ttl`.
If we are using Redis >= 2.1.3 and if a `ttl` was already set with 
another prior `client.expire` invocation, then the new `ttl` DOES
override the old `ttl`.
The expiry can be removed from the key if the key is set to a new value using
the `client.set(key, value)` command or when a key is destroyed via the 
`client.del(key)` command.
Passes `1` to `callback` if `key` has no current `ttl` expiry.
Passes `0` to `callback` if `key` does not exist or if we
are using Redis < 2.1.3, and `key` already has a current `ttl` expiry.
    client.expire("key", 2, function (err, didSetExpiry) {
        console.log(!!didSetExpiry);
    });

### client.expireat(key, unixtime, callback)
Tells Redis to delete the `key` at the `unixtime` datetime in the future.
Works similarly to `client.expire(key, ttl, callback)`
    client.expireat("key", parseInt((+new Date) / 1000, 10) + 2, function (err, didSetExpiry) {
        console.log(didSetExpiry);
    });

### client.ttl(key, callback)
Gets the time to live (i.e., how many seconds before `key` expires) in seconds
of `key`.
Passes the number of seconds before `key` expires to `callback`.
Passes `-1` to `callback` if `key` has no ttl expiry.
    client.ttl("key", function (err, ttl) {
        console.log(ttl);
    });

### client.select(dbIndex, callback)
Selects the DB with the specified `dbIndex`.
Passes `true` to `callback`.
    client.select(2, function (err, didSucceed) {
        console.log(didSucceed); // true
    });

### client.move(key, dbIndex, callback)
Moves `key` from the currently selected DB to the `dbIndex` DB.
You can use `client.move` as a locking primitive.
Passes `1` to `callback` if `key` was moved successfully.
Passes `0` if the target `key` was already there or if the source `key`
was not found at all.
    client.move("key", 3, function (err, didSucceed) {
        console.log(!!didSucceed);
    });

### client.flushdb(callback)
Deletes all the keys of the currently selected DB. The command never fails.
Passes `true` to `callback`.
    client.flushdb( function (err, didSucceed) {
        console.log(didSucceed); // true
    });

### client.flushall(callback)
Deletes all the keys of all the existing databases, not just the currently
selected one. This command never fails.
Passes `true` to `callback`.
    client.flushall( function (didSucceed) {
        console.log(didSucceed); // true
    });

## Commands operating on all value types

### client.set(key, value, callback)
Sets `key` to `value`. `value` can be a String, Number, or Buffer.
Passes `true` to `callback`.
    client.set("key", "value", function (err, didSet) {
        console.log(didSet); // true
    });

### client.get(key, callback)
Passes the Buffer value at `key` to callback if the key exists.
Passes null to `callback` if `key` does not exist.

## MULTI/EXEC (aka transactions)

### client.transaction(transactionBlock)
Sends commands inside the function `transactionBlock` as a transaction. Behind the scenes, we precede the commands inside `transactionBlock` with a MULTI command and commit the commands with an EXEC command. If there is a syntax error with any of the commands sent in the transaction, EXEC will never be called; instead a DISCARD command will be sent to the Redis server to roll back the transaction.
    client.transaction( function () {
        client.rpush("txn", 1);
        client.rpush("txn", 2);
        client.rpush("txn", 3, function (err, count) {
          console.log(count); // 3
        });
    });

# Test Coverage
See [./test/](https://github.com/bnoguchi/redis-node) for the list of tests.
Currently, the tests are implemented via the [Vows](https://github.com/cloudhead/vows).
However, the tests will only work with my fork of vows, so install my branch to see the tests pass:
    git clone git://github.com/bnoguchi/vows.git
    git checkout teardownFix
    npm install
Then, to run the tests from the command line.
    make test
You can also run the tests directly with the vows binary from the command line.
    vows test/*.vows.js

# Coming Sooner or Later
- A distributed API for interacting with a Redis cluster.
- UDP Support

# Contributors
- [Brian Noguchi](http://github.com/bnoguchi)
- [Tim Smart](http://github.com/Tim-Smart)
- [Graeme Worthy](http://github.com/graemeworthy)

# Other Redis Clients for Node.js
- [redis-node-client](http://github.com/fictorial/redis-node-client)
- [node_redis](http://github.com/mranney/node_redis)

### 3rd Party Libraries
- [Vows Testing Framework](http://github.com/cloudhead/vows)

### License
MIT License

---
### Author
Brian Noguchi
