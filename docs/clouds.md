# 上层云海重做（云端任务 4 · 1）

> **现状（v0.9.2）**：发布版已换成方案 B（纯白云底 + 查看器实时漂移云），见 §6 末「方案 B」。下面 §1–§5 是旧 toon 云海的记录。

结论：选 **metaball 融合的积云团 + 三阶着色（《部落冲突》式）**，岛影由「云用太阳」单独投射。代码在 `blender/tc_clouds.py`。`tiancheng_upper.py --below clouds` 时自动调用，只加了一行。
- 选定草稿：`docs/drafts/clouds_v3_toon.jpg`
- 新旧对比：`docs/drafts/clouds_old_vs_v3.jpg`
- 8K 局部：`docs/drafts/clouds_v3_toon_8k_crop.jpg`

## 1. 旧版的问题

![旧版](drafts/v2_osm_upper_clouds.jpg)

- **云是两张噪声平面**：顶视下像一张起伏的白纸，读不出「厚云层」。
- **影子是一块块水滴形的深色斑**，有两个原因：
  1. 岛下面倒锥形的岩体也在投影。锥体的影子正好是水滴形，而且比岛面大。
  2. 三层共用的太阳天顶角是 40°。岛比云顶高 1–8 单位（100–800 m），影子偏出 1–7 单位，和岛完全脱开，看不出是谁的影子。
- 结果是满屏「来历不明的暗斑」。

## 2. 调研

### 游戏里的云海 / 云影

| 作品 | 云的做法（俯视或高空视角） | 可借鉴 |
|---|---|---|
| 部落冲突 / 皇室战争 | 地图边缘和加载画面的云：厚实的圆团叠成一整块，明暗只有两到三阶，背光面是柔和的蓝灰，没有细碎噪点，轮廓线干净 | 三阶着色、蓝灰阴影、大团少碎；云只作衬底，饱和度低于地块 |
| Townscaper | 水面与天空都是低频的大色块，靠少量高光表现材质 | 大面积留白比细节更「贵」 |
| Islanders | 极简低多边形。岛的影子就是岛轮廓的平移，边缘柔化，一眼能配对 | 影子与岛同形、就近，决定了「浮起来」的读感 |
| Bad North | 岛悬在雾海上。岛下沿是一圈暗色，雾海几乎纯色 | 岛与底面之间要有明暗对比，底面不能抢细节 |
| 光遇（Sky） | 云海是大片柔和体积加雾化远景，靠色调分层表现深度（thatgamecompany 2020 年 GDC 美术分享） | 云缝里「更低、更暗、更蓝」就能表现厚度 |
| 塞尔达：王国之泪（天空岛） | 岛下方是写实体积云海，岛投下的影子柔、近。高度靠影子偏移和大气透视表现 | 岛越高，影子越远、越虚 |

### Blender 里的做法对比（正俯视、8000 px、本机 M 系列 GPU，上层原本约 8 分钟）

| 做法 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| 实例化圆球团 + 阶梯着色 | 快、可控 | 球与球相交处有折痕，顶视像「一堆泡沫球 / 棉花球」（首轮试过，`t2` 预览） | 否 |
| **metaball（融合球）** | 团与团自动融合成连续的积云块，轮廓圆润干净；转成网格后可以按顶点着色 | 8K 下要细网格（0.035 单位），生成约 70 秒、约 220 万顶点 | **采用** |
| 低分辨率体积云 | 最写实，边缘有透光 | 8K 下噪点重、渲染时间成倍增长；和岛的写实程度不一致；阴影难控 | 否 |
| 2D 噪声遮罩平面 + 法线假厚度（旧版） | 最快 | 读不出体积；影子无处可落，只能在平面上显示为暗斑 | 否 |

### 岛影怎样才合理

1. **与岛同形**：只让岛面（连同上面的树和楼）投影。岛下的岩体设为不投影，它在俯视图里本来就看不见。
2. **落在云顶上、离岛不远**：云单独用一盏「云用太阳」。
   - 方位角与三层共用的太阳一致（`tc.SUN_ROT` 的 215°），天顶角 14°。
   - 影子偏移约为「高差 × 0.25」：低岛的影子紧贴岛，高岛的影子离开一点。
