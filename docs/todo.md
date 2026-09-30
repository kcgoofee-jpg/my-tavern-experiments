# Todo — the single tracker

Status: 2026-10-01 · S4-2 done (the first pack's variables, roster slots and portrait rules are pack data, K-R69; Q-13 decided; Q-14 open) · S4-1 done (event taxonomy is pack data, K-R68) · H1 done (new README en + zh, ROADMAP archived, leftover items scheduled into the plan §16, probe baseline, main synced) · S0-F done (provenance labels out of data, UI, tools and current docs; gate `tools/check_no_labels.py`) · S3 done: S3-3 done (people, trips, stand-ins, item places and the spatial contract on nodes; map/here.mjs deleted; Q-12 decided A) · S3-2 done (events placed through nodes on both sides; Q-11 decided A) · S3-1 done (the current location runs on nodes.locate) · S2-A, S2-B done (node tree in the viewer, dairy under the estate and reachable from its farm zone) · S0 done (S0-A…S0-E) · S1-design done, review accepted 2026-09-30 (Q-09) · S1-impl-1, S1-impl-2 done · render campaign R running · open: 9 infrastructure (all scheduled), 5 Eden content (E-04, E-07 closed), 0 decisions (Q-14 decided A) · migration table 81 rows, missing 0

1. This is the only work list; plan detail lives in `docs/plans/spatial-os.md`, results in `docs/plans/spatial-os-log.md`, render items in the ledger `docs/plans/render-campaign.md`. Do not copy their items here.
2. One item per line. A finished item is struck in place (`~~…~~ ✅ <date> <sha>`), never deleted; it moves to §4 only with a sha as evidence.
3. A new item takes the next free id (I-, E-, Q-) and must trace to a source line or a RESULT block.
4. Authority when documents disagree: `docs/agent-brief.md` → the plan → this file → `docs/handoff.md` (history).
5. English only, no zh edition (`docs/language-policy.md`); quotes of old items stay verbatim.

## 0. Spatial OS campaign

Line format: status · prompt id · where the RESULT block is (`docs/plans/spatial-os-log.md`). Model / effort / size follow plan §14.3.

- ~~**S0** Rules and watchdog first (S0.0–S0.6, run as S0-A…S0-F)~~ ✅ 2026-09-30
  - ~~**S0-A** plan of record into the repo + rules-only `docs/agent-brief.md`~~ ✅ 2026-09-30 `b853655` `0c7e602` · prompt S0-A · RESULT S0-A
  - ~~**S0-B** `docs/ARCHITECTURE.md` + widened architecture watchdog with the ratchet ledger~~ ✅ 2026-09-30 `ab627be` `13076de` `b70790f` · prompt S0-B · RESULT S0-B
  - ~~**S0-C** naming audit: `docs/naming.md` + glossary~~ ✅ 2026-09-30 `94b4182` `3038905` `ffd86c7` · prompt S0-C, S0-C-followup · RESULT S0-C, S0-C-followup
  - ~~**S0-D** rescue stranded worktree work, remove merged worktrees~~ ✅ 2026-09-30 `c7e7151` `e4f794c` · prompt S0-D · RESULT S0-D (PARTIAL at the time; `webgl-part3` rescued as `rescue/estate-bake-opt`, the worktrees are gone)
  - ~~**S0-E** this file: single tracker + one-to-one migration table~~ ✅ 2026-09-30 (this change; sha in its RESULT) · prompt S0-E · RESULT S0-E
  - ~~**S0-F** provenance labels removed: data text and fields, marker / room cards, setting and board templates, current docs; gate `tools/check_no_labels.py` in smoke~~ ✅ 2026-10-01 (shas in its RESULT) · prompt S0-F · RESULT S0-F
- [ ] **S1** Kernel contract v2 design + minimal pack (XL; Opus · Xhigh design, then Sonnet · High ×2) · in progress
  - ~~**S1-design** `docs/kernel-schema.md` (+ zh with the review sheet K-01…K-09), `map/data/schema/v2/`, `map/packs/minimal/`, check_pack schema-2 branch~~ ✅ 2026-09-30 (sha in its RESULT) · prompt S1-design · RESULT S1-design
  - ~~**S1-impl-1** `core/nodes.mjs` + `core/pack-v2.mjs` + `tests/kernel_minimal.test.mjs` (Sonnet · High, M; spec: kernel-schema appendix B.1)~~ ✅ 2026-09-30 `23ea9de` `314d16d` · prompt S1-impl-1 · RESULT S1-impl-1
  - ~~**S1-impl-2** `core/compat-v1.mjs` + `tests/compat_v1.test.mjs` (Sonnet · High, M; spec: kernel-schema appendix B.2)~~ ✅ 2026-09-30 `a21a031` `d0d12f0` · prompt S1-impl-2 · RESULT S1-impl-2
- [ ] **S2** Node tree lands + milking hall moves home (L, 2 prompts) · in progress (S2-A, S2-B done) · prompt S2 · RESULT S2 (pending)
  - ~~**S2-A** `map/app/nodes-runtime.mjs`: breadcrumb / up button / warm-up / estate stand-in / card links read the node tree; the dairy parlour is a `zone` node under `eden_estate` (`anchor.zone`); test entry and `test` field gone; `tools/maps_invariants.py`; worldbook `[TOPO]` prefix from the node chain~~ ✅ 2026-09-30 `5f5b51f` `a82223d` `fdd65a7` (+ the change that carries this line) · prompt S2-A · RESULT S2-A
  - ~~**S2-B** drill-down UI: a zone with a child node shows "Enter 3D" on its card and on double-click (`estate:children` / `estate:go`); back from the child focuses the anchoring zone; the layer strip reads the runtime tree (`levels()` via `strip()`); probe `tools/browser/topo_dairy.mjs`~~ ✅ 2026-09-30 (SHAs in RESULT S2-B) · prompt S2-B · RESULT S2-B
- ~~**S3** Unify geography: everything lands on nodes, parity-tested (L, 3 prompts)~~ ✅ 2026-10-01 (S3-1, S3-2, S3-3; shas in their RESULT blocks) · prompt S3 · RESULT S3-1, S3-2, S3-3
  - ~~**S3-1** the current location runs on `nodes.locate` (`map/app/here-v2.mjs` adapter, shadow parity `tests/here_v2_shadow.test.mjs`); `map/here.mjs` stays in place, unused by the viewer~~ ✅ 2026-09-30 `dbfb1c2` `5aa6945` · prompt S3-1 · RESULT S3-1
  - ~~**S3-2** events land on nodes: v2 overlay `map/packs/eden/overlay.v2.json` (K-R67), `core/event-geo.mjs`, both `tavern/events.mjs` and the viewer's `map/events.mjs` place through `nodes.locate`; LAYERS / LAYER_MAP / MAP_OF / RE_UP·MID·LOW·OUT·RING / ZONES / isRing gone from the engine~~ ✅ 2026-10-01 (shas in its RESULT) · prompt S3-2 · RESULT S3-2 (two blocks: PARTIAL at the parity gate, then DONE after Q-11)
  - ~~**S3-3** characters / trips / estate stand-ins / item places resolve through the node tree (`map/app/spot.mjs`, `drawnAt`), `tavern/spatial.mjs` builds its places with the node-tree engine (injected text unchanged for both session fixtures; 14 of 618 sweep words differ, Q-12), `map/here.mjs` and its recorder helpers deleted, the card script / `skills/card-map/check_here.mjs` / `tools/build_worldbook_addon.py` / `tools/check_maps.py` moved to `core/transit.mjs`, `core/legacy-custom.mjs`, `tools/pack_here.mjs`, `app/here-v2.mjs`~~ ✅ 2026-10-01 (shas in its RESULT) · prompt S3-3 · RESULT S3-3
- [ ] **S4** Special-case sweep + neutral wording (L, 4 prompts) · in progress (S4-1, S4-2 done) · prompt S4 · RESULT S4-1, S4-2 (S4-3, S4-4 pending)
  - ~~**S4-1** the first pack's event taxonomy is pack data (`overlay.v2.json` `events`, K-R68; generated by `tools/gen_eden_events_v2.mjs`); `fx` by declaration, `x-default-off`, merge key type + node (K-R54), neutral default taxonomy (`core/events-default.mjs`, K-R53); GROUPS / CATS / ALIAS_CAT / EXAMPLES / CLOSED / CFG.tag / LOOK removed from engine code~~ ✅ 2026-10-01 (shas in its RESULT) · prompt S4-1 · RESULT S4-1
  - ~~**S4-2** the first pack's variables and roster are pack data (`overlay.v2.json` `vars` + `entities`, K-R69; generated by `tools/gen_eden_vars_v2.mjs`); `core/profile.mjs` + `core/vocab.mjs` (kernel discovery words) + `core/periods.mjs` (K-R39); adapter / mvu / characters / context / trips / timeline / bridge / selfcheck read paths, tables, slot fields, period bands and portrait rules through the profile; DEFAULT_MAP, the field regexes, CORE_CUTS / CORE_NAMES, tierText, PORTRAIT_HOSTS / PORTRAIT_BAN and the /sfw/ rule, PRESENT_KEYS / POS_KEY / OUTFIT_KEYS and the default location path are gone from engine code; Q-13 merge key refined; logbuf keys follow the pack~~ ✅ 2026-10-01 (shas in its RESULT) · prompt S4-2 · RESULT S4-2
- [ ] **S5** File split + first rename batch (L, 3 prompts) · later · prompt S5 · RESULT S5 (pending)
- [ ] **Stage B** Real tavern test ① with the Eden card (I write the numbered checklist; feedback template in plan §13.4) · later · prompt none · RESULT (your reply)
- [ ] **S6** Entity protocol + drawer + items tab (L, 3 prompts) · later · prompt S6 · RESULT S6 (pending)
- [ ] **S7** Tactical HUD + layers greyed out by applicability (L, 2 prompts) · later · prompt S7 · RESULT S7 (pending)
- [ ] **S8** Declarative layers: authors add their own layers (XL; Opus · High design, then Sonnet · High ×3) · later · prompt S8 · RESULT S8 (pending)
- [ ] **S9** Zero-config safety net + unified script + runtime card adaptation (XL; Opus · Xhigh design, then Sonnet · High ×3) · later · prompt S9 · RESULT S9 (pending)
- [ ] **S9b** In-viewer editing + any image as base map (L, 2 prompts) · later · prompt S9b · RESULT S9b (pending)
- [ ] **Stage D** Real tavern test ②: Eden card + one other card · later · prompt none · RESULT (your reply)
- [ ] **S10** Second rename batch, Eden data into `map/packs/eden/`, repo split and slimming (stage E; re-confirm before starting) · later · prompt S10 · RESULT S10 (pending)
- [ ] **S11** Skill rewrite + `tools/card_to_pack.py` (stage E) · later · prompt S11 · RESULT S11 (pending)
- [ ] **S12** Translate code comments to English (optional) · later · prompt S12 · RESULT S12 (pending)
- [ ] **S13** Wrap-up: finalise ARCHITECTURE, CHANGELOG, todo, handoff, memory · later · prompt S13 · RESULT S13 (pending)
- ~~**H1** repo front door: README (en + zh) and its gate, ROADMAP archived, main synced, leftover I-/E- items scheduled (plan §15–§16, new step B0), probe baseline `tools/browser/known-failures.json`, two brief rules~~ ✅ 2026-10-01 (shas in RESULT H1) · prompt H1 · RESULT H1
- [~] **R** Render campaign (separate line, Eden pack content only) · running · prompts R0-A, R0-B done · ledger and status: `docs/plans/render-campaign.md` (the ledger is the truth; no per-item copy here) · RESULT R0-A, R0-B

## 1. Infrastructure

- [ ] **I-01** Real SillyTavern + TavernHelper browser test: `tools/browser/` has only the stub host; includes the live-host automation contract and CDN-fallback assertions (old Part 1-1/1-2) and an eyeball of the copyright page and roster reputation in a real tavern. Source: archive L75, L108, L60. → **B0** (quick real-tavern smoke, before S4-2; plan §5 and §16)
- [ ] **I-02** CI: `browser-smoke` in `.github/workflows/ci.yml` is still an `if: false` placeholder. Source: archive L99. → **S4-1** (after the probe baseline `tools/browser/known-failures.json`; plan §16)
- [ ] **I-03** Toolchain holes: the world-map render inputs (`elev.f32`, `height.f32`, `owner.i16`) cannot be reproduced, and `ship.sh --dry-run` has three holes (counts warm files only, preview JSON check depends on a glob hit, `--no-warm` warns nothing). Source: archive L102; `docs/reviews/takeover_095/toolchain.md` #13, #15. → world render inputs: ledger item `base:world`; the `ship.sh` dry-run holes: **S10** (plan §16)
- [ ] **I-04** LLM campaign tail (`docs/plans/llm-campaign.md`): browser probe `p9_worldbook`, navigator overlay events as a real layer (OP_CLUE / MARKER), polish of long English copy, host write paths for the npc and event domains. Source: archive L63. → overlay events **S8**, English copy **S4-4**, npc / event write paths **S6** (plan §16)
- [ ] **I-05** WebGL Part 3 leftovers: one persistent context across 3D navigations, the legacy estate page (`map/estate/main.js`) on the shared runtime, and shipping a KTX2-baked GLB (pipeline wired, inert). Source: archive L56–L58. → shared context and legacy estate page **S7**; KTX2 part closed, `estate:opt` skipped (plan §16)
- [ ] **I-06** 3D viewer camera settings: an auto-rotate switch in Settings, and whether wheel = pan should become zoom (wait for user feedback). Source: archive L96. → **S7** (plan §16)
- [ ] **I-07** Read-only window hooks with no writer (`__edenHostVersions`, `__edenHereText`, `__edenMvuSnapshotStatus`, `__composeTest`) and stale `.js` owner strings in `core/storage.mjs` KEYS (5 names, 8 keys). Source: RESULT S0-C open (f). → **S5** (plan §16)
- [ ] **I-08** English pickup scan (`core/pickup.mjs scan`) reports a spurious item "the" for "Mara picked up the Brass Key."; fix with a false-positive test in S6 (kernel-schema §14.2 O-1). Source: RESULT S1-design. → **Decided 2026-09-30: K-01 B, K-02 B, K-03 A, K-04 A, K-05 A, K-06 C, K-07 A, K-08 B, K-09 C (user accepted every recommendation).** → **S6** (plan §16)
- [ ] **I-09** Three places put pack data into markup or styles without the run-time pattern re-check of kernel-schema K-R64: the worldbook peek capsule string (`map/wbpeek.mjs` line 29, `T('wb.capsule')` from `ui.strings`), the event group colours (`map/events.mjs` lines 259–268, `style="--c:…"`), the 3D manifest's flow colour (`map/props/viewer3d.html`, `cvdColor(x.f.color)` in the flow list). Harmless while only shipped packs load; fix before S9 (kernel-schema §14.2 O-9). Source: RESULT S1-design (security review). → **S4-3** (plan §16)

## 2. Eden content

Only work that is not already a render-campaign item.

- [ ] **E-01** `docs/card-omissions.md` leftovers: A18/A20 generic names as layers, C2 security gradient, C8/C9 card and number resolution, B19 new event types (temporary control, registration check, rating review). Source: archive L83. → **S4-2** data + ledger (plan §16)
- [ ] **E-02** Climate tower material: white block on the tower top and pink strip on the podium (look at the image first), plus an optional info button. Source: archive L107. → new ledger item `fix:climate_tower` (standard lane)
- [ ] **E-03** Local prop-pack interface (user-supplied glb, local storage, click to place, technical validation only); the B1/B2 refinement itself is ledger item `estate:b1b2`. Source: archive L130. → **S8** (plan §16)
- [x] ~~**E-04** Eden manor cutaway isometric tile polygon export (`map/data/eden_estate_tiles.json`, only if the final form still uses tiles) and mid-layer shadow blur realism. Source: archive L135.~~ ✅ 2026-10-01 (sha in RESULT H1) — closed: the final form is glTF, so the tile polygon export is not needed (plan §16)
- [ ] **E-05** Place or register A28–A31 of `docs/card-omissions.md`. Source: archive L139. → **S4-2** data + ledger (plan §16)
- [ ] **E-06** P2 institution buildings in 3D that ROADMAP does not list as done (最高法院, 大学). Source: archive L133. → two new ledger items `inst:supreme_court`, `inst:tiancheng_univ` (standard lane; `docs/card-buildings.md` already lists both models as done, so the items check or fix them)
- [x] ~~**E-07** `rescue/estate-bake-opt` (20fbc74): uncommitted estate bake-export + relief work rescued from the webgl-part3 worktree; 1 known test failure (bake order); consumed by render-campaign item `estate:opt`. Source: RESULT S0-D, R0-A.~~ ✅ 2026-10-01 (sha in RESULT H1) — closed: `estate:opt` was skipped in the render ledger (plan §16)

## 3. Decisions for the user

- [x] **Q-01** `rescue/ambience-part4-4` (Part 4-4 ambience engine): merge, drop, or park? Options: A) merge the branch now; B) drop it; C) park until after S8, then redo it as a pack-declared ambience. **Recommendation: C.** Only `map/app/ambience.mjs`, `map/core/ambience.mjs`, `tests/ambience.test.mjs` and the wiring in `fb039ad` are new; its 9 other files are stale copies of files preview has since changed — drop those. Source: archive L115; RESULT S0-D open (b). → **Decided 2026-09-30: C (park until after S8; recommended default, user may override).**
- [x] **Q-02** Formal release / npm publish, and the v0.9.8 release that is on hold. Options: A) keep holding; B) release after the author agrees. **Recommendation: A** — plan §6 opens the `S2:0.1.0` series only after the refactor; each push bumps head #N only. Source: archive L238, L63. → **Decided 2026-09-30: A (keep holding).**
- [x] **Q-03** Content questions Q7 (does the B2 medical room read the card name at runtime), Q9 (round-table seat for 玛嘉烈·临光), Q10 (two worldbook add-on entries). Options: A) answer now; B) leave the current behaviour. **Recommendation: B** until Stage B shows a problem (Q8 is already answered by the 2026-09-29 content boundary). Source: archive L240. → **Decided 2026-09-30: B (keep current behaviour until Stage B).**
- [x] **Q-04** Start the 4 lower-layer places and prepare the DLC pair (将军官邸, 以太研究院)? Options: A) start after the standard-lane ledger items; B) keep paused. **Recommendation: B** — they are not in the render ledger and card-only scope applies. Source: archive L243, L131. → **Decided 2026-09-30: the four lower-layer card places are already ledger items lm:blood_mill / lm:freight_yard / lm:lower_bar / lm:slums (user chose scope "all", 2026-09-30); the DLC pair (将军官邸, 以太研究院) stays parked.**
- [x] **Q-05** Approve the upper-layer setting drafts: altitude table, §7 Q1–Q8, §10 v3 questions. Options: A) approve in one sitting; B) approve as each island is built. **Recommendation: B**, so each answer lands with the island it affects. Source: archive L245. → **Decided 2026-09-30: B (approve per island, during the hero lane).**
- [x] **Q-06** `archive/upper-v18` island scripts: redo on the new main line, or pick from the tag? Options: A) redo; B) pick the still-valid parts. **Recommendation: A**, consulting the tag only for reference boards — the tag diverges by 575 commits and the ledger already lists all eight islands as rebuilds. Source: archive L248, L120. → **Decided 2026-09-30: A (user decision 2026-09-30: redo on the main line, tag for reference only).**
- [x] **Q-07** How far to move the upper-layer depth haze (`map/data/upper_depth.json`): look at the two new 8K maps, then choose none, haze tweak only, or re-render. **Recommendation: haze tweak only, and decide it after S8** (depth haze becomes a declared layer). Source: archive L249. → **Decided 2026-09-30: haze tweak only, after S8.**
- [x] **Q-08** Local clean-up of ≈1.9 GB untracked artifacts (raw downloads, world output, 8K source PNGs) and the duplicated hdr / marble textures. Options: A) delete the re-downloadable raws now; B) leave everything until disk pressure. **Recommendation: B**, keep the renders in any case. Source: archive L187, L196. → **Decided 2026-09-30: B (leave until disk pressure).**

