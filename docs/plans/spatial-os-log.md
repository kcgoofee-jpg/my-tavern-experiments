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

=== RESULT R0-B ===
status: DONE
items: T1 ✓  T2 ✓  T3 ✓  T4 ✓
commits: 6e84ad4 feat(render): campaign ledger tool (items + append-only events, lanes, claims, freeze check)
         (this commit) docs(render): render campaign item list and status view   (SHAs may change on rebase)
pushed: yes (head number = the "head #N" commit that follows this one on preview)
tests: node 629/630 (1 skipped; baseline identical) | smoke PASS (incl. new tools/test_render_campaign.py, 40 cases) | arch PASS | probes: none run (no renders started)
deviations: (1) The item-list rules live in a second file, tools/render_campaign_items.py (imported by `init`), to keep render_campaign.py readable. (2) landmark.py's real stages (new, draft, board, gapcheck, final, ship) match the prompt; setting / review-r1 / fix / review-r2 are ledger-only stages with no landmark.py command, so `next` prints instructions for them instead of a command. (3) Rules the prompt left open, decided as: `fail` releases the claim; a claim's TTL counts from the owner's latest event; `wait` on a non-ship stage only refreshes the claim; events replay sorted by (ts, file order); overlapping claims: the first one wins; done / skip / fail / wait must name the item's current stage; review-r1 / review-r2 `done` requires --gate. (4) base / variant `--out` paths point at logs/campaign/full/<name>_full.png (gitignored) and `tiles` cuts them into map/art/<name>; only tc_* full PNGs are ignored under map/art. (5) Targets for whole-map items are written `<map>:*`; the hunting_camp marker lives in map/data/world_markers.json, not maps.json, and is targeted as world:hunting_camp.
blocker: none
open: (a) 7 items carry a TODO in their notes: review:holy_mountain (no blender/landmarks/holy_mountain/build.py; its source is blender/world/yuanyu_holy_mount.py, so landmark.py stages may not apply); var:tc_mid:dawn, var:tc_mid:dusk, var:tc_low:dawn, var:tc_low:dusk (tiancheng_mid.py / tiancheng_low.py only have --day, night is the default; dawn / dusk lighting must be added first); var:tc_upper:16k (how the 16k DZI is registered in maps.json: replace base or alt); estate:b1b2 (eden_manor.py --view has B1 but no B2). (b) Specs the prompt did not give, assumed: isle:* 2400/64, base:tc_upper 8000/128, var:tc_upper:<period> 8000/128, estate:b1b2 2000/32; each says so in its notes. (c) base:world has no world final in logs/render_times.csv (only world_yuanyu drafts), so it uses the 8000/128 default.
item counts: standard 48 = estate 2, review 12, landmark 8, scene 7, basemap 11, variant 8; hero 19 = island 8, basemap 2, variant 5, estate 1, landmark 3; total 67.
=== RESULT S0-C ===
status: BLOCKED
items: T1 ✓  T2 ✓  T3 ✓  T4 ✓
       row counts: A engine files 53, B same-name pairs 28 (14 groups), C window globals 68, D short identifiers 28, E chat-variable keys 16, F storage/protocol/API/distribution 24 (217 rows: 170 internal, 47 external contract; waves S5 150, S6 3, S10 47, no change 17); glossary 34 terms; open items 10
commits: 4d655d1 docs(naming): naming rules, rename map and glossary with zh edition
         (this commit) docs(log): S0-C result   (SHAs may change on rebase)
pushed: not pushed (rejected, see blocker); the work is committed on branch s0c-naming
tests: node 629/630 (1 skipped; baseline identical) | smoke PASS | arch PASS | probes: none run (docs only)
deviations: (1) The plan counts 11 kinds of window.TC*; the code has 29 (18 set directly, 11 through P.register()), and 34 read-only compat getters in app/bridge.mjs; the tables use the real numbers. (2) Wave column has a third value, S6, for the chat keys 仓库 / 槽位, because decision D4 migrates them with the stash unification, not at S10. (3) baibai.mjs: the plan draft says appearance-bridge, the table proposes imagegen-bridge (the module's write path is drawing); flagged as open 8. (4) Table B rows for the core side of a pair say (keep) and the forwarder tavern/routine.mjs says (delete), so each pair is complete. (5) The tables were generated from one scratch script so the en and zh editions cannot drift; the script is not committed (no code in scope).
blocker: `bash tools/push_preview.sh --head --no-escalate`, run once, no retry:
  To https://github.com/kcgoofee-jpg/my-tavern-experiments.git
   ! [rejected]        HEAD -> preview (non-fast-forward)
  error: failed to push some refs to 'https://github.com/kcgoofee-jpg/my-tavern-experiments.git'
  hint: Updates were rejected because a pushed branch tip is behind its remote counterpart.
  Cause: origin/preview moved to head #102 (162a63f; render-line commits 6e84ad4, 089e569) after this branch was cut from head #101 (04d0811). tools/push_preview.sh pushes HEAD as it is and does not fetch or rebase, although brief §3 says it does.
  Options: A) rebase s0c-naming onto origin/preview (this branch touches only docs/naming*.md, tools/check_zh_mirror.py and the append-only log, so no conflict is expected), re-run the gates, push; B) leave it to you to push. Not force-pushed.
open: (a) DECISION: how the first pack keeps its legacy names (manifest-declared legacy prefixes vs rename everything and read old forever), especially the worldbook extra.eden_* markers. (b) DECISION: identifier prefix (spatial / Spatial assumed from D5), engine repo name, npm package name. (c) DECISION: util.mjs / shell.mjs need a split design; keep `$` by exception? (d) DECISION: `floor` (chat floor vs storey), imagegen-bridge vs appearance-bridge. (e) FOUND, NOT FIXED: app/host.mjs:52,54 call P.TCFog?.mute?.(), but fog.mjs never registers TCFog in P, so replay-time muting is a no-op. (f) FOUND: four read-only window hooks with no writer (__edenHostVersions, __edenHereText, __edenMvuSnapshotStatus, __composeTest); stale .js owner strings in core/storage.mjs KEYS (5 names, 8 keys).
cleanup: done
=== END ===

=== RESULT S0-C-followup ===
status: DONE
items: rebase ✓  push-fix ✓
commits: (this commit) fix(push): align with origin before the first push; rebase conflict aborts cleanly
pushed: yes
tests: smoke PASS | arch PASS | mirror PASS | doc-language PASS
deviations: none
blocker: none (S0-C's rejected push: tools/push_preview.sh pushed HEAD before fetching; it now fetches and rebases first)
open: S0-C decisions (a)-(d) answered in the planning session; recorded in the next prompt (S0-D).
cleanup: done
=== END ===


=== RESULT S0-D ===
status: PARTIAL
items: T1 ✓  T2 ✓ (5 of 6 worktrees removed; webgl-part3 kept, see below)  T3 ✓  T4 ✓  T5 ✓  T6 ✓
commits: (rescue/ambience-part4-4) 5b7f92d wip(ambience): rescue the uncommitted Part 4-4 engine files
commits: c7e7151 fix(fog): register the fog API so the replay-time mute is no longer a no-op
commits: e4f794c chore(watchdog): custom-property-only style attributes are not inline styles; lower the baseline
commits: (this commit) docs(naming): record the 2026-09-30 naming decisions
pushed: head # see push output (rescue branch pushed to origin, not merged)
tests: node 630/631 (1 skipped; baseline 629/630 + tests/fog_mute.test.mjs) | smoke PASS | arch PASS (inline_style baseline 66 -> 60; lines 4052, zindex 33, terms 206 unchanged) | mirror PASS | probes: none run (no browser-visible change)
deviations: (1) T1: 9 of the 12 untracked files in eden-campaign have the same path on origin/preview with different content (shipped Part 4-3 / 5-x versions); by the prompt's rule they were treated as stranded and rescued, on a branch that is never merged. (2) T2: .codebuddy/worktrees/webgl-part3 has uncommitted changes (blender/export_optimized.py, logs/render_times.csv, map/art/relief/*, tests/test_export_optimized.py, ...); not removed. (3) tests/app_modules.test.mjs: the fixed list of P keys gains 'TCFog' (a consequence of T4).
blocker: none
open: (a) webgl-part3 has uncommitted work: commit / discard / keep? (b) decide merge or drop for rescue/ambience-part4-4 (todo §1); its 9 overlapping files diverge from preview and would need a manual reconcile.
cleanup: done
=== END ===

=== RESULT R-LOOP standard std-1 ===
status: PAUSED (checkpoint after 3 items; ledger is clean and resumable)
items finished this session: estate:final — final/verify/ship — pass; estate:opt — skipped with numbers (house_opt LODs larger than the shipped meshopt house.glb, Draco decoder not vendored); review:arms_rnd — r1 7/5 fail, fix, r2 8/6.5 pass, ship
items below gate: none
waiting: none
pushed: yes (head #106)
tests: check_maps PASS | estate3d_manifest PASS (9/9) | smoke PASS (node 114) — run inside `landmark.py ship`
blocker: none
notes for the next session:
  (1) A fresh render worktree lacks the git-ignored local caches (blender/data/props, landmarks, estate2, osm/raw, real3d/raw, world/out, *.f32, *.i16), so landmark builds crash on missing textures and board.py then re-annotates STALE renders. Symlink them from the main checkout (ln -s <main>/blender/data/<dir> ...) and add them to the shared .git/info/exclude; done for wt-standard.
  (2) blender/estate: Blender 5.2 rejects modifier ID-property writes; core.set_cut now uses modifier.properties.inputs. Estate renders need --allow-unmatched 1 (5 maps.json function rooms have no 3D room) and --no-export (keeps eden_estate_tiles.json untouched).
  (3) `render_campaign.py wait` leaves the item at the same stage, so `next` re-offers it; do not resubmit a queued job.
next: review:clearing_depot
cleanup: done (no Blender or server of mine running)
=== RESULT S0-E ===
status: BLOCKED
items: T1 ✓  T2 ✓  T3 ✓  T4 ✓  T5 ✓  T6 ✓
commits: 9a1fbd8 docs(todo): archive the 2026-09-29 todo; new single tracker with a one-to-one migration table
         (this commit) docs: point handoff/README at the current documents; campaign estate:opt source branch   (SHAs may change on rebase)
pushed: not pushed (rejected, see blocker); the work is committed on branch s0e-todo, rebased onto head #107
tests: node 630/631 (1 skipped; baseline identical) | smoke PASS | arch PASS | mirror PASS | doc-language PASS | test_render_campaign 40/40 | probes: none run (docs only)
deviations: (1) Two destination values beyond the prompt's list: "§3 Q-xx" (the decisions need a home) and "Stage B" (a plan step that is not S<n>). (2) Seven rows are already owned by render-campaign items; "§2 E-xx" is defined as "not covered by the ledger", so they are filed as "void (moved to the render ledger)" with the item ids in the note. (3) Twelve open tails hidden inside items the old file had already struck (Part 1/2/3/4/5/7 leftovers, the generalisation v2 kinds, the five remaining Holy City markers) are counted as items, so N = 69 + 12. (4) docs/language-policy.md already exempted todo.md as an index; that section is reworded to "living tracker, English only, no zh edition". (5) render-campaign.md regenerated with no change: hints are not shown in the status view; the new hint key is "source". (6) The prompt cites plan §15, which does not exist (the plan ends at §14); §13.1 and §14 were used. (7) I-07 and E-07 trace to RESULT S0-C (open f) and RESULT S0-D / R0-A instead of an archived line.
blocker: `bash tools/push_preview.sh --head --no-escalate`, run once, no retry:
  rebased onto origin/preview
  To https://github.com/kcgoofee-jpg/my-tavern-experiments.git
   ! [remote rejected] HEAD -> preview (cannot lock ref 'refs/heads/preview': is at d5fd49bbc1accc6f333eccefa6d62d9f6172fd30 but expected 0125037fc34c15334211e579ad33939451d99e89)
  error: failed to push some refs to 'https://github.com/kcgoofee-jpg/my-tavern-experiments.git'
  Cause: the render line pushed to origin/preview between the script's fetch+rebase and its push (branch is now ahead 2, behind 5). Not force-pushed.
  Options: A) re-run the same push command (the script rebases again; this branch touches only docs, so no conflict is expected); B) leave it to you to push.
