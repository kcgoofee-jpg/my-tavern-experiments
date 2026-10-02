// Field specs of the v2 blocks, mirroring map/data/schema/v2/*.schema.json, with K-R06 per-item healing:
// a spec is (value, path, ctx) => healed value | DROP; every repair or drop is one entry in ctx.problems.
// tests/kernel_minimal.test.mjs checks these against tools/check_pack.py on the same broken packs.
import { cpLen } from './lexicon.mjs';
import { srcKind, decodedBytes, MAX_PICTURE, MAX_ITEMS } from './pack-media.mjs';
import { normTransit } from './transit-spec.mjs';

export const DROP = Symbol('drop');
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
export const bad = (x, p, code, detail) => { x.problems.push({ code, path: p, ...(detail !== undefined ? { detail } : {}) }); return DROP; };

const re = (s, f = 'u') => new RegExp(s, f);
export const ID = re('^[a-z][a-z0-9_]{0,63}$'), LANG = re('^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'), HEX = re('^#[0-9a-fA-F]{6}$');
const NL = n => re(`^[^\\n]{1,${n}}$`);
const FILE = '(?!.*\\.\\.)[A-Za-z0-9_][A-Za-z0-9_./-]*', REGION = re('^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$');

export const str = (o = {}) => (v, p, x) => {
  if (typeof v !== 'string') return bad(x, p, 'type', 'string');
  if (o.min && cpLen(v) < o.min) return bad(x, p, 'empty');
  if (o.re && !o.re.test(v)) return bad(x, p, 'pattern', v);
  return v;
};
const num = (o = {}) => (v, p, x) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return bad(x, p, 'type', 'number');
  if (o.int && !Number.isInteger(v)) return bad(x, p, 'type', 'integer');
  if ((o.min !== undefined && v < o.min) || (o.max !== undefined && v > o.max) || (o.gt !== undefined && v <= o.gt)) return bad(x, p, 'range', v);
  return v;
};
const bool = (v, p, x) => (typeof v === 'boolean' ? v : bad(x, p, 'type', 'boolean'));
const oneOf = list => (v, p, x) => (list.includes(v) ? v : bad(x, p, 'enum', v));
const any = v => v;
export const obj = (fields, o = {}) => (v, p, x) => {   // o.req, o.ext: 'b' (_ and x-), '_' , '' ; o.opaque: object with free content
  if (!isObj(v)) return bad(x, p, 'type', 'object');
  const out = {}, failed = new Set(), ext = o.ext ?? '';
  for (const [k, val] of Object.entries(v)) {
    if (Object.hasOwn(fields, k)) { const r = fields[k](val, `${p}.${k}`, x); if (r === DROP) failed.add(k); else out[k] = r; }
    else if ((ext && k.startsWith('_')) || (ext === 'b' && k.startsWith('x-'))) out[k] = val;
    else bad(x, `${p}.${k}`, 'unknown-key');
  }
  for (const k of o.req || []) if (!(k in out)) return failed.has(k) ? DROP : bad(x, p, 'missing', k);
  return out;
};
export const arr = (item, o = {}) => (v, p, x) => {
  if (!Array.isArray(v)) return bad(x, p, 'type', 'array');
  if (o.max && v.length > o.max) bad(x, p, 'too-many', v.length);
  const out = [];
  v.slice(0, o.max || v.length).forEach((e, i) => { const r = item(e, `${p}[${i}]`, x); if (r !== DROP) out.push(r); });
  if (o.min && out.length < o.min) return bad(x, p, 'too-few');
  return out;
};
export const dict = (keys, val) => (v, p, x) => {   // object keyed by id-like keys; a bad key or value drops that entry
  if (!isObj(v)) return bad(x, p, 'type', 'object');
  const out = {};
  for (const [k, e] of Object.entries(v)) {
    if (!keys.test(k)) { bad(x, `${p}.${k}`, 'key', k); continue; }
    const r = val(e, `${p}.${k}`, x); if (r !== DROP) out[k] = r;
  }
  return out;
};
const i18n = fields => dict(LANG, obj(Object.fromEntries(fields.map(f => [f, str({ min: 1 })]))));
const label = n => str({ min: 1, re: NL(n) });
const words = n => arr(str({ re: NL(n) }));
export const PATH_RE = re(`^${FILE}\\.json$`);
const pathRe = PATH_RE;
/** A block: a relative path to a json file (left for resolveBlocks) or the inline value of the expected top-level type. */
const block = (spec, type) => (v, p, x) => (typeof v === 'string' ? str({ re: pathRe })(v, p, x) : type === 'array' ? (Array.isArray(v) ? spec(v, p, x) : bad(x, p, 'type', 'array')) : isObj(v) ? spec(v, p, x) : bad(x, p, 'type', 'object'));

