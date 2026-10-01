// Declared layers (docs/layers-schema.md, K-R79 / K-R81 / K-R82 / K-R83): the pure rules of the `layers` block.
// normFeature / normLayer heal one value at a time (K-R06: a bad part is dropped and listed, never fatal); mergeLayers puts a pack's rows on the
// kernel list; appliesTo decides where a layer is live; layersBlock is the `validate2` spec of the block (it runs the same normLayer).
// Pure: no DOM, no storage. The pack-v2-spec combinators are used only inside functions (the two modules import each other).
import { bad, str, PATH_RE, recheck } from './pack-v2-spec.mjs';
import { SLOTS } from './layer-registry.mjs';
import { KERNEL_IDS } from './layer-defaults.mjs';
import { cpLen } from './lexicon.mjs';

export { SLOTS };
export const BLOCKS = Object.freeze(['point', 'area', 'line', 'label', 'tint', 'particles', 'flow', 'sound']);
export const LIMITS = Object.freeze({ layers: 32, features: 1000, points: 2000, legend: 8, by: 16, mvu: 8, fileBytes: 262144, local: 16 });
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const ID = /^[a-z][a-z0-9_]{0,63}$/, LID = /^[a-z][a-z0-9_-]{0,31}$/, LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/, HEX8 = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
const NODE_TYPE = /^[a-z][a-z0-9_-]{0,31}$/, FILE = /^(?!.*\.\.)[A-Za-z0-9_][A-Za-z0-9_./-]{0,199}\.json$/, ICON = /^[a-z][a-z0-9-]{0,31}$/, PROP = /^prop:[A-Za-z0-9_-]{1,64}$/;
const DATA_BLOCKS = ['point', 'label', 'line', 'area', 'flow'], PRESETS = ['rain', 'storm', 'sand', 'snow'];
const EXT = k => k.startsWith('_') || k.startsWith('x-');
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
const text = (v, max) => (typeof v === 'string' && v && cpLen(v) <= max && !v.includes('\n') ? v : undefined);

/** parseSource(s) -> { kind, arg? } | null (§3.2). */
export function parseSource(s) {
  if (typeof s !== 'string') return null;
  if (['inline', 'events', 'people', 'items', 'routine', 'ops', 'kernel'].includes(s)) return { kind: s };
  const m = /^(view|file|mvu):([^\n]*)$/.exec(s); if (!m) return null;
  const [, kind, arg] = m;
  if (kind === 'view') return arg === 'routes' || arg === 'markers' ? { kind, arg } : null;
  if (kind === 'file') return FILE.test(arg) ? { kind, arg } : null;
  return arg.length >= 1 && arg.length <= 80 ? { kind, arg } : null;
}