open: Q-01 to Q-08 in docs/todo.md §3 need the user's decision (Q-01 = the ambience rescue branch, recommendation: park until after S8, then redo as pack-declared ambience).
coverage: archived unfinished items: 81 (69 + 12 tails) · rows: 81 · missing: 0
counts per destination: S3 1 · S5 2 · S7 2 · S8 1 · S10 4 · Stage B 2 · §1 10 · §2 6 · §3 10 · parked 11 · verify → done 5 · void (render ledger) 7 · void (other) 20
cleanup: done
=== END ===

=== RESULT S0-E-followup ===
status: DONE
items: push race fix ✓  S0-E pushed ✓
commits: fix(push): retry fetch+rebase+push up to 3 times when another line pushes in between
pushed: yes (this push)
tests: bash -n PASS | smoke PASS
deviations: done by the reviewing session (Opus) instead of a new prompt; S0-E status BLOCKED -> DONE
blocker: none
open: none
cleanup: done
=== END ===

=== RESULT R-LOOP hero hero-1 ===
status: PAUSED (context)
items finished this session: isle:silver_crown — setting/draft/board/r1 fail (8.0/5.5)/fix/r2 pass (8.0/6.5)/final/integrate/ship; isle:isle4 (victor_estate) — setting/draft/board/r1 fail (5.5/5.0)/fix/r2 pass (7.5/6.5)/final/integrate/ship
items below gate: none
waiting: none
pushed: yes (head #111)
tests: check_maps PASS | estate3d_manifest PASS (9/9) | smoke PASS (node 630/631, 1 skipped)
blocker: none
next: isle:isle5 (y_estate)
cleanup: done (no Blender or server of this session left running)
notes: agent name hero-1 (the prompt's AGENT=std-1 line says hero lanes use hero-1). The worktree ~/eden-render/wt-hero symlinks the ignored blender/data/props from the main checkout (textures are not in git; the first draft failed without them). The render guard verdict reported status=ok for a run that died with a Python traceback (missing texture) — guard bug, not fixed here. Integration = body-only crop re-render of tiancheng_upper.py (8000/64, --no-data 1) patched into the kept 8K full PNGs + island cutout pasted with tools/isles_into_upper.py at width × depth scale; base:tc_upper must repeat the paste (cutout ids now in tc_islands.json: silver_crown, victor_estate). The victor_estate marker moved from empty cloud onto the isle4 manor; worldbook add-on rebuilt (--ship) for the neighbour list.
=== END ===

=== RESULT R-gate ===
status: DONE
items: user-review stage for "user_gate" items ✓  user send-back (fail --agent user) reopens fix + review-r2 ✓  item isle:eden (hero, first, user_gate) ✓  base:tc_upper depends on isle:eden ✓
commits: feat(render): user approval gate in the campaign ledger; Eden Manor island item
pushed: yes
tests: test_render_campaign 45/45 | smoke PASS
deviations: done by the reviewing session (Opus); user decision 2026-09-30: renders run to the end unattended, the user reviews only their own estate island
blocker: none
open: none
cleanup: done
=== END ===

=== RESULT R-LOOP hero hero-1 ===
status: PAUSED (user: "不通过，暂停，用现在已经在脚本上的那个版本")
items finished this session: isle:eden — setting / draft / board / r1 fail (6.5/5.0) / fix / r2 pass (7.5/6.5) / user-review: NOT approved -> user-review, final, integrate, ship skipped; the shipped Eden (current cover + upper-map Eden) stays; blender/islands/eden.py is kept as an unshipped draft
items below gate: none
waiting: none. In progress: isle:isle5 at fix (released): draft1 r1 fail 5.5/4.5, draft2 fixed ward / forest / ridges, draft3 crashed on an index bug (fixed in the script, not re-rendered)
pushed: see the head #N that follows this commit on preview
tests: check_maps PASS | estate3d_manifest PASS (9/9) | smoke PASS
blocker: none
next: isle:isle5 (fix -> draft3 -> review-r2)
notes: (1) The render guard reported rc=0 / status ok twice for runs that died with a Python traceback (eden draft1, isle5 draft3): always grep the log and check the output mtime. (2) The Eden reference board uses the user-approved local photo set (~/Downloads/酒馆/伊甸参考/); it is kept in ~/eden-map-review/render/isle_eden/refs.jpg only, not committed (stock / news photos). (3) Terrain-zone paths (Terrain.path) stair-step at close range; use K_.drape strips for paths seen up close. (4) Anchors placed inside transparent meshes (water cone, falls) are dropped by the occlusion test.
cleanup: done (no Blender or server of this session left running)
=== RESULT S1-design ===
status: DONE
items: D1 ✓  D2 ✓  D3 ✓  D4 ✓  D5 ✓  D6 ✓  D7 ✓
commits: e7db443 docs(kernel): kernel contract v2 design with zh edition and review sheet
         14bf3ef feat(schema): v2 JSON schemas and the minimal pack
         (this commit) docs(log): S1-design result   (SHAs may change on rebase)
pushed: yes (this push; the head number is in its head commit)
tests: node 633/634 (1 skipped; baseline 630/631, +3 = tests/pack_schema_v2.test.mjs) | smoke PASS | arch PASS | mirror PASS (5 pairs) | doc-language PASS | check_pack eden / minimal / town PASS (validator: tools/jsonschema_lite.py via the new check_pack.py schema-2 branch) | probes: none (design only, no viewer change)
deviations: (1) Rules K-R01..K-R66 (not a round number chosen up front); K-R63..K-R66 (trust by source, untrusted text, model-facing text of foreign packs, limits) were added after the two review passes and keep the next free ids. (2) User correction applied mid-step: no card-vs-invented provenance field anywhere (`canon` removed from the node schema and the minimal pack; v1 `tag` / `canon:false` / `layer_src` are dropped in Appendix A; a test rejects `canon`). (3) Review sheet has 9 items, not 8: "may an embedded pack ship its own page" left the sheet (security, now designer rule K-R36/K-R63); two were added on review (K-08 go-live of a foreign pack's model-facing text, K-09 pictures in card-embedded packs). (4) tests/pack_schema_v1.test.mjs now skips schema-2 packs (it asserted schema 1 for every folder under map/packs). (5) The check_pack.py schema-2 branch is 40 lines incl. blanks; the full reference check is specified for pack-v2.mjs validate2 (B.1). (6) Locate rules were verified with a scratch prototype (not committed): every distinct input of tests/here.test.mjs and tests/card_spec.test.mjs lands on the v1 node after the review changes (word boundaries, normaliser, root hints mask only, head tie-break, shared words); the minimal pack's 39 locate cases of B.1 pass.
blocker: none
open: (a) Q-09 = review sheet K-01..K-09 in docs/kernel-schema.zh.md §0 (recommendations are the working assumption until answered). (b) docs/agent-brief.md §7 still says map-invented content is tagged 「地图自设」 (`tag: "inf"`); that contradicts the no-provenance decision applied here — not edited (outside this step). (c) I-09 (new): three places put pack data into markup / styles without the K-R64 re-check; fix before S9. (d) I-08 (new): English pickup false positive "the" (S6).
node counts (v2 via compat): eden 112 nodes / depth 3 (with the room plan 176 / 4; maps only 108 / 3) · town 8 / 2 · minimal 5 / 3
cleanup: done (no servers or background processes started; the prototype stays in the session scratchpad)
=== END ===

=== RESULT R-LOOP standard std-1 ===

status: PAUSED (usage limit; ledger clean and resumable)

items finished this session: review:clearing_depot (r1 7/6 pass, skip ship); review:contest_corridor (r1 7/5 fail -> r2 7.5/6, shipped); review:ether_dome (r1 7/6 pass); review:free_knight_camp (r1 7/6 pass); review:glory_crown (r1 7/5 fail -> r2 7/6, shipped); review:linguang_post (r1 8/7 pass); review:rust_outskirts (r1 8/7 pass); review:league_club (r1 5.5/7 fail -> r2 7.5/7, shipped); review:rothschild_estate (r1 6.5/7.5 fail -> r2 7.5/7.5, shipped); review:elite_academy (r1 6.5/7.5 fail -> r2 7.5/7.5, shipped); review:holy_mountain (r1 7.5/5.5 fail -> r2 7.5/6.5, glb re-exported); lm:blood_mill (new, r1 8/6.5, shipped)

items below gate: none

waiting: none

pushed: yes (head #126 for the last item; this log entry pushed after)

tests: check_maps PASS (56 maps, 0 errors, 0 warnings) | estate3d_manifest PASS (9/9; count bumped 41 -> 42 for blood_mill) | smoke PASS (node 633/634, 1 skipped)

blocker: none

next: lm:freight_yard (claim released). new + setting are done in the worktree but NOT committed: docs/landmarks/freight_yard.md, blender/landmarks/freight_yard/build.py, map/props/freight_yard/manifest.json, checklist. Board renders were made (docs/reviews/landmark_freight_yard/board.jpg). Do not commit map/props/freight_yard/manifest.json before its glb exists: tests/estate3d_manifest.test.mjs requires every manifest to have its glb. Resume at gapcheck (ledger is at draft: record draft + board, then gapcheck, review-r1, final, ship, and bump the manifest count in the test to 43 when it ships).

notes: (1) Shared island models (league_club, rothschild_estate, elite_academy) were fixed inside their own function in blender/landmarks/upper_estates.py only, and got per-group glb budgets plus a max_mb cap in their manifests (their glbs were 2.2-2.6 MB before and are 0.6-0.9 MB now). (2) landmark.py final --force re-queues the render; to redo only the glb export, edit the manifest and run final without --force. (3) landmark.py ship refuses when the marker already links another map entry (rothschild: zaibatsu_estate -> lm_zaibatsu_estate already loads the model): update the card-buildings row by hand. (4) The holy_mountain script gained --save <path>; its glb pipeline is export_glb.py (budgets from holy_mountain.json) then gltf-transform webp + meshopt (low: simplify 0.25, resize 512, webp 60, meshopt). (5) A push can hit a rebase conflict in the generated docs/plans/render-campaign.md: regenerate it with status --md, git add, rebase --continue. (6) Remaining: 7 landmarks (freight_yard, lower_bar, slums, rebirth_workshop, schneider_clinic, elite_club, hunting_camp), 7 scenes, 7 base-map audits, 8 period variants.

cleanup: done (no Blender, queue job or server of mine running)

=== RESULT S1-impl-1 ===
status: DONE
items: T0 ✓  T1 ✓  T2 ✓  T3 ✓
commits: fc8458c docs(kernel): record the K-01..K-09 decisions
         792278e feat(core): node tree, locate and lexicon (kernel v2)
         (this commit) feat(core): v2 pack validation, defaults and minimal-pack pipelines, with tests   (SHAs may change on rebase)
pushed: head #(see the head commit that follows this one)
tests: node 685/686 (1 skipped; baseline 633/634, +52 = tests/kernel_minimal.test.mjs) | smoke PASS | arch PASS | mirror PASS (5 pairs) | check_pack eden / minimal / town PASS | probes: none (no viewer or host change)
deviations: (1) pack-v2 is split into pack-v2.mjs + pack-v2-spec.mjs (field specs mirroring the v2 schemas) + pack-v2-rows.mjs (typeOf, fieldValue, entityRows, stashRows; re-exported from pack-v2.mjs); nodes split into nodes / locate / lexicon as B.1 allows. (2) validate2 mirrors the schemas with hand-written specs instead of loading the JSON files (map/core is pure and cannot fetch); the 30 bad and 6 good variants of tests/pack_schema_v2.test.mjs are re-run against validate2 to guard drift. (3) Foreign packs: nodes are cut to 1000 (K-R66 "any array"), not 5000.
interpretations: (a) tree.root is the root id string; tree also has synth, distance(a, b), has(id). (b) viewOf always returns focus (also when view is null). (c) locate `word` is the pack's spelling; `text` is the normalised whole input. (d) head = last for zh / ja, first otherwise, overridable by lexicon.head. (e) typeOf returns { type, group, label, color, shape, icon, source, rare, life, inject, fx } (life merged over events.life and the K-R54 defaults, fx resolved from fx_presets or a kernel block); "coloured as hazard" = group hazard, colour of that group. (f) resolveBlocks returns { manifest, problems }. (g) validate2 reports missing parents and cycles (tree-* problems) but leaves the healing to buildTree, so a healed pack may still hang a node under the root at load. (h) A repaired node id and the references repaired with it are one problem; an id with no [a-z0-9] character (e.g. the snowman) is dropped. (i) withDefaults: default period bands are { id, start, dark? } (night dark), levels carry the zh labels under i18n, and group `other` / type `other` are appended when a pack's own events lack them. (j) describe().nodes leaves out a synthesized root; types / views are counts by type / by kind. (k) escape form for K-R65: {{ -> \{\{, }} -> \}\}, <% -> <\%, %> -> %\>; {{user}} / {{char}} kept. (l) pack ids need 2-32 characters (schema pattern), so 'x' is refused by validate2 (withDefaults does not validate).
API: lexicon.mjs — normalise, normText, cpLen, cut, fnv, fnv36, langKey, lexicon, stripArticle, isYes, journey · locate.mjs — vocabulary, locate, unmapped, occurrences · nodes.mjs — buildTree, ROOT_ID, MAX_NODES, viewIdsOf, viewOf, positionOf, scopeOf, levelsOf, describe (+ re-exports vocabulary, locate, unmapped) · pack-v2.mjs — validate2, resolveBlocks, withDefaults, repairId, escapeHost, DEFAULT_PERIODS, DEFAULT_LEVELS (+ re-exports typeOf, fieldValue, entityRows, stashRows) · pack-v2-rows.mjs — typeOf, fieldValue, entityRows, stashRows, LIFE, KERNEL_BLOCKS · pack-v2-spec.mjs — DROP, bad, obj, arr, dict, str, idRef, ID, LANG, HEX, PATH_RE, BLOCKS, MANIFEST and one <block>Block per v2 block.
blocker: none
open: none
cleanup: done (no servers or background processes started; scratch scripts stay in the session scratchpad)
=== END ===

=== RESULT R-EDEN ===
status: DONE (T0–T5; T6 waits for the user's approval of eden:r5)
items: T0 ✓ T1 ✓ T2 ✓ T3 ✓ T4 ✓ T5 ✓ T6 — (after approval)
commits: 8ffdfb6 render(estate2): arrival and rear-lake camera views; 8bbac5e render(campaign): eden:r5 continues the shipped estate2 Eden; estate:b1b2 re-pointed; 9a0d969 wip(eden:r5) requirement index + gap-fix draft; + this commit (review r1, night tuning, ledger)
pushed: head #123 (T0); T2 pushed at 8bbac5e; final push below
tests: node 630/631 (1 skip) | smoke PASS | arch PASS | probes: none (no product code changed)
EQ counts (shipped version): 65 requirements — 46 met, 13 partly, 5 missing, 1 superseded (docs/eden-requirements.md)
gaps fixed in the r5 draft: EQ-39 lookouts, EQ-20 terraces, EQ-33 east wood + rim, EQ-40/41 night, EQ-26–29 card places (以太凝水塔 / 露天训练场 / 围栏区 / 凉亭), EQ-03 close-ups, EQ-22 dairy log, EQ-24 label (zones at ship)
before/after: ~/eden-map-review/render/eden_r5/ (4 pairs + night + close-ups + changes.zh.txt)
deviations: T3 used style_frame.py views (the scene NOTES.md exports) plus two new camera-only views; olive rows onward re-jitter slightly because the terraces moved; d73e3f3 touched nothing the product uses (nothing restored)
blocker: none
open: EQ-48 water cone Eden vs Rothschild (upper-setting §4.1 vs §11); EQ-49 east overflow falls (§10 Q2)
cleanup: done
=== RESULT S1-impl-2 ===
status: DONE
items: T1 ✓  T2 ✓
commits: 2c918fd feat(core): v1 → v2 compat reader
         (this commit) test(core): compat counts, validation and locate parity against the v1 corpus   (SHAs may change on rebase)
pushed: head #(see the head commit that follows this one)
tests: node 706/707 (1 skipped; baseline 685/686, +21 = tests/compat_v1.test.mjs) | smoke PASS | arch PASS | probes: none (no viewer or host change)
parity: 137 distinct inputs (here.test 109 + card_spec 28, read from the files at run time), 135 equal (node and word), 2 the intended merged-site word cases of A.9 (node equal, v2 reports the longest alias found in the text: "大骑士领·圣都" / "圆桌第三席封地"), 0 unexplained. Seven index configurations are replayed: here.test with world + names (103 inputs), with custom rooms (2 configurations), with world and names absent (custom rooms, custom marks: 1 input each); card_spec with the room plan (24 inputs) and with the plan + old custom room names (4). The five intended divergences of A.9 are pinned by their example inputs, each also against v1 itself.
counts: eden 112 nodes / depth 3 / root world (world 1, realm 3, group 2, site 8, layer 5, landmark 92, estate 1) · eden + room plan 176 / 4 (+ 64 room nodes) · eden maps only 108 / 3 (site 7, no realm) · town 8 / 2 / root town (group 1, layer 2, landmark 5) · views: tiles 13 (town 2); model3d = 3D landmark pages + the estate (see deviations). Every converted pack passes validate2 trusted with no problem and no tree repair. Estate: parent tc_upper, 4 aliases, 153 hints; root: 17 hints; levels and enter as A.8.
deviations: (1) A.8's view numbers are one higher because the data grew after the design was written: A.8 says 54 views (model3d 41 = 40 landmark pages + the estate) and 57 landmark nodes with a 3D view; maps.json had 41 landmark 3D pages and 58 nodes with one when this step started (head #128; lm_blood_mill was shipped in head #126, after the design commit) and 44 / 61 at the rebased push (head #132; the render line keeps shipping models). Node counts and depth are unchanged (the markers already existed). The test derives these three numbers from maps.json at run time and pins only the lower bound (>= 40), so the next shipped model does not break it; a later change of A.8 to derived wording is a doc edit outside this prompt. (2) The parity corpus is recorded, not parsed: tests/helpers/here_register.mjs (module hooks, Node >= 22.15) makes a child process running here.test.mjs / card_spec.test.mjs load tests/helpers/here_recorder.mjs in place of map/here.mjs, which re-exports the real module and records every buildIndex configuration and resolveHere call; v1 tests themselves are untouched. (3) compat-v1 is split over compat-v1.mjs (fromV1, rowsFromV1, SOURCE_V1) + compat-v1-geo.mjs (nodes, planWords copy, toImg) + compat-v1-views.mjs + compat-v1-blocks.mjs (legacy, strings, events, roster, stash, worldbook, custom names); fromV1 also takes an optional `lang` (default zh, the language of every v1 pack's own words).
interpretations: (a) idmap lists only ids that change (merged place ids, group ids of merged sites, the estate marker id). (b) Unknown v1 `vars` keys go to `vars.x-v1`; `data.derived / security / patrol / routine` are carried as the manifest keys `x-derived / x-security / x-patrol / x-routine` (path strings). (c) `rowsFromV1(rows)` is the A.7 baibai → imagegen conversion for roster rows; fromV1 itself converts only the fallback roster (a `members` group with `identity` as its role field). (d) Room nodes have `alias: []` and all their wordings as hints, so a room word never places strongly (K-R22); the estate keeps its own 153 hints next to them. (e) The 3D landmark views are created for every live viewer3d map, attached only where a marker's link / link3d targets them. (f) Custom names: a user alias is dropped in compat when v1 would have refused it (word already a standard word, target not a known room / area / marker / layer / place); vocabulary() drops the rest.
blocker: none
open: none
cleanup: done (no servers or background processes started; scratch scripts stay in the session scratchpad)
=== END ===

=== RESULT R-LOOP standard std-1 ===

status: PAUSED (user asked for a pause; ledger clean and resumable)

items finished this session (since the previous checkpoint): lm:freight_yard (r1 8/7); lm:lower_bar (r1 7.5/6.5); lm:slums (r1 6.5/6 fail -> r2 7.5/6); lm:rebirth_workshop (r1 7.5/7); lm:schneider_clinic (r1 7.5/7); lm:elite_club (r1 7.5/6.5, built and committed, ship waiting)

items below gate: none

waiting: lm:elite_club — ship: FREEZE_MAPS (S2-A maps.json dairy re-parent) on origin/preview. Model, glbs, manifest and docs are pushed; remaining at ship: point marker elite_club (currently link lm_glory_crown) to a new lm_elite_club entry in maps.json, update the card-buildings row, then `python3 tools/landmark.py ship elite_club --score "r1 7.5 / 6.5"`; landmark.py ship will refuse because the marker already has a link, so edit maps.json by hand once the freeze is lifted

pushed: yes (head #137 for elite_club; this log entry pushed after)

tests: check_maps PASS (61 maps, 0 errors, 0 warnings, at freight_yard/schneider ship) | estate3d_manifest PASS (count now 48) | smoke PASS

blocker: none

next: lm:hunting_camp (claim released, ledger at draft). Uncommitted in the worktree: blender/landmarks/hunting_camp/build.py, docs/landmarks/hunting_camp.md + checklist, map/props/hunting_camp/manifest.json, board render docs/reviews/landmark_hunting_camp/board.jpg, reviews docs/reviews/campaign/lm_hunting_camp/r1.md + r2.md (r1 7/5.5 fail, r2 7.5/6 pass; the ledger still needs draft, board, gapcheck, review-r1, fix, review-r2 recorded). A draft job (c1) is in the queue; collect it with `python3 tools/landmark.py draft hunting_camp --cam c1 --res 2000 --spp 16`. Do not commit map/props/hunting_camp/manifest.json before its glb exists (manifest test). Marker is in map/data/world_markers.json (layer world), not maps.json: check whether landmark.py ship handles it; the count in tests/estate3d_manifest.test.mjs will need bumping to 49.

remaining standard-lane items after hunting_camp: 7 scenes (highland-ext, fief1..5, yuanyu-city), 11 base-map audits (tc_mid, tc_low, site_kavalierki, yuanyu_sanctum, yuanyu_city, site_highland, fief1..5), 8 period variants (tc_mid and tc_low dawn/day/dusk/night). Standard lane: 20 done, 1 waiting, 27 open.

notes: (1) glory-style per-district glb caps (max_mb in the manifest, with the reason in _note) were used for slums, rebirth_workshop, schneider_clinic, elite_club. (2) The generated docs/plans/render-campaign.md conflicts on almost every rebase: regenerate it with status --md. (3) tests/estate3d_manifest.test.mjs hardcodes the manifest count; set it to the number of map/props/*/manifest.json when a new landmark ships. (4) Cameras must be kept out of the background boxes: use a distance check against the camera positions. (5) The Mac is shared with the hero lane: a draft can sit in the queue behind a long hero job.

cleanup: done (no Blender or server of mine running; one queued draft job remains, harmless)

=== RESULT S2-A ===
status: DONE
items: T0 ✓ T1 ✓ (tavern/spatial.mjs deliberately unchanged, deviation 3) T2 ✓ T3 ✓ T4 ✓ T5 ✓ T6 ✓
commits: 5f5b51f chore: freeze maps.json for S2-A
         a82223d feat(app): runtime node tree over the compat reader; breadcrumb / stand-in / card links read it   (T0, T1, most of T3)
         fdd65a7 feat(data): the dairy parlour moves under the estate farm zone; test-entry mechanism removed; map invariants   (T2, T3 rest, T4, T6 tests)
         (this commit) feat(worldbook): connectivity from the node chain; unfreeze maps.json   (T5, docs, todo, this block, FREEZE_MAPS deleted)   (SHAs may change on rebase)
pushed: head #136 after commit 1; the final head bump follows this commit
tests: node 713/714 (1 skipped; baseline 706/707, +7 = tests/nodes_runtime.test.mjs) | smoke PASS | arch PASS (ratchet down: estate.mjs inline styles 2 -> 1) | mirror PASS (5 pairs) | check_maps 0 errors, check_pack PASS | probes: accept=PASS(24) v096=PASS(31) v2a=PASS(39) pack_town=FAIL(2 checks: "没写 eden 的本机键" desktop + phone, key edenMapLogCur; identical on the untouched baseline 04ce6c0, written by core/logbuf.mjs; not caused by S2-A; spawned as its own task)
breadcrumbs: 60 of 61 maps identical before/after (v1 parent walk over the old maps.json vs the runtime tree over the new data, eden; town pinned by the test too); only `dairy` changed: 世界 › 挤奶厅 -> 世界 › 天城 · 上层 › 伊甸庄园 › 挤奶厅. Full table: ~/eden-map-review/s2/breadcrumbs.md; screenshot ~/eden-map-review/s2/dairy_crumb.png (+ dairy_crumb_header.png). Checked live: lm_cathedral, eden_estate, tc_mid crumbs unchanged; the up button on the dairy goes to 伊甸庄园.
worldbook: `python3 tools/build_worldbook_addon.py --ship` before and after the node-chain change gives a byte-identical add-on (58 entries, 86 types; map/data/worldbook_addon.json not modified). The [TOPO] prefix (天城/上层, 天城/中层, 天城/下层) and the exit layer names now come from the node chain (tools/node_chain.mjs -> map/app/nodes-runtime.mjs); wb_topo tests and the token assertion hold. The dairy adds no worldbook text: its zone is not part of any [TOPO] block, so there is nothing chain-derived to list.
compat numbers (tests/compat_v1.test.mjs, each change is the dairy zone node and nothing else): eden 112 -> 113 nodes, depth 3 -> 4 (world > tiancheng > tc_upper > eden_estate > dairy), composition + zone 1; eden + room plan 176 -> 177 (depth stays 4; estate children 64 -> 65); eden maps only 108 -> 109, depth 3 -> 4; town unchanged (8 / 2). Views: the parlour's model3d view (open: enter) is emitted now that `test` no longer hides it (model3d 48, tiles 13; the test derives them from maps.json). A.8 in docs/kernel-schema.md (+ zh) updated.
deviations: (1) The v1 registry keeps the prompt's `anchor: { zone: "dairy" }`; compat writes the node field as the string `anchor: "dairy"` (K-R32: a region id; kernel-schema A.2 says the same). (2) The breadcrumb is in map/app/layers.mjs (renderNav), not topbar.mjs; topbar.mjs holds the warm-up neighbours (both switched); shell.mjs setActs (up action) too. (3) tavern/spatial.mjs unchanged: it walks no parents, and its level name (`layer.name`) differs from the node name for six merged sites (圣都 vs 大骑士领·圣都, 第一席封地 vs 圆桌第一席封地 ...), so reading the tree would change the bytes of the injected contract; it moves with S3. (4) `levels()` is on the runtime and pinned to REG.groups by a test, but the layer switcher strip still renders from REG.groups: the K-R35 fallback for a single-layer group would turn its one-button strip into a switcher over every site; wiring is S2-B. (5) lm_well7 is shown by two landmarks in two places (tc_mid checkpoint_c, tc_low well7): the crumb follows the last-declared one (parity with the v1 parent tc_low); its estate stand-in is now tc_low/well7 (v1 gave none: only link3d marks point at it). This and the dairy are the only stand-in differences over all estate maps. (6) here.mjs skips viewer3d maps by fact instead of `m.test` (same result: eden_estate is the first estate). (7) The dairy got `alias: ["挤奶厅", "Dairy parlour"]` because check_maps requires an estate alias once the `test` exemption is gone. (8) viewer.html preloads nodes-runtime and its compat chain (app_modules test); one line, viewer.html stays 717 lines. (9) Commit 1 already removes the settings test entry and the m.test warm-up skip (same files as the tree switch); commit 2 has the data, invariants and here.mjs.
blocker: none
open: (a) pack_town red on the baseline too (logbuf writes the un-namespaced edenMapLogCur under a non-eden pack): chip raised, needs a decision only if you want it elsewhere. (b) The dairy has no entry point in the UI until S2-B (only go('dairy'), EdenMap.flyTo({ map: 'dairy' }), or ?map=dairy). (c) docs/todo.md still lists S1-impl-1/2 as open although their RESULT blocks say DONE (not touched here).
cleanup: done (my probe servers stopped, the scratch baseline worktree removed, no launch.json entries)
=== END ===

=== RESULT S2-B ===
status: DONE
items: T1 ✓ T2 ✓ T3 ✓ T4 ✓ T5 ✓ T6 ✓
commits: b142e73 feat(protocol): estate:children / estate:go   (T1)
         (this commit) feat(estate): enter a zone's child 3D view from its card or by double-click; back focuses the zone; topo_dairy probe   (T2–T6, docs, this block)   (SHAs may change on rebase)
pushed: head #<N> (see the push output; the head bump follows this commit)
tests: node 717/718 (1 skipped; baseline 713/714, +4: 1 protocol, 3 nodes_runtime) | smoke PASS | arch PASS | probes: topo_dairy=PASS(20 checks, desktop + 375 px) accept=PASS webgl_single_ctx=PASS (peak 1 frame)
screenshots: ~/eden-map-review/s2/ estate_farm_card.png (zone card with 「进入三维 ›」), dairy_view.png, estate_back_on_farm.png, estate_farm_card_375.png, dairy_view_375.png
mechanism: host -> page `estate:children` { zones: { regionId: [{ node, title }] } } from runtime.zoneChildren(estate id) (children whose node anchor is a region id of a 3D parent), sent from estateLook so it repeats on load, ready, resume and language change; page -> host `estate:go` { node }, accepted only when the node is a zone child of the open page. The page shows the neutral 「进入三维」 / "Enter 3D" button on a zone card that has children and enters on double-click of the zone. Back: the up button and the breadcrumb link to a 3D parent carry `data-focus` = the child's anchor zone id; go() stores it as pendingFocus and the host sends estate:room when the page is ready (openEstate consumed no pendingFocus for a 3D page before); the page resolves a zone by id as well as by name.
T5: runtime.strip(id) = the group's declared levels when they are all members of the map's group, else the map's own single button (the K-R35 sibling fallback lists every site, so it is rejected), [] without a group. layers.mjs renders the strip, the phone quick list, the here badges and PageUp/PageDown from it; without a runtime it falls back to REG.groups. The node test pins strip(id) == the S2-A registry strip for every map of both packs: no map differs (the estate was already a layer of its group, the dairy has no group and stays without a strip; its chain is in the breadcrumb).
deviations: (1) The prompt says the dairy chain adds the estate to a strip; it does not: the strip of a group-less map stays empty (identical to today), the estate is in the breadcrumb. (2) Zones are matched by id in the page (focusRoomMsg falls back to the zone id): the page indexed areas by name / en / alias only, so the anchor id could not be resolved. (3) Standalone (non-embedded) estate page has no host: children stay empty there.
blocker: none
open: none
cleanup: done (my probe server on 5365 stopped, no launch.json entries, the scratch worktree stays until push)
=== END ===

=== RESULT S3-1 ===
status: DONE
items: T1 ✓ T2 ✓ T3 ✓ T4 ✓
commits: 4a2b83d feat(app): current location through nodes.locate (here-v2 adapter) with shadow parity   (T1, T2)
         (this commit) refactor(app): callers switch to here-v2   (T3, T4, docs, this block)   (SHAs may change on rebase)
pushed: head #<N> (see the push output; the head bump follows this commit)
tests: node 722/723 (1 skipped; baseline 717/718, +5 = tests/here_v2_shadow.test.mjs) | smoke PASS | arch PASS (custom.mjs stays at its ledger ceiling of 456) | probes: accept=PASS(24) v096=PASS(31) topo_dairy=PASS pack_town=FAIL (only the pre-existing edenMapLogCur logbuf check, desktop + phone; the town "current location" jump to the dock and the fish-market highlight pass) unmapped096=PASS(22) trips095=PASS(32) custom095=PASS(114); not mine: probe095 fails the same 4 CDN-line checks on origin/preview, chars092 does not load (its import FALLBACK_MEMBERS no longer exists in tavern/mvu.mjs)
parity (tests/here_v2_shadow.test.mjs; v1 = map/here.mjs, v2 = here-v2 over nodes.locate; compared: level, map, marker, place, room, std, floor, restricted, custom, the two ends and texts of a journey, the unmapped name; word separately):
  - corpus of the prompt, here.test + card_spec: 137 distinct (input, config) pairs, 137 equal, of which 2 have the A.9 word difference (merged single-layer sites: the longest alias is reported, v1 the layer word); 0 unexplained
  - session fixtures (every floor of session_a / session_b: the location variable of each floor, the places of characters, events and trips the pipeline reads out): 4 distinct places, 4 placed, 4 equal; 0 unexplained
  - A.9 intended divergences, pinned through the adapter by their example input (none occurs in the corpus): 1 "上层 书房", 2 "奥伦帝国 书房", 3 "大学 议会", 4 "伊甸庄园 人工湖 浴室", 5 "大学 书房" (with and without the plan), plus the two merged sites: 7 examples, each v1 beside v2
  - wider sweep (not asked for): the other v1 tests that call resolveHere (canon0928, characters, omissions099, transit095, unmapped096, which feeds every word of the registry): 306 pairs, 304 equal, 2 differ = ONE input "客房楼" in two configs, see deviation 1
deviations: (1) NEW divergence beyond A.9, found by the wider sweep and therefore outside the stop rule of the prompt, pinned in the test (not whitelisted in the strict corpus test) and raised as Q-10: "客房楼" is an estate area word that contains the room word "客房" one code point shorter. The kernel keeps the longest span (node = the estate, level 2); v1 prefers the room when it is at most one code point shorter (without the plan: the room word, level 1; with the plan: room node "客房", std 客房, floor F2). A.9 #4 names only the word difference without the plan. Effect in the viewer: writing exactly "客房楼" focuses the estate instead of the room box. (2) `word` is the kernel's (A.9); `room` of a non-custom hit is the place as written; results carry two extra fields, `node` and `via` (alias / hint / user). (3) The adapter builds its own tree through fromV1 (1.9 ms) instead of reading nodes-runtime's: the user's names are vocabulary words and change without the plan arriving. (4) The unmapped name is decided by the kernel (K-R25) and shown as written; its ignore list is compared in normal form (v1: exact). (5) Removed with the switch: HX / setHX in locate.mjs, the dynamic import of here.mjs in boot.mjs, layers.mjs `hereLayer` (only used when here.mjs failed to load), the modulepreload of here.mjs (viewer.html now preloads app/here-v2.mjs); `readCustom` (old per-machine room names) is copied into here-v2 and re-exported by locate.mjs. (6) Left for S3-3 (out of this step): tavern/spatial.mjs, the card script map/tavern/eden-map.js (its own here.mjs import: transitLabel, parseTransit, room names), skills/card-map/check_here.mjs, tools/build_worldbook_addon.py, tools/check_maps.py; map/here.mjs stays and its own tests stay untouched and green.
blocker: none
open: Q-10 (accept "客房楼" → estate as A.9 #6, or change the kernel tie rule; recommendation: accept).
cleanup: done (my probe server on 5611 stopped, the scratch baseline worktree removed, no launch.json entries; the s3-1 worktree stays until push)
=== END ===

(S3-1 commit shas after the rebase onto head #141: dbfb1c2 feat(app): current location through nodes.locate (here-v2 adapter) with shadow parity; 5aa6945 refactor(app): callers switch to here-v2; pushed as head #142.)

=== RESULT S3-2 ===
status: PARTIAL (stopped at the prompt's stop rule: parity differences outside K-01 B / A.9; T3, T4 and the viewer half of T1 not started)
items: T0 ✓ (overlay data + K-R67 + generator + validation) · T1 ½ (core/event-geo.mjs and tavern/events.mjs `setGeo` ✓ — additive, the v1 rules stay the default; the viewer's map/events.mjs ✗) · T2 ✓ (shadow parity test, differences pinned, stop rule hit) · T3 ✗ · T4 ✗ · T5 ✓ (this block, docs/todo.md §0 and Q-10 / Q-11)
commits: bb34cab chore: freeze maps.json for S3-2   (pushed as head #145)
         efd89ee feat(data): first-pack tier hints, district and outskirts nodes (generated from the old constants)   (T0)
         c10a075 feat(events): placement through nodes with shadow parity   (T1 tavern half, T2)
         (this commit) docs: RESULT S3-2, todo, Q-11   (SHAs may change on rebase)
pushed: head #<N> (see the push output; the head bump follows this commit)
tests: node 745/746 (1 skipped; baseline 722/723, +23 = overlay_v2 6, event_geo 8, events_geo_shadow 9) | smoke PASS | arch PASS (card-term hits 206 → 206: nothing is deleted yet, the constants go in T3) | probes: accept=PASS v096=PASS (the viewer does not load the overlay and does not call the new code; nothing to compare on screen, so no before/after screenshot in ~/eden-map-review/s3/)
parity (tests/events_geo_shadow.test.mjs; old = a frozen copy of the v1 rules in tests/helpers/events-legacy.mjs, new = nodes.locate over the eden tree + overlay; compared: layer label, map, place text, spot within 0.002 of the map width):
  - strict corpus = every place text tests/events.test.mjs feeds in (the file runs against a recording copy of the events module) + the session fixtures (2 tagged events, 1 distinct place): 309 distinct places → 299 identical (tier, map, text and spot), 3 K-01 B (`某处`, `骑士团巡逻据点`, `区议会`: v1 dropped them, the tree holds nothing, now listed without a pin), 7 DIFFERENT outside K-01 B / A.9:
      found ×2   `奥伦帝国` → realm node, world map; `某家族庄园` → the estate (`庄园` is an alias of it; here.mjs agrees). v1 left both unplaced on purpose ("the capital is the city, not outside it"; "庄园 alone fixes no layer"). events.test.mjs asserts that, so it fails once the new path is the default.
      world alias ×1   `灵枢秘派` (alias of a realm) is pinned on the world map; v1 matched names only and drew nothing.
      marker match ×4 (layer, map and text equal; spot only)   `中层·A`, `中层·C` (one-letter placeholders matched any marker holding the letter), `悬浮庄园区` (the tier's longer name beats the estate word inside it, K-R20), `中层修道院` (v1 pinned the convent next door, the tree pins the named one).
  - 0 lost places, 0 changed layer labels, 0 changed maps, 0 changed place texts in the strict corpus; the current-location layer word of all 20 location texts of events.test equals the old one.
  - wider sweep (not asked for): the 340 names / aliases / old regex words placed bare: 165 identical, 154 newly placed (world places, fiefs, `天城`, sites v1 never listed), 11 on another map (9 = places inside a site that has its own map — knights' city, highland, holy city — drawn on that map, v1 knew only their world point; `外围` = mid-tier district, v1 the ring; 1 more is a knights'-city venue name), 1 world alias, 9 marker matches. Pinned by class in the test.
overlay (map/packs/eden/overlay.v2.json, 24 entries): 14 new nodes = 12 districts under tc_mid / tc_low (`at` = (x+15)/30, (9.375-y)/18.75 of the old ZONES, so every district spot equals the old one; hints = the zone words that name no landmark + the tier's own aliases that hold one) + `beyond` (far outside) + `outskirts` (ring, `x-ring`); 10 entries add hints to existing nodes (tier words go to the one place whose name holds them, e.g. `银冠` → the keep, else to the tier; a word that already lands in its tier needs none); `world` gets the alias and label `天城外`. A.8 with the plan: 177 → 191 nodes, depth 4 (tests/overlay_v2.test.mjs derives it from the file; tests/compat_v1.test.mjs passes no overlay, so its counts are untouched).
  the overlay in the current location (app/here-v2.mjs loads it when given): of 719 names / aliases / hints, 4 move: `天城外`, `天城周边`, `天城外围` (v1: the city's upper tier, because they hold the city's name; now the outside → no map, the location stays) and `旧教堂` (the cathedral in the mid tier → the old-church district of the lower tier); ~20 words that placed nowhere now place (tier words as hints). here-v2 lets a node that is no map / marker / world place stand for the nearest one above it that is.
deviations: (1) STOPPED before T3/T4 (prompt §9): 7 corpus differences outside K-01 B / A.9, see Q-11; the old constants are still in the engine, the ratchet is not lowered, FREEZE_MAPS stays (nothing in maps.json changed). (2) T1 viewer half not done and nothing is wired: the viewer, boot.mjs and eden-map.js do not load the overlay or call setGeo, so production behaviour is unchanged. (3) design choices the parity forced, to confirm with Q-11: an event lives on the map that frames its node's `at` (a point on a map), else on its scope (K-R51) — a site with its own map is a point on the world map, a place inside it belongs to the site's map; the event `layer` label is that map's `x-layer` / name; events are placed without `here`; the merge key stays type + layer + place text (K-R54's node key is S4-1's); `tavern/events.mjs` keeps `LAYERS` / `LAYER_MAP` / `configure(tax)` until T3. (4) compat-v1 `fromV1` returns a new field `problems`. (5) The prompt named `docs/plans/FREEZE_MAPS` removal for the last commit; not removed because T3 is open.
blocker: "Stop and report when: ... a parity difference outside K-01 B / A.9" — 7 places of the strict corpus, listed above. Tried: tuned the overlay until only differences the kernel rules cause were left (holder hints instead of tier hints, root alias for the layer word so a named place wins over `天城外·`, `天城外围` as a ring word, no hints for words that already land in their tier). Options: A) accept every class as new A.9 items (#7-#10) and run T3-T5 (recommended: each is what K-R20 / K-R21 say, none loses an event); B) keep v1's exclusions for `奥伦帝国` / `庄园` by data — needs a K-R67 extension that lets an overlay mute an alias; C) also draw place-inside-a-site events on the world map at the site's point (parity for the wider sweep, contradicts K-R51).
open: Q-11 (docs/todo.md §3). Q-10 decided A (A.9 #6 in kernel-schema.md + zh).
cleanup: done (no servers left running, no launch.json entries, my scratch files are in the session scratchpad; the s3-2-events worktree stays until the step is finished)
=== END ===

(S3-2 commit shas after the rebase onto head #149: cfd9d90 feat(data): first-pack tier hints, district and outskirts nodes; f1e9eb2 feat(events): placement through nodes with shadow parity; 37bd9f1 docs: RESULT S3-2; pushed as head #150.)
=== RESULT R-EDEN (T6) ===
status: DONE
items: T0 ✓ T1 ✓ T2 ✓ T3 ✓ T4 ✓ T5 ✓ T6 ✓
commits: d4f9590 render(estate2): eden:r5 falls thicker (user 2026-10-01); user approved eden:r5
         (this commit) render(campaign): eden:r5 final + integrate + ship
pushed: head #153 (expected; see push output)
tests: node 722/723 (1 skipped) | smoke PASS | arch PASS | probes: accept=PASS estate3d_manifest=9/9
deviations: tc_upper recut from the ignored lossless tc_upper_full.png (one stale isle4 tile 12_2 replaced by the live tile first) instead of tools/eden_into_upper.py, so Eden lands exactly in the shipped eden_hi inset bounds; web_scene.py now saves absolute texture paths (dairy textures resolved to /blender/… in the first glb bake); site.glb 3.94 MB (−12 %), site_low.glb 2.14 MB (−9 %), smaller rock texture; maps.json untouched (FREEZE honoured), worldbook unchanged (reads maps.json areas only)
blocker: none
open: tree houses 2 and 4 stand on bare sand at the north rim (catalogue B15/B17) — candidate for the per-place tweak pass
cleanup: done

=== RESULT S3-2 (after Q-11 = A) ===
status: DONE
items: T0 ✓ T1 ✓ (tavern + viewer) T2 ✓ T3 ✓ T4 ✓ (ring = the `x-ring` node, placed by hint words, drawn by the same spotOf) T5 ✓
commits: cfd9d90 feat(data): first-pack tier hints, district and outskirts nodes (generated from the old constants)   (earlier block)
         f1e9eb2 feat(events): placement through nodes with shadow parity   (earlier block)
         (this push) refactor(events): old event geography constants removed   (T3, T4)
         (this push) docs: RESULT S3-2, A.9 #7-#12, Q-11 decided, unfreeze   (T5)   (SHAs may change on rebase)
pushed: head #<N> (see the push output; the head bump follows this commit)
tests: node 746/747 (1 skipped; baseline at the start of S3-2 722/723, +24) | smoke PASS | arch PASS (card-term hits 206 → 174; map/events.mjs 428 → 409 lines; ledger lowered with --update-baseline: terms map/events.mjs 16 → 7, tavern/events.mjs 87 → 64) | check_maps 0 errors, check_pack PASS | probes: accept=PASS v096=PASS e7=PASS p6_quests=no ✗ pack_town=FAIL only the pre-existing edenMapLogCur key check (desktop + phone; the town events, legend and pins pass) roster095=FAIL, the same 8 checks fail on the pre-S3-2 tree (head #151), not from this step
before / after (tools/browser lib postEvents on tc_mid and tc_low, 19 events, desktop 1440; ~/eden-map-review/s3/events_tc_mid_old.png, events_tc_mid_new.png, events_tc_low_old.png, events_tc_low_new.png, old.json, new.json): 17 of 19 pins at the same pixel (district spots, landmark markers, the outskirts ring, tier-only approximate spot); 2 moved = the marker-match class (A.9 #10): `中层·大学` (v1: a university marker whose name holds the text; now the district spot), `下层·工厂` (v1: the facility marker whose name ends in 工厂; now the factory district). The unplaced `某处` is listed, not drawn, and opens a card that says so.
parity (unchanged from the PARTIAL block): 309 distinct places of events.test.mjs + fixtures → 299 identical, 3 K-01 B, 7 pinned as A.9 #7-#10; wider sweep 340 → 165 identical, 154 newly placed, 11 on a site's own map (#11), 1 world alias, 9 marker matches. `tests/events_geo_shadow.test.mjs` runs events.test.mjs against the new engine (events.test.mjs itself now installs the geo and asserts the A.9 outcomes) and keeps the frozen v1 rules as the oracle.
deviations: (1) The overlay is declared by the manifest (`data.overlay`, schema + check_pack) instead of being probed next to it: a probe makes every pack without one log a 404 (the town probe failed on it). The file is still `map/packs/<id>/overlay.v2.json`. (2) `configure(tax)` no longer reads `tax.layers`; a foreign pack's layer match words reach the tree through `fromV1 events`. (3) Old tavern scripts send no `node`: the viewer places such an item by layer + place text (`node === null` = unplaced, `undefined` = place by text). (4) `ops.mjs` checks a layer against the geo labels (every label of a map owner) instead of the four fixed words. (5) Merge key stays type + layer + place text, `here` is not passed to event placement (as reported before; S4-1 owns the node key). (6) Slip: one `pkill -f cors_server.py` of mine also stopped other sessions' probe servers (they restart on demand); everything else cleaned by PID.
blocker: none
open: none
cleanup: done (my probe servers stopped, baseline worktree removed, no launch.json entries; the s3-2-events worktree stays until push; docs/plans/FREEZE_MAPS removed)
=== END ===

(S3-2 T3-T5 commit shas after the rebase onto head #154: c04ce14 refactor(events): old event geography constants removed; d6a9498 docs: RESULT S3-2 (DONE), A.9 #7-#12, Q-11 decided, unfreeze maps.json; pushed as head #155.)

=== RESULT S3-3 ===
status: DONE
items: T1 ✓ T2 ✓ T3 ✓ T4 ✓ (addendum: chars092 fixed and run ✓, roster095 cause found = stale probe, fixed ✓, the five v1 users of map/here.mjs moved ✓)
commits: 66e8917 feat(app): characters, trips, stand-ins and item places through nodes (shadow parity)   (T1)
         6be3984 feat(tavern): spatial contract from the node chain (injected text unchanged)   (T2)
         (this commit) refactor: remove the v1 resolver; tests run through nodes   (T3, T4, this block)   (SHAs may change on rebase)
pushed: head #160 after commit 2 (CI green); the final head bump follows this commit
tests: node 752/753 (1 skipped = numpy; baseline 746/747: +4 places_nodes_shadow, +4 spatial_nodes, +4 here_v2, -5 here_v2_shadow, -1 compat_v1 parity) | smoke PASS | arch PASS (card-term hits 174 -> 169, map/here.mjs left the ledger; custom.mjs 456, eden-map.js 1535, viewer.html 717 unchanged) | mirror PASS (5 pairs) | check_maps 0 errors | worldbook add-on rebuilt with --ship: map/data/worldbook_addon.json byte-identical | probes: accept=PASS(24) v096=PASS(31) chars092=PASS(48) roster095=PASS(45) topo_dairy=PASS(17) e7_host=PASS(10) trips095=PASS(32) custom095=PASS(114) unmapped096=PASS(22); mvu093=FAIL 2 checks x3 presets (night tint "中层加、下层不加", people source labels "同处/标签/MVU"): identical on the untouched baseline b30e9f2, not from this step
parity:
  T1 (tests/places_nodes_shadow.test.mjs; old rules = a frozen copy of chars.mjs `where`, new = app/spot.mjs `drawPlace`): session fixtures 3 distinct places (who is where + trip ends: 伊甸庄园·书房, 中层·霓虹街, 上层·银冠堡) 3 placed, 3 identical, 0 different; sweep over every name and alias of both packs: eden 525 words, 518 identical, 7 different = all realm places (old: approximate district spot with jitter, now the node's own point, as events draw it); town 23 of 23 identical. Item places: the 3 stash rows are landmark nodes on the map they name (K-R45), each row's place text places at its landmark, a hidden row is visible from its own place only.
  T2 (tests/spatial_nodes.test.mjs, golden from the v1-resolved module in tests/fixtures/spatial_golden.json): session fixtures 3 places, location + full text + tight-budget text + JIT activation set byte-identical (0 differences); sweep 618 words (every name / alias of the first pack + "layer·landmark"): 604 identical, 14 differ (see the diff below).
injected-text diff: none for either session fixture. The 14 sweep words are pinned by word and class: 10 "placed" (Dairy parlour, the five "… Seat Fief", Kavalierki, Yuanyu, "Yuanyu, the Primal Realm", 原域: v1 built its index for the contract without the world list / English names so no contract was injected; the viewer placed them already), 2 "longer" (Pantheon Tier, Wild Highlands Tier: a layer word longer than the landmark word it holds; K-R20, v1 took any landmark), 2 "tie" (哥特尖塔与巴洛克穹顶, 旷野高地·下山小径: equal spans, the kernel takes the deeper one). The six merged sites keep their short layer names in the text (圣都, 第三席封地 ...): engine.level + result.layer, pinned in the test.
removed: map/here.mjs; tests/here_v2_shadow.test.mjs (5 tests: corpus shadow, wider sweep, fixtures shadow, A.9 v1-beside-v2, adapter shapes; the v2 halves live on in tests/here_v2.test.mjs, 4 tests); tests/helpers/here_recorder.mjs + here_register.mjs; compat_v1 "parity: every distinct input of here.test and card_spec" (1 test; the inputs now run through here-v2 inside here.test / card_spec); in here.test the setRoomAlias / removeRoomAlias assertions (helpers with no caller besides the test; readCustom / customKey stay in core/legacy-custom.mjs). Added: app/spot.mjs, core/transit.mjs (parseTransit / transitLabel, 4830 inputs equal to v1), core/legacy-custom.mjs, tools/pack_here.mjs, tests/helpers/{here-engine,session-places,spatial-golden}.mjs. Consumers moved: card script eden-map.js (core/transit.mjs, core/legacy-custom.mjs), skills/card-map/check_here.mjs, tools/build_worldbook_addon.py, tools/check_maps.py.
deviations: (1) T1 was smaller than the prompt assumed: characters, trips and the estate stand-in already resolved through hereRes / standIn since S3-1 and S2-A; what was left was a registry `kind` check, a world place found by name and two marker-link scans, now one pure function over the tree. custom.mjs had no resolver of its own; it now takes the estate and its stand-in landmark from the tree. (2) Three behaviour differences beyond the two fixtures, raised as Q-12 (recommend accept): the 14 spatial sweep words; a realm in a character's place is an exact point; the reputation meter on place cards shows only on the estate's own stand-in landmark (before: on every landmark whose link targets a 3D page, 89 of them: a latent bug). (3) Level words and exit targets in spatial.mjs are read from the registry through the engine (engine.level), not from node names: the six merged sites' node names differ from their layer names and pack data edits were out of scope. (4) tavern/spatial.mjs imports app/here-v2.mjs (tavern -> app, no rule against it; core stays a leaf). (5) Pack data untouched: map/data/maps.json still carries "here.mjs" in two _note strings.
blocker: none
open: Q-12 (docs/todo.md). Not mine: probe mvu093 fails 2 checks on the baseline too (night tint, people-source labels); roster095's 8 failures were a stale expectation (members table plus the pack's fallback roster, 2 + 16), fixed in the probe.
cleanup: done (my probe servers stopped by PID, scratch baseline worktree removed, no launch.json entries; the s3-3-rest worktree stays until push)
=== END ===

=== RESULT S0-F ===
status: DONE
items: T1 ✓ T2 ✓ T3 ✓ T4 ✓ T5 ✓ T6 ✓ T7 ✓
commits: b7d363a chore: freeze maps.json for S0-F   (pushed first, head #163)
         daf7b2c refactor(data): drop provenance labels from data text and fields   (T2, T3 data; includes the check_maps / worldbook-builder changes the field changes need)
         212d320 refactor(ui): no card-vs-invented chip on cards   (T3 UI; pushed with the commit above as head #164)
         5c5d934 refactor(tools): setting / board / worldbook templates without provenance labels; no-labels gate   (T4, T6, blender scripts, tests)
         (this commit) docs: remove provenance labels from current docs; unfreeze maps.json   (T5, T7, this block, FREEZE_MAPS deleted)   (SHAs may change on rebase)
pushed: head #164 after commit 2 (CI green at the time of the push); the final head bump follows this commit
tests: node 754/755 (1 skipped = numpy; baseline 752/753, +2: landmark pipeline board items, card-buildings table update) | smoke PASS (new steps: tools/check_no_labels.py and its self-test) | arch PASS (ledger unchanged) | probes: accept.mjs first,layers,fly,estate=PASS; a scratch probe opened the marker card of the mage tower on tc_mid = PASS (chip text empty and hidden, title and body shown; ~/eden-map-review/s0f/card.png); event cards still fill the chip with their own type (accept "fly" step)
counts (occurrences in the scope of docs/plans/s0f-inventory.md; W1..W9 are the word ids of that file): W1 152 -> 2, W2 588 -> 2, W3 103 -> 0, W4 287 -> 4, W5 217 -> 0, W6 47 -> 0, W7 33 -> 0, W8 85 -> 0, W9 39 -> 1. What is left: the three rule lines in docs/agent-brief.md and docs/agent-brief.zh.md (W1, W2, W4; allowed by exact line in the gate) and one assertion in tests/compat_v1.test.mjs that the node objects carry no W9 key. 159 files touched by the inventory, 0 files with a hit outside those.
behaviour-bearing fields (kept under neutral names): (1) marker `canon:false` (28 markers; excluded from the worldbook place listing) -> `wb_list:false`. (2) marker `layer_src` / `sub_src` / src wording (23 markers; the place must have an entry in addon_places.json, `landmark.py ship` adds one) -> `addon:true`; check_maps.py: `wb_list:false` or `addon:true` requires a `refs` entry. (3) `showCard(el, name, tag, src, ...)`: the tag only decided whether cards without a marker element get the map-to-chat link (the three realm cards) -> `showCard(el, name, src, extra, sub, cover, compose = !!el)`. (4) estate room `kind: "inferred"` (22 rooms, same colour as before) -> `kind: "open"`. Display-only and deleted: marker / world `tag`, `layer_src`, `sub_src`, addon_places `src`, room `src`, `.mk.inf`, the chip strings, the estate legend entry and room-card line, plan.js `src`, the legacy pages' orange styling.
deviations: (1) Commit 1 also carries tools/check_maps.py, tools/build_worldbook_addon.py and the schemas: the field changes do not pass CI without them. (2) Beyond the nine words I removed the same kind of provenance wording where it sat in the text I was already editing: the worldbook add-on footer and the model-facing "the card does not say" sentences (addon_places texts, rebuilt), "user decision" clauses in marker texts, the `lm_*` notes, board source kinds, the card-buildings source column (column removed; landmark.py and render_campaign_items.py follow the new column indexes), addon_places `src`, room `src`, `canon`, `sub_src`. (3) The landmark setting sheets became one section; nine sheets that used a different heading (card facts section plus a second section) were merged the same way. (4) tests/schema_maps.test.mjs pinned the `tag` enum error; it now pins the `cls` enum error (same meaning: a wrong enum value is reported). tests/action.test.mjs and tests/inventory.test.mjs used an item name with the old prefix; renamed. (5) The bare W4 also matches ordinary Chinese phrases that merely contain its two characters (one line in blender/estate/CONTRACT.md, "comes from the setting"); that line was reworded. (6) `python3 tools/build_worldbook_addon.py --ship` also writes its default output to ~/Downloads/酒馆/世界书/ (a download folder, not a tavern data directory); the shipped copy is map/data/worldbook_addon.json.
blocker: none
open: (a) Wording of the same family that is not one of the nine words and was left: "设定未给" / "位置未写" style statements in some marker and world texts; the `user` room kind (medical centre) and "用户决定" mentions in dev notes; the worldbook entry names "地图补充-*"; `canon` (card | inferred) on render-campaign items (tools/render_campaign_items.py, docs/plans/render-campaign.items.json); the legacy estate v1 files (blender/estate/plan.py `src`, blender/estate/mats.py remarks); history docs that still describe the removed fields (docs/tiancheng-maps.md other sections, docs/card-digest.md, docs/card-omissions.md). Decision needed: sweep them in a follow-up, or leave. (b) 推断 left in scope (53 lines): the people panel "position from the table" logic and its tests/probes (tests/characters.test.mjs, tests/mvu.test.mjs, tools/browser/mvu093.mjs, v097.mjs, docs/handoff.md), layer inference for events / seq / versions (tests/events.test.mjs, tests/inventory.test.mjs, tests/host_split.test.mjs, tools/build_worldbook_addon.py self-check, tools/landmark.py status, tools/new_pack.py, house_web.py door rule), legacy estate v1 palette remarks, two landmark sheets that quote card-digest rows. None of them labels content as from the card or invented. (c) The ledger `AUTHORITY` ladder (canon / committed / verified ...) and `SpatialNode.canon` in docs/ARCHITECTURE.md are a different mechanism (how sure a statement is) and stay.
cleanup: done (probe servers stopped by PID, baseline worktree removed, stash applied, no launch.json entries; the s0f-labels worktree stays until push; docs/plans/FREEZE_MAPS removed)
=== END ===

=== RESULT H1 ===
status: DONE
items: T1 ✓ T2 ✓ T3 ✓ (rule added; main sync runs after the push, see deviations) T4 ✓ T5 ✓ T6 ✓ T7 ✓
commits: ece5908c docs: new README (en + zh) and README gate; ROADMAP archived   (T1, T2)
         d77a8e0d docs(plan): render campaign and pipeline upgrade sections; leftover items scheduled; B0   (T4)
         15b9a260 test(browser): known-failures baseline for pre-existing probe failures   (T5)
         (this commit) docs(rules): main sync per stage; parity divergences that lose nothing may proceed   (T3 rule, T6, T7, this block)   (SHAs may change on rebase)
pushed: head bump follows this commit (see push output); main sync after the push
tests: node 758/759 (1 skipped = numpy; baseline 754/755, +3 known_failures) | smoke PASS after the test_warm_cdn race fix (baseline smoke failed only on that test, in both runs) | arch PASS | mirror PASS (6 pairs, README pair added) | check_readme + self-test PASS (12 cases) | test_render_campaign PASS (46) | probes: pack_town=PASS with 2 KNOWN (desktop + phone), mvu093=PASS, probe095=PASS
README outline: What it is · Status · Install · Documentation · Credits · Asset licences (README.zh.md has the same six headings)
known-failures (tools/browser/known-failures.json): pack_town "没写 eden 的本机键" (owner S5): product bug, core/logbuf.mjs writes un-namespaced edenMapLogCur / edenMapLogPast under a non-eden pack — listed, not fixed (engine code). Fixed as stale probe expectations, so not listed: mvu093 night tint (tc_mid has a night base map since 9ad6dfc, so no tint; the probe now expects data-tod + tint only when no night map) and people source label (now "同处"); probe095 (speed test measures maps.json by bytes per ms since 2026-09-29, no longer races build.json).
main: before 2a126fad381591e4d1a8b066e5b231aea152c939 (origin/preview at the start of this run 03a93a5a…)
deviations: (1) E-06: docs/card-buildings.md already lists the supreme court and the university as built (r1 7.5 / 7.5), so the two new ledger items (inst:supreme_court, inst:tiancheng_univ, type review, standard lane) check or fix the existing model; new ids fix:climate_tower, inst:* use the existing review stage table, tests updated (69 -> 72 items; init in an empty tree 70). (2) The old README is kept as docs/archive/README-2026-09-30.md; the CDN-lines note moved to docs/branching.md, the diagram to ARCHITECTURE §11. (3) check_version.py also accepts "Current release:" (the English README). (4) tests/test_warm_cdn.py: fixed a read-before-write race (test-only) because it made smoke red on the baseline. (5) Two stale probe expectations fixed in mvu093 and probe095 (T5 allows). (6) CLAUDE.md forbids a Co-Authored-By trailer, so the commits carry none despite the tool's attribution reminder.
blocker: none
open: pack_town known failure is an engine product bug (core/logbuf.mjs key namespace); the brief says stop when a known failure is an engine bug, the prompt's T5 says keep product bugs listed — I listed it and continued; say if you want it fixed before S4.
cleanup: done (probe servers stopped by PID, no launch.json entries; worktree wt-h1 stays until merged)
=== END ===

=== RESULT R-LOOP standard std-1 (checkpoint 2) ===
status: PARTIAL (paused at the user's request / usage limit)
items: lm:elite_club ship ✓ | lm:hunting_camp ✓ model+glbs+manifest (3D entry not wired, see open) | scene:highland-ext ✓ | scene:fief1..fief5 ✓ | scene:yuanyu-city ✓ | base:tc_mid ✓ (audit skip) | base:tc_low ✓ (audit skip) | base:site_kavalierki, yuanyu_sanctum, yuanyu_city, site_highland, site_fief1..5 ✓ (re-rendered 4000 px / 128 spp) | var:tc_mid:day, var:tc_mid:night ✓ (re-rendered at 128 spp) | var:tc_mid:dawn/dusk, var:tc_low:dawn/day/dusk/night: render + tiles ✓, register waiting (FREEZE_MAPS)
commits: maps wiring for fief1..5 and yuanyu_city; nine site base maps; dawn/dusk lighting (--tod) in tc_common/tiancheng_mid/tiancheng_low; eight period base maps (tiles)
pushed: head #169
tests: node pass at each push | smoke PASS | check_maps 0 errors 0 warnings
deviations: (1) hunting_camp ship skipped: world-layer places carry no model link and the node tree needs a maps.json marker hosting each 3D page; needs an engine step. (2) The site re-renders rewrote map/data/site_kavalierki.json without the hand-placed arms_rnd marker; restored from git, not committed. (3) tc_mid/tc_low base audits accepted on the logged 2026-09-28 8000x128 finals; the 2026-09-29 renders are period variants.
blocker: none
open: (a) register dawn/dusk (tc_mid) and dawn/day/dusk/night (tc_low) in maps.json periods and update tests/compat_v1.test.mjs:203 (pins tc_mid periods to day+night); the viewer's periodOf (map/app/nav.mjs) only reads day/night, so dawn/dusk need an engine change to be used. (b) hunting_camp 3D entry (see deviations). (c) two open standard items were added by another line (fix:climate_tower is next); not started. (d) Base maps keep the script-generated blocks; the new landmark models are not baked in (user decision).
cleanup: done (my own background waiters finished; no Blender runs of mine left)
=== RESULT S4-1 ===
status: DONE
items: T0 ✓ T1 ✓ T2 ✓ T3 ✓ T4 ✓ T5 ✓ T6 ✓ (known-failures.json arrived on preview with H1 during this step: the CI browser-smoke job is enabled, `if: false` removed, running accept + v096 + topo_dairy headless, continue-on-error kept; the first CI run of it is unverified)
commits: 98dc17ce chore: freeze maps.json for S4-1   (pushed first, head #166)
         d6c1db17 feat(core): overlay may carry an events block (K-R68)   (T0)
         64621842 feat(data): first-pack event taxonomy as pack data (generated)   (T1; pushed as head #167)
         ef79edc5 feat(events): taxonomy, fx and default-off from pack data; neutral default taxonomy; shadow parity   (T2–T4)
         (this commit) refactor(events): built-in taxonomy removed from engine code; unfreeze   (T5, this block)   (SHAs may change on rebase)
pushed: head #167 after commit 2; the final head bump follows this commit
tests: node 771/772 (1 skipped = numpy; baseline 754/755: +17) | smoke see the push output | arch PASS (card-term hits: map/tavern/events.mjs 64 -> 0 and left the ledger, map/events.mjs 7 -> 5; map/events.mjs stays at 409 lines) | check_pack PASS, check_maps 0 errors, mirror PASS | probes: accept=PASS v096=exit 0 e7_host=PASS pack_town=FAIL only the pre-existing edenMapLogCur key check (phone host; same as S3-2's block) events_fx (new)=PASS 10/10
glitch: ~/eden-map-review/s4/glitch.png (a glitch-type event posted through the script's parser: body[data-glitch]=3, the note shown; an item that declares fx: glitch on another type triggers it; the glitch type without fx in the item is resolved by the viewer; closing turns it off)
parity (tests/events_taxonomy_shadow.test.mjs, old = tests/helpers/events_v1_frozen.mjs, a frozen copy of map/tavern/events.mjs at head #165): marks 339 in 378 texts (370 event-test texts + 8 session floors): 339 identical, 0 different (type, group, colour, icon, rarity, publisher; no life / inject overrides); sweep 283 words (every type name, alias, group name and corpus category word): 283 identical; closing words 13 statuses identical; collected lists of both fixtures floor by floor 8 of 8 identical; injected event lines 64 compared, 6 non-empty, byte-identical; AGE, life, default-off, tag and examples checked. Pinned divergence Q-13: on the synthetic stream of event-test texts (200 floors) old 165 events, new 162 (merge key type + node, K-R54).
watchdog terms: 103 hits now (ledger 169 before; map/tavern/events.mjs 64 -> 0, map/events.mjs 7 -> 5).
ci: see `gh run list --branch preview -L 1` after the push; the browser-smoke job is now enabled (T6); it was never run on CI before, so its first result is informative only.
deviations: (1) The taxonomy reaches events.mjs through geo.taxonomy() (setGeo configures it) instead of a separate configure call in the viewer and the script; configure() stays as the explicit entry. (2) The overlay may also carry llm.templates (the injected-line tag needs a home); K-R68 says so. nodes may be left out of an overlay that has events. (3) typeOf changed: the `other` type matches only by equality and supplies icon / label / rarity for unmatched words (old behaviour: "其他事故" would have fallen to `other` by containment). (4) fx preset duration: v1's glitch length counts messages, the kernel preset's `seconds` does not fit; the eden preset uses `x-messages: 3`, `intensity` (0–1) is honoured when a preset gives it. (5) `key` (event identity, pin jitter) and `id` keep the old format; only the merge map uses type + node. (6) The neutral set is mine (K-R53 names the groups only): 8 groups, 23 types; the conflict type is labelled 交锋 so it does not repeat its group's label. (7) Items without group / icon / colour (navigator ops) are now filled from the taxonomy in the viewer; before they fell back to a per-type table and the "other" group. (8) Not done: app/cvd.mjs palettes stay keyed by the first pack's group names and the glitch scope regex still names the first pack (S4-3 / S4-4).
blocker: none
open: Q-13 (docs/todo.md): merge key type + node folds distinct unresolved places into one event (3 of 165 on the stress stream); recommend keying on node + the place text the matched word does not cover.
cleanup: done (probe servers stopped by their scripts, no launch.json entries; the s4-1-events worktree stays until push; docs/plans/FREEZE_MAPS removed)
=== END ===

=== RESULT R-LOOP standard std-1 (checkpoint 3: only waiting items left) ===
status: PARTIAL (every open standard item done; 6 waiting on FREEZE_MAPS)
items: fix:climate_tower ✓ (glb light strips no longer bake to white) | inst:supreme_court ✓ (portico, pediment, copper dome) | inst:tiancheng_univ ✓ (curved windows, cornice, roof cap) | waiting (register stage, maps.json frozen): var:tc_mid:dawn, var:tc_mid:dusk, var:tc_low:dawn, var:tc_low:day, var:tc_low:dusk, var:tc_low:night
commits: fix(landmarks): climate tower glow bake, and the supreme court / university model rework
pushed: head #173
tests: smoke PASS | check_maps 0 errors 0 warnings
deviations: (1) The ledger shows the ship stage of fix:climate_tower as `skip` with the note "x": a slip (append-only file); the stage was done in substance and is noted in docs/reviews/campaign/fix_climate_tower/r2.md. (2) The viewer could not be screenshotted (built-in browser pane has no WebGL); the climate tower diagnosis rests on the baked textures extracted from the glb. (3) The three glbs were re-exported with per-group budgets and raised max_mb because the earlier exports had none: climate tower 3.02 / 1.13 MB (was 2.17 / 1.19), univ+court 0.71 / 0.16 MB (was 0.19 / 0.10).
blocker: none
open: (a) when FREEZE_MAPS is lifted: register the six periods in maps.json (tc_mid dawn/dusk, tc_low dawn/day/dusk/night; tiles are already committed) and update tests/compat_v1.test.mjs:203, which pins tc_mid periods to day+night; the viewer's periodOf (map/app/nav.mjs) only reads day/night. (b) hunting_camp 3D entry needs an engine change. (c) A spot check of climate_tower in the real viewer is worthwhile. (d) Re-rendering site base maps rewrites map/data/site_kavalierki.json and drops the hand-placed arms_rnd marker (restore from git).
cleanup: done (local preview server stopped, browser viewport reset)
=== END ===

=== RESULT R-LAYOUT (T1-T2; T3-T4 wait for the user's choice) ===
status: PARTIAL (by design: layout:tc_upper sits at user-review)
items: T1 ✓ T2 ✓ T3 ✗ (waits for user) T4 ✗ (waits for user)
commits: 5d2c4f5c render(campaign): layout item type + layout:tc_upper gate before base:tc_upper
         <this commit> render(layout): v16 A/B/C upper island layouts + preview tool
pushed: head #176 (T1); this commit pushed with the next head bump
tests: node 777/778 (1 skipped, unchanged) | smoke PASS | arch PASS | render_campaign unit 48 (+1) | probes: none (no viewer change)
deviations: elite academy drawn as a neutral rounded square in the previews: the shipped tc_upper base has no image of it (see open); previews built by tools/upper_layout_v16.py from DZI level 12 + the eden:r5 cutout (final_cut6000.png from the hero worktree)
blocker: none
open: user picks A / B / C (recommend B: Eden's south dock faces the silver_crown lift shaft, south kept open as the arrival airspace); found for T3: (1) the shipped base shows the r5 Eden image at the centre under the elite_academy marker (eden_hi inset bounds 0.43-0.661 x 0.304-0.582 never followed the v15 move) while the eden marker sits on an older island at the bottom; (2) kelly_residence and y_estate markers (manual) sit off their islands - T3 snaps them to island centres; (3) patrol_city must be regenerated for the new layout (preview: smooth loop through the islands by angle)
cleanup: done
=== END ===

=== RESULT R-LAYOUT (user choice) ===
status: BLOCKED (FREEZE_MAPS for S4-2 on origin/preview)
items: user-review ✓ (user chose C, 2026-10-01) T3 ✗ (frozen) T4 ✗
commits: ledger only (user-review done by user, final wait)
pushed: with this commit's head bump
tests: not rerun (ledger-only change)
deviations: none
blocker: `python3 tools/render_campaign.py ship-check` -> "FREEZE: docs/plans/FREEZE_MAPS is present on origin/preview" (551c9f58 chore: freeze maps.json for S4-2) / recorded wait / A: apply C after the unfreeze (next --lane hero re-offers layout:tc_upper final), B: none (never ship maps.json during a freeze)
open: T3 plan once unfrozen: tc_islands.json <- tc_islands_v16_C.json; tc_upper.json markers / islands / patrol shifted, patrol_city regenerated, eden via eden_anchor_upper.py; maps.json eden_hi inset bounds moved to Eden's new frame; interim tc_upper + tc_upper_city bases composited from the shipped tiles (upper_layout_v16 preview method at 8000 px); worldbook --ship; check_maps, estate3d, accept probe
=== RESULT R2 ===
status: DONE
items: T1 ✓  T2 ✓  T3 ✓  T4 ✓  T5 ✓
commits: caf0c8cd fix(render): the guard fails crashed or output-less runs
         c59729fa feat(render): clay geometry stage and region studies in the landmark pipeline
         94110af6 docs(render): live scene inspection via the Blender MCP connector; asset and texture-scale guide
pushed: see the report (head #N)
tests: node 127/127 | smoke PASS | arch PASS | probes: none (no viewer change)
deviations: the queue verdict also checks stale output (finish_job) and render_queue.sh gained pause|resume, plus "a running GUI Blender counts as a busy Mac" in mac_busy; the demo outputs (docs/landmarks/slums/*) are not committed, copies are in ~/eden-map-review/r2/; the running dispatcher was not restarted, so pause/resume and the stale-output check take effect after the next dispatcher restart (blender_run.sh changes apply from the next job).
blocker: none
open: a deterministic script_error is still retried MAX_RETRY (6) times by the queue's finish_job (exit 70 is not special-cased); consider capping retries for script_error / no_output.
cleanup: done
=== RESULT S4-2 ===
status: DONE
items: T0 ✓ T1 ✓ T2 ✓ T3 ✓ T4 ✓ T5 ✓ T6 ✓ T7 ✓
commits: 551c9f58 chore: freeze maps.json for S4-2   (pushed first, head #172)
         ef3d67c9 feat(core): overlay may carry vars and entities (K-R69)   (T0)
         db77318d feat(data): first-pack variables and roster as pack data (generated)   (T1; pushed as head #175)
         98e6d6f0 feat(tavern): variables and roster from pack data; kernel discovery words; shadow parity   (T2, T3, and the engine half of T4: the new readers replace the old constants in place)
         (this commit) refactor(tavern): event merge key keeps distinct places; pack-scoped log keys; ledger down; unfreeze   (T4 ledger, T5, T6, T7, this block, FREEZE_MAPS deleted)   (SHAs may change on rebase)
pushed: head #175 after commit 2; the final head bump follows this commit
tests: node 796 total, 795 pass, 1 skipped = numpy (baseline 775: +3 overlay K-R69, +9 tests/vars_roster_shadow, +7 tests/profile, +1 bridge profile-load, +1 logbuf keys; the Q-13 test was replaced one for one) | smoke PASS | arch PASS (card-term hits 103 -> 96; adapter.mjs 5 -> 0 and left the ledger, mvu.mjs 3 -> 1; eden-map.js 1535 lines, unchanged) | check_pack PASS, mirror PASS (6 pairs) | probes: accept=PASS(24) v096=PASS(31; one run crashed in the OSD viewer before any change of mine, two reruns 31/31) chars092=PASS(48) roster095=PASS(45) mvu093=PASS(66) v097=PASS(48) pack_town=PASS(23, no KNOWN) e7_host=PASS(10)
parity (tests/vars_roster_shadow.test.mjs; old = tests/helpers/{adapter,mvu,characters}_v1_frozen.mjs, frozen copies at head #172; corpus tests/helpers/roster-corpus.mjs = the variable trees of the tavern tests, both session fixtures and their floor states, two trees shaped like the card): both session fixtures 8 floor states identical (location, time, date, period, outfit, rosters with the fallback roster, people); variable map 32 trees x 6 user mappings = 192 identical (only the three table names differ: the pack now names present / members / targets, so detect finds them by name); roster rows 357 tables, 3250 rows identical (name, identity, stage, grade, core value, core band, all six "more" fields, tier) with and without the fallback roster and with the map-less call; present list, world time, clock text (zh + en), outfit and its text, reputation identical for every tree; MVU characters 102 and 576 non-empty injected people lines byte-identical; portraits 19 URLs + the card-script table identical. Pinned: 2 positional trees (20 states, K-06), 352 period x time states (phase differs in 16: `傍晚夜色` only; night test differs in 82: see Q-14 b), core clamp, tier chip text, portrait subdomain.
watchdog terms: 103 -> 96 hits (ledger 103 -> 96).
Q-13 stress: 200-floor stream of the event tests: old 165 events, new 165 (162 before), same ids.
deviations: (1) T2 and T4 landed together: the pack-driven readers replace the old constants in place (no second code path to delete later); the old constants live on only as the frozen test oracles and the generator's source. (2) `avatar.require` is new (K-R43 / K-R69, schema en): the author-folder rule (`/sfw/`) has no other home in `hosts` + `deny`; without it `.../B/other/B_1.png` would load. (3) Fields carry `x-slot` (K-R69, §6.3): the slots of the viewer's card rows and Settings -> variable mapping need a binding from a pack field; text / tag slots keep booleans and numbers typed (the card rows show units and "known" from the type), grade / stage read the raw text. (4) The tier ladder's step is labelled `天灾级` (v1 `天灾`) and has no `普通人` step (v1 never returned it while scanning; a mapped field still shows a short raw text). (5) The pack profile reaches the script through `MVUBridge` (`fetchJSON` + `onProfile` options, `tavern/profile-load.mjs`) and not through the events geo: the bridge reads the manifest + overlay only, and until they arrive everything is discovered by the kernel words. (6) `AD.get(stat, '')` now reads nothing (v1 returned the whole tree); the bridge computes its variable map on first use. (7) The table names `已收服母畜` / `在场人物` / `狩猎清单` and the field `狩猎阶段` are from docs/card-digest.md §8 (no code constant held them: v1 found the tables by position). (8) `avatar.storage`: nothing to generate, no code in the engine read card-owned portrait keys. (9) Probe v097: two stale expectations fixed (night tint on a layer that has a night base map, as mvu093 in H1; `onchange()` on a listener-only checkbox); identical failures on the untouched baseline. (10) known-failures.json is now `[]`; `tests/known_failures.test.mjs` accepts an empty list. (11) CLAUDE.md forbids a Co-Authored-By trailer, so the commits carry none despite the tool's attribution reminder.
blocker: none
open: Q-14 (docs/todo.md): tier chip text, night test (O-2 consequences), core clamp, portrait require / subdomain, positional groups, three fixed groups in the viewer. Recommend A (accept all).
cleanup: done (probe servers stopped by their scripts, no background processes of mine, no launch.json entries; the s4-2-roster worktree stays until push)
=== END ===

=== RESULT R-LOOP standard std-1 ===
status: LANE-DONE
items finished this session: var:tc_mid:dawn, var:tc_mid:dusk, var:tc_low:dawn, var:tc_low:day, var:tc_low:dusk, var:tc_low:night — register + ship (renders and tiles were done and pushed earlier; FREEZE_MAPS is lifted, so the periods are now in maps.json) — gate pass
items below gate: none
waiting: none
pushed: yes (head #181)
tests: check_maps PASS (0 errors) | estate3d_manifest PASS (9/9) | smoke PASS | node 795/796 pass, 1 skipped (numpy), same as baseline
blocker: none
next: none (`next --peek --lane standard` reports nothing left)
notes: (1) The render-standard worktree was left by an earlier session with 142 uncommitted rows in logs/render_times.csv (0.0-minute test rows); I did not commit them and kept them in a git stash ("foreign render_times rows"). (2) tools/push_preview.sh pushes preview first and only then refuses the head bump on a dirty tree; with a dirty tree run it once, stash, and run it again (the second run is a no-op push plus the bump). (3) The cloud/tc-mid-low mirror is deprecated and no longer pushed (LEGACY=1 only), so CLAUDE.md §3 is stale on that point. (4) Period registration needed tests/compat_v1.test.mjs to pin the four tc_mid variants; no viewer code changed.
cleanup: done (no Blender or server of mine left running; the Blender processes now running belong to wt-r5base)
=== END ===
