// SECTION: Notes pad
// "In the notes can you allow me to alter the heaviness of the pencil? The
//  options now are too thin and too heavy."
//
// Six named points with more than half again between each leaves real gaps -
// the nib she wants sits between Fine and Medium, and no tap could reach it.
// The names stay; a slider under them reaches every weight in between, with
// PROPORTIONAL travel so the fine end is not crushed into the first few pixels.
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:' + (process.env.PORT || 8901) + '/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 320)))); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await browser.newPage({ viewport: { width: 1194, height: 834 } });
  p.on('dialog', d => d.accept());
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(B, { waitUntil: 'load', timeout: 240000 }); await p.waitForTimeout(12000);

  const openPicker = () => p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const dock = document.getElementById('mn-dock');
    const closed = dock.querySelector('.mn-pop');
    if (closed) closed.remove();
    dock.querySelector('#mn-tools .mn-tool[data-t="width"]').click(); await w(260);
    return !!dock.querySelector('.mn-pop');
  });
  const slide = (pos) => p.evaluate(async (pos) => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const sl = document.querySelector('#mn-dock .mn-pop .mn-fine-sl');
    sl.value = String(pos);
    sl.dispatchEvent(new Event('input', { bubbles: true }));
    sl.dispatchEvent(new Event('change', { bubbles: true }));
    await w(60);
    return { w: store.padPrefs.w, cap: document.querySelector('#mn-dock .mn-pop .mn-fine-t').textContent,
             lit: [...document.querySelectorAll('#mn-dock .mn-pop .mn-size')].filter(r => r.classList.contains('on')).length };
  }, pos);

  /* Against a build without the slider this must REPORT, not throw: a negative
     control that crashes proves nothing about which checks the fix carries. */
  const hasApi = await p.evaluate(() => !!(window.__notesPanel && typeof window.__notesPanel.weightTravel === 'function'));
  if (!hasApi) {
    ['the named points are still there, all six', 'the six named rows and a weight slider sit in the same picker',
     'the slider opens on the weight she has, and says so in words', 'a dot beside it shows the weight at the same scale as the rows',
     'a weight between fine and medium is reachable', 'and it is named as what it is, with no row lit',
     'landing on a named weight lights that row and uses its name', 'equal moves change the weight by equal fractions, end to end',
     'so medium falls near the middle of the travel, not at one end', 'the travel runs from finer than extra fine to marker',
     'every gap between two named weights holds several reachable ones', 'the pen draws at the weight she dragged to',
     'and dragging the weight selects the pen', 'the weight survives a relaunch, and the picker opens on it',
     'an old pad that only ever had a named weight still opens on it'].forEach(n => ok(n, false, 'this build has no pen-weight slider'));
    await browser.close();
    console.log('penweight: ' + pass + '/' + (pass + fail) + ' passed');
    process.exit(1);
  }

  const R = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }); await w(2000);
    window.__notesPanel.open(); await w(1200); window.__notesPanel.tab('write'); await w(400);
    gannoSaveStrokes('pad_C959/ch4/s1', []);
    if (window.__notesPanel.reloadInk) window.__notesPanel.reloadInk(); await w(300);
    store.padPrefs = store.padPrefs || {}; store.padPrefs.w = 1.4;
    const NP = window.__notesPanel, t = NP.weightTravel();
    return { names: NP.weights().map(x => x.name), ws: NP.weights().map(x => x.w), min: t.min, max: t.max, steps: t.steps };
  });
  ok('the named points are still there, all six', R.names.length === 6 && R.ws[0] === 0.5 && R.ws[5] === 5.0, R);
  ok('the picker opens', await openPicker());

  const has = await p.evaluate(() => {
    const pop = document.querySelector('#mn-dock .mn-pop');
    const sl = pop.querySelector('.mn-fine-sl');
    return { rows: pop.querySelectorAll('.mn-size').length, slider: !!sl, type: sl && sl.type,
             min: sl && +sl.min, max: sl && +sl.max, at: sl && +sl.value, cap: pop.querySelector('.mn-fine-t').textContent,
             dot: !!pop.querySelector('.mn-fine-w .mn-dot') };
  });
  ok('the six named rows and a weight slider sit in the same picker', has.rows === 6 && has.slider && has.type === 'range', has);
  ok('the slider opens on the weight she has, and says so in words', has.cap === 'Medium' && has.at === (await p.evaluate(() => window.__notesPanel.weightPos(1.4))), has);
  ok('a dot beside it shows the weight at the same scale as the rows', has.dot, has);

  // the gap she could not reach: between Fine (0.9) and Medium (1.4)
  const mid = await p.evaluate(() => Math.round((window.__notesPanel.weightPos(0.9) + window.__notesPanel.weightPos(1.4)) / 2));
  const between = await slide(mid);
  ok('a weight between fine and medium is reachable', between.w > 0.9 && between.w < 1.4, between);
  ok('and it is named as what it is, with no row lit', /between fine and medium/i.test(between.cap) && between.lit === 0, between);

  const onName = await slide(await p.evaluate(() => window.__notesPanel.weightPos(2.2)));
  ok('landing on a named weight lights that row and uses its name', Math.abs(onName.w - 2.2) < 0.02 && onName.lit === 1 && onName.cap === 'Broad', onName);

  // proportional travel: equal moves change the weight by equal fractions
  const prop = await p.evaluate(() => {
    const t = window.__notesPanel.weightTravel(), S = t.steps, at = n => t.stops[Math.round(n)];
    const r1 = at(S * 0.25) / at(0), r2 = at(S * 0.5) / at(S * 0.25), r3 = at(S * 0.75) / at(S * 0.5), r4 = at(S) / at(S * 0.75);
    return { r1, r2, r3, r4, half: at(S / 2), ends: [at(0), at(S)] };
  });
  const rs = [prop.r1, prop.r2, prop.r3, prop.r4];
  ok('equal moves change the weight by equal fractions, end to end',
     Math.max(...rs) / Math.min(...rs) < 1.05, prop);
  ok('so medium falls near the middle of the travel, not at one end', Math.abs(prop.half - 1.4) < 0.15, prop.half);
  ok('the travel runs from finer than extra fine to marker', prop.ends[0] === 0.4 && prop.ends[1] === 5.0, prop.ends);

  // every gap between named points is genuinely covered
  const cover = await p.evaluate(() => {
    const NP = window.__notesPanel, seen = NP.weightTravel().stops, W = NP.weights();
    return W.slice(0, -1).map((o, i) => seen.filter(w => w > o.w + 0.005 && w < W[i + 1].w - 0.005).length);
  });
  ok('every gap between two named weights holds several reachable ones', cover.every(n => n >= 5), cover);

  // it is the pen that is being set: a stroke drawn after carries the weight
  const drew = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const pop = document.querySelector('#mn-dock .mn-pop');
    const sl = pop.querySelector('.mn-fine-sl');
    sl.value = String(window.__notesPanel.weightPos(1.15)); sl.dispatchEvent(new Event('input', { bubbles: true })); sl.dispatchEvent(new Event('change', { bubbles: true })); await w(80);
    const want = store.padPrefs.w;
    document.querySelector('#mn-dock .mn-pop') && document.querySelector('#mn-dock .mn-pop').remove();
    const ink = document.getElementById('mn-ink'), r = ink.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + 90, r.top + 120) || ink;
    const ev = (type, x, y, b) => t.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: 'pen', pointerId: 21, isPrimary: true, buttons: b === undefined ? 1 : b, pressure: 0.6 }));
    ev('pointerdown', r.left + 90, r.top + 120);
    for (let i = 1; i <= 10; i++) { ev('pointermove', r.left + 90 + i * 5, r.top + 120 + (i % 2) * 5); await w(8); }
    ev('pointerup', r.left + 140, r.top + 120, 0); await w(400);
    const list = gannoGetStrokes('pad_C959/ch4/s1') || [];
    return { want, n: list.length, width: list.length ? list[list.length - 1].width : null, tool: window.__notesPanel.state().tool };
  });
  ok('the pen draws at the weight she dragged to', drew.n >= 1 && Math.abs(drew.width - drew.want) < 0.005, drew);
  ok('and dragging the weight selects the pen', drew.tool === 'pen', drew.tool);

  // it is remembered
  await p.reload({ waitUntil: 'load', timeout: 240000 }); await p.waitForTimeout(10000);
  const kept = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }); await w(2000);
    window.__notesPanel.open(); await w(1200); window.__notesPanel.tab('write'); await w(400);
    document.querySelector('#mn-dock #mn-tools .mn-tool[data-t="width"]').click(); await w(260);
    const pop = document.querySelector('#mn-dock .mn-pop');
    return { w: store.padPrefs.w, at: +pop.querySelector('.mn-fine-sl').value, cap: pop.querySelector('.mn-fine-t').textContent };
  });
  ok('the weight survives a relaunch, and the picker opens on it', Math.abs(kept.w - 1.15) < 0.02 && kept.at === (await p.evaluate(() => window.__notesPanel.weightPos(1.15))), kept);
  ok('an old pad that only ever had a named weight still opens on it', await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    store.padPrefs.w = 3.4; document.querySelector('#mn-dock .mn-pop').remove();
    document.querySelector('#mn-dock #mn-tools .mn-tool[data-t="width"]').click(); await w(260);
    const pop = document.querySelector('#mn-dock .mn-pop');
    return pop.querySelector('.mn-fine-t').textContent === 'Bold' && +pop.querySelector('.mn-fine-sl').value === window.__notesPanel.weightPos(3.4);
  }));
  await p.evaluate(() => { const pop = document.querySelector('#mn-dock .mn-pop'); if (pop) pop.remove(); store.padPrefs.w = 1.4; gannoSaveStrokes('pad_C959/ch4/s1', []); });
  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  await browser.close();
  console.log('penweight: ' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail ? 1 : 0);
})();
