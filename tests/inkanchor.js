// SECTION: Notes pad
// Ink must stay on the paragraph it was drawn over when the LESSON CONTENT
// CHANGES - a new build inserting a diagram, worked example or definition table
// above it. The column anchor could not see that: it pins ink to #app's outer
// box, which does not move when content is inserted inside it, so every stroke
// below the insertion was left behind by exactly the inserted height.
//
// ON A REAL LESSON THIS TIME. The first version of this suite navigated with a
// URL hash, and this app has no hash router - every launch lands on Today, so
// twelve assertions about lesson ink ran against the Today page for months and
// passed because Today has paragraphs too. The route is `section`, it is
// reached through go(), and the page is the one from her photo of doubled ink.
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:' + (process.env.PORT || 8901) + '/index.html';
const TOL = 6;              // px; sub-line drift is invisible and acceptable
const LESSON = { name: 'section', courseId: 'D684', chId: 'g2', secId: 'k_ds' };
const ROUTE = 'section_D684_g2_k_ds';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d || ''))); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  // Boot lands on Today; the lesson is opened through the app's own router.
  // Every reload comes back through here.
  const openLesson = async () => {
    await page.waitForTimeout(1500);
    return page.evaluate(async (L) => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      try { gannoSetActive(true); } catch (e) {}       // the pen layer starts off since 18.603
      go({ name: 'class', courseId: L.courseId }); await w(1200);
      go(L); await w(3500);                            // visual blocks inject after first paint
      // the paragraph every check draws on: the first real line of prose
      window.__para = () => [...document.querySelectorAll('#app p, #app li')].find(e => (e.textContent || '').trim().length >= 60);
      return { routeKey: ganno.routeKey, paras: document.querySelectorAll('#app p, #app li').length, hasPara: !!window.__para() };
    }, LESSON);
  };

  await page.goto(B, { waitUntil: 'networkidle' });
  let at = await openLesson();
  ok('the suite is on a real lesson, not Today', at.routeKey === ROUTE && at.hasPara, JSON.stringify(at));

  // Draw a stroke across a paragraph, exactly as the pen commit path does.
  const drew = await page.evaluate(() => {
    const p = window.__para();
    if (!p) return null;
    const r = p.getBoundingClientRect();
    const y = r.top + scrollY + r.height / 2;
    const s = { type: 'pen', color: '#e11', width: 3,
      points: [{ x: r.left + 10, y, p: 0.5 }, { x: r.left + 200, y, p: 0.5 }],
      anchor: gannoGetAnchor(), orient: gannoOrient(), _ts: 1 };
    s.tanchor = gannoMakeTextAnchor(s);
    const arr = gannoGetStrokes(ganno.routeKey);
    arr.push(s); gannoSaveStrokes(ganno.routeKey, arr); gannoPersistNow();
    return { hasAnchor: !!s.tanchor, sig: s.tanchor && s.tanchor.sig, para: p.textContent.trim().slice(0, 40) };
  });
  ok('stroke gets a paragraph anchor', drew && drew.hasAnchor, JSON.stringify(drew));
  ok('the anchor is that paragraph', drew && drew.sig && drew.sig.indexOf(drew.para.slice(0, 20)) !== -1, JSON.stringify(drew));

  const driftNow = () => page.evaluate(() => {
    const p = window.__para();
    const r = p.getBoundingClientRect();
    const mid = r.top + scrollY + r.height / 2;
    const s = gannoGetStrokes(ganno.routeKey)[0];
    if (!s) return { err: 'stroke lost' };
    const t = gannoTextReanchor(s) || gannoReanchor(s, gannoGetAnchor());
    return { drift: Math.round(t.points[0].y - mid), via: gannoTextReanchor(s) ? 'paragraph' : 'column' };
  });

  await page.reload({ waitUntil: 'networkidle' });
  at = await openLesson();
  ok('the lesson is back after a reload', at.routeKey === ROUTE, JSON.stringify(at));
  let d = await driftNow();
  ok('reload keeps ink on its line', Math.abs(d.drift) <= TOL, JSON.stringify(d));

  // A new build inserts a block ABOVE the annotated paragraph.
  d = await page.evaluate(() => {
    const p0 = window.__para();
    const host = p0.parentElement;
    const box = document.createElement('div');
    box.style.height = '260px'; box.textContent = 'newly added diagram block';
    host.insertBefore(box, host.firstChild);
    gannoTaInvalidate();
    const p = window.__para();
    const r = p.getBoundingClientRect();
    const mid = r.top + scrollY + r.height / 2;
    const s = gannoGetStrokes(ganno.routeKey)[0];
    const t = gannoTextReanchor(s) || gannoReanchor(s, gannoGetAnchor());
    return { drift: Math.round(t.points[0].y - mid), via: gannoTextReanchor(s) ? 'paragraph' : 'column', samePara: p === p0 };
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
    // Ink saved with NO paragraph anchor, sitting 260px above where it belongs -
    // exactly the state a note is left in by a build that inserted a block.
    const p = window.__para();
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
    const p2 = window.__para();
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
    const p = window.__para();
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

  // leave nothing behind for the next suite
  await page.evaluate(() => { try { gannoSaveStrokes(ganno.routeKey, []); gannoPersistNow(); } catch (e) {} });

  ok('no page errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  console.log('inkanchor: ' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail ? 1 : 0);
})();
