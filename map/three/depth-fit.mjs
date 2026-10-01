// N12：深度缓冲取景（near / far 贴合场景包围球）+ 深度位数读数。纯计算，不 import three（相机、gl 由调用方传进来；本模块可在 node 里直接测）。
// 为什么：深度缓冲的分辨率 ≈ (far − near) / 2^位数。near 1 / far 5000 的正交相机在 16 位深度（WebKit 在没有 stencil 时的实现）上只有 ≈ 8 cm，
// 共面 / 近共面的面（楼板层、剖切封口）就会在帧与帧之间互换胜负。把 far − near 收到场景那么大，再配 24 位深度，分辨率落到亚毫米。

/**
 * 按包围球 + 相机位置算 near / far。
 * fitNearFar({ center, radius, eye, kind = 'ortho' | 'persp', pad = 1.05, margin = 2, minNear = 0.1, maxRatio = 2000, farExtra = 0 })
 *  - 近侧留 radius * pad + margin，远侧留 max(radius * pad + margin, farExtra)（farExtra：背景远景需要的深度，例如缩得很远时的云海）。
 *  - persp：near 不小于 minNear，且 far / near ≤ maxRatio（透视深度非线性，比值才是精度的决定因素）。
 *  - ortho：near 不小于 minNear（正交深度线性，near 越大越好，但不能把球切掉）。
 */
export function fitNearFar({ center, radius, eye, kind = 'ortho', pad = 1.05, margin = 2, minNear = 0.1, maxRatio = 2000, farExtra = 0 } = {}) {
  const dx = eye.x - center.x, dy = eye.y - center.y, dz = eye.z - center.z;
  const dist = Math.hypot(dx, dy, dz);
  const rn = Math.max(0, radius) * pad + margin, rf = Math.max(rn, farExtra);
  let near = Math.max(minNear, dist - rn);
  const far = Math.max(near + 1, dist + rf);
  if (kind === 'persp') near = Math.max(near, far / maxRatio);
  return { near, far, dist };
}

/** 套到相机上：near / far 变化超过 tol（米）才改并 updateProjectionMatrix（避免每帧重算投影；tol 小于 fit 里的 margin，滞后不会切掉模型）。返回是否改了 */
export function applyNearFar(camera, fit, tol = 0.5) {
  if (!fit || !(fit.far > fit.near)) return false;
  if (Math.abs(camera.near - fit.near) <= tol && Math.abs(camera.far - fit.far) <= tol) return false;
  camera.near = fit.near; camera.far = fit.far; camera.updateProjectionMatrix();
  return true;
}

/** 深度 / 模板位数（拿不到上下文就返回 null）。调试叠层和探针用：WebKit 没有 stencil 时只有 16 位深度。 */
export function depthBits(gl) {
  try { return gl ? { depth: gl.getParameter(gl.DEPTH_BITS), stencil: gl.getParameter(gl.STENCIL_BITS) } : null; } catch (e) { return null; }
}
export const depthLabel = (gl) => { const b = depthBits(gl); return b ? `z${b.depth}${b.stencil ? '+s' + b.stencil : ''}` : 'z?'; };

/** 包围球（球心 + 半径）：给 { min, max }（Box3 形状）就够了 */
export function sphereOfBox(box) {
  const c = { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2, z: (box.min.z + box.max.z) / 2 };
  return { center: c, radius: Math.hypot(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) / 2 };
}
