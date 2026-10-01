// 本机存储预算（A-13）：地图和卡（状态栏等）、酒馆共用同一份 localStorage（约 5 MB，按 UTF-16 算约 2.5M 字符）。
// 只管地图自己的键（edenMap 开头）；卡自己的键、酒馆的键一个都不碰。
//   - 每聊天的键（edenMap:chat:<聊天>:*、edenMapSeen:<聊天>）按最近使用排序（LRU 索引 edenMap:lru），超过 MAX_CHATS 个聊天就清掉最久没用的；
//   - 头像：每个聊天最多 AVATARS_PER_CHAT 张，所有聊天合计不超过 AVATAR_TOTAL 字节；超了先清别的（最久没用的）聊天的头像，还不够就拒绝；
//   - 写入撞到额度（QuotaExceededError）：先按 LRU 腾地方再试一次，还不行返回 { ok: false, reason: 'quota' }，由调用方告诉用户。
// 当前聊天（keep）永远不清。纯函数 + 传入的 Storage，node 单测 tests/storage-budget.test.mjs。
export const LRU_KEY = 'edenMap:lru';
export const MAX_CHATS = 30;
export const AVATARS_PER_CHAT = 24;
export const AVATAR_TOTAL = 1500000;   // 字节（UTF-16：字符数 × 2）
export const isOurs = k => typeof k === 'string' && (k.startsWith('edenMap') || k === 'edenEstateLabels');   // edenEstateLabels：主场景标注开关的历史键名（core/storage.mjs KEYS）
/** 键 → 所属聊天 id；不是按聊天分的键返回 null（全局设置、全局头像等不参与 LRU） */
export function chatOf(k) {
  if (!isOurs(k)) return null;
  let m = k.match(/^edenMap:chat:(.+):[^:]+$/); if (m) return m[1];
  m = k.match(/^edenMapSeen:(.+)$/); return m ? m[1] : null;
}
export const bytesOf = (k, v) => ((k?.length || 0) + (v?.length || 0)) * 2;
const keys = st => { const out = []; try { for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k != null) out.push(k); } } catch (e) {} return out; };
const get = (st, k) => { try { return st.getItem(k); } catch (e) { return null; } };
/** 量一下：{ total, ours, chats: { id: bytes }, avatars } 字节 */
export function measure(st) {
  const r = { total: 0, ours: 0, chats: {}, avatars: 0, keys: 0 };
  for (const k of keys(st)) { const v = get(st, k) || '', b = bytesOf(k, v); r.total += b; r.keys++;
    if (!isOurs(k)) continue; r.ours += b; const c = chatOf(k); if (c != null) r.chats[c] = (r.chats[c] || 0) + b; if (/avatars$/.test(k)) r.avatars += b; }
  return r;
}
export const isQuota = e => !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
function readLru(st) { try { const o = JSON.parse(get(st, LRU_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
/** 记一下这个聊天刚用过（撞额度也不要紧：索引丢了只是按「没记录 = 最久」处理） */
export function touch(st, chat, now = Date.now()) {
  if (!chat) return; const o = readLru(st); o[chat] = now;
  const ids = Object.keys(o); if (ids.length > MAX_CHATS * 3) for (const id of ids.sort((a, b) => o[a] - o[b]).slice(0, ids.length - MAX_CHATS * 3)) delete o[id];
  try { st.setItem(LRU_KEY, JSON.stringify(o)); } catch (e) {}
}
/** 最久没用的在前；没记录的聊天算最久；keep 不在列表里 */
export function chatsByAge(st, keep) {
  const o = readLru(st), ids = new Set(Object.keys(o));
  for (const k of keys(st)) { const c = chatOf(k); if (c != null) ids.add(c); }
  ids.delete(keep); ids.delete('');
  return [...ids].sort((a, b) => (o[a] || 0) - (o[b] || 0) || (a < b ? -1 : 1));
}
/** 清掉一个聊天的地图键（only = 只清匹配的键，例如只清头像）；返回腾出的字节 */
export function dropChat(st, chat, only = null) {
  let freed = 0;
  for (const k of keys(st)) { if (chatOf(k) !== chat || (only && !only.test(k))) continue; freed += bytesOf(k, get(st, k)); try { st.removeItem(k); } catch (e) {} }
  if (!only) { const o = readLru(st); if (chat in o) { delete o[chat]; try { st.setItem(LRU_KEY, JSON.stringify(o)); } catch (e) {} } }
  return freed;
}
/** 启动时：聊天数超过 max 就按 LRU 清最久的；返回 { dropped: [id…], freed } */
export function sweep(st, keep, max = MAX_CHATS) {
  const old = chatsByAge(st, keep), n = old.length + (keep ? 1 : 0), out = { dropped: [], freed: 0 };
  for (const id of old.slice(0, Math.max(0, n - max))) { out.freed += dropChat(st, id); out.dropped.push(id); }
  return out;
}
/** 腾出至少 need 字节（按 LRU 清别的聊天；only 同 dropChat）；返回实际腾出的字节 */
export function freeUp(st, keep, need, only = null) {
  let freed = 0; for (const id of chatsByAge(st, keep)) { if (freed >= need) break; freed += dropChat(st, id, only); }
  return freed;
}
/** 写入；撞额度就按 LRU 腾地方再试一次。{ ok, reason?: 'quota' | 'error', freed } */
export function safeSet(st, k, v, keep) {
  try { st.setItem(k, v); return { ok: true, freed: 0 }; }
  catch (e) {
    if (!isQuota(e)) return { ok: false, reason: 'error', freed: 0 };
    const freed = freeUp(st, keep, bytesOf(k, v) + 64 * 1024);
    try { st.setItem(k, v); return { ok: true, freed }; } catch (e2) { return { ok: false, reason: isQuota(e2) ? 'quota' : 'error', freed }; }
  }
}
/** 本机存储出问题时给用户看的一句（中 / EN） */
export const warnText = (reason, en = false) => ({
  quota: en ? 'Local storage is full: this change was not saved. Remove some avatars or clear old chats\' map data.' : '本机存储已满：这次的改动没存上。可以删掉一些头像，或清理旧聊天的地图数据',
  cap: en ? `Avatar limit reached (${AVATARS_PER_CHAT} per chat): remove one first.` : `头像已达上限（每个聊天 ${AVATARS_PER_CHAT} 张）：先删掉一张再加`,
  vars: en ? 'Could not write chat variables: saved on this device only for now (it will not follow the chat to other devices).' : '聊天变量写入失败：这次先存在本机（换设备不会跟着走）',
}[reason] || (en ? 'Could not save to local storage.' : '本机存储写入失败'));
