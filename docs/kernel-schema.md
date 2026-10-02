# Kernel contract v2 — the node tree is the only geography

> Canonical English edition; Chinese edition: `docs/kernel-schema.zh.md` (same heading structure, gated by
> `tools/check_zh_mirror.py`; its first section is the review sheet for the user). Output of plan step **S1-design**
> (plan §0–§2, decisions D10 and D13). **Status: draft for the user's review. No engine code reads schema 2 yet.**
> Machine-readable contract: `map/data/schema/v2/*.schema.json`. Touchstone pack: `map/packs/minimal/`. Checks:
> `tools/check_pack.py` (schema-2 branch) and `tests/pack_schema_v2.test.mjs`. Schema 1 (`docs/pack-schema-v1.md`)
> stays frozen and keeps working through `map/core/compat-v1.mjs` (step S1-impl-2).

Every rule has a stable id `K-R01` … `K-R106`; later prompts and tests cite them. Ids never move: rules added after the
first draft (K-R63–K-R70, trust, limits and the overlay of a schema-1 pack) take the next free number wherever they sit; K-R71–K-R73
were added by S6-1, K-R74–K-R76 by S6-2, K-R77–K-R78 by S6-3; K-R79–K-R89 and K-R104 are for S8 (K-R79, K-R81–K-R83, K-R85 and K-R104 added by S8-1; K-R86–K-R89 added by S8-3; K-R80 and K-R84 added by S8-2), K-R90–K-R103 for S9 (planned lists at the end of §13); K-R105 was added by R0 (§5, the scene header); K-R106 by S9b-2 (§6.6, the media source). K-R107–K-R114 are for S8-4 (transit network and routing, `docs/transit-schema.md`; K-R107–K-R109 added by S8-4a, K-R110–K-R114 by S8-4b). The choices left to the user
are `K-01` … `K-09` (§0). Everything else was decided by the designer and is listed with its reason in §14.

## 0. Decisions for the user (review sheet)

The Chinese edition words these for review. The user answered on 2026-09-30: every recommendation was accepted (K-01 B,
K-02 B, K-03 A, K-04 A, K-05 A, K-06 C, K-07 A, K-08 B, K-09 C); the decisions are recorded in `docs/todo.md` §3 (Q-09)
and in the last cell of each row below.

| id | Question | Options | Recommended |
|---|---|---|---|
| K-01 | An event whose place matches no node: what happens? | A drop it (v1) · B keep it in the event list with no pin; it is never injected (it is near nothing) and merges by type + place text (K-R54) | B — the chat is the truth; hiding a real event is worse than an unpinned row · **Decided 2026-09-30: B (user accepted the recommendation)** |
| K-02 | Text names a broad place and a generic room word ("upper tier, the study"): where does it land? | A v1: the room counts only with its house named, or alone · B the room counts whenever the broad place contains its house | B — more specific, one rule (K-R22) · **Decided 2026-09-30: B (user accepted the recommendation)** |
| K-03 | Weak place words (today used only to guess an event's tier) also move the current location? | A yes, one rule for everything · B events only | A — one algorithm for every consumer (K-R24) · **Decided 2026-09-30: A (user accepted the recommendation)** |
| K-04 | The first pack's level switcher shows the estate beside the three tiers (today). Keep that shortcut? | A keep (`ui.levels`) · B drop, reach it from its marker | A — no visible change for the first pack · **Decided 2026-09-30: A (user accepted the recommendation)** |
| K-05 | Chat variable of new packs | A one per pack, `spatial_<id>` · B one shared `spatial_map` | A — two packs used in one chat never mix · **Decided 2026-09-30: A (user accepted the recommendation)** |
| K-06 | A card without a pack: which tables become groups of people? | A every name-keyed table, titled with its key · B v1 guess (1st table = members, 2nd = targets) · C only tables whose rows are objects with a place- or person-like field; the others can be switched on in Settings | C — an inventory or faction table keyed by name is not a list of people · **Decided 2026-09-30: C (user accepted the recommendation)** |
| K-07 | First pack content (S4): hang world cities under their realm (breadcrumb World › Realm › City)? | A yes · B keep them flat as today | A — "realm + city" texts then resolve to the city · **Decided 2026-09-30: A (user accepted the recommendation)** |
| K-08 | What a pack tells the model (its `llm` block): when does it go live? | A under the existing consent switch, like the kernel's own text · B packs not shipped with the engine need their own switch (default off), asked again when that text changes | B — a pack from a link can change what it says to the model; the user sees it once · **Decided 2026-09-30: B (user accepted the recommendation)** |
| K-09 | Pictures in a pack embedded in a card | A none (schematic views only) · B pictures stored inside the pack (within its 1 MB) · C B plus https picture links, loaded only while the remote-picture switch is on | C — a zero-code author can drop in a picture; remote loads stay under the user's switch · **Decided 2026-09-30: C (user accepted the recommendation)** |

Moved out of this sheet on review: "may a pack embedded in a card ship its own page (code)?" is not a user choice —
it would run arbitrary code on the tavern page; it is designer rule K-R36 / K-R63.

## 1. Principles

### 1.1 Shape is fixed, content is data

**K-R01 — The kernel fixes the shape; packs supply content.** The kernel owns the protocol, the core fields of every
entity, the algorithms (locate, merge, ageing, source priority), the rendering building blocks and the safety rules.
A pack only supplies content. A pack is data: the engine never executes anything from it — no scripts, no
expressions, no regular expressions — and never hands pack text to a host feature that would execute it (macros,
templates, regex keys: K-R65). Words in a pack are literal strings matched as whole words or substrings (K-R15; v1's
regex tables become word lists). What a pack may do also depends on where it came from (K-R63).

**K-R02 — Fixed forever vs author-definable.** Changing a left-column item needs a new schema number (K-R62).

| Area | Fixed by the kernel | Author-definable (pack data) |
|---|---|---|
| Space | node core fields and id rule; the locate algorithm (K-R17–K-R23); view kinds and frames; position rules | nodes of any depth with author-named types; aliases, hints, positions, views, level switcher |
| Time | deterministic clock advance (zero tokens); HH:MM parsing; band rule | MVU paths; period bands (names, starts, words, dark) |
| Characters | core fields `id`, `name`, `node`, `source`; source priority; the four field kinds | groups (label + source), attribute fields, avatar sources and hosts |
| Items | stash row contract; store key rule; ledger reconciliation; "the chat log is the only truth"; pickup strictness (verb + concrete noun) | world stash rows; pickup vocabulary additions and switch-offs |
| Events | tag grammar; level numbers 0–3; merge and ageing algorithm; content is never filtered; unknown → `other` | groups, types (label, alias, icon, colour, fx preset, life, inject), level labels, closing words, examples |
| Layers | the 10 slots and their order; rendering building blocks | declared layers (S8) |
| UI | design-token system; z-index ladder; accessibility baseline; the tab set | strings, accent and token overrides, legend, tab order, start node |
| Model interface | injection budget and degradation order; consent switch; only our own add-on worldbook is written | templates per language, worldbook rule entries, book name |
| Host | MVU / TavernHelper adapters; storage namespace rules; CDN routes; message protocol; trust by source (K-R63) | legacy names and CDN routes (packs shipped with the engine only) |
| 3D | the generic viewer and its manifest format | models, hotspots (view regions) |

### 1.2 Data rules

**K-R03 — Ordered things are arrays, lookup things are maps.** Anything whose order means something is an array of
objects with `id`: nodes, event groups, entity groups and fields, periods, layers. Anything only looked up is an
object keyed by id: views, event types, fx presets, per-language maps. Where array order matters, the rule says how.

**K-R04 — Keys and identifiers.** Keys are ASCII `snake_case`. Ids are ASCII (`^[a-z][a-z0-9_]*$` family). Display
text lives in values, in any language; card names are copied verbatim into values. Keys starting with `_` are
comments. Keys starting with `x-` are author extensions: carried verbatim, never read by the kernel (a later schema may
promote one to a real field). Both are allowed on the manifest, at the top of every block and on every item of a list
or id-keyed map (nodes, links, views, groups, types, fields, periods, stash rows, worldbook entries, the avatar block);
every other object is closed.

## 2. Pack layout and manifest

### 2.1 One document, blocks inline or in files

- A pack is one JSON document, `manifest.json`. Each of the nine blocks (`nodes`, `views`, `vars`, `entities`,
  `items`, `events`, `layers`, `ui`, `llm`) is written inline or given as a relative path to a `.json` file that holds
  exactly that block. The block schema is the same in both cases.
- A card-embedded pack (S9) is the all-inline form. Repository packs usually move large blocks into files.
- Paths are relative to the manifest's folder (the first pack is the exception: relative to `map/`, until S10 moves its
  data). They match `^[A-Za-z0-9_][A-Za-z0-9_./-]*$` with no `..` segment: no scheme, no leading `/`, no `%`, no
  backslash. After URL resolution a path must still lie under the pack's base, else it is dropped (K-R64). A pack
  embedded in a card has no folder; whether it may carry pictures is K-09.

### 2.2 Manifest fields

| Field | Required | Meaning | Default |
|---|---|---|---|
| `id` | yes | `^[a-z][a-z0-9_-]{1,31}$`, equals the folder name | — |
| `schema` | yes | `2` | — |
| `title` | yes | panel title, 1–80 characters | — |
| `lang` | no | language of the pack's own words (K-R07) | UI language |
| `version` | no | the pack's own version label | none |
| `i18n` | no | `{ <lang>: { title } }` | none |
| `match` | no | reserved for S9 (§2.3) | not auto-picked |
| `credits` | no | `card`, `pack[]`, `assets[]` (K-R08) | card fields read at run time |
| `legacy` | no | pre-v2 names (§11, K-R09); packs shipped with the engine only (K-R63) | names derived from `id` (K-R05) |
| `features` | no | feature switch overrides; packs not shipped with the engine may only switch off (K-R63) | derived from the blocks present |
| `cdn` | no | `repo` / `npm` asset routes; packs shipped with the engine only (K-R63) | engine routes |
| `lexicon` | no | per-language additions to the kernel word lists (K-R07) | none |
| nine blocks | no | inline or path | §12 |

**K-R05 — Names derived from the id.** Chat variable `spatial_<id>` (hyphens become underscores), storage prefix
`spatial.<id>.`, protocol prefix `spatial:`, event attribute `data-spatial-event`. Worldbook: our entries carry
`extra.spatial_id = "<pack id>/<entry id>"` (plus `spatial_ver`, `spatial_hash`); a sync touches only entries whose
`spatial_id` starts with its own pack id. The add-on book is named `llm.worldbook.book` (default: the title) plus a
fixed kernel suffix, so it can never be the card's own book (which the host names after the card); the kernel writes
only books ending with that suffix. A pack's `legacy` block overrides what is read (§11). K-05 is pending.

**K-R06 — Strict tools, lenient runtime.** Tools reject every schema, tree and reference error:
`tools/check_pack.py` for the checks it lists, `map/core/pack-v2.mjs validate2` for all of them (S1-impl-1). At run
time the kernel heals item by item and never drops more than it must:
1. Ids are repaired wherever an id is expected (node ids and every reference to one): lower case, every character
   outside `[a-z0-9_]` becomes `_`, and `n_` is prefixed when the result does not start with a letter.
2. An item that is still invalid is dropped; a field of the wrong type is dropped; unknown keys are ignored.
3. A block is replaced by its default (§12) only when its top-level type is wrong.
Every repair and drop is one entry in the self-check list (Settings), never a dialog: the panel never blocks and never
asks the user to fix a pack (brief rule 6). An in-viewer export always runs `validate2` and writes only a valid pack.

**K-R07 — Language.** `lang` chooses the kernel vocabulary: transit patterns, word-end suffixes, leading articles, the
head position (K-R21), closing words, pickup verbs, auto-discovery field names, the default taxonomy's labels and the
injection templates. The kernel ships `zh` and `en`; any other language uses the `en` kernel vocabulary. A pack adds
literal words per language in `lexicon.<lang>`: `to` and `from` (journey markers, K-R19), `articles`, `suffixes`,
`fields.<var>` (field names for auto-discovery, K-R38), `present` (words that mean "with the player", K-R41) and
`head` (`first` | `last`). Additions extend the kernel lists; they never remove from them. Matching itself is the same
for every language (K-R15, K-R17).

**K-R08 — Credits live in one place.** `credits` belongs to the manifest (it was also listed under `ui`; merged, one
place, because the pack picker needs it before any UI exists). `credits.card` may be filled at run time by the same
card-info bridge the credits page uses (name, creator, version); values written in the pack win.

### 2.3 Reserved for S9: match and embedding

**K-R90 — Pack resolution.** At start and on every card switch the host resolves one pack for the current card; the first
source that yields a usable pack wins: (0) the user's choice for this card, or a pack baked into the script; (1) a pack
embedded in the card (K-R91); (2) the best index match (K-R92); (3) the automatic pack (until it lands, a root-only
schema-2 pack named after the card, id `c_` + `fnv36(name + "\n" + avatar)`; with no card read at all, or with the index
unreachable, the legacy default). A refused source (`validate2` returns no pack, a fetch fails, a size limit) falls
through and leaves one entry in `window.__packProblems`; nothing blocks. The result is `{ id, source: choice | baked |
card | index | auto, trust: shipped | foreign, schema, manifest }`; `shipped` only for packs in the shipped index (K-R63).
When the result is the shipped pack whose id is `core/pack.mjs` `DEFAULT_ID` (the pack that owns the legacy names), no
`window.__tcPack` is set and the host starts exactly as before S9 (every name, key and injected text unchanged). The
user's choice is stored per card key (`k` + `fnv36(name + "\n" + avatar)`, `k0` when no card is read) under
`edenMapPackPick`. The gate resolves within 300 ms; over that it starts with the legacy default and corrects by a
restart. On a card switch it resolves again and, when the pack id or source differs, stops the running instance and
evaluates the entry again. Resolution reads only the card, the card's own worldbooks, the top-level keys of the chat
variables, the shipped index and the user's choice; nothing is uploaded.

**K-R91 — A pack embedded in the card.** Read, in this order: (1) `data.extensions.spatial_os` of the card — an object
holding the manifest with every block inline, or a string holding it as JSON; (2) in the card's own worldbooks (the
current character's primary and additional books; never a global or chat book) the first entry, in book and entry order,
whose title (`name`, older hosts `comment`) equals `spatial_os:pack` after trimming; its content is the JSON text. The
entry is read whether it is enabled or not (authors should disable it, so the host never sends it to the model). The
pack must be schema 2, all blocks inline, at most 1 MB, and passes `validate2` as foreign; an id equal to a shipped id
is refused (K-R63). The engine never writes the card or its books.

**K-R92 — The shipped index.** `map/packs/index.json` = `{ "schema": 1, "default": "<pack id>", "packs": [ { "id",
"schema", "title", "i18n"?, "match"? } ] }`, one row per shipped pack in display order; `match` has the manifest shape
(`card.name | creator | tags`, `worldbook`). For a schema-2 pack the row's `match` equals its manifest's; for a schema-1
pack the row is the only place that holds it (`tools/check_pack.py` checks the index). Score of a pack for the current
card: its chat variable present as a top-level key holding an object in the chat variables 100; a `match.card.name` word
in the card name (normalised, K-R17, substring) 10; a `match.card.creator` word in the creator 10; a `match.card.tags`
word equal to one of the card's tags 10; each `match.worldbook` title equal (normalised) to an entry title of the card's
own books 5. A pack is a candidate with at least 10 points; the highest score wins, ties by index order. *I-26:* the three `match.card` words count only when the pack lists no `match.worldbook` titles, or at least one of its titles is present (or its chat variable is); the author word shared by every card of an author can never open a pack alone. Words are
literal strings (K-R01). `default` is read only by the standalone viewer.

**K-R99 — Importing a pack.** From Settings the user gives an https URL or picks a file (message `eden-map:pack-pick`).
A URL is fetched with credentials omitted and no referrer, read with a streaming cap of 8 MB, parsed as JSON; a file is
read the same way. Schema 2 only; blocks given as paths are resolved against the URL's folder for a URL pack (they must
stay under it, K-R64) and refused for a file. The pack is foreign and passes `validate2`, so its own limits (K-R66) still
apply. The text of a file pack and the last good copy of a URL pack are kept in this browser (IndexedDB `edenMapPacks`)
under the card key; a URL is fetched again at each start and the copy is used when the fetch fails. A refused import
shows one passive line in the pack box and keeps the previous pack.

### 2.4 Trust and limits

**K-R63 — Trust by source.** A pack is *shipped* when it comes from the engine's own repository index (and compat-v1
output of such a pack); every other pack — embedded in a card, loaded from a URL or a file, exported from growth — is
*foreign*. The loader decides this from where it got the pack, never from a field inside it, and compat output keeps
its input's level. Foreign packs:
- have `cdn`, `legacy` and `x-page` ignored; the engine's code base always comes from the script's own URL, and pack
  routes only ever serve the pack's asset paths;
- may use `features` only to switch features off;
- are refused when their id equals a shipped pack's id;
- pass the limits of K-R66 and the model-facing rules of K-R65.

**K-R64 — Pack values are untrusted text.** Pack strings reach the page only as text (`textContent` or the kernel's
escape helper), never as markup. A pack value that ends up in a style, URL, class or other attribute (colours, icons,
theme tokens, paths, avatar hosts) is re-checked at run time against the exact schema pattern and dropped when it
fails; a path must still lie under the pack's base after URL resolution. This holds for shipped packs too. The
generic 3D viewer's manifest is pack data under the same rule (S8 gives it a v2 schema).

**K-R66 — Limits for foreign packs.** Beyond K-R27, a foreign pack is cut to these limits (items beyond a limit are
dropped as in K-R06):

| What | Limit |
|---|---|
| whole document after resolving block files | 1 MB embedded in a card; 8 MB read from a URL or a file or written by export (Z-12) |
| JSON nesting depth | 16 |
| any array, unless a rule says otherwise | 1000 items |
| any string (`desc`, worldbook `content`: K-R65) | 4000 code points |
| distinct vocabulary words | 20 000 |
| nodes sharing one word | 8 |
| `x-` keys | kept, counted in the size limit |
| `media` | at most 200 items; a data URL in `media.*.src` is exempt from the string cap but counts in the document size; one picture at most 3 MB decoded (K-R101) |

`validate2` takes the document limit by source: `source: 'card'` is 1 MB, `'url'`, `'file'` and `'export'` are 8 MB, and an explicit `maxBytes` wins; without either it is 1 MB. The loaders pass the source they read from (`importPack`: the kind of the request; the viewer: `card` for a pack embedded in the card, else `file`).

**K-R98 — Export as pack.** "Export as pack" (Settings → Advanced → Map pack) writes one JSON file `<pack id>.pack.json`
for a foreign pack (automatic, embedded, imported or a URL pack; `core/pack-export.mjs`): the current pack with every block
inline, plus the grown nodes (as ordinary nodes; their `g_` ids are kept, K-R10), the user's own names for places as aliases
of their nodes (Z-16; a name for a node that does not exist is dropped), and `credits.card` filled from the card info (K-R08).
It never contains chat state (stash, fog, events, the ignore list, the ledger, `chat`), implicit views or a field the kernel
reads only for shipped packs (`cdn`, `legacy`, `x-page`). The id is kept (Z-06). Keys are written in a canonical order, so
exporting an imported file again is byte-identical. The file must pass `validate2` as foreign with no problem and stay under
8 MB (`validate2` takes the limit as `maxBytes`); otherwise export lists the problems and writes nothing. A file whose compact
form is under 1 MB is marked "fits in a card". A second button copies the compact text for a new worldbook entry titled
`spatial_os:pack` (the pack box says: keep that entry disabled). The edit draft (K-R100) is folded in (`exportPack(pack, { draft })`) and pack pictures (K-R101) travel inline as data URLs; private pictures never do (K-R102). **Overlay export (Z-15):** for a shipped pack the draft is written as `<pack id>.overlay.json` in the K-R67 shape (`schema`, `nodes` with `id` and the changed `at`, `parent`, `alias` and `media`, new places with a name, `media`, `ui.start`; no views): changes only, for a maintainer to merge into `map/packs/<id>/overlay.v2.json`, so the old gallery maintainer workflow is gone.

