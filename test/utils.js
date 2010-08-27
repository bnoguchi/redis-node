var redis = require("../lib/redis");
var client = redis.createClient();
client.select(6);
client.flushdb();
var setupClient = function () {
    client.select(6);
    return client;
};

exports.usingClient = function (subContexts) {
    var context = {topic: setupClient};
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
