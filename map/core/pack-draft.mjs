// The edit draft (docs/kernel-schema.md K-R100; docs/zero-config.md §7): what an author changed in the viewer, kept apart from the pack (Z-14), applied over the loaded pack with
// the same merge as the K-R67 overlay, and written out either folded into a foreign pack (core/pack-export.mjs, K-R98) or as an overlay of a shipped pack (K-R98, Z-15). Pure.
//   draft = { v: 1, nodes: { <id>: { at?, parent?, alias_add?: [word] } }, add: [node], views: { <id>: view }, media: { <id>: item }, attach: { <node id>: [media id] }, start? }
// A picture's bytes live in `media.<id>.src` while the draft is in memory; app/pack-edit.mjs keeps them out of the stored text (K-R102: a private picture is never part of a draft).
import { applyOverlay, applyOverlayMedia } from './overlay-v2.mjs';
import { implicitViews } from './pack-v2-view.mjs';

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const clone = v => JSON.parse(JSON.stringify(v));
const union = (a, b) => [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])];

export const emptyDraft = () => ({ v: 1, nodes: {}, add: [], views: {}, media: {}, attach: {} });
/** A draft read from storage or made by hand -> a well-formed draft (anything else is dropped). */
export function normDraft(d) {
  const out = emptyDraft();
  if (!isObj(d)) return out;
  for (const [id, c] of Object.entries(isObj(d.nodes) ? d.nodes : {})) if (isObj(c)) out.nodes[id] = { ...(isObj(c.at) ? { at: c.at } : {}), ...(typeof c.parent === 'string' ? { parent: c.parent } : {}), ...(Array.isArray(c.alias_add) ? { alias_add: c.alias_add.filter(w => typeof w === 'string') } : {}) };
  out.add = (Array.isArray(d.add) ? d.add : []).filter(n => isObj(n) && typeof n.id === 'string' && typeof n.name === 'string');
  if (isObj(d.views)) out.views = d.views;
  if (isObj(d.media)) out.media = d.media;
  for (const [id, l] of Object.entries(isObj(d.attach) ? d.attach : {})) if (Array.isArray(l)) out.attach[id] = l.filter(m => typeof m === 'string');
  if (typeof d.start === 'string') out.start = d.start;
  return out;
}
export const isEmptyDraft = d => { const x = normDraft(d); return !Object.keys(x.nodes).length && !x.add.length && !Object.keys(x.views).length && !Object.keys(x.media).length && !Object.keys(x.attach).length && x.start === undefined; };

/** The draft as a K-R67 overlay over `pack` (node changes, added places, pictures, `ui.start`); `views: false` leaves the views out (an overlay of a shipped pack has no views block). */
export function draftOverlay(draft, pack, { views = true } = {}) {
  const d = normDraft(draft), base = new Map((Array.isArray(pack?.nodes) ? pack.nodes : []).map(n => [n.id, n])), by = new Map();
  const at = id => { if (!by.has(id)) by.set(id, { id }); return by.get(id); };
  for (const [id, c] of Object.entries(d.nodes)) { const o = at(id); if (c.at) o.at = c.at; if (c.parent !== undefined) o.parent = c.parent; if (c.alias_add?.length) o.alias = c.alias_add; }
  for (const [id, l] of Object.entries(d.attach)) if (l.length) at(id).media = union(base.get(id)?.media, l);
  const added = d.add.map(n => { const o = by.get(n.id) || {}; return { ...clone(n), ...o, ...(o.alias ? { alias: union(n.alias ?? [n.name], o.alias) } : {}) }; }), addIds = new Set(d.add.map(n => n.id));
  const nodes = [...[...by.values()].filter(o => !addIds.has(o.id)), ...added];
  const ov = { schema: 2, nodes };
  if (Object.keys(d.media).length) ov.media = clone(d.media);
  if (d.start !== undefined) ov.ui = { start: d.start };
  if (views && Object.keys(d.views).length) ov.views = clone(d.views);
  return ov;
}

/** applyDraft(pack, draft) -> { pack, problems }: the pack with the draft merged by the overlay rules (aliases united, other node fields overridden, pictures by id, views by id, `ui.start`).
 *  A pack with no explicit views keeps its implicit ones as explicit rows once the draft adds a view (a views block replaces the implicit set as a whole). The input is not touched. */
export function applyDraft(pack, draft) {
  const p = clone(pack), ov = draftOverlay(draft, pack), problems = [];
  const r = applyOverlay(Array.isArray(p.nodes) ? p.nodes : [], ov); problems.push(...r.problems);
  if (r.nodes.length) p.nodes = r.nodes;
  const m = applyOverlayMedia(p.media, ov); problems.push(...m.problems);
  if (m.media && Object.keys(m.media).length) p.media = m.media;
  if (ov.views) p.views = { ...(isObj(p.views) && Object.keys(p.views).length ? p.views : implicitViews(p)), ...ov.views };
  if (ov.ui) p.ui = { ...(isObj(p.ui) ? p.ui : {}), ...ov.ui };
  return { pack: p, problems };
}

/** The overlay file of a shipped pack's draft (Z-15, K-R98): the K-R67 shape, changes only, no views, with `schema`. */
export function overlayText(draft, pack) {
  const ov = draftOverlay(draft, pack, { views: false });
  if (!ov.nodes.length) delete ov.nodes;
  return JSON.stringify(ov, null, 1);
}
