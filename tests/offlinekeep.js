// SECTION: Store, sync & reset
// Her library has to survive a deploy, and she has to be able to put it there
// on purpose.
//
// "when I try using the app offline on my phone in the train station I am
// unable to view anything". There was one cache named after the build, and
// activate deleted every cache that was not it - so shipping anything emptied
// her offline copy down to whatever install had precached, four courses out of
// fifty-eight. Four builds went out in two days.
const { chromium } = require('playwright');
const fs = require('fs');
const SW = '/home/user/School_app/sw.js';
const B = 'http://127.0.0.1:8901/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d || ''))); };

const shelf = p => p.evaluate(async () => {
  const out = [];
  for (const n of await caches.keys()) {
    const c = await caches.open(n);
    for (const r of await c.keys()) out.push({ cache: n, path: new URL(r.url).pathname, q: new URL(r.url).search });
  }
  return out;
});

(async () => {
  const original = fs.readFileSync(SW, 'utf8');
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1100 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  try {
    await p.goto(B, { waitUntil: 'load', timeout: 240000 });
    await p.waitForTimeout(14000);
    await p.evaluate(() => navigator.serviceWorker.ready);

    // she asks for the whole library, the way the panel does
    const dl = await p.evaluate(async () => {
      const urls = window.__contentUrls ? window.__contentUrls() : [];
      const r = await window.__offline.download(() => {});
      const held = await window.__offline.held();
      return { asked: urls.length, ok: r.ok, failed: r.failed.length, held };
    });
    ok('the app knows every class file it would need', dl.asked >= 50, dl.asked + ' addresses');
    ok('saving for offline fetches them all', dl.failed === 0 && dl.ok === dl.asked,
       dl.ok + ' saved, ' + dl.failed + ' failed');
    ok('and they are really on the device', dl.held.files >= 50 && dl.held.bytes > 40 * 1048576,
       dl.held.files + ' files, ' + Math.round(dl.held.bytes / 1048576) + ' MB');

    const before = await shelf(p);
    const beforeCourses = [...new Set(before.filter(e => /^\/content-/.test(e.path)).map(e => e.path))];

    // ---- a new build ships and the worker updates, as it did four times
    /* Read the live cache name out of the worker rather than hardcoding it.
       Hardcoded, this line stopped simulating a deploy the moment the version
       moved on, and the test went quietly green without testing anything. */
    const curCache = (original.match(/const CACHE = '([^']+)'/) || [])[1];
    if (!curCache) throw new Error('could not read CACHE out of sw.js');
    fs.writeFileSync(SW, original.replace("const CACHE = '" + curCache + "'", "const CACHE = 'study-hub-v901'"));   // REPO-WRITE-ALLOWED: the served sw.js must change for the worker to see a new build; restored in finally
    await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); if (r) await r.update(); });
    await p.waitForTimeout(11000);
    const after = await shelf(p);
    const afterCourses = new Set(after.filter(e => /^\/content-/.test(e.path)).map(e => e.path));
    // the new build re-caches the manifest under its own ?v, so the count can
    // rise. What must never happen is a class going missing.
    const lost = beforeCourses.filter(u => !afterCourses.has(u));
    ok('a new version does not throw the library away', lost.length === 0,
       beforeCourses.length + ' classes before, ' + afterCourses.size + ' after, lost: ' +
       (lost.length ? lost.join(' ') : 'none'));
    ok('the shell cache is still versioned and replaced',
       after.some(e => e.cache === 'study-hub-v901') && !after.some(e => e.cache === curCache),
       [...new Set(after.map(e => e.cache))].join(', '));

    // ---- and now the train, with no reload online in between
    await ctx.setOffline(true);
    await p.reload({ waitUntil: 'load', timeout: 120000 }).catch(e => errs.push('reload: ' + e.message));
    await p.waitForTimeout(14000);
    const off = await p.evaluate(async () => {
      const r = { booted: typeof window.go === 'function' };
      for (const [cid, ch, sec] of [['C959', 'ch4', 's1'], ['D684', 'g1', 'x3_1']]) {
        go({ name: 'section', courseId: cid, chId: ch, secId: sec });
        await new Promise(x => setTimeout(x, 2400));
        const app = document.getElementById('app');
        r[cid] = { lesson: !!document.querySelector('.lesson'), len: app ? app.innerText.trim().length : 0 };
      }
      return r;
    });
    ok('offline after the update, the app still boots', off.booted === true);
    ok('offline after the update, lessons still render',
       off.C959.lesson && off.C959.len > 500 && off.D684.lesson && off.D684.len > 500,
       JSON.stringify({ C959: off.C959, D684: off.D684 }));
    ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    fs.writeFileSync(SW, original);   // REPO-WRITE-ALLOWED: restores sw.js byte for byte (battery.sh checks the tree is unchanged)
    await browser.close();
  }
  console.log(`offlinekeep: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
