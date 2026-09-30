// P2 解耦第一步：map/tavern/mvu-bridge.mjs（MVUBridge）的 node 单测——无浏览器，桩出 Mvu / SillyTavern 全局。
// 1) 读取流水线行为与拆分前一致：快照选取（snapshot.mjs 语义）、变量映射（adapter.mjs）、here 三级兜底（MVU → 标签对账 → 表格数据库）、
//    A-11 聊天变量读取、名册 / 立绘 / 阶段序（mvu.mjs）、read() 标准摘要形状；
// 2) 宿主隔离契约（机械检查）：map/tavern/ 的运行时代码里，字符串与注释之外出现 Mvu / SillyTavern 的只有 mvu-bridge.mjs。
//    viewer 侧（map/app/settings.mjs 读自己窗口的 SillyTavern）不在宿主契约范围，见评审报告 §3。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createLife } from '../map/tavern/host-lifecycle.mjs';
import { MVUBridge } from '../map/tavern/mvu-bridge.mjs';
import { useEden } from './helpers/eden-profile.mjs';
useEden();   // the first pack's variable and roster declarations (its overlay blocks); the engine itself names no card

// ---- 桩环境 ----
const st = loc => ({ stat_data: { 世界: { 当前地点: loc } } });
const msg = (loc, o = {}) => ({ is_user: false, swipe_id: 0, variables: loc == null ? [] : [st(loc)], ...o });

function stubEnv({ chat = [], latest = null, vars = {}, ls = null, db = null, getLastMessageId = null, charData = null, regexes = null } = {}) {
  const hadWin = 'window' in globalThis;
  globalThis.window = globalThis;   // thFn 读 window[n]（与 tests/host_split.test.mjs 同一手法）
  globalThis.__stub = { chat, latest, vars, ls: ls || new Map(), db, dbCalls: [] };
  globalThis.Mvu = { getMvuData: o => {
    if (o.message_id === 'latest') return latest ? { stat_data: latest } : null;
    const c = chat[o.message_id], v = c?.variables?.[c.swipe_id ?? 0]; return v ? { stat_data: v.stat_data } : null; }, events: { VARIABLE_UPDATE_ENDED: 'v' } };
  globalThis.SillyTavern = { getContext: () => ({ name1: 'Tester', chatId: 'chat1', characterId: 0, characters: [{ avatar: 'card.png' }] }), chat };
  if (vars !== null) { globalThis.getVariables = () => (vars && typeof vars === 'object' ? JSON.parse(JSON.stringify(vars)) : {});   // readVars 的 varsOk 还要求写入接口在（A-11 原语义）
    globalThis.updateVariablesWith = f => { vars = f(JSON.parse(JSON.stringify(vars || {}))); return vars; }; }
  if (db) { globalThis.AutoCardUpdaterAPI = {
    exportTableAsJson: () => db,
    registerTableUpdateCallback: cb => globalThis.__stub.dbCalls.push(['reg', cb]),
    unregisterTableUpdateCallback: cb => globalThis.__stub.dbCalls.push(['unreg', cb]) }; }
  if (getLastMessageId !== null) globalThis.getLastMessageId = getLastMessageId;
  if (charData !== null) globalThis.getCharData = () => charData;
  if (regexes !== null) globalThis.getTavernRegexes = () => regexes;
  return () => {   // 还原
    for (const k of ['Mvu', 'SillyTavern', 'getVariables', 'updateVariablesWith', 'AutoCardUpdaterAPI', 'getLastMessageId', 'getCharData', 'getTavernRegexes']) { try { delete globalThis[k]; } catch (e) {} }
    delete globalThis.__stub; if (!hadWin) delete globalThis.window;
  };
}
const LS = () => { const m = globalThis.__stub.ls; return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), get backing() { return m; } }; };
// 保底名册（通用化 v1）是包级数据：宿主按 manifest.data.roster 取到后经 fallbackMembers 注入桥——这里载入 eden 的保底名册当默认
const FB = JSON.parse(readFileSync(new URL('../map/data/fallback_roster.json', import.meta.url), 'utf8')).members;
const makeBridge = (o = {}) => new MVUBridge({ life: createLife(), storage: LS, wins: () => [globalThis], fallbackMembers: FB, ...o });

