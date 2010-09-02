## redis-node - Complete Redis Client for Node.js
---

Blog post coming.

### Features include:
- Full transactional support (including nested transactions) (i.e., MULTI/EXEC) (to my knowledge, not present in [redis-node-client](http://github.com/fictorial/redis-node-client.git).
- Automatic re-establishment of connections to the Redis server.
- Test coverage of nearly all the Redis commands.

### Dependencies
The Vows Testing Framework:
From git:
    git clone http://github.com/cloudhead/vows.git
Or from npm:
    npm install vows

### Installation
From git:
    git clone http://github.com/bnoguchi/redis-node.git
Npm installation coming...

### Example
See test/ for examples of each command.

Creating a Client:
    var redis = require("redis");
    var client = redis.createClient();
    client.select(2);                     // Select database 2

    client.set("hello", "world", function (err, status) {
      if (err) throw err;
      sys.log(status); // true
    });

    // The commands are also idiomatic
    client.hmset("hash", { t: "rex", steg: "asaurus" }, function (err, status) {
      if (err) throw err;
      sys.log(status); // true
    });

    // Support for transactions
    sys.log("Transfer from checking to savings.");
    client.transaction( function () {
      client.decrby("checking", 100, function (err, balance) {
        if (err) throw err;
        sys.log("Checking Balance: " + balance);
      });
      client.incrby("savings", 100, function (err, balance) {
        if (err) throw err;
        sys.log("Savings Balance: " + balance);
      });
    });

    // With automatic transaction discard if there are any syntactic errors
    client.transaction( function () {
      client.set("I'm missing a 2nd argument"); // This will make our client discard the transaction
    });
    

### Test Coverage
See [./test/](http://github.com/bnoguchi/redis-node) for the list of tests.
To run the tests from the command line.
    vows test/*.vows.js

### License
MIT License

---
### Author
Brian Noguchi
