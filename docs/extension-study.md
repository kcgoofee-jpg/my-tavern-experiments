# 扩展形态研究（EXT-STUDY，阶段 F 的证据）

> 状态：**暂停（2026-10-02），未完成**。用户叫停。已完成的是本机 SillyTavern 上的对照测量、依赖清单和一次性原型；还没做的是 WebKit 冷启动重复测量、Mac TauriTavern 真机安装 / 更新 / 切聊天，以及手机（见 §8）。下面的推荐是**初步的**。原型和原始数据在 `~/eden-map-review/ext-study/proto/`，续做从那里接着跑。

本文要回答的是：地图从「酒馆助手（TH）外部脚本」改成「SillyTavern / TauriTavern 原生扩展」之后，要多付出什么，能多得到什么。原型代码不进仓库。

## 1. 目前能说的

- **Chromium 上差别不大。** 地图代码相同，扩展加载比 TH 脚本加载快：从打开聊天到地图首帧，冷缓存下约 6.0 秒降到 3.8 秒（各 2 次），热缓存下约 1.3 秒降到 0.5 秒（各 3 次）。内存、楼层事件延迟和注入有没有进提示词，两边看不出差别。快出来的部分只是启动时机不同：扩展在页面一启动就去取 head.json 和入口模块，TH 要等聊天打开、脚本 iframe 建好以后才开始。
- **WebKit 上差别可能大，但样本只有 1 次。** 冷启动（全新浏览器配置）：脚本 42.9 秒，扩展 4.8 秒；热缓存：脚本 9.8 秒，扩展 4.3 秒。**42.9 秒只测了一次**，原因还没查。Mac TT 用的是 WKWebView，所以这是最该补测的一项（§8）。
- **伊甸卡离不开 TH。** 卡里的 MVU 和「变量结构」本身就是 TH 脚本，`stat_data` 由它们来写。地图改成扩展以后，TH 照样要装。
- **现有代码原样搬过去能跑，但要靠一层垫片。** 地图直接调用 TH 注入到脚本 iframe 里的裸全局（`eventOn`、`tavern_events`、`getChatMessages`、`injectPrompts` 等），`fnOk` 也只认 `window` 上的全局。原型往主页面 `window` 挂了 155 个名字后，地图功能完整。没有 TH 时，13 个原生垫片也能让地图跑起来。这种做法不能拿去交付；真要改，是把所有宿主调用收进一个适配层。
- **现在的仓库装不成扩展。** 安装扩展就是 `git clone` 整个仓库，而本仓库打包后约 944 MB。扩展需要一个只放加载器的小仓库，清单放在根目录（S10 拆分）。

## 2. 实测

### 2.1 环境和方法

- 用的是本机 SillyTavern 1.19.0（`tavern/SillyTavern`）。数据目录用 `--dataRoot` 指到会话草稿目录，端口 8000，用户自己的 ST 数据没动。TH 4.11.2，和 Mac TT 里的版本相同。伊甸卡从 TT 复制一份，就是带「跟随 preview」地图脚本的那一版。浏览器是 Playwright 无头 Chromium 和 WebKit。
- 两种形态：
  - **S（脚本）**：卡内 TH 地图脚本照常加载。原型扩展只做被动测量（probe 模式）。
  - **E（扩展）**：卡复制一份，把卡内地图脚本关掉。原型扩展用 loader 模式自己取 head.json，`import` 同一个入口模块，再挂上垫片。
- 原型的安装和更新都走用户的那条路：用 `git http-backend` 搭本地 Git 服务（`http://127.0.0.1:8978/eden-map-ext.git`），通过 ST 自己的 `/api/extensions/install` 安装、`/api/extensions/update` 更新。
- 每一轮的步骤：
  1. 打开页面，冷缓存（清掉浏览器缓存再重载，WebKit 用全新配置目录）或热缓存。
  2. 选卡，等地图首帧（查看器发出 `eden-map:loaded`）。
  3. 打开面板，发两条 `/sendas`：一条带事件标签，一条拾取。
  4. `/addswipe` 加一个分支后左划。
  5. 干跑一次生成拿提示词，不发网络请求。
  6. 切到默认卡，再切回来。
- 内存取 Chromium 的 `Performance.getMetrics`（JS 堆、frame 数）。WebKit 拿不到这些数据。
- 「事件延迟」是酒馆事件触发后，查看器收到宿主第一条推送的时间。宿主自带 300 ms 防抖，所以两边都落在 250–290 ms，测到的其实是防抖。
- 版本说明：脚本那一轮按跟随规则加载到 head #302（`38be5a8`），扩展原型从 jsDelivr 分支 head.json 取到 #301（`e2dbea1`），两者差一个构建。查看器本身的加载两边一样，差的只是启动前那一段，所以对比不受影响。

