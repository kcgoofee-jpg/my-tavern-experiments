# Entity protocol, drawer tabs, unified stash and the Items tab (S6 design)

> Canonical English edition; Chinese edition: `docs/entity-protocol.zh.md` (same heading structure). Output of plan step
> **S6-design** (plan `docs/plans/spatial-os.md` §5 Stage C, decision D4; todo I-04, I-08). Status: **design, working
> decisions applied by default** (the user was not available on 2026-10-01: every recommendation of the review sheet below
> is the working decision; the user may override any of them). No code changes with this document. The rules it adds to the
> kernel contract are reserved as **K-R71 … K-R78** (`docs/kernel-schema.md` §13, "Planned in S6"); their full text lands
> with the step specs `docs/plans/steps/S6-1.md`, `S6-2.md`, `S6-3.md`. Every statement about today's code was checked at
> origin/preview `11a98c35`.

## 0. Review sheet (P-01 … P-14)

One row per real decision. "Working decision" = the recommendation, applied by default on 2026-10-01 (autopilot). The
same list is in `docs/todo.md` §3, one line per item.

| id | Question | Options | Consequences | Recommendation (working decision) |
|---|---|---|---|---|
| P-01 | How does the characters tab tell a macro level from a micro level? | A: macro when the open map has at least one child map in the runtime tree (any kind), else micro; a view may force it with `x-people: "macro" \| "micro"` (v1: `maps.json` `people`). B: by node depth (depth ≤ 1 macro). C: always group by the tree. | A: first pack — the world map, every tier and every site with 3D pages are macro; the example pack's two maps are micro; no first-pack ids anywhere. B: depth means different things in different packs. C: no "people here" view at all. | **A** |
| P-02 | At a micro level, what happens to people who are not at the player's node? | A: they stay listed in collapsed sections ("elsewhere on this map", "on other maps", "place unknown"); only the "with you" section is open. B: hidden. | A loses nothing and keeps every probe's row count; B hides people the user may look for. | **A** |
| P-03 | Tab order and where the Items tab goes. | A: default `events, characters, items, places`, legend always last; `ui.tabs` (K-R57) reorders or drops tabs, except `places`, which always stays (it holds the place card). B: items after places. | A keeps the three tabs people use in their current order and puts items next to characters; a pack that wants another order says so. | **A** |
| P-04 | What does a stash row mean: carried or stored somewhere? | A: a `carried` flag: pickups (text and map) are carried, rows added through the extension API or migrated with an unknown origin are stored at their place; the place card "stored" line and the injected digest line stay as they are (by place). B: a pickup clears the place (the item moves with the player). | A changes no visible text; only the new Items tab reads `carried`. B changes the injected digest line and the place cards. | **A** |
| P-05 | The W12 virtual slot (`槽位`) inside the unified store. | A: kept as `stash.slot` with its own fact record (ASCII keys), so the injected slot line is byte-identical. B: the slot keeps only its declaration and counts stash rows. | A: parity by construction, a little duplicated data (≤ 200 facts). B: the count changes when a row was removed through the extension API. | **A** |
| P-06 | Where the migration finds the v1 key names `仓库` / `槽位`. | A: a constant in `tavern/stash-store.mjs` (`V1_KEYS`), read only, removed at S10 with the migration. B: a new `legacy.stash_keys` field (K-R09) that compat-v1 fills for every v1 pack. | A: the engine wrote these two keys for every pack, they are never written again, and the Chinese literal leaves `map/core` (it sits in `core/ledger.mjs` today). B: every pack schema carries a dead list; Decision (a) is about names a pack keeps writing. | **A** |
| P-07 | When does the migration run? | A: once, when the chat variable has no `stash` and has at least one v1 key; the store records `from`; the v1 keys are never written or deleted (they are carried over verbatim by every save until S10). B: on every load, union by id (needs tombstones for removals). | A is simple and lossless (the old values stay in the chat). A downgrade to an older script and back loses the rows the old script added in between (preview-only scenario). | **A** |
| P-08 | Wire format of `eden-map:inv` (host and viewer can run different versions). | A: `items` keeps the legacy row shape; new optional fields `stash` (new rows, slot summary) and `card` (in-card inventory). B: `items` switches to the new rows. | A: an old viewer with a new host and a new viewer with an old host both keep working; the payload is about twice as large (tens of rows). B breaks the place card in mixed versions. | **A** |
| P-09 | Reconciliation and backfill. | A: the host scans each message once, from the store's `since` on; a message whose text changed (swipe, edit) is replayed (its text rows are rebuilt from the new text); no backfill of history before `since`; drift found by the recompute is reported in the self-check, never repaired silently. B: A plus a default-off "rescan the whole chat" switch. C: no replay (rows of a replaced reply stay, as today). | A makes the store recomputable item for item (brief rule 4) and adds rows only for messages the host skipped; rows that came from a reply the user swiped away disappear (they were never in the current chat). C keeps those phantom rows. | **A** |
| P-10 | What the Items tab lists outside "carried". | A: "here" = own rows stored at the player's node plus world-stash rows lying there (hidden ones only when the player is on that spot, as the map markers do); "other places" = own stored rows elsewhere, grouped by place; "in card" = the card's own inventory, read only. B: A plus every visible world-stash row of other places. | A matches what the map already shows and spoils nothing; B lists up to 200 rows nobody asked for. | **A** |
| P-11 | Final name of `tavern/loot-flow.mjs` (naming.md left it to S6). | A: `tavern/stash-flow.mjs` (glossary: Stash), renamed in S6-2, which rewrites the file anyway. B: keep `loot-flow`. | A: one concept, one name; touches the entry's import line, `tests/host_split.test.mjs` and two docs. | **A** |
| P-12 | Which verbs the new "never counts" forms (negation, question, dialogue, intention, condition) apply to. | A: every pickup verb. B: only the new verbs. | A removes today's false positives such as a negated or questioned pickup; every positive sentence of the existing tests still counts (pinned). B keeps them. | **A** |
| P-13 | How strict the new verbs `获得` / `得到` / `拿取` (and English obtain / get / take / receive / acquire) are. | A: a strict class: the object must carry a measure word, be quoted, or be a known item name; a bare noun never counts. Pack `verbs` join the normal class; a new pack field `verbs_strict` joins the strict class. B: the normal class (bare nouns of 2–8 characters count). | A: "gained courage", "got the news", "took a breath" can never become items; a bare "got a key" counts only when the key is known. B lets every abstract object through. | **A** |
| P-14 | I-04: what a write path means for the npc and events settlement domains. | A: a map-owned key `<chat var>.ledger = { npc, events }`; only holes are written (a person known to a roster with an empty place; an event the map settled), through the settlement gate, behind a default-off switch. B: inside `stash`. C: no persistent write path; close I-04 as "by design". | A: the domains settle instead of staying pending, nothing touches `stat_data`, off = today's behaviour. B mixes items with people. C leaves the plan item open forever. | **A** |

