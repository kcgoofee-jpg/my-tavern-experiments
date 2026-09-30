// Part 3 §4：视锥体裁剪与包围体（三维页共用）。
// Three 的 frustumCulled 默认就是 true，但两处会把它作废：
//   1) 静态矩阵（matrixAutoUpdate = false）写完之后不重算包围球 → 包围体还是原点附近那一个，远处的大件会被误剔或永不剔除；
//   2) InstancedMesh 填完 matrix 之后不重算 → 整个批次按初始（空）的包围体算。
// 所以这里统一：显式打开 frustumCulled + 需要时重算包围体。本模块不 import three（调用方传 THREE），可在 node 里直接测。

/** 几何的包围球半径（用包围盒的半对角线，够用且不会低估；instanced 的由调用方另算） */
export function sphereOf(box) {
  if (!box || !box.min || !box.max) return null;
  const dx = box.max.x - box.min.x, dy = box.max.y - box.min.y, dz = box.max.z - box.min.z;
  const c = { x: (box.max.x + box.min.x) / 2, y: (box.max.y + box.min.y) / 2, z: (box.max.z + box.min.z) / 2 };
  return { center: c, radius: Math.max(1e-6, Math.sqrt(dx * dx + dy * dy + dz * dz) / 2) };
}

/** 合并若干包围球（批次 / 组的整体包围体） */
export function unionSpheres(list) {
  const s = list.filter(Boolean);
  if (!s.length) return null;
  let cx = 0, cy = 0, cz = 0;
  for (const p of s) { cx += p.center.x; cy += p.center.y; cz += p.center.z; }
  cx /= s.length; cy /= s.length; cz /= s.length;
  let r = 0;
  for (const p of s) r = Math.max(r, Math.hypot(p.center.x - cx, p.center.y - cy, p.center.z - cz) + p.radius);
  return { center: { x: cx, y: cy, z: cz }, radius: Math.max(1e-6, r) };
}

/**
 * 给一棵子树（或整个场景）打开视锥体裁剪并重算包围体。
 *   { THREE, root, instanced } → { objects, culled, instanced, recomputed }
 * 只做「打开 + 重算」，不替 Three 决定渲染顺序；visible = false 的对象不动（调用方自己管显隐）。
 */
export function prepare({ THREE, root, instanced = [] } = {}) {
  const out = { objects: 0, culled: 0, instanced: 0, recomputed: 0 };
  if (!root || !THREE) return out;
  const touch = o => {
    o.frustumCulled = true; out.objects++;
    if (o.frustumCulled) out.culled++;
    if (o.isInstancedMesh) {
      o.computeBoundingSphere?.(); out.instanced++; out.recomputed++;
      return;
    }
    const g = o.geometry;
    if (!g) return;
    if (typeof g.computeBoundingBox === 'function' && (!g.boundingBox)) { g.computeBoundingBox(); out.recomputed++; }
    if (typeof g.computeBoundingSphere === 'function' && (!g.boundingSphere)) { g.computeBoundingSphere(); out.recomputed++; }
    // 静态矩阵写完之后：按新的世界矩阵重算一次（matrixWorldNeedsUpdate 的情况也一并处理）
    if (o.matrixAutoUpdate === false) {
      o.updateWorldMatrix?.(true, false);
      if (g.boundingBox && typeof g.boundingBox.clone === 'function') {
        const b = g.boundingBox.clone().applyMatrix4(o.matrixWorld);
        const s = sphereOf(b);
        if (s) { g.boundingSphere = g.boundingSphere || {}; g.boundingSphere.center?.copy?.(s.center); g.boundingSphere.radius = s.radius; out.recomputed++; }
      }
    }
  };
  root.traverse?.(touch);
  for (const im of instanced) touch(im);
  return out;
}

/**
 * 相机距离口径（给 LOD 用）：透视相机用真实距离，正交相机（庄园）没有真实距离，
 * 用「视野半宽 / 模型尺寸」折算出一个等效倍数，让两套相机共用同一套档位。
 */
export function distanceMetric({ camera, target, size, viewportWidth = 1, viewportHeight = 1 } = {}) {
  const s = Math.max(1e-6, size || 1);
  if (camera?.isOrthographicCamera) {
    const halfH = Math.abs((camera.top - camera.bottom) / (camera.zoom || 1)) / 2;
    const halfW = halfH * (viewportWidth / Math.max(1, viewportHeight));
    return (Math.max(halfW, halfH) * 2) / s;
  }
  const d = camera?.position && target ? Math.hypot(camera.position.x - target.x, camera.position.y - target.y, camera.position.z - target.z) : 0;
  return d / s;
}
