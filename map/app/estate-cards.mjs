// 3D 建筑里的卡（PLACE-1b，docs/place-record.md §3.2）：一间房、一处室外区域或载具，都由那条记录画。
// 三维页只说「点了哪个」（estate:select / estate:zone），记录与文字都在查看器这一侧算，所以同一个地点在二维三维里长得一样。
// 署名（PACK.credits）不住在这里了：它在设置页，地点页与房间卡都不再出现（brief §7 对原作者署名的要求由设置页与包清单满足）。
import { $ } from './dom-helpers.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { showCard } from './markers.mjs';
import { recordCard, recordBody, recordActions } from './place-card.mjs';
import { recordOf } from './place-sources.mjs';
import { RT } from './nodes-runtime.mjs';

const T = (k, zh, v) => uiTextOr(k, zh, v);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const floorLabel = (floors, id) => floors.find(f => f.id === id)?.label || id || '';
const dl = rows => { const d = h('dl', 'fields'); for (const [k, v] of rows) if (v) d.append(h('dt', null, k), h('dd', null, v)); return d; };

/** a room: the record does the talking (floor · building, description, access, area, facts) + 编辑 / 世界书档案 */
export function roomCard(r, ctx) {
  const rec = recordOf(r.node || '') || recordOf(r.name);
  const k = ctx.kinds.find(x => x.id === r.kind) || { id: r.kind, label: r.kind, color: '' };
  const sub = rec?.sub || [floorLabel(ctx.floors, r.floor), ctx.building.title].filter(Boolean).join(' · ');
  if (!rec) return bareRoom(r, k, sub);
  recordCard(rec, { kindLabel: k.label, back: ctx.back, sub });
  return $('#card');
}
/** 这一间在树里还没有记录（表里有、记录还没算出来）：只画它自己的行，不编文字 */
function bareRoom(r, k, sub) {
  showCard(null, r.name, '', null, sub, undefined, false);
  const rows = [[T('v3.kind', '类别'), k.label]];
  if (Number.isFinite(r.area) && r.area > 0) rows.push([T('v3.area', '面积'), `${Math.round(r.area)} ㎡`]);
  if (r.note) rows.push([T('v3.use', '说明'), r.note]);
  if (r.access) rows.push([T('v3.access', '出入'), r.access]);
  $('#card .src').replaceChildren(dl(rows));
  return $('#card');
}
/** an outdoor zone or a vehicle: the record's text, then the rows the 3D page has for it, then its own jumps */
export function zoneCard(z) {
  const rec = recordOf(z.title || '') || recordOf(z.id || '');
  showCard(null, z.title || '', '', null, rec?.sub || z.sub || '', undefined, false);
  const c = $('#card'), src = c.querySelector('.src'), ex = c.querySelector('.extra');
  if (rec) { src.replaceChildren(recordBody(rec)); ex.append(recordActions(rec)); }
  src.append(dl((z.rows || []).filter(r => Array.isArray(r) && r[1])));
  for (const a of z.acts || []) {
    if (a.id === 'enter' && a.node) { const l = h('a', null, a.label); l.dataset.go = a.node; l.setAttribute('role', 'button'); l.tabIndex = 0; if (a.title) l.title = a.title; ex.append(l); }
    else if (a.id === 'zone' && a.zone) { const b = h('button', 'btn', a.label); b.type = 'button'; b.dataset.v3zone = a.zone; ex.append(b); }
  }
  return c;
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
