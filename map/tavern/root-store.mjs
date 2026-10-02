// 地图在聊天变量里的根（eden_map）：自定义名称 / 用途的读写与迁移、本机存储预算、世界书同步、标签改名重放（S5-1 自 eden-map.js 原样搬出）。
// 工厂风格同 host-*.mjs：createX(host) 只在入口调用一次；host 是入口给的依赖袋（活的变量 = 取 / 存器，函数 = 晚绑定转发），DEPS 是本模块要用的全部键。
import { cdnFetch, fnOk, thFn } from './host-tavernhelper.mjs';
import { recordNorm, describeRecord } from '../core/settlement-record.mjs';
import { fromV1 } from '../core/compat-v1.mjs';
import { records, idFinder } from '../core/place-record.mjs';
import * as CR from '../core/custom-record.mjs';
import { createChatData } from './chat-data.mjs';
export const DEPS = [
  'contextPipeline', 'LS', 'MAN', 'PACK_ID', 'PACK_IN', 'scriptBase', 'chatId', 'checkpointResume', 'emit', 'hostToast', 'kfReset', 'life', 'panel', 'post', 'readVars',
  'recomputeSoon', 'wrapLS', 'BASE', 'explorationLedgerModule', 'stashStoreModule', 'keyframesModule', 'mvuReaders', 'uiLang', 'worldbookJitModule', 'WBSm', 'alive', 'chars', 'cp', 'custVer', 'explored',
  'floorNow', 'ghost', 'kfView', 'stash', 'changedInv', 'tlWalk', 'ledgerRecord', 'autoCache', 'mvuBridge', 'onChatSwitch', 'SCRIPT', 'VER', 'plainVer',
];
export function createRootStore(host) {
  for (const k of DEPS) if (!(k in host)) throw new Error('root-store: missing dep ' + k);
  const { contextPipeline, LS, MAN, PACK_ID, PACK_IN, scriptBase, chatId, checkpointResume, emit, hostToast, kfReset, life, panel, post, readVars, recomputeSoon, wrapLS } = host;
  const store = () => { try { return PACK_IN ? wrapLS(() => window.parent.localStorage) : window.parent.localStorage; } catch (e) { return null; } };

  // ---------------- v0.9.3 自定义名称与用途（聊天变量 eden_map.自定义；酒馆助手没有变量接口时退回本机 localStorage） ----------------
  // 不写进 stat_data：卡的 MVU zod 结构会丢掉未知键。删除一项要整块替换，所以写入优先用 updateVariablesWith / replaceVariables（insertOrAssignVariables 是深合并，删不掉键）。
  // 剧情标签 ⌖改名 / ⌖用途：只处理比 eden_map.标签楼 新的楼层，处理后记下楼层；每条在地图的事态横条上方提示一次。
  // 「同步到世界书」默认开（v0.9.5；自己关过的保持关）；有了第一项自定义才建世界书「<包名>·自定义·<聊天>」（一个常驻条目），当前聊天没有绑定聊天世界书时绑定到这个聊天。
  let custom = null, customChat = null, toastQ = [], regP = null, evHide = [];   // evHide = the event keys the player hid in this chat (DRAWER-1)   // 标签楼层状态（tagFloor / tagLog / tagSeen）在流水线里（contextPipeline.tag）
  const varsOk = () => fnOk('getVariables') && (fnOk('updateVariablesWith') || fnOk('replaceVariables') || fnOk('insertOrAssignVariables'));
  const lsCustomKey = () => 'edenMap:chat:' + (chatId() || '') + ':custom2';   // A-11 本机退回的键（读取在桥里，写入后清掉它）
  async function writeVars(root, chat) {
    if (life.dead) return false;
    if (chat !== chatId()) return false;   // 换聊天了：这次写入作废，不写进别的聊天
    if (varsOk()) {
      try {
        let same = false; try { same = JSON.stringify(getVariables({ type: 'chat' })?.[host.mvuReaders.VAR_ROOT]) === JSON.stringify(root); } catch (e) {}   // 幂等：内容没变不写（重放事件 / 两个实例不重复触发保存）
        if (same) { try { (LS || localStorage).removeItem(lsCustomKey()); } catch (e) {} return true; }
        if (fnOk('updateVariablesWith')) await updateVariablesWith(v => { v[host.mvuReaders.VAR_ROOT] = root; return v; }, { type: 'chat' });
        else if (fnOk('replaceVariables')) { const all = { ...(getVariables({ type: 'chat' }) || {}) }; all[host.mvuReaders.VAR_ROOT] = root; await replaceVariables(all, { type: 'chat' }); }
        else await insertOrAssignVariables({ [host.mvuReaders.VAR_ROOT]: root }, { type: 'chat' });
        try { (LS || localStorage).removeItem(lsCustomKey()); } catch (e) {}   // 之前退回本机的那份已经过时
        return true;
      } catch (e) { console.warn('[eden-map] 写聊天变量失败，改存本机', e); varsFailed = true; }
    }
    const r = storageBudget ? storageBudget.safeSet(LS || localStorage, lsCustomKey(), JSON.stringify(root), chat) : (() => { try { (LS || localStorage).setItem(lsCustomKey(), JSON.stringify(root)); return { ok: true }; } catch (e) { return { ok: false, reason: 'quota' }; } })();
    if (!r.ok) { storeWarn(r.reason); return false; }
    if (varsFailed) { varsFailed = false; storeWarn('vars'); }   // UI 不能再说「已保存到聊天」却悄悄存在本机
    return true;
  }
  // ---------------- A-13 本机存储预算（tavern/storage-budget.mjs）：LRU 清旧聊天的地图键、头像上限；出问题时告诉用户（面板开着走地图的提示条，关着走宿主小提示） ----------------
  let storageBudget = null, varsFailed = false; const warnAt = {};
  const budgetP = import(new URL('storage-budget.mjs', import.meta.url).href).then(m => { storageBudget = m; return m; }).catch(() => null);
  function storeWarn(reason) {
    if (life.dead || Date.now() - (warnAt[reason] || 0) < 60000) return; warnAt[reason] = Date.now();
    const msg = storageBudget ? storageBudget.warnText(reason, host.uiLang === 'en') : '本机存储写入失败'; console.warn('[eden-map]', msg);
    if (!panel.hidden && host.alive && !host.ghost) { toastQ.push(msg); flushToasts(); return; }
    hostToast(host.uiLang === 'en' ? 'Map storage' : '地图存储', [msg], 12000);
  }
  function budgetSweep() {   // 启动空闲时：记下当前聊天刚用过，聊天数超了按 LRU 清最久的；量一下占用（EdenMap.storage() 可取）。预算模块还在加载就等它（启动空闲可能比它先到）
    budgetP.then(SB => {
      if (!SB || life.dead) return; const ls = store(); if (!ls) return;
      SB.touch(ls, chatId()); const r = SB.sweep(ls, chatId()); if (r.dropped.length) console.info('[eden-map] 清理旧聊天的地图数据', r.dropped.length, '个聊天', r.freed, '字节');
      return chatData.orphanSweep();   // 已删聊天留下的本机行 / 图集图片 / 每聊天世界书（读不到聊天列表就什么都不做）
    }).catch(e => console.warn('[eden-map] 存储清理失败', e));
  }
  const chatData = createChatData(host, { store, ls: () => LS, varsOk: () => varsOk(), clearWb: () => { wbState = ''; } });
  // S6-2：背包存 stash（一份、ASCII 键）；旧键 仓库 / 槽位 只读——加载时迁移一次，之后原样随每次保存带回去（整块替换不能把它们丢了），没有旧键的聊天不会多出它们
  let legacyKeep = {};
  const ledgerOf = () => { const r = host.ledgerRecord, d = r && typeof r === 'object' ? describeRecord(r) : null; return d && (d.npc || d.events) ? { ledger: recordNorm(r) } : {}; };   // K-R78: the key only when there is an entry
  const saveRoot = () => { const { stash, explored, cp, kfView } = host; return life.dead ? Promise.resolve(false) : writeVars({ 自定义: custom, 标签楼: contextPipeline.tag.floor, 标签记录: contextPipeline.tag.log, 楼层指纹: contextPipeline.tag.seen, 行程: contextPipeline.trips, ...(stash ? { stash } : {}), ...(evHide.length ? { evHide } : {}), ...ledgerOf(), ...legacyKeep, ...(Object.keys(explored).length ? { 探索: explored } : {}), ...(cp ? { 检查点: cp } : {}), ...(kfView ? { 关键帧: kfView } : {}), ...(host.autoCache ? { auto: host.autoCache } : {}) }, customChat); };   // `auto` = the automatic pack's droppable cache (K-R95, tavern/auto-pack.mjs)
  // 旧版（≤ 0.9.2）本机叫法 edenMap:chat:<id>:custom / edenMap:custom → 并进来，旧键改名为 *.migrated（不删）
  // 只在这个聊天还没有 eden_map.自定义 时迁移一次（全局旧键不改名，靠这个条件避免每个聊天、每次刷新重复并入）
  async function migrateOld() {
    const H = await import(scriptBase + 'core/legacy-custom.mjs').catch(() => null), st = store(); if (!H || !st) return false;
    let any = false;
    for (const k of [H.customKey(chatId()), H.customKey('')]) {
      const rooms = (() => { try { return JSON.parse(st.getItem(k) || 'null')?.rooms || null; } catch (e) { return null; } })();
      if (!rooms || !Object.keys(rooms).length) continue;
      const r = host.mvuReaders.migrateRooms(custom, rooms); custom = r.custom; any = true;
      if (k !== H.customKey('')) { try { st.setItem(k + '.migrated', st.getItem(k)); st.removeItem(k); } catch (e) {} }
    }
    return any;
  }
  // PLACE-1b（docs/place-record.md §5.2）：自定义项的键跟着记录走（有节点树的包用节点 id），包里的原名留在 标。
  // 解析器来自包自己的节点表 + 房间表（查看器读的是同两份文件，core/compat-v1 + core/place-record）；取不到就退回按名字认，什么都不丢。
  let keysP = null, keysNow = null, tagsIdOf = null;
  async function placeKeys() {
    if (keysP) return keysP;
    keysP = (async () => {
      const none = { idOf: () => null, ready: false };
      try {
        const man = await host.MAN; if (!man) return none;
        const maps = regNow || await reg(); if (!maps?.maps) return none;
        const nodes = fromV1({ manifest: man, maps }).pack?.nodes || [];
        let plan = null; const rel = man.data?.rooms;   // 房间表带 node，节点的 id 才有意义
        if (rel && host.BASE) { const r = await cdnFetch(host.BASE + (PACK_ID === 'eden' ? '' : 'packs/' + PACK_ID + '/') + rel).catch(() => null); plan = r?.ok ? await r.json().catch(() => null) : null; }
        if (!plan?.rooms) return none;
        const all = records({ nodes, plan }), idOf = idFinder({ nodes, plan });
        keysNow = { idOf, by: new Map(all.map(r => [r.id, r.name])) };
        return { idOf, ready: true };
      } catch (e) { console.warn('[eden-map] 地点键解析不可用，仍按名字认', e); return none; }
    })();
    return keysP;
  }
  /** 一个地点词 → 它在自定义数据里的键（已有的项优先，其次节点 id，最后原词）；顺带给出包里的原名（键是 id 时写进 标） */
  async function placeKeyOf(word) {
    const k = String(word || '').trim(); if (!k || !custom) return { key: k, std: k };
    const mvr = host.mvuReaders, hit = mvr?.findKey(custom, k), km = await placeKeys();
    const key = hit || km.idOf(k) || k;
    return { key, std: hit ? mvr.stdOf(custom, hit) : (km.by?.get(key) || (key === k ? k : mvr?.stdOf(custom, key) || k)) };
  }
  async function loadCustom() {
    if (!host.mvuReaders) return;
    const id = chatId(); customChat = id;
    const v = readVars(); custom = host.mvuReaders.normCustom(v.自定义);   // 标签楼层 / 记录 / 指纹整块换进流水线（撤销-重放状态机的状态）
    contextPipeline.tag = { floor: Number.isFinite(+v.标签楼) && v.标签楼 !== null ? +v.标签楼 : -1,
      log: Array.isArray(v.标签记录) ? v.标签记录.filter(r => r && Number.isFinite(r.floor) && typeof r.key === 'string').slice(-30) : [],
      seen: v.楼层指纹 && typeof v.楼层指纹 === 'object' ? { ...v.楼层指纹 } : {} };
    host.explored = host.explorationLedgerModule ? host.explorationLedgerModule.norm(v.探索) : (v.探索 && typeof v.探索 === 'object' ? v.探索 : {});
    // 统一背包（S6-2，K-R74）：有 stash 就读；没有而有旧键（仓库 / 槽位）就迁移一次；旧键的值原样留着（legacyKeep），不改不删。
    // 起点不取 floorNow（换聊天时它还是上一个聊天的值）：存储第一次扫描时对齐到最新一楼，和旧版「只看最新一楼」同一口径。
    evHide = Array.isArray(v.evHide) ? [...new Set(v.evHide.filter(k => typeof k === 'string' && k).map(k => k.slice(0, 120)))].slice(-300) : [];
    legacyKeep = {}; let migrated = false;
    const SM = host.stashStoreModule ?? await import(new URL('stash-store.mjs', import.meta.url).href).catch(() => null);   // 模块还没到：等它，不能带着空的旧键保存
    if (customChat !== id) return;
    if (SM) {
      const m = SM.migrate(v, { msgIndex: null, worldIds: new Set() });
      host.stash = m.stash; migrated = m.migrated;
      for (const k of [SM.V1_KEYS.inventory, SM.V1_KEYS.slot]) if (v[k] !== undefined) legacyKeep[k] = v[k];
    }
    host.ledgerRecord = v.ledger === undefined ? null : recordNorm(v.ledger);   // K-R78: the map's own settlement record (a droppable cache)
    kfReset();   // W3 关键帧：换聊天 / 重载一律从零重建（可丢弃缓存；旧视图经 compress 重验证后接上）
    if (host.keyframesModule && v.关键帧 && typeof v.关键帧 === 'object' && Array.isArray(v.关键帧.frames)) {
      const top = Math.min(Math.round(+v.关键帧.top) || 0, host.floorNow >= 0 ? host.floorNow : Math.round(+v.关键帧.top) || 0);
      const back = host.keyframesModule.compress(v.关键帧.frames, top);
      if (back.frames.length) { host.kfView = back; host.tlWalk = { top: Math.min(back.top, host.floorNow >= 0 ? host.floorNow : back.top), pts: host.keyframesModule.flatten(back) }; }
    }
    checkpointResume(v.检查点);
    if (v.自定义 === undefined) { const mig = await migrateOld(); if (customChat !== id) return; if (mig) await saveRoot(); }
    else if (v.自定义?.同步世界书 === false && !v.自定义.同步手动) {   // 0.9.3 的数据：建过这一本世界书 = 自己关掉的，保持关；否则按新默认（开）
      const had = await wbExists(host.mvuReaders.wbName(id)); if (customChat !== id) return;
      custom = host.mvuReaders.normCustom(host.mvuReaders.syncMigrate(v.自定义, had)); custom.同步手动 = true; await saveRoot(); }   // 迁移结果立刻写回（否则下次加载会把新建的世界书当成「自己关过」）
    if (customChat !== id) return;
    // PLACE-1b：旧键（标准名）换成节点 id，名字搬进 标；换不到的照旧按名字认。改过一次，之后不再动。
    const km = await placeKeys(); if (customChat !== id) return;
    if (km.ready && Object.keys(custom.items).length) {
      const mig = CR.migrateKeys(custom, km.idOf);
      if (mig.moved) { custom = host.mvuReaders.normCustom(mig.custom); await saveRoot(); }
      if (customChat !== id) return;
    }
    if (migrated) await saveRoot();   // 迁移结果落盘一次（内容没变时 writeVars 自己不写）
    if (customChat !== id) return;
    customChanged(false);
  }
  function customChanged(save = true) {
    host.custVer++; if (save) saveRoot();
    sendCustom(); emit('custom', host.mvuReaders.normCustom(custom)); recomputeSoon(50);
    if (custom?.同步世界书 || wbState) syncWb(!!custom?.同步世界书).catch(e => console.warn('[eden-map] 同步世界书失败', e));
  }
  function sendCustom() { if (host.alive && custom) { post({ type: 'eden-map:custom', data: custom, vars: varsOk(), wb: wbOk(), wbState }); post({ type: 'eden-map:fog', explored: host.explored }); post({ type: 'eden-map:hidden', events: evHide }); } flushToasts(); }
  /** the viewer's hide / restore intent (DRAWER-1): an event key goes into <chat var>.evHide; an item name goes into <chat var>.stash.notItems. Nothing else is touched. */
  function onHide(d) {
    const key = typeof d?.key === 'string' ? d.key.slice(0, 120) : '', on = d?.on !== false; if (!key || customChat !== chatId()) return;
    if (d.kind === 'event') { const has = evHide.includes(key); if (has === on) return; evHide = on ? [...evHide, key].slice(-300) : evHide.filter(k => k !== key); saveRoot(); sendCustom(); return; }
    if (d.kind === 'item' && host.stashStoreModule && host.stash) { const r = host.stashStoreModule.setNotItem(host.stash, key, on); if (r.changed) { host.stash = r.stash; host.changedInv(); } }
  }
  const wbOk = () => fnOk('createOrReplaceWorldbook') || fnOk('createWorldbook');
  async function wbExists(n) { try { return fnOk('getWorldbookNames') ? (await getWorldbookNames() || []).includes(n) : false; } catch (e) { return false; } }
  let wbState = '';
  /** 任务二 静默绑定代理：一本我们的书在那儿却没挂上任何一处 → 自己找一档挂上（纯判定在 wb_jit.bindPlan）。
   *  已有绑定一律不动（改了用户的选择 = 串味儿）；只在「一处都没挂」时补，失败 / 没接口 → null。 */
  async function silentBind(name) {
    try {
      const W = host.WBSm ?? await import(scriptBase + 'tavern/worldbook-sync.mjs').catch(() => null);
      if (!W?.bindingOf || !W?.customBindPlan) return null;
      const b = await W.bindingOf(thFn, name);
      let chatCur = null, hasChar = false;
      try { chatCur = fnOk('getChatWorldbookName') ? await getChatWorldbookName('current') : null; } catch (e) {}
      try { hasChar = !!(fnOk('getCharWorldbookNames') && await getCharWorldbookNames('current')); } catch (e) {}
      const w = W.customBindPlan(b, name, { chatCur, hasChar, api: { chat: fnOk('rebindChatWorldbook'), char: fnOk('rebindCharWorldbooks'), global: fnOk('rebindGlobalWorldbooks') } });   // N15：聊天槽被别的书占着 → 角色附加书（不是聊天）
      if (w === 'none') return null;
      const ok = await W.bind(thFn, name, w);
      console.info('[eden-map] 世界书未绑定 → 静默水合：', name, w, ok ? 'ok' : 'fail');
      return ok ? w : null;
    } catch (e) { return null; }
  }
  // 世界书按聊天分开（mvuReaders.wbName(聊天 id)），不然绑定了同一本的聊天会互相注入；关掉同步时把条目停用（不删世界书）
  async function syncWb(on = true) {
    if (!wbOk() || !host.mvuReaders.wbName(customChat)) { wbState = 'noapi'; return false; }   // 世界书名还没配（没取到包清单）：不建
    const mvr = host.mvuReaders, WBN = mvr.wbName(customChat), has = mvr.wbHasContent(custom);
    // 用到才建（v0.9.5）：还没有任何自定义时不建世界书；已经建过的照常写（条目停用）
    if (!has && !(await wbExists(WBN))) { wbState = on ? 'empty' : ''; sendCustom(); return true; }
    // PLACE-1a：一条常驻索引（只有名字对照）+ 每个有说明 / 用途 / 事实的地点一条关键词条目；关掉同步只是全部停用
    const W = host.WBSm ?? await import(scriptBase + 'tavern/worldbook-sync.mjs').catch(() => null), info = { version: host.plainVer(host.VER) || host.SCRIPT?.version || '', build: Number.isInteger(host.SCRIPT?.build) ? host.SCRIPT.build : null };
    const keyed = mvr.wbEntries(custom, { on }).length - 1;   // WB-2: a disabled readme entry goes first (what the book is, written when, by which map build)
    const entries = mvr.wbEntries(custom, { on, readme: W?.customReadme?.({ map: info, now: Date.now(), lang: host.uiLang === 'en' ? 'en' : 'zh', on, count: keyed }) });
    if (fnOk('createOrReplaceWorldbook')) await createOrReplaceWorldbook(WBN, entries); else await createWorldbook(WBN, entries);
    if (!on) { wbState = ''; sendCustom(); return true; }
    // 绑定：聊天槽空着绑到这个聊天；被别的书占着就退到角色附加世界书 / 全局（N15），别的绑定一律不动
    let bound = false;
    try { const cur = fnOk('getChatWorldbookName') ? getChatWorldbookName('current') : null;
      if (cur === WBN) bound = true; else if (!cur && fnOk('rebindChatWorldbook')) { await rebindChatWorldbook('current', WBN); bound = true; } } catch (e) {}
    if (!bound) try { bound = (fnOk('getGlobalWorldbookNames') && getGlobalWorldbookNames().includes(WBN)); } catch (e) {}
    if (!bound) { bound = !!(await silentBind(WBN)); if (!bound) console.info('[eden-map] 世界书未绑定，且没有可用的绑定接口：', WBN); }   // 任务二：不再让玩家进后台手动勾
    wbState = bound ? 'bound' : 'unbound'; sendCustom(); return true;
  }
  // 标签用到的「类」：人物栏里的名字 → 人物；主场景房间 / 区域（maps.json）→ 房间 / 区域；其余当地标
  const reg = () => (regP ??= MAN.then(man => (man?.data?.maps ? cdnFetch(host.BASE + (PACK_ID === 'eden' ? '' : 'packs/' + PACK_ID + '/') + man.data.maps).then(r => (r.ok ? r.json() : null)) : null)).catch(() => null));   // 路径读自包清单 data.maps
  let regNow = null; reg().then(r => { regNow = r; });
  // 注：reg() 用的是当前线路的 maps.json（与地图同一份）；取不到时一律当地标
  function kindOf(key) {
    const n = keyName(key);   // PLACE-1b: 键可能是节点 id，判定类别一律按包里的原名
    if (host.chars.some(c => c.name === n)) return 'character';
    const e = Object.values(regNow?.maps || {}).find(m => m.kind === 'estate');
    if (e?.rooms?.includes(n)) return 'room'; if (e?.areas?.includes(n)) return 'area';
    return 'landmark';
  }
  /** 键 → 包里的原名（同步的项已换键时用得上；解析器没到之前就是键本身） */
  function keyName(key) { const known = keysNow?.by.get?.(key); return known || CR.stdOf(custom?.items?.[key], key); }
  // 剧情标签 ⌖改名 / ⌖用途（v0.9.3）：撤销-重放状态机在流水线里（tavern/context.mjs customTags，node 单测）；
  // 这里只做守卫与副作用——有应用 / 撤销走 customChanged（提示 + 保存 + 世界书），纯指纹收紧只 saveRoot。
  function customTags(msgs) {
    if (!host.mvuReaders || !custom || customChat !== chatId()) return;
    placeKeys().then(km => { if (km.ready) tagsIdOf = km.idOf; });   // PLACE-1b：标签里的地点名换成节点 id（解析器没到就按名字认）
    const r = contextPipeline.customTags(custom, msgs, host.floorNow, kindOf, tagsIdOf);
    if (!r) return;
    custom = r.custom; contextPipeline.tag = r.tag;
    if (r.applied.length || r.undone) { toastQ.push(...r.applied.map(host.mvuReaders.tagToast)); customChanged(true); } else saveRoot();
  }
  /** PLACE-1a: the record editor's save (patch = { name?, use?, desc?, facts?, aliases?, base? }; '' / [] puts the pack's text back) and its undo. Both go through setCustom, so the chat variable, the viewer and the chat's custom book follow. */
  function placeEdit(id, patch) {
    const mvr = host.mvuReaders, key = typeof id === 'string' ? id.trim() : '';
    if (!mvr || !custom || customChat !== chatId() || !key || !patch || typeof patch !== 'object') return false;
    const p = {}; for (const k of ['name', 'desc', 'facts', 'aliases', 'base']) if (k in patch) p[k] = patch[k];
    if ('use' in patch) p.note = patch.use;
    const km = keysNow, std = km?.by?.get(key) || CR.stdOf(custom.items[key], key);   // PLACE-1b: 键是节点 id 时把包里的原名一起存下
    const r = mvr.setCustom(custom, key, { ...p, std, kind: custom.items[key]?.类 || kindOf(key), source: 'manual', floor: Math.max(0, Math.trunc(+host.floorNow) || 0), undo: true }, km?.idOf || null);
    if (!r) return false; custom = r; customChanged(true); return true;
  }
  function placeUndo(id) {
    const mvr = host.mvuReaders; if (!mvr || !custom || customChat !== chatId()) return false;
    const r = mvr.undoCustom(custom, typeof id === 'string' && id.trim() ? id.trim() : undefined); if (!r) return false; custom = r; customChanged(true); return true;
  }
  function flushToasts() { if (!host.alive || !toastQ.length) return; post({ type: 'eden-map:toast', items: toastQ.splice(0) }); }
  return {
    get storageBudget() { return storageBudget; }, budgetSweep, resetChat: () => chatData.reset(), orphanSweep: () => chatData.orphanSweep(), get custom() { return custom; }, set custom(v) { custom = v; }, customChanged, get customChat() { return customChat; },
    customTags, kindOf, loadCustom, onHide, placeEdit, placeKeyOf, placeUndo, get evHide() { return evHide; }, reg, get regNow() { return regNow; }, saveRoot, sendCustom, store, storeWarn, varsOk,
    get wbState() { return wbState; }, set wbState(v) { wbState = v; },
  };
}
