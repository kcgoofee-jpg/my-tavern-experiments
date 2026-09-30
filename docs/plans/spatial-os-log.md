# Spatial OS — execution log

Append-only. Every task prompt ends by appending its RESULT block here (format in `docs/agent-brief.md` §5).
Newest entries go at the bottom; never edit older entries.

=== RESULT S0-A ===
status: DONE
items: T1 ✓  T2 ✓  T3 ✓  T4 ✓
commits: b853655 docs(plan): add the Spatial OS plan of record, zh edition and execution log
         (second commit: docs(brief): rewrite the agent brief as rules-only English, zh edition, en/zh mirror gate)
pushed: yes (head number = the "head #N" commit that follows this one on preview)
tests: node 629/630 (1 skipped; baseline identical) | smoke PASS | arch PASS | probes: none run (docs only)
deviations: none in the brief text. Note: brief §2.2 references tools/arch_baseline.json, which does not exist yet (created in S0.3); left as written. Baseline smoke was green.
blocker: none
open: none
cleanup: done
=== END ===

=== RESULT R0-A ===
status: DONE
items: T1 ✓  T2 ✓  T3 ✓  T4 ✓  T5 ✓
commits: 20f3ce8 chore(render): commit the rescued render leftovers that pass their tests
         1a97cb8 feat(render-queue): shared queue across worktrees, per-job tree root, Mac-only mode
         (third commit, this one: docs(render): Mac-only mode and worktree jobs)
pushed: head #98 for the first two commits; the head number for this commit follows it on preview
tests: node 629/630 (1 skipped; baseline identical) | smoke PASS (incl. new tools/test_render_queue.py, 14 cases) | arch PASS | probes: none run (no renders started)
deviations: (1) tools/push_preview.sh now pushes HEAD:refs/heads/<branch> instead of the local branch of that name: from a worktree the local `preview` is the main checkout's stale ref, so the documented push command would have been rejected. Identical behavior when run from `preview`. (2) tools/install_renderqueue_agent.sh now waits for bootout to finish and retries bootstrap: on the first T3d run the immediate bootstrap failed with "Input/output error 5" after the old dispatcher was booted out; recovered by a manual `launchctl bootstrap` and the fix is in this commit. (3) The queue usage example in the script header now includes `--log` (the render guard rejects the old example as a legacy call); docs/cloud-render.md's older example still lacks it (grandfathered text). (4) DRY_RUN=1 in the queue now prints the plan and finishes synchronously instead of running blender_run.sh with DRY_RUN=1.
blocker: none
open: none. Rescue folder ~/eden-map-review/rescue/2026-09-30/ keeps house_opt*.glb, house_opt.assets.json, estate_ext.png and eden_estate_tiles.json (nothing references them) as input for a later campaign item.
=== RESULT S0-B ===
status: DONE
items: T1 ✓  T2 ✓  T3 ✓  T4 ✓
commits: 777cbed chore(watchdog): ratchet the line cap, z-index, card-term and inline-style checks across the engine
         7ad86f0 docs(arch): add ARCHITECTURE.md (module map, data flow, entity protocol) with zh edition
         (this commit) docs(brief): fix the push rule and read order; clarify the RESULT pushed line   (SHAs may change on rebase)
pushed: yes (head number = the "head #N" commit that follows this one on preview)
tests: node 629/630 (1 skipped; baseline identical) | smoke PASS | arch PASS | probes: none run (tools and docs only)
deviations: (1) tools/smoke.sh: two step labels and the header comment now name the six checks / the ARCHITECTURE mirror pair (text only; no behaviour change). (2) The plan defines no verbatim text for SpatialNode / PresentEntities / WorldRoster / Stash; ARCHITECTURE.md §1 defines them from plan §2 / S6 plus the current code and marks each with its state. (3) check_architecture.py gained a small strip() fix: `://` no longer starts a line comment (checks 2 and 5 give identical results on the repo). (4) Style attributes that only set CSS custom properties (style="--c:...") are counted by check 6, as literally specified.
blocker: none
open: check 6 counts `style="--x:..."` attributes (custom-property-only) as inline styles per the letter of the prompt; say if those should be exempt like style.setProperty('--…').
  Initial baseline totals: lines 5 files / 4052 lines over cap (eden-map.js 1535, viewer3d.html 916, viewer.html 717, custom.mjs 456, events.mjs 428); zindex 15 files / 33; terms 30 files / 206 (tavern/events.mjs 87, i18n/zh.json 20, events.mjs 16, viewer.html 13, app/locate.mjs 9); inline_style 27 files / 66. map/core: zero violations of any kind (nothing baselined). Engine scan: 146 files + 2 i18n dictionaries.
cleanup: done
=== END ===
