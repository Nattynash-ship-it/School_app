// Ink must stay on the paragraph it was drawn over when the LESSON CONTENT
// CHANGES - a new build inserting a diagram, worked example or definition table
// above it. The column anchor could not see that: it pins ink to #app's outer
// box, which does not move when content is inserted inside it, so every stroke
// below the insertion was left behind by exactly the inserted height.
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:8901/index.html';
const TOL = 6;              // px; sub-line drift is invisible and acceptable
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d || ''))); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(B, { waitUntil: 'networkidle' });
  await page.goto(B + '#lesson/D687/ch1/s1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);

  // Draw a stroke across a paragraph, exactly as the pen commit path does.
  const drew = await page.evaluate(() => {
    const app = document.getElementById('app');
    const p = app.querySelector('p, li, h3');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    const y = r.top + scrollY + r.height / 2;
    const s = { type: 'pen', color: '#e11', width: 3,
      points: [{ x: r.left + 10, y, p: 0.5 }, { x: r.left + 200, y, p: 0.5 }],
      anchor: gannoGetAnchor(), orient: gannoOrient(), _ts: 1 };
    s.tanchor = gannoMakeTextAnchor(s);
    const arr = gannoGetStrokes(ganno.routeKey);
    arr.push(s); gannoSaveStrokes(ganno.routeKey, arr); gannoPersistNow();
    return { hasAnchor: !!s.tanchor, sig: s.tanchor && s.tanchor.sig };
  });
  ok('stroke gets a paragraph anchor', drew && drew.hasAnchor, JSON.stringify(drew));

  const driftNow = () => page.evaluate(() => {
    const app = document.getElementById('app');
    const p = app.querySelector('p, li, h3');
    const r = p.getBoundingClientRect();
    const mid = r.top + scrollY + r.height / 2;
    const s = gannoGetStrokes(ganno.routeKey)[0];
    if (!s) return { err: 'stroke lost' };
    const t = gannoTextReanchor(s) || gannoReanchor(s, gannoGetAnchor());
    return { drift: Math.round(t.points[0].y - mid), via: gannoTextReanchor(s) ? 'paragraph' : 'column' };
  });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  let d = await driftNow();
  ok('reload keeps ink on its line', Math.abs(d.drift) <= TOL, JSON.stringify(d));

  // A new build inserts a block ABOVE the annotated paragraph.
  d = await page.evaluate(() => {
    const app = document.getElementById('app');
    const host = app.querySelector('p, li, h3').parentElement;
    const box = document.createElement('div');
    box.style.height = '260px'; box.textContent = 'newly added diagram block';
    host.insertBefore(box, host.firstChild);
    gannoTaInvalidate();
    const p = app.querySelector('p, li, h3');
    const r = p.getBoundingClientRect();
    const mid = r.top + scrollY + r.height / 2;
    const s = gannoGetStrokes(ganno.routeKey)[0];
    const t = gannoTextReanchor(s) || gannoReanchor(s, gannoGetAnchor());
    return { drift: Math.round(t.points[0].y - mid), via: gannoTextReanchor(s) ? 'paragraph' : 'column' };
  });
  ok('content added above does not move the ink', Math.abs(d.drift) <= TOL, JSON.stringify(d));
  ok('it used the paragraph anchor', d.via === 'paragraph', JSON.stringify(d));

  // Ink whose paragraph is gone must still render, via the column anchor.
  const orphan = await page.evaluate(() => {
    const s = gannoGetStrokes(ganno.routeKey)[0];
    const copy = JSON.parse(JSON.stringify(s));
    copy.tanchor = { sig: 'P|text that does not exist anywhere on this page', n: 0, dx: 0, dy: 0 };
    return { fellBack: gannoTextReanchor(copy) === null };
  });
  ok('a stroke whose paragraph is gone falls back, not lost', orphan.fellBack);


  // ---- Realign: put ink that an earlier build left behind back on its line ----
  const realign = await page.evaluate(async () => {
    const app = document.getElementById('app');
    // Ink saved with NO paragraph anchor, sitting 260px above where it belongs -
    // exactly the state a note is left in by a build that inserted a block.
    const p = app.querySelector('p, li, h3');
    const r = p.getBoundingClientRect();
    const mid = r.top + scrollY + r.height / 2;
    const s = { type: 'pen', color: '#e11', width: 3,
      points: [{ x: r.left + 10, y: mid - 260, p: 0.5 }, { x: r.left + 200, y: mid - 260, p: 0.5 }],
      anchor: gannoGetAnchor(), orient: gannoOrient(), _ts: 2 };
    gannoSaveStrokes(ganno.routeKey, [s]);
    gannoRealignStart();
    const started = gannoRealignActive() && !!document.querySelector('.ganno-realign-bar');
    ganno.realign.dy = 260;                    // what dragging it down does
    gannoRealignEnd(true);
    const after = gannoGetStrokes(ganno.routeKey)[0];
    const p2 = app.querySelector('p, li, h3');
    const r2 = p2.getBoundingClientRect();
    const mid2 = r2.top + scrollY + r2.height / 2;
    return {
      started,
      barGone: !document.querySelector('.ganno-realign-bar'),
      drift: Math.round(after.points[0].y - mid2),
      pinned: !!(after.tanchor && after.tanchor.sig)
    };
  });
  ok('realign mode opens with a banner', realign.started, JSON.stringify(realign));
  ok('realign puts drifted ink back on its line', Math.abs(realign.drift) <= TOL, JSON.stringify(realign));
  ok('realign pins the ink to that paragraph', realign.pinned, JSON.stringify(realign));
  ok('realign banner closes on Done', realign.barGone, JSON.stringify(realign));


  // ---- Idle migration: ink from before paragraph anchoring gets its fingerprint
  //      after the page settles, off the render path, and is saved with it. ----
  const migrated = await page.evaluate(async () => {
    const app = document.getElementById('app');
    const p = app.querySelector('p, li, h3');
    const r = p.getBoundingClientRect();
    const y = r.top + scrollY + r.height / 2;
    const s = { type: 'pen', color: '#1a1', width: 3,
      points: [{ x: r.left + 20, y, p: 0.5 }, { x: r.left + 120, y, p: 0.5 }],
      anchor: gannoGetAnchor(), orient: gannoOrient(), _ts: 3 };   // no tanchor
    gannoSaveStrokes(ganno.routeKey, [s]);
    gannoRender(gannoGetStrokes(ganno.routeKey), null);
    const atRender = !!s.tanchor;                       // must NOT be computed inline
    await new Promise(res => setTimeout(res, 2500));    // let the idle callback run
    gannoPersistNow();
    const saved = gannoGetStrokes(ganno.routeKey)[0];
    return { atRender, afterIdle: !!(saved && saved.tanchor && saved.tanchor.sig) };
  });
  ok('unanchored ink is not fingerprinted during render', migrated.atRender === false, JSON.stringify(migrated));
  ok('unanchored ink is fingerprinted once the page is idle', migrated.afterIdle, JSON.stringify(migrated));

  ok('no page errors', errs.length === 0, errs.join(' | '));
  console.log(`inkanchor: ${pass}/${pass + fail} passed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
