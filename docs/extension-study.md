# 扩展形态研究（EXT-STUDY，阶段 F 的证据）

> 状态：**2026-10-03 完成**。结论见 §7，Q-29 已回答。本文的测量分两批：第一批是 2026-10-02 在本机 SillyTavern 上用 Playwright 做的（Chromium 和 WebKit），第二批是 2026-10-03 在用户自己的 Mac TauriTavern 上做的真机测量。原型代码和原始数据不进仓库，在 `~/eden-map-review/ext-study/proto/`。
>
> 本文回答的是：地图从「酒馆助手（TH）外部脚本」改成「SillyTavern / TauriTavern 原生扩展」之后，要多付出什么，能多得到什么。

## 1. 结论摘要

- **速度上两种形态差不多。** 冷启动（清缓存）扩展快 1.4–3.5 秒，热缓存快 0–0.8 秒，内存、楼层事件延迟、注入有没有进提示词都看不出差别。WebKit 上原来那个「脚本 42.9 秒」是长尾，不是常态：重测三次是 4.7 / 7.8 / 23.9 秒，扩展三次是 4.2 / 4.3 / 7.0 秒。
- **决定性的差别不在速度，在 Mac TT 上地图根本出不来。** 在用户自己的 TauriTavern 2.3.0 上，脚本形态跑了 6 次，地图的悬浮按钮和面板都挂上了，但查看器 6 次都没有启动（其中 5 次在 30 秒时按钮变成「预加载失败」）。同一份 `viewer.html`、同一个 CDN、同一种 srcdoc 挂法，由扩展挂上去 2.7 秒就启动了。原因还没查清，见 §5。
- **伊甸卡离不开 TH。** 卡里的 MVU 和「变量结构」本身就是 TH 脚本，`stat_data` 由它们写。地图改成扩展以后，玩家照样要装 TH。
- **地图状态不需要放在扩展目录里。** 把克隆目录清空只留 `.git` 再装回来，`extension_settings` 里的测量记录、聊天元数据里的测试键、地图自己的 `eden_map` 聊天变量全都还在。
- **现在的仓库装不成扩展。** 安装扩展就是 `git clone` 整个仓库，本仓库打包后约 944 MB。扩展需要一个只放加载器的小仓库，清单放在根目录（S10 拆分）。

## 2. 测量环境和办法

### 2.1 本机 SillyTavern（第一批）

- SillyTavern 1.19.0（`tavern/SillyTavern`），数据目录用 `--dataRoot` 指到会话草稿目录，端口 8000，用户自己的 ST 数据没动。TH 4.11.2，和 Mac TT 里同一个版本。伊甸卡从 TT 复制一份。
- 浏览器是 Playwright 的无头 Chromium 和 WebKit。冷 = 每次换一个新的浏览器配置目录；热 = 同一个配置目录第二次跑。
- 两种形态：
  - **S（脚本）**：卡内 TH 地图脚本照常加载，原型扩展只做被动测量（probe 模式）。
  - **E（扩展）**：用一份关了卡内地图脚本的卡，原型扩展用 loader 模式自己取 `head.json`、`import` 同一个入口模块，再挂一层 TH 兼容垫片。
- 计时口径：从选卡、聊天打开（`CHAT_CHANGED`）到查看器发出 `eden-map:loaded`，即地图首帧。内存是首帧后 15 秒时的 JS 堆（Chromium 用 `Performance.getMetrics`，WebKit 拿不到）。
- 「事件延迟」是酒馆事件触发后查看器收到宿主第一条推送的时间；宿主自带 300 ms 防抖，所以两边都落在 250–290 ms，测到的其实是防抖。

### 2.2 Mac TauriTavern（第二批）

