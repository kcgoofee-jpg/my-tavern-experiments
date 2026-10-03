// 领航员网关（W5）、世界书 JIT 水合（W6）、剧情事实结晶（W7）：三条「按设置在后台调端点 / 写附加书」的流水，从 eden-map.js 原样搬出（S5-1）。
// 工厂风格同 host-*.mjs：createX(host) 只在入口调用一次；host 是入口给的依赖袋（活的变量 = 取 / 存器，函数 = 晚绑定转发），DEPS 是本模块要用的全部键。
import { cdnFetch, thFn } from './host-tavernhelper.mjs';
import { resolveTags, stripBlocks } from './sanitize.mjs';
import * as NO from './nav-ops.mjs';
import { getGeo } from './events-parse.mjs';
import { routeOp } from '../core/router.mjs';
import { floorIndex } from '../core/place-record.mjs';
import { tokens } from './interaction-modes.mjs';
export const DEPS = [
  'GEN', 'HS', 'facts', 'scriptBase', 'hostToast', 'life', 'lsGet', 'lsSet', 'panel', 'pointsFor', 'sendEvents', 'contextPipeline', 'FRm', 'mvuReaders', 'SpatialM', 'uiLang', 'floorNow',
  'frState', 'here', 'regNow', 'spatialNow', 'eventsSummary', 'post', 'alive', 'MAN', 'BASE', 'PACK_ID',
];
export function createLlmFlow(host) {
  for (const k of DEPS) if (!(k in host)) throw new Error('llm-flow: missing dep ' + k);
  const { GEN, scriptBase, hostToast, life, lsGet, lsSet, panel, pointsFor, sendEvents } = host;
  // ---------------- W5 领航员网关（tavern/planner-gateway.mjs 纯调度；HTTP 与副作用在这里） ----------------
  // 默认关（edenMapNav）；开着也只是「该跑时才打一次用户自己配的端点」，让路语义复用 tick.plan（面板活着 / 生成中不跑）。
  // 响应必须过 W4 op 沙盒（sanitize 链 → parse → 水位）才可能落到地图；OP_EVENT 是会话级叠加（src='op'，20 楼衰减），
  // OP_SUGGEST 只弹提示永不自动进聊天流（裁决 2/3）；OP_CLUE / OP_MARKER 经 tavern/nav-ops.mjs 盖楼层与地图章、会话级留存，发给查看器的 nav-ops 图层（K-R86）。
  let plannerGatewayModule = null, LLMm = null, MSGm = null;
  import(scriptBase + 'tavern/planner-gateway.mjs').then(m => { plannerGatewayModule = m; navSchedule(); }).catch(e => console.warn('[map] llm-flow: planner-gateway import failed', e));
  import(scriptBase + 'tavern/llm-gateway.mjs').then(m => { LLMm = m; }).catch(e => console.warn('[map] llm-flow: llm-gateway import failed', e));
  import(scriptBase + 'tavern/msgtext.mjs').then(m => { MSGm = m; }).catch(e => console.warn('[map] llm-flow: msgtext import failed', e));
  let navLed = { lastAt: 0 }, navSeen = { seen: [] }, navT = 0, navNext = 0, opEvents = [], opOv = NO.EMPTY, opSent = NO.sig(NO.EMPTY);
  function sendOps(force) {   // K-R86: the session's clues and markers to the viewer's nav-ops layer, when they changed (force: a fresh viewer, only if there is something)
    opOv = NO.age(opOv, host.floorNow); const s = NO.sig(opOv);
    if (!host.alive || (force ? !opOv.clues.length && !opOv.markers.length && !opOv.routes.length : s === opSent)) return;
    opSent = s; host.post({ type: 'eden-map:ops', clues: opOv.clues, markers: opOv.markers, routes: opOv.routes });
  }
  function resetOps() { const had = opOv.clues.length || opOv.markers.length || opOv.routes.length; opOv = NO.EMPTY; if (had) { opSent = ''; sendOps(); } }
  function addRoutes(rows, ctx) { opOv = NO.add(opOv, { routes: rows }, { floor: ctx?.floor ?? host.floorNow, map: ctx?.map ?? null }); sendOps(); }   // S8-4b K-R113: the S7 route op's validated rows (route-flow addSuggestions)
  const routeCtx = () => { const geo = getGeo(), loc = t => geo?.place?.(String(t || '').replace('{{user}}', ''))?.node ?? null; return { graph: geo?.graph?.() ?? null, locate: loc, geo }; };
  /** S7-1 K-R130: the validated OP_ROUTE rows -> routeOp -> the suggestion store (at most 3, aged out after 20 messages, sent in eden-map:ops.routes); a row the router cannot place is counted as dropped,
   *  and without a transit network the text of `why` joins the toast (nothing is drawn). Returns { kept, dropped, whys }. */
  function planRoutes(rows, map) {
    const { graph, locate, geo } = routeCtx(), good = [], whys = []; let dropped = 0;
    for (const r of rows || []) {
      if (!graph) { if (r.why) whys.push(r.why); dropped++; continue; }
      const o = routeOp(r, { graph, locate, here: { node: locate(host.here), name: String(host.here || '') }, floor: host.floorNow, map, tree: geo?.tree });
      if (o) good.push(o); else dropped++;
    }
    if (good.length) addRoutes(good, { floor: host.floorNow, map });
    return { kept: good.length, dropped, whys };
  }
  /** navFacts(): the AI advisor's part of the health facts, with consent and config read from storage now (feature-health.mjs) */
  function navFacts() {
    const F = host.facts.nav, G = plannerGatewayModule;
    return { ...F, consent: G ? lsGet(G.CONSENT_KEY) === '1' : null, cfgOk: G && LLMm ? LLMm.checkConfig(G.cfgOf(lsGet)).ok : null, nextAt: navNext };
  }
  async function navRun() {
    if (!plannerGatewayModule || !LLMm || life.dead) return;
    const F = host.facts.nav;
    const p = plannerGatewayModule.plan(Date.now(), { lastAt: navLed.lastAt, intervalMs: plannerGatewayModule.intervalOf(lsGet), alive: !panel.hidden, generating: GEN.generating, dead: life.dead });
    F.generating = !p.run && (GEN.generating || !panel.hidden);   // health: "waiting" while the map is open or a reply is being written
    if (!p.run) return;
    const cfg = plannerGatewayModule.cfgOf(lsGet);
    if (!LLMm.checkConfig(cfg).ok) return;
    if (lsGet(plannerGatewayModule.CONSENT_KEY) !== '1') return;   // consent is given inside the card (settings); the host never asks and never switches the feature off (health reports `no-consent`)
    const t0 = performance.now();
    const msgs = plannerGatewayModule.assemble({ here: host.here, floor: host.floorNow, spatial: host.spatialNow || '', eventsSummary: host.eventsSummary(), failrep: host.FRm ? host.FRm.digest(host.frState) : '' });
    const req = LLMm.buildRequest(cfg, msgs, { maxTokens: 512 });
    let text = '';
    try {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 30000);
      const res = await cdnFetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal: ctl.signal }).finally(() => clearTimeout(to));
      F.lastStatus = res.status;
      text = res.ok ? LLMm.readText(await res.json()) : '';
    } catch (e) { text = ''; F.lastStatus = 0; }
    F.lastTokens = tokens(msgs.map(m => m.content).join('\n') + text);
    const clean = MSGm ? stripBlocks(MSGm.parseText(text), resolveTags(lsGet)) : text;   // sanitize 链：剥 think / 变量块 + 预设私有块（W4 前置条件）
    const gated = plannerGatewayModule.gate(navSeen, clean);
    const d = plannerGatewayModule.apply(gated.ops, { floor: host.floorNow });
    const map = host.SpatialM?.locate(host.regNow, host.here)?.mapId ?? null, rt = planRoutes(d.routes, map);
    navLed = plannerGatewayModule.ledger(navLed, { now: Date.now(), ms: performance.now() - t0, n: gated.ops.length - rt.dropped, dropped: gated.dropped + rt.dropped });
    Object.assign(F, { lastAt: navLed.lastAt, runs: navLed.runs, lastN: navLed.lastN, lastDropped: navLed.lastDropped });
    if (d.events.length) {
      opEvents = opEvents.filter(e => host.floorNow - e.floor <= 20).concat(d.events.map(e => ({ ...e, last: host.floorNow }))).slice(-12);
      sendEvents();
    }
    if (d.clues.length || d.markers.length) { opOv = NO.add(opOv, d, { floor: host.floorNow, map }); sendOps(); }
    if (d.suggests.length || rt.whys.length) hostToast(host.HS('nav.toast', host.uiLang === 'en'), [...d.suggests, ...rt.whys], 12000);
  }
  function navSchedule() {
    clearTimeout(navT);
    const iv = plannerGatewayModule ? plannerGatewayModule.intervalOf(lsGet) : 0;
    if (!iv) return;
    navNext = Date.now() + iv; navT = setTimeout(async () => { try { await navRun(); } catch (e) {} navSchedule(); }, iv);
  }

  // ---------------- W6 世界书 JIT 条目水合（tavern/worldbook-jit.mjs 纯计划；写世界书在这里） ----------------
  // 只动 wbsync.BOOK 附加书里带 extra.eden_id 的条目（extra.eden_jit 标记 JIT 关的；用户关的记 ignore 永不再碰）。
  // 激活集 = spatial.activationOf（自身 + 出口 + 同层邻近）；激活集哈希没变不写（裁决 10）；withLock 跨标签互斥。
  let worldbookJitModule = null, WBSm = null, jitWatermark = null, jitBusy = false, jitEpoch = 0;
  /** 换聊天：激活水位作废（上一个聊天算出的激活集不能当新聊天的），正在跑的一轮结果也不再记水位；下一轮重算一遍再写 */
  const jitReset = () => { jitWatermark = null; jitEpoch++; };
  import(scriptBase + 'tavern/worldbook-jit.mjs').then(m => { worldbookJitModule = m; }).catch(e => console.warn('[map] llm-flow: worldbook-jit import failed', e));
  import(scriptBase + 'tavern/worldbook-sync.mjs').then(m => { WBSm = m; }).catch(e => console.warn('[map] llm-flow: worldbook-sync import failed', e));
  // PLACE-1a: the pack's room table (floors, room names) for the entry switch: in a room, the rooms of its floor are switched on with it. Fetched once; no table = the old active set.
  let placeIdx = null;
  async function placeFor() {
    if (placeIdx !== null) return placeIdx || null;
    placeIdx = false;
    try {
      const man = await host.MAN, rel = man?.data?.rooms; if (!rel || !host.BASE) return null;
      const r = await cdnFetch(host.BASE + (host.PACK_ID === 'eden' ? '' : 'packs/' + host.PACK_ID + '/') + rel), plan = r.ok ? await r.json() : null;
      placeIdx = plan ? floorIndex(plan) : false;
    } catch (e) { console.warn('[eden-map] room table unavailable', e); placeIdx = null; }   // a failed fetch is retried next round
    return placeIdx || null;
  }
  async function jitRound() {
    if (jitBusy || !worldbookJitModule || !WBSm || !host.SpatialM || life.dead || lsGet('edenMapWbJit') !== '1') return;
    const getBook = thFn('getWorldbook'), updBook = thFn('updateWorldbookWith');
    if (!getBook || !updBook) return;
    jitBusy = true; const epoch = jitEpoch;
    try {
      const entries = await getBook(WBSm.BOOK).catch(() => null);
      if (epoch !== jitEpoch) return;   // 读书期间换了聊天：这一轮作废
      host.facts.jit.book = Array.isArray(entries) && entries.length > 0;   // health: is the add-on book there
      if (!Array.isArray(entries) || !entries.length) return;
      const loc = host.SpatialM.locate(host.regNow, host.here);
      if (!loc?.mapId) { host.facts.jit.floor = host.floorNow; return; }
      const pts = await pointsFor(loc.mapId);
      const act = host.SpatialM.activationSet(host.regNow, host.here, { [loc.mapId]: pts }, { place: await placeFor() });
      const active = act.names, pinned = act.pinned !== false;
      const hash = worldbookJitModule.hashOf(active);
      if (!worldbookJitModule.shouldWrite(jitWatermark, hash)) { host.facts.jit.floor = host.floorNow; return; }
      if (epoch !== jitEpoch) return;
      jitWatermark = { floor: host.floorNow, hash };
      const plan = worldbookJitModule.planActivation(entries, active, { pinned });
      Object.assign(host.facts.jit, { enabled: plan.on, disabled: plan.off, floor: host.floorNow });
      // FIX-3: the two numbers are the book's state after this round, not what changed; the delta is in brackets.
      // 没钉在具体地点就一句话说明白——这种写法下不动任何条目，别再让人猜是不是世界书空了。
      const delta = `（本次 +${plan.enable.length} / -${plan.disable.length}）`;
      if (!plan.enable.length && !plan.disable.length && !plan.markIgnore.length) {
        console.info('[eden-map] 世界书 JIT：', plan.on, '开 /', plan.off, '关', delta, pinned ? '' : `· 未钉在具体地点（${act.where || '认不出'}），本轮不挂载`);
        return;
      }
      const muts = worldbookJitModule.applyPlan(entries, plan);
      await WBSm.withLock('eden-map-wb', async () => {
        await updBook(WBSm.BOOK, list => {
          if (Array.isArray(list)) for (const mu of muts) for (const e of list) if (e?.extra?.eden_id === mu.id) {
            e.enabled = mu.enabled;
            e.extra = { ...(e.extra || {}), ...mu.extra };
          }
          return list;
        });
      });
      console.info('[eden-map] 世界书 JIT：', plan.on, '开 /', plan.off, '关', delta, pinned ? '' : `· 未钉在具体地点（${act.where || '认不出'}）`);
    } catch (e) { console.warn('[eden-map] 世界书 JIT 写失败（下轮激活集变化时重试）', e); }
    finally { jitBusy = false; }
  }

  // ---------------- W7 剧情事实自动结晶（tavern/worldbook-crystallize.mjs 纯收集与草案；写世界书在这里） ----------------
  // ⌖事实 标签 → 附加书关键词触发条目（map.fact.<hash>，内容照抄原文）；LRU + 墓碑（用户删除永不复活）；
  // 已写 id 记水位（edenMapWbXtalCfg.written）→ 消息窗口重放幂等。默认关（edenMapWbXtal）。
  let worldbookCrystallizeModule = null, xtalBusy = false, xtalCfg = null;
  import(scriptBase + 'tavern/worldbook-crystallize.mjs').then(m => { worldbookCrystallizeModule = m; }).catch(e => console.warn('[map] llm-flow: worldbook-crystallize import failed', e));
  const xtalCfgOf = () => {
    if (xtalCfg) return xtalCfg;
    try { xtalCfg = JSON.parse(lsGet('edenMapWbXtalCfg') || '{}') || {}; } catch (e) { xtalCfg = {}; }
    if (!Array.isArray(xtalCfg.tombstones)) xtalCfg.tombstones = [];
    if (!xtalCfg.written || typeof xtalCfg.written !== 'object') xtalCfg.written = {};
    return xtalCfg;
  };
  const xtalSave = () => { try { lsSet('edenMapWbXtalCfg', JSON.stringify(xtalCfgOf())); } catch (e) { /* storage unavailable (private mode / quota): keep the default */ } };
  function xtalClear() { const c = xtalCfgOf(); c.written = {}; xtalSave(); host.facts.xtal.written = 0; }   // C8 sub-option: forget what was written (the tombstones stay)
  async function xtalRound() {
    if (xtalBusy || !worldbookCrystallizeModule || !WBSm || !host.mvuReaders || life.dead || lsGet('edenMapWbXtal') !== '1') return;
    const updBook = thFn('updateWorldbookWith');
    if (!updBook) return;
    xtalBusy = true;
    try {
      const facts = worldbookCrystallizeModule.collectFacts(host.contextPipeline.lastMsgs, host.mvuReaders.parseCustomTags);
      host.facts.xtal.seenTags = facts.length > 0;   // health: was a fact tag seen in the recent replies
      if (!facts.length) return;
      const cfg = xtalCfgOf();
      const drafts = worldbookCrystallizeModule.newDrafts(worldbookCrystallizeModule.drafts(facts, { tombstones: cfg.tombstones }), new Set(Object.keys(cfg.written)));
      if (!drafts.length) return;
      await WBSm.withLock('eden-map-wb', async () => {
        await updBook(WBSm.BOOK, list => {
          const out = Array.isArray(list) ? list : [];
          for (const d of drafts) out.push({ name: d.name, enabled: true, content: d.content, strategy: d.strategy, position: d.position, recursion: { prevent_incoming: true, prevent_outgoing: true }, extra: { ...d.extra } });
          return out;
        });
      });
      for (const d of drafts) cfg.written[d.id] = d.floor;
      Object.assign(host.facts.xtal, { written: Object.keys(cfg.written).length, last: String(drafts.at(-1)?.name || ''), floor: host.floorNow });
      xtalSave();
    } catch (e) { console.warn('[eden-map] 事实结晶写失败（下轮重试）', e); }
    finally { xtalBusy = false; }
  }
  return {
    jitRound, jitReset, resetOps, sendOps, addRoutes, navFacts, planRoutes, navSchedule, xtalClear, get opEvents() { return opEvents; }, set opEvents(v) { opEvents = v; }, get worldbookJitModule() { return worldbookJitModule; }, get WBSm() { return WBSm; }, xtalRound,
  };
}
