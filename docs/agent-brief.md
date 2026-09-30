# Agent brief — Eden Map → Spatial OS (read this first, grep the rest)

> Rules only. No status lives in this file: current state is in `docs/todo.md` §0 and the execution log
> `docs/plans/spatial-os-log.md`; the last session's handoff is `docs/handoff.md`.
> Chinese edition: `docs/agent-brief.zh.md` (this English file is canonical).

## 1. What this repo is, and what to read

- A map layer for SillyTavern / TavernHelper chats, being refactored (2026-09-30) from a single-card tool into a
  generic **Spatial OS**: a card-agnostic engine plus data **packs**. The first pack is `eden`; `town` is the
  fictional example pack.
- Plan of record: `docs/plans/spatial-os.md` (Chinese edition `.zh.md`). Work proceeds one prompt at a time, by
  step id (S0, S1, …).
- Read order: this file → `docs/ARCHITECTURE.md` (module map, data flow, entity protocol; created in S0.2 — until
  then see the module map in `docs/archive/agent-brief-2026-09-30.md`) → `docs/naming.md` (glossary, after S0.4)
  → `docs/todo.md` → only then grep further.

## 2. Engine rules (Spatial OS)

1. **Zero business terms in the engine.** `map/core`, `map/app`, `map/tavern`, `map/ui`, `map/three`,
   `map/*.mjs`, `map/viewer.html`, `map/props/viewer3d.html` and the core i18n dictionaries carry no card-specific
   names, places, statuses or ranks. Card names live verbatim only in pack data (`map/packs/**`, `map/data/**`) and
   builder-side tools (`tools/**`). UI wording is neutral for every pack, eden included; a pack may override text
   through its manifest `strings`.
2. **Ratchet ledger.** File length ≤ 400 lines, no bare z-index (tokens only), no inline appearance styles, no card
   terms. Existing offenders are recorded in `tools/arch_baseline.json` and may only shrink; anything new that
   violates fails `tools/check_architecture.py` (runs in smoke).
3. **One-way data flow.** MVUBridge (`map/tavern/mvu-bridge.mjs`, the only module allowed to touch the `Mvu` /
   `SillyTavern` globals) → ContextPipeline (`map/tavern/context.mjs`) → ledger (`map/core/ledger.mjs`) → protocol
   (`map/core/protocol.mjs`) → viewer. The viewer sends intents up; it never writes host state.
4. **The chat log is the only truth.** Everything the map shows must be recomputable from the chat floors; caches
   (keyframes, stash) are droppable and a recompute must match item for item. Never invent state without an
   explicit physical action in the text.
5. **Never write the card's `stat_data`** (its MVU schema rejects unknown keys) and never touch the user's own
   worldbooks — only our add-on book and entries carrying our `extra.eden_id` marker. The map's own state lives in
   the pack's chat variable (`eden_map` for eden).
6. **Silent self-heal, no blocking dialogs.** Missing dependencies degrade quietly; never show "go set X in the
   backend" blockers. New toggles default to off and are registered: storage key in `map/core/storage.mjs`,
   protocol field in `map/core/protocol.mjs` SCHEMA, zh + en strings.
7. **No academic citations in source.** `map/**` and `tests/**` describe mechanisms only (no paper names, venues,
   arXiv / DOI); references live in `docs/plans/llm-campaign.md` §10. Enforced by `check_citations` in the watchdog.
8. **Never moderate chat content.** Parse and place user content as-is; unknown types fall back to a neutral
   "other".

## 3. Workflow

- **One prompt = one unit of work.** Do exactly the prompt's IN list and nothing from its OUT list, then stop.
  Never continue to the next plan step on your own.
- **Worktree, never the main checkout:** `git fetch`, then
  `git worktree add -b <name> <scratchpad>/<dir> origin/preview`. The main working tree may hold another line's
  uncommitted work — do not touch it. Never reset to a stale origin ref.
- **git hygiene:** one git command per Bash call (no `&&` chains, no `$(git …)` nesting, no pipes); run one command
  to get a value, then use it. Write commit messages to a file and pass them with `-F`.
- **Commit:** `git -c user.email=kcgoofee-jpg@users.noreply.github.com commit -F <msgfile>`; English messages;
  **no `Co-Authored-By` trailer**.
- **Push in batches** (every 2–3 items, usually once per prompt): `bash tools/push_preview.sh --head --no-escalate`
  — fetch + rebase, bump `map/data/head.json` ("head #N"), push `preview` together with its compatibility mirror
  `cloud/tc-mid-low` (never only one of them), then a detached incremental CDN warm-up (`logs/warm_cdn.log`; do
  not wait for it). `--full` forces a full warm-up; `WARM=0` skips it. If the push is rejected: stop and report;
  never force-push.
