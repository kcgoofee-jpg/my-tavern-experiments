// 地图消息协议（大版本 2，docs/design/arch-v2.md §3）：宿主（tavern/eden-map.js）↔ 查看器（viewer.html）↔ 主场景 / 三维子页。
// 信封 { type, v: PROTO, t?, ...字段 }。缺 v = v1（旧宿主 / 旧查看器，换线路时两边可能不同版本）照收；v 比本端新也照收（多出来的字段不管）。
// 只做形状检查而且是部分的：字段表为空的类型只确认「这个类型存在」，接收方仍要自己处理缺字段。
// SCHEMA：每种消息要求的字段与类型（'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'；后缀 ? = 可缺 / null）。
// 没登记的类型：本端版本及更旧的消息一律丢（接收方本来也不处理）；更新版本发来的未知类型也丢，但不告警。
// 纯函数、无依赖；node 单测 tests/protocol.test.mjs。只做形状检查，不过滤任何文字内容。
// 数组字段（items / rows 等）的内容不逐项检查：其中的行可以带 node（节点 id，K-R71）——收方树里有这个 id 就用它，否则按 place 文字定位。
export const PROTO = 2;

const HOST_TO_VIEWER = 'host→viewer', VIEWER_TO_HOST = 'viewer→host', VIEWER_TO_SUBPAGE = 'viewer→sub', SUBPAGE_TO_VIEWER = 'sub→viewer';
export const SCHEMA = {
  // 查看器 → 宿主
  'eden-map:boot': [VIEWER_TO_HOST, { pct: 'number' }],
  'eden-map:ready': [VIEWER_TO_HOST, { proto: 'number?' }],
  'eden-map:progress': [VIEWER_TO_HOST, { pct: 'number' }],
  'eden-map:loaded': [VIEWER_TO_HOST, {}],
  'eden-map:state': [VIEWER_TO_HOST, { map: 'string?', title: 'string?', lang: 'string?', theme: 'string?', hand: 'string?' }],
  'eden-map:esc': [VIEWER_TO_HOST, {}],
  'eden-map:build': [VIEWER_TO_HOST, {}],
  'eden-map:line-pick': [VIEWER_TO_HOST, {}],
  'eden-map:storage-info': [VIEWER_TO_HOST, {}],
  'eden-map:storage-clean': [VIEWER_TO_HOST, {}],
  'eden-map:emit': [VIEWER_TO_HOST, { ev: 'string' }],
  'eden-map:check-update': [VIEWER_TO_HOST, {}],
  'eden-map:splash': [VIEWER_TO_HOST, {}],
  'eden-map:update-now': [VIEWER_TO_HOST, {}],
  'eden-map:switch-branch': [VIEWER_TO_HOST, { branch: 'string' }],   // 设置「更新与版本」→ 版本分支切换（main / preview 双轨）
  'eden-map:chrome': [VIEWER_TO_HOST, { top: 'number?', bottom: 'number?' }],
  'eden-map:notice': [VIEWER_TO_HOST, { n: 'object' }],
  'eden-map:formbusy': [VIEWER_TO_HOST, { on: 'boolean?' }],
  'eden-map:unmapped': [VIEWER_TO_HOST, { name: 'string?' }],
  'eden-map:custom-set': [VIEWER_TO_HOST, { key: 'string', patch: 'any' }],
  'eden-map:custom-reset': [VIEWER_TO_HOST, { key: 'string' }],
  'eden-map:custom-sync': [VIEWER_TO_HOST, { on: 'boolean?' }],
  'eden-map:varmap-set': [VIEWER_TO_HOST, { user: 'object?' }],
  'eden-map:compose': [VIEWER_TO_HOST, { text: 'string' }],
  'eden-map:action': [VIEWER_TO_HOST, { kind: 'string?', name: 'string?', map: 'string?', text: 'string?' }],   // Part 6-4：地图 POI → 聊天（文案与注入方式由宿主按设置决定，模块 tavern/place-action-injection.mjs）
  'eden-map:loot': [VIEWER_TO_HOST, { id: 'string', name: 'string', map: 'string?', place: 'string?', hidden: 'boolean?' }],   // Part 5-1：点了地上发光的拾取物（core/stash.mjs 藏物表的 id）
  'eden-map:stealth': [VIEWER_TO_HOST, { dc: 'number', from: 'string?', to: 'string?', seen: 'boolean?', hits: 'array?', worst: 'object?' }],   // Part 5-2：这次移动穿过了谁的视野（dc = 最难的一下；worst = {id,name,dc,dist,at} W2 补发，检定失败环用）
  'eden-map:explore': [VIEWER_TO_HOST, { map: 'string', name: 'string' }],   // 迷雾探索：记一次到访（只在开着时发）
  'eden-map:explore-reset': [VIEWER_TO_HOST, {}],
  'eden-map:th': [VIEWER_TO_HOST, { op: 'string', prefs: 'object?' }],   // 酒馆助手设置（app/tavernhelper-settings.mjs）：state / prefs（含 packLlm：外来包的模型文字开关，K-R103）/ wb-inspect / wb-write / wb-del-legacy / wb-peek（W8 地点卡 → 附加书条目摘要，只读）
  'eden-map:pack-pick': [VIEWER_TO_HOST, { kind: 'string', url: 'string?', text: 'string?', id: 'string?' }],   // S9-2 K-R99：设置「地图包」里为这张卡选的包（kind = automatic | index（id）| url | file（text））；宿主（pack-gate.mjs pick）校验、存下、重启；被拒绝时在 eden-map:th-state 的 result.pack 里回原因
  'eden-map:pack': [HOST_TO_VIEWER, { manifest: 'object', rev: 'number', source: 'string?', trust: 'string?' }],   // S9-3 K-R95：自动包长出了新节点（宿主按聊天里的地点文字生长）；查看器按 rev 递增重投影并原地重画
  'eden-map:wb-peek': [HOST_TO_VIEWER, { name: 'string', items: 'array?' }],   // W8：附加书条目摘要回执（地图 → 世界书胶囊的结果）
  // 宿主 → 查看器
  'eden-map:here': [HOST_TO_VIEWER, { value: 'any', replay: 'boolean?' }],   // replay = 时间轴回放（Part 5-4）：查看器只画，宿主不再记账
  'eden-map:chat': [HOST_TO_VIEWER, { id: 'any' }],
  'eden-map:lang': [HOST_TO_VIEWER, { lang: 'string' }],
  'eden-map:about': [HOST_TO_VIEWER, {}],
  'eden-map:cardinfo': [HOST_TO_VIEWER, { card: 'object?', tried: 'array?' }],   // 任务四：角色卡信息（版权申明页）；经桥三级降级取，null = 没读到（面板显示安全占位）
  'eden-map:update-result': [HOST_TO_VIEWER, {}],
  'eden-map:chars': [HOST_TO_VIEWER, { items: 'array?', replay: 'boolean?', groups: 'array?' }],   // groups = [{ id, label, rows, present? }]：包声明的每个名册组一项（S4-4）；rosters 三表照旧，新查看器优先读 groups
  'eden-map:events': [HOST_TO_VIEWER, { items: 'array?' }],
  'eden-map:custom': [HOST_TO_VIEWER, {}],
  'eden-map:inv': [HOST_TO_VIEWER, { items: 'array?', stash: 'object?', card: 'object?' }],   // items = 旧形状的行（地点卡「存放」行，Part 5-1）；stash = 统一背包的行与槽位摘要（K-R74）；card = 卡自己的物品表，只读（K-R76）；三者互不依赖，旧查看器只认 items
  'eden-map:stash': [HOST_TO_VIEWER, { items: 'array?' }],   // 世界藏物表（Part 5-1）：设定包自带的藏物（带地图 / 标记 / 暗格），查看器据此画发光拾取物
  'eden-map:routine': [HOST_TO_VIEWER, { schedule: 'object?' }],   // Part 8-2：NPC 日程表（包数据 routine.json 原样推来，查看器按确定性时钟自己挪人）
  'eden-map:clock': [HOST_TO_VIEWER, {}],
  'eden-map:outfit': [HOST_TO_VIEWER, { items: 'object?' }],   // mvu.outfit()：{ 部位: 描述 } 或 null
  'eden-map:varmap': [HOST_TO_VIEWER, {}],
  'eden-map:fog': [HOST_TO_VIEWER, { explored: 'object?' }],
  'eden-map:trips': [HOST_TO_VIEWER, { items: 'array?' }],
  'eden-map:toast': [HOST_TO_VIEWER, { items: 'array?' }],
  'eden-map:selfcheck': [HOST_TO_VIEWER, { items: 'array?' }],
  'eden-map:hostbar': [HOST_TO_VIEWER, { side: 'string?' }],
  'eden-map:line': [HOST_TO_VIEWER, { swappable: 'boolean?', name: 'string?', manual: 'boolean?' }],
  'eden-map:key': [HOST_TO_VIEWER, { key: 'string' }],
  'eden-map:storage-result': [HOST_TO_VIEWER, { storage: 'object?', sources: 'object?', cleaned: 'object?', cleanable: 'number?' }],
  'eden-map:settings': [HOST_TO_VIEWER, { page: 'string?' }],
  'eden-map:notice-act': [HOST_TO_VIEWER, { key: 'string?' }],
  'eden-map:unmapped-pick': [HOST_TO_VIEWER, {}],
  'eden-map:sleep': [HOST_TO_VIEWER, {}],
  'eden-map:wake': [HOST_TO_VIEWER, {}],
  'eden-map:compose-done': [HOST_TO_VIEWER, { ok: 'boolean?' }],
  'eden-map:th-state': [HOST_TO_VIEWER, { prefs: 'object?', inject: 'object?', wb: 'object?', last: 'object?', result: 'object?' }],
  'eden-map:open': [HOST_TO_VIEWER, { map: 'string' }],   // 本机扩展入口（docs/content-compat.md），仓库内无发送方
  'eden-map:fly': [HOST_TO_VIEWER, {}],                     // 同上
  // 查看器 ↔ 主场景 / 三维子页
  'estate:room': [VIEWER_TO_SUBPAGE, { name: 'any' }],
  'estate:inset': [VIEWER_TO_SUBPAGE, { left: 'number?' }],
  'estate:lang': [VIEWER_TO_SUBPAGE, { lang: 'string' }],
  'estate:theme': [VIEWER_TO_SUBPAGE, { theme: 'string' }],
  'estate:cvd': [VIEWER_TO_SUBPAGE, { mode: 'string' }],        // 色觉模式：0 关 / rg 红绿 / by 蓝黄，同步给主场景 / 三维子页（E7）
  'estate:quality': [VIEWER_TO_SUBPAGE, { q: 'string' }],       // 设置「三维画质」auto / 1 省电 / 2 高：不重载即生效（毛玻璃 + 像素比）
  'estate:fps': [VIEWER_TO_SUBPAGE, { on: 'boolean' }],         // 调试：显示帧率——设置「显示帧率」实时同步给主场景 / props 三维子页（U，2026-09-28）
  'estate:chat': [VIEWER_TO_SUBPAGE, { id: 'string' }],         // 当前 chatId：房间图集「仅本聊天」作用域用，主场景页读不到 SillyTavern 上下文（2026-09-28）
  'estate:stash': [VIEWER_TO_SUBPAGE, { items: 'array?' }],     // Part 8-1：世界藏物表（宿主 → 查看器 → 主场景三维页），三维页据此在房间 / 区域里放发光道具
  'estate:taken': [VIEWER_TO_SUBPAGE, { ids: 'array?' }],       // Part 8-1：已经在手里的藏物 id（背包的 id 对账）：地上不再发光
  'estate:routine': [VIEWER_TO_SUBPAGE, { schedule: 'object?', clock: 'object?' }],   // Part 8-2：NPC 日程表 + 起点时钟（三维页按确定性时钟自己挪人）
  'estate:children': [VIEWER_TO_SUBPAGE, { zones: 'object' }],   // S2-B：宿主 → 三维页：{ 区域 id: [{ node, title }] }，该区域下挂着的子地图（来自运行时节点树）；三维页据此给区域卡加「进入三维」
  'estate:media': [VIEWER_TO_SUBPAGE, { rooms: 'object', remote: 'boolean?' }],   // S9b K-R101：宿主 → 三维页：{ 房间名: [{ id, item }] } 设定包给这个房间的图（来源规则由三维页再查一遍），remote = 「加载链接给出的图片」开关
  'estate:pause': [VIEWER_TO_SUBPAGE, {}],
  'estate:resume': [VIEWER_TO_SUBPAGE, {}],
  'estate:floor': ['both', { floor: 'any' }],     // 下行 = 直嵌 / 调试接口；上行 = 用户切了楼层（直嵌时给外层页）
  'v3d:fly': [VIEWER_TO_SUBPAGE, { hotspot: 'any' }],
  'v3d:mode': [VIEWER_TO_SUBPAGE, { mode: 'string' }],
  'v3d:flows': [VIEWER_TO_SUBPAGE, { on: 'boolean?' }],
  'v3d:backdrop': [VIEWER_TO_SUBPAGE, { bitmap: 'any' }],   // Part 3 §3：转场用的底图快照（ImageBitmap，可转移；三维页用完自己 close）
  'v3d:viewport': [SUBPAGE_TO_VIEWER, { tileCache: 'number?' }],   // Part 3 §5：显存 / 内存吃紧时请宿主收紧解码瓦片缓存
  'v3d:budget': [SUBPAGE_TO_VIEWER, {}],                           // 直嵌接口：三维页自报的预算摘要
  'estate:go': [SUBPAGE_TO_VIEWER, { node: 'string' }],   // S2-B：三维页 → 宿主：进入区域下的子地图（node = 子地图 id，宿主只认当前图的子节点）
  'estate:ready': [SUBPAGE_TO_VIEWER, {}],
  'estate:fail': [SUBPAGE_TO_VIEWER, { reason: 'string?' }],
  'estate:progress': [SUBPAGE_TO_VIEWER, { loaded: 'number', total: 'number?', what: 'string?' }],   // fix3：三维模型下载字节进度（total 0 = 不知道总大小）
  'estate:key': [SUBPAGE_TO_VIEWER, { key: 'string' }],
  'estate:select': [SUBPAGE_TO_VIEWER, { name: 'string?' }],   // 直嵌接口
  'estate:loot': [SUBPAGE_TO_VIEWER, { id: 'string', name: 'string', place: 'string?', hidden: 'boolean?', floor: 'string?' }],   // Part 8-1：三维里点起了一枚发光道具（查看器转成 eden-map:loot 给宿主）
  'v3d:state': [SUBPAGE_TO_VIEWER, {}],                        // 直嵌接口
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
