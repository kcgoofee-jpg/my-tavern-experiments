// 世界书 JIT 条目水合（W6，docs/plans/llm-campaign.md Part B 任务一）：「人在哪，只挂载哪」——
// 按当前地点的激活集（W1 spatial.activationOf：自身 + 跨层出口 + 同层几何邻近）动态开关**我们附加书里**
// 带 extra.eden_id 的条目（enabled 字段），离开区域无损卸载。主邻接源是几何邻近（数据事实：全城真跨层
// link 只有 2 处，其余 56 个 link 是 lm_* 三维详情页——见任务书 §8.2）；条目范围**数据驱动**：条目自身的
// strategy.keys（或 ST 的 key）∩ 激活集即活跃判定，不发明任何 place 元数据（裁决 9/10）。
// 主权纪律：只动我们的条目；用户手动关过的（disabled 且无 JIT 关闭标记）→ 进 markIgnore，宿主记
// extra.eden_jit_ignore=1，从此永不碰；constant 条目永不 JIT。没钉在具体地点（pinned=false）时一个都不
// 开关——认不出的地点不等于「整本书都没人要」（FIX-3）。写入成本（裁决 10）：激活集哈希没变就不写，
// 幂等由调用方的 {floor, hash} 水位保证。纯模块：不碰酒馆全局 / DOM / 存储 / 网络。tests/worldbook-jit.test.mjs。
import { seedOf } from '../core/rng.mjs';

export const WORLDBOOK_JIT_STORAGE_KEY = 'edenMapWbJit';

const norm = s => String(s || '').replace(/\s+/g, '').trim();

/** 条目 → 触发词表（TH 形状 strategy.keys 优先，ST 的 key 兼容）；constant / 无词表 = null（永不 JIT） */
export function keysOf(e) {
  const keys = e?.strategy?.keys || e?.key;
  if (!Array.isArray(keys) || !keys.length) return null;
  if (e?.strategy?.type === 'constant') return null;
  return keys.map(norm).filter(Boolean);
}

/**
 * 激活计划：entries = 附加书条目数组（TH / ST 形状都收），activeNames = Set<string>（已去空格的名字）。
 * o.pinned = 玩家是否被钉在一个具体地点（spatial-contract.activationState.pinned：标记点或房间表里的房间）。
 *   false（只写到「某某宅邸」「上层」这类场地名，或干脆认不出）→ **一个条目都不开关**：认不出的地点不能当
 *   「整本书都没人要」来用，否则一次粗粒度写法就把附加书清空（FIX-3；用户手动关过的条目照旧记 ignore）。
 * 返回 { enable:[id], disable:[id], markIgnore:[id], ignored:n, untouched:n, on:n, off:n }：
 *   enable/disable = 要改 enabled 的条目（disable 同时要求宿主记 extra.eden_jit=1，enable 时清 0）；
 *   markIgnore     = 「关着且不是 JIT 关的」＝用户手动关的 → 宿主记 extra.eden_jit_ignore=1，从此永不碰（裁决 9）；
 *   ignored        = 已带 ignore 标记、本轮跳过的条数；untouched = 与激活无关（constant / 无 eden_id）条数；
 *   on / off       = **本轮之后**这本书里被本计划管辖的关键词条目各有多少开着 / 关着（不是增删量——日志与
 *                    健康面板报的是这个，增删量只算在 enable / disable 的长度里，FIX-3）。
 */
