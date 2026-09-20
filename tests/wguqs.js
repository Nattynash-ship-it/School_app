// "Can you remove these very long truth table questions and replace them with
//  more realistic WGU like questions for discrete math? It's also impossible to
//  write all of the values in the very small scratch pad."
//   - no C959 question renders a blank truth table for her to fill in
//   - the 28 replacements are well formed, keyed correctly and carry a rationale
//     for every wrong option, and no answer position is over-used
//   - a section quiz renders with no table markup in the question
//   - the scratch pad steps taller from its own toolbar, and stepping back down
//     never crops ink she has already written
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:' + (process.env.PORT || 8901) + '/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 320)))); };

const REPLACED = {
  'C959/ch1/s1': ['r11', 'r13', 'f1', 'f495', 'f496', 'f497', 'f511', 'f512'],
  'C959/ch1/s2': ['r19', 'f9'],
  'C959/ch1/s4': ['r40'],
  'C959/ch4/s1': ['f95', 'f96', 'f415', 'f416', 'f417', 'f418', 'f492', 'f493'],
  'C959/ch4/s4': ['r15'],
  'C959/ch4/s7': ['r4'],
  'C959/solving2/sv1': ['sv1_q4', 'sv1_q10', 'x3'],
  'C959/oa_sim/sim': ['bp_q14_logic', 'bp_q15_logic', 'bp_q16_logic', 'bp_q20_logic']
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await browser.newPage({ viewport: { width: 834, height: 1112 } });   // iPad portrait
  p.on('dialog', d => d.accept());
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(B, { waitUntil: 'load', timeout: 240000 }); await p.waitForTimeout(12000);

  // ---- the pack itself -------------------------------------------------
  const R = await p.evaluate(async (REPLACED) => {
    const out = {};
    const j = await fetch('/content-C959.json?probe=1').then(r => r.json());
    const Q = JSON.parse(j.q);
    out.build = j.build;
    out.sections = Object.keys(Q).length;
    out.total = Object.values(Q).reduce((a, v) => a + v.length, 0);

    out.tables = [];
    for (const [sec, items] of Object.entries(Q)) {
      for (const it of items) if (/<table/i.test(it.text || '')) out.tables.push(sec + '/' + it.id);
    }
    // the fill-in-the-blank phrasings that came with those tables
    out.phrases = [];
    const bad = /rows make .{0,12}\btrue|rows is .{0,12}\btrue|rows does .{0,4}f\b.{0,12}equal|rows leave .{0,12}\btrue|rows satisfy f\b|wait \u2014/i;
    for (const [sec, items] of Object.entries(Q)) {
      for (const it of items) if (bad.test(it.text || '')) out.phrases.push(sec + '/' + it.id);
    }

    out.shape = []; out.spread = [0, 0, 0, 0]; out.letters = []; out.found = 0;
    for (const [sec, ids] of Object.entries(REPLACED)) {
      for (const id of ids) {
        const it = (Q[sec] || []).find(x => x.id === id);
        if (!it) { out.shape.push(sec + '/' + id + ': missing'); continue; }
        out.found++;
        const o = it.options || [];
        if (o.length !== 4) out.shape.push(sec + '/' + id + ': ' + o.length + ' options');
        if (new Set(o).size !== 4) out.shape.push(sec + '/' + id + ': repeated option');
        if (!(it.correct >= 0 && it.correct < 4)) out.shape.push(sec + '/' + id + ': correct ' + it.correct);
        if (!it.explain || it.explain.length < 40) out.shape.push(sec + '/' + id + ': thin explain');
        const d = it.distractors || {};
        const want = [0, 1, 2, 3].filter(i => i !== it.correct).map(String).join(',');
        if (Object.keys(d).sort().join(',') !== want) out.shape.push(sec + '/' + id + ': rationales ' + Object.keys(d).sort().join(','));
        out.spread[it.correct]++;
        const blob = (it.text || '') + (it.explain || '') + Object.values(d).join(' ');
        if (/\b(?:option|answer|choice) [A-D]\b/.test(blob)) out.letters.push(sec + '/' + id);
      }
    }
    // every id the manifest indexes for C959 is still in the pack
    const man = await fetch('/content-manifest.json?probe=1').then(r => r.json());
    out.fv = (man.fv || {}).C959;
    out.drift = [];
    for (const [key, ids] of Object.entries((man.qids || {}).C959 || {})) {
      const have = new Set((Q[key] || []).map(x => x.id));
      for (const id of ids) if (!have.has(id)) out.drift.push(key + '/' + id);
    }
    return out;
  }, REPLACED);

  ok('pack loads', R.total > 2000 && R.sections > 50, R);
  ok('no question renders a blank truth table', R.tables.length === 0, R.tables.slice(0, 8));
  ok('no fill-in-the-rows phrasing left', R.phrases.length === 0, R.phrases.slice(0, 8));
  ok('all 28 replacements present', R.found === 28, R.found);
  ok('replacements are well formed', R.shape.length === 0, R.shape.slice(0, 8));
  ok('every wrong option has a rationale', R.shape.filter(s => /rationales/.test(s)).length === 0, R.shape);
  ok('no rationale names an option by letter', R.letters.length === 0, R.letters);
  ok('answer position is spread', Math.max(...R.spread) - Math.min(...R.spread) <= 2, R.spread);
  ok('manifest ids still resolve', R.drift.length === 0, R.drift.slice(0, 8));
  ok('pack version bumped with the build', R.fv === R.build, { fv: R.fv, build: R.build });

  // ---- a rendered quiz --------------------------------------------------
  const Q2 = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    go({ name: 'class', courseId: 'C959' }); await w(2000);
    go({ name: 'quiz', courseId: 'C959', chId: 'ch1', secId: 's1', mode: 'practice' }); await w(2200);
    const qt = document.querySelector('.quiz-text');
    const host = document.querySelector('.scratch-host');
    const cv = document.querySelector('.scratch-canvas');
    return {
      rendered: !!qt, tables: qt ? qt.querySelectorAll('table').length : -1,
      pad: !!cv, h0: cv ? Math.round(cv.getBoundingClientRect().height) : 0,
      sizeBtn: host ? !!host.querySelector('.scratch-tool[data-tool="size"]') : false,
      label: host && host.querySelector('.scratch-tool[data-tool="size"]') ? host.querySelector('.scratch-tool[data-tool="size"]').textContent.trim() : ''
    };
  });
  ok('a C959 section quiz renders', Q2.rendered && Q2.pad, Q2);
  ok('the rendered question has no table', Q2.tables === 0, Q2);
  ok('the pad starts tall', Q2.h0 > 0.6 * 1112, Q2);
  ok('the pad carries a size control', Q2.sizeBtn && /Tall/.test(Q2.label), Q2);

  // step it up, then all the way round
  const S = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const btn = document.querySelector('.scratch-tool[data-tool="size"]');
    const cv = document.querySelector('.scratch-canvas');
    const h = () => Math.round(cv.getBoundingClientRect().height);
    const seen = [{ h: h(), label: btn.textContent.trim() }];
    for (let i = 0; i < 3; i++) { btn.click(); await w(400); seen.push({ h: h(), label: btn.textContent.trim() }); }
    return { seen, stored: store.scratchH };
  });
  ok('stepping makes the pad taller', S.seen[1].h > S.seen[0].h, S.seen);
  ok('the cycle comes back round', S.seen[3].h === S.seen[0].h && S.seen[3].label === S.seen[0].label, S.seen);
  ok('the choice is remembered', typeof S.stored === 'string' && /vh$/.test(S.stored), S.stored);

  // ink low on a full-page pad must not be cropped by stepping down
  const K = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const btn = document.querySelector('.scratch-tool[data-tool="size"]');
    while (!/Full page/.test(btn.textContent)) { btn.click(); await w(300); }
    const cv = document.querySelector('.scratch-canvas');
    const tall = Math.round(cv.getBoundingClientRect().height);
    // a stroke near the bottom of the full-page pad
    const st = quizState.scratch[quizState.idx];
    st.push([{ x: 40, y: tall - 30 }, { x: 90, y: tall - 25 }]);
    btn.click(); await w(400);
    return { tall, after: Math.round(cv.getBoundingClientRect().height), label: btn.textContent.trim() };
  });
  ok('stepping down never crops written ink', K.after >= K.tall - 2, K);

  ok('no page errors', errs.length === 0, errs);
  await browser.close();
  console.log('WGUQS ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})();
