// SECTION: Notes pad
// "How can we permanent fix this" - her Storage check: 4.67 MB of roughly
// 5 MB used, 3.77 MB of it handwriting, one page 604 KB. localStorage holds
// about 5 MB for the whole app; her notes only grow. Handwriting now lives in
// two tiers: pages in use in localStorage, older pages in IndexedDB.
// What has to hold, on a device with far more handwriting than 5 MB:
//   1. every page is kept and reads back stroke for stroke
//   2. localStorage stays well inside its limit
//   3. after the app is closed and reopened, every page is still there
//   4. writing on an older page works, and it moves back into use
//   5. writing on it BEFORE its copy has loaded merges, never replaces
//   6. the sync still carries every page; the erase record is compressed
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8901, B = `http://127.0.0.1:${PORT}/index.html`;
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 500)))); };

(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await br.newContext({ viewport: { width: 1194, height: 834 } });
  // a switch the test can flip to make IndexedDB slow to answer for the ink tier
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('__slowInk')) return;
    const real = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function(name, ver){
      if (name !== 'sh-ink') return real.apply(this, arguments);
      const fake = {}, self = this;
      setTimeout(() => { const r = real.call(self, name, ver);
        r.onupgradeneeded = e => { fake.result = r.result; fake.onupgradeneeded && fake.onupgradeneeded(e); };
        r.onsuccess = e => { fake.result = r.result; fake.onsuccess && fake.onsuccess(e); };
        r.onerror = e => { fake.error = r.error; fake.onerror && fake.onerror(e); };
      }, 6000);
      return fake;
    };
  });
  const p = await ctx.newPage(); p.on('dialog', d => d.accept());
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  const boot = async () => { await p.waitForTimeout(11000); };
  await p.goto(B, { waitUntil: 'load', timeout: 240000 }); await boot();

  // ---------- 1-2. far more handwriting than localStorage can hold ----------
  const W = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const mk = (pg, j) => ({ type: 'pen', color: '#1d4ed8', width: 3, ts: 1790000000000 + pg * 1000 + j, _ts: 1790000000000 + pg * 1000 + j, _uid: 't' + pg + '_' + j,
      points: Array.from({ length: 120 }, (_, k) => ({ x: +(30 + k * 2.3 + Math.random() * 3).toFixed(1), y: +(40 + (j % 30) * 22 + Math.random() * 9).toFixed(1), p: Math.random() })) });
    const want = {}; let wrote = 0;
    for (let pg = 0; pg < 60; pg++) {
      const rk = 'pad_C959/ch9/t' + pg, list = Array.from({ length: 90 }, (_, j) => mk(pg, j));
      gannoSaveStrokes(rk, list); want[rk] = list.length; wrote += JSON.stringify(list).length;
      if (pg % 6 === 5) await w(1800);
    }
    try { saveStore(); if (saveStore.flushNow) saveStore.flushNow(); } catch (e) {}
    await w(12000); await window.__inkTier.evict(); await w(800);
    let lsTotal = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); lsTotal += k.length + (localStorage.getItem(k) || '').length; }
    const bad = Object.keys(want).filter(rk => (gannoGetStrokes(rk) || []).length !== want[rk]);
    return { wroteMB: +(wrote / 1048576).toFixed(1), cold: window.__inkTier.coldKeys().length, hot: window.__inkTier.hot(), lsTotalMB: +(lsTotal * 2 / 1048576).toFixed(2), bad, want };
  });
  ok('far more handwriting than localStorage holds is written (' + W.wroteMB + ' MB of strokes)', W.wroteMB > 8, W.wroteMB);
  ok('older pages moved to the larger storage and localStorage stays well inside its limit', W.cold >= 20 && W.lsTotalMB < 4, { cold: W.cold, lsMB: W.lsTotalMB, hot: W.hot });
  ok('every page reads back stroke for stroke', W.bad.length === 0, W.bad.slice(0, 5));

  // ---------- 3. closed and reopened ----------
  await p.reload({ waitUntil: 'load', timeout: 240000 }); await boot();
  const R = await p.evaluate(async (want) => {
    await window.__inkReady;
    const bad = Object.keys(want).filter(rk => (gannoGetStrokes(rk) || []).length !== want[rk]);
    const snap = window.__sync._snapshot(); const inSnap = Object.keys(want).filter(rk => (snap.ink[rk] || []).length === want[rk]).length;
    return { bad, inSnap, cold: window.__inkTier.coldKeys().length, dialogs: 0 };
  }, W.want);
  ok('after the app is closed and reopened every page is still there', R.bad.length === 0, R.bad.slice(0, 5));
  ok('and the sync carries every page, including the ones in the larger storage', R.inSnap === Object.keys(W.want).length, R);

  // ---------- 4. write on an older page ----------
  const C = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const cold = window.__inkTier.coldKeys().filter(k => /^pad_C959\/ch9\/t/.test(k))[0];
    const sec = cold.slice(4).split('/'); const NP = window.__notesPanel;
    const before = gannoGetStrokes(cold).length;
    // the notebook page for that key: point the notebook at it directly
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }); await w(1500); NP.open(); await w(1000);
    return { cold, before };
  });
  const C2 = await p.evaluate(async ({ cold }) => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const list = gannoGetStrokes(cold).slice(); list.push({ type: 'pen', color: '#dc2626', width: 3, ts: Date.now(), _ts: Date.now(), _uid: 'new1', points: [{ x: 10, y: 10, p: .5 }, { x: 60, y: 12, p: .5 }] });
    gannoSaveStrokes(cold, list); await w(300);
    return { after: gannoGetStrokes(cold).length, stillCold: window.__inkTier.isCold(cold), inLS: !!localStorage.getItem('gsk:' + cold) };
  }, C);
  ok('writing on an older page keeps every stroke and brings the page back into use', C2.after === C.before + 1 && !C2.stillCold && C2.inLS, { C, C2 });

  // ---------- 5. write on an older page before its copy has loaded ----------
  const target = await p.evaluate(() => window.__inkTier.coldKeys().filter(k => /^pad_C959\/ch9\/t/.test(k))[1]);
  const n0 = W.want[target];
  await p.evaluate(() => localStorage.setItem('__slowInk', '1'));
  await p.reload({ waitUntil: 'load', timeout: 240000 }); await p.waitForTimeout(2500);
  const E = await p.evaluate(async (rk) => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const early = { ready: window.__inkTier.ready(), seen: (gannoGetStrokes(rk) || []).length };
    const list = (gannoGetStrokes(rk) || []).slice(); list.push({ type: 'pen', color: '#16a34a', width: 3, ts: Date.now(), _ts: Date.now(), _uid: 'early1', points: [{ x: 20, y: 20, p: .5 }, { x: 80, y: 22, p: .5 }] });
    gannoSaveStrokes(rk, list);
    await window.__inkReady; await w(500);
    return { early, after: (gannoGetStrokes(rk) || []).length, hasEarly: (gannoGetStrokes(rk) || []).some(s => s._uid === 'early1') };
  }, target);
  await p.evaluate(() => localStorage.removeItem('__slowInk'));
  ok('the test really wrote before the older page had loaded', E.early.ready === false && E.early.seen === 0, E.early);
  ok('and that writing was merged with the page, not written over it', E.after === n0 + 1 && E.hasEarly, { E, n0 });
  await p.reload({ waitUntil: 'load', timeout: 240000 }); await boot();
  const E2 = await p.evaluate(async (rk) => { await window.__inkReady; return (gannoGetStrokes(rk) || []).length; }, target);
  ok('and it is all still there after another reopen', E2 === n0 + 1, { E2, n0 });

  // ---------- 6. the erase record is stored compressed ----------
  const ER = await p.evaluate(() => { const st = gannoGetStrokes('pad_C959/ch9/t5'); const keep = st.slice(0, -60); gannoSaveStrokes('pad_C959/ch9/t5', keep); const raw = localStorage.getItem('sh_erased_v1') || ''; return { first: raw.charAt(0), dead: window.__erase.isDead('pad_C959/ch9/t5', st[st.length - 1]) }; });
  ok('the erase record is stored compressed and still works', ER.first !== '{' && ER.dead === true, ER);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  await br.close();
  console.log(`inktier: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
