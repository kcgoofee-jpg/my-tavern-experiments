# 伊甸庄园 Blender 重建 · 建造约定（CONTRACT）

适用：`CLOUD_TASK8.md`（任务 8）。设定以 `docs/eden-estate.md` 为准，平面数据以 `blender/estate/plan.py` 为准（从设定转录，`python3 blender/estate/plan.py` 自检）。
两位建造者并行：**SHELL**（建筑与场地、相机、导出、命令行）和 **INTERIOR**（材质、素材、家具、房间陈设）。各自只改自己名下的文件；要动对方的接口，先在本文末尾「变更记录」写一行，再改。

---

## 1. 单位、坐标、标高、墙厚

| 项 | 约定 |
|---|---|
| 单位 | 米，1 : 1（Blender 1 单位 = 1 m） |
| 世界坐标 = 府邸坐标 | 原点在中央主楼平面中心、F1 楼面；**x 向东，+y 向后（湖），正面 = −y**（前庭、大道、停靠平台），z 向上 |
| 岛坐标 | 原点在岛顶面中心，轴向相同；**岛 y = 府邸 y + 25**（`plan.i2m` / `plan.m2i`）。`plan.py` 里园林、附属建筑用岛坐标，建模时一律换成府邸坐标 |
| 房间 `rect` | `(x0, x1, y0, y1)`，墙**中线**围成的矩形；相邻房间共用边 |
| 地坪 | 室外地坪 = F1 楼面 = 0.00（`plan.GROUND_Z`） |
| 楼板 | 厚 0.30，在楼面以下（`plan.SLAB`）；楼板归**它上面那一层** |

楼层（`plan.FLOORS`）：

| 层 | 楼面 z | 净高 | 范围 |
|---|---|---|---|
| B1 | −4.50 | 3.6 | 只有仆役楼梯下的地道前室 B01 |
| F1 礼仪层 | 0.00 | 4.2（大厅 101 通高 8.7，楼梯厅 108 通高 13.2） | 主楼 + 两翼 + 塔亭 C + 音乐厅 D + 柱廊 |
| F2 日常层 | 4.50 | 4.2 | 主楼 + 两翼 + 塔亭 C 二层 |
| F3 私人层 | 9.00 | 4.2 | 主楼 + 两翼 |
| F4 服务层 | 13.50 | 4.2（顶棚结构面 18.00） | 只有主楼；两翼屋面 13.50 |
| F5 眺望层 | 18.85 | 亭子 3.2，鼓座 4.0 | 主楼屋顶平台 + 眺望亭 + 三座出口亭 |

墙厚（中线在 rect 边上，向两侧各分一半）：外墙 0.90（`WALL_EXT`，体块外边）；承重墙 0.60（`WALL_BEARING`，`plan.BEARING_LINES`：过厅两侧、主楼与两翼相接的原外墙、F4 鼓座下的方框）；房间隔墙 0.30（`WALL_PART`）；套间内部分间 0.15（`WALL_SUB`）。净空 = `rooms.inner_rect(room)`。

剖切：楼面 + 1.20 m（`plan.CUT`）。主楼、两翼的墙、柱**逐层分段**（从本层楼面到上层楼面），不跨层；塔亭 C、音乐厅 D 按房间净高。

---

## 2. 包结构与所有权

