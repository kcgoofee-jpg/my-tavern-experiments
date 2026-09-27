# estate2 · r4 状态（2026-09-27：俯视地图帧）

- 用户定：全部自建；只优化俯视看得到的东西（岩基、云领、露台小景暂不做）；上层地图用纯白云底 + 查看器里的活云。
- 新视图 `--view map`：与 `tiancheng_upper.py` 同一正交俯视（0.375 m/px，+y 朝上），2000×1500 = 750 × 562.5 m，太阳高 50° 方位 125°（tc_common.SUN_ROT），Standard 视图变换，纯白自发光云底（terrain.build_white_floor）。`--view close`：主楼黄昏斜俯。
  `blender -b -P blender/estate2/style_frame.py -- --view map --res 2000 --samples 64 --out …`（约 1 分钟）
- 植被（用户 P0：树太多且雷同）：林地只留外坡林带 + 别墅周边 + 沟谷（layout.wood_mask），视线走廊主楼→湖、主楼→停靠平台开敞；
  6 种分区（vegetation.KINDS）：冬青栎林带 / 伞松孤植 / 意大利柏行列（程序生成）/ 橄榄树阵 / 棕榈（程序生成）/ 蓝花楹 + 白玉兰；Poly Haven 原型按种换色、缩放。约 3300 实例（r3 约 4800+ 且全是同类）。
- 地表：林带外全是园地草甸（绿底 + 干湿斑 + 野花团），不再是落叶林底；石灰华 2.4×1.2 m 错缝大板。
- 屋面：坡度 0.5，铅皮屋脊 / 斜脊、老虎窗、天窗、脊上烟囱（buildings.roof_details）。
- 园林：大道中轴跌水水渠 + 两端圆池、3 片网球场（layout.COURTS）、玫瑰园藤架、花床黄杨图案、每栋别墅一池。
- 成片：`docs/drafts/eden2_r4_topdown.jpg`、`eden2_r4_vs_map.jpg`（左现地图，右新渲染，同比例）、`eden2_r4_close.jpg`；审查 `docs/reviews/eden2_r4/`。

- r4 第二轮（用户：只有深浅两种绿）：地面拼块（条纹草坪 / 金黄稻草鼠尾草草甸 + 野花带 / 橄榄园干土 / 岛缘沙石带 / 露头岩 / 菜园 / 色块花境）、红土网球场、绿松石泳池；客房楼 8→4（g1/g3/spa/w_g1，铜绿 / 陶瓦顶，buildings.ROOF_OVR）；机库弧形金属顶 + 停机坪；服务院四翼围合 + 温室；Greystone 台地黄杨方格；林缘成团；主路路缘；柏树 / 伞松放大；开花 / 秋色树约 30 株。
  审查 r2：美术总监 7、景观 7、rp_glance 7.5、fresh 7.5，全部过门槛。遗留：草甸浅斑太圆太均匀；白色空心圆环（观景台）像 UI 线稿；别墅同款白盒在 375 px 下成白点。

- r4c：南侧到达序列全开敞（草坪 / 草甸到崖边 + 崖边栏杆步道 + 两座观景台）、北崖裸岩岬角；观景台改实心浅石 + 低石栏 + 深色石边；西侧三分之一改地中海农业台地（layout.agri / agri_z：同心台地、葡萄园行、薰衣草带、干砌石墙、橄榄行、农场路、石灰岩露头）；东崖 V4 改崖顶草甸；别墅 10 → 4 栋（V1/V2/V3/V8），三型轮换（Sketchfab / 自建 L 形石板顶 / 合院绿化屋面）；夜景 `--light night`（月光 + 暖窗光 + 园路 / 大道灯 + 泳池水下灯 + 喷泉灯）。
- r4d：Greystone 按真实比例放大（E 形约 76 × 46 m）+ Thiene 式园林（gardens.greystone_gardens：上台地倒影池 + 喷泉 + 黄杨 / 紫杉、圆形车场、弧形双石阶、下花园锦鲤倒影池、跌水溪）；Warner 式 Tudor 客舍 + 岩洞泳池 + 锦鲤池 + 卵石院（warner.py）；车库放大 + 前院停车；停机坪（gardens.helipad）；奶牛农场：`e4r/dairy_save.py` 另跑 props/dairy_parlour/build.py 存 .blend（不改原文件），环境变量 E2_DAIRY_BLEND 指向它，gardens.dairy 链入；网球场加垫平台地。调研写在 docs/eden-references.md（Greystone / Warner 两节）。
- 分区图：`docs/drafts/eden2_r4_zones.jpg`（生成脚本在 scratchpad zl/zones.py，读 layout.py 的遮罩）。

