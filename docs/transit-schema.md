# Transit network and routing: the transit block, the router and the thematic map (S8-4 design)

> Canonical English edition; Chinese edition: `docs/transit-schema.zh.md` (same heading structure, gated by
> `tools/check_zh_mirror.py`). Output of plan step **S8-4-design** (`docs/todo.md` N6 and N8; N7 for the router API the
> S7 "suggested route" op calls). Status: **design, working decisions applied by default** (the user was not available on
> 2026-10-01: every recommendation of the review sheet below is the working decision; the user may override any of them).
> No code changes with this document. The rules it adds to the kernel contract are reserved as **K-R107 … K-R114**
> (`docs/kernel-schema.md` §13, "Planned in S8-4"); their full text lands with the step specs in the appendix (S8-4a,
> S8-4b). Every statement about today's code was checked at origin/preview `df3b5f6d` (head #239).

## 0. Review sheet (T-01 … T-16)

One row per real decision. "Working decision" = the recommendation, applied by default on 2026-10-01 (autopilot). The
same list is in `docs/todo.md` §3, one line per item.

| id | Question | Options | Consequences | Recommendation (working decision) |
|---|---|---|---|---|
| T-01 | Where does a pack declare its network? | A: a new optional top-level v2 block `transit` (inline or a file path like every block); a schema-1 pack carries it in `overlay.v2.json`. B: a special layer type inside `layers`. C: links as node fields. | A: one place for stations, lines, links and districts; the router, the host and the drawing read the same data; packs without it are untouched. B: a layer is presentation, but the router and the host need the data without the viewer. C: lines and districts are not nodes; the tree would fill with non-places. | **A** |
| T-02 | What is a station? | A: its own id; either a node reference (`node`, drawn where the node is drawn) or a free point (`view` + `at` + `name`). B: nodes only. C: points only. | A: the first pack puts stations at existing markers with zero coordinates to copy; a pack can still add a pier or a platform that is not a place. B: no stop without a place. C: duplicates every coordinate and breaks when a marker moves. | **A** |
| T-03 | Transport modes. | A: a pack-declared mode table merged over four kernel defaults `walk`, `metro`, `maglev`, `air` (neutral labels); each mode names the trip drawing class it belongs to (`road`, `rail`, `underground`, `air`, `teleport`); at most 8. B: a fixed enum of the four. C: free strings. | A: the user's four modes exist everywhere, a fantasy pack adds a ferry or a funicular as data, and trips know which network modes match their own mode. B: every other world is stuck with maglev. C: no labels, no trip mapping. | **A** |
| T-04 | How are edges written? | A: `lines` (ordered stops, minutes per segment, number, name, colour) generate the ride edges; free `links` (walk transfers, single hops) add the rest; both directions unless `oneway`. B: explicit edges only. | A: an author writes a line once, the drawing gets numbered lines for free. B: a 10-stop line is 18 edges and has no identity to draw or name. | **A** |
| T-05 | Cost model of the router. | A: minutes; a transfer adds `options.transfer_min` (default 3) when boarding a different line after a ride, plus an optional per-line `wait`; ties: fewer changes, then fewer stops, then declaration order; changes = ride legs − 1. B: minutes only. C: fewest changes first. | A: realistic, deterministic, explainable in one line of text. B: the router happily changes line for half a minute. C: absurd detours. | **A** |
| T-06 | How does a place (the current location, a tapped marker) attach to the network? | A: in order: a station on the same node; a station whose node contains the place (a room inside a station building); stations inside the place (a district: any of its stations, 0 min); then, in the viewer only, a walk access leg to stations on the same view within `options.access_max_min` using the view's metric extent; a direct walk is compared; nothing attaches = no route, silently. B: node equality only. C: always the nearest station. | A: every marker of a view with a network gets a route without extra data, and nothing is guessed across views. B: most places have no station of their own. C: a route from a room to the station of another building. | **A** |
| T-07 | Edges between views. | A: allowed (a funicular from the hill to the harbour); routed like any edge; drawn on each view as a short stub at the station with the other end's name and view; the plan card lists the legs on other views. B: one view per network. | A: real multi-level towns work, and the example pack proves it. B: the first link between two maps would need a second network. | **A** |
| T-08 | Who plans, who holds the plan? | A: the viewer plans (it has positions) and sends the plan; the host re-validates it against its own copy of the network (`checkPlan`: ride and link minutes recomputed, access legs capped, ids and chaining checked, names rebuilt), keeps it for the session only, echoes it back, re-sends it when the viewer reopens, clears it on arrival, on a chat change or 20 messages after it was set. B: the host plans from names alone. C: the plan is stored in the chat variable. | A: one-way data flow holds (the viewer sends an intent, the host owns the state), nothing persists, the chat log stays the only truth. B: the host has no marker positions, so walk access is impossible. C: a UI wish written into chat data. | **A** |
| T-09 | `{{eden_route}}` output. | A: today's output unchanged as the prefix (the last player trip, `A → B`), then, when a plan is held, ` · ` and the plan line from the pack template `llm.templates.<lang>.route_plan` (kernel defaults zh / en); no plan = byte-identical to today. B: the plan replaces the old output. C: a new macro name. | A: the external macro contract keeps its meaning and gains the plan; cards that use it today see no change until the user plans a route. B: silently changes what existing presets receive. C: the user asked to extend, not rename. | **A** |
| T-10 | Layer rows and defaults. | A: two kernel layers: `transit` (menu row "transit network", **default off** per brief §2.6, stored in `edenMapLayers`, shown only on views that hold network data) and `route-plan` (no menu row; visible while a plan or a suggestion exists); the "route here" link on place cards works whether the row is on or off. B: `transit` default on when the pack declares a network. C: each pack declares its own layers. | A: the standing rule for new toggles holds and routing is still one tap away. B: breaks brief §2.6 and changes the first pack's default look. C: four layer rows per pack to get the same thing. | **A** |
| T-11 | Visual style of the network. | A: a thematic transit map drawn with the existing blocks: district areas tinted by function (kernel palette, pack-overridable) with the danger level as outline weight and dash plus a word in the label; lines octilinear with parallel offsets on shared segments and number badges at the ends; stations as dots, interchanges as white rings; a label hierarchy district > interchange > station > badge; no station label where a marker label already names the place. B: straight lines, no districts. | A: the user's visual target, built from blocks every pack already has. B: a diagram, not a map. | **A** |
| T-12 | Trips along the network. | A: when both ends of a trip attach, the trip is drawn along the network path instead of the arc, restricted to the network modes of the trip's own drawing class when it has one (an `air` or `teleport` trip is never routed); the trip keeps its own colour, age fade and click card, which adds "path along the transit network (estimated)"; anything that does not attach is drawn as today. B: only while the `transit` row is on. C: never. | A: the trip shows how the player most likely went; nothing is lost (the card still names the floor and mode). B: a hidden switch changes the trips layer. C: the user's request is not met. | **A** |
| T-13 | Districts with function and danger. | A: inside the transit block (`districts`: name, function from a fixed kernel list, danger 0–3, a polygon or a node with a radius, optional node link); B: new node fields `function` / `danger`. C: only as pack layers. | A: the thematic map is one block; the router can tell the danger of the districts a route passes. B: a polygon still needs a home, and auto-pack nodes have no polygons. C: no semantics for the router or the text. | **A** |
| T-14 | The first pack's demo network. | A: `tc_mid` only: four maglev lines (the card's mid-tier public transport, `docs/card-digest.md` L33, L101; the card names no lines or stations, so the pack numbers them), one metro line (the metro entrance, L103), walkway links (L102), two hover-taxi air links (L100); stations only at existing markers; districts from the map's own district words with danger by "safety falls with height" (L33); generated by a tool script. B: `tc_mid` + `tc_low` with a cross-tier link. C: no first-pack data. | A: a full demo where the user plays most; nothing new is placed on the map. B: the card has no lift or shaft service between the tiers (L117). C: the feature is invisible in the user's own card. | **A** |
| T-15 | Router API for the S7 "suggested route" op (N7). | A: a pure `routeOp(op, ctx)` on the host validates `{ to, from?, why? }` through the node tree (names locate, nodes differ, the pack has a network), stamps floor and map, keeps at most 3 per session (aged out after 20 messages) and sends them in `eden-map:ops` as a new optional `routes` field; the viewer plans each one and draws it in the `route-plan` layer as a suggestion (dashed); a suggestion never reaches the macro; "use this route" makes it the user's plan. S8-4 builds the API, the field and the drawing; S7 builds the op. B: the host plans the suggestion fully. | A: the same shape and session rules as `OP_CLUE` / `OP_MARKER`; the model never writes a route the user did not choose into the prompt. B: impossible without positions (T-08). | **A** |
| T-16 | N8: the automatic schematic in the same style. | A: an implicit schematic view whose drawn subtree has at least 8 nodes and at least 2 branches with children draws thematic: branch hulls tinted by a function read from generic kernel words in the names, branches drawn as coloured lines, hubs as rings, marker labels ranked; smaller subtrees keep today's plain diagram; an explicit view chooses with `x-style`; no network is made up (an automatic pack has no routing). B: always thematic. C: also synthesize a network with nominal minutes. | A: cards with enough places look like the target, the minimal pack stays byte-identical. B: a five-node tree with tinted blobs is noise. C: made-up minutes would reach the model through the macro. | **A** |

## 1. Scope

S8-4 adds a transit network to the Spatial OS: data says which stations, lines, links and districts exist; the kernel
routes over them, draws them as a thematic transit map, draws the planned route, lets trips follow the network, and
hands the plan to the model through the existing `{{eden_route}}` macro. Two implementation prompts (Sonnet · High):

- **S8-4a** — contract K-R107, K-R108, K-R109; the v2 schema `transit.schema.json`; the pure core: `core/transit-spec.mjs`
  (validation, healing, kernel modes, limits), `core/router.mjs` (graph, attachment, planning, plan check, plan text, the
  op API), `core/transit-geometry.mjs` (octilinear paths, offsets, the synthetic block layers of the network and of a plan)
  and `core/thematic.mjs` (functions, palette, danger styles, function words, hulls, the thematic schematic model); the
  overlay merge for schema-1 packs; node tests. No DOM, no host, no pack data.
