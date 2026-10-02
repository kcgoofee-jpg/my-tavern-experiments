// 地面的陡面处理（挡土墙 / 岩壁）：地面贴图是俯视烘焙，竖直面上会被拉成条纹 → 把陡面拆出来，改用按世界坐标平铺的石砌材质。主页面只调 splitWalls(mesh, 上下文)。
function stoneTex(THREE, renderer) {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  g.fillStyle = '#8f877a'; g.fillRect(0, 0, N, N);   // 灰缝
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rows = 8, rh = N / rows;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -rh * 0.9 : 0;
    while (x < N) {
      const w = rh * (1.3 + rnd() * 1.1), l = 150 + rnd() * 34 | 0;
      g.fillStyle = `rgb(${l + 14},${l + 8},${l - 4})`;
      for (const dx of [0, -N, N]) g.fillRect(x + dx + 1.5, r * rh + 1.5, w - 3, rh - 3);
      x += w;
    }
  }
  const im = g.getImageData(0, 0, N, N), d = im.data;   // 细颗粒
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 22; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t;
}
export function splitWalls(o, { THREE, renderer, scene, STAT, SITE_EXTRA }) {
  const g = o.geometry, pos = g.attributes.position, idx = g.index, uvA = g.attributes.uv; if (!idx || !uvA) return;
  const ground = o.name.startsWith('ground'), rock = o.name.startsWith('rock'), u0 = new THREE.Vector2(), u1 = new THREE.Vector2(), u2 = new THREE.Vector2();
  o.updateWorldMatrix(true, false);
  // 岩体：外圈悬崖保留岩石贴图；岛内台地之间的挡土墙（离外缘远）才换石砌。按 72 个方位记外缘半径
  const NB = 72, rim = new Float32Array(NB), _w = new THREE.Vector3(), bin = (x, z) => ((Math.floor((Math.atan2(z, x) + Math.PI) / (2 * Math.PI) * NB) % NB) + NB) % NB;
  if (rock) for (let i = 0; i < pos.count; i++) { _w.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); const k = bin(_w.x, _w.z); rim[k] = Math.max(rim[k], Math.hypot(_w.x, _w.z)); }
  const keep = [], wall = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < idx.count; i += 3) {
    const i0 = idx.getX(i), i1 = idx.getX(i + 1), i2 = idx.getX(i + 2);
    a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld); b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld); c.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
    n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    const h = Math.max(a.y, b.y, c.y) - Math.min(a.y, b.y, c.y);
    let bad = ground;
    if (rock) { const cx = (a.x + b.x + c.x) / 3, cz = (a.z + b.z + c.z) / 3; bad = Math.hypot(cx, cz) < rim[bin(cx, cz)] - 45; }
    else if (!ground && Math.abs(n.y) < 0.42 && h > 0.4) {   // 分区烘焙：贴图坐标在竖直方向被压扁（条纹）的竖直面才换
      u0.fromBufferAttribute(uvA, i0); u1.fromBufferAttribute(uvA, i1); u2.fromBufferAttribute(uvA, i2);
      const e1 = b.clone().sub(a), e2 = c.clone().sub(a), f1 = u1.clone().sub(u0), f2 = u2.clone().sub(u0);
      const det = f1.x * f2.y - f1.y * f2.x;
      if (Math.abs(det) < 1e-12) bad = true;
      else { const T = e1.clone().multiplyScalar(f2.y).addScaledVector(e2, -f1.y).divideScalar(det), Bt = e2.clone().multiplyScalar(f1.x).addScaledVector(e1, -f2.x).divideScalar(det);
        const lt = T.length(), lb = Bt.length(); bad = Math.min(lt, lb) / Math.max(lt, lb) < 0.12; }
    }
    if (bad && Math.abs(n.y) < 0.42 && h > 0.25 && a.y > 8) wall.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); else keep.push(i0, i1, i2);   // a.y > 8：岛体侧面（岩壁）不动
  }
  if (!wall.length) return;
  g.setIndex(keep);
  const wg = new THREE.BufferGeometry(), P = new Float32Array(wall), uv = new Float32Array(P.length / 3 * 2), col = new Float32Array(P.length);
  const sun = new THREE.Vector3(-0.55, 0.5, 0.45).normalize(), S = 1 / 3.2;   // 一块石纹贴图 = 3.2 m
  for (let t = 0; t < P.length; t += 9) {
    a.fromArray(P, t); b.fromArray(P, t + 3); c.fromArray(P, t + 6); n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    const alongX = Math.abs(n.x) < Math.abs(n.z), k = 0.62 + 0.38 * Math.max(0, n.dot(sun));
    for (let v = 0; v < 3; v++) { const j = t + v * 3, q = j / 3 * 2; uv[q] = (alongX ? P[j] : P[j + 2]) * S; uv[q + 1] = P[j + 1] * S; col[j] = col[j + 1] = col[j + 2] = k; }
  }
  wg.setAttribute('position', new THREE.BufferAttribute(P, 3)); wg.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); wg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const wm = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ map: stoneTex(THREE, renderer), vertexColors: true, side: THREE.DoubleSide }));
  wm.name = 'ground_walls'; o.userData.walls = wm; STAT.walls = (STAT.walls || 0) + wall.length / 9;
  scene.add(wm);   // 顶点已换到世界坐标
  SITE_EXTRA.push(wm);
}

