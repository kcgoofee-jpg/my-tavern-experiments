# 伊甸庄园 three.js 精装重做 · 执行清单（CLOUD_TASK7 第 3 步）

依据：四份审阅（建筑 5、室内 4.5、营销 5、交互性能 6.5），`docs/eden-estate.md`（设定，以它为准），`CLOUD_TASK7.md` 第 3 步。
目标：四位审阅都 ≥ 8，最多 3 轮。

> **硬约束（每个 WP、每一轮都适用）**
> - 任何地方都不建模、不描写性相关或束缚类的道具、设施、房间细节。
> - 中性房间「私人房间 A」(320) 和「附属用房」(403) 只放普通家具：沙发、扶手椅、书桌和椅子、书柜、衣柜、单人床、茶几、台灯，403 另有长桌和储物柜。
> - 卫浴只放常规洁具。
> - 不改 `map/estate/closet/` 和 `demo.html`，也不改 `map/viewer.html`、`map/data/maps.json`。
> - 嵌入协议（`index.html` 顶部注释）的消息名、字段和语义不变。

---

## 1. 裁决

### 1.1 坐标：保留模型现有轴向，只换算设定的数值

保留现有轴向的理由：`main.js` 的相机、剖切、拾取、`building.js` 的立面代码都建立在「+z 为正面、原点在主楼中心」上。换轴要全体重写，风险最大，也换不来画面上的收益。

| 量 | 换算（模型 ← 设定） |
|---|---|
| 府邸坐标 `x0…x1 × y0…y1` | `r = [x0, x1, −y1, −y0]`（x 不变，z = −y；+z 仍是正面和南方） |
| 岛坐标 `(X, Y)` | 模型 `(X, 25 − Y)`。岛椭圆 `rx 335, rz 250` 的**中心移到模型 (0, 25)**，府邸仍在原点 |
| 标高 | F1–F4：模型 y = 设定标高 + 1.2（保留 1.2 m 基座）。F5：y = 18.7，比设定低 0.15 m，因为它就是挡檐墙的顶面 |
| 方位 | 设定的「北」= 模型 −z，「西」= 模型 −x |

`plan.js` 新增并导出两个换算函数，所有文件只通过它们换算：

```js
export const ISLE = { cx: 0, cz: 25, rx: 335, rz: 250 };
export const D2M = (x0, x1, y0, y1) => [x0, x1, -y1, -y0];
export const I2M = (X, Y) => [X, 25 - Y];
```

`ISLAND` 保留为 `ISLE` 的别名。

### 1.2 审阅意见冲突的裁决

| 议题 | 各方意见 | 裁决与理由 |
|---|---|---|
| 大厅棋盘格 | 室内：保留。营销：换掉 | **按设定 §4-101 保留，但换做法**：改成 1.2 m 斜置（45°）的 Statuario 与 Nero Marquina 棋盘格，两种石材都带纹理；四周加 0.6 m 黑金花饰带；中心嵌直径 4 m 的黄铜加西耶纳黄家徽盘；表面降低清漆感，加磨痕。<br>这样既满足室内的「保留」，又去掉营销说的「样板间感」。楼梯厅 108 和过厅 106 改成素 Statuario 加黑色饰带，不再用棋盘格。 |
| 室内暖光 | 室内：每个主房间一盏 PointLight。性能：每层一盏，数量固定 | **光源总数固定，只调强度**。每层 1 盏，共 5 盏；另有 1–2 盏「焦点光」，跟着被钉住或聚焦的房间移到它的吊灯位置。其余房间用 `glow` 自发光烛芯和窗户暖光。这样不会触发着色器重编译。 |
| Physical 材质 | 室内：全部用。性能：只在 T0/T1 用 | T0/T1 用 `MeshPhysicalMaterial`；T2（启动时判定，或 `?tier=2`）退回 Standard，颜色相同。 |
| SSAO | 性能：可选，T0 空闲时开 | **第 1 轮不做**。第 2 轮如果室内分数仍 < 8，只在 T0 空闲帧加 N8AO。 |
| 真实素材（§3a） | 简报：优先 CC0 | **第 1 轮全部程序几何**，以免许可、网络和体积拖慢进度。WP-C 先把 GLTF/KTX2/meshopt 加载器放进 vendor，但不预载。<br>第 2 轮再针对 < 8 的近景件（马桶、浴缸、毛巾、床品、座钟）引入 Poly Haven CC0 素材：放在 `assets/`，glTF 用 meshopt 压缩，贴图用 KTX2，来源记入 `assets/CREDITS.md`。 |
| 首屏海报 | 性能：`poster.webp` | 不做。vendor 本地化加上延迟建层，就能在 2 s 内出首帧。 |
| 页面背景 | 营销：奶油羊皮纸加暗角 | 只在非嵌入时生效：浅色主题用羊皮纸 `#efe6d2` 径向渐变加暗角，深色主题用暖夜蓝加暗角。**嵌入时仍然透明**，不影响协议。 |
| 楼层条 | 性能：手机上改成底部横排 | 宽度 ≤ 640 px 时改成底部横排 chip，左边距用 `var(--inset)`，避开查看器左下角的层切换器。桌面不变。 |
| 剖切后看不到墙上的东西 | 营销要肖像、窗帘，室内要护墙板，但墙只剖到 1.2 m | **「远墙升高」**：剖切模式下，外墙和少数指定内墙的 1.2 m 以上部分放进 `hi` 子批次，按朝向分组。背对相机的那一面（远墙）显示到层高，朝向相机的近墙仍剖在 1.2 m。任意转视角都成立。<br>壁挂物（肖像、镜、窗帘、护墙板上段）只放在这些墙上。 |
| 五段式与服务区 | 建筑、营销一致 | 按设定：西端图书馆塔亭，东端音乐厅；仆役楼、马车房、工坊、机库移到西北服务区，用绿篱和树团遮挡。 |
| 寝 | 旧模型：主卧的别名。设定：317 次卧 | 按设定，「寝」指 317。 |
| 衣帽间 | 旧模型：指更衣室。设定：102 叫衣帽间 | 按设定，衣帽间是 102；「更衣室」指 313。 |
| B1 | 设定：局部地下层 | 不加楼层按钮，`floors` 仍是 F1–F5。只把仆役楼梯的竖井向下画到 y −3.3。 |

### 1.3 文件归属（三个 WP 并行，文件不相交）

