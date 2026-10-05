// F0 记录式对拍的场景表（tests/f0_call_parity.test.mjs 与录制器共用）：每个场景只经模块的公开 API 驱动引擎，
// 自己绝不摸宿主全局——这样拆分前后跑的是同一段代码，记录的宿主调用序列才有可比性。
// 场景自带假宿主状态（tests/helpers/f0_host_stub.mjs），跑完给出调用序列（顺序敏感，除非 loose: true）。
import { MVUBridge } from '../../map/tavern/mvu-bridge.mjs';
import { createLife } from '../../map/tavern/host-lifecycle.mjs';
import { createRootStore, DEPS as ROOT_DEPS } from '../../map/tavern/root-store.mjs';
import { createChatData } from '../../map/tavern/chat-data.mjs';
import { DEPS as LLM_DEPS } from '../../map/tavern/llm-flow.mjs';
import * as V from '../../map/tavern/mvu-readers.mjs';
import { useEden } from './eden-profile.mjs';
import { installHost, memStore, seqOf } from './f0_host_stub.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rd = f => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const FB = rd('../../map/data/fallback_roster.json').members;
const SHIP = rd('../../map/data/worldbook_addon.json');
const tick = ms => new Promise(r => setTimeout(r, ms));
const st = loc => ({ stat_data: { 世界: { 当前地点: loc } } });
const msg = (loc, o = {}) => ({ is_user: false, swipe_id: 0, swipe_id_: 0, variables: loc == null ? [] : [st(loc)], message: loc ? `到${loc}` : '', ...o });
const lsApi = m => ({ get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } });

