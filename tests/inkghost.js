// SECTION: Notes pad
// "The issue with the writing being copied all of the page really really needs
//  to be fixed" - a photo of D684 10.1 with her six margin notes written once
//  and shown twice, the second copy one page lower.
//
// The sync merge lays ink it cannot match by shape or id onto a fresh page
// below hers so two sittings never overlap. Her own strokes, coming back from
// the other device at slightly different coordinates (a re-anchor, a realign,
// or ink from before ids existed), matched neither and became that second
// sitting: the same handwriting, a page down. A translated copy of a freehand
// stroke is that stroke - two hands never agree on every point to a third of a
// unit - and that rule now holds at the render, at the merge and in the sweep.
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:' + (process.env.PORT || 8901) + '/index.html';
const LESSON = { name: 'section', courseId: 'D684', chId: 'g3', secId: 'x10_1' };
const ROUTE = 'section_D684_g3_x10_1';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 300)))); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const openLesson = async () => { await page.waitForTimeout(1500); return page.evaluate(async (L) => { const w = ms => new Promise(r => setTimeout(r, ms)); try { gannoSetActive(true); } catch (e) {} go({ name: 'class', courseId: L.courseId }); await w(1200); go(L); await w(3000); return ganno.routeKey; }, LESSON); };
  await page.goto(B, { waitUntil: 'networkidle' });
  const rk = await openLesson();
  ok('the suite is on the lesson from her photo', rk === ROUTE, rk);
  // six margin notes, as the pen commit path stores them
  const wrote = await page.evaluate(() => {
    const p = [...document.querySelectorAll('#app p, #app td')].find(e => (e.textContent || '').trim().length >= 40);
    const r = p.getBoundingClientRect(); const y0 = r.top + scrollY + 6;
    // each note has its own shape, as handwriting does (a translated repeat would rightly be judged a ghost)
    const mk = (i) => { const pts = []; for (let k = 0; k < 14; k++) pts.push({ x: r.left + 20 + i * 90 + k * (3 + (i % 3)) + ((k * (i + 2)) % 4), y: y0 + i * 3 + Math.sin(k * (1 + i * 0.37)) * (4 + i), p: 0.5 }); const s = { type: 'pen', color: '#1d4ed8', width: 3, points: pts, anchor: gannoGetAnchor(), orient: gannoOrient(), _ts: 1700000000000 + i, _uid: 'u' + i }; s.tanchor = gannoMakeTextAnchor(s); return s; };
    const arr = []; for (let i = 0; i < 6; i++) arr.push(mk(i));
    gannoSaveStrokes(ganno.routeKey, arr); gannoPersistNow(); gannoRender(gannoGetStrokes(ganno.routeKey), null);
    return { n: gannoGetStrokes(ganno.routeKey).length, paths: document.querySelectorAll('svg.ganno-svg path[data-ink]').length };
  });
  ok('six strokes written and drawn once', wrote.n === 6 && wrote.paths === 6, wrote);
  // 1. the other device's copy: the same strokes, no ids, shifted by a re-anchor's worth
  const merged = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const local = gannoGetStrokes(ganno.routeKey);
    const copies = local.map(s => { const c = JSON.parse(JSON.stringify(s)); delete c._uid; c.points = c.points.map(q => ({ x: Math.round((q.x + 0.3) * 10) / 10, y: Math.round((q.y + 31.7) * 10) / 10, p: q.p })); return c; });
    const before = local.length;
    const res = window.__sync._apply({ v: 1, at: Date.now(), store: {}, ink: { [ganno.routeKey]: copies } });
    await w(400);
    const now = gannoGetStrokes(ganno.routeKey);
    const low = Math.max(...now.map(s => Math.max(...s.points.map(q => q.y))));
    const high = Math.min(...now.map(s => Math.min(...s.points.map(q => q.y))));
    return { before, after: now.length, added: res.ink, spread: Math.round(low - high), paths: document.querySelectorAll('svg.ganno-svg path[data-ink]').length };
  });
  ok('the other device\'s copy of her own notes adds nothing - not on top, not a page below', merged.after === 6 && merged.added === 0 && merged.spread < 200, merged);
  // 2. a genuinely new stroke from the other device on a page she wrote still lands a page below (the two-sittings rule is untouched)
  const twoSit = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const pts = []; for (let k = 0; k < 14; k++) pts.push({ x: 300 + k * 7, y: 900 + Math.cos(k) * 9, p: 0.5 });
    const other = { type: 'pen', color: '#16a34a', width: 3, points: pts, _ts: 1700000009999 };
    const res = window.__sync._apply({ v: 1, at: Date.now(), store: {}, ink: { [ganno.routeKey]: [other] } });
    await w(400);
    const now = gannoGetStrokes(ganno.routeKey); const last = now[now.length - 1];
    return { after: now.length, added: res.ink, lastY: Math.round(last.points[0].y), origY: 900 };
  });
  ok('a different stroke from the other device is still added, a page below', twoSit.after === 7 && twoSit.added === 1 && twoSit.lastY >= twoSit.origY + 1000, twoSit);
  // 3. ghosts already on the device: the render shows none, and settles the page
  const ghosted = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const local = gannoGetStrokes(ganno.routeKey).slice(0, 6);
    const ghosts = local.map(s => { const c = JSON.parse(JSON.stringify(s)); delete c._uid; delete c._ts; c.points = c.points.map(q => ({ x: q.x, y: q.y + 1294, p: q.p })); return c; });
    gannoSaveStrokes(ganno.routeKey, local.concat(ghosts)); gannoPersistNow();
    const stored = gannoGetStrokes(ganno.routeKey).length;
    gannoRender(gannoGetStrokes(ganno.routeKey), null); await w(300);
    return { stored, paths: document.querySelectorAll('svg.ganno-svg path[data-ink]').length, after: gannoGetStrokes(ganno.routeKey).length, dead: (window.__erase && window.__erase.deadMap(ganno.routeKey)) ? Object.keys(window.__erase.deadMap(ganno.routeKey)).length : -1 };
  });
  ok('twelve stored, six drawn: the ghosts never reach the screen', ghosted.stored === 12 && ghosted.paths === 6, ghosted);
  ok('and the page is rewritten without them, the ghosts on the erase record', ghosted.after === 6 && ghosted.dead >= 6, ghosted);
  // 4. the ghosts do not come back through a later pull of the old copy
  const pulled = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const local = gannoGetStrokes(ganno.routeKey);
    const old = local.map(s => { const c = JSON.parse(JSON.stringify(s)); delete c._uid; c.points = c.points.map(q => ({ x: q.x, y: q.y + 1294, p: q.p })); return c; });
    const res = window.__sync._apply({ v: 1, at: Date.now() - 60000, store: {}, ink: { [ganno.routeKey]: old } });
    await w(300); return { after: gannoGetStrokes(ganno.routeKey).length, added: res.ink };
  });
  ok('a later pull of the old copy brings nothing back', pulled.after === 6 && pulled.added === 0, pulled);
  // 5. negative control: two different strokes of the same length are both kept
  const ctrl = await page.evaluate(() => {
    const a = [], b = []; for (let k = 0; k < 14; k++) { a.push({ x: 100 + k * 5, y: 700 + Math.sin(k) * 6, p: 0.5 }); b.push({ x: 100 + k * 5, y: 700 + Math.cos(k * 1.3) * 6, p: 0.5 }); }
    const r = window.__inkGhosts([{ type: 'pen', points: a }, { type: 'pen', points: b }]);
    const rect = window.__inkGhosts([{ type: 'shape', shapeKind: 'rect', start: { x: 0, y: 0 }, end: { x: 50, y: 20 } }, { type: 'shape', shapeKind: 'rect', start: { x: 0, y: 900 }, end: { x: 50, y: 920 } }]);
    return { kept: r.kept.length, dropped: r.dropped.length, rects: rect.kept.length };
  });
  ok('two different strokes of the same length are both kept, and shapes are never judged', ctrl.kept === 2 && ctrl.dropped === 0 && ctrl.rects === 2, ctrl);
  // 6. the boot sweep clears a page that was ghosted before this build
  const swept = await page.evaluate(async () => {
    const local = gannoGetStrokes(ganno.routeKey).slice(0, 3);
    const ghosts = local.map(s => { const c = JSON.parse(JSON.stringify(s)); delete c._uid; delete c._ts; c.points = c.points.map(q => ({ x: q.x, y: q.y + 2588, p: q.p })); return c; });
    // write straight into the page slot, past the render, as an older build would have left it
    const w = window.__inkWrite || null;
    gannoSaveStrokes(ganno.routeKey + '_swp', local.concat(ghosts)); gannoPersistNow();
    store.inkDupSweep = 4; saveStore();
    return gannoGetStrokes(ganno.routeKey + '_swp').length;
  });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(6000);
  const afterSweep = await page.evaluate(() => { try { delete store.gannoStrokes[ganno.routeKey + '_swp']; } catch (e) {} return { n: gannoGetStrokes(ganno.routeKey + '_swp').length, sweep: store.inkDupSweep }; });
  ok('the launch sweep clears ghosts left by an older build (' + swept + ' -> ' + afterSweep.n + ')', swept === 6 && afterSweep.n === 3 && afterSweep.sweep === 5, afterSweep);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  await browser.close();
  console.log(`inkghost: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
