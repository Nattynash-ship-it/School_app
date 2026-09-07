// (a) what is the second colour/size strip in the brand bar next to the pen
// toolbar, (b) console errors/warnings while walking through the main screens.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport:{width:1194,height:834} });
  const msgs=[]; p.on('console', m => { if (m.type()==='error'||m.type()==='warning') msgs.push(m.type()+': '+m.text().slice(0,200)); });
  p.on('pageerror', e => msgs.push('PAGEERROR: '+String(e).slice(0,200)));
  p.on('dialog', d => d.accept());
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(15000);
  const bar = await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    go({name:'section',courseId:'C959',chId:'ch4',secId:'s1'}); await w(1500);
    const row = document.querySelector('.brand-bar .brand-row-top');
    const kids = [...row.children].map(k => ({ cls: k.className, id: k.id, n: k.children.length,
      titles: [...k.querySelectorAll('button')].slice(0,14).map(x => (x.title||x.getAttribute('aria-label')||x.textContent||'').trim().slice(0,22)) }));
    return kids;
  });
  console.log('BRAND ROW:', JSON.stringify(bar, null, 1));
  const routes = [
    {name:'home'}, {name:'review'}, {name:'focus'}, {name:'plan'}, {name:'search'}, {name:'notes'}, {name:'stats'}, {name:'more'},
    {name:'class', courseId:'C959'}, {name:'chapter', courseId:'C959', chId:'ch4'},
    {name:'section', courseId:'D197', chId:'ch1', secId:'s1'}, {name:'flashcards', courseId:'C959'}, {name:'settings'}, {name:'today'},
  ];
  const seen = [];
  for (const r of routes) {
    const before = msgs.length;
    const res = await p.evaluate(async (r) => { const w=ms=>new Promise(r=>setTimeout(r,ms)); try { go(r); } catch(e) { return 'go threw '+e; } await w(900);
      const root = document.getElementById('app'); return (root && root.innerText.trim().length) ? 'ok' : 'BLANK'; }, r);
    seen.push(`${r.name}${r.courseId?'/'+r.courseId:''}${r.chId?'/'+r.chId:''}: ${res}${msgs.length>before ? ' (+'+(msgs.length-before)+' console)' : ''}`);
  }
  console.log(seen.join('\n'));
  console.log('CONSOLE ('+msgs.length+'):'); const uniq=[...new Set(msgs)]; for (const m of uniq.slice(0,40)) console.log('  '+m);
  await b.close();
})().catch(e=>{ console.log('ERR '+e); process.exit(2); });
