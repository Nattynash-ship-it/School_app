// "I'd like a particular notebook to be accessible anywhere" - 18.593 made a
// class notebook READABLE anywhere and left writing where it had always been:
// the pad opened only on a lesson page, because that is the only route that
// answers "which page am I writing on".
//
// Now a page can be PINNED - by "Write here" in a class notebook, or simply by
// being the last lesson she wrote in - and off a lesson the pad opens on that
// page and says which one it is.
//
// What has to hold:
//   1. no pin, off a lesson: the pad stays away (nowhere to put the ink)
//   2. "Write here" pins a section and opens the pad on it, in place
//   3. ink written from a non-lesson screen lands on THAT page, and is there
//      when the lesson is opened
//   4. on a lesson, the lesson's own page still wins over the pin
//   5. writing in a lesson pins it, so the pad follows her when she leaves
//   6. side-by-side mode is a lesson thing and stays off elsewhere
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
    const out = {};
    const K1 = 'C959/ch4/s1', K2 = 'C959/ch4/s2';
    const fabShown = () => { const f = document.getElementById('mn-fab'); return !!f && f.style.display !== 'none'; };
    const draw = async (n) => {
      const svg = document.getElementById('mn-ink');
      if (!svg) return false;          // no pad on this build: report, do not throw
      const r = svg.getBoundingClientRect(), k = r.width / 1000;
      const fire = (t, x, y) => svg.dispatchEvent(new PointerEvent(t, { pointerId: 7, pointerType: 'pen', isPrimary: true,
        clientX: r.left + x * k, clientY: r.top + y * k, pressure: .5, bubbles: true, cancelable: true }));
      for (let s = 0; s < n; s++) {
        fire('pointerdown', 100, 150 + s * 60);
        for (let i = 1; i <= 8; i++) fire('pointermove', 100 + i * 70, 150 + s * 60);
        fire('pointerup', 660, 150 + s * 60);
        await wait(70);
      }
      await wait(700);
      return true;
    };
    const inkAt = k => { try { return window.__notesPanel.ink(k).strokes; } catch (e) { return -1; } };
    // absent on a build without this feature: report, do not throw, so the
    // control says what is missing instead of dying on the first line
    const pinned = () => { try { return window.__notesPanel.pinned(); } catch (e) { return null; } };
    const pin = k => { try { return window.__notesPanel.pin(k); } catch (e) { return null; } };

    /* ---- 1. nothing pinned, off a lesson ---- */
    try { delete store.padPrefs.pinned; } catch (e) {}
    go({ name: 'review' }); await wait(900);
    out.noPin = { fab: fabShown(), pinned: pinned() };

    /* ---- 2. "Write here" from the class notebook ---- */
    store.notes = store.notes || {};
    store.notes[K2] = [{ id: 'n1', text: 'Absorption', createdAt: Date.now() }];
    go({ name: 'classnotes', courseId: 'C959' }); await wait(900);
    const wb = document.querySelector('.cn-section[data-key="' + K2 + '"] [data-write-here]');
    out.writeBtn = !!wb;
    if (wb) wb.click();
    await wait(1600);
    out.afterWriteHere = { pinned: pinned(), open: window.__notesPanel.state().open,
                           key: window.__notesPanel.state().key, route: view.name,
                           side: window.__notesPanel.state().side };

    /* ---- 3. ink written from here lands on that page ---- */
    window.__notesPanel.tab('write'); await wait(400);
    await draw(3);
    out.wroteAway = inkAt(K2);
    // and it is there when the lesson itself is opened
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's2' }); await wait(2200);
    window.__notesPanel.open(); await wait(1200);
    out.inLesson = { key: window.__notesPanel.state().key, strokes: inkAt(K2) };

    /* ---- 4. on a lesson, the lesson wins over the pin ---- */
    pin(K2);
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }); await wait(2200);
    out.lessonWins = { key: window.__notesPanel.state().key, pinned: pinned() };

    /* ---- 5. writing in a lesson pins it ---- */
    window.__notesPanel.open(); await wait(1200);
    window.__notesPanel.tab('write'); await wait(300);
    await draw(2);
    out.autoPin = pinned();
    // leave the lesson: the pad follows, on the page she just wrote
    go({ name: 'home' }); await wait(900);
    out.followed = { fab: fabShown(), key: (function(){ try { window.__notesPanel.open(); } catch (e) {} return window.__notesPanel.state().key; })() };
    await wait(800);
    out.followedOpen = window.__notesPanel.state().open;
    out.followedSide = window.__notesPanel.state().side;
    out.inkK1 = inkAt(K1);
    return out;
  });

  ok('nothing pinned, off a lesson: the pad stays away', R.noPin.fab === false && !R.noPin.pinned, R.noPin);
  ok('a class notebook offers "Write here"', R.writeBtn === true);
  ok('it pins that section and opens the pad, without leaving the screen',
     R.afterWriteHere.pinned === 'C959/ch4/s2' && R.afterWriteHere.open === true &&
     R.afterWriteHere.key === 'C959/ch4/s2' && R.afterWriteHere.route === 'classnotes', R.afterWriteHere);
  ok('side-by-side stays off where there is no lesson to move', R.afterWriteHere.side === false, R.afterWriteHere.side);
  ok('ink written from there lands on that page', R.wroteAway === 3, R.wroteAway);
  ok('and is there when the lesson itself is opened', R.inLesson.key === 'C959/ch4/s2' && R.inLesson.strokes === 3, R.inLesson);
  ok('on a lesson, the lesson\'s own page wins over the pin', R.lessonWins.key === 'C959/ch4/s1' && R.lessonWins.pinned === 'C959/ch4/s2', R.lessonWins);
  ok('writing in a lesson pins it', R.autoPin === 'C959/ch4/s1', R.autoPin);
  ok('and the pad follows her off the lesson, on that page', R.followed.fab === true && R.followed.key === 'C959/ch4/s1' && R.followedOpen === true, [R.followed, R.followedOpen]);
  ok('still docked, not side-by-side, away from a lesson', R.followedSide === false, R.followedSide);
  ok('both pages kept their own ink, nothing merged', R.inkK1 === 2 && R.inLesson.strokes === 3, [R.inkK1, R.inLesson.strokes]);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));

  console.log('writeanywhere: ' + pass + '/' + (pass + fail) + ' passed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
