# Estate v2: interaction and performance re-review

**Score: 8 / 10 (v1 was 7.5).** The triangle budget and the first frame are now close to target. What remains: background building is starved, and draw calls are over budget in the floor and "all" views.

## My measurements (harness, SwiftShader, settled)

| View | Draw calls | Triangles | firstFrameMs |
|---|---|---|---|
| Desktop exterior | 146 | 348k | 2510 |
| Mobile T1 exterior | 126 | 339k | 2150 |
| Desktop F1 | 200 | 430k | — |
| Mobile F1 | 181 | 406k | — |
| Desktop all | 336 | 414k | 4390 |

Tree crowns fell from 189k to 48k triangles. The 612k figure is probably a close-up with `fine` switched on, which is acceptable at that zoom.

## Round-1 items
- **Done:**
  1. Low-poly crowns and trunks.
  2. `balPanel` stand-ins for balusters seen from far away.
  3. No `ensureFurn(4)` before the first frame, plus compile before the first frame.
  4. `furnishJobs` slicing, with the build queue waiting until the intro camera move ends.
  5. Larger site tiles on T1.
  6. Detail switched by metres per pixel.
  7. The watchdog restarts its timer at each build phase.
  8. Environment built from a 64 px cube (343 ms → 85 ms).
- **Partly done:** item 4. `ensureCut` is still one monolithic task of 240–480 ms.

## Remaining changes, ordered by impact
1. **Background-build starvation (main.js `onFirstFrame` → `run`/`schedule`).** 60 s after load, only furn4 and cut0 through cut2 are built; v1 finished in 21 s. A 12 ms slice per `requestIdleCallback`, with a 1 s timeout, is too little. Chain the slices with `setTimeout(0)` (or `scheduler.postTask({priority:'background'})`), and run a full slice even when `dl.didTimeout`. **Effect:** everything built in about 6–8 s, and no 1 s stall when switching floors on demand.
2. **Split `ensureCut` into jobs as well (building.js `buildCut` → generator per room or wall run, merge at the end).** **Effect:** no long tasks over 50 ms after the first frame.
3. **Draw calls in "all" and floor views (main.js `cullFurnAll`, lib.js `Batch.build`).** Merge the cut and furniture of the non-focused floors by material in "all" mode. Hide `detail` sub-batches outside the focused floor. **Effect:** "all" ~336 → ≤180 calls, F1 200 → ~150.
4. **First render (main.js start-up).** Of the ~1.0 s `firstRender`, much is the 2048 PCFSoft shadow pass. Draw the first frame with `shadowMap.needsUpdate=false` and fill shadows on the next frame. **Effect:** desktop firstFrame ≈ 1.8 s in SwiftShader.
5. **The `site:trim` merged mesh (31–39k triangles).** Move the lathe urns and pedestals from `trim` into `fine`. **Effect:** about −20k triangles in the exterior.

## Keep
Everything above marked done, the fixed number of lights, and the `estate:ready` protocol.
