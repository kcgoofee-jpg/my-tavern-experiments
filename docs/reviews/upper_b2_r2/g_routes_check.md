# B2 第 2 轮 · 航线穿岛数值检查（本机，2026-09-27）

**说明**：用户已定（NOTES 834bc37）航线做成查看器开关、默认关，**不计入门控**，本轮云端不改。以下仅记录。

方法同第 1 轮（`docs/reviews/upper_b2/g_routes_check.md`）：`map/data/tc_upper.json`（b94441b）的 `routes[].pts` 每段加密 25 倍，逐点对 33 座岛的 `outline` 做点在多边形内判定，并算到最近岸线的距离（extent 3000 × 1875 m）。

| 航线 | 入岛采样点 | 端点（最近岛，岸外距离） | 离非端点岛最小净距 |
|---|---|---|---|
| lane isle6 → eden | 0 | isle6 外 2 m / eden 外 9 m | 44 m（isle32） |
| lane isle6 → silver_crown | 0 | isle6 外 2 m / 银冠堡外 3 m | 44 m（isle32） |
| lane isle9 → eden | 0 | isle9 外 1 m / eden 外 9 m | 36 m（isle11） |
| lane isle9 → silver_crown | 0 | isle9 外 1 m / 银冠堡外 3 m | 42 m（isle22） |
| lane isle30 → eden | 0 | isle30 外 3 m / eden 外 9 m | 43 m（isle24） |
| lane isle30 → silver_crown | 0 | isle30 外 3 m / 银冠堡外 3 m | 42 m（isle24） |
| patrol（银冠堡环） | 0 | — | 67 m |
| patrol_city（骑士团大环线） | 0 | — | **19 m（isle24）** |

- 端点是 `make_dock` 的平台中心（圆台一半伸出岸线，中心在 outline 外 1–9 m），符合「端点在岸外停靠平台」。
- isle9 → 银冠堡 第 2 个拐点离 isle9 岸 4 m：只是离开自身平台的平滑段，不算穿岛。
- 建筑都在岛内，0 入岛即不压楼。

**结论：通过**（第 1 轮 4 / 6 条 lane 穿岛、patrol_city 穿岛心 → 本轮全部 0 入岛）。遗留 P2：patrol_city 在 isle24 旁只有 19 m（目标 40 m），不计入门控。
