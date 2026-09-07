// "the page in the notes keeps shifting when I scroll": auto-grow used to fire
// on the scroll event itself and rebuild every stroke; the axis lock ended at
// touchend so momentum could drift sideways. Now: grow only after the scroll
// settles, refresh only the rules, keep the lock until the scroll is quiet.
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport:{width:1194,height:834}, hasTouch:true });
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(16000);
  const R = await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms)); const o={};
    go({name:'section',courseId:'C959',chId:'ch4',secId:'s1'}); await w(1600);
    window.__notesPanel.open(); await w(1000);
    window.__notesPanel.tab('write'); await w(300);
    const svg = document.getElementById('mn-ink'), pages = document.getElementById('mn-pages');
    const r = svg.getBoundingClientRect();
    const pen=(t,x,y)=>svg.dispatchEvent(new PointerEvent(t,{pointerId:5,pointerType:'pen',isPrimary:true,clientX:x,clientY:y,pressure:.5,bubbles:true,cancelable:true}));
    for (const y of [90,140,190]) { pen('pointerdown', r.left+60, r.top+y); for (let k=1;k<=8;k++) pen('pointermove', r.left+60+k*16, r.top+y); pen('pointerup', r.left+188, r.top+y); await w(100); }
    o.strokes = window.__notesPanel.state().strokes;
    o.rulesGroup = !!svg.querySelector('g.mn-rules');
    const paths=[...svg.querySelectorAll('path')]; paths.forEach((el,i)=>el.dataset.probe='orig'+i); o.paths=paths.length;
    const pagesBefore = svg.getAttribute('viewBox');
    const fire = () => pages.dispatchEvent(new Event('scroll'));
    // 1. a scroll that reaches the foot but keeps moving must not grow the page while it moves
    pages.scrollTop = pages.scrollHeight; fire(); await w(60); fire(); await w(60); fire(); await w(60); fire();
    o.noGrowWhileMoving = svg.getAttribute('viewBox') === pagesBefore;
    const topBefore = pages.scrollTop;
    // 2. once still, it grows by one page - and every stroke node is the same element
    await w(400);
    o.grewWhenSettled = svg.getAttribute('viewBox') !== pagesBefore;
    o.viewBoxAfter = svg.getAttribute('viewBox');
    const after=[...svg.querySelectorAll('path')];
    o.sameNodes = after.length === paths.length && after.every((el,i)=>el.dataset.probe==='orig'+i);
    o.rulesStillFirst = svg.firstElementChild && svg.firstElementChild.classList.contains('mn-rules');
    o.scrollKept = Math.abs(pages.scrollTop - topBefore) <= 1;
    o.scrollTopBefore = topBefore; o.scrollTopAfter = pages.scrollTop;
    // 3. only one page per settle, not a burst
    fire(); await w(400);
    o.onePerPull = svg.getAttribute('viewBox') === o.viewBoxAfter;
    // 4. axis lock survives the lift: a vertical gesture switches the cross
    // axis off outright (overflow-x/y: hidden) instead of fighting a drift
    // tick by tick, and that lock must still be engaged through the lift and
    // released only once the scroll goes quiet. Real drift comes from native
    // touch/momentum scrolling, which overflow:hidden blocks outright;
    // JS writing scrollLeft directly isn't blocked by it (browsers allow a
    // programmatic scrollTo even on an overflow:hidden axis), so that is not
    // a faithful stand-in for the threat this defends against - check the
    // mechanism (the style) rather than trying to out-write it.
    const canScrollX = pages.scrollWidth > pages.clientWidth + 10; o.canScrollX = canScrollX;
    const touch=(t,x,y)=>{ const tt=new Touch({identifier:1,target:pages,clientX:x,clientY:y}); pages.dispatchEvent(new TouchEvent(t,{touches:t==='touchend'?[]:[tt],changedTouches:[tt],bubbles:true,cancelable:true})); };
    pages.scrollTop = 0; pages.scrollLeft = 0; await w(300);
    touch('touchstart', r.left+150, r.top+300); touch('touchmove', r.left+152, r.top+240); fire();
    o.pinnedOnCommit = !canScrollX || pages.scrollLeft === 0;
    o.crossAxisOffOnCommit = !canScrollX || getComputedStyle(pages).overflowX === 'hidden';
    touch('touchend', r.left+152, r.top+240);
    pages.scrollTop = 30; fire();                              // vertical momentum continues past the lift
    o.pinnedAfterLift = !canScrollX || getComputedStyle(pages).overflowX === 'hidden';
    o.verticalKept = pages.scrollTop === 30;
    await w(400);                                              // the scroll goes quiet: lock released
    o.releasedWhenQuiet = !canScrollX || getComputedStyle(pages).overflowX !== 'hidden';
    pages.scrollLeft = 40; fire();
    o.scrollableAfterRelease = !canScrollX || pages.scrollLeft === 40;
    // 5. a dock wide enough that the page fits without zoom gets pure native
    // scrolling: no horizontal overflow possible at all, no JS in the loop.
    o.zoomedByDefault = document.getElementById('mn-pages').classList.contains('mn-zoomed');
    // force the bottom-sheet placement: full viewport width (left:0;right:0),
    // wide enough at this viewport that the page fits without zooming
    if (!store.padPrefs) store.padPrefs = {};
    store.padPrefs.place = 'bottom'; store.padPrefs.placeM2 = 1; saveStore();
    window.dispatchEvent(new Event('resize')); await w(250);
    o.unzoomedAtWideDock = !pages.classList.contains('mn-zoomed');
    o.nativeVerticalOnly = getComputedStyle(pages).overflowX === 'hidden' && getComputedStyle(pages).touchAction === 'pan-y';
    delete store.padPrefs.place; saveStore();
    window.dispatchEvent(new Event('resize')); await w(250);
    o.rezoomedBack = pages.classList.contains('mn-zoomed');
    return o;
  });
  ok('three strokes drawn', R.strokes===3, R.strokes);
  ok('rules are their own group', R.rulesGroup);
  ok('no growth while the scroll is still moving', R.noGrowWhileMoving);
  ok('grows by a page once the scroll settles', R.grewWhenSettled, R.viewBoxAfter);
  ok('growing keeps every stroke node (no full redraw)', R.sameNodes);
  ok('rules stay underneath the ink', R.rulesStillFirst);
  ok('scroll position untouched by the growth', R.scrollKept, R.scrollTopBefore+' -> '+R.scrollTopAfter);
  ok('one page per settle, not a burst', R.onePerPull);
  ok('cross axis pinned the instant the gesture commits', R.pinnedOnCommit, 'canScrollX='+R.canScrollX);
  ok('cross axis switched off (overflow:hidden) on commit, not corrected tick by tick', R.crossAxisOffOnCommit);
  ok('cross axis stays off through the lift and momentum', R.pinnedAfterLift, 'canScrollX='+R.canScrollX);
  ok('the locked axis still scrolls', R.verticalKept);
  ok('lock released once the scroll is quiet', R.releasedWhenQuiet);
  ok('cross axis scrollable again after release', R.scrollableAfterRelease);
  ok('narrow dock is zoomed by default (the common case this fix targets)', R.zoomedByDefault);
  ok('a dock wide enough to fit drops out of zoom', R.unzoomedAtWideDock);
  ok('unzoomed: pure native vertical-only scrolling, no JS lock needed', R.nativeVerticalOnly);
  ok('narrowing back re-engages zoom', R.rezoomedBack);
  ok('no page errors', errs.length===0, errs.join('|'));
  for (const f of F) console.log((f.pass?'PASS ':'FAIL ')+f.n+(f.x?'  '+f.x:''));
  console.log('padscroll: '+F.filter(f=>f.pass).length+'/'+F.length+' passed');
  await b.close();
})().catch(e=>{ console.log('HARNESS '+e); process.exit(2); });
