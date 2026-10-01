# 用户内容兼容（技术兼容，不审核）

用户 2026-09-27：「用户说在自己的庄园里面想干嘛干嘛，我们做的是技术兼容，that's it。」「屏蔽词命中不要做。」

原则：
- 地图**不审核、不过滤**用户聊天里的内容：事件标签原样解析、原样落点；当前地点原样解析。发生了什么，地图不需要知道。
- 仓库和公开 CDN 只放中性的地图、建筑、设定数据；用户自己想加的东西，走**本机**扩展，只存在用户本机。

## 现状
| 环节 | 行为 | 位置 |
|---|---|---|
| 事件标签 | 不做关键词过滤；认不出的类型归「其他」（灰色方块） | `map/tavern/events.mjs` |
| 当前地点 | 逐级回落：房间 → 区域 / 楼层 → 庄园 → 地标 → 层 → 天城 → 世界；都认不出就不动地图 | `map/app/here-v2.mjs`（节点树） |
| 自定义房间叫法 | 本机表 `{ rooms: { 自定义名: 标准房间名 } }`，当前地点写自定义名时落到对应房间 | `app/here-v2.mjs` 的 `makeHere({ custom })` |
| 自定义名称与用途（v0.9.3） | 原样保存、原样显示和注入，不审核；长度上限 名 40 字 / 用途 200 字 | `map/tavern/mvu.mjs`、`map/custom.mjs` |
| 原作立绘（v0.9.5；2026-09-29 放宽） | 只加载**作者在卡里声明的**立绘地址，且必须过白名单：作者 CDN `cdn.jsdelivr.net/gh/Yehehua1311/…`（必须带 `/sfw/` 段，不许顺着仓库目录取受限分类的图）＋ 作者另用的两个图床 `i.postimg.cc` / `picgocloud.com`（https、图片扩展名、路径不含受限分类词、无 query/fragment）。关掉「使用原作头像」开关则一张都不取；取不到（或卡里根本没这位的条目）就显示名字首字，可用 `EdenMap.setAvatar` 自己补 | `map/tavern/mvu.mjs` 的 `portraitOk` |

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
  - 只能指向标准房间，标准房间名本身不能改指别处；当前地点写自定义名时按对应房间落点（`app/here-v2.mjs` 的 `makeHere({ custom })`），庄园页收到的是标准房间名。
  - 旧版本机存储的读取在 `core/legacy-custom.mjs`（`customKey` / `readCustom`，只读，由 `tavern/mvu.mjs` 并进聊天变量），单测 `tests/here.test.mjs`。
- ✅ `EdenMap.setAvatar(人物名, 图片)` → true / false；`EdenMap.removeAvatar(人物名)`（v0.9.2 人物栏）：给人物栏的头像框换成自己的图。图片 = `data:image/png|jpeg|webp|gif;base64,…` 或 http(s) 图片地址；其他（`javascript:` 等）拒绝。
  - 额度（2026-09-27 核对）：data URL 头像**先压到 160 px 的 webp / jpeg** 再存（`characters.mjs` 的 `AVATAR_MAX = 160000` 字符是压缩后的上限，和状态栏共用同一份 localStorage 额度）；压缩在地图面板路径（`map/chars.mjs`）和 `EdenMap.setAvatar` 路径都会做，超过上限返回 false。http(s) 地址不压缩、限 2000 字符。
  - 只存本机 localStorage：有聊天 id 时 `edenMap:chat:<id>:avatars`，否则全局 `edenMap:avatars`（按聊天的覆盖全局）；不上传、不进地址、地图不为它发请求（http 地址的图由浏览器按用户给的地址加载，`referrerpolicy=no-referrer`）。
  - 人物栏的显示开关同样只在本机：`edenMap:chat:<id>:chars` = `{ show, off: [人物名] }`。存储与校验在 `map/tavern/characters.mjs`，单测 `tests/characters.test.mjs`。
