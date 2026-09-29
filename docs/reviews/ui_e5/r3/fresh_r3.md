# E5 第 3 轮 · 现编审阅：TT iPhone 旧机玩家

**人设**：在 iPhone 上用 Tauri Tavern（tauri:// WKWebView）玩卡的玩家，4 GB 内存旧款 iPhone，常在庄园页和地图间来回切，电量焦虑、对发热敏感。
**为什么选他**：本轮 diff 最大风险点是 TT 真机实测带来的改动——庄园 iframe 从 srcdoc 改成 blob: URL（`map/viewer.html` openEstate）、触屏 / 低内存关 backdrop-filter、OSD imageLoaderLimit 降到 6（`coarse`）、令牌内联（`tools/sync_tokens.py`）、`eden-map.js` 幂等重注入与 fly 只在打开时。第 2 轮现编（安卓 TT，414 宽）不看 WebKit 的 blob iframe、低内存与重复注入。

## 环境
- HEAD `dbc928b`（工作区另有 blender / 数据改动，不涉及查看器），本地服务 `localhost:5178`。
- Playwright WebKit，`tools/browser/lib.mjs` 的 `iphone` 预设（iPhone 13 配置，375×812，DPR 3，触屏）；低内存用 init 脚本 `Object.defineProperty(navigator,'deviceMemory',{value:2})`。
- 每次都走 `lockrun.sh`（单浏览器），脚本与产出：`scratchpad/e5/rev3/work/fresh/`（`a_estate.mjs` → `out_a/`、`b_tokens.mjs` → `out_b/`、`c_host.mjs` → `out_c/`）。
- WebKit 没有 CDP 网络节流，弱网首帧只能做无节流对照；庄园（map/estate/*）冻结，不计分。

## 检查点结果

### 1. 庄园进出 10 次（低内存，WebKit）
| 次 | estate:ready | 进入耗时 ms | #estate src | 离开后 iframe 数 | DOM 节点 |
|---|---|---|---|---|---|
| 1 | ✓ | 1121（冷） | blob:http: | 0 | 249 |
| 2–10 | 全 ✓ | 269 / 283 / 277 / 292 / 284 / 286 / 269 / 285 / 322 | 全 blob: | 全 0 | 全 249 |

控制台 / 页面错误 / ≥400 响应：0。离开后没有残留 iframe，节点数不涨。与自查的 326 ms 一致。

### 2. 低内存
- `html.lowmem` ✓，`(pointer: coarse)` 也命中。
- `#layers / #card / #evbar`：backdrop-filter 与 -webkit-backdrop-filter 均为 `none`，背景实底 `rgb(21,27,32)` ✓。
- OSD `imageLoaderLimit = 6`、`imageLoader.jobLimit = 6`、`maxImageCacheCount = 30` ✓。
- 切层 10 轮（上→中→下→上 ×10）：DOM 节点恒为 249，overlay 11、world item 1 恒定；window / document / MediaQueryList 上的监听净增 **0**（庄园 3 进出 + 切层 12 次后做差分）。全部 EventTarget 的净增每轮 +23，只来自随元素一起回收的节点（OSD 瓦片、iframe load），不算泄漏。

### 3. 宿主页重复注入 eden-map.js（test-host.html，375 宽）
- 初次 + 再注入 2 次（`eden-map.js?n=2/3`）：`#eden-map-root` / `.em-fab` / `.em-panel` / `.em-frame` 计数都是 **1 / 1 / 1 / 1** ✓。
- 输入框 `#loc` 聚焦按 Esc：面板**不关** ✓；焦点在 body 按 Esc：关闭 ✓。
- 面板全屏 375×812，关闭按钮 44×44 位于 (329–373, 0–44)，`elementFromPoint` 命中关闭按钮，触屏点按后面板关闭 ✓；超长地点时关闭按钮右缘 373、标题栏 scrollWidth 375，不出屏 ✓（截图 `out_c/host_open_375.png`、`host_longhere.png`）。
- 地点更新后标题栏显示「当前地点：卧室」，错误 0。

### 4. 令牌内联
- `style#tokens` 存在，`link[href*=tokens]` 为 0；normal / abort / hang 三种情况下 `ui/tokens.css` 的请求数都是 **0**，页面一致（顶栏 `rgba(21,27,32,.92)`、缩放组位置相同，截图 `out_b/tokens_{normal,abort,hang}.png`）。
- 首帧（#loading done）：normal 476 ms / abort 479 / hang 423；world.dzi、borders.dzi、world_1k.jpg、i18n 的预加载在 10–19 ms 发出。第 2 轮 W2（abort 散架、hang 88 s 无首帧）与 W3（预加载被样式表推迟一个往返）不再复现；无节流下无法给出 Fast/Slow 3G 数字对比。

## 问题（≤ 5）

| # | 级别 | 位置 | 现象 | 修法 | 证据 |
|---|---|---|---|---|---|
| 1 | **P2（本轮回归）** | `map/viewer.html:806–809` `onEstateFail` | 本轮给 timeout 分支加的行尾注释把后面的 `est.failed = true; setEstFail(true); estateActs('fail');` 一并注释掉了：三维库真的加载失败时什么都不做。实测 abort `estate/vendor/**`：查看器收到 `estate:fail`（reason `script`），5 s 时仍是「加载 伊甸庄园…」、无按钮；12 s 后才出「加载较慢…可以继续等」——把硬失败说成慢，且会话里不记失败，下次「跳到当前地点」还会再进庄园再等 12 s。TT 弱网 / 被墙时正好是这条路 | 把三句移到注释之前的独立一行；smoke 加一条「abort vendor → 3 s 内出现失败文案」 | `out_b/b.json` failMsgs；`out_a/a.json` fail（3 s / 10 s / 15 s 快照）；`out_a/estate_fail_15s.png` |
| 2 | P2 | `map/viewer.html:119` `.btn{display:inline-flex}` 覆盖 `[hidden]`；`#loading .acts` | `#tileRetry` 带 `hidden` 却显示：庄园慢 / 失败时出现「重试 · 看平面图 · 重试」两个重试；反过来瓦片失败时 `#estRetry / #estPlan` 设了 hidden 也藏不住，地图页会出现「看平面图」 | 加 `.btn[hidden]{display:none}`（或全局 `[hidden]{display:none!important}`） | `out_a/estate_fail_15s.png`（裁图 `crop_fail.png`） |
| 3 | P2 | `#loading.over .acts button`（非首个按钮） | 「看平面图」是透明底 + 浅字，浮在上层浅色云海上几乎看不见（对比度远低于 3:1）；这是庄园挂起时唯一的「离开」出路 | 次按钮给实底 `var(--surface)` + 描边，或把按钮放进与文案同一张实底卡片 | 同上截图 |
| 4 | P3 | `map/tavern/eden-map.js:405–410, 416` cleanup | 幂等清理只拆 DOM、window message、keydown；`eventOn` 注册的酒馆事件不注销。同一脚本环境里重注入 3 次后，旧闭包仍在每次变量更新 / 生成前跑 `push()`、`recompute()`、`inject()`（同 ID，结果无害但工作量 ×N，且脚本关闭后旧闭包可能把已撤掉的提示词再注入回去）。真实 TT 里脚本 iframe 重建时一般会随之清掉，风险低 | cleanup 里用 `eventRemoveListener`（助手有则调用），或闭包内置 `alive` 标志，已清理的实例直接 return | 代码阅读；mock 的 `handlers` 数组只增不减 |

## 分数：**8.0 / 10**

本人设关心的四件事（blob 庄园反复进出稳定且无残留、低内存实底 + 并发 6、重复注入只留一套、令牌断开不散架）全部实测通过，进入 ~280 ms、节点与全局监听零增长，旧 iPhone 上发热与内存风险明显低于上轮。扣分都在「失败路径」：本轮一行注释让庄园硬失败退化成 12 s 后的「较慢」，而那一屏的按钮还重复且出路按钮几乎看不见。没有 P0 / P1。

**结论**：通过门控（8.0，无 P0）；建议发版前顺手修 #1（一行）与 #2（一行 CSS），#3 同批处理。