// ---- nodes ----
const nodeAt = obj({ x: num(), y: num(), z: num(), r: num({ min: 0 }), view: str({ re: ID }) }, { req: ['x', 'y'] });
export const idRef = (v, p, x) => (typeof v === 'string' ? x.ref(v, p) : bad(x, p, 'type', 'string'));   // repaired id (K-R06.1)
const link = obj({ to: idRef, label: str({ min: 1 }), i18n: i18n(['label']) }, { req: ['to'], ext: 'b' });
const NODE = obj({
  id: str({ re: ID }), name: label(80), type: str({ re: re('^[a-z][a-z0-9_-]{0,31}$') }), parent: idRef,
  alias: arr(str({ re: NL(60) }), { max: 64 }), hints: arr(str({ re: NL(60) }), { max: 256 }),
  cite: str({ min: 1 }), sub: str(), desc: str(), at: nodeAt, anchor: str({ re: REGION }), enter: idRef,
  i18n: dict(LANG, obj({ name: str({ min: 1 }), sub: str(), desc: str() })),
  view: (v, p, x) => (typeof v === 'string' ? str({ re: ID })(v, p, x) : arr(str({ re: ID }), { min: 1 })(v, p, x)),
  links: arr(link), media: arr(str({ re: ID }), { max: 32 }),   // K-R101: the node's pictures, ids of the media block (unknown ids are dropped by the cross check)
}, { req: ['id', 'name'], ext: 'b' });
export const nodesBlock = block(arr(NODE, { max: 5000 }), 'array');

