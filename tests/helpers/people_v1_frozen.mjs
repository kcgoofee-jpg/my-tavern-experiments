// The people page's section logic as map/chars.mjs `pane` had it before S4-4 (frozen; head #188): three fixed sections — present, members, targets — with the labels through the dictionary.
// `T(key, fallback, vars)` is the viewer's shared i18n service. Returns the sections as data: [{ id, label, n, rows: [name...] }] (the html around them is not part of the comparison).
export function paneV1(items, rosters, T) {
  const presNames = new Set(items.map(c => c.name)), extra = (rosters?.present?.items || []).filter(i => !presNames.has(i.name));
  const here = new Set([...presNames, ...extra.map(i => i.name)]), memAll = rosters?.members?.items || [], tgtAll = rosters?.targets?.items || [];
  const mem = memAll.filter(i => !here.has(i.name)), tgt = tgtAll.filter(i => !here.has(i.name));
  const also = n => (n ? ' · ' + T('ch.also_here', '另 {n} 人在场', { n }) : '');
  return [
    { id: 'present', label: T('ch.g_present', '在场'), n: String(items.length + extra.length), rows: [...items.map(c => c.name), ...extra.map(i => i.name)] },
    ...(memAll.length ? [{ id: 'members', label: T('ch.g_members', '庄园成员'), n: mem.length + also(memAll.length - mem.length), rows: mem.map(i => i.name) }] : []),
    ...(tgtAll.length ? [{ id: 'targets', label: T('ch.g_targets', '目标'), n: tgt.length + also(tgtAll.length - tgt.length), rows: tgt.map(i => i.name) }] : []),
  ];
}
/** the people count of the page before S4-4 (chars.mjs `count`) */
export const countV1 = (items, rosters) => new Set([...items.map(c => c.name), ...['present', 'members', 'targets'].flatMap(g => (rosters?.[g]?.items || []).map(i => i.name))]).size;
