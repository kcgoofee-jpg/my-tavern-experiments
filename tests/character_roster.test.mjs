// P3-B 任务 1（docs/reviews/architecture_and_stream_perf.md §5）：CharacterRosterSystem 多源名册统一抽象——
// 五来源统一 rows() 契约、优先级合并仲裁、立绘按名挂载容错、空 / 畸形数据防御性降级、纯度机检。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RosterSystem, SOURCES, normName, mvuRows, placeRows, fallbackRows, baibaiRows } from '../map/core/roster.mjs';

const src = () => readFileSync(new URL('../map/core/roster.mjs', import.meta.url), 'utf8');
// 保底名册（通用化 v1）是包级数据：宿主按 manifest.data.roster 取到后经 fallbackMembers 注入桥——测试同形，载入 eden 的保底名册
const FB = JSON.parse(readFileSync(new URL('../map/data/fallback_roster.json', import.meta.url), 'utf8')).members;

test('normName / SOURCES：名字空白归一截断；来源序即优先级序（mvu 最高、baibai 最低）', () => {
  assert.equal(normName('  绫濑　遥 \n'), '绫濑 遥', '全角空格也归一成单空格');
  assert.equal(normName('x'.repeat(50)), 'x'.repeat(40));
  assert.equal(normName(null), '');
  assert.deepEqual(SOURCES, ['mvu', 'chat', 'table-db', 'fallback', 'baibai']);
});

test('五来源行适配：各自的原始形状 → 标准 RosterRow', () => {
  // MVU 名册：在场表标在场；成员 / 目标 identity → role，阶段 / 等级进 tags；设定兜底行跳过（由 fallback 来源供给）
  const mvu = mvuRows({
    present: { key: '在场人物', items: [{ name: '甲', identity: '访客' }] },
    members: { key: '表一', items: [{ name: '绫濑遥', identity: '女仆长', stage: '二阶', grade: 'B' }, { name: '设定人', identity: 'x', src: '设定' }] },
    targets: null,
  });
  assert.deepEqual(mvu, [
    { name: '甲', source: 'mvu', role: '访客', status: '在场', present: true, raw: { name: '甲', identity: '访客' } },
    { name: '绫濑遥', source: 'mvu', role: '女仆长', tags: ['二阶', 'B'], raw: { name: '绫濑遥', identity: '女仆长', stage: '二阶', grade: 'B' } },
  ]);
  assert.deepEqual(mvuRows(null), []); assert.deepEqual(mvuRows({ members: { items: '坏' } }), []);
  // 聊天标签 / 数据库：[{ name, place }]
  assert.deepEqual(placeRows([{ name: ' 甲 ', place: '书房' }, { name: '', place: 'x' }, null], 'chat'),
    [{ name: '甲', location: '书房', source: 'chat' }]);
  assert.deepEqual(placeRows([{ name: '乙', place: '' }], 'table-db'), [{ name: '乙', source: 'table-db' }]);
  // 卡片保底 / 柏宝绘
  assert.deepEqual(fallbackRows([{ name: '绫濑遥', identity: '伊甸庄园女仆长' }, { identity: '没名字' }]),
    [{ name: '绫濑遥', role: '伊甸庄园女仆长', source: 'fallback', raw: { name: '绫濑遥', identity: '伊甸庄园女仆长' } }]);
  assert.deepEqual(fallbackRows('坏'), []);
  const b = baibaiRows([{ name: '甲', tag: '1girl', nl: '银发' }, { name: '  ' }]);
  assert.deepEqual(b, [{ name: '甲', source: 'baibai', raw: { name: '甲', tag: '1girl', nl: '银发' } }]);
});

