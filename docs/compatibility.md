# Compatibility matrix (REL-DOCS, D25–D27, D29 · B18)

Status: 2026-10-06. Every row is either a measurement with an evidence pointer or explicitly marked unverified.
Nothing here is inferred from documentation — where the repo has no number, the row says so.

## 1. Hosts

| Host | Version measured | Engine | Result | Evidence |
|---|---|---|---|---|
| SillyTavern + TavernHelper script | ST 1.19.0, TH 4.11.2 | Chromium | works; cold first paint (script form) 5.9 s, warm 1.3 s; the four boot stages `boot → ready → loaded` all fire | `docs/extension-study.md` §2–§3, RESULT EXT-STUDY |
| TauriTavern (Mac) + TavernHelper script | TT 2.3.0, TH 4.11.2 | WKWebView | works; first frame 2.6 / 3.0 / 4.9 s on the Eden card, and again on the blank card and after a chat switch, no manual intervention | `docs/extension-study.md` §9 (real-machine re-check), RESULT F-TT |
| TauriTavern before the F-TT fix | TT 2.3.0, TH 4.11.2 | WKWebView | 6 script runs mounted the button and the panel but never reached first paint (5 of 6 turned the button into "preload failed" at 30 s). Root cause was a CDN mirror that answers with headers and no body, not TT and not the script form | `docs/todo.md` I-36, RESULT F-TT (`9aec8fd3`) |
| Phone TauriTavern | — | — | **not tested** | `docs/plans/spatial-os-log.md` Q-32 |
| No TavernHelper (host without the script API) | — | Chromium | runs: the map mounts and draws, first frame 425 ms / 1143 ms, the self-check reports "MVU not loaded"; everything that needs the host switches itself off (state-line injection, macros, worldbook sync, the chat listener, image generation) | `docs/extension-study.md` §4 ("no TH" row), `map/tavern/host-adapter.mjs` capability probes |
| Eden card (MVU world) | card "母畜庄园 Yehehua二创版V1.5" | both | the pack reads the card's own MVU; 170-plus floors in the test chat | `docs/extension-study.md` §2 |
| A card with no MVU | — | both | runs: `map/tavern/pack-gate.mjs` derives an automatic pack from the card and the chat text (`map/core/grow.mjs`), so places come from what the story says | `map/tavern/pack-gate.mjs`, `map/core/grow.mjs` |

## 2. Delivery form: script now, extension later

| Form | Status in this release | What it needs | Evidence |
|---|---|---|---|
| TavernHelper imported script (`map/tavern/eden-map.js`) | the shipped form | a TavernHelper-capable host (ST or TT); one import line | Q-29 answered A (2026-10-03): the extension's speed gain is 1.4–3.5 s cold / 0–0.8 s warm, everything else equal |
| Native ST / TT extension (`ext/index.js` loader) | written, not installed by a release; ships with the S10b split | a separate small repository, which the 944 MB repo blocks | `docs/extension-study.md` §6–§8, `ext/README.md` |

Both forms take code from the same three repository lines and pin it to a commit (`docs/delivery.md` §3); the extension
loader additionally verifies every code file against `map/data/integrity.json` before importing and fails closed.

## 3. Browser features

| Feature | Where | Hard or soft | Without it |
|---|---|---|---|
| ES modules + dynamic `import()` | `map/viewer.html` entry, `map/app/boot.mjs` | hard | the map does not start |
| Import map (3-D pages only) | `map/props/viewer3d.html`, `map/estate/index.html`, rewritten to the vendored copy before injection (`map/app/subpage3d-host.mjs`) | hard for 3-D, irrelevant for the 2-D map | the 3-D subpage shows its fail state; the 2-D map still works |
| WebGL | `map/three/render-context.mjs` (three.js chooses the context; the 2-D map uses `getContext('2d')`) | hard for 3-D views only | 3-D views report "webgl" and stay unavailable; context loss is handled |
| `srcdoc` iframe + `postMessage` | `map/tavern/eden-map.js` | hard | the viewer never appears (this is what the I-36 defect looked like) |
| `localStorage` | `map/core/storage.mjs` (never throws; area → null, set → false) | soft | settings and caches are not remembered; the map still runs |
| `navigator.connection` / saveData | `map/app/sharpness-tiers.mjs` | soft | the tier picker falls back to screen size and `deviceMemory`; iOS WebKit exposes neither, so `touchUnknown` applies |
| `OffscreenCanvas`, `ResizeObserver`, `AbortController` | `map/core/room-gallery-db.mjs`, `map/app/boot.mjs`, the fetch helpers | soft, feature-checked | the affected nicety is skipped, no error shown |

## 4. Screens

| Size | Status |
|---|---|
| 1440 × 900 desktop | the tested reference size (probe preset `desktop`) |
| 375 px Chromium | checked once per change (probe preset `phone`); breakpoints at 640 and 1180 px, 44 px hit targets |
| iPhone / phone hosts | no dedicated work; fixed on reports. WebKit iPhone 13 viewport 375 × 812 is in the probe set |

