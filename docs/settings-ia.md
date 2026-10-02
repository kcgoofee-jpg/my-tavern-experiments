# Settings information architecture and AI feature cards (S7 design, N4)

> Canonical English edition; Chinese edition: `docs/settings-ia.zh.md` (same heading structure, gated by
> `tools/check_zh_mirror.py`). Output of plan step **S7-design** (plan `docs/plans/spatial-os.md` §5 Stage C S7;
> `docs/todo.md` N4, N7). Status: **design, working decisions applied by default** (the user was not available on
> 2026-10-01; the decisions are the U-items of `docs/ui-refactor.md` §0, mirrored in `docs/todo.md` §3). No code changes
> with this document; it is implemented by step **S7-1** (`docs/ui-refactor.md`, appendix). Every statement about today's
> code was checked at origin/preview `df3b5f6d` (head #239). **R0 revision (2026-10-01):** changed after the persona
> review R0 (`docs/ui-refactor.md` §10); changed decisions are U-05, U-07, U-08, U-09, U-11 and the new U-32, each
> Decided by default 2026-10-01 (autopilot); user may override.

## 1. Why

Today the settings sheet (`#setPop`, `map/app/settings.mjs`, markup `map/viewer.html` L645–691) has six pages —
显示 / 人物 / 数据与映射 / 更新与版本 / 版权申明 / 高级 — that grew by accretion:

- the eight switches that make the map talk to the model (`map/app/tavernhelper-settings.mjs` `renderInj` L69–103) sit
  as one flat checkbox list on 数据与映射, while their depth and budget sit on 高级 (L97–102), the action injection
  segment sits on 显示 (`viewer.html` L665) and its sentence templates on 数据与映射 (`map/compose-view.mjs` L43);
- the day / night tint switch lives inside the 自定义 box (`map/custom-names-view.mjs` L109), the portraits and gallery
  switches too (L110–111);
- several labels state a default ("默认关") next to a switch that may be on (§6);
- nothing tells the user whether a switched-on feature actually works in this chat, what exactly it sent to the model,
  or what it costs in tokens; the navigator asks for consent with `window.confirm` from the host page
  (`map/tavern/llm-flow.mjs` L34–38) and takes its endpoint through `window.prompt` (`tavernhelper-settings.mjs` L93–96),
  both blocking dialogs (brief rule 6).

The target: eight groups with a stable order, every setting in exactly one place, and every AI-linked feature as a
**feature card** that explains itself, shows what it does right now, and says whether it is effective.

## 2. Groups

Home page order (one row per group: title + one-line summary of the current state, as today's `.sgroups` rows):

| # | Group (zh / en) | Page id | Purpose |
|---|---|---|---|
| 1 | 常用 / Common | `home` (top of the home page, no sub-page) | The handful of controls people change often, plus the quick actions and quick layer switch already on the phone home page |
| 2 | 地图与图层 / Map & layers | `map` | How the map looks and moves: layers, fog, minimap, tint, colour vision, 3D quality and camera |
| 3 | 人物与物品 / People & items | `people` | What the people and items tabs show |
| 4 | AI 联动 / AI link | `ai` | The feature cards C1–C10 (§4): everything that sends text to a model, writes a worldbook or calls an endpoint |
| 5 | 数据与映射 / Data & mapping | `data` | Where data comes from and where it is kept: sources, variable mapping, custom names, the add-on worldbook, storage |
| 6 | 更新与版本 / Updates & version | `update` | Build, channel, update checks, self-check, loading line |
| 7 | 高级 / Advanced | `adv` | Map pack, edit mode, keyboard, debug, background pre-scan |
| 8 | 版权申明 / Credits & license | `license` | Card information, map credits, disclaimer |

Rules:

- Page ids `people`, `data`, `update`, `adv`, `license` keep their names (probes and `SettingsApi.open(page)` callers
  use them); `display` becomes `map`, and `SettingsApi.open('display')` keeps working as an alias for one release.
  `registerSection(page, el, { order })` keeps its signature; an unknown page still falls back to `adv`.
- The AI 联动 row is hidden when the viewer is not embedded (no host: none of its features can run), as the
  tavern-helper boxes are today (`tavernhelper-settings.mjs` L111). Its summary line reads
  `<n> 项开启 · <m> 项未生效` (counts from the health payload, §5).
- 常用 is not a page: it is the first block of the home page, above the group list, so the most used controls need
  zero navigation. On desktop the block is three rows. R0 (U-05): on ≤ 640 px the order is quick actions (one row) →
  group list → 常用, and the layer list leaves the home page for one row "Layers (n on) ›" that opens the map page.
- The home summary of the AI row counts only `not-effective` cards as "not effective" (`idle` is not counted, U-32); it
  reads the small `healthSum` (§5). The 更新与版本 summary is the build line `head #N · <date>`; no version number is
  shown during the refactor; a host / viewer build mismatch shows both lines marked as mismatched (R0: P2-3).
- Pages and feature cards are built on first open (R0: P6-3); the search uses a static index of every row's label,
  purpose and sub-options, and a hit builds the page, opens the matching card and scrolls to the row (P2-4).
- The search (`#setQ`) keeps searching every page; feature cards are searchable by name and purpose.
- The hard-coded original-author line at the bottom of the home page (`viewer.html` L654, a card name inside an engine
  file) moves into 版权申明 and is rendered from the pack's `credits` (K-R70), like the rest of that page. The home page
  keeps one neutral link row "版权申明".

## 3. Inventory: every current setting and its group

Source of truth for the keys: `map/core/storage.mjs` `KEYS` (L11–66). "Where today" uses the current page names.
Text changes are listed in §6 and §7; everything not listed there keeps its wording.

### 3.1 Viewer settings

| Setting (control id) | Key | Default | Where today | New group | Note |
|---|---|---|---|---|---|
| Theme (`#themeSeg`) | `edenMapTheme` | auto | 显示 | 常用 | |
| Language (`#langSeg`) | `edenMapLang` | zh | 显示 | 常用 | |
| Sharpness tier (`#tiers`) | `edenMapTierV2` | auto | 显示 | 常用 | |
| Handedness (`#handSeg`) | `edenMapHand` | auto | 显示 | 常用 | |
| Reduce motion (`#rmSeg`) | `edenMapRM` | auto | 显示 | 地图与图层 | also drives the rAF pause (`docs/ui-refactor.md` §4) |
| No glitch effects (`#optNoFx`) | `edenMapNoFx` | follows reduce motion | 显示 | 地图与图层 | |
| Fog of exploration (`#optFog`, `#fogReset`) | `edenMapFog` | 1 | 显示 | 地图与图层 | |
| Minimap (`#optMinimap`) | `edenMapMinimap` | 0 | 显示 | 地图与图层 | hint loses "（默认关）" (§6) |
| Day / night tint (`#optNight`) | `edenMapNight` | 1 | 数据与映射 › 自定义 | 地图与图层 | moved out of the custom box |
| Colour vision (`#cvdSeg`) | `edenMapCvd` | 0 | 显示 | 地图与图层 | |
| 3D quality (`#q3Seg`) | `edenMap3dQ` | auto | 显示 | 地图与图层 › 三维 | |
| 3D drawer auto-collapse (`#optAuto3d`) | `edenMap3dAuto` | 0 | 高级 | 地图与图层 › 三维 | |
| 3D auto-rotate (new row) | `edenMap3dAutoRotate` | 0 | (only inside the 3D page) | 地图与图层 › 三维 | I-06; key exists, now also in settings |
| 3D wheel mode (new row) | `edenMap3dWheelZoom` (new) | 0 | — | 地图与图层 › 三维 | I-06; off = today's behaviour (U-13) |
| Glass follows world time (new row) | `edenMapGlassClock` (new) | 0 | — | 地图与图层 | U-02 |
| Layer rows (`.more #layList`, kernel and pack layers) | per layer (`edenMapLayers`, `edenMapRoutes`, …) | per layer | home › 图层 (phone + estate) and `#layPop` | 地图与图层 (and the layer popover) | one list, rendered in both places |
| Quick layer switch (`.qlayers`) | — | — | home (phone, estate) | 地图与图层 | R0: the phone home shows one row "Layers (n on) ›" instead (U-05) |
| Quick actions up / here / close (`.acts`) | — | — | home (phone) | 常用 | unchanged |
| Show people on map, per-person switches | `edenMapChGroups` and the people prefs | — | drawer people tab | 人物与物品 (unchanged place: the drawer) | listed for completeness |
| Character stats (`#optCharStats`) | `edenMapCharStats` | 1 | 人物 | 人物与物品 | |
| More character fields (`#optCharMore`) | `edenMapCharMore` | 1 | 人物 | 人物与物品 | |
| People source (`#chSrc`, read only) | — | — | 人物 | 人物与物品 | |
| Card portraits (`#optPort`) | `edenMapPortraits` | on unless lean | 数据与映射 › 自定义 | 人物与物品 | hint moves author name to pack strings (§6) |
| Card gallery (`#optGal`) | `edenMapGallery` | 1 | 数据与映射 › 自定义 | 人物与物品 | |
| Action injection mode (`#injSeg`) | `edenMapInject` | off | 显示 | AI 联动 › card C10 "map actions into chat" |  |
| Compose templates (`#cmpBox`) | `edenMapCompose` | — | 数据与映射 | AI 联动 › same card, sub-options | |
| Storage and sources (`#storBox`) | — | — | 数据与映射 | 数据与映射 | |
| Variable mapping (`#vmBox`) | `edenMap:varmap:` | — | 数据与映射 | 数据与映射 | |
| Custom names and uses (`#cuBox` button, `#cuSync`) | `edenMap:custom`, chat variable | sync on | 数据与映射 | 数据与映射 | keeps only the names button, sync and storage note |
| Add-on worldbook (`#thWb`) | `edenMapWbOn`, `edenMapWbWhere`, `edenMapWbTomb`, … | on | 数据与映射 | 数据与映射 | the install / sync of our book; the JIT and crystallisation cards link here |
| About, check update, auto check (`#aboutBox`, `#optAutoCheck`) | `edenMapAutoCheck` | 1 | 更新与版本 | 更新与版本 | |
| Lock version (`#optLockVer`) | `edenMapLockTag` | — | 更新与版本 | 更新与版本 | |
| Branch (`#branchSel`) | — | — | 更新与版本 | 更新与版本 | |
| Self-check (`#selfCheck`), auto update (`#optAutoUpd`) | `edenMapAutoUpdate` | 0 | 更新与版本 | 更新与版本 | |
| Build code (`#build`) | — | — | 更新与版本 | 高级 › 开发者 | 更新与版本 shows `构建 head #N · <date>` instead (N10 item 11) |
| Loading line (`#linePick`, `#lineNow`) | `edenMapLine` | auto | 高级 | 更新与版本 | it is about how the script loads |
| Feedback button (mounted in `#aboutBox`) | — | — | 更新与版本 | 更新与版本 | |
| Map pack (`#packBox`) incl. pack model text | `edenMapPackPick`, `edenMapPackLlm` | automatic / off | 高级 | 高级 | |
| Edit mode (`#optEdit`) | `edenMapEdit` | 0 | 高级 | 高级 | |
| Pictures from links in packs (`#optPackRemote`) | `edenMapPackRemote` | 0 | 高级 | 高级 | |
| Single-key shortcuts (`#optKeys`), shortcut table (`#kbdBtn`) | `edenMapKeys` | 0 | 高级 | 高级 | one row (switch + 查看); label loses "默认关" (§6) |
| First-run hints again (`#hintAgain`) | `edenMapHint`, `edenMapHintN` | — | 高级 | 高级 | |
| Background pre-scan (`#optTick`) | `edenMapTick` | 1 | 高级 | 高级 | read only, sends nothing to the model |
| Debug FPS (`#optFps`) | `edenMapFps` | 0 | 高级 | 高级 › 开发者 | with the standalone 当前地点 input |
| Card info, map credits, disclaimer (`#licBox`) | — | — | 版权申明 | 版权申明 | plus the moved author line |

### 3.2 Host-side settings shown through feature cards

These keys belong to the host script (`map/tavern/host-tavernhelper.mjs` `thPrefs` L152–154, prefs op L163–180); the
viewer only posts `eden-map:th` `op: 'prefs'`.

| Feature card | Keys today | Default | New keys (all registered in `storage.mjs`, default off) |
|---|---|---|---|
| Situation digest (C1) | `edenMapInvInj` (inventory line, no UI today) | 1 | — |
| Status line (C2) | `edenMapStateInj`, `edenMapStateDepth`, `edenMapStateBudget` | 1, 2, 150 | `edenMapStateOmit` (JSON list of omitted fields; empty = today) |
| Macros (C3) | `edenMapMacros` | 0 | — |
| Dice checks (C4) | `edenMapDice` | 0 | — |
| Settlement records (C5) | `edenMapLedgerWrite` | 0 | — |
| Spatial contract (C6) | `edenMapSpatial`, `edenMapSpatialBudget` | 0, 120 | `edenMapSpatialDepth` (default 2 = today's fixed depth) |
| Worldbook JIT (C7) | `edenMapWbJit` | 0 | — |
| Fact crystallisation (C8) | `edenMapWbXtal`, `edenMapWbXtalCfg` | 0 | — |
| AI 参谋 (C9) | `edenMapNav`, `edenMapNavCfg`, `edenMapNavConsent` | 0 | — (cadence uses the existing ms form of `edenMapNav`) |
| Map actions into chat (C10) | `edenMapInject`, `edenMapActionTpl`, `edenMapCompose` | off | — |

Host keys that stay without UI: `edenMapSanitize`, `edenMapSanitizeTags` (preset text cleaning; on), the update /
splash / toast bookkeeping keys, `edenMapLine*`, `edenMapFabPos`. They are listed in `storage.mjs` and need no row.

## 4. AI feature cards

### 4.1 Card anatomy

Every card has the same five parts, top to bottom; the collapsed card shows parts 1–2 and the health dot.

1. **Header**: name (§4.2 table, cards C1–C10) + one-line purpose; the master switch on the right (44 px target); a health
   icon left of the switch — R0 (P4-4, U-32): shape and colour, never colour alone: ✓ working, ! on but not effective,
   ◷ idle (on, nothing to report yet), – off; with `aria-label`. The header is a `<details>` summary; the switch inside
   it does not toggle the details. After the switch posts, the header shows a short "saved" receipt once the next
   `th-state` confirms the pref (P2-5).
2. **Sub-options** (only when on): the controls listed per card. Number inputs show their unit and limits.
3. **What it does now**: the exact text the feature sent (or will send) to the model, in a read-only monospace block
   (`textContent` only, capped at 600 characters with "…"), followed by `≈ <n> token` (kernel estimate
   `interaction-modes.mjs tokens()`); for write features, the last write ("3 entries enabled, 1 disabled · floor 128").
   When nothing is sent: one line with the reason. Cards that inject text (C1, C2, C6) add one line naming the
   template in use: kernel, or this pack's `llm` block (with a link to 高级 › 地图包 when the pack text is not live,
   K-R103) (R0: P3-9).
4. **Health**: one line — `正常 · 上次生效：第 <F> 楼` / `未生效：<reason>` / `等待下一次回复` (idle) / `已关闭`. Reasons are
   the codes of §4.5 with fixed wording. R0 (P4-6): health lines are not `role=status`; one shared `aria-live="polite"`
   region on the page announces only a card whose state changed, at most once every 5 s. No blocking dialog, no "go set X in the backend" instruction (brief rule 6): a reason may name what is
   missing, never order the user around.
5. **Learn more** (collapsed `<details>`): which cards it suits, how it changes replies, what it never does, its cost.

Cards are ordered by how much they change the conversation: always-on digest first, then injection, then write
features, then the paid AI 参谋, then the chat-input helper. When the viewer is not embedded the whole page is replaced by
one line (`单独打开地图时没有聊天：AI 联动只在酒馆里工作`).

### 4.2 The ten cards

| id | Card (zh / en) | One-line purpose | Sub-options | What it does now | Health: effective when | Learn more (summary) |
|---|---|---|---|---|---|---|
| C1 | 事态摘要 / Situation digest | Every reply gets a short digest of nearby events, people, custom names, carried items and check results | Inventory line (`edenMapInvInj`, existing, on) | the last `eden-map-events` text (events summary + people summary + custom summary + items digest + slot line + failure reports + carry line, host `eden-map.js` L509) with token estimate | the injection call succeeded on the last floor with non-empty text | Core of the map's model link; always on (no master switch, U-06); suits every card; costs ≈ 100–300 tokens per reply |
| C2 | 状态行 / Status line | One line with place, people present, time and trips before each reply | Fields: place / present / time / trips (each a switch; stored as the omitted list `edenMapStateOmit`; R0 U-07: each shows its state — sent / omitted / provided by the card, the last as a grey tag while the switch stays usable); depth (0–20, floors from the end); budget (40–400 tokens) | `injectPreview().text` (host `modes-flow.mjs` L32–35) or `当前不注入：<reason>` | `stateInject` applied a non-empty line on the last floor | Suits cards whose prompt does not already state the place; fields the card prompt already shows are skipped automatically; budget trims trips first, then people |
| C3 | 宏 / Macros | `{{eden_here}}`, `{{eden_route}}` and `{{eden_fly …}}` for card and preset authors | — | the current expansion of `{{eden_here}}` and `{{eden_route}}` | the host's `registerMacroLike` exists and the macros are registered | For authors who place the map's facts in their own prompt; does nothing unless a prompt uses them |
| C4 | 检定掷骰 / Dice checks | Searches and stealth actions roll real checks; a failure really fails and is reported | — | the last failure report line (`check-failure-report.mjs render`) or `还没有检定` | dice on and at least one check rolled in this chat (last floor shown) | Suits cards with exploration and risk; a failed check is told to the model as a fact, so the story follows it |
| C5 | 结算记录 / Settlement records | Record people's places from the schedule and events from the chat into the map's own chat variable, filling gaps only | — | the last round's written rows ("2 people, 1 event · floor 130") | a settlement round wrote or found nothing missing on the last floor | Never writes the card's variables; useful when the card's own variables are sparse |
| C6 | 空间坐标契约 / Spatial contract | A ≤ 120-token JSON of the current place, exits and nearby landmarks instead of direction prose | Budget (60–240); depth (0–20) | `spatialNow` (host `modes-flow.mjs` L59–71) | the current place resolves on a map and the contract was injected | Helps models keep directions consistent; costs ≈ 120 tokens per reply |
| C7 | 世界书 JIT / Worldbook JIT | Only the add-on worldbook entries of where you are (and its neighbours) are enabled; leaving disables them | — | the last activation set ("enabled 4 · disabled 2 · floor 128") | the add-on book is installed and bound and the last round planned a change or confirmed none | Saves context on large worlds; touches only entries of our add-on book (`extra.eden_id`) |
| C8 | 事实结晶 / Fact crystallisation | Fact tags (`⌖事实`, pack-defined) in replies become keyword entries of the add-on book | Clear written list (keeps the tombstones) | written facts count, the latest fact name, LRU cap 40 | the add-on book exists and at least one fact tag was seen; else reason `no-tags` | Suits long campaigns; a fact you delete in the book never comes back |
| C9 | AI 参谋 / AI advisor | In the background, your own API endpoint suggests clues, marks, events and routes on the map | Endpoint (provider, base URL, model, key; §4.3); cadence (2 / 5 / 10 min); test connection | last run time, ops kept / dropped, the suggestions text; next run time | consent given, config valid and the last run returned HTTP 2xx | Costs your own tokens: each cadence option shows its hourly count (R0: P1-10, e.g. every 5 min ≈ 12 short requests per hour while the map is closed) and the stats line shows the last request's tokens; never writes to the chat; suggestions are session only (§4.4) |
| C10 | 地图动作入聊天 / Map actions into chat | Card buttons put a sentence into the chat input (or as a system note) | Mode off / fill input / system note (`edenMapInject`); sentence templates "go here" / "ask about this" (`#cmpBox` content moved here) | the template filled with an example name | mode not off and the host input was found on the last use | Fill input never sends; system note goes through `/sys` |

The worldbook add-on install / sync (`#thWb`) stays in 数据与映射 because it is a data install, not a behaviour; cards
C7 and C8 show `未生效：附加世界书未安装` with a link button that opens that section (`setPage('data')` +
`scrollIntoView`, as the self-check's `#scWbGo` does today).

### 4.3 AI 参谋: endpoint form and test connection

- Replaces `window.prompt` (`tavernhelper-settings.mjs` L93–96) with an inline form: provider `<select>` from
  `llm-gateway.mjs PROVIDERS` (labels from i18n, ids unchanged), base URL (`type=url`, prefilled from the provider), model
  (text, prefilled with a current, cheap default per provider: `claude-haiku-4-5`, `gemini-2.5-flash`, `gpt-4.1-mini`,
  `deepseek-chat`; the label says the id is editable; FIX-R2), key (`type=password`, `autocomplete=off`, never echoed back: the host returns only
  `navCfg: { provider, base, model, hasKey }`). Save posts the existing `prefs.navCfg` JSON string, so the host side
  (`host-tavernhelper.mjs` L177) is unchanged.
- The Claude request also carries `anthropic-dangerous-direct-browser-access: true` (the browser-origin opt-in the API
  requires; FIX-R2).
- **Test connection**: a new host op `eden-map:th` `op: 'nav-test'`. R0 (U-11, P2-1): the op carries the form's current
  values `cfg: { provider, base, model, key? }` (no key = use the saved one); the host builds one request with them
  (`llm-gateway buildRequest`, messages `[{ role: 'user', content: 'ping' }]`, `maxTokens: 8`, 15 s timeout), uses them
  for that request only and never stores them, and answers in `eden-map:th-state` `result.navTest = { ok, status, ms,
  error }` (error = `llm-gateway redact` form; never the key). The button says it costs a few tokens. It is the only
  call the viewer can trigger. The save button stays secondary until a test passes.
- **Consent inside the card** (N7): while `edenMapNavConsent !== '1'` the switch is replaced by a consent block. R0 (U-09,
  P1-2) order: (1) the endpoint form and the test button; (2) the consent text, today's `window.confirm` in neutral
  wording (`AI 参谋会按你的设置在后台调用你自己的 API（<provider>）给出地图建议；请求只发往你填的端点，会消耗你的额度。`);
  (3) the button `同意并开启`, disabled with a visible reason until a test of the current form values passes, which then
  posts `prefs: { navCfg, navConsent: true, nav: true }` in one message. Stored consent of existing users stays valid.
  The consent text, the health reasons and the cost lines are core-only keys a pack cannot override
  (`docs/ui-refactor.md` §2.7).
  The host drops the `window.confirm` (`llm-flow.mjs` L34–38): without consent it skips the run silently and reports
  health `no-consent`. Withdrawing: a small `撤回同意` link inside the card's learn-more posts `navConsent: false, nav:
  false`.

### 4.4 AI 参谋: suggested routes

The AI 参谋 may suggest a route. Specified as op `OP_ROUTE` in `docs/ui-refactor.md` appendix S7-1 T6; summary:
`OP_ROUTE { to, from?, why? }` — the row shape of the S8-4 router's `routeOp` (`docs/transit-schema.md` §3.5): `to` and
`from` 1–40 characters (absent `from` = the current place), `why` ≤ 60; at most one per response. The host passes it to
`routeOp`; S8-4b keeps the suggestions for the session (≤ 3, aged after 20 messages), delivers them in
`eden-map:ops.routes` and draws them dashed in its `route-plan` layer with a "use this route" card (K-R113). Without a
transit network nothing is drawn and the `why` text joins the AI 参谋 toast (U-12). Never written anywhere.

### 4.5 Health check

One pure host module computes the health of every card from facts the host already has (no extra API calls):
`{ id, on, state: 'working' | 'idle' | 'not-effective' | 'off', reason?, floor?, text?, tokens?, stats?, fields? }`.
`idle` (R0, U-32) = on, but nothing to report yet: no reply since the switch changed or since the page loaded; drawn
neutral with the text `等待下一次回复`, never amber. `fields` (status line only, U-07) = `{ here | present | time | trips:
'sent' | 'omitted' | 'card' }`. The reasons:

| Code | Wording (zh) | Applies to |
|---|---|---|
| `off` | 已关闭 | all |
| `no-host-api` | 这个酒馆助手版本没有所需接口（<name>） | injection, macros, JIT, crystallisation |
| `skipped` | 卡的提示词里已有这些字段，本轮跳过 | status line |
| `empty` | 还没有可注入的状态 | status line, digest, spatial |
| `no-place` | 当前地点不在任何地图上 | spatial, JIT |
| `no-book` | 附加世界书未安装或未绑定 | JIT, crystallisation |
| `no-tags` | 最近的回复里没有事实标签 | crystallisation |
| `no-checks` | 还没有发生检定 | dice |
| `no-config` | 端点配置不完整 | AI 参谋 |
| `no-consent` | 还没有同意 | AI 参谋 |
| `endpoint` | 上次请求失败（HTTP <status>） | AI 参谋 |
| `waiting` | 地图开着或正在生成时不运行 | AI 参谋 |

"Last effective floor" = the floor index of the last round in which the feature produced its effect (an injection with
text, a write, a successful run). Kept in memory for the session, recomputed from the chat on reload where it can be
(digest, status line, spatial: on the next round); never stored.

## 5. Payload

### 5.1 Host → viewer

`eden-map:th-state` (protocol `SCHEMA`, `map/core/protocol.mjs` L80) gains one optional field `health: 'object?'` =
`{ <card id>: <health row> }` with card ids `digest, state, macros, dice, ledger, spatial, wbJit, wbXtal, nav, inject`.
Texts are capped at 600 characters each; the whole payload stays under 8 KB. R0 (U-08, P6-3): `health` is sent only
while the viewer watches the AI page (`op: 'watch', ai: true`), at most one `th-state` per second; otherwise the
payload carries only `healthSum: { n, m }` (n on, m not effective) for the home summary. `prefs` gains `stateOmit`,
`spatialDepth`, `spatialBudget`, `navConsent`, `navCadence` and `navCfg` becomes `{ provider, base, model, hasKey }`
(the old boolean meaning is `hasKey`; the viewer reads both shapes).

### 5.2 Viewer → host

`eden-map:th` keeps `{ op, prefs? }`; new ops `nav-test` (with `cfg`, R0) and `watch` (`ai: boolean`, R0); new prefs keys `stateOmit` (array of `here | present | time |
trips`), `spatialDepth`, `spatialBudget`, `navConsent`, `navCadence` (`120000 | 300000 | 600000`).

## 6. Contradictory and misplaced hints (fixed by S7-1)

Rule: a label names the thing; the state lives in the switch; a hint may describe what on and off do, never what the
default is. Defaults belong in the learn-more part.

| Key | Today (zh) | Problem | New text (zh / en) |
|---|---|---|---|
| `th.dice` | …（默认关 = 只提示不判定） | "default off" next to a switch that may be on | label `Dice checks` (zh `检定掷骰`); purpose line: searches and stealth roll for real, a failure fails and is reported; off = hints only |
| `th.ledger_write` | …；默认关） | same | label `结算记录`; purpose without "默认关" |
| `th.nav` | 地图领航员（…，默认关） | same + rename N7 | label `AI 参谋` / `AI advisor`; purpose line of C9 |
| `s.keys` | …，默认关） | same | drop `，默认关` |
| `s.minimap_hint` | …（默认关） | same | drop the bracket |
| `s.inject_hint` | …；默认关。… | same | drop `默认关。` |
| `cu.sync_hint2` | 默认开：… | same | drop `默认开：` (rest unchanged) |
| `th.inj_note` | 约 150 token；…在「高级」 | fixed figure while the budget is configurable; points to a page that no longer holds them | removed: the card shows the live estimate and holds depth and budget |
| `th.inj_on` | …（地点、在场、时间、行程） | lists all four fields although some may be omitted or skipped | purpose line without the bracket; fields are the sub-options |
| `cu.night` | 按时段给上层、中层加色调… | names a pack's layers in a kernel string; sits orphaned in 数据与映射 (N10 item 11) | zh: the layer names replaced by 「地图」; en `Tint the map and switch day / night base maps by time (dawn / dusk / night)`; own row on 地图与图层 |
| `s.kbd_group` + `s.kbd` | 快捷键 (heading) and 快捷键 › 查看 (row) | 「快捷键」 listed twice in 高级 (N10 item 11); at 375 px the long `s.keys` label hides its switch (observed bug B2, `docs/ui-refactor.md` S7-2 T5) | one row: `单字母快捷键` switch with a `查看` button; the label wraps, the switch keeps its size |
| `s.tick_hint` | 面板关着时每 60 秒…缓存补齐… | internal terms (N10 item 12) | plain: while the map is closed it reads new messages so it opens faster; read only, changes nothing, sends nothing to the model |
| first-run hint (`notice-layer.mjs firstRunHint`) | 「三步上手」 with four items | count and jargon (N10 item 12) | three plain steps: tap a place for details · the drawer below shows events and people · adjust in settings (R0: P1-11, named where it is at that width: top right on desktop, inside ⋯ on phones) |
| `#build` (build code) | on 更新与版本 | internal code shown to everyone (N10 item 11) | moves to 高级 › 开发者; 更新与版本 shows `head #N · <date>` |
| `ch.from_card` | `· 设定` after a name | provenance-style suffix (N10 item 15) | removed from the UI |
| `th.nav_cfg` | …（JSON：provider / key / base / model） | asks for raw JSON in a blocking prompt | form labels provider, base URL, model, key; buttons save, test connection |
| `ch.port_hint` | …（作者 Yehehua，…） | a card name in the core dictionary (brief rule 1) | core text neutral (no name); the first pack's exact sentence moves to its manifest `strings` (same words for eden) |
| home author line | `viewer.html` L654 | card name in an engine file | rendered on 版权申明 from `credits` |

## 7. Text parity (first pack)

Injected and model-sent texts do not change in S7-1, except the AI 参谋 system prompt, which gains one line describing
`OP_ROUTE` (it goes only to the user's own endpoint). The status line, spatial contract and digest texts are
byte-identical for the same chat when no new option is used (`stateOmit` empty, `spatialDepth` 2). UI text changes for
the first pack are exactly: the group titles and summaries of §2, the moved rows of §3 (same words), the strings of §6,
the rename of §8, and the new card texts (§4). Every changed key is listed in the S7-1 RESULT.

## 8. Rename 「地图领航员」 → 「AI 参谋」 (N7)

User-facing only: `th.nav`, `nav.layer` (`领航员标注` → `AI 参谋标注`; en `Navigator marks` → `AI advisor marks`),
`nav.hint` (`领航员建议` → `AI 参谋建议`; en `AI advisor suggestion`), the host toast title (`llm-flow.mjs` L57,
`地图领航员` / `Navigator` → `AI 参谋` / `AI advisor`), the menu fallback text in `core/layer-defaults.mjs` L24. Internal
ids stay: `nav-ops`, `edenMapNav*`, `planner-gateway.mjs`, `NavOpsApi`, op names, the glossary entry "planner
(navigator)". The model-facing system prompt keeps its wording (U-10). Recorded in `docs/naming.md` Decisions by S7-1.

## 9. Out of scope

Visual styling of the settings sheet (glass, spacing, type) is in `docs/ui-refactor.md` §3.6. New AI features, new
injection channels, and any change to what the digest or status line contain are out of S7.
