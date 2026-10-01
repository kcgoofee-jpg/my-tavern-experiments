// 领航员网关（W5）、世界书 JIT 水合（W6）、剧情事实结晶（W7）：三条「按设置在后台调端点 / 写附加书」的流水，从 eden-map.js 原样搬出（S5-1）。
// 工厂风格同 host-*.mjs：createX(host) 只在入口调用一次；host 是入口给的依赖袋（活的变量 = 取 / 存器，函数 = 晚绑定转发），DEPS 是本模块要用的全部键。
import { cdnFetch, thFn } from './host-tavernhelper.mjs';
import { resolveTags, stripBlocks } from './sanitize.mjs';
export const DEPS = [
  'GEN', 'SELF', 'hostToast', 'life', 'lsGet', 'lsSet', 'panel', 'pointsFor', 'sendEvents', 'CTX', 'FRm', 'MV', 'SpatialM', 'UL', 'floorNow',
  'frState', 'here', 'regNow', 'spatialNow', 'eventsSummary',
];
export function createLlmFlow(host) {
  for (const k of DEPS) if (!(k in host)) throw new Error('llm-flow: missing dep ' + k);
  const { GEN, SELF, hostToast, life, lsGet, lsSet, panel, pointsFor, sendEvents } = host;
  // ---------------- W5 领航员网关（tavern/planner-gateway.mjs 纯调度；HTTP 与副作用在这里） ----------------
  // 默认关（edenMapNav）；开着也只是「该跑时才打一次用户自己配的端点」，让路语义复用 tick.plan（面板活着 / 生成中不跑）。
  // 响应必须过 W4 op 沙盒（sanitize 链 → parse → 水位）才可能落到地图；OP_EVENT 是会话级叠加（src='op'，20 楼衰减），
  // OP_SUGGEST 只弹提示永不自动进聊天流（裁决 2/3）；OP_CLUE / OP_MARKER 的查看器送达挂 T9（叠加图层）。
  let NAVm = null, LLMm = null, MSGm = null;
  import(SELF + 'tavern/planner-gateway.mjs').then(m => { NAVm = m; navSchedule(); }).catch(() => {});
  import(SELF + 'tavern/llm-gateway.mjs').then(m => { LLMm = m; }).catch(() => {});
  import(SELF + 'tavern/msgtext.mjs').then(m => { MSGm = m; }).catch(() => {});
  let navLed = { lastAt: 0 }, navSeen = { seen: [] }, navT = 0, opEvents = [];
  async function navRun() {
    if (!NAVm || !LLMm || life.dead) return;
    const p = NAVm.plan(Date.now(), { lastAt: navLed.lastAt, intervalMs: NAVm.intervalOf(lsGet), alive: !panel.hidden, generating: GEN.generating, dead: life.dead });
    if (!p.run) return;
    const cfg = NAVm.cfgOf(lsGet);
    if (!LLMm.checkConfig(cfg).ok) return;
    if (lsGet(NAVm.CONSENT_KEY) !== '1') {   // 首跑显式同意（wbsync 先例）；拒绝就整个关掉，不反复问
      const ok = (() => { try { return window.confirm(`地图领航员将按你的设置在后台调用私有 API（${cfg.provider}）推演态势建议，请求只发往你自己填的端点。继续吗？`); } catch (e) { return false; } })();
      if (!ok) { lsSet(NAVm.KEY, '0'); return; }
      lsSet(NAVm.CONSENT_KEY, '1');
    }
    const t0 = performance.now();
    const msgs = NAVm.assemble({ here: host.here, floor: host.floorNow, spatial: host.spatialNow || '', eventsSummary: host.eventsSummary(), failrep: host.FRm ? host.FRm.digest(host.frState) : '' });
    const req = LLMm.buildRequest(cfg, msgs, { maxTokens: 512 });
    let text = '';
    try {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 30000);
      const res = await cdnFetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal: ctl.signal }).finally(() => clearTimeout(to));
      text = res.ok ? LLMm.readText(await res.json()) : '';
    } catch (e) { text = ''; }
    const clean = MSGm ? stripBlocks(MSGm.parseText(text), resolveTags(lsGet)) : text;   // sanitize 链：剥 think / 变量块 + 预设私有块（W4 前置条件）
    const gated = NAVm.gate(navSeen, clean);
    navLed = NAVm.ledger(navLed, { now: Date.now(), ms: performance.now() - t0, n: gated.ops.length, dropped: gated.dropped });
    const d = NAVm.apply(gated.ops, { floor: host.floorNow });
    if (d.events.length) {
      opEvents = opEvents.filter(e => host.floorNow - e.floor <= 20).concat(d.events.map(e => ({ ...e, last: host.floorNow }))).slice(-12);
      sendEvents();
    }
    if (d.suggests.length) hostToast(host.UL === 'en' ? 'Navigator' : '地图领航员', d.suggests, 12000);
  }
  function navSchedule() {
    clearTimeout(navT);
    const iv = NAVm ? NAVm.intervalOf(lsGet) : 0;
    if (!iv) return;
    navT = setTimeout(async () => { try { await navRun(); } catch (e) {} navSchedule(); }, iv);
  }

  // ---------------- W6 世界书 JIT 条目水合（tavern/worldbook-jit.mjs 纯计划；写世界书在这里） ----------------
  // 只动 wbsync.BOOK 附加书里带 extra.eden_id 的条目（extra.eden_jit 标记 JIT 关的；用户关的记 ignore 永不再碰）。
  // 激活集 = spatial.activationOf（自身 + 出口 + 同层邻近）；激活集哈希没变不写（裁决 10）；withLock 跨标签互斥。
  let WBJm = null, WBSm = null, jitWatermark = null, jitBusy = false;
  import(SELF + 'tavern/worldbook-jit.mjs').then(m => { WBJm = m; }).catch(() => {});
  import(SELF + 'tavern/worldbook-sync.mjs').then(m => { WBSm = m; }).catch(() => {});
  async function jitRound() {
    if (jitBusy || !WBJm || !WBSm || !host.SpatialM || life.dead || lsGet('edenMapWbJit') !== '1') return;
    const getBook = thFn('getWorldbook'), updBook = thFn('updateWorldbookWith');
    if (!getBook || !updBook) return;
    jitBusy = true;
    try {
      const entries = await getBook(WBSm.BOOK).catch(() => null);
      if (!Array.isArray(entries) || !entries.length) return;
      const loc = host.SpatialM.locate(host.regNow, host.here);
      if (!loc?.mapId) return;
      const pts = await pointsFor(loc.mapId);
      const active = host.SpatialM.activationOf(host.regNow, host.here, { [loc.mapId]: pts });
      const hash = WBJm.hashOf(active);
      if (!WBJm.shouldWrite(jitWatermark, hash)) return;
      jitWatermark = { floor: host.floorNow, hash };
      const plan = WBJm.planActivation(entries, active);
      if (!plan.enable.length && !plan.disable.length && !plan.markIgnore.length) return;
      const muts = WBJm.applyPlan(entries, plan);
      await WBSm.withLock(async () => {
        await updBook(WBSm.BOOK, list => {
          if (Array.isArray(list)) for (const mu of muts) for (const e of list) if (e?.extra?.eden_id === mu.id) {
            e.enabled = mu.enabled;
            e.extra = { ...(e.extra || {}), ...mu.extra };
          }
          return list;
        });
      });
      console.info('[eden-map] 世界书 JIT：', plan.enable.length, '开 /', plan.disable.length, '关 /', plan.markIgnore.length, '记 ignore');
    } catch (e) { console.warn('[eden-map] 世界书 JIT 写失败（下轮激活集变化时重试）', e); }
    finally { jitBusy = false; }
  }

  // ---------------- W7 剧情事实自动结晶（tavern/worldbook-crystallize.mjs 纯收集与草案；写世界书在这里） ----------------
  // ⌖事实 标签 → 附加书关键词触发条目（map.fact.<hash>，内容照抄原文）；LRU + 墓碑（用户删除永不复活）；
  // 已写 id 记水位（edenMapWbXtalCfg.written）→ 消息窗口重放幂等。默认关（edenMapWbXtal）。
  let XTMm = null, xtalBusy = false, xtalCfg = null;
  import(SELF + 'tavern/worldbook-crystallize.mjs').then(m => { XTMm = m; }).catch(() => {});
  const xtalCfgOf = () => {
    if (xtalCfg) return xtalCfg;
    try { xtalCfg = JSON.parse(lsGet('edenMapWbXtalCfg') || '{}') || {}; } catch (e) { xtalCfg = {}; }
    if (!Array.isArray(xtalCfg.tombstones)) xtalCfg.tombstones = [];
    if (!xtalCfg.written || typeof xtalCfg.written !== 'object') xtalCfg.written = {};
    return xtalCfg;
  };
  const xtalSave = () => { try { lsSet('edenMapWbXtalCfg', JSON.stringify(xtalCfgOf())); } catch (e) {} };
  async function xtalRound() {
    if (xtalBusy || !XTMm || !WBSm || !host.MV || life.dead || lsGet('edenMapWbXtal') !== '1') return;
    const updBook = thFn('updateWorldbookWith');
    if (!updBook) return;
    xtalBusy = true;
    try {
      const facts = XTMm.collectFacts(host.CTX.lastMsgs, host.MV.parseCustomTags);
      if (!facts.length) return;
      const cfg = xtalCfgOf();
      const drafts = XTMm.newDrafts(XTMm.drafts(facts, { tombstones: cfg.tombstones }), new Set(Object.keys(cfg.written)));
      if (!drafts.length) return;
      await WBSm.withLock(async () => {
        await updBook(WBSm.BOOK, list => {
          const out = Array.isArray(list) ? list : [];
          for (const d of drafts) out.push({ name: d.name, enabled: true, content: d.content, strategy: d.strategy, position: d.position, recursion: { prevent_incoming: true, prevent_outgoing: true }, extra: { ...d.extra } });
          return out;
        });
      });
      for (const d of drafts) cfg.written[d.id] = d.floor;
      xtalSave();
    } catch (e) { console.warn('[eden-map] 事实结晶写失败（下轮重试）', e); }
    finally { xtalBusy = false; }
  }
  return {
    jitRound, get opEvents() { return opEvents; }, set opEvents(v) { opEvents = v; }, get WBJm() { return WBJm; }, get WBSm() { return WBSm; }, xtalRound,
  };
}
