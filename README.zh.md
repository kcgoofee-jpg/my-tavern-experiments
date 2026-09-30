# 伊甸地图 —— 酒馆的地图层

[![CI](https://github.com/kcgoofee-jpg/my-tavern-experiments/actions/workflows/ci.yml/badge.svg?branch=preview)](https://github.com/kcgoofee-jpg/my-tavern-experiments/actions/workflows/ci.yml)

English edition: [README.md](README.md)（以英文版为准）

## 这是什么

给 SillyTavern / 酒馆助手聊天用的地图层：一个悬浮按钮打开一张跟着剧情走的地图——场景在哪、谁站在哪、刚发生了什么。
它正在被重构成与具体卡无关的 **Spatial OS**：引擎不认识任何一张卡，设定以数据**包**的形式提供。第一个包描述的就是本项目最初服务的那张卡。

## 状态

Spatial OS 重构，阶段 A（契约与通用化）：S0–S3 已完成，下一步 S4；实时状态见 [`docs/todo.md`](docs/todo.md) §0。
**跟随线：`preview`**——每次推送都先落在这条线上。当前发布版本 `0.9.7`（标签 `map-v0.9.7`），重构结束前暂缓发新版。

## 安装

在酒馆助手里新建脚本，内容为下面这一行（或用 `python3 tools/build_preview_script.py <git ref>` 生成可直接导入的 JSON）：

```js
import 'https://cdn.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@preview/map/tavern/eden-map.js'
```

这条地址跟随 `preview` 分支，不会过期；`tools/check_readme.py` 在 CI 里守着它。

## 文档

- [代理简报](docs/agent-brief.md) — 规则
- [架构](docs/ARCHITECTURE.md) — 模块图、数据流、实体协议
- [命名](docs/naming.md) — 命名规则、改名表、术语表
- [待办](docs/todo.md) — 唯一清单
- [交接](docs/handoff.md) — 上一轮会话的交接
- [计划](docs/plans/spatial-os.md) — 现行计划
- [执行日志](docs/plans/spatial-os-log.md) — RESULT 块
- [渲染战役](docs/plans/render-campaign.md) — 台账状态
- [云渲染](docs/cloud-render.md) — 云渲染运维
- [地标流水线](docs/landmark-pipeline.md) — 地标流水线
- [版本](docs/versioning.md) — 版本、标签、更新提示
- [分支](docs/branching.md) — 分支与同步
- [语言口径](docs/language-policy.md) — 文档语言规则

## 署名

原作角色卡作者为 **Yehehua**，发布于 Discord「类脑」社区：
<https://discord.com/channels/1380075940285124724/1534464824141025321>。本仓库的地图、脚本与世界书附加条目是经作者同意的二次创作
（2026-09-27，条件是首次公开发帖时附上原作帖链接）；地图不包含、也不修改原卡。同一行署名也显示在查看器设置面板、脚本说明
（`tools/build_preview_script.py`）和世界书附加条目（`tools/build_worldbook_addon.py`）里。

## 素材许可

- 城市骨架：© OpenStreetMap contributors，[ODbL 1.0](https://opendatacommons.org/licenses/odbl/)；派生数据 `blender/data/osm/*.json`
  同样按 ODbL 提供。核心区建筑：NYC 3-D Building Model，NYC Open Data。
- 庄园贴图与模型：Poly Haven、ambientCG（CC0），逐项见 `map/estate/assets/CREDITS.md`。
- OpenSeadragon 5.0.1（BSD-3-Clause）见 `map/vendor/openseadragon/`；three.js（MIT）见 `map/estate/vendor/`。
