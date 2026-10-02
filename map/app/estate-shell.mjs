// 3D as a view mode of the current place (docs/ui-refactor.md 3.8, S7-3): the viewer's half of the one shell. While a 3D page is open the viewer keeps its header, level strip, toolbar,
// drawer and cards (U-25, U-26); the page draws only the scene, its in-canvas labels and the presence chips. This module
//   * draws the view segment (外观 / 内透 / 剖切) in the header, one menu button at <= 640 px, and the building's floors in the level strip, and says so to the page (estate:view, estate:floor);
//   * routes the toolbar (zoom, reset, labels), keys 1 / 2 / 3 and Esc to the page;
//   * opens the shared place / person card for what the page reports (estate:select, estate:person) and lists the building's rooms in the drawer's place tab;
//   * sends the people the chat places in the building (estate:people, from core/estate-people.mjs) when the list changes.
// The card sections are built in estate-cards.mjs. Nothing here writes host state; the viewer only sends intents up (eden-map:* stays in the other modules).
import { mapRegistry, currentMapId } from './state.mjs';
import { $ } from './dom-helpers.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { plugins, register } from './plugins.mjs';
import { closeCard } from './markers.mjs';
import { renderNav } from './map-level-nav.mjs';
import { hereRes } from './locate.mjs';
import { eventGeo, isScene } from './nodes-runtime.mjs';
import { buildEstatePeople, sameList } from '../core/estate-people.mjs';
import { aboutSection, roomCard, roomList, treeRooms, zoneCard } from './estate-cards.mjs';

const S = { on: false, ready: false, floors: [], rooms: [], building: { title: '', subtitle: '', summary: '' }, kinds: [], mode: 'ext', floor: null, labels: true, sent: null, insets: '' };
let send = () => {}, ui = null;
const T = (k, zh) => uiTextOr(k, zh);
const MODES = [['ext', 'v3.ext', '外观'], ['xray', 'v3.xray', '内透'], ['sect', 'v3.section', '剖切']];
const CSS = `
#v3seg,#v3btn,#v3menu{display:none}
body.shell3d #v3seg{display:inline-flex;gap:var(--sp-1);padding:var(--sp-1);border-radius:var(--r-m)}
#v3seg button,#v3menu button{all:unset;box-sizing:border-box;cursor:pointer;min-height:36px;padding:0 var(--sp-5);border-radius:var(--r-s);font:500 var(--fs-control)/1 var(--font-ui);display:inline-flex;align-items:center;color:var(--ink)}
#v3seg button:hover,#v3menu button:hover{background:var(--surface-2)}
#v3seg button[aria-checked=true],#v3menu button[aria-checked=true]{background:var(--accent);color:var(--on-accent);font-weight:700}
#v3seg button:focus-visible,#v3menu button:focus-visible{box-shadow:var(--focus-ring)}
body.shell3d #dock{display:flex}
body.shell3d #evbar:not([hidden]){display:flex!important}
body.shell3d #zHome{display:none}
#layers button[data-act]{color:var(--accent)}
.kc{display:inline-block;width:12px;height:12px;border-radius:var(--r-s);background:var(--kc);margin-right:var(--sp-3);vertical-align:-1px;border:1px solid var(--glass-line)}
.v3rooms details{border-top:1px solid var(--line)}.v3rooms summary{display:flex;align-items:center;min-height:44px;cursor:pointer;font-size:var(--fs-small);font-weight:600;color:var(--ink-2)}
.v3rooms .v3room{all:unset;box-sizing:border-box;display:flex;align-items:center;width:100%;min-height:40px;padding:0 var(--sp-4);border-radius:var(--r-s);cursor:pointer;font-size:var(--fs-control)}
.v3rooms .v3room:hover{background:var(--surface-2)}.v3rooms .v3room:focus-visible{box-shadow:var(--focus-ring)}
.v3about p{margin:var(--sp-2) 0;color:var(--ink-2);font-size:var(--fs-small)}.v3about .v3sub{color:var(--accent);letter-spacing:.06em}
#cardEmpty h3.v3t{margin:var(--sp-3) 0 0;font:700 var(--fs-title)/1.35 var(--font-ui);color:var(--ink)}
@media (max-width:640px){body.shell3d #v3seg{display:none}body.shell3d #v3btn{display:grid}#v3menu{position:absolute;right:calc(var(--sp-5)*2 + var(--hit));bottom:calc(var(--sheet-h,0px) + var(--sp-5));z-index:var(--zu-pop);flex-direction:column;padding:var(--sp-2);border-radius:var(--r-m)}#v3menu:not([hidden]){display:flex}#v3menu button{min-height:var(--hit)}}
@media (min-width:641px){#v3menu{display:none!important}}`;
const k3 = m => MODES.find(x => x[0] === m);