test('use / rows：统一 Provider 契约与 ctx 透传；重复登记同源 = 替换', () => {
  const rs = new RosterSystem();
  assert.equal(rs.use('', { rows: () => [] }), false, '空来源名不收');
  assert.equal(rs.use('mvu', {}), false, '没有 rows() 的不收');
  let seen = null;
  assert.equal(rs.use('chat', { rows: ctx => { seen = ctx; return [placeRows([{ name: '甲', place: ctx.where }], 'chat')[0]]; } }), true);
  assert.deepEqual(rs.rows({ where: '书房' }), [{ name: '甲', location: '书房', source: 'chat' }]);
  assert.deepEqual(seen, { where: '书房' }, 'ctx 原样透传给 provider');
  rs.use('chat', { rows: () => [] });
  assert.deepEqual(rs.rows(), [], '同源替换后旧行不再出现');
});

test('合并仲裁：MVU 实时状态 > 聊天临时标签 > 数据库 > 卡片保底；空值让位、tags 并集、raw 高者胜', () => {
  const rs = new RosterSystem();
  rs.use('fallback', { rows: () => fallbackRows([{ name: '绫濑遥', identity: '伊甸庄园女仆长' }, { name: '苍穹', identity: '战斗修女' }]) });
  rs.use('table-db', { rows: () => placeRows([{ name: '绫濑遥', place: '数据库旧位置' }, { name: '路人', place: '大门' }], 'table-db') });
  rs.use('chat', { rows: () => placeRows([{ name: '绫濑遥', place: '' }], 'chat') });
  rs.use('mvu', { rows: () => mvuRows({ members: { key: '表一', items: [{ name: '绫濑遥', identity: '女仆长（剧情版）', stage: '二阶' }] } }) });
  const rows = rs.rows();
  assert.equal(rows.length, 3, '同名合一行：四人三行');
  const ay = rows.find(r => r.name === '绫濑遥');
  assert.equal(ay.source, 'mvu', 'source 记最高优先级来源');
  assert.equal(ay.role, '女仆长（剧情版）', '字段冲突：MVU 胜过保底');
  assert.equal(ay.location, '数据库旧位置', 'MVU 没写位置：聊天空值让位后由数据库补');
  assert.deepEqual(ay.tags, ['二阶']);
  assert.equal(rows.find(r => r.name === '苍穹').role, '战斗修女', '保底的人照常在册');
  assert.equal(rows.find(r => r.name === '路人').source, 'table-db');
});

test('别名互认：displayName 登记在先时，同名并入一行；字段与 present 按优先级合', () => {
  const rs = new RosterSystem();
  rs.use('mvu', { rows: () => [{ name: '伊莎贝拉·罗斯柴尔德', displayName: '伊莎贝拉', role: '财阀 CEO', source: 'mvu' }] });
  rs.use('chat', { rows: () => [{ name: '伊莎贝拉', location: '顶层办公室', source: 'chat', present: true }] });
  const rows = rs.rows();
  assert.equal(rows.length, 1, '短名是全名行的别名 → 并入');
  assert.deepEqual(rows[0], { name: '伊莎贝拉·罗斯柴尔德', displayName: '伊莎贝拉', role: '财阀 CEO', location: '顶层办公室', source: 'mvu', status: '在场', present: true });
});

test('立绘挂载：按名与别名挂 portrait；挂不上的计入 unmappedPortraits；坏图址 / 重复挂载容错', () => {
  const rs = new RosterSystem();
  rs.use('mvu', { rows: () => [{ name: '伊莎贝拉·罗斯柴尔德', displayName: '伊莎贝拉', source: 'mvu' }, { name: '苍穹', source: 'mvu' }] });
  rs.attachPortraits({ '伊莎贝拉·罗斯柴尔德': 'https://a/b.png', '伊莎贝拉': 'https://alias.png', '苍穹': 'https://c.png', '不在册': 'https://d.png', '坏': 'not-a-url-but-string-is-tolerated', 42: 'x' });
  const rows = rs.rows();
  assert.equal(rows.find(r => r.name === '伊莎贝拉·罗斯柴尔德').portrait, 'https://a/b.png', '本名优先');
  assert.equal(rows.find(r => r.name === '苍穹').portrait, 'https://c.png');
  const d = rs.describe();
  assert.equal(d.unmappedPortraits, 3, '「不在册」等挂不上的：容错不抛（图址合法性由 mvu.portraitOk 把关，这里只认名字）');
  rs.attachPortraits({ '苍穹': 'https://new.png' });   // 重复挂载 = 整体替换
  assert.equal(rs.rows().find(r => r.name === '苍穹').portrait, 'https://new.png');
  assert.equal(rs.rows().find(r => r.name === '伊莎贝拉·罗斯柴尔德').portrait, undefined);
  rs.attachPortraits(null); rs.attachPortraits([1]);
  assert.deepEqual(rs.describe(), { total: 2, activeCount: 0, sourceCounts: { mvu: 2, chat: 0, 'table-db': 0, fallback: 0, baibai: 0 }, unmappedPortraits: 0 }, '坏 map 视为没挂');
});

