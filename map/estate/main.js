// 伊甸庄园 · 网页三维（estate2 r4 整岛 + round-3 主楼分层）：模型加载、外观 / 内透 / 剖切、楼层条、房间与室外热点、房间卡、缩放交互、嵌入协议（说明见 index.html 顶部注释）
// 模型：model/site.glb（整岛外观，烘焙光照，blender/estate2/export_web.py）+ model/house.glb（主楼室内体量 B2–F3，blender/estate2/house_web.py，进内透 / 剖切时才加载）。
// 房间数据：../data/eden_estate_rooms.json（floorplans.py 生成的精确多边形）；室外热点：model/zones.json（web_zones.py）。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { openGallery } from '../ui/gallery.js';

const T0 = performance.now();
const Q = new URLSearchParams(location.search);
const IN_FRAME = window.parent !== window;
const EMBED = Q.get('embed') === '1' || location.protocol === 'about:' || location.protocol === 'blob:';
const STATS = Q.get('stats') === '1';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = matchMedia('(pointer: coarse)').matches;
const LS = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
let LANG = (Q.get('lang') || LS('edenMapLang') || 'zh').startsWith('en') ? 'en' : 'zh';
let THEME = Q.get('theme') === 'light' ? 'light' : 'dark';
document.body.classList.toggle('embed', EMBED);
document.documentElement.dataset.theme = THEME;
const $ = (s) => document.querySelector(s);
const app = $('#app');
const url = (p) => new URL(p, document.baseURI).href;   // 查看器用 blob + <base> 载入本页：相对地址按 <base> 解析
const kick = (phase) => { try { window.__estateKick && window.__estateKick(phase); } catch (e) { } };
const clamp = THREE.MathUtils.clamp;
let needs = true;

/* ---------------- 档位：低档 = 省流 / 慢网 / 内存 ≤ 4 GB（地图「省流」档 edenMapTierV2 = save 也算）；新款手机（iPhone 不报内存、安卓 ≥ 6 GB）走标准档 ---------------- */
const qTier = Q.get('tier');
const conn = navigator.connection || {};
const LOW = qTier != null ? /^(1|2|low|save)$/.test(qTier)
  : (LS('edenMapTierV2') === 'save' || !!conn.saveData || /(^|-)(2g|3g)$/.test(conn.effectiveType || '') || (navigator.deviceMemory || 8) <= 4);
const tier = LOW ? 1 : 0;
let DPR = Math.min(window.devicePixelRatio || 1, 2);   // 手机也用 2（原先低档 1.5 + 关抗锯齿，边缘锯齿、贴图发糊）；持续帧率 < 30 再降到 1.5（见 loop）
let lowRes = false;

/* ---------------- 渲染器（烘焙光照：MeshBasic，无色调映射；室内体量用 Lambert + 两盏灯） ---------------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(DPR); renderer.setSize(innerWidth, innerHeight); renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping; renderer.localClippingEnabled = true;
app.prepend(renderer.domElement);
const labelR = new CSS2DRenderer({ element: $('#labels') }); labelR.setSize(innerWidth, innerHeight);
document.body.classList.add('grade');
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight('#f4efe6', '#8a8070', 2.2));
const sunL = new THREE.DirectionalLight('#fff1dc', 1.6); sunL.position.set(-0.55, 1, 0.45); scene.add(sunL);

/* ---------------- 数据 ---------------- */
kick('data');
const [MAN, CARD, ZDATA] = await Promise.all([
  fetch(url('model/manifest.json')).then((r) => r.json()),
  fetch(url('../data/eden_estate_rooms.json')).then((r) => r.json()),
  fetch(url('model/zones.json')).then((r) => r.json()).catch(() => ({ zones: [] })),
]);
const F1Y = MAN.f1_z ?? 30;                                  // F1 地坪的世界标高（layout z）
const FLOORS = CARD.floors.map((f) => ({ ...f, y: F1Y + f.z }));   // B2, B1, F1, F2, F3
const FI = Object.fromEntries(FLOORS.map((f, i) => [f.id, i]));
const FLOOR_EN = { B2: 'Basement 2', B1: 'Basement 1', F1: 'Ground floor', F2: 'First floor', F3: 'Second floor' };
const CUT = 1.5;                                             // 剖切高度（楼面以上）
const V = (x, y, z) => new THREE.Vector3(x, z, -y);          // layout (x 东, y 北, z 上) → three
// 庄园页搜索用的英文名（房间名本身和卡里的其他写法在数据的 name / words 里；仓库以前自编的旧名只经 retired_names 解析，不再列出）
const ALIAS = {
  '主人主卧': ['Master Bedroom', 'Dressing Room'], '大厅': ['Grand Hall', 'Entrance Hall'], '会客厅': ['Drawing Room'], '餐厅': ['Dining Room'],
  '厨房与后勤区': ['Kitchen'], '主人书房': ['Library', 'Study'], '女仆长寝室': ["Head Maid's Room"], '客房': ['Guest Room'], '个人寝室': ['Bedroom'],
  '三楼公共浴室': ['Bathroom'], '恒温酒窖': ['Wine Cellar'], '衣物清洗与维护间': ['Laundry'], '东侧长廊': ['Gallery'], '体能训练室': ['Gym'],
  '主人通道': ['主人专用通道'], '储藏室': ['Storeroom'],
};
const GALLERY = { '主人主卧': 'wardrobe', '衣帽间': 'wardrobe' };   // 房间图集（map/data/room_galleries.json）：卡把步入式衣帽间放在主卧套间里
// 主卧套间内的子区域（卡：主卧「带衣帽间和独立浴室」，主人通道 F2 开进衣帽间）：单独做一个可点的热点，点开就是衣帽间图集
const SUBS = [{ parent: 'F2-57', id: 'F2-57w', name: '衣帽间', en: 'Walk-in Wardrobe', alias: ['私人衣帽间', '步入式衣帽间', '更衣室', 'Dressing Room', 'Walk-in Wardrobe'], floor: 'F2', kind: 'card', sub: true,
  note: '主卧套间内的步入式衣帽间；东侧门通主人专用通道', poly: [[12, -10], [16, -10], [16, -6], [12, -6]] }];
const KIND_COL = { card: '#d9c29a', restricted: '#9d9a94', support: '#aab3bb', circ: '#e9e4d8', owner: '#a79bb6', inferred: '#c8cfbd', open: '#c8cfbd' };

/* ---------------- 相机与控制（正交；缩放以光标为中心） ---------------- */
const BASE = 60, DIST = 1600;
const camera = new THREE.OrthographicCamera(-BASE, BASE, BASE, -BASE, 1, 5000);
let minZoom = 0.05, maxZoom = 20;
const barBox = () => { const bar = $('#floors'); if (!bar || !bar.offsetWidth) return null; const r = bar.getBoundingClientRect(); return { r, horiz: r.width > r.height }; };
function frustum() {
  const a = innerWidth / innerHeight; camera.left = -BASE * a; camera.right = BASE * a; camera.top = BASE; camera.bottom = -BASE; camera.updateProjectionMatrix();
  minZoom = Math.min(2 * BASE * a / 1400, 2 * BASE / 1100); maxZoom = 2 * BASE / 4;
  const b = barBox(); let ox = 0, oy = 0;
  if (b) { if (b.horiz) oy = Math.round((innerHeight - b.r.top) / 2); else ox = -Math.round(b.r.right / 2); }
  camera.setViewOffset(innerWidth, innerHeight, ox, oy, innerWidth, innerHeight);
}
frustum();
const fitZoom = (w, h) => {
  const b = barBox(); let uw = 1, uh = 1;
  if (b) { if (b.horiz) uh = Math.max(0.6, 1 - (innerHeight - b.r.top + 8) / innerHeight); else uw = Math.max(0.5, 1 - (b.r.right + 10) / innerWidth); }
  return Math.min(2 * BASE * (innerWidth / innerHeight) * uw / w, 2 * BASE * uh / h);
};
const PORTRAIT = () => innerWidth / innerHeight < 0.8;
const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, { enableDamping: true, dampingFactor: 0.14, rotateSpeed: 0.55, screenSpacePanning: true, enableZoom: false, minPolarAngle: 0.12, maxPolarAngle: 1.36 });
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.PAN };
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
const AZ = -0.42;   // 西南方俯看（航拍封面同向）
function placeCam(target, theta, phi) {
  camera.position.set(target.x + DIST * Math.sin(phi) * Math.sin(theta), target.y + DIST * Math.cos(phi), target.z + DIST * Math.sin(phi) * Math.cos(theta));
  controls.target.copy(target); camera.lookAt(target);
}
function projExtent(w, d, h, theta, phi) {
  const c = Math.abs(Math.cos(theta)), s = Math.abs(Math.sin(theta));
  return [w * c + d * s, (w * s + d * c) * Math.cos(phi) + h * Math.sin(phi)];
}
// 主楼群外包（layout）：x −80…75，y −25…43
const HOUSE_BOX = { x0: -80, x1: 75, y0: -25, y1: 43 };
const HC = V((HOUSE_BOX.x0 + HOUSE_BOX.x1) / 2, (HOUSE_BOX.y0 + HOUSE_BOX.y1) / 2, 0);

