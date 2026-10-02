// The transit block (docs/kernel-schema.md K-R107, docs/transit-schema.md §2): modes, stations, lines, links, districts, options and style, with
// K-R06 per-item healing. normTransit drops the bad part, lists one problem for it and keeps the rest; a block with no usable station is null.
// Pure: no DOM, no storage, no host globals. pack-v2-spec.mjs imports this module and this one imports pack-v2-spec.mjs (recheck): the two only
// use each other inside functions, as layer-spec.mjs does.
import { recheck } from './pack-v2-spec.mjs';

export const TRANSIT_LIMITS = Object.freeze({ stations: 300, lines: 24, stops: 80, links: 600, districts: 64, modes: 8, pts: 200, bytes: 262144 });
export const FUNCTIONS = Object.freeze(['civic', 'commerce', 'residential', 'industry', 'military', 'religious', 'education', 'medical', 'leisure', 'transport', 'nature', 'restricted', 'other']);
export const TRIP_CLASSES = Object.freeze(['road', 'rail', 'underground', 'air', 'teleport']);
const M = (zh, en, trip, extra = {}) => Object.freeze({ label: zh, i18n: { en: { label: en } }, trip, ...extra });
export const DEFAULT_MODES = Object.freeze({
  walk: M('步行', 'Walk', 'road', { color: '--muted', dash: [1, 4] }), metro: M('地铁', 'Metro', 'underground'),
  maglev: M('磁悬浮', 'Maglev', 'rail'), air: M('空中', 'Air', 'air', { dash: [6, 4] }),
});
export const DEFAULT_OPTIONS = Object.freeze({ transfer_min: 3, walk_m_per_min: 80, access_max_min: 12, detour: 1.25 });
const RANGE = { transfer_min: [0, 30], walk_m_per_min: [20, 200], access_max_min: [0, 60], detour: [1, 2] };

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const ID = /^[a-z][a-z0-9_]{0,63}$/, MODE = /^[a-z][a-z0-9_]{0,15}$/, LID = /^[a-z][a-z0-9_-]{0,31}$/, NUM = /^[A-Za-z0-9]{1,3}$/, LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
const cp = s => [...s].length;
const text = (v, max) => (typeof v === 'string' && v !== '' && !v.includes('\n') && cp(v) <= max ? v : undefined);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const finite = v => typeof v === 'number' && Number.isFinite(v);
const colour = v => recheck.hex(v) || recheck.tokenName(v);   // a kernel token name or #rrggbb (K-R58, K-R64 re-check)
const unit = v => finite(v) && v >= 0 && v <= 1;
const pt = v => Array.isArray(v) && v.length === 2 && v.every(unit) ? [v[0], v[1]] : null;

/** i18n of one text field: { <lang>: { <field>: text } }, bad entries dropped. */
function names(raw, field, max) {
  if (!isObj(raw)) return undefined;
  const o = {};
  for (const [l, v] of Object.entries(raw)) { const t = LANG.test(l) && isObj(v) ? text(v[field], max) : undefined; if (t) o[l] = { [field]: t }; }
  return Object.keys(o).length ? o : undefined;
}
const ext = (raw, out) => { for (const k of Object.keys(raw)) if (k.startsWith('_') || k.startsWith('x-')) out[k] = raw[k]; return out; };

