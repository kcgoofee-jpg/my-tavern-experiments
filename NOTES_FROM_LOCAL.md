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

## 2026-09-27 云端：任务 3 进度
### 2. 各地图默认缩放 —— 已完成（不用重渲，只改了查看器和注册表）
- maps.json 每张图加 `view: {focus, width_m, min_width_m, extent_m}`：世界 4000 km / 最大放大到 700 km / 全图按 12000 × 7500 km 算（世界的实际尺度设定没给，是推断）；天城三层 800 m / 60 m / 3000 × 1875 m。
- viewer：`focusStart` 按 view 算初始视框（米 → 占图宽比例），竖屏时让可见「高度」等于 width_m；最大放大改为每张图 `viewport.maxZoomLevel = extent / min_width_m`，没有 view 的图沿用全局 `maxZoomPixelRatio`。以后圣都、原域做「浮空 + 地面」两层时，各给一个 view 即可。
- 实测（Chromium）：桌面天城初始可见 800 m、最大放大 60 m；手机竖屏可见高 800 m；世界图 4000 km / 700 km。
- `check_maps.py` 检查 view（数值范围、focus 是否存在、extent 是否与渲染数据一致）。

## 2026-09-27 本机：分工调整（请云端停手任务 3 第 1 项）
- 任务 3 第 1 项「每层参考城市」**改由本机做**：本机能直连 api.openstreetmap.org 下载多个城市，Blender 用 GPU 出草稿比云端 CPU 快一个数量级，省掉来回同步。
- 云端如果已经开始改 `blender/tc_osm.py`、`tc_city.py`，请把已做的推送上来、在这里写一句做到哪，然后停手，不要再改这两个文件和三层渲染脚本。
- 之后云端只接：调研核实、文档、与渲染无关的工具脚本。需要时本机会在这里写新任务。

### 1. 每层参考城市 —— 云端已停手（按上面「分工调整」），做到这里，交给本机
看到分工调整时已经做了大半，全部推送在这次提交里，**之后云端不再改 `blender/tc_osm.py`、`tc_city.py` 和三层渲染脚本**。状态：
- `tc_osm.py`：改成多区域（`REGIONS`：kowloon / manhattan / brooklyn / ruhr / shenzhen，各自中心、宽高、旋转角）；`fetch <区域>` 分块下载，节点太多自动再切四块；`build <区域>` 输出 `data/osm/<区域>.json`，新增 `tanks`（储罐 / 筒仓）与 `industrial`（工业用地）。已下载并处理好四个新区域的 json（进 git，原始 .osm 不进）。`city.json` 改名为 `kowloon.json`，重新处理后与原来逐项一致。
  - 覆盖情况：曼哈顿 3557 栋（90% 带高度）、布鲁克林 6704 栋（几乎全带高度）、鲁尔 1428 栋 + 494 段铁路、深圳白石洲一带只有 557 栋（城中村基本没画）。
- `tc_city.py`：`DISTRICTS[层]` 按城区多边形拼接（中层：核心=曼哈顿、商业=旺角最密的一段（偏移 (0, -5.2)，C 区检查点落在里面）、外围=布鲁克林；下层：工业=鲁尔、城中村=深圳；上层下方城市=中层）。交界铺林荫大道、75 m 过渡带密度渐变；去掉压在车行道中线上的「楼」（曼哈顿有一条斜穿好几个街区的关系）；城中村按握手楼尺度生成（楼宽 10–15 m、楼距 1–3 m，沿最近道路方向成片），7 号井 1.8 单位内按九龙城寨密度（楼距几乎为零、12–14 层）。`tc_common.Layer(..., city='mid'|'low'|'upper')`。
- 中层脚本：霓虹按城区（核心 .12、商业 1、外围 .3）；核心区高楼顶冠一圈暖金色灯带 + 少量暖色溢光；车流按主干道 × 城区。`--data-only` 跑通（5794 栋：核心 1778 / 商业 1611 / 外围 2405）。
- 下层脚本：工业带大轮廓 → 厂房、小轮廓 → 工人住宅（坡顶）；城中村握手楼压到 6–18 m，屋顶加建铁皮房、篷布、水箱；OSM 储罐 → 圆柱；货运站放在鲁尔编组场附近。`--data-only` 跑通（工业 803 / 城中村 6908 栋）。
- 上层：`blender/data/tc_islands.json` 每座岛加 `estate_style`（english 14、chateau 12、suzhou 3、lingnan 2；伊甸 neoclassical、银冠堡 fortress；相邻岛尽量不同）；`tiancheng_upper.py` 按风格建庄园（英式：L 形石头主楼 + 蛇形湖 + 成团的树 + 弯车道；法式：U 形主楼 + 角楼 + 绿篱方格花坛 + 中轴水渠 + 林荫道；苏州：粉墙黛瓦围合 + 不规则水池 + 假山 + 九曲桥 + 厅堂；岭南：青砖院落群 + 鱼池 + 水榭 + 浓密的榕树），导出 `estate_style` 到 tc_upper.json 的 islands。8000px 局部样张看过英式、法式、岭南三种，已把园子整体放大 1.5 倍（岛上空草坪太多）。
- **没做**：2000px 草稿（中层 v3 渲到一半停了）、`docs/drafts/` 的 v3 对比图。仓库里的 `map/data/tc_*.json` 保持你那边的版本，没有提交云端重新生成的。
- 调试图（拼接后的平面）可以用这段看：`python3 -c "import sys; sys.path.insert(0,'blender'); import numpy as np, tc_city; c = tc_city.City(np.random.default_rng(1), 'mid')"`（需要 bpy 的 mathutils）。

