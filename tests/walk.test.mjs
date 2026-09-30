// 确定性时钟驱动的行走引擎（Part 8-2）：map/core/walk.mjs —— tickClock 的确定性、插值（二维 / 三维）、
// 瞬移禁令（换地方必走一段）、「减少动态效果」一步到位；以及 core/routine.mjs 的时钟版落点 placesAt。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tickClock, createWalker, lerpN, easeInOut, DEFAULT_DUR_MS, DEFAULT_ROUND_MS, MAX_ROUNDS } from '../map/core/walk.mjs';
import { advance, DEFAULT_MIN_PER_ROUND, normClock } from '../map/core/clock.mjs';
import { normSchedule, placesAt, minuteOfClock, whoWhere } from '../map/core/routine.mjs';

test('tickClock：同一个 (起点, 经过) 永远同一个时刻——不读系统时间', () => {
  const base = { day: 1, min: 600 };
  const a = tickClock(base, { now: 125000, t0: 5000, roundMs: 60000, minPerRound: 10 });
  const b = tickClock(base, { now: 125000, t0: 5000, roundMs: 60000, minPerRound: 10 });
  assert.deepEqual(a, b);
  assert.equal(a.rounds, 2, '120 秒 / 60 秒一轮 = 2 轮');
  assert.deepEqual(a.clock, advance(base, 2, 10));
  assert.equal(a.elapsed, 120000);
  assert.equal(a.nextIn, 60000, '到下一轮还剩 60 s（刚好整轮）');
  assert.equal(tickClock(base, { now: 5000, t0: 5000 }).rounds, 0);
  assert.equal(tickClock(base, { now: 4000, t0: 5000 }).rounds, 0, '时间倒着走不当真');
  assert.equal(tickClock(base, {}).rounds, 0, '没给 now = 没推进');
  assert.equal(tickClock(null, { now: 1e9, t0: 0 }).rounds, MAX_ROUNDS, '补推有上限：挂了半天回来不会一口气几千轮');
  assert.equal(tickClock(base, { now: 1000, t0: 0, roundMs: 0 }).rounds, 0, '轮长 0 = 不推进');
  assert.equal(tickClock(base, { now: 61000, t0: 0 }).clock.min, 610, '默认每轮 10 分钟');
  assert.equal(DEFAULT_MIN_PER_ROUND, 10);
  assert.equal(DEFAULT_ROUND_MS, 60000);
});

test('lerpN / easeInOut：按分量插值，缓入缓出，维数不齐 / 脏数据不炸', () => {
  assert.deepEqual(lerpN([0, 0], [10, 20], 0.5), [5, 10]);
  assert.deepEqual(lerpN([0, 0, 0], [2, 4, 6], 0.25), [0.5, 1, 1.5], '三维同样按分量算（三维页的 NPC 坐标）');
  assert.deepEqual(lerpN([1, 2], [3], 0.5), [2], '维数不齐按短的');
  assert.deepEqual(lerpN(null, [1], 1), [], '不是数组 = 没有坐标');
  assert.deepEqual(lerpN([1, 2], [3, 4], 5), [3, 4], 'k 夹到 1');
  assert.equal(easeInOut(0), 0); assert.equal(easeInOut(1), 1); assert.equal(easeInOut(0.5), 0.5);
  assert.ok(easeInOut(0.25) < 0.25 && easeInOut(0.75) > 0.75, '两头慢中间快');
});

test('walker：第一次出现直接落位，换地方才走一段（禁瞬移）', () => {
  const w = createWalker();
  assert.equal(w.to('甲', [0, 0], 0), false, '第一次出现：不凭空走一段');
  assert.deepEqual(w.at('甲', 0), [0, 0]);
  assert.equal(w.to('甲', [10, 0], 1000), true);
  assert.deepEqual(w.at('甲', 1000), [0, 0], '这一刻还在起点');
  assert.deepEqual(w.at('甲', 1000 + DEFAULT_DUR_MS / 2), [5, 0], '走到一半在中点');
  assert.deepEqual(w.at('甲', 1000 + DEFAULT_DUR_MS), [10, 0]);
  assert.equal(w.to('甲', [10, 0], 2000), false, '同一个目标不重开一段');
  assert.equal(w.has('乙'), false);
  assert.equal(w.at('乙'), null);
});

test('walker.step：走完收尾，done 报出到家的名字，moving 归零', () => {
  const w = createWalker();
  w.to('甲', [0, 0], 0); w.to('甲', [10, 10], 0);
  assert.equal(w.step(DEFAULT_DUR_MS / 2).moving, true);
  assert.deepEqual(w.step(DEFAULT_DUR_MS / 2).done, []);
  assert.deepEqual(w.step(DEFAULT_DUR_MS), { moving: false, done: ['甲'] });
  assert.deepEqual(w.step(DEFAULT_DUR_MS + 1).done, [], '到家的只报一次');
  assert.deepEqual(w.at('甲', DEFAULT_DUR_MS + 999), [10, 10], '之后一直停在终点');
  assert.equal(w.moving(), false);
});

