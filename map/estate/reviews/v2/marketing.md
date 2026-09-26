# Eden Manor v2 — luxury-marketing re-review

**Score: 8.5/10** (v1 was 7.5, v0 was 5). It now reads as a heritage estate. What's left is polish, not structure.

## Fixed since v1
- **Golden hour:** sun at about 15° (#ffd9a0, 3.4), hemi 0.38, warm fog. The grade is warmer and more olive, and the lake haze reads.
- **Exterior labels** cut to the selling set: 主楼, 门廊, 图书馆塔楼, 音乐厅亭, 中轴大道, 停靠平台, 人工湖.
- **Title sub** is now 「帕拉第奥五段式 · 204 m 立面」, and the title sits on a solid panel.
- **Hall floor** is taupe and cream diagonal marble with a crest medallion, so the diner look is gone.
- **"All" view:** the floor chips have moved to the right-hand façade and are no longer clipped.
- **Portrait gallery:** larger portraits, benches, a centre table and an empty-frame ◆.
- **Tour pill** "◆ 传承导览" appears after 4 s idle.
- **Room card** has a 细节 stepper.

## Remaining changes (ordered by impact)
1. **Master-bath detail order.** Stop 1/3 is the WC, which is the wrong brochure image. In the 主浴室 detail list, put the Statuario tub (the heritage item, third generation) first, then towels and vanity, and the WC last or not at all. Apply the same ordering to 访客盥洗室 and 客房 A.
2. **Window glow at golden hour.** Façades still look unlit. Give window glass on the south and west façades emissive #ffc27a at 0.25 in `ext` mode only.
3. **Exterior gold still unreadable at the first view.**
   - Pediment crest and armillary: add emissive 0.2 and scale the crest about 1.3×.
   - Gilt the lake-pavilion ball and the dome finial.
4. **Shadows are still short in the ortho view.** Drop `SUN_DIR` y from 0.26 to 0.2, and keep the tight shadow frustum on the house so the portico columns throw visible stripes.
5. **Lawns look flat and uniform.** Add subtle mow stripes along the avenue only, at alternating lightness ±4%.
6. **Mobile first view:** 西柱廊 and 东翼 labels clip at the screen edges. On portrait screens, hide area labels whose anchor falls within 24 px of an edge.
7. **Marketing captures:** shoot without `?stats=1`, and grab the exterior after the pill appears so the tour call-to-action is in frame.

## Keep
Everything added in v1 and v2: the axis framing, crest and motto, 传承细节 and 年代 rows, ◆ markers, the tour, the new hall marble, and the golden-hour grade.

There is no sexual or restraint-related content in the model, and nothing on this list adds any. The bathroom close-ups are fixtures only.