test('describe：标准化摘要契约 { total, activeCount, sourceCounts, unmappedPortraits }', () => {
  const rs = new RosterSystem();
  rs.use('mvu', { rows: () => [...mvuRows({ present: { items: [{ name: '甲' }] } }), { name: '乙', source: 'mvu' }] });
  rs.use('fallback', { rows: () => fallbackRows([{ name: '丙', identity: 'x' }]) });
  const d = rs.describe();
  assert.deepEqual(Object.keys(d).sort(), ['activeCount', 'sourceCounts', 'total', 'unmappedPortraits']);
  assert.equal(d.total, 3); assert.equal(d.activeCount, 1, '在场的人计入 active');
  assert.deepEqual(d.sourceCounts, { mvu: 2, chat: 0, 'table-db': 0, fallback: 1, baibai: 0 });
});

test('防御性降级：抛错 / 非数组 / 畸形行只废自己；全空系统零摘要不抛', () => {
  const rs = new RosterSystem();
  rs.use('mvu', { rows: () => { throw new Error('来源炸了'); } });
  rs.use('chat', { rows: () => '不是数组' });
  rs.use('table-db', { rows: () => [null, 42, 'x', {}, { name: '  ' }, { name: '好的', place: '书房', source: '伪造' }] });
  assert.deepEqual(rs.rows(), [{ name: '好的', location: '书房', source: 'fallback' }], '畸形行丢弃、伪造 source 归入保底档');
  const empty = new RosterSystem();
  assert.deepEqual(empty.rows(), []);
  assert.deepEqual(empty.describe(), { total: 0, activeCount: 0, sourceCounts: { mvu: 0, chat: 0, 'table-db': 0, fallback: 0, baibai: 0 }, unmappedPortraits: 0 });
  assert.deepEqual(empty.names(), []);
});

test('纯度：core/roster.mjs 不碰 DOM / 酒馆全局 / 存储 / 网络', () => {
  assert.doesNotMatch(src(), /\b(document|window|localStorage|sessionStorage|fetch|SillyTavern|Mvu|globalThis)\b/);
});

// ---------------- 桥接线（mvu-bridge.mjs 注册 mvu / table-db / fallback 三来源） ----------------
import { createLife } from '../map/tavern/host-lifecycle.mjs';
import { MVUBridge } from '../map/tavern/mvu-bridge.mjs';

// INV-2: the table-database / image-generation bridges are parked until edenMapOn:<id> = '1'; these tests exercise them, so the flags are stored.
globalThis.localStorage = { getItem: k => (String(k).startsWith('edenMapOn:') ? '1' : null), setItem() {}, removeItem() {} };

