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

## 5. 一条命令发布到预览
```bash
bash tools/ship.sh --dry-run   # 演练：smoke、git push --dry-run、列出要预热的文件数、预览脚本写到临时目录
bash tools/ship.sh             # smoke → git push 当前分支 → warm_cdn.sh <HEAD> → build_preview_script.py --follow <分支> --out ~/Downloads/酒馆/预览
```
- 只推送已提交的内容，工作区有改动时会提醒。
- 汇总里列出提交号、CDN 预热中非 200 的个数，以及预览脚本的位置。

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
