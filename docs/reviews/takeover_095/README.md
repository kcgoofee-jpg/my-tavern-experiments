# 接手记录：三路代码 review（2026-09-27）

一次换人接手时做的全仓 review。方法：三路独立审阅（运行时酒馆脚本 / 查看器与界面 / 工具链与测试），
都只读、不改文件，逐条给 `文件:行` 与失败场景；再由接手方按「发版前必须清 / 可留到后面」筛一遍并动手修。

| 路 | 范围 | 主要结论 |
|---|---|---|
| A 运行时 | `map/tavern/*.mjs`、`eden-map.js`、`map/{here,chars,trips,section,varmap}.js` | 无 P0；纯函数分层与单测质量高于同类项目，隐私约定（只连自己选的 CDN）经审计成立。风险集中在**宿主生命周期**（后台预加载、页面内换版本）与**生成路径上的每次重算** |
| B 查看器 | `map/viewer.html`、`map/*.js`、`map/ui/tokens.css`、`tools/browser/*` | 见 `viewer_ui.md` |
| C 工具链 | `tools/*.sh|*.py`、`tests/*.test.mjs`、仓库卫生与发版链路 | 单测是真的（11/11，导入生产模块）；DZI 金字塔当前完整；**弱点全在发版链路**：验证的是工作区而不是提交、五个地方的版本号无人核对、CDN 失败不致命 |

## 发版前已修（本次提交）

- **P1 后台预加载吃掉未读水位**（A-1）：`eden-map.js` `sendEvents()` 用 `!panel.hidden` 判断「用户在看」，
  而预加载只加 `visibility:hidden` 的 `.em-ghost`，`panel.hidden` 仍是 false → 水位推到最新并持久化，
  红角标与「打开飞向最新未读」永久失效（iPhone 走省流路径不预加载，所以手机上试不出来）。
  现在 `visible = !panel.hidden && !ghost`，且 `floorNow < 0` 不写水位。
- **P1 页面内换版本留下第二个活实例**（A-2）：`cleanup` 没摘 `eventOn` 监听、也没有 dead 标志，
  旧闭包继续 push/recompute/saveRoot，会把切换前的 `custom` 写回去、冲掉用户刚改的名字。
  现在 `listen()` 登记句柄，`cleanup` 里 `unlisten()` + `dead = true`，旧实例出口全部空操作；
  `pagehide` 进 bfcache（`persisted`）时不再拆界面。
- **P2 人物没变也重发**（A-4）：面板开着时每 4 秒重建一次覆盖层与事态横条 → 按 `charSig` 只在变化时发。
- **P2 `dvh` 没有 `vh` 回退**（A-5）：老 WebView（Chromium < 108 / iOS < 15.4）里 `top` 会整条失效，
  悬浮按钮与面板可能跑到聊天末尾；CSS 与拖动定位都加了回退。
- **P2 裸人物标签吃掉后面叙述**（A-7）：`⌖人物 雷恩 @ 下层·7号井，他推开铁门…` 以前整句进地点，
  再进列表 / 地点卡 / 注入 / 行程；现在到句读为止，并去掉尾部「和」，带单测。
- **P2 头像两条路径行为不一致**（A-10）：`EdenMap.setAvatar` 在面板没开时不压缩，200 KB 的图直接 false；
  现在两条路径都先压到 160 px。
- **文档与代码不符**（A-9、A-10）：`docs/map-events.md` 的「处置中」这一档并不存在、去重键写成「类型+地点+标题」
  （代码是「类型+层+地点」）；`docs/content-compat.md` 的头像额度写成「约 300 KB」。都按代码改了。
- **发版链路**（C-1、C-2、C-3、C-5、C-6）：新增 `tools/check_version.py` 接进 smoke（VERSION ↔ build.json ↔
  README ↔ CHANGELOG ↔ 标签 ↔ 构建号反查）；`check_maps` 把 events.mjs 加载失败从警告改成错误；
  `ship.sh` 预热非 200 即中止并补一步 `smoke --cdn`；`build_preview_script.py --tag` 标签缺失或与 VERSION
  不符时退出码 2；`render_all.sh` / `crops.sh` 不再吞退出码、不再把上一轮的同名图当结果。
