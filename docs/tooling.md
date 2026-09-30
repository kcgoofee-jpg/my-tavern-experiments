# 流程工具（2026-09-27，流程改进 1–7）

| # | 工具 | 一句话 |
|---|---|---|
| 1 | `tools/crops.sh`，层脚本 `--crops` / `--crops-json` | 一次 Blender 会话渲多块局部 |
| 2 | `tools/review/` | 人设审阅模板 + 每轮现编人设 + 架构师汇总 + 简报打包 |
| 3 | `tools/smoke.sh` | 几秒钟的冒烟检查 |
| 4 | `tools/browser/` | Playwright 公共库 + E2 验收脚本 |
| 5 | `tools/ship.sh` | smoke → 推送 → 预热 CDN → 跟随分支预览脚本 |
| 6 | `.gitattributes` | `NOTES_FROM_LOCAL.md` 用 union 合并 |
| 7 | `tools/quiet.sh` / `tools/quiet_wait.sh` | 安静期锁：渲染和浏览器测试先等 |

## 1. 多块局部（一次建场景）
```bash
bash tools/crops.sh mid 8000 /tmp/c seam=0.2,0.6,0.5,0.8 core=0.55,0.1,0.8,0.3
SAMPLES=8 bash tools/crops.sh low 1000 /tmp/c a=0,0,0.2,0.2 b=0.6,0.8,0.8,1 -- --ambient .1
```
- 坐标是整张图的归一化 `x0,y0,x1,y1`（左上原点）。输出 `<目录>/<层>_<名字>.png`，日志 `<目录>/<层>_crops.log`。
- 场景只建一次（中 / 下层建场景约 10–60 秒），每块只改渲染边框和输出路径。
- 脚本逐个校验区域格式与范围，参数全部加引号，渲完核对每张 PNG 的像素尺寸。以前手写的 shell 函数把 `--crop` 拆坏过，结果渲了整张 8000×5000。
- 已有 Blender 在后台渲时拒绝启动（`ALLOW_PARALLEL=1` 强制）；开渲前等安静期。
- 直接调层脚本也行：`-- --crops "x0,y0,x1,y1:名字;..."` 或 `--crops-json 文件`，可选 `--out-dir`（默认 `--out` 所在目录）。
  - JSON 可以写成 `[{"name":"seam","box":[...]}]`，也可以写成 `{"seam":[...]}`。
  - 旧的单块 `--crop` 不变，两者不能同时给。
  - 实现在 `blender/tc_common.py`：`parse_crops` / `set_crop` / `Layer.finish`，所有用 `Layer` 的层都支持。

## 2. 审阅（`tools/review/README.md`）
- `pack.py --stage city|upper|clouds|render8k|estate|ui` 生成：
  - 简报：图片尺寸、提交与 diff、GOAL 未完成项、用户原话、NOTES 最后两节、门控阈值。
  - 各人设的提示词，已填好路径。
- 固定人设：美术 5、UI 5、庄园 4。
- **每轮必须再加一位现编人设**（`fresh_persona.md`）：
  - 由本轮 diff、NOTES 和用户的最新要求推出来，每轮都不同。
  - 写明为什么选他，检查点必须落在本轮的改动上。
  - 分数和固定人设同等计入门控。
- 最后由架构师汇总（`architect_synthesis.md`）。全部用 Opus。

## 3. 冒烟检查
```bash
bash tools/smoke.sh                # check_maps、node --test tests/、viewer.html 内联脚本与 map 脚本 node --check、JSON 解析
bash tools/smoke.sh --cdn <提交>    # 另外 HEAD 一组 jsDelivr 地址（入口文件 + 随机 12 张瓦片），要求全 200
```
- 任何一项失败，退出码为 1。
- 失败时只显示那一项的最后 15 行输出。

## 4. 浏览器测试（`tools/browser/README.md`）
- `lib.mjs` 提供的零件：
  - 起服务（5178）；
  - 桌面 1440×900、Chromium 375×812、WebKit iPhone 三种预设；
  - 截图；首瓦片时间、传输字节；
  - 庄园 draw calls（`?stats=1`）；
  - 查看器 / 庄园的滚轮以光标为中心；
  - 死区探针；
  - 嵌入时宿主页 scrollY；
  - 推送事态并飞过去。
