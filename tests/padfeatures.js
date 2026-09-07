// Notebook: partial erase (only what the eraser passes over goes), the page
// counter + jump list, and export-a-page-as-PNG.
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport:{width:1194,height:834} });
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  p.on('dialog', d => d.accept());
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(15000);
  await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    go({name:'section',courseId:'C959',chId:'ch4',secId:'s1'}); await w(1500);
    window.__notesPanel.open(); await w(900);
    // start clean
    const k = window.__notesPanel.state().key;
    try { gannoSaveStrokes('pad_' + k.replace(/[^a-zA-Z0-9_/-]/g,'_'), []); } catch(e){}
    if (store.padNotes) delete store.padNotes[k];
    window.__notesPanel.close(); await w(500); window.__notesPanel.open(); await w(900);
  });
  const S = () => p.evaluate(() => window.__notesPanel.state().strokes);
  const visible = async () => p.evaluate(() => { const s=document.getElementById('mn-ink').getBoundingClientRect(); const d=document.getElementById('mn-pages').getBoundingClientRect();
    return { l: Math.max(s.left,d.left), t: Math.max(s.top,d.top), r: Math.min(s.right,d.right), b: Math.min(s.bottom,d.bottom) }; });

  // ---- partial erase
  ok('starts with no ink', (await S()) === 0, await S());
  let v = await visible();
  const y0 = v.t + (v.b - v.t) * 0.5, x0 = v.l + (v.r - v.l) * 0.15, x1 = v.l + (v.r - v.l) * 0.85;
  await p.mouse.move(x0, y0); await p.mouse.down();
  for (let i=1;i<=30;i++) await p.mouse.move(x0 + (x1-x0)*i/30, y0);
  await p.mouse.up(); await p.waitForTimeout(150);
  ok('one long stroke drawn', (await S()) === 1, await S());
  const ptsBefore = await p.evaluate(() => { const k=window.__notesPanel.state().key; return gannoGetStrokes('pad_'+k.replace(/[^a-zA-Z0-9_/-]/g,'_'))[0].points.length; });
  // erase through the middle, vertically
  await p.click('.mn-tool[data-t="erase"]');
  const xm = (x0 + x1) / 2;
  await p.mouse.move(xm, y0 - 30); await p.mouse.down();
  for (let i=1;i<=8;i++) await p.mouse.move(xm, y0 - 30 + 60*i/8);
  await p.mouse.up(); await p.waitForTimeout(150);
  const after = await p.evaluate(() => { const k=window.__notesPanel.state().key; const ss = gannoGetStrokes('pad_'+k.replace(/[^a-zA-Z0-9_/-]/g,'_'));
    return { n: ss.length, pts: ss.map(s=>s.points.length), xs: ss.map(s => [Math.round(s.points[0].x), Math.round(s.points[s.points.length-1].x)]), dom: document.querySelectorAll('#mn-ink path').length }; });
  ok('erasing the middle leaves TWO strokes (left and right pieces)', after.n === 2, JSON.stringify(after));
  ok('the pieces do not span the erased gap', after.n === 2 && after.xs[0][1] < after.xs[1][0] - 10, JSON.stringify(after.xs));
  ok('both pieces are on screen (DOM paths = strokes)', after.dom === after.n, `${after.dom} vs ${after.n}`);
  ok('points total shrank by the erased part only', after.n === 2 && after.pts[0] + after.pts[1] < ptsBefore && after.pts[0] + after.pts[1] > ptsBefore * 0.5, `${ptsBefore} -> ${after.pts}`);
  // undo brings the whole stroke back, redo re-cuts
  await p.click('.mn-tool[data-t="undo"]'); await p.waitForTimeout(120);
  const u = await p.evaluate(() => { const k=window.__notesPanel.state().key; const ss = gannoGetStrokes('pad_'+k.replace(/[^a-zA-Z0-9_/-]/g,'_')); return { n: ss.length, pts: ss.map(s=>s.points.length), dom: document.querySelectorAll('#mn-ink path').length }; });
  ok('undo restores the original single stroke', u.n === 1 && u.pts[0] === ptsBefore && u.dom === 1, JSON.stringify(u));
  await p.click('.mn-tool[data-t="redo"]'); await p.waitForTimeout(120);
  const r = await p.evaluate(() => { const k=window.__notesPanel.state().key; return gannoGetStrokes('pad_'+k.replace(/[^a-zA-Z0-9_/-]/g,'_')).length; });
  ok('redo re-applies the cut (two pieces again)', r === 2, r);
  // persisted across a reopen
  await p.evaluate(async () => { const w=ms=>new Promise(r=>setTimeout(r,ms)); window.__notesPanel.close(); await w(500); window.__notesPanel.open(); await w(900); });
  ok('the two pieces survive close/reopen', (await S()) === 2, await S());

  // ---- page counter + jump
  const pg0 = await p.evaluate(() => ({ ...window.__notesPanel.page(), txt: document.querySelector('.mn-tool[data-t="pages"]').textContent }));
  ok('page button reads 1/1 on a one-page pad', pg0.txt === '1/1' && pg0.cur === 1 && pg0.count === 1, JSON.stringify(pg0));
  await p.click('.mn-tool[data-t="page"]'); await p.waitForTimeout(300);  // ＋ page (scrolls to the foot)
  const pg1 = await p.evaluate(() => ({ ...window.__notesPanel.page(), txt: document.querySelector('.mn-tool[data-t="pages"]').textContent }));
  ok('after adding a page the counter shows 2/2 (scrolled to the new page)', pg1.txt === '2/2', JSON.stringify(pg1));
  await p.click('.mn-tool[data-t="pages"]'); await p.waitForTimeout(150);
  const rows = await p.evaluate(() => [...document.querySelectorAll('.mn-pop[data-kind="pages"] .mn-size')].map(r => ({ t: r.textContent.trim(), on: r.classList.contains('on') })));
  ok('page list shows both pages and an add row', rows.length === 3 && /Page 1/.test(rows[0].t) && /Page 2/.test(rows[1].t) && /Add/.test(rows[2].t), JSON.stringify(rows));
  ok('page 1 is marked as having ink, page 2 blank', !/blank/.test(rows[0].t) && /blank/.test(rows[1].t), JSON.stringify(rows));
  ok('the current page (2) is highlighted', rows[1].on && !rows[0].on, JSON.stringify(rows));
  await p.locator('.mn-pop[data-kind="pages"] .mn-size').first().click(); await p.waitForTimeout(250);
  const pg2 = await p.evaluate(() => ({ ...window.__notesPanel.page(), txt: document.querySelector('.mn-tool[data-t="pages"]').textContent, top: document.getElementById('mn-pages').scrollTop, pop: !!document.querySelector('.mn-pop') }));
  ok('jumping to page 1 scrolls to the top and reads 1/2', pg2.txt === '1/2' && pg2.top === 0 && !pg2.pop, JSON.stringify(pg2));
  await p.evaluate(() => window.__notesPanel.gotoPage(2)); await p.waitForTimeout(200);
  const pg3 = await p.evaluate(() => ({ ...window.__notesPanel.page(), top: document.getElementById('mn-pages').scrollTop }));
  ok('gotoPage(2) lands on page 2', pg3.cur === 2 && pg3.top > 100, JSON.stringify(pg3));

  // ---- export
  const ex = await p.evaluate(() => window.__notesPanel.renderPage(1));
  ok('page 1 renders to a PNG with the two ink pieces', ex.bytes > 5000 && ex.strokes === 2 && ex.w === 1700 && ex.h === 2200, JSON.stringify(ex));
  ok('file is named after the section and page', /page-1\.png$/.test(ex.name) && ex.name.length > 12, ex.name);
  const ex2 = await p.evaluate(() => window.__notesPanel.renderPage(2));
  ok('blank page 2 renders too, with no strokes', ex2.bytes > 1000 && ex2.strokes === 0, JSON.stringify(ex2));
  // the toolbar button path: a download is triggered (no share API in Chromium headless)
  const [dl] = await Promise.all([ p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('.mn-tool[data-t="export"]') ]);
  ok('📷 button produces a download of the PNG', !!dl && /\.png$/.test(dl.suggestedFilename()), dl ? dl.suggestedFilename() : 'no download');
  ok('a toast confirms the save', await p.evaluate(() => { const t=document.querySelector('.toast'); return !!t && /Saved|ready/i.test(t.textContent); }));

  // ---- toolbar still fits (side panel wraps; every control visible)
  const tb = await p.evaluate(() => { const dr=document.getElementById('mn-dock').getBoundingClientRect(); return [...document.querySelectorAll('#mn-tools .mn-tool')].map(el=>{const r=el.getBoundingClientRect(); return {t:el.dataset.t, ok: r.left>=dr.left-1 && r.right<=dr.right+1 && r.width>0};}).filter(x=>!x.ok).map(x=>x.t); });
  ok('every toolbar control is visible in the side panel', tb.length === 0, 'hidden: ' + tb.join(','));

  // cleanup
  await p.evaluate(() => { const k = window.__notesPanel.state().key; try { gannoSaveStrokes('pad_' + k.replace(/[^a-zA-Z0-9_/-]/g,'_'), []); } catch(e){} if (store.padNotes) delete store.padNotes[k]; saveStore(); });
  ok('no page errors', errs.length===0, errs.join('|').slice(0,300));
  await b.close();
  const bad=F.filter(f=>!f.pass);
  for (const f of F) console.log((f.pass?'PASS':'FAIL')+' '+f.n+(f.pass?'':' -> '+f.x));
  console.log(`padfeatures: ${F.length-bad.length}/${F.length} passed`);
  process.exit(bad.length?1:0);
})().catch(e=>{ console.error('HARNESS', e); process.exit(2); });