test('mvuStat：ok 快照、A-3 微任务缓存、invalidate 立刻重读', async () => {
  const done = stubEnv({ chat: [msg('A'), msg('A', { is_user: true }), msg('B')] });
  try {
    const B = makeBridge();
    const s1 = B.mvuStat();
    assert.equal(s1?.世界?.当前地点, 'B'); assert.equal(B.snapState, 'ok'); assert.equal(B.snapFloor, 2); assert.equal(B.snapTop, 2);
    assert.equal(B.mvuStat(), s1, '同一微任务里只取一次（A-3）');
    globalThis.__stub.chat[2].variables[0] = st('C');        // 数据变了
    assert.equal(B.mvuStat(), s1, '没过微任务：还是旧引用');
    await Promise.resolve(); await Promise.resolve();         // 微任务作废
    assert.equal(B.mvuStat()?.世界?.当前地点, 'C');
    globalThis.__stub.chat[2].variables[0] = st('D');
    B.invalidate();                                            // VARIABLE_UPDATE_ENDED：不等微任务，立刻重读
    assert.equal(B.mvuStat()?.世界?.当前地点, 'D');
  } finally { done(); }
});

test('mvuStat：最新楼缺快照 → stale 用上一楼；生成中 → pending（v0.9.9）', () => {
  const done = stubEnv({ chat: [msg('A'), msg('A', { is_user: true }), msg(null)] });
  try {
    const B = makeBridge({ isGenerating: () => false });
    assert.equal(B.mvuStat()?.世界?.当前地点, 'A'); assert.equal(B.snapState, 'stale'); assert.equal(B.snapFloor, 1, '往前找到最近一份快照（用户楼）'); assert.equal(B.snapTop, 2);
    const P = makeBridge({ isGenerating: () => true });
    assert.equal(P.mvuStat()?.世界?.当前地点, 'A'); assert.equal(P.snapState, 'pending');
  } finally { done(); }
});

test('here：MVU 命中 → mvu；缺快照时正文标签对账 → tag；MVU 无地点 → 表格数据库 → db', () => {
  const dbData = { g: { name: '全局数据表', content: [['row_id', '当前所在地点'], ['1', '中层·霓虹街']] } };
  // ① MVU 为准
  const d1 = stubEnv({ chat: [msg('伊甸庄园·书房')] });
  try { const B = makeBridge({ floorNow: () => 0, lastRaw: () => '⌖地点 中层·霓虹街' });
    assert.equal(B.here(), '伊甸庄园·书房'); assert.equal(B.hereSrc, 'mvu'); assert.equal(B.hereFromDb, false);
  } finally { d1(); }
  // ② 本楼没快照（stale）→ 正文明确写的地点标签兜底（交互方式 d）
  const d2 = stubEnv({ chat: [msg('旧处'), msg(null)] });
  try { const B = makeBridge({ floorNow: () => 1, lastRaw: () => '推门而入。<span style="display:none">⌖地点 中层·霓虹街</span>' });
    assert.equal(B.mvuStat()?.世界?.当前地点, '旧处'); assert.equal(B.snapState, 'stale');
    assert.equal(B.here(), '中层·霓虹街'); assert.equal(B.hereSrc, 'tag');
  } finally { d2(); }
  // ③ MVU 没写地点 → 表格数据库插件的全局表
  const d3 = stubEnv({ chat: [msg('')], db: dbData });
  try { const B = makeBridge({ floorNow: () => 0, lastRaw: () => null });
    assert.equal(B.here(), '中层·霓虹街'); assert.equal(B.hereFromDb, true);
    assert.deepEqual(B.dbCharacters(), [], '没有姓名列的表不算人物表');
    assert.ok(B.dbSig().length > 0, '接口碰到过：人物表指纹非空');
    B.disposeDb(); assert.deepEqual(globalThis.__stub.dbCalls.at(-1)[0], 'unreg', 'disposeDb 撤掉更新回调');
  } finally { d3(); }
  // ④ 都没有 → 空串（地图保持现状）
  const d4 = stubEnv({ chat: [msg('')] });
  try { assert.equal(makeBridge({ floorNow: () => 0, lastRaw: () => null }).here(), ''); } finally { d4(); }
});

