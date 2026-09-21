// SECTION: Notes pad
// "The same issue is happening where when I write a word once it's being
//  copied multiple times on the page."
//
// The packed ink slot and its append log are two separate localStorage writes.
// A kill in between (iOS ends backgrounded tabs whenever it likes) left the
// slot already holding the strokes AND the log still holding them, so the next
// launch read the same writing twice. Measured on the build before this one:
// a six-stroke word came back as ELEVEN strokes, and stayed doubled on every
// launch after, because the one-time repair sweep had already run.
//
// The slot now carries a generation, in the same entry as the strokes, and
// every log line is stamped with the generation it was appended to.
const { chromium } = require('playwright');
const B = "http://127.0.0.1:" + (process.env.PORT || 8901) + "/index.html";
let bad = 0;
const ck = (n, c, d) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + JSON.stringify(d))); if (!c) bad++; };
(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await br.newPage({ viewport: { width: 834, height: 1112 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.goto(B, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);

  const write = (rk, n, from) => p.evaluate(([rk, n, from]) => {
    const arr = gannoGetStrokes(rk).slice();
    for (let i = 0; i < n; i++) {
      arr.push({ type: 'pen', color: '#0000ff', width: 3, _id: from + i, _ts: 1700000000000 + from + i,
        points: [{ x: 40 + i * 20, y: 200, p: 0.5 }, { x: 55 + i * 20, y: 186, p: 0.5 }] });
      gannoSaveStrokes(rk, arr.slice());
    }
    try { gannoPersistNow(); } catch (e) {}
    return arr.length;
  }, [rk, n, from]);

  const read = (rk) => p.evaluate((rk) => {
    const a = gannoGetStrokes(rk) || [];
    const ids = a.map(s => s._id);
    return { n: a.length, distinct: new Set(ids).size, copies: ids.length - new Set(ids).size, ids: ids.slice(0, 14) };
  }, rk);

  // A. the crash window: repack lands, the kill beats the log removal
  await write('c1', 6, 500);
  await p.evaluate(() => {
    const keep = localStorage.getItem('gsl:c1') || '';
    const arr = gannoGetStrokes('c1');
    __inkTestRepack('c1', arr);              // the app's own repack
    localStorage.setItem('gsl:c1', keep);    // ...and the tab dies here
  }).catch(async () => {
    // no test hook - drive it through the public path instead
    await p.evaluate(() => {
      const keep = localStorage.getItem('gsl:c1') || '';
      const arr = gannoGetStrokes('c1');
      arr.push(arr[arr.length - 1]); arr.pop();          // force a non-append save => rewrite
      gannoSaveStrokes('c1', arr.slice());
      localStorage.setItem('gsl:c1', keep);
    });
  });
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  let r = await read('c1');
  ck('a word written once reads back once', r.n === 6 && r.copies === 0, r);
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  r = await read('c1');
  ck('and stays right on the next launch', r.n === 6 && r.copies === 0, r);

  // B. nothing is LOST when the kill lands before the repack
  await write('c2', 5, 600);
  await p.evaluate(() => { /* no repack at all - log holds the tail */ });
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  r = await read('c2');
  ck('ink written and never repacked survives', r.n === 5 && r.copies === 0, r);

  // C. an erase followed by the same crash must not resurrect what she rubbed out
  await write('c3', 6, 700);
  await p.evaluate(() => {
    const keep = localStorage.getItem('gsl:c3') || '';
    let arr = gannoGetStrokes('c3').filter((s, i) => i < 3);   // rub out the last three
    gannoSaveStrokes('c3', arr);                                // => rewrite, new generation
    localStorage.setItem('gsl:c3', keep);                       // stale log comes back
    try { gannoPersistNow(); } catch (e) {}
  });
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  r = await read('c3');
  ck('erased ink stays erased', r.n === 3 && r.copies === 0, r);

  // D. appending after a repack still works
  await write('c4', 4, 800);
  await p.evaluate(() => { const a = gannoGetStrokes('c4').filter((s, i) => i !== 1); gannoSaveStrokes('c4', a); });
  await write('c4', 3, 850);
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  r = await read('c4');
  ck('erase then keep writing', r.n === 6 && r.copies === 0, r);

  // E. a page damaged by the OLD format (bare json log lines over a packed slot)
  await p.evaluate(() => {
    const mk = i => ({ type: 'pen', color: '#0000ff', width: 3, _id: 900 + i, _ts: 1700000009000 + i,
      points: [{ x: 40 + i * 20, y: 300, p: 0.5 }, { x: 55 + i * 20, y: 286, p: 0.5 }] });
    const arr = [mk(0), mk(1), mk(2), mk(3)];
    const j = v => JSON.stringify(v, (k, val) => (typeof val === 'number' && (k === 'x' || k === 'y' || k === 'anchorY')) ? Math.round(val * 10) / 10 : val);
    localStorage.setItem('gsk:c5', JSON.stringify(arr));                       // legacy: bare array
    localStorage.setItem('gsl:c5', arr.slice(1).map(j).join('\n') + '\n');     // the stale log on top
  });
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  r = await read('c5');
  ck('a page already doubled reads back clean', r.n === 4 && r.copies === 0, r);

  console.log('errs', JSON.stringify(errs.slice(0, 3)));
  console.log('INKDOUBLE ' + (6 - bad) + '/6');
  await br.close();
  process.exit(bad ? 1 : 0);
})();
