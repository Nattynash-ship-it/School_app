// SECTION: Notes pad
// "Can you also fix the eraser, it's also delayed, I'd like it to be as swift
//  as the main page erase." / "When I try scrolling on the note it's hard to
//  scroll, then the entire screen becomes zoomed in."
//   - the eraser saved the whole page on every movement that touched ink
//     (256ms a movement on a full page at iPad speed); it now saves once, on
//     lift, writing plain JSON at once and compressing it off the main thread
//   - one finger was refused for a moment after writing and a toast said use
//     two - and two fingers zoomed the app, because the notebook never blocked
//     the iPad's pinch-zoom. A finger that travels scrolls; zoom is cancelled.
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8901;
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 400)))); };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  const open = async () => p.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }); await w(2000); window.__notesPanel.open(); await w(1500); });
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 240000 }); await p.waitForTimeout(9000);
  await open();
  const E = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)); const NP = window.__notesPanel; NP.steady(0);
    const svg = document.querySelector('#mn-dock svg'); const s = NP.surface();
    const mk = (t, x, y, id) => new PointerEvent(t, { pointerId: id, pointerType: 'pen', isPrimary: true, clientX: x, clientY: y, pressure: 0.5, bubbles: true, cancelable: true, buttons: t === 'pointerup' ? 0 : 1 });
    for (let st = 0; st < 120; st++) { const x0 = s.x + 30 + (st % 12) * 55, y0 = s.y + 60 + Math.floor(st / 12) * 26; svg.dispatchEvent(mk('pointerdown', x0, y0, 7)); for (let k = 1; k <= 40; k++) svg.dispatchEvent(mk('pointermove', x0 + k * 1.2, y0 + Math.sin(k / 3 + st) * 6, 7)); svg.dispatchEvent(mk('pointerup', x0 + 48, y0, 7)); }
    await w(2500);
    const rk = 'pad_' + String(NP.state().key).replace(/[^a-zA-Z0-9_/-]/g, '_');
    const before = gannoGetStrokes(rk).length;
    document.querySelector('#mn-dock #mn-tools .mn-tool[data-t="erase"]').click(); await w(200);
    let writes = 0; const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v){ if (/^gs[kl]:/.test(k)) writes++; return real.call(this, k, v); };
    const x0 = s.x + 30, y0 = s.y + 60;
    svg.dispatchEvent(mk('pointerdown', x0, y0, 8));
    for (let i = 1; i <= 120; i++) svg.dispatchEvent(mk('pointermove', x0 + i * 5.5, y0 + (i % 20) * 2.2, 8));
    const midWrites = writes;
    svg.dispatchEvent(mk('pointerup', x0 + 660, y0, 8));
    const liftWrites = writes - midWrites;
    Storage.prototype.setItem = real;
    const after = gannoGetStrokes(rk).length;
    const plainAtOnce = (localStorage.getItem('gsk:' + rk) || '').charAt(0) === '{';
    let compressed = false; for (let k = 0; k < 20 && !compressed; k++) { await w(250); compressed = (localStorage.getItem('gsk:' + rk) || '').charAt(0) !== '{'; }
    window.__ek = { rk, after };
    document.querySelector('#mn-dock #mn-tools .mn-tool[data-t="pen"]').click();
    return { before, after, midWrites, liftWrites, plainAtOnce, compressed };
  });
  ok('the eraser saves nothing while it moves (it saved the whole page on every movement)', E.midWrites === 0 && E.after !== E.before, E);
  ok('and saves the page once, on lift', E.liftWrites >= 1 && E.liftWrites <= 3, E);
  ok('the save is plain at once and compressed off the main thread after', E.plainAtOnce && E.compressed, E);
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(8000); await open();
  const back = await p.evaluate(() => { const NP = window.__notesPanel; const rk = 'pad_' + String(NP.state().key).replace(/[^a-zA-Z0-9_/-]/g, '_'); return gannoGetStrokes(rk).length; });
  ok('what the eraser took stays gone after a reload (' + back + ' strokes)', back === E.after, { back, after: E.after });
  const T = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)); const NP = window.__notesPanel; const o = {};
    const svg = document.querySelector('#mn-dock svg'); const s = NP.surface(); const pages = document.getElementById('mn-pages');
    const pen = (t, x, y) => new PointerEvent(t, { pointerId: 9, pointerType: 'pen', isPrimary: true, clientX: x, clientY: y, pressure: 0.5, bubbles: true, cancelable: true, buttons: t === 'pointerup' ? 0 : 1 });
    const touch = (t, x, y, kind) => { const tt = new Touch({ identifier: 1, target: pages, clientX: x, clientY: y }); if (kind) Object.defineProperty(tt, 'touchType', { value: kind }); /* Safari marks a Pencil touch 'stylus'; Chromium has no touchType */ pages.dispatchEvent(new TouchEvent(t, { touches: t === 'touchend' ? [] : [tt], changedTouches: [tt], bubbles: true, cancelable: true })); };
    pages.scrollTop = 200; await w(100);
    // just wrote: a palm settles and drifts a few pixels - the paper must not move
    svg.dispatchEvent(pen('pointerdown', s.x + 60, s.y + 300)); svg.dispatchEvent(pen('pointerup', s.x + 62, s.y + 300));
    const r = pages.getBoundingClientRect(); const t0 = pages.scrollTop;
    touch('touchstart', r.left + 200, r.top + 400); touch('touchmove', r.left + 203, r.top + 392); touch('touchmove', r.left + 205, r.top + 388); touch('touchend', r.left + 205, r.top + 388);
    o.palmMoved = pages.scrollTop - t0;
    // a finger that travels scrolls, straight away
    const t1 = pages.scrollTop;
    touch('touchstart', r.left + 200, r.top + 500); touch('touchmove', r.left + 200, r.top + 470); touch('touchmove', r.left + 200, r.top + 420); touch('touchend', r.left + 200, r.top + 420);
    o.fingerMoved = pages.scrollTop - t1;
    // the Pencil resting on the glass never scrolls
    const t2 = pages.scrollTop;
    touch('touchstart', r.left + 200, r.top + 500, 'stylus'); touch('touchmove', r.left + 200, r.top + 420, 'stylus'); touch('touchend', r.left + 200, r.top + 420, 'stylus');
    o.stylusMoved = pages.scrollTop - t2;
    // pinch-zoom is cancelled while the notebook is open...
    const g1 = new Event('gesturestart', { cancelable: true, bubbles: true }); document.dispatchEvent(g1); o.zoomBlockedOpen = g1.defaultPrevented;
    const d1 = new MouseEvent('dblclick', { cancelable: true, bubbles: true }); pages.dispatchEvent(d1); o.dblBlocked = d1.defaultPrevented;
    // ...and not once it is closed (the control)
    NP.close(); await w(600);
    const g2 = new Event('gesturestart', { cancelable: true, bubbles: true }); document.dispatchEvent(g2); o.zoomBlockedClosed = g2.defaultPrevented;
    return o;
  });
  ok('a resting palm just after writing does not move the paper', T.palmMoved === 0, T);
  ok('a finger that travels scrolls at once - no two-finger rule', T.fingerMoved >= 60, T);
  ok('the Pencil resting on the glass never scrolls', T.stylusMoved === 0, T);
  ok('pinch-zoom and double-tap zoom are cancelled while the notebook is open', T.zoomBlockedOpen && T.dblBlocked, T);
  ok('and zoom is left alone once it is closed (the control)', T.zoomBlockedClosed === false, T);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  await b.close();
  console.log(`padtouch: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
