// A pack-declared media source (docs/kernel-schema.md K-R106). Pure; no regular expression reads a floor's text.
//   gallerySpec(decl)              the pack's `entities.gallery` -> a checked spec, or null (a bad declaration is no source)
//   parseTags(text, spec)          every tag the grammar finds in a floor's text -> [{ start, end, name, category, number }]
//   readTable(spec, ext, urlOk)    the table read from the card's script data at run time -> { chars: [{ name, cover, sets }] }; nothing is copied or stored
//   resolveUrl(table, tag)         the address a tag points at (the number counts from 1 and wraps round the list), '' = not allowed, null = no such picture
//   galleryUrlOk(avatar, spec, u)  the image host check: the hosts are the pack's avatar hosts (K-R43), folder rules are the source's own
//   matchRoster(name, rows)        the roster row a table name stands for (name, alias, or the short name before the middle dot)
// The grammar slots are the kernel's: a tag is the three fields `name`, `category`, `number` in the declared order, each wrapped in the
// declared open / close character; `category` is one of the declared words, `number` is 1..digits ASCII digits, `name` is any text up to the
// close character (no line break). A name that is itself a category word is never a tag. Tags inside code blocks count: they are text.
import { portraitOk } from './profile.mjs';

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const str = v => typeof v === 'string';
export const FIELDS = ['name', 'category', 'number'], LIMITS = { chars: 200, list: 500, url: 300, name: 40, cats: 12, word: 20, digits: 6, segs: 8 };
const seg = s => str(s) && s.length >= 1 && s.length <= 40 && !s.includes('.') && !s.includes('\n');
const oneChar = c => str(c) && [...c].length === 1 && c.trim() === c && !/^[\p{L}\p{N}]$/u.test(c);
const folderRules = v => Array.isArray(v) ? v.filter(x => str(x) && x) : isObj(v) ? Object.fromEntries(Object.entries(v).filter(([k, a]) => str(k) && Array.isArray(a)).map(([k, a]) => [k, a.filter(x => str(x) && x)])) : undefined;

export function gallerySpec(g) {
  if (!isObj(g) || g.from !== 'card-script' || !str(g.path) || !seg(g.name) || !seg(g.sets) || (g.cover !== undefined && !seg(g.cover))) return null;
  const path = g.path.split('.');
  if (!path.length || path.length > LIMITS.segs || !path.every(seg)) return null;
  const t = isObj(g.tag) ? g.tag : null; if (!t) return null;
  const open = t.open === undefined ? '[' : t.open, close = t.close === undefined ? ']' : t.close, fields = t.fields === undefined ? [...FIELDS] : t.fields;
  if (!oneChar(open) || !oneChar(close) || !Array.isArray(fields) || fields.length !== 3 || !FIELDS.every(f => fields.includes(f))) return null;
  const cats = t.categories, digits = t.digits === undefined ? 4 : t.digits;
  if (!Array.isArray(cats) || !cats.length || cats.length > LIMITS.cats || new Set(cats).size !== cats.length) return null;
  if (!cats.every(c => str(c) && c.length >= 1 && c.length <= LIMITS.word && !c.includes(open) && !c.includes(close) && !/[\r\n]/.test(c))) return null;
  if (!Number.isInteger(digits) || digits < 1 || digits > LIMITS.digits) return null;
  return { id: str(g.id) && g.id ? g.id : 'gallery', path, name: g.name, cover: g.cover || '', sets: g.sets, require: folderRules(g.require), deny: folderRules(g.deny) || [],
    tag: { open, close, fields: [...fields], categories: [...cats], digits } };
}

const digitsOk = (s, max) => s.length >= 1 && s.length <= max && [...s].every(c => c >= '0' && c <= '9');
function matchAt(text, i, spec) {
  const { open, close, fields, categories, digits } = spec.tag; let pos = i; const got = {};
  for (const f of fields) {
    if (text[pos] !== open) return null;
    const e = text.indexOf(close, pos + 1); if (e < 0) return null;
    const body = text.slice(pos + 1, e); if (body.includes('\n') || body.includes('\r')) return null;
    if (f === 'name') { const n = body.trim(); if (!n || [...n].length > LIMITS.name) return null; got.name = n; }
    else if (f === 'category') { if (!categories.includes(body)) return null; got.category = body; }
    else { if (!digitsOk(body, digits)) return null; got.number = parseInt(body, 10); }
    pos = e + 1;
  }
  return { start: i, end: pos, ...got };
}
/** Every tag of the text, in order. A name that equals a category word is skipped (the card's own script does the same). */
export function parseTags(text, spec) {
  const out = []; if (!str(text) || !spec?.tag) return out;
  for (let i = text.indexOf(spec.tag.open); i >= 0 && i < text.length;) {
    const m = text[i] === spec.tag.open ? matchAt(text, i, spec) : null;
    if (m) { if (!spec.tag.categories.includes(m.name)) out.push(m); i = text.indexOf(spec.tag.open, m.end); } else i = text.indexOf(spec.tag.open, i + 1);
  }
  return out;
}