---

# estate2 · 风格帧 r3（2026-09-27）

- 成片：`docs/drafts/eden2_style_frame_r3.jpg`（主楼近景）、`_r3_wide.jpg`（整岛）、`_r3_terrace.jpg`（露台人眼小景，1600px）。审稿：`docs/reviews/eden2_r3/`。
- 运行：`blender -b -P blender/estate2/style_frame.py -- --view crop|wide|terrace|stairs|aerial|top --light sunset|day --res 2000 --samples 56 --out …`（约 30–60 s）。需要 `fetch_assets.py` 的 CC0 素材，以及用户给的 Sketchfab zip 解压到 `blender/data/estate2/sketchfab/<zip 名>/`（不入库）。
- r3 改动：屋顶改中灰蓝石板（Greystone 仍深板岩）；白石改石灰岩琢石砌（Brick 节点）、三叠檐口、屋顶栏杆、首层横缝石 + 隅石、首层拱形钢框落地窗、翼楼柱廊；`gardens.py`：双跑贴墙大台阶 + 壁泉、带水三层喷泉 + 弧形水柱、黄杨花坛、大道绿篱、东翼磨面石露台；`sketchfab.py`：别墅三变体（原样 / 镜像 + 白石 / 胡桃木 + 石灰华）+ 石基座、Maybach / DB11（删标）停门廊前、停靠平台、车库；植被：林冠分层 + 突出木、林中空地 + 孤植、别墅周边热带林下层、白花灌木团；云海改极坐标积云高度场 + 岛周云领；岩基改崖唇 + 内收倒锥；kiara_8_sunset 黄昏光（默认）。
- 已知遗留（审稿意见）：岩基仍像“蛋糕底”、云海仍是高度场不是体积；露台地面像瓷砖、拱窗有台阶锯齿、白花灌木噪；塔楼比例；挡土墙大面积空白。

---

# estate2 · 状态（2026-09-27 更新：风格帧已出，等用户认可）

- 设定清单：`docs/eden-lore-space.md`；总平面：`docs/drafts/eden2_plan.png` + `eden2_plan_basement.png`（`plan2d.py` 生成）。
- 风格帧：`docs/drafts/eden2_style_frame.jpg`（2000px 航拍）+ `eden2_style_frame_crop.jpg`（主楼群近景）。
- 运行：`python3 blender/estate2/fetch_assets.py`（约 285 MB，不入库），然后 `blender -b -P blender/estate2/style_frame.py -- --view aerial|crop|top --res 2000 --samples 48 --out …`（Metal GPU，约 40 s）。
- 植被：Poly Haven 扫描树 island_tree_01/02/03 + searsia_burchellii，几何节点 Instance on Points，约 4800 株实例，每株随机色相。searsia_lucida 叶片无透明通道，已弃用。
- 已知遗留：云海仍是位移平面 + 自发光（不是体积云）；岛体侧面是一刀切的崖壁；别墅只有一个样式；喷泉水面偏灰。
- 下一步必须等用户认可风格帧后再建模。

---

# estate2 · 伊甸庄园风格帧：暂停记录（2026-09-27，用户叫停）

