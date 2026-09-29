// 酒馆助手（TavernHelper）适配层：宿主脚本 eden-map.js 碰酒馆 / 助手接口的地方都在这里（C2 第 4 步从 eden-map.js 拆出，行为不变）。
// 不碰 DOM、不持有面板状态；世界书全自动（createWbAuto）是整块原样搬来的，自由变量改成 deps 显式传入（面板状态用 getter，读的是调用时的值）。
// 模块地图见 docs/agent-brief.md「模块地图」。
// 地基 A1（docs/tavernhelper-audit.md §6）：所有外部请求走这一个包装——不带凭据、不带 Referer；与 tavern/th.mjs cdnFetch 同一规则（tests/cdnfetch.test.mjs 对照、并禁止裸 fetch）
export const cdnFetch = (u, o = {}) => fetch(u, { ...o, credentials: 'omit', referrerPolicy: 'no-referrer' });
// 窗口函数取法（地基 A3）：全局优先，其次 TavernHelper 命名空间
export const thFn = n => { try { const g = window[n] ?? globalThis[n]; if (typeof g === 'function') return g; const t = window.TavernHelper; return typeof t?.[n] === 'function' ? t[n].bind(t) : null; } catch (e) { return null; } };
export const fnOk = n => { try { return typeof window[n] === 'function' || typeof globalThis[n] === 'function'; } catch (e) { return false; } };
// 世界书（v0.9.6）：判定与接口兼容都在 selfcheck.mjs 的 collectWorldbook（node 单测 tests/worldbook096.test.mjs）；这里只把接口交给它：
// 全局函数优先，其次酒馆助手的 TavernHelper 命名空间（有的版本不挂全局）。出错 → null（跳过）
export const hostFn = n => { try { const g = window[n] ?? globalThis[n]; if (typeof g === 'function') return g;
  const th = window.TavernHelper ?? window.parent?.TavernHelper; return typeof th?.[n] === 'function' ? th[n].bind(th) : null; } catch (e) { return null; } };
// G6（P0，handoff 准则 1；docs/reviews/architecture_and_stream_perf.md §1.4）：跨窗口 / 暴露点取函数的统一守卫。
// 类型与形参个数（fn.length，默认参数不计）都过才给；不过 → 按名字去重告警一次，返回 null，调用方走自己的降级。
const _guardWarned = new Set();
export function fnGuard(name, fn, minArity = 0) {
  if (typeof fn === 'function' && fn.length >= minArity) return fn;
  if (!_guardWarned.has(name)) {
    _guardWarned.add(name);
    try { console.warn(`[eden-map] 接口不可用或形参不足：${name}（${typeof fn}，length ${typeof fn === 'function' ? fn.length : '—'}，需要 ≥ ${minArity}）`); } catch (e) {}
  }
  return null;
}

/** 设定包命名空间（通用化，core/pack.mjs）。在入口里调用一次（读 window.__tcPack，与以前在脚本开头读同一时刻）。 */
export function packNs() {
  // 设定包（通用化，core/pack.mjs）：tools/build_preview_script.py --pack <id> 生成的脚本在导入前写 window.__tcPack = { id, manifest, events }（解析好的清单与事件分类，同步可用）。
  // 没有 = 内置 eden：存储键、聊天变量、世界书名、事件分类都和以前一样（老用户的数据原样可读）。NS / LS 与 core/pack.mjs nsKey / nsStore 同一规则（tests/pack.test.mjs 对照）。
  const PACK_IN = (() => { const p = window.__tcPack; return p && typeof p === 'object' && /^[a-z][a-z0-9_-]{1,31}$/.test(p.id || '') && p.id !== 'eden' ? p : null; })();
  const PACK_ID = PACK_IN ? PACK_IN.id : 'eden';
  const NS = k => (PACK_IN && typeof k === 'string' && k.startsWith('edenMap') ? 'tcp.' + PACK_ID + '.' + k.slice(7) : k);
  const wrapLS = get => ({ getItem: k => get().getItem(NS(k)), setItem: (k, v) => get().setItem(NS(k), v), removeItem: k => get().removeItem(NS(k)), key: i => { const k = get().key(i), p = 'tcp.' + PACK_ID + '.'; return typeof k !== 'string' ? k : k.startsWith(p) ? 'edenMap' + k.slice(p.length) : k.startsWith('edenMap') || k === 'edenEstateLabels' ? null : k; }, get length() { return get().length; } });
  const LS = PACK_IN ? wrapLS(() => localStorage) : null;   // eden：下面的 LS 调用走原生 localStorage（同一对象，行为不变）
  const lsGet = k => { try { return (LS || localStorage).getItem(k); } catch (e) { return null; } }, lsSet = (k, v) => { try { (LS || localStorage).setItem(k, v); } catch (e) {} };
  return { PACK_IN, PACK_ID, NS, wrapLS, LS, lsGet, lsSet };
}