test('walker：中途改目标从当前位置接上，不回起点', () => {
  const w = createWalker();
  w.to('甲', [0, 0], 0); w.to('甲', [10, 0], 0);
  w.step(DEFAULT_DUR_MS / 2);
  w.to('甲', [10, 10], DEFAULT_DUR_MS / 2);
  assert.deepEqual(w.at('甲', DEFAULT_DUR_MS / 2), [5, 0], '新的一段从半路上的 [5,0] 起算');
  assert.deepEqual(w.at('甲', DEFAULT_DUR_MS / 2 + DEFAULT_DUR_MS), [10, 10]);
});

test('walker：reduced / snap —— 一步到位，不排队补间', () => {
  const w = createWalker({ reduced: true });
  w.to('甲', [0, 0], 0); w.to('甲', [10, 10], 0);
  assert.deepEqual(w.at('甲', 0), [10, 10], '「减少动态效果」：一设目标就到位');
  assert.equal(w.moving(), false);
  const w2 = createWalker();
  w2.to('甲', [0, 0], 0); w2.to('甲', [10, 0], 0); w2.step(DEFAULT_DUR_MS / 2);
  w2.setReduced(true);
  assert.deepEqual(w2.at('甲', DEFAULT_DUR_MS / 2), [10, 0], '走到一半切成减少动态效果：立刻到位');
  const w3 = createWalker();
  w3.snap('甲', [3, 4]); assert.deepEqual(w3.at('甲'), [3, 4]);
  w3.snap('甲', null); assert.equal(w3.has('甲'), false, '落点没了就忘掉这个人');
  w3.snap('乙', '不是数组'); assert.equal(w3.has('乙'), false);
});

test('walker.clear / 摘要：切图清空，describe 出账', () => {
  const w = createWalker();
  w.to('甲', [0, 0], 0); w.to('甲', [1, 1], 0); w.to('乙', [2, 2], 0);
  assert.deepEqual(w.describe(), { walking: 1, names: ['甲', '乙'], durMs: DEFAULT_DUR_MS, reduced: false });
  assert.deepEqual(w.target('甲'), [1, 1]);
  w.clear();
  assert.deepEqual(w.describe(), { walking: 0, names: [], durMs: DEFAULT_DUR_MS, reduced: false });
  assert.equal(w.to('甲', null), false, '目标是空：不当真');
});

test('placesAt：时钟（{ day, min }）直接出落点，与 whoWhere(分钟) 同结果', () => {
  const s = normSchedule({ default: '庭院', npcs: [{ name: '甲', slots: [{ from: '08:00', to: '12:00', at: '书房' }] }] });
  assert.deepEqual(placesAt(s, { day: 3, min: 9 * 60 }), [{ name: '甲', place: '书房', source: 'routine' }]);
  assert.deepEqual(placesAt(s, { day: 3, min: 15 * 60 }), [{ name: '甲', place: '庭院', source: 'routine' }], '时段外走默认');
  assert.deepEqual(placesAt(s, { day: 3, min: 9 * 60 }, ['甲']), [], '聊天写过位置的不接管');
  assert.deepEqual(placesAt(s, { day: 3, min: 9 * 60 }), whoWhere(s, 9 * 60), '与分钟版同结果');
  assert.equal(minuteOfClock({ day: 9, min: 1500 }), 60, '分钟归一（跨天只取当天）');
  assert.deepEqual(placesAt(s, null), [{ name: '甲', place: '庭院', source: 'routine' }], '乱时钟按开局零点：走默认');
  assert.deepEqual(placesAt(null, { day: 1, min: 0 }), [], '没日程表 = 不挪人');
  assert.deepEqual(normClock({ day: -4, min: 'x' }), { day: 1, min: 0 }, '乱时钟按开局');
});

test('纯度：不碰 DOM / 存储 / 酒馆全局 / 定时器，也不反向 import 上层', () => {
  for (const f of ['walk', 'routine']) {
    const src = readFileSync(new URL(`../map/core/${f}.mjs`, import.meta.url), 'utf8').replace(/\/\/[^\n]*/g, '');
    for (const g of ['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'Mvu', 'SillyTavern', 'setInterval', 'setTimeout', 'requestAnimationFrame']) {
      assert.ok(!new RegExp(`\\b${g}\\b`).test(src), `${f}.mjs 不该出现 ${g}`);
    }
    assert.ok(!/from\s+['"]\.\./.test(src), `core/${f}.mjs 不许回引上层目录`);
  }
});