/** normTransit(block, { nodes, views }) -> { transit, problems }; `nodes` / `views` are id predicates (null = not checked). Idempotent: a healed block heals to itself. */
export function normTransit(block, { nodes = null, views = null } = {}) {
  const problems = [], P = (code, id, path) => problems.push({ code, ...(id !== undefined ? { id } : {}), ...(path ? { path } : {}) });
  const none = () => { P('transit-invalid'); return { transit: null, problems }; };
  if (!isObj(block)) return none();
  if (new TextEncoder().encode(JSON.stringify(block)).length > TRANSIT_LIMITS.bytes) { P('transit-limit', undefined, 'bytes'); return { transit: null, problems }; }
  const cap = (list, max, what) => { if (list.length > max) P('transit-limit', undefined, what); return list.slice(0, max); };

  // modes: pack rows over the kernel defaults
  const modes = {};
  for (const [id, m] of Object.entries(DEFAULT_MODES)) modes[id] = { ...m, i18n: { ...m.i18n }, ...(m.dash ? { dash: [...m.dash] } : {}) };
  for (const [id, raw] of Object.entries(isObj(block.modes) ? block.modes : {})) {
    const known = Object.hasOwn(DEFAULT_MODES, id), label = isObj(raw) ? text(raw.label, 24) : undefined, trip = isObj(raw) ? raw.trip : undefined;
    if (!MODE.test(id) || !isObj(raw) || (!known && (!label || !TRIP_CLASSES.includes(trip)))) { P('transit-mode-invalid', id); continue; }
    if (!known && Object.keys(modes).length >= TRANSIT_LIMITS.modes) { P('transit-limit', id, 'modes'); continue; }
    const m = known ? modes[id] : (modes[id] = { label, trip });
    if (known && label) m.label = label;
    const i = names(raw.i18n, 'label', 24); if (i) m.i18n = i;
    if (raw.color !== undefined) { const c = colour(raw.color); if (c) m.color = c; else P('transit-mode-invalid', id, 'color'); }
    if (raw.dash !== undefined) { const d = Array.isArray(raw.dash) && raw.dash.length <= 6 && raw.dash.every(n => finite(n) && n >= 0 && n <= 40); if (d) m.dash = [...raw.dash]; else P('transit-mode-invalid', id, 'dash'); }
  }

  // stations
  const sRows = cap(Array.isArray(block.stations) ? block.stations : [], TRANSIT_LIMITS.stations, 'stations'), stations = [], ids = new Set();
  sRows.forEach((raw, i) => {
    const id = isObj(raw) && typeof raw.id === 'string' && ID.test(raw.id) ? raw.id : undefined, bad = code => P(code, id, `stations[${i}]`);
    if (id === undefined) return P('transit-station-invalid', undefined, `stations[${i}]`);
    if (ids.has(id)) return P('transit-duplicate', id, `stations[${i}]`);
    const s = { id }, name = text(raw.name, 40);
    if (raw.node !== undefined) { if (typeof raw.node !== 'string' || !ID.test(raw.node)) return bad('transit-station-invalid'); if (nodes && !nodes(raw.node)) return bad('transit-station-node'); s.node = raw.node; }
    if (raw.view !== undefined || raw.at !== undefined) {
      const at = pt(raw.at);
      if (typeof raw.view !== 'string' || !ID.test(raw.view) || !at) { if (s.node === undefined) return bad('transit-station-invalid'); }
      else { if (views && !views(raw.view)) return bad('transit-station-view'); s.view = raw.view; s.at = at; }
    }
    if (s.node === undefined && !(s.view && name)) return bad('transit-station-invalid');
    if (name) s.name = name;
    const i18n = names(raw.i18n, 'name', 40); if (i18n) s.i18n = i18n;
    if (raw.district !== undefined) { if (typeof raw.district === 'string' && ID.test(raw.district)) s.district = raw.district; else bad('transit-station-invalid'); }
    if (raw.hidden === true) s.hidden = true;
    ids.add(id); stations.push(s);
  });
  if (!stations.length) return none();

  // lines: stops filtered to known stations; minutes kept per segment
  const lines = [], lineIds = new Set();
  cap(Array.isArray(block.lines) ? block.lines : [], TRANSIT_LIMITS.lines, 'lines').forEach((raw, i) => {
    const id = isObj(raw) && typeof raw.id === 'string' && LID.test(raw.id) ? raw.id : undefined, bad = (code, path) => { P(code, id, `lines[${i}]${path || ''}`); };
    if (id === undefined) return bad('transit-line-invalid');
    if (lineIds.has(id)) return P('transit-duplicate', id, `lines[${i}]`);
    const name = text(raw.name, 40), color = recheck.hex(raw.color);
    if (!name || !color || typeof raw.mode !== 'string' || !Object.hasOwn(modes, raw.mode) || !Array.isArray(raw.stops)) return bad('transit-line-invalid');
    const stops0 = cap(raw.stops, TRANSIT_LIMITS.stops, 'stops'), loop = raw.loop === true, segs = stops0.length - 1 + (loop ? 1 : 0);
    const min0 = Array.isArray(raw.min) ? raw.min : Array(Math.max(segs, 0)).fill(raw.min);
    if (stops0.length < 2 || min0.length !== segs || !min0.every(n => finite(n) && n >= 0.1 && n <= 600)) return bad(stops0.length < 2 ? 'transit-line-invalid' : 'transit-line-min');
    const seen = new Set(), stops = [], min = [];
    let carry = 0, lead = 0;   // carry: minutes of the removed segments in front of the next kept stop; lead: what a loop adds to its closing segment when the first stops are gone
    stops0.forEach((st, j) => {
      const keep = typeof st === 'string' && ids.has(st) && !seen.has(st);
      if (keep) { if (stops.length) min.push(carry); else lead = carry; carry = 0; seen.add(st); stops.push(st); } else bad('transit-line-stop', `.stops[${j}]`);
      carry += j < segs ? min0[j] : 0;
    });
    if (stops.length < 2) return bad('transit-line-invalid');
    if (loop) min.push(carry + lead);
    const l = { id, name, mode: raw.mode, color, stops, min };
    if (raw.number !== undefined) { if (typeof raw.number === 'string' && NUM.test(raw.number)) l.number = raw.number; else bad('transit-line-invalid', '.number'); }
    const i18n = names(raw.i18n, 'name', 40); if (i18n) l.i18n = i18n;
    if (loop) l.loop = true;
    if (raw.oneway === true) l.oneway = true;
    l.wait = finite(raw.wait) ? clamp(raw.wait, 0, 30) : 0;
    lineIds.add(id); lines.push(l);
  });

  // links
  const links = [];
  cap(Array.isArray(block.links) ? block.links : [], TRANSIT_LIMITS.links, 'links').forEach((raw, i) => {
    const ok = isObj(raw) && ids.has(raw.from) && ids.has(raw.to) && raw.from !== raw.to && typeof raw.mode === 'string' && Object.hasOwn(modes, raw.mode) && finite(raw.min) && raw.min >= 0.1 && raw.min <= 600;
    if (!ok) return P('transit-link-invalid', undefined, `links[${i}]`);
    links.push({ from: raw.from, to: raw.to, mode: raw.mode, min: raw.min, ...(raw.oneway === true ? { oneway: true } : {}) });
  });

  // districts
  const districts = [], dIds = new Set();
  cap(Array.isArray(block.districts) ? block.districts : [], TRANSIT_LIMITS.districts, 'districts').forEach((raw, i) => {
    const id = isObj(raw) && typeof raw.id === 'string' && ID.test(raw.id) ? raw.id : undefined, bad = path => P('transit-district-invalid', id, `districts[${i}]${path || ''}`);
    if (id === undefined) return bad();
    if (dIds.has(id)) return P('transit-duplicate', id, `districts[${i}]`);
    const name = text(raw.name, 40);
    if (!name || typeof raw.view !== 'string' || !ID.test(raw.view) || (views && !views(raw.view))) return bad();
    const d = { id, name, view: raw.view };
    if (raw.pts !== undefined) {
      const p = Array.isArray(raw.pts) && raw.pts.length >= 3 && raw.pts.length <= TRANSIT_LIMITS.pts ? raw.pts.map(pt) : null;
      if (!p || p.some(q => !q)) return bad('.pts'); d.pts = p;
    } else {
      if (typeof raw.node !== 'string' || !ID.test(raw.node) || (nodes && !nodes(raw.node))) return bad('.node');
      d.node = raw.node; d.r = finite(raw.r) && raw.r > 0 && raw.r <= 0.5 ? raw.r : 0.06;
    }
    if (raw.pts !== undefined && raw.node !== undefined && typeof raw.node === 'string' && ID.test(raw.node) && (!nodes || nodes(raw.node))) d.node = raw.node;
    if (FUNCTIONS.includes(raw.function)) d.function = raw.function; else { d.function = 'other'; bad('.function'); }
    d.danger = finite(raw.danger) ? Math.round(clamp(raw.danger, 0, 3)) : 0;
    const i18n = names(raw.i18n, 'name', 40); if (i18n) d.i18n = i18n;
    dIds.add(id); districts.push(d);
  });
  for (const s of stations) if (s.district !== undefined && !dIds.has(s.district)) { P('transit-station-invalid', s.id, 'district'); delete s.district; }

  const options = {};
  for (const [k, [lo, hi]] of Object.entries(RANGE)) options[k] = finite(block.options?.[k]) ? clamp(block.options[k], lo, hi) : DEFAULT_OPTIONS[k];
  const st = isObj(block.style) ? block.style : {}, style = { width: finite(st.width) ? clamp(st.width, 2, 8) : 2.5, labels: st.labels !== false, functions: {} };   // LOOK-1 A10-lite (D42): thin lines by default
  for (const [fn, v] of Object.entries(isObj(st.functions) ? st.functions : {})) { const c = FUNCTIONS.includes(fn) && isObj(v) ? colour(v.color) : null; if (c) style.functions[fn] = { color: c }; else P('transit-invalid', fn, 'style.functions'); }
  return { transit: ext(block, { modes, stations, lines, links, districts, options, style }), problems };
}

