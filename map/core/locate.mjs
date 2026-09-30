// Vocabulary and locate for kernel contract v2 (docs/kernel-schema.md K-R15..K-R25): one algorithm places every
// text that names a place. Pure; the tree comes from nodes.mjs (only its read API is used here).
import { normalise, normText, cpLen, cut, lexicon, stripArticle, journey } from './lexicon.mjs';

export const MAX_ALIASES = 64, MAX_HINTS = 256, MAX_WORD = 60, MAX_SCAN = 400, MAX_MATCHES = 256, MAX_SHARED = 256;
const SPACED = /^[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Nd}]$/u;   // scripts that separate words with spaces
const isSp = ch => !!ch && SPACED.test(ch);
const firstCP = s => String.fromCodePoint(s.codePointAt(0));
const lastCP = s => { const a = [...s]; return a[a.length - 1]; };
const prevCP = (t, i) => { if (i <= 0) return ''; const c = t.charCodeAt(i - 1); return c >= 0xDC00 && c <= 0xDFFF && i > 1 ? t.slice(i - 2, i) : t[i - 1]; };
const nextCP = (t, i) => (i >= t.length ? '' : String.fromCodePoint(t.codePointAt(i)));

/** Every whole-word occurrence of a normalised word (K-R15): [[start, end]] in UTF-16 units of the normalised text. */
export function occurrences(text, word, suffixes = []) {
  const out = [], a = isSp(firstCP(word)), z = isSp(lastCP(word));
  for (let from = 0, i; (i = text.indexOf(word, from)) >= 0; from = i + 1) {
    if (a && isSp(prevCP(text, i))) continue;
    const e = i + word.length;
    if (z && isSp(nextCP(text, e)) && !suffixes.some(s => text.startsWith(s, e) && !isSp(nextCP(text, e + s.length)))) continue;
    out.push([i, e]);
  }
  return out;
}
const clean = (list, max) => {
  const seen = new Set(), out = [];
  for (const w of Array.isArray(list) ? list : []) {
    if (typeof w !== 'string') continue;
    const norm = normalise(w), n = cpLen(norm);
    if (!norm || n > MAX_WORD || seen.has(norm)) continue;
    seen.add(norm); out.push({ word: w.trim(), norm });
    if (out.length >= max) break;
  }
  return out;
};

/** K-R15, K-R16, K-R25: the words of every node. custom = [{ word, node, canonical? }]; lexicon = manifest.lexicon. */
export function vocabulary(tree, { custom, lang, lexicon: extra } = {}) {
  const lx0 = lexicon(lang, extra), entries = [], strongBy = new Map();
  for (const id of tree.ids()) {
    const n = tree.get(id); if (!n || id === tree.synth) continue;
    const hints = clean(n.hints, MAX_HINTS), hs = new Set(hints.map(h => h.norm));
    const names = Array.isArray(n.alias) ? n.alias : [n.name, ...Object.values(n.i18n && typeof n.i18n === 'object' ? n.i18n : {}).map(t => t?.name)].map(w => (typeof w === 'string' ? stripArticle(w, lx0) : w));
    hints.forEach((h, rank) => entries.push({ node: id, word: h.word, norm: h.norm, weak: true, rank }));
    clean(names, MAX_ALIASES).filter(w => !hs.has(w.norm)).forEach((w, k) => {
      const e = { node: id, word: w.word, norm: w.norm, weak: false, rank: hints.length + k };
      entries.push(e); if (!strongBy.has(w.norm)) strongBy.set(w.norm, []); strongBy.get(w.norm).push(e);
    });
  }
  for (const list of strongBy.values()) {   // a strong word on two branches is a hint on each (K-R15)
    if (list.length < 2) continue;
    const many = list.length > MAX_SHARED;
    for (const e of list) if (many || list.some(o => o !== e && o.node !== e.node && !tree.isAncestor(o.node, e.node) && !tree.isAncestor(e.node, o.node))) e.weak = true;
  }
  const users = Array.isArray(custom) ? custom : Array.isArray(custom?.aliases) ? custom.aliases : [];
  for (const u of users) {   // K-R25: strength of `canonical` on that node, else strong; unknown node or canonical -> ignored
    if (!u || typeof u.word !== 'string' || typeof u.node !== 'string' || !tree.has(u.node)) continue;
    const norm = normalise(u.word); if (!norm || cpLen(norm) > MAX_WORD) continue;
    let weak = false, canonical;
    if (typeof u.canonical === 'string' && u.canonical) {
      const c = normalise(u.canonical), hit = entries.find(e => e.node === u.node && e.norm === c && !e.user);
      if (!hit) continue;
      weak = hit.weak; canonical = u.canonical;
    }
    entries.push({ node: u.node, word: u.word.trim(), norm, weak, rank: -1, user: true, ...(canonical ? { canonical } : {}) });
  }
  const byNorm = new Map(), byFirst = new Map();
  for (const e of entries) {
    if (!byNorm.has(e.norm)) { byNorm.set(e.norm, []); const c = firstCP(e.norm); if (!byFirst.has(c)) byFirst.set(c, []); byFirst.get(c).push(e.norm); }
    byNorm.get(e.norm).push(e);
  }
  const lexes = new Map();
  return {
    lang: lang ?? null, extra, entries, byNorm, byFirst, memo: new Map(),
    lex(l) { const k = l ?? lang ?? ''; if (!lexes.has(k)) lexes.set(k, lexicon(k, extra)); return lexes.get(k); },
  };
}