- 用户自己的 TauriTavern 2.3.0，WKWebView，数据目录 `~/Library/Application Support/com.tauritavern.client`，origin `tauri://localhost`。TH 4.11.2。伊甸卡「母畜庄园 Yehehua二创版V1.5」，聊天有 170 多楼。
- TT 的界面没法用脚本点，所以原型扩展做了一件事：把测量结果用 HTTP 报给本机一个接收服务，并从同一个服务读指令（形态、要开哪张卡、要不要划卡、要不要切聊天）。原型扩展本体是一份装进 TT 第三方扩展目录的 git 克隆（`data/extensions/third-party/eden-map-ext`），走的是和「安装扩展」填 Git 地址一样的目录。
- 没有做到的：TT 自己的「安装扩展」和「更新扩展」两个按钮没法点，所以**安装和更新都是按它们产生的目录形态复现的，不是点的那个按钮**。TT 的界面截图也没拍到（这台机器没有录屏权限）。
- TT 里地图脚本的本来状态：它在酒馆助手的**全局脚本**里，而且处于**关闭**状态。也就是说用户现在在 TT 里并没有开着地图。测试期间把它打开过，测完恢复成关闭。

## 3. 实测数据

### 3.1 首帧时间（毫秒，从聊天打开到地图首帧）

| 浏览器 | 缓存 | 脚本 S：中位数（范围） | n | 扩展 E：中位数（范围） | n |
|---|---|---|---|---|---|
| Chromium | 冷 | 5947（5440–6454） | 2 | 3793（3657–3929） | 2 |
| Chromium | 热 | 1253（1111–1516） | 3 | 477（476–685） | 3 |
| WebKit | 冷（每次新配置目录） | 7842（4695–23861） | 3 | 4304（4198–7046） | 3 |
| WebKit | 热 | 4562（4389–4594） | 3 | 4381（3534–7190） | 3 |

分阶段看（WebKit，三次的中位数）：

| 阶段 | 冷 S | 冷 E | 热 S | 热 E |
|---|---|---|---|---|
| 聊天打开 → 地图外壳挂上 | 3385 ms | 1824 ms | 1572 ms | 1567 ms |
| 外壳 → 查看器首帧 | 4964 ms | 3119 ms | 3495 ms | 3357 ms |

结论：**差的只是第一段**（谁来取版本、谁来 import 入口），第二段是查看器自己的启动，两种形态一样。WebKit 上第二段就要 3 秒多，比 Chromium 慢，这是查看器和 WebKit 的事，和形态无关。

### 3.2 WebKit 冷启动为什么会有 23.9 秒

抓了全部网络请求的时间线，一次冷启动里：

- 酒馆助手自己要加载约 80 个文件（vue、vue-router 和它自己的 `node_modules`），全部从 `testingcf.jsdelivr.net` 取。这一段和地图抢连接。
- 地图的跟随引导同时向 6 个地址要 `head.json`（jsdmirror、jsdelivr、fastly、gcore、testingcf、`raw.githubusercontent.com`），谁快用谁。这 6 个请求本身不慢（0.8–1.1 秒），但每个都带 5 秒超时。
- 入口模块 `eden-map.js` 有约 40 个静态 import，每个都是从 CDN 单独取一次，慢的那次 23.9 秒里，光这一段就吃了 7.8 秒。

两次跑的差别不在代码，在 CDN 当时快不快。**要治这个，改扩展形态没用，要治的是「40 次串行取模块」这件事本身。**

### 3.3 内存、事件延迟、注入

| 项目 | 脚本 S | 扩展 E |
|---|---|---|
| JS 堆 MB（Chromium，首帧后，5 轮） | 70–105 | 66–96 |
| frame 数 | 7–8 | 6–7 |
| 回复后推送延迟 ms（面板开着） | 261–268（4 次） | 259–279（6 次） |
| 划卡后推送延迟 ms | 255–257（2 次） | 253–255（3 次） |
| 事态摘要是否进入最终提示词 | 进入 | 进入 |
| 切到别的卡以后 | 地图挂上（脚本是全局脚本时不卸） | 地图挂上 |
| 没有 TH（扩展管理里关掉） | 不适用 | 能跑（2 轮），首帧 425 / 1143 ms，自检报「MVU 未加载」 |
| 同时开两种 | — | 两份都加载，后挂上的 TH 实例留下，自检报「检测到另一个地图脚本」（1 轮） |

### 3.4 Mac TT 真机