## 5. Quality and traffic tiers (the numbers the code uses)

| Tier | 2-D pixel cap | scale | max DPR | Where |
|---|---|---|---|---|
| `save` | 2000 px | 1.0 | 1.25 | `map/app/sharpness-tiers.mjs` |
| `std` | 4000 px | 0.8 | 2 | same |
| `hd` | 8000 px | 0.5 | 3 | same |

- Default is `hd`, capped to `std` when `deviceMemory` ≤ 4 GB, the OS save-data flag is on, or the connection reports 2g/3g.
- VRAM budget (`map/core/graphics-budget.mjs`): low 256 MB, mid 512 MB, high 1024 MB, default 512 MB; a device is low
  when memory ≤ 4 GB or coarse pointer with a small screen, mid when cores ≤ 4 or `maxTextureSize` < 8192; the water
  marks where new assets stop being accepted are 85 % and 70 %.
- 3-D (`map/three/render-context.mjs`): low DPR 1.25 without antialiasing, mid DPR 2 with, high uncapped with;
  `edenMap3dQ` 1 forces DPR 1 and 2 caps it at 2.
- There is no samples-per-pixel setting in the runtime — 16 / 64 / 128 / 512 spp are offline Blender settings only.

## 6. Network behaviour

| Setting | Value | Where |
|---|---|---|
| Delivery lines | jsdmirror → jsDelivr → fastly, same repository and ref, only the host changes | `map/tavern/host-routes.mjs` (`GH_LINES`) |
| Loader race per line | 10 s, then the next line | `tools/build_preview_script.py`, `ext/index.js` |
| Speed measurement | bytes per millisecond of a real read; responses under 32 KiB are an invalid measurement; a line must beat the current one by 1.3× to win | `map/tavern/host-routes.mjs` |
| Line choice expiry | 24 h; a hand-picked line does not expire until cleared | same |
| Boot watchdog | remount after 15 s with no message from the viewer, same address once, then up to 3 alternate lines, and say so in the loading overlay | `map/tavern/viewer-boot.mjs` |
| Tile failure | one automatic line switch per 2-minute window | `map/tavern/eden-map.js` (`nextRoute`) |

## 7. Measured timings on file

| What | Numbers | Source |
|---|---|---|
| First frame per delivery line, fresh context, stub host | Chromium: fastly 2.9 s / jsDelivr 3.1 s / jsdmirror 5.3–6.6 s (mount in parentheses in `docs/delivery.md` §2); WebKit: jsDelivr 3.4 s / jsdmirror 5.3 s / fastly 6.4 s | `tools/browser/dist3_load.mjs`, 2026-10-04 |
| Chat message → shell mounted, shell → first frame | 3385 / 1824 / 1572 / 1567 ms and 4964 / 3119 / 3495 / 3357 ms | `docs/extension-study.md` §3.1 |
| Local-server regression (these numbers do not transfer to a CDN) | cold mask 456 → 458 ms, first tile 60 → 58 ms, estate 3-D frame 440 → 464 ms, traffic −35 % | `docs/perf/v2.md` |
| Budget targets | save-data first screen ≤ 3 s, one standard layer ≤ 1.5 MB, phone 3-D ≥ 30 fps | `docs/archive/README-2026-09-30.md` |
| Real CDN / TT equivalent of the regression row | **not measured** | `docs/perf/v2.md` |
| 30 MB decoded-texture estimate | **estimated, not measured** | `docs/reviews/perf_095/mobile_webkit.md` |

## 8. Known unverified (do not promise these to a player)

| Item | What is missing | Where it is tracked |
|---|---|---|
| Q-32c mainland clone / mirror address for the extension | the address is documented as an option, never measured | `docs/delivery.md` §6, `docs/plans/spatial-os-log.md` RESULT F2 |
| Phone TauriTavern | no run on a phone at all | Q-32 scope in `docs/plans/spatial-os-log.md` |
| Stage B and stage D real-tavern tests | the checklists exist, the user has not filled them back in | `docs/todo.md` §3 Stage B / Stage D, `~/eden-map-review/f3-tt/TT手动检查清单.md` |
| `chat_iso` probe | 4 red cases recorded and unrepaired | `docs/plans/spatial-os-log.md` U-FIX blocks |
| Features F-18 / F-43 / F-51 / F-62 | listed as awaiting a real-host test | `docs/feature-inventory.md` §4 |
| `docs/perf/v2.md` on a real CDN or in TT | local numbers only | that file |

## 9. Notices a player should see (D25–D27)

| Notice | Where it lives |
|---|---|
| Code MIT, Eden content all rights reserved under the original author's permission | `LICENSE`, `docs/licensing.md`, the pack credits |
| 18+ : the rating is declared by the pack, the engine never filters or moderates | README (both editions), the settings row 内容分级 / Content rating (`s.lic_adult_v`), `docs/licensing.md` |
| The AI advisor key is stored in this browser's local settings and any script running on the page can read it | the field's own notice in settings (`fc.nav.key_notice`) |
| Credit for the original character card (Yehehua) | the pack's credits, shown in the about panel |
