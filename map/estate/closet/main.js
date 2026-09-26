// 衣帽间样板间 · 场景、灯光、交互、A / B 切换
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { initMaterials, loadReal, applyMode, MATS, MODE, TIER } from './mats.js';
import { buildRoom, procStandins, SLOTS, VIEWS, MIRROR, ROOM } from './build.js';

const Q = new URLSearchParams(location.search);
const EMBED = Q.has('embed'), LANG = Q.get('lang') === 'en' ? 'en' : 'zh', STATS = Q.has('stats');
const COARSE = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
if (EMBED) document.body.classList.add('embed');
const $ = (s) => document.querySelector(s);
const t0 = performance.now();

/* ---------------- 渲染器 ---------------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
const BASE_DPR = Math.min(devicePixelRatio, COARSE ? 1.75 : 2);
renderer.setPixelRatio(BASE_DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping ?? THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = COARSE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // 场景是静态的：阴影只在内容变化时重算一次
const shadowsDirty = () => { renderer.shadowMap.needsUpdate = true; };
$('#app').appendChild(renderer.domElement);
RectAreaLightUniformsLib.init();

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 80);

/* ---------------- 材质与房间 ---------------- */
TIER.mobile = COARSE;
initMaterials(renderer.capabilities.getMaxAnisotropy());
// 漫反射材质少吃环境光（拉开光比），金属 / 玻璃 / 石材保留较高反射
const SHINY = new Set(['brass', 'brassPol', 'gilt', 'steel', 'mirror', 'calacatta', 'nero', 'patent', 'gem', 'ruby', 'pearl', 'porcelain', 'sevres']);
for (const [k, m] of Object.entries(MATS)) if (m.userData.base.envMapIntensity == null) m.envMapIntensity = SHINY.has(k) ? 0.8 : 0.3;
const room = buildRoom(); scene.add(room);
const standins = procStandins(); for (const [k, g] of Object.entries(standins)) { g.traverse(o => { if (o.isMesh) { o.castShadow = k !== 'chand'; o.receiveShadow = true; } }); scene.add(g); }

// 全身镜：真实反射（手机上降分辨率）
const mirrorRes = COARSE ? 384 : 768;
const refl = new Reflector(new THREE.PlaneGeometry(MIRROR.w, MIRROR.h), { textureWidth: mirrorRes * MIRROR.w / MIRROR.h * 1.4, textureHeight: mirrorRes * 1.4, color: 0xd9dcd8, clipBias: 0.003 });
refl.position.set(MIRROR.x + 0.005, MIRROR.y, MIRROR.z); refl.rotation.y = Math.PI / 2; scene.add(refl);
{ const ob = refl.onBeforeRender, bg = new THREE.Color('#1b2026'); refl.onBeforeRender = function (...a) { const prev = scene.background; scene.background = bg; ob.apply(this, a); scene.background = prev; }; }
// 远看用静态镜面材质（省一次整场景渲染），近看（< 6 m）才启用真实反射
const mirrorFlat = new THREE.Mesh(new THREE.PlaneGeometry(MIRROR.w, MIRROR.h), MATS.mirror); mirrorFlat.position.copy(refl.position); mirrorFlat.rotation.copy(refl.rotation); scene.add(mirrorFlat);
function mirrorLOD() { const near = camera.position.distanceTo(refl.position) < 6 && camera.position.x > MIRROR.x + 0.2; refl.visible = near; mirrorFlat.visible = !near; }

