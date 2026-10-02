// What the host reads from the current character card (docs/zero-config.md §2.2, §2.4; K-R90, K-R91). Read only; nothing here writes the card or any worldbook.
// The host globals (`SillyTavern`, TavernHelper functions) are handed in as an access object by mvu-bridge.mjs `hostAccess()` (the only module that touches them), so this file
// is plain functions:  access = { th, ctx, parentTh, parentCtx, bookNames, getBook }.
import { fnv36 } from '../core/lexicon.mjs';

export const EMBED_TITLE = 'spatial_os:pack';   // K-R91: the title of the card's own worldbook entry that holds an embedded pack
const INITVAR = /[[［][^\]］]*initvar[^\]］]*[\]］]/i;   // the variable-initialisation entry (K-R94): its content is the only entry content read besides the embedded pack's
const OURS = e => !!(e && e.extra && typeof e.extra === 'object' && (e.extra.eden_id || e.extra.spatial_id));   // entries of our add-on book (ownership marker)

// U-FIX-5 S-04: a creator note can carry a tool's file path (`scripts/tune_x.py`); the credits page shows the note without such paths (a bracketed aside holding one goes whole)
const PATH = String.raw`[\w.\-]+(?:[\/\\][\w.\-]+)+\.(?:py|js|mjs|cjs|ts|sh|bat|ps1|json|ya?ml|txt|md)\b`;
export const cleanNotes = s => String(s || '').replace(new RegExp(String.raw`[（(\[【][^（）()\[\]【】]*?${PATH}[^（）()\[\]【】]*?[）)\]】]`, 'gi'), ' ')
  .replace(new RegExp(PATH, 'gi'), ' ').replace(/\s+([，。；,.;])/g, '$1').replace(/[，,；;:：]\s*([。.]|$)/g, '$1').replace(/\s+/g, ' ').trim();

/** One card object (the host's character record, with or without a `data` wrapper) -> { name, creator, version, avatar, tags, notes, src, spatialOs } or null when it names nothing. */
export function pick(c, src) {
  const d = c?.data && typeof c.data === 'object' ? c.data : (c && typeof c === 'object' ? c : {});
  const name = String(d.name || c?.name || '').trim();
  if (!name && !d.creator && !d.character_version) return null;
  const ext = d.extensions && typeof d.extensions === 'object' ? d.extensions.spatial_os : undefined;
  const out = { name, creator: String(d.creator || '').trim(), version: String(d.character_version || '').trim(), avatar: String(c?.avatar || ''),
    tags: Array.isArray(d.tags) ? d.tags.map(String).slice(0, 12) : [], notes: cleanNotes(String(d.creator_notes || '').replace(/<[^>]+>/g, ' ')).slice(0, 200), src, spatialOs: ext };
  Object.defineProperty(out, 'first', { value: String(d.first_mes ?? c?.first_mes ?? '').slice(0, 2000), enumerable: false });   // the greeting, for the automatic pack (readCardSource); not enumerable, so the credits page's copy never carries it
  Object.defineProperty(out, 'alts', { value: Array.isArray(d.alternate_greetings) ? d.alternate_greetings.slice(0, 4).map(a => String(a ?? '').slice(0, 800)) : [], enumerable: false });   // I-26: read only when the greeting is a short marker
  return out;
}

/** The three-level fallback of the credits page: TavernHelper getCharData('current') -> the tavern context -> the parent window's same interfaces.
 *  Returns { card, tried }; `tried` lists the levels that had an interface ('bridge' | 'context'). */
export async function readCardBasics(a = {}) {
  const tried = [], done = card => ({ card, tried });
  try { const g = a.th?.(); if (g) tried.push('bridge'); const r = pick(await g?.('current'), 'getCharData'); if (r) return done(r); } catch (e) {}
  try { const c = a.ctx?.(); if (c) tried.push('context'); const r = pick(c?.characters?.[c.characterId], 'context'); if (r) return done(r); } catch (e) {}
  try { const g = a.parentTh?.(); if (typeof g === 'function' && !tried.includes('bridge')) tried.push('bridge'); const r = typeof g === 'function' ? pick(await g('current'), 'parent-th') : null; if (r) return done(r); } catch (e) {}
  try { const c = a.parentCtx?.(); if (c && !tried.includes('context')) tried.push('context'); const r = pick(c?.characters?.[c.characterId], 'parent-st'); if (r) return done(r); } catch (e) {}
  return done(null);
}

