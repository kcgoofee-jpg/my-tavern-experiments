# Eden requirements (EQ index) — the user's asks for the Eden estate, checked against the shipped version

Status (2026-09-30): 65 requirements · shipped version: 46 met, 13 partly, 5 missing, 1 superseded · the r5 draft
changes 12 of them in 9 groups (G1–G9, see §14), awaiting the user's review — nothing shipped yet.

- **Baseline = the shipped version** (user 2026-09-30: 「不通过，暂停，用现在已经在脚本上的那个版本」): the estate2 r4e
  scene in `blender/estate2/*` (225827d, e233077), `map/estate/model/site.glb` + `site_low.glb` (ebdce14), `house.glb`
  manifest v 2026-09-28b (435a0c5), cover `map/art/covers/eden_1600.jpg` / `eden_800.jpg` (172cfbd, estate2
  `style_frame.py --view whole`), upper-map Eden = `blender/estate2/map_cutout.py` → `tools/eden_into_upper.py` (+ the
  hi-res inset `map/art/tc_upper_eden.dzi`, ed0a26a). The legacy generators (`blender/eden_manor.py`, `blender/estate/*`,
  `blender/islands/eden.py`) are not the shipped version and count as no evidence.
- Fields: **id | date(s) | the user's words | scope | status in the shipped version | evidence**. Quotes in 「」 are
  the user's words verbatim as recorded in the repo; *(para)* marks an English paraphrase where the chat wording is not
  in the repo. Dates are the chat dates from the recovered list (2026-09-26 … 2026-09-30).
- Scope: **island** (the estate2 scene: cover, upper-map cutout, site.glb), **house** (house.glb, rooms), **page** (the
  estate 3D page and map data), **lore** (worldbook add-on). Only island-scope gaps are changed in `eden:r5`; house and
  page items are recorded here and left for their own items (`estate:b1b2`, page work).
- Status: met / partly / missing / superseded (with the later decision). A line gets `→ r5 Gn` when the r5 draft
  changes it; when the user approves and r5 ships, the status is struck through in place and replaced.
- Reproduced baseline renders (T3, 16 spp, same angles as the r5 after-renders): `~/eden-map-review/render/eden_r5/`
  `1_aerial_before.png` (as the cover), `2_topdown_before.png` (as the upper map), `3_arrival_before.png`,
  `4_lake_before.png`. They match the shipped cover and the upper-map inset in layout.

## 1. Hero island

- EQ-01 | 09-26, 09-28 | 「user 的庄园做成别人的 10 倍大比较合眼，也方便后续在上面 build」 (docs/upper-estates.md:5); 主体感, foreground | island | met | `blender/data/tc_islands.json` eden rx 3.35 / ry 2.5 (≈ 26 ha vs 2.3 ha for isle6); `map/data/upper_depth.json` eden scale 1.35, haze 0, focus island; docs/reviews/upper_b2/b_setting.md:19 measures 11.5×
- EQ-02 | 09-26, 09-27 | 「不是说按真实素材的富豪顶奢庄园吗？」 (docs/history/GOAL_v0.9.1.md:210); real Blender renders, never a three.js / toy look | island | met | estate2 is Cycles with scanned PBR materials and Poly Haven trees (82aa293, 10bec6d); site.glb is a Blender bake (ebdce14); r4 round-3 reviews 7 / 7 / 7.5 / 7 (docs/reviews/eden2_r4/)
- EQ-03 | 09-26 | *(para)* top-luxury, heritage feel, detail that reads up close | island | partly → r5 G6 | RESUME.md r4e leftovers: Greystone yews are smooth cones, garden steps pure white, cottage chimneys plastic orange, gym roof a bare slab

## 2. References (docs/eden-references.md)

