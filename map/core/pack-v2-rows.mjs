// Run-time readers of a v2 pack's blocks (docs/kernel-schema.md K-R42, K-R45, K-R50): event types, attribute values,
// roster rows and world stash rows. Pure; re-exported by pack-v2.mjs.
import { normalise, cut } from './lexicon.mjs';
import { positionOf } from './nodes.mjs';
import { normStash } from './stash.mjs';

export const LIFE = Object.freeze({ live: 7, after: 20, fade: 40, merge: 15, per_msg: 3 });   // K-R54
export const KERNEL_BLOCKS = ['none', 'glitch', 'flash', 'shake', 'tint', 'pulse'];
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => isObj(o) && Object.hasOwn(o, k);
const str = v => typeof v === 'string';

/** K-R50: a category word -> { type, group, label, color, shape, icon, source, rare, life, inject, fx }. */
export function typeOf(word, events) {
  const ev = isObj(events) ? events : {}, types = isObj(ev.types) ? ev.types : {}, groups = Array.isArray(ev.groups) ? ev.groups.filter(isObj) : [];
  const w = normalise(word);
  const labels = (id, t) => [t.label, ...Object.values(isObj(t.i18n) ? t.i18n : {}).map(x => x?.label), id].filter(str).map(normalise).filter(Boolean);
  const aliases = t => (Array.isArray(t.alias) ? t.alias : []).filter(str).map(normalise).filter(Boolean);
  const ids = Object.keys(types).filter(id => isObj(types[id]));
  const contained = pick => {   // longest contained word, then earliest position
    let best = null;
    for (const id of ids) if (id !== 'other') for (const x of pick(id, types[id])) { const at = w.indexOf(x); if (at >= 0 && (!best || x.length > best.n || (x.length === best.n && at < best.at))) best = { id, n: x.length, at }; }
    return best && best.id;
  };
  let id = null, group = null;
  if (w) {
    id = ids.find(i => labels(i, types[i]).includes(w) || aliases(types[i]).includes(w)) ?? contained(labels) ?? contained((i, t) => aliases(t));
    if (!id) {
      const g = groups.find(x => normalise(x.id) === w || labels(x.id, x).includes(w));
      if (g) group = g.id;
    }
  }
  const t = id ? types[id] : isObj(types.other) ? types.other : {}, gid = group ?? (id ? t.group : null) ?? 'other', grp = groups.find(x => x.id === gid);
  const label = str(t.label) ? t.label : 'other';
  const preset = str(t.fx) && own(ev.fx_presets, t.fx) ? { ...ev.fx_presets[t.fx] } : str(t.fx) && KERNEL_BLOCKS.includes(t.fx) ? { block: t.fx } : null;
  return {
    type: id || 'other', group: gid, label, color: (id ? t.color : undefined) ?? grp?.color ?? null, shape: grp?.shape ?? 'square',
    icon: t.icon ?? [...label][0], source: t.source ?? '', rare: t.rare ?? 1,
    life: { ...LIFE, ...(isObj(ev.life) ? ev.life : {}), ...(isObj(t.life) ? t.life : {}) }, inject: t.inject !== false, fx: preset,
  };
}

const unwrap = v => (Array.isArray(v) && v.length >= 1 && v.length <= 2 ? v[0] : v);   // MVU [value, note] pair (K-R37)
const scalar = v => (str(v) ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : null);
const stepWords = s => [s.label, ...(Array.isArray(s.match) ? s.match : [])].filter(str).map(normalise).filter(Boolean);
function ladderStep(text, steps) {
  const t = normalise(text); if (!t) return null;
  let hit = steps.findIndex(s => stepWords(s).includes(t));
  if (hit < 0) { let n = 0; steps.forEach((s, i) => { for (const x of stepWords(s)) if (t.includes(x) && x.length > n) { n = x.length; hit = i; } }); }
  return hit < 0 ? null : { index: hit, label: steps[hit].label };
}
/** K-R42: the value of one attribute field of a row, by kind; null when missing or unreadable. */
export function fieldValue(def, row, { lang } = {}) {
  if (!isObj(def) || !isObj(row) || !str(def.field)) return null;
  const raw = own(row, def.field) ? unwrap(row[def.field]) : undefined;
  switch (def.kind) {
    case 'text': { const s = scalar(raw); return s ? cut(s, 80) : null; }
    case 'tag': {
      if (typeof raw === 'boolean') return /^zh/i.test(lang || '') ? (raw ? '是' : '否') : raw ? 'yes' : 'no';
      const s = scalar(raw); return s ? cut(s, 24) : null;
    }
    case 'gauge': {
      const n = typeof raw === 'number' ? raw : str(raw) && raw.trim() !== '' ? Number(raw) : NaN;
      if (!Number.isFinite(n)) return null;
      const min = Number.isFinite(def.min) ? def.min : 0, max = Number.isFinite(def.max) ? def.max : 100, value = Math.min(max, Math.max(min, n));
      const band = Array.isArray(def.ladder) ? def.ladder.find(b => isObj(b) && Number.isFinite(b.up_to) && b.up_to >= value) : null;
      return { value, min, max, ...(band ? { band: band.label } : {}) };
    }
    case 'ladder': {
      const steps = (Array.isArray(def.ladder) ? def.ladder : []).filter(s => isObj(s) && str(s.label));
      const s = scalar(raw);
      if (s) return ladderStep(s, steps);
      if (def.scan === true && raw === undefined) for (const v of Object.values(row)) { const t = str(v) ? v : null; const r = t && ladderStep(t, steps); if (r) return r; }
      return null;
    }
    default: return null;
  }
}

/** Rows for RosterSystem from each group's pack rows (`fallback`); role = first text field shown as subtitle. */
export function entityRows(entities, tree) {
  const groups = Array.isArray(entities?.groups) ? entities.groups : [], fields = Array.isArray(entities?.fields) ? entities.fields : [];
  const roleDef = fields.find(f => isObj(f) && f.kind === 'text' && f.show === 'subtitle');
  const out = [];
  for (const g of groups) for (const r of isObj(g) && Array.isArray(g.fallback) ? g.fallback : []) {
    if (!isObj(r) || !str(r.name) || !r.name.trim()) continue;
    const values = isObj(r.values) ? r.values : {}, role = roleDef ? fieldValue(roleDef, values) : null;
    out.push({ name: r.name.trim().replace(/\s+/g, ' ').slice(0, 40), source: 'fallback', ...(role ? { role } : {}),
      ...(str(r.node) && tree?.has(r.node) ? { location: r.node } : {}), raw: { values } });
  }
  return out;
}

/** K-R45: items.stash -> { items } in the stash.mjs shape (map = owner of the node's framed view or ''). */
export function stashRows(items, tree, views) {
  const rows = [];
  for (const r of Array.isArray(items?.stash) ? items.stash : []) {
    if (!isObj(r) || !str(r.node) || !tree.has(r.node)) continue;
    const { id, name, hidden, note, dc, qty } = r;
    rows.push({ id, name, map: positionOf(tree, views, r.node)?.owner || '', marker: r.node, place: tree.get(r.node).name, hidden, note, dc, qty });
  }
  return normStash({ items: rows });
}
