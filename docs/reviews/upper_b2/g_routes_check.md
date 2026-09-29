# B2 航线穿岛数值检查（本机，2026-09-27）

方法：`map/data/tc_upper.json` 的 `routes[].pts` 每段加密 25 倍，逐点对 33 座岛的 `outline` 多边形做点在多边形内判定。表中「深度」= 岛内采样点离岛心的最小归一化椭圆距离（0 = 岛心，1 ≈ 岸线），越小越靠近主楼。

| 航线 | 穿过的岛（岛内采样点数，最小深度） | 判定 |
|---|---|---|
| lane isle6 → eden | isle6 (14, 0.83) | 仅起点岛，终点在伊甸南停靠平台外 → 可接受 |
| lane isle6 → silver_crown | silver_crown (11, 0.40)、isle6 (7, 0.90)、**isle32 (8, 0.37)** | 穿 isle32 中部；终点在银冠堡岛内 0.40 |
| lane isle9 → eden | **eden (94, 0.70)** | 从西北进入伊甸、横穿岛面到南平台 |
| lane isle9 → silver_crown | silver_crown (30, 0.38)、**isle22 (32, 0.53)** | 穿 isle22 中部 |
| lane isle30 → eden | eden (2, 1.02)、**isle10 (18, 0.69)**、isle30 (23, 0.66) | 穿 isle10；起点在 isle30 岛内 |
| lane isle30 → silver_crown | **eden (57, 0.54)**、silver_crown (11, 0.40)、isle30 (14, 0.52) | 横穿伊甸（主楼附近） |
| patrol（银冠堡环） | 无 | 通过 |
| patrol_city（骑士团大环线） | **eden (93, 0.00)**、silver_crown (0.00)、isle6 (0.00)、isle9 (0.00)、isle29 (0.00)、isle30 (0.00)、isle3 (0.12)、isle22 (0.11)、isle27 | 直接穿过各地标岛岛心（即主楼） |

结论：**未修**。NOTES 要求「只连停靠平台、在岛外转折」，现状 6 条 lane 中 4 条穿过非端点岛或横穿伊甸，lane 端点也多在岛内（深度 0.4–0.66）而非岸外平台；`patrol_city` 逐岛穿过岛心。

建议（云端，`tc_estates.py` 航线导出）：
1. 每座有停靠平台的岛导出平台坐标（岸线外一点），lane 端点改为平台点。
2. 路径规划：在所有岛 outline 外扩 40 m 的障碍多边形上做可视图最短路（或 A* 于 30 m 网格），拐点落在岛外；再做轻度样条平滑并复检不入岛。
3. `patrol_city` 改为经过各地标岛平台外 60–80 m 的航点，绕岛外侧而非穿岛心。
4. 导出前自检：任何 route 采样点落入任一 outline（端点平台 30 m 内除外）即报错。
