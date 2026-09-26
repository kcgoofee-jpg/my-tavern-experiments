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