- [x] **Q-09** Kernel contract v2 review sheet: K-01…K-09 in `docs/kernel-schema.zh.md` §0 (unplaced events, broad place + room word, weak words for the current location, level-switcher shortcut, chat variable of new packs, zero-config roster groups, cities under realms, go-live of a foreign pack's model-facing text, pictures in card-embedded packs). Recommendation per item in the sheet; until answered the recommended options are the working assumption. Source: RESULT S1-design.

- [x] **Q-10** The estate's area word `客房楼` holds the room word `客房` one code point shorter. The kernel keeps the longest span (the estate); v1 placed the room (with the room plan: room `客房` on F2). A.9 #4 only covers the no-plan word difference. Options: A) accept the kernel result and record it as A.9 #6; B) make the kernel prefer the room in that tie (a K-R20 change that also moves event placement). **Recommendation: A** — only the exact area word is affected and the estate view is still the right place. Source: RESULT S3-1, `tests/here_v2_shadow.test.mjs` (wider sweep). **Decided 2026-09-30: A** — accepted as A.9 #6 in `docs/kernel-schema.md` (+ zh) (the pin in `tests/here_v2_shadow.test.mjs` stands).

- [x] **Q-11** S3-2 parity gate. Of the 309 distinct place texts that `tests/events.test.mjs` and the session fixtures feed in, 299 place identically through nodes and through the old regexes, 3 are K-01 B, and 7 differ outside K-01 B / A.9 (pinned in `tests/events_geo_shadow.test.mjs`): a) `奥伦帝国` and `某家族庄园` were left unplaced by v1 on purpose ("the capital is the city", "庄园 alone fixes no layer"); the tree holds both (realm node; `庄园` is an alias of the estate) so they now place on the world map / the upper tier; b) `灵枢秘派` (alias of a realm) is now pinned, v1 matched names only; c) `中层·A`, `中层·C`, `悬浮庄园区`, `中层修道院`: spot only, v1 took any marker whose name merely contains the text (K-R20 prefers the named node). Wider sweep (340 names / words): places inside a site that has its own map (knights' city, highland, holy city) are drawn on that map (v1: their world point), 154 names v1 never placed now place. Options: A) accept every class above, add them to A.9 as #7-#10 and continue with T3 (recommended: each is what the kernel rules say, and none loses an event); B) keep v1's exclusions for a) by data: needs a K-R67 extension that lets an overlay mute an alias (`mute`), then re-run the parity; C) also draw site-interior places on the world map at the site's point (parity for the wider sweep; contradicts K-R51 scope). Source: RESULT S3-2. **Decided 2026-10-01: A** — accepted as A.9 #7-#12 in `docs/kernel-schema.md` (+ zh).

