// The store that gets saved must not carry her handwriting.
//
// Ink was split out into one storage slot per page, but store.gannoStrokes is
// still the in-memory cache those slots are read into. Every path that
// serialized the store walked that cache too: the backup mirror, the sync
// snapshot, the export, the clobber guard on every single save, and - worst -
// the two worker paths, which then wrote the result back into the big store,
// putting the ink back where the split had taken it out of.
//
// Her diagnostics: saveStore breadcrumbs of 188 to 507ms, six of them inside
// two seconds while she was writing. That is the skipping she reported.
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
    const mk = (i, j) => { const p = []; for (let k = 0; k < 80; k++) p.push({ x: 100 + k * 8 + j, y: 80 + (j % 40) * 20, p: 0.5 }); return { type: 'pen', color: '#1b1b1b', width: 2, points: p, _ts: i * 1000 + j }; };

    // the shape her device reports: nineteen pages of handwriting
    const keys = [];
    for (let i = 0; i < 19; i++) {
      const rk = 'pad_LEAN/g' + i; keys.push(rk);
      const s = []; for (let j = 0; j < 140; j++) s.push(mk(i, j));
      gannoSaveStrokes(rk, s);
    }
    await w(400);
    for (const rk of keys) gannoGetStrokes(rk);      // opening a page caches it
    const pagesInMemory = Object.keys(store.gannoStrokes || {}).length;

    // and a store big enough that the clobber guard does not short-circuit.
    // It compares the PACKED blob against 5000 chars, so the padding has to be
    // hard to compress or it lands under the bar and the guard never runs.
    let seed = 1234567;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    let pad = '';
    while (pad.length < 90000) pad += rnd().toString(36).slice(2);
    store.__leanPad = pad;

    const withInk = JSON.stringify(store).length;
    const lean = window.__storeJSON ? window.__storeJSON().length : withInk;
    // storeJSON must put the cache back exactly as it found it
    const pagesAfterSerialize = Object.keys(store.gannoStrokes || {}).length;
    const strokesStillThere = keys.every(rk => (store.gannoStrokes[rk] || []).length === 140);

    // Get a real blob on disk so the guard takes its expensive branch. The
    // write is coalesced and packed in a worker, so this has to wait for it to
    // land - the assertion below checks that it did.
    _persistStore();
    let diskBefore = 0;
    for (let i = 0; i < 20 && diskBefore <= 5000; i++) { await w(500); diskBefore = (localStorage.getItem(STORE_KEY) || '').length; }

    // now time saves the way the pen path makes them
    const times = [];
    for (let n = 0; n < 8; n++) {
      store.xp = (store.xp || 0) + 1;
      const t0 = performance.now();
      saveStore();
      times.push(performance.now() - t0);
      await w(40);
    }
    times.sort((a, b) => a - b);
    const worstSaveMs = +times[times.length - 1].toFixed(1);

    // let every deferred writer land, then check nothing put the ink back
    await w(4000);
    const diskAfter = (localStorage.getItem(STORE_KEY) || '').length;

    // the loader must still find no ink in the big store
    let inkInStoreBlob = false;
    try {
      const raw = localStorage.getItem(STORE_KEY) || '';
      const j = raw.charAt(0) === '{' ? raw : (LZString.decompressFromUTF16(raw) || '');
      const parsed = JSON.parse(j);
      inkInStoreBlob = !!(parsed.gannoStrokes && Object.keys(parsed.gannoStrokes).length);
    } catch (e) { inkInStoreBlob = 'unreadable'; }

    // and every page is still readable from its own slot
    const readBack = keys.map(rk => gannoGetStrokes(rk).length);

    return { pagesInMemory, withInkKB: Math.round(withInk / 1024), leanKB: Math.round(lean / 1024),
             pagesAfterSerialize, strokesStillThere, worstSaveMs, diskBeforeChars: diskBefore,
             diskBeforeKB: Math.round(diskBefore / 1024), diskAfterKB: Math.round(diskAfter / 1024),
             inkInStoreBlob, allPagesRead: readBack.every(n => n === 140) };
  });

  ok('the harness really did load nineteen pages into memory', R.pagesInMemory === 19, R.pagesInMemory + ' pages');
  ok('the store serializes without the handwriting', R.leanKB * 20 < R.withInkKB,
     R.leanKB + 'KB lean vs ' + R.withInkKB + 'KB with the ink cache attached');
  ok('serializing leaves the in-memory cache exactly as it was',
     R.pagesAfterSerialize === 19 && R.strokesStillThere === true,
     R.pagesAfterSerialize + ' pages back, strokes intact: ' + R.strokesStillThere);
  ok('the clobber guard is actually being exercised', R.diskBeforeChars > 5000,
     'blob on disk ' + R.diskBeforeChars + ' chars; the guard only runs above 5000');
  ok('a save does not stall while she is writing', R.worstSaveMs < 30,
     'worst of 8 saves ' + R.worstSaveMs + 'ms');
  ok('nothing writes the handwriting back into the big store', R.inkInStoreBlob === false,
     'store blob ' + R.diskBeforeKB + 'KB -> ' + R.diskAfterKB + 'KB, ink present: ' + R.inkInStoreBlob);
  ok('the big store did not grow by the size of the ink', R.diskAfterKB < R.diskBeforeKB * 1.5 + 5,
     R.diskBeforeKB + 'KB -> ' + R.diskAfterKB + 'KB');
  ok('every page is still readable from its own slot', R.allPagesRead === true);
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(`storelean: ${pass}/${pass + fail} passed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
