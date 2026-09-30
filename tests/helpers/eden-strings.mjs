// What the viewer's t() sees for the first pack: the core dictionary with the pack manifest's `strings` laid over it
// (the same lookup as map/app/i18n.mjs `t`: in English `key@en` first, then `key`; a pack string that is empty falls through to the dictionary).
// Tests that pinned a first-pack wording through the dictionary read it here, so the expected value stays the old one.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const J = p => JSON.parse(fs.readFileSync(ROOT + p, 'utf8'));
export const packStrings = (id = 'eden') => J(`map/packs/${id}/manifest.json`).strings || {};
export const dictOf = lang => J(`map/i18n/${lang}.json`);
/** dict + strings as t() resolves them, for one language */
export function withStrings(dict, strings, lang) {
  const out = { ...dict };
  for (const k of Object.keys(strings)) {
    if (k.includes('@')) continue;
    const v = lang === 'en' ? strings[k + '@en'] ?? strings[k] : strings[k];
    if (v != null && v !== '') out[k] = v;
  }
  return out;
}
export const edenDict = lang => withStrings(dictOf(lang), packStrings('eden'), lang);
