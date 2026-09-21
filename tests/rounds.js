// SECTION: Quizzes & content
// Scoring by round. "Can we have all the percentages showing how much it is per
// round... even if I take it again, the higher score will be used... but I'd
// like the accurate score for the round every time."
//   - each round keeps its own true score (right out of what that round asked)
//   - the best round stands: a retake can raise it, never lower it
//   - the row shows the best round, and the last round beside it when different
//   - answers from before round stamps existed split by a 45-minute break
//   - a stray one-off answer is not a round
//   - the best survives history trimming, clears on reset, syncs by the higher
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
    const C = 'C959', CH = 'ch4', S = 's1', ck = C + '/' + CH + '/' + S;
    go({ name: 'class', courseId: C }); await w(1800);
    const qs = getQuestions(C, CH, S) || [];
    out.pool = qs.length;
    const ids = qs.map(q => String(q.id));
    const clear = () => { store.quizHistory = (store.quizHistory || []).filter(h => !(h && h.courseId === C && h.chId === CH && h.secId === S)); if (store.sectionBest) delete store.sectionBest[ck]; _rdyKey = ''; };
    // one round: `right` of the first `asked` questions correct, all stamped alike
    const round = (asked, right, at, rid) => { for (let i = 0; i < asked; i++) store.quizHistory.push({ courseId: C, chId: CH, secId: S, qId: ids[i % ids.length], topic: 't', correct: i < right, ts: at + i * 1000, rid: rid }); _rdyKey = ''; };
    const m = () => { _rdyKey = ''; return sectionMastery(C, CH, S); };
    const t0 = Date.now() - 20 * 86400000;

    clear();
    round(25, 23, t0, 1001);
    let a = m();
    out.first = { best: a.best, last: a.last, rounds: a.rounds, status: sectionStatus(C, CH, S), passed: a.passed };

    // a worse retake: its own score is shown, the best does not drop
    round(25, 20, t0 + 2 * 86400000, 1002);
    a = m();
    out.worse = { best: a.best, last: a.last, rounds: a.rounds, passed: a.passed };

    // a better retake: the best rises
    round(25, 25, t0 + 4 * 86400000, 1003);
    a = m();
    out.better = { best: a.best, last: a.last, rounds: a.rounds };

    // the row itself
    go({ name: 'chapter', courseId: C, chId: CH }); await w(1800);
    const rows = [...document.querySelectorAll('.chapter-item .chapter-meta')].map(e => e.innerText);
    out.rowText = rows.find(t => /best round/.test(t)) || rows[0] || '';
    out.rowCount = rows.length;

    // the row after a worse retake carries both figures
    clear(); round(25, 23, t0, 5001); round(25, 20, t0 + 2 * 86400000, 5002); m();
    go({ name: 'chapter', courseId: C, chId: CH }); await w(1600);
    out.rowBoth = [...document.querySelectorAll('.chapter-item .chapter-meta')].map(e => e.innerText).find(t => /best round/.test(t)) || '';
    clear(); round(25, 25, t0 + 4 * 86400000, 1003); m();

    // the best survives the history being trimmed away
    store.quizHistory = (store.quizHistory || []).filter(h => !(h && h.courseId === C && h.chId === CH && h.secId === S));
    a = m();
    out.afterTrim = { best: a.best, last: a.last };

    // answers with no round stamp: a 45-minute break makes a new round
    clear();
    const legacy = (asked, right, at) => { for (let i = 0; i < asked; i++) store.quizHistory.push({ courseId: C, chId: CH, secId: S, qId: ids[i % ids.length], topic: 't', correct: i < right, ts: at + i * 1000 }); _rdyKey = ''; };
    legacy(10, 9, t0);                              // 90%
    legacy(10, 4, t0 + 60 * 60 * 1000);             // 40%, an hour later = a second round
    a = m();
    out.legacy = { best: a.best, last: a.last, rounds: a.rounds };

    // a stray one-off answer is not a round
    clear();
    round(25, 22, t0, 2001);
    store.quizHistory.push({ courseId: C, chId: CH, secId: S, qId: ids[0], topic: 't', correct: false, ts: t0 + 9 * 86400000, rid: 2002 });
    a = m();
    out.stray = { best: a.best, last: a.last, rounds: a.rounds };

    // sync: a higher best from the other device wins, a lower one does not
    clear(); round(25, 20, t0, 3001); m();
    mergeIntoStore({ sectionBest: { [ck]: { correct: 24, asked: 25, pct: 96, ts: Date.now() } } });
    out.syncHigher = JSON.parse(JSON.stringify(store.sectionBest[ck]));
    mergeIntoStore({ sectionBest: { [ck]: { correct: 5, asked: 25, pct: 20, ts: Date.now() + 1000 } } });
    out.syncLower = JSON.parse(JSON.stringify(store.sectionBest[ck]));

    // a class reset clears it
    clear(); round(25, 23, t0, 4001); m();
    out.beforeReset = !!(store.sectionBest || {})[ck];
    try { window.__resetCourseProgress(C); } catch (e) { out.resetErr = String(e).slice(0, 60); }
    await w(300);
    out.afterReset = !!(store.sectionBest || {})[ck];
    clear();
    return out;
  });

  ok('a round of 25 with 2 wrong reads as its own score: 23/25, 92%', R.first.best && R.first.best.asked === 25 && R.first.best.correct === 23 && R.first.best.pct === 92, R.first);
  ok('a full strong round masters the section', R.first.passed === true && R.first.status === 'mastered', R.first);
  ok('a worse retake shows its own score and does not lower the best', R.worse.best.pct === 92 && R.worse.last.pct === 80 && R.worse.last.correct === 20 && R.worse.passed === true, R.worse);
  ok('a better retake raises the best', R.better.best.pct === 100 && R.better.best.correct === 25 && R.better.last.pct === 100, R.better);
  ok('the section row names the best round', /best round 25\/25 · 100%/.test(R.rowText), { row: R.rowText, rows: R.rowCount });
  ok('after a worse retake the row shows the best round AND that round\'s own score', /best round 23\/25 · 92%/.test(R.rowBoth) && /last 20\/25 · 80%/.test(R.rowBoth), R.rowBoth);
  ok('the best survives the history being trimmed away', R.afterTrim.best && R.afterTrim.best.pct === 100, R.afterTrim);
  ok('older answers with no round stamp split on a 45-minute break', R.legacy.rounds === 2 && R.legacy.best.pct === 90 && R.legacy.last.pct === 40, R.legacy);
  ok('a stray one-off answer is not a round and does not become the score', R.stray.rounds === 1 && R.stray.best.pct === 88 && R.stray.last.pct === 88, R.stray);
  ok('a higher best from the other device wins', R.syncHigher.pct === 96, R.syncHigher);
  ok('a lower best from the other device does not lower it', R.syncLower.pct === 96, R.syncLower);
  ok('a class reset clears the remembered best', R.beforeReset === true && R.afterReset === false, { before: R.beforeReset, after: R.afterReset, err: R.resetErr });
  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  await browser.close();
  console.log(`rounds: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