## 1. Scope

S6 turns the drawer into a registry of tabs that read one entity model, unifies the item store and adds an Items tab.
Three implementation prompts (Sonnet · High), one unit each:

- **S6-1** — entity protocol core (`map/core/entities.mjs`), tab rules (`map/core/drawer-tabs.mjs`), tab registry
  (`map/app/tabs.mjs`), the existing four tabs moved onto it with identical behaviour, characters by level.
- **S6-2** — the unified stash store, migration from the v1 keys, recompute and reconciliation, the host flow renamed to
  `stash-flow`, the in-card inventory reader and the new `eden-map:inv` fields.
- **S6-3** — the Items tab, the pickup sentence patterns (new verbs, never-forms, per-pack extension, I-08), the npc / events
  settlement write paths (I-04) and the new probe `drawer_stash`.

Out of S6: declarative layers and drawing settled events (S8); editing, export, schema-2 loading in the viewer (S9, S9b);
renaming chat-variable keys, storage keys, protocol names, `EdenMap` (S10); the 3D estate page's own drawer.

## 2. Entity protocol (K-R71)

### 2.1 One shape

People, items and events are **entities on nodes**. An entity is derived from the rows the host already sends; it is never
stored as such.

```
Entity = {
  kind:     'person' | 'item' | 'event',
  id:       string,          // person: normalised name (K-R40); item: store or world row id; event: event id
  name:     string,          // display text, verbatim
  node:     string | null,   // node id (K-R28); null = place unknown
  place:    string,          // the place text as written ('' = none)
  source:   string,          // the channel the row came from (2.2); no provenance wording (agent brief §7)
  msgIndex: number | null,   // chat message position of the fact, null when it is not tied to one
  present?: boolean,         // person only: with the player (K-R40)
  data:     object,          // the original row, untouched: kind-specific fields the tabs draw
}
```

Rules:
1. **Pure adapters.** `map/core/entities.mjs` builds entities from rows; it imports nothing outside `map/core` and takes a
   `nodeOf(text) -> id | null` function from the caller (viewer: `hereRes(text)?.node`; host: its event geography).
2. **Node by reference.** A row may carry `node`; the receiver uses it when its own tree has that id, else it locates
   `place` (K-R24: aliases first, hints second, unknown last). v1 fields `map` / `marker` stay accepted (K-R28).
3. **One entity per id and kind.** Duplicates keep the first row in the sender's order.
4. **The chat log is the truth.** Every entity is recomputable from the chat floors and the pack (brief rule 4); the item
   store is the only persisted part and is itself recomputable (§5.6).
5. **No content filtering.** Names and places are carried as written; an unknown type is "other" (brief rule 8).

### 2.2 Sources

