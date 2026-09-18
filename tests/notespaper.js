// The paper she writes on is a choice, and choosing it never moves her writing.
//
// The pad had one ruling - Cornell - and a draggable straightedge tool. The
// ruler is gone; the ruling is now wide ruled, college ruled, narrow, graph,
// dot grid, Cornell or blank, kept per class.
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:8901/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d || ''))); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await browser.newPage({ viewport: { width: 1194, height: 834 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B, { waitUntil: 'load', timeout: 240000 });
  await p.waitForTimeout(12000);
  await p.evaluate(() => go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }));
  await p.waitForTimeout(2500);
  await p.evaluate(() => window.__notesPanel.open());
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.__notesPanel.tab('write'));
  await p.waitForTimeout(900);

  const R = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const svg = document.getElementById('mn-ink');
    const tools = [...document.querySelectorAll('#mn-dock .mn-tool')].map(b => b.dataset.t);

    // put some writing down, then remember exactly where it is
    const rk = 'pad_' + String(window.__notesPanel.state().key).replace(/[^a-zA-Z0-9_/-]/g, '_');
    const mkS = i => ({ type:'pen', color:'#1b1b1b', width:2, _ts: i,
                        points: Array.from({length:30}, (_,j) => ({ x:120+j*8, y:300+i*40, p:.5 })) });
    gannoSaveStrokes(rk, [mkS(0), mkS(1), mkS(2)]);
    window.__notesPanel.open();
    await w(700);
    const before = JSON.stringify(gannoGetStrokes(rk).map(s => [s.points[0].x, s.points[0].y]));

    const seen = {};
    const ids = ['cornell','college','wide','narrow','graph','dots','blank'];
    for (const id of ids) {
      window.__notesPanel.setPaper(id);
      await w(320);
      const g = svg.querySelector('g.mn-rules');
      seen[id] = {
        rules:   g ? g.querySelectorAll('line.mn-rule').length : -1,
        margins: g ? g.querySelectorAll('line.mn-margin').length : -1,
        labels:  g ? g.querySelectorAll('text').length : -1,
        pattern: g ? g.querySelectorAll('pattern').length : -1,
        nodes:   g ? g.querySelectorAll('*').length : -1
      };
    }
    const after = JSON.stringify(gannoGetStrokes(rk).map(s => [s.points[0].x, s.points[0].y]));

    // the choice sticks to the class, and a different class is free to differ
    window.__notesPanel.setPaper('graph');
    const prefsGraph = window.__notesPanel.paper();
    window.__notesPanel.close(); await w(400);
    go({ name:'section', courseId:'D684', chId:'g1', secId:'x3_1' });
    await w(2200);
    window.__notesPanel.open(); await w(900);
    window.__notesPanel.tab('write'); await w(600);
    const otherClass = window.__notesPanel.paper();
    window.__notesPanel.setPaper('college');
    const otherAfter = window.__notesPanel.paper();
    window.__notesPanel.close(); await w(300);
    go({ name:'section', courseId:'C959', chId:'ch4', secId:'s1' });
    await w(2200);
    window.__notesPanel.open(); await w(900);
    const backToMaths = window.__notesPanel.paper();

    return { tools, seen, moved: before !== after, before, prefsGraph, otherClass, otherAfter, backToMaths,
             pages: window.__notesPanel.page().count };
  });

  ok('the ruler tool is gone from the toolbar', !R.tools.includes('ruler'), R.tools.join(','));
  ok('the straight-line tool is still there', R.tools.includes('line'), R.tools.join(','));
  ok('a paper button took its place', R.tools.includes('paper'), R.tools.join(','));

  const S = R.seen, PG = R.pages;        // the pad opens on three pages, so counts are per page
  ok('Cornell still draws its cue column and its labels',
     S.cornell.margins === PG && S.cornell.labels === 5 * PG && S.cornell.rules > 20 * PG,
     PG + ' pages, ' + JSON.stringify(S.cornell));
  ok('wide ruled has a line every 11/32 in, NO left margin rule (her request: Cornell only), and no Cornell labels',
     S.wide.rules > 20 * PG && S.wide.margins === 0 && S.wide.labels === 0,
     PG + ' pages, ' + JSON.stringify(S.wide));
  ok('college and narrow ruled have no left margin rule either',
     S.college.margins === 0 && S.narrow.margins === 0, JSON.stringify({ college: S.college.margins, narrow: S.narrow.margins }));
  ok('college ruled fits more lines on the page than wide ruled',
     S.college.rules > S.wide.rules, S.college.rules + ' vs ' + S.wide.rules);
  ok('narrow ruled fits more again', S.narrow.rules > S.college.rules,
     S.narrow.rules + ' vs ' + S.college.rules);
  ok('graph paper is one tiled pattern, not thousands of lines',
     S.graph.pattern === 1 && S.graph.nodes < 40, JSON.stringify(S.graph));
  ok('dot grid likewise', S.dots.pattern === 1 && S.dots.nodes < 40, JSON.stringify(S.dots));
  ok('blank paper draws no ruling at all',
     S.blank.rules === 0 && S.blank.margins === 0 && S.blank.pattern === 0, JSON.stringify(S.blank));
  ok('changing the paper never moves her writing', R.moved === false, R.before);

  /* Picking paper sets this class AND the one a class she has not chosen for
     opens with - so choosing graph once carries into the next maths class
     rather than making her pick it again in every section. */
  ok('a class she has not set opens on the last paper she picked', R.otherClass === 'graph',
     'other class opened on ' + R.otherClass);
  ok('and once set, each class keeps its own', R.otherAfter === 'college' && R.backToMaths === 'graph',
     'other class ' + R.otherAfter + ', maths class ' + R.backToMaths);
  /* A CLASS SHE HAS ALREADY WRITTEN IN KEEPS ITS PAPER.
     Picking a paper used to set the default every other class opened with, so
     trying one out re-papered pages that were already full - Cornell notes,
     written in two columns against a cue divider at 2.5in, redrawn on ruled
     paper whose margin is at 1.25in. The writing never moved; the lines under
     it did. That is what "the notes have gotten jumbled" meant. */
  const K = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    // start clean: no per-class choices anywhere
    store.padPrefs = {};
    const key = 'C959/ch4/s1';
    const mk = i => ({ type:'pen', color:'#1b1b1b', width:2, _ts:i,
      points: Array.from({length:20}, (_,j) => ({ x:120+j*9, y:300+i*60, p:.5 })) });
    // she has written in this class
    gannoSaveStrokes('pad_' + key.replace(/[^a-zA-Z0-9_/-]/g,'_'), [mk(0), mk(1)]);
    store.padNotes = store.padNotes || {};
    store.padNotes[key] = { n: 2, h: 1294, ts: Date.now() };
    saveStore(); if (saveStore.flushNow) saveStore.flushNow();
    await w(300);

    // she tries graph paper on a DIFFERENT class
    window.__notesPanel.close(); await w(300);
    go({ name:'section', courseId:'D684', chId:'g1', secId:'x3_1' });
    await w(2200);
    window.__notesPanel.open(); await w(900);
    window.__notesPanel.setPaper('graph');
    const other = window.__notesPanel.paper();

    // the class she has already filled must be untouched
    window.__notesPanel.close(); await w(300);
    go({ name:'section', courseId:'C959', chId:'ch4', secId:'s1' });
    await w(2200);
    window.__notesPanel.open(); await w(900);
    const written = window.__notesPanel.paper();

    // but she can still choose for that class herself, and it sticks
    window.__notesPanel.setPaper('wide');
    const chosen = window.__notesPanel.paper();
    window.__notesPanel.close(); await w(300);
    go({ name:'section', courseId:'C959', chId:'ch4', secId:'s1' });
    await w(2000);
    window.__notesPanel.open(); await w(800);
    const stillChosen = window.__notesPanel.paper();
    return { other, written, chosen, stillChosen };
  });

  ok('trying a paper on one class does not re-paper a class already written in',
     K.written === 'cornell', 'the written-in class opened on ' + K.written);
  ok('the class she picked it on keeps it', K.other === 'graph', K.other);
  ok('and she can still choose for a class she has written in', K.chosen === 'wide', K.chosen);
  ok('that choice sticks', K.stillChosen === 'wide', K.stillChosen);

  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(`notespaper: ${pass}/${pass + fail} passed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
