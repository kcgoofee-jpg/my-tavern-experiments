# 版本号、标签与更新提示

规则只写在两处：Python `tools/verlib.py`（check_version / version_code / build_preview_script / build_card / warm_cdn），JS `map/tavern/selfcheck.mjs`（`parseVer` / `cmpVer` / `tagOf` / `latestTag`）。`tests/version097.test.mjs` 核对两边排序一致。

## 版本号

| 写法（VERSION、CHANGELOG「## …」、README「当前发布版本」） | 标签 | build.json `version` | 构建编码 |
|---|---|---|---|
| `0.9.6`（系列 1，沿用） | `map-v0.9.6` | `0.9.6` | `S1-0906-R-NNNN` |
| `0.9.6.1`（小修补丁，第 4 段） | `map-v0.9.6.1` | `0.9.6.1` | `S1-0906p1-R-NNNN` |
| `S2:0.1.0`（新系列，版本号从 0 重新数） | `map-s2-v0.1.0` | `0.1.0` | `S2-0100-R-NNNN` |

- 排序按（系列, 各段），缺的段按 0：`0.9.6 < 0.9.6.1 < 0.9.7 < S2:0.1.0 < S2:0.1.0.1`。
- 系列就是构建编码里原来的「赛季」`S<n>`；build.json 只写不带前缀的版本号，系列从编码前缀读（`buildVer`）。
- 小修补丁（第 4 段）：小修复单独发版，打 `map-vX.Y.Z.P`，流程和普通发版一样（`version_code.py` → 提交 → 打标签 → `check_version.py`）。

### 换系列（到时候按用户的话再做，现在不切）
1. VERSION 写 `S2:0.1.0`，CHANGELOG 加 `## S2:0.1.0`，README「当前发布版本 `S2:0.1.0`」。
2. `python3 tools/version_code.py` → build.json `{"version": "0.1.0", "code": "S2-0100-R-…"}`。
3. 提交、打 `map-s2-v0.1.0`、推送、`bash tools/warm_cdn.sh`（默认按 VERSION 推出标签）；`python3 tools/build_preview_script.py --tag map-s2-v0.1.0` → 「【地图】伊甸地图 S2 v0.1.0」。
4. 旧的 `map-v0.x` 标签都保留；不会撞名。

## 更新提示（卡内脚本 eden-map.js）

- **自动检查更新**（地图设置「关于」里的开关，默认开，`edenMapAutoCheck`）：启动后空闲时查一次，每会话一次，联网至少隔 6 小时；走当前线路，和「检查更新」按钮同一套。有新版弹「地图有新版 vX」：更新说明链接 + 怎么更新（跟随分支：刷新；钉了版本：重新导入）+「稍后」/「此版本不再提示」。地图面板或开场自检卡开着时不弹，关上再弹。
- **强制更新**：在**最新正式版**的 `map/data/build.json` 里手写 `"min_version": "0.9.6"`（可带系列 `"S2:0.1.0"`）和可选 `"force_reason"`。低于它的脚本弹红框「此版本已停止支持，请更新」，只能「本次关闭」（按会话记，下次加载再弹），地图照常能用。`version_code.py` 重写 build.json 时保留这两个键；`check_version.py` 检查 `min_version` 格式且不比本版新。

## 旧版本能不能收到提示（2026-09-27 核对 map-v0.4.0 … map-v0.9.5 的代码）

- 钉了标签的旧脚本，地图程序、数据、图片全从**同一个标签**取（`@map-vX/`），标签内容不可变，没有任何能由我们改的地址。
- 唯一会变的请求：0.9.1–0.9.5 自检每天查一次 jsDelivr 的标签列表（`data.jsdelivr.com/v1/packages/gh/…`）。能做的只有「发一个新的 `map-vX.Y.Z` 标签」，它们在自检里显示「有新版本」（用户开了「自动更新到新正式版」的会在本次会话切过去）。它们只认三段的 `map-vX.Y.Z`：**第 4 段补丁和 `map-s2-…` 标签对它们不可见**，也读不到 `min_version`，没法给它们弹「已停止支持」。
- 0.6.x 及更早：没有任何会变的请求，收不到提示。
- 跟随分支的预览脚本每次加载都取分支最新提交，自然用上新代码（包括这里的提示）。
- 因此换系列前，想让系列 1 的旧用户知道，最后再发一个三段的 `map-v0.9.x` 标签（它的自检「有新版本」是唯一能到达他们的渠道）。本版（下一个正式版）起的脚本两种标签、第 4 段、`min_version` 都认。
