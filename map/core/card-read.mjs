// Runtime card reading (docs/kernel-schema.md K-R93, K-R94, K-R95; docs/zero-config.md §3, §4): a plain `CardSource` -> the automatic pack. Pure; the host collects the source
// (tavern/card-source.mjs `readCard`) and S11's card_to_pack tool shares the rules and the fixtures (tests/fixtures/cardread).
//   CardSource = { name, creator, tags[], avatar, greeting, books: [{ name, entries: [{ title, keys[], enabled, initvar? }] }], stat, initvar }
// Only titles, keys, the greeting, the variable shape and the initvar entry are read; entry contents are never read and nothing is filtered by meaning (brief rule 8).
import { normalise, normText, cut, cpLen, fnv36, stripArticle, lexicon } from './lexicon.mjs';
import { placeWord, hasWord, exactWords, exactKey, exactRank, slotFind } from './vocab.mjs';
import { parseShape } from './yaml-shape.mjs';
import { buildTree, vocabulary, locate } from './nodes.mjs';
import { DEFAULT_SLOTS } from './profile.mjs';
import { validate2 } from './pack-v2.mjs';

export const MAX_CANDIDATES = 150, MAX_TITLE = 40, ROOT = 'root', EMBED = 'spatial_os:pack';
const plain = o => !!o && typeof o === 'object' && !Array.isArray(o);
const val = v => (Array.isArray(v) && v.length === 2 && typeof v[1] === 'string' && (v[0] === null || typeof v[0] !== 'object') ? v[0] : v);
const isInit = t => /[[［][^\]］]*initvar[^\]］]*[\]］]/i.test(t);
const TAG = /^\s*(\[[^\]]*\]|［[^］]*］|【[^】]*】)\s*/, SEP = /\s*[·・›>]\s*|\s+-\s+/;
const entriesOf = src => (src?.books || []).flatMap(b => (Array.isArray(b?.entries) ? b.entries : [])).filter(e => e && typeof e === 'object');

// ---- the variable shape (K-R94) ----
/** The tree the discovery reads: the live `stat` when it has keys, else the shape of the initvar text (JSON / YAML subset); `stat_data` unwrapped. */
export function shapeOf(src) {
  let s = plain(src?.stat) && Object.keys(src.stat).length ? src.stat : null;
  if (!s) { const p = typeof src?.initvar === 'string' ? parseShape(src.initvar) : src?.initvar; s = plain(p) ? p : {}; }
  return plain(s.stat_data) ? s.stat_data : s;
}
/** [{ path, kind: 'text' | 'number' | 'object' | 'table' }] to depth 3; a name-keyed table is listed as itself (same walk as the variable mapping). */
export function pathsOf(shape, depth = 3) {
  const out = [], isTable = t => { t = val(t); const v = plain(t) ? Object.values(t) : []; return v.length > 0 && v.every(x => plain(val(x))); };
  const walk = (o, pre, d) => {
    for (const [k, raw] of Object.entries(o)) {
      if (k.startsWith('$')) continue;
      const v = val(raw), p = pre ? pre + '.' + k : k;
      if (plain(v)) { const t = isTable(v); out.push({ path: p, kind: t ? 'table' : 'object', value: v }); if (!t && d < depth) walk(v, p, d + 1); }
      else if (typeof v === 'number') out.push({ path: p, kind: 'number' });
      else if (typeof v === 'string' || typeof v === 'boolean') out.push({ path: p, kind: 'text' });
    }
  };
  if (plain(shape)) walk(shape, '', 1);
  return out;
}
const last = p => p.split('.').pop();
const KIND = { location: ['location', 'text'], time: ['time', 'text'], period: ['period', 'text'], date: ['date', 'text'], outfit: ['outfit', 'object'], reputation: ['reputation', 'number'] };
const shallow = (a, b) => a.path.split('.').length - b.path.split('.').length;
/** K-R38 discovery over a shape: { location?, time?, period?, date?, outfit?, reputation?, inventory? } (dot paths). */
export function discoverVars(ps) {
  const out = {};
  for (const [k, [word, kind]] of Object.entries(KIND)) {
    const hit = ps.filter(p => hasWord(word, last(p.path)) && (p.kind === kind || (kind === 'object' && p.kind === 'text'))).sort(shallow)[0];
    if (hit) out[k] = hit.path;
  }
  const inv = ps.filter(p => (p.kind === 'object' || p.kind === 'table') && exactRank('inventory', last(p.path)) >= 0).sort(shallow)[0];
  if (inv) out.inventory = inv.path;
  return out;
}
/** K-R41 discovery: the name-keyed tables whose rows have a place- or person-like field: [{ path, names[], fields[], present }]. */
export function rosterTables(ps) {
  const out = [];
  for (const p of ps) {
    if (p.kind !== 'table') continue;
    const rows = Object.entries(p.value).map(([n, r]) => [n, val(r)]);
    if (!rows.some(([, r]) => exactKey('place', r) !== undefined || exactWords('person').some(w => Object.keys(r).some(k => k.toLowerCase() === w)))) continue;
    out.push({ path: p.path, names: rows.map(([n]) => n), fields: [...new Set(rows.flatMap(([, r]) => Object.keys(r).filter(k => !k.startsWith('$'))))], present: exactRank('presentTable', last(p.path)) >= 0 || hasWord('present', last(p.path)) });
  }
  return out;
}
const SLOT_KEYS = ['grade', 'code', 'social', 'height', 'weight', 'accessory', 'known'];
/** The `entities` block from the roster tables (K-R41, K-R42): the present table, and the row fields that fit a text or tag slot; null when there is nothing. */
export function discoverEntities(tables) {
  const pres = tables.find(t => t.present), fields = [], rf = [...new Set(tables.flatMap(t => t.fields))];
  for (const s of SLOT_KEYS) { const f = slotFind(s, rf); if (f && !fields.some(x => x.field === f)) fields.push({ field: cut(f, 40), kind: DEFAULT_SLOTS[s].kind, 'x-slot': s }); }
  const out = {};
  if (pres) out.groups = [{ id: 'present', source: { mvu: pres.path } }, { id: 'members' }, { id: 'targets' }];
  if (fields.length) out.fields = fields;
  return Object.keys(out).length ? out : null;
}

