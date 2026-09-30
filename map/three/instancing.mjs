// Part 3 §4：静态网格的 GPU 实例化（同几何 + 同材质 → 一个 InstancedMesh，一次 draw call）。
// 为什么只合静态件：热点（可点）、墙体、取景框、剖切面、__edges 的来源网格都要保留自己的世界矩阵与名字
// （拾取、X 光、剖切高度、轮廓线都按单个 mesh 走），合了就找不回来 —— 所以排除集是强制的、由调用方给。
// 每个批次带一个 index map：instanceId → 原 mesh（射线命中的时候能还原成「点到了谁」）。
// 本模块不 import three：THREE 由调用方传进来（可在 node 里用假 THREE 直接测）。

const sig = m => `${m?.geometry?.uuid || m?.geometryId || ''}|${m?.material?.uuid || m?.materialId || ''}`;

/**
 * batch({ THREE, meshes, groupBy, exclude })
 *   meshes  ：候选网格（传 mesh 或 { mesh, matrix } 也行）
 *   groupBy ：自定义分组键（缺省 = 几何 + 材质）
 *   exclude ：Set / 函数，命中的一律不合（热点、墙体、取景框、__edges 来源）
 * 返回 { groups: [{ key, mesh: InstancedMesh, ids, count }], parent, unbatch() }
 */
export function batch({ THREE, meshes = [], groupBy, exclude, name = 'instanced' } = {}) {
  if (!THREE || typeof THREE.InstancedMesh !== 'function') return { groups: [], parent: null, unbatch: () => 0 };
  const isOut = m => (typeof exclude === 'function' ? exclude(m) : exclude?.has?.(m)) === true;
  const kept = [];
  const buckets = new Map();
  for (const raw of meshes) {
    const mesh = raw?.isMesh ? raw : raw?.isObject3D ? raw : raw?.mesh;   // 直接传 mesh，或 { mesh, matrix }
    if (!mesh || !mesh.isMesh || mesh.isInstancedMesh) continue;
    if (isOut(mesh)) continue;
    const key = typeof groupBy === 'function' ? groupBy(mesh) : sig(mesh);
    if (!key) continue;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ mesh, matrix: raw?.matrix || null });
  }
  const parent = new THREE.Group(); parent.name = name;
  const groups = [];
  for (const [key, list] of buckets) {
    if (list.length < 2) { kept.push(...list.map(x => x.mesh)); continue; }   // 只有一件，合了没意义
    const first = list[0].mesh;
    const im = new THREE.InstancedMesh(first.geometry, first.material, list.length);
    im.name = `${name}:${key}`;
    im.frustumCulled = true;
    const m4 = new THREE.Matrix4();
    const ids = [];
    list.forEach((it, i) => {
      if (it.matrix) m4.copy(it.matrix);
      else { it.mesh.updateWorldMatrix?.(true, false); m4.copy(it.mesh.matrixWorld || it.mesh.matrix || m4); }   // 没有 matrixWorld 时退回本地矩阵，不写 undefined
      im.setMatrixAt(i, m4);
      ids.push(it.mesh.name || it.mesh.uuid);
      it.mesh.visible = false;   // 原件留着（拾取 / 调试），不参与渲染
      kept.push(it.mesh);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere?.();
    im.userData.instanceIds = ids;
    parent.add(im);
    groups.push({ key, mesh: im, ids, count: list.length });
  }
  return {
    groups: groups.sort((a, b) => b.count - a.count),
    parent,
    /** 还原：把 InstancedMesh 摘掉、原件恢复可见（换模型 / 切档位时调用） */
    unbatch() {
      for (const g of groups) {
        g.mesh.parent?.remove(g.mesh);
        try { g.mesh.dispose?.(); } catch (e) {}
      }
      for (const m of kept) m.visible = true;
      groups.length = 0;
      return kept.length;
    },
  };
}

/** 射线命中 InstancedMesh 后：instanceId → 原网格名 / id（热点卡片、高亮都靠它还原） */
export function resolveInstance(group, instanceId) {
  const ids = group?.mesh?.userData?.instanceIds || group?.userData?.instanceIds;
  return ids ? (ids[instanceId] ?? null) : null;
}

/**
 * 静态实例的 matrix buffer 写入：矩阵可以来自后台线程（dzi-worker 的 matrices 作业）或主线程。
 * items = [{ tx, ty, tz, rx?, ry?, rz?, s? }]，flat = Float32Array（列主序，每项 16 float）。
 */
export function writeMatrices({ THREE, mesh, items, flat, withWorker } = {}) {
  if (!mesh?.isInstancedMesh) return 0;
  const n = Math.min(mesh.count, withWorker ? (flat ? flat.length / 16 : 0) : items.length);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    if (withWorker && flat) m4.fromArray(flat, i * 16);
    else {
      const it = items[i] || {};
      m4.compose(
        new THREE.Vector3(it.tx || 0, it.ty || 0, it.tz || 0),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(it.rx || 0, it.ry || 0, it.rz || 0, 'YXZ')),
        new THREE.Vector3(it.s ?? 1, it.s ?? 1, it.s ?? 1),
      );
    }
    mesh.setMatrixAt(i, m4);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere?.();   // 矩阵变了，包围体要跟着变，否则剔除会算错
  return n;
}