/* ---------------- UI 文案 ---------------- */
const TXT = {
  zh: { ext: '外观', xray: '内透', sect: '剖切', title: '伊甸家族府邸', motto: '始建约一百九十年 · HORTUS SUPRA NUBES', sub: '浮岛庄园 · 主楼地上三层 + 地下两层', hint: '拖动旋转 · 右键 / 双指平移 · 滚轮 / 捏合 / + − 缩放 · 双击房间或区域拉近，双击空白或按 0 复位', zin: '放大', zout: '缩小', zreset: '复位', size: '面积', use: '说明', access: '出入', estate: '室外', loading: '加载中…', loadingP: '加载模型 {p}', gallery: '衣帽间图集', restricted: '按原卡 · 不描述', card: '卡设定', inferred: '仓库推断（卡未写）', houseLoading: '载入室内…' },
  en: { ext: 'Exterior', xray: 'X-ray', sect: 'Section', title: 'Eden Family Seat', motto: 'Founded c. 190 years ago · HORTUS SUPRA NUBES', sub: 'Floating-isle estate · house: 3 floors + 2 basements', hint: 'Drag to orbit · right-drag / two fingers to pan · wheel / pinch / + − to zoom · double-click a room or area to zoom in, empty space or 0 to reset', zin: 'Zoom in', zout: 'Zoom out', zreset: 'Reset', size: 'Area', use: 'Notes', access: 'Access', estate: 'Grounds', loading: 'Loading…', loadingP: 'Loading model {p}', gallery: 'Wardrobe photos', restricted: 'Per the card · not described', card: 'From the card', inferred: 'Repository inference (not in card)', houseLoading: 'Loading interior…' },
};
const tx = (k, v = {}) => (TXT[LANG][k] || TXT.zh[k] || k).replace(/\{(\w+)\}/g, (_, n) => v[n] ?? '');
const floorName = (i) => LANG === 'en' ? `${FLOORS[i].id} · ${FLOOR_EN[FLOORS[i].id]}` : `${FLOORS[i].id} · ${FLOORS[i].name}`;

/* ---------------- 挡土墙 / 陡坡：地面贴图是俯视烘焙，竖直面上被拉成条纹 → 陡面拆出来，改用按世界坐标平铺的石砌材质 ---------------- */
function stoneTex() {
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
function splitWalls(o) {
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
  const wm = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ map: stoneTex(), vertexColors: true, side: THREE.DoubleSide }));
  wm.name = 'ground_walls'; o.userData.walls = wm; STAT.walls = (STAT.walls || 0) + wall.length / 9;
  scene.add(wm);   // 顶点已换到世界坐标
  SITE_EXTRA.push(wm);
}

/* ---------------- 背景：渐变天空 + 云海（上层封面同一套暖白云、淡蓝天；深色主题压暗） ---------------- */
const SKY = { dark: ['#27324a', '#6d6f7c', '#b9a78f'], light: ['#8fb6d8', '#d9e3ea', '#f4ead6'] };
let skyTex = null, cloudMat = null;
function paintSky() {
  const [top, mid, hor] = SKY[THEME === 'light' ? 'light' : 'dark'];
  const c = skyTex ? skyTex.image : document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, top); gr.addColorStop(0.55, mid); gr.addColorStop(1, hor);
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  if (!skyTex) { skyTex = new THREE.CanvasTexture(c); skyTex.colorSpace = THREE.SRGBColorSpace; } else skyTex.needsUpdate = true;
  scene.background = skyTex;
  if (cloudMat) { const L = THEME === 'light'; cloudMat.uniforms.cHi.value.set(L ? '#fdfbf6' : '#cfc8bd'); cloudMat.uniforms.cLo.value.set(L ? '#d3dbe4' : '#7a7d8a'); cloudMat.uniforms.cFar.value.set(hor); }
  needs = true;
}
function addBackdrop(root) {
  const bb = new THREE.Box3().setFromObject(root);
  cloudMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { cHi: { value: new THREE.Color() }, cLo: { value: new THREE.Color() }, cFar: { value: new THREE.Color() }, R: { value: 1900 } },
    vertexShader: 'varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position,1.); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `varying vec2 vP; uniform vec3 cHi, cLo, cFar; uniform float R;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float s = 0., a = .5; for (int k = 0; k < 5; k++) { s += a * n(p); p = p * 2.03 + 17.; a *= .5; } return s; }
      void main(){ float r = length(vP) / R; float c = fbm(vP / 260.); float d = fbm(vP / 60. + 5.);
        float v = smoothstep(.30, .85, c * .8 + d * .3);
        vec3 col = mix(cLo, cHi, v); col = mix(col, cFar, smoothstep(.35, 1., r) * .8);
        gl_FragColor = vec4(col, (1. - smoothstep(.7, 1., r)) * (.55 + .45 * v)); }`,
  });
  const sea = new THREE.Mesh(new THREE.CircleGeometry(1900, 64).rotateX(-Math.PI / 2), cloudMat);
  sea.position.y = bb.min.y + (bb.max.y - bb.min.y) * 0.18; sea.renderOrder = -1; sea.name = 'cloud_sea'; scene.add(sea); SITE_EXTRA.push(sea);
  paintSky();
}

/* ---------------- 加载：整岛外观 glb ---------------- */
const loadEl = $('#loading');
const setLoadText = (s) => { const sp = loadEl.querySelector('span'); if (sp) sp.textContent = s; };
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
function loadGlb(file, onProg) {
  return new Promise((res, rej) => loader.load(url('model/' + file), res, (e) => { kick('glb'); onProg && onProg(e); }, rej));
}
const TB = {};
const STAT = { tris: 0, bytes: 0, site: '', house: '' };
const siteFile = (LOW && MAN.site.low) || MAN.site.std;
STAT.site = siteFile;
let t = performance.now();
const siteG = (await loadGlb(siteFile, (e) => { if (e.total) { STAT.bytes = e.total; setLoadText(tx('loadingP', { p: Math.round(100 * e.loaded / e.total) + '%' })); } else setLoadText(tx('loadingP', { p: (e.loaded / 1048576).toFixed(1) + ' MB' })); })).scene;
TB.site = performance.now() - t;
kick('setup');
const MESH = {};
const GROUNDS = [], SITE_EXTRA = [];
const shellClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e5);
siteG.traverse((o) => {
  if (!o.isMesh) return;
  const map = o.material.map || null;
  if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = Math.min(LOW ? 4 : 8, renderer.capabilities.getMaxAnisotropy()); map.minFilter = THREE.LinearMipmapLinearFilter; map.generateMipmaps = true; map.needsUpdate = true; }
  if (map && /^(ground|rock|site_[cew])/.test(o.name)) GROUNDS.push(o);
  o.material.dispose();
  const shell = o.name.startsWith('house_shell');
  o.material = new THREE.MeshBasicMaterial({ map, vertexColors: !map && !!o.geometry.attributes.color, side: shell ? THREE.DoubleSide : THREE.FrontSide, clippingPlanes: shell ? [shellClip] : null });
  if (o.material.vertexColors) o.material.color.setScalar(1.22);   // 顶点色烘焙逐点平均了阴影面，整体偏暗：提一点与贴图烘焙对齐
  if (shell) darkBack(o.material, [0.55, 0.52, 0.47]);   // 剖切面：浅灰截面（原先近黑，F2 剖切时翼楼成了黑块）
  MESH[o.name] = o; STAT.tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
});
GROUNDS.forEach(splitWalls);
scene.add(siteG);
addBackdrop(siteG);
const SHELL = Object.values(MESH).filter((m) => m.name.startsWith('house_shell'));
const SITE_MESHES = Object.values(MESH).filter((m) => !m.name.startsWith('house_shell'));
// 背面（剖开的墙内侧）涂深色：剖切时看起来像墙体截面
function darkBack(mat, rgb) {
  mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>\nif (!gl_FrontFacing) gl_FragColor.rgb = vec3(${rgb.map((v) => v.toFixed(3)).join(',')});`); };
  mat.customProgramCacheKey = () => 'darkBack' + rgb.join(',');
}

