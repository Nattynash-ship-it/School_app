# Test battery

Two rules every suite follows, checked by `writeguard.js` before any suite runs and by
`battery.sh` around each one:

1. **A test writes files only to the scratch space.** Every screenshot, export or generated
   fixture goes through `scratch(name)` from `tests/scratch.js`, which resolves under
   `TEST_SCRATCH` (or `study-hub-tests` in the system temp directory), never into the repository.
   The battery fails a suite that leaves the working tree changed. The one exception is
   `offlinekeep` swapping `sw.js` so the service worker sees a new build; each of its two writes
   carries `REPO-WRITE-ALLOWED: <reason>` and the tree check proves the file is put back.
2. **The top of every test is the label of its section:** `// SECTION: <name>`
   (`# SECTION:` in a shell script), one of Harness, Gate, Boot & screens, Quizzes & content,
   Notes pad, Lesson annotation & themes, Study helper, Store, sync & reset.

Eighty-one browser and unit suites that guard the app. They run against a local copy of the site, in
Chromium via Playwright, most of them with 4x CPU throttling to approximate an iPad.

    # from the repository root
    python3 -m http.server 8901 &          # serves index.html, sw.js and the content files
    npm install playwright                 # once; Chromium is expected at /opt/pw-browsers/chromium
    TEST_SCRATCH=/tmp/study-hub-tests tests/battery.sh   # ~90 minutes; one line per suite, ends with BATTERY_DONE

Run one suite with `node tests/<name>.js`. Each prints a RESULT line and exits non-zero on failure.

| section | suites | guards |
|---|---|---|
| Harness | writeguard, scratch, battery | the two rules above; the scratch helper; the runner itself |
| Gate | gatetest, gateparity, gatewall, fngate | the password gate, its cookie, and that every function refuses a request without it |
| Boot & screens | bootsmoke, installable, consolescan, pro, layout, zoomlayout, sweep, allcourses, everycourse, newcontent, homefold, classfold, plandates, portfolio, phoneoffline | the app boots and installs, every course and screen renders, layout survives zoom, no console errors |
| Quizzes & content | quizfeed, quiztable, c959bank, codewrap, entities, answerspread, artifacts, wguqs, javasim, javaunits, figflow, rounds, pretestkeep, coursepassed, coursepassed2 | quizzes: feedback, tables, banks, rationales, code stems, figure placement, scoring, pass state |
| Notes pad | padaudit, undoredo, padfeatures, padtools, penweight, padscroll, padfreeze, notescollapse, scrollkeep, erasestable, inkdupe, inkanchor, inkcompact, inkdouble, inkkeep, inkrealign, inkmerge, refreshdistort, penlatency, penperf, notespaper, notespages, notesline, notesformulas, classnotes, writeanywhere, padpages, ipadnotes, tidy, toolsbullets | the handwriting notes: tools, undo, scrolling, no freezes, no duplicated or moved ink, pen latency |
| Lesson annotation & themes | renderguard, hlreadable, hlanchor, themes5 | render cost, highlight legibility across every theme, anchoring, the theme set |
| Study helper | helperui, speechread, listenvoice, pdfimport, slowtap | the helper UI, read-aloud, document import, the slow-tap recorder |
| Store, sync & reset | storelean, offlinekeep, syncall, syncskip, courseexport, classreset, resetreview, resetsticks, resetbutton, resetnotes | what is saved and synced, what survives a deploy, what a reset removes and keeps removed |

The old table, kept for the suite-by-suite notes:

| suite | guards |
|---|---|
| gatetest, gateparity, gatewall, fngate | the password gate, its cookie, and that every function (sync, helper, tts) refuses a request without it |
| bootsmoke, installable, consolescan | the app boots, installs as a PWA, and logs no errors on every screen |
| sweep, allcourses, portfolio, zoomlayout | every course and screen renders; layout survives zoom |
| quizfeed, quiztable, c959bank, coursepassed, coursepassed2, codewrap | quizzes: feedback, tables, banks, pass state, multi-line code stems |
| padaudit, undoredo, padfeatures, padtools, padscroll, padfreeze, notescollapse, scrollkeep, erasestable, inkdupe, refreshdistort, penlatency, penperf | the handwriting notes: tools, undo, scrolling, no freezes, no duplicated or moved ink after refreshes, pen latency |
| renderguard, hlreadable, hlanchor | lesson annotation: render cost, highlight legibility across all 38 themes, anchoring |
| helperui, speechread, pdfimport, slowtap | the study helper UI, read-aloud, PDF import, the slow-tap recorder |
