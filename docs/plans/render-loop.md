# Render campaign worker (R-LOOP) — the prompt, kept in the repo

> The operator starts a session with three lines: `LANE=standard|hero`, `AGENT=std-1|hero-1`, and
> "Read docs/plans/render-loop.md and follow it." Everything else is here, so the prompt can change without re-pasting.
> Recommended: standard lane → any capable coding model, high effort; hero lane → the strongest model available, high effort.
> English only (agent prompt; see docs/language-policy.md).

## 0. What this is

The render campaign renders every place and base map to final quality on the local Mac only. All state lives in the
repo: items in `docs/plans/render-campaign.items.json`, progress as append-only events in
`docs/plans/render-campaign-events.csv`, driven by `tools/render_campaign.py`. You loop: next → do the stage →
record → next, **until the lane is finished**. The user does not review renders (decision 2026-09-30), with one
exception: the user-review stage of the user's own estate, `eden:r5` (§4; `isle:eden` was declined 2026-09-30). This file must work for any coding agent: it assumes only a
shell, file editing and the ability to look at images.

## 1. Read first (once per session)

`docs/agent-brief.md` (all), `docs/cloud-render.md` (last two sections: Mac-only mode, campaign ledger),
`docs/landmark-pipeline.md`, `python3 tools/landmark.py --help`, `python3 tools/render_campaign.py --help`,
`docs/card-digest.md` and `docs/card-buildings.md` (facts about places — search, don't read end to end), and the last
two `RESULT R-LOOP` blocks in `docs/plans/spatial-os-log.md` (their notes are lessons learned).

## 2. Setup (once per session)

- `git fetch`. If `git worktree list` shows a worktree on branch `render-$LANE`, cd into it and
  `git rebase origin/preview` (stop and report on conflict). Otherwise:
  `git worktree add -B render-$LANE ~/eden-render/wt-$LANE origin/preview`.
- Local caches: a fresh worktree lacks the git-ignored inputs (`blender/data/props`, `landmarks`, `estate2`,
  `osm/raw`, `real3d/raw`, `world/out`, `*.f32`, `*.i16`). For each one the main checkout has and yours lacks,
  symlink it from the main checkout (`ln -s <main>/blender/data/<dir> blender/data/<dir>`). Without them builds
  crash on missing textures.
- Check: `bash tools/render_queue.sh status` shows "mode: Mac-only" and an alive dispatcher; free disk ≥ 20 GB.
- Resume: `python3 tools/render_campaign.py status` — if an item is still claimed by $AGENT, continue it first.

## 3. The loop

repeat:
1. `python3 tools/render_campaign.py next --lane $LANE --agent $AGENT`
   exit 3 → lane finished: final report (§7), stop. exit 4 → only waiting / blocked items left: report, stop.
2. Do exactly the printed stage for the printed item (§4).
3. Record it: `python3 tools/render_campaign.py done <id> <stage> --agent $AGENT [--gate pass|fail] --note "<short>"`
   (`fail` with the error in `--note` when the stage failed; `wait` when blocked by the freeze or a missing input —
   `wait` keeps the item at the same stage, so `next` may offer it again: never resubmit a job that is still queued).
4. After every finished item (its last stage done): commit + push (§5), copy its images to
   `~/eden-map-review/render/<id with : replaced by _>/` (archive only), run
   `python3 tools/render_campaign.py status --md` and include the regenerated `docs/plans/render-campaign.md`.

**Do not stop for context length.** Keep looping. If your environment compacts or summarises the conversation,
re-read this file's §3–§6 and `python3 tools/render_campaign.py status`, then continue — the ledger is the memory.
Only if your tool cannot continue at all: finish and record the current stage, commit/push what is complete, print
the report (§7) and stop; the operator restarts you with the same three lines.

While a render job runs (minutes to hours), do the non-render stages of the NEXT item in parallel (setting, build
scripts), then come back. Check jobs with `bash tools/render_queue.sh status` and the job log; use your environment's
background / notification facility if it has one, otherwise check every few minutes — never a tight loop. The Mac GPU
is shared by both lanes through the queue; never call `blender_run.sh` or cloud scripts directly.

**Verify every render yourself**: the render guard has reported `status=ok` for a run that died with a Python
traceback. After each job, check its log for `Traceback` / `Error` and that the output file is new (mtime after the
job start) before judging it. If the guard misreports, note it in the item's `--note`; do not fix the guard here.

## 4. Stage rules

**landmark / scene** (`tools/landmark.py` stages keep their own args; landmark id = item `hints.landmark`):
- `new` → `python3 tools/landmark.py new <lm>`
- `setting` → write the setting block in `docs/landmarks/<lm>.checklist.md`: every visible feature; card facts cite
  their `docs/card-digest.md` line. Invent richly within the card's setting; never contradict a card fact; card names
  verbatim. **No provenance labels anywhere** (agent-brief §7): never write 「地图自设」「仓库推断」「自设」「推断」; if a
  tool template still has such a column, leave it empty. Scene items: one coherent scene containing every target
  marker; each marker becomes a hotspot.
- `draft` / `board` / `gapcheck` → the landmark.py commands `next` prints (Mac, 16 spp).
- `review-r1` / `review-r2` → YOU judge the renders (open the images). Write `docs/reviews/campaign/<id>/r<N>.md`
  (English): two scores 0–10 — fidelity (to card facts, or to the setting block for inferred items) and
  architectural credibility — plus the concrete defects. Gate: fidelity ≥ 7 AND credibility ≥ 6 → `--gate pass`,
  else `fail`. After a failed r1, `fix` = change the build script to address every listed defect, re-draft, then
  review-r2. A failed r2 does not block (flagged below-gate); continue.
- `final` → `python3 tools/landmark.py final <lm>` (queue, Mac-only; 2400 px / 64 spp unless the item spec differs).
- `ship` → first `python3 tools/render_campaign.py ship-check`; exit 3 = frozen → record `wait`, move on. Then
  `python3 tools/landmark.py ship <lm>`, rebuild the worldbook add-on in the same change
  (`python3 tools/build_worldbook_addon.py`), update the item's row in `docs/card-buildings.md`
  (model + quality "标准（campaign rN f/c）"), run `python3 tools/check_maps.py` and
  `node --test tests/estate3d_manifest.test.mjs`.

**review** items: review-r1 on the existing renders / glb previews (render fresh previews with `landmark.py board` if
none exist); fix / review-r2 as above; ship only if something changed (re-export + manifest), else `skip` with a note.
`review:holy_mountain`: its source is `blender/world/yuanyu_holy_mount.py` (not landmark.py) — render previews with
that script through the queue, fix there, re-export like the existing `map/props/holy_mountain` assets.

**basemap**: `audit` → compare the item spec with the last matching row in `logs/render_times.csv` and the DZI size
(`map/art/<name>.dzi`); if already at spec, `skip` render and tiles with the evidence in `--note`. `render` → submit
the command `next` prints (full PNG to `logs/campaign/full/`, git-ignored). `tiles` →
`python3 tools/make_dzi.py <full.png> map/art/<name> --extent-m <w> <h> --verify` (extent from maps.json
`view.extent_m`). `verify` → open a mid-zoom crop and the whole image; check_maps passes. `ship` → ship-check, commit
tiles, push. For `base:tc_upper`: repeat the island paste for every cutout id in `tc_islands.json` (see the hero
lane's RESULT notes: body-only crop re-render + `tools/isles_into_upper.py`).

**variant** (periods): `render` → if the generator lacks the period (`tiancheng_mid.py` / `tiancheng_low.py` have
only day and night), first add a dawn/dusk lighting mode modelled on `tiancheng_upper.py`'s `--tod` (GPU via
`tc_common.setup_render_device`), then render. `register` → add the period to that map's `periods` in
`map/data/maps.json` (keys dawn/day/dusk/night only) after ship-check passes. `var:tc_upper:16k` → render 16000 px,
cut a new pyramid, replace tc_upper's base only if `node tools/browser/accept.mjs` still passes (tier caps must keep
low-memory devices on lower levels); otherwise keep the 8K base and record `wait` with the reason.

