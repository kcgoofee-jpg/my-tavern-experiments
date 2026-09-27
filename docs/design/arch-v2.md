# 天城地图 · 架构 v2（arch-v2）

> 大版本 2 的架构基线。调查基于 8050109（UI v2 门控之后），行号会随重构漂移，动手前重新核对。§7 记录本版本已落地的部分。

## 0. 结论速览

- **中枢是 `map/viewer.html`**（约 2180 行，gzip 约 72 KB）。内联主脚本约 1400 行，全部是全局作用域：顶层 `let/const` 是所有脚本共享的全局词法绑定。8 个 `defer` 外挂脚本（events / chars / custom / trips / unmapped / varmap / compose / security）直接读写这些绑定（`viewer`、`REG`、`cur`、`go`、`post`、`trackEl`……）。
- **加载链**：卡内脚本 `map/tavern/eden-map.js`（ES 模块）先 `fetch(BASE+'viewer.html')`，插入 `<base href=BASE>`，再赋给 `frame.srcdoc`。查看器用同样的办法 fetch 庄园页和三维页，插入 `<base>` 与失败钩子，包成 **blob URL** 放进 iframe。
- **协议**：3 条链路，60 多种消息。v2 之前所有消息都没有协议版本，也没有检查 `e.origin`，只靠 `e.source` 加宿主令牌。compose.js 的回执监听连来源都不查（P1，本版已修）。
- **死代码**：`cycleTheme`、section.js 的 `callout`、gallery.js 的 `galleryOpen`（v2 已删）。`estate:select`、上行 `estate:floor`、`v3d:state` 查看器不收，但它们是写明的直嵌接口，保留。

## 1. 模块边界

### 1.1 `map/viewer.html` 分区

| 区域 | 职责 |
|---|---|
| 内联 #0「首帧前置」 | 从 `?theme/lang/hand` 或 localStorage 读首选项，写到 `window.__theme/__lang/__hand/__applyTheme/__applyHand`。并行启动 `__i18n` 字典请求，打 `lowmem` 标记，`__worldFirst` 时预取世界图。**必须同步执行、不能 import。** |
| `<style id="tokens">` | `ui/tokens.css` 的内联副本，由 `tools/sync_tokens.py --check` 守护。 |
| `modulepreload` / `preload` | `here.mjs`、`core/protocol.mjs`；`maps.json`、`world_markers.json`、`derived.json` |
| 经典 `defer` 脚本 | OSD、`ui/sheet.js`、8 个功能外挂 |
| 内联主脚本 | 分为以下子区 |
| ↳ 常量与工具 | `TIERS`、`tx/esc/ico`、`post`、`SUB_ORIGIN`、`getJSON` |
| ↳ i18n 与主题 | `LANG/DICT/t/tr/nm`、`setLang`、`setTheme`、`postState` |
| ↳ 启动 | `main/mainInner`：并行取注册表、标记、派生数据、字典、`here.mjs`、`core/protocol.mjs`；创建 OSD；发 `eden-map:ready` |
| ↳ 顶栏 / 预热 / 版本 | `layoutHeader`、`slowWarmAlt`、`warmOthers`、`buildCode` |
| ↳ 地图切换 | `go`、`snapshot`、`mapChrome` |
| ↳ 庄园与三维宿主 | `openEstate`（blob iframe）、`EST_HOOK`、estate 消息监听 |
| ↳ 层导航与键盘 | `renderNav`、`stepLayer`、`onEsc` |
| ↳ 档位与叠加层 | `setTier`、`drawOverlays`、`declutter`、`routeGaps` |
| ↳ 标记与卡片 | `trackEl/untrack`、`marker/showCard/closeCard` |
| ↳ 当前地点 | `focusStart`、`markHere`、卡原名绑定、`jumpHere` |
| ↳ 设置 | `setPage`、`TCSettings.registerSection`、`initSettings`、`renderStorage` |
| ↳ 本机扩展 | `window.EdenMap`（`flyTo`、`on(here/events/map/characters)`） |
| ↳ 外壳 | `makeDock`、`sheetVis`、`initShell`、通知、单手模式 |
| ↳ 宿主消息接口 | 来源 / 令牌检查，协议校验（v2），按类型分派 |
| **`app/clouds.mjs`**（v2 从内联 #3 拆出） | 漂移云与切层转场。仍以重新赋值全局 `go` 的方式包装（模块可以写经典脚本的全局函数绑定），导出 `window.__clouds` |
| **`app/scale.mjs`**（v2 从内联 #4 拆出） | `TCScale`：世界图与各组地图的交接环 |