/** The pack's avatar hosts (K-R43) decide which hosts load; `require` / `deny` are the media source's own (a portrait folder rule does not bind a gallery). */
export const galleryUrlOk = (avatar, spec, url) => portraitOk({ hosts: isObj(avatar) && Array.isArray(avatar.hosts) ? avatar.hosts : [], require: spec?.require, deny: spec?.deny || [] }, url);

function walk(node, segs, i, out, budget) {
  if (budget.n-- <= 0) return;
  if (i === segs.length) { out.push(node); return; }
  const s = segs[i];
  if (s === '*') { for (const k of (Array.isArray(node) ? node : isObj(node) ? Object.values(node) : []).slice(0, 200)) walk(k, segs, i + 1, out, budget); }
  else if (isObj(node) && Object.hasOwn(node, s)) walk(node[s], segs, i + 1, out, budget);
}
/** The card's script data (`ext`, the structured extensions object) -> { chars }. A list keeps its positions: an address that fails the host check becomes '' (the tag number counts the original list). */
export function readTable(spec, ext, urlOk = () => true) {
  const found = []; if (spec) walk(ext, spec.path, 0, found, { n: 5000 });
  const ok = u => (str(u) && u.length <= LIMITS.url && urlOk(u) ? u : ''), chars = [], seen = new Set();
  for (const lst of found) for (const it of Array.isArray(lst) ? lst : []) {
    if (!isObj(it) || chars.length >= LIMITS.chars) continue;
    const name = str(it[spec.name]) ? it[spec.name].trim() : ''; if (!name || [...name].length > LIMITS.name || seen.has(name)) continue;
    seen.add(name);
    const raw = isObj(it[spec.sets]) ? it[spec.sets] : {}, sets = {};
    for (const c of spec.tag.categories) if (Object.hasOwn(raw, c) && Array.isArray(raw[c]) && raw[c].length) sets[c] = raw[c].slice(0, LIMITS.list).map(ok);
    chars.push({ name, cover: spec.cover ? ok(it[spec.cover]) : '', sets });
  }
  return { chars };
}
const byName = t => { const m = new Map(); for (const c of t?.chars || []) m.set(c.name, c); return m; };
/** The address of a tag: '' = the picture exists but its host is not allowed, null = no such character or category. */
export function resolveUrl(table, tag) {
  const c = byName(table).get(tag?.name), list = c?.sets?.[tag?.category];
  if (!list?.length || !Number.isInteger(tag.number)) return null;
  return list[(((tag.number - 1) % list.length) + list.length) % list.length];
}

const SEG = /[·・]/, first = n => String(n ?? '').split(SEG)[0].trim();
/** The roster row a table name stands for: the name, an alias (`alias` list or `displayName`), or the one row whose short name (before the middle dot) is the same. '' when none or ambiguous. */
export function matchRoster(name, rows) {
  const list = (Array.isArray(rows) ? rows : []).filter(r => isObj(r) && str(r.name) && r.name), n = String(name ?? '').trim(); if (!n) return '';
  const names = r => [r.name, r.displayName, ...(Array.isArray(r.alias) ? r.alias : [])].filter(str);
  const exact = list.find(r => names(r).includes(n)); if (exact) return exact.name;
  const same = list.filter(r => names(r).some(x => first(x) === first(n)));
  return same.length === 1 ? same[0].name : '';
}
/** Does this person (a roster or card name) stand for the scene's character? The roster match made by the host wins; without one the table name is compared as written or by its short name. */
export const sameWho = (scene, person) => !!person && (scene.who ? scene.who === person : scene.name === person || (first(scene.name) !== '' && first(scene.name) === first(person)));
export { first as shortName };
