# Zero-config, universal script, runtime card reading and in-viewer editing (S9 / S9b design)

> Canonical English edition; Chinese edition: `docs/zero-config.zh.md` (same heading structure, gated by
> `tools/check_zh_mirror.py`). Output of plan step **S9-design** (plan `docs/plans/spatial-os.md` §5 Stage C S9 / S9b,
> §10 author walkthrough, decision D13; todo I-12, E-08). Status: **design, working decisions applied by default** (the
> user was not available on 2026-10-01: every recommendation of the review sheet below is the working decision; the user
> may override any of them in `docs/todo.md` §3). No code changes with this document. The rules it adds to the kernel
> contract are reserved as **K-R90 … K-R103** (`docs/kernel-schema.md` §13, "Planned in S9"; K-R79–K-R89 are left to the
> S8 design that runs in parallel). Their full text lands with the step specs in the appendix. Every statement about
> today's code was checked at origin/preview `7958b5ad` (head #207).

## 0. Review sheet (Z-01 … Z-19)

One row per real decision. "Working decision" = the recommendation, applied by default on 2026-10-01 (autopilot). The
same list is in `docs/todo.md` §3, one line per item. Rules the agent brief already fixes (the engine never writes the
card or the user's worldbooks, new switches default off, no blocking dialogs) are not offered as choices.

| id | Question | Options | Consequences | Recommendation (working decision) |
|---|---|---|---|---|
| Z-01 | Order of the pack sources. | A: plan order — card-embedded → index match → user URL / file → automatic. B: the user's explicit choice for this card first (URL, file, a shipped pack, or "automatic"), then card-embedded → index match → automatic. | A: a broken or hostile embedded pack can never be replaced by the user; the URL / file tier is only reached for cards with no embedded pack and no index match. B: every automatic step keeps the plan order; the user can always override (kernel-schema §2.3 already decided this for safety). | **B** |
| Z-02 | What counts as an index match. | A: a score per shipped pack: the pack's chat variable already present in this chat (100), a `match.card` word in the card's name, creator or tags (10 per field), a `match.worldbook` title equal to an entry title of the card's own books (5 each); a candidate needs ≥ 10; ties by index order. B: card name only. | A: chats that already used a shipped pack keep it whatever the card is called; a renamed card is still found by two of its entry titles; a single shared word never decides. B: a renamed or re-exported card silently loses its map. | **A** |
| Z-03 | The standalone viewer (opened without a tavern, the repository's demo and test page). | A: it opens the index's `default` pack, as today. B: it opens a zero-config demo. | A: every existing probe and the public demo keep working; the default is data (`packs/index.json`), not code. The tavern host never uses it. B: rewrites the probe harness for no user benefit. | **A** |
| Z-04 | Which worldbook entries of the card become place nodes. | A: only entries recognised as places (title or a key holds a kernel place word of the pack language, or a nested title whose outer part is already a place); other entries are ignored (growth may still add them when the chat names them). B: every entry is a candidate. C: none (growth only). | A: few false places (people, rules, factions stay out); some real places without a place word appear only once the chat names them. B: people and rule entries become map pins. C: the first screen of an unfamiliar card is empty. | **A** |
| Z-05 | Stability of the automatic pack. | A: derived once per chat and stored in the chat variable; re-derived only when the card's fingerprint (name, avatar, entry titles, variable shape) changes; node ids are hashes of names, so unchanged places keep their ids and grown nodes survive. B: re-derived on every load. | A: what the user sees does not move between sessions; an edited card is picked up. B: an unrelated worldbook edit can reshuffle the map. | **A** |
| Z-06 | Id of a card without a pack. | A: `c_<hash of card name + avatar file>` (kernel-schema O-7), kept on export, so user aliases, stash and fog survive when the export is embedded back. B: one shared id `auto` for every card. | A: two cards never share map state. B: state of different cards mixes in the same storage namespace. | **A** |
| Z-07 | Where growth (K-R26) runs. | A: only for the automatic pack (on top of the nodes read from the card). B: also behind a default-off switch for authored packs. | A: authored packs stay exactly as written (unknown names keep going to the "not on the map" picker). B: a second code path to test now; can be added later. | **A** |
| Z-08 | What the greeting's place does. | A: it sets the opening view (`ui.start`) only. B: it also becomes the current location. | A: no state is invented (brief rule 4: a greeting naming a place is not a stated position); the map opens where the story starts. B: the "you are here" pin appears before the chat says so. | **A** |
| Z-09 | Language of the automatic pack. | A: by script share of the card's name, greeting and entry titles (Han ≥ 30 % → `zh`, kana ≥ 10 % → `ja`, Hangul ≥ 30 % → `ko`, else `en`); fewer than 20 letters → the UI language. B: always the UI language. | A: a Chinese card read in an English UI still gets Chinese place matching and journey patterns. B: wrong vocabulary for half the users. | **A** |
| Z-10 | How the viewer opens a schema-2 pack (I-12). | A: an in-memory projection of the v2 pack into the registry shape the viewer already draws (maps, markers, point files as virtual files) plus a node runtime built straight from the v2 tree. B: rewrite the viewer modules to read v2 directly. | A: no viewer module changes behaviour for schema-1 packs; the first pack is untouched; modules can still migrate one by one later (K-R61). B: touches every viewer module at once; parity risk for the first pack. | **A** |
| Z-11 | How a schematic view is drawn. | A: a generated picture (lines and dots only, no text) opened as a single-image source, with node names as the normal markers; the same path serves "any image as a base map". B: a separate DOM / SVG renderer outside the map widget. C: canvas. | A: one drawing path, markers, cards, events and layers work unchanged; no pack text ever enters the picture (K-R64). B / C: a second renderer to maintain. | **A** |
| Z-12 | Size limit of a pack that carries pictures. | A: 1 MB for every foreign pack, pictures included (about three photos). B: 1 MB when embedded in a card; 8 MB when loaded from a URL or a file; each picture ≤ 3 MB decoded. C: no inline pictures, links only. | A: a zero-code author cannot ship a base map plus a gallery. B: cards stay light (the host keeps cards in memory), files can carry a real base map; pictures still count in the limit (E-08). C: needs hosting, which D13 avoids. | **B** |
| Z-13 | Pictures a pack names by https link (K-09 C). | A: loaded under the existing portrait switch (default on). B: a new switch "load pictures from links in packs", default off. | A: opening a card would contact third-party hosts without asking. B: links load only after the user opts in; inline and shipped pictures always show. | **B** |
| Z-14 | Where edit-mode changes live. | A: a local draft per pack in this browser (positions, parents, aliases, pictures), applied over the loaded pack and folded in by export; never written to the chat or the card. B: in the chat variable, travelling with the chat. | A: authoring is separate from playing; a reset is one button. B: every chat of the card would carry a copy, and a swipe could not undo it. | **A** |
| Z-15 | Editing a shipped pack. | A: export a full foreign copy under a new id. B: export an overlay (`overlay.v2.json` shape, K-R67) holding only the changes, for a maintainer to commit. C: no edit mode for shipped packs. | A: the copy loses shipped-only parts (tiles routes, 3D pages, legacy names). B: replaces the old maintainer-mode hand-merge with one generic file; nothing is lost. C: the maintainer keeps a separate workflow. | **B** |
| Z-16 | Do the user's own aliases ("this name means that place", K-R25) go into an export? | A: yes, as aliases of their nodes. B: no. | A: what the author taught the map in play is kept. B: lost on export. The ignore list, stash, fog and events are never exported (they are chat state). | **A** |
| Z-17 | Per-pack scripts made by `tools/build_preview_script.py --pack`. | A: still honoured: a pack baked into the script counts as the user's explicit choice; the flag prints a deprecation note and stays until S10. B: removed now. | A: nobody's installed script breaks. B: users of the example pack would have to re-import. | **A** |
| Z-18 | Private gallery pictures users already stored in this browser. | A: kept where they are; a node's gallery reads them by the node's name (today's room key) and by the node id; the old "public / submit" flag is ignored outside edit mode; no data migration. B: migrate the records to node ids. | A: nothing can be lost; the old flag never exported anything by itself. B: a one-time IndexedDB rewrite with a failure mode for no visible gain. | **A** |
| Z-19 | What happens when the user switches to another card while the script runs. | A: the host resolves the pack again and, when the pack changes, stops its instance and starts a fresh one (the existing takeover path), without a page reload. B: show a passive notice "reload to switch maps". | A: one script serves every card seamlessly (D13). B: simpler, but the wrong map stays on screen until a reload. | **A** |

## 1. Scope

S9 makes the engine usable for any card without code: one generic script, a pack picked per card, a schematic map that
appears on its own, and an export that turns the automatic result into a pack. S9b lets an author refine that pack in
the viewer and attach pictures. Four implementation prompts (Sonnet · High), one unit each (appendix):

- **S9-1** — schema-2 packs open natively in the viewer (I-12): projection to the viewer registry, a v2 node runtime,
  implicit and explicit schematic views, image views as a single-image source.
- **S9-2** — the universal script: per-card pack resolution in the host (user choice, card-embedded, index, automatic),
  the shipped index, URL / file import, the host side of v2 packs, the go-live switch of a foreign pack's model text,
  restart on a card switch.
- **S9-3** — runtime card reading, the automatic pack with growth, export as pack, the probe `autopack`.
- **S9b** — edit mode, the `media` block, pack pictures and private pictures, any image as a base map, the room-gallery
  migration (E-08), the probe `pack_editor`.

Out of scope: renaming external contracts (`window.EdenMap`, storage keys, chat variables, the entry file, message
types, the legacy names of the first pack; S10); `tools/card_to_pack.py` and the skill (S11; it reuses the card-reading
rules and fixtures defined here); 3D views of foreign packs (listed in the self-check as "not shown yet"); declarative
layers (S8).

## 2. Universal script and pack resolution (K-R90–K-R92, K-R99)

### 2.1 One script

The shipped TavernHelper script is the loader that `tools/build_preview_script.py` already writes (CDN routes, pinned
follow, About stamp), with no pack baked in. The pack is chosen at run time by a gate module that the entry imports
first (`map/tavern/pack-gate.mjs`, a module with top-level `await`, so the entry's synchronous start still finds
`window.__tcPack` ready, exactly as a baked script provides it today). The entry file name, `window.__tcPack` and the
storage and chat-variable names stay as they are until S10.

### 2.2 Card key and per-card choice

- **Card key** = `k` + `fnv36(name + "\n" + avatar)` where `name` and `avatar` come from the card-info bridge
  (`mvu-bridge.cardInfo`, the same three-level fallback the credits page uses; its reading moves into a shared helper so
  the gate can call it before the bridge exists). No card read → key `k0` (no per-card choice, no embedded pack, index
  by chat evidence only).
- **Per-card choice** (Settings → Advanced → "Map pack", S9-2): `automatic` (the default: run the automatic tiers),
  `index:<id>` (a shipped pack), `url:<https url>`, `file` (a pack file the user picked). Stored in this browser under
  the card key (§11). A legacy baked `window.__tcPack` counts as the choice `baked` (Z-17).

### 2.3 Resolution order (K-R90)

**K-R90 — Pack resolution.** At start and on every card switch the host resolves one pack for the current card; the
first source that yields a usable pack wins:
0. the user's choice for this card (Z-01), or a pack baked into the script (Z-17);
1. a pack embedded in the card (K-R91);
2. the best index match (K-R92);
3. the automatic pack (K-R95).

A source whose pack is refused (`validate2` returns no pack, a fetch fails, the size limit is exceeded) falls through to
the next and leaves one self-check entry; nothing blocks and no dialog opens (brief rule 6). The result is
`{ id, source: 'choice' | 'baked' | 'card' | 'index' | 'auto', trust: 'shipped' | 'foreign', schema, manifest }`:
`shipped` only for packs listed in the shipped index (K-R63). When the result is the shipped pack whose id is
`core/pack.mjs` `DEFAULT_ID` (the pack that owns the legacy names), the host starts exactly as before S9: no pack object
is injected, so every name, key and injected text stays byte-identical. Resolution reads only the card (through the
bridge), the card's own worldbooks, the top-level keys of the chat variables, the shipped index and the user's choice;
nothing is uploaded.

### 2.4 Embedded packs (K-R91)

**K-R91 — A pack embedded in the card.** Read, in this order: (1) `data.extensions.spatial_os` of the card returned by
the bridge — an object holding the manifest with every block inline, or a string holding it as JSON; (2) in the card's
own worldbooks (the current character's primary and additional books; never a global or chat book) the first entry,
in book and entry order, whose title (`name`, older hosts `comment`) equals `spatial_os:pack` after trimming; its
content is the JSON text. The entry is read whether it is enabled or not (authors should disable it, so the host never
sends it to the model). The pack must be schema 2 (a schema-1 pack is a set of files and cannot be embedded), all
inline, at most 1 MB (Z-12), and passes `validate2` as foreign; an id equal to a shipped id is refused (K-R63). The
engine never writes the card or its books (brief rule 5): putting a pack into a card is the author's action (§6.4).

### 2.5 Index and match (K-R92)

**K-R92 — The shipped index.** `map/packs/index.json` = `{ "schema": 1, "default": "<pack id>", "packs": [ { "id",
"schema", "title", "i18n"?, "match"? } ] }`, one row per shipped pack in display order; `match` has the manifest
shape (`card.name | creator | tags`, `worldbook`). For a schema-2 pack the row's `match` must equal its manifest's;
for a schema-1 pack the row is the only place that holds it. `tools/check_pack.py` checks the index against the
packs. The score of a pack for the current card (Z-02):

| Evidence | Points |
|---|---|
| the chat variables have the pack's chat variable (`chatVarOf(id, manifest)`) as a top-level key holding an object | 100 |
| a `match.card.name` word occurs in the card name (normalised, K-R17, substring) | 10 |
| a `match.card.creator` word occurs in the creator | 10 |
| a `match.card.tags` word equals one of the card's tags (normalised) | 10 |
| each `match.worldbook` title equal (normalised) to an entry title of the card's own books | 5 |

A pack is a candidate with ≥ 10 points; the highest score wins, ties by index order. Words are literal strings (no
patterns, K-R01). `default` is read only by the standalone viewer (Z-03).

### 2.6 User URL and local file (K-R99)

**K-R99 — Importing a pack.** From Settings the user gives an https URL or picks a file. A URL is fetched with
credentials omitted and no referrer, read with a streaming cap of 8 MB (Z-12), parsed as JSON; a file is read the same
way. Schema 2 only; blocks given as paths are resolved against the URL's folder for a URL pack (K-R64: they must stay
under it) and refused for a file. The pack is foreign and passes `validate2`. The text of a file pack and the last good
copy of a URL pack are kept in this browser (IndexedDB, §11) under the card key, so a later start works offline; a URL
is fetched again at each start and the copy is used when the fetch fails. A refused import shows one passive line in
the pack box (what was refused, from the problems list) and keeps the previous pack.

### 2.7 Card switch and restart

The gate listens to the host's chat-change event. When the card key changes it resolves again (K-R90); when the
resolved pack id or source changes it stops the running instance through the existing takeover path
(`host-lifecycle.mjs`: the old instance's `kill()` and cleanup) and evaluates the entry again under a cache-busting
query (`?k=<card key>`), which starts a fresh instance with the new `window.__tcPack` (Z-19). Modules that hold
pack-wide state set it again during the new instance's start (profile, event geography, worldbook prefix, chat-variable
root); a probe switches A → B → A and checks that nothing of B remains.

### 2.8 What the host hands the viewer

The injected `window.__tcPack` gains the fields `schema`, `source` and `trust` (a schema-1 pack keeps
`{ id, chatVar, manifest, events }` as `build_preview_script.py` writes it). For a schema-2 pack `manifest` is the
validated pack with every block inline (and `base`, the URL folder, for a URL pack). The automatic pack changes while
the chat runs (growth): the host then sends the new message `eden-map:pack` `{ manifest, rev, source, trust }` and the
viewer rebuilds its node runtime and redraws the open schematic in place (§5.5).

## 3. Runtime card reading (K-R93, K-R94)

### 3.1 Inputs

`readCard()` (host, S9-3) collects one plain object, `CardSource`:
`{ name, creator, tags[], avatar, greeting, books: [{ name, entries: [{ title, keys[], enabled, initvar? }] }], stat,
initvar }`. `greeting` is the card's first message with host macros removed; `stat` is the current `stat_data` (MVU,
read only); `initvar` is the parsed content of the card's variable-initialisation entry (an entry whose title holds
`initvar`, case-insensitive, in brackets). Entry contents other than that one are not read. Everything below is a pure
function of `CardSource` (`map/core/card-read.mjs`), so S11's `tools/card_to_pack.py` can share the rules and the
fixtures (`tests/fixtures/cardread/*.json`).

### 3.2 Worldbook entries to node candidates

**K-R93 — Place candidates from the card's worldbook.** For each entry of the card's own books, in book and entry
order:
1. Skip: the embedded pack entry (K-R91), the variable-initialisation entry, entries carrying our ownership marker
   (`extra.eden_id` / `extra.spatial_id`), titles longer than 40 code points, and titles equal (normalised) to a name in
   a discovered roster table (K-R41).
2. Strip one leading bracketed tag from the title (`[...]`, or full-width brackets) and split it into segments with the
   separators of K-R26 step 2, outer to inner.
3. The entry is a place when its innermost segment contains a word of the kernel's place-word list for the pack
   language (new list `PLACE` in `core/vocab.mjs`: Chinese place suffixes such as city, street, hall, room, harbour,
   mountain, academy; English nouns such as town, city, street, inn, tavern, castle, hall, room, harbour, district,
   forest, academy), or one of its keys is such a word, or its outer segment is already a place candidate (Z-04).
4. Node: id `w_` + `fnv36(normalised title)`; `name` = the innermost segment; `alias` = the name plus the keys that are
   plain words (1–20 code points, not shaped like a pattern `/.../`, no wildcard); parent = the candidate named by the
   outer segment, else the root.
5. At most 150 candidates; later ones are dropped (one self-check entry).

Nothing is decided by what a text means beyond these word lists (brief rule 8); content is never filtered.

### 3.3 Variables and entity fields

**K-R94 — Variables, people, start view and language from the card.**
- **vars**: the K-R38 discovery runs over `stat`; when `stat` is empty it runs over the shape of `initvar` (JSON, or a
  YAML subset: mappings, sequences, scalars, comments). The discovered paths are written into the automatic pack's
  `vars`, so an export carries them; the user's variable mapping still wins (K-R38).
- **entities**: groups by the K-R41 discovery (K-06 C) and fields by the K-R42 discovery, over the same shape.
- **start** (`ui.start`, Z-08): the node that `locate` (K-R24, no `here`) finds in the first 400 code points of the
  greeting; it only sets the opening view and is never the current location.
- **lang** (Z-09): over the letters of name, greeting and entry titles (at least 20): Han ≥ 30 % → `zh`; else kana
  ≥ 10 % → `ja`; else Hangul ≥ 30 % → `ko`; else `en`; fewer letters → the UI language. Languages other than `zh` and
  `en` use the `en` kernel vocabulary (K-R07).

### 3.4 Start node and language

Both are fields of the automatic pack (`ui.start`, `lang`) and are exported with it; an author changes them in the
exported file or, for the start view, in edit mode ("open here").

## 4. The automatic pack and growth (K-R95)

### 4.1 Identity and storage

**K-R95 — The automatic pack.** When no other source yields a pack, the host builds one from `CardSource`:
`{ id: 'c_' + fnv36(name + "\n" + avatar), schema: 2, title: <card name, cut to 80>, lang, nodes (K-R93), vars,
entities (K-R94), ui: { start } }`; no views (implicit schematic views, K-R96), no events block (neutral taxonomy,
K-R53), no llm block. It is foreign (K-R63). Its storage names follow the pack id through the existing derivation
(`core/pack.mjs` `prefixOf`, `chatVarOf`) until S10. The derived pack and the grown nodes are a droppable cache in the
pack's chat variable under the ASCII key `auto`:
`{ v: 1, fp, pack, grown: [node], seen: [text] }` (`seen` = the place texts growth has consumed, at most 400).

### 4.2 Stability

`fp` = `fnv36` of the card name, avatar, the sorted normalised entry titles and the sorted key paths of the variable
shape. On start: `auto` present with the same `fp` → used as is; absent or different `fp` → derived again (Z-05).
Node ids are hashes of names, so unchanged places keep their ids, and grown nodes whose parent still exists are kept.

### 4.3 Growth

Growth (K-R26) runs for the automatic pack only (Z-07), over the tree of derived plus grown nodes: every place text the
host reads (the location value, place tags, the places of character and event tags), in message order, once per text.
Grown nodes go to `auto.grown`; when the set changes the host sends `eden-map:pack` with `rev + 1`.

### 4.4 Recompute

`recomputeGrowth(messages, derived)` rebuilds `grown` from nothing: the texts are taken from each message's tags and from
the location value recorded for that message (MVU message variables where the host exposes them, else the tag). Live
growth and the recompute must give the same nodes for the same chat (brief rule 4; tested like K-R75). A drift is a
self-check count, never repaired silently.

## 5. Schema-2 packs in the viewer (K-R96, K-R97; I-12)

### 5.1 Projection to the viewer registry

**K-R96 — Opening a schema-2 pack.** `core/pack.mjs` accepts `schema: 2` next to `schema: 1` and hands a v2 manifest to
`resolveBlocks` + `validate2` + `withDefaults` (trusted only for shipped packs). The viewer then works on a projection
(Z-10), `projectV2(pack, { base })` in `map/core/pack-v2-view.mjs`, pure:
- **maps** = the nodes whose primary view (explicit or implicit, §5.2) has kind `tiles`, `image` or `schematic`; the
  map id is the node id; `start` = `ui.start` mapped to its view's owner (K-R34).
- each map: `{ title: <node name>, title_en?: <i18n.en.name>, kind: 'points', base: <tile source>, data: <virtual
  path>, markers: { <node id>: { name, name_en?, alias } }, view: { extent_m } }`; `extent_m` from the view's `extent`
  or `[1600, 1000]`.
- **tile source**: `tiles` → the DZI path under the pack base (shipped and URL packs; refused for card and file packs);
  `image` → `{ type: 'image', url }` from `src` (under the base) or `media` (K-R101); `schematic` → `{ type: 'image',
  url: <generated picture> }` (K-R97).
- **virtual point files** `v2/<pack id>/<map id>.json` = `{ extent_m, markers: [{ id, nx, ny, r }] }` with the positions
  of `positionOf` (K-R31, K-R32) or of the schematic layout; served by seeding the viewer's JSON cache, so every module
  that fetches a map's data gets it unchanged.
- `model3d` views are not projected yet (self-check: "3D view not shown").

The node runtime for a v2 pack (`makeRuntimeV2(pack)`) is built from `pack.nodes` with `buildTree` and offers the same
API as `makeRuntime` (crumbs, parent, children, levels, kind, host, geo, …), with map ids = the projected maps.

### 5.2 Implicit schematic views

A pack with no `views` block gets an implicit schematic view on its root and on every node that has children (layout
`tree`, depth 2, `open: locate`). Locating a node then opens its parent's schematic focused on it (K-R34 rule 3), and
entering a node with children opens its own. Implicit views are never exported.

### 5.3 Schematic layout

**K-R97 — Schematic layout.** `layoutSchematic(tree, owner, { layout, depth })` → `{ <node id>: { x, y } }` in 0..1,
deterministic (same tree → same picture). `tree` (default): the owner at the top centre; its descendants down to
`depth` in rows, one row per level; each node's width share is the number of leaves of its subtree within the depth;
a parent is centred over its children; a row with more than 12 nodes wraps into several rows. `list`: one column in
declaration order. `grid`: rows of ⌈√n⌉. `radial`: the owner at the centre and children on rings. The picture
(`schematicImage(layout)`) is an SVG of 1600 × 1000 units with one line per parent-child edge and one dot per node,
encoded as a `data:image/svg+xml` URL; it contains no text and no pack value (Z-11, K-R64). Node names are the normal
markers, so search, cards, events and the drawer work as on any map.

### 5.4 Image views

An `image` view (K-R30) opens as a single picture (`{ type: 'image', url }`), no DZI slicing. Positions are fractions of
the picture (K-R31). Very large pictures should still be sliced with `tools/make_dzi.py` (shipped packs only).

### 5.5 Live updates

On `eden-map:pack` with a higher `rev` the viewer re-projects, rebuilds the runtime and, when the open map is a
schematic whose layout changed, reopens it at the same zoom; markers, the current place and events are re-placed. A
schema-1 pack never receives this message.

## 6. Export and import (K-R98)

### 6.1 What export writes

**K-R98 — Export as pack.** "Export as pack" (Settings → Advanced → Map pack) writes one JSON file
`<pack id>.pack.json`: the current pack (automatic, embedded, imported or a URL pack) with every block inline, plus
- the grown nodes (as ordinary nodes; their `g_` ids are kept, K-R10),
- the edit draft (§7) folded in,
- the user's aliases as aliases of their nodes (Z-16; an alias whose node does not exist is dropped),
- pack pictures (K-R101) inline as data URLs; private pictures never (K-R102),
- `credits.card` filled from the card info (K-R08).
It never contains chat state (stash, fog, events, the ignore list, the ledger), implicit views or a field the kernel
reads only for shipped packs (`cdn`, `legacy`, `x-page`). The id is kept (Z-06). The file must pass `validate2` as
foreign and the 8 MB limit; otherwise export lists the problems and writes nothing. A file under 1 MB is marked
"fits in a card".

### 6.2 Shipped packs: overlay export

For a shipped pack export writes the changes only, as an overlay in the K-R67 shape (`overlay.v2.json`: `nodes` with
`id` and the changed `at`, `parent`, `alias`, plus `media`) named `<pack id>.overlay.json` (Z-15). A maintainer merges
it into `map/packs/<id>/overlay.v2.json`; this replaces the old gallery maintainer mode.

### 6.3 Round trip

Importing an exported file (K-R99) for the same card gives the same node tree, the same located nodes for the same
texts, the same positions and the same pack pictures. Test: export → re-import → `export` again is byte-identical.

### 6.4 Putting a pack into a card

The engine never writes the card (brief rule 5). The pack box offers two copies for the author: the file (for a URL or
a card editor's extension field `spatial_os`) and "copy as worldbook entry", the JSON text to paste into a new entry
titled `spatial_os:pack`, with the instruction to keep that entry disabled.

## 7. Edit mode (K-R100; S9b)

### 7.1 Switch and draft

**K-R100 — Edit mode.** A switch in Settings → Advanced ("Edit mode", default off, registered per brief rule 6). While
on, the viewer shows an edit bar and the operations of §7.2; off, nothing of it is drawn. Changes go into a local
draft per pack id (Z-14): `{ v: 1, nodes: { <id>: { at?, parent?, alias_add?[] } }, add: [node], views: { <id>:
view }, media: { <id>: item }, attach: { <node id>: [media id] }, start? }` in this browser's storage (pictures in
IndexedDB). The loaded pack is shown with the draft applied (the same merge as the K-R67 overlay). "Discard draft"
empties it. The draft is never written to the chat, the card or a worldbook.

### 7.2 Operations

- **Move**: drag a marker on a `tiles` or `image` view; writes `at = { x, y, view }` (K-R31: editors always write
  `at.view`). Schematic views have no frame: dragging is off there (§7.3 gives a node a picture first).
- **Change parent**: on the place card, a list of nodes that are not the node or its descendants (no cycle can be
  made).
- **Add alias**: a text field on the place card (1–60 code points, K-R27 limits).
- **Add place**: "new place here" on a framed view adds a node `e_<fnv36(name + parent)>` at the tapped point.
- **Open here**: sets `ui.start` to the open view's owner.
- **Attach pictures**: §8.
- **Export**: §6.

### 7.3 Any image as a base map

On any node, "use a picture as this place's map": the user picks a PNG / JPEG / WebP; it is re-encoded to WebP (quality
0.82, long side ≤ 4096 px, metadata dropped) and stored as a pack picture (K-R101); the node gets an `image` view with
`media` set to it. Children that had schematic positions get those positions as their first `at` in the new frame, so
nothing jumps, and can then be dragged. No DZI slicing is needed; `tools/make_dzi.py` stays the advice for very large
pictures in shipped packs.

## 8. Pack media and private images (K-R101, K-R102; E-08)

### 8.1 The media block

**K-R101 — Pack pictures.** An optional tenth block `media` (added within schema 2, K-R62) =
`{ <media id>: { src, w?, h?, note?, i18n?: { <lang>: { note } }, credit? } }` (ids `^[a-z][a-z0-9_]{0,63}$`), plus
the node field `media: [<media id>]` (the node's gallery, in order, at most 32) and the `image` view field `media`
(an alternative to `src`). A schema-1 pack's overlay may carry `media` and node `media` lists (K-R67 merge: items by
id, lists replaced).

### 8.2 Allowed sources and limits

`src` is one of:
1. a relative path under the pack base, ending in `.webp`, `.png`, `.jpg` or `.jpeg` (shipped and URL packs; the
   source guard of today's gallery generalised: no `..`, no scheme, no backslash, under the base after URL
   resolution);
2. `data:image/(webp|png|jpeg);base64,` + base64 text, at most 3 MB decoded (any pack);
3. an `https://` URL with an image file type and no query string (K-R43 URL rules), loaded only while the switch "load
   pictures from links in packs" is on (Z-13); off, the item shows as a placeholder with its note.

Anything else is refused: the item is dropped with one self-check entry (K-R06) and never reaches the page. Every
value is re-checked at run time against these exact patterns (K-R64). The K-R66 string cap does not apply to a data URL
in `media.*.src`; data URLs count in the document limit: 1 MB for a card-embedded pack, 8 MB for a URL or file pack
(Z-12). At most 200 media items per pack.

### 8.3 Private local images

**K-R102 — Private pictures.** A user may add pictures to any node for themselves; they live only in this browser
(the existing gallery IndexedDB, records keyed by scope, `n:<node id>` and picture id; scopes "this chat" and "all
chats" as today) and are **never** exported, embedded or sent anywhere. A node's gallery shows the pack's pictures
first, then the private ones; private records stored before S9b under a room name are found through the node's name
(Z-18). In edit mode a private picture can be copied into the pack ("add to pack"), which creates a pack picture in
the draft; the private record stays private.

### 8.4 Migration of the first pack's galleries

`map/data/gallery.json` (the public submission list) and `map/data/room_galleries.json` (repository-rendered room
galleries) are both empty today. Their manifest entries (`data.gallery`, `data.galleries`) and the maps-schema `gallery`
entry of a marker are replaced by the first pack's overlay `media` block and node `media` lists (empty at migration);
the place-card gallery entry and the 3D estate page read a node's pack pictures through one helper. The two files are
deleted in the same commit (it edits a pack manifest: FREEZE_MAPS around it).

### 8.5 What is removed

The maintainer-mode switch (`optGalleryMaintainer`, storage key `edenGalleryMaintainerMode`), its i18n keys
(`s.gallery_group`, `s.gallery_maintainer`, `s.gallery_maintainer_hint`), the GitHub issue link builder
(`buildIssueUrl`), the repository constant used for it, the "submit / export submission" texts and the hand-merge notes
in `map/ui/room-gallery-panel.js` and `map/core/room-gallery-logic.mjs`. Kept: the source guard
(`isValidGalleryFile`, `safeGalleryImagePath`, generalised to K-R101 rule 1), the private gallery, its quotas and
scopes.

## 9. Model-facing text of foreign packs (K-R103; K-08 B)

**K-R103 — Go-live of a foreign pack's model text.** The `llm` block of a foreign pack (templates, worldbook entries,
book name) reaches the host only while the host switch "use this pack's text for the model" is on for that pack and the
user has confirmed the current text: the switch stores `{ <pack id>: <fnv36 of the canonical JSON of the llm block> }`;
when the stored hash differs from the pack's, the switch reads as off until the user confirms again in Settings (a
passive line, no dialog). Default off. Off, the kernel templates in the pack language are used and no worldbook entry
is written. K-R65 still applies when it is on. Shipped packs are not affected.