3. **柔边、越高越虚**：云用太阳的圆盘角是 5°，影子的虚化宽度约为「高差 × 0.087」。
4. **灯光链接（Cycles 4.0 起）**：主太阳照岛、不照云；云用太阳只照云，但所有物体都能挡它。
   - 岛上的受光方向不变。
   - 云的三阶明暗按主太阳方向烘进底色，所以云和岛的「光从哪边来」一致。
   - 云用太阳几乎垂直，把顶面照得均匀，岛影直接压暗底色，干净、不花。
   - 注意：中层的「上层投影」仍按主太阳的 40° 偏移，那是另一张图，互不影响。

## 3. 实现（`blender/tc_clouds.py`）

`build_cloud_sea(layer, islands, sun)` 依次做这些事：

1. **删掉旧版**的两张噪声平面。
2. **岩体不投影**：带 `rock` 材质的倒锥不再投影。
3. **排云团**：六边形抖动网格，间距 300 m。
   - 每格的浓度 = 低频 FBM 与中频 FBM 之和。低于阈值的格子留作云缝。
   - 每团：一个主团、3–5 个外圈小团、2–4 个顶部鼓包，都是扁椭球（竖向 0.62）。
   - 靠近低空岛的云团，云顶压到岛面以下 35 m，不穿模。
4. **伊甸「云台」**：伊甸椭圆 1.45–1.8 倍处排一圈 16 团饱满的亮云，顶点亮度 +8%，主角岛一眼可见。
5. **metaball 融合后转网格**。分辨率随出图尺寸变化：2000 px 时 0.09，8000 px 时 0.035。
6. **材质**（漫反射，底色三阶）：
   - 明暗值 = 0.6 ×（法线 · 指向主太阳）+ 0.4 × 法线朝上的分量。
   - 色阶依次是蓝灰 `(.46,.52,.64)`、过渡 `(.62,.67,.77)`、受光 `(.80,.81,.83)`。阶与阶之间有 0.05 的窄过渡，8K 下不会出锯齿。
   - 受光色故意不到纯白，给岛留出对比。
7. **底云**：比云团低 250 m 的一张暗灰蓝平面。云团的影子落进云缝，读出云层的厚度。
8. **灯光**：云用太阳（强度为主太阳的 0.7 倍）加上灯光链接。

参数（都可省略）：

| 参数 | 默认值 | 说明 |
|---|---|---|
| `--clouds toon\|soft` | `toon` | `soft` 是写实积云对照版：更碎的团、连续明暗、细噪声凹凸 |
| `--cloud-light` | `.7` | 云用太阳的强度，相对主太阳 |
| `--cloud-res` | 随出图尺寸 | metaball 网格分辨率 |
| `--cloud-geo meta\|spheres` | `meta` | `spheres`：不融合的圆球，仅作对照 |

## 4. 迭代与自评（2000 px，32 采样，云端 CPU 每张约 2 分钟）

**预览（800 px，4 轮，不算正式轮次）**
- 圆球版：太亮、像泡沫球。
- 改 metaball：融合对了，但云缝太多、偏灰，像陶泥。
- 调亮、加密之后进入正式轮次。

**第 1 轮：`clouds_v1_toon.jpg` / `clouds_v1_soft.jpg`**
- 可读性：厚云层与浮岛能读出来；toon 的三阶清楚，soft 的轮廓更自然。
- 怪影：已消失。影子与岛同形，就近落在云上，柔边。
- 比例：云团约为中等岛的 2–4 倍，不抢岛；但伊甸旁边有一大块云缝，主角岛反而落在「洞」边上。
- toon 的顶面偏平，像翻糖；soft 的噪声凹凸像石膏。

**第 2 轮：`clouds_v2_toon.jpg` / `clouds_v2_soft.jpg`**
- 伊甸周围加了一圈亮云（云台），主角岛最显眼。
- toon 增加顶部鼓包；soft 的凹凸减半、尺度放大，但整体像奶油。
- 自评：**选 toon**。更符合「部落冲突式简洁」的要求，岛的轮廓在任何缩放下都清楚。

