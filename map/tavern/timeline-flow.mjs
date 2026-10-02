// 时间轴回放（Part 5-4）与 W3 关键帧缓存的宿主侧接线（S5-1 自 eden-map.js 原样搬出）。
// 工厂风格同 host-*.mjs：createX(host) 只在入口调用一次；host 是入口给的依赖袋（活的变量 = 取 / 存器，函数 = 晚绑定转发），DEPS 是本模块要用的全部键。
export const DEPS = [
  'mvuBridge', 'scriptBase', 'life', 'post', 'push', 'root', 'sendEvents', 'sendTrips', 'CHM', 'tripsParseModule', 'alive', 'chars', 'floorNow', 'rep', 'roster', 'uiLang',
];
export function createTimelineFlow(host) {
  for (const k of DEPS) if (!(k in host)) throw new Error('timeline-flow: missing dep ' + k);
  const { mvuBridge, scriptBase, life, post, push, root, sendEvents, sendTrips } = host;
  // ---------------- 时间轴回放（Part 5-4，tavern/timeline.mjs）：标题栏 ⏱ 进出，拖动滑块把地图退回那一楼 ----------------
  const tlBtn = root.querySelector('.em-tl-btn'), tlEl = root.querySelector('.em-tl'), tlR = root.querySelector('.em-tl-r'), tlV = root.querySelector('.em-tl-v');
  let timelineModule = null, tlOn = false; const tlCache = new Map();
  let keyframesModule = null; import(scriptBase + 'tavern/keyframes.mjs').then(m => { keyframesModule = m; }).catch(e => console.warn('[map] timeline-flow: keyframes import failed', e));
  import(scriptBase + 'tavern/timeline.mjs').then(m => { timelineModule = m; if (host.floorNow >= 0) tlBtn.hidden = false; }).catch(e => console.warn('[map] timeline-flow: timeline import failed', e));
  // W3 关键帧缓存（tavern/keyframes.mjs，可丢弃缓存：删掉 eden_map.关键帧 从原文重算逐项一致）：
  // 原料 = walk 变更点表（tlWalk，只增量前进），压缩视图挂聊天变量 eden_map.关键帧。拖拽吃缓存不打桥——
  // 200+ 楼的聊天拖时间轴不再每楼都问一遍 perFloorStat / getRaw。
  let tlWalk = { top: -1, pts: [] }, kfView = null, kfDirty = false;
  const kfReset = () => { tlWalk = { top: -1, pts: [] }; kfView = null; kfDirty = false; };
  // 取数依赖（纯模块不碰酒馆全局：读楼 / 该楼变量 / 人物解析都在这里注入）
  const tlDeps = () => ({
    getRaw: x => { try { return getChatMessages(x + '-' + x)?.[0]?.message || ''; } catch (e) { return ''; } },
    perFloorStat: x => mvuBridge.perFloorStat(x), mvuGet: (s, p) => mvuBridge.mvuGet(s, p), varMap: mvuBridge.varMap,
    parseChars: host.CHM?.parseChars, mvuChars: host.CHM?.mvuChars, patchPlace: host.tripsParseModule?.patchPlace,
    lp: mvuBridge.varMap.location ? '/' + String(mvuBridge.varMap.location).split('.').join('/') : '',
    keyAt: f => (kfView && keyframesModule ? keyframesModule.stateAt(kfView, f) : null),   // W3 兜底层：MVU 与 JSONPatch 都没有时退关键帧（结果带 approx）
  });
  function tlState(f) {
    if (!timelineModule || f < 0) return null;
    if (tlCache.has(f)) return tlCache.get(f);
    let st = null;
    try { st = timelineModule.floorState(f, tlDeps()); } catch (e) {}
    if (st) { tlCache.set(f, st); if (tlCache.size > 240) tlCache.delete(tlCache.keys().next().value); }
    return st;
  }
  // 历史轨迹（Part 5-4）：把这一楼之前的落脚点连成行程 → 复用现成的行程图层（地点之间的虚线弧），不另起一张骨头图。
  let tlTrailAt = -1;
  function trailPts(f) {   // 增量足迹：桥调用只发生在「前进方向的新楼」上（回拖吃缓存前缀，零桥）
    if (f > tlWalk.top) {
      let add = [];
      try { add = timelineModule.walk(tlWalk.top + 1, f, tlDeps()) || []; } catch (e) {}
      const last = tlWalk.pts[tlWalk.pts.length - 1];
      if (last && add.length && add[0].here === last.here) add = add.slice(1);   // 跨段边界同址去重
      tlWalk.pts = tlWalk.pts.concat(add); tlWalk.top = f;
      const v = keyframesModule ? keyframesModule.advance(kfView, tlWalk.pts, host.floorNow) : null;   // 检查点式幂等：内容没变不写
      if (v && v !== kfView) { kfView = v; kfDirty = true; }
    }
    return tlWalk.pts;
  }
  function tlTrail(f) {
    if (!timelineModule || !host.alive || tlTrailAt === f) return; tlTrailAt = f;
    let pts = [];
    try { pts = kfView && kfView.top >= f ? keyframesModule.flatten(kfView).filter(p => p.floor <= f) : trailPts(f); }
    catch (e) { try { pts = timelineModule.walk(0, f, tlDeps()) || []; } catch (x) {} }   // 兜底：老路径全量重算（不该走到）
    const items = [];
    for (let i = 1; i < pts.length; i++) items.push({ floor: pts[i].floor, from: pts[i - 1].here, to: pts[i].here, time: pts[i].time || '' });
    post({ type: 'eden-map:trips', items });
  }
  function tlScrub(f) {
    f = Math.max(0, Math.min(host.floorNow, Math.round(f))); rpFloor = f; paintReplay();
    const st = timelineModule ? timelineModule.liveAtNewest(tlState(f), f, host.floorNow, () => mvuBridge.here()) : tlState(f);   // SW2-04: the newest floor shows the live place
    tlV.textContent = [`聊天第 ${f} 楼`, st?.time, st?.here].filter(Boolean).join(' · ');   // U-FIX-5 R-01 / D1-01：楼号在最前（窄时截掉的是地点，不是楼号），写明是聊天楼层
    if (!st || !host.alive) return;
    post({ type: 'eden-map:here', value: st.here, replay: true });   // 查看器只重画；探索记录已被 replay 静默
    post({ type: 'eden-map:chars', v: 1, floor: f, items: st.chars, replay: true });
    tlTrail(f);   // 拖到哪一楼，就重画到那一楼为止的主角轨迹
  }
  // HEADER-1: while the replay is on, the host clock and the place pill show one clear 「回放」 state (accent outline, tooltip "showing floor N"), not the live values beside the past ones
  const RP = { zh: ['回放', f => `显示聊天第 ${f} 楼，不是当下`], en: ['Replay', f => `Showing message #${f}, not the latest`] };
  const rpEls = () => [root.querySelector('.em-here'), root.querySelector('.em-clock')].filter(Boolean);
  let rpFloor = -1;
  function paintReplay() {
    const on = tlOn, [word, tip] = RP[host.uiLang === 'en' ? 'en' : 'zh']; root.classList.toggle('em-replay', on);
    for (const el of rpEls()) { if (on) { el.dataset.rp = word; el.title = tip(rpFloor); el.setAttribute('aria-label', word + ' · ' + tip(rpFloor)); } else { delete el.dataset.rp; el.removeAttribute('aria-label'); } }
  }
  root.addEventListener('em-replay-repaint', () => { if (tlOn) paintReplay(); });
  function tlEnter() { if (!timelineModule || host.floorNow < 1) return; tlOn = true; tlEl.hidden = false; tlBtn.classList.add('on'); tlR.max = host.floorNow; tlR.value = host.floorNow; tlScrub(host.floorNow); }
  function tlExit() {
    if (!tlOn) return; tlOn = false; tlEl.hidden = true; tlBtn.classList.remove('on'); paintReplay();
    if (life.dead) return;
    tlTrailAt = -1; sendTrips();   // 轨迹恢复成当下的行程（回放期间临时画过的那条线撤掉）
    push(); if (host.alive) post({ type: 'eden-map:here', value: mvuBridge.here() });   // U-FIX-7：回放推过别的地点；push 只在地点变了才发，这里把当下的地点补发回去（当前位置按钮、高亮跟着回来）
    if (host.alive) { post({ type: 'eden-map:chars', v: 1, floor: host.floorNow, items: host.chars, rosters: host.roster, groups: mvuBridge.groupsView(host.roster), rep: host.rep, stageOrder: mvuBridge.stageOrder, portraits: mvuBridge.portraits }); sendEvents(); }   // 回当下：地点 / 人物 / 事态全部重推
  }
  tlBtn.addEventListener('click', () => (tlOn ? tlExit() : tlEnter()));
  tlEl.querySelector('.em-tl-x').addEventListener('click', tlExit);
  tlR.addEventListener('input', () => tlScrub(+tlR.value));
  return {
    get keyframesModule() { return keyframesModule; }, kfReset, get kfView() { return kfView; }, set kfView(v) { kfView = v; }, tlBtn, tlCache, tlEl, tlExit, get timelineModule() { return timelineModule; },
    get tlOn() { return tlOn; }, set tlOn(v) { tlOn = v; }, get tlWalk() { return tlWalk; }, set tlWalk(v) { tlWalk = v; },
  };
}
