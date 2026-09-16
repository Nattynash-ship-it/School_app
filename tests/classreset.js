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

    /* A COPY IS JUDGED BY THE AGE OF ITS RECORDS, NOT ITS OWN AGE.
       This used to assert that a copy STAMPED after the reset was trusted
       whole, and that is the bug she reported: the other device pushes back a
       snapshot a second later, still carrying every record the reset deleted,
       and the class comes back. These records are all from ts 1000-1003, long
       before the reset, so the reset class goes and the other class stays. */
    const newer = window.__erase.filter(older, markedAt + 1000);

    // Work genuinely done AFTER the reset is new work and must survive.
    const withNew = window.__erase.filter({
      quizHistory: [
        { id: 'a1', courseId: 'C959', ts: 1000, score: 5 },            // before
        { id: 'a9', courseId: 'C959', ts: markedAt + 5000, score: 9 }, // after
        { id: 'b1', courseId: 'D286', ts: 1002, score: 7 }
      ]
    }, markedAt + 6000);

    // And a device that has already carried the reset out says so, by carrying
    // the erase record itself. Its copy is post-reset and is left alone.
    const applied = { courses: {} };
    applied.courses.C959 = markedAt;
    const fromApplied = window.__erase.filter({
      quizHistory: [{ id: 'a1', courseId: 'C959', ts: 1000, score: 5 }],
      __erased: applied
    }, markedAt + 1000);

    return {
      ok: res && res.ok, before,
      afterReset, markedAt, otherMark,
      filteredQuiz: filtered.quizHistory.map(h => h.courseId),
      filteredPretests: Object.keys(filtered.pretests),
      filteredCards: Object.keys(filtered.userFlashcards),
      newerQuiz: newer.quizHistory.map(h => h.courseId),
      withNewIds: withNew.quizHistory.map(h => h.id),
      fromAppliedIds: fromApplied.quizHistory.map(h => h.id)
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
  ok('a newer copy still carrying the erased class does not bring it back',
     R.newerQuiz.join(',') === 'D286,D286', JSON.stringify(R.newerQuiz));
  ok('work done after the reset survives it',
     R.withNewIds.join(',') === 'a9,b1', JSON.stringify(R.withNewIds));
  ok('a device that already carried the reset out is left alone',
     R.fromAppliedIds.join(',') === 'a1', JSON.stringify(R.fromAppliedIds));

  // ---- The write must not be left on a timer ----
  // saveStore is debounced by 600ms so answering a question does not stall the
  // UI, and the app's irreversible moments call saveStore.flushNow() to force
  // the pending write out first. saveStore is wrapped five times over -
  // debounce, reconcile, backup mirror, sync, timing - and none of those
  // wrappers carried flushNow across, so it was undefined and every one of
  // those calls did nothing. The write stayed on a timer that closing or
  // reloading the app beats.
  const durability = await page.evaluate(() => ({
    flushNow: typeof saveStore.flushNow,
    perfMarker: typeof saveStore.__perfDebounced,
    fortressMarker: typeof saveStore.__fortress,
    syncMarker: typeof saveStore.__syncWrapped,
    persistNow: typeof window.__persistNow,
    resetUsesIt: String(window.__resetCourseProgress).indexOf('persistNow') !== -1,
    stateUsesIt: String(setCourseState).indexOf('persistNow') !== -1
  }));
  ok('the flush survives every wrapper that rewraps saveStore',
     durability.flushNow === 'function', 'flushNow is ' + durability.flushNow);
  ok('and so does every marker those wrappers set',
     durability.perfMarker === 'boolean' && durability.fortressMarker === 'boolean'
       && durability.syncMarker === 'boolean', JSON.stringify(durability));
  ok('there is an unwrapped write for the changes that must not be lost',
     durability.persistNow === 'function', durability.persistNow);
  ok('the class reset uses it rather than the debounce', durability.resetUsesIt);
  ok('choosing active classes uses it too', durability.stateUsesIt);

  ok('no page errors', errs.length === 0, errs.join(' | '));
  console.log(`classreset: ${pass}/${pass + fail} passed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