### 2.2 结果

时间单位毫秒，从选卡后聊天打开（`CHAT_CHANGED`）算到地图首帧；内存是首帧后 15 秒时的 JS 堆。n 是样本数。

| 浏览器 | 缓存 | 脚本 S：首帧中位数（范围） | n | 扩展 E：首帧中位数（范围） | n |
|---|---|---|---|---|---|
| Chromium | 冷 | 5947（5440–6454） | 2 | 3793（3657–3929） | 2 |
| Chromium | 热 | 1253（1111–1516） | 3 | 477（476–685） | 3 |
| WebKit | 冷（全新配置） | **42917（单次）** | 1 | 4791（单次） | 1 |
| WebKit | 热 | 9815（单次） | 1 | 4265（单次） | 1 |

| 项目 | 脚本 S | 扩展 E | 说明 |
|---|---|---|---|
| JS 堆 MB（Chromium，首帧后） | 70–105（5 轮） | 66–96（5 轮） | 抖动主要来自动画和 GC，与形态无关 |
| frame 数 | 7–8 | 6–7 | 扩展少一个 TH 脚本 iframe |
| 回复后推送延迟 ms（面板开着） | 261–268（4 次） | 259–279（6 次） | 两边都由 300 ms 防抖决定 |
| 划卡后推送延迟 ms | 255–257（2 次） | 253–255（3 次） | 同上 |
| 事态摘要是否进入最终提示词（干跑） | 进入（6/6） | 进入（8/8；无 TH 的 2 轮另计，也进入） | 两边都以 `eden-map-events` 出现在 ST 的扩展提示词中 |
| 切到别的卡以后 | 地图卸下，切回再挂上 | **地图和悬浮按钮还在**（见 §2.3 问题 1） | |
| 没有 TH（扩展管理里关掉） | 不适用（脚本靠 TH 运行） | 能跑（2 轮）：首帧 425 / 1143，楼层事件和注入都正常，自检报「MVU 未加载」 | 注入键名见问题 2 |
| 同时开两种（扩展 + 卡内脚本） | — | 两份都会加载；`takeOver` 让后挂上的 TH 实例留下，自检报「检测到另一个地图脚本」（1 轮） | 防双开需要握手（§4） |

### 2.3 原型暴露的问题（正式改造时要修）

1. **扩展在不用地图的聊天里也挂着地图。** 切到默认卡以后，`#eden-map-root` 和悬浮按钮都还在（扩展形态 10/10 轮 roots=1、fab=true；脚本形态 0/7）。原因是扩展对所有卡都加载，相当于「全局脚本」，包门卫找不到包就退回通用包。脚本形态是卡内脚本，切卡时 TH 会把它卸掉。修法有两种，至少选一种：加载器按卡判断，只在有设定包或用户勾选过的卡上挂载，换卡时调用入口的清理钩子（`__edenMapCleanup`）；或者在扩展设置里加「只在这些卡上启用 / 所有卡」开关，默认只对有包的卡生效。这与 S9-2「一个通用脚本」的设计不矛盾，只是缺一个「在哪些卡上出现」的开关。
2. **没有 TH 时注入键变成 `eden_eden-map-events`。** 这是原型垫片的问题，与地图无关。原型的 `injectPrompts` 原生实现给 id 加了前缀 `eden_`，地图自己的 id 本来就是 `eden-map-events`，结果前缀重复。有 TH 时键名是 `eden-map-events`。注入内容和位置都对，最终提示词里也有。修法是直接用调用方给的 id，不加前缀。改了以后两种情况下键名一致，「看注入」「撤注入」类的代码就不用区分。
3. **`fnOk` 只看 `window`。** 在主页面上，TH 的函数只挂在 `TavernHelper` 命名空间里。于是自检报「缺 injectPrompts」「没有聊天变量接口」，注入和聊天变量都被静默关掉。原型靠把函数挂到 `window` 绕过去。正式改造时，所有宿主调用要用同一种取法。
4. **偏好取不到脚本变量。** 主页面上的 `getVariables({type:'script'})` 没有脚本 id，偏好只能存本机。扩展形态应该改存 `extension_settings`。
5. **没开卡内地图脚本也报「检测到另一个地图脚本」。** 无 TH 的那一轮里，自检把扩展实例自己的登记当成了另一份。这是身份判断的问题，扩展形态需要一个固定的 owner id。