/* ---------------- 灯光 ---------------- */
// 窗外日光（从后墙窗洞斜射进来，投影）
const sun = new THREE.DirectionalLight('#fff1dc', 3.5);
sun.position.set(-1.6, 6.5, -9); sun.target.position.set(0.4, 0, 1.2); scene.add(sun, sun.target);
sun.castShadow = true; const SM = COARSE ? 1024 : 2048; sun.shadow.mapSize.set(SM, SM);
Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 20 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
// 吊灯：向下的聚光（投影，给家具落影）+ 点光（暖光填充）
const spot = new THREE.SpotLight('#ffd7a0', 95, 9, 1.15, 0.9, 2); spot.position.set(0, 3.35, 0.25); spot.target.position.set(0, 0, 0.25); scene.add(spot, spot.target);
spot.castShadow = true; spot.shadow.mapSize.set(COARSE ? 1024 : 1536, COARSE ? 1024 : 1536); spot.shadow.bias = -0.0005; spot.shadow.normalBias = 0.02; spot.shadow.radius = 4;
const bulb = new THREE.PointLight('#ffcf8a', 6, 7, 1.6); bulb.position.set(0, 2.75, 0.25); scene.add(bulb);
// 柜内 LED：面光
const rect = (w, h, x, y, z, rx, ry, inten, col = '#ffcf94') => { if (COARSE) return null; const l = new THREE.RectAreaLight(col, inten, w, h); l.position.set(x, y, z); l.rotation.set(rx, ry, 0, 'YXZ'); scene.add(l); return l; };
rect(3.0, 0.08, -2.45, 2.39, -2.62, -Math.PI / 2, 0, 18);           // 挂衣区顶灯带
rect(3.0, 1.7, 2.45, 1.9, -2.05, 0, Math.PI, 3.2);                  // 鞋墙层板灯（朝墙）
rect(0.08, 4.4, 3.72, 0.95, -0.3, -Math.PI / 2, 0, 10);             // 包袋展柜
// 梳妆壁灯
// 手机档：柜内面光合成一盏暖色点光
if (COARSE) { const p = new THREE.PointLight('#ffcf94', 9, 6, 1.6); p.position.set(0, 2.2, -1.9); scene.add(p); }
// 梳妆壁灯：每盏一支向上洗墙的聚光（不投影；手机档省略）+ 一盏点光照台面
if (!COARSE) for (const sd of [-1, 1]) { const l = new THREE.SpotLight('#ffcf8a', 8, 2.5, 0.9, 1, 2); l.position.set(ROOM.x0 + 0.18, 1.72, sd * 0.72); l.target.position.set(ROOM.x0 + 0.02, 2.6, sd * 0.72); scene.add(l, l.target); }
const sconce = new THREE.PointLight('#ffcf8a', 2.2, 3, 1.8); sconce.position.set(ROOM.x0 + 0.4, 1.7, 0); scene.add(sconce);
// 冷色环境补光（窗）
const hemi = new THREE.HemisphereLight('#dfe8f2', '#6b5440', 0.15); scene.add(hemi);

/* ---------------- 视角与交互 ---------------- */
const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, { enableDamping: true, dampingFactor: 0.09, zoomToCursor: true, minDistance: 0.35, maxDistance: 45, screenSpacePanning: true, zoomSpeed: 1.1, rotateSpeed: 0.7, panSpeed: 0.9 });
controls.maxPolarAngle = Math.PI * 0.62;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

