// SECTION: Notes pad
// "Why are the notes like this" - a photo of one page carrying two lessons'
// worth of writing, one laid over the other.
//
// It was one lesson (D684/g4/x5_1 covers touchscreens AND the CPU), written on
// both devices: the phone had not pulled the iPad's page yet, so it looked
// blank, she wrote on it, and the next sync unioned the two sets of strokes
// onto the same page. Nothing was lost; it was unreadable.
//
// What has to hold:
//   1. a page written on BOTH devices merges with the other device's ink on a
//      NEW page below hers, never on top - and says so
//   2. a page written on one device only still merges exactly as before
//   3. a page already stacked can be split by writing session, reversibly
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:' + (process.env.PORT || 8901) + '/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d)))); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await browser.newPage({ viewport: { width: 1194, height: 834 } });
  p.on('dialog', d => d.accept());
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(B, { waitUntil: 'load', timeout: 240000 });
  await p.waitForTimeout(13000);

  const R = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    const K = 'C959/ch4/s1', PK = 'pad_C959/ch4/s1';
    const H = (window.__notesPanel.limits().pageH) || 0;   // absent before the fix
    const split = () => { try { return window.__notesPanel.splitSessions(); } catch (e) { return null; } };
    out.pageH = H;
    const mk = (n, y0, ts, color) => Array.from({ length: n }, (_, i) => ({
      type: 'pen', color, width: 3, ts: ts + i * 1000, _ts: ts + i * 1000,
      points: [{ x: 100 + i * 5, y: y0 + i * 40 }, { x: 700, y: y0 + i * 40 + 3 }] }));
    const yRange = list => list.length ? [Math.min(...list.map(s => Math.min(...s.points.map(q => q.y)))), Math.max(...list.map(s => Math.max(...s.points.map(q => q.y))))] : null;
    const toasts = [];
    const _toast = window.toast; window.toast = function (m) { toasts.push(String(m)); try { return _toast.apply(this, arguments); } catch (e) {} };

    /* ---- 1. both devices wrote the same page ---- */
    const t0 = Date.now() - 7200000;
    const mine = mk(5, 150, t0, '#1d4ed8');            // iPad, two hours ago
    gannoSaveStrokes(PK, mine.slice()); await wait(50);
    const theirs = mk(4, 160, t0 + 3600000, '#ea580c'); // phone, an hour ago, same rows
    const snapIn = { v: 1, at: Date.now(), store: {}, ink: {} }; snapIn.ink[PK] = theirs;
    const res = window.__sync._apply(snapIn);
    await wait(200);
    const merged = gannoGetStrokes(PK) || [];
    out.two = {
      added: res.ink, total: merged.length,
      mineRange: yRange(merged.filter(s => s.color === '#1d4ed8')),
      theirsRange: yRange(merged.filter(s => s.color === '#ea580c')),
      pages: window.__notesPanel.ink(K).pages,
      toast: toasts.filter(t => /other device/i.test(t))[0] || null,
      padIndex: (store.padNotes || {})[K] || null
    };

    /* ---- 2. one device only: plain union, nothing moves ---- */
    const K2 = 'C959/ch4/s2', PK2 = 'pad_C959/ch4/s2';
    const base = mk(3, 200, t0, '#1d4ed8');
    gannoSaveStrokes(PK2, base.slice()); await wait(50);
    const superset = base.concat(mk(2, 500, t0 + 5000, '#1d4ed8'));   // the other device has mine plus more
    const snap2 = { v: 1, at: Date.now(), store: {}, ink: {} }; snap2.ink[PK2] = superset;
    window.__sync._apply(snap2); await wait(200);
    const m2 = gannoGetStrokes(PK2) || [];
    out.one = { total: m2.length, range: yRange(m2), pages: window.__notesPanel.ink(K2).pages };

    /* ---- 3. a page already stacked: split it by writing session ---- */
    const K3 = 'C959/ch4/s3', PK3 = 'pad_C959/ch4/s3';
    const early = mk(4, 150, t0, '#1d4ed8'), late = mk(3, 170, t0 + 3600000, '#ea580c');
    gannoSaveStrokes(PK3, early.concat(late)); await wait(50);
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's3' }); await wait(2200);
    window.__notesPanel.open(); await wait(1400); window.__notesPanel.tab('write'); await wait(300);
    out.splitBefore = { pages: window.__notesPanel.ink(K3).pages, strokes: (gannoGetStrokes(PK3) || []).length };
    const sp = split();
    await wait(400);
    const after = gannoGetStrokes(PK3) || [];
    out.split = { result: sp, pages: window.__notesPanel.ink(K3).pages, total: after.length,
                  earlyRange: yRange(after.filter(s => s.color === '#1d4ed8')), lateRange: yRange(after.filter(s => s.color === '#ea580c')) };
    // and it is one Undo away
    const undoBtn = document.querySelector('#mn-tools .mn-tool[data-t="undo"]');
    if (undoBtn) undoBtn.click(); await wait(400);
    const undone = gannoGetStrokes(PK3) || [];
    out.undo = { pages: window.__notesPanel.ink(K3).pages, lateRange: yRange(undone.filter(s => s.color === '#ea580c')) };
    // a page with one session has nothing to split, and says so
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's2' }); await wait(1800);
    window.__notesPanel.open(); await wait(1200);
    out.splitOne = split();
    return out;
  });

  ok('the page height is exposed to the merge', R.pageH > 1000, R.pageH);
  ok('both devices\' strokes are kept', R.two.total === 9 && R.two.added === 4, R.two);
  ok('hers stay where they were', R.two.mineRange && R.two.mineRange[0] === 150, R.two.mineRange);
  ok('the other device\'s land on a new page below, not on top', R.two.theirsRange && R.two.theirsRange[0] >= R.pageH && R.two.theirsRange[0] < 2 * R.pageH, [R.two.theirsRange, R.pageH]);
  ok('the page count grew to two', R.two.pages === 2, R.two.pages);
  ok('and it says so', !!R.two.toast && /page 2/.test(R.two.toast), R.two.toast);
  ok('the notebook index knows the new size', R.two.padIndex && R.two.padIndex.n === 9, R.two.padIndex);
  // judged against the real page height even on a build that does not expose it,
  // so the control reports this line truthfully rather than failing on the divisor
  ok('one-device sync still merges in place', R.one.total === 5 && R.one.range[1] < (R.pageH || 1294) && R.one.pages === 1, R.one);
  ok('a stacked page reads as one page before the split', R.splitBefore.pages === 1 && R.splitBefore.strokes === 7, R.splitBefore);
  ok('split moves the later session to page 2 and keeps the earlier', R.split.result && R.split.result.moved === 3 && R.split.pages === 2 && R.split.earlyRange[0] === 150 && R.split.lateRange[0] >= R.pageH, R.split);
  ok('nothing is lost in the split', R.split.total === 7, R.split.total);
  ok('one Undo puts it back', R.undo.pages === 1 && R.undo.lateRange && R.undo.lateRange[0] < R.pageH, R.undo);
  ok('a single-session page reports nothing to split', R.splitOne && R.splitOne.moved === 0, R.splitOne);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));

  console.log('inkmerge: ' + pass + '/' + (pass + fail) + ' passed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
