// SECTION: Notes pad
// "Have we finally solved the writing issue?" - "Please let's fix it."
//
// Writing copied on top of itself, OFFSET. The realign bar moved lesson ink
// in place: same stroke objects, new coordinates. The erase record only sees a
// stroke that leaves the list, and the sync merge knew a stroke only by its
// shape, so the other device's copy of the ink from before the move no longer
// matched, came back as new writing beside the moved copy, and every later
// sync could stack it again.
//   - a moved stroke is a new object: the old shape goes on the erase record
//   - the merge also knows a stroke by the moment it was drawn (_ts)
//   - the repair sweep removes the offset copies already on a page
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:' + (process.env.PORT || 8901) + '/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 320)))); };
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
  const LESSON = { name: 'section', courseId: 'D684', chId: 'g2', secId: 'k_ds' };
  const openLesson = async (p) => p.evaluate(async (L) => { const w = ms => new Promise(r => setTimeout(r, ms)); go(L); await w(2500); return ganno.routeKey; }, LESSON);
  const ys = (p, rk) => p.evaluate((rk) => (gannoGetStrokes(rk) || []).map(s => Math.round(s.points[0].y)), rk);
  const snap = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.__sync._snapshot())));
  const apply = (p, S) => p.evaluate((S) => window.__sync._apply(S), S);
  const T0 = 1750000000000;
  const seed = (p, rk, n, y0) => p.evaluate(({ rk, n, y0, T0 }) => {
    const list = [];
    // odd strokes carry the id ink gets from 18.618; even ones are her older ink, known by shape alone
    for (let i = 0; i < n; i++) list.push({ type: 'pen', color: '#1d4ed8', width: 3, _ts: T0 + i * 1000, _uid: (i % 2) ? ('t' + i + '.abc' + i) : undefined,
      points: [{ x: 120 + i * 5, y: y0 + i * 40, p: 0.5 }, { x: 260 + i * 5, y: y0 + i * 40 + 3, p: 0.5 }, { x: 400, y: y0 + i * 40 + 1, p: 0.5 }] });
    gannoSaveStrokes(rk, list); gannoPersistNow();
    return list.length;
  }, { rk, n, y0, T0 });

  /* ================= device A: write, sync, realign, pull the old copy ================= */
  const A = await boot();
  const rk = await openLesson(A);
  await A.evaluate((rk) => { gannoSaveStrokes(rk, []); localStorage.removeItem('sh_erased_v1'); }, rk);
  ok('the lesson has a route key for its ink', /^section_/.test(rk), rk);
  const n0 = await seed(A, rk, 3, 300);
  const S0 = await snap(A);                                   // the copy the other device (and the server) holds
  ok('device A wrote three strokes and the snapshot carries them', n0 === 3 && (S0.ink[rk] || []).length === 3, { n0, keys: Object.keys(S0.ink) });
  const before = await ys(A, rk);
  const moved = await A.evaluate(async (rk) => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    gannoRealignStart(); await w(100);
    ganno.realign.dx = 0; ganno.realign.dy = 60;
    gannoRealignEnd(true); await w(300);
    return (gannoGetStrokes(rk) || []).map(s => Math.round(s.points[0].y));
  }, rk);
  ok('the realign bar moved the three strokes down by 60', moved.length === 3 && moved.every((y, i) => y === before[i] + 60), { before, moved });
  const kept = await A.evaluate((rk) => (gannoGetStrokes(rk) || []).map(s => s._uid || null), rk);
  ok('a moved stroke keeps the id it was drawn with', kept[1] === 't1.abc1' && kept[0] === null, kept);
  const res1 = await apply(A, S0); await A.waitForTimeout(400);
  const after1 = await ys(A, rk);
  ok('1. pulling the copy from before the move adds nothing back', !res1.ink && after1.length === 3, { res1, after1 });
  ok('   and the ink stays where she put it', after1.every((y, i) => y === before[i] + 60), after1);
  const res1b = await apply(A, S0); await A.waitForTimeout(300);
  ok('   a second pull of the same old copy adds nothing either', !res1b.ink && (await ys(A, rk)).length === 3, res1b);
  const SA = await snap(A);
  ok('2. the snapshot after the move carries the moved strokes, and only them', (SA.ink[rk] || []).length === 3 && SA.ink[rk].every((s, i) => Math.round(s.points[0].y) === before[i] + 60), (SA.ink[rk] || []).map(s => s.points[0].y));
  await A.reload({ waitUntil: 'load', timeout: 240000 }); await A.waitForTimeout(9000); await openLesson(A);
  const afterReload = await ys(A, rk);
  ok('3. after a relaunch the page still holds three strokes, where she put them', afterReload.length === 3 && afterReload.every((y, i) => y === before[i] + 60), afterReload);

  /* ================= device B: still holds the copy from before the move ================= */
  const Bp = await boot();
  await openLesson(Bp);
  await Bp.evaluate(({ S0, rk }) => { localStorage.removeItem('sh_erased_v1'); gannoSaveStrokes(rk, S0.ink[rk]); gannoPersistNow(); }, { S0, rk });
  const bBefore = await ys(Bp, rk);
  const resB = await apply(Bp, SA); await Bp.waitForTimeout(500);
  const bAfter = await ys(Bp, rk);
  ok('4. the other device ends with the same three strokes, moved - not six', bBefore.length === 3 && bAfter.length === 3 && bAfter.every((y, i) => y === before[i] + 60), { bBefore, bAfter, resB });

  /* ================= the sweep: offset copies already on a page ================= */
  const swept = await A.evaluate(({ rk, T0 }) => {
    const mk = (ts, y, n, uid) => { const pts = []; for (let i = 0; i < n; i++) pts.push({ x: 100 + i * 30, y: y + (i % 2), p: 0.5 }); return { type: 'pen', color: '#1d4ed8', width: 3, _ts: ts, _uid: uid, points: pts }; };
    const list = [mk(T0 + 1, 500, 4), mk(T0 + 1, 500 + 1294, 4),   // her older ink: the same stroke, and its copy a page down
                  mk(T0 + 2, 700, 4), mk(T0 + 3, 700 + 1294, 4),   // two different strokes a page apart: both stay
                  mk(T0 + 4, 900, 4), mk(T0 + 4, 900 + 1294, 5),   // same instant, different point count: both stay
                  mk(T0 + 5, 1100, 4), mk(T0 + 5, 1412, 4),        // same instant, a line or so away: both stay
                  mk(T0 + 6, 1200, 4, 'u6.x'), mk(T0 + 6, 1260, 4, 'u6.x')];   // stamped ink: a second copy of the id is a copy, whatever the shift
    gannoSaveStrokes(rk, list); gannoPersistNow();
    delete store.gannoStrokes[rk];
    const r = window.__inkRepair();
    const left = (gannoGetStrokes(rk) || []).map(s => Math.round(s.points[0].y));
    return { dropped: r.dropped, left };
  }, { rk, T0 });
  ok('5. the repair removes the page-down copy of older ink and keeps the one she positioned', swept.dropped === 2 && swept.left.indexOf(500) !== -1 && swept.left.indexOf(1794) === -1, swept);
  ok('   two different strokes a page apart both stay', swept.left.indexOf(700) !== -1 && swept.left.indexOf(1994) !== -1, swept.left);
  ok('   the same instant with a different point count is not a copy', swept.left.indexOf(900) !== -1 && swept.left.indexOf(2194) !== -1, swept.left);
  ok('   the same instant a line away is never touched', swept.left.indexOf(1100) !== -1 && swept.left.indexOf(1412) !== -1, swept.left);
  ok('   a second copy of a stamped stroke is removed whatever its shift', swept.left.indexOf(1200) !== -1 && swept.left.indexOf(1260) === -1 && swept.left.length === 8, swept.left);
  await A.evaluate((rk) => { gannoSaveStrokes(rk, []); gannoPersistNow(); localStorage.removeItem('sh_erased_v1'); }, rk);
  await Bp.evaluate((rk) => { gannoSaveStrokes(rk, []); gannoPersistNow(); localStorage.removeItem('sh_erased_v1'); }, rk);
  const drawn = await A.evaluate(async (rk) => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    gannoSetActive(true); store.gannoAllowFinger = true; await w(200);
    const el = document.querySelector('#app'); const r = el.getBoundingClientRect();
    const ev = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerType: 'mouse', pointerId: 7, isPrimary: true, buttons: 1 }));
    ev('pointerdown', r.left + 200, r.top + 300); for (let i = 1; i <= 8; i++) ev('pointermove', r.left + 200 + i * 12, r.top + 300 + i); ev('pointerup', r.left + 300, r.top + 308); await w(300);
    const list = gannoGetStrokes(rk) || [];
    const last = list[list.length - 1];
    gannoSetActive(false); store.gannoAllowFinger = false;
    return { n: list.length, uid: last && last._uid, ts: last && last._ts };
  }, rk);
  ok('a stroke drawn with the pen is stamped with an id', drawn.n === 1 && typeof drawn.uid === 'string' && drawn.uid.length > 6 && drawn.ts > 0, drawn);
  ok('no page errors on either device', A.errs.length === 0 && Bp.errs.length === 0, A.errs.concat(Bp.errs).slice(0, 3));
  await browser.close();
  console.log('inkrealign: ' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail ? 1 : 0);
})();
