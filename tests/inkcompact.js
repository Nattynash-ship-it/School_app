// Writing must never wait on a repack of the whole page.
//
// Handwriting is stored as a packed slot plus an append log: a pen lift writes
// only the new stroke. Every twentieth stroke the page was repacked in full,
// and her diagnostics measured that repack at 4.4 to 8.2 SECONDS on a page that
// had grown to 1.5MB packed - a multi-second freeze every twentieth pen lift,
// during several of which iOS killed the app.
//
// The log is durable on its own: it is read back alongside the slot, so a
// repack that has not happened yet costs a slower read and nothing else. So it
// belongs at idle, never on the pen.
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:8901/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d || ''))); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1194, height: 834 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(B, { waitUntil: 'load', timeout: 240000 });
  await page.waitForTimeout(12000);

  const R = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const rk = 'pad_test_compaction';
    const mkStroke = (i) => {
      const pts = [];
      for (let j = 0; j < 60; j++) pts.push({ x: 100 + j * 9 + i, y: 90 + (i % 40) * 24 + Math.sin(j) * 3, p: 0.5 });
      return { type: 'pen', color: '#1b1b1b', width: 2, points: pts, _ts: i };
    };
    const strokes = [];
    // build a page big enough that a repack is expensive
    for (let i = 0; i < 260; i++) { strokes.push(mkStroke(i)); gannoSaveStrokes(rk, strokes.slice()); }
    gannoPersistNow();
    await w(300);
    // force the page to be packed, so the slot is large
    await new Promise(r => (window.requestIdleCallback || setTimeout)(r, { timeout: 1500 }));
    await w(1800);
    const slotAfterIdle = (localStorage.getItem('gsk:' + rk) || '').length;

    // now time 30 more pen lifts - none of them may pay for a repack
    const times = [];
    for (let i = 260; i < 290; i++) {
      strokes.push(mkStroke(i));
      const t0 = performance.now();
      gannoSaveStrokes(rk, strokes.slice());
      gannoPersistNow();
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const worst = times[times.length - 1], median = times[Math.floor(times.length / 2)];

    // everything drawn is still readable, repacked or not
    const readBack = gannoGetStrokes(rk).length;
    return { slotAfterIdle, worstLiftMs: +worst.toFixed(1), medianLiftMs: +median.toFixed(1),
             readBack, drawn: strokes.length,
             hasIdleCompaction: typeof window.requestIdleCallback === 'function' };
  });

  ok('the page really did pack to something substantial', R.slotAfterIdle > 20000, R.slotAfterIdle + ' chars');
  ok('no pen lift pays for a repack of the page', R.worstLiftMs < 120,
     'worst ' + R.worstLiftMs + 'ms, median ' + R.medianLiftMs + 'ms across 30 lifts');
  ok('every stroke drawn is still there', R.readBack === R.drawn, R.readBack + ' of ' + R.drawn);
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(`inkcompact: ${pass}/${pass + fail} passed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