**K-R101 — Pack pictures.** An optional tenth block `media` (added within schema 2, K-R62; `map/data/schema/v2/media.schema.json`) = `{ <media id>: { src, w?, h?, note?, i18n?: { <lang>: { note } }, credit? } }` (ids `^[a-z][a-z0-9_]{0,63}$`, at most 200 items), plus the node field `media: [<media id>]` (the node's gallery, in order, at most 32; an id the block does not have is dropped as `ref-media`) and the `image` view field `media` (an alternative to `src`: an image view needs one of the two). `src` is one of three kinds (`core/pack-media.mjs`):
1. a relative path under the pack base ending in `.webp`, `.png`, `.jpg` or `.jpeg` (shipped and URL packs; no `..`, no scheme, no backslash; it must still lie under the base after URL resolution; a card or file pack has no base, so a path is refused there);
2. `data:image/(webp|png|jpeg);base64,` + base64 text, at most 3 MB decoded (any pack);
3. an `https://` address with an image file type and no query string or fragment, loaded only while the viewer switch "load pictures from links in packs" (`edenMapPackRemote`, default off, Z-13) is on; off, the item stays as a placeholder with its note.
Anything else (`javascript:`, `http:`, `data:text/html`, `data:image/svg+xml`, a query string, more than 3 MB) is refused: the item is dropped with one problem (`pattern` or `limit-media`) and never reaches the page. The page re-checks every value against the same patterns at run time (K-R64): `checkMedia`, `mediaUrl`, `nodePictures`. Captions and credits are shown as text. The viewer opens an image view whose frame is a pack picture through `mediaUrl` (problem `view-media` when refused).

**K-R102 — Private pictures.** A user may add pictures to any place for themselves. They live only in this browser (the gallery IndexedDB, records keyed by scope, `n:<node id>` and picture id; scopes "this chat" and "all chats" as before) and are **never** exported, embedded, sent to the host or put in a URL: no export function reads them (`exportPack` ignores everything but its documented options). A place's gallery shows the pack's pictures first, then the private ones; records stored before S9b under a room name are found through the node's name (Z-18); a stored visibility `public` reads as `private`. In edit mode a private picture can be copied into the pack ("add to pack"), which creates a pack picture in the draft; the private record stays private.

## 3. nodes — the only geography

### 3.1 Node fields

| Field | Required | Meaning | Default |
|---|---|---|---|
| `id` | yes | K-R10 | — |
| `name` | yes | display name, verbatim from the card for card-backed nodes | — |
| `type` | no | author-named kind (K-R14) | none |
| `parent` | no | parent node id (K-R12) | the root |
| `alias` | no | strong names (K-R15); an explicit list must contain `name` unless `name` is a hint | `name` + i18n names |
| `hints` | no | weak words (K-R16) | none |
| `cite` | no | free-text source note (K-R11) | none |
| `sub`, `desc` | no | subtitle, description | none |
| `facts`, `access` | no | facts (a list of at most 12 one-sentence strings) and who may enter (one line), plain text (K-R134) | none |
| `i18n` | no | `{ <lang>: { name, sub, desc } }` | none |
| `at` | no | position `{x, y, z?, r?, view?}` in the nearest framed ancestor view, or in `at.view` (K-R31) | none |
| `anchor` | no | region id in that view's region table (K-R32) | the node id |
| `view` | no | view id or ids, first = primary (K-R33) | `views[<id>]` |
| `enter` | no | child whose view opens for this node (K-R34) | none |
| `links` | no | passages `[{ to, label?, i18n? }]` shown on the place card | none |

### 3.2 Ids

**K-R10 — Node ids.** `^[a-z][a-z0-9_]{0,63}$`, unique across the pack's nodes, stable forever: chat variables, stash
rows, fog of war, user aliases and protocol messages refer to them. A deleted node's id is never reused for another
place. Growth (K-R26) creates ids starting with `g_`; an exported pack keeps them, and authors do not invent new
ones by hand. `__root` is the id of a synthesized root: it exists only at run time and never appears in pack data
(an absent `parent` or `ui.start` already means "the root").

**K-R11 — Names, no provenance labels.** `name` is required. The contract carries no card-versus-invented
provenance field on nodes (user decision 2026-09-30); `cite` is an optional free-text source note that the kernel never
interprets. Grown nodes are recognisable by their `g_` id prefix only.

### 3.3 The tree

**K-R12 — One root.** Root candidates are the nodes without a `parent` key. If there is exactly one, it is the root;
if there are none or several, the kernel creates `__root` named after the pack title and hangs every candidate under
it. Then, in declaration order: a node whose `parent` does not exist is hung under the root (it does not become a
candidate); a node that turns out to be its own ancestor is re-hung under the root, which breaks the cycle there.
Several roots are valid; tools report a missing parent and a cycle as errors, and the runtime heals both with one
self-check entry each.

**K-R13 — Order.** Declaration order is the sibling order (level switcher, schematic layout, lists) and the last
tie-break of locate: earlier wins.

**K-R14 — Types are free.** `type` is an open vocabulary for legends, the schematic view and `ui.legend`. The kernel
never branches on a type value.

### 3.4 Vocabulary: aliases and hints

**K-R15 — Aliases and matching.** When present, `alias` is the complete list of strong names; it must contain `name`
unless `name` is listed in `hints` (tools check this; the runtime adds nothing). When absent, the strong names are
`name` plus every `i18n.<lang>.name`, each without a leading article of the pack language (`The Salty Dog` → `Salty
Dog`). A strong word carried by two nodes of which neither is an ancestor of the other is ambiguous and counts as a
hint on each. Matching compares normalised forms (K-R17):
- a word whose first character is a letter or digit of a spaced script (Latin, Greek, Cyrillic, digits) matches only
  where the text character before it is not such a character;
- the same holds at its end, except that one of the language's word-end suffixes may follow (en: `'s`, `s'`, `es`,
  `s`), after which the boundary applies;
- a word starting or ending in another script (Han, kana, Hangul, …) matches as a plain substring at that end.

So `pier` matches "piers" and "the pier's" but not "pierced", and `灯笼码头` matches inside any Chinese sentence.
Empty words are ignored.

**K-R16 — Hints.** A hint of node N means "somewhere inside N". It can place at N, never at a descendant of N, and it
loses to aliases outside N's subtree (K-R22). A word listed both as alias and as hint of the same node counts as a
hint. Hints of the root mark ambiguous words ("somewhere, unknown"): they hide the shorter matches inside them
(K-R20) and are then removed, so they never decide a result. This one concept replaces three v1 mechanisms: the event
tier regexes, the "room words need context" rule and the global list of ambiguous names.

### 3.5 Locate algorithm

Input: a place text and optionally `here`, a node id (K-R24). Output: a result (K-R23) or `null`. The same algorithm
serves every consumer (K-R24).

**K-R17 — Normalise.** Applied to the text and to every vocabulary word: Unicode NFKC; lower case; curly quotes and
primes become `'` or `"`; dashes become `-`; every space character becomes a space; `&` becomes ` and `; runs of
spaces collapse; trim. The text also loses the host macro `{{user}}`. Lengths (`len`) count code points of the
normalised form. An empty text → `null`.

**K-R18 — Several places.** Split on `/`, `|` (after NFKC, which also covers `／` and `｜`); locate each part in order;
the first non-null result wins; all null → `null`.

**K-R19 — Journeys.** Patterns, tried in this order; text before a pattern is prefixed to A, as v1 does:
- zh: the patterns of v1 `here.mjs parseTransit`, verbatim (从A到B with its verbs, A至B, 前往 / 去往 / … B, and its
  tail words);
- every language: `^(.+?)\s*(?:→|->|⇒)\s*(.+)$` → A, B;
- en, case-insensitive: `^(.*?)\bfrom\s+(.+?)\s+to\s+(.+)$` → prefix, A, B; and
  `^(.*?)\b(?:on (?:the|my|our|his|her|their) way|heading|headed|en route|bound)\s+(?:to|for)\s+(.+)$` → A, B;
- a pack's `lexicon.<lang>.from` / `.to` markers, matched as whole words: `<from> A <to> B` or `A <to> B`.

The result is the resolution of A, else of B, plus `transit: { from, to, from_text, to_text, route }` where `from` and
`to` are node ids or `null` and `route` is v1's "via" text. When B fails and A starts with a prefix ending in `·` or
`・`, retry prefix + B and accept it only if it lands strictly below what the prefix alone resolves to (any result when
the prefix alone resolves to nothing). When both ends fail, the whole text is resolved as if it were no journey.

**K-R20 — Matches and the overlap rule.** Collect every occurrence of every vocabulary word — strong, weak and user
aliases — as `{ node, word, weak, start, end, len }`. A match lying inside the span of a longer match is dropped,
whatever nodes the two belong to; matches with equal spans all survive. Then root hints are removed (K-R16). At most
256 matches are kept, earliest first.

**K-R21 — Alias pass.** Candidates are the nodes with at least one surviving strong match; `best(n)` is n's longest
strong match (tie: earliest start). `score(c)` = the sum of `len(best(a))` over c and every ancestor of c that has a
strong match — how much of the text the answer explains. The winner A has the highest score, then the greater depth,
then the longer `best`, then the head position, then the earlier declaration. Head position: in a language whose head
is `first` (en and the other spaced languages) the earlier `best` wins ("market square by Lantern Docks" → the
market); in one whose head is `last` (zh, ja: "B旁的A") the later one wins.

**K-R22 — Hint pass.** Weak candidates are ordered by: longer word, then (when `here` is given) smaller tree distance
to `here`, then the deeper node, then head position, then earlier declaration, then earlier position in that node's
`hints`.
1. If A exists: the best weak match on a proper descendant of A is the result (a hint refines A downward); if there is
   none, the result is A.
2. If no A: the best weak match overall is the result.
3. No surviving match → `null`.

**K-R23 — Result.** `{ node, word, via, canonical?, transit?, text }`. `via` names what produced `node`: `alias` for
the alias pass (A, even when its own hint supplies `word`), `hint` for K-R22 steps 1–2, `user` when the deciding
match is a user alias. `word` is the finest evidence for `node`: its best surviving own hint if it has one, else
`best(node)`. `canonical` is the word a user alias stands for. `text` is the normalised input.

```
locate(text, here?):
  t = normalise(text);            if empty → null                          # K-R17
  if t has several parts → first non-null locate(part, here)                # K-R18
  if journey(t): r = resolve(A) ?? resolve(B) (+ prefix retry)              # K-R19
                 if r → r plus transit info
  return resolve(t)
resolve(t):
  M = matches(t) minus those inside a longer match, minus root hints        # K-R20
  A = best strong-matched node by (score, depth, len(best), head, -order)   # K-R21
  order weak matches by (len, -distance to here, depth, head, -order, -rank) # K-R22
  if A: h = first weak match on a proper descendant of A → h ?? A
  else: h = first weak match → h ?? null
```

### 3.6 Tie-breaks and negative cases

| Situation | Outcome | Rule |
|---|---|---|
| Two names of one chain ("town, district") | the deeper node (its score includes the ancestor's) | K-R21 |
| A short name inside a longer name of another place | the longer name only | K-R20 |
| Names of two branches, different lengths | the branch that explains more text | K-R21 |
| Same score, same depth | longer own word, then head position, then earlier declaration | K-R21 |
| Generic room word + the house or an ancestor named | the room | K-R22 |
| Generic room word + an unrelated place named | the unrelated place | K-R22 |
| Generic room word alone | the room | K-R22 |
| The same generic word in two houses, `here` given | the one nearer to `here` | K-R22 |
| An ambiguous name alone (a root hint) | `null`; it also hides shorter names inside it | K-R16, K-R20 |
| An ambiguous name + another hint | the other hint | K-R16, K-R22 |
| One strong word on two branches | a hint on both | K-R15 |
| Hints of two nodes, no alias | longest hint, then nearer, deeper, head, earlier | K-R22 |
| A word inside a longer English word ("pier" in "pierced") | no match | K-R15 |
| Several places "A / B" | first that resolves | K-R18 |
| Journey | origin, else destination, with transit info | K-R19 |
| Unknown words only | `null` → unmapped (K-R25) | K-R22 |

### 3.7 Placement of events, people and items

**K-R24 — One placement rule.** Everything that names a place — the current location, an event's place and scope,
a person's place, trip ends, stash rows given as text — resolves with K-R17–K-R23: aliases first, hints second,
unknown last. `here` is the previous current location when the current location is resolved, the player's current
node for event, person and trip places, and absent for stash rows; all of them are recomputable from the chat, so the
result stays deterministic (brief rule 4). What `null` means is the consumer's rule: the current location stays where
it was; an event follows K-01; a person goes to the "place unknown" group; a trip end is dropped.

### 3.8 User aliases, ignored names, unmapped names

**K-R25 — User words.** A user alias is `{ word, node, canonical? }`, stored in the pack's chat variable (v1 "custom
names"; S10 names the key). Its strength is that of `canonical` on that node (a hint → weak), otherwise strong. An
alias whose node or canonical word does not exist is ignored. The ignore list holds names the user chose to ignore.
`unmapped(text)` (v1 `unmappedName`): `null` when the normalised text is empty, when it locates (a journey counts
when either end locates), or when the ignore list holds the whole text or its first part (K-R18); otherwise the first
part.

### 3.9 Zero-config growth (no nodes block)

**K-R26 — Growing nodes from chat.** With no `nodes` block (or an empty one) the root is `__root`, named after the
pack title (after S9: the card name). S9 implements this rule for the automatic pack (K-R95), which runs it on top of its
derived nodes under an explicit root node `root`; a segment is first tried as written and then with its article stripped (so a
location variable "the inn" finds the alias "the inn" instead of growing "inn"). Authored packs never grow (Z-07):

1. Input: every place text the kernel reads — the location variable, place tags, the places in character tags and
   event tags — in message order.
2. Normalise (K-R17), keep the first part (K-R18), keep the journey's origin (K-R19), then split into segments:
   - `·`, `・`, `›`, `>` and a hyphen with a space on both sides (` - `; "Half-Moon Inn" stays whole) are read outer
     → inner;
   - commas (`,`, `，`) list places too: when the last segment locates and the first does not, the list is read inner
     → outer; otherwise by the language's head (`first`: inner → outer, as in "Cellar, Guild Hall, Saltmere";
     `last`: outer → inner).
3. Strip a leading article of the pack language from each segment. Walk from the root: for each segment, if it
   locates to a node inside the current node's subtree, descend to it; otherwise create
   `g_<base36 FNV-1a of parent id + segment>` with `name` and `alias` = the segment, and descend.
4. Limits: segments of 1–40 code points, depth ≤ 6 below the root, ≤ 200 grown nodes per chat; beyond that, texts stay
   unplaced.
5. Deterministic: the same chat gives the same tree. The grown tree is a droppable cache in the chat variable,
   recomputable from the chat (brief rule 4). With a pack that has nodes, nothing grows.

**K-R93 — Place candidates from the card's worldbook.** For each entry of the card's own books, in book and entry order:
1. Skip: the embedded pack entry (K-R91), the variable-initialisation entry (a title with `initvar` in brackets), entries
   carrying our ownership marker, titles longer than 40 code points, and titles equal (normalised) to a name in a
   discovered roster table (K-R41).
   *I-26:* names and keys are read without emoji and `{{...}}` macros (a leading possessive particle left behind is
   dropped); a title with `|` is `role|name` (a person: not a place, its name is skipped elsewhere); a divider title
   (framed by runs of `=`, `-`, `*`...) and a title led by a document emoji (rules, notes) are not places; two entries
   with the same cleaned path are one node with both key sets.
2. Strip one leading bracketed tag from the title (`[...]`, `［...］`, `【...】`) and split it into segments with the
   separators of K-R26 step 2, outer to inner.
3. The entry is a place when its innermost segment contains a word of the kernel's place-word list for the pack
   language (`PLACE` in `core/vocab.mjs`, at most 60 words per language: Chinese suffixes matched as substrings, English
   nouns matched as whole words), or one of its keys contains such a word, or its outer segment names a place that is
   already a candidate (Z-04; repeated to a fixpoint).
4. Node: id `w_` + `fnv36(normalised title)`; `name` = the innermost segment; `alias` = the name, the name without its
   article (K-R16) and the keys that are plain words (1–20 code points, not shaped like a pattern `/.../`, no `*` or
   `?`); parent = the candidate named by the outer segment, else the root.
5. At most 150 candidates; later ones are dropped (one problem, `candidates-limit`).

Only titles, keys and the initvar text are read: entry contents are never read, and nothing is decided by what a text
means beyond these word lists (brief rule 8).

**K-R94 — Variables, people, start view and language from the card.**
- **vars**: the K-R38 discovery runs over the live `stat_data` when it has keys, else over the shape of the initvar entry
  (`core/yaml-shape.mjs`: JSON, or a YAML subset of mappings, sequences, scalars and comments; anything else reads as no
  shape). The discovered paths (location, time, period, date, outfit, reputation, inventory) are written into the
  automatic pack's `vars`, so an export carries them; the user's variable mapping still wins (K-R38).
- **entities**: the name-keyed tables with a place- or person-like row field are the roster (their names are not
  places, K-R93); the table whose name means "present" becomes the `present` group (`members` and `targets` stay
  discovered at run time), and the row fields that fit a text or tag slot (K-R42) are written as `fields` with `x-slot`.
- **start** (`ui.start`, Z-08): the node that `locate` (K-R24, no `here`) finds in the first 400 code points of the
  greeting; it only sets the opening view and is never the current location. When the first message is only a short marker (under 40 code points) the first alternate greeting that is longer is read instead (I-26).
- **lang** (Z-09): over the letters of name, greeting and entry titles (at least 20): Han ≥ 30 % → `zh`; else kana
  ≥ 10 % → `ja`; else Hangul ≥ 30 % → `ko`; else `en`; fewer letters → the UI language. Languages other than `zh` and
  `en` use the `en` kernel vocabulary (K-R07).

**K-R95 — The automatic pack.** When no other source yields a pack, the host builds one from the card
(`deriveAutoPack`): `{ id: 'c_' + fnv36(name + "\n" + avatar), schema: 2, title: <card name, cut to 80>, lang, nodes, vars,
entities, ui: { start } }`. `nodes` = one explicit root node `root` named after the title, then the K-R93 candidates
(hanging under it, so grown nodes always carry a `parent`). No views block (implicit schematic views, K-R96), no events
block (neutral taxonomy, K-R53), no llm block. It is foreign (K-R63) and passes `validate2`. Its storage names follow the
pack id through the existing derivation (`core/pack.mjs`). The derived pack and the grown nodes are a droppable cache in
the pack's chat variable under the ASCII key `auto` = `{ v: 1, fp, pack, grown: [node], seen: [text] }`, written through
the root store's save (never `stat_data`) and only once the root has been loaded. `fp` = `fnv36` of the card name, the
avatar, the sorted normalised entry titles and the sorted key paths of the variable shape: with the same `fp` the cached
pack is used as is, otherwise it is derived again (node ids are hashes of titles, so unchanged places keep their ids) and
the grown nodes whose parent still exists are kept. The injected pack has `rev: 1` and `fp`.

*Growth.* K-R26 runs for the automatic pack only (Z-07), over the derived plus grown nodes: every place text the host
reads — the location variable (credited to the newest floor), place tags, the places of character and event tags — in
floor order, once per text (`seen`, at most 400). New nodes go to `auto.grown`; when the set changes the host rebuilds
its event geography and sends `eden-map:pack` `{ manifest, rev + 1, source: 'auto', trust: 'foreign' }`; the viewer
validates it again as foreign, projects it and redraws (§4.6). *Recompute.* On chat load an absent `auto.grown` is
rebuilt from nothing (`recomputeGrowth`) from the floors in the scan window; a present one is used, and the number of
nodes live and recompute disagree on is kept as a drift count (never repaired silently). Live growth and the recompute
give the same nodes for the same texts (tested like K-R75).

### 3.10 Limits and stable references