export function planActivation(entries, activeNames, o = {}) {
  const active = activeNames instanceof Set ? activeNames : new Set(activeNames || []);
  const pinned = o.pinned !== false;
  const out = { enable: [], disable: [], markIgnore: [], ignored: 0, untouched: 0, on: 0, off: 0 };
  for (const e of Array.isArray(entries) ? entries : []) {
    const id = e?.extra?.eden_id;
    if (!id) { out.untouched++; continue; }
    if (e?.extra?.eden_jit_ignore) { out.ignored++; continue; }
    const keys = keysOf(e);
    if (!keys) { out.untouched++; continue; }
    const want = keys.some(k => active.has(k));
    const isOn = e?.enabled !== false;
    const jitOff = e?.extra?.eden_jit === 1;
    if (!isOn && !jitOff) { out.markIgnore.push(id); out.off++; continue; }   // 用户手动关的：立刻标记，JIT 从此永不碰（裁决 9）
    const endOn = pinned ? want : isOn;   // 没钉住就地现状：所有开关都是空操作
    if (endOn) out.on++; else out.off++;
    if (endOn === isOn) { out.untouched++; continue; }
    if (endOn) out.enable.push(id); else out.disable.push(id);
  }
  return out;
}

/** 计划 → updater 用的变更描述：[{ id, enabled, extra }]（宿主在 updateWorldbookWith 的 updater 里对号入座）。 */
export function applyPlan(entries, plan) {
  const mutate = [];
  const find = id => (Array.isArray(entries) ? entries : []).find(e => e?.extra?.eden_id === id);
  for (const id of plan?.markIgnore || []) { const e = find(id); if (e) mutate.push({ id, enabled: e.enabled !== false, extra: { eden_jit_ignore: 1 } }); }
  for (const id of plan?.disable || []) mutate.push({ id, enabled: false, extra: { eden_jit: 1 } });
  for (const id of plan?.enable || []) mutate.push({ id, enabled: true, extra: { eden_jit: 0 } });
  return mutate;
}

/** D43 (WB-1): the JIT is switched off -> every entry it had disabled (extra.eden_jit === 1) is enabled again. Returns the same mutation shape as applyPlan. */
export function restorePlan(entries) {
  return (Array.isArray(entries) ? entries : []).filter(e => e?.extra?.eden_id && e.extra.eden_jit === 1)
    .map(e => ({ id: e.extra.eden_id, enabled: true, extra: { eden_jit: 0 } }));
}

/** 激活集指纹：排序后哈希（确定性）——哈希没变就不写世界书（裁决 10 的写入门）。 */
export const hashOf = names => seedOf([...(names || [])].map(norm).sort().join('|')).toString(36);

/** 水位：prev = { floor, hash }；激活集哈希没变 → 不写。 */
export const shouldWrite = (prev, hash) => !prev || prev.hash !== hash;

// ---------------- 静默绑定代理（任务二）：条目要生效，书得挂在全局 / 角色 / 聊天任一处 ----------------
// 旧行为：书在那儿但一处都没挂 → 前端提示玩家自己进世界书设置里勾「全局有效」。这打破沉浸感，也把
// 一件纯技术的事推给玩家。这里改成**静默水合**：自己找一档挂上，只在开发日志留一条 trace。
export const BIND_ORDER = ['chat', 'char', 'global'];   // 越靠前越贴身：聊天 > 当前角色的附加书 > 全局
/**
 * 静默绑定计划：binding = wbsync.bindingOf 的结果 { global, char, chat }（查不了的项为 null）。
 *   - 已经挂在哪一处 → 'none'：**绝不改用户的选择**，也不重复挂（重复挂 = 同一本书被注入两次）；
 *   - 一处都没挂 → 按 BIND_ORDER 找第一档接口可用的（聊天世界书换聊天自动跟着走、不串味儿；全局最后兜底）；
 *   - api 里为假 = 这个酒馆助手版本没有该接口，跳过；全都不行 → 'none'（这时才值得记一条 trace）。
 * 纯判定：不调接口、不写任何东西。tests/silent_hydration.test.mjs。
 */
export function bindPlan(binding, o = {}) {
  const b = binding && typeof binding === 'object' ? binding : null;
  if (b && (b.global || b.char || b.chat)) return 'none';
  const api = o.api && typeof o.api === 'object' ? o.api : { chat: true, char: true, global: true };
  for (const w of BIND_ORDER) if (api[w]) return w;
  return 'none';
}