// ---- K-R93: place candidates from the worldbook titles ----
const plainKey = k => typeof k === 'string' && cpLen(k.trim()) >= 1 && cpLen(k.trim()) <= 20 && !/^\/.*\/[a-z]*$/.test(k.trim()) && !/[*?]/.test(k);
/** candidates(src, { lang, people }) -> { nodes, problems }; `people` = names of the roster tables (their entries are not places). Nodes carry `parent` = the candidate named by the outer segment, else ROOT. */
export function candidates(src, { lang, people = [] } = {}) {
  const lx = lexicon(lang), ppl = new Set(people.map(normalise)), rows = [], seen = new Set();
  for (const e of entriesOf(src)) {
    const title = String(e.title ?? '').trim(), bare = title.replace(TAG, '').trim();
    if (!title || title === EMBED || isInit(title) || e.ours === true || cpLen(title) > MAX_TITLE || ppl.has(normalise(title)) || ppl.has(normalise(bare))) continue;
    const segs = bare.split(SEP).map(s => s.trim()).filter(Boolean); if (!segs.length) continue;
    const id = 'w_' + fnv36(normalise(title)); if (seen.has(id)) continue; seen.add(id);
    const keys = (Array.isArray(e.keys) ? e.keys : []).filter(plainKey).map(k => k.trim()), inner = segs[segs.length - 1];
    rows.push({ id, segs, inner, keys, hit: !!(placeWord(inner, lang) || keys.some(k => placeWord(k, lang))) });
  }
  const named = new Map();   // normalised name -> id of a candidate
  const mark = r => { if (!named.has(normalise(r.inner))) named.set(normalise(r.inner), r.id); };
  rows.filter(r => r.hit).forEach(mark);
  for (let pass = 0; pass < 6; pass++) {   // Z-04: an entry whose outer segment is already a candidate is one too (to a fixpoint, bounded)
    let more = false;
    for (const r of rows) if (!r.hit && r.segs.length > 1 && named.has(normalise(r.segs[r.segs.length - 2]))) { r.hit = true; mark(r); more = true; }
    if (!more) break;
  }
  const list = rows.filter(r => r.hit), problems = [], keep = list.slice(0, MAX_CANDIDATES), ids = new Set(keep.map(r => r.id));
  if (list.length > MAX_CANDIDATES) problems.push({ code: 'candidates-limit', path: 'nodes', detail: list.length });
  const nodes = keep.map(r => {
    const outer = r.segs.length > 1 ? named.get(normalise(r.segs[r.segs.length - 2])) : null, name = cut(r.inner, 80);
    const alias = [...new Map([name, stripArticle(name, lx), ...r.keys].map(w => cut(w, 60)).filter(Boolean).map(w => [normalise(w), w])).values()];
    return { id: r.id, name, alias, parent: outer && outer !== r.id && ids.has(outer) ? outer : ROOT };
  });
  return { nodes, problems };
}

