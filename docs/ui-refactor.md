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
> one line (§1.3). **R0 revision (2026-10-01):** six persona reviews (phone newcomer, Mac power user, pack author,
> accessibility, visual designer, performance) were answered finding by finding (§10); the changed decisions are marked
> in §0 and the appendix specs carry the new tasks, checks and budgets.

## 0. Review sheet (U-01 … U-33)

One row per real decision. "Working decision" = the recommendation, applied by default on 2026-10-01 (autopilot). The
same list is in `docs/todo.md` §3, one line per item. **Revised after persona review R0 (2026-10-01):** rows changed by R0
carry an "R0:" note and their source findings (P1-1 … P6-11, numbered as in the review reports); U-31 … U-33 are new;
every finding and proposal is answered in §10.

| id | Question | Options | Consequences | Recommendation (working decision) |
|---|---|---|---|---|
| U-01 | What does "Dark Frost Glass" mean on each surface? | A: two strengths: **glass-1** (translucent, blur 14 px) for floating controls over the map (top bar, clock capsule, toolbar, level strip, layer popover), **glass-2** (near-opaque, blur 20 px) for reading surfaces (drawer, settings, notices, cards); both fall back to an opaque surface. B: one strength everywhere. C: opaque surfaces, glass only on the toolbar. | A: the map stays visible behind controls while long text stays at ≥ 4.5:1 contrast; one rule per surface class. B: either controls hide the map or panels become hard to read. C: no visual unification (the plan's goal). | **A′** (R0: was A) — glass-1 = 80 % in both themes (contrast floor: dark ≥ 80 %, light ≥ 76 %; `contrast_v2` is authoritative and may only raise it), blur 12 px, no `saturate()`, no inner highlight; glass-2 = the opaque `--surface`, no blur; on glass-1 no `--muted` text and no text under 13 px; two-layer focus ring; blur budget ≤ 4 blurred elements, ≤ 12 % of the viewport, 0 on coarse pointers, 0 while a 3D view is open (§2.2). Source P4-1, P5-2, P6-2, P6-8. Decided by default 2026-10-01 (autopilot); user may override. |
| U-02 | What drives the day / night glass variant? | A: the UI theme only (auto / light / dark, as today). B: the in-world clock (night bands → dark glass). C: A, plus a switch "glass follows world time" in 地图与图层 (`edenMapGlassClock`, default off) that, with theme auto, picks light glass for day / dawn bands and dark glass for dusk / night. | A: predictable; the world's night shows only in the map tint. B: a light-theme user suddenly gets dark chrome. C: A's predictability with the immersive option for those who want it; a new toggle, default off (brief rule 6). | **C** (R0: kept, with additions) — ignored under `prefers-contrast: more`; its settings line says it overrides the system light / dark choice; `html.light` is toggled only when the band changes (idempotent); it changes the chrome only, never the base map (§2.3). The R0 proposal to make theme auto follow world time by default is rejected (brief rule 6: new behaviour defaults off). Source P4-14, P5-4, P6-10. Decided by default 2026-10-01 (autopilot); user may override. |
| U-03 | How is the z-index ladder merged into `map/ui/tokens.css`? | A: value-preserving: the `--zu-*` / `--zv-*` block moves from `viewer.html` L195–204 into `tokens.css`; every bare value gets a named token with the **same** value (local `--zl-*`, host `--zh-*`, new `--zu-*` names); the only value change fixes `.rgp`, whose fallback resolves to 13 and sits under the dialogs (→ `--zu-panel`, 61, the value `.ilp` uses). B: renumber the whole ladder into wide bands. | A: zero visual change, the arch ledger's `zindex` entries drop to 0, one known bug fixed. B: every overlay must be re-checked by eye; risk with no user benefit. | **A** |
| U-04 | Where do glass colours come from? | A: derived from the theme tokens and the pack's per-view theme (`--surface`, `--ink`, `--accent` via `color-mix`), so every pack and both themes get matching glass. B: a fixed neutral glass palette; the accent only marks state. | A: the town and eden keep their own character; one formula. B: packs look alike; the per-view theme (K-R70) loses meaning on chrome. | **B′** (R0: was A) — one chrome token set for every pack and view, changing only with light / dark (`--surface`, `--accent`, glass); a pack may set one pack-wide chrome accent (`ui.theme.chrome`, contrast-checked by `check_pack`); per-view themes (K-R70) feed only map-space tokens `--map-*` (pins, routes, tint, selection ring, map labels); `--glow-text` leaves the chrome. Makes N11 (4) true; S7-2 T1 amends K-R70 to split chrome and map fields. Source P5-1, P3-7. Decided by default 2026-10-01 (autopilot); user may override. |
| U-05 | Settings structure (N4). | A: eight groups 常用 / 地图与图层 / 人物与物品 / AI 联动 / 数据与映射 / 更新与版本 / 高级 / 版权申明; 常用 is the first block of the home page (no sub-page); page ids kept, `display` → `map` with an alias. B: 常用 as its own page. | A: the most used controls need zero taps; probes and `SettingsApi.open` keep working. B: one more tap for the common case. | **A** (R0: phone order) — desktop unchanged; on ≤ 640 px the home page is quick actions (one row) → group list → 常用; the layer list lives only on 地图与图层 (home shows one row `图层（n 开）›`); pages and feature cards are built on first open; search uses a static index and expands and scrolls to the hit. Source P1-4, P2-4, P6-3. Decided by default 2026-10-01 (autopilot); user may override. |
| U-06 | Does the always-on situation digest get a master switch? | A: no: its card is read-only transparency (what was sent, tokens, health) with the existing inventory-line switch. B: a new "turn the digest off" switch. | A: the map's core model link cannot be switched off by accident; today's behaviour. B: a new failure mode ("the map stopped working") for little gain. | **A** |
| U-07 | How are the status line's per-field toggles stored? | A: one key `edenMapStateOmit` = JSON list of omitted fields, empty by default (= today's line). B: four keys, default on. | A: complies with "new toggles default off" (each toggle is "omit field X") and keeps the injected text byte-identical by default. B: four defaults that are on. | **A** (R0: three states shown) — each field shows sent / omitted (user) / provided by the card (auto-skipped: grey tag; the switch stays usable); the host reports the per-field state in the status-line health row. Source P2-2. Decided by default 2026-10-01 (autopilot); user may override. |
| U-08 | Where is feature health computed? | A: a pure host module (`tavern/feature-health.mjs`) from facts the host already has; sent in `eden-map:th-state` as `health`. B: the viewer guesses from prefs. | A: the truth sits where the features run; no extra API calls. B: "on" would read as "working". | **A** (R0: payload trimmed) — the full `health` rides on `th-state` only while the AI 联动 page is open (viewer `op: 'watch'`), throttled ≥ 1 s; otherwise only `healthSum: { n, m }`. Source P6-3. Decided by default 2026-10-01 (autopilot); user may override. |
| U-09 | AI 参谋 first-time consent (N7). | A: inline consent block in the card: the switch is replaced by the consent text and one "同意并开启" button until consent; the host never asks (no `window.confirm`), it skips silently and reports `no-consent`; stored consent of existing users stays valid. B: an inline banner after the first switch-on. | A: no blocking dialog anywhere (brief rule 6); consent is read before cost starts. B: the switch looks on but does nothing until a second action. | **A** (R0: order changed) — the consent block shows the endpoint form and the test first; 「同意并开启」 is enabled only after a passing test of the current form values (disabled with its reason before) and saves config, consent and switch together; consent text, health reasons and cost lines cannot be overridden by packs (§2.7). Stored consent stays valid. Source P1-2, P3-8. Decided by default 2026-10-01 (autopilot); user may override. |
| U-10 | Does the rename reach the model-facing system prompt ("你是地图领航员")? | A: no: only user-facing texts are renamed; the system prompt keeps its role line and gains one line for `OP_ROUTE`. B: rename there too. | A: model-facing text changes only where a new op needs it. B: a cosmetic change in text the user never sees. | **A** |
| U-11 | AI 参谋 endpoint check. | A: an explicit "test connection" button: one tiny request (`maxTokens` 8, 15 s timeout) with the saved config, result inline; the button says it costs a few tokens. B: validate the config shape only. | A: the user learns about a bad key now, not after a silent failed round. B: free but blind. | **A** (R0: tests the form) — `nav-test` carries the form's current values (used once in host memory, never stored, key never echoed); the save button stays secondary until a test passes. Source P2-1. Decided by default 2026-10-01 (autopilot); user may override. |
| U-12 | A suggested route (`OP_ROUTE`) when the pack has no transit network or the router cannot place it. | A: draw nothing (S8-4 `routeOp` returns null without a network); the op's `why` still shows in the AI 参谋 toast. B: draw a dashed straight hint between the two places when both are on the open map. | A: matches the S8-4 contract (T-15, K-R113: suggestions are planned and drawn by `route-plan` only); nothing pretends to be a path. B: needs a second drawing path outside S8-4's layer. | **A** (changed from B after S8-4-design landed, `docs/transit-schema.md` T-15) |
| U-13 | 3D mouse wheel (I-06): pan or zoom? | A: keep wheel = pan (Ctrl = zoom, Alt = rotate); new switch "wheel zooms" (`edenMap3dWheelZoom`, default off). B: wheel zooms by default. | A: no change for current users, rule 6 default off; the option is there for mouse users. B: muscle memory of every current user breaks. | **A** |
| U-14 | I-05 "one persistent WebGL context across 3D navigations". | A: keep one iframe per 3D view but guarantee at most one live context: the legacy estate page creates its renderer through `three/render-context.mjs` (`createRenderer`, dispose + `forceContextLoss` on `pagehide`), the host releases a parked frame before opening another; probe `webgl_single_ctx` covers both pages. B: one persistent 3D iframe that swaps scenes (a scene router inside it). | A: S-sized, removes the context leak that matters (the estate page never disposes); I-05's shared-context part closes as A. B: L-sized refactor of both 3D pages; only worth it if the reload study I-29 shows context creation dominates. | **A** (R0: lifecycle spelled out) — re-entering the same parked 3D page reuses it; opening a different 3D page first sends `estate:dispose` to the parked frame and waits for `estate:disposed` (≤ 500 ms, then removes the frame anyway); `pagehide` is not relied on; probe loop estate → props → estate × 5: 0 `webglcontextlost`, heap growth ≤ 10 %; `estate3d` also times the second entry. Source P2-6, P6-9. Decided by default 2026-10-01 (autopilot); user may override. |
| U-15 | How does the layer menu show inapplicable layers (L-06)? | A: grey in place. B: move them into a collapsed group. C: grey them, keep their switch usable (it stores the preference for where the layer applies), sort them after the applicable rows under a thin divider "此处不适用", each with a one-line reason generated from `applies`; rows inapplicable only because they have no data stay hidden as today. | A: noisy when many rows grey. B: the user cannot see why a row vanished. C: the menu stays short and honest; no row ever disappears for a reason the user could act on. | **C** (R0: semantics and feedback) — greyed rows are not `aria-disabled`: they sit in a `role=group` labelled by the divider, the reason is the switch's `aria-describedby`, the grey is a measured colour (no opacity, text ≥ 4.5:1); toggling a greyed switch announces 「已记住：到 <where> 时生效」 for 2 s in the shared live region; the pack's `menu.when` text wins, generated reasons use i18n words only (no ids, paths or ASCII kinds). Source P1-6, P3-6, P4-3. Decided by default 2026-10-01 (autopilot); user may override. |
| U-16 | When does layer animation stop? | A: when the layer is invisible, inapplicable, the document is hidden, or reduced motion is on (one static frame); every animated layer goes through the existing `visibility.mjs` guard and the registry. B: only when inapplicable. | A: closes the two gaps found (`wander.mjs` rAF + interval, `clouds.mjs` WAAPI only on `visibilitychange`). B: leaves battery drain on hidden tabs. | **A** (R0: wider) — also paused while the map panel is hidden or out of view (host message `eden-map:visible { on }`) and for the whole 2D map while a 3D view covers it; reduced motion reaches the 3D frame (`rm`: no idle rotation, camera jumps, no chip animation); the 3D page renders on demand (rAF 0 when idle). Source P6-1, P6-7, P4-8. Decided by default 2026-10-01 (autopilot); user may override. |
| U-17 | Where is the clock capsule? | A: stays in the host bar (`.em-bar .em-clock`, the only place with the clock), restyled as a glass-1 capsule; on ≤ 640 px it shows the time only and expands to date · period on tap. B: move it into the viewer header. | A: one source of truth, no new message; the viewer header keeps its room for the title (U22). B: duplicates the host's clock path. | **A** (R0: details) — tap toggles date · period (no 4 s timer); 44 px hit area; numerals in `--font-ui` with `tabular-nums` (no webfont); on ≤ 640 px the clock collapses to its icon first (U-33). Source P1-13, P4-7, P5-6, P6-14. Decided by default 2026-10-01 (autopilot); user may override. |
| U-18 | Toolbar (control column) composition. | A: one glass-1 column on the right (desktop) / one bottom row above the drawer (phone): zoom in / out, home, all-area, labels, ⋯; the level strip stays a separate glass-1 block above it. B: merge the level strip into the column. | A: today's structure, unified look; the level strip keeps its own scroll. B: a very tall column on deep pack trees. | **A** (R0: phone row trimmed) — the phone row keeps + / − / 定位到我 / ⋯; 看全区 and Aa move into ⋯; the home button becomes 「定位到我」 (centres on the player's place); ⋯ gets an accessible name and a first-run mention; the level strip becomes opaque glass-2; at 375 × 812 the HUD covers ≤ 18 % of the map. Source P1-1, P1-11, P5-7, P4-11. Decided by default 2026-10-01 (autopilot); user may override. |
| U-19 | Phone top bar title truncation (U22). | A: on ≤ 640 px the viewer header shows only the current map's name (crumbs collapsed to a back button, as today) with `min-width: 38%`; the host bar is capped at 45 % instead of 62 % and its place field yields first. B: a two-line header. | A: the title stops truncating at "Ed…" without growing the header. B: costs 44 px of map on every screen. | **A′** (R0: was A) — in the host bar the clock yields first (icon only) and the place field keeps ≥ 50 % of the bar; the viewer title keeps `min-width: 38%`; slots per U-33. Source P1-1. Decided by default 2026-10-01 (autopilot); user may override. |
| U-20 | E-12: the edit bar over the drawer on a phone. | A: when the drawer is above peek on ≤ 640 px, the edit bar collapses into one "编辑 ⋯" button in the header that opens its actions as a menu; it returns when the drawer goes back to peek. B: dock the bar above the drawer edge. | A: the drawer and the bar never overlap. B: the bar still takes 44 px of a short screen. | **A** |
| U-21 | U21: markers and labels overlap on the phone world map. | A: extend the existing `declutter()` (`app/sharpness-tiers.mjs` L199–230) with a priority order (current place > event > named landmark > minor) and run it on every zoom end at ≤ 640 px; a hidden label shows on tap. B: leave as is. | A: dense areas stay readable; nothing is lost (tap reveals). B: the reported bug stays. | **A′** (R0: was A) — runs at every width on zoom end and view switch only (never while panning), with label boxes in model coordinates (estimated or cached widths, grid buckets, batched reads and writes); 200 labels ≤ 3 ms (≤ 8 ms at 4× CPU throttle); labels follow the three tiers of §2.6; the player marker and the current place are never hidden; the level strip is an obstacle (N10 (9)). Source P5-3, P6-5, P1-1. Decided by default 2026-10-01 (autopilot); user may override. |
| U-22 | U23: the update banner is too tall on a phone. | A: a compact P1 banner on ≤ 640 px: one line (title + primary action), the rest behind "详情"; max height 30 % of the frame. B: unchanged. | A: the chat stays usable while the banner is up. B: the reported bug stays. | **A** |
| U-23 | The 3D idle auto-rotate writes the stored preference (`edenMap3dAutoRotate` becomes 1 after the first 30 s idle, `camera-controls.js` `makeIdleTimer` L86). | A: fix: idle rotation is a runtime state and never writes the key; only the settings switch writes it. B: keep. | A: the setting means what it says; I-06's switch works. B: the switch would be overwritten behind the user's back. | **A** |
| U-24 | Avatar ring colours in the people tab and roster (N10 item 17: purple / teal / green / red look meaningful but are a hash of the name, `characters-view.mjs` L32 `colorOf`). | A: keep the per-person colour (it matches the person's pin on the map) and say so in one muted line under the people tab's first group (`头像圈颜色只用来区分人物，和地图上的图钉同色`); B: drop the colour coding, one neutral ring everywhere; C: keep without explanation. | A: keeps the map ↔ list match that helps on crowded maps, removes the false meaning. B: loses that match. C: the reported confusion stays. | **A′** (R0: was A) — the before shots show one pin colour, so the premise is checked first: if people are drawn on the map, rings and their map avatars share one fixed colour-vision-safe person palette (8 colours, following `edenMapCvd`, accent hue ± 20° excluded) and carry initials, with the one explanatory line; otherwise B (one neutral ring). Source P4-5, P5-12. Decided by default 2026-10-01 (autopilot); user may override. |
| U-25 | N11 one shell: is the estate 3D page kept in its iframe or merged into the viewer page? | A: keep the iframe as a chrome-less 3D canvas: its own top segment, drawer, tabs and card go; the viewer's top bar, level strip, toolbar, drawer and shared cards serve 3D through messages; the iframe links `tokens.css` and draws only in-canvas labels and tokens. B: merge `estate/main.js` into the viewer document as a module. | A: keeps WebGL lifetime isolation (U-14), the existing `estate:*` protocol and the parking logic; one look because every control is the viewer's. B: one document, but a 1203-line page and its import map move into the viewer; high regression risk on every 2D path. | **A** (R0: focus and Esc) — Tab order host bar → viewer header → layers → level strip → toolbar → drawer; the 3D iframe has `tabindex=-1` (keyboard goes through the viewer and the room list, U-30); Esc inside the iframe posts up and the viewer closes its top layer; the canvas is `role=img` with `aria-label` `<building>, <floor>, <n> people`. Source P4-2, P4-10. Decided by default 2026-10-01 (autopilot); user may override. |
| U-26 | Where do the 3D view controls go (外观 / 内透 / 剖切, floors)? | A: into the viewer: floors are the level strip's entries while the 3D view is open (`estate:floor` both ways), the three view modes a glass-1 segmented control at the top of the toolbar column (new `estate:view`); B: a restyled control row inside the iframe. | A: the same place for "which level" in 2D and 3D; no second control system. B: two systems that look alike. | **A′** (R0: was A) — floors stay in the level strip; the view segment 外观 / 内透 / 剖切 moves to the right side of the viewer header (3D only) above 640 px; at ≤ 640 px it is one 44 px button in the toolbar row opening a three-item radio menu; keys 1 / 2 / 3 when single-key shortcuts are on. Source P1-3, P2-7, P2-8. Decided by default 2026-10-01 (autopilot); user may override. |
| U-27 | Presence token style in 3D (N11 (2)). | A: reuse the page's CSS2D chips (`main.js` L486–511) restyled with tokens: a 24 px avatar disc (portrait or initial) with the person's ring colour (U-24), name pill on hover / selection, several people in one room fanned out around the room centre; tap opens the shared character card. B: 3D billboard sprites. C: dots on the floor plan. | A: DOM chips are tappable, themable and already wired to the room geometry; same look as the 2D avatars. B: needs a texture pipeline and a hit test. C: loses who is who. | **A′** (R0: was A) — chips 32 px visible, 44 px hit area, never overlapping; more than 3 people in one room fold into a `+n` chip that opens a list; chips are `<button>` with `aria-label` `<name>, <room>`; ≤ 30 chips; the fan is recomputed only when the people list changes; `estate:people` is sent only when its content changes. Source P1-8, P4-7, P6-7. Decided by default 2026-10-01 (autopilot); user may override. |
| U-28 | Source of presence in 3D. | A: the 2D locate result (people whose resolved node is a room of this building, `estate:people` from the viewer) wins; the routine schedule (today's only source, `estate:routine`) moves only people without a located room, drawn dimmed as the 2D wander layer does; respects 「在地图上显示人物」 and per-person switches. B: located people only. | A: the chat log stays the truth and 3D equals 2D; the ambient life of the schedule stays where nothing is known. B: empty buildings most of the time. | **A** (R0: cue added) — dimmed people show 「按日程」 / “by schedule” on hover or long press and the person card gets one neutral line saying where the position comes from (no provenance wording). Source P1-9. Decided by default 2026-10-01 (autopilot); user may override. |
| U-29 | Where the building's title, motto, floor labels, room kinds and colours live (N11 (5), N9 (4)). | A: in the pack's 3D manifest (`model/manifest.json`, read by `Estate3D.normalize`): `building: { title, motto, floors: [{ id, label }] }` (K-R132) and `room_kinds` (K-R131), both with `i18n`; the engine keeps neutral fallbacks only. B: in the overlay's `ui` block. | A: the 3D page already loads that manifest; any pack shipping floor plans gets an interior viewer by data. B: the 3D page would need a second fetch of pack data it does not load today. | **A′** (R0: was A) — floor labels extend the existing K-R104 `floors[]` items (`label`, `i18n`), no second list; `building = { title, subtitle?, i18n }` (`motto` → `subtitle`); `room_kinds: { <kind>: { color, label, i18n?: { <lang>: { label } } } }`; undeclared kinds get a generated colour-vision-safe colour and their id as label; a generic `rooms.schema.json` links rooms to nodes by `node` id (name as fallback), proven by a minimal fixture pack and probe `estate_generic`. Source P3-2, P3-3, P3-4, P3-5. Decided by default 2026-10-01 (autopilot); user may override. |
| U-30 | Where the 3D-only tabs 房间 / 关于 go (N11 (1)). | A: sections of the shared place card: a room is opened as a place card with a room section (floor, area, note, kind chip, pictures, custom); 关于 becomes the building's place-card section (title, motto, credits from pack data); B: one extra drawer tab "3D" in 3D only. | A: one card system (N11 (3)); nothing 3D-only in the rail. B: the rail changes between viewers again. | **A** (R0: keyboard path) — plus a room list grouped by floor in the building's place card (buttons opening room cards) and, while a 3D view is open, the drawer's 地点 tab lists the building's rooms; the about section reads only `building` and `credits`; probe `estate_kbd` walks it keyboard-only. Source P4-2, P3-11. Decided by default 2026-10-01 (autopilot); user may override. |
| U-31 | How does the user get into 3D, and straight to one room? (new in R0) | A: a primary action 「3D 查看」 / “View in 3D” on every place card that has a 3D page: a building card opens the exterior; a room card opens the room's floor in section view and selects the room (`estate:select` viewer → frame); the level strip shows the same action when the current place has 3D. B: only today's marker click. | A: a visible, keyboard-reachable entry that lands on the room. B: the 3D entry stays undiscoverable (P1-3). | **A** — R0 new. Source P1-3. Decided by default 2026-10-01 (autopilot); user may override. |
| U-32 | How does a feature card show “on, nothing to report yet”? (new in R0) | A: health state `idle` drawn with a neutral clock icon and the text 「等待下一次回复」, also used right after a switch change (replaces a separate “applies on the next reply” state); the home summary counts only `not-effective` as 未生效. B: amber as today. | A: a fresh chat is not all amber. B: newcomers read amber as broken. | **A** — R0 new. Source P1-7, P2-5. Decided by default 2026-10-01 (autopilot); user may override. |
| U-33 | Host bar and viewer header (new in R0). | A: one visual bar with fixed slot ownership (§3.2 wireframe): the viewer owns back + title, 图层, 设置 and (3D) the view segment; the host owns the clock capsule, the place field (tap = 定位到我), the one status dot and close; the 「已加载」 text goes (dot + `aria-label`); 375 px folding: clock → icon, place ≥ 50 % of the host bar, then the title ellipsis. B: two bars restyled alike. | A: no duplicated status or place controls; one truncation rule. B: two of everything, truncated independently (P5-5). | **A** — R0 new. Source P5-5, P1-1. Decided by default 2026-10-01 (autopilot); user may override. |

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
L-06 → U-15, U-16, S7-2 T4; I-29 → not in S7 (must not regress, §8.1); N11 → S7-3 (U-25 … U-30). R0 adds U-31 … U-33
(3D entry, idle health, one top bar); the N10 (14) check joins the map-label probe of §2.6.

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
   are opaque. Themes change the chrome only and never filter, tint or lighten the base map; darkening or lightening
   the map is the period tint's job (K-R39) alone (R0: P5-4).
2. **One formula, many skins.** Components reference semantic tokens only; packs and themes change token values, not
   component CSS (today's rule in `tokens.css` L3, kept). **One chrome** (U-04 B′): the chrome token set is the same in
   every pack view and in 2D and 3D; pack and per-view character lives in the map-space tokens `--map-*`.
3. **Calm by default.** Motion is short (≤ `--dur-3`), purposeful, and stops for reduced motion, hidden documents and a
   hidden map panel; no glow or neon effects on chrome text.
4. **Every state visible.** On / off / not applicable / not effective / idle each have a distinct, non-colour-only cue
   (shape, icon or text).

### 2.2 Colour and glass tokens (Dark Frost Glass)

New tokens in `map/ui/tokens.css`. R0 (U-01 A′, U-04 B′): glass derives from the **chrome** tokens only, which do not
change per view; glass-2 is opaque. Dark values (default):

```css
:root, body {
  --glass-1: color-mix(in srgb, var(--surface) 80%, transparent);   /* floating controls; floor 80 % dark */
  --glass-2: var(--surface);                                        /* reading surfaces: opaque, no blur */
  --glass-line: color-mix(in srgb, var(--ink) 12%, transparent);
  --glass-blur-1: 12px;                                             /* no saturate() */
  --focus-ring: 0 0 0 2px var(--focus), 0 0 0 4px var(--bg);        /* two layers, >= 3:1 on any backdrop */
}
.light { /* only values change */
  --glass-1: color-mix(in srgb, var(--surface) 80%, transparent);   /* floor 76 % light; the probe decides */
  --glass-line: color-mix(in srgb, var(--ink) 14%, transparent);
}
```

Classes in `tokens.css`:

```css
.g1 { background: var(--glass-1); border: 1px solid var(--glass-line); box-shadow: var(--elev-float);
      backdrop-filter: blur(var(--glass-blur-1)); -webkit-backdrop-filter: blur(var(--glass-blur-1)); }
.g2 { background: var(--glass-2); border: 1px solid var(--glass-line); box-shadow: var(--elev-panel); }
html.lowmem .g1, html.noblur .g1, html.view3d .g1 { backdrop-filter: none; background: var(--surface); }
@media (pointer: coarse) { .g1 { backdrop-filter: none; background: var(--surface); } }
@media (prefers-reduced-transparency: reduce) { .g1 { backdrop-filter: none; background: var(--surface); } }
```

- **Text on glass-1:** ≥ 13 px and ≥ 600 weight, `--ink` or `--ink-2` only; never `--muted`, never 11–12 px (counts,
  badges and subtitles go to glass-2 surfaces). This is a legibility rule, not a WCAG exemption: every pair is measured
  against 4.5:1 (P4-1).
- **Focus:** every control uses `box-shadow: var(--focus-ring)` (or `outline` 2 px plus the 4 px `--bg` halo) so the ring
  stays ≥ 3:1 over any map.
- **Blur budget** (P6-2): at most 4 elements with an active `backdrop-filter` at once across the viewer and the host
  page, together ≤ 12 % of the viewport (1440 × 900); 0 on coarse pointers; 0 while a 3D view is open (`html.view3d`,
  P6-8). The intended blurred set is the host bar, the viewer header, the zoom column and ⓘ; the level strip, popover,
  drawer, settings, notices and cards are glass-2 (opaque). The probe `s7_hit` sums the visible elements whose computed
  `backdropFilter` is not `none` and their area.
- `--surface-glass` (today 92 %) becomes an alias of `--glass-2` for one release; its users move to the classes.
- `html.lowmem` also turns on when `navigator.hardwareConcurrency ≤ 4` or `navigator.deviceMemory ≤ 4` (P6-11).

**Map-space tokens** (U-04 B′, new): `--map-accent`, `--map-tint`, `--map-pin`, `--map-route`, `--map-select`,
`--map-label-ink`, `--map-label-bg`, `--map-label-halo`. The pack's per-view theme (K-R70, `<style id="packTheme">`)
writes only these; chrome components never read them. A pack may set one pack-wide chrome accent (`ui.theme.chrome:
{ accent, onAccent? }`); `onAccent` is computed by the engine when absent (the better of `--bg` / `#fff` by contrast).

### 2.3 Day / night variants

- Glass follows the UI theme (`html.light` set by `viewer.html` L36–55, `edenMapTheme` auto / light / dark) — U-02 A.
- Option `edenMapGlassClock` (U-02 C, default off; registered key, viewer only): with theme auto and the option on,
  `app/theme.mjs` sets `html.light` from the last clock message: bands `day`, `dawn` → light; `dusk`, `night` → dark
  (band words from the pack's period bands, K-R39; unknown band → keep the system theme). R0: the class is toggled only
  when the band actually changes (no restyle on every clock message, P6-10); the option is ignored under
  `prefers-contrast: more`; its settings line says it overrides the system light / dark choice (P4-14). The host bar
  follows through the existing theme message (`eden-map.js` `hostTheme`, L65–70, L239).
- The theme never touches the base map (§2.1): the rule that lays a light wash over the night base map in `.light`
  (`1440-light-01/02`, `375-light-03`) is removed in S7-2 T3; the probe compares base-map pixels between themes.
- The pack's per-view theme keeps working through the map-space tokens only (§2.2).
- 3D pages: `viewer3d.html` links `tokens.css` and gets the classes; the legacy estate page (`estate/index.html` L34–35,
  own `--panel`) maps `--panel` to `--glass-2` and `data-theme` to `.light` (S7-2 T3); the chrome accent is the same in
  2D and 3D (N11 (4)).
- Review matrix (P5-8): the S7-2 R0 mockup shows {dark, light} × {dawn, day, dusk, night} on `tc_upper` and `tc_mid`.

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
class; text on glass-1 per §2.2.

R0 additions (P5-6, P5-9, P5-10, P6-14):

- **Elevation:** `--elev-float: var(--sh-1)` (controls sitting on the map), `--elev-panel: var(--sh-2)` (drawer,
  popover, settings), `--elev-modal: var(--sh-3)` (P0 notices, dialogs). No inner highlight on glass-1.
- **Padding and edges:** `--pad-glass: 8px` (inside glass blocks), `--edge: 12px` (overlay to viewport edge; 8 px at
  ≤ 640 px). ⓘ, dock and drawer rail all use `--edge`.
- **Radius nesting:** inner radius = outer radius − padding (dock 14 px, its buttons 10 px; never a larger radius
  inside a smaller one).
- **Numerals and fonts:** clock and counters use `--font-ui` with `font-variant-numeric: tabular-nums`; no webfont is
  loaded for chrome; `--font-serif` is not used by any chrome element from S7-2 on (3D titles included).
- **Accent use:** the chrome accent marks only (1) the current selection, (2) the one primary button of a surface,
  (3) switch-on tracks; never large fills. **Selection grammar:** selected = accent bar on the leading edge + bold
  (level strip, drawer tabs, settings group, segmented controls), not a filled accent pill.
- **Icons:** 1.5 px line, 20 px view box, 24 px container, round caps; text buttons and icon buttons are not mixed in
  one control group.

### 2.6 Map labels

The map's own type hierarchy (R0: P5-3, with U-21 A′ and N10 (14)). Labels and pins read the map-space tokens.

| Tier | What | Style | Pin | Shows from | Max on screen (1440 px / 375 px) |
|---|---|---|---|---|---|
| L1 | major places (marker `pri` ≥ the pack threshold, or `x-major`; fallback top 8 by `pri`), the current place | 13 px / 600, `--map-label-ink` on a `--map-label-bg` pill | 28 px | the view's default zoom | 12 / 6 |
| L2 | ordinary places | 12 px / 500, 2 px `--map-label-halo`, no pill | 22 px | default zoom + 1 step | 30 / 15 |
| L3 | rooms, minor places | 11 px / 500 halo | dot or none | close zoom only | 30 / 15 |

- Events are drawn by **shape** per type (not by colour alone); people avatars per U-24.
- The player marker ("you are here") and the current place's label are never hidden by declutter.
- Declutter (U-21 A′): all widths; zoom end and view switch only; boxes in model coordinates; priority current place >
  event > L1 > L2 > L3; the level strip and other HUD rects are obstacles; a hidden label shows on tap. Budget 200
  labels ≤ 3 ms (≤ 8 ms at 4× CPU throttle).
- Check (one probe for both): on `tc_upper` and `tc_mid` default views ≥ 5 L1 names visible and zero overlapping label
  boxes, at 1440 and 375.

### 2.7 Pack-author surface

Everything an S7 surface reads from a pack, in one place (R0: P3-1, P3-12). `tools/check_pack.py --surface` prints this
table for a pack (S7-3 T1); a node test compares its rows with this section.

| Visible element | Pack field | Schema | Checked by | Engine fallback |
|---|---|---|---|---|
| chrome accent | `ui.theme.chrome.accent`, `onAccent?` | overlay schema (K-R70 amended) | `check_pack` contrast (below) | engine accent; `onAccent` computed |
| map pins, routes, tint, labels | `ui.theme.views.<view>` → `--map-*` | overlay schema (K-R70 amended) | `check_pack` contrast | kernel map tokens |
| layer menu reason | `layers[].menu.when`, `menu.i18n.<lang>.when` | layers schema (K-R83) | `check_pack` plain text | generated from `applies` with i18n words (§3.3) |
| layer one-line description | `layers[].menu.title` | layers schema | plain text | none shown |
| person ring colour | none (engine palette, U-24 A′) | — | — | — |
| building title, subtitle | 3D manifest `building { title, subtitle?, i18n }` (K-R132) | `scene3d.schema.json` | schema + `textContent` | "Building", no subtitle |
| floor labels | 3D manifest `floors[] { id, label?, i18n? }` (K-R104 + K-R132) | `scene3d.schema.json` | schema | floor id |
| room kinds | `room_kinds { <kind>: { color, label, i18n? } }` (K-R131) | `scene3d.schema.json` | `recheck.hex`, plain text | generated categorical colour, kind id as label |
| rooms | `rooms.json` per `rooms.schema.json` (`name`, `node`, `floor`, `kind`, `area?`, `note?`, geometry) | `rooms.schema.json` (new) | schema; `node` resolves | none: no interior without rooms |
| view mode words, floor words | core i18n keys (`v3.ext`, `v3.xray`, `v3.section`, `v3.floor`) via `ui.strings` | manifest `strings` (K-R57) | `check_pack` key list | core words |
| credits, original post link | `credits`, `credits.card.url` (K-R70) | manifest | URL scheme check | none |
| other UI words | `ui.strings` (K-R57) | manifest | non-overridable list | core i18n |

**Non-overridable keys** (P3-8): `fc.nav.consent*`, `fc.reason.*`, `fc.*.cost`, `lic.disclaimer`. The engine ignores a
pack's value for them and the self-check records one line; `check_pack` reports them as an error. A node test renders
them with a pack override and expects the core text.

**Contrast check in `check_pack`** (P3-7): for the chrome accent and every `ui.theme.views` entry, compute in both
themes: `--on-accent` on accent ≥ 4.5:1, accent on glass-1 / glass-2 composited over black and white ≥ 3:1,
`--map-label-ink` on `--map-label-bg` ≥ 4.5:1; a failure is an error.

## 3. Surfaces

### 3.1 HUD and clock capsule

The HUD is what sits over the map: host bar (embedded), viewer header, level strip, toolbar, ⓘ, drawer peek.

- Clock capsule (U-17): `.em-clock` in the host bar becomes a pill inside the host bar (`--r-pill`, 32 px tall, 44 px
  hit area, icon + time in `--font-ui` tabular figures; it has no blur of its own: the bar carries it); the period band
  shows as the icon (sun / dawn / dusk / moon from `ui/icons.js`), not as colour alone. ≤ 640 px: icon only first, then
  time (U-33 folding); a tap toggles `date · period` until the next tap. Pre-start state (`body.prestart`) shows "—".
  `aria-label` carries the full date and period.
- ⓘ (`#creditBtn`, `viewer.html` L637) becomes a 32 px glass-1 circle with a 44 px hit area at `--edge`; its credit
  popover is glass-2.

### 3.2 Top bar

One visual bar with fixed slot ownership (U-33, R0: P5-5, P1-1). The viewer header is in the viewer iframe; the host
bar is in the parent page and overlaps the header's right end (`--hostbar-w`). Both are glass-1 with the same height
(`--bar-h` 44 px), line and radius, so they read as one bar.

```
1440, embedded
| ‹  <map> ▸ <place>                       图层▾  ⚙ | ☾ 21:40  · 📍 <place name ………>  ●  ✕ |
  viewer header (iframe): back, crumbs/title,          host bar (parent page, --hostbar-w):
  layers, settings; in 3D the view segment             clock, place field (tap = locate me),
  sits left of 图层                                    the one status dot, close

375, embedded (folding order: clock → icon, place ≥ 50 % of the host bar, then title ellipsis)
| ‹ <map>…  ⚙ | ☾ · 📍 <place…>  ● ✕ |
```

- Ownership: the viewer owns back, title / crumbs, 图层 (desktop; on phones the 图层 button opens the 地图与图层 page,
  §5), 设置, and the 3D view segment (U-26). The host owns the clock, the place field, the status dot and close.
- One status: when embedded, the viewer's state dot and its 「已加载」 text are hidden; the host dot (with `aria-label`
  stating the state) is the only one. Standalone, the viewer shows its own dot.
- The place field is the answer to "where am I": it shows the player's current place chain (joined with ` · `,
  N10 (7)); a tap centres the map on it (same action as the toolbar's 定位到我). The viewer title shows the map being
  looked at.
- Standalone (no host): the "当前地点" debug input (`.where #here`) moves behind 高级 › 开发者 (probes set it by
  script). It keeps its id.

### 3.3 Layer popover

- `#layPop` (`viewer.html` L642–644, built by `renderLayerMenu`, `layer-host.mjs` L71–90): glass-2 panel, 320 px wide on
  desktop, anchored under `图层` as today. Rows are 40 px with 44 px hit areas, label and the `menu.title` description
  left, switch right. On ≤ 640 px the 图层 action opens the 地图与图层 settings page instead of the popover (R0: P1-5),
  and the probe asserts that the popover, wherever it opens, has > 0 visible rows.
- **Applicability (U-15 C, L-06):** for every row, `registry.applicable(id, layerContext())` decides:
  - applicable → normal row;
  - not applicable and the only failing condition is `data` → row hidden (today's behaviour, nothing to explain);
  - otherwise → row greyed: the greyed rows sit after the applicable rows in a `role="group"` whose
    `aria-labelledby` is the divider `此处不适用` / `Not here` (12 px `--ink-2`), each switch keeps working and gets
    `aria-describedby` = its reason line; no `aria-disabled`; grey is a measured text colour (≥ 4.5:1), not opacity
    (R0: P4-3). The reason is the pack's `menu.when` when set, else `appliesHint(applies, ctx, names)`: `只在 <view
    names> 视图` / `只在 <node names> 及其下级` / `只在 <period names>` / `只在夜间` / `仅在特定状态下` (mvu), joined by ` · `,
    at most two parts, one line with ellipsis and `title` (R0: P3-6, P5-11). Kinds and views are named through i18n
    keys (`lyr.kind.<k>`, `names.view`), never as ids or paths.
  - Toggling a greyed switch announces `已记住：到 <where> 时生效` for 2 s through the shared polite live region (§6)
    (R0: P1-6).
- The same rows render in the settings 地图与图层 page and the phone path above, so the greying shows everywhere.

### 3.4 Toolbar (control column)

`#dock` (`control-column.mjs` L13–19): the `#zoom` group is glass-1, the `#layers` level strip glass-2 (it carries
subtitles and counts, §2.2), both `--r-glass`, 4 px gap; desktop right column 48 px wide; phone bottom row above the
drawer peek. Buttons 44 px on phones, 40 px on desktop with 44 px hit areas. The active level keeps the accent bar on
its leading edge plus bold text. R0 (U-18, P1-1, P5-7): the home button becomes 「定位到我」 / "Locate me" (centres on
the player's place; `aria-label`); the phone row is + / − / 定位到我 / ⋯ only, 看全区 and Aa move into ⋯; ⋯ has an
accessible name 「更多」 / "More". In 3D on phones the view-mode button joins the row (U-26 A′).

### 3.5 Drawer

`UISheet` (`ui/sheet.js` CSS L11–72): glass-2 body and rail; the tab row in peek is glass-2 too. Tabs follow the
selection grammar (§2.5: accent bar + bold, not a filled pill); counts in a small badge. States peek / half / full and
every way to lower a state stay (U1). R0: the people tab shows even without data, with the empty state 「还没有读到人物；
回复一次后会出现」 (P1-15); event rows carry a category icon next to the colour dot (P4-12).

### 3.6 Settings

`#setPop` glass-2; desktop right sheet `max(rail, 360px)` as today; phone full screen. Home: search, 常用 block, group
list (`.sgroups`, one 48 px row each: title, summary, chevron), credits link; on ≤ 640 px the order is quick actions →
group list → 常用, and the layer list is replaced by one row `图层（n 开）›` (U-05, P1-4). Pages are built on first open;
search uses a static index of labels and expands the matching card and scrolls to it (P2-4, P6-3). Pages: sticky
header (back, title, close) that respects `--hostbar-w` (U20, §5); sections separated by 24 px and a hairline; feature
cards (`docs/settings-ia.md` §4) as bordered blocks inside the sheet (`--glass-line`, `--r-glass`; no nested glass).
Switch rows keep `label.row` semantics (`role="switch"`); a long label wraps and never pushes its switch out of the row
(`min-width: 0` on the label, the switch does not shrink: the observed 单字母快捷键 bug, S7-2 T5).

### 3.7 Notices, cards, 3D chrome, host page

- Notices (`ui/notice.mjs`): P0 modal glass-2 over a dim scrim; P1 banner glass-2; P2 pill glass-1. U-22 compact P1 on
  phones.
- Place / person cards (`#card`): glass-2; cover image keeps its own background.
- 3D chrome (`ui/chrome3d.js`, `viewer3d.html`, `estate/index.html`): same tokens through `tokens.css`; no blur while a
  3D view is open (§2.2); the estate page's own palette maps onto them (§2.3).
- Host page (`host-lifecycle.mjs` L36–198): `.em-fab`, `.em-panel` frame, `.em-bar`, `.em-pick`, `.em-tl` and the
  toasts read the injected token block (`--em-*` become aliases of the token values); the hard-coded `.em-fab`
  background (L63) becomes `var(--glass-1)`.

### 3.8 3D as a view mode of the current place (S7-3)

Entering the building keeps the viewer's top bar, level strip, toolbar, drawer and cards (U-25, U-26). The iframe shows
only the scene, its in-canvas labels and presence chips. Clicking a room or a chip posts up; the viewer opens the shared
place / character card (U-30). Hover shows one small in-canvas label; selection is separate state and never moves
with hover. Labels behind geometry are hidden, not faded. The building's words and colours come from pack data (U-29).

R0 additions:

- **The way in (U-31):** 「3D 查看」 on building and room place cards and in the level strip; a room card's action opens
  the room's floor in section view with the room selected.
- **Keyboard path (U-30, P4-2):** the building's card lists its rooms by floor; in 3D the drawer's 地点 tab lists them;
  probe `estate_kbd`: enter 3D → choose B1 → open a room card → open a person card → Esc back to 2D, keys only.
- **Rendering (U-16, P6-7):** the page renders on demand (no rAF while the camera is still and auto-rotate is off);
  2D is paused while 3D is open; reduced motion reaches the frame.
- **Chips (U-27 A′):** 32 px visible / 44 px hit, `+n` fold above 3 per room, ≤ 30 chips, buttons with names.
- **Occlusion (P6-6):** label rays hit a simplified proxy (floor slabs + outer wall boxes, tens of triangles) or a BVH,
  spread over frames, never while the camera is still; ≤ 2 ms per round, no task > 50 ms.

## 4. Layer applicability and the animation pause

S8 owns `applies` data, the evaluator `core/layer-spec.mjs` `appliesTo` (L194–216) and `registry.applicable`
(`core/layer-registry.mjs` L85–89). S7 adds:

1. `appliesHint(applies, ctx, names)` — pure, in a new `map/core/applies-hint.mjs` (≤ 80 lines): which keys fail for
   `ctx` and a short neutral text per failing key (`views`, `kinds`, `nodes`, `node_types`, `periods`, `dark`, `mvu`);
   `data` alone → `null` (hide). Names come from the caller (`names.node(id)`, `names.period(id)`, `names.kind(k)`,
   `names.view(v)`, all i18n; `mvu` → 「仅在特定状态下」 without the variable path); a pack's `menu.when` wins (R0: P3-6).
2. One applicability pass for **every** menu row (kernel and pack) in `renderLayerMenu` / `refreshDeclared`: today only
   pack rows are evaluated and hidden (`declared-layers.mjs` L69 `row.hidden = menu.hidden || !app`).
3. The pause (U-16 A): every animated layer runs through `visibility.mjs` (`createPauseSwitch` L15, `visibilityGuard`
   L63) and stops when invisible, inapplicable, hidden document, reduced motion, **hidden map panel** or **covered by a
   3D view** (R0: P6-1). Gaps to close: `wander.mjs` (rAF L73–80 plus `setInterval` L141), `clouds.mjs` (WAAPI drift,
   only `visibilitychange` at L89). Already compliant: `block-canvas.mjs` (weather, traffic, declared layers),
   `quests-view.mjs`, `vision-view.mjs`, `sound-block.mjs`, the estate page (`estate:pause` / `resume`).
4. **Panel visibility (new, R0: P6-1):** `document.hidden` stays false while the tavern panel is closed or docked, so the
   host sends `eden-map:visible { on }` (registered in `protocol.mjs`) on panel open / close and from an
   IntersectionObserver on the iframe; `visibility.mjs` treats `on: false` like a hidden document. While a 3D view is
   open the viewer pauses the OSD animation layers the same way.
5. A debug counter `ViewerDebug.raf()` (read only; frames requested per layer in the last second, plus the count of
   live `setInterval` callbacks and running WAAPI animations, P6-13) for the probe.
6. Ambient layers (weather, traffic, wander) may share one scheduler capped at 30 fps (P6-12): filed as Q-item, not
   required by S7.

## 5. Mobile 375 px rules

1. Every control and row: ≥ 44 × 44 px hit area (`--hit`, pseudo-element enlargement for capsules, chips and ⓘ);
   hit rectangles never overlap; gaps ≥ 8 px between targets.
2. Header: one line; title `min-width: 38%`, ellipsis only after that; the host bar ≤ 45 % (`host-lifecycle.mjs`
   L171–183); inside the host bar the clock folds to its icon first and the place field keeps ≥ 50 % (U-19 A′, U-33).
3. Overlays never stack over each other: drawer above peek → edit bar collapses into the header (U-20), the toolbar row
   rides above the drawer edge, notices sit above the drawer.
4. Settings full screen: the sticky header pads right by `--hostbar-w` like the viewer header (U20); `#licBox .row` gets
   the `.spage .row` flex and gap so "Status" and its value are separated (U20 "StatusNot connected").
5. P1 notices: one line, max 30 % height (U-22).
6. Blur is off on coarse pointers (opaque glass-1), part of the blur budget (§2.2).
7. No horizontal scroll at 375 px on any page (probe check).
8. HUD coverage: at 375 × 812 in the default state the union of HUD rects covers ≤ 18 % of the viewport (R0: P5-7).
9. The 图层 action opens the 地图与图层 page, not the popover (R0: P1-5); home order per U-05 (R0: P1-4).

## 6. Accessibility

- Contrast: body text ≥ 4.5:1, large text (≥ 18.66 px bold / 24 px) and icons ≥ 3:1. Measured against every glass
  surface composited over **three** backdrops — pure black, pure white and the 95th-percentile-luminance tile of the
  shown map — for `--ink`, `--ink-2`, `--muted` (glass-2 only), accent, focus ring and switch borders, in both themes and
  for every pack view (R0: P4-1, P5-2). 13 px / 600 on glass-1 is **not** large text.
- Targets: 44 px (§5.1). Focus: the two-layer ring (§2.2) on every control including glass pills.
- Reduced motion: `html.rm` and `prefers-reduced-motion` stop all CSS motion (kept), all layer rAF (§4) and reach the
  3D frame (`rm` in its state message: no idle rotation, camera jumps, no chip animation; theme switches are instant)
  (R0: P4-8).
- Reduced transparency: `prefers-reduced-transparency` and `html.noblur` / `html.lowmem` → opaque surfaces, in the
  viewer, the host page token block and the 3D frame (P4-15).
- Screen readers: greyed layer rows as a labelled group with `aria-describedby` reasons, no `aria-disabled` (§3.3);
  feature-card health has a shape icon (✓ working, ! not effective, ◷ idle, – off) with `aria-label`, and one shared
  `aria-live="polite"` region announces only the card whose state **changed**, at most once per 5 s (R0: P4-4, P4-6);
  the clock capsule has `aria-label` with the full date and period; state never by colour alone.
- Names: every button, switch and tab has a non-empty accessible name (settings slider icon, + / − / 定位到我 / Aa / ⋯,
  notification bell, rail icons, `编辑 ⋯` with `aria-haspopup`, `aria-expanded` and arrow-key focus); checked by the
  accessibility-tree probe `a11y_tree` in 2D and 3D shells (R0: P4-9).
- Keyboard: popover and settings keep their focus traps (`settings.mjs` L128–131). Tab order across documents: host
  bar → viewer header → layers → level strip → toolbar → drawer; the 3D iframe is `tabindex=-1` and Esc inside it posts
  up (U-25). Esc closes, in order: card → popover → drawer (half → peek) (R0: P2-8, P4-10). With single-key shortcuts on
  (`edenMapKeys`): existing `L` layers, `M`, `/`, `?`, plus `,` settings and `1` / `2` / `3` view modes in 3D.

## 7. 3D: shared context, camera, hit checks

### 7.1 I-05 shared context (U-14 A)

`estate/main.js` L65 creates `new THREE.WebGLRenderer` directly and never disposes; `three/render-context.mjs`
`createRenderer` (L22–56) is the documented single path (dispose + `forceContextLoss` L53–54). S7-2 moves the estate page
onto `createRenderer`. R0 (P2-6, P6-9): `pagehide` does not fire on a parked frame, so release is explicit: re-entering
the same parked page reuses it; before opening a different 3D page `subpage3d-host.mjs` posts `estate:dispose` to the
parked frame, waits for `estate:disposed` (≤ 500 ms) and then removes the frame. Probe `webgl_single_ctx` must pass for
estate → props viewer → estate, and a five-round loop keeps 0 `webglcontextlost` and JS heap growth ≤ 10 %.

### 7.2 I-06 camera settings

- Auto-rotate switch in 地图与图层 › 三维 (`edenMap3dAutoRotate`, existing key, default 0), sent to the 3D page through
  the existing state message; U-23 fix: `makeIdleTimer` (`camera-controls.js` L86) starts and stops rotation without
  writing the key; reduced motion disables idle rotation at runtime (no key written).
- Wheel zooms switch (U-13, `edenMap3dWheelZoom`, default 0; label 「鼠标滚轮缩放（触控板捏合不受影响）」, P2-12): when on,
  plain wheel = zoom, Shift = pan, Alt = rotate, in both `estate/main.js` L905–912 and `viewer3d.html` L281–286.

### 7.3 ⓘ / (i) click-through

Probe `s7_hit` (new): for ⓘ (`#creditBtn`), the 3D info tab (`chrome3d.js` L42) and every visible `.pin` in the props
viewer, `elementFromPoint` at the centre returns the control (or its child), a click opens its target and does not reach
the map (no card opens, the OSD click handler count is unchanged). It also measures, at 375 px, every interactive
element's hit rect (≥ 44 × 44, no overlaps) and the blur budget of §2.2. Run on desktop and phone presets. Fix only what
reproduces.

### 7.4 U21 and U19b

U21: label overlap is now handled at all widths by U-21 A′ and checked by the map-label probe of §2.6. U19b: in the
estate page, hover a room, move to the card's first button within 300 ms, click: the action fires; if it fails, add a
200 ms hover bridge before unpinning (`estate/main.js` L760–768) — moot in shell mode once S7-3 T3 removes the in-canvas
card; checked in standalone mode only.

## 8. Review protocol

The user asked (2026-10-01) that the UI refactor be reviewed in several rounds by sub-agents with different personas.
The executor does not review itself: at each gate it saves the screenshot set, writes a review request and **stops**;
the orchestrator runs the persona reviewers and sends the findings back to the same executor, which fixes and continues.

### 8.1 Personas

| Persona | Looks at | Checks |
|---|---|---|
| **Phone newcomer** (first-time tavern user, 375 px, never opened settings) | phone shots, first-run states | can find the player's current place, open and close the drawer, enter 3D and a room, find "turn the AI 参谋 on" and understand what it costs; no overlapping controls; no jargon in labels; nothing covers the chat input |
| **Mac power user** (long sessions, 1440 px, keyboard) | desktop shots, settings pages, popover | every setting reachable in ≤ 2 clicks from home; search finds and opens feature cards; keyboard and Esc order; density acceptable; nothing moved without a reason in `docs/settings-ia.md` §3 |
| **Card author / pack maker** | AI 联动 page, feature cards, layer popover with a pack layer greyed, the minimal 3D fixture pack | feature cards show the exact injected text, template source and token cost; health reasons are actionable; pack layers grey with a correct reason; town and eden both look right; no card name in engine text; the §2.7 table matches the pack checker |
| **Accessibility reviewer** | all shots + the probe numbers | contrast per §6 (three backdrops), 44 px targets, focus visible, reduced motion and transparency honoured (3D too), names on every control, keyboard path into 3D rooms, nothing by colour alone |
| **Visual designer** | all shots side by side (before / after, dark / light, the period matrix) | one chrome across views and 2D / 3D; glass per U-01 A′; map label tiers; elevation, radius nesting, accent use; base map untouched by the theme |
| **Performance reviewer** | `raf_pause`, `pan_frame`, `s7_hit` (blur budget), `perf_v2`, `accept`, `estate3d` numbers and a 10 s trace summary | no rAF while a layer is hidden / inapplicable / document or panel hidden / covered by 3D; 3D idle rAF 0; blur budget; frame times; first-screen time and new boot work within the gates of the specs (I-29: S7 must not make the reload stutter worse) |

### 8.2 Screenshot set

Taken by the new probe `tools/browser/s7_shots.mjs <out-dir>` (S7-1 creates it, S7-2 extends it) for **1440 and 375
× dark and light** (`lib.mjs` presets `desktop` / `phone`, `newPage(..., { scheme })`), embedded in the host stub
(`openInHost`) so the host bar and the AI 联动 page exist:

1. map default (`tc_mid`, three events posted);
2. layer popover open on a view where at least one layer is inapplicable (town pack with its danger-zone layer outside
   its `applies`, and eden `tc_upper`); on 375 the 地图与图层 page instead;
3. drawer half on events, then on people;
4. settings home; 5. 地图与图层; 6. AI 联动 collapsed; 7. AI 联动 with the status-line card and the AI 参谋 card expanded
   (consent block with the endpoint form visible); 8. 数据与映射; 9. 更新与版本;
10. P1 update notice (`showNotice` level 1 with three actions);
11. 3D estate page chrome and the props viewer; 11b. estate section view (B1) and one room card (N9);
12. phone only: edit mode on with the drawer at half (E-12);
13. S7-3: world map, upper tier, estate exterior, estate B1 section with presence chips and the shared room card;
14. R0 new: a room card with 「3D 查看」 and the 3D view it opens (U-31); the minimal fixture pack in 3D (`estate_generic`).

Names `<w>-<scheme>-<nn>-<state>.png`; the folder gets a `README.txt` listing what changed since the previous round.
**R1 and R2 use in-tavern shots only** (R0 finding of P1, P2): states 4–10, 12, 13 (and 14 in S7-3) must come from the
host stub (`openInHost`), never from the standalone viewer; a gate whose set lacks them is incomplete and the executor
does not stop for review with it.

### 8.3 Rounds and pass rule

| Gate | When | Folder | Executor writes |
|---|---|---|---|
| R0 | after the baseline, before any UI edit (S7-2 also builds a static mockup page from the new tokens, outside the repo) | `~/eden-map-review/overnight/s7/<step>-r0/` | before set (+ mockup), the list of surfaces to be changed |
| R1 | after the main implementation commit (not pushed) | `…/<step>-r1/` | after set (in-tavern), before / after pairs, probe numbers |
| R2 | after the fixes for R1 findings | `…/<step>-r2/` | final set, what each finding became |

At each gate the executor stops with `status: PARTIAL` and a block `review: <gate> — look at: <list of states and
questions>`. Each persona returns findings tagged **blocker** / **major** / **minor**. Pass rule: no blocker; every major
fixed or filed as a Q-item in `docs/todo.md` §3 with a reason; minors may be filed. R2 must pass; at most one extra round
(R3) — still failing → `status: BLOCKED` with the open findings. Push only after the final gate passes.

## 9. Risks

- `backdrop-filter` cost → the blur budget (§2.2): opaque glass-2, glass-1 only on four small elements, none on touch
  or in 3D; `pan_frame` compares against `html.noblur` and glass-1 degrades to opaque when the difference exceeds 2 ms.
- `color-mix` support: all supported browsers (Chromium ≥ 111, Safari ≥ 16.2) have it; the tokens keep a plain
  fallback line before each `color-mix` declaration.
- Settings ids used by probes: page ids kept, `display` aliased; control ids kept when a row moves; lazy pages are built
  before a probe reads them (`SettingsApi.open(page)` builds the page).
- Timing noise: every timing gate is a 5-run median with the threshold max(5 %, 2 × baseline MAD); when the base
  already misses an absolute target, the gate is "not worse than the base" and both numbers are reported.
- Parallel work: S8-4 (transit, `docs/transit-schema.md`) owns the router, the `routes` field and the drawing; S7-1
  waits for S8-4b and only adds the op and the `routeOp` call.
- I-29 (reload stutter) is not fixed here; S7 must not regress it (new sync boot work ≤ 5 ms, no new long task).
- U-04 B′ changes how a per-view pack theme looks on chrome (it no longer recolours it): the town and eden differ only in
  map space and in the optional pack-wide chrome accent.

## 10. R0 disposition

Findings of the six R0 reviews (`~/eden-map-review/overnight/s7/review-R0-P1P2.md`, `…-P3P4.md`, `…-P5P6.md`): every
致命 (blocker) and 重要 (major) finding and every proposed U-item change, numbered as in the reports (P1-1 = persona
P1, item 1). Accepted = taken as proposed; adapted = taken with a change (reason given); rejected = not taken. Every
decision here is **Decided by default 2026-10-01 (autopilot); user may override.**

Totals: 88 rows (59 findings + 29 U-item proposals): **accepted 61, adapted 25, rejected 2.**

| Finding | Sev. | Decision | Reason (one line) | Where |
|---|---|---|---|---|
| P1-1 "where am I" lost on phones | blocker | accepted | the player's place is the first phone question | U-18, U-19 A′, U-21 A′, U-33, §3.2 |
| P1-2 consent before an endpoint exists fails at once | blocker | accepted | consent after a passing test of the form | U-09, U-11, settings-ia §4.3 |
| P1-3 no designed way into 3D | blocker | accepted | new action, room-direct | U-31, S7-3 T2, T3 |
| P1-4 phone home too long | major | accepted | groups back on the first screen | U-05, §3.6 |
| P1-5 phone layer popover empty | major | accepted | observed bug, repro first; phone opens the page | §3.3, §5.9, S7-2 T5 (bug B1) |
| P1-6 greyed switch "does nothing" | major | adapted | receipt through the shared live region (P4-6), not a per-row status | U-15, §3.3 |
| P1-7 fresh chat all amber | major | accepted | neutral idle state | U-32, settings-ia §4.5 |
| P1-8 24 px 3D chips under 44 px | major | adapted | 32 px visible (P4-7) with 44 px hit | U-27 A′ |
| P1-9 schedule people vs located people | major | adapted | cue worded 「按日程」 / "by schedule": a data-source word, no inference wording | U-28 |
| P1-10 AI 参谋 cost abstract | major | accepted | concrete request count + last request tokens | settings-ia §4.2 C9 |
| P1-11 ⋯ has no name | major | accepted | accessible name + first-run hint per width | U-18, settings-ia §6 |
| P2-1 test only the saved config | blocker | accepted | test the form values, nothing stored | U-11, S7-1 T5 |
| P2-2 field "on" but skipped | blocker | accepted | three states per field | U-07, settings-ia §4.2 C2 |
| P2-3 build info inconsistent | major | accepted | `head #N · date` everywhere, host / viewer mismatch shown | settings-ia §2, §3.1, S7-1 T7b |
| P2-4 search hit does not expand | major | accepted | expand + scroll, static index for lazy pages | U-05, §3.6, S7-1 T1 |
| P2-5 no receipt on card switches | major | adapted | 「已保存」 on `th-state`; "applies on next reply" merged into idle | U-32, settings-ia §4.1 |
| P2-6 3D rebuilt on every entry | major | accepted | reuse the same parked page | U-14, §7.1 |
| P2-7 view segment crowds the toolbar | major | adapted | header at > 640 px; phones get one menu button in the toolbar row (no room in the drawer peek) | U-26 A′ |
| P2-8 missing shortcuts, Esc order | major | adapted | `L` exists already; add `,` and 1 / 2 / 3; Esc order taken | §6, S7-2 T5 |
| P3-1 no pack-author surface table | blocker | accepted | one table, printed by the checker | §2.7, S7-3 T1 |
| P3-2 3D interior untested for other packs | blocker | accepted | rooms schema, node link, fixture pack, probe | U-29 A′, S7-3 T1, T8 |
| P3-3 second floor list in `building` | major | accepted | extend K-R104 `floors[]`; `motto` → `subtitle` | U-29 A′ |
| P3-4 room-kind label shape differs | major | accepted | `label` + `i18n.<lang>` like other pack text | U-29 A′ |
| P3-5 undeclared kinds all grey | major | adapted | fixed 8-colour colour-vision-safe palette picked by a stable hash of the kind id (no colour generator) | U-29 A′, §2.7 |
| P3-6 `appliesHint` leaks ids and paths | major | accepted | `menu.when`, i18n words only | U-15, §3.3, §4 |
| P3-7 pack theme can break glass contrast | major | adapted | with U-04 B′ the check covers the pack chrome accent and map tokens | §2.7, S7-3 T1 |
| P3-8 packs can rewrite consent text | major | accepted | non-overridable keys | U-09, §2.7 |
| P3-9 template source not shown | major | accepted | one line per injecting card | settings-ia §4.1 |
| P4-1 glass contrast fails by design | blocker | adapted | glass-1 80 % (floors dark 80 / light 76), glass-2 opaque instead of 94 % or a new muted token; no muted on glass-1; two-layer ring | U-01 A′, §2.2, §6 |
| P4-2 3D rooms pointer-only | blocker | accepted | room list + keyboard probe | U-25, U-30, `estate_kbd` |
| P4-3 `aria-disabled` on usable rows | major | accepted | labelled group + describedby | U-15, §3.3 |
| P4-4 health dot colour only | major | accepted | shape icons + label | §6, settings-ia §4.1 |
| P4-5 ring colours not colour-vision safe | major | adapted | fixed safe palette only if people are drawn on the map, else neutral ring | U-24 A′ |
| P4-6 ten `role=status` cards | major | accepted | one throttled live region | §6, settings-ia §4.1 |
| P4-7 touch targets under 44 px | major | accepted | 44 px hit everywhere, `+n` fold, probe | §5.1, U-17, U-27 A′, §7.3 |
| P4-8 reduced motion misses 3D | major | accepted | `rm` into the frame | U-16, §6 |
| P4-9 icon buttons unnamed | major | accepted | a11y tree probe in 2D and 3D | §6, S7-2 T8 |
| P4-10 focus order and Esc across frames | major | accepted | fixed order, Esc relay | U-25, §6 |
| P4-11 11 px text on glass-1 | major | adapted | level strip becomes opaque glass-2 instead of growing text | U-18, §2.2, §3.4 |
| P4-12 event category by colour only | major | accepted | category icon per row | §3.5, §2.6 |
| P5-1 U-04 A breaks "one UI" | blocker | adapted | one chrome; a pack may keep one pack-wide accent | U-04 B′, §2.2 |
| P5-2 glass-1 values fail §6 | blocker | adapted | merged with P4-1; P5's light 80 % taken as the token value | U-01 A′ |
| P5-3 no map label hierarchy | blocker | accepted | three tiers, caps, min zoom | §2.6, U-21 A′ |
| P5-4 light theme washes the base map | major | accepted | themes never touch the base map | §2.1, §2.3, S7-2 T3 |
| P5-5 two top bars | major | accepted | one bar, slot ownership, wireframe | U-33, §3.2 |
| P5-6 missing tokens and rules | major | adapted | all taken; switch-on keeps the accent track (state, not decoration) | §2.5 |
| P5-7 375 px HUD too dense | major | accepted | trimmed phone row, ≤ 18 % coverage | U-18, §5.8 |
| P5-8 day / night overlays undefined | major | adapted | period matrix in the S7-2 R0 mockup at 1440 only, not every round | §2.3, S7-2 T0 |
| P6-1 no pause while the panel is closed | blocker | accepted | host visibility message, 2D paused under 3D | U-16, §4 |
| P6-2 glass-2 blur costs most, shows least | blocker | adapted | glass-2 opaque and the budget taken; the per-element 480 × 64 cap dropped (the header is full width; the area cap bounds it) | U-01 A′, §2.2 |
| P6-3 perf gates miss I-29, noisy | blocker | accepted | lazy pages, health only when watched, ≤ 5 ms boot, median + MAD | U-05, U-08, §9, S7-1 §5, S7-2 §5 |
| P6-4 no pan / zoom frame budget | major | adapted | `pan_frame` absolute targets; relative gate when the base already misses | §9, S7-2 T4 |
| P6-5 declutter layout cost | major | accepted | model coordinates, zoom end only, budget | U-21 A′, §2.6 |
| P6-6 occlusion rays as long tasks | major | accepted | proxy or BVH, spread, budget | §3.8, S7-3 T7 |
| P6-7 CSS2D writes every frame | major | accepted | on-demand render, ≤ 30 chips, diff-only messages | U-16, U-27 A′ |
| P6-8 glass over WebGL | major | accepted | no blur while 3D is open | U-01 A′, §2.2 |
| P6-9 parked frames never release | major | accepted | explicit dispose + ack, five-round loop | U-14, §7.1 |
| P6-10 theme toggle restyles the tree | major | accepted | toggle only on band change | U-02, §2.3 |
| P6-11 mobile GPU heuristics, WKWebView shot | major | adapted | `lowmem` heuristic taken; WKWebView R1 shot not required (Mac first; iPhone fixes on reports) | §2.2 |

U-item proposals:

| Proposal | From | Decision | Reason (one line) | Where |
|---|---|---|---|---|
| U-09 test before consent | P1P2 | accepted | avoids an instant failure | U-09 |
| U-11 test the form values | P1P2 | accepted | verify before saving | U-11 |
| U-19 clock yields first, place ≥ 50 % | P1P2 | accepted | "where am I" first | U-19 A′ |
| U-15 receipt + collapsible grey section | P1P2 | adapted | receipt taken; collapse not taken (divider + one-line reasons keep it short) | U-15 |
| U-26 segment in the header; phone in the drawer row | P1P2 | adapted | header taken; phone uses a toolbar-row menu button | U-26 A′ |
| U-27 24 px + 44 px hit | P1P2 | adapted | 32 px visible per P3P4 | U-27 A′ |
| U-28 dim + explanation | P1P2 | adapted | neutral wording 「按日程」 | U-28 |
| U-05 phone home order | P1P2 | accepted | groups on the first screen | U-05 |
| U-17 tap toggles | P1P2 | accepted | read at one's own pace | U-17 |
| U-24 flash pin, text to learn-more | P1P2 | rejected | the colour-vision fix of P3P4 supersedes it; the one line stays | U-24 A′ |
| new U-31 3D entry | P1P2 | accepted | no entry existed | U-31 |
| new U-32 idle state | P1P2 | accepted | no false amber | U-32 |
| U-01 alpha floors, no muted, two-layer ring | P3P4 | adapted | floors taken; glass-2 opaque instead of 94 % | U-01 A′ |
| U-15 no `aria-disabled`, `menu.when` | P3P4 | accepted | correct reading, no leaks | U-15 |
| U-24 A′ safe palette + initials | P3P4 | adapted | conditional on people being drawn on the map | U-24 A′ |
| U-27 32 / 44, `+n`, buttons | P3P4 | accepted | targets and names | U-27 A′ |
| U-29 floors on K-R104, `subtitle`, i18n, palette | P3P4 | accepted | one floor list, uniform text shape | U-29 A′ |
| U-30 keyboard room list | P3P4 | accepted | 3D reachable by keys | U-30 |
| U-09 non-overridable consent | P3P4 | accepted | paid-call wording stays honest | U-09, §2.7 |
| U-16 into the 3D frame | P3P4 | accepted | reduced motion everywhere | U-16 |
| U-17 44 px hit | P3P4 | accepted | target size | U-17 |
| U-01 A′ glass-1 12 px, glass-2 opaque | P5P6 | accepted | the cost sits where nothing shows | U-01 A′ |
| U-04 B′ one chrome, `--map-*` | P5P6 | adapted | plus one optional pack-wide chrome accent | U-04 B′ |
| U-02 auto follows world time by default | P5P6 | rejected | changes the default of every auto user (brief rule 6); option stays opt-in | U-02 |
| U-16 panel hidden / 3D covered | P5P6 | accepted | the most common idle state | U-16 |
| U-18 phone row trimmed | P5P6 | accepted | HUD density | U-18 |
| U-21 all widths, model coords, tiers | P5P6 | accepted | names missing at 1440 too | U-21 A′ |
| U-27 on-demand, ≤ 30, proxies | P5P6 | accepted | no new long tasks | U-27 A′, §3.8 |
| U-14 explicit dispose ack | P5P6 | accepted | parked frames get no `pagehide` | U-14 |

Suggestions (建议) taken without a row: P1-13 (in U-17), P1-15, P2-12, P3-11 (in U-30), P3-12 (§2.7), P4-13 (the two
observed bugs, S7-2 T5), P4-14, P4-15, P5-9, P5-10, P5-11, P5-12 (in U-24), P6-13, P6-14. Left for later (Q-item or
not taken): P1-12, P1-14, P2-9, P2-10, P2-11, P3-10, P6-12 (one ambient scheduler, filed as a Q-item by S7-2 if the
`pan_frame` numbers ask for it).

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

- `docs/agent-brief.md` (all), `docs/settings-ia.md` (all), this document §0, §2.7, §3.6, §6, §8, §10 (R0 disposition:
  every row whose "Where" names S7-1 or settings-ia is part of this step), the S7-1 spec (this section).
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

**T0 — Baseline and gate R0.** Record the boot baseline first: `accept` first-screen time and `perf_v2` long tasks,
5 runs each (median and MAD). Create `tools/browser/s7_shots.mjs` (states 1, 4–10, 12 of `docs/ui-refactor.md` §8.2;
host stub via `openInHost` — states 4–10 and 12 must be in-tavern shots, never the standalone viewer; arguments
`<out-dir> [--only <nn,…>]`; uses only `lib.mjs` helpers) and run it into
`~/eden-map-review/overnight/s7/s7-1-r0/`. Write a static mockup of the new home page and the AI 联动 page (one HTML
file using `map/ui/tokens.css`, outside the repo, in the same folder) from `docs/settings-ia.md` §2 and §4. Stop with
`status: PARTIAL`, `review: R0 — look at: grouping and order of the home page; card anatomy; consent wording; the
contradictory-hint fixes of settings-ia §6`. Continue when the orchestrator sends the findings.

**T1 — Groups and pages.**
- New `map/app/settings-pages.mjs` (≤ 250 lines): builds the page sections that `viewer.html` holds today (L647–690)
  from one table `[{ page, rows }]`, keeping every control id and `data-i18n` key; `viewer.html` keeps only the sheet
  shell (`#setPop`, `.sheet-h`, empty `section.spage` per page) and must shrink (ledger 707). **Lazy (R0: P6-3):** a page
  is built the first time it opens (`setPage` / `SettingsApi.open` build it first, so probes keep working); nothing of
  it is built on the boot path. Rows whose state other modules apply at boot (theme, language, reduce motion) read and
  write storage directly, not their DOM control.
- `settings.mjs` `PAGES`: `home, map, people, ai, data, update, adv, license`; `setPage('display')` → `map`;
  `SettingsApi.open('display')` keeps working; `setPage('ai')` posts `eden-map:th` `op: 'state'` (as `data` does).
- Home: search; the 常用 block (theme, language, sharpness, handedness); the group list with summaries (`s.map_sub`,
  `s.people_sub`, `s.ai_sub` = `{n} 项开启 · {m} 项未生效` from `healthSum`, `m` counting only `not-effective`, hidden when
  not embedded, `s.data_sub`, `s.update_sub` = `head #N · <date>`, `s.adv_sub`); a credits row. On ≤ 640 px (U-05, R0:
  P1-4): quick actions (one row) → group list → 常用; the quick-layer list leaves the home page for one row
  `图层（n 开）›` that opens 地图与图层.
- Moves per `docs/settings-ia.md` §3.1: night tint, portraits and gallery rows leave `custom-names-view.mjs` `renderUI`
  (the module exports `nightRow()`, the portraits / gallery rows move into `characters-view.mjs` / `gallery-view.mjs`
  registrations on `people` with `registerSection`); reduce motion, no-fx, fog, minimap, colour vision, 3D quality,
  3D auto-collapse to `map`; loading line to `update`; action injection and compose templates to the C10 card (T2).
- 版权申明: the author line of `viewer.html` L654 is removed; `renderLicense` already renders `credits` (L80–83) — add the
  original post link from `credits.card.url` when present (pack data; no card name in engine code).
- `setSearch` (R0: P2-4): searches a static index built from the page table and the card definitions (label, purpose
  and sub-option i18n keys) so unbuilt pages are found; a hit builds the page, opens the matching card's `<details>`
  and scrolls to the matched row.

**T2 — Feature cards and the AI 联动 page.**
- New `map/app/feature-card.mjs` (≤ 200 lines): `featureCard(def, state)` → element per `docs/settings-ia.md` §4.1
  (header with switch and health icon; sub-options; "what it does now" block with `≈ n token` and, for C1 / C2 / C6, the
  line `模板：内核 / 本设定包` (P3-9); health line; learn-more `<details>`). All text through `textContent`; switches post
  `eden-map:th` `op: 'prefs'`. R0: health is a shape icon (✓ working, ! not effective, ◷ idle, – off) with
  `aria-label` (P4-4); cards are **not** `role=status`: one shared `aria-live="polite"` region in the page announces only
  the card whose state changed, at most once per 5 s (P4-6); after a switch posts, the card shows 「已保存」 when the next
  `th-state` confirms it and the health line reads 「等待下一次回复」 (`idle`, U-32) until the feature runs (P2-5). Cards
  are built when the AI 联动 page first opens.
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
- `protocol.mjs` SCHEMA L80: `health: 'object?'`, `healthSum: 'object?'`; `eden-map:th` op `watch` with `ai: 'boolean?'`.
- R0 (U-08, U-32, U-07; P6-3, P1-7, P2-2): state `idle` = on, nothing to report yet (no reply since the switch or since
  load); the status-line row carries `fields: { here | present | time | trips: 'sent' | 'omitted' | 'card' }`; the full
  `health` is sent only while the viewer has posted `watch { ai: true }` (the AI 联动 page is open), throttled to one
  `th-state` per second; otherwise `th-state` carries only `healthSum: { n, m }`.

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
  `error` from `redact`. Busy flag: one test at a time. R0 (U-11, P2-1): the op carries the form's current values
  (`cfg: { provider, base, model, key? }`; an absent key means "use the saved key"); the host uses them for this one
  request only, never stores them, never echoes the key; the save button is secondary until a test passes.
- Consent: `llm-flow.mjs` L34–38 becomes `if (lsGet(CONSENT_KEY) !== '1') { facts.nav.consent = false; return; }`
  (no `window.confirm`, no switching off). Prefs `navConsent` (true → `'1'`, false → `'0'` and `edenMapNav` `'0'`).
  The card shows the consent block while consent is not `'1'` (`docs/settings-ia.md` §4.3). R0 (U-09, P1-2): the block
  holds the endpoint form and the test; 「同意并开启」 is disabled (with its reason as visible text) until a test of the
  current form values passes, and then posts `prefs: { navCfg, navConsent: true, nav: true }` in one message.
- Non-overridable keys (R0: P3-8, §2.7): `fc.nav.consent*`, `fc.reason.*`, `fc.*.cost`, `lic.disclaimer` ignore a pack's
  `ui.strings`; the self-check records one line per ignored key.
- Cost wording (R0: P1-10): each cadence option shows its hourly count (「每 5 分钟 ≈ 每小时 12 次小请求」) and the stats
  line shows the last request's token count.
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
  existing about payload (`about-build.mjs buildLine`); the home summary uses the same line (no `v0.9.x` anywhere in the
  sheet during the refactor); when the host script's build and the viewer's differ, both lines show with 「不一致」 (R0:
  P2-3). Check: each control exists once (DOM id count 1).
- (12) plain language: `s.tick` / `s.tick_hint` and the first-run hint (`app/notice-layer.mjs` `firstRunHint`, today 4
  items) rewritten per `docs/settings-ia.md` §6 (three short steps, no internal terms; step 3 names the settings
  button where it really is at that width: header on desktop, ⋯ on phones, R0: P1-11). Check: the hint has 3 items.
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

**Gate R1** (after commit 2 of §8): `s7_shots.mjs` into `…/s7-1-r1/` (states 4–10 and 12 as in-tavern shots from the
host stub; a set without them is incomplete), plus the boot numbers against T0; stop with `review: R1 — look at: …`
(every changed state, the before / after pairs, the text_dump diff). **Fixes**, then **gate R2** into `…/s7-1-r2/`; stop. Push
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
- The key of the AI 参谋 endpoint never leaves the host (not in `th-state`, not in logs except `redact` form); a form key
  sent with `nav-test` is used once and dropped.
- Boot budget (R0: P6-3): new synchronous work between reload and first frame ≤ 5 ms (new init code wrapped in
  `performance.mark` / `measure`, reported); no new long task > 50 ms before the first frame and none > 200 ms at all;
  `accept` first screen and `perf_v2` long tasks: 5-run median, not worse than T0 by more than max(5 %, 2 × T0 MAD).
- Pack text and model output reach the page through `textContent` / `esc()` only.

#### 6. Tests to add

- `tests/settings_pages.test.mjs`: every control id of today's markup exists after `settings-pages.mjs` builds the pages
  (list frozen from `viewer.html` at `df3b5f6d`); each lands on the page of `docs/settings-ia.md` §3.1; `display` alias.
- `tests/feature_health.test.mjs`: each card's states and reasons from hand-built facts; caps; tokens.
- `tests/feature_card.test.mjs` (jsdom-free: test the pure `cardModel(def, state)` that `featureCard` renders from:
  icons per state, `idle`, the three field states, the template line, consent button disabled until a passing test).
- `tests/strings_locked.test.mjs`: a pack override of each non-overridable key leaves the rendered text unchanged.
- `nav-test` with form values: used once, not stored, key absent from every payload; `watch` gates `health`.
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
run>`, `perf: accept <before → after> ms, perf_v2 long tasks <before → after>, boot work <ms>`. Cleanup: probe servers
stopped, no `.claude/launch.json` entries.

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

- `docs/agent-brief.md`, this document (all; §10 rows whose "Where" names S7-2, §2–§7 are part of this step),
  `docs/layers-schema.md` §5 (`applies`), §6 (menu); `docs/kernel-schema.md` K-R70 (amended in T1).
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

IN: T0 baseline, perf before-numbers, gate R0 with mockup · T1 tokens (glass A′, chrome vs map tokens, day / night
option, z ladder, host token block, R0 rule tokens) · T2 bare z-index and fallbacks on tokens · T3 surfaces on glass, one
top bar (U-33), toolbar (U-18) · T4 layer greying + animation pause, panel visibility, `pan_frame` · T5 mobile (U20, U22,
U23, E-12) and the two observed bugs B1, B2 · T6 I-05 with explicit dispose · T7 I-06 + U-23, reduced motion into 3D ·
T8 ⓘ / U21 / U19b, map labels (§2.6), hit rects, blur budget, `a11y_tree` · T9 docs · T10 N10 items 5, 7, 8, 9, 10, 13,
14, 16, 17 · gates R1, R2 · push and RESULT. (N9 and N10 items 1, 2, 3, 4, 6 are S7-3's.)

OUT: settings structure and AI cards (S7-1); new layers, `applies` data or the evaluator (S8); estate rendering (U4–U6);
the reload stutter investigation (I-29) beyond not regressing it; storage key renames (S10).

#### 3. Setup

```bash
git fetch
git worktree add -b s7-2-visual <scratchpad>/s7-2 origin/preview
```
Baseline: `node --test tests/*.test.mjs` (count), `bash tools/smoke.sh`; run the §7 probes on the untouched tree and keep
their lists; record `accept` first-screen time and `perf_v2` long-task count **five** times each (median and MAD) for the
performance persona, and `pan_frame` (T4) once it exists, on the untouched tree first.

#### 4. Tasks

**T0 — Gate R0.** `node tools/browser/s7_shots.mjs ~/eden-map-review/overnight/s7/s7-2-r0` (extend it first with states
2, 3, 11 of §8.2); write `mockup.html` in the same folder: the merged top bar (§3.2 wireframe), level strip, toolbar,
layer popover (with a greyed row and its reason), drawer peek, map labels in three tiers and a settings page drawn with
the new tokens over map screenshots, as the matrix {dark, light} × {dawn, day, dusk, night} on `tc_upper` and `tc_mid`
at 1440 (R0: P5-8). Stop with `review: R0 — look at: glass strengths, contrast on busy map areas, greyed row reading,
day / night matrix, one chrome across views`.

**T1 — Tokens (`map/ui/tokens.css`).**
- Glass tokens and `.g1` / `.g2` classes with fallbacks (§2.2: glass-1 80 %, blur 12 px, no saturate; glass-2 opaque,
  no blur; `--focus-ring`; `html.view3d`, coarse-pointer and `lowmem` rules, `lowmem` also from `hardwareConcurrency`
  / `deviceMemory` ≤ 4); `--r-glass`, `--sp-8`, `--warn`, `--shadow-1`, `--elev-*`, `--pad-glass`, `--edge` (§2.5);
  `--surface-glass` aliased to `--glass-2`; `--glow-text` removed from chrome rules.
- Chrome vs map tokens (U-04 B′): `app/theme.mjs` writes a per-view pack theme only into `--map-*`; the chrome set
  changes only with light / dark and the optional pack-wide `ui.theme.chrome` accent (`onAccent` computed when absent).
  Contract text: amend K-R70 in `docs/kernel-schema.md` (+ zh) — `ui.theme.chrome` (pack-wide) and
  `ui.theme.views.<view>` (map-space only); old per-view `surface` / `accent` values map onto `--map-*` (a test pins
  the town's and eden's mapping). Check: a probe reads computed `background-color` of `#hdr`, `.uis`, `#setPop` and
  `--accent` on world, upper, mid, low and in 3D — all equal; `--map-accent` may differ.
- Move the ladder from `viewer.html` L195–204 into `tokens.css` and add the tokens of §2.4 (values unchanged; `.rgp` →
  `--zu-panel`). `viewer.html` loses those lines (ledger may only shrink); the `tests/layer_registry.test.mjs` mirror
  check reads `tokens.css` instead of `viewer.html`.
- `edenMapGlassClock` (storage key, default `'0'`, owner `app/theme.mjs`; viewer only, no protocol field): a switch row
  on the 地图与图层 page (via `registerSection('map', …)`) and the rule of §2.3 in `app/theme.mjs` reading the last
  `eden-map:clock` (`body[data-tod]` is already set by `custom-tint.mjs`; use its band); toggle the class only when the
  band changes; ignore the option under `prefers-contrast: more`; the row's text says it overrides the system light /
  dark choice (R0: P6-10, P4-14).
- New `map/tavern/host-tokens.mjs` (≤ 80 lines): exports `HOST_TOKENS_CSS` (the `--zh-*`, glass and colour values for the
  host page, dark and `.em-light`); `host-lifecycle.mjs` injects it before its own rules and its literal `--em-*` values
  become `var(--…)`. Test `tests/host_tokens.test.mjs`: every value in `HOST_TOKENS_CSS` equals the `tokens.css` value of
  the same name.

**T2 — z-index on tokens.** Replace every bare value of §2.4 (files and lines there) by its token; drop the literal
fallbacks of `--zv-*` uses; `python3 tools/check_architecture.py --update-baseline` (the `zindex` section must go to
zero entries for these files). `s43_parity` screenshots identical except the `.rgp` case (which no probe opens; note it).

**T3 — Surfaces on glass** (§3): header, host bar and clock capsule (U-17), ⓘ, level strip (glass-2) and zoom (U-18),
layer popover, drawer, settings sheet and feature cards, notices, place / person card, `chrome3d.js`, `viewer3d.html`,
the estate page palette mapping. Components use `.g1` / `.g2` or the tokens; no colour literals added; inline appearance
styles only shrink. R0 additions:
- One top bar (U-33, §3.2): slot ownership, the viewer's state dot and 「已加载」 hidden when embedded, the host place
  field as "where am I" (tap = locate me), the 375 folding order; check at 375: place field ≥ 50 % of the host bar
  width, title ≥ 38 % of the header, no overlap.
- Toolbar (U-18): home → 「定位到我」; phone row + / − / 定位到我 / ⋯ (看全区 and Aa into ⋯); names on every button;
  check: HUD union ≤ 18 % of 375 × 812 (§5.8).
- Base map untouched by the theme (§2.1, P5-4): find and remove the light-theme wash over the base map; check: OSD
  canvas pixels sampled at 9 points equal in dark and light on `tc_mid` night.
- Selection grammar, accent use, elevation, radius nesting, icon rules of §2.5; no `--font-serif` in chrome.

**T4 — Applicability greying and the pause** (§4, U-15 C, U-16 A).
- New `map/core/applies-hint.mjs` (pure, ≤ 80 lines) with `appliesHint(applies, ctx, names)`; tests for each key, the
  `data`-only case (→ null) and the two-part cap.
- `layer-host.mjs` `renderLayerMenu` and `declared-layers.mjs` `refreshDeclared`: one pass over all menu rows: hide
  (data-only), grey with reason and sort under the divider (`lyr.na` i18n `此处不适用` / `Not here`), or normal; the
  greyed row's switch still works. Re-run on map change, clock change and layer-data change (the existing hooks).
- `wander.mjs` and `clouds.mjs` through `createPauseSwitch` / `visibilityGuard` and the registry's visible / applicable
  state; `ViewerDebug.raf()` (read only) counts rAF requests per layer per second, live intervals and running WAAPI
  animations.
- Greyed rows per §3.3 (R0: P4-3, P1-6, P3-6): labelled `role=group`, `aria-describedby` reasons, no `aria-disabled`,
  measured grey; `menu.when` first; the receipt through the shared live region; `appliesHint` test: output has no `/`,
  no `.`-path and no ASCII kind id.
- Panel visibility (U-16, P6-1): host `eden-map:visible { on }` (registered; IntersectionObserver on the iframe plus
  panel open / close in `host-lifecycle.mjs`), merged into `visibility.mjs`; the 2D animation layers pause while a 3D
  view is open.
- New probe `tools/browser/pan_frame.mjs` (R0: P6-4): desktop preset, 4× CPU throttle, scripted pan 3 s + two zooms with
  weather and traffic on, dock, level strip and popover open; reports rAF interval p95 / p99, frames > 33 ms and long
  tasks > 50 ms, then the same with `html.noblur`. Targets: p95 ≤ 20 ms, p99 ≤ 33 ms, dropped ≤ 5 %, no task > 50 ms;
  glass vs noblur p95 difference ≤ 2 ms (else glass-1 falls back to opaque). If the untouched tree already misses a
  target, the gate is "not worse than T0" (5-run median, max(5 %, 2 × MAD)) and both numbers go into the RESULT.
- New probe `tools/browser/raf_pause.mjs`: on `tc_mid` with weather and traffic on, then each switched off, then the
  document hidden (`page.evaluate` dispatch of `visibilitychange` with `document.hidden` stubbed), then reduced motion:
  per-layer rAF/s = 0 in each paused case; the town pack with its danger-zone layer outside `applies`: row greyed with a
  reason, rAF 0; host stub sends `visible { on: false }`: after 2 s rAF/s = 0, interval callbacks/s ≤ 1, running WAAPI
  animations 0; with a 3D view open: 2D layer rAF 0.

**T5 — Mobile** (§5): header and host bar widths (U-19); settings sticky header `--hostbar-w` padding and `#licBox .row`
flex (U20); compact P1 notice on ≤ 640 px (U-22: `notice.mjs` `.nt-p1` one line, "详情" toggle, `max-height: 30%`;
update prompt `host-checks.mjs` L168–194 passes its secondary lines as details); E-12 (U-20): `pack-edit-view.mjs`
collapses `#editBar` into a header button `#editMore` when `ViewerDrawer.state` is `half` / `full` at ≤ 640 px, menu with
the same actions; probe `pack_editor` screenshot `edit_phone` shows no overlap.
- **Observed bug B1 — 375 px layer popover renders as an empty bar** (R0: P1-5, P4-13). Repro: `before-design/
  375-dark-02-layers.png` and `375-light-02-layers.png` (phone preset, `tc_mid`, click 图层): `#layPop` shows as one empty
  pill under the header and covers ⓘ. Steps: reproduce with `s7_shots --only 2` at 375 on the untouched tree, record
  `#layList` child count and the popover's rect; find the cause (suspects: the phone layout moves the rows to the home
  page, `topbar.mjs` L22–25, and leaves the popover shell; or `#layPop { width: 220px }` vs a phone override); fix: on
  ≤ 640 px the 图层 action opens the 地图与图层 page (§5.9) and the popover never opens empty. Check: wherever the
  popover opens it has > 0 visible rows; ⓘ is not covered.
- **Observed bug B2 — the 单字母快捷键 row shows no switch at 375 px** (R0: P4-13). Repro: `before-design/
  375-dark-04-settings-adv.png` (settings › 高级): the long label `s.keys` (`viewer.html` L681, `label.row` with
  `#optKeys`) wraps across the full width and the switch is not visible. Steps: reproduce at 375 and 1440 on the untouched
  tree, record `#optKeys` rect and visibility; suspected cause: the label span has no `min-width: 0` / `flex: 1` and the
  switch shrinks or overflows. Fix in the shared `.spage .row` rule (label wraps, switch keeps its size); S7-1 already
  merged the row with 查看 (N10 (11)). Check: every `input[role=switch]` in every settings page has a visible rect
  ≥ 36 × 20 inside its row at 375 and 1440.

**T6 — I-05** (U-14 A, §7.1): `estate/main.js` creates its renderer with `createRenderer` from `three/render-context.mjs`
(import-map alias `engine3d/`), disposes on `pagehide` and on `estate:dispose` (answers `estate:disposed`; both
registered); `subpage3d-host.mjs` reuses a parked frame when the same page is reopened and otherwise sends
`estate:dispose`, waits ≤ 500 ms for the answer and removes the frame before a new `openEstate`. Probe
`webgl_single_ctx` extended: estate → props viewer → estate keeps ≤ 1 live context; five rounds: 0
`webglcontextlost`, JS heap growth ≤ 10 %; `estate3d` times the first and the second entry.

**T7 — I-06 and U-23** (§7.2): settings rows on 地图与图层 › 三维: auto-rotate (`edenMap3dAutoRotate`) and wheel zooms
(`edenMap3dWheelZoom`, new key, default `'0'`, owner `ui/camera-controls.js`); both reach the 3D pages through the
existing state message (protocol field `wheelZoom: 'boolean?'` on that message, registered); wheel mapping in both pages;
`makeIdleTimer` rotation does not write the key. Reduced motion into the 3D frames (U-16, P4-8): field `rm:
'boolean?'` on the same message; with `rm` no idle rotation (runtime, no key), camera moves jump, no chip animation;
`raf_pause` gains an estate case: `rm` on, 30 s idle, canvas rAF 0.

**T8 — ⓘ / U21 / U19b, labels, targets, names** (§2.6, §6, §7.3, §7.4): new probe `tools/browser/s7_hit.mjs`; run it on
the untouched tree first (record in the RESULT whether each case reproduces), then fix only what reproduces (the hover
bridge). R0 additions:
- Map labels (§2.6, U-21 A′): three tiers with their caps and min zoom; `declutter()` at all widths on zoom end and
  view switch only, model-coordinate boxes with grid buckets, HUD rects as obstacles, the player marker and current
  place never hidden; `ViewerDebug` reports the last declutter time. Checks (one probe, `s7_hit --labels`): on `tc_upper`
  and `tc_mid` default views at 1440 and 375, ≥ 5 L1 names and 0 overlapping label boxes; declutter of 200 labels
  ≤ 3 ms (≤ 8 ms at 4× throttle).
- `s7_hit` also: every interactive element's hit rect ≥ 44 × 44 at 375 with no overlaps; the blur budget (≤ 4 elements,
  ≤ 12 % of 1440 × 900, 0 at the phone preset, 0 with a 3D view open).
- New probe `tools/browser/a11y_tree.mjs` (P4-9): `page.accessibility.snapshot()` in the 2D shell and with the estate
  view open: every button / switch / tab has a non-empty name; `编辑 ⋯`-style menus have `aria-haspopup` and
  `aria-expanded`.
- Focus and Esc (P4-10, P2-8): Tab order of §6; Esc order card → popover → drawer (half → peek); shortcuts `,` and
  `1` / `2` / `3` behind `edenMapKeys`.
- `contrast_v2` extended (P4-1): every glass surface over black, white and the 95th-percentile map tile, the pairs of
  §6, both themes, every pack view.

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
- (14) upper-tier island pins show no names at default zoom: done by the L1 tier of §2.6 (T8); check: on `tc_upper`
  default view ≥ 5 named labels, no overlaps (U-21 A′).
- (16) roster rows (`characters-view.mjs` `row`, L163) without a rank badge collapse the empty `<em>` row; check: no
  empty badge row in the people tab DOM.
- (17) avatar ring colours: U-24 A′ — first record whether people are drawn on the 2D map and with which colour (the
  before shots show one pin colour); if they are, one fixed colour-vision-safe person palette (8 colours, follows
  `edenMapCvd`, no hue within ± 20° of the chrome accent) for rings and map avatars, initials on both, the one muted line;
  if not, U-24 B (one neutral ring, no line).

**Gate R1** after commit 4 of §8 (`s7_shots` into `…/s7-2-r1/` with states 4–10 and 12 as in-tavern shots from the
host stub, plus `raf_pause`, `s7_hit`, `pan_frame`, `a11y_tree`, `contrast_v2`, `accept` and `perf_v2` numbers against
the T0 medians); stop. **Fixes**; **gate R2** into `…/s7-2-r2/`; stop. Push after R2 passes.

#### 5. Constraints

- Visual change only where this design says; `s43_parity` differences must be explained by a surface of §3.
- No bare z-index, no new inline appearance style, no colour literals in component CSS (tokens only); files ≤ 400 lines;
  `viewer.html` and `eden-map.js` must shrink or stay.
- New toggles default off and registered: `edenMapGlassClock`, `edenMap3dWheelZoom` (+ the 3D state message field).
- No blocking dialogs; reduced motion and reduced transparency honoured everywhere touched.
- `accept` first-screen time and `perf_v2` long tasks: 5-run median, not worse than T0 by more than max(5 %, 2 × T0
  MAD) (I-29); new synchronous boot work ≤ 5 ms; no new long task.
- Blur budget (§2.2): ≤ 4 blurred elements, ≤ 12 % of the viewport, 0 on coarse pointers, 0 while 3D is open.
- `pan_frame`: p95 ≤ 20 ms, p99 ≤ 33 ms (or not worse than T0 when the base misses), glass vs noblur p95 ≤ 2 ms.
- One chrome token set: computed chrome colours equal across views and in 3D (T1 check).
- Engine files carry no card terms; pack text through `textContent`.

#### 6. Tests to add

`tests/applies_hint.test.mjs`, `tests/host_tokens.test.mjs`, `tests/z_ladder.test.mjs` (every `var(--z…)` used in
`map/**` is defined in `tokens.css` or the host token block; `--zv-*` values equal `core/layer-registry.mjs` slots),
`tests/camera_prefs.test.mjs` (idle rotation never writes the key; wheel mapping table; `rm` disables idle rotation),
updated `tests/layer_registry.test.mjs` mirror source; `tests/theme_split.test.mjs` (per-view pack theme writes only
`--map-*`; K-R70 mapping of town and eden; `onAccent` computation); `tests/declutter.test.mjs` (tiers, caps, priority,
never-hidden player marker, model-coordinate boxes); protocol tests for `eden-map:visible`, `estate:dispose` /
`estate:disposed`, `rm`. Count = baseline + new.

#### 7. Verify

```bash
node --test tests/*.test.mjs
bash tools/smoke.sh
python3 tools/check_architecture.py && python3 tools/test_architecture_gate.py && python3 tools/check_arch_doc.py
node tools/browser/s7_shots.mjs ~/eden-map-review/overnight/s7/s7-2-r2
node tools/browser/raf_pause.mjs; node tools/browser/s7_hit.mjs; node tools/browser/s7_hit.mjs --labels
node tools/browser/contrast_v2.mjs; node tools/browser/pan_frame.mjs; node tools/browser/a11y_tree.mjs
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
- `accept` / `perf_v2` / `pan_frame` miss their gates after two attempts (report the numbers);
- B1 or B2 does not reproduce on the untouched tree (report; keep the check, skip the fix);
- contrast below the §6 thresholds on a surface and the fix would change the design (report the pair);
- each review gate (R0, R1, R2): stop with `status: PARTIAL` and the `review:` block;
- a file would pass 400 lines; push rejected; CI fails twice; the test count drops without a named replacement;
- T10: an N10 item needs a change in the 3D pages (that is S7-3's) — leave it and note it.

#### 10. Report

RESULT block with extra lines `n10: <item> <check result>` (one per item), `review: R0 … · R1 … · R2 pass`, `perf: accept <before → after> ms, perf_v2 long tasks
<before → after>`, `pan_frame: p95 / p99 <before → after>, noblur Δ`, `blur: <n elements, % area>`, `z-index: ledger
entries <before → after>`, `reproduced: ⓘ <y/n>, U21 <y/n>, U19b <y/n>, B1 <y/n>, B2 <y/n>`, `files:
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

- `docs/agent-brief.md`, this document §0, §2 (with §2.7 the pack-author surface), §3.8, §6, §8, §10 (rows whose
  "Where" names S7-3, U-25 … U-31), this spec; `docs/todo.md` N9, N10, N11.
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

IN: T0 baseline + gate R0 · T1 pack data for the building (K-R131, K-R132), `rooms.schema.json`, the minimal 3D fixture
pack, `check_pack` surface / contrast / locked keys · T2 one shell (chrome-less iframe, viewer controls, the 3D entry
U-31, focus and Esc) · T3 one card system (room and about as place-card sections, room list, hover label, N10 (2), (6)) ·
T4 one token set (3D page, room gallery, illustration panel) · T5 N9 · T6 N10 (1) `open` rooms · T7 labels: occlusion
and N10 (4) · T8 presence chips (U-27, U-28), on-demand rendering + probes `estate_presence`, `estate_generic`,
`estate_kbd` · T9 watchdog scope for the estate page · T10 docs · gates R1, R2 · push and RESULT.

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
light: world, upper, estate exterior, estate B1 section with the people the chat places there; in-tavern via the host
stub); a static mockup of the estate view inside the main shell (one top bar with the view segment in the header,
level strip with floors, toolbar, drawer with the room list, the shared room card with its sections and 「3D 查看」,
presence chips with a `+n` fold). Stop with `review: R0 — look at: shell layout in 3D, card sections,
chip style, legend chips`.

**T1 — Building data (K-R131, K-R132), rooms schema, fixture pack, pack checks** (U-29 A′, R0: P3-1 … P3-5, P3-7, P3-8).
- Contract text in `docs/kernel-schema.md` (+ zh) for K-R131 (`room_kinds: { <kind>: { color, label, i18n?: { <lang>:
  { label } } } }`) and K-R132 (`building: { title, subtitle?, i18n }` in a 3D manifest; floor labels are `label` /
  `i18n` on the existing K-R104 `floors[]` items — a `building.floors` key is rejected by the schema; plain text,
  `textContent` only). `scene3d.schema.json` and `core/scene3d-manifest.mjs` validate and expose them; the eden manifest
  carries today's words and colours exactly (taken from `main.js` L105, L146–147, L582 and `floorplans.py` `KIND_C`, plus
  a `medical` colour; the old motto becomes `subtitle`); `main.js` reads them and keeps only neutral fallbacks
  (`Building`, no subtitle, floor ids as labels). Undeclared kinds: a fixed list of 8 colour-vision-safe colours (each
  ≥ 3:1 against `--surface`, pairwise ΔE ≥ 20 also under protan / deutan / tritan simulation) picked by a stable hash of
  the kind id, label = the kind id.
- New `map/data/schema/v2/rooms.schema.json`: `[{ name, node, floor, kind, area?, note?, geometry }]`; rooms link to
  nodes by `node` id (name only as fallback); `estate:people` and the room card match by node id. The eden rooms JSON
  gains `node` ids (generator change in `floorplans.py` output only, FREEZE rule; room count and notes unchanged).
- New fixture pack `tests/fixtures/pack3d-min/`: one tiny GLB generated by a node script in the repo (two floor slabs,
  three room boxes; no Blender), a 3D manifest with two `floors` and **no** `building` / `room_kinds`, three rooms.
- `tools/check_pack.py`: `--surface` prints the §2.7 table for a pack (a node test compares the row list with §2.7);
  the contrast check of §2.7 (error below threshold); non-overridable keys in `ui.strings` are an error.

**T2 — One shell (U-25, U-26 A′, U-31).** `estate/main.js` gets a `shell=host` mode (set by `subpage3d-host.mjs` when it
builds the frame): no `UI3D` chrome, no sheet, no own card; the canvas fills the frame (`role="img"`, `aria-label`
`<building>, <floor>, <n> people`; the iframe `tabindex=-1`; Esc inside posts `estate:esc` up and the viewer closes its
top layer). The viewer shows its level strip with the building's floors while the estate view is open (`estate:floor`
both ways, existing) and the segmented control 外观 / 内透 / 剖切 on the right of the viewer header above 640 px, one
44 px menu button in the toolbar row at ≤ 640 px (new `estate:view { mode }` viewer → subpage and back; registered in
`protocol.mjs`; keys 1 / 2 / 3 with single-key shortcuts on); `html.view3d` turns blur off; the 2D animation layers
pause; the drawer keeps 事态 / 人物 / 物品 / 地点. **3D entry (U-31):** place cards of a building with a 3D page and of
its rooms get the primary action 「3D 查看」 / "View in 3D" (i18n keys in the core dictionaries, neutral); a room's
action opens the estate view on that room's floor in section mode and posts `estate:select { node }` viewer → frame (the
existing message, new direction, registered); the level strip shows the same action when the current place has 3D. Standalone `estate/index.html` (no viewer)
keeps today's chrome. N10 (3) closes with this (no estate rail any more); check at 375 px: no overlap between drawer,
toolbar and level strip.

**T3 — One card system (U-30, N10 (2), (6)).** Click on a room → `estate:select { name, room }` (extend the existing
message with `room: 'object?'` = `{ name, floor, kind, area, note }` from the rooms JSON) → the viewer opens the shared
place card for that room node with a room section (floor label, area without the 「（卡 …）」 suffix of `main.js` L751,
note, kind chip, pictures, custom block); the building's place card gets an "about" section from K-R132 and the pack
credits. Hover shows one small in-canvas label (name only); hover never changes the selected room (selection state is
separate; fix the case where the card showed a different room than the selection). Remove the in-canvas `#card` in
shell mode. R0 (U-30, P4-2, P3-11): the building's card gets a room list grouped by floor (buttons opening room cards);
while a 3D view is open the drawer's 地点 tab lists the building's rooms; the about section reads only `building` and
`credits`; schedule-placed (dimmed) people show 「按日程」 / "by schedule" in the person card's source line (U-28).
Check: one card element visible at any time; selected room = card title.

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
  `scene3d.schema.json`, K-R104) gains `room_kinds: { <kind>: { color, label, i18n?: { <lang>: { label } } } }` (K-R131:
  validated with `recheck.hex` and plain text; unknown kind → the generated palette of T1; labels through
  `textContent`); `main.js` reads it through `Estate3D.normalize` and keeps no kind table.
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
their anchor is behind building geometry: one ray per label from the camera against a simplified proxy (floor slabs +
outer wall boxes, tens of triangles) or a BVH, never the full building mesh; a round is spread over frames, runs at most
4 Hz and only while the camera or the view mode changes (never while the camera is still); ≤ 2 ms of main-thread work
per round, no task > 50 ms (R0: P6-6); reduced motion does not change the rule. X-ray floor tags get a vertical
collision pass (a tag that overlaps the previous one shifts or hides). Check: no label box overlaps another in the X-ray
view at 1440 and 375; an occluded label (probe camera preset) has `display: none`.

**T8 — Presence chips (U-27, U-28).** The viewer sends `estate:people { items: [{ name, room, floor, color, avatar?,
dim? }] }` (new, viewer → subpage, registered) whenever the people tab's data, the location or the show prefs change:
people whose resolved node is a room node of this building (same `hereRes` / node result as the 2D people tab), minus
hidden ones (`prefs.show` false → empty list; `prefs.off`); `avatar` only `https:` or `data:image/` up to 64 KB, else
initials; `color` = `colorOf(name)` as in 2D. `main.js` draws them with the existing chip code restyled (U-27), fanned
out around the room centre, on the room's floor (shown in section and X-ray views, hidden in the exterior view);
routine people (`estate:routine`) are drawn only when not in the located list, with `dim` styling and the cue 「按日程」
on hover / long press. R0 (U-27 A′, U-16; P1-8, P4-7, P6-7): chips are `<button>` with `aria-label` `<name>, <room>`,
32 px visible, 44 px hit area, never overlapping; more than 3 people in one room fold into a `+n` chip that opens a list;
≤ 30 chips; the fan is recomputed only when the list changes; the viewer sends `estate:people` only when its content
changes; the page renders on demand (no rAF while the camera is still and idle rotation is off). Tap a chip →
`estate:person { name }` (new, subpage → viewer) → the shared character card. New probe `tools/browser/estate_presence.mjs`:
host stub places a character in a room of B1 through a chat tag; the estate view opens; within 5 s a chip with that name
is in the frame's DOM on floor B1, in the room's screen rect ± 40 px; switching 「在地图上显示人物」 off removes it; tapping
it opens the character card in the viewer; the estate view still for 2 s → frame rAF/s = 0.
New probe `tools/browser/estate_generic.mjs` (P3-2): the fixture pack `pack3d-min` opens in the main shell; the level
strip shows its floor ids; a room card opens; a person placed by the host stub lands as a chip in that room; no eden
word in the frame DOM or the computed strings (list from the eden manifest). New probe `tools/browser/estate_kbd.mjs`
(P4-2): keys only — open the building card → 「3D 查看」 → choose B1 in the level strip → open a room from the room list →
open a person card → Esc back to 2D; no mouse event fired. Lifecycle (U-14): estate → props → estate × 5 keeps 0
`webglcontextlost` and heap growth ≤ 10 %.

**T9 — Watchdog scope.** Add `map/estate/main.js` and `map/estate/index.html` to the engine scope of
`tools/check_architecture.py` with baseline entries (lines, inline styles, z-index) recorded once and only shrinking;
card terms must be zero (T1 moved them out). `python3 tools/test_architecture_gate.py` passes.

**T10 — Docs.** `docs/ARCHITECTURE.md` (+ zh): the estate page in the module map with its role ("3D canvas in the main
shell"), the new messages in §4, `estate_presence` probe; `docs/todo.md`: N9, N10 (1, 2, 3, 4, 6), N11 struck with
shas; `docs/naming.md` glossary row **presence chip**.

**Gate R1** after commit 6 of §8 (`s7_shots` states 11, 13 and 14 as in-tavern shots from the host stub,
`estate_presence`, `estate_generic`, `estate_kbd`, `webgl_single_ctx`, `estate3d` (first and second entry) and timings
against the T0 medians) into `…/s7-3-r1/`; stop. **Fixes**; **gate R2** into `…/s7-3-r2/`; stop. Push after R2
passes.

#### 5. Constraints

- The user's caution for every deletion (N9): grep every reader first; list each removed item with its replacement.
- Room count and notes unchanged except the four N9 kinds and the 22 N10 (1) rooms (their kind, use and note).
- Blender builders and committed models untouched.
- New messages registered in `protocol.mjs`; new pack fields in the schema and validated (K-R64 re-check: colours by
  `recheck.hex`, text through `textContent`); no card terms in engine files; tokens only; no bare z-index; files touched
  in the engine scope ≤ 400 lines or not growing (the estate page shrinks).
- One live WebGL context (U-14, explicit dispose) and no regression of `accept` / `estate3d` / `perf_v2` beyond
  max(5 %, 2 × T0 MAD) of the 5-run T0 medians (I-29); 3D idle rAF 0; occlusion ≤ 2 ms per round; ≤ 30 chips.
- No blur while 3D is open; no eden word reaches the frame for another pack (`estate_generic`).
- Located people come from the same result as 2D; nothing new is stored.

#### 6. Tests to add

`tests/scene3d_building.test.mjs` (K-R131 / K-R132 validation, fallbacks), `tests/estate_rooms_n9.test.mjs` (regenerated
JSON vs committed: only the listed kind / use / note fields differ, room count equal), `tests/estate_people.test.mjs`
(the pure function that builds `estate:people` from people rows, node tree and prefs: located vs routine, hidden people,
avatar filter, match by node id, unchanged list → no message), protocol tests for `estate:view`, `estate:people`,
`estate:person`, `estate:select.room`, `estate:select.node` (viewer → frame), `estate:esc`; `tests/rooms_schema.test.mjs`
(eden and fixture rooms validate; `building.floors` rejected); `tests/check_pack_surface.test.mjs` (§2.7 rows, contrast
errors, locked keys); `tests/kind_palette.test.mjs` (contrast and ΔE of the fallback palette). Count = baseline + new.

#### 7. Verify

```bash
node --test tests/*.test.mjs
bash tools/smoke.sh
python3 tools/check_architecture.py && python3 tools/test_architecture_gate.py && python3 tools/check_arch_doc.py
python3 tools/check_maps.py && python3 tools/check_pack.py && python3 tools/check_no_labels.py
node tools/browser/estate_presence.mjs; node tools/browser/estate3d.mjs; node tools/browser/webgl_single_ctx.mjs
node tools/browser/estate_generic.mjs; node tools/browser/estate_kbd.mjs; node tools/browser/a11y_tree.mjs
node tools/browser/topo_dairy.mjs; node tools/browser/room_gallery_ui.mjs; node tools/browser/chars092.mjs
node tools/browser/s7_shots.mjs ~/eden-map-review/overnight/s7/s7-3-r2 --only 11,13,14
```
Expected: new probe passes; others as on the base (known failures count as KNOWN); before / after screenshots (1440 +
375, dark + light) of world, upper, estate exterior, estate B1 with presence in `~/eden-map-review/overnight/s7/`.

#### 8. Commits & push

1. `feat(3d): building and room kinds as pack data (K-R131, K-R132); rooms schema; fixture pack; pack checks` (T1).
2. `feat(3d): estate view inside the main shell; view segment and floors in the viewer` (T2).
3. `feat(3d): one card system for rooms and the building; hover label only` (T3).
4. `style(3d): one token set for the 3D page and the picture dialogs` (T4).
5. `chore: freeze maps` / `feat(estate): legend chips, kind restricted removed, medical colour (N9)` / `chore: unfreeze`
   (T5).
6. `chore: freeze maps` / `feat(estate): uses for the open rooms (N10 1)` / `chore: unfreeze` (T6).
7. `feat(3d): occluded labels hidden; X-ray floor tags (N10 4)` (T7).
8. `feat(3d): presence chips from the located people, on-demand rendering; estate_presence, estate_generic,
   estate_kbd probes` (T8).
9. `chore(arch): estate page in the watchdog scope` (T9).
10. `docs: one shell in the module map, todo, glossary; RESULT S7-3` (T10, RESULT) — push after R2.

Each commit reverts alone in reverse order of dependence (2 needs 1; 3 needs 2; 8 needs 2). Commit identity, `-F`,
no Co-Authored-By trailer; push `bash tools/push_preview.sh --head --no-escalate`; CI as in S7-1.

#### 9. Stop and report instead of guessing when

- a reader of `restricted`, the removed strings or the legend tab cannot be accounted for; a room count or note changes
  beyond T5 / T6; a Blender builder's output would change;
- the presence probe cannot place a character because the room node is not resolved from the chat tag (report the
  locate result; do not special-case the probe);
- the fixture pack cannot open in 3D without code that names the first pack's rooms or files (report what is bound;
  do not special-case the fixture);
- a second WebGL context appears, or timings regress beyond 5 % after two attempts;
- each review gate (R0, R1, R2): stop with `status: PARTIAL` and the `review:` block;
- push rejected; CI fails twice; the test count drops without a named replacement.

#### 10. Report

RESULT block with extra lines `n9: removed <item> -> <replacement>` (one per line), `n10: <item> <check result>` (items
1, 2, 3, 4, 6), `rooms: <n> unchanged; kinds changed: <list>`, `worldbook add-on: <unchanged | diff>`, `presence:
<probe result>`, `generic: estate_generic <result>, estate_kbd <result>`, `review: R0 … · R1 … · R2 pass`, `perf:
<before → after>; 3D idle rAF <n>; occlusion <ms/round>`. Cleanup: probe servers stopped, no
`.claude/launch.json` entries.
