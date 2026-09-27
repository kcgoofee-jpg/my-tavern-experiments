# 运行时（酒馆侧脚本）审阅 · 2026-09-27 接手

范围：`map/tavern/eden-map.js`、`map/tavern/{events,characters,adapter,trips,mvu,selfcheck,splash,picker}.mjs`、
`map/{here,chars,trips,section,varmap}.js`、`tests/*.test.mjs`（只读；`node --test` 11/11 通过）。
结论：无 P0。分层与单测质量高，内容约定（不过滤、原样显示）与隐私约定（只连自己选的 CDN，聊天内容不进 URL）经审计成立。
风险集中在宿主生命周期与生成路径上的重算。下表按严重度，状态 = 本次是否已修。

| # | 级别 | 结论 | 位置 | 状态 |
|---|---|---|---|---|
| 1 | P1 | 后台预加载（ghost）不算「用户在看」：`panel.hidden` 仍 false，`sendEvents()` 把未读水位推到最新并写 localStorage → 红角标与「打开飞向最新未读」永久失效 | `eden-map.js` `sendEvents()` | ✅ 已修（`visible = !panel.hidden && !ghost`；`floorNow < 0` 不写） |
| 2 | P1 | 页面内换版本后旧实例仍活着：`cleanup` 没摘 `eventOn`、没有 dead 标志，旧闭包继续 push/recompute/saveRoot，会用切换前的 `custom` 覆盖用户刚改的名字 | `eden-map.js` `cleanup` / `switchVersion` | ✅ 已修（`listen()` + `unlisten()` + `dead`） |
| 3 | P1 | 每次重算的代价：重取 ≤81 楼 + `computeTrips` 逐楼 `getMvuData` + 第二次 `parseChars` + 每条 2×`slice(0,4000)`；`pushMvu` 再 `refreshVarMap` 一次；`stageOrderFor` 只在成功时记忆。`GENERATION_AFTER_COMMANDS` 在发送路径上同步跑 | `eden-map.js` `recompute/computeTrips/pushMvu/stageOrderFor` | ⏳ 未修（见 README 遗留 1） |
| 4 | P2 | `sendChars` 无变化检测 + `TCChars.set()` 无签名判断 → 面板开着时覆盖层与事态横条每 4 秒重建一次 | `eden-map.js`、`map/chars.js` | ✅ 宿主侧已修（按 `charSig` 才发）；查看器侧见 viewer_ui 遗留 |
| 5 | P2 | `100dvh` 没有 `vh` 回退：不支持的引擎里 `top` 整条失效，`position: fixed` 回落到静态位置 → 按钮 / 面板可能跑到聊天末尾 | `eden-map.js` 58 / 83 / 145 / 769 | ✅ 已修 |
| 6 | P2 | 查看器不校验 `e.source`/`e.origin`，宿主一律 `targetOrigin '*'`：同源的其他脚本能改地图显示状态，宿主也会把地点 / 聊天 id / 自定义内容投给任何进到这个 iframe 的文档 | `viewer.html` 收消息处、`eden-map.js` `post` | ⏳ 未修（先确认 iframe 是否 opaque origin） |
| 7 | P2 | 裸人物标签把后面的叙述吃进地点：`⌖人物 雷恩 @ 下层·7号井，他推开铁门…` → 地点含整句；两个标签挨着写会吞掉后一个并留下「和」 | `characters.mjs` `parseChars` | ✅ 已修 + 单测 |
| 8 | P2 | `cardTexts()` 假定 `getCharData` / `getTavernRegexes` 同步；真返回 Promise 时原作头像与阶段点静默失效，而宿主桩是同步的、测不出来 | `eden-map.js` `cardTexts/portraitsFor/stageOrderFor` | ⏳ 未修 |
| 9 | P2 | `docs/map-events.md` 写了代码里没有的「处置中」三态与「处置中停止脉动」；无编号时的去重键写成「类型+地点+标题」（代码是「类型+层+地点」） | `docs/map-events.md` | ✅ 已改文档 |
| 10 | P2 | 头像额度：文档写「约 300 KB / 160 px 压缩」，代码是 160 000 字符且只在查看器路径压缩；面板关着时 `EdenMap.setAvatar` 对 200 KB 的图直接返回 false | `docs/content-compat.md`、`characters.mjs`、`eden-map.js`、`map/chars.js` | ✅ 已修（两条路径都压）+ 文档按实改 |
| 11 | P2 | 聊天变量写入失败后悄悄退回 localStorage，而 `readVars` 只读变量：UI 说保存成功、下次读回旧值，两个存储会永久分叉 | `eden-map.js` `readVars/writeVars/customChanged` | ⏳ 未修 |
| 12 | P2 | `pagehide` 进 bfcache 时也拆界面，`pageshow` 不会重建 → 悬浮按钮直到整页刷新才回来 | `eden-map.js` | ✅ 已修（`persisted` 时跳过） |
| 13 | P2 | 本地存储没有预算：头像按聊天存、键永不清理，约 30 张顶到 5 MB 共享额度，可能连带影响卡自己的状态栏写入 | `characters.mjs`、`eden-map.js` | ⏳ 未修 |
| 14 | P2 | 三处小状态机问题：`push()` 每次都把用户点开的长胶囊收回；`getChatMessages` 抛错时仍写 `seen = -1`（全场变「新」）；`SillyTavern.getContext()` 失败时键塌成共享的 `edenMapSeen:` / `edenMap:chat::custom2` | `eden-map.js` | ◐ 前两条已修（第三条未验证） |

**经审计成立的部分**：标签解析不过滤内容、未知类型归「其他」；渲染走 `textContent`/`esc`，XSS 有浏览器断言；
运行时所有 `fetch` 只指向自选 CDN 与每天一次的版本检查（`credentials:'omit'`、无 referrer），聊天内容不进 URL / 请求体 / 键名；
酒馆助手 API 全部包了 try/catch 或 `fnOk`，注入在 cleanup 里撤掉，Esc 在输入框内不生效；自检区分 ok/warn/skip 并写出修法。

**测试缺口**：未读水位 / 角标 / fly-on-open 与 ghost 预加载的配合、换版本与 cleanup、`CHAT_CHANGED` 重载、
存储失败与额度耗尽、头像宿主路径上限、`postMessage` 来源校验、无 `dvh` 环境、`parseChars` 带叙述的用例、`map/section.js` —— 全都没有测试。
