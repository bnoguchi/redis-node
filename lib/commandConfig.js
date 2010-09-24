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

var commandConfig = {
    // TODO Move this functionality into Reply.prototype?
    info: {
        typecastReplyValue: function (replyValue) {
            var info = {};
            replyValue.replace(/\r\n$/, '').split("\r\n").forEach( function (line) {
                var parts = line.split(":");
                info[parts[0]] = parts[1];
            });
            return replyValue = info;
        }
    },
    exists: {
        typecastReplyValue: function (replyValue) {
            return replyValue === 1;
        }
    },

    zrange: {
        typecastReplyValue: function (replyValue, originalCommand) {
            if (!originalCommand.withscores) {
                return replyValue;
            }
            var arr = replyValue, hash, currKey, newArr = [];
            for (var i = 0, len = arr.length; i < len; i++) {
                if ((i % 2) === 0) {
                    currKey = arr[i];
                } else {
                    hash = {};
                    hash[currKey] = arr[i];
                    newArr.push(hash);
                }
            }
            return replyValue = newArr;
        }
    }
};

commandConfig.zrangebyscore = commandConfig.zrevrange = commandConfig.zrange;

module.exports = commandConfig;
