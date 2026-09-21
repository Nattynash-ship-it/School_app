// SECTION: Quizzes & content
// Java (D286) unit quizzes, Units 1-18: every multiple-choice question carries a
// rationale for each wrong option (and none for the right one), the one repaired
// answer key points where its own explanation says, and a live unit quiz shows
// the rationale the moment a wrong option is submitted.
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:' + (process.env.PORT || 8901) + '/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 400)))); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(B, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  const R = await p.evaluate(async () => {
    const j = await fetch('/content-D286.json?probe=1').then(r => r.json());
    const Q = JSON.parse(j.q);
    const man = await fetch('/content-manifest.json?probe=1').then(r => r.json());
    const secs = Object.keys(Q).filter(k => /^D286\/u(?:[1-9]|1[0-8])\//.test(k));   // Unit 19 is next in course order
    const out = { secs: secs.length, items: 0, build: j.build, fv: (man.fv || {}).D286, missing: [], badKeys: [], letters: [], short: [], echoes: [], fix: null };
    for (const sec of secs) {
      for (const it of Q[sec]) {
        if (!('correct' in it) || !Array.isArray(it.options)) continue;   // code tasks
        out.items++;
        const d = it.distractors;
        const want = it.options.map((_, i) => i).filter(i => i !== it.correct).map(String).join(',');
        if (!d) { out.missing.push(sec + '|' + it.id); continue; }
        if (Object.keys(d).sort().join(',') !== want) out.badKeys.push(sec + '|' + it.id);
        for (const [k, v] of Object.entries(d)) {
          const t = String(v);
          if (t.length < 15) out.short.push(sec + '|' + it.id);   // the renderer hides anything shorter
          if (/\b(?:option|answer|choice) [A-D]\b/i.test(t)) out.letters.push(sec + '|' + it.id);
          if (t.trim().toLowerCase() === String(it.options[+k]).replace(/<[^>]+>/g, '').trim().toLowerCase()) out.echoes.push(sec + '|' + it.id);
        }
      }
    }
    // the surcharge/discount question: its explanation says the two orders differ,
    // so its key must point at the option that says so
    const fx = (Q['D286/u3/z3_9'] || []).find(x => x.id === 'zya3_9_4');
    out.fix = fx ? { correct: fx.correct, text: fx.options[fx.correct], keys: Object.keys(fx.distractors || {}).sort().join(',') } : null;
    return out;
  });
  ok('Units 1-18 have their 216 quiz sections', R.secs === 216, R.secs);
  ok('every multiple-choice question has rationales', R.missing.length === 0, { n: R.items, missing: R.missing.slice(0, 6) });
  ok('rationales cover exactly the wrong options', R.badKeys.length === 0, R.badKeys.slice(0, 6));
  ok('no rationale names an option by letter', R.letters.length === 0, R.letters.slice(0, 6));
  ok('no rationale is short enough for the renderer to hide', R.short.length === 0, R.short.slice(0, 6));
  ok('no rationale merely repeats its option', R.echoes.length === 0, R.echoes.slice(0, 6));
  ok('the surcharge-order key points at "different totals"', R.fix && R.fix.correct === 2 && /different totals/.test(R.fix.text) && R.fix.keys === '0,1,3', R.fix);
  ok('the pack version tracks the build', R.fv === R.build, { fv: R.fv, build: R.build });

  // live: open a Unit 1 section quiz, submit a wrong option, and the feedback
  // names the pick and gives the pack's rationale for it
  const V = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    go({ name: 'class', courseId: 'D286' }); await w(1200);
    go({ name: 'quiz', courseId: 'D286', chId: 'u1', secId: 'z1_1', mode: 'practice' }); await w(1800);
    const qq = quizState && quizState.questions && quizState.questions[quizState.idx];
    if (!qq) return { noQuestion: true };
    const wrongIdx = (qq.correct === 0) ? 1 : 0;
    const want = qq.distractors ? String(qq.distractors[wrongIdx] || '') : '';
    const opt = document.querySelector(`.quiz-opt[data-opt="${wrongIdx}"]`);
    if (opt) opt.click(); await w(200);
    const sub = document.querySelector('[data-submit]');
    if (sub) sub.click(); await w(600);
    const pw = document.querySelector('.picked-why');
    const shown = pw ? pw.textContent : '';
    const back = document.querySelector('[data-quit]'); if (back) back.click(); await w(400);
    try { if (typeof clearQuiz === 'function') clearQuiz(); } catch (e) {}
    return { id: qq.id, hasMap: !!qq.distractors, want: want.slice(0, 80), shown: shown.slice(0, 160),
             names: new RegExp('You picked ' + String.fromCharCode(65 + wrongIdx)).test(shown),
             explains: !!want && shown.indexOf(want.slice(0, 40)) >= 0 };
  });
  ok('the unit quiz served a question that carries a rationale map', !V.noQuestion && V.hasMap, V);
  ok('a wrong submission names the pick and shows its rationale', V.names && V.explains, V);
  ok('no page errors', errs.length === 0, errs);
  await browser.close();
  console.log('javaunits: ' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail ? 1 : 0);
})();
