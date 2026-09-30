// Schema 2 packs (docs/kernel-schema.md §2, §12): validation with per-item healing (K-R06), trust and limits
// (K-R63..K-R66), block resolution and defaults (K-R60). Pure. core/pack.mjs keeps rejecting schema 2.
import { normalise, cpLen, cut } from './lexicon.mjs';
import { buildTree } from './nodes.mjs';
import { LIFE, KERNEL_BLOCKS } from './pack-v2-rows.mjs';
import * as S from './pack-v2-spec.mjs';
export { typeOf, fieldValue, entityRows, stashRows } from './pack-v2-rows.mjs';

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const { DROP, BLOCKS, bad } = S;
const clone = v => JSON.parse(JSON.stringify(v));
const LEGACY_RESERVED = ['stat_data', 'display_data', 'delta_data', 'schema'];
const LIMITS = { bytes: 1 << 20, depth: 16, array: 1000, string: 4000, words: 20000, shared: 8, entries: 16, entry: 2000, entriesTotal: 16000 };

/** K-R06.1: lower case, characters outside [a-z0-9_] become `_`, `n_` prefixed unless it starts with a letter; null if nothing survives. */
export function repairId(v) {
  const s = String(v ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (!/[a-z0-9]/.test(s)) return null;
  return (/^[a-z]/.test(s) ? s : `n_${s}`).slice(0, 64);
}
/** K-R65: neutralise host macros (everything but {{user}} / {{char}}) and template delimiters. Not content filtering. */
export function escapeHost(s) {
  return String(s ?? '').replace(/[]/g, '').replace(/\{\{(user|char)\}\}/gi, '$1')
    .replace(/\{\{/g, '\\{\\{').replace(/\}\}/g, '\\}\\}').replace(/<%/g, '<\\%').replace(/%>/g, '%\\>').replace(/(user|char)/g, '{{$1}}');
}

function limit(v, depth, p, x) {   // K-R66: array and string caps; depth is checked by the caller's throw
  if (depth > LIMITS.depth) throw new Error('depth');
  if (typeof v === 'string') { if (v.length > LIMITS.string && cpLen(v) > LIMITS.string) { bad(x, p, 'limit-string'); return cut(v, LIMITS.string); } return v; }
  if (Array.isArray(v)) { if (v.length > LIMITS.array) bad(x, p, 'limit-array', v.length); return v.slice(0, LIMITS.array).map((e, i) => limit(e, depth + 1, `${p}[${i}]`, x)); }
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, e]) => [k, limit(e, depth + 1, `${p}.${k}`, x)]));
  return v;
}
const del = (o, k, p, x, code) => { if (isObj(o) && k in o) { delete o[k]; bad(x, `${p}.${k}`, code); } };

function fixIds(list, x) {   // node ids: repaired, unrepairable and duplicate ones dropped; one problem each
  const seen = new Set(), out = [];
  list.forEach((n, i) => {
    if (!isObj(n) || typeof n.id !== 'string') return out.push(n);
    const r = repairId(n.id), p = `nodes[${i}].id`;
    if (r === null) return bad(x, p, 'id-unrepairable', n.id);
    if (r !== n.id) { x.repaired.add(n.id); x.problems.push({ code: 'id-repaired', path: p, detail: n.id }); }
    if (seen.has(r)) return bad(x, p, 'node-duplicate', r);
    seen.add(r); out.push({ ...n, id: r });
  });
  return out;
}