| 文件 | 负责 |
|---|---|
| `plan.js`、`building.js`、`site.js` | **WP-A** |
| `furniture.js`，`lib.js` 从文件头到 `/* ---------------- Batch` 注释行之前（G、纹理、材质、原型） | **WP-B** |
| `main.js`、`index.html`、新建 `vendor/**`，`lib.js` 从 `/* ---------------- Batch` 行到文件尾（KEEP、Batch、Kit） | **WP-C** |
| `NOTES.md`、`REFIT_PLAN.md`、`docs/drafts/estate_v*`、`docs/eden-estate.md` | 总架构师（整合） |

- 各 WP 只 `git add` 自己的文件，推送前先 `git pull --rebase`。
- `lib.js` 两段之间以 Batch 注释行为界，任何一方都不要跨界编辑。

---

## 2. 接口契约（三方共同遵守）

### 2.1 `plan.js` 数据（WP-A 产出，B 和 C 读取）

```js
FLOORS[i] = { id:'F1'..'F5', label:'1F'.., name, y, h }
// y / h：1.2/4.5 礼仪层 · 5.7/4.5 日常层 · 10.2/4.5 私人层 · 14.7/4.0 服务层 · 18.7/5.0 眺望层
// FLOOR_EN = ['State','Daily','Private','Service','Lookout']
ENTAB = [14.7, 17.6]

ROOMS[k] = {
  id: '101',              // 设定编号；两端塔亭用 'C1' 'C2' 'D1'
  name: '大厅',
  floor: 0..4,
  r: [x0,x1,z0,z1],       // 模型轴
  mat,                    // 地面材质键，见 2.3
  wall,                   // 墙面材质键，见 2.3
  rank: 1|2|3,            // 1 卖点（常显）/ 2 普通 / 3 服务（仅悬停显示）；墙面做法也由它定：state / family / service
  tall: ['-z','-x'],      // 升高的内墙边，可省略；外墙总是可升高
  parts: { bath:[..], dress:[..], wc:[..], bed:[..], void:[..], gallery:[..] },   // 可省略
  alias: [...], alias_en: [...],
  use, heritage, era,     // heritage = §4 的「传承细节」原句；era = '初代'..'五代' | '现任'
  src, note,
  minor, void, skipFloor, lp,
}
ROOM_BY_ID = Object.fromEntries(ROOMS.map(r => [r.id, r]))
EN[name] = [enName, enUse, enHeritage]      // 第 3 项新增，可省略

SHAFTS[k] = { id, name, r, color, floors:[..], stops:[..], use, src }

AREAS[k] = { name, alias, x, z, w,d | r, ell?, y, pri, use, heritage?, src }   // 模型轴

HERITAGE[k] = {
  id, name, en, floor: 0..4 | null,   // null = 室外，由 A 建模
  room: '101' | null,
  x, y, z, ry,                        // 世界坐标；y 是 ◆ 标记的高度
  kind, caption, caption_en, era,
  tour: 0 | 1..8,
  view?: { w, theta, phi },
}
```

### 2.2 函数

**WP-A 导出**
```js
buildHouse(full, site)      // 各层外壳 full[0..4]：主楼、两翼、连廊、塔亭、音乐厅、门廊、屋顶、穹顶
buildCut(b, fi)             // 第 fi 层的剖切几何：楼面、内外墙（1.2 m 剖切 + hi 子批次）、楼梯、竖井墙；对每个非 minor 房间调用 dressWalls
buildShafts(floorGroups)    // 签名不变，读 SHAFTS.floors / stops
setRooms(fn)                // 签名不变
buildIsland(scene, b), buildGardens(b)   // 签名不变；岛中心 (0,25)；小件放进 sub(b,'detail')
balustrade                  // 继续导出，site.js 用
```
`buildWings` 保留为空函数，等 C 删掉调用后在第 2 轮移除。

**WP-B 导出（`furniture.js`）**
```js
furnish(b, fi)                                      // 签名不变；按 ROOMS.filter(floor===fi) 和 room.id 布置；HERITAGE 里 floor===fi 的件也由它放
dressWalls(b, room, { y, h, rect, openings, tallSides })   // 由 A 在 buildCut 里调用
//   rect      = 墙内皮矩形 [x0,x1,z0,z1]
//   openings  = [{ side:'-z'|'+z'|'-x'|'+x', a, b, top }]，a/b 为沿墙的世界坐标
//   tallSides = 本房间实际升高的边（外墙边加 room.tall）
PROP = { crest, longcaseClock, bust, portraitFrame, liftCage, foundersDesk,
         crestChair, organ, armillary, boat }       // 每个都是 (k, opts)；A 用 crest / armillary / boat
toilet(k, { type:'low'|'high'|'close', seat:'mahogany'|'ebony'|'white', trim:'brass'|'nickel' })
towelStack(k, n, w, d, { t, col, crest })
towelHang(k, w, drop, { gap, col })
towelRail(k, w, h, bars, trim)
tub(k, { kind:'slipper'|'roll', len, col, dais })
basins(k, w, { n, top, trim })
bed(k, w, l, { fab, canopy:'none'|'poster'|'crown', pillows, deco })
drapes(k, w, h, { col, pelmet, tie })
sconce(k, …)
```
`topiaryPot`、`bench` 等保留，site.js 还在用。

**WP-B（`lib.js` 上段）**
```js
initMaterials(envMap, tier = 0)   // tier 2 退回 MeshStandardMaterial
MATS, UVS, NOCAST, PROTO, G       // G 只加不改
```

**WP-C（`lib.js` 下段）**
- `new Batch(name, { tile })`：`tile` 为空间分块边长（米）。
- `b.sub(tag)` 返回一个子 Batch，懒创建。`build()` 时子批次成为子组，放在 `grp.userData.subs[tag]`。
- `k.sub(tag)` 返回一个同变换的 Kit，写入 `b.sub(tag)`。

A 和 B 在 C 合入前一律用兜底写法：`const S = (b, t) => b.sub ? b.sub(t) : b`，Kit 同理。

子批次标签共 6 个，其余一律不用：

| 标签 | 内容 | C 的显示规则 |
|---|---|---|
| `detail` | 室外小件：栏杆柱、瓮、灯柱、系缆桩、花钵 | 可见宽度 `visW > 300` 时隐藏 |
| `fine` | 近景细件：毛巾绒边、五金、线脚、床品褶、流苏 | 聚焦某层且 `visW < 60`，或聚焦房间时，才构建并显示 |
| `hi-z` | 房间 z0 边的墙体上段和壁挂物（面朝 +z） | 相机相对目标的 Δz > 0 时显示；另外三个同理 |
| `hi+z` | 房间 z1 边 | Δz < 0 |
| `hi-x` | 房间 x0 边 | Δx > 0 |
| `hi+x` | 房间 x1 边 | Δx < 0 |

