// SECTION: Store, sync & reset
// "what else needs fixing" - measured: of the store's 28 keys, only 8 crossed
// between her iPad and her phone. Exam-sim results, pretest results, her own
// flashcard decks, Learn progress, exam dates, streak, XP, daily goal, calendar,
// planner, project status and text highlights all stopped at whichever device
// made them.
//
// Same three rules as the rest of the sync: never delete, union what
// accumulates, and let the LATER DECISION win only for the few things that are
// a decision (the daily goal, an exam date, which classes are active) rather
// than a record. And a class reset still outranks all of it.
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
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = {}, now = Date.now(), old = now - 86400000;

    /* ---- this device (the iPad): its own work ---- */
    store.examSessions = [{ id: 'e_mine', courseId: 'C959', ts: old, correct: 40, totalQs: 60 }];
    store.pretests = { C959: { takenAt: old, score: 12, total: 30, chapterScores: {} } };
    store.knowtProgress = { C959: { k1: { status: 'learning', hits: 1, lastSeen: old } } };
    store.flashDecks = { d1: { id: 'd1', name: 'Boolean', courseId: 'C959', createdAt: old,
      cards: [{ id: 'c1', front: 'De Morgan', back: 'flip', due: old, reps: 2 }] } };
    store.textHL = { 'C959/ch4/s1': [{ id: 'h_mine', text: 'mine', pre: '', post: '', color: 'y', ts: old }] };
    store.calendarEvents = [{ id: 'ev_mine', title: 'Study', date: '2026-09-20', createdAt: old }];
    store.plannerCards = [{ id: 'pc_mine', title: 'Unit 3', column: 'todo', createdAt: old }];
    store.projectStatus = { pr1: { status: 'started', startedAt: old } };
    store.streak = { lastStudy: '2026-09-15', count: 3 };
    store.xp = 500;
    store.goals = { dailyMin: 60, dailyCards: 20, dailyQs: 30 };
    store.testPrep = { C959: { examDate: '2026-11-01', examType: 'OA', notes: '' } };
    store.courseState = { C959: 'active' };
    store.activeOrder = ['C959'];
    store.__t = { goals: old, testPrep: old, courseState: old };
    saveStore(); if (saveStore.flushNow) saveStore.flushNow(); await wait(200);

    /* ---- the phone: different work in the same places, decided LATER ---- */
    const phone = {
      examSessions: [{ id: 'e_phone', courseId: 'D684', ts: now, correct: 30, totalQs: 60 }],
      pretests: { C959: { takenAt: now, score: 22, total: 30, chapterScores: {} },
                  D684: { takenAt: now, score: 18, total: 30, chapterScores: {} } },
      knowtProgress: { C959: { k1: { status: 'mastered', hits: 9, lastSeen: now }, k2: { status: 'learning', lastSeen: now } } },
      flashDecks: { d1: { id: 'd1', name: 'Boolean', courseId: 'C959', createdAt: old,
                          cards: [{ id: 'c1', front: 'De Morgan', back: 'flip', due: now, reps: 5 },
                                  { id: 'c2', front: 'Absorption', back: 'A+AB=A', due: now, reps: 1 }] },
                    d2: { id: 'd2', name: 'Networking', courseId: 'D684', createdAt: now, cards: [{ id: 'n1', due: now }] } },
      textHL: { 'C959/ch4/s1': [{ id: 'h_phone', text: 'theirs', pre: '', post: '', color: 'g', ts: now }] },
      calendarEvents: [{ id: 'ev_phone', title: 'Exam', date: '2026-11-01', createdAt: now }],
      plannerCards: [{ id: 'pc_phone', title: 'Unit 4', column: 'doing', createdAt: now }],
      projectStatus: { pr1: { status: 'done', startedAt: old, completedAt: now }, pr2: { status: 'started', startedAt: now } },
      streak: { lastStudy: '2026-09-17', count: 5 },
      xp: 900,
      goals: { dailyMin: 90, dailyCards: 30, dailyQs: 40 },
      testPrep: { C959: { examDate: '2026-12-05', examType: 'both', notes: 'moved' } },
      courseState: { C959: 'active', D684: 'active' },
      activeOrder: ['C959', 'D684'],
      __t: { goals: now, testPrep: now, courseState: now }
    };
    window.__sync._apply({ v: 1, at: now, store: JSON.parse(JSON.stringify(phone)) });
    await wait(400);

    const deck = store.flashDecks.d1 || {};
    const cardById = id => (deck.cards || []).filter(c => c && c.id === id)[0] || null;
    out.after = {
      exams: (store.examSessions || []).map(e => e.id).sort(),
      pretestC959: (store.pretests.C959 || {}).score, pretestD684: (store.pretests.D684 || {}).score,
      knowtK1: ((store.knowtProgress.C959 || {}).k1 || {}).status,
      knowtKeys: Object.keys(store.knowtProgress.C959 || {}).sort(),
      deckCards: (deck.cards || []).map(c => c.id).sort(), c1Reps: (cardById('c1') || {}).reps,
      decks: Object.keys(store.flashDecks).sort(),
      hl: (store.textHL['C959/ch4/s1'] || []).map(h => h.id).sort(),
      cal: (store.calendarEvents || []).map(e => e.id).sort(),
      plan: (store.plannerCards || []).map(e => e.id).sort(),
      proj1: (store.projectStatus.pr1 || {}).status, projKeys: Object.keys(store.projectStatus).sort(),
      streak: store.streak.count, xp: store.xp,
      goal: store.goals.dailyMin, exam: (store.testPrep.C959 || {}).examDate,
      active: (store.activeOrder || []).slice().sort()
    };

    /* ---- the decision rule runs both ways: an OLDER choice must not win ---- */
    window.__sync._apply({ v: 1, at: now + 1000, store: {
      goals: { dailyMin: 15 }, testPrep: { C959: { examDate: '2020-01-01' } },
      courseState: { C959: 'paused' }, activeOrder: [], __t: { goals: old, testPrep: old, courseState: old } } });
    await wait(300);
    out.olderChoice = { goal: store.goals.dailyMin, exam: (store.testPrep.C959 || {}).examDate, active: (store.activeOrder || []).length };

    /* ---- a class reset still outranks all of it ---- */
    window.__resetCourseProgress('C959'); await wait(300);
    const mark = window.__erase.courseAt('C959');
    out.afterReset = {
      exams: (store.examSessions || []).filter(e => e.courseId === 'C959').length,
      pretest: store.pretests.C959 ? 1 : 0,
      knowt: store.knowtProgress.C959 ? 1 : 0,
      deckScheduled: ((store.flashDecks.d1 || {}).cards || []).filter(c => c.due !== undefined).length,
      hl: (store.textHL['C959/ch4/s1'] || []).length   // an annotation, not a score: kept
    };
    // and the phone's pre-reset copy, stamped newer, cannot put it back
    window.__sync._apply({ v: 1, at: mark + 2000, store: JSON.parse(JSON.stringify(phone)) });
    await wait(400);
    out.afterSync = {
      exams: (store.examSessions || []).filter(e => e.courseId === 'C959').length,
      pretest: store.pretests.C959 ? 1 : 0,
      knowt: store.knowtProgress.C959 ? 1 : 0,
      hl: (store.textHL['C959/ch4/s1'] || []).length,
      otherClassKept: (store.examSessions || []).filter(e => e.courseId === 'D684').length
    };
    return out;
  });

  const A = R.after;
  ok('exam-sim results from both devices are kept', A.exams.join(',') === 'e_mine,e_phone', A.exams);
  ok('the later pretest wins, and a new class arrives', A.pretestC959 === 22 && A.pretestD684 === 18, [A.pretestC959, A.pretestD684]);
  ok('Learn progress takes the later sighting and gains the new card', A.knowtK1 === 'mastered' && A.knowtKeys.join(',') === 'k1,k2', A);
  ok('her own deck gains the phone\'s card and the later schedule', A.deckCards.join(',') === 'c1,c2' && A.c1Reps === 5, A);
  ok('a deck made only on the phone arrives whole', A.decks.join(',') === 'd1,d2', A.decks);
  ok('text highlights union, neither side lost', A.hl.join(',') === 'h_mine,h_phone', A.hl);
  ok('calendar and planner union by id', A.cal.join(',') === 'ev_mine,ev_phone' && A.plan.join(',') === 'pc_mine,pc_phone', [A.cal, A.plan]);
  ok('project status takes the later milestone', A.proj1 === 'done' && A.projKeys.join(',') === 'pr1,pr2', A);
  ok('the streak follows the device that studied most recently', A.streak === 5, A.streak);
  ok('XP takes the higher total', A.xp === 900, A.xp);
  ok('the LATER decision wins: goal, exam date, active classes', A.goal === 90 && A.exam === '2026-12-05' && A.active.join(',') === 'C959,D684', A);
  ok('an OLDER decision never overwrites a newer one', R.olderChoice.goal === 90 && R.olderChoice.exam === '2026-12-05' && R.olderChoice.active === 2, R.olderChoice);
  ok('a scores reset clears every new key that IS a score', R.afterReset.exams === 0 && R.afterReset.pretest === 0 && R.afterReset.knowt === 0 && R.afterReset.deckScheduled === 0, R.afterReset);
  /* Highlights are annotations, like her notes - "Reset scores & tests only"
     keeps those and says so. Asserted explicitly so no future change deletes
     them quietly, and so the strip rule is never tempted to remove them from
     the other device's copy either. */
  ok('but keeps her highlights, as it keeps her notes', R.afterReset.hl === 2, R.afterReset.hl);
  ok('and a newer pre-reset copy cannot bring the scores back', R.afterSync.exams === 0 && R.afterSync.pretest === 0 && R.afterSync.knowt === 0, R.afterSync);
  ok('while the other class is untouched by that reset', R.afterSync.otherClassKept === 1, R.afterSync);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));

  console.log('syncall: ' + pass + '/' + (pass + fail) + ' passed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