- `accept.mjs <目录>`：E2 验收全套，约 2.5 分钟。输出 `results.json`、`summary.md` 和截图。
- 开浏览器前遵守安静期锁。

## 5. 一条命令发布到预览（**不是发版**）
```bash
bash tools/ship.sh --dry-run   # 演练：smoke、git push --dry-run、列出要预热的文件数、预览脚本写到临时目录
bash tools/ship.sh             # smoke → bump_head.py --push（rebase + head.json + 推送）→ warm_cdn.sh <内容提交> --purge-branch <分支> → build_preview_script.py --follow <分支> --out ~/Downloads/eden-map/预览
```
- 只推送已提交的内容，工作区有改动时会提醒。
- 汇总里列出提交号、CDN 预热中非 200 的个数，以及预览脚本的位置；**非 200 > 0 时退出码 1**（2026-09-27 起）。
- 它推的是**分支 + HEAD 提交**、发的是「跟随分支」预览脚本：导入一次，之后刷新酒馆就拿到最新提交。正式发版要打标签、发钉标签的脚本和世界书附加条目，见第 8 节——**ship.sh 不能当发版用**。

### 5.1b 线路与测速（`map/tavern/host-routes.mjs`，2026-09-29 重做）

- **测什么**：自动选线与线路选择器都按「**真读完响应体的字节数 / 毫秒**」算分（`lineScore`），取 `data/maps.json`（105 KB）。必须 `await r.arrayBuffer()` 读完——只等到响应头测的是 TTFB，不是速度。
- **下限与门槛**：响应 < 32 KB（`PROBE_MIN_BYTES`）算无效测量（不参与比较）；超时 8 s 视为不通；换线要求新线路**至少快 30%**（`PROBE_MARGIN`），否则维持原线。
- **为什么改**：老实现同时取 `data/build.json`（约 400 B，带 `?probe=` 绕缓存），**谁先答完谁胜出**，然后钉 24 小时。它既测不出带宽（瓦片才是大头），又会被几十毫秒的噪声决定胜负，还可能选中一条实际很慢 / 直连不通的镜像并且 24 小时不再重测。用户 2026-09-29 实测后直说「测速有问题」，指的就是这个。
- **`cdn.jsdmirror.com` 的真实状态**：第三方薄代理（响应头 `server: ayao`），内容与 jsDelivr 一致（sha256 相同）且返回 200，但**本机 Mac 关代理直连不通**（用户实测），走代理时 105 KB 也要 2.99 s（jsDelivr 0.80 s）；`cache-control` 只有 `max-age=300` + `stale-while-revalidate=86400`，而且**不理会 query string**（见 CHANGELOG 0.9.5）——我们清缓存 / 预热那套对它不成立。因此它只作为「没梯子」的兜底候选，自动选线里必须明显更快才可能被选中；真正的国内线路等 npm 镜像（`enabled: false`）。
- 自测：`tests/host_split.test.mjs` 里有分数、下限边界（正好等于下限定为有效）与「小响应不能因为快就胜出」的用例，以及 `PROBE_PATH` / `PROBE_MARGIN` 的断言。