### 2.3 材质键

WP-B 保证下列键都存在，WP-A 只能用这些键。旧键全部保留：`stone`、`rustic`、`trim`、`trimShade`、`lead`、`gold`、`glass`、`water`、`lawn*`、`hedge`、`gravel`、`pavers`、`marble`、`marbleC`、`parquet`、`tile` 等。

**地面**

| 键 | 做法 | 色值 |
|---|---|---|
| `checker` | 1.2 m 斜置棋盘格 | Statuario / Nero |
| `checkSmall` | 0.3 m 小方格 | 黑金花 / 卡拉卡塔金 |
| `marble` | Statuario | `#F2F0EC`，纹 `#9A9A9C` |
| `marbleGold` | 卡拉卡塔金 | `#F1ECE2`，纹 `#B89B6A` |
| `marbleBlack` | 黑金花 | `#1E1E20`，纹 `#E8E6E0` |
| `versailles` | 橡木凡尔赛拼 | `#A57A4B` / `#7E5A34` |
| `herring` | 橡木人字拼 | 同上 |
| `oak` | 橡木直铺 | 同上 |
| `lino` | 油毡 | — |
| `stoneFlag` | 石板 | — |
| `compass` | 眺望亭罗盘星形拼花 | — |

**墙面**：`plasterStone`、`paintIvory`、`damaskRed` `#7B1E2B`、`silkBlue` `#2C3E63`、`silkGreen` `#2F5D4E`、`silkRose` `#C99A93`、`silkIvory`、`silkDuck`（鸭蛋青）、`chinoiserie`、`panelWalnut`、`panelMahog`、`tileWhite`、`plasterYellow`。

**构件**：`scagliola` `#6B2E35`，斑点 `#C4A48C`。

**金属与木作**

| 键 | 色值 | 参数 |
|---|---|---|
| `brass` | `#B5913F` | 金属 1，粗糙 0.2 |
| `ormolu` | `#C9A24B` | 金属 1，粗糙 0.3 |
| `nickel` | `#C7C9C8` | 金属 1，粗糙 0.15 |
| `iron` | `#26272A` | — |
| `mahogany` | `#5E2A1A` | clearcoat 0.3 |
| `walnut` | `#5A3A22` | clearcoat 0.3 |
| `ebony` | `#1C1512` | — |
| `satinwood` | `#D8B777` | — |

**卫浴与织物**

| 键 | 色值 | 参数 |
|---|---|---|
| `porcelain` | `#F6F4EF` | clearcoat 1，粗糙 0.05 |
| `towel` | `#F4EFE4` | sheen 0.8，sheenRoughness 0.9，粗糙 1，64² 噪点法线 |
| `linen` | `#F7F4EE` | sheen 0.25 |
| `velvetChamp` | `#CDB58A` | sheen 0.9 |

**地毯**：`rugAubAzure`、`rugAubCrimson`、`rugAubIvory`、`rugSavIvory`、`rugHeriz`、`rugRunner`。

**以太光**：`glow`（烛芯自发光）；`glass` 加 `#ffb865` 暖色自发光，强度 0.25。

---

## 3. 房间表（WP-A 按此写入 `ROOMS`；WP-B 按 id 布置；坐标已换算成模型轴）

格式：`id 名称 r 地面/墙面 rank [tall] {parts} 追加别名`。`*` 表示 minor。

**F1（y 1.2）**
```
101 大厅 [-12,12,2,22] checker/plasterStone 1 [-z] 门厅,玄关,Grand Hall     (柱 x±8, z 4.5/9.5/14.5/19.5, D0.9 scagliola, 1.2→10.2 通高)
102 衣帽间 [-20,-12,12,22] herring/panelMahog 3
103 访客盥洗室 [-20,-12,2,12] checkSmall/silkGreen 2 {wc:[[-20,-16,2,8],[-16,-12,2,8]]}
104 门房 [12,20,12,22] oak/paintIvory 3
105 候见室 [12,20,2,12] versailles/damaskRed 2 [-z]
106 一层过厅 [-20,20,-6,2] marble/plasterStone 2 [-z]
107 花园厅 [-8,8,-22,-6] versailles/silkDuck 1
108 主楼梯厅 [8,20,-22,-6] marble/plasterStone 2 楼梯厅,Stair Hall
109* 仆役楼梯 [-20,-14,-14,-6] stoneFlag
110 值班室 [-20,-14,-22,-14] lino/paintIvory 3 仆从值班室,Staff Duty Room
111 银器室 [-14,-8,-14,-6] stoneFlag/paintIvory 3
112 主人通道底站 [-14,-8,-22,-14] stoneFlag/panelWalnut 3
113 餐厅 [-44,-20,2,16] versailles/silkBlue 1 [-z] 饭厅
114 早餐室 [-54,-44,2,16] checkSmall/plasterYellow 2
115* 西翼廊 [-54,-20,-2,2] marble
116 备餐间 [-34,-20,-16,-2] stoneFlag/tileWhite 3 厨房,Servery
117 瓷器与花艺室 [-46,-34,-16,-2] stoneFlag/paintIvory 3
118 家族门厅 [-54,-46,-16,-2] stoneFlag/panelWalnut 2
119 会客厅 [20,44,2,16] versailles/damaskRed 1 [-z] 客厅,沙龙,Drawing Room
120 绿厅 [44,54,2,16] oak/silkGreen 2 小客厅,Small Parlour
121* 东翼廊 [20,54,-2,2] marble
122 台球室 [20,34,-16,-2] oak/panelWalnut 2
123 珍藏室 [34,46,-16,-2] oak/panelWalnut 2
124 东门厅 [46,54,-16,-2] stoneFlag/plasterStone 3
C1 图书馆塔亭 [-102,-78,-12,12] herring/panelWalnut 1 图书馆,Library Pavilion   (两层 F1–F2；八角塔身到 y 29.2)
D1 音乐厅 [78,102,-16,16] versailles/plasterStone 1 Music Room   (单层通高 11 m；北侧半圆后殿圆心 (90,-16)，半径 6)
```

