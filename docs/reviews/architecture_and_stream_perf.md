# Streaming performance and subsystem decoupling — diagnosis and design RFC

Status: **report-only round** — no core runtime code was overwritten, per the task brief. Evidence
collected 2026-09-30 by direct audit of `map/tavern/*`, `map/app/*`, `map/viewer.html`,
`map/estate/main.js` and `map/props/viewer3d.html`. Companion commits landed this session:
`a16a1b8` (in-app version branch switch), `0e8f1d8` (`tools/clean_card.py`), `58d1281` (test
renames). Implementation of the fixes below is proposed for follow-up commits after review.
Update 2026-09-30: P0 (G1, G6) and P1 (G2, G3) are implemented - commits
`040baf9`, `04f170f`, `643e087`. P2 is implemented - commits `785c421`
(MVUBridge, sole owner of the Mvu/SillyTavern globals) and `28d646e`
(ContextPipeline, the pure chat-context pipeline of §4). P3-A (the light
contract batch: DepthSystem describe summary + fog key collapsing per §2,
Estate3D manifest contract per §7) is implemented - commits `709c1c9`
(DepthSystem) and `43c053a` (Estate3D). P3-B (CharacterRosterSystem per §5) is
implemented - commits `a4de0f2` (contract module `core/roster.mjs` + tests) and
`5ce27d3` (bridge and host wiring). Remaining P3: LayerRegistry (§6).

Part 1 is a diagnosis of the "background tab: API finished, front end frozen" class of bugs and
an audit of the streaming-period pipeline. Part 2 is a decoupling RFC for the six subsystems and
the multi-card generalization contract. Nothing here changes runtime behavior yet.

---

## Part 1 — Background-tab freeze and streaming pipeline (diagnosis)

### 1.1 Symptom

With the SillyTavern tab hidden (another tab or window focused), the model finishes streaming a
reply, but the map panel / host bar do not update until much later, or only when the user comes
back to the tab.

### 1.2 Root cause: hidden-tab throttling, not a lost stream-end signal

The stream-end signal is **not** lost. `GENERATION_ENDED` / `MESSAGE_RECEIVED` fire normally in
the host (the host script runs on the tavern page itself). What breaks is everything the host
*schedules* after those events:

1. **`requestAnimationFrame` is fully suspended** in hidden tabs. Every rAF-driven loop in the
   viewer iframe stops painting until the tab is visible again.
