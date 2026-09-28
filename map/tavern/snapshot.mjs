// MVU 快照选取 + 生成状态（v0.9.9；依据见 docs/mvu-integration.md）
// 纯函数，不碰酒馆全局：eden-map.js 传入读楼函数，node 测试传假数据。
//
// 规则（照 MVU 自己的 getLastValidMessageId，mvu-src/src/util.ts:12）：
// - 屏幕上那条 = 最后一条非隐藏楼的「当前 swipe」变量（酒馆助手 getVariables latest 的语义，JS-Slash-Runner variables.ts:65）
// - 它没有 stat_data（正在生成 / 新 swipe 还没解析 / 生成被杀断在半路 / MVU 解析失败）→ 往前找最近一楼有 stat_data 的，
//   标 pending（正在生成，等 MVU 提交）或 stale（没在生成却缺快照：数据可能落后）；地图显示上一份数据并挂「未确认」，不显示空白或错数据
// - 一楼都没有 → none
export const WALK_MAX = 400;   // MVU 自动清理默认保留最近 20 楼 + 每 50 楼一个快照（mvu-src/src/store.ts:300-305），400 楼内必有快照

const has = v => !!v && typeof v === 'object' && v.stat_data && typeof v.stat_data === 'object';

// readFloor(id) → { vars, system, role } | null ；vars 是该楼当前 swipe 的变量对象
export function pickStat(readFloor, lastId, { generating = false } = {}) {
  let top = lastId;
  for (let i = lastId, n = 0; i >= 0 && n < 8; i--, n++) { const f = readFloor(i); if (f && !f.system) { top = i; break; } }   // 跳过隐藏楼（与 latest 一致）
  const head = readFloor(top);
  if (head && has(head.vars)) return { stat: head.vars.stat_data, floor: top, top, state: generating ? 'pending' : 'ok' };
  for (let i = top - 1, n = 0; i >= 0 && n < WALK_MAX; i--, n++) {
    const f = readFloor(i); if (f && has(f.vars)) return { stat: f.vars.stat_data, floor: i, top, state: generating ? 'pending' : (head?.role === 'user' ? 'ok' : 'stale') };
  }
  return { stat: null, floor: -1, top, state: generating ? 'pending' : 'none' };
}
// 用户楼：MVU 在 MESSAGE_SENT 时也会写（mvu-src/src/function/update/index.ts:18），没写到就用上一楼，属正常（不算 stale）

// 生成状态（eden-map.js GEN）：GENERATION_STARTED 置位，ENDED / STOPPED 清零，180 s 超时自动清（断网 / 被杀后 ENDED 永远不来）。
