// The node tree of kernel contract v2 (docs/kernel-schema.md §3, §4): the only geography. Pure.
//   buildTree   K-R12 healing, tree API                     vocabulary / locate / unmapped   locate.mjs (re-exported here)
//   viewOf / positionOf / scopeOf / levelsOf  K-R31..K-R35, K-R51        describe  K-R29
export { vocabulary, locate, unmapped } from './locate.mjs';

export const ROOT_ID = '__root', MAX_NODES = 5000;
const isId = v => typeof v === 'string' && v !== '';

/** Nodes (declaration order) -> tree. Repairs are listed in `tree.problems` ({ code, id, ... }), one per repair. */
export function buildTree(list, { title = '' } = {}) {
  const problems = [], nodes = new Map(), decl = [];
  (Array.isArray(list) ? list : []).forEach((n, index) => {
    if (!n || typeof n !== 'object' || !isId(n.id)) return problems.push({ code: 'node-invalid', index });
    if (nodes.has(n.id)) return problems.push({ code: 'node-duplicate', id: n.id });
    if (decl.length >= MAX_NODES) return problems.push({ code: 'node-limit', id: n.id });
    nodes.set(n.id, n); decl.push(n.id);
  });
  const cands = decl.filter(id => !isId(nodes.get(id).parent)), par = new Map();
  let root = cands[0], synth = null;
  if (cands.length !== 1) { root = synth = ROOT_ID; nodes.set(ROOT_ID, { id: ROOT_ID, name: String(title ?? '') }); cands.forEach(c => par.set(c, ROOT_ID)); }
  for (const id of decl) if (!par.has(id) && id !== root) par.set(id, nodes.get(id).parent);
  for (const id of decl) {   // K-R12: a missing parent, or being one's own ancestor, re-hangs the node under the root
    if (id === root) continue;
    if (!nodes.has(par.get(id))) { problems.push({ code: 'parent-missing', id, parent: par.get(id) }); par.set(id, root); continue; }
    const seen = new Set(); let x = par.get(id);
    while (x !== undefined && x !== id && !seen.has(x)) { seen.add(x); x = par.get(x); }
    if (x === id) { problems.push({ code: 'cycle', id }); par.set(id, root); }
  }
  const kids = new Map([[root, []]]), ord = new Map(decl.map((id, i) => [id, i]));
  for (const id of decl) kids.set(id, []);
  for (const id of decl) if (id !== root) kids.get(par.get(id)).push(id);
  if (synth) ord.set(ROOT_ID, -1);
  const anc = new Map(), dep = new Map();
  const ancestors = id => {
    if (!anc.has(id)) { const p = par.get(id); anc.set(id, p === undefined ? [] : [p, ...ancestors(p)]); }
    return anc.get(id);
  };
  const depth = id => { if (!dep.has(id)) dep.set(id, ancestors(id).length); return dep.get(id); };
  const ids = () => (synth ? [ROOT_ID, ...decl] : decl.slice());
  return {
    problems, root, synth, title: String(title ?? ''),
    has: id => nodes.has(id), get: id => nodes.get(id) || null,
    parent: id => (par.has(id) ? par.get(id) : null),
    children: id => (kids.get(id) || []).slice(),
    ancestors: id => (nodes.has(id) ? ancestors(id).slice() : []),
    depth: id => (nodes.has(id) ? depth(id) : -1),
    maxDepth: () => ids().reduce((m, id) => Math.max(m, depth(id)), 0),
    isAncestor: (a, d) => nodes.has(d) && ancestors(d).includes(a),
    order: id => (ord.has(id) ? ord.get(id) : -1),
    ids,
    /** Edges between two nodes through their nearest common ancestor. */
    distance(a, b) {
      if (!nodes.has(a) || !nodes.has(b)) return Infinity;
      const pa = [a, ...ancestors(a)], pb = [b, ...ancestors(b)], sb = new Set(pb);
      const i = pa.findIndex(x => sb.has(x));
      return i + pb.indexOf(pa[i]);
    },
  };
}

