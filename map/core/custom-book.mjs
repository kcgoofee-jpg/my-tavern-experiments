// The chat's custom world book (docs/place-record.md 5.3): one constant index (the name pairs only, at most 220 characters) plus one
// keyword entry for every place the player gave a description, a use line or facts. Entry bodies come from core/place-record.mjs entryText
// (the same function that writes the add-on's entries), headed by one sentence saying this chat's text wins. Pure; the host writes the book.
import { records, placeRecord, entryText } from './place-record.mjs';
import { overlay } from './custom-record.mjs';

export const INDEX_MAX = 220;
const clip = (s, n) => ([...s].length > n ? [...s].slice(0, n - 1).join('') + '…' : s);
const LEAD = { zh: '本聊天里以此为准。', en: 'In this chat, this text takes precedence.' };
const HEAD = { zh: '[地图自定义·玩家起的名字]', en: '[Map custom · names the player chose]' };
const NAME = { zh: '地点', en: 'Place' };
const keyed = (c, k) => !!(c.items[k] && (c.items[k].说明 || c.items[k].用途 || c.items[k].事实?.length));

/** The constant index: only the name pairs ("old->new"); '' when no place was renamed. */
export function indexText(c, o = {}) {
  const L = o.lang === 'en' ? 'en' : 'zh', pairs = Object.entries(c?.items || {}).filter(([, e]) => e.名).map(([k, e]) => `${k}→${e.名}`);
  return pairs.length ? `${HEAD[L]} ${clip(pairs.join(o.lang === 'en' ? '; ' : '；'), INDEX_MAX - [...HEAD[L]].length - 3)}${o.lang === 'en' ? '.' : '。'}` : '';
}
/** The record of a custom item: from the pack when it knows the place (by id, then by name), else built from the item alone. */
export function recordOf(c, key, pack = null) {
  const hit = pack ? records(pack).find(r => r.id === key) || records(pack).find(r => r.name === key) : null;
  if (hit) return placeRecord(pack, hit.id, c);
  return overlay({ id: key, name: key, kind: 'place', type: '', parent: null, sub: '', desc: '', facts: [], access: '', rows: [], media: [], alias: [], floors: [], where: '', wb: [] }, c.items[key]);
}
/** Is there anything to write? (a rename, or a place with a description, use line or facts) */
export const hasContent = c => !!indexText(c) || Object.keys(c?.items || {}).some(k => keyed(c, k));
/** Entries of the custom book in the TH world-book entry shape. o = { on (false = written but disabled), pack, lang, entryName (the index entry's name) }.
 *  The index entry is always first (the book is recognised by its name; with no rename it is disabled and empty). */
export function bookEntries(c, o = {}) {
  const on = o.on !== false, L = o.lang === 'en' ? 'en' : 'zh', out = [], idx = indexText(c, o);
  const rec = { prevent_incoming: true, prevent_outgoing: true };
  out.push({ name: o.entryName || 'Map custom', enabled: on && !!idx, strategy: { type: 'constant', keys: [] }, position: { type: 'after_character_definition', order: 903 }, content: idx || '（空）', recursion: rec });
  let i = 0;
  for (const k of Object.keys(c?.items || {})) {
    if (!keyed(c, k)) continue;
    const r = recordOf(c, k, o.pack), e = c.items[k], keys = [...new Set([k, r.name, r.baseName, ...(e.别名 || [])].filter(x => x && [...x].length >= 1))];
    out.push({ name: `${NAME[L]}-${r.name}`, enabled: on, strategy: { type: 'selective', keys }, position: { type: 'after_character_definition', order: 904 + i++ },
      content: entryText(r, { lang: o.lang, lead: LEAD[L] }), recursion: rec, extra: { eden_place: k } });
  }
  return out;
}