### 2.4 更新与状态（ST 实测）

- 原型两次走 `/api/extensions/update`（`git pull`）：0.0.1 → 0.0.2 → 0.0.3，两次都成功。
- 更新后这几样都还在：`extension_settings.ext_study`（测量记录）、聊天元数据里的测试键 `chat_metadata.ext_study_probe`、本机 `localStorage` 里的模式开关。三者都不放在扩展目录里，所以「更新会不会清目录」影响不到它们。
- TT 更新会清空克隆目录，只留 `.git`。这是已知事实，本次没在 TT 上复现。地图的状态都在聊天变量、本机存储和自己的世界书里，本来就满足「目录里不放状态」。

## 3. 对 TH 的依赖清单和原生对应

「原型怎么接」是原型里实际的做法；「原生改造」是正式做扩展时的做法。地图代码里用 `fn('…')` 取的 TH 接口一共 37 个名字，另外还有一批裸全局。

| 用途 | 现在用的 TH / 宿主接口 | 原生对应 | 原型怎么接 | 原生改造量 |
|---|---|---|---|---|
| 运行位置 | TH 脚本 iframe，通过 `window.parent.document` 挂到主页面 | 扩展直接跑在主页面，`window.parent === window` | 不用接 | 无 |
| 楼层事件 | 裸全局 `eventOn` / `eventMakeLast` / `eventRemoveListener` + `tavern_events` | `getContext().eventSource.on / makeLast / removeListener`，`eventTypes` | 5 个函数 | 小 |
| 读楼层 | 裸全局 `getLastMessageId`、`getChatMessages(范围, {role})`（重算的主路径） | 直接读 `getContext().chat` | 有 TH 用 TH 的，没有就用 15 行原生实现 | 小 |
| 地图聊天变量 `eden_map` | `getVariables / insertOrAssignVariables / updateVariablesWith({type:'chat'})` | `chat_metadata.variables` + `saveMetadataDebounced`。TH 本来就存在这里，实测原生能读到 `eden_map` | 没有 TH 时用原生实现 | 小 |
| 偏好 `eden_prefs` | 脚本变量 `{type:'script'}` | `extension_settings.<键>` + `saveSettingsDebounced`，更新后不丢（实测） | 退回本机存储 | 小 |
| 卡的 `stat_data` | `Mvu.getMvuData`（MVU 是卡内 TH 脚本） | 读：`chat[i].variables[swipe_id].stat_data`；写：仍由 MVU 负责，离不开 TH | 主页面上本来就有 `Mvu` 全局（实测） | 读的部分小；写不归地图管 |
| 等 MVU 就绪 | `waitGlobalInitialized('Mvu')` | 查 `window.Mvu` | 用 TH 的 | 小 |
| 事态 / 状态行注入 | 裸全局 `injectPrompts` / `uninjectPrompts` | `setExtensionPrompt`。TH 的 `injectPrompts` 实测最后也写到这里 | 没有 TH 时用 4 行原生实现（见问题 2） | 小 |
| 世界书增补包、JIT、每个聊天的自定义书 | `getWorldbook / updateWorldbookWith / createWorldbook / replaceWorldbook / deleteWorldbook / rebind*Worldbook(s) / get*WorldbookNames` 等 14 个 | `loadWorldInfo / saveWorldInfo / getWorldInfoNames / updateWorldInfoList`（CCST 用的就是这一套）。绑定分三处写：`chat_metadata.world_info`、角色的 `extensions.world`、全局选中列表 | 用 TH 的 | 中，约 150 行 |
| 类宏 `{{eden_here}}` 等 | `registerMacroLike` | ST 的宏注册。1.19 里旧接口 `MacrosParser.registerMacro` 已在控制台提示废弃 | 用 TH 的 | 小，但要跟着 ST 版本走 |
| 渲染清理（泄露防御网） | `retrieveDisplayedMessage` | 直接查 `#chat .mes[mesid]`。TT 的托管聊天界面要注册参与者，TH 就是在清单的 `hooks.activate` 里注册的 | 用 TH 的 | 中，TT 专属 |
| 卡信息、卡正则自检、预设读取 | `getCharData`、`getTavernRegexes`、`getPreset` | `characters[characterId]`、`extension_settings.regex` + 角色的 `regex_scripts`、预设管理器 | 用 TH 的 | 小 |
| 斜杠命令、对外接口 | `triggerSlash`、`initializeGlobal('EdenMap')`、`eventEmit` | `executeSlashCommandsWithOptions`、直接挂 `window.EdenMap`、`eventSource.emit` | 用 TH 的 | 小 |
| 脚本库信息、脚本按钮、脚本 id | `replaceScriptInfo`、`appendInexistentScriptButtons`、`getScriptId` | 没有对应，也用不上：扩展有自己的清单版本、设置抽屉和斜杠命令（原型的 `/extstudy` 实测可用） | 取不到，静默跳过 | 删掉 |