2. **`setTimeout` / `setInterval` are clamped** in hidden tabs (Chromium family: >= 1 s while
   hidden, >= 60 s after ~5 minutes hidden; TauriTavern's WebView behaves the same way).
3. The host's post-generation refresh is timer-based:
   - `recomputeSoon(ms)` and `pushSoon(ms)` (`map/tavern/eden-map.js`) are `setTimeout` debounces
     wired to `MESSAGE_RECEIVED / UPDATED / SWIPED / DELETED / EDITED / RENDERED` and
     `GENERATION_ENDED / STOPPED`.
   - `flushIdle` runs 800 ms after `GENERATION_ENDED` to release deferred work — also clamped.
   - the 4 s stat-signature poll (`pollT`) and the 10 min update check (`updT`) are clamped too.

So the observed "freeze" is: the completion handlers run, they queue debounced work, and the
browser parks those timers because the tab is hidden. The UI catches up either when a clamped
timer finally fires (up to 60 s later) or when the tab becomes visible and the existing
`wake()` compensation runs.

This also explains why the symptom tracks "long generation in background": long generations are
exactly when the user switches away, and the longer the tab stays hidden, the harsher the
clamping.

### 1.3 What already compensates (audit results — keep these)

| Guard | Where | Verdict |
|---|---|---|
| `wake()` on `visibilitychange` + `pageshow` + `online` resets the stat signature and re-runs `recomputeSoon(0)` / `pushSoon(0)` | `eden-map.js` (bottom event block) | covers tab-return; registered through `life.add` so it is removed on cleanup |
| Cloud drift animations pause/play on `visibilitychange` | `map/app/clouds.mjs:85` | correct pause/resume pattern |
| 3D viewer: `visibilitychange` sets dirty; `estate:resume` restarts the rAF loop | `map/props/viewer3d.html:651,668` | the 52c2fcc lesson, applied |
| Estate loop resumes on `estate:resume` | `map/estate/main.js:844` | same pattern |
| `GEN.since` expires after 180 s | `eden-map.js` (`GEN` object) | a missed `GENERATION_ENDED` cannot wedge the "generating" state forever |
| Idle work deferred during generation (`afterGen` + `idleQ`) | `eden-map.js` | keeps the streaming period free of our own heavy work |
| Panel-visibility gates on `sendEvents` / watermark advance | `eden-map.js` | background preload cannot eat the unread watermark |

**Listener lifecycle audit: no leaks found.** Every registration has a paired removal:

| Registration | Removal |
|---|---|
| TavernHelper events via `life.listen(ev, fn)` | `life.unlisten()` in `cleanup()` (uses `eventRemoveListener`/`eventOff` with the stored handle) — `map/tavern/host-lifecycle.mjs` |
| Non-TH DOM listeners via `life.add(off)` | called in `unlisten()` |
| `pagehide` cleanup hook | `install()` registers `window.parent.__edenMapCleanup`; `takeOver()` invokes it on re-injection |
| MVU `VARIABLE_UPDATE_ENDED` via `waitGlobalInitialized` | `listen()` refuses when `life.dead`, so a late-resolving MVU cannot register from a dead instance |
| Table-db `registerTableUpdateCallback` | `dbApiRef?.unregisterTableUpdateCallback` in `cleanup()` |
| BaiBai `onChange` | returns an unsubscribe; DOM-event fallback removes the same handler |
| Cross-instance DOM | `takeOver()` removes `#eden-map-root` and foreign `[data-eden-owner]` nodes |

There are **no persistent stream-retry listeners** anywhere in the chain: line measurement
(`host-routes.mjs measure/race`), follow-head resolution (`follow.mjs`) and update checks are
one-shot fetches. The historical "double-binding" class of bug is structurally prevented by
`takeOver` + `createLife`; nothing in this audit needs a fix on that front.

### 1.4 Remaining gaps and remediation list

Ranked; each item is a proposed patch (not yet applied).

**G1 (P0, correctness) — CoT blocks are not stripped before tag parsing.**
`readMsgs()` strips `<UpdateVariable>` blocks (including the unclosed tail, streaming-safe) from
the text used for tag parsing, but does **not** strip `<think>` reasoning blocks
(`map/tavern/eden-map.js`, `readMsgs`). Models that echo the tag spec or draft event tags inside
reasoning can therefore plant events / person tags from inside CoT. Fix sketch: extend the strip
to `<think>[\s\S]*?(?:</think>|$)` for the tag-parsing text only (keep `raw` untouched — trips
and variable extraction still need the full message). Unit fixture: a `<think>` block containing
an event tag must yield zero marks.

**G2 (P1, CPU) — the 4 s poll stringifies the entire `stat_data`.**
While the panel is open, `pollT` runs `JSON.stringify(mvuStat())` every 4 s — O(card variable
size) on the tavern main thread, in direct competition with the card's own regex/CoT rendering
during generation. Fix sketch: (a) skip the poll while `document.hidden` — `wake()` already
recomputes on return, so correctness is preserved; (b) prefer a cheap revision fingerprint when
MVU exposes one, falling back to the stringify comparison.

**G3 (P1, UX) — the viewer iframe gets no visibility signal of its own.**
Overlay updates (markers, event bar, here highlight) reach the viewer only via host pushes, which
are panel-gated and timer-clamped. The protocol already carries `eden-map:wake` (H2V); the host
should send it on `visibilitychange` so the viewer can cheaply refresh overlay state the moment
the tab returns, instead of waiting for the next data push.

**G4 (P2, polish) — `flushIdle` is a clamped 800 ms timer.** Harmless (wake covers it), but
scheduling it as a microtask with a `requestIdleCallback` fallback makes the common
foreground case snappier. Low priority.

**G5 — no stream-retry listener leak exists** (see 1.3). Recorded as a closed finding because
the task asked for it explicitly.

**G6 (P0, robustness — handoff rule 1) — function/parameter guards at exposure points.**
Current state: `host-th.mjs` wraps every TavernHelper call behind `fnOk/thFn`; `baibai.mjs`
`typeof`-checks every API method and never throws; `inner()` null-checks the viewer handle. What
is missing is a **single standard guard at cross-window exposure points**:

- add `fnGuard(name, fn, minArity)` to `host-th.mjs`: returns the function only if
  `typeof fn === 'function' && fn.length >= minArity`, else logs once and returns null;
- apply it at `window.parent.EdenMap` (the `api` object in `eden-map.js`, exposed via
  `initializeGlobal`) and at every cross-window probe site;
- document `window.TCSheet` (`map/app/shell.mjs`) as the only contract for the sheet API —
  same-name imports are not the loaded instance (handoff rule 1b);
- unit-test the contract: for each public method, assert `typeof fn === 'function'` and
  `fn.length >= N` (the pattern already exists in `tests/sources.test.mjs`);
- process rule (already in `docs/handoff.md`): before changing any public signature, grep every
call site including `tools/browser/*`.

### 1.5 Verification plan

- G1: extend `tests/events.test.mjs` with a CoT fixture; assert zero marks from the stripped
text and unchanged `raw`.
- G2: assert via the stub host (`tools/browser/host_stub.mjs`) that the poll skips while
  `document.hidden` and that `wake()` re-enables it; keep the `__edenMapPerf` counters as the
  CPU evidence.
- G3: stub-host test — post `eden-map:wake`, assert the viewer refresh path runs.
- G6: new unit test enumerating the `EdenMap` api surface with type + arity assertions.

---

## Part 2 — Six-subsystem decoupling RFC (design only)

### 0. Principles

1. `eden-map.js` remains the **composition root** (panel state machine, message bus, cleanup
   assembly). Subsystems become modules with a pure core and thin host/viewer adapters.
2. `map/core/protocol.mjs` (PROTO 2) stays the only cross-window seam; schema additions are
   additive and registered in `SCHEMA` (the static inventory test enforces this).
3. **Per-window context budget**: every subsystem exposes a typed *summary* (like
   `sources.mjs summarize()`) rather than raw state, so multiple agent windows can develop in
   parallel without holding whole files in context. Target after extraction: no subsystem module
   over ~400 lines.
4. **Multi-card first**: eden-specific vocabulary lives in data (`maps.json`,
   `map/packs/<id>/manifest.json`), never in code. `events.mjs configure()` already proves the
   pattern; extend it to rosters, portraits and depth.

### 1. Multi-card generalization contract (standard API for co-development)

The data plane already exists; this RFC formalizes the seams so other card authors (and agents)
can plug in without touching core code:

- **Ingestion**: `tools/clean_card.py` (`0e8f1d8`) is the normalization gate — any author's card
  becomes a regular `chara_card_v3` with an opaque payload and a zero-loss audit.
- **Pack manifest v1** (frozen; `docs/pack-schema-v1.md`) + events taxonomy (`configure()`),
  aliases and worldbook generation (`build_worldbook_addon.py --pack`) form the per-card data
  plane.
- **Proposed `PackAPI`**: a pack may declare capability providers — `{ events, roster, depth,
  layers, estate }` — in its manifest; the composition root loads only what is declared. Eden is
  simply the built-in pack (the `PACK_IN` seam already points this way).
- **Routes-as-data**: every registry access goes through `REG` (`map/app/state.mjs`), never a
  direct `maps.json` import; extend `REG` with pack-scoped getters so a pack can add maps,
  markers and routes without core edits — same architecture as the flight-route system.
- **Versioned capability flags** in the manifest, so a pack declares which subsystems it
  overrides and the core can refuse mismatched versions loudly instead of half-working.

### 2. DepthSystem

Current: `map/core/depth.mjs` (depth math + fog exploration — already the single implementation,
  pure), depth fields in `maps.json` consumed by `map/app/nav.mjs`, viewer fog in
  `map/app/fog.mjs`. **Boundary**: keep `depth.mjs` pure (no DOM, no host APIs); move fog
  persistence keys behind the existing storage adapter; expose `DepthSystem.describe()` for
  summaries. Risk: low — mostly a documentation + summary-shape task (4 h).
  **Implemented 2026-09-30 (`709c1c9`)**: `describe()` landed in `depth.mjs`
  (`{ maxDepth, currentHaze, exploredRatio, fogEnabled }`, purity machine-checked); the fog keys
  collapsed into `core/storage.mjs` as the single definition point (`FOG_KEY` / `FOG_LOCAL_KEY`
  exports) and `app/fog.mjs` consumes the storage adapter directly instead of hardcoding key
  literals — the never-toggled switch now honors its registered default '1'. Tests:
  `tests/depth_system.test.mjs`.

### 3. MVUBridge

Current: `mvu.mjs` (pure) + `adapter.mjs` (per-card field mapping) + `snapshot.mjs` (floor
  snapshots) + `shujuku.mjs` (table-db fallback), orchestrated ad hoc inside `eden-map.js`
  (`mvuStat` / `getHere` / `refreshVarMap` / `readVars`). Proposal: **one `MVUBridge` module owns
  the whole read pipeline** — `invalidate()` on `VARIABLE_UPDATE_ENDED`, `read(ctx)` returning
  `{ here, clock, outfit, rosters, portraits, custom }` — and it is the *only* module allowed to
touch `Mvu` / `SillyTavern` globals (host isolation requirement). The host consumes the summary
object only. Migration: move the existing functions as-is, then shrink `eden-map.js`
accordingly (~12 h incl. node-test parity).

### 4. ContextInteractionSystem

Current: `readMsgs` / `recompute` / `customTags` / `computeTrips` / `modes` / `stateInject` /
  `checkpointStep` live in `eden-map.js` (~450 lines) — chat detection and map linkage in one
  flow. Proposal: extract a **pure pipeline**: input (chat window snapshot, registry, varMap,
  custom state) → output (events, chars, trips, inject lines, tag applications). The host keeps
  only scheduling (debounces, event wiring, idle deferral). This is the seam that lets detection
  logic run entirely in node tests without a host, and it is where G1/G2 fixes land once
  extracted (~16 h).

### 5. CharacterRosterSystem

Current: `characters.mjs` (position tags), `mvu.mjs` rosters/portraits/fallback roster,
  `shujuku.mjs` characters, `baibai.mjs` appearance library, viewer chars UI. Proposal: roster
  assembly becomes **one module with a uniform source interface** — each source (MVU table,
  chat tags, table-db, card fallback roster, BaiBai appearance) exposes the same `rows()` shape;
  portraits and gallery attach by name. A new card's roster then requires only a mapping, not UI
  changes (~12 h).
  **Implemented 2026-09-30 (`a4de0f2`, `5ce27d3`)**: contract module `map/core/roster.mjs` —
  uniform row `RosterRow { name, displayName?, role?, location?, status?, tags?, source,
  present?, raw? }`, uniform provider interface `provider.rows(ctx)` with `use(source, provider)`
  registration over the five built-in sources, merged with fixed arbitration **mvu > chat >
  table-db > fallback > baibai** (same name or displayName alias merges into one row; field-level
  non-empty higher-priority wins, tags union, raw shallow-merge; a throwing / malformed source
  degrades alone). `attachPortraits(map)` mounts portraits/CG by standard name onto rows;
  `describe()` returns `{ total, activeCount, sourceCounts, unmappedPortraits }` (pure module,
  machine-checked). Wiring: the bridge registers its three sources (mvu / table-db / fallback)
  and exposes `rosterRows() / rosterNames() / rosterSummary()`; the host registers chat (⌖
  character tags from the pipeline message window) and baibai (lazy, optional) and feeds the
  character bar's `known` alignment list from the assembly system. The `eden-map:chars` viewer
  payload is unchanged (the rosters three-table object still comes from the bridge's `rosters()`)
  and the 16-member fallback display is untouched. Tests: `tests/character_roster.test.mjs`.

### 6. LayerSystem — redesign (replaces the current stacking logic)

Current problems, from the audit:

- Stacking is spread across three places: the fixed-UI z-index ladder in `map/viewer.html`
  (17 declarations, z 0–14), ad-hoc z-index inside the OSD stacking context (marker pins at
  z 1, hover z 3, transition cover z 6, …), and implicit DOM insertion order in the app modules
  (fog, clouds, markers, routes, trips, event bar each mount their own layer).
- Nothing composes: adding a visual effect (rain, a color filter over the base tiles, a
  time-of-day tint) requires touching both the OSD overlay internals **and** the fixed-UI
  ladder, in two files, with no regression net.

Proposal — a **LayerRegistry**:

- **Ordered slots (data contract, not code order)**: `base` → `depth-haze` → `fog` → `routes` →
  `trips` → `events` → `markers` → `labels` → `fx` → `interaction`. Fixed UI (bars, dialogs)
  stays on its own ladder outside the registry.
- **Layer descriptor**: `{ id, kind: 'dom' | 'canvas' | 'osd', order, mount(ctx), unmount(),
  filters: [{ type: 'css' | 'canvas', value }] }`.
- **Filters are stackable per layer**: DOM layers accept `backdrop-filter` / `mix-blend-mode`
  via the descriptor; canvas layers accept an `ctx.filter` chain. A rain overlay becomes
  "insert an `fx` layer with a filter" — zero stacking changes.
- **Migration**: map the current DOM 1:1 onto slots; move the 17 z-index literals into registry
  constants; rebind the layer toggle menu (`#layList`) to layer ids instead of bespoke checkbox
  handlers. Golden screenshots via the existing browser probes guard the visual regression.
  Estimate ~20 h — schedule it **last** because it changes rendering.

### 7. Estate3DViewer

Current: `map/estate/main.js` (three.js loop with pause/resume) + `map/props/viewer3d.html`
  consuming glb exports from `blender/estate2/` and `blender/landmarks/`. Proposal: the Blender
  pipeline emits a **manifest** per model (glb path, floors, hotspots, texture budget, license
  fields — `tools/landmark.py` already produces something close for landmarks), and the viewer
  consumes only `Estate3D.describe()`; no hardcoded model paths in viewer code (~8 h).
  **Implemented 2026-09-30 (`43c053a`)**: contract module `map/core/estate3d.mjs` (schema
  `{ id, glb, floors, hotspots, budget, license }`, three glb shapes + legacy `glb_low`,
  unknown-field tolerance, base-relative path resolution, low-tier fallback to std,
  `Estate3D.describe()` six-key summary); `estate/model/manifest.json` adopted the schema
  (glb parts site/house, floors cross-checked against `eden_estate_rooms.json`, data paths,
  budget constants, license); `estate/main.js` and `props/viewer3d.html` load glb / data /
  hotspots / tier constants from the manifest only (no hardcoded or assembled asset paths; the
  built-in 'dairy' default model is gone; `estate:resume` chain untouched). Tests:
  `tests/estate3d_manifest.test.mjs` (schema + disk reality checks across estate and all 36
  landmark manifests).

### 8. Phased plan (estimates)

| Phase | Items | Est. |
|---|---|---|
| P0 (first) | G1 CoT strip + G6 fnGuard & arity tests | 4 h + 4 h |
| P1 | G2 poll gating + G3 wake broadcast | 2 h + 2 h |
| P2 | Extract MVUBridge, then ContextInteractionSystem (node-test parity) | 12 h + 16 h |
| P3 | LayerRegistry (with browser probes), Estate3D manifest, DepthSystem summary, CharacterRosterSystem | 20 h + 8 h + 4 h + 12 h |

Sequencing: P2 before P3 (extraction first makes the LayerSystem rewrite land on a smaller
composition root); LayerSystem last of all because it changes rendering.

---

## Appendix A — Evidence index

| Claim | Evidence |
|---|---|
| Timer debounce wiring on generation events | `eden-map.js` event block: `MESSAGE_*` / `GENERATION_*` → `recomputeSoon()` / `pushSoon()`; `flushIdle` 800 ms after end |
| 4 s stat poll stringify | `eden-map.js` `pollT` interval |
| UpdateVariable strip (no think strip) | `eden-map.js` `readMsgs` text pipeline |
| wake() compensation | `eden-map.js` bottom block: `visibilitychange` / `pageshow` / `online` → `recomputeSoon(0)` / `pushSoon(0)` |
| Cloud pause/play | `map/app/clouds.mjs:85` |
| 3D dirty + resume | `map/props/viewer3d.html:651,668`; `map/estate/main.js:844` |
| GEN 180 s expiry | `eden-map.js` `GEN` object |
| Listener lifecycle | `map/tavern/host-lifecycle.mjs` (`createLife`/`takeOver`/`install`) + `cleanup()` assembly in `eden-map.js` |
| No retry listeners | `host-routes.mjs` measure/race; `follow.mjs`; one-shot fetches only |
| Guards today | `host-th.mjs` `fnOk/thFn`; `baibai.mjs` method checks; `inner()` null check |
| z-index inventory | `map/viewer.html` (17 declarations); OSD overlay pins `.mk` z 1 / hover z 3 / cover z 6 |
| Registry access pattern | `map/app/state.mjs` `REG`; events taxonomy swap `events.mjs configure()` |

## Appendix B — Follow-up registration

Once review approves, register the P0–P3 items in `docs/todo.md` §1 (code line) with these
sources; strike them there as they land.