| 项目 | 脚本 S | 扩展 E |
|---|---|---|
| 地图外壳挂上（`#eden-map-root`） | 2.6–6.0 秒（6 次都有） | 3.9 秒 / 13.9 秒（两次：热 3.9，冷 13.9） |
| 查看器首帧（`eden-map:loaded`） | **6 次都没有**；其中 5 次在 30 秒时悬浮按钮变成「预加载失败」，第 1 次 60 秒内没有任何标记 | 有：冷 23.4 秒（第一次，入口要从 CDN 现取），热 2.1 秒 |
| 点一下悬浮按钮（用户会做的事） | 查看器的 HTML 确实被塞进去了（srcdoc 66019 字符），45 秒内还是没启动 | 不需要 |
| 同一份查看器由扩展自己挂 | — | 2.7 秒启动 |
| 地图状态变量 `chat_metadata.variables.eden_map` | 能读 | 能读 |
| 卡的 `stat_data`：原生读 `chat[i].variables[swipe].stat_data` 与 `Mvu.getMvuData` | 同一个值（5 个顶层键，每一楼都对） | 同上 |

### 3.5 状态与更新

- 把 TT 里扩展的克隆目录清空、只留 `.git`，再装回来：`extension_settings.ext_study`（10 轮测量记录）在、聊天元数据里的测试键 `chat_metadata.ext_study_probe` 在而且继续往上数（13 → 18）、地图自己的 `eden_map` 在 5 个聊天里。三者都不在扩展目录里，所以「更新清目录」碰不到它们。
- 一个操作上的坑：清空过的克隆目录，直接 `git pull` **不会**把文件恢复出来（仓库没有新提交可拉），要 `git reset --hard` 才能恢复。TT 的更新按钮应该做了等价的事，本次没有点过那个按钮，无法确认。
- TT 更新完扩展**必须完全退出 TT 再打开**，`/reload-page` 不重载扩展 JS（CCST 也记着同一条）。

### 3.6 手机

没做。Mac 上的结果已经够定方向，手机留到扩展真要发布时再测。参考 CCST 的实测：手机 TT 打开聊天时主进程 465 MB、CPU 87.7%，其中渲染线程占 43.3%（`tavern/ab-tests/20260926-手机性能-2.json`）；空闲时 336 MB、1.7%（同目录 `-1.json`）。这些压力来自渲染，换成扩展不会变。

## 4. 对 TH 的依赖清单和原生对应

「原型怎么接」是原型里实际做的事，只用来看差距；「原生改造」是正式做扩展时的做法。地图代码里用 `fn('…')` 取的 TH 接口一共 37 个名字，另外还有一批裸全局。

