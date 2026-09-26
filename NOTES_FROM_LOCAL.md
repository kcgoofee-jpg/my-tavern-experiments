# 本机 ↔ 云端 协作记录

## 2026-09-26 Blender 5 合成器报错 —— 已修，可以重跑
- 问题：`tc_common.glare` 用了 `scene.node_tree`，Blender 5 已移除（`'Scene' object has no attribute 'node_tree'`），中层、下层在加光晕时崩。
- 修法：Blender ≥ 5 用 `scene.compositing_node_group`（新建 CompositorNodeTree 节点组 + 组输出节点），Glare 的参数改设输入口（Type = Fog Glow、Quality = High、Threshold、Size、Strength）；Blender 3/4 仍走旧写法；任何一步失败只跳过光晕、不中断渲染。
- 验证：云端用 pip 的 bpy 5.0.1 跑通了上 / 中 / 下三层；同一块区域 Blender 4.2 与 5.0 的输出几乎一致（平均亮度 21.05 vs 20.29）。
- **可以重跑**：`git pull` 后 `bash tools/render_all.sh mid low --res 8000 --samples 128`（上层已渲好，不用重跑）。

## 2026-09-27 本机：加载性能（提交 092fe6b）
- 实测 jsDelivr 每个请求约 1 秒延迟（各镜像、raw.githubusercontent 都一样），所以改为少请求 + 高并发：
  - `tools/make_dzi.py` 默认瓦片 256 → **512**、质量 80；世界、国界、上层已重切（世界 865 → 226 张）。中层、下层 8K 渲完会按 512 切。
  - `map/viewer.html`：`imageLoaderLimit` 4 → 16，`maxImageCacheCount` 120 → 60；`<head>` 预加载三个启动 JSON；首张地图画出后 `warmOthers()` 预热其他地图的 dzi、点位数据和 8–10 级瓦片。
- 云端改 `viewer.html` 前请先拉取，避免冲突。以后切瓦片不要再显式传 `--tile 256`。

## 2026-09-27 云端：任务 2 进度
### 1. 真实路网（OSM）—— 脚本已完成，**可以重跑：上层（含城市版）、中层、下层**
- 取材：香港九龙油麻地—旺角—太子一带（北纬 22.3035–22.3305、东经 114.1595–114.1777），整块旋转 90°（北 → 东）放进 3 km × 1.875 km；不保留任何名称。
  - 选它不选重庆渝中：这里 OSM 的建筑轮廓覆盖非常完整，约一半带层数 / 高度；是世界上最密的高层街区之一；南北 3 km 的长条正好旋转成横幅。渝中在 OSM 上建筑轮廓稀疏得多。
- 数据：云端连不上 Overpass / Geofabrik，改用 OSM 主 API 分 8 块下载（`python3 blender/tc_osm.py fetch`）；原始 .osm（约 60 MB）不进 git，处理后的 `blender/data/osm/city.json`（1.7 MB：5321 栋建筑、6707 段道路、公园、水面、地面铁路）进 git，渲染只读它。本机不用再下载。
- 许可：© OpenStreetMap contributors（ODbL），写进 maps.json 的 `credit`、README、ROADMAP。
- 实现：`blender/tc_city.py`（OSM 城市：轮廓挤出、道路网格、沿路取点、路面标线、车流、楼顶部件）；`tc_common.city_blocks` 的网格生成已删除。三层共用同一套轮廓与道路。
- 上层新参数 `--below clouds|city`；`render_all.sh` 默认渲 `upper`（云海）与 `upper_city`（带城市）两份。

### 2. 上层默认云海 —— 已完成，**可以重跑：上层（`upper` 与 `upper_city` 两份）**
- `tiancheng_upper.py --below clouds|city`（默认 clouds）；`bash tools/render_all.sh upper upper_city --res 8000 --samples 64`。
- maps.json：`tc_upper.alt = {label: 显示下方城市, base: art/tc_upper_city.dzi}`；三层加 `credit`。
- viewer.html：有 `alt` 的地图显示「显示下方城市」开关，默认关，状态记在 localStorage（`edenMapAlt:<地图>`）；切换只换底图、视角不变；`tc_upper_city.dzi` 还没渲染时开关会提示「这版底图还没渲染」并自动关掉。右上角显示 credit。
- 注意：仓库里现在的 `tc_upper.dzi` 是旧的「带城市」版，重渲后它变成云海，城市版放 `tc_upper_city`。

