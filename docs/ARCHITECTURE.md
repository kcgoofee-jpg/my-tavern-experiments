# Architecture — engine, packs and data flow

> Canonical English edition; Chinese edition: `docs/ARCHITECTURE.zh.md` (same heading structure, gated by
> `tools/check_zh_mirror.py`). Rules live in `docs/agent-brief.md`; the plan of record is
> `docs/plans/spatial-os.md`. This file describes what exists **today** and marks what is **planned** with its
> step id (S1, S6, …). Nothing here is a promise beyond the plan.

## 1. Purpose and vocabulary

The repo ships a map layer for SillyTavern / TavernHelper chats. It is being refactored from a single-card tool
into a card-agnostic **engine** plus data **packs**.

- **Engine**: code that knows nothing about any card — `map/core`, `map/app`, `map/tavern`, `map/ui`,
  `map/three`, `map/*.mjs`, `map/viewer.html`, `map/props/viewer3d.html` and the core i18n dictionaries. It carries
  no card-specific names, places, statuses or ranks (brief §2.1; machine-checked, see §9).
- **Pack**: data describing one card's world — a manifest plus the files it points at (`map/packs/<id>/`, and for
  the first pack also `map/data/`). The engine reads packs; it never executes them. Packs today: `eden` (the
  first pack, card names verbatim) and `town` (a fictional example).
- **Host**: the TavernHelper script `map/tavern/eden-map.js` running in the tavern page.
- **Viewer**: `map/viewer.html` running in an iframe inside the host, or standalone.

Four terms name the entity model the plan is building toward (plan §2 and S6). Each is marked with how much of it
exists today.

| Term | Meaning | State today |
|---|---|---|
| **SpatialNode** | One place in the node tree: `{ id, name, alias[], hints[], parent, type, at?, view?, canon }`. The tree is the only geography; matching picks the longest alias and prefers the deeper node. | **Exists (S1–S3).** `core/nodes.mjs` builds and reads the tree; `core/compat-v1.mjs` converts the first packs' v1 files once at load and the pack's `overlay.v2.json` adds what the v1 files never held (districts, outskirts). Every place resolves through it: the current location (`app/here-v2.mjs`), events (`core/event-geo.mjs`), people and trip ends (`app/spot.mjs`), the injected spatial contract (`tavern/spatial.mjs`). The v1 resolver `map/here.mjs` is gone. Schema-2 packs load natively from **S4**. |
| **PresentEntities** | The entities standing at the current node (characters first, later any entity kind), used by the characters tab at micro levels. | **Partly.** `map/chars.mjs` and `tavern/characters.mjs` compute "present" characters from chat tags and MVU variables; where a person is drawn is decided by the node tree (`app/spot.mjs`). The node-based presence list is **planned (S6)**. |
| **WorldRoster** | Every known entity across all sources, merged into one standard row list. | **Exists.** `core/roster.mjs` (`RosterRow`, five sources, priority arbitration). Attribute fields are still fixed slots; the author-defined `entities` field list is **planned (S4)**. |
| **Stash** | Items with a real spatial home (map, marker, hidden compartment), reconciled against what the player already carries. | **Two stores today:** `core/stash.mjs` (world stash from pack data) and the chat-variable inventory (`tavern/inventory.mjs`). The unified `eden_map.stash` store is **planned (S6, decision D4)**. |

## 2. Directory layers and dependency direction

```
map/core      leaf layer: pure logic, imports nothing outside map/core
map/three     three.js helpers          → core (THREE is passed in by the caller, never imported)
map/ui        shared widgets            → core; the two gallery panels import the optional tavern/baibai.mjs bridge
map/app       viewer modules            → core, ui
map/*.mjs     viewer plugins (root)     → app, core, ui; load the shared pure tavern modules on demand
map/tavern    host + pure pipelines     → core (spatial.mjs also builds its places with app/here-v2.mjs, the one engine that places a text)
map/packs, map/data    data only        (JSON; no code)
map/estate, map/props  3D pages + assets → core, three, ui
tools, tests, blender  builders, checks, tests (never shipped to the viewer)
```
Rules that follow:

- **`map/core` points at nothing.** No relative import that leaves `map/core/` (checked by watchdog check 2), and
  no host globals except the registered single owners (`storage.mjs`, `logbuf.mjs`, `room-gallery-db.mjs`).
- **`map/tavern` is the host side.** Only `mvu-bridge.mjs` may touch the `Mvu` / `SillyTavern` globals; the pure
  pipelines (`context`, `msgtext`, `sanitize`, `preset`) touch no host global at all.
- **Viewer plugins meet each other only through `P`.** App modules import shared state explicitly from
  `app/state.mjs` and `app/util.mjs`; root plugins import that same core state and reach one another (and app
  modules that are not guaranteed to be loaded) through the `P` registry in `app/plugins.mjs`; a missing plugin is
  `undefined` and callers guard. The pure `tavern/` modules the viewer needs (`events`, `characters`, `mvu`,
  `picker`, `compose`) are the same files the host uses, loaded with a dynamic `import()` resolved against
  `document.baseURI` so they also work inside `srcdoc`.
