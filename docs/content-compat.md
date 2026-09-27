# 用户内容兼容（技术兼容，不审核）

用户 2026-09-27：「用户说在自己的庄园里面想干嘛干嘛，我们做的是技术兼容，that's it。」「屏蔽词命中不要做。」

原则：
- 地图**不审核、不过滤**用户聊天里的内容：事件标签原样解析、原样落点；当前地点原样解析。发生了什么，地图不需要知道。
- 仓库和公开 CDN 只放中性的地图、建筑、设定数据；用户自己想加的东西，走**本机**扩展，只存在用户本机。

## 现状
| 环节 | 行为 | 位置 |
|---|---|---|
| 事件标签 | 不做关键词过滤；认不出的类型归「其他」（灰色方块） | `map/tavern/events.mjs` |
| 当前地点 | 逐级回落：房间 → 区域 / 楼层 → 庄园 → 地标 → 层 → 天城 → 世界；都认不出就不动地图 | `map/here.mjs` |
| 自定义房间叫法 | 本机表 `{ rooms: { 自定义名: 标准房间名 } }`，当前地点写自定义名时落到对应房间 | `here.mjs` 的 `buildIndex(…, custom)` |

## 本机扩展接口（数据只在用户本机）
查看器暴露 `window.EdenMap`；嵌在酒馆里时，卡内脚本 `eden-map.js` 在宿主页挂同名对象，转发给地图 iframe（srcdoc，同源直接调用），地图没打开时直接读写同一份本机存储。宿主页上的方法都返回 Promise。

已实现（v0.9.1，E6）：
- ✅ `EdenMap.setRoomAlias(自定义名, 标准房间名)` → true / false；`EdenMap.removeRoomAlias(自定义名)`；`EdenMap.getRooms()` → `{ rooms: 标准房间名[], alias: { 自定义名: 标准房间名 }, chat }`。
  - 存本机 `localStorage`：有聊天 id 时按聊天分开存 `edenMap:chat:<聊天 id>:custom`，拿不到聊天 id 时存全局 `edenMap:custom`；值是 `{ rooms: { 自定义名: 标准房间名 } }`。
  - 只能指向标准房间，标准房间名本身不能改指别处；当前地点写自定义名时按对应房间落点（`here.mjs` 的 `buildIndex(…, custom)`），庄园页收到的是标准房间名。
  - 存储与校验在 `here.mjs`（`customKey` / `readCustom` / `setRoomAlias` / `removeRoomAlias`），单测 `tests/here.test.mjs`。
- ✅ `EdenMap.on('here' | 'events' | 'map', fn)` / `EdenMap.off(事件, fn?)`：
  - `here` `{ value }`（查看器里另带 `resolved` 落点）；`events` `{ items, floor, hereLayer }`；`map` `{ map, title, kind }`。
  - 酒馆里 `here` / `events` 由卡内脚本发（面板关着也发），`map` 由地图发。
- ✅ `EdenMap.selfcheck()`：卡内脚本的启动自检结果（酒馆助手接口、MVU「世界.当前地点」、重复的地图脚本、线路、世界书附加条目、脚本与地图版本、正式版是否有新标签），判定在 `map/tavern/selfcheck.mjs`（单测 `tests/selfcheck.test.mjs`）。结果显示在地图设置的「自检」一栏；有 ⚠ 时弹一次小提示。唯一的额外请求是正式版每天最多一次查 jsDelivr 数据接口的最新标签（不带 referrer、不带凭据）。

暂缓（v0.9.1 不做，RP 价值研究 architect.md：价值 4.7，且有直播采到私人内容的风险）：
- `EdenMap.renameRoom(标准房间名, 显示名)`：地点卡和标签显示用户自己的名字。
- `EdenMap.registerOverlay({ id, map, draw(ctx) })` / `unregisterOverlay(id)`：用户自己的图层。

这些接口不联网、不上传、不写进地址；仓库里只有接口本身，没有任何用户数据。
