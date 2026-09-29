# E5 第 3 轮 · 弱网与低端机审阅

被测：分支 `cloud/tc-mid-low`，HEAD dbc928b。人设：国内网络、没梯子、千元安卓机。
脚本、原始 JSON、截图都在 scratchpad `e5/rev3/work/weak/`：
- `a_cold.mjs`：冷启动。
- `d_fail.mjs`：瓦片线路断开。
- `c4_est.mjs`：庄园慢加载，以及三维库断开。
- `c_embed.mjs`：R10。
- `d_mem_fail.mjs mem`、`e_estloop.mjs`：内存。

复现方法和第 2 轮相同，脚本是从 rev2 复制过来的，只加了并发计数和按钮可见性检查。

## 1. 环境
- 浏览器：Playwright 1.63 + Chromium，桌面 1440×900；「phone」预设 375×812、DPR 3、Android UA。WebKit 不支持 CDP 节流，本轮没测。
- 节流：CDP Slow 3G（2000 ms、50 KB/s）和 Fast 3G（562.5 ms、180 KB/s，上行 84 KB/s），CPU 都是 ×4。每次都用新上下文，也就是空缓存。
- 服务：本地 `tools/cors_server.py` 5178，不压缩。
- 故障注入：`page.route` 对 `art/(world|borders)_files/` 做 abort，对 `estate/vendor/three*` 做 abort。
- 嵌入：用宿主页里的 iframe 模拟卡内脚本：收到 `eden-map:ready` 后隔 0 或 1500 ms 推 `eden-map:here`，同时记录所有 `eden-map:*` 消息。
- **Blender**：有一个 GUI 进程（pid 17831），CPU 0.8%，处于空闲，没有在渲染。本轮计时不受影响。
- 所有浏览器都用 lockrun 串行跑，同一时间只有一个。

## 2. 总分 **7.5 / 10**（门槛 ≥ 8，**不过**；没有 P0，但有 1 个**新的 P1 回归**，见 W8）

上轮的 4 个主要问题（W1–W4）全部修好，弱网表现明显提升。本轮修 W4 时，庄园「真失败」的处理代码被误并进了行尾注释，造成新回归 W8；另外遮罩上多出两个点了没反应的按钮（W9）。这两处都是一两行就能修好的问题。修掉之后本项估计能到 8.5。

| 分项 | 分数 | 理由 |
|---|---|---|
| 首屏速度与流量 | 8.5 | Fast 3G：FCP 0.80 s（r2 是 1.28 s），预加载从 588 ms 开始（r2 是 1241 ms），首瓦片 5.5 s，遮罩撤掉时 727 KB / 20 请求。Slow 3G：FCP 2.85 s（r2 4.4 s），预加载从 2.1 s 开始（r2 4.4 s），首瓦片 19.5 s。扣分项：中文界面下 `en.json` 仍要等 DCL 之后才串行请求（W6 余项） |
| 线路容错 | 7 | 瓦片线路全断时，能给出重试，并能按原视野恢复（W1 ✅）；令牌单点已消除（W2 ✅）。但庄园三维库或脚本真失败时，失败信号被丢掉了（W8）：先黑屏 12 s，之后也不会记住这次失败 |
| 进度诚实 | 7 | 瓦片失败不再报 100%「✓ 已加载」，也不再向宿主发 `loaded`（✅）。庄园超时现在显示「较慢」（W4 ✅）。扣分：三维库真断时显示「较慢…可以继续等」，其实永远等不到（W8）；遮罩上出现 3 个按钮，其中 2 个是死按钮（W9） |
| 省流 / 预加载 | 9 | 3G 下 lean = true；R10 保持：立即推「主卧」和 bg 推送两种情况，世界瓦片都是 0。手机上 `imageLoaderLimit` = 6，实测瓦片最大并发正好 6 |
| 内存与泄漏 | 9.5 | 上 → 中 → 下 → 世界 ×15 轮：节点 394 → 428 → 428 → 428，监听 385 → 397 → 397，GC 后堆 2.5 → 3.7 MB，都持平。庄园（blob iframe）进出 ×8：第 4 轮和第 8 轮之间 docs 都是 2，iframe 不残留，节点 1021 → 1041，堆 12.6 → 13.9 MB，基本持平 |

