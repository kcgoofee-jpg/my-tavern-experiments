// 长程关键帧压缩（W3，docs/plans/llm-campaign.md；SokoBench 的关键帧记忆落地）：
// 时间轴在 200+ 楼的长篇里拖拽不该每楼都打桥——把「逐楼状态」压缩成「变更点关键帧」：
// 一个关键帧 = { floor, here, time, until }（该地点从 floor 一直站到 until），旧楼回放按帧取，
// 近窗（W_RECENT）逐楼保持精确。原料 = walk() 的变更点表（同形：[{floor, here, time}]，相邻同址已去重）。
// 不变量（战役裁决 7）：关键帧是**可丢弃缓存**——删掉 eden_map.关键帧 后从聊天原文重算必须逐项一致
// （tests/keyframe_compression.test.mjs 零漂移对账锁死）；压缩是确定性的（同输入同输出、幂等）。
// 截断显式标记（truncated + em-unsure 先例）：超出帧上限的最老历史丢弃并计数，回放不到就如实返回 null，
// 绝不用邻近帧冒充。本模块不碰酒馆全局 / DOM / 存储（node 单测机械检查）。
export const W_RECENT = 20;        // 近窗宽度：与 MVU 自己的 20 楼保留窗对齐（tavern/snapshot.mjs 注释）
export const MAX_FRAMES = 50;      // 帧上限：50 帧 × 平均跨度 ≈ 覆盖数百楼；超出丢最老并记数
const str = (v, n) => { try { return v == null ? '' : String(v).trim().slice(0, n); } catch (e) { return ''; } };

/**
 * 变更点表 → 关键帧视图 { v, top, frames, truncated }。
 * pts = walk() 输出（[{floor, here, time}]，可乱序 / 可含相邻同址——这里统一收口）；top = 当前最新楼。
 * 确定性：排序按楼层、同楼取后到的、相邻同址合并；同输入字节级同输出；对 flatten 的输出再压缩 = 原样（幂等）。
 */
export function compress(pts, top, { w = W_RECENT, cap = MAX_FRAMES } = {}) {
  const T = Math.max(0, Math.round(+top) || 0);
  const clean = [];
  for (const p of Array.isArray(pts) ? pts : []) {
    const floor = Math.round(+p?.floor);
    const here = str(p?.here, 120);
    if (!Number.isFinite(floor) || floor < 0 || floor > T || !here) continue;
    const prev = clean[clean.length - 1];
    if (prev && prev.floor === floor) { clean[clean.length - 1] = { floor, here, time: str(p?.time, 40) }; continue; }   // 同楼取后到
    if (prev && prev.here === here) continue;   // 相邻同址合并（walk 已去重，这里兜底）
    clean.push({ floor, here, time: str(p?.time, 40) });
  }
  clean.sort((a, b) => a.floor - b.floor);
  const truncated = Math.max(0, clean.length - Math.max(1, Math.round(+cap) || MAX_FRAMES));
  const frames = clean.slice(truncated);
  for (let i = 0; i < frames.length; i++) frames[i].until = i + 1 < frames.length ? frames[i + 1].floor - 1 : T;
  return { v: 1, top: T, w: Math.max(1, Math.round(+w) || W_RECENT), frames, truncated };
}

/** 第 f 楼的回放状态：{ here, time, approx } | null（首帧之前的更老历史 = null，如实说没有）。
 *  approx = 落在近窗之外（W_RECENT 前的旧楼）：地点 / 时刻精确，但人物等细节不在关键帧里（UI 走 em-unsure 先例）。 */
export function stateAt(view, f) {
  const floor = Math.round(+f);
  if (!view || !Array.isArray(view.frames) || !Number.isFinite(floor) || floor < 0) return null;
  for (let i = view.frames.length - 1; i >= 0; i--) {
    const k = view.frames[i];
    if (floor >= k.floor && floor <= (k.until ?? view.top)) return { here: k.here, time: k.time || '', approx: floor < view.top - (view.w ?? W_RECENT) + 1 };
    if (k.floor < floor) break;
  }
  return null;
}

/** 视图 → 变更点表（walk 输出同形）：给行程图层连弧用，0 桥调用。 */
export const flatten = view => (view?.frames || []).map(({ floor, here, time }) => ({ floor, here, time }));

/** 检查点式前进（modes.nextCheckpoint 同款幂等）：楼层没走、内容没变 → 返回原对象（调用方据此不写）。 */
export function advance(view, pts, top) {
  const next = compress(pts, top, { w: view?.w, cap: MAX_FRAMES });
  const same = view && view.top === next.top && view.truncated === next.truncated &&
    JSON.stringify(view.frames) === JSON.stringify(next.frames);
  return same ? view : next;
}
