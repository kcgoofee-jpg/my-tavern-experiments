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
| **SpatialNode** | One place in the node tree: `{ id, name, alias[], hints[], parent, type, at?, view?, canon }`. The tree is the only geography; matching picks the longest alias and prefers the deeper node. | **Exists (S1–S3).** `core/nodes.mjs` builds and reads the tree; `core/compat-v1.mjs` converts the first packs' v1 files once at load and the pack's `overlay.v2.json` adds what the v1 files never held (districts, outskirts). Every place resolves through it: the current location (`app/place-resolver.mjs`), events (`core/event-geo.mjs`), people and trip ends (`app/spot.mjs`), the injected spatial contract (`tavern/spatial-contract.mjs`). The v1 resolver `map/here.mjs` is gone. Schema-2 packs run through the kernel pipelines (`core/pack-v2.mjs`) and open in the viewer through an in-memory projection to the registry shape (`core/pack-v2-view.mjs`, **S9-1**, K-R96). |
| **PresentEntities** | The entities standing at the current node (characters first, later any entity kind), used by the characters tab to group the present people by level. | **Exists (S6-1).** `core/entities.mjs` (`presentAt`, `peopleSections`, `levelMode`) over entities built from the rows `map/characters-view.mjs` already gets (computed by `tavern/characters-parse.mjs` from chat tags and MVU variables); where a person is drawn is decided by the node tree (`app/spot.mjs`). |
| **WorldRoster** | Every known entity across all sources, merged into one standard row list. | **Exists.** `core/roster.mjs` (`RosterRow`, five sources, priority arbitration). Attribute fields are still fixed slots; the author-defined `entities` field list is **planned (S4)**. |
| **Stash** | Items with a real spatial home (map, marker, hidden compartment), reconciled against what the player already carries. | **Exists (S6-2): one store `<chat var>.stash`** (`tavern/stash-store.mjs`, recomputable from the chat by `tavern/stash-recompute.mjs`; the v1 keys migrate and stay read only until S10), next to the world stash from pack data (`core/stash.mjs`). The Items tab (`stash-view.mjs`, K-R76) lists four groups (carried, here, elsewhere, in card) from `core/entities.mjs` `itemGroups`; pickup sentences, strict verbs and the never-forms are `core/pickup.mjs` (K-R77). |

## 2. Directory layers and dependency direction

```
map/core      leaf layer: pure logic, imports nothing outside map/core
map/three     three.js helpers          → core (THREE is passed in by the caller, never imported)
map/ui        shared widgets            → core; the two gallery panels import the optional tavern/imagegen-bridge.mjs bridge
map/app       viewer modules            → core, ui
map/*.mjs     viewer plugins (root)     → app, core, ui; load the shared pure tavern modules on demand
map/tavern    host + pure pipelines     → core (spatial-contract.mjs also builds its places with app/place-resolver.mjs, the one engine that places a text)
map/packs, map/data    data only        (JSON; no code)
map/estate, map/props  3D pages + assets → core, three, ui
tools, tests, blender  builders, checks, tests (never shipped to the viewer)
```
Rules that follow:

- **`map/core` points at nothing.** No relative import that leaves `map/core/` (checked by watchdog check 2), and
  no host globals except the registered single owners (`storage.mjs`, `logbuf.mjs`, `room-gallery-db.mjs`).
- **`map/tavern` is the host side.** Only `mvu-bridge.mjs` may touch the `Mvu` / `SillyTavern` globals; the pure
  pipelines (`context`, `msgtext`, `sanitize`, `preset`) touch no host global at all.
- **Viewer plugins meet each other only through `plugins`.** App modules import shared state explicitly from
  `app/state.mjs` and the small helper modules beside it (`dom-helpers.mjs`, `protocol-stamp.mjs`, `text-lookup.mjs`, …); root plugins import that same core state and reach one another (and app
  modules that are not guaranteed to be loaded) through the `plugins` registry in `app/plugins.mjs`; a missing plugin is
  `undefined` and callers guard. The pure `tavern/` modules the viewer needs (`events-parse`, `characters-parse`,
  `mvu-readers`, `picker`, `compose-templates`) are the same files the host uses, loaded with a dynamic `import()` resolved against
  `document.baseURI` so they also work inside `srcdoc`.
- **Packs are data only.** Card names appear verbatim only under `map/packs/**`, `map/data/**` and in builder
  tools under `tools/**`.
- **`map/estate/**`, `map/props/*/**`, `map/vendor/**`, `map/packs/**`, `map/data/**` are not engine source**
  and are never scanned by the ratchet (§9); `map/estate/` is the first pack's 3D page.

## 3. Module map

