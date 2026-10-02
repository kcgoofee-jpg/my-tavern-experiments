// 拾取与背包流：地图 → 动作注入、W2 掷骰 / 失败环、W11 结算闸门与漏项审计、拾取扫描、统一背包存储（stash，S6-2：原 loot-flow，仓库 / 虚拟槽位两处并成一份）与世界藏物表。
// 工厂风格同 host-*.mjs：createX(host) 只在入口调用一次；host 是入口给的依赖袋（活的变量 = 取 / 存器，函数 = 晚绑定转发），DEPS 是本模块要用的全部键。
import { cdnFetch } from './host-tavernhelper.mjs';
import { getProfile } from './pack-profile.mjs';
export const DEPS = [
  'facts', 'LS', 'PACK_ID', 'PACK_IN', 'scriptBase', 'chatId', 'composeIn', 'life', 'lsGet', 'mvuStat', 'post', 'saveRoot', 'BASE', 'mvuBridge', 'mvuReaders', 'uiLang', 'alive', 'floorNow',
  'chars', 'events', 'roster',   // K-R78: the schedule placements, the parsed events and the roster groups the settlement record reads (only with the switch on)
];
export function createStashFlow(host) {
  for (const k of DEPS) if (!(k in host)) throw new Error('stash-flow: missing dep ' + k);
  const { LS, PACK_ID, PACK_IN, scriptBase, chatId, composeIn, life, lsGet, mvuStat, post, saveRoot } = host;
  // Part 6-4 地图驱动的双向动作注入：查看器只说「点了哪个 POI、想干什么」，文案与注入方式全在这里按设置决定。
  // 模式默认 off——地图不该在玩家没点头的情况下替他说话；compose 只填不发（与「去这里」同一条底线），sys 走 /sys 静默注入。
  let placeActionInjectionModule = null;
  async function injectAction(d) {
    try { placeActionInjectionModule ??= await import(scriptBase + 'tavern/place-action-injection.mjs'); } catch (err) { return; }
    const get = k => { try { return (LS || localStorage).getItem(k); } catch (err) { return ''; } };
    const mode = placeActionInjectionModule.modeOf(get);
    if (mode === 'off') return;
    const a = placeActionInjectionModule.buildAction({ mode, kind: d?.kind, name: d?.name, map: d?.map, tpls: placeActionInjectionModule.readTpl(get, host.uiLang), lang: host.uiLang, item: d?.item });
    if (!a) return;
    if (mode === 'sys') { const cmd = placeActionInjectionModule.slashOf(a, 'sys');
      if (cmd && typeof triggerSlash === 'function') { try { triggerSlash(cmd); return; } catch (err) {} } }
    composeIn(a.text);   // sys 却没有 triggerSlash 时退回「只填不发」，绝不自动发送
  }

  // W2 检定失败环（docs/plans/llm-campaign.md）：掷骰口径 core/stash.search + core/rng 确定性种子；
  // 失败报告环是会话级内存态（tavern/check-failure-report.mjs，纯模块），经 eden-map-events 注入数组追加一行。
  // 开关 edenMapDice 默认关 = 行为与今天完全一致（不掷骰、必得手）。
  let rngModule = null, FRm = null; const frState = { list: [] };
  import(scriptBase + 'core/rng.mjs').then(m => { rngModule = m; }).catch(e => console.warn('[map] stash-flow: rng import failed', e));
  import(scriptBase + 'tavern/check-failure-report.mjs').then(m => { FRm = m; }).catch(e => console.warn('[map] stash-flow: check-failure-report import failed', e));
  const diceOn = () => lsGet('edenMapDice') === '1' && rngModule && FRm;

  // W11 四域结算账本 + 时序守卫（docs/plans/llm-campaign.md；对齐「领域分账 / 渐进纠错」口径）：
  // 地图侧的确定性物理事实（拾取）记进 lootFacts，每轮由 core/ledger.mjs 的漏项审计器与宿主**实际落盘**
  // 的背包对账——认不出 / 不在表里的留待结算（旧值不动）。S6-2：正文拾取的落盘改由 tavern/stash-recompute.mjs 的折叠完成
  // （同一份存储、可重算），审计与待结算携带照旧跑在同一批事实上。
  // 写变量一律经 tavern/settlement-guard.mjs 的闸门排队，放行点是本轮末尾：读取期间绝不写，杜绝与主 MVU / 卡内
  // 状态引擎抢写（MVU 在场时那一拍就排在 VARIABLE_UPDATE_ENDED 收尾之后，见 mvu-bridge.markVarUpdate）。
  let ledgerModule = null, VSG = null;
  const lootFacts = [];                               // 本场会话的物理拾取事实（聊天维度：换聊天清空）
  const settleState = { claimed: [], floor: null, branch: null };   // 已补发水位（同一件只补一次，有界；带分支纪律）
  const settleCarry = { domains: [], floor: null };   // 待结算跨轮携带（未决的域带进下一轮，≤4；参考卡 pending-domain carry）
  // W12 虚拟账本槽位：宿主 stat_data 里一个背包字段都没有时，地图自己的账（stash.slot）记下每一件拾取事实。**不写宿主 stat_data**
  // （卡的 MVU 带 zod 结构，未知键会被丢掉还可能触发校验报错，见 ledger.mjs 的同一段注释）。
  import(scriptBase + 'core/ledger.mjs').then(m => { ledgerModule = m; }).catch(e => console.warn('[map] stash-flow: ledger import failed', e));
  import(scriptBase + 'tavern/settlement-guard.mjs').then(m => {
    VSG = m.createGate({ hasMvu: () => host.mvuBridge.mvuPresent(), epoch: () => host.mvuBridge.varUpdateSeq() });
  }).catch(e => console.warn('[map] stash-flow: settlement-guard import failed', e));
  const gate = () => VSG;
  function gateFlush(why = 'round') { try { return gate()?.flush(why) || null; } catch (e) { return null; } }
  // 任务一（第二步）客观动作强制反思探测：正文里**写明的**物理获取动作也是事实来源——主模型因为「卡里没有
  // 背包字段」在 UpdateVariable 里漏掉道具时，这里把动作本身补成一条 loot 事实，交给同一套漏项审计 + 强制入账。
  // 纯计算在 core/pickup.mjs（node 单测 tests/auto_stash.test.mjs）；这里只做取数与副作用。
  const vocab = () => getProfile().pickup;   // K-R77：包的拾取词（内核词表之外的追加 / 关闭 / 严格类 / 非物品）；第一个包不声明 = 空
  let pickupModule = null; import(scriptBase + 'core/pickup.mjs').then(m => { pickupModule = m; }).catch(e => console.warn('[map] stash-flow: pickup import failed', e));
  /** 已知物品名（世界藏物表 + 已经在账上的东西）：命中即视为「具体物品名词」，不必带引号 / 量词 */
  function knownItems() {
    const s = new Set(worldNames());
    try { if (stashStoreModule) for (const r of stashStoreModule.rows(stash)) if (r?.name) s.add(r.name); } catch (e) {}
    return s;
  }
  const worldNames = () => { try { return worldModule && world ? worldModule.rows(world, {}).map(r => r?.name).filter(Boolean) : []; } catch (e) { return []; } };
  const worldIds = () => { try { return new Set(worldModule && world ? worldModule.rows(world, {}).map(r => r?.id).filter(Boolean) : []); } catch (e) { return new Set(); } };
  /** 那一楼自己的变量里的地点（older 楼的地点；没有就空）：只在那一楼真要扫描时才取（惰性） */
  const placeAt = (i, raw) => { try { return host.mvuBridge.floorPlace(i, raw).place || ''; } catch (e) { return ''; } };   // I-21：没有场景头时与以前一样（那一楼变量里的值）
  let roundMsgs = [];   // 本轮的楼层窗口：[{ msgIndex, text, place }]，ledgerSync 折叠它
  /** 本轮的正文窗口记下来（折叠在放行点跑），最新一楼的拾取事实照旧入 lootFacts（W11 审计与携带用）。返回新增条数 */
  function scanPickups(msgs, place) {
    if (!pickupModule || life.dead) return 0;   // U-FIX-2：查看器睡着 / 卸载（alive = false）也照扫——背包是聊天的产物，不跟着面板开关
    roundMsgs = (msgs || []).map((m, i, a) => { let at = null; return { msgIndex: m.floor, text: m.text, get place() { return at ??= (i === a.length - 1 || m.floor === host.floorNow ? place : placeAt(m.floor, m.raw)); } }; });
    const last = msgs?.[msgs.length - 1]; if (!last?.text) return 0;
    let facts = []; try { facts = pickupModule.scan(last.text, { known: knownItems(), floor: last.floor, place, vocab: vocab() }); } catch (e) { return 0; }
    let n = 0;
    for (const f of facts) { if (lootFacts.some(x => x?.id === f.id)) continue; lootFacts.push(f); n++; }
    while (lootFacts.length > 40) lootFacts.shift();
    return n;
  }
  /** 宿主实际落盘的状态视图（审计器的 landed 参数）：只为**这一轮真有事实的域**取视图，不白读一遍 MVU——
   *  资产域 = 背包 id 表；NPC 域 = 在场名册的「人 → 当前地点」；事件域还没有落盘写入路径（不给视图 = 走待结算） */
  function landedView(facts) {
    const need = new Set((facts || []).map(f => f?.kind));
    const out = {};
    if (need.has('loot')) { const assets = {}; try { for (const [id, e] of Object.entries(stash?.items || {})) assets[id] = e?.name || ''; } catch (e) {} out.assets = assets; }
    if (need.has('routine')) { const npc = {}; try { const p = host.mvuBridge.rosters(mvuStat())?.[host.mvuBridge.presentId]; for (const it of p?.items || []) if (it?.name && it?.place) npc[it.name] = it.place; } catch (e) {} out.npc = npc; }
    return out;
  }
  /** 一轮的结算（W11）：折叠本轮正文窗口进背包（新增 / 重放 / 虚拟槽位），再对最新事实做漏项审计与待结算携带。
   *  审计看到的缺口（比如玩家用接口删掉的东西）不再补：折叠是唯一的写入者，水位只记「已看过」。 */
  function ledgerSync() {
    if (!ledgerModule || !stashStoreModule || !stashRecomputeModule || !stash || life.dead || !roundMsgs.length) return null;   // 推给查看器的 sendInv 自己看 alive
    const rt = stashStoreModule.retag(stash, worldIds());
    const probe = ledgerModule.slotProbe(host.mvuBridge.mvuStat());
    const r = stashRecomputeModule.step(rt.stash, roundMsgs, { worldNames: worldNames(), vocab: vocab(), probe });
    stash = r.stash;
    let dirty = r.changed || rt.changed;
    // 地图拾取的槽位事实比行晚一轮入账（与 v1 同一时点：事实先进 lootFacts，下一次结算才进账）
    const late = stashRecomputeModule.mapFactRows(stash, lootFacts);
    if (late.length) { stash = { ...stash, slot: stashRecomputeModule.captureSlot(stash, late, probe, host.floorNow) }; dirty = true; }
    settleRecord();                                                    // K-R78: npc / events holes into <chat var>.ledger (the switch is off by default: nothing runs)
    if (dirty) changedInv();                                          // 写聊天变量 + 推地图（拿到手的光点消失）
    else if (JSON.stringify(cardRows()) !== sentCard) sendInv();      // 卡里自己的物品表变了：只重发
    if (!lootFacts.length) return { fixed: r.added, pending: 0, repeated: 0, slot: slotView() };
    const aud = ledgerModule.audit(lootFacts, landedView(lootFacts));
    ledgerModule.carry(settleCarry, aud.pending);                              // 未决的域带进下一轮（≤4，跨轮携带）
    const cl = ledgerModule.claim(settleState, aud.patches.filter(p => p.domain === 'assets'), { floor: host.floorNow, branch: branchNow() });
    return { fixed: r.added, pending: aud.pending.length, repeated: cl.repeated, slot: slotView() };
  }
  // K-R78 结算记录（I-04）：开关 edenMapLedgerWrite 默认关——关着时不产生事实、不读任何东西。开着：日程里属于某个名册组的人的位置、聊天里解析出的事件，
  // 经同一个漏项审计只补**空缺**，记进地图自己的聊天变量 <chat var>.ledger（从不写卡的 stat_data）；写入走和背包同一条保存（saveRoot），在结算闸门放行点。
  let recordModule = null, ledgerRecord = null; import(scriptBase + 'core/settlement-record.mjs').then(m => { recordModule = m; }).catch(e => console.warn('[map] stash-flow: settlement-record import failed', e));
  function settleRecord() {
    if (lsGet('edenMapLedgerWrite') !== '1' || !recordModule || !ledgerModule) return;
    try {
      const R = recordModule, floor = host.floorNow, places = new Map();
      for (const g of Object.values(host.roster || {})) for (const it of g?.items || []) if (it?.name) places.set(it.name, it.place || '');
      const facts = [];
      for (const c of host.chars || []) if (c?.src === 'routine' && c.place && places.has(c.name)) facts.push({ kind: 'routine', npc: c.name, room: c.place, floor, authority: 'verified' });
      for (const e of host.events || []) if (e?.id && e.type) facts.push({ kind: 'event', id: String(e.id), type: String(e.type), level: Number.isInteger(e.lvl) ? e.lvl : 0, node: e.node || '', floor: Number.isInteger(e.last) ? e.last : floor, authority: 'committed' });
      if (!facts.length) return;
      const L = R.recordLanded(ledgerRecord), npc = { ...L.npc };
      for (const [n, p] of places) { if (p) npc[n] = p; else if (!(n in npc)) npc[n] = ''; }   // the card's place wins; a roster person without one is a hole
      const put = R.recordPut(ledgerRecord, ledgerModule.audit(facts, { npc, events: L.events }, { anyEventType: true }).patches, floor);
      host.facts.ledger = { rows: put.added || 0, floor };   // health: this round's written rows
      if (put.added) { ledgerRecord = put.rec; saveRoot(); }
    } catch (e) { /* the record is a cache: a failed round is simply skipped */ }
  }
  /** 分支身份（同一楼换分支 = swipe / 重生成 ⇒ 该楼水位作废重算）：楼层 + 那一楼的 swipe 号 */
  const branchNow = () => { try { return String(host.floorNow) + ':' + String(host.mvuBridge.swipeAt(host.floorNow) ?? 0); } catch (e) { return String(host.floorNow) + ':0'; } };
  const slotView = () => (stash?.slot ? { name: stash.slot.name, virtual: stash.slot.virtual, count: Object.keys(stash.slot.facts || {}).length } : null);

  // Part 5-1 拾取地上的藏物（core/stash.mjs 的行）：地图只说「拿了哪个 id」，真实性由这里核对——
  // 认不出的 id 一律不动背包（不替世界凭空变出东西）；认出了就写进 eden_map.stash（同一份聊天变量，模型自己看得见）。
  function takeLoot(d) {
    try {
      if (!worldModule || !world || !stashStoreModule || !stash || !d?.id) return;
      const row = worldModule.rows(world, {}).find(r => r.id === d.id);
      if (!row) return;
      if (diceOn()) {   // 真掷骰：seed = 聊天 + 楼层 + 藏物 id（同一楼同一件永远同一骰，回放一致）；失手不入包、出失败报告
        const roll = 1 + Math.floor(rngModule.rng(rngModule.seedOf(chatId(), host.floorNow, d.id))() * 20);
        const sr = worldModule.search(row, roll); host.facts.dice = { last: '', floor: host.floorNow };   // a success clears the earlier failure's line
        if (!sr.found) {
          { const rp = FRm.failureReport({ kind: 'search', place: row.place || d.place || '', dc: sr.dc, roll, margin: sr.dc - roll, floor: host.floorNow }); FRm.push(frState, rp); host.facts.dice = { last: FRm.render(rp), floor: host.floorNow }; }   // health: the last check
          injectAction({ kind: 'fail', name: row.place || d.place || '', vars: { dc: sr.dc, roll, what: '搜刮失手' } });
          return;
        }
      }
      const res = stashStoreModule.put(stash, { ...worldModule.lootPut(row), node: row.node || row.marker || '', src: 'map', carried: true, msgIndex: host.floorNow });
      if (!res.changed) return;
      stash = res.stash; changedInv();   // 写变量 + 推地图（拿到手的光点会消失）
      // W11：物理事实入账（两条拾取路径——平面 eden-map:loot 与 Part 8 主场景三维 estate:loot——都汇到这里）。
      // 下一轮的结算把它记进虚拟槽位（lootFacts 里有、账上还没有的地图拾取）。
      lootFacts.push({ kind: 'loot', id: row.id, name: row.name, place: row.place || d.place || '', map: row.map || d.map || '', hidden: !!row.hidden, qty: row.qty || 1, floor: host.floorNow, authority: 'verified' });
      if (lootFacts.length > 40) lootFacts.shift();
      injectAction({ kind: 'loot', name: row.place || d.place || '', map: row.map || d.map || '', item: row.name });
    } catch (err) {}
  }

  // Part 5-2 潜行：地图已经把几何算完了（穿过谁的锥、最难的一下 DC 多少），这里只决定要不要说这句话——
  // 与所有地图-driven 注入同一道开关（edenMapInject），默认值仍然是「关」。
  function stealthCheck(d) {
    try {
      const dc = Math.round(+d?.dc);
      if (!Number.isFinite(dc) || dc <= 0) return;
      if (diceOn()) {   // 真掷骰：seed 含起讫地标；没躲过（roll < DC）出失败报告（带 worst 的目击者与坐标），驱动围捕 / 质询剧情
        const roll = 1 + Math.floor(rngModule.rng(rngModule.seedOf(chatId(), host.floorNow, 'stealth', d?.from || '', d?.to || ''))() * 20); host.facts.dice = { last: '', floor: host.floorNow };
        if (roll < dc) {
          { const rp = FRm.failureReport({ kind: 'stealth', place: d?.to || '', at: d?.worst?.at, dc, roll, margin: dc - roll, witnesses: d?.worst?.name ? [d.worst.name] : [], floor: host.floorNow }); FRm.push(frState, rp); host.facts.dice = { last: FRm.render(rp), floor: host.floorNow }; }
          injectAction({ kind: 'fail', name: d?.to || '', vars: { dc, roll, what: '潜行被目击' } });
          return;
        }
      }
      injectAction({ kind: 'stealth', name: d?.to || '', vars: { dc } });
    } catch (err) {}
  }

  // 统一背包（tavern/stash-store.mjs，K-R74）：聊天变量 eden_map.stash；地点卡显示 + 注入摘要，模型据此演「回房间取东西」。
  // 加载时由 root-store.loadCustom 迁移旧键并赋值（stash 在那之前是 null：折叠与写入都等它）。
  let stashStoreModule = null, stashRecomputeModule = null;
  import(scriptBase + 'tavern/stash-store.mjs').then(m => { stashStoreModule = m; sendInv(); }).catch(e => console.warn('[map] stash-flow: stash-store import failed', e));
  import(scriptBase + 'tavern/stash-recompute.mjs').then(m => { stashRecomputeModule = m; }).catch(e => console.warn('[map] stash-flow: stash-recompute import failed', e));
  let stash = null, sentCard = '';
  /** 卡自己的物品表（只读）：包的 vars.inventory，否则探路找到的真字段；都没有 = null */
  function cardRows() {
    try {
      const R = host.mvuReaders; if (!R?.cardInventory) return null;
      const stat = mvuStat(), path = R.inventoryPath(ledgerModule?.slotProbe(stat));
      return path ? R.cardInventory(stat, path) : null;
    } catch (e) { return null; }
  }
  function sendInv() {
    if (!host.alive) return;
    const card = cardRows(); sentCard = JSON.stringify(card);
    if (!stashStoreModule || !stash) { post({ type: 'eden-map:inv', items: [], card }); return; }
    post({ type: 'eden-map:inv', items: stashStoreModule.wireRows(stash), stash: { v: 1, rows: stashStoreModule.rows(stash), slot: slotView() }, card });
  }
  function changedInv(save = true) { if (save) saveRoot(); sendInv(); }
  /** 换聊天：本场会话的结算状态清零（背包本身由 loadCustom 重新读） */
  function resetChat() {
    lootFacts.length = 0; settleState.claimed = []; settleState.floor = null; settleState.branch = null; settleCarry.domains = []; settleCarry.floor = null;
    roundMsgs = []; sentCard = ''; stash = null; ledgerRecord = null;
  }
  // 世界藏物表（Part 5-1，core/stash.mjs）：包数据 manifest.data.stash 的行整张推给查看器（它以当前图自己筛），
  // 拿到手的东西由背包的 id 对账——不再在地上发光。藏物表晚于迁移到达时，补一次 retag（旧行里认得出的升格为地图拾取）。
  let worldModule = null, world = null, worldRaw = null;
  const worldArrived = () => { sendStash(); if (stashStoreModule && stash) { const r = stashStoreModule.retag(stash, worldIds()); if (r.changed) { stash = r.stash; changedInv(); } } };
  import(scriptBase + 'core/stash.mjs').then(m => { worldModule = m; if (worldRaw) { world = m.normStash(worldRaw); worldArrived(); } }).catch(e => console.warn('[map] stash-flow: stash import failed', e));
  { const sp = PACK_IN?.manifest?.data?.stash; if (sp) { const sb = PACK_ID === 'eden' ? '' : 'packs/' + PACK_ID + '/';
    cdnFetch(host.BASE + sb + sp).then(r => r.ok ? r.json() : null).then(j => { worldRaw = j; if (worldModule && j) { world = worldModule.normStash(j); worldArrived(); } }).catch(e => console.warn('[map] stash-flow: stash world fetch failed', e)); } }
  function sendStash() { if (host.alive && worldModule) post({ type: 'eden-map:stash', items: worldModule.rows(world || {}, {}) }); }
  return {
    changedInv, get FRm() { return FRm; }, frState, gate, gateFlush, injectAction, get stash() { return stash; }, set stash(v) { stash = v; }, get ledgerRecord() { return ledgerRecord; }, set ledgerRecord(v) { ledgerRecord = v; }, get stashStoreModule() { return stashStoreModule; },
    get stashRecomputeModule() { return stashRecomputeModule; }, ledgerSync, get ledgerModule() { return ledgerModule; }, lootFacts, resetChat, scanPickups, sendInv, settleCarry,
    stealthCheck, takeLoot,
  };
}