function build() {
  if (ui) return ui;
  const st = document.createElement('style'); st.id = 'estateShellCss'; st.textContent = CSS; document.head.append(st);
  const seg = document.createElement('div'); seg.id = 'v3seg'; seg.className = 'g1'; seg.setAttribute('role', 'radiogroup');
  const btn = document.createElement('button'); btn.type = 'button'; btn.id = 'v3btn'; btn.className = 'btn ic g1'; btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'v3menu');
  const menu = document.createElement('div'); menu.id = 'v3menu'; menu.className = 'g2'; menu.setAttribute('role', 'menu'); menu.hidden = true;
  for (const [id] of MODES) for (const box of [seg, menu]) { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', box === seg ? 'radio' : 'menuitemradio'); b.dataset.v = id; box.append(b); }
  $('header').insertBefore(seg, $('#hereGo')); $('#dock').insertBefore(btn, $('#thumbBtn').nextSibling); $('#stage').append(menu);
  seg.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setView(b.dataset.v); });
  menu.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { setView(b.dataset.v); menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.focus(); } });
  btn.addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); if (!menu.hidden) menu.querySelector('[aria-checked=true]')?.focus(); });
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !e.target.closest('#v3menu, #v3btn')) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
  seg.addEventListener('keydown', e => { const bs = [...seg.children], i = bs.indexOf(document.activeElement), j = { ArrowRight: i + 1, ArrowLeft: i - 1 }[e.key]; if (i < 0 || j == null) return; e.preventDefault(); const b = bs[(j + bs.length) % bs.length]; b.focus(); b.click(); });
  // the toolbar of the 2D map drives the 3D page while it is open (capture: before the buttons' own handlers)
  $('#zoom').addEventListener('click', e => {
    if (!S.on) return; const b = e.target.closest('button'); if (!b) return;
    const op = { zIn: 'in', zOut: 'out', zAll: 'reset' }[b.id];
    if (op) send({ type: 'estate:cam', op }); else if (b.id === 'lblTog') { S.labels = !S.labels; send({ type: 'estate:labels', on: S.labels }); b.setAttribute('aria-pressed', String(S.labels)); } else return;
    e.stopImmediatePropagation(); e.preventDefault();
  }, true);
  document.addEventListener('click', e => {
    if (!S.on) return;
    const f = e.target.closest('#layers [data-floor]'); if (f) { setFloor(f.dataset.floor); return; }
    if (e.target.closest('[data-v3back]')) { closeCard(); refreshList(); return; }
    const z = e.target.closest('[data-v3zone]'); if (z) send({ type: 'estate:room', name: z.dataset.v3zone });
  });
  new ResizeObserver(() => insets()).observe($('#stage'));
  new MutationObserver(() => insets()).observe($('#evbar'), { attributes: true, attributeFilter: ['data-open', 'hidden'] });
  return (ui = { seg, btn, menu });
}
function paint() {
  const { seg, menu, btn } = build();
  for (const box of [seg, menu]) for (const b of box.children) { const m = k3(b.dataset.v); b.textContent = T(m[1], m[2]); const on = b.dataset.v === S.mode; b.setAttribute('aria-checked', String(on)); b.tabIndex = on || box === menu ? 0 : -1; }
  seg.setAttribute('aria-label', T('v3.view', '三维视图')); btn.setAttribute('aria-label', T('v3.view', '三维视图')); btn.title = `${T('v3.view', '三维视图')}: ${T(k3(S.mode)[1], k3(S.mode)[2])}`; btn.textContent = ''; btn.append(T(k3(S.mode)[1], k3(S.mode)[2]));
  $('#v3menu').setAttribute('aria-label', T('v3.view', '三维视图'));
}
/** what the page may draw over: the right rail and the sheet of the viewer (CSS variables of the stage), sent when they change */
function insets() {
  if (!S.on) return; const cs = getComputedStyle($('#stage')), n = k => Math.round(parseFloat(cs.getPropertyValue(k)) || 0);
  const m = { left: 6, right: n('--rail-w-now'), bottom: n('--sheet-h') }, sig = JSON.stringify(m);
  if (sig !== S.insets) { S.insets = sig; send({ type: 'estate:inset', ...m }); }
}

