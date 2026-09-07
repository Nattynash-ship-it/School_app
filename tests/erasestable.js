// "the notes screen keeps moving as I erase, it needs to stay in place":
// redraw() used to tear down and rebuild the WHOLE svg (every rule line and
// every stroke) on every single erase hit-test, which is real DOM churn
// during a drag - visible as flicker/jump. Erasing must now remove only the
// struck stroke's own node and touch nothing else.
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport:{width:1194,height:834} });
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(16000);

  const R = await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    const o={};
    go({name:'section',courseId:'C959',chId:'ch4',secId:'s1'}); await w(1600);
    window.__notesPanel.open(); await w(1000);
    window.__notesPanel.tab('write'); await w(200);

    const svg = document.getElementById('mn-ink');
    const r = svg.getBoundingClientRect();
    const pen=(t,x,y)=>svg.dispatchEvent(new PointerEvent(t,{pointerId:5,pointerType:'pen',
      isPrimary:true,clientX:x,clientY:y,pressure:.5,bubbles:true,cancelable:true}));
    const drawStroke=async(y)=>{
      pen('pointerdown', r.left+60, y);
      for (let k=1;k<=8;k++) pen('pointermove', r.left+60+k*16, y);
      pen('pointerup', r.left+188, y);
      await w(120);
    };
    await drawStroke(r.top+90);
    await drawStroke(r.top+140);
    await drawStroke(r.top+190);
    o.drewThree = window.__notesPanel.state().strokes === 3;

    // mark every current path node so we can tell "still the same element"
    // from "removed and a lookalike put back" - a full redraw would replace
    // every node, so the marks would be gone even if the count matches.
    const paths = [...svg.querySelectorAll('path')];
    paths.forEach((el, i) => el.dataset.probe = 'orig' + i);
    o.pathCount = paths.length;

    // watch every removal from the svg while we erase stroke #2 only (y ~140)
    const removedIds = [];
    const mo = new MutationObserver(muts => {
      for (const m of muts) for (const n of m.removedNodes) {
        if (n.nodeType === 1) removedIds.push(n.dataset ? n.dataset.probe : '?');
      }
    });
    mo.observe(svg, { childList: true });

    const rulesBefore = svg.querySelectorAll('.mn-rule, .mn-margin, .mn-head').length;
    const scrollBefore = document.getElementById('mn-pages').scrollTop;

    // eraser drag across the middle stroke only, several hit-test points
    document.querySelector('#mn-dock .mn-tool[data-t="erase"]').click(); await w(150);
    const ey = r.top+140;
    pen('pointerdown', r.left+70, ey);
    for (let k=0;k<6;k++) { pen('pointermove', r.left+70+k*20, ey); await w(20); }
    pen('pointerup', r.left+190, ey);
    await w(300);
    mo.disconnect();

    o.strokeGone = window.__notesPanel.state().strokes === 2;
    // only nodes tagged as belonging to the erased stroke's path may have
    // been removed - never the rule grid, never the other two strokes
    // partial erase adds fragment nodes and may remove them again within the
    // gesture (untagged); of the ORIGINAL tagged nodes only the struck one may go
    const taggedGone = removedIds.filter(id => id && id !== '?');
    o.onlyErasedRemoved = removedIds.length > 0 && !removedIds.includes('?') && taggedGone.length === 1 && taggedGone[0] === 'orig1';
    // the two SURVIVING strokes' original elements are still literally the
    // same nodes, still attached - never torn down and rebuilt
    const survivorIds = new Set(paths.filter(el => el.isConnected && el.dataset.probe).map(el => el.dataset.probe));
    o.survivorsUntouched = paths.filter(el => el.isConnected).length === 2
      && [...svg.querySelectorAll('path')].filter(el => el.dataset.probe).map(el => el.dataset.probe).sort().join() === 'orig0,orig2';
    // the rule grid (the "page") was never rebuilt - same line count, no churn
    o.rulesUntouched = svg.querySelectorAll('.mn-rule, .mn-margin, .mn-head').length === rulesBefore;
    o.stayedInPlace = document.getElementById('mn-pages').scrollTop === scrollBefore;

    // draw a brand new stroke, then erase IT specifically - proves a stroke
    // added since the last full redraw is still individually erasable
    document.querySelector('#mn-dock .mn-tool[data-t="pen"]').click(); await w(150);
    await drawStroke(r.top+240);
    const afterDraw = window.__notesPanel.state().strokes;
    document.querySelector('#mn-dock .mn-tool[data-t="erase"]').click(); await w(150);
    const ey2 = r.top+240;
    pen('pointerdown', r.left+70, ey2);
    for (let k=0;k<6;k++) pen('pointermove', r.left+70+k*20, ey2);
    pen('pointerup', r.left+190, ey2);
    await w(300);
    o.freshStrokeErasable = window.__notesPanel.state().strokes === afterDraw - 1;

    // undo still works and a subsequent erase still finds its target
    document.querySelector('#mn-dock .mn-tool[data-t="pen"]').click(); await w(150);
    await drawStroke(r.top+300);
    const beforeUndo = window.__notesPanel.state().strokes;
    document.querySelector('#mn-dock .mn-tool[data-t="undo"]').click(); await w(200);
    o.undoWorks = window.__notesPanel.state().strokes === beforeUndo - 1;
    document.querySelector('#mn-dock .mn-tool[data-t="erase"]').click(); await w(150);
    const remainBefore = window.__notesPanel.state().strokes;
    pen('pointerdown', r.left+70, r.top+90);
    for (let k=0;k<6;k++) pen('pointermove', r.left+70+k*20, r.top+90);
    pen('pointerup', r.left+190, r.top+90);
    await w(300);
    o.eraseAfterUndoWorks = window.__notesPanel.state().strokes === remainBefore - 1;

    // a page reload still shows exactly what's left (persistence intact)
    document.querySelector('#mn-dock .mn-tool[data-t="pen"]').click(); await w(150);
    o.finalCount = window.__notesPanel.state().strokes;
    window.__notesPanel.close(); await w(500);
    return o;
  });

  for (const [k,v] of Object.entries(R)) ok(k, v===true || k==='pathCount' || k==='finalCount', JSON.stringify(v));
  ok('no page errors', errs.length===0, errs.join(' | ').slice(0,300));

  // confirm persistence across a reload matches state before it
  await p.reload({waitUntil:'load',timeout:240000});
  await p.waitForTimeout(18000);
  const after = await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    go({name:'section',courseId:'C959',chId:'ch4',secId:'s1'}); await w(1600);
    window.__notesPanel.open(); await w(1000);
    const n = window.__notesPanel.state().strokes;
    window.__notesPanel.close(); await w(400);
    return n;
  });
  ok('erased strokes stayed erased across reload', after === R.finalCount, JSON.stringify({after, expected:R.finalCount}));

  await b.close();
  const bad=F.filter(f=>!f.pass);
  for (const f of F) console.log((f.pass?'PASS':'FAIL')+' '+f.n+(f.pass?'':' -> '+f.x));
  console.log(`erasestable: ${F.length-bad.length}/${F.length} passed`);
  process.exit(bad.length?1:0);
})().catch(e=>{ console.error('HARNESS', e); process.exit(2); });
