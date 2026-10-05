# Licensing (D25)

Two notices, kept apart on purpose: the code is MIT, the first pack's content is not. The one-line versions live in
the repository's [`LICENSE`](../LICENSE) file and in the map's own credits page; this document is the itemised record.

## 1. Engine code — MIT

Everything in this repository except what section 2 and section 3 list: the engine (`map/core`, `map/app`,
`map/tavern`, `map/ui`, `map/three`), the viewer pages, the extension loader (`ext/`), the tools (`tools/`), the
tests, and the documentation. MIT, Copyright (c) 2026 kcgoofee-jpg — full text in [`LICENSE`](../LICENSE).

The card-agnostic rule (agent brief §2.1) is what makes this half separable: the engine contains no card name, place,
status or rank, so it can be licensed without touching the setting it was first built for.

## 2. Pack content — all rights reserved

The first data pack (`map/packs/eden/`, plus the card-derived data under `map/data/`) is **not** under MIT. It is a
derivative work of the character card by **Yehehua**, published in the Discord community 类脑, and is distributed here
under the author's permission of 2026-09-27, which carries two conditions:

- the original author's credit stays visible — the viewer's credits page, the generated script description
  (`tools/build_preview_script.py`) and the worldbook add-on (`tools/build_worldbook_addon.py`) all name them;
- the first public post about this map links the author's original post:
  <https://discord.com/channels/1380075940285124724/1534464824141025321>.

The permission covers this map, its worldbook add-on and its renders. It does not authorize re-licensing the card's
characters, places or wording, and the pack text keeps the card's own adult wording (see the 18+ notice in
`docs/player-guide.md` §…). Nothing in the map filters or rewrites chat content (brief §2.8).

## 3. Third-party material

Each item keeps its own licence; the pack manifest (`map/packs/eden/manifest.json`, `credits.assets`) and the viewer's
credits page list them per item.

| What | Where | Licence |
|---|---|---|
| OpenSeadragon 5.0.1 | `map/vendor/openseadragon/` | BSD-3-Clause |
| three.js | `map/estate/vendor/` | MIT |
| City skeleton (streets, buildings footprint source) | `blender/data/osm/` | © OpenStreetMap contributors, ODbL 1.0; the derived JSON is offered under the same licence |
| Core-area 3-D buildings | NYC 3-D Building Model, NYC Open Data | as published by NYC Open Data |
| Estate textures and models | `map/estate/assets/`, itemised in `map/estate/assets/CREDITS.md` | CC0 (Poly Haven, ambientCG) |
| Ambience loops (wind, birds, crowd, rail, factory, steam) | `map/media/`, listed in the pack manifest | CC0, CC BY 4.0, CC BY-SA 4.0 and public domain per item, each with its Wikimedia Commons source |

## 4. What a downstream user may and may not do

- May: read, run, modify and re-publish the engine and the tools under MIT, keeping the copyright and permission notice.
- May: build their own pack for their own card, with the `tools/card-map` skill or by hand — that pack is theirs and
  carries their own card's rights position.
- May not: take the first pack's text, places or characters out of here under MIT, or drop the author credit.
- Not filtered, not moderated: the map parses whatever the chat contains and places it as-is; the 18+ material in the
  first pack is the card's own, labelled rather than hidden (D26).