// ---- lifecycle (called by subpage3d-host.mjs) ----
export const active = () => S.on;
export const holds = name => !!S.sent?.some(p => p.name === name);
export function attach(sendFn) { Object.assign(S, { on: true, ready: false, floors: [], rooms: [], kinds: [], mode: 'ext', floor: null, sent: null, insets: '' }); send = sendFn; document.body.classList.add('shell3d'); paint(); }
export function detach() { if (!S.on) return; S.on = false; S.ready = false; send = () => {}; document.body.classList.remove('shell3d'); $('#v3menu').hidden = true; $('#zoom #lblTog')?.setAttribute('aria-pressed', 'true'); S.labels = true; }
export function ready(d) {
  Object.assign(S, { ready: true, floors: (d.floors || []).filter(f => f && typeof f.id === 'string'), rooms: (d.rooms || []).filter(r => r && typeof r.name === 'string'), kinds: d.kinds || [], building: { title: '', subtitle: '', summary: '', ...(d.building || {}) } });
  paint(); insets(); renderNav(); refreshList(); people(); $('#stage').setAttribute('aria-label', S.building.title || '');
}
export const language = () => { if (S.on) { paint(); refreshList(); } };

// ---- the view segment, the floors, the keys ----
export function setView(mode) { if (!k3(mode)) return; S.mode = mode; if (mode !== 'sect') S.floor = null; else S.floor ??= S.floors[Math.max(0, S.floors.findIndex(f => f.id === 'F1'))]?.id ?? S.floors[0]?.id ?? null; paint(); strip(); send({ type: 'estate:view', mode }); }
export function setFloor(id) { if (!S.floors.some(f => f.id === id)) return; S.mode = 'sect'; S.floor = id; paint(); strip(); send({ type: 'estate:floor', floor: id }); }
export function stepFloor(d) { const i = S.floors.findIndex(f => f.id === S.floor), j = Math.max(0, Math.min(S.floors.length - 1, (i < 0 ? S.floors.findIndex(f => f.id === 'F1') : i) + d)); if (S.floors[j]) setFloor(S.floors[j].id); }
const strip = () => renderNav();
/** the level strip shows the building's floors while the 3D view is open (map-level-nav.mjs renderNav asks first); true = drawn here */
export function stripFloors(nav) {
  if (!S.on || !S.floors.length) return false;
  nav.hidden = false;
  nav.replaceChildren(...S.floors.map(f => { const b = document.createElement('button'); b.type = 'button'; b.dataset.floor = f.id; const on = S.mode === 'sect' && S.floor === f.id; b.className = on ? 'on' : ''; if (on) b.setAttribute('aria-current', 'true');
    b.append(f.id); if (f.label && f.label !== f.id) { const s = document.createElement('small'); s.textContent = f.label; b.append(s); b.title = f.label; } return b; }).reverse());
  return true;
}
/** in 2D, when the current place has a 3D page: the same primary action 「3D 查看」 in the level strip (U-31) */
export function stripAction(nav, r) {
  nav.querySelector('[data-act]')?.remove();
  const m = r?.map && isScene(r.map) && r.map !== currentMapId && mapRegistry?.maps[r.map]?.status !== 'planned' ? r.map : null; if (!m || S.on) return;
  const b = document.createElement('button'); b.type = 'button'; b.dataset.go = m; b.dataset.focus = r.std || r.room || ''; b.dataset.act = '3d'; b.textContent = T('v3.enter', '3D 查看'); nav.hidden = false; nav.append(b);
}
export function onKey(k) { if (!S.on) return false; const m = { 1: 'ext', 2: 'xray', 3: 'sect' }[k]; if (!m) return false; setView(m); return true; }