## 10. Kernel-schema additions (planned)

| id | Rule | Section here | Lands with |
|---|---|---|---|
| K-R90 | Pack resolution order, result, legacy-default start | §2.3 | S9-2 |
| K-R91 | Pack embedded in the card | §2.4 | S9-2 |
| K-R92 | The shipped index and the match score | §2.5 | S9-2 |
| K-R93 | Place candidates from the card's worldbook | §3.2 | S9-3 |
| K-R94 | Variables, people, start view and language from the card | §3.3 | S9-3 |
| K-R95 | The automatic pack, its storage, stability and growth | §4 | S9-3 |
| K-R96 | Opening a schema-2 pack: projection and v2 runtime | §5.1 | S9-1 |
| K-R97 | Schematic layout and picture | §5.3 | S9-1 |
| K-R98 | Export as pack (and overlay export of a shipped pack) | §6 | S9-3 (overlay export: S9b) |
| K-R99 | Importing a pack by URL or file | §2.6 | S9-2 |
| K-R100 | Edit mode and the draft | §7 | S9b |
| K-R101 | Pack pictures: the media block, sources, limits | §8.1–§8.2 | S9b |
| K-R102 | Private pictures | §8.3 | S9b |
| K-R103 | Go-live of a foreign pack's model text | §9 | S9-2 |