/** K-R20: every occurrence, minus matches inside a longer span, minus root hints, earliest 256. */
function matchesOf(t, tree, vocab, lx) {
  const chars = new Set([...t]), words = new Set();
  for (const c of chars) for (const w of vocab.byFirst.get(c) || []) words.add(w);
  const all = [];
  for (const w of words) {
    const occ = occurrences(t, w, lx.suffixes); if (!occ.length) continue;
    for (const e of vocab.byNorm.get(w)) for (const [s, en] of occ) all.push({ ...e, start: s, end: en, len: cpLen(w) });
  }
  all.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = []; let maxEnd = -1;
  for (let i = 0; i < all.length;) {
    let j = i; while (j < all.length && all[j].start === all[i].start && all[j].end === all[i].end) j++;
    if (maxEnd < all[i].end) for (let k = i; k < j; k++) kept.push(all[k]);
    maxEnd = Math.max(maxEnd, all[i].end); i = j;
  }
  return kept.filter(m => !(m.weak && m.node === tree.root)).slice(0, MAX_MATCHES);
}
const headCmp = lx => (a, b) => (lx.head === 'last' ? b.start - a.start : a.start - b.start);

function resolve(t, tree, vocab, lx, here) {
  t = [...t].length > MAX_SCAN ? cut(t, MAX_SCAN) : t;
  const ms = matchesOf(t, tree, vocab, lx); if (!ms.length) return null;
  const head = headCmp(lx), strong = ms.filter(m => !m.weak), weak = ms.filter(m => m.weak);
  const weakCmp = (a, b) => b.len - a.len || (here ? tree.distance(here, a.node) - tree.distance(here, b.node) : 0) || tree.depth(b.node) - tree.depth(a.node)
    || head(a, b) || tree.order(a.node) - tree.order(b.node) || a.rank - b.rank;
  const best = new Map();   // best(n): the longest strong match of n, tie earliest start
  for (const m of strong) { const b = best.get(m.node); if (!b || m.len > b.len || (m.len === b.len && m.start < b.start)) best.set(m.node, m); }
  const score = c => [c, ...tree.ancestors(c)].reduce((s, a) => s + (best.get(a)?.len || 0), 0);
  let A = null;
  if (best.size) A = [...best.keys()].map(n => ({ n, sc: score(n), b: best.get(n) })).sort((x, y) => y.sc - x.sc || tree.depth(y.n) - tree.depth(x.n)
    || y.b.len - x.b.len || head(x.b, y.b) || tree.order(x.n) - tree.order(y.n))[0];
  const ranked = weak.slice().sort(weakCmp);
  const own = n => ranked.find(m => m.node === n);
  let node, via, deciding;
  if (A) {
    const refine = ranked.find(m => tree.isAncestor(A.n, m.node));
    if (refine) { node = refine.node; via = 'hint'; deciding = refine; } else { node = A.n; via = 'alias'; deciding = A.b; }
  } else { node = ranked[0].node; via = 'hint'; deciding = ranked[0]; }
  const w = own(node) || best.get(node) || deciding;
  return { node, word: w.word, via: deciding.user ? 'user' : via, ...(deciding.user && deciding.canonical ? { canonical: deciding.canonical } : {}) };
}

function locatePart(t, tree, vocab, lx, here) {
  const j = journey(t, lx, occurrences);
  if (j) {
    const A = resolve(j.from, tree, vocab, lx, here);
    let B = resolve(j.to, tree, vocab, lx, here);
    if (!B) {   // B failed and A starts with a prefix ending in a middle dot: retry prefix + B, accepted only strictly below the prefix
      const m = j.from.match(/^(.*?[·・])/);
      if (m) { const pre = resolve(m[1], tree, vocab, lx, here), r = resolve(m[1] + j.to, tree, vocab, lx, here); if (r && (!pre || tree.isAncestor(pre.node, r.node))) B = r; }
    }
    if (A || B) return { ...(A || B), transit: { from: A ? A.node : null, to: B ? B.node : null, from_text: j.from, to_text: j.to, route: j.route } };
  }
  return resolve(t, tree, vocab, lx, here);
}

/** K-R17..K-R23: text -> { node, word, via, canonical?, transit?, text } or null. opts = { lang?, here? }. */
export function locate(text, tree, vocab, opts = {}) {
  const t = normText(text); if (!t) return null;
  const lx = vocab.lex(opts.lang), here = opts.here && tree.has(opts.here) ? opts.here : null;
  const key = `${lx.lang}\u0000${here || ''}\u0000${t}`;
  if (vocab.memo.has(key)) { const r = vocab.memo.get(key); return r && { ...r, ...(r.transit ? { transit: { ...r.transit } } : {}) }; }
  let r = null;
  for (const part of t.split(/[/|]/).map(s => s.trim()).filter(Boolean)) { r = locatePart(part, tree, vocab, lx, here); if (r) break; }
  if (r) r = { ...r, text: t };
  if (vocab.memo.size > 2000) vocab.memo.clear();
  vocab.memo.set(key, r);
  return r && { ...r, ...(r.transit ? { transit: { ...r.transit } } : {}) };
}

/** K-R25: the name to offer as "unmapped", or null (empty, located, or ignored by the user). */
export function unmapped(text, tree, vocab, opts = {}) {
  const shown = String(text ?? '').normalize('NFKC').replace(/\{\{\s*user\s*\}\}/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!normalise(shown) || locate(text, tree, vocab, opts)) return null;
  const first = shown.split(/[/|]/).map(s => s.trim()).filter(Boolean)[0] || shown;
  const ign = new Set((opts.ignore || []).map(normalise));
  return ign.has(normalise(shown)) || ign.has(normalise(first)) ? null : first;
}
