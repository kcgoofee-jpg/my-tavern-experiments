// The v2 overlay of a schema-1 pack (docs/kernel-schema.md K-R67): map/packs/<id>/overlay.v2.json sits next to the frozen v1
// manifest and adds schema-2 node data to what compat-v1 derives: { "schema": 2, "nodes": [ { id, parent?, alias?, hints?, at?, name?, ... } ] }.
// Merge, by node id, after fromV1: a new id is added (it needs a name); an existing id gets its `alias` and `hints` unioned
// and every other field overridden. Pure and lenient (K-R06): a bad entry is skipped and listed in `problems`, the rest applies.
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const union = (a, b) => [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])];
const LISTS = ['alias', 'hints'];

/** applyOverlay(nodes, overlay) -> { nodes, problems }; `nodes` is a new array, the input is not touched. */
export function applyOverlay(nodes, overlay) {
  const out = nodes.map(n => ({ ...n })), byId = new Map(out.map(n => [n.id, n])), problems = [];
  if (overlay === null || overlay === undefined) return { nodes: out, problems };
  if (!isObj(overlay) || overlay.schema !== 2 || !Array.isArray(overlay.nodes)) return { nodes: out, problems: [{ code: 'overlay-invalid' }] };
  overlay.nodes.forEach((o, index) => {
    if (!isObj(o) || typeof o.id !== 'string' || o.id === '') return problems.push({ code: 'overlay-node-invalid', index });
    const cur = byId.get(o.id);
    if (!cur) {
      if (typeof o.name !== 'string' || o.name === '') return problems.push({ code: 'overlay-name-missing', id: o.id });
      const n = { ...o }; out.push(n); byId.set(n.id, n); return;
    }
    for (const [k, v] of Object.entries(o)) {
      if (k === 'id') continue;
      if (LISTS.includes(k)) cur[k] = union(k === 'alias' && cur.alias === undefined ? [cur.name] : cur[k], v);
      else cur[k] = v;
    }
  });
  return { nodes: out, problems };
}
