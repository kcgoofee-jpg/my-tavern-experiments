# r1 — heavy RP player — score 7/10
Spec met: people tab beside events, auto-add from tags + MVU, per-person and global toggles, avatar hook (EdenMap.setAvatar, local only), distinct round avatar markers vs square event glyphs. Names shown unfiltered.

- **P1 MVU false positives** — map/tavern/characters.mjs `mvuChars`: any table whose rows have 位置/地点/location becomes "people" (e.g. 物品 {匕首:{位置:'腰间'}}, 势力 {..:{所在地}}). Fix: only tables whose key matches 人物/角色/NPC/characters/关系, or rows with a person-ish field. Accept: unit test with 物品/势力 tables yields 0 people.
- **P1 Card repeats name** — map/chars.js `card()`: title 艾琳 then dl row 艾琳 / 第 41 楼 (chars_desk_fly.jpg). Fix: single person → "最后出现：第 41 楼 · 来源"; rows only for groups. Accept: single card has no duplicated name.
- **P2 Stale people never age out** — collectChars keeps anyone in window; dim "久未出现" after N floors.
- **P2** Show resolved place for "和你在一起" rows when 世界.当前地点 has multiple parts.
