// "The pages stall for a second when the notes are updated and the little
// message about the notes is displayed."
// A pull unpacked the whole copy and walked every page of ink even when the
// copy was the one this device had just pushed. Now the packed text is
// fingerprinted: the same copy is skipped outright, and a lesson is only
// re-rendered when a pull actually merged something.
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:' + (process.env.PORT || 8901) + '/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d)))); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await browser.newPage({ viewport: { width: 1194, height: 834 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(B, { waitUntil: 'load', timeout: 240000 });
  await p.waitForTimeout(12000);
  const R = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    // a fake sync server in the page: one blob, replaced on POST
    const server = { data: null, updatedAt: 0 };
    window.fetch = async (url, opts) => {
      const u = String(url);
      if (u.indexOf('/sync') === -1) return { ok: false, status: 404, json: async () => ({ error: 'nope' }) };
      if (opts && opts.method === 'POST') { const b = JSON.parse(opts.body); server.data = b.data; server.updatedAt = Date.now(); return { ok: true, status: 200, json: async () => ({ ok: true }) }; }
      return { ok: true, status: 200, json: async () => (server.data ? { data: server.data, updatedAt: server.updatedAt } : { empty: true }) };
    };
    localStorage.setItem('sh_sync_v1', JSON.stringify({ hash: 'deadbeef', label: 'test' }));
    // some ink so the copy is not trivial
    const PK = 'pad_C959/ch4/s1';
    const mk = (n) => Array.from({ length: n }, (_, i) => ({ type: 'pen', color: '#1d4ed8', width: 3, ts: Date.now() - 100000 + i, _ts: Date.now() - 100000 + i, points: Array.from({ length: 40 }, (_, j) => ({ x: 100 + j * 12.37, y: 150 + i * 30 + j * 0.51 })) }));
    gannoSaveStrokes(PK, mk(120)); await w(100);
    // count lesson re-renders
    let renders = 0; const _r = window.render; window.render = function(){ renders++; return _r.apply(this, arguments); };
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }); await w(1500);
    renders = 0;
    await window.__sync.push();
    out.pushedHash = window.__sync._lastBlob();
    const t0 = performance.now();
    const r1 = await window.__sync.pull();
    out.pull1 = { ms: Math.round(performance.now() - t0), same: !!r1.same, ink: r1.ink, renders };
    // the other device pushes a different copy: it must still be applied
    const snap = window.__sync._snapshot();
    snap.ink[PK] = (snap.ink[PK] || []).concat([{ type: 'pen', color: '#16a34a', width: 3, ts: Date.now(), _ts: Date.now(), points: [{ x: 100, y: 900 }, { x: 500, y: 903 }] }]);
    server.data = window.__sync._pack(snap); server.updatedAt = Date.now();
    renders = 0;
    const r2 = await window.__sync.pull();
    out.pull2 = { same: !!r2.same, ink: r2.ink, renders, green: (gannoGetStrokes(PK) || []).filter(s => s.color === '#16a34a').length };
    // pulling that same copy again is skipped, and does not re-render the lesson
    renders = 0;
    const r3 = await window.__sync.pull();
    out.pull3 = { same: !!r3.same, ink: r3.ink, renders };
    // a copy that differs but merges nothing (same strokes, different order of keys) must not re-render a lesson
    const snap2 = window.__sync._snapshot(); snap2.at = Date.now() + 5;
    server.data = window.__sync._pack(snap2); server.updatedAt = Date.now();
    renders = 0;
    const r4 = await window.__sync.pull();
    out.pull4 = { same: !!r4.same, ink: r4.ink, history: r4.history, renders };
    localStorage.removeItem('sh_sync_v1');
    return out;
  });
  ok('after a push, pulling the same copy is recognised and skipped', R.pull1.same && !R.pull1.ink, R.pull1);
  ok('the skipped pull is fast and does not re-render the lesson', R.pull1.ms < 150 && R.pull1.renders === 0, R.pull1);
  ok('a different copy from the other device is still applied', !R.pull2.same && R.pull2.ink === 1 && R.pull2.green === 1, R.pull2);
  ok('a real merge re-renders the lesson once', R.pull2.renders >= 1, R.pull2);
  ok('pulling that copy again is skipped', R.pull3.same && R.pull3.renders === 0, R.pull3);
  ok('a copy that merges nothing does not re-render the lesson', !R.pull4.ink && !R.pull4.history && R.pull4.renders === 0, R.pull4);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  await browser.close();
  console.log(`syncskip: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
