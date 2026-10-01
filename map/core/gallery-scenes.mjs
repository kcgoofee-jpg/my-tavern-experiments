// The scenes of a chat that carry a media-source tag (docs/kernel-schema.md K-R106). Pure; every result is recomputed from the floors' text each
// time, nothing is stored. A scene = one tag the table can answer: { floor, i, place, node, name, who, cat, n, url } (i = its order inside the floor).
//   collectScenes({ spec, table, floors, placeOf, nodeOf, rosterRows })   floors = [{ floor, text, raw? }] in any order -> scenes sorted by floor, then position
//   scenesAt(scenes, { node, place }, nodeOf)       the place card's "scenes here": the scenes whose place is that node (text equal when no node is known)
//   timelineOf(scenes, person)                      one person's scenes in floor order
//   categoryRows(table, spec, name)                 the person card's sections: [{ cat, items: [{ n, url }] }] in the declared category order
//   mediaSig(scenes)                                a signature of what would be drawn (the host sends again only when it changes)
import { parseTags, resolveUrl, matchRoster, sameWho, shortName } from './gallery-spec.mjs';

export const MAX_SCENES = 600;
export function collectScenes({ spec, table, floors, placeOf, nodeOf, rosterRows } = {}) {
  const out = []; if (!spec || !table?.chars?.length || !Array.isArray(floors)) return out;
  const names = new Map(table.chars.map(c => [c.name, matchRoster(c.name, rosterRows)]));
  for (const f of [...floors].sort((a, b) => a.floor - b.floor)) {
    const tags = parseTags(f?.text, spec); if (!tags.length) continue;
    let place = null, node = '';
    tags.forEach((t, i) => {
      const url = resolveUrl(table, t); if (url === null) return;   // no such character or no pictures in that category: not a scene (the card's script shows nothing either)
      if (place === null) { try { place = String(placeOf?.(f.floor, f.raw ?? f.text) ?? '').trim(); } catch (e) { place = ''; } try { node = (place && nodeOf?.(place)) || ''; } catch (e) { node = ''; } }
      out.push({ floor: f.floor, i, place, node, name: t.name, who: names.get(t.name) || '', cat: t.category, n: t.number, url });
    });
  }
  return out.slice(-MAX_SCENES);
}
/** The scenes at one place. Rows without a node of their own are placed with `nodeOf(place)` (the viewer's resolver). */
export function scenesAt(scenes, { node = '', place = '' } = {}, nodeOf) {
  return (Array.isArray(scenes) ? scenes : []).filter(s => {
    const sn = s.node || (s.place && nodeOf ? nodeOf(s.place) || '' : '');
    return node ? sn === node : !!place && s.place === place;
  });
}
export const timelineOf = (scenes, person) => (Array.isArray(scenes) ? scenes : []).filter(s => sameWho(s, person)).sort((a, b) => a.floor - b.floor || a.i - b.i);
/** The table character a person stands for (the name, or the short name before the middle dot), or null. */
export function charOf(table, person) {
  const list = table?.chars || [], n = String(person ?? '').trim(); if (!n) return null;
  const hit = list.find(c => c.name === n) || null; if (hit) return hit;
  const same = list.filter(c => shortName(c.name) === shortName(n)); return same.length === 1 ? same[0] : null;
}
export function categoryRows(table, spec, person) {
  const c = charOf(table, person); if (!c) return [];
  const rows = [];
  for (const cat of spec?.tag?.categories || []) {
    const items = (c.sets[cat] || []).map((url, i) => ({ n: i + 1, url })).filter(x => x.url);
    if (items.length) rows.push({ cat, items });
  }
  return rows;
}
export const mediaSig = scenes => (scenes || []).map(s => `${s.floor}.${s.i}:${s.place}|${s.who || s.name}|${s.cat}${s.n}|${s.url ? 1 : 0}`).join(';');
