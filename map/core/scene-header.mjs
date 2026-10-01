// Scene header and the place of one floor (docs/kernel-schema.md K-R105). Pure, no regular expression reads the text.
//   headerSpec(h)                          a pack's `vars.header` -> { tag, sep, fields } | null (bad shape = no header)
//   parseHeader(text, spec)                the last `<tag>…</tag>` block of a floor read by the spec -> { place?, date?, time? } | null
//   patchWrites(raw, path)                 does a variable patch inside this floor's text write the dot path `path`?
//   pickPlace({ mvu, raw, spec, path, resolves })  -> { place, source }  source: 'patch' | 'header' | 'mvu' | 'none'
// Precedence of one floor's place: the card variable written by THIS floor's patch, then this floor's header place when it
// resolves to a node, then the variable carried over from earlier floors. (Older place tags stay the bridge's later fallbacks.)

export const FIELDS = ['place', 'date', 'time'];
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const idChar = c => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '-';
export const validTag = t => typeof t === 'string' && t.length >= 1 && t.length <= 32 && [...t].every(idChar) && !(t[0] >= '0' && t[0] <= '9') && t[0] !== '-';

export function headerSpec(h) {
  if (!isObj(h) || !validTag(h.tag) || !Array.isArray(h.fields) || !h.fields.length || h.fields.length > FIELDS.length) return null;
  if (h.fields.some((f, i) => !FIELDS.includes(f) || h.fields.indexOf(f) !== i) || !h.fields.includes('place')) return null;
  const sep = h.sep === undefined ? '·' : h.sep;
  if (typeof sep !== 'string' || sep.length < 1 || sep.length > 8 || sep.includes('<') || sep.includes('\n')) return null;
  return { tag: h.tag, sep, fields: [...h.fields] };
}

/** The last block `<tag>…</tag>` (an opening tag may carry attributes) of the text, cut at the separator; surplus parts are folded into the place. */
export function parseHeader(text, spec) {
  const s = headerSpec(spec); if (!s || typeof text !== 'string') return null;
  const open = '<' + s.tag, close = '</' + s.tag + '>';
  let from = text.length, body = null;
  while (from > 0) {
    const a = text.lastIndexOf(open, from - 1); if (a < 0) break;
    from = a;
    const after = text[a + open.length];
    if (after !== '>' && after !== ' ' && after !== '\t' && after !== '\n') continue;   // `<timeline>` is not `<time>`
    const gt = text.indexOf('>', a + open.length); if (gt < 0) continue;
    const e = text.indexOf(close, gt + 1); if (e < 0) continue;
    body = text.slice(gt + 1, e); break;
  }
  if (body === null || body.includes('<' + s.tag)) return null;
  const parts = body.split(s.sep).map(x => x.trim()), out = {}, p = s.fields.indexOf('place'), after = s.fields.length - p - 1;
  if (parts.length >= s.fields.length) {   // a place may itself contain the separator: the surplus parts belong to it; the fields around it are counted from each end
    s.fields.forEach((f, i) => { if (i < p) out[f] = parts[i]; else if (i > p) out[f] = parts[parts.length - (s.fields.length - i)]; });
    out.place = parts.slice(p, parts.length - after).join(s.sep).trim();
  } else s.fields.forEach((f, i) => { if (parts[i]) out[f] = parts[i]; });
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out.place ? out : null;
}

/** JSON-pointer spelling of a dot path: `a.b` -> `/a/b`. */
const pointer = path => '/' + String(path).split('.').join('/');
/** Variable-patch blocks (`<UpdateVariable>`, `<JSONPatch>`) of the text that name the path as a JSON-pointer string. */
export function patchWrites(raw, path) {
  if (typeof raw !== 'string' || !path) return false;
  const want = ['"' + pointer(path) + '"', "'" + pointer(path) + "'"];
  for (const tag of ['UpdateVariable', 'JSONPatch']) {
    for (let at = raw.indexOf('<' + tag); at >= 0; at = raw.indexOf('<' + tag, at + 1)) {
      const e = raw.indexOf('</' + tag + '>', at), blk = raw.slice(at, e < 0 ? raw.length : e);
      if (want.some(w => blk.includes(w))) return true;
    }
  }
  return false;
}

/** One floor's place. mvu = the card variable's value for that floor; raw = the floor's text; resolves(place) = does it name a node. */
export function pickPlace({ mvu, raw, spec, path, resolves } = {}) {
  const m = typeof mvu === 'string' ? mvu : '', s = headerSpec(spec);
  if (!s) return { place: m, source: m.trim() ? 'mvu' : 'none' };
  if (m.trim() && patchWrites(raw, path)) return { place: m, source: 'patch' };
  const h = parseHeader(raw, s)?.place;
  if (h && typeof resolves === 'function') { let ok = false; try { ok = !!resolves(h); } catch (e) {} if (ok) return { place: h, source: 'header' }; }
  return { place: m, source: m.trim() ? 'mvu' : 'none' };
}
