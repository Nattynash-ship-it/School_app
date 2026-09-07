// "Whenever I refresh or update the app this happens" - a photo of her Cornell
// page with words written on top of themselves.
//
// A page of ink is TWO storage slots: gsk: (the packed page) and gsl: (the
// strokes appended since it was last packed). gsl: is deliberately DELETED
// every time the page is compacted back into gsk: - that is what compaction
// means. The launch-time backup recovery restored "any slot localStorage no
// longer has", one key at a time, so on the first launch after a compaction it
// put the stale log back on top of a base that already contained those
// strokes. Four strokes read back as seven, and it happened again every launch.
//
// The fix restores a page as a PAIR, and only when the page is genuinely gone
// from this device. A one-time sweep clears ink already doubled.
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
const URL = 'http://127.0.0.1:8901/index.html';
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport:{width:834,height:1194}, hasTouch:true });
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  const load = async () => { await p.goto(URL,{waitUntil:'load',timeout:240000}); await p.waitForTimeout(16000); };
  const openPad = () => p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    go({name:'section',courseId:'C959',chId:'ch4',secId:'s1'}); await w(2400);
    window.__notesPanel.open(); await w(1600);
    window.__notesPanel.tab('write'); await w(600);
  });
  const write = (rows, settle) => p.evaluate(async (o) => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    const svg = document.getElementById('mn-ink');
    const r = () => svg.getBoundingClientRect();
    const K = () => 1000 / r().width;
    const cx = u => r().left + u / K(), cy = u => r().top + u / K();
    const fire=(t,x,y)=>svg.dispatchEvent(new PointerEvent(t,{pointerId:9,pointerType:'pen',
      isPrimary:true,clientX:x,clientY:y,pressure:.5,bubbles:true,cancelable:true}));
    const pages = document.getElementById('mn-pages');
    for (const y of o.rows) {
      pages.scrollTop = Math.max(0, (y - 300) / K()); await w(120);
      fire('pointerdown', cx(340), cy(y));
      for (let i=1;i<=10;i++) fire('pointermove', cx(340+i*40), cy(y));
      fire('pointerup', cx(740), cy(y)); await w(150);
    }
    if (o.settle) await w(2000);
  }, { rows, settle });
  const read = () => p.evaluate(() => {
    const pk = k => 'pad_' + String(k||'').replace(/[^a-zA-Z0-9_/-]/g,'_');
    const rk = pk(window.__notesPanel.state().key);
    return { rk, ys: gannoGetStrokes(rk).map(s=>Math.round(s.points[0].y)),
             ink: document.getElementById('mn-ink').querySelectorAll('path').length,
             hasLog: localStorage.getItem('gsl:'+rk) !== null,
             hasBase: localStorage.getItem('gsk:'+rk) !== null };
  });

  // ---- 1. the exact sequence from her report
  await load(); await openPad();
  await write([238,558,878,1150], true);
  const R1 = await read();
  await load(); await openPad(); const R2 = await read();
  await load(); await openPad(); const R3 = await read();
  await write([398,718], false);
  const R4 = await read();
  await p.waitForTimeout(250);                  // refresh lands inside the save window
  await load(); await openPad(); const R5 = await read();
  // ---- 2. and it must not grow on every launch after that
  await load(); await openPad(); const R6 = await read();
  await load(); await openPad(); const R7 = await read();

  const same = (a,bb) => JSON.stringify(a) === JSON.stringify(bb);
  ok('four strokes are written and read back', same(R1.ys,[238,558,878,1150]), JSON.stringify(R1.ys));
  ok('a plain relaunch keeps them exactly', same(R2.ys,[238,558,878,1150]) && same(R3.ys,[238,558,878,1150]), JSON.stringify(R2.ys));
  ok('compaction clears the append log rather than leaving it behind', R2.hasBase && !R2.hasLog);
  ok('two more strokes make six', same(R4.ys,[238,558,878,1150,398,718]), JSON.stringify(R4.ys));
  ok('a refresh during the save window does NOT double the page', same(R5.ys,[238,558,878,1150,398,718]),
     JSON.stringify(R5.ys));
  ok('the ink on screen matches the ink in storage', R5.ink === 6, R5.ink + ' paths');
  ok('and it does not grow on the launches after that', same(R6.ys,R5.ys) && same(R7.ys,R5.ys),
     JSON.stringify(R6.ys) + ' / ' + JSON.stringify(R7.ys));

  // ---- 3. the safety net still works: a page localStorage really lost comes back
  const rescue = await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    const pk = k => 'pad_' + String(k||'').replace(/[^a-zA-Z0-9_/-]/g,'_');
    const rk = pk(window.__notesPanel.state().key);
    // the mirror rides every store save and lands ~2s later; nudge one and wait
    try { saveStore(); } catch(e){}
    for (let i = 0; i < 40 && !window.__fortress.inkMirroredAt; i++) {
      try { saveStore(); } catch(e){}
      await w(500);
    }
    const mirrored = !!window.__fortress.inkMirroredAt;
    const had = gannoGetStrokes(rk).length;
    // now wipe the page from localStorage the way a browser eviction would
    localStorage.removeItem('gsk:'+rk); localStorage.removeItem('gsl:'+rk);
    delete store.gannoStrokes[rk];
    return { forced: mirrored, had, gone: localStorage.getItem('gsk:'+rk) === null };
  });
  await load(); await openPad(); const R8 = await read();
  ok('a page localStorage genuinely lost is still restored from the backup',
     rescue.forced && rescue.gone && R8.ys.length === rescue.had, 
     rescue.forced ? ('had ' + rescue.had + ' -> back ' + R8.ys.length) : 'mirror not reachable');
  ok('and it comes back as itself, not doubled', same(R8.ys,[238,558,878,1150,398,718]), JSON.stringify(R8.ys));

  // ---- 4. the sweep clears ink already doubled - including the OLDEST damage,
  //         where the two copies differ in the second decimal because the page
  //         was packed before 18.437 started rounding coordinates
  const swept = await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    const pk = k => 'pad_' + String(k||'').replace(/[^a-zA-Z0-9_/-]/g,'_');
    const rk = pk(window.__notesPanel.state().key);
    const cur = gannoGetStrokes(rk);
    const clone = s => JSON.parse(JSON.stringify(s));
    const exact = clone(cur[0]);                       // a byte-identical copy
    const unrounded = clone(cur[1]);                   // the pre-18.437 shape:
    unrounded.points.forEach(q => { q.x += 0.04; q.y -= 0.03; });  // same stroke, unrounded
    const later = clone(cur[2]);                       // a real second stroke over the same
    later.ts = (later.ts || 0) + 4000;                 // words, four seconds later - must stay
    const moved = clone(cur[3]);                       // same instant, but somewhere else
    moved.points.forEach(q => { q.y += 40; });         // a whole ruled line away - must stay
    gannoSaveStrokes(rk, cur.concat([exact, unrounded, later, moved]));
    await w(300);
    const before = gannoGetStrokes(rk).length;
    store.inkDupSweep = 0; saveStore();                // let the repair run again
    await w(400);
    return { before };
  });
  await load(); await openPad(); const R9 = await read();
  ok('the sweep removes a byte-identical copy', R9.ys.length === swept.before - 2,
     swept.before + ' -> ' + R9.ys.length);
  ok('and the oldest damage, where the copies differ in the second decimal',
     R9.ys.length === 8, R9.ys.length + ' strokes left');
  ok('a real second stroke over the same words is kept', R9.ys.filter(y=>y===878).length >= 1);
  ok('so is one drawn the same instant but a line away', R9.ys.filter(y=>y===1190).length === 1,
     JSON.stringify(R9.ys));
  ok('the surviving strokes stay in the order she drew them',
     same(R9.ys.slice(0,6),[238,558,878,1150,398,718]), JSON.stringify(R9.ys));
  // ---- 5. she can run the repair herself, and be told what it found
  const manual = await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    const pk = k => 'pad_' + String(k||'').replace(/[^a-zA-Z0-9_/-]/g,'_');
    const rk = pk(window.__notesPanel.state().key);
    const o = {};
    o.exposed = typeof window.__inkRepair === 'function';
    if (!o.exposed) return o;
    o.cleanRun = window.__inkRepair();                    // nothing to fix right now
    const cur = gannoGetStrokes(rk);
    const dupe = JSON.parse(JSON.stringify(cur[0]));
    gannoSaveStrokes(rk, cur.concat([dupe])); await w(300);
    o.before = gannoGetStrokes(rk).length;
    o.fixRun = window.__inkRepair();
    if (store.gannoStrokes) delete store.gannoStrokes[rk];
    o.after = gannoGetStrokes(rk).length;
    // and the button is really in the menu
    o.hasButton = /data-act="repair-notes"/.test(document.documentElement.innerHTML) ||
                  (function(){ try { return String(window.__inkRepair).length > 0; } catch(e){ return false; } })();
    return o;
  });
  ok('the repair is reachable on demand', manual.exposed);
  ok('with nothing wrong it reports nothing removed',
     manual.cleanRun && manual.cleanRun.dropped === 0 && manual.cleanRun.pages >= 1,
     JSON.stringify(manual.cleanRun));
  ok('run against a doubled page it removes the copy and says so',
     manual.fixRun && manual.fixRun.dropped === 1 && manual.after === manual.before - 1,
     manual.before + ' -> ' + manual.after + ', reported ' + JSON.stringify(manual.fixRun));
  ok('no page errors', errs.length===0, errs.slice(0,2).join('|'));
  for (const f of F) console.log((f.pass?'PASS ':'FAIL ')+f.n+(f.x?'  '+f.x:''));
  console.log('inkdupe: '+F.filter(f=>f.pass).length+'/'+F.length+' passed');
  await b.close();
})().catch(e=>{ console.log('HARNESS '+e); process.exit(2); });
