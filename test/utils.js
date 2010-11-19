var redis = require("../lib/redis");


var usingClient = exports.usingClient = function (client, subContexts) {
    return function (subContexts) {
        function setupClient () {
            client.select(6);
            client.remainingTests++;
            return client;
        }
        function teardown () {
          if (--client.remainingTests === 0) {
            client.close();
          }
        }
        var context = {topic: setupClient, teardown: teardown};
        var currSubContext;
        if (subContexts.hasOwnProperty("topic")) {
            context[""] = subContexts;
        } else {
            for (var subContextName in subContexts) {
                context[subContextName] = subContexts[subContextName];
            }
        }
        return context;
    };
};

usingClient.gen = function (subContexts) {
  var client = redis.createClient();
  client.select(6);
  client.flushdb();
  client.remainingTests = 0;
  return usingClient(client, subContexts);
};
