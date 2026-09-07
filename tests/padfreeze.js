// "My notes are distorted": a stroke drawn while the pad was still gliding had
// the scroll baked into it - 133 units at writing zoom, over three ruled lines
// - and persist() saved the deformed points, so it looked identical forever.
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport:{width:1194,height:834}, deviceScaleFactor:2, hasTouch:true });
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(15000);
  const R = await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms)); const o={};
    go({name:'section',courseId:'C959',chId:'ch4',secId:'s1'}); await w(1500);
    window.__notesPanel.open(); await w(900);
    window.__notesPanel.tab('write'); await w(400);
    const svg=document.getElementById('mn-ink'), pages=document.getElementById('mn-pages');
    const pen=(t,x,y)=>svg.dispatchEvent(new PointerEvent(t,{pointerId:9,pointerType:'pen',isPrimary:true,clientX:x,clientY:y,pressure:.5,bubbles:true,cancelable:true}));
    const ink=()=>[...svg.querySelectorAll('path')].filter(el=>!el.closest('g.mn-rules'));
    const spread=el=>Math.round(el.getBBox().height);   // exact, in page units
    pages.scrollTop = 0; await w(250);

    // a flat stroke with the pad still - the control
    let r=svg.getBoundingClientRect();
    pen('pointerdown', r.left+120, r.top+400);
    for(let i=1;i<=6;i++) pen('pointermove', r.left+120+i*15, r.top+400);
    pen('pointerup', r.left+210, r.top+400); await w(150);
    o.stillSpread = spread(ink()[ink().length-1]);

    // the same flat stroke while the pad is scrolled hard underneath it
    const before = pages.scrollTop;
    r=svg.getBoundingClientRect();
    pen('pointerdown', r.left+120, r.top+520);
    pen('pointermove', r.left+135, r.top+520);
    pages.scrollTop = before + 120;                 // the paper tries to move
    await w(60);
    o.frozenDuringStroke = getComputedStyle(pages).overflowY === 'hidden'
                        && getComputedStyle(pages).overflowX === 'hidden';
    for(let i=3;i<=6;i++) pen('pointermove', r.left+120+i*15, r.top+520);
    pen('pointerup', r.left+210, r.top+520); await w(200);
    o.scrolledSpread = spread(ink()[ink().length-1]);
    o.extraSpread = o.scrolledSpread - o.stillSpread;

    // the pad must scroll normally again once the pen is up
    const at = pages.scrollTop;
    pages.scrollTop = at + 200; await w(120);
    o.scrollsAfterStroke = pages.scrollTop > at;
    o.overflowRestored = getComputedStyle(pages).overflowY !== 'hidden';
    return o;
  });
  ok('a still stroke stays flat', R.stillSpread <= 12, R.stillSpread);
  ok('the scroller is frozen while the pen is down', R.frozenDuringStroke);
  ok('a scroll during the stroke adds no displacement', Math.abs(R.extraSpread) <= 12, 'extra '+R.extraSpread+' units');
  ok('the pad scrolls again after the stroke', R.scrollsAfterStroke);
  ok('overflow restored, not left hidden', R.overflowRestored);
  ok('no page errors', errs.length===0, errs.join('|'));
  for (const f of F) console.log((f.pass?'PASS ':'FAIL ')+f.n+(f.x?'  '+f.x:''));
  console.log('padfreeze: '+F.filter(f=>f.pass).length+'/'+F.length+' passed');
  await b.close();
})().catch(e=>{ console.log('HARNESS '+e); process.exit(2); });