**island** (hero): setting from `docs/upper-setting.md` and `docs/upper-islands-checklist.md`; the old
`archive/upper-v18` tag is reference only (read, never merge). Build in `blender/islands/<id>.py` with `_kit.py`;
draft/board through the queue; review as above; final; `integrate` = `python3 tools/isles_into_upper.py`; ship.
isle4 / isle5 also carry the victor_estate / y_estate markers: model the estate on the island, give the marker a hotspot.

**`eden:r5` — the user's own estate, continued from the shipped estate2 version (the only item the user reviews):**
- Baseline = the shipped estate2 r4e scene (`blender/estate2/*`; site.glb ebdce14, cover 172cfbd, upper-map Eden via
  `map_cutout.py` → `tools/eden_into_upper.py`). Never `blender/islands/eden.py`, `blender/eden_manor.py` or
  `blender/estate/*`; no re-layout. Requirements and their status: `docs/eden-requirements.md` (EQ ids).
- Renders: `blender/estate2/style_frame.py --view whole|map|arrival|lake` through the queue, with
  `E2_DAIRY_BLEND` set inside the `--python-expr` (the dairy .blend comes from `blender/props/dairy_parlour/build.py --blend`).
- `user-review` is never offered to you: before/after pairs + `changes.zh.txt` go to `~/eden-map-review/render/eden_r5/`.
- `final` (after approval): 3200 px / 128 spp whole view → cover `eden_1600.jpg` / `eden_800.jpg`; map view →
  `map_cutout.py` → `tools/eden_into_upper.py` (+ `tools/eden_anchor_upper.py`); site.glb / site_low.glb per
  `map/estate/NOTES.md` (size ≤ shipped + 15 %, else stop and report), `web_zones.py` → zones.json, manifest v bump;
  `node --test tests/estate3d_manifest.test.mjs`, `node tools/browser/accept.mjs`. A send-back → `fix` with the user's notes.

