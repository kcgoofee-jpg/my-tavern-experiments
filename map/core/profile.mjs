// The run-time profile of a pack's variables and roster (docs/kernel-schema.md K-R37..K-R44, K-R69; Appendix A.7). Pure.
//   profileOf(pack)              a schema-2 pack (only `vars` and `entities` are read) -> the profile the tavern modules read
//   profileFromV1({ manifest, overlay })   the same for a schema-1 pack: its manifest `vars` plus the overlay's blocks (K-R69)
//   KERNEL                       the profile of a pack that names nothing: every path and field is discovered (K-R38, K-R42), default period bands (K-R39)
//   slotDef(profile, slot)       the field definition of a roster slot (`x-slot`), or the kernel's default for its kind
//   portraitOk(avatar, url)      K-R43: may this card-script portrait be loaded?
// profile = { layerPaths (K-R86: the host-fed paths of the pack's layers, at most 8), paths: { location, time, date, period, outfit, reputation, inventory }, header (K-R105: the scene header form { tag, sep, fields } or null), periods, groups, presentId, stageGroup, tables, place, slots, fields, avatar, gallery (K-R106: the raw media-source declaration or null; core/gallery-spec.mjs gallerySpec checks it), pickup }
//   pickup   { verbs, verbs_strict, verbs_off, not_items }: the pack's pickup words merged over languages (K-R77), read by core/pickup.mjs scan({ vocab })
//   groups   the pack's entity groups, the present one first and the others in the pack's order: [{ id, label?, mvu }]; a pack that declares none has the three discovered ones (present, members, targets)
//   presentId  the id of the present group ('present' unless the pack flags another)    stageGroup  the id of the second group after the present one ('' = none): the one whose rows carry the stage order
//   tables   the mvu table of each group by group id ('' = discovered)       place  the place field of the present group's rows
import { DEFAULT_PERIODS } from './periods.mjs';
import { headerSpec } from './scene-header.mjs';
import { applyOverlayVars, applyOverlayEntities, applyOverlayItems } from './overlay-v2.mjs';

export const PATH_KEYS = ['location', 'time', 'date', 'period', 'outfit', 'reputation', 'inventory'];
export const SLOTS = ['stage', 'grade', 'core', 'code', 'social', 'height', 'weight', 'known', 'accessory', 'tier'];
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const str = v => typeof v === 'string';
const clone = v => JSON.parse(JSON.stringify(v));
const PICKUP_LISTS = ['verbs', 'verbs_strict', 'verbs_off', 'not_items'];
/** K-R77: the pack's pickup words, the union over languages of each list (an id once); kernel words are not repeated here. */
const pickupOf = items => Object.fromEntries(PICKUP_LISTS.map(k => [k, [...new Set(Object.values(isObj(items?.pickup) ? items.pickup : {}).flatMap(o => (isObj(o) && Array.isArray(o[k]) ? o[k].filter(w => str(w) && w) : [])))]]));
const VPATH = /^[^.\n][^\n]{0,79}$/;   // the vars path pattern (pack-v2-spec `vpath`)
/** K-R86: the host-fed paths the pack's layers read: each `mvu:<path>` source and each `applies.mvu.path`, distinct, matching the vars path pattern, at most 8. */
export function layerPathsOf(rows) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!isObj(r)) continue;
    for (const p of [str(r.source) && r.source.startsWith('mvu:') ? r.source.slice(4) : '', isObj(r.applies?.mvu) ? r.applies.mvu.path : '']) if (str(p) && VPATH.test(p) && !out.includes(p)) out.push(p);
  }
  return out.slice(0, 8);
}
const DEFAULT_GROUPS = [{ id: 'present' }, { id: 'members' }, { id: 'targets' }];   // what a pack that declares no entity group gets: three tables found by the kernel's words

/** What a slot reads when the pack declares no field for it (a field found by the kernel's words, or picked in Settings). */
export const DEFAULT_SLOTS = Object.freeze({
  stage: { kind: 'tag' }, grade: { kind: 'tag' }, code: { kind: 'text' }, social: { kind: 'text' }, height: { kind: 'text' }, weight: { kind: 'text' }, accessory: { kind: 'text' }, known: { kind: 'tag' },
  core: { kind: 'gauge', min: 0, max: 100, ladder: [20, 40, 60, 80, 100].map((up_to, i) => ({ up_to, label: `档 ${i + 1}` })) },
  tier: { kind: 'ladder', scan: true, ladder: [] },
});
export const slotDef = (profile, slot) => (profile && profile.slots && profile.slots[slot]) || DEFAULT_SLOTS[slot];

