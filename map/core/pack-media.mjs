// Pack pictures (docs/kernel-schema.md K-R101; docs/zero-config.md §8): which `media.*.src` values a pack may carry and which of them the page may load.
// Pure: no DOM, no fetch. Three sources only (K-R64: the exact patterns are re-checked at run time, never trusted from validation alone):
//   path   a relative path under the pack base, ending in .webp / .png / .jpg / .jpeg (shipped and URL packs; no scheme, no `..`, no backslash)
//   data   data:image/(webp|png|jpeg);base64,... at most 3 MB decoded (any pack)
//   https  an https:// address with an image file type and no query string or fragment, loaded only while the "pictures from links" switch is on
// Everything else is refused. `checkMedia` -> { item, code }: `item` is the item as it may be kept (null = refused), `code` is '' | 'media-src' | 'media-size' | 'media-remote-off'
// (remote-off keeps the item so the page can show its note in place of the picture; `mediaUrl` then returns null).
export const MAX_PICTURE = 3 << 20, MAX_ITEMS = 200;
const FILE = '(?!.*\\.\\.)[A-Za-z0-9_][A-Za-z0-9_./-]*';
export const SRC = Object.freeze({
  path: new RegExp(`^${FILE}\\.(webp|png|jpe?g)$`),
  data: /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/,
  https: /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:[0-9]{1,5})?(\/[A-Za-z0-9_.~%-]+)*\/[A-Za-z0-9_.~%-]+\.(webp|png|jpe?g)$/i,
});
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

/** Size in bytes of the picture inside a data URL (the base64 text decoded); 0 when it is not one. */
export function decodedBytes(d) {
  if (typeof d !== 'string') return 0;
  const i = d.indexOf(','); if (i < 0) return 0;
  const n = d.length - i - 1, pad = d.endsWith('==') ? 2 : d.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(n * 3 / 4) - pad);
}
/** The kind of a `src` value: 'path' | 'data' | 'https' | null. */
export function srcKind(src) {
  if (typeof src !== 'string' || !src) return null;
  if (src.startsWith('data:')) return SRC.data.test(src) ? 'data' : null;
  if (src.startsWith('https://')) return SRC.https.test(src) ? 'https' : null;
  return SRC.path.test(src) ? 'path' : null;
}
/** `p` under the folder `base` (K-R64): no scheme, no absolute path, no way up, still inside the folder after URL resolution; else null. */
export function under(base, p) {
  if (typeof p !== 'string' || !p || /^[a-z][a-z0-9+.-]*:|^[/\\]|\\/i.test(p)) return null;
  const root = 'https://pack.invalid/b/';
  try { const u = new URL(p, root); return u.href.startsWith(root) && !/(^|\/)\.\.?(\/|$)/.test(p) ? base + p : null; } catch (e) { return null; }
}
/** K-R101 check of one media item: { item, code }. `base` is the folder of the pack's pictures ('' = none: a card or file pack has no paths); `remoteOn` the switch for https sources. */
export function checkMedia(item, { base = '', remoteOn = false } = {}) {
  if (!isObj(item)) return { item: null, code: 'media-src' };
  const k = srcKind(item.src);
  if (k === null) return { item: null, code: 'media-src' };
  if (k === 'data') return decodedBytes(item.src) > MAX_PICTURE ? { item: null, code: 'media-size' } : { item, code: '' };
  if (k === 'path') return base && under(base, item.src) ? { item, code: '' } : { item: null, code: 'media-src' };
  return remoteOn ? { item, code: '' } : { item, code: 'media-remote-off' };
}
/** The address the page may put in an <img> (or an image tile source) for a media item, or null (refused, no base, or an https source with the switch off). */
export function mediaUrl(item, { base = '', remoteOn = false } = {}) {
  const r = checkMedia(item, { base, remoteOn });
  if (!r.item || r.code) return null;
  return srcKind(item.src) === 'path' ? under(base, item.src) : item.src;
}
/** The pictures of a node, in its order: [{ id, item, url }] (url null = placeholder or refused). `media` is the pack's block, `ids` the node's list. */
export function nodePictures(media, ids, opts = {}) {
  const out = [];
  for (const id of Array.isArray(ids) ? ids : []) { const item = isObj(media) ? media[id] : undefined; if (isObj(item)) out.push({ id, item, url: mediaUrl(item, opts) }); }
  return out;
}
