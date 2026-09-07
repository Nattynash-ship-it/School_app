// "The pencil is also skipping as I write in the notes."
//
// The finished stroke is a pressure-shaped OUTLINE: two corner-cutting passes
// (four times the points), a per-point width pass that SORTS the spacings, and
// a filled path built from all of it. That was rebuilt from scratch on every
// single point, so one more point cost more the longer the word got.
//
// Measured at a quarter of this machine's speed, about her iPad:
//     50 pts 0.92ms   150 pts 3.04ms   300 pts 4.73ms   400 pts 5.23ms
// A 120Hz Pencil gives 8.3ms per frame for everything.
//
// The pen now draws a plain polyline while it is down - one segment appended
// per point - and the real outline is built ONCE, on pen-up. This asserts the
// mechanism (how many times the expensive builder runs, and what is actually
// in the DOM), not a wall-clock number that would be flaky.
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport:{width:834,height:1194}, hasTouch:true });
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(16000);
  const R = await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms)); const o={};
    go({name:'section',courseId:'C959',chId:'ch4',secId:'s1'}); await w(2400);
    window.__notesPanel.open(); await w(1600);
    window.__notesPanel.tab('write'); await w(600);
    const svg = document.getElementById('mn-ink');
    const r = () => svg.getBoundingClientRect();
    const K = () => 1000 / r().width;
    const cx = u => r().left + u / K(), cy = u => r().top + u / K();
    const fire=(t,x,y)=>svg.dispatchEvent(new PointerEvent(t,{pointerId:9,pointerType:'pen',
      isPrimary:true,clientX:x,clientY:y,pressure:.5,bubbles:true,cancelable:true}));
    const pk = k => 'pad_' + String(k||'').replace(/[^a-zA-Z0-9_/-]/g,'_');
    const S = () => gannoGetStrokes(pk(window.__notesPanel.state().key));
    const live = () => [...svg.querySelectorAll('path')].filter(n => n.getAttribute('fill') === 'none' && !n.classList.contains('mn-hl'));

    // count every build of the expensive outline
    let outlineCalls = 0;
    const origOutline = window.__INK.outline;
    window.__INK.outline = function(){ outlineCalls++; return origOutline.apply(this, arguments); };

    // ---- one long stroke, watched while it is still under the pen
    const N = 300;
    outlineCalls = 0;
    fire('pointerdown', cx(60), cy(300));
    o.dAt1 = (live()[0] || {}).getAttribute ? live()[0].getAttribute('d') : null;
    for (let i = 1; i <= N; i++) fire('pointermove', cx(60+i*2.6), cy(300 + Math.sin(i/7)*18));
    o.outlineDuringStroke = outlineCalls;
    const el = live()[0];
    o.liveFill = el ? el.getAttribute('fill') : null;
    o.liveD = el ? el.getAttribute('d') : '';
    o.liveIsPolyline = /^M [\d.-]+ [\d.-]+( L [\d.-]+ [\d.-]+)+$/.test(o.liveD);
    o.liveSegments = (o.liveD.match(/ L /g) || []).length;
    o.liveWidth = el ? el.getAttribute('stroke-width') : null;
    fire('pointerup', cx(60+N*2.6), cy(300));
    await w(250);
    o.outlineTotal = outlineCalls;

    // ---- what got committed is the real, smoothed, pressure-shaped ink
    const st = S();
    o.strokeN = st.length;
    o.pointsKept = st[st.length-1].points.length;
    const fin = [...svg.querySelectorAll('path')].filter(n => !n.classList.contains('mn-rules'));
    o.finalPaths = fin.length;
    o.finalFilled = fin.filter(n => { const f = n.getAttribute('fill'); return f && f !== 'none'; }).length;
    o.finalHasCurves = fin.some(n => /[CQZ]/i.test(n.getAttribute('d') || ''));

    // ---- per-point cost must not grow with the length of the word
    const timeRun = (y0, n) => {
      const t = [];
      fire('pointerdown', cx(60), cy(y0));
      for (let i = 1; i <= n; i++) {
        const t0 = performance.now();
        fire('pointermove', cx(60+i*2.6), cy(y0 + Math.sin(i/7)*18));
        t.push(performance.now() - t0);
      }
      fire('pointerup', cx(60+n*2.6), cy(y0));
      return t;
    };
    const t = timeRun(600, 400);
    const avg = (a,bb) => { const s=t.slice(a,bb); return s.reduce((x,y)=>x+y,0)/s.length; };
    const early = avg(10,60), late = avg(340,390);
    o.early = Math.round(early*1000)/1000;
    o.late = Math.round(late*1000)/1000;
    o.growth = Math.round((late / Math.max(early, 0.0001)) * 100) / 100;

    // ---- the highlighter previews the same cheap way, and commits as a band
    document.querySelector('#mn-tools .mn-tool[data-t="hl"]').click(); await w(200);
    outlineCalls = 0;
    fire('pointerdown', cx(60), cy(900));
    for (let i = 1; i <= 60; i++) fire('pointermove', cx(60+i*8), cy(900));
    const hlLive = svg.querySelector('path.mn-hl');
    o.hlLiveIsPolyline = !!hlLive && /^M [\d.-]+ [\d.-]+( L [\d.-]+ [\d.-]+)+$/.test(hlLive.getAttribute('d'));
    fire('pointerup', cx(540), cy(900)); await w(250);
    o.hlOutlineCalls = outlineCalls;     // a highlighter never needs the outline at all
    o.hlBandsAfter = document.querySelectorAll('.ganno-hl-layer svg.ganno-hl, #mn-ink path.mn-hl').length;

    // ---- a rest of the hand is still not a mark
    document.querySelector('#mn-tools .mn-tool[data-t="pen"]').click(); await w(150);
    const before = S().length;
    fire('pointerdown', cx(400), cy(1000));
    fire('pointerup', cx(400), cy(1000));
    await w(200);
    o.dotIgnored = S().length === before;
    return o;
  });
  ok('the in-flight stroke is a plain polyline, not a rebuilt outline', R.liveIsPolyline && R.liveFill === 'none',
     R.liveD.slice(0,40) + '…');
  ok('it grows by one segment per point', R.liveSegments >= 250 && R.liveSegments <= 300, R.liveSegments + ' segments');
  ok('it is drawn at the pen width', parseFloat(R.liveWidth) > 0, R.liveWidth);
  ok('the expensive outline is NEVER built while the pen is down', R.outlineDuringStroke === 0,
     R.outlineDuringStroke + ' builds during 300 points');
  ok('it is built once, on pen-up', R.outlineTotal === 1, R.outlineTotal + ' build(s) for the whole stroke');
  ok('the committed ink is the real pressure-shaped outline', R.finalFilled >= 1 && R.finalHasCurves,
     R.finalFilled + ' filled of ' + R.finalPaths);
  ok('every point she drew is kept', R.pointsKept >= 250, R.pointsKept + ' points');
  // supporting evidence; the build count above is the real guard. Reverting the
  // fix measures 6.59x here, so the threshold catches it without being flaky at
  // the sub-millisecond numbers the fixed path produces.
  ok('the cost per point does not grow with the length of the word', R.growth <= 3.5,
     R.early + 'ms early vs ' + R.late + 'ms late = ' + R.growth + 'x');
  ok('the highlighter previews the same cheap way', R.hlLiveIsPolyline);
  ok('and never builds an outline at all', R.hlOutlineCalls === 0, R.hlOutlineCalls + ' builds');
  ok('the highlighter band is still there after the pen lifts', R.hlBandsAfter >= 1, R.hlBandsAfter);
  ok('a rest of the hand is still not a mark', R.dotIgnored);
  ok('no page errors', errs.length===0, errs.slice(0,2).join('|'));
  for (const f of F) console.log((f.pass?'PASS ':'FAIL ')+f.n+(f.x?'  '+f.x:''));
  console.log('penperf: '+F.filter(f=>f.pass).length+'/'+F.length+' passed');
  await b.close();
})().catch(e=>{ console.log('HARNESS '+e); process.exit(2); });
