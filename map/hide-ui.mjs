// DRAWER-1: the quiet "hide this row" control shared by the drawer's lists (events, items) — an icon-only × that shows on hover / focus (always on touch), a quiet
// "hidden N" toggle and the greyed rows it reveals, each with a restore icon. Pure markup + a click router; the owner keeps the data. A hide is an intent sent to the
// host (`eden-map:hide`), which stores it in the chat's own map variable; nothing here writes a local preference.
import { esc } from './app/dom-helpers.mjs';
import { uiTextOr } from './app/text-lookup.mjs';
const CSS_ID = 'hideUiCss';
const CSS = `
.hx{display:inline-flex;flex:none;margin-left:auto}
.hx button,.hxr button{display:inline-grid;place-items:center;width:28px;height:28px;min-height:0;padding:0;border:0;border-radius:var(--r-s,4px);background:transparent;color:var(--muted,inherit);cursor:pointer;opacity:0;transition:opacity var(--dur-1,.12s)}
li:hover>.hx button,li:focus-within>.hx button,.itrow:hover>.hx button,.itrow:focus-within>.hx button,.hx button:focus-visible,.hxr button{opacity:.8}
.hx button:hover,.hxr button:hover{background:var(--surface-2,rgba(255,255,255,.08));opacity:1;color:var(--ink,inherit)}
.hx button:focus-visible,.hxr button:focus-visible,.hidtog:focus-visible{outline:2px solid var(--focus,#63b4be);outline-offset:1px}
.hx svg,.hxr svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
@media (pointer:coarse),(max-width:640px){.hx button,.hxr button{width:44px;height:44px;opacity:.7}}
.hidtog{font:inherit;font-size:var(--fs-micro,11px);color:var(--muted,inherit);background:none;border:0;padding:var(--sp-2,4px) var(--sp-3,6px);cursor:pointer;border-radius:var(--r-s,4px);text-decoration:underline dotted;text-underline-offset:3px}
.hidtog[aria-pressed=true]{color:var(--ink-2,inherit);text-decoration-style:solid}
@media (pointer:coarse),(max-width:640px){.hidtog{min-height:44px}}
.hidrow{display:flex;align-items:center;gap:var(--sp-4,8px);padding:var(--sp-3,6px);opacity:.6;font-size:var(--fs-small,12px);color:var(--muted,inherit);list-style:none}
.hidrow span{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}
.hidrow .hxr{flex:none}`;
const ICON_X = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
const ICON_UNDO = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6.5h6a3 3 0 0 1 0 6H6M3.5 6.5l2.5-2.5M3.5 6.5L6 9"/></svg>';
export function ensureCss() { if (typeof document === 'undefined' || document.getElementById(CSS_ID)) return; const st = document.createElement('style'); st.id = CSS_ID; st.textContent = CSS; document.head.appendChild(st); }
/** the × (hide) icon button; `label` is its aria-label and tooltip, `key` rides in data-hide */
export const hideBtn = (key, label) => `<span class="hx"><button type="button" data-hide="${esc(key)}" aria-label="${esc(label)}" title="${esc(label)}">${ICON_X}</button></span>`;
/** the quiet "hidden N" toggle; empty when n is 0 */
export const hiddenToggle = (n, on) => (n ? `<button type="button" class="hidtog" data-hidtoggle aria-pressed="${on ? 'true' : 'false'}">${esc(uiTextOr('hide.n', '已隐藏 {n}', { n }))}</button>` : '');
/** one greyed row of a hidden thing with its restore icon: `html` is trusted markup (escape the parts yourself) */
export const hiddenRow = (key, html, tag = 'li') => { const t = uiTextOr('hide.restore', '恢复'); return `<${tag} class="hidrow"${tag === 'li' ? '' : ' role="listitem"'}><span>${html}</span><span class="hxr"><button type="button" data-restore="${esc(key)}" aria-label="${esc(t)}" title="${esc(t)}">${ICON_UNDO}</button></span></${tag}>`; };
/** route a click inside a pane: -> { act: 'hide' | 'restore' | 'toggle', key } or null (the click was somewhere else) */
export function route(ev) {
  const b = ev.target?.closest?.('button[data-hide],button[data-restore],button[data-hidtoggle]'); if (!b) return null;
  ev.stopPropagation();
  return b.dataset.hide !== undefined ? { act: 'hide', key: b.dataset.hide } : b.dataset.restore !== undefined ? { act: 'restore', key: b.dataset.restore } : { act: 'toggle', key: '' };
}