// ---- views ----
const file = str({ re: re(`^${FILE}$`) }), dzi = str({ re: re(`^${FILE}\\.dzi$`) }), pic = str({ re: re(`^${FILE}\\.(png|jpe?g|webp)$`) });
const size = (v, p, x) => (Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number' && n > 0) ? v : bad(x, p, 'pattern', 'size'));
const unit4 = (v, p, x) => (Array.isArray(v) && v.length === 4 && v.every(n => typeof n === 'number' && n >= 0 && n <= 1) ? v : bad(x, p, 'pattern', 'unit4'));
const vi18n = dict(LANG, dict(/^/, str()));
const region = obj({ id: str({ re: REGION }), at: obj({ x: num(), y: num(), z: num(), r: num({ min: 0 }) }, { req: ['x', 'y'] }),
  poly: arr(arr(num(), { min: 2, max: 2 }), { min: 3 }) }, { req: ['id'], ext: 'b' });
const regions = (v, p, x) => (typeof v === 'string' ? file(v, p, x) : arr(region)(v, p, x));
const home = obj({ focus: idRef, width: num({ gt: 0 }), min_width: num({ gt: 0 }), phone: unit4 });
const open = oneOf(['locate', 'enter']);
const B = { ext: 'b' };
const VIEWS = {
  tiles: obj({ kind: oneOf(['tiles']), open, src: dzi, extent: size, regions, home, variants: dict(ID, dzi), credit: str(), i18n: vi18n,
    alt: obj({ src: dzi, label: str(), i18n: vi18n }, { req: ['src'] }),
    overlays: arr(obj({ kind: oneOf(['dzi', 'barriers']), src: file, from: str({ re: ID }), label: str(), i18n: vi18n }, { req: ['kind'], ...B })),
    insets: arr(obj({ id: str({ re: ID }), node: idRef, src: dzi, bounds: unit4, px: size }, { req: ['id', 'src', 'bounds', 'px'], ...B })) }, { req: ['kind', 'src'], ...B }),
  image: obj({ kind: oneOf(['image']), open, src: pic, media: str({ re: ID }), extent: size, regions, home, variants: dict(ID, pic), credit: str(), i18n: vi18n }, { req: ['kind'], ...B }),   // `src` or `media` (K-R101): the cross check drops an image view with neither
  schematic: obj({ kind: oneOf(['schematic']), open, layout: oneOf(['tree', 'radial', 'grid', 'list']), depth: num({ int: true, min: 1, max: 6 }) }, { req: ['kind'], ...B }),
  model3d: obj({ kind: oneOf(['model3d']), open, manifest: str({ re: re(`^(?=.*manifest\\.json$)${FILE}$`) }), regions, credit: str(), i18n: vi18n }, { req: ['kind'], ...B }),
};
const view = (v, p, x) => (isObj(v) && typeof v.kind === 'string' && Object.hasOwn(VIEWS, v.kind) ? VIEWS[v.kind](v, p, x) : bad(x, p, 'kind', v?.kind));
export const viewsBlock = block(dict(ID, view), 'object');

// ---- media (K-R101) ----
/** A `media.*.src`: path, data URL (at most 3 MB decoded) or https address; the page re-checks it with pack-media.mjs before use. A bad value drops the item with one problem. */
const mediaSrc = (v, p, x) => {
  const k = typeof v === 'string' ? srcKind(v) : null;
  if (typeof v !== 'string') return bad(x, p, 'type', 'string');
  if (k === null) return bad(x, p, 'pattern', v.slice(0, 40));
  return k === 'data' && decodedBytes(v) > MAX_PICTURE ? bad(x, p, 'limit-media', decodedBytes(v)) : v;
};
const MEDIA = dict(ID, obj({ src: mediaSrc, w: num({ int: true, min: 1, max: 65535 }), h: num({ int: true, min: 1, max: 65535 }), note: str(), i18n: i18n(['note']), credit: str() }, { req: ['src'], ext: 'b' }));
export const mediaBlock = block((v, p, x) => {
  const r = MEDIA(v, p, x); if (r === DROP) return r;
  const ids = Object.keys(r);
  if (ids.length > MAX_ITEMS) { bad(x, p, 'too-many', ids.length); return Object.fromEntries(ids.slice(0, MAX_ITEMS).map(k => [k, r[k]])); }
  return r;
}, 'object');

// ---- vars, entities, items, events, layers, ui, llm ----
const vpath = str({ re: re('^[^.\\n][^\\n]{0,79}$') });
const period = obj({ id: str({ re: re('^[a-z][a-z0-9_]{0,31}$') }), label: str({ min: 1 }), i18n: i18n(['label']), start: str({ re: re('^([01][0-9]|2[0-3]):[0-5][0-9]$') }),
  words: arr(str({ re: NL(40) })), dark: bool }, { req: ['id', 'start'], ...B });
export const varsBlock = block(obj({ location: vpath, time: vpath, date: vpath, period: vpath, outfit: vpath, reputation: vpath, inventory: vpath, periods: arr(period, { min: 1, max: 12 }),
  header: obj({ tag: str({ re: re('^[A-Za-z][A-Za-z0-9_-]{0,31}$') }), sep: str({ re: re('^[^<\\n]{1,8}$') }), fields: arr(oneOf(['place', 'date', 'time']), { min: 1, max: 3 }) }, { req: ['tag', 'fields'] }) }, B), 'object');

const rl = label(40), n40 = str({ re: NL(40) }), step = obj({ label: rl, i18n: i18n(['label']), up_to: num(), match: arr(n40) }, { req: ['label'], ...B });
const field = obj({ field: str({ min: 1, re: NL(40) }), label: rl, i18n: i18n(['label']), kind: oneOf(['text', 'gauge', 'ladder', 'tag']), min: num(), max: num(),
  ladder: arr(step, { min: 1, max: 20 }), scan: bool, show: oneOf(['subtitle', 'chip', 'detail', 'hidden']) }, { req: ['field', 'kind'], ...B });
const group = obj({ id: str({ re: ID }), label: rl, i18n: i18n(['label']),
  source: obj({ mvu: vpath, name: n40, place: n40, with: n40, present: bool, tags: bool }),
  fallback: arr(obj({ name: n40, alias: arr(n40), node: idRef, values: (v, p, x) => (isObj(v) ? v : bad(x, p, 'type', 'object')) }, { req: ['name'], ...B }), { max: 200 }) }, { req: ['id'], ...B });
/** reserved = storage-key prefixes the pack may not use (K-R43); `spatial` is always reserved. */
export const entitiesBlock = reserved => {
  const pre = ['spatial', ...reserved.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))].join('|');
  const require = (v, p, x) => (Array.isArray(v) ? arr(str({ min: 1 }))(v, p, x) : dict(re('^[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)+(/[A-Za-z0-9_.~%/-]*)?$', 'i'), arr(str({ min: 1 })))(v, p, x)), deny = arr(str({ min: 1 }));
  const gseg = str({ re: re('^[^.\\n]{1,40}$') });   // K-R106: the media source (a card-script table + the tag grammar slots)
  const gallery = obj({ id: str({ re: ID }), from: oneOf(['card-script']), path: str({ re: re('^[^.\\n]{1,40}(\\.[^.\\n]{1,40}){0,7}$') }), name: gseg, cover: gseg, sets: gseg,
    tag: obj({ fields: arr(oneOf(['name', 'category', 'number']), { min: 3, max: 3 }), open: str({ re: re('^[^\\s\\p{L}\\p{N}]$', 'u') }), close: str({ re: re('^[^\\s\\p{L}\\p{N}]$', 'u') }),
      categories: arr(str({ re: NL(20) }), { min: 1, max: 12 }), digits: num({ int: true, min: 1, max: 6 }) }, { req: ['categories'] }), require, deny }, { req: ['from', 'path', 'name', 'sets', 'tag'], ...B });
  const avatar = obj({ from: arr(oneOf(['card-script', 'card-storage', 'imagegen'])),
    hosts: arr(str({ re: re('^[a-z0-9-]+(\\.[a-z0-9-]+)+(/[A-Za-z0-9_.~%/-]*)?$') })), require, deny,
    storage: obj({ index: str({ re: re(`^(?!${pre})[^\\n]{1,80}$`) }), per_name: str({ re: re(`^(?!${pre})[^\\n]*\\{name\\}[^\\n]*$`) }) }) }, B);
  return block(obj({ groups: arr(group), fields: arr(field), avatar, gallery }, B), 'object');
};

