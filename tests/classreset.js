// Resetting one class must STAY reset. The sync merges an incoming copy into
// the store, so a reset that leaves no record of itself is undone the next time
// the other device's copy arrives - "it resets, then it reverts". The erase
// record is what outranks an older copy, and a per-class reset now writes one.
// It must be per class: the blunt 'scores' mark would take every other class's
// history with it.
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
    // Two classes with history; reset one.
    store.quizHistory = [
      { id: 'a1', courseId: 'C959', ts: 1000, score: 5 },
      { id: 'a2', courseId: 'C959', ts: 1001, score: 6 },
      { id: 'b1', courseId: 'D286', ts: 1002, score: 7 }
    ];
    store.pretests = { C959: { done: 1 }, D286: { done: 1 } };
    store.userFlashcards = { 'C959/ch1/s1': [1], 'D286/ch1/s1': [1] };
    saveStore();

    const before = store.quizHistory.length;
    const res = window.__resetCourseProgress('C959');
    await w(50);
    const afterReset = {
      quiz: store.quizHistory.map(h => h.courseId),
      pretests: Object.keys(store.pretests || {}),
      cards: Object.keys(store.userFlashcards || {})
    };
    const markedAt = window.__erase.courseAt('C959');
    const otherMark = window.__erase.courseAt('D286');

    // The other device's copy, taken BEFORE the reset, now arrives.
    const older = {
      quizHistory: [
        { id: 'a1', courseId: 'C959', ts: 1000, score: 5 },
        { id: 'a2', courseId: 'C959', ts: 1001, score: 6 },
        { id: 'b1', courseId: 'D286', ts: 1002, score: 7 },
        { id: 'b2', courseId: 'D286', ts: 1003, score: 8 }
      ],
      pretests: { C959: { done: 1 }, D286: { done: 1 } },
      userFlashcards: { 'C959/ch1/s1': [1], 'D286/ch1/s1': [1] }
    };
    const filtered = window.__erase.filter(older, markedAt - 1000);   // copy predates the reset
    // A copy taken AFTER the reset keeps everything it holds.
    const newer = window.__erase.filter(older, markedAt + 1000);

    return {
      ok: res && res.ok, before,
      afterReset, markedAt, otherMark,
      filteredQuiz: filtered.quizHistory.map(h => h.courseId),
      filteredPretests: Object.keys(filtered.pretests),
      filteredCards: Object.keys(filtered.userFlashcards),
      newerQuiz: newer.quizHistory.map(h => h.courseId)
    };
  });

  ok('the reset itself reports success', R.ok, JSON.stringify(R.ok));
  ok('it clears that class locally', R.afterReset.quiz.join(',') === 'D286', JSON.stringify(R.afterReset.quiz));
  ok('it records an erase for that class', R.markedAt > 0, String(R.markedAt));
  ok('and records nothing against any other class', R.otherMark === 0, String(R.otherMark));
  ok('an older copy can no longer bring that class back',
     R.filteredQuiz.filter(c => c === 'C959').length === 0, JSON.stringify(R.filteredQuiz));
  ok('the other class survives the filter in full',
     R.filteredQuiz.filter(c => c === 'D286').length === 2, JSON.stringify(R.filteredQuiz));
  ok('its pretest and its cards go too, and only its own',
     R.filteredPretests.join(',') === 'D286' && R.filteredCards.join(',') === 'D286/ch1/s1',
     JSON.stringify([R.filteredPretests, R.filteredCards]));
  ok('a copy taken after the reset is left alone',
     R.newerQuiz.length === 4, JSON.stringify(R.newerQuiz));
  ok('no page errors', errs.length === 0, errs.join(' | '));
  console.log(`classreset: ${pass}/${pass + fail} passed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
