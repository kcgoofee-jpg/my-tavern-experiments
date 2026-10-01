// Pack-driven theme (docs/kernel-schema.md K-R70, amended S7-2 U-04 B'): ONE chrome token set for every pack and view (it changes only with light / dark and the optional pack-wide
// `ui.theme.chrome` accent); the pack's per-view `ui.theme.views` feed only the map-space tokens `--map-*` (pins, routes, tint, selection ring, labels).
// Old per-view values map onto them (MAP_OF); chrome names in a view (surface, ink, line, ...) are dropped. Nothing here names a view: ids and tokens come from the pack and are
// re-checked at run time (K-R64, core/pack-v2-spec.mjs recheck); text goes in through textContent.
// `body[data-glow="1"]` marks a view whose tokens define --glow-text; map-switch.mjs calls syncGlow when the map changes.
import { recheck } from '../core/pack-v2-spec.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { esc } from './dom-helpers.mjs';

let views = {};
/** Per-view token -> the map-space tokens it feeds. A `--map-*` name passes through; every other name is chrome and is dropped. */
export const MAP_OF = { '--accent': ['--map-accent', '--map-pin', '--map-select'], '--accent-2': ['--map-route'], '--bg': ['--map-tint'], '--glow': ['--map-glow'], '--glow-text': ['--map-glow-text'] };
const rules = (sel, tokens) => {
  const d = new Map();
  for (const [k, v] of Object.entries(tokens && typeof tokens === 'object' ? tokens : {})) {
    if (recheck.token(k, v) === null) continue;
    for (const t of k.startsWith('--map-') ? [k] : MAP_OF[k] || []) d.set(t, v);
  }
  return d.size ? `${sel} { ${[...d].map(([k, v]) => `${k}: ${v};`).join(' ')} }` : '';
};
const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
/** The text colour for a filled accent when the pack gives none: the better of the dark chrome background and white by contrast. */
export const onAccentFor = accent => (ratio(accent, '#101418') >= ratio(accent, '#ffffff') ? '#101418' : '#ffffff');
/** The pack-wide chrome accent rule (one value for both themes) or ''. */
export function chromeCss(ui) {
  const c = ui?.theme?.chrome, accent = recheck.hex(c?.accent);
  if (!accent) return '';
  return `:root, :root.light { --accent: ${accent}; --on-accent: ${recheck.hex(c.onAccent) || onAccentFor(accent)}; }`;
}
/** ui (the runtime tree's ui block or undefined) -> the CSS text; bad ids and tokens are dropped. */
export function themeCss(ui) {
  const out = [chromeCss(ui)];
  for (const [id, v] of Object.entries(ui?.theme?.views && typeof ui.theme.views === 'object' ? ui.theme.views : {})) {
    if (recheck.id(id) === null || !v || typeof v !== 'object') continue;
    out.push(rules(`[data-map="${id}"]`, v.tokens), rules(`.light [data-map="${id}"], .light[data-map="${id}"]`, v.light));
  }
  return out.filter(Boolean).join('\n');
}
/** body[data-glow]: "1" while the map `id` has a --glow-text token of its own. */
export function syncGlow(id, doc = document) {
  const on = recheck.id(id) !== null && Object.hasOwn(views[id]?.tokens || {}, '--glow-text') && recheck.token('--glow-text', views[id].tokens['--glow-text']) !== null;
  if (on) doc.body.dataset.glow = '1'; else delete doc.body.dataset.glow;
}

// Day / night glass (U-02 C, docs/ui-refactor.md 2.3): with theme auto and the option on, the last clock band sets html.light (dawn, day -> light; dusk, night -> dark; an unknown band keeps the
// system choice). The class toggles only when the mode actually changes; the option is ignored under prefers-contrast: more.
export const GLASS_CLOCK_KEY = 'edenMapGlassClock';
const BANDS = { dawn: 'light', day: 'light', dusk: 'dark', night: 'dark' };
/** Pure: 'light' | 'dark' | null (null = follow the system choice). */
export const glassMode = ({ on, theme, contrast, band }) => (on && theme === 'auto' && !contrast && Object.hasOwn(BANDS, band) ? BANDS[band] : null);
const bandOf = c => (c && typeof c === 'object' ? (typeof c.tod === 'string' && c.tod) || (c.night ? 'night' : 'day') : '');
let lastClock = null;
/** Re-evaluate from the last clock message (a clock message, the option switch or the theme choice changed). */
export function syncGlassClock(clock = lastClock, w = window) {
  if (clock) lastClock = clock;
  const mode = glassMode({ on: w.LocalStore?.get(GLASS_CLOCK_KEY) === '1', theme: w.__theme, contrast: !!w.matchMedia?.('(prefers-contrast: more)').matches, band: bandOf(lastClock) });
  if ((w.__glassClock || null) === mode) return mode;
  w.__glassClock = mode; w.__applyTheme?.(); return mode;
}
/** The 地图与图层 page row for the option (registered section; the text says it overrides the system light / dark choice). */
export function initGlassClockRow(doc = document, w = window) {
  if (doc.getElementById('glassClockBox')) return;
  const box = doc.createElement('div'); box.id = 'glassClockBox';
  box.innerHTML = `<label class="row"><span>${esc(uiTextOr('s.glass_clock', '昼夜界面'))}</span><input type="checkbox" role="switch" id="optGlassClock"></label><small>${esc(uiTextOr('s.glass_clock_d', '界面按游戏内时间变亮 / 变暗（清晨、白天亮，黄昏、夜间暗），会盖过系统的亮 / 暗设置；主题选「跟随系统」时才起作用'))}</small>`;
  const sw = box.querySelector('input'); sw.checked = w.LocalStore?.get(GLASS_CLOCK_KEY) === '1';
  sw.addEventListener('change', () => { w.LocalStore?.set(GLASS_CLOCK_KEY, sw.checked ? '1' : '0'); syncGlassClock(); });
  w.SettingsApi?.registerSection('map', box, { order: 62 });
}

/** Called once the runtime tree is loaded (app/boot.mjs); a later call replaces the style. */
export function applyTheme(ui, doc = document) {
  views = ui?.theme?.views && typeof ui.theme.views === 'object' ? ui.theme.views : {};
  let el = doc.getElementById('packTheme');
  const css = themeCss(ui);
  if (!css) { el?.remove(); syncGlow(doc.body?.dataset.map, doc); return; }
  if (!el) { el = doc.createElement('style'); el.id = 'packTheme'; doc.head.appendChild(el); }
  el.textContent = css;
  syncGlow(doc.body?.dataset.map, doc);
}
