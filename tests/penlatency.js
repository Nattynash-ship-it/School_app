// "The pencil and highlighter are delayed."
//
// Not the same as skipping: the ink arrives, it just arrives behind the nib.
// Three things, all measured:
//
//  1. The notebook sat inside backdrop-filter: blur(20px) saturate(150%) - and
//     its own background is OPAQUE in all 38 themes, so that blur could never
//     be seen. It was computed anyway, and a backdrop-filter over a large
//     fixed element makes every repaint inside it re-composite the blurred
//     region. The writing surface lives inside it.
//  2. The paper painted three stacked tint layers on every dirty rectangle the
//     pen made. --surface is opaque in 37 of the 38 themes, so in all of those
//     the stack composites to exactly its top layer.
//  3. Two or three frames of pipeline sit between the nib and the glass no
//     matter how fast the code is. The browser will say where the pen is about
//     to be; drawing that short tail closes the gap.
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
const THEMES = ['arcade','architect','aurora','boldstudy','brightblocks','butterfly','candy','cartoon',
 'cartoonpop','cosmic','crt','dark','deepfocus','deepfocusdark','deepocean','diner','editorial','field',
 'fireflies','gilded','glass','id','light','matcha','meadow','nebula','notebook','ocean','owl','phoenix',
 'plain','quest','questdark','rainfall','sakura','stickerbook','warmcalm','winter'];
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport:{width:834,height:1194}, deviceScaleFactor:2, hasTouch:true });
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(16000);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });   // about her iPad
  const R = await p.evaluate(async (THEMES) => {
    const w=ms=>new Promise(r=>setTimeout(r,ms)); const o={};
    go({name:'section',courseId:'C959',chId:'ch4',secId:'s1'}); await w(4000);
    window.__notesPanel.open(); await w(2600);
    window.__notesPanel.tab('write'); await w(900);
    const dock = document.getElementById('mn-dock');
    const svg = document.getElementById('mn-ink');
    const alphaOf = c => { const m=/rgba?\(([^)]+)\)/.exec(c); if(!m) return 1;
      const q=m[1].split(',').map(x=>parseFloat(x)); return q.length>3?q[3]:1; };

    // ---- 1 & 2: what the compositor is asked to do on every stroke
    const cs = getComputedStyle(dock);
    o.dockBlur = (cs.backdropFilter || cs.webkitBackdropFilter || 'none');
    o.dockTranslucent = [];
    o.paperStacked = [];
    for (const t of THEMES) {
      document.documentElement.setAttribute('data-theme', t); await w(12);
      if (alphaOf(getComputedStyle(dock).backgroundColor) < 0.995) o.dockTranslucent.push(t);
      const bi = getComputedStyle(svg).backgroundImage;
      if (bi && bi !== 'none') o.paperStacked.push(t);
    }
    document.documentElement.removeAttribute('data-theme'); await w(60);

    // ---- 3: prediction is drawn, never stored
    const r = () => svg.getBoundingClientRect();
    const K = () => 1000 / r().width;
    const cx = u => r().left + u / K(), cy = u => r().top + u / K();
    const mk = (type, x, y, predict) => {
      const ev = new PointerEvent(type, { pointerId:9, pointerType:'pen', isPrimary:true,
        clientX:x, clientY:y, pressure:.5, bubbles:true, cancelable:true });
      if (predict) Object.defineProperty(ev, 'getPredictedEvents', { value: () => predict });
      return ev;
    };
    const pk = k => 'pad_' + String(k||'').replace(/[^a-zA-Z0-9_/-]/g,'_');
    const S = () => gannoGetStrokes(pk(window.__notesPanel.state().key));
    const liveNodeNow = () => [...svg.querySelectorAll('path')].filter(n => n.getAttribute('fill') === 'none')[0];

    const n0 = S().length;
    svg.dispatchEvent(mk('pointerdown', cx(60), cy(400)));
    for (let i = 1; i <= 40; i++) svg.dispatchEvent(mk('pointermove', cx(60+i*6), cy(400)));
    o.segNoPredict = ((liveNodeNow()||{}).getAttribute ? liveNodeNow().getAttribute('d') : '').split(' L ').length - 1;
    // now a move that carries a 3-point prediction
    const pred3 = [ mk('pointermove', cx(60+41*6), cy(400)),
                    mk('pointermove', cx(60+42*6), cy(400)),
                    mk('pointermove', cx(60+43*6), cy(400)) ];
    svg.dispatchEvent(mk('pointermove', cx(60+41*6), cy(400), pred3));
    const dPred = liveNodeNow().getAttribute('d');
    o.segWithPredict = dPred.split(' L ').length - 1;
    // and one that offers eight - the tail must be capped
    const pred8 = [];
    for (let q = 0; q < 8; q++) pred8.push(mk('pointermove', cx(60+(44+q)*6), cy(400)));
    svg.dispatchEvent(mk('pointermove', cx(60+42*6), cy(400), pred8));
    o.segWithBigPredict = liveNodeNow().getAttribute('d').split(' L ').length - 1;
    o.confirmedNow = (function(){ return null; })();
    svg.dispatchEvent(mk('pointerup', cx(60+42*6), cy(400)));
    await w(300);
    const st = S();
    o.strokeAdded = st.length - n0;
    const saved = st[st.length-1];
    o.savedPoints = saved.points.length;
    // no saved point may sit past where the pen actually was
    const lastX = Math.max.apply(null, saved.points.map(q=>q.x));
    o.penMaxX = Math.round(( (60+42*6) - r().left ) * K());
    o.savedMaxX = Math.round(lastX);
    o.predictionNotStored = o.savedMaxX <= o.penMaxX + 2;

    // ---- how the frames actually land while drawing
    const frames = [];
    await new Promise(resolve => {
      let i = 0, prev = performance.now();
      svg.dispatchEvent(mk('pointerdown', cx(40), cy(700)));
      const step = (now) => {
        frames.push(now - prev); prev = now;
        for (let k = 0; k < 4; k++) { i++; svg.dispatchEvent(mk('pointermove', cx(40+i*2), cy(700+Math.sin(i/9)*20))); }
        if (i < 400) requestAnimationFrame(step);
        else { svg.dispatchEvent(mk('pointerup', cx(40+i*2), cy(700))); resolve(); }
      };
      requestAnimationFrame(step);
    });
    frames.shift();
    const sorted = frames.slice().sort((a,bb)=>a-bb);
    o.medianFrameMs = Math.round(sorted[Math.floor(sorted.length/2)]*10)/10;
    o.droppedFrames = frames.filter(f => f > 25).length;
    o.totalFrames = frames.length;
    return o;
  }, THEMES);
  ok('the notebook no longer computes a blur nothing can see', R.dockBlur === 'none', R.dockBlur);
  ok('and nothing was lost: its background is opaque in all 38 themes',
     R.dockTranslucent.length === 0, R.dockTranslucent.join(',') || 'all opaque');
  ok('the paper is one painted colour, not three stacked layers',
     R.paperStacked.length === 1 && R.paperStacked[0] === 'glass',
     'stacked only in: ' + (R.paperStacked.join(',') || 'none'));
  ok('a move with no prediction draws only what she drew', R.segNoPredict === 40, R.segNoPredict + ' segments');
  ok('a 3-point prediction draws 3 segments ahead of the nib',
     R.segWithPredict === R.segNoPredict + 1 + 3, R.segNoPredict + ' -> ' + R.segWithPredict);
  ok('the tail is capped so a sharp turn cannot flick out a spur',
     R.segWithBigPredict <= R.segNoPredict + 2 + 4, R.segWithBigPredict + ' segments with 8 offered');
  ok('the stroke is still committed', R.strokeAdded === 1, R.strokeAdded);
  ok('not one predicted point is saved into her ink', R.predictionNotStored,
     'pen reached ' + R.penMaxX + ', saved ink ends at ' + R.savedMaxX);
  ok('every point she actually drew is kept', R.savedPoints >= 40, R.savedPoints + ' points');
  ok('drawing holds the frame rate', R.medianFrameMs <= 18 && R.droppedFrames <= 3,
     'median ' + R.medianFrameMs + 'ms, ' + R.droppedFrames + ' dropped of ' + R.totalFrames);
  ok('no page errors', errs.length===0, errs.slice(0,2).join('|'));
  for (const f of F) console.log((f.pass?'PASS ':'FAIL ')+f.n+(f.x?'  '+f.x:''));
  console.log('penlatency: '+F.filter(f=>f.pass).length+'/'+F.length+' passed');
  await b.close();
})().catch(e=>{ console.log('HARNESS '+e); process.exit(2); });