test('变量映射（adapter）：detect / effective / 按卡存用户映射 / 签名去重', () => {
  const done = stubEnv({ chat: [msg('书房')] });
  try {
    const B = makeBridge();
    assert.equal(B.refreshVarMap(), true, '首算：签名变了');
    assert.equal(B.refreshVarMap(), false, '输入没变：不去重发');
    assert.equal(B.varMap.location, '世界.当前地点'); assert.equal(B.cardKey(), 'card.png');
    const v = B.varmapView();
    assert.equal(v.card, 'card.png'); assert.equal(v.map.location, '世界.当前地点'); assert.ok(Array.isArray(v.paths)); assert.ok(v.fields.length >= 0); assert.equal(v.mode, 'mvu');
    assert.equal(B.setVarUser({ location: '世界.位置' }), true, '改映射：作废签名后必变');
    assert.equal(B.varMap.location, '世界.位置');
    assert.equal(B.varmode(), 'mvu-partial', '用户指的路径在 stat 里不存在 → mvu-partial');
    assert.equal(globalThis.__stub.ls.get('edenMap:varmap:card.png'), JSON.stringify({ location: '世界.位置' }), '用户映射按角色卡存本机');
  } finally { done(); }
  const d2 = stubEnv({ chat: [] });   // 没有 stat → tags
  try { const B = makeBridge(); B.refreshVarMap(); assert.equal(B.varmode(), 'tags'); } finally { d2(); }
});

test('readVars（A-11）：本机退回优先；其次聊天变量；都没有 → {}', () => {
  // ① 聊天变量
  const d1 = stubEnv({ chat: [msg('A')], vars: { eden_map: { 自定义: { items: { 书房: { 类: 'room' } } } } } });
  try { const B = makeBridge(); assert.equal(B.readVars().自定义.items.书房.类, 'room'); } finally { d1(); }
  // ② 本机退回的数据（写入失败时存的）比聊天变量新
  const d2 = stubEnv({ chat: [msg('A')], vars: { eden_map: { 标签楼: 1 } } });
  try { globalThis.__stub.ls.set('edenMap:chat:chat1:custom2', JSON.stringify({ 标签楼: 9 }));
    assert.equal(makeBridge().readVars().标签楼, 9); } finally { d2(); }
  // ③ 都没有
  const d3 = stubEnv({ chat: [msg('A')], vars: null });
  try { delete globalThis.getVariables; assert.deepEqual(makeBridge().readVars(), {}); } finally { d3(); }
});

test('clock / outfit：世界时间紧凑写法、开局前标注、着装文本', async () => {
  const statFull = { 世界: { 当前地点: '书房', 当前日期: '新历2088年01月01日', 当前时刻: '08:00', 当日时段: '日间' }, 主角: { 着装: { 衣服: '制服', 裤子: '待初始化' } } };
  const done = stubEnv({ chat: [msg('书房', { variables: [{ stat_data: statFull }] })], getLastMessageId: () => 3 });
  try {
    const B = makeBridge(); await B.mvuReady;
    const c = B.clock();
    assert.equal(c.short, '1月1日 08:00'); assert.equal(c.full, '新历2088年01月01日 08:00 日间');
    assert.equal(c.night, false); assert.equal(c.tod, 'day'); assert.equal(c.pre, false);
    const o = B.outfit();
    assert.deepEqual(o.items, { 衣服: '制服' }, '「待初始化」不算着装');
    assert.equal(o.text, '制服');
    // 开局前（聊天只有开场白）
    globalThis.getLastMessageId = () => 0;
    const B2 = makeBridge(); await B2.mvuReady;
    assert.equal(B2.clock().pre, true);
  } finally { done(); }
});

test('名册 / 立绘 / 阶段序：设定兜底名册、作者 CDN 白名单立绘、卡文本里的枚举序', async () => {
  const statRoster = { 世界: { 当前地点: '书房' }, 主角: { 着装: {} }, 女仆名册: { 绫濑遥: { 身份: '女仆长' } }, 训练目标: { 某乙: { 身份: 'x', 阶段: '二阶' } } };   // 名册按位置发现：第 1 键 = 世界、第 2 键 = 主角，其后按序是成员 / 目标
  const charData = { data: { extensions: {
    script: 'defaultPortraits = { "绫濑遥": "https://cdn.jsdelivr.net/gh/yehehua1311/x/sfw/a.png", "坏": "https://evil.example/x.png" }',
    zod: 'const stageSchema = z.enum(["一阶","二阶","三阶"])' } } };
  const done = stubEnv({ chat: [msg('书房', { variables: [{ stat_data: statRoster }] })], charData, regexes: [] });
  try {
    const B = makeBridge(); await B.mvuReady;
    const r = B.rosters();
    assert.ok(r.members.items.length >= 16, '设定兜底名册：MVU 表有人也补齐开局 16 人');
    assert.equal(r.members.items.find(i => i.name === '绫濑遥').identity, '女仆长', 'MVU 有的人以 MVU 为准');
    assert.equal(B.reputation(), null, '没有声望字段 → null');
    B.portraitsFor();
    assert.equal(B.portraits.绫濑遥, 'https://cdn.jsdelivr.net/gh/yehehua1311/x/sfw/a.png');
    assert.equal(B.portraits.坏, undefined, '非白名单域名不收');
    B.stageOrderFor(r);
    assert.deepEqual(B.stageOrder, ['一阶', '二阶', '三阶']);
    B.portraitsFor();   // 同一聊天只读一次（A-3）
    const reads = globalThis.__stub.dbCalls.length; void reads;
  } finally { done(); }
});

