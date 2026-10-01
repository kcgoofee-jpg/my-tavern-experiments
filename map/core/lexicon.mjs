// Text primitives and the kernel word lists of kernel contract v2 (docs/kernel-schema.md K-R07, K-R15, K-R17, K-R19).
// Pure and self-contained: no host globals, no imports from outside map/core (the FNV hash and the zh journey patterns
// are copies of the ones in stash.mjs and the old place resolver, on purpose).

const P1 = /[‘’‚‛′ʼ]/g;          // curly single quotes and primes -> '
const P2 = /[“”„‟″]/g;                // curly double quotes and double primes -> "
const DASH = /[‐-―−﹘﹣]/g;             // dashes and minus -> -
const MACRO_USER = /\{\{\s*user\s*\}\}/gi;

/** K-R17 normal form of a vocabulary word: NFKC, lower case, quotes, dashes, spaces, `&` -> ` and `. */
const NORM_CACHE = new Map();   // pure function, called thousands of times per boot on the same pack words: memo (bounded)
export function normalise(s) {
  const k = String(s ?? ''), hit = NORM_CACHE.get(k);
  if (hit !== undefined) return hit;
  const v = k.normalize('NFKC').toLowerCase().replace(P1, "'").replace(P2, '"').replace(DASH, '-')
    .replace(/&/g, ' and ').replace(/\s+/g, ' ').trim();
  if (k.length <= 200) { if (NORM_CACHE.size >= 8000) NORM_CACHE.clear(); NORM_CACHE.set(k, v); }
  return v;
}
/** Normal form of a place text: the same, and the host macro `{{user}}` is dropped first. */
export const normText = s => normalise(String(s ?? '').normalize('NFKC').replace(MACRO_USER, ' '));
/** Code points of a string (`len` of K-R20 counts these). */
export function cpLen(s) { let n = 0; for (const _ of String(s)) n++; return n; }
export const cut = (s, n) => { s = String(s ?? ''); return s.length <= n ? s : [...s].slice(0, n).join(''); };

