# 3D 模型来源调查（建模测试件：奶牛挤奶厅）

调查日期 2026-09-27。原则：能进公开仓库的只有 CC0（或 CC-BY 且写署名）；本项目默认**不把下载的模型提交进仓库**，只提交下载脚本（`blender/props/fetch_assets.py`），素材落在 gitignore 的 `blender/data/props/`。未注册、未登录任何站点。

| 站点 | 许可 | 能否在公开仓库再分发 | 需要登录下载 | 质量 | 格式 | 挤奶厅相关 |
|---|---|---|---|---|---|---|
| **Poly Haven** | CC0 | 能 | 否（公开 API） | 高，扫描级 PBR | glTF / blend / fbx，贴图 1k–16k | 无挤奶设备；可用配件：`garden_hose_wall_mounted_01`（冲洗水管）、`modular_industrial_pipes_01`、`mounted_fluorescent_lights`、`utility_box_01`（电围栏控制器外壳替身）、`plastic_crate_01`；贴图 `rubber_tiles`、`concrete_floor_worn_001`、`box_profile_metal_sheet`；HDRI `farmland_overcast` |
| **ambientCG** | CC0 | 能 | 否 | 高（材质），模型很少 | zip：JPG/PNG PBR | `Metal009`（拉丝金属）、`Rubber004`；无模型 |
| **Sketchfab** | 每个模型不同：CC0 / CC-BY / CC-BY-NC / 付费 | CC0、CC-BY 能（写署名）；NC/ND 不能 | **是**（下载需账号 / API token；搜索 API 不需） | 参差，扫描件多 | glTF / glb / usdz / 原始上传 | `Harney-Lastoka Milking Parlor`（CC-BY，58.7 万面，老挤奶厅扫描）、`Electric fence box`（CC-BY，1.3 万面）、`Milk Canister`（CC-BY）、`Free Liquid Storage Tank`（CC-BY）。**需用户登录后手动下载** |
| **BlenderKit** | 免费档 Royalty Free（可商用，不可原样再分发）+ 少量 CC0 | RF 不能；CC0 能 | 是（插件内登录） | 中高 | .blend | 有农场杂项；未登录未细查 |
| **CGTrader free** | Royalty Free / Editorial | 不能原样再分发 | 是 | 参差 | 多格式 | 有 bulk milk tank / milking machine 付费件为主 |
| **TurboSquid free** | TurboSquid 标准许可 | 不能 | 是 | 参差 | obj/fbx/max | `Bulk Milk Tank 8` 为付费件 |
| **Free3D** | 个人使用为主，条款不一 | 一般不能 | 是 | 低中 | obj/3ds | 无可靠挤奶设备 |
| **Smithsonian 3D / NASA 3D** | Smithsonian Open Access CC0；NASA 公有领域 | 能 | 否 | 高（文物 / 航天） | glb / obj / stl | 与挤奶厅无关（适合公务机、航天类测试件） |
| **Objaverse** | 汇集 Sketchfab 等，逐条沿用原许可 | 视单个模型 | 否（HF 数据集） | 极参差 | glb | 可按关键词筛，但要逐个核许可 |
| **Kenney** | CC0 | 能 | 否 | 低多边形卡通 | glb/fbx/obj | 风格不符（玩具感），不用 |
| Printables / MakerWorld | 多为 CC-BY / 标准数字许可 | CC-BY 能 | 是 | 打印件，无材质 | stl/3mf | 有真实尺寸的**电围栏绝缘子**打印件，可当形状参考 |

## 首选
1. Poly Haven（CC0，免登录）拿所有 PBR 贴图、HDRI 和配件模型。
2. ambientCG 补拉丝不锈钢、橡胶。
3. 挤奶专用件（挤奶杯组、奶管、奶罐、转盘/鱼骨栏、电围栏立柱与绝缘子、控制器）**没有免登录的 CC0 可用件** → 按参考照片自建。Sketchfab 的 CC-BY 挤奶厅扫描只能等用户登录后自行下载，仅作参考。

## 经验（挤奶厅测试件，2026-09-27）

**各步耗时**（墙钟时间，含等其他 Blender 让出 GPU）
- 来源调查：约 10 分钟。Poly Haven 和 ambientCG 都有公开 API，Sketchfab 的搜索 API 也不用登录，但下载要登录。
- 平面图：约 10 分钟，用 matplotlib 画，布局常量放在 `layout.py`，平面图和建模共用一份。
- 建模脚本第一版：约 25 分钟（约 900 行，全程序化）。
- 1000px/24spp 迭代 5 轮：每张约 20–40 秒。等 GPU 的时间反而比渲染长。
- 2000px/64spp 定稿：4 张约 2 分钟。

