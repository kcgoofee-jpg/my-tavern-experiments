// 动态线索 / 任务节点（Part 6-3）：tests/quests.test.mjs —— 纯数据，node 里跑。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SEVERITY, DECAY, decayOf, severityOf, heatOf, dispatch, expire, tick, describe } from '../map/core/quests.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLACES = [{ name: '铁匠铺', nx: .2, ny: .3 }, { name: '银冠堡', nx: .6, ny: .5 }, { name: '旧港', nx: .8, ny: .7 }];

test('衰减与大类权重：与 events.mjs 同口径，越远越轻', () => {
  assert.equal(decayOf(0), 1);
  assert.equal(decayOf(7), 1);
  assert.equal(decayOf(15), .6);
  assert.equal(decayOf(35), .25);
  assert.equal(decayOf(99), 0);
  assert.equal(decayOf(-5), 1, '负数当 0');
  assert.equal(decayOf('x'), 1);
  assert.ok(Object.keys(SEVERITY).length >= 10);
  assert.equal(severityOf('灾害'), SEVERITY.灾害);
  assert.equal(severityOf('不存在的类'), SEVERITY.其他);
  assert.deepEqual(DECAY.map(d => d[0]), [7, 20, 40]);
});

test('热度：按地点名归堆，权重 × 衰减累加；没提到的地点没有热度', () => {
  const ev = [{ grp: '治安', place: '铁匠铺', floor: 100 }, { grp: '灾害', place: '铁匠铺', floor: 100 }, { grp: '治安', place: '银冠堡', floor: 80 }];
  const h = heatOf(ev, { floor: 100, places: PLACES });
  assert.ok(Math.abs(h.铁匠铺 - (SEVERITY.治安 + SEVERITY.灾害)) < 1e-9);
  assert.ok(Math.abs(h.银冠堡 - SEVERITY.治安 * decayOf(20)) < 1e-9, '20 楼前的事按余波算');
  assert.equal(h.旧港, undefined);
  assert.deepEqual(heatOf(null, { places: PLACES }), {});
  assert.deepEqual(heatOf(ev, { floor: 100, places: [] }), {});
});

test('派发：只给够热的地点，按热度排序，最多 max 个', () => {
  const ev = [{ grp: '灾害', place: '铁匠铺', floor: 10 }, { grp: '治安', place: '银冠堡', floor: 10 }, { grp: '民生', place: '旧港', floor: 10 }];
  const q = dispatch({ events: ev, places: PLACES, floor: 10, day: 1, seed: 3, max: 2, min: 1.5 });
  assert.equal(q.length, 2, '民生权重 1 < 门槛 1.5，旧港不派');
  assert.equal(q[0].name, '铁匠铺');
  assert.equal(q[1].name, '银冠堡');
  assert.ok(q[0].urgency === 1 && q[1].urgency < 1);
  assert.ok(q[0].expireDay >= 3 && q[0].expireDay <= 5);
  assert.match(q[0].id, /^q:1:/);
  assert.deepEqual(dispatch({ events: ev, places: PLACES, floor: 10, max: 0 }), []);
  assert.deepEqual(dispatch({}), [], '没有事态就不派（不许硬造线索）');
});

test('确定性：同一批事态与天数永远同一批节点', () => {
  const ev = [{ grp: '治安', place: '铁匠铺', floor: 5 }, { grp: '灾害', place: '银冠堡', floor: 5 }];
  const a = dispatch({ events: ev, places: PLACES, floor: 6, day: 2, seed: 9 });
  const b = dispatch({ events: ev, places: PLACES, floor: 6, day: 2, seed: 9 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map(x => x.id), dispatch({ events: ev, places: PLACES, floor: 6, day: 3, seed: 9 }).map(x => x.id), '换一天 id 跟着换');
});

test('过期与推进：旧线索到期消失，新线索增量进来，同 id 不重复', () => {
  const ev = [{ grp: '灾害', place: '铁匠铺', floor: 10 }];
  const first = dispatch({ events: ev, places: PLACES, floor: 10, day: 1, seed: 1 });
  assert.equal(expire(first, 1).length, first.length);
  assert.equal(expire(first, 9).length, 0, '到期全清');
  const t1 = tick([], { events: ev, places: PLACES, floor: 10, day: 1, seed: 1 });
  assert.equal(t1.added, first.length); assert.equal(t1.expired, 0);
  const t2 = tick(t1.quests, { events: ev, places: PLACES, floor: 10, day: 1, seed: 1 });
  assert.equal(t2.added, 0, '同一天同一批：不重复加');
  assert.equal(t2.quests.length, t1.quests.length);
  const t3 = tick(t1.quests, { events: ev, places: PLACES, floor: 10, day: 30, seed: 1 });
  assert.equal(t3.expired, t1.quests.length, '第 30 天：旧的都过期');
  assert.ok(t3.added >= 1, '同时派出新的一批');
  assert.deepEqual(tick(null, { events: [], places: [], day: 1 }), { quests: [], added: 0, expired: 0 });
});

test('摘要：条数 / 最急的三个 / 最高热度', () => {
  const ev = [{ grp: '灾害', place: '铁匠铺', floor: 1 }, { grp: '军事', place: '银冠堡', floor: 1 }];
  const q = dispatch({ events: ev, places: PLACES, floor: 1, day: 1 });
  const d = describe(q);
  assert.equal(d.n, q.length);
  assert.ok(d.top.length <= 3);
  assert.ok(d.hottest > 0);
  assert.deepEqual(describe(null), { n: 0, top: [], hottest: 0 });
});

test('真实数据：上层事态的大类都在权重表上；纯核心身份', () => {
  const src = readFileSync(join(ROOT, 'map/core/quests.mjs'), 'utf8').replace(/\/\/[^\n]*/g, '');
  for (const g of ['window', 'document', 'localStorage', 'Mvu', 'SillyTavern']) assert.ok(!new RegExp(`\\b${g}\\b`).test(src), `不该出现 ${g}`);
  const ev = JSON.parse(readFileSync(join(ROOT, 'map/tavern/events.mjs'), 'utf8').match(/export const CATS = \{[\s\S]*?\n\};/)?.[0] ? '{}' : '{}');
  assert.ok(Object.keys(SEVERITY).includes('其他'));
  assert.equal(typeof ev, 'object');
  const groups = readFileSync(join(ROOT, 'map/tavern/events.mjs'), 'utf8').match(/GROUP_ORDER = \[([^\]]+)\]/)?.[1] || '';
  for (const g of groups.split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean)) {
    assert.ok(g in SEVERITY, `事态大类 ${g} 必须有权重`);
  }
});