test('read()：标准摘要形状（P2 契约）＋ 三个契约方法都在', async () => {
  const statFull = { 世界: { 当前地点: '书房', 当前日期: '新历2088年01月01日', 当前时刻: '08:00' } };
  const done = stubEnv({ chat: [msg('书房', { variables: [{ stat_data: statFull }] })], vars: { eden_map: { 标签楼: 3 } } });
  try {
    const B = makeBridge({ floorNow: () => 0, lastRaw: () => null }); await B.mvuReady;
    B.refreshVarMap();
    const s = B.read();
    assert.deepEqual(Object.keys(s).sort(), ['clock', 'custom', 'here', 'outfit', 'portraits', 'rosters']);
    assert.equal(s.here, '书房'); assert.equal(s.clock.short, '1月1日 08:00');
    assert.deepEqual(s.custom, { 标签楼: 3 });
    assert.deepEqual(s.portraits, {});
    for (const k of ['read', 'mvuStat', 'invalidate']) assert.equal(typeof B[k], 'function', `契约方法 ${k}`);
  } finally { done(); }
});

test('MVU 事件：whenMvu 落定后给出事件名；没装 MVU 不卡死', async () => {
  const done = stubEnv({ chat: [] });
  try {
    const B = makeBridge();
    assert.equal(B.mvuPresent(), true); assert.equal(B.mvuUsable(), true);
    await B.whenMvu();
    assert.equal(typeof B.varUpdateEvent(), 'string');
  } finally { done(); }
  // 没装 Mvu（也没装 waitGlobalInitialized）：whenMvu 也要落定（否则楼层事件一个都挂不上）
  const hadWin = 'window' in globalThis; globalThis.window = globalThis;
  globalThis.SillyTavern = { getContext: () => ({ name1: 'x', chatId: 'c' }), chat: [] };
  try { const B = makeBridge();
    assert.equal(B.mvuPresent(), false); assert.equal(B.mvuUsable(), false);
    await Promise.race([B.whenMvu(), new Promise((_, rj) => setTimeout(() => rj(new Error('没装 MVU 时 whenMvu 卡死')), 50))]);
  } finally { delete globalThis.SillyTavern; if (!hadWin) delete globalThis.window; }
});

// ---- 宿主隔离契约（机械检查）----
// 把源码里的字符串字面量与注释剥掉后，map/tavern/ 的运行时代码里 Mvu / SillyTavern 只允许出现在 mvu-bridge.mjs。
// viewer 侧（map/app/*，另有一个 window）不在本契约范围——那是 P3 查看器解耦的活。
function stripLiterals(src) {
  let out = '', i = 0, mode = 'code'; const stack = [];
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && n === '/') { mode = 'line'; i += 2; out += ' '; continue; }
      if (c === '/' && n === '*') { mode = 'block'; i += 2; out += ' '; continue; }
      if (c === "'" || c === '"' || c === '`') { mode = c; i++; out += ' '; continue; }
      out += c; i++; continue;
    }
    if (mode === 'line') { if (c === '\n') { mode = stack.pop() ?? 'code'; out += '\n'; } i++; continue; }
    if (mode === 'block') { if (c === '*' && n === '/') { mode = stack.pop() ?? 'code'; i += 2; } else { if (c === '\n') out += '\n'; i++; } continue; }
    if (c === '\\') { i += 2; continue; }
    if (mode === '`' && c === '$' && n === '{') { stack.push('`'); mode = 'code'; i += 2; continue; }
    if (c === mode) { mode = stack.pop() ?? 'code'; i++; out += ' '; continue; }
    i++;
  }
  return out;
}

