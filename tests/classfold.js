// "be sure that the drills make sense with the ones that are combined, please
//  leave the sections as they are. please keep the study sections as they are
//  and organize the drills please"
//
// C959 listed 26 "chapters" and D286 35, of which 7 and 19 are study units;
// the rest - simulations, drills, cheat sheets, concept notes - sat in the same
// list, numbered like units. What has to hold:
//   1. the study units are the same cards, same order, same numbers, at the top
//   2. every other chapter is here exactly once, inside one of three folds
//   3. each fold holds only what belongs in it - no drill among the exams, no
//      cheat sheet among the drills
//   4. a card inside a fold opens its chapter exactly as before; the final exam
//      still runs; a fold's open/closed is remembered per class
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
    const EX = /^(oa_sim|pa_sim|fresh_sim|pa_fresh|exam|pa|pretest|final)$|_sim$/;
    const DR = /^(weak_drill|review_missed|hard_drill|challenge|oa_prac|oa_lab|pa_build|solving|solving_only|solving2|aistote|playbook)$|_drill$|_prac$/;
    const RF = /^(concepts|cheat|oa|userdocs)$/;
    for (const cid of ['C959', 'D286']) {
      go({ name: 'class', courseId: cid }); await wait(1200);
      const chapters = COURSES[cid].chapters;
      const unitIds = chapters.filter(ch => isLearningChapter(ch)).map(ch => ch.id);
      const unitNums = {}; chapters.forEach((ch, i) => { unitNums[ch.id] = 'CH ' + String(i + 1).padStart(2, '0'); });
      const top = [...document.querySelectorAll('.chapter-item[data-chapter]')].filter(el => !el.closest('details.cls-group'));
      const groups = [...document.querySelectorAll('details.cls-group')].map(d => ({
        key: d.getAttribute('data-group'), open: d.open,
        ids: [...d.querySelectorAll('[data-chapter]')].map(e => e.getAttribute('data-chapter')),
        hasFinal: !!d.querySelector('[data-final-exam]'),
        n: parseInt((d.querySelector('.cls-group-n') || {}).textContent, 10) }));
      out[cid] = {
        height: document.documentElement.scrollHeight,
        topIds: top.map(e => e.getAttribute('data-chapter')),
        topNumsOk: top.every(e => (e.querySelector('.chapter-num') || {}).textContent === unitNums[e.getAttribute('data-chapter')]),
        unitIds, groups,
        totalCards: document.querySelectorAll('[data-chapter]').length, chapters: chapters.length,
        wrong: groups.flatMap(g => g.ids.filter(id => g.key === 'exams' ? !EX.test(id) : g.key === 'drills' ? !DR.test(id) : !RF.test(id)).map(id => g.key + ':' + id))
      };
    }
    /* behaviour, on C959 */
    go({ name: 'class', courseId: 'C959' }); await wait(1200);
    const drills = document.querySelector('details.cls-group[data-group="drills"]');
    out.closedByDefault = drills ? !drills.open : null;
    if (drills) { drills.querySelector('summary').click(); await wait(200); }
    out.opens = drills ? drills.open : null;
    render(); await wait(800);
    const d2 = document.querySelector('details.cls-group[data-group="drills"]');
    out.remembered = d2 ? d2.open : null;
    const inner = d2 ? d2.querySelector('[data-chapter]') : null;
    const innerId = inner ? inner.getAttribute('data-chapter') : null;
    if (inner) inner.click(); await wait(900);
    out.innerNav = { route: view.name, chId: view.chId, expected: innerId };
    go({ name: 'class', courseId: 'C959' }); await wait(1200);
    const ex = document.querySelector('details.cls-group[data-group="exams"]');
    if (ex && !ex.open) { ex.querySelector('summary').click(); await wait(200); }
    const fin = document.querySelector('details.cls-group[data-group="exams"] [data-final-exam]');
    out.finalInside = !!fin;
    if (fin) fin.click(); await wait(1500);
    // the final exam is an overlay (runExamSim), not a route: that is the signal
    out.finalRuns = !!document.querySelector('.examsim-overlay') || !!(typeof examState !== 'undefined' && examState);
    try { if (typeof examState !== 'undefined' && examState) { document.querySelectorAll('.examsim-overlay').forEach(e => e.remove()); } } catch (e) {}
    return out;
  });

  for (const cid of ['C959', 'D286']) {
    const C = R[cid];
    ok(cid + ': the study units are the same cards, same order, at the top', C.topIds.join(',') === C.unitIds.join(','), [C.topIds, C.unitIds]);
    ok(cid + ': and keep the numbers they had', C.topNumsOk === true);
    ok(cid + ': every other chapter is here exactly once, inside a fold', C.totalCards === C.chapters && C.groups.reduce((a, g) => a + g.ids.length, 0) === C.chapters - C.unitIds.length, [C.totalCards, C.chapters, C.groups.map(g => g.ids.length)]);
    ok(cid + ': each fold holds only what belongs in it', C.wrong.length === 0, C.wrong);
    ok(cid + ': the fold counts are honest', C.groups.length > 0 && C.groups.every(g => g.n === g.ids.length + (g.hasFinal ? 1 : 0)), C.groups.map(g => [g.key, g.n, g.ids.length, g.hasFinal]));
    // C959: 4,653 before, 7 units kept. D286: 5,700 before, and its TWENTY study
    // units stay as full cards by her instruction - so its floor is higher and
    // the fold's whole saving there is the 15 tool chapters (~1,500px).
    ok(cid + ': the page is well under its old height', C.height < (cid === 'C959' ? 3000 : 4400), C.height);
  }
  ok('the folds start closed', R.closedByDefault === true, R.closedByDefault);
  ok('a tap opens one', R.opens === true, R.opens);
  ok('and that is remembered across a redraw', R.remembered === true, R.remembered);
  ok('a chapter inside a fold opens exactly as before', R.innerNav.route === 'chapter' && R.innerNav.chId === R.innerNav.expected, R.innerNav);
  ok('the final exam sits with the practice exams and still runs', R.finalInside === true && R.finalRuns === true, [R.finalInside, R.finalRuns]);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));

  console.log('classfold: ' + pass + '/' + (pass + fail) + ' passed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
