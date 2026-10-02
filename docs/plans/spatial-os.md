# Spatial OS refactor plan (v10: ship Eden first, D14–D21; v9: contract first + naming audit + author walkthrough + CLAUDE.md rewrite + test-feedback protocol + effort and reasoning tiers)

> Status: approved 2026-09-30 (plan v9); v10 re-plan adopted 2026-10-02 (D14–D21, §17). Plan of record; until the S10 repo split the Chinese edition docs/plans/spatial-os.zh.md is canonical (D18).

---

## 0. Direction: not backwards, but the order must change

- **No rewrite from scratch**: the current script has 600+ tests and a lot of accumulated tavern-host pit handling (MVU lifecycle, CDN routes, streaming performance, sleep/wake…). A rewrite would throw all of it away.
- **Nor can we keep "carving out from Eden"**: the v4 schema was essentially "generalise Eden's shape". Fields such as `guess_order`, `up_alias`, `outside` and `zones` are patches for Eden; the more we carve, the messier it gets. That is exactly why the schema "still feels like it needs work".
- **The right approach: contract first + incremental migration** (strangler pattern).
  1. First fix a **minimal kernel contract**: only one "node tree" is required; everything else is an optional capability module.
  2. Use a "minimal pack" (a few nodes, no base map) as the litmus test: **the existing engine must be able to run on it**.
  3. Inside the engine, a compatibility reader converts Eden's existing data files (`maps.json` etc.) to the new contract, so Eden's data **does not need a one-shot rewrite**.
  4. Then, module by module, make the engine understand only the new contract; the script keeps working at every step.
- **The "minimal system" is not a fresh start**: it means "the existing engine also works on a minimal pack". That capability is itself the safety net for other cards (formerly S8).

---

## 1. Overview: what is fixed, and what should become customisable

Principle: **the kernel fixes the "shape"** (protocol, basic entity fields, rendering building blocks, safety rules); **authors change the "content"** (nodes, names, categories, fields, styles, rule text).

| Area | Hard-coded today | Should become author-customisable | Should stay fixed in the kernel |
|---|---|---|---|
| Space | ① map kinds `world/points/estate`, where the world map and cross-section only work for Eden;<br>② current-location matching is hard-coded to 6 levels (manor room → zone → landmark → layer → sky city → world);<br>③ events have a separate geography of their own (`LAYERS`/`RE_*`/`ZONES`);<br>④ outdoor zones and rooms have no parent | Node tree: any depth, node type names chosen by the author; aliases, weak keywords and coordinates hang on nodes; views (base-map tiles / schematic / 3D) hang on nodes | The matching algorithm (longest alias, prefer the deeper node); node id rules |
| Time | Default MVU path (`世界.当前时刻` = world.current time, …); 4 fixed day periods | Time source path; period names and boundaries | Deterministic clock advance rules (zero tokens) |
| Characters | The structure of the roster's "three tables"; fixed field slots (rank / core value / codename / outside awareness / accessories / combat power…); stage ladder, combat-power ladder, avatar whitelist, group names | Roster groups (name + data source); attribute field list (field, label, display kind: text / meter / ladder / chip); avatar source | Core entity fields `id/name/node/source`; multi-source priority arbitration |
| Items | Pickup verb table lives in core; two stores; three id schemes | Pickup vocabulary and blocklist (per language, per pack); world stash data | The unified stash structure; ledger reconciliation rules; "the chat log is the only truth" |
| Events | Eden categories are in code; lifetime / merge window / per-floor cap are constants; effects and icons hard-coded | Categories (what it is), icon, colour, effect (a combination of building blocks plus parameters), lifetime, injection sentence template | The tag syntax `⌖类别｜地点｜等级｜一句话｜发布方` (⌖ category | place | level | one-line summary | publisher; the protocol with the model); content is never filtered |
| Layers | A fixed set of 9 modules; a pack can only feed data | Declarative layers: type + data source + applicable level + style + menu | The order of the 10 slots; rendering building blocks (point / area / line / label / tint / particles / move-along-line) |
| UI | Drawer tabs; per-map hard-coded themes; legend; product name; about 30 strings with card wording | Strings (`strings`, already exists), theme tokens, legend, credits, which tabs are enabled | The design-token system; the z-index ladder; the accessibility baseline |
| Interface to the model | Injection sentence format (hard-coded Chinese); the worldbook builder is an Eden-only Python script; the `[TOPO]` prefix | Injection templates, worldbook rule entries (non-Eden packs already supported) | Injection budget and degradation order; write only our own add-on book; consent switch |
| Host / platform | — | — (only the MVU path is configurable) | MVU / TavernHelper adapters, storage namespace, CDN routes, message protocol |
| 3D | The Eden manor page (`map/estate/main.js`) is dedicated code | 3D manifest (already supported), hotspots, zone → child-map anchors | The generic 3D viewer `viewer3d.html` |

---

## 2. Kernel contract v2 draft (the output of S1; needs your review)

```
manifest.json      only id / schema:2 / title are required; optional lang (zh/en…, decides the default vocabulary and injection-template language), match (pick a pack by card automatically)
                   where a pack comes from (S9): embedded in the card → index match → a URL or local file the user supplies → tier-0 automatic
├─ nodes     node tree = the only geography (optional: if absent it is generated from the chat → zero-config safety net)
│    { id, name, alias[], hints[], parent, type, at?, view?, canon: card|inferred }
│    hints = weak keywords: used only to decide "which ancestor it belongs to", never to place directly (replaces Eden's RE_UP/LOW/MID regexes)
├─ views     how to draw: tiles (DZI base map) | schematic (auto schematic) | model3d (3D manifest); attached to nodes
├─ vars      MVU paths: location / time / period / date / outfit / roster tables
├─ entities  roster groups [{id,label,source}] + attribute fields [{field,label,kind,ladder?,max?}] + avatar source
├─ items     world stash data + pickup vocabulary / blocklist
├─ events    categories (only "what it is"): groups / types{icon,color,fx,life,inject} / fx_presets / levels
│            "where" is handed over entirely to node aliases; no more layers / match / guess_order / outside / zones
├─ layers    declarative layers [{id,type,source,slot,applies,style,menu,legend}]
├─ ui        strings / theme / legend / credits / tabs
└─ llm       injection templates / worldbook rule entries
```

- **Compatibility**: add `core/compat-v1.mjs`, which converts v1 (`maps.json` + `events.json` + the old manifest) to v2 in memory. The two existing packs, Eden and town, run without any file change. Schema v1 stays frozen; new packs are written directly in v2.
- **Automatic degradation**: no `views` → schematic; no `events` → generic neutral categories; no `vars` → auto-discover by field name; no `entities` → show only name and location; no `layers` → use the built-in default layers.
- **Minimal pack** `map/packs/minimal/`: only 5 nodes and no base map. The engine's current location, events, characters and items must all work on it, pinned by tests.

---

## 3. Decisions made

