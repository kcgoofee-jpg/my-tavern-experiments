// v1 -> v2 in memory (docs/kernel-schema.md Appendix A, B.2, K-R61): a schema 1 pack (manifest + its data files, already
// loaded) becomes a schema 2 pack with inline blocks. Pure and deterministic; no file is written, nothing is fetched.
// The four files: compat-v1-geo (nodes), -views (views), -blocks (events, roster, stash, worldbook, legacy, custom names).
import { buildGeo } from './compat-v1-geo.mjs';
import { buildViews } from './compat-v1-views.mjs';
import { legacyOf, stringsOf, eventsOf, rosterOf, stashOf, worldbookOf, customOf } from './compat-v1-blocks.mjs';
import { normalise } from './lexicon.mjs';
import { applyOverlay, applyOverlayEvents, applyOverlayLlm, applyOverlayVars, applyOverlayEntities, applyOverlayUi, applyOverlayLayers, applyOverlayMedia } from './overlay-v2.mjs';

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
/** A.7: v1 roster source names -> v2 (the image extension's library is `imagegen`); every other source keeps its name. */
export const SOURCE_V1 = Object.freeze({ baibai: 'imagegen' });
/** Roster rows of the v1 engine -> the same rows with v2 source names. */
export const rowsFromV1 = rows => (Array.isArray(rows) ? rows : []).map(r => (isObj(r) && Object.hasOwn(SOURCE_V1, r.source) ? { ...r, source: SOURCE_V1[r.source] } : r));

const VAR_KEYS = ['location', 'time', 'date', 'period', 'outfit', 'reputation'];

/**
 * fromV1({ manifest, maps, world, names, plan, custom, events, roster, stash, worldbook, legacy, overlay, lang })
 *   manifest   the v1 manifest (schema 1)          maps      maps.json          world  world places or null
 *   names      the English name dictionary or null plan      the room plan or null
 *   custom     the user's custom names (v1 shape) events    the pack's events.json (v1) or null
 *   roster     { members } or null   stash { items } or null   worldbook { entries } or null
 *   legacy     names that are card terms (e.g. { worldbook_book }); lang the pack's own language (default zh)
 *   overlay    the pack's overlay.v2.json or null (K-R67, core/overlay-v2.mjs): schema-2 node data merged by id after the conversion
 * -> { pack, custom, ignore, idmap, problems }: pack is a schema 2 manifest with inline blocks; custom / ignore are the user's names
 *    as v2 aliases; idmap maps a v1 id to its node id where they differ (merged places, the merged estate marker).
 */
export function fromV1({ manifest, maps, world = null, names = null, plan = null, custom = null, events = null, roster = null, stash = null, worldbook = null, legacy = null, overlay = null, lang = 'zh' } = {}) {
  const m = isObj(manifest) ? manifest : {}, geo = buildGeo({ reg: maps, world, names, plan }), { nodes, ctx } = geo;
  const ids = new Set(nodes.map(n => n.id)), has = id => ids.has(id), idmap = ctx.idmap;
  const views = buildViews(geo, has);
  const ev = eventsOf(events, (mapId, word) => {   // is `word` already an alias of the map's node or of a node below it?
    const w = normalise(word), inTree = id => { const n = nodes.find(x => x.id === id); return (n?.alias || [n?.name]).some(a => normalise(a) === w) || nodes.some(c => c.parent === id && inTree(c.id)); };
    return inTree(idmap[mapId] || mapId);
  });
  if (ev) for (const h of ev.hints) { const n = nodes.find(x => x.id === (idmap[h.map] || h.map)); if (n) n.hints = [...(n.hints || []), h.word]; }
  const uc = customOf(custom, geo, has), pack = { id: m.id, schema: 2, title: m.title };
  if (m.title_en && m.title_en !== m.title) pack.i18n = { en: { title: m.title_en } };
  pack.lang = lang; pack.legacy = legacyOf(m, legacy);
  if (isObj(m.features)) pack.features = { ...m.features };
  if (isObj(m.cdn)) pack.cdn = { ...m.cdn };
  for (const [k, x] of [['derived', 'x-derived'], ['security', 'x-security'], ['patrol', 'x-patrol'], ['routine', 'x-routine']]) if (typeof m.data?.[k] === 'string') pack[x] = m.data[k];
  const ov = applyOverlay(nodes, overlay);
  if (ov.nodes.length) pack.nodes = ov.nodes;
  if (Object.keys(views).length) pack.views = views;
  const vars = {}, extra = {};
  for (const [k, v] of Object.entries(isObj(m.vars) ? m.vars : {})) if (typeof v === 'string' && v) (VAR_KEYS.includes(k) ? vars : extra)[k] = v;
  if (Object.keys(extra).length) vars['x-v1'] = extra;
  const ovv = applyOverlayVars(Object.keys(vars).length ? vars : undefined, overlay); ov.problems.push(...ovv.problems);
  if (ovv.vars && Object.keys(ovv.vars).length) pack.vars = ovv.vars;
  const oen = applyOverlayEntities(rosterOf(roster) || undefined, overlay); ov.problems.push(...oen.problems);
  if (oen.entities && Object.keys(oen.entities).length) pack.entities = oen.entities;
  const rows = stashOf(stash, has, idmap); if (rows.length) pack.items = { stash: rows };
  const evb = ev ? { ...ev.events } : {}; if (isObj(maps?.feeds)) evb['x-feeds'] = maps.feeds;
  const oe = applyOverlayEvents(Object.keys(evb).length ? evb : undefined, overlay); ov.problems.push(...oe.problems);
  if (oe.events && Object.keys(oe.events).length) pack.events = oe.events;
  const ui = {}, start = maps?.start && (idmap[maps.start] || maps.start);
  if (start && has(start)) ui.start = start;
  if (Object.keys(ctx.levels).length) ui.levels = ctx.levels;
  if (typeof m.theme?.accent === 'string') ui.theme = { accent: m.theme.accent };
  const strings = stringsOf(m.strings, lang); if (Object.keys(strings).length) ui.strings = strings;
  const oui = applyOverlayUi(ui, overlay?.ui, ov.problems);   // K-R70: per-view theme, legend, x-…
  if (oui && Object.keys(oui).length) pack.ui = oui;
  const oly = applyOverlayLayers(undefined, overlay); ov.problems.push(...oly.problems);   // K-R85: declared layers of the overlay
  if (oly.layers.length) pack.layers = oly.layers;
  const omd = applyOverlayMedia(undefined, overlay); ov.problems.push(...omd.problems);   // K-R101: pack pictures of the overlay (empty = no block)
  if (omd.media && Object.keys(omd.media).length) pack.media = omd.media;
  const llm = {}, wb = worldbookOf(worldbook);
  if (ev?.tag) llm.templates = { [lang]: { tag: ev.tag } };
  if (wb.length) llm.worldbook = { entries: wb };
  const ol = applyOverlayLlm(Object.keys(llm).length ? llm : undefined, overlay);
  if (ol && Object.keys(ol).length) pack.llm = ol;
  return JSON.parse(JSON.stringify({ pack, custom: uc.custom, ignore: uc.ignore, idmap, problems: ov.problems }));   // a copy: the pack shares nothing with the v1 inputs
}
