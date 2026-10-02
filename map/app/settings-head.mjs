// The search field of Settings home lives in the sheet header, next to the title (HEADER-1): always reachable at the top, left of the close button.
// On a phone it collapses to a search icon that expands in place (the title steps aside while it is open). Only the home page has a search: the other pages hide it.
// The input itself is still built by the home page (settings-pages.mjs, id setQ); this module moves it into the header once the home page exists.
import { $, iconSvg } from './dom-helpers.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { onBuilt, onLeave, onShow } from './settings-pages.mjs';

const CSS = `#setPop .sheet-h .hq{flex:0 1 220px;min-width:0;display:flex;align-items:center;gap:var(--sp-2)}
#setPop .sheet-h .hq[hidden]{display:none}
#setPop .sheet-h #setQ{flex:1 1 auto;min-width:0;width:100%;height:36px;margin:0}
#setPop .sheet-h .hqbtn{display:none}
@media (max-width:640px){#setPop .sheet-h .hqbtn{display:inline-flex}#setPop .sheet-h #setQ{display:none}#setPop .sheet-h .hq.open{flex:1 1 auto}#setPop .sheet-h .hq.open #setQ{display:block}#setPop .sheet-h .hq.open .hqbtn{display:none}#setPop .sheet-h:has(.hq.open) #setTitle{display:none}}`;
let wrap = null, btn = null;
const small = () => matchMedia('(max-width:640px)').matches;
export function focusSearch() {
  const q = $('#setQ'); if (!q || !wrap || wrap.hidden) return false;
  if (small()) wrap.classList.add('open');
  q.focus(); return true;
}
onBuilt('home', () => {
  const q = $('#setQ'), head = $('#setPop .sheet-h'); if (!q || !head || wrap) return;
  if (!document.getElementById('setHeadCss')) { const s = document.createElement('style'); s.id = 'setHeadCss'; s.textContent = CSS; document.head.append(s); }
  wrap = document.createElement('div'); wrap.className = 'hq'; wrap.setAttribute('role', 'search');
  btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn ic hqbtn'; btn.innerHTML = iconSvg('search'); btn.setAttribute('aria-label', uiTextOr('s.search', '搜索设置')); btn.title = btn.getAttribute('aria-label'); btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', () => { wrap.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); q.focus(); });
  q.addEventListener('blur', () => { if (!q.value && small()) { wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); } });
  wrap.append(btn, q); head.insertBefore(wrap, $('#setX'));
});
onShow('home', () => { if (wrap) wrap.hidden = false; });
onLeave('home', () => { if (wrap) { wrap.hidden = true; wrap.classList.remove('open'); } });