### 5.1 跟随分支的头指针 `map/data/head.json`（2026-09-28，没梯子卡在旧提交的修复）
**每次推送跟随分支前的最后一步**（ship.sh 已自带；手动推送的 agent 用它代替 `git push`）：
```bash
python3 tools/bump_head.py --push            # fetch → rebase 到 origin/<分支> → 写 head.json 并单独提交「head #N」→ push（被拒自动重来）
bash tools/warm_cdn.sh <head.json 里的 sha> 16 --purge-branch <分支>   # 预热内容提交 + 清分支路径 head.json / 加载器入口的 jsDelivr 缓存
```
- 内容：`{"build": N, "sha": "<内容提交>", "branch", "at"}`。`sha` 是 head 提交的**父提交**：文件写不进自己所在提交的提交号，而两者只差 head.json 本身，按父提交加载的代码完全一样。所以必须在 rebase **之后**写（否则 sha 指向不会推上去的提交），`--push` 已按这个顺序做。
- 为什么这样：国内没梯子时 `api.github.com` 常不通；jsDelivr 解析接口对带「/」的分支名返回 `version: null`；旧加载器因此一直用本机记住的旧提交（用户卡在 4a52335，落后 79 个提交，还显示「已是最新」）。而**分支路径的文件**（`cdn.jsdmirror.com/gh/<仓库>@<分支>/map/data/head.json`、jsDelivr 同路径、raw.githubusercontent）国内能取到。
- 读取（`map/tavern/follow.mjs` 的 `resolveFollow`，加载器原样嵌入同一段）：jsdmirror / jsDelivr / raw 三路**并行**取，取**构建号最大**的（某一路缓存旧了也不影响）；都不行问 GitHub contents 接口；本机记住的**只在构建号更大时**才用（CDN 旧缓存不会让人倒退，本机旧值也不会盖过新构建）。再按提交号加载 `eden-map.js`（提交号不可变，不受分支缓存影响；失败退回生成时烘进的提交）。
- 分支路径在 jsDelivr 上最长缓存约 12 小时，所以 warm_cdn `--purge-branch` 调 purge.jsdelivr.net 清掉 head.json 与入口文件；jsdmirror 没有公开的清缓存接口，靠 raw 与「取最大」兜底。
- 地图里：`followCheck`（打开 / 每 10 分钟）和设置「检查更新」都走同一条链；设置「关于」显示「跟随分支 … · 构建 #N · 来源 jsdmirror」。
- **旧的跟随脚本要重新导入一次**：旧加载器的解析写死在脚本里（GitHub 接口 → jsDelivr 解析接口 → 本机旧提交），远端没法改它；它加载到的旧提交里的地图代码也是旧的。重新导入（同一个固定 id，覆盖）后就不用再导。

### 5.1c 增量预热与后台脱离（2026-09-30）

Warming every one of the ~2900 runtime files after each small commit took 3–5 minutes and blocked the session, so `tools/warm_cdn.sh` now has two more modes. The file list itself is computed by `tools/warm_plan.py`:

```bash
bash tools/warm_cdn.sh <sha> --diff            # only what this commit changed + the head pointers (seconds)
bash tools/warm_cdn.sh <sha> --diff <base>     # ...changed between <base> and <sha> (a whole batch)
bash tools/warm_cdn.sh <sha> --full            # the full sweep (release only)
bash tools/warm_cdn.sh <sha> --diff --detach   # fire and forget: returns immediately, logs to logs/warm_cdn.log
```
- **Head pointers are always refreshed**: `map/data/head.json` and `map/tavern/eden-map.js` are warmed even when the diff is empty (docs-only commits warm exactly those two).
- **Heavy assets escalate**: if a diff touches `map/art/`, `map/props/`, `*.dzi` or `*.glb`, the run silently becomes a full sweep (a changed atlas means the whole render moved; the viewer pulls tiles lazily, so the full set must be warm). `--no-escalate` opts out.
- **Callers**: `tools/push_preview.sh` warms `--diff --detach` after every push (`WARM=0` to skip, `--full` to force); `tools/ship.sh` warms incrementally and only `ship.sh --release` forces `--full` with the "non-200 aborts" gate. `--purge-branch` works in both modes.
- Tests: `tests/test_warm_cdn.py` (synthetic repo: one `.mjs` line → that file + the pointers; `--full` expands; heavy → escalation; `--detach` returns and leaves a log).

## 6. NOTES 合并
- `.gitattributes`：`NOTES_FROM_LOCAL.md merge=union`（git 内置驱动）。
- 本机和云端**都只在文件末尾追加新小节**，不改、不删别人的小节。这样两边同时追加时，合并会把两段都保留，不产生冲突标记。
- 要订正旧内容时，追加一节「订正」。

