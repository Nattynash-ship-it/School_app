# Test battery

Thirty-seven browser and unit suites that guard the app. They run against a local copy of the site, in
Chromium via Playwright, most of them with 4x CPU throttling to approximate an iPad.

    # from the repository root
    python3 -m http.server 8901 &          # serves index.html, sw.js and the content files
    npm install playwright                 # once; Chromium is expected at /opt/pw-browsers/chromium
    tests/battery.sh                       # ~25 minutes; prints one line per suite, ends with BATTERY_DONE

Run one suite with `node tests/<name>.js`. Each prints a RESULT line and exits non-zero on failure.

| suite | guards |
|---|---|
| gatetest, gateparity, gatewall, fngate | the password gate, its cookie, and that every function (sync, helper, tts) refuses a request without it |
| bootsmoke, installable, consolescan | the app boots, installs as a PWA, and logs no errors on every screen |
| sweep, allcourses, portfolio, zoomlayout | every course and screen renders; layout survives zoom |
| quizfeed, quiztable, c959bank, coursepassed, coursepassed2, codewrap | quizzes: feedback, tables, banks, pass state, multi-line code stems |
| padaudit, undoredo, padfeatures, padtools, padscroll, padfreeze, notescollapse, scrollkeep, erasestable, inkdupe, refreshdistort, penlatency, penperf | the handwriting notes: tools, undo, scrolling, no freezes, no duplicated or moved ink after refreshes, pen latency |
| renderguard, hlreadable, hlanchor | lesson annotation: render cost, highlight legibility across all 38 themes, anchoring |
| helperui, speechread, pdfimport, slowtap | the study helper UI, read-aloud, PDF import, the slow-tap recorder |