/* ---------------- 室内体量 glb（进内透 / 剖切时才加载） ---------------- */
const houseClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e5);
const houseFloors = FLOORS.map(() => []);   // 每层 [struct, furn]
let houseState = 0;   // 0 未加载 / 1 加载中 / 2 好了 / -1 失败
function loadHouse() {
  if (houseState || !MAN.house) return; houseState = 1; const t0 = performance.now();
  const file = (LOW && MAN.house.low) || MAN.house.std; STAT.house = file;
  loadGlb(file).then((g) => {
    const root = g.scene; root.position.y = F1Y;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, clippingPlanes: [houseClip] });
    darkBack(mat, [0.2, 0.18, 0.16]);
    root.traverse((o) => {
      if (!o.isMesh) return; o.material.dispose(); o.material = mat;
      const m = o.name.match(/^f_(B[12]|F[123])_/); if (m) houseFloors[FI[m[1]]].push(o);
      STAT.tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    });
    scene.add(root); houseState = 2; TB.house = performance.now() - t0; applyMode(); needs = true;
  }).catch((e) => { console.warn('estate: house.glb', e); houseState = -1; });
}

/* ---------------- 房间（精确多边形）与室外热点 ---------------- */
const pickMat = new THREE.MeshBasicMaterial({ visible: false });
const roomG = FLOORS.map((f, i) => { const g = new THREE.Group(); g.name = 'rooms_' + f.id; g.visible = false; scene.add(g); return g; });
const ITEMS = [];
const polyShape = (poly) => new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
const flatGeo = (poly, y) => { const g = new THREE.ShapeGeometry(polyShape(poly)); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return g; };   // (x, y) → (x, y0, −y)
const bboxOf = (poly) => { const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; };
const plateMats = {};
const plateMat = (kind) => (plateMats[kind] ||= new THREE.MeshBasicMaterial({ color: KIND_COL[kind] || KIND_COL.inferred, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
const edgeMat = new THREE.LineBasicMaterial({ color: '#5a4a32', transparent: true, opacity: 0.55 });
const plates = FLOORS.map(() => []);
CARD.rooms.concat(SUBS.filter((w) => CARD.rooms.some((r) => r.id === w.parent)).map((w) => ({ ...w, area: 16 }))).forEach((r) => {
  const fi = FI[r.floor]; if (fi == null) return;
  const f = FLOORS[fi], bb = bboxOf(r.poly);
  const plate = new THREE.Mesh(flatGeo(r.poly, f.y + 0.06), plateMat(r.kind)); plate.renderOrder = 2; roomG[fi].add(plate); plates[fi].push(plate);
  const pts = r.poly.map(([x, y]) => V(x, y, f.y + 0.08)); pts.push(pts[0].clone());
  const edge = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), edgeMat); roomG[fi].add(edge); plates[fi].push(edge);
  const pg = new THREE.ExtrudeGeometry(polyShape(r.poly), { depth: r.sub ? 2.5 : 2.4, bevelEnabled: false }); pg.rotateX(-Math.PI / 2); pg.translate(0, f.y, 0);
  const pick = new THREE.Mesh(pg, pickMat); roomG[fi].add(pick);
  const c = V((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2, f.y);
  const rank = r.kind === 'card' || r.kind === 'restricted' ? 1 : r.kind === 'circ' ? 3 : 2;
  const it = { kind: 'room', d: r, floor: fi, poly: r.poly, cx: c.x, cz: c.z, w: bb.x1 - bb.x0, dd: bb.y1 - bb.y0, y: f.y, rank, pick };
  pick.userData.item = it;
  it.label = mkLabel(roomG[fi], c.x, f.y + 1.2, c.z, 'room');
  it.pri = (4 - rank) * 10000 + (r.area || 0);
  ITEMS.push(it);
});
const zoneG = new THREE.Group(); zoneG.name = 'zones'; scene.add(zoneG);
ZDATA.zones.forEach((z) => {
  const it = { kind: 'area', d: z, floor: null, cx: z.x, cz: -z.y, w: 2 * z.r, dd: 2 * z.r, y: z.z, round: true, rank: z.pri >= 8 ? 1 : z.pri >= 5 ? 2 : 3 };
  const hgt = Math.max(4, z.h + 2);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(z.r, z.r, hgt, 24), pickMat); m.position.set(z.x, z.z + hgt / 2 - 1, -z.y); m.userData.item = it; zoneG.add(m); it.pick = m;
  it.label = mkLabel(zoneG, z.x, z.z + z.h, -z.y, 'area'); it.pri = z.pri * 1000 + z.r;
  ITEMS.push(it);
});
// 庄园悬浮车（卡里的交通是悬浮车 / 悬浮载具，没有地面车）：主楼门廊前车道两辆，程序生成（无轮、离地悬停 + 柔光），可点
const CARS = [[5.5, -37.5, 90], [-6.0, -37.8, 90]];
const carG = new THREE.Group(); carG.name = 'hovercars'; scene.add(carG);
{
  const body = new THREE.MeshLambertMaterial({ color: '#2b2f36' }), glass = new THREE.MeshLambertMaterial({ color: '#8fa6b4' }), trim = new THREE.MeshLambertMaterial({ color: '#c9a45c' });
  const glow = new THREE.MeshBasicMaterial({ color: '#9fe6ff', transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
  const bodyG = new THREE.CapsuleGeometry(0.72, 3.9, 4, 12).rotateZ(Math.PI / 2).scale(1, 0.62, 1.25);
  const cabG = new THREE.CapsuleGeometry(0.55, 1.7, 4, 12).rotateZ(Math.PI / 2).scale(1, 0.7, 1.15);
  const glowG = new THREE.CircleGeometry(1, 32).scale(2.9, 1.2, 1).rotateX(-Math.PI / 2);
  CARS.forEach(([x, y, a], i) => {
    const gz = F1Y, g = new THREE.Group(); g.position.copy(V(x, y, gz)); g.rotation.y = (a * Math.PI) / 180 - Math.PI / 2;
    const b = new THREE.Mesh(bodyG, body); b.position.y = 1.05; const c = new THREE.Mesh(cabG, glass); c.position.set(-0.3, 1.5, 0);
    const t = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.05, 0.05), trim); t.position.set(0, 1.0, 0.92); const t2 = t.clone(); t2.position.z = -0.92;
    const gl = new THREE.Mesh(glowG, glow); gl.position.y = 0.06; gl.renderOrder = 3;
    g.add(b, c, t, t2, gl); carG.add(g);
    const it = { kind: 'car', d: { name: '庄园悬浮车', en: 'Estate hover car', id: 'hovercar' + i }, floor: null, cx: g.position.x, cz: g.position.z, w: 6, dd: 6, y: gz };
    const pk = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 2.6), pickMat); pk.position.y = 1.2; pk.userData.item = it; g.add(pk); it.pick = pk;
    it.label = mkLabel(g, 0, 3, 0, 'area'); it.pri = 100; it.rank = 3; ITEMS.push(it);
  });
}
function mkLabel(parent, x, y, z, cls) {
  const el = document.createElement('div'); el.className = 'lbl ' + cls; el.appendChild(document.createElement('span'));
  const o = new CSS2DObject(el); o.position.set(x, y, z); o.center.set(0.5, 0.5); o.visible = false; parent.add(o); return o;
}
const PH = '（按原卡）';   // 名字不入库的卡房间：占位（map/card-bind.mjs）；查看器发来 estate:bind 后换成用户卡里的原名（只在本机）
const enName = (d) => d.en || (d.name === PH ? 'Per card' : '');
const nameOf = (it) => {
  const d = it.d;
  if (it.kind === 'area' || it.kind === 'car') return LANG === 'en' ? d.en || d.name : d.name;
  const nm = d.name + (d.no ? ` ${d.no}` : '');
  return LANG === 'en' && enName(d) ? enName(d) : nm;
};
const floorTags = FLOORS.map((f, i) => { const o = mkLabel(scene, HOUSE_BOX.x0 - 4, f.y + 1, -HOUSE_BOX.y0, 'floor'); o.center.set(1, 0.5); return o; });
function relabel() {
  for (const it of ITEMS) { it.label.element.firstChild.textContent = nameOf(it); it.lw = 0; }
  floorTags.forEach((o, i) => { o.element.firstChild.textContent = floorName(i); });
}

