// Action-based Undo/Redo (notebook pad + lesson pen), eraser sizes, the pen
// picker that replaced the loose swatches, and the removed quick strip.
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport:{width:1194,height:834} });
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  p.on('dialog', d => d.accept());
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(15000);
  await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    store.gannoAllowFinger = true; saveStore();
    go({name:'section',courseId:'C959',chId:'ch4',secId:'s1'}); await w(1500);
    window.__notesPanel.open(); await w(900);
    // start from a clean pad
    const k = window.__notesPanel.state().key;
    try { gannoSaveStrokes('pad_' + k.replace(/[^a-zA-Z0-9_/-]/g,'_'), []); } catch(e){}
    window.__notesPanel.close(); await w(400); window.__notesPanel.open(); await w(700);
  });
  const N = () => p.evaluate(() => window.__notesPanel.state().strokes);
  const padRect = () => p.evaluate(() => { const s=document.getElementById('mn-ink').getBoundingClientRect(); const d=document.getElementById('mn-pages').getBoundingClientRect();
    return { l: Math.max(s.left,d.left), t: Math.max(s.top,d.top), r: Math.min(s.right,d.right), b: Math.min(s.bottom,d.bottom) }; });
  const draw = async (fx, fy, len) => {
    const r = await padRect();
    const x0 = r.l + (r.r-r.l)*fx, y0 = r.t + (r.b-r.t)*fy;
    await p.mouse.move(x0,y0); await p.mouse.down();
    for (let i=1;i<=10;i++) await p.mouse.move(x0 + len*i/10, y0 + 4*i/10);
    await p.mouse.up(); await p.waitForTimeout(120);
    return { x0, y0 };
  };
  const tap = async (x, y) => { await p.mouse.move(x,y); await p.mouse.down(); await p.mouse.move(x+1,y); await p.mouse.up(); await p.waitForTimeout(120); };

  // ---- notebook: toolbar shape
  const tb = await p.evaluate(() => ({
    tools: [...document.querySelectorAll('#mn-tools .mn-tool')].map(b => b.dataset.t),
    looseSwatches: document.querySelectorAll('#mn-tools > .mn-sw').length,
  }));
  ok('notebook toolbar has redo', tb.tools.includes('redo'), tb.tools.join(','));
  ok('notebook toolbar has no loose colour swatches', tb.looseSwatches === 0, tb.looseSwatches);
  ok('notebook toolbar keeps one pen-options button', tb.tools.includes('width'), tb.tools.join(','));

  // ---- notebook: pen picker
  await p.click('#mn-tools .mn-tool[data-t="width"]'); await p.waitForTimeout(150);
  const pick = await p.evaluate(() => { const pop = document.querySelector('.mn-pop'); return pop ? { kind: pop.dataset.kind,
    colors: pop.querySelectorAll('.mn-sw').length, sizes: pop.querySelectorAll('.mn-size').length } : null; });
  ok('pen picker opens with 10 colours and 6 sizes', pick && pick.kind==='pen' && pick.colors===10 && pick.sizes===6, JSON.stringify(pick));
  await p.click('.mn-pop .mn-sw[data-c="#7c3aed"]'); await p.waitForTimeout(150);
  const chosen = await p.evaluate(() => ({ c: store.padPrefs.color, popStill: !!document.querySelector('.mn-pop') && document.querySelector('.mn-pop').dataset.kind }));
  ok('picking a colour stores it and repaints the picker', chosen.c === '#7c3aed' && chosen.popStill === 'pen', JSON.stringify(chosen));
  await p.click('.mn-pop .mn-size:nth-child(3)'); await p.waitForTimeout(150);   // 1st .mn-size after grid+label
  const sized = await p.evaluate(() => ({ w: store.padPrefs.w, closed: !document.querySelector('.mn-pop') }));
  ok('picking a size stores it and closes the picker', sized.w > 0 && sized.closed, JSON.stringify(sized));
  // tapping the already-active pen tool opens the picker too
  await p.click('#mn-tools .mn-tool[data-t="pen"]'); await p.waitForTimeout(150);
  ok('second tap on Pen opens the picker', await p.evaluate(() => !!document.querySelector('.mn-pop[data-kind="pen"]')));
  await p.evaluate(() => { const x=document.querySelector('.mn-pop'); if (x) x.remove(); });   // (Escape would minimize the notebook)

  // ---- notebook: draw 3, erase 1, undo/redo
  const s1 = await draw(0.30, 0.40, 60);
  const s2 = await draw(0.30, 0.55, 60);
  const s3 = await draw(0.30, 0.70, 60);
  ok('three strokes on the pad', await N() === 3, await N());
  await p.click('#mn-tools .mn-tool[data-t="erase"]');
  await tap(s2.x0 + 30, s2.y0 + 2);
  ok('eraser (medium) cut the middle stroke into two pieces (partial erase)', await N() === 4, await N());
  await p.click('#mn-tools .mn-tool[data-t="undo"]'); await p.waitForTimeout(150);
  ok('undo after erase RESTORES the erased stroke', await N() === 3, await N());
  const restoredOrder = await p.evaluate(() => { const k=window.__notesPanel.state().key; const arr = gannoGetStrokes('pad_' + k.replace(/[^a-zA-Z0-9_/-]/g,'_')); return arr.map(s => Math.round(s.points[0].y)); });
  ok('restored stroke sits back in its original position in the list', restoredOrder[0] < restoredOrder[1] && restoredOrder[1] < restoredOrder[2], restoredOrder.join(','));
  await p.click('#mn-tools .mn-tool[data-t="redo"]'); await p.waitForTimeout(150);
  ok('redo re-applies the erase (two pieces again)', await N() === 4, await N());
  await p.click('#mn-tools .mn-tool[data-t="undo"]'); await p.waitForTimeout(100);
  await p.click('#mn-tools .mn-tool[data-t="undo"]'); await p.waitForTimeout(100);
  ok('undo twice: erase undone, then last drawn stroke removed', await N() === 2, await N());
  await p.click('#mn-tools .mn-tool[data-t="redo"]'); await p.waitForTimeout(100);
  ok('redo brings the drawn stroke back', await N() === 3, await N());
  // a new stroke after an undo clears the redo stack
  await p.click('#mn-tools .mn-tool[data-t="undo"]'); await p.waitForTimeout(100);
  await p.click('#mn-tools .mn-tool[data-t="pen"]');
  await draw(0.30, 0.85, 60);
  const redoDim = await p.evaluate(() => document.querySelector('#mn-tools .mn-tool[data-t="redo"]').classList.contains('dim'));
  ok('drawing after undo empties redo (button dims)', redoDim, redoDim);
  // erase drag across two strokes = ONE undo step
  await p.click('#mn-tools .mn-tool[data-t="erase"]');
  const r = await padRect();
  const before = await N();
  await p.mouse.move(s1.x0 + 30, s1.y0 - 6); await p.mouse.down();
  for (let i=1;i<=12;i++) await p.mouse.move(s1.x0 + 30, s1.y0 - 6 + ((s3.y0 + 8) - (s1.y0 - 6)) * i/12);
  await p.mouse.up(); await p.waitForTimeout(150);
  const afterDrag = await N();
  ok('one eraser drag cuts through several strokes', afterDrag !== before, `${before} -> ${afterDrag}`);
  await p.click('#mn-tools .mn-tool[data-t="undo"]'); await p.waitForTimeout(150);
  ok('ONE undo brings the whole drag back', await N() === before, await N());

  // ---- notebook: eraser sizes (small misses at 12 units away, large hits)
  await p.click('#mn-tools .mn-tool[data-t="erase"]'); await p.waitForTimeout(100);   // already active -> opens size popover
  const erPop = await p.evaluate(() => { const pop = document.querySelector('.mn-pop[data-kind="eraser"]'); return pop ? pop.querySelectorAll('.mn-size').length : 0; });
  ok('second tap on Eraser opens a 3-size picker', erPop === 3, erPop);
  await p.click('.mn-pop[data-kind="eraser"] .mn-size:nth-child(1)'); await p.waitForTimeout(100);
  ok('small eraser stored', await p.evaluate(() => store.padPrefs.er) === 9);
  const unitsPerPx = await p.evaluate(() => 1000 / document.getElementById('mn-ink').getBoundingClientRect().width);
  const offPx = Math.round(13 / unitsPerPx);   // 13 pad units away: inside large (36), outside small (9)
  const n0 = await N();
  await tap(s1.x0 + 30, s1.y0 + 2 - offPx);
  ok('small eraser misses a stroke 13 units away', await N() === n0, `${n0} -> ${await N()}`);
  await p.click('#mn-tools .mn-tool[data-t="erase"]'); await p.waitForTimeout(100);
  await p.click('.mn-pop[data-kind="eraser"] .mn-size:nth-child(3)'); await p.waitForTimeout(100);
  ok('large eraser stored', await p.evaluate(() => store.padPrefs.er) === 36);
  await tap(s1.x0 + 30, s1.y0 + 2 - offPx);
  ok('large eraser reaches it', await N() < n0, `${n0} -> ${await N()}`);

  // ---- lesson pen: undo/redo + no quick strip
  await p.evaluate(() => { store.padPrefs.er = 18; const k=window.__notesPanel.state().key; if (store.padNotes) delete store.padNotes[k]; try { gannoSaveStrokes('pad_' + k.replace(/[^a-zA-Z0-9_/-]/g,'_'), []); } catch(e){} saveStore(); window.__notesPanel.close(); });
  await p.waitForTimeout(500);
  const bar = await p.evaluate(() => ({ quick: !!document.getElementById('gn-quick'), dots: document.querySelectorAll('.gn-dot').length,
    redo: !!document.querySelector('.ganno-bar [data-act="redo"]'), undo: !!document.querySelector('.ganno-bar [data-act="undo"]') }));
  ok('lesson pen bar: quick colour strip removed', !bar.quick && bar.dots === 0, JSON.stringify(bar));
  ok('lesson pen bar: has Undo and Redo', bar.undo && bar.redo, JSON.stringify(bar));
  await p.evaluate(async () => { const w=ms=>new Promise(r=>setTimeout(r,ms)); gannoSaveStrokes(ganno.routeKey, []); gannoRender([], null); if (typeof gannoSetActive==='function') gannoSetActive(true); ganno.tool='pen'; try { gannoRenderToolbar(); } catch(e){} await w(300); });
  // the lesson may now open on a definitions table or figure, so bring a real paragraph into the window first
  const para = await p.evaluate(async () => { const w=ms=>new Promise(r=>setTimeout(r,ms)); const els=[...document.querySelectorAll('.lesson p, .lesson li')].filter(e=>e.getBoundingClientRect().width>250 && e.getBoundingClientRect().height>=16);
    const inWin = r => r.top>220 && r.bottom<window.innerHeight-100;
    let v=els.map(e=>e.getBoundingClientRect()).find(inWin);
    if (!v && els.length) { els[0].scrollIntoView({block:'center'}); await w(400); v=els.map(e=>e.getBoundingClientRect()).find(inWin); }
    return v ? {l:v.left,t:v.top,h:v.height} : null; });
  ok('lesson: a paragraph is in view for the pen test', !!para, para);
  const G = () => p.evaluate(() => gannoGetStrokes(ganno.routeKey).length);
  const gdraw = async (dy) => { const x0=para.l+30, y0=para.t+para.h/2+dy; await p.mouse.move(x0,y0); await p.mouse.down(); for (let i=1;i<=10;i++) await p.mouse.move(x0+80*i/10, y0); await p.mouse.up(); await p.waitForTimeout(120); return {x0,y0}; };
  const g1 = await gdraw(-40); const g2 = await gdraw(0); const g3 = await gdraw(40);   // 40px apart: outside the 16px eraser reach
  ok('lesson: three pen strokes', await G() === 3, await G());
  // stored stroke positions (the layer's own coordinates, unaffected by page scroll): [top, middle, bottom]
  const storedYs = await p.evaluate(() => gannoGetStrokes(ganno.routeKey).map(s => s.points[0].y).sort((a, b) => a - b));
  await p.evaluate(() => { ganno.tool='eraser'; gannoRenderToolbar(); });
  await tap(g2.x0 + 40, g2.y0);
  ok('lesson: eraser removed one', await G() === 2, await G());
  await p.click('.ganno-bar [data-act="undo"]'); await p.waitForTimeout(150);
  ok('lesson: undo restores the erased stroke', await G() === 3, await G());
  const midBack = await p.evaluate((y) => gannoGetStrokes(ganno.routeKey).some(s => s.points && Math.abs(s.points[0].y - y) < 4), storedYs[1]);
  ok('lesson: the restored stroke is the erased one (by position)', midBack, midBack);
  await p.click('.ganno-bar [data-act="redo"]'); await p.waitForTimeout(150);
  ok('lesson: redo re-erases', await G() === 2, await G());
  await p.click('.ganno-bar [data-act="undo"]'); await p.waitForTimeout(100);
  await p.click('.ganno-bar [data-act="undo"]'); await p.waitForTimeout(100);
  ok('lesson: second undo removes the last DRAWN stroke, not a random one', await G() === 2 && await p.evaluate((y) => !gannoGetStrokes(ganno.routeKey).some(s => Math.abs(s.points[0].y - y) < 4), storedYs[2]), await G());
  const ts = await p.evaluate(() => gannoGetStrokes(ganno.routeKey).map(s => s._ts));
  ok('lesson: restored ink carries a timestamp (sync-safe)', ts.every(t => typeof t === 'number' && t > 0), JSON.stringify(ts));
  await p.evaluate(() => { gannoSaveStrokes(ganno.routeKey, []); gannoRender([], null); store.gannoAllowFinger = false; saveStore(); });
  ok('no page errors', errs.length===0, errs.join(' | ').slice(0,300));
  await b.close();
  const bad=F.filter(f=>!f.pass);
  for (const f of F) console.log((f.pass?'PASS':'FAIL')+' '+f.n+(f.pass?'':' -> '+f.x));
  console.log(`undoredo: ${F.length-bad.length}/${F.length} passed`);
  process.exit(bad.length?1:0);
})().catch(e=>{ console.error('HARNESS', e); process.exit(2); });