**F2（y 5.7）**
```
201* 大厅上空 [-12,12,2,22] void {gallery:[-12,12,2,4]}（楼座 1.8 m 深，锻铁鎏金栏杆）
202 茶室 [-20,-12,2,22] herring/chinoiserie 1 Tea Room
203 客用侍从间 [12,20,12,22] oak/paintIvory 3
204 客用布草间 [12,20,2,12] oak/paintIvory 3
205* 二层过厅 [-20,20,-6,2] oak
206 起居室 [-8,8,-22,-6] versailles/silkDuck 1 Morning Room,Sitting Room
207* 主楼梯平台 [8,20,-22,-6] marble
209 楼层配餐间 [-20,-14,-22,-14] tileWhite/tileWhite 3
211 小储藏 [-14,-8,-14,-6] oak/paintIvory 3
212 书房 [-40,-20,2,16] herring/panelWalnut 1 [-z,-x] 图书室,Library
213 秘书室 [-54,-40,2,16] oak/paintIvory 2
214* 西二层廊 [-54,-20,-2,2] marble
215 档案与地图室 [-34,-20,-16,-2] oak/panelWalnut 3
216 保险库 [-40,-34,-16,-9] oak/panelWalnut 3
217 书房盥洗室 [-40,-34,-9,-2] marble/marbleGold 2
218 晨读室 [-54,-40,-16,-2] oak/silkIvory 2 Reading Room
219 客房 A [20,37,2,16] oak/silkBlue 1 [-z] {bath:[20,26,8,16],dress:[20,26,2,8],bed:[26,37,2,16]} 客房,Guest Room
220 客房 B [37,54,2,16] oak/silkRose 2 [-z] {bath:[48,54,8,16],dress:[48,54,2,8],bed:[37,48,2,16]}
221* 东二层廊 [20,54,-2,2] marble
222 客房 C [20,37,-16,-2] oak/silkGreen 2 {bath:[20,26,-16,-8],dress:[20,26,-8,-2],bed:[26,37,-16,-2]}
223 客用起居室 [37,54,-16,-2] oak/silkIvory 2
C2 塔亭阅览廊 [-102,-78,-12,12] oak/panelWalnut 2
```

**F3（y 10.2）**
```
301 肖像廊 [-12,12,2,22] herring/damaskRed 1 [-z,-x] 廊厅,Gallery Hall   (爱奥尼亚柱 x±8, z 同 101)
302 主人侍从间 [-20,-12,2,22] oak/paintIvory 3
303 布草间 [12,20,12,22] oak/paintIvory 3
304 家庭盥洗室 [12,20,2,12] marble/marbleGold 2
305* 三层过厅 [-20,20,-6,2] oak
306 家庭餐室 [-8,8,-22,-6] oak/silkDuck 2
307* 主楼梯顶层平台 [8,20,-22,-6] marble
309 侍从待命室 [-20,-14,-22,-14] oak/paintIvory 3
310 主人通道三层站 [-14,-8,-22,-14] stoneFlag/panelWalnut 3
311 主人前厅 [-14,-8,-14,-6] oak/panelWalnut 3
312 主人起居室 [-40,-20,2,16] versailles/silkBlue 2 [-z]
313 更衣室 [-54,-40,2,16] oak/panelMahog 2 Dressing Room
314* 西三层廊 [-54,-20,-2,2] oak
315 主卧 [-40,-20,-16,-2] versailles/silkIvory 1 主卧室,卧室,寝室,Master Bedroom,Bedroom
316 主浴室 [-54,-40,-16,-2] marble/marbleGold 1 {wc:[-54,-51,-16,-13]} 浴室,浴池,盥洗室,Bathroom
317 寝 [20,40,2,16] oak/silkIvory 2 {bath:[20,26,9,16],dress:[20,26,2,9],bed:[26,40,2,16]}
318 家庭客厅 [40,54,2,16] oak/silkIvory 2
319* 东三层廊 [20,54,-2,2] oak
320 私人房间 A [20,36,-16,-2] oak/paintIvory 3 私人房间,私人房间A,Private Room   (中性)
321 备用卧室 [36,54,-16,-2] oak/paintIvory 2 {bath:[49,54,-16,-11]}
```

**F4（y 14.7，只有主楼）**
```
401 女仆长办公室 [-20,-8,12,22] oak/paintIvory 3 办公室,Head Maid's Office
402 女仆长卧室 [-20,-8,2,12] oak/silkDuck 3 {bath:[-11.5,-8,2,5.5]}
403 附属用房 [-8,8,10,22] lino/paintIvory 3 Ancillary Room   (中性)
404 员工起居室 [-8,8,2,10] oak/paintIvory 3 仆役厅,员工餐厅,Servants' Hall
405 洗衣房 [8,20,12,22] tile/tileWhite 3 洗衣,Laundry
406 储藏室 [8,20,2,12] lino/paintIvory 3 储藏,Store
407* 四层廊 [-20,20,-6,2] oak
408 监控室 [-8,8,-14,-6] lino/paintIvory 3 监控,安保室,Security Room
409 结界值守室 [-8,8,-22,-14] stoneFlag/plasterStone 3
410 员工卧室 [8,20,-22,-6] oak/paintIvory 3 {void:[8,12,-20,-8]}   (光井)
412 员工盥洗室 [-20,-14,-22,-14] tile/tileWhite 3
413 布草储藏 [-14,-8,-14,-6] oak/paintIvory 3
```

**F5（y 18.7）**
```
501 屋顶露台 [-20,20,-22,22] pavers 2 露台,观景露台,屋顶,Roof Terrace   skipFloor, lp [14,16]
502 眺望亭 [-7,7,-5,9] compass/plasterStone 1 电梯厅,私人电梯厅,穹顶,Private Lift Hall   (圆，圆心 (0,2)，内径 12.8)
503 主人通道出口亭 [-14,-8,-22,-14] stoneFlag 3
504 电梯出口亭 [12,16,-17,-12] marble 3
505 仆役楼梯出口亭 [-20,-14,-14,-6] stoneFlag 3
```

**竖井**

| 竖井 | 范围 | 颜色 | 服务楼层 / 停站 |
|---|---|---|---|
| 主楼梯 | [8,20,-22,-6] | 访客 `#4C8C99` | floors [0,1,2] |
| 电梯 | [12.5,15.5,-16.5,-12.5] | 访客 `#4C8C99` | stops [0,1,2,4]；3 需钥匙 |
| 仆役楼梯 + 食梯 | [-20,-14,-14,-6] | 仆役 `#C98A40` | floors [0..4]，竖井向下画到 y −3.3 |
| 主人通道 | [-14,-8,-22,-14] | 主人 `#7A5FA0` | stops [0,2,4] |