/** The current character's own worldbooks (primary, then additional; never a global or chat book) -> [{ name, entries: [{ title, keys, enabled, content? }] }].
 *  `content` is kept only for the entry titled `spatial_os:pack` (and, as `initvar`, for the variable-initialisation entry); entries of our add-on book are left out. A book or an interface that fails reads as nothing. */
export async function readCardBooks(a = {}) {
  let names = [];
  try { const n = await a.bookNames?.(); names = [...new Set([n?.primary, ...(Array.isArray(n?.additional) ? n.additional : [])].filter(x => typeof x === 'string' && x))]; } catch (e) { return []; }
  const out = [];
  for (const name of names) {
    let list = null; try { list = await a.getBook?.(name); } catch (e) {}
    if (!Array.isArray(list)) continue;
    const entries = [];
    for (const e of list) {
      if (!e || typeof e !== 'object' || OURS(e)) continue;
      const title = String(e.name ?? e.comment ?? '').trim(), keys = e.strategy?.keys ?? e.key ?? e.keys;
      entries.push({ title, keys: Array.isArray(keys) ? keys.filter(k => typeof k === 'string') : [], enabled: e.enabled !== false, ...(title === EMBED_TITLE && typeof e.content === 'string' ? { content: e.content } : {}),
        ...(INITVAR.test(title) && typeof e.content === 'string' ? { initvar: e.content.slice(0, 60000) } : {}) });
    }
    out.push({ name, entries });
  }
  return out;
}

/** The per-card key of the choice store and the session cache: `k` + fnv36(name + "\n" + avatar); `k0` when no card was read. */
export const cardKey = basics => (basics && (basics.name || basics.avatar) ? 'k' + fnv36(basics.name + '\n' + basics.avatar) : 'k0');

/** K-R91: the embedded pack text and where it came from: `{ text, from: 'card' | 'worldbook' }` or null. The card field comes first (an object is serialised, a string is kept). */
export function embeddedText(basics, books) {
  const f = basics?.spatialOs;
  if (f && typeof f === 'object') { try { return { text: JSON.stringify(f), from: 'card' }; } catch (e) {} }
  else if (typeof f === 'string' && f.trim()) return { text: f, from: 'card' };
  for (const b of books || []) for (const e of b.entries) if (e.title === EMBED_TITLE && typeof e.content === 'string') return { text: e.content, from: 'worldbook' };
  return null;
}

/** K-R93 / K-R94: the plain `CardSource` the automatic pack is derived from: { name, creator, tags, avatar, greeting, books: [{ name, entries: [{ title, keys, enabled, initvar? }] }], stat, initvar }.
 *  Entry contents are not passed on (only the initvar text); `stat` is the live MVU variable tree, read only (`access.stat`), or null. `known` = an already read { card } (the gate's). */
export async function readCardSource(a = {}, known = null) {
  const card = known && known.card !== undefined ? known.card : (await readCardBasics(a)).card, raw = card ? await readCardBooks(a) : [];
  let stat = null; try { const s = a.stat?.(); stat = s && typeof s === 'object' ? s : null; } catch (e) {}
  const init = raw.flatMap(b => b.entries).find(e => typeof e.initvar === 'string');
  return { name: card?.name || '', creator: card?.creator || '', tags: card?.tags || [], avatar: card?.avatar || '', greeting: card?.first || '', alternates: card?.alts || [],
    books: raw.map(b => ({ name: b.name, entries: b.entries.map(({ content, ...e }) => e) })), stat, initvar: init ? init.initvar : '' };
}