### 1.2 其它文件

| 文件 | 形态 | 职责 |
|---|---|---|
| `map/events.js` / `chars.js` / `custom.js` / `trips.js` / `unmapped.js` | 经典 IIFE → `TC*` | 事态、人物栏、自定义名称 / 夜色 / 着装、行程线、未上图 |
| `map/varmap.js` / `compose.js` / `security.js` | 经典 IIFE | 变量映射页、「去这里 / 追问」、安保叠加层。**v2 起按需加载**（见 §6.3） |
| `map/here.mjs` / `card-bind.mjs` | ES 模块 | 当前地点解析（六级落点）；卡原名绑定 |
| `map/core/protocol.mjs`（v2 新增） | ES 模块 | 协议版本 `PROTO`、消息 schema、`validate`、`createBus` |
| `map/core/storage.mjs`（v2 新增） | ES 模块 | 本机存储服务：`KEYS` 键表（默认值 / 作用域），带 try/catch 的 `get/set/json/remove` |
| `map/tavern/eden-map.js` | ES 模块（宿主入口） | 悬浮按钮、面板、线路 / BASE、srcdoc 加载、宿主令牌、数据采集、自检、更新、通知层 |
| `map/tavern/*.mjs` | 纯函数模块 | mvu / adapter / shujuku / characters / events / trips / picker / compose / budget / selfcheck / splash |
| `map/ui/sheet.js` · `chrome3d.js` · `notice.mjs` · `gallery.js` | UI 组件 | 抽屉、三维页外壳、通知层、画廊 |
| `map/estate/*` | three.js 模块 | 伊甸庄园三维（协议注释在 index.html 头部） |
| `map/props/viewer3d.html` + `props/<id>/manifest.json` | 单文件 | 通用三维查看器 |

## 2. 加载模型与约束

```
酒馆页 (origin O)
 └ 卡内脚本 import https://cdn.jsdelivr.net/gh/<repo>@<ref>/map/tavern/eden-map.js
     SELF = new URL('../', import.meta.url);  BASE = baseFor(线路)
     html = fetch(BASE+'viewer.html') → 插入 <base href=BASE>  → frame.srcdoc
       └ viewer（srcdoc：origin 继承 O，document.baseURI = BASE）
           openEstate：fetch(page) → 插入 <base 页面目录> + EST_HOOK → Blob → iframe.src = blob:O/…
             └ estate/index.html 或 props/viewer3d.html
```

对 ES 模块化的约束：

1. gh 线路返回的 `.html` 是 `text/plain`，只能用 srcdoc 或 blob 加载，所以查看器文档永远不在 CDN 地址上，相对地址全靠 `<base>`。
2. **srcdoc 里的内联或经典脚本不要写相对的 `import()`。** Chrome 会按宿主页地址解析，结果取到 `tavern/tavern/…`（events.js 里有记录）。统一写成 `import(new URL('x', document.baseURI).href)`。
   **外部模块标签 `<script type="module" src="app/x.mjs">` 是安全的**：`src` 按 `<base>` 解析，模块内部的相对 import 按 `import.meta.url`（CDN 地址）解析。
