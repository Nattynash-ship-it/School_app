// SECTION: Quizzes & content
// The survival and emergency-preparedness course: "a full survivalist guide
// that covers EVERYTHING I need to know ... this is a matter of life and
// death". It is her own track, like OT/ICS: always open, never counted
// against the active-course limit. Every chapter the list promises has a
// real lesson and a quiz behind it; every lesson labels its sources; the NYC
// chapter teaches the official shelter finders and the numbers to call; the
// PA and OA simulations are full sittings that share nothing with the
// practice quizzes; the flashcard decks are served and held offline.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 8901;
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 500)))); };
const MINE = ['start', 'water', 'food', 'shelter', 'nyc', 'medical', 'sanitation', 'power', 'fire', 'security', 'garden', 'carpentry', 'navigate', 'docs', 'people', 'drills'];
const norm = t => String(t || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;|&#\d+;/g, ' ').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).join(' ');

// ---------- 1. the files ----------
const pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'content-SURVIVE.json'), 'utf8'));
const L = JSON.parse(pack.l), Q = JSON.parse(pack.q);
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'content-manifest.json'), 'utf8'));
ok('the course file is stamped through the manifest', man.fv.SURVIVE === pack.build && /^18\.\d+$/.test(pack.build), { fv: man.fv.SURVIVE, build: pack.build });
const lessonKeys = Object.keys(L).filter(k => !/_sim\//.test(k)); // the two simulation chapters carry a short intro, not a lesson
const thin = lessonKeys.filter(k => (L[k].body || '').replace(/<[^>]*>/g, '').trim().length < 2500);
ok('fifty lessons across sixteen chapters, none a stub', lessonKeys.length === 50 && thin.length === 0 && MINE.every(c => lessonKeys.some(k => k.startsWith('SURVIVE/' + c + '/'))), { n: lessonKeys.length, thin: thin.slice(0, 5) });
const noSources = lessonKeys.filter(k => !/✅ VERIFIED/.test(L[k].body) || !/https?:\/\//.test(L[k].body));
ok('every lesson names its sources in a verified callout with a link', noSources.length === 0, noSources.slice(0, 5));
const noAct = lessonKeys.filter(k => !/🛠 DO THIS NOW/.test(L[k].body) || !/⚠ DEADLY MISTAKE/.test(L[k].body) || !/🗽 IN NEW YORK CITY/.test(L[k].body));
ok('every lesson ends in actions she can take this week and names the mistake that kills', noAct.length === 0, noAct.slice(0, 5));
const unsureBad = lessonKeys.filter(k => { const b = L[k].body; let i = 0, bad = false; while ((i = b.indexOf('❓ NOT VERIFIED', i)) >= 0) { if (!/confirm/i.test(b.slice(i, i + 3000))) bad = true; i += 10; } return bad; });
ok('anything not verified says so and tells her to confirm it', unsureBad.length === 0, unsureBad);
const figs = lessonKeys.filter(k => /data-figure="hand"/.test(L[k].body)).length;
ok('the course is illustrated: at least thirty drawn figures', figs >= 30, { figs });
// quizzes
const noQuiz = lessonKeys.filter(k => !(Q[k] && Q[k].length >= 6));
ok('every lesson ends in a quiz of at least six questions', noQuiz.length === 0, noQuiz.slice(0, 5));
const badQ = [], oneSlot = [];
for (const [k, qs] of Object.entries(Q)) {
  if (new Set(qs.map(x => x.correct)).size < 2) oneSlot.push(k);
  for (const x of qs) {
    const o = x.options || [];
    if (o.length !== 4 || new Set(o.map(String)).size !== 4 || typeof x.correct !== 'number' || x.correct < 0 || x.correct > 3 || String(x.explain || '').length < 40) { badQ.push(x.id); continue; }
    const want = o.map((_, i) => String(i)).filter(i => +i !== x.correct); const got = Object.keys(x.distractors || {});
    if (want.length !== got.length || !want.every(w => got.includes(w)) || Object.values(x.distractors).some(t => String(t).length < 15)) badQ.push(x.id);
    if (!x.topic) badQ.push(x.id + ':topic');
  }
}
ok('every question has four options, a right answer, a reason for every option and a topic', badQ.length === 0, badQ.slice(0, 6));
ok('no quiz keeps its answer in the same slot', oneSlot.length === 0, oneSlot);
// simulations
const pa = Q['SURVIVE/pa_sim/sim'] || [], oa = Q['SURVIVE/oa_sim/sim'] || [];
ok('the PA and OA simulations each hold a full sitting', pa.length >= 50 && oa.length >= 50, { pa: pa.length, oa: oa.length });
const practice = new Set(); for (const k of lessonKeys) for (const q of Q[k] || []) practice.add(norm(q.text));
const paT = new Set(pa.map(q => norm(q.text))), oaT = new Set(oa.map(q => norm(q.text)));
ok('no simulation question is a practice question, and PA and OA share none', ![...paT, ...oaT].some(t => practice.has(t)) && ![...paT].some(t => oaT.has(t)));
const chapters = new Set([...pa, ...oa].map(q => q.topic));
ok('the simulations span the whole course (at least twenty section topics)', chapters.size >= 20, { topics: chapters.size });
ok('the manifest index matches both pools', man.qids && man.qids.SURVIVE && ['pa_sim', 'oa_sim'].every(p => (man.qids.SURVIVE['SURVIVE/' + p + '/sim'] || []).slice().sort().join() === Q['SURVIVE/' + p + '/sim'].map(q => q.id).sort().join()));
// the NYC promises
const nyc = MINE.filter(c => c === 'nyc').flatMap(c => lessonKeys.filter(k => k.startsWith('SURVIVE/nyc/'))).map(k => L[k].body).join(' ');
ok('the NYC chapter teaches the zone finder, 311, Notify NYC and Code Blue', /knowyourzone|maps\.nyc\.gov\/hurricane|finder\.nyc\.gov\/hurricane/i.test(nyc) && /\b311\b/.test(nyc) && /692-?692/.test(nyc) && /Code Blue/.test(nyc) && /coolingcenters|cooling center/i.test(nyc));
ok('and every shelter address it prints is marked confirm-at-the-time', !/\d{2,5} [A-Z][a-z]+ (St|Ave|Pl|Rd|Blvd)\b/.test(nyc) || /confirm/i.test(nyc));
// water and first-aid numbers that must be exact
const all = lessonKeys.map(k => L[k].body).join(' ');
ok('the bleach dose and the boil time are the CDC ones', /8 drops/.test(all) && /16 drops/.test(all) && /30 minutes/.test(all) && /1 minute|one minute/i.test(all));
ok('CPR is taught at the Red Cross ratio and rate', /30 compressions/.test(all) && /100(?:–|-|&ndash;| to )120/.test(all));
ok('generators: outdoors, 20 feet from openings, with a CO alarm', /20 feet/.test(all) && /carbon monoxide/i.test(all));
// flashcards
const decks = fs.readdirSync(path.join(ROOT, 'flashcards')).filter(f => /^survive-/.test(f));
const deckBad = decks.filter(f => { const lines = fs.readFileSync(path.join(ROOT, 'flashcards', f), 'utf8').split('\n').filter(Boolean); return lines.length < 20 || lines.some(l => l.split('\t').length !== 2); });
ok('sixteen flashcard decks, tab-separated, at least twenty cards each', decks.length === 16 && deckBad.length === 0, { decks: decks.length, deckBad });
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok('the decks are listed for offline holding', decks.every(f => idx.includes("'/flashcards/" + f + "'")));

// ---------- 2. the app ----------
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 1194, height: 834 } });
  const p = await ctx.newPage(); p.on('dialog', d => d.accept());
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 240000 });
  await p.waitForTimeout(11000);
  const course = await p.evaluate((MINE) => {
    const c = COURSES.SURVIVE; if (!c) return { missing: true };
    return { name: c.name, active: c.active, state: getCourseState('SURVIVE'), side: isSideTrackCourse('SURVIVE'), project: isProjectCourse('SURVIVE'),
             mine: MINE.filter(id => c.chapters.some(ch => ch.id === id)).length, sims: ['pa_sim', 'oa_sim'].every(id => c.chapters.some(ch => ch.id === id)),
             titled: c.chapters.every(ch => ch.sections.every(s => s.id && (s.title || '').length > 8)) };
  }, MINE);
  ok('the course is registered, active and never locked (a track of her own, like OT/ICS)', !course.missing && course.active === true && course.state === 'active' && course.side && course.project, course);
  ok('with all sixteen chapters and both simulations in the chapter list', course.mine === 16 && course.sims && course.titled, course);
  const load = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    go({ name: 'class', courseId: 'SURVIVE' }); await w(2500);
    const man = await (await fetch('/content-manifest.json')).json();
    const url = '/content-SURVIVE.json?v=' + encodeURIComponent(man.fv.SURVIVE);
    const r = await fetch(url); const pk = await r.json();
    const stayed = !!(typeof view === 'object' && view && view.courseId === 'SURVIVE');
    const inApp = Object.keys(JSON.parse(pk.l)).filter(k => !/_sim\//.test(k)).filter(k => { const [c, ch, sc] = k.split('/'); try { const g = getQuestions(c, ch, sc); return !(g && g.length >= 6); } catch (e) { return true; } });
    const lessonInApp = Object.keys(JSON.parse(pk.l)).filter(k => !/_sim\//.test(k)).filter(k => { try { const v = SAMPLE_LESSON[k]; return !(v && (v.body || v).length > 2000); } catch (e) { return true; } });
    return { status: r.status, stayed, inApp, lessonInApp, title: (document.body.innerText.match(/Survival[^\n]*/) || [''])[0] };
  });
  ok('opening the course stays on the course (no lock redirect) and serves the stamped pack', load.status === 200 && load.stayed, load);
  ok('the app itself can find every lesson and every quiz', load.inApp.length === 0 && load.lessonInApp.length === 0, { q: load.inApp.slice(0, 4), l: load.lessonInApp.slice(0, 4) });
  const lesson = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    go({ name: 'section', courseId: 'SURVIVE', chId: 'nyc', secId: 's2' }); await w(2500);
    const el = document.querySelector('.lesson') || document.querySelector('#app'); const t = el.innerText || '';
    return { chars: t.length, callouts: document.querySelectorAll('.lesson .callout').length, has311: /\b311\b/.test(t), finder: /finder|Know Your Zone|maps\.nyc\.gov/i.test(t),
             figs: document.querySelectorAll('.lesson [data-figure="hand"] svg').length, verified: /VERIFIED/.test(t) };
  });
  ok('the shelter lesson renders with its callouts, the finder and 311', lesson.chars > 2500 && lesson.callouts >= 5 && lesson.has311 && lesson.finder && lesson.verified, lesson);
  const sim = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const oa = getQuestions('SURVIVE', 'oa_sim', 'sim') || [], pa = getQuestions('SURVIVE', 'pa_sim', 'sim') || [];
    go({ name: 'section', courseId: 'SURVIVE', chId: 'oa_sim', secId: 'sim' }); await w(2500);
    const t = (document.querySelector('#app') || document.body).innerText;
    return { oa: oa.length, pa: pa.length, sit: (window.SIM_SIZE && window.SIM_SIZE.SURVIVE) || 50, screen: /question|simulation|start|begin/i.test(t) };
  });
  ok('the app deals a full 50-question sitting for each simulation', sim.oa === sim.sit && sim.pa === sim.sit, sim);
  const deck = await p.evaluate(async () => { const r = await fetch('/flashcards/survive-water.txt'); const t = await r.text(); return { status: r.status, lines: t.split('\n').filter(Boolean).length, offline: (window.__offline && window.__offline.files && window.__offline.files.SURVIVE || []).length }; });
  ok('a flashcard deck downloads and the offline shelf knows all sixteen', deck.status === 200 && deck.lines >= 20 && deck.offline === 16, deck);
  const book = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    go({ name: 'class', courseId: 'SURVIVE' }); await w(1500);
    const btn = document.querySelector('[data-book]'); if (!btn) return { btn: false };
    btn.click(); await w(3000);
    const out = { btn: true, view: view.name, cover: !!document.querySelector('.book-cover'), toc: document.querySelectorAll('#book-toc > ol > li').length,
      chapters: document.querySelectorAll('.book-chapter:not(.book-appendix)').length, sections: document.querySelectorAll('.book-section .lesson').length,
      needs: document.querySelectorAll('#book-appendix [data-book-check]').length, figs: document.querySelectorAll('.book [data-figure="hand"] svg').length };
    const cb = document.querySelector('[data-book-check]'); cb.click(); await w(300);
    out.saved = !!(store.bookChecks && store.bookChecks.SURVIVE && Object.keys(store.bookChecks.SURVIVE).length === 1);
    out.progress = (document.querySelector('[data-book-progress]') || {}).textContent || '';
    document.querySelector('[data-back]').click(); await w(1200); out.back = view.name;
    return out;
  });
  ok('the course reads as a book: cover, contents, sixteen chapters and every lesson in order', book.btn && book.view === 'book' && book.cover && book.toc === 17 && book.chapters === 16 && book.sections === 50, book);
  ok('with the things she needs gathered into a checklist she can tick off, and figures in place', book.needs >= 60 && book.saved && /^1 of \d+ done$/.test(book.progress) && book.figs >= 30 && book.back === 'class', book);
  const today = await p.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); go({ name: 'today' }); await w(2000); return { text: document.body.innerText.length }; });
  ok('the Today page still renders with the new course registered', today.text > 500, today);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  await b.close();
  console.log(`survive: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
