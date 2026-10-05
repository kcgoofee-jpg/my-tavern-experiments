# Declarative layers: the layers block, building blocks, sources and extensions (S8 design)

> Canonical English edition; Chinese edition: `docs/layers-schema.zh.md` (same heading structure, gated by
> `tools/check_zh_mirror.py`). Output of plan step **S8-design** (plan `docs/plans/spatial-os.md` §5 Stage C S8, §16:
> I-04 overlay events → S8, E-03 → S8; `docs/todo.md` Q-01). Status: **design, working decisions applied by default**
> (the user was not available on 2026-10-01: every recommendation of the review sheet below is the working decision; the
> user may override any of them). No code changes with this document. The rules it adds to the kernel contract are
> reserved as **K-R79 … K-R89 and K-R104** (`docs/kernel-schema.md` §13, "Planned in S8"); their full text lands with the step specs
> in the appendix (S8-1 … S8-3). Every statement about today's code was checked at origin/preview `7958b5ad` (head #207).

## 0. Review sheet (L-01 … L-15)

One row per real decision. "Working decision" = the recommendation, applied by default on 2026-10-01 (autopilot). The
same list is in `docs/todo.md` §3, one line per item.

| id | Question | Options | Consequences | Recommendation (working decision) |
|---|---|---|---|---|
| L-01 | How do the first pack's existing layers move onto the declarative mechanism? | A: every layer's *facts* (slot, order, menu row, default, applies, legend) become a kernel declaration; all drawing stays in its module as a kernel provider. B: every layer is rewritten as a configuration of generic blocks. C: A for all layers, plus the three layers whose drawing *is* a building block (routes → `line`, traffic → `flow`, weather → `particles`) draw through block renderers extracted verbatim from their own modules. | A: no visual risk but the blocks are new code nobody uses yet. B: fog, depth haze, clouds, vision and the stash markers carry behaviour (exploration, filters, stealth checks, pickups) no block can express; pixel parity is unprovable. C: identical output by construction (same code, moved), proved by recorded draw calls; the blocks a pack uses are the ones the first pack already runs every day. | **C** |
| L-02 | How does a pack change a built-in (kernel) layer? | A: in the same `layers` array: a row whose id is a kernel layer id adjusts that layer's menu text and order, `applies`, `legend`, or switches it `off`; its slot, type, source and style stay the kernel's. B: a separate `layers_kernel` map. C: kernel layers cannot be changed. | A: one list, one order, zero effort for packs that change nothing (the first pack declares no layers and stays identical). B: two places to look. C: a pack with no routes still shows a dead "routes" row forever. | **A** |
| L-03 | Name of the move-along-a-line block. | A: keep `flow`, the id reserved by K-R56 and already in `layers.schema.json`; the glossary says "flow = path motion". B: rename to `path-motion`. | A: no schema churn. B: a reserved enum value changes for no gain. | **A** |
| L-04 | Does a `flow` layer also draw the path it moves along? | A: `flow` draws only the moving dots; an optional `style.path` (line style) draws the polyline beneath, in the same layer. B: a patrol route is always two layers (`line` + `flow`). | A: one menu row for one thing the user sees; the first pack's traffic layer (dots only) is `flow` without `path`. B: two rows that must be switched together. | **A** |
| L-05 | Coordinates of declared features. | A: the open view's frame (0..1 of width and height, kernel K-R31), with the feature's `view`, or a `node` reference drawn where the current-location engine draws that node. B: metres of the view's extent. C: nodes only. | A: the same numbers the pack's markers and routes already use; a zero-code author copies them from the viewer. B: not every view has an extent. C: no lines or areas. | **A** |
| L-06 | Who does what with `applies` (S7 greys inapplicable layers and pauses their animation)? | A: S8 owns the data form, the pure evaluator and `registry.applicable(id, ctx)`; S7 owns the greyed menu row and the rAF pause. If S7 has not landed when S8-2 runs, a pack-declared row that does not apply is hidden, the way the routes row is hidden today. B: S8 also builds the greying. | A: no overlap; either order of S7 / S8 works. B: two steps edit the same menu code. | **A** |
| L-07 | Default visibility of a pack-declared layer when `menu.default` is absent. | A: on (the author declared it to be seen); a `sound` layer is always off until the user switches it on. B: off. | A: the town acceptance layers show at once; audio never starts by itself. B: an author must remember `default: true` every time. | **A** |
| L-08 | Where the visibility of declared layers is stored. | A: one key `edenMapLayers` (a JSON object id → `'1'` / `'0'`), namespaced per pack by the storage service like every key; kernel layers keep their existing keys. B: one key per layer. | A: one registered key, no growth per layer; kernel parity untouched. B: an unbounded key family. | **A** |
| L-09 | Legend rows contributed by layers. | A: the drawer's legend tab lists the pack's `ui.legend` rows first, then the rows of every registered, visible, applicable layer under the layer's menu label, each with a swatch drawn from the layer's style; the tab shows when either list has rows (never on a 3D page). B: only `ui.legend`. | A: the town gets a legend with no extra field; the first pack has no layer rows, so its legend tab and its show rule are unchanged. B: a pack-declared layer has no explanation anywhere. | **A** |
| L-10 | Reading card variables (MVU) for layers. | A: the host's MVU bridge reads the paths that pack layers declare (read only, at most 8 per pack, values capped) and sends them in one new message; a value can place points (a list of place names) or gate a layer (`applies.mvu`). B: the viewer receives the whole `stat_data`. C: no MVU source. | A: the one-way data flow holds (only the bridge touches the host globals), nothing is written, the payload is small. B: leaks unrelated data into the viewer and the self-check. C: the plan's "MVU variables (read only)" source is missing. | **A** |
| L-11 | I-04: navigator overlay events (`OP_CLUE`, `OP_MARKER`). | A: a kernel layer `nav-ops` (point block; clues pulse by urgency, markers carry their label); the host sends the validated ops in one new message stamped with the map of the player's current place; a clue is placed by its name through the node tree first, else by its `nx` / `ny` on the stamped map; session only (cleared on a chat change, aged out after 20 messages like op events); the layer applies only while it holds rows. B: fold clues into the existing clue layer. C: leave them undrawn. | A: the navigator's output becomes visible exactly where it is meant and disappears with the session; nothing is persisted, so the chat log stays the only truth. B: mixes navigator guesses with event-derived clues. C: the plan item stays open. | **A** |
| L-12 | Shape of the local extension `EdenMap.addLayer()`. | A: data only: a layer declaration validated like a pack layer (trust "local"), id prefix `local-`, sources inline / view / events / people / items / routine, session scoped; plus `removeLayer`, `setLayerData`, `layers`. B: also accept drawing callbacks. | A: a user script cannot break the viewer or another layer, and the same validator covers packs and scripts. B: arbitrary code on every frame inside the viewer. | **A** |
| L-13 | E-03 local prop pack: how much now? | A: a local store of user files (glb, png, webp, svg) in IndexedDB, technical validation only (signature, size, count), use as point icons of local layers, click-to-place on flat maps through a kernel layer `local-props`; placing a glb inside a 3D page waits for S9b's edit mode. B: full 3D placement now. C: park it. | A: the interface, storage and validation exist and are used; nothing leaves the device. B: the generic 3D viewer is at its line cap (916 in the ratchet ledger) and needs the S9b editor anyway. C: the plan item stays open. | **A** |
| L-14 | Q-01: ambience as a pack-declared layer. | A: a new kernel block `sound` (no pixels; slot `fx`), driven by the rescued pure engine `map/core/ambience.mjs` reused verbatim and its WebAudio half ported to today's names; its menu row is always off by default; the first pack gets no ambience data in S8 (a content decision for its own line); the example pack gets one default-off demo layer. B: ambience as a separate switch outside the layer menu. | A: one switch place for everything the map adds; Q-01 closes with the three rescued files reused. B: a second switching UI. | **A** |
| L-15 | K-R64 promised that S8 gives the generic 3D viewer's manifest a v2 schema. | A: S8-1 writes `map/data/schema/v2/scene3d.schema.json` from `core/scene3d-manifest.mjs` and checks every shipped 3D manifest in `tools/check_pack.py`. B: defer to S9. | A: the promise is kept where it was made; small (a schema file and a check). B: S9 is designed in parallel and does not know about it. | **A** |

## 1. Scope

S8 turns the fixed set of viewport layers into declared layers: data says which layers exist, where they sit, when they
apply, how they are labelled and explained; generic building blocks draw what a pack adds. Three implementation prompts
(Sonnet · High), one unit each:

- **S8-1** — contract K-R79, K-R81–K-R83, K-R85, K-R104; the tightened `layers` schema; pure core `core/layer-spec.mjs`
  (validation, merge with the kernel list, sources, `applies`) and `core/layer-defaults.mjs` (the kernel list = today's
  17 layers as declarations); every module registers through its declaration with identical results; `RT.layers` from
  the pack (overlay for schema-1 packs); `registry.patch` / `registry.applicable`; the 3D manifest schema; parity probe
  `layer_dump`.
- **S8-2** — contract K-R80, K-R84; block renderers (`point`, `area`, `line`, `label` as map overlays; `flow`,
  `particles`, `tint` on slot canvases); routes, traffic and weather draw through the extracted renderers (recorded-call
  parity); pack-declared layers with the inline / file / view / events / people / items / routine sources; the layer
  menu rows and the legend rows; the town acceptance layers "patrol route" and "danger zone" (data only); probe
  `pack_layers`.
- **S8-3** — contract K-R86–K-R89; MVU source and `applies.mvu` (host-fed values); the navigator overlay layer
  `nav-ops` (I-04); `EdenMap.addLayer` and friends; the local prop pack (E-03) with the `local-props` layer; the `sound`
  block with the rescued ambience engine (Q-01); probe `layers_ext`.

Out of S8: greying inapplicable rows and pausing animation (S7, L-06); the 3D pages' own layer registry
(`three/particles.mjs` `particles3d`) and placing props inside 3D pages (S9b); in-viewer editing of layers and export
(S9b); renaming storage keys, protocol names and `EdenMap` (S10); ambience data for the first pack (its content line).

## 2. Model (K-R79)

### 2.1 One declaration

A layer is one row of the pack's `layers` array (kernel K-R56 shape, now complete):

```
Layer = {
  id:      string,             // ^[a-z][a-z0-9_-]{0,31}$ ; unique in the pack
  type:    'point' | 'area' | 'line' | 'label' | 'tint' | 'particles' | 'flow' | 'sound',
  slot:    'base' | 'depth-haze' | 'fog' | 'routes' | 'trips' | 'events' | 'markers' | 'labels' | 'fx' | 'interaction',
  source?: string,             // §3.2; absent with `data` = inline
  data?:   { features: Feature[] } | SoundData,   // inline data (§3.1, §12)
  filter?: { kinds?: string[] },                  // keep only features whose kind is listed
  applies?: Applies,           // §5
  style?:  Style,              // §4
  menu?:   Menu,               // §6
  legend?: LegendRow[],        // §7
  off?:    boolean,            // kernel ids only: keep the layer but drop its menu row and keep it invisible
  _…, x-…                      // comments and author extensions (K-R04)
}
```

### 2.2 Kernel layers and pack layers (merge)

The kernel ships a list of layers (`KERNEL_LAYERS`, §8.1). The effective list is the kernel list merged with the pack's
rows by id (L-02):

