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
| 自定义名称与用途（v0.9.3） | 原样保存、原样显示和注入，不审核；长度上限 名 40 字 / 用途 200 字 | `map/tavern/mvu.mjs`、`map/custom.js` |

## MVU 联动（v0.9.3）
- **只读** `stat_data`：`世界.当前地点 / 当前日期 / 当前时刻 / 当日时段`、`主角.着装`、`在场人物`。地图从不写卡自己的变量。
- **卡的 MVU zod 结构**：卡的角色脚本「变量结构」用 `registerMvuSchema` 注册了 zod 结构，顶层与各表都是 `z.object`，zod 默认**丢掉未知键**（本机用 zod 4 验证过：`在场人物.某人.位置`、顶层 `地图` 都被删掉）。所以：
  - 人物位置不靠变量：主来源是聊天里的人物标签（附加条目「地图人物位置 v1」教模型写）；只有结构里本来有「位置」时才读它（`docs/author-compat.md` 是给作者的备忘，暂不发）。
  - 我们自己的数据放酒馆助手**聊天变量**的顶层键 `eden_map`（`getVariables({ type: 'chat' })`），和 MVU 的消息变量 `stat_data` 分开，MVU 不会碰。写入用 `updateVariablesWith`（没有就 `replaceVariables`，再没有才 `insertOrAssignVariables`，它是深合并、删不掉键）。
  - 酒馆助手没有变量接口时退回本机 `localStorage`（`edenMap:chat:<id>:custom2`），自检提示。
- 字段缺了：不显示对应的东西（时间、夜色、着装、推断位置），自检一栏写「MVU 没有 …」，不弹警告。
- 附加条目只提到我们自己的东西（人物标签、`⌖改名 / ⌖用途`、「位置」字段），不引用卡里的字段名或原文；卡的「玩法状态」一类字段地图不读。

## 本机扩展接口（数据只在用户本机）
查看器暴露 `window.EdenMap`；嵌在酒馆里时，卡内脚本 `eden-map.js` 在宿主页挂同名对象，转发给地图 iframe（srcdoc，同源直接调用），地图没打开时直接读写同一份本机存储。宿主页上的方法都返回 Promise。

已实现（v0.9.1，E6）：
- ✅ `EdenMap.setRoomAlias(自定义名, 标准房间名)` → true / false；`EdenMap.removeRoomAlias(自定义名)`；`EdenMap.getRooms()` → `{ rooms: 标准房间名[], alias: { 自定义名: 标准房间名 }, chat }`。
  - 存本机 `localStorage`：有聊天 id 时按聊天分开存 `edenMap:chat:<聊天 id>:custom`，拿不到聊天 id 时存全局 `edenMap:custom`；值是 `{ rooms: { 自定义名: 标准房间名 } }`。
  - 只能指向标准房间，标准房间名本身不能改指别处；当前地点写自定义名时按对应房间落点（`here.mjs` 的 `buildIndex(…, custom)`），庄园页收到的是标准房间名。
  - 存储与校验在 `here.mjs`（`customKey` / `readCustom` / `setRoomAlias` / `removeRoomAlias`），单测 `tests/here.test.mjs`。
- ✅ `EdenMap.setAvatar(人物名, 图片)` → true / false；`EdenMap.removeAvatar(人物名)`（v0.9.2 人物栏）：给人物栏的头像框换成自己的图。图片 = `data:image/png|jpeg|webp|gif;base64,…`（≤ 约 300 KB）或 http(s) 图片地址；其他（`javascript:` 等）拒绝。
  - 只存本机 localStorage：有聊天 id 时 `edenMap:chat:<id>:avatars`，否则全局 `edenMap:avatars`（按聊天的覆盖全局）；不上传、不进地址、地图不为它发请求（http 地址的图由浏览器按用户给的地址加载，`referrerpolicy=no-referrer`）。
  - 人物栏的显示开关同样只在本机：`edenMap:chat:<id>:chars` = `{ show, off: [人物名] }`。存储与校验在 `map/tavern/characters.mjs`，单测 `tests/characters.test.mjs`。
- ✅ v0.9.3 自定义名称与用途（**存聊天变量，跟着聊天走**，不再只在本机）：`EdenMap.setCustom(标准名, { name?, note?, kind? })` → true / false（`name` / `note` 传 '' 清掉；`kind` = room / area / landmark / character，不传按地图数据推断）；`EdenMap.removeCustom(标准名或显示名)`；`EdenMap.getCustom()` → `{ items: { 标准名: { 类, 名?, 用途?, 别名? } }, 同步世界书, storage: 'chat' | 'local', worldbook }`；`EdenMap.setWorldbookSync(true / false)`；`EdenMap.on('custom', fn)`。
  - 旧名保留：`setRoomAlias(显示名, 标准房间名)` = 给该房间设显示名；`removeRoomAlias(显示名)`；`getRooms().alias` = `{ 显示名: 标准房间名 }`。旧的本机叫法第一次加载时迁移进聊天变量，旧键改名为 `*.migrated`（不删）。
  - 「同步到世界书」默认关；打开时才用 `createOrReplaceWorldbook` 建「伊甸地图·自定义·<聊天 id 短哈希>」（每个聊天一本、一个常驻条目，避免绑定同一本的聊天互相串），当前聊天没有聊天世界书时绑定到这个聊天，已有就不动（设置里提示手动启用）；关掉时把条目停用，不删世界书。同步且已绑定时，态势注入里不再重复自定义摘要。