**别名兼容验收**：`maps.json` 里 eden_estate 的 `rooms`、`rooms_en`、`areas`、`areas_en` 每一项都必须通过 `estate:room` 命中一个房间或区域。例如「寝」→ 317，「浴室」→ 316，「小客厅」→ 120，「仆役厅」→ 404，「私人电梯厅」→ 502，「Morning Room」→ 206。

---

## 4. 传承件（HERITAGE）

室内件由 WP-B 建模，室外件由 WP-A 建模；◆ 标记和导览由 WP-C 做。坐标为模型轴。

| # | id / kind | 位置 | 年代 | 导览 |
|---|---|---|---|---|
| 1 | landingRing（A 自建） | ext (0, 1.0, 277)，候机亭 (0, 267) | 历代 | 1 |
| 2 | crest | ext 山花中心 (0, 18.9, 29.35)，宽 2.4 m，贴金 | 初代 | 2 |
| 3 | longcaseClock | F1·101 (−11.3, —, 16)，ry +π/2，高 2.6 m，表盘为星图 | 初代 | 3 |
| 4 | crest（地面镶嵌） | F1·101 (0, 12)，直径 4 m | 初代 | — |
| 5 | bust ×6 台座 | F1·106 z −5.3，x −18, −14.5, −11, 11, 14.5, 18；最后一座留空 | 历代 | — |
| 6 | portraitFrame ×12 | F3·301：西墙 x −11.6，z 4.5…19.5 步长 3（6 幅）；后墙 z 2.35，x ±4, ±7, ±10（6 幅），x +10 那幅空框衬深红丝 | 历代 | 4 |
| 7 | liftCage | F1–F3·108 电梯井；轿厢在 F1，门上有机械表盘 | 三代 | — |
| 8 | foundersDesk | F2·212 (−30, —, 9)，3 × 1.5 m，右手边有墨水渍 | 初代 | 5 |
| 9 | crestChair | F1·113 主位 (−39.8, —, 9)，面朝 +x | 初代 | — |
| 10 | tub（Statuario 整石） | F3·316 (−47, —, −9)，立在圆台上 | 三代 | 6（同框能看到马桶间和毛巾） |
| 11 | organ | F1·D1 (90, —, −19)，面朝 +z，贴金外壳，高 9 m | 四代 | 7 |
| 12 | armillary | ext 塔顶 (−90, 29.2, 0) | 四代 | — |
| 13 | 湖心圆亭（A 自建） | ext (15, 8, −102) | 三代 | 8 |
| 14 | boat | ext 水榭船屋 (62, 0.3, −93) | 初代 | — |

`caption` 直接用设定 §4 或 §7 的原句。

---

## 5. WP-A 建筑与总平面（`plan.js`、`building.js`、`site.js`）

1. **plan.js（最先提交，B 和 C 都依赖它）**
   - 写入 §1.1 的换算函数、§2.1 的字段、§3 的全表和 §4 的 `HERITAGE`，补齐 `EN` 的三项。
   - `AREAS` 按设定 §2.2 和 §2.3 重写成模型坐标：
     - 前庭：x ±55, z 36…70；喷泉在 (0, 53)。
     - 花坛：3 × 2 格，每格 12 × 13，格心 x ±22 / ±36 / ±50，z 45 / 61。
     - 大道：x ±3，z 70…270；椴树在 x ±7；16 座雕像台座在 x ±4.5, z 70…126。
     - 玫瑰园 (95, 70)，直径 50 的下沉圆园。
     - 迷园 (−95, 70)，50 × 50，中心日晷；别名：树篱迷宫、迷宫。
     - 后庭台地：z −22…−51。
     - 人工湖：x −60…75，z −70…−135。
     - 湖心圆亭：(15, −102)，小岛 r 5，8 柱，直径 5.6，高 7。
     - 水榭：(62, −93)，16 × 10；别名：凉亭。
     - 围墙花园：x 110…180，z −85…−135，墙高 3.5；别名：菜园、厨房花园。
     - 橘园：x 121…169，z −127…−137，高 7；别名：温室。
     - 果园：x 190…240，z −55…−105。
     - 预留草坪 ×2：(±175, 10)，105 × 95。
     - 服务区：仆役楼 x −172…−128, z −86…−100；马车房 x −170…−130, z −112…−122（别名：车库）；工坊 x −174…−166, z −90…−120；机库 x −122…−92, z −120…−140，机坪 x −120…−90, z −92…−118。
     - 观景台：(0, −215) 和 (±315, 25)。
     - 锚碑 ×4：(±235, −140) 和 (±235, 190)。
     - 停靠平台：圆心 (0, 277)，r 16。
     - 塔亭、音乐厅、柱廊连廊也作为区域项。
     - 服务区各项 `pri ≤ 4`。
2. **标高与檐部**
   - 按 §2.1 设置 FLOORS。
   - 檐部：额枋 14.7–15.6，檐壁 15.6–16.5，檐口 16.5–17.6（出挑 1.2，保留齿饰）。
   - 挡檐墙：17.6–18.7，实墙。
   - F4 的窗只开在檐壁里：1.0 × 0.8 的檐壁窗，正立面看不出是一层楼。
   - F5 露台栏杆从立面退进 1.5 m，高 1.1。
3. **门廊（科林斯，10D）**
   - 柱：6 根，x = −13, −8, −3, 3, 8, 13（柱距 5 m，中跨 6 m），柱中心线 z 28.3，r 0.675。
   - 柱座：方 1.89、厚 0.3。阿提卡柱础高 0.675。柱身有收分，柱顶半径 0.574。
   - 柱头：钟形高 1.57，两圈外翻的莨苕叶（半径 ×1.05 和 ×1.15），顶上是四边内凹的顶板，方 2.0、厚 0.2。
   - 台基：x ±15.5，z 22…29.5，前面 7 级台阶，踏面 0.4。
   - 山花：底边 y 17.6，宽 29.6，高 3.29（坡度 1:4.5），屋面只做到 z 22 立面为止。
   - 山花中心放 `PROP.crest(k, { w: 2.4, relief: true })`。
   - 门廊后的立面在 x ±13 做壁柱，开洞位置 x = 0, ±5.5, ±10.5。
