# 渲染性能：实测与加速经验（本机 M 系列 Mac，Blender 5.2 Metal）

## 实测（2026-09-27，OSM 九龙版，8000px，128 采样，CPU + GPU 混合）
| 层 | 用时 | 备注 |
|---|---|---|
| 上层 · 云海 | 约 8 分钟 | 白天、岛少，最快 |
| 上层 · 带城市 | 约 12 分钟 | |
| 中层 | 约 33 分钟 | 夜景，几千个霓虹发光面 |
| 下层 | 超过 45 分钟 | 夜景，钠灯 + 贫民窟屋顶面数多 |

四张加起来约 1 小时 40 分钟。渲染期间 Blender 进程 CPU 占用约 550%：CPU 也在参与渲染（混合模式）。

## 这次踩到的坑
1. **看不到进度**：渲染输出经 `| tail` 过滤，结束前什么都看不到。现在 `render_all.sh` 把完整日志写到 `logs/render_<层>.log`，随时 `tail -f`。
2. **混合设备**：脚本原来把 CPU 和 GPU 都打开。在 Apple Silicon 上 CPU 分到的块慢、还和 GPU 抢内存带宽，未必更快。现在默认只用 GPU（`--devices hybrid` 或 `TC_DEVICES=hybrid` 可改回），**先用 `tools/bench_render.sh` 实测再定**。
3. **一口气渲四张**：改一层也全渲一遍。以后只渲改过的层（`render_all.sh mid`）。
4. **8K 出图前没做局部检查**：出了问题要整张重来。先 2000px 草稿，再 `--crop` 渲 8K 局部，最后才出整张。

## 已经做的加速（`blender/tc_common.py`）
- 默认只用 GPU（Metal）；降噪也放 GPU（`denoising_use_gpu`，Blender 4.1+）。
- 自适应采样 `adaptive_threshold` 0.015（`--noise 0.02` 更快；俯视大图 0.02 肉眼差别很小）。
- 光源树 `use_light_tree`：夜景几千盏小灯时噪点更少、收敛更快，同样采样数更干净，可以降采样。
- 夜景层限制反弹次数（已有：`bounces=4`，漫反射 / 光泽 2 次）、关焦散。
- 分块渲染 `tile_size 2048`：8K 内存不随分辨率平方涨。
- 建场景用 numpy 批量建网格（已有：约 35 秒降到约 2 秒）。

## 还能做的（按性价比）
1. **采样降到 64**（加光源树和 GPU 降噪后）：夜景预计省一半时间。用 `--crop` 渲同一块，对比 64 和 128 的差别再决定。
2. **草稿用 Eevee**：构图、配色阶段用 Eevee 秒出，定稿再用 Cycles。
3. **发光面改成纯自发光材质、不参与间接光**：霓虹只需要被看到，不需要照亮别人；能大幅减少夜景噪点。
4. **只渲变化的区域**：城区调整只影响局部时，渲 8K 局部再拼回整图（需要写拼接脚本）。
5. **渲染时别开其他重负载**：浏览器里跑地图、另一个 Blender 都会抢 GPU。

## 流程约定
- 草稿：`bash tools/render_all.sh mid --res 2000 --samples 16`（1–3 分钟）
- 局部：`blender -b -P blender/tiancheng_mid.py -- --res 8000 --samples 64 --crop x0,y0,x1,y1`
- 正式：`bash tools/render_all.sh <改过的层> --res 8000 --samples 64`，后台跑，看 `logs/render_<层>.log`
