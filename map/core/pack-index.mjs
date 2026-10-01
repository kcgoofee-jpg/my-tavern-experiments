// The shipped pack index and the match score (docs/kernel-schema.md K-R92, docs/zero-config.md §2.5). Pure: no host globals, no fetch.
//   index = { schema: 1, default: '<id>', packs: [{ id, schema, title, i18n?, match? }] }   (map/packs/index.json)
//   ev    = { card: { name, creator, tags }, titles: [string], chatKeys: [string], chatVarOf: id => string }
// Words are literal strings (K-R01), compared in the normal form of K-R17 (`lexicon.normalise`).
import { normalise } from './lexicon.mjs';

export const THRESHOLD = 10;   // a pack is a candidate with at least this many points
export const POINTS = Object.freeze({ chatVar: 100, card: 10, title: 5 });

const list = v => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []).map(normalise).filter(Boolean);
const isRow = r => r && typeof r === 'object' && typeof r.id === 'string' && r.id;

/** The packs of an index, in display order (rows that are not objects with an id are skipped). */
export const rowsOf = index => (Array.isArray(index?.packs) ? index.packs.filter(isRow) : []);

/** Points of one index row for the current card: chat variable present (100), a `match.card` word per field name / creator / tags (10 each field), each `match.worldbook` title that is an entry title (5 each). */
export function scorePack(row, ev = {}) {
  if (!isRow(row)) return 0;
  let s = 0;
  const keys = Array.isArray(ev.chatKeys) ? ev.chatKeys : [], cv = typeof ev.chatVarOf === 'function' ? ev.chatVarOf(row.id) : '';
  if (cv && keys.includes(cv)) s += POINTS.chatVar;
  const m = row.match && typeof row.match === 'object' ? row.match : {}, c = m.card && typeof m.card === 'object' ? m.card : {}, card = ev.card || {};
  const name = normalise(card.name), creator = normalise(card.creator), tags = list(card.tags);
  if (name && list(c.name).some(w => name.includes(w))) s += POINTS.card;
  if (creator && list(c.creator).some(w => creator.includes(w))) s += POINTS.card;
  if (tags.length && list(c.tags).some(w => tags.includes(w))) s += POINTS.card;
  const titles = new Set(list(ev.titles));
  for (const t of new Set(list(m.worldbook))) if (titles.has(t)) s += POINTS.title;
  return s;
}

/** The best candidate: { id, score, row } with the highest score of at least THRESHOLD, ties by index order; null when none. */
export function bestMatch(index, ev = {}) {
  let best = null;
  for (const row of rowsOf(index)) {
    const score = scorePack(row, ev);
    if (score >= THRESHOLD && (!best || score > best.score)) best = { id: row.id, score, row };
  }
  return best;
}