/** 偏好存脚本变量（地基 A4）：构造时做一次「脚本变量 ↔ 本机」对齐；sync = 本机变了才写脚本变量（300 ms 合并）。 */
export function createPrefs(LS) {
  // 地基 A4：偏好存脚本变量（type:'script'，随酒馆设置同步，浏览器存储被清也不丢）。读：脚本变量优先，本机回退；写：两边都写（本版双写，下一版再去本机）。
  // 查看器与本机同源读 localStorage，所以启动时先把脚本变量里的值写回本机；只在本机有的补进脚本变量。键表登记在 core/storage.mjs SCRIPT_KEYS（同一份，tests/storage.test.mjs 对照）
  const PREF_KEYS = ['edenMapLine', 'edenMapHand', 'edenMapLang', 'edenMapTheme', 'edenMapFabPos', 'edenMapStateInj', 'edenMapStateDepth', 'edenMapStateBudget', 'edenMapMacros', 'edenMapWbOn', 'edenMapWbSync', 'edenMapWbWhere'];
  let prefObj = null;
  const lsRaw = () => { try { return (LS || localStorage); } catch (e) { return null; } };
  try { const gv = thFn('getVariables'); if (gv) { const v = gv({ type: 'script' })?.eden_prefs; prefObj = v && typeof v === 'object' && !Array.isArray(v) ? { ...v } : {}; let add = false;
    for (const k of PREF_KEYS) { const l = lsRaw()?.getItem(k) ?? null; if (prefObj[k] != null) { if (String(prefObj[k]) !== l) lsRaw()?.setItem(k, String(prefObj[k])); } else if (l != null) { prefObj[k] = l; add = true; } }
    if (add) thFn('insertOrAssignVariables')?.({ eden_prefs: prefObj }, { type: 'script' }); } } catch (e) { prefObj = null; }
  // 本机值变了（宿主自己写、或查看器同源写）→ 有差异才写脚本变量
  let prefT = 0;
  const prefSync = () => { clearTimeout(prefT); prefT = setTimeout(() => { if (!prefObj) return; let ch = false; const nx = { ...prefObj };
    for (const k of PREF_KEYS) { let l = null; try { l = lsRaw()?.getItem(k) ?? null; } catch (e) {} if (l == null) { if (k in nx) { delete nx[k]; ch = true; } } else if (String(nx[k]) !== l) { nx[k] = l; ch = true; } }
    if (!ch) return; prefObj = nx; try { const u = thFn('updateVariablesWith'); if (u) u(v => { v.eden_prefs = nx; return v; }, { type: 'script' }); else thFn('insertOrAssignVariables')?.({ eden_prefs: nx }, { type: 'script' }); } catch (e) {} }, 300); };
  const onStorage = e => { if (!e.key || PREF_KEYS.some(k => e.key === k || e.key.endsWith('.' + k.slice(7)))) prefSync(); };
  return { PREF_KEYS, obj: () => prefObj, sync: prefSync, onStorage, stop: () => clearTimeout(prefT) };
}

