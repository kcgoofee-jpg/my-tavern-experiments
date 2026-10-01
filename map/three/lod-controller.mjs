// Part 3 §4：动态 LOD 控制器（把 core/lod.mjs 的档位决策接到 three 的场景上）。
// 约定（调用方实现）：
//   load(detail) → Promise<{ root }>：'low' / 'high' 两档异步加载；'placeholder' 由 placeholder() 同步生成
//   apply({ detail, root })          ：把加载结果挂进场景（调用方负责旧 root 的 dispose）
// 镜头飞走时迟到的加载结果一律丢弃（generation token），加载失败保留当前那一档（画面上永远不出现空洞）。
// 本模块不 import three，只用 core/lod.mjs 的纯策略。
import * as L from '../core/lod.mjs';
import { distanceMetric } from './culling.mjs';

export function createLodController({ placeholder, load, apply, bands, perFrame = 2, onSwap } = {}) {
  // state = LOD 档位（far / mid / near，交给纯策略）；detail = 实际展示的资产（placeholder / low / high）
  const models = new Map();       // id -> { root, size, state, detail, pending, pos }
  const tokens = L.createTokens();
  let swaps = 0, rejected = 0, failed = 0;

  /** 登记一个可分级模型：root 是当前显示的对象，size 是取景尺寸（包围球直径，米） */
  function add(id, { root, size, pos, state = 'far', detail = 'placeholder' }) {
    models.set(id, { root, size: size || 1, pos: pos || null, state, detail, pending: null, ratio: 0 });
    return id;
  }
  function remove(id) { models.delete(id); }
  function clear() { models.clear(); tokens.reset(); }

  /** 每帧调用：把观测（距离 / 尺寸）交给纯策略，必要时发起一次异步升档 */
  function update({ camera, target, viewportWidth = 1, viewportHeight = 1 } = {}) {
    const obs = [];
    for (const [id, m] of models) {
      const size = m.size || 1;
      const distance = distanceMetric({ camera, target: m.pos || target, size, viewportWidth, viewportHeight });
      const o = L.observe({ distance, size, visible: true });
      m.ratio = o.ratio;
      obs.push({ id, ratio: o.ratio, pending: !!m.pending });
    }
    const ids = L.schedule(obs, { perFrame });
    for (const id of ids) {
      const m = models.get(id); if (!m) continue;
      const st = L.stepState(m.state, { distance: m.ratio * (m.size || 1), size: m.size || 1 }, bands);
      if (!st.changed) continue;
      const plan = L.plan(m.state, st.state, { placeholder: !!placeholder, low: true, high: true });
      m.state = st.state;
      try { onSwap?.({ id, ...plan }); } catch (e) {}
      if (plan.load) startLoad(id, plan.load);
      else if (plan.detail === 'placeholder' && placeholder) try { apply({ id, detail: 'placeholder', root: placeholder({ id, model: m }) }); m.detail = 'placeholder'; } catch (e) {}
      swaps++;
    }
    return { evaluated: ids.length, swaps, rejected, failed };
  }

  async function startLoad(id, detail) {
    const m = models.get(id); if (!m || !load) return;
    const token = tokens.next();
    m.pending = detail;
    let res = null;
    try { res = await load(detail); } catch (e) { res = null; }
    const cur = models.get(id);
    if (!cur || !tokens.accept(token)) { rejected++; if (cur) cur.pending = null; return; }   // 镜头飞走：丢弃
    cur.pending = null;
    if (!res || !res.root) { failed++; return; }   // 失败：保留当前那一档，画面不出现空洞
    try { apply({ id, detail, root: res.root }); cur.detail = detail; } catch (e) { failed++; }
  }

  /** 强制切到某一档（初始化 / 设置切换）：detail = placeholder | low | high */
  function force(id, detail) {
    const m = models.get(id); if (!m) return false;
    const state = { placeholder: 'far', low: 'mid', high: 'near' }[detail] || m.state;
    const plan = L.plan(m.state, state, { placeholder: !!placeholder, low: true, high: true });
    m.state = state;
    if (plan.load) startLoad(id, plan.load);
    else if (detail === 'placeholder' && placeholder) try { apply({ id, detail, root: placeholder({ id, model: m }) }); m.detail = 'placeholder'; } catch (e) {}
    return true;
  }

  function describe() {
    const counts = { far: 0, mid: 0, near: 0 };
    for (const m of models.values()) counts[m.state] = (counts[m.state] || 0) + 1;
    return { ...L.describe({ counts, generation: tokens.value, instanceGroups: 0, drawCalls: 0, rejectedLoads: rejected }), swaps, failed, models: models.size };
  }

  return { add, remove, clear, update, force, describe, get generation() { return tokens.value; } };
}
