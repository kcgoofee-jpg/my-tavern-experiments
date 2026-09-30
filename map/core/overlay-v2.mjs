// The v2 overlay of a schema-1 pack (docs/kernel-schema.md K-R67): map/packs/<id>/overlay.v2.json sits next to the frozen v1
// manifest and adds schema-2 node data to what compat-v1 derives: { "schema": 2, "nodes": [ { id, parent?, alias?, hints?, at?, name?, ... } ] }.
// Merge, by node id, after fromV1: a new id is added (it needs a name); an existing id gets its `alias` and `hints` unioned
// and every other field overridden. Pure and lenient (K-R06): a bad entry is skipped and listed in `problems`, the rest applies.
// K-R68: an overlay may also carry an `events` block (v2 shape) and `llm.templates`; both are merged over what compat-v1 derived, the overlay wins.
// K-R69: and a `vars` block (paths, periods by id) and an `entities` block (groups by id, fields by `field`, the avatar block); same rule.
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const union = (a, b) => [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])];
const LISTS = ['alias', 'hints'];

/** applyOverlay(nodes, overlay) -> { nodes, problems }; `nodes` is a new array, the input is not touched. */
export function applyOverlay(nodes, overlay) {
  const out = nodes.map(n => ({ ...n })), byId = new Map(out.map(n => [n.id, n])), problems = [];
  if (overlay === null || overlay === undefined) return { nodes: out, problems };
  if (!isObj(overlay) || overlay.schema !== 2 || !(Array.isArray(overlay.nodes) || (overlay.nodes === undefined && (isObj(overlay.events) || isObj(overlay.llm) || isObj(overlay.vars) || isObj(overlay.entities))))) return { nodes: out, problems: [{ code: 'overlay-invalid' }] };
  (overlay.nodes || []).forEach((o, index) => {
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

const ITEM_LISTS = ['groups'], DICTS = ['types', 'fx_presets'], WHOLE = ['levels', 'closed', 'examples'];
const mergeRows = (cur, add, what, problems, need) => {   // rows with an id (groups) or a dict keyed by id (types, presets): a known id is overridden field by field, a new one needs `need`
  add.forEach(([id, o], index) => {
    if (!isObj(o) || typeof id !== 'string' || id === '') return problems.push({ code: `overlay-${what}-invalid`, index });
    const at = cur.get(id);
    if (at) { Object.assign(at, o); return; }
    if (need.some(k => typeof o[k] !== 'string' || o[k] === '')) return problems.push({ code: `overlay-${what}-incomplete`, id });
    cur.set(id, { ...o });
  });
};

/** applyOverlayEvents(events, overlay) -> { events, problems } (K-R68): `overlay.events` merged over the converted events block
 *  (`events` may be undefined): groups and types by id (a new one needs label + group, a group label), fx_presets by key, `life` field by field,
 *  `levels` / `closed` / `examples` replaced as a whole, every other key (`x-…`) overridden. The input is not touched. */
export function applyOverlayEvents(events, overlay) {
  const base = isObj(events) ? JSON.parse(JSON.stringify(events)) : undefined, problems = [], add = isObj(overlay) ? overlay.events : undefined;
  if (add === undefined || add === null) return { events: base, problems };
  if (!isObj(add)) return { events: base, problems: [{ code: 'overlay-events-invalid' }] };
  const out = base || {};
  for (const [k, v] of Object.entries(add)) {
    if (ITEM_LISTS.includes(k)) {
      if (!Array.isArray(v)) { problems.push({ code: 'overlay-groups-invalid' }); continue; }
      const cur = new Map((out[k] || []).map(g => [g.id, g]));
      mergeRows(cur, v.map(g => [isObj(g) ? g.id : undefined, g]), 'group', problems, ['label']); out[k] = [...cur.values()];
    } else if (DICTS.includes(k)) {
      if (!isObj(v)) { problems.push({ code: `overlay-${k}-invalid` }); continue; }
      const cur = new Map(Object.entries(out[k] || {}));
      mergeRows(cur, Object.entries(v), k === 'types' ? 'type' : 'preset', problems, k === 'types' ? ['label', 'group'] : []); out[k] = Object.fromEntries(cur);
    } else if (k === 'life') { if (isObj(v)) out.life = { ...(out.life || {}), ...v }; else problems.push({ code: 'overlay-life-invalid' }); }
    else if (WHOLE.includes(k)) { if (Array.isArray(v)) out[k] = JSON.parse(JSON.stringify(v)); else problems.push({ code: `overlay-${k}-invalid` }); }
    else out[k] = JSON.parse(JSON.stringify(v));
  }
  return { events: out, problems };
}

/** applyOverlayLlm(llm, overlay) -> llm (K-R68): only `overlay.llm.templates.<lang>.<key>` (strings) is merged, over the converted `llm` block (may be undefined). */
export function applyOverlayLlm(llm, overlay) {
  const add = isObj(overlay) && isObj(overlay.llm) && isObj(overlay.llm.templates) ? overlay.llm.templates : null;
  if (!add) return llm;
  const out = isObj(llm) ? JSON.parse(JSON.stringify(llm)) : {}, tpl = isObj(out.templates) ? out.templates : {};
  for (const [lang, t] of Object.entries(add)) if (isObj(t)) for (const [k, v] of Object.entries(t)) if (typeof v === 'string' && v !== '') (tpl[lang] ||= {})[k] = v;
  if (Object.keys(tpl).length) out.templates = tpl;
  return Object.keys(out).length ? out : llm;
}

const copy = v => JSON.parse(JSON.stringify(v));
const keyed = (cur, add, key, what, problems, need) => {   // rows of an array merged by the field `key`: a known one is overridden field by field, a new one needs `need`
  const by = new Map(cur.map(r => [r[key], r]));
  add.forEach((o, index) => {
    if (!isObj(o) || typeof o[key] !== 'string' || o[key] === '') return problems.push({ code: `overlay-${what}-invalid`, index });
    const at = by.get(o[key]);
    if (at) { Object.assign(at, copy(o)); return; }
    if (need.some(k => typeof o[k] !== 'string' || o[k] === '')) return problems.push({ code: `overlay-${what}-incomplete`, id: o[key] });
    const n = copy(o); cur.push(n); by.set(n[key], n);
  });
  return cur;
};

/** applyOverlayVars(vars, overlay) -> { vars, problems } (K-R69): `overlay.vars` merged over the converted `vars` block (may be undefined):
 *  path keys and every other key overridden, `periods` by id (a new band needs `start`; the list is kept in time order). The input is not touched. */
export function applyOverlayVars(vars, overlay) {
  const base = isObj(vars) ? copy(vars) : undefined, problems = [], add = isObj(overlay) ? overlay.vars : undefined;
  if (add === undefined || add === null) return { vars: base, problems };
  if (!isObj(add)) return { vars: base, problems: [{ code: 'overlay-vars-invalid' }] };
  const out = base || {};
  for (const [k, v] of Object.entries(add)) {
    if (k !== 'periods') { out[k] = copy(v); continue; }
    if (!Array.isArray(v)) { problems.push({ code: 'overlay-periods-invalid' }); continue; }
    out.periods = keyed(Array.isArray(out.periods) ? out.periods : [], v, 'id', 'period', problems, ['start']).sort((a, b) => String(a.start).localeCompare(String(b.start)));
  }
  return { vars: out, problems };
}

/** applyOverlayEntities(entities, overlay) -> { entities, problems } (K-R69): `overlay.entities` merged over the converted block (may be undefined):
 *  `groups` by id (a new one needs `label`; `source` is merged key by key, `fallback` replaced as a whole), `fields` by `field` (a new one needs `kind`),
 *  `avatar` key by key (lists replaced), any other key overridden. The input is not touched. */
export function applyOverlayEntities(entities, overlay) {
  const base = isObj(entities) ? copy(entities) : undefined, problems = [], add = isObj(overlay) ? overlay.entities : undefined;
  if (add === undefined || add === null) return { entities: base, problems };
  if (!isObj(add)) return { entities: base, problems: [{ code: 'overlay-entities-invalid' }] };
  const out = base || {};
  for (const [k, v] of Object.entries(add)) {
    if (k === 'groups' || k === 'fields') {
      if (!Array.isArray(v)) { problems.push({ code: `overlay-${k}-invalid` }); continue; }
      const cur = Array.isArray(out[k]) ? out[k] : [];
      if (k === 'fields') out.fields = keyed(cur, v, 'field', 'field', problems, ['kind']);
      else {
        const src = new Map(cur.map(g => [g.id, g.source]));
        out.groups = keyed(cur, v.map(g => (isObj(g) && isObj(g.source) && isObj(src.get(g.id)) ? { ...g, source: { ...src.get(g.id), ...g.source } } : g)), 'id', 'group', problems, ['label']);
      }
    } else if (k === 'avatar') { if (isObj(v)) out.avatar = { ...(out.avatar || {}), ...copy(v) }; else problems.push({ code: 'overlay-avatar-invalid' }); }
    else out[k] = copy(v);
  }
  return { entities: out, problems };
}