export function profileOf(pack) {
  const v = isObj(pack?.vars) ? pack.vars : {}, e = isObj(pack?.entities) ? pack.entities : {};
  const paths = Object.fromEntries(PATH_KEYS.map(k => [k, str(v[k]) ? v[k] : '']));
  const groups = (Array.isArray(e.groups) ? e.groups : []).filter(g => isObj(g) && str(g.id));
  const fields = (Array.isArray(e.fields) ? e.fields : []).filter(f => isObj(f) && str(f.field) && f.field);
  const slots = {};
  for (const f of fields) if (SLOTS.includes(f['x-slot']) && !slots[f['x-slot']]) slots[f['x-slot']] = f;
  const src = g => (isObj(g.source) ? g.source : {});
  const present = groups.find(g => src(g).present === true), presentId = present ? present.id : 'present';
  const named = groups.length ? groups.filter((g, i) => groups.findIndex(x => x.id === g.id) === i) : DEFAULT_GROUPS;   // pack order, an id once
  const first = named.find(g => g.id === presentId) || { id: presentId }, list = [first, ...named.filter(g => g !== first)].map(g => ({ id: g.id, ...(str(g.label) && g.label ? { label: g.label } : {}), ...(isObj(g.i18n) ? { i18n: g.i18n } : {}), mvu: str(src(g).mvu) ? src(g).mvu : '' }));
  const tables = Object.fromEntries(list.map(g => [g.id, g.mvu])), after = list.filter(g => g.id !== presentId);
  return clone({ paths, header: headerSpec(v.header), periods: Array.isArray(v.periods) && v.periods.length ? v.periods : DEFAULT_PERIODS, groups: list, presentId, stageGroup: after[1]?.id || '', tables, place: (present && str(src(present).place) && src(present).place) || '',
    slots, fields, avatar: isObj(e.avatar) ? e.avatar : {}, gallery: isObj(e.gallery) ? e.gallery : null, pickup: pickupOf(pack?.items), layerPaths: layerPathsOf(pack?.layers) });
}
export const KERNEL = Object.freeze(profileOf({}));

export function profileFromV1({ manifest, overlay } = {}) {
  const mv = isObj(manifest?.vars) ? manifest.vars : {}, base = {};
  for (const k of PATH_KEYS) if (str(mv[k]) && mv[k]) base[k] = mv[k];
  return profileOf({ vars: applyOverlayVars(Object.keys(base).length ? base : undefined, overlay).vars, entities: applyOverlayEntities(undefined, overlay).entities, items: applyOverlayItems(undefined, overlay).items, layers: overlay?.layers });
}

/** K-R43 for a card-script portrait: https, an image file, no query string or fragment; the host equals a `hosts` entry `host[/path-prefix]` (a prefix matches from the root, ignoring case,
 *  and then one of `require`'s fragments must be in the path); no `deny` fragment anywhere in the path. A pack without `hosts` loads none. */
/** Map-form `require` ({ "<host prefix>": [fragments] }): every prefix that the URL (host + path) falls under needs one of its fragments in the path; other hosts are not constrained. List form: no effect here. */
const scopedOk = (req, hostPath, path) => !isObj(req) || Object.entries(req).every(([k, frags]) => {
  const key = String(k).toLowerCase().replace(/^https?:\/\//, ''), need = Array.isArray(frags) ? frags.filter(str) : [];
  return !hostPath.startsWith(key) || !need.length || need.some(f => path.includes(f));
});
export function portraitOk(avatar, url) {
  const a = isObj(avatar) ? avatar : {}, s = String(url ?? '');
  if (!/^https:\/\//i.test(s)) return false;
  let u; try { u = new URL(s); } catch (e) { return false; }
  if (u.search || u.hash) return false;
  let path = u.pathname; try { path = decodeURIComponent(path); } catch (e) { /* judged as written */ }
  if (!/\.(png|jpe?g|webp)$/i.test(path)) return false;
  if ((Array.isArray(a.deny) ? a.deny : []).some(d => str(d) && d && path.includes(d))) return false;
  const host = u.hostname.toLowerCase(), low = path.toLowerCase();
  return (Array.isArray(a.hosts) ? a.hosts : []).some(h => {
    if (!str(h)) return false;
    const i = h.indexOf('/'), name = (i < 0 ? h : h.slice(0, i)).toLowerCase(), prefix = i < 0 ? '' : h.slice(i).toLowerCase();
    if (host !== name || !low.startsWith(prefix || '/')) return false;
    const need = prefix && Array.isArray(a.require) ? a.require.filter(str) : [];
    return !need.length || need.some(f => path.includes(f));
  }) && scopedOk(a.require, host + low, path);
}