// ---- K-R94: language and start view ----
/** The card's language: Han >= 30 % -> zh; kana >= 10 % -> ja; Hangul >= 30 % -> ko; else en; fewer than 20 letters -> the UI language. */
export function cardLang(src, uiLang = 'zh') {
  const sample = [src?.name, src?.greeting, ...entriesOf(src).map(e => e.title)].filter(s => typeof s === 'string').join(' ');
  const letters = [...sample].filter(c => /\p{L}/u.test(c)), n = letters.length;
  if (n < 20) return uiLang === 'en' ? 'en' : 'zh';
  const share = re => letters.filter(c => re.test(c)).length / n;
  if (share(/\p{Script=Han}/u) >= 0.3) return 'zh';
  if (share(/[\p{Script=Hiragana}\p{Script=Katakana}]/u) >= 0.1) return 'ja';
  if (share(/\p{Script=Hangul}/u) >= 0.3) return 'ko';
  return 'en';
}
/** The node the first 400 code points of the greeting locate to (never the root); a view only, never the current location. */
export function startNode(tree, vocab, greeting, lang) {
  const t = cut(String(greeting ?? '').replace(/\{\{[^}]*\}\}/g, ' '), 400);
  const r = t.trim() ? locate(t, tree, vocab, { lang }) : null;
  return r && r.node !== tree.root && tree.has(r.node) ? r.node : null;
}

// ---- K-R95 ----
/** The identity of what the pack is made from: card name, avatar, the sorted normalised entry titles and the sorted key paths of the variable shape. */
export function fingerprint(src) {
  const titles = entriesOf(src).map(e => normalise(e.title)).filter(Boolean).sort(), keys = pathsOf(shapeOf(src)).map(p => p.path).sort();
  return fnv36([String(src?.name ?? ''), String(src?.avatar ?? ''), titles.join('\n'), keys.join('\n')].join('\u0001'));
}
export const autoId = src => 'c_' + fnv36(String(src?.name ?? '') + '\n' + String(src?.avatar ?? ''));

/** deriveAutoPack(src, { uiLang }) -> { pack, fp, problems }: the schema-2 automatic pack (validated as foreign). Nodes: an explicit root named after the card, then the K-R93 candidates. */
export function deriveAutoPack(src, { uiLang = 'zh' } = {}) {
  const lang = cardLang(src, uiLang), shape = shapeOf(src), ps = pathsOf(shape), tables = rosterTables(ps);
  const title = cut(String(src?.name ?? '').trim() || (uiLang === 'en' ? 'Map' : '地图'), 80);
  const c = candidates(src, { lang, people: tables.flatMap(t => t.names) });
  const nodes = [{ id: ROOT, name: title }, ...c.nodes], vars = discoverVars(ps), ents = discoverEntities(tables);
  const start = startNode(buildTree(nodes, { title }), vocabulary(buildTree(nodes, { title }), { lang }), src?.greeting, lang);
  const raw = { id: autoId(src), schema: 2, title, lang, nodes, ...(Object.keys(vars).length ? { vars } : {}), ...(ents ? { entities: ents } : {}), ...(start ? { ui: { start } } : {}) };
  const v = validate2(raw, { trusted: false });
  return { pack: v.pack || { id: raw.id, schema: 2, title, nodes: [{ id: ROOT, name: title }] }, fp: fingerprint(src), problems: [...c.problems, ...v.problems] };
}
