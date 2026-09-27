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

## 正式版脚本 = 加载器（0.9.6 起，S1 发 0.9.6，上层渲完再切 S2）

`python3 tools/build_preview_script.py --tag map-v0.9.6` 产出「【地图】伊甸地图」（id 固定，导入即覆盖旧的）。它不再钉死标签，而是每次加载：
1. 设置「锁定当前版本」开着（`edenMapLockTag`，高级，默认关）→ 直接用锁定的标签，不联网；
2. 否则查 jsDelivr 标签列表，取最新的 `map-v*` / `map-s<n>-v*`；
3. 取不到 → 读分支上的指针 `map/data/latest.json`（`{tag, version}`，分支 = 生成时的当前分支，`--pointer` 可改）；
4. 还不行 → 上次成功的（`edenMapLatestTag`）→ 生成时烘进来的标签；永远不比烘进来的更旧；
5. 加载那个标签的 `eden-map.js`（jsdmirror → jsDelivr）；失败就退回烘进来的标签。

结果：0.9.6 起所有正式版用户刷新酒馆就用上最新正式版，不用重新导入。测试：`tests/version097.test.mjs`「加载器」几项（模拟新版 → 选中它；离线 → 退回）。

发版：打标签、推送 → `bash tools/ship.sh --release`（把 `latest.json` 指到 VERSION 的标签、提交推送、清 jsDelivr 缓存）→ `build_preview_script.py --tag …` 只在加载器本身改了时才需要重新发给用户。

## 更新提示（卡内脚本 eden-map.js）

- **自动检查更新**（地图设置「关于」里的开关，默认开，`edenMapAutoCheck`）：实时——脚本加载后、每次打开地图时查一次，面板开着时每 10 分钟再查，两次至少隔 1 分钟；一次 = jsDelivr 标签列表 + 新标签的 build.json（各约 1 KB，绕缓存），走当前线路，和「检查更新」按钮同一套。有新版弹「地图有新版 vX」：更新说明链接 + 怎么更新（加载器 / 跟随分支：刷新；锁定：去「关于」解锁；旧的钉版本脚本：重新导入）+「稍后」（本次页面不再提示这个版本）/「此版本不再提示」。地图面板或开场自检卡开着时不弹，关上再弹。
- **强制更新**：在**最新正式版**的 `map/data/build.json` 里手写 `"min_version": "0.9.6"`（可带系列 `"S2:0.1.0"`）和可选 `"force_reason"`。低于它的脚本弹红框「此版本已停止支持，请更新」，只能「本次关闭」（刷新后再弹），地图照常能用。用加载器的用户刷新就好（除非锁定了版本）。`version_code.py` 重写 build.json 时保留这两个键；`check_version.py` 检查格式且不比本版新。

## 旧版本能不能收到提示（2026-09-27 核对 map-v0.4.0 … map-v0.9.5 的代码）

- 0.9.5 及以前的正式版脚本都**钉死了标签**：地图程序、数据、图片全从同一个不可变标签取，没有我们能改的地址，也不会自己换成加载器。
- 唯一会变的请求：0.9.1–0.9.5 自检每天查一次 jsDelivr 标签列表。发新的三段 `map-vX.Y.Z` 标签后，它们在自检里显示「有新版本」（开了「自动更新到新正式版」的会在本次会话切过去）。它们只认三段的 `map-vX.Y.Z`：**第 4 段补丁、`map-s2-…` 标签、`min_version` 它们都看不到**，没法弹「已停止支持」。要让他们用上加载器，只能靠这条自检提示让用户重新导入一次「【地图】伊甸地图」。
- 0.6.x 及更早：没有任何会变的请求，收不到提示。
- 跟随分支的预览脚本每次加载都取分支最新提交。
- 所以 0.9.6 必须是三段的 `map-v0.9.6`（S1），这样 0.9.1–0.9.5 的自检能看到它。
