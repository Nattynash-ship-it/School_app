// "Reset everything - also notes & pen marks" - and then the notes came back.
//
// The scores half of a class reset has had an erase record since 18.589. The
// notes half had none: this device cleared her typed notes, highlights,
// bookmarks and drafts, and the other device merged them straight back on the
// next pull. And the notebook pad's own handwriting was never cleared at all:
// the reset matched page keys by splitting on "_", which finds the pen layer's
// "section_C959_ch1_s1" and never the pad's "pad_C959/ch4/s1".
//
// What has to hold, through the REAL button:
//   1. "Reset everything" clears typed notes, highlights, bookmarks, drafts AND
//      the notebook's handwriting for that class, and only that class
//   2. it is recorded, so a newer copy from the other device that still
//      carries them cannot put them back - but a note written AFTER it can
//   3. the other device, learning of it, clears its own copy
//   4. "Reset scores & tests only" still leaves every note alone
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
    const out = {}, past = Date.now() - 86400000;
    const CID = 'C959', K = 'C959/ch4/s1', PK = 'pad_C959/ch4/s1', OK = 'D684/g1/x3_1';
    const seedNotes = () => {
      store.notes = { [K]: [{ id: 'n1', text: 'De Morgan', createdAt: past }], [OK]: [{ id: 'n9', text: 'DNS', createdAt: past }] };
      store.textHL = { [K]: [{ id: 'h1', text: 'x', pre: '', post: '', color: 'y', ts: past }], [OK]: [{ id: 'h9', text: 'y', pre: '', post: '', color: 'y', ts: past }] };
      store.bookmarks = { [K]: true, [OK]: true };
      store.noteDrafts = { [K]: 'half a thought', [OK]: 'other' };
    };
    const mine = () => ({
      notes: (store.notes[K] || []).length, hl: (store.textHL[K] || []).length,
      bm: store.bookmarks[K] ? 1 : 0, draft: store.noteDrafts[K] ? 1 : 0,
      pad: (store.padNotes || {})[K] ? 1 : 0, ink: (function(){ try { return window.__notesPanel.ink(K).strokes; } catch (e) { return -1; } })()
    });
    const theirs = () => ({ notes: (store.notes[OK] || []).length, hl: (store.textHL[OK] || []).length, bm: store.bookmarks[OK] ? 1 : 0, draft: store.noteDrafts[OK] ? 1 : 0 });

    seedNotes();
    // real handwriting in the notebook pad, through the pad
    go({ name: 'section', courseId: CID, chId: 'ch4', secId: 's1' }); await wait(2200);
    window.__notesPanel.open(); await wait(1400); window.__notesPanel.tab('write'); await wait(300);
    const svg = document.getElementById('mn-ink'); const r = svg.getBoundingClientRect(), k = r.width / 1000;
    const fire = (t, x, y) => svg.dispatchEvent(new PointerEvent(t, { pointerId: 7, pointerType: 'pen', isPrimary: true, clientX: r.left + x * k, clientY: r.top + y * k, pressure: .5, bubbles: true, cancelable: true }));
    for (let s = 0; s < 3; s++) { fire('pointerdown', 100, 150 + s * 60); for (let i = 1; i <= 8; i++) fire('pointermove', 100 + i * 70, 150 + s * 60); fire('pointerup', 660, 150 + s * 60); await wait(70); }
    await wait(800); window.__notesPanel.close(); await wait(800);
    saveStore(); if (saveStore.flushNow) saveStore.flushNow(); await wait(300);
    out.before = mine();
    const phoneInk = JSON.parse(JSON.stringify(gannoGetStrokes(PK) || []));
    const phone = JSON.parse(JSON.stringify({ notes: store.notes, textHL: store.textHL, bookmarks: store.bookmarks, noteDrafts: store.noteDrafts, padNotes: store.padNotes }));

    /* ---- 4 first: scores-only leaves every note alone ---- */
    go({ name: 'class', courseId: CID }); await wait(900);
    document.querySelector('[data-classreset="' + CID + '"]').click(); await wait(300);
    document.querySelector('#class-reset-dlg [data-cr-go="tests"]').click(); await wait(900);
    out.afterScoresOnly = mine();

    /* ---- 1. Reset everything, through the button ---- */
    document.querySelector('[data-classreset="' + CID + '"]').click(); await wait(300);
    document.querySelector('#class-reset-dlg [data-cr-go="all"]').click(); await wait(1200);
    out.afterAll = mine();
    out.theirsAfterAll = theirs();
    out.mark = (function(){ try { return (window.__erase.read().courseNotes || {})[CID] || 0; } catch (e) { return 0; } })();

    /* ---- 2. the phone's newer copy still carries them, plus one NEW note ---- */
    const phoneLater = JSON.parse(JSON.stringify(phone));
    phoneLater.notes[K] = phoneLater.notes[K].concat([{ id: 'n_new', text: 'written after', createdAt: Date.now() + 5000 }]);
    const snap = { v: 1, at: Date.now() + 2000, store: phoneLater, ink: {} }; snap.ink[PK] = phoneInk;
    window.__sync._apply(snap); await wait(600);
    const m2 = mine();
    out.afterSync = m2;
    out.newNoteKept = (store.notes[K] || []).filter(n => n.id === 'n_new').length;
    out.oldNoteBack = (store.notes[K] || []).filter(n => n.id === 'n1').length;
    out.theirsAfterSync = theirs();

    /* ---- 3. the other device learns of it ---- */
    seedNotes(); saveStore(); await wait(100);
    const rec = window.__erase.read();
    window.__erase.absorb({ all: rec.all || 0, scores: rec.scores || 0, ink: rec.ink || 0, pages: {}, courses: {}, courseNotes: { [CID]: Date.now() + 1000 } });
    await wait(300);
    out.phoneAfterAbsorb = mine();
    out.phoneOtherAfterAbsorb = theirs();
    return out;
  });

  ok('she had notes, highlights, a bookmark, a draft and handwriting', R.before.notes === 1 && R.before.hl === 1 && R.before.bm === 1 && R.before.draft === 1 && R.before.ink === 3, R.before);
  ok('"scores & tests only" leaves every one of them alone', R.afterScoresOnly.notes === 1 && R.afterScoresOnly.hl === 1 && R.afterScoresOnly.bm === 1 && R.afterScoresOnly.draft === 1 && R.afterScoresOnly.ink === 3, R.afterScoresOnly);
  ok('"reset everything" clears notes, highlights, bookmark and draft', R.afterAll.notes === 0 && R.afterAll.hl === 0 && R.afterAll.bm === 0 && R.afterAll.draft === 0, R.afterAll);
  ok('and the notebook\'s own handwriting - the pad_ key the old match never found', R.afterAll.ink === 0 && R.afterAll.pad === 0, R.afterAll);
  ok('the other class keeps all of its', R.theirsAfterAll.notes === 1 && R.theirsAfterAll.hl === 1 && R.theirsAfterAll.bm === 1 && R.theirsAfterAll.draft === 1, R.theirsAfterAll);
  ok('the notes erase is recorded', R.mark > 0, R.mark);
  ok('a NEWER copy from the other device does not bring them back', R.afterSync.notes === 1 && R.oldNoteBack === 0 && R.afterSync.hl === 0 && R.afterSync.bm === 0 && R.afterSync.draft === 0 && R.afterSync.ink === 0, [R.afterSync, R.oldNoteBack]);
  ok('but a note written AFTER the erase arrives', R.newNoteKept === 1, R.newNoteKept);
  ok('and that sync left the other class alone', R.theirsAfterSync.notes === 1 && R.theirsAfterSync.hl === 1, R.theirsAfterSync);
  ok('the other device, learning of it, clears its own copy', R.phoneAfterAbsorb.notes === 0 && R.phoneAfterAbsorb.hl === 0 && R.phoneAfterAbsorb.bm === 0 && R.phoneAfterAbsorb.draft === 0, R.phoneAfterAbsorb);
  ok('and keeps the other class', R.phoneOtherAfterAbsorb.notes === 1 && R.phoneOtherAfterAbsorb.bm === 1, R.phoneOtherAfterAbsorb);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));

  console.log('resetnotes: ' + pass + '/' + (pass + fail) + ' passed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
