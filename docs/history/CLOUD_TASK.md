# 云端任务：天城中层、下层草稿 + 接入地图

> **本文已作废的约束（2026-09-29）**：「不建模、不描写任何性相关或束缚类道具、设施与场所细节」与「用途不明的私密房间一律中性」这类硬约束**已撤销**（用户决定；理由：不按原卡补全会被原作者投诉）。本文件是历史任务书，原文不改；现行规则见 `docs/card-digest.md`、`docs/card-omissions.md` §4、`docs/eden-estate.md`。

你在云端容器里接手这个仓库。**不要问问题，按下面做完，提交并推送到新分支 `cloud/tc-mid-low`。** 先读 `ROADMAP.md`（P1 一节）和 `CHANGELOG.md` 了解现状。

## 已有的东西
- 地图查看器：`map/viewer.html`，多地图框架。注册表 `map/data/maps.json` 里 `tc_mid`、`tc_low` 目前是 `"status": "planned"`。
- 上层渲染脚本：`blender/tiancheng_upper.py`（Blender 无界面运行，正俯视正交相机，1 单位 = 100 m，片区 W=30 × H=18.75，也就是 3 km × 1.875 km）。它导出 `map/data/tc_upper.json`（markers 与 islands 的归一化坐标）。
- 切瓦片：`tools/make_dzi.py`（需要 Pillow）。一键渲染：`tools/render_all.sh [upper mid low] --res N --samples N`。

## 要做的事
1. **抽公共代码**：把上层脚本里的城市生成（`district`、`city_blocks`、屋顶配色、路面）抽到 `blender/tc_common.py`，三层共用，保证三层的街道和楼的平面位置完全一致（同一个随机种子，城市生成要在其他随机调用之前）。上层改完后重新出一张草稿，确认观感没变。
2. **中层 `blender/tiancheng_mid.py`（钢铁霓虹区，夜景）**：同一相机、同一平面坐标。
   - 同一片城市楼群，但为夜景：楼顶暗色，外墙与楼顶散布霓虹（粉 #ff3d9a、青 #3de0ff、紫），全息广告牌做成发光平面。设定原话：「层层叠叠的立体建筑群」「全息广告覆盖外墙」「日照被上层遮住，靠人造光」。
   - 悬浮轨道系统：几条贯穿全片区的发光轨道（「悬浮轨道是主要公共交通工具，四通八达」），用细长发光曲线。
   - 上层岛屿的投影：在对应位置画暗色、低对比的椭圆轮廓（坐标取 `map/data/tc_upper.json` 的 islands），表示头顶的浮岛。
   - 地标（放在合理位置，导出到 markers；位置都是推断，除非下面写明）：
     - `enforcement_hq` 天城执法局总局，中层核心区
     - `radiance_cathedral` 辉光大教堂，圣光教会总部，中层高区
     - `iron_cradle` 圣铁摇篮，战斗修女修道院，中层高区独立院落
     - `barracks_ring` 环城军营带，天城防卫军驻地，中层外围（沿片区边缘的一段环带）
     - `starabyss_univ` 星渊大学，天城第一学府
     - `checkpoint_c` 层间检查点，中层 C 区 → 下层 7 号井通道
   - 控制曝光：夜景用 Standard 色彩映射，发光强度保守，宁暗勿曝。先 600px 测试再加大。
3. **下层 `blender/tiancheng_low.py`（地基区）**：同一平面坐标，几乎没有自然光，钠灯橙黄色调（#f0a040 一类）点光 + 少量磷光绿 #9fe870。
   - 设定原话：「工厂、资源处理设施」「老旧地面轨道、货运通道、步行为主」「几乎没有自然光，黑市与帮派活跃」。
   - 画面：低矮厂房、管道、储罐、货运铁轨、密集的贫民窟屋顶；头顶中层结构的巨大支柱（均匀分布的柱基）。
   - 地标：
     - `well7` 7 号井黑市（「地基区 7 号井 · 只收灰票」）
     - `blood_mill` 黑拳场「血肉磨坊」
     - `enforcement_low` 执法局下层分局（名义六个、实际运转三个；画一个即可）
     - `soup_kitchen` 圣光教会施粥站（下层三个教区，教堂多半荒废）
     - `outpost` 防卫军前沿哨所
     - `amc_facility` 资产管理委员会下层设施（只画成有围墙的大型管理设施，中性描述，不做任何内部细节）
     - `freight_yard` 货运站 / 旧地面轨道枢纽
4. 两个脚本都要：接受 `--res --samples --out --crop`，写出 `map/data/tc_mid.json` / `tc_low.json`（格式同 `tc_upper.json`，至少有 markers）。
5. **出草稿**：云端没有 GPU，只渲染草稿：`bash tools/render_all.sh mid low --res 2000 --samples 16`（上层也用 2000 出一张草稿确认）。检查图片：能看清街区、地标、光源，不过曝不过暗。每层最多迭代 3 轮。
6. **接入地图**：在 `map/data/maps.json` 里把 `tc_mid`、`tc_low` 去掉 `status: planned`，补 `kind: points`、`base: art/tc_mid.dzi`（下层同理）、`data`、`focus`、`markers`（name、sub、tag: set 或 inf、src 写设定出处、alias 写当前地点别名，例如「辉光大教堂」「教堂」、「7号井」「黑市」）。中层的叠加层可以用 `{"type": "barriers", "label": "上层投影"}` 复用结界圈画法（数据取上层岛屿）；如果要这样，给 `pointOverlays` 加一个从别的地图读 islands 的选项。
7. **自检**：`python3 -m json.tool map/data/maps.json`；把 `map/viewer.html` 里的 `<script>` 内容抽出来跑 `node --check`；确认 `map/art/tc_mid.dzi`、`tc_low.dzi` 和瓦片目录都在。
8. 更新 `CHANGELOG.md`（新版本号 0.8.0，但**不要**改 `VERSION`、不要打标签、不要运行 `tools/build_card.sh`——发布由用户在本机做），在 `ROADMAP.md` 勾掉完成项。
9. 提交到分支 `cloud/tc-mid-low` 并推送。提交信息结尾加：`Co-Authored-By: Claude <noreply@anthropic.com>`。

## 约束
- 画风：写实渲染，不要卡通、不要 SVG/Canvas 手绘地图。美术只来自 Blender 渲染。
- 内容边界：不建模任何性相关或束缚类道具与场所细节；涉及委员会等机构只画中性的建筑外观。
- 不改 `map/tavern/eden-map.js` 的对外接口；不引入新的外部 CDN。
- 大图（`*_full.png`）不提交（已在 .gitignore），只提交 DZI 和瓦片目录。
- Blender 版本差异：如果容器里的 Blender 低于 4.0，Principled BSDF 的输入名不同（`Specular` / `Emission`），脚本里用兼容写法（按名字依次尝试）。颜色属性 `me.color_attributes` 需要 Blender ≥ 3.2；装不上合适版本就 `pip install bpy`（对应 Python 版本）后用 `python3 script.py -- ...` 方式运行，并在 `tools/render_all.sh` 里支持。