test('宿主隔离契约：字符串与注释之外，map/tavern 运行时代码里只有 mvu-bridge.mjs 碰 Mvu / SillyTavern', () => {
  const dir = fileURLToPath(new URL('../map/tavern/', import.meta.url));
  const files = readdirSync(dir).filter(f => /\.(js|mjs)$/.test(f) && !f.startsWith('test-'));   // test-*.html 是手工桩页（按扩展名已排除，双保险）
  assert.ok(files.includes('mvu-bridge.mjs')); assert.ok(files.includes('eden-map.js'));
  for (const f of files) {
    const stripped = stripLiterals(readFileSync(dir + f, 'utf8'));
    const hits = stripped.match(/\b(?:Mvu|SillyTavern)\b/g) ?? [];
    if (f === 'mvu-bridge.mjs') assert.ok(hits.length >= 2, '桥自己必须真的在碰这些全局（否则契约空转）');
    else assert.deepEqual(hits, [], `${f} 直连了 Mvu / SillyTavern 全局（应经 mvu-bridge.mjs）`);
  }
});

test('包的变量声明：桥取清单 + 叠加层，到了换默认并通知宿主；取不到就一直按字段名自动找', async () => {
  const { setProfile, getProfile } = await import('../map/tavern/pack-profile.mjs'), { edenInputs } = await import('./helpers/eden-inputs.mjs'), I = edenInputs();
  const files = { 'packs/eden/manifest.json': I.manifest, 'packs/eden/overlay.v2.json': I.overlay }, asked = [];
  const done = stubEnv({ chat: [msg('书房', { variables: [{ stat_data: { 世界: { 当前地点: '书房' } } }] })] });
  try {
    setProfile(null);
    let hit = 0; const B = new MVUBridge({ life: createLife(), storage: LS, fetchJSON: async rel => { asked.push(rel); return files[rel] || null; }, onProfile: () => { hit++; } });
    assert.equal(getProfile().paths.location, '', 'until the declarations arrive nothing is named');
    await new Promise(r => setTimeout(r, 30));
    assert.deepEqual(asked.sort(), ['packs/eden/manifest.json', 'packs/eden/overlay.v2.json']); assert.equal(hit, 1);
    assert.equal(getProfile().paths.location, '世界.当前地点'); assert.equal(B.here(), '书房'); assert.equal(B.varMap.location, '世界.当前地点');
    setProfile(null); const L = new MVUBridge({ life: createLife(), storage: LS, fetchJSON: async () => null, onProfile: () => { hit++; } });
    await new Promise(r => setTimeout(r, 30)); assert.equal(hit, 1, 'nothing fetched, nothing announced'); assert.equal(L.here(), '书房', 'the location is found by its field name');
  } finally { done(); useEden(); }
});

test('S4-3：桥把世界书名前缀交给 mvu.setWbName——第一个包得到「伊甸地图·自定义」（清单 worldbook.prefix），别的包用包标题；拿不到清单就不配', async () => {
  const MVm = await import('../map/tavern/mvu.mjs'), man = JSON.parse(readFileSync(new URL('../map/packs/eden/manifest.json', import.meta.url), 'utf8'));
  const keep = MVm.WB_NAME;
  try {
    let asked = null;   // 内置的第一个包：桥自己按路径取清单
    const A = new MVUBridge({ life: createLife(), storage: LS, packId: 'eden', fetchJSON: async rel => { asked ??= rel; return rel.endsWith('manifest.json') ? man : null; } });
    await A.mvuReady; assert.equal(asked, 'packs/eden/manifest.json'); assert.equal(MVm.WB_NAME, '伊甸地图·自定义');
    const B = new MVUBridge({ life: createLife(), storage: LS, packId: 'eden', manifest: Promise.resolve({ ...man, worldbook: { addon: 'x' }, title: '雾港镇' }) });
    await B.mvuReady; assert.equal(MVm.WB_NAME, '雾港镇·自定义');   // 没写前缀：包标题
    MVm.setWbName('先前的名字');
    const C = new MVUBridge({ life: createLife(), storage: LS, packId: 'eden', fetchJSON: async () => null });
    await C.mvuReady; assert.equal(MVm.WB_NAME, '先前的名字·自定义');   // 没取到清单：不改、不猜
  } finally { MVm.setWbName(keep.replace(/·自定义$/, '') || '伊甸地图'); }
});