// ---- views (K-R30..K-R35): `views` is the pack's views block, an object keyed by view id ----
const FRAME = new Set(['tiles', 'image', 'model3d']), FLAT = new Set(['tiles', 'image']);
const listOf = v => (typeof v === 'string' ? [v] : Array.isArray(v) ? v : []);
/** K-R33: node.view (first = primary), else views[<node id>], else none. Unknown view ids are ignored. */
export function viewIdsOf(tree, views, id) {
  const n = tree.get(id); if (!n || !views) return [];
  const ok = v => typeof v === 'string' && Object.hasOwn(views, v) && views[v] && typeof views[v] === 'object';
  const own = listOf(n.view).filter(ok);
  return own.length ? own : ok(id) ? [id] : [];
}
const primary = (tree, views, id) => { const v = viewIdsOf(tree, views, id)[0]; return v ? { id: v, view: views[v] } : null; };
/** Nearest proper ancestor whose primary view has a frame (the view `at` is read in). */
function framedAncestor(tree, views, id) {
  for (const a of tree.ancestors(id)) { const p = primary(tree, views, a); if (p && FRAME.has(p.view.kind)) return { owner: a, ...p }; }
  return null;
}

/** K-R34: { view, owner, kind, focus } for a target node; `view` is null (kind schematic) at the end of the chain. */
export function viewOf(tree, views, id) {
  let n = id;
  for (let guard = 0; guard < 64 && tree.has(n); guard++) {
    const p = primary(tree, views, n);
    if (p && (p.view.open ?? 'locate') === 'locate') return { view: p.id, owner: n, kind: p.view.kind, focus: id };
    const e = tree.get(n).enter;
    if (isId(e) && tree.parent(e) === n) n = e; else break;
  }
  const f = framedAncestor(tree, views, n);
  if (f) return { view: f.id, owner: f.owner, kind: f.view.kind, focus: id };
  for (const a of tree.ancestors(n)) { const p = primary(tree, views, a); if (p) return { view: p.id, owner: a, kind: p.view.kind, focus: id }; }
  return { view: null, owner: tree.root, kind: 'schematic', focus: id };
}
/** K-R31, K-R32: where a node sits: { view, owner, at } (explicit), { view, owner, anchor } (by reference) or null. */
export function positionOf(tree, views, id) {
  const n = tree.get(id); if (!n) return null;
  const f = framedAncestor(tree, views, id);
  const av = n.at && typeof n.at === 'object' && isId(n.at.view) ? n.at.view : null;
  let hit = f;   // `at.view` must be the primary view of an ancestor, else the nearest framed one is used
  if (av) for (const a of tree.ancestors(id)) { const p = primary(tree, views, a); if (p && p.id === av && FRAME.has(p.view.kind)) { hit = { owner: a, ...p }; break; } }
  if (!hit) return null;
  if (n.at && Number.isFinite(n.at.x) && Number.isFinite(n.at.y)) {
    const { x, y, z, r } = n.at;
    return { view: hit.id, owner: hit.owner, at: { x, y, ...(Number.isFinite(z) ? { z } : {}), ...(Number.isFinite(r) ? { r } : {}) } };
  }
  return { view: hit.id, owner: hit.owner, anchor: typeof n.anchor === 'string' && n.anchor ? n.anchor : id };
}
/** K-R51: nearest ancestor-or-self whose primary view is tiles or image, else the root. */
export function scopeOf(tree, views, id) {
  if (!tree.has(id)) return tree.root;
  for (const n of [id, ...tree.ancestors(id)]) { const p = primary(tree, views, n); if (p && FLAT.has(p.view.kind)) return n; }
  return tree.root;
}
/** K-R35: the level switcher of the view owned by `id`; [] when fewer than two levels. */
export function levelsOf(tree, views, ui, id) {
  if (!tree.has(id)) return [];
  const lv = ui && typeof ui.levels === 'object' && ui.levels ? ui.levels : null;
  for (const L of [id, ...tree.ancestors(id)]) if (lv && Object.hasOwn(lv, L) && Array.isArray(lv[L])) { const l = lv[L].filter(x => tree.has(x)); return l.length >= 2 ? l : []; }
  const p = tree.parent(id); if (p === null) return [];
  const l = tree.children(p).filter(c => { const v = primary(tree, views, c); return v && FLAT.has(v.view.kind); });
  return l.length >= 2 ? l : [];
}
/** K-R29: counts for probes and the self-check (`nodes` leaves out a synthesized root). */
export function describe(tree, views) {
  const types = {}, kinds = {};
  for (const id of tree.ids()) { const t = tree.get(id).type; if (id !== tree.synth && typeof t === 'string' && t) types[t] = (types[t] || 0) + 1; }
  for (const v of Object.values(views && typeof views === 'object' ? views : {})) if (v && typeof v.kind === 'string') kinds[v.kind] = (kinds[v.kind] || 0) + 1;
  return { nodes: tree.ids().length - (tree.synth ? 1 : 0), depth: tree.maxDepth(), types, grown: tree.ids().filter(id => id.startsWith('g_')).length, views: kinds };
}
