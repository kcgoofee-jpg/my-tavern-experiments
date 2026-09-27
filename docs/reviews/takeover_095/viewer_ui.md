# 查看器与界面审阅 · 2026-09-27 接手

范围：`map/viewer.html`（1,690 行）、`map/{events,chars,custom,trips,varmap,section}.js`、`map/here.mjs`、
`map/ui/tokens.css`、`tools/sync_tokens.py`、`tools/browser/*.mjs`。
方法：只读 + Playwright（Chromium 1440 / 375）+ axe-core 打在本机只读服务上（跑完已停）。除注明「代码级」外都是实测复现。
结论：顺利路径做得扎实（设计令牌、i18n 键集完全对齐、省流 / 减少动效分级、tracker 拆解干净、
`axe` 在桌面 tc_mid 上 0 违规、休眠 / 唤醒 ×20 后 DOM 279 节点 / 堆 9.5 MB 持平）；**问题集中在失败与边界路径**。

| # | 级别 | 结论 | 位置 | 状态 |
|---|---|---|---|---|
| 1 | P0 | 启动数据（maps.json / world_markers.json）取不到 → 永远停在「加载中…」，`main()` 抛错没人接，10 个按钮全都没有监听（`initSettings` 没跑到），`getJSON` 还把失败缓存成 resolved `null` | `viewer.html` `main/getJSON` | ✅ 已修（`getJSON` 失败不入缓存 + `main` 包 try/catch + 提示与「重试」按钮，i18n 加 `boot_fail`） |
| 2 | P1 | 单张地图的点位 JSON 失败一次，整个会话都取不回来（0 标记 / 0 房间 / 没有当前地点点） | `viewer.html` `jsonCache` | ✅ 已修（失败即失效，切回时重取；新增浏览器回归第 2 项） |
| 3 | P1 | 宿主消息不校验 `e.source`：同源的其他 iframe 能改当前地点、强制切图、注入假人物 / 事件 / 自定义 | `viewer.html:1537` | ✅ 已修（`e.source !== window.parent` 直接返回；新增浏览器回归第 5 项，并做过「去掉守卫即失败」的反向验证） |
| 4 | P1 | 休眠（面板关着）时仍处理 `eden-map:here` → 面板不可见却重新拉瓦片，`sleeping` 还留着旧图，唤醒后先错一下再跳 | `viewer.html:1541,1558` | ✅ 已修（休眠时只记住新位置、不 `go()`；新增回归第 3 项） |
| 5 | P1 | 后台预热失败会把 rejected promise 永久留在 `textCache`：庄园页在预热窗口失败一次，之后不再发请求，只能手动重试 | `viewer.html` `getText/openEstate` | ✅ 已修（`getText` 失败即失效 + 打开时重试一次） |
| 6 | P2 | `wake` + 认不出的 fly 目标（人物 / 房间不存在）→ 舞台全空（`cur:null, mk:0`），只有切层能救 | `viewer.html:1559` | ✅ 已修（先 `go(sleeping)` 再 fly；新增回归第 4 项） |
| 7 | P2 | 慢速切层时舞台空白数秒（快照在「下一张瓦片画出」或 1.5 s 后淡出，而不是新图 open 时） | `viewer.html:777,799,1026` | ⏳ 未修 |
| 8 | P2 | 人物面板可见文字低于 11 px 下限：`.chstage` / `.chsrc` 10 px、`<summary><small>` 继承 UA `smaller` = 10 px；`#here` 输入框没有 `<label for>` / `aria-label` | `map/chars.js:138,149,152,162`、`viewer.html:457` | ◐ 字号已修（改用 `--fs-micro`）；`#here` 的 label 未做 |
| 9 | P2 | 人物面板单个人物开关实测 34×20，没有 44 px 热区（邻居的名字按钮是 299×45） | `map/chars.js:92`、CSS 155-165 | ✅ 已修（开关包进 `min-width/height:44px` 的 `.chsw`） |
| 10 | P2 | 浅色主题下标记与底图对比度掉到 1.13–3.19（门控写 ≥ 4.5）：浅色只换界面令牌，底图仍是深色渲染图 | `ui/tokens.css:42`、`viewer.html:269` | ⏳ 未修（单点取样，需要一次真正的地图配色调整） |
| 11 | P2 | 后台预热把「带下方城市」整座金字塔（218 瓦片 / 5.1 MB / ≥55 s）拉下来，而这些 `Image()` 不进 OSD 瓦片缓存，之后还会再下一遍 | `viewer.html:683-707` | ⏳ 未修 |
| 12 | P2 | 每个标记一层 `drop-shadow`（最多 100+ 层滤镜）+ 每次落定 / 开卡都全量重排（`tabOrder`/`declutter` 遍历所有标记） | `events.js:262-279`、`chars.js:134`、`viewer.html:1119-1149` | ⏳ 未修（代码级判断，未测帧率） |
| 13 | P2 | 五处私有 OSD 内部成员（`_tilesLoading`、`_getLevelsInterval`、`_updatePixelDensityRatio`、`_needsUpdate/_needsDraw`、`drawer.canvas`）被读写 / 猴补，升级 OSD 会静默坏掉 | `viewer.html:993,1014,1054,1086,1093,1098` | ⏳ 未修 |
| 14 | P2 | 门控里的「axe 0 违规」「≥ 11 px」「≥ 44 px」「375 × EN × 浅色无溢出」在仓库里都没有对应检查；另外在手机「⋯」抽屉里切语言时，变量映射面板的文字不跟着换 | `tools/browser/accept.mjs`、`map/varmap.js` | ◐ i18n 重画已修（`applyI18n` 调 `TCVarMap.render()`）；门控检查未补 |

**杂项（未动）**：`viewer.html` 有死掉的 `#status`；`narrow` 与 `narrowNow()` 重复；`map/` 里带着草稿页（`world.html`、`world_draft1/2.html`、`_test_events.html`、`_proto/`）；`events.js` 的 22 条颜色表与 `tavern/events.mjs` 的 `GROUPS/SHAPES` 重复。

**实测成立的部分**：休眠 / 唤醒 ×20 后 DOM 279 节点、trackers 8、OSD overlays 9、JS 堆 9.5 MB 持平（`trackEl`/`untrackAll` 的拆解纪律有效）；
瓦片失败会正确降级（「卡住了？点此重试」+ 覆盖层提示 + 一次读屏播报，不会假 100%）；`axe-core 4.10.2` 桌面 tc_mid 0 违规、23 项通过；
中英键集完全相等（233 个，`en` 只多 `names`）；主题与语言在首帧前定好；`tokens.css` 与内联令牌字节一致且由 smoke 校验；
省流 / 减少动效分级集中在 `lean/leanBg/touchUnknown/autoMax/no-fx`；备选底图切换的竞态经测试不复现。

**测试缺口**：启动数据失败（P0 陷阱）、`axe`、消息来源校验、休眠期间的各类消息、休眠 / 唤醒循环、
单张地图数据失败、`textCache` 失败、`wake` + 认不出的 fly、375 × EN × 浅色溢出扫描、字号下限、
触控目标测量、开卡 / 人物面板状态、`map/section.js` —— 本次补了前四类里的五个断言（`tools/browser/fail095.mjs`）。