Every engine file (the watchdog's `ENGINE_GLOBS`) appears exactly once below. 264 files: `map/core` 79,
`map/app` 81, `map/tavern` 67, `map/ui` 8, `map/three` 10, `map/*.mjs` 17, plus `map/viewer.html` and
`map/props/viewer3d.html`. Roles were derived from each file's header comment and code.

### 3.1 map/core

Pure leaf modules. No DOM, no globals (except the three registered owners), no imports from outside `core`.

| Module | Role |
|---|---|
| `ambience.mjs` | Procedural ambience (K-R89, Q-01): recipes of filtered noise and harmonic oscillators, scene rules over `{ map, layer, place, weather, night }`, the mixing plan. Pure; its data comes from a `sound` layer. |
| `applies-hint.mjs` | Plain-words reason a layer does not apply here (S7-2, `docs/ui-refactor.md` 4): `appliesHint(applies, ctx, names)` names the failing keys of `applies` (at most two), `data` alone gives null (the row is hidden); no id or path reaches the screen. |
| `base-frame.mjs` | Where a map's base image sits (N10-P0): `baseFrame(extent)` is always one world unit wide from the origin, and `aspectDrift` compares the view's shape with a DZI's pixel shape, so a period variant with more pixels never changes the placement. Pure. |
| `card-read.mjs` | Runtime card reading (K-R93, K-R94, K-R95): place candidates from worldbook titles, language, start view, the variable shape, and the automatic pack derived from a plain card source; the fingerprint. Pure. |
| `clock.mjs` | Zero-token deterministic world clock: world time is computed from turns advanced, never from the model or system time. |
| `compat-v1-blocks.mjs` | v1 side inputs → v2 blocks: events, roster, stash, worldbook, legacy names, ui strings, the user's custom names. |
| `compat-v1-geo.mjs` | v1 map registry → v2 nodes (declaration order, plus the id map and word tables the other compat files read). |
| `compat-v1-views.mjs` | v1 maps → v2 views: a tiles view per world / points map, a model3d view per 3D landmark page, one for the estate page. |
| `compat-v1.mjs` | Schema 1 → schema 2 in memory: a loaded v1 pack (manifest and data files) becomes a schema-2 pack with inline blocks. Pure; nothing is fetched or written. Assembled from the three `compat-v1-*` files. |
| `crumb-menu.mjs` | What the breadcrumb switcher offers: sibling levels and child 3D pages of the open map, arrow-key stepping. Pure. |
| `custom-book.mjs` | The chat's custom world book: one constant index of name pairs plus one keyword entry per place with text (bodies from `entryText`). |
| `custom-record.mjs` | The player's fields on one place (K-R135): description, facts, base fingerprints, floor, bounded undo, restore, key migration; laid over a record field by field. |
| `depth.mjs` | Depth-system math (JS twin of `blender/depth.py`, golden-file parity): depth from altitude, channel interpolation, clouds above an altitude; `describe` reads the exploration ledger. |
| `drawer-tabs.mjs` | Drawer tab rules (K-R72): the kernel tab set, `tabOrder(ui.tabs)`, and the one show / hide / fallback sequence on a drawer-like object (pure). |
| `entities.mjs` | Entity protocol (K-R71, K-R73): `personOf` / `eventOf` adapters, `presentAt`, the level of the open view (`levelMode`) and the present group's sections (`peopleSections`) (pure). |
| `estate-people.mjs` | The people a 3D building shows (S7-3): rows + rooms + node resolution -> the `estate:people` list (avatar filter, at most 30, same people as the 2D tab). Pure. |
| `event-geo.mjs` | Where an event happens: its place text placed by `nodes.locate`, the map that draws it, the pin's spot (pure; every tier and district word is pack data); `geo.taxonomy()` carries the pack's events block. |
| `events-default.mjs` | The kernel's neutral event taxonomy (K-R53): what a pack with no events block shows; closing words and injected-line tag defaults. |
| `exploration-ledger.mjs` | Exploration ledger (fog of visited places): `norm` / `visit` / `known` / `count` over `{ mapId: [placeNames] }`, shared by the host and the viewer. |
| `gallery-scenes.mjs` | The chat's tagged scenes of a pack-declared media source (K-R106): tags resolved to floor, place, character and address, "scenes here" by node, one person's timeline, the person card's category rows; recomputed each time, stores nothing. |
| `gallery-spec.mjs` | A pack-declared media source (K-R106): checks the declaration, compiles the tag grammar slots (name / category from a declared list / number with a digit limit) into a scanner without a regex, reads the card script's picture table at run time, resolves a tag number to an address, and checks every address against the pack's avatar hosts. |
| `graphics-budget.mjs` | Graphics memory budget policy: decides the byte budget per device class and whether reported usage means pressure. |
| `grow.mjs` | Growing nodes from chat (K-R26): place texts become `g_` nodes under the tree; recompute from nothing. Pure. |
| `haze.mjs` | Aerial-perspective filter: turns the haze density of the current depth plane into a filter chain. |
| `kind-palette.mjs` | The generated colours of room kinds a 3D manifest does not declare (K-R131): eight colour-vision-safe colours picked by a stable hash of the kind id. Pure. |
| `label-tiers.mjs` | Map label tiers (S7-2, `docs/ui-refactor.md` 2.6): `labelCaps(narrow)` and `tierOf(n, caps)`: the n-th placed label is L1 up to 12 (6 on phones), L2 up to 30 (15), then hidden. |
| `layer-defaults.mjs` | The kernel's own layers as declarations (K-R79): slot, kind, order, menu row and drawing block of the 17 viewport layers in one frozen list; `kernelDecl(id)`. Pure. |
| `layer-geometry.mjs` | Declared layers, pure geometry and style (K-R80): the route paths of the `line` block (compared with a frozen copy of the old loop), converters from the view data to features, the resolved style of a feature, legend swatches, flow tables, the first-visibility rule. Pure. |
| `layer-registry.mjs` | LayerRegistry core: the 10 viewport slots, layer registration and ordering, visibility, filter chains, `patch` / `applicable` (K-R79, K-R82), `describe()` summary. |
| `layer-spec.mjs` | Declared layers (K-R79, K-R81, K-R82): source parsing, feature and layer normalisation, merge of a pack's `layers` rows with the kernel list, the `applies` evaluator, the `validate2` spec of the block. Pure. |
| `layer-values.mjs` | Host-fed layer values (K-R86): `capValue` (4 KB / 200 items, marked `…truncated`) and `pickValues` over a stat snapshot. Pure. |
| `ledger.mjs` | Four-domain settlement ledger: validates atomic instructions per domain (assets, NPC, events, depth) and drops anything unverified. |
| `legacy-custom.mjs` | The user's room names of the first versions (<= 0.9.2), read from local storage; folded into the chat variable by `tavern/mvu-readers.mjs`. |
| `lexicon.mjs` | Text primitives and kernel word lists of contract v2: normalise, code-point length, cut, FNV hash, articles, journey patterns. Pure and self-contained. |
| `listeners.mjs` | ListenerBus: the single registry for global listeners, idempotent per key, `offAll()` and `describe()`. |
| `locate.mjs` | Vocabulary and locate for contract v2: one algorithm places every text that names a place (longest alias, deeper node preferred) over the tree from `nodes.mjs`. |
| `locked-strings.mjs` | The texts a pack may not override (AI advisor consent, health reasons, cost lines, disclaimer): `isLocked`, `ignoredKeys` and the dictionary `lookup` the viewer uses. Pure. |
| `lod.mjs` | Graphics LOD policy: which detail state a model should be in, hysteresis, and which async loads are still valid. |
| `logbuf.mjs` | Console ring buffer for feedback reports, split into sessions; installs its hooks on first evaluation. |
| `nodes.mjs` | The node tree (kernel contract v2): build, read, `vocabulary`, `locate`, views, positions, scope, levels. |
| `overlay-v2.mjs` | The v2 overlay of a schema-1 pack (`overlay.v2.json`): merged by node id after `compat-v1`; lenient (a bad entry is skipped and listed in `problems`). |
| `pack-draft.mjs` | The edit draft (K-R100): its shape, applying it over a pack with the K-R67 overlay merge, and the overlay text of a shipped pack's draft (K-R98). Pure. |
| `pack-export.mjs` | Export as pack (K-R98): grown nodes, the user's names and card credits folded in, canonical order, size limits. Pure. |
| `pack-index.mjs` | The shipped pack index and the match score (K-R92). Pure. |
| `pack-media.mjs` | Pack pictures (K-R101): the three allowed sources (path, data URL up to 3 MB, https), `checkMedia`, `mediaUrl`, `nodePictures`. Pure. |
| `pack-store-db.mjs` | Browser store of imported packs (IndexedDB `edenMapPacks`, key = card key; K-R99). Every call is wrapped. |
| `pack-v2-rows.mjs` | Run-time readers of a v2 pack's blocks: event types, attribute values, roster rows, world stash rows (re-exported by `pack-v2.mjs`). |
| `pack-v2-spec.mjs` | Field specs of the v2 blocks, mirroring `map/data/schema/v2/*.schema.json`, healing each item. |
| `pack-v2-view.mjs` | Opening a schema-2 pack in the viewer (K-R96): implicit schematic views and the projection to the viewer registry (maps, markers, virtual point files). Pure. |
| `pack-v2.mjs` | Schema-2 packs: validation with per-item healing, trust and limits, block resolution, defaults. |
| `pack.mjs` | Pack interface: manifest validation and resolution, pack id, storage prefix and chat-variable key derivation, registry rebasing. |
| `parked.mjs` | Parked features (INV-2): the five feature ids that are off by default and hidden from Settings and the layer menu until `edenMapOn:<id>` holds an explicit `'1'` (`parkedOn`). Nothing is deleted. |
| `people.mjs` | The people page's sections from the pack's entity groups (S4-4): `groupList`, `groupLabel` (dictionary / pack string `ch.g_<id>`, else the group's own label), `paneModel`; pure. |
| `period-pick.mjs` | Which period base a map shows (K-R39, I-24): the current band's variant, else the nearest registered band by band order. |
| `periods.mjs` | Periods of the day (K-R39): the band a world clock is in, by period words, else by the hour; default bands. |
| `pickup.mjs` | Objective pickup probe (K-R77): a written physical acquisition action becomes a single ledger fact; normal and strict verb classes, forms that never count, the pack vocabulary (`scan(text, { vocab })`). |
| `place-record.mjs` | One record per place (PLACE-1a, K-R134): `records`, `placeRecord`, `chainOf`, `nearby`, `entryText` (the one source of a world-book entry body), `floorIndex` (floor mates for the entry switch). Computed from the pack's files, never stored. |
| `portrait-lookup.mjs` | The card-script portrait of a person (I-22): the viewer-side address shape check (the pack's host rule already ran in the host) and the lookup by full name, first segment or the one table key with the same first segment. |
| `profile.mjs` | The run-time profile of a pack's variables and roster (K-R37–K-R44, K-R69): variable paths, period bands, tables, roster slots, portrait rules (`portraitOk`); the kernel profile of a pack that names nothing. |
| `profiles.mjs` | Settings profiles (PROFILE-1, D34), pure: which keys are preferences, the built-in recommended and lean profiles, snapshot / plan / import validation. |
| `project.mjs` | Oblique projection (JS twin of `blender/project.py`, golden-file parity): world point to frame coordinates, label rule, anchors. |
| `prop-pack.mjs` | The local prop pack's rules (K-R88): `sniff` (glb / png / webp / svg from the bytes), `checkProp` (size and svg refusals), `propId`, `normPlacement`. Pure. |
| `protocol.mjs` | Message protocol: `SCHEMA` of every host / viewer / sub-page message, envelope, `check` / `accept`, `createBus`. |
| `quests.mjs` | Dynamic clue nodes: aggregates events by place with per-floor decay into deterministic "something is happening here" nodes. |
| `render-gate.mjs` | RenderGate: pauses on-demand render loops when the page is hidden or the viewport invisible. |
| `rng.mjs` | Deterministic pseudo-random generator (mulberry32) shared by particles, traffic and clue nodes. |
| `room-gallery-db.mjs` | IndexedDB wrapper for room gallery images (browser only). |
| `room-gallery-logic.mjs` | Pure gallery logic: resize dimensions, quota checks, picture records (`private` / `pack`), the source guard for gallery files. |
| `roster.mjs` | CharacterRosterSystem: five-source roster merged into standard `RosterRow`s with priority arbitration, aliases and portraits. |
| `router.mjs` | The transit router (K-R109): graph of a transit block, attaching a place (at / inside / within / walk), cheapest plan (minutes, then changes, stops, declaration order), `checkPlan`, `planText`, `routeOp`. Pure. |
| `routine.mjs` | NPC schedule math shared by host and viewer. |
| `scene-header.mjs` | Scene header (K-R105): reads a floor's `<tag>place·date·time</tag>` block without a regex and decides one floor's place: this floor's variable patch, then the header place when it resolves, then the carried variable. |
| `scene3d-manifest.mjs` | Estate3D manifest contract: validates and resolves model URLs, data paths and tier fallbacks for the estate and prop 3D pages. |
| `schematic.mjs` | Schematic layout (`tree`, `list`, `grid`, `radial`) and the generated picture of lines and dots, as an SVG data URL (K-R97). Pure. |
| `scrapbook.mjs` | Pinned-image-and-note index logic for landmarks (bytes live in the gallery database). |
| `settlement-record.mjs` | The map's own settlement record for the npc and events domains (K-R78): `recordNorm`, `recordPut` (holes only), `recordLanded`, `describeRecord`; pure. |
| `stash.mjs` | World stash table: where pack-defined items are hidden (map, marker, compartment) and reconciliation against carried items. |
| `stash3d.mjs` | Pure mapping from stash entries to 3D scene positions, fed by the caller's room table. |
| `storage.mjs` | Local storage service: `KEYS` registry, pack-namespaced get / set / json / remove that never throw. |
| `thematic.mjs` | The thematic look of a map (K-R107): function palette, danger outlines, `functionOf`, padded hulls, and the model of a thematic automatic schematic (branches, hubs, label ranks). Pure. |
| `traffic.mjs` | Traffic and light-stream math: normalized route points to a frame of light positions, deterministic. |
| `transit-geometry.mjs` | Octilinear paths, parallel offsets and the synthetic layer declarations of a transit network and of a planned route, plus the route polyline for trips (K-R109). Pure. |
| `transit-spec.mjs` | The transit block (K-R107): kernel modes, limits, `normTransit` per-item healing, label helpers. Pure. Not `transit.mjs` (that one parses a journey written as a place). |
| `transit.mjs` | A journey written as a place ("from A to B", "A → B"): its ends and the vehicle; the pure patterns the card script uses. |
| `vision.mjs` | Vision-cone geometry: guard fields of view clipped by wall segments, patrol rings, point-visibility tests. |
| `vocab.mjs` | The kernel's discovery vocabulary (K-R38, K-R42): per-language field-name words for variables, person rows and roster slots; no card names. |
| `walk.mjs` | Deterministic clock tick and an N-dimensional interpolating walker (no teleporting; reduced motion snaps). |
| `wb-peek.mjs` | The place card's worldbook-archive summary (W8, U-FIX-1): readable text from a plain entry; from a template entry only a prose string about the place, never the script. |
| `weather.mjs` | Weather core: preset table, weather from story and clock, particle field and lightning timing. |
| `yaml-shape.mjs` | The shape of a card's variable initialisation text: JSON or a small YAML subset, nothing else (K-R94). Pure. |

### 3.2 map/app

Viewer modules, split out of the former inline script of `viewer.html`. State is imported live from `state.mjs`;
mutable state is written only by its declaring module through `set*()`.

| Module | Role |
|---|---|
| `about-build.mjs` | About page current-build line (head number, short sha, time). |
| `ai-cards.mjs` | The AI link settings page (S7-1): the ten feature cards (digest, status line, macros, dice, settlement records, spatial contract, worldbook JIT, fact crystallisation, AI advisor, map actions) with their prefs keys and sub-options, patched from the host's `th-state`; loaded when the page first opens. |
| `ai-nav-form.mjs` | The AI advisor card's sub-options: endpoint form, test connection, consent block (agree only after a passing test), cadence, stats line. The key is only posted to the host. |
| `block-canvas.mjs` | Canvas building blocks (K-R80): `canvasLayer` (slot canvas, rAF, resize, visibility guard) and the frame bodies `drawFlow`, `drawParticles`, `drawTint` shared by the traffic and weather layers and by declared layers. |
| `block-overlay.mjs` | Overlay building blocks (K-R80): `point`, `label`, `line` and `area` features as map overlays (one SVG per layer, HTML elements for points and labels), the injected style, legend swatch style. |
| `boot.mjs` | Startup: fetches registry, markers, derived data, dictionary and pack in parallel, builds OpenSeadragon, posts `ready`, failure exits. |
| `bus.mjs` | Viewer-side listener bus: every `window` / `document` listener is registered here and removed on unload. |
| `card-links.mjs` | Links at the bottom of a place card (cross-layer channel, 3D link, gallery entry). |
| `card-state.mjs` | Credits page card-info states: no host, host without card info, present. |
| `clouds.mjs` | Drifting clouds and the layer-change transition cover. |
| `color-vision-mode.mjs` | Colour-vision mode: safe palette, class/attribute switches, broadcast to sub-pages. |
| `control-column.mjs` | Control column: the `#dock` next to the layer strip and zoom, the label toggle, the three actions of the settings home (up one level, current place, close map). |
| `coordinates.mjs` | Coordinate conversion: code map coordinates (1600 × 1000) to normalized base-map coordinates (`toImg`). |
| `credits-extra.mjs` | Two sections of Settings, Copyright: the open map's source line and the related project links. |
| `crumb-menu.mjs` | The breadcrumb's last crumb as the level switcher: a menu of the sibling levels and the child 3D pages (HEADER-1, D36). |
| `current-pack.mjs` | The current pack, resolved once at startup (live binding `PACK`, `packData(key)`). |
| `data-mapping-settings.mjs` | Settings "data and mapping" page: local storage usage and current data sources (read only). |
| `declared-layers.mjs` | The declared-layer host (K-R79..K-R84): registers a pack's new layers on the LayerRegistry, asks `registry.applicable`, draws through the blocks, keeps the visibility in `edenMapLayers`, feeds the legend rows. |
| `declared-sources.mjs` | Sources of declared layers (K-R81): inline, `file:`, `view:routes` / `view:markers`, events, people, items, routine, for the open view; `mvu:` and `ops` give no features until S8-3. |
| `depth-haze.mjs` | Closes the depth → haze → `depth-haze` slot / fog canvas loop for the current depth plane. |
| `dom-helpers.mjs` | DOM helpers: `$`, `esc`, `iconSvg`, `afterLoadIdle`. |
| `drawer-glue.mjs` | The single drawer / right rail: where the layer switcher sits, drawer visibility, legend page, empty place page, opening on a place card. |
| `dzi-worker-src.mjs` | Source string of the tile decode worker (exported as text so a blob worker works inside `srcdoc`). |
| `dzi-worker.mjs` | Viewer-side client of the tile decode worker, with fallback to the stock image path. |
| `estate-cards.mjs` | Cards of a 3D building in the shared place card: a room (kind chip, area, use, access, pictures, custom block), a zone or vehicle, the building's about section and its rooms by floor. DOM builders, `textContent` only. |
| `estate-shell.mjs` | The viewer's half of the one shell while a 3D building is open (S7-3): view segment and menu, the building's floors in the level strip, toolbar / keys / Esc to the page, cards for what the page reports, the people sent to the page (`estate:*`). |
| `extension-api.mjs` | Local extension interface `window.EdenMap` and the chat id. |
| `feature-card.mjs` | The feature card component (S7-1): pure `cardModel` (icon, health line, text, tokens) and `featureCard` that draws it with textContent and patches it in place. |
| `feedback-report.mjs` | Pure feedback-report text assembly with a whitelist of fields. |
| `feedback.mjs` | Feedback button: installs the log buffer, previews and copies / downloads the report. |
| `fog.mjs` | Fog exploration overlay: unvisited places dimmed, visits recorded per chat. |
| `fps.mjs` | Debug frame-rate readout and sub-page toggle. |
| `hires-inset-tiles.mjs` | High-resolution inset tiles overlaid when zooming into an inset's area. |
| `host-messages.mjs` | Host message interface: origin / token checks, protocol validation, dispatch by type. |
| `i18n.mjs` | Language and theme: dictionary, `uiText` / `translateName` / `localName`, `setLang`, `setTheme`. |
| `json-cache.mjs` | `getJSON`: data files fetched once, failures not cached. |
| `layer-host.mjs` | Viewer-side LayerRegistry assembly: registry singleton, `.vpslot` slot containers, `declared(id, impl)` (every module registers through its kernel declaration), `applyPackLayers` (a pack's rows adjust kernel layers), the layer menu, `window.LayerHostApi` summary. |
| `load-progress.mjs` | Progress of the full-screen loading layer, sharing `ui/progress.mjs`. |
| `local-props-view.mjs` | The kernel layer `local-props` and the prop methods of `EdenMap` (K-R88): placements per chat in `edenMap:chat:<chat id>:props`, images as `<img>` and a glb as the `cube` icon on flat maps, click-to-place. |
| `locate.mjs` | Initial view and current place: `focusStart`, `markHere`, `hereRes` (over `place-resolver.mjs`), `drawnAt`, `jumpHere`. |
| `map-level-nav.mjs` | Level navigation: breadcrumb, the 3D floor strip, Esc handling, single-key shortcuts. |
| `map-switch.mjs` | Map switching: `go` with registrable wrappers, snapshot, map chrome, alternate base map. |
| `markers.mjs` | Markers and place cards: placement, tracking, show / close card, world-map and point-map overlays. |
| `nav-ops-view.mjs` | The kernel layer `nav-ops` (K-R86, I-04): the navigator's clues and marks from `eden-map:ops`, placed by place name or by coordinates on their stamped map; session only. |
| `nodes-runtime-v2.mjs` | The same reads for a schema-2 pack, built from the pack's own tree and the projected registry (K-R96). Pure. |
| `nodes-runtime.mjs` | The viewer's node tree: the loaded registry converted once by `core/compat-v1.mjs`; breadcrumb, up button, warm-up neighbours, estate stand-in and 3D-page test read it (no `parent` walking). `buildRuntimeV2` installs the schema-2 runtime into the same slot. |
| `notice-layer.mjs` | Notice layer (handed to the host when embedded, `ui/notice.mjs` when standalone) and the first-run hint. |
| `one-hand-mode.mjs` | One-hand mode: handedness switch with the floating button following it; starts the settings-home actions and quick zoom. |
| `pack-edit-view.mjs` | Edit mode on screen (K-R100): the edit bar, marker drag, the controls on a place card, pictures and "use a picture as this place's map". Drawn only while the switch is on. |
| `pack-edit.mjs` | Edit mode model (K-R100): `createEditor` with its operations (move, reparent, alias, new place, start, pictures, base map, discard) and the draft's storage (text in LocalStore, picture bytes in the gallery IndexedDB under `edit:<pack id>`). |
| `pack-live.mjs` | Shows a schema-2 pack without a reload (K-R95, K-R100): project, swap the registry and the node runtime, redraw the open map; the edit draft is installed as a filter. |
| `pack-settings.mjs` | Settings → Advanced "Map pack": the running pack, the choice list, URL / file import, the go-live switch of a foreign pack's model text, export as pack (K-R98, K-R99, K-R103). |
| `place-resolver.mjs` | The current location: `nodes.locate` over the node tree, mapped to the result shape the consumers read (`level`, `map`, `marker`, `room`, `node`, `transit`); also used by `tavern/spatial-contract.mjs` and the builder tools. |
| `plugins.mjs` | Plugin registry `plugins`: the only channel between app modules and root plugins. |
| `profile-live.mjs` | Makes an applied profile take effect without a reload: one effect per preference key, host prefs, then refreshes the open settings page. |
| `profile-section.mjs` | The settings-profile section at the top of Settings home: current name, modified marker, picker, save / rename / delete / restore / export / import. |
| `profiles.mjs` | Profile actions over an injected store (apply, save as, rename, delete, export, import); no DOM. |
| `prop-store.mjs` | The local prop store (K-R88): IndexedDB database `spatialProps` (store `props`) next to the room gallery's `edenRoomGallery`; add (sniff, check, quota), remove, list, object URLs. Nothing leaves the device. |
| `protocol-stamp.mjs` | Protocol version stamp and message exit: `PROTO`, `post`, `protocol`, the sub-page origin `SUB_ORIGIN`. |
| `quests-view.mjs` | Viewer rendering of dynamic clue nodes as breathing circles. |
| `quick-zoom.mjs` | Single-finger zoom (double-tap, hold, drag) on touch screens. |
| `raf-probe.mjs` | Read-only activity counter behind the debug getter `raf` (S7-2): animation frames per owning module, live intervals and their callbacks, running animations; read by `tools/browser/raf_pause.mjs`. |
| `route-plan-view.mjs` | Route planning in the viewer (K-R111, K-R113): the route link on a place card, the plan card, the kernel layer `route-plan` (the user's plan solid, suggestions dashed), re-planning and arrival on `eden-map:here`, the host's echo `eden-map:route`; sends `eden-map:route-plan`. |
| `scale-handoff.mjs` | Scale hand-off between the world map and the city layers, plus the surrounding transition ring. |
| `screen-reader-announce.mjs` | Screen-reader announcements (aria-live): several same-moment lines merge into one sentence. |
| `settings-head.mjs` | The settings search field in the sheet header; collapses to an icon on a phone. |
| `settings-pages.mjs` | Settings page table (S7-1): the rows of every settings page, built the first time the page opens (never on the boot path), `onBuilt` / `onShow` hooks, the static search index. |
| `settings-wire.mjs` | Handlers of the settings rows, attached when their page is built; the stored switches that must act at boot (reduce motion, no-glitch, minimap, action mode, edit mode) read storage directly. |
| `settings.mjs` | Settings overlay: pages, section registration, search, about / update check, self-check. |
| `sharpness-tiers.mjs` | Sharpness tiers, data-saver decisions, load progress, overlay and label avoidance. |
| `sound-block.mjs` | The `sound` building block (K-R89): Web Audio for a sound layer from the plan of `core/ambience.mjs`; never starts without the user's switch and a gesture; `window.SoundApi`. |
| `spot.mjs` | Where a located place is drawn for a person or a trip end (stand-in landmark of a 3D page, landmark, the node's own point, district); pure, the viewer passes what it knows. |
| `stash-markers.mjs` | Glowing pickup items on the map from the world stash; a click sends the pickup intent to the host. |
| `state.mjs` | Core viewer state: current map, registry, OSD instance, focus request. |
| `status-dot.mjs` | Status dot: load / tier state as a dot with a screen-reader label. |
| `subpage3d-host.mjs` | Estate / 3D sub-page host: blob iframe with `<base>`, failure hook, sub-page messages, generic 3D viewer entry. |
| `tabs.mjs` | The drawer's tab registry: owner modules provide a tab's content, one refresh decides the buttons, the drawer, the labels and the open tab; the per-chat "seen" sets behind the tab badges (K-R72). |
| `tavernhelper-settings.mjs` | Settings for TavernHelper features: worldbook add-on sync, state injection, macros, injection depth. |
| `text-lookup.mjs` | `uiTextOr`: UI text from the dictionary when it has the key, else the fallback with variables filled in. |
| `theme.mjs` | Per-view theme from the pack (`ui.theme.views`, K-R70): one `<style id="packTheme">`, `body[data-glow]` for the view that defines a glow. |
| `topbar.mjs` | Top bar layout, background warm-up, version code. |
| `traffic-view.mjs` | Viewer rendering of light streams on the `fx` slot canvas. |
| `transit-env.mjs` | The viewer's router environment (K-R109, K-R112): the transit graph of the open pack, where each station and place is drawn (tree answer, marker anchor from the points files through the JSON cache), `endOf`, `planBetween`, and the polyline of a trip along the network. |
| `transit-view.mjs` | The kernel layer `transit` (K-R110): districts, lines, links, stations, badges and the label hierarchy drawn through the S8-2 blocks, legend rows, off by default; also the style of the marker label ranks (K-R114). |
| `viewer-debug.mjs` | Debug face: one read-only `window.ViewerDebug` namespace (`mapRegistry`, `currentMapId`, `osdViewer`, `go`, …) that browser probes read instead of ad-hoc `window` globals. |
| `viewport-mode.mjs` | Viewport and device flags: `narrow` (narrow panel), `coarse` (touch or low-memory device). |
| `visibility.mjs` | Viewport visibility render throttling: pause switch with reference-counted reasons. |
| `vision-view.mjs` | Viewer side of vision cones and stealth: draws fields of view, reports the hardest sighting on a move. |
| `wander.mjs` | NPC wandering driven by the deterministic clock and schedule; walkers never teleport. |
| `weather-view.mjs` | Viewer rendering of weather particles, tint and lightning on the `fx` slot. |

### 3.3 map/tavern

The host side: the entry script, host glue, and pure pipelines that the host and node tests share.

| Module | Role |
|---|---|
| `auto-pack.mjs` | The automatic pack on the host (K-R95): derive / reuse the cache, grow from each round's place texts, recompute on chat load, `eden-map:pack`; loaded only for the automatic pack. |
| `background-scan-scheduler.mjs` | Background quiet-derivation scheduler: read-only incremental scans that yield to a live panel or generation. |
| `branch-follow.mjs` | Follow-branch resolution: newest build of a branch from `head.json` across CDN mirrors. |
| `card-source.mjs` | Reads the current card and its own worldbooks for the pack gate (K-R90, K-R91) and builds the plain card source for the automatic pack (`readCardSource`, K-R94); host interfaces come in through `mvu-bridge.mjs hostAccess`. |
| `characters-parse.mjs` | Character bar: finds characters and their latest place from chat tags and MVU variables. |
| `chars-flow.mjs` | Character and world-time flow of the host: ContextPipeline and MVUBridge assembly, world time and outfit, roster / portrait / trips / routine forwarding to the viewer. `createCharsFlow(host)`. |
| `check-failure-report.mjs` | Failed-check report ring: structured reports injected next turn so the story follows objective facts. |
| `clock-view.mjs` | The clock chip's period popover (U-FIX-4): follow the chat time or preview one period band on the map (`view`, `tod`, `night`); session only, the chat time is unchanged. |
| `compose-templates.mjs` | Chat-input templates ("go here", "ask about this"): fill the input box, never send. |
| `context.mjs` | ContextPipeline: message window normalization, round computation, custom tag replay, trips; pure data in and out. |
| `data-source-registry.mjs` | Data source registry: where the host reads chat state from, for settings and `EdenMap.sources()`. |
| `eden-map.js` | Host entry: floating button and panel, viewer state machine, message dispatch, recompute scheduling, cleanup assembly. |
| `event-geo-load.mjs` | The host script's event geography: fetches what a pack's node tree is built from (its v1 files and overlay) and returns a geo for `events.mjs setGeo`. Nothing here touches the host; the caller passes the fetcher. |
| `events-parse.mjs` | Event parsing: reads event tags from chat text, classifies them through the pack's events block (`typeOf`, K-R50), merges (type + node, K-R54) and ages them (pure). |
| `extension-api-contract.mjs` | Machine-readable contract of the public `EdenMap` API exposed to the host page. |
| `feature-health.mjs` | Feature health (S7-1, `docs/settings-ia.md` §4.5): `createFacts()` and the pure `healthOf(facts)` that says per AI-link card whether it is on, working, idle or not effective, with reason, last floor, text and tokens; `healthSum`. |
| `follow-gate.mjs` | Entry gate: a script loaded from a branch path reloads itself from the head sha. |
| `follow-pin.mjs` | Follow / branch load addresses pinned to the head sha; update-channel decision. |
| `gallery-flow.mjs` | Host side of the media source (K-R106), made by `chars-flow`: reads the card's picture table once per chat, scans the chat floors' text for tags each round (the place of a floor via `MVUBridge.floorPlace`, K-R105), sends `eden-map:media`; answers `eden-map:media-ask`; the switch `edenMapGallery` (default on) turns it off; nothing is stored. |
| `host-about.mjs` | Version info and update check orchestration, all effects injected. |
| `host-api.mjs` | The local `window.EdenMap` extension API (subscriptions, avatar shrinking) and the TavernHelper-side exposure: script buttons, macros, script info, worldbook automation. `createHostApi(host)`. |
| `host-checks.mjs` | Startup self-check, first-run card, host toasts, auto update check and version switching. `createHostChecks(host)`. |
| `host-lifecycle.mjs` | Host instance lifecycle: takeover of old instances, panel DOM mount, listener registration, cleanup hooks. |
| `host-routes.mjs` | CDN route table, version inference and route race; pure computation. |
| `host-strings.mjs` | The host's few product texts (map name, script name, "new events" toast) from the manifest `strings` (`hostStr`), else neutral defaults; pure. |
| `host-tavernhelper.mjs` | TavernHelper adapter: request wrapper, function probing, pack namespace, script-variable preferences, worldbook automation. |
| `host-tokens.mjs` | The host page's token block (S7-2): `HOST_TOKENS_CSS` / `hostTokensCss(id)`, a scoped copy of the `tokens.css` colours, glass, elevation and the `--zh-*` z ladder (a test compares every value); the host's own `--em-*` names are aliases of it. |
| `imagegen-bridge.mjs` | Optional bridge to the external image-generation extension; every function degrades quietly when absent. |
| `interaction-modes.mjs` | Script ↔ card interaction modes: compact state injection, tag reconciliation, minimal checkpoint. |
| `keyframes.mjs` | Long-horizon keyframe compression: per-floor state to change-point frames, a droppable cache. |
| `llm-flow.mjs` | Background flows that call a user endpoint or write the add-on worldbook: navigator (W5), just-in-time hydration (W6), fact crystallization (W7). `createLlmFlow(host)`. |
| `llm-gateway.mjs` | Private API key gateway: computes how to call a provider; does no network or storage itself. |
| `model-texts.mjs` | Texts that reach the model (for the state line's skip rule) and the no-injection reasons. |
| `modes-flow.mjs` | Interaction modes (a)(d)(e) on the host side: state line and spatial contract injection, checkpoint, location conflict check. `createModesFlow(host)`. |
| `msgtext.mjs` | Message text pre-processing: strips reasoning blocks and variable-update blocks before parsing. |
| `mvu-bridge.mjs` | MVUBridge: the only module allowed to touch `Mvu` / `SillyTavern`; snapshots, `getHere` fallbacks, chat variables, roster reads. |
| `mvu-readers.mjs` | Pure readers for MVU data and the map's own custom data (names, outfit, roster rows through the pack's slot fields, portraits, time and period bands). |
| `mvu-snapshot.mjs` | MVU snapshot selection and generation-state rules. |
| `nav-ops.mjs` | Navigator overlays on the host (K-R86): stamps clues and markers with the floor and the map, ages them out after 20 messages, caps each list at 12. Pure; session only. |
| `operation-dsl.mjs` | Restricted operation DSL sandbox: extracts, validates and normalizes atomic operation blocks. |
| `pack-gate.mjs` | The pack gate (top-level `await`, imported first by the entry): resolves one pack per card — choice, baked, embedded, index, automatic — sets `window.__tcPack`, restarts the instance on a card switch (K-R90). |
| `pack-profile.mjs` | The profile of the pack the script runs (`getProfile` / `setProfile`); the kernel profile until the pack's declarations arrive. |
| `pack-runtime-v2.mjs` | Host side of schema-2 packs: profile and event geography from the pack, URL / file / embedded import with caps, the go-live gate of model text (K-R91, K-R99, K-R103). |
| `picker.mjs` | Pure helpers for the customization panel: grouped object list, search, fly-to targets. |
| `place-action-injection.mjs` | Map-driven actions: a clicked point of interest becomes one sentence (off / compose / silent system injection). |
| `planner-gateway.mjs` | Background navigator gateway: scheduling, input assembly and response gating for a private-key planner. |
| `preset.mjs` | Reads semi-structured status fields written by community presets as location / time / presence fallbacks. |
| `profile-load.mjs` | Fetches a pack's manifest and overlay and builds its profile (`loadPackProfile`); the caller passes the fetcher. |
| `root-store.mjs` | The map's chat-variable root (`eden_map`): custom names and uses load / save / migrate, local storage budget, worldbook sync, tag-rename replay. `createRootStore(host)`. |
| `route-flow.mjs` | The planned route on the host and the class macros (K-R111, K-R113): `eden-map:route-plan` re-checked with `checkPlan`, held for the session, echoed as `eden-map:route`; arrival, chat change and 20-message ageing clear it; `{{eden_route}}` carries it. `createRouteFlow(host)`. |
| `sanitize.mjs` | Community-preset text sanitizer: strips reasoning / status blocks by tag table (pure). |
| `selfcheck.mjs` | Startup self-check verdicts from facts the host collected (pure). |
| `settlement-guard.mjs` | Variable settlement timing guard: ledger reconciliation writes are queued until after the main update window. |
| `spatial-contract.mjs` | Spatial coordinate contract compiler: current place plus surrounding geometry to a token-budgeted JSON. |
| `splash.mjs` | First-run self-check card with a slow progress bar tied to real preloading. |
| `stash-flow.mjs` | Pickup and stash flow (was `loot-flow`, renamed S6-2): map-driven action injection, check dice and failure ring (W2), settlement gate and leak audit (W11), pickup scan folded into the unified store each round, the extension-API rows, the in-card inventory, `eden-map:inv` and the world stash. `createStashFlow(host)`. |
| `stash-recompute.mjs` | Recompute and reconciliation of the stash from the chat messages (K-R75): the live fold `step`, `scanMessage` / `replayMessage`, `recompute`, `actionsOf`, `reconcile` (pure). |
| `stash-store.mjs` | The unified item store `<chat var>.stash` (K-R74): norm, migration from the v1 keys, put / remove / retag, the wire rows and the injected digest line (pure). |
| `stat-path-mapping.mjs` | Variable mapping: which `stat_data` path holds location, time, date, presence; the pack's own paths first (`defaults`), then auto-discovery by field name. |
| `storage-budget.mjs` | Local storage budget: LRU per chat, avatar caps, quota-hit recovery; touches only the map's own keys. |
| `tabledb-bridge.mjs` | Read-only compatibility with the optional table-database extension. |
| `tavernhelper-api.mjs` | Thin TavernHelper wrappers: feature probing, unified external requests, display-only leak fence. |
| `tile-route.mjs` | Which route to switch to when every tile of the current one fails (N13): `nextRoute` picks the other route once per window, or null. The viewer asks (message tiles-failed), the host answers (message tiles-route) and reloads the viewer on the new route. Pure. |
| `timeline-flow.mjs` | Timeline replay (Part 5-4) and the keyframe cache wiring on the host side. `createTimelineFlow(host)`. |
| `timeline.mjs` | Timeline replay core: what the map should show at floor N (location, time, who is where). |
| `trips-parse.mjs` | Trip derivation: "A to B" trips from per-floor places and character tags, styled by transport mode. |
| `worldbook-crystallize.mjs` | Story-fact crystallization into the add-on worldbook as keyword-triggered entries. |
| `worldbook-jit.mjs` | Worldbook just-in-time hydration: only entries relevant to the current place are enabled. |
| `worldbook-sync.mjs` | Worldbook add-on write and auto-sync: touches only our own book and our own marked entries. |

### 3.4 map/ui

Shared widgets, used by the viewer, the host and the 3D pages. Mostly plain scripts that attach to `window`.

| Module | Role |
|---|---|
| `camera-controls.js` | Shared 3D camera helpers: view presets, compass, first-run hint card, idle timer. |
| `chrome3d.js` | 3D viewer chrome (`window.UI3D`) shared by the estate page and the prop viewer. |
| `icons.js` | The single icon set (`window.UIIcon`): grid, stroke and color rules. |
| `illustration-panel.js` | Room illustration panel driving the optional image-generation extension. |
| `notice.mjs` | The single notification layer (P0 blocking, P1 banner, P2 toast). |
| `progress.mjs` | Unified loading-progress component: determinate or elapsed-time, retry. |
| `room-gallery-panel.js` | Room gallery UI: custom names, a place's pictures (pack pictures read only, then private ones: upload, resize, reorder, "add to pack" in edit mode). |
| `sheet.js` | The single bottom sheet / desktop right rail (`window.UISheet`). |

### 3.5 map/three

Runtime helpers for the 3D pages. A pure leaf: THREE is passed in by the caller, so these run in node tests with a
fake THREE.

| Module | Role |
|---|---|
| `backdrop.mjs` | Per-period sky gradient as the scene background plus the cloud-sea plane under a floating island; the palette is anchored on the day / night keyframes and also applies the period grade for the landmark viewer. |
| `culling.mjs` | Frustum culling and bounding volumes for static matrices and instanced meshes. |
| `daynight.mjs` | Dynamic day / night: world clock to four-period lighting, fog and emissive parameters with smoothing. |
| `depth-fit.mjs` | Depth-buffer fitting: near / far from the scene bounding sphere and camera distance (recomputed every frame), plus depth / stencil bit read-out for the debug overlay. |
| `instancing.mjs` | GPU instancing of static meshes with an instance-to-mesh index map. |
| `lod-controller.mjs` | Dynamic LOD controller applying `core/lod.mjs` decisions to a three scene. |
| `night-look.mjs` | Night look for baked exteriors: a material patch that mixes each baked surface toward its own average colour so the baked sun shadows and lit faces read as flat moonlight, with a back-face colour for cut walls. |
| `particles.mjs` | `fx` slot particle renderer (weather, aurora): one draw call per effect, descriptors registered by the caller. |
| `relief.mjs` | 2.5D relief material (normal, parallax, roughness) lit by the day / night state. |
| `render-context.mjs` | Shared 3D render-context factory: pixel ratio caps, context loss and restore, real dispose. |
| `shaders.mjs` | GLSL fragment library for particles, aurora and relief normals. |
| `texres.mjs` | Texture resources: compressed-texture capability probing, KTX2 attachment, budget inputs. |

### 3.6 map/*.mjs (root)

Viewer plugins, loaded as separate module scripts by `viewer.html` so a failing plugin never blocks the viewer.
They import core state from `app/*` and reach each other only through `app/plugins.mjs`.

| Module | Role |
|---|---|
| `characters-view.mjs` | Character tab and map avatars: placement, grouped stacks, per-person toggles, fly-to. |
| `compose-view.mjs` | Place / event / character card buttons that send template sentences to the host input box (embedded only). |
| `custom-dialog-view.mjs` | HTML builders of the names-and-uses dialog (list, picker, results, edit form); pure, state passed in per call. |
| `custom-hints.mjs` | One-time rename hints (toast through the notice layer). |
| `custom-names-view.mjs` | MVU-linked viewer part: custom names and uses and their dialog; the night tint, outfit line and rename hints live in the `custom-*` modules below. |
| `custom-outfit.mjs` | The player's outfit text pushed by the host; asks the event bar to redraw. |
| `custom-tint.mjs` | Night tint and period base-map switch from world time. |
| `events-fx.mjs` | Screen glitch effect declared by event types and the event count badge on the world-map city marker. |
| `events-view.mjs` | Event layer: placement, icons, event list, fly-to; the screen effects and world-map badges are in `events-fx.mjs`. |
| `gallery-view.mjs` | The media source in the viewer (K-R106): the person card's gallery section (thumbnails requested only when a category is opened), "scenes here" on the place card, a person's scene timeline; rechecks every address, text via `textContent`, one switch. |
| `scrapbook-view.mjs` | Viewer side of the landmark scrapbook: pinned images and notes on place cards. |
| `security.mjs` | Optional security overlay: shield chips on places and a rules row on cards. |
| `stash-view.mjs` | Spatial inventory on place cards (viewer side of the inventory). |
| `stat-path-mapping-view.mjs` | Settings "variable mapping" page (embedded only). |
| `trips-view.mjs` | Trip layer: draws recent trips and in-transit arcs by transport mode. |
| `unmapped-place-picker.mjs` | Unmapped places: small picker to assign an unrecognized place name to a node, marker or ignore it. |
| `worldbook-peek-view.mjs` | Worldbook peek capsule on place cards (read only). |

### 3.7 Pages

| File | Role |
|---|---|
| `map/viewer.html` | The viewer page: markup, inline tokens and the `--zu-*` / `--zv-*` ladders, preloads, startup scripts, plugin script tags. |
| `map/props/viewer3d.html` | The generic 3D viewer (`?model=<id>`): loads `<id>/manifest.json` through `core/scene3d-manifest.mjs`, baked lighting, no runtime lights. |
| `map/estate/index.html` | The 3D building page (shell mode): canvas, in-canvas labels and presence chips only; every word and colour comes from the pack's 3D manifest. |
| `map/estate/main.js` | The 3D building viewer: scene, floors and section views, camera, picking, on-demand rendering, messages to and from the viewer. |
| `map/estate/presence.js` | Presence chips: the people located in a room drawn as avatar tokens in that room, tap → the shared character card. |
| `map/estate/labels.js` | In-canvas labels: hover label, major names, occluded labels hidden fully. |
| `map/estate/terrain.js` | The site's ground and outdoor zones for the 3D page. |

## 4. Data flow host → viewer

Data crosses the host boundary in one direction (brief §2.3), but inside the host the entry is a hub, not a line.

**As the code runs today** (D16): `tavern/eden-map.js` and its `createX(host)` flow modules are the hub. The entry builds the
MVUBridge and ContextPipeline (via `chars-flow`), calls the ledger (via `stash-flow`) and the protocol, and the flow
modules reach each other through the one `host` deps bag; nothing hands data along a chain.

```
Mvu / SillyTavern globals
        ▲  (only tavern/mvu-bridge.mjs touches them)
        │
    MVUBridge ◄────────┐                    ┌──► ledger (core/ledger.mjs) + varsync (tavern/settlement-guard.mjs)
                       │                    │
ContextPipeline ◄──► host entry  tavern/eden-map.js ──► protocol SCHEMA (core/protocol.mjs) ──► postMessage
(tavern/context.mjs)   the hub: schedules, calls, wires │                                        │
                       │                    │          ▼                                        ▼
                       └─ createX(host) flow modules   viewer intents ◄─ viewer modules (app/*) ► LayerRegistry slots
                          (stash, chars, llm, timeline, modes, root-store, host-api, host-checks;
                           one `host` deps bag, built once in the entry)
```

**Target** — the linear chain the hub is meant to converge on (each stage a pure step feeding the next):

```
Mvu / SillyTavern globals
        │  (only tavern/mvu-bridge.mjs touches them)
        ▼
MVUBridge ─────────► ContextPipeline (tavern/context.mjs; msgtext / sanitize / preset feed it)
                        │  pure data in / out: message window, round, roster, tags, trips
                        ▼
        ledger (core/ledger.mjs) + varsync (tavern/settlement-guard.mjs)
                        │  settlement checks; writes queued until after the main update window
                        ▼
host recompute (tavern/eden-map.js) ──► protocol SCHEMA (core/protocol.mjs) ──► postMessage
                        ▼
viewer modules (app/*, root plugins) ──► LayerRegistry slots (core/layer-registry.mjs + app/layer-host.mjs)
```

- **The host reads, the viewer draws.** `eden-map.js` schedules a recompute when variables or floors change,
  calls the pipelines, and pushes results with typed messages. The viewer sends intents up (pickup, compose,
  explore, settings) and never writes host state.
- **The chat log is the only truth** (brief §2.4): every derived value (events, characters, trips, keyframes) can
  be recomputed from the chat floors; caches are droppable. The map's own state lives in the pack's chat variable
  (`eden_map` for eden), never in the card's `stat_data`.
- **Protocol** (`core/protocol.mjs`): every message is an envelope `{ type, v, … }` checked against `SCHEMA` by
  `check` / `accept`. Each entry carries a direction tag: `HOST_TO_VIEWER` host → viewer, `VIEWER_TO_HOST` viewer → host, `VIEWER_TO_SUBPAGE` viewer →
  sub-page (estate / 3D), `SUBPAGE_TO_VIEWER` sub-page → viewer, plus `both` for a few relay messages. Unknown types from a
  newer protocol version are dropped silently; older or same-version unknowns are dropped with one warning. The
  filter checks shape only and never inspects text content.
- **Transport**: the host mounts the viewer as a `srcdoc` iframe whose `<base>` points at the CDN, and sub-pages
  as blob iframes. `createBus` wraps one window-to-peer channel with origin / token checks.
- **Host modules** (`host-routes`, `host-lifecycle`, `host-th`, `host-about`) and the S5-1 flow modules (`stash-flow`, formerly `loot-flow`, `chars-flow`, `root-store`, `host-api`, `host-checks`, `llm-flow`, `modes-flow`, `timeline-flow`; each `createX(host)`, the `host` deps bag is built once in the entry) hold the glue that used to live in
  `eden-map.js`; the entry keeps scheduling, side effects and cleanup assembly.

## 5. Entity protocol — target vs current state

**Current (exists).**

- **Roster**: `core/roster.mjs` merges five sources — MVU variables, chat tags, table database, fallback roster,
  image library — into standard `RosterRow`s (`name, role, location, status, tags, source, present`), highest
  priority wins per field, aliases recognized, portraits attached. `describe()` returns counts for probes.
- **Current place**: `app/place-resolver.mjs` places the chat location with `nodes.locate` over the node tree; the result keeps
  the six-level shape the viewer reads (room, zone, landmark, layer, group, world place) and carries the node.
- **Every place resolves through nodes** (S3): the current location (`app/place-resolver.mjs`), people and trip ends
  (`app/spot.mjs`), events (`core/event-geo.mjs`, `tavern/events-parse.mjs` `setGeo`), the injected spatial contract
  (`tavern/spatial-contract.mjs`) and item places (a stash row names a landmark node; a hidden row shows where the current
  location places the player). Nothing matches a place by a registry `kind` or by a label any more.
- **Events / characters / trips**: parsed from chat tags and MVU by `tavern/events-parse.mjs`, `characters-parse.mjs`,
  `trips-parse.mjs`; an event's type, group, icon, colour, effect and default-off come from the pack's events block (S4-1, K-R68); a pack without one gets the kernel's neutral taxonomy.
- **Items**: `core/stash.mjs` (pack-defined world stash) and `tavern/stash-store.mjs` (the unified chat-variable store, K-R74;
  rebuilt from the messages by `tavern/stash-recompute.mjs`, K-R75), reconciled by item id; the card's own item table is read
  only (`mvu-readers.cardInventory`, K-R76); ledger discipline (`core/ledger.mjs`) governs what may be written. With the default-off switch `edenMapLedgerWrite`, `tavern/stash-flow.mjs` also records schedule placements and parsed events that the audit finds missing into `<chat var>.ledger` (`core/settlement-record.mjs`, K-R78).

**Target (planned, by step).**

- ~~**Node tree** `SpatialNode` as the only geography: contract in **S1** (`core/nodes.mjs`, `core/compat-v1.mjs`,
  `docs/kernel-schema.md`), consumers migrate in **S2**, location / event / character / item resolution unify in
  **S3** with an old-vs-new parity test.~~ ✅ S1–S3 (2026-10-01).
- **Author-defined entities**: `vars` and `entities` (groups plus attribute field list) replace fixed slots in **S4**.
- **Entity protocol and drawer**: ~~tab registry, presence by node~~ ✅ S6-1 (2026-10-01); ~~unified `eden_map.stash` with automatic migration
  of the old `仓库` / `槽位` keys~~ ✅ S6-2 (2026-10-01; the old keys stay read only until S10); an Items tab, per-pack pickup vocabulary — **S6-3**.

The node tree is built from the v1 files at load until packs carry schema 2 (**S4**); code reads places through the tree and never assumes a pack ships one itself.

## 6. Pack boundary

**Manifest v1 (frozen, schema `1`)** — `map/packs/<id>/manifest.json`, described in `docs/pack-schema-v1.md`,
validated at run time by `core/pack.mjs validate()` and fully by `tools/check_pack.py`:

- required: `id`, `schema` (= 1), `title`, `data.maps`;
- optional: `title_en`, `chat.var`, `data.*` (world, derived, rooms, events, worldbook, security, roster, stash,
  routine — relative paths only, or `builtin` for events; `names` is a `{ language: path }` table), `preload`, `vars`, `cdn.repo` / `cdn.npm`,
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

**Pack-driven viewer behaviour (S4-3)**: what used to be chosen by the first pack's map ids and words now comes from
pack data. The overlay's `ui` block (K-R70) carries the per-view theme tokens (`app/theme.mjs` writes one
`<style id="packTheme">`; `body[data-glow]` marks a view that defines a glow), the legend and `x-event-level`; the
`maps.json` flags `clouds` / `tint` become the view fields `x-clouds` / `x-tint` (drifting clouds, the period night
tint) and `tier_label` names a tier in the picker; event groups carry their colour-vision colours (`x-cvd`); the world
markers carry `here_words`, the realm `label_dy` and the `overseas` card. The manifest carries `worldbook.prefix` (the
add-on book and its entries are named `<prefix>·…`, default the pack title), `credits` (Settings → about) and the
data paths the host and the viewer used to hard-code (`roster`, `maps`, `galleries`, `worldbook_addon`, `gallery`,
`routine`); a missing key quietly switches the feature off. The engine names no view, group, place or book. The `layers`
block (S8-1, S8-2) lists the pack's own layers: `app/declared-layers.mjs` registers each one on the LayerRegistry (menu
row `lyr-<id>`, order after the kernel rows, visibility in `edenMapLayers`) and draws it with `app/block-overlay.mjs`
(point, label, line, area) or `app/block-canvas.mjs` (flow, particles, tint); the legend tab lists the rows of the visible,
applicable layers. S8-3 adds the host-fed sources: the host reads the card variables a pack's layers name
(`profile.layerPaths`, at most 8, read only) and posts them in `eden-map:layer-data` (the `mvu:<path>` source and `applies.mvu`);
the navigator's clues and marks go in `eden-map:ops` to the kernel layer `nav-ops`; `EdenMap.addLayer` and friends add local
layers (data only, ids `local-…`); the `sound` block plays a pack-declared ambience (`app/sound-block.mjs`, off until the user
switches it on and clicks); the local prop pack keeps the user's own files in IndexedDB (`spatialProps`) and draws them on the
kernel layer `local-props`. S8-4 adds the transit network: a pack's `transit` block (K-R107; `RT.transit` in the viewer, `geo.transit` on the host) is drawn by the kernel layer `transit` (off by default), planned over by `core/router.mjs`, offered as a route link on place cards (`eden-map:route-plan` to the host, `eden-map:route` back) and as the path of trips between stations, and the host's `{{eden_route}}` carries the held plan. The engine names no layer of any pack.

**The pack gate (S9-2)**: the entry imports `tavern/pack-gate.mjs` first; its top-level `await` resolves the pack of the current card (user choice or baked pack → pack embedded in the card → best match in `packs/index.json` → automatic) and sets `window.__tcPack` before the entry reads it; the legacy-default pack leaves it unset, so the first pack's start, texts and writes are unchanged. On a card switch the gate resolves again and, when the pack id or source changed, stops the instance (`__edenMapCleanup`), clears the profile and chat-variable root that modules keep, and imports the entry again under `?k=<card key>&r=<n>`. `eden-map:pack-pick` (Settings → Advanced) reaches it through `onTh`; the go-live switch of a foreign pack's model text is `eden-map:th` `prefs.packLlm`. Module-level state that survives a restart is listed in `docs/zero-config.md` §14.

**The automatic pack (S9-3)**: when the gate reaches its last tier, `tavern/auto-pack.mjs` (loaded only then; the first pack never reaches it) derives the pack from the card source (`readCardSource`): `core/card-read.mjs` turns worldbook titles into place nodes under a root named after the card, reads the variable paths and roster from `stat_data` or the initvar shape (`core/yaml-shape.mjs`), and finds the language and the opening view; the droppable cache `auto` in the pack's chat variable keeps the derived pack, the grown nodes and the seen texts (written by the root store's save). Each round the host passes the place texts (place tag, event and character tags, the location variable) to `core/grow.mjs`; new `g_` nodes rebuild the host's event geography and go to the viewer as `eden-map:pack` (rev + 1), where `app/host-messages.mjs` validates the pack again, projects it, swaps the registry and runtime and redraws the open schematic at the same zoom. Settings → Advanced exports the pack (`core/pack-export.mjs`, K-R98) as a file or as the text of a worldbook entry.

**Schema-2 packs (S9-1)**: `viewer.html?pack=<id>` for a schema-2 pack runs `resolveBlocks` + `validate2` + `withDefaults` (`app/current-pack.mjs`), projects the pack with `projectV2` (`core/pack-v2-view.mjs`) into the registry shape and seeds the JSON cache with the virtual point files (`v2/<pack id>/<map id>.json`); `boot.mjs` skips the v1 data files and builds the runtime with `buildRuntimeV2`. A pack with no `views` block gets implicit schematic views (K-R96); a schematic map is a generated picture of lines and dots opened as a single-image source (K-R97). Schema-1 packs take the old path unchanged; 3D views of a schema-2 pack are listed in the self-check as not shown yet.

**Drawer tabs and people by level (S6-1)**: the drawer's tab set is the kernel's (K-R72); the overlay's `ui.tabs` (or the
manifest's) names a subset and the order, `places` always stays and the legend is last, and `app/tabs.mjs` runs the one
refresh that every owner module's tab goes through. The `maps.json` flag `people` becomes the view field `x-people` (`macro`
or `micro`, K-R73); without it a map is macro when it has child maps, else micro, and the characters tab splits the present
group into sections by the node tree (`core/entities.mjs`).

**Neutral wording (S4-4)**: the engine and the core dictionaries (`i18n/zh.json`, `en.json`) carry no card name; the first
pack's exact words come back through its manifest `strings` (flat: `"key": zh`, `"key@en": en`; `t()` reads the pack
first, in English `key@en` first). Keys that hold a book or script name take run-time placeholders (`{book}`,
`{script}`) that the call site fills from the pack (`worldbookPrefix`, `app.script`), so the pack needs no override.
The host script cannot use the viewer's `t()`: `tavern/host-strings.mjs hostStr(manifest, key, lang)` reads the same
`strings` (`app.name`, `app.short`, `app.script`, `ev.toast`) and falls back to a neutral default while the manifest is
still loading. The English place-name table left the dictionary: the manifest `data.names` (`{ "en": path }`) names it
(eden: `packs/eden/names.en.json`), a pack without it shows the Chinese text. The people page draws one section per
entity group in the pack's order (`entities.groups`; the present group first; label = dictionary / pack string
`ch.g_<id>`, else the group's `i18n` label, `label`, id): `core/profile.mjs` keys `tables` by group id and gives
`groups` / `presentId` / `stageGroup`, `mvu-readers.mjs rosters()` returns one entry per group, and `eden-map:chars` gains an
optional `groups: [{ id, label, rows, present? }]` beside the unchanged `rosters`. The watchdog's term list now
includes the English card words (`EN_TERMS`, case-sensitive).

**Trust boundary**: a manifest is pure data. The engine never executes pack scripts and never filters user chat.

**Retired generator**: `tools/gen_eden_s43_data.mjs` (the S4-3 one-off that moved the eden viewer special cases into pack data) no longer regenerates anything; the pack files are hand-maintained and `--write` is refused (`tests/gen_s43_retired.test.mjs`).

## 7. Storage and namespaces

- **Local storage** is one service, `core/storage.mjs`. `KEYS` is the single registry of every key (owner, scope,
  default, `prefix` / `perChat` flags); `tests/storage.test.mjs` fails on any key used in the repo but not
  registered. `get` / `set` / `json` / `remove` never throw (private mode, quota, disabled storage).
- **Pack namespace**: registered keys are written as `edenMap*`. `core/pack.mjs nsKey` maps them to the active
  pack: eden keeps `edenMap*` (old users' keys stay readable), any other pack uses `tcp.<id>.*`.
- **Chat variable per pack**: the map's own state lives in one top-level chat variable — `eden_map` for eden,
  `tc_<id>` (or manifest `chat.var`) for others. It holds custom names, trips, keyframes, the stash (the unified item store; the v1 keys `仓库` / `槽位` stay read only until S10), exploration, and `ledger` (the settlement record of the npc and events domains, K-R78; present only when the `edenMapLedgerWrite` switch has written an entry).
  The card's own `stat_data` is never written (its schema rejects unknown keys); only our add-on worldbook and
  entries marked `extra.eden_id` are ever written.
- **Script variable**: user preferences listed in `SCRIPT_KEYS` are mirrored into the TavernHelper script variable
  `eden_prefs` so they survive a browser-storage wipe.
- **Per-chat data and budget**: per-chat keys are LRU-ranked and capped by `tavern/storage-budget.mjs`; it touches only
  keys starting with the map's prefix. Images live in IndexedDB (`core/room-gallery-db.mjs`), never in the chat. The local prop pack (K-R88) has its own database `spatialProps` (`app/prop-store.mjs`), next to the room gallery's `edenRoomGallery` and the packs store; its placements are per-chat keys `edenMap:chat:<chat id>:props`.
- **Names kept until S10**: the `edenMap*` / `eden_map` / `EdenMap` / `window.TC*` names are external contracts.
  They are renamed only at S10, with a migration and a re-confirmation (decisions D5, D12).

## 8. Rendering stack

- **Base maps**: OpenSeadragon (`map/vendor/openseadragon`) over DZI tile pyramids in `map/art/`. Tile decoding can
  run in a blob worker (`app/dzi-worker*.mjs`) with fallback to the stock path.
- **LayerRegistry** (`core/layer-registry.mjs`, assembled by `app/layer-host.mjs`): ten slots, bottom to top —
  `base`, `depth-haze`, `fog`, `routes`, `trips`, `events`, `markers`, `labels`, `fx`, `interaction`. A slot's z
  value is `(index + 1) × 10`. Layers register `{ id, slot, kind, order, mount, unmount, … }`; filter chains
  (`css` / `canvas`) stack per layer. `window.LayerHostApi` exposes the standard summary.
- **The z ladder and the glass classes live in `map/ui/tokens.css`** (S7-2; `viewer.html` inlines a minified copy made by
  `tools/sync_tokens.py`): `--zv-*` mirror the slot values (checked against `SLOTS` by a test), `--zu-*` is the viewer UI
  ladder, `--zl-*` the local one inside a component, `--zh-*` the host page's (copied by `tavern/host-tokens.mjs`, compared by a
  test). Bare numeric z-index is forbidden (watchdog check 3; the ledger section is empty). Chrome surfaces use `.g1`
  (floating controls: 80 % glass with blur, only the host bar, the viewer header, the zoom column and the info button, never on
  coarse pointers, `lowmem`, `noblur` or while a 3D view is open) and `.g2` (reading surfaces: opaque, no blur). The pack's
  per-view theme feeds only the map-space tokens `--map-*`; the chrome set is the same in every view and in 3D.
- **`map/three` runtime**: pure leaf helpers (context factory, culling, instancing, LOD, day / night, particles,
  relief, shaders, texture resources). THREE is injected by the caller.
- **Estate page** (the 3D interior viewer, "3D canvas in the main shell"): `map/estate/` (`index.html`, `main.js`, `presence.js`, `labels.js`, `terrain.js`) is loaded by `app/subpage3d-host.mjs` into a blob
  iframe in shell mode (`window.__shell = 'host'`): it draws the scene, the in-canvas labels and the presence chips; the view segment, floors, toolbar, drawer
  and cards are the viewer's (`app/estate-shell.mjs`, `app/estate-cards.mjs`; messages `estate:view`, `estate:floor`, `estate:cam`, `estate:labels`, `estate:select`, `estate:people`,
  `estate:person`, `estate:esc`, `estate:inset`, `estate:ready` in `core/protocol.mjs`). It renders on demand (no animation frame while still; probe `estate_presence`) and reads every word
  and colour from the pack's 3D manifest (K-R131, K-R132) and rooms; probes `estate_generic` (fixture pack `tests/fixtures/pack3d-min`) and `estate_kbd`. Its models come from the manifest (`map/estate/model/manifest.json` for the first pack) through `core/scene3d-manifest.mjs`; the
  generic viewer `map/props/viewer3d.html?model=<id>` serves each landmark's `manifest.json`. Both use baked
  lighting and the shared chrome in `map/ui`.