**第 3 轮：`clouds_v3_toon.jpg`（选定）**
- 底云压低到云团下方 250 m：云团在云缝里投下蓝灰影带，「厚云层」的读感明显增强。
- 8K 局部检查（`clouds_v3_toon_8k_crop.jpg`）：
  - 0.045 网格下，阶梯边沿着面片出现锯齿。改为窄过渡加 0.035 网格后，没有锯齿、橘皮或断线。
- 怪影：无。高岛的影子更远、更虚，符合预期。
- 可读性：
  - 在 800 m 视野下，岛面绿色与云的蓝白对比强。
  - 伊甸在云台中央，全图第一眼。
  - 气候塔穿出云层，位置不变。

## 5. 8K 渲染时间估计（本机）

- metaball 生成约 70 秒（CPU，和 GPU 无关）。
- 云网格约 220 万顶点，在 GPU 上渲染几乎不增加时间：云是单一漫反射材质，没有体积、没有透明。
- 预计比旧版多 1–2 分钟，总计约 10 分钟。

本机重跑：`bash tools/render_all.sh upper --res 8000 --samples 128`

## 6. 《部落冲突》式云：原型与方案 B（发布版）

用户否掉 toon 云海（「这他妈的也不是云啊」），参考 CoC：半透明、沿等轴测斜向叠起的圆角云板、边缘虚、白到浅冷灰、低对比、无描边，地面透得出来；切层时云合拢到全白再散开。

- 开关：`blender/tc_clouds.py` 的 `CLOUD_STYLE = 'toon'`（默认不变）；原型用 `--clouds veil` 临时切换（强制 `--below city`）。云板的形状与明暗在 `blender/cloud_veil.py`（纯 numpy，Blender 与精灵脚本共用）。
- 静态（Blender）：城市上方两层自发光半透明平面（z .62 / .88，岛最低 z 1.0），贴图 = 斜向 35° 的圆角云板（长宽比约 2–3，侧面 ≈ #D5DBE5）；岛缘一圈柔白云边（`veil_lip`，alpha ≤ .6）。云不受光、不投影；城市由另一盏只被城市自己挡的「城市太阳」照亮 → 没有岛影。`--no-veil` 只留云边；`--no-data` 不写 `map/data/*.json` 与自检 json（草稿用）。霾降到 .15。
- 草稿（2000px / 32 采样，约 35 秒）：`docs/drafts/clouds_coc_static_full.jpg`、`_crop.jpg`、`_lip_only.jpg`、`_vs_toon.jpg`；第 1 轮偏「雾 / 运动模糊」的版本留作对照：`_r1_fog.jpg`。
  `Blender -b -P blender/tiancheng_upper.py -- --res 2000 --samples 32 --clouds veil --no-data --selfcheck warn --out /tmp/veil.png [--no-veil]`
- 动效（原型页，未接入查看器）：`map/_proto/clouds.html`（`http://localhost:5178/_proto/clouds.html`）。精灵 `map/_proto/clouds/puff1–6.png` 由 `tools/proto_cloud_sprites.py` 生成（Blender 自带 Python）。
  (a) 两层漂移（远层慢、淡，近层快、浓；拖动时视差 0.85 / 1.2）；(b) CoC 式切层：9 条斜带 × 3 团从两头交错扫入约 420 ms → 全白停 150 ms 换层 → 往两侧散开 600 ms，转场中点一下可跳过；(c) 淡入淡出 280 / 420 ms。只动 transform / opacity；`prefers-reduced-motion` → 立即换层、无漂移；`saveData` / `deviceMemory ≤ 2` → 无漂移、不加载精灵、切层用白幕淡入淡出。
- 测量：`node tools/browser/proto_clouds.mjs`：375 宽 Chromium 与 WebKit（iPhone）漂移 / CoC 转场 / 淡入淡出都约 60 fps（p95 16.7–18 ms），截图序列 `docs/drafts/clouds_coc_anim_1_drift … 4_parting.jpg`。
- 评审：`docs/reviews/clouds_coc/`（美术总监有条件通过，推荐 B：只烘云边的底图 + 动态漂移，切层用 CoC 式；玩家：第 1 轮条纹像模糊滤镜，要一坨一坨的形状，转场要能跳过）。第 2 轮已按两份意见改：云板变短变厚、模糊减到约 1/3、覆盖率与不透明度下调、侧面提亮、云边收窄、霾降低、可跳过。

