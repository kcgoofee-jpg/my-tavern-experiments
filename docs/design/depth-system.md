# 纵深系统（depth system）

地图上表现「远近 / 高低」的子系统：越远越低的岛画得越小、雾越重、色调越冷，被更多层云盖住。
- 依据：设定稿 `docs/upper-setting.md` v2（用户 2026-09-28 批准），接口规格 `docs/reviews/arch_overall_review.md` §3（架构评审，必须遵守）。
- 目前只有天城上层接入；别的层要用，按下面「扩展点」各自加一份数据。

## 1. 数据：唯一数据源

| 文件 | 内容 | 谁维护 |
|---|---|---|
| `map/data/upper_depth.json` | 纵深数据，只放纵深字段，没有 x / y | 手填 |
| `map/data/schema/depth.schema.json` | 上面这份数据的结构约束 | 改字段时改 |
| `blender/data/tc_islands.json` | **唯一岛表**：id、x / y、真实尺寸 rx / ry（不含远近缩放）、群落、marker（`maps.json` 的标记 id）；**没有 z** | 手填 |
| `maps.json` 该层的 `"depth": "data/upper_depth.json"` | 按层开启纵深：viewer 看到这个字段才启用视差 / 悬停聚焦（P3） | 手填 |

`upper_depth.json` 的字段：
- **`camera`**：`{alt_near, alt_far}`。每座岛的深度 `d = clamp((alt_near − alt) / (alt_near − alt_far), 0, 1)`；岛上显式写了 `d` 就用它（「退路方案」只改 d，不改海拔）。
- **`channels`**：每个通道一对近 / 远值，按 d 线性插值。
  - `scale` 远近缩放；
  - `haze` 雾量，`color` 是雾色；
  - `tint` 乘色（近暖远冷），`sat_far` 远处饱和度变化，`gamma_far` 远处对比；
  - `label` 标签不透明度；
  - `parallax` 视差系数，`enabled` 开关；
  - `ward` 结界格边强度（扩展通道）。
- **`cloud_sheets`**：`[{id, alt, cover}]` 三张高度层云片（c1 1150 m、c2 1020 m、c3 930 m）。一张云片只盖比它低的岛。
- **`islands`**：`{岛 id: {alt, d?, overrides?}}`。岛 id 用岛表的 id。`overrides` 里写了数值的通道直接取这个值（伊甸 `haze: 0, ward: 0`）；`ward_edge: "cold"` 表示「Y」保留的冷光细边。

## 2. 数学：一份规格，两种语言
- `map/core/depth.mjs`（前端，纯函数，不碰 DOM）与 `blender/depth.py`（渲染 / 合成，纯 Python，不依赖 bpy）函数一一对应：
  - `depthOf` / `depth_of`：算 d；
  - `channel(name, d, cfg, overrides)`：取某个通道的值；
  - `cloudsAbove` / `clouds_above`：哪些云片盖在这座岛上；
  - `island`：一座岛的全部通道。
- 常数只写在数据文件里，代码里只有公式。取整两边统一为「×1e4 后半数进位」。
- **对拍**：`tests/fixtures/depth_golden.json` 是冻结的 cfg 加期望值。
  - JS 侧：`tests/depth.test.mjs`（`node --test`）；
  - Python 侧：`tools/test_depth.py`（在 smoke 里）。
  - 改公式时两边同改，然后运行 `python3 tools/test_depth.py --regen`，两边都要通过。

## 3. 管线（P0–P1，已实现）
1. **渲染**（`blender/tiancheng_upper.py`）：
   - 读岛表和纵深数据，z = (alt − 700) / 100，rx / ry = 真实尺寸 × scale；
   - 结界格边强度取 `ward`，冷边取 `ward_edge`；下方城市的霾取 `haze(d = 1)`；
   - 成图旁写一份 `<out>.meta.json`，记录 `upper_depth.json` 和岛表的哈希（改了就知道要重渲）。
   - 卡内岛的建筑用三维模型的正交俯视抠图，按真实尺寸渲染，贴图时再乘 scale（`tools/isles_into_upper.py`）。