3. 跨源模块需要 CORS。jsDelivr、jsdmirror、npmmirror 都返回 `ACAO:*`。模块之间只能用相对路径互相引用。
4. 查看器、宿主、blob 子页三者同源（O），共用 localStorage，所以键名必须全局统一（见 `core/storage.mjs` 的 `KEYS`）。
5. 模块脚本不会产生全局词法绑定，但**能读写经典脚本的全局绑定**（全局声明环境是共享的）。所以拆出去的模块可以直接用 `viewer`、`cur` 等，前提是运行时它们已经声明。模块在所有 defer 脚本之后按文档顺序执行。
6. 读 viewer.html 的工具在拆分时要同步更新：`tools/smoke.sh` 的 `inline_check`（已把 `map/app/*.mjs`、`map/core/*.mjs` 纳入 `node --check`）、`tests/postmessage.test.mjs`、`tools/pack_npm.sh`、`tools/warm_cdn.sh`。

## 3. postMessage 协议

**信封**（v2 起）：`{ type, v: PROTO, t?, ...payload }`，当前 `PROTO = 2`。

- 缺少 `v` 的消息按 v1 接收（兼容旧宿主 / 旧查看器；换线路时两边可能是不同版本）。
- `v` 大于本端版本的消息也接收，但忽略未知字段。
- 每种消息的字段类型在 `core/protocol.mjs` 的 `SCHEMA` 里声明。**校验不通过的消息丢弃并 `console.warn`**，不抛异常。

来源检查：
- 查看器 ← 宿主：`e.source === parent || e.data.t === __edenHostToken`。
- 宿主 ← 查看器：`e.source === frame.contentWindow`。
- 查看器 ← 子页：`e.source === est.frame.contentWindow`。
- 子页 ← 查看器：`e.source === parent`。

三者同源，所以 v2 在查看器和宿主两端都额外要求 `e.origin` 等于自己的 origin，或者是 `'null'`（srcdoc 或 blob 在个别浏览器上会报 `null`）。

### 3.1 查看器 → 宿主（`post()`，targetOrigin `'*'`；接收：eden-map.js `onMsg`）

| type | 字段 | 宿主处理 |
|---|---|---|
| eden-map:boot | pct:number | 进度 |
| eden-map:ready | proto?:number | 一轮初始推送 |
| eden-map:progress | pct:number | 进度 |
| eden-map:loaded | — | 完成 |
| eden-map:state | map, title, lang, theme, hand（字符串） | 同步标题栏、语言 |
| eden-map:esc | — | 关面板 |
| eden-map:build | version… | 自检比对 |
| eden-map:line-pick | — | 线路选择 |
| eden-map:storage-info / storage-clean | — | 回 storage-result；清理 10 秒限频（v2：限频时回 `cleaned.limited`） |
| eden-map:emit | ev:string, data | 本机扩展（只处理 map） |
| eden-map:check-update / splash / update-now | — | 自检、开场卡、切新版本 |
| eden-map:chrome | top, bottom:number | 通知层避让 |
| eden-map:notice | n:object | 通知层（字段清洗） |
| eden-map:formbusy | on | 通知暂缓 |
| eden-map:unmapped | name:string\|null | 标题栏「未上图」 |
| eden-map:custom-set / custom-reset / custom-sync | key, patch / key / on | 聊天变量 |
| eden-map:varmap-set | user:object | 变量映射 |
| eden-map:compose | text:string | 填入聊天输入框 |

### 3.2 宿主 → 查看器（宿主 `post()` 自动附 `t: HOST_TOKEN`、`v: PROTO`）

`here{value}`、`chat{id}`、`lang{lang}`、`about`、`update-result`、`card-bind`、`chars`、`events`、`custom`、`clock`、`outfit`、`varmap`、`trips{items}`、`toast{items}`、`selfcheck`、`hostbar{w,side}`、`line`、`key{key}`、`storage-result{storage,sources,cleaned,cleanable}`、`settings{page}`、`notice-act{key,id}`、`unmapped-pick`、`sleep`、`wake{fly}`、`compose-done{ok,how}`、`open{map}`、`fly{target}`。