### 3. OpenSeadragon 5.0.1 手机端问题 —— 核实结论（没有替换任何文件，等本机确认）
- **#2667「Mobile performance in collections 4.1.0 vs. 5.0.0+」**：仍是 open，没有维护者回复、没有关联的修复 PR。现象是 iPhone 上 5.0.1 很卡、偶尔页面崩溃，退回 4.1.0 立刻正常。报告里**没说用的是哪个 drawer**，而 5.0 的默认 drawer 是 WebGL（不支持时才退回 canvas）；按 5.0.1–6.0 的改动看，嫌疑最大的是 WebGL drawer（上下文丢失、纹理内存）。
- **#2705「OSD lagging on mobile devices after sometime」**：也是 open、没有修复 PR。现象是长时间使用后越来越卡，报告人自己试了 canvas drawer 但撞上跨域污染画布（`getImageData` 报错），最后靠「手动从 world 里移除旧图片」控制内存。这是他们反复往 world 里加图导致的内存累积，和我们的用法（每张地图 `viewer.open` 一次、缓存有上限）不同。
- **官方后续**：6.0.0 起默认 drawer 改成 `auto`（按设备在 WebGL 与 canvas 间选）；WebGL 上下文丢失后会恢复或改用 canvas；更好的 WebGL 支持检测；「Improved performance on mobile」；缓存系统整体重写。6.0.1、6.0.2 是小修（多图加载、TypeScript 类型）。
- **对我们的影响**：`viewer.html` 一直显式用 `drawer: 'canvas'`（v0.6.0 起，为了修 WebGL 下国界线的白块），不走 WebGL 路径，所以 #2667 最可能的原因不影响我们；#2705 的跨域问题我们也没有（瓦片与页面同源，或走 CORS 的 jsDelivr，并且不读像素）。已有的缓解：`maxImageCacheCount` 60（触屏 30）、DPR 上限、关闭面板时释放瓦片。**结论：不需要降级或升级，先保持 5.0.1 + canvas。**
- **如果本机在 iPhone 上仍然实测卡顿**，两个选项：
  1. **降级到 4.1.1**：4.x 没有 `drawer` 选项（只有 canvas，传了也会被忽略）；我们包装的内部方法 `TiledImage._getLevelsInterval`（清晰度档位上限）和 `_tilesLoading`（加载进度）在 4.1 里都存在，改动只是换 `map/vendor/openseadragon/`。风险：4.x 的触屏手势与 5.0 修过的若干 bug（页面缩放后图消失等）会回来。
  2. **升级到 6.0.2**：保留 `drawer: 'canvas'` 即可避开 WebGL。风险较大：6.0 重写了瓦片与缓存管线，`_getLevelsInterval`、`_needsUpdate` 等内部字段可能改名或语义变化，清晰度档位和加载进度需要重写并在 TT 里重测。
  - 建议顺序：先在 iPhone 的 TT 里实测当前版本；有问题先试 4.1.1（改动最小，可以直接回退），6.0.2 等有空再做。
- 来源：https://github.com/openseadragon/openseadragon/issues/2667 、https://github.com/openseadragon/openseadragon/issues/2705 、https://github.com/openseadragon/openseadragon/blob/master/changelog.txt

### 4. npm 发布准备 —— 已完成（没有发布）
- `bash tools/pack_npm.sh`：把 viewer.html、tavern/eden-map.js、data/*.json、vendor/、art/*.dzi 与瓦片目录、首屏缩略图拷到临时目录，生成 package.json（`tiancheng-map-assets`，版本跟 VERSION，`files` 白名单，`repository` 指向 GitHub），跑 `npm pack --dry-run`。当前：844 个文件，压缩后 12.6 MB（解包 13.5 MB）。`--keep` 保留临时目录，本机发布时进去 `npm publish`。
- **需要你决定**：仓库没有 LICENSE 文件，package.json 的 `license` 暂填 `SEE LICENSE IN README.md`；另外 VERSION 现在是 0.6.1（CHANGELOG 已写到 0.8.0），发布前请把 VERSION 改对。
- `eden-map.js` 的 `LINES` 里预留了 `npm` 线路（npmmirror，`https://registry.npmmirror.com/tiancheng-map-assets/<版本>/files/map/`），`enabled: false`，列表里被过滤掉，界面上看不到；首次发布并验证后改成 `true`。版本号从脚本自己的地址里取（gh 的 `@map-v<版本>` 或 npm 路径）；取不到版本时 npm 线路退回原地址。gh 两条线路知道版本时也改为按模板拼地址（结果与原来的「只换域名」相同）。