function crossCheck(pack, x, trusted) {   // what tools/check_pack.py checks beyond the schemas, healed per item
  const nodes = Array.isArray(pack.nodes) ? pack.nodes : null, views = isObj(pack.views) ? pack.views : {};
  const ids = new Set((nodes || []).map(n => n.id)), has = nodes && nodes.length ? id => ids.has(id) : () => true;
  if (nodes) {
    for (const pr of buildTree(nodes, { title: pack.title }).problems) x.problems.push({ code: `tree-${pr.code}`, path: 'nodes', detail: pr.id });
    nodes.forEach((n, i) => {
      const p = `nodes[${i}]`;
      if (n.enter !== undefined && (!ids.has(n.enter) || nodes.find(c => c.id === n.enter).parent !== n.id)) del(n, 'enter', p, x, 'ref-enter');
      if (Array.isArray(n.links)) n.links = n.links.filter((l, j) => ids.has(l.to) || (bad(x, `${p}.links[${j}]`, 'ref-node', l.to), false));
      if (Array.isArray(n.alias) && !n.alias.concat(n.hints || []).some(w => normalise(w) === normalise(n.name))) bad(x, `${p}.alias`, 'alias-name');
      if (n.view !== undefined) {
        const l = (Array.isArray(n.view) ? n.view : [n.view]).filter(v => Object.hasOwn(views, v));
        if (l.length !== (Array.isArray(n.view) ? n.view.length : 1)) bad(x, `${p}.view`, 'ref-view');
        if (l.length) n.view = Array.isArray(n.view) ? l : l[0]; else delete n.view;
      }
      if (n.at && n.at.view !== undefined && !Object.hasOwn(views, n.at.view)) del(n.at, 'view', `${p}.at`, x, 'ref-view');
    });
  }
  for (const [k, v] of Object.entries(views)) {
    (v.overlays || []).forEach((o, i) => { if (o.from !== undefined && !Object.hasOwn(views, o.from)) del(o, 'from', `views.${k}.overlays[${i}]`, x, 'ref-view'); });
    if (v.home && v.home.focus !== undefined && !has(v.home.focus)) del(v.home, 'focus', `views.${k}.home`, x, 'ref-node');
    if (v.insets) v.insets.forEach((o, i) => { if (o.node !== undefined && !has(o.node)) del(o, 'node', `views.${k}.insets[${i}]`, x, 'ref-node'); });
    if (!trusted && 'x-page' in v) del(v, 'x-page', `views.${k}`, x, 'trust-x-page');
  }
  if (pack.items && Array.isArray(pack.items.stash)) pack.items.stash = pack.items.stash.filter((r, i) => has(r.node) || (bad(x, `items.stash[${i}].node`, 'ref-node', r.node), false));
  for (const g of (pack.entities && pack.entities.groups) || []) for (const r of g.fallback || []) if (r.node !== undefined && !has(r.node)) del(r, 'node', `entities.groups.${g.id}`, x, 'ref-node');
  if (pack.ui) {
    if (pack.ui.start !== undefined && !has(pack.ui.start)) del(pack.ui, 'start', 'ui', x, 'ref-node');
    for (const [k, l] of Object.entries(pack.ui.levels || {})) {
      if (!has(k)) { delete pack.ui.levels[k]; bad(x, `ui.levels.${k}`, 'ref-node'); continue; }
      pack.ui.levels[k] = l.filter(e => has(e) || (bad(x, `ui.levels.${k}`, 'ref-node', e), false));
    }
  }
  const ev = pack.events;
  if (ev) {
    const gs = new Set([...(ev.groups || []).map(g => g.id), 'other']), fx = new Set([...Object.keys(ev.fx_presets || {}), ...KERNEL_BLOCKS]);
    for (const [k, t] of Object.entries(ev.types || {})) {
      if (!gs.has(t.group)) { delete ev.types[k]; bad(x, `events.types.${k}.group`, 'ref-group', t.group); }
      else if (t.fx !== undefined && !fx.has(t.fx)) del(t, 'fx', `events.types.${k}`, x, 'ref-fx');
    }
  }
  if (pack.vars && pack.vars.periods) {
    let last = '';
    pack.vars.periods = pack.vars.periods.filter((q, i) => (q.start > last ? (last = q.start, true) : (bad(x, `vars.periods[${i}].start`, 'period-order', q.start), false)));
  }
}