const row = obj({ id: str({ re: re('^[a-z][a-z0-9_]{0,39}$') }), name: str({ re: NL(60) }), node: idRef, hidden: str({ re: NL(60) }), note: str({ re: NL(200) }),
  dc: num({ int: true, min: 1, max: 30 }), qty: num({ int: true, min: 1, max: 999 }) }, { req: ['name', 'node'], ...B });
const n20 = arr(str({ re: NL(20) }));
export const itemsBlock = block(obj({ stash: arr(row, { max: 200 }), pickup: dict(LANG, obj({ verbs: n20, verbs_strict: n20, verbs_off: n20, not_items: n20 }, B)) }, B), 'object');

const eid = str({ re: re('^[a-z][a-z0-9_]{0,31}$') }), color = str({ re: HEX }), l30 = label(30);
const life = obj({ live: num({ int: true, min: 1, max: 200 }), after: num({ int: true, min: 1, max: 400 }), fade: num({ int: true, min: 1, max: 800 }),
  merge: num({ int: true, min: 0, max: 200 }), per_msg: num({ int: true, min: 1, max: 10 }) });
export const eventsBlock = block(obj({
  groups: arr(obj({ id: eid, label: l30, i18n: i18n(['label']), color, shape: oneOf(['hex', 'circle', 'square', 'penta', 'diamond', 'octa', 'tri-down', 'tri', 'ring']) }, { req: ['id', 'label', 'color'], ...B }), { min: 1 }),
  types: dict(re('^[a-z][a-z0-9_]{0,31}$'), obj({ label: l30, i18n: i18n(['label']), group: eid, alias: arr(str({ re: NL(30) })), icon: str({ re: re('^[^\\s]{1,2}$') }),
    color, source: str({ re: NL(20) }), rare: num({ int: true, min: 1, max: 4 }), fx: eid, life, inject: bool }, { req: ['label', 'group'], ...B })),
  fx_presets: dict(re('^[a-z][a-z0-9_]{0,31}$'), obj({ block: oneOf(['none', 'glitch', 'flash', 'shake', 'tint', 'pulse']), intensity: num({ min: 0, max: 1 }), color,
    seconds: (v, p, x) => (typeof v === 'number' && v > 0 && v <= 30 ? v : bad(x, p, 'range', v)) }, { req: ['block'], ...B })),
  levels: arr(obj({ value: num({ int: true, min: 0, max: 3 }), label: l30, i18n: i18n(['label']) }, { req: ['value', 'label'], ...B }), { min: 1, max: 4 }),
  closed: arr(str({ re: NL(30) })), examples: arr(str({ min: 1 })), life,
}, B), 'object');

