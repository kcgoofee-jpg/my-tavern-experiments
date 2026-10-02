# Eden Map — a map layer for SillyTavern

[![CI](https://github.com/kcgoofee-jpg/my-tavern-experiments/actions/workflows/ci.yml/badge.svg?branch=preview)](https://github.com/kcgoofee-jpg/my-tavern-experiments/actions/workflows/ci.yml)

Chinese edition: [README.zh.md](README.zh.md)

## What it is

A map layer for SillyTavern / TavernHelper chats: a floating button opens a map that follows the story — where the
scene is, who stands where, what just happened. It is being refactored into a card-agnostic **Spatial OS**: an
engine that knows no card, plus data **packs**. The first pack describes the card this project started from.

## Status

The live state is the status block at the top of [`docs/todo.md`](docs/todo.md) (this README carries no stage status). **Follow line: `preview`** — every push lands there first. Current release:
`0.9.7` (tag `map-v0.9.7`), on hold until the refactor ends.

## Install

In TavernHelper, add this as a script (or use `python3 tools/build_preview_script.py <git ref>` to generate an
importable JSON):

```js
import 'https://cdn.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@preview/map/tavern/eden-map.js'
```

The address follows the `preview` branch and does not expire; `tools/check_readme.py` keeps it correct in CI. The
branch address is cached by CDNs and browsers (up to 7 days), so prefer the importable script
`python3 tools/build_preview_script.py --follow preview`: it carries a small inline bootstrap that reads
`map/data/head.json` fresh (no-store, per-minute query) and loads the entry pinned to that commit, falling back to the
branch address only if every source fails. If you installed the one-line import earlier, re-import the script once;
the one-line import keeps working (it redirects itself once loaded).

## Documentation

- [Agent brief](docs/agent-brief.md) — the rules
- [Architecture](docs/ARCHITECTURE.md) — module map, data flow, entity protocol
- [Naming](docs/naming.md) — naming rules, rename map, glossary
- [Todo](docs/todo.md) — the single tracker
- [Handoff](docs/handoff.md) — last session's handoff
- [Plan](docs/plans/spatial-os.md) — the plan of record
- [Execution log](docs/plans/spatial-os-log.md) — RESULT blocks
- [Render campaign](docs/plans/render-campaign.md) — ledger status
- [Cloud render](docs/cloud-render.md) — cloud render operations
- [Landmark pipeline](docs/landmark-pipeline.md) — landmark pipeline
- [Versioning](docs/versioning.md) — versions, tags, update prompts
- [Branching](docs/branching.md) — branches and sync
- [Language policy](docs/language-policy.md) — document language rules

## Credits

The original character card is by **Yehehua**, published in the Discord community 类脑:
<https://discord.com/channels/1380075940285124724/1534464824141025321>. This repository's map, script and worldbook
add-on are a derivative work made with the author's permission (2026-09-27, on the condition that the first public
post links the original post). The map does not contain or modify the card. The same credit is shown in the viewer's
settings panel, the script description (`tools/build_preview_script.py`) and the worldbook add-on
(`tools/build_worldbook_addon.py`).

## Asset licences

- City skeleton: © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/); derived data
  `blender/data/osm/*.json` is offered under the same licence. Core-area buildings: NYC 3-D Building Model, NYC Open
  Data.
- Estate textures and models: Poly Haven and ambientCG (CC0), itemised in `map/estate/assets/CREDITS.md`.
- OpenSeadragon 5.0.1 (BSD-3-Clause) in `map/vendor/openseadragon/`; three.js (MIT) in `map/estate/vendor/`.
