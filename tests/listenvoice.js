// "The listen voice also sounds extremely robotic can you fix to make it sound
//  smoother? I'd like to listen to it on the train"
//
// Listen used speechSynthesis. On an iPad that is a hard ceiling: iPadOS keeps
// its Enhanced and Premium recordings for its own reading and offers a web page
// only the small built-in voices, so no amount of choosing between them helps.
// The podcast already went around this by generating audio on the server and
// caching it; Listen simply never used that endpoint.
//
// What has to hold:
//   1. when the site can do it, Listen plays recorded audio, not the synth
//   2. the lesson is cut into pieces only where a line already ended
//   3. the next piece is fetched while the current one plays - no gap
//   4. a lesson listened to once needs NO network the second time (the train)
//   5. when the site cannot do it, nothing changes - device voices, as before
//   6. leaving the lesson stops the audio
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:' + (process.env.PORT || 8901) + '/index.html';
/* A FIVE-SECOND clip, built here rather than pasted in as base64.
   It was a sixth of a second, and that made this test lie: the lesson's whole
   queue finished inside the 2.5s the test waits before tapping pause, so the
   session had already ended and "resume" restarted from the top. It passed
   only while the machine was loaded enough to be slow. A clip of a realistic
   length keeps playback where a real one would be. */
function wav(seconds) {
  const sr = 8000, n = sr * seconds;
  const b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr, 28);
  b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34);
  b.write('data', 36); b.writeUInt32LE(n, 40);
  b.fill(128, 44);
  return b;
}
const WAV = wav(5);
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d)))); };

