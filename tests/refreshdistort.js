// "fix the notes issue where when refreshed the notes become distorted"
// A page like hers - 200 mixed pen + highlighter strokes, saved - then FIVE
// plain refreshes. Stroke count AND every stroke's on-screen position must be
// identical after each one.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport:{width:834,height:1194}, hasTouch:true });
  const p = await ctx.newPage();
  const load = async () => { await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000}); await p.waitForTimeout(16000); };
  const openPad = () => p.evaluate(async () => { const w=ms=>new Promise(r=>setTimeout(r,ms));
    go({name:'section',courseId:'C959',chId:'ch4',secId:'s1'}); await w(2400);
    window.__notesPanel.open(); await w(1600); window.__notesPanel.tab('write'); await w(600); });
  const snap = () => p.evaluate(() => {
    const pk = k => 'pad_' + String(k||'').replace(/[^a-zA-Z0-9_/-]/g,'_');
    const rk = pk(window.__notesPanel.state().key);
    const S = gannoGetStrokes(rk);
    const svg = document.getElementById('mn-ink');
    const paths = [...svg.querySelectorAll('path')].filter(n => !n.classList.contains('mn-rules'));
    // a fingerprint of WHERE everything is drawn, in page units
    const fp = paths.map(n => { try { const bb = n.getBBox(); return Math.round(bb.x)+','+Math.round(bb.y)+','+Math.round(bb.width)+','+Math.round(bb.height); } catch(e){ return '?'; } }).sort().join('|');
    return { n: S.length, painted: paths.length, hl: S.filter(s=>s.type==='hl').length,
             fpHash: fp.length + ':' + [...fp].reduce((h,c)=>(h*31+c.charCodeAt(0))>>>0, 7) };
  });
  await load(); await openPad();
  await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    const svg = document.getElementById('mn-ink'); const r=()=>svg.getBoundingClientRect(); const K=()=>1000/r().width;
    const cx=u=>r().left+u/K(), cy=u=>r().top+u/K();
    const fire=(t,x,y)=>svg.dispatchEvent(new PointerEvent(t,{pointerId:9,pointerType:'pen',isPrimary:true,clientX:x,clientY:y,pressure:.5,bubbles:true,cancelable:true}));
    const tap = t => document.querySelector('#mn-tools .mn-tool[data-t="'+t+'"]').click();
    const pages = document.getElementById('mn-pages');
    for (let i=0;i<200;i++){
      tap(i%5===0 ? 'hl' : 'pen');
      const y = 160 + (i%26)*40 + (i%3)*6; pages.scrollTop = Math.max(0,(y-300)/K()); await w(8);
      fire('pointerdown', cx(60+(i%4)*200), cy(y));
      for (let k=1;k<=6;k++) fire('pointermove', cx(60+(i%4)*200+k*25), cy(y+Math.sin(k)*3));
      fire('pointerup', cx(60+(i%4)*200+150), cy(y));
    }
    await w(2500);
  });
  const base = await snap();
  const out = [ { tag:'written', ...base } ];
  for (let i=1;i<=5;i++){ await load(); await openPad(); out.push({ tag:'refresh #'+i, ...(await snap()) }); }
  out.forEach(o => console.log(o.tag.padEnd(12), 'strokes='+o.n, 'highlighter='+o.hl, 'painted='+o.painted, 'positions='+o.fpHash));
  const same = out.every(o => o.n===base.n && o.fpHash===base.fpHash);
  console.log(same ? 'RESULT: identical after every refresh' : 'RESULT: CHANGED');
  await b.close();
})().catch(e=>{console.log('ERR '+e);process.exit(2);});
