# 云端任务 2：真实路网改造 + 上层云海 + 手机端核实

> **本文已作废的约束（2026-09-29）**：「不建模、不描写任何性相关或束缚类道具、设施与场所细节」与「用途不明的私密房间一律中性」这类硬约束**已撤销**（用户决定；理由：不按原卡补全会被原作者投诉）。本文件是历史任务书，原文不改；现行规则见 `docs/card-digest.md`、`docs/card-omissions.md` §4、`docs/eden-estate.md`。

接着在分支 `cloud/tc-mid-low` 上做。**不要问问题，做完提交并推送。** 开始前先 `git pull`，读 `NOTES_FROM_LOCAL.md`、`ROADMAP.md`、`CHANGELOG.md`。
分工不变：你改脚本和文档，本机只提交 8K 渲染结果；改 `map/viewer.html` 前先拉取。每做完一项就推送一次，并在 `NOTES_FROM_LOCAL.md` 写一句「可以重跑：哪一层」。

## 1. 真实路网改造（用户已选这条路线）
目标：天城三层不再是正交网格 + 方块，看起来像真实航拍。
- 用 OpenStreetMap 真实数据做城市骨架：挑一块路网密度接近「垂直超大城市」的真实区域（建议香港九龙旺角—油麻地一带，或重庆渝中半岛；二选一，写明理由），取约 3 km × 1.875 km（与现有平面坐标 W=30、H=18.75 单位一致）。
- 数据获取：优先用 Overpass API 或 Geofabrik 的 extract 下载 OSM（道路 highway、建筑 building 轮廓与 building:levels/height）；如果容器网络连不上，改用仓库外可访问的镜像，实在拿不到就在 `NOTES_FROM_LOCAL.md` 里写清楚，请本机下载，本机会把数据放到 `blender/data/osm/`。
- 许可：OSM 数据为 ODbL，**必须**署名「© OpenStreetMap contributors」：写进 `map/data/maps.json` 对应地图的 `credit` 字段（新增，查看器会显示），以及 README/ROADMAP。
- 实现：新写 `blender/tc_osm.py`（纯 Python 解析 .osm/.json，不依赖需要图形界面的插件），把道路和建筑轮廓投影到平面坐标，**替换 `tc_common.city_blocks()` 的网格生成**；建筑高度按 levels/height，缺失时按城区强度随机；屋顶继续用现有配色与楼顶设备。三层共用同一套轮廓（上层俯视远景、中层霓虹夜景、下层保留底层工业与贫民窟，但道路骨架一致）。
- 天城是虚构城市：可以整体旋转、裁剪、镜像这块真实区域，并在上面叠加设定里的地标；不要出现真实地名。
- 材质：可用 Poly Haven / ambientCG 的 CC0 贴图（屋顶、混凝土、金属），下载到 `blender/data/tex/`（二进制不进 git，已在 .gitignore 的就沿用；新增的请加进 .gitignore 并写下载脚本 `tools/fetch_textures.sh`）。
- 先出 2000px 草稿对比新旧观感，上 / 中 / 下各一张，放到 `docs/drafts/`（小于 1 MB 的 JPG 可以提交）。

## 2. 上层默认「云海」，下方城市改为高级开关
用户想法：切到上层时，默认用一片云和白雾遮住下方城市（类似《部落冲突》的云），下方城市作为高级性能开关。
- `tiancheng_upper.py` 加参数 `--below clouds|city`：`clouds` 时不生成城市，在岛屿下方放一层白色云海（体积或噪声遮罩平面均可，注意曝光，岛屿投影仍落在云上），`city` 时保持现状。
- `tools/render_all.sh` 支持渲两份：`tc_upper`（云海，默认）与 `tc_upper_city`（带城市）。
- `map/data/maps.json` 里 `tc_upper` 增加 `"alt": {"label": "显示下方城市", "base": "art/tc_upper_city.dzi"}`；`viewer.html` 在有 `alt` 的地图上显示一个开关，切换时只换底图（位置不变），默认关；开关状态记在 localStorage。云海图压缩后很小，默认加载会明显更快。

## 3. 核实 OpenSeadragon 5.0.1 手机端问题
调研报告称 OSD 5.0.1+ 在 iOS 上有严重卡顿 / 崩溃（issue #2667、#2705，未核实）。请读这两个 issue 和相关修复，结论写进 `NOTES_FROM_LOCAL.md`：是否影响我们用的 canvas drawer；如需降级到 4.1.x 或升级到修复版本，说明改动与风险（先不要直接替换，等本机确认）。

## 4. npm 发布准备（用户会注册 npm 账号，发布由本机做）
- 新增 `tools/pack_npm.sh`：把 `map/` 里对外需要的文件（html、js、json、vendor、art 下的 dzi 与瓦片）拷到临时目录，生成 `package.json`（包名暂定 `tiancheng-map-assets`，版本号跟 `VERSION`，`files` 白名单，`license` 写仓库许可证，`repository` 指向 GitHub），执行 `npm pack --dry-run` 打印文件数和总大小。**不要执行 npm publish。**
- 在 `eden-map.js` 的 `LINES` 里预留一条 `npmmirror` 线路（`https://registry.npmmirror.com/<包名>/<版本>/files/map/`，与 gh 路径不同，需要单独的 baseFor 逻辑），默认隐藏（`enabled: false`），等首次发布验证后再打开。

## 约束（同上一轮）
- 美术只来自 Blender 渲染；不要卡通、不要 SVG/Canvas 手绘。
- 不建模任何性相关或束缚类道具与场所细节；机构只画中性建筑外观。
- 不改 `VERSION`、不打标签、不运行 `tools/build_card.sh`，发布由本机做。
- 提交信息结尾加：`Co-Authored-By: Claude <noreply@anthropic.com>`。