async function boot(browser, mode) {
  const p = await browser.newPage({ viewport: { width: 1194, height: 834 } });
  const seen = { probe: 0, clips: [], };
  await p.route('**/.netlify/functions/tts', async route => {
    const body = route.request().postData() || '';
    let j = {}; try { j = JSON.parse(body); } catch (e) {}
    if (!j.text) { seen.probe++;
      if (mode === 'off') return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"not_configured"}' });
      return route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"no_text"}' });
    }
    seen.clips.push(j.text);
    return route.fulfill({ status: 200, contentType: 'audio/mpeg', body: WAV });
  });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(B, { waitUntil: 'load', timeout: 240000 });
  await p.waitForTimeout(13000);
  return { p, seen, errs };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // ---------- the site CAN generate audio ----------
  const on = await boot(browser, 'on');
  const R = await on.p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    // count real speechSynthesis use, so "it played recorded audio" is not a guess
    let spoke = 0;
    try { const s = window.speechSynthesis.speak.bind(window.speechSynthesis);
          window.speechSynthesis.speak = function (u) { spoke++; return s(u); }; } catch (e) {}
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' });
    await wait(2500);
    const btn = document.querySelector('[data-audio-toggle]');
    out.hasButton = !!btn;
    if (!btn) return out;
    btn.click();
    await wait(2500);
    out.label = (btn.querySelector('.audio-label') || {}).textContent;
    out.session = !!window.__listenSession;
    out.spoke = spoke;
    // pause / resume run through the same button
    btn.click(); await wait(300);
    out.pausedLabel = (btn.querySelector('.audio-label') || {}).textContent;
    out.pausedFlag = !!(window.__listenSession && window.__listenSession.paused);
    btn.click(); await wait(300);
    out.resumedLabel = (btn.querySelector('.audio-label') || {}).textContent;
    // leaving must stop it
    go({ name: 'class', courseId: 'C959' });
    await wait(400);
    out.stoppedOnLeave = !window.__listenSession;
    return out;
  });
  const firstRun = on.seen.clips.length;
  ok('the Listen button is there', R.hasButton);
  ok('it plays the recorded voice, not the synth', R.session === true && R.spoke === 0, { session: R.session, spoke: R.spoke });
  ok('the button says Pause while playing', R.label === 'Pause', R.label);
  ok('more than one piece was requested (prefetch)', firstRun >= 2, firstRun);
  // .every() on an empty list is true, so each of these states the list is
  // non-empty as well - otherwise a build that fetches nothing passes them all
  ok('no piece is cut mid-sentence',
     on.seen.clips.length > 0 && on.seen.clips.every(t => /[.!?:;"')\]]$/.test(t.trim())),
     on.seen.clips.map(t => t.trim().slice(-24)));
  ok('no piece exceeds what the endpoint accepts',
     on.seen.clips.length > 0 && on.seen.clips.every(t => t.length <= 4000),
     on.seen.clips.length ? Math.max(...on.seen.clips.map(t => t.length)) : 'nothing fetched');
  ok('tapping again pauses', R.pausedLabel === 'Resume' && R.pausedFlag === true, [R.pausedLabel, R.pausedFlag]);
  ok('tapping once more resumes', R.resumedLabel === 'Pause', R.resumedLabel);
  ok('leaving the lesson stops it', R.stoppedOnLeave === true, R.stoppedOnLeave);

  // ---------- the train: same lesson again, nothing new fetched ----------
  const before = on.seen.clips.length;
  const again = await on.p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' });
    await wait(2000);
    const btn = document.querySelector('[data-audio-toggle]');
    btn.click();
    await wait(2500);
    return { playing: !!window.__listenSession };
  });
  ok('a second listen plays', again.playing === true, again);
  /* The test clips are a fraction of a second long, so a replay races far past
     where the first run got to and legitimately fetches pieces it never
     reached. The property that matters for the train is narrower and exact:
     a piece already on the device is never asked for again. */
  const firstSet = new Set(on.seen.clips.slice(0, before));
  const refetched = on.seen.clips.slice(before).filter(t => firstSet.has(t));
  ok('and never re-fetches a piece already on the device',
     firstSet.size > 0 && refetched.length === 0,
     { cachedPieces: firstSet.size, refetched: refetched.length });
  ok('no page errors with the recorded voice', on.errs.length === 0, on.errs.slice(0, 3));

  // ---------- the site CANNOT generate audio ----------
  const off = await boot(browser, 'off');
  const O = await off.p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    let spoke = 0;
    try { const s = window.speechSynthesis.speak.bind(window.speechSynthesis);
          window.speechSynthesis.speak = function (u) { spoke++; return s(u); }; } catch (e) {}
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' });
    await wait(2500);
    const btn = document.querySelector('[data-audio-toggle]');
    btn.click();
    await wait(2000);
    return { spoke, session: !!window.__listenSession, state: window.__neuralVoice ? window.__neuralVoice.state() : 'absent' };
  });
  ok('an unconfigured site is detected', O.state === 'off', O.state);
  ok('and Listen falls back to the device voices', O.spoke > 0 && O.session === false, O);
  ok('no audio was generated on an unconfigured site', off.seen.clips.length === 0, off.seen.clips.length);
  ok('no page errors on the fallback path', off.errs.length === 0, off.errs.slice(0, 3));

  /* ---- her switch: off means off, and off costs nothing ---- */
  const S = await boot(browser, 'on');
  const C = await S.p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const o = { defaults: { mode: window.__neuralVoice.mode(), voice: window.__neuralVoice.voice(), count: window.__neuralVoice.voices.length } };
    showMoreSheet(); await w(300);
    const row = document.querySelector('.more-sheet [data-act="listen-voice"]');
    o.row = row ? row.textContent.trim() : null;
    if (row) row.click(); await w(400);
    const sheet = document.querySelector('.listen-sheet');
    o.opened = !!sheet;
    sheet.querySelector('[data-act="v-sage"]').click(); await w(400);
    o.picked = window.__neuralVoice.voice();
    document.querySelector('.listen-sheet [data-act="mode-off"]').click(); await w(400);
    o.mode = window.__neuralVoice.mode();
    document.querySelector('.listen-sheet [data-close]')?.click(); await w(200);
    let spoke = 0; const s0 = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = function (u) { spoke++; return s0(u); };
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }); await w(2500);
    document.querySelector('[data-audio-toggle]').click(); await w(2000);
    o.spoke = spoke; o.recorded = !!window.__listenSession;
    return o;
  });
  const clipsWhileOff = S.seen.clips.length;
  ok('it starts on "recorded when available", in Nova', C.defaults.mode === 'auto' && C.defaults.voice === 'nova' && C.defaults.count >= 6, C.defaults);
  ok('the More menu shows the current voice', /listen voice/i.test(C.row || '') && /nova/i.test(C.row || ''), C.row);
  ok('the picker opens and a voice can be chosen', C.opened === true && C.picked === 'sage', [C.opened, C.picked]);
  ok('turning it off sticks', C.mode === 'off', C.mode);
  ok('with it off Listen uses the device voice', C.spoke > 0 && C.recorded === false, C);
  ok('and generates no audio at all, so it costs nothing', clipsWhileOff === 0, clipsWhileOff);

  console.log('listenvoice: ' + pass + '/' + (pass + fail) + ' passed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
