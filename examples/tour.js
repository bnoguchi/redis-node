// Run using
//    node examples/tour.js
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
