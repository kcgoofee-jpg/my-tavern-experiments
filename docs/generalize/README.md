# 设定包：给另一张卡做地图

地图分两层：**核心**（查看器、事件解析、当前地点定位、扩展接口、宿主脚本）和**设定包**（一张卡的地图、地点、事件分类、变量路径、世界书条目、主题）。核心只经 `map/core/pack.mjs` 这一个接口读设定包。

- 内置包 `eden`（伊甸庄园 · 天城）：`map/packs/eden/manifest.json`。它的数据仍在 `map/data/`，本机键 `edenMap*` 和聊天变量 `eden_map` 都没变，所以老用户的数据不用迁移。不带任何包参数时就是它，和通用化之前逐字相同。
- 示例包 `town`（雾港镇，虚构）：`map/packs/town/`，2 层、5 个地点、3 类事件，底图是占位图。用来证明核心换一套设定也能跑，也可以当模板照着改。

## 五分钟上手

```bash
# 1 脚手架：两层、每层 3 个占位地点、3 类示例事件、占位底图（Pillow + numpy）
python3 tools/new_pack.py harbor --title 某港 --title-en Harbor --layers 上城,下城
#   已有卡：先从卡的世界书起草稿（只读条目标题 / 触发词，不读正文，草稿不许写进仓库）
python3 tools/draft_pack_from_card.py ~/卡.json --layers 上城,下城 --out ~/Downloads/harbor.draft.json
python3 tools/new_pack.py harbor --title 某港 --from-draft ~/Downloads/harbor.draft.json

# 2 本机看：在仓库根目录起静态服务，服务 map/，浏览器打开 http://localhost:8123/viewer.html?pack=harbor
python3 tools/cors_server.py 8123 map

# 3 校验（smoke.sh 也会跑）
python3 tools/check_pack.py harbor

# 4 发给酒馆：先提交并推送到公开 GitHub 仓库（脚本从 jsDelivr 按提交号取核心与包）
git add map/packs/harbor && git commit -m "包 harbor" && git push
python3 tools/build_preview_script.py $(git rev-parse --short HEAD) --pack harbor   # 产出酒馆助手脚本 JSON
python3 tools/build_worldbook_addon.py --pack harbor                                 # 产出世界书附加条目 JSON
```

- 用自己的 fork：清单里写 `"cdn": { "repo": "<你>/<仓库>" }`，再用 fork 上的提交号生成（jsDelivr 的 `gh/<repo>@<提交号>` 线路）。
- 草稿里的「未分层」要先手动挪进真正的层；层名是中文时地图 id 是 `<id>_l1`、`<id>_l2`，想要可读 id 就在草稿每层写 `"id"`。改地图 id 要同时改 maps.json、`<地图 id>.json` 文件名、底图、events.json 的 `layers[].map`。
- 地点坐标先是随机的：打开查看器，在控制台用 `viewer.viewport.pointFromPixel` 取点，或直接改 `<地图 id>.json` 的 nx / ny 后刷新。

## 包的目录

```
map/packs/<id>/
  manifest.json      清单（结构见 map/data/schema/pack.schema.json）
  maps.json          地图注册表（结构见 maps.schema.json）
  <地图 id>.json     各层地点坐标（结构见 points.schema.json）
  events.json        事件分类（结构见 events.schema.json）
  worldbook.json     世界书附加条目 { entries: [{ name, content }] }
  art/<地图 id>.dzi  底图瓦片（tools/make_dzi.py 切）
```

包内文件的路径都相对包目录；核心取文件时自动补上 `packs/<id>/`（`rebaseRegistry`）。外链、`/` 开头、`..` 一律不收。

## manifest.json

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 等于目录名；小写字母开头，2–32 位 `a-z0-9_-` |
| `schema` | 是 | 固定 `1` |
| `title` / `title_en` | 是 / 否 | 面板标题，也用在世界书名（「<标题>·自定义」）和注入句的标签里 |
| `data.maps` | 是 | 地图注册表 |
| `data.events` | 否 | 事件分类；不写就没有事件功能。`builtin` 只给 eden 用 |
| `data.worldbook` | 否 | 世界书附加条目 |
| `data.world` / `derived` / `rooms` / `cardBind` | 否 | 世界图地点、派生数据、分层房间平面、卡原名绑定；eden 在用，新包一般不需要 |
| `chat.var` | 否 | 聊天变量顶层键，默认 `tc_<id>` |
| `vars` | 否 | MVU `stat_data` 的默认路径，例如 `{ "location": "世界.当前地点" }`。键见 `tavern/adapter.mjs` 的 `FIELDS`；没写的键按字段名自动找，用户也能在设置「变量映射」里改 |
| `cdn.repo` / `cdn.npm` | 否 | 你自己的 GitHub 仓库（jsDelivr gh 线路）；不写就用本仓库 |
| `theme.accent` | 否 | 强调色 `#rrggbb` |

本机存储前缀**不能配置**，它由 id 推出：eden 是 `edenMap`，其它包是 `tcp.<id>.`。首帧前置脚本要在清单到达之前同步算出前缀。

## maps.json：地图与地点

字段和 eden 的 `map/data/maps.json` 完全一样（`maps.schema.json`）。新包最少要有这些：