任务：按 `docs/eden-references.md` 已定方向，在 Blender 里出 1 张 2000px 3/4 航拍风格帧，可以的话再加一张俯视图，然后停下等用户认可。
暂停时的进度：总平面和代码写到约 60%，**一张帧都还没渲染**，也没用过 GPU。

## 已完成

| 文件 | 内容 | 状态 |
|---|---|---|
| `fetch_assets.py` | 从 Poly Haven / ambientCG 下载 CC0 素材到 `blender/data/estate2/`（29 MB） | 已跑通 |
| `layout.py` | 总平面，纯 numpy：岛轮廓、地形、台地、路网、建筑清单、连廊、缆车、吊桥 | 已用俯视高程图自检（scratchpad，未入库） |
| `common.py` | 材质节点工具、网格工具 | 已写，未在 Blender 里跑过 |
| `terrain.py` | 岛体网格和岩基、湖面、云海，以及地形、水、云海材质 | 已写，未跑过 |
| `buildings.py` | 所有建筑、连廊、栏杆、台阶、喷泉、停靠平台、缆车、吊桥、树屋、泳池、遮阳篷 | 已写，未跑过 |

### 总平面决定

坐标沿用 `docs/eden-estate.md`：岛坐标，−y 是正面。岛约 670 × 500 m。

**地形（Nekajui）**：不再是平草坪，高差约 −10 到 30 m。
- 主楼群坐在高台上：椭圆，z 30，中心 (0, 8)，半径 128 × 76。高台南侧是白石挡土墙，北侧是天然崖，直落后面的湖。
- 高台前方是前庭台地（z 20）：喷泉在 (0, −113)，外圈是环形砾石广场，从这里走 14 m 宽的中轴大台阶上高台。
- 再往前是 Biltmore 式长坡大道：两侧车道，中间是草坪，从 z 8.5 升到 19。大道尽头是岛前缘的停靠平台 (0, −268)。平台是伸出岛外的圆台，有铜栏、金色引导环和一个候机亭。
- 后湖湖面标高 4.5，中心 (−12, 142)，半径 100 × 44。
- 东侧林间有一条沟谷，上面架了吊桥。
- 岛缘是崖岸，岛下是倒锥形岩基。

**主楼群（海湖庄园式）**：13 块高低不一的体量。
- 中央大厅；观景塔在 (−17, −17)，高 6 层，顶层是敞廊，屋顶是陡四坡；东侧还有一座小望楼。
- 东西各有两段错开的翼楼和一座角亭，角度有偏转。
- 后面是半圆回廊（R31，开口朝湖），院内只放草坪和棕榈，**不做水池**。
- 回廊内侧挂黄白条纹遮阳篷，屋顶带烟囱。
- 墙用白石（castle_brick_02_white 调白，带雨痕、墙脚泛潮和 AO 积灰）。窗由着色器按层高和开间画出。
- **屋顶选陶土红瓦**（clay_roof_tiles_02）：白墙配红瓦最接近参考图 01、03，也和 Breakers 的红顶一致。只有 Greystone 用灰板岩。

**沿等高线的建筑**：
- 东侧 4 栋客房楼，西侧有 1 座 spa 和 2 栋客房楼，都用有顶连廊接到主楼群。
- 连廊是红瓦双坡顶加白石柱，跟着地形起伏，共 8 段。
- 回廊后面连廊通到崖顶观景台和缆车站。缆车沿崖下到湖边俱乐部 (72, 134)，俱乐部有遮阳篷。

**角落单栋**：
- 东南崖岬：The Breakers 式别馆，米白石、4 层、低坡红瓦四坡顶，屋顶有栏杆和 6 根烟囱，面海一侧有露台和长泳池。
- 西南坡地：Greystone 式都铎灰石老宅，4 组陡山墙，灰板岩顶，高烟囱，下方是三级台地花园，都是白石墙。