const pts = (v, lo) => {
  if (!Array.isArray(v)) return null;
  const out = []; for (const q of v.slice(0, LIMITS.points)) { const x = Array.isArray(q) && q.length === 2 ? [num(q[0], 0, 1), num(q[1], 0, 1)] : null; if (!x || x.some(n => n === undefined) || q.some(n => n < 0 || n > 1)) return null; out.push(x); }
  return out.length >= lo ? out : null;
};
const labels = (raw, out, field, problems) => {
  const l = text(raw.label, 60); if (l) out.label = l; else if (raw.label !== undefined) problems.push({ code: 'feature-label' });
  if (isObj(raw.i18n)) { const o = {}; for (const [k, v] of Object.entries(raw.i18n)) { const t = LANG.test(k) && isObj(v) ? text(v[field], 60) : undefined; if (t) o[k] = { [field]: t }; } if (Object.keys(o).length) out.i18n = o; }
};
/** normFeature(raw, type, { view, problems }) -> feature | null (§3.1); the geometry each block needs is checked here. */
export function normFeature(raw, type, { view, problems = [] } = {}) {
  const no = code => { problems.push({ code }); return null; };
  if (!isObj(raw)) return no('feature-type');
  const f = {}, v = raw.view ?? view;
  if (typeof raw.id === 'string' && raw.id.length <= 64) f.id = raw.id;
  if (v !== undefined) { if (typeof v === 'string' && ID.test(v)) f.view = v; else return no('feature-view'); }
  if (raw.kind !== undefined) { if (typeof raw.kind === 'string' && LID.test(raw.kind)) f.kind = raw.kind; else problems.push({ code: 'feature-kind' }); }
  if (raw.node !== undefined) { if (typeof raw.node === 'string' && ID.test(raw.node)) f.node = raw.node; else problems.push({ code: 'feature-node' }); }
  if (raw.at !== undefined) { const a = pts([raw.at], 1); if (a) f.at = a[0]; else problems.push({ code: 'feature-at' }); }
  if (raw.pts !== undefined) { const p = pts(raw.pts, 2); if (p) f.pts = p; else problems.push({ code: 'feature-pts' }); }
  if (typeof raw.closed === 'boolean') f.closed = raw.closed;
  if (raw.r !== undefined) { const r = num(raw.r, 0, 1); if (r !== undefined && r > 0) f.r = r; else problems.push({ code: 'feature-r' }); }
  labels(raw, f, 'label', problems);
  if (!f.view && !f.node) return no('feature-no-view');
  const geo = type === 'point' || type === 'label' ? f.at || f.node : type === 'line' || type === 'flow' ? f.pts : type === 'area' ? (f.pts?.length >= 3 || (f.at && f.r)) : true;
  return geo ? f : no('feature-geometry');
}

const STYLE = {   // key -> [type, lo, hi]; ranges are design §4
  color: ['color'], opacity: ['num', 0, 1], size: ['size'], icon: ['icon'], pulse: ['bool'], tone: ['enum', ['plain', 'chip']], width: ['num', 0.5, 8], dash: ['dash'],
  halo: ['bool'], fill: ['color'], fill_opacity: ['num', 0, 1], speed: ['num', 0.005, 1], density: ['int', 1, 64], trail: ['num', 0, 0.05], preset: ['enum', PRESETS], path: ['path'], by: ['by'],
};
const PATH_KEYS = ['color', 'width', 'dash', 'halo'];
const coerce = ([t, a, b], v, type, o) => {
  switch (t) {
    case 'color': return typeof v === 'string' && (HEX8.test(v) || recheck.tokenName(v)) ? v : undefined;
    case 'num': return num(v, a, b);
    case 'int': { const n = num(v, a, b); return n === undefined ? n : Math.round(n); }
    case 'bool': return typeof v === 'boolean' ? v : undefined;
    case 'enum': return a.includes(v) ? v : undefined;
    case 'size': return type === 'label' ? (['micro', 'small', 'body'].includes(v) ? v : undefined) : type === 'flow' ? num(v, 0.5, 6) : num(v, type === 'point' ? 4 : 0.5, type === 'point' ? 32 : 6);
    case 'icon': return typeof v === 'string' && (ICON.test(v) || (o.local && PROP.test(v))) ? v : undefined;
    case 'dash': { const d = Array.isArray(v) && v.length <= 6 ? v.map(n => num(n, 0, 40)) : null; return d && d.every(n => n !== undefined) ? d : undefined; }
    case 'path': return isObj(v) ? normStyle(v, 'line', o, o.pr, PATH_KEYS) : undefined;
    default: { // by
      if (!isObj(v)) return undefined;
      const out = {}; for (const [k, s] of Object.entries(v).slice(0, LIMITS.by)) if (LID.test(k) && isObj(s)) out[k] = normStyle(s, type, o, o.pr, null, true);
      return out;
    }
  }
};
/** normStyle(style, type, { local }, problems) -> a style with every key re-checked and clamped (§4); unknown keys and bad values are listed and dropped. */
export function normStyle(style, type, o = {}, problems = [], only = null, nested = false) {
  const out = {};
  for (const [k, v] of Object.entries(isObj(style) ? style : {})) {
    if (EXT(k)) continue;
    if (!Object.hasOwn(STYLE, k) || (only && !only.includes(k)) || (nested && k === 'by')) { problems.push({ code: 'style-unknown', key: k }); continue; }
    const r = coerce(STYLE[k], v, type, { ...o, pr: problems });
    if (r === undefined) problems.push({ code: 'style-value', key: k }); else out[k] = r;
  }
  return out;
}

