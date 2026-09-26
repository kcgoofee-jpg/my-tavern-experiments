# 真实 3D 建筑几何试点（GOAL「合并发版」A4）

中层核心区现在用 OSM 的曼哈顿中城轮廓 + 高度「往上拉」成柱体，再按规则加女儿墙、退台塔楼、屋顶设备（`tc_city.roof_kit`）。
审阅意见是楼顶材质单调、网格点阵感强。本文调研开放许可的真实 3D 建筑数据，并在中层核心区一块 8K 局部上做「轮廓拉伸」与「真实几何」对比。

## 结论（2026-09-27）

**推荐以「混合」（hybrid）方式接入中层核心区：真实几何，再在最高一级屋面上用规则加女儿墙和设备。本次不直接替换，列为 GOAL 的 A5 任务，前置条件是 A3 的平直着色修复。**

同一块 8K 局部（归一化 0.55,0.10,0.70,0.24，1200×700 原始像素，64 采样）：

| | 轮廓拉伸（现状） | 真实几何 | 混合 |
|---|---|---|---|
| 图 | `docs/drafts/real3d_extrude.jpg` | `docs/drafts/real3d_real.jpg` | `docs/drafts/real3d_hybrid.jpg` |
| 写实航拍 | 4 | 6.5 | **7** |
| 俯视可读性 | 5 | 7 | **8** |
| 技术美术 / 性能 | 5 | 7.5 | **8** |

三位 Opus 审阅的一致结论：选混合。

### 审阅意见摘要
- **写实航拍**：
  - 拉伸版是整片平屋面加一样的「蓝方块 + 白点」，点阵感最强。
  - 真实几何的退台、机房一出来就像曼哈顿中城，但屋面是同一种中灰、偏亮，像白模。
  - 楼冠灯带对不上新几何：有 U 形线、虚线框、三角形楼上的断线。
  - 混合版的太阳能板偏亮、偏蓝，是全图最抢眼的地方。
  - 最该补的三件事：
    1. 屋面材质按楼、按每一级退台分开变化（沥青、碎石、浅色防水膜），再按高度压暗。
    2. 楼冠灯带沿真实屋面的轮廓生成。
    3. 屋顶设备扩展到各级退台，太阳能板压暗、降饱和。
- **俯视可读性**：
  - 真实几何的街区边界更利落，缩到 1/4 仍能数清街区，楼高层次能读出来。
  - 左侧细碎的小体块放大看像马赛克。
  - 塔顶那圈断续的金色轮廓像选中框，容易和地点标记撞车。
  - 需要调的三件事：
    1. 楼冠灯带改成连续、低亮度的线（或全图缩放时不显示）。
    2. 在 2000px 那一级，把很小的屋面体块并进上一级。
    3. 路面和人行带再压暗约 10%，或给屋面加一圈细亮边，保证不规则街区与街道分得开。
- **技术美术 / 性能**：
  - Blender 4.1+ 用 `polygons.add` 新建的网格默认是平滑着色。真实几何的复杂 n 边形屋面因此出现褶皱状明暗；测试脚本已显式设 `use_smooth=False` 修掉。
  - 同一个问题也影响现有的 `poly_prisms`、`box_mesh`、`prism_mesh`、`flat_polys`，已交给 A3 修（本任务不改这些函数）。

### 代价
- **渲染**：同一 crop 三种模式都约 32 s，场景构建 3–7 s。
- **内存**：峰值 2.17–2.24 GB，基本不变。
- **几何量**：核心区真实楼 6.4 万面（crop 所在核心区 1719 栋），对全场景可以忽略；全图渲染时间、内存预计持平。
- **数据体积**：`manhattan.npz` 1.6 MB 进 git。原始 CityGML（DA10 + DA12，解压 1.1 GB）不进 git，重新下载只需约 83 MB。
- **处理时间**：`build` 约 8.5 分钟（单核），峰值内存 87 MB。只在数据变动时跑。

