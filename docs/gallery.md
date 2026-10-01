# 房间图集（room gallery）

代码：`map/ui/room-gallery-panel.js`（UI）、`map/core/room-gallery-logic.mjs`（纯逻辑，`node --test` 测）、
`map/core/room-gallery-db.mjs`（IndexedDB 读写，只在浏览器里跑）、`map/core/pack-media.mjs`（包图片的来源规则）。

S9b（2026-10-01，待办 E-08）起，图集走通用的设定包流程；旧的「公开清单 / 维护者模式 / 投稿包 / GitHub 预填链接 / 手工合并」整套已取消，
`map/data/gallery.json`、`map/data/room_galleries.json` 与 `tools/gallery_review.py` 一并删除（两份数据都是空的）。

## 两种图

- **包图片**（K-R101）：设定包 `media` 块里的图，列在节点的 `media` 里；来源只有三种：包目录下的相对路径、解码后 ≤ 3 MB 的 data URL、
  https 链接（只在设置「加载设定包里用链接给出的图片」打开时才加载）。作者在编辑模式里给任何地点加图，导出为设定包时图跟着包走，计入大小上限。
- **私有图片**（K-R102）：用户给自己看的图，缩到 ≤ 1600 px、转 webp，存在**这台浏览器**的 IndexedDB 里，分「仅本聊天」与「全部聊天共用」两种范围。
  永远不会被导出、内嵌或发给任何地方；编辑模式下可以把一张复制进设定包（「加入设定包」），私有记录本身仍是私有的。

一个地点的图集先显示包图片（只读），再显示私有图片。以前按房间名存的私有记录照旧能读到（按节点名和节点 id 两个键找）。

## 来源守卫

查看器只显示符合来源规则的图：包图片按 `core/pack-media.mjs`（运行时再查一遍，K-R64）；图集目录里的图按
`isValidGalleryFile` / `safeGalleryImagePath`（扁平文件名、webp / jpg / jpeg / png、落在 `art/gallery/<房间>/` 下）。
设计见 `docs/zero-config.md` §7–§8，契约见 `docs/kernel-schema.md` K-R100–K-R102。
