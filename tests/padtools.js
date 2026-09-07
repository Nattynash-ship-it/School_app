// "add a ruler and a highlighter to the notes as well"
//
// The highlighter is a wide translucent band that must never bury the writing,
// must survive a close and reopen, must erase and undo like any other ink, and
// must keep its own colour in an exported page (inkForPaper would print it as
// a solid black bar). The ruler is a straightedge that lies ON the paper: it is
// not ink, it is never saved into a stroke or exported, and a stroke drawn
// along it comes out dead straight - which is the whole point of it.
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

    // ---------- the ruler ----------
    tap('ruler'); await w(500);
    o.rulerNode = !!svg.querySelector('g.mn-ruler');
    o.rulerTicks = svg.querySelectorAll('.mn-ruler-tick').length;
    o.rulerGrips = svg.querySelectorAll('.mn-ruler-grip').length;
    o.rulerBtnOn = tool('ruler').classList.contains('on');
    o.strokesUnchangedByRuler = S().length === o.n1;
    // its grips must be reachable: inside the paper that is actually on screen
    const pages = document.getElementById('mn-pages');
    const pr = pages.getBoundingClientRect();
    o.gripsOnScreen = [...svg.querySelectorAll('.mn-ruler-grip')].every(g=>{
      const r = g.getBoundingClientRect();
      return r.left >= pr.left - 2 && r.right <= pr.right + 2;
    });
    // put it flat, at a known place, then draw a deliberately wobbly line on it
    const rp = store.padPrefs.ruler;
    rp.a = 0; rp.x = 500; rp.y = 600; saveStore();
    window.__notesPanel.tab('write'); await w(60);
    tap('pen'); await w(150);
    draw(240,600,760,600, 26); await w(300);      // wobble 26 units across
    let after = S();
    o.ruled = after.length === o.n1 + 1;
    o.ruledBow = after.length ? maxBow(after[after.length-1]) : null;
    // the same wobble far from the ruler stays a wobble
    draw(240,300,760,300, 26); await w(300);
    after = S();
    o.freeBow = maxBow(after[after.length-1]);

    // dragging the body moves it; dragging a grip turns it and snaps to 15deg
    const body = svg.querySelector('.mn-ruler-body');
    fire(body,'pointerdown', cx(500), cy(640));
    fire(svg,'pointermove', cx(560), cy(700));
    fire(svg,'pointerup',   cx(560), cy(700));
    await w(150);
    o.movedX = Math.round(store.padPrefs.ruler.x);
    o.movedY = Math.round(store.padPrefs.ruler.y);
    const grip = svg.querySelector('.mn-ruler-grip');
    const gr = grip.getBoundingClientRect();
    fire(grip,'pointerdown', gr.left+gr.width/2, gr.top+gr.height/2);
    fire(svg,'pointermove', cx(store.padPrefs.ruler.x-200), cy(store.padPrefs.ruler.y-198));
    fire(svg,'pointerup',   cx(store.padPrefs.ruler.x-200), cy(store.padPrefs.ruler.y-198));
    await w(150);
    o.turnedDeg = Math.round(store.padPrefs.ruler.a * 180 / Math.PI * 10)/10;
    o.snapped15 = Math.abs(o.turnedDeg % 15) < 0.05 || Math.abs(Math.abs(o.turnedDeg % 15) - 15) < 0.05;
    o.stillNotInk = S().length === after.length;

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
    // the ruler is a tool, not ink: nothing of it in the picture
    const rulerBandPx = c2.getImageData(Math.round(500/1000*bm.width), Math.round(660/1294*bm.height), 1, 1).data;
    o.rulerNotExported = rulerBandPx[0] > 248 && rulerBandPx[1] > 248 && rulerBandPx[2] > 248;

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
    o.rulerAfterReopen = !!document.getElementById('mn-ink').querySelector('g.mn-ruler');
    // and it can be put away again
    document.querySelector('#mn-tools .mn-tool[data-t="ruler"]').click(); await w(300);
    const off = [...document.querySelectorAll('.mn-pop .mn-size')].filter(x=>/put the ruler away/i.test(x.textContent))[0];
    o.popHasPutAway = !!off;
    if (off) off.click();
    await w(400);
    o.rulerGone = !document.getElementById('mn-ink').querySelector('g.mn-ruler');
    o.inkKeptAfterRulerOff = S().length > 0;
    return o;
  });
  ok('the highlighter button turns on and takes the pen off', R.hlBtnOn && R.penBtnOff);
  ok('a highlighter stroke is saved as its own kind of ink', R.hlSaved===1, 'type hl x'+R.hlSaved);
  ok('it keeps a highlighter colour and a marker width', /^#/.test(R.hlColor||'') && R.hlWidth>=10, R.hlColor+' w'+R.hlWidth);
  ok('it renders translucent, not solid', R.hlRendered && parseFloat(R.hlOpacity)>0.2 && parseFloat(R.hlOpacity)<0.7, R.hlOpacity);
  ok('it is a broad band, not a pen line', parseFloat(R.hlStrokeW)>=10, R.hlStrokeW);
  ok('drawn AFTER the writing, it still sits under it', R.hlUnderInk);
  ok('the ruler appears with inch ticks and two grips', R.rulerNode && R.rulerTicks>10 && R.rulerGrips===2, R.rulerTicks+' ticks');
  ok('the ruler button reads as on', R.rulerBtnOn);
  ok('both grips are reachable on the paper she can see', R.gripsOnScreen);
  ok('bringing it out adds no ink', R.strokesUnchangedByRuler);
  ok('a wobbly stroke drawn along it comes out straight', R.ruled && R.ruledBow<=1, 'bow '+R.ruledBow+' units');
  ok('the same wobble away from it stays a wobble', R.freeBow>=8, 'bow '+R.freeBow+' units');
  ok('dragging the body moves it', R.movedX===560 && R.movedY===660, R.movedX+','+R.movedY);
  ok('dragging a grip turns it, snapped to 15 degrees', R.snapped15, R.turnedDeg+'°');
  ok('moving and turning it never becomes a stroke', R.stillNotInk);
  ok('the exported page draws the highlight', R.exportStrokes>=3, R.exportStrokes+' strokes');
  ok('the highlight keeps its colour in the export (not blackened)', R.hlPixelIsYellowish, 'rgb '+R.hlPixel.join(','));
  ok('the ruler is not in the exported page', R.rulerNotExported);
  ok('the eraser takes highlighter ink', R.erasedSomething);
  ok('undo brings it back', R.undoRestored);
  ok('highlights survive closing and reopening', R.hlAfterReopen>=1 && R.hlNodeAfterReopen, R.hlAfterReopen);
  ok('the ruler is still out on reopening', R.rulerAfterReopen);
  ok('its options offer putting it away', R.popHasPutAway);
  ok('putting it away removes it and keeps every stroke', R.rulerGone && R.inkKeptAfterRulerOff);
  ok('no page errors', errs.length===0, errs.slice(0,2).join('|'));
  for (const f of F) console.log((f.pass?'PASS ':'FAIL ')+f.n+(f.x?'  '+f.x:''));
  console.log('padtools: '+F.filter(f=>f.pass).length+'/'+F.length+' passed');
  await b.close();
})().catch(e=>{ console.log('HARNESS '+e); process.exit(2); });