`open`、`fly` 在仓库里没有发送方。它们是写在 `docs/content-compat.md` 的本机扩展入口，**保留**。

### 3.3 查看器 ↔ 庄园 / 三维子页

| type | 方向 | 字段 |
|---|---|---|
| estate:room / bind / inset / lang / theme / pause / resume | 查看器 → 子页 | name, card / names / left / lang / theme / — |
| v3d:fly | 查看器 → 三维 | hotspot |
| estate:ready / fail / key | 子页 → 查看器 | floors, rooms / reason / key |
| estate:floor（下行）、v3d:mode、v3d:flows | 直嵌 / 调试接口 | 保留，写在子页头部注释 |
| estate:select、上行 estate:floor、v3d:state | 子页 → 查看器 | 查看器不处理；是子页头部注释里写明的**直嵌接口**（外层页直接嵌子页时用），保留并登记在 SCHEMA |

## 4. 状态归属

| 状态 | 所有者 | 读者 |
|---|---|---|
| 首帧偏好 `__theme/__lang/__hand` | 内联 #0 | 主脚本 |
| `viewer, REG, M, cur, est, HX, LANG…`（全局 let） | 主脚本 | 外挂脚本、`app/*.mjs` |
| `go` | 主脚本；`app/clouds.mjs` 重新赋值包装（下一步改成显式的包装注册） | 所有人 |
| `TC*` 命名空间 | 各外挂文件 | 主脚本（带 `typeof` 守卫） |
| `__edenHostToken` | 宿主写入 | 查看器宿主接口 |
| 聊天变量 `eden_map.{自定义, 标签楼}` | 宿主（mvu.mjs） | 经消息推给查看器 |
| localStorage `edenMap*` | 键表在 `core/storage.mjs` 的 `KEYS` | 见下 |

**存储键**（全部同源共用）：

- **查看器**：`edenMapTheme`、`edenMapLang`、`edenMapHand`、`edenMapTierV2`、`edenMapAlt:<id>`、`edenMapBarriers`、`edenMapRoutes`、`edenMapKeys`、`edenMapRM`、`edenMap3dQ`、`edenMap3dAuto`、`edenMapFps`、`edenMapNoFx`、`edenMapCharStats`、`edenMapCharMore`、`edenMapAutoCheck`、`edenMapAutoUpdate`、`edenMapLockTag`、`edenMapRailW`；sessionStorage `edenMapEstateFail`。
- **外挂**：`edenMapEvOff`、`edenMapLegHint`、`edenMapPortraits`、`edenMapChGroups`、`edenMapCharMoreOpen`、`edenMapNight`、`edenMapTrips`、`edenMapSecurity`、`edenMapCompose`；按聊天分的 `edenMap:chat:<c>:*`、`edenMap:varmap:<card>`、`edenMap:lru`。
- **宿主**：`edenMapLine*`、`edenMapSeen:<chat>`、`edenMapEvTip`、`edenMapUpdSkip`、`edenMapCheckToast`、`edenMapUpdate`、`edenMapSplashSeen`、`edenMapFabPos`。
- **三维**：`edenEstateLabels`（不以 `edenMap` 开头，存储预算统计不到，已记为遗留）、`edenMap3dRailW`。

## 5. 扩展点

1. **数据源**（全部在宿主侧解析，以消息推给查看器）
   - MVU：`tavern/mvu.mjs` 加 `adapter.mjs`（变量映射 `DEFAULT_MAP/detect/effective`，用户覆盖值存 `edenMap:varmap:<card>`）。
   - 数据库插件：`tavern/shujuku.mjs`。
   - 卡原名绑定：`card-bind.mjs`（宿主计算，查看器 `applyToRegistry`）。
   - 聊天标签：`tavern/events.mjs`、`characters.mjs`、`trips.mjs`、`mvu.parseCustomTags`。
   - 下一步：`tavern/sources/index.mjs`，统一成 `{ id, detect(ctx), read(ctx) }` 注册表，让自检和变量映射从同一处枚举。
