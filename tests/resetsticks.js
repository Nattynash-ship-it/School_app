// "Restet means never come back."
//
// A class reset already survived a STALE copy (one taken before the reset).
// It did not survive the ordinary two-device round trip, which is what she
// actually does: reset on the iPad, and the phone pushes the class back.
//
//   iPad   reset C959 at T, records courses.C959 = T, pushes the erased store
//   phone  pulls, absorb() RECORDS the mark but never CARRIES IT OUT, so the
//          phone still holds every C959 record it always had
//   phone  pushes its merged store at T+2s - C959 history and all
//   iPad   pulls that copy. T+2s > T, so nothing is stripped, and the union
//          merge puts C959 straight back
//
// Two things have to hold for a reset to mean never come back:
//   1. a device that LEARNS of a course erase carries it out on itself
//   2. a copy that still carries an erased course is stripped of it even when
//      the copy itself is newer than the erase
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:' + (process.env.PORT || 8901) + '/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d)))); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await browser.newPage({ viewport: { width: 1194, height: 834 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.goto(B, { waitUntil: 'load', timeout: 240000 });
  await p.waitForTimeout(13000);

  const R = await p.evaluate(async () => {
    const CID = 'C959', OTHER = 'D684';
    const past = Date.now() - 86400000;

    // Everything a worked-through class leaves behind.
    function seed() {
      // distinct ts AND qId per row: the union merge dedups on ts+':'+qId, so
      // rows that collide would look like they were kept out when they were
      // only ever mistaken for each other
      store.quizHistory = [{ courseId: CID, qId: 'c1', topic: 'Boolean', correct: true, ts: past },
                           { courseId: CID, qId: 'c2', topic: 'Graphs', correct: false, ts: past + 10 },
                           { courseId: OTHER, qId: 'd1', topic: 'DNS', correct: true, ts: past + 20 }];
      store.examSessions = [{ courseId: CID, score: 61, ts: past + 30 },
                            { courseId: OTHER, score: 80, ts: past + 40 }];
      store.sessions = [{ courseId: CID, mins: 25, ts: past + 50 }];
      store.preOaProgress = { [CID]: { done: 4 }, [OTHER]: { done: 1 } };
      store.pretests = { [CID]: { score: 55, ts: past } };
      store.flashcards = { [CID + '/ch4/s1/c1']: { ef: 2.1, interval: 6, reps: 4, due: past },
                           [CID + '/ch4/s1/c2']: { ef: 2.5, interval: 1, reps: 1, due: past },
                           [OTHER + '/g1/x3_1/c1']: { ef: 2.3, interval: 3, reps: 2, due: past } };
      store.userFlashcards = { [CID + '/ch4/s1']: [{ id: 'c1', front: 'a', back: 'b' }] };
      store.flashDecks = { d1: { id: 'd1', name: 'Boolean laws', courseId: CID, createdAt: past,
                                cards: [{ id: 'k1', front: 'De Morgan', back: 'flip', ef: 2.2, interval: 9, reps: 5, due: past }] },
                           d2: { id: 'd2', name: 'Networking', courseId: OTHER, createdAt: past,
                                cards: [{ id: 'n1', front: 'DNS', back: 'names', ef: 2.2, interval: 9, reps: 5, due: past }] } };
      store.flaggedQuestions = { q1: { courseId: CID, flaggedAt: past }, q2: { courseId: OTHER, flaggedAt: past } };
    }
    // deep copy, so the "other device" holds its own objects
    const copy = o => JSON.parse(JSON.stringify(o));

    const mine = () => ({
      quiz: (store.quizHistory || []).filter(h => h && h.courseId === CID).length,
      exams: (store.examSessions || []).filter(s => s && s.courseId === CID).length,
      sessions: (store.sessions || []).filter(s => s && s.courseId === CID).length,
      preOa: store.preOaProgress && store.preOaProgress[CID] ? 1 : 0,
      pretests: store.pretests && store.pretests[CID] ? 1 : 0,
      cards: Object.keys(store.flashcards || {}).filter(k => k.indexOf(CID + '/') === 0).length,
      userCards: Object.keys(store.userFlashcards || {}).filter(k => k.indexOf(CID + '/') === 0).length,
      deckScheduled: store.flashDecks && store.flashDecks.d1
        ? store.flashDecks.d1.cards.filter(c => c.reps !== undefined || c.due !== undefined).length : -1,
      flags: Object.values(store.flaggedQuestions || {}).filter(f => f && f.courseId === CID).length,
      due: (function(){ try { return dueCardsCount(); } catch (e) { return -1; } })()
    });
    const theirs = () => ({
      quiz: (store.quizHistory || []).filter(h => h && h.courseId === OTHER).length,
      exams: (store.examSessions || []).filter(s => s && s.courseId === OTHER).length,
      cards: Object.keys(store.flashcards || {}).filter(k => k.indexOf(OTHER + '/') === 0).length,
      deck: store.flashDecks && store.flashDecks.d2 ? store.flashDecks.d2.cards.length : -1,
      deckScheduled: store.flashDecks && store.flashDecks.d2
        ? store.flashDecks.d2.cards.filter(c => c.reps !== undefined || c.due !== undefined).length : -1,
      flags: Object.values(store.flaggedQuestions || {}).filter(f => f && f.courseId === OTHER).length
    });

    const out = {};

    /* ---- A. this device resets, then a NEWER copy still carrying the class
            arrives from the other device ---- */
    seed();
    saveStore(); if (saveStore.flushNow) saveStore.flushNow();
    out.before = mine();
    window.__resetCourseProgress(CID);
    out.afterReset = mine();
    const markAt = window.__erase.courseAt(CID);
    out.markRecorded = markAt > 0;

    // the other device's push: a full pre-reset copy, stamped AFTER the erase
    const phoneStore = {}; seed();                 // rebuild the pre-reset shape
    Object.keys(store).forEach(k => { if (k !== '__erased') phoneStore[k] = copy(store[k]); });
    // put this device back in its reset state before the pull
    window.__resetCourseProgress(CID);
    await new Promise(r => setTimeout(r, 50));

    window.__sync._apply({ v: 1, at: markAt + 2000, store: phoneStore });
    out.afterNewerPull = mine();
    out.theirsAfterPull = theirs();

    /* ---- B. the OTHER device learns of the erase and must carry it out ---- */
    seed();
    saveStore(); if (saveStore.flushNow) saveStore.flushNow();
    out.phoneBefore = mine();
    // an __erased record naming a course erase this device has not seen
    const rec = window.__erase.read();
    const fresh = { all: rec.all || 0, scores: rec.scores || 0, ink: rec.ink || 0,
                    pages: {}, courses: {} };
    fresh.courses[CID] = Date.now() + 1000;        // strictly newer than anything here
    window.__erase.absorb(fresh);
    await new Promise(r => setTimeout(r, 120));
    out.phoneAfterAbsorb = mine();
    out.phoneOtherAfterAbsorb = theirs();

    /* ---- C. work done AFTER the erase is not destroyed by it ---- */
    const later = Date.now() + 60000;
    store.quizHistory = (store.quizHistory || []).concat([{ courseId: CID, topic: 'redo', correct: true, ts: later }]);
    const rec2 = window.__erase.read();
    const fresh2 = { all: rec2.all || 0, scores: rec2.scores || 0, ink: rec2.ink || 0, pages: {}, courses: {} };
    fresh2.courses[CID] = Date.now() + 2000;
    window.__erase.absorb(fresh2);
    await new Promise(r => setTimeout(r, 120));
    out.keptNewWork = (store.quizHistory || []).filter(h => h && h.courseId === CID && h.ts === later).length;

    return out;
  });

  const zeroish = o => ['quiz','exams','sessions','preOa','pretests','cards','userCards','flags']
    .every(k => o[k] === 0) && o.deckScheduled === 0;

  ok('seeded a worked-through class', R.before.quiz === 2 && R.before.cards === 2 && R.before.flags === 1, R.before);
  ok('reset clears it on this device', zeroish(R.afterReset), R.afterReset);
  ok('the reset is recorded', R.markRecorded);
  ok('a NEWER copy carrying the class does not bring it back', zeroish(R.afterNewerPull), R.afterNewerPull);
  ok('that pull left the other class alone',
     R.theirsAfterPull.quiz === 1 && R.theirsAfterPull.exams === 1 && R.theirsAfterPull.cards === 1 &&
     R.theirsAfterPull.deckScheduled === 1 && R.theirsAfterPull.flags === 1, R.theirsAfterPull);
  ok('the other device held the class before it learned', R.phoneBefore.quiz === 2 && R.phoneBefore.cards === 2, R.phoneBefore);
  ok('learning of the erase carries it out here too', zeroish(R.phoneAfterAbsorb), R.phoneAfterAbsorb);
  ok('carrying it out left the other class alone',
     R.phoneOtherAfterAbsorb.quiz === 1 && R.phoneOtherAfterAbsorb.cards === 1 &&
     R.phoneOtherAfterAbsorb.deckScheduled === 1 && R.phoneOtherAfterAbsorb.flags === 1, R.phoneOtherAfterAbsorb);
  ok('nothing is due from the reset class', R.afterNewerPull.due === R.afterReset.due, [R.afterReset.due, R.afterNewerPull.due]);
  ok('work done after the erase survives it', R.keptNewWork === 1, R.keptNewWork);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));

  console.log('resetsticks: ' + pass + '/' + (pass + fail) + ' passed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