export { layersBlock } from './layer-spec.mjs';   // K-R79: the layers block is validated by core/layer-spec.mjs (normLayer)

/** K-R107: the transit block, a relative path (left for resolveBlocks) or the inline value; core/transit-spec.mjs normTransit heals it and each problem lands in the bad() channel. validate2 re-runs it with the pack's node and view ids. */
export const transitBlock = (v, p, x) => {
  if (typeof v === 'string') return str({ re: PATH_RE })(v, p, x);
  if (!isObj(v)) return bad(x, p, 'type', 'object');
  const { transit, problems } = normTransit(v);
  for (const q of problems) x.problems.push({ code: q.code, path: q.path ? `${p}.${q.path}` : p, ...(q.id !== undefined ? { detail: q.id } : {}) });
  return transit || DROP;
};

export const TERM = '(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla)\\([0-9., %/-]{1,40}\\)|-?[0-9]{0,4}\\.?[0-9]{1,4}(px|rem|em|%|vh|vw)?|[a-z][a-z-]{0,23}|var\\(--[a-z0-9-]{1,40}\\))';
const TOKEN_NAME = re('^--(accent|ink|bg|surface|line|muted|gold|ok|alert|on|map|glow|focus|r|fs)(-[a-z0-9-]{1,30})?$');
const GROUP = `${TERM}( ${TERM}){0,3}`;
const TOKEN_VALUE = re(`^${GROUP}$`), GLOW_VALUE = re(`^${GROUP}(, ?${GROUP}){0,2}$`);   // K-R70: a --glow* value may be a comma list of at most 3 groups
const tokenOk = (name, v, widen) => typeof name === 'string' && typeof v === 'string' && v.length <= 200 && TOKEN_NAME.test(name)
  && (widen && name.startsWith('--glow') ? GLOW_VALUE : TOKEN_VALUE).test(v);
/** Run-time re-check of pack values that reach a style, attribute or URL (K-R64): each returns the value when it matches the exact schema pattern, else null. */
export const recheck = {
  hex: v => (typeof v === 'string' && HEX.test(v) ? v : null),
  id: v => (typeof v === 'string' && ID.test(v) ? v : null),
  tokenName: v => (typeof v === 'string' && TOKEN_NAME.test(v) ? v : null),   // a kernel colour token name (K-R58)
  token: (name, v) => (tokenOk(name, v, true) ? v : null),   // the K-R58 name list and value grammar, with the K-R70 glow widening
};
const tokenDict = widen => (v, p, x) => {   // a token name -> value table; a bad name or value drops that entry
  if (!isObj(v)) return bad(x, p, 'type', 'object');
  const out = {};
  for (const [k, e] of Object.entries(v)) {
    if (!TOKEN_NAME.test(k)) { bad(x, `${p}.${k}`, 'key', k); continue; }
    if (!tokenOk(k, e, widen)) { bad(x, `${p}.${k}`, typeof e === 'string' ? 'pattern' : 'type', e); continue; }
    out[k] = e;
  }
  return out;
};
const viewTheme = dict(ID, obj({ tokens: tokenDict(true), light: tokenDict(true) }));   // K-R70
export const uiBlock = block(obj({
  start: idRef, tabs: arr(oneOf(['places', 'events', 'characters', 'items', 'legend'])),
  strings: dict(LANG, dict(re('^[a-z][a-z0-9_.]{0,63}$'), str())),
  theme: obj({ accent: str({ re: HEX }), tokens: tokenDict(false), views: viewTheme, chrome: obj({ accent: str({ re: HEX }), onAccent: str({ re: HEX }) }) }),   // K-R70: chrome = the pack-wide chrome accent; views = map-space only
  legend: arr(obj({ type: str({ re: re('^[a-z][a-z0-9_-]{0,31}$') }), label: str({ min: 1 }), desc: str(), i18n: (v, p, x) => (isObj(v) ? v : bad(x, p, 'type', 'object')), icon: str({ re: re('^[a-z][a-z0-9-]{0,31}$') }) }, { req: ['type'], ...B })),
  levels: dict(ID, (v, p, x) => (Array.isArray(v) ? v.map((e, i) => idRef(e, `${p}[${i}]`, x)).filter(e => e !== DROP) : bad(x, p, 'type', 'array'))),
}, B), 'object');

