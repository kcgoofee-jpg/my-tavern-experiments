# 兼容性一览（REL-DOCS，D25–D27、D29 · B18）

状态：2026-10-06。每一行要么带实测出处，要么明写「未实测」。这里不搬文档推测——仓库里没有数字的地方就写没有。

## 1. 宿主

| 宿主 | 实测版本 | 内核 | 结果 | 出处 |
|---|---|---|---|---|
| SillyTavern + 酒馆助手脚本 | ST 1.19.0、TH 4.11.2 | Chromium | 可用；脚本形态冷启动首帧 5.9 s、热启动 1.3 s；`boot → ready → loaded` 三段都到位 | `docs/extension-study.md` §2–§3、RESULT EXT-STUDY |
| TauriTavern（Mac）+ 酒馆助手脚本 | TT 2.3.0、TH 4.11.2 | WKWebView | 可用；伊甸卡首帧 2.6 / 3.0 / 4.9 s，空白卡与切换聊天后同样出画面，全程无需手动干预 | `docs/extension-study.md` §9（真机复测）、RESULT F-TT |
| F-TT 修复之前的 TauriTavern | TT 2.3.0、TH 4.11.2 | WKWebView | 脚本跑 6 次，悬浮按钮和面板都挂上了，但查看器一次都没出第一帧（其中 5 次 30 秒时按钮变「预加载失败」）。根因是一条只回头不返体的 CDN 镜像，不是 TT、也不是脚本形态 | `docs/todo.md` I-36、RESULT F-TT（`9aec8fd3`） |
| 手机 TauriTavern | — | — | **未实测** | `docs/plans/spatial-os-log.md` Q-32 |
| 没有酒馆助手（宿主不提供脚本 API） | — | Chromium | 能跑：地图挂载并画图，首帧 425 ms / 1143 ms，自检报「MVU 未加载」；需要宿主的能力自己关掉（状态行注入、宏、世界书同步、聊天监听、出图） | `docs/extension-study.md` §4（"no TH" 那行）、`map/tavern/host-adapter.mjs` 能力探测 |
| 伊甸卡（带 MVU 世界） | 卡「母畜庄园 Yehehua二创版V1.5」 | 两者 | 设定包直接读卡自己的 MVU；测试聊天 170 多楼 | `docs/extension-study.md` §2 |
| 不带 MVU 的卡 | — | 两者 | 能跑：`map/tavern/pack-gate.mjs` 用卡与聊天正文推导出自动设定包（`map/core/grow.mjs`），地点来自剧情里写到的地方 | `map/tavern/pack-gate.mjs`、`map/core/grow.mjs` |

## 2. 交付形态：现在是脚本，扩展随后

| 形态 | 本次发布状态 | 依赖 | 出处 |
|---|---|---|---|
| 酒馆助手导入脚本（`map/tavern/eden-map.js`） | 正式发布的就是这一种 | 支持酒馆助手的宿主（ST 或 TT），一行导入 | Q-29 于 2026-10-03 定为 A：扩展形态只快 1.4–3.5 s（冷）/ 0–0.8 s（热），其余持平 |
| ST / TT 原生扩展（`ext/index.js` 加载器） | 代码已写，发布时不装；随 S10b 拆分上线 | 需要一个独立的小仓库，而当前 944 MB 的仓库挡住了 | `docs/extension-study.md` §6–§8、`ext/README.md` |

两种形态都从同一张仓库线路表取代码、都按提交号钉死（`docs/delivery.md` §3）；扩展加载器额外逐文件校验
`map/data/integrity.json`，对不上就失败关死。

## 3. 浏览器能力

| 能力 | 用在哪 | 硬依赖还是可降级 | 缺了会怎样 |
|---|---|---|---|
| ES 模块 + 动态 `import()` | `map/viewer.html` 入口、`map/app/boot.mjs` | 硬 | 地图起不来 |
| import map（只有三维页用） | `map/props/viewer3d.html`、`map/estate/index.html`，注入前重写成随仓的本地库（`map/app/subpage3d-host.mjs`） | 三维页硬依赖，二维地图不涉及 | 三维子页显示失败态；二维地图照常 |
| WebGL | `map/three/render-context.mjs`（上下文由 three.js 选；二维地图用 `getContext('2d')`） | 只有三维视图硬依赖 | 三维视图报 "webgl" 并保持不可用；上下文丢失有处理 |
| `srcdoc` iframe + `postMessage` | `map/tavern/eden-map.js` | 硬 | 查看器出不来（I-36 那个缺陷就是这个表现） |
| `localStorage` | `map/core/storage.mjs`（不抛错：读不到返回 null，写不进返回 false） | 软 | 设置与缓存记不住，地图照常跑 |
| `navigator.connection` / saveData | `map/app/sharpness-tiers.mjs` | 软 | 分级改看屏幕尺寸与 `deviceMemory`；iOS WebKit 两个都没有，走 `touchUnknown` |
| `OffscreenCanvas`、`ResizeObserver`、`AbortController` | `map/core/room-gallery-db.mjs`、`map/app/boot.mjs`、各 fetch 助手 | 软，取用前先探测 | 对应的小功能跳过，不弹错误 |

## 4. 屏幕尺寸

| 尺寸 | 状态 |
|---|---|
| 1440 × 900 桌面 | 基准尺寸（探针 preset `desktop`） |
| 375 px Chromium | 每次改动过一遍（探针 preset `phone`）；断点在 640 与 1180 px，点按区 44 px |
| iPhone / 手机宿主 | 不做专门适配，按用户反馈修。探针集里有 WebKit iPhone 13（375 × 812） |

## 5. 画质与省流档位（代码里真实使用的数字）

