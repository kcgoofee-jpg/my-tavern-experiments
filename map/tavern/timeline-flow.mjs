// 时间轴回放（Part 5-4）与 W3 关键帧缓存的宿主侧接线（S5-1 自 eden-map.js 原样搬出）。
// 工厂风格同 host-*.mjs：createX(host) 只在入口调用一次；host 是入口给的依赖袋（活的变量 = 取 / 存器，函数 = 晚绑定转发），DEPS 是本模块要用的全部键。
export const DEPS = [
  'BR', 'SELF', 'life', 'post', 'push', 'root', 'sendEvents', 'sendTrips', 'CHM', 'TRm', 'alive', 'chars', 'floorNow', 'rep', 'roster',
];
export function createTimelineFlow(host) {
  for (const k of DEPS) if (!(k in host)) throw new Error('timeline-flow: missing dep ' + k);
  const { BR, SELF, life, post, push, root, sendEvents, sendTrips } = host;
  // ---------------- 时间轴回放（Part 5-4，tavern/timeline.mjs）：标题栏 ⏱ 进出，拖动滑块把地图退回那一楼 ----------------
  const tlBtn = root.querySelector('.em-tl-btn'), tlEl = root.querySelector('.em-tl'), tlR = root.querySelector('.em-tl-r'), tlV = root.querySelector('.em-tl-v');
  let TLm = null, tlOn = false; const tlCache = new Map();
  let KFm = null; import(SELF + 'tavern/keyframes.mjs').then(m => { KFm = m; }).catch(() => {});
  import(SELF + 'tavern/timeline.mjs').then(m => { TLm = m; if (host.floorNow >= 0) tlBtn.hidden = false; }).catch(() => {});
  // W3 关键帧缓存（tavern/keyframes.mjs，可丢弃缓存：删掉 eden_map.关键帧 从原文重算逐项一致）：
  // 原料 = walk 变更点表（tlWalk，只增量前进），压缩视图挂聊天变量 eden_map.关键帧。拖拽吃缓存不打桥——
  // 200+ 楼的聊天拖时间轴不再每楼都问一遍 perFloorStat / getRaw。
  let tlWalk = { top: -1, pts: [] }, kfView = null, kfDirty = false;
  const kfReset = () => { tlWalk = { top: -1, pts: [] }; kfView = null; kfDirty = false; };
  // 取数依赖（纯模块不碰酒馆全局：读楼 / 该楼变量 / 人物解析都在这里注入）
  const tlDeps = () => ({
    getRaw: x => { try { return getChatMessages(x + '-' + x)?.[0]?.message || ''; } catch (e) { return ''; } },
    perFloorStat: x => BR.perFloorStat(x), mvuGet: (s, p) => BR.mvuGet(s, p), varMap: BR.varMap,
    parseChars: host.CHM?.parseChars, mvuChars: host.CHM?.mvuChars, patchPlace: host.TRm?.patchPlace,
    lp: BR.varMap.location ? '/' + String(BR.varMap.location).split('.').join('/') : '',
    keyAt: f => (kfView && KFm ? KFm.stateAt(kfView, f) : null),   // W3 兜底层：MVU 与 JSONPatch 都没有时退关键帧（结果带 approx）
  });
  function tlState(f) {
    if (!TLm || f < 0) return null;
    if (tlCache.has(f)) return tlCache.get(f);
    let st = null;
    try { st = TLm.floorState(f, tlDeps()); } catch (e) {}
    if (st) { tlCache.set(f, st); if (tlCache.size > 240) tlCache.delete(tlCache.keys().next().value); }
    return st;
  }
  // 历史轨迹（Part 5-4）：把这一楼之前的落脚点连成行程 → 复用现成的行程图层（地点之间的虚线弧），不另起一张骨头图。
  let tlTrailAt = -1;
  function trailPts(f) {   // 增量足迹：桥调用只发生在「前进方向的新楼」上（回拖吃缓存前缀，零桥）
    if (f > tlWalk.top) {
      let add = [];
      try { add = TLm.walk(tlWalk.top + 1, f, tlDeps()) || []; } catch (e) {}
      const last = tlWalk.pts[tlWalk.pts.length - 1];
      if (last && add.length && add[0].here === last.here) add = add.slice(1);   // 跨段边界同址去重
      tlWalk.pts = tlWalk.pts.concat(add); tlWalk.top = f;
      const v = KFm ? KFm.advance(kfView, tlWalk.pts, host.floorNow) : null;   // 检查点式幂等：内容没变不写
      if (v && v !== kfView) { kfView = v; kfDirty = true; }
    }
    return tlWalk.pts;
  }
  function tlTrail(f) {
    if (!TLm || !host.alive || tlTrailAt === f) return; tlTrailAt = f;
    let pts = [];
    try { pts = kfView && kfView.top >= f ? KFm.flatten(kfView).filter(p => p.floor <= f) : trailPts(f); }
    catch (e) { try { pts = TLm.walk(0, f, tlDeps()) || []; } catch (x) {} }   // 兜底：老路径全量重算（不该走到）
    const items = [];
    for (let i = 1; i < pts.length; i++) items.push({ floor: pts[i].floor, from: pts[i - 1].here, to: pts[i].here, time: pts[i].time || '' });
    post({ type: 'eden-map:trips', items });
  }
  function tlScrub(f) {
    f = Math.max(0, Math.min(host.floorNow, Math.round(f)));
    const st = tlState(f);
    tlV.textContent = (st?.here ? `${st.here} · ` : '') + (st?.time ? st.time + ' · ' : '') + `第 ${f} 楼`;
    if (!st || !host.alive) return;
    post({ type: 'eden-map:here', value: st.here, replay: true });   // 查看器只重画；探索记录已被 replay 静默
    post({ type: 'eden-map:chars', v: 1, floor: f, items: st.chars, replay: true });
    tlTrail(f);   // 拖到哪一楼，就重画到那一楼为止的主角轨迹
  }
  function tlEnter() { if (!TLm || host.floorNow < 1) return; tlOn = true; tlEl.hidden = false; tlBtn.classList.add('on'); tlR.max = host.floorNow; tlR.value = host.floorNow; tlScrub(host.floorNow); }
  function tlExit() {
    if (!tlOn) return; tlOn = false; tlEl.hidden = true; tlBtn.classList.remove('on');
    if (life.dead) return;
    tlTrailAt = -1; sendTrips();   // 轨迹恢复成当下的行程（回放期间临时画过的那条线撤掉）
    push(); if (host.alive) { post({ type: 'eden-map:chars', v: 1, floor: host.floorNow, items: host.chars, rosters: host.roster, groups: BR.groupsView(host.roster), rep: host.rep, stageOrder: BR.stageOrder, portraits: BR.portraits }); sendEvents(); }   // 回当下：地点 / 人物 / 事态全部重推
  }
  tlBtn.addEventListener('click', () => (tlOn ? tlExit() : tlEnter()));
  tlEl.querySelector('.em-tl-x').addEventListener('click', tlExit);
  tlR.addEventListener('input', () => tlScrub(+tlR.value));
  return {
    get KFm() { return KFm; }, kfReset, get kfView() { return kfView; }, set kfView(v) { kfView = v; }, tlBtn, tlCache, tlEl, tlExit, get TLm() { return TLm; },
    get tlOn() { return tlOn; }, set tlOn(v) { tlOn = v; }, get tlWalk() { return tlWalk; }, set tlWalk(v) { tlWalk = v; },
  };
}
