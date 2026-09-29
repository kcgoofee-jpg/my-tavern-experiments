# 技术路线图

[![CI](https://github.com/kcgoofee-jpg/my-tavern-experiments/actions/workflows/ci.yml/badge.svg?branch=preview)](https://github.com/kcgoofee-jpg/my-tavern-experiments/actions/workflows/ci.yml)

> 状态：开发中 · 当前发布版本 `0.9.6`（标签 `map-v0.9.6`） · 下一版进行中（分支 `preview`）
> 详细门控与任务分轨：[`docs/history/GOAL_v0.9.1.md`](docs/history/GOAL_v0.9.1.md)（0.9.1 门控记录） · 产品待办：[`ROADMAP.md`](ROADMAP.md) · 变更记录：[`CHANGELOG.md`](CHANGELOG.md) · 本机 ↔ 云端协作与接手记录：[`docs/history/NOTES_FROM_LOCAL.md`](docs/history/NOTES_FROM_LOCAL.md) · 卡设定遗漏清单：[`docs/card-omissions.md`](docs/card-omissions.md)

## 1. 系统架构

```
┌──────────────────────── 离线生产（本机） ────────────────────────┐
│ 数据源：OSM 路网 / NYC 3D 建筑 / 设定文档（docs/*.md）            │
│   → Blender 5.2 Cycles（blender/*.py，GPU Metal）                 │
│   → 8K 底图 → tools/make_dzi.py → DZI 瓦片（map/art/）            │
│   → map/data/*.json（标记、轮廓、航线、房间多边形）                │
└──────────────────────────────┬────────────────────────────────────┘
                               │ git 标签 / 提交 SHA
                               ▼
              jsDelivr（gh / npm 线路）· 预热：tools/warm_cdn.sh
                               │
┌──────────────────────────────▼──────── 运行时（酒馆内） ──────────┐
│ 外挂脚本 map/tavern/eden-map.js（酒馆助手）                        │
│   · 悬浮按钮 + 面板（宿主页），srcdoc / blob 加载查看器            │
│   · 当前地点：MVU 变量 → map/here.mjs 逐级解析                     │
│   · 事件：楼层原文 → map/tavern/events.mjs 解析 → 落点 / 横条      │
│   · 态势回注：injectPrompts（in_chat，depth 4）                    │
│ 查看器 map/viewer.html（OpenSeadragon 5，canvas）                  │
│   · 地图注册表 map/data/maps.json · 设计令牌 map/ui/tokens.css     │
│   · 叠加层：标记 / 事件 / 岛轮廓 / 航线；清晰度三档 + 自动          │
│   · 庄园：iframe 嵌入，postMessage 协议 estate:*                   │
│   · 本机扩展：window.EdenMap（只存本机，不联网）                    │
└────────────────────────────────────────────────────────────────────┘
```

## 2. 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 底图渲染 | Blender 5.2 Cycles（Metal，仅 GPU，64 采样，自适应采样 + 光源树） | 写实俯视；不使用代码手绘美术 |
| 地理数据 | OpenStreetMap（ODbL）、NYC 3-D Building Model（NYC Open Data） | 旋转、裁剪、拼接，去掉地名 |
| 瓦片 | Deep Zoom（DZI），512 px JPEG | 三档清晰度同一金字塔 |
| 查看器 | OpenSeadragon 5.0.1、原生 ES 模块、无构建步骤 | 本地 vendor，不依赖外部 CDN 运行 |
| 酒馆集成 | 酒馆助手（JS-Slash-Runner）、MVU | 兼容 EJS 模板与正则脚本 |
| 分发 | jsDelivr（钉提交 SHA / 标签）、npm（计划） | 国内线路：npmmirror（计划） |
| 测试 | Node `node:test`、Playwright（Chromium + WebKit）、axe | WebKit 覆盖 iPhone 全部浏览器与 macOS TT |
| 审阅 | 多人设审阅 + 架构师汇总（`tools/review/`） | 渲染门控按「够用」标准 |

## 3. 里程碑

| 版本 | 范围 | 状态 |
|---|---|---|
| 0.6.x | 世界地图、查看器基础、卡内悬浮按钮 | ☑ 已发布 |
| 0.9.1 | 天城三层分城区写实底图（8K）、上层浮岛与云海、当前地点定位、事件体系 v2（9 类 66 种）、界面统一、中 / 英与深 / 浅主题、本机扩展接口（最小集） | ☑ 已发布（`map-v0.9.1`） |
| 0.9.2 | 云海方案 B 接进查看器（漂移云 + 切层转场）、单手模式 E7、人物栏、开局关键地点、界面去重与查错 | ☑ 已发布（`map-v0.9.2`） |
| 0.9.3 | MVU 联动：人物位置、世界时间与夜色、着装、自定义名称与用途、按地点回注方位 | ☑ 已发布（`map-v0.9.3`） |
| 0.9.4 | 自检误报修复（热换脚本后旧地址被算成重复脚本；附加条目未生效的提示） | ☑ 已发布（`map-v0.9.4`） |
| 0.9.5 | 自定义对话框与 `EdenMap.flyTo`、人物名册分组、原作头像、途中地点与行程、变量映射（换卡兼容）、开场自检卡、通读卡后的兼容修补、线路测速、接手 review 的失败路径修补 | ☑ 已发布（`map-v0.9.5`） |
| 0.10 | 伊甸庄园 Blender 重建 | ◐ 进行中：**走 `blender/estate2/` → 网页 glTF 三维（`map/estate3d/`）**，Phase 1/2 已上线；~~剖切等轴瓦片（主）＋ glTF 3D 模式（彩蛋）~~（2026-09-29 订正：等轴瓦片路线不再推进，`eden_estate_tiles.json` 零读方；`blender/estate/` 仅因 `tc_estates.build_eden` 以 1:100 调用而保留） |
| 0.11 | 历史时间线、角色位置板、按聊天保存的房间状态 | ☐ 计划 |
| 1.0 | 通用化：核心与设定解耦、读卡生成配置的 skill、底图模板、教程（需批准后启动） | ☐ 待批准 |

### 0.9.1 进度（历史记录，已发版）

| 轨道 | 内容 | 状态 |
|---|---|---|
| A | 中层 / 下层分城区城市 8K（真实 3D 核心区、曲线拼缝、灯光分区） | ☑ |
| B | 上层浮岛（每岛不同、伊甸约 670 × 500 m）、云海（无岛影）、8K | ☑ 第 3 轮有条件通过，已发版 |
| C | 当前地点精确到房间；three.js 庄园冻结，按现状随版发布 | ☑ |
| D | 事件体系 v2、示范标签、世界书联动规范 v2 | ☑（0.9.5 起补到 82 种；2026-09-29 核实现为 **10 类 85 种**，以 `docs/event-taxonomy.md` §1 为准） |
| E | 界面统一（设计令牌）、TT WebView 兼容修复、v0.9.1 小调整、单手 / 色盲、隐私 | ☑（色盲无限期推迟，补丁存 `docs/drafts/e7_cvd.patch`） |
| F | 版本号、变更记录、标签、CDN 预热、隔离酒馆验证、npm 发布 | ☑ 发版；npm 正式发布与用户 TT 实测仍待用户 |

## 4. 质量门控

| 类别 | 标准 |
|---|---|
| 渲染（严格） | 与设定一致 ≥ 7；省流 2000 px 与 375 px 手机上一眼认出层与城区；标记对比度 ≥ 4.5；标准档无明显瑕疵 |
| 渲染（参考） | 写实度、园林与建筑史、拼缝与重复；8K 局部只抽查瑕疵；每资产每版本最多 2 轮 |
| 性能（TT 内） | 省流首屏 ≤ 3 s；单层标准档 ≤ 1.5 MB；开关面板 20 次后 JS 堆不增长；手机 3D ≥ 30 fps |
| 界面 | axe 0 违规；可见文字 ≥ 11 px；触控目标 ≥ 44 px；键盘全程可达；中 / 英 × 深 / 浅无溢出 |
| 兼容 | Chromium（安卓、桌面）与 WebKit（iPhone、macOS TT）均通过 `tools/browser/accept.mjs` |
| 内容 | 仓库与 CDN 只放中性地图与设定数据；运行时不审核、不过滤用户聊天内容 |

## 5. 开发规范

- **分支**：`main` 为发布线；功能在 `cloud/*` 或功能分支开发，合并前通过自检与门控。
- **版本**：语义化版本；从 0.9 起补丁号递增（0.9.1、0.9.2……）；发布打标签 `map-vX.Y.Z`，运行时钉标签或提交 SHA。
- **提交**：一件事一个提交；信息写清改动与原因；作者邮箱用 GitHub noreply；AI 协作提交附 `Co-Authored-By`。
- **自检**：提交前 `bash tools/smoke.sh`（地图数据校验、单元测试、脚本语法、JSON 校验，可选 CDN 检查）。
- **测试**：`node --test tests/*.test.mjs`；浏览器验收 `node tools/browser/accept.mjs <输出目录>`。
- **渲染**：`bash tools/render_all.sh <层> --res 8000 --samples 64`；局部 `bash tools/crops.sh`；同一时间只跑一个 Blender；安静期锁 `tools/quiet.sh`。
- **发布**：`bash tools/ship.sh`（自检 → 推送 → 预热 CDN → 生成预览脚本），发布前 `--dry-run`。
- **文档**：架构与接口 `docs/`；工具说明 `docs/tooling.md`；审阅记录 `docs/reviews/`。
- **素材许可**：仓库只收 CC0 / CC-BY / ODbL 等允许再分发的素材，逐项记入各素材目录的 `CREDITS.md`（`map/estate/assets/`、`map/estate/closet/assets/`、`blender/props/`、`blender/estate2/` 各一份）。

## 6. 目录

| 路径 | 内容 |
|---|---|
| `blender/` | 渲染脚本（`tiancheng_*.py`、`tc_*.py`、`estate/`） |
| `map/` | 查看器、瓦片、数据、酒馆脚本、界面令牌 |
| `tools/` | 构建、渲染、切片、自检、浏览器测试、审阅流程 |
| `tests/` | 单元测试 |
| `docs/` | 设计文档、门控记录、审阅报告 |

## 原作与授权

- 原作：**Yehehua** 的原作角色卡，发布于 Discord「类脑」社区：<https://discord.com/channels/1380075940285124724/1534464824141025321>。
- 本仓库的地图、脚本与世界书附加条目是二次创作，不包含也不修改原卡。作者于 2026-09-27 通过 Discord 同意，条件是**发布时首帖附上面的原作帖链接**。
- 同一行署名也写在地图脚本说明（`tools/build_preview_script.py`）、世界书附加条目（`tools/build_worldbook_addon.py`）和查看器设置面板底部。

## 7. 数据与署名

- 城市骨架：**© OpenStreetMap contributors**，[ODbL 1.0](https://opendatacommons.org/licenses/odbl/)（https://www.openstreetmap.org/copyright）。派生数据 `blender/data/osm/*.json` 同样按 ODbL 提供。查看器在天城各层右上角显示署名。
- 核心区建筑几何：NYC 3-D Building Model，NYC Open Data。
- OpenSeadragon 5.0.1（BSD-3-Clause），见 `map/vendor/openseadragon/`；three.js（MIT），见 `map/estate/vendor/`。
- 庄园素材：Poly Haven、ambientCG（CC0），逐项见 `map/estate/assets/CREDITS.md`。