/* ---------------- 楼层条 ---------------- */
const floorsEl = $('#floors'); const BTN = {};
function buildNav() {
  floorsEl.innerHTML = ''; for (const k of Object.keys(BTN)) delete BTN[k];
  const sep = () => floorsEl.appendChild(document.createElement('hr'));
  const add = (key, html, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = html; if (cls) b.className = cls; b.onclick = () => setMode(key, { fly: true, user: true }); floorsEl.appendChild(b); BTN[key] = b; return b; };
  add('ext', tx('ext')); add('xray', tx('xray')); sep();
  const cap = document.createElement('div'); cap.className = 'cap'; cap.textContent = tx('sect'); floorsEl.appendChild(cap);
  for (let i = FLOORS.length - 1; i >= 0; i--) add(i, `${FLOORS[i].id}<small>${LANG === 'en' ? FLOOR_EN[FLOORS[i].id] : FLOORS[i].name}</small>`);
  syncNav();
  $('#title h1').textContent = tx('title'); $('#title .motto').textContent = tx('motto'); $('#title .sub').textContent = tx('sub'); $('#hint').textContent = tx('hint');
  $('#lblBtn').textContent = LANG === 'en' ? 'Aa' : '标'; $('#lblBtn').title = (LANG === 'en' ? 'Labels' : '标注') + ' (L)';
  $('#zin').title = tx('zin'); $('#zout').title = tx('zout'); $('#zreset').title = tx('zreset'); document.documentElement.lang = LANG === 'en' ? 'en' : 'zh-CN';
}
function syncNav() { for (const [k, b] of Object.entries(BTN)) b.classList.toggle('on', String(mode) === k); }

/* ---------------- 模式：ext 外观 / xray 内透 / 0..4 剖切（B2…F3） ---------------- */
let mode = 'ext';
const isFloor = (m) => typeof m === 'number';
function viewFor(m) {
  const P_ = PORTRAIT();
  if (m === 'ext') {
    const th = AZ, ph = P_ ? 0.9 : 0.98; const [w, h] = projExtent(660, 500, 60, th, ph);
    return { target: new THREE.Vector3(0, 12, -5), zoom: P_ ? fitZoom(w * 0.62, 1) : fitZoom(w * 0.9, h * 0.95), theta: th, phi: ph };
  }
  const W = HOUSE_BOX.x1 - HOUSE_BOX.x0, D = HOUSE_BOX.y1 - HOUSE_BOX.y0;
  if (m === 'xray') { const th = AZ, ph = 1.0; const [w, h] = projExtent(W, D, 32, th, ph); return { target: new THREE.Vector3(HC.x, F1Y + 7, HC.z), zoom: P_ ? fitZoom(w * 0.8, 1) : fitZoom(w * 1.08, h * 1.12), theta: th, phi: ph }; }
  const y = FLOORS[m].y, main = m <= 1;   // 地下只有主楼下 40 × 22 m
  const w0 = main ? 48 : W + 4, d0 = main ? 30 : D + 4, cx = main ? 0 : HC.x, cz = main ? 3 : HC.z;
  const th = AZ * 0.6, ph = 0.72; const [w, h] = projExtent(w0, d0, 5, th, ph);
  return { target: new THREE.Vector3(cx, y, cz), zoom: P_ ? fitZoom(w * 0.92, 1) : fitZoom(w * 1.08, h * 1.15), theta: th, phi: ph };
}
function applyMode() {
  const m = mode, fl = isFloor(m);
  const under = fl && m <= 1;
  for (const s of SITE_MESHES) s.visible = !under;
  for (const s of SITE_EXTRA) if (s.name === 'ground_walls') s.visible = !under;
  // 主楼外壳：外观原样；内透半透明；剖切切在楼面以上 1.5 m（地下层不显示）
  for (const s of SHELL) {
    s.visible = !under;
    const mt = s.material, xr = m === 'xray';
    if (mt.transparent !== xr) { mt.transparent = xr; mt.needsUpdate = true; }
    mt.opacity = xr ? 0.16 : 1; mt.depthWrite = !xr;
  }
  shellClip.constant = fl && !under ? FLOORS[m].y + CUT : 1e5;
  houseClip.constant = fl ? FLOORS[m].y + CUT : 1e5;
  roomG.forEach((g, i) => { g.visible = fl ? i === m : m === 'xray' && i >= 2; });
  plates.forEach((ps, i) => ps.forEach((p) => { p.visible = fl ? i === m : m === 'xray'; }));
  for (const mt of Object.values(plateMats)) mt.opacity = m === 'xray' ? 0.35 : 0.55;
  houseFloors.forEach((ms, i) => ms.forEach((o) => { o.visible = fl ? i === m : m === 'xray' && i >= 2; }));
  zoneG.visible = m === 'ext'; carG.visible = m === 'ext';
  floorTags.forEach((o, i) => { o.visible = m === 'xray' && i >= 2; });
  needs = true;
}
function setMode(m, o = {}) {
  if (typeof m === 'string' && /^\d$/.test(m)) m = +m;
  mode = m;
  if (m !== 'ext') loadHouse();
  applyMode();
  if (pinned && !itemVisible(pinned)) unpin();
  hover = null; hideCard(true); showHi(hiHover, null);
  syncNav(); updateLabelSet();
  if (o.fly) flyTo(viewFor(m));
  if (o.user) post({ type: 'estate:floor', floor: modeKey(m) });
}
const modeKey = (m) => (isFloor(m) ? FLOORS[m].id : m);
function itemVisible(it) {
  if (it.kind === 'area' || it.kind === 'car') return mode === 'ext';
  return mode === it.floor || (mode === 'xray' && it.floor >= 2);
}
function parseFloor(f) {
  if (f == null) return null; const s = String(f).trim().toLowerCase();
  if (['ext', 'exterior', '外观', 'out'].includes(s)) return 'ext';
  if (['all', '全部', 'cutaway', 'xray', 'x-ray', '内透'].includes(s)) return 'xray';
  let k = s.match(/^b\s*([12])\s*f?$|^([12])\s*b$|^-\s*([12])$|^地下\s*([一二12])/);
  if (k) { const n = k[1] || k[2] || k[3] || ({ 一: '1', 二: '2' }[k[4]] || k[4]); return FI['B' + n]; }
  k = s.match(/^f\s*([123])$|^([123])\s*f$|^([123])$|^([一二三])层$/);
  if (k) { const n = k[1] || k[2] || k[3] || { 一: '1', 二: '2', 三: '3' }[k[4]]; return FI['F' + n]; }
  return null;
}

