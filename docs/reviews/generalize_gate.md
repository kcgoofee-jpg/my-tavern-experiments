# 通用化（设定包 v1）门控记录

范围：`map/core/pack.mjs` 配置接口、`map/packs/eden` + 示例包 `map/packs/town`、查看器 / 宿主 / 事件 / 存储按包、`tools/new_pack.py` / `check_pack.py` / `draft_pack_from_card.py`、`build_preview_script.py --pack`、`build_worldbook_addon.py --pack`、`docs/generalize/README.md`。

## 评审（门槛 ≥ 8 且无 P0 / P1，最多 2 轮）

| 人设 | 第 1 轮 | 第 2 轮 | P0 / P1 |
|---|---|---|---|
| 架构 | 7 | **8** | 无 |
| 产品（包作者体验） | 6（P1 ×2：`--out` 陷阱；发布步骤没写要先提交、推送、设 cdn.repo） | **8** | 无 |
| 性能 | **8** | — | 无 |

第 1 轮之后的修正（e03b90c、93557a8 及其后的文档提交）：
- 预算清理能识别包的命名空间：`nsStore` 和宿主的 `key(i)` 会把本包的键还原、把 eden 的键藏起来。
- 事件分类写坏时退回内置分类，不会拖垮启动。
- `new_pack` 去掉了 `--out`；`--extent` 写错、缺依赖时给出明确提示；草稿里有「未分层」时会提醒。
- 发布前如果包还没提交，会提醒。
- 教程补上了发布步骤、fork 与 cdn.repo 的用法、本机地址、地图 id 的规则，以及取坐标的一行代码。
- 包的事件分类改成和数据并行请求（性能 P2）。

留下的 P2 / P3 已写进教程的「已知限制」：
- 三份同步副本：id 规则和键前缀在三处各写一份。
- `edenEstateLabels` 不在包的命名空间里。
- 非 eden 包也会下载 eden 的三条数据预取。
- 通过修改共享模块状态来切换事件分类，这种写法比较脆弱。
- 查看器单独打开时，`?pack` 不做来源限制。
- `applyPack` 还没有合并成一个入口。

## 测试

- `bash tools/smoke.sh`：全部通过，包括 check_maps、check_pack 和 node --test（43 个文件，94 个用例）。
- 浏览器（Chromium 375 + 桌面 1440，iPhone WebKit 见 accept / e7_host）：
  - `pack_town`（新增）：通过。覆盖独立打开的查看器、宿主桩（按包解析、注入、聊天变量 `tc_town`、不写 eden 的键），以及 eden 默认情况下的回归。
  - `accept`、`e7_host`、`openings`、`mvu093`、`custom095`、`splash095`、`autoupd097`、`chars092`、`roster095`、`fail095`、`sites096`：全部通过。
- 兼容：不带 `--pack` 时，`build_preview_script.py` 的输出与改动前逐字相同（cmp 核对过）。
