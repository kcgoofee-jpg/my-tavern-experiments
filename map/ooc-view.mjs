// "Nudge the AI" (D32): a small list of ready OOC sentences on the AI link page. A click puts the sentence into the host chat input through the existing compose path
// (post eden-map:compose, flagged ooc) and never sends, whatever the "map actions into chat" mode says. Wording lives in the dictionaries (ooc.tpl.<id>) and a pack may override it through its strings.
// Only shown when the map is embedded in the chat (there is no input box otherwise). Keyboard reachable: plain buttons in a labelled group.
import { esc } from './app/dom-helpers.mjs';
import { post } from './app/protocol-stamp.mjs';
import { uiTextOr } from './app/text-lookup.mjs';
import { onBuilt, placeIn } from './app/settings-pages.mjs';
import { TEMPLATE_IDS } from './core/ooc.mjs';

const embedded = () => window.top !== window;
/** the sentence of one template, in the current language (pack strings win over the dictionary) */
export const templateText = id => uiTextOr('ooc.tpl.' + id, '');
let open = false;

function build() {
  const pg = document.querySelector('#setPop .spage[data-page="ai"]'); if (!pg || !embedded()) return;
  let box = document.getElementById('oocBox');
  if (!box) {
    box = document.createElement('details'); box.id = 'oocBox'; box.className = 'ooc-box'; placeIn(pg, box, 35);
    box.addEventListener('toggle', () => { open = box.open; });
    box.addEventListener('click', ev => { const b = ev.target.closest('[data-ooc]'); if (!b) return; ev.stopPropagation(); const text = templateText(b.dataset.ooc); if (text) post({ type: 'eden-map:compose', text, ooc: true }); });
  }
  box.open = open;
  box.innerHTML = `<summary><h3>${esc(uiTextOr('ooc.title', '提醒 AI'))}</h3></summary><small>${esc(uiTextOr('ooc.hint', ''))}</small>`
    + `<div class="ooc-list" role="group" aria-label="${esc(uiTextOr('ooc.title', '提醒 AI'))}">${TEMPLATE_IDS.map(id => `<button type="button" class="btn" data-ooc="${id}" title="${esc(uiTextOr('ooc.tip', ''))}" aria-label="${esc(uiTextOr('ooc.tpl.' + id + '.label', id) + ' — ' + uiTextOr('ooc.tip', ''))}">${esc(uiTextOr('ooc.tpl.' + id + '.label', id))}</button>`).join('')}</div>`
    + `<small>${esc(uiTextOr('ooc.fix', ''))}</small>`;
}
// UI-3D-1: the same list on the map itself. One icon button in the control column (aria-label + tooltip 「提醒 AI」) opens a small menu of the same templates; a pick fills the input, never sends.
function buildMenu(dock) {
  if (!embedded() || document.getElementById('oocBtn')) return;
  const name = uiTextOr('ooc.title', '提醒 AI'), wrap = document.createElement('div'), btn = document.createElement('button'), menu = document.createElement('div');
  wrap.id = 'oocWrap'; wrap.className = 'g1'; btn.type = 'button'; btn.id = 'oocBtn'; btn.className = 'btn ic'; btn.innerHTML = window.UIIcon ? window.UIIcon.svg('nudge') : '';
  btn.setAttribute('aria-label', name); btn.title = name; btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'oocMenu');
  menu.id = 'oocMenu'; menu.className = 'g2'; menu.hidden = true; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', name);
  const shut = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  const fill = () => { menu.replaceChildren(...TEMPLATE_IDS.map(id => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.dataset.ooc = id; b.textContent = uiTextOr('ooc.tpl.' + id + '.label', id); b.title = uiTextOr('ooc.tip', ''); return b; })); };
  btn.addEventListener('click', e => { e.stopPropagation(); if (menu.hidden) { fill(); menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); menu.firstChild?.focus(); } else shut(); });
  menu.addEventListener('click', ev => { const b = ev.target.closest('[data-ooc]'); if (!b) return; ev.stopPropagation(); const text = templateText(b.dataset.ooc); if (text) post({ type: 'eden-map:compose', text, ooc: true }); shut(); btn.focus(); });
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !e.target.closest('#oocMenu, #oocBtn')) shut(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { shut(); btn.focus(); } });
  wrap.append(btn); dock.prepend(wrap); document.getElementById('stage')?.append(menu);
}
const dockNow = () => document.getElementById('dock');
if (embedded()) { if (dockNow()) buildMenu(dockNow()); else new MutationObserver((_, ob) => { if (dockNow()) { ob.disconnect(); buildMenu(dockNow()); } }).observe(document.getElementById('stage') || document.body, { childList: true, subtree: true }); }
export const render = () => { try { build(); } catch (e) { console.warn('[ooc-view]', e); } };
const css = `
#oocWrap{display:flex;padding:var(--sp-2);border-radius:var(--r-glass);order:-1}
#oocWrap #oocBtn{width:40px;height:40px;display:grid;place-items:center;border:0;background:transparent;color:var(--ink);cursor:pointer}
#oocMenu{position:absolute;z-index:var(--zu-pop);right:calc(var(--rail-w-now,0px) + var(--sp-5) + 64px);bottom:calc(var(--sheet-h,0px) + var(--sp-5));display:flex;flex-direction:column;gap:var(--sp-1);padding:var(--sp-2);border-radius:var(--r-m);min-width:160px}
#oocMenu[hidden]{display:none}
#oocMenu button{all:unset;box-sizing:border-box;cursor:pointer;min-height:var(--hit,44px);padding:0 var(--sp-5);border-radius:var(--r-s);display:flex;align-items:center;font:500 var(--fs-control)/1 var(--font-ui);color:var(--ink)}
#oocMenu button:hover{background:var(--surface-2)}#oocMenu button:focus-visible{box-shadow:var(--focus-ring)}
#oocBox{margin-top:var(--sp-5);padding-top:var(--sp-5);border-top:1px solid var(--line)}
#oocBox summary{display:flex;align-items:baseline;gap:var(--sp-4);min-height:var(--hit,44px);cursor:pointer;list-style:none}
#oocBox summary::-webkit-details-marker{display:none}
#oocBox summary h3{margin:0}
#oocBox summary::after{content:'';margin-left:auto;width:7px;height:7px;border:solid var(--muted);border-width:0 1.5px 1.5px 0;transform:rotate(45deg);align-self:center}
#oocBox[open] summary::after{transform:rotate(-135deg)}
#oocBox small{display:block;margin:var(--sp-3) 0;color:var(--muted)}
#oocBox .ooc-list{display:flex;flex-wrap:wrap;gap:var(--sp-3)}
#oocBox .ooc-list .btn{flex:1 1 auto;min-height:var(--hit,44px);font-size:var(--fs-small)}`;
const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
onBuilt('ai', () => render());