/* ---------------- 标签：按等级、模式、缩放与重叠筛选 ---------------- */
let labelSet = [];
function updateLabelSet() {
  labelSet = [];
  for (const it of ITEMS) { const on = itemVisible(it); it.label.visible = on; if (on) labelSet.push(it); }
}
const _v = new THREE.Vector3();
function cullLabels() {
  const W = innerWidth, H = innerHeight, placed = [];
  const mpp = (camera.right - camera.left) / camera.zoom / Math.max(1, innerWidth);
  const list = labelSet.slice().sort((a, b) => (b === pinned) - (a === pinned) || (b === hover) - (a === hover) || b.pri - a.pri);
  for (const it of list) {
    const el = it.label.element, hot = it === pinned || it === hover;
    let ok = true;
    if (!hot) {
      if (it.kind === 'room') {
        if (mode === 'xray') ok = false;                                   // 内透：只在悬停 / 钉住时显示
        else if (it.rank === 3) ok = false;
        else if (it.rank === 2 && mpp > 0.09) ok = false;
        else if (it.d.name === '个人寝室' && mpp > 0.06) ok = false;
      } else if (it.kind === 'area') {
        if (it.rank === 3 && mpp > 0.18) ok = false;
        else if (it.rank === 2 && mpp > 0.4) ok = false;
      }
    }
    if (ok) {
      it.label.getWorldPosition(_v).project(camera);
      if (_v.z > 1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05) ok = false;
      else {
        const x = (_v.x + 1) / 2 * W, y = (1 - _v.y) / 2 * H;
        if (!it.lw) { it.lw = el.firstChild.offsetWidth || 60; it.lh = el.firstChild.offsetHeight || 18; }
        const r = [x - it.lw / 2 - 3, y - it.lh / 2 - 2, x + it.lw / 2 + 3, y + it.lh / 2 + 2];
        if (!hot) for (const p of placed) if (r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1]) { ok = false; break; }
        if (ok) placed.push(r);
      }
    }
    el.classList.toggle('hide', !ok); el.classList.toggle('hot', it === pinned);
  }
}

/* ---------------- 高亮：房间按精确多边形，区域按圆 ---------------- */
function mkHi(color, lineOp, fillOp) {
  const g = new THREE.Group(); g.renderOrder = 6; g.visible = false; scene.add(g);
  g.userData = { color, lm: new THREE.LineBasicMaterial({ color, transparent: true, opacity: lineOp, depthTest: false }), fm: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: fillOp, depthWrite: false, depthTest: false, side: THREE.DoubleSide }), fillOp };
  return g;
}
const hiPin = mkHi('#e6c36a', 1, 0.3), hiHover = mkHi('#f3dfa2', 0.8, 0.14);
function clearHi(h) { for (const c of [...h.children]) { h.remove(c); c.geometry.dispose(); } }
function showHi(h, it) {
  clearHi(h);
  if (!it) { h.visible = false; needs = true; return; }
  const u = h.userData;
  let poly, y;
  if (it.kind === 'room') { poly = it.poly; y = it.y + 0.12; }
  else if (it.kind === 'car') { const n = 32; poly = Array.from({ length: n }, (_, k) => [it.cx + 3.4 * Math.cos(2 * Math.PI * k / n), -it.cz + 3.4 * Math.sin(2 * Math.PI * k / n)]); y = it.y + 0.2; }
  else { const n = 48, z = it.d; poly = Array.from({ length: n }, (_, k) => [z.x + z.r * Math.cos(2 * Math.PI * k / n), z.y + z.r * Math.sin(2 * Math.PI * k / n)]); y = z.z + 0.6; }
  const fill = new THREE.Mesh(flatGeo(poly, y), u.fm); fill.renderOrder = 6;
  const pts = poly.map(([x, yy]) => V(x, yy, y + 0.02)); pts.push(pts[0].clone());
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), u.lm); line.renderOrder = 7;
  const up = it.kind === 'room' ? 2.6 : 0;
  h.add(fill, line);
  if (up) { const pts2 = pts.map((p) => p.clone().setY(p.y + up)); h.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), u.lm)); }
  h.visible = true; needs = true;
}

/* ---------------- 房间卡 ---------------- */
const card = $('#card');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function cardHTML(it) {
  const d = it.d, zh = LANG === 'zh';
  if (it.kind === 'car') {
    return zh ? `<h3>庄园悬浮车</h3><div class="sub">室外 · 主楼门廊前车道</div><div class="row"><em>说明</em>庄园自用的悬浮代步车：没有车轮，离地悬停行驶，底部有柔和的推进光。</div><div class="row"><em>停放</em>悬浮车库（服务院旁）/ 载具停靠坪</div><div class="acts"><button class="garage" type="button">去悬浮车库 ›</button></div>`
      : `<h3>Estate hover car</h3><div class="sub">Grounds · drive in front of the portico</div><div class="row"><em>Notes</em>The estate's own hover cars: no wheels, they float just above the ground on a soft thruster glow.</div><div class="row"><em>Parking</em>Hover Garage (by the service court) / Vehicle Pad</div><div class="acts"><button class="garage" type="button">Go to the garage ›</button></div>`;
  }
  if (it.kind === 'area') {
    return `<h3>${esc(nameOf(it))}</h3><div class="sub">${esc(tx('estate'))}${zh && d.en ? ' · ' + esc(d.en) : ''}</div>` + (d.alias?.length && zh ? `<div class="row"><em>别名</em>${esc(d.alias.filter((a) => /[一-鿿]/.test(a)).slice(0, 4).join('、'))}</div>` : '');
  }
  let h = `<h3>${esc(nameOf(it))}</h3><div class="sub">${esc(floorName(it.floor))} · ${esc(d.id)}</div>`;
  if (d.kind === 'restricted') return h + `<div class="row">${esc(tx('restricted'))}</div>`;
  if (d.sub) {
    h += `<div class="row"><em>${zh ? '位置' : 'Where'}</em>${zh ? '主卧套间内' : 'Inside the master suite'}</div>`;
    if (zh && d.note) h += `<div class="row"><em>${tx('use')}</em>${esc(d.note)}</div>`;
    return h + `<div class="src"><b class="s0">${esc(tx('card'))}</b></div><div class="acts"><button class="gal" type="button">${tx('gallery')} ›</button></div>`;
  }
  const area = d.card_area ? `${Math.round(d.area)} ㎡（${zh ? '卡' : 'card'} ${d.card_area}）` : d.card_range ? `${Math.round(d.area)} ㎡（${zh ? '卡' : 'card'} ${d.card_range[0]}–${d.card_range[1]}）` : `${Math.round(d.area)} ㎡`;
  h += `<div class="row"><em>${tx('size')}</em>${esc(area)}</div>`;
  if (zh && d.note) h += `<div class="row"><em>${tx('use')}</em>${esc(d.note)}</div>`;
  if (zh && d.access) h += `<div class="row"><em>${tx('access')}</em>${esc(d.access)}</div>`;
  h += `<div class="src"><b class="${d.kind === 'card' ? 's0' : 's2'}">${esc(d.kind === 'card' ? tx('card') : tx('inferred'))}</b></div>`;
  if (GALLERY[d.name]) h += `<div class="acts"><button class="gal" type="button">${tx('gallery')} ›</button></div>`;
  return h;
}
let cardFor = null, cardAt = null;
function showCard(it, x, y) {
  if (cardFor !== it) { card.innerHTML = cardHTML(it); cardFor = it; }
  cardAt = x == null ? null : [x, y]; card.classList.toggle('pinned', it === pinned && x == null); placeCard(); card.classList.add('on');
}
card.addEventListener('click', (e) => { if (!e.target.closest('.garage')) return; e.stopPropagation(); const g = ITEMS.find((it) => it.kind === 'area' && it.d.id === 'garage'); if (g) focusItem(g); });
let GALS = null;
card.addEventListener('click', async (e) => {
  if (!e.target.closest('.gal') || !cardFor) return; e.stopPropagation();
  const id = GALLERY[cardFor.d.name]; if (!id) return;
  GALS ||= await fetch(url('../data/room_galleries.json')).then((r) => r.json()).catch(() => ({}));
  openGallery(GALS[id], { lang: LANG, base: url('../') });
});
function placeCard() {
  if (!cardFor) return; let x, y;
  const w = card.offsetWidth, h = card.offsetHeight;
  if (cardAt) [x, y] = cardAt; else { x = innerWidth - w - 16; y = 16; }
  if (x + w + 12 > innerWidth) x = Math.max(8, x - w - 44); if (y + h + 12 > innerHeight) y = innerHeight - h - 12; if (y < 8) y = 8;
  card.style.left = x + 'px'; card.style.top = y + 'px';
}
function hideCard(force) { if (pinned && !force) { showCard(pinned); return; } card.classList.remove('on'); cardFor = null; }