4. **体量**
   - 中央主楼：x ±20，z ±22，外墙 0.9。
     - 正立面开洞：x 0, ±5.5, ±10.5, ±17.75。
     - 背立面：9 开间，x = 0, ±4.2, ±8.4, ±12.6, ±16.8；花园厅在中间 3 间开落地窗。
   - 两翼：x ±20…±54，z ±16，F1–F3，7 开间（中心 x ±37，间距 4.86）。平铅屋顶在 y 14.7，檐口 0.9，上面加栏杆。
   - 连廊：x ±54…±78，z ±3，高 5.5，爱奥尼亚单排柱，D 0.6，柱距 3。
   - 图书馆塔亭：24 × 24 × 10，上面是八角塔身，外接半径 5，塔顶到 y 29.2，铅皮小穹顶，顶上 `PROP.armillary`。
   - 音乐厅：24 × 32，单层 11 m，筒拱屋面，北端半圆后殿 r 6。
   - 删除旧的翼楼（仆役楼、机库）。
   - 内部承重墙厚 0.6，位置：x ±12、±20，z 2、−6；F4 另有 x ±8 和 z −6 / 10 围成的鼓座承重框。隔墙 0.3。
5. **立面细部**
   - F1 为粗面石，V 形砌缝。窗为半圆拱窗，宽 1.8、高 3.2，拱半径 0.9，配拱心石和 5 块拱石。
   - F2 窗 1.6 × 2.8，三角窗楣和弧形窗楣交替，配小阳台。
   - F3 为方窗，1.6 × 2.2。
   - 壁柱：宽 0.9，放在转角和翼楼交接处，翼楼端部成对；柱头块 0.9，柱础 0.45。
6. **穹顶**
   - 鼓座：圆心 (0, 2)，外半径 7，壁厚 0.6，高度 18.7→24.7。开 8 个拱窗，外围 16 根壁柱。
   - 穹顶：r 7.2，16 道肋，肋贴金，铅皮 `lead`。
   - 灯亭：r 1.6，高 3。顶上金松果顶饰，最高点约 32.2。
   - 删除旧的 x ±10 灯亭。
7. **剖切（`buildCut`）**
   - 墙体：墙都剖在 1.2 m。外墙四边的上段，以及 `room.tall` 指定的内墙上段，按 §2.2 放进 `hi±x`/`hi±z`，高到层高 −0.3，顶面盖深色 `#2d2723` 截面帽。门窗洞口照常开。
   - 大厅：101 的柱子用 `scagliola`，1.2→10.2 通高。F2 在 201 开楼板洞，楼座在 z 2…4。
   - 主楼梯：108 做悬挑双跑回转梯，F1→F3，梯段宽 2.2，锻铁栏杆加鎏金花饰。电梯井四面开敞，由 B 放铜笼。
   - 仆役楼梯：109，B1 到 F5，里面有 1.2 × 1.2 的食梯，位置 (−15, −7)。
   - 主人通道：螺旋梯加 1.4 × 1.4 单人电梯，只在 F1、F3、F5 开门；F1 在 z −22 后墙开一道暗门。
   - 光井：F4 的 [8,12,−20,−8] 开洞，屋面开天窗。316 上方的屋面开一个圆形天窗。
   - F5：三座出口亭，另有从 503 到鼓座西侧的 20 m 紫藤廊。
   - 每个非 minor 房间调用 `dressWalls`，参数格式见 §2.2。
8. **site.js**
   - 岛轮廓中心移到 (0, 25)，所有分区按 §5.1 重新摆放。
   - 服务区外侧用绿篱加树团遮挡，从主轴方向看不见。
   - 前庭喷泉：外池 r 7，三层水盘，顶上铜像「持苹果的少女」。
   - 停靠平台：铜栏用铜绿色，地面嵌金色引导环。
   - 小件全部放进 `sub(b,'detail')`。
   - 草坪条纹的对比度减半，这一点和 B 的纹理配合。
   - 锚碑：2 × 2 × 9 方尖碑，碑顶嵌以太晶（`glow`）。
9. **验收（A）**
   - `node --check` 通过。
   - 外观截图上，门廊宽高比、山花坡度 1:4.5、柱高 10D 可以量出来。
   - F4 窗从正面平视看不见。
   - 五段总宽 204 m。
   - 服务区不出现在首屏。
   - 所有房间的矩形在同一层内互不重叠，并且都落在外墙以内（写一个断言脚本）。
   - `HERITAGE` 里室外的 5 项都已建模。

---

## 6. WP-B 室内与材质（`furniture.js`，`lib.js` 上段）

1. **材质（`initMaterials(envMap, tier)`）**
   - 建齐 §2.3 的所有键，纹理 ≤ 512²（大多数 256²）。
   - 木作一律改用 `mahogany` 和 `walnut`，不再用 `woodDark`。
   - 五金用 `brass`，灯具用 `ormolu`，`gold` 只留给金箔。
   - 石材加轻微风化斑。地毯去饱和约 15%，加磨损纹，边缘 3 px 流苏。
   - 奥布松：花环卷草加玫瑰散花。萨伏纳里：象牙底加花环。赫里兹：大几何徽章，靛蓝边带，`#C9A24B` 细线。
   - 无纹理的织物尽量共用一个 Physical 材质，颜色烘进顶点色（Batch 会保留烘好的颜色），以控制 draw call。
2. **马桶（`toilet`）**
   - 基座：lathe 做收腰底座，剖面 [0.17,0] [0.2,0.05] [0.14,0.2] [0.19,0.38]，`fine` 子批次里加莨苕叶浮雕环。
   - 碗：椭球，半轴 0.2 × 0.12 × 0.26。
   - 座圈：torus，厚 3 cm。盖板比座圈大一圈，掀起 8°，配 2 个黄铜合页。
   - 低水箱：0.5 × 0.38 × 0.2，大理石盖四边各出 1 cm。冲水杠杆 12 cm，末端是瓷球。
   - `type:'high'`（103 用）：桃花心木高位水箱，底边在 y 2.0，鎏金铜托架，黄铜链加瓷拉手。
   - `close`（217、304 用）：连体式，乌木座圈。
   - 镀镍款（317、321、402、412 用）：白座圈。
   - 每处都配纸巾架和一盏小壁灯。
   - 摆放：103 两间隔间，217，304，316 马桶间，219、220、222、317 的浴室，321，402，412 两个。
