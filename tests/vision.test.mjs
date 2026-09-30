// 视线警戒锥（Part 5-2）node 单测：扇形形状、墙截断、pointVisible 的距离 / 角度 / 遮挡判定、墙表规范化。
import test from 'node:test';
import assert from 'node:assert/strict';
import { conePolygon, pointVisible, normWalls, facingVec, patrolCones, stealthDC, crossing, GUARD_KINDS } from '../map/core/vision.mjs';

test('normWalls：两种写法、坏行丢弃', () => {
  assert.deepEqual(normWalls([[0, 0, 4, 0], { x1: 1, y1: 1, x2: 2, y2: 5 }, [1, 2], null, ['a', 'b', 'c', 'd']]),
    [[0, 0, 4, 0], [1, 1, 2, 5]]);
});

test('conePolygon：无墙 = 完整扇形（半径一致、含圆心、角数覆盖 fov）', () => {
  const pts = conePolygon({ x: 0, y: 0, facing: 90, range: 10, fov: 90 }, [], 8);
  assert.equal(pts.length, 10);   // 圆心 + 9 个弧点
  assert.deepEqual(pts[0], [0, 0]);
  const arc = pts.slice(1);
  for (const [x, y] of arc) assert.ok(Math.abs(Math.hypot(x, y) - 10) < 1e-9, '无墙时半径都是 range');
  const first = arc[0], last = arc[arc.length - 1];
  assert.ok(first[0] > 0.7 && first[1] > 0.7, 'facing 90 fov 90：起点在 45°（y 向下坐标的右下）');
  assert.ok(last[0] < -0.7 && last[1] > 0.7, '终点在 135°（左下）');
});

test('conePolygon：墙把对应方向的射线截短', () => {
  // 短墙挡在 x=5、|y|≤1：朝 0° 正中的射线被截到 5；-30° 边缘射线在 x=5 处 y=-2.9，擦墙而过 → 照常 10
  const walls = [[5, -1, 5, 1]];
  const pts = conePolygon({ x: 0, y: 0, facing: 0, range: 10, fov: 60 }, walls, 6);
  const arc = pts.slice(1);
  assert.ok(Math.abs(Math.hypot(arc[3][0], arc[3][1]) - 5) < 1e-9, '正中射线被墙截到 5');
  assert.ok(Math.abs(Math.hypot(arc[0][0], arc[0][1]) - 10) < 1e-9, '边缘射线不碰短墙');
  // 长墙：所有射线都被截到 x=5 那条线（斜距 = 5/cos(角)）
  const long = conePolygon({ x: 0, y: 0, facing: 0, range: 10, fov: 60 }, [[5, -100, 5, 100]], 6);
  for (const [x, y] of long.slice(1)) assert.ok(Math.abs(x - 5) < 1e-9, '全部贴在墙上');
});

test('pointVisible：距离、半角、遮挡三关', () => {
  const cone = { x: 0, y: 0, facing: 0, range: 10, fov: 90 };
  assert.equal(pointVisible(cone, 5, 0), true);
  assert.equal(pointVisible(cone, 11, 0), false, '超出距离');
  assert.equal(pointVisible(cone, 0, 9), false, '90° 侧向 = 恰在边界外（> half）');
  assert.equal(pointVisible(cone, 5, 4.9), true, '45° 内');
  assert.equal(pointVisible(cone, -5, 0), false, '背后');
  assert.equal(pointVisible({ ...cone, fov: 360 }, -5, 0), true, '全向 fov');
  const walls = [[3, -20, 3, 20]];
  assert.equal(pointVisible(cone, 5, 0, walls), false, '中间有墙 = 看不见');
  assert.equal(pointVisible(cone, 3, 0, walls), true, '就在墙上：算看见');
  assert.equal(pointVisible(cone, 2, 0, walls), true, '墙在身后与人之间没有：看见');
});

test('facingVec：0° 朝右、90° 朝下（地图 y 向下）', () => {
  assert.deepEqual(facingVec(0).map(v => +v.toFixed(9)), [1, 0]);
  assert.deepEqual(facingVec(90).map(v => +v.toFixed(9)), [0, 1]);
  assert.deepEqual(facingVec(450).map(v => +v.toFixed(9)), [0, 1], '角度归一');
});

