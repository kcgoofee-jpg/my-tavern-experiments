# UI refactor: Dark Frost Glass, tactical HUD and layer applicability (S7 design)

> Canonical English edition; Chinese edition: `docs/ui-refactor.zh.md` (same heading structure, gated by
> `tools/check_zh_mirror.py`). Output of plan step **S7-design** (plan `docs/plans/spatial-os.md` §5 Stage C S7, §16
> I-05 / I-06; `docs/ui-refactor-backlog.md` U1–U23; `docs/todo.md` I-05, I-06, E-12, N4, N7; layers decision L-06).
> Status: **design, working decisions applied by default** (the user was not available on 2026-10-01: every
> recommendation of the review sheet below is the working decision; the user may override any of them). No code changes
> with this document. The settings regrouping and the AI feature cards are specified in the companion
> `docs/settings-ia.md`. Three kernel rules are reserved: **K-R130** (the navigator's suggested route; `docs/kernel-schema.md`
> §13 "Planned in S7"), **K-R131** (room kinds as pack data, N9) and **K-R132** (the building block of a 3D
> manifest, N11). Every statement about today's code was checked at origin/preview `df3b5f6d` (head #239).
> Decisions made before 2026-09-30 are background only (agent brief §3); where this design overturns one it says so in
> one line (§1.3).

## 0. Review sheet (U-01 … U-30)

One row per real decision. "Working decision" = the recommendation, applied by default on 2026-10-01 (autopilot). The
same list is in `docs/todo.md` §3, one line per item.

