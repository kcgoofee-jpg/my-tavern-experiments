# LLM Spatial Reasoning & Worldbook Intelligence Campaign

Status: **drafted 2026-09-30, execution in progress** — tasks are struck through (`~~…~~ ✅ <sha>`) as they
land; the implementing agent is responsible for going back and striking them. Baseline: `origin/preview`
head #89 (`3573fac`, includes the Part 8 batch: 3D glowing pickups + deterministic-clock roaming +
depth/layer haze fusion, and the NPC-avatar/3D-roaming supplement; node --test 493 pass, smoke Exit 0).
The v0.9.8 release itself is **deferred** until the dev-workflow speedup lands; this campaign targets the
0.9.8 → 0.9.9 window.

Two fused campaigns in one document:

- **Part A — LLM spatial reasoning** (four papers, 2024–2026): upgrade the spatial context we hand to
  models from prose place-names to compact coordinate contracts; wire the dice that exist but are not
  rolled; compress long-horizon history into keyframes; constrain the future background "navigator" LLM
  to an atomic-op DSL validated in a sandbox.
- **Part B — worldbook intelligence**: hydrate addon-worldbook entries just-in-time around the player's
  location; crystallize confirmed story facts into persistent entries; compile spatial topology into a
  micro-syntax shared with Part A; deep-link both directions between the map and the worldbook.

Where the two campaigns overlap they are **fused** (topology compiler, fact pipeline, fly-to protocol);
where they do not, they are independent modules.

---

## 1. Why — theory alignment

| Paper | Claim we adopt | What it becomes here |
|---|---|---|
| SokoBench (Monti et al., TMLR 2026) | LLMs degrade on long-horizon state tracking; keyframe memory compression is required | W3 `keyframes.mjs`: >20-floor history collapses to macro-displacement summaries; timeline scrubbing stays O(1) per floor at 200+ floors |
| WorldCoder (Tang et al., NeurIPS 2024) | Writing code/structured ops beats free-text actions for sample efficiency and determinism | W4 `ops.mjs` + W5 `navigator.mjs`: the navigator may only emit atomic op blocks, validated throw-not-coerce, applied validate-then-apply |
| Grid-world world models (Li et al., ICLR 2026) | Coordinate-structured input dramatically outperforms grid/prose input for planning | W1 `spatial.mjs` + the `[TOPO]` compiler: ≤120-token coordinate contracts replace fuzzy方位 prose |
| Orak (KRAFTON, ICLR 2026) | Environment change/failure reports drive in-context self-correction | W2 `failrep.mjs`: stealth/stash check failures become structured reports (type, coords, DC delta, witnesses) fed back into the next inference |

## 2. Non-negotiable red lines (from the architecture watchdog and prior user decisions)

1. `map/core/*.mjs` ≤ 400 physical lines; no bare z-index literals (`--zu-*`/`--zv-*` only in viewer);
   `core` never imports from parent layers; pure modules never touch `window` / `document` /
   `localStorage` / `Mvu` / `SillyTavern` (only `mvu-bridge.mjs` owns those globals, machine-checked).
2. `map/core/` must not contain card-specific proper nouns (16 roster names, estate/city names) — all
   OP/TOPO/fact naming stays generic; proper nouns come from pack data or the builder tool side only.
3. "Chat log is the only truth" (`eden-map.js:460` area): everything is recomputed from the last N
   floors; nothing in this campaign may introduce a state store that cannot be rebuilt from the log.
4. The user's own card worldbooks are **never touched**. All automation is confined to our one addon
   book (`伊甸地图·世界书附加条目`) and entries carrying our `extra.eden_id` marker.
5. `tick.mjs` stays read-only (its header contract, lines 1–10) — the navigator gets its own scheduler.
6. `feedback-report.mjs`'s privacy firewall (chat content can never enter diagnostic reports) stays
   sealed; failure reports live in their own module and channel.
7. Every new storage key, protocol field, settings toggle and i18n string is registered
   (`core/storage.mjs` KEYS, `core/protocol.mjs` SCHEMA, zh/en pairs); new toggles default **off** with
   explicit consent (wbsync precedent).
8. Zero-token-first: displacement, collision, DC, clocks are computed locally and deterministically;
   the LLM only does high-order inference on top of locally computed facts.

## 3. Conflict adjudications (14)

Part A (8):