| 用途 | 现在用的 TH / 宿主接口 | 原生对应 | 原型怎么接 | 原生改造量 |
|---|---|---|---|---|
| 运行位置 | TH 脚本 iframe，通过 `window.parent.document` 挂到主页面 | 扩展直接跑在主页面 | 不用接 | 无 |
| 楼层事件 | 裸全局 `eventOn` / `eventMakeLast` / `eventRemoveListener` + `tavern_events` | `getContext().eventSource.on / makeLast / removeListener` 与 `eventTypes` | 5 个函数 | 小 |
| 读楼层 | 裸全局 `getLastMessageId`、`getChatMessages(范围, {role})`（重算的主路径） | 直接读 `getContext().chat` | 有 TH 用 TH 的，没有就用 15 行原生实现 | 小 |
| 地图聊天变量 `eden_map` | `getVariables / insertOrAssignVariables / updateVariablesWith({type:'chat'})` | `chat_metadata.variables` + `saveMetadataDebounced`。TH 本来就存在这里，TT 实测原生能读到（那个聊天 275 个键） | 没有 TH 时用原生实现 | 小 |
| 偏好 `eden_prefs` | 脚本变量 `{type:'script'}` | `extension_settings.<键>` + `saveSettingsDebounced`，清目录后仍在（实测） | 退回本机存储 | 小 |
| 卡的 `stat_data` | `Mvu.getMvuData`（MVU 是卡内 TH 脚本） | 读：`chat[i].variables[swipe_id].stat_data`（与 `Mvu.getMvuData` 实测逐楼相同）；写：仍由 MVU 负责，离不开 TH | 主页面本来就有 `Mvu` 全局 | 读的部分小；写不归地图管 |
| 等 MVU 就绪 | `waitGlobalInitialized('Mvu')` | 查 `window.Mvu` | 用 TH 的 | 小 |
| 事态 / 状态行注入 | 裸全局 `injectPrompts` / `uninjectPrompts` | `setExtensionPrompt`。TH 的 `injectPrompts` 最后也写到这里 | 没有 TH 时用 4 行原生实现 | 小 |
| 世界书附加包、JIT、每个聊天的自定义书 | `getWorldbook / updateWorldbookWith / createWorldbook / replaceWorldbook / deleteWorldbook / rebind*Worldbook(s) / get*WorldbookNames` 等 14 个 | `loadWorldInfo / saveWorldInfo / getWorldInfoNames / updateWorldInfoList`（CCST 用的就是这一套）。绑定分三处写：`chat_metadata.world_info`、角色的 `extensions.world`、全局选中列表 | 用 TH 的 | 中，约 150 行 |
| 类宏 `{{eden_here}}` 等 | `registerMacroLike` | ST 的宏注册。1.19 里旧接口 `MacrosParser.registerMacro` 已在控制台提示废弃 | 用 TH 的 | 小，但要跟着 ST 版本走 |
| 渲染清理（泄露防御网） | `retrieveDisplayedMessage` | 直接查 `#chat .mes[mesid]`。TT 的托管聊天界面要注册参与者，TH 就是在清单的 `hooks.activate` 里注册的 | 用 TH 的 | 中，TT 专属 |
| 卡信息、卡正则自检、预设读取 | `getCharData`、`getTavernRegexes`、`getPreset` | `characters[characterId]`、`extension_settings.regex` 加角色的 `regex_scripts`、预设管理器 | 用 TH 的 | 小 |
| 斜杠命令、对外接口 | `triggerSlash`、`initializeGlobal('EdenMap')`、`eventEmit` | `executeSlashCommandsWithOptions`、直接挂 `window.EdenMap`、`eventSource.emit` | 用 TH 的 | 小 |
| 脚本库信息、脚本按钮、脚本 id | `replaceScriptInfo`、`appendInexistentScriptButtons`、`getScriptId` | 没有对应，也用不上：扩展有自己的清单版本、设置抽屉和斜杠命令（原型的 `/extstudy` 实测可用） | 取不到，静默跳过 | 删掉 |

到目前为止，没有发现哪一项是扩展做不到的。唯一做不了的是「卡的 `stat_data` 由谁写」，这一项本来就不归地图管：它由卡自己的 MVU 负责，而 MVU 需要 TH。

## 5. Mac TT 上地图出不来：现在的证据和还没查的

这是本次最有价值的一条，也是最需要后续排查的一条。已登记为 `docs/todo.md` §1 的 I-36，计划步骤 F-TT。

**现象**：脚本形态下，地图的悬浮按钮、面板、加载层都挂上了，`window.EdenMap` 也能从主页面调到（说明宿主代码在跑），但查看器的 iframe 从来不发 `eden-map:boot`。点一下悬浮按钮（界面上写着「预加载失败，点开重试」）之后，查看器的 HTML 确实写进了 iframe（66019 字符），但 45 秒内还是没有启动。

**已经排除的**：

| 猜测 | 实测 | 结论 |
|---|---|---|
| TT 里上不了 CDN | TH 脚本上下文自己取 `viewer.html`：jsdmirror 34 毫秒、jsdelivr 262–281 毫秒，都是 200；取入口模块 292–908 毫秒 | 排除 |
| 扩展自己挂的 srcdoc 挂法在 TT 里不行 | 同一份 `viewer.html`、同一个 CDN，扩展挂上去 2.7 秒启动 | 排除 |
| 地图被钉在了慢的那条镜像线上（用户 TT 里存的是 `edenMapLine=cn`，还带手动标记） | 把线路钉到 jsdelivr 再跑，还是同样失败 | 排除 |
| TH 的脚本上下文不能往主页面塞 iframe | 它能：`d.body.appendChild(iframe)` 成功 | 排除 |

