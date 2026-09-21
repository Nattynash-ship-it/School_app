// SECTION: Quizzes & content
// "I redid the test and got a 96% and it only says good, not mastered."
// Her row read "best round 11/11 · 100% · last 24/25 · 96%" and the pill said
// good: the section passed only through its best-by-percentage round, and the
// eleven-question round was too short to count, so the 24/25 round that did
// meet the bar was never asked. Any round that meets the bar passes the section;
// the row keeps showing the higher score as her best, as she asked.
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
    const out = {};
    // a section with a pool well beyond one round, as hers has (198 questions):
    // the sim misses must land on questions the retake does not ask again
    const C = 'D684';
    go({ name: 'class', courseId: C }); await w(2500);
    let CH = null, S = null, qs = [];
    for (const ch of (COURSES[C].chapters || [])) {
      if (/_sim$/.test(String(ch.id))) continue;
      for (const s of (ch.sections || [])) { const q = getQuestions(C, ch.id, s.id) || []; if (q.length > qs.length) { qs = q; CH = ch.id; S = s.id; } }
    }
    const ck = C + '/' + CH + '/' + S;
    out.pool = qs.length; out.section = ck;
    const ids = qs.map(q => String(q.id));
    const clear = () => { store.quizHistory = (store.quizHistory || []).filter(h => !(h && h.courseId === C && h.chId === CH && h.secId === S)); if (store.sectionBest) delete store.sectionBest[ck]; _rdyKey = ''; };
    // one round: `right` of `asked` questions correct, starting at question `from` of the pool
    const round = (asked, right, at, rid, from) => { for (let i = 0; i < asked; i++) store.quizHistory.push({ courseId: C, chId: CH, secId: S, qId: ids[((from || 0) + i) % ids.length], topic: 't', correct: i < right, ts: at + i * 1000, rid: rid }); _rdyKey = ''; };
    // what the exam sim records for a question drawn from this section
    const simMiss = (n, at) => { for (let i = 0; i < n; i++) store.quizHistory.push({ rid: 9001, courseId: C, chId: CH, secId: S, qId: ids[(30 + i) % ids.length], correct: false, ts: at + i * 1000, topic: 't', source: 'exam-sim' }); _rdyKey = ''; };
    const st = () => { _rdyKey = ''; return sectionStatus(C, CH, S); };
    const m = () => { _rdyKey = ''; return sectionMastery(C, CH, S); };
    const t0 = Date.now() - 3 * 86400000;

    clear(); out.untouched = st();
    // her case: a short perfect round, sim misses, then a 24/25 retake
    clear(); round(11, 11, t0, 3001, 0); simMiss(6, t0 + 3600000); round(25, 24, t0 + 86400000, 3002, 0);
    let a = m(); out.hers = { status: st(), best: a.best, last: a.last, passed: a.passed };
    clear(); round(25, 24, t0, 3003, 0); out.round96 = st();
    clear(); round(25, 19, t0, 3004, 0); out.round76 = st();
    clear(); round(25, 17, t0, 3005, 0); out.round68 = st();
    clear(); round(4, 4, t0, 3006, 0); out.stray = st();       // four right answers are not a round
    clear(); round(11, 11, t0, 3007, 0); out.shortPerfect = st();   // eleven right answers do not pass a 25-target section
    clear(); round(25, 17, t0, 3008, 0); round(25, 24, t0 + 86400000, 3009, 0); out.retake = st();
    clear(); round(25, 24, t0, 3010, 0); round(25, 17, t0 + 86400000, 3011, 0); out.worseRetake = st();

    // the row itself, in her case
    clear(); round(11, 11, t0, 3012, 0); simMiss(6, t0 + 3600000); round(25, 24, t0 + 86400000, 3013, 0); _rdyKey = '';
    go({ name: 'chapter', courseId: C, chId: CH }); await w(1800);
    const rows = [...document.querySelectorAll('.chapter-item')].map(e => e.innerText.replace(/\s+/g, ' '));
    out.row = rows.find(t => /best round 11\/11/.test(t)) || '';
    clear(); _rdyKey = '';
    return out;
  });
  ok('the section pool is well beyond one round, as hers is', R.pool >= 40, { pool: R.pool, section: R.section });
  ok('no answers yet reads untouched', R.untouched === 'untouched', R.untouched);
  ok('her case: a 24/25 retake behind a shorter perfect round masters the section', R.hers.status === 'mastered' && R.hers.passed === true, R.hers);
  ok('her best round stays the higher score, 11/11', R.hers.best && R.hers.best.asked === 11 && R.hers.best.pct === 100, R.hers.best);
  ok('and the last round is her 24/25', R.hers.last && R.hers.last.correct === 24 && R.hers.last.asked === 25, R.hers.last);
  ok('a 24/25 round alone masters the section', R.round96 === 'mastered', R.round96);
  ok('a 19/25 round is good', R.round76 === 'good', R.round76);
  ok('a 17/25 round is in progress', R.round68 === 'practiced', R.round68);
  ok('four right answers are not a round, so not mastery', R.stray !== 'mastered', R.stray);
  ok('eleven right answers alone do not pass a 25-question target', R.shortPerfect !== 'mastered', R.shortPerfect);
  ok('a retake at 24/25 raises an in-progress section to mastered', R.retake === 'mastered', R.retake);
  ok('a worse retake never lowers a mastered section', R.worseRetake === 'mastered', R.worseRetake);
  ok('the chapter row shows best 11/11, last 24/25, and says mastered', /best round 11\/11 · 100% · last 24\/25 · 96%/.test(R.row) && /mastered/.test(R.row) && !/\bgood\b/.test(R.row), R.row.slice(0, 220));
  ok('no page errors', errs.length === 0, errs);
  await browser.close();
  console.log('secstatus: ' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail ? 1 : 0);
})();