const ROOMBOX = [new THREE.Vector3(ROOM.x0 - 0.3, -0.3, ROOM.z0 - 0.3), new THREE.Vector3(ROOM.x1 + 0.3, ROOM.h, ROOM.z1 + 0.3)];
function fitView(v) {
  const V = VIEWS[v]; const pos = new THREE.Vector3(...V.pos), tgt = new THREE.Vector3(...V.tgt);
  if (v === 'overview') {
    // 总览：按房间包围盒 8 个角点投影二分出距离，保证竖屏也不裁切（留出上下按钮的位置）
    const dir = pos.clone().sub(tgt).normalize(), cam = camera.clone(); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
    const corners = []; for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) corners.push(new THREE.Vector3(ROOMBOX[x].x, ROOMBOX[y].y, ROOMBOX[z].z));
    const lim = innerWidth < 640 ? [0.96, 0.74] : [0.98, 0.88];
    let lo = 3, hi = 60; for (let i = 0; i < 30; i++) { const d = (lo + hi) / 2; cam.position.copy(tgt).addScaledVector(dir, d); cam.lookAt(tgt); cam.updateMatrixWorld();
      const ok = corners.every(c => { const p = c.clone().project(cam); return Math.abs(p.x) < lim[0] && Math.abs(p.y) < lim[1]; }); if (ok) hi = d; else lo = d; }
    pos.copy(tgt).addScaledVector(dir, hi); return { pos, tgt };
  }
  const aspect = innerWidth / innerHeight;
  if (aspect < 1) { const f = Math.min(1.5, 1 / aspect); pos.sub(tgt).multiplyScalar(Math.sqrt(f)).add(tgt); }
  return { pos, tgt };
}
let tween = null, curView = Q.get('view') in VIEWS ? Q.get('view') : 'overview';
function flyTo(pos, tgt, dur = 900) { tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: tgt, s: performance.now(), dur }; kick(); }
function goView(v, instant) {
  curView = v; const { pos, tgt } = fitView(v);
  if (instant) { camera.position.copy(pos); controls.target.copy(tgt); controls.update(); } else flyTo(pos, tgt);
  document.querySelectorAll('#views button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
}
const vnav = $('#views');
for (const [k, V] of Object.entries(VIEWS)) { const b = document.createElement('button'); b.dataset.v = k; b.textContent = LANG === 'en' ? V.en : V.zh; b.onclick = () => goView(k); vnav.appendChild(b); }

function dolly(f) { const off = camera.position.clone().sub(controls.target); const d = THREE.MathUtils.clamp(off.length() * f, controls.minDistance, controls.maxDistance); flyTo(controls.target.clone().add(off.setLength(d)), controls.target.clone(), 320); }
$('#zin').onclick = () => dolly(0.7); $('#zout').onclick = () => dolly(1.4); $('#zreset').onclick = () => goView('overview');

// 双击 / 双指轻点：拉近到点中的位置
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pick(x, y) { ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); const hit = ray.intersectObjects(scene.children, true).find(h => h.object.visible && h.object.isMesh && !(h.object.material && h.object.material.transparent && h.object.material.opacity < 0.3)); return hit ? hit.point : null; }
function zoomAt(x, y) { const p = pick(x, y); if (!p) return; const off = camera.position.clone().sub(controls.target); const d = Math.max(0.8, Math.min(off.length() * 0.45, 2.4)); flyTo(p.clone().add(off.setLength(d)), p, 650); }
renderer.domElement.addEventListener('dblclick', (e) => zoomAt(e.clientX, e.clientY));
let lastTap = 0, tapXY = null, downXY = null;
renderer.domElement.addEventListener('pointerdown', (e) => { tween = null; downXY = [e.clientX, e.clientY, performance.now()]; kick(); });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (e.pointerType === 'mouse' || !downXY) return; const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]); if (moved > 12 || performance.now() - downXY[2] > 300) return;
  const now = performance.now(); if (now - lastTap < 320 && tapXY && Math.hypot(e.clientX - tapXY[0], e.clientY - tapXY[1]) < 30) { zoomAt(e.clientX, e.clientY); lastTap = 0; } else { lastTap = now; tapXY = [e.clientX, e.clientY]; }
});
// 双指轻点：两指都在 250 ms 内抬起、位移 < 10 px → 以两指中点拉近
const touches = new Map(); let twoTap = null;
renderer.domElement.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; touches.set(e.pointerId, [e.clientX, e.clientY]); if (touches.size === 2) { const p = [...touches.values()]; twoTap = { t: performance.now(), p: p.map(q => q.slice()), n: 0, ok: true }; } else if (touches.size > 2) twoTap = null; });
renderer.domElement.addEventListener('pointermove', (e) => { if (!twoTap || !touches.has(e.pointerId)) return; const i = [...touches.keys()].indexOf(e.pointerId); const p0 = twoTap.p[i]; if (p0 && Math.hypot(e.clientX - p0[0], e.clientY - p0[1]) > 10) twoTap.ok = false; });
const endTouch = (e) => { if (!touches.has(e.pointerId)) return; touches.delete(e.pointerId); if (twoTap && ++twoTap.n === 2) { if (twoTap.ok && performance.now() - twoTap.t < 250) { const [a1, b1] = twoTap.p; zoomAt((a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2); } twoTap = null; } };
renderer.domElement.addEventListener('pointerup', endTouch); renderer.domElement.addEventListener('pointercancel', endTouch);
renderer.domElement.addEventListener('wheel', (e) => { e.preventDefault(); kick(); }, { passive: false });
controls.addEventListener('change', kick);
addEventListener('keydown', (e) => { if (e.key === '+' || e.key === '=') dolly(0.7); else if (e.key === '-') dolly(1.4); else if (e.key === '0') goView('overview'); else if (e.key === 'a' || e.key === 'A') setMode(MODE === 'A' ? 'B' : 'A'); });

/* ---------------- A / B ---------------- */
const glbGroups = {}; let glbReady = false, realReady = false;
function syncStandins() { for (const [k, g] of Object.entries(standins)) g.visible = !(MODE === 'B' && glbGroups[k]); for (const [k, g] of Object.entries(glbGroups)) g.visible = MODE === 'B'; }
function setMode(m) {
  applyMode(m); syncStandins(); shadowsDirty();
  document.querySelectorAll('#ab button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  toast(m === 'A' ? 'A：程序几何 + 程序材质' : (realReady ? 'B：CC0 扫描材质 + 真实模型' : 'B：真实素材加载中…'));
  const u = new URL(location.href); u.searchParams.set('mode', m); history.replaceState(null, '', u); kick(true);
}
document.querySelectorAll('#ab button').forEach(b => b.onclick = () => setMode(b.dataset.m));
let toastT; function toast(s) { const el = $('#toast'); el.textContent = s; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 3200); }

/* ---------------- 真实模型（B） ---------------- */
const MODELS = { clock: 'vintage_grandfather_clock_01', mirror: 'ornate_mirror_01', chand: 'Chandelier_03', chest: 'treasure_chest', frame: 'fancy_picture_frame_01', watch: 'vintage_pocket_watch', vase: 'antique_ceramic_vase_01' };
const FIT = { clock: 'floor', mirror: 'wall', chand: 'ceiling', chest: 'floor', frame: 'wall', watch: 'flat', vase: 'floor' };
const EXTRA_RY = { clock: 0, mirror: 0, chand: 0, chest: 0, frame: 0, watch: 0, vase: 0 };
async function loadModels() {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const base = new URL('./assets/models/', import.meta.url).href;
  await Promise.all(Object.entries(MODELS).map(async ([slot, file]) => {
    try {
      const gltf = await loader.loadAsync(base + file + '.glb'); const obj = gltf.scene; const S = SLOTS[slot];
      const small = slot === 'watch' || slot === 'vase' || slot === 'frame' || slot === 'mirror';
      obj.traverse(o => { if (o.isMesh) { o.castShadow = !small && slot !== 'chand'; o.receiveShadow = true; const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { m.envMapIntensity = 0.7; if (m.map) m.map.anisotropy = 8; if (m.transmission > 0) { m.transmission = 0; m.transparent = true; m.opacity = 0.18; m.depthWrite = false; m.roughness = Math.min(m.roughness, 0.08); } }); } });
      const wrap = new THREE.Group(); wrap.add(obj);
      if (FIT[slot] === 'flat') obj.rotation.x = -Math.PI / 2;
      let bb = new THREE.Box3().setFromObject(obj); const size = bb.getSize(new THREE.Vector3());
      const s = S.h / (FIT[slot] === 'flat' ? Math.max(size.x, size.z) : size.y); obj.scale.multiplyScalar(s);
      wrap.rotation.y = S.ry + EXTRA_RY[slot]; wrap.updateMatrixWorld(true);
      bb = new THREE.Box3().setFromObject(wrap); const c = bb.getCenter(new THREE.Vector3());
      const [px, py, pz] = S.pos; const d = new THREE.Vector3(px - c.x, 0, pz - c.z);
      if (FIT[slot] === 'floor' || FIT[slot] === 'flat') d.y = py - bb.min.y;
      if (FIT[slot] === 'ceiling') d.y = py - bb.max.y;
      if (FIT[slot] === 'wall') { d.y = py - c.y; d.x = px - bb.min.x; }
      wrap.position.add(d); wrap.name = 'B:' + slot; scene.add(wrap); glbGroups[slot] = wrap;
      if (slot === 'mirror') { // 原模型镜面做旧过重：只保留外框，在镜片前加一块干净的拱形镜面
        wrap.updateMatrixWorld(true); const b2 = new THREE.Box3().setFromObject(wrap), sz = b2.getSize(new THREE.Vector3()), cz = (b2.min.z + b2.max.z) / 2;
        const w = sz.z * 0.74, h = sz.y * 0.78, r = w / 2, sh = new THREE.Shape(); sh.moveTo(-r, -h / 2); sh.lineTo(r, -h / 2); sh.lineTo(r, h / 2 - r); sh.absarc(0, h / 2 - r, r, 0, Math.PI, false); sh.lineTo(-r, -h / 2);
        const glass = new THREE.Mesh(new THREE.ShapeGeometry(sh, 24), MATS.mirror); glass.rotation.y = Math.PI / 2; glass.position.set(b2.min.x + sz.x * 0.55, b2.min.y + sz.y * 0.47, cz); wrap.attach(glass); }
    } catch (e) { console.warn('model fail', slot, e); }
  }));
  glbReady = true; syncStandins(); shadowsDirty(); kick(true);
}