// ---- from the page ----
export function fromPage(d) {
  if (d.type === 'estate:select') { if (d.room) roomCard({ ...d.room, node: d.node || d.room.node }, cardCtx(true)); else if (d.zone) zoneCard(d.zone); else if (!d.name) { closeCard(); refreshList(); } }
  else if (d.type === 'estate:person') { plugins.CharactersView?.cardHere(String(d.name || '')); if (d.dim) setTimeout(scheduleLine, 700); }
  else if (d.type === 'estate:view' && k3(d.mode)) { S.mode = d.mode; if (d.mode !== 'sect') S.floor = null; paint(); strip(); }
  else if (d.type === 'estate:floor' && typeof d.floor === 'string') { if (S.floors.some(f => f.id === d.floor)) { S.mode = 'sect'; S.floor = d.floor; } else if (k3(d.floor)) { S.mode = d.floor; S.floor = null; } paint(); strip(); }
}
const cardCtx = back => ({ kinds: S.kinds, floors: S.floors, building: S.building, back });
/** U-28: a person drawn from the schedule says where the position comes from (a neutral line in the person card) */
function scheduleLine() { const dl = document.querySelector('#card .src dl.fields'); if (!dl || dl.querySelector('.v3sch')) return; const a = document.createElement('dt'), b = document.createElement('dd'); a.className = 'v3sch'; a.textContent = T('v3.where', '位置'); b.textContent = T('v3.by_schedule', '位置按日程推算'); dl.append(a, b); }
/** the drawer's place tab, while no card is open: the building's about section and its rooms by floor (U-30) */
function refreshList() {
  const e = $('#cardEmpty'); if (!e || !S.on || !S.ready) return;
  const t = document.createElement('h3'); t.className = 'v3t'; t.textContent = S.building.title;
  e.replaceChildren(t, aboutSection(S.building), roomList(S.rooms, S.floors, r => send({ type: 'estate:select', node: r.node })));
  e.dataset.um = '3d';
}

// ---- the people ----
export function people() {
  if (!S.on || !S.ready) return;
  const cv = plugins.CharactersView; if (!cv?.rows) return;
  const mine = new Set(S.rooms.map(r => r.node)), nodeOf = t => { try { return [hereRes(t)?.node, eventGeo()?.place(t)?.node].find(n => mine.has(n)) || null; } catch (e) { return null; } };   // the same node resolution as the 2D map: the located node of a v1 pack, the tree's place of a v2 pack
  const list = buildEstatePeople({ rows: cv.rows, rooms: S.rooms, nodeOf });
  if (S.sent && sameList(list, S.sent)) return;
  S.sent = list; send({ type: 'estate:people', items: list });
}
/** a 2D building card: the building's about section and its rooms from the node tree, each opening the 3D page on that room (a `data-go` link) */
export function decorate(el, name) {
  const mid = el?.dataset?.mid, meta = mid && mapRegistry?.maps[currentMapId]?.markers?.[mid], mp = meta?.link3d?.map || meta?.link?.map;
  if (!mp || !isScene(mp)) return;
  const rooms = treeRooms(mp); if (!rooms.length) return;
  const ex = $('#card .extra'), box = roomList(rooms, [], r => { const a = document.createElement('a'); a.dataset.go = mp; a.dataset.focus = r.name; document.body.append(a); a.click(); a.remove(); });
  ex.append(box);
}
register('EstateShell', { people, active, holds, fromPage, decorate });
