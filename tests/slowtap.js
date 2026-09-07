// "Everything is delaying - closing the notes, closing the calculator. What is
//  the delay?"
//
// Measured here at a quarter of an iPad's speed, those actions settle in
// 69-131ms with the main thread never blocked once, and ten idle seconds
// produce zero long tasks. So the cause is on her device or in her data, and
// the recorder could not see it: it stamps freezes over 1.5s and drifts over
// 400ms, and steady ordinary slowness trips neither.
//
// Every tap is now timed from the touch to the frame that answers it, the
// slowest few are kept, and the report carries them along with how big her
// store and her ink have actually grown.
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport:{width:834,height:1194}, hasTouch:true });
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(16000);
  const R = await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms)); const o={};
    go({name:'section',courseId:'C959',chId:'ch4',secId:'s1'}); await w(2400);
    try { localStorage.removeItem('diagSlow'); } catch(e){}
    o.hasSlow = typeof window.__slow === 'function';
    o.startEmpty = window.__slow().length === 0;

    // a fast tap must leave nothing behind
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Quick control');
    btn.textContent = 'quick';
    document.body.appendChild(btn);
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, pointerId:1 }));
    await w(400);
    o.fastNotRecorded = window.__slow().length === 0;

    // a slow one must be caught, with what was tapped
    const slowBtn = document.createElement('button');
    slowBtn.setAttribute('aria-label', 'Close the notebook');
    document.body.appendChild(slowBtn);
    slowBtn.addEventListener('pointerdown', function(){
      const t = performance.now(); while (performance.now() - t < 260) {}   // a real stall
    });
    slowBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, pointerId:2 }));
    await w(500);
    const rows = window.__slow();
    o.slowRecorded = rows.length;
    o.slowWhat = rows[0] && rows[0].what;
    o.slowMs = rows[0] && rows[0].ms;
    o.hasScreen = !!(rows[0] && rows[0].r);
    o.hasStoreKB = rows[0] && typeof rows[0].stKB === 'number';

    // it survives a page load, and the worst stay at the top
    for (let i = 0; i < 14; i++) {
      const bb = document.createElement('button');
      bb.setAttribute('aria-label', 'Filler ' + i);
      document.body.appendChild(bb);
      bb.addEventListener('pointerdown', function(){ const t=performance.now(); while (performance.now()-t < 140) {} });
      bb.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, pointerId: 10+i }));
      await w(80);
    }
    const kept = window.__slow();
    o.capped = kept.length <= 8;
    o.sortedWorstFirst = kept.every((x,i) => i === 0 || kept[i-1].ms >= x.ms);
    o.worstStillTop = kept[0] && kept[0].what === 'Close the notebook';

    // and the report carries it, with the sizes that explain a slow device
    const rep = JSON.parse(window.__report());
    o.reportHasSlow = Array.isArray(rep.slowTaps) && rep.slowTaps.length > 0;
    o.reportSlowCapped = !rep.slowTaps || rep.slowTaps.length <= 6;
    o.reportSize = rep.size || null;
    o.reportBuild = rep.build;
    return o;
  });
  ok('the recorder is present', R.hasSlow && R.startEmpty);
  ok('a tap answered in two frames records nothing', R.fastNotRecorded);
  ok('a slow tap is caught', R.slowRecorded >= 1, R.slowRecorded + ' recorded');
  ok('and it names what she tapped', R.slowWhat === 'Close the notebook', R.slowWhat);
  ok('with how long it actually took', R.slowMs >= 240 && R.slowMs < 900, R.slowMs + 'ms');
  ok('and the screen she was on', R.hasScreen);
  ok('and how big her store had grown', R.hasStoreKB);
  ok('the list is capped', R.capped);
  ok('the worst are kept, in order', R.sortedWorstFirst && R.worstStillTop);
  ok('the report carries the slow taps', R.reportHasSlow && R.reportSlowCapped);
  ok('and the sizes that would explain a slow device',
     !!(R.reportSize && typeof R.reportSize.storeKB === 'number' && typeof R.reportSize.inkKB === 'number'
        && typeof R.reportSize.biggestPageKB === 'number' && typeof R.reportSize.domNodes === 'number'),
     JSON.stringify(R.reportSize));
  ok('the report still says which build it came from', /^18\./.test(R.reportBuild || ''), R.reportBuild);
  ok('no page errors', errs.length===0, errs.slice(0,2).join('|'));
  for (const f of F) console.log((f.pass?'PASS ':'FAIL ')+f.n+(f.x?'  '+f.x:''));
  console.log('slowtap: '+F.filter(f=>f.pass).length+'/'+F.length+' passed');
  await b.close();
})().catch(e=>{ console.log('HARNESS '+e); process.exit(2); });