- [x] **Q-12** S3-3 differences beyond the stop rule's two fixtures. a) `tavern/spatial.mjs`: of 618 names / aliases of the first pack, 604 give the same injected contract as before, 14 differ because the kernel places a text differently from v1 (`tests/spatial_nodes.test.mjs`, pinned by word and class): 10 English names / group names that v1 left unplaced in the contract (now placed, as the viewer places them), 2 words where a layer word is longer than the landmark word inside it (`Pantheon Tier`), 2 ties decided by depth / specificity (`旷野高地·下山小径`); the wording of a place (the six merged sites keep their short layer names) is unchanged. b) A realm (`奥伦帝国`, `光辉联邦`, …) in a character's place is drawn at its own point on the world map (v1 rules: the approximate spot of its district), as events already draw it. c) The reputation meter on place cards shows only on the estate's own stand-in landmark; before it showed on every landmark that links to a 3D page. Options: A) accept all three; B) restore v1 behaviour for (a) through an overlay hint (K-R67) or for (c) in `custom.mjs`. **Recommendation: A.** Source: RESULT S3-3. **Decided 2026-10-01: A** — all three accepted as they are (the 14 spatial words stay pinned in `tests/spatial_nodes.test.mjs`).
- [x] **Q-13** S4-1 merge key (K-R54, type + node): places that resolve to the same node within the merge window now merge into one event; on the synthetic stream of the event tests 3 of 165 events merge away (two unresolved streets under the tier node, one district alias pair), pinned in `tests/events_taxonomy_shadow.test.mjs`; the session fixtures are unchanged. Recommend: refine the key with the place text the matched word does not cover, so two unresolved streets stay two events. Also carried: glitch duration is `x-messages` (messages), not the kernel preset's `seconds`; `app/cvd.mjs` palettes are still keyed by the first pack's group names and the glitch scope regex still names the first pack (S4-3 / S4-4). **Decided 2026-10-01 (S4-2 T5): the recommendation** — merge key = type + node + the part of the place text the matched word does not cover (`restOf` in `tavern/events.mjs`; K-R54 in kernel-schema en + zh); the 200-floor stress stream gives the same 165 events as v1, same ids (`tests/events_taxonomy_shadow.test.mjs`). The other carried items stay: `app/cvd.mjs` palettes and the glitch scope regex (S4-3 / S4-4).
- [x] **Q-14** S4-2 differences beyond the stop rule (nothing differs for either session fixture or any roster / location / injected-line input of the tests: `tests/vars_roster_shadow.test.mjs`, 32 trees). a) The tier chip names its ladder step: `天灾级` (v1 showed `天灾`); a step's label is also a match word and a bare `天灾` would hit a codename that holds it. b) The night test follows the night band (O-2, already decided): with no period text 20:00–21:59 is night (was 22:00); evening texts (`侍寝时段`, `傍晚`, `黄昏`, `暮色`, `evening`) are no longer night by a bare `寝` / small hour; a text with words of two bands takes the longest word (`傍晚夜色`: dusk, was night). c) The core gauge clamps to 0..100 (K-R42; v1 showed 150 as 150). d) Portrait rules: the author folder needs `avatar.require` (a small extension of K-R43, in K-R69: `/sfw/` has no other home in `hosts` + `deny`); a subdomain of the image host is no longer taken (K-R43: the host must equal the entry). e) Zero-config groups (K-06 C): a tree whose first two keys are not the world / protagonist tables is no longer skipped by position (`tracked`, `items` in the corpus): its name-keyed tables with a place- or person-like field show as groups. f) The viewer still shows the three fixed groups (present / members / targets); a fourth table is found but not shown (S4-4). Options: A) accept all; B) restore (a) with a display name in the ladder step (needs `i18n` support in `fieldValue`), (c) by widening the gauge. **Recommendation: A.** Source: RESULT S4-2. → **Decided 2026-10-01: A (user accepted the recommendation).**