- a row whose id is a kernel id **adjusts** that layer: `menu` (label, title, i18n, order, hidden), `applies` (ANDed
  with the layer's own code rules), `legend`, `off`. Its `type`, `slot`, `source`, `style`, `data` and `filter` are
  ignored and reported (`layer-kernel-fixed`); a kernel layer's default visibility cannot be changed by a pack (each
  kernel layer keeps its own stored switch);
- any other id **declares** a new layer; it needs `type`, `slot` and either `source` or `data`, else it is dropped
  (`layer-incomplete`); a repeated id keeps the first row (`layer-duplicate`);
- menu order: a kernel layer keeps its kernel menu order (10 … 80) unless `menu.order` is given; a new layer's order is
  `menu.order` when given, else `1000 + its index in the array` (after every kernel row, in array order);
- packs cannot declare `source: "kernel"`; the kernel list is closed.

A pack with no `layers` block uses the kernel list unchanged (K-R60 "built-in default layers"). This is the first pack.

### 2.3 Building blocks

| Block | Geometry per feature | Drawn as | Animated |
|---|---|---|---|
| `point` | `at` or `node` | an HTML element in the map overlay (constant screen size) | `style.pulse` |
| `label` | `at` or `node` + `label` | an HTML element in the map overlay | no |
| `line` | `pts` (≥ 2), `closed` | one SVG overlay per layer, non-scaling strokes | no |
| `area` | `pts` (≥ 3, closed) or `at` + `r` (circle) | the same SVG overlay | no |
| `flow` | `pts` (≥ 2), `closed` | a canvas in the layer's slot; dots move along the path | yes |
| `particles` | none (the whole view) | a canvas in the layer's slot | yes |
| `tint` | none (the whole view) | a canvas in the layer's slot | no |
| `sound` | none | no pixels (Web Audio) | — |

The kernel decides the drawing; the pack only gives geometry and style values. Reduced motion stops every animation
(flow dots and particles are not drawn, pulses become static); the data-saver tier halves dot and particle counts, as
the traffic and weather layers do today.

## 3. Sources and features (K-R81)

### 3.1 Feature shape

```
Feature = {
  id?:     string,
  view?:   string,            // view id the coordinates are in; default: the single id of applies.views
  at?:     [x, y],            // 0..1 of the view's width and height (K-R31)
  node?:   string,            // a node id; drawn where the current-location engine draws that node's name
  pts?:    [[x, y], …],       // 2..2000 points
  closed?: boolean,
  r?:      number,            // circle radius, fraction of the width (area)
  kind?:   string,            // ^[a-z][a-z0-9_-]{0,31}$ ; picks style.by[kind] and filter.kinds
  label?:  string,            // ≤ 60 code points, shown as text only (K-R64)
  i18n?:   { <lang>: { label } }
}
```

A feature is drawn only on its view: features whose `view` is not the open view are skipped; a `node` feature is
drawn when the node is drawn on the open map (`drawnAt(hereRes(name))`, the path the trips layer uses). A feature with
neither a usable view nor a node is dropped (`feature-no-view`).

### 3.2 Source kinds

| `source` | Features come from | Who may use it |
|---|---|---|
| absent + `data`, or `inline` | `data.features` | packs, local layers |
| `file:<path>` | a JSON file `{ "features": [...] }` (or sound data) under the pack's base, `.json`, ≤ 256 KB | packs |
| `view:routes` | the open view's data file `routes`: `{ pts, kind, closed: kind ≠ 'lane' && from === to }` | packs, local layers, kernel |
| `view:markers` | the open view's data file `markers`: `{ id, at: [nx, ny] }` (anchor `ax`/`ay` first, as today) | packs, local layers, kernel |
| `events` | open events (entity protocol K-R71): a point at the event's node; `kind` = event type id, `label` = the event's title | packs, local layers |
| `people` | people (K-R71): `kind` = roster group id, `label` = name | packs, local layers |
| `items` | stash rows that have a place (K-R74), hidden rows only where the player stands (as the stash markers do) | packs, local layers |
| `routine` | the pack's schedule at the current world time (`placesAt`), `kind` = schedule row id | packs, local layers |
| `mvu:<path>` | host-fed value (K-R86): a list of place names → points | packs |
| `ops` | navigator overlays (K-R86) | the kernel `nav-ops` layer; packs may restyle it by id |
| `kernel` | the kernel's own module | kernel only |

Entity sources never invent anything: they show what the entity adapters already hold; an unknown type is "other"
(brief rule 8).

### 3.3 Limits and trust

For every pack (shipped or foreign; runtime lenient, tools strict, K-R06): at most 32 new layers per pack, 1000
features per layer, 2000 points per feature, 8 legend rows per layer, 16 `style.by` kinds, 8 distinct MVU paths per
pack, a `file:` source ≤ 256 KB and under the pack's base after URL resolution (K-R64). A foreign pack (K-R63) may
declare layers with every source except `kernel`. Local layers (K-R87) may not use `file:`, `mvu:` or `ops`. Every
string reaches the page as text; every colour, icon, number and path is re-checked at run time and dropped when it
fails (K-R64).

## 4. Style (K-R80)

| Key | Blocks | Values | Default |
|---|---|---|---|
| `color` | all but `sound` | `#rrggbb`, `#rrggbbaa`, or a kernel colour token name (`--accent`, `--alert`, `--gold`, …, K-R58) | `--accent` |
| `opacity` | all but `sound` | 0..1 | 1 (`tint` 0.25) |
| `by` | all but `sound` | `{ <kind>: Style }`, ≤ 16; overrides per feature kind | — |
| `size` | `point` (px 4..32), `flow` (px 0.5..6), `label` (`micro` / `small` / `body`) | | 10 / 1.8 / `micro` |
| `icon` | `point` | a kernel icon name (`ui/icons.js`), or `prop:<id>` (local layers only, K-R88) | a dot |
| `pulse` | `point` | boolean | false |
| `tone` | `label` | `plain` / `chip` | `chip` |
| `width` | `line`, `area`, `flow.path` | px 0.5..8 | 1.4 |
| `dash` | `line`, `area`, `flow.path` | ≤ 6 numbers 0..40 | solid |
| `halo` | `line` | boolean (dark halo under the stroke, as the routes layer draws) | false |
| `fill`, `fill_opacity` | `area` | colour as `color`; 0..1 | `color`; 0.18 |
| `speed` | `flow` | 0.005..1 (path fraction per second) | 0.07 |
| `density` | `flow` | 1..64 dots per path | 12 |
| `trail` | `flow` | 0..0.05 (path fraction) | 0.006 |
| `path` | `flow` | a line style (`color`, `width`, `dash`, `halo`); absent = no path drawn (L-04) | absent |
| `preset` | `particles` | `rain`, `storm`, `sand`, `snow` (the kernel weather presets) | `rain` |

The traffic layer's night look (brighter, longer trails while the period is dark) is part of the `flow` block for
every flow layer: the block reads the same clock message the traffic layer reads today.

## 5. applies (K-R82)

```
Applies = {
  views?:      string[],   // open view id is one of these
  kinds?:      string[],   // open view kind: tiles | image | schematic | model3d
  nodes?:      string[],   // the open view's owner node is one of these or inside one of them
  node_types?: string[],   // the owner node's type is one of these
  periods?:    string[],   // the current period band id (K-R39)
  dark?:       boolean,    // the current band is (not) dark
  data?:       boolean,    // at least one feature on the open view (default true for point/label/line/area/flow, false otherwise)
  mvu?:        { path, equals?, min?, max?, truthy? }   // K-R86
}
```

Every key given must match (AND); inside a list any entry matches (OR); an absent or empty `applies` applies
everywhere. The viewer builds the context once per change (`layerContext()`: open view, its kind, its owner node and
the owner's ancestors and type, the period band and `dark` from the last clock message, the MVU values, the feature
count) and asks `registry.applicable(id, ctx)`. An inapplicable layer draws nothing and stops its animation frame. Its
menu row is greyed by S7; before S7 lands a pack-declared row that does not apply is hidden (L-06). For kernel layers a
pack's `applies` is ANDed with the layer's own code rules (for example the routes row stays hidden on a view without
routes).

## 6. Layer menu (K-R83)

```
Menu = { label: string, title?: string, i18n?: { <lang>: { label?, title? } }, order?: number, default?: boolean, hidden?: boolean }
```

Rows are rendered by today's data-driven menu (`renderLayerMenu`, one row per registered layer with `menu`, ordered by
`menu.order` then registration), re-rendered once when the pack's layers arrive. A new layer's row has element ids
derived from the layer id (`lyr-<id>`, box `lyrBox-<id>`); its text is the pack's `label` / `title` in the UI language
(`i18n.<lang>` first), set with `textContent`. `menu.default` (default true, L-07; always false for `sound`) is used
until the user switches the row; the user's choice is stored in `edenMapLayers` (L-08). `hidden` keeps the layer
registered without a row (it is still drawn when visible); `off` (kernel ids) keeps it registered, invisible and rowless.

## 7. Legend (K-R84)

```
LegendRow = { label: string, desc?: string, i18n?: { <lang>: { label?, desc? } }, kind?: string }
```

The drawer's legend tab (kernel `lg`, K-R70 `ui.legend`) lists, in this order: the pack's `ui.legend` rows (unchanged),
then, for each registered, visible and applicable layer in menu order, its legend rows under a heading with the layer's
menu label. Each layer row carries a small swatch drawn from the layer's style (`kind` picks `style.by[kind]`): a
stroke for `line` and `flow`, a filled square for `area` and `tint`, a dot for `point`, nothing for `label` and
`sound`. The swatch colour is set through a CSS custom property after the K-R64 re-check. The tab shows when the open
view is not a 3D page and either list has rows; today's rule (`depthData` and `ui.legend` rows) stays one of the two
conditions, so a pack without layer legends sees no change.

## 8. The first pack's layers on declarations (parity)

### 8.1 Kernel default list

Today 17 layers register on the viewer's `LayerRegistry` (`map/app/layer-host.mjs` and the modules below). S8-1 copies
their facts verbatim into `core/layer-defaults.mjs` `KERNEL_LAYERS`; each module then registers
`declared(id, { mount, unmount, setVisible, initialVisible })` and the registry ends up with exactly today's records.

| id | slot | kind | order | menu order | registered in | `type` (S8) |
|---|---|---|---|---|---|---|
| `base-overlay` | base | osd | 0 | 10 | `app/layer-host.mjs` `registerCoreLayers` | — |
| `alt-base` | base | osd | 1 | 20 (hidden) | same | — |
| `routes` | routes | osd | 0 | 30 (hidden) | same | `line` |
| `security` | markers | osd | 2 | 40 | `map/security.mjs` | — |
| `weather` | fx | canvas | 10 | 45 | `app/weather-view.mjs` | `particles` |
| `traffic` | fx | canvas | 20 | 46 | `app/traffic-view.mjs` | `flow` |
| `quests` | fx | canvas | 30 | 47 | `app/quests-view.mjs` | — |
| `loot` | interaction | dom | 10 | 48 | `app/stash-markers.mjs` | — |
| `vision` | fx | canvas | 25 | 49 | `app/vision-view.mjs` | — |
| `wander` | interaction | dom | 20 | 50 | `app/wander.mjs` | — |
| `trips` | trips | osd | 0 | 50 | `map/trips-view.mjs` | — |
| `labels` | labels | osd | 0 | 60 | `app/layer-host.mjs` | — |
| `markers` | markers | osd | 0 | 70 | same | — |
| `events` | events | osd | 0 | 80 | `map/events-view.mjs` | — |
| `fog` | fog | canvas | 0 | — | `app/fog.mjs` | — |
| `clouds` | depth-haze | dom | 0 | — | `app/clouds.mjs` | — |
| `depth-haze` | depth-haze | dom | 0 | — | `app/depth-haze.mjs` | — |