**好用的做法**
- 所有贴图用 Image Texture 的 BOX 投影，坐标用 Object 坐标，不用展 UV，几百个程序化物体可以直接上 PBR。
- 管子和栏杆统一用曲线加 bevel_depth，在折线拐角插二次贝塞尔做成弯管，镀锌栏杆一下就像真的了。
- 草用几何节点：Distribute Points 加 Collection Info（4 种草丛原型）加 Instance on Points，靠 Object Info Random 给颜色变化。选区用网格上的命名属性来控制。
- 不锈钢：Metal009 的粗糙度图经 MapRange 映射到 0.6×–1.6× 基础粗糙度，再加各向异性。基础粗糙度 0.25 左右最像不锈钢，0.1 会变成镀铬。

**坑**
- 用 zsh 时 `cat > file <<EOF` 会写出空文件（环境里 cat/ls 被别名到 bat/eza），写文件改用 Write 或 /bin/cat。
- Blender 5.2 里 Distribute Points on Faces 没有 “Density Factor” 输入，改用 Selection。Random Value 节点要按 socket 类型（VALUE/INT/VECTOR）找输入，不能按下标找。
- 贴图自带的颜色会带偏：box_profile_metal_sheet 是红色，rubber_tiles 近乎全黑。先看一眼贴图，再决定要不要去饱和或乘色。
- 奶管高度先问清系统类型：用户认为高位（1.65–1.95 m）明显不对，现代鱼骨厅按低位做（沿坑壁、比站台面略低）。
- 杯组静止挂钩姿态：爪在上，杯倒挂、唇口朝下，短奶管从杯底（朝上）接到爪的进奶嘴。第一版把结构做反了，被用户指出。
- 大地面网格会穿进坑里、盖住楼板，要把室内范围的顶点压到楼板下面。
- 湿地面：遮罩覆盖太大会变成镜面地板。积水面积控制在 15–25%，过渡要宽。

**给伊甸庄园 / 衣帽间复用**
- `fetch_assets.py` 的写法（Poly Haven 贴图 / HDRI / glTF，加 ambientCG 的 zip）可以直接照抄。
- `build.py` 里的 `pbr()`、`steel()`、`galvanised()`、`rubber()`、`tube()`/`bent()`、`box()`（带倒角和 harden normals）、草地几何节点，都可以抽成公共模块，比如 `blender/landmarks/common.py`。衣帽间要的金属挂杆、布料、木柜正好能用。
- 流程：先做来源调查，再画平面图（和建模共用常量），然后 1000px 快速迭代，一轮审阅（美术总监加现编的行内人），最后出定稿。这套流程约 1.5 小时，能出一个可以看的写实测试件。


## 教训：Blender → 浏览器交互（挤奶厅测试件，2026-09-27）
- 流程：`build.py --blend` 存场景 → `export_glb.py`（按网格名正则分组 → 合并 → 按预算 decimate → Smart UV 新建 `bake` UV → Cycles COMBINED 烘焙，只要 diffuse 直射 + 间接 + 自发光 → 场景 AgX 视图变换存 8 位 → 每组一张图的新材质）→ gltf-transform **先 webp 后 meshopt**（反过来 webp 会把 meshopt 解掉）。256 spp，GPU 250 s。
- 尺寸：73 万 → 27 万三角形，15 个网格 = 15 次 draw call；原始 15.3 MB → 4.8 MB（高档，2048² 为主，WebP q80）/ 2.8 MB（低档，1024²，q75）。KTX2 没用：vendor 里没有 basis 转码器，toktx 也没装。
- 踩坑：① 不加 `--factory-startup` 时用户偏好是中文界面，默认节点名被翻译（'Principled BSDF' 找不到）——一律 `nodes.clear()` 后新建；② 金属 / 透射材质烘成黑，烘前改 metallic 0、roughness 1、去掉玻璃；③ 地面的「沉到楼板下」的点被 collapse decimate 拉起来盖住了坑——先删 z < -0.2 的点，再平面合并（57600 → 493 面）；④ meshopt 量化把解码缩放放在节点矩阵上，three 里设 `matrixAutoUpdate=false` 之前必须先 `updateMatrixWorld`，否则模型缩成一点；⑤ 几百个小零件的组（杯组）Smart UV 岛很碎，2048 图大半是空白——下次按零件类型分图或用 Lightmap Pack。
- 可复用给伊甸 3D：`export_glb.py` 的分组表（改正则）、`map/props/viewer3d.html`（清单驱动，热点 / 分组 / 相机 / 低档 glb）、`tools/browser/viewer3d_perf.mjs`。网格命名约定 `roof / walls_ext[_N] / interior[_N] / floor_N / props_<id> / site_*`，内透建议见 `docs/reviews/dairy_interactive/xray.md`。
- 接入：maps.json 里 kind=estate 的地图加 `"viewer3d": "<id>"` 就改走 `props/viewer3d.html` + `props/<id>/manifest.json`（查看器注入 `window.__V3D_MODEL`，其余沿用 estate:* 消息与 blob iframe）。伊甸切换 = 给 `eden_estate` 加一行 `"viewer3d": "eden"`；`test: true` 的地图只出现在设置弹层底部，不参与当前地点匹配。`EdenMap.flyTo({ map, hotspot })` 宿主页 / 地图页都有。
