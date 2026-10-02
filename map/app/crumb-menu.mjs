// The breadcrumb's last crumb as the level switcher (HEADER-1 / NAV-1, D36): a button with a chevron that opens a compact menu under it with
// the sibling levels (altitude as secondary text, the current one marked, a quiet here-mark, the event count, planned ones disabled) and,
// below a divider, the child 3D pages of the open map. The list is core/crumb-menu.mjs; this file draws it and moves focus.
// Items are `data-go` buttons: the document-level link handler (map-level-nav.mjs) does the switching. Esc closes it (escTop there).
import { mapRegistry, currentMapId } from './state.mjs';
import { $, esc, iconSvg } from './dom-helpers.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { localName } from './i18n.mjs';
import { hereRes } from './locate.mjs';
import { plugins } from './plugins.mjs';
import { childMaps, isScene, parentMap, strip } from './nodes-runtime.mjs';
import { crumbMenu, menuStep, plainTitle } from '../core/crumb-menu.mjs';

const CSS = `
#crumbs .cur{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:var(--sp-2);max-width:100%;min-height:32px;padding:0 var(--sp-3);margin:0 calc(-1 * var(--sp-3));border-radius:var(--r-s);color:inherit;font:inherit;cursor:pointer}
#crumbs .cur > span{white-space:nowrap}
#crumbs .cur .ico{width:14px;height:14px;transition:transform var(--dur-2)}
#crumbs .cur[aria-expanded=true] .ico{transform:rotate(180deg)}
#crumbs .cur:hover{background:var(--surface-2)}#crumbs .cur:focus-visible{box-shadow:var(--focus-ring)}
#crumbMenu{max-height:calc(100vh - var(--hdr,44px) - var(--sp-6));overflow-y:auto;width:auto;min-width:240px;max-width:min(360px,calc(100vw - 2 * var(--sp-4)));padding:var(--sp-2);display:flex;flex-direction:column;gap:var(--sp-1)}
#crumbMenu[hidden]{display:none}
#crumbMenu button{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:var(--sp-4);min-height:44px;padding:var(--sp-2) var(--sp-5);border-radius:var(--r-m);color:var(--ink);font:500 var(--fs-control)/1.3 var(--font-ui);cursor:pointer}
#crumbMenu button:not(:disabled):hover,#crumbMenu button:focus-visible{background:var(--surface-2)}
#crumbMenu button:focus-visible{box-shadow:var(--focus-ring)}
#crumbMenu button[aria-checked=true]{background:var(--accent-weak);box-shadow:inset 3px 0 0 var(--accent);font-weight:700}
#crumbMenu button:disabled{opacity:.45;cursor:default}
#crumbMenu .t{flex:1 1 auto;min-width:0;display:flex;flex-direction:column}
#crumbMenu .t small{margin:0;color:var(--ink-2);font:400 var(--fs-micro)/1.4 var(--font-ui)}
#crumbMenu .here{flex:none;width:8px;height:8px;box-sizing:border-box;border-radius:50%;border:1.5px solid var(--muted)}
#crumbMenu .n{flex:none;min-width:16px;height:16px;padding:0 5px;box-sizing:border-box;border-radius:var(--r-pill);background:var(--alert);color:var(--on-alert);font:700 var(--fs-micro)/16px var(--font-mono);text-align:center}
#crumbMenu hr{margin:var(--sp-2) var(--sp-3);border:0;border-top:1px solid var(--line)}
@media (max-width:640px){#crumbs b{flex:1 1 auto;display:flex;min-width:0}#crumbs .cur{flex:0 1 auto;min-width:0}#crumbs .cur > span{min-width:0;overflow:hidden;text-overflow:ellipsis}#crumbMenu{left:0!important;right:0;top:var(--hdr,44px)!important;width:auto;max-width:none;border-radius:0;border-width:0 0 1px}}`;
let menu = null, btn = null;
const T = (k, zh, v) => uiTextOr(k, zh, v);