| kind | row (message) | `source` values | `node` |
|---|---|---|---|
| person | `eden-map:chars` `items[]` (`{ name, place, floor, src, present?, prelude?, stale? }`), roster group rows | `mvu`, `chat` (v1 `tag`), `table-db`, `fallback`, `imagegen`, `routine`, `infer` (in the present table without a place) | located from `place` |
| item | `eden-map:inv` `stash.rows[]` (§5.7), `eden-map:stash` `items[]` (world rows), `eden-map:inv` `card.rows[]` | `text`, `map`, `api`, `legacy` (store rows); `world` (world stash); `mvu` (in-card) | store rows carry `node` when the host knew it; world rows: located from `place` / `marker`; in-card rows: `null` |
| event | `eden-map:events` `items[]` | `chat`, `op` (planner overlay), `feed` | located from `place` (events already carry their geography) |

`msgIndex` is the message position (`floor` in v1 rows; naming Decision (d)).

### 2.3 Message changes

Message names stay until S10. Additions (each registered in `map/core/protocol.mjs` `SCHEMA` and pinned in
`tests/protocol.test.mjs`):

| message | change | step |
|---|---|---|
| `eden-map:inv` (host → viewer) | new optional top-level fields `stash: 'object?'` and `card: 'object?'`; `items` unchanged (P-08) | S6-2 |
| `eden-map:th` (viewer → host) | register the existing `prefs: 'object?'` field (the settings switches travel in it, including the new one of §8) | S6-3 |
| `eden-map:chars`, `eden-map:events`, `eden-map:stash` | rows may carry `node` (array contents are not shape-checked; the `SCHEMA` comment says so) | S6-1 (documented only) |

No new viewer → host intent. The Items tab writes nothing: picking up a world row reuses `eden-map:loot` (the same intent
the glowing map marker sends), fly-to is local to the viewer.

### 2.4 How each tab consumes entities

| tab | entities | view |
|---|---|---|
| events | event entities | unchanged list and legend (`events-view.mjs`) |
| characters | person entities + roster groups | §4 sections inside the present group; roster groups unchanged |
| items | item entities of all four sources | §6 groups |
| places | the place card (not entity-based) | unchanged |
| legend | the pack's `ui.legend` | unchanged |

`PresentEntities` (glossary) = `presentAt(entities, here)`: the entities whose node is the player's node or whose
`present` flag is set.

## 3. Drawer tab registry (K-R72)

### 3.1 Kernel tab set and order

The tab set is fixed by the kernel (K-R02, UI row). Drawer ids stay the two-letter ids the probes use.

| K-R57 name | drawer id | owner module | icon | counts for the drawer (`keepsDrawer`) | fallback order |
|---|---|---|---|---|---|
| `events` | `ev` | `events-view.mjs` | `bell` | yes | 1 |
| `characters` | `ch` | `characters-view.mjs` | `users` | yes | 2 |
| `items` | `it` | `stash-view.mjs` (S6-3) | `parts` (an existing `UIIcon` name; no new icon in S6) | yes | 3 |
| `places` | `pl` | `app/drawer-glue.mjs` | `pin` | no | — |
| `legend` | `lg` | `app/drawer-glue.mjs` | `info` | no | — |

Order: `ui.tabs` (K-R57: names, subset and order; schema-1 packs may set it in the overlay's `ui` block, which
`applyOverlayUi` already carries as "any other key"). Unknown names are ignored. `places` is always present: when
`ui.tabs` omits it, it goes last before the legend. The legend is not in K-R57's list: always last, shown by its own rule.
Default (no `ui.tabs`): `events, characters, items, places, legend` (P-03).

### 3.2 Contract of `map/app/tabs.mjs`

```
provideTab(id, def)       // an owner module provides the content of a kernel tab; one provider per id (a second call replaces)
  def = {
    hasData():  boolean,                    // the tab has something to show now
    applies?(ctx): boolean,                 // may the tab exist in this view; default true (the drawer itself hides in a scene)
    label?():   { html, short } | null,     // tab button content (html is built with esc(); short = { n, fresh } badge)
    mount?(panel):  void,                   // lazy: called once, the first time the tab is opened
    render?(panel): void,                   // called when the tab is open and the drawer is not collapsed, after refreshTabs
  }
refreshTabs(reason)       // recompute visibility, labels, drawer hide and the fallback tab; render the open tab
tabContext()              // { map, owner, kind, scene, narrow, mode }   mode = 'macro' | 'micro' | null (§4.1)
tabSeen()                 // the per-chat "seen" sets { ev:Set, ch:Set|null } (moved verbatim from events-view.mjs)
saveTabSeen()
describeTabs()            // [{ id, name, provided, applies, hasData, visible, mounted, selected }] for probes (ViewerDebug.tabs)
```

The pure rules live in `map/core/drawer-tabs.mjs` (no DOM, node-testable): `KERNEL_TABS`, `tabOrder(uiTabs)` and
`decide(state)` (§3.3). `map/app/tabs.mjs` only reads the DOM and the drawer (`window.ViewerDrawer`) and calls them.
`ViewerDebug` gains one read-only getter `tabs` (no new `window` global).