// ---------------- Part 5-2 第二步：巡逻锥与潜行判定 ----------------
const RING = [{ kind: 'patrol', from: 'A', to: 'A', pts: [[.2, .2], [.8, .2], [.8, .8], [.2, .8], [.2, .2]] }];

test('patrolCones：巡逻环上按 kind 排岗，t 推进位置跟着走，非巡逻路线不产锥', () => {
  const c0 = patrolCones(RING, { t: 0 });
  assert.equal(c0.length, GUARD_KINDS.patrol.count, '一条巡逻环 = 两个岗');
  assert.equal(c0[0].id, 'A0-0');
  for (const c of c0) { assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.facing), '坐标与朝向都是可用数'); assert.equal(c.range, GUARD_KINDS.patrol.range); }
  const moved = patrolCones(RING, { t: 5 });
  assert.ok(Math.hypot(moved[0].x - c0[0].x, moved[0].y - c0[0].y) > 1e-6, '时间推进：岗哨沿环在走');
  assert.deepEqual(patrolCones([{ kind: 'lane', pts: [[0, 0], [1, 1]] }]), [], '航线不是巡逻：不出锥');
  assert.deepEqual(patrolCones([{ kind: 'patrol', pts: [[0, 0]] }]), [], '点数不够：不出锥');
  assert.equal(patrolCones(RING, { t: 0, quality: .5 }).length, 1, '省流档岗减半');
  assert.deepEqual(patrolCones(null), []);
});

test('stealthDC：越近越难躲、停下来 / 有掩体容易些、始终夹在 4–24', () => {
  const far = stealthDC({ dist: .06, range: .06 }), near = stealthDC({ dist: 0, range: .06 });
  assert.ok(near > far, '贴脸比锥边缘难躲');
  assert.equal(stealthDC({ dist: .03, range: .06, moving: false }), stealthDC({ dist: .03, range: .06 }) - 2, '站着不动 -2');
  assert.equal(stealthDC({ dist: .03, range: .06, lit: 0 }), stealthDC({ dist: .03, range: .06 }) - 4, '暗处比亮处低 4');
  assert.equal(stealthDC({ dist: .03, range: .06, cover: true }), stealthDC({ dist: .03, range: .06 }) - 4, '有掩体 -4');
  assert.equal(stealthDC({ dist: -5, range: .06, moving: true, lit: 1, base: 30 }), 24, '上界');
  assert.equal(stealthDC({ dist: 99, range: .06, moving: false, lit: 0, cover: true, base: 0 }), 4, '下界');
  assert.ok(Number.isInteger(stealthDC({ dist: .017 })), '返回整数');
});

test('crossing：走过锥心必被发现、绕远 / 背后走安全、worst 是最难的那一下', () => {
  const cones = [{ id: 'g1', name: '环城哨', x: .5, y: .5, facing: 0, range: .2, fov: 90 }];   // 朝右（+x）
  const front = crossing({ x: .3, y: .5 }, { x: .7, y: .5 }, cones, []);
  assert.equal(front.seen, true);
  assert.deepEqual(front.hits, ['g1']);
  assert.ok(front.dc >= 10, 'DC 在默认基准之上（走动着 +2、近身再加值）');
  assert.ok(Math.abs(front.worst.at[0] - .5) <= .02, '最难的一下出现在锥心附近');
  assert.equal(front.samples, 12);
  const back = crossing({ x: .5, y: .5 }, { x: .4, y: .5 }, cones, []);
  assert.equal(back.seen, false, '从背后近脸离开：不在锥里');
  const far = crossing({ x: .1, y: .9 }, { x: .15, y: .95 }, cones, []);
  assert.equal(far.seen, false, '远处不动缓冲：看不见');
  const walls = [[.6, .3, .6, .8]];
  assert.equal(crossing({ x: .5, y: .5 }, { x: .8, y: .5 }, cones, walls).worst.dist < .1, true, '墙把视野截短：只看得见近处那一下');
  assert.equal(crossing({ x: 0, y: 0 }, { x: 1, y: 1 }, [], []).samples, 12, '没有锥也要走完采样（形状仍然有效）');
  assert.deepEqual(crossing({ x: NaN, y: 0 }, { x: 1, y: 1 }, cones, []), { seen: false, hits: [], dc: 0, worst: null, samples: 0 }, '输入不成形 = 不判定');
  assert.equal(crossing({ x: .3, y: .5 }, { x: .7, y: .5 }, cones, [], { samples: 3 }).samples, 3);
});