- ✅ v0.9.3 自定义名称与用途（**存聊天变量，跟着聊天走**，不再只在本机）：`EdenMap.setCustom(标准名, { name?, note?, kind? })` → true / false（`name` / `note` 传 '' 清掉；`kind` = room / area / landmark / character，不传按地图数据推断）；`EdenMap.removeCustom(标准名或显示名)`；`EdenMap.getCustom()` → `{ items: { 标准名: { 类, 名?, 用途?, 别名? } }, 同步世界书, storage: 'chat' | 'local', worldbook }`；`EdenMap.setWorldbookSync(true / false)`；`EdenMap.on('custom', fn)`。
  - 旧名保留：`setRoomAlias(显示名, 标准房间名)` = 给该房间设显示名；`removeRoomAlias(显示名)`；`getRooms().alias` = `{ 显示名: 标准房间名 }`。旧的本机叫法第一次加载时迁移进聊天变量，旧键改名为 `*.migrated`（不删）。
  - 「同步到世界书」默认关；打开时才用 `createOrReplaceWorldbook` 建「伊甸地图·自定义·<聊天 id 短哈希>」（每个聊天一本、一个常驻条目，避免绑定同一本的聊天互相串），当前聊天没有聊天世界书时绑定到这个聊天，已有就不动（设置里提示手动启用）；关掉时把条目停用，不删世界书。同步且已绑定时，态势注入里不再重复自定义摘要。
- ✅ v0.9.3 `EdenMap.getOutfit()` → `{ items: { 衣服, 裤子, 鞋子 } | null, text }`、`on('outfit', fn)`；`EdenMap.getClock()` → `{ date, time, period, short, full, night, tod }`（`tod` = 'dawn' | 'day' | 'dusk' | 'night' | ''，v0.9.6 时段色调）、`on('clock', fn)`。只读 MVU。
- ✅ `EdenMap.getCharacters()` → `{ items: [{ name, place, floor, src: 'mvu' | 'tag' | 'infer', present? }], floor }`（v0.9.3 加了 `infer`）；`EdenMap.on('characters', fn)`：人物列表变化时推送同样的结构（面板关着也推）。
- ✅ `EdenMap.on('here' | 'events' | 'map', fn)` / `EdenMap.off(事件, fn?)`：
  - `here` `{ value }`（查看器里另带 `resolved` 落点）；`events` `{ items, floor, hereLayer }`；`map` `{ map, title, kind }`。
  - 酒馆里 `here` / `events` 由卡内脚本发（面板关着也发），`map` 由地图发。
- ✅ v0.9.6 `EdenMap.sources()`（只读，只在酒馆里的宿主页对象上）→ 当前在用的数据来源，不含数据内容：
  `{ location: 'mvu' | 'db' | 'none', mvu: { present, mode: 'mvu' | 'mvu-partial' | 'tags' }, db: { tables, location, chars } | null, tags: true, characters: { mvu?, tag?, infer?, db? }, varmap: { 字段: 路径 } }`。
  `location` = 标题栏当前地点来自 MVU 还是表格数据库插件；`db` 为 null 表示没检测到插件（`shujuku.mjs facts`）；`characters` 是人物栏各来源的人数。只供其他本机脚本判断「地图现在读的是什么」，不再做更多插件集成。
- ✅ `EdenMap.selfcheck()`：卡内脚本的启动自检结果（酒馆助手接口、MVU「世界.当前地点」、重复的地图脚本、线路、世界书附加条目、脚本与地图版本、正式版是否有新标签），判定在 `map/tavern/selfcheck.mjs`（单测 `tests/selfcheck.test.mjs`）。结果显示在地图设置的「自检」一栏；有 ⚠ 时弹一次小提示。唯一的额外请求是正式版每天最多一次查 jsDelivr 数据接口的最新标签（不带 referrer、不带凭据）。

暂缓（v0.9.1 不做，RP 价值研究 architect.md：价值 4.7，且有直播采到私人内容的风险）：
- ~~`EdenMap.renameRoom(标准房间名, 显示名)`~~：v0.9.3 由 `setCustom` 实现（地点卡、地名标签显示自定义名）。
- ~~`EdenMap.registerOverlay({ id, map, draw(ctx) })` / `unregisterOverlay(id)`：用户自己的图层。~~ 由数据声明的 `addLayer` / `removeLayer`（S8-3，见下面「Local layers and props」）取代：不收绘制回调。