const nameList = (v, re, max = 64) => (Array.isArray(v) ? v.filter(s => typeof s === 'string' && re.test(s)).slice(0, max) : undefined);
function normApplies(a, problems) {
  if (!isObj(a)) { problems.push({ code: 'applies-type' }); return undefined; }
  const out = {};
  for (const [k, re] of [['views', ID], ['kinds', LID], ['nodes', ID], ['node_types', NODE_TYPE], ['periods', ID]]) if (a[k] !== undefined) { const l = nameList(a[k], re); if (l) out[k] = l; else problems.push({ code: 'applies-value', key: k }); }
  for (const k of ['dark', 'data']) if (a[k] !== undefined) { if (typeof a[k] === 'boolean') out[k] = a[k]; else problems.push({ code: 'applies-value', key: k }); }
  if (a.mvu !== undefined) {
    const m = a.mvu, path = isObj(m) ? text(m.path, 80) : undefined;
    if (!path) problems.push({ code: 'applies-value', key: 'mvu' });
    else { out.mvu = { path }; for (const k of ['min', 'max']) if (typeof m[k] === 'number' && Number.isFinite(m[k])) out.mvu[k] = m[k]; if (typeof m.truthy === 'boolean') out.mvu.truthy = m.truthy; if (['string', 'number', 'boolean'].includes(typeof m.equals)) out.mvu.equals = m.equals; }
  }
  return out;
}
function normMenu(m, kernel, problems) {
  if (!isObj(m)) { problems.push({ code: 'menu-type' }); return undefined; }
  const out = {}, label = text(m.label, 60);
  if (label) out.label = label; else if (!kernel) { problems.push({ code: 'menu-incomplete' }); return undefined; }
  const title = typeof m.title === 'string' && cpLen(m.title) <= 200 ? m.title : undefined; if (title) out.title = title;
  if (typeof m.order === 'number' && Number.isFinite(m.order)) out.order = m.order;
  for (const k of ['default', 'hidden']) if (typeof m[k] === 'boolean') out[k] = m[k];
  if (isObj(m.i18n)) { const o = {}; for (const [l, v] of Object.entries(m.i18n)) { if (!LANG.test(l) || !isObj(v)) continue; const e = {}; const a = text(v.label, 60); if (a) e.label = a; if (typeof v.title === 'string' && cpLen(v.title) <= 200) e.title = v.title; if (Object.keys(e).length) o[l] = e; } if (Object.keys(o).length) out.i18n = o; }
  return out;
}
function normLegend(l, problems) {
  if (!Array.isArray(l)) { problems.push({ code: 'legend-type' }); return undefined; }
  if (l.length > LIMITS.legend) problems.push({ code: 'legend-limit' });
  const out = [];
  for (const r of l.slice(0, LIMITS.legend)) {
    const label = isObj(r) ? text(r.label, 60) : undefined; if (!label) { problems.push({ code: 'legend-row' }); continue; }
    const row = { label }, d = typeof r.desc === 'string' && cpLen(r.desc) <= 200 ? r.desc : undefined; if (d) row.desc = d;
    if (typeof r.kind === 'string' && LID.test(r.kind)) row.kind = r.kind;
    if (isObj(r.i18n)) { const o = {}; for (const [k, v] of Object.entries(r.i18n)) if (LANG.test(k) && isObj(v)) { const e = {}; const a = text(v.label, 60); if (a) e.label = a; if (typeof v.desc === 'string' && cpLen(v.desc) <= 200) e.desc = v.desc; if (Object.keys(e).length) o[k] = e; } if (Object.keys(o).length) row.i18n = o; }
    out.push(row);
  }
  return out;
}