```
blender/eden_manor.py        命令行入口（薄壳）→ estate.main()；另把 build_eden_manor 转给 legacy_manor（上层底图还在用）   SHELL
blender/estate/
  CONTRACT.md                本文件                                                         lead（改动走变更记录）
  plan.py                    平面数据：房间、竖井、立面开间、体块、附属建筑、园林、岛轮廓、门窗推导、自检   lead（只读；改数据走变更记录）
  __init__.py                build(ctx) 总流程 + main() 命令行                                  SHELL
  core.py                    Ctx、集合命名、link() 标记、Batch（公制 UV）、剖切夹紧节点组          SHELL（INTERIOR 只调用）
  shell.py                   楼板、外墙与立面、内墙门洞、竖井楼梯、屋面、门廊、眺望亭、两翼、塔亭、音乐厅、柱廊   SHELL
  site.py                    岛体、园林、水面、树、附属建筑、停靠平台、锚碑                          SHELL
  views.py                   相机、光照、剖切、错层、近景、渲染（--crops）                          SHELL
  export.py                  房间多边形 → map/data/eden_estate_tiles.json                        SHELL
  mats.py                    材质库（含外墙风化、雨痕）                                          INTERIOR
  assets.py                  CC0 素材下载、缓存、CREDITS                                        INTERIOR
  furniture.py               家具与器物（马桶、洗手台、浴缸、毛巾、床品、窗帘、地毯、灯具……）       INTERIOR
  rooms.py                   房间饰面（地面、墙衬、顶棚）与陈设配方、近景机位                       INTERIOR
  legacy_manor.py            旧版模型（原 eden_manor.py），冻结；只因 tc_estates.build_eden 以 1:100 调 build_eden_manor 而保留   —
map/estate/assets/           CC0 素材缓存 + CREDITS.md                                            INTERIOR
docs/drafts/estate_b1_*.jpg  草稿                                                              两人（按视图命名，不覆盖对方的图）
```

不许改：`map/estate/` 下 three.js 页面（`assets/` 除外）、`map/viewer.html`、`map/data/maps.json`、`blender/tc_common.py`、`tc_city.py`、`tc_detail.py`、`tiancheng_mid.py`、`tiancheng_low.py`、`VERSION`。`tc_common` 只 import 用（`parse_args`、`parse_crops`、`parse_box`、`set_crop`）。

---

## 3. 接口（签名；桩已全部可运行）

总流程（`estate.build(ctx)`，`__init__.py`）：
```python
site.build(ctx)                       # SITE.*
shell.build(ctx)                      # 全部楼层的壳（外观也要）
for fl in ctx.floors:                 # 视图需要的楼层（外观视图只建 [])
    for room in plan.rooms(fl):
        c = core.room_coll(room)
        rooms.finish(room, c)         # 地面、墙衬、顶棚
        if ctx.furniture: rooms.furnish(room, c)
views.configure(ctx, res, samples)
for view in ctx.views:
    cam = views.setup(view, ctx); export.write(view, export.view_data(view, ctx, cam), stem, ctx); views.render(path, ctx, crops)
```

