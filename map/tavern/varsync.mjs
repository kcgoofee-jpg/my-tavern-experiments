// 变量结算时序守卫（W11，docs/plans/llm-campaign.md）：地图只读不抢写——**空间状态与账本对账的写入一律
// 后置到 VARIABLE_UPDATE_ENDED 之后**，绝不落在主 MVU / 卡内状态引擎的更新窗口里（杜绝两个写者互相覆盖）。
// 三条规则：
//   ① 一轮里发起的结算请求先入队（request），只有在同一轮**末尾**才放行（flush）——宿主读取期间不写变量；
//   ② MVU 在场时的放行点是 VARIABLE_UPDATE_ENDED 事件处理器的尾部（宿主 order：invalidate → push → recompute
//      → flush）；MVU 不在场 = 没有争抢对象，立刻执行（不会死等一个永远不来事件）；
//   ③ 同键请求只留一条（补发是幂等的单项 patch，重复发没有意义）；换聊天 / 实例死亡 → drop，绝不把上一场
//      的补发写进新聊天。
// 纯模块：状态机 + 回调，不碰酒馆全局 / DOM / 存储 / 定时器（时间与事件由调用方注入）；
// node 单测 tests/mvu_lifecycle.test.mjs。
export const REASONS = ['ended', 'round', 'chat', 'manual'];
export const MAX_PASSES = 4;      // 放行时允许的嵌套重入轮数（结算回调又发起一次请求也有上限）
export const MAX_KEYS = 64;       // 队列上限（超了丢最旧的：宁可少补一次，也不让内存无界）

/**
 * 结算闸门。o = { hasMvu?(): bool（MVU 在不在场；缺省 = 不在场，立刻放行），
 *                 epoch?(): number（变量更新代数，core 之外由宿主从桥读；只进摘要，不参与判定），
 *                 maxPasses? }
 */
export function createGate(o = {}) {
  const hasMvu = typeof o.hasMvu === 'function' ? o.hasMvu : () => false;
  const epochOf = typeof o.epoch === 'function' ? o.epoch : () => 0;
  const maxPasses = Math.max(1, Math.round(+o.maxPasses) || MAX_PASSES);
  let queue = [], passes = 0, ran = 0, errors = 0, last = null, dropped = 0;

  const call = fn => { try { fn(); ran++; return true; } catch (e) { errors++; return false; } };

  const gate = {
    /** 结算请求：MVU 在 → 入队（同键替换，保序），放行点由宿主在同一轮末尾调 flush；
     *  MVU 不在 → 立刻执行。返回 { ran, staged, why }。 */
    request(key, fn) {
      if (typeof fn !== 'function') return { ran: 0, staged: 0, why: 'noop' };
      if (!hasMvu()) { call(fn); return { ran: 1, staged: 0, why: 'no-mvu' }; }
      const k = String(key || queue.length);
      const i = queue.findIndex(x => x.key === k);
      if (i >= 0) queue[i] = { key: k, fn };
      else { queue.push({ key: k, fn }); if (queue.length > MAX_KEYS) { queue.shift(); dropped++; } }
      return { ran: 0, staged: queue.length, why: 'deferred' };
    },
    /** 放行：按入队顺序跑完（含放行过程中新入队的请求，最多 maxPasses 轮）。reason 只记账，不改变行为。 */
    flush(reason = 'round') {
      const why = REASONS.includes(reason) ? reason : 'manual';
      const before = ran;
      let p = 0;
      while (queue.length && p < maxPasses) {
        const batch = queue; queue = []; p++;
        for (const item of batch) call(item.fn);
      }
      if (p) { passes += p; last = { reason: why, ran: ran - before, passes: p, epoch: epochOf(), nested: queue.length }; }
      return { ran: ran - before, passes: p, reason: why, epoch: epochOf(), pending: queue.length };
    },
    /** 丢弃未放行的请求（换聊天 / 实例死亡 / 接管）：绝不让上一场的补发落到新聊天里。返回丢弃条数。 */
    drop(reason = 'manual') { const n = queue.length; queue = []; dropped += n; last = { reason: REASONS.includes(reason) ? reason : 'manual', ran: 0, passes: 0, dropped: n, epoch: epochOf() }; return n; },
    pending() { return queue.length; },
    keys() { return queue.map(x => x.key); },
    state() { return queue.length ? 'staged' : 'idle'; },
    /** 标准摘要（自检 / 设置页）：{ state, pending, ran, passes, errors, dropped, last } */
    describe() { return { state: gate.state(), pending: queue.length, ran, passes, errors, dropped, last: last ? { ...last } : null }; },
  };
  return gate;
}

/** 一轮的结算顺序（宿主照这个跑；tests/mvu_lifecycle.test.mjs 对拍）：MVU 更新收尾 → 推送 → 重算 → 放行 */
export const ROUND_ORDER = ['invalidate', 'push', 'recompute', 'flush'];