const tpl = str({ min: 1, re: NL(400) });
export const llmBlock = block(obj({
  templates: dict(LANG, obj({ tag: str({ re: NL(30) }), events: tpl, event_item: tpl, state: tpl, custom: tpl, route_plan: tpl, route_leg: tpl, route_danger: tpl }, B)),
  worldbook: obj({ book: str({ re: NL(40) }), entries: arr(obj({ id: str({ re: ID }), name: str({ min: 1 }), content: str({ min: 1 }),
    keys: arr(str({ re: re('^(?!/.*/[a-z]*$)[^\\n]{1,80}$') })), enabled: bool }, { req: ['id', 'name', 'content'], ...B })) }),
}, B), 'object');

// ---- manifest scalars ----
const credit = obj({ name: str({ min: 1 }), role: str(), license: str(), url: str({ re: re('^https://') }) }, { req: ['name'] });
const lexWords = arr(str({ re: NL(80) }));
export const MANIFEST = {
  $schema: str(), id: str({ re: re('^[a-z][a-z0-9_-]{1,31}$') }), schema: oneOf([2]), title: label(80), lang: str({ re: LANG }), version: str({ re: NL(32) }),
  i18n: dict(LANG, obj({ title: str({ min: 1 }) })),
  match: obj({ card: obj({ name: lexWords, creator: lexWords, tags: lexWords }), worldbook: lexWords }, B),
  credits: obj({ card: obj({ name: str(), creator: str(), version: str(), url: str({ re: re('^https://') }) }), pack: arr(credit), assets: arr(credit) }, { ext: '_' }),
  legacy: obj({ chat_var: str({ re: re('^[A-Za-z_][A-Za-z0-9_]{0,31}$') }), storage_prefix: str({ re: re('^[A-Za-z][A-Za-z0-9_.:-]{0,31}$') }),
    worldbook_marker: str({ re: re('^[a-z][a-z0-9_]{0,15}$') }), worldbook_book: str({ min: 1 }), protocol_prefix: str({ re: re('^[a-z][a-z0-9-]{0,23}:$') }),
    event_attr: str({ re: re('^data-[a-z][a-z0-9-]{0,31}$') }), write: oneOf(['legacy', 'new']) }, { ext: '_' }),
  features: dict(/^/, bool),
  lexicon: dict(LANG, obj({ to: lexWords, from: lexWords, articles: lexWords, suffixes: lexWords, present: lexWords, head: oneOf(['first', 'last']),
    fields: dict(re('^(location|time|period|date|outfit|reputation|name)$'), lexWords) }, { ext: '_' })),
  cdn: obj({ repo: str({ re: re('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') }), npm: str({ re: re('^(?!.*\\.\\.)[a-z0-9@][a-z0-9@/._-]{0,63}$') }) }),
};
export const BLOCKS = ['nodes', 'views', 'vars', 'entities', 'items', 'events', 'layers', 'ui', 'llm', 'media', 'transit'];