2. **合成**（`tools/upper_depth_post.py`，只做像素，不写常数）：
   - 逐岛蒙版（渲染时用 `TC_DUMP_OUTLINES` 导出的轮廓）；
   - 依次做去饱和、对比、乘色、混向雾色；
   - 三张云片从低到高叠，每张挖掉比它高的岛和塔冠；
   - 银冠堡一侧的云隙里透出极淡的中层楼顶（设定稿 Q8）。
   - 伊甸原样不动。
3. **烘焙边界**：云和雾烘进底图；标签、视差、悬停聚焦都是实时的（P3，前端读同一份数据、同一个 `depth.mjs`）。
4. **预览**：用 `scratchpad v12.sh` 的同款步骤；8K 走同一脚本链（等用户确认）。

## 4. 门控（check_maps / check_pack / smoke）
- `depth.schema.json` 结构校验，包括包里的 depth 文件（check_pack）。
- 纵深数据的岛 id 必须在岛表里；岛表里每座岛也必须有纵深条目，所以新岛必须在同一次提交里加 depth 条目。
- 岛表的 `marker` 必须是该层 `maps.json` 的标记。
- **Blender ↔ 前端一致**：`map/data/tc_upper.json` 导出的岛集合和岛表不同时报警告。这只说明底图 / 点位还没按新岛表重渲；重渲后应该消失。
- 对拍 golden。

## 5. 常见操作
- **加一座岛**：
  1. 岛表加一行（id、x / y、真实 rx / ry、marker）；
  2. `upper_depth.json` 的 `islands` 加 `{alt}`；
  3. `maps.json` 加标记，`addon_places.json` 同步（世界书规则）；
  4. 跑 check_maps，然后重渲。
- **改档位 / 远近**：只改该岛的 `alt`（或显式 `d`），不要改岛表尺寸。
- **全局调手感**（雾更浓、远处更小）：改 `channels` 的 near / far。golden 用冻结 cfg，不受影响。
- **退路方案**（保持旧海拔、只调远近）：给岛写显式 `d`。

## 6. 扩展点
- **其他层**：新建 `map/data/<layer>_depth.json`，同一 schema，在 `maps.json` 该层加 `"depth"`。中层 / 下层的 alt 语义换成楼高 / 地面，只换 `camera`。
- **新通道**：
  1. `channels` 里加一对 near / far；
  2. schema 登记；
  3. 两个实现里 `channel()` 的默认分支已经是线性插值，只有非线性通道才要改公式，同时改 golden。
- **其他卡的包**：包里的 `maps.json` 同样可以加 `"depth"`，check_pack 会校验。

## 7. 后续（不在本轮）
- **P2**：通道分层输出、8K 底图挖空、逐岛 2–4K 叠加层（像素对齐）。
- **P3**：viewer 端的视差、漂浮、标签按 d 调整、悬停聚焦、手机「看全区」按钮。登记在 `docs/ui-refactor-backlog.md`。
- ~~**合并 fog 实现**：`map/app/fog.mjs` 与 `map/core/fog.mjs` 合并后改用 depth 模块（架构评审 §2，暂不做）。~~ ✅ C2：core/fog.mjs 并入 core/depth.mjs；upper_haze.py 已退役；雾色统一 `depth.py haze_color`。
- **meta 接入**：`make_dzi` 的 `*.dzi.meta.json` 也记录 depth 哈希（配合 check_render_deps）。

## 8. view: oblique（斜视主地图；v14 预览已实现，8K 待用户确认）
用户决定（2026-09-28）：上层主地图改成 2.5D 斜视成图；另有一个真三维模式，以后由别的任务用同一份数据做。全部按层配置，不写死 tc_upper。

### 8.1 按层配置（`<layer>_depth.json` 新增 `view` 段，schema 同步）
```json
"view": {
  "mode": "oblique",
  "camera": {"az_deg": 165, "pitch_deg": 35, "lens_mm": 50, "aspect": 1.6, "focus": "eden", "focus_frame": [0.5, 0.618]},
  "anchor_dz_m": 20,
  "occlusion": {"hide_ratio": 0.4, "lift_label": true, "dot_when_hidden": true}
}
```
- `mode` 为 `top`（默认，与现在相同）或 `oblique`。viewer 与渲染都只读这一段。
- `camera` 只写意图：方位、俯角、焦距、画幅比、焦点岛，以及焦点岛在画面里的位置。真正的矩阵由渲染求出后写进 meta。