| # | Decision |
|---|---|
| D1 | All wording is neutral, Eden included, and rules may be rewritten. The card's original names appear only in pack data and builder tools. The original author's credit goes into the pack's `credits`. |
| D2 | Attach the milking hall (挤奶厅) under the Eden manor, anchored to the "dairy farm" (奶牛农场) zone; delete the test entry. |
| D3 | Line count, z-index, inline styles: a "may only shrink" ledger, split into batches. |
| D4 | Items are stored uniformly in `eden_map.stash`; the old `仓库` (warehouse) / `槽位` (slot) keys migrate automatically. |
| D5 | The product name becomes neutral this round; renaming internal namespaces goes to the last batch and is re-confirmed before it is done. |
| D6 | You and I work out the prompts: an English prompt plus a Chinese note, handed to Sonnet to execute; I review the result before the next step. Design steps are best given to Opus. |
| D7 | The render line and the code line are separate; from now on the render line serves only the Eden pack's content. |
| D8 | No branch split now; at stage E we split the repository: `spatial-os` public and in English; `eden-manor-maps` keeps the main + preview branches. |
| D9 | The clean OS repo is in English, the UI is bilingual (zh/en), and documents ship with `*.zh.md`; the card's original names inside the Eden pack stay Chinese. |
| D10 | **Contract first**: fix the kernel contract v2 and the minimal pack, then migrate; the schema takes the node tree as the only geography. |
| D11 | "Turn off glitch effect" (关闭花屏特效) is renamed "Turn off event screen effects" (关闭事件屏幕特效), because the settings already have "Reduce motion" (减少动态效果) and the two must not be confused. |
| D12 | **Naming audit**: code names must be intuitive and auditable.<br>• Produce a glossary first;<br>• internal renames are done together with the S5 file split;<br>• renames of external contracts (entry file names, message names, storage keys, chat-variable keys, `EdenMap`) go to S10, with a migration. |
| D13 | **Zero barrier for authors**: an author who gets the clean OS + skill can start using it **without GitHub, without Blender, without editing code**:<br>• there is exactly one unified script and a pack is just data;<br>• the runtime adapts to the card automatically, much as the "copyright notice" page reads the card automatically;<br>• the viewer itself can edit, and the result exports to a pack in one click. |
| D14 | **Ship Eden before generalising further** (C1). The v0.9.8 Eden release comes before stage E and stage F. Generalisation work not needed for the release is parked until a second real author or card needs it. S8 / S9 / S9b / S7 were already done when this was adopted; what they added is judged by the D19 inventory instead. |
| D15 | **A China-reachable line before the release** (C2). jsDelivr needs a proxy and the jsdmirror line was measured unusable (2026-09-29); the npm line (`tiancheng-map-assets`, npmmirror) stays off until a package is published. Make one China-reachable line work end to end, with a probe. The npm publish is outward-facing: the user confirms name, contents and size first. |
| D16 | **Quiet for the user, never silent for the log** (C3). Brief §2.6 changes: no blocking dialogs stays, but every swallowed failure is recorded through `core/logbuf.mjs` and reaches the feedback report. A watchdog ratchet counts empty catches in engine code (60 `.catch(() => {})` on head #277; baseline may only shrink). `docs/ARCHITECTURE.md` §4 shows the host entry as the hub it is, and the linear chain as the target. |
| D17 | **Block only on what breaks the product** (C4). Hard gates: `node --test`, syntax / JSON parse, `check_maps`, `check_pack`, the architecture watchdog, the empty-catch ratchet, `check_no_labels`. Documentation gates (`check_doc_language`, `check_zh_mirror`, `check_readme`, `check_ascii` on docs, `check_version`, `check_arch_doc`) print warnings and do not fail. The RESULT block is shorter (status / commits / tests / open). |
| D18 | **Chinese is canonical until the S10 repo split** (C5). User-facing decision documents (plan, brief, todo status, reports) are Chinese first; English editions are optional and produced in bulk at the split. Prompts stay English with a Chinese note. Supersedes D9 and `docs/language-policy.md` for this period. |
| D19 | **Feature inventory** (C6). One docs-only inventory (`docs/feature-inventory.md`, Chinese) lists every feature as used / unused / half-built with modules, default, tests. The user marks each; unused and half-built features default off and are parked; deletion only with the user's approval. |
| D20 | **Code line first until v0.9.8** (C7; pending one confirmation). The render line runs at low intensity, one batch at a time, never blocking code-line tests on the Mac; release-relevant items first. |
| D21 | **Slimming follows distribution** (C8). Once assets are served from a non-git channel (D15), new art stops being committed to the code repo and the history rewrite is one step, re-confirmed with the user before the force push. |

---

## 4. Audit checklist (summary; the full line numbers in v1–v4 remain valid)

- **Where the Gemini reference draft disagrees with reality**:
  - Files that do not exist: `layers.json` / `rooms.json` / `estate.json` (the real sources are `maps.json` + `eden_estate_rooms.json` + `estate/model/zones.json`), `map/tavern/settings.mjs` (actually in `app/settings.mjs` + `viewer.html` + `i18n`).
  - "Manor members" (庄园成员) is not in `th-ui.mjs` but at `chars.mjs:167`.
  - Key name: `eden_map.stash` did not exist before.
  - Rule scope: the line-count limit used to check only core.
  - Naming mismatch: the four ledger domains are assets / npc / events / depth.
  - Missing words: the pickup verb table has no 获得 (obtain) or 拿取 (take).
  - Test count: about 612 cases in reality.
- **Business special-casing**: `map/core` is already clean. After widening the scan there are 180 hits in 27 files. The worst offenders:
  - `tavern/events.mjs`: Eden event categories in code;
  - `events.mjs` (viewer): the glitch effect is hard-wired to the 网络攻击 (network attack) type;
  - `adapter.mjs` / `mvu.mjs`: the card's MVU structure and field slots;
  - the path `世界.当前地点` (world.current location) has 8 copies;
  - `app/locate` / `scale` / `boot` / `clouds` / `markers` and `custom.mjs`: hard-coded `'tiancheng'` / `tc_*`;
  - `viewer.html` / `tokens.css`: hard-coded theme;
  - about 30 keys in i18n, plus 131 entries in the `names` dictionary.
- **Milking hall** (`maps.json:1891`): `parent:world`, `test:true`, no inbound link, and the breadcrumb reads "World › Milking hall". Its real position in the world is the dairy farm at `zones.json:473`.
- **Drawer**: tabs are hard-coded and show/hide logic is scattered over 5 places; the characters tab does not narrow by level and does not go through RosterSystem; there is no items tab.
- **Layers**: the descriptor has no "which kind of map it applies to" field, the menu is rendered only once; inapplicable layers can still be ticked and rAF still runs.
- **HUD**: no glass tokens; the z-index ladder only covers `viewer.html`; on the 3D page the (i) lights up but opens no panel.
- **Other cards**: no safety net. The script loads Eden by default (`host-th.mjs:30`).

---

## 5. Phased implementation plan

### Stage A: contract + generalisation fixes

- **S0 Rules and watchdog first** (about 4h):
  - rewrite `rejected.md` #5, CLAUDE.md, `content-compat.md` and memory to the D1 / D10 wording;
  - create `docs/ARCHITECTURE.md` and its `.zh.md`;
  - widen `check_architecture.py` and add the ledger `tools/arch_baseline.json`: line count, z-index, card terms and inline styles may only shrink;
  - add gate self-tests so the new checks are proven to bite.
  - **S0.4 Naming audit + glossary** (about 3h, documents only, no code change):
    - produce `docs/naming.md` + `.zh.md`, listing item by item "current name → meaning → suggested new name → internal or external contract → which batch renames it";
    - use it as your reference table when reviewing code.

    Problem classes found so far:

    | Problem | Examples |
    |---|---|
    | Pinyin names | `baibai.mjs` (bridge to the Baibai drawing library, suggest `appearance-bridge`), `shujuku.mjs` (table-database plugin, suggest `tabledb-bridge`) |
    | Hard-to-read abbreviations | `th.mjs` / `host-th.mjs` (TavernHelper), `cvd.mjs` (colour-vision mode), `failrep.mjs`, `ops.mjs`, `wbpeek.mjs`, `tick.mjs` |
    | Names that do not fit | `custom.mjs` actually handles four things: custom names + night tint + outfit + rename hints; `section.js` is the prototype of the sky-city vertical section; `tiers.mjs` handles sharpness tiers + load progress + avoidance |
    | Same-name files | 14 groups of duplicate names across directories: `events` / `trips` / `compose` / `budget` / `routine` / `quests` / `vision` / `traffic` / `weather` / `layers` / `pack` / `lod` / `scrapbook` / `main.js` |
    | Globals with a card-name prefix | `window.TC*` (TC = Tiancheng, the sky city), 11 kinds: `TCSheet` / `TCFog` / `TCStore` / `TCSettings` / `TCLayers` …; also `__worldTC` and `__tcPack` |
    | One- or two-letter global shorthands | `M` / `REG` / `cur` / `HX` / `P` / `BR` / `INVm` / `nm` / `tx` / `T` / `V2S` / `S2V` / `H2V` / `PR` / `est` / `lp` |
    | Chinese chat-variable keys | `自定义` (custom) / `标签楼` (tag floors) / `探索` (exploration) / `行程` (trips) / `检查点` (checkpoints) / `关键帧` (keyframes) / `仓库` (warehouse) / `槽位` (slots) |

    Naming rules:
    - file names state the responsibility, in English, and one concept has exactly one name across the repo;
    - symbols shared between modules have at least 3 letters and carry meaning;
    - files that exist in both layers (one in the viewer, one in the host) are told apart by a suffix, e.g. `events-view` / `events-parse`.
- **S1 Kernel contract v2 design + minimal pack** (about 8h, Opus, **show it to you for review before going further**):
  - design doc: `docs/kernel-schema.md` + `.zh.md`;
  - contract: `map/data/schema/v2/*.schema.json`;
  - new modules: `core/nodes.mjs` (node tree: ancestors, children, anchors, alias matching, `describe()`), `core/compat-v1.mjs` (v1 → v2 conversion);
  - minimal pack: `map/packs/minimal/`;
  - tests: `tests/kernel_minimal.test.mjs` (the four pure pipelines — current location, events, characters, items — all run on the minimal pack), `tests/compat_v1.test.mjs` (node counts and hierarchy after converting Eden / town match).
- **S2 Node tree lands + milking hall moves home** (about 6h):
  - breadcrumb, `estateStandIn`, `cardlinks` and `spatial.mjs` fetch their data from `nodes.mjs`;
  - milking hall: `parent` becomes `eden_estate`, add `anchor:{zone:'dairy'}`, delete `test` and the test-entry mechanism;
  - drill-down: new messages `estate:children` / `estate:go`, an "Enter 3D" button on zone cards, double-clicking a zone also enters, and returning from the child map focuses the farm;
  - `check_maps.py` gets three new invariants: no orphan maps, no `test` field, `anchor` must really exist;
  - the `[TOPO]` prefix is derived from the node chain, and the worldbook builder is re-run;
  - new probe `topo_dairy`.
- **S3 Unify geography: everything lands on nodes** (about 10h):
  - current-location matching (the 6 hard-coded levels in `here.mjs`) → generic node matching;
  - event placement (`LAYERS` / `RE_*` / `ZONES` / `MAP_OF` / `RE_RING`) → node aliases + `hints`; Eden's place-name regexes are converted into `alias` / `hints` data on the matching nodes;
  - character locations and item places also resolve to node ids;
  - **parity test**: on Eden's chat corpus the old and new paths must give identical current locations and event layers, item by item; only after it passes is the old code deleted.
- **B0 Quick real-tavern smoke after S3** (added 2026-10-01, before S4-2; the user runs it): at most 8 numbered checks in a real SillyTavern + TavernHelper session, taken from the real-tavern items of `docs/todo.md` I-01 (the current location follows the chat, events land, the injected situation line reads right, the settings panel opens, the copyright page and roster reputation show). It fixes the harness that stage B later builds on; it is not stage B.
- **S4 Special-case sweep + neutral wording** (about 14h, in 4 commits):
  1. **Move event categories into the pack**: export Eden's categories as `events` data (v2 shape); effects use `fx` building blocks (`fx_presets`), and the glitch effect = the network-attack type declaring `fx:"glitch"`; delete the built-in categories from the code.
  2. **Roster and variables**: `vars` and `entities` (groups + attribute field list) replace the fixed field slots, stage ladder, combat-power ladder and avatar whitelist; the 8 copies of "世界.当前地点" are merged into 1.
  3. **Viewer special cases become data-driven**: theme, clouds, night tint, legend, credits, data paths, worldbook name (Eden keeps its original book name).
  4. **Neutral wording**: about 30 i18n keys; the `names` dictionary moves into pack data; the product name becomes "Spatial Map / Spatial OS"; tests that pinned Eden constants now read pack data.
  Step S4-4 also sweeps the leftover provenance-family wording listed in RESULT S0-F open (a) (statements such as "setting does not say", the `user` room kind, the worldbook entry names, `canon` on render-campaign items, the legacy estate v1 files, history docs that still describe removed fields).
- **S5 File split + first rename batch** (about 12h):
  - split `events.mjs` and `custom.mjs` to ≤400 lines each;
  - split `eden-map.js` from 1535 lines to ≤800, extracting four modules: `loot-flow`, `chars-flow`, `root-store`, `host-api`;
  - lower the ledger;
  - do **internal-only** renames per `docs/naming.md`: module files, duplicate-name files, `window.TC*`, short-name globals, pinyin names. Use scripts for the bulk rename and finish with all tests green;
  - external contracts stay untouched, left for S10.
- **Stage A acceptance**:
  - the ledger of card terms in engine code is zero;
  - the minimal, town and Eden packs all run;
  - probes `accept`, `pack_town`, `v096`, `webgl_single_ctx`, `chars092`, `roster095` are all green.

### Stage B: real tavern test ①

I produce a 5-minute checklist and you test with the Eden card in the tavern; problems found are fixed first.

### Stage C: experience and extensions

~~Status line: S6, S7 (S7-1…S7-3), S8 (S8-1…S8-4b), S9 (S9-1…S9-3) and S9b are done and the stage was accepted by C-ACCEPT~~ ✅ 2026-10-02 (probe sweep `docs/plans/stage-c-probes.md`, screenshots, main synced; open tails are todo I-30, I-31, I-32 and E-13).

- **S6 Entity protocol + drawer** (about 12h):
  - tab registry `app/tabs.mjs`;
  - the characters tab adapts to the level: at micro levels show only people present at the same node, at macro levels group by the node tree;
  - unified item store `eden_map.stash`: old data migrates automatically, plus a "recompute from the chat log" reconciliation test;
  - a new "Items" tab in four groups: carried / here / other places / in-card inventory (read-only);
  - add "获得 / 得到 / 拿取" (obtain / get / take) to the pickup vocabulary (strict sentence patterns only), support per-pack extension, and add false-positive tests.
- **S7 Tactical HUD + layers greyed out by applicability** (about 10h):
  - glass tokens with day/night variants, the z-index ladder merged into `tokens.css`, and the host page and `map/ui/*` all go through tokens;
  - Dark Frost Glass applied uniformly to the clock capsule, top bar, layer popover, toolbar, drawer and settings page;
  - layers get `applies()`: when inapplicable they are greyed out with a hint, and rAF is paused;
  - ⓘ / (i) / U21 click-through: re-check with a probe and fix if it reproduces.
- **S7-3 One shell for 2D and 3D** (added 2026-10-01, user request, after S7-2; `docs/todo.md` N11): the estate 3D viewer joins the main shell (top bar, rail, shared place / room / character card), shows located characters as tokens in rooms, uses the same design tokens, and reads its title, floors, room kinds, colours and labels from pack data; occluded labels hidden.
- **S8 Declarative layers: authors add their own layers** (about 16h):
  - `layers` data is rendered by generic building blocks: point / area / line / label / tint / particles / move-along-line;
  - data sources can be: data files, events, characters, items, schedules, MVU variables (read-only);
  - Eden's existing layers move onto this mechanism;
  - local extension `EdenMap.addLayer()`;
  - acceptance: town adds two layers, "patrol route" and "danger zone", with data only, and the new probe `pack_layers` passes.
- **S9 Zero-config safety net + unified script + runtime card adaptation** (about 18h):
  - **Unified script**: only one generic TavernHelper script is shipped. A pack is resolved in this order, moving to the next only if the previous yields nothing:
    1. a pack embedded in the card: the card's `extensions.spatial_os`, or an entry in the card's worldbook with an agreed title;
    2. `packs/index.json` matched against the current card by the `match` field;
    3. a pack URL the user enters in settings, or an imported local pack file;
    4. none of these → tier-0 automatic.
  - **Eden is no longer shown by default**.
  - **Runtime card reading** (uses the same `cardInfo` bridge as the "copyright notice" page; read-only, local only, nothing uploaded):
    - worldbook entry titles and trigger words → node candidates;
    - MVU initial variables / structure (the card's extensions, `[initvar]` entries, the shape of the current `stat_data`) → fill in `vars` and character attribute fields automatically;
    - locations in the opening message → start node;
    - the card's language → pack language.
  - The automatically derived result is stored in a chat variable and stays stable within the same chat.
  - **"Export as pack"**: export the current auto-adaptation result plus the user's manual edits as v2 pack JSON. The author fine-tunes it, or embeds it straight back into the card.
  - Acceptance: new probe `autopack` — open an unfamiliar card, a schematic appears automatically, locations land, characters and items work; an exported pack imported back gives the same result.
- **S9b In-viewer editing + any image as base map** (about 10h):
  - **Edit mode** (Settings → Advanced, off by default): drag node positions, change parents, add aliases, then export. It replaces the developer practice in the README of "paste code in the console to read coordinates".
  - **Any image as base map**: drag in a PNG/JPG and OSD loads it as a single image source, **no DZI slicing needed**; `make_dzi.py` is recommended only for large images.
  - Acceptance: new probe `pack_editor` — from tier 0 all the way to "a pack with a base map and coordinates" without writing a line of code or opening a terminal.

### Stage D: real tavern test ②

The Eden card plus one other card (to verify the safety net).

### Stage E: pre-release tidy-up (re-confirm each item before starting)

- **S10**: second rename batch, per the external-contract column of `docs/naming.md`: entry file names, message names, storage keys, Chinese chat-variable keys → ASCII, `EdenMap` / `__tcPack`. With a one-time migration. Afterwards, move the Eden data into `map/packs/eden/` and then split into two repositories.
- **S11 Rewrite the skill + one-click card-reading tool**:
  - new tool `tools/card_to_pack.py`: `clean_card` cleaning → automatically produce a v2 pack draft (nodes, `vars`, character fields, event category candidates, language), with an "unable to infer" report modelled on `clean_card`'s reconciliation report. It shares one rule set with S9's runtime card reading, and both sides have parity tests;
  - the skill is written in English with a Chinese edition. The flow has three tiers: tier 0 automatic → tier 1 `card_to_pack` + in-viewer editing → tier 2 realistic base map + 3D;
  - not tied to a specific AI or tool: no assumption of sub-agents, and Blender is optional;
  - neutral content, keeping only one checkpoint, "original author's permission";
  - our own internal rules (the image-review persona, the worldbook sync rule…) move to the Eden pack repository.
- **S12** (optional): translate code comments into English;
- **S13**: wrap-up — finalise `ARCHITECTURE.md`, CHANGELOG, `todo.md`, handoff, memory.

**Effort**: stage A about 57h (including the naming audit and the renames in S5), stage C about 66h (including the S9 extension and S9b), about 123h in total; stage E is counted separately.

---

## 6. Version numbers / push / two-line sync / render line

- **Version number**: untouched during the refactor; each push only bumps a "head #N" build number, roughly every 2–3 items; CHANGELOG is appended to the 0.9.8 section. After the refactor a new series `S2:0.1.0` opens as the first Spatial OS release; after the repo split the engine and the Eden pack are versioned separately.
- **Two-line sync**: both lines push to `preview`, and the push script does fetch + rebase first. S2 / S3 / S4-3 edit `maps.json` and manifests, so during that time the render line pauses shipping landmarks (rendering itself continues); the S10 move waits until both lines are idle.
- **New render-line rules**:
  1. Mac: draft → self-check → 64 spp final preview, look locked; fixes happen only on the Mac, never trial-and-error on the cloud.
  2. Cloud: only locked high-spec jobs; jobs are collected into a batch, you are reminded to power on, and after 30 idle minutes it shuts down automatically (`idle_guard`).
  3. Supporting change: `render_queue.sh` gets two actions, hold / release-batch; the old memory "cloud never shuts down" is void.
- **To handle right away**:
  - today's 16:26 `estate_final` failed on the cloud (Connection closed / no project files on the cloud), is parked as `.retry`, and the resident dispatcher (PID 674) will retry forever — please confirm the state of the cloud instance;
  - the main working tree still holds uncommitted render-line products, which the render line must commit itself.
- **Render to-do order**:
  1. manor bake optimisation + re-run final;
  2. review for the three glb files, two refinements for the Holy Mountain;
  3. the remaining 5 markers of the Holy City, plus the Five Seats and the Wilds;
  4. upper layer v18 (decide first: redo on the new main line, or pick from the archive);
  5. the rest is queued after stage C.
  - During the refactor the render line stays low-intensity, roughly one batch per week.

## 7. Execution rules

- **worktree**: `git fetch`, then `git worktree add -b spatial-os <scratchpad>/wt-spatial origin/preview`; do not touch the main working tree.
- **Commits**: one commit per sub-step, English messages, `git -c user.email=kcgoofee-jpg@users.noreply.github.com commit -F msg`, no Co-Authored-By.
- **Push**: `bash tools/push_preview.sh --head --no-escalate`; after pushing check CI with `gh run list --branch preview -L 1`.
- **Pace**: serial, at most 2 agents; stop the services you started when finishing.

## 8. Verification

```bash
node --test tests/*.test.mjs
bash tools/smoke.sh
python3 tools/check_architecture.py && python3 tools/test_architecture_gate.py
python3 tools/check_maps.py && python3 tools/check_pack.py
git grep -nE '母畜|挤奶|庄园|伊甸|天城|外界知情|网络攻击|tiancheng' -- map ':!map/packs' ':!map/data' ':!map/estate' ':!map/props/*/**' ':!map/art/**' ':!map/_proto/**' ':!map/section.js' ':(exclude,glob)map/*.html'   # 0 at the end of stage A; smoke gate: tools/check_stage_a_grep.py (allow-list tools/stage_a_grep_allow.txt, S10 lines only)
```

- **Existing browser probes**: `accept`, `pack_town`, `v096`, `webgl_single_ctx`, `chars092`, `roster095`, `p5_sandbox`, `p6_action`, `e7_host`, `th_adopt`.
- **New probes**: `topo_dairy`, `drawer_stash`, `hud_layers`, `pack_layers`, `autopack`, `pack_editor`.
- **Screenshots**: one set each for dark and light themes, at 1440 and 375 resolution, copied to `~/eden-map-review/`.

## 9. Still missing after this (outside this plan)

- dedicated views such as the 3D cross-section still need code (generalise in v2);
- new packs cannot automatically produce a realistic base map;
- the ledger's npc / events domains have no write path;
- automated tests in a real tavern.

## 10. Author walkthrough: where an author holding the clean OS + skill would get stuck

Walking through the current skill (`skills/card-map/SKILL.md`) and tools:

| Step | Where it gets stuck now (hard-coded or high barrier) | How to change it (quick adaptation without a big rewrite) | Related step |
|---|---|---|---|
| Onboarding, publishing | A pack must go into a GitHub repo, be served through jsDelivr, and a dedicated script is generated per commit with Python; `ship.sh` only knows Eden; one tavern can only open one map script | Unified script; a pack can be embedded in the card, or a URL entered, or a local file imported; a pack is picked automatically per card | S9 |
| Reading the card | Needs 5 reader sub-agents + a line-coverage check, a heavy flow specific to Claude Code | `card_to_pack.py` produces a draft and an "unable to infer" report in one go; the tavern can also read the card automatically at runtime | S9, S11 |
| Layers and places | `draft_pack_from_card` needs you to hand-write `--layers 上层,中层,下层` (upper, middle, lower layer — Eden's shape), the place-recognition regexes only know Chinese, and anything that cannot be assigned a layer must be moved by hand | The node tree needs no predefined layers; parent-child relations are inferred from patterns like "A·B" and from the worldbook structure; the vocabulary switches with the pack language | S1, S3, S11 |
| Coordinates | Scatter points at random first, then paste code in the browser console to read coordinates | The schematic view needs no coordinates at all; drag in the viewer and export | S9b |
| Base map | By default it needs Blender modelling and rendering, the highest barrier | Default to the schematic; any image can be the base map with no DZI slicing; Blender is left for authors who want realistic results | S9b |
| MVU variables | Field slots are hard-coded for Eden (rank / core value / codename / outside awareness / accessories…); the roster guesses by position, "table 1 = members, table 2 = targets" (`mvu.mjs:235`) | The author defines the `entities` field list; it is generated automatically from the card's initvar / structure | S1, S4, S9 |
| Events | You must write categories and worldbook rules yourself; the default categories and vocabulary are Chinese | With no categories written, generic neutral categories are used; injection templates and worldbook rules are generated automatically by `lang` | S1, S4 |
| Layers | New layers cannot be added | Declarative layers | S8 |
| 3D | Optional, already data-driven (manifest) | Unchanged | — |
| UI wording, theme | `strings` can change wording; theme and legend are hard-coded | Theme, legend and credits all go into the pack | S4 |
| Worldbook | The book-name prefix is hard-coded as 「伊甸地图·」 ("Eden Map ·"); the builder is Eden-only | The book name follows the pack; a generic builder | S4, S11 |
| The skill itself | Carries our internal rules (copy names verbatim, the Opus image-review persona, stop and ask at every step) | Neutral content, not tied to a specific AI, three-tier flow, only one authorisation checkpoint | S11 |

**Conclusion:** once this is done, the author's shortest path is:

1. import the unified script;
2. open their own card, and **a schematic map appears automatically**;
3. drag things around and rename in the viewer;
4. click "Export as pack";
5. embed the pack back into the card, or publish a URL.

The whole flow avoids the terminal and GitHub. Only making a realistic base map and 3D requires entering tier 2 of the skill.

## 11. Prompts for Sonnet: a fixed skeleton + detail adjusted per step

- **Fixed skeleton**: every prompt uses the same set of sections, easing your review and my review of what Sonnet hands back.
- **Detail adjusted per step**:
  - design steps (S1, S3, S8, S9) are written close to a specification, about 150–300 lines;
  - transport steps (S4 wording, S5 renames) come with a mapping table;
  - small fixes get a few dozen lines.
- **"Detailed" means precise, not long**: state the exact files and line numbers, before and after, acceptance assertions and when to stop. Long explanations and repeated rules dilute the point and create contradictions.
- **General rules are not repeated in prompts**: when Sonnet runs in the repo it reads CLAUDE.md automatically, plus `docs/ARCHITECTURE.md` and `docs/naming.md` after S0. A prompt contains only what is "specific to this step", plus pointers to "read these first".
- **One prompt equals the amount for one push** (2–3 items). It must end by stopping and reporting; it must not carry on to the next step by itself.
- **Report language**: Sonnet writes a short English report per CLAUDE.md; once you paste it back, I give you a Chinese reading and the next prompt.

Prompt skeleton (sent to Sonnet in English; each comes with a short Chinese note for you):

```
# Task <S-id>: <one-line goal>
## 0. Why (2–4 lines of context; link the plan section)
## 1. Read first (exact files + line ranges; docs/ARCHITECTURE.md, docs/naming.md once they exist)
## 2. Scope — IN (numbered) / OUT (explicit non-goals: do not touch …)
## 3. Setup (worktree command; baseline: node --test + smoke must be green before any edit)
## 4. Tasks (numbered; per task: files, exact change, before→after, functions to reuse)
## 5. Constraints (task-specific red lines on top of CLAUDE.md)
## 6. Tests to add (file names + the assertions they must make)
## 7. Verify (exact commands + expected result)
## 8. Commits & push (commit boundaries + English messages; push command; CI check)
## 9. Stop and report instead of guessing when … (parity mismatch, schema ambiguity, push rejected, test count drops)
## 10. Report format (≤10 lines English: done / tests / open questions / file paths; cleanup confirmed)
```

## 12. CLAUDE.md and the state of the folders (added in v7)

### 12.1 Problems with CLAUDE.md

`CLAUDE.md` and `AGENTS.md` are both symlinks to `docs/agent-brief.md`, so there is only one copy of the content, which is right. The problem is the content itself:

1. **State was written into the rules page and is stale**: "HEAD `1bdf113`, working tree clean, just landed `f6ef639`" is the state of 09-29. HEAD is now `4284d3c` and the working tree is not clean. Every new session reads stale state.
2. **Some rules conflict with the new decisions**:
   - "Copy names verbatim from the card" conflicts with D1: engine and wording are neutral, and the card's original names live only in pack data.
   - "Fully automatic, no waiting for the user's nod" conflicts with the current way: one prompt does one stretch of work, then stops and reports.
   - "Always use `blender_run.sh` for Blender" and "never call `blender_run.sh` directly, go through the queue" fight each other.
   - The cloud "never shuts down" conflicts with the new "batch up to the cloud, auto-shutdown when idle".
3. **Duplicates**: pushing is written twice (one Chinese, one English, both about `push_preview`); tests twice; report format twice.
4. **Engine rules, Eden content rules, render rules and workflow are mixed together**, so it is unclear which will belong to the clean OS later and which only to the Eden pack.
5. **The module map is one long Chinese run-on paragraph** and is already incomplete: `ledger`, `pickup`, `spatial`, `navigator`, `ops` and others are not listed, and it will go further stale after the S5 renames. It should move to `docs/ARCHITECTURE.md`.
6. **Mixed Chinese and English**: per the language policy English is canonical, but you must be able to read it.

**The fix (part of S0.1, a "rewrite" rather than a patch)**: the new `docs/agent-brief.md` (CLAUDE.md remains a symlink to it) is written in English, kept to about 80 lines, **rules only, no state**. Nine sections:

1. What this repo is, and the reading order: `ARCHITECTURE` → `naming` → `todo` → `handoff`.
2. Engine iron rules (Spatial OS):
   - zero business terms;
   - a may-only-shrink ledger;
   - one-way reconciliation;
   - silent self-healing;
   - the chat log is the only truth;
   - never write the card's `stat_data` and never write the user's worldbooks;
   - no academic citations in source.
3. Workflow:
   - worktree;
   - one git command per line;
   - English commits, a fixed email, no trailer;
   - push in batches and check CI afterwards;
   - stop and report after every prompt;
   - clean up when finished.
4. Tests: which to run.
5. Document conventions: language policy, strikethrough format, report format.
6. Render line:
   - only through the queue;
   - Mac first for drafts and final previews;
   - cloud in batches, auto-shutdown when idle;
   - render guard;
   - new landmarks go through `landmark.py`.
7. Eden pack content rules: the card's original names in pack data, the content boundary, only what the card has (DLC), the original author's credit. After the repo split this section moves as a whole to the Eden repository.
8. Environment pitfalls: the `cat` / `ls` aliases, non-ASCII paths, no `sleep` polling.
9. Where state lives: only links to `docs/handoff.md` / `docs/todo.md`; this page carries no state.

Also:
- Produce a Chinese edition `docs/agent-brief.zh.md` for you to read.
- Add a check to smoke: the section headings of the Chinese and English editions must correspond one to one, to prevent the two from drifting apart.
- Update the related memories in sync: `card-canon-names`, `cloud-keep-on`, `mid-tier-autonomous`.

### 12.2 Folders and paths outside the repo: which ones affect the work

| Observation | Impact | Handling |
|---|---|---|
| Scattered worktrees: `../eden-art` (merged), `.codebuddy/worktrees/webgl-part3` (merged), `../eden-campaign` | **`eden-campaign` holds unmerged work**: the Part 4-4 ambient soundscape engine (ambience); commit `fb039ad` only committed the wiring in settings, storage and i18n, while the real `map/app/ambience.mjs`, `core/ambience.mjs` and `tests/ambience.test.mjs` are still **untracked files**, absent from preview and not registered in `todo.md` | **S0.5 (about 1h)**: first rescue the ambience files onto a branch and register them in `todo.md`, and you decide whether to merge or discard; the two merged worktrees are simply deleted |
| 64 files under `docs/`, 74 directories under `docs/reviews/`, `docs/history`, and void rules | They mislead agents: old rules are sometimes taken for current ones | No bulk cleanup of history. `docs/README.md` marks a list of "current documents" (`agent-brief`, `ARCHITECTURE`, `naming`, `todo`, `handoff`, `cloud-render`, `versioning`…), and everything else counts as history; at the repo split the history goes wholesale with the Eden repository |
| Large files: `docs/drafts` 179 MB, `docs/reviews` 66 MB, `map/art` 555 MB, `map/props` 134 MB | No functional impact, only slower clones | Handled at the S10 repo split: the clean OS repo simply does not carry them; whether to slim the Eden repo is your call then |
| Prototype pages: `map/world_draft1/2.html`, `tiancheng.html`, `section.js`, `_proto/`, `shots/`, `_test_events.html` | Mis-scanned by scanning tools, distracting agents | The S0.3 watchdog lets them through first; S10 moves them into the Eden repo's `archive/` |
| Paths outside the repo: `~/eden-map-review/`, `~/Downloads/酒馆/草稿`, `~/Downloads/酒馆/脚本`, scratchpad, `/tmp/eden_wt_*`, the tavern (TT) data directory, cloud directories | The clean OS must not hard-code the author's local paths | When S11 builds `card_to_pack`, these tools' default paths become parameters or environment variables (something like `SPATIAL_OS_OUT`); only Eden's own scripts keep your local conventions |
| `worldbook/` (repo root, ignored), `.agents`, `.pi`, `.codebuddy` | All are local directories of other agent tools; no impact | Stay ignored, no action |

**Conclusion**: only two things affect the work — the stale CLAUDE.md, and the unmerged ambience. Both are done in S0; the remaining tidy-up all happens in passing at the S10 repo split and is not worth separate time now.

## 13. Plan into the repo, todo rebuild, test and feedback protocol (added in v8)

### 13.1 Plan into the repo + todo rebuild (folded into S0, about 3h)

- **S0.0 Plan into the repo**: this plan currently exists only in `~/.claude/plans/`, and **Sonnet in other conversations cannot see it**. So:
  - it goes in as `docs/plans/spatial-os.md` (English, the formal basis) + `docs/plans/spatial-os.zh.md` (the Chinese edition of this text);
  - also create the execution log `docs/plans/spatial-os-log.md`, append-only with old content never edited, set to the same union merge as CHANGELOG.
- **S0.6 todo rebuild**: `docs/todo.md` currently mixes four kinds of things — old plans (`ui-v2 spec`, U1–U12, Parts 1–9, the tail of the LLM campaign), items done but not struck through (the Part 5 3D pickups, `clock` not wired up, Part 8 is in fact all done), the Eden content line, and items awaiting decision. **Strikethrough alone can no longer sort this out.** Approach:
  1. Archive the whole file unchanged, word for word, to `docs/archive/todo-2026-09-30.md` (history is not lost).
  2. The new `docs/todo.md` is structured as:
     - §0 Spatial OS campaign: S0–S13 tracked item by item, the **only basis**;
     - §1 Infrastructure: real-tavern automated tests, CI `browser-smoke`, holes in `ship.sh`, the world map not being reproducible;
     - §2 Eden content line: rendering and card omissions;
     - §3 Awaiting your decision;
     - §4 Done (evidence kept).
  3. **Migration mapping table**: every unfinished item in the old file must state its new destination, of only five kinds —
     - merged into S×  (e.g. U19–U23 and the 3D (i) → S7; `registerOverlay` → S8; `here` resolving only 54/55 → S3; the `eden-map.js` split → S5);
     - moved to §1 / §2;
     - shelved (e.g. workshop, city rhythm, causal links, true 3D upper layer, depth P2 → deal with them after the first OS release);
     - to be verified (verify first, strike through if confirmed done);
     - void (with the reason).
  4. The mapping table goes at the end of the new `todo.md`, with **line-by-line one-to-one correspondence**, so that not one old entry disappears silently.
  5. The top of `docs/handoff.md` is changed in sync to "for status see `todo.md` §0 + the execution log".

### 13.2 Which card to use for real tavern tests

- **Stage B uses the Eden card**: this round is a regression test and must prove the refactor did not break mature features. Only the Eden card has real MVU data and story; the minimal pack has no card to pair with in the tavern.
- **Stage D uses the Eden card + one other card**:
  - the Eden card gets a full regression once more;
  - the other card ideally ships its own MVU variables, to verify the tier-0 automatic map and automatic pack selection by card;
  - the minimal pack is loaded by the unified script and gets a smoke run.
- **The minimal kernel relies mainly on automated tests**, not on your manual testing: node tests + browser probes (`kernel_minimal`, `autopack`, `pack_editor`).
- **Manual testing covers only what automation cannot reach**: TT / WebKit host behaviour, real MVU data, performance and heat, visual feel.

### 13.3 Sonnet execution results: one format, so you need not shuttle screenshots

The end of every prompt asks Sonnet to do two things:
1. append the same result block to `docs/plans/spatial-os-log.md` and commit it, so **I can read it straight from the repo**;
2. print it verbatim once in its own conversation.

You only need to tell me "S2 is done", or paste the result block — either one. **No screenshots.**

```
=== RESULT S<id> ===
status: DONE | PARTIAL | BLOCKED
items: <each prompt item id> ✓/✗
commits: <sha> <subject>   (one per line)
pushed: head #<N> | not pushed
tests: node <pass>/<total> | smoke PASS/FAIL | arch PASS/FAIL | probes: <name>=PASS/FAIL …
deviations: none | <what differs from the prompt and why>
blocker: none | <verbatim error, first 20 lines> / <what you tried> / <options A, B>
open: none | <questions that need a decision>
cleanup: done
=== END ===
```

- When something goes wrong use the same format: `status: BLOCKED` plus a `blocker` field, and **no guessing your way forward**.

### 13.4 Real tavern test / UI feedback: one folder + one reply template

1. **I produce a numbered checklist first**: one per stage, numbered like `B-01`, `B-02`…, each stating "how to do it → what you should see", at most 10–15 items per round.
2. **Your reply only fills in the template** (write only the problems; if everything passes, write one line):
   ```
   阶段：B    构建：head #___（设置 → 关于）    设备：Mac TT / iPhone TT    主题：深色/浅色
   结果：全部通过 ｜ 除以下各项
   B-03 ✗ <one sentence: what you did → what you saw>   图：B-03a、B-03b
   B-07 ? <not sure whether it is a problem>
   X-1  <a new finding outside the checklist>
   ```
   (Template field labels, in order: stage, build (Settings → About), device, theme; result: all passed | except the items below; 图 = figures.)
3. **Screenshot conventions**:
   - **do not paste screenshots into the conversation**; put them in `~/eden-map-review/tt/<stage>/` named by item id (`B-03a.png`). I read the originals in that folder directly.
   - capture the whole map panel including the top bar (the build number shown there confirms which version it is).
   - one image states one problem. For interaction or animation problems use a before/after pair, or record a short video (`.mov`).
   - add `-m` to phone image file names, and `-l` for the light theme.
4. **Diagnostic logs use the map's built-in "Feedback" button**:
   - click "Download .txt" and save it into the same folder, one per test run.
   - it contains: version, build number, self-check results, map state, TH / ST versions, viewport, and a ring buffer of logs.
   - it has a privacy firewall and **contains no chat content**.
5. **A chat export is needed only for "recognition" problems** (a place not recognised, an event not put on the map, a pickup not booked, wrong characters): export that chat's `.jsonl` in the tavern into the folder and write the floor number in the reply. I reproduce it locally with `tests/session_replay.test.mjs`. Such files stay on the local machine and are **never committed**.
6. You do **not** need to copy the AI's replies into the conversation; the floor number is enough.

### 13.5 Preventing omissions (model attention)

- **Everything is numbered**: prompt items, checklist items and feedback items all have numbers. I answer number by number with a table (fixed / cannot reproduce / need more info / shelved), and end with a coverage line: "received N, handled N, missed 0".
- **Not left only in the chat**: every new finding is written into `todo.md` at once (with a number), and execution results into the execution log. When the conversation changes or context is compressed, the state is all in the repo.
- **Read originals, not paraphrases**: I read screenshots, feedback `.txt` files and `.jsonl` files directly as files, not from pasted snippets.
- **Small batches**: at most 10–15 feedback items per round, 2–3 items per prompt; split if there are more.
- **Closed loop**: Sonnet's result block echoes each item number from the prompt; when I review I reconcile by number, and if something is missing I write a supplementary prompt on the spot.

## 14. Effort measure + model and reasoning tiers + GitHub slimming (new in v9)

### 14.1 Effort is estimated by "size tier + number of prompts", not by hours

Hour estimates are inaccurate: for the same job, model speed and the number of rework rounds differ hugely. Use the following two quantities, which can be counted:

| Tier | Criterion | Can one prompt finish it |
|---|---|---|
| **S** | ≤5 files, ≤200 changed lines, unit tests only | 1 prompt |
| **M** | 5–15 files, ≤600 lines, 1–2 probes to add | 1 prompt |
| **L** | 15+ files, or touches a cross-module contract / data, needs parity tests | split into 2–3 prompts |
| **XL** | New contract / new schema / architectural trade-off, needs judgement | Opus produces the design first (1 session), then it is split into L/M pieces for Sonnet to implement |

**Whole-plan estimate (stages A–D)**: about **32** Sonnet prompts, about **7** Opus design / review sessions, plus 2 rounds of real tavern tests. Progress is counted as "how many prompts are done".

### 14.2 Reasoning tiers: by task category, not uniform

Based on the official page (anthropic.com/claude-sonnet-5-5, consulted 2026-09-30):

- There are five tiers: Low / Medium / High / Xhigh / Max. Claude Code defaults to Medium.
- The official wording on tiers: low tiers are "faster and cheaper in tokens, suited to routine work"; high tiers "reason for longer and check their own work more thoroughly".
- The official division of labour between the two models: Sonnet 5.5 is "best at well-scoped everyday tasks and bug fixing"; Opus 5.5 is "clearly stronger on complex open-ended tasks that need sustained judgement"; Sonnet "pairs best with Opus when run at a lower tier".

Accordingly, four categories:

| Category | Examples | Model · tier |
|---|---|---|
| **Design / contract / judgement** | S1 kernel contract; S8 layer schema; S9 auto-adaptation design; S10 migration plan; reviewing results Sonnet hands back; triaging tavern test feedback | **Opus 5.5 · High** (S1 uses **Xhigh**, because everything is built on it) |
| **Implement to spec (multi-file, with parity tests)** | S2, S3, sub-items 1–3 of S4, the S5 split, S6, S7, S8 / S9 implementation, S9b, the S11 tool | **Sonnet 5.5 · High** ("checking its own work" matters most for a refactor) |
| **Mechanical transport** | S4-4 neutral wording, S5 first rename batch, S0.6 todo migration table, document sync, re-running the worldbook builder | **Sonnet 5.5 · Medium** |
| **Small fixes / running commands** | S0.5 rescuing ambience, single-file patches | **Sonnet 5.5 · Low or Medium** |

- **The Max tier is not a regular option**: only when the same step gets stuck twice in a row do we escalate to Xhigh / Max and redo it.
- **State it on the first line of every prompt**, e.g. `Model: Sonnet 5.5 · Effort: High · Size: M`. When you open a new session, set the model / tier selector to match that line, then paste the prompt.

### 14.3 Size and tier per step

| Step | Size | Sonnet prompts | Model · tier |
|---|---|---|---|
| S0.0 plan into repo + S0.1 rewrite `agent-brief` | M | 1 | Sonnet · Medium (I give the full body text in the prompt) |
| S0.2 `ARCHITECTURE` + S0.3 watchdog ledger | M | 1 | Sonnet · High |
| S0.4 naming audit | M | 1 | Sonnet · High produces the draft table → Opus reviews |
| S0.5 rescue ambience + delete old worktrees | S | 1 | Sonnet · Low |
| S0.6 `todo` rebuild | M | 1 | Sonnet · Medium |
| S1 kernel contract v2 | XL | 1 design + 2 implementation | Opus · Xhigh (design) → Sonnet · High |
| S2 node tree + milking hall | L | 2 | Sonnet · High |
| S3 geography unification (parity) | L | 3 | Sonnet · High |
| S4 special-case sweep + wording | L | 4 | first 3 Sonnet · High; the wording one Medium |
| S5 file split + renames | L | 3 | split High; renames Medium |
| S6 entities + drawer + items | L | 3 | Sonnet · High |
| S7 HUD + layer greying | L | 2 | Sonnet · High; screenshots viewed by Opus |
| S8 declarative layers | XL | 1 design + 3 implementation | Opus · High → Sonnet · High |
| S9 safety net + unified script + card reading | XL | 1 design + 3 implementation | Opus · Xhigh → Sonnet · High |
| S9b editor + any base map | L | 2 | Sonnet · High |
| S10 / S11 (stage E) | XL / L | counted separately | Opus plan → Sonnet |

### 14.4 Should GitHub be slimmed

**Current state**:
- `.git` is about 535 MB packed;
- in the working tree `map/art` is 555 MB, `map/props` 134 MB, `docs/drafts` 179 MB, `docs/reviews` 66 MB;
- the history also holds about 63 MB of temporary files committed by mistake (registered in `todo` §3).

This size works fine and only makes cloning slow, so **it blocks nothing now**.

**Conclusion: slim it, but do it together with the S10 repo split, not separately**.

- **The new `spatial-os` repo is slim from birth**: history is split out from the engine directories only (`git subtree split` / `filter-repo`), expected to be only a few MB. No base maps, drafts or review screenshots.
- **The Eden repo**:
  - delete the process images in `docs/drafts` and `docs/reviews`, and those two temporary files, from history. Move the originals to the local `~/eden-map-review/` archive, or attach them to a GitHub Release.
  - the `map/art` tiles and `map/props` glb files **must stay in git**, because jsDelivr serves the CDN by repo file path; unless we later switch to the npm channel (`tiancheng-map-assets` already exists).
- **Rewriting history needs a force push**: done once, when all agents are idle. You already agreed to force-pushing history on 2026-09-28, but I will confirm once more before doing it. Afterwards the rule reverts to "never force-push".

## 15. Render campaign R and pipeline upgrade R2 (added 2026-10-01)

### 15.1 Render campaign R (running)

A separate line that renders every Eden-pack place and base map to final quality. It is Mac-only (`logs/queue/MAC_ONLY`; nothing goes to the cloud). State lives in the repo: the item ledger `docs/plans/render-campaign.items.json`, append-only events in `docs/plans/render-campaign-events.csv`, both driven by `tools/render_campaign.py`; `docs/plans/render-campaign.md` is the generated status. Two lanes run in parallel: **standard** (estate, model reviews, landmarks, scenes, base maps, period variants) and **hero** (the user's own estate island, upper-layer islands and base map, the three hero landmarks, the world base map). The user reviews only the user's own estate (item `eden:r5`, stage `user-review`); everything else passes the automatic gates. The worker prompt is `docs/plans/render-loop.md`; the render queue arbitrates the Mac (`docs/cloud-render.md`). Items that edit `maps.json` or pack manifests wait while S2 / S3 / S4-3 are in flight (agent brief section 6).

### 15.2 R2 render pipeline upgrade (scheduled after the standard lane empties)

Not started. Each item is a separate prompt:

- **Guard misreport fix**: the render guard has reported `status=ok` for a run that died mid-way; make it verify the output file and the exit state instead of trusting the log tail.
- **Clay-geometry stage**: a fast untextured render of the scene geometry before the textured draft, so a shape problem is found in seconds.
- **Region-study stage**: render and compare only a cropped region with a fixed camera, for look development on one building (extends `tools/region_patch.py`).
- **Optional official Blender MCP connector** for live scene inspection (Blender Lab; Blender 5.1 or newer). It is agent-agnostic because it speaks MCP. Prerequisite: the GPU lock must stop counting a user's open Blender window (lock file instead of `pgrep`). The pipeline stays headless; the connector is for looking, not for producing final renders.
- **Asset-library and texture-scale guide**: one document listing the approved asset sources and the texel-density rule per asset class.

## 16. Leftover items scheduled (added 2026-10-01)

Every open `I-` / `E-` item of `docs/todo.md` gets a destination; parked items stay parked. `docs/todo.md` carries the same arrows line by line.

| Item | Destination |
|---|---|
| I-01 | B0 harness before stage B |
| I-02 | S4-1 (CI browser-smoke, after the probe baseline `tools/browser/known-failures.json`) |
| I-03 | world render inputs become ledger item `base:world`; the `ship.sh` dry-run holes go to S10 |
| I-04 | overlay events S8; English copy S4-4; npc / event write paths S6 |
| I-05 | shared context and legacy estate page S7; KTX2 closed (`estate:opt` skipped) |
| I-06 | S7 |
| I-07 | S5 |
| I-08 | S6 |
| I-09 | S4-3 |
| E-01, E-05 | S4-2 data and ledger |
| E-02 | new ledger item `fix:climate_tower` |
| E-03 | S8 |
| E-04 | closed (the final form is glTF) |
| E-06 | two new ledger items `inst:supreme_court`, `inst:tiancheng_univ` |
| E-07 | closed (`estate:opt` skipped) |

## 17. v10 re-plan: ship Eden first (2026-10-02)

Source: architecture challenge C1–C8 (review session, adopted by the user 2026-10-02 as D14–D21). Its evidence was taken on head #183; on head #277 S5, S7, S8, S9 and S9b were already done, so the order below starts from the real state.

Kept unchanged: the chat log is the only truth; never write `stat_data` or the user's worldbooks; zero card terms in the engine; the viewer only sends intents up.

| # | Step | Decisions | Size |
|---|---|---|---|
| 1 | U-FIX round 1 (done, head #278) → TT sweep-2 → further U-FIX until P0 / P1 = 0 | — | S–M each |
| 2 | ARCH-1: rule §2.6 rewritten, empty-catch ratchet, ARCHITECTURE §4 redrawn, documentation gates to warnings, language policy switched | D16, D17, D18 | M |
| 3 | INV-1: feature inventory (docs only) → user marks → INV-2 applies defaults off | D19 | S + S |
| 4 | DIST-1: China-reachable line (npm publish after the user's go) + slimming plan | D15, D21 | M–L |
| 5 | R1 spot check by the user → v0.9.8 Eden release | D14 | S |
| 6 | Parked until a second author or card needs them: stage E (S10 rename / split, S12, S13) and stage F (native extension); revisited after the release. The contract system and the Jev recognition backend stay post-release candidates. | D14 | — |

Render line: D20 (low intensity, one batch at a time) once the user confirms.
