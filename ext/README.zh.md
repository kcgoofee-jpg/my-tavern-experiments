# 世界地图扩展加载器（F2）· 中文版

> 状态：v0 加载器，随 S10 拆分发布。英文版的对照：`README.md`（政策：新文档英文为准，这份是给用户看的中文镜像）。
> 依据：`docs/extension-study.md`（实测与结论）、`docs/delivery.md`（DIST-3 交付线路）。

## 这个目录是什么

`ext/` 整个目录就是将来的扩展仓库（S10 拆分时成为新仓库的根目录）。酒馆「安装扩展」就是把一个仓库
`git clone` 下来，根目录必须有 `manifest.json`；主仓库约 944 MB（含美术）永远装不成扩展，所以加载器单独放。

| 文件 | 作用 |
|---|---|
| `manifest.json` | 扩展清单（照 CCST 的字段形状）；`auto_update` 先关——TT 更新后本来就要完全退出重开 |
| `index.js` | 加载器：取版本 → 校验完整性 → 换上原生适配层 → import 引擎入口 → 按卡启用 → 双开握手 |
| `loader-core.mjs` | 纯计算层（线路表、地址、head 校验、卡名单、完整性判定），单测在 `tests/f2_ext_loader.test.mjs` |
| `style.css` | 只管设置抽屉的行和失败提示条；地图界面样式还是引擎自己的 |

## 加载流程（为什么安全）

1. 三条 gh 线路各问一遍 `head.json`，取构建号最大的，然后按那个提交号钉死。
2. 取分支上的 `map/data/integrity.json`（每次推 head 由 `tools/bump_head.py` 自动重算），它的 `head_sha`
   要和第 1 步的提交号对得上。
3. **import 任何东西之前，清单里的每个代码文件先逐个取回、算 SHA-256 比对**。任何一处在取不到 / 对不上，
   一律失败关死：什么都不 import，只给一句人话提示。（思路取自 `ykny12058/ilw-native-owner`，只取思路。）
4. 从同一线路、同一提交号 import 适配层，把 F1 的原生实现换进 `hostAdapter` 单例——引擎所有宿主调用即刻
   改走酒馆原生接口，业务模块一概不动。
5. import 和脚本形态完全相同的引擎入口。查看器、设定包、底图照旧走 CDN。

线路顺序：`cdn.jsdmirror.com/gh` → `cdn.jsdelivr.net/gh` → `fastly.jsdelivr.net/gh`，每条 10 秒超时换下一条。
`statically.io` 和 `raw.githubusercontent.com` 继续不用（F-TT / DIST-3 的实测数字）。

## 双开握手（两种形态不会同时挂）

- 扩展一启动就在页面上置 `__edenMapExtInstalled`；卡内脚本的入口看到这个旗标就什么也不挂。
- 反向：扩展挂载前查 `__edenMapIds`（脚本的实例登记表），页面上已经有活着的脚本实例就让路并说明。
- 换形态要完全退出重开（TT 的 `/reload-page` 不重载扩展 JS）。

## 只在选定的卡上出现

扩展设置抽屉里有「只在选定的卡上启用」：关（默认）= 所有卡都挂，和现在的全局脚本一致；开 = 只挂名单里的卡
（一行一个卡名或编号）。注意：扩展装着的时候脚本形态整体让路，所以名单外的卡两种形态都没有地图——这正是
「只在这些卡上」的效果。设置存在 `extension_settings.eden_map_ext`，清空扩展目录重装也还在（实测，
`docs/extension-study.md` §3.5）。

## 国内安装：镜像地址与 zip 兜底

- 「安装扩展」要 `git clone`，GitHub 直连在国内不稳（`docs/extension-study.md` §6）。镜像仓库地址**还没实测**
  （Q-32c 开放项）：把扩展仓库镜像到能连上的地方（例如同步一份到 Gitee，或用你的代理地址），安装时填那个地址。
- 不想用 git 的兜底：下载仓库 zip（任意可达镜像上的 `.../archive/refs/heads/main.zip`），解压后把内容放进
  `data/extensions/third-party/eden-map-ext/`（这个目录根部就是 `manifest.json`），然后完全退出重开酒馆。
- 加载器只有几十 KB，clone 难只难在这一步；地图本体照旧走 CDN 线路。

## 备选路线（记录，不发）

扩展可以自带一份 MVU 构建，让不带 TH 的普通卡也能跑地图（实测能跑，`docs/extension-study.md` §3.3）。
现在的决定：**不 fork MVU**。伊甸卡的 `stat_data` 本来就由卡内 MVU 脚本写，伊甸卡离不开 TH；fork 会漂移。
只有将来出现「完全不带 TH 的设定包」需求再议。

## 真机清单（用户在 TT / ST 上做，逐项打勾）

1. [ ] S10 拆分后（或临时从本目录手动复制），扩展目录进 `data/extensions/third-party/`；完全退出重开。
2. [ ] 扩展列表里出现「世界地图」，打开设置抽屉；不动任何开关，重开一次确认设置在（`extension_settings` 留存）。
3. [ ] 打开伊甸卡聊天：等地图悬浮按钮出现；控制台应有一条 `[eden-map-ext]` 开头的挂载日志。
4. [ ] 同一张卡上酒馆助手的地图全局脚本保持**开着**：验证地图只挂一份（脚本入口应安静不挂；页面上没有「检测到另一个地图脚本」的自检警告）。
5. [ ] 扩展设置勾「只在选定的卡上启用」，名单只写伊甸卡名 → 切到别的卡地图消失、切回来出现；名单清空重测。
6. [ ] 断网 / 把三条线路都挡掉再开聊天：应看到一句人话失败提示，而且什么都不挂（失败关死）。
7. [ ] `/edenmap status`、`/edenmap off` 可用（ST 暴露 `registerCommand` 时；不可用不算故障，跳过）。
8. [ ] 换线路（下拉选 Fastly）后完全退出重开，控制台日志里的 host 跟着变。
9. [ ] 手机 TT 打开同一张卡，地图能出（只看不测性能；手机数据留给 F3）。

任何一步不符合预期：记下控制台第一行错误，回报到 `docs/todo.md` 的阶段 F 条目。
