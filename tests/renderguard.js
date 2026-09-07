// "Please fix the notes... they get distorted when there's a new update."
//
// Her flight recorder named it. Two stalls, the same shape both times:
//   stall 988ms - 8 gannoRender calls, 94-123ms each
//   stall 708ms - 8 gannoRender calls, 98-137ms each, page holding 205 strokes
//
// Opening a lesson fires six re-renders (now, 120, 400, 900, 1800, 3000ms)
// because injected study blocks settle after first paint. Each rebuilt EVERY
// stroke. Reproduced at a quarter of this machine's speed: ONE navigation,
// 16 renders, 1892ms of blocked main thread, on top of an iPad already
// reloading the app under memory pressure every few minutes.
//
// A pass whose inputs have not moved now costs nothing.
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport:{width:1194,height:834}, hasTouch:true });
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(16000);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const R = await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms)); const o={};
    go({name:'section',courseId:'C959',chId:'ch4',secId:'s1'}); await w(4000);
    gannoSetActive(true); await w(600);
    // her page: 205 strokes
    const mk = n => { const a=[]; for (let i=0;i<n;i++){ const pts=[]; const y=300+(i%40)*26;
      for (let k=0;k<28;k++) pts.push({x:120+(i%5)*140+k*4, y:y+Math.sin(k/4)*5, p:.5});
      a.push({type:i%4===0?'highlighter':'pen',color:'#ffe45c',width:i%4===0?8:2,points:pts,
              ts:Date.now()-i*900,_ts:Date.now()-i*900}); } return a; };
    gannoSaveStrokes(ganno.routeKey, mk(205)); await w(500);
    let calls=0, total=0;
    const orig = window.gannoRender;
    window.gannoRender = function(){ const t=performance.now(); const v=orig.apply(this,arguments);
      calls++; total += performance.now()-t; return v; };
    const count = async (fn, settle) => { calls=0; total=0; await fn(); await w(settle);
      return { n: calls, ms: Math.round(total) }; };

    o.nav = await count(async () => {
      go({name:'section',courseId:'C959',chId:'ch4',secId:'s2'}); await w(900);
      go({name:'section',courseId:'C959',chId:'ch4',secId:'s1'});
    }, 4200);
    // settle passes over a page that has stopped moving
    o.idleSettle = await count(async () => {
      for (let i=0;i<6;i++) { window.gannoOnResize(); await w(120); }
    }, 400);
    o.openNotes  = await count(async () => { window.__notesPanel.open(); }, 2000);
    o.closeNotes = await count(async () => { window.__notesPanel.close(); }, 2000);
    // ink that actually changed MUST be redrawn
    o.inkChanged = await count(async () => {
      gannoSaveStrokes(ganno.routeKey, mk(206));
      window.gannoOnResize();
    }, 400);
    // and so must a real layout change
    o.themeChanged = await count(async () => {
      document.documentElement.setAttribute('data-theme','light');
      window.gannoOnResize();
    }, 400);
    document.documentElement.removeAttribute('data-theme');
    // the ink is still all there and still on the page after all that
    await w(400);
    window.gannoRender = orig;
    window.gannoOnResize(); await w(600);
    o.strokesKept = gannoGetStrokes(ganno.routeKey).length;
    o.drawn = ganno.svg.querySelectorAll('path').length +
              document.querySelectorAll('.ganno-hl-layer svg.ganno-hl').length;
    return o;
  });
  ok('a settle pass over a page that has not moved costs nothing',
     R.idleSettle.n === 0, R.idleSettle.n + ' renders, ' + R.idleSettle.ms + 'ms');
  ok('opening the notes redraws nothing', R.openNotes.n === 0, R.openNotes.n + ' renders, ' + R.openNotes.ms + 'ms');
  ok('closing the notes redraws nothing', R.closeNotes.n === 0, R.closeNotes.n + ' renders, ' + R.closeNotes.ms + 'ms');
  ok('ink that changed IS redrawn', R.inkChanged.n >= 1, R.inkChanged.n + ' renders');
  ok('a theme change IS redrawn', R.themeChanged.n >= 1, R.themeChanged.n + ' renders');
  ok('two navigations no longer cost two seconds of frozen screen',
     R.nav.ms <= 1100, R.nav.n + ' renders, ' + R.nav.ms + 'ms (was 16 / 1892ms)');
  ok('every stroke is still there', R.strokesKept === 206, R.strokesKept);
  ok('and still drawn on the page', R.drawn >= 200, R.drawn + ' painted');
  ok('no page errors', errs.length===0, errs.slice(0,2).join('|'));
  for (const f of F) console.log((f.pass?'PASS ':'FAIL ')+f.n+(f.x?'  '+f.x:''));
  console.log('renderguard: '+F.filter(f=>f.pass).length+'/'+F.length+' passed');
  await b.close();
})().catch(e=>{ console.log('HARNESS '+e); process.exit(2); });
