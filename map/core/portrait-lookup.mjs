// The card-script portrait shown for a person (I-22). Pure.
//   viewerUrlOk(u)            the shape the viewer will put in an <img>: https, an image file, no query or fragment. The pack's own rule
//                             (core/profile.mjs portraitOk, K-R43: hosts, require, deny) already ran on the host before the table was sent,
//                             so the viewer does not repeat a host list: it only refuses what is not an image address.
//   portraitFor(table, name)  the table's address for a name: the name as written, its first segment (before the middle dot), or the one
//                             table key whose first segment equals the name's first segment (a roster row that spells only the short name).
const SEG = /[·・]/;
const first = n => String(n ?? '').split(SEG)[0].trim();
export const viewerUrlOk = u => typeof u === 'string' && u.startsWith('https://') && !u.includes('?') && !u.includes('#') && /\.(png|jpe?g|webp)$/i.test(u);
export function portraitFor(table, name) {
  const t = table && typeof table === 'object' ? table : {}, n = String(name ?? '').trim(); if (!n) return '';
  const hit = k => (viewerUrlOk(t[k]) ? t[k] : '');
  const direct = hit(n) || hit(first(n)); if (direct) return direct;
  const same = Object.keys(t).filter(k => first(k) === first(n) && viewerUrlOk(t[k]));
  return same.length === 1 ? t[same[0]] : '';
}