- **版本号与实际不符**（C-14）：README 还写「0.6.1 / 进行中 0.9.1」，ROADMAP 停在 0.9.3，TT 清单还是 0.9.1 版。

## 遗留（未修，已分优先级；下次开工可以直接挑）

**代码**
1. `eden-map.js` 每次重算的代价（A-3，P1）：重算会重取 ≤81 楼、`computeTrips` 再逐楼 `Mvu.getMvuData`
  + 第二次 `parseChars` + 每条 2 次 `slice(0,4000)`，`pushMvu` 又调一次 `refreshVarMap`；
  `stageOrderFor` 只在成功时记忆，失败时每次重算都走一遍 `cardTexts()`。
  `GENERATION_AFTER_COMMANDS` 在发送路径上同步跑，直接加在发送延迟里（4.1–4.5 ms 的旧测量早于 `computeTrips`）。
  建议：一轮一个 `stat_data` 快照、失败也记忆、按 (楼层, 文本 hash) 缓存解析、无变化直接跳过。
2. 查看器与宿主的 `postMessage` 校验（A-6，P2）：查看器不校验 `e.source` / `e.origin`，宿主一律 `targetOrigin '*'`。
  建议：查看器要求 `e.source === parent`，宿主用具体 origin（先确认 iframe 不是 opaque origin）。
3. `cardTexts()` 假定 `getCharData` / `getTavernRegexes` 同步（A-8）：真返回 Promise 时原作头像与阶段点会静默失效，
   而仓库里的宿主桩是同步的，浏览器测试测不出来。建议 thenable 时 await，或在自检里加一行。
4. 聊天变量写入失败后悄悄退回 localStorage、`readVars` 又只读变量（A-11）：UI 说保存成功、下次读回旧值。
5. 本地存储没有预算（A-13）：头像按聊一个个存、每聊天键永不清理，约 30 张就顶到 5 MB 共享额度，可能连带把卡自己的状态栏写入挤掉。
6. `map/section.js`（只有独立页 `map/tiancheng.html` 用）没有测试也没有数据校验，缺 `D.SECTION.items` 条目会在绘制中途抛错（A-测试缺口）。

**工具链**
7. `check_maps` 校验的是工作区而不是提交内容，`ship.sh` 的脏检查还带 `--untracked-files=no`（C-1）：新切的瓦片没 `git add` 也能过门控。
8. `make_dzi.py` 非原子（先 `rmtree`、`.dzi` 最后写），中断会留下旧 `.dzi` + 半个金字塔；也没有校验层数 / 瓦片数 / `extent_m` 与 DZI 尺寸的比例（C-8，已知 `world.dzi` 8000×4923 与 `extent_m` 1.600 对不上）。
9. 仓库卫生（C-11）：`docs/drafts` 43.9 MB、`docs/reviews` 10.7 MB、`map/shots` 5.6 MB 都进了 git，也都会被 `warm_cdn.sh` 预热（1,346 个文件 / 48 MB，其中 `map/shots`、`map/_proto`、4 个死原型页产品从不加载）。
10. 世界图渲染输入不可复现（C-13）：`elev.f32` / `height.f32` / `owner.i16` 没有任何提交过的生成脚本，`blender/data/meta.json` 却进了仓库。
11. 浏览器测试不是门控：没有 CI、没有 hooks、`playwright` 是浮动版本且 lockfile 被 ignore；`openings.mjs` / `viewer3d_perf.mjs` 无条件 exit 0（C-测试缺口）。

**测试缺口（与上面配套）**
- 未读水位 / 角标 / `isNew` / fly-on-open 以及 ghost 预加载的配合，没有任何测试（正是 A-1 的机制）。
- 换版本 / cleanup 之后「监听是否摘掉、两个实例是否都还注入、旧 custom 会不会覆盖」没有测试（A-2）。
- 存储写入失败、额度耗尽、头像超限的宿主路径、`postMessage` 来源校验、无 `dvh` 环境都没有测试。
- 发版不变量（VERSION / build.json / 标签 / CHANGELOG 一致、构建号反查、瓦片金字塔完整）以前没有测试——本次补了前两者。