- **S8-4b** — contract K-R110 … K-R114; the kernel layers `transit` and `route-plan`; the viewer modules (network drawing,
  the "route here" link, the plan card, re-planning, suggestions); trips along the network; the host route flow
  (`checkPlan`, session state, the macro); the messages; the first pack's demo network (`tc_mid`); the example pack's
  network; the thematic automatic schematic (N8); probe `pack_routes`.

Out of S8-4: the `OP_ROUTE` op itself, its prompt text and the AI 参谋 feature card (S7, N7); greying inapplicable rows
(S7); tapping a free-point station as a destination (it is not a place in the tree); timetables, fares, live
positions of vehicles; editing the network in edit mode (a later S9b follow-up: the draft folds `transit` in only as a
whole block); routing on automatic packs (T-16).

## 2. The transit block (K-R107)

### 2.1 Shape

```
transit = {
  modes?:     { <modeId>: Mode },     // merged over the kernel defaults by id; ≤ 8 in all
  stations:   Station[],              // 1 … 300
  lines?:     Line[],                 // ≤ 24
  links?:     Link[],                 // ≤ 600
  districts?: District[],             // ≤ 64
  options?:   { transfer_min?, walk_m_per_min?, access_max_min?, detour? },
  style?:     { functions?: { <fn>: { color } }, width?, labels? },
  _…, x-…                             // comments and author extensions (K-R04)
}
```

The block is optional. A pack without it behaves exactly as before everywhere (no rows, no links, no macro change).

### 2.2 Modes

```
Mode = { label: string ≤ 24, i18n?: { <lang>: { label } }, trip: 'road' | 'rail' | 'underground' | 'air' | 'teleport',
         color?: colour, dash?: number[] ≤ 6 }
```

Mode ids match `^[a-z][a-z0-9_]{0,15}$`. Kernel defaults (frozen, neutral words; labels in the core dictionaries):

| id | label (zh / en) | trip class | default look of links in this mode |
|---|---|---|---|
| `walk` | 步行 / Walk | `road` | dotted, `--muted`, 1.2 px |
| `metro` | 地铁 / Metro | `underground` | solid, the line colour |
| `maglev` | 磁悬浮 / Maglev | `rail` | solid, the line colour |
| `air` | 空中 / Air | `air` | dashed `[6, 4]`, 1.4 px |