/* ---------------- 拾取 / 悬停 / 点选 ---------------- */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pickAt(cx, cy) {
  const rc = renderer.domElement.getBoundingClientRect();
  ndc.set(((cx - rc.left) / rc.width) * 2 - 1, -((cy - rc.top) / rc.height) * 2 + 1); ray.setFromCamera(ndc, camera);
  const list = []; for (const it of ITEMS) if (itemVisible(it)) list.push(it.pick);
  const hits = ray.intersectObjects(list, false);
  if (!hits.length) return null;
  if (mode === 'ext') hits.sort((a, b) => (a.object.userData.item.d.r ?? 0) - (b.object.userData.item.d.r ?? 0));   // 区域：最具体（最小）的优先
  const sub = hits.find((h) => h.object.userData.item.d.sub);   // 套间里的子区域（衣帽间）压过外层房间
  if (sub && hits[0].object.userData.item.d.id === sub.object.userData.item.d.parent) return sub.object.userData.item;
  return hits[0].object.userData.item;
}
let pinned = null, hover = null, pinT = 0;
function pin(it, fly) { pinned = it; pinT = performance.now(); showHi(hiPin, it); showHi(hiHover, null); cardFor = null; showCard(it); needs = true; if (fly) focusView(it); }
function unpin() { pinned = null; showHi(hiPin, null); hideCard(true); needs = true; }
const sph = new THREE.Spherical();
function focusView(it) {
  sph.setFromVector3(camera.position.clone().sub(controls.target));
  const [pw, ph] = projExtent(it.w, it.dd, 3, sph.theta, sph.phi);
  const pad = it.kind === 'room' ? 1.4 : 1.25;
  flyTo({ target: new THREE.Vector3(it.cx, it.y, it.cz), zoom: fitZoom(pw * pad + 8, ph * pad + 8), theta: null, phi: null });
}
function focusItem(it) {
  if (it.kind === 'room' && mode !== it.floor) setMode(it.floor);
  if ((it.kind === 'area' || it.kind === 'car') && mode !== 'ext') setMode('ext');
  pin(it, true);
}
const norm = (s) => String(s || '').trim().toLowerCase();
const ALIAS_OF = {}; for (const [k, arr] of Object.entries(ALIAS)) for (const a of arr) ALIAS_OF[norm(a)] = k;
function keysOf(it) {
  const d = it.d;
  if (it.kind === 'area') return [d.name, d.en, ...(d.alias || [])];
  const base = d.name.replace(/[（(][^）)]*[）)]/g, '').replace(/\s*[×x]\s*\d+\s*$/, '').trim();   // 同 here.mjs planWords：去括注 / 「 ×2」，「 / 」两侧各算一个叫法
  return [d.name === PH ? null : d.name, d.id, d.card_id, d.name === PH ? null : base, ...(d.name === PH ? [] : base.split(/\s*[\/／]\s*/).filter((w) => [...w].length >= 2)), ...(d.alias || []), ...(d.words || []), ...(d.synonyms || []), ...(ALIAS[d.name] || [])];
}
// 旧编号 / 仓库以前自编的旧名（聊天里存过的）→ 现在的卡编号
const OLD = { ...(CARD.card_id_alias || {}), ...(CARD.retired_names || {}) };
function findByName(name, floor) {
  if (OLD[name]) name = OLD[name];
  const s = norm(name); if (!s) return null;
  let best = null, score = -1;
  for (const it of ITEMS) {
    if (floor != null && it.floor !== floor) continue;
    const rank = it.kind === 'room' ? (it.d.sub ? 5 : it.d.kind === 'card' || it.d.kind === 'restricted' ? 4 : 2) : it.d.pri >= 8 ? 1 : 3;
    for (const k of keysOf(it).filter((k) => typeof k === 'string' && k)) {
      const kl = norm(k); let sc = -1;
      if (s === kl) sc = 10000 + rank; else if (kl.length > 1 && s.includes(kl)) sc = rank * 100 + kl.length; else continue;
      if (sc > score) { score = sc; best = it; }
    }
  }
  return best;
}
// 查看器发来的卡设定房间（{ name, floor, poly }）：同层同名里取多边形中心最近的那间
function findCard(c) {
  const fi = FI[c.floor]; if (fi == null) return null;
  const cands = ITEMS.filter((it) => it.kind === 'room' && it.floor === fi && it.d.name === c.name);
  if (!cands.length) return findByName(c.name, fi);
  if (cands.length === 1 || !Array.isArray(c.poly)) return cands[0];
  const cx = c.poly.reduce((a, p) => a + p[0], 0) / c.poly.length, cy = c.poly.reduce((a, p) => a + p[1], 0) / c.poly.length;
  const d = (it) => { const b = bboxOf(it.poly); return Math.hypot((b.x0 + b.x1) / 2 - cx, (b.y0 + b.y1) / 2 - cy); };
  return cands.sort((a, b) => d(a) - d(b))[0];
}

/* ---------------- 飞行动画 ---------------- */
let tween = null;
function flyTo(v, dur = 700) {
  if (REDUCED) dur = 1;
  sph.setFromVector3(camera.position.clone().sub(controls.target));
  const to = { target: v.target.clone(), zoom: clamp(v.zoom, minZoom, maxZoom), theta: v.theta ?? sph.theta, phi: v.phi ?? sph.phi };
  let dt = to.theta - sph.theta; dt = Math.atan2(Math.sin(dt), Math.cos(dt));
  tween = { t0: performance.now(), dur, from: { target: controls.target.clone(), zoom: camera.zoom, theta: sph.theta, phi: sph.phi }, to, dt, ease: v.ease };
  needs = true;
}
function stepTween(now) {
  if (!tween) return false;
  const k = Math.min(1, (now - tween.t0) / tween.dur);
  const e = tween.ease === 'out' ? 1 - Math.pow(1 - k, 3) : k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const f = tween.from, to = tween.to;
  const tg = f.target.clone().lerp(to.target, e);
  camera.zoom = Math.exp(Math.log(f.zoom) + (Math.log(to.zoom) - Math.log(f.zoom)) * e); camera.updateProjectionMatrix();
  placeCam(tg, f.theta + tween.dt * e, f.phi + (to.phi - f.phi) * e);
  if (k >= 1) tween = null;
  return true;
}

