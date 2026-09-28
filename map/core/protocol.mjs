// 地图消息协议（大版本 2，docs/design/arch-v2.md §3）：宿主（tavern/eden-map.js）↔ 查看器（viewer.html）↔ 庄园 / 三维子页。
// 信封 { type, v: PROTO, t?, ...字段 }。缺 v = v1（旧宿主 / 旧查看器，换线路时两边可能不同版本）照收；v 比本端新也照收（多出来的字段不管）。
// 只做形状检查而且是部分的：字段表为空的类型只确认「这个类型存在」，接收方仍要自己处理缺字段。
// SCHEMA：每种消息要求的字段与类型（'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'；后缀 ? = 可缺 / null）。
// 没登记的类型：本端版本及更旧的消息一律丢（接收方本来也不处理）；更新版本发来的未知类型也丢，但不告警。
// 纯函数、无依赖；node 单测 tests/protocol.test.mjs。只做形状检查，不过滤任何文字内容。
export const PROTO = 2;

const H2V = 'host→viewer', V2H = 'viewer→host', V2S = 'viewer→sub', S2V = 'sub→viewer';
export const SCHEMA = {
  // 查看器 → 宿主
  'eden-map:boot': [V2H, { pct: 'number' }],
  'eden-map:ready': [V2H, { proto: 'number?' }],
  'eden-map:progress': [V2H, { pct: 'number' }],
  'eden-map:loaded': [V2H, {}],
  'eden-map:state': [V2H, { map: 'string?', title: 'string?', lang: 'string?', theme: 'string?', hand: 'string?' }],
  'eden-map:esc': [V2H, {}],
  'eden-map:build': [V2H, {}],
  'eden-map:line-pick': [V2H, {}],
  'eden-map:storage-info': [V2H, {}],
  'eden-map:storage-clean': [V2H, {}],
  'eden-map:emit': [V2H, { ev: 'string' }],
  'eden-map:check-update': [V2H, {}],
  'eden-map:splash': [V2H, {}],
  'eden-map:update-now': [V2H, {}],
  'eden-map:chrome': [V2H, { top: 'number?', bottom: 'number?' }],
  'eden-map:notice': [V2H, { n: 'object' }],
  'eden-map:formbusy': [V2H, { on: 'boolean?' }],
  'eden-map:unmapped': [V2H, { name: 'string?' }],
  'eden-map:custom-set': [V2H, { key: 'string', patch: 'any' }],
  'eden-map:custom-reset': [V2H, { key: 'string' }],
  'eden-map:custom-sync': [V2H, { on: 'boolean?' }],
  'eden-map:varmap-set': [V2H, { user: 'object?' }],
  'eden-map:compose': [V2H, { text: 'string' }],
  'eden-map:explore': [V2H, { map: 'string', name: 'string' }],   // 迷雾探索：记一次到访（只在开着时发）
  'eden-map:explore-reset': [V2H, {}],
  // 宿主 → 查看器
  'eden-map:here': [H2V, { value: 'any' }],
  'eden-map:chat': [H2V, { id: 'any' }],
  'eden-map:lang': [H2V, { lang: 'string' }],
  'eden-map:about': [H2V, {}],
  'eden-map:update-result': [H2V, {}],
  'eden-map:chars': [H2V, { items: 'array?' }],
  'eden-map:events': [H2V, { items: 'array?' }],
  'eden-map:custom': [H2V, {}],
  'eden-map:clock': [H2V, {}],
  'eden-map:outfit': [H2V, { items: 'object?' }],   // mvu.outfit()：{ 部位: 描述 } 或 null
  'eden-map:varmap': [H2V, {}],
  'eden-map:fog': [H2V, { explored: 'object?' }],
  'eden-map:trips': [H2V, { items: 'array?' }],
  'eden-map:toast': [H2V, { items: 'array?' }],
  'eden-map:selfcheck': [H2V, { items: 'array?' }],
  'eden-map:hostbar': [H2V, { side: 'string?' }],
  'eden-map:line': [H2V, { swappable: 'boolean?' }],
  'eden-map:key': [H2V, { key: 'string' }],
  'eden-map:storage-result': [H2V, { storage: 'object?', sources: 'object?', cleaned: 'object?', cleanable: 'number?' }],
  'eden-map:settings': [H2V, { page: 'string?' }],
  'eden-map:notice-act': [H2V, { key: 'string?' }],
  'eden-map:unmapped-pick': [H2V, {}],
  'eden-map:sleep': [H2V, {}],
  'eden-map:wake': [H2V, {}],
  'eden-map:compose-done': [H2V, { ok: 'boolean?' }],
  'eden-map:open': [H2V, { map: 'string' }],   // 本机扩展入口（docs/content-compat.md），仓库内无发送方
  'eden-map:fly': [H2V, {}],                     // 同上
  // 查看器 ↔ 庄园 / 三维子页
  'estate:room': [V2S, { name: 'any' }],
  'estate:inset': [V2S, { left: 'number?' }],
  'estate:lang': [V2S, { lang: 'string' }],
  'estate:theme': [V2S, { theme: 'string' }],
  'estate:cvd': [V2S, { mode: 'string' }],        // 色觉模式：0 关 / rg 红绿 / by 蓝黄，同步给庄园 / 三维子页（E7）
  'estate:quality': [V2S, { q: 'string' }],       // 设置「三维画质」auto / 1 省电 / 2 高：不重载即生效（毛玻璃 + 像素比）
  'estate:fps': [V2S, { on: 'boolean' }],         // 调试：显示帧率——设置「显示帧率」实时同步给庄园 / props 三维子页（U，2026-09-28）
  'estate:pause': [V2S, {}],
  'estate:resume': [V2S, {}],
  'estate:floor': ['both', { floor: 'any' }],     // 下行 = 直嵌 / 调试接口；上行 = 用户切了楼层（直嵌时给外层页）
  'v3d:fly': [V2S, { hotspot: 'any' }],
  'v3d:mode': [V2S, { mode: 'string' }],
  'v3d:flows': [V2S, { on: 'boolean?' }],
  'estate:ready': [S2V, {}],
  'estate:fail': [S2V, { reason: 'string?' }],
  'estate:key': [S2V, { key: 'string' }],
  'estate:select': [S2V, { name: 'string?' }],   // 直嵌接口
  'v3d:state': [S2V, {}],                        // 直嵌接口
};

