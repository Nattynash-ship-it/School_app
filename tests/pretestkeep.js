// "I've been trying to take the pretest and it keeps resetting on me and
//  resetting the questions"
//
// The 30 questions and every answer lived only in local variables inside
// renderPretest, so ANY re-render ran the selection again - shuffle() and
// Math.random(), 30 fresh questions - and put her back on question 1.
//
// The sync layer calls render() when a pull lands, and it runs on a 120s
// heartbeat, on boot, and whenever the app comes back to the foreground. So a
// pretest on the train restarted itself every couple of minutes.
//
// Two things have to hold:
//   1. a re-render RESUMES the pretest - same questions, same place
//   2. a background sync does not redraw a task in progress at all
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:' + (process.env.PORT || 8901) + '/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d)))); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await browser.newPage({ viewport: { width: 1194, height: 834 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(B, { waitUntil: 'load', timeout: 240000 });
  await p.waitForTimeout(13000);

  const R = await p.evaluate(async () => {
    const CID = 'C959';
    const out = {};
    const wait = ms => new Promise(r => setTimeout(r, ms));

    // what is on screen right now
    const shown = () => {
      const q = document.querySelector('.v2-pretest-q');
      const prog = document.querySelector('.v2-pretest-progtxt');
      return { q: q ? q.textContent.trim().slice(0, 80) : null,
               at: prog ? prog.textContent.trim() : null,
               opts: document.querySelectorAll('.v2-pretest-opt').length };
    };
    const answer = () => {
      const b = document.querySelector('.v2-pretest-opt');
      if (!b) return false;
      b.click();
      return true;
    };

    go({ name: 'pretest', courseId: CID });
    await wait(600);
    out.started = shown();

    // answer four questions, remembering each one as it is asked
    const seen = [];
    for (let i = 0; i < 4; i++) { seen.push(shown()); if (!answer()) break; await wait(200); }
    out.seen = seen;
    out.afterFour = shown();
    const live = () => (store.pretestLive || {})[CID] || null;
    const L = live();
    out.persisted = L ? { idx: L.idx, items: (L.items || []).length, answers: (L.answers || []).length } : null;

    /* ---- 1. a plain re-render must RESUME, not restart ---- */
    render();
    await wait(400);
    out.afterRender = shown();

    /* ---- 2. the real sync path must not redraw a task in progress ---- */
    out.midTask = !!(window.__midTask && window.__midTask());
    const beforeSync = shown();
    window.__sync._apply({ v: 1, at: Date.now(), store: { quizHistory: [{ courseId: 'D684', qId: 'z9', ts: Date.now() }] } });
    await wait(400);
    out.afterSync = shown();
    out.syncSameAsBefore = JSON.stringify(beforeSync) === JSON.stringify(out.afterSync);

    /* ---- 3. leaving and coming back resumes too ---- */
    go({ name: 'class', courseId: CID });
    await wait(400);
    go({ name: 'pretest', courseId: CID });
    await wait(600);
    out.afterReturn = shown();

    /* ---- 4. a class reset takes the half-finished pretest with it ---- */
    window.__resetCourseProgress(CID);
    await wait(200);
    out.liveAfterReset = live();

    /* ---- 5. and then it is a genuinely fresh test ---- */
    go({ name: 'pretest', courseId: CID });
    await wait(600);
    out.afterReset = shown();
    return out;
  });

  ok('the pretest opens with a question', !!R.started.q && R.started.opts > 0, R.started);
  ok('it advances as she answers', R.afterFour.at === '5 / 30', R.afterFour.at);
  ok('the live test is written down', R.persisted && R.persisted.idx === 4 && R.persisted.answers === 4 && R.persisted.items === 30, R.persisted);
  ok('a re-render keeps her place', R.afterRender.at === '5 / 30', R.afterRender.at);
  ok('a re-render keeps the SAME question', R.afterRender.q === R.afterFour.q, [R.afterFour.q, R.afterRender.q]);
  ok('a pretest counts as a task in progress', R.midTask === true, R.midTask);
  ok('a sync landing does not redraw it at all', R.syncSameAsBefore, [R.afterSync]);
  ok('leaving and returning resumes', R.afterReturn.at === '5 / 30' && R.afterReturn.q === R.afterFour.q, [R.afterFour.q, R.afterReturn]);
  ok('the four questions asked were all different',
     new Set(R.seen.map(s => s.q)).size === R.seen.length, R.seen.map(s => (s.q || '').slice(0, 30)));
  ok('a class reset clears the half-finished test', R.liveAfterReset === null, R.liveAfterReset);
  ok('after a reset it starts from question 1', R.afterReset.at === '1 / 30', R.afterReset.at);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));

  console.log('pretestkeep: ' + pass + '/' + (pass + fail) + ' passed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