function trustFilter(pack, x) {   // K-R63, K-R65, K-R66 for a foreign pack
  del(pack, 'cdn', 'manifest', x, 'trust-cdn'); del(pack, 'legacy', 'manifest', x, 'trust-legacy');
  for (const [k, v] of Object.entries(pack.features || {})) if (v === true) del(pack.features, k, 'features', x, 'trust-feature');
  if (Array.isArray(pack.nodes)) {
    const share = new Map(); let total = 0;
    for (const [i, n] of pack.nodes.entries()) for (const f of ['alias', 'hints']) if (Array.isArray(n[f])) n[f] = n[f].filter(w => {
      const k = normalise(w), c = share.get(k) || 0;
      if (c >= LIMITS.shared || (c === 0 && total >= LIMITS.words)) return bad(x, `nodes[${i}].${f}`, 'limit-shared', w) && false;
      if (c === 0) total++; share.set(k, c + 1); return true;
    });
  }
  const t = pack.llm && pack.llm.templates;
  const esc = (o, k, p) => { if (typeof o[k] === 'string') { const e = escapeHost(o[k]); if (e !== o[k]) { o[k] = e; x.problems.push({ code: 'escaped', path: p }); } } };
  for (const [l, tp] of Object.entries(t || {})) for (const k of Object.keys(tp)) esc(tp, k, `llm.templates.${l}.${k}`);
  const wb = pack.llm && pack.llm.worldbook;
  if (wb && Array.isArray(wb.entries)) {
    if (wb.entries.length > LIMITS.entries) bad(x, 'llm.worldbook.entries', 'limit-entries', wb.entries.length);
    let total = 0;
    wb.entries = wb.entries.slice(0, LIMITS.entries).filter((e, i) => {
      const p = `llm.worldbook.entries[${i}]`;
      esc(e, 'name', p); esc(e, 'content', p);
      if (Array.isArray(e.keys)) { e.keys = e.keys.map(k => escapeHost(k)); }
      if (cpLen(e.content) > LIMITS.entry) { e.content = cut(e.content, LIMITS.entry); bad(x, p, 'limit-entry'); }
      total += cpLen(e.content);
      return total <= LIMITS.entriesTotal || (bad(x, p, 'limit-total'), false);
    });
  }
}

/** Manifest (blocks inline) -> { pack, problems }; pack is null when the pack is refused. opts: trusted (default false),
 *  shipped (ids of shipped packs), reserved (storage prefixes), reservedNames (legacy names). */
export function validate2(manifest, { trusted = false, shipped = [], reserved = [], reservedNames = [] } = {}) {
  const x = { problems: [], repaired: new Set() };
  x.ref = (v, p) => {
    const r = repairId(v);
    if (r === null) return bad(x, p, 'id-unrepairable', v);
    if (r !== v && !x.repaired.has(v)) x.problems.push({ code: 'id-repaired', path: p, detail: v });
    return r;
  };
  const refuse = (code, detail) => { bad(x, 'manifest', code, detail); return { pack: null, problems: x.problems }; };
  if (!isObj(manifest)) return refuse('type', 'object');
  let m;
  try {
    if (!trusted && new TextEncoder().encode(JSON.stringify(manifest)).length > LIMITS.bytes) return refuse('limit-size');
    m = trusted ? clone(manifest) : limit(manifest, 0, 'manifest', x);
  } catch (e) { return refuse(e.message === 'depth' ? 'limit-depth' : 'invalid'); }
  const head = S.obj(S.MANIFEST, { req: ['id', 'schema', 'title'], ext: 'b' })(Object.fromEntries(Object.entries(m).filter(([k]) => !BLOCKS.includes(k))), 'manifest', x);
  if (head === DROP) return { pack: null, problems: x.problems };
  if (!trusted && shipped.includes(head.id)) return refuse('trust-shipped-id', head.id);
  const specs = { nodes: S.nodesBlock, views: S.viewsBlock, vars: S.varsBlock, entities: S.entitiesBlock(reserved), items: S.itemsBlock, events: S.eventsBlock, layers: S.layersBlock, ui: S.uiBlock, llm: S.llmBlock };
  for (const k of BLOCKS) {
    if (!(k in m)) continue;
    const v = k === 'nodes' && Array.isArray(m.nodes) ? fixIds(m.nodes, x) : m[k];
    const r = specs[k](v, k, x);
    if (r !== DROP) head[k] = r;
  }
  if (trusted) {
    const res = new Set([...LEGACY_RESERVED, ...reservedNames]);
    for (const [k, v] of Object.entries(head.legacy || {})) if (typeof v === 'string' && res.has(v)) del(head.legacy, k, 'legacy', x, 'legacy-reserved');
  }
  crossCheck(head, x, trusted);
  if (!trusted) trustFilter(head, x);
  return { pack: head, problems: x.problems };
}

