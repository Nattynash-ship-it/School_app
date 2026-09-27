// SECTION: Notes pad
// "My notes are disappearing, why aren't they saved automatically."
// Notebook handwriting, gone after closing the app, after switching lessons,
// after an update, and between iPad and phone.
//
// The cause, measured: the notebook holds its own copy of the page it shows.
// A sync pull (one runs a few seconds into every launch) merged the other
// device's writing into that page and left the copy as it was, so her next
// stroke saved the old copy over the page. The strokes it dropped went on the
// erase record and were deleted on the other device as well.
//
// What has to hold:
//   1. writing that syncs in while the notebook is open is shown at once
//   2. and survives her next stroke, on both devices, and a reopen
//   3. same when the notebook is closed but still holding that page
//   4. anything that leaves a page is kept in a recovery bin and can be put back
//   5. every page with writing is listed, one tap away
//   (negative control: with the hand-over disabled, the old loss reappears)
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8901, B = `http://127.0.0.1:${PORT}/index.html`;
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 500)))); };

(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const boot = async (vp) => { const ctx = await br.newContext({ viewport: vp }); const p = await ctx.newPage(); p.on('dialog', d => d.accept()); p.errs = []; p.on('pageerror', e => p.errs.push(String(e).slice(0, 160)));
    await p.goto(B, { waitUntil: 'load', timeout: 240000 }); await p.waitForTimeout(11000); return p; };
  let cloud = null, cloudAt = 0;
  const sync = async (p) => { const r = await p.evaluate(async ({ cloud, cloudAt }) => { let res = null; if (cloud) { cloud.at = cloudAt; res = window.__sync._apply(cloud); } await new Promise(r => setTimeout(r, 300)); return { res, S: JSON.parse(JSON.stringify(window.__sync._snapshot())) }; }, { cloud, cloudAt }); cloud = r.S; cloudAt = Date.now(); return r.res; };
  const write = (p, sec, n, row, keepClosed) => p.evaluate(async ({ sec, n, row, keepClosed }) => {
    const w = ms => new Promise(r => setTimeout(r, ms)); const NP = window.__notesPanel;
    if (!(view && view.name === 'section' && view.secId === sec)) { go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: sec }); await w(1800); }
    if (!document.body.classList.contains('mn-open')) { NP.open(); await w(1200); } NP.tab('write'); await w(200);
    const svg = document.querySelector('#mn-dock svg'); const s = NP.surface();
    const mk = (t, x, y) => new PointerEvent(t, { pointerId: 9, pointerType: 'pen', isPrimary: true, clientX: x, clientY: y, pressure: 0.5, bubbles: true, cancelable: true, buttons: t === 'pointerup' ? 0 : 1 });
    for (let st = 0; st < n; st++) { const x0 = s.x + 30 + st * 40, y0 = s.y + 40 + row * 34; svg.dispatchEvent(mk('pointerdown', x0, y0)); for (let k = 1; k <= 18; k++) svg.dispatchEvent(mk('pointermove', x0 + k * 1.8 + Math.random(), y0 + Math.sin(k + st) * 7 + Math.random())); svg.dispatchEvent(mk('pointerup', x0 + 34, y0)); await w(40); }
    await w(400); if (keepClosed) { NP.close(); await w(300); }
    return (gannoGetStrokes('pad_C959/ch4/' + sec) || []).length; }, { sec, n, row, keepClosed });
  const count = (p, sec) => p.evaluate((sec) => (gannoGetStrokes('pad_C959/ch4/' + sec) || []).length, sec);
  const shown = (p) => p.evaluate(() => window.__notesPanel.state().strokes);

  const A = await boot({ width: 1194, height: 834 }), P = await boot({ width: 390, height: 844 });

  // ---------- 1-2. the notebook is open on the page the sync merges into ----------
  await write(A, 's1', 5, 0); await sync(A); await sync(P);
  await write(P, 's1', 3, 1); await sync(P);
  await sync(A);
  ok('writing from the other device shows in the open notebook the moment it syncs in', await shown(A) === 8, { shown: await shown(A), stored: await count(A, 's1') });
  await write(A, 's1', 1, 3);
  ok('and her next stroke keeps it: nothing is saved over', await count(A, 's1') === 9, await count(A, 's1'));
  await sync(A); await sync(P);
  ok('both devices end with every stroke', await count(A, 's1') === 9 && await count(P, 's1') === 9, { ipad: await count(A, 's1'), phone: await count(P, 's1') });

  // ---------- 3. the notebook is closed but still holding that page ----------
  await write(A, 's2', 2, 0, true); await sync(A); await sync(P);
  await write(P, 's2', 2, 1); await sync(P); await sync(A);
  await write(A, 's2', 1, 2);
  await sync(A); await sync(P);
  ok('same with the notebook closed while the sync lands', await count(A, 's2') === 5 && await count(P, 's2') === 5, { ipad: await count(A, 's2'), phone: await count(P, 's2') });

  // ---------- reopen both ----------
  for (const p of [A, P]) { await p.reload({ waitUntil: 'load', timeout: 240000 }); await p.waitForTimeout(11000); }
  await sync(A); await sync(P);
  ok('and after both apps are closed and reopened', await count(A, 's1') === 9 && await count(P, 's1') === 9 && await count(A, 's2') === 5 && await count(P, 's2') === 5,
     { a1: await count(A, 's1'), p1: await count(P, 's1'), a2: await count(A, 's2'), p2: await count(P, 's2') });

  // ---------- negative control: without the hand-over the old loss returns ----------
  const N = await boot({ width: 1194, height: 834 }), M = await boot({ width: 390, height: 844 });
  cloud = null; cloudAt = 0;
  for (const p of [N, M]) await p.evaluate(() => { const sink = new Proxy({}, { set: () => true, get: () => undefined }); Object.defineProperty(window, '__inkArrivals', { get: () => sink, set: () => {}, configurable: true }); });
  await write(N, 's3', 5, 0); await sync(N); await sync(M); await write(M, 's3', 3, 1); await sync(M); await sync(N); await write(N, 's3', 1, 3); await sync(N); await sync(M);
  ok('negative control: with the hand-over switched off the phone\'s writing is lost again (the test can see the bug)', await count(N, 's3') < 9, { ipad: await count(N, 's3') });

  // ---------- 4. the recovery bin ----------
  const bin = {};
  Object.assign(bin, await A.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)); const NP = window.__notesPanel; const out = {};
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }); await w(1800); NP.open(); await w(1000); NP.tab('write'); await w(200);
    out.before = NP.state().strokes;
    NP.undo(); await w(200); NP.undo(); await w(200);         // two strokes leave the page
    out.afterUndo = NP.state().strokes;
    return out;
  }));
  await sync(A); await sync(P);                       // the phone carries out the iPad's erase
  const other = await P.evaluate(async () => { await window.__inkBin.flush(); const r = await window.__inkBin.list('pad_C959/ch4/s1'); return { why: r.map(x => x.why), stored: (gannoGetStrokes('pad_C959/ch4/s1') || []).length }; });
  ok('an erase carried out from the other device lands in that device\'s bin too', other.why.some(w => /other device/.test(w)) && other.stored === 7, other);
  Object.assign(bin, await A.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)); const NP = window.__notesPanel; const out = {};
    await window.__inkBin.flush(); await w(300);
    const recs = await window.__inkBin.list('pad_C959/ch4/s1'); out.recs = recs.length; out.kept = recs.reduce((a, r) => a + r.n, 0); out.why = recs.map(r => r.why);
    NP.recover(); await w(900);
    const sheet = document.getElementById('nk-sheet'); out.sheet = !!sheet; out.cards = sheet ? sheet.querySelectorAll('[data-nk-rec]').length : 0; out.preview = sheet ? sheet.querySelectorAll('[data-nk-rec] svg path').length : 0;
    sheet.querySelectorAll('[data-nk-put]').forEach(b => b.click()); await w(900);
    out.afterPut = NP.state().strokes; out.stored = (gannoGetStrokes('pad_C959/ch4/s1') || []).length;
    out.left = (await window.__inkBin.list('pad_C959/ch4/s1')).length;
    if (document.getElementById('nk-sheet')) document.getElementById('nk-sheet').remove();
    return out;
  }));
  ok('writing that leaves a page is kept in the recovery bin', bin.recs >= 1 && bin.kept === 2 && bin.afterUndo === bin.before - 2, bin);
  ok('the recovery sheet lists it with a picture of the writing', bin.sheet && bin.cards >= 1 && bin.preview >= 2, bin);
  ok('and Put back returns it to the page, saved', bin.afterPut === bin.before && bin.stored === bin.before && bin.left === 0, bin);
  await A.reload({ waitUntil: 'load', timeout: 240000 }); await A.waitForTimeout(11000);
  ok('the put-back writing is still there after the app is reopened', await count(A, 's1') === bin.before, await count(A, 's1'));
  const reset = await A.evaluate(async () => { window.__inkDrop('pad_C959/ch4/s2'); await window.__inkBin.flush(); const r = await window.__inkBin.list('pad_C959/ch4/s2'); return { gone: (gannoGetStrokes('pad_C959/ch4/s2') || []).length, why: r.map(x => x.why), n: r.reduce((a, x) => a + x.n, 0) }; });
  ok('a page removed by a reset is kept whole in the bin', reset.why.some(w => /reset/.test(w)) && reset.n === 5, reset);

  // ---------- 5. every page with writing, one tap away ----------
  const pages = await A.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)); const NP = window.__notesPanel;
    go({ name: 'today' }); await w(1200); NP.open(); await w(800); NP.allPages(); await w(500);
    const sheet = document.getElementById('nk-sheet'); const rows = sheet ? [...sheet.querySelectorAll('[data-nk-go]')].map(b => b.getAttribute('data-nk-go')) : [];
    const b = sheet && sheet.querySelector('[data-nk-go="C959/ch4/s1"]'); if (b) b.click(); await w(2200);
    return { rows, view: view.name, sec: view.secId, open: document.body.classList.contains('mn-open'), key: NP.state().key, shown: NP.state().strokes };
  });
  ok('the notebook lists every page that has writing', pages.rows.includes('C959/ch4/s1'), pages);
  ok('and one tap opens that lesson with its page in the notebook', pages.view === 'section' && pages.sec === 's1' && pages.open && pages.key === 'C959/ch4/s1' && pages.shown > 0, pages);
  ok('no page errors', [A, P].every(p => p.errs.length === 0), A.errs.concat(P.errs).slice(0, 3));
  await br.close();
  console.log(`notekeep: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
