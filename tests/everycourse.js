// "do a run on everything, make sure everything is in place" - every course the
// app knows, walked live, each activated for its visit (the app allows twelve
// active at once, and a locked class opens an "activate first" modal instead
// of its page - so a walk that does not activate measures the modal).
//
//   - the class page renders every chapter it has AFTER the page has run its
//     own chapter setup (some chapters are added on first render)
//   - the study units sit at the top, the rest inside the folds
//   - every section has a lesson; every STUDY section has questions (guides,
//     worked examples, concept notes and generated drills have none by design)
//   - the first study section renders as a real page and the pad opens on it
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
  await p.waitForTimeout(14000);

  const R = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const rows = []; let secTotal = 0, studyTotal = 0; const noLesson = [], noQ = [], couldNotActivate = [];
    const ids = Object.keys(COURSES).filter(k => k !== 'PORTFOLIO');
    const originallyActive = new Set(store.activeOrder || []);
    const lent = [];                                   // courses this walk activated
    const limit = (typeof V2_ACTIVE_LIMIT !== 'undefined') ? V2_ACTIVE_LIMIT : 12;
    for (const cid of ids) {
      let activated = false;
      if (getCourseState(cid) !== 'active') {
        if (activeCourseCount() >= limit && lent.length) { const drop = lent.shift(); setCourseState(drop, 'locked'); }
        activated = setCourseState(cid, 'active') === true;
        if (activated) lent.push(cid); else couldNotActivate.push(cid);
      }
      go({ name: 'class', courseId: cid }); await wait(700);
      const c = COURSES[cid]; const chapters = c.chapters || [];     // read AFTER the page's own setup
      const cards = document.querySelectorAll('.chapter-item[data-chapter]').length;
      const units = chapters.filter(ch => isLearningChapter(ch));
      const top = [...document.querySelectorAll('.chapter-item[data-chapter]')].filter(el => !el.closest('details.cls-group')).length;
      const readiness = !!document.querySelector('.readiness');
      const modal = !!document.querySelector('.v2-modal-bg, .modal-bg');
      let missL = 0, missQ = 0;
      for (const ch of chapters) for (const s of (ch.sections || [])) {
        secTotal++;
        let L = null, Q = null;
        try { L = getLesson(cid, ch.id, s.id); } catch (e) {}
        const hasL = !!(L && typeof L.body === 'string' && L.body.replace(/<[^>]+>/g, '').trim().length > 40);
        if (!hasL) { missL++; if (noLesson.length < 12) noLesson.push(cid + '/' + ch.id + '/' + s.id); }
        if (isLearningChapter(ch) && ch.id !== 'worked') {
          studyTotal++;
          try { Q = getQuestions(cid, ch.id, s.id); } catch (e) {}
          if (!(Q && Q.length)) { missQ++; if (noQ.length < 12) noQ.push(cid + '/' + ch.id + '/' + s.id); }
        }
      }
      let page = null;
      const u0 = units[0] && (units[0].sections || [])[0];
      if (u0) {
        go({ name: 'section', courseId: cid, chId: units[0].id, secId: u0.id }); await wait(900);
        const lesson = document.querySelector('.lesson');
        let padKey = null;
        try { window.__notesPanel.open(); await wait(400); padKey = window.__notesPanel.state().key; window.__notesPanel.close(); await wait(200); } catch (e) {}
        page = { text: lesson ? lesson.textContent.replace(/\s+/g, ' ').trim().length : 0, pad: padKey === cid + '/' + units[0].id + '/' + u0.id };
      }
      rows.push({ cid, chapters: chapters.length, cards, units: units.length, top, readiness, modal, missL, missQ, page });
    }
    // give back what the walk borrowed
    lent.forEach(cid => { if (!originallyActive.has(cid)) setCourseState(cid, 'locked'); });
    return { rows, secTotal, studyTotal, noLesson, noQ, couldNotActivate, limit };
  });

  const rows = R.rows;
  ok('every course the app knows was walked, each activated for its visit', rows.length >= 40 && R.couldNotActivate.length === 0, [rows.length, R.couldNotActivate]);
  const modal = rows.filter(r => r.modal);
  ok('no class opened the "activate first" modal instead of its page', modal.length === 0, modal.map(r => r.cid));
  const badCards = rows.filter(r => r.cards !== r.chapters);
  ok('every class page lists every one of its chapters', badCards.length === 0, badCards.map(r => [r.cid, r.cards, r.chapters]));
  const badTop = rows.filter(r => r.top !== r.units);
  ok('study units sit at the top of every class, exactly as many as the class has', badTop.length === 0, badTop.map(r => [r.cid, r.top, r.units]));
  const noRead = rows.filter(r => !r.readiness);
  ok('every class page shows its readiness', noRead.length === 0, noRead.map(r => r.cid));
  ok('every section of every course has a lesson', rows.every(r => r.missL === 0), { total: R.secTotal, missing: rows.reduce((a, r) => a + r.missL, 0), first: R.noLesson });
  ok('every STUDY section of every course has questions', rows.every(r => r.missQ === 0), { study: R.studyTotal, missing: rows.reduce((a, r) => a + r.missQ, 0), first: R.noQ });
  const thin = rows.filter(r => !r.page || r.page.text < 200);
  ok('the first study section of every course renders as a real page', thin.length === 0, thin.map(r => [r.cid, r.page && r.page.text]));
  const noPad = rows.filter(r => r.page && !r.page.pad);
  ok('and the notes pad opens on it, keyed to that section', noPad.length === 0, noPad.map(r => r.cid));
  ok('no page errors across the whole walk', errs.length === 0, errs.slice(0, 4));
  console.log('walked ' + rows.length + ' courses, ' + R.secTotal + ' sections (' + R.studyTotal + ' study), active limit ' + R.limit);
  console.log('everycourse: ' + pass + '/' + (pass + fail) + ' passed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
