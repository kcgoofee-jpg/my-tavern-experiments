# 用户可见文案盘点（COPY-1，2026-10-03）

> COPY-1 的任务产物：地图上用户能读到的每一类文字、在哪里发射、按 COPY-1 标准评级的结果。
> 评级标准见 `docs/copy-style.md`；门控在 `tools/check_copy.py`（smoke 内跑）。改写只动 zh 先、en 镜像。
> 结论先行：**盘点约 960 条用户可见字符串（i18n 字典 828 键 + 包 strings 27 键 + 代码内发射约 110 条），
> 不合格改写 34 处**（含两处结构性改写：更新提示正文、世界书同步提示），其余达标。
> 反馈报告（`app/feedback-report.mjs`）是诊断文本，按调试视图处理，不在此门槛内。

## 1. 文案面与发射点（surface → 拥有模块）

| 表面 | 拥有模块 | 条数（约） | 评级 |
| --- | --- | --- | --- |
| i18n 字典（zh / en 镜像） | `map/i18n/zh.json`、`en.json`；`app/i18n.mjs` 加载，`data-i18n*` 与 `uiTextOr()` 渲染 | 828 键 | 改 22 键 |
| 包 strings（可覆盖字典） | `map/packs/eden/manifest.json` §strings；`core/locked-strings.mjs` 锁死 AI 参谋同意书等 | 27 键 | 达标 |
| 宿主 toast（唯一通道） | `tavern/host-checks.mjs hostToast` → `ui/notice.mjs`（P0 卡 / P1 横幅 / P2 药丸）；挂掉时 `eden-map.js fallbackToast` | 12 处 | 改 4 处 |
| 更新提示（更新后第一条） | `tavern/selfcheck.mjs updatePromptText / forceText` + `host-checks.mjs showUpdPrompt` + `host-about.mjs checkUpdate` | 4 处 | 结构性改写 |
| 世界书同步提示 | `tavern/host-tavernhelper.mjs`（写成功 / 每聊天版本提醒） | 4 处 | 改 2 处 |
| 开场自检卡 | `tavern/splash.mjs`（勾叉记号、页脚版本行） | 8 处 | 改 2 处 |
| 自检条目 | `tavern/selfcheck.mjs evaluate()`（设置 › 自检、开场卡共用） | 24 条 | 改 9 条 |
| 通知层组件内置词 | `ui/notice.mjs`（关闭 / 详情 / 共 N 条） | 5 条 | 达标 |
| 首次使用横幅 | `app/notice-layer.mjs firstRunHint` | 4 条 | 达标（与「当前位置」按钮名一致） |
| AI 参谋同意书 / 功能卡 | `app/ai-nav-form.mjs`（锁死文案）、`app/feature-card.mjs`（REASON_ZH 13 条 + 状态行） | 20 条 | 达标；状态字形是 aria 图标，不是文字 |
| 设置帮助 / tooltip | `app/settings*.mjs`、`settings-pages.mjs`、`viewer.html`（data-i18n 兜底） | ~120 条 | 达标（抽查） |
| 反馈报告 | `app/feedback.mjs` + `feedback-report.mjs` + `core/logbuf.mjs` | 10 条 | 诊断文本，豁免 |
| 宿主嵌入面板 | `tavern/host-lifecycle.mjs`（时间轴回放 / 加载态 / 换线路） | 12 条 | 达标 |
| 三维庄园页 | `map/estate/main.js` 内嵌 zh/en 表（独立于主字典） | 12 条 | 达标（「›」是文字内尖角，不算图标） |
| 世界书 readme / 自定义书 | `tavern/worldbook-readme.mjs`；随包条目 `tools/build_worldbook_addon.py` | 10 条 | 达标（head #N 是报 bug 要的版本号） |
| 各视图兜底中文 | 50 个文件约 440 处 `uiTextOr('k', '中文')` | ~440 | 抽查达标 |

## 2. 改写清单（COPY-1，zh → 新文案；en 镜像同步）

### 2.1 更新提示（用户点名「看不懂」的那条，结构性改写）

- 旧：标题 `地图有新版 v0.9.7 · S1-0100-R-0100`（内部构建编码示人）；正文只有「怎么更新」；「更新说明」链到
  GitHub 的 CHANGELOG.md（提交主题，不是给人看的）；跟随分支的提示正文是 `分支最新构建 #319 · bb98ac1c`（构建号 + 提交号示人）。
- 新（`selfcheck.mjs updatePromptText` + `host-checks.mjs showUpdPrompt`）：
  - 标题 `地图有新版 v0.9.7`（版本号本身就是版本）；
  - 正文 = 一两行「这次改了什么」（正式版 `build.json` 的 `notes` 字段，发版时手写的 1–3 行短句，
    `tools/version_code.py` 原样保留该字段；没有就只说怎么更新）+「怎么更新」一行；
  - 构建编码与提交号不再上屏（诊断在 设置 › 关于 的「版本编码，点击复制」里）；
  - 跟随分支的提示：`有更新，刷新载入 / 刷新酒馆页面就会用上。`（无构建号无 sha）。