function stubEnv({ chat = [], latest = null, db = null } = {}) {
  const hadWin = 'window' in globalThis;
  globalThis.window = globalThis;
  globalThis.Mvu = { getMvuData: o => (o.message_id === 'latest' ? (latest ? { stat_data: latest } : null) : null), events: { VARIABLE_UPDATE_ENDED: 'v' } };
  globalThis.SillyTavern = { getContext: () => ({ name1: 'Tester', chatId: 'chat1', characterId: 0, characters: [{ avatar: 'card.png' }] }), chat };
  if (db) globalThis.AutoCardUpdaterAPI = { exportTableAsJson: () => db };
  return () => { for (const k of ['Mvu', 'SillyTavern', 'AutoCardUpdaterAPI']) { try { delete globalThis[k]; } catch (e) {} } if (!hadWin) delete globalThis.window; };
}
const LS = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

test('桥接线：mvu / fallback / table-db 三来源装配；MVU 实时身份胜过保底；宿主补的 chat 来源照常并入', async () => {
  const stat = { 世界: { 当前地点: '书房' }, 主角: { 着装: {} }, 女仆名册: { 绫濑遥: { 身份: '女仆长（剧情版）' } } };
  const db = { t: { name: '人物表', content: [['row_id', '姓名', '所在地点'], ['1', ' db来客 ', '大门']] } };
  const done = stubEnv({ chat: [{ is_user: false, swipe_id: 0, variables: [{ stat_data: stat }] }], latest: stat, db });
  try {
    const B = new MVUBridge({ life: createLife(), storage: LS, wins: () => [globalThis], fallbackMembers: FB });
    await B.mvuReady;
    const names = B.rosterNames();
    assert.equal(names.filter(n => n === '绫濑遥').length, 1, 'MVU 与保底同名合一');
    assert.equal(names.length, 17, 'MVU 1 人 + 卡片保底 16 人（无重复）');
    const ay = B.rosterRows().find(r => r.name === '绫濑遥');
    assert.equal(ay.role, '女仆长（剧情版）', '字段冲突：MVU 实时状态胜过保底');
    assert.equal(ay.source, 'mvu');
    assert.ok(B.rosterRows().some(r => r.name === 'db来客' && r.location === '大门' && r.source === 'table-db'), '表格数据库人物表入册（名字标准化）');
    // 宿主侧补登记 chat 来源（eden-map.js 的接线形态）
    B.roster.use('chat', { rows: () => [{ name: '绫濑遥', place: '书房', source: 'chat' }] });
    const ay2 = B.rosterRows().find(r => r.name === '绫濑遥');
    assert.equal(ay2.location, '书房', '聊天标签补位置');
    assert.equal(ay2.role, '女仆长（剧情版）', '身份仍以 MVU 为准');
    assert.equal(ay2.source, 'mvu');
    // 立绘挂载走桥的 portraits
    B.portraits = { '绫濑遥': 'https://cdn.jsdelivr.net/gh/x/sfw/a.png' };
    B.roster.attachPortraits(B.portraits);
    assert.equal(B.rosterRows().find(r => r.name === '绫濑遥').portrait, B.portraits['绫濑遥']);
    const d = B.rosterSummary();
    assert.deepEqual(Object.keys(d).sort(), ['activeCount', 'sourceCounts', 'total', 'unmappedPortraits']);
    assert.deepEqual(d.sourceCounts, { mvu: 1, chat: 0, 'table-db': 1, fallback: 15, baibai: 0 }, '与 MVU 同名的保底行并入 mvu 账目，16 保底 - 1 = 15');
  } finally { done(); }
});

test('桥接线：无数据场景降级到保底名册（初始展示不空）', async () => {
  const done = stubEnv({ chat: [] });
  try {
    const B = new MVUBridge({ life: createLife(), storage: LS, wins: () => [globalThis], fallbackMembers: FB });
    await B.mvuReady;
    assert.deepEqual(B.rosterRows().filter(r => r.source !== 'fallback'), [], '没有 MVU / 数据库 / 聊天数据 → 三来源都空');
    assert.equal(B.rosterNames().length, 16, '保底名册照常在册');
    assert.deepEqual(B.rosterSummary().sourceCounts, { mvu: 0, chat: 0, 'table-db': 0, fallback: 16, baibai: 0 });
  } finally { done(); }
});
