# Estate v1: interaction and performance re-review

**Score: 7.5 / 10 (v0 was 6.5).** The interaction and loading fixes are done well. The budgets are still missed: tree crowns and balusters take about 40 % of the triangles, and furniture for one floor is built synchronously before the first frame.

## Fixed since v0
- Parent-page scroll and zoom are blocked: a window-level `wheel` handler, `overscroll-behavior`, and Safari `gesture*` events.
- three.js is vendored with `modulepreload` and an 8 s watchdog with a retry button.
- `ensureCut`/`ensureFurn` build floors lazily, followed by `compileAsync` warm-up.
- Tiers T0/T1/T2, 0.75× DPR while dragging, and an adaptive downgrade when frames are slow.
- The pin pulse runs at 15 Hz and stops after 2 s.
- The site is split into tiles and uses `detail`/`fine` sub-batches.
- Physical sheen/clearcoat materials and a fixed number of warm lights.
- A 250 ms single-tap delay, `+`/`-`/`0` keys, and a bottom chip row on mobile.

## Where the triangles go (my measurement, `floor=ext`, 1280×800)
- Tree crowns: `site:crown2` 96k and `crown` 93k. Trunks: 27k.
- Balusters: `full2` 63k, `full4` 41k, `full0` 16k; the F1 view also has `site:baluster` 48k.
- Trim: `full0` 35k, `full2` 32k, `site` 30k.

## Changes, ordered by impact
1. **Tree LOD (lib.js `initProtos`, main.js `updateSubs`).** Give `crown`/`crown2` an `IcosahedronGeometry(1,0)` variant (20 triangles instead of 80). Use it when m/px > 0.12 and on T1. Build trunks with 5 segments. Expect about −150k triangles.
2. **Baluster impostors (building.js `balustrade`, site.js).** When m/px > 0.08, draw runs of more than 4 balusters as `balPanel` alpha-tested quads (2 triangles each). Show the lathe instances only in close-up floor views. Expect about −100k triangles in the exterior and −45k in F1.
3. **Nothing heavy before the first frame (main.js start-up).** Remove the synchronous `ensureFurn(4)`: furniture for one floor costs about 700 ms (`furn0` 728), and the roof terrace is sub-pixel at exterior zoom. Queue it first in `onFirstFrame`. Call `renderer.compileAsync(scene, camera)` before the first `render`, and don't post `estate:ready` until it resolves. This keeps link and compile time (25 programs) off the first frame. Expect desktop first frame around 2.0 s in SwiftShader and under 1 s on a real GPU.
4. **Split the idle jobs (furniture.js `furnish`, main.js `next`).** One job is currently 430–730 ms, which stalls the 2.2 s intro fly-in. Make `furnish` a generator that yields per room. Batch.build then merges once at the end. Also start the idle queue only after the intro `flyTo` ends. Expect no long tasks over 50 ms during the intro.
5. **Draw calls on mobile (main.js `site` Batch).** T1 makes 203 calls against 149 on desktop. Use `tile: 256` on T1, or skip tiling for the far `site` materials. Merge the `detail` groups of neighbouring tiles. Expect ≤ 150 calls.
6. **LOD thresholds in metres per pixel (main.js `updateSubs`).** `detailOn = visW <= 300` measures world width. On a 375 px portrait screen that switches full detail on while each pixel covers more ground. That is why mobile draws 631k triangles, more than desktop. Use `visW/innerWidth` against a fixed m/px.
7. **Watchdog (index.html).** Once the module has started, reset the 8 s timer on every build phase. A slow T1 phone should not see "加载失败".
8. **Environment (main.js).** Build the PMREM (343 ms here) from a 64 px `RoomEnvironment` cube, or cache it as a KTX2/HDR file in `assets/`.

Items 1, 2 and 6 bring both targets to about 300–400k triangles; item 5 gets T1 to 150 calls or fewer. Items 3 and 4 cover the first frame and the intro.

## Keep
Everything listed as fixed, the vendored three.js, the fixed number of lights, and the `estate:ready` protocol.