### 风险（接入时处理）
- **退化面与非平面屋面**：build 阶段要过滤退化面。约 6% 的屋面高差超过 0.5 m，同一块屋面的 z 取中位数压平（地标的 LOD2 坡面除外）。
- **与 OSM 道路、交界大道的对位**：真实楼也要过 `drop_on_roads`，或按路宽裁切。本次只按城区多边形和交界带过滤。
- **高度**：`tops_mid` 的 cap 会压扁 300 m 以上的楼。另外 `BH` 包含尖顶和天线，要另存「最高屋面高度」，用它来定高度。
- **楼冠灯带与招牌**：两者依赖 `obb`，要改用最高一级退台的 obb（`tobb`），高度用该级屋面的真实高度 × 缩放系数。

### 署名（写进 `maps.json` 中层的 `credit`）
> 核心区建筑几何：NYC 3-D Building Model（2014），© City of New York / Office of Technology and Innovation，NYC Open Data；经投影、旋转、缩放并叠加生成内容。

英文：
> Core-district building geometry: NYC 3-D Building Model (2014), City of New York / Office of Technology and Innovation, via NYC Open Data; reprojected, rotated, scaled and combined with generated content.

与现有的 `© OpenStreetMap contributors (ODbL)` 并列。

### 接入 tc_city 的最小改动（A5，A3 平直着色修复之后）
1. **`DISTRICTS`**：给 `core` 加 `geom='real3d'`（`upper` 与 `mid` 共用这份配置，上层远景跟着一起换）。
2. **`City.__init__`**：
   - 在 OSM 循环与撒树之后，按 `tc_real3d.load(region)` 替换 `geom='real3d'` 城区的楼。
   - 过滤规则与现有的一致：交界大道、过渡带、`drop_on_roads`。
   - 用独立的 rng，不消耗城市的随机序列；替换后同步 `self.roof` 的长度。
3. **`City.buildings_mesh`**：按 `'real' in b` 分流，真实楼走 `real_mesh`（逻辑见 `test_real3d_crop.py` 的 `_real_mesh`，搬进 `tc_city`）。
4. **`roof_kit`**：加参数 `real='hybrid'`：
   - 真实楼不生成退台塔楼；
   - 女儿墙、设备、太阳能板放在最高一级屋面（`top_p` / `tobb`）上，并按审阅意见扩展到各级退台，太阳能板压暗。
5. **`tiancheng_mid.py`**：楼冠暖光段与招牌改用 `tobb`，灯带沿真实屋面轮廓生成。
6. **`tops_mid`**：真实楼用「最高屋面高度」，并放宽 cap，避免压扁超高层。


## 1. 候选数据调研（2026-09-27 查官方页面）

