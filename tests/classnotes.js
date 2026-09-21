// SECTION: Notes pad
// "I would also like the notes to be accessible somewhere on the home page like
//  all collectively in notebooks. Although it's created in the lessons I'd like
//  a particular notebook to be accessible anywhere"
//
// Lesson notes - typed and handwritten - lived only inside the lesson they were
// written in: the notes panel refuses to open on any other route, and the
// Notebooks screen that already existed had no way in at all (nothing in the
// app navigated to it). So:
//   1. every class with notes is a notebook on the Notebooks screen
//   2. a class notebook shows every note and every handwritten page, grouped
//      by chapter and section, and can jump back into the lesson to keep writing
//   3. Notebooks is reachable from the home page and from the nav bar on every
//      ordinary screen - a particular notebook is two taps from anywhere
//   4. her own free notebooks are still there, untouched
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:' + (process.env.PORT || 8901) + '/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d)))); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await browser.newPage({ viewport: { width: 1194, height: 834 } });
  p.on('dialog', d => d.accept('Train notes'));
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(B, { waitUntil: 'load', timeout: 240000 });
  await p.waitForTimeout(13000);

  const R = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    const CID = 'C959', K1 = 'C959/ch4/s1', K2 = 'C959/ch4/s2', KO = 'D684/g1/x3_1';

    /* ---- write notes the way the lessons do: typed notes in two sections,
            and real ink on one page of one of them ---- */
    store.notes = store.notes || {};
    store.notes[K1] = [{ id: 'n1', text: 'De Morgan: negate both, flip the operator', createdAt: Date.now() - 86400000 }];
    store.notes[K2] = [{ id: 'n2', text: 'Absorption: A + AB = A', createdAt: Date.now() - 3600000 },
                       { id: 'n3', text: 'Second thought on absorption', createdAt: Date.now() - 1800000 }];
    store.notes[KO] = [{ id: 'n4', text: 'DNS maps names to addresses', createdAt: Date.now() - 7200000 }];
    go({ name: 'section', courseId: CID, chId: 'ch4', secId: 's1' }); await wait(2200);
    window.__notesPanel.open(); await wait(1400);
    window.__notesPanel.tab('write'); await wait(400);
    const svg = document.getElementById('mn-ink');
    const r = svg.getBoundingClientRect(), k = r.width / 1000;
    const fire = (t, x, y) => svg.dispatchEvent(new PointerEvent(t, { pointerId: 7, pointerType: 'pen', isPrimary: true,
      clientX: r.left + x * k, clientY: r.top + y * k, pressure: .5, bubbles: true, cancelable: true }));
    for (let s = 0; s < 3; s++) {
      fire('pointerdown', 100, 150 + s * 60);
      for (let i = 1; i <= 10; i++) fire('pointermove', 100 + i * 60, 150 + s * 60 + (i % 2) * 4);
      fire('pointerup', 700, 150 + s * 60);
      await wait(80);
    }
    await wait(900);
    window.__notesPanel.close(); await wait(800);
    saveStore(); if (saveStore.flushNow) saveStore.flushNow(); await wait(300);
    out.inkWritten = window.__notesPanel.ink(K1);

    /* ---- 3. reachable from the home page and from the nav bar ---- */
    go({ name: 'home' }); await wait(800);
    const homeBtn = document.querySelector('[data-notebooks]');
    out.homeButton = homeBtn ? homeBtn.textContent.trim() : null;
    const navBtn = document.querySelector('.brand-bar [data-go="notebooks"]');
    out.navButton = !!navBtn;
    if (homeBtn) homeBtn.click(); await wait(700);
    out.routeAfterHome = view.name;

    /* ---- 1. every class with notes is a notebook here ---- */
    const covers = [...document.querySelectorAll('[data-class-nb]')].map(el => ({
      cid: el.getAttribute('data-class-nb'), text: el.textContent.replace(/\s+/g, ' ').trim() }));
    out.covers = covers;
    out.freeNew = !!document.querySelector('[data-nb-new]');

    /* ---- 2. the class notebook: notes and pages, grouped, with a way back ---- */
    const mine = document.querySelector('[data-class-nb="' + CID + '"]');
    if (mine) mine.click(); await wait(900);
    out.routeAfterCover = view.name + ':' + (view.courseId || '');
    const secs = [...document.querySelectorAll('.cn-section')].map(el => ({
      key: el.getAttribute('data-key'), notes: el.querySelectorAll('.cn-note').length,
      pages: el.querySelectorAll('.cn-page img').length, title: (el.querySelector('.cn-sec-title') || {}).textContent }));
    out.sections = secs;
    out.chapterHeads = document.querySelectorAll('.cn-chapter').length;
    const img = document.querySelector('.cn-section[data-key="' + K1 + '"] .cn-page img');
    out.pageImg = img ? { src: (img.getAttribute('src') || '').slice(0, 22), w: img.naturalWidth, h: img.naturalHeight } : null;
    out.noteTexts = [...document.querySelectorAll('.cn-note')].map(n => n.textContent.trim().slice(0, 30));
    out.otherClassLeaked = [...document.querySelectorAll('.cn-section')].some(el => (el.getAttribute('data-key') || '').indexOf('D684') === 0);

    // open in the lesson: lands on the section with the pad open on the same key
    const openBtn = document.querySelector('.cn-section[data-key="' + K2 + '"] [data-open-lesson]');
    if (openBtn) openBtn.click(); await wait(2200);
    out.afterOpen = { route: view.name, cid: view.courseId, ch: view.chId, sec: view.secId,
                      padOpen: window.__notesPanel.state().open, padKey: window.__notesPanel.state().key };

    /* ---- from a screen that is not a lesson at all ---- */
    go({ name: 'review' }); await wait(600);
    const navFromReview = document.querySelector('.brand-bar [data-go="notebooks"]');
    out.navFromReview = !!navFromReview;
    if (navFromReview) navFromReview.click(); await wait(700);
    out.routeFromReview = view.name;

    /* ---- 4. her free notebooks still work ---- */
    const newBtn = document.querySelector('[data-nb-new]');
    if (newBtn) newBtn.click(); await wait(700);
    out.freeRoute = view.name;
    out.freeCount = (store.notebooks || []).length;
    go({ name: 'notebooks' }); await wait(600);
    out.freeCoverShown = !!document.querySelector('[data-nb-open]');
    out.classCoversStill = document.querySelectorAll('[data-class-nb]').length;
    return out;
  });

  ok('ink was written in the lesson first', R.inkWritten && R.inkWritten.strokes === 3 && R.inkWritten.pages >= 1, R.inkWritten);
  ok('the home page has a Notebooks button', /notebook/i.test(R.homeButton || ''), R.homeButton);
  ok('the nav bar has a Notebooks button', R.navButton === true);
  ok('tapping it opens Notebooks', R.routeAfterHome === 'notebooks', R.routeAfterHome);
  ok('every class with notes is a notebook there - and only those',
     R.covers.map(c => c.cid).sort().join(',') === 'C959,D684', R.covers);
  ok('a class cover says what is inside',
     R.covers.every(c => /\d+ note/.test(c.text)) && R.covers.some(c => c.cid === 'C959' && /1 page/.test(c.text)), R.covers.map(c => c.text));
  ok('her own New Notebook is still offered', R.freeNew === true);
  ok('a class cover opens that class notebook', R.routeAfterCover === 'classnotes:C959', R.routeAfterCover);
  ok('it lists both sections with notes, under their chapter',
     R.sections.length === 2 && R.chapterHeads >= 1 && R.sections.map(s => s.key).sort().join(',') === 'C959/ch4/s1,C959/ch4/s2', R.sections);
  ok('typed notes are all there, in order', R.noteTexts.length === 3 && /De Morgan/.test(R.noteTexts[0]) && /Absorption/.test(R.noteTexts[1]), R.noteTexts);
  ok('the handwritten page is rendered as a picture', R.pageImg && /^data:image\/png/.test(R.pageImg.src) && R.pageImg.w > 200 && R.pageImg.h > R.pageImg.w, R.pageImg);
  // both of these are true of an EMPTY list, so each says the list is non-empty
  // too - otherwise a build with no notebook at all passes them
  ok('sections carry a real title, not a key', R.sections.length > 0 && R.sections.every(s => s.title && !/\//.test(s.title)), R.sections.map(s => s.title));
  ok('the other class does not leak into this notebook', R.sections.length > 0 && R.otherClassLeaked === false, [R.sections.length, R.otherClassLeaked]);
  ok('"open in lesson" lands on that section with the pad open on it',
     R.afterOpen.route === 'section' && R.afterOpen.sec === 's2' && R.afterOpen.padOpen === true && R.afterOpen.padKey === 'C959/ch4/s2', R.afterOpen);
  ok('Notebooks is reachable from Review too', R.navFromReview === true && R.routeFromReview === 'notebooks', [R.navFromReview, R.routeFromReview]);
  ok('a free notebook can still be made and opened', R.freeRoute === 'notebook' && R.freeCount === 1, [R.freeRoute, R.freeCount]);
  ok('free and class notebooks live side by side', R.freeCoverShown === true && R.classCoversStill === 2, [R.freeCoverShown, R.classCoversStill]);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));

  console.log('classnotes: ' + pass + '/' + (pass + fail) + ' passed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
