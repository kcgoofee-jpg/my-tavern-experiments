# Estate v0: interaction and web-3D performance review

**Score: 6.5 / 10.** Zoom is much better than before. It is cursor-anchored, works on the trackpad and with a two-finger pinch, and has buttons. The page renders on demand. Draw calls are low (82–94) because the Batch merges geometry by material. The weak points are the loading path (a single CDN, everything built before the first frame), the missing degradation tiers, the brief's material and lighting items, and some gaps that let the parent page scroll or zoom.

## Changes, ordered by impact

1. **Stop the parent page from scrolling or zooming (index.html, main.js).** The `wheel` handler is attached to `#app`. `#floors`, `#zoom`, `#title` and `#card` sit outside it. Inside an iframe, a wheel over them chains to the parent page's scroll. Fixes:
   - Add `window.addEventListener('wheel', e => e.preventDefault(), {passive:false})`.
   - Add `overscroll-behavior:none; touch-action:none` to `html, body`.
   - macOS Safari sends a trackpad pinch as `gesturestart/gesturechange` (`e.scale`), not as ctrl+wheel. Add handlers that call `preventDefault` and `zoomAt(e.clientX, e.clientY, e.scale/last)`. Skip them when `pointer: coarse`, because iOS already takes the touch path.
2. **Make three.js loading resilient (index.html).** Vendor `three.module.min.js` and the 4 addons (about 700 KB raw, about 170 KB gzip) into `map/estate/vendor/`. Point the importmap there; relative paths still work under the viewer's `<base href>`. This also removes a 5-request waterfall. Add `<link rel="modulepreload">` for three, main.js and lib.js. Add an 8 s watchdog that replaces `#loading` with a "加载失败 · 重试" message. Import maps cannot fall back to a second URL, so a same-origin copy is the reliable fix.
3. **Show the exterior first, build floors lazily (main.js start-up, building.js).** Today every `cut[i].build()`, every shaft and `ensureFurn(4)` runs before frame 1. Keep the `cut[i]` Batches unbuilt and add `ensureCut(i)`. Call it from `setMode` and from the existing idle queue in `onFirstFrame`, one floor per idle slice. After that, call `renderer.compileAsync(floorG[i], camera)` so the first switch to a floor has no shader hitch. Also ship a static `poster.webp` of about 60 KB behind the canvas. The screen then looks finished in under 1 s even on a cold CDN.
4. **Add degradation tiers (new `tier()` in main.js).**
   - **T0, desktop:** DPR min(dpr, 2), MSAA, PCFSoft shadows at 2048, optional SSAO.
   - **T1, coarse pointer or `deviceMemory` ≤ 4:** DPR 1.5, `antialias:false`, PCF shadows at 1024, furniture does not cast shadows.
   - **T2:** DPR 1, no shadow map (the `blob` contact shadows already carry the look), no Physical materials.
   - **Adaptive downgrade:** time the frames during interaction. If the average is over 33 ms for 1 s, drop one tier. While the user drags, render at 0.75× DPR and draw one sharp frame when idle.
   - **Stop the pin pulse from forcing a full render every frame.** `pinned` does this in `loop`. Animate the pulse at about 15 Hz, or stop it after 2 s.
5. **Split the site batch spatially for LOD and culling (lib.js `Batch`, site.js).** The merged site meshes each span the whole island, so frustum culling does nothing in floor views; F1 still renders 404k triangles. Split the site into a 3×3 tile grid per material, which adds roughly 30 draw calls. Put small props (balusters, urns, lamps, bollards, flower beds) in a `detail` group and hide it when `visW > 300`. In `all` mode, hide the furniture of floors that are far off-screen. Also make `Batch.add` keep geometry indexed: skip `toNonIndexed` and merge indexed. That cuts vertex memory about 3×.
6. **Materials and lights from the brief (lib.js `initMaterials`, main.js).**
   - Switch `fab*`, `linen` and `leather*` to `MeshPhysicalMaterial` with `sheen`. Give `piano`, `mahogany`, `marble*` and `porcelain` a `clearcoat`. Do this on T0/T1 only; it adds no draw calls because meshes are merged per material.
   - Add warm interior light: one non-shadow `PointLight` (#ffcf8a) per floor group, 5 in total, created once. Change only `intensity` or `visible`. Adding or removing lights recompiles every program.
   - Add SSAO as T0-only `N8AO` or `SAOPass`, and only when the view is idle.
7. **Gestures (main.js).**
   - A double tap currently pins the room on the first tap, which flashes the room card. Delay the single-tap pin by 250 ms on touch.
   - Throttle `pointermove` picking to rAF.
   - Add `+`/`-`/`0` keys that call `zoomBtn`/reset.
   - On a 375 px screen `#floors` covers about 20 % of the width (see mobile_ext). Collapse it into a horizontal chip row at the bottom.
8. **Progressive heavy assets (optional, if the model later uses glTF).** Load `assets/F{n}.glb` compressed with meshopt, with KTX2 UASTC textures. Load it in `ensureFurn(i)` after the procedural version is shown and swap it in. Budget: 0.4 MB for the first screen, about 1.5 MB per floor, well under 15 MB in total. The current procedural 256² canvas textures (23, about 6 MB of GPU memory) stay within budget; keep them.

## Keep

- `zoomAt` with unproject-anchor plus `keepTargetY`, the exponential wheel curve with separate ctrl/pixel rates, and the clamping of `deltaMode`.
- Log-space zoom tweening in `flyTo`, and `fitZoom` with its awareness of the floor bar.
- The two-finger pinch running in parallel with OrbitControls pan, and the two-finger-tap focus.
- Rendering on demand (`needs`), `shadowMap.autoUpdate=false`, and `fitShadow` tightening.
- Material-keyed `Batch` merging plus instanced protos, and the idle-time furniture build.
- Cheap invisible pick boxes, with the smallest-area hit winning.
- The embedding protocol: `estate:ready` fires on the first frame. Keep that even with lazy floors. Do not delay it until the idle builds finish.
