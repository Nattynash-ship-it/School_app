// "When I open the notes the highlights become distorted as well."
//
// Opening the notes panel in side mode slides #app left by --mn-shift (183px
// on her landscape iPad) with NO reflow. The annotation ink does not live
// inside #app: the pen overlay (.ganno-svg) and the highlight layer
// (.ganno-hl-layer, where every blended highlighter stroke gets its own tiny
// svg) are both children of <body>, pinned at left:0. So the words moved and
// the marks did not.
//
// This asserts the invariant that matters to her: the horizontal gap between
// a mark and the text it was drawn on does not change when the panel opens or
// closes - measured on real rendered ink, for a pen stroke, a freehand
// highlighter, and a text-anchored highlighter. It also asserts the shift is
// genuinely happening, so a no-op panel can never make this pass vacuously.
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport:{width:1194,height:834}, hasTouch:true });
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(16000);
  const R = await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms)); const o={};
    go({name:'section',courseId:'C959',chId:'ch4',secId:'s1'}); await w(2200);

    // pen mode on, so the overlay is displayed and measurable
    gannoSetActive(true); await w(400);
    o.routeKey = ganno.routeKey || '';

    // a paragraph of real lesson prose, long enough to swipe across
    const para = [...document.querySelectorAll('.lesson p')].filter(el => (el.textContent||'').trim().length > 80)[0];
    if (!para) { o.fatal = 'no lesson paragraph'; return o; }
    const tn = (function find(n){ if (n.nodeType===3 && (n.nodeValue||'').trim().length>40) return n;
      for (const c of n.childNodes){ const r=find(c); if (r) return r; } return null; })(para);
    if (!tn) { o.fatal = 'no text node'; return o; }

    const frame = window.__gannoGetOverlayFrame();
    if (!frame) { o.fatal = 'no overlay frame'; return o; }
    const toOv = r => window.__gannoRectToOverlay(r, frame);

    // ---- stroke 1: a pen mark under the first line of the paragraph
    const lineR = para.getClientRects()[0];
    const ov = toOv(lineR);
    const midY = ov.y + ov.h * 0.6;
    const pen = { type:'pen', color:'#e64980', width:3,
      points:[{x:ov.x+6,y:midY,p:.6},{x:ov.x+ov.w*0.5,y:midY,p:.6},{x:ov.x+ov.w-6,y:midY,p:.6}] };

    // ---- stroke 2: a freehand highlighter over the same line (no text anchor)
    const hl = { type:'highlighter', color:'#ffe066', width:8,
      points:[{x:ov.x+6,y:ov.y+ov.h*0.5,p:.6},{x:ov.x+ov.w*0.5,y:ov.y+ov.h*0.5,p:.6},{x:ov.x+ov.w-6,y:ov.y+ov.h*0.5,p:.6}] };

    // ---- stroke 3: a text-anchored highlighter, pinned to actual words
    const rng = document.createRange();
    rng.setStart(tn, 0); rng.setEnd(tn, Math.min(30, (tn.nodeValue||'').length));
    const anchor = window.__gannoTextHL && window.__gannoTextHL.serializeRange(rng);
    o.gotAnchor = !!anchor;
    const rr = toOv(rng.getClientRects()[0]);
    const thl = { type:'highlighter', color:'#63e6be', width:8, textHL: anchor,
      points:[{x:rr.x+2,y:rr.y+rr.h*0.5,p:.6},{x:rr.x+rr.w-2,y:rr.y+rr.h*0.5,p:.6}] };

    // ---- stroke 4: a pen mark carrying the layout anchor real ink records at
    // draw time. gannoReanchor compensates this one WHILE the panel is open,
    // so it looks fine there - and then lands 183px off once the panel closes,
    // because nothing re-renders it back. That stuck-wrong state is the one
    // that survives and is what a saved page looks like on reopen.
    const anch = gannoGetAnchor();
    const penA = { type:'pen', color:'#4c6ef5', width:3, anchor: anch,
      points:[{x:ov.x+6,y:ov.y+ov.h*0.85,p:.6},{x:ov.x+ov.w*0.5,y:ov.y+ov.h*0.85,p:.6},{x:ov.x+ov.w-6,y:ov.y+ov.h*0.85,p:.6}] };
    o.gotLayoutAnchor = !!anch;

    gannoSaveStrokes(ganno.routeKey, [pen, hl, thl, penA]);
    gannoRender(gannoGetStrokes(ganno.routeKey), null);
    await w(400);

    const svg = ganno.svg;
    const layer = () => document.querySelector('.ganno-hl-layer');
    o.hlLayerExists = !!layer();
    o.hlLayerIsBodyChild = !!(layer() && layer().parentNode === svg.parentNode);

    // measure in VIEWPORT coords - what her eye actually compares
    const marks = () => {
      // strokes are re-ided 1..n in list order on every render, so these
      // handles survive the re-render the panel triggers
      const l = layer();
      return {
        pen:  svg.querySelector('path[data-gid="1"]'),
        hlA:  l ? l.querySelector('svg.ganno-hl[data-gid-wrap="2"]') : null,
        hlB:  l ? l.querySelector('svg.ganno-hl[data-gid-wrap="3"]') : null,
        penA: svg.querySelector('path[data-gid="4"]'),
      };
    };
    const m0 = marks();
    o.penDrawn = !!m0.pen;
    o.hlCount = layer() ? layer().querySelectorAll('svg.ganno-hl').length : 0;
    if (!m0.pen || !m0.penA || o.hlCount < 2) { o.fatal = 'ink did not render (pen=' + !!m0.pen + ' penA=' + !!m0.penA + ' hl=' + o.hlCount + ')'; return o; }

    // gap between each mark and the words it sits on
    const gaps = () => {
      const t = para.getBoundingClientRect(); const m = marks(); const g = {};
      for (const k of ['pen','hlA','hlB','penA']) {
        const el = m[k]; if (!el) { g[k] = null; continue; }
        const r = el.getBoundingClientRect();
        g[k] = Math.round((r.left - t.left) * 10) / 10;
      }
      g.textLeft = Math.round(t.left * 10) / 10;
      return g;
    };
    o.before = gaps();

    // ---- open the notes panel: the lesson slides, the ink must go with it
    window.__notesPanel.open(); await w(1600);
    o.sideOpen = document.body.classList.contains('mn-side-open');
    o.shiftVar = getComputedStyle(document.documentElement).getPropertyValue('--mn-shift').trim();
    o.shiftPx = Math.abs(parseFloat(o.shiftVar) || 0);
    o.open = gaps();
    o.textMoved = Math.abs(o.open.textLeft - o.before.textLeft);

    // ---- and back
    window.__notesPanel.close ? window.__notesPanel.close() : window.__notesPanel.open();
    await w(1600);
    o.closed = gaps();
    o.textReturned = Math.abs(o.closed.textLeft - o.before.textLeft);
    return o;
  });
  if (R.fatal) { console.log('FAIL setup  ' + R.fatal); console.log('hlanchor: 0/1 passed'); await b.close(); process.exit(1); }
  const d = (a,b,k) => (a[k]===null||b[k]===null) ? null : Math.round(Math.abs(a[k]-b[k])*10)/10;
  ok('route key resolved for the lesson', !!R.routeKey, R.routeKey);
  ok('highlight ink lives in its own body-level layer, not the overlay', R.hlLayerExists && R.hlLayerIsBodyChild);
  ok('pen stroke rendered', R.penDrawn);
  ok('both highlighter strokes rendered', R.hlCount>=2, R.hlCount);
  ok('the text highlight anchored to real words', R.gotAnchor);
  ok('the layout-anchored pen stroke rendered', R.gotLayoutAnchor && R.before.penA!==null);
  ok('opening the notes really does slide the lesson', R.sideOpen && R.textMoved>50, 'moved '+R.textMoved+'px, --mn-shift '+R.shiftVar);
  ok('pen mark stays on its words when notes open', d(R.before,R.open,'pen')<=2, 'drift '+d(R.before,R.open,'pen')+'px');
  ok('freehand highlight stays on its words when notes open', d(R.before,R.open,'hlA')<=2, 'drift '+d(R.before,R.open,'hlA')+'px');
  ok('text-anchored highlight stays on its words when notes open', d(R.before,R.open,'hlB')<=2, 'drift '+d(R.before,R.open,'hlB')+'px');
  ok('layout-anchored pen stays on its words when notes open', d(R.before,R.open,'penA')<=2, 'drift '+d(R.before,R.open,'penA')+'px');
  ok('the lesson slides back on close', R.textReturned<=1, 'residual '+R.textReturned+'px');
  ok('pen mark still on its words after close', d(R.before,R.closed,'pen')<=2, 'drift '+d(R.before,R.closed,'pen')+'px');
  ok('freehand highlight still on its words after close', d(R.before,R.closed,'hlA')<=2, 'drift '+d(R.before,R.closed,'hlA')+'px');
  ok('text-anchored highlight still on its words after close', d(R.before,R.closed,'hlB')<=2, 'drift '+d(R.before,R.closed,'hlB')+'px');
  ok('layout-anchored pen still on its words after close (the stuck-wrong case)', d(R.before,R.closed,'penA')<=2, 'drift '+d(R.before,R.closed,'penA')+'px');
  ok('no page errors', errs.length===0, errs.slice(0,2).join('|'));
  for (const f of F) console.log((f.pass?'PASS ':'FAIL ')+f.n+(f.x?'  '+f.x:''));
  console.log('hlanchor: '+F.filter(f=>f.pass).length+'/'+F.length+' passed');
  await b.close();
})().catch(e=>{ console.log('HARNESS '+e); process.exit(2); });