### 方案 B（发布版，v0.9.2）

用户批准 B，并补一句「底图可以做个不动的纯白云铺满」。

- **静态底图**：`blender/tc_clouds.py` 的 `CLOUD_STYLE = 'white'`（默认）→ `build_white_floor`。`bash tools/render_all.sh upper` 不加参数就是这个效果。
  - 岛下一整片不透明的近白云底（自发光贴图平面，z −0.6）：云谷 ≈ #E2E7EE、云顶 ≈ #F6F8FB，约 8 % 的柔和团状起伏（团约为岛的 0.5–1.5 倍，高斯模糊，无细碎噪点）。不透城市、没有灰纱。
  - 岛缘柔白云边（`_lip_rgba`，纯白、gain 1.0，与原型 lip_only 同形），z 0.97。
  - 云底与云边自发光、不受光、不投影 → **没有岛影**（用户硬规定）。岛的建模、材质、主太阳与之前完全相同（岩体同样不投影）。
  - `upper_city`（关云看城市）：脚本已改为城市只被城市自己挡光（`relight_city`，与薄纱原型同法）→ 城市上没有岛影；2K 对比 `docs/drafts/upper_city_no_shadow_2k_before_after.jpg`。**8K 瓦片尚未重渲**（等用户确认后 `bash tools/render_all.sh upper_city`）。旧 toon：`--clouds toon`；薄纱原型：`--clouds veil`。
  - 草稿：`docs/drafts/clouds_b_white_r1.jpg`（太平、云边看不见）→ `clouds_b_white_r2.jpg`（选定）。评审：`docs/reviews/clouds_b/`（第 2 轮三位都过岛可读性门槛）。
  - 参数：`--lip-gain`（默认 1.0）、`--no-lip`。
- **查看器实时云**（`map/viewer.html` 文末「云」脚本块 + 一段 CSS，挂点：包一层 `go()`，监听 `body[data-map]` 与「显示下方城市」开关）：
  - 漂移：只在上层且云开时；远层 11 团（小、慢、淡）+ 近层 6 团（横屏各少 20 %）（大、快、稍浓），默认视野约 5–8 团可见；拖动视差 0.85 / 1.2，超出半屏时淡出重排。画在底图之上、标记之下。
  - 天城层与层切换：CoC 式斜带扫入 → 全白换层（等新底图第一张瓦片，最多 1.2 s）→ 散开；转场中点一下跳过。
  - 减少动态效果：无漂移、直接换层。省流（`lean()`：saveData、2g/3g、内存 ≤ 4 GB、手动「省流」档）：无漂移、零精灵请求，切层用白幕淡入淡出。
  - 只动 transform / opacity，无 backdrop-filter。精灵 `map/art/clouds/puff1–6.png`（480 px 宽，共约 320 KB，用到才加载），与瓦片同一基址，jsDelivr 线路可用。
  - 测试：`node tools/browser/clouds.mjs`（Chromium / WebKit × 375 / 桌面：可见团数、帧率、跳过、开关、降级）。
- `map/_proto/` 保留作演示。

## 参考

- [Art of 'Sky: Children of the Light'（GDC Vault）](https://gdcvault.com/play/1026903/Art-of-Sky-Children-of)
- [See how thatgamecompany created the magical art of Sky（CG Channel）](https://www.cgchannel.com/2020/01/discover-how-thatgamecompany-created-the-magical-art-of-sky/)
- [Creating Fluffy Stylised Clouds（BlenderNation，metaball 加程序纹理）](https://www.blendernation.com/2020/07/26/creating-fluffy-stylised-clouds/)
- [Simple Toon Cloud Tutorial in Blender 2.8 Eevee（YouTube）](https://www.youtube.com/watch?v=2TgXJ632edc)
- 部落冲突、Townscaper、Islanders、Bad North、塞尔达 的描述来自对游戏画面的观察，没有官方技术文档。
