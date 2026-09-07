// "When a class is passed remove it from list and add it to mastered and be
// sure to show site wide that the class has passed."
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport:{width:1194,height:834} });
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  p.on('dialog', d => d.accept());   // Undo/confirm dialogs: proceed
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(16000);

  const R = await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    const o={};
    // D197 (Version Control) is one of the four focus courses and already active.
    const cid = 'D197';
    setCourseState(cid, 'active');
    o.startActive = getCourseState(cid) === 'active';
    o.startInActiveList = getActiveCourses().includes(cid);

    // ---- unit: markCoursePassed ----
    const before = activeCourseCount();
    markCoursePassed(cid, true);
    o.stateNowPassed = getCourseState(cid) === 'passed';
    o.isCoursePassedTrue = isCoursePassed(cid);
    o.removedFromActiveList = !getActiveCourses().includes(cid);
    o.freedASlot = activeCourseCount() === before - 1;
    o.dashStatusMastered = dashStatus(COURSES[cid]) === 'mastered';

    // classPlan row marked done (plan rebuilt if needed)
    store.classPlanV = null;
    if (typeof ensurePlanData === 'function') ensurePlanData();
    const row = (store.classPlan || []).find(r => r.id === cid);
    o.planRowDone = !!(row && row.done);

    // dashCard shows the PASSED badge and an Undo action, not Pause/Activate
    const cardHtml = dashCard(COURSES[cid]);
    o.badgeShown = /PASSED/.test(cardHtml) && /dash-badge-passed/.test(cardHtml);
    o.undoAction = /data-dash-unpass="D197"/.test(cardHtml);
    o.noPauseAction = !/data-dash-pause="D197"/.test(cardHtml);
    o.noActivateAction = !/data-dash-activate="D197"/.test(cardHtml);

    // ---- site-wide: home screen ----
    go({name:'home'}); await w(1200);
    document.querySelectorAll('[data-chip]').forEach(b => { if (b.getAttribute('data-chip')==='mastered') b.click(); });
    await w(300);
    o.homeMasteredShowsIt = !!document.querySelector('.dash-card[data-cid="D197"]');
    document.querySelectorAll('[data-chip]').forEach(b => { if (b.getAttribute('data-chip')==='active') b.click(); });
    await w(300);
    o.homeActiveHidesIt = !document.querySelector('.dash-card[data-cid="D197"]');
    document.querySelectorAll('[data-chip]').forEach(b => { if (b.getAttribute('data-chip')==='all') b.click(); });
    await w(300);
    o.homeCardBadge = (() => {
      const card = document.querySelector('.dash-card[data-cid="D197"]');
      return !!card && /PASSED/.test(card.querySelector('.dash-badge')?.textContent || '');
    })();

    // ---- site-wide: class page banner ----
    go({name:'class', courseId: cid}); await w(600);
    o.classPageBanner = document.body.innerText.includes('Exam passed');
    o.classPageNoMarkButton = !document.querySelector('[data-mark-passed]');
    o.classPageHasUndo = !!document.querySelector('[data-unpass-course]');

    // ---- site-wide: never recommended to continue studying ----
    store.lastViewed = { courseId: cid, chId: 'ch1', secId: 's1' };
    const next = smartNextSection();
    o.neverSuggestedToContinue = !next || next.courseId !== cid;

    // ---- site-wide: quick burst never lands on it ----
    if (typeof window.__startBurst === 'function') {
      go({name:'home'}); await w(500);
      // pickBite is internal; call the burst and confirm it does NOT navigate to D197
      window.__startBurst(); await w(600);
      o.burstNeverPicksIt = !(typeof view === 'object' && view && view.courseId === cid);
      try { if (pomo && pomo.running) pomoStop(true); } catch(e){}
    } else { o.burstNeverPicksIt = true; }

    // ---- undo from the class page ----
    go({name:'class', courseId: cid}); await w(500);
    o.hasUnpassBtnBeforeClick = !!document.querySelector('[data-unpass-course]');
    document.querySelector('[data-unpass-course]')?.click(); await w(500);
    // Undo puts her back where she was: actively studying it (not locked -
    // that would need a separate Activate tap for something she didn't
    // mean to remove from her active courses).
    o.undoReverted = getCourseState(cid) === 'active' && !isCoursePassed(cid) && getActiveCourses().includes(cid);
    o.undoShowsMarkButton = !!document.querySelector('[data-mark-passed]');

    // ---- mark passed again from the class page button, verify banner appears ----
    document.querySelector('[data-mark-passed]')?.click(); await w(500);
    o.markFromClassPage = isCoursePassed(cid) && document.body.innerText.includes('Exam passed');

    // cleanup: leave the course reasonably as it was (active, not passed)
    markCoursePassed(cid, false);
    setCourseState(cid, 'active');
    store.classPlanV = null;
    saveStore();
    return o;
  });

  for (const [k,v] of Object.entries(R)) ok(k, v===true, JSON.stringify(v));
  ok('no page errors', errs.length===0, errs.join(' | ').slice(0,300));
  await b.close();
  const bad=F.filter(f=>!f.pass);
  for (const f of F) console.log((f.pass?'PASS':'FAIL')+' '+f.n+(f.pass?'':' -> '+f.x));
  console.log(`coursepassed: ${F.length-bad.length}/${F.length} passed`);
  process.exit(bad.length?1:0);
})().catch(e=>{ console.error('HARNESS', e); process.exit(2); });