function build() {
  if (menu) return menu;
  const st = document.createElement('style'); st.id = 'crumbMenuCss'; st.textContent = CSS; document.head.append(st);
  menu = document.createElement('div'); menu.id = 'crumbMenu'; menu.className = 'pop g2'; menu.setAttribute('role', 'menu'); menu.hidden = true;
  document.body.append(menu);
  menu.addEventListener('click', e => { const b = e.target.closest('button'); if (b && !b.disabled) close(b.dataset.go ? false : true); });
  menu.addEventListener('keydown', e => {
    const items = [...menu.querySelectorAll('button:not(:disabled)')], i = items.indexOf(document.activeElement), j = menuStep(e.key, i, items.length);
    if (j != null) { e.preventDefault(); items[j].focus(); } else if (e.key === 'Tab') close(false);
  });
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !e.target.closest('#crumbMenu, #crumbs .cur')) close(false); });
  addEventListener('resize', () => { if (!menu.hidden) place(); });
  return menu;
}
const model = () => {
  const here = hereRes($('#here').value);
  return crumbMenu({ current: currentMapId, strip, parent: parentMap, children: childMaps, isScene, planned: id => mapRegistry.maps[id]?.status === 'planned',
    hereMap: here && here.level <= 4 ? here.map : null, countOn: id => plugins.EventsView?.countOn?.(id) || 0 });
};
function item(id, o) {
  const L = mapRegistry.maps[id], sub = o.planned ? T('layers.planned', '制作中') : o.scene ? '' : localName(L.layer, 'alt');
  const nm = o.scene ? T('crumb.scene', '{title} · 3D', { title: plainTitle(localName(L, 'title')) }) : localName(L.layer);
  const aria = [nm, o.here ? T('layers.here', '当前地点在这一层') : '', o.n ? T('layers.events', `${o.n} 起未解除的事态`, { n: o.n }) : ''].filter(Boolean).join('，');
  return `<button type="button" role="${o.scene ? 'menuitem' : 'menuitemradio'}" ${o.scene ? '' : `aria-checked="${!!o.on}"`} ${o.on ? 'aria-current="page"' : `data-go="${esc(id)}"`} ${o.planned ? 'disabled' : ''} aria-label="${esc(aria)}">`
    + `<span class="t">${esc(nm)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>`
    + `${o.here ? `<i class="here" title="${esc(T('layers.here', '当前地点在这一层'))}"></i>` : ''}${o.n ? `<span class="n" title="${esc(T('layers.events', `${o.n} 起未解除的事态`, { n: o.n }))}">${o.n > 9 ? '9+' : o.n}</span>` : ''}</button>`;
}
function fill() {
  const m = model(); build();
  menu.setAttribute('aria-label', T('crumb.menu', '切换层'));
  menu.innerHTML = (m.levels.length > 1 ? m.levels.map(l => item(l.id, l)).join('') : '') + (m.levels.length && m.scenes.length ? '<hr role="separator">' : '') + m.scenes.map(s => item(s.id, { scene: true })).join('');
}
function place() { if (!btn) return; const r = btn.getBoundingClientRect(); menu.style.left = Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8)) + 'px'; }
export const isOpen = () => !!menu && !menu.hidden;
export function close(refocus) { if (!menu || menu.hidden) return false; menu.hidden = true; btn?.setAttribute('aria-expanded', 'false'); if (refocus) btn?.focus(); return true; }
function open(focus) {
  if (!btn) return; fill(); menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); place();
  if (focus) (menu.querySelector('[aria-checked=true]') || menu.querySelector('button:not(:disabled)'))?.focus();
}
/** after renderNav wrote the crumbs: turn the last crumb into the switcher when there is something to switch to; keep the menu in step with the events */
export function paintSwitcher() {
  build(); const b = $('#crumbs b'); btn = null; close(false);
  if (!b || !model().any) return;
  btn = document.createElement('button'); btn.type = 'button'; btn.className = 'cur'; btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'crumbMenu'); btn.setAttribute('aria-current', 'page');
  btn.title = T('crumb.switch', '切换层 · PageUp / PageDown'); const t = document.createElement('span'); t.textContent = b.textContent; btn.append(t); btn.insertAdjacentHTML('beforeend', iconSvg('chevD'));
  b.removeAttribute('aria-current'); b.replaceChildren(btn);
  btn.addEventListener('click', e => (isOpen() ? close(false) : open(e.detail === 0)));
  btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!isOpen()) open(true); else menu.querySelector('button:not(:disabled)')?.focus(); } });
}
/** the events or the place changed: redraw an open menu */
export function refreshMenu() { if (isOpen()) fill(); }

/** read-only view of the current level list for tests and probes (no DOM, no menu opened) */
window.CrumbMenuApi = Object.freeze({ levels: () => model().levels.map(l => ({ ...l })), scenes: () => model().scenes.map(s => ({ ...s })), isOpen });
