Status: policy (R2 T5, 2026-10-01).

# Render assets: what is built, what is borrowed, and texture scale

## Library policy

- **Focal buildings are built.** Anything a review board names, anything a marker points at, anything that has a
  card-backed setting block: modelled in the landmark's `build.py` from a reference board, never taken from a library.
- **Background dressing may come from CC0 libraries.** Vegetation, rocks, street furniture, fences, generic props seen
  at distance or as filler, from sources whose licence is CC0 (Poly Haven, ambientCG). Nothing with attribution,
  no-derivatives or non-commercial terms; nothing scraped from stock or news sites.
- Library models stay background: if a borrowed asset becomes a review defect, it is either replaced by a built one or
  moved further from the camera; it is not patched in place.
- **Provenance is kept, not shown.** Each borrowed asset goes into the landmark's asset list (name, source URL, licence
  line) in `docs/landmarks/<id>/assets.md`, and its files live under `blender/data/props/` (git-ignored, like the
  existing textures). No on-image or in-UI labels of any kind.
- Borrowed meshes are simplified to the tri budget of the group they join (manifest `budgets`); trees and scatter use
  instances or the existing `K_` scatter helpers, not unique copies.
- No library asset may contain text, logos or real-world signage; strip or replace such materials.
- Content neutrality: assets are placed as the setting needs them; the pipeline never filters or renames content.

## Texture-scale checklist

Run through this when a draft / study shows "wrong-sized" material (giant bricks, smeared grain, visible tiling).

1. **Texel density is stated per metre.** Material scale is in metres per tile in the `C.pbr(name, id, scale, ...)` call
   (box projection; object coordinates are world metres). A 2K tile covering 2 m gives 1024 px/m; covering 4 m gives 512.
   Pick the scale from the real-world module (brick course ≈ 7.5 cm, plank ≈ 15 cm, paving slab ≈ 0.6 m), then check the
   resulting px/m against what the final camera needs.
2. **Final-camera budget.** At the final resolution, one metre of the main facade should cover at least as many image
   pixels as the texture gives texels per metre (otherwise it is wasted), and no fewer than half (otherwise it blurs).
3. **Visible repeat.** Look at a clay + textured pair at the same camera: a repeat should not be countable on the
   facade. If it is, add a larger-scale noise / weathering mix or a second tile at an unrelated scale.
4. **Grain direction.** Wood, brick courses, stripe and plank textures run along the member's long axis: boards
   horizontal on a deck, vertical on a door; courses horizontal on walls. Box projection picks the axis by face normal,
   so check a rotated member (a pitched roof, a diagonal brace) separately, and rotate the mapping rather than the mesh.
5. **Roughness and normal scale follow the colour scale.** Mismatched scales (colour at 2 m, normal at 0.5 m) read as
   a printed decal. Keep all channels of one material on one mapping.
6. **Neighbours match.** Two materials of the same real thing (wall and its repair patch) share density within ±25 %.
7. **Grey test.** The clay render (`landmark.py clay`) must already read correctly in proportion and silhouette before
   textures are debated: a texture fix never repairs a geometry problem.
8. **Record the decision.** When a scale is changed in response to a review, one line in the review round
   (`docs/reviews/campaign/<id>/r<N>.md`): material, old scale, new scale, reason.
