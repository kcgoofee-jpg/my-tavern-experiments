// Frozen copy of the routes SVG loop of app/markers.mjs as it was before S8-2 (pointOverlays): returns the [{ pass, d, cls }] it appended, in order.
export function routePathsV1(routes, VW, VH) {
  const out = [];
  const dOf = r => r.pts.map(([x, y], j) => `${j ? 'L' : 'M'}${(x * VW).toFixed(1)},${(y * VH).toFixed(1)}`).join('') + (r.kind !== 'lane' && r.from === r.to ? 'Z' : '');
  for (const pass of ['halo', 'line']) for (const r of routes) { if (!(r.pts?.length > 1)) continue;
    out.push({ pass, d: dOf(r), cls: pass === 'halo' ? 'halo' : ['lane', 'patrol', 'patrol_city'].includes(r.kind) ? r.kind : 'lane' }); }
  return out;
}
