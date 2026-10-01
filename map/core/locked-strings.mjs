// Texts a pack may not override (docs/ui-refactor.md §2.7, S7-1): the AI advisor's consent wording, the health reasons, the cost lines and the disclaimer. The viewer's lookup skips a pack's
// `strings` for these keys and the self-check lists one line per ignored key; `check_pack` reports them as an error. Pure.
const LOCKED = [/^fc\.nav\.consent/, /^fc\.reason\./, /^fc\.[A-Za-z]+\.cost$/, /^lic\.disclaimer$/, /^s\.lic_disc_v$/];
/** isLocked(key) -> true when a pack may not change this text (a `key@en` variant counts as its base key) */
export const isLocked = key => { const k = String(key).replace(/@en$/, ''); return LOCKED.some(re => re.test(k)); };
/** ignoredKeys(strings) -> the locked keys a pack's `strings` tried to set (base keys, each once, sorted) */
export const ignoredKeys = strings => [...new Set(Object.keys(strings && typeof strings === 'object' ? strings : {}).filter(isLocked).map(k => k.replace(/@en$/, '')))].sort();
/** lookup(dict, strings, lang, key) -> the pack's text first (English: `key@en`, then `key`), unless the key is locked or the pack text is empty; else the core dictionary; else the key */
export function lookup(dict, strings, lang, key) {
  const s = strings && typeof strings === 'object' && !isLocked(key) ? strings : null, o = s && (lang === 'en' ? s[key + '@en'] ?? s[key] : s[key]);
  return o != null && o !== '' ? o : dict?.[key] ?? key;
}
