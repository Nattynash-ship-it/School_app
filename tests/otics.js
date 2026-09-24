// SECTION: Quizzes & content
// The OT/ICS track: a course of its own. Every registered section must have
// real content behind it — a chapter list that promises seventeen lessons and
// delivers fourteen is worse than one that promises fourteen. The Security+
// Module 1 quiz must load with a rationale for every option, right and wrong,
// and the pack must be reachable through the manifest like any other course.
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8901;
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 500)))); };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage(); p.on('dialog', d => d.accept());
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  const reqs = []; p.on('request', r => { if (/content-OT-ICS/.test(r.url())) reqs.push(r.url()); });
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 240000 });
  await p.waitForTimeout(11000);

  // ---------- 1. the course exists and is shaped right ----------
  const course = await p.evaluate(() => {
    const c = COURSES['OT-ICS'];
    if (!c) return { missing: true };
    return { name: c.name, active: c.active, chapters: c.chapters.map(ch => ({ id: ch.id, n: ch.sections.length, title: ch.title })),
             secs: c.chapters.reduce((a, ch) => a + ch.sections.length, 0),
             everySecTitled: c.chapters.every(ch => ch.sections.every(s => s.id && (s.title || '').length > 8)) };
  });
  ok('the OT/ICS track is registered as a course of its own', !course.missing && course.active === true && /OT/.test(course.name), course);
  /* The app appends its own generated chapters to every course - weak-spot
     drills, missed-question review. Those are not mine and have no pack
     content, so assert MY chapters are present rather than that these are the
     only ones. */
  ok('with the six chapters the roadmap promises', !course.missing &&
     ['map', 'sys', 'sec', 'env', 'cases', 'labs'].every(id => course.chapters.some(c => c.id === id)), course);
  ok('and every section carries a real title', course.everySecTitled === true, course);

  // ---------- 2. the pack loads through the manifest ----------
  const load = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    go({ name: 'class', courseId: 'OT-ICS' }); await w(2500);
    const man = await (await fetch('/content-manifest.json')).json();
    const v = (man.fv || {})['OT-ICS'];
    const url = '/content-OT-ICS.json?v=' + encodeURIComponent(v || man.build);
    window.__otUrl = url;
    const r = await fetch(url);
    const pack = await r.json();
    return { url, fv: v, status: r.status, build: pack.build,
             lessons: Object.keys(JSON.parse(pack.l)).length, quizzes: Object.keys(JSON.parse(pack.q)).length };
  });
  ok('the content pack is served and version-stamped through the manifest',
     load.status === 200 && !!load.fv && /\?v=18\.\d+/.test(load.url) && load.lessons > 0, load);

  // ---------- 3. NO EMPTY SECTIONS ----------
  const cover = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const MINE = ['map', 'sys', 'sec', 'env', 'cases', 'labs'];
    const c = COURSES['OT-ICS'];
    const want = [];
    c.chapters.filter(ch => MINE.includes(ch.id))
              .forEach(ch => ch.sections.forEach(s => want.push('OT-ICS/' + ch.id + '/' + s.id)));
    const r = await fetch(window.__otUrl);
    const L = JSON.parse((await r.json()).l);
    const missing = want.filter(k => !L[k] || !(L[k].body || '').trim());
    const thin = want.filter(k => L[k] && (L[k].body || '').replace(/<[^>]*>/g, '').trim().length < 900);
    const orphan = Object.keys(L).filter(k => !want.includes(k));
    return { want: want.length, missing, thin, orphan,
             shortest: Math.min(...want.filter(k => L[k]).map(k => L[k].body.replace(/<[^>]*>/g, '').trim().length)) };
  });
  ok('every section the chapter list promises has a lesson behind it', cover.missing.length === 0, cover.missing);
  ok('no lesson is a stub — each is a real 30-minute read', cover.thin.length === 0, cover.thin);
  ok('and no lesson is stranded outside the chapter list', cover.orphan.length === 0, cover.orphan);

  // ---------- 4. the lesson renders ----------
  const lesson = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    go({ name: 'section', courseId: 'OT-ICS', chId: 'sec', secId: 's1' }); await w(2500);
    const el = document.querySelector('.lesson') || document.querySelector('#app');
    const t = (el.innerText || '');
    return { chars: t.length, hasCIA: /CIA triad/.test(t), hasOT: /PLC|Programmable Logic/.test(t),
             hasCallout: !!document.querySelector('.lesson .callout'),
             defines: /Programmable Logic Controller/.test(t) };
  });
  ok('Module 1 renders as a lesson, not a blank screen', lesson.chars > 2500 && lesson.hasCallout, lesson);
  ok('it teaches the concept and grounds it in a plant', lesson.hasCIA && lesson.hasOT, lesson);
  ok('and it spells out the acronym the first time it is used', lesson.defines === true, lesson);

  // ---------- 5b. EVERY lesson ends in a quiz ("Quiz me at the end of every lesson") ----------
  const allq = await p.evaluate(async () => {
    const r = await fetch(window.__otUrl);
    const pk = await r.json(); const L = JSON.parse(pk.l), Q = JSON.parse(pk.q);
    const noQuiz = Object.keys(L).filter(k => !(Q[k] && Q[k].length >= 4));
    const bad = [], oneSlot = [];
    Object.entries(Q).forEach(([k, qs]) => {
      if (new Set(qs.map(x => x.correct)).size < 2) oneSlot.push(k);
      qs.forEach(x => {
        const want = x.options.map((_, i) => String(i)).filter(i => +i !== x.correct);
        const got = Object.keys(x.distractors || {});
        if (want.length !== got.length || !want.every(w => got.includes(w))) bad.push(x.id);
      });
    });
    const inApp = Object.keys(L).filter(k => { const [c, ch, sc] = k.split('/'); try { const g = getQuestions(c, ch, sc); return !(g && g.length); } catch (e) { return true; } });
    return { lessons: Object.keys(L).length, total: Object.values(Q).reduce((a, v) => a + v.length, 0), noQuiz, bad, oneSlot, inApp };
  });
  ok('every lesson ends in a quiz of at least four questions', allq.noQuiz.length === 0, allq);
  ok('every question in the track explains each wrong option', allq.bad.length === 0, allq.bad.slice(0, 5));
  ok('no quiz has its answers all in the same slot', allq.oneSlot.length === 0, allq.oneSlot);
  ok('and the app itself can find every one of those quizzes', allq.inApp.length === 0, allq.inApp);

  // ---------- 5. the quiz, with a reason for every option ----------
  const quiz = await p.evaluate(async () => {
    const r = await fetch(window.__otUrl);
    const Q = JSON.parse((await r.json()).q);
    const qs = Q['OT-ICS/sec/s1'] || [];
    const bad = [];
    qs.forEach(q => {
      if (!(q.correct >= 0 && q.correct < q.options.length)) bad.push(q.id + ':correct');
      if ((q.explain || '').length < 40) bad.push(q.id + ':explain');
      const want = q.options.map((_, i) => String(i)).filter(i => +i !== q.correct);
      const got = Object.keys(q.distractors || {});
      if (want.length !== got.length || !want.every(k => got.includes(k))) bad.push(q.id + ':distractors');
      Object.values(q.distractors || {}).forEach(t => { if ((t || '').length < 15) bad.push(q.id + ':short'); });
    });
    const spread = new Set(qs.map(q => q.correct));
    return { n: qs.length, bad, answerSpread: spread.size, ids: new Set(qs.map(q => q.id)).size };
  });
  ok('Module 1 has a full-length quiz in the exam\'s style', quiz.n >= 10, quiz);
  ok('every question explains the right answer AND each wrong one', quiz.bad.length === 0, quiz.bad);
  ok('the correct answer is not always in the same place', quiz.answerSpread >= 3 && quiz.ids === quiz.n, quiz);

  // ---------- 6. the promises the user actually made me ----------
  const promises = await p.evaluate(async () => {
    const r = await fetch(window.__otUrl);
    const L = JSON.parse((await r.json()).l);
    const all = Object.values(L).map(v => v.body).join(' ');
    const txt = all.replace(/<[^>]*>/g, ' ');
    const has = s => txt.includes(s);
    return {
      verifiedFlags: (all.match(/VERIFIED/g) || []).length,
      unverifiedFlags: (all.match(/NOT VERIFIED/g) || []).length,
      safety: ['Safety Instrumented System', 'IEC 61511', 'TRITON', 'HAZOP', 'SIL'].filter(s => !has(s)),
      regs: ['NERC CIP', 'TSA', 'Clean Water Act', "America's Water Infrastructure Act", 'NIS2', 'Risk Management Program', 'Process Safety Management'].filter(s => !has(s)),
      cases: ['Stuxnet', 'Ukraine', 'Colonial', 'Oldsmar', 'Maroochy'].filter(s => !has(s)),
      systems: ['Anki', 'catch-up', 'weak-area', '15 minutes', 'portfolio'].filter(s => !txt.toLowerCase().includes(s.toLowerCase())),
      dataEdge: ['SQL', 'baselin', 'anomal'].filter(s => !txt.toLowerCase().includes(s.toLowerCase())),
      exams: ['SY0-701', 'GICSP', 'GRID', '62443', 'CISSP'].filter(s => !has(s)),
    };
  });
  ok('the safety module covers SIS, IEC 61511, SIL and TRITON', promises.safety.length === 0, promises.safety);
  ok('the regulations she asked for are all present', promises.regs.length === 0, promises.regs);
  ok('the case studies she asked for are all present', promises.cases.length === 0, promises.cases);
  ok('the study systems she asked for are all present', promises.systems.length === 0, promises.systems);
  ok('her data background is used as the stated advantage', promises.dataEdge.length === 0, promises.dataEdge);
  ok('all five certifications are named', promises.exams.length === 0, promises.exams);
  /* SHE ASKED TO BE TOLD WHAT IS VERIFIED AND WHAT IS NOT. A page that only
     ever says "verified" is not honouring that - the point is the distinction. */
  ok('exam facts are labelled verified or not, and both labels are actually used',
     promises.verifiedFlags >= 3 && promises.unverifiedFlags >= 3, promises);

  /* THE ANKI DECK SHE ASKED FOR. Tab-separated, exactly two fields a line, or
     Anki imports the whole line as the front of the card with an empty back. */
  const deck = await p.evaluate(async () => {
    const r = await fetch('/flashcards/ot-ics-m1.txt');
    const t = r.ok ? await r.text() : '';
    const lines = t.split('\n').filter(Boolean);
    const bad = lines.filter(l => l.split('\t').length !== 2 || l.split('\t').some(f => f.trim().length < 3));
    return { status: r.status, cards: lines.length, bad: bad.slice(0, 3) };
  });
  ok('the Anki deck is served and every line is exactly front<TAB>back', deck.status === 200 && deck.cards >= 40 && deck.bad.length === 0, deck);

  /* EACH "NEXT" ADDS A MODULE, and each module arrives whole: a lesson in the
     tree, a ten-question quiz behind it, and its own deck. */
  const m2 = await p.evaluate(async () => {
    const c = COURSES['OT-ICS'].chapters.find(ch => ch.id === 'sec');
    const inTree = !!(c && c.sections.some(sx => sx.id === 's2' && /Module 2/.test(sx.title)));
    const r = await fetch(window.__otUrl); const pk = await r.json();
    const L = JSON.parse(pk.l), Q = JSON.parse(pk.q);
    const body = (L['OT-ICS/sec/s2'] || {}).body || '';
    const txt = body.replace(/<[^>]*>/g, ' ');
    const d = await fetch('/flashcards/ot-ics-m2.txt'); const t = d.ok ? await d.text() : '';
    const lines = t.split('\n').filter(Boolean);
    return { inTree, chars: txt.length, quiz: (Q['OT-ICS/sec/s2'] || []).length,
             covers: ['Nation-state', 'Insider', 'Shadow IT', 'Pretexting', 'Watering hole', 'supply chain', 'Ukraine'].filter(k => !new RegExp(k, 'i').test(txt)),
             deck: { status: d.status, cards: lines.length, bad: lines.filter(l => l.split('\t').length !== 2).length },
             linked: /ot-ics-m2\.txt/.test((L['OT-ICS/sys/s4'] || {}).body || '') };
  });
  ok('Module 2 is in the tree with a full lesson behind it', m2.inTree && m2.chars > 6000 && m2.covers.length === 0, m2);
  ok('Module 2 ends in a ten-question quiz', m2.quiz >= 10, m2);
  ok('and ships its own deck, linked from the flashcards lesson', m2.deck.status === 200 && m2.deck.cards >= 30 && m2.deck.bad === 0 && m2.linked, m2);

  /* A NEVER-ACTIVATED COURSE READS AS LOCKED, and tapping it opens the
     activate/limit dialog instead of the lesson. A parallel certification track
     is not a degree class to be activated - it should simply open. */
  const gate = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    go({ name: 'home' }); await w(600);
    const before = activeCourseCount();
    go({ name: 'section', courseId: 'OT-ICS', chId: 'sec', secId: 's1' }); await w(2200);
    return { state: getCourseState('OT-ICS'), locked: !!document.querySelector('.v2-modal-bg'),
             view: (typeof view === 'object' && view) ? view.name : null,
             activeCount: before, limit: typeof V2_ACTIVE_LIMIT !== 'undefined' ? V2_ACTIVE_LIMIT : null,
             text: (document.getElementById('app').innerText || '').slice(0, 200) };
  });
  ok('the track opens even with her degree courses already active', gate.view === 'section' && !gate.locked, gate);
  ok('and it is not counted against the active-course limit', gate.state !== 'locked', gate);

  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close(); await b.close();
  console.log(`otics: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
