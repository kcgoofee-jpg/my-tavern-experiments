// Export as pack (docs/kernel-schema.md K-R98; docs/zero-config.md §6): the current pack with its grown nodes, the user's aliases and the card credits folded in, written as one JSON text that
// imports back identically (K-R99). Pure: the caller hands in everything and does the download / copy.
//   exportPack(pack, { grown, userAliases, card, draft }) -> { text, compact, bytes, fitsCard, problems }
//     text = the file (canonical key order, one-space indent); compact = the same without white space (what a worldbook entry carries); bytes = size of `text`;
//     fitsCard = `compact` is at most 1 MB (it can live in a card); problems != [] means nothing was written (text is '').
import { validate2 } from './pack-v2.mjs';
import { implicitViews } from './pack-v2-view.mjs';
import { normalise, cpLen, cut } from './lexicon.mjs';
import { applyDraft } from './pack-draft.mjs';

export const MAX_EXPORT = 8 << 20, CARD_BYTES = 1 << 20;
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const clone = v => JSON.parse(JSON.stringify(v));
const TOP = ['$schema', 'id', 'schema', 'title', 'lang', 'version', 'i18n', 'match', 'credits', 'features', 'lexicon', 'nodes', 'views', 'vars', 'entities', 'items', 'events', 'layers', 'ui', 'llm', 'media', 'transit'];
const NODE = ['id', 'name', 'type', 'parent', 'alias', 'hints', 'cite', 'sub', 'desc', 'facts', 'access', 'at', 'anchor', 'enter', 'i18n', 'view', 'links', 'media'];
const STATE = ['stash', 'fog', 'explored', 'ignore', 'ignored', 'ledger', 'chat'];   // chat state never belongs to a pack (a pack's own item rows live under `items`)

const canon = (v, order = []) => {
  if (Array.isArray(v)) return v.map(e => canon(e));
  if (!isObj(v)) return v;
  const rank = k => (order.includes(k) ? order.indexOf(k) : order.length), keys = Object.keys(v).sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(keys.map(k => [k, canon(v[k])]));
};
const sameJson = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const fail = problems => ({ text: '', compact: '', bytes: 0, fitsCard: false, problems });

export function exportPack(pack, { grown = [], userAliases = [], card = null, draft = null } = {}) {   // anything else in the options (a private picture, K-R102) is never read
  if (!isObj(pack)) return fail([{ code: 'type', path: 'manifest' }]);
  const p = draft ? applyDraft(pack, draft).pack : clone(pack);   // K-R100: the edit draft is folded in
  for (const k of STATE) delete p[k];
  delete p.cdn; delete p.legacy;   // fields the kernel reads only for shipped packs
  for (const v of Object.values(isObj(p.views) ? p.views : {})) if (isObj(v)) delete v['x-page'];
  const nodes = Array.isArray(p.nodes) ? p.nodes : [], ids = new Set(nodes.map(n => n && n.id));
  for (const g of Array.isArray(grown) ? grown : []) if (isObj(g) && typeof g.id === 'string' && !ids.has(g.id)) { ids.add(g.id); nodes.push(clone(g)); }
  for (const u of Array.isArray(userAliases) ? userAliases : []) {   // Z-16: the user's own names for a place become aliases of its node; a name for a node that does not exist is dropped
    const n = isObj(u) ? nodes.find(x => x && x.id === u.node) : null, w = typeof u?.word === 'string' ? u.word.trim() : '';
    if (!n || !w || cpLen(w) > 60 || /\n/.test(w)) continue;
    const have = Array.isArray(n.alias) ? n.alias : [n.name, ...Object.values(isObj(n.i18n) ? n.i18n : {}).map(t => t && t.name)].filter(a => typeof a === 'string' && a);
    if (!have.some(a => normalise(a) === normalise(w)) && have.length < 64) n.alias = [...have, w];
  }
  if (nodes.length) p.nodes = nodes;
  if (isObj(card)) {
    const c = {}; for (const k of ['name', 'creator', 'version']) if (typeof card[k] === 'string' && card[k].trim()) c[k] = cut(card[k].trim(), 200);
    if (typeof card.url === 'string' && /^https:\/\//.test(card.url)) c.url = card.url;
    if (Object.keys(c).length) p.credits = { ...(isObj(p.credits) ? p.credits : {}), card: c };
  }
  if (isObj(p.views) && sameJson(p.views, implicitViews({ ...p, views: undefined }))) delete p.views;   // implicit views are never exported (K-R96)
  const v = validate2(p, { trusted: false, source: 'export' });
  if (!v.pack || v.problems.length) return fail(v.problems.length ? v.problems : [{ code: 'invalid', path: 'manifest' }]);
  const out = canon(v.pack, TOP);
  if (Array.isArray(out.nodes)) out.nodes = out.nodes.map(n => canon(n, NODE));
  const text = JSON.stringify(out, null, 1), compact = JSON.stringify(out), bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_EXPORT) return fail([{ code: 'limit-size', path: 'manifest', detail: bytes }]);
  return { text, compact, bytes, fitsCard: new TextEncoder().encode(compact).length <= CARD_BYTES, problems: [] };
}