### 关键数字（冷启动，CPU×4）
| 场景 | FCP | 关键预加载开始 | 缩略图下完 | 首瓦片 | 遮罩撤掉 | 撤掉时的字节 / 请求 |
|---|---|---|---|---|---|---|
| 桌面 Fast 3G | 800 ms | 588 ms | 3289 ms | 5503 ms | 6279 ms | 727 KB / 20 |
| 手机 Fast 3G | 844 ms | 610 ms | 3342 ms | 6238 ms | 6664 ms | 732 KB / 19 |
| 桌面 Slow 3G | 2852 ms | 2098 ms | 11775 ms | 19514 ms | 21328 ms | 646 KB / 17 |

- 全程没有 `ui/tokens.css` 请求，令牌已内联进 viewer.html（viewer.html 117 KB）。
- `here.mjs` 和其他预加载同时开始：Fast 3G 下是 611 ms，r2 要等 OSD 执行完。

## 3. 问题表

| 编号 | 级别 | 现象 | 复现步骤 | 证据 / 截图 | 归属 | 旧编号 |
|---|---|---|---|---|---|---|
| W8 | **P1 新（回归）** | **庄园真失败被吞掉**。`map/viewer.html:808` 这一行是 `if (reason === 'timeout') return estateActs('slow');   // …（E5 r2 弱网 W4） est.failed = true; setEstFail(true); estateActs('fail');`，原来的失败处理被并进了行尾注释，reason 为 script / import / 报错信息时什么都不做。<br>实测：0.26 s 就收到 `estate:fail`（script），但被忽略。之后黑屏 12 s，只有「加载 伊甸庄园…」；12.2 s 起显示「庄园三维模型加载**较慢**…可以继续等」，其实永远不会好。`estFail` 一直是 false，不写 sessionStorage，所以之后再推庄园地点仍会进 3D，每次再等 12 s。宿主也永远收不到 `eden-map:loaded`。<br>r2 的行为是 0.3 s 内报失败，并记住这次失败。低端机没有 WebGL、主脚本报错时，也会走这条路径。 | 无网络节流、CPU×4；`route(/estate\/vendor\/three/, abort)`；嵌入后立即推「主卧」；看 9 / 14 / 30 s；再推「书房」 | `c4_three.json`（em：`[260,"estate:fail","script"]`，estFail 一直为 false；second.cur = eden_estate）、`c4_three_9s.png`、`c4_three_14s.png`、`c4_three_second.png` | 本机查看器 | W4 修复引入 |
| W9 | P2 新 | **遮罩上的 `hidden` 按钮不隐藏**。`.btn { display: inline-flex }`（viewer.html:119）覆盖了 UA 的 `[hidden]{display:none}`，而 `#loading .acts` 里只有容器有 `[hidden]` 规则。<br>瓦片全断时显示「**重试**（金色主按钮，实际是 estRetry，在世界图上直接 return，点了没反应）/ 看平面图（`estateStandIn('world')` 返回 null，也没反应）/ 重试（真正有用的 tileRetry）」。<br>庄园慢加载时也多出第 3 个「重试」（tileRetry），实测宽 52 px、display: flex。<br>修法：加一条 `#loading .acts button[hidden]{display:none}` | ① 瓦片线路 abort，Fast 3G，8 s 截图；② 庄园慢加载，14 s 截图 | `d_both_16s.png`、`c4_three_14s.png`；`c4_three.json` 的 btns 字段 | 本机查看器 | 新 |
| W6′ | P3 | here.mjs 已修；`i18n/en.json` 仍在 main() 里、DCL 之后才串行请求。中文界面也要取（8.9 KB，给地名英文索引用）。Slow 3G 下是 15.07 → 17.25 s，main 往后推约 2.2 s；Fast 3G 下约 0.6 s。可以在 head 的内联脚本里与 `__i18n` 一起预取 | 冷启动 Slow 3G，看 Resource Timing | `a_slow3g_desktop_def.json`（res.i18n/en.json） | 本机 | W6 |
| W5 | P3 | 没变：卡内脚本晚于约 0.6 s 才推地点时（模拟 1.5 s），会先下世界瓦片 32 张 / 646 KB，并先向宿主发一次 `eden-map:loaded`，这时庄园还要 12 s 才好。卡内的进度环会提前画满 | Fast 3G，嵌入，1.5 s 后推「主卧」 | `c_embed_fast3g_estate_now+estate_bg+estate_late1500.json`、`c4_slow.json`（hostMsgs） | 本机 | R10 / W5 |
| W7 | P3 | 没变：Slow 3G 下 4–15 s 之间只有「加载中…」，没有百分比。工具栏的图标按钮和左侧是空方块，要等 JS 注入 SVG | 冷启动 Slow 3G，看 10 s 截图 | `a_slow3g_desktop_def_10s.png` | 本机 | E4b P3 |
| W10 | P3 | 瓦片失败文案是「…或在标题栏换一条线路」。独立打开查看器时没有标题栏线路切换，只有嵌在卡里才有 | 独立打开 viewer.html，瓦片线路 abort | `d_both_16s.png` | 本机文案 | 新 |