- **Fx and day / night**: weather and aurora render into the `fx` slot; the world clock (`core/clock.mjs`) drives
  `three/daynight.mjs` and the viewer's night tint. Nothing reads system time.

## 9. Guards

`bash tools/smoke.sh` is the gate; CI runs it with `node --test tests/*.test.mjs`. What protects what:

| Guard | Protects |
|---|---|
| `check_maps.py`, `check_pack.py` | Map registry / marker / tile consistency; pack manifests against the schema. |
| `check_architecture.py` | The eight watchdog checks below plus the ratchet ledger. |
| `tools/audit_coplanar.mjs` | On-demand glb audit (not in smoke): near-coplanar overlapping faces closer than 0.03 m, the geometric source of z-fighting. Probe: `tools/browser/estate_flicker.mjs`. |
| `check_stage_a_grep.py` | The plan §8 card-term grep over the whole of `map/` outside pack data and assets; only the lines listed in `tools/stage_a_grep_allow.txt` (S10) may match. |
| `test_architecture_gate.py` | Proves the watchdog bites (violations caught, allowed forms pass, scan surface not empty). |
| `check_tree_hygiene.py`, empty-file guard | No large untracked files, no zero-byte tracked sources. |
| `test_depth.py`, `test_project.py` | Python ↔ golden-file parity for depth and projection (JS side in `node --test`). |
| `check_version.py`, `sync_tokens.py --check`, `check_ascii.py` | Version consistency, token inlining, ASCII machine identifiers. |
| `check_doc_language.py`, `check_zh_mirror.py` | New docs are English; each English doc and its `*.zh.md` share a heading structure. |
| `check_readme.py`, render guard lint / tests | README import link and paths; render scripts configure the GPU correctly. |
| `node --test tests/*.test.mjs` | Unit and contract tests, including source-scan tests (`mvu_bridge`, `storage`, `layer_registry`). |
| `node --check`, JSON parse | Every shipped script and data / i18n file parses. |