### 3.3 Visibility rules (today's, kept exactly)

Today the rules are spread over `drawer-glue.mjs` (`sheetVis`, `cardSheet`), `events-view.mjs` (`renderBar`) and
`unmapped-place-picker.mjs`. `decide()` reproduces them:

- `ev` visible ⇔ the event list is not empty and the events layer is shown.
- `ch` visible ⇔ `CharactersView.count() > 0`.
- `it` visible ⇔ the Items tab has rows (S6-3).
- `pl` visible ⇔ any `keepsDrawer` tab is visible, or the place card is open, or there is an unmapped place name.
- `lg` visible ⇔ not a scene, the map has depth data and the pack has legend items.
- The drawer is hidden ⇔ a 3D scene is open, or (no `keepsDrawer` tab visible, no card, no layer chip on a narrow screen,
  no unmapped name).
- When the selected tab is hidden (or none is selected): the first visible tab in fallback order (`ev`, `ch`, `it`); if none,
  the sheet's own rule (first visible tab).
- Closing the place card while `pl` is selected: switch to the first visible fallback tab and collapse to peek.

A frozen copy of today's logic (`tests/helpers/drawer_tabs_v1_frozen.mjs`) is compared with `decide()` over every
combination of the inputs (S6-1).

### 3.4 Moving the existing tabs

| today | after S6-1 |
|---|---|
| `initShell` creates the sheet with a fixed list `ev, ch, pl, lg` | `initShell` creates it from `tabOrder(RT?.ui?.tabs)` (same list for the first pack) |
| `sheetVis()` (drawer-glue) | a thin wrapper that calls `refreshTabs('sheet')` (callers unchanged) |
| `renderBar()` decides `ev` / `ch` visibility, labels, fallback and renders the people pane | `renderBar()` keeps the events panel content and the events label; visibility, fallback and the people pane go through the registry |
| the "seen" store in `events-view.mjs` | `tabSeen()` / `saveTabSeen()` in `app/tabs.mjs`, same storage key and JSON shape |
| the `ch` label and its fresh count in `renderBar()` | `characters-view.mjs` provides `label()` with the same text and badge |

## 4. Characters by level (K-R73)

### 4.1 Level of the open view

With the runtime tree (`app/nodes-runtime.mjs` `RT`): `owner = RT.host(currentMapId)`; `mode = 'macro'` when
`RT.children(currentMapId).length > 0`, else `'micro'`; a view field `x-people` (`"macro"` | `"micro"`) wins (v1:
`maps.json` `people`, carried by compat-v1 like `clouds` → `x-clouds`). No runtime or no owner → `mode = null` and the
pane is drawn exactly as today. The function is pure (`levelMode({ children, viewField }, mapId)` in `core/entities.mjs`).

### 4.2 Sections

Only the present group changes; every other roster group is drawn as today. Inside the present group the map's people
(and the present group's roster rows that are not on the map, today's `extra`) are split into sections; each person is
listed once, in the first section that takes them:

| order | key | macro | micro | label |
|---|---|---|---|---|
| 1 | `here` | `present` or node = player's node | same | `ch.with_you` (existing) |
| 2 | `n:<child id>` | one per child node of `owner` (declaration order) with at least one person in its subtree | — | the child node's name (`i18n.<lang>.name`, else `translateName`) |
| 3 | `map` | node = `owner` | node inside `owner`'s subtree | `ch.sec_map` (new) |
| 4 | `else` | node outside `owner`'s subtree | same | `ch.sec_else` (new) |
| 5 | `unknown` | node `null` | same | `ch.sec_unknown` (new) |

- Empty sections are not drawn. When only one section is not empty, the rows are drawn flat as today (no heading).
- Micro (P-02): only `here` is open by default; the others are collapsed `<details>` (open state remembered in the existing
  `edenMapChGroups` list under the key `sec:<key>`). Macro: every section open.
- Rows, switches, avatars and fly-to are today's (`row()`, `rosterRow()`); section headings are `<details class="chsec">`
  with a `<summary>`; no section heading is an `li`, so `#evbar .chpane li` still counts people only.

### 4.3 What does not change

The tab's count and fresh badge, the map avatars, the per-person switches, the roster groups and their order, the person
card. The host payload `eden-map:chars` is unchanged in S6.

## 5. Unified stash (K-R74, K-R75)

### 5.1 Where it lives