- EQ-04 | 09-27 | Mar-a-Lago: 「除了中间的水池感觉有点丑都还可以」 | island | met | docs/eden-references.md:7; `layout.ARC` (half-round colonnade, court is lawn + palms, no pool); `buildings.arc_colonnade`
- EQ-05 | 09-27 | Biltmore: 「还行」 | island | met | `layout.DRIVES`, esplanade pad, `gardens.canal` (avenue with rill, landing → forecourt)
- EQ-06 | 09-27 | The Breakers: 「不错，但放主楼偏小」 → one corner | island | met | `layout.BREAKERS` (232, −148) on the south-east headland, pool
- EQ-07 | 09-27 | Greystone: 「适合单独一个角落」; real proportions, its planting and terrain | island | met | `layout.GREYSTONE` (E-plan ≈ 76 × 46 m), `gardens.greystone_gardens` (upper reflecting pool, motor court, double stair, koi pool, cascade), cypress allée in `vegetation.plan_points` 6b (225827d r4d)
- EQ-08 | 09-27 | Nekajui: 「用户喜欢，要融合」 | island | met | terraced terrain (`layout.PADS`, `natural_h`), covered walkways, funicular, rope bridge, treehouses; its "continuous canopy" part is superseded by EQ-30
- EQ-09 | 09-27 | *(para)* one non-main cottage after the Warner estate | island | met | `warner.py` (Tudor cottage + grotto pool + koi pond), e233077
- EQ-10 | 09-27 | *(para)* liked "Modern Coastal Hillside Villa" and the car assets | island | met | `sketchfab.py` (villa variants, Maybach / DB11 at the portico, landing, garage); blender/estate2/CREDITS.md:19–21
- EQ-11 | 09-27 | Chatsworth, Vaux-le-Vicomte: 「不要」 | island | met | docs/eden-references.md:12; nothing of either in estate2

## 3. Layout

