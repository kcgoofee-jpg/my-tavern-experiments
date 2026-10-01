// Schematic layout and picture (docs/kernel-schema.md K-R97): where the nodes of a subtree sit on a generated diagram, and the
// diagram itself as an SVG of lines and dots. Pure and deterministic: no DOM, no pack text in the picture (K-R64).
// `tree` is the object of core/nodes.mjs buildTree (children, parent, has).
const M = 0.06, TOP = 0.08, BOT = 0.92, WRAP = 12;
const r4 = v => Math.round(v * 1e4) / 1e4;

/** The owner and its descendants down to `depth` levels: rows[level] = ids in declaration order (parents' order, then theirs). */
function rowsOf(tree, owner, depth) {
  const rows = [[owner]];
  for (let d = 1; d <= depth; d++) {
    const next = rows[d - 1].flatMap(id => tree.children(id));
    if (!next.length) break;
    rows.push(next);
  }
  return rows;
}
/** Leaves of the subtree of `id` within the depth (a node at the depth limit, or without children, counts as one). */
function leavesOf(tree, id, depth) {
  if (depth <= 0) return 1;
  const kids = tree.children(id);
  return kids.length ? kids.reduce((s, c) => s + leavesOf(tree, c, depth - 1), 0) : 1;
}
const spread = (i, n) => M + (1 - 2 * M) * ((i + 0.5) / n);

/**
 * layoutSchematic(tree, owner, { layout = 'tree', depth = 2 }) -> { [node id]: { x, y } } in 0..1.
 *   tree    owner at the top centre (0.5, 0.08), one row per level down to 0.92, width shared by leaf count, a parent over its children;
 *           a row of more than 12 nodes wraps into several rows
 *   list    one column in declaration order      grid  rows of ceil(sqrt(n))      radial  owner in the middle, one ring per level
 */
export function layoutSchematic(tree, owner, { layout = 'tree', depth = 2 } = {}) {
  const out = {};
  if (!tree || !tree.has(owner)) return out;
  const D = Math.max(1, Math.min(6, Number.isFinite(depth) ? Math.floor(depth) : 2)), rows = rowsOf(tree, owner, D), all = rows.flat();
  if (layout === 'list') all.forEach((id, i) => (out[id] = { x: 0.5, y: r4(all.length < 2 ? TOP : TOP + (BOT - TOP) * i / (all.length - 1)) }));
  else if (layout === 'grid') {
    const cols = Math.ceil(Math.sqrt(all.length)), rs = Math.ceil(all.length / cols);
    all.forEach((id, i) => (out[id] = { x: r4(spread(i % cols, cols)), y: r4(M + (1 - 2 * M) * (Math.floor(i / cols) + 0.5) / rs) }));
  } else if (layout === 'radial') {
    out[owner] = { x: 0.5, y: 0.5 };
    rows.slice(1).forEach((row, k) => row.forEach((id, i) => {
      const a = -Math.PI / 2 + 2 * Math.PI * i / row.length, f = (k + 1) / (rows.length - 1);
      out[id] = { x: r4(0.5 + 0.44 * f * Math.cos(a)), y: r4(0.5 + 0.4 * f * Math.sin(a)) };
    }));
  } else {
    const xs = {}, span = (id, depthLeft, lo, hi) => {   // each node takes the width of its leaves; its x is the middle of that width
      xs[id] = (lo + hi) / 2;
      const kids = depthLeft > 0 ? tree.children(id) : [];
      if (!kids.length) return;
      const total = kids.reduce((s, c) => s + leavesOf(tree, c, depthLeft - 1), 0);
      let at = lo;
      for (const c of kids) { const w = (hi - lo) * leavesOf(tree, c, depthLeft - 1) / total; span(c, depthLeft - 1, at, at + w); at += w; }
    };
    span(owner, D, M, 1 - M);
    const lines = [];   // [{ id, x }] per drawn row; a long level becomes several rows
    rows.forEach(row => {
      const n = Math.ceil(row.length / WRAP), per = Math.ceil(row.length / n);
      for (let r = 0; r < n; r++) {
        const part = row.slice(r * per, (r + 1) * per);
        lines.push(part.map((id, i) => ({ id, x: n === 1 ? xs[id] : spread(i, part.length) })));
      }
    });
    lines.forEach((line, r) => line.forEach(({ id, x }) => (out[id] = { x: r4(x), y: r4(lines.length < 2 ? TOP : TOP + (BOT - TOP) * r / (lines.length - 1)) })));
  }
  return out;
}

/** The diagram of a layout: 1600 x 1000 units, one line per parent-child edge, one dot per node; fixed neutral greys, no text. */
export function schematicSvg(layout, tree) {
  const X = v => +(v * 1600).toFixed(1), Y = v => +(v * 1000).toFixed(1), ids = Object.keys(layout || {});
  let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">';
  for (const id of ids) {
    const p = tree.parent(id);
    if (p !== null && Object.hasOwn(layout, p)) s += `<line x1="${X(layout[p].x)}" y1="${Y(layout[p].y)}" x2="${X(layout[id].x)}" y2="${Y(layout[id].y)}" stroke="#8a919b" stroke-opacity="0.55" stroke-width="2"/>`;
  }
  for (const id of ids) s += `<circle cx="${X(layout[id].x)}" cy="${Y(layout[id].y)}" r="6" fill="#aab0b9"/>`;
  return s + '</svg>';
}
/** The picture as a source the viewer can open (a data URL). */
export const schematicUrl = svg => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