| 模块 | 暴露 | 说明 |
|---|---|---|
| `plan` | `ROOMS`、`ROOM_BY_ID`、`rooms(floor)`、`FLOORS`、`fz(fl)`、`SHAFTS`、`BLOCKS`、`PORTICO`、`BELVEDERE`、`FACADE`、`WINDOWS`、`OUTBUILDINGS`、`AREAS`、`ISLAND`、`island_r(th)`、`island_outline(n, s, frame)`、`i2m` / `m2i`、`doors(room)`、`windows(room)`、`openings(room)`、`exterior_edges(room)`、`block_of(room)`、`room_poly(room)`、`shared_edge(a, b)`、`lookup(叫法)`、`validate()` | 纯 Python，不 import bpy |
| `core` | `Ctx(opt)`（`.views .floors .furniture .assets .detail .room .scene`）、`coll(path)`、`floor_coll(fl, part='shell'\|'roof')`、`room_coll(room)`、`site_coll(part)`、`floor_root(fl)`、`link(obj, coll, floor=None, cut=False, upper=False, room=None)`、`Batch(name, mat, smooth)`（`.box .cbox .cyl .sphere .prism .ring .done()`）、`box(...)`、`metric_uv(obj)`、`set_cut(obj, z)`、`hexrgb('#RRGGBB')` | 所有网格都要有**公制 UV（1 UV = 1 m）**：`Batch` 自动做；导入的素材调 `metric_uv` 或保留自带 UV |
| `mats` | `get(name) → Material`、`PALETTE`、`FINISH`、`names()` | 按名字缓存；未知名字给洋红并打印一次 |
| `assets` | `texture_set(id, res, maps, source) → {map: 路径} \| None`、`model(id, res, source) → 路径 \| None`、`append_model(id, coll, loc, rot, scale) → Object \| None`、`credit(source, id, files, author, license)` | 拿不到返回 None，调用方退回程序材质 / 程序几何，渲染永不因网络失败 |
| `furniture` | `toilet / basin / bathtub / shower / towel_rail / towel_stack / robe / mirror / hamper / bed / canopy / nightstand / wardrobe / dresser / bench / sofa / armchair / chair / table / desk / bookcase / cabinet / fireplace / piano / clock / rug / curtains / chandelier / sconce / lamp / painting / statue / vase / plant / generic` | 统一 `fn(coll, loc, rot=0.0, style=None, **kw) → Object`。`loc = (x, y, 楼面 z)`，原点在底面中心（靠墙件在背板中心）；**rot = 0 时正面朝 −y、背靠 +y 墙**，靠西墙 +π/2，靠东墙 −π/2，靠南墙 π。高于 1.2 m 的立件 `cut=True`，吊灯 / 壁灯 / 华盖 `upper=True`。例：`furniture.toilet(coll, (x, y, z), 0.0, 'high_tank')` |
| `rooms` | `finish(room, coll)`、`furnish(room, coll)`、`closeups(room) → [dict(name, eye, target, lens, hide)]`、`inner_rect(room)` | 按 `room['kind']` 分派（§5） |
| `shell` | `build(ctx)` | 用 `plan.doors / windows` 开洞；材质只经 `mats.get` |
| `site` | `build(ctx)` | |
| `views` | `VIEWS`、`CAM`、`FRAMES`、`ALL_STEP`、`SUN`、`setup(view, ctx) → cam`、`closeup(room_id, shot, ctx) → cam`、`configure(ctx, res, samples)`、`render(path, ctx, crops)` | |
| `export` | `view_data(view, ctx, cam) → dict`、`write(view, data, stem, ctx)` | 格式 §7 |

---

## 4. 集合命名与剖切标记

```
EDEN
├─ SITE ─ SITE.island / SITE.garden / SITE.water / SITE.trees / SITE.paths / SITE.out     从不剖切（'all' 视图整体隐藏）
├─ B1, F1 … F5                         每层一个集合 + 一个空物体 <F>.root（该层所有物体挂在它下面）
│   ├─ <F>.shell                       楼板、墙、窗、柱、楼梯、电梯、檐部、亭子
│   ├─ <F>.roof                        坐在这一层标高上的屋面（两翼屋面在 F4.roof；主楼屋顶平台板在 F5.shell）
│   └─ <F>.rooms ─ <F>.room.<id>       每个房间：地面饰面、墙衬、家具（例：F3.room.316）
```

物体自定义属性（`core.link` 写入）：

| 属性 | 含义 | 剖切该层（view = 该层）时 |
|---|---|---|
| `est_floor` | 所属楼层 | — |
| `est_cut` | 墙、柱身、窗、窗台、高家具（> 1.2 m） | 几何节点 `EST_clamp_z` 把 z 夹到 楼面 + 1.2（墙体自动封顶；要求物体无 x / y 旋转、z 缩放 1） |
| `est_upper` | 完全在剖切面以上的件：顶棚、檐部、窗楣、门楣、吊灯、壁灯、华盖、屋面、穹顶 | 隐藏 |
| `est_room` | 房间 id | — |

规则：视图 Fn = 隐藏 F(n+1) 以上的楼层集合；只对 Fn 本层做夹紧 / 隐藏；Fn 以下各层完整显示。所以**一件东西只属于一层**，跨层的墙、柱由建造者在楼面处切段。两翼在 F4 / F5 视图里是完整的（屋面在 F4.roof）；音乐厅 D 在 F2 以上视图里完整。

---

## 5. 房间数据（plan.py）

