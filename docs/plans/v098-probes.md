# v0.9.8 探针全扫

2026-10-02，head #293 之上（PROBE-FIX 分支），无头 Chromium、本地 `map/` 服务、逐个运行，范围同 `docs/plans/stage-c-probes.md`（66 个有通过 / 失败约定的探针；测量与截图生成器不跑）。`tools/browser/known-failures.json` 仍为空。

## 结果

66 个里 65 个通过，1 个红：`estate3d`（数据问题，见下）。扫描中途发现并当场修好 3 个红，修后单独重跑通过；`ui3d1` 在扫描时并行有别的浏览器任务，红了一次（375 标签重叠），单独重跑两次通过，判为负载抖动。

## 本轮修掉的

| 探针 | 原因 | 处理 |
|---|---|---|
| `e7` | 庄园已在主壳里，不再让位给独立三维页 | 检查改为：控制列与「⋯」仍在 |
| `fix3` | 设置页首次打开才构建；本地桩没有构建号 | 打开后等待；探针里给页面一个构建号 |
| `v097` | 构建全部设置页后抽屉没关，挡住地点卡；数据库插件读取器自 INV-2 起默认暂停 | 先关抽屉；探针里打开 `edenMapOn:tabledb` |
| `v2a` | 迷雾开关在首次打开才构建的页；清理状态选到了重置行的提示；Aa 钮不在手机控制列；首次提示措辞；三维链接措辞 | 探针跟随现状（Aa 改为图层「地名」） |
| `accept` | D35 / LEGEND-1 后伊甸抽屉没有「图例」页（CI browser-smoke 红） | 该项反转：断言没有；选用路径由 `legend1` 覆盖 |
| `estate_presence` / `estate_generic` | 真缺陷：U-FIX-5 把一条注释写进了 `map/estate/presence.js` 一行中间，注释吃掉了 `group.add(o); rooms.set(...)`，三维人物头像从那以后一个都画不出来 | 注释移到行尾，头像恢复 |
| `pack_layers` | LEGEND-1 后图例页要包自己选用，示例包 `town` 没选用 | `town` 的 overlay 加 `ui.tabs` 含 `legend` |

## 仍红

| 探针 | 原因 | 状态 |
|---|---|---|
| `estate3d` | **数据**：E-13b 重建的 `map/estate/model/house.glb` 有两个场景，B2 医疗块节点 `f_B2_med` 挂在第二个场景（`Scene`）里，加载器只读默认场景（`house_raw`），所以无菌处置室等 B2 医疗设备整块没载入（截图 `~/eden-map-review/probe-fix/estate3d-b2-med-missing.png`）。不是探针过时 | 待定：重建 `house.glb`（让 `f_B2_med` 进默认场景）。记为 E-14，不在本轮改（按提示：数据问题先报告） |
