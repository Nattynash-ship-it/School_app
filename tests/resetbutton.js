// "when I reset the class it still displays the same review cards and the
//  classes revert back to the original percentage"
//
// Every earlier reset test called window.__resetCourseProgress directly. The
// button on the class page calls something else - CLASS_RESET_V1's doReset -
// which cleared the store and recorded no erase, dropped no in-memory session,
// and flushed nothing. So this test taps THE BUTTON, and reads THE SCREENS:
//   1. the readiness number on the class page goes to 0
//   2. Review shows none of that class's cards - and the same after a reload
//   3. the erase is recorded, so a newer copy from the other device that still
//      carries the class cannot put it back
//   4. every other class is untouched
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:' + (process.env.PORT || 8901) + '/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d)))); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await browser.newPage({ viewport: { width: 1194, height: 834 } });
  p.on('dialog', d => d.accept());
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(B, { waitUntil: 'load', timeout: 240000 });
  await p.waitForTimeout(13000);

  const R = await p.evaluate(async () => {
    const CID = 'C959', OTHER = 'C960';   // C960: a normal course with built-in cards; D286 has none
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    const past = Date.now() - 86400000;

    // A class she has worked through: real answers in real sections, so the
    // readiness number is genuinely above zero, plus a review schedule.
    function seed(cid, n) {
      const c = COURSES[cid];
      let pushed = 0;
      for (const ch of c.chapters) {
        for (const sec of ch.sections) {
          const qs = getQuestions(cid, ch.id, sec.id) || [];
          qs.slice(0, 6).forEach(q => {
            store.quizHistory.push({ courseId: cid, chId: ch.id, secId: sec.id, qId: q.id, topic: q.topic, correct: true, confidence: null, ts: past + pushed });
            pushed++;
          });
          const cards = getFlashcards(cid, ch.id, sec.id) || [];
          cards.slice(0, 3).forEach(card => { store.flashcards[cid + '/' + ch.id + '/' + sec.id + '/' + card.id] = { ef: 2.3, interval: 4, reps: 3, due: past }; });
          if (pushed >= n) return pushed;
        }
      }
      return pushed;
    }
    store.quizHistory = store.quizHistory || [];
    store.flashcards = store.flashcards || {};
    out.seededMine = seed(CID, 40);
    out.seededTheirs = seed(OTHER, 12);
    store.celebrated = store.celebrated || { sections: {}, chapters: {}, courses: {} };
    store.celebrated.sections[CID + '/ch4/s1'] = past;
    store.sectionRatings = store.sectionRatings || {};
    store.sectionRatings[CID + '/ch4/s1'] = { rating: 4 };
    store.flashDecks = { d1: { id: 'd1', name: 'mine', courseId: CID, createdAt: past, cards: [{ id: 'k1', front: 'a', back: 'b', reps: 5, due: past }] } };
    store.flaggedQuestions = { q1: { courseId: CID, flaggedAt: past } };
    store.notes = store.notes || {};
    store.notes[CID + '/ch4/s1'] = [{ id: 'n1', text: 'keep me until Reset everything', createdAt: past }];
    saveStore(); if (saveStore.flushNow) saveStore.flushNow();
    await wait(300);
    // the other device's copy, taken now, pre-reset
    const phone = JSON.parse(JSON.stringify({ quizHistory: store.quizHistory, flashcards: store.flashcards, celebrated: store.celebrated, flaggedQuestions: store.flaggedQuestions, flashDecks: store.flashDecks }));

    const readiness = () => {
      const el = document.querySelector('.readiness span[style*="36px"]');
      return { shown: el ? parseInt(el.textContent, 10) : null, computed: classProgress(CID).pct };
    };
    const reviewCards = () => {
      go({ name: 'review' });
      return new Promise(r => setTimeout(() => {
        const cards = (flashState && flashState.cards) || [];
        r({ mine: cards.filter(c => c._courseId === CID).length, theirs: cards.filter(c => c._courseId === OTHER).length,
            due: dueCardsCount(), empty: !!document.querySelector('.empty') });
      }, 500));
    };

    go({ name: 'class', courseId: CID });
    await wait(900);
    out.before = readiness();
    out.theirsBefore = { quiz: store.quizHistory.filter(h => h.courseId === OTHER).length,
                         cards: Object.keys(store.flashcards).filter(k => k.indexOf(OTHER + '/') === 0).length,
                         pct: classProgress(OTHER).pct };
    out.beforeReview = await reviewCards();

    /* ---- tap the real button ---- */
    go({ name: 'class', courseId: CID });
    await wait(900);
    const btn = document.querySelector('[data-classreset="' + CID + '"]');
    out.buttonFound = !!btn;
    if (btn) btn.click();
    await wait(300);
    const goBtn = document.querySelector('#class-reset-dlg [data-cr-go="tests"]');
    out.dialogFound = !!goBtn;
    if (goBtn) goBtn.click();
    await wait(900);

    out.after = readiness();
    out.mark = window.__erase.courseAt(CID);
    out.afterStore = {
      quiz: store.quizHistory.filter(h => h.courseId === CID).length,
      cards: Object.keys(store.flashcards).filter(k => k.indexOf(CID + '/') === 0).length,
      celebrated: Object.keys(store.celebrated.sections).filter(k => k.indexOf(CID + '/') === 0).length,
      ratings: Object.keys(store.sectionRatings).filter(k => k.indexOf(CID + '/') === 0).length,
      deckScheduled: store.flashDecks.d1.cards.filter(c => c.reps !== undefined).length,
      flags: Object.values(store.flaggedQuestions).filter(f => f && f.courseId === CID).length,
      notes: (store.notes[CID + '/ch4/s1'] || []).length
    };
    out.theirs = { quiz: store.quizHistory.filter(h => h.courseId === OTHER).length,
                   cards: Object.keys(store.flashcards).filter(k => k.indexOf(OTHER + '/') === 0).length,
                   pct: classProgress(OTHER).pct };
    out.afterReview = await reviewCards();
    // written to disk, not just to memory
    let disk = null;
    try { const raw = localStorage.getItem('studysmart_v1') || localStorage.getItem('study_hub_store') || ''; disk = raw.length; } catch (e) {}
    out.diskLen = disk;

    /* ---- the other device pushes its pre-reset copy, stamped newer ---- */
    go({ name: 'class', courseId: CID }); await wait(600);
    window.__sync._apply({ v: 1, at: out.mark + 2000, store: phone });
    await wait(600);
    out.afterSync = readiness();
    out.afterSyncStore = { quiz: store.quizHistory.filter(h => h.courseId === CID).length,
                           cards: Object.keys(store.flashcards).filter(k => k.indexOf(CID + '/') === 0).length,
                           celebrated: Object.keys(store.celebrated.sections).filter(k => k.indexOf(CID + '/') === 0).length };
    out.afterSyncReview = await reviewCards();
    out.theirsAfterSync = { quiz: store.quizHistory.filter(h => h.courseId === OTHER).length, pct: classProgress(OTHER).pct };
    return out;
  });

  ok('the class had real progress before', R.before.computed > 0 && R.before.shown === R.before.computed, R.before);
  ok('and its cards were in Review before', R.beforeReview.mine > 0, R.beforeReview);
  // the "left alone" checks below mean nothing unless the other class had
  // something to lose - so that is asserted first, not assumed
  ok('the other class had real progress and cards before', R.theirsBefore.pct > 0 && R.theirsBefore.cards > 0 && R.beforeReview.theirs > 0, [R.theirsBefore, R.beforeReview]);
  ok('the reset button on the class page is the one tapped', R.buttonFound && R.dialogFound, [R.buttonFound, R.dialogFound]);
  ok('the readiness number on screen goes to 0', R.after.shown === 0 && R.after.computed === 0, R.after);
  ok('the store is clear of the class', R.afterStore.quiz === 0 && R.afterStore.cards === 0 && R.afterStore.celebrated === 0 && R.afterStore.ratings === 0 && R.afterStore.deckScheduled === 0 && R.afterStore.flags === 0, R.afterStore);
  ok('scores-only keeps her notes', R.afterStore.notes === 1, R.afterStore.notes);
  ok('the erase is recorded from THIS button', R.mark > 0, R.mark);
  ok('Review shows none of its cards', R.afterReview.mine === 0, R.afterReview);
  ok('Review still shows the other class', R.afterReview.theirs > 0, R.afterReview);
  ok('the other class is untouched', R.theirs.quiz === R.seededTheirs && R.theirs.pct > 0 && R.theirs.cards > 0, R.theirs);
  ok('a NEWER pre-reset copy from the other device does not bring it back', R.afterSync.shown === 0 && R.afterSync.computed === 0 && R.afterSyncStore.quiz === 0 && R.afterSyncStore.cards === 0 && R.afterSyncStore.celebrated === 0, [R.afterSync, R.afterSyncStore]);
  ok('nor its cards into Review', R.afterSyncReview.mine === 0, R.afterSyncReview);
  ok('and that sync left the other class alone', R.theirsAfterSync.quiz === R.seededTheirs && R.theirsAfterSync.pct > 0, R.theirsAfterSync);

  /* ---- reload: the reset survived on disk ---- */
  await p.reload({ waitUntil: 'load', timeout: 240000 });
  await p.waitForTimeout(13000);
  const L = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    go({ name: 'class', courseId: 'C959' }); await wait(900);
    const el = document.querySelector('.readiness span[style*="36px"]');
    const shown = el ? parseInt(el.textContent, 10) : null;
    go({ name: 'review' }); await wait(500);
    const cards = (flashState && flashState.cards) || [];
    return { shown, computed: classProgress('C959').pct, mine: cards.filter(c => c._courseId === 'C959').length,
             theirs: cards.filter(c => c._courseId === 'C960').length, mark: window.__erase.courseAt('C959') };
  });
  ok('after a reload the class is still at 0', L.shown === 0 && L.computed === 0, L);
  ok('after a reload Review still shows none of its cards', L.mine === 0 && L.theirs > 0, L);
  ok('after a reload the erase record is still there', L.mark > 0, L.mark);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));

  console.log('resetbutton: ' + pass + '/' + (pass + fail) + ' passed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
