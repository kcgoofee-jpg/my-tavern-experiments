// 地图在聊天变量里的根（eden_map）：自定义名称 / 用途的读写与迁移、本机存储预算、世界书同步、标签改名重放（S5-1 自 eden-map.js 原样搬出）。
// 工厂风格同 host-*.mjs：createX(host) 只在入口调用一次；host 是入口给的依赖袋（活的变量 = 取 / 存器，函数 = 晚绑定转发），DEPS 是本模块要用的全部键。
import { cdnFetch, fnOk, thFn } from './host-tavernhelper.mjs';
export const DEPS = [
  'contextPipeline', 'LS', 'MAN', 'PACK_ID', 'PACK_IN', 'scriptBase', 'chatId', 'checkpointResume', 'emit', 'hostToast', 'kfReset', 'life', 'panel', 'post', 'readVars',
  'recomputeSoon', 'wrapLS', 'BASE', 'explorationLedgerModule', 'stashStoreModule', 'keyframesModule', 'ledgerModule', 'mvuReaders', 'uiLang', 'worldbookJitModule', 'WBSm', 'alive', 'chars', 'cp', 'custVer', 'explored',
  'floorNow', 'ghost', 'inv', 'kfView', 'slot', 'tlWalk',
];
export function createRootStore(host) {
  for (const k of DEPS) if (!(k in host)) throw new Error('root-store: missing dep ' + k);
  const { contextPipeline, LS, MAN, PACK_ID, PACK_IN, scriptBase, chatId, checkpointResume, emit, hostToast, kfReset, life, panel, post, readVars, recomputeSoon, wrapLS } = host;
  const store = () => { try { return PACK_IN ? wrapLS(() => window.parent.localStorage) : window.parent.localStorage; } catch (e) { return null; } };

  // ---------------- v0.9.3 自定义名称与用途（聊天变量 eden_map.自定义；酒馆助手没有变量接口时退回本机 localStorage） ----------------
  // 不写进 stat_data：卡的 MVU zod 结构会丢掉未知键。删除一项要整块替换，所以写入优先用 updateVariablesWith / replaceVariables（insertOrAssignVariables 是深合并，删不掉键）。
  // 剧情标签 ⌖改名 / ⌖用途：只处理比 eden_map.标签楼 新的楼层，处理后记下楼层；每条在地图的事态横条上方提示一次。
  // 「同步到世界书」默认开（v0.9.5；自己关过的保持关）；有了第一项自定义才建世界书「<包名>·自定义·<聊天>」（一个常驻条目），当前聊天没有绑定聊天世界书时绑定到这个聊天。
  let custom = null, customChat = null, toastQ = [], regP = null;   // 标签楼层状态（tagFloor / tagLog / tagSeen）在流水线里（contextPipeline.tag）
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
  import(new URL('storage-budget.mjs', import.meta.url).href).then(m => { storageBudget = m; }).catch(() => {});
  function storeWarn(reason) {
    if (life.dead || Date.now() - (warnAt[reason] || 0) < 60000) return; warnAt[reason] = Date.now();
    const msg = storageBudget ? storageBudget.warnText(reason, host.uiLang === 'en') : '本机存储写入失败'; console.warn('[eden-map]', msg);
    if (!panel.hidden && host.alive && !host.ghost) { toastQ.push(msg); flushToasts(); return; }
    hostToast(host.uiLang === 'en' ? 'Map storage' : '地图存储', [msg], 12000);
  }
  function budgetSweep() {   // 启动空闲时：记下当前聊天刚用过，聊天数超了按 LRU 清最久的；量一下占用（EdenMap.storage() 可取）
    if (!storageBudget) return; const ls = store(); if (!ls) return;
    storageBudget.touch(ls, chatId()); const r = storageBudget.sweep(ls, chatId()); if (r.dropped.length) console.info('[eden-map] 清理旧聊天的地图数据', r.dropped.length, '个聊天', r.freed, '字节');
  }
  const saveRoot = () => { const { inv, ledgerModule, slot, explored, cp, kfView } = host; return life.dead ? Promise.resolve(false) : writeVars({ 自定义: custom, 标签楼: contextPipeline.tag.floor, 标签记录: contextPipeline.tag.log, 楼层指纹: contextPipeline.tag.seen, 行程: contextPipeline.trips, 仓库: inv, ...(ledgerModule && ledgerModule.slotSave(slot) ? { 槽位: ledgerModule.slotSave(slot) } : {}), ...(Object.keys(explored).length ? { 探索: explored } : {}), ...(cp ? { 检查点: cp } : {}), ...(kfView ? { 关键帧: kfView } : {}) }, customChat); };
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
  async function loadCustom() {
    if (!host.mvuReaders) return;
    const id = chatId(); customChat = id;
    const v = readVars(); custom = host.mvuReaders.normCustom(v.自定义);   // 标签楼层 / 记录 / 指纹整块换进流水线（撤销-重放状态机的状态）
    contextPipeline.tag = { floor: Number.isFinite(+v.标签楼) && v.标签楼 !== null ? +v.标签楼 : -1,
      log: Array.isArray(v.标签记录) ? v.标签记录.filter(r => r && Number.isFinite(r.floor) && typeof r.key === 'string').slice(-30) : [],
      seen: v.楼层指纹 && typeof v.楼层指纹 === 'object' ? { ...v.楼层指纹 } : {} };
    host.explored = host.explorationLedgerModule ? host.explorationLedgerModule.norm(v.探索) : (v.探索 && typeof v.探索 === 'object' ? v.探索 : {});
    host.inv = host.stashStoreModule ? host.stashStoreModule.norm(v.仓库) : { items: {}, seq: 0 };   // 空间化背包（Part 5-1）
    host.slot = v.槽位 && typeof v.槽位 === 'object' && !Array.isArray(v.槽位) && typeof v.槽位.名 === 'string' ? v.槽位 : null;   // W12 虚拟账本槽位（任务一）
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
    customChanged(false);
  }
  function customChanged(save = true) {
    host.custVer++; if (save) saveRoot();
    sendCustom(); emit('custom', host.mvuReaders.normCustom(custom)); recomputeSoon(50);
    if (custom?.同步世界书 || wbState) syncWb(!!custom?.同步世界书).catch(e => console.warn('[eden-map] 同步世界书失败', e));
  }
  function sendCustom() { if (host.alive && custom) { post({ type: 'eden-map:custom', data: custom, vars: varsOk(), wb: wbOk(), wbState }); post({ type: 'eden-map:fog', explored: host.explored }); } flushToasts(); }
  const wbOk = () => fnOk('createOrReplaceWorldbook') || fnOk('createWorldbook');
  async function wbExists(n) { try { return fnOk('getWorldbookNames') ? (await getWorldbookNames() || []).includes(n) : false; } catch (e) { return false; } }
  let wbState = '';
  /** 任务二 静默绑定代理：一本我们的书在那儿却没挂上任何一处 → 自己找一档挂上（纯判定在 wb_jit.bindPlan）。
   *  已有绑定一律不动（改了用户的选择 = 串味儿）；只在「一处都没挂」时补，失败 / 没接口 → null。 */
  async function silentBind(name) {
    try {
      const W = host.WBSm ?? await import(scriptBase + 'tavern/worldbook-sync.mjs').catch(() => null);
      const J = host.worldbookJitModule ?? await import(scriptBase + 'tavern/worldbook-jit.mjs').catch(() => null);
      if (!W?.bindingOf || !J?.bindPlan) return null;
      const b = await W.bindingOf(thFn, name);
      const w = J.bindPlan(b, { api: { chat: fnOk('rebindChatWorldbook'), char: fnOk('rebindCharWorldbooks'), global: fnOk('rebindGlobalWorldbooks') } });
      if (w === 'none') return null;
      const ok = await W.bind(thFn, name, w);
      console.info('[eden-map] 世界书未绑定 → 静默水合：', name, w, ok ? 'ok' : 'fail');
      return ok ? w : null;
    } catch (e) { return null; }
  }
  // 世界书按聊天分开（mvuReaders.wbName(聊天 id)），不然绑定了同一本的聊天会互相注入；关掉同步时把条目停用（不删世界书）
  async function syncWb(on = true) {
    if (!wbOk() || !host.mvuReaders.wbName(customChat)) { wbState = 'noapi'; return false; }   // 世界书名还没配（没取到包清单）：不建
    const content = host.mvuReaders.wbContent(custom), WBN = host.mvuReaders.wbName(customChat);
    // 用到才建（v0.9.5）：还没有任何自定义时不建世界书；已经建过的照常写（条目停用）
    if (!content && !(await wbExists(WBN))) { wbState = on ? 'empty' : ''; sendCustom(); return true; }
    const entry = { name: host.mvuReaders.WB_ENTRY, enabled: on && !!content, strategy: { type: 'constant', keys: [] }, position: { type: 'after_character_definition', order: 903 }, content: content || '（空）',
      recursion: { prevent_incoming: true, prevent_outgoing: true } };
    if (fnOk('createOrReplaceWorldbook')) await createOrReplaceWorldbook(WBN, [entry]); else await createWorldbook(WBN, [entry]);
    if (!on) { wbState = ''; sendCustom(); return true; }
    // 绑定：当前聊天没有聊天世界书时绑定到这个聊天；已有别的就不动（在地图设置里提示手动启用）
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
    if (host.chars.some(c => c.name === key)) return 'character';
    const e = Object.values(regNow?.maps || {}).find(m => m.kind === 'estate');
    if (e?.rooms?.includes(key)) return 'room'; if (e?.areas?.includes(key)) return 'area';
    return 'landmark';
  }
  // 剧情标签 ⌖改名 / ⌖用途（v0.9.3）：撤销-重放状态机在流水线里（tavern/context.mjs customTags，node 单测）；
  // 这里只做守卫与副作用——有应用 / 撤销走 customChanged（提示 + 保存 + 世界书），纯指纹收紧只 saveRoot。
  function customTags(msgs) {
    if (!host.mvuReaders || !custom || customChat !== chatId()) return;
    const r = contextPipeline.customTags(custom, msgs, host.floorNow, kindOf);
    if (!r) return;
    custom = r.custom; contextPipeline.tag = r.tag;
    if (r.applied.length || r.undone) { toastQ.push(...r.applied.map(host.mvuReaders.tagToast)); customChanged(true); } else saveRoot();
  }
  function flushToasts() { if (!host.alive || !toastQ.length) return; post({ type: 'eden-map:toast', items: toastQ.splice(0) }); }
  return {
    get storageBudget() { return storageBudget; }, budgetSweep, get custom() { return custom; }, set custom(v) { custom = v; }, customChanged, get customChat() { return customChat; },
    customTags, kindOf, loadCustom, reg, get regNow() { return regNow; }, saveRoot, sendCustom, store, storeWarn, varsOk,
    get wbState() { return wbState; }, set wbState(v) { wbState = v; },
  };
}
