// SECTION: Boot & screens
// "there are way too many sections and it's confusing and overwhelming, please
//  leave the actual sections of work there but kindly combine anything that
//  can be combined or make it easier to navigate" - the home screen: nine
//  category sections, 42 course cards, 6,879px tall.
//
// Every course is still there. Each category is one row that opens; the ones
// she is working in are open already with their live courses first; her opens
// and closes are remembered; a search opens what matches; the filter chips and
// the card buttons still work inside a fold.
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:' + (process.env.PORT || 8901) + '/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d)))); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await browser.newPage({ viewport: { width: 1194, height: 834 } });
  p.on('dialog', d => d.accept());
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(B, { waitUntil: 'load', timeout: 240000 });
  await p.waitForTimeout(13000);

  const R = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    go({ name: 'home' }); await wait(900);
    const cats = () => [...document.querySelectorAll('details.dash-cat')].map(d => ({
      cat: d.getAttribute('data-cat'), open: d.open, cards: d.querySelectorAll('.dash-card').length,
      firstStatus: (d.querySelector('.dash-card') || {}).getAttribute ? d.querySelector('.dash-card').getAttribute('data-status') : null,
      live: (d.querySelector('.dash-cat-count') || {}).textContent,
      badgeActive: d.querySelectorAll('.dash-badge-active').length,
      lockedFold: !!d.querySelector('details.dash-locked'),
      lockedOpen: d.querySelector('details.dash-locked') ? d.querySelector('details.dash-locked').open : null,
      lockedCount: d.querySelector('.dash-locked-head') ? parseInt(d.querySelector('.dash-locked-head').textContent, 10) : null,
      lockedCards: d.querySelectorAll('details.dash-locked .dash-card').length }));
    out.cats = cats();
    out.totalCards = document.querySelectorAll('.dash-card').length;
    out.courses = Object.keys(COURSES).filter(k => k !== 'PORTFOLIO').length;
    out.height = document.documentElement.scrollHeight;
    out.labelsOutsideFold = document.querySelectorAll('.dash-cat-label:not(details.dash-cat .dash-cat-label)').length;

    /* a folded category opens on a tap, and stays open across a redraw */
    const closed = [...document.querySelectorAll('details.dash-cat:not([open])')][0];
    out.hadClosed = !!closed;
    const closedName = closed ? closed.getAttribute('data-cat') : null;
    if (closed) { closed.querySelector('summary').click(); await wait(200); }
    out.openedByTap = closed ? closed.open : null;
    render(); await wait(600);
    const again = closedName ? document.querySelector('details.dash-cat[data-cat="' + closedName.replace(/"/g, '\\"') + '"]') : null;
    out.stillOpenAfterRedraw = again ? again.open : null;
    if (again) { again.querySelector('summary').click(); await wait(200); }   // and closed again, remembered
    render(); await wait(600);
    const again2 = closedName ? document.querySelector('details.dash-cat[data-cat="' + closedName.replace(/"/g, '\\"') + '"]') : null;
    out.closedAgainRemembered = again2 ? !again2.open : null;

    /* search opens the category holding the match */
    const search = document.querySelector('[data-dash-search]');
    search.value = 'calculus'; search.dispatchEvent(new Event('input', { bubbles: true })); await wait(300);
    const maths = document.querySelector('details.dash-cat[data-cat="MATHEMATICS"]');
    out.search = { mathsOpen: maths ? maths.open : null, mathsShown: maths ? maths.style.display !== 'none' : null,
                   visible: [...document.querySelectorAll('.dash-card')].filter(c => c.style.display !== 'none').length,
                   wguShown: (document.querySelector('details.dash-cat[data-cat^="WGU"]') || { style: {} }).style.display !== 'none' };
    search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); await wait(300);
    out.afterClear = [...document.querySelectorAll('.dash-card')].filter(c => c.style.display !== 'none').length;

    /* the chips still filter; a card's button still works inside a fold */
    document.querySelector('[data-chip="locked"]').click(); await wait(600);
    out.lockedChip = { cards: document.querySelectorAll('.dash-card').length,
                       allLocked: [...document.querySelectorAll('.dash-card')].every(c => c.getAttribute('data-status') === 'locked'),
                       allOpen: [...document.querySelectorAll('details.dash-cat, details.dash-locked')].every(d => d.open) };
    const act = document.querySelector('details.dash-cat .dash-card [data-dash-activate]');
    const actId = act ? act.getAttribute('data-dash-activate') : null;
    if (act) act.click(); await wait(600);
    out.activated = actId ? dashStatus(COURSES[actId]) : null;
    document.querySelector('[data-chip="all"]').click(); await wait(600);
    return out;
  });

  const wgu = R.cats.find(c => /^WGU/.test(c.cat));
  ok('every category is a fold, and none is left loose outside one', R.cats.length >= 8 && R.labelsOutsideFold === 0, [R.cats.length, R.labelsOutsideFold]);
  ok('every course is still on the page', R.totalCards === R.courses, [R.totalCards, R.courses]);
  ok('the category she is working in starts open', wgu && wgu.open === true, wgu);
  ok('and its live courses come first', wgu && ['active', 'inprogress', 'paused'].includes(wgu.firstStatus), wgu && wgu.firstStatus);
  ok('categories with nothing of hers start folded', R.cats.length > 0 && R.cats.some(c => c.open === false) && R.cats.filter(c => !/active/.test(c.live || '')).every(c => c.open === false), R.cats.map(c => [c.cat.slice(0, 12), c.open]));
  ok('the row\'s count agrees with the cards\' badges', wgu && parseInt((wgu.live.match(/(\d+) active/) || [])[1], 10) === wgu.badgeActive, wgu && [wgu.live, wgu.badgeActive]);
  ok('not-yet-activated courses sit behind one line inside the fold, closed', wgu && wgu.lockedFold === true && wgu.lockedOpen === false && wgu.lockedCount === wgu.lockedCards, wgu);
  // 6,879px before. What remains is the blocks above the courses (~1,400px)
  // plus the one open category showing only her five live courses; its 16
  // not-activated ones are one line, and the other categories a row each.
  ok('the page is well under its old height', R.height < 2800, R.height);
  ok('a tap opens a folded category', R.hadClosed && R.openedByTap === true, [R.hadClosed, R.openedByTap]);
  ok('and that is remembered across a redraw', R.stillOpenAfterRedraw === true, R.stillOpenAfterRedraw);
  ok('closing it again is remembered too', R.closedAgainRemembered === true, R.closedAgainRemembered);
  ok('a search opens the category holding the match and hides the rest', R.search.mathsOpen === true && R.search.mathsShown === true && R.search.visible >= 1 && R.search.wguShown === false, R.search);
  ok('clearing the search brings everything back', R.afterClear === R.courses, [R.afterClear, R.courses]);
  ok('the filter chips still work, and open what they show', R.lockedChip.cards > 0 && R.lockedChip.allLocked && R.lockedChip.allOpen, R.lockedChip);
  ok('a card\'s button still works inside a fold', R.activated !== null && R.activated !== 'locked', R.activated);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));

  console.log('homefold: ' + pass + '/' + (pass + fail) + ' passed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