3. **毛巾**
   - `towelStack`：每折厚 2.8 cm（103 的小方巾 1.8 cm），前后折边包一段圆柱，半径取厚度的一半。每层偏移 ±4 mm、转 ±1.5°。最上层前沿贴 1 cm 金色刺绣带，加一个 3 cm 的家徽圆片。
   - `towelHang`：对折搭在杆上，两片之间留 4 cm，下缘加 1.2 cm 半径的圆滚边。
   - `towelRail`：梯形，5 根横杆，黄铜。
   - 另有华夫格浴袍挂在铜钩上，以及藤编篮。
   - 数量：
     - 316：2 组电热毛巾架挂 4 条浴巾；台面叠手巾 4 条、面巾 6 条；2 件浴袍；1 只藤篮。
     - 219 型客房：2 条浴巾、2 条手巾、2 条面巾，浴袍叠在小凳上。
     - 103：铜环上 1 条蜂窝纹擦手巾，12 条小方巾分两叠。
     - 217：深绿毛巾 2 条。304：象牙白。
4. **浴缸与台盆**
   - 316：Statuario 拖鞋浴缸，长 2.0，一端高 0.75、另一端 0.6，卷边。立在直径 3.2、高 0.15 的圆台上。鎏金铜爪足，每只一颗球加三趾。落地龙头：两根立管，鹅颈出水，带手持花洒托架。上方挂一盏防潮烛形灯。
   - 客房：铸铁浴缸 1.8 m，外壁漆成房间色调。
   - 台盆：桃花心木柜，镶板门（1 cm 框线）加黄铜拉手。`marbleGold` 台面加挡水边，台下椭圆盆。鹅颈龙头，冷热两个十字把手，把手上有 H / C 珐琅帽。每个盆配一面椭圆鎏金镜，两侧各一盏壁灯。
   - 316 另有：玻璃加黄铜框淋浴间、三折化妆镜、屏风、丝绒扶手椅，地面中心嵌家徽。
5. **床与窗帘**
   - 315 帝政床：2.4 × 2.2，床头板软包并嵌家徽。皇冠式华盖用 ormolu，垂下 4 片丝缎帷幔，每片 8 条错位褶。
   - 315 床品：6 个羽绒枕（两排，前排略小），3 个装饰枕。被子四周用圆柱做圆边，从床沿垂下 0.25，被头翻折 0.35。床尾是三折的金色丝绒搭毯，另有床尾凳。
   - 客房：四柱床 2.0 × 2.1，4 个枕头加 2 个装饰枕。
   - 窗帘 `drapes`：每侧 8 条褶，交替错开 ±3 cm，在 0.45 高处用金色流苏系带收拢，上方是鎏金帘盒。只挂在 `hi` 墙的窗上。
6. **`dressWalls` 墙面做法**
   - rank 1：踢脚 0.22，护墙压条 0.9，墙面贴 0.01 厚的墙布或镶板皮。高墙段用 ormolu 细线分块，顶部檐口带 0.25。门洞加门套、门楣檐部和黄铜把手。
   - rank 2：踢脚 0.18，护墙压条，顶部檐口带 0.12。
   - rank 3：只做踢脚。
   - 墙面按 `room.wall` 取材质。1.2 m 以上的内容放进对应的 `hi` 子批次，细线条放 `fine`。
7. **按 §3 id 重写 `furnish`**
   - 家具以房间中心为局部原点摆放，陈设按设定 §4 逐件落实。
   - 吊灯按设定的臂数分级：101 两盏 48 臂，直径 2.4；113 三盏 36 臂。
   - 壁炉、床头、镜前加 `sconce`。
   - 盆栽棕榈比现在减少约 70%。
   - 中性房间只放 §0 硬约束里列的家具。
8. **传承件**：按 §4 实现 `PROP` 的全部函数，把 `floor != null` 的各项放进 `furnish`。
9. **验收（B）**
   - 在 316 聚焦、可见宽度约 8 m 时，截图里分得清：马桶的水箱、座圈、盖、手柄；毛巾的折层和圆边；龙头的十字把手。
   - 每层三角形预算：`furnish` 主批次 ≤ 150k，`fine` ≤ 300k。
   - 新增材质键 ≤ 45 个。
   - `tier=2` 时没有 Physical 材质。
   - 320 和 403 逐件核对，只有普通家具。
   - 全文检索确认没有违反硬约束的词或件。

---

## 7. WP-C 交互、性能与呈现（`main.js`、`index.html`、`vendor/`、`lib.js` 下段）

1. **本地化 three.js**
   - 用 npm 取 `three@0.160.0`，放到 `vendor/`：`three.module.min.js`；`jsm/` 下的 `controls/OrbitControls.js`、`renderers/CSS2DRenderer.js`、`environments/RoomEnvironment.js`、`utils/BufferGeometryUtils.js`；再加 `LICENSE`。
   - 第 2 轮备用、暂不预载：`loaders/GLTFLoader.js`、`loaders/KTX2Loader.js`、`libs/meshopt_decoder.module.js`。
   - importmap 改成 `"three": "./vendor/three.module.min.js"`，`"three/addons/": "./vendor/jsm/"`。
   - 给 three、main、lib、plan、building、site、furniture 加 `modulepreload`。
   - 看门狗：8 s 内没有首帧，就把 `#loading` 换成「加载失败 · 重试」。同时监听 `error` 事件。
2. **不让父页面滚动或缩放**
   - `window` 上加 `wheel` 监听，`passive:false` 并 `preventDefault`。
   - `html, body` 设 `overscroll-behavior: none; touch-action: none`。
   - Safari 的 `gesturestart`、`gesturechange`、`gestureend`：`preventDefault` 后调用 `zoomAt(x, y, scale/last)`；粗指针设备跳过。
   - 键盘 `+` / `−` / `0`。
   - 触屏单击延迟 250 ms 再钉住，给双击留出判定时间。
   - `pointermove` 拾取节流到每帧一次。
3. **延迟建层**
   - 启动时只建 `full` 和 `site`，首帧后立即发 `estate:ready`，时机不变。
   - 新增 `ensureCut(i)`：执行 `buildCut(cut[i], i)`，`build()` 后调用 `renderer.compileAsync(floorG[i], camera)`。
   - 空闲队列每个时间片建一层：先 cut，再 furn。
   - `setMode(i)` 遇到还没建的层就同步建。
   - `fine` 在 §2.2 的条件满足时才构建。