每个房间：`id, name, name_en, floor, rect, z, h, kind, zone, rank, floor_mat, wall_mat, minor, void, container, round, parts, alias, alias_en, src, use, heritage`。91 个房间（设定 §4 全部 + 塔亭 C1 / C2、音乐厅 D1、竖井各层格子 208 / 210 / 308 / 411 / 414、B01）。
- `parts`：套间分间（`bath` / `dress` / `bed` / `wc` / `gallery` / `void`），SHELL 建 0.15 m 隔墙并在朝 `bed`（或主间）一侧开 0.9 m 门。
- 门：`plan.doors(room)` → `[dict(edge, at, w, to, kind)]`；自动规则 = 与交通类房间共边 ≥ 1.5 m 时在共边中点开 1.2 m 门，外加 `EXTRA_DOORS`（正门、宽拱、家族门厅外门、主人通道暗门 `secret`、护墙暗门 `jib_door`、保险库门……）。`edge` ∈ S / N / W / E（S = −y 边），`at` = 共边上的坐标（S/N 边给 x，W/E 边给 y）。
- 窗：`plan.windows(room)` → `[dict(edge, at, w, h, sill, head, kind, partition)]`，窗轴取 `FACADE`，窗型按层取 `WINDOWS`；`partition=True` 表示窗轴落在隔墙上（14 处）：隔墙在窗前 0.3 m 收住，后面做盲窗。
- `kind`（INTERIOR 按它写陈设配方）：`anteroom` 105; `archive` 215; `attic_corridor` 407; `belvedere` 502; `billiards` 122; `breakfast` 114; `china_flower` 117; `cloakroom` 102; `collection` 123; `cross_hall` 106,205,305; `dining` 113; `drawing_room` 119; `dressing_room` 313; `duty_room` 110; `family_dining` 306; `family_entrance` 118,124; `family_sitting` 318; `floor_pantry` 209; `footmen` 309; `garden_hall` 107; `green_parlour` 120; `guest_sitting` 223; `guest_suite` 219,220,222; `hall` 101; `hall_void` 201; `head_maid_office` 401; `kiosk` 503,504,505; `laundry` 405; `library` C1; `library_gallery` C2; `linen` 204,303,413; `master_bath` 316; `master_bedroom` 315; `master_lobby` 311; `master_passage` 112,210,310,414; `master_sitting` 312; `music_room` D1; `neutral_ancillary` 403; `neutral_private` 320; `porter` 104; `portrait_gallery` 301; `powder_room` 103; `reading_room` 218; `roof_terrace` 501; `second_suite` 317; `secretary` 213; `security` 408; `servery` 116; `service_stair` 109,208,308,411; `silver_room` 111; `sitting_room` 206; `spare_bedroom` 321; `staff_bedroom` 402; `staff_bedrooms` 410; `staff_hall` 404; `staff_washroom` 412; `stair_hall` 108; `stair_landing` 207,307; `store` 211,406; `strong_room` 216; `study` 212; `tea_room` 202; `tunnel_lobby` B01; `valet` 203,302; `ward_room` 409; `washroom` 217,304; `wing_corridor` 115,121,214,221,314,319。
- 楼梯、电梯、主人通道的井道几何归 SHELL（`plan.SHAFTS`、`LIGHTWELL`）；楼梯厅里的家具、电梯轿厢内饰归 INTERIOR。
- 自检（`validate`）：同层房间不重叠、分间在房间内、每层体块被房间铺满、门都落在共边上、`maps.json` 的 `eden_estate.rooms / rooms_en` 全部命中房间、`areas / areas_en` 全部命中、74 条房间坐标与设定逐条一致、岛轮廓与 `tc_estates.Isle('eden')` 一致、附属建筑在岛缘栏杆以内。`eden_manor.py` 启动时跑一遍，有错就退出。

---

## 6. 材质名（`mats.get`；色值 sRGB，见设定 §6）

