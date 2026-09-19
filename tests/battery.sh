#!/bin/bash
S="$(cd "$(dirname "$0")" && pwd)"
cd "$S" || exit 1
# A SUITE THAT SAYS NOTHING HAS NOT PASSED.
# This piped straight into tail, so $? was tail's status and never the test's,
# and a suite that died printed a blank line that read exactly like a quiet
# pass. That is how a run where the server had gone away under the last six
# suites still ended in BATTERY EXIT 0.
FAILED=""
run() {
  local name="$1" file="$2" lines="${3:-2}" out rc
  echo "=== $name ==="
  out="$(timeout 900 node "$S/$file" 2>&1)"; rc=$?
  printf '%s\n' "$out" | tail -"$lines"
  if [ "$rc" -ne 0 ]; then
    echo "SUITE-FAILED $name (exit $rc)"
    # the summary line alone does not say WHICH assertion went - print them, so
    # a red battery is diagnosable without re-running the suite by hand
    printf '%s\n' "$out" | grep -E '^(FAIL|HARNESS|Error)' | head -12
    FAILED="$FAILED $name"
  elif [ -z "$(printf '%s' "$out" | tr -d '[:space:]')" ]; then
    echo "SUITE-SILENT $name (ran, said nothing - treat as failed)"
    FAILED="$FAILED $name"
  fi
}
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
run notespaper notespaper.js 1
run notesformulas notesformulas.js 1
run courseexport courseexport.js 1
run toolsbullets toolsbullets.js 1
run offlinekeep offlinekeep.js 1
run notespages notespages.js 1
run notesline notesline.js 1
run classreset classreset.js 1
run resetreview resetreview.js 1
run resetsticks resetsticks.js 1
run resetbutton resetbutton.js 1
run syncall syncall.js 1
run classnotes classnotes.js 1
run inkmerge inkmerge.js 1
run writeanywhere writeanywhere.js 1
run resetnotes resetnotes.js 1
run homefold homefold.js 1
run classfold classfold.js 1
run everycourse everycourse.js 1
run themes5 themes5.js 1
run inkkeep inkkeep.js 1
run syncskip syncskip.js 1
run plandates plandates.js 1
run padpages padpages.js 1
run ipadnotes ipadnotes.js 3
run layout layout.js 3
run pro pro.js 1
run rounds rounds.js 1
run pretestkeep pretestkeep.js 1
run listenvoice listenvoice.js 1
run entities entities.js 1
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
if [ -n "$FAILED" ]; then
  echo "BATTERY FAILURES:$FAILED"
  echo BATTERY_DONE
  exit 1
fi
echo "BATTERY: every suite reported"
echo BATTERY_DONE
