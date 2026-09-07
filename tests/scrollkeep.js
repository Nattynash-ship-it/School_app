// "when I open the notes the page isn't where I left it and when I close the
//  notes it isn't where it's supposed to be"
//
// Opening the notebook can RE-WRAP the lesson: the column narrows on a squeeze
// (measured: the paragraph she was reading dropped 391px down the screen), and
// Full width switches off to make room for the panel (another 208px - and that
// one does not come back when the panel closes). A re-wrap moves every
// paragraph, so the scroll offset she left behind points at different words.
//
// The fix keeps the WORDS, not the offset. This measures the block that was on
// the reading line and asserts it is still there after the panel opens, and
// again after it closes - in every placement the notebook has - and that the
// correction gives up the moment she scrolls herself.
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
const CASES = [
  { n:'side',    vp:{width:1194,height:834} },
  { n:'squeeze', vp:{width:1194,height:834}, sideW:600 },
  { n:'wide',    vp:{width:1194,height:834}, wide:true },
  { n:'bottom',  vp:{width:834,height:1194} },
];
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const errs=[]; const out={};
  for (const c of CASES) {
    const ctx = await b.newContext({ viewport:c.vp, hasTouch:true });
    const p = await ctx.newPage();
    p.on('pageerror',e=>errs.push(c.n+': '+e));
    await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
    await p.waitForTimeout(16000);
    out[c.n] = await p.evaluate(async (c) => {
      const w=ms=>new Promise(r=>setTimeout(r,ms)); const o={};
      go({name:'section',courseId:'C959',chId:'ch4',secId:'s1'}); await w(2400);
      if (c.sideW){ if(!store.padPrefs) store.padPrefs={}; store.padPrefs.sideW=c.sideW; saveStore(); }
      if (c.wide){ store.wideMode = true; document.body.classList.add('wide-mode'); saveStore();
                   window.dispatchEvent(new Event('resize')); await w(700); }
      const maxY = () => Math.round(document.documentElement.scrollHeight - innerHeight);
      window.scrollTo(0, Math.round(maxY()*0.5)); await w(900);
      /* The block on the reading line - the thing her eye is actually on. That
         IS the guarantee: a re-wrap moves paragraphs relative to each other, so
         nothing can hold two different ones still at once; what must not move
         is the one she is reading. Same rule the app uses, stated here so the
         assertion is about the promise and not about the code. */
      const aim = innerHeight * 0.35;
      let lm=null, bd=1e9;
      for (const el of document.querySelectorAll('#app .app h1, #app .app h2, #app .app h3, #app .app h4, #app .app p, #app .app li, #app .app blockquote, #app .app pre')){
        if ((el.textContent||'').trim().length < 12) continue;
        const r=el.getBoundingClientRect(); if(!r.height || r.bottom < aim) continue;
        const d=Math.max(0, r.top - aim);
        if (d<bd){bd=d; lm=el;}
        if (bd===0) break;
      }
      o.landmarkTag = lm.tagName;
      o.landmarkLen = (lm.textContent||'').trim().length;
      o.landmark = (lm.textContent||'').trim().slice(0,44);
      const at = () => Math.round(lm.getBoundingClientRect().top);
      o.startTop = at();
      o.startColW = Math.round(document.querySelector('#app > .app').getBoundingClientRect().width);

      window.__notesPanel.open(); await w(2400);
      o.side = window.__notesPanel.state().side;
      o.squeezed = document.body.classList.contains('mn-squeeze');
      o.openTop = at();
      o.openColW = Math.round(document.querySelector('#app > .app').getBoundingClientRect().width);
      o.reflowedOnOpen = o.openColW !== o.startColW;

      window.__notesPanel.close(); await w(2400);
      o.closeTop = at();
      o.closeColW = Math.round(document.querySelector('#app > .app').getBoundingClientRect().width);

      // she scrolls herself right after opening: the correction must let go
      window.scrollTo(0, Math.round(maxY()*0.5)); await w(800);
      window.__notesPanel.open();
      await w(60);
      // her thumb, mid-settle - a real gesture, which is what tells the
      // correction to let go (a bare scrollBy is not one)
      window.dispatchEvent(new WheelEvent('wheel', {deltaY: 600, bubbles: true, cancelable: true}));
      // instant, so what is measured is the correction and not a smooth scroll
      // still travelling when the tape measure comes out
      const de = document.documentElement, prev = de.style.scrollBehavior;
      de.style.scrollBehavior = 'auto';
      window.scrollBy(0, 600);
      de.style.scrollBehavior = prev;
      const mine = Math.round(window.scrollY);
      await w(2200);
      o.hersKept = Math.abs(window.scrollY - mine) <= 4;
      o.hersDrift = Math.round(window.scrollY - mine);
      window.__notesPanel.close(); await w(1200);

      /* And a scroll the APP makes just after the notebook closes must stand.
         An earlier version held on for a whole second and quietly undid a
         scrollIntoView that landed inside that window - caught by the lesson
         pen suite, which could no longer get a paragraph on screen. */
      window.scrollTo(0, Math.round(maxY()*0.5)); await w(800);
      window.__notesPanel.open(); await w(1600);
      window.__notesPanel.close(); await w(500);
      const far = [...document.querySelectorAll('#app .app p')].filter(e=>(e.textContent||'').trim().length>80).pop();
      far.scrollIntoView({ block: 'center' });
      await w(1400);
      const fr = far.getBoundingClientRect();
      o.appScrollStood = fr.top > 60 && fr.top < innerHeight - 60;
      o.appScrollTop = Math.round(fr.top);
      return o;
    }, c);
    await ctx.close();
  }
  for (const c of CASES) {
    const r = out[c.n];
    const dOpen = Math.abs(r.openTop - r.startTop);
    const dClose = Math.abs(r.closeTop - r.startTop);
    ok('['+c.n+'] the landmark is a real block of reading, not a fragment',
       !!r.landmark && r.landmarkLen >= 12 && r.landmarkTag !== 'TD',
       r.landmarkTag + ' ' + r.landmarkLen + ' chars: ' + r.landmark);
    ok('['+c.n+'] her place is kept when the notes open', dOpen<=4, 'moved '+dOpen+'px'
       + (r.reflowedOnOpen ? '  (column '+r.startColW+'→'+r.openColW+', a real re-wrap)' : ''));
    ok('['+c.n+'] her place is kept when the notes close', dClose<=4, 'moved '+dClose+'px');
    ok('['+c.n+'] her own scroll is never yanked back', r.hersKept, 'drift '+r.hersDrift+'px');
    ok('['+c.n+"] a scroll the app makes after closing still stands", r.appScrollStood,
       'scrollIntoView landed at '+r.appScrollTop+'px');
  }
  ok('the squeeze case really does re-wrap (not a vacuous pass)', out.squeeze.reflowedOnOpen,
     'column '+out.squeeze.startColW+'→'+out.squeeze.openColW);
  ok('the full-width case really does re-wrap (not a vacuous pass)', out.wide.reflowedOnOpen,
     'column '+out.wide.startColW+'→'+out.wide.openColW);
  ok('no page errors', errs.length===0, errs.slice(0,2).join('|'));
  for (const f of F) console.log((f.pass?'PASS ':'FAIL ')+f.n+(f.x?'  '+f.x:''));
  console.log('scrollkeep: '+F.filter(f=>f.pass).length+'/'+F.length+' passed');
  await b.close();
})().catch(e=>{ console.log('HARNESS '+e); process.exit(2); });
