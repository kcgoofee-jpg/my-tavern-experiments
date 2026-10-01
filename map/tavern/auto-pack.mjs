// The automatic pack on the host (docs/kernel-schema.md K-R95, K-R26; docs/zero-config.md §4): derive it from the card, keep it as a droppable cache in the pack's chat variable under
// `auto` ({ v: 1, fp, pack, grown, seen }), grow it from the place texts of each round, recompute the growth from the chat, and tell the viewer (`eden-map:pack`, rev + 1).
// Loaded only when the resolved pack's source is `auto` (pack-gate.mjs, eden-map.js): the first pack never reaches this file. Never writes `stat_data`; the cache is written by the existing
// root-store save (`host.autoCache`), so no other key of the root is touched.
//   resolveAuto(src, { uiLang, cache })   gate side: the manifest to inject (derived pack + kept growth), its fingerprint and problems
//   normCache(c) / keepGrown(base, grown) / assemble(base, grown) / placesOf(text) / placesPerFloor(msgs, here)   pure helpers
//   createAutoPack(host)                   the per-instance driver: round(msgs, hereNow) grows, recomputes on chat load, saves and posts
import { deriveAutoPack } from '../core/card-read.mjs';
import { grow, recomputeGrowth, MAX_GROWN } from '../core/grow.mjs';
import { buildTree, vocabulary } from '../core/nodes.mjs';
import { validate2 } from '../core/pack-v2.mjs';
import { normalise, fnv36 } from '../core/lexicon.mjs';
import { parseHereTag } from './interaction-modes.mjs';
import { marksOf, setGeo } from './events-parse.mjs';
import { parseChars } from './characters-parse.mjs';
import { geoFromV2 } from './pack-runtime-v2.mjs';

export const MAX_SEEN = 400;
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const isG = n => isObj(n) && typeof n.id === 'string' && /^g_[a-z0-9]{1,13}$/.test(n.id) && typeof n.name === 'string' && n.name.length >= 1 && n.name.length <= 80;

/** The cache read back from the chat variable, or null: { v: 1, fp, pack?, grown?: [node], seen?: [text] } with the grown nodes shape-checked (a droppable cache is never trusted). */
export function normCache(c) {
  if (!isObj(c) || c.v !== 1 || typeof c.fp !== 'string') return null;
  const grown = Array.isArray(c.grown) ? c.grown.filter(isG).slice(0, MAX_GROWN).map(n => ({ id: n.id, name: n.name, alias: Array.isArray(n.alias) ? n.alias.filter(a => typeof a === 'string').slice(0, 4) : [n.name], ...(typeof n.parent === 'string' ? { parent: n.parent } : {}) })) : null;
  return { v: 1, fp: c.fp, pack: isObj(c.pack) && Array.isArray(c.pack.nodes) ? c.pack : null, grown, seen: Array.isArray(c.seen) ? c.seen.filter(s => typeof s === 'string').slice(-MAX_SEEN) : [] };
}
/** Grown nodes whose parent still exists in the base (or that have none), in order; a child of a dropped grown node goes too. */
export function keepGrown(base, grown) {
  const ids = new Set((base.nodes || []).map(n => n.id)), out = [];
  for (const n of Array.isArray(grown) ? grown : []) if (!ids.has(n.id) && (n.parent === undefined || ids.has(n.parent))) { ids.add(n.id); out.push(n); }
  return out;
}
export const assemble = (base, grown) => ({ ...base, nodes: [...(base.nodes || []), ...keepGrown(base, grown)] });
/** The ids of the grown nodes of a manifest, as one signature (what the viewer holds). */
export const growthSig = nodes => fnv36((nodes || []).filter(n => String(n.id).startsWith('g_')).map(n => n.id).join(','));

/** The place texts of one floor's text: the explicit place tag, the places of event tags and of character tags. */
export function placesOf(text) {
  const t = String(text ?? ''), out = [];
  try { const h = parseHereTag(t); if (h) out.push(h); } catch (e) {}
  try { for (const m of marksOf(t)) if (m.loc) out.push(String(m.loc)); } catch (e) {}
  try { for (const c of parseChars(t)) if (c.place) out.push(c.place); } catch (e) {}
  return out;
}
/** One array of place texts per floor, in floor order; the player's current place (the location variable) goes to the newest floor. */
export function placesPerFloor(msgs, hereNow, cache = null) {
  const list = (Array.isArray(msgs) ? msgs : []).slice().sort((a, b) => a.floor - b.floor).map(m => {
    const k = m.floor + '|' + (m.h ?? m.text?.length), hit = cache && cache.get(k);
    if (hit) return hit.slice();
    const p = placesOf(m.text); if (cache) { if (cache.size > 400) cache.clear(); cache.set(k, p); } return p.slice();
  });
  const here = String(hereNow ?? '').trim();
  if (here) { if (list.length) list[list.length - 1].unshift(here); else list.push([here]); }
  return list;
}