```json
{ "start": "harbor_up",
  "groups": { "harbor": { "title": "某港", "layers": ["harbor_up", "harbor_low"] } },
  "maps": { "harbor_up": { "title": "某港 · 上城", "group": "harbor", "layer": { "name": "上城" }, "kind": "points",
      "base": "art/harbor_up.dzi", "data": "harbor_up.json", "view": { "extent_m": [1600, 1000], "width_m": 1600, "focus": "keep" },
      "markers": { "keep": { "name": "旧堡", "name_en": "Old Keep", "tag": "set", "src": "出处", "alias": ["旧堡", "城堡"],
        "link": { "map": "harbor_low", "marker": "pier", "label": "下到码头" } } } } } }
```

- **标记**：`name` 是显示名，`alias` 是当前地点和事件地名能匹配到的叫法；`tag` 为 `set` 表示卡里写明，`inf` 表示推断；`src` 写出处（公开仓库只写中性描述，不抄卡原文）。
- **坐标**：写在 `<地图 id>.json` 的 `markers: [{ id, nx, ny, r }]`，nx / ny 是 0–1 的归一化坐标。`check_pack` 会检查坐标和标记一一对应。
- **跨层**：`link` 是跨层通道，`link3d` 是三维入口。两者可以并存，同一张图上只显示一个。
- **底图**：`python3 tools/make_dzi.py 图.png map/packs/<id>/art/<地图 id> --extent-m 宽 高`。宽高比要和 `extent_m` 一致，偏差超过 1% 会报错。
- **三维**（可选）：加一张 `kind: "estate"`、`src: "props/viewer3d.html"`、`viewer3d: "<清单名>"` 的地图，清单与 glb 的写法见 `docs/real-3d-buildings.md`，标记用 `link3d` 指过去。三维页面是核心页面，路径不补包目录。

## events.json：事件分类

模型在正文里写隐藏标签 `⌖类别｜层·地点｜等级｜一句话｜发布方`，或写 `data-tcmap="类型=…;地点=…"`。地图按事件分类把标签解析出来、落到对应的层，并在图例里着色。

```json
{ "groups": { "市政": "#d9a441", "灾害": "#ff5a2a", "天气": "#7fd6ff" },
  "shapes": { "市政": "penta", "灾害": "tri", "天气": "circle" },
  "types": { "火灾": { "g": "灾害", "ch": "火", "src": "巡夜队", "rare": 2 } },
  "alias": { "起火": "火灾" },
  "layers": [ { "name": "码头", "map": "town_harbour", "match": ["鱼市", "灯塔"] } ],
  "region": "雾港镇", "tag": "雾港镇事态", "closed": ["结束", "扑灭"], "examples": [] }
```

- `layers[].match`：地点里出现这些词，就算这一层（标签没写层名时用）。认不出层的标签不上图。
- `examples`：世界书里示范用的原文。模型照抄这些原文时不上图。
- `shapes` 给色弱用户区分大类，可选值有 `hex`、`circle`、`square`、`penta`、`diamond`、`octa`、`tri-down`、`tri`、`ring`。
- 核心不按内容过滤任何文字，只管解析位置和显示（见 `docs/content-compat.md`）。

## 变量与聊天数据

- 只读 MVU 的 `stat_data`，从不写卡自己的变量。当前地点等路径见上面的 `vars`。
- 地图自己的状态写在聊天变量 `<chat.var>` 顶层键下。键内结构由核心定义，包不用管：`自定义`、`探索`、`行程`、`标签楼`……
- 本机存储全部在 `tcp.<id>.*` 下，和别的包、和 eden 互不干扰。

## 世界书附加条目

`worldbook.json` 写的是给模型的规则：地点怎么写、标签怎么写、频率多少。`tools/build_worldbook_addon.py --pack <id>` 会在这些条目后面自动加两条：「事件类型」和「地图地点」。这两条和地图解析用的是同一份数据，改了分类或地点重跑一遍就行。

## 发布

- `tools/build_preview_script.py <ref> --pack <id>`（也支持 `--follow` 和 `--tag`）：生成的酒馆助手脚本在导入核心之前写 `window.__tcPack`，内容是清单、事件分类和聊天变量。脚本名和 id 都带上包 id。
- 地图面板的 srcdoc 里也会注入同一个对象，所以查看器不用再请求清单。
- 同一个酒馆里同时只启用一个地图脚本，否则两个悬浮按钮会互相替换。

## 已知限制（通用化 v1）

- 世界图（`kind: world`）、庄园剖面、天城尺度环（`app/scale.mjs`）、人物名册、安保层都还是 eden 专用。新包目前只支持同组多层的 points 地图、事件、当前地点、自定义叫法、迷雾、行程和 viewer3d 三维。
- 本机存储预算清理（`tavern/budget.mjs` 的 LRU）只认 `edenMap*` 前缀，其它包的按聊天数据不会被自动清理。
- 界面文案（`map/i18n/*.json`）是核心共用的，个别地方还带天城的说法（例如设置里的说明、占位提示「模拟 MVU：世界.当前地点」），首次打开就能看到。包的 `strings` 字段已经预留，但还没接入。
- 三维子页（`props/viewer3d.html`）读的是 eden 的语言键，在其它包里会退回中文。
- `viewer.html` 里写死的三条数据预取（`data/maps.json` 等）是 eden 的；其它包打开时这三份也会下载一次（不影响功能，手机上多几十 KB）。
- 历史键 `edenEstateLabels`（庄园标注开关）不在 `edenMap*` 命名空间里，其它包与 eden 共用；新包没有庄园页，目前不会写它。
- id 规则与键前缀规则在 `core/pack.mjs`、`viewer.html` 首帧前置、`tavern/eden-map.js` 各有一份同步副本（首帧与宿主都不能等模块），`tests/pack.test.mjs` 对照。
