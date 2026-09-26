// SECTION: Notes pad
// "The pencil in the notes is delayed when writing."
// Profiled on a full notebook at a quarter of desktop speed: the pen's own work
// was 0.1ms a point, but two stalls of 50-65ms landed mid-sentence. Three things
// shared the main thread with the pen and none of them waited for it:
//   - the backup, which re-reads every page of ink into IndexedDB in one block
//   - the once-a-second upkeep, which paused for the LESSON pen only
//   - the sound unlock, which built an audio graph on every pen-down
// Each now steps aside while a pen is busy; the backup still runs, at the next
// pause, and never waits more than 30 seconds.
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8901;
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 400)))); };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await (await b.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 240000 }); await p.waitForTimeout(9000);
  const R = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)); const o = {};
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }); await w(2000); window.__notesPanel.open(); await w(1500);
    const svg = document.querySelector('#mn-dock svg'); const s = window.__notesPanel.surface();
    const mk = (t, x, y) => new PointerEvent(t, { pointerId: 7, pointerType: 'pen', isPrimary: true, clientX: x, clientY: y, pressure: 0.5, bubbles: true, cancelable: true, buttons: t === 'pointerup' ? 0 : 1 });
    const stroke = async (x0, y0) => { svg.dispatchEvent(mk('pointerdown', x0, y0)); for (let i = 1; i <= 25; i++) { await w(8); svg.dispatchEvent(mk('pointermove', x0 + i * 2, y0 + Math.sin(i / 4) * 6)); } svg.dispatchEvent(mk('pointerup', x0 + 50, y0)); };
    o.idleBefore = window.__pulseState().drawing;
    svg.dispatchEvent(mk('pointerdown', s.x + 60, s.y + 200));
    o.downBusy = window.__pulseState().drawing;
    svg.dispatchEvent(mk('pointerup', s.x + 61, s.y + 200));
    o.justLifted = window.__pulseState().drawing;
    await w(1800); o.rested = window.__pulseState().drawing;
    // a save in the middle of writing: the backup waits for the pause
    const before = window.__fortress.mirroredAt, def0 = window.__fortress.mirrorDeferred || 0;
    saveStore();
    for (let k = 0; k < 14; k++) { await stroke(s.x + 60 + (k % 5) * 90, s.y + 260 + Math.floor(k / 5) * 40); await w(120); }
    o.mirroredWhileWriting = window.__fortress.mirroredAt !== before;
    o.deferred = (window.__fortress.mirrorDeferred || 0) - def0;
    for (let k = 0; k < 20 && window.__fortress.mirroredAt === before; k++) await w(500);
    o.mirroredAfterPause = window.__fortress.mirroredAt !== before;
    // the sound unlock leaves the pen alone once sound is running...
    let made = 0; const real = window.__sharedAudioCtx;
    window.__sharedAudioCtx = { state: 'running', currentTime: 0, destination: {}, resume: () => Promise.resolve(), createOscillator: () => { made++; return { connect(){}, start(){}, stop(){} }; }, createGain: () => ({ gain: {}, connect(){} }) };
    svg.dispatchEvent(mk('pointerdown', s.x + 60, s.y + 500)); svg.dispatchEvent(mk('pointerup', s.x + 61, s.y + 500));
    o.oscWhenRunning = made;
    // ...and still unlocks after iOS suspends it (the control)
    window.__sharedAudioCtx.state = 'suspended';
    svg.dispatchEvent(mk('pointerdown', s.x + 60, s.y + 540)); svg.dispatchEvent(mk('pointerup', s.x + 61, s.y + 540));
    o.oscWhenSuspended = made;
    window.__sharedAudioCtx = real;
    window.__notesPanel.clear && window.__notesPanel.clear();
    return o;
  });
  ok('the upkeep scheduler sees the notebook pen: busy when down and just after, quiet once it rests', !R.idleBefore && R.downBusy && R.justLifted && !R.rested, R);
  ok('a save made mid-writing does not back up the notebook while she writes', !R.mirroredWhileWriting && R.deferred >= 1, R);
  ok('and the backup still runs at the next pause', R.mirroredAfterPause, R);
  ok('the sound unlock leaves the pen alone once sound is running', R.oscWhenRunning === 0, R);
  ok('and still unlocks sound after iOS suspends it (the control)', R.oscWhenSuspended === 1, R);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  await b.close();
  console.log(`penidle: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