| 数据 | 覆盖 | 几何细节 | 格式 | 许可与署名 | 体积 | 到 Blender 的路径 |
|---|---|---|---|---|---|---|
| **纽约市 3-D Building Model**（NYC OTI，原 DoITT；2014 航测） | 纽约市五区全部楼（约 108 万栋），按 20 个 Delivery Area（DA）分块 | 以 LOD1.5 为主：每栋楼按屋顶的不同高度拆成多块屋顶面（**退台、机房、塔冠都在**，屋面是平的）；约 100 栋地标（帝国大厦、克莱斯勒等）LOD2 | CityGML 1.0（`DA_WISE_GML.zip`）、ESRI Multipatch（gdb）、DGN；另有城市规划局按 59 个社区区转的 Rhino `.3dm` 版 | NYC Open Data：使用无限制、免费；再发布时须注明来源、版本和改动（Open Data 技术标准手册）；数据按原样提供，不担保 | 整包 CityGML 874 MB（解压约 14 GB）；曼哈顿中城只需 DA10 + DA12：压缩 83 MB / 解压 1.1 GB | 本仓库 `blender/tc_real3d.py`：HTTP Range 只取需要的 DA → Python 流式解析 CityGML → npz；或 citygml-tools `to-cityjson` → cjio `export glb/obj` → Blender 导入 |
| **日本 PLATEAU**（国土交通省） | 全国 200+ 城市（东京 23 区等） | 大部分 LOD1、主要城区 LOD2（真实坡屋顶、屋顶形状），部分 LOD3、带纹理 | CityGML 2.0（i-UR 扩展）；官方另发 3D Tiles、MVT、FBX / OBJ、GeoPackage | 政府标准利用规约 / PDL1.0，与 CC BY 4.0 兼容，可商用；著作权属各地方公共团体；署名示例「出典：国土交通省 PLATEAU」，改动过要写「…を加工して作成」 | 按三次地域网格（约 1 km）分文件，单文件 ≤ 1 GB；一个区的 LOD2 建筑几百 MB | 直接下 OBJ / FBX 导入 Blender；或 PLATEAU GIS Converter（Rust，MIT，GUI / CLI）CityGML → glTF / OBJ |
| **荷兰 3DBAG**（TU Delft 3D 组 + 3DGI） | 荷兰全国 1000 万栋 | LoD1.2 / 1.3 / **2.2**（全自动重建的真实屋顶形状），无纹理 | CityJSON、GeoPackage、OBJ、IFC、WMS/WFS；四叉树瓦片 | CC BY 4.0；署名「3DBAG by the 3D geoinformation research group (TU Delft) and 3DGI」 | 按瓦片下载，单瓦片几 MB–几十 MB | OBJ 瓦片直接导入；或 CityJSON → Up3date（Blender 插件）/ cjio |
| **OSM Simple 3D Buildings** / Overture Buildings | 全球，但屋顶标签稀疏 | `building:part` + `roof:shape` / `roof:height`，只在少数地标上有人画；本质仍是 2.5D 挤出 | OSM XML / GeoParquet（Overture） | ODbL 1.0（Overture 建筑层同样是 ODbL，含 OSM） | 小 | 我们已有 `tc_osm.py`；可以读 `building:part` 做分段挤出，但曼哈顿中城覆盖不全 |
| **Google Open Buildings 2.5D Temporal** | 非洲、南亚、东南亚、拉美（**不含美国、日本、香港**） | 只有 4 m 栅格的建筑存在 / 高度估计，没有屋顶形状 | GeoTIFF / Earth Engine | CC BY 4.0 与 ODbL 双许可 | 大 | 不适用（覆盖和细节都不够） |
| **香港 3D 空间数据**（地政总署 CSDI 3D-BIT00；规划署 3D 实景模型） | 全港（地政总署）；港岛 / 九龙部分（规划署） | 带纹理的独立建筑模型 | 3D Tiles（API）、Max / 3ds / FBX / VRML；规划署有 OBJ | DATA.GOV.HK 条款：商业与非商业均可免费再用，需注明来源 | 按图幅 | 可作为下一步给 `kowloon`（中层商业区）换真实几何的候选 |

说明：
- 纽约数据标称「LOD2」，官方元数据写得更准确：LOD1 与 LOD2 的混合，**大部分是 LOD1.5**——屋顶是平的，但每一级退台、屋顶机房、水塔、塔冠都是独立的屋顶面、各有真实高度。俯视时这正是我们缺的东西（楼顶的层次），坡屋顶反而在曼哈顿中城几乎没有。
- 坐标系 EPSG:2263（NAD83 纽约长岛州平面，美国测量英尺），高程是绝对高程（英尺）。`tc_real3d.py` 自己实现了 Lambert 等角圆锥的正反算，不依赖 pyproj，反算回经纬度后走 `tc_osm.projector` 同一公式，与 OSM 轮廓对位误差在米级（NAD83 / WGS84 差约 1 m）。
- 通用转换工具：citygml-tools（Java，`to-cityjson`，Apache 2.0）→ cjio（Python，`export obj|glb`）；PLATEAU GIS Converter（Rust，MIT）；FME（商业，不用）；3DCityDB（数据库，过重）。本试点没用外部工具：CityGML 是规整的 XML，Python 标准库 `xml.etree.iterparse` 流式读即可，省掉 Java 依赖。