| 档位 | 二维像素上限 | 缩放 | DPR 上限 | 定义处 |
|---|---|---|---|---|
| `save` | 2000 px | 1.0 | 1.25 | `map/app/sharpness-tiers.mjs` |
| `std` | 4000 px | 0.8 | 2 | 同上 |
| `hd` | 8000 px | 0.5 | 3 | 同上 |

- 默认 `hd`；当 `deviceMemory` ≤ 4 GB、系统省流打开、或网络报 2g/3g 时自动降到 `std`。
- 显存预算（`map/core/graphics-budget.mjs`）：low 256 MB、mid 512 MB、high 1024 MB，默认 512 MB；内存 ≤ 4 GB
  或「触屏 + 小屏」判为 low，核数 ≤ 4 或 `maxTextureSize` < 8192 判为 mid；新增资产接受的线是 85 % 与 70 %。
- 三维（`map/three/render-context.mjs`）：low 为 DPR 1.25 且不开抗锯齿，mid 为 DPR 2 且开，high 不限 DPR 且开；
  `edenMap3dQ` 取 1 时强制 DPR 1，取 2 时封顶 DPR 2。
- 运行态没有采样数（spp）这一项——16 / 64 / 128 / 512 spp 只属于离线 Blender 出图。

## 6. 网络行为

| 项目 | 数值 | 定义处 |
|---|---|---|
| 交付线路 | jsdmirror → jsDelivr → fastly，仓库与 ref 不动，只换 host | `map/tavern/host-routes.mjs`（`GH_LINES`） |
| 加载器每条线路的超时 | 10 s，超了就换下一条 | `tools/build_preview_script.py`、`ext/index.js` |
| 测速算法 | 真读完响应的「字节 / 毫秒」；小于 32 KiB 的响应算无效测量；要快过当前线路 1.3 倍才换 | `map/tavern/host-routes.mjs` |
| 线路结果有效期 | 24 小时；手动选过的线路不到期，清掉标记前一直用 | 同上 |
| 启动看门狗 | 查看器文档起来 15 s 还没消息就重挂：先原地址一次，再走最多 3 条备选线路，并在加载层里说清楚 | `map/tavern/viewer-boot.mjs` |
| 瓦片全挂 | 每 2 分钟窗口只自动换一次线 | `map/tavern/eden-map.js`（`nextRoute`） |

## 7. 已归档的实测耗时

| 测的是什么 | 数字 | 出处 |
|---|---|---|
| 各条交付线路的首帧（新鲜上下文、stub 宿主、直接 import 远端入口） | Chromium：fastly 2.9 s / jsDelivr 3.1 s / jsdmirror 5.3–6.6 s（括号里的挂载数在 `docs/delivery.md` §2）；WebKit：jsDelivr 3.4 s / jsdmirror 5.3 s / fastly 6.4 s | `tools/browser/dist3_load.mjs`，2026-10-04 |
| 聊天消息 → 宿主外壳挂上、外壳 → 第一帧 | 3385 / 1824 / 1572 / 1567 ms 与 4964 / 3119 / 3495 / 3357 ms | `docs/extension-study.md` §3.1 |
| 本地服务器回归（这些数字不能搬到 CDN） | 冷遮罩 456 → 458 ms、首张瓦片 60 → 58 ms、庄园三维首帧 440 → 464 ms、流量 −35 % | `docs/perf/v2.md` |
| 预算目标 | 省流首屏 ≤ 3 s、单层标准 ≤ 1.5 MB、手机三维 ≥ 30 fps | `docs/archive/README-2026-09-30.md` |
| 上面那行回归在真实 CDN / TT 里的对应值 | **未实测** | `docs/perf/v2.md` |
| 30 MB 贴图解码内存 | **估算，未实测** | `docs/reviews/perf_095/mobile_webkit.md` |

## 8. 已知未验证（不要对这些向玩家承诺）

| 项 | 缺什么 | 记在哪 |
|---|---|---|
| Q-32c 扩展的国内镜像 / zip 兜底地址 | 只作为选项写进文档，没测过 | `docs/delivery.md` §6、`docs/plans/spatial-os-log.md` RESULT F2 |
| 手机 TauriTavern | 一次都没跑 | `docs/plans/spatial-os-log.md` 的 Q-32 范围 |
| 阶段 B 与阶段 D 的真酒馆实测 | 清单已写，等用户回填 | `docs/todo.md` §3 Stage B / Stage D、`~/eden-map-review/f3-tt/TT手动检查清单.md` |
| `chat_iso` 探针 | 4 个红项记录在案、尚未修 | `docs/plans/spatial-os-log.md` 的 U-FIX 块 |
| 功能 F-18 / F-43 / F-51 / F-62 | 标注为等真机测试 | `docs/feature-inventory.md` §4 |
| `docs/perf/v2.md` 在真实 CDN 或 TT 里复现 | 只有本地数字 | 该文件 |

## 9. 玩家应该看到的声明（D25–D27）

| 声明 | 出现在哪 |
|---|---|
| 代码 MIT；伊甸内容全部权利保留，按原卡作者 2026-09-27 的授权使用 | `LICENSE`、`docs/licensing.md`、设定包的 credits |
| 18+ 提示：分级由设定包声明，引擎不认识任何卡的内容边界，也不做过滤或审查 | README 两个版本、设置里的「内容分级」行（`s.lic_adult_v`）、`docs/licensing.md` |
| AI 参谋的密钥保存在这台浏览器的本地设置里，同一页面运行的脚本都能读到它 | 设置里密钥字段旁的提示（`fc.nav.key_notice`） |
| 原始角色卡作者署名（Yehehua） | 设定包的 credits，在「关于」面板显示 |