const SCENARIOS = [
  { id: 'bridge-reads', state: () => ({
      chat: [msg('书房'), msg('书房', { is_user: true }), msg('霓虹街')], latest: { 世界: { 当前地点: '霓虹街', 当前日期: '新历2088年01月01日', 当前时刻: '08:00', 当日时段: '日间' }, 主角: { 着装: { 衣服: '制服' } }, 女仆名册: { 绫濑遥: { 身份: '女仆长' } } },
      vars: { chat: { eden_map: { 自定义: { items: { 书房: { 类: 'room' } } }, 标签楼: 2 } }, script: { eden_prefs: {} }, global: {} },
      charData: { data: { extensions: { script: 'defaultPortraits = { "绫濑遥": "https://cdn.jsdelivr.net/gh/x/y/a.png" }', zod: 'const stageSchema = z.enum(["一阶","二阶","三阶"])' } } }, regexes: [], lastId: 2 }),
    run: async ({ model }) => {
      const ls = memStore(); const life = createLife();
      const B = new MVUBridge({ life, storage: () => lsApi(ls.map), wins: () => [globalThis], fallbackMembers: FB, floorNow: () => 2, lastRaw: () => '⌖地点 中层·霓虹街', lang: () => 'zh' });
      await B.mvuReady;
      B.mvuStat(); B.here(); B.clock(); B.outfit(); B.rosters(); B.reputation(); B.readVars(); B.refreshVarMap(); B.varmapView(); B.varmode();
      B.presentNames(); B.groupsView(B.rosters()); B.rosterRows({ floorNow: 2 }); B.read();
      await B.cardInfo(); B.portraitsFor(); B.stageOrderFor(B.rosters());
      await B.listChatIds(); B.userName('{{user}}');
      const p = B.perFloorStat(0); B.floorPlace(1, '⌖地点 客厅'); B.invalidate(); B.markVarUpdate(); B.mvuStat();
      return { here: B.here(), snap: [B.snapState, B.snapFloor], p: !!p, view: B.varmapView().map };
    } },

  { id: 'bridge-no-host', loose: true, state: () => ({ chat: [], without: ['Mvu', 'getVariables', 'updateVariablesWith', 'replaceVariables', 'insertOrAssignVariables', 'getCharData', 'getTavernRegexes', 'getChatMessages', 'getLastMessageId', 'waitGlobalInitialized', 'injectPrompts', 'uninjectPrompts', 'getWorldbook', 'getWorldbookNames', 'createWorldbook', 'createOrReplaceWorldbook', 'updateWorldbookWith', 'deleteWorldbook', 'getChatWorldbookName', 'getCharWorldbookNames', 'getGlobalWorldbookNames', 'rebindChatWorldbook', 'rebindCharWorldbooks', 'rebindGlobalWorldbooks', 'registerMacroLike', 'getScriptId', 'retrieveDisplayedMessage', 'getPreset'], vars: {} }),
    run: async () => {
      const ls = memStore();
      const B = new MVUBridge({ life: createLife(), storage: () => lsApi(ls.map), wins: () => [globalThis], fallbackMembers: FB, floorNow: () => -1, lastRaw: () => null });
      await B.mvuReady;
      B.mvuStat(); B.here(); B.clock(); B.outfit(); B.rosters(); B.readVars(); B.refreshVarMap(); B.varmapView(); B.varmode(); B.read();
      await B.cardInfo(); await B.whenMvu(); await B.listChatIds();
      return { mode: B.varmode(), here: B.here(), present: B.mvuPresent(), usable: B.mvuUsable() };
    } },

  { id: 'modes-state-inject', state: () => ({
      chat: [msg('书房')], latest: { 世界: { 当前地点: '书房', 当前日期: '新历2088年01月01日', 当前时刻: '20:00', 当日时段: '夜间' } }, vars: { chat: { eden_map: {} } }, lastId: 0 }),
    run: async ({ model }) => {
      const { createModesFlow } = await import('../../map/tavern/modes-flow.mjs');
      const { createFacts } = await import('../../map/tavern/feature-health.mjs');
      const ls = memStore();
      const B = new MVUBridge({ life: createLife(), storage: () => lsApi(ls.map), wins: () => [globalThis], fallbackMembers: FB, floorNow: () => 0, lastRaw: () => null });
      await B.mvuReady; B.refreshVarMap();
      const facts = createFacts();
      const MO = createModesFlow({ facts, floorNow: 0, mvuBridge: B, contextPipeline: { trips: [{ from: '甲', to: '乙' }] }, scriptBase: '', chatId: () => 'c1', life: createLife(),
        lsGet: k => (k === 'edenMapStateOmit' ? null : null), pushSoon() {}, recomputeSoon() {}, saveRoot() {}, userName: s => s, BASE: '', clock: {}, custom: null, customChat: null, here: '书房', regNow: null, statSig: '' });
      MO.stateInject(); MO.stateInject();
      return { injected: Object.keys(model.injected), sum: model.calls.filter(c => c[0] === 'injectPrompts').length };
    } },

  { id: 'root-store-edit', state: () => ({
      chat: [msg('书房')], latest: st('书房'), vars: { chat: { eden_map: { 自定义: { items: {} } } } }, books: {}, bindings: {}, lastId: 0 }),
    run: async ({ model }) => {
      V.setWbName('Test');
      const host = Object.fromEntries(ROOT_DEPS.map(k => [k, () => {}]));
      Object.assign(host, { life: { dead: false }, LS: null, mvuReaders: V, chatId: () => null, floorNow: 7, post() {}, emit() {}, recomputeSoon() {}, hostToast() {},
        panel: { hidden: true }, alive: false, uiLang: 'zh', contextPipeline: { tag: { floor: -1, log: [], seen: {} }, trips: [] }, explored: {}, chars: [],
        readVars: () => JSON.parse(JSON.stringify(model.vars.chat.eden_map || {})), MAN: Promise.resolve(null), scriptBase: '', wrapLS: f => f(), PACK_IN: null, custVer: 0, stash: null, cp: null, kfView: null, autoCache: null, ledgerRecord: null });
      const RS = createRootStore(host);
      RS.custom = V.normCustom({});
      const a = RS.placeEdit('room_b2_03', { name: '审问室', desc: '只留一盏灯。', use: '审讯', facts: ['门是单向的'] });
      await tick(40);
      const b = RS.placeEdit('room_b2_03', { desc: '' }); await tick(40);
      const c = RS.placeUndo('room_b2_03'); await tick(40);
      return { ok: [a, b, c], books: Object.keys(model.books), saved: JSON.stringify(model.vars.chat.eden_map?.自定义?.items || {}) };
    } },

  { id: 'chat-data-reset', state: () => ({
      chat: [msg('书房')], vars: { chat: { eden_map: { 自定义: { items: { k: { 类: 'room' } } } }, stat_data: st('书房') } },
      books: { 'Test·自定义·chat-1': [{ name: V.WB_ENTRY, content: 'x' }] }, bindings: { chat: 'Test·自定义·chat-1' }, lastId: 0 }),
    run: async ({ model }) => {
      V.setWbName('Test');
      const host = Object.fromEntries(LLM_DEPS.map(k => [k, null]));
      Object.assign(host, { chatId: () => 'chat-1', life: { dead: false }, mvuReaders: { VAR_ROOT: 'eden_map', WB_ENTRY: V.WB_ENTRY, wbName: V.wbName }, post() {}, custom: 'live',
        mvuBridge: { listChatIds: async () => new Set(['chat-1']) }, onChatSwitch() {} });
      const m = memStore(); m.setItem('edenMap:chat:chat-1:custom2', '{}'); m.setItem('edenMapSeen:chat-1', '1');
      const cd = createChatData(host, { store: () => lsApi(m.map), ls: () => lsApi(m.map), varsOk: () => true, clearWb: () => {} });
      const r = await cd.reset(); await cd.orphanSweep();
      return { ok: r.ok, book: r.book };
    } },

  { id: 'wb-auto-ops', loose: true, state: () => ({
      chat: [msg('书房')], vars: { chat: {}, global: {} }, books: {}, bindings: {}, lastId: 0, fetch: { 'worldbook_addon.json': SHIP } }),
    run: async ({ model }) => {
      const { createWbAuto } = await import('../../map/tavern/host-tavernhelper.mjs');
      const { createFacts } = await import('../../map/tavern/feature-health.mjs');
      const m = memStore(); const posts = [];
      const A = createWbAuto({ scriptBase: new URL('../../map/', import.meta.url).href, LS: null,
        lsGet: k => m.getItem(k), lsSet: (k, v) => m.setItem(k, v), life: createLife(), base: () => '', alive: () => true, uiLang: () => 'zh',
        thBtns: () => null, chatId: () => 'c1', cardKey: () => 'k', post: x => posts.push(x.type), hostToast() {}, stateInject() {}, macroSet() {}, prefSync() {},
        facts: createFacts(), navFacts: () => ({}), macroVal: k => k, navSchedule() {}, xtalClear() {}, panelHidden: () => true, injectPreview: () => null,
        manifest: Promise.resolve({ id: 'eden', data: { worldbook_addon: 'data/worldbook_addon.json' } }), packId: 'eden', customBookName: () => 'Chat·自定义',
        mapInfo: () => ({ version: '0.9.8', build: 360, date: '2026-10-04' }) });
      model.books['Chat·自定义'] = [{ name: V.WB_ENTRY, content: '本聊天自定义正文', extra: { eden_place: 'room_b2_03' } }];
      await A.wbAuto(); await tick(30);
      await A.onTh({ op: 'wb-inspect' }); await A.onTh({ op: 'wb-write', where: 'global' });
      await A.onTh({ op: 'wb-peek', name: '审问室', id: 'room_b2_03' });
      await A.onTh({ op: 'wb-rebind', where: 'char' }); await A.onTh({ op: 'wb-remove' });
      await A.wbAuto();
      return { posts: posts.length, books: Object.keys(model.books) };
    } },

  { id: 'lifecycle-events', state: () => ({ chat: [msg('书房')], vars: { chat: {} } }),
    run: async ({ model }) => {
      const L = createLife(); const h = () => {};
      L.listen('chatChanged', h, true); L.listen('generationEnded', h); L.listen('variableUpdate', h, true);
      const n = model.listeners.length; L.unlisten();
      return { registered: n, left: model.listeners.length, dead: L.dead };
    } },

  { id: 'llm-jit-round', loose: true, state: () => ({
      chat: [msg('书房')], vars: { chat: {} }, books: {}, lastId: 0 }),
    run: async ({ model }) => {
      const { createLlmFlow } = await import('../../map/tavern/llm-flow.mjs');
      const W = await import('../../map/tavern/worldbook-sync.mjs');
      model.books[W.BOOK] = [{ name: 'e1', enabled: true, strategy: { type: 'selective', keys: ['甲'] }, extra: { eden_id: 'e1' } }];
      const host = Object.fromEntries(LLM_DEPS.map(k => [k, null]));
      const m = memStore();
      Object.assign(host, { scriptBase: new URL('../../map/', import.meta.url).href, life: { dead: false }, panel: { hidden: true }, uiLang: 'zh', WBSm: W,
        lsGet: k => (k === 'edenMapWbJit' ? '1' : null), lsSet: (k, v) => m.setItem(k, v), here: 'x', floorNow: 3, regNow: {}, facts: { jit: {} },
        SpatialM: { locate: () => ({ mapId: 'm' }), activationSet: () => ({ names: new Set(['乙']), pinned: true, where: '乙' }) }, pointsFor: async () => [],
        hostToast: () => {}, sendEvents: () => {}, post: () => {}, alive: false });
      const L = createLlmFlow(host); await tick(150);
      await L.jitRound(); await L.jitRound(); L.jitReset(); await L.jitRound();
      return { writes: model.calls.filter(c => c[0] === 'updateWorldbookWith').length };
    } },
];

export { SCENARIOS };

/** 跑一轮全部场景 → { 场景 id: 调用序列 }（loose 场景排序后再比，容忍并发的先后） */
export async function recordAll() {
  const out = {};
  for (const sc of SCENARIOS) {
    useEden();
    const h = installHost(sc.state());
    let err = null;
    try { await sc.run(h); } catch (e) { err = e; }
    const seq = seqOf(h.model.calls); h.restore();
    if (err) seq.unshift('THREW ' + err.message + (err.stack || '').split('\n')[1]);
    out[sc.id] = sc.loose ? seq.slice().sort() : seq;
  }
  return out;
}