**还没查的**：TT 里 TH 脚本的宿主是 srcdoc iframe（探测到的 `location.href` 是 `about:srcdoc`，`window.parent` 就是主页面），那为什么同一样东西在 TH 里挂出来就不动。可能是隐藏状态下的 iframe 在 WKWebView 里被挂起（幽灵面板阶段面板是 `em-ghost`，点开后应该可见）、可能是 `<base>` 加上宿主令牌的时序、也可能是 TT 的嵌入运行时（`embedded-runtime-manager`）在换掉脚本上下文时把查看器的窗口引用弄丢了。TT 日志里能看到 `EmbeddedRuntimeManager.invalidate ... slot not found` 这条前端错误，历史上出现过 51 次，但本次时段没有出现，所以还不能当成原因。

**这条要怎么处理**：它是一个缺陷，不管以后用哪种形态都得修。修的时候按「脚本形态下的地图在 TT 里出不来」这个现象去查，不要先假设成扩展形态的问题。修法上，三种可能对应的改法不同（挂 iframe 时机、宿主令牌、或者干脆把查看器从宿主上下文里挪出去），所以先查清楚再动手。

### 5.1 F-TT 的结论（2026-10-03，I-36 已结）

**根因不是 TT，是镜像**。用户那份跟随脚本的 `HOSTS` 第一个是 `cdn.statically.io`（手改过），而 `map/tavern/host-routes.mjs` 的 `swappable` 只认 jsdelivr / jsdmirror / npmmirror，于是入口模块一旦从 statically.io 加载，整棵资源树（`viewer.html`、模块图、设定包数据、OpenSeadragon）就被钉死在那一个域名上，没有退路。那个域名当时的状态是：**回响应头不回响应体**（大文件一律空 / 截断到 4096 字节）。查看器文档因此停在 `readyState interactive`，`DOMContentLoaded` 不触发，`app/boot.mjs` 不跑，`eden-map:boot` 自然一条都没有——和「宿主挂上了、查看器不动」的现象完全吻合。同一现象在 Playwright 的 WebKit 与 Chromium 上都能复现（把那个请求挂住即可），所以不是 WKWebView 特有的问题。

**两处改动**（`map/tavern/host-routes.mjs`、`map/tavern/eden-map.js` + 新文件 `map/tavern/viewer-boot.mjs`）：

1. `swappable` 也认 gh 镜像域名（`cdn.jsdelivr.net` / `fastly.jsdelivr.net` / `testingcf.jsdelivr.net` / `gcore.jsdelivr.net` / `jsd.onmicrosoft.cn` / `cdn.jsdmirror.com` / `cdn.statically.io`）。这样「手改过 HOSTS 的脚本」也会走线路机制：钉了线路就用钉的，没钉就量一遍三条线路谁快用谁——卡住的域名自然输掉竞速。
2. 启动看门狗 `map/tavern/viewer-boot.mjs`：查看器文档挂上之后 15 秒还没有第一条消息，就是有子资源永远没取回 → 先在原域名重挂一次，再依次换 gh 镜像域名重挂，并在加载层上说明正在重试 / 换线路；域名换完只通报，出路留给界面上的「重试 / 换一条线路」。Chromium 从不触发（正常几十毫秒就有消息）。

**真机验证**（Mac TauriTavern 2.3.0，出厂跟随脚本 + head #333）：伊甸卡首帧 4.9 秒 / 2.6 秒 / 3.0 秒（三次），空白卡与切换聊天后都重新启动（`boot → ready → loaded` 齐全），全程无手工干预。

### 5.2 下次排查「地图在 TT 里出不来」的顺序（照这个层次查，别跳）

按层从下往上，任何一层断了下面都不用查。每层都有「怎么看」和「看到的现象」：