2. **地图注册表**：`map/data/maps.json`（`maps.<id>.{kind, base, alt, overlay, group, parent, status, src, viewer3d, markers…}`、`groups.<id>.{layers, place, upper}`），由 `tools/check_maps.py` 校验。
3. **三维查看器清单**：`kind=estate` 且带 `viewer3d:'<model>'` 时，查看器加载 `props/viewer3d.html`，注入 `__V3D_MODEL`，再读 `props/<model>/manifest.json`。
4. **本机扩展 API**：`window.EdenMap`（宿主侧也挂一份并转发），以及 `TCSettings.registerSection(page, el, {order})`。

## 6. 增量重构计划（风险从小到大，每一步 smoke、node --test、浏览器套件都全绿）

1. **测试护栏**：`tests/protocol.test.mjs` 做两件事。一是静态扫描所有 `type: 'eden-map:*' | 'estate:*' | 'v3d:*'` 的发送点，要求它们都已在 `SCHEMA` 登记。二是校验 schema 与版本兼容规则。
2. **死代码**：删除 `cycleTheme`、`callout`、`galleryOpen`；修正「iframe.srcdoc」的过时注释。
3. **compose.js 回执加来源检查**：与宿主接口使用同一套判断 `__fromHost(e)`。
4. **协议模块与总线** `core/protocol.mjs`：宿主（ES 模块）静态 import，查看器在 `main()` 里与 `here.mjs` 并行加载；两端的收发都经过 `validate`，发送时带上 `v`。
5. **存储服务** `core/storage.mjs`：先迁宿主和新代码，经典脚本在后续版本里逐个迁。
6. **拆内联脚本**：先拆叶子块（云 → `app/clouds.mjs`，尺度衔接 → `app/scale.mjs`），用外部模块标签，读写全局绑定；`go` 的包装以后改成显式注册。之后按 §1.1 的子区逐块搬：util → i18n → tiers → markers → estate-host → settings-ui → extapi → shell → host-link → boot。过渡期用 `window` 桥（`Object.defineProperty` getter / setter）保证外挂脚本还能读写 `cur` 等绑定。
7. **外挂脚本改模块**，用 import 取代全局与 `typeof` 守卫。
8. **数据源注册表**，以及 `maps.json` 的 JSON Schema。

### 6.3 按需加载（性能）

- `varmap.js`、`compose.js` 只在嵌入酒馆时有用，`security.js` 只在打开安保层时有用。这三个改为由 `lazyScript()` 按需插入经典脚本标签。主脚本对它们的调用本来就带 `typeof` 守卫，按需加载后行为不变。
- `warmOthers` 只预热「同组各层 + 上级 + 直接下级」，其余地图在用户走近时再预热；庄园 / 三维页的页面文本只预取当前图的直接下级。

### 风险提示

- srcdoc 里**任何**内联 `import` 都可能按宿主地址解析：新代码只能用外部模块标签，或 `new URL(x, document.baseURI)`。
- 换线路时 `BASE ≠ SELF`：查看器的模块来自 BASE，宿主模块来自 SELF，两边版本可能不同。所以协议版本协商不能省，缺 `v` 必须按 v1 接收。

## 7. 本版本（大版本 2）落地情况

见 `docs/reviews/v2_arch_gate.md` 的「提交」一节。已完成：§6 第 1–4 步、第 5 步的服务与宿主侧迁移、第 6 步的叶子块（云、尺度衔接）、§6.3。第 6 步主脚本的逐块搬迁、第 7、8 步留到下一版本。
