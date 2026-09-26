# 衣帽间样板间 · 素材来源

本目录下的文件全部是 **CC0 1.0（公有领域）**，允许再分发、商用和修改，不要求署名。这里仍然逐条注明来源，方便追溯。

- 下载日期：2026-09-27。
- 下载方式：只从官方 API 或官方下载地址获取，即 `api.polyhaven.com` 与 `ambientcg.com/get`。
- 处理方式：
  - 贴图缩到 256 至 1024 px，转为 WebP。织物色图转成灰度并做对比度归一，在 three.js 里按色板上色。
  - 模型用 glTF-Transform 4.5 的 `optimize` 处理：meshopt 压缩，贴图转 WebP 并缩到 256 至 1024 px，部分模型减面。
- 许可原文：Poly Haven 见 https://polyhaven.com/license ，ambientCG 见 https://docs.ambientcg.com/license/ 。

## 贴图（`tex/`）

| 文件 | 来源素材 | 作者 | 平台 / 链接 | 许可 | 用在 |
|---|---|---|---|---|---|
| `walnut_col/nor/rgh.webp` | European Walnut Veneer 04（按 §313 调成桃花心木色调） | Jenelle van Heerden | Poly Haven · https://polyhaven.com/a/european_walnut_veneer_04 | CC0 | 柜体、护墙板、中岛、梳妆台（B 版） |
| `parquet_col/nor/rgh.webp` | Herringbone Parquet | Sergej Majboroda（摄影）、Jenelle van Heerden（处理） | Poly Haven · https://polyhaven.com/a/herringbone_parquet | CC0 | 人字拼地板 |
| `velvet_col/nor/rgh.webp` | Velour Velvet | colormass（摄影）、Rico Cilliers（处理） | Poly Haven · https://polyhaven.com/a/velour_velvet | CC0 | 丝绒凳、窗座、帷幔、首饰托盘、抽屉衬里 |
| `leather_col/nor/rgh.webp` | Brown Leather | Rob Tuytel | Poly Haven · https://polyhaven.com/a/brown_leather | CC0 | 包袋、鞋、首饰盒、包格衬里 |
| `satin_col/nor/rgh.webp` | Crepe Satin | colormass、Rico Cilliers | Poly Haven · https://polyhaven.com/a/crepe_satin | CC0 | 礼服 |
| `linen_col/nor.webp` | Rough Linen | colormass、Rico Cilliers | Poly Haven · https://polyhaven.com/a/rough_linen | CC0 | 衬衫、纱帘 |
| `wool_col/nor.webp` | Poly Wool Herringbone | colormass、Rico Cilliers | Poly Haven · https://polyhaven.com/a/poly_wool_herringbone | CC0 | 西装、大衣、西裤、毛衣，地毯绒面法线 |
| `damask_col/nor.webp` | Quatrefoil Jacquard Fabric | colormass、Rico Cilliers | Poly Haven · https://polyhaven.com/a/quatrefoil_jacquard_fabric | CC0 | 天城蓝锦缎墙布、靠枕、帽盒 |
| `calacatta_col/nor/rgh.webp` | Marble 014 | ambientCG | ambientCG · https://ambientcg.com/view?id=Marble014 | CC0 | 中岛台面、梳妆台面、展柜台面（卡拉卡塔金） |
| `nero_col/rgh.webp` | Marble 016 | ambientCG | ambientCG · https://ambientcg.com/view?id=Marble016 | CC0 | 门槛（黑金花） |

## 模型（`models/`，glTF 二进制 + meshopt + WebP）

| 文件 | 来源素材 | 作者 | 平台 / 链接 | 许可 | 用在 | 处理 |
|---|---|---|---|---|---|---|
| `vintage_grandfather_clock_01.glb` | Vintage Grandfather Clock 01 | James Ray Cock（建模、贴图）、Yann Kervran（绑定） | Poly Haven · https://polyhaven.com/a/vintage_grandfather_clock_01 | CC0 | 祖传长箱座钟 | 1k 贴图，减面 0.6 |
| `ornate_mirror_01.glb` | Ornate Mirror 01 | James Ray Cock | Poly Haven · https://polyhaven.com/a/ornate_mirror_01 | CC0 | 梳妆镜 | 512 px，减面 0.35 |
| `Chandelier_03.glb` | Chandelier 03 | Kirill Sannikov | Poly Haven · https://polyhaven.com/a/Chandelier_03 | CC0 | 中岛上方小吊灯 | 512 px，减面 0.3；玻璃 transmission 改成半透明 |
| `treasure_chest.glb` | Treasure Chest | Rico Cilliers | Poly Haven · https://polyhaven.com/a/treasure_chest | CC0 | 祖传衣箱 | 512 px，减面 0.15 |
| `fancy_picture_frame_01.glb` | Fancy Picture Frame 01 | Rob Tuytel（扫描与画作）、Rico Cilliers（建模） | Poly Haven · https://polyhaven.com/a/fancy_picture_frame_01 | CC0 | 衣箱上方的旧宅风景画 | 1k 贴图 |
| `vintage_pocket_watch.glb` | Vintage Pocket Watch | Tal Swicegood | Poly Haven · https://polyhaven.com/a/vintage_pocket_watch | CC0 | 中岛玻璃展示窗里的怀表 | 256 px，减面 0.25 |
| `antique_ceramic_vase_01.glb` | Antique Ceramic Vase 01 | James Ray Cock | Poly Haven · https://polyhaven.com/a/antique_ceramic_vase_01 | CC0 | 梳妆台上的瓷瓶 | 256 px，减面 0.4 |

## 程序生成（不来自外部素材）

以下内容都由代码生成，两版共用：

- 柜体、玻璃门、鞋墙、中岛、衣物（垂褶管面）、鞋、包、帷幔、地毯纹样。
- 家族纹章。纹章是**虚构**的：天城蓝盾，金苹果树立于白云之上，双翼，五瓣冠，白狮鹫持盾，格言「HORTUS SUPRA NUBES」。依据是 `docs/eden-estate.md` §7。
- 尺码表、钟面、窗外天空。

A 版的全部材质也是程序生成的（canvas）。

## 商标

页面和模型上都没有真实品牌的 logo、字样或标志性单品外形。品牌只作风格参考，写在 `docs/luxury-assets.md`，例如 Rimadesio、Poliform、Molteni 衣帽间的玻璃门、金属框和 LED 构成。
