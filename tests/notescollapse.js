// The MY NOTES block at the foot of every lesson folds to one line, stays
// folded across lessons, and unfolds itself when a note is added.
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport:{width:1194,height:834} });
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  p.on('dialog', d => d.accept());
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(15000);
  const state = () => p.evaluate(() => {
    const box = document.querySelector('.my-notes'); const body = box && box.querySelector('[data-notes-body]');
    const tg = box && box.querySelector('[data-notes-toggle]');
    return { box: !!box, bodyShown: !!body && getComputedStyle(body).display !== 'none', expanded: tg && tg.getAttribute('aria-expanded'),
      h: box ? Math.round(box.getBoundingClientRect().height) : 0, flag: store.myNotesCollapsed === true, collapsedCls: !!box && box.classList.contains('collapsed'),
      count: (box && box.querySelector('[data-notes-count]').textContent) || '' };
  });
  await p.evaluate(async () => { const w=ms=>new Promise(r=>setTimeout(r,ms)); delete store.myNotesCollapsed; go({name:'section',courseId:'C959',chId:'ch4',secId:'s1'}); await w(1200); });
  let s = await state();
  ok('MY NOTES block renders open by default', s.box && s.bodyShown && s.expanded === 'true' && !s.flag, JSON.stringify(s));
  const openH = s.h;
  await p.click('[data-notes-toggle]'); await p.waitForTimeout(150);
  s = await state();
  ok('tapping the heading folds it to one line and remembers it', !s.bodyShown && s.expanded === 'false' && s.flag && s.collapsedCls && s.h < openH * 0.6, JSON.stringify({ ...s, openH }));
  // stays folded on another lesson
  await p.evaluate(async () => { const w=ms=>new Promise(r=>setTimeout(r,ms)); go({name:'section',courseId:'C959',chId:'ch4',secId:'s2'}); await w(1200); });
  s = await state();
  ok('another lesson renders it folded too', s.box && !s.bodyShown && s.expanded === 'false', JSON.stringify(s));
  ok('the notebook button still shows on a lesson while folded', await p.evaluate(() => getComputedStyle(document.getElementById('mn-fab')).display !== 'none'));
  // + New note unfolds it and adds a note
  await p.click('[data-note-add]'); await p.waitForTimeout(200);
  s = await state();
  const cards = await p.evaluate(() => document.querySelectorAll('.my-notes .note-card').length);
  ok('+ New note unfolds the block and adds a note', s.bodyShown && !s.flag && cards >= 1 && /1 note/.test(s.count), JSON.stringify({ ...s, cards }));
  // fold again, then unfold by the heading
  await p.click('[data-notes-toggle]'); await p.waitForTimeout(100);
  await p.click('[data-notes-toggle]'); await p.waitForTimeout(100);
  s = await state();
  ok('heading toggles back open', s.bodyShown && s.expanded === 'true' && !s.flag, JSON.stringify(s));
  // clean up the empty note and the flag
  await p.evaluate(() => { const k = 'C959/ch4/s2'; if (store.notes && store.notes[k]) store.notes[k] = store.notes[k].filter(n => n.text); delete store.myNotesCollapsed; saveStore(); });
  ok('no page errors', errs.length===0, errs.join('|').slice(0,300));
  await p.screenshot({ path: 'notes-collapsed.png', clip: { x: 280, y: 60, width: 720, height: 774 } }).catch(()=>{});
  await b.close();
  const bad=F.filter(f=>!f.pass);
  for (const f of F) console.log((f.pass?'PASS':'FAIL')+' '+f.n+(f.pass?'':' -> '+f.x));
  console.log(`notescollapse: ${F.length-bad.length}/${F.length} passed`);
  process.exit(bad.length?1:0);
})().catch(e=>{ console.error('HARNESS', e); process.exit(2); });
