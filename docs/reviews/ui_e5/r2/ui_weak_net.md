# E5 第 2 轮 · 弱网与低端机审阅

被测：分支 `cloud/tc-mid-low`，工作区 HEAD 3f9ba38（map/* 无未提交改动）。人设：国内网络、没梯子、千元安卓机。
脚本、原始 JSON、截图都在 scratchpad `e5/rev2/work/weak/`（a_cold / b_tokens / c_embed / c3_estfail / d_mem_fail）。

## 1. 环境
- Playwright 1.63，Chromium（桌面 1440×900；「phone」预设 375×812、DPR 3、Android UA）。WebKit 不能用 CDP 节流，本轮没测。
- 节流：CDP Slow 3G（2000 ms、50 KB/s）和 Fast 3G（562.5 ms、180 KB/s，上行 84 KB/s），CPU 都是 ×4。每次都是新上下文，也就是空缓存。
- 服务：本地 `tools/cors_server.py` 5178，不压缩。
- 故障模拟：用 `page.route` 对 `ui/tokens.css` 做 hang / abort / 404，对 `art/(world|borders)_files/` 做 abort。
- 嵌入：宿主页里放 iframe，模拟卡内脚本的做法：收到 `eden-map:ready` 后隔 0 或 1500 ms 推 `eden-map:here`（可带 `bg`）。
- **后台 Blender**：测试后段看到 `tiancheng_upper.py` 在渲 8K 局部（`--res 8000 --samples 24`），开始时间不明。所以 C / D 两组的绝对计时可能偏慢，字节数和计数不受影响。
- 都是用 lockrun 串行跑的，同一时间只有一个浏览器。

## 2. 总分 **7.5 / 10**（门槛是 ≥ 8，**不过**；没有 P0）

| 分项 | 分数 | 理由 |
|---|---|---|
| 首屏速度与流量 | 7.5 | Fast 3G：FCP 1.28 s，首瓦片 5.6–6.1 s，遮罩撤掉时 720 KB / 21 请求。Slow 3G：首瓦片 19.7 s（E4 是 37 s）。扣分：新增的 tokens.css 会阻塞渲染，还把预加载推迟了一个往返（W3）；here.mjs 串行（W6） |
| 线路容错 | 6 | 瓦片线路断了会报「已加载」且不能自救（W1）。tokens.css 单点：挂起就一直白屏，404 就版面散掉（W2） |
| 进度诚实 | 6.5 | 正常路径是诚实的，没有提前报 100%。失败路径会报 100%「✓ 已加载」（W1）。庄园慢加载会被误报成「连不上三维库」（W4） |
| 省流 / 预加载（含 R10） | 9 | 3G 下 lean = true，后台只取 JSON 和 estate/index.html。**R10 已修**：地点在庄园时世界瓦片 0 张（E4b 是 387 KB）；bg 预加载落到上层，不进庄园，世界瓦片也是 0 |
| 内存与泄漏 | 9.5 | 上 → 中 → 下 → 世界 ×15 轮：DOM 节点 387 → 421 → 421 → 421，监听 379 → 391 → 391 → 391，GC 后堆 2.5 → 3.7 → 3.7 MB，都持平 |

## 3. 问题表

| 编号 | 级别 | 现象 | 复现步骤 | 证据 / 截图 | 归属 | 旧编号 |
|---|---|---|---|---|---|---|
| W1 | **P1** | **瓦片线路断了，却报「已加载」，也不能自救**。① 地图全黑，只剩标签。② 工具栏显示「✓ 已加载」，遮罩文字是「加载 世界 100%」。③ 遮罩和缩略图都撤掉了。④ 「卡住·点此重试」从不出现（busy = 0）。⑤ 线路恢复 13 s 后仍然全黑，只有 ⌂ / 缩放能触发重取。根因：`initProgress` 里 `tile-load-failed` 也按 `done++` 计，全部失败时 pct = 100，照样 `post('eden-map:loaded')`，卡内的进度环也会画满 | Fast 3G + CPU×4；`route(/art\/(world\|borders)_files\//, abort)`；独立打开 viewer.html，看 8 / 16 / 30 s；然后解除拦截，再等 13 s | `d_fail_8s.png`、`d_fail_recovered.png`；`d_mem_fail_both.json` 的 fail 段 | 本机查看器 | N05 同类，没覆盖到失败路径（旧代码 7485b59:768 就这样，**不是 E5 回归**） |
| W2 | P2 **新** | **`ui/tokens.css` 是会阻塞渲染的单点**。hang 时独立页 88 s 都没有首帧，DOMContentLoaded 不触发，截图超时。嵌入时卡内看门狗 20 s 后给出「重试 / 换线路」，算有出路。abort / 404 时没有任何回退令牌：顶栏变白底，缩放组散到左侧，国界线变成粗米色，「✓ 已加载」挤在顶栏里 | 无节流、CPU×4；分别对 `**/ui/tokens.css` 做 hang / abort / 404，打开 viewer.html | `b_tokens.json`、`b_tokens_abort_end.png` | E5 统一重构 | — |
| W3 | P2 **新** | **tokens.css 推迟了关键预加载**。`<link rel=stylesheet>` 在 head 的内联脚本之前，内联脚本要等样式表下完才执行，所以它创建的 world_1k.jpg、world.dzi、borders.dzi 预加载和 i18n 请求晚了一个往返：Fast 3G 从 585 推到 1241 ms，Slow 3G 从 2082 推到 4429 ms。Slow 3G 下缩略图 12.2 s 才下完，10 s 截图里只画出上半张。建议把内联脚本挪到 link 之前，或者直接内联 4.4 KB 的令牌（同时解决 W2） | 冷启动 Slow / Fast 3G，看 Resource Timing | `a_fast3g_desktop_def.json`、`a_slow3g_desktop_def.json`、`a_slow3g_desktop_def_10s.png` | E5 统一重构 | — |
| W4 | P2 | **庄园慢加载被误报为失败**。时间线：卡内脚本推地点时间 +1.5 s → 5.8 s 开始加载庄园 → 15.0 s 庄园页自己超时，发 `estate:fail` reason = timeout → 查看器显示「庄园三维模型加载失败：当前网络连不上三维库」（原因写错了）→ 19.4 s `estate:ready`，自动切进庄园。另一次地点立即到达，10.4 s 就 ready，没报失败，所以这个问题是偶发的。建议：reason = timeout 时走 `estateActs('slow')` 的文案 | Fast 3G + CPU×4，嵌入，1.5 s 后推 `主卧` | `c3_estfail_d1500.json`、`c3_d1500_14s.png` | 查看器文案（本机）；超时阈值在庄园页（云端 / 冻结） | N01 相关 |
| W5 | P3 | R10 残留：卡内脚本晚于 0.6 s 才推地点时（模拟 1.5 s），仍然先下世界瓦片 32 张 / 646 KB，再跳庄园。实际卡内脚本在 `ready` 时同步推 `here`，一般碰不到这种情况 | 同上 | `c_embed_fast3g_estate_now+estate_bg+estate_late1500.json` | 本机 | R10 |
| W6 | P2 | 启动链串行：`here.mjs` 和 `i18n/en.json` 要等 OSD 执行之后（main）才请求，Slow 3G 下是 15.2 → 17.5 s，首瓦片多等约 2.3 s。中文界面下也会取 en.json（8.9 KB）。可以用 `modulepreload` 或 `<link rel=preload>` 提前 | 冷启动 Slow 3G | `a_slow3g_desktop_def.json` | 本机 | — |
| W7 | P3 | Slow 3G 下 4.4–15 s 之间只有「加载中…」，没有百分比也没有慢网提示。工具栏里两个图标按钮和左侧是空方块，因为 SVG 要等 JS 注入 | 冷启动 Slow 3G，看 4 s / 10 s 截图 | `a_slow3g_desktop_def_4s.png`、`_10s.png` | 本机 | E4b P3「JS 到达前顶栏」 |

## 已确认修好
- ✅ **R10**。嵌入时地点是「主卧」且立即推送：世界瓦片 0 张，直接取 estate/index.html 和 vendor/three。
  - 用 `bg:true` 推送：落到上层 `tc_upper`，没进庄园，世界瓦片也是 0 张。
  - 不推地点：0.6 s 后进世界（ready 4268 → 请求 dzi 4872 ms）。
  - 推空地点：立即进世界。
- ✅ N02 省流：3G 下 `lean()` 为 true。手机 Fast 3G 首屏之后的 10 s 里，只多了本图的细化瓦片、3 个 JSON 和 estate/index.html（19 KB）。
- ✅ N05 正常路径：没有提前报 100%。✅ N07：Slow 3G 下 4.4 s 就有缩略图遮罩（以 FCP 为准）。✅ N11 内存持平。
- ✅ E5 没有引入外部字体或图片：图标是内联 SVG / data URI，tokens.css 里没有 url()。

## 4. 一句话结论
E5 在弱网上基本守住了，R10 修得干净，省流和内存都很好。但新加的 tokens.css 成了会阻塞渲染、又没有回退的单点，还把缩略图预加载推迟了一个往返。另外还有一个旧问题：瓦片线路断了会报「✓ 已加载」，而且没有重试。这两件事让本轮只有 **7.5 / 10，不过门槛**。修法都不大：内联令牌或调整 head 里的顺序；失败瓦片单独计数，全部失败时给出重试。
