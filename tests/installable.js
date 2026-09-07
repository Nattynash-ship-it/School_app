// "I need this app turned into an apple app for my iPad": the install path is a
// Home Screen web app, so these are the things iOS actually reads. A hand-edit
// to the base64 manifest silently produced invalid JSON once - which iOS would
// have reported only as "this can't be installed" - so it is checked here.
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport:{width:834,height:1194}, deviceScaleFactor:2 });
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  const bad=[]; p.on('response', r => { if (r.status()>=400 && /splash|manifest/.test(r.url())) bad.push(r.status()+' '+r.url()); });
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(9000);

  const R = await p.evaluate(async () => {
    const o = {};
    const link = document.querySelector('link[rel=manifest]');
    o.hasManifest = !!link;
    let mf = null;
    try { mf = JSON.parse(atob(link.href.split('base64,')[1])); } catch (e) { o.parseError = String(e); }
    o.manifestParses = !!mf;
    if (mf) {
      o.standalone   = mf.display === 'standalone';
      o.hasName      = !!mf.name && !!mf.short_name;
      o.icon192      = mf.icons.some(i => i.sizes === '192x192');
      o.icon512      = mf.icons.some(i => i.sizes === '512x512');
      o.bgIsColour   = /^#[0-9a-f]{6}$/i.test(mf.background_color || '');
      // The launch colour must match what the app actually paints, or every
      // cold start flashes the wrong colour before the UI appears.
      const painted  = getComputedStyle(document.body).backgroundColor;
      const m = painted.match(/\d+/g).slice(0,3).map(Number);
      const hex = '#' + m.map(v => v.toString(16).padStart(2,'0')).join('');
      o.paintedBg = hex; o.manifestBg = (mf.background_color||'').toLowerCase();
      o.bgMatchesApp = hex === o.manifestBg;
      const themeMeta = (document.querySelector('meta[name=theme-color]')||{}).content || '';
      o.themeMatchesApp = themeMeta.toLowerCase() === hex;
    }
    o.appleCapable = (document.querySelector('meta[name=apple-mobile-web-app-capable]')||{}).content === 'yes';
    o.appleTitle   = !!(document.querySelector('meta[name=apple-mobile-web-app-title]')||{}).content;
    o.touchIcon    = !!document.querySelector('link[rel=apple-touch-icon]');
    // A light app must not use black-translucent: iOS draws WHITE status-bar
    // indicators over the page, which vanish against a light background.
    const bar = (document.querySelector('meta[name=apple-mobile-web-app-status-bar-style]')||{}).content;
    o.statusBarStyle = bar;
    o.statusBarSuitsLightApp = bar !== 'black-translucent';
    const starts = [...document.querySelectorAll('link[rel=apple-touch-startup-image]')];
    o.startupCount = starts.length;
    o.startupHaveMedia = starts.every(l => /device-width/.test(l.media) && /orientation/.test(l.media));
    o.startupBothOrientations = starts.filter(l=>/portrait/.test(l.media)).length === starts.filter(l=>/landscape/.test(l.media)).length;
    // every declared launch image must actually be fetchable
    const results = await Promise.all(starts.map(l => fetch(l.href, {method:'GET'}).then(r => r.ok).catch(()=>false)));
    o.allStartupImagesLoad = results.every(Boolean);
    o.startupImagesOk = results.filter(Boolean).length;
    return o;
  });
  ok('manifest link present', R.hasManifest);
  ok('manifest is valid JSON', R.manifestParses, R.parseError||'');
  ok('display is standalone', R.standalone);
  ok('has name and short_name', R.hasName);
  ok('has a 192px icon', R.icon192);
  ok('has a 512px icon', R.icon512);
  ok('background_color is a colour', R.bgIsColour);
  ok('launch colour matches what the app paints', R.bgMatchesApp, R.manifestBg+' vs painted '+R.paintedBg);
  ok('theme-color matches what the app paints', R.themeMatchesApp);
  ok('apple-mobile-web-app-capable', R.appleCapable);
  ok('apple web app title set', R.appleTitle);
  ok('apple-touch-icon present', R.touchIcon);
  ok('status bar style suits a light app', R.statusBarSuitsLightApp, R.statusBarStyle);
  ok('launch images declared', R.startupCount >= 12, R.startupCount);
  ok('every launch image has a device media query', R.startupHaveMedia);
  ok('portrait and landscape both covered', R.startupBothOrientations);
  ok('every declared launch image loads', R.allStartupImagesLoad, R.startupImagesOk+'/'+R.startupCount);
  ok('no 4xx/5xx on manifest or splash', bad.length===0, bad.join('|'));
  ok('no page errors', errs.length===0, errs.join('|'));
  for (const f of F) console.log((f.pass?'PASS ':'FAIL ')+f.n+(f.x?'  '+f.x:''));
  console.log('installable: '+F.filter(f=>f.pass).length+'/'+F.length+' passed');
  await b.close();
})().catch(e=>{ console.log('HARNESS '+e); process.exit(2); });