1. **Example brief said "parse DSL in tick.mjs" vs tick.mjs's read-only header** → the navigator
   scheduler is a new module (`navigator.mjs`); `tick.mjs` is not touched. Yielding logic (panel alive /
   generating) is re-derived there, reusing `tick`'s pure helpers where they fit.
2. **"Chat log is the only truth" vs navigator ops persisting state** → navigator ops are session-scoped
   overlays (display layers + text suggestions) only. The *only* path to persistence is the existing
   main-model ⌖ tag channel. Ops never write MVU, never touch `仓库`/`探索`.
3. **`core/quests.mjs` "no invented factions/plots" vs navigator-generated events** → navigator defaults
   off + explicit consent; anything it proposes flows through the *existing* events sandbox (CATS
   whitelist, ≤3/floor, EXAMPLES echo blacklist).
4. **feedback-report privacy firewall vs failure reports** → new pure module `failrep.mjs`; its data can
   never enter `REPORT_ALLOWED_KEYS` channels.
5. **State line 150-token budget vs spatial contract 120-token budget** → the spatial contract is a
   separate injection id with its own budget and degradation ladder (here > guards-nearby > exits >
   POI-nearby > fog); coordinates quantized to 3 decimals; both reuse `modes.tokens()`.
6. **MVU single-owner rule** → the navigator never touches `Mvu`; its API key lives in host-th preference
   keys and is only ever logged masked (`llm.mjs maskKey`).
7. **Keyframes vs only-truth invariant** → keyframes are a droppable cache: deleting `eden_map.关键帧`
   and recomputing from the log must be item-for-item identical (locked by a reconciliation test).
8. **Protocol compatibility** → `eden-map:stealth` gains `worst` as an additive optional field; old
   consumers ignore it.

Part B (6):

9. **User worldbook sovereignty** → JIT only flips `enabled` on entries carrying our `extra.eden_id`
   inside our addon book. An entry the user manually disabled is recorded in `extra.eden_jit_ignore`
   and never re-enabled by JIT (extends the merge rule "user switch state wins", `wbsync.mjs:84`).
10. **Worldbook write cost / churn** → JIT writes only when the activation-set hash changes, under
    `wbsync.withLock` (navigator.locks), idempotent by floor watermark; a failed write degrades
    silently and retries next round. No per-round writes.
11. **Crystallized-fact garbage growth** → `map.fact.<hash>` content-hash dedup + LRU cap + tombstone
    (deleted facts never resurrect, `edenMapWbTomb` precedent) + a settings-page management list.