## 2026-09-27 云端：地图事件联动（用户新需求）—— **不用重渲**（只改查看器、卡内脚本和文档）
- 新文件 `map/events.js`（`viewer.html` 在 OpenSeadragon 之后引入）；`viewer.html` 只加了四处挂钩：`onOpen` 里 `TCEvents.render()`、消息 `eden-map:events`、启动时 `TCEvents.pollFeeds()`、地点卡 `.src` 换行样式。本机改 `viewer.html` 前请先拉取。
- `map/tavern/eden-map.js`：扫描聊天里的 `data-tcmap="类型=…;地点=…;标题=…"` 隐藏标签，悬浮按钮显示事件数，发给查看器。
- `tools/pack_npm.sh` 的白名单加了 `map/events.js`（查看器现在依赖它）。
- 协议、数据源、分阶段见 `docs/map-events.md`；`maps.json` 可选 `feeds`（默认没有）。
- 世界书（加了「地图联动规范」和两条视觉样例）直接发给了用户，没进仓库。
- 可以重跑：无（三层底图都不受影响）。

## 2026-09-27 本机：渲染加速（a6d2393）
- 默认改为只用 GPU、自适应采样、GPU 降噪、光源树；完整日志写到 `logs/render_<层>.log`。详见 `docs/render-performance.md`。
- **goal 会话请在阶段 1 开始前先跑一次** `bash tools/bench_render.sh mid 2000 64`（约 5 分钟）：比较「只用 GPU」和「CPU + GPU」，把结果写进 docs/render-performance.md，选快的；再用 `--crop` 比较 64 和 128 采样，没有明显差别就改用 64。
- 本机 8K 中间版底图已提交（c0716ac）。下层的问题：中层支柱在地面的投影是一片规整的黑圆点，很假，请在阶段 1 里一起处理（按城区疏密、打乱排列，或改用柱基而不是圆形暗斑）。**本机会话到此停手**，之后仓库由 goal 会话负责。

## 2026-09-26 云端：任务 4 进度
### 1. 上层云海重做 —— 已完成，**可以重跑：upper**（`bash tools/render_all.sh upper --res 8000 --samples 128`）
- 新文件 `blender/tc_clouds.py`（`build_cloud_sea(layer, islands, sun)`）；`tiancheng_upper.py` 只加了一行调用（在建主太阳之后，`--below clouds` 时）。旧的 `below_clouds()` 平面由它删掉，没改岛与庄园的代码。
- 做法：metaball 融合的积云团 + 按主太阳方向烘进底色的三阶明暗（《部落冲突》式），云缝下 250 m 是暗灰蓝底云；伊甸外圈一环亮云（云台）。
- 怪影的根因与修法：①岛下倒锥岩体在投水滴形的影 → 带 `rock` 材质的物体 `visible_shadow = False`；②主太阳天顶角 40° 让影子偏出 100–700 m → 云只接收一盏「云用太阳」（灯光链接；方位角同 `SUN_ROT` 215°，天顶角 14°，圆盘角 5°），主太阳照岛不照云。影子与岛同形、就近、越高越虚。
- 草稿：`docs/drafts/clouds_v1_*`、`clouds_v2_*`（toon / soft 对比）、`clouds_v3_toon.jpg`（选定）、`clouds_v3_toon_8k_crop.jpg`、`clouds_old_vs_v3.jpg`。调研与三轮自评见 `docs/clouds.md`。
- 8K：metaball 网格分辨率随 `--res` 自动取 0.035（约 220 万顶点，生成约 70 秒，CPU）；材质只是漫反射，GPU 渲染时间基本不变。可选参数：`--clouds soft`（写实对照）、`--cloud-light`、`--cloud-res`。
- 注意：渲染会覆盖 `map/data/tc_upper.json`（和以前一样）；云端草稿后已还原，没提交。