/** FNV-1a over code points (same hash as stash.mjs `rowId`); base 36 for ids. */
export function fnv(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export const fnv36 = s => fnv(s).toString(36);

const KERNEL = {
  zh: { suffixes: [], articles: [], head: 'last', yes: ['是', '有', '在', '在场', '同行', '是的', '对', 'yes', 'true'] },
  en: { suffixes: ["'s", "s'", 'es', 's'], articles: ['the', 'a', 'an'], head: 'first', yes: ['yes', 'y', 'true', 'present', 'here', 'together'] },
};
/** The kernel ships `zh` and `en`; any other language uses the `en` vocabulary (K-R07). */
export const langKey = lang => (/^zh/i.test(String(lang || '')) ? 'zh' : 'en');
const words = a => (Array.isArray(a) ? a.filter(w => typeof w === 'string').map(normalise).filter(Boolean) : []);
const uniq = a => [...new Set(a)];

/** Kernel lexicon of a language plus the pack's additions `lexicon.<lang>` (additions extend, never remove). */
export function lexicon(lang, additions) {
  const key = langKey(lang), base = KERNEL[key], l = String(lang || '');
  const add = (additions && typeof additions === 'object' && (additions[l] || additions[l.slice(0, 2)] || additions[key])) || {};
  const head = add.head === 'first' || add.head === 'last' ? add.head : /^(zh|ja)/i.test(l) ? 'last' : base.head;
  return {
    key, lang: l, head,
    suffixes: uniq([...base.suffixes, ...words(add.suffixes)]).sort((a, b) => b.length - a.length),
    articles: uniq([...base.articles, ...words(add.articles)]),
    yes: uniq([...base.yes, ...words(add.present)]),
    to: words(add.to), from: words(add.from),
    fields: add.fields && typeof add.fields === 'object' ? add.fields : {},
  };
}
/** Default aliases lose a leading article of the pack language (`The Salty Dog` -> `Salty Dog`). */
export function stripArticle(word, lx) {
  const t = String(word ?? '').trim(), m = t.match(/^(\S+)\s+(\S[\s\S]*)$/);
  return m && lx.articles.includes(normalise(m[1])) ? m[2].trim() : t;
}
/** A roster value that means "yes" / "with the player": true, a non-zero number, or a yes word (K-R41). */
export function isYes(value, lx) {
  if (value === true) return true;
  if (typeof value === 'number') return value !== 0 && Number.isFinite(value);
  return typeof value === 'string' && lx.yes.includes(normalise(value));
}

// ---- journeys (K-R19): text -> { from, to, route } (from = text of the origin, prefix included) or null ----
const TAIL = /(?:的|之间|途中|路上|路途|航程|中途)/;
const cutTail = s => { const m = s.match(TAIL); if (!m) return [s.trim(), '']; const via = s.slice(m.index + m[0].length).trim(); return [s.slice(0, m.index).trim(), /^(路上|途中|中途|航程|之间|路途)?$/.test(via) ? '' : via]; };
const same = s => [s.trim(), ''];
/** v1 parseTransit, verbatim in structure (zh): 从A到B, A→B, A至B, 前往B. */
function zhJourney(v) {
  let m;
  if ((m = v.match(/^(.*?)从\s*(.+?)\s*(?:到|去往|去|前往|飞往|驶向|往)\s*(.+)$/))) { const [to, route] = cutTail(m[3]); return to && m[2] ? { from: (m[1] + m[2]).trim(), to, route } : null; }
  if ((m = v.match(/^(.+?)\s*(?:→|->|⇒)\s*(.+)$/))) { const [to, route] = cutTail(m[2]); return to ? { from: m[1].trim(), to, route } : null; }
  if ((m = v.match(/^(.+?)至(.+)$/)) && !/^[高少多今甚]/.test(m[2])) { const [to, route] = cutTail(m[2]); return to && [...m[1]].length >= 2 ? { from: m[1].trim(), to, route } : null; }
  if ((m = v.match(/^(.*?)(?:前往|去往|驶向|飞往|赶往|开往)\s*(.+)$/))) { const [to, route] = cutTail(m[2]); return to ? { from: m[1].replace(/[，,、\s]+$/, '').trim(), to, route } : null; }
  return null;
}
const ARROW = /^(.+?)\s*(?:→|->|⇒)\s*(.+)$/;
const EN_FROM = /^(.*?)\bfrom\s+(.+?)\s+to\s+(.+)$/i;
const EN_HEAD = /^(.*?)\b(?:on (?:the|my|our|his|her|their) way|heading|headed|en route|bound)\s+(?:to|for)\s+(.+)$/i;
const join = (...p) => p.map(s => s.replace(/[,;:\s]+$/, '').trim()).filter(Boolean).join(' ');

/** Whole-word occurrences of the pack's marker words, earliest first: [{ s, e }]. `find(text, word)` is the caller's matcher. */
function markerJourney(t, lx, find) {
  if (!lx.to.length) return null;
  const first = ws => { let hit = null; for (const w of ws) for (const [s, e] of find(t, w)) if (!hit || s < hit.s || (s === hit.s && e > hit.e)) hit = { s, e }; return hit; };
  const to = first(lx.to); if (!to) return null;
  const before = t.slice(0, to.s), after = t.slice(to.e).trim(); if (!after) return null;
  const fm = lx.from.length ? [...lx.from].flatMap(w => find(before, w).map(([s, e]) => ({ s, e }))).sort((a, b) => a.s - b.s)[0] : null;
  return { from: fm ? join(before.slice(0, fm.s), before.slice(fm.e)) : before.trim(), to: after, route: '' };
}
/** Patterns in the order of K-R19; the first that parses wins. `find` = the whole-word finder (locate.mjs). */
export function journey(t, lx, find) {
  if (lx.key === 'zh') { const z = zhJourney(t); if (z) return z; }
  let m = t.match(ARROW);
  if (m) { const [to, route] = lx.key === 'zh' ? cutTail(m[2]) : same(m[2]); if (to) return { from: m[1].trim(), to, route }; }
  if (lx.key === 'en') {
    if ((m = t.match(EN_FROM))) return { from: join(m[1], m[2]), to: m[3].trim(), route: '' };
    if ((m = t.match(EN_HEAD))) return { from: join(m[1]), to: m[2].trim(), route: '' };
  }
  return markerJourney(t, lx, find);
}
