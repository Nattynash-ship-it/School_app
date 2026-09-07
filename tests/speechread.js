// "the voice is still off": Listen fed the lesson's whole innerText to the
// speech engine, so it read code blocks, captured program output, chart labels
// and collapsed worked solutions aloud - character by character. Every worked
// example added made it worse. lessonSpeechText() now walks the lesson and
// keeps only what is meant to be heard.
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport:{width:1194,height:900} });
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(15000);
  const R = await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms)); const o={};
    const open=async(c,ch,s)=>{ try{setCourseState(c,'active');}catch(e){}
      go({name:'class',courseId:c}); await w(1500);
      go({name:'section',courseId:c,chId:ch,secId:s}); await w(2000);
      return document.querySelector('.lesson'); };

    o.fnExists = typeof window.lessonSpeechText === 'function';

    // A lesson dense with executed code: the worst case for the old version.
    let les = await open('AI-AGENTIC','ch4','s3');
    const raw = les.innerText, said = window.lessonSpeechText(les);
    o.shorter        = said.length < raw.length;
    o.noPythonSyntax = !/\bdef \w+\(|\bimport \w|print\(f?["']/.test(said);
    o.noPreText      = [...les.querySelectorAll('pre')].every(pre => {
                         const line=(pre.textContent||'').split('\n').map(s=>s.trim()).filter(s=>s.length>25)[0];
                         return !line || !said.includes(line); });
    o.marksCode      = /Code example, on screen\./.test(said);
    o.marksOutput    = /Program output, on screen\./.test(said);
    o.hasSentences   = said.split('\n').length > 8;
    o.noLoneDots     = (said.match(/^\s*\.\s*$/gm)||[]).length === 0;
    o.noDanglingDash = !/—\s*\.?\s*$/m.test(said);
    // The cleanup must never rewrite the lesson's own words.
    o.keepsRealDots  = said.includes('../../../etc/passwd');
    o.readsProse     = /Never trust LLM-provided arguments/.test(said);
    o.readsInlineCode= /Path\.resolve\(\)/.test(said);

    // A collapsed "Show worked solution" must not be read out - that hands over
    // the answer to a practice problem before it has been attempted.
    les = await open('PHYSC','ch1','s1');
    const said2 = window.lessonSpeechText(les);
    const closed = [...les.querySelectorAll('details:not([open])')];
    o.hasClosedDetails = closed.length > 0;
    o.hidesClosed = closed.every(d => { const body=(d.textContent||'').replace((d.querySelector('summary')||{textContent:''}).textContent,'');
                                        const line=body.split('\n').map(s=>s.trim()).filter(s=>s.length>18)[0];
                                        return !line || !said2.includes(line); });
    o.notLongerThanPage = said2.split(/\s+/).length <= les.innerText.split(/\s+/).length;

    // A prose-only lesson must survive essentially intact.
    les = await open('C959','ch4','s1');
    const said3 = window.lessonSpeechText(les);
    o.proseKept = said3.split(/\s+/).length > les.innerText.split(/\s+/).length * 0.6;

    // Korean lessons still split into per-language runs for the right voice.
    les = await open('LANG-KOR','ch1','s1');
    const said4 = window.lessonSpeechText(les);
    const segs = window.__ttsSegments(said4);
    o.multiLang = segs.length > 1 && new Set(segs.map(s=>s.lang)).size > 1;
    o.segsCovered = segs.map(s=>s.text).join('') === said4;
    return o;
  });
  ok('lessonSpeechText is defined', R.fnExists);
  ok('spoken text is shorter than the raw page', R.shorter);
  ok('no Python syntax is read aloud', R.noPythonSyntax);
  ok('no code block body reaches the speech text', R.noPreText);
  ok('a code block is announced, not silently dropped', R.marksCode);
  ok('captured output is announced, not read', R.marksOutput);
  ok('broken into sentences so the engine pauses', R.hasSentences);
  ok('no lone "." lines', R.noLoneDots);
  ok('no dangling table-cell dash', R.noDanglingDash);
  ok('cleanup never rewrites the lesson text (../../../ intact)', R.keepsRealDots);
  ok('the actual prose is still read', R.readsProse);
  ok('inline code inside a sentence is still read', R.readsInlineCode);
  ok('lesson has collapsed solutions to test against', R.hasClosedDetails);
  ok('a collapsed worked solution is NOT read aloud', R.hidesClosed);
  ok('never reads more than the page shows', R.notLongerThanPage);
  ok('a prose lesson survives essentially intact', R.proseKept);
  ok('Korean lessons still split per language', R.multiLang);
  ok('segments cover the whole text, nothing dropped', R.segsCovered);
  ok('no page errors', errs.length===0, errs.join('|'));
  for (const f of F) console.log((f.pass?'PASS ':'FAIL ')+f.n+(f.x?'  '+f.x:''));
  console.log('speechread: '+F.filter(f=>f.pass).length+'/'+F.length+' passed');
  await b.close();
})().catch(e=>{ console.log('HARNESS '+e); process.exit(2); });