`type: —` means "drawn by kernel code" (`type: null` in the declaration). Menu ties (`wander` and `trips` at 50) are
broken by registration order, exactly as today; the declarations do not change registration order. The kernel layers
added by S8-3 are `nav-ops` (markers, point), `local-props` (markers, point); `sound` layers are pack-declared.

### 8.2 Drawing moved onto blocks

Three kernel layers draw through the block renderers (L-01 C). The code is moved, not rewritten:

- **routes → `line`**: the route SVG in `app/markers.mjs` L178–188 (path `d` per route, `halo` / class per kind, the
  `rtGap` mask for label gaps) becomes the `line` renderer; its pure part (`routePaths(routes, VW, VH)` → `[{ d, cls,
  pass }]`) moves to core and is compared with a frozen copy of today's `dOf` loop.
- **traffic → `flow`**: `app/traffic-view.mjs` `frame` L33–58 becomes `drawFlow(cx, input)`; `core/traffic.mjs`
  `trafficField` takes an optional `kinds` table (default `LANE_KINDS`, so the traffic layer is unchanged); a fake 2D
  context records every call, and old and new frames give the same call log for the same inputs.
- **weather → `particles`**: `app/weather-view.mjs` `frame` L28–43 (tint, particle strokes, lightning) becomes
  `drawParticles(cx, input)` with the same recorded-call parity.

Everything else — exploration fog, depth haze, clouds, the vision cones and stealth check, clue pulses, stash pickups,
wandering markers, trips, security badges, labels, markers, events — stays kernel code: those layers carry behaviour
that is not drawing. They are "on the mechanism" through their declarations (slot, order, menu, applies, legend).

## 9. Navigator overlays (K-R86, I-04)

The navigator (`tavern/llm-flow.mjs` W5, default off behind `edenMapNav` and a first-run consent) already parses
`OP_CLUE { name, nx, ny, urgency }` and `OP_MARKER { id, nx, ny, label }` through the operation sandbox
(`tavern/operation-dsl.mjs` `apply` → `clues`, `markers`, `src: 'op'`) and drops them. S8-3 delivers them:

- the host keeps `opOverlays = { clues, markers }` for the session, appends each navigator run's output stamped with
  `floor` and `map` = `SpatialM.locate(regNow, here)?.mapId ?? null` (the map of the player's current place, the same
  resolution the spatial contract uses), drops rows older than 20 messages (the op-event rule), caps each list at 12,
  and posts `eden-map:ops { clues, markers, map, floor }` when it changes; a chat change clears it;
- the viewer's kernel layer `nav-ops` (slot `markers`, `point` block, menu row "Navigator overlays", default on —
  the navigator itself is the opt-in) draws a clue where its `name` locates through the node tree when that place is
  drawn on the open map, else at `nx` / `ny` on its stamped map; a marker at `nx` / `ny` on its stamped map with its
  `label`; clues pulse, size by urgency (1–3); `applies.data` = at least one row on the open map;
- nothing is written to the chat, the chat variable or the add-on worldbook; the rows are labelled as navigator
  suggestions in the tooltip.

## 10. Local extension `EdenMap.addLayer` (K-R87)

`window.EdenMap` is an external contract (S10 renames it); S8-3 adds methods, renames nothing.

| Method | Returns | Notes |
|---|---|---|
| `addLayer(def)` | `{ ok, id, problems }` | `def` is a layer declaration (§2.1); trust "local"; `id` must start with `local-`; sources inline / `view:*` / events / people / items / routine; at most 16 local layers; a repeated id replaces the previous local layer |
| `removeLayer(id)` | boolean | local layers only |
| `setLayerData(id, features)` | `{ ok, problems }` | replaces an inline local layer's features (validated, capped) |
| `layers()` | `[{ id, type, slot, visible, applicable, source, count }]` | every registered layer, read only |

Local layers live for the page session (a user script re-adds them on load, as it re-subscribes with `on`); only their
visibility is remembered (`edenMapLayers`). On the host page the same methods forward to the viewer when it is open and
queue until `eden-map:ready` otherwise. `EDEN_API` (`tavern/extension-api-contract.mjs`) gains `addLayer: 1`,
`removeLayer: 1`, `setLayerData: 2`, `layers: 0` (and the prop methods of §11).

## 11. Local prop pack (K-R88, E-03)

User-local 3D props and icons, never uploaded:

- **Store**: IndexedDB database `spatialProps`, store `props`, key `<pack id>::<prop id>`; record `{ id, name, type:
  'glb' | 'png' | 'webp' | 'svg', bytes, w?, h?, createdAt, blob }`. Pure rules (signature, caps, ids) in
  `core/prop-pack.mjs`, the thin IndexedDB wrapper in `app/prop-store.mjs` (the `core/room-gallery-db.mjs` pattern).
- **Validation (technical only)**: glb = bytes 0–3 `glTF` and version 2, ≤ 8 MB; png = the 8-byte PNG signature; webp =
  `RIFF` … `WEBP`; images ≤ 1 MB; svg = UTF-8 text with an `<svg` root, ≤ 256 KB, refused when it contains `<script`,
  `<foreignObject` or an `on…=` attribute; at most 64 props and 64 MB per pack. Images are shown only through `blob:`
  object URLs in `<img>` elements (no markup injection); nothing is sent to the host, the model or any URL.
- **API**: `addProp(file, { name? }) → { ok, id, problems }`, `removeProp(id)`, `props() → [{ id, name, type, bytes }]`,
  `placeProp(id, { map, at } | { pick: true }) → Promise<{ ok, map, at }>` (pick = the next click on the map),
  `unplaceProp(id, map)`.
- **Placements** are per chat in `edenMap:chat:<chat id>:props` (the registered per-chat prefix; ≤ 200 rows `{ prop,
  map, at }`), drawn by the kernel layer `local-props` (slot `markers`, `point` block: images as the icon, a glb as the
  kernel `cube` icon with its name). They are the user's own decoration, like custom names and avatars: local, not chat
  facts, never injected.
- **Icons**: a local layer's point style may say `icon: "prop:<id>"`; pack layers cannot (a pack cannot know a user's
  files).
- **3D**: placing a glb inside a 3D page is S9b (edit mode), L-13.

## 12. Ambience as a sound layer (K-R89, Q-01)

The rescue branch `rescue/ambience-part4-4` holds three new files (`map/core/ambience.mjs`, `map/app/ambience.mjs`,
`tests/ambience.test.mjs`); its nine other files are stale copies and are not used (Q-01). S8-3:

- copies `map/core/ambience.mjs` and `tests/ambience.test.mjs` verbatim (only the header comment's example map id and
  data path become neutral wording);
- ports `map/app/ambience.mjs` to `map/app/sound-block.mjs`: today's names (`mapRegistry`, `currentMapId`, `osdViewer`
  from `app/state.mjs`, the storage service, `register` from `app/plugins.mjs`), night from the host clock message and
  weather from `WeatherApi.now()` instead of the old globals and the `tc:weather` event;
