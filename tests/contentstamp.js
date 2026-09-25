// SECTION: Boot & screens
// A course file is cached on her device under its version stamp
// (content-X.json?v=<fv>), and the service worker serves that exact copy
// for as long as the stamp is unchanged - across every app update. 18.630
// and 18.631 changed the practice exams, added 918 questions and repaired
// cut-off definitions in 49 course files without re-stamping them, so a
// device that already held those courses kept showing the old ones. Found
// and fixed in 18.633; this check makes it impossible to ship again:
//   - every course file's build equals its stamp in the manifest
//   - a course file that differs from what is live carries a NEW stamp
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 400)))); };
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'content-manifest.json'), 'utf8'));
const files = fs.readdirSync(ROOT).filter(f => /^content-[A-Z0-9-]+\.json$/.test(f) && !/manifest/.test(f));
const mismatch = [];
for (const f of files) { const cid = f.slice(8, -5); let b = null; try { b = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')).build; } catch (e) {} if (man.fv && man.fv[cid] && b !== man.fv[cid]) mismatch.push(cid + ' ' + b + '!=' + man.fv[cid]); }
ok('every course file\'s build matches its stamp in the manifest (' + files.length + ' files)', mismatch.length === 0, mismatch.slice(0, 8));
let base = null;
for (const ref of ['origin/main', 'main']) { try { execSync('git rev-parse --verify ' + ref, { cwd: ROOT, stdio: 'ignore' }); base = ref; break; } catch (e) {} }
if (!base) { ok('a live reference to compare against exists (skipped: no main branch here)', true); }
else {
  let liveMan = null; try { liveMan = JSON.parse(execSync('git show ' + base + ':content-manifest.json', { cwd: ROOT, maxBuffer: 64 << 20 }).toString()); } catch (e) {}
  const differ = execSync('git diff --name-only ' + base + ' -- "content-*.json"', { cwd: ROOT }).toString().split('\n').filter(f => /^content-[A-Z0-9-]+\.json$/.test(f) && !/manifest/.test(f));
  const unstamped = liveMan ? differ.filter(f => { const cid = f.slice(8, -5); return man.fv[cid] && liveMan.fv && liveMan.fv[cid] === man.fv[cid]; }) : [];
  ok('every course file changed since ' + base + ' carries a new stamp, so devices fetch it (' + differ.length + ' changed)', liveMan && unstamped.length === 0, unstamped.slice(0, 8));
}
console.log(`contentstamp: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