石材 `stone_portland` #E4DED2（外墙；要风化、雨痕、色差）· `stone_rustic` #CFC7B8 · `stone_trim` #F0ECE3 · `marble_statuario` #F2F0EC（灰色细主纹）· `marble_calacatta` #F1ECE2 · `marble_nero` #1E1E20 · `marble_alpi_green` #2F4A3C · `marble_siena` #D9B66E · `marble_levanto` #7A2E2A · `scagliola_porphyry` #6B2E35 · `lead_roof` #8A8D90
木材 `oak` #A57A4B · `walnut` #5A3A22 · `mahogany` #5E2A1A · `ebony` #1C1512 · `satinwood` #D8B777 · `paint_panel` #EDE6D6
金属 `gold_leaf` #E6C36A · `ormolu` #C9A24B · `brass` #B5913F · `brass_aged` #A88A45 · `nickel` #C7C9C8 · `wrought_iron` #26272A · `silver` #BFC3C4
织物 `damask_crimson` #7B1E2B · `silk_blue` #2C3E63 · `silk_green` #2F5D4E · `silk_rose` #C99A93 · `silk_ivory` #EEE7D8 · `silk_duckegg` #CFE0D6 · `velvet_champagne` #CDB58A · `velvet_red` #8E2130 · `linen_ivory` #EEE7D8 · `cotton_bed` #F7F4EE · `towel` #EFE9DF · `towel_green` #2E4A3A · `gold_thread` #E6C36A · `satin_old_gold` #B89A5A · `rug_aubusson` #E3D4B8 · `rug_heriz` #7A2A22 · `rug_crimson` #6E1F28
瓷与其他 `porcelain` #F6F4EF（clearcoat 1、IOR 1.5）· `sevres_blue` #1F3F8F · `plaster_cream` #E9E1CF · `plaster_ceiling` #F3EFE6 · `glass_window` #2B3238 · `mirror` · `water` #1E3B47 · `lawn` #5F7F3E · `lawn_dark` #52703A · `hedge` #2F4A26 · `gravel` #CFC6B0 · `tree_crown` · `rock` · `soil` · `brick` · `felt_green` · `leather_red` · `leather_green` · `aether_glow`（emission）· `lamp_glow`（2,700 K emission）· `overlay_master` #7A5FA0 · `overlay_staff` #C98A40 · `overlay_guest` #4C8C99
饰面（plan 的 `floor_mat` / `wall_mat`，= 底材质 + 图案，`mats.FINISH`）：地面 `marble_checker_diag`（大厅 1.2 m 斜棋盘）、`marble_checker_small`、`marble_compass`、`oak_herringbone`、`oak_versailles`、`oak_plank`、`stone_flag`、`lino`、`tile_white`、`portland_paving`；墙面 `plaster_stone`、`panel_paint_ivory`、`panel_mahogany`、`panel_walnut`、`paper_chinoiserie`、`plaster_yellow_mural`，以及直接用底材质名的 `damask_crimson`、`silk_*`、`marble_calacatta`、`tile_white`。
完整表（含粗糙度 / 金属度与出处）在 `mats.PALETTE`。「推断」色是色板外按设定文字自定的，改动写进变更记录。

---

## 7. 命令行与导出

