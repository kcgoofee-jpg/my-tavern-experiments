// The cards of a 3D building, in the one card system (docs/ui-refactor.md U-30, S7-3 T3): a room, an outdoor zone or vehicle, and the building itself are the viewer's place card with
// sections; the 3D page only says what was picked. Everything here is built with textContent (the words come from pack data). Pure DOM builders: the shell (estate-shell.mjs) owns the state.
import { $ } from './dom-helpers.mjs';
import { LANG } from './i18n.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { showCard } from './markers.mjs';
import { PACK } from './current-pack.mjs';
import { roomMedia, remoteOn } from './pack-live.mjs';
import { nodePictures } from '../core/pack-media.mjs';
import { RT } from './nodes-runtime.mjs';

const T = (k, zh, v) => uiTextOr(k, zh, v);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const zhOnly = t => LANG === 'zh' || !/[一-鿿]/.test(t);   // text that exists in Chinese only is not shown under the English interface
export const kindChip = k => { const c = h('i', 'kc'); c.style.setProperty('--kc', k?.color || 'var(--muted)'); c.title = k?.label || ''; c.setAttribute('aria-hidden', 'true'); return c; };
const fieldRows = (rows) => { const dl = h('dl', 'fields'); for (const [k, v] of rows) { if (!v) continue; dl.append(h('dt', null, k), h('dd', null, v)); } return dl; };
const floorLabel = (floors, id) => floors.find(f => f.id === id)?.label || id || '';

/** a room: kind chip before the name, floor and building as the sub line, area / use / access rows, the room's pictures and the custom block; `back` = a way back to the building's list */
export function roomCard(r, ctx) {
  const k = ctx.kinds.find(x => x.id === r.kind) || { id: r.kind, label: r.kind, color: '' };
  const fl = floorLabel(ctx.floors, r.floor), bd = ctx.building.title;
  showCard(null, r.name, '', '', [fl, bd].filter(Boolean).join(' · '), undefined, false);
  const c = $('#card'), title = c.querySelector('h2');
  title.prepend(kindChip(k));
  const rows = [[T('v3.kind', '类别'), k.label]];
  if (Number.isFinite(r.area) && r.area > 0) rows.push([T('v3.area', '面积'), `${Math.round(r.area)} ㎡`]);
  if (r.note && zhOnly(r.note)) rows.push([T('v3.use', '说明'), r.note]);
  if (r.access && zhOnly(r.access)) rows.push([T('v3.access', '出入'), r.access]);
  const src = c.querySelector('.src'); src.replaceChildren(fieldRows(rows));
  const ex = c.querySelector('.extra');
  if (ctx.back) { const b = h('button', 'btn v3back', T('v3.back', '回到建筑')); b.type = 'button'; b.dataset.v3back = '1'; ex.append(b); }
  customBlock(ex, r);
}
/** the room-gallery panel's custom name / note / picture entry of a room (loaded on first use; the same store as before, keyed by the room name) */
async function customBlock(ex, r) {
  const m = await import('../ui/room-gallery-panel.js').catch(() => null); if (!m || !ex.isConnected) return;
  const box = h('div'); box.innerHTML = m.roomCustomBlockHTML(r.name, LANG); ex.append(...box.children);
  const c = $('#card'); if (c.dataset.rgBound) return; c.dataset.rgBound = '1'; c.dataset.lang = LANG;
  m.bindRoomCustomEvents(c, { base: './', pictures: name => { const raw = roomMedia()[name] || []; return raw.map(x => ({ id: x.id, item: x.item, url: nodePictures({ [x.id]: x.item }, [x.id], { base: '', remoteOn: remoteOn() })[0]?.url ?? null })); } });
}
/** an outdoor zone or a vehicle: { title, sub, rows: [[label, text]], acts: [{ id, label, node?, zone? }] } as the 3D page describes it */
export function zoneCard(z) {
  showCard(null, z.title || '', '', '', z.sub || '', undefined, false);
  const c = $('#card'); c.querySelector('.src').replaceChildren(fieldRows((z.rows || []).filter(r => Array.isArray(r) && zhOnly(String(r[1] ?? '')))));
  const ex = c.querySelector('.extra');
  for (const a of z.acts || []) {
    if (a.id === 'enter' && a.node) { const l = h('a', null, a.label); l.dataset.go = a.node; l.setAttribute('role', 'button'); l.tabIndex = 0; if (a.title) l.title = a.title; ex.append(l); }
    else if (a.id === 'zone' && a.zone) { const b = h('button', 'btn', a.label); b.type = 'button'; b.dataset.v3zone = a.zone; ex.append(b); }
  }
}
/** the building's words and credits (the about section reads only `building` and `credits`) */
export function aboutSection(bd) {
  const s = h('section', 'v3about'); if (bd.subtitle) s.append(h('p', 'v3sub', bd.subtitle)); if (bd.summary) s.append(h('p', null, bd.summary));
  const cr = PACK?.credits || {}, line = (t, url) => { const p = h('p', 'v3cr'); if (typeof url === 'string' && /^https:\/\//.test(url)) { const a = h('a', null, t); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; p.append(a); } else p.textContent = t; return p; };
  if (cr.card?.creator) s.append(line(cr.card.creator, cr.card.url));
  for (const x of [...(cr.pack || []), ...(cr.assets || [])]) if (x?.name) s.append(line([x.name, x.role, x.license].filter(Boolean).join(' · '), x.url));
  return s;
}
/** the rooms grouped by floor, each a button; `rooms` = [{ name, node?, floor }]; `pick(room)` is called on a click */
export function roomList(rooms, floors, pick) {
  const box = h('div', 'v3rooms'), by = new Map();
  for (const r of rooms) { if (!by.has(r.floor)) by.set(r.floor, []); by.get(r.floor).push(r); }
  const order = [...floors.map(f => f.id).reverse(), ...[...by.keys()].filter(f => !floors.some(x => x.id === f))];
  for (const f of order) {
    const list = by.get(f); if (!list?.length) continue;
    const d = h('details'); d.append(h('summary', null, floorLabel(floors, f) || T('v3.rooms', '房间')));
    const seen = new Set();
    for (const r of list) { if (seen.has(r.name)) continue; seen.add(r.name); const b = h('button', 'v3room', r.name); b.type = 'button'; b.addEventListener('click', () => pick(r)); d.append(b); }
    box.append(d);
  }
  return box;
}
/** the rooms of a building known to the node tree (no 3D page open yet): [{ name, floor }] from the room nodes under the node of the 3D page */
export function treeRooms(mapId) {
  const t = RT?.tree, host = RT?.host?.(mapId); if (!t || !host) return [];
  return t.children(host).map(id => t.get(id)).filter(n => n?.type === 'room').map(n => ({ name: n.name, floor: n['x-storey'] || '' }));
}