到目前为止，没有发现哪一项是扩展做不到的。唯一做不了的是「卡的 `stat_data` 由谁写」，这一项本来就不归地图管：它由卡自己的 MVU 负责，而 MVU 需要 TH。

## 4. 分发和更新

| | TH 脚本（现在） | 扩展 |
|---|---|---|
| 安装 | 在 TH 里导入一段脚本（跟随引导 + 入口地址） | 扩展 → 安装扩展 → 填 Git 地址，整个仓库被 clone 下来 |
| 内容从哪来 | jsDelivr `@sha`。国内 jsdmirror 实测不可用，npmmirror 线是 DIST-1 | 加载器在克隆目录里，查看器和图片照旧从 CDN 取（原型就是这样做的） |
| 更新 | 跟随：每次打开取最新 head；或者钉住标签 | ST 走 `git pull`；TT 清空目录后重新拉取；清单里的 `auto_update` 可以开自动更新 |
| 国内访问 | 取决于 CDN 线路（D15） | 还多一道坎：GitHub clone 在国内同样不稳，需要镜像仓库地址（未测） |
| 仓库体积 | 无关，CDN 按文件取 | 致命：现在 clone 一次就是 944 MB |

**拆分后的扩展仓库（S10）**：一个小仓库。根目录放 `manifest.json`、加载器（取版本、`import` 入口、宿主适配层）、设置抽屉和斜杠命令，体积几十 KB。查看器、数据包和图片继续走 CDN / npm 线路。

**两种形态能不能并存**：能。加载器和脚本 `import` 的是同一个入口模块。要防的是同一个页面上跑出两份，现在的情况是白白加载两次，最后 TH 实例留下。可以设一个握手：扩展先在页面上放标记（原型用的是 `window.__edenMapLoader = 'ext'`），卡内脚本的跟随引导看到标记就不再加载；反过来，扩展发现当前卡带有地图脚本时就让路。

## 5. 得失对照（初步）

| 方面 | 扩展能得到的 | 扩展要付出的 |
|---|---|---|
| 性能 | 首帧提前 0.8–2 秒（Chromium）；WebKit 上可能更多，待补测 | 内存相同 |
| 可靠性 | 不再受 TH 版本变动影响；没有 iframe 沙箱 | 改为直接依赖 ST 的上下文接口，ST 也在变（1.19 已提示宏接口废弃）；TT 托管聊天界面要单独适配 |
| 新能力 | 在 ST 扩展列表里有正式设置抽屉；有斜杠命令；`setExtensionPrompt` 注入；用世界书事件做 JIT；偏好存 `extension_settings`；不装 TH 也能在普通卡上跑（实测） | — |
| 变难的 | — | 「只在某些卡上出现」得自己判断（问题 1）；TH 代办的生命周期、按钮、脚本变量都得自己做 |
| 维护 | 少一层 TH 适配 | 多一个仓库、一套清单版本，ST 和 TT 的更新方式还各不相同 |
| 用户 | 设置入口在扩展列表里，比 TH 脚本库好找 | 多一步「安装扩展」；伊甸卡照样要 TH；国内要用镜像地址；TT 更新扩展后要退出重开（CCST 记录） |

CCST 的经验（`/Users/davidzhao/dev1/cctest1/tavern/extension`）：清单放在仓库根目录，入口不静态 import ST 模块，一律通过 `getContext()` 取（`docs/架构.md`），所以装在全局、仅本人、插件副本三个位置都能跑。TT 不能跑服务端插件（`docs/使用指南.md`），地图没有服务端部分，不受影响。TT 下网页剪贴板和网页下载都不能用，要改走 TT 自己的接口（`CHANGELOG.md` 71–79 行），地图「导出设定包」也会碰到，不过这个问题与形态无关。手机 TT 打开聊天时，主进程 465 MB、CPU 87.7%，压力主要在渲染（`ab-tests/20260926-手机性能-2.json`），扩展形态改变不了这一点。未推送的扩展代码要靠 git 智能协议服务来安装（`ccst-tt-sweep/SKILL.md`），本次照这个办法做通了。

