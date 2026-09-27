# tools/browser：Playwright 测试公共库

查看器（`map/viewer.html`）与庄园（`map/estate/`）的浏览器测试都从这里取零件，不再每轮在 scratchpad 里重写。

## 准备
- 本地服务：`http://localhost:5178/`（`map/` 目录，`python3 tools/cors_server.py 5178 map`，或 `.claude/launch.json` 的 `map`）。`ensureServer()` 发现没在跑会自己起一个，跑完关掉。
- Playwright：`cd tools/browser && npm install`，浏览器 `npx playwright install chromium webkit`。没装时会自动找 `~/.npm/_npx/*/node_modules/playwright`，也可设 `PLAYWRIGHT_DIR`。
- 安静期：每个脚本开头调 `quietWait()`（即 `tools/quiet_wait.sh`），用户用 `bash tools/quiet.sh <分钟>` 占住机器时会先等。
- 后台有 Blender 在渲时，WebGL 与计时会偏慢；`reporter` 会在结果里记下「Blender 在渲」。`GPU=1` 用本机 Chrome + Metal。

## 示例：E2 验收
```bash
node tools/browser/accept.mjs /tmp/accept            # 全部检查，约 2–3 分钟
node tools/browser/accept.mjs /tmp/accept --only first,fly,estate
```
检查项：`first` 省流首屏 ≤ 3 s（`FIRST_MS` 可改）、`wheel` 查看器滚轮以光标为中心、`layers` 点层按钮切层、`cloud` 上层「显示下方城市」开关、`fly` 事态飞行（上层 → 下层 7 号井并开卡片）、`dead` 死区探针、`estate` 庄园进入 / 滚轮 / 离开 + 独立页 draw calls、`matrix` 中 / EN × 深 / 浅截图、`phone` Chromium 375 与 WebKit iPhone 首屏 + 死区、`embed` 嵌入时宿主页不滚。
产出 `results.json`（含指标）、`summary.md`、截图；有 ✗ 时退出码 1。

## 零件（`lib.mjs`）
| 函数 | 用途 |
|---|---|
| `quietWait()` / `ensureServer()` / `closeAll()` | 安静期、本地服务、关浏览器 |
| `newPage(preset, {lang, scheme, tier, init})` | preset：`desktop` 1440×900、`phone` Chromium 375×812 触屏、`iphone` WebKit iPhone 13 视口 375×812；返回 `{page, ctx, net, errors}` |
| `track(page)` | 请求数、传输字节、第一张瓦片时间（`net.mark()` 清零重计） |
| `openViewer(P, {map, here})` | 打开查看器，返回遮罩消失时间、首瓦片时间、字节 |
| `goMap(page, id)` / `viewerState(page)` | 切图并等第一张瓦片画出；当前图、底图、卡片、层按钮状态 |
| `wheelDriftViewer(page, x, y)` | 查看器滚轮缩放后光标下的点漂移了多少像素 |
| `openEstate(P)` / `estateFrame(page)` / `estateStats(frame)` / `wheelDriftEstate(page, x, y, frame)` | 庄园独立页第一帧、嵌入的庄园 iframe、draw calls（`?stats=1`）、庄园滚轮漂移 |
| `deadZones(frame, {step})` | 网格 `elementFromPoint`：挡在画面上却不可交互的元素（如透明遮罩文字） |
| `openInHost(P, src)` / `parentScrollY(page, x, y)` | 高且可滚的宿主页里嵌 iframe；在 iframe 上滚轮后宿主页 scrollY |
| `postEvents(frame, texts, fly)` | 用卡内脚本的 `events.mjs` 解析聊天原文，推给查看器并飞过去 |
| `shot(page, dir, name)` / `reporter(dir)` | 截图；✓ / ✗ 记录与 results.json、summary.md |

新脚本放 scratchpad 或 `tools/browser/` 下，`import * as B from './lib.mjs'`，结构照 `accept.mjs`。只开一个浏览器实例，跑完 `closeAll()`。