```
blender -b -P blender/eden_manor.py -- --view ext|all|F1..F5|B1|island[,视图…] --res 2000 --samples 32 --out 路径
        [--crops "x0,y0,x1,y1:名字;…" | --crops-json 文件 | --crop x0,y0,x1,y1] [--out-dir 目录]
        [--room 316 --closeup] [--preview] [--data-only] [--no-export] [--no-furniture] [--no-assets] [--fast]
python3 blender/eden_manor.py -- …          # pip 装的 bpy 4.2 模块；本机 Blender 4.0.2 二进制同样能跑（两边都要保持兼容）
```
- `--out` 可含 `{view}`；多个视图且没有 `{view}` 时自动加 `_<视图>` 后缀。默认 `docs/drafts/estate_b1_{view}.png`。
- `--crops` 语义同 `tc_common.Layer.finish`（归一化、左上原点；输出 `<--out-dir 或 --out 目录>/<名字>.png`，多视图时名字前加 `<视图>_`）。
- `--room ID --closeup`：只建到该层，按 `rooms.closeups(room)` 逐个机位渲 `<out>_<ID>_<机位名>.png`（透视相机）。
- `--preview` = 800 px / 8 采样；`--data-only` 只写多边形不渲；`--fast` 只要体块（不摆家具）。
- 7 张正式视图：`ext, all, F1, F2, F3, F4, F5`。**ext 与 F1–F5 用同一台正交相机、同一套光**（`views.CAM`：方位 −30°（从正面偏西看）、俯角 40°、画面宽 250 m、中心 (0, −12, 4)；太阳在南偏西 35°、高 45°）；`all` 同朝向、取景 `FRAMES['all']`，F1…F5 各按 `ALL_STEP = (0, 48, 14) m` 逐层往后往上错开，每层各自剖切；`island` 看整岛（不导出）。8K 正式渲染由本机做（GPU）。

`map/data/eden_estate_tiles.json`（每次渲染只替换本视图，`rooms` / `areas` 索引按 plan 重写）：
```json
{
 "_说明": "…", "version": 1,
 "camera": {"type": "ortho", "azimuth_deg": -30, "elevation_deg": 40, "ortho_m": 250, "target": [0, -12, 4], "aspect": 0.75, "frames": {…}},
 "floors": {"F1": {"z": 0.0, "name": "礼仪层", "name_en": "State Floor"}, …},
 "zones": {"master": "#7A5FA0", "staff": "#C98A40", "guest": "#4C8C99", "family": "#7A5FA0"},
 "rooms": {"101": {"name": "大厅", "name_en": "Grand Hall", "alias": ["大厅", "门厅", "玄关"], "alias_en": [...], "floor": "F1", "zone": "guest", "rank": 1, "minor": false, "kind": "hall"}, …},
 "areas": {"forecourt": {"name": "前庭", "name_en": "Forecourt", "alias": [...], "alias_en": [...]}, …, "manor": {…}},
 "views": {
   "F1":  {"file": "estate_b1_F1", "floor": "F1", "rooms": {"101": {"poly": [[nx, ny], …], "c": [nx, ny]}, …}, "areas": {}},
   "all": {"file": "…", "floor": null, "rooms": {…各层…}, "areas": {}},
   "ext": {"file": "…", "floor": null, "rooms": {}, "areas": {"forecourt": {"poly": […]}, "E": {…}, "block_A": {…}, …}}
 }
}
```
- `poly` 是该房间**地面**轮廓投到图上的归一化坐标（左上原点，x 向右、y 向下），圆形房间是 24 边形；`c` 是标签点。
- 叫法命中规则 = `plan.lookup()`：`name`、`alias`、`name_en`、`alias_en` 任一相等。`maps.json` 的 `eden_estate.rooms / rooms_en / areas / areas_en` 全部能命中（自检保证；例：寝 → 317，浴室 → 316，小客厅 → 120，仆役厅 → 404，私人电梯厅 → 502，Morning Room → 206）。查看器要用这个文件时，在 `NOTES_FROM_LOCAL.md` 写清楚，由本机改 viewer。

---

## 8. CC0 素材

**来源状态（2026-09-27 实测）**：`api.polyhaven.com` 200；`dl.polyhaven.org` 根路径 521，但文件路径正常（`/file/ph-assets/Textures/jpg/1k/terry_cloth/…` 200，模型 `…/Models/gltf/1k/vintage_grandfather_clock_01/…` 200）；`ambientcg.com` API 200，下载 `ambientcg.com/get?file=<id>_1K-JPG.zip` 302 到 `acg-download.struffelproductions.com`，200（11 MB 一包）。都要走会话代理（已配好）。

