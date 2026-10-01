// NPC 日程漫游（Part 5-3）node 单测：时刻解析、日程规范化（含跨零点）、whoWhere 的接管与让位、nextMove、
// 数组写法（包数据文件只能是 ASCII 键）与 eden 那份数据的落地。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normSchedule, whoWhere, nextMove, minuteOf } from '../map/core/routine.mjs';

test('normSchedule：中文键 / 英文键、坏行丢弃、跨零点拆两段、没写「到」默认 2 小时', () => {
  const s = normSchedule({ 默认: '书房', 人物: {
    '甲': [{ 从: '08:00', 到: '12:00', 在: '书房' }, { 从: '22:00', 到: '06:00', 在: '主卧' }, { 从: '13:00', 在: '花园' }, '垃圾', { 从: 'xx', 在: ' nowhere ' }],
    '乙': [{ from: '9:30', to: '11:30', at: '客厅' }],
  } });
  assert.equal(s.default, '书房');
  assert.deepEqual(s.byName['甲'][0], { from: 0, to: 360, at: '主卧' }, '按起始分钟排序，跨零点拆出的 0 段排最前');
  assert.deepEqual(s.byName['甲'].slice(1), [{ from: 480, to: 720, at: '书房' }, { from: 780, to: 900, at: '花园' }, { from: 1320, to: 1440, at: '主卧' }]);
  assert.deepEqual(s.byName['乙'], [{ from: 570, to: 690, at: '客厅' }]);
  assert.deepEqual(normSchedule(null), { default: null, byName: {} });
  assert.equal(normSchedule({ 人物: { '丙': [] } }).byName['丙'], undefined);
});

test('whoWhere：时段命中、默认兜底、known 让位、分钟归一', () => {
  const s = normSchedule({ 默认: '庭院', 人物: { '甲': [{ 从: '08:00', 到: '12:00', 在: '书房' }] } });
  assert.deepEqual(whoWhere(s, 9 * 60), [{ name: '甲', place: '书房', source: 'routine' }]);
  assert.deepEqual(whoWhere(s, 15 * 60), [{ name: '甲', place: '庭院', source: 'routine' }], '时段外走默认');
  assert.deepEqual(whoWhere(s, 9 * 60, ['甲']), [], 'known 里已有位置：日程不接管');
  assert.deepEqual(whoWhere(s, 25 * 60 + 30), [{ name: '甲', place: '庭院', source: 'routine' }], '分钟数归一到当天');
  assert.deepEqual(whoWhere(null, 600), []);
  assert.deepEqual(whoWhere({ 人物: { '乙': [] } }, 600), [], '没配默认也没配时段：不出结果');
});

test('nextMove：下一段、跨天回卷、没配 = null', () => {
  const s = normSchedule({ 人物: { '甲': [{ 从: '08:00', 到: '12:00', 在: '书房' }, { 从: '14:00', 到: '18:00', 在: '花园' }] } });
  assert.deepEqual(nextMove(s, '甲', 9 * 60), { at: 840, place: '花园' });
  assert.deepEqual(nextMove(s, '甲', 20 * 60), { at: 480 + 1440, place: '书房' }, '次日回卷');
  assert.equal(nextMove(s, '乙', 600), null);
  assert.equal(nextMove(s, '甲', 'bad'), null);
});

test('数组写法（npcs / name / slots）：与对象写法等价，坏行同样丢弃', () => {
  const s = normSchedule({ default: '大厅', npcs: [
    { name: '甲', slots: [{ from: '08:00', to: '12:00', at: '书房' }] },
    { name: '乙', slots: [{ from: '22:00', to: '06:00', at: '主卧' }] },
    { slots: [{ from: '08:00', at: '没人认领' }] },   // 没有 name：丢
    null,
    { name: '丙', slots: '不是数组' },
  ] });
  assert.equal(s.default, '大厅');
  assert.deepEqual(Object.keys(s.byName), ['甲', '乙']);
  assert.deepEqual(s.byName['乙'], [{ from: 0, to: 360, at: '主卧' }, { from: 1320, to: 1440, at: '主卧' }], '跨零点一样拆两段');
  assert.deepEqual(whoWhere(s, 9 * 60), [{ name: '甲', place: '书房', source: 'routine' }, { name: '乙', place: '大厅', source: 'routine' }]);
});

test('eden 的日程数据（map/data/routine.json）：ASCII 键、时刻写得成、一天之内覆盖得住、名字照抄卡', () => {
  const raw = JSON.parse(readFileSync(new URL('../map/data/routine.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(raw.npcs) && raw.npcs.length, 'npcs 是数组（对象写法在包数据文件里过不了 ASCII 审计）');
  for (const k of Object.keys(raw)) if (k !== '_note') assert.ok(!/[^\x00-\x7f]/.test(k), `顶层键 ${k} 必须是 ASCII`);
  const s = normSchedule(raw);
  assert.ok(Object.keys(s.byName).length >= 4);
  for (const [name, slots] of Object.entries(s.byName)) {
    assert.ok(slots.length > 1, `${name} 至少两段，否则一天里大部分时间都在兜底`);
    for (const sl of slots) { assert.ok(sl.from >= 0 && sl.from < 1440 && sl.to > 0 && sl.to <= 1440, `${name} 的时段在一天之内`); assert.ok(sl.at, '每段都要有落点'); }
    for (const [h, m] of [[3, 0], [9, 30], [15, 0], [21, 45]]) {
      const r = whoWhere(s, h * 60 + m).find(x => x.name === name);
      assert.ok(r && r.place, `${name} 在 ${h}:${m} 有地方可待`);
    }
  }
  const man = JSON.parse(readFileSync(new URL('../map/packs/eden/manifest.json', import.meta.url), 'utf8'));
  assert.equal(man.data.routine, 'data/routine.json', '清单指向这份数据');
  assert.equal(minuteOf('07:30'), 450);
});