- EQ-12 | 09-27 | *(para)* main building on the central terrace | island | met | `layout.PADS` plateau (0, 8) z 30; `layout.MAIN`
- EQ-13 | 09-27 | *(para)* roof lookout; F4 / F5 are not floors | island + page | partly | island met (`web_zones` tower = 屋顶眺望亭; house floors B2–F3, map/estate/main.js); page data still says 「F4 顶楼与 F5 屋顶眺望亭」 in map/data/maps.json:129 `src_note` (points at a deleted demo.html)
- EQ-14 | 09-27 | *(para)* landing platform → long driveway → forecourt fountain | island | met | `buildings.dock` (0, −268), `layout.DRIVES`, `layout.FOUNTAIN` (0, −113); zones dock / avenue / fountain
- EQ-15 | 09-27 | *(para)* rose gardens | island | met | `layout.GARDENS` rose / rose_w (±58, −104), `gardens.parterres`, `gardens.pergolas`
- EQ-16 | 09-27 | *(para)* artificial lake | island | met | `layout.PADS` lake (−12, 142), `terrain.build_lake`; zones lake / waterside / islet
- EQ-17 | 09-27 | *(para)* guest buildings | island | met | `layout.GUEST` g1, g3, spa, w_g1 (8 → 4 in r4 round 2)
- EQ-18 | 09-27 | *(para)* villas cut from 10 to 4 | island | met | `layout.VILLAS` v1 / v2 / v3 / v8 (225827d)
- EQ-19 | 09-27 | *(para)* open south arrival | island | met | `layout.open_sides`, `wood_mask`; cliff-edge promenade (225827d); `3_arrival_before.png`
- EQ-20 | 09-27 | *(para)* west farm terraces | island | partly → r5 G2 | `layout.agri` / `agri_z`, `terrain.mat_terrain` agri block; all four r4 round-3 reviewers: bands too regular and even, lavender too saturated (docs/reviews/eden2_r4/*)
- EQ-21 | 09-27 | 悬浮车库 / 载具停靠坪 visible and marked | island | met | `layout.SERVICE` garage (−140, 138), hangar; `gardens.helipad` (−186, 170); zones.json garage / helipad / hangar; names per e233077 / b3a8c86
- EQ-22 | 09-27 | *(para)* dairy farm visible and marked | island | met (build fragile) → r5 G7 | `gardens.dairy` (links the props/dairy_parlour .blend), zones.json dairy; it is only built when `E2_DAIRY_BLEND` points at the .blend and otherwise skipped with a quiet line (gardens.py `dairy`)
- EQ-23 | 09-27 | *(para)* glass gym next to the open-air tennis court | island | met | `layout.GYM` (187, −110) beside `COURTS` (168, −100); `gym.py`; roof detail → EQ-03
- EQ-24 | 09-27 | no 「林中别墅 / 林」 labels; a different terrain there | island + page | partly → r5 G8 | terrain met in r4c (west third → farm terraces, east V4 → clifftop meadow, 225827d); the label is still live: map/estate/model/zones.json:284 name 「林中别墅」, map/data/maps.json:252 eden_estate area 「林中别墅」
- EQ-25 | 09-27 | *(para)* no airships, kiosk, tram or carriage house | island | met | e233077, b3a8c86; `buildings.dock` has no kiosk

## 4. Card places on the island (card-digest §6; card-backed places get a model)

- EQ-26 | 09-27 | 以太凝水塔 「供水」 (docs/card-digest.md:50, :228) | island | missing → r5 G5 | `layout.WATER_TOWER` exists only in plan2d; web_zones.py docstring: not built
- EQ-27 | 09-27 | 后庭园 · 露天训练场 (docs/card-digest.md:227) | island | partly → r5 G5 | hotspot `training` exists (web_zones.py) but the ground there is plain striped lawn (`2_topdown_before.png`)
- EQ-28 | 09-27 | 后庭园 · 围栏区 (docs/card-digest.md:227) | island | missing → r5 G5 | nothing in estate2
- EQ-29 | 09-27 | 后庭园 · 凉亭 (docs/card-digest.md:227) | island | missing → r5 G5 | `layout.GARDENS` pavilion only in plan2d (its spot (−84, 118) is inside the lake edge); web_zones.py docstring: not built

## 5. Planting and ground

- EQ-30 | 09-27 | *(para)* fewer trees, not identical, zoned (RESUME P0) | island | met | `vegetation.KINDS` six zoned species, ≈ −55 % instances (10bec6d); supersedes the Nekajui continuous canopy
- EQ-31 | 09-27 | 「只有深浅两种绿」 → vary ground and terrain colours (blender/estate2/RESUME.md:13) | island | met | `layout.cover` classes (meadow, agri, rimb, kitchen, beds, sand, grove), `terrain.mat_terrain`
- EQ-32 | 09-27 | *(para)* one side of the island rim without trees | island | met | `layout.open_sides` (south arrival and north crag open), `crag`
- EQ-33 | 09-28 | *(para)* the colour seen from above comes from planting and terrain, not a uniform green | island | partly → r5 G3, G9 | the east wood is one dark mass without glades or edge transition (landscape review r4 round 3 item 2); the north crag reads like snow in back light (`4_lake_before.png`)

## 6. Whole-island look

- EQ-34 | 09-27 | *(para)* oblique ≈ 35–40°, warm dusk light, long shadows | island | met | `style_frame.VIEWS['whole']` (≈ 36°), `LIGHTS['sunset']` sun 11°; cover
- EQ-35 | 09-27 | *(para)* the bird's-eye view is the cover | page | met | map/art/covers/eden_1600.jpg + eden_800.jpg; maps.json `cover` on eden_estate and the tc_upper eden marker (172cfbd)
- EQ-36 | 09-27 | *(para)* the stair-top pavilion fixed | island | met | 19dc4b4; docs/drafts/eden2_fix_stair_{before,after}.jpg
- EQ-37 | 09-27 | *(para)* the base can be replaced separately | island | met | `map_cutout.py` (transparent Eden cutout) + `tools/eden_into_upper.py` (`--no-inpaint`, `--scale`)
- EQ-38 | 09-27 | *(para)* small fixes re-render only the part being fixed | island | met | `style_frame.py --region` + `tools/region_patch.py` (19dc4b4)

## 7. Known open issues (blender/estate2/RESUME.md r4e, docs/reviews/eden2_r4/)

- EQ-39 | 09-27 | *(para)* lookouts read as white discs | island | missing → r5 G1 | five pads `view_rear`, `view_east`, `view_ne`, `look_sw`, `look_se` paved in white travertine; `1_aerial_before.png`, `3_arrival_before.png`
- EQ-40 | 09-27 | *(para)* night view: east wood completely black | island | missing → r5 G4 | docs/drafts/eden2_r4_topdown_night.jpg; `style_frame.night` has no light east of the villas
- EQ-41 | 09-27 | *(para)* night view: main-house halo too wide | island | partly → r5 G4 | RESUME.md r4e; 13 main volumes × 4 window lights at 500 W, 2.5 m out

## 8. Dairy (blender/props/dairy_parlour)

- EQ-42 | 09-27 | *(para)* no animals — milking equipment and an electric fence | island | met | build.py:1 「全部自建，无动物」; electric-fence paddock
- EQ-43 | 09-27 | *(para)* milk line ≈ 1 m above the stand | island | met | layout.py `MILK_LINE_Z = -0.08`: low line along the pit wall, ≈ 0.87 m above the pit floor where the milker stands; set after the user rejected the high line (97ae80f, 2026-09-27 18:34 local); docs/reviews/props_dairy/r1.md:31

## 9. Lore

- EQ-44 | 09-27 | *(para)* the old house is the love nest of {{user}} and the closest maid | lore | met | map/data/addon_places.json:14 「{{user}}与最亲近的那位女仆两人的私宅」; map/data/worldbook_addon.json:709

## 10. Upper map (docs/upper-setting.md §2, §4.1, §9.3, §11)

- EQ-45 | 09-28 | *(para)* brightest, warmest island at 1450 m | island | met | map/data/tc_upper.json eden alt_m 1450; upper_depth.json haze 0 (the altitude table is still marked awaiting approval, upper-setting.md:73)
- EQ-46 | 09-28 | no barrier ring (「伊甸光环」已否决) | island + page | superseded (partly) | upper map met (`tiancheng_upper.py` skips Eden); barrier ring and anchor stones deferred by the user indefinitely (2026-09-30), so `layout.BARRIER_STONES` stay unbuilt; the viewer's optional barrier overlay still draws a gold Eden ring (map/viewer.html:414) and zones.json has an empty `stones` hotspot — page items
- EQ-47 | 09-28 | *(para)* energy conduits never connect to Eden | island | met | upper-setting.md:51; `tiancheng_upper.py` excludes Eden from conduit candidates
- EQ-48 | 09-28 | *(para)* the largest rock cone with a hanging water cone | island | partly (open) | tc_islands.json eden underside: multi profile, 3 sub-cones, 3 cores; `blender/oblique.py` builds a water cone only for the twin profile. upper-setting.md §4.1 gives Eden the water cone, §11 (v15) gives it to Rothschild — no recorded decision (see §13)
- EQ-49 | 09-28 | *(para)* lake overflow falls on the east side | island | partly (open) | tc_islands.json eden `falls` (main −40° + two thin) for the oblique underside; upper-setting.md §9.3 keeps the Eden render itself unchanged and §10 Q2 still asks the user; not in the estate2 scene

## 11. House and 3D page (recorded only; not changed in eden:r5)

- EQ-50 | 09-28 | 「按原卡，不转换」 (2baf823): 3 floors above + B1 / B2, card room names and ids verbatim | house | met | map/data/eden_estate_rooms.json (`floorplans.py`); main.js floors B2–F3
- EQ-51 | 09-28 | *(para)* B2 medical and modification base: sterile room, cold white ceiling light, non-slip floor, emergency kit | house | partly | `medical_b2.py` (sterile room, cold-white LED panels), house.glb `f_B2_med` (435a0c5); floor is seamless PVC without a non-slip finish; the emergency kit is text only (储藏室 entry, eden_estate_rooms.json:664)
- EQ-52 | 09-28 | *(para)* exterior / see-through / cutaway | page | met | map/estate/main.js views ext / xray / sect (ebdce14)
- EQ-53 | 09-28 | *(para)* per-floor | page | met | main.js `setMode`, `estate:floor`
- EQ-54 | 09-28 | *(para)* a room tap or a chat mention flies there | page | met | main.js `flyTo`, `estate:room` from map/app/estate.mjs
- EQ-55 | 09-30 | *(para)* day / night | page | met | main.js daynight (53e60e8); map/estate/NOTES.md Part 9
- EQ-56 | 09-28 | *(para)* sharp on desktop, not blurry on mobile | page | met | main.js DPR cap min(DPR, 2), MSAA, anisotropy 8 / 4, tiers (map/estate/NOTES.md 视图)
- EQ-57 | 09-28 | *(para)* less clutter | page | partly | 36 outdoor hotspots incl. the empty `stones`; maps.json eden_estate areas still list unbuilt 树篱迷宫 / 迷宫
- EQ-58 | 09-28 | *(para)* the walk-in closet is its own entry; no gallery (galleries are for the user's own uploads) | page | partly | main.js:101 `GALLERY = {}` (gallery button gone; tools/browser/estate3d.mjs checks it); the closet 3D page `map/estate/closet/` has no entry point in main.js or the viewer; map/estate/NOTES.md still describes the old gallery button
- EQ-59 | 09-27 | 「用户说在自己的庄园里面想干嘛干嘛，我们做的是技术兼容，that's it。」「屏蔽词命中不要做。」 (docs/content-compat.md:3) | page | met | docs/rejected.md; no word filter in map/
- EQ-60 | 09-29 | no provenance labels anywhere | page | partly | the estate page still prints them: map/estate/main.js:146 and :582 (legend and room badge); `layout.PROGRAM` / `BASEMENT_LINK` comments carry them too

## 12. Working rules the user set for Eden

- EQ-61 | 09-30 | 「不通过，暂停，用现在已经在脚本上的那个版本」 | island | met | isle:eden declined (docs/plans/render-campaign-events.csv); this index and `eden:r5` start from the shipped estate2
- EQ-62 | 09-27 | 「全部自建；只优化俯视看得到的东西」 (blender/estate2/RESUME.md:3) | island | met | rock base, cloud collar and terrace vignettes skipped on purpose (`gardens.build`)
- EQ-63 | 09-27 | *(para)* upper map: pure white cloud floor, live clouds in the viewer | island | met | `terrain.build_white_floor`; `map_cutout.py`
- EQ-64 | 09-27 | 「three.js 不改了，后续需要重新用 blender 从头建模的」 (docs/history/NOTES_FROM_LOCAL.md:503) | page | met | ebdce14 replaced the procedural three.js model with the estate2 bake
- EQ-65 | 09-27 | *(para)* no island shadows on the upper map | island | met | docs/rejected.md #1; `mat_cloudsea` does not receive shadows

## 13. Contradictions and open questions

- EQ-48: upper-setting.md §4.1 (Eden has a hanging water cone) vs §11 v15 (Eden = white-grey main cone + sub-cones + three
  cores; the water cone goes to Rothschild). No recorded decision. Upper-map generator scope (`blender/oblique.py`), not
  touched by eden:r5 — **open for the user**.
- EQ-49: the east-side overflow falls are an open user question (upper-setting.md §10 Q2); not touched by eden:r5.
- Settled by a later decision (no action): docs/eden-estate.md §2.1–2.3 (Palladian five-part house, French parterres,
  maze, four anchor stones) is superseded by the 09-27 reference board (docs/eden-references.md 「已定」); the Nekajui
  continuous canopy is superseded by the 09-27 P0 "fewer trees" (EQ-30); the entity name 「林中别墅 ×4」 in
  docs/eden-lore-space.md R-18 is superseded by the label ask (EQ-24); the milk line (EQ-43) follows the later
  rejection of the high line.

## 14. r5 gap table (setting of `eden:r5`)

Every island-scope EQ that is partly / missing in the shipped version, and what the r5 draft changes. Everything else
stays as shipped (no re-layout; building positions, style, scale and outline unchanged).

- G1 · EQ-39 lookouts: warm grey old-stone paving instead of white travertine (`layout.LOOKOUTS` → `look` mask,
  `terrain.mat_terrain`), a 1.2 m low hedge ring inside the parapet with an entry toward the island (`outdoor.lookout_hedges`),
  one shade umbrella pine each (`vegetation.plan_points` 3b).
- G2 · EQ-20 farm terraces: ≈ 40 m plots along the contours with offset steps, crops rotate per terrace and plot, some
  vine rows across the slope, a fallow green crop, lavender muted and cut from 35 % to 22 %, wider darker dry-stone
  walls with a shadow line (`terrain.mat_terrain`, `layout.agri_step`, olive rows follow the new walls).
- G3 · EQ-33 east wood: 20–40 m glades of meadow east of x ≈ 110 with shrub edges (`layout.glades`), ≈ 10 %
  umbrella pines and a few autumn trees mixed into the east belt; the forest belt, clumps, solitary pines and cypress
  rows elsewhere keep their exact positions.
- G4 · EQ-40 / EQ-41 night: treehouse lanterns, lookout lamps and glade-edge garden lights in the east; main-house
  window lights weaker and closer to the walls (`style_frame.night`).
- G5 · EQ-26…29 card places: 以太凝水塔 (white-stone tower on a stone plinth, copper rings, pale crystal cap; moved to
  (−192, 80) on its own pad off the farm road), 露天训练场 (sand court, white three-rail fence, pull-up bars, parallel
  bars, climbing frame, plyo boxes), 围栏区 (white three-rail fenced lawn, gate toward the house), 凉亭 (white-stone
  8-column rotunda with a verdigris dome at the end of the house → lake axis) — `outdoor.py`, `layout.TRAINING` /
  `PADDOCK` / `PAVILION`; trees keep clear (`layout.places_sd`).
- G6 · EQ-03 close-ups: Greystone yews as lumpy two-mass columns, Greystone garden stonework in warm old stone,
  cottage chimneys in sooty brick, gym roof with coping parapet, sedum roof, skylight strip and two plant units.
- G7 · EQ-22 dairy: a missing dairy .blend now logs an `Error:` line, so the render log check catches it.
- G8 · EQ-24 label: hotspot 「林中别墅」 → 「别墅」 (old word kept only as a matching alias) and new hotspots 凉亭 /
  以太凝水塔 / 围栏区 in `web_zones.py`; they reach zones.json at the r5 ship step. maps.json eden_estate area
  「林中别墅」 stays as a matching alias (page data, not a label).
- G9 · EQ-33 rim: island-rim sand and north-crag ground slightly darker and warmer.

Not in r5 (recorded above): EQ-13, 46, 48, 49 (upper-map generator / open questions), EQ-51 … 60 (house / page).