/* ---------------- 缩放：滚轮 / 触控板捏合 / Safari gesture / 双指捏合 / 按钮 / 键盘 ---------------- */
const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _dir = new THREE.Vector3();
function zoomAt(cx, cy, f) {
  tween = null;
  const rc = renderer.domElement.getBoundingClientRect();
  const nx = ((cx - rc.left) / rc.width) * 2 - 1, ny = -((cy - rc.top) / rc.height) * 2 + 1;
  _p0.set(nx, ny, 0).unproject(camera);
  const z = clamp(camera.zoom * f, minZoom, maxZoom); if (z === camera.zoom) return;
  camera.zoom = z; camera.updateProjectionMatrix();
  _p1.set(nx, ny, 0).unproject(camera);
  _p0.sub(_p1); camera.position.add(_p0); controls.target.add(_p0);
  keepTargetY(); touchInteract(); needs = true;
}
let targetY = 12;
function keepTargetY() {
  _dir.subVectors(controls.target, camera.position).normalize(); if (Math.abs(_dir.y) < 1e-3) return;
  const s = (targetY - controls.target.y) / _dir.y; controls.target.addScaledVector(_dir, s); camera.position.addScaledVector(_dir, s);
}
window.addEventListener('wheel', (e) => { e.preventDefault(); }, { passive: false });
app.addEventListener('wheel', (e) => {
  e.preventDefault(); e.stopPropagation();
  let dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 300 : 1);
  dy = clamp(dy, -150, 150);
  zoomAt(e.clientX, e.clientY, Math.exp(-dy * (e.ctrlKey ? 0.011 : 0.0021)));
}, { passive: false, capture: true });
floorsEl.addEventListener('wheel', (e) => { if (floorsEl.scrollWidth > floorsEl.clientWidth) floorsEl.scrollLeft += e.deltaY + e.deltaX; }, { passive: true });
let gLast = 1;
window.addEventListener('gesturestart', (e) => { e.preventDefault(); gLast = 1; }, { passive: false });
window.addEventListener('gesturechange', (e) => { e.preventDefault(); if (COARSE) return; const s = e.scale || 1; zoomAt(e.clientX ?? innerWidth / 2, e.clientY ?? innerHeight / 2, s / gLast); gLast = s; }, { passive: false });
window.addEventListener('gestureend', (e) => { e.preventDefault(); gLast = 1; }, { passive: false });
let pinch = null;
app.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) { const [a, b] = e.touches; pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), t: performance.now(), moved: 0, cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2 }; cancelTap(); }
}, { passive: false });
app.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (e.touches.length === 2 && pinch) { const [a, b] = e.touches; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); const cx = (a.clientX + b.clientX) / 2, cy = (a.clientY + b.clientY) / 2;
    if (pinch.d > 0) zoomAt(cx, cy, d / pinch.d); pinch.moved += Math.abs(d - pinch.d) + Math.hypot(cx - pinch.cx, cy - pinch.cy); pinch.d = d; pinch.cx = cx; pinch.cy = cy; setLowRes(true); }
}, { passive: false });
app.addEventListener('touchend', (e) => {
  if (pinch && e.touches.length < 2) {
    if (performance.now() - pinch.t < 260 && pinch.moved < 12) { const it = pickAt(pinch.cx, pinch.cy); if (it) { focusItem(it); postSelect(it); } }
    pinch = null;
  }
});
const zoomBtn = (f) => { const to = clamp(camera.zoom * f, minZoom, maxZoom); flyTo({ target: controls.target.clone(), zoom: to, theta: null, phi: null }, 260); };
const resetView = () => { unpin(); flyTo(viewFor(mode)); };
// 标注开关（房间 / 区域名字签）：默认开，按查看者记在本机；L 键切换；关掉后点选 / 悬停卡照常
let labelsOn = LS('edenEstateLabels') !== '0';
function setLabels(on) {
  labelsOn = on; document.body.classList.toggle('nolabels', !on);
  const b = $('#lblBtn'); b.setAttribute('aria-pressed', String(on)); b.title = (LANG === 'en' ? 'Labels' : '标注') + ' (L)';
  try { localStorage.setItem('edenEstateLabels', on ? '1' : '0'); } catch (e) { }
  needs = true;
}
$('#lblBtn').onclick = () => setLabels(!labelsOn);
setLabels(labelsOn);
$('#zin').onclick = () => zoomBtn(1.6); $('#zout').onclick = () => zoomBtn(1 / 1.6); $('#zreset').onclick = resetView;

/* ---------------- 指针 ---------------- */
let down = null, lastTap = null, tapTimer = 0;
const postSelect = (it) => post({ type: 'estate:select', name: it.d.name, floor: it.floor != null ? FLOORS[it.floor].id : null });
const cancelTap = () => { if (tapTimer) { clearTimeout(tapTimer); tapTimer = 0; } };
function tapPin(it) { if (it) { pin(it, false); postSelect(it); } else if (pinned) unpin(); }
renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType }; tween = null; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; const type = down.type; down = null;
  if (moved > 7 || dt > 450 || pinch) return;
  const it = pickAt(e.clientX, e.clientY);
  if (type !== 'mouse') {
    const now = performance.now();
    if (lastTap && now - lastTap.t < 300 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) { lastTap = null; cancelTap(); dbl(it); return; }
    lastTap = { t: now, x: e.clientX, y: e.clientY };
    cancelTap(); tapTimer = setTimeout(() => { tapTimer = 0; tapPin(it); }, 250);
    return;
  }
  tapPin(it);
});
renderer.domElement.addEventListener('dblclick', (e) => { dbl(pickAt(e.clientX, e.clientY)); });
function dbl(it) { if (it) { focusItem(it); postSelect(it); } else resetView(); }
let hoverEv = null, hoverRaf = 0;
function doHover() {
  hoverRaf = 0; const e = hoverEv; if (!e) return;
  const it = pickAt(e.clientX, e.clientY);
  if (it !== hover) { hover = it; showHi(hiHover, it && it !== pinned ? it : null); needs = true; }
  if (it) showCard(it, e.clientX + 16, e.clientY + 14); else hideCard();
  renderer.domElement.style.cursor = it ? 'pointer' : '';
}
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || e.buttons) return;
  hoverEv = { clientX: e.clientX, clientY: e.clientY }; if (!hoverRaf) hoverRaf = requestAnimationFrame(doHover);
});
renderer.domElement.addEventListener('pointerleave', () => { hoverEv = null; hover = null; showHi(hiHover, null); hideCard(); needs = true; });
controls.addEventListener('start', () => { tween = null; setLowRes(true); });
controls.addEventListener('change', () => { needs = true; touchInteract(); });
let lastInteract = 0;
function touchInteract() { lastInteract = performance.now(); }
function setLowRes(on) {
  touchInteract();
  if (on === lowRes) return; lowRes = on;
  renderer.setPixelRatio(on ? Math.max(1, DPR * 0.75) : DPR); renderer.setSize(innerWidth, innerHeight); needs = true;
}