## 已确认修好
- ✅ **W1**：瓦片线路全断时的表现：
  - 8 / 16 / 30 s 都显示「地图图块加载失败：当前线路连不上。可以重试，或在标题栏换一条线路」。遮罩（缩略图）保留，顶栏显示「卡住了？点此重试」。宿主一直收不到 `progress` / `loaded`。
  - 线路还断着时点重试：请求 64 → 128，再次干净地失败，没有误报。
  - 恢复后点重试：12 s 内加载完成，发出 `eden-map:loaded`，视野 bounds 和重试前完全一致（[0.436, 0.092, 0.333]）。
  - 证据：`d_fail_both.json`、`d_both_recovered.png`。
- ✅ **W2 / W3**：`tokens.css` 不再请求，令牌已内联。关键预加载提前了一个往返：Fast 3G 从 1241 提前到 588 ms，Slow 3G 从 4429 提前到 2098 ms。hang / abort / 404 这类故障已无从发生。
- ✅ **W4**：Fast 3G 下 1.5 s 后推「主卧」：14.76 s 收到 `estate:fail timeout`，显示「较慢…可以继续等，或先看平面图」；18.63 s ready 后自动进庄园，不再说「连不上三维库」。证据：`c4_slow.json`、`c4_slow_20s.png`。
- ✅ **W6（here.mjs 部分）**：modulepreload 生效，here.mjs 和其他预加载同时开始。
- ✅ **imageLoaderLimit**：手机预设实测瓦片最大并发为 6；桌面仍是 16。
- ✅ R10 保持，庄园 blob iframe 在 Chromium 下能正常进入（`estateOn = true`）。进出 ×8 没有 iframe 残留。

## 4. 一句话结论
上轮扣分的四项（瓦片失败假报已加载、令牌单点、预加载推迟、庄园超时误报）都修好了，弱网首屏快了一个往返，失败路径也能自救。但修 W4 时把庄园「真失败」的处理代码误并进了注释（W8，新 P1 回归），三维库或脚本真失败时会黑屏 12 s，再报「较慢，请继续等」；加上遮罩上多了两个死按钮（W9）。所以本轮是 **7.5 / 10，不过门槛**。这两处各是一行的修复，修完后应能到 8.5。
