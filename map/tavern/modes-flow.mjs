// 交互方式 (a)(d)(e)：状态行注入、空间坐标契约注入、检查点、地点冲突自检（S5-1 自 eden-map.js 原样搬出）。
// 工厂风格同 host-*.mjs：createX(host) 只在入口调用一次；host 是入口给的依赖袋（活的变量 = 取 / 存器，函数 = 晚绑定转发），DEPS 是本模块要用的全部键。
import { cdnFetch, thFn } from './host-tavernhelper.mjs';
import { modelTexts, injectReason } from './model-texts.mjs';
export const DEPS = [
  'mvuBridge', 'contextPipeline', 'scriptBase', 'chatId', 'life', 'lsGet', 'pushSoon', 'recomputeSoon', 'saveRoot', 'userName', 'BASE', 'clock', 'custom', 'customChat', 'here',
  'regNow', 'statSig',
];
export function createModesFlow(host) {
  for (const k of DEPS) if (!(k in host)) throw new Error('modes-flow: missing dep ' + k);
  const { mvuBridge, contextPipeline, scriptBase, chatId, life, lsGet, pushSoon, recomputeSoon, saveRoot, userName } = host;
  // ---------------- 交互方式 (a)(d)(e)（docs/interaction-modes.md；纯逻辑在 tavern/interaction-modes.mjs） ----------------
  // (a) 每次生成前把「地点、在场、时间、行程」压成一行（≤ 设置的 token 上限，默认 150）按固定 id、固定深度注入；重生 / swipe / 重载都覆盖同一条，不叠。
  //     数据没确认（pending / stale）时标「未确认」；卡的提示词里已经有的字段跳过；设置「数据与映射」开关（默认开），深度与上限在「高级」。
  // (e) 最小检查点：eden_map.检查点 = { 楼, swipe }（最后确认的楼层与 swipe），只在确认前进时写（幂等）；启动时对照，楼 / swipe 对不上就作废并从聊天记录重推。
  let stateNow = '', cardSkip = null, cardSkipChat = null, cp = null, cpResume = null;
  const MDm = mvuBridge.modes;   // 纯逻辑模块（interaction-modes.mjs）经桥静态引入，求值即用（原来动态加载后补一次 stateInject，改在启动序列里）
  async function cardSkipFor() {   // 会送到模型的文本（清单与理由见 model-texts.mjs；不含正则脚本 / 助手脚本 / 显示 HTML）里引用了哪些 stat_data 字段；每个聊天算一次
    const c = chatId(); if (cardSkipChat === c && cardSkip) return cardSkip; cardSkipChat = c; cardSkip = {};
    const safe = async f => { try { return await f(); } catch (e) { return undefined; } };   // 每一类来源各自兜底：读不到一类不影响其余
    const d = await safe(() => Promise.resolve(thFn('getCharData')?.('current'))), x = d?.data || d || {};
    const books = [], bw = await safe(() => thFn('getCharWorldbookNames')?.('current'));
    for (const n of [bw?.primary, ...(bw?.additional || [])].filter(Boolean)) { const b = await safe(() => thFn('getWorldbook')?.(n)); if (Array.isArray(b)) books.push(b); }
    const note = await safe(() => (mvuBridge.stContext()?.chatMetadata?.note_prompt)), pre = await safe(() => thFn('getPreset')?.('in_use')?.prompts);
    cardSkip = MDm ? MDm.cardHas(modelTexts({ card: x, books, note, preset: pre }), mvuBridge.varMap) : {};
    return cardSkip;
  }
  /** 设置「状态注入」的一行预览：下一轮会注入的原文，或不注入的原因（off / skipped / empty） */
  function injectPreview() {
    const on = lsGet('edenMapStateInj') !== '0', text = on ? stateText('normal') : '';
    return { text, reason: injectReason({ on, text, skip: cardSkip }) };
  }
  function stateText(type) {
    const n = mvuBridge.chatLen(); if (!MDm || n < 0) return '';
    const r = MDm.snapFor(mvuBridge.pickStat, i => mvuBridge.readFloor(i), n - 1, { type });
    const st = r.stat, get = p => (st ? mvuBridge.getPath(st, p) : undefined);
    let place = String(get(mvuBridge.varMap.location) ?? '').trim(), state = r.state;
    if (mvuBridge.hereSrc === 'tag' && type !== 'swipe' && type !== 'regenerate') { place = host.here; }   // (d) 正文标签兜底的地点
    const pres = st ? mvuBridge.presentNames(st) : [];
    const wt = st ? mvuBridge.worldTimeOf(st) : null, time = wt ? [wt.date, wt.time, wt.period].filter(Boolean).join(' ') : '';
    return MDm.stateLine({ here: userName(place), present: pres, time, trips: (contextPipeline.trips || []).map(t => ({ ...t })), state, skip: cardSkip || {} }, +(lsGet('edenMapStateBudget') || 150));
  }
  function stateInject(type = 'normal') {
    if (life.dead || !MDm) return;
    const on = lsGet('edenMapStateInj') !== '0', text = on ? stateText(type) : '', depth = +(lsGet('edenMapStateDepth') ?? 2);
    const key = text + '|' + depth; if (key === stateNow) return; stateNow = key;
    MDm.applyState(thFn, text, depth);
    if (on && cardSkipChat !== chatId()) cardSkipFor().then(() => { stateNow = ''; stateInject(type); });
  }
  // 空间坐标契约（W1，docs/plans/llm-campaign.md）：当前地点 + 出口 / 守卫锥 / 邻近地标 → ≤120 token 的 JSON 契约
  // （纯编译在 tavern/spatial-contract.mjs；默认关 edenMapSpatial，上限 edenMapSpatialBudget）。与状态行同一轮注入。
  let SpatialM = null, spatialNow = '';
  const ptsCache = new Map();
  function pointsFor(mapId) {
    const p = host.regNow?.maps?.[mapId]?.data;
    if (!p) return Promise.resolve(null);
    if (!ptsCache.has(mapId)) ptsCache.set(mapId, cdnFetch(host.BASE + p).then(r => r.ok ? r.json() : null).catch(() => null));
    return ptsCache.get(mapId);
  }
  async function spatialInject() {
    if (life.dead || lsGet('edenMapSpatial') !== '1' || !host.regNow) return;
    SpatialM ??= await import(scriptBase + 'tavern/spatial-contract.mjs').catch(() => null); if (!SpatialM || life.dead) return;
    const loc = SpatialM.locate(host.regNow, host.here);
    if (!loc?.mapId) { if (spatialNow) { spatialNow = ''; SpatialM.applySpatial(thFn, '', 2); } return; }
    const pts = await pointsFor(loc.mapId);
    const mm = /^(\d{1,2}):(\d{2})/.exec(String(host.clock?.time || '')), t = mm ? (+mm[1] * 60 + +mm[2]) / 1440 : 0;
    const text = SpatialM.coordView({ reg: host.regNow, here: host.here, pointsByMap: { [loc.mapId]: pts }, t, budget: +(lsGet('edenMapSpatialBudget') || 120) });
    if (text === spatialNow) return; spatialNow = text;
    SpatialM.applySpatial(thFn, text, 2);
  }
  function checkpointStep() {   // 确认前进时写检查点（内容没变不写）
    if (!MDm || !host.custom || host.customChat !== chatId()) return;
    const top = mvuBridge.snapTop, sw = mvuBridge.swipeAt(top);
    const n = MDm.nextCheckpoint(cp, { floor: mvuBridge.snapFloor, top, swipe: sw, state: mvuBridge.snapState });
    if (n !== cp) { cp = n; saveRoot(); }
  }
  function checkpointResume(v) {   // loadCustom 里：读检查点并对照聊天
    cp = v && typeof v === 'object' && Number.isInteger(v.楼) ? { 楼: v.楼, swipe: Number.isInteger(v.swipe) ? v.swipe : 0 } : null; cpResume = null;
    if (!MDm) return; const n = mvuBridge.chatLen(); if (n < 0) return;
    cpResume = MDm.resume(cp, i => { const c = mvuBridge.chatAt(i); if (!c) return null; const sv = c.variables?.[c.swipe_id ?? 0]; return { swipe: c.swipe_id ?? 0, hasStat: !!sv?.stat_data, role: c.is_user ? 'user' : 'assistant' }; }, n - 1);
    if (cpResume.reason === 'swiped' || cpResume.reason === 'missing') cp = null;   // 作废：下次确认时重写
    if (cpResume.reason !== 'match' && cpResume.reason !== 'none') { host.statSig = ''; recomputeSoon(0); pushSoon(0); }
  }
  function conflictsNow() {   // 自检：最近 30 楼里 MVU 地点与正文地点标签不一致的楼（只列出，不改）
    if (!MDm || !mvuBridge.mvuPresent()) return [];
    const fl = []; for (const m of contextPipeline.lastMsgs.slice(-30)) { const st = mvuBridge.perFloorStat(m.floor);
      const mv = st ? String(mvuBridge.getPath(st, mvuBridge.varMap.location) ?? '') : ''; if (mv) fl.push({ floor: m.floor, mvu: mv, raw: m.raw }); }
    return MDm.conflicts(fl, 10);
  }
  return {
    get cardSkip() { return cardSkip; }, set cardSkip(v) { cardSkip = v; }, checkpointResume, checkpointStep, conflictsNow,
    get cp() { return cp; }, set cp(v) { cp = v; }, get cpResume() { return cpResume; }, MDm, pointsFor, spatialInject, get SpatialM() { return SpatialM; },
    get spatialNow() { return spatialNow; }, injectPreview, stateInject, get stateNow() { return stateNow; }, set stateNow(v) { stateNow = v; },
  };
}
