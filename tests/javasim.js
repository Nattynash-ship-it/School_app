// SECTION: Quizzes & content
// Java (D286) OA-sim pool: every multiple-choice question carries a rationale
// for each wrong option, the exam-week questions are present and tagged, the
// manifest index matches the pool, and a new question renders in the sim.
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
    const Q = JSON.parse(j.q); const sim = Q['D286/oa_sim/sim'];
    const man = await fetch('/content-manifest.json?probe=1').then(r => r.json());
    const out = { n: sim.length, build: j.build, fv: (man.fv || {}).D286, missing: [], badKeys: [], letters: [], short: [], xw: 0, xwDom: 0, driftIds: 0 };
    const manIds = new Set(((man.qids || {}).D286 || {})['D286/oa_sim/sim'] || []);
    for (const it of sim) {
      if (!('correct' in it) || !Array.isArray(it.options)) continue;   // code tasks
      const d = it.distractors || {};
      const want = it.options.map((_, i) => i).filter(i => i !== it.correct).map(String).join(',');   // some questions carry five options
      if (!it.distractors) { out.missing.push(it.id); continue; }
      if (Object.keys(d).sort().join(',') !== want) out.badKeys.push(it.id);
      for (const v of Object.values(d)) { if (String(v).length < 15) out.short.push(it.id); if (/\b(?:option|answer|choice) [A-D]\b/i.test(String(v))) out.letters.push(it.id); }
      if (it.id.startsWith('xw_d286_')) { out.xw++; if (it._dom) out.xwDom++; }
      if (!manIds.has(it.id)) out.driftIds++;
    }
    return out;
  });
  ok('D286 sim pool loads', R.n >= 900, R.n);
  ok('every multiple-choice question has rationales', R.missing.length === 0, R.missing.slice(0, 6));
  ok('rationales cover exactly the wrong options', R.badKeys.length === 0, R.badKeys.slice(0, 6));
  ok('no rationale names an option by letter', R.letters.length === 0, R.letters.slice(0, 6));
  ok('no rationale is a stub', R.short.length === 0, R.short.slice(0, 6));
  ok('the 31 exam-week Java questions are present and tagged', R.xw === 31 && R.xwDom === 31, { xw: R.xw, tagged: R.xwDom });
  ok('the manifest index matches the pool', R.driftIds === 0, R.driftIds);
  ok('the pack version tracks the build', R.fv === R.build, { fv: R.fv, build: R.build });

  // the sim chapter deals a sampled paper from the pool: the paper must be non-empty,
  // drawn entirely from the pool, and the pool itself must hold the new code traces
  const V = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    go({ name: 'class', courseId: 'D286' }); await w(1500);
    const paper = getQuestions('D286', 'oa_sim', 'sim') || [];
    const j = await fetch('/content-D286.json?probe=1').then(r => r.json());
    const pool = JSON.parse(j.q)['D286/oa_sim/sim'];
    const ids = new Set(pool.map(x => x.id));
    const q = pool.find(x => x.id === 'xw_d286_01');
    // a paper is 40 pool questions plus 10 generated 'fresh' ones (new every attempt)
    return { paper: paper.length, fromPool: paper.every(x => ids.has(x.id) || x.fresh === true), found: !!q, hasCode: !!(q && /<pre><code>/.test(q.text)), opts: q ? q.options.length : 0 };
  });
  ok('the sim deals a paper of pool questions plus fresh ones', V.paper > 0 && V.fromPool, V);
  ok('a new code-trace question sits in the pool with its code block', V.found && V.hasCode && V.opts === 4, V);
  ok('no page errors', errs.length === 0, errs);
  await browser.close();
  console.log('javasim: ' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail ? 1 : 0);
})();
