// The new chapters must be reachable, unlocked, and render: C959 OA practice,
// D286 lab + PA build (code questions with a textarea), D684 OA/PA sims.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const p = await (await b.newContext({ viewport:{width:834,height:1194} })).newPage();
  // Only app errors count. This sandbox blocks the font CDN, so a failed
  // network resource is the harness, not the page.
  const errs=[]; p.on('console', m => { const t=m.text(); if (m.type()==='error' && !/Failed to load resource|ERR_TUNNEL|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED/.test(t)) errs.push(t.slice(0,120)); });
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000}); await p.waitForTimeout(16000);
  const r = await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms)); const out={};
    for (const cid of ['C959','D286','D684']) { window.__hydrateCourse(cid); }
    await w(2500);
    const chap = cid => (COURSES[cid].chapters||[]).map(c=>c.id);
    out.c959_oa_prac = chap('C959').includes('oa_prac');
    out.d286_lab = chap('D286').includes('oa_lab') && chap('D286').includes('pa_build');
    out.d684_sims = chap('D684').includes('oa_sim') && chap('D684').includes('pa_sim');
    out.c959_practQ = getQuestions('C959','oa_prac','u1').length;
    out.d286_labQ = getQuestions('D286','oa_lab','l3').length + getQuestions('D286','oa_lab','l4').length;
    out.d286_paQ = getQuestions('D286','pa_build','stages').length;
    // getQuestions returns the timed DRAW, not the whole bank; the bank is behind it
    out.d684_oaQ = getQuestions('D684','oa_sim','sim').length;
    out.d684_oaBank = (SAMPLE_QUESTIONS['D684/oa_sim/sim']||[]).length;
    out.d684_paQ = getQuestions('D684','pa_sim','sim').length;
    out.c959_oaDraw = getQuestions('C959','oa_sim','sim').length;
    out.locked = ['C959/oa_prac/u1','D286/oa_lab/l3','D286/pa_build/stages'].filter(k=>{ const [c,ch,s]=k.split('/'); return isSectionLocked(c,ch,s); });
    // a code question renders a textarea
    go({name:'quiz',courseId:'D286',chId:'oa_lab',secId:'l3',mode:'practice'}); await w(2200);
    out.codeTextarea = !!document.querySelector('textarea[data-code-input]');
    out.codeStem = (document.querySelector('.quiz-text')||{}).textContent ? true : false;
    // the new C959 practice section renders with its diagrams
    go({name:'section',courseId:'C959',chId:'oa_prac',secId:'u1'}); await w(2200);
    out.c959SectionSvg = document.querySelectorAll('svg').length;
    // D684 OA sim launches
    go({name:'quiz',courseId:'D684',chId:'oa_sim',secId:'sim',mode:'practice'}); await w(2200);
    out.d684SimRenders = !!document.querySelector('.quiz-text, .quiz-opts');
    return out;
  });
  r.consoleErrors = errs.length;
  console.log(JSON.stringify(r,null,1));
  const ok = r.c959_oa_prac && r.d286_lab && r.d684_sims && r.c959_practQ===30 && r.d286_labQ===16 && r.d286_paQ===6 &&
             r.d684_oaQ===50 && r.d684_oaBank>500 && r.c959_oaDraw===72 && r.locked.length===0 && r.codeTextarea && r.c959SectionSvg>=2 && r.d684SimRenders && errs.length===0;
  console.log(ok ? 'RESULT: new content reachable, unlocked and rendering' : 'RESULT: FAIL ' + JSON.stringify(errs.slice(0,3)));
  await b.close(); process.exit(ok?0:1);
})().catch(e=>{console.log('ERR '+e);process.exit(2);});