A pack row with a kernel id overrides `label`, `i18n`, `color`, `dash` (its `trip` stays the kernel's); a new id needs
`label` and `trip`. Access legs (§3.2) always use `walk`.

### 2.3 Stations

```
Station = { id, node?: nodeId, view?: viewId, at?: [x, y], name?: string ≤ 40, i18n?: { <lang>: { name } },
            district?: districtId, hidden?: boolean }
```

- `id` matches the node id pattern `^[a-z][a-z0-9_]{0,63}$`; using the node's own id for a node station is recommended.
- A **node station** has `node` (a node of the pack's tree): its name is the node's name, its position is where the
  viewer draws that node (the marker anchor, through the same path as the trips layer and node features, K-R81).
- A **point station** has `view`, `at` (0..1 of the view's width and height, K-R31) and `name`.
- Both `node` and `at`: `at` is the drawn position on `view`, `node` is used for attachment (§3.2).
- `hidden: true` keeps the station for routing and draws no dot (a transfer corridor).
- Healing: a node that is not in the tree, a view that does not exist, a point station without a name: the station is
  dropped (`transit-station-node`, `transit-station-view`, `transit-station-invalid`) and every stop and link that uses
  it is dropped with it.

### 2.4 Lines and links

```
Line = { id, number?: string, name: string ≤ 40, i18n?: { <lang>: { name } }, mode: modeId, color: colour,
         stops: stationId[] (2 … 80), min: number | number[], loop?: boolean, oneway?: boolean, wait?: number }
Link = { from: stationId, to: stationId, mode: modeId, min: number, oneway?: boolean }
```

- `id` `^[a-z][a-z0-9_-]{0,31}$`; `number` `^[A-Za-z0-9]{1,3}$` (shown on the badge); `name` is the full display name
  ("Line 2", a pack's own wording); `color` `#rrggbb` (a line colour must be a hex, never a token: lines are told apart
  by colour, K-R64 re-check applies).
- `min` is the minutes of each segment: one number for every segment, or an array of `stops.length − 1` numbers
  (`stops.length` when `loop`). Each value 0.1 … 600. A wrong array length drops the line (`transit-line-min`).
- `loop: true` adds the segment from the last stop back to the first.
- A stop that names an unknown station is removed (`transit-line-stop`); a line left with fewer than 2 stops is
  dropped. A station may appear only once in a line (a loop repeats nothing).
- `wait` (0 … 30, default 0) is added once each time the line is boarded.
- A link joins two stations by one mode; it is how walk transfers, single hops and corridors are written. Links and
  segments run both ways unless `oneway`.
- **Interchange** (derived, never written): a station served by two or more lines, or by one line and a link to a
  station served by another line.

### 2.5 Districts

```
District = { id, name: string ≤ 40, i18n?: { <lang>: { name } }, view: viewId, pts?: [[x, y], …] (3 … 200),
             node?: nodeId, r?: number, function: Function, danger?: 0 | 1 | 2 | 3 }
```

- `Function` is one of the fixed kernel list: `civic`, `commerce`, `residential`, `industry`, `military`, `religious`,
  `education`, `medical`, `leisure`, `transport`, `nature`, `restricted`, `other`. An unknown value becomes `other`
  (brief rule 8). The labels are kernel words (zh / en, overridable through the manifest `strings`).
- Shape: `pts` (a polygon in the view's frame), or `node` + `r` (a circle around the node's drawn position, `r` a
  fraction of the width, default 0.06). `node` without `pts` needs the node to be drawn on `view`.
- `node` also tells the router which stations lie in the district (stations whose node is inside it); `Station.district`
  says it directly and wins.
- `danger` 0 (default) … 3: the drawing marks it (§4.2) and a plan reports the highest danger it passes (§3.4).

### 2.6 Options, limits and trust

| Option | Range | Default | Meaning |
|---|---|---|---|
| `transfer_min` | 0 … 30 | 3 | minutes added when boarding another line after a ride |
| `walk_m_per_min` | 20 … 200 | 80 | walking speed for access legs and the direct walk |
| `access_max_min` | 0 … 60 | 12 | longest walk access leg; 0 = node attachment only |
| `detour` | 1 … 2 | 1.25 | straight-line distance × detour = walking distance |

`style`: `functions.<fn>.color` overrides the kernel palette colour of a function (hex or kernel token, K-R58);
`width` 2 … 8 px (line width, default 4); `labels` (default true) draws the district and station labels.

Limits for every pack, runtime lenient and tools strict (K-R06): the counts in §2.1, 80 stops per line, 200 points per
district, the block ≤ 256 KB of JSON (a file block counts its file). A foreign pack (K-R63) may declare a network with
the same limits. Every string reaches the page as text; every colour, number and id is re-checked at run time (K-R64).
Problem codes start with `transit-` and are listed in `fromV1(…).problems` or `validate2(…).problems`.

### 2.7 Where the block lives (K-R108)

- Schema-2 pack: the top-level block `transit` (inline, or a relative path resolved by `resolveBlocks` like every
  block); `validate2` runs `normTransit` with the pack's trust and its node and view ids.
- Schema-1 pack: `overlay.v2.json` may carry `transit`; `compat-v1` `fromV1` runs `applyOverlayTransit(overlay, { nodes,
  views })` after the views are built and sets `pack.transit` (a schema-1 pack has no converted network; the overlay's
  block is taken as a whole, healed, never merged). `tools/check_overlay.mjs` runs it strictly.
- The viewer reads `RT.transit` (`app/nodes-runtime.mjs`), the host reads `geo.transit` (`core/event-geo.mjs`
  `makeGeo` carries it, both for `geoFromV1` and the v2 host runtime). The graph is built once per pack (`buildGraph`).
- `llm.templates.<lang>` gains three optional keys for the plan text: `route_plan`, `route_leg`, `route_danger` (§5.3).

## 3. The router (K-R109)

### 3.1 Graph

`buildGraph(transit)` → `{ stations, lines, modes, options, adj, linesAt, interchanges, order }`. Each line segment
becomes a ride edge `{ to, kind: 'ride', mode, line, min }` (both ways unless `oneway`), each link a link edge
`{ to, kind: 'link', mode, line: null, min }`. Adjacency lists keep declaration order (lines first in line order, then
links in link order); that order is the last tie-break.

### 3.2 Attaching a place

`attach(graph, end, env)` → `[{ station, min, how }]` for `end = { node?, pos? }`:

1. `at` — stations whose `node` is the end's node (min 0);
2. `inside` — else stations whose node is an ancestor of the end's node (the place is inside a station's place; the
   nearest ancestor wins; min 0);
3. `within` — else stations whose node is a descendant of the end's node (the place is a district or a building with
   stations in it; all of them, min 0);
4. `walk` — else, when `env.pos` and `env.extent` are given and the end has a position on a view with a metric extent
   (`view.extent_m`): every station on the same view whose walking minutes `distance_m × detour / walk_m_per_min` are
   at most `access_max_min`, nearest first, at most 4;
5. nothing → `[]`: the place is not on the network.

The host passes no positions, so it attaches by nodes only (steps 1–3). Two ends that resolve to the same node, or one
inside the other, have no route (`planRoute` returns `null`; the viewer shows no link).

### 3.3 Cost, tie-breaks, determinism

Dijkstra over states `(station, current line or none, has ridden)`; a virtual source joins the start candidates
(cost = their access minutes) and a virtual target the end candidates.

- ride edge on line L: + segment minutes; when L differs from the current line: + `wait(L)`, and + `transfer_min` when
  the path has ridden before;
- link edge: + its minutes; the current line becomes none;
- a mode filter (`opts.modes`) removes ride and link edges of other modes; access legs are always walks;
- a **direct walk** is a candidate when both ends have positions on the same view: `distance × detour /
  walk_m_per_min`, allowed when at most `2 × access_max_min`; it wins when it is not slower than the best network path.

Priority: total minutes, then changes, then stops, then the insertion sequence (declaration order). The same inputs
always give the same plan. 300 stations × 25 line states is far below any time budget; no caching is needed.

### 3.4 The plan

```
Plan = {
  v: 1, src: 'user' | 'op',
  from: { node: id | null, station: id | null, name },      // name: the place as the user sees it
  to:   { node: id | null, station: id | null, name },
  legs: [ { kind: 'walk' | 'ride' | 'link', mode, line: id | null, stops: stationId[], min } ],
  min, changes, modes: modeId[], danger: 0..3 | null
}
```

- Consecutive ride edges of one line merge into one `ride` leg (`stops` = every stop in riding order); consecutive link
  edges of one mode merge into one `link` leg; an access leg is `walk` with `stops` = `[station]` (the station it
  reaches or leaves); a direct walk is one `walk` leg with `stops: []`.
- Transfer and wait minutes are not legs; they are part of `min`.
- `min` = sum of legs + transfers + waits, rounded to a whole minute, at least 1; a leg's `min` keeps one decimal.
- `changes` = ride legs − 1 (0 when there is no ride).
- `modes` = the distinct modes of the legs in order.
- `danger` = the highest danger of the districts of every station on the path (by `Station.district`, else by the
  district whose `node` is the station's node or one of its ancestors), `null` when none is known (the town plan
  keep → light has danger 1: the lighthouse cape).

### 3.5 API

Pure functions in `core/router.mjs` (no DOM, no host globals, no storage):

| Function | Returns | Used by |
|---|---|---|
| `buildGraph(transit)` | Graph \| null | viewer, host |
| `attach(graph, end, env)` | Attach[] | `planRoute`, viewer link |
| `planRoute(graph, from, to, { env, modes, src })` | Plan \| null | viewer (user plans, suggestions, trips) |
| `checkPlan(graph, plan, { tree })` | Plan \| null | host (T-08) |
| `planText(plan, { lang, templates, nameOf, modeLabel, lineName })` | string | host macro, viewer card |
| `routeOp(op, { graph, locate, here, floor, map })` | `{ from, to, fromNode, toNode, why, floor, map }` \| null | S7 host op (T-15) |

`checkPlan` accepts a plan only when: `v === 1`; every leg's stations exist; a ride leg's stops are consecutive on its
line in one direction allowed by `oneway` / `loop`; a link leg's stations are joined by a link of its mode; legs chain
(the last stop of a leg is the first stop of the next ride or link leg; an access walk touches the next or previous
leg's station); a `node` given in `from` / `to` exists in the tree. It rebuilds ride and link minutes from the network,
caps each walk leg at `access_max_min` (a direct walk at twice that), recomputes `min`, `changes`, `modes`, `danger`,
and drops every name the viewer sent (names are rebuilt from the tree and the stations). Anything else → `null`.

`routeOp` validates an op row `{ to: string 1…40, from?: string 1…40, why?: string ≤ 60 }`: `to` (and `from`, default:
the current location `here`) must locate to nodes through `locate`, the two nodes must differ and not contain each
other, and the graph must exist; the result carries both texts as written, both nodes, `why` as written, `floor`, `map`.

## 4. Drawing: the thematic transit map (K-R110)

### 4.1 Kernel layers

Two kernel declarations join `KERNEL_LAYERS` (`core/layer-defaults.mjs`):

| id | slot | kind | type | order | menu | applies | default |
|---|---|---|---|---|---|---|---|
| `transit` | `routes` | `osd` | `line` | 2 | order 32, `transit.layer` "交通网" / "Transit network", title `transit.layer_title` | `{ data: true }` (the open view has stations, districts or a stub) | **off** (`edenMapLayers`, T-10) |
| `route-plan` | `trips` | `osd` | `line` | 1 | none (`hidden`) | `{ data: true }` (a plan or a suggestion has a leg on the open view) | on while it holds data |

Both draw only through the S8-2 blocks (`drawOverlay` with synthetic layer declarations built by
`core/transit-geometry.mjs`); neither has code that draws pixels itself. A pack can adjust both rows like any kernel
layer (K-R79: label, `applies`, legend, `off`). The legend tab gets the `transit` layer's rows (one per function present
on the open view, one per danger level present, one per line) through K-R84.

### 4.2 Districts

- An `area` feature per district, kind `d-<function>-<danger>`; fill = the function colour (pack override, else the
  kernel palette), `fill_opacity` 0.16; outline by danger: 0 = the fill colour 0.8 px solid; 1 = `--gold` 1.2 px
  `[6, 4]`; 2 = `--alert` 1.6 px `[6, 3]`; 3 = `--alert` 2.4 px solid.
- A `label` feature at the polygon's centroid (circle: its centre): `<name> · <function label>`, plus ` · <danger
  word>` for danger 1–3 (`注意 / Caution`, `危险 / Danger`, `极危 / Extreme`); size `body`, tone `plain`: the top of the
  label hierarchy.

Kernel palette (hex; checked for colour-vision distinctness by the S8-4a test against `core/cvd.mjs` if present, else by
a fixed pairwise distance): `civic #6c8ebf`, `commerce #e0a64b`, `residential #8fb86a`, `industry #9a8f86`, `military
#b5654f`, `religious #c9b25e`, `education #5aa9a1`, `medical #d97a9a`, `leisure #a685d1`, `transport #7f9fb3`, `nature
#5f9f63`, `restricted #c05050`, `other #8a919b`.

### 4.3 Lines, stations, interchanges

- **Lines**: one `line` feature per segment drawn on the open view, kind `l-<lineId>`, colour = the line colour, width
  `style.width`, `halo: true`. Between two stations the path is **octilinear**: horizontal, vertical or 45°, with one bend
  placed at the end nearer the line's previous stop (computed in a square frame: `y × aspect`). A segment shared by k
  lines is offset per line by `(i − (k − 1) / 2) × 0.004` of the width, perpendicular to the segment, lines in declaration
  order (the offset is in map units, so it widens on zoom: accepted).
- **Links**: a `line` feature per link, kind `k-<modeId>`, in the mode's look (§2.2).
- **Stubs**: a ride or link edge whose other end is on another view draws a `label` feature at the station: `→ <other
  station name> · <other view title>`, size `micro`, tone `chip`.
- **Stations**: a `point` feature per visible station, kind `s` (size 7, fill `--map-label-ink`, the block's border),
  interchanges kind `x` (size 11, white, the ring of the block's border). Stations are not interactive; the markers
  under them stay the tap targets.
- **Badges**: a `label` feature with the line `number` at the first and the last stop of each line on this view (a loop:
  once, at its first stop), kind `n-<lineId>`, size `small`, tone `chip`, new style key `badge: true` (K-R80 amended in
  S8-4b): the chip's background is the feature colour (`--lc`), the ink is chosen for contrast (dark on light colours).

### 4.4 Label hierarchy

| Rank | What | Block style |
|---|---|---|
| 1 | district names | `label`, size `body`, tone `plain` |
| 2 | interchange names (point stations, or node stations whose node has no marker on this view) | `label`, size `small`, tone `chip` |
| 3 | other station names (same rule) | `label`, size `micro`, tone `plain` |
| 4 | line badges and stubs | `label`, size `small` / `micro`, tone `chip` |

A node station whose node already has a marker label on the open view gets no station label (the place keeps one
name). The existing label decluttering (`declutter`) runs after each draw. `style.labels: false` drops ranks 1–3.

### 4.5 The planned route

`route-plan` draws the plan's legs that lie on the open view: rides along the same octilinear paths as their lines
(colour of the line, width `style.width + 3`, halo), links in their mode's look at width + 1, walk legs dotted `--accent`
2 px; points: start (kind `p-start`, `--ok`, size 12), end (`p-end`, `--alert`, size 12, `pulse`), each change station
(`p-change`, white ring, size 12). A suggestion (`src: 'op'`) draws its lines dashed `[8, 6]` at opacity 0.8 and no
pulse. A leg that leaves the open view ends in a stub `→ <view title>`.

## 5. Planning a route (K-R111)

### 5.1 In the viewer

- **The link.** When a place card opens (`showCard`, the `decorate` pattern of the card plugins), the route view
  resolves the current location (`#here`, `hereRes`) and the card's place to ends (`{ node, pos }`), runs `planRoute`
  and, when a plan exists, adds one link to the card: `路线 · 约 {min} 分钟` / `Route · about {min} min` (`rt.link`).
  No plan → no link, no message (brief rule 6).
- **Choosing it.** A click (or Enter) sets the plan (`src: 'user'`), draws it, opens the plan card and sends
  `eden-map:route-plan { plan }`. The plan card: title `<from> → <to>`; subtitle `约 {min} 分钟 · 换乘 {changes} 次`
  (`rt.sub`); a list of legs (line badge in the line colour, the line name or mode label, `from → to`, stop count, minutes;
  transfers as their own rows); a danger line when `danger ≥ 2` (`rt.danger`); a link "清除路线 / Clear route"
  (`rt.clear`) that clears it and sends `eden-map:route-plan { plan: null }`.
- **Positions.** A station's or place's position on a view other than the open one is read from that view's points
  file through the JSON cache (`getJSON`), so planning is asynchronous; the link appears when the plan resolves.
- **Re-planning.** While a user plan exists and `eden-map:here` changes: the new location is the plan's destination (its
  node, or inside it) → the plan clears (arrival); else a new plan from the new location to the same destination
  replaces it and is sent; no route from there → the plan stays as it was.
- **Echo.** `eden-map:route { plan }` from the host replaces the local plan (the host's copy is the truth); a plan of
  `null` clears it. Without a host (the standalone viewer) the local plan stays.

### 5.2 Messages and the host

| Message | Direction | Fields | Meaning |
|---|---|---|---|
| `eden-map:route-plan` | viewer → host | `plan: object?` | the user chose (or cleared, `null`) a plan |
| `eden-map:route` | host → viewer | `plan: object?` | the plan the host holds (after `checkPlan`), or `null` |
| `eden-map:ops` | host → viewer | + `routes: array?` | suggestions (§7) |

Host (`tavern/route-flow.mjs`, session only, nothing persisted):

- on `eden-map:route-plan`: `checkPlan(graph, plan, { tree })` with the pack's network from `geo.transit`; accepted →
  held with `at = floorNow`, `src: 'user'`, echoed; refused → the held plan is unchanged and echoed; `null` → cleared,
  echoed;
- on each new location (where the entry already emits `here`): the location's node is the plan's destination or inside
  it → cleared (echo `null` when the viewer is open);
- on each message round: `floorNow − at > 20` → cleared;
- on a chat change: cleared; on `eden-map:ready`: the held plan is sent again.

### 5.3 `{{eden_route}}`

The host's macro value for `eden_route` becomes `last + (last && plan ? ' · ' : '') + (plan ? planText(plan) : '')`
where `last` is exactly today's text (the last player trip `from → to`, or `''`). With no plan held the output is
byte-identical to today. `planText` fills the pack's templates (pack language; kernel defaults below), joins legs with
`；` (zh) or `; ` (en), and appends `route_danger` when `danger ≥ 2`:

| Key | zh default | en default |
|---|---|---|
| `route_plan` | `计划路线：{legs}。全程约 {min} 分钟，换乘 {changes} 次。` | `Planned route: {legs}. About {min} min in all, {changes} change(s).` |
| `route_leg` | `{from} → {to}（{how}，约 {min} 分钟）` | `{from} → {to} ({how}, about {min} min)` |
| `route_danger` | `途经危险区域（等级 {danger}）。` | `Passes a dangerous district (level {danger}).` |

`{how}` = the line's name for a ride, the mode label for a link or a walk; names are the pack's names (the user's own
custom names are not applied: the macro carries pack names, as the trip prefix does today). The macro stays behind its
existing switch (Settings, `edenMapMacros`, default off).

## 6. Trips along the network (K-R112)

For each trip the trips layer draws (player and characters, `eden-map:trips`), when the pack has a network and both
ends attach (§3.2, with positions): plan the route with `modes` = the network modes whose `trip` class equals the trip's
`mode`, all modes when the trip has none; trips of class `air` or `teleport` are never routed. A plan → the trip's
polyline is the plan's path on the open view (the same octilinear geometry), drawn in the existing `svg.trip` element
with the trip's own classes (`hist`, `m-<mode>`, `ch`), colour, opacity and click target (at the path's middle point);
its card adds `沿交通网（估计）` / `Along the transit network (estimated)` (`tr.along`). No plan, or an end that does not
attach → today's arc, unchanged. The in-transit arc (`renderTransit`) is not routed.

## 7. Suggested routes from the AI 参谋 (K-R113)

The S7 op (N7) will produce rows through `routeOp` (§3.5) on the host; S8-4b already delivers and draws them:

- the host keeps at most 3 suggestion rows for the session, each stamped `{ floor, map }`, aged out after 20 messages,
  cleared on a chat change, and sends them in `eden-map:ops` as `routes` next to `clues` and `markers` (an optional
  field: older viewers ignore it);
- the viewer plans each row (`planRoute(from: fromNode, to: toNode, src: 'op')`, positions as for a user plan) and draws
  it in `route-plan` as a suggestion (§4.5); a tap on its end point opens a card `建议路线 / Suggested route` with `why`
  as written, the plan summary, and "采用这条路线 / Use this route" (`rt.adopt`), which makes it the user's plan (§5.1);
- a suggestion never reaches `{{eden_route}}`, the chat or any store.

## 8. Thematic schematic for the automatic pack (K-R114, N8)

`core/schematic.mjs` and `core/pack-v2-view.mjs` (S9-1, K-R97) gain a thematic variant:

- **When.** An implicit schematic view (K-R96) whose laid-out subtree has at least 8 nodes and at least 2 branches (a
  branch = a child of the owner that has at least one child in the layout) → thematic. Otherwise today's plain picture,
  byte-identical. An explicit schematic view picks with `x-style: "thematic" | "plain"` (default plain).
- **Functions.** Each branch gets the function that most of its nodes' names point to through the kernel's generic
  function words (`core/vocab.mjs` `FUNCTION`, zh and en, generic words only — "market", "hospital", "barracks",
  "temple" …; ties: the order of the function list; none: `other`).
- **Picture** (still an SVG data URL without any text, K-R97): per branch a convex hull of its nodes' spots, padded by
  0.04, filled with the function colour at 0.16; the branch's parent–child edges drawn as one coloured line (an 8-colour
  line palette in branch order, width 6); edges outside branches grey as today; hubs (nodes with children) as white rings
  (r 9, dark stroke), leaves as dots (r 6).
- **Labels.** The projected markers carry `rank`: 1 for branch nodes, 2 for other hubs, 3 for leaves; `app/markers.mjs`
  writes it as `data-rank` on the marker element; three CSS rules (injected by the transit view's style) size the
  labels: rank 1 `--fs-body` weight 700, rank 2 `--fs-small`, rank 3 `--fs-micro` at 0.85 opacity.
- No network is made up for an automatic pack (T-16); the transit layer does not apply there. A schema-2 pack that has a
  `transit` block draws it over its schematic views like over any view (stations by node: the projected markers).

## 9. First-pack demo network (tc_mid)

Data goes into `map/packs/eden/overlay.v2.json` `transit`, generated by `tools/gen_eden_transit_s84.mjs` from
`map/data/tc_mid.json` (positions) so minutes follow the map. Card basis (`docs/card-digest.md`): the mid tier is linked
by its maglev rail, the main public transport, "everywhere", fare 2–5 Æ, no line or station names (L33, L101); a metro
entrance appears once (L103); walkways (L102); hired hover cars (L100); safety falls with height (L33). Stations sit only
at existing `tc_mid` markers (node stations, id = node id).

Modes (pack overrides; labels in pack data): `maglev` → label 悬浮轨道 / en "Maglev rail"; `metro` → 地铁 / "Metro";
`air` → 出租悬浮车 / "Hover taxi"; new `walkway` (trip `road`, dash `[1, 4]`) → 步行连廊 / "Skywalk".

| Line | Number | Mode | Colour | Stops (marker ids) |
|---|---|---|---|---|
| `l1` | 1 | maglev | `#e8b33a` | barracks_ring, military_academy, storm_hall, enforcement_hq, reserve_office, admin_council, schneider_clinic, victoria_apartment, mid_care_home |
| `l2` | 2 | maglev | `#3fa7d6` | starabyss_univ, mage_tower, enforcement_hq, executive_office, council, old_apartment, merc_guild, checkpoint_c |
| `l3` | 3 | maglev | `#59b36b` | butler_academy, mid_hospital, tiancheng_univ, admin_council, culture_office, merc_guild, rebirth_workshop |
| `l4` | 4 | maglev, `loop` | `#b07cd8` | iron_cradle, butler_academy, radiance_cathedral, supreme_court, victoria_apartment, mid_care_home, mid_monastery, schneider_clinic, tiancheng_univ, mid_hospital |
| `m` | M | metro | `#e0736a` | knights_camp, rebirth_workshop, old_apartment, council, culture_office, mid_monastery |

Line names (pack data): `悬浮轨道 1 号线` … `悬浮轨道 4 号线（环线）`, `地铁 M 线`; en "Maglev Line 1" … "Maglev Line 4
(loop)", "Metro Line M". Links: `walkway` reserve_office–executive_office, executive_office–council,
tiancheng_univ–supreme_court, mid_monastery–mid_care_home; `air` enforcement_hq–victoria_apartment,
checkpoint_c–enforcement_hq. Minutes (rounded to 0.5, at least 1; `d` = metres from the map's extent 3000 × 1875):
maglev `1 + d / 400`, metro `1 + d / 350`, walkway `d / 70`, air `2 + d / 600`.

Districts (the map's own district words; polygons drawn by the executor as padded hulls of the listed markers, then
adjusted on screen so they do not overlap):

| id | name | function | danger | markers |
|---|---|---|---|---|
| `core` | 核心区 | civic | 0 | enforcement_hq, reserve_office, executive_office, admin_council, council, culture_office, storm_hall |
| `high` | 中层高区 | residential | 0 | radiance_cathedral, iron_cradle, supreme_court, victoria_apartment, mid_hospital, butler_academy, schneider_clinic, tiancheng_univ, mid_monastery, mid_care_home |
| `rim` | 外围 | military | 1 | barracks_ring, military_academy, knights_camp |
| `low` | 中层低区 | industry | 2 | rebirth_workshop, old_apartment, merc_guild, checkpoint_c |

English district names go into `i18n.en.name` (Core district, Upper mid tier, Outer rim, Lower mid tier). No other
first-pack data changes; no new marker, model or worldbook entry (no place changed, so the worldbook add-on is not
regenerated).

## 10. Acceptance: the town network and probe pack_routes

`map/packs/town/overlay.v2.json` gains (exact data in the S8-4b spec): modes `tram` (山道电车 / Hill tram, trip `rail`)
and `cable` (缆车 / Funicular, trip `rail`); stations at the five markers plus one point station `pier` (栈桥 / Pier) on
`town_harbour`; line 1 `cable` market → fish (cross-view, 4 min), line 2 `tram` keep → market → clock (3, 2 min); walk
links fish–pier 2, pier–light 3, clock–keep 4; districts 旧城 (civic, 0, polygon on `town_hill`), 鱼市仓库 (commerce, 2,
the danger-zone polygon on `town_harbour`), 灯塔岬 (nature, 1, a circle around the lighthouse node).

Expected plans: keep → light = tram 3 + change 3 + cable 4 + walk 2 + 3 = **15 min, 1 change**; clock → fish = tram 2 +
change 3 + cable 4 = **9 min, 1 change**; light → keep = 15 min (both ways).

Probe `tools/browser/pack_routes.mjs` (S8-4b) checks, on the town: the `transit` row exists and is unticked; ticked, the
hill shows districts, both lines' paths, a ring at market (interchange), the badge "2", a stub at market toward the
harbour; the harbour shows the pier label and no tram; with the location at 旧堡 the 灯塔 card shows the route link with
15 min; clicking it draws the plan (start, end, one change point) and the host stub receives `eden-map:route-plan`; the
echo `eden-map:route` with `null` clears it; a stubbed trip 钟楼 → 旧堡 with mode `rail` is drawn along the tram (a path,
not an arc); a stubbed `eden-map:ops` with one `routes` row draws a dashed suggestion and "use this route" turns it
into the plan; the first pack shows the `transit` row on `tc_mid` only, unticked; a 375 px screenshot of the plan card.

## 11. Parity

- First pack, no plan, `transit` row off (its default): the map looks the same except (a) the new `transit` row in the
  layer menu on `tc_mid` (unticked) and the hidden `route-plan` registration, (b) the route link on `tc_mid` place cards
  when the current location attaches, (c) trips between `tc_mid` stations drawn along the network. All three only add
  information; each is pinned in a test or probe and filed as one Q-item (brief §3).
- No injected text changes: `{{eden_route}}` without a plan is byte-identical (node test), the state line, the spatial
  contract and the worldbook add-on are untouched.
- The minimal pack's schematic picture is byte-identical (5 nodes, below the threshold). The automatic pack's picture
  changes only above the threshold (pinned, same Q-item family as above).

## 12. Kernel-schema additions (planned)

Reserved in `docs/kernel-schema.md` §13 ("Planned in S8-4"); the full text lands with the step that implements it:

| id | Rule | Section | Step |
|---|---|---|---|
| K-R107 | The transit block: modes, stations, lines, links, districts, options, style, limits, healing | §9 (after the layers rules) | S8-4a |
| K-R108 | The overlay of a schema-1 pack may carry `transit`; where the viewer and the host read it; plan templates | §13 | S8-4a |
| K-R109 | The router: graph, attachment, cost and tie-breaks, the plan, `checkPlan`, `planText`, `routeOp` | §9 | S8-4a |
| K-R110 | Kernel layers `transit` and `route-plan`; the thematic drawing and label hierarchy; the `badge` style key | §9 | S8-4b |
| K-R111 | Planning a route: the link, the plan card, re-planning, the two messages, the host's session state, `{{eden_route}}` | §10.2 | S8-4b |
| K-R112 | Trips along the network | §9 | S8-4b |
| K-R113 | Suggested routes: `eden-map:ops.routes`, drawing, adoption; the S7 split | §9 | S8-4b |
| K-R114 | Thematic schematic for implicit views; function words; marker ranks | §4.6 | S8-4b |

## 13. Step plan

| Step | Size | Prompt | Contents |
|---|---|---|---|
| S8-4a | L (one prompt, ≈ 5 h) | Appendix S8-4a | contract K-R107–K-R109, schema, `transit-spec`, `router`, `transit-geometry`, `thematic`, overlay merge, validation in `validate2` and the check tools, node tests |
| S8-4b | L+ (one prompt, ≈ 7 h) | Appendix S8-4b | contract K-R110–K-R114, kernel layers, viewer and host modules, messages, macro, trips, first-pack and town data, thematic schematic, probe `pack_routes` |

Order: S8-4a → S8-4b, strictly. S7 (designed in parallel) implements the `OP_ROUTE` op after S8-4b; it only calls
`routeOp` and fills `eden-map:ops.routes`.

## 14. Risks

- **Positions are asynchronous.** A place on another view needs that view's points file; the link appears a moment
  after the card. The JSON cache makes the second card instant.
- **Visual noise on the first pack.** The network sits on a rendered city; the `transit` row is off by default and the
  district fill is light (0.16). The executor checks the `tc_mid` look at 100 % and at fit zoom and may lower the fill or
  thin the lines in the pack's `style` (data only).
- **Trips changing shape.** Probes that count `svg.trip` elements keep working (one element per trip); probes that read
  path data must accept a polyline for routed trips (`trips095` uses an `air` trip, which is never routed).
- **File caps.** `trips-view.mjs` (105 lines, 2 inline styles in the ledger) and `markers.mjs` (2 inline styles) must not
  grow their ledger counts; `eden-map.js` (675, ledger) must not grow: the macro moves into `tavern/route-flow.mjs`.
- **Parallel designers.** S7 takes no K-R id; S8-4 takes K-R107–K-R114. On rebase conflicts in `docs/kernel-schema.md`
  §13 and `docs/todo.md` keep both sides.
- **Card words in the function list.** The kernel function words must be generic; the S8-4a test runs them through the
  watchdog's card-term list and drops any hit.

## Appendix — Executable specs

The two prompts below are complete: an executor (Sonnet · High) needs no other context than the repository. Line
numbers are at origin/preview `df3b5f6d` (head #239); when they have moved, find the same code by the quoted names.

### S8-4a — transit contract, schema and the pure core (router, geometry, thematic)

Model: Sonnet · High · Size L (one prompt, about 5 h). Written by the S8-4-design session on 2026-10-01 at origin/preview
`df3b5f6d` (design: `docs/transit-schema.md`; working decisions T-01 … T-16 applied by default).

**0. Why.** `docs/todo.md` N6 (transit network and routing) and N8 (thematic automatic schematic); the design is
`docs/transit-schema.md`. This step lands everything that is pure: the data contract and its validation, the router,
the geometry of the drawing and the thematic model. Nothing visible changes; S8-4b wires it into the viewer and the host.

**1. Read first.**
- `docs/agent-brief.md` (all; §2.1 no card terms in the engine, §2.2 ratchet ledger, §2.7 no citations).
- `docs/transit-schema.md` §0, §2, §3, §4.2–§4.5, §8. `docs/kernel-schema.md` K-R04, K-R06, K-R31, K-R58, K-R63, K-R64,
  K-R67, K-R79–K-R85, K-R96, K-R97 and the "Planned in S8-4" list at the end of §13.
- Code: `map/core/layer-spec.mjs` (the healing style: `normLayer`, problem codes, `LIMITS`), `map/core/pack-v2-spec.mjs`
  (`BLOCKS` L222, `llmBlock` templates L200–203, `recheck`), `map/core/pack-v2.mjs` `validate2` L140–170 (the `specs`
  table, `crossCheck`), `map/core/overlay-v2.mjs` (`applyOverlayLayers` L194–208 as the pattern; the overlay-invalid test
  at L21), `map/core/compat-v1.mjs` L60–74, `map/core/layer-geometry.mjs` (`pathD`, `styleFor`, `featuresOnView`),
  `map/core/schematic.mjs` (all), `map/core/vocab.mjs` (`PLACE`, `placeWord`), `map/core/nodes.mjs` `buildTree` API,
  `map/data/schema/v2/layers.schema.json` (style of a block schema), `tools/check_overlay.mjs`, `tools/check_pack.py`
  (schema-2 branch), `tools/check_architecture.py` (the card-term list).

**2. Scope.** IN: T0 baseline · T1 contract K-R107–K-R109 · T2 schema and block wiring · T3 `core/transit-spec.mjs` ·
T4 `core/router.mjs` · T5 `core/transit-geometry.mjs` · T6 `core/thematic.mjs` and the function words · T7 docs, RESULT.
OUT: any file under `map/app`, `map/tavern`, `map/*.mjs`, `map/viewer.html`; pack data (`map/packs/**`, `map/data/*.json`);
`core/layer-defaults.mjs` (the kernel layers come in S8-4b); `core/schematic.mjs` and `core/pack-v2-view.mjs` (S8-4b);
the protocol.

**3. Setup.**
```bash
git fetch
git worktree add -b s8-4a-transit <scratchpad>/s8-4a origin/preview
```
Baseline in the worktree before any edit: `node --test tests/*.test.mjs` (note pass / total) and `bash tools/smoke.sh`.

**4. Tasks.**

**T1 — Contract.** In `docs/kernel-schema.md` and `.zh.md`: write K-R107 (design §2.1–§2.6) and K-R109 (design §3) as
full rule paragraphs at the end of §9 (after the last layers rule), K-R108 (design §2.7) in §13 after K-R85; replace the
three planned bullets K-R107, K-R108, K-R109 at the end of §13 with "**Added by S8-4a:** K-R107, K-R109 (§9) and K-R108
(§13)"; keep the bullets of K-R110–K-R114. Amend the `llm` paragraph of §10.2 (one sentence: `templates.<lang>` may carry
`route_plan`, `route_leg`, `route_danger`, K-R108). Same heading structure in both editions.

**T2 — Schema and block wiring.**
- `map/data/schema/v2/transit.schema.json` (new; draft 2020-12, `$id` `v2/transit.schema.json`) with the shapes of
  design §2 (patterns, ranges, limits, `function` enum, `trip` enum, `patternProperties` `^_` / `^x-`).
- `map/data/schema/v2/manifest.schema.json`: property `transit` (`anyOf` path or object, `$ref` the new schema).
- `map/core/pack-v2-spec.mjs`: `BLOCKS` gains `'transit'` (last); `llmBlock` templates gain `route_plan`, `route_leg`,
  `route_danger` (`tpl`); export `transitBlock` that calls `normTransit` and maps its problems to the `bad(x, …)`
  channel.
- `map/core/pack-v2.mjs` `validate2`: `specs.transit = S.transitBlock`; in `crossCheck` (or right after it) re-run
  `normTransit(head.transit, { nodes: id => tree has id, views: id => id in head.views or implicit views })` so node and
  view references are checked against the pack (drop what fails, problems as codes).
- `map/core/overlay-v2.mjs`: `applyOverlayTransit(overlay, { nodes, views })` → `{ transit, problems }` (absent →
  `undefined`, no problem; not an object → `overlay-transit-invalid`); the overlay-invalid test at L21 also accepts an
  overlay that carries only `transit`. `map/core/compat-v1.mjs`: call it after `applyOverlayLayers` with the converted
  node ids and view ids; set `pack.transit` when defined. Keep `compat-v1.mjs` ≤ 80 lines (one line).
- `tools/check_overlay.mjs`: run `normTransit` strictly on `overlay.transit` (any problem = error); `tools/check_pack.py`:
  validate a schema-2 pack's `transit` block with the new schema file.

**T3 — `map/core/transit-spec.mjs` (new, pure, ≤ 250 lines).** Imports only `./pack-v2-spec.mjs` (`recheck`) and nothing
outside `map/core`. Exports:
- `TRANSIT_LIMITS = Object.freeze({ stations: 300, lines: 24, stops: 80, links: 600, districts: 64, modes: 8, pts: 200,
  bytes: 262144 })`, `FUNCTIONS` (the 13 ids of design §2.5, frozen), `TRIP_CLASSES` (`road`, `rail`, `underground`,
  `air`, `teleport`), `DEFAULT_MODES` (design §2.2; labels as `{ label, i18n: { en: { label } } }`), `DEFAULT_OPTIONS`
  (design §2.6).
- `normTransit(block, { nodes = null, views = null } = {})` → `{ transit, problems }`: heals per design §2.3–§2.6 (drop
  the bad part, list a problem `{ code, id?, path? }`, keep the rest); `nodes` / `views` are predicates (or `null` = not
  checked); merges modes over `DEFAULT_MODES`; clamps options; returns `transit: null` with `transit-invalid` when the
  block is not an object or no station survives. Codes: `transit-invalid`, `transit-limit`, `transit-duplicate`,
  `transit-mode-invalid`, `transit-station-invalid`, `transit-station-node`, `transit-station-view`,
  `transit-line-invalid`, `transit-line-stop`, `transit-line-min`, `transit-link-invalid`, `transit-district-invalid`.
- `modeLabel(transit, modeId, lang)`, `lineName(transit, lineId, lang)`, `stationName(transit, stationId, lang,
  nodeName)` (node stations take `nodeName(node)`), `functionLabelKey(fn)` → `'transit.fn.' + fn`.

**T4 — `map/core/router.mjs` (new, pure, ≤ 300 lines).** Imports `./transit-spec.mjs` only. Exports exactly the API of
design §3.5 with the semantics of §3.1–§3.4: `buildGraph`, `attach`, `planRoute`, `checkPlan`, `planText`, `routeOp`,
plus `KERNEL_TEMPLATES` (`{ zh: { route_plan, route_leg, route_danger, join: '；' }, en: { …, join: '; ' } }`, design
§5.3). Notes: `env.tree` is the `buildTree` object (`has`, `ancestors`, `children`); `env.pos(stationOrEnd)` returns
`{ view, x, y }` in 0..1; `env.extent(view)` returns `[w_m, h_m]`; distances `hypot(dx × w, dy × h)`. Use a small binary
heap; tie-break exactly as §3.3. `planText` never throws: missing names become `?`, missing templates fall back to the
kernel's.

**T5 — `map/core/transit-geometry.mjs` (new, pure, ≤ 250 lines).** Imports `./router.mjs`, `./thematic.mjs`. Exports:
- `octo(a, b, aspect, prev?)` → `[[x, y], …]` (2 or 3 points; design §4.3);
- `sharedOffsets(graph)` → `Map<"a|b", lineId[]>` and `offsetPath(pts, k, i, step = 0.004)`;
- `transitLayers(graph, view, { posOf, lang, nameOf, hasMarker, viewTitle, style })` → an array of synthetic layer
  declarations `{ id, type, slot, style, features }` in drawing order: districts (`area`), links (`line`), lines (`line`),
  stations (`point`), labels rank 1–3 (`label`), badges and stubs (`label`); every feature `{ view, at | pts, kind,
  label? }` as K-R81 expects; style tables via `style.by[kind]` (design §4.2–§4.4); `posOf(stationId)` returns
  `[x, y]` on `view` or `null`;
- `planLayers(graph, plan, view, { posOf, suggested, viewTitle })` → the synthetic layers of a plan (design §4.5);
- `pathOf(graph, plan, view, posOf)` → one polyline of the plan on `view` (used by trips, S8-4b), `[]` when no leg is on
  the view;
- `centroid(pts)`, `circlePts(at, r, n = 24)`.

**T6 — `map/core/thematic.mjs` (new, pure, ≤ 150 lines) and the function words.**
- `core/vocab.mjs`: `FUNCTION = { <fn>: { zh: [...], en: [...] } }` for the 12 functions other than `other`, generic words
  only (zh at most 12, en at most 12 each); `functionWord(text, lang)` → `fn | ''` (zh substring, en whole word with a
  plural `s`, as `placeWord`). Run every word through the watchdog's card-term check
  (`python3 tools/check_architecture.py` must stay green); drop any word it flags.
- `thematic.mjs` exports `PALETTE` (design §4.2), `LINE_PALETTE` (8 hex colours, distinct from each other and from
  `PALETTE.other`), `DANGER` (the four outline styles of design §4.2), `functionOf(names, lang)` (majority, ties by
  `FUNCTIONS` order, none → `other`), `hull(points, pad)` (convex hull, padded; 1 or 2 points → `circlePts`),
  `thematicModel(tree, owner, layout, { lang, min = 8 })` → `{ on, branches: [{ id, fn, color, hull, edges }], hubs,
  ranks }` (design §8: `on` false below the threshold).

**T7 — Docs and gates.**
- `docs/ARCHITECTURE.md` (+ zh, same headings): §3.1 rows for `transit-spec.mjs`, `router.mjs`, `transit-geometry.mjs`,
  `thematic.mjs`; the file counts in the §3 intro; `python3 tools/check_arch_doc.py` passes.
- `docs/naming.md` (+ zh) glossary: **transit network** (the `transit` block; not the `routes` layer, which is the view
  data's patrol rings), **station**, **line** (a transit line; not a `line` block), **plan** (a router result; the
  "planned route"), **district** (a transit district; the node tree's district nodes are nodes).
- `docs/todo.md` §0: under S8 strike `S8-4a` with the date and "(shas in its RESULT)"; status line updated.

**5. Constraints.** Pure modules only: no DOM, no storage, no host globals, no `fetch`; `map/core/*` imports nothing
outside `map/core`. ≤ 400 lines per file (targets above). No card terms anywhere in `map/core` (comments included).
No academic citations (shortest-path algorithms are described by mechanism only). Nothing visible changes.

**6. Tests to add.**
- `tests/transit_spec.test.mjs`: every healing case of design §2 (one per problem code), limits, mode merge, option
  clamps, a node / view predicate drop, a block with only bad stations → `null`.
- `tests/router.test.mjs`: on an inline copy of the town network of design §10 (with a fake tree: keep, market, clock,
  fish, light under two view nodes): keep → light = 15 min, 1 change, legs `ride tram [keep, market]`, `ride cable
  [market, fish]`, `link walk [fish, pier, light]`; clock → fish = 9 min; light → keep = 15 min; attachment steps 1–4
  (a room node under `market` → `inside`; the hill view node → `within` three stations; a positioned end 300 m from
  `pier` with `walk_m_per_min` 80, `detour` 1.25 → `walk` 4.7 min); the mode filter (`rail` only: clock → keep goes by
  tram, 5 min); a direct walk beating the network; same node → `null`; determinism (100 runs, identical JSON);
  `checkPlan`: accepts the planner's output unchanged, recomputes tampered minutes, refuses a non-adjacent ride, a
  broken chain, an unknown station, a missing node, and drops tampered names; `planText` zh / en with the kernel
  templates and with pack templates, the danger sentence at danger 2; `routeOp`: valid row, unknown name, same node,
  over-long `why`, no graph.
- `tests/transit_geometry.test.mjs`: `octo` cases (horizontal, vertical, 45°, one bend), shared offsets on a segment of
  two lines, `transitLayers` on the town hill view (counts per synthetic layer, kinds, no station label where
  `hasMarker` is true, the stub at market), `planLayers` (start / end / change points, suggested dash), `pathOf`.
- `tests/thematic.test.mjs`: `functionOf` (zh and en words, ties, none), `hull`, `thematicModel` on a 6-node tree (`on`
  false) and on a 12-node tree with three branches (`on` true, ranks 1 / 2 / 3), palette distinctness.
- `tests/overlay_transit.test.mjs`: `fromV1` with an overlay `transit` sets `pack.transit`; a bad block is reported; a
  pack without it has no `transit`; `validate2` of a schema-2 pack with an inline `transit` (and with a bad node ref).
- Update the count assertions the new block touches (`tests/pack_schema_v2.test.mjs` BLOCKS list, if pinned).
Count = baseline + new; nothing removed.

**7. Verify.**
```bash
node --test tests/*.test.mjs
bash tools/smoke.sh
python3 tools/check_architecture.py && python3 tools/check_arch_doc.py && python3 tools/check_zh_mirror.py
python3 tools/check_pack.py && node tools/check_overlay.mjs
```
No browser probe belongs to this step (nothing in the viewer changes); CI runs node, smoke and browser-smoke after the push.

**8. Commits & push.**
1. `feat(core): transit block, router, geometry and thematic model (K-R107-K-R109)` (T1–T6 with their tests).
2. `docs: transit modules in the module map and glossary; RESULT S8-4a` (T7 and the RESULT block) — push.
Messages via file (`-F`), English, `git -c user.email=kcgoofee-jpg@users.noreply.github.com commit`, no Co-Authored-By
trailer, one git command per Bash call. Push `bash tools/push_preview.sh --head --no-escalate` (never force); then
`gh run list --branch preview -L 1` and, if in progress, a background `gh run watch <id> --exit-status`.

**9. Stop and report (BLOCKED / PARTIAL) instead of guessing when:** a design rule cannot be implemented as written (quote
it, say why, give two options); the expected town numbers of §6 do not come out (report your plan JSON); a file would
pass 400 lines; the watchdog flags a function word you cannot drop without leaving a function empty; a push is rejected
or CI fails twice; the test count drops.

**10. Report.** The RESULT block of `docs/agent-brief.md` §5, appended to `docs/plans/spatial-os-log.md` and committed with
the last commit, with extra lines: `router: town keep→light <min>/<changes>, clock→fish <min>/<changes>`, `files: <new
files with line counts>`, `K-R: K-R107, K-R108, K-R109 written`.

### S8-4b — transit layers, route planning, trips, macro, demo networks, thematic schematic

Model: Sonnet · High · Size L+ (one prompt, about 7 h). Written by the S8-4-design session on 2026-10-01 at origin/preview
`df3b5f6d`; runs after S8-4a (read RESULT S8-4a first; use its module names as landed).

**0. Why.** `docs/todo.md` N6: the network drawn as a thematic transit map, the shortest route from the current location
to any tapped place, trips along the network, `{{eden_route}}` carrying the plan, a demo network for the first pack and
the example pack's network as acceptance; N8: the automatic schematic in the same style; N7: the delivery side of the
S7 suggested-route op. Design `docs/transit-schema.md` §4–§11.

**1. Read first.**
- `docs/agent-brief.md` (§2.3 one-way data flow, §2.4, §2.6 new toggles default off, §3 parity rule, §7 pack content
  rules, §8). `docs/transit-schema.md` (all). RESULT S8-4a. Kernel-schema K-R71, K-R79–K-R89, K-R96, K-R97, K-R107–K-R109.
- Viewer code: `map/app/declared-layers.mjs` (all: `registry.register`, `refreshDeclared`, the hooks), `map/app/block-overlay.mjs`
  (`drawOverlay`, `labelEl`, the CSS string), `map/app/declared-sources.mjs` (`placeAt`, `nodeAt`), `map/app/nav-ops-view.mjs`
  (all: a kernel layer with `countNow`, the `busOn` host-message pattern), `map/core/layer-defaults.mjs`,
  `map/app/layer-host.mjs` (`declared`, `layerStore` use), `map/app/markers.mjs` (`showCard` L47–69: the `decorate`
  plugins; `markerEl` L33; the point-map loop L199), `map/trips-view.mjs` (all), `map/app/locate.mjs` (`hereRes`,
  `drawnAt`), `map/app/nodes-runtime.mjs` (`makeRuntime` L28–60, `RT`), `map/app/json-cache.mjs` (`getJSON`),
  `map/app/host-messages.mjs`, `map/core/protocol.mjs` `SCHEMA`, `map/core/schematic.mjs`, `map/core/pack-v2-view.mjs`
  (`projectV2`), `map/i18n/zh.json` / `en.json`.
- Host code: `map/tavern/eden-map.js` L263–271 (the viewer-message dispatcher), L432–433 (where `here` is posted and
  emitted), L570–583 (`macroSet`), L649 (chat change); `map/tavern/tavernhelper-api.mjs` L98–110 (`MACROS`,
  `registerMacros`); `map/tavern/llm-flow.mjs` L20–27 (`sendOps`, `resetOps`); `map/tavern/nav-ops.mjs`;
  `map/tavern/host-api.mjs` (the `host` deps bag, `macroSet`); `map/tavern/events-parse.mjs` (`getGeo`);
  `map/core/event-geo.mjs` `makeGeo` L21–56, `geoFromV1` L61–64; `map/tavern/pack-runtime-v2.mjs` `geoFromV2`.
- Data: `map/data/tc_mid.json`, `map/data/maps.json` (`tc_mid`), `map/packs/eden/overlay.v2.json`,
  `map/packs/town/overlay.v2.json`, `town_hill.json`, `town_harbour.json`; `docs/card-digest.md` L12, L33, L98–L117.
- Probes: `tools/browser/pack_layers.mjs` and `layers_ext.mjs` (structure, host stub use), `tools/browser/layer_dump.mjs`,
  `tools/browser/trips095.mjs`, `tools/browser/autopack.mjs`, `tools/browser/pack_minimal.mjs`, `tools/browser/lib.mjs`.

**2. Scope.** IN: T0 freeze · T1 contract K-R110–K-R114 · T2 kernel layers and the network drawing · T3 route planning in
the viewer · T4 host route flow, messages, macro · T5 trips along the network · T6 suggestions (viewer side) · T7 thematic
schematic (N8) · T8 first-pack demo data · T9 town data · T10 probe, docs, unfreeze, RESULT. OUT: the `OP_ROUTE` op, its
DSL validation and prompt text, the AI 参谋 naming and feature card (S7); any Settings row or new storage key; the
state line, spatial contract and worldbook add-on; first-pack places, markers, models; `map/viewer.html`.

**3. Setup.**
```bash
git fetch
git worktree add -b s8-4b-routes <scratchpad>/s8-4b origin/preview
```
Baseline before any edit: tests count, `bash tools/smoke.sh`, `node tools/browser/layer_dump.mjs
<scratchpad>/s8-4b-before.json`, `node tools/browser/trips095.mjs <scratchpad>/t95-before`, `node
tools/browser/autopack.mjs <scratchpad>/ap-before`, `node tools/browser/pack_minimal.mjs <scratchpad>/pm-before`; keep
their ✓ / ✗ lists.

**4. Tasks.**

**T0 — Freeze.** T8 and T9 edit pack data. If `docs/plans/FREEZE_MAPS` exists on origin/preview, stop per §9. Create it
(one line: `S8-4b transit data`) in its own commit **right before the data commit** (§8 commit 2) and push that commit
alone; delete it in the last commit.

**T1 — Contract.** kernel-schema en + zh: K-R110 (design §4) and K-R112 (§6) and K-R113 (§7) at the end of §9 after
K-R109; K-R111 (§5) in §10.2 after the `llm` paragraph; K-R114 (§8) in §4.6 after K-R97; amend K-R80 with the style key
`badge` (label block). Replace the remaining planned bullets with "**Added by S8-4b:** …"; when K-R107–K-R114 are all
written, the "Planned in S8-4" list is gone. Protocol additions are described in K-R111 and K-R113.

**T2 — Kernel layers and the network drawing.**
- `core/layer-defaults.mjs`: add `transit` and `route-plan` exactly as design §4.1 (`transit`: `menu: tgt(32, 'tgTransit',
  'transit.layer', '交通网', 'transit.layer_title', '包里声明的交通线路、站点与城区（按功能着色，标出危险等级）', { id:
  'lyr-transit' })`; `route-plan`: `menu` absent). Update `tests/layer_defaults.test.mjs` counts with the same meaning.
- `map/app/transit-env.mjs` (new, ≤ 150 lines): the viewer's router environment: `graphNow()` (`buildGraph(RT.transit)`
  once per pack), `stationPos(id, view)` (node stations: `drawnAt(hereRes(name), name)` → that map's marker anchor from
  `getJSON(registry.maps[map].data)`; point stations: their `at` on their view), `endOf(text)` → `{ node, pos, name }`
  (async; `pos` from the place's drawn marker), `envFor(view?)` → `{ tree: RT.tree, pos, extent: id =>
  registry.maps[id]?.view?.extent_m ?? null }` with positions preloaded for the views involved, `nameOf(stationId)`.
- `map/app/transit-view.mjs` (new, ≤ 250 lines): registers `declared('transit', …)` with `initialVisible:
  layerStore().transit === '1'`, `setVisible` → `saveVisible`, a `countNow` hook (as `nav-ops`) = number of features on
  the open view; draws `transitLayers(...)` through `drawOverlay` for each synthetic layer on map open, resize, language
  change and when the pack arrives; removes everything on hide or map change; runs `declutter()` after drawing; injects
  one `<style id="transitCss">` with the badge chip rule (`.lyr-lb.badge { background: var(--lc); color: var(--lc-ink);
  border-color: transparent }`) and the three marker rank rules of design §8; i18n keys `transit.layer`,
  `transit.layer_title`, `transit.fn.<fn>` (13), `transit.danger.1..3`, legend rows through the layer's `legend`
  (K-R84: one row per function and danger present on the view, one per line).
- `app/block-overlay.mjs` `labelEl`: when `s.badge` is true add class `badge` and set `--lc` (re-checked colour) and
  `--lc-ink` (`#14121a` when the colour's luminance > 0.5, else `#ffffff`); `core/layer-spec.mjs` / `layer-geometry.mjs`
  accept the `badge` boolean (K-R80 amendment) with a test.
- Register the plugin and imports where the other kernel views are loaded (find where `nav-ops-view.mjs` is imported in
  `map/app/boot.mjs` and add the two new views next to it).

**T3 — Route planning in the viewer** (`map/app/route-plan-view.mjs`, new, ≤ 300 lines). Design §5.1 and §4.5:
- `decorate(el, name)` plugin (`register('RoutePlanView', …)`, called from `showCard` next to `GalleryView.decorate`: one
  added line in `markers.mjs`): async plan from `#here` to the card's place; when a plan exists, append the link (an `<a
  role="button" tabindex="0" data-route>` with `textContent`) to `#card .extra`; the click sets the plan.
- Plan state `{ user: Plan | null, suggestions: Plan[] }`; `draw()` through `planLayers` + `drawOverlay` on the kernel layer
  `route-plan` (registered with `declared('route-plan', …)`, always visible, `countNow` = features on the open view);
  the plan card through `showCard(null, title, '', html, sub)` with all pack text escaped (`esc`) or set as
  `textContent`; line colours through `--lc` custom properties after the K-R64 re-check (no `style=` attribute).
- Messages: post `eden-map:route-plan { plan }` (the `post` helper the viewer uses for intents); handle `eden-map:route`
  and `eden-map:here` with `busOn` (key `routes.hostMsg`, `window.__isFromHost?.(e)`), re-plan / arrival per design §5.1.
- i18n keys: `rt.link`, `rt.sub`, `rt.clear`, `rt.danger`, `rt.change`, `rt.walk`, `rt.stops`, `rt.suggested`,
  `rt.adopt`, `tr.along` (zh and en; English: "Route · about {min} min", "About {min} min · {changes} change(s)", "Clear
  route", "Passes a dangerous district (level {n})", "Change", "Walk", "{n} stops", "Suggested route", "Use this
  route", "Along the transit network (estimated)").

**T4 — Host route flow, messages, macro.**
- `core/event-geo.mjs` `makeGeo` accepts `transit` and returns it as `geo.transit` (and `geo.graph()` built once);
  `geoFromV1` passes `r.pack.transit`; `tavern/pack-runtime-v2.mjs` `geoFromV2` passes `pack.transit`.
- `map/tavern/route-flow.mjs` (new, ≤ 150 lines; factory `createRouteFlow(host)` with a `DEPS` list as the other flows):
  session state per design §5.2; `onPlan(msg)`, `onHere(here, floor)`, `onRound(floor)`, `onChat()`, `onReady()`;
  `macroValue(key, match)` (the whole body of today's `macroSet` callback: `eden_here`, `eden_fly` unchanged, `eden_route`
  = design §5.3) and `macroSet(on)` moved here from `eden-map.js` L570–583 verbatim except the `eden_route` branch;
  suggestion rows storage for T6 (`addSuggestions(rows, { floor, map })`, cap 3, age 20) exported for S7.
- `map/tavern/eden-map.js`: replace the `macroSet` function with the route flow's (the deps bag key `macroSet` keeps its
  name); add `if (e.data?.type === 'eden-map:route-plan') RF.onPlan(e.data);` to the dispatcher; call `RF.onHere(here)`
  on the line that emits `here` (L433, same line) and `RF.onChat()` on the chat-change line (L649, same line); send the
  held plan on `eden-map:ready` where the ops are re-sent. **The file must not grow** (it is in the lines ledger at 675):
  the moved function pays for the new lines.
- `core/protocol.mjs` `SCHEMA`: `'eden-map:route-plan': [VIEWER_TO_HOST, { plan: 'object?' }]`, `'eden-map:route':
  [HOST_TO_VIEWER, { plan: 'object?' }]`, `'eden-map:ops'` gains `routes: 'array?'`; update `tests/protocol.test.mjs`.

**T5 — Trips along the network** (`map/trips-view.mjs`, design §6). In `renderTrips`, before `arc(...)`: when
`graphNow()` exists and the trip's mode is not `air` / `teleport`, take the plan from a per-trip cache (key: from, to,
mode; filled asynchronously by `transit-env` and re-rendered once when it resolves); `pathOf(...)` with at least 2 points
→ draw a polyline in the same `svg.trip` element (same classes, opacity, colour variable), the hit pin at the path's
middle point, and the card line `tr.along`; otherwise today's arc. The file must stay ≤ 150 lines and its inline-style
ledger count (2) must not grow: move the new code into `transit-env.mjs` helpers if needed.

**T6 — Suggestions (viewer side).** `route-plan-view.mjs` handles `eden-map:ops` `routes` rows (at most 3): plan each
with `src: 'op'`, draw dashed, tap on the end point → card with `why` (`textContent`), the summary and the adopt link;
adopting = a user plan (sent to the host like any). Host side: `route-flow.mjs` `addSuggestions` and the `routes` field
in `llm-flow.mjs` `sendOps` (`opOv.routes`, empty until S7 calls `addSuggestions`); `resetOps` clears them.

**T7 — Thematic schematic (N8).** `core/schematic.mjs`: `schematicSvg(layout, tree, model?)` draws design §8 when
`model?.on` (hull polygons, branch polylines, rings, dots; no text; fixed numbers formatted as today); without a model the
output is byte-identical to today (pin with a test against a stored copy for the minimal pack). `core/pack-v2-view.mjs`:
for a schematic view, `thematicModel(tree, owner, spots, { lang: pack.lang })` when the view is implicit or has
`x-style: "thematic"` (an explicit view without it stays plain); markers get `rank` from `model.ranks`.
`app/markers.mjs`: `markerEl` reads `rank` and sets `el.dataset.rank` (1–3 only). `views.schema.json`: `x-style` needs no
schema change (extension field), document it in K-R114.

**T8 — First-pack demo data** (design §9). `tools/gen_eden_transit_s84.mjs` (new; `fileURLToPath(new URL(…,
import.meta.url))` for paths) reads `map/data/tc_mid.json`, builds the block (stations = the 26 markers as node stations;
verify each id with `buildRuntime`'s tree, use the node id the runtime gives for a marker if it differs; lines, links,
minutes by the design formulas; districts as padded hulls (pad 0.03) of the listed markers through `thematic.hull`, then
reviewed on screen and hand-adjusted in the generator's input table so they do not overlap), and writes it into
`map/packs/eden/overlay.v2.json` `transit` (stable key order; the rest of the file byte-identical). Pack wording only in
this data (names and labels of design §9, zh with `i18n.en`). `python3 tools/check_pack.py` and
`node tools/check_overlay.mjs` green.

**T9 — Town data** (design §10). Add to `map/packs/town/overlay.v2.json`:
```json
"transit": {
  "modes": {
    "tram":  { "label": "山道电车", "i18n": { "en": { "label": "Hill tram" } }, "trip": "rail" },
    "cable": { "label": "缆车", "i18n": { "en": { "label": "Funicular" } }, "trip": "rail", "dash": [8, 3] }
  },
  "stations": [
    { "id": "keep", "node": "keep" }, { "id": "market", "node": "market" }, { "id": "clock", "node": "clock" },
    { "id": "fish", "node": "fish" }, { "id": "light", "node": "light" },
    { "id": "pier", "view": "town_harbour", "at": [0.43, 0.86], "name": "栈桥", "i18n": { "en": { "name": "Pier" } } }
  ],
  "lines": [
    { "id": "cable", "number": "1", "name": "缆车线", "i18n": { "en": { "name": "Funicular" } }, "mode": "cable",
      "color": "#63b4be", "stops": ["market", "fish"], "min": 4 },
    { "id": "tram", "number": "2", "name": "山道电车", "i18n": { "en": { "name": "Hill tram" } }, "mode": "tram",
      "color": "#e8b33a", "stops": ["keep", "market", "clock"], "min": [3, 2] }
  ],
  "links": [
    { "from": "fish", "to": "pier", "mode": "walk", "min": 2 },
    { "from": "pier", "to": "light", "mode": "walk", "min": 3 },
    { "from": "clock", "to": "keep", "mode": "walk", "min": 4 }
  ],
  "districts": [
    { "id": "old_town", "name": "旧城", "i18n": { "en": { "name": "Old Town" } }, "view": "town_hill", "function": "civic",
      "danger": 0, "pts": [[0.60, 0.57], [0.79, 0.60], [0.78, 0.69], [0.62, 0.71]] },
    { "id": "fish_docks", "name": "鱼市仓库", "i18n": { "en": { "name": "Fish-market warehouses" } }, "view": "town_harbour",
      "function": "commerce", "danger": 2, "pts": [[0.47, 0.80], [0.58, 0.79], [0.60, 0.88], [0.49, 0.90]] },
    { "id": "cape", "name": "灯塔岬", "i18n": { "en": { "name": "Lighthouse Cape" } }, "view": "town_harbour",
      "function": "nature", "danger": 1, "node": "light", "r": 0.05 }
  ]
}
```
(Node ids: verify `keep`, `market`, `clock`, `fish`, `light` with the town runtime's tree; coordinates may be adjusted
on screen.)

**T10 — Probe, docs, unfreeze, RESULT.**
- New probe `tools/browser/pack_routes.mjs <out dir>` with the checks of design §10 (town desktop; one 375 px screenshot
  of the plan card; the first-pack part: `tc_mid` shows the `transit` row unticked, ticking it draws 5 lines and 4
  districts, the route link on the 天城执法局总局 card with the location at 辉光大教堂).
- `docs/ARCHITECTURE.md` (+ zh): rows for `transit-env.mjs`, `transit-view.mjs`, `route-plan-view.mjs`,
  `tavern/route-flow.mjs`, `tools/gen_eden_transit_s84.mjs` if tools are listed; the data-flow paragraph on pack-driven
  viewer behaviour gains one sentence on `transit`; `python3 tools/check_arch_doc.py` passes.
- `docs/naming.md` (+ zh): the macro row of `{{eden_route}}` says "the last trip, plus the planned route when one is
  held"; glossary **route plan**, **suggested route**.
- `docs/todo.md`: N6 and N8 struck with the shas; N7 gets "→ router API and delivery ready (S8-4b); the op is S7's";
  §0 S8-4b struck; one Q-item for the parity additions (§11 of the design) with the recommendation "accept".
- Delete `docs/plans/FREEZE_MAPS`.

**5. Constraints.** Engine files carry no card terms (all pack wording is in the two overlays and the generator); no
bare z-index; no new `style=` attribute; ≤ 400 lines each (targets above); `eden-map.js`, `viewer.html` and the ledgers
must not grow. One-way data flow: the viewer only sends intents (`eden-map:route-plan`), the host owns the plan; nothing
is written to the chat, the chat variable, `stat_data` or any worldbook; no new storage key (the `transit` row uses
`edenMapLayers`). Pack text reaches the page only through `textContent` / `esc()`. The `transit` row is off by default.

**6. Tests to add.**
- `tests/route_flow.test.mjs`: accept / refuse / clear through `checkPlan`; arrival clears; 20-message ageing; chat
  change; `macroValue('eden_route')` with no plan is byte-identical to the old expression (a frozen copy of today's
  callback in the test) for five trip lists; with the town plan keep → light it is `<last> · 计划路线：…` (exact string,
  zh and en); suggestions cap 3, age 20.
- `tests/transit_data.test.mjs`: the first pack's network: every station is a `tc_mid` marker node of the runtime tree,
  every line has the stops of design §9, minutes follow the formulas (recompute from `tc_mid.json`), districts are
  valid polygons on `tc_mid`, no problems from `normTransit`; the town network: the plans of design §10.
- `tests/schematic_thematic.test.mjs`: the minimal pack's picture byte-identical to the stored copy; a 12-node implicit
  view → thematic picture (hull and polyline elements present, no `<text`), ranks on the projected markers; `x-style`.
- `tests/layer_defaults.test.mjs`, `tests/protocol.test.mjs`, `tests/host_split.test.mjs` (new names), block-overlay
  `badge`: updated with the same meaning.
- Count = baseline + new; nothing removed.

**7. Verify.**
```bash
node --test tests/*.test.mjs
bash tools/smoke.sh
python3 tools/check_architecture.py && python3 tools/check_pack.py && node tools/check_overlay.mjs
node tools/browser/pack_routes.mjs <scratchpad>/pr
node tools/browser/layer_dump.mjs <scratchpad>/s8-4b-after.json
node tools/browser/layer_dump.mjs --diff <scratchpad>/s8-4b-before.json <scratchpad>/s8-4b-after.json
node tools/browser/trips095.mjs <scratchpad>/t95-after
node tools/browser/autopack.mjs <scratchpad>/ap-after; node tools/browser/pack_minimal.mjs <scratchpad>/pm-after
```
Only this step's probes are listed; CI runs node, smoke and browser-smoke after the push. Expected: `pack_routes` all
green; `layer_dump` differs only by the two new kernel rows (`transit` with its row, `route-plan` without) and the index
shifts they cause; `trips095` as before; `pack_minimal` as before; `autopack` as before or differing only in the
thematic picture (pin it, same Q-item). Check `tc_mid` by eye at fit and 100 % with the row on; copy one screenshot to
`~/eden-map-review/s8-4b/`.

**8. Commits & push.**
1. `feat(viewer,host): transit layers, route planning, trips along the network, eden_route plan (K-R110-K-R113)` (T1–T6,
   tests).
2. `chore: freeze maps for S8-4b transit data` — push at once (FREEZE_MAPS only around the commit that edits map data).
3. `feat(packs): tc_mid demo network and the town network; thematic schematic (K-R114)` (T7–T9, tests).
4. `test: pack_routes probe; docs; unfreeze; RESULT S8-4b` (T10, RESULT) — push.
Same commit and push rules as S8-4a §8.

**9. Stop and report when:** `FREEZE_MAPS` exists before T0; `eden-map.js` would grow; a ledger grows; a file passes 400
lines; `{{eden_route}}` without a plan differs from today in any case; a probe that passes on the base fails after
(other than the pinned additions); the first pack's injected texts change; a push is rejected or CI fails twice; the test
count drops. Always delete `FREEZE_MAPS` (commit + push) before stopping, unless T0 never landed.

**10. Report.** RESULT block with extra lines: `parity: layer_dump +2 kernel rows; trips095 <n>/<n>; autopack <same |
thematic picture pinned>; pack_minimal identical`, `routes: town keep→light <min>/<changes>; tc_mid stations <n>, lines
<n>, districts <n>`, `macro: no-plan output identical in <n> cases`, `files: <new files with line counts>; eden-map.js
675 -> <n>`, `todo: N6, N8 struck; N7 delivery noted; Q-<n> filed`.
