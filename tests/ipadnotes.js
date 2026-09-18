// The notebook on an iPad, both ways round: an iPad Pro 11 profile (touch,
// Safari UA, 2x), the Pencil as pen pointer events, a finger as touch events.
// Engine is Chromium (WebKit is not installed here), so this is the closest
// stand-in, not Safari itself.
//   - opens beside the lesson in landscape, along the bottom in portrait
//   - every toolbar control reachable without scrolling
//   - the pen writes; a finger does not (it scrolls)
//   - ink survives close/open and a reload; eraser, undo, typed notes, pages,
//     skins and paper all work; the class notebook shows the page;
//     the lesson annotation layer takes pen and refuses finger
const { chromium, devices } = require('playwright');
const B = 'http://127.0.0.1:' + (process.env.PORT || 8901) + '/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d)))); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const K = 'C959/ch4/s1', PK = 'pad_C959/ch4/s1';
  const boot = async (name) => {
    const d = devices[name]; const { defaultBrowserType, ...opts } = d;
    const ctx = await browser.newContext(opts);
    const p = await ctx.newPage();
    p.on('dialog', x => x.accept());
    p.errs = []; p.on('pageerror', e => p.errs.push(String(e).slice(0, 160)));
    const t0 = Date.now();
    await p.goto(B, { waitUntil: 'load', timeout: 240000 });
    p.loadMs = Date.now() - t0;
    await p.waitForTimeout(12000);
    return p;
  };
  const drive = async (p, label) => {
    const R = await p.evaluate(async ({ K, PK }) => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const out = { errs: [] }, NP = window.__notesPanel;
      try { gannoSaveStrokes(PK, []); } catch (e) {}
      try { if (typeof gannoSetActive === 'function') gannoSetActive(false); } catch (e) {}
      const [c, ch, s] = K.split('/');
      go({ name: 'section', courseId: c, chId: ch, secId: s }); await w(2000);
      NP.open(); await w(1200); NP.tab('write'); await w(400);
      if (NP.reloadInk) NP.reloadInk();
      const st = NP.state();
      out.open = { open: st.open, side: st.side, key: st.key, area: st.area, vw: innerWidth, vh: innerHeight, touch: navigator.maxTouchPoints > 0 };
      const dock = document.getElementById('mn-dock'), dr = dock.getBoundingClientRect();
      const tools = document.getElementById('mn-tools');
      const items = [...tools.querySelectorAll('.mn-tool')].map(el => { const r = el.getBoundingClientRect(); return { t: el.dataset.t, vis: r.width > 0 && r.left >= dr.left - 1 && r.right <= dr.right + 1 && r.top >= dr.top - 1 && r.bottom <= dr.bottom + 1 }; });
      out.toolbar = { count: items.length, hidden: items.filter(i => !i.vis).map(i => i.t), scroll: tools.scrollWidth > tools.clientWidth + 2, rows: new Set(items.map(i => Math.round(tools.querySelector('.mn-tool[data-t="' + i.t + '"]').getBoundingClientRect().top))).size };
      // pen and finger
      const svg = document.getElementById('mn-ink');
      const r = () => svg.getBoundingClientRect(), Kf = () => 1000 / r().width;
      const cx = u => r().left + u / Kf(), cy = u => r().top + u / Kf();
      const ev = (type, x, y, kind, id) => new PointerEvent(type, { pointerId: id, pointerType: kind, isPrimary: true, clientX: x, clientY: y, pressure: kind === 'pen' ? .5 : .0, bubbles: true, cancelable: true, buttons: type === 'pointerup' ? 0 : 1 });
      const S = () => gannoGetStrokes(PK) || [];
      const write = async (y, kind, id) => { const n0 = S().length; svg.dispatchEvent(ev('pointerdown', cx(80), cy(y), kind, id)); for (let i = 1; i <= 30; i++) { svg.dispatchEvent(ev('pointermove', cx(80 + i * 12), cy(y + Math.sin(i) * 4), kind, id)); } svg.dispatchEvent(ev('pointerup', cx(80 + 31 * 12), cy(y), kind, id)); await w(250); return S().length - n0; };
      out.pen1 = await write(420, 'pen', 9);
      out.pen2 = await write(470, 'pen', 9);
      out.finger = await write(520, 'touch', 21);
      out.stored = S().length;
      const last = S()[S().length - 1];
      out.lastStroke = last ? { pts: last.points.length, hasTs: !!last.ts, color: last.color } : null;
      // survives close / open
      NP.close(); await w(400); NP.open(); await w(800); NP.tab('write'); await w(200);
      out.afterReopen = NP.state().strokes;
      // eraser with the pen across the second stroke
      const eraseBtn = document.querySelector('#mn-tools .mn-tool[data-t="erase"]'); eraseBtn.click(); await w(150);
      const n1 = S().length;
      svg.dispatchEvent(ev('pointerdown', cx(200), cy(440), 'pen', 9)); for (let i = 1; i <= 10; i++) svg.dispatchEvent(ev('pointermove', cx(200), cy(440 + i * 6), 'pen', 9)); svg.dispatchEvent(ev('pointerup', cx(200), cy(500), 'pen', 9)); await w(250);
      out.erased = S().length !== n1;
      out.undoRestored = (NP.undo(), await w(200), S().length === n1);
      document.querySelector('#mn-tools .mn-tool[data-t="pen"]').click(); await w(100);
      // typed note
      NP.tab('type'); await w(300);
      const ta = document.getElementById('mn-ta'); ta.value = 'iPad audit note ' + Date.now(); ta.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('mn-save').click(); await w(400);
      out.typed = NP.typed(K).length;
      NP.tab('write'); await w(200);
      // paper + skin
      NP.setPaper('graph'); await w(150); out.paper = NP.paper();
      NP.setSkin('legal'); await w(150); out.skin = { id: NP.skin(), attr: dock.getAttribute('data-skin'), paper: getComputedStyle(svg).backgroundColor };
      NP.setSkin('classic'); NP.setPaper('cornell'); await w(150);
      // pages
      const p0 = NP.page().count; NP.addPage(1); await w(150); const p1 = NP.page().count;
      NP.insertPage(1); await w(200); const p2 = NP.page().count; const onP2 = S().filter(x => x.points[0].y >= NP.limits().pageH).length;
      NP.undo(); await w(200); const p3 = NP.page().count;
      out.pages = { p0, p1, p2, onP2, p3, strokes: S().length };
      // write anywhere: from home the pad opens on the pinned page
      NP.close(); await w(300); go({ name: 'home' }); await w(1200); NP.open(); await w(900);
      out.pinned = { key: NP.state().key, pinned: NP.pinned(), where: (document.getElementById('mn-where') || {}).textContent || '' };
      NP.close(); await w(300);
      // class notebook lists this page
      go({ name: 'classnotes', courseId: 'C959' }); await w(1500);
      const app = document.getElementById('app');
      out.classnotes = { text: /Discrete/.test(app.innerText), hasInk: NP.ink(K).strokes, pageImg: !!app.querySelector('img, canvas'), openBtn: !!app.querySelector('[data-open-lesson], [data-write-here], button') };
      // lesson annotation: pen draws, finger does not
      go({ name: 'section', courseId: c, chId: ch, secId: s }); await w(2000);
      try { gannoSetActive(true); } catch (e) {}
      await w(300);
      const g = document.querySelector('.ganno-svg.active') || document.querySelector('.ganno-svg');
      const gr = g ? g.getBoundingClientRect() : null;
      const G = () => (typeof ganno === 'object' && ganno ? (gannoGetStrokes(ganno.routeKey) || []).length : -1);
      const g0 = G();
      if (g) {
        const gx = gr.left + 200, gy = gr.top + 300;
        const gev = (type, x, y, kind, id) => new PointerEvent(type, { pointerId: id, pointerType: kind, isPrimary: true, clientX: x, clientY: y, pressure: kind === 'pen' ? .5 : 0, bubbles: true, cancelable: true, buttons: type === 'pointerup' ? 0 : 1 });
        g.dispatchEvent(gev('pointerdown', gx, gy, 'pen', 9)); for (let i = 1; i <= 20; i++) g.dispatchEvent(gev('pointermove', gx + i * 8, gy + (i % 3), 'pen', 9)); g.dispatchEvent(gev('pointerup', gx + 168, gy, 'pen', 9)); await w(300);
        const g1 = G();
        g.dispatchEvent(gev('pointerdown', gx, gy + 60, 'touch', 22)); for (let i = 1; i <= 20; i++) g.dispatchEvent(gev('pointermove', gx + i * 8, gy + 60, 'touch', 22)); g.dispatchEvent(gev('pointerup', gx + 168, gy + 60, 'touch', 22)); await w(300);
        out.anno = { before: g0, afterPen: g1, afterTouch: G(), barVisible: document.body.classList.contains('ganno-bar-visible') };
      } else out.anno = { missing: true };
      try { gannoSetActive(false); } catch (e) {}
      // sync roundtrip: my own copy adds nothing
      const snap = JSON.parse(JSON.stringify(window.__sync._snapshot()));
      const res = window.__sync._apply(snap); await w(300);
      out.roundtrip = { ink: res.ink, strokes: S().length };
      out.boot = { dom: document.getElementsByTagName('*').length, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
      return out;
    }, { K, PK });
    // reload: ink and the typed note are still there
    await p.reload({ waitUntil: 'load', timeout: 240000 }); await p.waitForTimeout(10000);
    const after = await p.evaluate(async ({ K, PK }) => { const w = ms => new Promise(r => setTimeout(r, ms)); const [c, ch, s] = K.split('/'); go({ name: 'section', courseId: c, chId: ch, secId: s }); await w(1500); window.__notesPanel.open(); await w(900); return { strokes: (gannoGetStrokes(PK) || []).length, typed: window.__notesPanel.typed(K).length, pad: window.__notesPanel.state().strokes }; }, { K, PK });
    await p.screenshot({ path: `ipad-${label}.png` });
    return { R, after };
  };

  for (const [label, dev, expectSide] of [['landscape', 'iPad Pro 11 landscape', true], ['portrait', 'iPad Pro 11', false]]) {
    const p = await boot(dev);
    const { R, after } = await drive(p, label);
    const L = label + ': ';
    ok(L + 'boots as a touch iPad with no page errors', R.open.touch && p.errs.length === 0, { errs: p.errs.slice(0, 2), loadMs: p.loadMs, vw: R.open.vw });
    ok(L + 'the notebook opens on the lesson page ' + (expectSide ? 'beside it' : 'along the bottom'), R.open.open && R.open.key === K && R.open.side === expectSide && R.open.area > 100000, R.open);
    ok(L + 'every toolbar control sits inside the dock, nothing hangs past its edge', R.toolbar.count >= 12 && R.toolbar.hidden.length === 0 && !R.toolbar.scroll, R.toolbar);
    ok(L + 'the pen writes (two strokes, timestamped, many points)', R.pen1 === 1 && R.pen2 === 1 && R.lastStroke && R.lastStroke.pts > 10 && R.lastStroke.hasTs, { pen1: R.pen1, pen2: R.pen2, last: R.lastStroke });
    ok(L + 'a finger does not draw', R.finger === 0, R.finger);
    ok(L + 'ink survives closing and reopening the notebook', R.afterReopen === R.stored, { reopen: R.afterReopen, stored: R.stored });
    ok(L + 'the eraser takes ink with the pen, Undo brings it back', R.erased && R.undoRestored, { erased: R.erased, undo: R.undoRestored });
    ok(L + 'a typed note saves to this section', R.typed === 1, R.typed);
    ok(L + 'paper and skin apply', R.paper === 'graph' && R.skin.id === 'legal' && R.skin.attr === 'legal', { paper: R.paper, skin: R.skin });
    ok(L + 'add, insert and undo pages behave', R.pages.p1 === R.pages.p0 + 1 && R.pages.p2 === R.pages.p1 + 1 && R.pages.onP2 === R.pages.strokes && R.pages.p3 === R.pages.p1, R.pages);
    ok(L + 'from Home the notebook opens on the pinned page and says so', R.pinned.key === K && R.pinned.pinned === K && /📌/.test(R.pinned.where), R.pinned);
    ok(L + 'the class notebook screen shows the class and knows the page has ink', R.classnotes.text && R.classnotes.hasInk >= 2, R.classnotes);
    ok(L + 'the lesson annotation layer takes the pen and refuses a finger', R.anno && !R.anno.missing && R.anno.afterPen === R.anno.before + 1 && R.anno.afterTouch === R.anno.afterPen, R.anno);
    ok(L + 'syncing my own copy back adds nothing', R.roundtrip.ink === 0, R.roundtrip);
    ok(L + 'after a reload the ink and the typed note are still there', after.strokes === R.stored && after.typed === 1 && after.pad === R.stored, { after, stored: R.stored });
    console.log('INFO ' + label + ' load ' + p.loadMs + 'ms, DOM ' + R.boot.dom + ', heap ' + R.boot.heapMB + 'MB');
    await p.context().close();
  }
  await browser.close();
  console.log(`ipadnotes: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