**林中**：
- 10 栋散落别墅：红瓦四坡顶或平顶带屋顶小亭，7 栋配小泳池。
- 6 座树屋：高约 8 m 的木平台加小屋。
- 东、东北各有一处崖边观景台。步道从林中穿过。

**明确没用的**：
- 旧 three.js 和 b1 的构图：五段式府邸、刺绣花坛网格、条纹大草坪中轴、环形绿篱、球形树。
- Chatsworth 和 Vaux 的元素。
- 中庭水池。

## 下一步（还没写）

1. **`vegetation.py`**
   - 阔叶树原型 6–8 种：树干和枝条用 bark_brown_02；树冠由几团不规则叶簇组成，叶片是按 Leaf001 叶形裁出的多边形卡片，不用 alpha，不做球形树冠。
   - 棕榈原型 3 种：弯曲树干，每株约 16 片下垂羽状叶。
   - 地中海柏树若干。
   - 用几何节点 Instance on Points 散布：林地约 2000 株；棕榈约 250 株，种在大道两侧、喷泉环、主楼周围、回廊院、Breakers 草坪边和湖岸。
2. **`style_frame.py`**（入口）
   - 调用 `terrain.build_island / build_lake / build_cloudsea`、`buildings.build_all` 和植被。
   - 光照：HDRI（kloofendal_48d_partly_cloudy_puresky）加 Sun。
   - 相机：3/4 航拍从西南前方看，约 (−300, −820, 560)；另加一台正交俯视相机。
   - Cycles Metal，32 spp 加 OIDN，出 2000 px。
   - 用法：`blender -b -P blender/estate2/style_frame.py -- --view aerial|top --res 2000 --samples 32 --out …`
3. 首次跑多半要修 API 细节。几处可疑的地方：
   - Blender 5.2 的 `ShaderNodeMix` 插槽编号；
   - `ShaderNodeAttribute` 的 OBJECT 类型读自定义属性；
   - `create_circle` 的 `cap_ends` 参数；
   - `buildings.dock` 里多余的一行 `ring`。
4. GPU 规则：`pgrep -f "[M]acOS/Blender -b"` 为空并且跑完 `bash tools/quiet_wait.sh` 之后才能渲染；云原型 agent 也在用 GPU，要轮流。
5. 渲染后审查：2 个 Opus 审稿人（豪宅营销、对照参考图的美术指导）加上 rp_glance，最多改两轮。成片存到 `docs/drafts/eden_style_frame_*.jpg`（≤ 600 KB）；素材来源补进 `map/estate/assets/CREDITS.md`；然后停下等用户认可。

## 素材（全部 CC0，已下载，在 `blender/data/estate2/`）

- **Poly Haven 贴图**（1k，diff / nor_gl / rough）：castle_brick_02_white、clay_roof_tiles_02、grey_roof_tiles_02、castle_wall_varriation、rock_face_03、cliff_side、aerial_grass_rock、forest_leaves_02、gravel_floor、bark_brown_02
- **Poly Haven HDRI**：kloofendal_48d_partly_cloudy_puresky 2k
- **ambientCG**：Leaf001 1K（Color / Opacity / NormalGL / Roughness）
- Poly Haven 的树模型每个 46–500 MB，超出 50 MB 预算，所以没用，改为程序生成树配真实树皮和树叶贴图。

## 待定问题

1. 屋顶颜色：暂定陶土红瓦，灰板岩只给 Greystone。用户如果更想要整体灰顶，改 `buildings.mats()` 就行。
2. 设定文档第 2 节写的是帕拉第奥五段式府邸和法式花坛，现在已经被参考板取代。要不要同步改 `docs/eden-estate.md` 的总平面？这需要用户拍板。
3. 素材是整份提交进仓库（29 MB），还是只留 `fetch_assets.py`、把 `blender/data/estate2/` 加进 .gitignore？这次按协调方要求一起提交了。
