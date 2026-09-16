// A class reset has to reset Review and Flashcards too.
//
// "The review and flash cards should also follow suit when a class is reset,
// it should display the reset data as well."
//
// Review is nothing but store.flashcards - one spaced-repetition record per
// card, keyed "<courseId>/<chId>/<secId>/<cardId>". The reset deleted the
// course's cards and left their schedule behind, so Review kept counting them
// as due and Flashcards kept showing the reps she had built up.
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:8901/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d || ''))); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await browser.newPage({ viewport: { width: 1194, height: 834 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.goto(B, { waitUntil: 'load', timeout: 240000 });
  await p.waitForTimeout(13000);

  const R = await p.evaluate(async () => {
    const CID = 'C959', OTHER = 'D684';
    const past = Date.now() - 86400000;
    // a class she has worked through: review schedule, a deck, a flag
    store.flashcards = store.flashcards || {};
    store.flashcards[CID + '/ch4/s1/c1'] = { ef: 2.1, interval: 6, reps: 4, due: past };
    store.flashcards[CID + '/ch4/s1/c2'] = { ef: 2.5, interval: 1, reps: 1, due: past };
    store.flashcards[OTHER + '/g1/x3_1/c1'] = { ef: 2.3, interval: 3, reps: 2, due: past };
    store.userFlashcards = store.userFlashcards || {};
    store.userFlashcards[CID + '/ch4/s1'] = [{ id: 'c1', front: 'a', back: 'b' }];
    store.flashDecks = store.flashDecks || {};
    store.flashDecks.d1 = { id: 'd1', name: 'Boolean laws', courseId: CID, createdAt: past,
      cards: [{ id: 'k1', front: 'De Morgan', back: 'negate both, flip', ef: 2.2, interval: 9, reps: 5, due: past },
              { id: 'k2', front: 'Absorption', back: 'A + AB = A', ef: 2.4, interval: 2, reps: 2, due: past }] };
    store.flashDecks.d2 = { id: 'd2', name: 'Networking', courseId: OTHER, createdAt: past,
      cards: [{ id: 'n1', front: 'DNS', back: 'names to addresses', ef: 2.2, interval: 9, reps: 5, due: past }] };
    store.flaggedQuestions = store.flaggedQuestions || {};
    store.flaggedQuestions.q1 = { courseId: CID, chId: 'ch4', secId: 's1', flaggedAt: past };
    store.flaggedQuestions.q2 = { courseId: OTHER, chId: 'g1', secId: 'x3_1', flaggedAt: past };
    store.quizHistory = store.quizHistory || [];
    store.quizHistory.push({ courseId: CID, topic: 'Boolean', correct: true, ts: past });
    saveStore(); if (saveStore.flushNow) saveStore.flushNow();
    await new Promise(r => setTimeout(r, 300));

    const snap = () => ({
      due: dueCardsCount(),
      mine: Object.keys(store.flashcards).filter(k => k.indexOf('C959/') === 0).length,
      theirs: Object.keys(store.flashcards).filter(k => k.indexOf('D684/') === 0).length,
      myDeck: !!store.flashDecks.d1,
      myDeckCards: store.flashDecks.d1 ? store.flashDecks.d1.cards.length : -1,
      myDeckScheduled: store.flashDecks.d1
        ? store.flashDecks.d1.cards.filter(c => c.reps !== undefined || c.due !== undefined).length : -1,
      theirDeckScheduled: store.flashDecks.d2
        ? store.flashDecks.d2.cards.filter(c => c.reps !== undefined || c.due !== undefined).length : -1,
      myFlags: Object.keys(store.flaggedQuestions).filter(k => store.flaggedQuestions[k].courseId === 'C959').length,
      theirFlags: Object.keys(store.flaggedQuestions).filter(k => store.flaggedQuestions[k].courseId === 'D684').length,
      myQuiz: store.quizHistory.filter(h => h.courseId === 'C959').length
    });
    const before = snap();
    const res = window.__resetCourseProgress('C959');
    const after = snap();

    // and it must survive a sync pull that still carries the old copy
    let afterSync = null;
    try {
      const E = window.__erase;
      const stale = { flashcards: { 'C959/ch4/s1/c1': { ef: 2.1, interval: 6, reps: 4, due: past } },
                      flaggedQuestions: { q1: { courseId: 'C959', flaggedAt: past } },
                      flashDecks: { d1: { id: 'd1', courseId: 'C959', cards: [{ id: 'k1', reps: 5, due: past }] } },
                      quizHistory: [{ courseId: 'C959', topic: 'Boolean', correct: true, ts: past }] };
      const filtered = E.filter(JSON.parse(JSON.stringify(stale)), past);
      afterSync = {
        cards: filtered && filtered.flashcards ? Object.keys(filtered.flashcards).length : -1,
        flags: filtered && filtered.flaggedQuestions ? Object.keys(filtered.flaggedQuestions).length : -1,
        quiz: filtered && filtered.quizHistory ? filtered.quizHistory.length : -1,
        deckScheduled: filtered && filtered.flashDecks && filtered.flashDecks.d1
          ? filtered.flashDecks.d1.cards.filter(c => c.reps !== undefined || c.due !== undefined).length : -1
      };
    } catch (e) { afterSync = { err: String(e).slice(0, 100) }; }

    return { before, after, res, afterSync };
  });

  ok('the harness really did build up some progress first',
     R.before.mine === 2 && R.before.myDeckScheduled === 2 && R.before.due >= 3,
     JSON.stringify(R.before));
  ok('the reset reports what it cleared', R.res && R.res.ok === true && R.res.removed.cards === 2,
     JSON.stringify(R.res));
  ok('Review no longer has this class scheduled', R.after.mine === 0, R.after.mine + ' records left');
  ok('and the due count drops', R.after.due < R.before.due, R.before.due + ' -> ' + R.after.due);
  ok('her deck and every card in it survive',
     R.after.myDeck === true && R.after.myDeckCards === 2,
     'deck ' + R.after.myDeck + ', ' + R.after.myDeckCards + ' cards');
  ok('but the deck starts from new again', R.after.myDeckScheduled === 0,
     R.after.myDeckScheduled + ' cards still carrying a schedule');
  ok('flags for this class go', R.after.myFlags === 0, R.after.myFlags + ' left');
  ok('every other class is untouched',
     R.after.theirs === 1 && R.after.theirDeckScheduled === 1 && R.after.theirFlags === 1,
     JSON.stringify({ cards: R.after.theirs, deck: R.after.theirDeckScheduled, flags: R.after.theirFlags }));
  ok('and a sync pull cannot bring any of it back',
     R.afterSync && R.afterSync.cards === 0 && R.afterSync.flags === 0 &&
     R.afterSync.quiz === 0 && R.afterSync.deckScheduled === 0,
     JSON.stringify(R.afterSync));
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(`resetreview: ${pass}/${pass + fail} passed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
