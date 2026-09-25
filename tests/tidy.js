// SECTION: Notes pad
// Tidy writing. "As I write, format the text to look formatted and aligned."
// A beat after the pen stops, the line just written is levelled, dropped onto
// the nearest rule and de-shaken - one Undo step, and never onto a DIFFERENT
// rule than the one she wrote against. Off until she turns it on. A diagram is
// left alone. On a lesson there is no ruling, so it levels and de-shakes only.
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:' + (process.env.PORT || 8901) + '/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 300)))); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await browser.newPage({ viewport: { width: 1194, height: 834 } });
  p.on('dialog', d => d.accept());
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(B, { waitUntil: 'load', timeout: 240000 }); await p.waitForTimeout(12000);

  const R = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const out = {}, NP = window.__notesPanel;
    const K = 'C959/ch4/s1', PK = 'pad_C959/ch4/s1';
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }); await w(1800);
    try { gannoSetActive(false); } catch (e) {}
    NP.open(); await w(1200); NP.tab('write'); await w(400);
    NP.setPaper('college'); await w(200);
    const gap = NP.ruleGap();
    out.gap = gap;

    // a line of writing: five "words" along a baseline that drifts down as the
    // hand travels, each word a little shaky
    const line = (baseY, drift, x0) => {
      const made = [];
      for (let wI = 0; wI < 5; wI++) {
        const bx = (x0 || 120) + wI * 130;
        const by = baseY + drift * (wI / 4);
        const pts = [];
        for (let k = 0; k <= 14; k++) {
          const t = k / 14;
          pts.push({ x: bx + t * 100, y: by - Math.abs(Math.sin(t * Math.PI * 2)) * 22 + (k % 2 ? 1.6 : -1.6), p: 0.5 });
        }
        made.push({ type: 'pen', color: '#1d4ed8', width: 3, ts: Date.now(), _ts: Date.now(), points: pts });
      }
      return made;
    };
    const put = (list) => { const cur = (gannoGetStrokes(PK) || []).slice(); list.forEach(s => cur.push(s)); gannoSaveStrokes(PK, cur); NP.reloadInk(); };
    const clear = () => { gannoSaveStrokes(PK, []); NP.reloadInk(); };
    // the slope of a group's lower edge, in units of drop per 100 across
    const slopeOf = (list) => {
      const env = window.__tidy.envelope([].concat.apply([], list.map(s => s.points)));
      const fit = window.__tidy.fitLine(env);
      return fit ? Math.round(fit.m * 1000) / 10 : null;
    };
    const baseOf = (list) => Math.max.apply(null, [].concat.apply([], list.map(s => s.points.map(q => q.y))));
    const live = () => (gannoGetStrokes(PK) || []);

    // rules near the middle of page 1
    const rules = NP.ruleYs(600);
    const mid = rules[Math.floor(rules.length / 2)];
    out.rulesFound = rules.length;

    // ---- 1. off by default: nothing is touched
    NP.setTidy(false); clear();
    let L = line(mid + gap * 0.2, 26); put(L);
    L.forEach(s => NP.tidyQueue(s));
    out.offChanged = NP.tidyNow();
    out.offSlope = slopeOf(live());

    // ---- 2 and 3. on: levelled, and sitting on a rule
    NP.setTidy(true); clear();
    L = line(mid + gap * 0.2, 26); put(L);
    out.beforeSlope = slopeOf(live());
    out.beforeBase = Math.round(baseOf(live()));
    L.forEach(s => NP.tidyQueue(s));
    out.onChanged = NP.tidyNow();
    out.afterSlope = slopeOf(live());
    out.afterBase = Math.round(baseOf(live()));
    out.nearestRule = rules.reduce((a, b) => Math.abs(b - out.afterBase) < Math.abs(a - out.afterBase) ? b : a, rules[0]);
    out.strokeCount = live().length;
    out.ptsKept = live().every(s => s.points.length >= 10);

    // ---- 4. a second pass has nothing left to do
    live().forEach(s => NP.tidyQueue(s));
    out.secondPass = NP.tidyNow();

    // ---- 5. one Undo puts the line back exactly as written
    clear();
    L = line(mid + gap * 0.2, 26); put(L);
    const written = JSON.stringify(live().map(s => s.points.map(q => [Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10])));
    L.forEach(s => NP.tidyQueue(s)); NP.tidyNow(); await w(120);
    const tidied = JSON.stringify(live().map(s => s.points.map(q => [Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10])));
    NP.undo(); await w(200);
    const back = JSON.stringify(live().map(s => s.points.map(q => [Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10])));
    out.undo = { moved: written !== tidied, restored: back === written, n: live().length };

    // ---- 6. a line written midway between two rules is NOT dragged to either
    clear();
    const between = mid + gap * 0.5;
    L = line(between, 0); put(L);
    const baseBefore = Math.round(baseOf(live()));
    L.forEach(s => NP.tidyQueue(s));
    out.betweenChanged = NP.tidyNow();
    out.betweenBase = Math.round(baseOf(live()));
    out.betweenMoved = Math.abs(out.betweenBase - baseBefore);

    // ---- 7. a steep stroke is a drawing, and is left exactly alone
    clear();
    const steep = [{ type: 'pen', color: '#1d4ed8', width: 3, ts: Date.now(), _ts: Date.now(),
      points: Array.from({ length: 16 }, (_, k) => ({ x: 200 + k * 20, y: mid - 70 + k * 9.3, p: .5 })) }];  // ~25 degrees
    put(steep);
    const steepBefore = JSON.stringify(live().map(s => s.points.map(q => Math.round(q.y))));
    steep.forEach(s => NP.tidyQueue(s));
    out.steepChanged = NP.tidyNow();
    out.steepSame = steepBefore === JSON.stringify(live().map(s => s.points.map(q => Math.round(q.y))));

    // ---- 8. a tall drawing is left alone
    clear();
    const tall = [{ type: 'pen', color: '#1d4ed8', width: 3, ts: Date.now(), _ts: Date.now(),
      points: Array.from({ length: 20 }, (_, k) => ({ x: 200 + k * 20, y: mid - gap * 2 + k * (gap * 4 / 19), p: .5 })) }];
    put(tall); tall.forEach(s => NP.tidyQueue(s));
    out.tallChanged = NP.tidyNow();

    // ---- 9. the switch is in the paper picker and reads its state
    document.querySelector('#mn-tools .mn-tool[data-t="paper"]').click(); await w(300);
    const pop = document.querySelector('.mn-pop[data-kind="paper"]');
    const row = pop && pop.querySelector('[data-tidy]');
    out.picker = { there: !!row, state: row ? row.getAttribute('data-tidy') : null, on: !!(row && row.classList.contains('on')), labels: pop ? [...pop.querySelectorAll('.mn-pop-label')].map(x => x.textContent) : [] };
    if (pop) pop.remove();

    // ---- 10. a highlighter is never tidied
    clear();
    const hl = [{ type: 'hl', color: '#fde047', width: 18, ts: Date.now(), _ts: Date.now(),
      points: Array.from({ length: 12 }, (_, k) => ({ x: 150 + k * 50, y: mid + 0.2 * gap + k * 1.4, p: .5 })) }];
    put(hl); hl.forEach(s => NP.tidyQueue(s));
    out.hlChanged = NP.tidyNow();

    clear(); NP.setTidy(false); NP.close(); await w(300);
    return out;
  });

  ok('the rules of the page are found', R.rulesFound > 10, R.rulesFound);
  ok('off by default: a drifting line is left exactly as written', R.offChanged === 0 && Math.abs(R.offSlope) > 1, { changed: R.offChanged, slope: R.offSlope });
  ok('on: the drifting line is levelled', Math.abs(R.beforeSlope) > 1.5 && Math.abs(R.afterSlope) < 0.4, { before: R.beforeSlope, after: R.afterSlope });
  ok('on: the line is dropped onto a rule', Math.abs(R.afterBase - R.nearestRule) <= 2, { base: R.afterBase, rule: R.nearestRule });
  ok('the letters survive: same strokes, same points', R.strokeCount === 5 && R.ptsKept, { n: R.strokeCount, pts: R.ptsKept });
  ok('a second pass has nothing left to do', R.secondPass === 0, R.secondPass);
  ok('one Undo puts the line back exactly as written', R.undo.moved && R.undo.restored && R.undo.n === 5, R.undo);
  ok('a line written midway between two rules is not dragged onto either', R.betweenChanged === 0 && R.betweenMoved <= 1, { changed: R.betweenChanged, moved: R.betweenMoved });
  ok('a steep stroke is a drawing, and is left exactly alone', R.steepChanged === 0 && R.steepSame, { changed: R.steepChanged, same: R.steepSame });
  ok('a tall drawing is left alone', R.tallChanged === 0, R.tallChanged);
  ok('a highlighter is never tidied', R.hlChanged === 0, R.hlChanged);
  ok('the switch sits in the paper picker under Writing, and reads off', R.picker.there && R.picker.state === 'on' && R.picker.labels.includes('Writing') && R.picker.labels.includes('Ruling'), R.picker);

  // ---- the lesson pen: levels, but has no rule to sit on
  const L = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    store.padPrefs = store.padPrefs || {}; store.padPrefs.tidy = true; saveStore();
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }); await w(1500);
    gannoSetActive(true); await w(400);
    gannoSaveStrokes(ganno.routeKey, []);
    const made = [];
    for (let wI = 0; wI < 4; wI++) {
      const bx = 200 + wI * 120, by = 500 + 18 * (wI / 3);
      made.push({ type: 'pen', color: '#e11', width: 3, _ts: Date.now(), ts: Date.now(),
        // each word its own shape, as handwriting is: levelled, four copies of one
        // stamped shape would become exact translations, which the render drops
        points: Array.from({ length: 12 }, (_, k) => ({ x: bx + k * 8, y: by - Math.abs(Math.sin(k / 3 + wI * 0.4)) * (14 + wI * 1.5) + (k % 2 ? 1.4 : -1.4), p: .5 })) });
    }
    gannoSaveStrokes(ganno.routeKey, made.slice());
    const slope = list => { const f = window.__tidy.fitLine(window.__tidy.envelope([].concat.apply([], list.map(s => s.points)))); return f ? Math.round(f.m * 1000) / 10 : null; };
    const before = slope(gannoGetStrokes(ganno.routeKey));
    made.forEach(s => window.__gannoTidySoon(s));
    const changed = window.__gannoTidyNow();
    await w(150);
    const after = slope(gannoGetStrokes(ganno.routeKey));
    const n1 = (gannoGetStrokes(ganno.routeKey) || []).length;
    gannoUndo(); await w(250);
    const n2 = (gannoGetStrokes(ganno.routeKey) || []).length;
    const back = slope(gannoGetStrokes(ganno.routeKey));
    gannoSaveStrokes(ganno.routeKey, []); store.padPrefs.tidy = false; saveStore();
    try { gannoSetActive(false); } catch (e) {}
    return { before, after, changed, n1, n2, back };
  });
  ok('on a lesson the written line is levelled too', L.changed === 4 && Math.abs(L.before) > 1 && Math.abs(L.after) < 0.4, L);
  ok('one Undo on a lesson restores it, with no duplicate strokes left behind', L.n1 === 4 && L.n2 === 4 && Math.abs(L.back - L.before) < 0.2, L);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  await browser.close();
  console.log(`tidy: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