- **Packs are data only.** Card names appear verbatim only under `map/packs/**`, `map/data/**` and in builder
  tools under `tools/**`.
- **`map/estate/**`, `map/props/*/**`, `map/vendor/**`, `map/packs/**`, `map/data/**` are not engine source**
  and are never scanned by the ratchet (§9); `map/estate/` is the first pack's 3D page.

## 3. Module map

Every engine file (the watchdog's `ENGINE_GLOBS`) appears exactly once below. 146 files: `map/core` 29,
`map/app` 42, `map/tavern` 43, `map/ui` 9, `map/three` 9, `map/*.mjs` 12, plus `map/viewer.html` and
`map/props/viewer3d.html`. Roles were derived from each file's header comment and code.

### 3.1 map/core

Pure leaf modules. No DOM, no globals (except the three registered owners), no imports from outside `core`.

| Module | Role |
|---|---|
| `budget.mjs` | Graphics memory budget policy: decides the byte budget per device class and whether reported usage means pressure. |
| `clock.mjs` | Zero-token deterministic world clock: world time is computed from turns advanced, never from the model or system time. |
| `depth.mjs` | Depth-system math (JS twin of `blender/depth.py`, golden-file parity): depth from altitude, channel interpolation, clouds above an altitude. |
| `estate3d.mjs` | Estate3D manifest contract: validates and resolves model URLs, data paths and tier fallbacks for the estate and prop 3D pages. |
| `event-geo.mjs` | Where an event happens: its place text placed by `nodes.locate`, the map that draws it, the pin's spot (pure; every tier and district word is pack data); `geo.taxonomy()` carries the pack's events block. |
| `events-default.mjs` | The kernel's neutral event taxonomy (K-R53): what a pack with no events block shows; closing words and injected-line tag defaults. |
| `haze.mjs` | Aerial-perspective filter: turns the haze density of the current depth plane into a filter chain. |
| `layers.mjs` | LayerRegistry core: the 10 viewport slots, layer registration and ordering, visibility, filter chains, `describe()` summary. |
| `ledger.mjs` | Four-domain settlement ledger: validates atomic instructions per domain (assets, NPC, events, depth) and drops anything unverified. |
| `legacy-custom.mjs` | The user's room names of the first versions (<= 0.9.2), read from local storage; folded into the chat variable by `tavern/mvu.mjs`. |
| `listeners.mjs` | ListenerBus: the single registry for global listeners, idempotent per key, `offAll()` and `describe()`. |
| `lod.mjs` | Graphics LOD policy: which detail state a model should be in, hysteresis, and which async loads are still valid. |
| `logbuf.mjs` | Console ring buffer for feedback reports, split into sessions; installs its hooks on first evaluation. |
| `nodes.mjs` | The node tree (kernel contract v2): build, read, `vocabulary`, `locate`, views, positions, scope, levels. |
| `pack.mjs` | Pack interface: manifest validation and resolution, pack id, storage prefix and chat-variable key derivation, registry rebasing. |
| `pickup.mjs` | Objective pickup probe: a written physical acquisition action becomes a single ledger fact. |
| `project.mjs` | Oblique projection (JS twin of `blender/project.py`, golden-file parity): world point to frame coordinates, label rule, anchors. |
| `protocol.mjs` | Message protocol: `SCHEMA` of every host / viewer / sub-page message, envelope, `check` / `accept`, `createBus`. |
| `quests.mjs` | Dynamic clue nodes: aggregates events by place with per-floor decay into deterministic "something is happening here" nodes. |
| `render-gate.mjs` | RenderGate: pauses on-demand render loops when the page is hidden or the viewport invisible. |
| `rng.mjs` | Deterministic pseudo-random generator (mulberry32) shared by particles, traffic and clue nodes. |
| `room-gallery-db.mjs` | IndexedDB wrapper for room gallery images (browser only). |
| `room-gallery-logic.mjs` | Pure gallery logic: resize dimensions, quota checks, export bundle shape. |
| `roster.mjs` | CharacterRosterSystem: five-source roster merged into standard `RosterRow`s with priority arbitration, aliases and portraits. |
| `routine.mjs` | NPC schedule math shared by host and viewer (the host's `tavern/routine.mjs` forwards here). |
| `scrapbook.mjs` | Pinned-image-and-note index logic for landmarks (bytes live in the gallery database). |
| `stash.mjs` | World stash table: where pack-defined items are hidden (map, marker, compartment) and reconciliation against carried items. |
| `stash3d.mjs` | Pure mapping from stash entries to 3D scene positions, fed by the caller's room table. |
| `storage.mjs` | Local storage service: `KEYS` registry, pack-namespaced get / set / json / remove that never throw. |
| `traffic.mjs` | Traffic and light-stream math: normalized route points to a frame of light positions, deterministic. |
| `transit.mjs` | A journey written as a place ("from A to B", "A → B"): its ends and the vehicle; the pure patterns the card script uses. |
| `vision.mjs` | Vision-cone geometry: guard fields of view clipped by wall segments, patrol rings, point-visibility tests. |
| `walk.mjs` | Deterministic clock tick and an N-dimensional interpolating walker (no teleporting; reduced motion snaps). |
| `weather.mjs` | Weather core: preset table, weather from story and clock, particle field and lightning timing. |

### 3.2 map/app

Viewer modules, split out of the former inline script of `viewer.html`. State is imported live from `state.mjs`;
mutable state is written only by its declaring module through `set*()`.

| Module | Role |
|---|---|
| `boot.mjs` | Startup: fetches registry, markers, derived data, dictionary and pack in parallel, builds OpenSeadragon, posts `ready`, failure exits. |
| `bridge.mjs` | Compatibility face: read-only `window` getters for the old global names used by browser probes. |
| `bus.mjs` | Viewer-side listener bus: every `window` / `document` listener is registered here and removed on unload. |
| `cardlinks.mjs` | Links at the bottom of a place card (cross-layer channel, 3D link, gallery entry). |
| `clouds.mjs` | Drifting clouds and the layer-change transition cover. |
| `cvd.mjs` | Colour-vision mode: safe palette, class/attribute switches, broadcast to sub-pages. |
| `depthhaze.mjs` | Closes the depth → haze → `depth-haze` slot / fog canvas loop for the current depth plane. |
| `dzi-worker-src.mjs` | Source string of the tile decode worker (exported as text so a blob worker works inside `srcdoc`). |
| `dzi-worker.mjs` | Viewer-side client of the tile decode worker, with fallback to the stock image path. |
| `estate.mjs` | Estate / 3D sub-page host: blob iframe with `<base>`, failure hook, sub-page messages, generic 3D viewer entry. |
| `extapi.mjs` | Local extension interface `window.EdenMap` and the chat id. |
| `here-v2.mjs` | The current location: `nodes.locate` over the node tree, mapped to the result shape the consumers read (`level`, `map`, `marker`, `room`, `node`, `transit`); also used by `tavern/spatial.mjs` and the builder tools. |
| `feedback-report.mjs` | Pure feedback-report text assembly with a whitelist of fields. |
| `feedback.mjs` | Feedback button: installs the log buffer, previews and copies / downloads the report. |
| `fog.mjs` | Fog exploration overlay: unvisited places dimmed, visits recorded per chat. |
| `fps.mjs` | Debug frame-rate readout and sub-page toggle. |
| `host.mjs` | Host message interface: origin / token checks, protocol validation, dispatch by type. |
| `i18n.mjs` | Language and theme: dictionary, `t` / `tr` / `nm`, `setLang`, `setTheme`. |
| `insets.mjs` | High-resolution inset tiles overlaid when zooming into an inset's area. |
| `layerhost.mjs` | Viewer-side LayerRegistry assembly: registry singleton, `.vpslot` slot containers, `window.TCLayers` summary. |
| `layers.mjs` | Layer navigation: layer switcher strip, up one level, Esc handling, single-key shortcuts. |
| `loadprog.mjs` | Progress of the full-screen loading layer, sharing `ui/progress.mjs`. |
| `locate.mjs` | Initial view and current place: `focusStart`, `markHere`, `hereRes` (over `here-v2.mjs`), `drawnAt`, `jumpHere`. |
| `loot.mjs` | Glowing pickup items on the map from the world stash; a click sends the pickup intent to the host. |
| `markers.mjs` | Markers and place cards: placement, tracking, show / close card, world-map and point-map overlays. |
| `nav.mjs` | Map switching: `go` with registrable wrappers, snapshot, map chrome, alternate base map. |
| `nodes-runtime.mjs` | The viewer's node tree: the loaded registry converted once by `core/compat-v1.mjs`; breadcrumb, up button, warm-up neighbours, estate stand-in and 3D-page test read it (no `parent` walking). |
| `pack.mjs` | The current pack, resolved once at startup (live binding `PACK`, `packData(key)`). |
| `plugins.mjs` | Plugin registry `P`: the only channel between app modules and root plugins. |
| `quests.mjs` | Viewer rendering of dynamic clue nodes as breathing circles. |
| `scale.mjs` | Scale hand-off between the world map and the city layers, plus the surrounding transition ring. |
| `settings.mjs` | Settings overlay: pages, section registration, search, about / update check, self-check. |
| `spot.mjs` | Where a located place is drawn for a person or a trip end (stand-in landmark of a 3D page, landmark, the node's own point, district); pure, the viewer passes what it knows. |
| `shell.mjs` | Shell: control column, the single drawer / right rail glue, notice layer, status dot, one-hand mode, double-click zoom. |
| `state.mjs` | Core viewer state: current map, registry, OSD instance, focus request. |
| `storage-ui.mjs` | Settings "data and mapping" page: local storage usage and current data sources (read only). |
| `th-ui.mjs` | Settings for TavernHelper features: worldbook add-on sync, state injection, macros, injection depth. |
| `tiers.mjs` | Sharpness tiers, data-saver decisions, load progress, overlay and label avoidance. |
| `topbar.mjs` | Top bar layout, background warm-up, version code. |
| `traffic.mjs` | Viewer rendering of light streams on the `fx` slot canvas. |
| `util.mjs` | Constants and helpers: coordinate conversion, `$`, `esc`, `ico`, `post` (protocol version stamp), `getJSON`. |
| `visibility.mjs` | Viewport visibility render throttling: pause switch with reference-counted reasons. |
| `vision.mjs` | Viewer side of vision cones and stealth: draws fields of view, reports the hardest sighting on a move. |
| `wander.mjs` | NPC wandering driven by the deterministic clock and schedule; walkers never teleport. |
| `weather.mjs` | Viewer rendering of weather particles, tint and lightning on the `fx` slot. |

### 3.3 map/tavern

The host side: the entry script, host glue, and pure pipelines that the host and node tests share.

| Module | Role |
|---|---|
| `action.mjs` | Map-driven actions: a clicked point of interest becomes one sentence (off / compose / silent system injection). |
| `adapter.mjs` | Variable mapping: which `stat_data` path holds location, time, date, presence; auto-discovery by field name. |
| `baibai.mjs` | Optional bridge to the external image-generation extension; every function degrades quietly when absent. |
| `budget.mjs` | Local storage budget: LRU per chat, avatar caps, quota-hit recovery; touches only the map's own keys. |
| `characters.mjs` | Character bar: finds characters and their latest place from chat tags and MVU variables. |
| `compose.mjs` | Chat-input templates ("go here", "ask about this"): fill the input box, never send. |
| `context.mjs` | ContextPipeline: message window normalization, round computation, custom tag replay, trips; pure data in and out. |
| `eden-map.js` | Host entry: floating button and panel, viewer state machine, message dispatch, recompute scheduling, cleanup assembly. |
| `edenapi.mjs` | Machine-readable contract of the public `EdenMap` API exposed to the host page. |
| `events.mjs` | Event parsing: reads event tags from chat text, classifies them through the pack's events block (`typeOf`, K-R50), merges (type + node, K-R54) and ages them (pure). |
| `failrep.mjs` | Failed-check report ring: structured reports injected next turn so the story follows objective facts. |
| `follow.mjs` | Follow-branch resolution: newest build of a branch from `head.json` across CDN mirrors. |
| `host-about.mjs` | Version info and update check orchestration, all effects injected. |
| `host-lifecycle.mjs` | Host instance lifecycle: takeover of old instances, panel DOM mount, listener registration, cleanup hooks. |
| `host-routes.mjs` | CDN route table, version inference and route race; pure computation. |
| `host-th.mjs` | TavernHelper adapter: request wrapper, function probing, pack namespace, script-variable preferences, worldbook automation. |
| `inventory.mjs` | Spatial inventory in the chat variable, summarized into one injected line (pure). |
| `keyframes.mjs` | Long-horizon keyframe compression: per-floor state to change-point frames, a droppable cache. |
| `llm.mjs` | Private API key gateway: computes how to call a provider; does no network or storage itself. |
| `modes.mjs` | Script ↔ card interaction modes: compact state injection, tag reconciliation, minimal checkpoint. |
| `msgtext.mjs` | Message text pre-processing: strips reasoning blocks and variable-update blocks before parsing. |
| `mvu-bridge.mjs` | MVUBridge: the only module allowed to touch `Mvu` / `SillyTavern`; snapshots, `getHere` fallbacks, chat variables, roster reads. |
| `mvu.mjs` | Pure readers for MVU data and the map's own custom data (names, outfit, roster, portraits, time). |
| `navigator.mjs` | Background navigator gateway: scheduling, input assembly and response gating for a private-key planner. |
| `ops.mjs` | Restricted operation DSL sandbox: extracts, validates and normalizes atomic operation blocks. |
| `picker.mjs` | Pure helpers for the customization panel: grouped object list, search, fly-to targets. |
| `preset.mjs` | Reads semi-structured status fields written by community presets as location / time / presence fallbacks. |
| `routine.mjs` | Host-side entry that forwards to `core/routine.mjs`. |
| `sanitize.mjs` | Community-preset text sanitizer: strips reasoning / status blocks by tag table (pure). |
| `selfcheck.mjs` | Startup self-check verdicts from facts the host collected (pure). |
| `shujuku.mjs` | Read-only compatibility with the optional table-database extension. |
| `snapshot.mjs` | MVU snapshot selection and generation-state rules. |
| `sources.mjs` | Data source registry: where the host reads chat state from, for settings and `EdenMap.sources()`. |
| `spatial.mjs` | Spatial coordinate contract compiler: current place plus surrounding geometry to a token-budgeted JSON. |
| `splash.mjs` | First-run self-check card with a slow progress bar tied to real preloading. |
| `th.mjs` | Thin TavernHelper wrappers: feature probing, unified external requests, display-only leak fence. |
| `tick.mjs` | Background quiet-derivation scheduler: read-only incremental scans that yield to a live panel or generation. |
| `timeline.mjs` | Timeline replay core: what the map should show at floor N (location, time, who is where). |
| `trips.mjs` | Trip derivation: "A to B" trips from per-floor places and character tags, styled by transport mode. |
| `varsync.mjs` | Variable settlement timing guard: ledger reconciliation writes are queued until after the main update window. |
| `wb_crystallize.mjs` | Story-fact crystallization into the add-on worldbook as keyword-triggered entries. |
| `wb_jit.mjs` | Worldbook just-in-time hydration: only entries relevant to the current place are enabled. |
| `wbsync.mjs` | Worldbook add-on write and auto-sync: touches only our own book and our own marked entries. |

### 3.4 map/ui

Shared widgets, used by the viewer, the host and the 3D pages. Mostly plain scripts that attach to `window`.

| Module | Role |
|---|---|
| `camera-controls.js` | Shared 3D camera helpers: view presets, compass, first-run hint card, idle timer. |
| `chrome3d.js` | 3D viewer chrome (`window.UI3D`) shared by the estate page and the prop viewer. |
| `gallery.js` | Generic room gallery viewer with lazy loading and swipe / key navigation. |
| `icons.js` | The single icon set (`window.UIIcon`): grid, stroke and color rules. |
| `illust-panel.js` | Room illustration panel driving the optional image-generation extension. |
| `notice.mjs` | The single notification layer (P0 blocking, P1 banner, P2 toast). |
| `progress.mjs` | Unified loading-progress component: determinate or elapsed-time, retry. |
| `room-gallery-panel.js` | Room gallery UI: custom names, upload, resize, reorder, export bundle. |
| `sheet.js` | The single bottom sheet / desktop right rail (`window.UISheet`). |

### 3.5 map/three

Runtime helpers for the 3D pages. A pure leaf: THREE is passed in by the caller, so these run in node tests with a
fake THREE.

| Module | Role |
|---|---|
| `ctx.mjs` | Shared 3D render-context factory: pixel ratio caps, context loss and restore, real dispose. |
| `culling.mjs` | Frustum culling and bounding volumes for static matrices and instanced meshes. |
| `daynight.mjs` | Dynamic day / night: world clock to four-period lighting, fog and emissive parameters with smoothing. |
| `instancing.mjs` | GPU instancing of static meshes with an instance-to-mesh index map. |
| `lod.mjs` | Dynamic LOD controller applying `core/lod.mjs` decisions to a three scene. |
| `particles.mjs` | `fx` slot particle renderer (weather, aurora): one draw call per effect, descriptors registered by the caller. |
| `relief.mjs` | 2.5D relief material (normal, parallax, roughness) lit by the day / night state. |
| `shaders.mjs` | GLSL fragment library for particles, aurora and relief normals. |
| `texres.mjs` | Texture resources: compressed-texture capability probing, KTX2 attachment, budget inputs. |

### 3.6 map/*.mjs (root)

Viewer plugins, loaded as separate module scripts by `viewer.html` so a failing plugin never blocks the viewer.
They import core state from `app/*` and reach each other only through `app/plugins.mjs`.

| Module | Role |
|---|---|
| `chars.mjs` | Character tab and map avatars: placement, grouped stacks, per-person toggles, fly-to. |
| `compose.mjs` | Place / event / character card buttons that send template sentences to the host input box (embedded only). |
| `custom.mjs` | MVU-linked viewer part: custom names and uses, night tint from world time, outfit line, rename hints. |
| `events.mjs` | Event layer: placement, icons, event list, fly-to, screen effects, world-map badges. |
| `inv.mjs` | Spatial inventory on place cards (viewer side of the inventory). |
| `scrapbook.mjs` | Viewer side of the landmark scrapbook: pinned images and notes on place cards. |
| `security.mjs` | Optional security overlay: shield chips on places and a rules row on cards. |
| `trips.mjs` | Trip layer: draws recent trips and in-transit arcs by transport mode. |
| `unmapped.mjs` | Unmapped places: small picker to assign an unrecognized place name to a node, marker or ignore it. |
| `varmap.mjs` | Settings "variable mapping" page (embedded only). |
| `wbpeek.mjs` | Worldbook peek capsule on place cards (read only). |

### 3.7 Pages

| File | Role |
|---|---|
| `map/viewer.html` | The viewer page: markup, inline tokens and the `--zu-*` / `--zv-*` ladders, preloads, startup scripts, plugin script tags. |
| `map/props/viewer3d.html` | The generic 3D viewer (`?model=<id>`): loads `<id>/manifest.json` through `core/estate3d.mjs`, baked lighting, no runtime lights. |

## 4. Data flow host → viewer

One direction, end to end (brief §2.3):

```
Mvu / SillyTavern globals
        │  (only tavern/mvu-bridge.mjs touches them)
        ▼
MVUBridge ─────────► ContextPipeline (tavern/context.mjs; msgtext / sanitize / preset feed it)
                        │  pure data in / out: message window, round, roster, tags, trips
                        ▼
        ledger (core/ledger.mjs) + varsync (tavern/varsync.mjs)
                        │  settlement checks; writes queued until after the main update window
                        ▼
host recompute (tavern/eden-map.js) ──► protocol SCHEMA (core/protocol.mjs) ──► postMessage
                        ▼
viewer modules (app/*, root plugins) ──► LayerRegistry slots (core/layers.mjs + app/layerhost.mjs)
```

- **The host reads, the viewer draws.** `eden-map.js` schedules a recompute when variables or floors change,
  calls the pipelines, and pushes results with typed messages. The viewer sends intents up (pickup, compose,
  explore, settings) and never writes host state.
- **The chat log is the only truth** (brief §2.4): every derived value (events, characters, trips, keyframes) can
  be recomputed from the chat floors; caches are droppable. The map's own state lives in the pack's chat variable
  (`eden_map` for eden), never in the card's `stat_data`.
- **Protocol** (`core/protocol.mjs`): every message is an envelope `{ type, v, … }` checked against `SCHEMA` by
  `check` / `accept`. Each entry carries a direction tag: `H2V` host → viewer, `V2H` viewer → host, `V2S` viewer →
  sub-page (estate / 3D), `S2V` sub-page → viewer, plus `both` for a few relay messages. Unknown types from a
  newer protocol version are dropped silently; older or same-version unknowns are dropped with one warning. The
  filter checks shape only and never inspects text content.
- **Transport**: the host mounts the viewer as a `srcdoc` iframe whose `<base>` points at the CDN, and sub-pages
  as blob iframes. `createBus` wraps one window-to-peer channel with origin / token checks.
- **Host modules** (`host-routes`, `host-lifecycle`, `host-th`, `host-about`) hold the glue that used to live in
  `eden-map.js`; the entry keeps scheduling, side effects and cleanup assembly.

## 5. Entity protocol — target vs current state

**Current (exists).**

- **Roster**: `core/roster.mjs` merges five sources — MVU variables, chat tags, table database, fallback roster,
  image library — into standard `RosterRow`s (`name, role, location, status, tags, source, present`), highest
  priority wins per field, aliases recognized, portraits attached. `describe()` returns counts for probes.
- **Current place**: `app/here-v2.mjs` places the chat location with `nodes.locate` over the node tree; the result keeps
  the six-level shape the viewer reads (room, zone, landmark, layer, group, world place) and carries the node.
- **Every place resolves through nodes** (S3): the current location (`app/here-v2.mjs`), people and trip ends
  (`app/spot.mjs`), events (`core/event-geo.mjs`, `tavern/events.mjs` `setGeo`), the injected spatial contract
  (`tavern/spatial.mjs`) and item places (a stash row names a landmark node; a hidden row shows where the current
  location places the player). Nothing matches a place by a registry `kind` or by a label any more.
- **Events / characters / trips**: parsed from chat tags and MVU by `tavern/events.mjs`, `characters.mjs`,
  `trips.mjs`; an event's type, group, icon, colour, effect and default-off come from the pack's events block (S4-1, K-R68); a pack without one gets the kernel's neutral taxonomy.
- **Items**: `core/stash.mjs` (pack-defined world stash) and `tavern/inventory.mjs` (chat-variable inventory),
  reconciled by item id; ledger discipline (`core/ledger.mjs`) governs what may be written.

**Target (planned, by step).**

- ~~**Node tree** `SpatialNode` as the only geography: contract in **S1** (`core/nodes.mjs`, `core/compat-v1.mjs`,
  `docs/kernel-schema.md`), consumers migrate in **S2**, location / event / character / item resolution unify in
  **S3** with an old-vs-new parity test.~~ ✅ S1–S3 (2026-10-01).
- **Author-defined entities**: `vars` and `entities` (groups plus attribute field list) replace fixed slots in **S4**.
- **Entity protocol and drawer**: tab registry, presence by node, unified `eden_map.stash` with automatic migration
  of the old `仓库` / `槽位` keys, an Items tab, per-pack pickup vocabulary — **S6**.

The node tree is built from the v1 files at load until packs carry schema 2 (**S4**); code reads places through the tree and never assumes a pack ships one itself.

## 6. Pack boundary

**Manifest v1 (frozen, schema `1`)** — `map/packs/<id>/manifest.json`, described in `docs/pack-schema-v1.md`,
validated at run time by `core/pack.mjs validate()` and fully by `tools/check_pack.py`:

- required: `id`, `schema` (= 1), `title`, `data.maps`;
- optional: `title_en`, `chat.var`, `data.*` (world, derived, rooms, events, worldbook, security, roster, stash,
  routine — relative paths only, or `builtin` for events), `preload`, `vars`, `cdn.repo` / `cdn.npm`,
  `theme.accent`, `features`, `strings`, `worldbook.addon`;
- keys starting with `_` are comments and ignored. Paths are relative to the manifest's directory (eden is the one
  exception: relative to `map/`). No `scheme:`, leading `/`, `..` or backslash.

**What a pack can declare now**: which data files exist, the chat-variable key, the CDN repo, an accent colour,
feature switches and string overrides. Everything else — geography, event categories, roster fields, layers — is
still code or fixed data shape.

**Manifest v2 (planned, S1)**: `id` / `schema: 2` / `title` required; optional `lang`, `match`; `nodes`, `views`,
`vars`, `entities`, `items`, `events`, `layers`, `ui`, `llm` sections with automatic degradation when absent
(plan §2). `core/compat-v1.mjs` converts v1 packs in memory, so eden and town run unchanged; a minimal pack
(`map/packs/minimal/`, 5 nodes, no base map) pins the zero-config path. Schema v1 stays frozen.

**Trust boundary**: a manifest is pure data. The engine never executes pack scripts and never filters user chat.

## 7. Storage and namespaces

- **Local storage** is one service, `core/storage.mjs`. `KEYS` is the single registry of every key (owner, scope,
  default, `prefix` / `perChat` flags); `tests/storage.test.mjs` fails on any key used in the repo but not
  registered. `get` / `set` / `json` / `remove` never throw (private mode, quota, disabled storage).
- **Pack namespace**: registered keys are written as `edenMap*`. `core/pack.mjs nsKey` maps them to the active
  pack: eden keeps `edenMap*` (old users' keys stay readable), any other pack uses `tcp.<id>.*`.
- **Chat variable per pack**: the map's own state lives in one top-level chat variable — `eden_map` for eden,
  `tc_<id>` (or manifest `chat.var`) for others. It holds custom names, trips, keyframes, inventory, exploration.
  The card's own `stat_data` is never written (its schema rejects unknown keys); only our add-on worldbook and
  entries marked `extra.eden_id` are ever written.
- **Script variable**: user preferences listed in `SCRIPT_KEYS` are mirrored into the TavernHelper script variable
  `eden_prefs` so they survive a browser-storage wipe.
- **Per-chat data and budget**: per-chat keys are LRU-ranked and capped by `tavern/budget.mjs`; it touches only
  keys starting with the map's prefix. Images live in IndexedDB (`core/room-gallery-db.mjs`), never in the chat.
- **Names kept until S10**: the `edenMap*` / `eden_map` / `EdenMap` / `window.TC*` names are external contracts.
  They are renamed only at S10, with a migration and a re-confirmation (decisions D5, D12).

## 8. Rendering stack

- **Base maps**: OpenSeadragon (`map/vendor/openseadragon`) over DZI tile pyramids in `map/art/`. Tile decoding can
  run in a blob worker (`app/dzi-worker*.mjs`) with fallback to the stock path.
- **LayerRegistry** (`core/layers.mjs`, assembled by `app/layerhost.mjs`): ten slots, bottom to top —
  `base`, `depth-haze`, `fog`, `routes`, `trips`, `events`, `markers`, `labels`, `fx`, `interaction`. A slot's z
  value is `(index + 1) × 10`. Layers register `{ id, slot, kind, order, mount, unmount, … }`; filter chains
  (`css` / `canvas`) stack per layer. `window.TCLayers` exposes the standard summary.
- **Two z-index ladders** in `viewer.html`: `--zv-*` custom properties mirror the slot values (inside the OSD
  overlay stacking context, checked against `SLOTS` by a test); `--zu-*` is the outer fixed-UI ladder (header,
  popovers, settings, control column, estate iframe, cover) that always sits above the slots. Bare numeric
  z-index is forbidden outside the tokens (watchdog check 3).
- **`map/three` runtime**: pure leaf helpers (context factory, culling, instancing, LOD, day / night, particles,
  relief, shaders, texture resources). THREE is injected by the caller.
- **Estate page**: `map/estate/` (`index.html`, `main.js`) is the first pack's 3D page, loaded by `app/estate.mjs`
  into a blob iframe. Its models come from `map/estate/model/manifest.json` through `core/estate3d.mjs`; the
  generic viewer `map/props/viewer3d.html?model=<id>` serves each landmark's `manifest.json`. Both use baked
  lighting and the shared chrome in `map/ui`.
- **Fx and day / night**: weather and aurora render into the `fx` slot; the world clock (`core/clock.mjs`) drives
  `three/daynight.mjs` and the viewer's night tint. Nothing reads system time.

## 9. Guards

`bash tools/smoke.sh` is the gate; CI runs it with `node --test tests/*.test.mjs`. What protects what:

| Guard | Protects |
|---|---|
| `check_maps.py`, `check_pack.py` | Map registry / marker / tile consistency; pack manifests against the schema. |
| `check_architecture.py` | The six watchdog checks below plus the ratchet ledger. |
| `test_architecture_gate.py` | Proves the watchdog bites (violations caught, allowed forms pass, scan surface not empty). |
| `check_tree_hygiene.py`, empty-file guard | No large untracked files, no zero-byte tracked sources. |
| `test_depth.py`, `test_project.py` | Python ↔ golden-file parity for depth and projection (JS side in `node --test`). |
| `check_version.py`, `sync_tokens.py --check`, `check_ascii.py` | Version consistency, token inlining, ASCII machine identifiers. |
| `check_doc_language.py`, `check_zh_mirror.py` | New docs are English; each English doc and its `*.zh.md` share a heading structure. |
| `check_readme.py`, render guard lint / tests | README import link and paths; render scripts configure the GPU correctly. |
| `node --test tests/*.test.mjs` | Unit and contract tests, including source-scan tests (`mvu_bridge`, `storage`, `layer_registry`). |
| `node --check`, JSON parse | Every shipped script and data / i18n file parses. |

**The six watchdog checks** (`tools/check_architecture.py`):

1. **Lines** — every engine file ≤ 400 physical lines.
2. **Layering** — `map/core` has no parent-directory import; core and the pure pipelines touch no host global
   except the registered owners.
3. **z-index** — no bare numeric z-index, including the `zIndex: <n>` object-literal form.
4. **Card terms** — no card-specific words (roster names, place and setting words, internal ids) in engine code or
   in the i18n dictionary values.
5. **Citations** — no paper names, venues, arXiv or DOI in `map/**` or `tests/**` source.
6. **Inline appearance styles** — no `.style.<prop> =`, `cssText` or `style="…"` for appearance; geometry
   properties and `style.setProperty('--…')` are the allowed channels.

**The ratchet**: checks 1, 3, 4 and 6 are counted per file against `tools/arch_baseline.json`. Existing offenders
are recorded once by the tool, and a count may only go down — a new offender, or a recorded file that grows, fails.
`map/core` can never be in the baseline (hard zero). `--update-baseline` lowers entries and refuses to raise any
number or add a file; `--init-baseline` only runs when the file does not exist. Never hand-edit the baseline.
Scan scope is `ENGINE_GLOBS`; `map/vendor`, `map/estate`, `map/props/*/**`, `map/packs`, `map/data`, prototypes,
`tests` and `tools` are never scanned.

## 10. Where to change what

- **Add a layer** — register a `{ id, slot, kind, … }` descriptor with the registry from a module under `map/app/`
  (see `app/fog.mjs`, `app/weather.mjs`); use only slots in `SLOTS`; take z values from the `--zv-*` tokens, never
  a bare number; add menu / visibility wiring through the registry. Declarative author-defined layers are planned
  (S8).
- **Add a protocol message** — add the entry with its direction tag to `SCHEMA` in `core/protocol.mjs`; send with
  `envelope` / `post`, receive through `accept`; add a case to `tests/protocol.test.mjs`; if a sub-page consumes
  it, handle it in `app/estate.mjs` and the page.
- **Add a storage key** — register it in `KEYS` in `core/storage.mjs` (owner, scope, default); read and write only
  through that module; default new toggles to off; add a per-chat flag when it is chat-scoped so budget cleaning
  sees it.
- **Add a settings toggle** — storage key as above; protocol field in `SCHEMA` if the host must know; UI in
  `app/settings.mjs` (or a section registered through `TCSettings.registerSection`); strings in both
  `map/i18n/zh.json` and `en.json`, neutral wording.
- **Add a pack field** — v1 is frozen: only new **optional** fields, documented in `docs/pack-schema-v1.md`, defined
  in `map/data/schema/pack.schema.json`, covered in `tests/pack_schema_v1.test.mjs`. Anything that changes the
  meaning of an existing field waits for schema 2 (S1).
- **Add a viewer module** — a file under `map/app/` (or a root plugin registered through `app/plugins.mjs`); state
  through `app/state.mjs`; listeners through the bus; keep it ≤ 400 lines and free of card terms, or the
  watchdog fails.
- **Lower the ledger** — fix the offender, run `python3 tools/check_architecture.py --update-baseline`, commit the
  new baseline with the fix.

## 11. Pipeline overview

The whole path from source data to the running viewer, in one picture (moved here from the README, 2026-10-01). Section 4 has the runtime data flow in detail.

```
┌──────────────── Offline production (builder machine) ────────────────┐
│ Sources: OSM road network / NYC 3D buildings / setting documents      │
│   → Blender Cycles (blender/*.py, GPU)                                │
│   → 8K base image → tools/make_dzi.py → DZI tiles (map/art/)          │
│   → map/data/*.json (markers, outlines, routes, room polygons)        │
└──────────────────────────────┬────────────────────────────────────────┘
                               │ git tag / commit SHA
                               ▼
              jsDelivr (gh / npm lines) · warm-up: tools/warm_cdn.sh
                               │
┌──────────────────────────────▼──────── Runtime (inside the tavern) ──┐
│ Host script map/tavern/eden-map.js (TavernHelper)                     │
│   · floating button + panel in the host page, viewer via srcdoc/blob  │
│   · current place: MVU variables → map/app/here-v2.mjs (node tree)    │
│   · events: floor text → map/tavern/events.mjs → placement / banner   │
│   · situation injection: injectPrompts (in_chat, depth 4)             │
│ Viewer map/viewer.html (OpenSeadragon 5, canvas)                      │
│   · map registry map/data/maps.json · tokens map/ui/tokens.css        │
│   · overlays: markers / events / island outlines / routes             │
│   · estate: iframe, postMessage protocol estate:*                     │
│   · local extension: window.EdenMap (local only, no network)          │
└───────────────────────────────────────────────────────────────────────┘
```
