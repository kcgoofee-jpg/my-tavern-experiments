// The few texts the host side prints (the map's name in the host's UI, the imported script's name, the "new events" toast) come from the pack: its manifest `strings`
// (`key@en` first in English, then `key`), else a neutral default. Values are plain text: callers put them in with textContent. Pure; no globals.
//   hostStr(manifest, key, lang, fallback?) -> string          manifest = the pack manifest (object) or null while it is still loading
// Keys: app.name (the map's name), app.short (the same in a one-line info text), app.script (the imported script's name), ev.toast (the toast for new events), nav.toast (the title of the AI advisor's toast).
export const DEFAULTS = {
  zh: { 'app.name': '空间地图', 'app.short': '空间地图', 'app.script': '【地图】空间地图', 'ev.toast': '有新事态', 'nav.toast': 'AI 参谋' },
  en: { 'app.name': 'Spatial Map', 'app.short': 'Spatial map', 'app.script': '[Map] Spatial Map', 'ev.toast': 'New events', 'nav.toast': 'AI advisor' },
};
export function hostStr(manifest, key, lang = 'zh', fallback) {
  const en = lang === 'en', s = manifest && typeof manifest === 'object' && manifest.strings && typeof manifest.strings === 'object' ? manifest.strings : null;
  const v = s ? (en ? s[key + '@en'] ?? s[key] : s[key]) : undefined;
  if (typeof v === 'string' && v) return v;
  return fallback ?? DEFAULTS[en ? 'en' : 'zh'][key] ?? key;
}
