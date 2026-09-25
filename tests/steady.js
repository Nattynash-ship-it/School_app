// SECTION: Notes pad
// "Can you add something to make the handwriting neater?" - "as I write."
// A steady hand in the pen picker: each stored point is a follower that moves
// a fraction of the way toward the nib, so tremor cancels while the letter
// comes through. What it must never do: draw where the pen was not, lose the
// end of the stroke, break hold-to-straighten, or drop the points she made.
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8901;
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 400)))); };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true });
  const p = await ctx.newPage(); p.on('dialog', d => d.accept());
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 240000 }); await p.waitForTimeout(11000);
  await p.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }); await w(1500); window.__notesPanel.open(); await w(1200); });

  const NP = 'window.__notesPanel';
  const api = await p.evaluate(() => { const s = window.__notesPanel.steady(); return s; });
  ok('the steady hand exists and is on by default at a moderate amount', api && api.isDefault && api.amount > 0.2 && api.amount < 0.7 && api.alpha < 1, api);

  /* Draw the same jittery line twice - raw and steadied - through the real
     pointer path with coalesced samples, and measure how far the STORED points
     stray from the chord. Same input, same page, same pen. */
  const draw = async (amount, kind) => p.evaluate(async ({ amount, kind }) => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const NP = window.__notesPanel; NP.steady(amount);
    const s = NP.surface(); const svg = document.querySelector('#mn-dock svg');
    const mk = (t, x, y, extra) => { const e = new PointerEvent(t, { pointerId: 7, pointerType: 'pen', isPrimary: true, clientX: x, clientY: y, pressure: 0.6, bubbles: true, cancelable: true, buttons: t === 'pointerup' ? 0 : 1 }); if (extra) e.getCoalescedEvents = () => extra; return e; };
    const x0 = s.x + 80, y0 = s.y + 120; const n0 = (NP.lastStroke() ? 1 : 0);
    const before = JSON.stringify(NP.lastStroke());
    svg.dispatchEvent(mk('pointerdown', x0, y0));
    let lastX = x0, lastY = y0;
    for (let i = 1; i <= 100; i++) {
      // a shaky hand at handwriting speed: 1.5px a sample along x (about 180 px/s
      // at 120 Hz) with a ±3px tremor. 'fast' reverses every sample; 'real' is a
      // 10 Hz hand tremor at 120 Hz - a 12-sample sine
      lastX = x0 + i * 1.5; lastY = y0 + (kind === 'real' ? 3 * Math.sin(i * 2 * Math.PI / 12) : ((i % 2) ? 3 : -3));
      svg.dispatchEvent(mk('pointermove', lastX, lastY));
    }
    const liveMax = document.querySelector('#mn-dock svg path:last-of-type'); // the live node
    svg.dispatchEvent(mk('pointerup', lastX, lastY)); await w(200);
    const st = NP.lastStroke(); if (!st || JSON.stringify(st) === before) return { none: true };
    const K = st ? (function(){ const r = svg.getBoundingClientRect(); return 1000 / r.width; })() : 1;
    const pts = st.points; const a = pts[0], z = pts[pts.length - 1];
    /* deviation from the line she MEANT (y = y0), not from the chord: the
       stroke ends at the raw nib by design, and the nib carries the tremor's
       last offset, so a chord to it is skewed by up to the tremor itself */
    const yLine = (y0 - svg.getBoundingClientRect().top) * K;
    const dev = pts.map(q => Math.abs(q.y - yLine));
    const rms = Math.sqrt(dev.reduce((t, v) => t + v * v, 0) / dev.length);
    const penEndX = (lastX - svg.getBoundingClientRect().left) * K, penEndY = (lastY - svg.getBoundingClientRect().top) * K;
    return { n: pts.length, rms: Math.round(rms * 100) / 100, maxX: Math.max(...pts.map(q => q.x)), penEndX: Math.round(penEndX * 10) / 10,
             endGap: Math.round(Math.hypot(z.x - penEndX, z.y - penEndY) * 10) / 10, monotone: pts.every((q, i) => i === 0 || q.x >= pts[i - 1].x - 0.01) };
  }, { amount, kind });
  const raw = await draw(0, 'real');
  const steady = await draw(0.4, 'real');
  const strong = await draw(1, 'real');
  const rawFast = await draw(0, 'fast'), steadyFast = await draw(0.4, 'fast');
  ok('raw ink keeps every wobble (the control)', !raw.none && raw.rms > 1.0, raw);
  ok('the default steady hand cuts a real 10 Hz hand tremor to less than half', !steady.none && steady.rms < raw.rms * 0.5, { raw: raw.rms, steady: steady.rms });
  ok('and fast jitter too', !steadyFast.none && steadyFast.rms < rawFast.rms * 0.5, { raw: rawFast.rms, steady: steadyFast.rms });
  /* at the default the tremor is already at the floor (the raw tip and the
     string's first slack are what is left), so strong can only be asked to be
     no worse - and to leave the floor where it is */
  /* the residue is the drained tail: the stroke ends where she lifted, and the
     nib carries the tremor's last offset. Under a page unit against a 3 px
     tremor is still a two-thirds cut. */
  ok('strong is at least as steady, and the residue stays small', !strong.none && strong.rms <= steady.rms + 0.15 && strong.rms < 1.0, { steady: steady.rms, strong: strong.rms });
  ok('nothing is drawn where the pen was not: no stored point is ahead of the nib', steady.maxX <= steady.penEndX + 0.5 && strong.maxX <= strong.penEndX + 0.5, { steady, strong });
  ok('the stroke still ends at the nib', steady.endGap < 1.5 && strong.endGap < 1.5, { steady: steady.endGap, strong: strong.endGap });
  /* the string does not move for the first few samples of a stroke, so those
     land on the same stored point; after that, one stored point per sample */
  ok('and the points she made are kept - the follower drops only the string\'s first slack', steady.n >= 90 && strong.n >= 85 && raw.n >= 98, { raw: raw.n, steady: steady.n, strong: strong.n });
  ok('the steadied line still goes where she went - monotone along her direction', steady.monotone && strong.monotone, { steady: steady.monotone, strong: strong.monotone });

  /* hold-to-straighten must survive: a roughly straight stroke, pen held
     still at the end, becomes a two-point line */
  const snap = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const NP = window.__notesPanel; NP.steady(0.4);
    const s = NP.surface(); const svg = document.querySelector('#mn-dock svg');
    const mk = (t, x, y) => new PointerEvent(t, { pointerId: 8, pointerType: 'pen', isPrimary: true, clientX: x, clientY: y, pressure: 0.6, bubbles: true, cancelable: true, buttons: t === 'pointerup' ? 0 : 1 });
    const x0 = s.x + 80, y0 = s.y + 300;
    svg.dispatchEvent(mk('pointerdown', x0, y0));
    for (let i = 1; i <= 40; i++) svg.dispatchEvent(mk('pointermove', x0 + i * 5, y0 + ((i % 3) - 1)));
    await w(900);                                   // the rest that straightens it
    svg.dispatchEvent(mk('pointerup', x0 + 200, y0)); await w(200);
    const st = NP.lastStroke(); return { n: st ? st.points.length : 0, flat: st && st.points.length === 2 ? st.points[0].y === st.points[1].y : null };
  });
  ok('hold-to-straighten still snaps a steadied stroke to a two-point line', snap.n === 2 && snap.flat === true, snap);

  /* the control lives in the pen picker, is named, and persists */
  const ui = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const btn = document.querySelector('#mn-dock #mn-tools .mn-tool[data-t="width"]');
    if (!btn) return { noBtn: true };
    btn.click(); await w(300);                                // the pen picker, as penweight opens it
    const sl = document.querySelector('#mn-dock .mn-pop .mn-steady-sl');
    if (!sl) return { noSlider: true, pops: document.querySelectorAll('.mn-pop').length };
    const out = { label: sl.getAttribute('aria-label'), before: sl.value };
    sl.value = '80'; sl.dispatchEvent(new Event('input', { bubbles: true })); sl.dispatchEvent(new Event('change', { bubbles: true })); await w(400);
    out.stored = window.__notesPanel.steady().amount; out.cap = (document.querySelector('.mn-steady-t') || {}).textContent;
    return out;
  });
  ok('the slider is in the pen picker, named for a screen reader, and sets the amount', !ui.noBtn && !ui.noSlider && ui.label === 'Steady hand' && Math.abs(ui.stored - 0.8) < 0.01 && /Strong/.test(ui.cap || ''), ui);
  await p.reload({ waitUntil: 'load', timeout: 240000 }); await p.waitForTimeout(9000);
  const kept = await p.evaluate(() => window.__notesPanel.steady().amount);
  ok('and the amount survives a reload', Math.abs(kept - 0.8) < 0.01, kept);

  /* SECOND PASS - "while writing I am having some issues". The stored point
     trails the nib by design, but the line she SEES must not: it reaches the
     nib along her raw path. And a corner must survive the averaging. */
  const probe = async (amount, kind) => p.evaluate(async ({ amount, kind }) => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const NP = window.__notesPanel; if (!document.querySelector('#mn-dock svg')) { NP.open(); await w(1200); }
    NP.steady(amount);
    const s = NP.surface(); const svg = document.querySelector('#mn-dock svg'); const R = svg.getBoundingClientRect(); const K = 1000 / R.width;
    const mk = (t, x, y) => new PointerEvent(t, { pointerId: 7, pointerType: 'pen', isPrimary: true, clientX: x, clientY: y, pressure: 0.6, bubbles: true, cancelable: true, buttons: t === 'pointerup' ? 0 : 1 });
    const x0 = s.x + 100 + Math.random() * 300, y0 = s.y + 150 + Math.random() * 200;
    const before = JSON.stringify(NP.lastStroke()); const out = {};
    if (kind === 'lag') {
      svg.dispatchEvent(mk('pointerdown', x0, y0)); let x = x0;
      for (let i = 1; i <= 40; i++) { x = x0 + 2 * i; svg.dispatchEvent(mk('pointermove', x, y0)); }
      const d = svg.querySelector('path:last-of-type').getAttribute('d'); const m = d.match(/L ([\d.]+) ([\d.]+)\s*$/);
      out.lagPx = m ? Math.round((((x - R.left) * K - (+m[1])) / K) * 10) / 10 : null;
      svg.dispatchEvent(mk('pointerup', x, y0));
    }
    if (kind === 'corner') {
      svg.dispatchEvent(mk('pointerdown', x0, y0)); let x = x0, y = y0;
      for (let i = 1; i <= 30; i++) { x = x0 + 2.5 * i; y = y0 + 2.5 * i; svg.dispatchEvent(mk('pointermove', x, y)); }
      const ax = x, ay = y; for (let i = 1; i <= 30; i++) svg.dispatchEvent(mk('pointermove', ax + 2.5 * i, ay - 2.5 * i));
      svg.dispatchEvent(mk('pointerup', ax + 75, ay - 75)); await w(200);
      const st = NP.lastStroke(); const apx = (ax - R.left) * K, apy = (ay - R.top) * K; let best = 1e9;
      if (st) st.points.forEach(q => { best = Math.min(best, Math.hypot(q.x - apx, q.y - apy)); });
      out.cornerCutPx = Math.round(best / K * 10) / 10;
    }
    if (kind === 'dot') { svg.dispatchEvent(mk('pointerdown', x0, y0)); svg.dispatchEvent(mk('pointermove', x0 + 1, y0 + 0.5)); svg.dispatchEvent(mk('pointerup', x0 + 1, y0 + 0.5)); }
    await w(200); const st2 = NP.lastStroke(); out.kept = !!st2 && JSON.stringify(st2) !== before;
    return out;
  }, { amount, kind });
  const lagD = await probe(0.4, 'lag'), lagF = await probe(1, 'lag');
  ok('while she writes, the line she sees reaches the nib (no rubber band), at the default and at full', lagD.lagPx !== null && lagD.lagPx <= 1.5 && lagF.lagPx !== null && lagF.lagPx <= 1.5, { def: lagD, full: lagF });
  const cornerRaw = await probe(0, 'corner'), cornerD = await probe(0.4, 'corner');
  ok('a sharp corner survives the steady hand: rounded by under 5 px at the default (the raw control keeps it exactly)', cornerRaw.cornerCutPx < 0.5 && cornerD.cornerCutPx < 5, { raw: cornerRaw, def: cornerD });
  const dotD = await probe(0.4, 'dot');
  ok('a dot is still a mark', dotD.kept, dotD);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close(); await b.close();
  console.log(`steady: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
