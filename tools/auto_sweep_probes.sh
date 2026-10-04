#!/bin/bash
# AUTO-SWEEP probe sweep: run every probe with a pass/fail convention, one at a time.
set -u
cd "$(dirname "$0")/.."
OUT=/tmp/autosweep-probes
mkdir -p "$OUT"
LIST="a11y_tree accept art_key autopack autoupd097 boot_watchdog cg_gallery chars092 clouds contrast_v2 custom095 dist3_load drawer_stash e7 e7_host estate3d estate_flicker estate_generic estate_kbd estate_presence events_fx fail095 fix3 follow_pin header_1 header_host inset_eden layers_ext mvu093 openings p1_leak p4_fx p4_traffic p5_sandbox p6_action p6_quests p6_tick p8_pick_clock_depth p9_daynight_fx pack_editor pack_layers pack_minimal pack_routes pack_switch pack_town pan_frame period_bounds period_maps probe095 raf_pause room_gallery_ui roster095 s7_hit sites096 splash095 th_adopt tile_fail topo_dairy trips095 ui092 ui3d1 unmapped096 v096 v097 v2a varmap095 webgl_single_ctx"
: > "$OUT/summary.txt"
for p in $LIST; do
  echo "=== $p start $(date +%H:%M:%S)" >> "$OUT/summary.txt"
  perl -e 'alarm 1500; exec @ARGV' node tools/browser/$p.mjs "$OUT/$p" >> "$OUT/$p.log" 2>&1
  rc=$?
  if [ $rc -eq 0 ]; then v=PASS; else v="FAIL(rc=$rc)"; fi
  echo "$p $v" >> "$OUT/summary.txt"
  echo "=== $p $v $(date +%H:%M:%S)" >> "$OUT/summary.txt"
done
echo "ALL DONE" >> "$OUT/summary.txt"
