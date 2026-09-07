// "This requires so much space for a table" - a truth-table question (the
// C959 logic style: f = (p∧¬q)∨(¬p∧q), an 8-row table) rendered with zero
// table styling before, at whatever size the lesson-text zoom happened to be
// scaling PROSE to. Verify the table now stays compact and legible
// regardless of zoom, columns line up, and it never breaks the layout.
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport:{width:834,height:1112} });   // portrait iPad, matches her photo
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(16000);

  const TABLE_Q = {
    id: 'nx_tbl_1', topic: 'Truth tables',
    text: 'How many of the 8 rows make f true?<br><strong>f = (p ∧ ¬q) ∨ (¬p ∧ q)</strong>' +
      '<table><thead><tr><th>#</th><th>p</th><th>q</th><th>r</th><th>f</th></tr></thead><tbody>' +
      ['1,T,T,T,?','2,T,T,F,?','3,T,F,T,?','4,T,F,F,?','5,F,T,T,?','6,F,T,F,?','7,F,F,T,?','8,F,F,F,?']
        .map(row => '<tr>' + row.split(',').map(c => '<td>'+c+'</td>').join('') + '</tr>').join('') +
      '</tbody></table>',
    options: ['4', '5', '6', '2'], correct: 0,
    explain: 'f is p XOR q, true whenever p and q differ - 4 of the 8 rows.', distractors: {},
  };

  const R = await p.evaluate(async (Q) => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    const o={};
    go({name:'quiz', mode:'interleaved', questions:[Q]}); await w(1000);
    const host = document.querySelector('.quiz-text');
    o.hostFound = !!host;
    const table = host && host.querySelector('table');
    o.tableFound = !!table;
    const cs = table ? getComputedStyle(table) : null;
    o.tableFontSize = cs ? parseFloat(cs.fontSize) : null;

    // measure at DEFAULT text size first
    const hostRect = host.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    o.tableFitsHost = tableRect.width <= hostRect.width + 1;
    o.tableScrollable = getComputedStyle(table).overflowX === 'auto' || getComputedStyle(table).display === 'block';
    o.noPageOverflow = document.documentElement.scrollWidth <= window.innerWidth + 2;

    // header row + first data row cell alignment (columns must line up, not
    // be independently laid out per row)
    const ths = [...table.querySelectorAll('th')].map(el => Math.round(el.getBoundingClientRect().left));
    const firstRowTds = [...table.querySelectorAll('tbody tr')[0].querySelectorAll('td')].map(el => Math.round(el.getBoundingClientRect().left));
    const secondRowTds = [...table.querySelectorAll('tbody tr')[1].querySelectorAll('td')].map(el => Math.round(el.getBoundingClientRect().left));
    o.columnsAligned = JSON.stringify(firstRowTds) === JSON.stringify(secondRowTds)
      && ths.length === firstRowTds.length
      && ths.every((x,i) => Math.abs(x - firstRowTds[i]) <= 1);

    // short cell values (T/F/?) are centered, not left-hugging
    const sampleTd = table.querySelectorAll('td')[1];  // a "T" cell, not the "#" column
    o.centeredCells = getComputedStyle(sampleTd).textAlign === 'center';
    // the row-number column stays left-aligned (it's a label, not data)
    const labelTd = table.querySelectorAll('td')[0];
    o.labelColumnLeft = getComputedStyle(labelTd).textAlign === 'left';

    // now blow up the "lesson text" zoom to XXL and confirm the table does
    // NOT balloon with it - this is the actual fix for "so much space"
    document.body.classList.add('lesson-text-xxl');
    await w(200);
    const csZoomed = getComputedStyle(table);
    o.fontUnaffectedByZoom = Math.abs(parseFloat(csZoomed.fontSize) - o.tableFontSize) < 0.5;
    const tableRectZoomed = table.getBoundingClientRect();
    o.stillFitsAtZoom = tableRectZoomed.width <= host.getBoundingClientRect().width + 1;
    o.noOverflowAtZoom = document.documentElement.scrollWidth <= window.innerWidth + 2;
    document.body.classList.remove('lesson-text-xxl');

    // review screen: same table, same treatment (quiz-table-host)
    const btn = document.querySelector('.quiz-opt[data-opt="0"]');
    btn.click(); await w(150);
    document.querySelector('[data-submit]')?.click(); await w(400);
    // deferred mode may need to finish the round to reach results
    if (document.querySelector('[data-quit]') && !document.querySelector('.qr-item, [class*="review"]')) {
      // single-question interleaved round finishes immediately in deferred mode too
    }
    await w(300);
    return o;
  }, TABLE_Q);

  for (const [k,v] of Object.entries(R)) ok(k, v===true || k==='tableFontSize', JSON.stringify(v));
  ok('table font-size is a sane fixed size (13-17px)', R.tableFontSize >= 13 && R.tableFontSize <= 17, R.tableFontSize);
  ok('no page errors', errs.length===0, errs.join(' | ').slice(0,300));
  await b.close();
  const bad=F.filter(f=>!f.pass);
  for (const f of F) console.log((f.pass?'PASS':'FAIL')+' '+f.n+(f.pass?'':' -> '+f.x));
  console.log(`quiztable: ${F.length-bad.length}/${F.length} passed`);
  process.exit(bad.length?1:0);
})().catch(e=>{ console.error('HARNESS', e); process.exit(2); });
