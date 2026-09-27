# 云端任务 8：伊甸庄园 Blender 从头建模（长任务，全部用 Opus 5.5，子代理不限）

先 `git pull`，读 `NOTES_FROM_LOCAL.md`（最后四节）、`docs/eden-estate.md`（设定以它为准）、`CLOUD_TASK7.md` 第 3a 条（素材许可规则）、`map/estate/reviews/` 与 `docs/reviews/estate_c3/`（三轮审阅意见，照着避坑）、现有 `blender/eden_manor.py` 与 `docs/drafts/estate_blender_*.jpg`。
**不要问问题，做完一步提交推送一步**，并在 `NOTES_FROM_LOCAL.md` 写一句进度。不改 `VERSION`、不打标签、不跑 `tools/build_card.sh`。
**不属于 v0.9.1**：v0.9.1 按冻结的 three.js 版发；本任务是下个版本的庄园。可以和任务 5 的上层返修并行，但任务 5 优先。

**从 0 开始**：不移植、不参考 `map/estate/` 的 three.js 代码、造型和布局（用户：「threejs 代码版本问题太多，重复审美太严重」）；只以 `docs/eden-estate.md` 的设定和公有领域历史府邸为依据，旧 `eden_manor.py` 也只可参考尺寸表。

用户原话：「three.js 不改了，后续需要重新用 blender 从头建模」；「马桶、毛巾都清楚有质感，整体构造和设计美学有顶奢和传承感」。

## 文件边界
- **你负责**：`blender/eden_manor.py`（可重写）、新建 `blender/estate/`（模块、材质库、素材加载）、`map/estate/assets/`（CC0 素材与 CREDITS.md）、新建 `map/estate3d/`（第 3 步）、`docs/eden-estate.md`、`docs/drafts/estate_b*`。
- **冻结，不要改**：`map/estate/` 里现有的 three.js 页面（index.html、*.js、closet/）。
- **本机负责**：`map/viewer.html`、`map/data/maps.json`、8K 正式渲染与切瓦片。要查看器配合时在 NOTES 写清楚。

## 1. Blender 模型（两个预览点共用）
- 按 `docs/eden-estate.md` 从头建：主楼 5 层 + 两翼 + 附属建筑 + 园林 + 岛体，尺寸与岛新尺寸（约 670 × 500 m）一致。
- 模块化：建筑壳、每层每个房间、家具、园林分文件，函数可单独出图。
- 材质：一套 PBR 材质库，与设定里的色板一致（石材、木作、黄铜做旧、织物、瓷器）；外墙要风化、雨痕，不要新样板间感。
- 近看要清楚有质感：马桶（水箱、座圈、盖、手柄）、洗手台与龙头、爪足浴缸、毛巾（厚度、折边、绒圈贴图）、床品、窗帘、地毯、大理石、黄铜。优先用 Poly Haven 等 CC0 素材，许可规则同任务 7 第 3a 条，每个文件记进 `map/estate/assets/CREDITS.md`。
- 硬约束：不建模、不描写任何性相关或束缚类道具、设施与场所细节；设定里用途不明的私密房间一律中性，只放普通家具。
- 每一步出 2000px 草稿 `docs/drafts/estate_b1_*.jpg`，用 `tools/review/` 的审阅流程打分（建筑、室内、顶奢营销，再加一位按本轮改动现编的人设，见 `tools/review/fresh_persona.md`），每位 ≥ 8 再往下走，最多 3 轮。

## 2. 预览点 ⑥：剖切等轴图（主方案，庄园地图的正式底图）
- 固定等轴相机，出 7 张：外观、全部（逐层错开）、F1–F5 剖切（切掉该层以上，墙截到约 1.2 m）。同一相机、同一光照，切换楼层时画面对齐。
- 脚本入口：`blender -b -P blender/eden_manor.py -- --view F3 --res 2000 --samples 32 --out ...`，支持 `--crops`（见 `docs/tooling.md`）。
- 导出每张图上的房间多边形（归一化坐标，左上原点）到 `map/data/eden_estate_tiles.json`：房间 id、中英文名、alias（与现有 `maps.json` 的 `eden_estate.rooms` 一致）、所在楼层。查看器用它做点击与高亮。
- 云端只出 2000px 草稿和数据；**8K 正式渲染由本机做**（GPU），做完在 NOTES 写「可以重渲：estate_tiles」。

## 3. 预览点 ⑦：3D 模式（彩蛋，可旋转）
- 从同一个 Blender 模型导出 glTF：光照烘焙进贴图（主楼与主要房间），meshopt 压缩几何、KTX2 压缩贴图。
- 新页面 `map/estate3d/index.html`（three.js，本地 vendor，不走 CDN）：只做加载模型、环绕旋转、按层剖切、点房间飞近；缩放规则同任务 7（滚轮以光标为中心、双指捏合、双击拉近、+ / − / 复位、不带着父页面滚动），嵌入协议沿用 `estate:*` 消息。
- 体积：首屏 ≤ 5 MB，全部 ≤ 30 MB；手机 375px 下 30 fps 以上，DPR 下限 1.5、始终开抗锯齿。
- 做完在 NOTES 写「可以审阅：estate3d」。

## 约束（同前）
- 提交信息结尾加：`Co-Authored-By: Claude <noreply@anthropic.com>`。
