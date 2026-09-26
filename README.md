# 母畜庄园 · 地图

酒馆角色卡的交互地图：世界地图 + 天城三层（上层悬浮庄园区、中层钢铁霓虹区、下层地基区）。

- 查看器：`map/viewer.html`（OpenSeadragon，DZI 瓦片）；卡内一行 `import` 加载 `map/tavern/eden-map.js`。
- 底图全部由 Blender 渲染：`blender/`（脚本结构、接口与本机渲染步骤见 `docs/tiancheng-maps.md`）。
- 版本与改动：`CHANGELOG.md`；计划：`ROADMAP.md`。

## 数据与署名
- 天城的城市骨架（道路网与建筑轮廓）取自 OpenStreetMap——九龙、纽约曼哈顿中城与布鲁克林、德国鲁尔区、深圳的若干片区——经旋转、裁剪、拼接并叠加虚构地标，不保留任何地名：
  **© OpenStreetMap contributors**，数据以 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/) 授权（https://www.openstreetmap.org/copyright）。
  由它派生的 `blender/data/osm/*.json` 同样按 ODbL 提供。查看器在天城各层右上角显示署名。
- OpenSeadragon 5.0.1（BSD-3-Clause），见 `map/vendor/openseadragon/`。