/* ---------------- 渲染循环（按需渲染：交互 / 动画时连续，静止时停） ---------------- */
let running = false, idleFrames = 0, frames = 0, fpsT = performance.now(), fps = 0;
function kick(force) { idleFrames = force ? 3 : Math.max(idleFrames, 2); if (!running) { running = true; requestAnimationFrame(loop); } }
function loop(now) {
  if (tween) { const k = Math.min(1, (now - tween.s) / tween.dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.t0, tween.t1, e); if (k >= 1) tween = null; }
  const moved = controls.update(); mirrorLOD();
  const busy = !!tween || moved || benchN > 0; if (COARSE) { const want = busy ? 1.25 : BASE_DPR; if (renderer.getPixelRatio() !== want) renderer.setPixelRatio(want); }
  if (camera.position.y < 0.2) camera.position.y = 0.2;
  renderer.render(scene, camera); frames++;
  if (now - fpsT > 500) { fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; if (STATS) showStats(); }
  if (tween || moved) idleFrames = 2; else idleFrames--;
  if (COARSE && idleFrames === 1 && renderer.getPixelRatio() !== BASE_DPR) idleFrames = 2; // 停下后按高分辨率补画一帧
  if (idleFrames > 0 || benchN > 0) requestAnimationFrame(loop); else running = false;
}
function showStats() { const i = renderer.info; $('#stats').style.display = 'block'; $('#stats').textContent = `${fps.toFixed(0)} fps · ${MODE}\ncalls ${i.render.calls}  tris ${(i.render.triangles / 1000).toFixed(0)}k\ntex ${i.memory.textures}  geo ${i.memory.geometries}`; }

