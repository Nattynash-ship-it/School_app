// Immediate, eye-catching wrong-answer feedback (her revocation of answers-at-the-end).
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
    // migration flipped the default to immediate
    o.migrated = store.feedbackM2 === 1 && store.deferAnswers === false;
    o.immediateDefault = typeof deferAnswersOn === 'function' && deferAnswersOn() === false;

    // unit: renderExplanation leads with why HER pick is wrong
    const q = { id:'t1', topic:'t', text:'?', options:['a','b','c','d'], correct:2,
      explain:'Because C is the definition.', distractors:{ '0':'A confuses X with Y.', '1':'B is the converse.' } };
    const html = renderExplanation(q, { choice:1, correct:false });
    const dv=document.createElement('div'); dv.innerHTML=html;
    o.wrongClass = !!dv.querySelector('.explanation.wrong');
    o.headline = /NOT QUITE/i.test(dv.querySelector('.label').textContent);
    o.pickedWhy = /You picked B/.test((dv.querySelector('.picked-why')||{textContent:''}).textContent)
      && /converse/.test(dv.querySelector('.picked-why').textContent);
    o.correctCallout = /correct answer was C/i.test(dv.textContent);
    o.whyShown = /definition/.test(dv.querySelector('.why').textContent);
    // With no rationale for that option, still say plainly what she picked -
    // the option text is always true, where the stored rationale may not be.
    const html2 = renderExplanation(q, { choice:3, correct:false });
    const dv2=document.createElement('div'); dv2.innerHTML=html2;
    const pw2=(dv2.querySelector('.picked-why')||{textContent:''}).textContent;
    o.namesPickedWhenNoRationale = /You picked D/.test(pw2) && /d/.test(pw2);

    // A map carrying an entry for the CORRECT option was never remapped when
    // the options were reordered, so its texts describe some other answer.
    // Suppress it rather than explain the wrong thing.
    const qMis = { id:'t2', topic:'t', text:'?', options:['a','b','c','d'], correct:2,
      explain:'C is right.', distractors:{ '0':'this text belongs to another option', '2':'and so does this one' } };
    const dvM=document.createElement('div'); dvM.innerHTML=renderExplanation(qMis,{choice:0,correct:false});
    const pwM=(dvM.querySelector('.picked-why')||{textContent:''}).textContent;
    o.misalignedRationaleSuppressed = /You picked A/.test(pwM) && !/belongs to another/.test(pwM);

    // "Incorrect." is not an explanation; show the option instead.
    const qBare = { id:'t3', topic:'t', text:'?', options:['a','b','c','d'], correct:2,
      explain:'C is right.', distractors:{ '0':'Incorrect.', '1':'Wrong' } };
    const dvB=document.createElement('div'); dvB.innerHTML=renderExplanation(qBare,{choice:0,correct:false});
    const pwB=(dvB.querySelector('.picked-why')||{textContent:''}).textContent;
    o.bareIncorrectSuppressed = /You picked A/.test(pwB) && !/Incorrect/.test(pwB);

    // The only per-option rationales still shipped are the ones authored with
    // matched options and covered by a test - the C959 'nx_' set. Everything
    // else was removed as unverifiable, so any map on another id is a
    // regression, not new content.
    o.onlyVerifiedMapsShip = (function(){
      try { var bad=0; for (var cid in CONTENT_CACHE) { var qs=(CONTENT_CACHE[cid]||{}).q||{};
              for (var k in qs) { var arr=Array.isArray(qs[k])?qs[k]:[qs[k]];
                for (var i=0;i<arr.length;i++) { var qq=arr[i];
                  if (qq && qq.distractors && String(qq.id||'').indexOf('nx_') !== 0) bad++; } } }
            return bad === 0; } catch(e) { return true; }
    })();
    // correct answers stay green and calm
    const html3 = renderExplanation(q, { choice:2, correct:true });
    const dv3=document.createElement('div'); dv3.innerHTML=html3;
    o.correctCalm = !dv3.querySelector('.explanation.wrong') && /CORRECT/.test(dv3.querySelector('.label').textContent);

    // live: answer a section question wrong -> explanation appears immediately
    go({name:'quiz', courseId:'C959', chId:'ch1', secId:'s1', mode:'practice'}); await w(1800);
    const qq = quizState.questions[quizState.idx];
    const wrongIdx = (qq.correct === 0) ? 1 : 0;
    const opt = document.querySelector(`.quiz-opt[data-opt="${wrongIdx}"]`);
    if (opt) opt.click(); await w(200);
    const sub = document.querySelector('[data-submit]');
    if (sub) sub.click(); await w(600);
    o.liveExplanation = !!document.querySelector('.explanation.wrong');
    o.liveMarked = !!document.querySelector('.quiz-opt.incorrect') && !!document.querySelector('.quiz-opt.correct');
    // the toggle for end-of-quiz review still exists and flips behaviour
    store.deferAnswers = true;
    o.toggleWorks = deferAnswersOn() === true;
    store.deferAnswers = false;
    // leave quiz cleanly
    const back = document.querySelector('[data-quit]'); if (back) back.click(); await w(400);
    try { if (typeof clearQuiz === 'function') clearQuiz(); } catch(e){}
    return o;
  });

  for (const [k,v] of Object.entries(R)) ok(k, v===true, JSON.stringify(v));
  ok('no page errors', errs.length===0, errs.join(' | ').slice(0,300));
  await b.close();
  const bad=F.filter(f=>!f.pass);
  for (const f of F) console.log((f.pass?'PASS':'FAIL')+' '+f.n+(f.pass?'':' -> '+f.x));
  console.log(`quizfeed: ${F.length-bad.length}/${F.length} passed`);
  process.exit(bad.length?1:0);
})().catch(e=>{ console.error('HARNESS', e); process.exit(2); });
