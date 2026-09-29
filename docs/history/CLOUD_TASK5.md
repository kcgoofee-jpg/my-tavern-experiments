# 云端任务 5：上层庄园与浮岛重做 + 伊甸府邸 Blender 模型（长任务，重型，可以慢慢做）

> **本文已作废的约束（2026-09-29）**：「不建模、不描写任何性相关或束缚类道具、设施与场所细节」与「用途不明的私密房间一律中性」这类硬约束**已撤销**（用户决定；理由：不按原卡补全会被原作者投诉）。本文件是历史任务书，原文不改；现行规则见 `docs/card-digest.md`、`docs/card-omissions.md` §4、`docs/eden-estate.md`。

先 `git pull`，读 `NOTES_FROM_LOCAL.md`（最后两节）、`docs/GOAL_v0.9.1.md`（阶段 2）、`docs/tiancheng-maps.md`、`docs/eden-estate.md`、`docs/clouds.md`。**不要问问题，做完一项提交推送一项**，并在 `NOTES_FROM_LOCAL.md` 写一句进度。
不改 `VERSION`、不打标签、不跑 `tools/build_card.sh`。本机负责审阅门控（四位审阅 + 园林与建筑史审阅 + 架构师），你负责做到能过门控。

## 文件边界（避免和本机冲突）
- **你可以改**：`blender/tiancheng_upper.py`（全部，包括庄园与岛）、`blender/tc_clouds.py`、`blender/data/tc_islands.json`、新建 `blender/eden_manor.py`、`blender/tc_estates.py`（如需要）、`docs/upper-estates.md`（新）、`docs/drafts/`。
- **本机正在改，你不要改**：`blender/tc_common.py`、`tc_city.py`、`tc_detail.py`、`tiancheng_mid.py`、`tiancheng_low.py`、`map/` 下全部文件（查看器、`map/estate/`、`map/data/maps.json`）。需要这些文件配合时，在 NOTES 里写清楚要什么，本机来改。
- `map/data/tc_upper.json` 由上层脚本导出：可以提交你最终版的导出（岛的新位置与尺寸），草稿阶段不要提交。

## 1. 上层庄园与浮岛重做（最重要，等于 GOAL 阶段 2）
用户原话：「每个岛都长一个样，这很致命」；「user 的庄园做成别人的 10 倍大比较合眼，也方便后续在上面 build」。
- **伊甸放大**：面积 ≈ 最大普通庄园（isle6）的 10 倍，约线性 2 倍（rx≈3.35、ry≈2.5 单位，约 670 × 500 m），默认视野里一眼最显眼。周围的岛往外推开，不重叠；银冠堡等地标岛保留。改 `tc_islands.json`，并在 NOTES 写一句（本机同步中层「上层投影」与查看器）。
- **每座岛都不一样**：
  - 轮廓：按岛 id 定种子的噪声扰动，有海岬与内湾，少数长条或双峰岛；不用正椭圆。
  - 地形：岩壁、台地、湖或瀑布、裸岩，按风格与大小变化；草色按风格区分（英式深绿草场、法式修剪浅绿、苏州水面多、岭南浓荫）。
  - 岛缘：石墙、树根垂挂、崖边，不要统一的浅色描边圈。
  - 布局：主楼位置、朝向、附属建筑（温室、马厩 / 机库、仆役楼、亭台）数量随岛变化，不都放正中。
  - 园林占岛面积的多数，不能是一栋楼加一片空草坪。英式 / 法式 / 苏州 / 岭南在 800 m 视野下都能认出来，相邻岛风格不同。
- **导出轮廓**：`tc_upper.json` 的每座岛加 `outline`：归一化坐标多边形（24–48 个点，左上原点，与 `nx/ny` 同一坐标系）。本机据此把结界圈与中层投影改成贴合真实轮廓。
- **伊甸本岛**：用第 2 项的府邸模型，岛面按 `docs/eden-estate.md` 的室外布局：前庭喷泉与法式花坛、后庭人工湖、访客停靠平台、大片园林，给以后加建留出成片的空地（但要是有设计的草坪 / 花园，不是空白）。
- 云海保持你上一版（metaball + 三阶着色）；岛变大、轮廓变了以后，岛影仍要与岛同形、就近、柔边，伊甸外圈的亮云环跟着放大。
- 草稿：2000px（`--res 2000 --samples 32`）出 `docs/drafts/upper_v4_*.jpg`；另外每种风格挑 2 座岛做 8K 局部（`--crop`），伊甸做 1 张 8K 局部；再做一张「6 座同风格岛并排」的拼图（门控要求审阅者能说出它们各自的区别）。每轮在 `docs/upper-estates.md` 写自评：可读性、差异度、比例、有没有怪影。最多 3 轮，然后在 NOTES 写「可以审阅：upper」。

## 2. 伊甸府邸 Blender 模型（`blender/eden_manor.py`）
- 函数 `build_eden_manor(layer, center, rot, scale, cutaway=None)`：新古典白石府邸，按 `docs/eden-estate.md` 的 5 层与房间尺寸建外观（对称立面、中央柱廊 + 山花、檐口、女儿墙栏杆、窗套、屋顶平台与穹顶或灯亭、两翼）。第 1 项在上层底图里用它（正俯视时屋顶细节最重要）。
- `cutaway='F1'…'F5'` 时切掉该层以上，墙截到约 1.2 m，内部按房间建地面材质与中性家具轮廓（和本机 three.js 版 `map/estate/index.html` 的布局一致；以 `docs/eden-estate.md` 为准，有冲突在 NOTES 里说）。
- 出一个独立脚本入口：`blender -b -P blender/eden_manor.py -- --floor F1 --res 2000 --out ...`，等轴正交相机，出 F1–F5 与外观 6 张 2000px 草稿到 `docs/drafts/eden_manor_*.jpg`。这是以后「伊甸庄园地图」的正式底图来源，本版只要草稿。
- 硬约束：不建模、不描写任何性相关或束缚类的道具、设施与场所细节；`docs/eden-estate.md` 里标为中性的房间只放普通家具。

## 3.（有空再做）上层航线与银冠堡巡逻数据
- `tiancheng_upper.py --data-only` 导出 `routes`：停靠平台之间的航线折线与银冠堡巡逻环（归一化坐标），写进 `tc_upper.json`。本机在查看器里画成可开关的叠加层。

## 约束（同前）
- 只用 Blender 写实渲染，不用手绘 SVG / Canvas。
- 提交信息结尾加：`Co-Authored-By: Claude <noreply@anthropic.com>`。