// 基准：连续渲染 N 帧，返回平均帧时间（供性能报告）
let benchN = 0;
function bench(n = 120) { return new Promise(res => { const ts = []; let last = performance.now(); benchN = n; const step = () => { const now = performance.now(); ts.push(now - last); last = now; camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.004); controls.update(); renderer.render(scene, camera); if (--benchN > 0) requestAnimationFrame(step); else { ts.shift(); ts.sort((a, b) => a - b); const avg = ts.reduce((a, b) => a + b, 0) / ts.length; res({ avgMs: +avg.toFixed(2), p95Ms: +ts[Math.floor(ts.length * 0.95)].toFixed(2), fps: +(1000 / avg).toFixed(1), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, mode: MODE, dpr: renderer.getPixelRatio(), size: [innerWidth, innerHeight] }); } }; requestAnimationFrame(step); }); }

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); kick(true); });

/* ---------------- 素材来源面板 ---------------- */
$('#credits').innerHTML = `<h3>素材来源（全部 CC0，可再分发）</h3><ul style="padding-left:16px;margin:0">
<li><b>材质</b> Poly Haven：European Walnut Veneer 04、Herringbone Parquet、Velour Velvet、Brown Leather、Crepe Satin、Rough Linen、Poly Wool Herringbone、Quatrefoil Jacquard</li>
<li><b>石材</b> ambientCG：Marble014（卡拉卡塔金）、Marble016（黑金花）</li>
<li><b>模型</b> Poly Haven：Vintage Grandfather Clock 01、Ornate Mirror 01、Chandelier 03、Treasure Chest、Fancy Picture Frame 01、Vintage Pocket Watch、Antique Ceramic Vase 01</li>
<li>其余（柜体、衣物、鞋包、地毯、纹章）为程序生成；纹章为虚构。</li>
<li>明细：<a href="assets/CREDITS.md" target="_blank">assets/CREDITS.md</a></li></ul>`;
$('#credit').onclick = () => $('#credits').classList.toggle('on');

/* ---------------- 启动 ---------------- */
goView(curView, true); shadowsDirty();
const want = Q.get('mode') === 'A' ? 'A' : 'B';
setMode('A'); if (want === 'A') setMode('A');
renderer.render(scene, camera);
const firstFrame = performance.now() - t0;
$('#loading').classList.add('done');
const bar = $('#loading b');
const info = { firstFrameMs: Math.round(firstFrame), realTexMs: null, modelsMs: null };
(async () => {
  if (want === 'B') { $('#loading').classList.remove('done'); $('#loading').firstChild.textContent = '2/3 真实材质…'; }
  const tA = performance.now();
  await loadReal(p => { bar.style.width = (p * 100).toFixed(0) + '%'; });
  realReady = true; info.realTexMs = Math.round(performance.now() - tA);
  if (want === 'B' && MODE === 'A') setMode('B'); else if (MODE === 'B') setMode('B');
  $('#loading').classList.add('done');
  if (want === 'B') { $('#loading').classList.remove('done'); $('#loading').firstChild.textContent = '3/3 古董陈设…'; bar.style.width = '0%'; }
  const tM = performance.now(); await loadModels(); $('#loading').classList.add('done'); info.modelsMs = Math.round(performance.now() - tM);
  window.__closet.ready = true;
})();

window.__closet = { setMode, view: (v) => goView(v, true), bench, info, renderer, scene, camera, controls, ready: false, kick };
