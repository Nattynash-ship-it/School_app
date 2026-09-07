// Portfolio: the Correspondence Team chapter exists and renders as a real
// project page (diagram, tables, numbered steps, callouts, 10 questions),
// the duplicate chapters are gone, legacy projects have numbered steps and
// no junk definitions table, and Home shows the new folder.
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport:{width:1194,height:834} });
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  p.on('dialog', d => d.accept());
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(15000);
  const R = await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    const o = {};
    go({name:'class', courseId:'PORTFOLIO'}); await w(2500);   // forces the content file to load
    const c = COURSES.PORTFOLIO;
    o.chapterIds = c.chapters.map(x => x.id);
    const team = c.chapters.find(x => x.id === 'team');
    o.teamSections = team ? team.sections.map(s => s.id) : [];
    o.teamObjectives = team ? team.sections.map(s => (s.objectives||[]).length) : [];
    o.classText = document.getElementById('app').innerText.slice(0, 400);
    const secs = [['team','pa1'],['team','pau1'],['team','pbi1'],['team','py1'],['team','py2'],['team','pau2'],['team','cap']];
    o.pages = [];
    for (const [ch, s] of secs) {
      go({name:'section', courseId:'PORTFOLIO', chId:ch, secId:s}); await w(900);
      const app = document.getElementById('app'); const les = app.querySelector('.lesson');
      const qs = getQuestions('PORTFOLIO', ch, s);
      o.pages.push({ s, h2: !!(les && les.querySelector('h2')), svg: les ? les.querySelectorAll('svg').length : 0, tables: les ? les.querySelectorAll('table').length : 0,
        ols: les ? les.querySelectorAll('ol').length : 0, callouts: les ? les.querySelectorAll('.callout').length : 0, defglance: !!(les && les.querySelector('[data-defglance]')),
        prove: /PROVE YOU CAN DO/i.test(app.innerText), q: qs.length, textLen: les ? les.innerText.length : 0,
        notInBuild: /isn’t in this build/.test(app.innerText) });
    }
    // a legacy project: converted steps, no def-glance
    go({name:'section', courseId:'PORTFOLIO', chId:'python', secId:'p1'}); await w(900);
    const les2 = document.querySelector('.lesson');
    o.legacy = { buildSteps: les2 ? les2.querySelectorAll('ol.build-steps').length : 0, stepItems: les2 ? les2.querySelectorAll('ol.build-steps > li').length : 0,
      defglance: !!(les2 && les2.querySelector('[data-defglance]')), checkpoints: les2 ? [...les2.querySelectorAll('.callout-label')].filter(x => /CHECKPOINT/.test(x.textContent)).length : 0 };
    go({name:'section', courseId:'PORTFOLIO', chId:'papps', secId:'p1'}); await w(900);
    const les3 = document.querySelector('.lesson');
    o.legacy2 = { buildSteps: les3 ? les3.querySelectorAll('ol.build-steps').length : 0, defglance: !!(les3 && les3.querySelector('[data-defglance]')) };
    // cheat sheet entry
    const cheat = c.chapters.find(x => x.id === 'cheat');
    const cs = cheat.sections.find(x => /Correspondence Team/.test(x.title));
    if (cs) { go({name:'section', courseId:'PORTFOLIO', chId:'cheat', secId:cs.id}); await w(800); o.cheat = { id: cs.id, cards: document.querySelectorAll('.lesson div[style*="border-left:3px"]').length, titles: cheat.sections.map(x => x.title) }; }
    // home folder
    go({name:'projects'}); await w(1500);
    const appP = document.getElementById('app');
    const folder = appP.querySelector('[data-folder="portfolio-team"]');
    const cards = appP.querySelectorAll('[data-portfolio-project^="team/"]').length;
    o.home = { folder: !!folder || /Correspondence Team Projects/.test(appP.innerText), cards, title: (appP.innerText.match(/Correspondence Team Projects[^\n]*/)||[''])[0].slice(0,60), sample: appP.innerText.slice(0,200) };
    // the Projects screen track with trackable tasks + a link to the guide
    go({name:'project-track', trackId:'correspondence-team'}); await w(1000);
    o.track = { cards: document.querySelectorAll('[data-project^="team-"]').length, name: document.querySelector('h1') ? document.querySelector('h1').textContent.trim() : '' };
    go({name:'project', trackId:'correspondence-team', projectId:'team-pa1'}); await w(1000);
    const pr = document.getElementById('app');
    o.trackProject = { tasks: pr.querySelectorAll('.proj-task-li').length, guideBtn: !!pr.querySelector('[data-act="guide"]'), learn: pr.innerText.includes("You'll learn") };
    pr.querySelector('[data-act="guide"]')?.click(); await w(1000);
    o.guideOpens = /Correspondence Queue: Team Intake/.test(document.getElementById('app').innerText) && !!document.querySelector('.lesson svg');
    return o;
  });
  ok('Projects screen has the Correspondence Team track with 7 projects', R.track.cards === 7 && /Correspondence Team/.test(R.track.name), JSON.stringify(R.track));
  ok('a track project has a tickable task list and a Full build guide button', R.trackProject.tasks >= 6 && R.trackProject.guideBtn && R.trackProject.learn, JSON.stringify(R.trackProject));
  ok('the guide button opens the PORTFOLIO lesson with the diagram', R.guideOpens, R.guideOpens);
  ok('PORTFOLIO chapters include team, and the duplicate ch2/ch3 are gone', R.chapterIds.includes('team') && !R.chapterIds.includes('ch2') && !R.chapterIds.includes('ch3'), R.chapterIds.join(','));
  ok('team chapter has the 7 projects in build order', R.teamSections.join(',') === 'pa1,pau1,pbi1,py1,py2,pau2,cap', R.teamSections.join(','));
  ok('every team project has objectives', R.teamObjectives.every(n => n >= 3), R.teamObjectives.join(','));
  for (const pg of R.pages) {
    ok(`team/${pg.s} renders as a full project page (title, diagram, table, numbered steps, callouts, objectives)`, pg.h2 && pg.svg >= 1 && pg.tables >= 1 && pg.ols >= 3 && pg.callouts >= 3 && pg.prove && !pg.notInBuild && pg.textLen > 4000, JSON.stringify(pg));
    ok(`team/${pg.s} has 10 questions and no junk definitions table`, pg.q === 10 && !pg.defglance, `q=${pg.q} defglance=${pg.defglance}`);
  }
  ok('legacy Python project now has numbered build steps with checkpoints and no definitions table', R.legacy.buildSteps >= 3 && R.legacy.stepItems >= 8 && !R.legacy.defglance && R.legacy.checkpoints >= 2, JSON.stringify(R.legacy));
  ok('legacy Power Apps project converted too', R.legacy2.buildSteps >= 3 && !R.legacy2.defglance, JSON.stringify(R.legacy2));
  ok('cheat sheet has a Correspondence Team entry with 7 cards and no "More ..." duplicates', R.cheat && R.cheat.cards === 7 && !R.cheat.titles.some(t => /^More /.test(t)), JSON.stringify(R.cheat));
  ok('no page errors', errs.length===0, errs.join('|').slice(0,300));
  await p.evaluate(async () => { const w=ms=>new Promise(r=>setTimeout(r,ms)); go({name:'section', courseId:'PORTFOLIO', chId:'team', secId:'pa1'}); await w(900); });
  await p.screenshot({ path: 'team-pa1.png', fullPage: false });
  await p.evaluate(async () => { const w=ms=>new Promise(r=>setTimeout(r,ms)); window.scrollTo(0, 900); await w(300); });
  await p.screenshot({ path: 'team-pa1-steps.png' });
  await b.close();
  const bad=F.filter(f=>!f.pass);
  for (const f of F) console.log((f.pass?'PASS':'FAIL')+' '+f.n+(f.pass?'':' -> '+f.x));
  console.log(`portfolio: ${F.length-bad.length}/${F.length} passed`);
  process.exit(bad.length?1:0);
})().catch(e=>{ console.error('HARNESS', e); process.exit(2); });