- **CI:** a push runs node --test + smoke; check with `gh run list --branch preview -L 1`.
- **Branches:** `preview` is the integration / follow line; `main` is the release line with the same content,
  synced by fast-forward (`bash tools/sync_main.sh`, `DRY_RUN=1` to preview). No tags, releases or version bumps
  during the Spatial OS refactor (only head #N). See `docs/branching.md` and `docs/versioning.md`.
- **Append-only files:** `CHANGELOG.md`, `logs/*.csv` and `docs/plans/spatial-os-log.md` use union merge — append
  at the end only.
- **Deliverables:** only the external TavernHelper script and the worldbook add-on. Never generate or modify a
  character card; never write the user's tavern data directories.
- **Cleanup before handing back:** stop preview servers, background processes and Blender runs you started (your
  own PIDs only); leave no long-lived entries in `.claude/launch.json`.

## 4. Tests

- Always: `node --test tests/*.test.mjs` and `bash tools/smoke.sh` (includes check_maps, check_pack, the
  architecture watchdog and the doc-language gate).
- Browser probes (`tools/browser/*.mjs`): run the ones relevant to your change; full sweep only at the end of a stage.
- The test count must never drop without an explanation in the report.
- Desktop first; check 375 px once; no iPhone-specific work (fix on reports).

## 5. Reporting and documents

- **End of every prompt:** print the RESULT block below and append the same block to
  `docs/plans/spatial-os-log.md` (commit it with your last commit):

  ```
  === RESULT S<id> ===
  status: DONE | PARTIAL | BLOCKED
  items: <each prompt item id> ✓/✗
  commits: <sha> <subject>   (one per line)
  pushed: head #<N> | not pushed
  tests: node <pass>/<total> | smoke PASS/FAIL | arch PASS/FAIL | probes: <name>=PASS/FAIL …
  deviations: none | <what differs from the prompt and why>
  blocker: none | <verbatim error, first 20 lines> / <what you tried> / <options A, B>
  open: none | <questions that need a decision>
  cleanup: done
  === END ===
  ```

  When blocked, stop with `status: BLOCKED` — do not guess your way forward.
- **Language:** new documents in `docs/` are English, with a Chinese edition in `*.zh.md`; pre-policy documents are
  grandfathered, never bulk-translated. Code comments and tool output follow the file's existing language. Gate:
  `tools/check_doc_language.py`; en/zh structure gate: `tools/check_zh_mirror.py`; policy: `docs/language-policy.md`.
- **Checklist-style documents:** one item per line; finished items are struck through in place
  (`~~…~~ ✅ <date> <sha>`), never deleted; one status line at the top.
- Images meant for the user are copied to `~/eden-map-review/` (archive only; never blocks the flow).

## 6. Render line

- Submit every render through the queue: `tools/render_queue.sh submit <draft|final|any> -- <args>`. Never call
  `tools/blender_run.sh` or `tools/cloud/render.sh` directly — the queue arbitrates Mac vs cloud and the GPU locks.
  Details: `docs/cloud-render.md`.
- **Mac first:** setting → draft (16 spp, ~2000 px) → self-check → 64 spp final preview on the Mac; the look is
  locked there. Never iterate on the cloud.
- **Cloud in batches:** only locked high-spec jobs (8K / 16K, 128–512 spp, split strips, time-of-day variants),
  released as one batch; the user starts the instance; `tools/cloud/idle_guard.sh --idle-shutdown 30` powers it
  down when idle.
- **Render guard:** new render scripts configure the GPU through `tc_common.setup_render_device()` (old name
  `pick_gpu`) and never set `compute_device_type` themselves; no GPU → abort unless `--allow-cpu` is passed to
  `blender_run.sh`. Changes under 25 % of an image use `tools/region_patch.py`.
- New landmarks go through `python3 tools/landmark.py new|draft|board|gapcheck|final|ship <id>`
  (`docs/landmark-pipeline.md`).
- While a code step that edits `maps.json` or pack manifests is in flight (S2, S3, S4-3), render-line sessions do
  not ship `maps.json` edits; rendering itself may continue.

## 7. Eden pack content rules (these move to the eden repo at the S10 split)

- Card names are copied verbatim into pack data (places, rooms, characters, MVU keys, worldbook triggers), adult
  wording included; no invented placeholder names. Map-invented content is tagged 「地图自设」 (`tag: "inf"`).
- Content boundary (user decision 2026-09-29): facilities, props and their uses are written, and may be modelled,
  as the card describes; room names are the card's own. The old "keep private rooms neutral / do not model"
  constraints are void (`docs/archive/README.md`).
- Only card-backed places get markers and models; invented places are parked as DLC. User-requested exceptions are
  recorded in `docs/eden-lore-space.md`.
- A changed map place updates the worldbook add-on in the same change (`tools/build_worldbook_addon.py`).
- The original author's credit (Yehehua) stays visible through the pack's credits; the first public post must link
  the author's original post.

## 8. Environment pitfalls

- `cat` / `ls` are broken aliases in this shell: use `command cat`, `/bin/ls`, or the Read / Write tools; a heredoc
  into `cat` writes an empty file.
- Node: build repo paths with `fileURLToPath(new URL(…, import.meta.url))`, never `.pathname` (non-ASCII paths get
  percent-encoded).
- Waiting for renders or long jobs: use Bash `run_in_background` and its completion notice; never write `sleep` /
  polling loops.

## 9. Where state lives (not here)

- Plan and step list: `docs/plans/spatial-os.md`; execution log: `docs/plans/spatial-os-log.md`.
- Open items: `docs/todo.md` (single index); last session: `docs/handoff.md`.
- Versions and releases: `docs/versioning.md`; branches: `docs/branching.md`; cloud: `docs/cloud-render.md`.
