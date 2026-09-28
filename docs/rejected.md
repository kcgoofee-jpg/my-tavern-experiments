# 用户已否决清单（禁止复发）

来源：`docs/render-retro.md`（W3/W4/W5 根因）与用户记忆节点（`~/.claude/projects/.../memory/*.md`）。**所有审阅人设提示词必须读这份文件**，逐条确认本轮没有复发；复发按 P0 处理。新的否决项加在下面，注明日期与出处，不要删除旧条目（作废的画删除线，别整段拿掉）。

| # | 否决内容 | 用户原话 / 出处 | 适用范围 |
|---|---|---|---|
| 1 | 上层云海不做岛影，只留白云遮挡岛底 | 「这些岛的阴影也全都一样看着水滴很诡异，先全部不做阴影，就白色云层遮挡，后续要做的话等我 approve」（`no-island-shadows.md`；`bbe0d92`, `834bc37`） | art（upper/clouds） |
| 2 | 不要飞艇；已按卡对齐把飞艇改成悬浮车 | `render-retro.md` §1.1「按卡对齐重渲（去小教堂、飞艇改悬浮车）」`6751f02` | art、estate、landmark |
| 3 | 不做平铺矢量 / 卡通风「美术」；底图必须 Blender 写实打底 | 「这不就是我说的要避免的动画风格吗」（`map-art-style-and-review.md`） | 所有美术产出 |
| 4 | 图集（画廊）功能是给用户自己上传照片用的（衣帽间图集 / `eden_custom_portraits`），不是让 agent 塞图或内容 | `map/estate/main.js` `gallery` 字符串、`docs/card-digest.md` 的 `eden_custom_portraits` / `eden_portrait_<名>` 键位说明 | estate、ui |
| 5 | 不编地名 / 不用占位名，也不做运行时名字绑定层；一律照抄卡内原名（含成人向字样） | 「成人向字样 github 上没影响，要做兼容，所以不要乱动…尽量保证按原卡」（`card-canon-names.md`）；`10f6c2c` 删绑定层改回原名 | art、estate、landmark、card |
| 6 | 不画卡里没有的内容（非卡自建建筑 / 场景），如顶楼别墅群、小教堂、售货亭、将军官邸、以太研究院 | `render-retro.md` §2 W5；`card-only-scope-dlc.md`「卡没有的先不放进去，作为 dlc 预备」 | art、estate、landmark |
| 7 | 不做性相关或束缚类道具与细节的建模 / 描写（名字照抄除外） | `card-canon-names.md`、`modelling-scope-user-ideas.md` | 所有建模 |
| 8 | 不过滤 / 不审核用户聊天内容；地图只做技术兼容 | 「屏蔽词命中不要做…我们做的是技术兼容」（`tech-compat-no-moderation.md`） | 所有代码 |
| ~~9~~ | ~~新技术路线 / 重点资产开工前必须先给用户风格帧 + 375 px 手机截图并等 OK~~（2026-09-29 用户解除等待要求：改为 glm-5.3-flash 看图代理自检 + 图存档 `~/eden-map-review/`，见 `docs/onboarding.md` §6） | `render-retro.md` §7 第 1 条；W2（庄园 three.js 整线作废） | 所有人设、所有新路线 |

## 使用方法

- 派人设审阅前，`tools/review/pack.py` 生成的简报会引用本文件；人设提示词模板需在「共同规则」里加一句：读 `docs/rejected.md`，逐条确认没有复发，复发记 P0。
- 发现新的用户否决，追加一行到上表，写清日期、原话或出处、适用范围；同时检查是否需要在 `tools/review/personas/*` 里补一条检查点。
