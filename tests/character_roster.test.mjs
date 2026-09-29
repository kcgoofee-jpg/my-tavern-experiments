// P3-B 任务 1（docs/reviews/architecture_and_stream_perf.md §5）：CharacterRosterSystem 多源名册统一抽象——
// 五来源统一 rows() 契约、优先级合并仲裁、立绘按名挂载容错、空 / 畸形数据防御性降级、纯度机检。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RosterSystem, SOURCES, normName, mvuRows, placeRows, fallbackRows, baibaiRows } from '../map/core/roster.mjs';

const src = () => readFileSync(new URL('../map/core/roster.mjs', import.meta.url), 'utf8');

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