Existing rules touched (text amended by the step that lands the new rule): K-R26 (runs for the automatic pack on top of
derived nodes, S9-3), K-R60 (`nodes` / `views` rows: implicit schematic views, S9-1), K-R66 (limits by source and the
media exemption, S9b), §2.3 (reserved names become K-R90 / K-R91, S9-2), §14.2 O-7 (closed by K-R95, S9-3).

## 11. Messages, storage keys and switches added

All added under today's names (S10 renames them with the rest).

| Kind | Name | Owner | Meaning |
|---|---|---|---|
| message host → viewer | `eden-map:pack` `{ manifest: object, rev: number, source: string?, trust: string? }` | `tavern/auto-pack.mjs` | the automatic pack changed (growth); S9-3 |
| message viewer → host | `eden-map:pack-pick` `{ kind: string, url: string?, text: string?, id: string? }` | `app/pack-settings.mjs` | the user's pack choice for this card; S9-2 |
| storage key | `edenMapPackPick` (JSON `{ <card key>: choice }`, read before any pack is known, so never pack-namespaced) | `tavern/pack-gate.mjs` | per-card choice; S9-2 |
| storage key | `edenMapPackRemote` (`'0'`) | viewer | switch: load pictures from links in packs (Z-13); S9b |
| storage key | `edenMapPackLlm` (JSON, `{}`) | host | K-R103 per-pack go-live hashes; S9-2 |
| storage key | `edenMapEdit` (`'0'`) | viewer | edit mode switch; S9b |
| storage key prefix | `edenMap:edit:` + pack id | `app/pack-edit.mjs` | the edit draft (without pictures); S9b |
| IndexedDB | `edenMapPacks` / store `packs` (key = card key) | `core/pack-store-db.mjs` | file packs and last good URL copies; S9-2 |
| IndexedDB | existing gallery database, scope `edit:<pack id>` | `app/pack-edit.mjs` | draft pictures; S9b |
| chat variable key | `<pack chat var>.auto` | host | K-R95 cache; S9-3 |

