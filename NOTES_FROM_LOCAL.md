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