/** Blocks given as a relative path are fetched with fetchJSON(path) and inlined: { manifest, problems }. */
export async function resolveBlocks(manifest, fetchJSON) {
  const out = { ...manifest }, problems = [], base = 'https://pack.invalid/base/';
  await Promise.all(BLOCKS.map(async k => {
    const v = manifest && manifest[k];
    if (typeof v !== 'string') return;
    const fail = code => { delete out[k]; problems.push({ code, path: k, detail: v }); };
    if (!S.PATH_RE.test(v) || !new URL(v, base).href.startsWith(base)) return fail('path');
    try { const b = await fetchJSON(v); if (b && typeof b === 'object') out[k] = b; else fail('fetch'); } catch (e) { fail('fetch'); }
  }));
  return { manifest: out, problems };
}

export const DEFAULT_PERIODS = Object.freeze([
  { id: 'dawn', start: '05:00' }, { id: 'day', start: '07:00' }, { id: 'dusk', start: '17:00' }, { id: 'night', start: '20:00', dark: true }]);
export const DEFAULT_LEVELS = Object.freeze([
  { value: 0, label: 'over', i18n: { zh: { label: '结束' } } }, { value: 1, label: 'minor', i18n: { zh: { label: '轻微' } } },
  { value: 2, label: 'serious', i18n: { zh: { label: '严重' } } }, { value: 3, label: 'severe', i18n: { zh: { label: '危急' } } }]);

/** K-R60: what the engine fills in for missing blocks (views, entities, layers and llm stay as given). */
export function withDefaults(pack) {
  const p = clone(pack), ev = isObj(p.events) ? p.events : {};
  p.vars = { ...(isObj(p.vars) ? p.vars : {}) };
  if (!Array.isArray(p.vars.periods) || !p.vars.periods.length) p.vars.periods = clone(DEFAULT_PERIODS);
  const groups = Array.isArray(ev.groups) && ev.groups.length ? ev.groups : [];
  const types = isObj(ev.types) ? ev.types : {};
  p.events = { groups: [{ id: 'other' }], types: { other: { group: 'other' } }, fx_presets: {}, levels: clone(DEFAULT_LEVELS), closed: [], examples: [], life: { ...LIFE }, ...ev };
  p.events.groups = groups.length ? groups : [{ id: 'other' }];
  if (!p.events.groups.some(g => g.id === 'other')) p.events.groups = [...p.events.groups, { id: 'other' }];
  p.events.types = { ...types };
  if (!p.events.types.other) p.events.types.other = { group: 'other' };
  p.events.life = { ...LIFE, ...(isObj(ev.life) ? ev.life : {}) };
  p.items = { ...(isObj(p.items) ? p.items : {}) };
  if (!Array.isArray(p.items.stash)) p.items.stash = [];
  p.ui = { ...(isObj(p.ui) ? p.ui : {}) };
  if (typeof p.ui.start !== 'string') p.ui.start = buildTree(Array.isArray(p.nodes) ? p.nodes : [], { title: p.title }).root;
  return p;
}
