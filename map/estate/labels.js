// In-canvas labels of the 3D view (docs/ui-refactor.md 3.8, S7-3 T7): a label whose anchor is behind the building is hidden (display: none, never faded), and the floor tags of the
// x-ray view do not overlap. Occlusion is one ray per label against a handful of axis-aligned boxes that stand for the building (floor slabs, the outer walls, the whole block seen
// from outside), never the model's mesh: a round costs microseconds. A round is spread over frames (a few labels each), runs at most four times a second and only while the camera
// or the view mode moved; a still scene costs nothing. Pure geometry + DOM class toggles; the page hands in what it knows.
const ROUND_MS = 250, PER_FRAME = 12, EPS = 0.35;

/** segment (p -> p + d * len) against an axis-aligned box (slab method); true when it crosses the box's inside */
const AXES = ['x', 'y', 'z'];
export function hitsBox(p, d, len, b) {
  if (AXES.every((k) => p[k] > b.min[k] && p[k] < b.max[k])) return false;   // an anchor inside a box (a label of the building itself) is not behind it
  let t0 = EPS, t1 = len;
  for (const k of AXES) {
    const lo = b.min[k], hi = b.max[k], o = p[k], v = d[k];
    if (Math.abs(v) < 1e-9) { if (o <= lo || o >= hi) return false; continue; }
    let a = (lo - o) / v, c = (hi - o) / v; if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 >= t1) return false;
  }
  return true;
}
const box = (x0, x1, y0, y1, z0, z1) => ({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } });

/**
 * createLabelGuard({ THREE, camera, floors, building, cut, mode, isFloor, labels, now }):
 *   floors    [{ y, z, box? }] floor levels (three y; z = level above the ground floor; box = the floor's footprint { x0, x1, z0, z1 } in three x / z); building { x0, x1, z0, z1 } the outer footprint in three x / z
 *   mode()    'ext' | 'xray' | a floor index;  labels()  [{ el, anchor: Object3D, hot }] the labels that are on this round (anchor.getWorldPosition); a hot (hovered or selected) label is never hidden
 *   tick(now) -> true while a round is running; dirty() marks the scene as changed (camera moved, mode changed, labels changed)
 */
export function createLabelGuard({ THREE, camera, floors, building, cut = 1.5, top = 4.5, mode, labels }) {
  const fwd = new THREE.Vector3(), pos = new THREE.Vector3(), key = new THREE.Matrix4(), last = new THREE.Matrix4(), dir = { x: 0, y: 0, z: 0 };
  let dirty = true, lastMode = null, lastRun = -1e9, cursor = 0, work = null, lastCost = 0, rounds = 0, lastZoom = 0;
  const own = (i) => floors[i].box || building;   // a floor's own footprint (a basement is smaller than the block above it)
  const slab = (i) => { const b = own(i); return box(b.x0, b.x1, floors[i].y - 0.35, floors[i].y, b.z0, b.z1); };
  const walls = (i) => { const y0 = floors[i].y, y1 = y0 + cut, t = 0.6, { x0, x1, z0, z1 } = own(i);
    return [box(x0 - t, x0, y0, y1, z0 - t, z1 + t), box(x1, x1 + t, y0, y1, z0 - t, z1 + t), box(x0, x1, y0, y1, z0 - t, z0), box(x0, x1, y0, y1, z1, z1 + t)]; };
  const occluders = (m) => {
    if (m === 'ext') return [box(building.x0, building.x1, floors[0].y, floors[floors.length - 1].y + top, building.z0, building.z1)];
    if (m === 'xray') return floors.map((f, i) => (f.z >= 0 ? slab(i) : null)).filter(Boolean);   // the floors above the ground: what a ray from a lower floor to the camera crosses
    return walls(m);
  };
  function start() {
    camera.getWorldDirection(fwd); dir.x = -fwd.x; dir.y = -fwd.y; dir.z = -fwd.z;   // toward the camera (orthographic: one direction for every anchor)
    work = { list: labels(), occ: occluders(mode()), out: [] }; cursor = 0;
  }
  /** one slice of a round; returns true while there is more to do */
  function tick(now) {
    if (!work) {
      const m = mode(); camera.updateMatrixWorld(); key.copy(camera.matrixWorld);
      const moved = !key.equals(last) || camera.zoom !== lastZoom || m !== lastMode;
      if (!(dirty || moved) || now - lastRun < ROUND_MS) return false;
      last.copy(key); lastZoom = camera.zoom; lastMode = m; dirty = false; lastRun = now; start();
    }
    const t0 = performance.now(), { list, occ, out } = work;
    for (let n = 0; n < PER_FRAME && cursor < list.length; n++, cursor++) {
      const L = list[cursor]; L.anchor.getWorldPosition(pos);
      let hidden = false; if (!L.hot) for (const b of occ) if (hitsBox(pos, dir, 4000, b)) { hidden = true; break; }
      out.push([L.el, hidden]);
    }
    lastCost += performance.now() - t0;
    if (cursor >= list.length) { for (const [el, hidden] of out) el.classList.toggle('occl', hidden); rounds++; window.__estate && (window.__estate.occl = { ms: +lastCost.toFixed(3), labels: list.length, rounds }); work = null; lastCost = 0; return false; }
    return true;
  }
  // a changed scene (dirty) drops the round that was running
  return { tick, dirty: () => { dirty = true; work = null; cursor = 0; }, rounds: () => rounds, occluders, hitsBox };
}

/** the floor tags of the x-ray view get a vertical pass: a tag that overlaps the one above shifts down by the overlap (--dy), a tag clipped by the left edge slides right (--dx), a tag that would leave the screen is hidden; tags = [{ el, span }] */
export function separateTags(tags) {
  for (const t of tags) { t.span.style.setProperty('--dy', '0px'); t.span.style.setProperty('--dx', '0px'); t.el.classList.remove('occl'); }
  const rs = tags.filter((t) => t.el.style.display !== 'none').map((t) => ({ t, r: t.span.getBoundingClientRect() })).filter((x) => x.r.height > 0).sort((a, b) => a.r.top - b.r.top);
  let bottom = -1e9;
  for (const x of rs) {
    const shift = Math.max(0, bottom + 8 - x.r.top);   // U-FIX-5 E2-01: an 8 px gap, so F3 / F2 / F1 read as separate tags, not one stack
    x.t.span.style.setProperty('--dy', shift + 'px'); x.t.span.style.setProperty('--dx', Math.max(0, 4 - x.r.left) + 'px');   // a tag whose anchor sits near the left edge (phones) slides back into view
    x.t.el.classList.toggle('occl', x.r.bottom + shift > innerHeight - 4);
    if (!x.t.el.classList.contains('occl')) bottom = x.r.bottom + shift;
  }
}