`<chat var>.stash`: `eden_map.stash` for the first pack (its manifest's `chat.var`), `tc_<id>.stash` for the other v1 packs
until S10 renames the root (K-R05: `spatial_<id>` for schema-2 packs). The key `stash` is the same for every pack (ASCII,
naming rule 8). Never in `stat_data` (brief rule 5).

### 5.2 Store shape

```
stash = {
  v: 1,
  items:   { <id>: Row },          // insertion order = display tie-break
  seq:     number,                 // last automatic number (ids 'i<n>')
  slot:    Slot | null,            // the W12 virtual slot (P-05)
  removed: { <id>: msgIndex },     // tombstones of text rows removed through the extension API (≤ 200, oldest dropped)
  since:   number | null,          // first message this store scans (§5.6)
  upTo:    number | null,          // last message scanned
  from?:   { keys: string[], msgIndex: number | null }   // present when the store was built from v1 keys (§5.4)
}
Row = {
  name: string (1–60), place: string (≤ 60, '' = none), map: string (≤ 40), node: string ('' = not resolved),
  hidden: boolean, note?: string (≤ 200), qty?: number (2–999),
  src: 'text' | 'map' | 'api' | 'legacy', carried: boolean, msgIndex: number | null, mark?: string
}
Slot = { name, path, virtual: boolean, msgIndex: number | null, facts: { <id>: { name, place?, msgIndex } } }
```

- Ids are kept from v1 (`i<n>`, the world row ids `s…` or the pack's own, the text ids `x…` = `pickup.itemId(name)`):
  the 3D page's "already taken" list (`estate:taken`) and the world-stash glow keep working.
- `mark` (text rows only) = `hashText` (FNV-1a base 36, `tavern/context.mjs`) of the message text the row came from; a
  different mark means the message changed (§5.6).
- `node` is resolved at write time when the host's geography places `place`; readers locate `place` when it is `''`.

### 5.3 Row meaning: carried and stored (P-04)

| src | written by | carried |
|---|---|---|
| `text` | the pickup scan of a message (§5.6) | true |
| `map` | `eden-map:loot` / `estate:loot` (a world-stash row the player took) | true |
| `api` | `EdenMap.setInv(name, patch)` | false (stored at `place`) |
| `legacy` | migration, origin not recognisable | false |

The place card's "stored" line (`stash-view.mjs`) and the injected digest line keep listing every row by its place, as
today; only the Items tab reads `carried`.

### 5.4 Migration from the v1 keys

Runs once in `root-store.mjs loadCustom` when `stash` is absent and `仓库` or `槽位` exists (P-06, P-07):

| v1 (`仓库.items.<id>`) | Row |
|---|---|
| `名` | `name` |
| `地点` | `place` |
| `层` | `map` |
| `暗格` | `hidden` |
| `说明` | `note` |
| `数量` | `qty` |
| — | `node: ''`, `msgIndex: null` |
| id rule | `src: 'text'`, `carried: true` when `id === itemId(name)`; `src: 'map'`, `carried: true` when the id matches `^s[0-9a-z]{1,8}$` or is a world-stash row id (the world stash may load later: a one-time `retag` then upgrades those `legacy` rows); else `src: 'legacy'`, `carried: false` |

`仓库.seq` → `seq`. `槽位 = { 名, 路径, 虚拟, 楼, 物: { <id>: { 名, 楼, 地点? } } }` → `slot = { name, path, virtual,
msgIndex, facts: { <id>: { name, msgIndex, place? } } }`. `since = newest message`, `upTo = since - 1` (the newest message
is scanned once by the new host; the scan is idempotent by id), `from = { keys, msgIndex }`.

**The v1 keys stay read only until S10.** The root is written as a whole (`saveRoot` replaces the object), so the store
keeps the loaded `仓库` / `槽位` values and writes them back verbatim with every save; nothing writes or deletes them.
Idempotent: a second load finds `stash` and does not migrate again.

### 5.5 Host flow

`tavern/loot-flow.mjs` becomes `tavern/stash-flow.mjs` (P-11); `createStashFlow(host)` keeps the W2 dice, failure ring,
action injection and settlement gate; its store is `stash` (no `inv`, no separate `slot`). One round:

1. `scanPickups(msgs, hereNow)` → `step()` (§5.6) over the new messages of the window; the newest message's place is
   `hereNow` (today's rule), an older skipped message's place is the location of its per-message variables, else `''`.
2. The write is requested through the settlement gate (`gate().request('sync', stashSync)`), released at the end of the
   round (W11 timing unchanged); the W11 audit and carry line keep running on the same facts.
3. `takeLoot` (map pickup) puts the world row with `src: 'map'`, `carried: true`, `msgIndex = newest`, adds its fact to the
   slot, writes through the same path.
4. `sendInv()` posts `eden-map:inv` (§5.7); it runs on ready, after a change, and when the in-card rows change.
5. The injected lines: `digestLine(stash)` and `slotLine(stash.slot)` give byte-identical text to today for the same
   rows (pinned against a frozen copy of the v1 functions).

### 5.6 Recompute and reconciliation (K-R75)

`map/tavern/stash-recompute.mjs` (pure; imports `core/pickup.mjs`, `core/ledger.mjs`, `tavern/stash-store.mjs`):

```
scanMessage(stash, msg, ctx) -> { stash, added }
  msg = { msgIndex, text, place }; ctx = { worldNames, vocab, probe }   (probe = ledger.slotProbe(stat) or null)
  known = worldNames ∪ names of stash rows
  facts = pickup.scan(text, { known, floor: msgIndex, place, vocab })
  for each fact in order: skip when removed[id] >= msgIndex or items[id] exists;
    else put { id, name, place, note: TEXT_NOTE(msgIndex), qty 1, src 'text', carried true, msgIndex, mark: hashText(text) }
         and delete removed[id] when it is older than msgIndex
  probe present and facts not empty: slot = slotDeclare(slot, probe, msgIndex); slot = slotPut(slot, facts, msgIndex)
  upTo = max(upTo, msgIndex)
replayMessage(stash, msg, ctx)   remove the text rows and slot facts with that msgIndex, then scanMessage
step(stash, msgs, ctx)           replay every message whose text rows carry a different mark; scan every message with
                                 msgIndex > upTo (ascending); messages before `since` are never scanned
recompute(msgs, { since, actions, removed, ...ctx })
                                 fold from an empty store with that `since`: for each message (ascending) scanMessage,
                                 then apply the actions whose msgIndex equals it; actions with msgIndex null are applied
                                 first (they predate `since`)
actionsOf(stash)                 the rows with src map | api | legacy, and the tombstones
reconcile(stored, recomputed, { comparePlace }) -> { ok, missing, extra, changed }
```

`TEXT_NOTE(n)` is today's note text (`正文拾取 · 第 n 楼`, kept verbatim because it reaches the digest line).

**What counts as a match:** `reconcile(stored, recompute(msgs, { since: stored.since, actions: actionsOf(stored), … }))`
is `ok` when both stores have the same item ids, and for every id the same `name, src, carried, msgIndex, qty, hidden, note,
mark` (and `place` when the caller supplies the places it used), and the same slot facts. `missing` / `extra` / `changed`
list the differences. The node test replays a synthetic chat one message per round through the live fold (the same calls
`stash-flow` makes) and compares it with the batch recompute: equal item for item; then it drops the store and
recomputes: equal again.

**Live drift:** the host may run `reconcile` on demand (Settings self-check); a drift is reported as a count, never
repaired silently (P-09).

### 5.7 Wire format (P-08)

```
eden-map:inv = {
  items: [{ id, 名, 地点, 层, 暗格, 说明?, 数量? }],         // today's legacy rows (wireRows), same order
  stash?: { v: 1, rows: [{ id, ...Row }], slot: { name, virtual, count } | null },
  card?:  { path, rows: [{ name, qty?, text? }] } | null       // §6.3
}
```

`EdenMap.getInv()` keeps returning the legacy rows (external contract until S10).

## 6. Items tab (K-R76)

### 6.1 Groups

| group | rows | actions |
|---|---|---|
| carried | store rows with `carried: true` | fly to the place it was found (when it locates) |
| here | store rows with `carried: false` at the player's node; world-stash rows at the player's node that are not taken (a hidden row only when the player stands on its spot, the rule of `app/stash-markers.mjs`) | world rows: "take" (sends `eden-map:loot`, the same intent as the glowing marker); own rows: none |
| other places | store rows with `carried: false` elsewhere, one sub-heading per place | fly to the place |
| in card | the card's own inventory (§6.3) | none (read only) |

Empty groups are not drawn; the tab is visible when any group has a row (it counts for the drawer, P-03). The badge `n` is
the number of carried rows. No fresh badge.

### 6.2 Row fields

Name (verbatim, `textContent`), quantity `×n` when > 1, the hidden-spot word (`inv.hidden`) for hidden rows, the place as a
secondary line, the note as the row's `title`. Pack text reaches the page only as text (K-R64). Fly-to resolves the place
with `hereRes(place)` and reuses the existing flight: `CustomNamesView.flyTo({ room })` for a room, `{ map, marker }` for a
landmark, else `go(map)`; a place that does not locate gets no button.

### 6.3 In-card inventory (read only)

`mvu-readers.mjs cardInventory(stat, path)` (pure): the table at `path` of the card's `stat_data`, MVU `[value, note]` pairs
unwrapped; an object keyed by item name (value: number = quantity, string = text, object = first number and first string of
it) or an array (strings = names; objects: the name field by the kernel's name words, first number). At most 100 rows,
names ≤ 60 code points. `path` = the pack's `vars.inventory` (new optional var, K-R76), else the field `ledger.slotProbe`
finds when it is not virtual, else none (the group is not drawn). The inventory words move from `core/ledger.mjs`
`SLOT_KEYS` to `core/vocab.mjs` (`EXACT.inventory`, same words, same order). Nothing is ever written to `stat_data`.

## 7. Pickup vocabulary (K-R77)

### 7.1 Verb classes

| class | object must be | kernel verbs |
|---|---|---|
| normal | quoted, or with a measure word, or a known item name, or a bare noun of 2–8 characters that is not generic | today's `VERBS` (Chinese) and `picks up`, `picked up`, `grabs`, `grabbed`, `pockets`, `pocketed` |
| strict | quoted, or with a measure word, or a known item name; never a bare noun | `获得`, `得到`, `拿取`; English `obtains`, `obtained`, `gets`, `got`, `takes`, `took`, `receives`, `received`, `acquires`, `acquired` (English strict: quoted or known only) |

Known item names = world-stash names + names already in the store (today's rule).

### 7.2 Sentence patterns that count

- Verb (+ aspect mark) + measure phrase + noun: "he obtained one badge" in Chinese (`获得了一枚徽章`), `得到一个木盒`.
- Verb + quoted name: `获得了「星辉碎片」`.
- Verb near a known item name (within 24 characters, today's rule).
- `把` / `将` + noun + `拿取` (the disposal form; the other two strict verbs do not take it).
- English: verb + optional determiner + quoted or known name: `got the "Brass Key"`, `took the Brass Key` (known).

### 7.3 Forms that never count (every verb, P-12)

| form | rule |
|---|---|
| abstract object | the object is in `NOT_ITEMS` (kernel list, extended in S6-3) or the pack's `not_items` |
| negation | a negation word in the same clause before the verb, at most 4 characters away (`没`, `没有`, `未`, `不`, `别`, `无法`, `不能`, `没能`); English `not`, `n't`, `never`, `no longer` within 3 words before the verb |
| question | the clause of the verb ends with `？` / `?`, or ends with a question particle (`吗`, `呢`, `么`), or starts with `是否` / `能否` / `有没有` / `要不要` |
| dialogue | the verb lies inside a quoted span (`“…”`, `「…」`, `『…』`, `"…"`); a quote that starts right after the verb is the quoted-name pattern, not dialogue |
| intention or condition | in the same clause before the verb: `想`, `要`, `打算`, `准备`, `试图`, `企图`, `希望`, `如果`, `要是`, `假如`, `若`; English `want to`, `try to`, `if`, `would`, `will` |
| potential complement | `得到` right after a verb character that makes it "can do" (`看`, `听`, `想`, `做`, `找`, `买`, `办`, `猜`, `闻`, `感`, `觉`, `等`, `赶`, `追`, `吃`, `用`, `见`) |
| compound | `获得` followed by `者` or `感` |

A clause ends at `。！？；…` and their half-width forms and at line breaks.

### 7.4 English and the I-08 fix

I-08: "Mara picked up the Brass Key." gives `['the', 'Brass Key']` today, because the Chinese bare pattern also runs on the
English verbs and stops at the first space. Fix: the Chinese patterns use the Chinese verbs only; the English pattern
takes an optional determiner (`a`, `an`, `the`, `some`, `his`, `her`, `their`, `my`, `your`, `its`) followed by at least one
space, and `tidyEn` strips a leading determiner. After the fix: `['Brass Key']`; "I grabbed an apple and left" →
`['apple']` (today `['an', 'n apple']`).

### 7.5 Pack extension

`items.pickup.<lang>` (schema 2, K-R46): `verbs` (normal class), `verbs_strict` (new, strict class), `verbs_off`,
`not_items`. Schema-1 packs: the overlay may carry `items.pickup` (an extension of K-R67; `fromV1` merges it: lists united,
`verbs_off` united). The host reads it through the profile (`profile.pickup`, built by `profileOf` / `profileFromV1`) and
passes it to `scan(text, { vocab })`. Additions extend the kernel lists, `verbs_off` removes kernel verbs, words are literal
strings (no regular expressions, K-R01). The minimal pack already declares `en.verbs: ["snatches"]` and
`not_items: ["the tide"]`: the S6-3 test uses it.

## 8. Settlement write paths for npc and events (K-R78, I-04)

What "write path" means: a validated single-item patch of the W11 audit lands somewhere the map owns. The map never writes
`stat_data`, so the store is the map's own chat variable:

```
<chat var>.ledger = {
  npc:    { <name>: { place, node, msgIndex, src: 'routine' } },          // ≤ 200 entries
  events: { <key>:  { type, level, node, msgIndex } }                      // key = event id; ≤ 200 entries
}
```

| domain | facts (producer) | landed view | patch when | written by |
|---|---|---|---|---|
| npc | the round's schedule placements (`host.chars` rows with `src: 'routine'`), authority `verified` | MVU present-roster places ∪ `ledger.npc`; a roster person with an empty place is a **hole** | the person is a hole and the fact has a place (rule ⑤ "fill only holes": a person with a place, from MVU or from the ledger, is never overwritten) | `stash-flow` through the settlement gate |
| events | the round's parsed events (`r.events`, the chat log), authority `committed`, type = the pack's type id (K-R50) | `ledger.events` | the event id is not in the ledger | same |

- Switch `edenMapLedgerWrite` (default off, brief rule 6): storage key in `core/storage.mjs` `KEYS` (owner `host`, default
  `'0'`), the `prefs` field of `eden-map:th` registered in `SCHEMA`, a checkbox in Settings → TavernHelper
  (`app/tavernhelper-settings.mjs`), strings `th.ledger_write` in zh and en. Off = no npc / event facts are produced, exactly
  today's behaviour.
- The audit learns the hole: a landed value `''` is a hole (patch), not a `stale-value` (one rule change in `core/ledger.mjs
  audit`, pinned).
- The events domain checks the type against the pack's taxonomy ids plus `EVENT_TYPES` (option `eventTypes` of `audit`).
- Consumers in S6: the landed views (so these domains settle and stop riding the carry line) and `describe()`; drawing
  settled events and npc places is S8.
- The ledger is a droppable cache: every entry is recomputable from the chat and the schedule.

## 9. Kernel-schema additions (planned)

| id | rule (one line; full text in the step that implements it) | step |
|---|---|---|
| K-R71 | Entity protocol: people, items and events are entities `{ kind, id, name, node, place, source, msgIndex, present?, data }` derived by pure adapters; `node` by reference (K-R28), else located (K-R24). | S6-1 |
| K-R72 | Drawer tabs: kernel tab set and default order; `ui.tabs` (K-R57) also from the overlay's `ui`; `places` always present; legend last; visibility rules. | S6-1 |
| K-R73 | People by level: macro when the open view has child views, else micro; view field `x-people`; sections of the present group. | S6-1 |
| K-R74 | One stash store `<chat var>.stash`: shape, row fields, `carried`, `slot`, tombstones; one-way migration from the v1 keys, which stay read only until S10 (refines K-R47). | S6-2 |
| K-R75 | Reconciliation: the store equals the fold of the message scan from `since` plus the recorded actions, item for item; replay of changed messages. | S6-2 |
| K-R76 | In-card inventory: optional `vars.inventory`, discovery by the kernel's inventory words, read only; the Items tab's four groups. | S6-2 (reader), S6-3 (tab) |
| K-R77 | Pickup sentences: normal and strict verb classes, never-forms, English determiner rule, pack `verbs_strict`, overlay `items.pickup`. | S6-3 |
| K-R78 | Settlement write paths: the npc and events domains write holes into `<chat var>.ledger` through the settlement gate, behind a default-off switch. | S6-3 |

## 10. Step plan

| step | IN | parity / stop | probes |
|---|---|---|---|
| S6-1 | `core/entities.mjs`, `core/drawer-tabs.mjs`, `app/tabs.mjs`; four tabs onto the registry; characters by level; `x-people`; K-R71–K-R73 | tab visibility identical to the frozen logic for every input; first-pack screenshots identical except the people tab's section headings | `accept`, `chars092`, `roster095`, `fix3`, `text_dump`, `e7`, `v2a`, `contrast_v2`, `pack_town`, `s43_parity` |
| S6-2 | `stash-store.mjs` rewrite, `stash-recompute.mjs`, `stash-flow.mjs` (renamed), migration, wire format, `cardInventory`, `vars.inventory`; K-R74–K-R76 | injected digest and slot lines byte-identical for migrated data and for the session fixtures; migration lossless; reconciliation equal | `accept`, `e7_host`, `th_adopt`, `p8_pick_clock_depth`, `pack_town` |
| S6-3 | Items tab; pickup classes and never-forms; I-08; pack `verbs_strict`, overlay `items.pickup`; npc / events write paths; probe `drawer_stash`; K-R76–K-R78 | every positive sentence of the existing pickup tests still counts; switch off = identical injected text | `drawer_stash` (new), `accept`, `e7_host`, `th_adopt`, `pack_town`, `text_dump`, 375 px once |

Each step obeys the parity rule of the agent brief §3: a divergence that only adds placements or information is pinned in a
test, filed as a Q-item in `docs/todo.md` §3 with a recommendation, and the step continues; a lost event, character, item
or injected line, or a changed injected text outside what the step names, stops it.

## 11. Risks

- **Mixed versions.** The host script (installed) and the viewer (CDN) differ: P-08 keeps `items` as is; a new viewer
  without `stash` in the payload falls back to the legacy rows (every row "stored", no "carried" group).
- **Whole-root writes.** `saveRoot` replaces the chat-variable object: forgetting to carry `仓库` / `槽位` over would delete
  them. S6-2 pins it in a test.
- **Ledger files.** `map/tavern/eden-map.js` (675) and `map/viewer.html` (707) are in the lines ledger and may not grow:
  the Items tab lives in the already-loaded `stash-view.mjs`, the entry's changed lines are edited in place.
- **Line limit.** `events-view.mjs` is at 398 lines; S6-1 moves logic out of it, never into it.
- **Pickup recall.** The never-forms trade recall for precision (K-R46: "rather miss than invent"); the existing positive
  corpus is pinned so recall on narrated pickups does not drop.