**`isle:eden` — declined by the user 2026-09-30 (kept for history; its later stages are skipped):**
- Before modelling: a real-world reference board (neoclassical white-stone manor, front fountain court, rear lake,
  visitor landing platform, estate-wide barrier — card facts in maps.json `tc_upper` marker `eden` `src`), saved to
  `docs/reviews/campaign/isle_eden/refs.jpg`.
- Sources: `blender/eden_manor.py` (manor, `--view island,ext,all`), island body with `blender/islands/_kit.py`;
  estate renders need `--allow-unmatched 1` and `--no-export` (keeps `eden_estate_tiles.json` untouched).
- Outputs: the upper-map cutout (island id `eden`), cover `map/art/covers/eden_1600.jpg` + `eden_800.jpg`, the estate
  island inset. Spec 3200 px / 128 spp.
- `user-review` is never offered to you. When review-r1 (or r2) is recorded, put in `~/eden-map-review/render/isle_eden/`:
  `refs.jpg`, `setting.zh.txt` (Chinese, ≤ 15 lines: what the island shows, no provenance labels), and four 64 spp preview
  angles (`preview_1..4.png`: aerial ¾, front court, rear lake, underside). Then move on to other items.
- If the user sends it back, `next` offers `fix` again: the user's notes are in the latest ledger event note for
  `isle:eden` and in `docs/reviews/campaign/isle_eden/user-<n>.md`; address every point, re-draft, review-r2, and
  refresh the four previews.

**estate**: `estate:final` / `verify` / `ship` per the item hints. `estate:b1b2` → the shipped house sources
(`blender/estate2/house_web.py`, `floorplans.py`, `medical_b2.py`, `medical_web.py`); not the legacy `blender/eden_manor.py`.

## 5. Git

- One commit per finished item (plus a separate commit for any generator / script change). English messages, e.g.
  `render(campaign): lm:blood_mill final + ship (r1 7.5/7)`. No Co-Authored-By trailer.
- Push after every shipped item: `bash tools/push_preview.sh --head` (no `--no-escalate`: art / glb changes need the
  full CDN warm-up). The script rebases and retries; a rebase conflict stops it — report, never force-push.
- Never commit full-size PNGs or `.blend` files. `python3 tools/check_tree_hygiene.py` must pass before each commit.

## 6. Stop and report (instead of continuing) when

the queue or dispatcher is broken; the render guard aborts for lack of GPU; disk < 20 GB; a push conflict; the same
stage failed twice in a row for reasons you cannot explain; anything would require editing product code under `map/`
other than maps.json registration, `estate/model/manifest.json` and props manifests.

## 7. Report (every time you stop)

Append to `docs/plans/spatial-os-log.md`, commit, push, and print:

```
=== RESULT R-LOOP <LANE> <AGENT> ===
status: LANE-DONE | PAUSED (tool limit) | BLOCKED
items finished this session: <id — stages — gate scores>
items below gate: <id> | none
waiting: <id — reason> | none
pushed: yes (head #N) | no
tests: check_maps PASS/FAIL | estate3d_manifest PASS/FAIL | smoke PASS/FAIL (run smoke once before stopping)
blocker: none | <verbatim error, first 20 lines> / <tried> / <options>
next: <the id `next --peek` would give>
notes: <lessons for the next session>
cleanup: done (no Blender or server of yours left running)
=== END ===
```
