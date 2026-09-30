// 车流 / 悬浮流光（Part 4-3）：tests/traffic.test.mjs —— 纯几何，node 里跑。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LANE_KINDS, kindOf, pathMetrics, along, carsFor, trafficField, trailOf, describe } from '../map/core/traffic.mjs';
import { rng, seedOf } from '../map/core/rng.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROUTE = { kind: 'lane', from: 'a', to: 'b', pts: [[.1, .1], [.4, .1], [.4, .5]] };   // 总长 0.7

test('折线度量：段长与累计弧长，点数不足返回 null', () => {
  const m = pathMetrics(ROUTE.pts);
  assert.equal(m.segs.length, 2);
  assert.ok(Math.abs(m.total - .7) < 1e-9);
  assert.equal(pathMetrics([[0, 0]]), null);
  assert.equal(pathMetrics(null), null);
  assert.equal(pathMetrics([[0, 0], ['x', 1], [1, 1]]), null, '脏点直接整条不画');
});

test('弧长 → 坐标：端点、中点、回绕都对', () => {
  const m = pathMetrics(ROUTE.pts);
  const a = along(m, 0); assert.ok(Math.abs(a.nx - .1) < 1e-9 && Math.abs(a.ny - .1) < 1e-9);
  const b = along(m, .3); assert.ok(Math.abs(b.nx - .4) < 1e-9 && Math.abs(b.ny - .1) < 1e-9, '横向段末端');
  const c = along(m, .5); assert.ok(Math.abs(c.ny - .3) < 1e-9, '竖直段中点');
  assert.deepEqual(along(m, m.total + .1), along(m, .1), '走满一圈回绕');
  assert.equal(along(null, 1), null);
});

test('车数：按路长 × 密度 × 画质，封顶 40，画质 0 就是没车', () => {
  assert.equal(carsFor(ROUTE, { quality: 1 }), Math.round(.7 * LANE_KINDS.lane.density));
  assert.equal(carsFor(ROUTE, { quality: .5 }), Math.round(.7 * LANE_KINDS.lane.density * .5));
  assert.equal(carsFor(ROUTE, { quality: 0 }), 0);
  const long = { kind: 'lane', pts: Array.from({ length: 50 }, (_, i) => [i / 50, (i % 3) / 10]) };
  assert.equal(carsFor(long), 40, '长路也要封顶');
  assert.equal(carsFor({ kind: 'patrol', pts: [[0, 0], [1, 1]] }), Math.round(Math.SQRT2 * LANE_KINDS.patrol.density));
});

test('一帧车流：确定性、坐标在包围盒内、夜间更亮、总数封顶', () => {
  const a = trafficField([ROUTE], { t: 3, seed: 5, quality: 1 });
  const b = trafficField([ROUTE], { t: 3, seed: 5, quality: 1 });
  assert.deepEqual(a, b, '同一 (路线, 时间, 种子) 必须逐点一致');
  assert.ok(a.length > 0);
  for (const c of a) {
    assert.ok(c.nx >= .1 - 1e-9 && c.nx <= .4 + 1e-9, `nx 越界 ${c.nx}`);
    assert.ok(c.ny >= .1 - 1e-9 && c.ny <= .5 + 1e-9, `ny 越界 ${c.ny}`);
    assert.ok(c.alpha > 0 && c.alpha <= 1 && c.size > 0);
  }
  const night = trafficField([ROUTE], { t: 3, seed: 5 });
  assert.ok(night[0].alpha < trafficField([ROUTE], { t: 3, seed: 5, night: true })[0].alpha, '夜里更亮');
  const many = Array.from({ length: 40 }, () => ROUTE);
  assert.ok(trafficField(many, { t: 0, seed: 1 }).length <= 300, '总车数封顶');
  assert.deepEqual(trafficField(null), []);
});

test('尾迹：沿路线往回退，退过头回绕到另一端', () => {
  const m = pathMetrics(ROUTE.pts);
  const p = trailOf(m, .2, .1);
  assert.ok(Math.abs(p.nx - .2) < 1e-9, '直线段上退 0.1 就是 0.2');
  assert.ok(trailOf(m, .05, .2), '退过起点回绕也不返回 null');
});

test('describe 摘要：路线数 / 车数 / 按类型计数', () => {
  const d = describe([ROUTE, { kind: 'patrol_city', pts: [[0, 0], [.5, .5]] }], { t: 0, seed: 1 });
  assert.equal(d.routes, 2);
  assert.deepEqual(d.byKind, { lane: 1, patrol_city: 1 });
  assert.ok(d.cars > 0);
  assert.deepEqual(describe([]), { routes: 0, cars: 0, byKind: {} });
});

test('共用 rng：确定性 + 字符串种子可混（势力暗流要用）', async () => {
  const r = rng(9), s = rng(9);
  for (let i = 0; i < 10; i++) { const v = r(); assert.equal(v, s()); assert.ok(v >= 0 && v < 1); }
  assert.equal(seedOf('oren', 3), seedOf('oren', 3));
  assert.notEqual(seedOf('oren', 3), seedOf('oren', 4));
  const w = await import('../map/core/weather.mjs');
  assert.equal(w.rng(9)(), rng(9)(), 'weather 与 traffic 用的是同一份实现');
});

test('真实数据：上层路线都是归一化坐标，度量算得出来', () => {
  const j = JSON.parse(readFileSync(join(ROOT, 'map/data/tc_upper.json'), 'utf8'));
  const rs = j.routes || [];
  assert.ok(rs.length >= 2, '至少有航线与巡逻环各一条');
  for (const r of rs) {
    assert.ok(['lane', 'patrol', 'patrol_city'].includes(r.kind), `未知路线类型 ${r.kind}`);
    for (const [x, y] of r.pts) { assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1, `坐标越界 ${x},${y}`); }
    assert.ok(pathMetrics(r.pts).total > 0);
    assert.ok(kindOf(r.kind).speed > 0);
  }
});