/**
 * B1 世界书附加条目：写入 / 自动同步（tavern/wbsync.mjs）+ 全自动（用户 2026-09-28）+ 每聊天版本提醒 + 设置「数据与映射」「高级」的 eden-map:th 消息。
 * deps = { SELF, LS, lsGet, lsSet, life, base(), alive(), UL(), thBtns(), chatId, cardKey, post, hostToast, stateInject, macroSet, prefSync }
 */
export function createWbAuto(deps) {
  const { SELF, LS, lsGet, lsSet, life, chatId, cardKey, post, hostToast, stateInject, macroSet, prefSync } = deps;
  let WBm = null;
  // B1 世界书附加条目：写入 / 自动同步（tavern/wbsync.mjs）。只动我们自己的一本书；写前给差异；用户点了（或同意过自动同步）才写
  let shipP = null, wbLast = null;
  const wbShip = () => (shipP ??= cdnFetch(deps.base() + 'data/worldbook_addon.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null).then(j => { if (!j) shipP = null; return j; }));
  const wbMod = async () => (WBm ??= await import(SELF + 'tavern/wbsync.mjs').catch(() => null));
  const wbSaved = () => { try { return JSON.parse(lsGet('edenMapWbSync') || 'null'); } catch (e) { return null; } };
  async function wbStatus(withPlan = true) {
    const W = await wbMod(); if (!W) return { api: false };
    const ship = withPlan ? await wbShip() : null, st = await W.inspect(thFn, ship);
    return { api: !!st.api, exists: !!st.exists, where: st.where || null, legacy: st.legacy || [], plan: st.plan || null, offline: withPlan && !ship, book: W.BOOK, error: st.error || null };
  }
  async function wbWrite(o = {}) {
    const W = await wbMod(), ship = await wbShip(); if (!W) return { ok: false, reason: 'noapi' };
    const r = await W.sync(thFn, ship, { consent: true, ...o });
    if (r.ok) { wbLast = { at: Date.now(), ver: r.plan?.to || null, add: r.plan?.add?.length || 0, update: r.plan?.update?.length || 0, keep: r.plan?.keep?.length || 0, auto: !!o.auto }; lsSet('edenMapWbSync', JSON.stringify(wbLast)); if (r.bound) lsSet('edenMapWbWhere', r.bound); prefSync(); }
    return r;
  }
  // 全自动（用户 2026-09-28）：总开关 edenMapWbOn（默认开，'0' = 关）。打开地图 / 换聊天时：书没有就建并挂到当前角色附加世界书；版本变了静默合并；每个版本只提示一次；每个聊天换版本时提醒一次。
  // 墓碑（用户撤销过 / 自己删过书）存酒馆助手全局变量 eden_wb_tomb（跨设备）+ 本机 LS；只有在「数据与映射」手动写入才清掉。多标签页：navigator.locks 互斥，锁里重新读书再写；没有锁时靠合并幂等。
  const wbOn = () => lsGet('edenMapWbOn') !== '0';
  const gvar = k => { try { return thFn('getVariables')?.({ type: 'global' })?.[k]; } catch (e) { return undefined; } };
  const gset = (k, v) => { try { thFn('insertOrAssignVariables')?.({ [k]: v }, { type: 'global' }); } catch (e) {} };
  const wbTomb = () => gvar('eden_wb_tomb') === true || lsGet('edenMapWbTomb') === '1';
  const setTomb = on => { gset('eden_wb_tomb', !!on); lsSet('edenMapWbTomb', on ? '1' : '0'); };
  const boundChars = () => { const g = gvar('eden_wb_chars'); if (Array.isArray(g)) return g; try { return JSON.parse(lsGet('edenMapWbChars') || '[]'); } catch (e) { return []; } };
  let wbBusy = null, wbAgain = false;
  function wbAuto() { if (wbBusy) { wbAgain = true; return wbBusy; } return (wbBusy = wbAutoRun().finally(() => { wbBusy = null; if (wbAgain && !life.dead) { wbAgain = false; wbAuto(); } })); }
  async function wbAutoRun() {
    try { (LS || localStorage).removeItem('edenMapWbAuto'); } catch (e) {}   // 旧的手动「自动同步」开关（默认关）作废：新总开关默认开
    if (!wbOn() || life.dead) return null;
    const W = await wbMod(), ship = await wbShip(); if (!W || !ship) return null;
    // 书不在、但本机记过同步（head #52 以前手动写过）→ 当作用户删的，立墓碑，不再自动建
    let tomb = wbTomb();
    const r = await W.withLock('eden-map-wb', async () => {
      if (!tomb && wbSaved()) { const st = await W.inspect(thFn, null); if (st.api && !st.exists) { setTomb(true); tomb = true; } }
      return W.autoRun(thFn, ship, { on: wbOn(), tombstone: tomb, charKey: cardKey(), boundChars: boundChars() });
    });
    if (!r || life.dead) return r;
    if (r.boundChar) { const l = [...new Set([...boundChars(), r.boundChar])].slice(-500); gset('eden_wb_chars', l); lsSet('edenMapWbChars', JSON.stringify(l)); }
    let toasted = false;
    if (r.ok && (r.wrote || r.action !== 'sync')) {
      wbLast = { at: Date.now(), ver: r.plan?.to || null, add: r.plan?.add?.length || 0, update: r.plan?.update?.length || 0, keep: r.plan?.keep?.length || 0, conflict: r.plan?.conflict?.length || 0, auto: true };
      lsSet('edenMapWbSync', JSON.stringify(wbLast)); if (r.bound) lsSet('edenMapWbWhere', r.bound); prefSync();
      const v = r.plan?.to;
      if (v && lsGet('edenMapWbNoticeVer') !== v && gvar('eden_wb_notice') !== v) {   // 只有真正写了的那个标签页、写成功后才提示；每个版本一次
        lsSet('edenMapWbNoticeVer', v); gset('eden_wb_notice', v); toasted = true;
        const p = r.plan, en = deps.UL() === 'en';
        hostToast(r.action === 'sync' ? (en ? 'Map worldbook add-on updated' : '地图世界书附加条目已更新') : (en ? 'Map worldbook add-on installed' : '已自动装好地图世界书附加条目'),
          [en ? `${p.from || '—'} → ${p.to}` : `${p.from || '—'} → ${p.to}（新增 ${p.add.length}、更新 ${p.update.length}、保留你改过的 ${p.keep.length + p.conflict.length}）`,
           ...(p.conflict.length ? [en ? `${p.conflict.length} entries you edited also changed upstream (kept yours)` : `你改过，上游也改了：${p.conflict.slice(0, 4).join('、')}${p.conflict.length > 4 ? ' …' : ''}（保留你的）`] : []),
           en ? 'Turn off in Settings › Data & mapping' : '可在 设置 › 数据与映射 关掉'], 9000);
      }
    }
    await chatVerRemind(ship.ver, toasted);
    return r;
  }
  // 每聊天版本提醒：聊天变量 eden_wb_ver 记这个聊天上次见到的附加条目版本；不同就提醒一次再记下（新聊天只记不提醒）
  async function chatVerRemind(cur, late) {
    if (!wbOn() || !cur || !thFn('getVariables') || !thFn('insertOrAssignVariables')) return;
    const id = chatId(); if (!id) return;
    let prev; try { prev = thFn('getVariables')({ type: 'chat' })?.eden_wb_ver; } catch (e) { return; }
    if (prev === cur) return;
    const W = await wbMod(); if (id !== chatId() || life.dead) return;
    if (W?.chatReminder(prev, cur)) setTimeout(() => { if (!life.dead && id === chatId()) hostToast(deps.UL() === 'en' ? 'Map worldbook changed since this chat' : '这个聊天之后地图世界书换了版本', [deps.UL() === 'en' ? `${prev} → ${cur}. Old places / names still work; retired entries were only lowered in priority.` : `${prev} → ${cur}。旧地名照样认；新版不再用的条目只降了优先级，没删。`], 8000); }, late ? 9500 : 0);
    try { await thFn('insertOrAssignVariables')({ eden_wb_ver: cur }, { type: 'chat' }); } catch (e) {}
  }
  function thPrefs() { return { inj: lsGet('edenMapStateInj') !== '0', depth: +(lsGet('edenMapStateDepth') || 2), budget: +(lsGet('edenMapStateBudget') || 150), macros: lsGet('edenMapMacros') === '1', wbOn: wbOn(), wbTomb: wbTomb(), wbWhere: lsGet('edenMapWbWhere') || null }; }
  async function sendTh(extra = {}) { if (!deps.alive()) return; post({ type: 'eden-map:th-state', prefs: thPrefs(), last: wbSaved(), api: { macros: !!thFn('registerMacroLike'), inject: !!thFn('injectPrompts'), buttons: !!deps.thBtns() }, ...extra }); }
  async function onTh(d) {
    const op = d.op;
    if (op === 'state') return sendTh();
    if (op === 'prefs' && d.prefs && typeof d.prefs === 'object') {
      const P = d.prefs, put = (k, v) => { if (v !== undefined) lsSet(k, String(v)); };
      if ('inj' in P) put('edenMapStateInj', P.inj ? '1' : '0');
      if ('depth' in P) put('edenMapStateDepth', Math.max(0, Math.min(20, Math.round(+P.depth) || 0)));
      if ('budget' in P) put('edenMapStateBudget', Math.max(40, Math.min(400, Math.round(+P.budget) || 150)));
      if ('macros' in P) { put('edenMapMacros', P.macros ? '1' : '0'); macroSet(!!P.macros); }
      if ('wbOn' in P) { put('edenMapWbOn', P.wbOn ? '1' : '0'); if (P.wbOn) setTimeout(() => { if (!life.dead) wbAuto().catch(() => {}); }, 300); }   // 总开关：关 = 不自动建、不同步、不提醒（手动按钮照常）
      prefSync(); if (typeof stateInject === 'function') stateInject(); return sendTh();
    }
    if (op === 'wb-inspect') return sendTh({ wb: await wbStatus(true) });
    if (op === 'wb-write') { setTomb(false); const r = await wbWrite({ where: ['global', 'char', 'chat'].includes(d.where) ? d.where : null, migrate: typeof d.migrate === 'string' ? d.migrate : null }); return sendTh({ wb: await wbStatus(true), result: { ok: r.ok, reason: r.reason || null, bound: r.bound || null } }); }
    if (op === 'wb-rebind' && ['global', 'char', 'chat'].includes(d.where)) { const W = await wbMod(); const ok = !!W && await W.bind(thFn, W.BOOK, d.where); if (ok) lsSet('edenMapWbWhere', d.where); return sendTh({ wb: await wbStatus(true), result: { ok, reason: ok ? null : 'error' } }); }
    if (op === 'wb-remove') { const W = await wbMod(); const ok = !!W && await W.removeBook(thFn); if (ok) { setTomb(true); wbLast = null; try { (LS || localStorage).removeItem('edenMapWbSync'); } catch (e) {} prefSync(); } return sendTh({ wb: await wbStatus(true), result: { ok, reason: ok ? 'deleted' : 'error' } }); }
    if (op === 'wb-del-legacy' && typeof d.name === 'string') { const W = await wbMod(); const ok = !!W && await W.deleteLegacy(thFn, d.name); return sendTh({ wb: await wbStatus(true), result: { ok, reason: ok ? 'deleted' : 'error' } }); }
  }
  return { wbAuto, sendTh, onTh };
}