## 7. 安静期锁
```bash
bash tools/quiet.sh 30       # 接下来 30 分钟安静（写 /tmp/eden-quiet-until：epoch 秒 + 可读时间）
bash tools/quiet.sh status   # 查看
bash tools/quiet.sh off      # 解除
bash tools/quiet_wait.sh     # 等锁过去（--check 只判断不等；--max N 最多等 N 秒）
```
- 遵守方：
  - `render_all.sh`（`--data-only` 除外）；
  - `crops.sh`；
  - `tools/browser/` 的所有脚本（`quietWait()`）。
- 代理自己写的渲染或浏览器脚本，开工前也先跑 `bash tools/quiet_wait.sh`。
- 用途：用户在真机上测试、录屏或跑基准时，不要让后台任务抢 CPU / GPU。

## 8. 发版（不改角色卡，v0.9.1 起）

**发版顺序（2026-09-27 接手时核对过一遍；✱ 的步骤以前没有人管，现在由 `tools/check_version.py` 与 `smoke.sh` 兜住）**

1. 内容冻结：工作区干净、`git status` 无未跟踪的大文件；`bash tools/smoke.sh` 全绿。
2. 一起改（**缺一样就会出「脚本 vX 与地图 vY 版本不一致」的永久警告**）：
   - `VERSION` → `X.Y.Z`；
   - `CHANGELOG.md` 的 `## X.Y.Z（未发版）` 去掉「未发版」；
   - `README.md` 顶部「当前发布版本」；
   - `docs/archive/ROADMAP-2026-09-30.md` 对应小节；
   - `python3 tools/version_code.py R` 重写 `map/data/build.json`（编码里的构建号 = 分支提交数 + 1，**必须在发版提交前跑、并和发版提交一起提交**，否则反查对不上）；
   - 发版提交本身只包含上面这些 + 必要的文档，别混功能改动（构建号按提交数算）。
3. `bash tools/smoke.sh` 再跑一次（其中 `tools/check_version.py` 会核对 VERSION / build.json / CHANGELOG / 标签是否一致 ✱）。
4. 打标签并推：
   ```bash
   git tag map-vX.Y.Z && git push origin preview && git push origin map-vX.Y.Z
   ```
5. CDN 校验与预热（**没做这一步就等于没发**）：
   ```bash
   bash tools/smoke.sh --cdn map-vX.Y.Z        # 抽样 HEAD 该标签下的入口与瓦片，要求全部 200
   bash tools/warm_cdn.sh map-vX.Y.Z           # 全量预热；有非 200 就修，别继续
   ```
6. 生成交付物：
   ```bash
   python3 tools/build_preview_script.py --tag map-vX.Y.Z   # → ~/Downloads/eden-map/eden-map-vX.Y.Z.json（C3 英文化；标签不存在或与 VERSION 不符时退出码 2）
   python3 tools/build_worldbook_addon.py --version X.Y.Z \
     --check ~/Downloads/酒馆/世界书/华伦天奴世界书.json      # → ~/Downloads/酒馆/世界书/伊甸地图·世界书附加条目 vX.Y.Z.json
   ```
7. 用户实测：`docs/tt-test-checklist.md`（正文是 v0.9.1 基线，8b / 8c / 8d 是后续版本新增项）；浏览器验收 `node tools/browser/accept.mjs <目录>`（需先 `cd tools/browser && npm install`，浏览器用 `npx playwright install chromium webkit`）。
8. 发布帖：首帖附原作者帖链接（见 `README.md`「原作与授权」）。

- 发版脚本的 id 固定，下个版本导入时覆盖旧的一条。
- 世界书附加条目：3 条常驻（联动规范 v3、事件类型 v2、当前地点写法）+ 人物位置 1 条 + 方位 3 条（EJS 条件触发，v0.9.5 起不常驻），类型、地标、房间、示范都从 `events.mjs` / `maps.json` 生成；生成时自检：示范原文不上图、每个地标能推断出层、当前地点示例落点正确；`--check` 按一份现有世界书核对字段。
- npm 正式发布与 npmmirror 线路另算（用户两步验证），见 `docs/archive/ROADMAP-2026-09-30.md`。
- `tools/legacy/build_card.sh` 是 0.6.x 时代的卡片构建，0.9.1 起不再使用（保留只作历史）。

