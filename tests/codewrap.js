// Multi-line code questions must render as code blocks everywhere a stem is shown:
// the section quiz (raw newlines), and the exam sim (authored <pre> must not show as tags).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const p = await (await b.newContext({ viewport:{width:834,height:1194} })).newPage();
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000}); await p.waitForTimeout(16000);
  const r = await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    const all=getQuestions('D286','u3','z3_5');
    const nl=all.filter(q=>/\n/.test(q.text) && !/<pre/.test(q.text));
    SAMPLE_QUESTIONS['D286/u3/z3_5']=nl;
    go({name:'quiz',courseId:'D286',chId:'u3',secId:'z3_5',mode:'practice'}); await w(2500);
    const el=document.querySelector('.quiz-text');
    const pre=el.querySelector('pre.qcode');
    const shownQ = nl.find(q=>el.textContent.replace(/\s+/g,' ').trim().startsWith(q.text.replace(/\s+/g,' ').trim().slice(0,40))) || nl[0];
    const codeLines = pre ? pre.textContent.split('\n').length : 0;
    const range=document.createRange(); range.selectNodeContents(pre||el);
    const rendered=new Set([...range.getClientRects()].map(r=>Math.round(r.top))).size;
    // exam sim with an authored <pre> question (D684 trace drill)
    const tq=(getQuestions('D684','trace_drill','t1')||[]).find(q=>/<pre/.test(q.text));
    runExamSim('D684',1,600,[tq]); await w(1200);
    const sim=document.querySelector('.quiz-text'); const simHasPre=!!(sim&&sim.querySelector('pre')); const simRawTags=!!(sim&&/<pre/.test(sim.textContent));
    try{ if(examState&&examState._tick) clearInterval(examState._tick);}catch(e){}
    return { sourceLines: shownQ.text.split('\n').length, hasPre: !!pre, codeLines, renderedLines: rendered, mono: pre?getComputedStyle(pre).fontFamily.slice(0,20):'', simHasPre, simRawTags };
  });
  console.log(JSON.stringify(r));
  const ok = r.hasPre && r.codeLines>=2 && r.renderedLines>=2 && r.simHasPre && !r.simRawTags;
  console.log(ok ? 'RESULT: code keeps its lines in the quiz and the exam sim' : 'RESULT: FAIL');
  await b.close(); process.exit(ok?0:1);
})().catch(e=>{console.log('ERR '+e);process.exit(2);});
