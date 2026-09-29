# 渲染资产依赖表

背景：`docs/render-retro.md` W3——上层底图先于伊甸庄园（estate2）定稿，庄园尺寸 / 锚点后来变了，上层底图跟着重渲了一遍（v7）。任务并行派发前没人查依赖顺序。这份表列出「谁依赖谁」，`tools/check_render_deps.py` 用 git 提交时间粗略核对下游是不是比上游旧，接进 `tools/smoke.sh`（只警告，不阻断）。

## 依赖图（上游 → 下游）

```
上层建筑与岛屿（blender/upper_islands/*.py，各 isle*.py）
  └─→ 伊甸庄园（map/estate/*、blender/estate2/*，site.glb / house.glb）
        └─→ 上层 8K 合成（map/art/tc_upper.dzi、tc_upper_city.dzi）
              └─→ 云海层（map/art/tc_clouds*、ISLAND_SHADOWS 开关）
                    └─→ 分时段变体（白天 / 黄昏 / 夜景等 tc_*_dusk / tc_*_night 一类文件，若存在）

中 / 下层地形与基础建筑（blender/tiancheng_mid.py、blender/tiancheng_low.py）
  └─→ 中 / 下层 8K 合成（map/art/tc_mid.dzi、map/art/tc_low.dzi）
        └─→ 中 / 下层 8K 精修（region_patch 产出，仍写回同一 .dzi）
              └─→ 分时段变体（若存在）
```

要点：
- **先建筑 / 地形，后合成**：任何一栋建筑或庄园还没定稿（用户没在风格帧 + 手机截图上点头，见 `docs/onboarding.md` 检查点规则）之前，不要去渲包含它的整层 8K 合成——定稿后尺寸 / 位置一变，8K 合成就得重渲，这正是 W3 的浪费。
- **先合成，后时段变体**：白天档没定稿前不要批量出黄昏 / 夜景变体。
- 派发并行任务前，先看这张图：如果两个任务分别在改上游和下游，让下游任务等上游提交后再取最新代码，或把两个任务合并成一个顺序任务。

## 产物 → 源文件对照（供检查脚本使用）

| 产物（下游，git 记录时间） | 上游源文件（一个或多个，任一比产物新就警告） |
|---|---|
| `map/art/tc_upper.dzi`, `map/art/tc_upper_city.dzi` | `blender/tiancheng_upper.py`, `blender/upper_islands/*.py`, `map/estate/plan.js`, `blender/estate2/*.py` |
| `map/art/tc_mid.dzi` | `blender/tiancheng_mid.py` |
| `map/art/tc_low.dzi` | `blender/tiancheng_low.py` |
| `map/art/tc_clouds.dzi`（若存在） | `map/art/tc_upper.dzi` |
| `map/estate/model/site.glb`, `map/estate/model/house.glb` | `blender/estate2/*.py` |

`blender/landmarks/**/*.py` 不算 `tc_mid` / `tc_low` 底图的上游：地标走 `tools/landmark.py` 流水线，产物是独立 glb（`map/props/<id>/`），`tiancheng_mid.py` / `tiancheng_low.py` 不 import 它们；只有 `ship --patch-basemap` 才会真的改底图，那一步会直接改到 `.dzi` 本身（`.dzi` 自己的提交时间会跟着变新，不需要靠这张表来发现）。以前把整个 `blender/landmarks/**/*.py` 都列成上游，每加一个不进底图的新地标就会误报「底图落后」（head #54：knights_camp 是独立 glb 地标，误报过一次）。

窄例外（`check_render_deps.py` 的 `NOT_UPSTREAM`，只写确切路径，给以后万一又把 landmarks 通配符加回来的情况留个后备）：`blender/landmarks/export_glb.py` 只导出 glb、`blender/landmarks/lm_anchors.py` 只算看板标签锚点，都不参与底图渲染。

## 检查工具

```bash
python3 tools/check_render_deps.py            # 列出「下游比上游旧」的告警，退出码始终 0（只警告）
python3 tools/check_render_deps.py --strict    # 同样的检查，但发现问题退出码 1（供手动核对用，不接 smoke）
```

原理：对上表每一行，取产物文件和每个上游文件（或匹配到的通配符文件里最新的一个）各自最近一次 `git log -1 --format=%ct` 的提交时间戳；产物文件不存在或找不到提交记录时跳过（可能是本地未提交的新产物，不算错误）；上游比产物新就打印一行警告。这只是粗略信号（提交时间不是渲染时间），发现告警时人工判断要不要重渲，不必照单全收。

已接入 `tools/smoke.sh`（`check_render_deps（警告）` 步骤），只打印，不影响 smoke 的通过 / 失败。