这些接口不联网、不上传、不写进地址；仓库里只有接口本身，没有任何用户数据。

### Local layers and props (S8)

Added by S8-3 (kernel rules K-R87 and K-R88; the methods below are added to `window.EdenMap`, nothing is renamed). Data only: no drawing callbacks, no network, nothing is uploaded.

- `addLayer(def)` returns `{ ok, id, problems }`. `def` is a layer declaration (`id` starting with `local-`, `type`, `slot`, inline `data`, or a `view:*`, `events`, `people`, `items`, `routine` source; `style`, `applies`, `menu`, `legend` as in a pack). At most 16 local layers; adding the same id again replaces the layer. It lives for the page session; add it again when your script loads. The user's switch for the row is remembered.
- `removeLayer(id)` returns a boolean (local layers only). `setLayerData(id, features)` replaces the features of an inline local layer. `layers()` lists every registered layer, read only: `{ id, type, slot, visible, applicable, source, count }`.
- `addProp(file, { name })`, `removeProp(id)`, `props()`, `placeProp(id, { map, at } | { pick: true })` and `unplaceProp(id, map)` manage the user's own picture and model files (glb, png, webp, svg) kept in this browser only; the placements are per chat. A layer's point style may use `icon: "prop:<id>"`. An svg that contains a script, a foreignObject or an event handler is refused. Placing a glb inside a 3D page is not part of this step.
- On the host page the methods forward to the map when it is open and queue until it is ready otherwise.

