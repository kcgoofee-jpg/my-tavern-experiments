# Task S7-design: UI / UX refactor, settings IA — design + step specs

Record of the prompt given to the S7-design session on 2026-10-01 (Opus, documents only). The task text below is
verbatim; two scope additions sent by the orchestrator during the session follow it.

---

Read docs/agent-brief.md first (§3: decisions before 2026-09-30 are background only — overturn old UI decisions when a better design needs it, one line each). You design step S7 (full UI/UX refactor, taste-sensitive) of the Spatial OS refactor (repo eden-map, origin/preview head #238+). Documents only — no code. The user is not available: review-sheet recommendations become the working decisions. Save this task text as docs/plans/steps/S7-design.md in your commit.

Scope: docs/plans/spatial-os.md §5 S7; docs/ui-refactor-backlog.md (U1–U23); docs/todo.md I-05 (shared 3D context + legacy estate page), I-06 (3D camera settings), E-12 (phone edit bar over the drawer), N4 (settings IA + AI feature cards — read in full), N7 (rename user-facing 「地图领航员」 → 「AI 参谋」, internal ids unchanged, record in docs/naming.md; navigator output "suggested route" = new op in the restricted DSL map/tavern operation DSL, validated, session-scoped overlay like OP_CLUE / OP_MARKER, drawn through the S8-4 router — S8-4 is being designed in parallel in docs/transit-schema.md; reference its router API by name and keep the op spec independent; first-time consent moves into the feature card, no window.confirm). Plan items: glass tokens with day/night variants ("Dark Frost Glass"), the z-index ladder merged into map/ui/tokens.css, the host page and map/ui/* through tokens; clock capsule, top bar, layer popover, toolbar, drawer, settings on tokens; layers' applies() greying with a hint + rAF pause (S8 L-06: S8 owns applies data / registry.applicable; S7 greys rows and pauses animation); ⓘ / (i) / U21 click-through re-check.
Deliverables:
1. docs/settings-ia.md + .zh.md (N4): groups 常用 / 地图与图层 / 人物与物品 / AI 联动 / 数据与映射 / 更新与版本 / 高级 / 版权申明; every current setting mapped to its group (inventory from map/app/settings*.mjs, storage keys in map/core/storage.mjs); the AI feature cards (status injection, macros, dice checks, settlement records, spatial contract, worldbook JIT, fact crystallisation, navigator→AI 参谋): name + one-line purpose; switch + sub-options (status line: per-field toggles location / present / time / trips, own depth and budget; navigator: endpoint config + test connection); "what it does now" (exact text sent / data written, token estimate); health check (working / not effective + reason, last effective floor); "learn more"; list and fix contradictory hints (e.g. 「默认关 = 只提示不判定」 next to a switch that is on).
2. docs/ui-refactor.md + .zh.md: the visual system (tokens, glass day/night, z-scale, spacing/type scale), per-surface redesign (HUD, top bar, layer popover, toolbar, drawer, settings), mobile 375 px rules, accessibility (contrast, 44 px targets, reduced motion); review sheet at the top with items **U-01 …** (options, consequences, **Recommendation**); the U1–U23 backlog items each mapped to a U-item or a spec task.
3. docs/todo.md §3: one line per U-item `- [x] **U-0n** … → **Decided by default 2026-10-01 (autopilot): <option>; user may override.**` (append at the end of §3 only).
4. Register both doc pairs in tools/check_zh_mirror.py PAIRS.
5. Appendix "Executable specs" in docs/ui-refactor.md: S7-1 (settings IA + AI feature cards with sub-options and health checks + 「AI 参谋」 rename + suggested-route op + consent in the card) and S7-2 (visual / HUD refactor on tokens, applies greying + rAF pause, I-05, I-06, E-12, remaining U items), each in the section format of docs/plans/steps/S6-1.md; S7 changes in separate commits so each can be reverted alone; before/after screenshots (1440 + 375, dark + light) to ~/eden-map-review/overnight/s7/; only the step's own probes (CI covers node/smoke/browser-smoke); text parity rules (first pack text changes only where the IA moves or renames, listed); new toggles default off and registered; no blocking dialogs; new modules into docs/ARCHITECTURE.md (+ zh) in the same commit. S7-1 must run after S8-4a lands (router API) — say so. Executors are Sonnet with no other context.
Process: worktree under /private/tmp/claude-501/-Users-davidzhao-dev1-cctest1-eden-map/594c4795-e4d0-4aa7-8e0e-9c3e8d248163/scratchpad/ (e.g. .../s7d) from origin/preview; do not touch the main checkout. You may take screenshots of the current UI for the design (tools/browser/lib.mjs helpers; keep them outside the repo in ~/eden-map-review/overnight/s7/before-design/). Parallel: the S8-4 designer (docs/transit-schema.md, kernel-schema K-R ids — you take none unless needed; if needed, take ids starting at K-R130) and an S9b-2 executor — on rebase conflicts in shared docs keep both sides. Verify `bash tools/smoke.sh`. One commit `docs(design): S7 settings IA, UI refactor; review sheet U-01…; S7-1/2 specs` via -F, `git -c user.email=kcgoofee-jpg@users.noreply.github.com commit`, no Co-Authored-By trailer, one git command per Bash call; push `bash tools/push_preview.sh --head --no-escalate` (never force). Append a RESULT block (docs/agent-brief.md §5) to docs/plans/spatial-os-log.md with extra lines `sheet: …`, `specs: …`. `cat`/`ls` are broken aliases. Final message: RESULT + U-item list one line each.

---

Scope additions sent by the orchestrator during the session (2026-10-01):

1. Review protocol (user requirement): the UI/UX refactor is reviewed in several rounds by sub-agents with different
   personas (first-time tavern user on a phone, long-session power user on Mac, card author / pack maker, accessibility
   reviewer, visual designer, performance reviewer): a "Review protocol" section in docs/ui-refactor.md (what each
   checks, the screenshot set, the pass rule) and review gates in the S7-1 and S7-2 specs (mockup / screenshot round
   before the main implementation commit, a round after it, fixes, a final round; screenshots to
   ~/eden-map-review/overnight/s7/<round>/; the executor stops at each gate). The performance persona notes I-29 (reload
   stutter; a separate step investigates it; S7 must not make it worse).
2. docs/todo.md N9 (estate 3D viewer legend cleanup) goes into the S7-2 spec as its own task and its own commit, with
   the user's caution: deletions only after proving no other consumer, every removed item and its replacement listed in
   the RESULT, room count and notes unchanged except the four kind changes, before / after screenshots of the section
   view and a room card.
3. docs/todo.md N10 "S7 items" (1)–(14) and the gate extension (UI text such as 「（卡 」 / 「原卡」 / 「不描述」 / 「未定」;
   extend tools/check_no_labels.py): each item mapped into S7-1 (settings items 11, 12, 13's descriptions) or S7-2
   (layout / overlap / 3D items, greying 13) with acceptance checks at 375 px and 1440 px; item 1 (uses for kind `open`)
   is a data task through blender/estate2/floorplans.py like N9. The N10 P0 part is fixed by a separate executor.
4. N10 items 15–17 (roster rows: the 「· 设定」 suffix with the gate, empty badge row, avatar ring colours as a U-item).
5. docs/todo.md N11 → new plan step S7-3 after S7-2 (one shell for 2D and 3D, presence in 3D, one card system, one
   token set, building data as pack data, occluded labels hidden): an S7-3 spec in the appendix with its own review
   gates, coordinated with N9 and N10 items 1, 2, 4 (each assigned to exactly one of S7-2 / S7-3), and U-items for the
   real decisions.