| id | Question | Options | Consequences | Recommendation (working decision) |
|---|---|---|---|---|
| U-01 | What does "Dark Frost Glass" mean on each surface? | A: two strengths: **glass-1** (translucent, blur 14 px) for floating controls over the map (top bar, clock capsule, toolbar, level strip, layer popover), **glass-2** (near-opaque, blur 20 px) for reading surfaces (drawer, settings, notices, cards); both fall back to an opaque surface. B: one strength everywhere. C: opaque surfaces, glass only on the toolbar. | A: the map stays visible behind controls while long text stays at ≥ 4.5:1 contrast; one rule per surface class. B: either controls hide the map or panels become hard to read. C: no visual unification (the plan's goal). | **A** |
| U-02 | What drives the day / night glass variant? | A: the UI theme only (auto / light / dark, as today). B: the in-world clock (night bands → dark glass). C: A, plus a switch "glass follows world time" in 地图与图层 (`edenMapGlassClock`, default off) that, with theme auto, picks light glass for day / dawn bands and dark glass for dusk / night. | A: predictable; the world's night shows only in the map tint. B: a light-theme user suddenly gets dark chrome. C: A's predictability with the immersive option for those who want it; a new toggle, default off (brief rule 6). | **C** |
| U-03 | How is the z-index ladder merged into `map/ui/tokens.css`? | A: value-preserving: the `--zu-*` / `--zv-*` block moves from `viewer.html` L195–204 into `tokens.css`; every bare value gets a named token with the **same** value (local `--zl-*`, host `--zh-*`, new `--zu-*` names); the only value change fixes `.rgp`, whose fallback resolves to 13 and sits under the dialogs (→ `--zu-panel`, 61, the value `.ilp` uses). B: renumber the whole ladder into wide bands. | A: zero visual change, the arch ledger's `zindex` entries drop to 0, one known bug fixed. B: every overlay must be re-checked by eye; risk with no user benefit. | **A** |
| U-04 | Where do glass colours come from? | A: derived from the theme tokens and the pack's per-view theme (`--surface`, `--ink`, `--accent` via `color-mix`), so every pack and both themes get matching glass. B: a fixed neutral glass palette; the accent only marks state. | A: the town and eden keep their own character; one formula. B: packs look alike; the per-view theme (K-R70) loses meaning on chrome. | **A** |
| U-05 | Settings structure (N4). | A: eight groups 常用 / 地图与图层 / 人物与物品 / AI 联动 / 数据与映射 / 更新与版本 / 高级 / 版权申明; 常用 is the first block of the home page (no sub-page); page ids kept, `display` → `map` with an alias. B: 常用 as its own page. | A: the most used controls need zero taps; probes and `SettingsApi.open` keep working. B: one more tap for the common case. | **A** (`docs/settings-ia.md` §2) |
| U-06 | Does the always-on situation digest get a master switch? | A: no: its card is read-only transparency (what was sent, tokens, health) with the existing inventory-line switch. B: a new "turn the digest off" switch. | A: the map's core model link cannot be switched off by accident; today's behaviour. B: a new failure mode ("the map stopped working") for little gain. | **A** |
| U-07 | How are the status line's per-field toggles stored? | A: one key `edenMapStateOmit` = JSON list of omitted fields, empty by default (= today's line). B: four keys, default on. | A: complies with "new toggles default off" (each toggle is "omit field X") and keeps the injected text byte-identical by default. B: four defaults that are on. | **A** |
| U-08 | Where is feature health computed? | A: a pure host module (`tavern/feature-health.mjs`) from facts the host already has; sent in `eden-map:th-state` as `health`. B: the viewer guesses from prefs. | A: the truth sits where the features run; no extra API calls. B: "on" would read as "working". | **A** |
| U-09 | AI 参谋 first-time consent (N7). | A: inline consent block in the card: the switch is replaced by the consent text and one "同意并开启" button until consent; the host never asks (no `window.confirm`), it skips silently and reports `no-consent`; stored consent of existing users stays valid. B: an inline banner after the first switch-on. | A: no blocking dialog anywhere (brief rule 6); consent is read before cost starts. B: the switch looks on but does nothing until a second action. | **A** |
| U-10 | Does the rename reach the model-facing system prompt ("你是地图领航员")? | A: no: only user-facing texts are renamed; the system prompt keeps its role line and gains one line for `OP_ROUTE`. B: rename there too. | A: model-facing text changes only where a new op needs it. B: a cosmetic change in text the user never sees. | **A** |
| U-11 | AI 参谋 endpoint check. | A: an explicit "test connection" button: one tiny request (`maxTokens` 8, 15 s timeout) with the saved config, result inline; the button says it costs a few tokens. B: validate the config shape only. | A: the user learns about a bad key now, not after a silent failed round. B: free but blind. | **A** |
| U-12 | A suggested route (`OP_ROUTE`) when the pack has no transit network or the router cannot place it. | A: draw nothing (S8-4 `routeOp` returns null without a network); the op's `why` still shows in the AI 参谋 toast. B: draw a dashed straight hint between the two places when both are on the open map. | A: matches the S8-4 contract (T-15, K-R113: suggestions are planned and drawn by `route-plan` only); nothing pretends to be a path. B: needs a second drawing path outside S8-4's layer. | **A** (changed from B after S8-4-design landed, `docs/transit-schema.md` T-15) |
| U-13 | 3D mouse wheel (I-06): pan or zoom? | A: keep wheel = pan (Ctrl = zoom, Alt = rotate); new switch "wheel zooms" (`edenMap3dWheelZoom`, default off). B: wheel zooms by default. | A: no change for current users, rule 6 default off; the option is there for mouse users. B: muscle memory of every current user breaks. | **A** |
| U-14 | I-05 "one persistent WebGL context across 3D navigations". | A: keep one iframe per 3D view but guarantee at most one live context: the legacy estate page creates its renderer through `three/render-context.mjs` (`createRenderer`, dispose + `forceContextLoss` on `pagehide`), the host releases a parked frame before opening another; probe `webgl_single_ctx` covers both pages. B: one persistent 3D iframe that swaps scenes (a scene router inside it). | A: S-sized, removes the context leak that matters (the estate page never disposes); I-05's shared-context part closes as A. B: L-sized refactor of both 3D pages; only worth it if the reload study I-29 shows context creation dominates. | **A** (B parked; reopen from I-29 evidence) |
| U-15 | How does the layer menu show inapplicable layers (L-06)? | A: grey in place. B: move them into a collapsed group. C: grey them, keep their switch usable (it stores the preference for where the layer applies), sort them after the applicable rows under a thin divider "此处不适用", each with a one-line reason generated from `applies`; rows inapplicable only because they have no data stay hidden as today. | A: noisy when many rows grey. B: the user cannot see why a row vanished. C: the menu stays short and honest; no row ever disappears for a reason the user could act on. | **C** |
| U-16 | When does layer animation stop? | A: when the layer is invisible, inapplicable, the document is hidden, or reduced motion is on (one static frame); every animated layer goes through the existing `visibility.mjs` guard and the registry. B: only when inapplicable. | A: closes the two gaps found (`wander.mjs` rAF + interval, `clouds.mjs` WAAPI only on `visibilitychange`). B: leaves battery drain on hidden tabs. | **A** |
| U-17 | Where is the clock capsule? | A: stays in the host bar (`.em-bar .em-clock`, the only place with the clock), restyled as a glass-1 capsule; on ≤ 640 px it shows the time only and expands to date · period on tap. B: move it into the viewer header. | A: one source of truth, no new message; the viewer header keeps its room for the title (U22). B: duplicates the host's clock path. | **A** |
| U-18 | Toolbar (control column) composition. | A: one glass-1 column on the right (desktop) / one bottom row above the drawer (phone): zoom in / out, home, all-area, labels, ⋯; the level strip stays a separate glass-1 block above it. B: merge the level strip into the column. | A: today's structure, unified look; the level strip keeps its own scroll. B: a very tall column on deep pack trees. | **A** |
| U-19 | Phone top bar title truncation (U22). | A: on ≤ 640 px the viewer header shows only the current map's name (crumbs collapsed to a back button, as today) with `min-width: 38%`; the host bar is capped at 45 % instead of 62 % and its place field yields first. B: a two-line header. | A: the title stops truncating at "Ed…" without growing the header. B: costs 44 px of map on every screen. | **A** |
| U-20 | E-12: the edit bar over the drawer on a phone. | A: when the drawer is above peek on ≤ 640 px, the edit bar collapses into one "编辑 ⋯" button in the header that opens its actions as a menu; it returns when the drawer goes back to peek. B: dock the bar above the drawer edge. | A: the drawer and the bar never overlap. B: the bar still takes 44 px of a short screen. | **A** |
| U-21 | U21: markers and labels overlap on the phone world map. | A: extend the existing `declutter()` (`app/sharpness-tiers.mjs` L199–230) with a priority order (current place > event > named landmark > minor) and run it on every zoom end at ≤ 640 px; a hidden label shows on tap. B: leave as is. | A: dense areas stay readable; nothing is lost (tap reveals). B: the reported bug stays. | **A** (verify by probe first, §7.4) |
| U-22 | U23: the update banner is too tall on a phone. | A: a compact P1 banner on ≤ 640 px: one line (title + primary action), the rest behind "详情"; max height 30 % of the frame. B: unchanged. | A: the chat stays usable while the banner is up. B: the reported bug stays. | **A** |
| U-23 | The 3D idle auto-rotate writes the stored preference (`edenMap3dAutoRotate` becomes 1 after the first 30 s idle, `camera-controls.js` `makeIdleTimer` L86). | A: fix: idle rotation is a runtime state and never writes the key; only the settings switch writes it. B: keep. | A: the setting means what it says; I-06's switch works. B: the switch would be overwritten behind the user's back. | **A** |
| U-24 | Avatar ring colours in the people tab and roster (N10 item 17: purple / teal / green / red look meaningful but are a hash of the name, `characters-view.mjs` L32 `colorOf`). | A: keep the per-person colour (it matches the person's pin on the map) and say so in one muted line under the people tab's first group (`头像圈颜色只用来区分人物，和地图上的图钉同色`); B: drop the colour coding, one neutral ring everywhere; C: keep without explanation. | A: keeps the map ↔ list match that helps on crowded maps, removes the false meaning. B: loses that match. C: the reported confusion stays. | **A** (B if the pins do not use the same colour: check first) |
| U-25 | N11 one shell: is the estate 3D page kept in its iframe or merged into the viewer page? | A: keep the iframe as a chrome-less 3D canvas: its own top segment, drawer, tabs and card go; the viewer's top bar, level strip, toolbar, drawer and shared cards serve 3D through messages; the iframe links `tokens.css` and draws only in-canvas labels and tokens. B: merge `estate/main.js` into the viewer document as a module. | A: keeps WebGL lifetime isolation (U-14), the existing `estate:*` protocol and the parking logic; one look because every control is the viewer's. B: one document, but a 1203-line page and its import map move into the viewer; high regression risk on every 2D path. | **A** |
| U-26 | Where do the 3D view controls go (外观 / 内透 / 剖切, floors)? | A: into the viewer: floors are the level strip's entries while the 3D view is open (`estate:floor` both ways), the three view modes a glass-1 segmented control at the top of the toolbar column (new `estate:view`); B: a restyled control row inside the iframe. | A: the same place for "which level" in 2D and 3D; no second control system. B: two systems that look alike. | **A** |
| U-27 | Presence token style in 3D (N11 (2)). | A: reuse the page's CSS2D chips (`main.js` L486–511) restyled with tokens: a 24 px avatar disc (portrait or initial) with the person's ring colour (U-24), name pill on hover / selection, several people in one room fanned out around the room centre; tap opens the shared character card. B: 3D billboard sprites. C: dots on the floor plan. | A: DOM chips are tappable, themable and already wired to the room geometry; same look as the 2D avatars. B: needs a texture pipeline and a hit test. C: loses who is who. | **A** |
| U-28 | Source of presence in 3D. | A: the 2D locate result (people whose resolved node is a room of this building, `estate:people` from the viewer) wins; the routine schedule (today's only source, `estate:routine`) moves only people without a located room, drawn dimmed as the 2D wander layer does; respects 「在地图上显示人物」 and per-person switches. B: located people only. | A: the chat log stays the truth and 3D equals 2D; the ambient life of the schedule stays where nothing is known. B: empty buildings most of the time. | **A** |
| U-29 | Where the building's title, motto, floor labels, room kinds and colours live (N11 (5), N9 (4)). | A: in the pack's 3D manifest (`model/manifest.json`, read by `Estate3D.normalize`): `building: { title, motto, floors: [{ id, label }] }` (K-R132) and `room_kinds` (K-R131), both with `i18n`; the engine keeps neutral fallbacks only. B: in the overlay's `ui` block. | A: the 3D page already loads that manifest; any pack shipping floor plans gets an interior viewer by data. B: the 3D page would need a second fetch of pack data it does not load today. | **A** |
| U-30 | Where the 3D-only tabs 房间 / 关于 go (N11 (1)). | A: sections of the shared place card: a room is opened as a place card with a room section (floor, area, note, kind chip, pictures, custom); 关于 becomes the building's place-card section (title, motto, credits from pack data); B: one extra drawer tab "3D" in 3D only. | A: one card system (N11 (3)); nothing 3D-only in the rail. B: the rail changes between viewers again. | **A** |

## 1. Scope and backlog map

### 1.1 Scope

S7 is three prompts (Sonnet · High, plan §14.3 size L; S7-3 added by the user on 2026-10-01):

- **S7-1** — settings information architecture and the AI feature cards (`docs/settings-ia.md`), the 「AI 参谋」
  rename, the suggested-route op `OP_ROUTE` (K-R130), consent inside the card. Runs **after S8-4b lands** (S8-4a provides
  `routeOp` in `core/router.mjs`, S8-4b delivers `eden-map:ops.routes` and draws suggestions; see its §0), and the N10
  settings / wording items 11, 12, 13 (descriptions) and 15 with the no-labels gate extension.
- **S7-2** — the visual system on tokens (glass, day / night, z-scale), every surface restyled, layer greying and the
  animation pause, mobile 375 px fixes (U20, U22, U23, E-12), I-05, I-06, the ⓘ / U21 click-through re-check.

- **S7-3** — one shell for 2D and 3D (`docs/todo.md` N11, plan §5 S7-3): the estate 3D page becomes a chrome-less
  canvas inside the main shell, presence tokens in 3D rooms, one card system, one token set for 2D, 3D and dialogs, the
  building's words and kinds as pack data, occluded labels hidden; plus N9 and the 3D items of N10 (1, 2, 3, 4, 6).
  After S7-2.

All three run the multi-persona review protocol of §8. Out of S7: new features, new injection channels, the estate render
fixes (U4 artefacts, U5 sky, U6 label density: render line), the reload stutter (I-29: a separate step investigates it;
S7 must not make it worse, §8.1 performance persona), the declarative layer contract (S8), transit routing itself (S8-4).

### 1.2 Backlog U1–U23 → U-items and spec tasks

`docs/ui-refactor-backlog.md` uses U19 twice (the fog merge, done, and the room hover); "U19b" below is the room hover.

| Backlog | State before S7 | In S7 |
|---|---|---|
| U1 drawer cannot close | done (UI v2 drawer) | S7-2 T3 restyle only; re-check in the review set |
| U2 map small on phone | done (`view.phone`) | — |
| U3 loading / update / self-check cards | done (notice layer) | S7-2 T3 (glass-2 notices) |
| U4 3D aliasing, stripes, black blocks | quality setting done; rendering is the render line's | out (render line) |
| U5 3D island without sky | render line | out |
| U6 room labels, plot colours | legend done; density render line | out |
| U7 / U11 two 3D control sets | done (`ui/chrome3d.js`) | S7-2 T3 (chrome3d on tokens and glass) |
| U8 routes through labels | done (`routeGaps`) | — |
| U9 scattered entries, mixed styles | entries unified (UI v2) | S7-2 T2–T3 (one visual system), U-01, U-18 |
| U10 settings one long page | paged (UI v2) | S7-1 (U-05, `docs/settings-ia.md`) |
| U12 3D viewer controls cover the model | done | re-check in the review set |
| U13 / U14 | fixed 2026-09-28 | — |
| U15–U18 depth front end | done 2026-09-29 | — |
| U19 fog merge | done | — |
| U19b room hover popover dead zone | click-to-pin exists (`estate/main.js` L800–802, `#card.pinned`) | S7-2 T8: verify by probe; add a 200 ms hover bridge only if the probe fails |
| U20 settings header overlap, "StatusNot connected" | open | S7-2 T5 |
| U21 marker / label collision | open | U-21, S7-2 T8 |
| U22 phone title truncation | open | U-19, S7-2 T5 |
| U23 tall update banner | open | U-22, S7-2 T5 |

Todo items: I-05 → U-14, S7-2 T6; I-06 → U-13, U-23, S7-2 T7; E-12 → U-20, S7-2 T5; N4 → S7-1; N7 → S7-1; N9 → S7-2 T10;
L-06 → U-15, U-16, S7-2 T4; I-29 → not in S7 (must not regress, §8.1); N11 → S7-3 (U-25 … U-30).

N9, N10 and N11 overlap on the estate page; each item has exactly one owner:

| Item | Owner | Why there |
|---|---|---|
| N9 (1)–(4) legend, `restricted`, `medical`, kinds as data | S7-3 T5 | the legend and room card are rebuilt by the shell work; doing it in S7-2 would be redone |
| N10 (1) `open` rooms: hide labels, then uses via `floorplans.py` | S7-3 T6 | same generator and data commit as N9 |
| N10 (2) two room cards | S7-3 T3 | the one card system |
| N10 (3) estate rail over the room sheet at narrow widths | S7-3 T2 | the estate rail disappears with the shell |
| N10 (4) X-ray floor tags overlap | S7-3 T7 | the 3D label pass (with occlusion) |
| N10 (5), (7), (8), (9), (10), (13 greying), (14), (16), (17) | S7-2 T10 (13: T4) | 2D shell, host bar, dialogs |
| N10 (6) area suffix 「（卡 30）」 | S7-3 T3 | it is in the estate room card |
| N10 (11), (12), (13 descriptions), (15), the no-labels gate | S7-1 T7b | settings and wording |

### 1.3 Earlier decisions overturned

- The 2026-09-28 UI v2 rule "settings pages 显示 / 人物 / 数据与映射 / 更新与版本 / 高级" (backlog U10 row) is replaced by
  the eight groups of U-05.
- The tavern-helper switches "under 数据与映射, depth and budget under 高级" (`tavernhelper-settings.mjs` header) are
  replaced by feature cards that hold their own sub-options.
- "Navigator first-run consent by `window.confirm`" (llm-campaign W5) is replaced by U-09.

## 2. Visual system

### 2.1 Principles

1. **The map is the content.** Chrome floats over it as glass and never hides more than it must; reading surfaces
   become near-opaque.
2. **One formula, many skins.** Components reference semantic tokens only; packs and themes change token values, not
   component CSS (today's rule in `tokens.css` L3, kept).
3. **Calm by default.** Motion is short (≤ `--dur-3`), purposeful, and stops for reduced motion and hidden documents.
4. **Every state visible.** On / off / not applicable / not effective each have a distinct, non-colour-only cue.

### 2.2 Colour and glass tokens (Dark Frost Glass)

New tokens in `map/ui/tokens.css`, derived from the existing theme tokens (U-04). Dark values (default):

```css
:root, body {
  --glass-1: color-mix(in srgb, var(--surface) 62%, transparent);   /* floating controls */
  --glass-2: color-mix(in srgb, var(--surface) 88%, transparent);   /* reading surfaces */
  --glass-line: color-mix(in srgb, var(--ink) 12%, transparent);
  --glass-hi: inset 0 1px 0 color-mix(in srgb, #fff 7%, transparent);
  --glass-blur-1: 14px; --glass-blur-2: 20px; --glass-sat: 140%;
  --glass-shadow: var(--sh-2);
}
.light { /* only values change */
  --glass-1: color-mix(in srgb, var(--surface) 72%, transparent);
  --glass-2: color-mix(in srgb, var(--surface) 92%, transparent);
  --glass-line: color-mix(in srgb, var(--ink) 14%, transparent);
  --glass-hi: inset 0 1px 0 color-mix(in srgb, #fff 60%, transparent);
}
```

Two shared classes in `tokens.css` carry the recipe, so components do not repeat it:

```css
.g1 { background: var(--glass-1); border: 1px solid var(--glass-line); box-shadow: var(--glass-hi), var(--glass-shadow);
      backdrop-filter: blur(var(--glass-blur-1)) saturate(var(--glass-sat)); -webkit-backdrop-filter: …same…; }
.g2 { background: var(--glass-2); …; backdrop-filter: blur(var(--glass-blur-2)) saturate(var(--glass-sat)); }
html.lowmem .g1, html.lowmem .g2, html.noblur .g1, html.noblur .g2 { backdrop-filter: none; background: var(--surface); }
@media (prefers-reduced-transparency: reduce) { .g1, .g2 { backdrop-filter: none; background: var(--surface); } }
@supports not (backdrop-filter: blur(1px)) { .g1 { background: var(--glass-2); } }
```

`--surface-glass` (today 92 %) becomes an alias of `--glass-2` for one release; its users move to the classes. The
existing coarse-pointer rule that turns blur off (`viewer.html` L603) stays: phones get the opaque fallback unless the
review shows the blur is cheap enough there (performance persona, §8.1).

### 2.3 Day / night variants

- Glass follows the UI theme (`html.light` set by `viewer.html` L36–55, `edenMapTheme` auto / light / dark) — U-02 A.
- Option `edenMapGlassClock` (U-02 C, default off; registered key, protocol field not needed: viewer only): with theme
  auto and the option on, `app/theme.mjs` sets `html.light` from the last clock message: bands `day`, `dawn` → light;
  `dusk`, `night` → dark (band words from the pack's period bands, K-R39; unknown band → keep the system theme). The
  host bar follows through the existing theme message (`eden-map.js` `hostTheme`, L65–70, L239).
- The pack's per-view theme (`app/theme.mjs`, `<style id="packTheme">`) keeps working: glass reads `--surface` after the
  per-view override, so a view with its own surface gets matching glass.
- 3D pages: `viewer3d.html` links `tokens.css` and gets the classes; the legacy estate page (`estate/index.html` L34–35,
  own `--panel`) maps `--panel` to `--glass-2` and `data-theme` to `.light` (S7-2 T3).

### 2.4 z-scale

One ladder, in `map/ui/tokens.css` (U-03). Values unchanged except `.rgp`.

| Band | Tokens (value) | Used by |
|---|---|---|
| local (inside one component) | `--zl-under` (-1), `--zl-0` (0), `--zl-1` (1), `--zl-2` (2), `--zl-3` (3) | `.ev i` / `::before` (events-view L256, L260), `#stage::before/after` (L336, L340), tint `#osd::after` (custom-names-view L384–386), `.cu-search` (L334), `.uis-grip` (sheet.js L46) |
| viewport slots | `--zv-osd` … `--zv-interaction` (0–100, unchanged) | layer registry (`core/layer-registry.mjs` L6–11 mirror) |
| viewer UI | existing `--zu-*` (2–14, unchanged) + `--zu-sheet` (9, `.uis`), `--zu-c3` (6, `#c3`, `.cc-presets`), `--zu-glitch` (7, `#glitchNote`, `#cuToast`), `--zu-cc-hint` (20), `--zu-dialog` (40, `#cuDlg`), `--zu-dialog-2` (41, `#umDlg`), `--zu-panel` (61, `.ilp`; `.rgp` moves here), `--zu-load3d` (5, viewer3d `#load`), `--zu-debug` (99999, fps) | the bare offenders of `tools/arch_baseline.json` `zindex` |
| host page | `--zh-bar` (3), `--zh-pick` (2), `--zh-tl` (4), `--zh-yield` (10040), `--zh-fab` (30000), `--zh-panel` (30001), `--zh-toast` (30002), `--zh-top` (30003: splash, notices, fallback toast) | `host-lifecycle.mjs` L48–140, `splash.mjs` L18, `eden-map.js` L562, `notice.mjs` L12 |

Rules: a z-index is always `var(--z…)`; the host page has no `tokens.css`, so `host-lifecycle.mjs` injects a generated
`--zh-*` / glass / colour block (one string built by `tavern/host-tokens.mjs`, a copy of the `tokens.css` values; a node
test compares both, so they cannot drift). `notice.mjs` uses `var(--zh-top)` in both documents (the viewer defines
`--zh-top` too). `.rgp` (`room-gallery-panel.js` L99) changes from `var(--zu-pop,60)` (resolves to 13, under the
dialogs) to `var(--zu-panel)`: the one intended value change. The literal fallbacks `var(--zv-events,60)` and friends
lose their fallback (the token is always defined).

### 2.5 Spacing, type, radius, motion

Kept as they are (`tokens.css` L7–15): type 20 / 17 / 14 / 13 / 12 / 11 (floor 11), spacing 2 / 4 / 6 / 8 / 12 / 16 / 24,
radius 4 / 8 / 12 / pill, durations 120 / 200 / 320 ms, `--hit` 44 px. Additions: `--r-glass: 14px` (glass panels and
capsules; controls keep `--r-m`), `--sp-8: 32px` (settings page gutters on desktop), the two missing tokens referenced
today `--warn` (= `--alert` mixed 70 % with `--gold`) and `--shadow-1` (alias of `--sh-1`). Rules: one radius per surface
class; text on glass-1 is ≥ 13 px and ≥ 600 weight, or it moves to glass-2.

## 3. Surfaces

### 3.1 HUD and clock capsule

The HUD is what sits over the map: host bar (embedded), viewer header, level strip, toolbar, ⓘ, drawer peek.

- Clock capsule (U-17): `.em-clock` in the host bar becomes a glass-1 pill (`--r-pill`, 32 px tall, icon + time in
  `--font-mono` tabular figures); the period band shows as the icon (sun / dawn / dusk / moon from `ui/icons.js`), not as
  colour alone. ≤ 640 px: time only; tap toggles `date · period` for 4 s. Pre-start state (`body.prestart`) shows "—".
- ⓘ (`#creditBtn`, `viewer.html` L637) becomes a 32 px glass-1 circle with a 44 px hit area; its credit popover is
  glass-2.

### 3.2 Top bar

- Viewer header (`viewer.html` L627–636, CSS L206–253): glass-1 strip, `--bar-h` 44 px; crumbs left, state dot,
  `图层` button and settings button right. The host bar overlaps its right end as today (`--hostbar-w`); both share
  glass-1 so they read as one bar.
- Standalone (no host): the "当前地点" debug input (`.where #here`) moves behind 高级 › 调试 (it is a developer tool; probes
  set it by script). It keeps its id.
- U-19 on ≤ 640 px (see §5).

### 3.3 Layer popover

- `#layPop` (`viewer.html` L642–644, built by `renderLayerMenu`, `layer-host.mjs` L71–90): glass-2 panel, 320 px wide on
  desktop, anchored under `图层` as today. Rows are 40 px (44 px on phones), label left, switch right.
- **Applicability (U-15 C, L-06):** for every row, `registry.applicable(id, layerContext())` decides:
  - applicable → normal row;
  - not applicable and the only failing condition is `data` → row hidden (today's behaviour, nothing to explain);
  - otherwise → row greyed (`aria-disabled="true"` on the row, switch still operable and still storing the choice),
    moved after the applicable rows under a divider `此处不适用` / `Not here`, with one muted line from
    `appliesHint(applies, ctx)`: `只在 <kinds> 视图` / `只在 <node names> 及其下级` / `只在 <period names>` / `只在夜间`,
    joined by ` · `, at most two parts.
- The same rows render in the settings 地图与图层 page and the phone home "图层" block (`topbar.mjs` L22–25 move), so the
  greying shows in all three places.

### 3.4 Toolbar (control column)

`#dock` (`control-column.mjs` L13–19): `#layers` level strip and `#zoom` group each glass-1, `--r-glass`, 4 px gap; desktop
right column 48 px wide; phone bottom row above the drawer peek (as today). Buttons 44 px on phones, 40 px on desktop
with 44 px hit areas. The active level keeps the accent bar on its leading edge plus bold text (not colour only).

### 3.5 Drawer

`UISheet` (`ui/sheet.js` CSS L11–72): glass-2 body, glass-1 grip and tab row in peek; the desktop rail (`.uis.rail`) is
glass-2 full height. Tabs are pills (`--r-pill`), selected = filled accent with `--on-accent`; counts in a small badge.
States peek / half / full and every way to lower a state stay (U1).

### 3.6 Settings

`#setPop` glass-2; desktop right sheet `max(rail, 360px)` as today; phone full screen. Home: search, 常用 block, group
list (`.sgroups`, one 48 px row each: title, summary, chevron), credits link. Pages: sticky header (back, title, close)
that respects `--hostbar-w` (U20, §5); sections separated by 24 px and a hairline; feature cards (`docs/settings-ia.md`
§4) as glass-1 cards inside the glass-2 sheet with a 1 px `--glass-line` border and `--r-glass`. Switch rows keep
`label.row` semantics (`role="switch"`).

### 3.7 Notices, cards, 3D chrome, host page

- Notices (`ui/notice.mjs`): P0 modal glass-2 over a dim scrim; P1 banner glass-2; P2 pill glass-1. U-22 compact P1 on
  phones.
- Place / person cards (`#card`): glass-2; cover image keeps its own background.
- 3D chrome (`ui/chrome3d.js`, `viewer3d.html`, `estate/index.html`): top segment and column glass-1, drawer glass-2,
  same tokens through `tokens.css`; the estate page's own palette maps onto them (§2.3).
- Host page (`host-lifecycle.mjs` L36–198): `.em-fab`, `.em-panel` frame, `.em-bar`, `.em-pick`, `.em-tl` and the
  toasts read the injected token block (`--em-*` become aliases of the token values); the hard-coded `.em-fab`
  background (L63) becomes `var(--glass-1)`.

### 3.8 3D as a view mode of the current place (S7-3)

Entering the building keeps the viewer's top bar, level strip, toolbar, drawer and cards (U-25, U-26). The iframe shows
only the scene, its in-canvas labels and presence chips. Clicking a room or a chip posts up; the viewer opens the shared
place / character card (U-30). Hover shows one small in-canvas label; selection is separate state and never moves
with hover. Labels behind geometry are hidden, not faded. The building's words and colours come from pack data (U-29).

## 4. Layer applicability and the animation pause

S8 owns `applies` data, the evaluator `core/layer-spec.mjs` `appliesTo` (L194–216) and `registry.applicable`
(`core/layer-registry.mjs` L85–89). S7 adds:

1. `appliesHint(applies, ctx, names)` — pure, in a new `map/core/applies-hint.mjs` (≤ 80 lines): which keys fail for
   `ctx` and a short neutral text per failing key (`views`, `kinds`, `nodes`, `node_types`, `periods`, `dark`, `mvu`);
   `data` alone → `null` (hide). Names come from the caller (`names.node(id)`, `names.period(id)`, `names.kind(k)`).
2. One applicability pass for **every** menu row (kernel and pack) in `renderLayerMenu` / `refreshDeclared`: today only
   pack rows are evaluated and hidden (`declared-layers.mjs` L69 `row.hidden = menu.hidden || !app`).
3. The pause (U-16 A): every animated layer runs through `visibility.mjs` (`createPauseSwitch` L15, `visibilityGuard`
   L63) and stops when invisible, inapplicable, hidden document, or reduced motion. Gaps to close: `wander.mjs`
   (rAF L73–80 plus `setInterval` L141), `clouds.mjs` (WAAPI drift, only `visibilitychange` at L89). Already compliant:
   `block-canvas.mjs` (weather, traffic, declared layers), `quests-view.mjs`, `vision-view.mjs`, `sound-block.mjs`, the
   estate page (`estate:pause` / `resume`).
4. A debug counter `ViewerDebug.raf()` (read only; frames requested per layer in the last second) for the probe.

## 5. Mobile 375 px rules

1. Every control and row: ≥ 44 × 44 px hit area (`--hit`); gaps ≥ 8 px between targets.
2. Header: one line; title `min-width: 38%`, ellipsis only after that; the host bar ≤ 45 % (`host-lifecycle.mjs`
   L171–183) and its place field shrinks first (U-19).
3. Overlays never stack over each other: drawer above peek → edit bar collapses into the header (U-20), the toolbar row
   rides above the drawer edge, notices sit above the drawer.
4. Settings full screen: the sticky header pads right by `--hostbar-w` like the viewer header (U20); `#licBox .row` gets
   the `.spage .row` flex and gap so "Status" and its value are separated (U20 "StatusNot connected").
5. P1 notices: one line, max 30 % height (U-22).
6. Blur is off on coarse pointers by default (opaque fallback) unless the performance review approves it.
7. No horizontal scroll at 375 px on any page (probe check).

## 6. Accessibility

- Contrast: body text ≥ 4.5:1, large text and icons ≥ 3:1, measured against the glass colour composited over both a
  pure black and a pure white backdrop (worst case); the existing probe `contrast_v2` gains these checks for glass-1 and
  glass-2 in both themes.
- Targets: 44 px (§5.1). Focus: `:focus-visible` 2 px `--focus` outline on every control including glass pills (kept).
- Reduced motion: `html.rm` and `prefers-reduced-motion` stop all CSS motion (kept) and now all layer rAF (§4).
- Reduced transparency: `prefers-reduced-transparency` and `html.noblur` / `html.lowmem` → opaque surfaces.
- Screen readers: greyed layer rows `aria-disabled="true"` with the reason in `aria-describedby`; feature-card health
  lines are `role="status"`; the clock capsule has `aria-label` with the full date and period; state never by colour
  alone (health dot + text; level strip bar + bold).
- Keyboard: popover and settings keep their focus traps (`settings.mjs` L128–131); Esc closes the top layer.

## 7. 3D: shared context, camera, hit checks

### 7.1 I-05 shared context (U-14 A)

`estate/main.js` L65 creates `new THREE.WebGLRenderer` directly and never disposes; `three/render-context.mjs`
`createRenderer` (L22–56) is the documented single path (dispose + `forceContextLoss` L53–54). S7-2 moves the estate page
onto `createRenderer` and disposes on `pagehide`; `subpage3d-host.mjs` keeps at most one live 3D frame (parked frames are
released before a new `openEstate`, L111–147). Probe `webgl_single_ctx` must pass for estate → props viewer → estate.

### 7.2 I-06 camera settings

- Auto-rotate switch in 地图与图层 › 三维 (`edenMap3dAutoRotate`, existing key, default 0), sent to the 3D page through
  the existing state message; U-23 fix: `makeIdleTimer` (`camera-controls.js` L86) starts and stops rotation without
  writing the key.
- Wheel zooms switch (U-13, `edenMap3dWheelZoom`, default 0): when on, plain wheel = zoom, Shift = pan, Alt = rotate, in
  both `estate/main.js` L905–912 and `viewer3d.html` L281–286.

### 7.3 ⓘ / (i) click-through

Probe `s7_hit` (new): for ⓘ (`#creditBtn`), the 3D info tab (`chrome3d.js` L42) and every visible `.pin` in the props
viewer, `elementFromPoint` at the centre returns the control (or its child), a click opens its target and does not reach
the map (no card opens, the OSD click handler count is unchanged). Run on desktop and phone presets. Fix only what
reproduces.

### 7.4 U21 and U19b

U21: probe `s7_hit` also counts overlapping visible label boxes on the phone world map and on `tc_upper` after a
zoom-end; > 0 overlaps → apply U-21 A. U19b: in the estate page, hover a room, move to the card's first button within
300 ms, click: the action fires; if it fails, add a 200 ms hover bridge before unpinning (`estate/main.js` L760–768).

## 8. Review protocol

The user asked (2026-10-01) that the UI refactor be reviewed in several rounds by sub-agents with different personas.
The executor does not review itself: at each gate it saves the screenshot set, writes a review request and **stops**;
the orchestrator runs the persona reviewers and sends the findings back to the same executor, which fixes and continues.

### 8.1 Personas

| Persona | Looks at | Checks |
|---|---|---|
| **Phone newcomer** (first-time tavern user, 375 px, never opened settings) | phone shots, first-run states | can find the map's current place, open and close the drawer, find "turn the AI 参谋 on" and understand what it costs; no overlapping controls; no jargon in labels; nothing covers the chat input |
| **Mac power user** (long sessions, 1440 px, keyboard) | desktop shots, settings pages, popover | every setting reachable in ≤ 2 clicks from home; search finds feature cards; keyboard and Esc order; density acceptable; nothing moved without a reason in `docs/settings-ia.md` §3 |
| **Card author / pack maker** | AI 联动 page, feature cards, layer popover with a pack layer greyed | feature cards show the exact injected text and token cost; health reasons are actionable; pack layers with `applies` grey with a correct reason; town and eden both look right; no card name in engine text |
| **Accessibility reviewer** | all shots + the probe numbers | contrast ≥ 4.5:1 on glass over black and white backdrops, 44 px targets, focus visible, reduced motion and reduced transparency honoured, `aria-disabled` / `role=status` present, nothing by colour alone |
| **Visual designer** | all shots side by side (before / after, dark / light) | glass strengths used per U-01; day / night variants consistent across viewer, host bar, 3D chrome; spacing and radius rules; type scale; pack theme preserved |
| **Performance reviewer** | `raf_pause` / `s7_hit` numbers, `perf_v2` and `accept` timings, a 10 s trace summary | no rAF while a layer is hidden / inapplicable / document hidden; blur cost on coarse pointers; first-screen time not worse than the before run (I-29: the user reports that clicking reload / refresh to load the map stutters; a separate step investigates it; S7 must not make it worse — compare `accept` first-screen and the `perf_v2` long-task count before / after) |

### 8.2 Screenshot set

Taken by the new probe `tools/browser/s7_shots.mjs <out-dir>` (S7-1 creates it, S7-2 extends it) for **1440 and 375
× dark and light** (`lib.mjs` presets `desktop` / `phone`, `newPage(..., { scheme })`), embedded in the host stub
(`openInHost`) so the host bar and the AI 联动 page exist:

1. map default (`tc_mid`, three events posted);
2. layer popover open on a view where at least one layer is inapplicable (town pack with its danger-zone layer outside
   its `applies`, and eden `tc_upper`);
3. drawer half on events, then on people;
4. settings home; 5. 地图与图层; 6. AI 联动 collapsed; 7. AI 联动 with the status-line card and the AI 参谋 card expanded
   (consent block visible); 8. 数据与映射; 9. 更新与版本;
10. P1 update notice (`showNotice` level 1 with three actions);
11. 3D estate page chrome and the props viewer; 11b. estate section view (B1) and one room card (N9);
12. phone only: edit mode on with the drawer at half (E-12);
13. S7-3: world map, upper tier, estate exterior, estate B1 section with presence chips and the shared room card.

Names `<w>-<scheme>-<nn>-<state>.png`; the folder gets a `README.txt` listing what changed since the previous round.

### 8.3 Rounds and pass rule

| Gate | When | Folder | Executor writes |
|---|---|---|---|
| R0 | after the baseline, before any UI edit (S7-2 also builds a static mockup page from the new tokens, outside the repo) | `~/eden-map-review/overnight/s7/<step>-r0/` | before set (+ mockup), the list of surfaces to be changed |
| R1 | after the main implementation commit (not pushed) | `…/<step>-r1/` | after set, before / after pairs, probe numbers |
| R2 | after the fixes for R1 findings | `…/<step>-r2/` | final set, what each finding became |

At each gate the executor stops with `status: PARTIAL` and a block `review: <gate> — look at: <list of states and
questions>`. Each persona returns findings tagged **blocker** / **major** / **minor**. Pass rule: no blocker; every major
fixed or filed as a Q-item in `docs/todo.md` §3 with a reason; minors may be filed. R2 must pass; at most one extra round
(R3) — still failing → `status: BLOCKED` with the open findings. Push only after the final gate passes.

## 9. Risks

- `backdrop-filter` cost on low-end phones → opaque on coarse pointers by default (§5.6); the performance persona decides.
- `color-mix` support: all supported browsers (Chromium ≥ 111, Safari ≥ 16.2) have it; the tokens keep a plain
  fallback line before each `color-mix` declaration.
- Settings ids used by probes: page ids kept, `display` aliased; control ids kept when a row moves.
- Parallel work: S8-4 (transit, `docs/transit-schema.md`) owns the router, the `routes` field and the drawing; S7-1
  waits for S8-4b and only adds the op and the `routeOp` call.
- I-29 (reload stutter) is not fixed here; S7 must not regress the `accept` first-screen time.

## Appendix — Executable specs

Executors are Sonnet with no other context. Each spec follows the section format of `docs/plans/steps/S6-1.md`. The
agent brief applies in full (`docs/agent-brief.md`).

### S7-1 — settings IA, AI feature cards, AI 参谋, suggested routes

Model: Sonnet · High · Size L (one prompt with review gates, about 6 h of work). English only. Written by the S7-design
session on 2026-10-01 at origin/preview `df3b5f6d`. **Runs after S8-4b has landed** (it calls `routeOp` of S8-4a and
feeds the suggestion rows S8-4b delivers and draws; `docs/transit-schema.md` §3.5, §7).

#### 0. Why

`docs/todo.md` N4 and N7, plan §5 S7. The settings sheet grew by accretion; AI-linked switches sit in a flat list
without explanation, effect or health; the AI 参谋 asks for consent through `window.confirm` and for its endpoint
through `window.prompt`. Design: `docs/settings-ia.md` (all), this document §0 (U-05 … U-12), §8 (review protocol).

#### 1. Read first

- `docs/agent-brief.md` (all), `docs/settings-ia.md` (all), this document §0, §3.6, §8, the S7-1 spec (this section).
- `docs/transit-schema.md` §0 T-15, §3.5 (API: `routeOp(op, { graph, locate, here, floor, map })` in
  `core/router.mjs`), §5.2 (`eden-map:ops` + `routes`), §7 (K-R113: the host keeps ≤ 3 suggestion rows, the viewer
  plans and draws them in `route-plan` as dashed suggestions with a "use this route" card). Use the names S8-4b
  actually shipped (grep `routeOp` and `routes` in `map/tavern/`).
- `docs/kernel-schema.md` K-R86 and §13 "Planned in S7" (K-R130); `docs/layers-schema.md` §9.
- Code (line numbers at `df3b5f6d`):
  - `map/viewer.html` L645–691 (settings markup), L654 (author line), L627–636 (header).
  - `map/app/settings.mjs` (all, 285 lines): `PAGES` L26, `setPage` L27–38, `SettingsApi` L39–44, `renderLicense`
    L64–88, `setSearch` L91–101, `initSettings` L106–170, `renderAbout` L196–246, `renderSelfCheck` L254–279.
  - `map/app/tavernhelper-settings.mjs` (all, 117 lines): `renderWb` L21–67, `renderInj` L69–103, `applyState` L105.
  - `map/custom-names-view.mjs` L95–118 (`renderUI`: night, portraits, gallery rows), `map/compose-view.mjs` L39–60.
  - `map/core/storage.mjs` `KEYS` L11–66; `map/core/protocol.mjs` L42 (`eden-map:th`), L63 (`eden-map:ops`), L80
    (`eden-map:th-state`).
  - Host: `map/tavern/host-tavernhelper.mjs` L152–180 (`thPrefs`, `sendTh`, `onTh` prefs); `map/tavern/modes-flow.mjs`
    (all, 96 lines: `injectPreview` L32–35, `stateText` L36–47, `stateInject` L48–54, `spatialInject` L59–71);
    `map/tavern/llm-flow.mjs` L22–64 (navigator: `sendOps`, `navRun` with `window.confirm` L34–38, toast L57,
    `navSchedule`); `map/tavern/planner-gateway.mjs` (all); `map/tavern/operation-dsl.mjs` (all);
    `map/tavern/nav-ops.mjs` (all); `map/tavern/llm-gateway.mjs` `PROVIDERS` L7–13, `checkConfig`, `buildRequest`,
    `redact`; `map/tavern/interaction-modes.mjs` `tokens` L8, `stateLine` L22–43; `map/tavern/model-texts.mjs`
    `injectReason` L20; `map/tavern/eden-map.js` L509 (digest injection), L571–582 (macros).
  - Viewer: none for routes (S8-4b's `route-plan` draws them); `map/app/nav-ops-view.mjs` for the renamed strings only.
  - i18n: `map/i18n/zh.json`, `map/i18n/en.json` keys `th.*`, `nav.*`, `s.*`, `cu.sync_hint2`, `ch.port_hint`; the first
    pack's manifest `strings` (`map/packs/eden/` manifest).
- Probes that read settings: `contrast_v2`, `custom095`, `e7`, `topo_dairy`, `text_dump`, `v096`, `v2a`, `th_adopt`,
  `layers_ext`, `pack_editor`, `pack_switch`.

#### 2. Scope

IN: T0 baseline + gate R0 · T1 groups and pages · T2 feature-card component and the AI 联动 page · T3 host health ·
T4 status-line fields, spatial depth · T5 AI 参谋 (rename, endpoint form, test connection, consent, cadence) · T6
`OP_ROUTE` (K-R130) · T7 hints and strings · T7b N10 items 11, 12, 13 (descriptions), 15 and the no-labels gate · T8 docs · gates R1, R2 · T9 push and RESULT.

OUT: any visual restyling (glass, tokens, z-index: S7-2); the layer popover and greying (S7-2); the 3D pages; the
content of the digest and the status line (only the omit option); new AI features; the transit network and router
themselves (S8-4); storage key renames (S10).

#### 3. Setup

```bash
git fetch
git worktree add -b s7-1-settings <scratchpad>/s7-1 origin/preview
```
Check first: `map/core/router.mjs` exports `routeOp` and the host sends `eden-map:ops` with `routes` (S8-4b landed) —
if not, stop BLOCKED. If `docs/plans/FREEZE_MAPS` exists on origin/preview, stop (T7 edits the first pack's manifest).
Baseline: `node --test tests/*.test.mjs` (note the count) and `bash tools/smoke.sh` green; run the §7 probes on the
untouched tree and keep their ✓ / ✗ lists.

#### 4. Tasks

**T0 — Baseline and gate R0.** Create `tools/browser/s7_shots.mjs` (states 1, 4–10, 12 of `docs/ui-refactor.md` §8.2;
host stub via `openInHost`; arguments `<out-dir> [--only <nn,…>]`; uses only `lib.mjs` helpers) and run it into
`~/eden-map-review/overnight/s7/s7-1-r0/`. Write a static mockup of the new home page and the AI 联动 page (one HTML
file using `map/ui/tokens.css`, outside the repo, in the same folder) from `docs/settings-ia.md` §2 and §4. Stop with
`status: PARTIAL`, `review: R0 — look at: grouping and order of the home page; card anatomy; consent wording; the
contradictory-hint fixes of settings-ia §6`. Continue when the orchestrator sends the findings.

**T1 — Groups and pages.**
- New `map/app/settings-pages.mjs` (≤ 250 lines): builds the page sections that `viewer.html` holds today (L647–690)
  from one table `[{ page, rows }]`, keeping every control id and `data-i18n` key; `viewer.html` keeps only the sheet
  shell (`#setPop`, `.sheet-h`, empty `section.spage` per page) and must shrink (ledger 707).
- `settings.mjs` `PAGES`: `home, map, people, ai, data, update, adv, license`; `setPage('display')` → `map`;
  `SettingsApi.open('display')` keeps working; `setPage('ai')` posts `eden-map:th` `op: 'state'` (as `data` does).
- Home: search; the 常用 block (theme, language, sharpness, handedness; on phones the quick actions and quick layers
  above it, as today); the group list with summaries (`s.map_sub`, `s.people_sub`, `s.ai_sub` = `{n} 项开启 · {m} 项未生效`
  from the health payload, hidden when not embedded, `s.data_sub`, `s.update_sub`, `s.adv_sub`); a credits row.
- Moves per `docs/settings-ia.md` §3.1: night tint, portraits and gallery rows leave `custom-names-view.mjs` `renderUI`
  (the module exports `nightRow()`, the portraits / gallery rows move into `characters-view.mjs` / `gallery-view.mjs`
  registrations on `people` with `registerSection`); reduce motion, no-fx, fog, minimap, colour vision, 3D quality,
  3D auto-collapse to `map`; loading line to `update`; action injection and compose templates to the C10 card (T2).
- 版权申明: the author line of `viewer.html` L654 is removed; `renderLicense` already renders `credits` (L80–83) — add the
  original post link from `credits.card.url` when present (pack data; no card name in engine code).
- `setSearch` selector list (L94) gains `.fcard > details > summary`.

**T2 — Feature cards and the AI 联动 page.**
- New `map/app/feature-card.mjs` (≤ 200 lines): `featureCard(def, state)` → element per `docs/settings-ia.md` §4.1
  (header with switch and health dot; sub-options; "what it does now" block with `≈ n token`; health line
  `role="status"`; learn-more `<details>`). All text through `textContent`; switches post `eden-map:th` `op: 'prefs'`.
- New `map/app/ai-cards.mjs` (≤ 250 lines): the ten card definitions C1–C10 (ids `digest, state, macros, dice, ledger,
  spatial, wbJit, wbXtal, nav, inject`), each with its prefs keys, sub-options and i18n keys (`fc.<id>.name`,
  `fc.<id>.purpose`, `fc.<id>.more`, `fc.reason.<code>`); renders the `ai` page from the last `eden-map:th-state`.
- `tavernhelper-settings.mjs`: `renderInj` and its `thAdv` box are removed (moved into cards); `renderWb` stays on
  `data`; `applyState` also calls the AI page render; the injected `<style>` (L113) moves into `feature-card.mjs`'s own
  style string using tokens only (no new inline appearance style, no bare z-index).
- C10 takes the action-injection segment (`#injSeg` logic from `settings.mjs` L155–160, ids kept) and the compose
  templates box (`compose-view.mjs` `renderUI` registers on `ai` with the C10 card as its parent).

**T3 — Host health (`map/tavern/feature-health.mjs`, new, pure, ≤ 150 lines).**
- `healthOf(facts)` → `{ <id>: { on, state, reason?, floor?, text?, tokens?, stats? } }` per `docs/settings-ia.md` §4.5;
  `facts` = `{ prefs, api: { inject, macros, worldbook }, digest: { text, floor }, state: { text, reason, floor },
  spatial: { text, floor, placed }, macros: { here, route }, dice: { last, floor }, ledger: { rows, floor },
  jit: { on, enabled, disabled, floor, book }, xtal: { written, last, floor, book, seenTags }, nav: { consent, cfgOk,
  lastAt, runs, lastN, lastDropped, lastStatus, nextAt, generating }, inject: { mode, lastOk, floor } }`; texts capped
  at 600 characters; tokens through `interaction-modes.mjs tokens`.
- Wiring (record facts where they already happen; no new API calls): `eden-map.js` L509 keeps the last digest text and
  floor; `modes-flow.mjs` `stateInject` / `spatialInject` record text, reason and floor; `llm-flow.mjs` records the
  JIT plan counts, crystallisation writes, navigator ledger and last HTTP status; `stash-flow.mjs` records the last
  check; the settlement gate records written rows. `host-tavernhelper.mjs` `sendTh` adds `health: healthOf(facts)`.
  `eden-map.js` must not grow (ledger 675): the facts object lives in `feature-health.mjs` (`createFacts()`), the entry
  only passes it in the deps bag.
- `protocol.mjs` SCHEMA L80: `health: 'object?'`.

**T4 — Status-line fields, spatial depth.**
- `storage.mjs`: `edenMapStateOmit: { owner: 'host', def: '[]' }`, `edenMapSpatialDepth: { owner: 'host', def: '2' }`,
  `edenMapGlassClock` is S7-2's; add `edenMapStateOmit` to `SCRIPT_KEYS` and the host `PREF_KEYS` (they must stay
  identical, `tests/storage.test.mjs`).
- `modes-flow.mjs` `stateText`: `skip = { ...cardSkip, ...omitSkip }` where `omitSkip` maps the omitted fields
  `here | present | time | trips` to true; `stateLine` is unchanged. `spatialInject` uses `edenMapSpatialDepth`.
- `host-tavernhelper.mjs` prefs: `stateOmit` (array, filtered to the four names), `spatialDepth` (0–20),
  `spatialBudget` (60–240); `thPrefs` returns them.
- Parity test: for the two session fixtures of `tests/` that already pin the status line, the injected text with
  `stateOmit` empty and `spatialDepth` 2 is byte-identical to the frozen text.

**T5 — AI 参谋.**
- Strings per `docs/settings-ia.md` §8 (zh + en; `core/layer-defaults.mjs` L24 fallback text; `llm-flow.mjs` L57 toast
  title through `hostStr` keys with the new neutral defaults).
- Endpoint form (C9 sub-options): provider select from a `providers` list the host sends in `th-state`
  (`llm-gateway PROVIDERS` ids and labels; the labels go through i18n keys `fc.nav.p_<id>`), base, model, key
  (`type=password`); save posts `prefs.navCfg` (same JSON as today). The host's `thPrefs.navCfg` becomes
  `{ provider, base, model, hasKey }` (never the key); the viewer accepts the old boolean.
- `nav-test` op in `host-tavernhelper.mjs` `onTh`: `buildRequest(cfg, [{ role: 'user', content: 'ping' }], { maxTokens:
  8 })`, 15 s `AbortController`, `cdnFetch`; answer `sendTh({ result: { navTest: { ok, status, ms, error } } })` with
  `error` from `redact`. Busy flag: one test at a time.
- Consent: `llm-flow.mjs` L34–38 becomes `if (lsGet(CONSENT_KEY) !== '1') { facts.nav.consent = false; return; }`
  (no `window.confirm`, no switching off). Prefs `navConsent` (true → `'1'`, false → `'0'` and `edenMapNav` `'0'`).
  The card shows the consent block while consent is not `'1'` (`docs/settings-ia.md` §4.3).
- Cadence: prefs `navCadence` ∈ {120000, 300000, 600000} writes the number into `edenMapNav` (the existing ms form of
  `intervalOf`); the switch writes `'1'` / `'0'` as today.
- Tests: no `window.confirm` / `prompt(` left in `map/tavern/llm-flow.mjs` and `map/app/tavernhelper-settings.mjs`
  (grep test); prefs round-trip; `nav-test` with a stubbed fetch (ok, 401, timeout); the key never appears in any
  `th-state` payload (stringify check).

**T6 — `OP_ROUTE` (K-R130).** S8-4 owns the router, the suggestion store, the `routes` field and the drawing
(K-R109, K-R113); this task adds only the op and the call.
- Contract text for K-R130 in `docs/kernel-schema.md` (+ zh), replacing the "Planned in S7" line with an "Added by
  S7-1" line and the full rule after K-R113: the op shape and validation below; delivery and drawing as K-R113.
- `operation-dsl.mjs`: `PLANNER_OPS` gains `'OP_ROUTE'`; the parse regex accepts `ROUTE`; `VALIDATE.OP_ROUTE`: `to`
  string 1–40 (required), `from` string 1–40 (optional; absent = the player's current place), `why` string ≤ 60
  (optional) — the row shape of `routeOp` (transit-schema §3.5); at most **one** `OP_ROUTE` per response (a second one
  is dropped and counted); `isExample` echo check on `why`. `apply` gains `routes: [{ to, from?, why?, src: 'op' }]`.
  `MAX_OPS` stays 3.
- `planner-gateway.mjs` `systemPrompt`: the op list line names `OP_ROUTE {…}` and one new line
  `- OP_ROUTE {to, from?, why?}：建议的路线；地点必须用输入里出现过的写法`. Pin the new prompt in its test.
- `llm-flow.mjs` `navRun`: for each `d.routes` row call `routeOp(row, { graph, locate, here: host.here, floor:
  host.floorNow, map })` (graph and `locate` as S8-4b's host route flow builds them); a non-null result goes into
  S8-4b's suggestion store (the function it exports for that; ≤ 3 rows, 20-message ageing, `eden-map:ops.routes`); a
  null result is counted in the navigator ledger as dropped; when the pack has no network the `why` text joins the
  AI 参谋 toast (U-12 A). No viewer change.
- Tests: `tests/operation-dsl.test.mjs` (valid, missing `to`, `to` over 40, `why` over 60, two routes → one kept and
  dropped 1, echo `why`); a host test with a stub `routeOp` (accepted row reaches the store; null counted; no network →
  toast text).

**T7 — Hints and strings.** Apply every row of `docs/settings-ia.md` §6 in `map/i18n/zh.json` and `en.json`; the first
pack's exact portrait sentence moves to its manifest `strings` under `ch.port_hint` (same words as today; FREEZE rule
of §3 applies to this commit: create `docs/plans/FREEZE_MAPS`, commit, edit, delete it in the same push). Run
`node tools/browser/text_dump.mjs` before / after and list every changed key in the RESULT (`docs/settings-ia.md` §7 is
the allowed list; anything else is a stop).

**T7b — N10 settings and wording items** (`docs/todo.md` N10 items 11, 12, 13 descriptions, 15, the gate; acceptance
at 375 px and 1440 px, screenshots in `~/eden-map-review/overnight/s7/s7-1-n10/`):
- (11) action injection on AI 联动 (C10, T2); the night-tint row on 地图与图层 with its own title and switch and neutral
  wording (`docs/settings-ia.md` §6 `cu.night`); one 「快捷键」 entry in 高级 (the `s.kbd_group` heading and the `#kbdBtn`
  row become one row: switch + "查看" button); the build code (`#build`) moves to 高级 › 开发者 (a new collapsed group
  holding build code, debug FPS and the standalone "当前地点" input) and 更新与版本 shows `构建 head #N · <date>` from the
  existing about payload (`about-build.mjs buildLine`). Check: each control exists once (DOM id count 1).
- (12) plain language: `s.tick` / `s.tick_hint` and the first-run hint (`app/notice-layer.mjs` `firstRunHint`, today 4
  items) rewritten per `docs/settings-ia.md` §6 (three short steps, no internal terms). Check: the hint has 3 items.
- (13) one-line description per layer: the menu row shows `menu.title` (kernel and pack layers already carry it) as a
  muted second line in the popover and the settings list (not only as a tooltip); rows without a title show none.
- (15) the 「· 设定」 suffix on roster rows without live variables (`ch.from_card`, used in `characters-view.mjs`,
  `core/roster.mjs`, `tavern/mvu-readers.mjs`): grep every reader, remove the suffix from the UI (the source stays
  available in the data for tests); en `ch.from_card` likewise.
- Gate: `tools/check_no_labels.py` gains the UI-text patterns 「（卡 」, 「原卡」, 「不描述」, 「未定」, 「· 设定」 (and
  their en forms "not described", "(card ") over `map/i18n/*.json`, pack `strings`, and string literals of `map/**`
  engine files; hits that S7-3 removes (the estate page and the two pickers) go into an explicit allow-list in the gate
  with the comment `S7-3 removes` — S7-3 must empty it. Self-test cases for each pattern.

**T8 — Docs.**
- `docs/naming.md` (+ zh) Decisions: "user-facing 「地图领航员」 → 「AI 参谋」 / "AI advisor" (N7, S7-1); internal ids
  unchanged: `nav-ops`, `edenMapNav*`, `planner-gateway.mjs`, `NavOpsApi`; glossary row **AI advisor (planner)**
  replaces the user-facing wording of "planner (navigator)"".
- `docs/ARCHITECTURE.md` (+ zh) §3.1–§3.3 rows for `core/…` none, `app/settings-pages.mjs`, `app/feature-card.mjs`,
  `app/ai-cards.mjs`, `tavern/feature-health.mjs`; file counts in the §3 intro; `python3 tools/check_arch_doc.py`.
- `docs/todo.md`: N4 and N7 struck with the shas; status line.

**Gate R1** (after commit 2 of §8): `s7_shots.mjs` into `…/s7-1-r1/`; stop with `review: R1 — look at: …` (every
changed state, the before / after pairs, the text_dump diff). **Fixes**, then **gate R2** into `…/s7-1-r2/`; stop. Push
only after R2 passes (§8.3 pass rule of `docs/ui-refactor.md`).

#### 5. Constraints

- Injected and chat-bound texts byte-identical by default (status line, spatial contract, digest); the only model-facing
  change is the AI 参谋 system prompt line for `OP_ROUTE` (goes only to the user's endpoint).
- New toggles default off and are registered (storage key, protocol field where host ↔ viewer, zh + en strings): here
  `edenMapStateOmit` (empty), `edenMapSpatialDepth` (2 = today), prefs fields `stateOmit`, `spatialDepth`,
  `spatialBudget`, `navConsent`, `navCadence`, payload `health`, op `nav-test`, `eden-map:ops.routes`.
- No blocking dialog anywhere you touch (`confirm`, `prompt`, `alert`).
- Engine files: no card terms, no bare z-index, no new inline appearance style, ≤ 400 lines; `viewer.html` and
  `eden-map.js` must not grow; `map/core/*` imports nothing outside `map/core`.
- The key of the AI 参谋 endpoint never leaves the host (not in `th-state`, not in logs except `redact` form).
- Pack text and model output reach the page through `textContent` / `esc()` only.

#### 6. Tests to add

- `tests/settings_pages.test.mjs`: every control id of today's markup exists after `settings-pages.mjs` builds the pages
  (list frozen from `viewer.html` at `df3b5f6d`); each lands on the page of `docs/settings-ia.md` §3.1; `display` alias.
- `tests/feature_health.test.mjs`: each card's states and reasons from hand-built facts; caps; tokens.
- `tests/feature_card.test.mjs` (jsdom-free: test the pure `cardModel(def, state)` that `featureCard` renders from).
- T4 parity, T5 consent / config / key-leak, T6 DSL / nav-ops / view tests as listed.
- `tests/storage.test.mjs` passes with the new keys; count = baseline + new tests.

#### 7. Verify

```bash
node --test tests/*.test.mjs
bash tools/smoke.sh
python3 tools/check_architecture.py && python3 tools/check_arch_doc.py && python3 tools/check_zh_mirror.py
node tools/browser/s7_shots.mjs ~/eden-map-review/overnight/s7/s7-1-r2
node tools/browser/text_dump.mjs; node tools/browser/th_adopt.mjs; node tools/browser/layers_ext.mjs
node tools/browser/contrast_v2.mjs; node tools/browser/v096.mjs; node tools/browser/pack_switch.mjs
```
Expected: probes as on the base (known failures in `tools/browser/known-failures.json` count as KNOWN); `text_dump`
differs only by the keys of `docs/settings-ia.md` §7.

#### 8. Commits & push

1. `feat(settings): eight groups, pages built by settings-pages.mjs, moved rows` (T1).
2. `feat(ai): feature cards with health; status-line fields; AI advisor consent, endpoint form and test` (T2–T5).
3. `feat(nav): OP_ROUTE suggestions through routeOp (K-R130)` (T6).
4. `chore: freeze maps` / `i18n: settings hints and the AI advisor rename; pack portrait sentence` / `chore: unfreeze`
   (T7).
5. `fix(settings): N10 settings items, plain wording, layer descriptions, roster suffix; no-labels gate patterns` (T7b).
6. `docs: settings IA in the module map, naming decision, todo; RESULT S7-1` (T8, review notes, RESULT) — push after R2.

Each commit reverts alone (no commit depends on a later one; T6 only needs T2's card to show routes in the stats line,
which degrades to nothing). Messages via `-F`, `git -c user.email=kcgoofee-jpg@users.noreply.github.com commit`, no
Co-Authored-By trailer. Push `bash tools/push_preview.sh --head --no-escalate`; check CI with `gh run list --branch
preview -L 1` and a background `gh run watch <id> --exit-status`.

#### 9. Stop and report instead of guessing when

- S8-4b has not landed or `routeOp` / the suggestion store do not match what T6 needs (report the gap; T1–T5 may continue only if the
  orchestrator says so);
- an injected text differs for the frozen fixtures, or `text_dump` shows a key outside the allowed list;
- a probe passing on the base fails after your change;
- a file would pass 400 lines, or `viewer.html` / `eden-map.js` would grow;
- each review gate (R0, R1, R2): stop with `status: PARTIAL` and the `review:` block;
- push rejected (never force) or CI fails twice; the test count drops without a named replacement;
- the no-labels gate finds a hit outside the S7-3 allow-list that you cannot reword neutrally.

#### 10. Report

RESULT block of `docs/agent-brief.md` §5 with extra lines `n10: <item> <check result>` (items 11, 12, 13, 15),
`review: R0 <n findings> · R1 … · R2 pass`, `text changes:
<keys>`, `files: <new files with line counts>; viewer.html <before> -> <after>`, `health: <cards working in the stub
run>`. Cleanup: probe servers stopped, no `.claude/launch.json` entries.

### S7-2 — visual system on tokens, HUD, applicability greying, mobile, 3D

Model: Sonnet · High · Size L (one prompt with review gates, about 6 h). English only. Written by the S7-design session
on 2026-10-01 at origin/preview `df3b5f6d`. Runs after S7-1 (it restyles the settings S7-1 built); independent of S8-4.

#### 0. Why

Plan §5 S7: glass tokens with day / night variants, the z-index ladder in `tokens.css`, the host page and `map/ui/*`
through tokens; Dark Frost Glass on the clock capsule, top bar, layer popover, toolbar, drawer and settings; layers
greyed when not applicable and their animation paused (L-06); ⓘ / U21 click-through re-check; I-05, I-06, E-12 and the
open backlog items U20, U22, U23; `docs/todo.md` N10 2D items (user UI audit). Design: this document §0 (U-01 … U-04,
U-13 … U-24), §2–§8, T10 below.

#### 1. Read first

- `docs/agent-brief.md`, this document (all), `docs/layers-schema.md` §5 (`applies`), §6 (menu).
- Code (line numbers at `df3b5f6d`; S7-1 moved settings markup into `app/settings-pages.mjs`):
  - `map/ui/tokens.css` (all, 55 lines); `map/viewer.html` L36–55 (theme), L195–204 (ladder), L206–253 (header),
    L255–311 (pop, settings), L326–362 (dock, zoom, level strip), L545–604 (credit, mobile rules).
  - Bare z-index list and inline-style ledger: `tools/arch_baseline.json` `zindex` (L8–23), `inline_style` (L25–50);
    `tools/check_architecture.py` `scan_zindex` L313–328.
  - `map/ui/sheet.js` L11–72; `map/ui/notice.mjs` L11–48; `map/ui/chrome3d.js` L10–42; `map/ui/camera-controls.js`
    L11, L20, L86; `map/ui/room-gallery-panel.js` L99; `map/ui/gallery.js` L6; `map/ui/illustration-panel.js` L66.
  - `map/app/theme.mjs` L13–35; `map/app/layer-host.mjs` L71–90 (`renderLayerMenu`); `map/app/declared-layers.mjs`
    L40–43 (`layerContext`), L58–72 (`refreshDeclared`); `map/core/layer-registry.mjs` L85–89; `map/core/layer-spec.mjs`
    L194–216; `map/app/visibility.mjs` L15–68; `map/app/wander.mjs` L73–80, L141; `map/app/clouds.mjs` L46, L89, L126;
    `map/app/sharpness-tiers.mjs` L199–230 (`declutter`); `map/app/topbar.mjs` L16–29; `map/app/control-column.mjs`
    L13–47; `map/app/pack-edit-view.mjs` L117–128 (`#editBar`); `map/app/subpage3d-host.mjs` L35–48, L111–147, L168–178.
  - Host: `map/tavern/host-lifecycle.mjs` L36–198 (injected CSS: `.em-ctoast` L48, `.em-fab` L62–66, `.em-panel` L88,
    `.em-bar` L95, clock L131–133, mobile L171–183); `map/tavern/splash.mjs` L17–18; `map/tavern/eden-map.js` L65–70,
    L239, L561–562; `map/tavern/host-checks.mjs` L168–194 (update prompt).
  - 3D: `map/estate/main.js` L61, L65, L126–128, L760–768, L800–802, L905–912, L1045–1050, L1195–1199;
    `map/estate/index.html` L34–35, L50–152; `map/props/viewer3d.html` L18, L31–32, L60, L96, L242–246, L281–286,
    L320, L344–349, L863–873; `map/three/render-context.mjs` L22–56.
  - Custom-names / events: `map/custom-names-view.mjs` L289, L334, L381, L384–386; `map/events-view.mjs` L256, L260,
    L333, L336, L340; `map/unmapped-place-picker.mjs` L119; `map/app/fps.mjs` L11.
- Probes: `contrast_v2`, `accept`, `perf_v2`, `v096`, `v2a`, `ui092`, `layer_dump`, `pack_layers`, `layers_ext`,
  `webgl_single_ctx`, `estate3d`, `props_u12`, `pack_editor`, `autoupd097`, `s43_parity`, `s7_shots` (from S7-1).

#### 2. Scope

IN: T0 baseline, perf before-numbers, gate R0 with mockup · T1 tokens (glass, day / night option, z ladder, host token
block) · T2 bare z-index and fallbacks on tokens · T3 surfaces on glass · T4 layer greying + animation pause · T5
mobile (U20, U22, U23, E-12) · T6 I-05 · T7 I-06 + U-23 · T8 ⓘ / U21 / U19b probe and fixes · T9 docs · T10 N10 items 5,
7, 8, 9, 10, 13, 14, 16, 17 · gates R1, R2 · push and RESULT. (N9 and N10 items 1, 2, 3, 4, 6 are S7-3's.)

OUT: settings structure and AI cards (S7-1); new layers, `applies` data or the evaluator (S8); estate rendering (U4–U6);
the reload stutter investigation (I-29) beyond not regressing it; storage key renames (S10).

#### 3. Setup

```bash
git fetch
git worktree add -b s7-2-visual <scratchpad>/s7-2 origin/preview
```
Baseline: `node --test tests/*.test.mjs` (count), `bash tools/smoke.sh`; run the §7 probes on the untouched tree and keep
their lists; record `accept` first-screen time and `perf_v2` long-task count three times each (median) for the
performance persona.

#### 4. Tasks

**T0 — Gate R0.** `node tools/browser/s7_shots.mjs ~/eden-map-review/overnight/s7/s7-2-r0` (extend it first with states
2, 3, 11 of §8.2); write `mockup.html` in the same folder: the header, level strip, toolbar, layer popover (with a
greyed row and its reason), drawer peek and a settings page drawn with the new tokens over a screenshot of `tc_mid` as
background, in dark and light. Stop with `review: R0 — look at: glass strengths, contrast on busy map areas, greyed
row reading, day / night pairs`.

**T1 — Tokens (`map/ui/tokens.css`).**
- Glass tokens and `.g1` / `.g2` classes with fallbacks (§2.2); `--r-glass`, `--sp-8`, `--warn`, `--shadow-1` (§2.5);
  `--surface-glass` aliased to `--glass-2`.
- Move the ladder from `viewer.html` L195–204 into `tokens.css` and add the tokens of §2.4 (values unchanged; `.rgp` →
  `--zu-panel`). `viewer.html` loses those lines (ledger may only shrink); the `tests/layer_registry.test.mjs` mirror
  check reads `tokens.css` instead of `viewer.html`.
- `edenMapGlassClock` (storage key, default `'0'`, owner `app/theme.mjs`; viewer only, no protocol field): a switch row
  on the 地图与图层 page (via `registerSection('map', …)`) and the rule of §2.3 in `app/theme.mjs` reading the last
  `eden-map:clock` (`body[data-tod]` is already set by `custom-tint.mjs`; use its band).
- New `map/tavern/host-tokens.mjs` (≤ 80 lines): exports `HOST_TOKENS_CSS` (the `--zh-*`, glass and colour values for the
  host page, dark and `.em-light`); `host-lifecycle.mjs` injects it before its own rules and its literal `--em-*` values
  become `var(--…)`. Test `tests/host_tokens.test.mjs`: every value in `HOST_TOKENS_CSS` equals the `tokens.css` value of
  the same name.

**T2 — z-index on tokens.** Replace every bare value of §2.4 (files and lines there) by its token; drop the literal
fallbacks of `--zv-*` uses; `python3 tools/check_architecture.py --update-baseline` (the `zindex` section must go to
zero entries for these files). `s43_parity` screenshots identical except the `.rgp` case (which no probe opens; note it).

**T3 — Surfaces on glass** (§3): header, host bar and clock capsule (U-17), ⓘ, level strip and zoom (U-18), layer
popover, drawer, settings sheet and feature cards, notices, place / person card, `chrome3d.js`, `viewer3d.html`, the
estate page palette mapping. Components use `.g1` / `.g2` or the tokens; no colour literals added; inline appearance
styles only shrink.

**T4 — Applicability greying and the pause** (§4, U-15 C, U-16 A).
- New `map/core/applies-hint.mjs` (pure, ≤ 80 lines) with `appliesHint(applies, ctx, names)`; tests for each key, the
  `data`-only case (→ null) and the two-part cap.
- `layer-host.mjs` `renderLayerMenu` and `declared-layers.mjs` `refreshDeclared`: one pass over all menu rows: hide
  (data-only), grey with reason and sort under the divider (`lyr.na` i18n `此处不适用` / `Not here`), or normal; the
  greyed row's switch still works. Re-run on map change, clock change and layer-data change (the existing hooks).
- `wander.mjs` and `clouds.mjs` through `createPauseSwitch` / `visibilityGuard` and the registry's visible / applicable
  state; `ViewerDebug.raf()` (read only) counts rAF requests per layer per second.
- New probe `tools/browser/raf_pause.mjs`: on `tc_mid` with weather and traffic on, then each switched off, then the
  document hidden (`page.evaluate` dispatch of `visibilitychange` with `document.hidden` stubbed), then reduced motion:
  per-layer rAF/s = 0 in each paused case; the town pack with its danger-zone layer outside `applies`: row greyed with a
  reason, rAF 0.

**T5 — Mobile** (§5): header and host bar widths (U-19); settings sticky header `--hostbar-w` padding and `#licBox .row`
flex (U20); compact P1 notice on ≤ 640 px (U-22: `notice.mjs` `.nt-p1` one line, "详情" toggle, `max-height: 30%`;
update prompt `host-checks.mjs` L168–194 passes its secondary lines as details); E-12 (U-20): `pack-edit-view.mjs`
collapses `#editBar` into a header button `#editMore` when `ViewerDrawer.state` is `half` / `full` at ≤ 640 px, menu with
the same actions; probe `pack_editor` screenshot `edit_phone` shows no overlap.

**T6 — I-05** (U-14 A, §7.1): `estate/main.js` creates its renderer with `createRenderer` from `three/render-context.mjs`
(import-map alias `engine3d/`), disposes on `pagehide`; `subpage3d-host.mjs` releases parked frames before a new
`openEstate`. Probe `webgl_single_ctx` extended: estate → props viewer → estate keeps ≤ 1 live context.

**T7 — I-06 and U-23** (§7.2): settings rows on 地图与图层 › 三维: auto-rotate (`edenMap3dAutoRotate`) and wheel zooms
(`edenMap3dWheelZoom`, new key, default `'0'`, owner `ui/camera-controls.js`); both reach the 3D pages through the
existing state message (protocol field `wheelZoom: 'boolean?'` on that message, registered); wheel mapping in both pages;
`makeIdleTimer` rotation does not write the key.

**T8 — ⓘ / U21 / U19b** (§7.3, §7.4): new probe `tools/browser/s7_hit.mjs`; run it on the untouched tree first (record
in the RESULT whether each case reproduces), then fix only what reproduces (U-21 A in `declutter`; the hover bridge).

**T9 — Docs.** `docs/ARCHITECTURE.md` (+ zh): rows for `core/applies-hint.mjs`, `tavern/host-tokens.mjs`, the probes;
§8 (rendering stack) a paragraph on the glass classes and the z ladder's home; `docs/todo.md`: I-05, I-06, E-12 struck
with shas, S7 line struck after both specs; `docs/ui-refactor-backlog.md` rows U20–U23 and U19b struck with shas.

**T10 — N10 2D items** (`docs/todo.md` N10; acceptance at 375 px and 1440 px, dark and light, each with a
screenshot pair in `~/eden-map-review/overnight/s7/s7-2-n10/`):
- (5) the replay bar (host `.em-tl`, `host-lifecycle.mjs` L121) overlaps the zoom stack and floating cards: dock it as
  a glass-1 bar above the drawer peek and shift `#dock` and `#card` up by its height while it shows (CSS variable
  `--tl-h` set by the host through the existing inset message); check: no overlap of `.em-tl`, `#dock`, `#card`.
- (7) the host status line joins place parts without a separator (「<estate><room>」): join the location chain with
  ` · ` where the host builds the bar text (grep `em-here` in `map/tavern/`); check: text contains ` · ` between parts.
- (8) room gallery dialog (`ui/room-gallery-panel.js`): the empty-state text uses the dialog's full width; uploaded
  thumbnails are `object-fit: cover` inside a fixed square frame; check: no element wider than its frame.
- (9) the level strip (`#layers`) covers place labels: `declutter()` treats the strip's rect as an obstacle (labels under
  it hide, tap reveals), or the strip gets `max-height` and scroll at narrow widths; check: no visible label rect
  intersects the strip on `tc_upper`, `tc_mid` at both widths.
- (10) the FPS overlay (`app/fps.mjs`) moves to the top-left corner under the header, away from `#dock`; check: no
  overlap.
- (13) greying with a reason: done by T4 (checked here at both widths).
- (14) upper-tier island pins show no names at default zoom: major places (marker `pri` ≥ the pack's threshold, or the
  node's `x-major` flag if the pack sets it; fallback: the top 8 by `pri`) keep their name label at the view's default
  zoom; the rest follow today's zoom rule; check: on `tc_upper` default view ≥ 5 named labels, no overlaps (U-21).
- (16) roster rows (`characters-view.mjs` `row`, L163) without a rank badge collapse the empty `<em>` row; check: no
  empty badge row in the people tab DOM.
- (17) avatar ring colours: U-24 A (one muted explanatory line; first verify that the map pins use `colorOf` too —
  otherwise apply U-24 B).

**Gate R1** after commit 4 of §8 (`s7_shots` into `…/s7-2-r1/`, plus `raf_pause`, `s7_hit`, `contrast_v2`, `accept`
and `perf_v2` numbers against the T0 medians); stop. **Fixes**; **gate R2** into `…/s7-2-r2/`; stop. Push after R2 passes.

#### 5. Constraints

- Visual change only where this design says; `s43_parity` differences must be explained by a surface of §3.
- No bare z-index, no new inline appearance style, no colour literals in component CSS (tokens only); files ≤ 400 lines;
  `viewer.html` and `eden-map.js` must shrink or stay.
- New toggles default off and registered: `edenMapGlassClock`, `edenMap3dWheelZoom` (+ the 3D state message field).
- No blocking dialogs; reduced motion and reduced transparency honoured everywhere touched.
- `accept` first-screen time and `perf_v2` long tasks must not be worse than the T0 medians by more than 5 % (I-29).
- Engine files carry no card terms; pack text through `textContent`.

#### 6. Tests to add

`tests/applies_hint.test.mjs`, `tests/host_tokens.test.mjs`, `tests/z_ladder.test.mjs` (every `var(--z…)` used in
`map/**` is defined in `tokens.css` or the host token block; `--zv-*` values equal `core/layer-registry.mjs` slots),
`tests/camera_prefs.test.mjs` (idle rotation never writes the key; wheel mapping table), updated
`tests/layer_registry.test.mjs` mirror source. Count = baseline + new.

#### 7. Verify

```bash
node --test tests/*.test.mjs
bash tools/smoke.sh
python3 tools/check_architecture.py && python3 tools/test_architecture_gate.py && python3 tools/check_arch_doc.py
node tools/browser/s7_shots.mjs ~/eden-map-review/overnight/s7/s7-2-r2
node tools/browser/raf_pause.mjs; node tools/browser/s7_hit.mjs; node tools/browser/contrast_v2.mjs
node tools/browser/webgl_single_ctx.mjs; node tools/browser/pack_editor.mjs; node tools/browser/pack_layers.mjs
node tools/browser/accept.mjs; node tools/browser/perf_v2.mjs; node tools/browser/autoupd097.mjs
node tools/browser/s43_parity.mjs --out <scratchpad>/s7-2-after
node tools/browser/s43_parity.mjs --diff <scratchpad>/s7-2-before <scratchpad>/s7-2-after
```
Expected: new probes pass; others as on the base (known failures count as KNOWN); before / after screenshots (1440 + 375,
dark + light) copied to `~/eden-map-review/overnight/s7/`.

#### 8. Commits & push

1. `feat(tokens): glass tokens, day/night option, z ladder in tokens.css, host token block` (T1).
2. `refactor(ui): every z-index on tokens (value-preserving; .rgp fixed)` (T2).
3. `feat(ui): Dark Frost Glass on header, HUD, popover, toolbar, drawer, settings, notices, 3D chrome, host page` (T3).
4. `feat(layers): grey inapplicable rows with a reason; pause wander and clouds; raf_pause probe` (T4).
5. `fix(mobile): header widths, settings header, compact update notice, edit bar over the drawer (U20, U22, U23, E-12)`
   (T5).
6. `fix(3d): estate renderer through render-context with dispose (I-05); camera settings (I-06, U-23)` (T6, T7).
7. `test(ui): s7_hit probe; declutter priority / hover bridge if reproduced` (T8).
8. `fix(ui): replay bar dock, status separator, room gallery frame, level strip vs labels, fps corner, major names, roster rows, ring legend (N10)` (T10).
9. `docs: S7-2 module map, todo, backlog; RESULT S7-2` (T9, RESULT) — push after R2.

Each commit reverts alone (T3 depends on T1's tokens: revert 3 before 1). Messages via `-F`, the commit identity of the
agent brief, no Co-Authored-By trailer; push `bash tools/push_preview.sh --head --no-escalate`; CI check as in S7-1.

#### 9. Stop and report instead of guessing when

- a `s43_parity` difference cannot be traced to a surface of §3, or T2 changes any pixel besides `.rgp`;
- `accept` / `perf_v2` regress beyond 5 % after two attempts (report the numbers);
- contrast below the §6 thresholds on a surface and the fix would change the design (report the pair);
- each review gate (R0, R1, R2): stop with `status: PARTIAL` and the `review:` block;
- a file would pass 400 lines; push rejected; CI fails twice; the test count drops without a named replacement;
- T10: an N10 item needs a change in the 3D pages (that is S7-3's) — leave it and note it.

#### 10. Report

RESULT block with extra lines `n10: <item> <check result>` (one per item), `review: R0 … · R1 … · R2 pass`, `perf: accept <before → after> ms, perf_v2 long tasks
<before → after>`, `z-index: ledger entries <before → after>`, `reproduced: ⓘ <y/n>, U21 <y/n>, U19b <y/n>`, `files:
<new files with line counts>; viewer.html <before> -> <after>`. Cleanup: probe servers stopped, no `.claude/launch.json`
entries.

### S7-3 — one shell for 2D and 3D, presence in 3D, one card system

Model: Sonnet · High · Size L+ (one prompt with review gates, about 8 h; the orchestrator may run it as two prompts:
S7-3a = T0–T6, S7-3b = T7–T10, each with its own R0 / R1 / R2). English only. Written by the S7-design session on
2026-10-01 at origin/preview `deda6969`. Runs after S7-2 (it uses its tokens, glass classes and level strip).

#### 0. Why

`docs/todo.md` N11 (user: the UI is still not unified; the 3D view shows no characters), plan §5 S7-3; plus N9 and the
N10 3D items (1, 2, 3, 4, 6) by the ownership table of §1.2. Today the estate 3D page (`map/estate/*`, an iframe) is a
separate app with its own rail (房间 / 图例 / 关于), card, fonts and colours; it draws routine-scheduled people only,
never the people the chat places in its rooms; hover and selection share one card; occluded labels stay half visible.
Design: this document §0 (U-24 … U-30), §3.8, §8.

#### 1. Read first

- `docs/agent-brief.md`, this document §0, §2, §3.8, §8, this spec; `docs/todo.md` N9, N10, N11.
- `docs/kernel-schema.md` K-R104 (3D manifest schema), §13 "Planned in S7" (K-R131, K-R132); `docs/entity-protocol.md`
  (people and their nodes).
- Code (line numbers at `deda6969`):
  - `map/estate/main.js` (1203 lines): chrome and sheet L37–45 (`UI3D.create`, tabs room / legend / about), texts
    L146–147 (`tx` zh / en: title, motto, floor words), `KIND_COL` L105, plates L369–381, NPC chips L486–520
    (`npcG`, `npcChip`, `npcColor`), room card L740–770, hover / pin L760–768 and L800–802, label ranking L831, room
    list L1127, view / floor handling, messages (`estate:*` handlers), auto-rotate L1195–1199.
  - `map/estate/index.html` (212 lines): own palette L34–35, `#card` L70, `#tip` L152, legend CSS L159–160.
  - `map/ui/chrome3d.js` (all), `map/core/scene3d-manifest.mjs` (`Estate3D.normalize`), `map/estate/model/manifest.json`,
    `map/data/schema/v2/scene3d.schema.json`.
  - Viewer: `map/app/subpage3d-host.mjs` (all, 270 lines: `openEstate` L111–147, `estate:routine` L209, message relay),
    `map/core/protocol.mjs` L84–112 (`estate:*`), `map/app/markers.mjs` (place card `#card`), `map/characters-view.mjs`
    (people rows, prefs `show` / `off`, `colorOf`), `map/app/spot.mjs` (where people are drawn), `map/app/locate.mjs`
    `hereRes`, `map/app/nodes-runtime.mjs` (room nodes: `x-storey`, `x-plan-kind`), `map/app/drawer-glue.mjs`,
    `map/app/control-column.mjs`, `map/app/map-level-nav.mjs` (level strip).
  - Data: `blender/estate2/floorplans.py` (rooms, kinds, `KIND_C` / `KIND_CN` L286–287), `map/data/eden_estate_rooms.json`.
- Probes: `estate3d`, `topo_dairy`, `webgl_single_ctx`, `props_u12`, `room_gallery_ui`, `chars092`, `s7_shots`.

#### 2. Scope

IN: T0 baseline + gate R0 · T1 pack data for the building (K-R131, K-R132) · T2 one shell (chrome-less iframe, viewer
controls) · T3 one card system (room and about as place-card sections, hover label, N10 (2), (6)) · T4 one token set
(3D page, room gallery, illustration panel) · T5 N9 · T6 N10 (1) `open` rooms · T7 labels: occlusion and N10 (4) ·
T8 presence chips (U-27, U-28) + probe · T9 watchdog scope for the estate page · T10 docs · gates R1, R2 · push and
RESULT.

OUT: the props viewer's content (it gets tokens only); 3D models and Blender builders' geometry (render line); the
routine schedule format; new layers; the 2D shell (S7-2).

#### 3. Setup

```bash
git fetch
git worktree add -b s7-3-shell <scratchpad>/s7-3 origin/preview
```
Check `docs/plans/FREEZE_MAPS` does not exist (T5, T6 edit pack data). Baseline: `node --test tests/*.test.mjs`,
`bash tools/smoke.sh`, the §7 probes; `accept`, `estate3d` and `perf_v2` timings three times (median).

#### 4. Tasks

**T0 — Gate R0.** `s7_shots.mjs` states 13 and 11 into `~/eden-map-review/overnight/s7/s7-3-r0/` (1440 + 375, dark +
light: world, upper, estate exterior, estate B1 section with the people the chat places there); a static mockup of the
estate view inside the main shell (viewer top bar, level strip with floors, toolbar with the view segment, drawer, the
shared room card with its sections, presence chips). Stop with `review: R0 — look at: shell layout in 3D, card sections,
chip style, legend chips`.

**T1 — Building data (K-R131, K-R132).** Contract text in `docs/kernel-schema.md` (+ zh) for K-R131 (`room_kinds`) and
K-R132 (`building: { title, motto, floors: [{ id, label }], i18n }` in a 3D manifest; plain text, `textContent` only);
`scene3d.schema.json` and `core/scene3d-manifest.mjs` validate and expose them; the eden manifest carries today's words
and colours exactly (taken from `main.js` L105, L146–147, L582 and `floorplans.py` `KIND_C`, plus a `medical` colour);
`main.js` reads them and keeps only neutral fallbacks (`Building`, no motto, floor ids as labels, grey kinds).

**T2 — One shell (U-25, U-26).** `estate/main.js` gets a `shell=host` mode (set by `subpage3d-host.mjs` when it builds
the frame): no `UI3D` chrome, no sheet, no own card; the canvas fills the frame. The viewer shows its level strip with
the building's floors while the estate view is open (`estate:floor` both ways, existing) and a glass-1 segmented
control 外观 / 内透 / 剖切 at the top of the toolbar column (new `estate:view { mode }` viewer → subpage and back;
registered in `protocol.mjs`); the drawer keeps 事态 / 人物 / 物品 / 地点. Standalone `estate/index.html` (no viewer)
keeps today's chrome. N10 (3) closes with this (no estate rail any more); check at 375 px: no overlap between drawer,
toolbar and level strip.

**T3 — One card system (U-30, N10 (2), (6)).** Click on a room → `estate:select { name, room }` (extend the existing
message with `room: 'object?'` = `{ name, floor, kind, area, note }` from the rooms JSON) → the viewer opens the shared
place card for that room node with a room section (floor label, area without the 「（卡 …）」 suffix of `main.js` L751,
note, kind chip, pictures, custom block); the building's place card gets an "about" section from K-R132 and the pack
credits. Hover shows one small in-canvas label (name only); hover never changes the selected room (selection state is
separate; fix the case where the card showed a different room than the selection). Remove the in-canvas `#card` in
shell mode. Check: one card element visible at any time; selected room = card title.

**T4 — One token set.** `estate/index.html` and `main.js` CSS use `tokens.css` (fonts `--font-ui` for titles instead of
the serif, radii, accent, glass classes); the page palette L34–35 becomes token aliases; `ui/room-gallery-panel.js` and
`ui/illustration-panel.js` dialogs use `.g2`, tokens and the z ladder of S7-2; the accent is the same in 2D and 3D
(`estate:theme` already passes the theme; add the pack accent). Check: computed `--accent`, `--font-ui`, `--r-glass` equal
in the viewer and the 3D frame.

**T5 — N9: estate legend cleanup and room kinds** (`docs/todo.md` N9; its own commit, FREEZE rule of S7-1 §3). The user's caution applies: delete only
after proving no other consumer — grep every reader of the kind `restricted`, of the strings 「不描述」 / "not described"
and of the legend tab, and list them in the RESULT with what replaced each.
- Known readers at `df3b5f6d` (re-grep `restricted`, `不描述`, `not described`, `legTab`, `legendEl`, `KIND_COL`, `KL`
  over `map/`, `tools/`, `blender/`, `tests/`): `map/estate/main.js` L39–45 (legend panel and tab), L105 (`KIND_COL`),
  L369 (plate colour), L381, L745 (`tx.restricted` room-card line), L831, L1127, L579–583 (`KL`, legend HTML);
  `map/tavern/picker.mjs` L33–39 (sub text); `map/unmapped-place-picker.mjs` L46; `map/app/place-resolver.mjs` L51
  (`restricted` flag); `map/estate/index.html` L159–160 (`#legend` CSS); `map/data/eden_estate_rooms.json` (4 rooms);
  `tools/check_maps.py` L250, L283; `tools/build_worldbook_addon.py` L113–115; `blender/estate2/floorplans.py` L8, L98,
  L131–154, L286–287, L391–396, L463, L481; `blender/estate2/house_web.py` L11, L31, L205–236, L902–903 (at `ed61a2f5`, after the render line's R-B1B2 change);
  `blender/estate2/plan2d.py` L145; `blender/estate2/layout.py` L576.
- (1) Remove the legend tab (`main.js` L39–45 tab list, L579–583); the colour key becomes a compact row of chips inside
  the section (storey) view only (shown while the view mode is section; glass-1, one chip per kind present on the shown
  storey), and the shared room card (T3) shows a colour chip before the room name.
- (2) Kind `restricted` goes: the four rooms of that kind (floors B2 and B1) become kind `card` in
  `blender/estate2/floorplans.py`, and `map/data/eden_estate_rooms.json` is regenerated by it (if the generator cannot
  run here, commit a script that applies exactly the generator's change, as S4-4b did); their notes then show like any
  room. Remove `tx.restricted`, the `KL.restricted` label, the 「不描述」 / "not described" sub texts of the two pickers and
  the `restricted` branches of `main.js`, `picker.mjs`, `unmapped-place-picker.mjs`, `place-resolver.mjs` (the flag goes;
  check its consumers first), `check_maps.py` and `build_worldbook_addon.py`. **Do not change the Blender builders'
  geometry rules** (`house_web.py` doors and furniture, `plan2d.py`, `layout.py`) in this step: they belong to the render
  line; if a builder's output would change on its next run because the kind changed, keep its behaviour with an explicit
  room list in the builder or stop and file a Q-item — never edit a committed model.
- (3) Add the missing `medical` colour (four B2 rooms fall back to `open` today).
- (4) Kind colours and labels become pack data: the eden 3D manifest (`map/estate/model/manifest.json`, schema
  `scene3d.schema.json`, K-R104) gains `room_kinds: { <kind>: { color, label: { zh, en } } }` (K-R131: validated with
  `recheck.hex` and plain text; unknown kind → a neutral engine grey; labels through `textContent`); `main.js` reads it
  through `Estate3D.normalize` and keeps no kind table.
- Checks: room count and every room note unchanged except the four kind values (a test diffs the regenerated JSON
  against the committed one: only those four `kind` fields differ); `tools/check_maps.py` and `check_pack.py` pass; the
  worldbook add-on rebuild (`tools/build_worldbook_addon.py`) — any change in its text is listed verbatim in the RESULT
  (it is model-facing); screenshots before / after of the section view (B1 and B2) and of one room card, desktop and
  phone, into `~/eden-map-review/overnight/s7/s7-3-n9/`; the S7-1 no-labels allow-list entries for 「不描述」 / "not
  described" are removed and the gate passes.
- (4) moves with T1 (K-R131); this task only switches the readers to it.

**T6 — N10 (1): rooms of kind `open`.** First hide the in-canvas labels of kind `open` (they read as a placeholder
「未定用途体量」); then give each of the 22 rooms a use and a note invented within the card's setting (read
`docs/card-digest.md` and `docs/eden-estate.md`; never contradict a card fact; no provenance wording; names are plain
room names) in `blender/estate2/floorplans.py` (new kind per room: `support`, `owner`, `card` or `medical`, never
`open`), regenerated JSON, worldbook add-on rebuilt (list its text changes verbatim). Furniture for these rooms is a
render-line item: file it as one line in the render ledger request list of the RESULT; do not touch builders. Own commit
with the FREEZE rule. Check: no room of kind `open` left, room count unchanged, no 「未定」 string anywhere (the S7-1
gate's allow-list entries for it are removed).

**T7 — Labels: occlusion and N10 (4).** In-canvas labels (rooms, floor tags, chips) are hidden (`display: none`) when
their anchor is behind building geometry: one raycast per label from the camera, throttled to 4 Hz and only while the
camera or the view mode changes; reduced motion does not change the rule. X-ray floor tags get a vertical
collision pass (a tag that overlaps the previous one shifts or hides). Check: no label box overlaps another in the X-ray
view at 1440 and 375; an occluded label (probe camera preset) has `display: none`.

**T8 — Presence chips (U-27, U-28).** The viewer sends `estate:people { items: [{ name, room, floor, color, avatar?,
dim? }] }` (new, viewer → subpage, registered) whenever the people tab's data, the location or the show prefs change:
people whose resolved node is a room node of this building (same `hereRes` / node result as the 2D people tab), minus
hidden ones (`prefs.show` false → empty list; `prefs.off`); `avatar` only `https:` or `data:image/` up to 64 KB, else
initials; `color` = `colorOf(name)` as in 2D. `main.js` draws them with the existing chip code restyled (U-27), fanned
out around the room centre, on the room's floor (shown in section and X-ray views, hidden in the exterior view);
routine people (`estate:routine`) are drawn only when not in the located list, with `dim` styling. Tap a chip →
`estate:person { name }` (new, subpage → viewer) → the shared character card. New probe `tools/browser/estate_presence.mjs`:
host stub places a character in a room of B1 through a chat tag; the estate view opens; within 5 s a chip with that name
is in the frame's DOM on floor B1, in the room's screen rect ± 40 px; switching 「在地图上显示人物」 off removes it; tapping
it opens the character card in the viewer.

**T9 — Watchdog scope.** Add `map/estate/main.js` and `map/estate/index.html` to the engine scope of
`tools/check_architecture.py` with baseline entries (lines, inline styles, z-index) recorded once and only shrinking;
card terms must be zero (T1 moved them out). `python3 tools/test_architecture_gate.py` passes.

**T10 — Docs.** `docs/ARCHITECTURE.md` (+ zh): the estate page in the module map with its role ("3D canvas in the main
shell"), the new messages in §4, `estate_presence` probe; `docs/todo.md`: N9, N10 (1, 2, 3, 4, 6), N11 struck with
shas; `docs/naming.md` glossary row **presence chip**.

**Gate R1** after commit 6 of §8 (`s7_shots` state 13 and 11, `estate_presence`, `webgl_single_ctx`, `estate3d` and
timings against the T0 medians) into `…/s7-3-r1/`; stop. **Fixes**; **gate R2** into `…/s7-3-r2/`; stop. Push after R2
passes.

#### 5. Constraints

- The user's caution for every deletion (N9): grep every reader first; list each removed item with its replacement.
- Room count and notes unchanged except the four N9 kinds and the 22 N10 (1) rooms (their kind, use and note).
- Blender builders and committed models untouched.
- New messages registered in `protocol.mjs`; new pack fields in the schema and validated (K-R64 re-check: colours by
  `recheck.hex`, text through `textContent`); no card terms in engine files; tokens only; no bare z-index; files touched
  in the engine scope ≤ 400 lines or not growing (the estate page shrinks).
- One live WebGL context (U-14) and no regression of `accept` / `estate3d` / `perf_v2` beyond 5 % of the T0 medians (I-29).
- Located people come from the same result as 2D; nothing new is stored.

#### 6. Tests to add

`tests/scene3d_building.test.mjs` (K-R131 / K-R132 validation, fallbacks), `tests/estate_rooms_n9.test.mjs` (regenerated
JSON vs committed: only the listed kind / use / note fields differ, room count equal), `tests/estate_people.test.mjs`
(the pure function that builds `estate:people` from people rows, node tree and prefs: located vs routine, hidden people,
avatar filter), protocol tests for `estate:view`, `estate:people`, `estate:person`, `estate:select.room`. Count =
baseline + new.

#### 7. Verify

```bash
node --test tests/*.test.mjs
bash tools/smoke.sh
python3 tools/check_architecture.py && python3 tools/test_architecture_gate.py && python3 tools/check_arch_doc.py
python3 tools/check_maps.py && python3 tools/check_pack.py && python3 tools/check_no_labels.py
node tools/browser/estate_presence.mjs; node tools/browser/estate3d.mjs; node tools/browser/webgl_single_ctx.mjs
node tools/browser/topo_dairy.mjs; node tools/browser/room_gallery_ui.mjs; node tools/browser/chars092.mjs
node tools/browser/s7_shots.mjs ~/eden-map-review/overnight/s7/s7-3-r2 --only 11,13
```
Expected: new probe passes; others as on the base (known failures count as KNOWN); before / after screenshots (1440 +
375, dark + light) of world, upper, estate exterior, estate B1 with presence in `~/eden-map-review/overnight/s7/`.

#### 8. Commits & push

1. `feat(3d): building and room kinds as pack data (K-R131, K-R132)` (T1).
2. `feat(3d): estate view inside the main shell; view segment and floors in the viewer` (T2).
3. `feat(3d): one card system for rooms and the building; hover label only` (T3).
4. `style(3d): one token set for the 3D page and the picture dialogs` (T4).
5. `chore: freeze maps` / `feat(estate): legend chips, kind restricted removed, medical colour (N9)` / `chore: unfreeze`
   (T5).
6. `chore: freeze maps` / `feat(estate): uses for the open rooms (N10 1)` / `chore: unfreeze` (T6).
7. `feat(3d): occluded labels hidden; X-ray floor tags (N10 4)` (T7).
8. `feat(3d): presence chips from the located people; estate_presence probe` (T8).
9. `chore(arch): estate page in the watchdog scope` (T9).
10. `docs: one shell in the module map, todo, glossary; RESULT S7-3` (T10, RESULT) — push after R2.

Each commit reverts alone in reverse order of dependence (2 needs 1; 3 needs 2; 8 needs 2). Commit identity, `-F`,
no Co-Authored-By trailer; push `bash tools/push_preview.sh --head --no-escalate`; CI as in S7-1.

#### 9. Stop and report instead of guessing when

- a reader of `restricted`, the removed strings or the legend tab cannot be accounted for; a room count or note changes
  beyond T5 / T6; a Blender builder's output would change;
- the presence probe cannot place a character because the room node is not resolved from the chat tag (report the
  locate result; do not special-case the probe);
- a second WebGL context appears, or timings regress beyond 5 % after two attempts;
- each review gate (R0, R1, R2): stop with `status: PARTIAL` and the `review:` block;
- push rejected; CI fails twice; the test count drops without a named replacement.

#### 10. Report

RESULT block with extra lines `n9: removed <item> -> <replacement>` (one per line), `n10: <item> <check result>` (items
1, 2, 3, 4, 6), `rooms: <n> unchanged; kinds changed: <list>`, `worldbook add-on: <unchanged | diff>`, `presence:
<probe result>`, `review: R0 … · R1 … · R2 pass`, `perf: <before → after>`. Cleanup: probe servers stopped, no
`.claude/launch.json` entries.