来源：
[NYC 3-D Building Model 元数据（CityOfNewYork/nyc-geo-metadata）](https://github.com/CityOfNewYork/nyc-geo-metadata/blob/main/Metadata/Metadata_3DBuildingModel.md) ·
[下载目录 maps.nyc.gov/download/3dmodel](https://maps.nyc.gov/download/3dmodel/) ·
[NYC 3D Model by Community District（NYC Open Data）](https://data.cityofnewyork.us/City-Government/NYC-3D-Model-by-Community-District/u5j4-zxpn) ·
[NYC Open Data 技术标准手册：公共政策](https://cityofnewyork.github.io/opendatatsm/publicpolicies.html) ·
[PLATEAU 入手方法与格式](https://www.mlit.go.jp/plateau/learning/tpc03-1/) ·
[PLATEAU FAQ](https://www.mlit.go.jp/plateau/faq/) ·
[PLATEAU サイトポリシー](https://www.mlit.go.jp/plateau/site-policy/) ·
[PLATEAU GIS Converter](https://github.com/Project-PLATEAU/PLATEAU-GIS-Converter) ·
[3DBAG 文档](https://docs.3dbag.nl/en/) ·
[Google Open Buildings 2.5D Temporal](https://sites.research.google/gr/open-buildings/temporal/) ·
[香港 CSDI 3D Spatial Data API](https://portal.csdi.gov.hk/csdi-webpage/apidoc/3d-spatial-data-api) ·
[citygml-tools](https://github.com/citygml4j/citygml-tools) ·
[cjio](https://github.com/cityjson/cjio)

## 2. 数据处理（`blender/tc_real3d.py`）

```
python3 blender/tc_real3d.py fetch manhattan     # 系统 python3 即可：只取覆盖 REGIONS['manhattan'] 的 DA10、DA12（压缩 83 MB）→ blender/data/real3d/raw/（.gitignore）
$BLENDER_PY blender/tc_real3d.py build manhattan # 需要 numpy（Blender 自带的 python）：CityGML → blender/data/real3d/manhattan.npz（进 git）
```

- **fetch**：`DA_WISE_GML.zip` 是 874 MB 的整包，但 zip 的中央目录在文件尾，用 HTTP Range 读目录后只解压需要的成员（先取 `DeliveryArea.shp` 算哪些 DA 与区域外接框相交），不下可执行文件，不下整包。
- **build**：流式解析每栋 `bldg:Building`，取屋顶面、外墙面（地面面只用来算楼底高程和占地轮廓），EPSG:2263 → 经纬度 → `tc_osm.projector` 同一投影 / 旋转；中心落在取材框（2400 m × 1700 m）内的楼才留下；楼内顶点去重、量化成 int16（平面 5 cm、高度 0.1 m）。
- **npz 字段**见脚本头注释：顶点 `V`、面 `FL / FI / FT`、每栋楼的面范围 `BF`、楼高 `BH`、地面轮廓 `BP*`、最高一级屋顶轮廓 `TP*`、纽约楼号 `BIN`。

## 3. 对比试点（`blender/test_real3d_crop.py`）

```
Blender -b -P blender/test_real3d_crop.py -- --mode extrude|real|hybrid --res 8000 --samples 64 --crop 0.55,0.10,0.70,0.24 --out <路径>.png
```

- 用 runpy 原样执行 `tiancheng_mid.py`（材质、灯光、霓虹、光晕全部复用），只在测试脚本里打补丁：`City.__init__`（替换核心区的楼）、`City.buildings_mesh`（真实楼走原始屋面和外墙）、`tc_city.roof_kit`（真实楼不加假的退台）。
- `tc.write_data` 置空，不写 `map/data`；不给 `--out` 时输出到 `docs/drafts/`。
- 渲染前先用 `pgrep -f "[M]acOS/Blender -b"` 确认没有其他渲染在跑。
