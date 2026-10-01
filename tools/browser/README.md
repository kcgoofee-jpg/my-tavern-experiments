# tools/browser：Playwright 测试公共库

查看器（`map/viewer.html`）与庄园（`map/estate/`）的浏览器测试都从这里取零件，不再每轮在 scratchpad 里重写。

## 准备
- 本地服务：`map/` 目录，端口默认按本工作树路径哈希到 5200–5999（每个 worktree 固定且互不相同），`EDEN_PORT` 可指定、`EDEN_BASE` 可指向任意地址（不校验）。`ensureServer()` 只复用 `/__root`（`tools/cors_server.py` 提供）等于本工作树 `map/` 的服务，否则自己起一个（端口被占就往后找），跑完关掉。
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
| `postEvents(frame, texts, fly)` | 用卡内脚本的 `tavern/events-parse.mjs` 解析聊天原文，推给查看器并飞过去 |
| `shot(page, dir, name)` / `reporter(dir)` | 截图；✓ / ✗ 记录与 results.json、summary.md |

新脚本放 scratchpad 或 `tools/browser/` 下，`import * as B from './lib.mjs'`，结构照 `accept.mjs`。只开一个浏览器实例，跑完 `closeAll()`。

## 拓扑下钻探针（S2-B）
```bash
node tools/browser/topo_dairy.mjs /tmp/topo_dairy [--shots 截图目录]
```
庄园农场区域卡有「进入三维」→ 进入挤奶厅（面包屑以它结尾、只有一个 WebGL 上下文）→ 上一级 / 面包屑返回并聚焦农场；双击区域同样进入；设置里没有入口、任何标记都不链到挤奶厅；再在 375 px 走一遍。等待一律用条件，不用固定延时。

## 影子对拍截图（S4-3）
```bash
node tools/browser/s43_parity.mjs --out <目录> [--only 名,名] [--skip 名,名] [--schemes dark]
node tools/browser/s43_parity.mjs --diff <前目录> <后目录> [--out <差异目录>]
```
桌面 1440×900：`REG.maps` 每张图的深 / 浅色截图，加世界图上猎季营地的卡、设置「更新」「版权」页、图例面板、花屏中、色觉 rg 下的事态列表。动画与加载状态文字冻结。`--diff` 在页面画布里逐像素比（亮度差 > 12），每张一行 `名 changed=<n> (<百分比>)`，有差异的写差异 PNG 和 `parity.json`。同一棵树跑两遍量噪声（云、花屏）。

## 图层对拍（S8-1）
```bash
node tools/browser/layer_dump.mjs <输出.json> [--pack eden|town]
node tools/browser/layer_dump.mjs --diff <前.json> <后.json>
```
桌面 1440×900：每个包（缺省先第一个包再 `?pack=town`）的 `LayerHostApi.describe()`、图层菜单每一行（id、勾选框 id、文字、勾选、隐藏）与 `.vpslot` 槽位；`--diff` 忽略新增的 `describe.declared` 字段，有差异退出码 1。

## 文字对拍（S4-4）
```bash
node tools/browser/text_dump.mjs --out <目录> [--pack eden|town] [--lang zh|en] [--only dict]
node tools/browser/text_dump.mjs --diff <前目录> <后目录>
node tools/browser/text_dump.mjs --grep <目录> [--terms 词,词]
```
桌面 1440×900、不要宿主：每张图、抽屉各页签、设置各页（<details> 全展开）、事态（含花屏）、人物页（带名册）、人物卡、自定义名称、未上图、反馈报告，以及整本词典（经 `I18N.t` 读，含包文案），各写一份 JSON（`innerText`、标题、所有 `aria-label` / `title` / `placeholder` / `alt`、`data-i18n*` 元素）。`--diff` 逐状态列出增减的行（词典里新增的键单列，不算改动）；`--grep` 列出含卡词的状态（默认用看门狗词表，town 包应为 0）。