## 6. 初步推荐（待补测后定稿）

**倾向 A：v0.9.8 仍用 TH 脚本，扩展放到发布之后，和 S10 拆分一起做。**

- Chromium 上测到的收益只有首帧提前 1–2 秒，其余持平。伊甸卡的 MVU 要 TH，玩家省不掉它。
- 代价不在加载器（原型 198 行就跑通了），而在两件前置工作：仓库拆分（944 MB 没法 clone），以及宿主适配层（37 个 TH 接口加一批裸全局要收拢到一处）。
- **会改变推荐的情况**：如果 WebKit / TT 上脚本冷启动真的稳定在 10 秒以上，而扩展在 5 秒以内，那就该先查 TH 脚本在 WebKit 上为什么慢（跟随引导？TH iframe？）。如果是脚本这一侧的问题，在脚本形态里就能修，用不着扩展。如果查不出、修不掉，再考虑 B（v0.9.8 带一个可选加载器），但前提仍是先有小仓库。
- C（现在就切）不成立。

**将来做扩展的工作量估计（agent 小时，初步）**：F0 宿主适配层，收拢调用，脚本形态行为不变，6–10；F1 原生实现，含事件、读楼层、变量、注入、世界书三种绑定、宏，8–12；F2 扩展仓库，随 S10，含清单、加载器、设置、按卡启用、防双开握手，4–6；F3 TT 专项，含托管聊天界面、更新清目录、剪贴板 / 下载、Mac 和手机巡检，6–10。合计 24–38。会改到的计划步骤有：S10b（多一个扩展仓库）、阶段 F（拆成 F0–F3；F0 可以先做，脚本形态也能受益）、DIST-1（列出扩展的镜像地址）、REL-DOCS 兼容矩阵（加一列「扩展 / 脚本」）。

## 7. 原型

- 位置：`~/eden-map-review/ext-study/proto/`。
  - `ext/`：扩展本体，带 `.git` 历史 0.0.1–0.0.3。
  - `driver.mjs`：测量驱动。
  - `matrix.sh`、`matrix2.sh`：已跑完的轮次。
  - `wkcold.sh`：WebKit 冷启动重复测量，未跑完。
  - `summarize.py`：汇总。
  - `gitsrv.py`：本地 Git 服务。
  - `results/*.json|log`：原始结果。
  - 面板截图在上一级目录。
- 两种模式：
  - probe（默认）：只做测量，包括读楼层、读 `chat_metadata`、写一个测试键 `ext_study_probe`、记录查看器消息的时间。
  - loader：取 head.json，`import` 入口，挂垫片。
  - 切换方式：斜杠命令 `/extstudy probe|loader|report`，或者扩展设置抽屉。
- 续做时先把服务搭起来：`git clone --bare ext srv/eden-map-ext.git`，然后 `python3 gitsrv.py 8978`，再按会话草稿里的做法起一个独立数据目录的 ST（`node server.js --port 8000 --dataRoot <目录>`，卡从 TT 复制，`settings.json` 从本机 ST 复制）。
- 装在哪里：只装在这次的独立 ST 数据目录里，那个目录在会话草稿下，可能会被清掉。用户的 TT 和用户自己的 ST 数据目录里都没有装，也没有改。

## 8. 续做清单

- [ ] WebKit 冷启动：脚本、扩展各 3 次（每次用全新配置目录），给出中位数和范围；如果脚本仍然慢，按阶段拆分耗时（跟随引导取 head、TH iframe 启动、入口 import、查看器）。
- [ ] Mac TauriTavern 真机：从 Git 地址安装原型，测地图首帧（脚本 / 扩展），切聊天，做一次「更新扩展」，确认目录被清空后状态还在；不超过 30 分钟。上次去做时，TT 里正好有一个生成在跑，所以没有动手。
- [ ] TT 托管聊天界面下的渲染清理（泄露防御网）。
- [ ] 带真模型回复（MVU 写入 `stat_data`）的一轮：逐楼比对原生读 `chat[i].variables[swipe_id].stat_data` 和 `Mvu.getMvuData`。
- [ ] 手机 TT（Mac 结果确实有优势时再做，控制在 20 分钟内，不强杀手机 TT）。
- [ ] 补测后定稿 §6 推荐，回答 Q-29。