| 层 | 查什么 | 怎么看 | 断了会是什么样 |
|---|---|---|---|
| 1 入口 | 跟随脚本 import 的那个入口模块，**响应体是否完整** | `curl -o /dev/null -w '%{http_code} %{size_download} %{time_total}'` 同一个 URL，对每个 HOSTS 各来一次 | 200 但 `size_download` 为 0 或明显偏小：CDN 在只发响应头。地图连根都不会挂 |
| 2 查看器文档 | `viewer.html` 的响应体是否完整、`</html>` 是否收尾 | 同上，字节数应和本地文件一致 | 文档半截 → `DOMContentLoaded` 不触发 → 没有 `eden-map:boot`，面板停在「加载中…」 |
| 3 启动脚本 | 文档完整时，`app/boot.mjs` 有没有跑 | 看有没有 `eden-map:boot`；有则这层没问题 | 文档完整但没有 boot 消息，才轮到怀疑 iframe 被挂起 / `<base>` 时序 / 运行时换掉脚本上下文 |
| 4 子资源 | 文档里的模块、`vendor/openseadragon`、设定包数据，每个的响应体 | 抓包或逐个 curl；重点看大文件 | 文档起来了、DOM 也在，但画面不出来 / 一直「加载中」：某个子资源永远没落地（本次就是这一层） |
| 5 线路 | 以上都完整却极慢或时好时坏 | 同一 URL 在 3 条线路上各量 3 次 | 换线路就好 = 线路问题；`swappable` 现在会自己选 |

**两条硬规矩**（都是这次踩到的）：

- **不要用页内探针去读 3D 画布。** 在前台窗口里，地图正渲染 WebGL 场景时每 2–4 秒 `getImageData` 读一次画布，会把 WKWebView 的合成器拖死——本次把用户的 TT 卡住了（`~/eden-map-review/f-tt/th-probe.js` 的教训）。截图就用系统截屏（`/usr/sbin/screencapture`），不要从页内往外抠像素。
- **地图脚本不是驱动 TT 的工具。** 切卡、点悬浮按钮这类操作用 TT 自己的方式（`/go 卡名`，或真人点），别在探针里循环读主页面文档。

## 6. 分发和更新

| | TH 脚本（现在） | 扩展 |
|---|---|---|
| 安装 | 在 TH 里导入一段脚本（跟随引导 + 入口地址） | 扩展 → 安装扩展 → 填 Git 地址，整个仓库被 clone 下来 |
| 内容从哪来 | jsDelivr `@sha`。国内 jsdmirror 实测不可用，npmmirror 线是 DIST-1 | 加载器在克隆目录里，查看器和图片照旧从 CDN 取（原型就是这样做的） |
| 更新 | 跟随：每次打开取最新 head；或者钉住标签 | ST 走 `git pull`；TT 清空目录后重新拉取；清单里 `auto_update` 可以开自动更新 |
| 更新后 | 不用重启 | 要完全退出 TT 再打开（CCST 记着同一条） |
| 国内访问 | 取决于 CDN 线路（D15） | 还多一道坎：GitHub clone 在国内同样不稳，需要镜像仓库地址（未测） |
| 仓库体积 | 无关，CDN 按文件取 | 现在是死结：clone 一次约 944 MB |

**拆分后的扩展仓库（S10）**：一个小仓库。根目录放 `manifest.json`、加载器（取版本、`import` 入口、宿主适配层）、设置抽屉和斜杠命令，体积几十 KB。查看器、数据包和图片继续走 CDN / npm 线路。清单字段照 CCST 的形状写就行（`display_name`、`loading_order`、`requires`、`optional`、`js`、`css`、`author`、`version`、`homePage`、`auto_update`）。

**两种形态能不能并存**：能。加载器和脚本 `import` 的是同一个入口模块。要防的是同一个页面上跑出两份，现在的情况是白白加载两次，最后 TH 实例留下。可以设一个握手：扩展先在页面上放标记，卡内脚本的跟随引导看到标记就不再加载；反过来，扩展发现当前卡带有地图脚本时就让路。