const typeOk = (v, t) => {
  const opt = t.endsWith('?'); if (opt) t = t.slice(0, -1);
  if (v === undefined || v === null) return opt || t === 'any';
  if (t === 'any') return true;
  if (t === 'array') return Array.isArray(v);
  if (t === 'object') return typeof v === 'object' && !Array.isArray(v);
  return typeof v === t;
};
/** 检查一条消息：{ ok, why }。不抛异常。 */
export function check(msg) {
  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return { ok: false, why: 'shape' };
  const v = msg.v == null ? 1 : msg.v;
  if (typeof v !== 'number' || !(v >= 1)) return { ok: false, why: 'version' };
  const s = SCHEMA[msg.type];
  if (!s) return { ok: false, why: v > PROTO ? 'newer-unknown' : 'unknown' };
  for (const [k, t] of Object.entries(s[1])) if (!typeOk(msg[k], t)) return { ok: false, why: 'field:' + k };
  return { ok: true, why: '' };
}
/** 接收方用：不合格就丢并告警一次（按类型 + 原因去重） */
const warned = new Set();
export function accept(msg, who = '') {
  const r = check(msg); if (r.ok) return true;
  if (r.why !== 'newer-unknown' && typeof msg?.type === 'string' && /^(eden-map|estate|v3d):/.test(msg.type)) {
    const k = msg.type + '|' + r.why; if (!warned.has(k)) { warned.add(k); try { console.warn(`[eden-map] 丢弃消息 ${msg.type}（${r.why}）${who}`); } catch (e) {} } }
  return false;
}
/** 发送方用：盖上协议版本 */
export const envelope = (type, payload = {}) => ({ ...payload, type, v: PROTO });

/**
 * 单一消息总线：一个窗口对一个对端。
 * createBus({ self, peer: () => Window, targetOrigin, accept: e => bool, extra: () => ({}) })
 *   → { send(type, payload), on(type, fn) → off, dispose() }
 * accept(e) 做来源检查（e.source / 令牌 / origin）；通过后按 SCHEMA 校验再分发。
 */
export function createBus({ self = globalThis, peer, targetOrigin = '*', accept: fromPeer = () => true, extra = () => ({}), who = '' } = {}) {
  const subs = new Map();
  const onMsg = e => {
    if (!fromPeer(e) || !accept(e.data, who)) return;
    for (const fn of subs.get(e.data.type) || []) { try { fn(e.data, e); } catch (x) { try { console.warn('[eden-map] 消息处理出错', e.data.type, x); } catch (y) {} } }
    for (const fn of subs.get('*') || []) { try { fn(e.data, e); } catch (x) {} }
  };
  self.addEventListener('message', onMsg);
  return {
    send(type, payload) { const w = peer?.(); if (w) w.postMessage({ ...envelope(type, payload), ...extra() }, targetOrigin); },
    on(type, fn) { if (!subs.has(type)) subs.set(type, new Set()); subs.get(type).add(fn); return () => subs.get(type)?.delete(fn); },
    dispose() { self.removeEventListener('message', onMsg); subs.clear(); },
  };
}
/** 同源检查：srcdoc / blob 子页与宿主同源；个别 WebView 报 'null' 也放行（仍有 e.source / 令牌检查兜底） */
export const sameOrigin = (e, self = globalThis) => { const o = e?.origin; return o === 'null' || o === '' || o === (self.origin || self.location?.origin); };