const LOCAL_SOURCES = ['inline', 'view', 'events', 'people', 'items', 'routine'];
/** normLayer(raw, { kernelIds, trust }) -> { layer | null, problems } (§2.2, §3.3). */
export function normLayer(raw, { kernelIds = KERNEL_IDS, trust = 'pack' } = {}) {
  const problems = [], no = code => { problems.push({ code }); return { layer: null, problems }; };
  if (!isObj(raw)) return no('layer-type');
  const id = raw.id, ks = kernelIds instanceof Set ? kernelIds : new Set(kernelIds);
  if (typeof id !== 'string' || !LID.test(id)) return no('layer-id');
  for (const k of Object.keys(raw)) if (!EXT(k) && !['id', 'type', 'slot', 'source', 'data', 'filter', 'applies', 'style', 'menu', 'legend', 'off'].includes(k)) problems.push({ code: 'unknown-key', key: k });
  const kernel = ks.has(id), local = trust === 'local', layer = { id, origin: kernel ? 'kernel' : local ? 'local' : 'pack' };
  if (kernel) { if (['type', 'slot', 'source', 'style', 'data', 'filter'].some(k => raw[k] !== undefined)) problems.push({ code: 'layer-kernel-fixed', id }); }
  else {
    if (local && !id.startsWith('local-')) return no('local-id');
    if (!BLOCKS.includes(raw.type) || !SLOTS.includes(raw.slot) || (raw.source === undefined && raw.data === undefined)) return no('layer-incomplete');
    const src = raw.source === undefined ? { kind: 'inline' } : parseSource(raw.source);
    if (!src || src.kind === 'kernel') return no('layer-source');
    if (local && !LOCAL_SOURCES.includes(src.kind)) return no('local-source');
    Object.assign(layer, { type: raw.type, slot: raw.slot, source: raw.source ?? 'inline' });
    const a = isObj(raw.applies) ? raw.applies : {}, view = Array.isArray(a.views) && a.views.length === 1 ? a.views[0] : undefined;
    if (raw.data !== undefined) {
      if (!isObj(raw.data)) problems.push({ code: 'layer-data' });
      else if (raw.type === 'sound') layer.data = raw.data;
      else if (Array.isArray(raw.data.features)) {
        if (raw.data.features.length > LIMITS.features) problems.push({ code: 'layer-limit', key: 'features' });
        layer.data = { features: raw.data.features.slice(0, LIMITS.features).map(f => normFeature(f, raw.type, { view, problems })).filter(Boolean) };
      } else problems.push({ code: 'layer-data' });
    }
    if (raw.filter !== undefined) { const k = isObj(raw.filter) ? nameList(raw.filter.kinds, LID, 32) : undefined; if (k) layer.filter = { kinds: k }; else problems.push({ code: 'layer-filter' }); }
    if (raw.style !== undefined) Object.assign(layer, { style: normStyle(raw.style, raw.type, { local }, problems) });
  }
  if (raw.applies !== undefined) { const a = normApplies(raw.applies, problems); if (a) layer.applies = a; }
  if (raw.menu !== undefined) { const m = normMenu(raw.menu, kernel, problems); if (m) layer.menu = m; }
  if (raw.legend !== undefined) { const l = normLegend(raw.legend, problems); if (l) layer.legend = l; }
  if (raw.off !== undefined) { if (kernel && typeof raw.off === 'boolean') layer.off = raw.off; else problems.push({ code: kernel ? 'layer-off' : 'layer-kernel-fixed', id }); }
  return { layer, problems };
}

/** mergeLayers(kernel, rows, { trust }) -> { layers, problems }: the kernel list with the pack's rows on it (§2.2). Kernel layers keep their facts and carry
 *  `adjust` (the pack's own values of the adjusted fields; `menu` is also merged over the kernel menu); new layers follow in array order (limit LIMITS.layers). */