**The eight watchdog checks** (`tools/check_architecture.py`):

1. **Lines** — every engine file ≤ 400 physical lines.
2. **Layering** — `map/core` has no parent-directory import; core and the pure pipelines touch no host global
   except the registered owners.
3. **z-index** — no bare numeric z-index, including the `zIndex: <n>` object-literal form.
4. **Card terms** — no card-specific words (roster names, place and setting words, internal ids) in engine code or
   in the i18n dictionary values.
5. **Citations** — no paper names, venues, arXiv or DOI in `map/**` or `tests/**` source.
6. **Inline appearance styles** — no `.style.<prop> =`, `cssText` or `style="…"` for appearance; geometry
   properties and `style.setProperty('--…')` are the allowed channels.
7. **Old `TC*` globals** — no `window.TC<Upper>` / `P.TC<Upper>` in engine code (hard zero, no ledger).
8. **Card terms in comments** — the check-4 word list counted in comments only (also `map/ui/*.css`); per file, `map/core` hard zero.

**The ratchet**: checks 1, 3, 4, 6 and 8 are counted per file against `tools/arch_baseline.json`. Existing offenders
are recorded once by the tool, and a count may only go down — a new offender, or a recorded file that grows, fails.
`map/core` can never be in the baseline (hard zero). `--update-baseline` lowers entries and refuses to raise any
number or add a file; `--init-baseline` only runs when the file does not exist. Never hand-edit the baseline.
Scan scope is `ENGINE_GLOBS`; `map/vendor`, `map/estate`, `map/props/*/**`, `map/packs`, `map/data`, prototypes,
`tests` and `tools` are never scanned.

