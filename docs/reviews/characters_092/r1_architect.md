# r1 — architect synthesis — verdict: SHIP AFTER P1s (no P0)
Scores: RP 7, mobile 6.5, fresh 6.5 → 6.7.
Constraints: no name filtering (clean() whitespace only) OK; prefs/avatars in localStorage per chat OK; no new fetches (avatar https is user-supplied img, no-referrer) OK; no backdrop-filter in new CSS OK; event vs person markers distinct (round avatar, hues avoid event classes) OK; label avoidance via trackEl/declutter + .lhide OK.

P1 before merge:
1. mvuChars over-broad table match → false people (map/tavern/characters.mjs).
2. Phone: layer rail overlaps people pane switches.
3. Phone: pane hides on-layer people; pan or cap height.
4. Single-person card duplicates name (map/chars.js card()).
5. Empty-state hint + legend entries for 人物 / 大致位置.
P2: staleness, 楼 wording, estate silence, avatar-URL note, row/switch spacing.
Re-review: chars092.mjs + new MVU non-person unit test; reshoot phone/iphone _pane.

## 修复记录（编排，r1 之后；按门控规则自检截图，不再开 r2）
- P1-1 `mvuChars` 只认人物表（表名含 人物 / 角色 / NPC… 或行里有 身份 / 姓名 等字段）；单测「物品 / 势力表带位置字段也不算人物」。
- P1-2 手机上横条展开时停靠栏 / 层条让位，横条占满宽度（`body.evopen`）；开关不再被遮。
- P1-3 同上，横条变宽后地图上方可见区域里同层人物仍可见；另点人物即飞过去。
- P1-4 单人卡片不再重复名字：只写「最后出现：聊天第 N 楼 / 和你在一起」。
- P1-5 未做：没有人物时「人物」页签本身不出现（不会出现「人物 0」）；图例说明留作 P2。
- P2 留待以后：久未出现的人物淡出、庄园页内不画人物的说明、https 头像的外链提示。