### 8.2 相机矩阵：唯一来源
- 渲染脚本按 `view.camera` 摆相机，把 4×4 世界→相机矩阵、投影矩阵、画幅像素尺寸写进成图的 `<out>.meta.json`。同一份 meta 还记录 depth 和岛表的哈希（已实现）。
- **标记投影**：岛表里每座岛有 (x, y)，纵深数据里有 `alt`。锚点 = (x·100, y·100, alt + anchor_dz_m)，米制。
- 共享投影模块：
  - `map/core/project.mjs` 和 `blender/project.py`：`project(anchor, meta) → (u, v)`，瓦片归一化坐标；
  - 规格与 depth 一样一式两份，另加一份 golden（`tests/fixtures/project_golden.json`）对拍。
- 点位导出（`<layer>.json` 的 markers）改由投影生成，不再手摆；check_maps 核对点位与 meta 一致。
- 真三维模式直接用同一个相机矩阵作初始视角，用同一组三维锚点放标签。

### 8.3 遮挡
- 渲染时逐岛输出可见蒙版（object index pass）。导出每座岛的「可见比例」和「可见包围盒上沿」到 meta。
- 规则由 `view.occlusion` 配置：
  - 可见比例 < `hide_ratio` 时，标签上移到可见包围盒上沿，用引线指向锚点；
  - 可见比例为 0 且 `dot_when_hidden` 时，只放一个小点，点按才展开。
- 实现在前端共享模块，读 meta，不自己做几何判断。

### 8.4 应用到另一层（中层 / 下层 / 世界图）
1. 新建 `map/data/<layer>_depth.json`：写 `camera`（该层的高度语义，如楼高或地面）、`channels`、`islands`（这里指该层的地块或地标，id 取该层的实体表），以及需要时的 `view`。
2. 在 `maps.json` 该层加 `"depth": "data/<layer>_depth.json"`。
3. 渲染脚本：
   - 读 `blender/depth.py`：z、缩放、雾；
   - 读 `blender/project.py`：摆相机、写 meta；
   - 合成照用 `tools/upper_depth_post.py` 的通用步骤（该工具届时改名 `depth_post.py`，参数只来自数据）。
4. check_maps 自动覆盖：schema、id 对齐、meta 一致。前端看到 `depth` / `view` 字段才启用视差、悬停和斜视投影。
5. 本轮不做其他层；上层是试点。

### 8.5 实现状态（v14 预览，2026-09-28）
- **配置**：`upper_depth.json` 的 `view`（schema 已登记）。`focus_frame: null` 表示按全部岛的包围盒居中；要固定焦点位置时写 `[u, v]`。
- **数学**：`blender/project.py` 与 `map/core/project.mjs`，包括 `fit_camera`、`project`、`label_rule`；`tests/fixtures/project_golden.json` 双边对拍，进 smoke。
- **渲染**：
  - `blender/oblique.py`，由层脚本在 `TC_OBLIQUE=1` 时调用；
  - 灰模构图测试用 `TC_OBLIQUE_GREY=1`；
  - 三维模型按 `TC_MODELS`（岛 id → .blend + 原点）追加；
  - 云底和云片都只自发光，不接收影子（无岛影）。
- **meta**：`<out>.meta.json` 里有 camera（唯一来源），每岛的 anchor（米制三维锚点）、anchor_uv、poly_uv / tip_uv、depth，以及 depth_hash。
  - `tools/oblique_post.py` 再写回 visible_ratio、label（normal / lift / dot）、markers（标记 id → u / v / 规则 / 标签位置）。
- **遮挡**：按远近用画家算法做投影凸包（岛面 + 锥尖），可见比例 < 0.4 时上移标签，完全看不见时只留一个点。标注版标签重叠时往下让。
- **导能管**：规则是「离塔最近的 3 座岛，且连线不经过伊甸」，由渲染脚本自动选。v14 选中罗斯柴尔德、银冠堡、维克多。
- **v15**：
  - 岛底由岛表 `underside` 规格生成，check_maps 拦重复；
  - 云底可以用中层底图（`tools/dzi_mosaic.py` → `TC_MID_TEX`）；
  - 调节塔的位置在岛表 `anchors`；
  - `focus_frame [0.382, 0.64]` 让焦点岛做前景主体；塔冠也纳入画框拟合。
