// N12：near / far 贴合场景的纯计算（map/three/depth-fit.mjs）。深度缓冲分辨率 ≈ (far − near) / 2^位数，所以 far − near 要贴着场景收。
import test from 'node:test';
import assert from 'node:assert/strict';
import { fitNearFar, applyNearFar, depthBits, depthLabel, sphereOfBox } from '../map/three/depth-fit.mjs';

const C = { x: 0, y: 30, z: 0 };

test('正交：近 / 远平面夹住包围球（距离 ± 半径 × pad ± margin），range 远小于 5000', () => {
  const f = fitNearFar({ center: C, radius: 300, eye: { x: 0, y: 30 + 1600, z: 0 }, kind: 'ortho' });
  assert.ok(f.near > 1000 && f.near < 1600 - 300, `near ${f.near}`);
  assert.ok(f.far > 1600 + 300 && f.far < 2200, `far ${f.far}`);
  assert.ok(f.far - f.near < 1100, 'range 收到 ≈ 球的直径');
  assert.equal(Math.round(f.dist), 1600);
});

test('正交：相机在球里面时 near 不低于 minNear（不出现负 / 零 near）', () => {
  const f = fitNearFar({ center: C, radius: 300, eye: { x: 10, y: 40, z: 0 }, kind: 'ortho', minNear: 0.1 });
  assert.equal(f.near, 0.1);
  assert.ok(f.far > 300);
});

test('透视：near 同时受 far / maxRatio 约束（比值才是精度的决定因素）', () => {
  const f = fitNearFar({ center: C, radius: 200, eye: { x: 0, y: 30, z: 1 }, kind: 'persp', minNear: 0.1, maxRatio: 2000 });
  assert.ok(f.far / f.near <= 2000 + 1e-9, `ratio ${f.far / f.near}`);
  assert.ok(f.near >= 0.1);
  const g = fitNearFar({ center: C, radius: 200, eye: { x: 0, y: 30, z: 1 }, kind: 'persp', minNear: 0.25 });
  assert.ok(g.near >= 0.25);
});

test('farExtra：缩得很远时远侧放宽（云海要看到更深），近侧不变', () => {
  const a = fitNearFar({ center: C, radius: 300, eye: { x: 0, y: 1630, z: 0 }, kind: 'ortho' });
  const b = fitNearFar({ center: C, radius: 300, eye: { x: 0, y: 1630, z: 0 }, kind: 'ortho', farExtra: 2000 });
  assert.equal(a.near, b.near);
  assert.ok(b.far > a.far);
  assert.ok(b.far >= 1600 + 2000);
});

test('随相机距离走：拉远 / 拉近都跟得上（缩放 / 视角 / 平移每帧重算的前提）', () => {
  const near = fitNearFar({ center: C, radius: 300, eye: { x: 0, y: 30 + 1200, z: 0 }, kind: 'ortho' });
  const far = fitNearFar({ center: C, radius: 300, eye: { x: 0, y: 30 + 2400, z: 0 }, kind: 'ortho' });
  assert.ok(far.near - near.near > 1100 && far.far - near.far > 1100);
});

test('applyNearFar：变化小于 tol 不动投影；变了才 updateProjectionMatrix', () => {
  let upd = 0;
  const cam = { near: 1000, far: 2000, updateProjectionMatrix() { upd++; } };
  assert.equal(applyNearFar(cam, { near: 1000.2, far: 2000.3 }), false);
  assert.equal(upd, 0);
  assert.equal(applyNearFar(cam, { near: 1100, far: 2100 }), true);
  assert.deepEqual([cam.near, cam.far, upd], [1100, 2100, 1]);
  assert.equal(applyNearFar(cam, null), false);
  assert.equal(applyNearFar(cam, { near: 5, far: 5 }), false, 'far <= near 的坏输入不套');
});

test('depthBits / depthLabel：读 gl.DEPTH_BITS / STENCIL_BITS；拿不到上下文不抛', () => {
  const gl = { DEPTH_BITS: 'D', STENCIL_BITS: 'S', getParameter: (k) => (k === 'D' ? 24 : 8) };
  assert.deepEqual(depthBits(gl), { depth: 24, stencil: 8 });
  assert.equal(depthLabel(gl), 'z24+s8');
  assert.equal(depthLabel({ DEPTH_BITS: 'D', STENCIL_BITS: 'S', getParameter: (k) => (k === 'D' ? 16 : 0) }), 'z16');
  assert.equal(depthBits(null), null);
  assert.equal(depthLabel(null), 'z?');
  assert.equal(depthBits({ getParameter() { throw new Error('x'); } }), null);
});

test('sphereOfBox：包围盒 → 球心 + 外接半径', () => {
  const s = sphereOfBox({ min: { x: -10, y: 0, z: -10 }, max: { x: 10, y: 20, z: 10 } });
  assert.deepEqual(s.center, { x: 0, y: 10, z: 0 });
  assert.ok(Math.abs(s.radius - Math.hypot(20, 20, 20) / 2) < 1e-9);
});
