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
2. 地图上新增 / 改地点，同一次提交里改 `map/data/addon_places.json` 并用 `tools/build_worldbook_addon.py` 重建世界书附加条目；`check_maps` 会拦不同步。
3. 不过滤用户聊天内容；地图写聊天只填输入框，不自动发送。
4. 不做性相关或束缚类道具与细节（名字照抄除外）。
5. 已发布的世界书 / 脚本文件不覆盖（工具会输出 `-dev`）。

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
