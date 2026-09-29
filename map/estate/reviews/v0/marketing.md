# Eden Manor v0 — luxury-estate marketing review

**Score: 5/10.** The house is clean, correctly proportioned and legible. The hexastyle portico, balustrades, belvedere dome, parterres and fountain all read "grand". It still presents as a bright architectural diorama or a new show-home, not a 190-year family seat. Most of the §2/§7 selling points are either not modelled or not in frame.

## What to keep
- Orthographic isometric cut-away with floor tabs. It is the best device here for "walk the floors" storytelling.
- The gold #e6c36a UI accent, the pinned-card highlight, and the restrained dark cards.
- Portico and gilded pediment oval, ribbed dome with gold finial, and the 餐厅 long table with its candelabra.
- The balance between the formal French front and the lake behind it.

## Change list (ordered by impact)

1. **First view = the axis, not a corner.** The current opening shot (AZ 0.62) crops off the landing platform (z 268), and the service block (仆役楼) and hangar (机库/马车房) flank the house like wings. Open on a low, near-axial three-quarter from behind the 停靠平台 (theta ≈ 0.25, phi ≈ 1.05), framed from the gilded landing ring → avenue → fountain → portico → dome → lake pavilion. Add a two-second slow dolly on load. Use a portrait variant on mobile, which currently just shrinks the desk shot.
2. **Fix the five-part composition (§2.1).** Model 图书馆塔亭 (west, octagonal tower to 28 m, lead dome, gold armillary finial) and 音乐厅亭 (east, barrel vault, apse). Join them with Ionic colonnades. Move 仆役楼 and 机库 to their §2.2 NW positions behind the woods. Nobody sells a Palladian house with the garage in the hero shot.
3. **Late-golden-hour light.** Drop the sun to about 20° from the west-southwest and warm it to #ffd9a0, set hemi to about 0.5, and raise exposure slightly. Add long shadows, a faint warm fog on the lake and woodland edge, and 2,700 K glow in the windows (§4). Grade toward warm highlights and olive-teal shadows. Add a cream-vellum page background and a soft vignette in place of the transparent flat ground.
4. **De-show-home the interiors.** Replace the black-and-white checkerboard in 大厅/楼梯厅 with the crest floor inlay (§7), plus veined marble with a border. Cut the potted palms by about 70%. Swap the royal-blue and saturated red rugs for faded Persian tones. Give stone some patina. Gild picture frames, the lift cage and the chandelier arms.
5. **Heritage props, modelled and labelled.** Priority order:
   - crest (azure shield, gold apple tree, gold wings, griffins) as the pediment relief and hall floor inlay;
   - 长箱钟 in 大厅;
   - 胸像 ×6 with an empty plinth;
   - 肖像廊 with 12 gilt frames, the last one empty on crimson silk;
   - brass cage lift with its dial;
   - 初代书桌 with the ink stain (书房);
   - 主位椅 with the carved crest (餐厅);
   - armillary on the library tower;
   - organ pipes;
   - first-generation boat at the 水榭.
   Put a small gold ◆ marker on each so it can be clicked.
6. **Add a 传承细节 line to the room card.** Add a gold-ruled row after 用途, taken straight from the §4 lines, plus a 「始建 · 初代 / 二代…」 row sourced from the §7 沿革 table. At the moment the cards read like a floor-plan spec (尺寸 ㎡, "src 推断"). Move the source badge to a debug toggle.
7. **Change the label hierarchy.** Service rooms (监控室, 洗衣/储藏, 女仆长办公室, 仆役厅, 附属用房) should sit at the lowest priority and show only on hover. Promote the selling rooms. Rename "剖切模型" in the title to something like 「伊甸家族府邸 · 始建约一百九十年」. Add the motto 「HORTUS SUPRA NUBES」 under the wordmark, with a small crest glyph.
8. **Add a heritage tour mode.** A "传承 Heritage" tab of 6–8 preset shots (landing ring → pediment crest → 长箱钟 → 肖像廊 → 初代书桌 → 管风琴 → 湖心圆亭), each with a one-line caption. This is the brochure sequence.
9. **Materials.** Warm the roofs from flat grey to lead-blue-grey. Stripe the lawns more subtly. Add bronze and verdigris to the landing rail. Add gold leaf to the dome ribs and lake-pavilion ball.
10. **Hide the fps/tris overlay** by default, and drop the dev hint line on mobile.

Keep all content architectural and domestic. No sexual or restraint-related content appears or should be added. The neutralised 私人房间/附属用房 stay neutral.