- 强制更新（`forceText`）保留 CHANGELOG 链接（那一版需要细节与理由，属罕见路径）。

### 2.2 世界书同步提示（`host-tavernhelper.mjs`）

- 写成功：`「v122 → v124（新增 3、更新 1、保留你改过的 2）/ 可在 设置 › 数据与映射 关掉」`
  → `新增 3 条、更新 1 条；你改过的 2 条保持原样。`（哪本书在标题里；版本号跳变和关闭入口撤掉——关入口在设置里本来就有）。
- 每聊天版本提醒：去掉版本号对（`v122 → v124`），只留结论「旧地名照样认；新版不再用的条目只降了优先级，没删。」。

### 2.3 词典（zh，en 镜像见 `tests/i18n_s44_parity.test.mjs` 的 COPY1 表）

| 键 | 旧 | 新 | 原因 |
| --- | --- | --- | --- |
| `ev.glitch` | ⚠ 数据链路受扰 | 数据链路受扰 | 字形 |
| `s.sc_warn` | 自检 {n} 项 ⚠ | 自检 {n} 项需要注意 | 字形 |
| `selfcheck.wb_go` | 一键写入世界书 | 写入世界书 | AI 腔 |
| `fc.wbJit.more` | 只动我们自己的附加世界书 | 只动地图自己的附加世界书 | 「我们」 |
| `ch.src_mvu` / `s.src_mvu` / `s.chsrc_mvu` | MVU（变量） | 聊天变量 | 内部术语 |
| `vm.mode_mvu` / `vm.mode_partial` / `vm.mode_tags` | MVU… | 聊天变量… | 内部术语 |
| `s.mode_mvu` / `s.mode_mvu_partial` | MVU 全部 / 部分字段 | 聊天变量全部 / 部分字段 | 内部术语 |
| `ch.infer_pre` / `ch.pre_tip` | …按聊天标签 / MVU 更新；卡的 MVU 初始变量 | …按聊天标签和变量更新；卡的初始变量 | 内部术语 |
| `here_ph` | 模拟 MVU：世界.当前地点 | 模拟当前地点 | 内部术语 |
| `um.done` | 「{n}」→ {k} | 「{n}」已放到「{k}」 | 箭头当分隔符 |
| `about.build_line` | 当前构建 head #N · {sha} · {t} | 当前构建 head #N · {t} | 提交号不上屏 |
| `_093` | MVU 联动 | 聊天变量联动 | 内部术语（注释键） |

### 2.4 自检条目（`selfcheck.mjs`，9 条）

- 「MVU 变量框架未加载…」→「聊天变量框架未加载…」；「MVU 里没有…」→「变量里没有…」；
- 「MVU 可读」→「聊天变量可读」；「MVU 没有 在场人物 / …」→「变量里没有 …」；
- 「读法：MVU…」→「读法：聊天变量…」；
- 冲突行「#N 楼 MVU「x」≠ 标签「y」（按 MVU）」→「第 N 楼 变量「x」≠ 标签「y」（以变量为准）」。

### 2.5 自检警告 toast 与开场卡（`host-checks.mjs`、`splash.mjs`）

- 自检警告行首的 `⚠ ` 前缀去掉（状态在颜色与文字里）；
- 开场卡清单记号 `✓ ⚠ – i` → 中性圆点（`·`；状态由行颜色与文字表达）；页脚去掉构建编码，只留 `v0.9.7 · 跟随 preview`。
- 保留：功能卡状态字形（`feature-card.mjs` ICONS 的 `✓ ! ◷ –`）——它们是 aria-labelled 的状态图标
  （`.fci` 圆形徽标），不是文字，且承担「不只靠颜色区分」的无障碍职责；等 UI-COH 的图标集补上状态图标后再换。

## 3. 保留不动（有意的例外）

- `pack.copy_done` 里的 `spatial_os:pack`：用户必须照抄进条目标题的 id（导出流程的一部分）。
- 世界书 readme 的 `head #N`：报 bug 要附的版本号；readme 本身是技术说明书。
- 「关于 / 更新与版本」页的 `head #N`：它就是这个项目现在的版本号（重构期不发达版本号，见 docs/versioning.md）。
- 反馈报告里的 `MVU 快照`、`✓/⚠` 记号：诊断文本（调试视图）。
- `tr.en_route` / `tr.trip` 的 `A → B`：表意「从哪到哪」的方向，不是装饰。

## 4. 门控

`tools/check_copy.py`（smoke 内两步：正查 + 自测）——扫描词典值、包 strings、明列的发射文件：
① emoji / 装饰字形（U+2600–27BF、U+2500–25FF、emoji 平面、VS16）；② AI 腔短语表（我们为您 / 已为你 / 一键 /
轻松… / 全角叹号）；③ 内部术语（MVU / JIT / ledger）与非版本面的 `head #N`。豁免与图标表（aria 图标）见文件头注释。
