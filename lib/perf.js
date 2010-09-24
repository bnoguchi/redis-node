exports.toSmallString = function (buffer, until) {
    until = until || buffer.length;
    var ret = "",
        i = 0;
    for ( ; i < until; i++) {
        ret += String.fromCharCode(buffer[i]);
    }
    return ret;
};