## 10. Where to change what

- **Add a layer** — register a `{ id, slot, kind, … }` descriptor with the registry from a module under `map/app/`
  (see `app/fog.mjs`, `app/weather-view.mjs`); use only slots in `SLOTS`; take z values from the `--zv-*` tokens, never
  a bare number; add menu / visibility wiring through the registry. Declarative author-defined layers are planned
  (S8).
- **Add a protocol message** — add the entry with its direction tag to `SCHEMA` in `core/protocol.mjs`; send with
  `envelope` / `post`, receive through `accept`; add a case to `tests/protocol.test.mjs`; if a sub-page consumes
  it, handle it in `app/subpage3d-host.mjs` and the page.
- **Add a storage key** — register it in `KEYS` in `core/storage.mjs` (owner, scope, default); read and write only
  through that module; default new toggles to off; add a per-chat flag when it is chat-scoped so budget cleaning
  sees it.
- **Add a settings toggle** — storage key as above; protocol field in `SCHEMA` if the host must know; UI in
  `app/settings.mjs` (or a section registered through `SettingsApi.registerSection`); strings in both
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
│   · current place: MVU variables → map/app/place-resolver.mjs (node tree)    │
│   · events: floor text → map/tavern/events-parse.mjs → placement / banner   │
│   · situation injection: injectPrompts (in_chat, depth 4)             │
│ Viewer map/viewer.html (OpenSeadragon 5, canvas)                      │
│   · map registry map/data/maps.json · tokens map/ui/tokens.css        │
│   · overlays: markers / events / island outlines / routes             │
│   · estate: iframe, postMessage protocol estate:*                     │
│   · local extension: window.EdenMap (local only, no network)          │
└───────────────────────────────────────────────────────────────────────┘
```

## 12. Stage A state

Stage A (S0–S5) closed on 2026-10-01. What holds now:

- **The engine is card-term free**, in code and in comments: the watchdog counts card words in code (check 4) and in comments (check 8, per file, `map/core` hard zero), both at zero, and `tools/check_stage_a_grep.py` runs the plan §8 grep in smoke (one allow-listed S10 line: a redirect stub of a pack prop page). Card words live in pack data and builder tools only.
- **Packs drive the theme, the wording, the names and the groups**: the first pack's overlay (`overlay.v2.json`) and manifest carry the event taxonomy, variables and roster, per-view theme tokens, legend, credits, worldbook prefix, data paths and the dictionary overrides (`strings`); the engine reads them through `core/profile.mjs`, `app/theme.mjs`, `tavern/host-strings.mjs` and the pack's `entities.groups`. Neutral wording is the default for every pack.
- **Packs that run**: `eden` and `town` (schema 1, converted in memory by `core/compat-v1.mjs`, viewer and host, `tools/browser/pack_town.mjs`), and `minimal` (schema 2, five nodes, no base map) through the kernel pipelines — `core/nodes.mjs`, `core/pack-v2.mjs`, `core/locate.mjs` — pinned by `tests/kernel_minimal.test.mjs` and `tools/browser/pack_minimal.mjs`. Since S9-1 the viewer opens `?pack=minimal` too (its schematic map, five nodes; probe `tools/browser/pack_minimal.mjs`).
- **Module map after S5**: section 3 lists every engine file once (the three oversized files are split into flow modules, 67 files renamed per `docs/naming.md`, the `window.TC*` globals are `*Api` / `*View` names and a gate fails on a new one). A script checks that every module and path named in section 3 exists.
- **Probes**: the full sweep and its verdicts are in `docs/plans/stage-a-probes.md`; known failures are registered in `tools/browser/known-failures.json`.
- **Reload performance (I-29)**: `tools/browser/reload_perf.mjs` measures cold open, page reload and the in-map reload in the host harness (long tasks via `longtask` / long-animation-frame attribution, rAF gaps on WebKit, optional CDP profile and trace) and holds budgets (no long task over 200 ms, total long-task time, overlay done). Two pure hot spots were made cheap without behaviour change: `normalise` in `core/lexicon.mjs` is memoised, and `stripBlocks` in `tavern/sanitize.mjs` compiles each tag regex once and returns early on text without `<` (pinned by `tests/reload_caches.test.mjs`).
