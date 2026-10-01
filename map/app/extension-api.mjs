// 本机扩展接口 window.EdenMap 与聊天 id（E6，docs/content-compat.md）。
import { nsStore } from '../core/pack.mjs';
import { worldData, mapRegistry, currentMapId } from './state.mjs';
import { $ } from './dom-helpers.mjs';
import { post } from './protocol-stamp.mjs';
import { localName } from './i18n.mjs';
import { v3dFly } from './subpage3d-host.mjs';
import { estPlan, placeIndex, markHere, setPlaceIndex } from './locate.mjs';
import { makeHere } from './place-resolver.mjs';
import { readCustom } from '../core/legacy-custom.mjs';
import { PACK, packOverlay, packTax } from './current-pack.mjs';
import { selfCheck } from './settings.mjs';
import { plugins } from './plugins.mjs';
// ---------------- 本机扩展接口 window.EdenMap（E6，docs/content-compat.md） ----------------
// 只读写用户本机 localStorage，不联网、不上传、不进地址。酒馆里由卡内脚本 eden-map.js 在宿主页挂同名对象并转发到这里，并告诉地图当前聊天 id。
//   setRoomAlias(自定义名, 标准房间名) → true / false；removeRoomAlias(自定义名)；getRooms() → { rooms: 标准房间名[], alias: { 自定义名: 标准房间名 }, chat }
//   on('here' | 'events' | 'map', fn) / off(事件, fn?)：here {value, resolved}、events {items, floor, hereLayer}、map {map, title, kind}
export let chatId = '', enNames = null, emMap = null;
export const packStorage = (() => { try { return nsStore(localStorage, window.__packId); } catch (e) { return null; } })();   // 设定包命名空间（eden 原样）
const emSubs = { here: new Set(), events: new Set(), map: new Set(), characters: new Set() };
export function emEmit(ev, data) { for (const f of emSubs[ev]) { try { f(data); } catch (e) { console.warn('[EdenMap]', e); } } if (ev === 'map') post({ type: 'eden-map:emit', ev, data }); }
export function emMapChanged() { if (currentMapId === emMap) return; emMap = currentMapId; const m = mapRegistry.maps[currentMapId]; emEmit('map', { map: currentMapId, title: localName(m, 'title'), kind: m.kind }); }
// v0.9.3：自定义叫法来自 custom.js（聊天变量 eden_map.自定义，或单独打开时的本机存储）；custom.js 还没就绪时退回旧版本机叫法
export function rebuildHere() {
  if (!mapRegistry) return;
  try { setPlaceIndex(makeHere({ manifest: PACK, maps: mapRegistry, world: worldData, names: enNames, plan: estPlan, overlay: packOverlay, events: packTax, custom: (typeof plugins.CustomNamesView !== 'undefined' && plugins.CustomNamesView.index()) || readCustom(packStorage, chatId) })); } catch (e) { setPlaceIndex(null); }   // 静默自愈：建不出词表就认不出地点，不弹框
}
export function setChat(id) { id = String(id || ''); if (id === chatId) return; chatId = id; rebuildHere(); plugins.CharactersView.chatChanged(); plugins.CustomNamesView.chatChanged(); if (mapRegistry) { markHere($('#here').value); } }
window.__edenMapChat = setChat;   // 宿主页转发调用前先同步聊天 id（同源 srcdoc，直接调用）
window.EdenMap = Object.freeze({
  flyTo(o) { return o?.hotspot ? v3dFly(o) : plugins.CustomNamesView.flyTo(o); },   // viewer3d：{ map: 'dairy', hotspot: 'tank' }；v0.9.5 地图：{ map, marker | room | area | character }
  // v0.9.3 自定义名称与用途（custom.js）；旧名 setRoomAlias / removeRoomAlias 保留：房间叫法 = 该房间的显示名
  setCustom(key, patch) { return plugins.CustomNamesView.setCustom(key, patch || {}); }, removeCustom(key) { return plugins.CustomNamesView.removeCustom(key); }, getCustom() { return plugins.CustomNamesView.data; },
  setRoomAlias(name, room) { const std = placeIndex?.estate?.std || null; room = String(room || '').trim(); name = String(name || '').trim();
    if (std && (!std.includes(room) || std.includes(name))) return false; return plugins.CustomNamesView.setCustom(room, { name, kind: 'room' }); },
  removeRoomAlias(name) { const k = Object.entries(plugins.CustomNamesView.data.items).find(([, e]) => e.名 === String(name).trim())?.[0]; return k ? plugins.CustomNamesView.setCustom(k, { name: '' }) : false; },
  getInv() { return (typeof plugins.StashView !== 'undefined' && plugins.StashView) ? plugins.StashView.rows : []; },   // 空间化背包（Part 5-1）只读
  getOutfit() { return plugins.CustomNamesView.outfit; }, getClock() { return plugins.CustomNamesView.clock; },
  setAvatar(name, src) { return plugins.CharactersView.setAvatar(name, src); }, removeAvatar(name) { return plugins.CharactersView.removeAvatar(name); },   // 人物头像：只存本机（v0.9.2）
  selfcheck() { return selfCheck ? { items: selfCheck.items.map(i => ({ ...i })) } : null; },   // 嵌在酒馆里才有（卡内脚本发来）
  getRooms() { return { rooms: [...(placeIndex?.estate?.std || [])], alias: { ...(placeIndex?.estate?.alias || {}) }, chat: chatId || null }; },
  on(ev, fn) { if (emSubs[ev] && typeof fn === 'function') emSubs[ev].add(fn); return this; },
  off(ev, fn) { if (emSubs[ev]) fn ? emSubs[ev].delete(fn) : emSubs[ev].clear(); return this; },
});
export function setEnNames(v) { return (enNames = v); }
