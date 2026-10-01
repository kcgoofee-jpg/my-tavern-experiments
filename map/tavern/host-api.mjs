// 本机扩展接口 window.EdenMap（E6）与酒馆助手侧的暴露：api 对象、订阅 / 广播、头像压缩、脚本按钮 / 类宏 / 脚本说明 / 世界书全自动（S5-1 自 eden-map.js 原样搬出）。
// 工厂风格同 host-*.mjs：createX(host) 只在入口调用一次；host 是入口给的依赖袋（活的变量 = 取 / 存器，函数 = 晚绑定转发），DEPS 是本模块要用的全部键。
import { createWbAuto, fnGuard, thFn } from './host-tavernhelper.mjs';
import { EDEN_API, guardApi } from './extension-api-contract.mjs';
import { createFacts } from './feature-health.mjs';
export const DEPS = [
  'mvuBridge', 'HS', 'LS', 'MAN', 'PACK_ID', 'SCRIPT', 'scriptBase', 'VER', 'cardKey', 'changedInv', 'channel', 'chatId', 'customChanged', 'fab', 'frame',
  'hostToast', 'kindOf', 'life', 'listen', 'loadCustom', 'loadViewer', 'lsGet', 'lsSet', 'macroSet', 'openSettings', 'panel', 'pdoc', 'plainVer',
  'post', 'prefSync', 'push', 'reg', 'runCheck', 'showSplash', 'stateInject', 'injectPreview', 'store', 'storeWarn', 'varsOk', 'BASE', 'storageBudget', 'stashStoreModule', 'LKF', 'mvuReaders', 'dataSourceRegistryModule',
  'uiLang', 'alive', 'chars', 'checkAt', 'checkItems', 'checkP', 'clock', 'custom', 'customChat', 'floorNow', 'flyQ', 'ghost', 'here', 'stash', 'outfitNow',
  'rep', 'roster', 'wbState', 'navFacts', 'navSchedule', 'macroVal', 'xtalClear',
];
export function createHostApi(host) {
  for (const k of DEPS) if (!(k in host)) throw new Error('host-api: missing dep ' + k);
  const { mvuBridge, HS, LS, MAN, PACK_ID, SCRIPT, scriptBase, VER, cardKey, changedInv, channel, chatId, customChanged, fab, frame, hostToast, kindOf, life, listen, loadCustom, loadViewer, lsGet, lsSet, macroSet, openSettings, panel, pdoc, plainVer, post, prefSync, push, reg, runCheck, showSplash, stateInject, store, storeWarn, varsOk } = host;
  // ---------------- 本机扩展接口 window.EdenMap（E6，docs/content-compat.md） ----------------
  // 在宿主页挂 window.EdenMap，转发给地图 iframe（srcdoc，与宿主同源，直接调用）；地图没开时直接读写本机 localStorage（同一份存储）。
  // 自定义叫法按聊天分开存（edenMap:chat:<聊天 id>:custom），拿不到聊天 id 时存全局 edenMap:custom。不联网、不上传、不进地址。
  // 宿主页上的方法都返回 Promise。on('here' | 'events' | 'map', fn)：here / events 由本脚本发（面板关着也发），map 由地图发。
  const subs = { here: new Set(), events: new Set(), map: new Set(), characters: new Set(), outfit: new Set(), clock: new Set(), custom: new Set() };
  let roomsKnown = null, TRNm = null, transitMod = null;
  function emit(ev, data) { for (const f of subs[ev]) { try { f(data); } catch (e) { console.warn('[EdenMap]', e); } } }
  const hx = () => (TRNm ??= import(scriptBase + 'core/transit.mjs'));   // 途中地点的切分与胶囊文字（核心的纯函数，不需要节点树）
  hx().then(m => { transitMod = m; setTimeout(push, 0); }).catch(() => {});
  let charactersParseModule = null; const chx = () => (charactersParseModule ??= import(scriptBase + 'tavern/characters-parse.mjs'));
  const inner = () => { if (!host.alive) return null; try { const w = frame.contentWindow; if (!w?.EdenMap) return null; fnGuard('EdenMap.__chat', w.__edenMapChat, 1)?.(chatId()); return w.EdenMap; } catch (e) { return null; } };   // G6：跨窗口拿到的是查看器的 EdenMap——每个调用点先过守卫（handoff 准则 1）
  function knowRooms() { try { const g = fnGuard('EdenMap.getRooms', inner()?.getRooms, 0); const r = g ? g().rooms : null; if (r?.length) roomsKnown = r; } catch (e) {} }

  // 头像压缩（与 map/chars.js 里那份一致）：面板没开、只走 EdenMap.setAvatar 时也压，否则同一张图在两条路径上行为不一样（接手 review P2）
  async function shrinkAvatar(src) {
    if (typeof src !== 'string' || !src.startsWith('data:image/') || src.length < 40000) return src;
    try {
      const img = new Image(); img.src = src; await img.decode();
      const k = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = pdoc.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const w = c.toDataURL('image/webp', .82); return w.startsWith('data:image/webp') ? w : c.toDataURL('image/jpeg', .82);
    } catch (e) { return src; }
  }
  // ---------------- S8-3 本机图层与本机道具（K-R87 / K-R88）：只收数据声明与用户自己的文件，逻辑全在查看器（app/declared-layers.mjs、app/local-props-view.mjs） ----------------
  // 面板开着就转发；没开时图层声明记在 localLayers（每次 eden-map:ready 重放一遍：查看器重载也不丢），addProp / placeProp 排队（≤16，ready 后重放，没开过就一直等）；其余读写在面板关着时返回空 / false。
  const localLayers = new Map(), propQ = [];
  const via = (name, n) => { const v = inner(); return v ? fnGuard('EdenMap.' + name, v[name], n) : null; };
  const queued = (name, args, n) => { const f = via(name, n); if (f) return f(...args); if (propQ.length >= 16) return Promise.resolve({ ok: false, problems: ['queue-full'] }); return new Promise(res => propQ.push({ name, args, n, res })); };
  function replayLayers() {
    for (const d of localLayers.values()) { try { via('addLayer', 1)?.(d); } catch (e) {} }
    for (const j of propQ.splice(0)) { const f = via(j.name, j.n); if (f) Promise.resolve(f(...j.args)).then(j.res, () => j.res({ ok: false, problems: ['viewer-error'] })); else j.res({ ok: false, problems: ['viewer-closed'] }); }
  }
  const api = Object.freeze({
    async addLayer(def) { const id = def?.id; if (typeof id === 'string') localLayers.set(id, def); const f = via('addLayer', 1); return f ? f(def) : { ok: true, id: typeof id === 'string' ? id : null, problems: [], queued: true }; },
    async removeLayer(id) { const had = localLayers.delete(String(id)), f = via('removeLayer', 1); return f ? f(id) : had; },
    async setLayerData(id, features) { const d = localLayers.get(String(id)); if (d) localLayers.set(String(id), { ...d, data: { features } }); const f = via('setLayerData', 2); return f ? f(id, features) : { ok: !!d, problems: d ? [] : ['no-layer'] }; },
    async layers() { const f = via('layers', 0); return f ? f() : []; },
    addProp: (file, o) => queued('addProp', [file, o], 1), placeProp: (id, t) => queued('placeProp', [id, t], 2),
    async removeProp(id) { const f = via('removeProp', 1); return f ? f(id) : false; }, async props() { const f = via('props', 0); return f ? f() : []; }, async unplaceProp(id, map) { const f = via('unplaceProp', 2); return f ? f(id, map) : false; },
    // v0.9.3 自定义名称与用途（聊天变量 eden_map.自定义）：key = 标准名（房间 / 区域 / 地标 / 人物）；patch = { name?, note?, kind? }，传 '' 清掉
    async setCustom(key, patch = {}) { if (!host.mvuReaders || !host.custom) await loadCustom(); if (!host.mvuReaders) return false; await reg(); const k = String(key || '').trim(), r = host.mvuReaders.setCustom(host.custom, k, { ...patch, kind: patch.kind || host.custom.items[k]?.类 || kindOf(k) }); if (!r) return false; host.custom = r; customChanged(true); return true; },
    async removeCustom(key) { if (!host.mvuReaders || !host.custom) await loadCustom(); if (!host.mvuReaders) return false; const r = host.mvuReaders.removeCustom(host.custom, host.mvuReaders.findKey(host.custom, key) || key); if (!r) return false; host.custom = r; customChanged(true); return true; },
    async getCustom() { if (!host.mvuReaders || !host.custom) await loadCustom(); return { ...host.mvuReaders.normCustom(host.custom), storage: varsOk() ? 'chat' : 'local', worldbook: host.wbState ? { name: host.mvuReaders.wbName(host.customChat), state: host.wbState } : null }; },
    async setWorldbookSync(on) { if (!host.mvuReaders || !host.custom) await loadCustom(); const was = !!host.custom.同步世界书; host.custom = { ...host.custom, 同步世界书: !!on, 同步手动: true }; if (!on && was && !host.wbState) host.wbState = 'off'; customChanged(true); return true; },
    // 旧名字保留（≤ 0.9.2）：房间叫法 = 该房间的自定义显示名
    async setRoomAlias(name, room) { const rooms = roomsKnown || Object.values((await reg())?.maps || {}).find(m => m.kind === 'estate')?.rooms || null;
      if (rooms && (!rooms.includes(String(room).trim()) || rooms.includes(String(name).trim()))) return false; return api.setCustom(room, { name, kind: 'room' }); },
    async removeRoomAlias(name) { if (!host.mvuReaders || !host.custom) await loadCustom(); const k = host.mvuReaders?.findKey(host.custom, name); return !!k && k !== String(name).trim() && api.setCustom(k, { name: '' }); },
    async getRooms() { if (!host.mvuReaders || !host.custom) await loadCustom(); const rooms = roomsKnown || Object.values((await reg())?.maps || {}).find(m => m.kind === 'estate')?.rooms || [];
      return { rooms: [...rooms], alias: host.mvuReaders ? host.mvuReaders.aliasMap(host.custom, ['room']) : {}, chat: chatId() || null }; },
    // 空间化背包（Part 5-1）：setInv('机密账本', { place: '书房', map: 'estate', hidden: true, note: '塞在书架第三层' })；removeInv('机密账本')；getInv() 只读
    async setInv(name, patch = {}) { if (!host.stashStoreModule || !host.stash) return false; const r = host.stashStoreModule.put(host.stash, { name, ...patch, src: 'api', msgIndex: host.floorNow }); if (!r.changed) return false; host.stash = r.stash; changedInv(); return true; },
    async removeInv(key) { if (!host.stashStoreModule || !host.stash) return false; const r = host.stashStoreModule.remove(host.stash, key, host.floorNow); if (!r.changed) return false; host.stash = r.stash; changedInv(); return true; },
    getInv: async () => (host.stashStoreModule ? host.stashStoreModule.wireRows(host.stash) : []),
    getOutfit: async () => ({ items: host.outfitNow ? { ...host.outfitNow } : null, text: host.mvuReaders ? host.mvuReaders.outfitText(host.outfitNow) : '' }),   // 主角着装（只读 MVU 的着装变量）
    getClock: async () => (host.clock ? { ...host.clock } : null),   // 世界时间（只读 MVU 的日期 / 时刻 / 时段变量）
    // 人物头像（v0.9.2）：只存本机 localStorage（按聊天，拿不到聊天 id 时全局），不上传、不进地址；src = data:image/… 或 http(s) 图片地址
    // 面板看得见时交给地图（它自己提示）；面板关着 / 后台预加载 / 休眠时在这里写，满了用宿主提示条告诉用户（地图里的提示条此时看不见，A-13），再让地图重读
    async setAvatar(name, src) { const v = inner(), setS = v ? fnGuard('EdenMap.setAvatar', v.setAvatar, 2) : null; if (setS && !panel.hidden && !host.ghost) return setS(name, src); const C = await chx(), st = store(); if (!st) return false;
      const img = await shrinkAvatar(src), r = C.setAvatarEx ? C.setAvatarEx(st, chatId(), name, img) : { ok: C.setAvatar(st, chatId(), name, img) };
      if (!r.ok && (r.reason === 'cap' || r.reason === 'quota')) storeWarn(r.reason);
      if (r.ok && v) try { await fnGuard('EdenMap.setAvatar', v.setAvatar, 2)?.(name, img); } catch (e) {}   // 地图重写同一张（已有这个名字，不占新额度）并重画
      return r.ok; },
    storage: async () => { const st = store(); return host.storageBudget && st ? host.storageBudget.measure(st) : null; },   // A-13：本机存储占用（字节，UTF-16）
    async removeAvatar(name) { const v = inner(), rm = v ? fnGuard('EdenMap.removeAvatar', v.removeAvatar, 1) : null; if (rm) return rm(name); const C = await chx(), st = store(); return !!st && C.removeAvatar(st, chatId(), name); },
    async getCharacters() { return { items: host.chars.map(c => ({ ...c })), floor: host.floorNow, rosters: host.roster ? JSON.parse(JSON.stringify(host.roster)) : null, reputation: host.rep }; },   // v0.9.5：rosters / reputation 只读
    // 三维查看器飞到热点（{ map: 'dairy', hotspot: 'tank' }）：面板没开就先打开；地图就绪后转发
    async flyTo(t) { host.flyQ = t || null; if (panel.hidden && !host.ghost) { panel.hidden = false; await loadViewer(); } else if (host.ghost) fab.click();
      if (!host.flyQ) return true; const v = inner(), fly = v ? fnGuard('EdenMap.flyTo', v.flyTo, 1) : null; if (fly) { host.flyQ = null; return fly(t); } return true; },
    // v0.9.6 只读：当前在用的数据来源（不含任何数据内容本身）。location = 当前地点来自哪里；characters = 人物栏各来源人数；
    // mvu = { present, mode: 'mvu' | 'mvu-partial' | 'tags' }；db = 表格数据库插件 { tables, location, chars } 或 null（没装）；tags = 聊天标签（⌖ / 人物标签）总在读
    async sources() {
      const hasMvu = mvuBridge.mvuPresent(), mode = mvuBridge.varmode();
      const db = mvuBridge.dbFacts();
      const ctx = { hasMvu, mode, db, here: host.here, hereFromDb: mvuBridge.hereFromDb, chars: host.chars, varMap: { ...mvuBridge.varMap }, vars: varsOk() };
      if (host.dataSourceRegistryModule) return host.dataSourceRegistryModule.summarize(ctx);   // 数据源注册表（tavern/data-source-registry.mjs）
      const byc = {}; for (const c of host.chars) byc[c.src || 'infer'] = (byc[c.src || 'infer'] || 0) + 1;
      return { location: host.here ? (mvuBridge.hereFromDb ? 'db' : 'mvu') : 'none', mvu: { present: hasMvu, mode }, db, tags: true, characters: byc, varmap: { ...mvuBridge.varMap } };
    },
    selfcheck: (o = {}) => { if (o?.show) showSplash(); return runCheck().then(() => ({ items: host.checkItems.map(i => ({ ...i })), at: host.checkAt })); },   // 启动自检的结果（只在本机）；{ show: true } 再显示开场自检卡（v0.9.5）
    on(ev, fn) { if (subs[ev] && typeof fn === 'function') subs[ev].add(fn); return api; },
    off(ev, fn) { if (subs[ev]) fn ? subs[ev].delete(fn) : subs[ev].clear(); return api; },
  });
  const exposed = guardApi(api, EDEN_API);   // G6（P0）：暴露面逐项过守卫（类型 + 形参个数，契约在 tavern/extension-api-contract.mjs）；内部调用仍走原 api
  window.parent.EdenMap = exposed;

  // ---------------- 酒馆助手采纳（docs/tavernhelper-audit.md §2，B1–B9）：全部功能探测，缺接口静默跳过 ----------------
  let tavernhelperApiModule = null, thBtns = null, cardId = null;
  const thReady = import(scriptBase + 'tavern/tavernhelper-api.mjs').then(m => { tavernhelperApiModule = m; thInit(); return m; }).catch(() => null);
  // 任务三：泄露防御网装配（纯净化函数在 sanitize.mjs，tavernhelper-api.mjs 只管取元素与洗净渲染结果）
  thReady.then(m => { if (m) host.LKF = m.createLeakFence({ retrieve: id => { const f = thFn('retrieveDisplayedMessage'); return f ? f(id) : null; }, log: s => console.info('[eden-map]', s) }); }).catch(() => {});
  function thInit() {
    if (life.dead) return;
    // B2 脚本按钮：浮动按钮之外的第二个入口（TH 脚本栏里的「地图」「地图自检」）；句柄走 listen，cleanup 自动撤
    try { thBtns = tavernhelperApiModule.scriptButtons(thFn); if (thBtns) {
      if (thBtns['地图']) listen(thBtns['地图'], () => { if (panel.hidden || host.ghost) fab.click(); });
      if (thBtns['地图自检']) listen(thBtns['地图自检'], () => { host.checkP = null; runCheck(); openSettings('update'); }); } } catch (e) {}
    // B6 正式入口：其它脚本 waitGlobalInitialized('EdenMap')；window.parent.EdenMap 别名保留一个版本
    try { thFn('initializeGlobal')?.('EdenMap', guardApi(api, EDEN_API)); } catch (e) {}
    macroSet(lsGet('edenMapMacros') === '1');
  }

  // B8 广播：地图里的当前地点变了 → eventEmit('eden-map:moved', { from, to, source, at })；只发地点，不写 MVU / 数据库
  let movedFrom = null;
  function emitMoved(to) {
    if (movedFrom === null) { movedFrom = to; return; } if (to === movedFrom || life.dead) return;
    const from = movedFrom; movedFrom = to;
    try { thFn('eventEmit')?.('eden-map:moved', tavernhelperApiModule ? tavernhelperApiModule.movedPayload(from, to, { source: mvuBridge.hereFromDb ? 'db' : mvuBridge.hereSrc || 'mvu' }) : { from, to, at: Date.now() }); } catch (e) {}
  }
  // B5 脚本库说明：版本、通道、最后一次自检结论
  function scriptInfo() {
    if (!tavernhelperApiModule || !thFn('replaceScriptInfo')) return;
    MAN.then(() => { try { thFn('replaceScriptInfo')(tavernhelperApiModule.scriptInfo({ version: plainVer(VER) || SCRIPT.version, channel: channel(), build: SCRIPT.build, checkAt: host.checkAt, warns: host.checkItems.length ? host.checkItems.filter(i => i.status === 'warn').length : null, en: host.uiLang === 'en', name: HS('app.short', host.uiLang === 'en') })); } catch (e) {} });
  }
  // B1 世界书附加条目 + 全自动 + eden-map:th 设置消息：host-tavernhelper.mjs createWbAuto（整块原样搬过去，行为不变）
  const facts = createFacts();   // S7-1: what each AI-link feature did last (feature-health.mjs); the flows write into it through the host bag's `facts` getter
  const { wbAuto, sendTh, onTh } = createWbAuto({ scriptBase, LS, lsGet, lsSet, life, manifest: MAN, packId: PACK_ID, base: () => host.BASE, alive: () => host.alive, uiLang: () => host.uiLang, thBtns: () => thBtns,
    chatId, cardKey, post, hostToast, stateInject, injectPreview: () => host.injectPreview(), macroSet, prefSync, facts, navFacts: () => host.navFacts(), navSchedule: () => host.navSchedule(), xtalClear: () => host.xtalClear(), macroVal: k => host.macroVal(k) });
  return {
    api, facts, get cardId() { return cardId; }, set cardId(v) { cardId = v; }, emit, emitMoved, exposed, inner, knowRooms, onTh, replayLayers, scriptInfo, sendTh, subs,
    get tavernhelperApiModule() { return tavernhelperApiModule; }, get transitMod() { return transitMod; }, wbAuto,
  };
}