Host-read switches travel in the existing `eden-map:th` `prefs` object (as `edenMapLedgerWrite` does), with a comment
in the `SCHEMA` header; strings are added in zh and en.

## 12. Notes for S10

- `docs/naming.md` already records the macro alias note (macros `{{eden_here}}` and friends get `spatial_*` names,
  old names stay). S9 adds no macro.
- New names above use today's prefixes on purpose (`eden-map:`, `edenMap*`, `window.__tcPack`); S10's mapping table
  must list them (`eden-map:pack`, `eden-map:pack-pick`, `edenMapPackPick`, `edenMapPackRemote`, `edenMapPackLlm`,
  `edenMapEdit`, `edenMap:edit:`, `edenMapPacks`).
- The legacy-default start (K-R90, last paragraph) ends when S10 moves the first pack to K-R05 names with a migration.

## 13. Step plan and parallel work with S8

| Spec | Size | Files (create / modify) | With S8-1…3 |
|---|---|---|---|
| S9-1 | M (~6 h) | new `map/core/pack-v2-view.mjs`, `map/core/schematic.mjs`, `map/app/nodes-runtime-v2.mjs`; modify `map/core/pack.mjs`, `map/app/current-pack.mjs`, `map/app/boot.mjs`, `map/app/map-switch.mjs`, `map/app/json-cache.mjs`, `map/app/topbar.mjs`, `map/viewer.html` (first-frame preload lines only), `tools/browser/pack_minimal.mjs`, `tools/browser/known-failures.json`, tests, kernel-schema §4 / §12, ARCHITECTURE | **Serial** with any S8 step that edits `boot.mjs`, `map-switch.mjs`, `nodes-runtime.mjs` or the viewer's first-frame script; parallel with an S8 step limited to `layer-host.mjs`, `core/layer-registry.mjs`, `pack-v2-spec.mjs` layers and the layers schema |
| S9-2 | L (~6 h) | new `map/tavern/pack-gate.mjs`, `map/tavern/card-source.mjs`, `map/core/pack-index.mjs`, `map/core/pack-store-db.mjs`, `map/tavern/pack-runtime-v2.mjs`, `map/app/pack-settings.mjs`, `map/packs/index.json`; modify `map/tavern/eden-map.js` (one import on an existing line), `map/tavern/host-tavernhelper.mjs`, `map/tavern/mvu-bridge.mjs`, `map/tavern/profile-load.mjs`, `map/tavern/event-geo-load.mjs`, `map/tavern/llm-flow.mjs`, `map/core/storage.mjs`, `map/core/protocol.mjs`, `map/app/settings.mjs`, `map/viewer.html` (one line in the Advanced page), `map/i18n/{zh,en}.json`, `tools/check_pack.py`, `tools/build_preview_script.py`, `tools/browser/host_stub.mjs`, tests, kernel-schema §2.3 | **Parallel-safe** (host and core files; shared files `storage.mjs`, `protocol.mjs`, i18n, `viewer.html` take line-local additions — on a rebase conflict keep both) |
| S9-3 | L (~6 h) | new `map/core/card-read.mjs`, `map/core/yaml-shape.mjs`, `map/core/grow.mjs`, `map/core/pack-export.mjs`, `map/tavern/auto-pack.mjs`, `tools/browser/autopack.mjs`, `tests/fixtures/cardread/*`; modify `map/core/vocab.mjs` (`PLACE`), `map/tavern/pack-gate.mjs`, `map/tavern/card-source.mjs`, `map/app/pack-settings.mjs`, `map/app/boot.mjs` (the `eden-map:pack` handler via `host-messages.mjs`), `map/app/host-messages.mjs`, `map/core/protocol.mjs`, i18n, tests, kernel-schema §3.9 | **Parallel-safe** except `boot.mjs` / `host-messages.mjs` if an S8 step edits them (one handler; keep both) |
| S9b | L (~6 h) | new `map/app/pack-edit.mjs`, `map/app/pack-edit-view.mjs`, `map/core/pack-media.mjs`, `tools/browser/pack_editor.mjs`; modify `map/core/pack-v2-spec.mjs` (media block, node / view `media`), `map/core/pack-v2.mjs` (limits by source, media exemption), `map/core/overlay-v2.mjs`, `map/data/schema/v2/{manifest,nodes,views}.schema.json` + new `media.schema.json`, `map/ui/room-gallery-panel.js`, `map/core/room-gallery-logic.mjs`, `map/app/card-links.mjs`, `map/estate/main.js`, `map/app/settings.mjs`, `map/viewer.html` (Advanced page: the maintainer lines become the edit-mode lines), `map/i18n/{zh,en}.json`, `map/core/storage.mjs`, `map/packs/eden/manifest.json`, `map/packs/eden/overlay.v2.json`, `map/data/schema/{pack,maps}.schema.json`, delete `map/data/gallery.json`, `map/data/room_galleries.json`, `map/estate/model/manifest.json` (`galleries`), `tools/check_pack.py`, `tools/check_overlay.mjs`, `tests/room_gallery.test.mjs`, `tools/browser/room_gallery_ui.mjs`, kernel-schema §2.4 / §4 / §13 | **Serial after S8-1** (both edit `pack-v2-spec.mjs`, the v2 schemas and `check_pack.py`) |

Order: S9-1 → S9-2 → S9-3 → S9b (S9-3 needs S9-1's v2 viewer for its probe and S9-2's gate; S9b needs S9-3's
exporter). S9-2 may start in parallel with S9-1 (disjoint files except kernel-schema, which is append-only per section).

## 14. Risks

- **Card switch restart** (Z-19): a module that keeps pack state outside the instance could leak the old pack. Mitigation:
  the A → B → A probe step; stop rule in S9-2.
- **Place words** (K-R93) are a heuristic: false places are limited by the roster exclusion and the cap; misses are
  covered by growth.
- **Top-level await in the gate** delays the entry by the time of the card read (one bridge call, two book reads, one
  index fetch; cached per card key). Budget: 300 ms at most, else the gate resolves with the source it has and corrects
  through a restart (Z-19).
- **Data URLs in packs** inflate memory; limits by source (Z-12) and the 3 MB picture cap bound them.
- **First-pack parity**: the legacy-default start keeps the first pack's path unchanged; every spec's tests compare its
  injected text and screenshots with the base.

## Appendix — Executable specs

Each spec below is a complete prompt for one Sonnet · High session (English only). The executor has no other context:
it reads `docs/agent-brief.md`, this document and the files listed. Line numbers are at origin/preview `7958b5ad`.

### S9-1 — schema-2 packs open in the viewer (I-12)

#### 0. Why

Plan §5 Stage C, S9; todo I-12: `viewer.html?pack=minimal` shows the retry card because `core/pack.mjs` accepts schema 1
only. After this step a schema-2 pack opens natively (Z-10 projection, Z-11 schematic picture), which S9-2 / S9-3 need
for cards without a pack. The first pack and the example pack (schema 1) must behave exactly as before.

#### 1. Read first

- `docs/agent-brief.md` (all), this document §0 (Z-10, Z-11), §5, §10, §13.
- `docs/kernel-schema.md` K-R30–K-R35, K-R60, K-R63, K-R64, §2.1.
- Code: `map/core/pack.mjs` (all, 105 lines: `validate` L22–43, `resolve` L48–60, `load` L68–77); `map/core/pack-v2.mjs`
  `validate2` L128–161, `resolveBlocks` L163–173, `withDefaults` L181–198; `map/core/nodes.mjs` `buildTree`, `viewOf`
  L79, `positionOf` L93, `levelsOf` L113; `map/app/nodes-runtime.mjs` (all; `makeRuntime` L27–76, `buildRuntime`
  L79–82); `map/app/current-pack.mjs` (all, 25 lines); `map/app/boot.mjs` L60–90 (pack, registry, runtime);
  `map/app/json-cache.mjs` (all); `map/app/map-switch.mjs` L20 (`baseOf`), L56–92 (`openMap`); `map/app/topbar.mjs`
  L36–44 and L94–104 (readers that assume `base` is a DZI string); `map/viewer.html` L8–31 (first-frame pack scripts);
  `map/packs/minimal/*`; `tools/browser/pack_minimal.mjs`; `tools/browser/known-failures.json`.

#### 2. Scope

IN: T1 contract text K-R96, K-R97 · T2 `core/schematic.mjs` · T3 `core/pack-v2-view.mjs` · T4 `app/nodes-runtime-v2.mjs`
· T5 loading path (`pack.mjs`, `current-pack.mjs`, `boot.mjs`, `json-cache.mjs`) · T6 image tile sources
(`map-switch.mjs`, `topbar.mjs`) · T7 probe `pack_minimal` passes, known failure removed · T8 docs, RESULT.

OUT: the host (`map/tavern/**`), pack resolution, card reading, growth, export, edit mode, the `media` block (S9-2,
S9-3, S9b); 3D views of v2 packs; any change to schema-1 behaviour; storage keys and messages (none added); S8 layer
modules.

#### 3. Setup

```bash
git fetch
git worktree add -b s9-1-v2view <scratchpad>/s9-1 origin/preview
```
Baseline before any edit: `node --test tests/*.test.mjs` (1003 tests, 1002 pass, 1 skipped at design time; note
yours) and `bash tools/smoke.sh` green. Take `node tools/browser/s43_parity.mjs --out <scratchpad>/s9-1-before` and run
`node tools/browser/pack_town.mjs`, `node tools/browser/pack_minimal.mjs` on the untouched tree.

#### 4. Tasks