- ✅ v0.9.3 `EdenMap.getOutfit()` → `{ items: { 衣服, 裤子, 鞋子 } | null, text }`、`on('outfit', fn)`；`EdenMap.getClock()` → `{ date, time, period, short, full, night }`、`on('clock', fn)`。只读 MVU。
- ✅ `EdenMap.getCharacters()` → `{ items: [{ name, place, floor, src: 'mvu' | 'tag' | 'infer', present? }], floor }`（v0.9.3 加了 `infer`）；`EdenMap.on('characters', fn)`：人物列表变化时推送同样的结构（面板关着也推）。
- ✅ `EdenMap.on('here' | 'events' | 'map', fn)` / `EdenMap.off(事件, fn?)`：
  - `here` `{ value }`（查看器里另带 `resolved` 落点）；`events` `{ items, floor, hereLayer }`；`map` `{ map, title, kind }`。
  - 酒馆里 `here` / `events` 由卡内脚本发（面板关着也发），`map` 由地图发。
- ✅ `EdenMap.selfcheck()`：卡内脚本的启动自检结果（酒馆助手接口、MVU「世界.当前地点」、重复的地图脚本、线路、世界书附加条目、脚本与地图版本、正式版是否有新标签），判定在 `map/tavern/selfcheck.mjs`（单测 `tests/selfcheck.test.mjs`）。结果显示在地图设置的「自检」一栏；有 ⚠ 时弹一次小提示。唯一的额外请求是正式版每天最多一次查 jsDelivr 数据接口的最新标签（不带 referrer、不带凭据）。

暂缓（v0.9.1 不做，RP 价值研究 architect.md：价值 4.7，且有直播采到私人内容的风险）：
- ~~`EdenMap.renameRoom(标准房间名, 显示名)`~~：v0.9.3 由 `setCustom` 实现（地点卡、地名标签显示自定义名）。
- `EdenMap.registerOverlay({ id, map, draw(ctx) })` / `unregisterOverlay(id)`：用户自己的图层。

这些接口不联网、不上传、不写进地址；仓库里只有接口本身，没有任何用户数据。

## 换卡兼容（v0.9.5）

地图要读的 MVU 字段不再写死，改成一份「变量映射」（`map/tavern/adapter.mjs`）：

| 项 | 默认（本卡） | 自动找（默认路径没有或为空时，按字段名，浅的优先） |
|---|---|---|
| location 当前地点 | `世界.当前地点` | 地点 / 位置 / 所在地 / location / place |
| time 时刻 | `世界.当前时刻` | 时刻 / 时间 / time / clock |
| period 时段 | `世界.当日时段` | 时段 / period / phase |
| date 日期 | `世界.当前日期` | 日期 / date |
| outfit 主角着装 | `主角.着装` | 着装 / 服装 / 衣着 / outfit / clothes |
| present 在场人物表 | 自动（在场人物 / 在场角色 / 当前在场） | 在场 / present / nearby |
| members、targets 名册 | 自动：第 1、2 个顶层键之后，以名字为键的表按出现顺序 | — |
| reputation 声望 | 自动：第 2 个顶层键里的「声望」 | 声望 / reputation / 名望 |
| stageField 阶段字段 | 自动：进度 / 阶段 / stage / progress | — |

- **设置 →「变量映射」**：每一项一个下拉，选项来自当前聊天实际的 `stat_data` 树（深 3 层，以名字为键的表只列表本身）；「自动」= 上表的默认或自动找到的。另有旅行方式关键词（空中 / 轨道 / 地面 / 地下 / 传送五组，换个世界改几个词即可）和「加上通用奇幻词」开关。「全部恢复自动」清掉改动。
- **按角色卡存本机**：`localStorage` 键 `edenMap:varmap:<卡的头像文件名或名字>`，不进聊天、不上传。
- **没有 MVU**：地点、事态、人物全部退回聊天标签（与以前一样）。自检里多一行「读法」：MVU（写明地点路径）/ MVU 但没找到地点字段（提示去设置里选）/ 聊天标签。
- 行程的地点历史：先读每一楼的 MVU 变量，拿不到时读消息原文里 JSONPatch 对地点路径（由映射换算成 `/a/b`）的最后一次写入。