Example: a polygon over a town view (coordinates are fractions of the view's width and height):

```js
const area = {
  id: 'local-market-rain', type: 'area', slot: 'routes',
  data: { features: [{ view: 'town_hill', pts: [[0.62, 0.55], [0.75, 0.55], [0.75, 0.7], [0.62, 0.7]] }] },
  style: { color: '#9ad0f5', fill_opacity: 0.2, width: 1.2, dash: [6, 4] },
  menu: { label: 'Market rain' },
};
await EdenMap.addLayer(area);                 // { ok: true, id: 'local-market-rain', problems: [] }
await EdenMap.setLayerData('local-market-rain', [{ view: 'town_hill', pts: [[0.6, 0.5], [0.8, 0.5], [0.8, 0.72]] }]);
await EdenMap.removeLayer('local-market-rain');
```


## 地图 → 聊天（v0.9.6，2026-09-29 已发版）
- 地点卡、事件卡、人物卡底部两个按钮「去这里」「追问这件事」：把一句中性模板句填进酒馆输入框，**从不自动发送**，用户自己改、自己发。只在嵌在酒馆里时显示。
- 默认模板：`前往{name}。` / `关于{name}，`（英文 `Go to {name}. ` / `About {name}, `）；`{name}` = 地点 / 事件 / 人物名。地图设置「填入聊天的模板」可改，存本机 `localStorage` 的 `edenMapCompose`，「恢复默认」删键。人物卡：去这里 = 人物所在地点，追问 = 人物名；事件卡：去这里 = 事件地点（有才显示）。
- 填入方式（`map/tavern/compose.mjs` 的 `insert`）：酒馆页有 `#send_textarea` 就直接写（**接在已有草稿后面**，派发 `input` 事件，光标移到末尾）；没有时退回酒馆助手 `triggerSlash('/setinput …')`（会替换草稿，`|` 转义）。酒馆助手没有专门的「设置输入框」接口，所以优先直接写输入框，不清掉用户已经打的字。填完地图提示「已填入聊天输入框（未发送）」。
- 单测 `tests/compose097.test.mjs`，浏览器 `tools/browser/v097.mjs --only compose`。

## 未上图的地点与扩展叫法（v0.9.6）
- 当前地点认不出（`app/here-v2.mjs` 的 `unmapped(value)` 非 null）：不跳转；酒馆标题栏显示「未上图：<名字>」（地图发 `eden-map:unmapped {name}`，点标题栏回发 `eden-map:unmapped-pick`），单独打开时显示在查看器页头。
- 指派 = `setCustom(标准名, { alias: 名字, kind })`，kind = landmark / layer / room / area / world；写进 `eden_map.自定义.items[标准名].别名`，一个叫法只指向一处；`{ unalias }` 去掉；「忽略」= `setCustom(名字, { ignore: true })`，存 `eden_map.自定义.忽略`（最多 50 个）。
- `buildIndex(reg, world, names, custom, plan)`：custom = { rooms, areas, marks, layers, world, ignore }；plan = `map/data/eden_estate_rooms.json`，房间名（去括注、「 / 」拆开）进第 1 级，落点带 `std`、`floor`（只在一层时）、`restricted`。

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
| gradeField、coreField 成员等级 / 核心数值（v0.9.6，名册行内的字段名） | 这张卡的等级字段、核心数值字段（行里有才用） | 不猜；可在下拉里从名册行的字段名另选，或「关闭」（存 `-`） |
| codeField、socialField、heightField、weightField、knownField、accessoryField 人物卡「更多资料」（v0.9.6，名册行内的字段名：代号 / 社会身份 / 身高 / 体重 / 外界知情 / 饰物） | 这张卡的对应字段（行里有才用） | 默认名不在行里时按字段名找（代号 / codename、身高 / height、饰物 / 配饰……）；可另选或「关闭」。人物卡里是可展开的一栏，设置「人物卡显示更多资料」可整体关掉（本机 `edenMapCharMore`）；名册里不在图上的成员点一下也能开人物卡 |
| tierField 战力（v0.9.6，E1） | 空（这张卡的名册没有战力字段） | 按字段名找（战力 / combat / tier…）；没有时只在行内文字明写「天灾级 / 超凡 N 阶」时显示小签，从不推测；「关闭」连文字也不扫 |

- **设置 →「变量映射」**：每一项一个下拉，选项来自当前聊天实际的 `stat_data` 树（深 3 层，以名字为键的表只列表本身）；「自动」= 上表的默认或自动找到的。另有旅行方式关键词（空中 / 轨道 / 地面 / 地下 / 传送五组，换个世界改几个词即可）和「加上通用奇幻词」开关。「全部恢复自动」清掉改动。
- **按角色卡存本机**：`localStorage` 键 `edenMap:varmap:<卡的头像文件名或名字>`，不进聊天、不上传。
- **没有 MVU**：地点、事态、人物全部退回聊天标签（与以前一样）。自检里多一行「读法」：MVU（写明地点路径）/ MVU 但没找到地点字段（提示去设置里选）/ 聊天标签。
- 行程的地点历史：先读每一楼的 MVU 变量，拿不到时读消息原文里 JSONPatch 对地点路径（由映射换算成 `/a/b`）的最后一次写入。

## 表格数据库插件（只读兼容）
有的用户同时启用一个「数据库 / 自动填表」扩展（宿主页全局对象 `AutoCardUpdaterAPI`）。它把剧情整理成若干张表，存在聊天楼层对象的自有字段里，经它自己的世界书条目注入；填表、剧情规划走它自己的额外生成请求（`generateRaw` 自带消息列表，地图的 `injectPrompts` 注入不会进这些请求）。
- **检测**：`map/tavern/shujuku.mjs` `findApi`（有 `exportTableAsJson` 才算）。检测到时自检多一行「数据库插件：已检测 / 兼容模式」。
- **只读**：只调用 `exportTableAsJson`、`registerTableUpdateCallback` / `unregisterTableUpdateCallback`；从不写它的表、不触发填表。
- **当前地点**：MVU 映射读不到地点时，改读它的「全局 / 主角」表（列名：当前详细地点 / 所在地点 / 地点 / 位置 → 次要地区 → 主要地区）；MVU 有地点时以 MVU 为准。它的表更新时地图重算。
- **人物位置**：表里同时有「姓名」列和地点列时补进人物栏（MVU 优先，聊天标签照常）。
- **正文优化**：它的可选「正文优化」会改写 AI 楼层（原文存在 `extra._acu_original_content`）；改写丢掉的 ⌖ 标签从原文补回解析（`lostTags`，只补标签，不改楼层）。
- **界面**：它的全屏界面 `#acu-app-v2`（z-index 9000）打开时，地图悬浮按钮先隐藏，关上再出现。
- 单测 `tests/shujuku.test.mjs`；隔离实例实测记录见 CHANGELOG。