**取法**：`assets.texture_set(id)` 先查缓存，再用 `https://api.polyhaven.com/files/<id>` 找 URL 下载；ambientCG 下 zip 解包只留要用的图（INTERIOR 实现）。离线（`EDEN_OFFLINE=1` 或 `--no-assets`）一律退回程序材质。
**缓存**：`map/estate/assets/<source>/<id>/<id>_<map>_<res>.<ext>`，进仓库。默认 **1k JPG**（diff、nor_gl、rough、ao）；近景主角（毛巾、Statuario、卡拉卡塔金、桃花心木、黄铜）可用 **2k**，最多 8 套。**总预算 40 MB**（渲染源图；3D 模式的 KTX2 / meshopt 另算在 `map/estate3d/`）。不下 blend / exr / 4k 以上。
**可用**（已查到）：贴图 `terry_cloth`、`rough_linen`、`velour_velvet`、`quatrefoil_jacquard_fabric`、`marble_01`、`herringbone_parquet`、`diagonal_parquet`、`rectangular_parquet`、`fine_grained_wood`、`dark_wood`、`plastered_wall_*`、`white_plaster_*`、`stone_wall*`、`gravel*`、`leather_red_*`；模型 `vintage_grandfather_clock_01`、`mantel_clock_01`、`marble_bust_01`、`ornate_mirror_01`、`brass_candleholders`、`brass_vase_0*`、`antique_ceramic_vase_01`、`chinese_chandelier`、`lantern_chandelier_01`、`vintage_oil_lamp`、`vintage_cabinet_01`、`painted_wooden_*`、`Rockingchair_01`、`dining_table`、`dining_chair_02`、`old_bed_frame`、`vintage_day_bed`。Poly Haven 没有马桶、浴缸、洗手盆：这三样程序建模，贴 CC0 瓷面 / 黄铜 / 大理石材质。
**许可**：只收 CC0（Poly Haven、ambientCG）；Sketchfab 的 CC-BY 要在 `docs/eden-estate.md` 与页面 credit 署名；不许 BlenderKit 免费档与任何不允许再分发的库（`CLOUD_TASK7.md` §3a）。
**CREDITS.md**（`map/estate/assets/CREDITS.md`，每个文件一行，`assets.credit()` 自动追加）：
```
| 文件 | 来源 | 作者 | 许可 | 用途 |
|---|---|---|---|---|
| `polyhaven/terry_cloth/terry_cloth_nor_gl_1k.jpg` | [polyhaven terry_cloth](https://polyhaven.com/a/terry_cloth) | colormass (Photography), Rico Cilliers (Processing) | CC0 | towel 法线 |
```

---

## 9. 硬约束（内容）

不建模、不贴图、不描写任何性相关或束缚类的道具、设施与场所。设定里用途不明的私密房间（320 私人房间 A、403 附属用房）一律中性：只放普通家具（沙发、扶手椅、书桌椅、书柜、衣柜、单人床 / 长桌、椅子、储物柜、书架、吸顶灯），不加锁具、不加特殊设施、不写用途。浴室近景只有洁具与布草。审阅时这条一票否决。

---

## 10. 设定里不明确处的决定（lead 已定；要改走变更记录）