export function mergeLayers(kernel, rows, { trust = 'pack' } = {}) {
  const problems = [], kids = new Set((kernel || []).map(l => l.id)), out = (kernel || []).map(l => ({ ...JSON.parse(JSON.stringify(l)), origin: 'kernel' })), byId = new Map(out.map(l => [l.id, l]));
  const seen = new Set(); let added = 0;
  (Array.isArray(rows) ? rows : []).forEach((raw, i) => {
    const { layer, problems: ps } = normLayer(raw, { kernelIds: kids, trust });
    for (const p of ps) problems.push({ ...p, index: i });
    if (!layer) return;
    if (seen.has(layer.id)) { problems.push({ code: 'layer-duplicate', id: layer.id, index: i }); return; }
    seen.add(layer.id);
    if (layer.origin === 'kernel') {
      const k = byId.get(layer.id);
      for (const key of ['menu', 'applies', 'legend', 'off']) if (layer[key] !== undefined) { (k.adjust ||= {})[key] = layer[key]; k[key] = key === 'menu' ? { ...k.menu, ...layer.menu } : layer[key]; }
      return;
    }
    if (added >= LIMITS.layers) { problems.push({ code: 'layer-limit', id: layer.id, index: i }); return; }
    added++;
    if (layer.menu) layer.menu = { ...layer.menu, order: layer.menu.order ?? 1000 + i };
    out.push(layer);
  });
  return { layers: out, problems };
}

/** appliesTo(applies, ctx, type) -> boolean (§5). ctx = { view, kind, owner, ancestors, nodeType, period, dark, count, mvu }; an absent or empty `applies` is true. */
export function appliesTo(applies, ctx, type) {
  if (!isObj(applies) || !Object.keys(applies).length) return true;
  const c = ctx || {}, a = applies, has = (list, v) => list.includes(v);
  if (a.views?.length && !has(a.views, c.view)) return false;   // an empty list constrains nothing
  if (a.kinds?.length && !has(a.kinds, c.kind)) return false;
  if (a.nodes?.length && !(has(a.nodes, c.owner) || (c.ancestors || []).some(n => has(a.nodes, n)))) return false;
  if (a.node_types?.length && !has(a.node_types, c.nodeType)) return false;
  if (a.periods?.length && !has(a.periods, c.period)) return false;
  if (a.dark !== undefined && !!c.dark !== a.dark) return false;
  if ((a.data ?? DATA_BLOCKS.includes(type)) && typeof c.count === 'number' && c.count < 1) return false;
  if (a.mvu) {
    const m = a.mvu, v = c.mvu?.[m.path];
    if (v === undefined || v === null) return false;
    if (m.equals !== undefined && v !== m.equals) return false;
    if (m.min !== undefined && !(Number(v) >= m.min)) return false;
    if (m.max !== undefined && !(Number(v) <= m.max)) return false;
    if (m.truthy !== undefined && !!v !== m.truthy) return false;
  }
  return true;
}

/** layersBlock: the `validate2` spec of the layers block (a path to a file, or the array). Each row goes through normLayer; extension keys are kept. */
export const layersBlock = (v, p, x) => {
  if (typeof v === 'string') return str({ re: PATH_RE })(v, p, x);
  if (!Array.isArray(v)) return bad(x, p, 'type', 'array');
  if (v.length > 64) bad(x, p, 'too-many', v.length);
  const out = [], ids = new Set();
  v.slice(0, 64).forEach((raw, i) => {
    const { layer, problems } = normLayer(raw, { trust: 'pack' });
    for (const q of problems) x.problems.push({ code: q.code, path: `${p}[${i}]`, ...(q.key ? { detail: q.key } : {}) });
    if (!layer) return;
    if (ids.has(layer.id)) { bad(x, `${p}[${i}]`, 'layer-duplicate', layer.id); return; }
    ids.add(layer.id);
    const { origin, ...row } = layer;
    for (const [k, val] of Object.entries(raw)) if (EXT(k)) row[k] = val;
    out.push(row);
  });
  return out;
};
