// 本机扩展接口 window.EdenMap 与聊天 id（E6，docs/content-compat.md）。
import { nsStore } from '../core/pack.mjs';
import { M, REG, cur } from './state.mjs';
import { $, post } from './util.mjs';
import { nm } from './i18n.mjs';
import { v3dFly } from './estate.mjs';
import { CBmod, HX, cardBind, cardSpec, estPlan, hereIdx, markHere, setHereIdx } from './locate.mjs';
import { selfCheck } from './settings.mjs';
import { P } from './plugins.mjs';
// ---------------- 本机扩展接口 window.EdenMap（E6，docs/content-compat.md） ----------------
// 只读写用户本机 localStorage，不联网、不上传、不进地址。酒馆里由卡内脚本 eden-map.js 在宿主页挂同名对象并转发到这里，并告诉地图当前聊天 id。
//   setRoomAlias(自定义名, 标准房间名) → true / false；removeRoomAlias(自定义名)；getRooms() → { rooms: 标准房间名[], alias: { 自定义名: 标准房间名 }, chat }
//   on('here' | 'events' | 'map', fn) / off(事件, fn?)：here {value, resolved}、events {items, floor, hereLayer}、map {map, title, kind}
export let chatId = '', enNames = null, emMap = null;
export const LS = (() => { try { return nsStore(localStorage, window.__packId); } catch (e) { return null; } })();   // 设定包命名空间（eden 原样）
const emSubs = { here: new Set(), events: new Set(), map: new Set(), characters: new Set() };
export function emEmit(ev, data) { for (const f of emSubs[ev]) { try { f(data); } catch (e) { console.warn('[EdenMap]', e); } } if (ev === 'map') post({ type: 'eden-map:emit', ev, data }); }
export function emMapChanged() { if (cur === emMap) return; emMap = cur; const m = REG.maps[cur]; emEmit('map', { map: cur, title: nm(m, 'title'), kind: m.kind }); }
// v0.9.3：自定义叫法来自 custom.js（聊天变量 eden_map.自定义，或单独打开时的本机存储）；custom.js 还没就绪时退回旧版本机叫法
export function rebuildHere() { if (HX && REG) setHereIdx(HX.buildIndex(CBmod && cardBind && cardSpec ? CBmod.applyToRegistry(REG, cardSpec, cardBind.specs) : REG, M, enNames, (typeof P.TCCustom !== 'undefined' && P.TCCustom.index()) || HX.readCustom(LS, chatId), estPlan)); }
export function setChat(id) { id = String(id || ''); if (id === chatId) return; chatId = id; rebuildHere(); P.TCChars.chatChanged(); P.TCCustom.chatChanged(); if (REG) { markHere($('#here').value); } }
window.__edenMapChat = setChat;   // 宿主页转发调用前先同步聊天 id（同源 srcdoc，直接调用）
window.EdenMap = Object.freeze({
  flyTo(o) { return o?.hotspot ? v3dFly(o) : P.TCCustom.flyTo(o); },   // viewer3d：{ map: 'dairy', hotspot: 'tank' }；v0.9.5 地图：{ map, marker | room | area | character }
  // v0.9.3 自定义名称与用途（custom.js）；旧名 setRoomAlias / removeRoomAlias 保留：房间叫法 = 该房间的显示名
  setCustom(key, patch) { return P.TCCustom.setCustom(key, patch || {}); }, removeCustom(key) { return P.TCCustom.removeCustom(key); }, getCustom() { return P.TCCustom.data; },
  setRoomAlias(name, room) { const std = hereIdx?.estate?.std || null; room = String(room || '').trim(); name = String(name || '').trim();
    if (std && (!std.includes(room) || std.includes(name))) return false; return P.TCCustom.setCustom(room, { name, kind: 'room' }); },
  removeRoomAlias(name) { const k = Object.entries(P.TCCustom.data.items).find(([, e]) => e.名 === String(name).trim())?.[0]; return k ? P.TCCustom.setCustom(k, { name: '' }) : false; },
  getOutfit() { return P.TCCustom.outfit; }, getClock() { return P.TCCustom.clock; },
  setAvatar(name, src) { return P.TCChars.setAvatar(name, src); }, removeAvatar(name) { return P.TCChars.removeAvatar(name); },   // 人物头像：只存本机（v0.9.2）
  selfcheck() { return selfCheck ? { items: selfCheck.items.map(i => ({ ...i })) } : null; },   // 嵌在酒馆里才有（卡内脚本发来）
  getRooms() { return { rooms: [...(hereIdx?.estate?.std || [])], alias: { ...(hereIdx?.estate?.alias || {}) }, chat: chatId || null }; },
  on(ev, fn) { if (emSubs[ev] && typeof fn === 'function') emSubs[ev].add(fn); return this; },
  off(ev, fn) { if (emSubs[ev]) fn ? emSubs[ev].delete(fn) : emSubs[ev].clear(); return this; },
});
export function setEnNames(v) { return (enNames = v); }