/** Gate side (K-R95, Z-05): the derived pack, reusing the cache when its fingerprint matches; grown nodes whose parent still exists are kept. */
export function resolveAuto(src, { uiLang = 'zh', cache = null } = {}) {
  const d = deriveAutoPack(src, { uiLang }), c = normCache(cache), base = c && c.fp === d.fp && c.pack ? c.pack : d.pack;
  const v = validate2(assemble(base, c ? c.grown : []), { trusted: false });
  return { pack: v.pack || d.pack, base, fp: d.fp, problems: [...d.problems, ...v.problems] };
}

export function createAutoPack(host) {
  const P = host.PACK_IN, active = !!P && P.source === 'auto' && isObj(P.manifest) && typeof P.fp === 'string';
  const memo = new Map();
  let st = null, rev = Number.isFinite(+P?.rev) && +P.rev > 0 ? +P.rev : 1, viewSig = active ? growthSig(P.manifest.nodes) : '', drift = 0, lastKey = '';
  const lang = () => P.manifest.lang || (host.uiLang === 'en' ? 'en' : 'zh');
  const derived = () => ({ ...P.manifest, nodes: P.manifest.nodes.filter(n => !String(n.id).startsWith('g_')) });
  const view = () => assemble(st.base, st.cache.grown);
  const treeOf = nodes => { const t = buildTree(nodes, { title: P.manifest.title }); return { t, v: vocabulary(t, { lang: lang() }) }; };
  function publish(save) {
    const m = view(); P.manifest = m; st.cache.pack = st.base;
    try { setGeo(geoFromV2(m, { lang: lang() })); } catch (e) {}   // events and characters locate on the grown tree from now on
    host.autoCache = st.cache; host.custVer++;
    const sig = growthSig(m.nodes);
    if (sig !== viewSig) { viewSig = sig; rev++; P.rev = rev; host.post({ type: 'eden-map:pack', manifest: m, rev, source: 'auto', trust: 'foreign' }); }
    if (save && host.custom) host.saveRoot();   // only once the root has been loaded: the save writes the whole root, so an early one would drop the user's own entries
  }
  function load(msgs, hereNow) {   // a chat was opened: take the cache (or derive a fresh one), recompute the growth when it is absent, count the drift when it is there
    const root = host.readVars() || {}, c = normCache(root.auto), base = c && c.fp === P.fp && c.pack ? c.pack : derived();
    st = { base, cache: { v: 1, fp: P.fp, pack: base, grown: [], seen: [] } };
    const re = () => recomputeGrowth(placesPerFloor(msgs, hereNow, memo), base.nodes, { lang: lang(), title: base.title });
    if (c && c.fp === P.fp && c.grown) {
      st.cache.grown = keepGrown(base, c.grown); st.cache.seen = c.seen;
      const live = new Set(st.cache.grown.map(n => n.id)), fresh = new Set(re().nodes.map(n => n.id));
      drift = [...live].filter(i => !fresh.has(i)).length + [...fresh].filter(i => !live.has(i)).length;   // a self-check count; never repaired silently
    } else { const r = re(); st.cache.grown = r.nodes; st.cache.seen = r.consumed.slice(-MAX_SEEN); }
    publish(true);
  }
  return {
    get active() { return active; }, get rev() { return rev; }, get drift() { return drift; }, get cache() { return st ? st.cache : null; },
    /** One round: returns true when the tree changed (the caller's signature moves, so events are placed again). */
    round(msgs, hereNow) {
      if (!active || (host.life && host.life.dead)) return false;
      const key = String(host.chatId() || '');
      if (!st || key !== lastKey) { lastKey = key; load(msgs, hereNow); return true; }
      const known = new Set(st.cache.seen), places = placesPerFloor(msgs, hereNow, memo).flat().filter(p => !known.has(normalise(p)));
      if (!places.length) return false;
      const { t, v } = treeOf(view().nodes);
      const r = grow(t, v, places, { lang: lang(), seen: st.cache.seen });
      if (!r.consumed.length) return false;
      st.cache.seen = [...st.cache.seen, ...r.consumed].slice(-MAX_SEEN);
      if (!r.nodes.length) { host.autoCache = st.cache; return false; }
      st.cache.grown = [...st.cache.grown, ...r.nodes]; publish(true); return true;
    },
  };
}