**K-R27 — Limits.** At most 5000 nodes, 64 aliases and 256 hints per node (the first pack's estate node carries 153),
words of 1–60 code points; at most 400 code points of a text are scanned and 256 matches kept (K-R20). The
implementation builds the vocabulary once per tree and memoises results. Foreign packs have further limits (K-R66).

**K-R28 — References by node id.** Chat data, stash rows, protocol messages and logs name places by node id in a field
called `node`. The v1 fields `map` and `marker` stay accepted until S10.

**K-R29 — describe().** `map/core/nodes.mjs` exposes `describe(tree, views)` → `{ nodes, depth, types, grown, views }`
for probes and the self-check, like the other core modules (`depth` = the deepest node's depth).

### 3.11 v1 `here.mjs` as a special case

v1 resolves through six fixed levels. Written as nodes, each level becomes a place in the tree and each v1 word list
becomes aliases or hints; the level order then falls out of K-R20–K-R22:

| v1 level | v1 words | v2 node and vocabulary | Why the order is kept |
|---|---|---|---|
| 1 estate room | the estate map's room words (+ room plan) | hints of the estate node; with the room plan, room nodes whose words are hints | hints refine the estate, lose to unrelated names (K-R22) |
| 2 estate area / whole estate | area words; the estate's own names | area words: hints of the estate node; own names: its aliases | same |
| 3 landmark | marker name, English name, aliases | a landmark node under its layer | deeper than the layer (K-R21) |
| 4 layer or district | layer name, subtitle, district words | aliases of the layer node | deeper than the group |
| 5 group or world place | group title; world places, fiefs, realms | aliases of the group (merged with its world place) and of world nodes | shallow |
| 6 nothing | the ambiguous list blocks landmarks | hints of the root → `null` | K-R16 |

Parity was checked by a scratch prototype of this algorithm (every rule of §3.5, including the word boundaries,
the normaliser, the root-hint removal and the head tie-break) plus the compat conversion of Appendix A: every
distinct input of `tests/here.test.mjs` and `tests/card_spec.test.mjs` lands on the same node as v1 (Appendix A.9
lists the two where only the reported word differs, and the intended divergences S3's parity test must whitelist).

## 4. views

### 4.1 Kinds

**K-R30 — Four view kinds.** `tiles` (a DZI pyramid), `image` (one picture, no slicing; very large pictures should
still be sliced with `tools/make_dzi.py`), `schematic` (automatic layout of the node's subtree, no coordinates),
`model3d` (a manifest of the generic 3D viewer).

### 4.2 Frames and positions

**K-R31 — Frames and `at`.** `tiles` and `image`: x to the right and y down, each 0..1 of the picture's width and
height (v1 `nx`, `ny`); `r` is a fraction of the width; an optional `extent: [w, h]` in metres gives scale.
`model3d`: the manifest's model units (metres; x east, y north, z up). `schematic`: no frame. A node's `at` is read in
the view `at.view` when given (it must be the primary view of an ancestor), else in the frame of its nearest ancestor
whose primary view has a frame; a node's own view never positions the node itself. Editors always write `at.view`, so
giving an intermediate node a picture later does not silently re-frame its descendants.

**K-R32 — Anchor and region tables.** A view may carry a region table: inline `[{ id, at | poly }]`, a file, a
schema-1 points file (`markers[]` with `id`, `nx`, `ny`, `r`), or the hotspots of a 3D manifest. Position lookup: `at`,
else `anchor`, else the region whose id equals the node id, else none. A node with no position is listed and drawn at a
deterministic spot near the frame centre marked "position unknown"; the schematic view lays it out automatically.

### 4.3 Attaching views to nodes

**K-R33 — Which views a node has.** `node.view` (one id or a list; the first is primary), else `views[<node id>]`,
else none. Several nodes may share one view (one 3D model for a cluster of buildings). A view's `open` says when it
opens: `locate` (default) whenever its node is the target, `enter` only when the user enters the node (a landmark's
3D model: locating the landmark still shows it on its map).

### 4.4 What the viewer shows for a node

**K-R34 — View resolution.** For a target node N from locate (or navigation to N):
1. N's primary view has `open: locate` → open it.
2. Else N has `enter` → apply these rules to that child.
3. Else open the view of N's nearest ancestor whose primary view has a frame (the view `positionOf` uses), else of
   the nearest ancestor with any view, else the root's schematic view.

The result is `{ view, owner, kind, focus }` with `focus` = N; when N has no position in that view, the viewer
focuses the deepest ancestor of N that has one. Entering a node (double-click or the enter button) applies rules 1–2
with any `open` value.

**K-R35 — Level switcher.** While a view owned by V is open, the switcher offers `ui.levels[L]` for the nearest
ancestor-or-self L of V that has an entry; else the children of V's parent whose primary view is `tiles` or `image`,
in declaration order. It is shown only when there are at least two.

### 4.5 Dedicated pages

**K-R36 — No pack code.** `model3d` uses the generic viewer. The field `x-page` (a pack-specific HTML page) survives
only as a legacy form for the page that ships with the engine; it is ignored in every foreign pack, including the
compat output of a foreign schema-1 pack (K-R63). Designer rule, not a user choice: a page from a card would run
arbitrary code on the tavern page.

**K-R104 — The 3D scene manifest schema.** `map/data/schema/v2/scene3d.schema.json` is the v2 schema of the generic 3D viewer's manifest (the file `map/estate/model/manifest.json` and every `map/props/<id>/manifest.json`; K-R64 promised it). It is written from `core/scene3d-manifest.mjs`: `id` and `glb` are required, `glb` is `"x.glb"`, `{ std, low? }` or `{ <part>: { std, low? } }` (the landmark spelling `glb` plus `glb_low` is read too), `floors` are strings or `{ id }`, `hotspots` are objects with an `id`, `budget` / `budgets`, `license` / `credit`, `data` = `{ rooms?, zones?, galleries? }` (paths relative to the manifest), `flows[].color` is `#rrggbb`; unknown fields are kept (`additionalProperties: true`, the format has always done so). `tools/check_pack.py` validates every shipped manifest against it and against `validate` of the core module; a manifest that fails is reported, not edited.

**K-R131 — Room kinds as pack data.** A 3D manifest may carry `room_kinds: { <kind>: { color: "#rrggbb", label, rank?: 1 | 2 | 3, i18n?: { <lang>: { label } } } }`: the plate colour of every room of that kind and the label of its chip in the section view and on the room card (the language entry wins, the plain `label` is the fallback; `rank` is the priority of the room labels of that kind, 1 first, 2 when absent). Kind ids match `^[a-z][a-z0-9_]{0,63}$`, colours are re-checked with `recheck.hex` and labels are plain text put on the page with `textContent` (K-R64). A kind a room uses and the table lacks gets a generated colour (`core/kind-palette.mjs`: eight colours, each at least 3:1 on both theme surfaces and at least 20 apart under normal vision and under protan, deutan and tritan simulation, picked by a stable hash of the kind id) and its id as label. The viewer keeps no kind table. `rooms.json` (the manifest's `data.rooms`, `map/data/schema/v2/rooms.schema.json`) lists `floors: [{ id, name?, z }]` and `rooms: [{ name, node, floor, kind, area?, note?, poly }]`; `node` is the id of the room's node in the pack's tree (rooms of one name may share one node), and the room card, the people chips and the room list match by node id, the name only as a fallback. The manifest's `data.extras` names an optional pack file with `room_alias` (names a search finds a room by), `sub_rooms` (a hotspot inside a room) and `vehicles` (a few drawn props with their card text); the 3D page names none of these itself.

**Amended by LEGEND-1 (D35, K-R131):** the kind colours are drawn as translucent floor plates (and per-room edge lines) in the section view only when the 3D manifest says `"x-kind-plates": true` (default false; the first pack leaves it off). Without it the hover / pin highlight is the only room boundary, and there is no colour key and no colour chip on the room card; `room_kinds` stays as data for labels and ranks.

**K-R132 — The building's words.** A 3D manifest may carry `building: { title, subtitle?, summary?, i18n?: { <lang>: { title?, subtitle?, summary? } } }`: the title, subtitle and one-sentence summary the viewer shows (the shell's accessible name, the building's card). Floor labels are `label` and `i18n` on the items of the existing K-R104 `floors[]` list; a `building.floors` key is rejected by the schema (one list, one place). Without the block the viewer says "Building", shows no subtitle or summary and uses the floor ids as labels. All text is plain and set with `textContent`. (A landmark manifest's `building: { min, max }` is its bounding box, read by `props/viewer3d.html`; it is not this block.) An optional `view.ext = { target: [x, y, z], size: [w, d, h] }` frames the exterior view in layout metres; the model's bounding box is used when it is absent.

**K-R133 — Depth channels never move an overlay (TIER-1).** A view's depth data (`x-depth`, `channels.*`) may change label opacity and haze only; nothing drawn as an overlay of the image (pins, labels, outlines) moves relative to it. The `parallax` channel belongs to the screen-fixed cloud layer alone. The period tint follows the base image actually shown: when the alternative base (`x-alt`) is on and has no period version, the active period's tint is applied.

**K-R134 — One record per place.** A place of any kind (a world name, a landmark, a building, a room, an outdoor zone) reads as one record, computed on the spot by `core/place-record.mjs` from the pack's own files and never copied: `id`, `name`, `kind` (`site` / `place` / `building` / `room` / `zone`), the pack's own `type`, `parent`, `sub`, `desc`, `facts`, `access`, `rows` (label / text pairs the pack gives, for example an area), `media`, `alias`, `floors` (rooms), and `wb` (the world-book entry ids, filled from the shipped `index`). New node fields: `facts` (an array of at most 12 non-empty strings) and `access` (a string), both optional and plain text, set with `textContent`. Rooms of one node merge into one record (floors in plan order; the table's words and synonyms become names); a node's own `desc`, `facts`, `access` win over what the room table says. The player's changes (K-R135) lie over the record field by field, the pack's own record is never changed. `entryText(record)` is the one source of a world-book entry body: the builder writes the add-on's room entries with it (`tools/place_records.mjs` hands the records to `tools/build_worldbook_addon.py`), and the record card shows the same text. The shipped add-on carries `index { <record id>: [entry id] }`, and a room entry may carry `strategy.keys_secondary { logic: "and_any", keys }` (generic names get the building's names). Entries exist for rooms with text; a record whose name is all it has gets none.

**K-R135 — The player's fields on a place.** `<chat variable>.自定义.items[<key>]` keeps its fields (类, 名, 用途, 别名, 源) and gains `说明` (a string, at most 400 characters), `事实` (at most 12 strings of at most 120 characters), `基于` (fingerprints `{ name, desc, facts }` of the pack text the edit was based on; a later difference marks the field "the pack's text changed"), and `楼` (the floor it was saved at; a story tag and a manual edit on one place go by floor, the later one wins). The key is the node id; an old key (the standard name) is still found and `migrateKeys` moves it once the tree names it. `自定义.撤销` keeps the last 20 previous states for undo. The chat's custom book is one constant index (the name pairs, at most 220 characters) plus one keyword entry per place with a description, use line or facts, its body from the same `entryText`, headed by one sentence saying this chat's text wins; turning the sync off only disables the entries. Intents: `eden-map:place-edit { id, patch }`, `eden-map:place-undo { id? }`.

### 4.6 Schema-2 packs in the viewer

**K-R96 — Opening a schema-2 pack.** `core/pack.mjs` accepts `schema: 2` next to `schema: 1`: for a schema-2 manifest `validate` checks only `id` and `title`, `load` returns the resolved pack with `schema` and the manifest as `v2`, and the viewer (`app/current-pack.mjs`) runs `resolveBlocks` (block files relative to the pack folder), `validate2` (trusted only for a pack that ships with the engine, that is one loaded from `packs/<id>/`) and `withDefaults`. The viewer then works on an in-memory projection, `projectV2(pack, { base })` in `core/pack-v2-view.mjs` (pure), in the registry shape it already draws; no viewer module reads schema 2 itself, and a schema-1 pack never goes through it.
- **Implicit views.** A pack with no `views` block (or an empty one) gets a schematic view on the root and on every node that has children: layout `tree`, depth 2, `open: locate`. Locating a node then opens its parent's schematic focused on it (K-R34 rule 3); entering a node with children opens its own. Implicit views are never exported.
- **Maps.** A map is a node whose primary view (explicit or implicit) has kind `tiles`, `image` or `schematic`; the map id is the node id; `start` is `ui.start` mapped to its view's owner (K-R34), else the nearest map above it, else the first map. A map is `{ title: <node name>, title_en?: <i18n.en.name>, kind: 'points', base, data, view: { extent_m }, markers }` with `extent_m` from the view's `extent` or `[1600, 1000]`; `markers` has one entry per node drawn on the map `{ name, name_en?, sub?, alias, link? }` (`alias` = the node's `alias`, its name and its translated names; `link` opens the node's own map, set when it has one).
- **Tile source.** `tiles` is the DZI path under the pack base (refused when there is no base: a card or file pack; problem `view-tiles-no-base`); `image` is `{ type: 'image', url }` from `src` under the base (no base: `view-image-no-base`; the `media` form belongs to a later step); `schematic` is `{ type: 'image', url: <generated picture> }` (K-R97). Every path is re-checked after URL resolution: no scheme, no absolute path, no way up (`view-path`, K-R64). `model3d` views are not projected yet (problem `view-3d-not-shown`, listed in the self-check).
- **Virtual point files.** `v2/<pack id>/<map id>.json` = `{ extent_m, markers: [{ id, nx, ny, r }] }`, positions from `positionOf` (K-R31, K-R32; a node with no position sits near the centre) for framed views and from the schematic layout for schematic ones. The viewer's JSON cache is seeded with these files, so every module that fetches a map's data gets it unchanged.
- **Runtime.** `makeRuntimeV2(pack, registry)` (`app/nodes-runtime-v2.mjs`) gives the reads of the schema-1 runtime from the pack's own tree: map ids are the projected maps, a map is its own host, `parent` is the nearest ancestor that is a map, `levels` follow K-R35 over the maps, `kind` is the primary view's kind, and `geo()` is the event geography of the tree. `standIn`, `zoneChildren` and `anchorIn` are empty.

**K-R97 — Schematic layout.** `layoutSchematic(tree, owner, { layout, depth })` (`core/schematic.mjs`) returns `{ <node id>: { x, y } }` in 0..1 with margins of 0.06, deterministic (the same tree gives the same picture). `tree` (default): the owner at `{ x: 0.5, y: 0.08 }`; its descendants down to `depth` in rows, one row per level, rows evenly spaced down to y 0.92; each node's width share is the number of leaves of its subtree within the depth, and a parent is centred over its children; a row of more than 12 nodes wraps into several rows of equal length. `list`: one column in declaration order. `grid`: rows of ⌈√n⌉. `radial`: the owner in the middle and one ring per level. The picture, `schematicSvg(layout, tree)`, is an SVG of 1600 × 1000 units, transparent, with one line per parent-child edge (both ends in the layout) and one dot of radius 6 per node, in fixed neutral greys; it contains no text and no pack value (Z-11, K-R64), and `schematicUrl` encodes it as a `data:image/svg+xml` URL. Node names are the normal markers, so search, cards, events and the drawer work as on any map. An `image` view opens as a single picture (no slicing) and positions are fractions of it (K-R31).

**K-R114 — Thematic schematic.** The schematic of K-R96 / K-R97 has a thematic variant. **When:** an implicit view (K-R96) whose laid-out subtree has at least 8 nodes and at least 2 branches (a branch = a child of the owner that has a child in the layout), or an explicit schematic view with the extension field `x-style: "thematic"` (no schema change; `"plain"` or absent = today's picture); otherwise the plain picture, byte-identical to the picture before S8-4b. **Functions:** each branch takes the function that most of its nodes' names point to through the kernel's generic function words (`core/vocab.mjs` `FUNCTION`, zh and en, at most 12 words per function; ties: the order of the function list; none: `other`); the words are names of kinds of places, never a card's. **Picture** (`core/thematic.mjs` `thematicModel`, `core/schematic.mjs` `schematicSvg(layout, tree, model?)`; still an SVG data URL without any text): per branch a convex hull of its nodes' spots, padded by 0.04, filled with its function colour at 0.16; the branch's own parent–child edges as one coloured line (an 8-colour palette in branch order, width 6); the other edges grey as before; hubs (nodes with children in the layout) as white rings with a dark stroke (r 9), leaves as dots (r 6, the branch's line colour). **Labels:** the projected markers carry `rank` in the virtual points file (1 for the owner and the branches, 2 for other hubs, 3 for leaves; absent for a plain picture), `app/markers.mjs` writes it as `data-rank` on the marker, and the transit style sizes the label (rank 1 `--fs-body` weight 700, rank 2 `--fs-small`, rank 3 `--fs-micro` at 0.85 opacity). No network is made up for an automatic pack (the `transit` layer does not apply there); a schema-2 pack with a `transit` block draws it over its schematic views like over any view.

**K-R100 — Edit mode.** A switch in Settings → Advanced ("Edit mode", `edenMapEdit`, default off) turns on an edit bar and the operations below; off, nothing of it is drawn. Changes go into a local draft per pack id (Z-14) = `{ v: 1, nodes: { <id>: { at?, parent?, alias_add? } }, add: [node], views: { <id>: view }, media: { <id>: item }, attach: { <node id>: [media id] }, start? }` (`core/pack-draft.mjs`; text in `edenMap:edit:<pack id>`, picture bytes in the gallery IndexedDB under scope `edit:<pack id>`; a private picture is never in it). While the switch is on the viewer shows the pack with the draft applied, by the K-R67 overlay merge (aliases united, other node fields overridden, pictures by id, a pack with no views keeps its implicit ones once a view is added, `ui.start`); a schema-2 pack is projected again after every change (`app/pack-live.mjs`). The draft is never written to the chat, the card or a worldbook; "Discard draft" empties it. Operations (`app/pack-edit.mjs`): `move` (drag a pin on a `tiles` or `image` view; writes `at = { x, y, view }`, K-R31), `reparent` (refuses the node itself, a descendant and the root: no cycle can be made), `addAlias` (1–60 code points, K-R27), `addPlace` (id `e_<fnv36(name + parent)>`, at a tapped point of a framed view), `setStart`, `addPicture` + `attach` (pictures of a place; only inline pictures enter a draft), `useAsMap` ("use a picture as this place's map": the picture is re-encoded to WebP 0.82, long side at most 4096 px, metadata dropped; the node gets `views[<id>] = { kind: 'image', media }` and its children's schematic positions become their first `at` in the new frame) and `discard`. A schema-1 pack (the first pack) keeps its layout: its pins cannot be moved or reparented in the viewer; pictures can be added to any of its places and exported as an overlay. Export: K-R98.

## 5. vars

**K-R37 — Read only.** Paths are dot paths into the card's `stat_data`; MVU `[value, note]` pairs are unwrapped. The
kernel never writes `stat_data` (brief rule 5).

**K-R38 — Fallbacks and auto-discovery.** The current location falls back in a fixed order: MVU path → the newest
message's explicit place tag → the table-database extension → a community preset's status line → none. When a path is
missing from the pack or not found in `stat_data`, the kernel searches `stat_data` (depth ≤ 3, shallow first) for a key
matching its per-language field-name vocabulary (plus `lexicon.<lang>.fields`) with the right value kind (text for location, time, period and date;
object for outfit; number for reputation; object or list for inventory). The user's override in Settings (variable mapping, stored per card) always
wins. Roster tables are not vars: they are the sources of `entities.groups` (merged to avoid two places for one path).

**K-R39 — Periods.** `periods` are author-named bands in time order, each `{ id, label, start: "HH:MM", words[],
dark }`. Resolution: the period text is matched against the bands' words (longest word, then earliest band); else
HH:MM read from the time text selects the band with `start ≤ time <` the next start, wrapping past midnight; else no
band. Default: `dawn 05:00`, `day 07:00`, `dusk 17:00`, `night 20:00 (dark)`. `dark` drives night looks; tiles and
image views may carry `variants` keyed by band id.
The viewer shows the variant of the current band (the host clock message carries the band id as `tod` and the pack's bands in
time order as `bands`, `[{ id, dark? }]`; an old host without `bands` means the four default bands). A map without that band's variant takes the nearest
registered band by circular distance in band order (the day wraps); on a tie the lighter band (not `dark`) wins, then the earlier one; no
variants, no current band, or no registered key that is a band of the pack = the map's single base. A band whose own variant is shown is not
tinted again (`body[data-base-tod]`); a neighbour's variant keeps the current band's tint. `core/period-pick.mjs`.

**K-R76 — The card's own item table.** `vars.inventory` (optional, a dot path, read only) names the table of the card's `stat_data` that holds the player's items; without it the kernel uses the field its inventory words find (`EXACT.inventory`: 物品栏, 背包, …, inventory, backpack, …) when that field really exists in the card;
with neither there is no such table. `cardInventory(stat, path)` reads it as rows `{ name, qty?, text? }` (at most 100, names ≤ 60 code points, text ≤ 80): an object keyed by item name (a number is the quantity, a string the text, an object its first number and first string) or a list (strings are names; objects: the name field by the kernel's name words,
else the first string field, and the first number as the quantity). MVU `[value, note]` pairs are unwrapped, keys starting with `_` or `$` are skipped, and nothing is ever written back. It reaches the viewer as `eden-map:inv.card = { path, rows }` (`null` when there is no table). The Items tab shows it, read only, with the other groups: the drawer has a fifth tab `items` (button class `ittab`, between characters and places, drawer kept open, fallback after the places tab) in four groups. *Carried* = store rows with `carried: true`; *here* = own rows (`carried: false`) at the player's node and world-stash rows at that node that are not taken (a hidden one only when the player stands on its spot); *elsewhere* = own rows at another place, one sub-heading per place, places in code-point order, rows without a place last under "unplaced"; *in card* = the rows above. Empty groups are not drawn; the tab is visible when any group has a row and its count is the number of carried rows. A world row "here" has a take button that sends the same `eden-map:loot` intent as the marker; a row whose place locates has a fly-to button; card rows have none. Names, places and notes reach the page as text only (K-R64). With an old host (no `stash` field) the legacy rows are shown as not carried.

**K-R105 — The scene header and the place of one floor.** `vars.header` (optional) = `{ tag, sep?, fields }` declares the header a floor's text may carry as the element `<tag>…</tag>`: `tag` is 1–32 letters, digits, `_` or `-` (not starting with a digit), `sep` is the 1–8 character separator (default `·`, no `<`, no line break), `fields` lists `place`, `date`, `time` in the order the block writes them (each at most once, `place` required). The kernel reads it without a regular expression: it takes the last `<tag>` block of the floor, splits its text at `sep` and trims each part; a place may itself contain `sep`, so when there are more parts than fields the surplus belongs to `place` and the fields around it are counted from each end. A block that does not close, another tag that only starts with the same letters, or a block without a place is no header. The place of ONE floor is then, first match wins: (1) the card variable at `vars.location`, when a variable patch inside this floor's own text writes that path (a `<UpdateVariable>` or `<JSONPatch>` block naming `/a/b` for the dot path `a.b`); (2) this floor's header place, when it resolves to a node (K-R15, K-R16: the same locate as every other place text); (3) the card variable carried over from earlier floors; (4) the older fallbacks of K-R38 (place tag, table database, preset status line). A header place that resolves to no node is ignored (no placeholder is made). The result carries its source: `patch`, `header`, `mvu` (carried) or `none`; the host reports `header` as the place source of the moved event. The map, the people tab (the player's own place, which "with the player" rows without a place copy), the pick-up place of older floors and the injected status line all use this one place, so a variable that the model stopped updating cannot state a place the floor's text contradicts. A pack without `vars.header`, a floor without a header and a host that cannot resolve nodes yet behave exactly as before. Nothing is ever written back to `stat_data` (K-R37).

## 6. entities

### 6.1 Core fields (fixed)

**K-R40 — Core entity fields.** `id` (the normalised name: whitespace collapsed, trimmed, cut as `core/roster.mjs
normName` cuts, 40 UTF-16 units), `name`, `node` (locate of the entity's place text; `null` when unknown), `source`
(`mvu`, `chat`, `table-db`, `fallback`, `imagegen`; v1 calls the last one `baibai`). Derived: `present` (in a group
whose source is `present`, marked by `source.with`, or at the player's node) and the merged aliases.

### 6.2 Groups and sources

**K-R41 — Groups.** `groups[]` in display order: `{ id, label, source, fallback? }` with
`source = { mvu?, name?, place?, with?, present?, tags? }`:
- `mvu` is the dot path of a table: an object keyed by name, or an array of row objects whose name is in the field
  `name` (default: discovered with the kernel's name vocabulary);
- `place` is the row field holding the place text (default: discovered with the location field vocabulary plus
  `lexicon.<lang>.fields.location`);
- `with` is a row field whose yes-value (`true`, a non-zero number, or a word of the kernel's yes list or
  `lexicon.<lang>.present`) puts that person with the player; `present: true` puts everyone in the group there;
- `tags: true` adds the chat's character tags; `fallback` rows show until a live source has the same person.

Without groups the kernel discovers them (K-06 pending): by default only name-keyed tables whose rows are objects
with a place- or person-like field become groups, titled with their key, and Settings can switch others on; a key
matching the kernel's "present" vocabulary is the present group; character tags form a group of their own.

### 6.3 Attribute fields

**K-R42 — Four field kinds.** `fields[]` in display order: `{ field, label?, kind, min?, max?, ladder?, scan?,
show? }`. `field` is the key in the source row, verbatim from the card. `fieldValue(def, row)` reads the whole row
and returns, per kind (`null` when the value is missing or unreadable):
- `text`: the string, cut to 80 code points; shown in the details by default.
- `tag`: a short string from a string, number or yes/no.
- `gauge`: `{ value, min, max, band? }` — the number clamped to `min..max` (defaults 0 and 100) drawn as a meter;
  `ladder` = bands `[{ up_to, label }]`, and `band` is the label of the first band whose `up_to` ≥ value.
- `ladder`: `{ index, label }` — ordered steps `[{ label, match[] }]`, low to high; the value matches a step by equal
  label or match word, then by containment (longest), comparing normalised forms (K-R17). `scan: true` looks at the
  row's other text values when the field is missing.
- `show`: `subtitle`, `chip`, `detail` or `hidden`; default `detail` for text, `chip` otherwise.
Without fields the kernel discovers a role field (identity-like names) as subtitle and a stage field (progress-like
names) as a chip, with its per-language vocabulary. A field may carry `x-slot` (K-R69) to take one of the roster slots
of the viewer's card rows (`stage`, `grade`, `core`, `code`, `social`, `height`, `weight`, `known`, `accessory`, `tier`); a slot
without a declared field is discovered in the rows by the kernel's vocabulary, and Settings → variable mapping overrides both.

### 6.4 Avatars

**K-R43 — Avatar sources.** `avatar.from` lists allowed sources: `card-script` (a portrait table in the card's own
scripts), `card-storage` (local-storage keys the card's own UI writes, read only: `storage.index`, `storage.per_name`
with `{name}`), `imagegen` (the optional image extension's library). Default: `imagegen` only. Kernel rules that a
pack cannot relax: https only, image file types, no query string, and the user's switch turns every remote portrait
off. `hosts` lists allowed `host[/path-prefix]` for card-script portraits: the host contains a dot and must equal the
URL's host, and a path prefix ends at a `/`. `require` lists path fragments a portrait URL must contain. List form: one fragment must appear in a URL that a
prefixed `hosts` entry allows (a shared CDN scoped to the author's folders, K-R69). Map form (amended 2026-10-01, I-18):
`{ "<host prefix>": ["<fragment>", …] }` — a URL under that host prefix needs one of its fragments, other hosts are not
constrained, so one image host's folder rule can never drop portraits that live on another host. `deny` lists path fragments never loaded. Storage keys may not start
with the kernel's reserved prefixes (`spatial`, the legacy prefixes of shipped packs, the host's own keys).

### 6.5 Multi-source priority (fixed)

**K-R44 — Priority.** Field by field, `mvu` > `chat` > `table-db` > `fallback` > `imagegen`: the highest source with a
non-empty value wins; tags are united; aliases merge; `imagegen` only fills empty fields. A pack cannot reorder this.

### 6.6 Media sources

**K-R106 — A pack-declared media source.** `entities.gallery` (optional, one per pack) points the viewer at a picture table that the card's own scripts already carry, and declares the grammar of the tags the model writes in the chat to point into it. Both are data; a pack writes no regular expression and copies no picture or address. Fields: `from` (`card-script`), `path` (a dot path into the card's script data, i.e. `getCharData('current').data.extensions`; `*` visits every item of a list, at most 8 segments), `name`, `cover?`, `sets` (the row fields holding the character name, the cover address, and an object `{ category: [addresses] }`), `tag` = `{ fields?, open?, close?, categories, digits? }`, `require?`, `deny?`, `id?`. The grammar slots are the kernel's: a tag is the three fields `name`, `category`, `number` in the order of `tag.fields` (default that order), each wrapped in `open` / `close` (default `[` and `]`, one non-alphanumeric character each), written one after the other. `category` is exactly one of `categories` (1–12 words of at most 20 characters, also the display order); `number` is 1 to `digits` (default 4, at most 6) ASCII digits; `name` is any text up to the close character, trimmed, 1–40 characters, no line break. A name that is itself a category word is no tag; text that does not fit is no tag and is left alone. Tags inside code blocks or quotes count (they are text). The kernel compiles this with a scanner (`core/gallery-spec.mjs`), not a pattern. A tag number counts from 1 and wraps round the character's list for that category (`list[(number - 1) mod length]`); a name or category the table does not have is no scene.

Addresses: the table is read at run time from the card (read only, once per chat, nothing is persisted). A list keeps its positions: an address that fails the check becomes empty in place, so the tag numbers still count the card's own list. The hosts are the pack's `entities.avatar.hosts` (K-R43: https, an image file type, no query string, the host equal and the path prefix honoured); `entities.gallery.require` and `deny` are this source's own folder rules (the avatar's `require` and `deny` are portrait rules and do not bind a gallery). The host checks every address before it sends the table; the viewer checks every address again (`galleryUrlOk` after the portrait shape check) before it reaches an `src` attribute; text reaches the page only through `textContent`. A pack without `entities.avatar.hosts`, or without `entities.gallery`, shows nothing.

What is drawn, all recomputed from the chat floors' text on every round (nothing is stored, the chat variable and local storage are untouched; a recompute matches item for item): (1) the person card gets a section grouped by category (the card's pictures, thumbnails requested only when a group is opened, no filtering of any category); (2) every tag in the chat is resolved to `{ floor, place, character, address }`: the place of a floor is the K-R105 place of that floor (`MVUBridge.floorPlace`: its patch, then its header when it resolves, then the carried variable), the node is found by the viewer with the same resolver as every place text (K-R15, K-R16), the character is the roster row whose name, alias or short name (before the middle dot) matches the table name (an ambiguous short name matches none); the place card lists "scenes here" and the person card lists the person's scenes in floor order; (3) nothing is ever inserted into a chat message (the card's own script does that). One switch (`edenMapGallery`, default on, registered in `core/storage.mjs`) turns the whole source off: nothing is read, sent or drawn. The section label is the core key `ch.gal` (neutral wording); the first pack overrides it through its manifest `strings`. Wire: `eden-map:media` (host to viewer: `on`, `id`, `cats`, `chars` when the table changes, `scenes`) and `eden-map:media-ask` (viewer to host: send again). Schema: `map/data/schema/v2/entities.schema.json` `gallery` and `entitiesBlock` in `core/pack-v2-spec.mjs`; the profile carries the raw declaration (`profile.gallery`).

## 7. items

**K-R45 — World stash rows.** `items.stash[]` is `{ id?, name, node, hidden?, note?, dc?, qty? }` (the row contract of
`map/core/stash.mjs`, with `node` in place of v1 `map` + `marker`). A row is converted to the `stash.mjs` shape as
`{ map: <owner of the node's framed view, '' when none>, marker: <node id>, place: <node name>, … }`, and its default
id is `stash.mjs rowId` of that converted row (`'s'` + base36 FNV-1a of `map|marker|place|name`). `hidden` adds 3 to
the search difficulty; a search succeeds when d20 + modifier ≥ `dc` (default 10). At most 200 rows.

**K-R46 — Pickup vocabulary.** The kernel keeps per-language lists (acquisition verbs, aspect marks, measure words,
not-items, generic words) and the strictness rule: a pickup needs a verb and a concrete noun (quoted, with a measure
word, a known item name — stash names and carried items — or a bare noun of 2–8 characters, as `core/pickup.mjs`
accepts today). A pack adds `verbs` (normal class), `verbs_strict` (strict class) and `not_items` and switches kernel verbs off with `verbs_off`, per language. The sentence patterns and the never-forms are K-R77.

**K-R47 — One store.** What the player carries lives in `<chat var>.stash` (first pack: `eden_map.stash`, decision D4).
The v1 keys for the old inventory and the virtual slot migrate into it on first read (S6). Its shape is K-R74. It is
recomputable from the chat and never written into `stat_data`.

**K-R74 — One stash store.** Every item the map knows about lives in `<chat var>.stash` (first pack: `eden_map.stash`; the key is `stash` for every pack, ASCII). Shape: `{ v: 1, items: { <id>: Row }, seq, slot, removed, since, upTo, from? }` with
`Row = { name (1–60), place (≤ 60, '' = none), map (≤ 40), node ('' = not resolved), hidden, note? (≤ 200), qty? (2–999), src, carried, msgIndex, mark? }`. `src` says where the row came from: `text` (a pickup found in a message), `map` (a world-stash row the player took), `api` (the extension API),
`legacy` (a v1 row whose origin is not recognisable); `carried` says whether the player has it with them (default: true for `text` and `map`, false otherwise). Only the Items tab reads `carried`: the place card's "stored" line and the injected digest line keep listing every row by its place.
`mark` (text rows) is a hash of the message text the row came from. `slot` is the W12 virtual slot, the map's own account of the pickups it captured: `{ name, path, virtual, msgIndex, facts: { <id>: { name, msgIndex, place? } } }`; `removed` holds the tombstones of text rows removed through the API
(at most 200, the oldest dropped; a tombstone stays when the item is picked up again, it is the only record of the removal). Ids are kept from v1 (`i<n>`, the ids of world-stash rows, name-derived ids): the 3D page's "already taken" list and the world-stash glow rely on them.
**Migration** runs once, when the chat variable has no `stash` and has one of the v1 keys (a constant in `tavern/stash-store.mjs`, read only, removed at S10): each v1 row becomes a row (`src` `text` when its id is the name-derived id, `map` when it is a world-stash id, else `legacy`), the slot is mapped key for key,
`since` is the first message the new store scans, and `from` records the keys. The v1 keys are never written or deleted: the root is replaced as a whole, so every save carries their values back verbatim, and a chat that never had them gets none. The injected digest line and slot line are byte-identical to v1 for the same rows.

**K-R77 — Pickup sentences.** Two verb classes. *Normal*: the kernel's Chinese verbs and `picks up`, `picked up`, `grabs`, `grabbed`, `pockets`, `pocketed`; the object is quoted, has a measure word, is a known item name, or is a bare noun of 2–8 characters that is not a generic word. *Strict*: `获得`, `得到`, `拿取` and `obtains`, `obtained`, `gets`, `got`, `takes`, `took`, `receives`, `received`, `acquires`, `acquired`; the object must be quoted, carry a measure word, or be a known item name (English: quoted or known only); the disposal form `把` / `将` + noun + `拿取` counts like the normal class. The Chinese patterns use the Chinese verbs only; the English pattern is verb + optional determiner (`a`, `an`, `the`, `some`, `his`, `her`, `their`, `my`, `your`, `its`) + a name that starts with a letter, and a leading determiner is stripped from the name (O-1). Forms that never count, for every verb and class, checked on each hit with the clause = the span between sentence ends (`。！？；…!?;`, a line break, or a full stop followed by a space): a negation word (`没有 没能 无法 不能 没 未 不 别`; `not`, `n't`, `never`, `no longer`) within the 4 characters (3 words) before the verb, except `不` inside `不由得 不由 不禁 不得不 不一会 不久 不料 不觉 不住`; a question (the clause ends with `？` / `?`, or with `吗 呢 么`, or starts with `是否 能否 有没有 要不要`); dialogue (the verb lies strictly inside `“…”`, `「…」`, `『…』` or a pair of `"`; a quote that opens right after the verb is the quoted-name form); an intention or condition word before the verb in the clause (`想 要 打算 准备 试图 企图 希望 如果 要是 假如 若`; `want to`, `try to`, `if`, `would`, `will`); `得到` right after a "can do" verb character (`看听想做找买办猜闻感觉等赶追吃用见`); `获得` followed by `者` or `感`; an object in the not-item lists (kernel Chinese and English lists plus the pack's `not_items`). The rules only decide what counts as a pickup; chat text is never hidden or rewritten. A pack's words are literal strings (no regular expressions): `verbs` join the normal class, `verbs_strict` the strict class, `verbs_off` removes kernel verbs from both, `not_items` extends the list. The host reads them from `profile.pickup` (the union over languages of the pack's `items.pickup`; a schema-1 pack's overlay may carry `items.pickup`, the only part of an overlay `items` block that is read: lists united per language, a bad list is `overlay-items-invalid`, any other key `overlay-items-ignored`) and passes them to `scan(text, { vocab })`; the compiled patterns are memoised by the vocabulary.

**K-R78 — Settlement write paths.** The npc and events domains of the settlement audit write to the map's own chat variable, never to `stat_data`: `<chat var>.ledger = { npc: { <name>: { place, node, msgIndex, src: 'routine' } }, events: { <id>: { type, level, node, msgIndex } } }`, at most 200 entries each (the oldest by `msgIndex` is dropped). The npc facts are the round's schedule placements (authority `verified`) of people who belong to a roster group; the landed view is the MVU present-roster places united with `ledger.npc`, a roster person without a place being a hole; the audit patches only holes (a person with a place is never overwritten). The event facts are the parsed chat events (authority `committed`), keyed by id; the patch is made when the id is not in the ledger (the type was resolved by the pack's events block, K-R50, so the audit accepts any non-empty type with the option `anyEventType`). The patches go through the settlement gate and the same save as the stash. The whole path runs only when the host switch `edenMapLedgerWrite` is on (default off, set in Settings → TavernHelper); off, no fact is produced and no read happens, and a chat never gets the `ledger` key. The ledger is a droppable cache; drawing settled events and npc places is a later step.

**K-R75 — Reconciliation.** The store is a cache of the chat. The live fold (`step`) scans each message once, from `since` on and never before it (the newest message is scanned again every round, so a swipe of it is seen), replays a message whose text changed since its rows were made
(its text rows and slot facts are rebuilt from the new text; rows another channel owns stay), and turns a pickup into a text row unless the item is already in the store or was removed at or after that message. `recompute(messages, { since, actions })` rebuilds a store from nothing: first the actions that belong to no message,
then each message in order followed by the actions recorded at it (map pickups, API puts and removals: `actionsOf(stored)`). `reconcile(stored, recomputed)` is `ok` when both hold the same ids and, per id, the same `name, src, carried, msgIndex, qty, hidden, note, mark` (and `place` when the caller used the same places)
and the same slot facts; `missing`, `extra` and `changed` list the differences. A drift is reported as a count (Settings self-check), never repaired silently; history before `since` is not backfilled.

## 8. events

### 8.1 Tag grammar (fixed)

**K-R48 — The tag grammar is fixed forever.** Compact form `⌖<category>｜<place>｜<level>｜<summary>｜<publisher>`
(full- or half-width bars; publisher optional; level 0–3, 0 = over), the kernel's reading of `⌖类别｜地点｜等级｜一句话｜发布方`.
Attribute form `<span data-spatial-event="type=…;place=…;…">`; the legacy attribute of the first pack stays parseable
forever, and the v1 field names are accepted next to their English equivalents (`type`, `place`, `title`, `level`,
`status`, `code`, `layer`, `source`, `time`, `scope`, `duration`, `xy`). Code blocks and `examples` lines are skipped;
at most `life.per_msg` events per message.

### 8.2 Taxonomy

**K-R49 — What only, never where.** The events block says what an event is: `groups[]` (legend order), `types{}`,
`fx_presets{}`, `levels[]`, `closed[]`, `examples[]`, `life`. It has no layers, match lists, outside names or zones.

**K-R50 — Type resolution.** All comparisons use normalised forms (K-R17); a type's labels are its `label`, its
`i18n.<lang>.label` values and its id. A category word resolves to: a type one of whose labels or aliases equals it;
else the type one of whose labels it contains (longest, then earliest position); else the type one of whose aliases it
contains; else, when it equals a group's id or one of its labels, type `other` coloured as that group; else `other`.
`other` always exists in group `other` with a kernel label; it matches only by equality (never by containment), and a word that resolves to nothing takes its label, icon and rarity
(a group-only word keeps the group's colour).

### 8.3 Placement and scope

**K-R51 — Where comes from the tree.** The place text (prefixed with the `layer` field when given) resolves by K-R24.
An explicit `xy` (0..1) overrides the position inside the view of `scope(node)`; `scope` resolves the same way and the
effect covers that node's subtree. An event is near the player when `scope(event.node) = scope(here)`, where
`scope(n)` is the nearest ancestor-or-self whose primary view is `tiles` or `image`, else the root; only near, live
events are injected. Events whose place resolves to nothing follow K-01.
An event is drawn on the map that frames its node's explicit `at` (a point on a map, e.g. a world place or a district), else on the map of
`scope(node)`; the label the lists show for it is that map owner's `x-layer`, else its name. A place inside a site that has its own map is
drawn on that map; the site itself is a point on the map above it (S3-2).

**K-R52 — No content filtering.** Categories, places and summaries are parsed and shown as written. An unknown
category becomes `other`; nothing is dropped because of what it says.

### 8.4 Defaults

**K-R53 — Neutral default taxonomy.** With no events block, the kernel uses neutral groups (safety, weather,
politics, society, conflict, disaster, people, other) and a few types per group, labelled from the kernel dictionary
in `zh` and `en`. The set (S4-1, `core/events-default.mjs`, labels in zh with `i18n.en.label`, English names also in `i18n/en.json` `names`): safety (patrol, checkpoint, crime),
weather (storm, rain, heat, cold), politics (policy, election, meeting), society (festival, market, notice), conflict (clash, riot, standoff, raid), disaster (fire, blackout, accident, collapse,
flood), people (visit, appearance, scandal), other. A pack with an events block but no `closed` uses the kernel's closing words (`DEFAULT_CLOSED`); with no tag template, the injected line is labelled `地图事态`.

**K-R54 — Life defaults.** In messages: `live 7`, `after 20`, `fade 40`, `merge 15` (same type and node within 15
messages = one event, where "same node" includes the part of the place text the matched word does not cover: "Neon Street" and "Neon Street back alley" stay two events; for an event whose node is `null`, same type and normalised place text), `per_msg 3`. An open
event never ages out while it is inside the scan window. A type may override any of them with its own `life`; the pack's `events.life` overrides the kernel values for all types.

**K-R55 — Effect building blocks.** `none`, `glitch`, `flash`, `shake`, `tint`, `pulse`. Screen blocks (`glitch`,
`flash`, `shake`, `tint`) obey the setting "turn off event screen effects" (D11); reduced motion keeps `pulse` only. A type declares its effect with `fx` (a kernel block
name, or a key of `fx_presets`); the viewer triggers the block on any open event whose type resolves to it — never on a type name (S4-1). Preset fields: `intensity` (0–1; absent = the event's
level 1–3 decides the strength), `x-messages` (how many messages the effect lasts; the event's own `duration` wins, default 3). A type's `x-default-off: true` hides it in the list and on the map
until the user first touches the legend filter.

## 9. layers

**K-R56 — Reserved shape.** `layers[]` in menu order: `{ id, type, source, slot, applies, style, menu, legend }`.
`slot` is one of the ten fixed slots, bottom to top: `base`, `depth-haze`, `fog`, `routes`, `trips`, `events`,
`markers`, `labels`, `fx`, `interaction`. `type` is a building block (`point`, `area`, `line`, `label`, `tint`,
`particles`, `flow`; S8 adds `sound`). S8 designs the rest and may tighten every property except `id` and `slot`.

**K-R79 — The layers block.** A layer is one row `{ id, type?, slot?, source?, data?, filter?, applies?, style?, menu?, legend?, off? }` (schema
`map/data/schema/v2/layers.schema.json`; `_…` and `x-…` keys are kept, K-R04). `id` matches `^[a-z][a-z0-9_-]{0,31}$`. The engine ships a kernel list
of its own layers (`core/layer-defaults.mjs` `KERNEL_LAYERS`: the 17 viewport layers of S8-1 plus `nav-ops` and `local-props` of S8-3, each with its slot, kind, order, menu row and the building
block it draws through, `type: null` when kernel code draws it); each module registers through its declaration (`declared(id, impl)` in
`app/layer-host.mjs`), so the registry holds exactly the facts of the list plus the module's functions. The effective list is the kernel list merged
with the pack's rows by id (`mergeLayers`, pure, `core/layer-spec.mjs`): a row whose id is a kernel id **adjusts** that layer, keeping only `menu`
(label, title, `i18n`, `order`, `default`, `hidden`), `applies` (ANDed with the layer's own code rules), `legend` and `off` (the layer stays
registered, becomes invisible and loses its menu row); its `type`, `slot`, `source`, `style`, `data` and `filter` are ignored and reported
(`layer-kernel-fixed`), and a kernel layer's default visibility stays its own stored switch. Any other id **declares** a layer: it needs `type`, `slot`
and a `source` or `data`, else it is dropped (`layer-incomplete`); a repeated id keeps the first row (`layer-duplicate`); `source: "kernel"` is
refused (`layer-source`: the kernel list is closed). Menu order: a kernel row keeps its kernel order (10 … 80) unless `menu.order` is given; a new
layer's order is `menu.order`, else `1000 + its index in the array`. Limits, for every pack (shipped or foreign; the runtime is lenient, the
tools strict, K-R06): at most 32 new layers, 1000 features per layer, 2000 points per feature, 8 legend rows per layer, 16 `style.by` kinds, 8
distinct MVU paths, a `file:` source of at most 256 KB under the pack's base after URL resolution (K-R64). Style values are re-checked when used: a
colour is `#rrggbb`, `#rrggbbaa` or a K-R58 token name, numbers are clamped to their ranges, an icon is a kernel icon name (`prop:` icons are for
local layers, S8-3), and a bad one is dropped and listed (`style-value`, `style-unknown`). A pack with no `layers` block uses the kernel list
unchanged. At run time the pack's rows reach the viewer as `RT.layers` (the node runtime, both schemas); at boot `applyPackLayers` merges them and
adjusts the registered kernel layers through `registry.patch`; new layers are kept in `packLayers` and drawn from S8-2. `validate2` checks the
block with the same `normLayer` the runtime uses.

**K-R81 — Sources and features.** A feature is `{ id?, view?, at?, node?, pts?, closed?, r?, kind?, label?, i18n? }`: coordinates are fractions
(0..1) of the open view's width and height (K-R31); `view` defaults to the layer's single `applies.views` entry; a `node` feature is drawn where
the current-location engine draws that node; a feature with neither a usable view nor a node is dropped (`feature-no-view`); a block needs its
geometry (`point`, `label`: `at` or `node`; `line`, `flow`: at least 2 points; `area`: at least 3 points, or `at` and `r`; else `feature-geometry`).
`label` is at most 60 code points and is shown as text only (K-R64). `source` is one of: absent with `data`, or `inline`; `file:<path>`
(a `.json` file `{ features }` under the pack's base); `view:routes`, `view:markers` (the open view's own data files); `events`, `people`, `items`,
`routine` (what the entity adapters and the schedule already hold, K-R71, K-R74; nothing is invented); `mvu:<path>` and `ops` (host-fed, S8-3);
`kernel` (the kernel list only). A foreign pack (K-R63) may use every source except `kernel`; local layers (S8-3) may not use `file:`, `mvu:` or `ops`
and their ids start with `local-`. `parseSource`, `normFeature`, `normLayer` in `core/layer-spec.mjs` are the one implementation.

**K-R82 — applies.** `applies = { views?, kinds?, nodes?, node_types?, periods?, dark?, data?, mvu? }`: `views` the open view id, `kinds` the open view kind,
`nodes` the open view's owner node (or an ancestor of it), `node_types` the owner's type, `periods` the current period band id (K-R39), `dark` whether
that band is dark, `data` whether at least one feature is on the open view (default true for `point`, `label`, `line`, `area`, `flow`, not required
otherwise; kernel layers do not require it), `mvu` a host-fed value condition (S8-3). Every key given must match (AND); inside a list any entry matches
(OR; an empty list constrains nothing); an absent or empty `applies` applies everywhere; unknown keys are ignored. `appliesTo(applies, ctx, type)` in
`core/layer-spec.mjs` is pure; `registry.applicable(id, ctx)` returns true without `applies`, the function's result for a function, `appliesTo` for an
object. S7 owns the greyed menu row and the pause of an inapplicable layer's animation; S8 owns the data form and the evaluator.

**K-R83 — Menu rows and visibility.** `menu = { label, title?, i18n?, order?, default?, hidden? }`: the layer menu is data driven (one row per
registered layer with a `menu`, by `menu.order` then registration); a row's text is `menu.i18n.<lang>` first, then `menu.label`, and for a kernel row
without a pack label the dictionary key it already has; texts are set with `textContent`. A pack's `label` or `title` on a kernel row replaces the
dictionary text for that row. `menu.default` (default true; always off for `sound`) is the visibility of a pack-declared layer until the user
switches it; the user's choice is kept in the storage key `edenMapLayers` (one JSON object, layer id to `1` / `0`; registered in `core/storage.mjs`,
owner `app/layer-host.mjs`; read from S8-2), namespaced per pack by the storage service like every key. Kernel layers keep their existing keys. After
the pack's rows are applied the menu is rendered once more.

**K-R80 — Building blocks and style.** A declared layer is drawn by one of eight kernel blocks, chosen by its `type`; the pack gives geometry and
style values only. `point` (an HTML element in the map overlay, constant screen size) and `label` (text, `tone` plain | chip, `size` micro | small | body)
sit at a feature's `at` or `node`; `line` (`pts`, `closed`) and `area` (`pts` closed, or `at` + `r` as a circle, `r` a fraction of the width) share
one SVG overlay per layer per view with non-scaling strokes; `flow` (dots with fading trails moving along `pts`, brighter and longer at night),
`particles` (a kernel weather preset over the whole view) and `tint` (one translucent fill) draw on a canvas in the layer's slot; `sound` has no pixels
(S8-3). Style keys, values and defaults: `color` (`#rrggbb`, `#rrggbbaa` or a kernel colour token name; default `--accent`), `opacity` 0..1, `by` (up to
16 per-kind overrides), `size`, `icon` (a kernel icon name), `pulse`, `tone`, `width` 0.5..8, `dash` (up to 6 numbers), `halo`, `badge` (a `label` chip filled with the feature's colour, K-R110), `fill` and `fill_opacity`,
`speed`, `density`, `trail`, `path` (a `flow` also draws its polyline, one layer for one thing the user sees), `preset`; every value is re-checked
at run time and a failing one falls back to its default (K-R64); colours reach CSS only through custom properties and canvases through a value
resolved from the page. A pack-declared animated layer draws nothing while `prefers-reduced-motion: reduce` is set (pulses become static); the data-saver
tier halves the dots and particles, as the kernel's own traffic and weather layers do. Those two layers and the routes layer draw through the same
renderers (`core/layer-geometry.mjs`, `app/block-canvas.mjs`, `app/block-overlay.mjs`), proved by recorded-call tests.

**K-R86 — Host-fed values.** (a) Card variables, read only: the host reads the variables a pack's layers name: each `mvu:<path>` source and each `applies.mvu.path`
of the pack's layer rows (the overlay's `layers` for a schema-1 pack), distinct, at most 8, each matching the vars path pattern (`profile.layerPaths`, `core/profile.mjs`).
`MVUBridge.layerValues(paths)` (still the only module that touches the host globals) reads them from the once-per-round `stat_data` snapshot through the path reader
(a `[value, note]` pair is unwrapped, so a list of exactly two strings reads as such a pair: write three or more entries or an object; a missing path is absent); a value over
4 KB of JSON, or a list over 200 items, is cut and marked `…truncated` (`core/layer-values.mjs`). The host posts `eden-map:layer-data { values: { <path>: value } }` when the
JSON of the values changed and again on `eden-map:ready`; nothing is written to `stat_data`. The viewer keeps the last values: an `mvu:<path>` source yields point features from
the value (a list's entries, an object's keys, or one string; each located like any place text, the ones not drawn on the open map are dropped; at most 200), and `applies.mvu =
{ path, equals? | min? | max? | truthy? }` holds when the value exists and every key given holds (`equals` strict, `min` / `max` numeric, `truthy` by truthiness; `layerContext().mvu` = the
values). (b) Navigator overlays (I-04): the navigator's validated `OP_CLUE { name, nx, ny, urgency }` and `OP_MARKER { id, nx, ny, label }` are kept by the host for the session
(`tavern/nav-ops.mjs`), each row stamped `{ floor, map }` (`map` = the map of the player's current place, `null` when unknown), rows older than 20 messages dropped, each list capped at 12,
and posted as `eden-map:ops { clues, markers }` when they change, on `eden-map:ready` when non-empty, and as empty lists on a chat change. The kernel layer `nav-ops` (slot `markers`, `point`
block, on by default: the navigator is the opt-in; stored choice in `edenMapLayers`) draws a clue where its name is drawn on the open map, else at `nx` / `ny` on its stamped map; it pulses and
grows with its urgency (1..3); a marker is drawn at `nx` / `ny` on its stamped map with its label; a tooltip says it is a navigator suggestion. Its row shows only while it holds something
for the open map. Nothing is written to the chat, the chat variable or a worldbook.

**K-R87 — Local layers.** `window.EdenMap` gains `addLayer(def)` → `{ ok, id, problems }`, `removeLayer(id)` → boolean, `setLayerData(id, features)` → `{ ok, problems }` and `layers()` →
`[{ id, type, slot, visible, applicable, source, count }]` (methods are added, none renamed; `EDEN_API` in `tavern/extension-api-contract.mjs` gains the four). `def` is a layer
declaration validated by the same `normLayer` as a pack's with trust "local": its id starts with `local-` (a kernel id is refused), its source is inline, `view:*`, `events`, `people`, `items`
or `routine` (never `file:`, `mvu:`, `ops`), at most 16 local layers; a repeated local id replaces the previous layer; a local layer without a menu gets a row labelled with its id; a point
style may say `icon: "prop:<id>"` (K-R88). A local layer is drawn by the same blocks, lives for the page session (a script re-adds it on load, as it re-subscribes with `on`) and only its
visibility is remembered (`edenMapLayers`). On the host page the same methods forward to the viewer when it is open; the host keeps the declarations and replays them on every `eden-map:ready`.

**K-R88 — The local prop pack.** The user's own files (glb, png, webp, svg) are kept in this browser only: IndexedDB database `spatialProps`, store `props`, key `<pack id>::<prop id>`,
record `{ id, name, type, bytes, w?, h?, createdAt, blob }` (`app/prop-store.mjs`). Validation is technical only (`core/prop-pack.mjs`): glb = `glTF` and version 2, at most 8 MB; png = the
8-byte signature; webp = `RIFF` .. `WEBP`; images at most 1 MB and decodable; svg = UTF-8 text with an `<svg` root, at most 256 KB, refused when it contains `<script`, `<foreignObject`, an
`on…=` attribute or a `javascript:` link; at most 64 props and 64 MB per pack. Images are shown only through `blob:` object URLs in `<img>` elements; nothing is sent to the host, the model or
any URL. Methods of `EdenMap`: `addProp(file, { name })` → `{ ok, id, problems }`, `removeProp(id)`, `props()` → `[{ id, name, type, bytes }]`, `placeProp(id, { map, at } | { pick: true })` →
Promise of `{ ok, map, at }` (pick = the next click on the open map, Escape cancels) and `unplaceProp(id, map)`. Placements `{ prop, map, at }` (at most 200, `at` = fractions of the view's width
and height) are per chat in `edenMap:chat:<chat id>:props`; the kernel layer `local-props` (slot `markers`, `point` block, on by default) draws them on flat maps (an image as `<img>`, a glb as the
`cube` icon with its name; the row shows only while the open map holds one). They are the user's own decoration: local, never a chat fact, never injected. Placing a glb inside a 3D page is the
editor's job (S9b).

**K-R89 — The `sound` block.** A `sound` layer (slot `fx`, no pixels) plays procedural ambience: its data (inline `data`, or the file of a `file:` source) is `{ rules: [{ match, scenes }], recipes?,
master? }` (`core/ambience.mjs`: recipes of filtered noise and harmonic oscillators, the first rule whose `match` keys (`map`, `layer`, `place`, `weather`, `night`) all equal the context wins, rain
and storm add a rain scene); `match.map` is the open view id and `applies` decides where the layer is live at all. Audio never starts by itself: a sound row is off whatever `menu.default` says
until the user switches it on (the stored choice `1` in `edenMapLayers` is honoured on a later visit), the AudioContext is created only after a user gesture (switching the row on is one; a stored
"on" waits for the first click or key), and it is suspended while the page is hidden or no sound layer is live (visible and applicable). The scene set follows the open view, the day / night band
(`eden-map:clock`) and the weather, replanned at most every 2 s on messages. No audio file exists anywhere; `window.SoundApi.describe()` lists each layer's live scenes.

**K-R107 — The transit block.** `transit` is an optional top-level block (inline, or a relative path resolved by `resolveBlocks` like every block; a schema-1 pack carries it in its overlay, K-R108) that names the stations, lines, links and districts of a pack; the layers, the router (K-R109) and the host read the same data. A pack without it behaves exactly as before. Shape: `{ modes?, stations, lines?, links?, districts?, options?, style?, _…, x-… }`. **Modes:** `modes.<id>` (id `^[a-z][a-z0-9_]{0,15}$`) = `{ label (≤ 24), i18n?, trip: road | rail | underground | air | teleport, color?, dash? }`, merged by id over four frozen kernel defaults `walk`, `metro`, `maglev`, `air` (a row with a kernel id may override `label`, `i18n`, `color`, `dash`; its `trip` stays; a new id needs `label` and `trip`); at most 8 in all. **Stations** (1 … 300): `{ id, node?, view?, at?, name? (≤ 40), i18n?, district?, hidden? }`. A node station names a node of the pack's tree (its position is where the viewer draws the node, its name is the node's); a point station has `view`, `at` (0..1 of the view's width and height, K-R31) and `name`; `hidden` keeps a station for routing without a dot. **Lines** (≤ 24): `{ id, number? (1–3 letters or digits), name, i18n?, mode, color (`#rrggbb`, never a token), stops (2 … 80 station ids, each at most once), min, loop?, oneway?, wait? (0 … 30, default 0) }`; `min` is one number for every segment or an array with one number per segment (`stops − 1`, or `stops` when `loop`), each 0.1 … 600. **Links** (≤ 600): `{ from, to, mode, min, oneway? }` (walk transfers and single hops). Segments and links run both ways unless `oneway`. **Districts** (≤ 64): `{ id, name, i18n?, view, pts (3 … 200 points) | node + r (a fraction of the width, default 0.06), function, danger 0 … 3 }`; `function` is one of `civic commerce residential industry military religious education medical leisure transport nature restricted other` (an unknown value becomes `other`, never a refusal). **Options:** `transfer_min` 0 … 30 (default 3), `walk_m_per_min` 20 … 200 (80), `access_max_min` 0 … 60 (12), `detour` 1 … 2 (1.25). **Style:** `functions.<fn>.color` (hex or kernel token, K-R58), `width` 2 … 8 (4), `labels` (true). **Healing** is per item (K-R06): `core/transit-spec.mjs` `normTransit(block, { nodes, views })` (`nodes` / `views` are id predicates or null) drops the bad part, lists `{ code, id?, path? }` and keeps the rest; the codes are `transit-invalid` (not an object, or no station survives: the block is null), `transit-limit`, `transit-duplicate`, `transit-mode-invalid`, `transit-station-invalid`, `transit-station-node`, `transit-station-view`, `transit-line-invalid`, `transit-line-stop`, `transit-line-min`, `transit-link-invalid`, `transit-district-invalid`. A dropped station takes every stop and link that names it with it (the minutes of a removed stop join the neighbouring segment); a line left with fewer than 2 stops is dropped. A healed block heals to itself. The block is at most 256 KB of JSON; a foreign pack (K-R63) has the same limits; every string reaches the page as text and every colour, number and id is re-checked at run time (K-R64). `validate2` runs `normTransit` with the pack's node ids and view ids (implicit views count, K-R96) after the cross check; the schema is `map/data/schema/v2/transit.schema.json`, checked by `tools/check_pack.py`. The kernel layers that draw the network and its route come with K-R110 (S8-4b).

**K-R109 — The router.** `core/router.mjs` (pure) plans over a transit block. `buildGraph(transit)` makes one edge per line segment (`ride`, with the line and its minutes) and per link (`link`), both ways unless `oneway`, adjacency in declaration order (lines first, then links), plus `linesAt` and the derived interchanges (a station served by two lines, or by one line and a link to a station served by another). `attach(graph, end, env)` attaches a place (`end = { node?, pos? }`, `env = { tree, pos(stationOrEnd), extent(view) }`) in this order and stops at the first step that finds stations: **at** (a station on the same node, 0 min), **inside** (a station on the nearest ancestor node), **within** (stations on descendant nodes, all of them), **walk** (only with positions: stations on the same view whose walk `distance_m × detour / walk_m_per_min` is at most `access_max_min`, nearest first, at most 4; the view's `extent_m` gives the metres); nothing found = not on the network. `planRoute(graph, from, to, { env, modes, src })` runs a shortest-path search over the states (station, current line, has ridden) from a virtual source (the start candidates at their access minutes) to a virtual target. Cost is minutes: a ride adds its segment minutes, boarding a line other than the current one adds its `wait` and, when the path has ridden before, `options.transfer_min`; a link adds its minutes and leaves the line; `modes` removes ride and link edges of other modes (access legs are always walks). Ties: total minutes, then ride legs, then stops, then declaration order, so the same inputs always give the same plan. A direct walk (both ends positioned on one view, at most 2 × `access_max_min`) wins when it is not slower; two ends on the same node or one inside the other, or no path, give `null`. A **plan** is `{ v: 1, src: 'user' | 'op', from, to: { node, station, name }, legs: [{ kind: walk | ride | link, mode, line, stops, min }], min, changes, modes, danger }`: consecutive rides of one line and consecutive links of one mode merge into one leg; transfers and waits are not legs; `min` is the whole minutes (at least 1), `changes` = ride legs − 1, `danger` = the highest danger of the districts of the stations on the path (a station's own `district`, else a district on its node or an ancestor), `null` when none is known. `checkPlan(graph, plan, { tree })` is the host's re-check: stations exist, ride stops are consecutive on their line in an allowed direction, link legs match a link of their mode, legs chain, a given node exists; it recomputes every minute from the network, caps an access walk at `access_max_min` (a direct walk at twice that), rebuilds the names from the tree and the stations, and returns the rebuilt plan or `null`. `planText(plan, { lang, templates, nameOf, modeLabel, lineName })` fills the pack's `llm.templates.<lang>` keys `route_plan`, `route_leg`, `route_danger` (kernel defaults in `KERNEL_TEMPLATES`, zh and en; placeholders `{legs} {min} {changes}`, `{from} {to} {how} {min}`, `{danger}`), joins the legs with `；` / `; `, appends `route_danger` when `danger ≥ 2`, and never throws (a missing name is `?`). `routeOp(op, { graph, locate, here, floor, map, tree })` validates a suggested-route op row `{ to (1 … 40 characters), from? (1 … 40), why? (≤ 60) }`: both ends must locate to nodes (`from` defaults to the current location), the nodes must differ and not contain each other, the pack must have a network; the result carries the texts as written, both nodes, `why`, `floor` and `map`, else `null`. No function here touches the DOM, the host or storage; drawing is `core/transit-geometry.mjs` and `core/thematic.mjs` (S8-4b wires them).

**K-R110 — Kernel layers `transit` and `route-plan`; the thematic drawing.** Two kernel layers join the list of K-R79 (`core/layer-defaults.mjs`): `transit` (slot `routes`, kind `osd`, block `line`, order 2, `applies: { data: true }`, menu row order 32 `transit.layer` "Transit network" / "交通网", id `lyr-transit`) and `route-plan` (slot `trips`, kind `osd`, block `line`, order 1, `applies: { data: true }`, no menu row). Both draw only through the S8-2 blocks: `core/transit-geometry.mjs` builds synthetic layer declarations for the open view (`transitLayers`, `planLayers`) and `app/block-overlay.mjs` draws them; neither module has code that draws a pixel. `transit` is **off by default** (its choice lives in `edenMapLayers`, no new key) and its menu row shows only where the open view has something to draw (stations, districts or a stub); a pack adjusts both rows like any kernel layer (K-R79: label, `applies`, legend, `off`). **Districts:** an `area` per district, kind `d-<function>-<danger>`, filled with the colour of its function (the pack's `style.functions.<fn>.color`, else the kernel palette `civic #6c8ebf`, `commerce #e0a64b`, `residential #8fb86a`, `industry #9a8f86`, `military #b5654f`, `religious #c9b25e`, `education #5aa9a1`, `medical #d97a9a`, `leisure #a685d1`, `transport #7f9fb3`, `nature #5f9f63`, `restricted #c05050`, `other #8a919b`) at fill opacity 0.16, outlined by danger (0: the fill colour 0.8 px; 1: `--gold` 1.2 px dashed `[6, 4]`; 2: `--alert` 1.6 px `[6, 3]`; 3: `--alert` 2.4 px solid), labelled at the centroid `<name> · <function word>` plus ` · <danger word>` for danger 1–3. **Lines:** one `line` per segment drawn on the view, kind `l-<line id>`, the line colour, `style.width` (default 4), halo, **octilinear** (horizontal, vertical or 45°, one bend near the end closer to the line's previous stop, measured with y × the view's aspect); a segment shared by k lines is shifted sideways by `(i − (k − 1) / 2) × 0.004` in declaration order. Links are drawn in their mode's look, a link or ride whose other end is on another view leaves a chip stub `→ <station> · <view title>`. **Stations:** a dot per visible station (`s`, size 7), interchanges a white ring (`x`, size 11); **badges:** the line number at the first and last stop on the view (a loop: once) as a chip filled with the line colour. **Label hierarchy:** 1 district names (`body`, plain), 2 interchange names (`small`, chip), 3 other station names (`micro`, plain), 4 badges and stubs; a node station whose node already has a marker label on the view gets no station label; `style.labels: false` drops ranks 1–3; the existing label decluttering runs after each draw. **The planned route** (`route-plan`): ride legs along the same paths in the line colour at `width + 3` with halo, links in their mode's look at `width + 1`, walks dotted `--accent` 2 px, points `p-start` (`--ok`, 12), `p-end` (`--alert`, 12, pulse) and `p-change` (white ring, 12); a suggestion (K-R113) is dashed `[8, 6]` at opacity 0.8 with no pulse; a leg that leaves the view ends in a stub `→ <view title>`. **Legend (K-R84):** the `transit` layer fills its own legend rows while it is visible: one per function and per danger level present on the view and one per line drawn, each with a swatch of its colour. **K-R80 amended:** the `label` block takes the style key `badge` (boolean, default false): the chip is filled with the feature's colour (`--lc`) and its ink is `#14121a` when that colour is light, else `#ffffff` (`--lc-ink`); a token colour keeps white ink. Pack and station text reaches the page only as text (K-R64).

**K-R112 — Trips along the network.** For each trip the trips layer draws (the player's and the characters'), when the pack has a transit network and both ends attach (K-R109, positions from the drawn places), the viewer plans the route with `modes` = the network modes whose `trip` class equals the trip's mode (all modes when the trip has none; the kernel `walk` mode counts as class `road`); trips of class `air` and `teleport` are never routed. A plan with at least two points on the open view replaces the arc by the plan's path (the same octilinear geometry, without parallel offsets) in the trip's own `svg.trip` element (same classes, opacity and colour), the tap target at the middle of the path's length, and the trip's card gains "Along the transit network (estimated)" (`tr.along`). No plan, no network or an end that does not attach: today's arc, unchanged. The plan is worked out once per (from, to, mode) and the trips are drawn again when it resolves; the in-transit arc ("on the way from A to B") is not routed.

**K-R113 — Suggested routes.** The host keeps at most 3 route suggestion rows for the session (S7's validated `routeOp` results, handed to `addSuggestions(rows, { floor, map })` of `tavern/route-flow.mjs`; rows are stamped with the floor and the map of the player's place, dropped after 20 messages and on a chat change, held in the same state as the navigator's clues and markers) and sends them in `eden-map:ops` as the optional field `routes` (an older viewer ignores it). The viewer plans each row from its two nodes (`src: 'op'`, positions as for a user plan) and draws it on `route-plan` dashed; a tap on its end point opens a card "Suggested route" with the reason (`why`, as text), the plan summary and "Use this route" (`rt.adopt`), which turns it into the user's plan (K-R111). A suggestion never reaches `{{eden_route}}`, the chat or any store. The S7 operation itself (`OP_ROUTE`, its DSL validation and prompt text) is S7's; S8-4b delivers the router API and this delivery side.

**K-R130 — The AI advisor's suggested route (`OP_ROUTE`).** The restricted operation DSL of the background advisor (`tavern/operation-dsl.mjs`, K-R86's sandbox) gains one op, `OP_ROUTE { to, from?, why? }`: `to` a string of 1–40 characters (required), `from` a string of 1–40 characters (optional; absent = the player's current place), `why` a string of at most 60 characters (optional); a wrong type or length drops the op and counts it (throw-not-coerce, as the other ops). At most **one** `OP_ROUTE` is kept per response; a second one is dropped and counted (`MAX_OPS` stays 3). A `why` that echoes an event example is dropped like any echoed text. `apply` hands the host `routes: [{ to, from?, why?, src: 'op' }]`. The host (`tavern/llm-flow.mjs` `planRoutes`) calls `routeOp(row, { graph, locate, here, floor, map, tree })` of `core/router.mjs` for each row: an accepted result goes into the suggestion store of K-R113 (at most 3, aged out after 20 messages, sent in `eden-map:ops.routes`, drawn dashed by `route-plan`, "Use this route" adopts it); a row the router cannot place is counted as dropped in the advisor's ledger; when the pack has no transit network nothing is drawn and the `why` text joins the advisor's toast. The row is never written anywhere. The advisor's system prompt names the op in its op list and gains one line for it (`- OP_ROUTE {to, from?, why?}：建议的路线；地点必须用输入里出现过的写法`); that line goes only to the user's own endpoint.

## 10. ui and llm

### 10.1 ui

**K-R57 — Strings.** `ui.strings.<lang>.<i18n key>` overrides the kernel dictionary for that language (v1's `key@en`
becomes `strings.en.key`). Also in `ui`: `start` (the node shown first; default the root), `tabs` (subset and order of
`places`, `events`, `characters`, `items`; default every tab with data), `legend` (node types → label, kernel icon) and
`levels` (K-R35). Protected keys cannot be overridden: the wording of the consent, remote-picture and privacy switches
and of the self-check (S7 publishes the list).

**K-R58 — Theme.** `theme.accent` plus `theme.tokens` overrides, limited to the kernel's colour, radius and font-size
tokens (`--accent*`, `--ink*`, `--bg*`, `--surface*`, `--line*`, `--muted`, `--gold`, `--ok`, `--alert`, `--on-*`,
`--map-label-*`, `--glow*`, `--focus`, `--r-*`, `--fs-*`; S7 publishes the final list). A value is one to four
space-separated terms, each a hex colour, a numeric `rgb()` / `rgba()` / `hsl()` / `hsla()`, a number with an optional
unit (`px`, `rem`, `em`, `%`, `vh`, `vw`), a keyword, or `var(--<kernel token>)`: no quotes, backslashes, `url(` or
other functions (K-R64).

**K-R84 — Legend rows from layers.** `legend = [{ label, desc?, i18n?, kind? }]` (at most 8 rows, K-R79). The drawer's legend tab lists the pack's
`ui.legend` rows first (unchanged markup), then for each registered, visible and applicable layer in menu order a heading (the layer's menu label) and
its rows; each row starts with a small swatch drawn from the layer's style (`kind` picks `style.by[kind]`): a stroke for `line` and `flow`, a filled
square for `area` and `tint`, a dot for `point`, nothing for `label`, `particles` and `sound`; the colour is set through a CSS custom property after the
K-R64 re-check. The tab shows when the open view is not a 3D page and either today's rule (depth data and `ui.legend` rows) or at least one layer
legend row holds, so a pack without layer legends sees no change. The pane is rebuilt when a layer's visibility or applicability changes or the map changes.

**Amended by LEGEND-1 (D35, K-R84 / P-03):** the drawer legend tab is opt-in for every pack: it exists only when the pack names `legend` in `ui.tabs` (the first pack does not, and its `ui.legend` rows are deleted); without the opt-in the layer menu descriptions (`menu.title`) are the only explanation of a layer.

### 10.2 llm

**K-R59 — Model interface.** `templates.<lang>` with placeholders (events `{tag} {items}`; event_item `{place}
{source} {type} {severe} {text}`; state `{place} {time} {people}`; custom `{items}`) and `worldbook.book` /
`worldbook.entries[{ id, name, content, keys?, enabled? }]`. `templates.<lang>` may also carry `route_plan`, `route_leg` and `route_danger`, the sentences of a planned
route (K-R108, K-R109). The kernel keeps the injection budget, the degradation
order, the consent switch, the entries' position, depth, order and recursion settings, and the rule that only our own
add-on book (K-R05) and entries carrying our ownership marker are ever written. When a foreign pack's text goes live is
K-08.

**K-R111 — Planning a route.** *In the viewer* (`app/route-plan-view.mjs`, `app/transit-env.mjs`): when a place card opens, the viewer resolves the current location (`#here`) and the card's place to ends (`{ node, pos }`: the tree's node, and where the place is drawn, read from its map's points file through the JSON cache, so the answer is asynchronous), runs `planRoute` and, when a plan exists, adds one link to the card, "Route · about {min} min" (`rt.link`); no plan, no link, no message (brief rule 6). Choosing it (click or Enter) makes the plan the user's (`src: 'user'`), draws it on `route-plan`, opens the plan card (title `<from> → <to>`; "About {min} min · {changes} change(s)"; a list of legs with the line badge in the line colour, the line or mode name, `from → to`, stops and minutes; a row for each change; a line "Passes a dangerous district (level n)" when `danger ≥ 2`; "Clear route") and sends `eden-map:route-plan { plan }`. While a user plan exists and the location changes: a new location that is the destination (or inside it) clears the plan (arrival); else a new plan from the new location to the same destination replaces it and is sent; no route from there leaves the plan as it was. `eden-map:route { plan }` from the host replaces the local plan (the host's copy is the truth; `null` clears); without a host (the standalone viewer) the local plan stays. Colours reach the card only through custom properties after the K-R64 re-check. *Messages* (`core/protocol.mjs`): `eden-map:route-plan` (viewer to host, `plan: object?`: the user chose, or with `null` cleared, a plan) and `eden-map:route` (host to viewer, `plan: object?`: the plan the host holds). *Host* (`tavern/route-flow.mjs`, session only, nothing is persisted or written to the chat, the chat variable, `stat_data` or a worldbook): on `eden-map:route-plan` the plan goes through `checkPlan` against `geo.transit` (K-R109) and, when accepted, is held with the floor it was chosen on and echoed rebuilt (minutes and names are the host's); a refused plan leaves the held one (echoed); `null` clears. A new location that is the plan's destination or inside it clears it; so does a chat change, and a plan older than 20 messages. `eden-map:ready` sends the held plan again. **`{{eden_route}}`** (behind its existing switch, `edenMapMacros`, default off) is the last player trip `from → to` (exactly today's text) plus, when a plan is held, ` · ` (only when there is a trip) and the plan sentence of `planText` in the pack's language, filled from `llm.templates.<lang>` `route_plan`, `route_leg`, `route_danger` (kernel defaults, K-R109); with no plan held the value is byte-identical to the value before S8-4b (pinned by a test). The class macros live in `tavern/route-flow.mjs` (`eden_here` and `eden_fly` unchanged).

**K-R65 — Model-facing text of foreign packs.** Before a foreign pack's templates or worldbook entries reach the host,
the kernel neutralises syntax the host would execute — this is not content filtering (K-R52): every `{{…}}` macro
except `{{user}}` and `{{char}}` is escaped, as are `<%` and `%>`; keys shaped like a regular expression (`/…/flags`)
are refused. Caps: 16 entries, 2000 code points per entry, 16 000 in total; an entry without keys (always on) counts
against the kernel's injection budget.

**K-R103 — Go-live of a foreign pack's model text.** The `llm` block of a foreign pack (templates, worldbook entries,
book name) reaches the host only while the host switch "use this pack's text for the model" is on for that pack and the
user has confirmed the current text: the switch stores `{ <pack id>: <fnv36 of the canonical JSON of the llm block> }`
under `edenMapPackLlm`; when the stored hash differs from the pack's, the switch reads as off until the user confirms
again in Settings (a passive line, no dialog). Default off. Off, the kernel templates in the pack language are used and
no worldbook entry is written. K-R65 still applies when it is on. Shipped packs are not affected. The switch travels in
`eden-map:th` `prefs` (`packLlm`).

## 11. legacy names

**K-R09 — Read old, write new.** `legacy` names what a pack used before schema 2: `chat_var`, `storage_prefix`,
`worldbook_marker`, `worldbook_book`, `protocol_prefix`, `event_attr`, and `write` (`legacy` | `new`, default `new`).
The engine reads the new name; when it is empty it reads the legacy name. `write: new` writes the new name (the
migration happens by use; nothing is migrated by hand); `write: legacy` keeps writing the legacy name. Two rules have
no expiry: worldbook entries carrying either marker are ours (a missed old marker would make us treat our own entries
as the user's), and the legacy event attribute is parsed forever (it lives in stored chats). The protocol accepts both
prefixes and sends the new one only after the peer's handshake reports protocol 3 (S10). compat-v1 declares the v1
names with `write: legacy` for every v1 pack (v1 used the worldbook marker, the protocol prefix and the event
attribute for all packs, not only the first), so nothing changes before S10 (decisions D5, a). `legacy` is honoured
only for shipped packs (K-R63), and a name on the kernel's reserved list is refused even there: `stat_data`,
`display_data`, `delta_data`, `schema`, and another shipped pack's names.

## 12. Defaults and degradation

**K-R60 — What the engine does when a block is missing.**

| Missing | Engine behaviour |
|---|---|
| `nodes` | grow from chat (K-R26); until then a single run-time root `__root` named after the title |
| `views` | implicit schematic views on the root and on every node with children (K-R96); view resolution ends at the root's schematic view (K-R34) |
| a node's view | nearest ancestor view focused on the node (K-R34) |
| a node's position | listed, drawn near the frame centre as "position unknown" (K-R32) |
| `vars` | auto-discovery (K-R38) |
| `vars.periods` | the four default bands (K-R39) |
| `entities` | discovered groups (K-R41); name and place only |
| `entities.fields` | role and stage discovered (K-R42) |
| `entities.avatar` | image extension only, else initials |
| `items` | no world stash; kernel pickup vocabulary; carried items still work |
| `events` | neutral taxonomy (K-R53) |
| `events.levels` | kernel labels |
| `layers` | built-in default layers |
| `ui` | kernel strings and theme; start = root; every tab with data |
| `llm` | kernel templates in the pack language; no rule entries, no add-on book |
| `credits` | card fields read at run time; no pack credit line |
| `legacy` | names derived from the id (K-R05) |
| `match` | the pack is used only when chosen explicitly (S9) |
| `lexicon` | kernel word lists only |
| `lang` | the UI language |

## 13. Versioning

**K-R61 — Two schemas side by side.** `schema: 1` stays frozen (`docs/pack-schema-v1.md`); `schema: 2` is this
contract. `map/core/compat-v1.mjs` converts a v1 pack to v2 in memory (pure, deterministic, no file written), so the
first pack and `town` run unchanged; new packs are written in v2. Modules migrate to v2 one by one (S2–S6) and read
only v2 after their step.

**K-R62 — Adding schema 3.** A breaking change raises `schema` for the whole document (blocks are not versioned
separately), adds `map/data/schema/v3/`, and adds a pure `migrate2to3(pack)` so v2 packs keep working; `schema: 2`
then freezes. Adding an optional field, or promoting an `x-` field, stays within schema 2 when old readers can ignore
it.

**K-R67 — The v2 overlay of a schema-1 pack.** A schema-1 pack (manifest, `maps.json`, …) stays frozen; the v2 data it needs
lives next to its manifest in `map/packs/<id>/overlay.v2.json`, declared by the manifest as `data.overlay` (the viewer and the tavern script fetch only what is declared) = `{ "schema": 2, "nodes": [ { id, parent?, alias?, hints?, at?, name?, … } ] }`.
`compat-v1` `fromV1` takes it as the optional argument `overlay` and merges it by node id after the conversion (`core/overlay-v2.mjs`):
a new id is added at the end of the node list and needs a `name`; an existing id gets its `alias` and `hints` unioned (an existing node
with no explicit `alias` keeps its name as a strong name) and every other field, `parent`, `at`, `name`, `x-…`, overridden. The merge is
pure and lenient (K-R06): an entry that is not an object, has no id, or adds a node without a name is skipped and listed in
`fromV1(…).problems`; nothing else changes. The runtime tree (`app/nodes-runtime.mjs`), the current location (`app/here-v2.mjs`) and
event placement read the file when the pack declares one; a pack without it behaves exactly as before. `tools/check_pack.py` validates it
(`tools/check_overlay.mjs`: ids, names, parents, no cycle, an explicit alias list holds the name, `at` numeric). The first pack's
overlay carries what its v1 code had hard-wired (Appendix A.5): the event tier words as hints, district nodes with `at`, the outskirts and
far-outside nodes, and the label `x-layer` of the world map; it is generated once by `tools/gen_eden_overlay_v2.mjs`.

**K-R68 — The overlay may carry an events block.** Besides `nodes`, `overlay.v2.json` may carry `events` (the v2 events block, §8.2) and
`llm.templates.<lang>.<key>` (strings; the first pack's injected-line tag lives here). `nodes` may then be left out. `fromV1` merges them over what it derived
from the pack's own `events.json` (`core/overlay-v2.mjs` `applyOverlayEvents`, `applyOverlayLlm`); the overlay wins: `groups` and `types` by id (an existing one is overridden
field by field, a new group needs `label`, a new type needs `label` and `group`), `fx_presets` by key, `life` field by field, `levels` / `closed` / `examples`
replaced as a whole, any other key (`x-…`) overridden. Lenient like K-R67: a bad row is skipped and listed in `problems` (`overlay-group-invalid`, `overlay-type-incomplete`, …). `tools/check_overlay.mjs`
also runs the merged block through the kernel's own schema (K-R06). A schema-1 pack without an events block in either place shows the neutral taxonomy (K-R53).

**K-R69 — The overlay may carry vars and entities.** `overlay.v2.json` may also carry `vars` (§5) and `entities` (§6); `nodes` may then be left out. `fromV1` merges them over what it derived from the
manifest's `vars` and the roster file (`core/overlay-v2.mjs` `applyOverlayVars`, `applyOverlayEntities`); the overlay wins: `vars` path keys are overridden and `periods` merge by id (a new band needs `start`; the list is
kept in time order); `entities.groups` merge by id (a new group needs `label`; `source` is merged key by key, `fallback` replaced as a whole), `entities.fields` by `field` (a new field needs `kind`), `entities.avatar` key by key
(lists replaced), any other key is overridden. Lenient like K-R67 (`overlay-period-incomplete`, `overlay-group-invalid`, `overlay-field-incomplete`, …). `tools/check_overlay.mjs` runs the merged blocks through the kernel's schema (K-R06).
Two extensions the first pack uses: a field carries `x-slot` (one of `stage`, `grade`, `core`, `code`, `social`, `height`, `weight`, `known`, `accessory`, `tier`) to bind it to the roster slot the viewer's card rows and
Settings → variable mapping use (§6.3); and `avatar.require` (path fragments) narrows a host entry that has a path prefix: a card-script portrait from such an entry must also contain one of the fragments (§6.4).

**K-R70 — The overlay may carry a ui block.** `overlay.v2.json` may carry `ui` = `{ theme: { views: { <viewId>: { tokens: {…}, light: {…} } } }, legend: [...], "x-event-level": <viewId> }`.
`tokens` are the token overrides while that view is open (dark theme), `light` the ones for the light theme; the viewer writes them as one `<style>` (`[data-map="<viewId>"]` and
`.light [data-map="<viewId>"], .light[data-map="<viewId>"]`), so a pack can give each of its views its own colours. Token names and values follow K-R58, with one widening: a `--glow*` value may be a comma list of at most 3 groups of
≤ 4 terms (a text-shadow list). `legend` entries are `{ type, label, desc, i18n: { en: { label, desc } } }` (the Settings / drawer legend); `x-event-level` names the view the event list falls back to. `fromV1` merges the block over what it derived
(`core/overlay-v2.mjs` `applyOverlayUi`): `views` by id, `tokens` / `light` key by key, `legend` replaced as a whole, any other key (`x-…`) overridden. Lenient like K-R67: a bad view id or token is dropped and listed in `problems`
(`overlay-view-invalid`, `overlay-token-invalid`). The viewer re-checks every id and token at run time with `recheck` (`core/pack-v2-spec.mjs`: `hex`, `token`, `tokenName`, `id`; each returns the value when it matches the exact schema pattern, else `null`, K-R64).
`tools/check_overlay.mjs` runs the merged block through the kernel's schema (K-R06).
*Amended in S7-2 (U-04 B'): one chrome.* The per-view `tokens` / `light` no longer restyle the chrome (header, popover, drawer, settings, cards): the chrome token set is the same in every view and in 3D and changes only with light / dark and the optional pack-wide
`ui.theme.chrome = { accent, onAccent? }` (six-digit hex; `onAccent` is computed by the engine when absent: the better of the chrome background and white by contrast; `check_pack` measures it in both themes). `ui.theme.views.<view>` feeds only the map-space tokens
`--map-accent`, `--map-pin`, `--map-select` (from `--accent`), `--map-route` (from `--accent-2`), `--map-tint` (from `--bg`), `--map-glow` / `--map-glow-text` (from `--glow` / `--glow-text`); a `--map-*` name passes through unchanged and every other chrome name in a view is dropped.
The selectors and cascade of the written `<style id="packTheme">` are unchanged. A pack that wants the old look of a view sets `--map-*` there; nothing else is needed.

**K-R71 — Entity protocol.** People, items and events are **entities on nodes**: `{ kind: 'person' | 'item' | 'event', id, name, node, place, source, msgIndex, present?, data }`.
`id` is the normalised name for a person (K-R40), the store or world row id for an item, the event id for an event; `name` is the display text, verbatim; `node` is a node id (K-R28) or `null` (place unknown);
`place` is the place text as written (`''` = none); `source` names the channel the row came from (a person: `mvu`, `chat`, `table-db`, `fallback`, `imagegen`, `routine`, `infer`; an event: `chat`, `op`, `feed`) and carries no provenance wording;
`msgIndex` is the chat message position of the fact, or `null` when it is not tied to one; `present` (person only) = with the player (K-R40); `data` is the original row, untouched.
(1) **Pure adapters.** `core/entities.mjs` builds entities from the rows the host already sends (`personOf`, `eventOf`), imports nothing outside `map/core`, and takes a `nodeOf(text) -> id | null` function from the caller
(viewer: the locator of K-R24; host: its event geography). An entity is derived, never stored as such. (2) **Node by reference.** A row may carry `node`; the receiver uses it when its own tree has that id, else it locates `place` (K-R24:
aliases first, hints second, unknown last); a row with neither is `null`. The v1 fields `map` / `marker` stay accepted (K-R28). Rows inside the array fields of the messages `eden-map:chars`, `eden-map:events` and `eden-map:stash` may carry `node`;
array contents are not shape-checked (no field changes in `core/protocol.mjs`). (3) **One entity per id and kind;** duplicates keep the first row in the sender's order. (4) **The chat log is the truth:** every entity is recomputable from the chat floors and the pack.
(5) **No content filtering:** names and places are carried as written; an unknown type is "other". `presentAt(entities, here)` = the entities with `present` set or standing at node `here` (an unknown place is never "here"): the PresentEntities of the glossary.

**K-R72 — Drawer tabs.** The tab set is fixed by the kernel (K-R02, UI row); the drawer ids stay the two-letter ids the probes use: `events` = `ev`, `characters` = `ch`, `places` = `pl`, `legend` = `lg` (`items` = `it` joins in S6-3).
`events` and `characters` count for the drawer (`keepsDrawer`); the fallback order, used when the selected tab goes away, is `ev`, then `ch`. `ui.tabs` (K-R57) names a subset and the order, from the manifest's `ui` or from the overlay's `ui` block (`applyOverlayUi` carries it as any other key);
names the kernel does not know are ignored, and a list with no known name is the default order. `places` is always present: when `ui.tabs` omits it, it is appended before the legend (it holds the place card). The legend is not orderable and always last, shown by its own rule.
Without `ui.tabs` the order is `events`, `characters`, `places`, `legend`. The visibility rules are the v1 rules, unchanged: `ev` shows when the event list is not empty and the events layer is on; `ch` when the people tab has at least one person; `pl` when any tab that counts for the drawer shows,
or the place card is open, or there is an unmapped place name; `lg` when the open view is not a 3D scene, has depth data, and the pack has legend items. The drawer hides when a 3D scene is open, or when no tab counts for it and there is no card, no layer chip on a narrow screen and no unmapped name.
When the selected tab hides, or none is selected, the first tab that counts for the drawer in fallback order is selected; closing the place card does the same and collapses the drawer to its peek. `core/drawer-tabs.mjs` holds the pure rules (`KERNEL_TABS`, `tabOrder`, `applyTo`, `firstFallback`);
`app/tabs.mjs` is the registry the owner modules provide their tab content to.

**K-R73 — People by level.** The characters tab adapts to the level of the open view. The level is **macro** when the open map has at least one child map in the runtime tree (any kind), else **micro**; the view field `x-people` (`"macro"` | `"micro"`; v1: `maps.json` `people`, carried by compat-v1 as for `clouds`) wins.
No runtime tree, or an owner node that is not in it, means no level and the tab is drawn flat. Only the **present group** is split into sections (every other roster group is unchanged); each person is listed once, in the first section that takes them:
`here` (present, or standing at the player's node); macro only, one `n:<child>` section per child node of the view's owner node, in declaration order (the person's node is that child or inside it); `map` (macro: the owner node itself; micro: the owner or anything inside it);
`else` (a node outside the owner's subtree, or one the tree does not have); `unknown` (no node). Empty sections are not drawn, and when fewer than two are left the rows are drawn flat. **Nothing is hidden:** a macro level opens every section;
a micro level opens only `here` and keeps the rest as collapsed sections the user can open (the open state is remembered). Section headings are never list items; the tab's count, badges, switches, avatars and fly-to are unchanged.

**Added by S6-2:** K-R74 (§7, the stash store), K-R75 (§7, reconciliation) and K-R76 (§5, the card's own item table; its Items tab follows in S6-3).

**Added by S6-3:** K-R77 (§7, pickup sentences, strict verbs, never-forms, pack vocabulary) and K-R78 (§7, settlement write paths for the npc and events domains); the Items tab is in K-R76 (§5).

**K-R85 — The overlay of a schema-1 pack may carry `layers`.** `overlay.v2.json` may carry `layers` = an array of layer rows (K-R79, K-R81–K-R83). `applyOverlayLayers(layers, overlay)` in `core/overlay-v2.mjs` runs each row through `normLayer` (the pack's trust) and appends the healed rows to the converted ones by id (an overlay row replaces a converted row with the same id; a schema-1 pack has no converted rows); a part that fails is dropped and listed as `overlay-layer-invalid` with the reason, the rest applies (lenient, K-R06). `compat-v1` sets `pack.layers` when the result is not empty. An overlay may hold `layers` alone. `tools/check_overlay.mjs` runs the same function and `validate2` over the merged block.

**K-R67 (amended by S9b) — An overlay may carry `media`.** `overlay.v2.json` may carry a `media` block (K-R101) and node `media` lists. `applyOverlayMedia(media, overlay)` in `core/overlay-v2.mjs` merges the items by id over the converted block (the overlay wins field by field; an item that is not an object with a string `src`, or whose id is not a media id, is skipped as `overlay-media-invalid`); a node's `media` list is replaced like any other node field. `compat-v1` sets `pack.media` only when the result is not empty, so an overlay with `"media": {}` changes nothing. An overlay may hold `media` alone. `tools/check_overlay.mjs` runs the same function and `validate2` over the merged block and checks that path sources exist under the pack folder.

**K-R108 — The overlay of a schema-1 pack may carry `transit`.** `overlay.v2.json` may carry a `transit` block (K-R107). `applyOverlayTransit(overlay, { nodes, views })` in `core/overlay-v2.mjs` returns `{ transit, problems }`: absent = `transit` undefined and no problem; not an object = `overlay-transit-invalid`; otherwise the block goes through `normTransit` with the converted node ids and view ids and every healing problem is listed with its code. `compat-v1` calls it after `applyOverlayLayers` and sets `pack.transit` when the result is not empty; the block is taken as a whole and never merged (a schema-1 pack has no converted network). An overlay may hold `transit` alone. `tools/check_overlay.mjs` runs the same function strictly (any problem is an error). The viewer reads the network from the runtime (`RT.transit`, `app/nodes-runtime.mjs`) and the host from the geography (`geo.transit`, `core/event-geo.mjs` `makeGeo`), for a schema-1 and a schema-2 pack alike; the graph is built once per pack (`buildGraph`). Both readers land with S8-4b. `llm.templates.<lang>` may carry `route_plan`, `route_leg` and `route_danger` (K-R59, K-R109).

**Added by S9-1:** K-R96 and K-R97 (§4.6, schema-2 packs in the viewer, implicit schematic views, schematic layout and picture).

**Added by S8-1:** K-R79, K-R81, K-R82 and K-R83 (§9, the layers block, sources and features, `applies`, menu rows and the visibility store), K-R85 (above, the overlay's `layers`) and K-R104 (§4.5, the 3D manifest schema).

**Added by S8-2:** K-R80 (§9, building blocks and style keys, reduced motion and data saver) and K-R84 (§10.1, legend rows from layers and the legend tab's show rule).

**Added by S9-2:** K-R90, K-R91, K-R92 and K-R99 (§2.3), K-R103 (after K-R65).

**Added by S9-3:** K-R93, K-R94 and K-R95 (§3.9, after K-R26: place candidates, variables / people / start view / language from the card, the automatic pack with its cache and growth), K-R98 (end of §2.4, export as pack), and the amendment of K-R26.

**Planned in S9** (reserved by S9-design, `docs/zero-config.md`; full text lands with the step specs in its appendix):
**Added by S9b:** K-R100 (§4.6, edit mode and the draft), K-R101 and K-R102 (§2.4, pack pictures and private pictures), the amendments of K-R66 (limits by source, `media`), K-R67 (an overlay may carry `media` and node `media`) and K-R98 (the draft folded in, overlay export of a shipped pack).

**Added by S8-3:** K-R86 (§9, host-fed card variables and the navigator overlays), K-R87 (§9, local layers), K-R88 (§9, the local prop pack) and K-R89 (§9, the `sound` block); with these every rule K-R79 – K-R89 and K-R104 of the S8 design is written.

**Added by S8-4a:** K-R107, K-R109 (§9) and K-R108 (§13).

**Added by S8-4b:** K-R110, K-R112 and K-R113 (§9), K-R111 (§10.2) and K-R114 (§4.6), and the `badge` style key of K-R80; with these every rule K-R107 – K-R114 of the S8-4 design is written.

**Added by S7-1:** K-R130 (§9, `OP_ROUTE`). **Added by S7-3:** K-R131 (§4.5, `room_kinds` in a 3D manifest, `rooms.json` and `data.extras`: kind → colour and labels as pack data, rooms linked to nodes, N9) and K-R132 (§4.5, the `building` block and the floor labels of a 3D manifest, N11).


## 14. Designer decisions and open points

### 14.1 Decided by the designer

| Decision | Reason |
|---|---|
| One document; blocks inline or in files (K-R04, §2.1) | card embedding needs one blob, repositories want small files; one schema serves both |
| Arrays for ordered things, maps for lookups (K-R03) | order is meaningful for locate, legends and menus; ids for references |
| `alias` defaults to name + translations; an explicit list replaces it but must contain the name unless the name is a hint (K-R15) | zero effort by default, exact control when written; compat reproduces v1 word lists exactly (an additive list would make v1's bare English layer names strong) |
| No `local` flag and no ambiguous list: generic and ambiguous words are hints; a strong word on two branches becomes a hint (K-R15, K-R16) | one concept instead of three; reproduces v1 on every here.test input |
| Root hints only hide shorter words and never decide (K-R16) | "an ambiguous word" should not make a text with a real hint unplaceable |
| Whole-word matching for spaced scripts, with word-end suffixes (K-R15) | "pier" must not match "pierced"; Chinese has no spaces and keeps substring matching; v1 parity unchanged |
| One normaliser for text and words: NFKC, quotes, dashes, spaces, `&` (K-R17) | model output uses curly quotes and dashes; authors should not write every variant |
| Overlap rule + chain score + head position + fixed tie order (K-R20, K-R21) | the answer that explains most of the text; the phrase's head noun on a tie; deterministic |
| Hints refine only downward; ties go to the one nearer the current place (K-R22, K-R24) | a vague word may make a vague answer more precise, never overrule a clear name; "the cellar" means the one here |
| Trust by source; `cdn`, `legacy`, `x-page` only for shipped packs; no pack page code (K-R36, K-R63) | a card or a link must not be able to load code, take over another pack's state or the card's variables |
| Pack text reaches the page as text only; style / URL values re-checked at run time (K-R64) | the viewer is same-origin with the tavern page |
| Host macros and templates in foreign pack text are neutralised (K-R65) | the host would execute them; syntax, not content |
| Worldbook marker carries the pack id; the book name carries a kernel suffix (K-R05) | two packs never retire each other's entries; the card's own book is never written |
| Loader order: the user's explicit choice first (§2.3) | the user can always replace a broken or hostile embedded pack |
| Per-item healing and id repair at run time (K-R06) | one bad id must not wipe a zero-code author's whole map |
| A view may open only on "enter" (`open`, K-R33, K-R34) | landmark 3D models must not replace the map when the landmark is located (v1 behaviour) |
| Level switcher from the nearest `ui.levels` entry (K-R35) | the first pack's estate and tiers keep today's switcher |
| Position by value (`at`) or by reference (`anchor`, default the node id) (K-R31, K-R32) | v1 points files and 3D hotspots keep their geometry; compat needs no coordinate copy |
| Views by id, implicit `views[<node id>]` (K-R33) | one 3D model is shared by several buildings in the first pack |
| `enter` optional; default = nearest ancestor view (K-R34) | multi-level places keep v1 behaviour; others need no field |
| Event "near" = same 2D map, else root (K-R51) | reproduces "same tier" of the first pack without a new field |
| Credits only in the manifest (K-R08) | one place; the pack picker needs it before the UI |
| Event types keyed by ASCII ids with a `label` | English identifiers; stored filters that used labels are matched by label |
| Single-layer groups merge with their world place and map (Appendix A) | "world place = group = its only map" is one place; saves a level |
| 3D landmark pages become views, not nodes; test maps are dropped (Appendix A) | they are pictures of a place, not places |
| Estate rooms and areas are hints of the estate node in compat; real room / zone nodes come with pack data (Appendix A) | exact v1 behaviour now, no dependency on the 3D page's zone file |
| Roster table paths live in `entities.groups`, not in `vars` | one place per path |
| Runtime lenient, tools strict (K-R06) | silent self-heal; errors caught before shipping |
| Journeys and multi-place splits are kernel rules per language (K-R18, K-R19) | grammar, not content |

### 14.2 Open points for later steps (not user decisions)

- **O-1 (S6).** The English pickup scan reports a spurious item "the" for "picked up the Brass Key" (found while
  writing Appendix B); S6 adds the false-positive test and the fix; fixed in S6-3 (K-R77).
- **O-2 (S4).** v1 has two night rules (tint 22:00–05:00, base-map period 20:00–05:00). With bands, `dark` follows the
  night band; S4 picks the first pack's bands (a separate late band keeps today's tint).
- **O-3 (S4).** The estate's 3D zones and the room plan become real zone / room nodes in the first pack's v2 data;
  compat keeps them as hints (and optional room nodes).
- **O-4 (S3).** The first pack's event geography constants become pack data (Appendix A.5); S3's parity test compares
  the view-owning ancestor, because new district nodes refine positions inside a tier.
- **O-5 (S4).** The first pack's event types need ASCII ids; stored "type off" filters keep matching by label.
- **O-6 (S3).** The world frame constants of v1 (1600 × 1000 canvas with margins) move from viewer code into compat
  (S1-impl-2) and then into the world view's region table (S3).
- **O-7 (S9) — closed by K-R95 (S9-3).** The pack id of a card without a pack is `c_<hash of name and avatar>`, kept on export (K-R98); growth under an authored tree is decided against (Z-07); the hostile-pack probe moves to S9b. Original text: zero-config details: the pack id of a card without a pack (`c_<hash of the card identity>`, kept on
  export, so user aliases, stash and fog survive embedding); an optional mode that keeps growing under an authored
  tree; a hostile fixture pack (markup, `</style>`, `javascript:` in every string) and a probe that asserts nothing is
  injected.
- **O-8 (S7).** The published token list (K-R58) and the protected string keys (K-R57).
- **O-9 (before S9).** Three places already put pack data into markup or styles without the K-R64 re-check (the
  worldbook peek capsule string, the event group colour, the 3D manifest's flow colour); harmless while only shipped
  packs exist, fixed before foreign packs load (todo I-09).

## Appendix A — v1 → v2 mapping

### A.1 How to read

Status: **auto** = done by `map/core/compat-v1.mjs` in memory; **pack data (S#)** = written into the first pack's v2
data in that step (compat does not read code constants); **carried** = kept as an `x-` field for the step named;
**dropped** = not converted, with the reason. Inputs of compat: `maps.json`, `world_markers.json`, the English name
dictionary (`i18n/en.json` names), the room plan (optional), the user's custom names (optional), `events.json` and the
manifest. Card names below are quoted verbatim.

### A.2 maps.json

| v1 | v2 | Status |
|---|---|---|
| `start` | `ui.start` | auto |
| `groups.<g>` with `place` and ≥ 2 points layers | the world place node becomes the group node; `alias` += title, title_en, English name; `enter` = `upper[0]`, else first points layer | auto |
| `groups.<g>` with one points layer | group + world place + map merge into one node, id = map id, type `site`; the place id goes to compat's id map | auto |
| `groups.<g>` without `place` | own node, id = group id, parent = root | auto (town) |
| `groups.<g>.layers` members that are not children (the estate in the first group) | `ui.levels[<group node>]` | auto (K-04) |
| `groups.<g>.upper`, `.place` | `enter`, merge key | auto |
| `unplaced` | — | dropped (empty; an unplaced name is now a node without position) |
| `ambiguous.words` | hints of the root | auto |
| `feeds` | `events.x-feeds` | carried (no pack uses it) |
| `maps.<id>` kind `world` | root node (id = map id, `alias: []` and its title as a root hint, because v1 never matched its title) + tiles view | auto |
| kind `points` | node (type `layer`, or merged `site`) + tiles view (id = map id) | auto |
| kind `estate`, no `viewer3d` (first live one) | merged with the marker whose `link` targets it: node id = map id, parent = that marker's map, type `estate`; model3d view with `x-page` (`open: locate`) | auto |
| kind `estate` with `viewer3d` | model3d view (`manifest: props/<viewer3d>/manifest.json`, `open: enter`), attached to every marker whose `link` / `link3d` targets it; not a node | auto |
| `anchor: { zone }` on a `viewer3d` map (`dairy`, "挤奶厅"; the v1 field `test` is gone) | a node of type `zone` under its `parent` (`eden_estate`), `anchor` = the zone id (a region of the parent's view, K-R32), `alias` = title, English title and `alias`; its model3d view (`open: enter`) is the map's own | auto (S2-A) |
| `status: planned` | skipped | dropped until built |
| `title`, `title_en` | view i18n; node name only for maps without `layer` | auto |
| `parent`, `group` | node `parent` (group node wins) | auto |
| `layer.name` / `sub` / `name_en` / `sub_en` | `name`, `sub`, `i18n.en`; `alias` = [name, sub, sub_en, name_en + " Tier"] | auto (the " Tier" suffix is a v1 rule kept by compat only) |
| `layer.alt`, `alt_en` | `x-alt` | carried (display) |
| `base`, `data` | `tiles.src`, `tiles.regions` (the points file) | auto |
| `depth` | `x-depth` on the view | carried (S8: depth-haze layer) |
| `clouds` (bool), `tint` (`"period"`) | `x-clouds`, `x-tint` on the view | carried (S4-3, K-R70: drifting clouds; night tint that follows the period band) |
| `people` (`"macro"` \| `"micro"`) | `x-people` on the view | carried (S6-1, K-R73: how the people tab groups the present people) |
| `view.extent_m` / `focus` / `width_m` / `min_width_m` / `phone`; `focus` | `extent`, `home.focus` (node id through the id map), `home.width`, `home.min_width`, `home.phone` | auto |
| `overlay` `{ type, src?, label, label_en, from? }` | `overlays[0]` `{ kind: type, src, label, i18n.en.label, from }` (`from` = a view id) | auto |
| `alt` `{ label, label_en, base }` | `alt` `{ src: base, label, i18n.en.label }` | auto |
| `insets[{ id, marker, base, bounds, res_px }]` | `insets[{ id, node: marker, src: base, bounds, px: res_px }]` | auto |
| `periods` | `variants` keyed by the default band ids | auto |
| `cover` | `x-cover` on the node | carried (S2) |
| `rooms`, `rooms_en`, `areas`, `areas_en` | hints of the estate node, rooms first; with the room plan, room nodes (A.4) | auto |
| `alias` (estate map), linking marker's names | aliases of the estate node, minus room and area words | auto |
| `districts` | aliases of the layer node | auto |
| `econ`, `econ_en`; `credit`, `credit_en` | node `desc` / `i18n.en.desc`; view `credit` / `i18n` | auto |
| `site: true` | no effect on the type: the merge rule decides (the seven merged single-layer groups are `site`; `yuanyu_sanctum` and `yuanyu_city`, layers of a two-layer group, stay `layer`) | auto |
| `src` of the estate (`estate/index.html`), `src_note` | `x-page` on its view; `_note` | auto (K-R36, shipped pack only) |
| `src` of the `lm_*` maps (`props/viewer3d.html`) | — (implied by the generic viewer) | dropped |
| marker `name`, `name_en`, `alias` | `name`, `i18n.en.name`, `alias` = [name, name_en, …alias] | auto |
| marker `sub`, `sub_en` | `sub`, `i18n.en.sub` | auto |
| marker `tag` (`set` / `inf`), `canon: false` | — | dropped (the contract has no provenance field, K-R11) |
| marker `src`; `sub_src`, `layer_src` | `cite`; — | auto; dropped (provenance labels, K-R11) |
| marker `cls`, `island` | `x-cls`, `x-island` | carried (S8) |
| marker `openings`, `opening_dest` | `x-openings`, `x-opening-dest` | carried (first pack only) |
| marker `econ` | `desc` | auto |
| marker `link` → points map (+ marker) | `links[{ to, label }]` | auto |
| marker `link` → the estate | merge (the marker is the estate node) | auto |
| marker `link` / `link3d` → 3D page | `view` (that view has `open: enter`) | auto |
| marker `gallery` | `x-gallery` | carried (S6) |
| points file `markers[{id, nx, ny, r, ax, ay, manual}]` | region table rows `{ id, at: { x: nx, y: ny, r } }`; `ax`, `ay`, `manual` kept in the file | auto (read by reference, K-R32) |
| points file `islands`, `routes` | layer data | carried (S8) |

### A.3 world_markers.json

| v1 | v2 | Status |
|---|---|---|
| `places[]` | nodes under the world root; type = `place.type` (`capital`, `start`, `site`) or `place` | auto |
| `fiefs[]`, `realms[]` | nodes of type `fief`, `realm`, flat under the root; a fief that is the place of a single-layer group merges into that `site` node (all five fiefs of the first pack) | auto (K-07) |
| `x`, `y` (1600 × 1000 canvas); realm centroid `c` | `at` = v1 `toImg(x, y)` | auto (O-6) |
| `alias`, English name from the dictionary | `alias`, `i18n.en.name` | auto |
| `sub`, `src`, `openings`, `autoHighest` | `sub`, `cite`, `x-openings`, `x-auto-highest` | auto |
| `tag`, `layer_src` | — | dropped (provenance labels, K-R11) |
| `minors[]` | dropped (no names; the world picture draws them) |
| `overseas` `{ at: [x, y], name, sub?, src? }` | dropped (never located); the viewer draws its sign and card on the world map (S4-3); a v1 array of two numbers draws nothing |
| place `here_words[]` | — | viewer only (S4-3): words that put the current location on this world place (the old hard-coded table of the first place); not aliases, so they never steal room names |
| realm `label_dy` | — | viewer only (S4-3): how far the realm label sits above its centre |
| place `link` `{ map, label?, label_en? }` to a 3D page | `view` of the place node (the node shows that view, like a landmark's link) | auto (S4-3) |

### A.4 Room plan and estate zones

| v1 | v2 | Status |
|---|---|---|
| `eden_estate_rooms.json` `rooms[]` (123 polygons, 64 names) | when given: one room node per distinct name, id `room_<first polygon id>`, parent = estate node; name words, `words`, `synonyms` → hints; `floor` → `x-storey` (null when on several storeys); `kind` → `x-plan-kind` | auto (optional input) |
| `card_id_alias`, `retired_names` | old custom room names mapped to the current room (K-R25) | auto |
| `floors`, `blocks`, `cores`, `basement`, `card_rooms` | data of the estate's own page | carried |
| `map/estate/model/zones.json` (36 zones) | not read by compat; S4 turns zones into zone nodes (anchor = zone id in the estate view's region table) | pack data (S4) |
| the farm zone `dairy` ("奶牛农场") | region `dairy` of the estate view; the parlour anchors to it (`anchor.zone` in `maps.json`, checked against this file by `check_maps.py`) | done (S2-A) |

### A.5 Events: data files and code constants

| v1 | v2 | Status |
|---|---|---|
| `events.json` `groups` + `shapes` + `order` | `groups[{ id, label, color, shape }]`, ids `g_<hash>` in memory | auto (town) |
| `types{ <name>: { g, ch, src, rare } }` | `types{ <id>: { label: name, group, icon: ch, source: src, rare } }` | auto |
| `alias{ word: type }` | `types[t].alias` | auto |
| `layers[{ name, map, match }]` | removed: `name` is already an alias of the map node; a `match` word that is not already an alias of that node or of a node below it becomes a hint of that node | auto |
| `closed`, `examples`, `tag` | `closed`, `examples`, `llm.templates.<lang>.tag` | auto |
| `region` | removed: the region is the root node's name; prefixes are handled by the chain score | auto |
| `outside` | removed: "outside" is the parent in the tree | dropped |
| `builtin` taxonomy of the first pack (`GROUPS`, `GROUP_ORDER`, `SHAPES`, `CATS`, `ALIAS_CAT`, `EXAMPLES`, `CLOSED`, `CFG.tag`) | the first pack's events block | pack data ✅ S4-1 (`overlay.v2.json`, K-R68) |
| the hard-wired screen glitch of one media type | that type's `fx: "glitch"` | pack data ✅ S4-1 |
| `DEFAULT_OFF_TYPES` (one weather type off by default) | `x-default-off` on that type | pack data ✅ S4-1 |
| `LAYERS`, `LAYER_MAP`, viewer `MAP_OF` (three tiers + "outside" → `tc_upper`, `tc_mid`, `tc_low`, `world`) | the layer nodes; "outside" = the root | pack data (S3) |
| `RE_UP`, `RE_MID`, `RE_LOW` | words already aliases in that tier are dropped; the rest become hints of `tc_upper` / `tc_mid` / `tc_low` | pack data (S3) |
| `RE_OUT` | world names are aliases already; the rest become hints of the root or of an outskirts node | pack data (S3) |
| `CFG.upAlias` | already a district alias of `tc_upper` | dropped |
| viewer `ZONES` (keyword → approximate spot in `tc_mid` / `tc_low`) | district nodes under the tier nodes, `at` converted from the render plane | pack data (S3) |
| viewer `RE_RING`, `isRing` | an outskirts node; the ring look is a layer style | pack data (S3) / S8 |
| `AGE`, `MERGE_WINDOW`, `MAX_PER_FLOOR` | `events.life` kernel defaults (same values) | auto |
| viewer `LOOK` table | superseded by types | dropped |

S3-2: the rows marked "pack data (S3)" live in `map/packs/eden/overlay.v2.json` (K-R67) for the first pack. Where a v1 word is not an alias yet and is part of the name of
exactly one place, it becomes a hint of that place rather than of the tier (v1 looked at the markers first).

### A.6 Manifests

| v1 | v2 | Status |
|---|---|---|
| `id`, `title`, `title_en`, `schema: 1` | `id`, `title`, `i18n.en.title`, `schema: 2` | auto |
| `chat.var` (`eden_map`); implicit `tc_<id>` for others | `legacy.chat_var`, `write: legacy` | auto |
| first pack implicit storage prefix `edenMap`; others `tcp.<id>.` | `legacy.storage_prefix` | auto |
| worldbook marker `eden_` (`extra.eden_id`), protocol prefix `eden-map:`, attribute `data-tcmap` — v1 uses them for every pack | the matching `legacy.*`, for every v1 pack | auto |
| the add-on book prefix (a code constant with card terms, `tavern/wbsync.mjs`) | `legacy.worldbook_book`, passed in by the caller of `fromV1` (`map/core` holds no card terms) | auto (input) |
| `data.maps`, `world`, `derived`, `rooms` | nodes and views (A.2–A.4); `derived` → `x-derived` | auto |
| `data.security`, `data.patrol`, `data.routine` | `x-security`, `x-patrol`, `x-routine` → layer sources | carried (S8) |
| `data.roster` (`{ members: [{ name, identity }] }`) | `entities.groups[members].fallback` (`identity` → `values` of the role field) | auto |
| `data.stash` (`map` + `marker`) | `items.stash` (`node` = the marker node, else the map node) | auto |
| `data.events` path / `builtin` | events block (A.5) | auto / pack data (S4-1) |
| `data.worldbook` (`{ entries: [{ name, content }] }`) | `llm.worldbook.entries` (id `wb_<hash of name>`) | auto |
| `preload` | dropped (the v2 loader preloads the block files it needs) |
| `vars` | `vars` (location, time, period, date, outfit, reputation, inventory); field names → `entities.fields` | auto (`inventory`: S6-2, K-R76, a schema-1 pack may set `vars.inventory`) |
| `cdn`, `features` | same | auto |
| `theme.accent` | `ui.theme.accent` | auto |
| `strings` (`key`, `key@en`) | `ui.strings.<pack lang>.key`, `ui.strings.en.key` | auto |
| `worldbook.addon` (builder script path) | dropped (a tool concern) |
| `worldbook.prefix` (name prefix of the add-on book and its entries; default the pack title) | `legacy.worldbook_book` is derived from it by the host | host only (S4-3) |
| `credits` `{ card: { creator, url? }, pack: [{ name, role, url? }], assets: [{ name, license, url? }] }` | `credits` | carried (S4-3: Settings → about and the feedback report read it) |
| `data.galleries`, `data.worldbook_addon`, `data.gallery` (paths) | — | host only (S4-3: room-gallery index, shipped add-on, marker gallery) |
| town `vars.location` (`世界.当前地点`) | `vars.location` | auto |

### A.7 Variable mapping and roster slots

| v1 (`tavern/adapter.mjs`, `tavern/mvu.mjs`) | v2 | Status |
|---|---|---|
| `FIELDS` location, time, period, date, outfit, reputation | `vars.*` | auto |
| `DEFAULT_MAP` (the first pack's paths in code, e.g. `世界.当前地点`) | the first pack's `vars` | pack data (S4-2) |
| present / members / targets tables | `entities.groups` `present` (`present: true`), `members`, `targets` | auto when named; zero-config otherwise (K-06) |
| `stageField` | a ladder or tag field of the targets group | pack data (S4-2) |
| `gradeField`, `coreField`, `CORE_CUTS`, `CORE_NAMES` | tag field; gauge field `max 100` with bands `up_to` 20 / 40 / 60 / 80 / 100 | pack data (S4-2) |
| code, social, height, weight, known, accessory fields | text / tag fields, `show: detail` | pack data (S4-2) |
| `tierField` + `tierText` | ladder field with `match` words and `scan: true` | pack data (S4-2) |
| `RX`, `MORE_RX`, `IDENT`, `STAGE`, `REP`, `PRESENT_KEYS`, `POS_KEY`, `OUTFIT_KEYS` | kernel auto-discovery vocabulary (word lists per language, no regex in packs) | kernel (S4-2) |
| `todPhase` period words, hour cuts | default bands + the first pack's band words | kernel + pack data (S4-2) |
| `isNight` (22:00–05:00) | `dark` of the night band | changed (O-2) |
| `PORTRAIT_HOSTS`, `PORTRAIT_BAN`, the author CDN `/sfw/` rule | the first pack's `avatar.hosts`, `avatar.deny` | pack data (S4-2) |
| card-owned portrait keys in local storage | `avatar.storage` | pack data (S4-2) |
| `findPortraits` (portrait table in card scripts) | `avatar.from: card-script` | kernel |
| fallback rows marked as setting | source `fallback` | auto |
| roster source `baibai` (the image extension's library) | source `imagegen` | auto |
| `WB_NAME` (custom-names book) | `llm.worldbook.book` + kernel suffix | pack data (S4-3) |
| `VAR_ROOT` | `legacy.chat_var` | auto |

### A.8 Expected counts

These are the numbers `tests/compat_v1.test.mjs` asserts (depth = edges from the root to the deepest node).

| Pack and inputs | Nodes | Depth | Root | Composition | Views |
|---|---|---|---|---|---|
| eden: maps + world + English names | 113 | 4 | `world` | world 1, realm 3, group 2 (`tiancheng`, `yuanyu`), site 8, layer 5, landmark 92, estate 1, zone 1 | 54 (tiles 13, model3d 41: 40 landmark views `open: enter`, the estate's `open: locate`) |
| eden: the same + room plan | 177 | 4 | `world` | + 64 room nodes under `eden_estate` | 54 |
| eden: maps only (no world data) | 109 | 4 | `world` | world 1, group 2, site 7, layer 5, landmark 92, estate 1, zone 1 | 54 |
| town | 8 | 2 | `town` | group 1, layer 2, landmark 5 | 2 |
| minimal (native v2) | 5 | 3 | `harrow` | region, town, district 2, building | 1 (schematic) |

S2-A: the dairy parlour joins as one `zone` node under the estate (+1 node in each eden row; depth 4 without the room plan too:
`world > tiancheng > tc_upper > eden_estate > dairy`); its model3d view counts with the landmark views (the view counts above
were written before the shipped models and the parlour; the test derives them from `maps.json`).

Other fixed facts: the estate node `eden_estate` has parent `tc_upper`, aliases `伊甸庄园`, `Eden Manor`, `伊甸`,
`庄园`, and 153 hints (rooms, then areas); the root has 17 hints (its title, then the 16 ambiguous words);
`tiancheng.enter = tc_upper`, `yuanyu.enter = yuanyu_sanctum`; `ui.levels.tiancheng = [eden_estate, tc_upper, tc_mid,
tc_low]`; 57 landmark nodes carry a 3D view; two nodes carry `links` in eden (`checkpoint_c` ↔ `well7`), two in town
(`market` ↔ `fish`); no strong word is shared by two branches.

### A.9 here.test.mjs parity

- Every distinct input of `tests/here.test.mjs` and `tests/card_spec.test.mjs` (read from the files; no count is
  asserted) resolves to the same node as v1, with the v1 result mapped by: level 1–2 → `eden_estate` (with the plan:
  the room node named `std`); level 3 → the marker id; level 4 → the map id; level 5 with `place` → that world node,
  without → the group node.
- The reported word differs for two inputs whose single-layer group merged with its map ("大骑士领·圣都",
  "圆桌第三席封地"): v2 reports the longest alias of the merged node, v1 the layer word. here.test does not assert
  the word for them; the compat test compares the node only there.
- User aliases: `我的秘密书斋 → 书房` resolves to `eden_estate` with `canonical: 书房` (v1 `room: 书房, custom`);
  the invalid alias is ignored; `蓝塔 → 天城执法局总局` resolves to `enforcement_hq`.
- Intended divergences (not in any test; S3's corpus parity must whitelist their classes):
  1. a broad place containing the estate + a room word ("上层 书房") → the estate (v1: the tier) — K-02;
  2. a world name + a room word ("奥伦帝国 书房") → the world node (v1: the room) — K-02;
  3. an ambiguous word that does not overlap a landmark name ("大学 议会") → the landmark (v1: nothing);
  4. without the room plan, a room word and an area word one code point longer ("伊甸庄园 人工湖 浴室") → the
     reported word is the area word (v1: the room word; the node is the same);
  5. an ambiguous word + an estate room or area word ("大学 书房") → the estate, with the plan the room (v1: nothing)
     — K-R16;
  6. an estate area word that holds a room word one code point shorter (「客房楼」, room 「客房」) → the estate, the longest span wins
     (v1: the room, and with the plan the room node) — K-R20. Decided 2026-09-30 (Q-10, option A);
  The following came with S3-2 (events placed through nodes) and were decided 2026-10-01 (Q-11, option A):
  7. a world place that v1's event rules left unplaced on purpose (「奥伦帝国」, "the capital is the city") → its node, on the world map;
  8. a generic alias of a place (「某家族庄园」: 「庄园」 is an alias of the estate; v1's event rules ignored the word) → that place;
  9. an alias that v1's world-point match did not read (「灵枢秘派」, alias of a realm) → the realm's point (v1: nothing drawn);
  10. spot only: v1 took the marker whose name merely contains the text (a one-letter placeholder, 「修道院」 inside another convent's name,
      a tier word holding a marker word); the tree pins the node the text names, or the tier / district when it names none — K-R20;
  11. a place inside a site that has its own map (the knights' city, the highland, the holy city) → drawn on that map; the site itself stays
      a point on the world map (v1: only that point) — K-R51;
  12. a named place beats an explicit layer word that belongs to another tier (「上层·荣光冠冕」) → the named place — K-R21 (v1: the layer word).

## Appendix B — implementation split

Two Sonnet-sized steps, Sonnet · High, one push each. Neither changes a viewer or host behaviour; both keep every file
≤ 400 lines and free of card terms (the minimal pack's own names are data).

### B.1 S1-impl-1 — nodes.mjs, v2 loading and the minimal pack pipelines

**IN**
1. `map/core/nodes.mjs` (new, pure; may split into `nodes.mjs` + `locate.mjs` + `lexicon.mjs` to stay ≤ 400 lines):
   - `buildTree(list, { title })` → tree, with K-R12 healing; `tree.problems` lists each repair.
   - Tree API: `get(id)`, `root`, `parent(id)`, `children(id)`, `ancestors(id)` (nearest first), `depth(id)`,
     `maxDepth()`, `isAncestor(a, d)` (a is a proper ancestor of d), `order(id)`, `ids()`.
   - `vocabulary(tree, { custom, lang, lexicon })` (K-R15, K-R16, K-R25); `locate(text, tree, vocab, { lang, here })`
     (K-R17–K-R23); `unmapped(text, tree, vocab, { lang, ignore })` (K-R25).
   - `viewOf(tree, views, id)` → `{ view, owner, kind, focus }` (K-R34; `view` = null and `kind` = `schematic` at the
     end of the chain); `positionOf(tree, views, id)` → `{ view, owner, at } | { view, owner, anchor } | null` (K-R31,
     K-R32: `anchor` = `node.anchor ?? id`, the viewer checks the region table); `scopeOf(tree, views, id)` (K-R51);
     `levelsOf(tree, views, ui, id)` (K-R35); `describe(tree, views)` (K-R29).
   - The kernel lexicon for `zh` and `en` (K-R07: transit patterns, suffixes, articles, head, yes words).
   - `map/core` may not import from its parent folder: copy `parseTransit` and the FNV hash, do not import them.
2. `map/core/pack-v2.mjs` (new, pure):
   - `validate2(manifest, { trusted })` → `{ pack, problems }`: every check of the v2 schemas and of
     `tools/check_pack.py`, with K-R06 per-item healing; `trusted: false` applies K-R63, K-R64 (patterns), K-R65 and
     K-R66.
   - `resolveBlocks(manifest, fetchJSON)` (inline or path).
   - `withDefaults(pack)` (K-R60) returns exactly: `vars.periods` = the four default bands when missing;
     `events` = `{ groups: [{ id: 'other' }], types: { other: { group: 'other' } }, fx_presets: {}, levels: <kernel
     labels 0–3>, closed: [], examples: [], life: <K-R54> }` merged under the pack's events; `items.stash` = `[]`;
     `ui.start` = the root id. `views`, `entities`, `layers` and `llm` stay as given (run-time discovery and kernel
     templates fill them later).
   - `typeOf(word, events)` (K-R50); `fieldValue(def, row)` (K-R42, all four return shapes).
   - `entityRows(entities, tree, vocab, { lang })` → rows for `RosterSystem`: `{ name, source: 'fallback', role?,
     location: <node id>, raw: { values } }` from each group's `fallback`; `role` comes from the first `text` field
     shown as subtitle.
   - `stashRows(items, tree, views)` → `{ items }` in the `core/stash.mjs` shape (K-R45: `map` = owner of the node's
     framed view or `''`, `marker` = node id, `place` = node name).
3. `tests/kernel_minimal.test.mjs` on `map/packs/minimal/`, plus small synthetic trees for healing, shared words and
   trust.

**OUT**: `core/pack.mjs` (its `validate` keeps rejecting schema 2), `core/roster.mjs` (its sources are renamed in S3),
`tavern/events.mjs`, `here.mjs`, any viewer or host module, compat-v1, growth (K-R26, S9), the neutral taxonomy list
(S4-1), the pickup fix (O-1, S6).

**Test assertions** (kernel_minimal.test.mjs)
- Tree: 5 nodes, root `harrow`, `maxDepth()` 3; `children('brindle')` = `['docks', 'market']`; `ancestors('inn')` =
  `['docks', 'brindle', 'harrow']`; `isAncestor('brindle', 'inn')` true, reversed false. Synthetic: two nodes
  without `parent` get `__root`; `[{ id: 'a' }, { id: 'b', parent: 'zz' }]` has root `a` and `b` under it with one
  problem; a cycle heals with one problem.
- Locate (input → node, via, word where given):
  - aliases and boundaries: `Lantern Docks` → docks, alias · `the DOCKS` → docks · `Gull & Lantern Inn` → inn ·
    `Gull and Lantern` → inn (K-R17 `&`) · `Gull ＆ Lantern` → inn (NFKC) · `the inn` → inn · `dinner at the inn` →
    inn · `the pierced sky` → null · `installed` → null · `the piers` → docks, hint, `pier` · `Gull and Lantern’s
    taproom` → inn, word `taproom`;
  - chains and ties: `Brindle, Lantern Docks` → docks · `Old Market, Lantern Docks` → docks (score) · `market square
    by Lantern Docks` → market (head) · `Lantern Docks by the market square` → docks (head) · `Harrow` → harrow;
  - hints: `Brindle taproom` → inn, hint, `taproom` · `Old Market taproom` → market, alias · `taproom` → inn, hint ·
    `a pier` → docks, hint · `Gull & Lantern cellar` → inn, alias, `cellar` · `Lantern Docks pier` → docks, alias,
    `pier` · `cellar` → inn (deeper) · `cellar` here `market` → market · here `brindle` → market · here `docks` → inn;
  - root hints: `Lantern` → null · `overseas` → null · `Lantern Street pier` → docks · `abroad, near the docks` →
    docks;
  - parts and journeys: `nowhere / Old Market` → market · `from Old Market to the inn` → market with `transit` `{ from:
    'market', to: 'inn' }` · `heading to the inn` → inn with `transit.from` null;
  - other: `the moon` → null and `unmapped` = `the moon` (null when ignored) · `{{user}}'s room at the inn` → inn ·
    `灯笼码头` → docks · `布林德尔` → brindle (default alias from i18n) · user alias `the Gull` → inn, via user.
  - Synthetic: one strong word on two sibling branches locates as a hint; the same word on a node and its child stays
    strong.
- Views: `viewOf('inn')` → owner `harrow`, kind `schematic`, focus `inn`; with `views` removed → `{ view: null, owner:
  'harrow', kind: 'schematic' }`; `positionOf('inn')` → null; `scopeOf('inn')` → `harrow`.
- Events: `typeOf('blaze')`, `typeOf('FIRE')` and `typeOf('火灾')` → `fire`; `typeOf('meteor')` → `other`;
  `typeOf('hazard')` → `other` coloured as `hazard`; place `Lantern Docks` → docks, `overseas` → null; `brawl` live = 3
  and the others 7; `festival.inject` = false; `fire.fx` resolves to `{ block: 'flash', intensity: 0.4, seconds: 1.5
  }`; level labels 0–3.
- Roster: `entityRows` gives two rows, Mara at `inn` with role `innkeeper`, Tobin at `market`; a chat row `{ name:
  'Mara', place: 'the taproom' }` locates to `inn`; `fieldValue(trust, { trust: 60 })` = `{ value: 60, min: 0, max:
  100, band: 'friendly' }`; `fieldValue(trust, { trust: 140 })` has value 100; `fieldValue(role, { role: 'innkeeper'
  })` = `'innkeeper'`; a missing field gives `null`.
- Items: `stashRows` → `{ items: [row] }` with `map` `''`, `marker` `inn`; `dcOf(row)` = 15; `rows(result, { marker:
  'inn' })` finds it; `pickup.scan('Mara picked up the Brass Key.', { known: ['Brass Key'] })` contains a fact named
  `Brass Key`.
- `withDefaults({ id: 'x', schema: 2, title: 'X' })` equals the exact object above; `validate2` refuses `schema: 3`
  and a missing title; repairs node id `Inn` to `inn` (and `parent: 'Inn'` with it), drops a node whose id is `☃`,
  each with one problem.
- Trust (`trusted: false`): `cdn`, `legacy` and a view's `x-page` are dropped; `features: { events: true }` is
  dropped, `{ events: false }` kept; theme token values `url(https://x)`, `red;x` and `"a"` are dropped, `#fff` and
  `var(--accent)` kept; a worldbook entry's `{{setvar::a::b}}` and `<% x %>` come back escaped, `{{user}}` unchanged;
  a key `/a+/i` is refused.
- Test count rises by the new file's cases only.

### B.2 S1-impl-2 — compat-v1.mjs and the parity test

**IN**
1. `map/core/compat-v1.mjs` (new, pure; may split to stay ≤ 400 lines): `fromV1({ manifest, maps, world, names, plan,
   custom, events, roster, stash, worldbook, legacy })` → `{ pack (v2, inline blocks), custom (user aliases), ignore,
   idmap }`, following Appendix A (status auto only). `legacy` carries the names that are card terms (the add-on book
   prefix); the caller passes them, `map/core` holds none. The prototype behaviour is fixed by A.2–A.8; the world
   frame constants come from v1 `toImg` (O-6). Copy `planWords` from `here.mjs`; do not import it.
2. `tests/compat_v1.test.mjs`.

**OUT**: pack data steps (S2–S4), any consumer switch to nodes (S2, S3), zones.json, the code constants of A.5.

**Test assertions** (compat_v1.test.mjs)
- Counts and depths of A.8 for the four v1 configurations; type composition; view counts; the fixed facts listed under
  A.8.
- Every converted pack passes `validate2(…, { trusted: true })` with no problems.
- Parity: for every distinct input of `tests/here.test.mjs` and `tests/card_spec.test.mjs` (read from the files, not
  copied, no count asserted), `nodes.locate` on the converted eden data gives the node the v1 result maps to (A.9);
  the word too, except the two merged-site inputs; the same with the room plan and with the custom configurations of
  here.test.
- The intended divergences of A.9 hold as written, each with its example input (so a later change is deliberate).
- Views: `viewOf('silver_crown')` → owner `tc_upper` (its 3D view is `open: enter`); `viewOf('eden_estate')` → its
  own view; `viewOf('tiancheng')` → `tc_upper` (enter). `levelsOf` while the estate is open and while `tc_mid` is open
  = `[eden_estate, tc_upper, tc_mid, tc_low]`; while `yuanyu_city` is open = `[yuanyu_sanctum, yuanyu_city]`.
- `legacy` of the converted eden pack = `{ chat_var: 'eden_map', storage_prefix: 'edenMap', worldbook_marker:
  'eden_', worldbook_book: <passed in>, protocol_prefix: 'eden-map:', event_attr: 'data-tcmap', write: 'legacy' }`;
  town = `{ chat_var: 'tc_town', storage_prefix: 'tcp.town.', worldbook_marker: 'eden_', protocol_prefix:
  'eden-map:', event_attr: 'data-tcmap', write: 'legacy' }` (plus the book when passed in).
- A roster row with source `baibai` converts to `imagegen`.
- town's events convert to 3 groups and 3 types with their aliases; its `layers[].match` words that are not aliases
  become hints (none are left: every one is an alias of a landmark below its map).

### B.3 What comes after

S2 switches the breadcrumb, estate stand-in, card links and `spatial.mjs` to `nodes.mjs` over the compat output and
moves the dairy parlour (D2); S3 moves location, event and character placement onto `locate` with the corpus parity
test and writes the first pack's hints and district nodes (A.5); S4 writes the first pack's events, vars and entities
blocks. The minimal pack runs in the browser by the stage A acceptance.
