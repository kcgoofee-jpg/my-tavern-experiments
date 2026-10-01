// The local prop pack (docs/layers-schema.md §11, K-R88, E-03): the pure rules for the files a user adds on this device (3D props and icons, never uploaded).
// sniff(bytes, name) tells the type from the bytes (glb, png, webp, svg); checkProp({ type, bytes, text }) applies the technical limits (size, svg refusals); propId(name, existing)
// makes an ASCII id; normPlacement(p) heals one placement { prop, map, at }. Technical validation only: nothing here looks at what a picture or model shows. Pure: no DOM, no storage.
export const PROP_LIMITS = Object.freeze({ glb: 8 << 20, image: 1 << 20, svg: 262144, count: 64, total: 64 << 20, placements: 200 });
export const PROP_TYPES = Object.freeze(['glb', 'png', 'webp', 'svg']);
const ID = /^[A-Za-z0-9_-]{1,64}$/, PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ascii = (b, at, s) => [...s].every((c, i) => b[at + i] === c.charCodeAt(0));

/** sniff(bytes, name) -> 'glb' | 'png' | 'webp' | 'svg' | null: glb = `glTF` and version 2; png = the 8-byte signature; webp = `RIFF` .. `WEBP`; svg = text with an `<svg` root (after an optional BOM, xml declaration, comments, doctype). */
export function sniff(bytes, name = '') {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b.length >= 12 && ascii(b, 0, 'glTF') && (b[4] | b[5] << 8 | b[6] << 16 | b[7] << 24) === 2) return 'glb';
  if (b.length >= 8 && PNG.every((v, i) => b[i] === v)) return 'png';
  if (b.length >= 12 && ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) return 'webp';
  if (b.length >= 5 && (!name || /\.svg$/i.test(name))) {
    let t = ''; try { t = new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(0, 2048)); } catch (e) { return null; }
    if (/^﻿?\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(t)) return 'svg';
  }
  return null;
}
/** checkProp({ type, bytes, text? }) -> { ok, problems }: `bytes` = the size in bytes; for an svg `text` is its whole text, refused when it holds a script, a foreignObject, an on-handler or a javascript: link. */
export function checkProp({ type, bytes, text } = {}) {
  const problems = [];
  if (!PROP_TYPES.includes(type)) return { ok: false, problems: ['prop-type'] };
  const cap = type === 'glb' ? PROP_LIMITS.glb : type === 'svg' ? PROP_LIMITS.svg : PROP_LIMITS.image;
  if (!Number.isFinite(bytes) || bytes < 1 || bytes > cap) problems.push('prop-size');
  if (type === 'svg') {
    const t = typeof text === 'string' ? text : '';
    if (!t) problems.push('svg-text');
    if (/<script/i.test(t)) problems.push('svg-script');
    if (/<foreignObject/i.test(t)) problems.push('svg-foreign');
    if (/[\s"'/]on[a-z]+\s*=/i.test(t)) problems.push('svg-handler');
    if (/javascript:/i.test(t)) problems.push('svg-link');
  }
  return { ok: !problems.length, problems };
}
/** propId(name, existing) -> an ASCII id (letters, digits, `_`, `-`; at most 32) made from the name and unique among `existing`; `p_<n>` when the name has none. */
export function propId(name, existing = []) {
  const taken = new Set(existing), base = String(name ?? '').normalize('NFKD').replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  if (base && !taken.has(base)) return base;
  if (base) { for (let n = 2; n < 1000; n++) { const id = `${base.slice(0, 28)}-${n}`; if (!taken.has(id)) return id; } }
  for (let n = 1; ; n++) if (!taken.has(`p_${n}`)) return `p_${n}`;
}
/** normPlacement(p) -> { prop, map, at: [x, y] } | null: x and y are fractions of the view's width and height (0..1). */
export function normPlacement(p) {
  if (!p || typeof p !== 'object' || typeof p.prop !== 'string' || !ID.test(p.prop) || typeof p.map !== 'string' || !ID.test(p.map)) return null;
  const a = p.at, ok = Array.isArray(a) && a.length === 2 && a.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1);
  return ok ? { prop: p.prop, map: p.map, at: [a[0], a[1]] } : null;
}
/** normPlacements(list) -> the healed list (bad rows dropped), at most 200 (the newest kept). */
export const normPlacements = list => (Array.isArray(list) ? list.map(normPlacement).filter(Boolean).slice(-PROP_LIMITS.placements) : []);