12. **Canon boundary** → crystallized facts quote the story text verbatim; anything map-invented is
    tagged 「地图自设」. Topology adjacency uses only: explicit `marker.link`/`link3d` (maps.json),
    geometric neighbours (the builder's existing `neighbours()` precedent), and hierarchy containment.
    `routes` are *not* an adjacency source; inferred links are tagged 「地图自设」.
13. **Three spatial texts coexisting** (方位 EJS entries / `[TOPO]` blocks / the live spatial injection)
    → builder v17: the `[TOPO]` block replaces and slims the old方位 prose entries (stable ids kept via
    the alias map); the live injection is a separate id ≤120 tokens.
14. **Protocol reuse for deep links** → `eden-map:fly` is already registered
    (`core/protocol.mjs:72`, "no sender in repo"); the `{{eden_fly}}` macro becomes its first sender
    (default off, same `edenMapMacros` switch family).

---

## 4. Task register

Format per the user's checklist convention: one item per line, strike through when done.

### W0 — Campaign document + registration (this file)

- [x] ~~Write this document; register the campaign in `docs/todo.md` §1; CHANGELOG 0.9.8 carries the
  batch entries as tasks land.~~ ✅ 2026-09-30 (this file)

### W1 — Spatial coordinate contract + topology micro-syntax (fused Part A task 1 + Part B task 3)

- [ ] New pure module `map/tavern/spatial.mjs` (≤400 lines, node-testable, no globals):
  - `coordView(pack points, {mapId})` — normalize markers/routes/patrol cones/depth summary into one
    coordinate view: `{ here:{id,name,nx,ny}, layer, exits:[{name,nx,ny}], guards:[{name,x,y,facing,range,fov}], pois:[{name,nx,ny}], fog:{exploredRatio,enabled} }`
    (reuses `core/vision.mjs patrolCones` :87-104, `core/depth.mjs describe()` :72-82, points schema
    `markers {nx,ny}` 0–1 normalized).
  - `encode(view, {budget=120})` — compile to a compact JSON contract; deterministic (same input →
    byte-identical output; sorted keys, 3-decimal quantization); degradation ladder when over budget:
    drop fog → drop far POIs → drop far guards, `here`/exits never dropped; token estimate via
    `modes.tokens()`.
  - `topoBlocks(reg, {mapId})` — compile `[TOPO: <layer>/<area> -> exits: a, b; blocked: <barrier>]`
    blocks from the three legal adjacency sources (adjudication 12); returns blocks + a manifest of
    which links are 「地图自设」 inferences.
- [ ] `tools/build_worldbook_addon.py`: new topology output mode — emit the `[TOPO]` blocks into the
  方位 entries (v17), replacing the long-form prose per adjudication 13; token accounting reuses the
  builder's `tokens()` (:315-318); `--ship` output gains the blocks; assert ≤25% of the previous prose
  token count in the builder self-test.
- [ ] Host wiring (`eden-map.js`): inject the encoded contract as its own prompt id
  (`eden-map-spatial`, in_chat, depth 2, role system), recomputed on the same round that drives
  `stateInject`; toggle default **off**, key `edenMapSpatial`, budget key `edenMapSpatialBudget`.
- [ ] Tests: `tests/spatial_encoder.test.mjs` (determinism: same view → identical bytes; budget ladder:
  field priorities under squeeze; quantization; purity scan) and `tests/wb_topo.test.mjs` (block
  structure, adjacency-source legality — routes never appear as adjacency; 「地图自设」 tagging; size
  ratio vs prose baseline).
- [x] ~~Core landed~~ ✅ 2026-09-30 `f184d66` (`spatial.mjs` 8/8, `wb_topo` 2/2, watchdog 4/4, suite
  502/0; orientation entries ~434 → ~200 tokens/round).
- [ ] **W1 v1.1 (batch-1 learning)**: estate rooms have no coordinates — pass the estate plan (rooms
  with floors) into `coordView`/`activationOf` so an estate location emits its **same-floor rooms** as
  the `n[]` list (≤6); without this W6 never activates inside the estate. Estate TOPO as a *new*
  worldbook entry requires a new stable id → register it in `map/data/worldbook_aliases.json` in the
  same batch as W7 (alias bookkeeping is a real cost, discovered in execution).

### W2 — Dice wiring + failure report ring (Orak)

- [ ] Wire `core/stash.mjs search()` (:61-72) into `takeLoot` (`eden-map.js:341`): roll via
  `core/rng.mjs` mulberry32 seeded with `(chatId, floor, item id)` — same replay, same roll; on
  `found:false` the item is *not* added, a failure report is emitted, and an optional injection
  (`action.mjs` new `fail` kind template) tells the model the search failed. Cover **both** pickup
  paths: flat-map `eden-map:loot` and the Part 8 estate 3D `estate:loot` route.
- [ ] `eden-map:stealth` gains `worst` (`app/vision.mjs:65` — `crossing()` already returns
  `worst {id,name,dc,dist,at:[px,py]}`; add to the post + `core/protocol.mjs:38` schema, additive).
- [ ] New pure module `map/tavern/failrep.mjs`: structured report
  `{ kind:'stealth'|'search', at:[x,y], dc, margin, witnesses:[names], floor, id }`; ring buffer ≤5;
  `digest()` renders a one-line `[地图检定·环境反馈] …` in the `events.summarize` prefix style; floor
  watermark so a report is never injected twice.
- [ ] Injection: append `failrep.digest()` to the existing `eden-map-events` injection array
  (`eden-map.js:512` area) — no new channel, no new privacy surface.
- [ ] Test: `tests/action_reflection.test.mjs` (deterministic rolls — same seed same outcome; failure
  branch does not mutate inventory; report idempotence under recompute; digest format; ring cap).

Batch-1 refinements for W2: both pickup paths (flat-map `eden-map:loot` and the Part 8 estate 3D
route) converge on `takeLoot` — one wiring point; `stash.search`'s own comment already prescribes the
deterministic roll (`core/rng.mjs seedOf(chatId, floor, id)`); dice live behind a new opt-in key
`edenMapDice` (default off → behaviour identical to today: no roll, always found). Patrol data exists
only on the upper layer (`tc_mid`/`tc_low` points have no routes) — the stealth failure loop v1 is
upper-layer-only; adding mid/low patrol rings is a content/asset task (register in `docs/todo.md`
render/content line, does not block W2). The ring buffer is **in-memory, session-scoped** + floor
watermark — reports are hints, not truth; no new chat variable / storage key (nothing to reconcile).

### W3 — Long-horizon keyframe compression (SokoBench)

- [ ] New pure module `map/tavern/keyframes.mjs`:
  - `W_RECENT = 20` (aligned with MVU's own 20-floor retention, `snapshot.mjs:9`); older floors merge
    into segments `{from, to, floors:[a,b], here, time}` using the `trips.mjs playerTrips`
    same-place-merge precedent (:35-59); checkpoint-style idempotent advance (the `modes.mjs:101-121`
    four-state match/ahead/swiped/missing pattern); cap 50 segments, adjacent same-place merged.
  - Persist to chat variable `eden_map.关键帧` (registered key); **droppable**: `rebuild(states)` must
    reproduce the same segments from raw floor states (reconciliation locked by test).
- [ ] `map/tavern/timeline.mjs floorState` gains a keyframe fallback tier *below* the JSONPatch tier:
  MVU stat → JSONPatch → keyframe (marked `approx`, surfaced with the existing `em-unsure` styling
  precedent); `walk()` consumes keyframe segments for old spans transparently.
- [ ] Host `tlTrail` (`eden-map.js:598-605`): replace per-scrub full `walk(0,f)` with an incremental
  cached trail (extend/trim at both ends; invalidate on chat switch / `CTX.reset()`). 200-floor scrub
  target: no bridge calls per slider tick beyond cache misses.
- [ ] Test: `tests/keyframe_compression.test.mjs` — zero-drift reconciliation (compressed replay vs
  full replay item-for-item, session_replay fixtures), idempotent advance, watermark invalidation on
  swipe, segment cap, `approx` flagging.

### W4 — Restricted op DSL sandbox (WorldCoder)

- [ ] New pure module `map/tavern/ops.mjs`:
  - Grammar: `OP_EVENT` (shape = events entry), `OP_CLUE` (shape = quests row), `OP_MARKER`
    (session-scoped overlay marker), `OP_SUGGEST` (text suggestion, never auto-injected). Four ops,
    no more in v1.
  - `parse(text)` runs **after** the sanitize chain (`sanitize.stripBlocks` + `msgtext` strips
    `<think>`/`<UpdateVariable>`) so CoT echo cannot draft ops; response hash watermark (same response
    never applied twice); ≤3 ops per response; EXAMPLES-style echo blacklist.
  - Validation is throw-not-coerce on shape (the `core/layers.mjs normChain` :12-23 pattern): wrong
    field type → the op is dropped and counted, never coerced.
  - `apply(ops, ctx)` returns a *diff description* only — the host performs all side effects
    (validate-then-apply; the `takeLoot` id-check precedent).
- [ ] Test: `tests/ops.test.mjs` (grammar accept/reject matrix, shape strictness, cap, echo blacklist,
  watermark idempotence, sanitize-order fixture with a `<think>`-wrapped op).

### W5 — Navigator gateway (first consumer of `llm.mjs`)

- [ ] New module `map/tavern/navigator.mjs` (pure scheduling; HTTP side effects stay in the host):
  - Schedule: own interval (settings), yields when the panel is open or the tavern is generating
    (re-derived from `tick.plan` semantics; `tick.mjs` untouched — adjudication 1).
  - Input assembly: `ContextPipeline.round()` digest + W1 spatial contract + W2 failure ring digest;
    system prompt states the op DSL and the *facts only* boundary.
  - Output: strict JSON parsed by W4 `ops.parse`; anything unparseable is dropped with a log line,
    never retried blindly.
  - Config: provider/key/model via settings (host-th preference keys), masked in every log
    (`llm.mjs maskKey`/`redact`); `buildRequest`/`readText` finally get a production consumer.
- [ ] Host wiring: consent gate (default off, wbsync-style explicit agree), one navigator run per
  round at most, results dispatched through W4 → existing layer/protocol paths only.
- [ ] Test: `tests/navigator.test.mjs` (schedule yielding matrix, request assembly determinism,
  masked-key logging, response→ops plumbing with stubbed fetch, off-by-default).

### W6 — Worldbook JIT hydration (Part B task 1)

- [ ] New pure module `map/tavern/wb_jit.mjs`:
  - `activation(here, topo)` — current place + directly connected neighbours (W1 topo data; never
    routes); returns the set of entry ids whose place-scope intersects the activation set.
  - `planActivation(installed, here)` — walks addon-book entries by `extra.eden_id` + place scope →
    `{ enable:[], disable:[], ignore:[] }`; entries flagged `extra.eden_jit_ignore` (user-disabled)
    are never enabled (adjudication 9); entries without a place scope are never touched.
  - `shouldWrite(prevHash, nextHash, floor)` — hash-watermark gate (adjudication 10).
- [ ] Host wiring: on the same recompute round as `stateInject`, call `inspect` → plan → if changed,
  `updateWorldbookWith(BOOK, updater)` under `wbsync.withLock`; failures degrade silently; last-write
  watermark in `edenMapWbJit` (registered key). Toggle default off, key `edenMapWbJit`.
- [ ] Test: `tests/wb_jit.test.mjs` (activation correctness on move-in/move-out, ignore-flag
  respect, hash-watermark idempotence — no write when the set is unchanged, memory accounting: the
  updater never clones unrelated books, user entries untouched).

Batch-1 refinement for W6: **no per-entry place metadata needs to be invented** — entry scope is
data-driven: an addon entry is active iff any of its own `strategy.keys` intersects the activation
set (W1's `activationOf`, already landed and tested in `spatial.mjs`); `constant` entries are never
JIT-managed. Write watermark = `{floor, activationHash, ok}`. Cross-layer exits barely exist in the
data (only 2 real ones city-wide; the other 56 `link`s are lm_* 3D landmark pages) — geometric
neighbours are the primary adjacency source, and the estate is covered by the W1 v1.1 plan-based
same-floor adjacency, not by links.

### W7 — Fact crystallization (Part B task 2)

- [ ] `⌖事实` tag: new branch in `mvu.mjs parseCustomTags` (:198-214 area) → op `fact` with a new
  landing spot in custom items + `normCustom` compatibility; round signature picks it up via the
  existing `custVer` mechanism (no extra wiring).
- [ ] New pure module `map/tavern/wb_crystallize.mjs`:
  - `candidates(tagLog, customItems)` — confirmed facts (present in the final tag state, not
    subsequently undone) → entry drafts `{ id:'map.fact.<fnv1a>', keys:[place/name], content:<verbatim
    quote + 「地图自设」 when map-inferred>, floor }`.
  - LRU cap (e.g. 40 entries), content-hash dedup, tombstone check (`edenMapWbTomb` family — deleted
    ids never resurrect); idempotent by floor watermark.
- [ ] Host wiring: on recompute, new candidates → write via the same `wbsync.sync` consent path into
  the addon book (never the user's books); settings page `th-ui.mjs` gains a `wb-xtal` op rendering a
  per-entry checkbox list (view/disable/delete — the `renderWb` row pattern, `th-ui.mjs:19-51`).
- [ ] Test: `tests/wb_crystallize.test.mjs` (idempotence — same log replayed writes once; undo/redo of
  a ⌖事实 removes/re-adds correctly; tombstone permanence; LRU eviction order; verbatim content
  fidelity).

### W8 — Map ⇄ worldbook deep links (Part B task 4)

- [ ] Map → worldbook: `TCWb.decorate(el, name)` capsule (「世界书档案」) in the `markers.mjs showCard`
  decorate chain (:42-61, the TCScrap/TCSecurity pattern); click sends an `eden-map:th {op:'wb-peek',
  name}` → host reads the addon book entry (matched by keys) → returns a highlighted summary to the
  card drawer. Read-only; absent API → capsule hidden.
- [ ] Worldbook → map: `{{eden_fly 地点名}}` macro registered in `th.mjs` MACROS (:97-104) under the
  existing `edenMapMacros` switch (default off); expands to a clickable marker that posts
  `eden-map:fly` (`core/protocol.mjs:72` — first in-repo sender) → `app/host.mjs:55` → existing
  `flyTo` (`map/custom.mjs:297`), which already handles 2D markers, estate rooms and 3D hotspots.
- [ ] Tests: extend `tests/cardlinks`-style coverage — capsule render gating, macro expansion shape,
  protocol round-trip (`wb-peek` stub, `eden-map:fly` target resolution).

### W9 — Tests, probes, registries (cross-cutting)

- [ ] All new files registered: `core/storage.mjs` KEYS (`edenMapSpatial`, `edenMapSpatialBudget`,
  `edenMapWbJit`, `edenMapWbXtal`, `edenMap关键帧` chat-var family), `core/protocol.mjs` SCHEMA
  (`worst` on stealth, `wb-peek` op), i18n zh/en pairs for every new settings string.
- [ ] Settings page: one new section grouping the five switch families (spatial contract / dice /
  keyframes / JIT+crystallization / navigator), all default off.
- [ ] Browser probe `tools/browser/p9_worldbook.mjs`: JIT enable/disable round-trip on stub worldbook,
  crystallization idempotence, capsule deep-link, macro fly-to; plus a 200-floor synthetic-chat
  timeline scrub performance probe (bridge-call counting).
- [ ] Full gates: `node --test` green; `bash tools/smoke.sh` Exit 0 (watchdog four lines + doc
  language + tree hygiene).

### W10 — Closeout

- [ ] CHANGELOG 0.9.8 entries per batch; strike through this register; `docs/todo.md` §1 strike;
  campaign report (≤10 lines, results/tests/decisions-needed).
- [ ] Deferred release v0.9.8 (tag `map-v0.9.8`, latest.json, README line, sync_main, CDN warm)
  resumes after the dev-workflow optimization lands.

---

## 5. Acceptance gates

1. Every new module has its own test file; no testless module ships.
2. `node --test` fully green (bare command — with a directory argument Node 24 throws
   MODULE_NOT_FOUND); `bash tools/smoke.sh` Exit 0 including the architecture
   watchdog (core line count / purity / no-reverse-import / no-card-proper-nouns / no bare z-index),
   doc-language gate and tree hygiene.
3. Zero drift: keyframe reconciliation and crystallization idempotence are locked by tests, not by
   review.
4. User-data sovereignty: a test asserts JIT/crystallization writes touch only entries carrying our
   `extra.eden_id` inside our addon book, and respect user-disabled entries.
5. Token budgets hold: spatial contract ≤120 tokens, JIT activation window 50–100 tokens,
   `[TOPO]` ≤25% of prose baseline — each asserted in a test or builder self-test.

## 6. Batches & push plan (CDN-warm economics: 2–3 items per push)

- Batch 1: W0 + W1 (this doc; spatial contract + topo compiler).
- Batch 2: W2 + W3 (dice/failure ring; keyframes) — independent, parallel.
- Batch 3: W4 → W5 (DSL, then navigator — strictly serial).
- Batch 4: W6 + W7 + W8 (worldbook trio).
- Batch 5: W9 + W10 (registries, probes, full gates, closeout; release when unblocked).

## 7. Open user decisions ([?])

- [?] Navigator consent copy + default cadence (once per round vs on-demand button).
- [ ] Dice default: follow `edenMapInject` family (default off) — confirm (key name fixed to
  `edenMapDice` in the W2 refinement above).
- [ ] Should the main model acknowledge crystallized facts with a receipt tag (round-trip watermark),
  or is host-side confirmation enough for v1?

## 8. Execution learnings (batch 1, 2026-09-30) — fixed actions from here on

1. **Builder output is coupled to the ship file**: any change to `tools/build_worldbook_addon.py`
   output requires re-running `--ship` in the same commit, or the worldbook release tests fail.
   Check the entry-id alias map whenever a *new* entry id is introduced (the builder asserts it).
2. **Adjacency data is thinner than assumed**: 56 of 58 `marker.link`s are lm_* 3D landmark pages
   (kind=estate, no layer); only ~2 real cross-layer exits exist city-wide. Geometric neighbours are
   the primary adjacency source; richer exit narratives are a content task, not a code task.
3. **Patrol routes exist only on the upper layer** today — stealth/failure-loop coverage is
   upper-layer-only until mid/low patrol rings are authored (content task, tracked in todo).
4. **Doc + suite facts**: purity scans in tests must strip comments first (watchdog convention);
   full suite is bare `node --test`; suite now 502 items / 95+ suites.
5. **Deferred release checklist** (when the dev-workflow speedup lands): rebase → bump VERSION to
   0.9.8 → re-run `--ship` (stamps 0.9.8) → date the CHANGELOG section → tag `map-v0.9.8` + push tag →
   `tools/ship.sh --release` (README line, latest.json, CDN purge/warm) → `tools/sync_main.sh` →
   `check_readme` verification. Remote moves fast (background optimization) — rebase immediately
   before every push.
