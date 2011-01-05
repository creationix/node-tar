var Tar = require('./tar');
var overrides = {
  owner: "root",
  group: "wheel"
};
var tape = new Tar();
tape.addDirectory('./test', overrides, function (err) {
  if (err) { throw err; }
  tape.close();
});
tape.pipe(process.stdout);
