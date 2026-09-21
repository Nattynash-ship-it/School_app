// SECTION: Harness
// The one place a suite may write a file. Every screenshot, export or fixture a
// test produces goes under the scratch space - TEST_SCRATCH when the caller set
// it, otherwise a study-hub-tests folder in the system temp directory - and
// never into the repository. writeguard.js refuses a test that writes elsewhere,
// and battery.sh fails a suite that leaves the working tree changed.
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = process.env.TEST_SCRATCH || path.join(os.tmpdir(), 'study-hub-tests');
fs.mkdirSync(ROOT, { recursive: true });
const scratch = name => path.join(ROOT, name);
scratch.ROOT = ROOT;
module.exports = scratch;
