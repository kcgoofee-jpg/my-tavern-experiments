// Where a located place is drawn for a person or a trip end (docs/kernel-schema.md K-R24, K-R31, K-R51): the result of the current-location
// engine (app/place-resolver.mjs, it carries the `node`) becomes { map, marker } (a landmark on a flat map), { map, nx, ny, approx? } (a point), { map }
// (only the map is known) or { map, estate: true } (a 3D page with no flat stand-in). Pure: the viewer passes what it knows in `env`.
//   env.hasMap(id)      the registry has the map              env.isScene(id)   the map is a 3D page      env.standIn(id)   { map, marker } | null
//   env.spot(node)      { x, y, map } when the node has its own point on a flat map (world places, districts) | null
//   env.zone(map, text) an approximate point for a place the tree knows only as a district | null
// Order: the stand-in of a 3D page, the landmark, the node's own point (world places), the district of the written text, the map alone.
export function drawPlace(r, text, env) {
  if (!r || !env.hasMap(r.map)) return null;
  if (env.isScene(r.map)) {
    const s = env.standIn(r.map);
    if (!s) return { map: r.map, estate: true };
    r = { ...r, map: s.map, marker: s.marker };
  }
  if (r.marker) return { map: r.map, marker: r.marker };
  if (r.place) { const s = r.node && env.spot(r.node); if (s && s.map === r.map) return { map: r.map, nx: s.x, ny: s.y }; }
  const z = text ? env.zone(r.map, text) : null;
  return z ? { map: r.map, ...z } : { map: r.map };
}
