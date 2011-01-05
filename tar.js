function clean(length) {
  var buffer = new Buffer(length);
  for (var i = 0; i < length; i++) {
    buffer[i] = 0;
  }
  return buffer;
}
function forEach(object, callback, thisp) {
  var keys = Object.keys(object);
  for (var i = 0, l = keys.length; i < l; i++) {
    var key = keys[i];
    callback.call(thisp, object[key], key, object);
  }
}
var headerFormat = {
  fileName: 100,
  fileMode: 8,
  uid: 8,
  gid: 8,
  fileSize: 12,
  mtime: 12,
  checksum: 8,
  type: 1,
  linkName: 100,
  ustar: 8,
  owner: 32,
  group: 32,
  majorNumber: 8,
  minorNumber: 8,
  filenamePrefix: 155,
  padding: 12
};

function formatHeader(data) {
  var buffer = clean(512);
  var offset = 0;
  forEach(headerFormat, function (value, key) {
    buffer.write(data[key] || "", offset);
    offset += value;
  });
  return buffer;
}
function pad(num, bytes, base) {
  num = num.toString(base || 8);
  return "000000000000".substr(num.length + 12 - bytes) + num;
}  

var fs = require('fs');
var Stream = require('stream').Stream;

function Tar() {
  Stream.apply(this, arguments);
  this.queue = [];
  this.busy = false;
  this.done = false;
  this.written = 0;
  var tape = this;
  this.addListener('data', function (chunk) {
    tape.written += chunk.length;
  });
  this.addListener('end', function () {
    this.emit('data', clean(10240 - (this.written % 10240)));
  });
}
Tar.prototype = Object.create(Stream.prototype, {
  constructor: {value: Tar}
});
Tar.prototype.checkQueue = function () {
  this.busy = false;
  var next = this.queue.shift();
  if (next) {
    this.append.apply(this, next);
  } else if (this.done) {
    this.emit('end');
  }
};
Tar.prototype.close = function () {
  if (!this.busy && !this.queue.length) {
    this.emit('end');
  } else {
    this.done = true;
  }
};
Tar.prototype.append = function (path, o) {
  if (this.busy) {
    this.queue.push(arguments);
    return;
  }
  this.busy = true;
  var tape = this;

  fs.stat(path, function (err, stat) {
    if (err) { return tape.emit('error', err); }
    try {
      if (stat.isDirectory()) {
        path += "/";
      }
      //console.dir(stat);
      var data = {
        fileName: o.fileName || path,
        fileMode: pad(o.fileMode || stat.mode & 0xfff, 7),
        uid: pad(o.uid || (o.owner ? 0 : stat.uid), 7),
        gid: pad(o.gid || (o.group ? 0 : stat.gid), 7),
        fileSize: pad(o.fileSize || (stat.isFile() ? stat.size : 0), 11),
        mtime: pad(o.mtime || stat.mtime.getTime() / 1000 >> 0, 11),
        checksum: "        ",
        type: stat.isDirectory() ? "5" : stat.isFile() ? "0" : new Error(),
        ustar: "ustar  ",
        owner: o.owner || "",
        group: o.group || ""
      };
      var checksum = 0;
      forEach(data, function (value) {
        for (var i = 0, l = value.length; i < l; i++) {
          //console.log(value.charCodeAt(i));
          checksum += value.charCodeAt(i);
        }
      });
      data.checksum = pad(checksum, 6) + "\u0000 ";
      tape.emit('data', formatHeader(data));
      if (stat.isFile()) {
        var written = 0;
        var input = fs.createReadStream(path);
        input.on('data', function (chunk) {
          written += chunk.length;
          tape.emit('data', chunk);
        });
        input.on('error', function (err) {
          tape.emit('error', err);
        });
        input.on('end', function () {
          tape.emit('data', clean(512 - (written % 512)));
          tape.checkQueue();
        });
      } else {
        tape.checkQueue();
      }
    } catch (err2) {
      tape.emit('error', err2);
    }
  });
};
Tar.prototype.addDirectory = function (path, overrides, callback) {
  var tape = this;
  fs.readdir(path, function (err, filenames) {
    if (err) { return callback(err); }
    var counter = filenames.length;
    filenames.forEach(function (filename) {
      var fullPath = path + "/" + filename;
      fs.stat(fullPath, function (err, stat) {
        if (err) { return callback(err); }
        tape.append(fullPath, overrides);
        if (stat.isDirectory()) {
          tape.addDirectory(fullPath, overrides, function (err) {
            if (err) { return callback(err); }
            if (--counter === 0) { callback(); }
          });
        } else {
          if (--counter === 0) { callback(); }
        }
      });
    });
  });
};
module.exports = Tar;