**T1 — Contract.** In `docs/kernel-schema.md` and `.zh.md` replace the planned bullets K-R96 and K-R97 (§13, "Planned
in S9") with full rule paragraphs placed in §4 (after K-R36), text from this document §5.1–§5.4; amend K-R60's
`views` row: "implicit schematic views on the root and every node with children when the pack has no `views` block
(K-R96)". Same headings in both editions.

**T2 — `map/core/schematic.mjs` (new, pure, ≤ 160 lines).** Imports only `./nodes.mjs` types (no DOM).
- `layoutSchematic(tree, owner, { layout = 'tree', depth = 2 } = {})` → `{ [id]: { x, y } }` per K-R97 (owner at
  `{ x: 0.5, y: 0.08 }` for `tree`; rows evenly spaced down to y 0.92; x by leaf share; wrap rows above 12 nodes;
  margins 0.06). `list`, `grid`, `radial` as K-R97. Deterministic; empty subtree → only the owner.
- `schematicSvg(layout, tree)` → SVG text, `viewBox="0 0 1600 1000"`, background transparent, one `<line>` per edge
  (parent and child both in the layout), one `<circle r="6">` per node; colours fixed neutral greys (no pack value);
  no `<text>`.
- `schematicUrl(svg)` → `'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)`.

**T3 — `map/core/pack-v2-view.mjs` (new, pure, ≤ 220 lines).**
- `implicitViews(pack)` → when `pack.views` is absent or empty: `{ [id]: { kind: 'schematic', layout: 'tree', depth: 2 } }`
  for the root and every node with children (ids of the built tree); else `{}`.
- `projectV2(pack, { base = '' } = {})` → `{ registry, files, problems }` per K-R96: `registry = { start, groups: {},
  maps }`; `files = { 'v2/<id>/<map>.json': { extent_m, markers: [{ id, nx, ny, r }] } }`. Positions: `positionOf`
  for framed views, `layoutSchematic` for schematic ones. Marker entries: `name` = node name, `name_en` = `i18n.en.name`
  when present, `alias` = the node's strong names. Tiles under `base` only when `base` is non-empty; otherwise a
  `tiles` view is skipped with problem `view-tiles-no-base`. `model3d` → problem `view-3d-not-shown`. Re-check every
  path with `recheck` (K-R64) before use.
- No DOM, imports only from `map/core`.

**T4 — `map/app/nodes-runtime-v2.mjs` (new, ≤ 160 lines).** `makeRuntimeV2(pack, registry)` returning the API of
`makeRuntime` (the JSDoc list at `nodes-runtime.mjs` L12–25) for a v2 tree: map ids = `Object.keys(registry.maps)`;
`host(id) = id`; `parent(id)` = nearest ancestor that is a map; `levels` via `levelsOf`; `kind(id)` = the view kind;
`standIn`, `zoneChildren`, `anchorIn` return `null` / `{}`; `geo()` = `makeGeo({ tree, views, lang, lexicon,
...taxonomyOf(pack) })`. In `nodes-runtime.mjs` add `buildRuntimeV2(pack, registry)` that sets the same `RT` (the
existing readers then work unchanged).

**T5 — Loading path.**
- `core/pack.mjs`: `validate(m)` accepts `schema === 2` with only `id` / `title` checks (the rest is `validate2`'s job);
  `load()` returns `{ ...resolve(m), schema: m.schema, v2: m }` for schema 2 (`resolve` must not require `data.maps`
  for schema 2). Error texts unchanged for schema 1.
- `app/current-pack.mjs`: for `PACK.schema === 2` run `resolveBlocks` (fetching block files relative to the pack
  folder `packs/<id>/`), `validate2(manifest, { trusted: <id is listed in packs/index.json, or no index yet: the
  pack folder is in the repository> })`, `withDefaults`; export `packV2` (the validated pack) and `packProblems`.
  Until S9-2 adds `packs/index.json`, treat a pack loaded from `packs/<id>/` as shipped.
- `app/json-cache.mjs`: `seedJSON(files)` puts each `[path, value]` as a resolved promise into `jsonCache`.
- `app/boot.mjs`: when `packV2` exists: `const { registry, files } = projectV2(packV2, { base: PACK.base })`,
  `seedJSON(files)`, use `registry` where the v1 registry is used today (`reg`), skip `world` / `derived` / `rooms`
  / `names` fetches, call `buildRuntimeV2` instead of the v1 `nodes()` builder, list `problems` in the self-check
  (the existing self-check list). Schema-1 path byte-identical.
- `viewer.html` L8–31: the first-frame preload must not request v1 files for a schema-2 pack (guard on
  `__tcPack.schema === 2` or the fetched manifest's `schema`); no new line (edit within the existing lines; the file is
  ratcheted at 707).

**T6 — Image tile sources.** `map-switch.mjs` `baseOf` may return an object `{ type: 'image', url }`; OSD accepts it.
Every reader of `m.base` that assumes a DZI string (`topbar.mjs` L96–104 tile warm-up, `hires-inset-tiles.mjs`,
`dzi-worker.mjs` if it inspects the source) skips non-string bases. `lastBase` comparisons use the URL.

**T7 — Probe.** `tools/browser/pack_minimal.mjs` part (2): `viewer.html?pack=minimal` renders: current map = `harrow`
(its schematic), 5 nodes reachable (markers on the open map + children through entering), clicking `inn` opens its
card, no uncaught page error; screenshot desktop and 375 px. Remove the `pack_minimal` row from
`tools/browser/known-failures.json`.

**T8 — Docs.** `docs/ARCHITECTURE.md` (+ zh): module rows for the three new files, file counts; §6 "Pack-driven viewer
behaviour": schema-2 packs (K-R96). `docs/todo.md`: I-12 struck through with date and sha; §0 S9 sub-line S9-1.
`python3 tools/check_arch_doc.py` must pass.

#### 5. Constraints

- Schema-1 packs: identical behaviour (registry, runtime, screenshots, text). No engine file over 400 lines; no new
  bare z-index or inline appearance style; `viewer.html` must not grow.
- `map/core/*` imports nothing outside `map/core`; the schematic picture contains no pack value and no text.
- Pack text reaches the page only through the existing marker / card code (text, `esc()`).

#### 6. Tests

- `tests/schematic.test.mjs`: layout of a hand-built tree (root → a, b; a → a1, a2): owner at top centre, a left of b,
  a1 / a2 under a, all within 0.06..0.94; same input → same output; 30 children wrap into 3 rows; `list` / `grid` /
  `radial` shapes; SVG has no `<text`, one line per edge.
- `tests/pack_v2_view.test.mjs`: the minimal pack (blocks resolved from files, `validate2` trusted) projects to maps
  `{ harrow }` plus implicit schematic maps for its parents only when `views` is absent (a copy without `views`);
  markers carry names and aliases; point files are within 0..1; a `tiles` view without base → problem; a `model3d` view
  → problem; a path that leaves the base → dropped.
- `tests/nodes_runtime_v2.test.mjs`: `crumbs`, `parent`, `children`, `levels` on the minimal pack; `geo()` places
  "heading to the inn" on `inn`.
- `tests/pack.test.mjs`: schema 2 accepted by `validate` with id / title; schema-1 messages unchanged.
- Count: baseline + new; nothing removed.

#### 7. Verify

```bash
node --test tests/*.test.mjs        # all pass; count = baseline + new
bash tools/smoke.sh                  # PASS
node tools/browser/pack_minimal.mjs <scratchpad>/s9-1-minimal     # all checks PASS (no known failure left)
node tools/browser/pack_town.mjs <scratchpad>/s9-1-town           # as on the base
node tools/browser/s43_parity.mjs --out <scratchpad>/s9-1-after
node tools/browser/s43_parity.mjs --diff <scratchpad>/s9-1-before <scratchpad>/s9-1-after   # identical or base noise
```

#### 8. Commits & push

1. `feat(core): schematic layout and the v2 pack projection (K-R96, K-R97)` (T1–T3 with tests).
2. `feat(viewer): schema-2 packs open natively (I-12)` (T4–T7).
3. `docs: v2 viewer in the module map; RESULT S9-1` (T8, RESULT) — push.

`-F` message files, English, `git -c user.email=kcgoofee-jpg@users.noreply.github.com commit`, no Co-Authored-By
trailer, one git command per Bash call. Push `bash tools/push_preview.sh --head --no-escalate`; check CI with
`gh run list --branch preview -L 1` (wait with a background `gh run watch <id> --exit-status`, never a sleep loop).
No map data is edited: no FREEZE_MAPS.

#### 9. Stop rules

Stop and report (BLOCKED / PARTIAL) when: an s43 screenshot or a schema-1 probe differs beyond base noise; the viewer
needs a module rewrite beyond T5 / T6 to draw a projected map (report which reader breaks); a file would pass 400 lines
or `viewer.html` would grow; a push is rejected or CI fails twice; the test count drops without a named replacement.
A divergence that only adds information is pinned in a test and filed as a Q-item in `docs/todo.md` §3 (brief §3).

#### 10. Report

RESULT block of `docs/agent-brief.md` §5 appended to `docs/plans/spatial-os-log.md` (committed with the last commit),
extra lines: `minimal: <checks passed>/<total>; maps <n>, nodes reachable <n>`, `parity: s43 <n> shots, identical <n>`,
`files: <new files with line counts>`. Cleanup: probe servers stopped (own PIDs), no `.claude/launch.json` entries.

### S9-2 — the universal script and pack resolution

#### 0. Why

Plan §5 S9 "unified script"; this document §2 (Z-01, Z-02, Z-03, Z-17, Z-19) and §9 (K-R103). Today a pack is baked
into the script by `tools/build_preview_script.py --pack` and the host falls back to the first pack (`packNs`,
`host-tavernhelper.mjs` L27–38). After this step one script serves every card: user choice → embedded → index →
automatic (the automatic pack itself comes in S9-3; until then that tier yields the minimal empty fallback described
in T3).

#### 1. Read first

- `docs/agent-brief.md`; this document §0, §2, §9, §11, §13.
- `docs/kernel-schema.md` §2.3, K-R05, K-R06, K-R09, K-R63–K-R66, K-08.
- Code: `map/tavern/host-tavernhelper.mjs` `packNs` L26–38; `map/tavern/eden-map.js` L11 (first imports), L28 (`packNs`),
  L188 (`__tcPack` into the viewer), L412 (`sendCardInfo`); `map/tavern/mvu-bridge.mjs` `cardInfo` L134–158 and the
  constructor L40–70 (pack, var root); `map/tavern/profile-load.mjs`, `map/tavern/event-geo-load.mjs`;
  `map/tavern/host-lifecycle.mjs` (takeover, kill); `map/tavern/llm-flow.mjs` (where pack `llm` text would reach the
  host); `map/tavern/worldbook-sync.mjs` L100–125 (how books are listed and read); `map/core/pack.mjs`; `map/core/pack-v2.mjs`
  `validate2`; `map/core/profile.mjs` `profileOf`; `map/core/event-geo.mjs` `makeGeo`, `taxonomyOf`;
  `map/core/storage.mjs` KEYS; `map/core/protocol.mjs` SCHEMA; `map/app/settings.mjs` L150–170 (switch wiring);
  `map/viewer.html` L675–690 (Advanced page); `tools/build_preview_script.py` `pack_stamp` L44–59, `packed` L62–;
  `tools/check_pack.py`; `tools/browser/host_stub.mjs`; `docs/card-digest.md` L343 (the first pack's card name field).

#### 2. Scope

IN: T1 contract K-R90, K-R91, K-R92, K-R99, K-R103 · T2 `core/pack-index.mjs` + `map/packs/index.json` + check · T3
`tavern/card-source.mjs` + `tavern/pack-gate.mjs` · T4 host side of schema-2 packs (`tavern/pack-runtime-v2.mjs`) · T5
URL / file import (`core/pack-store-db.mjs`, `app/pack-settings.mjs`, message `eden-map:pack-pick`) · T6 K-R103
switch · T7 card switch restart · T8 build tool · T9 tests, docs, RESULT.

OUT: card reading into nodes, growth, the automatic pack, export (S9-3); edit mode and media (S9b); renaming any
existing name (S10); the viewer's v2 drawing (S9-1, assumed landed); writing to the card or any worldbook.

#### 3. Setup

```bash
git fetch
git worktree add -b s9-2-gate <scratchpad>/s9-2 origin/preview
```
Baseline: node tests and `bash tools/smoke.sh` green; run `node tools/browser/e7_host.mjs`, `node
tools/browser/th_adopt.mjs`, `node tools/browser/pack_town.mjs`, `node tools/browser/follow_pin.mjs` on the untouched
tree and keep their ✓ / ✗ lists.

#### 4. Tasks

**T1 — Contract.** Write K-R90, K-R91, K-R92, K-R99 into `docs/kernel-schema.md` §2.3 (replace the "Reserved for S9"
bullets; keep the heading) and K-R103 after K-R65 (§10.2), text from this document §2.3–§2.6 and §9; both editions.

**T2 — Index.**
- `map/packs/index.json`: `{ "schema": 1, "default": "eden", "packs": [ eden, town, minimal ] }` with `title`, `i18n`,
  `schema` from each manifest; `minimal.match` copied from its manifest; `town` without `match` (explicit choice
  only); the first pack's `match`: `card.name` = the distinctive word of its card name field recorded in
  `docs/card-digest.md` L343 (the author handle that the name field contains), and `worldbook` = five entry titles
  that `docs/card-digest.md` quotes as entries of the card's own worldbook (verbatim; list the digest line numbers in
  the RESULT). Pack data only (`map/packs/**`).
- `map/core/pack-index.mjs` (new, pure, ≤ 120 lines): `scorePack(row, ev)` and `bestMatch(index, ev)` per K-R92, where
  `ev = { card: { name, creator, tags }, titles: [string], chatKeys: [string], chatVarOf: id => string }`; words
  normalised with `lexicon.normalise`.
- `tools/check_pack.py`: validate `map/packs/index.json` (every pack listed exists, ids unique, `default` listed,
  schema-2 rows' `match` equal to their manifest's).

**T3 — Gate.**
- `map/tavern/card-source.mjs` (new, ≤ 160 lines): `readCardBasics()` = the bridge logic of `mvu-bridge.cardInfo`
  moved here (same three-level fallback; `MVUBridge.cardInfo` calls it — the credits page output stays identical) plus
  `avatar`, `extensions.spatial_os`; `readCardBooks()` → `[{ name, entries: [{ title, keys, enabled, content? }] }]`
  for the current character's own books only (`getCharWorldbookNames('current')`, `getWorldbook`), content kept only
  for the entry titled `spatial_os:pack`; `cardKey(basics)`.
- `map/tavern/pack-gate.mjs` (new, ≤ 220 lines, top-level `await`): resolves per K-R90 within a 300 ms budget (cached
  per card key for the session) and sets `window.__tcPack`: tier 0 from `edenMapPackPick` (raw `localStorage`, not
  namespaced) or an existing baked `window.__tcPack` (source `baked`, left as is); tier 1 embedded (K-R91, `validate2`
  untrusted, refusals to `window.__packProblems`); tier 2 `bestMatch` over the index fetched from the script base
  (`cdnFetch`); a schema-1 shipped pack gets `{ id, chatVar, manifest, events, schema: 1, source, trust: 'shipped' }`
  built the way `build_preview_script.py pack_stamp` builds it; the legacy-default id → leave `window.__tcPack`
  undefined; tier 3 (until S9-3): `{ id: 'c_' + fnv36(name + '\n' + avatar), schema: 2, manifest: { id, schema: 2, title:
  <card name or the UI's neutral title> }, source: 'auto', trust: 'foreign' }` (the empty automatic pack: root only).
- `map/tavern/eden-map.js`: import `./pack-gate.mjs` on the existing line 11 (no new line: the file is ratcheted at 675).

**T4 — Host side of schema-2 packs.** `packNs` (`host-tavernhelper.mjs`) accepts `__tcPack.schema === 2` (same id
rule; `PACK_IN.manifest` is the v2 manifest). New `map/tavern/pack-runtime-v2.mjs` (≤ 150 lines):
`profileFromV2(pack)` (`profileOf`), `geoFromV2(pack)` (`buildTree` + `makeGeo`), used by `profile-load.mjs` and
`event-geo-load.mjs` when the injected pack is schema 2 (no v1 file fetch). Foreign packs pass `validate2` untrusted
once more on the host (the viewer gets the same object).

**T5 — URL / file import.**
- `map/core/pack-store-db.mjs` (new, ≤ 100 lines): IndexedDB `edenMapPacks`, store `packs`, key = card key, value
  `{ kind, url?, text, savedAt }`; `get`, `put`, `remove`; every call wrapped (no throw).
- `map/app/pack-settings.mjs` (new, ≤ 200 lines): the "Map pack" box in Settings → Advanced: current pack (title,
  source, trust, problems count), choice list (automatic, the index packs, URL field, file picker), "reset to
  automatic". A choice posts `eden-map:pack-pick { kind, url?, text?, id? }`; text via `textContent` only.
- Host (`pack-gate.mjs` exports `pick(msg)`, wired from the entry's message switch without a new line — add the case
  to an existing `case` line or route through `host-api.mjs`): validates (K-R99: https only, 8 MB cap while reading,
  JSON, schema 2, `validate2` untrusted), stores (`edenMapPackPick` + `pack-store-db`), then restarts (T7).
- `map/viewer.html`: one line in the Advanced page (`<div id="packBox"></div>`; replace nothing else). `core/storage.mjs`:
  register `edenMapPackPick`, `edenMapPackLlm`. `core/protocol.mjs`: `eden-map:pack-pick` VIEWER_TO_HOST. i18n zh + en
  for the box (neutral wording).

**T6 — K-R103.** `llm-flow.mjs` (and the worldbook sync's pack entries) use a foreign pack's `llm` block only when
`edenMapPackLlm[packId] === fnv36(canonical JSON of llm)`; the TavernHelper settings page shows, for a foreign pack
with an `llm` block, one switch line "use this pack's text for the model" and, when the hash changed, a passive note.
The switch travels in `eden-map:th` `prefs` (comment in the `SCHEMA` header). Default off.

**T7 — Card switch.** `pack-gate.mjs` listens to the chat-change event; on a new card key it resolves again; when the
pack id or source differs it calls the running instance's cleanup (`window.parent.__edenMapCleanup` of
`host-lifecycle.mjs`) and imports the entry again with `?k=<card key>`. Tested with the stub host: card A (index match
of the example pack via a baked choice) → card B (unknown) → card A; after each switch the injected pack id, the chat
variable written and the viewer's pack title belong to the current card only.

**T8 — Build tool.** `tools/build_preview_script.py`: without `--pack` the script carries no pack (unchanged
behaviour, now meaning "resolve at run time"); `--pack` still works and prints "deprecated: packs are resolved at run
time (docs/zero-config.md §2); kept until S10" on stderr.

**T9 — Tests, docs.** See §6; `docs/ARCHITECTURE.md` (+ zh) rows for the new modules and the gate in the host flow;
`docs/todo.md` §0 S9 sub-line S9-2.

#### 5. Constraints

- **First-pack parity:** with the first pack's card (index match) or its chat variable present, `window.__tcPack` stays
  undefined and the host's injected text, chat variable writes and worldbook writes are byte-identical to the base
  (assert with the existing session fixtures).
- The engine never writes the card or any of the user's worldbooks; it reads only the current character's own books.
- `eden-map.js` must not grow; engine files ≤ 400 lines; no card terms in engine files (`index.json` is pack data).
- No blocking dialog; every refusal is a self-check entry or a passive line.

#### 6. Tests

- `tests/pack_index.test.mjs`: the K-R92 table: chat variable alone = 100 and wins; one card-name word = 10 →
  candidate; one worldbook title = 5 → not; two titles = 10 → candidate; ties by index order; normalised comparison.
- `tests/pack_gate.test.mjs` (stubbed globals): tier order (choice beats embedded beats index beats auto; a baked pack
  is tier 0); a refused embedded pack (bad JSON, schema 1, shipped id, > 1 MB) falls through with one problem; the
  legacy-default result leaves `__tcPack` undefined; the worldbook entry is read only from the character's own books
  and whether enabled or not.
- `tests/pack_import.test.mjs`: http URL refused; > 8 MB refused while streaming; schema 1 refused; a block path
  outside the URL folder dropped; a valid pack stored and re-read from the store when the fetch fails.
- `tests/pack_llm_gate.test.mjs`: foreign `llm` unused while off, used when on with the same hash, unused again after
  the text changes.
- `tests/host_split.test.mjs` / `tests/storage.test.mjs` / `tests/protocol.test.mjs`: new names registered.
- First-pack parity: the existing injected-text fixtures pass unchanged.

#### 7. Verify

```bash
node --test tests/*.test.mjs
bash tools/smoke.sh
node tools/browser/e7_host.mjs; node tools/browser/th_adopt.mjs; node tools/browser/pack_town.mjs; node tools/browser/follow_pin.mjs
```
Expected: as on the base (failures listed in `tools/browser/known-failures.json` count as KNOWN). Check the pack box
once at 375 px by screenshot.

#### 8. Commits & push

1. `feat(core): shipped pack index and match score (K-R92)` (T2 with tests).
2. `feat(host): pack gate, embedded packs, v2 packs on the host (K-R90, K-R91)` (T1, T3, T4, T7).
3. `feat(settings): pack choice by URL or file; go-live switch for a pack's model text (K-R99, K-R103)` (T5, T6, T8).
4. `docs: universal script in the module map; RESULT S9-2` — push.

Commit rules as in S9-1 §8. No map data is edited (`map/packs/index.json` is new pack data, not `maps.json` or a
manifest): no FREEZE_MAPS.

#### 9. Stop rules

Stop when: first-pack parity fails (any injected line, chat variable write or worldbook write differs); the gate's
top-level await breaks the entry's start in a probe; the card-switch test shows state of the previous card after two
fix attempts (report which module keeps it; options: A restart by page reload notice, B per-module reset hooks);
`eden-map.js` would grow; a push is rejected or CI fails twice; the test count drops.

#### 10. Report

RESULT block (brief §5) with extra lines: `index: <rows>; first-pack match words (digest lines <n…>)`, `parity: injected
text identical <fixtures>`, `switch A→B→A: <ok / what leaked>`, `files: <new files with line counts>`.

### S9-3 — runtime card reading, the automatic pack, export

#### 0. Why

Plan §5 S9 "runtime card reading" and "export as pack", §10 steps 2 and 4; this document §3, §4, §6 (Z-04 … Z-09,
Z-16). After this step an unfamiliar card shows a schematic map of its places, locations land, people and items work,
and the result exports to a pack that imports back identically. New probe `autopack`.

#### 1. Read first

- `docs/agent-brief.md`; this document §3, §4, §6, §11.
- `docs/kernel-schema.md` K-R10, K-R15–K-R26, K-R38, K-R41, K-R42, K-R53, K-R63–K-R66, K-R71; §14.2 O-7.
- Code: `map/core/lexicon.mjs` (`normalise`, `fnv36`, `cut`); `map/core/vocab.mjs` (word lists, `EXACT`, `HAS`);
  `map/core/profile.mjs` (`profileOf`, discovery); `map/tavern/stat-path-mapping.mjs` and `mvu-bridge.mjs` L100–130
  (variable discovery, `detect`); `map/core/locate.mjs`; `map/core/nodes.mjs`; `map/core/legacy-custom.mjs`
  (`readCustom`: user aliases); `map/tavern/events-parse.mjs`, `characters-parse.mjs` (place texts in tags);
  `map/tavern/pack-gate.mjs`, `card-source.mjs` (S9-2); `map/core/pack-v2-view.mjs`, `map/app/nodes-runtime-v2.mjs`
  (S9-1); `map/app/host-messages.mjs`; `map/app/pack-settings.mjs` (S9-2); `tools/browser/host_stub.mjs`.

#### 2. Scope

IN: T1 contract K-R93–K-R95, K-R98, K-R26 / O-7 amendments · T2 `core/card-read.mjs` + `core/yaml-shape.mjs` +
`vocab.PLACE` · T3 `core/grow.mjs` · T4 `tavern/auto-pack.mjs` (derive, store, grow, recompute, `eden-map:pack`) · T5
viewer live update · T6 `core/pack-export.mjs` + export / copy buttons · T7 probe `autopack` · T8 docs, RESULT.

OUT: edit mode, media, overlay export of shipped packs (S9b); `tools/card_to_pack.py` (S11, reuses the fixtures);
growth for authored packs (Z-07); any write to the card or its books.

#### 3. Setup

```bash
git fetch
git worktree add -b s9-3-autopack <scratchpad>/s9-3 origin/preview
```
Baseline: node tests and smoke green; note the count.

#### 4. Tasks

**T1 — Contract.** K-R93, K-R94 and K-R95 as rule paragraphs in kernel-schema §3.9 after K-R26; K-R98 as a rule
paragraph at the end of §2.4; amend K-R26 ("runs for the automatic pack on top of its derived nodes, K-R95") and close
O-7 in §14.2 ("closed by K-R95"); replace the matching bullets of the "Planned in S9" list with "Added by S9-3: …";
both editions.

**T2 — Card reading (pure).**
- `map/core/yaml-shape.mjs` (new, ≤ 120 lines): `parseShape(text)` → a JS value for JSON text, else for the YAML subset
  (indented mappings `key: value`, sequences `- item`, scalars as strings / numbers / booleans, `#` comments); returns
  `null` on anything else. Never evaluates anything.
- `map/core/vocab.mjs`: `PLACE = { zh: [...], en: [...] }` kernel place words (generic words only; ≤ 60 per language);
  `placeWord(text, lang)`.
- `map/core/card-read.mjs` (new, ≤ 260 lines): `candidates(src, { lang, people })` (K-R93), `cardLang(src, uiLang)`
  (K-R94), `startNode(tree, vocab, greeting)` (K-R94), `deriveAutoPack(src, { uiLang })` → `{ pack, fp, problems }`
  (K-R95: id, title, lang, nodes, vars via the existing discovery functions over `src.stat` or `parseShape(initvar)`,
  entities via K-R41 / K-R42 discovery, `ui.start`), `fingerprint(src)`.
- Fixtures `tests/fixtures/cardread/`: `zh_city.json` and `en_harbour.json` (made-up cards, no real card text: a few
  place entries, two person entries, a rules entry, an initvar entry, a greeting), each with an `expected` block
  (nodes, parents, start, lang, vars paths).

**T3 — Growth (pure).** `map/core/grow.mjs` (new, ≤ 160 lines): `grow(tree, vocab, texts, { lang, max = 200, depth = 6 })`
→ `{ nodes, consumed }` per K-R26 steps 2–4 (segments, article strip, walk, `g_<fnv36(parent id + segment)>`), pure and
deterministic; `recomputeGrowth(messagesPlaces, derivedNodes, opts)`.

**T4 — Host: the automatic pack.** `map/tavern/auto-pack.mjs` (new, ≤ 220 lines):
- `pack-gate.mjs` tier 3 calls `deriveAutoPack(readCard())`, reusing `auto` from the chat variable when `fp` matches
  (Z-05).
- After each round the host passes the round's place texts (location value, place tags, character and event tag
  places) to `grow`; new nodes go to `<chat var>.auto.grown` and `seen`; then `post({ type: 'eden-map:pack', manifest,
  rev, source: 'auto', trust: 'foreign' })`. Writes go through the existing root store save (never `stat_data`).
- `recompute` on chat load when `auto.grown` is absent; drift (live vs recompute) is a self-check count.
- `core/protocol.mjs`: `eden-map:pack` HOST_TO_VIEWER `{ manifest: 'object', rev: 'number', source: 'string?', trust:
  'string?' }`.

**T5 — Viewer live update.** `host-messages.mjs`: on `eden-map:pack` with `rev` above the current one, re-validate
(untrusted), `projectV2`, `seedJSON`, `buildRuntimeV2`, and reopen the current map when its layout changed (same
zoom); markers, the current place and events are re-placed by the existing refresh paths.

**T6 — Export.** `map/core/pack-export.mjs` (new, pure, ≤ 200 lines): `exportPack(pack, { grown, userAliases, card })`
per K-R98 (grown nodes as nodes, user aliases merged into `alias`, `credits.card`, implicit views and shipped-only
fields removed; canonical key order; `validate2` untrusted must return the pack with no problem; size ≤ 8 MB) →
`{ text, bytes, fitsCard, problems }`. `pack-settings.mjs`: buttons "Export as pack" (download `<id>.pack.json`
through a blob link) and "Copy as worldbook entry" (clipboard; the passive note says: new entry titled
`spatial_os:pack`, keep it disabled).

**T7 — Probe `tools/browser/autopack.mjs`** (stub host, `host_stub.mjs` extended with `charData.data.extensions`,
character books and entries): an unfamiliar card from `tests/fixtures/cardread/en_harbour.json` with MVU location
"the inn" and a chat with a place tag "Lantern Docks · Harbour Office" →
(a) the viewer opens a schematic (no retry card), root named after the card;
(b) the current place lands on the inn node (`.mk.here` or the place field);
(c) the grown node "Harbour Office" appears under "Lantern Docks" after the message (rev 2);
(d) a person from the roster table is in the characters tab; a picked-up item ("picks up the 'Brass Key'") is in the
Items tab;
(e) export → reset choice → import the exported file → the same node ids, the same located node, the same marker
positions (compare the projected point files);
(f) the same flow for `zh_city.json`; desktop and 375 px screenshots.

**T8 — Docs.** ARCHITECTURE rows (en + zh), naming glossary rows "automatic pack" and "card source"; todo §0 S9-3.

#### 5. Constraints

- No first-pack change: with the first pack resolved, `auto-pack.mjs` is never called (assert in a test).
- Card reading reads titles, keys, the greeting, the variable shape and the initvar entry only; it never reads other
  entry contents and never filters by meaning (brief rule 8).
- Growth never runs for authored packs; the chat variable holds only the `auto` cache added here.
- Engine files ≤ 400 lines; no card terms in engine files or fixtures (fixtures are made up).

#### 6. Tests

- `tests/card_read.test.mjs`: both fixtures give their `expected` blocks; a person entry and a rules entry are not
  nodes; nested titles nest; keys shaped like a pattern are not aliases; 151 place entries → 150 nodes and one problem;
  lang detection table (zh, en, ja, ko, short sample → UI language); greeting place → `ui.start`, never `here`.
- `tests/yaml_shape.test.mjs`: mappings, sequences, scalars, comments; anything with anchors, tags or flow syntax →
  `null`.
- `tests/grow.test.mjs`: K-R26 examples (`A · B`, `Cellar, Guild Hall, Saltmere` inner → outer for `en`, outer → inner
  for `zh`, journeys keep the origin, article strip, "Half-Moon Inn" stays whole); same texts → same ids; caps (200
  nodes, depth 6, 40 code points); live = recompute over a 12-message stream.
- `tests/auto_pack.test.mjs`: `fp` stable → reused; changed title → re-derived with the old ids kept; growth adds to
  `auto.grown`; `eden-map:pack` rev increases only on change.
- `tests/pack_export.test.mjs`: export → `validate2` clean; export → import → export byte-identical; user aliases in;
  stash / fog / ignore list / implicit views out; > 1 MB marked not fitting a card; > 8 MB refused.

#### 7. Verify

```bash
node --test tests/*.test.mjs
bash tools/smoke.sh
node tools/browser/autopack.mjs <scratchpad>/s9-3-autopack      # all checks PASS
node tools/browser/pack_minimal.mjs <scratchpad>/s9-3-minimal   # still PASS
```

#### 8. Commits & push

1. `feat(core): card reading, shape parser and growth (K-R93, K-R94, K-R26)` (T1 part, T2, T3 with tests).
2. `feat(host): the automatic pack with growth and live updates (K-R95)` (T4, T5).
3. `feat(settings): export as pack (K-R98); probe autopack; RESULT S9-3` (T6–T8, RESULT) — push.

Commit rules as in S9-1 §8; no map data edited: no FREEZE_MAPS.

#### 9. Stop rules

Stop when: a first-pack test or probe changes; live growth and recompute differ after two fix attempts (report the
first differing message); the export round trip is not byte-identical after two attempts; the probe needs a viewer
change outside T5 (report it); a push is rejected or CI fails twice; the test count drops.

#### 10. Report

RESULT block with extra lines: `autopack: <checks>/<total> (en, zh)`, `card read: fixtures <n>/<n>; nodes <n>, grown
<n>`, `export: round trip identical yes/no; sizes <bytes>`, `files: <new files with line counts>`.

### S9b — edit mode, pack pictures, any image as a base map (E-08)

#### 0. Why

Plan §5 S9b, §10 steps 3 and 5; todo E-08; this document §6.2, §7, §8 (Z-12 … Z-15, Z-18). After this step an author
refines a pack in the viewer — positions, parents, aliases, pictures, a picture as base map — and exports it without a
terminal; the old maintainer-mode gallery workflow is gone. New probe `pack_editor`.

#### 1. Read first

- `docs/agent-brief.md` (§2.6 new toggles); this document §6, §7, §8, §11, §13.
- `docs/kernel-schema.md` K-R30–K-R32, K-R43, K-R64, K-R66, K-R67, K-09.
- Code: `map/core/pack-v2-spec.mjs` L64–106 (nodes, views), L186–201 (manifest, BLOCKS); `map/core/pack-v2.mjs` LIMITS
  L15, `limit` L30–37, `validate2`; `map/core/overlay-v2.mjs` `applyOverlay`; `map/data/schema/v2/*.schema.json`;
  `map/ui/room-gallery-panel.js` (all, 331 lines: maintainer mode L19–20, L184–201, L237–238, export L302–320, REPO L11);
  `map/core/room-gallery-logic.mjs` (all, 104 lines); `map/core/room-gallery-db.mjs`; `map/ui/gallery.js`;
  `map/app/card-links.mjs` L56–70; `map/estate/main.js` L101, L777; `map/app/settings.mjs` L17, L164;
  `map/viewer.html` L686–690; `map/i18n/{zh,en}.json` `s.gallery_*`; `map/packs/eden/manifest.json` `data.gallery`,
  `data.galleries`; `map/estate/model/manifest.json` L15; `tests/room_gallery.test.mjs`;
  `tools/browser/room_gallery_ui.mjs`; `map/core/pack-export.mjs` (S9-3); `map/core/pack-v2-view.mjs` (S9-1).

#### 2. Scope

IN: T0 freeze · T1 contract K-R100–K-R102, K-R66 amendment, K-R98 overlay export · T2 media block in the schema and
validation (`core/pack-media.mjs`) · T3 edit mode and draft (`app/pack-edit.mjs`, `app/pack-edit-view.mjs`) · T4 any
image as base map · T5 galleries on the generic flow, maintainer mode removed · T6 first-pack migration · T7 probes ·
T8 docs, unfreeze, RESULT.

OUT: the 3D estate page's own room UI beyond reading pack pictures; layers (S8); renaming storage or the gallery
database (S10); any upload to a server.

#### 3. Setup

```bash
git fetch
git worktree add -b s9b-edit <scratchpad>/s9b origin/preview
```
Baseline: node tests and smoke green; run `node tools/browser/room_gallery_ui.mjs <scratchpad>/s9b-before` and
`node tools/browser/s43_parity.mjs --out <scratchpad>/s9b-before-shots` on the untouched tree.

#### 4. Tasks

**T0 — Freeze** (T6 edits a pack manifest and deletes map data). If `docs/plans/FREEZE_MAPS` exists on origin/preview,
stop per §9. Before T6 create it (`S9b gallery migration; started <UTC>`), commit `chore: freeze maps.json for S9b`, push
at once; delete it in the commit after T6 (also when stopping early, unless T6 never landed).

**T1 — Contract.** K-R100 (§4 after K-R97), K-R101 and K-R102 (new paragraphs in §2.4 after K-R66), amend K-R66 (limits
by source: 1 MB card-embedded, 8 MB URL / file; data URLs in `media.*.src` exempt from the string cap, counted in the
document size; ≤ 200 media items), K-R67 (an overlay may carry `media` and node `media`), K-R98 (overlay export of a
shipped pack); both editions.

**T2 — Media in the schema.**
- `map/core/pack-media.mjs` (new, pure, ≤ 160 lines): `SRC` patterns (path, data URL, https), `checkMedia(item, { trust,
  base, remoteOn })` → the item or `null` with a problem code (`media-src`, `media-size`, `media-remote-off`);
  `decodedBytes(dataUrl)`; `mediaUrl(item, base)` (the URL to show, or `null`).
- `pack-v2-spec.mjs`: `media` block (`dict(ID, obj({ src, w, h, note, i18n, credit }))`), node `media` (`arr(idRef-like
  media id, { max: 32 })`), `image` view `media` (alternative to `src`; `req` becomes "src or media"); add `media` to
  `BLOCKS`. `pack-v2.mjs`: the string cap skips `media.*.src`; the size limit by `opts.limitBytes` (default 1 MB;
  the loaders pass 8 MB for URL / file packs); unknown media ids on nodes / views dropped with a problem.
- `map/data/schema/v2/media.schema.json` (new) and the `nodes`, `views`, `manifest` schemas; `tools/check_pack.py`
  checks media paths exist under the pack folder for shipped packs.

**T3 — Edit mode.**
- Switch: `viewer.html` Advanced page — the three maintainer lines (L687–689) become the edit-mode group (`<b>` title,
  switch `#optEdit`, hint); `settings.mjs` `sw('#optEdit', 'edenMapEdit', false, v => …)`; `storage.mjs` registers
  `edenMapEdit` (def `'0'`), `edenMap:edit:` (prefix), `edenMapPackRemote` (def `'0'`), and a second switch line
  `#optPackRemote` ("load pictures from links in packs") in the same group, on the hint line (no net new line).
- `map/app/pack-edit.mjs` (new, ≤ 260 lines): draft load / save (`edenMap:edit:<pack id>`; pictures in the gallery
  IndexedDB with scope `edit:<pack id>`), `applyDraft(pack, draft)` (K-R67 merge order), operations `move(id, at)`,
  `reparent(id, parent)` (refuses the node or a descendant), `addAlias(id, word)`, `addPlace(parent, name, at)`,
  `setStart(id)`, `attach(id, mediaId)`, `discard()`; after each change the viewer re-projects (the S9-3 live-update
  path with a local `rev`).
- `map/app/pack-edit-view.mjs` (new, ≤ 260 lines): edit bar (shown only while the switch is on), marker drag on
  `tiles` / `image` views (OSD drag → `at` in 0..1 of the image), place-card controls (parent list, alias field, add
  picture, use picture as map, open here), "Export" (S9-3 exporter; shipped pack → overlay export `<id>.overlay.json`).
  All text through `textContent` / `esc()`; tokens only; 44 px targets at 375 px.

**T4 — Any image as a base map.** "Use a picture as this place's map": file input → canvas re-encode to WebP 0.82,
long side ≤ 4096 px → pack picture in the draft → the node gets `views[<id>] = { kind: 'image', media: <id> }`; the
children's current schematic positions become their `at` with `view: <id>`. The projection (S9-1) opens it as
`{ type: 'image', url }`.

**T5 — Galleries on the generic flow.**
- `room-gallery-panel.js`: the panel takes a node id; lists pack pictures (`mediaUrl`, read only) then private pictures
  (records with room id `n:<node id>` or the node's name, Z-18); upload stays private; in edit mode each private picture
  has "add to pack" (copies it into the draft). Remove maintainer mode, `isMaintainerMode`, `setMaintainerMode`, the
  submit visibility segment, the export-submission button and notes, `REPO`, the issue link, and their texts.
- `room-gallery-logic.mjs`: remove `buildIssueUrl`, `buildExportManifest`, `MAINTAINER_MODE_KEY`,
  `readMaintainerMode`; `makeImageMeta` visibility `'private' | 'pack'` (a stored `'public'` reads as `'private'`);
  keep `isValidGalleryFile`, `safeGalleryImagePath` (now used for rule 1 of K-R101 with the pack media folder).
- `settings.mjs` L17 / L164 removed; i18n keys `s.gallery_group`, `s.gallery_maintainer`, `s.gallery_maintainer_hint`
  removed from zh and en; `card-links.mjs` gallery entry and `estate/main.js` read a node's pack pictures through
  `pack-media.mjs` instead of `data.galleries`.

**T6 — First-pack migration** (inside the freeze). `map/packs/eden/manifest.json`: remove `data.gallery` and
`data.galleries`; `map/packs/eden/overlay.v2.json`: add `"media": {}`; delete `map/data/gallery.json` and
`map/data/room_galleries.json`; `map/estate/model/manifest.json`: remove `galleries`; `map/data/schema/pack.schema.json`
and `maps.schema.json`: drop the `galleries` / `gallery` entries (no map uses `gallery`: check with grep and state it).
Nothing visible changes (both files were empty).

**T7 — Probes.** New `tools/browser/pack_editor.mjs`, from tier 0 to a pack with a base map, no code, no terminal: stub
host with an unfamiliar card (S9-3 fixture) → schematic → Settings → Advanced → edit mode on → on the root "use a
picture as this place's map" with a generated PNG → drag one marker → change one node's parent → add one alias → attach
one picture to a node → export → reset → import → the base map, the moved position (±0.005), the parent, the alias and
the picture are there; a private picture added before is not in the exported text; a pack with a picture whose `src`
is `javascript:` or `http://` shows no picture and one self-check entry; with the link switch off an https picture is a
placeholder. Desktop and 375 px. Update `tools/browser/room_gallery_ui.mjs`: maintainer steps removed, private upload /
scopes / reload kept, "add to pack" visible only in edit mode.

**T8 — Docs.** ARCHITECTURE (en + zh) rows; naming glossary "pack picture", "private picture", "edit draft"; todo:
E-08 struck through with date and sha, §0 S9b line; delete `docs/plans/FREEZE_MAPS` (if T6 landed).

#### 5. Constraints

- First pack: no visible change outside the Settings Advanced page (the maintainer lines become the edit-mode lines);
  s43 screenshots identical except that page; injected text untouched.
- A private picture is never part of an export, an overlay export, a message to the host or a URL.
- `viewer.html` must not grow; engine files ≤ 400 lines (`room-gallery-panel.js` must shrink); tokens only.
- New switches default off and are registered (storage key, zh + en strings); viewer-only switches need no protocol
  field.

#### 6. Tests

- `tests/pack_media.test.mjs`: allowed: path under base (shipped / URL), data URL ≤ 3 MB, https with the switch on;
  refused: `..`, scheme other than https / data, `data:text/html`, `data:image/svg+xml`, a query string, > 3 MB, https
  with the switch off (placeholder, not shown); card-embedded 1 MB and file 8 MB limits; the string cap does not cut a
  data URL.
- `tests/pack_edit.test.mjs`: each operation on the minimal pack; reparent refuses a descendant; draft applied = overlay
  merge; discard empties; export of the draft → re-import → identical tree, positions, aliases, media.
- `tests/room_gallery.test.mjs`: maintainer and issue-link cases removed (name each removed case in the RESULT);
  visibility `'public'` reads as `'private'`; a private record is never in `exportPack` output (call the S9-3 exporter
  with a draft and private records present).
- `tests/overlay_media.test.mjs`: an overlay `media` block merges by id; the first pack's overlay with `"media": {}`
  changes nothing.

#### 7. Verify

```bash
node --test tests/*.test.mjs
bash tools/smoke.sh
node tools/browser/pack_editor.mjs <scratchpad>/s9b-editor        # all checks PASS
node tools/browser/room_gallery_ui.mjs <scratchpad>/s9b-gallery   # all checks PASS
node tools/browser/s43_parity.mjs --out <scratchpad>/s9b-after-shots
node tools/browser/s43_parity.mjs --diff <scratchpad>/s9b-before-shots <scratchpad>/s9b-after-shots
```

#### 8. Commits & push

1. `feat(core): pack pictures in the v2 schema, limits by source (K-R101, K-R66)` (T1 part, T2 with tests).
2. `feat(viewer): edit mode, draft and any image as a base map (K-R100)` (T3, T4).
3. `chore: freeze maps.json for S9b` (T0, pushed at once).
4. `refactor(gallery): pack and private pictures on the generic flow; maintainer mode removed; first-pack galleries
   migrated (K-R102, E-08)` (T5, T6).
5. `test(browser): pack_editor probe; docs; unfreeze; RESULT S9b` (T7, T8, RESULT, FREEZE_MAPS deleted) — push.

Commit rules as in S9-1 §8.

#### 9. Stop rules

Stop (and delete FREEZE_MAPS if you created it) when: FREEZE_MAPS already exists on origin/preview at T0; a first-pack
screenshot differs outside the Advanced page; OSD cannot open a data-URL image source in the probe browser (report the
error; option A object URL from a Blob, B a canvas-backed tile source); a private picture appears in any export in a
test; a file would pass 400 lines or `viewer.html` would grow; a push is rejected or CI fails twice; the test count
drops beyond the named removed gallery cases.

#### 10. Report

RESULT block with extra lines: `pack_editor: <checks>/<total>`, `gallery: removed <keys / functions>, kept <guards>`,
`migration: files deleted <list>, manifests changed <list>, visible change none/<what>`, `files: <new files with line
counts>; room-gallery-panel.js <before> -> <after>`.
