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
export const render = () => { try { build(); } catch (e) { console.warn('[ooc-view]', e); } };
const css = `
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