**扩展形态的一个新问题**：扩展对所有卡都加载，相当于「全局脚本」，所以在不用地图的聊天里地图也挂着（实测 10/10 轮都在）。要么让加载器按卡判断（只在有设定包或用户勾过的卡上挂载，换卡时调入口的清理钩子），要么在扩展设置里加一个「只在这些卡上启用」开关。这与 S9-2「一个通用脚本」的设计不矛盾，只是缺一个开关。另外要加一条 owner id，否则自检会把扩展实例自己当成「另一个地图脚本」。

## 7. 得失对照

| 方面 | 扩展能得到的 | 扩展要付出的 |
|---|---|---|
| 性能 | 首帧提前 1.4–3.5 秒（冷），0–0.8 秒（热） | 内存相同 |
| 可靠性 | 不再受 TH 版本变动影响；没有 iframe 沙箱；**在 Mac TT 上实测能出图，脚本形态出不来** | 改为直接依赖 ST 的上下文接口，ST 也在变（1.19 已提示宏接口废弃）；TT 托管聊天界面要单独适配；§5 那个缺陷的根因还没定 |
| 新能力 | 在 ST 扩展列表里有正式设置抽屉；有斜杠命令；`setExtensionPrompt` 注入；用世界书事件做 JIT；偏好存 `extension_settings`；不装 TH 也能在普通卡上跑（实测） | — |
| 变难的 | — | 「只在某些卡上出现」得自己判断；TH 代办的生命周期、按钮、脚本变量都得自己做 |
| 维护 | 少一层 TH 适配 | 多一个仓库、一套清单版本，ST 和 TT 的更新方式还各不相同；更新后要完全退出 TT |
| 用户 | 设置入口在扩展列表里，比 TH 脚本库好找 | 多一步「安装扩展」；伊甸卡照样要 TH；国内要用镜像地址；更新后要完全退出重开 |

CCST 的经验（`/Users/davidzhao/dev1/cctest1/tavern/extension`）：清单放仓库根目录，入口不静态导入 ST 模块、一律通过 `getContext()` 取，所以装在全局、仅为我安装、插件副本三个位置都能跑（`docs/架构.md`）。TT 不能跑服务端插件（`docs/使用指南.md`），地图没有服务端部分，不受影响。TT 下网页剪贴板和网页下载都不能用（`CHANGELOG.md` 71–79 行），地图「导出设定包」也会碰到，与形态无关。未推送的扩展代码要靠 git 智能协议服务来安装（`ccst-tt-sweep/SKILL.md`），本次照这个办法做通了。CCST 没有测过扩展加载耗时，所以本文的加载时间只有我们自己的数字。

有一件事 CCST 的文档里**没有**记：「TT 更新扩展时会清空克隆目录只留 `.git`」。这条是待验证的，不要当成已知事实引用；本次是自己复现这个目录形态来测状态留存的。

## 8. 推荐

**选 A：v0.9.8 仍然用 TH 脚本，扩展放到发布之后，和 S10 拆分一起做。但把两件事提前。**

理由：

1. 速度收益很小。冷启动快 1.4–3.5 秒，热缓存基本持平，内存和事件延迟一样。TT 用户拿到的是 §5 那条（脚本形态出不来），不是速度。
2. 伊甸卡的 MVU 要 TH，玩家省不掉 TH。扩展不会让人少装一个扩展。
3. 前置条件还没到位：仓库 944 MB 装不了（要先 S10），37 个 TH 接口加一批裸全局还没收拢成适配层。
4. §5 那个缺陷要先按脚本形态修。查清楚之前动形态，等于把一个 bug 换成一个 bug。

提前做的两件事：

- **F-TT：查清并修掉「脚本形态的地图在 Mac TT 里查看器不出」**（§5）。这是 P0 级的地图缺陷，和形态无关。根因未定，先按「隐藏 iframe 被挂起 / 宿主令牌时序 / 嵌入运行时换掉窗口引用」三个方向查。估计 3–8 个 agent 小时，查不清就停下来报告。
- **F0：宿主适配层**，把所有宿主调用（37 个 TH 接口加裸全局）收进一个适配层，脚本形态行为不变。这件事扩展要用，而且脚本形态本身也受益。

