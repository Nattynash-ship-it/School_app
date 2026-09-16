// "add a ruler and a highlighter to the notes as well"
//
// The highlighter is a wide translucent band that must never bury the writing,
// must survive a close and reopen, must erase and undo like any other ink, and
// must keep its own colour in an exported page (inkForPaper would print it as
// a solid black bar).
//
// THE RULER IS GONE - "Please remove the ruler on the notes" - and its half of
// this file went with it in 18.591. It had been crashing the whole suite since
// the ruler was taken out in 18.582: tool('ruler') returned null and .click()
// threw, which took the highlighter coverage down with it and went unnoticed
// because the runner only printed the last line and read the wrong exit code.
// The last assertion here now holds the ruler DOWN, so nothing quietly puts it
// back.
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
    window.__notesPanel.open(); await w(1400);
    window.__notesPanel.tab('write'); await w(400);
    const svg = document.getElementById('mn-ink');
    const tool = t => document.querySelector('#mn-tools .mn-tool[data-t="'+t+'"]');
    const tap = t => tool(t).click();
    // page units <-> client pixels
    const K = () => { const r = svg.getBoundingClientRect(); return { r, k: r.width/1000 }; };
    const cx = u => { const {r,k}=K(); return r.left + u*k; };
    const cy = u => { const {r,k}=K(); return r.top  + u*k; };
    const fire = (el,t,x,y)=>el.dispatchEvent(new PointerEvent(t,{pointerId:7,pointerType:'pen',
      isPrimary:true,clientX:x,clientY:y,pressure:.5,bubbles:true,cancelable:true}));
    // draw in PAGE UNITS, with an optional wobble across the direction of travel
    const draw = (x1,y1,x2,y2,wobble) => {
      fire(svg,'pointerdown',cx(x1),cy(y1));
      for (let i=1;i<=12;i++){
        const t=i/12, wob=(wobble||0)*Math.sin(t*Math.PI*3);
        fire(svg,'pointermove', cx(x1+(x2-x1)*t), cy(y1+(y2-y1)*t + wob));
      }
      fire(svg,'pointerup',cx(x2),cy(y2));
    };
    const pk = k => 'pad_' + String(k || '').replace(/[^a-zA-Z0-9_/-]/g, '_');
    const S = () => gannoGetStrokes(pk(window.__notesPanel.state().key));
    const maxBow = s => {                       // max deviation from its own chord
      const P=s.points, a=P[0], z=P[P.length-1];
      const dx=z.x-a.x, dy=z.y-a.y, L=Math.hypot(dx,dy)||1;
      let m=0; for (const q of P) m=Math.max(m, Math.abs((q.x-a.x)*dy-(q.y-a.y)*dx)/L);
      return Math.round(m*10)/10;
    };

    // ---------- highlighter ----------
    tap('pen'); await w(150);
    draw(80,150,700,150); await w(200);           // a line of "writing"
    tap('hl'); await w(200);
    o.hlBtnOn = tool('hl').classList.contains('on');
    o.penBtnOff = !tool('pen').classList.contains('on');
    draw(70,150,710,150); await w(300);           // highlight straight over it
    let st = S();
    o.n1 = st.length;
    const hl = st.filter(s=>s.type==='hl');
    o.hlSaved = hl.length;
    o.hlColor = hl.length ? hl[0].color : null;
    o.hlWidth = hl.length ? hl[0].width : null;
    const hlNode = svg.querySelector('path.mn-hl');
    o.hlRendered = !!hlNode;
    o.hlOpacity = hlNode ? hlNode.getAttribute('stroke-opacity') : null;
    o.hlStrokeW = hlNode ? hlNode.getAttribute('stroke-width') : null;
    // painted UNDER the writing even though it was drawn after it
    const paths = [...svg.querySelectorAll('path')];
    const lastHl = paths.map(n=>n.classList.contains('mn-hl')).lastIndexOf(true);
    const firstPen = paths.map(n=>n.classList.contains('mn-hl')).indexOf(false);
    o.hlUnderInk = lastHl >= 0 && firstPen >= 0 && lastHl < firstPen;

    // ---------- the export ----------
    const png = window.__notesPanel.renderPage(1);
    o.exportStrokes = png.strokes;
    const bm = await createImageBitmap(png.blob);
    const cvs = document.createElement('canvas'); cvs.width = bm.width; cvs.height = bm.height;
    const c2 = cvs.getContext('2d'); c2.drawImage(bm, 0, 0);
    // sample the middle of the highlighted band, between the writing strokes
    const px = Math.round(400/1000 * bm.width), py = Math.round(142/1294 * bm.height);
    const d = c2.getImageData(px, py, 1, 1).data;
    o.hlPixel = [d[0], d[1], d[2]];
    o.hlPixelIsYellowish = d[0] > 200 && d[1] > 190 && d[2] < 200 && (d[0]-d[2]) > 40;

    // ---------- erase, undo, and reopening ----------
    tap('erase'); await w(150);
    const before = S().length;
    fire(svg,'pointerdown', cx(400), cy(150));
    fire(svg,'pointermove', cx(402), cy(150));
    fire(svg,'pointerup',   cx(402), cy(150));
    await w(250);
    o.erasedSomething = S().length !== before;
    tool('undo').click(); await w(250);
    o.undoRestored = S().filter(s=>s.type==='hl').length >= 1;

    window.__notesPanel.close(); await w(1200);
    window.__notesPanel.open();  await w(1600);
    window.__notesPanel.tab('write'); await w(400);
    o.hlAfterReopen = S().filter(s=>s.type==='hl').length;
    o.hlNodeAfterReopen = !!document.getElementById('mn-ink').querySelector('path.mn-hl');
    // the ruler she asked to have removed must stay removed: no tool button,
    // nothing drawn on the paper, and no leftover setting being honoured
    o.rulerToolGone = !document.querySelector('#mn-tools .mn-tool[data-t="ruler"]');
    o.rulerNodeGone = !document.getElementById('mn-ink').querySelector('g.mn-ruler');
    o.rulerTicksGone = document.querySelectorAll('.mn-ruler-tick, .mn-ruler-grip, .mn-ruler-body').length === 0;
    return o;
  });
  ok('the highlighter button turns on and takes the pen off', R.hlBtnOn && R.penBtnOff);
  ok('a highlighter stroke is saved as its own kind of ink', R.hlSaved===1, 'type hl x'+R.hlSaved);
  ok('it keeps a highlighter colour and a marker width', /^#/.test(R.hlColor||'') && R.hlWidth>=10, R.hlColor+' w'+R.hlWidth);
  ok('it renders translucent, not solid', R.hlRendered && parseFloat(R.hlOpacity)>0.2 && parseFloat(R.hlOpacity)<0.7, R.hlOpacity);
  ok('it is a broad band, not a pen line', parseFloat(R.hlStrokeW)>=10, R.hlStrokeW);
  ok('drawn AFTER the writing, it still sits under it', R.hlUnderInk);
  // the writing and the highlight over it - the third stroke this used to
  // count was drawn by the ruler section, which no longer exists
  ok('the exported page draws both the writing and the highlight', R.exportStrokes===2, R.exportStrokes+' strokes');
  ok('the highlight keeps its colour in the export (not blackened)', R.hlPixelIsYellowish, 'rgb '+R.hlPixel.join(','));
  ok('the eraser takes highlighter ink', R.erasedSomething);
  ok('undo brings it back', R.undoRestored);
  ok('highlights survive closing and reopening', R.hlAfterReopen>=1 && R.hlNodeAfterReopen, R.hlAfterReopen);
  ok('the ruler stays removed', R.rulerToolGone && R.rulerNodeGone && R.rulerTicksGone,
     JSON.stringify([R.rulerToolGone, R.rulerNodeGone, R.rulerTicksGone]));
  ok('no page errors', errs.length===0, errs.slice(0,2).join('|'));
  for (const f of F) console.log((f.pass?'PASS ':'FAIL ')+f.n+(f.x?'  '+f.x:''));
  console.log('padtools: '+F.filter(f=>f.pass).length+'/'+F.length+' passed');
  await b.close();
})().catch(e=>{ console.log('HARNESS '+e); process.exit(2); });