- a `sound` layer's data (inline `data` or `file:`) is the ambience format `{ rules: [{ match, scenes }], recipes?,
  master? }`; `match.map` is the open view id; `applies` decides where the layer is live at all;
- a recipe may also be a pack file loop `{ kind: 'file', src: '<rel>.ogg', alt?: '<rel>.mp3' }` (paths relative to
  the pack's base; the app fetches, decodes and loops it; a missing or broken file stays silent);
- the row is off by default whatever `menu.default` says; the AudioContext is created on the first switch-on, resumed
  only after a user gesture, suspended while the page is hidden or the layer does not apply;
- the example pack gets one default-off layer `harbour-sound` (wind and crackle on its harbour view); the first pack
  gets none in S8. Later (AMBIENT-SOUND) eden gained a default-off `tier-ambience` file-loop layer — wind and birds
  on the upper tier, crowd and rail on the middle, factory and steam on the low, lighter at night; the loops and
  their per-file licences are in the pack's `credits.assets`.

## 13. Acceptance: the example pack adds two layers with data only

`map/packs/town/overlay.v2.json` (new; declared by the manifest as `data.overlay`, K-R67) carries:

```json
{
  "schema": 2,
  "layers": [
    {
      "id": "patrol", "type": "flow", "slot": "routes", "source": "inline",
      "applies": { "views": ["town_hill"] },
      "style": { "color": "#9ad0f5", "speed": 0.05, "density": 6, "size": 2,
                 "path": { "color": "#9ad0f5", "width": 1.4, "dash": [10, 4, 2, 4] } },
      "data": { "features": [ { "view": "town_hill", "closed": true,
                 "pts": [[0.7486, 0.6373], [0.6615, 0.6028], [0.637, 0.6663], [0.7486, 0.6373]] } ] },
      "menu": { "label": "巡逻路线", "title": "巡夜队每晚走的一圈：旧堡、集市广场、钟楼",
                "i18n": { "en": { "label": "Patrol route", "title": "The night watch's round: keep, market square, clock tower" } } },
      "legend": [ { "label": "巡逻路线", "desc": "淡蓝点划线，上面的光点是巡夜队",
                    "i18n": { "en": { "label": "Patrol route", "desc": "Pale-blue dash-dot line; the moving dots are the night watch" } } } ]
    },
    {
      "id": "danger", "type": "area", "slot": "routes", "source": "inline",
      "applies": { "views": ["town_harbour"] },
      "style": { "color": "--alert", "fill_opacity": 0.2, "width": 1.2, "dash": [6, 4] },
      "data": { "features": [ { "view": "town_harbour",
                 "pts": [[0.47, 0.80], [0.58, 0.79], [0.60, 0.88], [0.49, 0.90]] } ] },
      "menu": { "label": "危险区域", "i18n": { "en": { "label": "Danger zone" } } },
      "legend": [ { "label": "危险区域", "desc": "鱼市仓库一带，夜里别独自靠近",
                    "i18n": { "en": { "label": "Danger zone", "desc": "Around the fish-market warehouses; keep away alone at night" } } } ]
    }
  ]
}
```

(The exact coordinates are the executor's to adjust on screen; the patrol ring passes the three hill places of
`town_hill.json`, the danger polygon surrounds the fish market of `town_harbour.json`.) No engine file names either
layer. Probe `pack_layers` (S8-2) checks: both rows in the menu with the pack's labels; on `town_hill` the patrol path
and moving dots are drawn and the danger row does not apply; on `town_harbour` the danger polygon is drawn and the
patrol row does not apply; the legend tab lists both rows with swatches; switching a row off removes its drawing and is
remembered (`tcp.town.Layers`) across a reload; the first pack's menu rows, slots and registry summary are identical to
the base (`layer_dump`).

## 14. Kernel-schema additions (planned)

Reserved in `docs/kernel-schema.md` §13 ("Planned in S8"); the full text lands with the step that implements it:

| id | Rule | Section | Step |
|---|---|---|---|
| K-R79 | The layers block: one declaration, kernel list, merge by id, menu order, `off`, limits | §9 | S8-1 |
| K-R80 | Building blocks and style keys; reduced motion and data-saver behaviour | §9 | S8-2 |
| K-R81 | Sources and the feature shape; trust per source | §9 | S8-1 |
| K-R82 | `applies` keys, evaluation and the S7 split | §9 | S8-1 |
| K-R83 | Menu rows and the visibility store `edenMapLayers` | §9 | S8-1 |
| K-R84 | Legend rows from layers; the legend tab's show rule | §10.1 | S8-2 |
| K-R85 | The overlay of a schema-1 pack may carry `layers` | §13 | S8-1 |
| K-R86 | Host-fed values: MVU paths, `applies.mvu`, navigator overlays and their two messages | §9 | S8-3 |
| K-R87 | Local extension `addLayer` / `removeLayer` / `setLayerData` / `layers` | §9 | S8-3 |
| K-R88 | Local prop pack: store, validation, placements, `prop:` icons | §9 | S8-3 |
| K-R89 | The `sound` block and the ambience data | §9 | S8-3 |
| K-R104 | The v2 schema of the generic 3D viewer's manifest (K-R64's promise) | §4.5 | S8-1 |

## 15. Step plan

| Step | Size | Prompt | Contents |
|---|---|---|---|
| S8-1 | L (one prompt, ≈ 6 h) | Appendix S8-1 | contract, schema, core spec + kernel list, declarations in every module, `RT.layers`, registry `patch` / `applicable`, 3D manifest schema, probe `layer_dump` |
| S8-2 | L (one prompt, ≈ 6 h) | Appendix S8-2 | block renderers, routes / traffic / weather on blocks, pack-declared layers, menu and legend rows, town acceptance data, probe `pack_layers` |
| S8-3 | L (one prompt, ≈ 6 h) | Appendix S8-3 | MVU values, navigator overlays, `addLayer`, prop pack, sound block, probe `layers_ext` |

Order: S8-1 → S8-2 → S8-3, strictly. S7 may land before or after any of them (L-06).

Parallel work with S9 (`docs/zero-config.md` §13): S8-1 and S8-2 edit `app/boot.mjs` and `app/nodes-runtime.mjs`, so each
runs serially with S9-1 (not at the same time); S9b runs after S8-1 (both edit `core/pack-v2-spec.mjs`, the v2 schemas and
`tools/check_pack.py`); S8-3 and S9-3 both add a host-message handler: on a rebase conflict keep both handlers.

## 16. Risks

- **Registration timing.** Several kernel layers register at module evaluation, before the node runtime exists; the
  pack's adjustments therefore arrive later through `registry.patch` and a second menu render. A probe that reads the
  menu before the runtime exists sees the kernel rows (as today).
- **Visual parity of the moved renderers.** Covered by recorded-call tests (node) plus the existing screenshot probes
  (`p4_traffic`, `p4_fx`, `s43_parity`); any difference stops the step (§9 of each spec).
- **Card wording in a core fallback.** The core dictionary's `routes_title` names a first-pack place (brief §2.1);
  S8-1 moves the exact text into the first pack's manifest `strings` (the S4-4 mechanism) and leaves a neutral core
  text, so the first pack shows the same words.
- **Two designers in parallel.** S9's design landed first with K-R90–K-R103 and left K-R79–K-R89 to S8; the twelfth S8
  rule (3D manifest schema) therefore takes K-R104. Executors of S8 and S9 steps keep both sides on any rebase conflict
  in `docs/kernel-schema.md` §13 and `docs/todo.md`.
- **Audio.** A sound layer must never start by itself: the default-off rule is enforced in code, not only in data.

## Appendix — Executable specs

The three prompts below are complete: an executor (Sonnet · High) needs no other context than the repository. Line
numbers are at origin/preview `7958b5ad`; when they have moved, find the same code by the quoted names.

### S8-1 — layers contract, kernel declarations, pack layers in the runtime

Model: Sonnet · High · Size L (one prompt, about 6 h). Written by the S8-design session on 2026-10-01 at origin/preview
`7958b5ad` (design: `docs/layers-schema.md`; working decisions L-01 … L-15 applied by default).

**0. Why.** Plan `docs/plans/spatial-os.md` §5 S8: `layers` data rendered by generic blocks, the first pack's layers
moved onto the mechanism. Today the 17 viewport layers are hard-wired descriptors spread over 12 modules and a pack
can declare nothing (`map/data/schema/v2/layers.schema.json` is "RESERVED"). This step fixes the contract, puts every
layer's facts into one kernel list with **identical registry results**, reads a pack's `layers` (from the overlay for
schema-1 packs) into the runtime, and lets packs adjust kernel rows. Nothing visible changes for the first pack. S8-2
draws pack-declared layers; S8-3 adds host-fed sources and the extensions.

**1. Read first.**
- `docs/agent-brief.md` (all; §2.1 no card terms, §2.2 ratchet, §2.6 new toggles registered, §3 parity rule).
- `docs/layers-schema.md` §0 (L-01, L-02, L-05, L-06, L-08, L-15), §2, §3, §5, §6, §8.1, §14, §16.
- `docs/kernel-schema.md` K-R04, K-R06, K-R56, K-R60, K-R63, K-R64, K-R66, K-R67–K-R70 (overlay merges), §13 "Planned in
  S8", §14.2.
- `docs/ARCHITECTURE.md` §3 (module map; gated by `tools/check_arch_doc.py`), `docs/naming.md` glossary ("layer slot"
  vs "map level").
- Code: `map/core/layer-registry.mjs` (all, 81 lines); `map/app/layer-host.mjs` (all, 74 lines: `registerCoreLayers`
  L33–53, `renderLayerMenu` L55–74); the register calls: `app/weather-view.mjs` L58–68, `app/traffic-view.mjs` L70–80,
  `app/quests-view.mjs` L73–83, `app/stash-markers.mjs` L87–93, `app/vision-view.mjs` L100–110, `app/wander.mjs`
  L134–148, `app/depth-haze.mjs` L73–78, `app/fog.mjs` L57, `app/clouds.mjs` L126, `map/security.mjs` L48–50,
  `map/trips-view.mjs` L76–78, `map/events-view.mjs` L383–385; `app/boot.mjs` L82 (`buildRuntime`), L98 (register
  calls, first `renderLayerMenu`), L125 (`mountAll`); `app/nodes-runtime.mjs` `makeRuntime` L27–76; `core/compat-v1.mjs`
  L29–71; `core/overlay-v2.mjs` (pattern of `applyOverlayUi` L133–165); `core/pack-v2-spec.mjs` `layersBlock` L142–145
  and `recheck` L154–158; `core/pack-v2.mjs` L146; `tools/check_overlay.mjs` (evOnly L18); `core/scene3d-manifest.mjs`
  (all, 66 lines); `tools/check_pack.py`; `map/i18n/zh.json` / `en.json` key `routes_title`; the first pack's manifest
  `strings` (S4-4 mechanism: `key` and `key@en`).
- Tests that pin layers: `tests/layer_registry.test.mjs`, `tests/app_modules.test.mjs`, `tests/pack_schema_v2.test.mjs`,
  `tests/estate3d_manifest.test.mjs`, `tests/compat_v1.test.mjs`.

**2. Scope.** IN: T0 baseline and dump · T1 contract text · T2 schema · T3 `core/layer-spec.mjs` · T4
`core/layer-defaults.mjs` and declarations in every module · T5 registry `patch` / `applicable` / `describe` · T6
`RT.layers` from the pack and overlay · T7 kernel adjustments applied at boot · T8 3D manifest schema · T9 neutral
`routes_title` · T10 docs, probe, RESULT. OUT (do not touch): drawing code of any layer (S8-2); new layers from packs
being drawn (S8-2; T7 only adjusts kernel rows and keeps new rows in `RT.layers`); the legend tab (S8-2); host files
under `map/tavern/` (S8-3); `map/viewer.html` (707 lines in the ledger: no new line); storage keys other than
`edenMapLayers`; any first-pack data file except the manifest `strings` entry of T9; the 3D pages' registries.

**3. Setup.**
```bash
git fetch
git worktree add -b s8-1-layers <scratchpad>/s8-1 origin/preview
```
Baseline before any edit: `node --test tests/*.test.mjs` (note the count) and `bash tools/smoke.sh` green. Write the
probe of T10 first (it only reads), run `node tools/browser/layer_dump.mjs <scratchpad>/s8-1-before.json` on the
untouched tree and keep the file.

**4. Tasks.**

**T0 — Freeze.** T9 edits the first pack's manifest. If `docs/plans/FREEZE_MAPS` exists on origin/preview, stop per §9.
Create it (`S8-1 layers contract; started <UTC>`), commit `chore: freeze maps.json for S8-1`, push at once
(`bash tools/push_preview.sh --head --no-escalate`). Delete it in the last commit, also when you stop early.

**T1 — Contract.** In `docs/kernel-schema.md` and `.zh.md`: §9 heading becomes "layers"; keep K-R56 and add after it the
full rule paragraphs K-R79 (from design §2.1–§2.2, §3.3 limits), K-R81 (§3.1–§3.3), K-R82 (§5), K-R83 (§6); add K-R85
at the end of §13 after K-R78's line (style of K-R70; text: design §13 file, `applyOverlayLayers`); add K-R104 to §4.5
(the schema file, what it settles, `tools/check_pack.py` checks shipped manifests). Replace the K-R79, K-R81–K-R83,
K-R85, K-R104 bullets of the "Planned in S8" list with "Added by S8-1: …" (keep the others). Update the header's id
range sentence. Both editions keep identical heading structure.

**T2 — Schema.** `map/data/schema/v2/layers.schema.json`: title without "RESERVED"; `required: ["id"]`; properties
`type` (enum adds `sound`), `slot`, `source` (pattern `^(inline|events|people|items|routine|ops|view:(routes|markers)|file:[^\n]{1,200}\.json|mvu:[^\n]{1,80})$`),
`data`, `filter` (`kinds`: array of id strings ≤ 32), `applies` (closed object per design §5, `mvu` as an object with
`path` required), `style` (object; per-key types per design §4, `additionalProperties: false`), `menu` (closed: `label`
1–60, `title` ≤ 200, `i18n`, `order` number, `default`, `hidden`), `legend` (≤ 8 rows, closed), `off`; `maxItems` 64.
Description cites K-R79–K-R83. `core/pack-v2-spec.mjs` `layersBlock` becomes a re-export of the new validator from
T3 (`export { layersBlock } from './layer-spec.mjs'`), so `validate2` checks layers with the same rules; keep
`pack-v2-spec.mjs` ≤ 201 lines. `tests/pack_schema_v2.test.mjs`: one valid and three invalid layer rows.

**T3 — `map/core/layer-spec.mjs` (new, pure, ≤ 350 lines).** Imports only `./pack-v2-spec.mjs` helpers it needs
(`recheck`, combinators) — if that would create an import cycle with T2's re-export, put the combinators you need in the
new file instead. Exports:
- `BLOCKS` (8 names), `SLOTS` re-exported from `./layer-registry.mjs`, `LIMITS = { layers: 32, features: 1000, points:
  2000, legend: 8, by: 16, mvu: 8, fileBytes: 262144, local: 16 }`.
- `parseSource(s)` → `{ kind, arg }` | `null` (`'view:routes'` → `{ kind: 'view', arg: 'routes' }`; `undefined` with
  data → `{ kind: 'inline' }` is decided by `normLayer`).
- `normFeature(raw, type, { view })` → feature | `null` (+ problem codes `feature-*`): numbers finite and 0..1 for
  `at` / `pts`, point counts per block (§2.3), `kind` id pattern, `label` ≤ 60 code points, `i18n` labels.
- `normLayer(raw, { kernelIds, trust })` → `{ layer | null, problems }`: kernel id → only `menu`, `applies`, `legend`,
  `off` kept (others → `layer-kernel-fixed`); new id → needs `type`, `slot`, `source` or `data` (`layer-incomplete`);
  `trust: 'local'` → id must start `local-` and sources limited (§3.3, `local-source`); `source: 'kernel'` refused;
  style values re-checked: colours through `recheck.hex` (also `#rrggbbaa`) or a token name matching the K-R58 list,
  numbers clamped to the design §4 ranges, `icon` a kernel icon id pattern or `prop:<id>` for local only.
- `mergeLayers(kernel, rows, { trust })` → `{ layers, problems }`: design §2.2 (first row per id wins; menu order rule;
  at most `LIMITS.layers` new layers). Output layers carry `origin: 'kernel' | 'pack' | 'local'`.
- `appliesTo(applies, ctx)` → boolean per design §5; `ctx = { view, kind, owner, ancestors: [], nodeType, period, dark,
  count, mvu: { <path>: value } }`; unknown keys ignored; `data` default per block (§5).
- `layersBlock` (validator for `validate2`, T2).

**T4 — `map/core/layer-defaults.mjs` (new, pure, ≤ 120 lines) and declarations in every module.**
- `KERNEL_LAYERS` = a frozen array, one entry per row of design §8.1, holding exactly the non-function fields of
  today's descriptors (`id`, `slot`, `kind`, `order` when given, `menu` verbatim — ids, box ids, label keys, labels,
  title keys, titles, `hidden`), plus `type` (design §8.1 column; `null` for "—") and `source: 'kernel'`. Do not include
  `initialVisible` (it is computed by the modules). `KERNEL_IDS` = the ids. `kernelDecl(id)` → a fresh copy or `null`.
- Test helper `tests/helpers/layers_v1_frozen.mjs`: a verbatim copy of today's 17 descriptor literals with the
  functions removed (copy them from the files listed in §1 before you edit anything).
- `app/layer-host.mjs`: new export `declared(id, impl)` → `{ ...kernelDecl(id), ...impl }` (`impl` = `mount`,
  `unmount`, `setVisible`, `initialVisible`, `describe`; throws on an unknown id). Every register call listed in §1 is
  rewritten to `registry.register(declared('<id>', { …the same functions and initialVisible… }))`; nothing else in those
  modules changes. `registerCoreLayers` keeps its call order.
- `tests/layer_defaults.test.mjs`: for every id, `kernelDecl(id)` equals the frozen literal plus `type` / `source`;
  ids unique; slots valid; menu orders as the table.

**T5 — Registry additions** (`core/layer-registry.mjs`, keep ≤ 150 lines).
- `patch(id, { menu?, applies?, legend?, off? })`: replaces those fields on the record (shallow for `menu`); `off: true`
  sets `visible = false`, calls `setVisible(false)` and removes the record from `menuRows()`; returns the record.
  Unknown id → `false` (no throw).
- `applicable(id, ctx)`: `rec.applies` absent → `true`; a function (S7 may have added one) → its result; an object →
  `appliesTo(rec.applies, ctx)` (import from `./layer-spec.mjs`). **If S7 has landed** (`RESULT S7` in
  `docs/plans/spatial-os-log.md`) and already defines `applies` / applicability on the registry, keep S7's names and
  semantics and add only the object form; note it in the RESULT.
- `describe()` gains `declared: [{ id, type, origin, slot }]` (additive; the three existing fields unchanged).
- `tests/layer_registry.test.mjs`: patch, off, applicable (object, function, absent); describe unchanged except the new
  field.

**T6 — Pack layers in the runtime.**
- `core/overlay-v2.mjs`: `applyOverlayLayers(layers, overlay)` → `{ layers, problems }` (K-R85): `overlay.layers` rows
  run through `normLayer` (trust of the pack) and are appended after the converted rows by id (overlay wins per id;
  schema-1 packs have no converted rows). Lenient like K-R67 (`overlay-layer-invalid`).
- `core/compat-v1.mjs`: call it after the ui merge; `pack.layers` set when non-empty. Stay ≤ 75 lines (move a helper to
  `compat-v1-blocks.mjs` if needed).
- `app/nodes-runtime.mjs` `makeRuntime`: return `layers: pack.layers || []` (raw rows; merging with the kernel list
  happens in T7). If S9-1 has landed (`map/app/nodes-runtime-v2.mjs` exists, the v2 runtime of schema-2 packs), expose
  the same `layers` field from that runtime as well, so schema-2 packs declare layers inline.
- `tools/check_overlay.mjs`: `evOnly` accepts `layers`; when `ov.layers` exists, run `applyOverlayLayers` and
  `validate2` on `{ id, schema: 2, title, layers }` and print problems (as for events).
- Tests: `tests/overlay_layers.test.mjs` (a valid row kept; kernel row keeps only allowed fields; bad rows listed; town
  without overlay → no layers; the first pack's runtime `layers` is `[]`).

**T7 — Kernel adjustments at boot.** `app/layer-host.mjs`: `applyPackLayers(rows)`: `mergeLayers(KERNEL_LAYERS, rows,
{ trust: 'pack' })`; for each merged kernel layer with pack fields: `registry.patch(id, { menu, applies, legend, off })`
(menu merged over the kernel menu; a pack `label` replaces the text and drops `labelKey` for that row); keep the merged
new layers in an exported `packLayers` array (S8-2 draws them); then `renderLayerMenu()` once more. In
`renderLayerMenu`: a row label prefers `menu.i18n[LANG].label`, then `menu.label` when the row has no `labelKey`, else
today's `uiTextOr(labelKey, label)`; same for titles. `app/boot.mjs` L82–83: after `applyTheme(nodes(null)?.ui)` call
`applyPackLayers(RT?.layers || [])` (one line; import). The first pack has no rows: nothing is patched.

**T8 — 3D manifest schema (K-R104).** `map/data/schema/v2/scene3d.schema.json` written from the header of
`core/scene3d-manifest.mjs` (fields `id`, `glb` in its three forms, `floors`, `hotspots`, `budget`, `license`, `data`;
`flows[].color` pattern `^#[0-9a-fA-F]{6}$`; `additionalProperties: true` because the format keeps unknown fields).
`tools/check_pack.py`: validate `map/estate/model/manifest.json` and every `map/props/*/manifest.json` with the schema
(the same JSON-Schema helper the script uses for other schemas) and with `validate` from the core module through a
small node call if the script already shells out to node (else the schema alone). Fix nothing in the manifests; if a
shipped manifest fails, report it as a Q-item instead of editing data.

**T9 — Neutral `routes_title`.** `map/i18n/zh.json` / `en.json` `routes_title` currently name a first-pack place. Put
the exact current zh and en texts into the first pack's manifest `strings` (`routes_title`, `routes_title@en`) and
change the core texts to neutral wording ("Air lanes (gold dashes) and patrol rings (pale-blue dash-dot)" / the zh
equivalent without the place name). The first pack shows identical text (check with `text_dump`).

**T10 — Docs, probe, RESULT.**
- New probe `tools/browser/layer_dump.mjs <out.json> [--pack <id>]` and `--diff <a.json> <b.json>`: opens the viewer
  (first pack, then `?pack=town`), waits for load, writes `{ describe: LayerHostApi.describe(), rows: [...#layList
  label → { id, boxId, text, checked, hidden }], slots: [...] }` per pack; `--diff` prints differences ignoring the new
  `describe.declared` field, exit 1 when any.
- `docs/ARCHITECTURE.md` (+ zh, same headings): §3.1 rows for `layer-spec.mjs`, `layer-defaults.mjs`; file counts;
  `python3 tools/check_arch_doc.py` passes. `docs/naming.md` (+ zh) glossary: **declared layer** (a row of the layers
  block or the kernel list; drawn in a layer slot) and **kernel layer**.
- `docs/todo.md` §0: S8-1 line struck through with date and shas; status line.
- RESULT block (§10) appended to `docs/plans/spatial-os-log.md`.

**5. Constraints.** Identical registry for the first pack: same ids, slots, kinds, orders, menu rows (ids, text,
checked, hidden), same registration order. `map/core/*` imports nothing outside `map/core` and touches no DOM. Engine
files ≤ 400 lines, no card terms, no bare z-index, no new inline appearance style. No new storage key except
`edenMapLayers` (registered in `core/storage.mjs` `KEYS`, owner `app/layer-host.mjs`; it is read in S8-2, registering
it now is fine). No new protocol message. Pack text reaches the page through `textContent` only.

**6. Tests to add.** `tests/layer_spec.test.mjs` (parseSource table; normFeature bounds; normLayer kernel / new /
local / bad; mergeLayers order and caps; appliesTo truth table for every key incl. AND / OR and `data` defaults);
`tests/layer_defaults.test.mjs` + `tests/helpers/layers_v1_frozen.mjs`; `tests/overlay_layers.test.mjs`; additions to
`tests/layer_registry.test.mjs`, `tests/pack_schema_v2.test.mjs`; a scene3d schema test (every shipped manifest
passes). Count = baseline + new; nothing removed.

**7. Verify.**
```bash
node --test tests/*.test.mjs
bash tools/smoke.sh
python3 tools/check_architecture.py && python3 tools/check_pack.py && python3 tools/check_maps.py
node tools/browser/layer_dump.mjs <scratchpad>/s8-1-after.json
node tools/browser/layer_dump.mjs --diff <scratchpad>/s8-1-before.json <scratchpad>/s8-1-after.json   # no difference
node tools/browser/accept.mjs; node tools/browser/pack_town.mjs <scratchpad>/pt; node tools/browser/text_dump.mjs
```
Expected: dump diff empty; probes as on the base (`tools/browser/known-failures.json` entries count as KNOWN);
`text_dump` identical (T9 restores the first pack's exact title text).

**8. Commits & push.**
1. `chore: freeze maps.json for S8-1` (T0) — push at once.
2. `feat(core): layers contract, kernel layer list and layer spec (K-R79, K-R81-K-R83)` (T1–T5 with tests).
3. `feat(viewer): pack layers in the runtime; kernel rows adjustable; 3D manifest schema (K-R85, K-R104)` (T6–T9).
4. `docs: layers in the module map and glossary; layer_dump probe; unfreeze; RESULT S8-1` (T10, FREEZE_MAPS deleted) —
   push.
Messages via file (`-F`), English, `git -c user.email=kcgoofee-jpg@users.noreply.github.com commit`, no Co-Authored-By
trailer, one git command per Bash call. Push `bash tools/push_preview.sh --head --no-escalate`; then
`gh run list --branch preview -L 1` and, if in progress, a background `gh run watch <id> --exit-status`.

**9. Stop and report (BLOCKED / PARTIAL) instead of guessing when:** `FREEZE_MAPS` already exists on origin/preview
(before editing); the `layer_dump` diff is not empty after two attempts (report the first difference); a probe passes
on the base and fails after; a file would pass 400 lines; S7 landed with an `applies` contract that contradicts design
§5 (report both); a push is rejected (never force) or CI fails twice; the test count drops without a named one-for-one
replacement. Always delete `docs/plans/FREEZE_MAPS` (commit + push) before stopping, unless T0 never landed.

**10. Report.** The RESULT block of `docs/agent-brief.md` §5, appended to `docs/plans/spatial-os-log.md` and committed
with the last commit, with extra lines: `parity: layer_dump first pack <rows>/<rows> identical, town <rows>/<rows>;
frozen descriptors 17/17`, `files: <new files with line counts>`, `S7: landed | not landed (applies form used)`.
Cleanup: probe servers stopped (own PIDs), no `.claude/launch.json` entries, worktree left for the orchestrator.

### S8-2 — block renderers, pack-declared layers, menu and legend rows, town acceptance

Model: Sonnet · High · Size L (one prompt, about 6 h). Written by the S8-design session on 2026-10-01 at origin/preview
`7958b5ad`; runs after S8-1 (read its RESULT first).

**0. Why.** Plan §5 S8 acceptance: the example pack adds "patrol route" and "danger zone" with data only, probe
`pack_layers`. S8-1 put every layer's facts on declarations and keeps a pack's new rows in `packLayers`; this step draws
them with the kernel's building blocks (design §2.3, §4), moves the drawing of routes, traffic and weather onto the same
renderers with recorded-call parity (L-01 C), and adds the menu rows and legend rows of declared layers (L-07, L-08,
L-09).

**1. Read first.**
- `docs/agent-brief.md`; `docs/layers-schema.md` §0 (L-01, L-04, L-06, L-07, L-08, L-09), §2.3, §3, §4, §5, §6, §7,
  §8.2, §13; RESULT S8-1 in `docs/plans/spatial-os-log.md`; kernel-schema K-R31, K-R58, K-R64, K-R70–K-R72, K-R79–K-R83.
- Code: `app/markers.mjs` L178–188 (routes SVG; `routeGaps` in `app/sharpness-tiers.mjs`); `app/traffic-view.mjs`
  (all, 89 lines; `frame` L33–58); `app/weather-view.mjs` (all, 86 lines; `frame` L28–43); `core/traffic.mjs`
  (`LANE_KINDS`, `trafficField`, `routeList`, `pathMetrics`, `trailOf`); `core/weather.mjs` (`WEATHERS`,
  `particleField`, `lightningAt`, `tintOf`); `app/stash-markers.mjs` (overlay elements, injected CSS, MutationObserver
  on `body[data-map]`, host message bus — the pattern for declared layers); `map/trips-view.mjs` L18–23 (`xy`,
  `drawnAt(hereRes(...))`); `app/drawer-glue.mjs` L28–41 (legend pane), L80 (`legendOk`); `app/tabs.mjs`
  (`refreshTabs`); `app/layer-host.mjs` after S8-1 (`declared`, `applyPackLayers`, `packLayers`, `renderLayerMenu`);
  `core/layer-spec.mjs` after S8-1; `app/color-vision-mode.mjs` (`safeColor`); `ui/icons.js` (icon names);
  `map/viewer.html` L405–415 (route CSS; do not add lines) and the `--zv-*` slot tokens.
- Probes that read these layers: `tools/browser/p4_traffic.mjs`, `p4_fx.mjs`, `p9_daynight_fx.mjs`, `s43_parity.mjs`,
  `pack_town.mjs`, `accept.mjs`, `layer_dump.mjs` (S8-1).

**2. Scope.** IN: T0 baseline · T1 contract K-R80, K-R84 · T2 pure geometry and the routes paths · T3 canvas renderers
extracted (flow, particles) + tint · T4 overlay renderers (point, label, line, area) · T5 routes / traffic / weather on
the renderers · T6 declared-layer host · T7 menu rows and visibility store · T8 legend rows · T9 town acceptance data ·
T10 probe `pack_layers`, docs, RESULT. OUT: host files (`map/tavern/**`); `mvu:` and `ops` sources, `sound`, local
layers and props (S8-3; leave the source kinds unhandled with a quiet skip); greying / rAF pause of inapplicable rows
beyond L-06's fallback (S7); `map/viewer.html` (no new line: put new CSS in the module's injected style, as
`app/stash-markers.mjs` does); the first pack's data.

**3. Setup.**
```bash
git fetch
git worktree add -b s8-2-blocks <scratchpad>/s8-2 origin/preview
```
Baseline: `node --test tests/*.test.mjs` (count), `bash tools/smoke.sh`; `node tools/browser/layer_dump.mjs
<scratchpad>/s8-2-before.json`; `node tools/browser/s43_parity.mjs --out <scratchpad>/s8-2-before`; run
`p4_traffic`, `p4_fx`, `p9_daynight_fx` and keep their ✓ / ✗ lists.

**4. Tasks.**

**T0 — Freeze.** T9 edits the example pack's manifest. Same freeze procedure as S8-1 T0 (`S8-2 town layers`); delete
it in the last commit, also when stopping early.

**T1 — Contract.** `docs/kernel-schema.md` + zh: K-R80 (design §2.3 table and §4 table, reduced motion and data
saver) after K-R83 in §9; K-R84 (design §7) in §10.1 after K-R57's neighbours; "Planned in S8" list updated ("Added by
S8-2: …").

**T2 — `map/core/layer-geometry.mjs` (new, pure, ≤ 250 lines).**
- `routePaths(routes, VW, VH)` → `[{ pass: 'halo' | 'line', d, cls }]`: the exact logic of `app/markers.mjs` L181–187
  (`dOf`, the two passes, the class rule `['lane','patrol','patrol_city'].includes(kind) ? kind : 'lane'`, skipping
  routes with fewer than 2 points). Frozen copy of the old loop in `tests/helpers/routes_v1_frozen.mjs`; test on the
  first pack's routes data (`map/data/*.json` files with `routes`) and on edge cases: identical output.
- `featuresOnView(features, view)`, `pathD(pts, closed, VW, VH)`, `circlePath(at, r, VW, VH)`, `routesAsFeatures(routes)`
  (`{ pts, kind, closed: kind !== 'lane' && from === to }`), `markersAsFeatures(markers)` (`ax`/`ay` first).
- `styleFor(layer, kind)` → the resolved style (defaults of design §4, `by[kind]` over the layer style).
- `swatchOf(layer, kind)` → `{ shape: 'stroke' | 'fill' | 'dot' | null, color, dash }`.

**T3 — `map/app/block-canvas.mjs` (new, ≤ 300 lines).**
- `canvasLayer({ slot, cls, frame, idle })` → `{ mount, unmount, setVisible, start, stop, size }`: the canvas setup that
  `traffic-view.mjs` and `weather-view.mjs` duplicate today (`size` with the dpr cap 2, mount into `slotEl(slot)`,
  `aria-hidden`, absolute full size, `pointerEvents: none` — keep these inline assignments only where the files already
  have them and count: the inline-style ledger must not grow; move them into the injected CSS class where possible),
  rAF start / stop, resize and `visibilityGuard` subscription.
- `drawFlow(cx, { routes, t, seed, quality, night, toScreen, W, H, kinds })`: the body of traffic `frame` L38–56 moved
  verbatim (with `kinds` passed to `trafficField` and the colour per kind from `kinds`); `core/traffic.mjs`
  `trafficField(routes, { …, kinds = LANE_KINDS })` and `routeList` accept the table (default unchanged).
  For a pack flow layer: `kinds = { <kind or 'default'>: { speed, size, density, color: 'r,g,b', trail } }` built from
  the style (hex → `r,g,b`), and when `style.path` is set the polyline is stroked first (dash, width, colour).
- `drawParticles(cx, { preset, t, seed, quality, W, H })`: weather `frame` L32–42 moved verbatim (tint, particles,
  lightning).
- `drawTint(cx, { color, opacity, W, H })`: one `fillRect`.
- `tests/block_canvas.test.mjs` with a recording fake context (every method call and property set appended to a log):
  for 20 seeded inputs, frozen copies of today's traffic and weather frame bodies
  (`tests/helpers/fx_frames_v1_frozen.mjs`) and `drawFlow` / `drawParticles` give identical logs.

**T4 — `map/app/block-overlay.mjs` (new, ≤ 300 lines).**
- `svgLayer(layer)`: one SVG per layer per view (viewBox `0 0 1000 1000*aspect`, `preserveAspectRatio: none`, class
  `lyr lyr-svg`, `data-slot`, `data-layer`), added with `osdViewer.addOverlay({ element, location: Rect(0, 0, 1,
  aspect) })`; `line` and `area` paths with `vector-effect: non-scaling-stroke` (CSS), colours through CSS custom
  properties (`--lc`, `--lf`, `--lo`, `--lw`, `--ld`) set with `style.setProperty` after `recheck` / token check.
- `pointEl(feature, style)`, `labelEl(feature, style)`: HTML overlay elements (classes `lyr-pt`, `lyr-lb`), placement
  CENTER, text via `textContent`, `role="img"` and `aria-label` = the label; icons from `ui/icons.js` by name.
- Injected CSS (one `<style id="lyrCss">`, the stash-markers pattern): z-index per slot via `var(--zv-<slot>)`; pulse
  animation off under `prefers-reduced-motion`.

**T5 — Kernel layers on the renderers.** `app/markers.mjs` routes block uses `routePaths` (same markup: class `routes`,
mask `rtGap`, `.rtg` group, passes) — the routes layer keeps its id, row and storage; `app/traffic-view.mjs` and
`app/weather-view.mjs` keep their exports, window APIs and messages and draw through `canvasLayer` + `drawFlow` /
`drawParticles`; both files must shrink. Run the recorded-call tests and the probes of §7.

**T6 — `map/app/declared-layers.mjs` (new, ≤ 350 lines): the declared-layer host.**
- `initDeclaredLayers()` (boot, after `applyPackLayers`): for each `packLayers` row with origin `pack` and a block of
  T3 / T4: `registry.register({ id, slot, kind: 'canvas' | 'osd', order: 50, type, origin, menu, applies, legend,
  initialVisible, mount, unmount, setVisible })`.
- Features per layer: inline → `data.features`; `file:` → `getJSON(new URL(path, pack base))` once, path re-checked
  under the base; `view:routes` / `view:markers` → T2 converters on `currentMapData`; `events` → `EventsView.events`
  through `core/entities.mjs` `eventOf` and `drawnAt(hereRes(place), place)`; `people` → the characters view's rows
  through `personOf`; `items` → `StashMarkersApi.all()` plus `StashView.rows` with a place (hidden rows only when the
  player stands there, the `lootRows` rule); `routine` → the wander module's schedule and `placesAt`; filter by
  `filter.kinds`. Unknown kinds (`mvu`, `ops`) → no features (S8-3).
- `layerContext()` → design §5 context (`RT.kind`, `RT.host`, `RT.tree.ancestors`, node type, period / dark from the
  last `eden-map:clock`, `count` = features on the open view); redraw on `body[data-map]` changes, `resize`, and host
  messages `eden-map:events`, `eden-map:chars`, `eden-map:stash`, `eden-map:inv`, `eden-map:here`, `eden-map:clock`
  (the `busOn` pattern; `window.__isFromHost` gate).
- Inapplicable (`registry.applicable(id, layerContext())` false): draw nothing, stop rAF; menu row hidden unless S7
  provides greying (L-06).
- `window.DeclaredLayersApi = { describe: () => [{ id, type, slot, visible, applicable, count }] }` (read only; add the
  name wherever a test pins window globals).

**T7 — Menu rows and visibility.** A declared row: element ids `lyr-<id>` / `lyrBox-<id>`; text per S8-1 T7;
`initialVisible` = stored `edenMapLayers[id]` (`'1'` / `'0'`) else `menu.default !== false` (L-07); `setVisible`
writes `edenMapLayers` (one JSON object; `storage.json` / `storage.set`, the registered key). `renderLayerMenu` runs
after `initDeclaredLayers`.

**T8 — Legend rows.** `app/drawer-glue.mjs`: the legend pane is rebuilt (not built once) by `refreshLegend()` called
from the declared-layer host on visibility / applicability change and on map change; it lists `ui.legend` rows (today's
`dl`, unchanged markup) and then per layer an `h4` (menu label) and a `dl` whose `dt` starts with a swatch `<i
class="lgsw" data-shape="…">` coloured by `--sw` (`style.setProperty`). `legendOk` becomes `!estate && ((depthData &&
legendItems().length > 0) || layerLegendRows().length > 0)`. The first pack has no layer rows: the pane's markup is
unchanged (assert in a probe through `text_dump` and `layer_dump`).

**T9 — Town acceptance data.** `map/packs/town/overlay.v2.json` exactly as design §13 (adjust coordinates on screen
if needed; keep the ids, types, slots, applies, labels); `map/packs/town/manifest.json` `data.overlay:
"overlay.v2.json"`. `python3 tools/check_pack.py` passes (the overlay checker of S8-1). No engine file mentions
`patrol` or `danger` (grep).

**T10 — Probe, docs, RESULT.**
- New probe `tools/browser/pack_layers.mjs <out dir>` (design §13 checks, desktop + one 375 px run): rows `lyr-patrol`
  and `lyr-danger` with the pack's labels (zh and `?lang=en`); on `town_hill` the patrol SVG path exists and the flow
  canvas draws (`DeclaredLayersApi.describe()` count > 0, applicable) and `danger` is not applicable; on `town_harbour`
  the reverse; the legend tab lists both rows with swatches; unticking `patrol` removes its SVG and stops drawing,
  `localStorage['tcp.town.Layers']` holds `"patrol":"0"`, a reload keeps it unticked; the first pack: `layer_dump` rows
  equal the base list and contain no `lyr-` row. Screenshots to `<out dir>` and `~/eden-map-review/s8-2/`.
- `docs/ARCHITECTURE.md` (+ zh) rows for the four new files; §6 "Pack-driven viewer behaviour" gains `layers`;
  `docs/todo.md` §0 S8-2 struck; RESULT.

**5. Constraints.** First pack identical: `layer_dump` diff empty, `s43_parity` screenshots equal to base noise,
`p4_traffic` / `p4_fx` / `p9_daynight_fx` as on the base. Engine files ≤ 400 lines; `traffic-view.mjs` and
`weather-view.mjs` shrink; inline-style and z-index ledgers do not grow (`--update-baseline` only if a count fell). No
card terms, no pack ids or layer ids in engine code. Pack text only through `textContent`; colours and paths re-checked.
`map/core/*` pure.

**6. Tests to add.** `tests/layer_geometry.test.mjs` + `tests/helpers/routes_v1_frozen.mjs`;
`tests/block_canvas.test.mjs` + `tests/helpers/fx_frames_v1_frozen.mjs`; `tests/declared_layers.test.mjs` (pure parts:
features per source from fixtures, filter, visibility initial value rule, legend row list for a fixture pack, the first
pack yields no declared layer); `tests/overlay_layers.test.mjs` gains the town overlay (2 layers, 0 problems).

**7. Verify.**
```bash
node --test tests/*.test.mjs
bash tools/smoke.sh
python3 tools/check_architecture.py && python3 tools/check_pack.py
node tools/browser/layer_dump.mjs <scratchpad>/s8-2-after.json
node tools/browser/layer_dump.mjs --diff <scratchpad>/s8-2-before.json <scratchpad>/s8-2-after.json   # first pack: none; town: only the two new rows
node tools/browser/s43_parity.mjs --out <scratchpad>/s8-2-after
node tools/browser/s43_parity.mjs --diff <scratchpad>/s8-2-before <scratchpad>/s8-2-after
node tools/browser/p4_traffic.mjs; node tools/browser/p4_fx.mjs; node tools/browser/p9_daynight_fx.mjs
node tools/browser/pack_town.mjs <scratchpad>/pt; node tools/browser/pack_layers.mjs <scratchpad>/pl
```
Expected: the town diff lists exactly `lyr-patrol` and `lyr-danger` (an addition, pinned in the probe, brief §3); all
else identical; `pack_layers` all ✓.

**8. Commits & push.**
1. `chore: freeze maps.json for S8-2` — push at once.
2. `refactor(viewer): routes, traffic and weather draw through block renderers (K-R80)` (T1–T5 with parity tests).
3. `feat(viewer): pack-declared layers, menu and legend rows (K-R84)` (T6–T8).
4. `feat(pack): town patrol route and danger zone as data; pack_layers probe; unfreeze; RESULT S8-2` (T9, T10) — push.
Same commit and push rules as S8-1 §8.

**9. Stop and report when:** `FREEZE_MAPS` exists (before editing); a recorded-call parity test cannot be made equal in
two attempts (report the first differing call); `s43_parity` or `p4_*` differ from the base beyond noise; the first
pack's `layer_dump` differs; a file would pass 400 lines or a ledger would grow; push rejected or CI fails twice; test
count drops. A difference that only adds (a town row, a legend row on a pack that declares one) is pinned in a test and,
if visible in the first pack, filed as a Q-item in `docs/todo.md` §3 with a recommendation (brief §3). Always unfreeze
before stopping.

**10. Report.** RESULT block with extra lines: `parity: routes paths <n>/<n>, flow calls <n>/<n>, particles calls
<n>/<n>, layer_dump first pack identical, s43 <shots> identical`, `town: rows patrol, danger; legend rows 2; probe pack_layers
<n>/<n>`, `files: <new files with line counts>; traffic-view <before> -> <after>, weather-view <before> -> <after>`.

### S8-3 — host-fed values, navigator overlays, local layers and props, sound layers

Model: Sonnet · High · Size L (one prompt, about 6 h). Written by the S8-design session on 2026-10-01 at origin/preview
`7958b5ad`; runs after S8-2 (read the RESULTs of S8-1 and S8-2 first).

**0. Why.** Plan §5 S8 sources "MVU variables (read only)" and the local extension `EdenMap.addLayer()`; plan §16:
I-04 navigator overlay events and E-03 the local prop-pack interface go to S8; `docs/todo.md` Q-01: ambience comes back
as a pack-declared layer reusing the three new files of `rescue/ambience-part4-4`. Design `docs/layers-schema.md` §9–§12
(L-10 … L-14).

**1. Read first.**
- `docs/agent-brief.md` (§2.3 one-way data flow: only `tavern/mvu-bridge.mjs` touches `Mvu` / `SillyTavern`; §2.4;
  §2.5 never write `stat_data`; §2.6 toggles; §2.8). `docs/layers-schema.md` §0, §3.3, §5 (`applies.mvu`), §9–§12.
  RESULTs S8-1, S8-2. Kernel-schema K-R63, K-R64, K-R71, K-R79–K-R84.
- Host code: `map/tavern/mvu-bridge.mjs` (`#statSnap` L82–103, `rawLatestStat`), `map/tavern/mvu-readers.mjs`
  (`getByPath` L16, `val` L14), `map/tavern/chars-flow.mjs` `pushMvu` L50–60 (the clock post pattern),
  `map/tavern/profile-load.mjs` (overlay fetch), `map/core/profile.mjs` `profileFromV1` L50,
  `map/tavern/llm-flow.mjs` navigator L12–55 (`apply` result `d`, `opEvents` aging), `map/tavern/operation-dsl.mjs`
  `apply` L84–95, `map/tavern/modes-flow.mjs` L52–67 (`SpatialM.locate`), `map/tavern/host-api.mjs` (all, 122 lines:
  `inner`, the `flyQ` queue pattern, `exposed`, `guardApi`), `map/tavern/extension-api-contract.mjs` (all),
  `map/tavern/host-checks.mjs` L103 (queue until `eden-map:ready`), `map/core/protocol.mjs` `SCHEMA`.
- Viewer code: `map/app/extension-api.mjs` (all, 45 lines), `map/app/declared-layers.mjs` and
  `map/app/block-overlay.mjs` (S8-2), `map/app/weather-view.mjs` (`WeatherApi.now`), `map/core/room-gallery-db.mjs`
  and `room-gallery-logic.mjs` (IndexedDB and quota pattern), `map/core/storage.mjs` `KEYS` (the `edenMap:chat:`
  prefix), `map/app/quests-view.mjs` (pulse look to match for clues).
- Rescue files: `git show origin/rescue/ambience-part4-4:map/core/ambience.mjs`, `…:map/app/ambience.mjs`,
  `…:tests/ambience.test.mjs`, and the wiring commit `git show fb039ad` (settings row, storage key, i18n — **do not**
  reuse the settings row: the switch is the layer row now).
- Docs of the external contract: `docs/content-compat.md` "本机扩展接口" section (grandfathered Chinese doc; add new
  prose in English).

**2. Scope.** IN: T0 baseline · T1 contract K-R86–K-R89 · T2 MVU values (host) + `mvu:` source and `applies.mvu`
(viewer) · T3 navigator overlays `nav-ops` · T4 `EdenMap.addLayer` and friends · T5 local prop pack + `local-props` ·
T6 sound block + rescued ambience · T7 example-pack sound layer · T8 probe `layers_ext`, docs, RESULT. OUT: the
navigator's prompt, parser or schedule; `stat_data` writes of any kind; 3D-page placement of props (S9b); renaming
`EdenMap` or any message (S10); first-pack data; Settings rows (no new Settings switch: every new switch is a layer
row).

**3. Setup.**
```bash
git fetch
git worktree add -b s8-3-ext <scratchpad>/s8-3 origin/preview
```
Baseline: tests count, smoke, `layer_dump` (before file), `pack_layers`, `p6_quests`, `accept`.

**4. Tasks.**

**T0 — Freeze.** T7 edits the example pack's overlay. Same freeze procedure (`S8-3 town sound layer`).

**T1 — Contract.** kernel-schema + zh §9: K-R86 (design §5 `applies.mvu`, §3.2 `mvu:`, §9), K-R87 (§10), K-R88 (§11),
K-R89 (§12); "Planned in S8" list → "Added by S8-3"; when all of K-R79–K-R89 and K-R104 are written, remove the planned list's
remaining bullets and leave the three "Added by S8-n" lines.

**T2 — Host-fed values.**
- `core/profile.mjs` `profileFromV1` / `profileOf`: `layerPaths` = the distinct `mvu:<path>` sources and
  `applies.mvu.path` values of the pack's layers (overlay `layers` for schema-1 packs), at most 8, each matching the
  vars path pattern; tests in `tests/profile.test.mjs`.
- `tavern/mvu-bridge.mjs`: `layerValues(paths)` → `{ <path>: value }` read from the same once-per-round `stat_data`
  snapshot through `getByPath` and `val` (read only; a missing path is absent; a value larger than 4 KB of JSON or an
  array longer than 200 is cut and marked `…truncated`).
- `tavern/chars-flow.mjs` `pushMvu`: after the clock / outfit posts, `const lv = mvuBridge.layerValues(profile.layerPaths)`;
  post `{ type: 'eden-map:layer-data', values: lv }` when its JSON signature changed (same pattern as `clockSig`).
- `core/protocol.mjs` `SCHEMA`: `'eden-map:layer-data': [HOST_TO_VIEWER, { values: 'object' }]`; update
  `tests/protocol.test.mjs` counts.
- Viewer `declared-layers.mjs`: keep the last `values`; `mvu:<path>` source → features from the value (an array of
  strings, an object's keys, or one string) located through `drawnAt(hereRes(name), name)`; `layerContext().mvu` =
  values; `appliesTo` handles `mvu: { path, equals | min | max | truthy }` (add to `core/layer-spec.mjs` with tests).

**T3 — Navigator overlays (I-04).**
- `tavern/llm-flow.mjs` navigator run: after `const d = plannerGatewayModule.apply(...)`, keep `opOverlays` (session):
  append `d.clues` and `d.markers` stamped `{ floor: host.floorNow, map: host.SpatialM?.locate(host.regNow,
  host.here)?.mapId ?? null }`, drop rows with `host.floorNow - floor > 20`, cap 12 per list, and post `{ type:
  'eden-map:ops', clues, markers }` when changed; clear and post empty lists on a chat change (find where `opEvents`
  is reset). Keep `llm-flow.mjs` ≤ 150 lines (move the helper into `tavern/nav-ops.mjs`, pure, with a test).
- `core/protocol.mjs`: `'eden-map:ops': [HOST_TO_VIEWER, { clues: 'array', markers: 'array' }]`.
- Viewer `map/app/nav-ops-view.mjs` (new, ≤ 150 lines): kernel layer `nav-ops` (add to `KERNEL_LAYERS`: slot `markers`,
  kind `osd`, order 3, type `point`, menu `{ order: 85, labelKey: 'nav.layer', label: '领航员标注', titleKey:
  'nav.layer_title', title: '后台领航员给出的线索与标注（只在本次会话里显示）' }`, `applies: { data: true }`);
  features: clue → node through `hereRes(name)` when drawn on the open map, else `{ view: map, at: [nx, ny] }`; marker →
  `{ view: map, at: [nx, ny], label }`; drawn with S8-2 `pointEl` (clues `pulse: true`, size 8 + 4 × urgency; markers
  with their label); tooltip `uiTextOr('nav.hint', '领航员建议')`. i18n keys in `map/i18n/zh.json` / `en.json`
  (en: `Navigator marks`, `Clues and marks from the background navigator (shown for this session only)`, `Navigator
  suggestion`).
- Tests: `tests/nav_ops.test.mjs` (stamping, aging, caps, clear; viewer placement order name → coordinates).

**T4 — `EdenMap.addLayer` and friends.**
- Viewer `app/extension-api.mjs` `window.EdenMap`: `addLayer(def)`, `removeLayer(id)`, `setLayerData(id, features)`,
  `layers()` per design §10, implemented in `declared-layers.mjs` (`addLocalLayer` etc., `normLayer(def, { trust:
  'local' })`, limit 16, origin `local`, registered like pack layers, `renderLayerMenu()` after each change).
- Host `tavern/host-api.mjs`: the same four methods on the host's `api`: forward through `inner()` when the viewer is
  open; otherwise keep a `localLayers` map (add / remove / data) and replay it on `eden-map:ready` (the `setQ` pattern
  of `host-checks.mjs` L103); `layers()` returns `[]` when the viewer is closed.
- `tavern/extension-api-contract.mjs` `EDEN_API`: `addLayer: 1, removeLayer: 1, setLayerData: 2, layers: 0`; update
  `tests/extension-api-contract.test.mjs`.
- `docs/content-compat.md`: an English subsection "Local layers (S8)" with the four methods and one example (a town
  view polygon).

**T5 — Local prop pack (E-03).**
- `core/prop-pack.mjs` (pure, ≤ 150 lines): `sniff(bytes, name)` → `'glb' | 'png' | 'webp' | 'svg' | null`;
  `checkProp({ type, bytes, text? })` → `{ ok, problems }` per design §11 (sizes, svg refusals); `PROP_LIMITS`;
  `propId(name, existing)` (ASCII id from the name, `p_<n>` fallback); `normPlacement`.
- `app/prop-store.mjs` (≤ 200 lines): IndexedDB `spatialProps` / `props` (open, put, get, list, delete, quota through
  `checkQuota`-like totals); object URLs revoked on remove.
- `EdenMap.addProp(file, { name })`, `removeProp(id)`, `props()`, `placeProp(id, { map, at } | { pick: true })`,
  `unplaceProp(id, map)` (viewer and host forwarding as T4; contract table `addProp: 1, removeProp: 1, props: 0,
  placeProp: 2, unplaceProp: 2`); placements in `edenMap:chat:<chatId>:props` (JSON, ≤ 200) through the storage
  service; `pick` = one-shot capture of the next OSD canvas click (`osdViewer.addOnceHandler('canvas-click', …)`),
  converted to view coordinates (`x`, `y / aspect`).
- Kernel layer `local-props` (`app/local-props-view.mjs`, ≤ 150 lines; `KERNEL_LAYERS`: slot `markers`, kind `osd`,
  order 4, type `point`, menu `{ order: 86, labelKey: 'props.layer', label: '本机道具', titleKey: 'props.layer_title',
  title: '你放在地图上的本机道具（只存在这台设备）' }`, `applies: { data: true }`): images as `<img>` with the object
  URL, a glb as the `cube` icon (add it to `ui/icons.js` if missing) plus its name; local layers may use `icon:
  "prop:<id>"`.
- Tests: `tests/prop_pack.test.mjs` (signatures from byte fixtures built in the test: a 12-byte glb header, the PNG
  signature, a RIFF/WEBP header, svg text with and without `<script`; caps; ids).

**T6 — Sound block (Q-01).**
- Copy `map/core/ambience.mjs` and `tests/ambience.test.mjs` from `origin/rescue/ambience-part4-4` verbatim; edit only
  the core header comment: data comes from a `sound` layer (`docs/layers-schema.md` §12), example view id `town_harbour`.
  The test must pass unchanged.
- `map/app/sound-block.mjs` (≤ 150 lines): the rescued `map/app/ambience.mjs` ported (design §12): no `fetch` of
  `data.ambience`; `soundLayer(layer)` → `{ mount, unmount, setVisible }` for the declared-layer host; `normAmbience`
  of the layer's data (inline or the `file:` JSON loaded by the host); ctx `{ map: currentMapId, night, weather:
  WeatherApi?.now?.()?.id }`; `night` from `eden-map:clock`; replan on map change, clock and events messages (throttled
  to 2 s); **always** `initialVisible: false` unless the user's stored choice is `'1'`; AudioContext created on the
  first switch-on, resumed only on a user gesture, suspended when hidden or inapplicable; `window.SoundApi = { describe:
  () => [{ id, active, scenes }] }`.
- `declared-layers.mjs`: `type: 'sound'` → `soundLayer`.
- Register `sound` in `KERNEL`-side docs only; no Settings row, no `edenMapAmbience` key (the layer row and
  `edenMapLayers` replace it). Close Q-01 in `docs/todo.md` §3 with "→ done S8-3 <sha>".

**T7 — Example-pack sound layer.** Add to `map/packs/town/overlay.v2.json` `layers`: `{ "id": "harbour-sound", "type":
"sound", "slot": "fx", "applies": { "views": ["town_harbour"] }, "data": { "rules": [ { "match": { "map":
"town_harbour" }, "scenes": [ { "id": "wind", "gain": 0.4 }, { "id": "crackle", "gain": 0.15 } ] } ] }, "menu": {
"label": "港口环境声", "i18n": { "en": { "label": "Harbour ambience" } } } }`.

**T8 — Probe, docs, RESULT.**
- New probe `tools/browser/layers_ext.mjs <out dir>`: (a) host stub posts `eden-map:layer-data` with a fixture value
  and a test overlay layer `mvu:` → points placed; (b) host stub posts `eden-map:ops` with one clue (a town place name)
  and one marker → `nav-ops` draws 2 elements on the right map, none after a chat change; (c) `EdenMap.addLayer({ id:
  'local-test', type: 'area', slot: 'routes', data: … })` → a row and a polygon; `setLayerData` moves it;
  `removeLayer` removes row and drawing; an id without `local-` is refused; (d) `addProp` with a generated PNG blob and
  a minimal glb blob, `placeProp` → two `local-props` elements; a reload keeps the placements; an svg with `<script`
  is refused; (e) town `harbour-sound` row exists, unticked by default; ticking it after a click creates one
  AudioContext and `SoundApi.describe()` lists `wind`, `crackle` on `town_harbour` and nothing on `town_hill`.
- `docs/ARCHITECTURE.md` (+ zh) rows for the new files; `docs/naming.md` (+ zh) glossary: **prop pack**, **sound
  layer**, **navigator overlay**; `docs/todo.md`: I-04 overlay part struck (`→ S8-3 <sha>`), E-03 struck for the
  interface and 2D placement plus a new §2 follow-up line "placing local glb props inside 3D pages" with destination
  S9b (edit mode; its spec does not list it yet), Q-01 done; §0 S8-3 struck; RESULT.

**5. Constraints.** Only `tavern/mvu-bridge.mjs` touches the `Mvu` / `SillyTavern` globals; nothing writes
`stat_data`, the chat variable (props placements live in browser storage) or any worldbook. No file a user adds leaves
the device (no network call, no message to the host, no URL other than `blob:`). Audio never starts without the user's
switch and a gesture. New toggles are layer rows (default off for sound; `nav-ops` and `local-props` default on: they
draw only after an opt-in action). New storage use: only the registered `edenMapLayers` and the `edenMap:chat:` prefix;
the IndexedDB database is listed in `docs/ARCHITECTURE.md` next to the room gallery's. Engine files ≤ 400 lines,
ledgers do not grow, no card terms. Pack and user text only through `textContent`.

**6. Tests to add.** `tests/nav_ops.test.mjs`, `tests/prop_pack.test.mjs`, `tests/ambience.test.mjs` (verbatim),
`tests/layer_values.test.mjs` (profile paths, `layerValues` caps with a fake snapshot, `applies.mvu` table), local-layer
validation cases in `tests/layer_spec.test.mjs`, protocol and contract test updates. Count = baseline + new.

**7. Verify.**
```bash
node --test tests/*.test.mjs
bash tools/smoke.sh
python3 tools/check_architecture.py && python3 tools/check_pack.py
node tools/browser/layer_dump.mjs <scratchpad>/s8-3-after.json
node tools/browser/layer_dump.mjs --diff <scratchpad>/s8-3-before.json <scratchpad>/s8-3-after.json   # first pack: only nav-ops and local-props rows added
node tools/browser/layers_ext.mjs <scratchpad>/lx; node tools/browser/pack_layers.mjs <scratchpad>/pl
node tools/browser/p6_quests.mjs; node tools/browser/accept.mjs
```
Expected: the first pack's dump differs only by the two new kernel rows (`nav-ops`, `local-props`), which are additions:
pin them in `layers_ext` and file one Q-item in `docs/todo.md` §3 ("first pack shows two new layer rows; recommendation:
accept") per brief §3; everything else identical.

**8. Commits & push.**
1. `chore: freeze maps.json for S8-3` — push at once.
2. `feat(host): layer values from MVU paths and navigator overlays to the viewer (K-R86, I-04)` (T1 part, T2, T3).
3. `feat(viewer): local layers and the local prop pack (K-R87, K-R88, E-03)` (T4, T5).
4. `feat(viewer): sound layers with the rescued ambience engine (K-R89, Q-01); layers_ext probe; unfreeze; RESULT S8-3`
   (T6–T8) — push.
Same commit and push rules as S8-1 §8.

**9. Stop and report when:** `FREEZE_MAPS` exists; a host change would need a second module to touch the `Mvu` global;
the rescued core test fails unchanged on today's tree (report the failure; do not edit the test); an AudioContext is
created without a user gesture in the probe; a probe passing on the base fails after (other than the two pinned
rows); a file passes 400 lines or a ledger grows; push rejected or CI fails twice; test count drops. Always unfreeze
before stopping.

**10. Report.** RESULT block with extra lines: `host: layer-data paths <n>, ops clues/markers delivered <n>/<n>`,
`extension: EDEN_API +9 methods`, `props: types glb/png/webp/svg; refused cases <n>`, `sound: rescued core + test
verbatim; app port <lines>`, `todo: I-04 overlay part, E-03, Q-01 closed`.
