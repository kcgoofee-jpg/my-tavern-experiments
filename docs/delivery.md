# 交付线路（DIST-3 设计）

> 状态：2026-10-04，基于 head #348（332c9469）实测。结论先行：**仓库型 gh 线路今天就能用，不用建任何新仓库**；
> npm 路线（DIST-2 的 33 个包）整体降级为备用方案，包不发布。§5 的改动与 npm 包「不发布只封存」的处理
> 等用户确认后执行（DIST-3 项 3）。

## 1. 为什么重新测

DIST-2 时仓库约 1 GB，超过 jsDelivr 单包 50 MB 上限，`cdn.jsdelivr.net/gh` 与 `cdn.jsdmirror.com/gh` 一律 403，
于是把全部 import 线路改成了 npm 包（`NPM_LINES`，README 指向 `eden-map-engine@0.9.7`）。但 npm 从未发布
（2026-10-04 用户决定：不做 npm），当前 README 的导入地址取不到东西。jsDelivr 2024 年起文档里的体积限制已撤下
（DIST-2 在 npm 侧也实测了 90 MB 畅通），所以 gh 线路值得重测——实测确实恢复了。

## 2. 实测（2026-10-04，curl，`@332c9469`，字节与本地 git blob 逐一相等）

| 线路 | 入口 eden-map.js | viewer.html | 瓦片 | world_1k.jpg | glb 5.9 MB | CORS | 模块 MIME | 结论 |
|---|---|---|---|---|---|---|---|---|
| cdn.jsdelivr.net/gh | 200 / 2.8 s | 200 | 200 | 200 | 200 / 5.6 s | `*` | application/javascript | 可用 |
| cdn.jsdmirror.com/gh | 200 / 1.2 s | 200 | 200 | 200 | 200 / 4.7 s | `*` | application/javascript | 可用（缓存 300 s） |
| fastly.jsdelivr.net/gh | 200 / 0.6 s | 200 | 200 | 200 | 200 / 3.1 s | `*` | application/javascript | 可用（最快） |
| raw.githubusercontent.com | 200 / 0.5 s | 200 | 200 | 200 | 200 / 1.5 s | `*` | **text/plain** | 模块导入被 MIME 拒，只能 fetch 文本，不能当线路 |
| cdn.statically.io/gh | **挂起**（30 s 只到 32 KB） | **挂起** | 200 | 200 | **0 字节超时** | `*` | — | 不可用（F-TT 记录的用户手改 HOSTS 把它排第一，应去掉） |

冷路径（未被预热过的 `tc_low_files/10/0_1.jpg`）三条 gh 线路同样 200 全量返回——不是 CDN 预热的假象。
浏览器实测（`tools/browser/dist3_load.mjs`，stub 宿主直接 import 远端入口，新鲜上下文，2026-10-04）：
首帧（挂载）——Chromium：jsdmirror 6591 ms（2578）、jsDelivr 3055 ms（1481）、fastly 2908 ms（1394）；
WebKit：jsdmirror 5298 ms（1824）、jsDelivr 3446 ms（1473）、fastly 6353 ms（3488）。
raw 在两个引擎都被 strict MIME 拒（text/plain）；statically 是 CORS 跨源重定向被拒（不是单纯慢）——排除理由用数字钉住。

## 3. 设计（本方案，待用户确认后落地）

**单一仓库 + 按提交号钉死 + 三条 gh 线路轮换。**

- 代码、数据、底图、模型全部留在本仓库，不拆仓、不建新仓库、不同步——仓库大于 50 MB 已不再被拒。
- 版本锚点用提交号（现行为）：跟随脚本的 head.json 给出 `build + sha`，`@<12 位提交号>` 地址不可变，
  jsDelivr / 镜像可永久缓存；换线路 = 换 host 前缀，路径结构完全一致（天然「swappable by sha」）。
- 线路顺序：`cdn.jsdmirror.com`（国内）→ `cdn.jsdelivr.net` → `fastly.jsdelivr.net`（fastly 是独立缓存层，
  官方 CDN 抽风时是第三条真线路；statically 与 raw 从线路表剔除）。
- 加载器：每个 `import()` 与 10 s 超时竞速，挂起也换下一条（2026-10-04 已落，`tests/follow_head.test.mjs`）。
- npm 路线封存不删：`NPM_LINES`、`pkg-paths.mjs`、`assets.json` 索引都是现成代码，零维护成本；
  若 gh 线路将来再被卡（jsDelivr 恢复限制 / 镜像全灭），按下节备选执行。

## 4. 备选（仅当 gh 线路将来彻底不可用）

拆成多个各 < 45 MB 的 GitHub 仓库，走同样的 gh 线路（复用 `tools/npm_layout.py` 的分组，33 个包 = 33 个仓库）：

| 仓库 | 体积 | 内容 |
|---|---|---|
| `eden-map-engine` | 17.4 MB | 代码 + 数据 + 设定包 + 三维库（532 文件） |
| `eden-map-art-<层族>` ×24 | 0.6–51 MB | 底图 `art/<层>.dzi` + `_files/`（族内超 45 MB 按时段拆） |
| `eden-map-props-a…d` ×4 | 35–39 MB | 三维模型 `props/<模型>/` |

同步工具（只传变更文件）、运行时索引（`assets.json` 的 paths 前缀表已就绪）、README、smoke 都按 DIST-2 的
npm 蓝图平移。此表只作预案：**现在不动手，等 gh 线路确实死了再建**。

## 5. 交付物改动清单（确认后执行）

1. README zh + en：一行导入改回 `https://cdn.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@<标签>/map/tavern/eden-map.js`（正式版用标签，跟随版用提交号）。
2. `tools/check_readme.py`：规则随导入地址改回 gh 形态。
3. `tools/build_preview_script.py`：HOSTS 增加 `fastly.jsdelivr.net`（线路顺序 jsdmirror → jsdelivr → fastly）。
4. `bash tools/smoke.sh --cdn`：对正式标签走 gh 线路自检。
5. 用户在 TT 重新导入：`~/eden-map-review/dist-3/导入说明.md`（中文步骤清单）。
