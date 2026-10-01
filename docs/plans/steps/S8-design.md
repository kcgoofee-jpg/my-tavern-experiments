# Task S8-design: declarative layers — design + step specs

Record of the prompt given to the S8-design session on 2026-10-01 (Opus · High, documents only). The task text below is
verbatim.

---

Read docs/agent-brief.md first. You are the designer for plan step S8 (declarative layers) of the Spatial OS refactor (repo eden-map; origin/preview head #207+). Documents only — no code. The user is not available: your review-sheet recommendations become the working decisions.

Task (also save this task text verbatim as docs/plans/steps/S8-design.md in your commit, as the record):
Design S8 per docs/plans/spatial-os.md §5 S8 and §16 (E-03 → S8, I-04 overlay events → S8) and docs/todo.md Q-01:
- declarative layers on the kernel §9 reserved shape (docs/kernel-schema.md §9; 10 slots), types point / area / line / label / tint / particles / path-motion; sources: data file / events / people / items (the S6 unified stash, docs/entity-protocol.md) / routine / MVU read-only; `applies` (when a layer is applicable, by view kind / node / time; S7 will grey inapplicable layers and pause rAF); the layer menu; the legend (overlay `ui.legend`, K-R70);
- the first pack's existing layers (grep the layer host: `LayerHostApi`, map/app layers, weather / traffic / vision / quests / clouds / depth haze / fog / stash markers) moved onto it with identical output;
- local extension `EdenMap.addLayer()` (window.EdenMap is an external contract; add the method, do not rename);
- I-04: navigator overlay events (OP_CLUE / OP_MARKER from map/tavern operation DSL) shown as a real layer;
- E-03: a local prop-pack interface (user-local 3D props / icons, never uploaded);
- Q-01: ambience as a pack-declared layer, reusing the 3 new files of branch rescue/ambience-part4-4 (`git show --stat origin/rescue/ambience-part4-4` or the local branch; read them);
- acceptance: the town pack adds "patrol route" and "danger zone" with data only (new probe pack_layers).
Deliverables:
1. docs/layers-schema.md + docs/layers-schema.zh.md (same headings; tools/check_zh_mirror.py must pass — add the pair to its PAIRS if the gate requires registration): contract, K-R numbers continuing after K-R78 (check docs/kernel-schema.md for the highest used id and reserve a block; add a short "planned in S8" list to kernel-schema en + zh §13 like S6 did), review sheet at the top with items **L-01 …** (options, consequences, **Recommendation**).
2. docs/todo.md §3: one line per L-item `- [x] **L-0n** <one line> → **Decided by default 2026-10-01 (autopilot): <option>; user may override.**`
3. An appendix "Executable specs" in docs/layers-schema.md (English only is fine for the appendix in the en file; the zh edition may summarise it) with S8-1, S8-2, S8-3, each in the section format of docs/plans/steps/S6-1.md (Why, Read first, Scope IN/OUT, Setup, Tasks T1…, Constraints, Tests, Verify, Commits & push, Stop rules, Report) with files, functions, before → after, assertions, the probes to run (only the step's own probes; CI covers node/smoke/browser-smoke), parity rule (agent brief §3: first pack output identical; additions only pinned + Q-item). FREEZE_MAPS only around a commit that edits map data. Each spec ≤ ~6 h of work. Executors are Sonnet with no other context.
Constraints: generic engine (no first-pack words in contracts; examples from town); no provenance wording; no academic citations; build on recorded decisions (K-*, Q-*, P-*, naming Decisions).
Process: worktree `git worktree add -b s8-design <scratchpad>/s8-design origin/preview` under /private/tmp/claude-501/-Users-davidzhao-dev1-cctest1-eden-map/594c4795-e4d0-4aa7-8e0e-9c3e8d248163/scratchpad/. Another designer (S9) works in parallel and also appends to docs/todo.md §3 and kernel-schema §13: on a rebase conflict keep both sides. Verify with `bash tools/smoke.sh` (gates) only. One commit `docs(design): S8 declarative layers; review sheet L-01…; S8-1…3 specs` via -F file, `git -c user.email=kcgoofee-jpg@users.noreply.github.com commit`, no Co-Authored-By trailer, one git command per Bash call; push `bash tools/push_preview.sh --head --no-escalate` (never force). Append a RESULT block (format in docs/agent-brief.md §5) to docs/plans/spatial-os-log.md in the commit with extra lines `sheet: L-01…L-nn (recommendation per item)`, `specs: S8-1 …, S8-2 …, S8-3 …`, `new K-R ids: …`. `cat`/`ls` are broken aliases (use `command cat`, `/bin/ls`, Read/Write). Do not touch the main checkout /Users/davidzhao/dev1/cctest1/eden-map. Final message: RESULT block + L-item list one line each.
