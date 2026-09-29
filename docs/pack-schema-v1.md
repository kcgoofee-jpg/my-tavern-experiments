# 设定包清单 schema v1（已冻结）

> 状态：2026-09-28 冻结（C2 第 3 步）。现行。机器可读版本 = `map/data/schema/pack.schema.json`；运行时子集 = `map/core/pack.mjs validate()`；完整校验 = `tools/check_pack.py`；冻结守门 = `tests/pack_schema_v1.test.mjs`。

## 1. 冻结规则

- `schema` 字段恒为 `1`。v1 里已有的字段**不改名、不删、不改类型、不改必填集**。
- 允许：新增**可选**字段（顶层或 `data` / `chat` / `cdn` / `theme` 里）；同时在本页表格补一行、在 `pack.schema.json` 补定义、在 `tests/pack_schema_v1.test.mjs` 的 `V1` 快照里补上。
- 不兼容的改动 = 升 `schema: 2`：`core/pack.mjs` 加 `migrate(m)`（v1 → v2，纯函数），`validate()` 两个版本都收；旧包不需要改文件。
- 以 `_` 开头的键是注释，任何位置都允许，核心不读。
- 路径一律相对清单所在目录（eden 例外：相对 `map/`），不收 `scheme:`、`/` 开头、`..`、反斜杠、空白。
- 信任边界：清单是纯数据；核心从不执行包里的脚本，也不按内容过滤用户聊天。

## 2. 字段（v1）

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `$schema` | 否 | string | 编辑器提示用 |
| `id` | 是 | `^[a-z][a-z0-9_-]{1,31}$` | = 目录名；本机存储前缀由它推出（eden → `edenMap`，其它 → `tcp.<id>.`） |
| `schema` | 是 | const `1` | 清单格式版本 |
| `title` | 是 | string（运行时 ≤ 80 字） | 面板标题 |
| `title_en` | 否 | string | 英文标题，缺省 = `title` |
| `chat.var` | 否 | `^[A-Za-z_][A-Za-z0-9_]{0,31}$` | 聊天变量顶层键；缺省 `tc_<id>`（eden = `eden_map`） |
| `data.maps` | 是 | path | 地图注册表（`maps.schema.json`） |
| `data.world` | 否 | path | 世界图地点 |
| `data.derived` | 否 | path | 派生数据 |
| `data.rooms` | 否 | path | 分层房间平面 |
| `data.events` | 否 | path 或 `builtin` | 事件分类（`events.schema.json`）；`builtin` 只给 eden |
| `data.worldbook` | 否 | path | 世界书附加条目源 |
| `data.security` | 否 | path | 安保叠加层事实（`security.mjs` 读；2026-09-30 加） |
| `data.roster` | 否 | path | 保底名册 `{members: [{name, identity}]}`：无 MVU 数据时人物页兜底（2026-09-30 加） |
| `preload` | 否 | [path] | 启动预取的数据文件：查看器首帧按包注入 `<link rel=preload>`（2026-09-30 加） |
| `vars` | 否 | {字段: 路径} | MVU stat_data 默认路径（键 = `tavern/adapter.mjs FIELDS`） |
| `cdn.repo` | 否 | `owner/repo` | jsDelivr gh 线路 |
| `cdn.npm` | 否 | string | npm 镜像包名 |
| `theme.accent` | 否 | `#rrggbb` | 强调色 |
| `features` | 否 | {名: bool} | 开关覆盖，默认按有无对应数据推出 |
| `strings` | 否 | {键: string} | 包内文案覆盖：键 = i18n 键、值不分语言，英文变体写「键@en」；查看器 i18n 与三维子页都吃（2026-09-30 接入） |
| `worldbook.addon` | 否 | string | eden 历史字段：附加条目生成脚本 |

## 3. 伊甸包

`map/packs/eden/manifest.json` 是伊甸唯一定义（C2 第 2 步删掉了 `core/pack.mjs` 的 EDEN 常量）；查看器启动时取它（`viewer.html` preload，与模块并行）。