/* ---------------- 键盘 / 消息 ---------------- */
const SEQ = [...FLOORS.map((f, i) => i), 'xray', 'ext'];
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (['+', '=', '-', '_', '0'].includes(e.key)) { e.preventDefault(); if (e.key === '0') resetView(); else zoomBtn(e.key === '+' || e.key === '=' ? 1.6 : 1 / 1.6); return; }
  if ((e.key === 'l' || e.key === 'L') && !e.target.closest?.('input,textarea')) { setLabels(!labelsOn); return; }
  if (!['PageUp', 'PageDown', '[', ']'].includes(e.key)) return; e.preventDefault();
  if (IN_FRAME) { post({ type: 'estate:key', key: e.key }); return; }
  const up = e.key === 'PageUp' || e.key === ']'; let i = SEQ.indexOf(mode); i = Math.max(0, Math.min(SEQ.length - 1, i + (up ? 1 : -1))); setMode(SEQ[i], { fly: true });
});
// 卡设定房间（查看器的「自定义 → 在地图上看」会带 card: { name, floor, poly }）：直接取精确多边形那一间
function focusRoomMsg(name, c) {
  let it = c && c.name === name ? findCard(c) : null;
  if (!it) it = findByName(name);
  if (it) focusItem(it); else unpin();
}
// 卡房间原名（查看器从用户自己的卡里按结构取到的，见 map/card-bind.mjs）：只换显示名 / 搜索词，不存盘
function bindNames(names) {
  let n = 0;
  for (const it of ITEMS) {
    const nm = it.kind === 'room' && typeof names[it.d.card_id] === 'string' ? names[it.d.card_id].slice(0, 40) : null; if (!nm || nm === it.d.name) continue;
    const words = [...(it.d.words || [])]; if (it.d.name !== PH && !words.includes(it.d.name)) words.push(it.d.name);
    it.d = { ...it.d, name: nm, words }; n++;
  }
  if (n) { relabel(); needs = true; }
}
function post(msg) { if (IN_FRAME) try { window.parent.postMessage(msg, '*'); } catch (e) { } }
window.addEventListener('message', (e) => {
  if (IN_FRAME && e.source !== window.parent) return;
  const d = e.data; if (!d || typeof d !== 'object' || typeof d.type !== 'string' || !d.type.startsWith('estate:')) return;
  if (d.type === 'estate:room') focusRoomMsg(d.name, d.card);
  else if (d.type === 'estate:bind' && d.names && typeof d.names === 'object') bindNames(d.names);
  else if (d.type === 'estate:floor') { const m = parseFloor(d.floor); if (m != null) setMode(m, { fly: true }); }
  else if (d.type === 'estate:inset' && Number.isFinite(d.left)) { document.documentElement.style.setProperty('--inset', Math.max(6, d.left) + 'px'); frustum(); needs = true; }
  else if (d.type === 'estate:lang' && (d.lang === 'en' || d.lang === 'zh')) setLang(d.lang);
  else if (d.type === 'estate:theme' && (d.theme === 'light' || d.theme === 'dark')) { THEME = d.theme; document.documentElement.dataset.theme = THEME; paintSky(); }
});
function setLang(l) { LANG = l; buildNav(); relabel(); frustum(); const it = cardFor; cardFor = null; if (it) showCard(it, cardAt?.[0], cardAt?.[1]); needs = true; }
addEventListener('resize', () => { frustum(); renderer.setSize(innerWidth, innerHeight); labelR.setSize(innerWidth, innerHeight); camera.zoom = clamp(camera.zoom, minZoom, maxZoom); camera.updateProjectionMatrix(); needs = true; });

/* ---------------- 循环（按需渲染） ---------------- */
const statsEl = $('#stats'); if (STATS) statsEl.style.display = 'block';
let frames = 0, fpsT = performance.now(), fps = 0, first = true, lastInfo = { calls: 0, triangles: 0 }, lastPulse = 0;
function loop(now) {
  requestAnimationFrame(loop);
  let moving = stepTween(now);
  if (!moving) moving = controls.update(); else controls.update();
  const tg = controls.target; const cx = clamp(tg.x, -360, 360), cz = clamp(tg.z, -300, 300);
  if (cx !== tg.x || cz !== tg.z) { camera.position.x += cx - tg.x; camera.position.z += cz - tg.z; tg.x = cx; tg.z = cz; }
  if (!tween) targetY = tg.y;
  const mpp = (camera.right - camera.left) / camera.zoom / Math.max(1, innerWidth);
  document.body.classList.toggle('zoomed', mode !== 'ext' || mpp < 0.1);
  if (pinned && now - pinT < 2000 && now - lastPulse > 66) { lastPulse = now; const k = 0.6 + 0.4 * Math.abs(Math.sin((now - pinT) / 420 * Math.PI)); hiPin.userData.fm.opacity = hiPin.userData.fillOp * (0.5 + k * 0.7); needs = true; }
  if (lowRes && !down && !pinch && now - lastInteract > 150) setLowRes(false);
  if (!(needs || moving || STATS)) return;
  needs = false;
  adapt(now, moving);
  renderer.render(scene, camera); lastInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  labelR.render(scene, camera); cullLabels();
  if (cardFor && !cardAt) placeCard();
  frames++;
  if (first) { first = false; onFirstFrame(); }
  if (STATS && now - fpsT > 500) { fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; statsEl.textContent = `T${tier} · ${fps.toFixed(0)} fps\n${lastInfo.calls} calls\n${(lastInfo.triangles / 1000).toFixed(0)}k tris\n${STAT.site}${STAT.house ? ' + ' + STAT.house : ''}`; }
}
// 自适应清晰度：连续动画 / 拖动时统计 2 秒，帧率 < 30 就把像素比降到 1.5（只降一次）
let adT = 0, adN = 0;
function adapt(now, moving) {
  if (DPR <= 1.5 || STATS && Q.get('adapt') === '0') return;
  if (!moving) { adT = 0; return; }
  if (!adT) { adT = now; adN = 0; return; }
  adN++;
  if (now - adT > 2000) { const f = adN * 1000 / (now - adT); adT = 0; if (f < 30) { DPR = 1.5; renderer.setPixelRatio(lowRes ? Math.max(1, DPR * 0.75) : DPR); renderer.setSize(innerWidth, innerHeight); } }
}
function onFirstFrame() {
  window.__estateFirstFrame = true; if (window.__estateWatchdog) window.__estateWatchdog();
  loadEl.classList.add('done'); setTimeout(() => { loadEl.innerHTML = ''; loadEl.hidden = true; }, 500);
  window.__estate.firstFrameMs = performance.now() - T0;
  const seen = new Set();
  const rooms = ITEMS.filter((it) => it.kind === 'room' && (it.d.kind === 'card' || it.d.kind === 'restricted') && it.d.name !== PH && !seen.has(it.d.floor + it.d.name) && seen.add(it.d.floor + it.d.name))
    .map((it) => ({ name: it.d.name, en: enName(it.d), floor: it.d.floor, alias: ALIAS[it.d.name] || [] }));
  post({ type: 'estate:ready', floors: FLOORS.map((f) => f.id), rooms: rooms.concat(ITEMS.filter((it) => it.kind === 'area').map((it) => ({ name: it.d.name, en: it.d.en, floor: 'ext', alias: it.d.alias }))) });
  if (mode === 'ext' && !EMBED && !REDUCED && !tween) { const v = viewFor('ext'); v.ease = 'out'; flyTo(v, 2000); }
  // 空闲时预取室内体量（低档不预取，等进内透 / 剖切再取）
  if (!LOW) (window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(() => loadHouse(), { timeout: 4000 });
}

/* ---------------- 启动 ---------------- */
window.__estate = {
  setMode: (m) => setMode(parseFloor(m) ?? m, { fly: true }), focus: (n) => { const it = findByName(n); if (it) focusItem(it); return !!it; },
  find: (n) => { const it = findByName(n); return it ? { kind: it.kind, name: it.d.name, id: it.d.id, floor: it.floor != null ? FLOORS[it.floor].id : null } : null; },
  focusCard: (c) => focusRoomMsg(c.name, c), mode: () => mode, houseState: () => houseState, pinned: () => pinned && { kind: pinned.kind, name: pinned.d.name, id: pinned.d.id },
  tier: () => tier, dpr: () => DPR,
  stats: () => ({ ...lastInfo, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length, tier, low: LOW, files: STAT, times: TB, firstFrameMs: window.__estate.firstFrameMs, tris: STAT.tris }),
  camera, controls, renderer, scene, setLang,
};
buildNav(); relabel(); frustum();
const m0 = parseFloor(Q.get('floor')) ?? 'ext';
setMode(m0);
{ const v0 = viewFor(m0); let z = v0.zoom; if (m0 === 'ext' && !EMBED && !REDUCED) z *= 0.8; camera.zoom = clamp(z, minZoom, maxZoom); camera.updateProjectionMatrix(); placeCam(v0.target, v0.theta, v0.phi); targetY = v0.target.y; }
kick('render');
requestAnimationFrame(loop);