const pick = (o, key, lang) => {
  const l = typeof lang === 'string' ? lang : '', i = o?.i18n;
  return (l && (i?.[l]?.[key] ?? i?.[l.split('-')[0]]?.[key])) || undefined;
};
/** The mode's label in `lang` (the pack's own label, else the id). */
export const modeLabel = (transit, modeId, lang) => { const m = transit?.modes?.[modeId]; return pick(m, 'label', lang) ?? m?.label ?? String(modeId); };
/** The line's display name in `lang`, else its id. */
export const lineName = (transit, lineId, lang) => { const l = (transit?.lines || []).find(x => x.id === lineId); return pick(l, 'name', lang) ?? l?.name ?? String(lineId); };
/** The station's name: a node station takes `nodeName(node)` (the place's own name), else the station's own name in `lang`, else its id. */
export function stationName(transit, stationId, lang, nodeName) {
  const s = (transit?.stations || []).find(x => x.id === stationId);
  if (!s) return String(stationId);
  const n = s.node !== undefined && typeof nodeName === 'function' ? nodeName(s.node) : undefined;
  return (typeof n === 'string' && n) || pick(s, 'name', lang) || s.name || String(stationId);
}
/** The kernel dictionary key of a function's label. */
export const functionLabelKey = fn => 'transit.fn.' + fn;