如果 F-TT 查下来的结论是「这个缺陷是 TH 的 iframe 宿主路径固有的，换宿主就没事」，那就把 **B（v0.9.8 带一个可选加载器）** 提前，条件仍然是先有小仓库（否则装不上）和双开握手。

C（现在就切）不成立。

**将来做扩展的工作量估计（agent 小时）**：

| 步 | 内容 | 估计 |
|---|---|---|
| F-TT | 查清并修掉 TT 里查看器不出（见 §5） | 3–8（根因未定） |
| F0 | 宿主适配层，收拢调用，脚本形态行为不变 | 6–10 |
| F1 | 原生实现：事件、读楼层、变量、注入、世界书三种绑定、宏 | 8–12 |
| F2 | 扩展仓库，随 S10：清单、加载器、设置、按卡启用、防双开握手 | 4–6 |
| F3 | TT 专项：托管聊天界面、更新清目录、剪贴板 / 下载、Mac 和手机巡检 | 6–10 |
| | 合计 | 27–46 |

会改到的计划步骤：S10b（多一个扩展仓库）、阶段 F（拆成 F-TT / F0–F3；F0 可以先做，脚本形态也能受益）、DIST-1（列出扩展的镜像地址）、REL-DOCS 兼容矩阵（加一列「扩展 / 脚本」）、§6（把「在哪些卡上出现」列为发布前要做）。

## 9. 原型和原始数据

- 位置：`~/eden-map-review/ext-study/proto/`
  - `ext/`：扩展本体，带 `.git` 历史 0.0.1–0.0.12。
  - `driver.mjs`（本机 ST 的驱动）、`wkdrive.mjs`（WebKit 驱动，带网络时间线）、`wkmatrix.sh`（WebKit 冷热矩阵）。
  - `sink.py`（接收服务）、`tt.sh`（无 GUI 驱动 TT）、`th-fetch-probe.js`（跑在 TH 上下文里的探测）、`mk_nomap_card.py`（造关掉地图脚本的对照卡）。
  - `gitsrv.py`：本地 Git 服务（装扩展用）。
  - `results/*.json|log`：原始结果。`P-*` 是 WebKit 矩阵（3 冷 3 热，两种形态），`tt-*` 是 TT 真机各轮。
- 两种模式：
  - probe（默认）：只做测量，包括读楼层、读 `chat_metadata`、写一个测试键 `ext_study_probe`、记录查看器消息的时间。
  - loader：取 `head.json`，`import` 入口，挂垫片（实测挂了 155 个名字）。
  - 切换方式：斜杠命令 `/extstudy probe|loader|report`，扩展设置抽屉，或接收服务的指令。
- 在 TT 里怎么再跑一遍：
  1. `python3 gitsrv.py 8978`、`python3 sink.py 8980`。
  2. `bash tt.sh script on`（打开全局地图脚本）或 `off`。
  3. `bash tt.sh cfg '<json>'` 下发指令（形态、卡、要不要点悬浮按钮、要不要预置本机存储键）。
  4. `bash tt.sh relaunch`，等一到两分钟，看 `results/tt-*.json`。
  5. `bash tt.sh state` 看扩展目录外的状态；`bash tt.sh wipe && git -C <clone> reset --hard` 复现清目录更新。

## 10. 这次没做的事

- 没点 TT 的「安装扩展」「更新扩展」按钮（没有 GUI 操作手段），安装和更新都是按它们产生的目录形态复现的。
- 没拍 TT 界面截图（这台机器没有录屏权限），面板截图只有本机 ST 上那几张。
- 没测手机 TT（Mac 上的结果已经够定方向）。
- 没测 TT 托管聊天界面下的渲染清理（泄露防御网）。这一项在脚本形态下被 TH 的 `retrieveDisplayedMessage` 兜住了，扩展形态要另写。
- 没查清 §5 那个 TT 缺陷的根因。
- 没做「扩展仓库体积」的实测（要等 S10 拆出来才能量）。
- 没测 GitHub clone 在国内的可用性，也没测镜像仓库地址。