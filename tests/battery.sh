#!/bin/bash
S="$(cd "$(dirname "$0")" && pwd)"
cd "$S" || exit 1
run() { echo "=== $1 ==="; timeout 900 node "$S/$2" 2>&1 | tail -${3:-2}; }
run gate gatetest.mjs 1
run gateparity gateparity.mjs 1
run bootsmoke bootsmoke.js 1
run gatewall gatewall.js 2
run portfolio portfolio.js 1
run sweep sweep.js 3
run zoomlayout zoomlayout.js 2
run allcourses allcourses.js 2
run quizfeed quizfeed.js 1
run c959bank c959bank.js 1
run quiztable quiztable.js 1
run erasestable erasestable.js 1
run coursepassed coursepassed.js 1
run coursepassed2 coursepassed2.js 2
run padaudit padaudit.js 1
run undoredo undoredo.js 1
run padfeatures padfeatures.js 1
run pdfimport pdfimport.js 1
run notescollapse notescollapse.js 1
run padscroll padscroll.js 1
run padfreeze padfreeze.js 1
run slowtap slowtap.js 1
run penlatency penlatency.js 1
run penperf penperf.js 1
run inkdupe inkdupe.js 1
run inkanchor inkanchor.js 1
run inkcompact inkcompact.js 1
run storelean storelean.js 1
run notespages notespages.js 1
run notesline notesline.js 1
run classreset classreset.js 1
run answerspread answerspread.js 1
run helperui helperui.js 1
run padtools padtools.js 1
run scrollkeep scrollkeep.js 1
run renderguard renderguard.js 1
run hlreadable hlreadable.js 1
run hlanchor hlanchor.js 1
run speechread speechread.js 1
run installable installable.js 1
run consolescan consolescan.js 3
run refreshdistort refreshdistort.js 1
run codewrap codewrap.js 1
run fngate fngate.mjs 2
run newcontent newcontent.js 1
echo BATTERY_DONE
