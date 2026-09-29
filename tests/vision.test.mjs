// 视线警戒锥（Part 5-2）node 单测：扇形形状、墙截断、pointVisible 的距离 / 角度 / 遮挡判定、墙表规范化。
import test from 'node:test';
import assert from 'node:assert/strict';
import { conePolygon, pointVisible, normWalls, facingVec } from '../map/core/vision.mjs';

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