1. **主楼正立面窗轴**：设定写「9 开间 × 4.2 m、门廊占中间 5 间」，与门廊 31 m 宽、柱距 5 / 6 m 冲突。定为 7 轴：门廊 5 个柱间的中线（0、±5.5、±10.5）+ 门廊外两侧各 1 轴（±17.75）。背立面 9 × 4.2 m；两翼前后与端面各 7 × 4.2 m。
2. **主层（piano nobile）**：不改楼面标高，F2 窗最高（3.3 m，三角 / 弧形窗楣交替、小阳台栏杆），F3 方窗 2.2 m，F1 粗面石拱窗 3.0 m，F4 为檐口以上的顶楼小窗（窗台高 3.0）。回应 C3 评审 R4-13。
3. **檐部标高**：主楼檐部与门廊檐部同高（13.5–16.4 m），两翼檐口在 13.5；F4 是檐部以上的顶楼。
4. **套间分间位置**：设定只给了面积，沿用 three.js 版：客房 A、C 与寝的浴室 / 更衣在西端 x 20…26，客房 B 在东端 48…54；备用卧室小浴室 49…54 × 11…16；女仆长小浴室 −11.5…−8 × −5.5…−2；访客盥洗室两间化妆间在后部 y −8…−2。
5. **工坊 G** 与仆役楼 E、马车房 F 重叠 → 西移 8 m 到 x −182…−174。服务区不像 three.js 版那样北移，按设定坐标。
6. **岛缘构筑物**：岛轮廓按 `tc_estates` 的谐波（后轴岛缘只有 231 m）。后轴观景台从 (0, 240) 移到 (0, 222)；四座锚碑沿设定方位放到 0.90 半径（设定坐标有三座落在岛缘外）。果园、风景园的角点贴着林带，属正常。
7. **F5 屋顶平台**：设定写柚木躺椅 ×6，C3 评审 R4-4 判为「度假酒店」P0。定为：不放躺椅、不做玻璃盒；只放 2–4 张铸铁椅、柑橘与月桂花钵、紫藤廊。SHELL 建造者顺手把设定 §4 F5 这句改掉。
8. **外观取景**：7 张剖切图框住府邸五段（204 m）+ 前庭，不框整岛（整岛是 `--view island`，另看）；这样 8K 时约 33 px/m，房间近看可读。
9. **光照**：庄园图的太阳在南偏西，正立面受光；不跟天城上层底图（那里太阳从西北来）。
10. **竖井格子**：设定只写了「同 109」「不停站」，补成独立房间 208 / 210 / 308 / 411 / 414（minor，不标名），保证每层体块被铺满。
11. **窗落在隔墙上**（14 处，`validate` 列出）：立面节奏优先，隔墙在窗前收住，做盲窗。
12. **旧版模型**：`blender/tc_estates.py` 的 `build_eden` 还在以 1:100 调 `eden_manor.build_eden_manor`（天城上层底图），所以旧实现保留为 `estate/legacy_manor.py`，由 `eden_manor.py` 转出。SHELL 建造者做好新版的 1:100 低模入口后，改 `eden_manor.py` 那一行并删掉 legacy（上层底图要重渲时在 NOTES 通知本机）。

---

## 11. 验收要点（摘自三轮审阅，`docs/reviews/estate_c3/verdict.md` 与 `map/estate/reviews/v0–v2`）

- 毛巾（P0）：不透明、厚 0.02–0.025、垂坠下摆、叠放三折圆角 + 3 mm 暗缝 + 错层 5–8 mm、绒圈看得见、金线家徽 4.5 cm、与墙面明度差 ≥ 10%。近景毛巾占画面 ≥ 1/3。
- 瓷面：连续釉面高光与环境反射（近景加暖色侧光）；访客马桶近景把高位水箱和铭牌完整拍进来。
- 外立面（P0）：波特兰石色差、F1 粗面石分缝、竖向雨痕 / 风化 AO；窗是深色玻璃 + 6+6 白窗棂。
- 屋顶（P0）：没有任何度假酒店元素（见 §10-7）。
- 大理石：灰金主纹，墙 / 台面 / 地面三张不同的图，不要褐色树根纹。做旧黄铜、桃花心木低频明暗、镜子边缘暗化、地毯走道磨淡、草坪偏橄榄。
- 主浴近景第 1 个机位是整块 Statuario 浴缸；主卧有床的近景。
- 大厅斑岩柱要有额枋（或改奶油色云石），山花斜檐有齿饰，近主楼的树冠圆润。
- 每步 2000 px 草稿 `docs/drafts/estate_b1_*.jpg`，四位审阅（建筑、室内、顶奢营销 + 现编一位）每位 ≥ 8 再往下走。

---

## 12. 变更记录

| 日期 | 谁 | 改了什么 |
|---|---|---|
| 2026-09-27 | lead | 初版：包结构、接口桩、plan.py（91 房间）、剖切机制、导出格式、素材规则 |
