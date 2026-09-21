// SECTION: Harness
// Two rules every suite in this folder follows, checked before any of them run:
//
//  1. A test writes files only to the scratch space. Every call that writes a
//     file - screenshot({path}), pdf({path}), fs.writeFileSync and friends,
//     createWriteStream - names its target through scratch(...) from
//     tests/scratch.js. A line may instead carry "REPO-WRITE-ALLOWED: <reason>";
//     the only such line is offlinekeep swapping sw.js so the service worker
//     sees a new build, and battery.sh checks the tree is restored afterwards.
//
//  2. The top of every test is the label of the section it guards:
//     "// SECTION: <name>" (or "# SECTION: <name>" in a shell script), where the
//     name is one of the sections listed in tests/README.md.
const fs = require('fs'), path = require('path');
const DIR = __dirname;
const SECTIONS = ['Harness', 'Gate', 'Boot & screens', 'Quizzes & content', 'Notes pad',
                  'Lesson annotation & themes', 'Study helper', 'Store, sync & reset'];
const WRITE = /\.(screenshot|pdf)\(\s*\{[^}]*\bpath\s*:|\bfs\.(writeFileSync|appendFileSync|copyFileSync|renameSync|createWriteStream|writeFile|appendFile)\b|\bfs\.promises\.(writeFile|appendFile|copyFile|rename)\b|(^|[^.\w])(writeFileSync|appendFileSync|createWriteStream)\(/;
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 600)))); };
const files = fs.readdirSync(DIR).filter(f => /\.(js|mjs|sh)$/.test(f)).sort();
const badLabel = [], badWrite = [], allowed = [];
for (const f of files) {
  const text = fs.readFileSync(path.join(DIR, f), 'utf8');
  const lines = text.split('\n');
  const first = lines[0] && lines[0].startsWith('#!') ? lines[1] || '' : lines[0] || '';
  const m = first.match(/^(?:\/\/|#) SECTION: (.+?)\s*$/);
  if (!m || !SECTIONS.includes(m[1])) badLabel.push(f + ': ' + JSON.stringify(first.slice(0, 60)));
  if (f === 'scratch.js' || f === 'writeguard.js') continue;   // the helper makes the scratch folder; this file holds the patterns
  lines.forEach((ln, i) => {
    if (!WRITE.test(ln)) return;
    if (/REPO-WRITE-ALLOWED:/.test(ln)) { allowed.push(f + ':' + (i + 1)); return; }
    if (!/\bscratch\(/.test(ln)) badWrite.push(f + ':' + (i + 1) + ' ' + ln.trim().slice(0, 90));
  });
}
ok('every test opens with the label of its section', badLabel.length === 0, badLabel);
ok('every file a test writes goes to the scratch space', badWrite.length === 0, badWrite);
ok('the only repo write allowed is offlinekeep swapping sw.js', allowed.length === 2 && allowed.every(a => a.startsWith('offlinekeep.js:')), allowed);
ok('the scratch helper exists and points outside the repository', (() => { try { const s = require('./scratch.js'); return !path.resolve(s.ROOT).startsWith(path.resolve(DIR, '..') + path.sep); } catch (e) { return false; } })());
console.log('writeguard: ' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
