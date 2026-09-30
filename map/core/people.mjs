// The people page's sections, from the pack's entity groups (S4-4; docs/kernel-schema.md entities). Pure: no DOM, no globals.
//   groupList({ groups, rosters, declared })   the sections in order, the present group first: [{ id, label?, i18n?, present, items }]
//        groups    the host's eden-map:chars `groups` ([{ id, label, rows, present? }]); preferred when there are any
//        rosters   the older payload { <group id>: { items } | null }                  declared  the pack overlay's entities.groups (ids, labels, i18n, source.present)
//   groupLabel(g, lang, resolve)               the section title: the dictionary / pack string ch.g_<id> when it resolves, else the group's own label in `lang`, else its label, else its id
//   paneModel(list, mapItems, label)           what the page draws: the present section (its roster rows that are not on the map) and the other non-empty sections
//                                              (their rows minus the people already listed above, and how many were left out)
//   everyone(list, mapItems)                   the distinct names over the map's people and every section
// A pack with four groups gets four sections; the first pack's three are the same sections, in the same order, as the fixed three the page drew before.
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const rowsOf = t => (isObj(t) && Array.isArray(t.items) ? t.items : []);

export function groupList({ groups, rosters, declared } = {}) {
  const dec = (Array.isArray(declared) ? declared : []).filter(g => isObj(g) && typeof g.id === 'string');
  const decl = id => dec.find(g => g.id === id);
  const pid = groups?.find?.(g => g?.present)?.id || dec.find(g => g.source?.present === true)?.id || 'present';
  let list;
  if (Array.isArray(groups) && groups.some(g => isObj(g) && typeof g.id === 'string')) {
    list = groups.filter(g => isObj(g) && typeof g.id === 'string').map(g => ({ id: g.id, label: g.label, i18n: decl(g.id)?.i18n, present: g.id === pid, items: Array.isArray(g.rows) ? g.rows : [] }));
  } else {   // an older host sends the rosters only: the pack's declared groups, else the rosters' own keys
    const ids = dec.length ? dec.map(g => g.id) : Object.keys(isObj(rosters) ? rosters : {});
    list = ids.map(id => ({ id, label: decl(id)?.label, i18n: decl(id)?.i18n, present: id === pid, items: rowsOf(rosters?.[id]) }));
  }
  const first = list.find(g => g.present) || { id: pid, present: true, items: rowsOf(rosters?.[pid]) };
  return [first, ...list.filter(g => g !== first)];
}

export function groupLabel(g, lang, resolve) {
  const k = 'ch.g_' + g.id, v = typeof resolve === 'function' ? resolve(k) : '';
  if (v && v !== k) return v;
  return g.i18n?.[lang]?.label || g.label || g.id;
}

export function paneModel(list, mapItems, label) {
  const names = new Set((mapItems || []).map(c => c.name)), pres = list.find(g => g.present) || { id: 'present', items: [] };
  const extra = pres.items.filter(i => !names.has(i.name)), here = new Set([...names, ...extra.map(i => i.name)]);
  return {
    present: { id: pres.id, label: label(pres), extra },
    others: list.filter(g => g !== pres && g.items.length).map(g => { const rest = g.items.filter(i => !here.has(i.name)); return { id: g.id, label: label(g), all: g.items.length, rest, also: g.items.length - rest.length }; }),
  };
}

export const everyone = (list, mapItems) => new Set([...(mapItems || []).map(c => c.name), ...list.flatMap(g => g.items.map(i => i.name))]);
