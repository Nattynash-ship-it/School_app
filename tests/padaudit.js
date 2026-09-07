// Notebook pad audit: (1) is every toolbar control actually reachable in side
// mode and bottom mode on the iPad sizes she uses, (2) what does Undo do after
// an erase, (3) does the eraser find strokes at writing scale, (4) do typed
// notes survive edit/blur. Screenshots for the toolbar question.
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  async function open(vp) {
    const p = await b.newPage({ viewport: vp });
    const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
    p.on('dialog', d => d.accept());
    await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
    await p.waitForTimeout(15000);
    await p.evaluate(async () => {
      const w=ms=>new Promise(r=>setTimeout(r,ms));
      go({name:'section',courseId:'C959',chId:'ch4',secId:'s1'}); await w(1500);
      window.__notesPanel.open(); await w(900);
    });
    return { p, errs };
  }
  const toolbarReport = async (p) => p.evaluate(() => {
    const dock = document.getElementById('mn-dock');
    const dr = dock.getBoundingClientRect();
    const tools = document.getElementById('mn-tools');
    const items = [...tools.querySelectorAll('.mn-tool, .mn-sw')].map(el => {
      const r = el.getBoundingClientRect();
      return { t: el.dataset.t || el.dataset.c, visible: r.left >= dr.left - 1 && r.right <= dr.right + 1 && r.width > 0 };
    });
    return { side: !!window.__notesPanel.state().side, dockW: Math.round(dr.width),
      toolsScrollW: tools.scrollWidth, toolsClientW: tools.clientWidth,
      hidden: items.filter(i => !i.visible).map(i => i.t), count: items.length };
  });

  // ---- landscape iPad, side panel
  let { p, errs } = await open({ width:1194, height:834 });
  let tb = await toolbarReport(p);
  ok('landscape: notebook opens at the side', tb.side, JSON.stringify(tb));
  ok('landscape side: every tool visible without scrolling', tb.hidden.length === 0, 'hidden: ' + tb.hidden.join(',') + ' scrollW ' + tb.toolsScrollW + ' clientW ' + tb.toolsClientW);
  await p.screenshot({ path:'pad-side-landscape.png' });

  // draw two strokes with the mouse (pen path: only touch is rejected)
  const draw = async (p, dx) => {
    const r = await p.evaluate(() => { const s=document.getElementById('mn-ink').getBoundingClientRect(); const d=document.getElementById('mn-pages').getBoundingClientRect();
      return { l: Math.max(s.left,d.left), t: Math.max(s.top,d.top), r: Math.min(s.right,d.right), b: Math.min(s.bottom,d.bottom) }; });
    const x0 = r.l + (r.r-r.l)*0.45 + dx, y0 = r.t + (r.b-r.t)*0.45;
    await p.mouse.move(x0,y0); await p.mouse.down();
    for (let i=1;i<=10;i++) await p.mouse.move(x0 + 60*i/10, y0 + 8*i/10);
    await p.mouse.up(); await p.waitForTimeout(150);
    return { x0, y0 };
  };
  await p.evaluate(() => { document.querySelector('.mn-tool[data-t="clear"]'); });
  const s1 = await draw(p, 0);
  const s2 = await draw(p, 0); // second stroke on top of first (offset 0 so both get hit)
  let n = await p.evaluate(() => window.__notesPanel.state().strokes);
  ok('two strokes drawn on the pad', n >= 2, n);
  const base = n;
  // erase at the start of the strokes
  await p.click('.mn-tool[data-t="erase"]');
  await p.mouse.move(s1.x0 + 30, s1.y0 + 4); await p.mouse.down(); await p.mouse.move(s1.x0 + 32, s1.y0 + 4); await p.mouse.up();
  await p.waitForTimeout(150);
  const afterErase = await p.evaluate(() => window.__notesPanel.state().strokes);
  ok('eraser cuts the strokes under it (pieces replace the originals)', afterErase !== base, `${base} -> ${afterErase}`);
  // draw a third stroke elsewhere, then Undo: what comes back?
  await p.click('.mn-tool[data-t="pen"]');
  const s3 = await draw(p, 140);
  const beforeUndo = await p.evaluate(() => window.__notesPanel.state().strokes);
  await p.click('.mn-tool[data-t="undo"]');
  await p.waitForTimeout(120);
  const afterUndo1 = await p.evaluate(() => window.__notesPanel.state().strokes);
  ok('undo removes the last drawn stroke', afterUndo1 === beforeUndo - 1, `${beforeUndo} -> ${afterUndo1}`);
  await p.click('.mn-tool[data-t="undo"]');
  await p.waitForTimeout(120);
  const afterUndo2 = await p.evaluate(() => window.__notesPanel.state().strokes);
  // Expectation a user has: the second undo should bring the ERASED ink back.
  // Today it instead deletes another stroke. Record what actually happens.
  ok('second undo restores the erased ink exactly (undo is action-based)', afterUndo2 === base, `base ${base}, after erase ${afterErase}, undo#1 ${afterUndo1}, undo#2 ${afterUndo2}`);
  ok('no page errors (landscape)', errs.length===0, errs.join('|').slice(0,200));
  await p.evaluate(() => { try { window.__notesPanel.state(); } catch(e){} });
  await p.close();

  // ---- portrait iPad, bottom dock
  ({ p, errs } = await open({ width:834, height:1112 }));
  tb = await toolbarReport(p);
  ok('portrait: every tool visible without scrolling', tb.hidden.length === 0, 'side=' + tb.side + ' hidden: ' + tb.hidden.join(',') + ' scrollW ' + tb.toolsScrollW + ' clientW ' + tb.toolsClientW);
  await p.screenshot({ path:'pad-portrait.png' });
  // typed notes: add, edit, blur, verify persisted
  await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    window.__notesPanel.tab('type'); await w(200);
    const ta = document.getElementById('mn-ta'); ta.value = 'audit note one'; ta.dispatchEvent(new Event('input'));
    document.getElementById('mn-save').click(); await w(200);
  });
  const typed = await p.evaluate(() => window.__notesPanel.state().notes);
  ok('typed note saves', typed >= 1, typed);
  const edited = await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    const body = document.querySelector('#mn-list .mn-body'); body.focus(); body.innerText = 'audit note edited'; body.blur(); await w(200);
    const k = window.__notesPanel.state().key; return (store.notes[k]||[]).map(n=>n.text);
  });
  ok('editing a typed note persists on blur', edited.includes('audit note edited'), JSON.stringify(edited));
  // clean up test notes/ink so later runs start clean
  await p.evaluate(() => { const k = window.__notesPanel.state().key; if (store.notes) delete store.notes[k]; if (store.padNotes) delete store.padNotes[k]; try { gannoSaveStrokes('pad_' + k.replace(/[^a-zA-Z0-9_/-]/g,'_'), []); } catch(e){} saveStore(); });
  ok('no page errors (portrait)', errs.length===0, errs.join('|').slice(0,200));
  await p.close();
  await b.close();
  const bad=F.filter(f=>!f.pass);
  for (const f of F) console.log((f.pass?'PASS':'FAIL')+' '+f.n+(f.pass?'':' -> '+f.x));
  console.log(`padaudit: ${F.length-bad.length}/${F.length} passed`);
})().catch(e=>{ console.error('HARNESS', e); process.exit(2); });
