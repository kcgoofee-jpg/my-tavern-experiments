// Growing nodes from chat (docs/kernel-schema.md K-R26; docs/zero-config.md §4.3, §4.4): the place texts the host reads become `g_` nodes under the nodes the tree already has.
// Pure and deterministic: the same texts in the same order on the same tree give the same nodes, so a grown tree is a droppable cache that a recompute reproduces item for item.
//   grow(tree, vocab, texts, { lang, max, depth, seen })   -> { nodes, consumed }   nodes = the new nodes in creation order; consumed = the normalised texts that were used
//   recomputeGrowth(places, derivedNodes, opts)             -> { nodes, consumed }   from nothing: places = texts in message order (or one array of texts per message)
import { normalise, cpLen, fnv36, lexicon, stripArticle, journey } from './lexicon.mjs';
import { buildTree, vocabulary, locate } from './nodes.mjs';
import { occurrences } from './locate.mjs';

export const MAX_GROWN = 200, MAX_DEPTH = 6, MAX_SEGMENT = 40;
const SEP = /\s*[·・›>]\s*|\s+-\s+/, COMMA = /[,，]/, MACRO = /\{\{\s*user\s*\}\}/gi;
const clean = s => String(s ?? '').normalize('NFKC').replace(MACRO, ' ').replace(/\s+/g, ' ').trim();

/** The segments of one place text as written, outer to inner (K-R26 steps 2 and 3, before the tree walk): first part (K-R18), the journey's origin (K-R19), separators, comma lists. */
export function splitSegments(text, locates, lx) {
  let t = clean(text).split(/[/|]/).map(s => s.trim()).find(Boolean) || '';
  if (!t) return [];
  const j = journey(t, lx, (s, w) => occurrences(s.toLowerCase(), w, lx.suffixes));
  if (j) t = clean(j.from);
  const out = [];
  for (const part of t.split(SEP).map(s => s.trim()).filter(Boolean)) {
    const items = part.split(COMMA).map(s => s.trim()).filter(Boolean);
    if (items.length < 2) { out.push(...items); continue; }
    const innerFirst = locates(items[items.length - 1]) && !locates(items[0]) ? true : lx.head === 'first';   // true: the list runs inner -> outer
    out.push(...(innerFirst ? items.slice().reverse() : items));
  }
  return out;
}
/** The same segments with a leading article of the pack language stripped from each (what a new node is named after). */
export const segmentsOf = (text, locates, lx) => splitSegments(text, locates, lx).map(s => stripArticle(s, lx)).filter(Boolean);

export function grow(tree, vocab, texts, { lang, max = MAX_GROWN, depth = MAX_DEPTH, seen = [], custom } = {}) {
  const lx = lexicon(lang, vocab?.extra), base = tree.ids().filter(id => id !== tree.synth).map(id => tree.get(id)), added = [], consumed = [], done = new Set(seen.map(normalise));
  let t = tree, v = vocab, grownCount = base.filter(n => String(n.id).startsWith('g_')).length;
  const locates = s => !!locate(s, t, v, { lang });
  const rebuild = () => { t = buildTree([...base, ...added], { title: tree.title }); v = vocabulary(t, { lang, lexicon: vocab?.extra, custom }); };
  for (const raw of Array.isArray(texts) ? texts : []) {
    const key = normalise(clean(raw)); if (!key || done.has(key)) continue;
    done.add(key); consumed.push(key);
    let cur = t.root;
    for (const written of splitSegments(raw, locates, lx)) {
      const seg = stripArticle(written, lx);
      if (cpLen(seg) < 1 || cpLen(seg) > MAX_SEGMENT) break;
      const hit = s => { const r = locate(s, t, v, { lang, here: cur }); return r && (r.node === cur || t.isAncestor(cur, r.node)) ? r : null; };
      const r = hit(written) || (seg !== written ? hit(seg) : null);   // as written first ("the inn" is an alias), then without the article
      if (r) { cur = r.node; continue; }
      if (grownCount >= max || t.depth(cur) + 1 > depth) break;
      const id = 'g_' + fnv36(cur + seg), node = { id, name: seg, alias: [seg], ...(cur === t.synth ? {} : { parent: cur }) };
      if (t.has(id)) { cur = id; continue; }   // the same segment under the same parent already exists
      added.push(node); grownCount++; rebuild(); cur = id;
    }
  }
  return { nodes: added, consumed };
}

/** K-R26 / §4.4: the grown nodes rebuilt from nothing. `places` = texts in message order (flat) or one array of texts per message. */
export function recomputeGrowth(places, derivedNodes, opts = {}) {
  const tree = buildTree(derivedNodes, { title: opts.title || '' }), vocab = vocabulary(tree, { lang: opts.lang, lexicon: opts.lexicon, custom: opts.custom });
  const flat = (Array.isArray(places) ? places : []).flatMap(p => (Array.isArray(p) ? p : [p]));
  return grow(tree, vocab, flat, opts);
}
