# mvu_093 审阅简报（r1）

仓库工作树：`/private/tmp/claude-501/-Users-davidzhao-dev1-cctest1----threejs/74953db8-616f-4930-990a-ecda526b05a1/scratchpad/wt_mvu`（分支 mvu093，基于 cloud/tc-mid-low 5c0cbe3）。
本轮 diff：`git diff 5c0cbe3..HEAD` 加工作区未提交的文档改动（`git diff`）。

## 目标（v0.9.3 MVU 联动，外挂脚本 + 世界书附加条目，不改卡）
1. 人物位置：MVU 在场人物「位置」→ 聊天标签 → 推断；列表标来源。附加条目「地图人物位置 v1」。
2. 自定义名称与用途：聊天变量顶层键 `eden_map`（不进 stat_data），设置栏「自定义」、剧情标签 ⌖改名 / ⌖用途、可选同步世界书（默认关）、注入摘要、旧 localStorage 叫法迁移、EdenMap API（旧名保留）。
3. 按当前地点注入方位：3 条 EJS 条目（每层一条），只展开匹配的一处，中性描述。
4. 世界时间：标题栏紧凑时刻、上层 / 中层夜色（设置可关）、事件按剧情时间排序。
5. 着装：`getOutfit()` / `on('outfit')`，本人地点卡「着装：…」。

## 关键发现
卡注册了 MVU zod 结构（`z.object`，默认丢未知键；本机 zod 4.6.5 验证：`在场人物.X.位置` 与顶层 `地图` 都被删）。所以位置主要靠标签；自定义数据放聊天变量 `eden_map`。给作者的备忘 `docs/author-compat.md`（暂不发）。

## 关键文件
- `map/tavern/mvu.mjs`（纯函数）、`map/tavern/characters.mjs`、`map/tavern/eden-map.js`（宿主脚本）、`map/tavern/selfcheck.mjs`、`map/tavern/events.mjs`
- `map/custom.js`（查看器：自定义栏、夜色、着装行、提示）、`map/chars.js`、`map/viewer.html`、`map/here.mjs`
- `tools/build_worldbook_addon.py`（生成附加世界书；`python3 tools/build_worldbook_addon.py --out /tmp/x.json` 可看输出和 token 数）
- 测试：`tests/mvu.test.mjs` 等（`bash tools/smoke.sh`）；浏览器：`tools/browser/mvu093.mjs`（51 项全过，Chromium + WebKit + 手机 + 无变量接口），`accept.mjs` 全过，`chars092.mjs` 全过
- 文档：`CHANGELOG.md`、`ROADMAP.md`、`docs/content-compat.md`、`docs/map-events.md`、`docs/tt-test-checklist.md` 8c

## Token
附加世界书常驻约 2289 → 2614 tokens（r1 修复后 2589）；方位条目 EJS 展开后每轮最多约 81 tokens（源码约 750 / 条，不直接发给模型；没装提示词模板扩展时会原样发出，自检警告）。

## 截图
`docs/reviews/mvu_093/shots/`：mvu_{desk,deskwk,phone}_{night,outfit_card,people,settings,toast}.jpg（toast 截图是改位置前拍的：现在提示移到地图顶部居中，不再压住列表）。

## 约束（审阅时也要检查）
- 只做技术兼容：不按关键词过滤用户文字。
- 仓库文字与示例保持中性。
- 附加规则只引用我们自己的字段（位置、地图 / eden_map、⌖ 标签），不抄卡的字段名或原文。
- 不写卡自己的变量。缺 MVU / 缺字段要安静降级并在自检里说明。