4. **性能分级**

   | 档 | 判定 | DPR | 抗锯齿 | 阴影 | 家具投影 | 材质 | 室内光 |
   |---|---|---|---|---|---|---|---|
   | T0 | 桌面 | ≤ 2 | MSAA | PCFSoft 2048 | 是 | Physical | 5 + 2 焦点 |
   | T1 | 粗指针，或 `deviceMemory ≤ 4`，或宽 < 700 | 1.5 | 关 | PCF 1024 | 否 | Physical | 5 + 1 |
   | T2 | `?tier=2`，或自动降级 | 1 | 关 | 关（靠 blob 接触阴影） | 否 | Standard | 5 + 0 |

   - 交互中如果 1 s 内平均帧时 > 33 ms，就降一档。运行时降档只改 DPR 和阴影，不换材质。
   - 拖动时 DPR × 0.75，停下 150 ms 后补一帧清晰画面。
   - 钉住房间的脉冲动画降到 15 Hz，2 s 后停止。
   - 新增可选 URL 参数 `?tier=` 和 `?debug=`，写进协议注释，属于新增项。
5. **`lib.js` 下段**
   - `Batch.add` 保留索引，按索引合并（没有索引的几何补一个顺序索引）。
   - `{ tile }` 按网格分块合并：site 用 96 m，每块计算包围球，让视锥剔除生效。
   - 实现 `sub()` 和 `Kit.sub()`。
   - 按 §2.2 控制各子批次可见性：`hi*` 按相机方位，每帧只在方位变化时更新；`detail` 和 `fine` 按可见宽度。
   - 「全部」模式下，隐藏远在屏幕外的楼层的家具。
6. **光与色调**
   - 太阳：`#ffd9a0`，高度 22°，从西南偏西照来，方向 `(−0.85, 0.37, 0.37)` 归一化。
   - 半球光 0.5，天空 `#dfe6f0`，地面 `#6b5a44`。ACES，曝光 1.1。RoomEnvironment 的 `envMapIntensity` 0.6。
   - 室外模式加淡暖雾 `#e9d9bd`。
   - PointLight：`#ffcf8a`，衰减 1.2，距离 70，不投影，每层一盏放在楼层中心 y + 3.2；焦点光移到被钉住房间的吊灯位置。数量全程不变，只调强度。
   - 暗角和羊皮纸背景用 CSS 做，嵌入时关闭。
7. **首屏视角**
   - 正对中轴：`theta 0.25`，`phi 1.05`，目标 (0, 5, 85)。画面要能看到从停靠环 (z 277) 到湖心亭 (z −102) 的整条轴线。
   - 手机竖屏：`theta 0.12`，`phi 0.95`，按高度适配。
   - 加载后 2 s 缓慢推近；嵌入时、以及 `prefers-reduced-motion` 时不推近。
   - 楼层视图适配新的平面：桌面按 x ±104 适配，手机按 x ±56（主楼加两翼）适配。
8. **标签与房间卡**
   - 标签：rank 1 常显（仍受遮挡剔除）；rank 2 在 `visW < 120` 时显示；rank 3 和 `pri ≤ 4` 的区域只在悬停时显示。
   - 房间卡依次是：编号 · 尺寸 · 用途；一条金线；传承细节（`room.heritage`）；年代（`era`）。出处徽章只在 `?debug=1` 时显示。
   - 英文用 `EN[name][2]`。
9. **标题**
   - `<h1>伊甸家族府邸</h1>`，下一行「始建约一百九十年 · HORTUS SUPRA NUBES」，旁边一个 22 px 的内联 SVG 家徽：天城蓝盾，金苹果树加金翅。
   - 英文：Eden Family Seat · founded c. 190 years ago。
10. **UI**
    - 帧率和三角形统计只在 `?stats=1` 时显示。提示行在手机和嵌入时隐藏。
    - 手机楼层条按 §1.2 改成底部横排。
11. **传承导览**
    - 楼层条上加「传承 / Heritage」按钮，打开 8 站导览（`HERITAGE.tour` 1..8），带上一站、下一站和一行说明。每站自动切到对应楼层，再 `flyTo`；默认可见宽度：室内 18 m，室外 60 m，山花 40 m。
    - 每个传承件显示一个金色 ◆ 标记，点开是说明卡。
    - 嵌入时不自动播放。
12. **`findByName`**：名称、别名、`EN[0]` 和 `alias_en` 都参与匹配，规则仍是「具体房间优先，其次最长匹配」。
13. **验收（C）**
    - 本地静态服务，Playwright：
      - 桌面 Chromium，CPU 限速 4×：首帧 ≤ 2.0 s；`estate:ready` 之前的传输量 ≤ 3 MB。
      - `map/estate/` 全部文件（不含 closet）≤ 15 MB。
    - Draw call：外观 ≤ 180，单层 ≤ 260（T0）；T1 外观三角形 ≤ 450k。
    - WebKit 375 × 812、DPR 2，模拟 T1：旋转和捏合时 ≥ 30 fps。
    - 嵌入测试：`?embed=1` 背景透明；5 种父到子消息、`estate:ready`、`estate:key` 行为不变；§3 的别名兼容表全部通过；父页面在滚轮、触控板捏合、Safari gesture 下都不滚动；控制台没有报错。

---

## 8. 轮次

| 轮 | 内容 | 产出 |
|---|---|---|
| **R1** | A、B、C 并行。A 先提交 `plan.js`（§3、§4 的数据），C 先提交 `Batch.sub` / `Kit.sub`，然后各自完成清单。<br>总架构师整合，跑 §5.9、§6.9、§7.13 的验收。 | 截图 `docs/drafts/estate_v1_*.png`，桌面 1440 × 900 和手机 375 × 812 各一套：ext、ext_m、all、F1–F5、axis_first、portico、hall101、gallery301、lib212、bed315、bath316、wc316、towel316、guestbath219、tour |
| **R2** | 同一批 4 位审阅重新打分，并给出增量清单。总架构师在本文件末尾追加「R2 增量」，按 WP 分派。<br>重点处理最低分的维度；室内 < 8 时引入 CC0 近景件；性能 < 8 时开启 SSAO 或进一步压 draw call。 | `estate_v2_*` |
| **R3** | 收尾打磨。 | `estate_v3_*` |

四位都 ≥ 8，或者满 3 轮后：更新 `map/estate/NOTES.md`（坐标换算、与设定的剩余差异、性能实测），在 `NOTES_FROM_LOCAL.md` 写「可以审阅：estate」。

**再次强调硬约束**：任何地方都不出现性相关或束缚类的道具、设施、房间细节；「私人房间 A」和「附属用房」只放普通家具；审阅截图里不特写这两间。
