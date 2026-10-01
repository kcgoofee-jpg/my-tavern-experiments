// 拾取与背包流：地图 → 动作注入、W2 掷骰 / 失败环、W11 结算闸门与漏项审计、W12 虚拟账本槽位、拾取扫描、空间化背包与世界藏物表（S5-1 自 eden-map.js 原样搬出）。
// 工厂风格同 host-*.mjs：createX(host) 只在入口调用一次；host 是入口给的依赖袋（活的变量 = 取 / 存器，函数 = 晚绑定转发），DEPS 是本模块要用的全部键。
import { cdnFetch } from './host-tavernhelper.mjs';
export const DEPS = [
  'LS', 'PACK_ID', 'PACK_IN', 'scriptBase', 'chatId', 'composeIn', 'life', 'lsGet', 'mvuStat', 'post', 'saveRoot', 'BASE', 'mvuBridge', 'uiLang', 'alive', 'floorNow',
];
export function createLootFlow(host) {
  for (const k of DEPS) if (!(k in host)) throw new Error('loot-flow: missing dep ' + k);
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
  import(scriptBase + 'core/rng.mjs').then(m => { rngModule = m; }).catch(() => {});
  import(scriptBase + 'tavern/check-failure-report.mjs').then(m => { FRm = m; }).catch(() => {});
  const diceOn = () => lsGet('edenMapDice') === '1' && rngModule && FRm;

  // W11 四域结算账本 + 时序守卫（docs/plans/llm-campaign.md；对齐「领域分账 / 渐进纠错」口径）：
  // 地图侧的确定性物理事实（拾取）记进 lootFacts，每轮由 core/ledger.mjs 的漏项审计器与宿主**实际落盘**
  // 的仓库对账——确实缺了才补**单项**缺口 patch（不重写整表），认不出 / 不在表里的留待结算（旧值不动）。
  // 写变量一律经 tavern/settlement-guard.mjs 的闸门排队，放行点是本轮末尾：读取期间绝不写，杜绝与主 MVU / 卡内
  // 状态引擎抢写（MVU 在场时那一拍就排在 VARIABLE_UPDATE_ENDED 收尾之后，见 mvu-bridge.markVarUpdate）。
  let ledgerModule = null, VSG = null, SSK = null;
  const lootFacts = [];                               // 本场会话的物理拾取事实（聊天维度：换聊天清空）
  const settleState = { claimed: [], floor: null, branch: null };   // 已补发水位（同一件只补一次，有界；带分支纪律）
  const settleCarry = { domains: [], floor: null };   // 待结算跨轮携带（未决的域带进下一轮，≤4；参考卡 pending-domain carry）
  // W12 虚拟账本槽位（任务一）：宿主 stat_data 里一个背包字段都没有时，由地图自建槽位并**强制入账**——
  // 事实先 capture 进内存队列，放行点（结算闸门 flush 之后）一次落盘，中途失败也不丢。**不写宿主 stat_data**
  // （卡的 MVU 带 zod 结构，未知键会被丢掉还可能触发校验报错，见 ledger.mjs 的同一段注释）。
  let slot = null;                                    // 槽位声明（随聊天变量 eden_map.槽位 落盘）
  const slotDeclared = () => { slot = ledgerModule.slotDeclare(slot, ledgerModule.slotProbe(host.mvuBridge.mvuStat()), host.floorNow); return true; };
  const slotWrite = (key, rows) => { if (!slot) slotDeclared(); slot = ledgerModule.slotPut(slot, rows, host.floorNow); saveRoot(); return true; };
  import(scriptBase + 'core/ledger.mjs').then(m => { ledgerModule = m; }).catch(() => {});
  import(scriptBase + 'tavern/settlement-guard.mjs').then(m => {
    VSG = m.createGate({ hasMvu: () => host.mvuBridge.mvuPresent(), epoch: () => host.mvuBridge.varUpdateSeq() });
    SSK = m.createSlotSink({ declare: slotDeclared, put: slotWrite });
  }).catch(() => {});
  const gate = () => VSG;
  function gateFlush(why = 'round') { try { return gate()?.flush(why) || null; } catch (e) { return null; } }
  /** 分支身份（同一楼换分支 = swipe / 重生成 ⇒ 该楼水位作废重算）：楼层 + 那一楼的 swipe 号 */
  const branchNow = () => { try { return String(host.floorNow) + ':' + String(host.mvuBridge.swipeAt(host.floorNow) ?? 0); } catch (e) { return String(host.floorNow) + ':0'; } };
  // 任务一（第二步）客观动作强制反思探测：正文里**写明的**物理获取动作也是事实来源——主模型因为「卡里没有
  // 背包字段」在 UpdateVariable 里漏掉道具时，这里把动作本身补成一条 loot 事实，交给同一套漏项审计 + 强制入账。
  // 纯计算在 core/pickup.mjs（node 单测 tests/auto_stash.test.mjs）；这里只做取数与副作用。
  let pickupModule = null; import(scriptBase + 'core/pickup.mjs').then(m => { pickupModule = m; }).catch(() => {});
  /** 已知物品名（世界藏物表 + 已经在账上的东西）：命中即视为「具体物品名词」，不必带引号 / 量词 */
  function knownItems() {
    const s = new Set();
    try { if (stashModule) for (const r of stashModule.rows(stash || {}, {})) if (r?.name) s.add(r.name); } catch (e) {}
    try { if (stashStoreModule) for (const r of stashStoreModule.rows(inv)) if (r?.名) s.add(r.名); } catch (e) {}
    return s;
  }
  /** 扫最新一楼正文（解析文本：思考链 / 变量块已剥）→ 物理拾取事实入账；已记过（同 id）的不重复。返回新增条数 */
  function scanPickups(msgs, place) {
    if (!pickupModule || !host.alive || life.dead) return 0;
    const last = msgs?.[msgs.length - 1]; if (!last?.text) return 0;
    let facts = []; try { facts = pickupModule.scan(last.text, { known: knownItems(), floor: last.floor, place }); } catch (e) { return 0; }
    let n = 0;
    for (const f of facts) { if (lootFacts.some(x => x?.id === f.id)) continue; lootFacts.push(f); n++; }
    while (lootFacts.length > 40) lootFacts.shift();
    return n;
  }
  /** 宿主实际落盘的状态视图（审计器的 landed 参数）：只为**这一轮真有事实的域**取视图，不白读一遍 MVU——
   *  资产域 = 仓库 id 表；NPC 域 = 在场名册的「人 → 当前地点」；事件域还没有落盘写入路径（不给视图 = 走待结算） */
  function landedView(facts) {
    const need = new Set((facts || []).map(f => f?.kind));
    const out = {};
    if (need.has('loot')) { const assets = {}; try { for (const [id, e] of Object.entries(inv?.items || {})) assets[id] = e?.名 || ''; } catch (e) {} out.assets = assets; }
    if (need.has('routine')) { const npc = {}; try { const p = host.mvuBridge.rosters(mvuStat())?.[host.mvuBridge.presentId]; for (const it of p?.items || []) if (it?.name && it?.place) npc[it.name] = it.place; } catch (e) {} out.npc = npc; }
    return out;
  }
  /** 漏项审计 + 单项补发（W11）：补的整行来自世界藏物表（不凭空造东西），补过的记水位不再重发——
   *  水位同时挡住了「玩家用掉 / 丢掉道具后又被审计器复活」这种反向错误。 */
  function ledgerSync() {
    if (!ledgerModule || !stashModule || !stashStoreModule || !host.alive || life.dead || !lootFacts.length) return null;   // 本场没有物理事实 = 不用对账
    const aud = ledgerModule.audit(lootFacts, landedView(lootFacts));
    ledgerModule.carry(settleCarry, aud.pending);                              // 未决的域带进下一轮（≤4，跨轮携带）
    const writable = aud.patches.filter(p => p.domain === 'assets');   // 只有资产域有落盘写入路径
    // 水位带分支纪律：回退剪掉未来、同一楼换了分支（swipe / 重生成）作废本楼记录后重新结算
    const cl = ledgerModule.claim(settleState, writable, { floor: host.floorNow, branch: branchNow() });
    let fixed = 0;
    for (const p of cl.fresh) {
      const row = stashModule.rows(stash, {}).find(r => r.id === p.id);
      // 藏物表里有这一件 → 用它的整行（不凭空造东西）；没有 → 用**正文事实**补一行：动作确实发生了，
      // 地点与楼号写进说明，数量恒为 1、暗格恒为否（不编卡里没有的东西）。
      const put = row ? stashModule.lootPut(row) : (p?.name ? { id: p.id, name: p.name, place: p.place || '', note: `正文拾取 · 第 ${Number.isInteger(p.floor) ? p.floor : host.floorNow} 楼`, qty: 1 } : null);
      if (!put) continue;
      const res = stashStoreModule.put(inv, put); if (!res.changed) continue;
      inv = res.inv; fixed++;
    }
    if (fixed) changedInv();                                          // 写聊天变量 + 推地图（拿到手的光点消失）
    // W12 虚拟槽位（任务一）：探路 → 声明（只做一次）→ 把还在账外的物理事实补进队列 → 落盘。
    // 「还在账外」= 槽位里没有这个 id：已经落过的天然跳过（幂等，也挡住了玩家用掉道具后被复活）。
    if (SSK && ledgerModule) {
      const probe = ledgerModule.slotProbe(host.mvuBridge.mvuStat());
      SSK.bind(probe); SSK.ensure(probe);
      for (const f of lootFacts) if (f?.id && !slot?.物?.[f.id]) SSK.capture({ id: f.id, 名: f.name, 地点: f.place, floor: f.floor });
      SSK.flush();
    }
    return { fixed, pending: aud.pending.length, repeated: cl.repeated, slot: SSK?.describe() || null };
  }

  // Part 5-1 拾取地上的藏物（core/stash.mjs 的行）：地图只说「拿了哪个 id」，真实性由这里核对——
  // 认不出的 id 一律不动背包（不替世界凭空变出东西）；认出了就写进 eden_map.仓库（同一份聊天变量，模型自己看得见）。
  function takeLoot(d) {
    try {
      if (!stashModule || !stash || !stashStoreModule || !d?.id) return;
      const row = stashModule.rows(stash, {}).find(r => r.id === d.id);
      if (!row) return;
      if (diceOn()) {   // 真掷骰：seed = 聊天 + 楼层 + 藏物 id（同一楼同一件永远同一骰，回放一致）；失手不入包、出失败报告
        const roll = 1 + Math.floor(rngModule.rng(rngModule.seedOf(chatId(), host.floorNow, d.id))() * 20);
        const sr = stashModule.search(row, roll);
        if (!sr.found) {
          FRm.push(frState, FRm.failureReport({ kind: 'search', place: row.place || d.place || '', dc: sr.dc, roll, margin: sr.dc - roll, floor: host.floorNow }));
          injectAction({ kind: 'fail', name: row.place || d.place || '', vars: { dc: sr.dc, roll, what: '搜刮失手' } });
          return;
        }
      }
      const res = stashStoreModule.put(inv, stashModule.lootPut(row));
      if (!res.changed) return;
      inv = res.inv; changedInv();   // 写变量 + 推地图（拿到手的光点会消失）
      // W11：物理事实入账（两条拾取路径——平面 eden-map:loot 与 Part 8 庄园三维 estate:loot——都汇到这里）。
      // 下一轮的漏项审计拿它和实际落盘对账：如果这一件没写进去（被主 MVU 的整表写回盖掉等），只补这一件。
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
        const roll = 1 + Math.floor(rngModule.rng(rngModule.seedOf(chatId(), host.floorNow, 'stealth', d?.from || '', d?.to || ''))() * 20);
        if (roll < dc) {
          FRm.push(frState, FRm.failureReport({ kind: 'stealth', place: d?.to || '', at: d?.worst?.at, dc, roll, margin: dc - roll, witnesses: d?.worst?.name ? [d.worst.name] : [], floor: host.floorNow }));
          injectAction({ kind: 'fail', name: d?.to || '', vars: { dc, roll, what: '潜行被目击' } });
          return;
        }
      }
      injectAction({ kind: 'stealth', name: d?.to || '', vars: { dc } });
    } catch (err) {}
  }

  // 空间化背包（Part 5-1，tavern/stash-store.mjs）：聊天变量 eden_map.仓库；地点卡显示 + 注入摘要，模型据此演「回房间取东西」
  let stashStoreModule = null; import(scriptBase + 'tavern/stash-store.mjs').then(m => { stashStoreModule = m; sendInv(); }).catch(() => {});
  let inv = { items: {}, seq: 0 };
  function sendInv() { if (host.alive) post({ type: 'eden-map:inv', items: stashStoreModule ? stashStoreModule.rows(inv) : [] }); }
  function changedInv(save = true) { if (save) saveRoot(); sendInv(); }
  // 世界藏物表（Part 5-1，core/stash.mjs）：包数据 manifest.data.stash 的行整张推给查看器（它以当前图自己筛），
  // 拿到手的东西由背包的 id 对账——不再在地上发光。
  let stashModule = null, stash = null, stashRaw = null;
  import(scriptBase + 'core/stash.mjs').then(m => { stashModule = m; if (stashRaw) { stash = m.normStash(stashRaw); sendStash(); } }).catch(() => {});
  { const sp = PACK_IN?.manifest?.data?.stash; if (sp) { const sb = PACK_ID === 'eden' ? '' : 'packs/' + PACK_ID + '/';
    cdnFetch(host.BASE + sb + sp).then(r => r.ok ? r.json() : null).then(j => { stashRaw = j; if (stashModule && j) { stash = stashModule.normStash(j); sendStash(); } }).catch(() => {}); } }
  function sendStash() { if (host.alive && stashModule) post({ type: 'eden-map:stash', items: stashModule.rows(stash || {}, {}) }); }
  return {
    changedInv, get FRm() { return FRm; }, frState, gate, gateFlush, injectAction, get inv() { return inv; }, set inv(v) { inv = v; }, get stashStoreModule() { return stashStoreModule; },
    ledgerSync, get ledgerModule() { return ledgerModule; }, lootFacts, scanPickups, sendInv, settleCarry, settleState, get slot() { return slot; }, set slot(v) { slot = v; },
    get SSK() { return SSK; }, stealthCheck, takeLoot,
  };
}
