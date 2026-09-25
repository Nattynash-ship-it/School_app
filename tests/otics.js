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
    const MINE = ['map', 'sys', 'sec', 'env', 'cases', 'labs', 'found', 'iec', 'gicsp', 'grid', 'cissp', 'track'];
    const c = COURSES['OT-ICS'];
    const want = [];
    c.chapters.filter(ch => MINE.includes(ch.id))
              .forEach(ch => ch.sections.forEach(s => want.push('OT-ICS/' + ch.id + '/' + s.id)));
    const r = await fetch(window.__otUrl);
    const L = JSON.parse((await r.json()).l);
    const missing = want.filter(k => !L[k] || !(L[k].body || '').trim());
    /* the tracker's pack lesson is deliberately a short fallback - the page
       she sees is built live by the otTracker module, and tested below */
    const thin = want.filter(k => k !== 'OT-ICS/track/s1' && L[k] && (L[k].body || '').replace(/<[^>]*>/g, '').trim().length < 900);
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

  /* THE TRACKER: "Can this be added to the app?" A live page built from her
     own scoring - a row per module with status and scores, the weak-area log
     she can add to, flashcards due, the four-line check-in. It must react to
     a real quiz round, and what she adds must survive a reload. */
  const tr = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    go({ name: 'section', courseId: 'OT-ICS', chId: 'track', secId: 's1' }); await w(2000);
    const page = () => document.querySelector('.lesson .ot-track');
    out.live = !!page();
    /* A NEGATIVE CONTROL MUST REPORT, NOT CRASH: with the module absent every
       check below fails on its own line instead of taking the harness down. */
    if (!out.live) return Object.assign(out, { rows: 0, manual: [], checkin: '' });
    out.rows = page() ? page().querySelectorAll('tr[data-ot-mod]').length : 0;
    out.lessons = COURSES['OT-ICS'].chapters.filter(c => !/^(track|weak_drill|review_missed|userdocs|hard_drill|challenge)$/.test(c.id)).reduce((a, c) => a + c.sections.length, 0);
    const m1 = () => page().querySelector('tr[data-ot-mod="sec/s1"]');
    out.m1Before = m1() ? m1().children[1].textContent.trim() : null;
    // a real round on Module 1: answer every question correctly through the app's own history shape
    const qs = getQuestions('OT-ICS', 'sec', 's1') || [];
    const rid = Date.now() - 60000;
    qs.forEach((q, i) => store.quizHistory.push({ courseId: 'OT-ICS', chId: 'sec', secId: 's1', qId: q.id, topic: q.topic, correct: true, confidence: null, ts: rid + i * 1000, rid }));
    saveStore(); render(); await w(900);
    out.m1After = m1() ? m1().children[1].textContent.trim() : null;
    out.m1Best = m1() ? m1().children[2].textContent.trim() : null;
    // a weak round on Module 2: 4 of 10 right, so the topic surfaces in the auto log
    const q2 = getQuestions('OT-ICS', 'sec', 's2') || [];
    const rid2 = Date.now() - 30000;
    q2.forEach((q, i) => store.quizHistory.push({ courseId: 'OT-ICS', chId: 'sec', secId: 's2', qId: q.id, topic: q.topic, correct: i < 4, confidence: null, ts: rid2 + i * 1000, rid: rid2 }));
    saveStore(); render(); await w(900);
    out.m2After = page().querySelector('tr[data-ot-mod="sec/s2"]').children[1].textContent.trim();
    out.autoWeak = [...page().querySelectorAll('.ot-auto li')].map(li => li.textContent).some(t => /Module 2/.test(t));
    // add an entry by the buttons, as she would
    page().querySelector('[data-ot-topic]').value = 'client vs agentless';
    page().querySelector('[data-ot-note]').value = 'agent installed on host vs scanned over network; OT usually cannot install';
    page().querySelector('[data-ot-add]').click(); await w(700);
    out.manual = [...document.querySelectorAll('.ot-track .ot-man li')].map(li => li.textContent.replace(/\s+/g, ' ').trim());
    out.checkin = document.querySelector('.ot-track [data-ot-checkin]').value;
    document.querySelector('.ot-track [data-ot-exam]').value = '2027-02-01';
    document.querySelector('.ot-track [data-ot-exam]').dispatchEvent(new Event('change', { bubbles: true })); await w(600);
    out.examStored = store.otExamDate;
    return out;
  });
  ok('the tracker is a live page with a row for every module in the track', tr.live && tr.rows === tr.lessons && tr.rows > 25, tr);
  ok('a real quiz round moves a module from not started to solid', /not started/.test(tr.m1Before || '') && /solid/.test(tr.m1After || '') && tr.m1Best === '100%', tr);
  ok('a weak round is marked weak and its topic surfaces in the auto weak-area log', /weak/.test(tr.m2After || '') && tr.autoWeak === true, tr);
  ok('she can add her own weak-area entry, and it lands as pending', tr.manual.length === 1 && /pending/.test(tr.manual[0]) && /client vs agentless/.test(tr.manual[0]), tr.manual);
  ok('the check-in carries all six lines and her entry', ['Week of:', 'Modules done:', 'Quiz scores:', 'Wrong-answer topics:', 'Hours actually studied:', 'Life factor:'].every(l => tr.checkin.includes(l)) && /client vs agentless/.test(tr.checkin) && /Module 1[^\n]*100%/.test(tr.checkin), tr.checkin);
  ok('and the exam date is stored', tr.examStored === '2027-02-01', tr);

  /* THE AUDIT'S FIXES, PINNED. Five columns did not fit a phone; the decks were
     not on the train; the inputs had no names; four overviews read the same. */
  const au = await p.evaluate(() => {
    const r = document.querySelector('.ot-track');
    return {
      offlineDecks: (window.__offline && window.__offline.urlsFor(['OT-ICS']) || []).filter(u => /\/flashcards\/ot-ics-.*\.txt$/.test(u)).length,
      offlineOthers: (window.__offline && window.__offline.urlsFor(['C959']) || []).filter(u => /flashcards/.test(u)).length,
      labelled: ['[data-ot-topic]', '[data-ot-note]', '[data-ot-exam]'].every(q => (r.querySelector(q).getAttribute('aria-label') || '').length > 3),
      overviews: [...r.querySelectorAll('td.ot-t')].map(td => td.textContent).filter(t => /overview/.test(t)),
    };
  });
  ok('the offline save list for the track carries its four decks (Modules 1-3 and foundations) - and only for the track', au.offlineDecks === 4 && au.offlineOthers === 0, au);
  ok('every input on the tracker has a name a screen reader can say', au.labelled === true, au);
  ok('the four course overviews are named by course, not all "Course overview"', au.overviews.length >= 4 && new Set(au.overviews).size === au.overviews.length && au.overviews.every(t => /62443|GICSP|GRID|CISSP|Security\+/.test(t)), au.overviews);

  const ph = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const pp = await ph.newPage(); pp.on('dialog', d => d.accept());
  await pp.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 240000 }); await pp.waitForTimeout(11000);
  const phone = await pp.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    go({ name: 'section', courseId: 'OT-ICS', chId: 'track', secId: 's1' }); await w(2500);
    const t = document.querySelector('.ot-track .ot-mods'); const rows = [...t.querySelectorAll('tr[data-ot-mod]')];
    const vw = innerWidth;
    const off = rows.filter(tr => [...tr.children].some(td => td.getBoundingClientRect().right > vw + 1)).length;
    return { stacked: getComputedStyle(rows[0]).display === 'block', headHidden: getComputedStyle(t.querySelector('tr.ot-head')).display === 'none',
             tableRight: Math.round(t.getBoundingClientRect().right), vw, rowsOff: off, pageWide: document.documentElement.scrollWidth > vw + 1 };
  });
  await ph.close();
  ok('on a phone each module is a block, the header goes, and nothing runs off the right edge', phone.stacked && phone.headHidden && phone.rowsOff === 0 && !phone.pageWide && phone.tableRight <= phone.vw, phone);

  await p.reload({ waitUntil: 'load', timeout: 240000 }); await p.waitForTimeout(9000);
  const tr2 = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    // the reload wiped the pack URL the later checks fetch; restore it
    const man = await (await fetch('/content-manifest.json')).json();
    window.__otUrl = '/content-OT-ICS.json?v=' + encodeURIComponent((man.fv || {})['OT-ICS'] || man.build);
    go({ name: 'section', courseId: 'OT-ICS', chId: 'track', secId: 's1' }); await w(2000);
    const li = document.querySelector('.ot-track .ot-man li');
    if (!li) return { before: '', after: '', gone: -1, exam: null, m1: '' };
    const before = li ? li.textContent : '';
    li.querySelector('[data-ot-toggle]').click(); await w(600);
    const after = (document.querySelector('.ot-track .ot-man li') || {}).textContent || '';
    document.querySelector('.ot-track .ot-man li [data-ot-del]').click(); await w(600);
    return { before, after, gone: document.querySelectorAll('.ot-track .ot-man li').length, exam: document.querySelector('.ot-track [data-ot-exam]').value,
             m1: document.querySelector('tr[data-ot-mod="sec/s1"]').children[1].textContent.trim() };
  });
  ok('after a reload the entry, the scores and the exam date are still there', /client vs agentless/.test(tr2.before) && /solid/.test(tr2.m1) && tr2.exam === '2027-02-01', tr2);
  ok('marking it fixed works, and deleting removes it', /fixed/.test(tr2.after) && tr2.gone === 0, tr2);

  /* THE SKELETON: the whole programme visible in the app. Every course has
     its own chapter with a real overview - format, schedule, module outline,
     exam-day traps - and the foundation topics and the renewables/water module
     she asked for are there as lessons, not as promises. */
  const skel = await p.evaluate(async () => {
    const ch = id => COURSES['OT-ICS'].chapters.find(c => c.id === id);
    const r = await fetch(window.__otUrl); const pk = await r.json();
    const L = JSON.parse(pk.l), Q = JSON.parse(pk.q);
    const txt = k => ((L[k] || {}).body || '').replace(/<[^>]*>/g, ' ');
    const has = (k, ...words) => words.filter(w => !new RegExp(w, 'i').test(txt(k)));
    const d = await fetch('/flashcards/ot-ics-foundations.txt'); const t = d.ok ? await d.text() : '';
    return {
      courses: ['iec', 'gicsp', 'grid', 'cissp'].map(id => ({ id, chapter: !!ch(id), overview: (txt('OT-ICS/' + id + '/s0').length > 3000), quiz: (Q['OT-ICS/' + id + '/s0'] || []).length })),
      overviewsSayWhat: ['iec', 'gicsp', 'grid', 'cissp'].flatMap(id => has('OT-ICS/' + id + '/s0', 'Module outline|module list|The eight domains', 'strategy|mindset', 'VERIFIED')),
      found: ch('found') ? ch('found').sections.length : 0,
      foundCovers: [...has('OT-ICS/found/s1', 'OSI', 'subnet', 'VLAN'), ...has('OT-ICS/found/s2', 'Purdue', 'conduit', '3\\.5'), ...has('OT-ICS/found/s3', 'RTU', 'DCS', 'historian'),
                    ...has('OT-ICS/found/s4', 'DNP3', 'OPC UA', '61850', 'Profinet'), ...has('OT-ICS/found/s5', 'Inhibit Response', 'Impair Process'), ...has('OT-ICS/found/s6', 'NERC CIP', 'TSA', 'NIS2')],
      env: ch('env') ? ch('env').sections.length : 0,
      renewables: has('OT-ICS/env/s3', '61850', '62351', '1547', 'battery', 'wind', 'aggregator'),
      water: has('OT-ICS/env/s4', 'chlorine', 'wastewater', 'AWIA', 'pressure'),
      secOutline: has('OT-ICS/sec/s0', 'Third-party risk, compliance, audits', 'Monitoring, logging and alerting', 'practice exam'),
      deck: { status: d.status, cards: t.split('\n').filter(Boolean).length, bad: t.split('\n').filter(Boolean).filter(l => l.split('\t').length !== 2).length },
    };
  });
  ok('all four remaining courses have a chapter with a full overview and a quiz', skel.courses.every(c => c.chapter && c.overview && c.quiz >= 4), skel.courses);
  ok('each overview gives the module outline, the exam strategy and verified facts', skel.overviewsSayWhat.length === 0, skel.overviewsSayWhat);
  ok('the six foundation topics are lessons, each covering what its title promises', skel.found === 6 && skel.foundCovers.length === 0, skel);
  ok('renewables/grid and water are in the safety module', skel.env === 4 && skel.renewables.length === 0 && skel.water.length === 0, skel);
  ok('the Security+ overview now lists every module to come', skel.secOutline.length === 0, skel.secOutline);
  ok('and the foundations deck is served', skel.deck.status === 200 && skel.deck.cards >= 40 && skel.deck.bad === 0, skel.deck);

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
  /* "yes please" - Module 3, objectives 1.3 and 1.4: change management and
     cryptography, the same whole shape: lesson, quiz, deck, and its figure. */
  const m3 = await p.evaluate(async () => {
    const c = COURSES['OT-ICS'].chapters.find(ch => ch.id === 'sec');
    const inTree = !!(c && c.sections.some(sx => sx.id === 's3' && /Module 3/.test(sx.title)));
    const r = await fetch(window.__otUrl); const pk = await r.json();
    const L = JSON.parse(pk.l), Q = JSON.parse(pk.q);
    const body = (L['OT-ICS/sec/s3'] || {}).body || '';
    const txt = body.replace(/<[^>]*>/g, ' ');
    const d = await fetch('/flashcards/ot-ics-m3.txt'); const t = d.ok ? await d.text() : '';
    const lines = t.split('\n').filter(Boolean);
    const qs = Q['OT-ICS/sec/s3'] || [];
    return { inTree, chars: txt.length, quiz: qs.length, slots: [...new Set(qs.map(q => q.correct))].length,
             covers: ['Backout plan', 'Maintenance window', 'Dependencies', 'AES', 'Diffie-Hellman', 'salt', 'HSM', 'Tokenization', 'OCSP', 'Wildcard', 'CSR', 'Modbus'].filter(k => !new RegExp(k, 'i').test(txt)),
             figure: /data-figure="hand"/.test(body) && /chain of trust/i.test(body),
             deck: { status: d.status, cards: lines.length, bad: lines.filter(l => l.split('\t').length !== 2).length },
             linked: /ot-ics-m3\.txt/.test((L['OT-ICS/sys/s4'] || {}).body || ''),
             offline: (window.__offline && window.__offline.files && (window.__offline.files['OT-ICS'] || []).indexOf('/flashcards/ot-ics-m3.txt') >= 0) };
  });
  ok('Module 3 is in the tree with a full lesson covering all of 1.3 and 1.4', m3.inTree && m3.chars > 9000 && m3.covers.length === 0 && m3.figure, m3);
  ok('Module 3 ends in a ten-question quiz whose answers are spread across slots', m3.quiz >= 10 && m3.slots >= 3, m3);
  ok('its deck is served, linked from the flashcard page, and saved for offline', m3.deck.status === 200 && m3.deck.cards >= 40 && m3.deck.bad === 0 && m3.linked && m3.offline, m3);
  /* "Sorry both" - the explainer she left blank on the quiz, as a highlighted
     box in the lesson: agent on the host vs scanned over the network, and why
     OT usually has no choice. */
  const m2c = await p.evaluate(async () => {
    const r = await fetch(window.__otUrl); const L = JSON.parse((await r.json()).l);
    const b = (L['OT-ICS/sec/s2'] || {}).body || '';
    const box = b.split('<div class="callout"').find(x => /Client-based vs agentless/.test(x)) || '';
    const t = box.replace(/<[^>]*>/g, ' ');
    const T = t.replace(/\s+/g, ' ');   // the source wraps lines mid-phrase
    return { box: !!box, agent: /installed on the host/.test(T), agentless: /over the network/.test(T) && /nothing installed/.test(T), ot: /cannot.*install|crash a controller/.test(T), label: /ON THE EXAM/.test(box) };
  });
  ok('and carries the client-vs-agentless explainer as a highlighted box', m2c.box && m2c.agent && m2c.agentless && m2c.ot && m2c.label, m2c);
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