## 4. Done (evidence)

- ~~Streaming / decoupling P2–P3 (P1 wake + hidden-poll gating, MVUBridge, ContextPipeline, DepthSystem, Estate3D manifest, CharacterRosterSystem, LayerRegistry)~~ ✅ 2026-09-30 `643e087` `785c421` `28d646e` `709c1c9` `43c053a` `a4de0f2` `5ce27d3` `aed4f49` `92a9bda` `910bd6e` (archive L110)
- ~~Untracked artifacts `docs/drafts/props_u12_*` and `landmark_glory_crown_draft_c1.jpg`~~ ✅ 2026-09-29 `065110e` (archive L199)
- ~~Private API-key driven tasks / LLM navigator (Part 6: gateway base, background tick, clue nodes, action injection)~~ ✅ 2026-09-30 `4e22fca` `436fa97` `b2bb30c` `bf080e3` (archive L250)
- ~~Part 5 pickup props inside the Three.js mansion, and `core/clock.mjs` wired into roaming~~ ✅ 2026-09-30 `ae2a3a7` (archive L48–L49)

## Migration table

One row per unfinished item of `docs/archive/todo-2026-09-30.md` (the old file, unchanged). Destinations: `S<n>` / `Stage B` merged into a plan step · `§1 I-xx` · `§2 E-xx` · `§3 Q-xx` · `parked (after OS v1)` · `verify → done` (struck in §4 with a sha) · `void` (reason; “moved to the render ledger” means a render-campaign item now owns it). Rows marked *tail* are open parts hidden inside items the old file had already struck.

