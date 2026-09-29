# 上手一页

酒馆助手外挂地图（天城 / 伊甸庄园，原卡作者 Yehehua）。交付只有两样：**外挂脚本** + **世界书附加条目**，不生成、不修改角色卡。

## 分支与版本

| 名字 | 用途 |
|---|---|
| `cloud/tc-mid-low` | 唯一主干。所有开发都推这里，跟随版预览每次加载取它的最新提交 |
| 标签 `map-vX.Y.Z` / `map-vX.Y.Z.P` / `map-s<n>-vX.Y.Z` | 正式版（目前停在 0.9.5；0.9.6 未发版，内容都在跟随版里） |
| `main` | 旧（v0.6 时代），不要基于它开发 |

版本规则见 `docs/versioning.md`；排序逻辑只在 `tools/verlib.py` 和 `map/tavern/selfcheck.mjs` 两处。

## 目录

- `map/` 运行时（CDN 直接加载）：`tavern/eden-map.js` 卡内入口、`viewer.html` + `app/` 查看器、`core/` 协议与存储、`data/` 地图数据（`maps.json`、`addon_places.json`、schema）、`art/` 瓦片、`estate/` 庄园三维、`props/` 各建筑三维、`packs/` 卡专属包。
- `blender/` 渲染与建模脚本（产物进 `map/art`、`map/props`）。
- `tools/` 构建、检查、发布；`tools/legacy/` 旧角色卡工具，勿用。
- `tests/` `node --test`；`tools/browser/` 无头浏览器测试。
- `docs/` 设计、评审、草图（`drafts/`、`reviews/` 是过程产物）；`docs/history/` 旧任务说明。

## 硬规则

1. 地名、房间、变量一律**照抄原卡**（含成人向字样），不编名、不做占位或运行时转换；自己补的设定标「仓库推断」。
2. 地图上新增 / 改地点，同一次提交里改 `map/data/addon_places.json` 并用 `tools/build_worldbook_addon.py --ship` 重建世界书附加条目（同时更新随地图发布的 `map/data/worldbook_addon.json`，设置里的「写入世界书」/ 自动同步读它）；`check_maps` 会拦不同步。
3. 不过滤用户聊天内容；地图写聊天只填输入框，不自动发送。
4. ~~不做性相关或束缚类道具与细节（名字照抄除外）。~~ ✅ **2026-09-29 用户决定撤销**（理由：不按原卡补全会被原作者投诉）——改为按原卡补全设施与描写；名字仍照抄卡原名，不自编中性名。见 `docs/card-omissions.md` §4、`docs/card-digest.md`。
5. 已发布的世界书 / 脚本文件不覆盖（工具会输出 `-dev`）。
6. **风格帧自检（新路线 / 重点资产开工前，2026-09-29 起全自动）**：任何新技术路线（例如换渲染管线、换建模方式、换查看器实现）或重点资产（庄园、地标这类会花几小时以上的「顶奢 / 传承 / 显眼」资产）在建模 / 编码之前，先出一张风格帧（参考板或最小 demo 截图）+ 一张 375 px 宽手机截图，交给 glm-5.3-flash 看图代理自检（对照 `docs/rejected.md`），通过即继续，不等用户。不得先做完整轮再补风格帧。每轮草稿后同样各附一张手机截图，拷贝到 `~/eden-map-review/` 留档。原因见 `docs/render-retro.md` W2（庄园 three.js 线因为没有风格帧 + 手机检查点，整线作废约 8–12 agent·h）。
7. **局部渲染优先**：同一图层（上 / 中 / 下层 8K 底图，或已出过整图的资产）第二次要整张重渲前，先看 `docs/onboarding.md` 与 `tools/render_all.sh` 里 region_patch 的规则——改动面积 < 25% 一律用 `tools/region_patch.py` 局部渲染 + 合成，禁止再整图重渲，除非有 `--full-ok` 或写明理由。
8. 所有 GPU 渲染（`blender -b ...`）一律通过 `tools/blender_run.sh` 启动，不允许直接调 `blender` 或用 `pkill`/`killall` 杀进程；只按自己记录的 PID 结束自己的任务。

## 日常流程

```bash
node --test && bash tools/smoke.sh     # smoke 含 check_maps、check_pack
bash tools/ship.sh                      # 推送主干 → 预热 CDN → 生成跟随版脚本
```

改了地图数据再跑相关浏览器测试（`tools/browser/`）。并行开发各用自己的 git worktree；本地预览用 `tools/cors_server.py`（端口按工作区自动分配）。

## 发正式版（目前暂停，等和原作者商量）

改 `VERSION`、`CHANGELOG.md` → `python3 tools/version_code.py` → 提交 → 打标签推送 → `bash tools/ship.sh --release`。正式版脚本是加载器，用户刷新即得最新版；强制更新在最新版 `build.json` 写 `min_version`。

## 换一张卡

见 `docs/generalize/README.md`：`python3 tools/new_pack.py` 起包，`tools/check_pack.py` 检查，示例包 `map/packs/town`。
