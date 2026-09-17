// "The notes are still overlapping when there is a new update."
//
// Erased ink came back. The sync merges by union and had no record of a single
// stroke being erased, so every pull after an erase - the boot pull that runs
// four seconds into every launch, so every update - put the erased strokes
// straight back: a cleared page refilled, an erased stroke returned, and a page
// she had split by sitting got its stacked original back underneath.
//
// What has to hold:
//   1. a stroke erased with the eraser stays erased after a pull of an older copy
//   2. a page cleared stays cleared after a pull of an older copy
//   3. a page split by sitting does not get the stacked original back
//   4. the OTHER device, receiving this device's copy, erases the same strokes
//   5. ink written on the other device after the erase still arrives
//   6. undoing an erase brings the stroke back for good (the other device too)
//   7. all of it survives a reload (an update is a reload)
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:' + (process.env.PORT || 8901) + '/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d)))); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const boot = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1194, height: 834 } });
    const p = await ctx.newPage();
    p.on('dialog', d => d.accept());
    p.errs = []; p.on('pageerror', e => p.errs.push(String(e).slice(0, 160)));
    await p.goto(B, { waitUntil: 'load', timeout: 240000 });
    await p.waitForTimeout(12000);
    return p;
  };
  const K = 'C959/ch4/s1', PK = 'pad_C959/ch4/s1';
  const openPad = async (p) => {
    await p.evaluate(async (K) => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const [c, ch, s] = K.split('/');
      go({ name: 'section', courseId: c, chId: ch, secId: s }); await w(2000);
      window.__notesPanel.open(); await w(1200); window.__notesPanel.tab('write'); await w(400);
      // no pen bar in the way, no old ink on this page
      try { if (typeof gannoSetActive === 'function') gannoSetActive(false); } catch (e) {}
    }, K);
  };
  const N = (p) => p.evaluate(() => window.__notesPanel.state().strokes);
  const padRect = (p) => p.evaluate(() => { const s = document.getElementById('mn-ink').getBoundingClientRect(); const d = document.getElementById('mn-pages').getBoundingClientRect();
    return { l: Math.max(s.left, d.left), t: Math.max(s.top, d.top), r: Math.min(s.right, d.right), b: Math.min(s.bottom, d.bottom) }; });
  const draw = async (p, fx, fy, len) => {
    const r = await padRect(p);
    const x0 = r.l + (r.r - r.l) * fx, y0 = r.t + (r.b - r.t) * fy;
    await p.mouse.move(x0, y0); await p.mouse.down();
    for (let i = 1; i <= 10; i++) await p.mouse.move(x0 + len * i / 10, y0 + 4 * i / 10);
    await p.mouse.up(); await p.waitForTimeout(150);
    return { x0, y0 };
  };
  const strokesOf = (p) => p.evaluate((PK) => (gannoGetStrokes(PK) || []).map(s => ({ ts: s.ts, n: s.points.length, y: Math.round(s.points[0].y), c: s.color })), PK);
  const snap = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.__sync._snapshot())));
  const apply = (p, S) => p.evaluate((S) => { const r = window.__sync._apply(S); return r; }, S);

  /* ================= device A ================= */
  const A = await boot();
  await A.evaluate((PK) => { try { gannoSaveStrokes(PK, []); } catch (e) {} localStorage.removeItem('sh_erased_v1'); }, PK);
  await openPad(A);
  await A.click('#mn-tools .mn-tool[data-t="pen"]').catch(() => {});
  await draw(A, 0.2, 0.15, 60); await A.waitForTimeout(200);            // warm-up: the first stroke after opening is swallowed by focus
  await A.evaluate((PK) => { gannoSaveStrokes(PK, []); if (window.__notesPanel.reloadInk) window.__notesPanel.reloadInk(); else { window.__notesPanel.close(); window.__notesPanel.open(); } }, PK);
  await draw(A, 0.2, 0.25, 300); await draw(A, 0.2, 0.40, 300); await draw(A, 0.2, 0.55, 300);
  const drawn = await N(A);
  ok('device A wrote three strokes', drawn === 3, drawn);
  const S0 = await snap(A);                                    // what the sync holds after A's push
  ok('the snapshot carries the three strokes', (S0.ink[PK] || []).length === 3, Object.keys(S0.ink));
  const before = await strokesOf(A);

  /* ---- 1. erase one with the eraser ---- */
  await A.click('#mn-tools .mn-tool[data-t="erase"]'); await A.waitForTimeout(120);
  const r = await padRect(A);
  const ex = r.l + (r.r - r.l) * 0.2 + 150, ey = r.t + (r.b - r.t) * 0.40 + 2;
  await A.mouse.move(ex, ey - 30); await A.mouse.down();
  for (let i = 1; i <= 8; i++) await A.mouse.move(ex, ey - 30 + 60 * i / 8);
  await A.mouse.up(); await A.waitForTimeout(300);
  const afterErase = await strokesOf(A);
  const gone = before.filter(b => !afterErase.some(a => a.ts === b.ts && a.n === b.n));
  ok('the eraser removed the middle stroke (cut into pieces)', gone.length === 1 && afterErase.length !== before.length, { before, afterErase });
  const res1 = await apply(A, S0); await A.waitForTimeout(400);
  const afterPull = await strokesOf(A);
  const back = afterPull.filter(a => gone.some(g => g.ts === a.ts && g.n === a.n));
  ok('1. after pulling the older copy, the erased stroke is still gone', back.length === 0, { added: res1.ink, afterPull });
  ok('1b. nothing was added by that pull', !res1.ink, res1);

  /* ---- 6. undo the erase: the stroke comes back and stays back ---- */
  await A.click('#mn-tools .mn-tool[data-t="undo"]'); await A.waitForTimeout(300);
  const undone = await strokesOf(A);
  ok('undo restored the erased stroke', undone.some(a => gone.some(g => g.ts === a.ts && g.n === a.n)) && undone.length === 3, undone);
  const S6 = await snap(A);
  ok('6a. a snapshot after the undo carries the restored stroke', (S6.ink[PK] || []).some(s => gone.some(g => g.ts === s.ts && g.n === s.points.length)));

  /* ---- 2. clear the page ---- */
  await A.click('#mn-tools .mn-tool[data-t="clear"]'); await A.waitForTimeout(400);   // confirm auto-accepted
  ok('the page is cleared', (await N(A)) === 0, await N(A));
  const res2 = await apply(A, S0); await A.waitForTimeout(400);
  ok('2. after pulling the older copy, the cleared page stays empty', (await N(A)) === 0 && !res2.ink, { n: await N(A), res: res2 });

  /* ---- 3. split by sitting, then pull the stacked original ---- */
  await A.evaluate(async (PK) => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const t0 = Date.now() - 7200000;
    const mk = (n, y0, ts, color) => Array.from({ length: n }, (_, i) => ({ type: 'pen', color, width: 3, ts: ts + i * 1000, _ts: ts + i * 1000,
      points: [{ x: 100 + i * 5, y: y0 + i * 40 }, { x: 700, y: y0 + i * 40 + 3 }] }));
    const early = mk(4, 150, t0, '#1d4ed8'), late = mk(3, 170, t0 + 3600000, '#ea580c');
    gannoSaveStrokes(PK, early.concat(late)); await w(100);
    if (window.__notesPanel.reloadInk) window.__notesPanel.reloadInk(); else { window.__notesPanel.close(); await w(300); window.__notesPanel.open(); await w(800); } await w(300);
  }, PK);
  const S3 = await snap(A);                                    // the stacked page, as the other device holds it
  ok('the stacked page has 7 strokes on 1 page', (S3.ink[PK] || []).length === 7 && (await A.evaluate((K) => window.__notesPanel.ink(K).pages, K)) === 1);
  const sp = await A.evaluate(() => window.__notesPanel.splitSessions());
  await A.waitForTimeout(400);
  const afterSplit = await A.evaluate(({K, PK}) => ({ pages: window.__notesPanel.ink(K).pages, n: (gannoGetStrokes(PK) || []).length }), {K, PK});
  ok('split moved the second sitting to page 2', sp && sp.moved === 3 && afterSplit.pages === 2 && afterSplit.n === 7, { sp, afterSplit });
  const res3 = await apply(A, S3); await A.waitForTimeout(400);
  const afterSplitPull = await A.evaluate(({K, PK}) => ({ pages: window.__notesPanel.ink(K).pages, n: (gannoGetStrokes(PK) || []).length }), {K, PK});
  ok('3. pulling the stacked copy after a split adds nothing back', afterSplitPull.n === 7 && afterSplitPull.pages === 2 && !res3.ink, { res3, afterSplitPull });

  /* ---- 7. an update is a reload ---- */
  const SA = await snap(A);                                    // A's copy after everything above
  await A.reload({ waitUntil: 'load', timeout: 240000 }); await A.waitForTimeout(12000);
  const res7 = await apply(A, S3); await A.waitForTimeout(400);
  const afterReload = await A.evaluate(({K, PK}) => ({ pages: window.__notesPanel.ink(K).pages, n: (gannoGetStrokes(PK) || []).length }), {K, PK});
  ok('7. after a reload the older copy still adds nothing back', afterReload.n === 7 && afterReload.pages === 2 && !res7.ink, { res7, afterReload });

  /* ================= device B ================= */
  const Bp = await boot();
  await Bp.evaluate(({S3, PK}) => { localStorage.removeItem('sh_erased_v1'); gannoSaveStrokes(PK, S3.ink[PK]); }, {S3, PK});   // B still holds the stacked page
  const bBefore = await Bp.evaluate((PK) => (gannoGetStrokes(PK) || []).length, PK);
  const resB = await apply(Bp, SA); await Bp.waitForTimeout(500);
  const bAfter = await Bp.evaluate(({K, PK}) => ({ pages: window.__notesPanel.ink(K).pages, n: (gannoGetStrokes(PK) || []).length,
    early: (gannoGetStrokes(PK) || []).filter(s => s.color === '#1d4ed8').length, late: (gannoGetStrokes(PK) || []).filter(s => s.color === '#ea580c').length }), {K, PK});
  ok('4. the other device ends up with the same split page: 7 strokes on 2 pages, nothing stacked', bBefore === 7 && bAfter.n === 7 && bAfter.pages === 2, { bBefore, bAfter, resB });

  /* ---- 5. ink the other device writes after the erase still arrives ---- */
  const SB = await Bp.evaluate(async (PK) => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const list = (gannoGetStrokes(PK) || []).slice();
    list.push({ type: 'pen', color: '#16a34a', width: 3, ts: Date.now(), _ts: Date.now(), points: [{ x: 120, y: 900 }, { x: 600, y: 903 }] });
    gannoSaveStrokes(PK, list); await w(100);
    return JSON.parse(JSON.stringify(window.__sync._snapshot()));
  }, PK);
  const res5 = await apply(A, SB); await A.waitForTimeout(400);
  const aFinal = await A.evaluate((PK) => ({ n: (gannoGetStrokes(PK) || []).length, green: (gannoGetStrokes(PK) || []).filter(s => s.color === '#16a34a').length }), PK);
  ok('5. a stroke written on the other device afterwards still arrives', res5.ink === 1 && aFinal.green === 1 && aFinal.n === 8, { res5, aFinal });

  /* ---- 8. hand-drawn ink, pushed, then the app reloads (an update) and pulls its own copy back ---- */
  const K8 = 'C959/ch4/s2', PK8 = 'pad_C959/ch4/s2';
  await A.evaluate((PK8) => { try { gannoSaveStrokes(PK8, []); } catch (e) {} }, PK8);
  await openPad(A);
  await A.evaluate(async (K8) => { const w = ms => new Promise(r => setTimeout(r, ms)); const [c, ch, s] = K8.split('/'); go({ name: 'section', courseId: c, chId: ch, secId: s }); await w(1800); window.__notesPanel.open(); await w(1000); window.__notesPanel.tab('write'); await w(300); }, K8);
  await A.click('#mn-tools .mn-tool[data-t="pen"]').catch(() => {});
  await draw(A, 0.2, 0.15, 60); await A.waitForTimeout(200);
  await A.evaluate((PK8) => { gannoSaveStrokes(PK8, []); if (window.__notesPanel.reloadInk) window.__notesPanel.reloadInk(); else { window.__notesPanel.close(); window.__notesPanel.open(); } }, PK8);
  await draw(A, 0.2, 0.25, 250); await draw(A, 0.2, 0.40, 250);
  const n8 = await A.evaluate((PK8) => (gannoGetStrokes(PK8) || []).length, PK8);
  const S8 = await snap(A);                                    // pushed from memory, full precision
  await A.reload({ waitUntil: 'load', timeout: 240000 }); await A.waitForTimeout(12000);   // reloaded: the slot holds rounded copies
  const res8 = await apply(A, S8); await A.waitForTimeout(400);
  const after8 = await A.evaluate(({K8, PK8}) => ({ n: (gannoGetStrokes(PK8) || []).length, pages: window.__notesPanel.ink(K8).pages }), {K8, PK8});
  ok('8. a hand-drawn page pulled back after a reload is not doubled onto a new page', n8 === 2 && after8.n === 2 && after8.pages === 1 && !res8.ink, { n8, after8, res8 });

  ok('no page errors on either device', A.errs.length === 0 && Bp.errs.length === 0, A.errs.concat(Bp.errs).slice(0, 3));
  await browser.close();
  console.log(`inkkeep: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