| old ref (archive line) | short quote | destination | note |
|---|---|---|---|
| L12 | “Product direction, versions, user decisions” | void (pointer table replaced by docs/README.md “Current documents”) |  |
| L13 | “Session handoff (what the last agent did / left)” | void (pointer table replaced by docs/README.md “Current documents”) |  |
| L14 | “UI refactor backlog (U1–U23)” | void (pointer table replaced by docs/README.md “Current documents”) |  |
| L15 | “Buildings and 3D models, per marker” | void (pointer table replaced by docs/README.md “Current documents”) |  |
| L16 | “Card omissions (what the card has that the map lacks)” | void (pointer table replaced by docs/README.md “Current documents”) |  |
| L17 | “`docs/event-taxonomy.md` (counts)” | void (pointer table replaced by docs/README.md “Current documents”) |  |
| L18 | “Cloud render” | void (pointer table replaced by docs/README.md “Current documents”) |  |
| L19 | “Landmark pipeline (one id → model → glb → ship)” | void (pointer table replaced by docs/README.md “Current documents”) |  |
| L23 | “Every item below carries its source” | void (maintenance rule replaced by this file’s header) |  |
| L25 | “When an item is finished: strike it here” | void (maintenance rule replaced by this file’s header) | agent-brief §5 keeps the strike rule |
| L27 | “When a source document contradicts” | void (maintenance rule replaced by this file’s header) | authority order now in the header |
| L29 | “Do not open a second list.” | void (maintenance rule replaced by this file’s header) | same rule, header rule 1 |
| L48 (tail) | “Still open in Part 5: pickup props inside the Three.js mansion” | verify → done (§4, `ae2a3a7`) | 3D glowing pickups (`map/core/stash3d.mjs`, estate loot picking) |
| L49 (tail) | “`core/clock.mjs` is still unwired” | verify → done (§4, `ae2a3a7`) | `walk.mjs`, `wander.mjs`, `routine.mjs`, `estate/main.js` import `core/clock.mjs` |
| L56 (tail) | “Still open in Part 3: persistent context across 3D” | §1 I-05 |  |
| L57 (tail) | “legacy estate page (`map/estate/main.js`” | §1 I-05 |  |
| L58 (tail) | “shipping any KTX2-baked GLB” | §1 I-05 |  |
| L60 (tail) | “Part 1-1/1-2 (live SillyTavern automation contract” | §1 I-01 |  |
| L61 (tail) | “Part 2-2/2-4 (U1–U12 sweep” | S5 | module structure / lazy load; the U1–U12 sweep is re-checked in S7 |
| L61 (tail) | “Part 4-2/4-4 (X-Ray” | parked (after OS v1) | Part 4-2 X-Ray cutaway |
| L62 (tail) | “cutaway, Web Audio)” | §3 Q-01 | Part 4-4 Web Audio is the stranded ambience engine |
| L62 (tail) | “Part 7-3 (Shadow DOM isolation)” | parked (after OS v1) |  |
| L63 | “LLM 空间推理 + 世界书智能化双战役” | §1 I-04 | tracker `docs/plans/llm-campaign.md`; W1–W9, W11 landed; v0.9.8 release hold → Q-02 |
| L75 | “Real SillyTavern + TavernHelper browser test.” | §1 I-01 | `tools/browser/` has only the stub host |
| L78 | “`eden-map.js` 继续拆分” | S5 | known mapping; the U1–U12 half (same batch, ROADMAP) is re-checked in S7 |
| L79 | “移动端窄屏自适应与交互死区抛光” | S7 | U19–U23, known mapping |
| L82 | “MVU 迷雾 / 结构小任务” | void (process reminder: tests are mandatory in every prompt) | agent-brief §4 |
| L83 | “`card-omissions` 遗留：A18/A20 泛称做图层” | §2 E-01 | the A18/A20 layer half may fold into S8 |
| L86 | “事件系统后续：城市节律” | parked (after OS v1) | city rhythm, causal links, live ritual broadcast, map-events phases 2–5 |
| L89 | “`registerOverlay` / `unregisterOverlay` 暂缓未做” | S8 | known mapping; lands as the local layer extension point |
| L90 | “`here.mjs` 只能解析 54/55” | S3 | known mapping; generic node matching replaces the 6 hard-coded levels |
| L91 | “创意工坊” | parked (after OS v1) | `docs/design/custom-v2.md` C1–C12 goes with it |
| L93 | “纵深 P2” | parked (after OS v1) | the `make_dzi` meta hookup (`:84`) goes with it |
| L95 | “上层真 3D” | parked (after OS v1) | plan §9: dedicated views need code |
| L96 | “自动旋转开关进设置页” | §1 I-06 | wheel = pan vs zoom needs user feedback |
| L97 | “信息按钮 (i) 高亮却不弹面板” | S7 | known mapping (3D (i)); the tower white block / pink strip half is row 107 (E-02) |
| L99 | “`browser-smoke` 仍是 `if: false` 占位” | §1 I-02 | `.github/workflows/ci.yml` |
| L102 | “世界图输入不可复现” | §1 I-03 | `docs/reviews/takeover_095/toolchain.md` #13 and #15 (the archive line mistypes the path as `tools/reviews/`) |
| L106 (tail) | “留待通用化 v2” | parked (after OS v1) | plan §9: world map / cross-section / sky-city ring generalise after v1 |
| L107 | “气候塔材质细化” | §2 E-02 | `blender/tc_estates.py` climate_tower |
| L108 | “设置「版权申明」页与人物页声望在真实酒馆浏览器过一眼” | §1 I-01 | hangs under the real-tavern test item, as the line says |
| L110 | “**Streaming / decoupling P2–P3**” | verify → done (§4, `910bd6e`) | every sub-step is struck in the line with its sha; all shas resolve in git |
| L115 | “Stranded Part 4-4 ambience engine rescued” | §3 Q-01 | S0-D rescue branch; decision needed |
| L120 | “上层 v18 逐岛建模 → 定稿” | void (moved to the render ledger) | `isle:*` (8 items), `base:tc_upper`; redo-or-pick decision is Q-06 |
| L123 | “原域悬浮圣山精修两点” | void (moved to the render ledger) | `review:holy_mountain` |
| L128 (tail) | “**剩 5 个标记**” | void (moved to the render ledger) | `review:rust_outskirts`, `review:clearing_depot`, `review:free_knight_camp`, `review:linguang_post`, `review:arms_rnd` |
| L130 | “地下室 B1/B2 精修 + 道具包接口” | §2 E-03 | the B1/B2 half is ledger `estate:b1b2`; the prop-pack interface has no ledger item |
| L131 | “下层 4 处” | void (moved to the render ledger) | `var:tc_upper:16k` / `:dawn` / `:day` / `:dusk` / `:night`; the lower-layer 4 places are Q-04 |
| L132 | “中/下层 8K 定稿复核” | void (moved to the render ledger) | `base:tc_mid`, `base:tc_low`, `isle:isle25`, `var:tc_mid:*`, `var:tc_low:*` |
| L133 | “P2 机构三维化未打勾” | §2 E-06 | ROADMAP P2 line: the not-yet-named ones are 最高法院 and 大学; the rest is listed done |
| L134 | “P4 各地点全景 + 深度图” | parked (after OS v1) | needs panoramas and depth maps; large |
| L135 | “伊甸剖切等轴瓦片多边形导出” | §2 E-04 | ROADMAP: only if the final form still uses tiles |
| L136 | “`card-buildings` P3 里模型列为「—」的行” | void (moved to the render ledger) | `lm:*` and `scene:*` cover the current rows; later rows enter the ledger when picked |
| L137 | “`league_club` / `rothschild_estate` / `elite_academy`” | void (moved to the render ledger) | `review:league_club`, `review:rothschild_estate`, `review:elite_academy` |
| L139 | “A28–A31 落点或登记” | §2 E-05 | `docs/card-omissions.md` |
| L179 | “**重资产账**（已入库，占比大）” | S10 | plan §14.4: slim together with the repo split |
| L184 | “**历史里的垃圾 blob ≈63 MB**” | S10 | plan §14.4: rewritten out of history at the split |
| L187 | “**本机可清 ≈1.9 GB 未入库产物**” | §3 Q-08 | re-download / re-render cost, as the line says |
| L196 | “重复资产：`kiara_8_sunset_2k.hdr`” | §3 Q-08 | `git ls-files` shows neither file tracked: local duplicates only |
| L198 | “`.cache/card/` 与 `.cache/card_orig/`” | void (user card data under gitignored `.cache`, not repo content; nothing to do) |  |
| L199 | “未跟踪但应处理的产物” | verify → done (§4, `065110e`) | both files are tracked; the main checkout status was clean at S0-E start |
| L238 | “正式发布 / npm 发布” | §3 Q-02 |  |
| L239 | “用户在 TT 完整实测 v0.9.1–v0.9.6” | Stage B | island-sketch sign-off is ledger `isle:*` |
| L240 | “Q7 医疗室是否读卡名” | §3 Q-03 | Q8 is answered by the 2026-09-29 content boundary (agent-brief §7); Q7, Q9, Q10 remain |
| L241 | “与卡作者统一 MVU 结构” | parked (after OS v1) | `docs/author-compat.md` is not to be sent yet |
| L242 | “0.11 历史时间线、角色位置板、房间状态” | parked (after OS v1) | the 1.0 skill / tutorial half is S11 |
| L243 | “下层 4 处是否开工” | §3 Q-04 | DLC prep (将军官邸, 以太研究院) rides with it |
| L244 | “发版前 5 分钟实测清单待写” | Stage B | plan §13.4: the planning session writes the numbered checklist |
| L245 | “上层设定稿待批” | §3 Q-05 | `docs/upper-setting.md` |
| L246 | “测试件（私人公务机、汽水罐小屋）用户已暂停” | parked (after OS v1) | paused by the user |
| L247 | “`docs/drafts/` 158 MB 是否迁出主仓” | S10 | plan §14.4; the force-push is re-confirmed before it is done |
| L248 | “`archive/upper-v18` 的 v18 岛脚本：重做还是摘取” | §3 Q-06 |  |
| L249 | “上层景深（`map/data/upper_depth.json`，原 --haze）” | §3 Q-07 | the two 8K maps are already out (archive note) |
| L250 | “私有 API Key 驱动任务 / LLM 领航员” | verify → done (§4, `4e22fca`) | Part 6 gateway, tick, clue nodes and action injection all landed |
| L251 | “通用卡包标准（Pack Engine）” | S10 | Pack 0 spec landed in `4833e37` + `0f55514`; moving the data to `map/packs/eden/` is S10 |
| L305 | “A finished item stays **in its source document**” | void (maintenance rule replaced by this file’s header) |  |
| L307 | “The **index** only keeps §1–§4 readable” | void (maintenance rule replaced by this file’s header) |  |
| L309 | “**Historical task briefs and handoffs** live in” | void (maintenance rule replaced by this file’s header) |  |
| L312 | “**Per-release verdicts** live in” | void (maintenance rule replaced by this file’s header) |  |
| L314 | “**Nothing is deleted.**” | void (maintenance rule replaced by this file’s header) |  |
| L316 | “New items are added to §1–§4” | void (maintenance rule replaced by this file’s header) |  |

Method: a script listed every top-level list item and table data row of the archive that is not struck (`- [x]`, `- ~~…`, `~~…`; table header and separator excluded) = 69, plus 12 open tails found by reading the struck items; each quote was checked as a verbatim substring of the cited line.

archived unfinished items: 81 (69 + 12 tails) · rows: 81 · missing: 0

Per destination: S3 1 · S5 2 · S7 2 · S8 1 · S10 4 · Stage B 2 · §1 10 · §2 6 · §3 10 · parked 11 · verify → done 5 · void (render ledger) 7 · void (other) 20
