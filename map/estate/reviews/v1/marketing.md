# Eden Manor v1 — luxury-marketing re-review

**Score: 7.5/10** (v0 was 5). It now reads as a family seat, not a show-home. Much of that comes from the axis, the crest and motto, and the 传承 rows. Lighting and the interior finishes are what keep it from 9.

## Fixed since v0
- **Five-part Palladian front.** The library tower, west and east colonnades and the music hall are in; the servant building and hangar are out of the hero shot.
- **First view shows the whole axis.** It runs landing platform → 中轴大道 → 前庭 → 门廊 → dome → lake, on both desk and mobile. The mobile framing is excellent.
- **Title is now 伊甸家族府邸** with a crest glyph and the gold serif motto 「始建约一百九十年 · HORTUS SUPRA NUBES」.
- **Room card has a gold rule, a 传承细节 row and a 年代 row** (大厅: longcase clock; 餐厅: head chair; 肖像廊: empty frame).
- **◆ heirloom markers and a 9-stop 传承 tour.** The tour tab is gold.
- **Portrait gallery on crimson silk**, hall floor crest, pediment crest, red scagliola columns and gilt pier glasses.
- **Warm sun at #ffd9a0, about 22°, hemi 0.5.** The fps overlay only shows with `?stats=1`.

## Remaining issues (ordered by impact)
1. **Midday lighting still.** The exterior is bright and evenly lit, the shadows are short, and the fog doesn't show.
   - `main.js` L71: set `SUN_DIR` to (-0.9, 0.26, 0.34), about 15°.
   - Sun intensity 3.1 → 3.4; hemi 0.5 → 0.38.
   - Pull `FOG_ON` near/far in to roughly 55%/85% of the current distances so the lake and woodland edge warm up.
   - Apply `#grade` on every tier (L56, drop the `tier < 2` condition), or at minimum on T0/T1.
2. **Checkerboard is still everywhere** (hall, 早餐室, both washrooms), which still says "diner / hotel".
   - Hall: keep the diagonal pattern but switch the black tile to #6b6258 grey-veined, then add a 0.6 m border band and a gold fillet.
   - Washrooms and 早餐室: use plain veined marble (`marbleC`).
3. **"All" view clips floor chips** ("F · 日常层", "F · 礼仪层") behind the left nav bar. In `viewFor('all')` (L258), offset `target.x` by about +10, or anchor the chips on the right-hand façade.
4. **Portrait gallery and 480 ㎡ rooms feel empty.** In the gallery:
   - Scale the portraits about 1.5×.
   - Add 2 benches, 2 console tables with the busts, and a centre table.
   - Make the empty 12th frame read from the default zoom: crimson glow and ◆ always visible.
5. **Too many exterior labels at first view** (about 20). Show only 主楼, 门廊, 图书馆塔楼, 音乐厅亭, 中轴大道, 停靠平台 and 人工湖. Everything else should appear on hover or zoom above 1.4. In `cullLabels` (L326), raise the area-label threshold `pri < 8` to `< 9` and tag the seven labels above as `pri` 9–10.
6. **Title panel still carries 「新古典主义府邸 · 剖切模型」.** Drop it or change it to 「帕拉第奥五段式 · 204 m 立面」 (the `sub` string at L224). In room zoom, the panel also sits over the scene; give it a solid `--panel` background.
7. **Tour stop 1 should be the landing ring** (arrival), at theta 0, phi 1.1, with the avenue receding. Also auto-offer the tour after 4 s idle on first load, as a gold pill that says "◆ 传承导览".
8. **Gold on the exterior.** Gild the pediment crest and add a gold armillary on the library tower; at w = 60 both are still smaller than about 4 px. Scale their `view.w` stops and add emissive 0.15.

## Keep
The axis framing, the crest and motto, the card's 传承细节 and 年代 rows, the ◆ markers, the dining room, and the red columns in the hall.

There is no sexual or restraint-related content in the model, and nothing here adds any. The neutral private rooms stay neutral.
