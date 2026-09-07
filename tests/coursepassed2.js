// Edge case: undoing a pass while the active-course limit is full. Undo
// always removes the "passed" record (unambiguous, always succeeds); whether
// it ALSO puts her back in the active rotation depends on room, exactly like
// reactivating anything else - and must never silently bump another course,
// claim false success, or leave her looking at a stray "you're locked out"
// modal on the very page whose button she just pressed.
// activeCourseCount is stubbed to force the "at the limit" branch
// deterministically, rather than depending on the catalog being large enough
// to actually fill V2_ACTIVE_LIMIT (12) real course slots.
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport:{width:1194,height:834} });
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  p.on('dialog', d => d.accept());   // the Undo button's confirm() - always proceed
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(16000);

  const R = await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    const o={};
    o.limit = V2_ACTIVE_LIMIT;

    setCourseState('D197', 'active');
    markCoursePassed('D197', true);
    o.passedOk = isCoursePassed('D197') && getCourseState('D197') === 'passed';

    go({name:'class', courseId:'D197'}); await w(700);
    o.hasUndoBtn = !!document.querySelector('[data-unpass-course]');

    // Force "at the limit" for this one click only.
    const origCount = window.activeCourseCount;
    window.activeCourseCount = function(){ return V2_ACTIVE_LIMIT; };
    document.querySelector('[data-unpass-course]').click();
    await w(500);
    window.activeCourseCount = origCount;

    // The pass is unambiguously undone...
    o.noLongerPassed = !isCoursePassed('D197');
    // ...but reactivation was blocked by the (forced) limit, so it landed
    // locked, not active - and NOT silently left claiming to be passed
    // either. Nothing about this is destructive or stuck: one more tap
    // (Activate, from Home, or this same "I passed this exam" button if she
    // reconsiders) is all it takes from here.
    o.landedLocked = getCourseState('D197') === 'locked';
    o.noFalseSuccessToast = (() => {
      const t = document.querySelector('.toast');
      return !t || !/moved back/i.test(t.textContent || '');
    })();
    o.noStrayLockModal = !document.querySelector('.v2-modal-bg');
    o.pageStillUsable = !!document.querySelector('h1') && document.querySelector('h1').textContent.length > 0;
    o.markPassedBtnBack = !!document.querySelector('[data-mark-passed]');

    // With the real (unforced) limit and nothing else contending, marking
    // it passed and undoing it again succeeds cleanly end to end.
    document.querySelector('[data-mark-passed]')?.click(); await w(400);
    document.querySelector('[data-unpass-course]')?.click(); await w(400);
    o.undoSucceedsNormally = !isCoursePassed('D197') && getCourseState('D197') === 'active';
    o.normalToastShown = (() => {
      const t = document.querySelector('.toast');
      return !!t && /moved back/i.test(t.textContent || '');
    })();

    setCourseState('D197', 'active');
    saveStore();
    return o;
  });

  for (const [k,v] of Object.entries(R)) ok(k, v===true || k==='limit', JSON.stringify(v));
  ok('limit reads as a sane positive number', R.limit > 0, R.limit);
  ok('no page errors', errs.length===0, errs.join(' | ').slice(0,300));
  await b.close();
  const bad=F.filter(f=>!f.pass);
  for (const f of F) console.log((f.pass?'PASS':'FAIL')+' '+f.n+(f.pass?'':' -> '+f.x));
  console.log(`coursepassed2: ${F.length-bad.length}/${F.length} passed`);
  process.exit(bad.length?1:0);
})().catch(e=>{ console.error('HARNESS', e); process.exit(2); });
