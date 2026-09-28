# 酒馆助手（TH）地基检测：用满平台能力 + 地基加固

读的版本：酒馆助手 JS-Slash-Runner `830ebc8`（2026-09-28），路径相对该仓库根；地图代码为本分支 `map/tavern/*`。与 `docs/mvu-integration.md`（MVU 生命周期）互补，不重复其内容。纯技术文档，不涉及任何内容过滤。

## 1. 能力矩阵

「用」= 地图今天是否用；价值 / 工作量 / 风险：高中低。

| 能力 | 出处（TH） | 用？ | 价值 | 量 | 险 | 备注 |
|---|---|---|---|---|---|---|
| 变量读写 chat/message/global/character/**script** | `@types/function/variables.d.ts:3-31` | 部分（chat、message） | 高 | 低 | 低 | `type:'script'` 按脚本 id 隔离（`src/function/variables.ts:102-237`），未用 |
| 事件 `eventOn`/`eventMakeFirst`/`eventEmit` | `@types/iframe/event.d.ts:42,79,118` | 是（`eden-map.js:910` 统一登记） | — | — | — | `eventOn` 返回 `{stop}`（`event.d.ts:10-13`），我们已兼容 |
| 提示注入 `injectPrompts/uninjectPrompts` | `@types/function/inject.d.ts:39,46` | 是（`eden-map.js:625-626`） | — | — | — | 可改用返回的 `uninject` 句柄 |
| `generate`/`generateRaw` | `@types/function/generate.d.ts:154-218` | 否 | 低 | 中 | 中 | 会花用户 API 额度；地图不应自发调用，最多做用户点击触发的可选功能 |
| 世界书读 `getWorldbook`/`getCharWorldbookNames` | `@types/function/worldbook.d.ts:32,155` | 是（`selfcheck.mjs:54-73`，含旧 `getLorebook*` 回退） | — | — | — | 旧 `lorebook.d.ts` 已 `@deprecated`（`:1`） |
| 世界书写 `createWorldbook`/`createWorldbookEntries`/`updateWorldbookWith`/`rebindCharWorldbooks`/`importRawWorldbook` | `worldbook.d.ts:39,165,263,285`；`import_raw.d.ts:53` | 否 | **高** | 中 | 中 | 可替代「手动导入附加条目」，见 §2 A1 |
| 角色卡读 `getCharData`/`getCharacter` | `raw_character.d.ts:99`；`character.d.ts:105` | 部分（`eden-map.js:668` 只扫 extensions） | 高 | 低 | 低 | 可精确识别卡与卡版本，见 A3 |
| 角色卡写 `replaceCharacter`/`importRawCharacter` | `character.d.ts:143`；`import_raw.d.ts:12` | 否 | — | — | 高 | **不用**：交付规则「不改角色卡」 |
| 预设 `getPreset` | `preset.d.ts:180` | 否 | 低 | 低 | 低 | 仅自检可报「注入深度被预设吞掉」类问题 |
| 酒馆正则 `getTavernRegexes`/`formatAsTavernRegexedString`/`updateTavernRegexesWith` | `tavern_regex.d.ts:23,87,127` | 否 | 中 | 低 | 中 | 读：自检能发现「隐藏变量块的正则缺失」；写：不做 |
| 斜杠命令 `triggerSlash` | `slash.d.ts:29` | 是（`compose.mjs` 填输入框，`eden-map.js:428`） | — | — | — | 保持「只填不发」 |
| 脚本按钮 `replaceScriptButtons`/`appendInexistentScriptButtons`/`getButtonEvent` | `@types/iframe/script.d.ts:13-76` | 否 | **高** | 低 | 低 | 浮动按钮之外的第二入口，见 A2 |
| 脚本信息 `getScriptName/getScriptInfo/replaceScriptInfo` | `iframe/script.d.ts:79-89` | 否 | 中 | 低 | 低 | 把版本 / 通道 / 自检摘要写进脚本库说明 |
| 类宏 `registerMacroLike` | `macro_like.d.ts:27` | 否 | 中 | 中 | 中 | 如 `{{eden_here}}` 供卡 / 预设引用当前地点；可替代部分注入 |
| 全局共享 `initializeGlobal`/`waitGlobalInitialized` | `global.d.ts:14,27` | 只等 Mvu（`eden-map.js:932,1145`） | 中 | 低 | 低 | 可 `initializeGlobal('EdenMap', api)` 代替挂 `window.parent.EdenMap` |
| 音频 `playAudio`/`getAudioList` | `audio.d.ts:29,44` | 否 | 低 | 低 | 低 | 环境音可选，默认关 |
| 版本 `getTavernHelperVersion`/`getTavernVersion` | `version.d.ts:4,9` | 否（靠 `fnOk` 功能探测） | 中 | 低 | 低 | 写进自检报告；判断仍用功能探测 |
| 扩展 `getExtensionType`/`installExtension` | `extension.d.ts:15,59` | 否 | 低 | — | 高 | 只用前者探测 MVU/数据库插件是否装；**不**自动装 |
| iframe 工具 `getScriptId/getIframeName/reloadIframe/errorCatched` | `iframe/util.d.ts:30-55`；`function/util.d.ts:33` | 否 | 中 | 低 | 低 | `getScriptId` 用于多实例识别，比 `__edenMapLoads` 可靠 |
| `builtin`（ST 内部函数） | `builtin.d.ts:1` | 否 | 低 | — | 中 | 不稳定面，避免 |
| 持久存储 | 无专用 API；脚本变量即持久 KV | 用 `localStorage`（41 处） | 高 | 中 | 低 | 见 §3.4 |
| toast | 宿主 `toastr` | 自绘（`ui/notice.mjs`） | — | — | — | 自绘可控，保持 |

## 2. 采纳清单

### 现在（小、稳、收益大）
- **A1 世界书附加条目一键写入（征得同意）**：自检发现缺附加条目时，给「写入 / 更新」按钮；点了才调 `createWorldbook`（新书）或 `createWorldbookEntries` / `updateWorldbookWith`（按条目 uid / 名称幂等覆盖），并可选 `rebindCharWorldbooks('current', …)` 挂到卡的附加书。条目内容取 CDN 上与脚本同 sha 的 `addon` 产物，写前展示 diff 条数；只动我们自己名下的书，永不改卡自带世界书。失败回退为现有「下载手动导入」。
- **A2 脚本按钮**：`appendInexistentScriptButtons([{name:'地图',visible:true},{name:'地图自检',visible:true}])` + `eventOn(getButtonEvent('地图'), open)`（`iframe/script.d.ts:13,76`）。浮动按钮被主题 / 其它脚本遮挡或 iPhone 上拖丢时，还有 TH 自带入口。事件句柄走现有 `listen`，自动随 cleanup 撤。
- **A3 读卡识别**：用 `getCharData('current')` 的 `name / data.character_version / data.extensions` 精确判断「是不是伊甸卡、哪个版本」，替代按世界书名 / 楼层文本猜；判断写进自检。
- **A4 版本写进自检**：`getTavernHelperVersion()`、`getTavernVersion()` 入自检报告；兼容逻辑仍靠功能探测。
- **A5 脚本说明**：`replaceScriptInfo` 写当前版本、通道、最后一次自检结论，用户在脚本库里就能看到，不用打开地图。

### 下一步
- **A6 脚本变量替代部分 localStorage**：跨设备 / 跨浏览器需要保留的偏好（手型、线路、语言）改存 `type:'script'` 变量（随 ST 设置同步，TauriTavern 与 iPhone 不会因 WebKit 清存储丢）；大体积缓存仍留浏览器侧。
- **A7 `initializeGlobal('EdenMap', api)`**：给其它脚本 / 状态栏一个正式、可等待的入口（`waitGlobalInitialized('EdenMap')`），替代直接挂 `window.parent.EdenMap`。
- **A8 类宏 `{{eden_here}}`/`{{eden_route}}`**：卡或预设作者可自行引用，地图不必再用注入决定位置；与现有注入并存，默认不启用。
- **A9 正则只读自检**：`getTavernRegexes({type:'character'})` 检查是否有隐藏变量块 / 地图标签的正则，缺了提示（不写）。
- **A10 MVU / 数据库插件协作**：在 `Mvu.events.VARIABLE_UPDATE_ENDED` 之外，用 `eventEmit('eden-map:moved', {…})` 广播地图内移动，让状态栏类脚本可以订阅；只发事件，不写对方数据。

### 以后
- 后台预加载 + Cache API（§4）；`playAudio` 环境音；用户点击触发的 `generateRaw` 摘要（明示耗额度，默认关）。

## 3. 地基检测

### 3.1 加载路径 vs TH 生命周期
TH 每个脚本是一个 iframe（`src/panel/script/Iframe.vue:10-17`，srcdoc），关脚本 / 换卡 / 重载时 iframe 触发 `pagehide`，TH 自己在此撤注入（`src/function/inject.ts:51`）并用 `src/iframe/cleanup_protector.js` 清理脚本往父页面插的 DOM。我们：外壳脚本 → 跟随加载器（`follow.mjs` 取最大构建号）→ `import()` CDN 模块，模块在脚本 iframe 的 realm 里求值，UI 挂在 `window.parent.document`。结论：
- 正确：`pagehide`（非 bfcache）调 `cleanup`（`eden-map.js:1169`），且新实例先调旧 `__edenMapCleanup`（`:53`）。
- 风险：UI 与监听挂在父页面，但计时器 / 模块在子 iframe；子 iframe 若被 TH 直接移除而 `pagehide` 未派发（极少，WebKit 上 iframe detach 时行为不一），父页面的节点与 `message`/`keydown` 监听会成孤儿。建议父页面节点上加 `data-eden-owner=<scriptId>`，新实例启动时按属性兜底清扫。
- `import(url)` 切版本（`:1086`）会在同一 realm 里叠加模块实例；已靠 `__edenMapCleanup` 串行化，可接受。

### 3.2 撤场与内存
逐项核对 `cleanup`（`eden-map.js:1164-1167`）：事件（`offs`）、`pollT/updT`、两个 MutationObserver、数据库回调、所有超时、注入、`message`、主题 `change`、`keydown`、`visibilitychange/pageshow/online`（`:1156-1157`）都有撤销。未撤：拖动用的 `requestAnimationFrame`（`:1105`，一次性回调，无泄漏）；`watchT`（加载进度，`endProg` 会清，但 cleanup 未显式清——建议补一行 `clearInterval(watchT)`）。多脚本共存靠 `__edenMapLoads` 计数并在自检里报；建议改用 `getScriptId()` 作为身份。

### 3.3 版本升级
TH 已把 `lorebook` 系列标 `@deprecated`、`eventOn` 返回值由函数改为 `{stop}`；我们用 `fnOk` 探测 + 多接口回退（`selfcheck.mjs:54-73`、`eden-map.js:911`）是对的。规则：**永远功能探测，不按版本号分支**；新 API（按钮、脚本变量、`initializeGlobal`）一律 `fnOk` 包裹，缺了静默退回现状。

### 3.4 TauriTavern / iPhone
- iPhone WebKit：第三方 iframe 存储分区 + ITP 7 天无交互清站点数据，`localStorage` 不可靠 → A6；Cache API 同受配额与清理影响，只当加速不当真相。
- WebKit 不支持 `requestIdleCallback`（已有 `setTimeout` 回退，`:335`）。
- TauriTavern 被系统杀进程无回调（见 `mvu-integration.md` §4）→ 所有状态从聊天重推导，已满足。
- 内存：three.js 查看器在低端 iPhone 上是主要风险，已有预算模块（`budget.mjs`）；建议查看器关闭时释放 iframe（现有 `unloadViewer`）而不是隐藏。

### 3.5 降级
没有 MVU：`waitGlobalInitialized('Mvu')` 不 await（`:1144-1145`），正确。没有 `injectPrompts`：注入静默跳过。CDN 全挂：跟随加载器回退本机记住的构建（`follow.mjs`）。缺口：世界书附加条目缺失时只报告，不引导（A1 解决）。

### 3.6 安全边界（只连我们声明的地方）
对外请求只有：jsDelivr 系 / jsdmirror / raw.githubusercontent / api.github.com（`follow.mjs`、`eden-map.js:231-454,923,1024`），内容全是公开静态文件，**不上传任何聊天或变量数据**。不足：
- 更新查询带了 `credentials:'omit', referrerPolicy:'no-referrer'`（`:451,923`），但 CDN 取文件（`:231,252,326,454,966`）没带，会把酒馆的 origin 作为 Referer 发给 CDN。建议统一一个 `cdnFetch` 包装。
- 查看器 `postMessage(..., '*')`（`:362`）靠 HOST_TOKEN 校验；目标 frame 是我们自己创建的，风险低，但可改成具体 origin。
- 永不用 `installExtension`、`builtin`、`generate*`（除用户点击）、角色卡写接口。

## 4. 重脚本策略
- 现状：外壳小，业务按需 `import()`（十余个模块，`eden-map.js:18-737`），查看器 HTML/JS 约 300 KB + 瓦片 / glb 数 MB，空闲时预取（`:1160`）。这是正确形态：**启动路径只做浮动按钮 + 事件订阅**，其余懒加载。
- 缓存：jsDelivr 按 sha 的 URL 不可变，可放心 `cache:'force-cache'`（`:966` 已用于 glb）。下一步用 Cache API 以 `sha` 为分区存 viewer.html 与数据 JSON，启动时先用缓存再后台比对 `head.json`；切版本时删旧分区。IndexedDB 只在需要存大于 5 MB 的结构化数据时再引入。
- 何时重没问题：地图打开后（用户明确要看）；空闲预取只在非计量网络、非省电模式（`navigator.connection.saveData`）下进行。何时不行：聊天首屏与生成期间——应推迟预取到 `GENERATION_ENDED` 之后。

## 5. 当前代码风险排序
1. **CDN 请求 Referer 泄露宿主 origin**（§3.6）——修法小，属边界卫生。
2. **父页面孤儿节点**：子 iframe 异常移除时无兜底清扫（§3.1）。
3. **偏好存 localStorage，iPhone / TT 易丢**（§3.4）。
4. **多实例身份靠全局数组**，切版本失败路径下可能误报（`:1085-1086`）；改用 `getScriptId()`。
5. **`eden-map.js` 单文件 1170 行、单行超长**：可读性与审阅成本高；按功能继续拆模块（注入、fab、更新提示）。
6. `watchT` 未在 cleanup 显式清（影响极小）。

## 6. 地基修复清单
1. 统一 `cdnFetch(url, opts)`：默认 `credentials:'omit', referrerPolicy:'no-referrer'`，所有外部请求走它；加测试断言源码里不再有裸 `fetch(` 指向外部域。
2. 父页面节点打 `data-eden-owner`，启动时清扫非本实例节点；cleanup 同时清。
3. 身份与多实例：`getScriptId()`（有则用）替代 `__edenMapLoads`；`initializeGlobal('EdenMap', api)` 发布接口。
4. 偏好迁移到脚本变量（读：脚本变量 → localStorage 回退；写：两边都写一个版本期后再去 localStorage）。
5. cleanup 补 `clearInterval(watchT)`；生成期间暂停空闲预取。
