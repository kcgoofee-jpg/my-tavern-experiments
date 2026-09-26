// 伊甸庄园 · 场景、相机、楼层剖切、标签、房间卡、缩放交互、画质分级、传承导览与嵌入协议（协议说明见 index.html 顶部注释）
// 对 plan / building / site / furniture 一律用命名空间导入并做存在性检查：其它工作包改到一半时页面仍能运行。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as L from './lib.js';
import * as P from './plan.js';
import * as BLD from './building.js';
import * as SITE from './site.js';
import * as FUR from './furniture.js';

const T0 = performance.now();
const Q = new URLSearchParams(location.search);
const IN_FRAME = window.parent !== window;
const EMBED = Q.get('embed') === '1' || location.protocol === 'about:';
const STATS = Q.get('stats') === '1';
const DEBUG = Q.get('debug') === '1';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = matchMedia('(pointer: coarse)').matches;
let LANG = Q.get('lang') === 'en' ? 'en' : 'zh';
let THEME = Q.get('theme') === 'light' ? 'light' : 'dark';
document.body.classList.toggle('embed', EMBED);
document.documentElement.dataset.theme = THEME;
const $ = (s) => document.querySelector(s);
const app = $('#app');
let needs = true;
const clamp = THREE.MathUtils.clamp;

/* ---------------- 数据（带兜底） ---------------- */
const FLOORS = P.FLOORS, ROOMS = P.ROOMS || [], AREAS = P.AREAS || [], SHAFTS = P.SHAFTS || [];
const CUT = P.CUT ?? 1.2, EN = P.EN || {}, FLOOR_EN = P.FLOOR_EN || ['State', 'Daily', 'Private', 'Service', 'Lookout'], SRC_EN = P.SRC_EN || {};
const HERITAGE = Array.isArray(P.HERITAGE) ? P.HERITAGE : [];
const rankOf = (r) => r.rank ?? (r.minor ? 3 : (r.r[1] - r.r[0]) * (r.r[3] - r.r[2]) >= 150 ? 1 : 2);
// 主楼 + 两翼 + 塔亭的外包（楼层视图按它适配）
const EXT = (() => { let x0 = 0, x1 = 0, z0 = 0, z1 = 0; for (const r of ROOMS) { x0 = Math.min(x0, r.r[0]); x1 = Math.max(x1, r.r[1]); z0 = Math.min(z0, r.r[2]); z1 = Math.max(z1, r.r[3]); } return { x0, x1, z0, z1, w: Math.max(40, 2 * Math.max(-x0, x1)), d: Math.max(20, z1 - z0), cz: (z0 + z1) / 2 }; })();

/* ---------------- 画质分级 T0 / T1 / T2 ---------------- */
const qTier = Q.get('tier');
const TIER_FIXED = qTier != null && /^[012]$/.test(qTier);
let tier = TIER_FIXED ? +qTier : (COARSE || (navigator.deviceMemory || 8) <= 4 || innerWidth < 700) ? 1 : 0;
const MAT_TIER = tier;           // 材质档在启动时定，运行时降档不换材质
const DPR_CAP = [2, 1.5, 1];
const dprFor = (t) => Math.min(window.devicePixelRatio || 1, DPR_CAP[t]);
let dpr = dprFor(tier), lowRes = false;

/* ---------------- 渲染器 ---------------- */
const renderer = new THREE.WebGLRenderer({ antialias: tier === 0, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(dpr);
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = tier < 2; renderer.shadowMap.type = tier === 0 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
app.prepend(renderer.domElement);
const labelR = new CSS2DRenderer({ element: $('#labels') }); labelR.setSize(innerWidth, innerHeight);
document.body.classList.add('grade');
const T_GL = performance.now() - T0;
const kick = (phase) => { try { window.__estateKick && window.__estateKick(phase); } catch (e) { } };   // 看门狗：每个构建阶段重新计时
const yieldUI = () => new Promise((r) => setTimeout(r, 0));

const scene = new THREE.Scene();
// 环境光照：RoomEnvironment 先渲进 64 px 立方体，再做 PMREM（比 fromScene 的 256 px 便宜很多）
{ const pmrem = new THREE.PMREMGenerator(renderer), env = new RoomEnvironment(renderer);
  try { const rt = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType }); const cc = new THREE.CubeCamera(0.1, 100, rt); cc.update(renderer, env); scene.environment = pmrem.fromCubemap(rt.texture).texture; rt.dispose(); }
  catch (e) { scene.environment = pmrem.fromScene(env, 0.04).texture; }
  env.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); pmrem.dispose(); }
const TB = { gl: T_GL, env: performance.now() - T0 - T_GL }; { const t0 = performance.now(); L.initMaterials(null, MAT_TIER); if (typeof L.initProtos === 'function') L.initProtos(); TB.mats = performance.now() - t0; }
for (const m of Object.values(L.MATS)) if (m && m.envMapIntensity === 1) m.envMapIntensity = 0.6;
// 室外淡暖雾：常驻（切换 fog 会重编译着色器），楼层模式把距离推远等于关闭
const FOG_ON = [480, 2125], FOG_OFF = [1e5, 1e5 + 1];
scene.fog = new THREE.Fog('#e9d9bd', ...FOG_ON);

/* ---------------- 光：黄金时刻的太阳 + 半球光 + 固定数量的室内暖光 ---------------- */
const hemi = new THREE.HemisphereLight('#dfe6f0', '#6b5a44', 0.38); scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffd9a0', 3.4);
const SUN_DIR = new THREE.Vector3(-0.9, 0.26, 0.34).normalize();   // 高度约 15°，西南偏西：长影子
sun.castShadow = tier < 2; const SM = tier === 0 ? 2048 : 1024; sun.shadow.mapSize.set(SM, SM);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);
let shadowTight = null;
function fitShadow(tight) {
  if (tight === shadowTight) return; shadowTight = tight;
  const c = sun.shadow.camera, h = tight ? Math.max(70, EXT.w / 2 + 16) : 400;
  sun.target.position.set(0, 0, tight ? EXT.cz : 25); sun.position.copy(SUN_DIR).multiplyScalar(900).add(sun.target.position);
  c.left = -h; c.right = h; c.top = h; c.bottom = -h; c.near = 300; c.far = 1700; c.updateProjectionMatrix();
  sun.target.updateMatrixWorld(); renderer.shadowMap.needsUpdate = true;
}
// 每层一盏 + 焦点光（T0 2 / T1 1 / T2 0）；数量全程不变，只调强度（灯数变化会让所有着色器重编译）
const WARM = '#ffcf8a', FLOOR_I = 12, FOCUS_I = 6, LIGHT_UP = 10;   // 剖切视图没有顶棚：灯放高一点，整层均匀微暖，不出亮斑
const floorLights = FLOORS.map((f) => { const l = new THREE.PointLight(WARM, 0, 110, 1.2); l.position.set(0, f.y + LIGHT_UP, EXT.cz); scene.add(l); return l; });
const focusLights = Array.from({ length: [0, 1, 0][MAT_TIER] }, () => { const l = new THREE.PointLight(WARM, 0, 26, 1.2); scene.add(l); return l; });
// 桌面（T0）：房间暖光池，固定 6 盏，跟着当前楼层里离视点最近的主房间 / 盥洗室走（只移动、调强度）
const ROOM_WARM = '#ffd9a0', ROOM_I = 3;
const roomLights = Array.from({ length: MAT_TIER === 0 ? 6 : 0 }, () => { const l = new THREE.PointLight(ROOM_WARM, 0, 10, 2); scene.add(l); return l; });

/* ---------------- 相机与控制 ---------------- */
const BASE = 60, DIST = 900;
const camera = new THREE.OrthographicCamera(-BASE, BASE, BASE, -BASE, 1, 3000);
let minZoom = 0.1, maxZoom = 20, maxIn = 60;
const maxZ = () => (typeof mode === 'number' ? maxIn : maxZoom);   // 室内允许拉到画面高约 2 m（看清马桶、毛巾）
const barBox = () => { const bar = document.getElementById('floors'); if (!bar || !bar.offsetWidth) return null; const r = bar.getBoundingClientRect(); return { r, horiz: r.width > r.height }; };
function frustum() {
  const a = innerWidth / innerHeight; camera.left = -BASE * a; camera.right = BASE * a; camera.top = BASE; camera.bottom = -BASE; camera.updateProjectionMatrix();
  minZoom = Math.min(2 * BASE * a / 820, 2 * BASE / 720); maxZoom = 2 * BASE / 7; maxIn = 2 * BASE / 2.0;
  // 楼层条占掉的地方：桌面在左侧（画面中心右移），手机在底部（画面中心上移）
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
Object.assign(controls, { enableDamping: true, dampingFactor: 0.14, rotateSpeed: 0.55, screenSpacePanning: true, enableZoom: false, minPolarAngle: 0.18, maxPolarAngle: 1.3 });
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.PAN };
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
const AZ = 0.42;
function placeCam(target, theta, phi) {
  camera.position.set(target.x + DIST * Math.sin(phi) * Math.sin(theta), target.y + DIST * Math.cos(phi), target.z + DIST * Math.sin(phi) * Math.cos(theta));
  controls.target.copy(target); camera.lookAt(target);
}
// 在给定方位下，一个 w × d（x × z）、高 h 的盒子投影到屏幕上的宽高
function projExtent(w, d, h, theta, phi) {
  const c = Math.abs(Math.cos(theta)), s = Math.abs(Math.sin(theta));
  return [w * c + d * s, (w * s + d * c) * Math.cos(phi) + h * Math.sin(phi)];
}

/* ---------------- 构建：外观先出，各层剖切 / 家具 / 细件延迟 ---------------- */
const NEWAPI = typeof BLD.buildCut === 'function';
if (typeof BLD.setRooms === 'function') BLD.setRooms((fi) => ROOMS.filter((r) => r.floor === fi));
// T1 用更粗的分块、子批次不分块，控制 draw call（≤ 150）
const TILE = Q.has('tile') ? +Q.get('tile') : tier >= 1 ? 256 : 128;
const full = FLOORS.map((f, i) => new L.Batch('full' + i)), cut = FLOORS.map((f, i) => new L.Batch('cut' + i)), site = new L.Batch('site', { tile: TILE, subTile: tier >= 1 ? 0 : 256 });
kick('house'); await yieldUI();
let t = performance.now();
if (NEWAPI) BLD.buildHouse(full, site); else { BLD.buildHouse(full, cut, site); if (typeof BLD.buildWings === 'function') BLD.buildWings(site); }
TB.house = performance.now() - t; kick('site'); await yieldUI(); t = performance.now();
if (typeof SITE.buildIsland === 'function') SITE.buildIsland(scene, site);
if (typeof SITE.buildGardens === 'function') SITE.buildGardens(site);
TB.site = performance.now() - t; kick('merge'); await yieldUI(); t = performance.now();
const SUBS = [];   // 所有带子批次的组：按相机方位 / 可见宽度切换
const reg = (g) => { if (g && g.userData && g.userData.subs) SUBS.push(g); return g; };
const siteG = reg(site.build({ defer: ['fine'] })); scene.add(siteG);
const fullG = full.map((b) => { const g = reg(b.build({ defer: ['fine'] })); scene.add(g); return g; });
TB.merge = performance.now() - t;

/* ---------------- 树的 LOD：远看（m/px > 0.12）和 T1 用低面数原型（WP-B 的 crownLo / trunkLo，没有就本地生成） ---------------- */
function loGeom(name) {
  const P_ = L.PROTO || {};
  const own = P_[name + 'Lo'] || (name.startsWith('crown') || name === 'ball' ? P_.crownLo : name === 'trunk' ? P_.trunkLo : null);
  if (own && own.geom) return own.geom;
  let g;
  if (name.startsWith('crown') || name === 'ball') g = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
  else if (name === 'trunk') g = new THREE.CylinderGeometry(0.6, 1, 1, 4, 1, true).translate(0, 0.5, 0).toNonIndexed();
  else return null;
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const f = name === 'trunk' ? 1 : 0.62 + 0.46 * (p.getY(i) + 1) / 2; c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = f; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('uv'); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.count * 2), 2));
  return g;
}
const LODI = [];
{ const lo = {}; siteG.traverse((o) => { if (!o.isInstancedMesh || !/^(crown\w*|ball|trunk)$/.test(o.name)) return; if (!(o.name in lo)) lo[o.name] = loGeom(o.name); if (lo[o.name]) LODI.push({ im: o, hi: o.geometry, lo: lo[o.name] }); }); }
let loOn = null;
function setLo(on) { if (on === loOn) return; loOn = on; for (const e of LODI) e.im.geometry = on ? e.lo : e.hi; renderer.shadowMap.needsUpdate = true; }

const floorG = FLOORS.map((f, i) => { const g = new THREE.Group(); g.name = 'floor' + i; g.visible = false; scene.add(g); return g; });
const cutG = [], furnG = [];
let subDirty = true;
function warm(g) {   // 提前编译新建楼层的着色器，首次切层不卡
  if (typeof renderer.compileAsync !== 'function') return;
  const v = [], p = []; for (let o = g; o; o = o.parent) { p.push(o); v.push(o.visible); o.visible = true; }
  try { if (renderer.extensions.has('KHR_parallel_shader_compile')) renderer.compileAsync(g, camera, scene).catch(() => { }); else renderer.compile(g, camera, scene); } catch (e) { }
  p.forEach((o, i) => { o.visible = v[i]; });
}
function ensureCut(i) {
  if (cutG[i]) return cutG[i];
  const t0 = performance.now();
  try { if (NEWAPI) BLD.buildCut(cut[i], i); } catch (e) { console.error('buildCut', i, e); }
  const g = reg(cut[i].build({ defer: ['fine'] })); g.name = 'cut' + i; g.visible = mode !== 'ext';
  floorG[i].add(g); cutG[i] = g; floorG[i].userData.cut = g;
  TB['cut' + i] = performance.now() - t0;
  warm(g); renderer.shadowMap.needsUpdate = true; needs = true; subDirty = true;
  return g;
}

/* ---------------- 家具：按任务切片建（WP-B 的 furnishJobs，没有就整层一次 furnish）；顺便探出马桶、毛巾的位置 ---------------- */
const furnState = [];
const PROBE = FLOORS.map(() => ({ wc: [], towel: [] }));
function probeFor(fi) {
  const fy = FLOORS[fi].y, box = new THREE.Box3(), c = new THREE.Vector3(), sz = new THREE.Vector3();
  return (key, g) => {
    const tw = key.startsWith('towel'), pc = key === 'porcelain' || key.startsWith('porcelain');
    if (!tw && !pc) return;
    box.setFromBufferAttribute(g.attributes.position); box.getCenter(c); box.getSize(sz);
    const dy = c.y - fy;
    if (tw) { if (dy > 0.2 && dy < 2.2) PROBE[fi].towel.push([c.x, dy, c.z]); }
    else if (dy > 0.1 && dy < 0.6 && Math.max(sz.x, sz.z) < 0.75 && sz.y < 0.7) PROBE[fi].wc.push([c.x, dy, c.z]);
  };
}
function furnStart(i) {
  if (furnState[i]) return furnState[i];
  const b = new L.Batch('furn' + i); let it = null;
  if (typeof FUR.furnishJobs === 'function') { try { const j = FUR.furnishJobs(b, i); if (j && typeof j[Symbol.iterator] === 'function') it = j[Symbol.iterator](); } catch (e) { console.error('furnishJobs', i, e); } }
  if (!it) it = [() => { if (typeof FUR.furnish === 'function') FUR.furnish(b, i); }][Symbol.iterator]();
  return (furnState[i] = { b, it, done: false, ms: 0 });
}
function furnStep(i, budget) {   // 跑到预算用完；返回是否已建完
  if (furnG[i]) return true;
  const st = furnStart(i), t0 = performance.now();
  L.Batch.probe = probeFor(i);
  try {
    while (!st.done) {
      let r; try { r = st.it.next(); } catch (e) { console.error('furnish', i, e); st.done = true; break; }
      if (r.done) { st.done = true; break; }
      if (typeof r.value === 'function') { try { r.value(); } catch (e) { console.error('furnish job', i, e); } }
      if (budget != null && performance.now() - t0 > budget) break;
    }
  } finally { L.Batch.probe = null; st.ms += performance.now() - t0; }
  if (!st.done) return false;
  const g = reg(st.b.build({ defer: ['fine'] })); furnG[i] = g; floorG[i].add(g);
  if (tier >= 1) g.traverse((o) => { o.castShadow = false; });
  TB['furn' + i] = st.ms;
  makeCloseups(i);
  warm(g); renderer.shadowMap.needsUpdate = true; needs = true; subDirty = true;
  if (pinned && pinned.floor === i && cardFor === pinned) { cardFor = null; showCard(pinned); }
  return true;
}
const ensureFurn = (i) => { furnStep(i, null); return furnG[i]; };
const shaftG = typeof BLD.buildShafts === 'function' ? BLD.buildShafts(floorG) : FLOORS.map((f, i) => { const g = new THREE.Group(); floorG[i].add(g); return g; });
const T_BUILD = performance.now() - T0;

/* ---------------- 数据项：房间 / 区域 / 竖井 / 传承件 ---------------- */
const pickMat = new THREE.MeshBasicMaterial({ visible: false });
const ITEMS = [];
ROOMS.forEach((r) => {
  const [x0, x1, z0, z1] = r.r, f = FLOORS[r.floor]; if (!f) return;
  const it = { kind: 'room', d: r, floor: r.floor, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, dd: z1 - z0, y: f.y, rank: rankOf(r) };
  const m = new THREE.Mesh(new THREE.BoxGeometry(it.w, CUT + 0.2, it.dd), pickMat); m.position.set(it.cx, f.y + (CUT + 0.2) / 2, it.cz); m.userData.item = it; floorG[r.floor].add(m); it.pick = m;
  const lp = r.lp || [it.cx, it.cz];
  it.label = mkLabel(floorG[r.floor], lp[0], f.y + (r.floor === 4 ? 1.9 : CUT + 0.9), lp[1], 'room');
  it.pri = (4 - it.rank) * 10000 + it.w * it.dd * (r.minor ? 0.2 : 1); ITEMS.push(it);
});
AREAS.forEach((a) => {
  const it = { kind: 'area', d: a, floor: null, cx: a.x, cz: a.z, w: a.w || a.r * 2, dd: a.d || a.r * 2, y: 0, round: !!a.r || !!a.ell, rank: (a.pri ?? 5) <= 4 ? 3 : 1 };
  const hgt = a.h || (a.pri >= 10 ? 30 : /楼|机库|塔|音乐厅|橘园|温室/.test(a.name) ? 16 : 1.5);
  const g = it.round ? new THREE.CylinderGeometry(1, 1, hgt, 32).scale(it.w / 2, 1, it.dd / 2) : new THREE.BoxGeometry(it.w, hgt, it.dd);
  const m = new THREE.Mesh(g, pickMat); m.position.set(a.x, hgt / 2, a.z); m.userData.item = it; scene.add(m); it.pick = m;
  it.label = mkLabel(scene, a.x, a.y ?? 3, a.z, 'area'); it.pri = (a.pri ?? 5) * 1000; ITEMS.push(it);
});
SHAFTS.forEach((s) => {
  const [x0, x1, z0, z1] = s.r; const it = { kind: 'shaft', d: s, floor: null, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, dd: z1 - z0, picks: [] };
  (shaftG || []).forEach((g) => g.children.forEach((c) => { if (c.userData.shaft === s) { c.userData.item = it; it.picks.push(c); } }));
  ITEMS.push(it);
});
// 「全部」视图的楼层牌放在右侧立面外、左对齐，不会被左边的楼层条挡住
const floorTags = FLOORS.map((f, i) => { const rs = ROOMS.filter((r) => r.floor === i); const x = rs.length ? Math.max(...rs.map((r) => r.r[1])) + 3 : 44; const o = mkLabel(floorG[i], x, f.y + 0.6, rs.length ? Math.max(...rs.map((r) => r.r[3])) : 13, 'floor'); o.center.set(0, 0.5); return o; });
// 传承件 ◆ 标记
const HITEMS = HERITAGE.map((h) => {
  const it = { kind: 'heritage', d: h, floor: h.floor ?? null, cx: h.x, cz: h.z, w: 2, dd: 2, y: h.y };
  const parent = it.floor != null && floorG[it.floor] ? floorG[it.floor] : scene;
  const el = document.createElement('div'); el.className = 'mk'; el.appendChild(document.createElement('i'));
  el.addEventListener('click', (e) => { e.stopPropagation(); pin(it, false); });
  el.addEventListener('dblclick', (e) => { e.stopPropagation(); focusHeritage(it); });
  el.addEventListener('pointerenter', () => { if (!pinned) showCard(it, null); });
  el.addEventListener('pointerleave', () => { if (!pinned) hideCard(); });
  const o = new CSS2DObject(el); o.position.set(h.x, h.y ?? 0, h.z); o.visible = false; parent.add(o); it.mk = o; return it;
});

function mkLabel(parent, x, y, z, cls) {
  const el = document.createElement('div'); el.className = 'lbl ' + cls; el.appendChild(document.createElement('span'));
  const o = new CSS2DObject(el); o.position.set(x, y, z); o.center.set(0.5, 0.5); o.visible = false; parent.add(o); return o;
}
const enOf = (name) => EN[name] || [];
const nameOf = (it) => LANG === 'en' ? (it.kind === 'heritage' ? it.d.en || it.d.name : enOf(it.d.name)[0] || it.d.name) : it.d.name;
const useOf = (it) => LANG === 'en' ? enOf(it.d.name)[1] || it.d.use : it.d.use;
const heritageOf = (it) => LANG === 'en' ? enOf(it.d.name)[2] || it.d.heritage_en || '' : it.d.heritage || '';
const floorName = (i) => LANG === 'en' ? `${FLOORS[i].label} · ${FLOOR_EN[i]}` : `${FLOORS[i].label} · ${FLOORS[i].name}`;
function relabel() {
  for (const it of ITEMS) if (it.label) { it.label.element.firstChild.textContent = nameOf(it); it.lw = 0; }
  floorTags.forEach((o, i) => { o.element.firstChild.textContent = floorName(i); });
  HITEMS.forEach((it) => { it.mk.element.title = nameOf(it); });
}

/* ---------------- UI 文案 ---------------- */
const TXT = {
  zh: { ext: '外观', all: '全部', shafts: '竖井', tour: '传承', title: '伊甸家族府邸', motto: '始建约一百九十年 · HORTUS SUPRA NUBES', sub: '帕拉第奥五段式 · 204 m 立面', hint: '拖动旋转 · 右键 / 双指平移 · 滚轮 / 捏合 / + − 缩放 · 双击房间拉近，双击空白或按 0 复位', zin: '放大', zout: '缩小', zreset: '复位', floor: '楼层', size: '尺寸', use: '用途', src: '出处', thru: '贯穿各层', estate: '室外', dia: '直径', her: '传承细节', era: '年代', heritage: '传承件', loading: '加载中…', prev: '上一站', next: '下一站', close: '关闭', detail: '细节', cuWc: '马桶间', cuTowel: '毛巾与台面', pill: '◆ 传承导览' },
  en: { ext: 'Exterior', all: 'All', shafts: 'Shafts', tour: 'Heritage', title: 'Eden Family Seat', motto: 'Founded c. 190 years ago · HORTUS SUPRA NUBES', sub: 'Palladian five-part house · 204 m front', hint: 'Drag to orbit · right-drag / two fingers to pan · wheel / pinch / + − to zoom · double-click a room to zoom in, empty space or 0 to reset', zin: 'Zoom in', zout: 'Zoom out', zreset: 'Reset', floor: 'Floor', size: 'Size', use: 'Use', src: 'Source', thru: 'through the floors', estate: 'Grounds', dia: 'diameter', her: 'Heritage', era: 'Era', heritage: 'Heirloom', loading: 'Loading…', prev: 'Previous', next: 'Next', close: 'Close', detail: 'Detail', cuWc: 'WC', cuTowel: 'Towels & vanity', pill: '◆ Heritage tour' },
};
const tx = (k) => TXT[LANG][k];
const floorsEl = $('#floors'); const BTN = {};
function buildNav() {
  floorsEl.innerHTML = ''; for (const k of Object.keys(BTN)) delete BTN[k];
  const sep = () => floorsEl.appendChild(document.createElement('hr'));
  const add = (key, html, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = html; if (cls) b.className = cls; b.onclick = () => (key === 'shafts' ? toggleShafts() : key === 'tour' ? toggleTour() : setMode(key, { fly: true, user: true })); floorsEl.appendChild(b); BTN[key] = b; return b; };
  add('ext', tx('ext')); add('all', tx('all')); sep();
  for (let i = FLOORS.length - 1; i >= 0; i--) add(i, `${FLOORS[i].label}<small>${LANG === 'en' ? FLOOR_EN[i] : FLOORS[i].name}</small>`);
  sep(); add('shafts', `<b></b><span class="t">${tx('shafts')}</span>`, 'tog');
  if (TOUR.length) add('tour', `◆<span class="t"> ${tx('tour')}</span>`, 'tourb');
  syncNav();
  $('#title h1').textContent = tx('title'); $('#title .motto').textContent = tx('motto'); $('#title .sub').textContent = tx('sub'); $('#hint').textContent = tx('hint');
  $('#zin').title = tx('zin'); $('#zout').title = tx('zout'); $('#zreset').title = tx('zreset'); document.documentElement.lang = LANG === 'en' ? 'en' : 'zh-CN';
  const tr = $('#tour'); tr.querySelector('.prev').title = tx('prev'); tr.querySelector('.next').title = tx('next'); tr.querySelector('.x').title = tx('close');
  if (tourI >= 0) showTourText();
}
function syncNav() { for (const [k, b] of Object.entries(BTN)) { if (k === 'shafts') b.classList.toggle('act', showShafts); else if (k === 'tour') b.classList.toggle('on', tourI >= 0); else b.classList.toggle('on', String(mode) === k); } }

/* ---------------- 模式：ext / all / 0..4 ---------------- */
let mode = 'ext', showShafts = true;
const EXPL = 8.5;
const offs = FLOORS.map(() => 0), offTarget = FLOORS.map(() => 0);
function viewFor(m) {
  const P_ = PORTRAIT();
  if (m === 'ext') {
    // 正对中轴：停靠环 → 大道 → 喷泉 → 门廊 → 穹顶 → 湖心亭
    if (P_) { const th = 0.12, ph = 0.95; const [, h] = projExtent(60, 390, 30, th, ph); return { target: new THREE.Vector3(0, 5, 88), zoom: fitZoom(1, h * 0.98), theta: th, phi: ph }; }
    const th = 0.25, ph = 1.05; const [w, h] = projExtent(250, 390, 30, th, ph);
    return { target: new THREE.Vector3(0, 5, 85), zoom: fitZoom(w * 0.92, h * 0.98), theta: th, phi: ph };
  }
  const W = P_ ? Math.min(EXT.w, 112) : EXT.w + 6;
  if (m === 'all') { const [w, h] = projExtent(W + 24, EXT.d, FLOORS.length * EXPL + 12, AZ, 0.86); return { target: new THREE.Vector3(8, FLOORS[2].y + 2 * EXPL, EXT.cz), zoom: P_ ? fitZoom(w, 1) : fitZoom(w * 1.04, h * 1.04), theta: AZ, phi: 0.86 }; }
  const [w, h] = projExtent(W, EXT.d, 6, AZ, 0.8);
  return { target: new THREE.Vector3(0, FLOORS[m].y, EXT.cz), zoom: P_ ? fitZoom(w * 0.9, 1) : fitZoom(w * 1.04, h * 1.1), theta: AZ, phi: 0.8 };
}
function setMode(m, o = {}) {
  if (typeof m === 'string' && /^\d$/.test(m)) m = +m;
  mode = m;
  if (typeof m === 'number') { ensureCut(m); ensureFurn(m); }
  if (m === 'all') FLOORS.forEach((f, i) => { ensureCut(i); ensureFurn(i); });
  fullG.forEach((g, i) => { g.visible = m === 'ext' || (typeof m === 'number' && i < m); });
  floorG.forEach((g, i) => {
    const on = m === 'all' || m === i || (m === 'ext' && i === 4);
    g.visible = on; if (cutG[i]) cutG[i].visible = m !== 'ext';
    if (furnG[i]) furnG[i].visible = true;
    if (shaftG[i]) shaftG[i].visible = showShafts && m !== 'ext' && on;
    offTarget[i] = m === 'all' ? i * EXPL : 0;
  });
  scene.fog.near = m === 'ext' ? FOG_ON[0] : FOG_OFF[0]; scene.fog.far = m === 'ext' ? FOG_ON[1] : FOG_OFF[1];
  if (pinned && !itemVisible(pinned)) unpin();
  hover = null; hideCard(true); showHi(hiHover, null);
  syncNav(); updateLabelSet(); lightsFor(); subDirty = true; renderer.shadowMap.needsUpdate = true; needs = true;
  if (o.fly) flyTo(viewFor(m));
  if (o.user) { post({ type: 'estate:floor', floor: modeKey(m) }); hidePill(); }
}
const modeKey = (m) => (typeof m === 'number' ? FLOORS[m].id : m);
function toggleShafts() { showShafts = !showShafts; shaftG.forEach((g, i) => { if (g) g.visible = showShafts && mode !== 'ext' && floorG[i].visible; }); syncNav(); needs = true; renderer.shadowMap.needsUpdate = true; }
function itemVisible(it) {
  if (it.kind === 'area') return mode === 'ext';
  if (it.kind === 'shaft') return mode !== 'ext' && showShafts;
  if (it.kind === 'heritage') return it.floor == null ? mode === 'ext' : mode === 'all' || mode === it.floor;
  return mode === 'all' || mode === it.floor;
}
function parseFloor(f) {
  if (f == null) return null; const s = String(f).trim().toLowerCase();
  if (['ext', 'exterior', '外观', 'out'].includes(s)) return 'ext';
  if (['all', '全部', 'cutaway'].includes(s)) return 'all';
  const n = s.match(/(\d)/); if (n) { const k = +n[1]; if (k >= 1 && k <= FLOORS.length) return k - 1; }
  return null;
}
// 室内暖光：只调强度
function lightsFor() {
  floorLights.forEach((l, i) => { l.intensity = mode === i ? FLOOR_I : mode === 'all' ? FLOOR_I * 0.4 : 0; });
  const tgt = pinned && (pinned.kind === 'room' || (pinned.kind === 'heritage' && pinned.floor != null)) ? pinned : null;
  focusLights.forEach((l, k) => {
    if (!tgt || k > 0) { l.intensity = 0; return; }
    const f = FLOORS[tgt.floor], hh = 6;
    l.position.set(tgt.cx, f.y + hh + offs[tgt.floor], tgt.cz); l.userData.floor = tgt.floor; l.userData.dy = f.y + hh; l.intensity = FOCUS_I;
  });
  assignRoomLights(true);
}
// 房间暖光池（T0）：钉住的房间优先，其余按离视点远近；强度 3，distance = 房间对角线 × 0.6，不投影
let rlKey = '';
const isBath = (it) => !!it.close || /盥洗|浴|WC|Bath/i.test(it.d.name) || !!(it.d.parts && (it.d.parts.wc || it.d.parts.bath));
function assignRoomLights(force) {
  if (!roomLights.length) return;
  if (typeof mode !== 'number') { if (rlKey !== 'off') { for (const l of roomLights) l.intensity = 0; rlKey = 'off'; needs = true; } return; }
  const tg = controls.target, key = `${mode}|${pinned ? pinned.d.name : ''}|${Math.round(tg.x / 5)},${Math.round(tg.z / 5)}`;
  if (!force && key === rlKey) return; rlKey = key;
  const f = FLOORS[mode], cands = ITEMS.filter((it) => it.kind === 'room' && it.floor === mode && !it.d.minor && !it.d.void && (it.rank === 1 || isBath(it)));
  const dist = (it) => Math.hypot(Math.max(0, Math.abs(tg.x - it.cx) - it.w / 2), Math.max(0, Math.abs(tg.z - it.cz) - it.dd / 2));
  cands.sort((a, b) => (b === pinned) - (a === pinned) || dist(a) - dist(b));
  roomLights.forEach((l, k) => {
    const it = cands[k]; if (!it) { l.intensity = 0; return; }
    l.distance = Math.max(4, 0.6 * Math.hypot(it.w, it.dd)); l.position.set(it.cx, f.y + Math.min((f.h || 4.5) - 0.5, 3.0) + offs[mode], it.cz); l.intensity = ROOM_I;
  });
  needs = true;
}

/* ---------------- 标签：按等级、模式、缩放与重叠筛选 ---------------- */
const HERO = new Set(['伊甸庄园 · 主楼', '门廊', '图书馆塔楼', '音乐厅亭', '中轴大道', '停靠平台', '人工湖']);
let extZoom0 = 1;
let labelSet = [];
function updateLabelSet() {
  labelSet = [];
  for (const it of ITEMS) { if (!it.label) continue; const on = itemVisible(it) && it.kind !== 'shaft'; it.label.visible = on; if (on) labelSet.push(it); }
  floorTags.forEach((o) => { o.visible = mode === 'all'; });
  HITEMS.forEach((it) => { it.mk.visible = itemVisible(it); });
}
const _v = new THREE.Vector3();
function cullLabels() {
  const W = innerWidth, H = innerHeight, placed = [];
  const visW = (camera.right - camera.left) / camera.zoom;
  const list = labelSet.slice().sort((a, b) => (b === pinned) - (a === pinned) || (b === hover) - (a === hover) || b.pri - a.pri);
  for (const it of list) {
    const el = it.label.element, hot = it === pinned || it === hover;
    let ok = true;
    if (it.rank === 3 && !hot) ok = false;                                   // 服务用房 / 服务区：只在悬停时显示
    if (it.kind === 'room' && it.rank === 2 && visW >= 120 && !hot) ok = false;
    if (it.kind === 'area' && !hot && !(HERO.has(it.d.name) || (it.d.pri ?? 5) >= 10) && camera.zoom < extZoom0 * 1.4) ok = false;   // 首屏只留七个主标签
    if (it.kind === 'area' && visW < 60 && (it.d.pri ?? 5) < 10 && !hot) ok = false;
    if (ok) {
      it.label.getWorldPosition(_v).project(camera);
      const x = (_v.x + 1) / 2 * W, y = (1 - _v.y) / 2 * H;
      if (!it.lw) { it.lw = el.firstChild.offsetWidth || 60; it.lh = el.firstChild.offsetHeight || 18; }
      const r = [x - it.lw / 2 - 3, y - it.lh / 2 - 2, x + it.lw / 2 + 3, y + it.lh / 2 + 2];
      if (!hot) for (const p of placed) if (r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1]) { ok = false; break; }
      if (ok) placed.push(r);
    }
    el.classList.toggle('hide', !ok); el.classList.toggle('hot', it === pinned);
  }
  HITEMS.forEach((it) => it.mk.element.classList.toggle('hot', it === pinned));
}

/* ---------------- 子批次可见性：hi±x/±z 按相机方位，detail / fine 按可见宽度 ---------------- */
let subKey = '';
// 阈值按「每像素多少米」算（visW / innerWidth），手机窄屏不会因为可见宽度小就开满细节
const MPP_DETAIL = 0.234, MPP_FINE = 0.047, MPP_TREE_LO = 0.12;
function updateSubs(visW) {
  const dx = camera.position.x - controls.target.x, dz = camera.position.z - controls.target.z, mpp = visW / Math.max(1, innerWidth);
  const fineOn = (mode !== 'all' && mpp < MPP_FINE) || !!(pinned && pinned.floor != null && typeof mode === 'number' && pinned.floor === mode);
  const detailOn = mpp <= MPP_DETAIL;
  setLo(tier >= 1 || mpp > MPP_TREE_LO);
  document.body.classList.toggle('zoomed', mode !== 'ext' || mpp < 0.1);
  const key = `${dx > 0}${dz > 0}${fineOn}${detailOn}${mode}${loOn}`;
  if (!subDirty && key === subKey) return; subKey = key; subDirty = false;
  const fineG = typeof mode === 'number' ? [cutG[mode], furnG[mode], ...fullG.slice(0, mode), siteG] : mode === 'ext' ? [siteG, ...fullG, furnG[4]] : [];
  if (fineOn) for (const g of fineG) if (g && g.userData.pending && g.userData.pending.fine) { const sg = L.buildPending?.(g, 'fine'); if (sg && tier >= 1) sg.traverse((o) => { o.castShadow = false; }); }
  for (const g of SUBS) {
    const s = g.userData.subs; if (!s) continue;
    if (s['hi-z']) s['hi-z'].visible = dz > 0;
    if (s['hi+z']) s['hi+z'].visible = dz < 0;
    if (s['hi-x']) s['hi-x'].visible = dx > 0;
    if (s['hi+x']) s['hi+x'].visible = dx < 0;
    if (s.detail) s.detail.visible = detailOn;
    if (s.fine) s.fine.visible = fineOn;
  }
  renderer.shadowMap.needsUpdate = true;
}
// 「全部」模式：远在屏幕外的楼层隐藏家具
function cullFurnAll() {
  if (mode !== 'all') return;
  furnG.forEach((g, i) => {
    if (!g) return; _v.set(0, FLOORS[i].y + offs[i], EXT.cz).project(camera);
    g.visible = Math.abs(_v.x) < 1.6 && Math.abs(_v.y) < 1.6;
  });
}

/* ---------------- 高亮框 ---------------- */
function mkHi(color, lineOp, fillOp) {
  const g = new THREE.Group(); g.renderOrder = 6;
  const lm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: lineOp, depthWrite: false, fog: false });
  const fm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: fillOp, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const bars = [0, 1, 2, 3].map(() => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), lm));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), fm);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2), lm); const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), fm);
  g.add(...bars, fill, ring, disc); g.userData = { bars, fill, ring, disc, lm, fm, lineOp, fillOp }; g.visible = false; scene.add(g); return g;
}
const hiPin = mkHi('#e6c36a', 0.95, 0.2), hiHover = mkHi('#f3dfa2', 0.55, 0.1);
function showHi(h, it) {
  if (!it || it.kind === 'heritage') { h.visible = false; return; }
  const u = h.userData, parent = it.kind === 'room' ? floorG[it.floor] : scene;
  if (h.parent !== parent) parent.add(h);
  const y = it.kind === 'room' ? it.y + 0.06 : it.kind === 'shaft' ? 0 : ((it.d.pri ?? 5) >= 10 ? 1.3 : 0.5);
  const th = Math.max(0.18, Math.min(it.w, it.dd) * 0.025);
  const round = !!it.round;
  u.ring.visible = u.disc.visible = round; u.fill.visible = !round; u.bars.forEach((b) => (b.visible = !round));
  if (round) { const r = it.w / 2, r2 = it.dd / 2; u.ring.scale.set(r, 1, r2); u.disc.scale.set(r, 1, r2); u.ring.position.set(it.cx, y + 0.02, it.cz); u.disc.position.set(it.cx, y, it.cz); }
  else {
    const { cx, cz, w, dd } = it;
    u.fill.scale.set(w, 1, dd); u.fill.position.set(cx, y, cz);
    const B = u.bars; B[0].scale.set(w + th, 0.08, th); B[0].position.set(cx, y + 0.04, cz - dd / 2); B[1].scale.set(w + th, 0.08, th); B[1].position.set(cx, y + 0.04, cz + dd / 2);
    B[2].scale.set(th, 0.08, dd); B[2].position.set(cx - w / 2, y + 0.04, cz); B[3].scale.set(th, 0.08, dd); B[3].position.set(cx + w / 2, y + 0.04, cz);
  }
  if (it.kind === 'shaft') { const f = typeof mode === 'number' ? mode : 0; u.fill.position.y = FLOORS[f].y + 0.1; for (const b of u.bars) b.position.y = FLOORS[f].y + 0.14; if (h.parent !== floorG[f]) floorG[f].add(h); }
  h.visible = true;
}

/* ---------------- 房间卡：编号 · 尺寸 · 用途 ─ 金线 ─ 传承细节 · 年代 ---------------- */
const card = $('#card');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function cardHTML(it) {
  const d = it.d, zh = LANG === 'zh';
  if (it.kind === 'heritage') {
    const cap = zh ? d.caption : d.caption_en || d.caption;
    const where = d.room && P.ROOM_BY_ID?.[d.room] ? (zh ? P.ROOM_BY_ID[d.room].name : enOf(P.ROOM_BY_ID[d.room].name)[0] || P.ROOM_BY_ID[d.room].name) : d.floor != null ? floorName(d.floor) : tx('estate');
    return `<h3>◆ ${esc(nameOf(it))}</h3><div class="sub">${esc(tx('heritage'))} · ${esc(where)}</div><div class="gold"></div>` +
      (cap ? `<div class="her">${esc(cap)}</div>` : '') + (d.era ? `<div class="era">${esc(tx('era'))} <b>${esc(d.era)}</b></div>` : '');
  }
  let sub, size;
  if (it.kind === 'room') { sub = floorName(it.floor) + (d.id ? ` · ${d.id}` : ''); size = `${+it.w.toFixed(1)} × ${+it.dd.toFixed(1)} m · ${Math.round(it.w * it.dd)} ㎡`; }
  else if (it.kind === 'area') { sub = tx('estate'); size = it.round ? `${tx('dia')} ${it.w} m` : `${it.w} × ${it.dd} m`; }
  else { sub = tx('thru'); size = `${it.w} × ${it.dd} m`; }
  const alt = zh ? enOf(d.name)[0] || '' : d.name;
  let h = `<h3>${esc(nameOf(it))}</h3><div class="sub">${esc(sub)}${alt ? ' · ' + esc(alt) : ''}</div>` +
    `<div class="row"><em>${tx('size')}</em>${esc(size)}</div><div class="row"><em>${tx('use')}</em>${esc(useOf(it))}</div>`;
  const her = heritageOf(it);
  if (her || d.era) {
    h += `<div class="gold"></div>`;
    if (her) h += `<div class="her"><em>${tx('her')}</em>${esc(her)}</div>`;
    if (d.era) h += `<div class="era">${tx('era')} <b>${esc(d.era)}</b></div>`;
  }
  if (it.kind === 'room' && it.close && it.close.length) h += `<div class="acts"><button class="cu" type="button">${tx('detail')} ›</button><span class="cun"></span></div>`;
  if (DEBUG && d.src) {
    const si = { '世界书': 0, 'ROADMAP': 1, '推断': 2 }[d.src] ?? 2;
    h += `<div class="src"><b class="s${si}">${esc(zh ? d.src : SRC_EN[d.src] || d.src)}</b>${zh && d.note ? esc(d.note) : ''}</div>`;
  }
  return h;
}
let cardFor = null, cardAt = null;
function showCard(it, x, y) {
  if (cardFor !== it) { card.innerHTML = cardHTML(it); cardFor = it; }
  cardAt = x == null ? null : [x, y]; card.classList.toggle('pinned', it === pinned && x == null); placeCard(); card.classList.add('on');
}
/* ---------------- 近景视点：每个盥洗室的马桶间（画面高 ~2.2 m）和毛巾架 / 台面（~1.8 m）；位置由家具构建时的探针找出 ---------------- */
function clusters(pts, r) {
  const cs = [];
  for (const p of pts) { let c = cs.find((c) => Math.hypot(c.x - p[0], c.z - p[2]) < r); if (!c) cs.push(c = { x: p[0], z: p[2], y: p[1], n: 0, sx: 0, sy: 0, sz: 0 }); c.n++; c.sx += p[0]; c.sy += p[1]; c.sz += p[2]; c.x = c.sx / c.n; c.y = c.sy / c.n; c.z = c.sz / c.n; }
  return cs;
}
function makeCloseups(fi) {
  const pr = PROBE[fi], f = FLOORS[fi];
  for (const it of ITEMS) {
    if (it.kind !== 'room' || it.floor !== fi || it.d.minor) continue;
    const [x0, x1, z0, z1] = it.d.r, inR = (p) => p[0] >= x0 && p[0] <= x1 && p[2] >= z0 && p[2] <= z1;
    const rects = []; for (const v of Object.values(it.d.parts || {})) { if (!Array.isArray(v)) continue; if (Array.isArray(v[0])) rects.push(...v); else if (v.length === 4) rects.push(v); }
    const center = (x, z) => { for (const q of rects) if (x >= q[0] && x <= q[1] && z >= q[2] && z <= q[3]) return [(q[0] + q[1]) / 2, (q[2] + q[3]) / 2]; return [it.cx, it.cz]; };
    const th = (x, z) => { const [cx, cz] = center(x, z), dx = cx - x, dz = cz - z; return Math.hypot(dx, dz) < 0.4 ? AZ : Math.atan2(dx, dz); };
    const list = [];
    clusters(pr.wc.filter(inR), 0.7).filter((c) => c.n >= 2).forEach((c) => list.push({ kind: 'wc', x: c.x, y: f.y + 0.45, z: c.z, H: 2.2, theta: th(c.x, c.z), phi: 1.0 }));
    clusters(pr.towel.filter(inR), 1.0).sort((a, b) => b.n - a.n).slice(0, 2).forEach((c) => list.push({ kind: 'towel', x: c.x, y: f.y + Math.min(1.1, c.y), z: c.z, H: 1.8, theta: th(c.x, c.z), phi: 1.0 }));
    if (list.length) it.close = list; else delete it.close;
  }
}
function goCloseup(it, k) {
  if (!it.close || !it.close.length) return;
  if (mode !== it.floor) setMode(it.floor);
  if (pinned !== it) pin(it, false);
  it.cuI = ((k ?? (it.cuI ?? -1) + 1) + it.close.length) % it.close.length;
  const c = it.close[it.cuI];
  flyTo({ target: new THREE.Vector3(c.x, c.y, c.z), zoom: fitZoom(0.1, c.H), theta: c.theta, phi: c.phi }, 900);
  const n = card.querySelector('.cun'); if (n) n.textContent = `${it.cuI + 1} / ${it.close.length} · ${tx(c.kind === 'wc' ? 'cuWc' : 'cuTowel')}`;
  subDirty = true;
}
card.addEventListener('click', (e) => { if (e.target.closest('.cu') && cardFor) { e.stopPropagation(); goCloseup(cardFor); } });
function placeCard() {
  if (!cardFor) return; let x, y;
  const w = card.offsetWidth, h = card.offsetHeight;
  if (cardAt) [x, y] = cardAt; else { x = innerWidth - w - 16; y = 16; }   // 固定的卡片放右上角，不挡房间
  if (x + w + 12 > innerWidth) x = Math.max(8, x - w - 44); if (y + h + 12 > innerHeight) y = innerHeight - h - 12; if (y < 8) y = 8;
  card.style.left = x + 'px'; card.style.top = y + 'px';
}
function hideCard(force) { if (pinned && !force) { showCard(pinned); return; } card.classList.remove('on'); cardFor = null; }

/* ---------------- 拾取 / 悬停 / 点选 ---------------- */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pickAt(cx, cy) {
  const rc = renderer.domElement.getBoundingClientRect();
  ndc.set(((cx - rc.left) / rc.width) * 2 - 1, -((cy - rc.top) / rc.height) * 2 + 1); ray.setFromCamera(ndc, camera);
  const list = [];
  for (const it of ITEMS) { if (!itemVisible(it)) continue; if (it.pick) list.push(it.pick); if (it.picks) for (const p of it.picks) if (p.parent.visible) list.push(p); }
  const hits = ray.intersectObjects(list, false);
  if (!hits.length) return null;
  hits.sort((a, b) => (a.object.userData.item.w * a.object.userData.item.dd) - (b.object.userData.item.w * b.object.userData.item.dd));   // 最具体的优先
  return hits[0].object.userData.item;
}
let pinned = null, hover = null, pinT = 0;
function pin(it, fly) {
  pinned = it; pinT = performance.now(); showHi(hiPin, it); showHi(hiHover, null); cardFor = null; showCard(it); lightsFor(); subDirty = true; needs = true;
  if (fly) focusView(it);
}
function unpin() { pinned = null; showHi(hiPin, null); hideCard(true); lightsFor(); subDirty = true; needs = true; }
function focusView(it) {
  const y = it.kind === 'room' ? it.y + (mode === 'all' ? offTarget[it.floor] : 0) : it.kind === 'area' ? 0 : FLOORS[typeof mode === 'number' ? mode : 0].y;
  sph.setFromVector3(camera.position.clone().sub(controls.target));
  const [pw, ph] = projExtent(it.w, it.dd, 3, sph.theta, sph.phi);
  const pad = it.kind === 'room' ? 1.25 : 1.12;
  flyTo({ target: new THREE.Vector3(it.cx, y, it.cz), zoom: fitZoom(pw * pad + 3, ph * pad + 6), theta: null, phi: null });
}
function focusItem(it) {
  if (it.kind === 'heritage') return focusHeritage(it);
  if (it.kind === 'room' && mode !== it.floor) setMode(it.floor);
  if (it.kind === 'area' && mode !== 'ext') setMode('ext');
  if (it.kind === 'shaft' && mode === 'ext') setMode(0);
  pin(it, true);
}
function findByName(name) {
  const s = String(name || '').trim(); if (!s) return null;
  let best = null, score = -1; const low = s.toLowerCase();
  for (const it of ITEMS) {
    const d = it.d, rank = it.kind === 'room' ? 3 : it.kind === 'area' ? ((d.pri ?? 5) >= 10 ? 1 : 2) : 2;
    const keys = [d.name, d.id, ...(d.alias || []), enOf(d.name)[0], ...(d.alias_en || [])].filter((k) => typeof k === 'string' && k);
    for (const k of keys) {
      const kl = k.toLowerCase(); let sc = -1;
      if (low === kl) sc = 10000; else if (kl.length > 1 && low.includes(kl)) sc = rank * 100 + kl.length; else continue;
      if (it.kind === 'room' && d.minor) sc -= 50;
      if (sc > score) { score = sc; best = it; }
    }
  }
  return best;
}

/* ---------------- 飞行动画 ---------------- */
let tween = null;
const sph = new THREE.Spherical();
function flyTo(v, dur = 650) {
  sph.setFromVector3(camera.position.clone().sub(controls.target));
  const to = { target: v.target.clone(), zoom: clamp(v.zoom, minZoom, maxZ()), theta: v.theta ?? sph.theta, phi: v.phi ?? sph.phi };
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
  const z = clamp(camera.zoom * f, minZoom, maxZ()); if (z === camera.zoom) return;
  camera.zoom = z; camera.updateProjectionMatrix();
  _p1.set(nx, ny, 0).unproject(camera);
  _p0.sub(_p1); camera.position.add(_p0); controls.target.add(_p0);
  keepTargetY(); touchInteract(); needs = true;
}
let targetY = 6;
function keepTargetY() {  // 沿视线把轴心滑回原高度（正交相机下画面不变）
  _dir.subVectors(controls.target, camera.position).normalize(); if (Math.abs(_dir.y) < 1e-3) return;
  const s = (targetY - controls.target.y) / _dir.y; controls.target.addScaledVector(_dir, s); camera.position.addScaledVector(_dir, s);
}
// 整个窗口吞掉滚轮：楼层条、按钮、卡片上方滚动也不会带着父页面滚
window.addEventListener('wheel', (e) => { e.preventDefault(); }, { passive: false });
app.addEventListener('wheel', (e) => {
  e.preventDefault(); e.stopPropagation();
  let dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 300 : 1);
  dy = clamp(dy, -150, 150);
  zoomAt(e.clientX, e.clientY, Math.exp(-dy * (e.ctrlKey ? 0.011 : 0.0021)));
}, { passive: false, capture: true });
// 楼层条（手机横排）用滚轮横向滚动
floorsEl.addEventListener('wheel', (e) => { if (floorsEl.scrollWidth > floorsEl.clientWidth) floorsEl.scrollLeft += e.deltaY + e.deltaX; }, { passive: true });
// macOS Safari 的触控板捏合走 gesture 事件（e.scale），不是 ctrl+wheel
let gLast = 1;
window.addEventListener('gesturestart', (e) => { e.preventDefault(); gLast = 1; }, { passive: false });
window.addEventListener('gesturechange', (e) => { e.preventDefault(); if (COARSE) return; const s = e.scale || 1; zoomAt(e.clientX ?? innerWidth / 2, e.clientY ?? innerHeight / 2, s / gLast); gLast = s; }, { passive: false });
window.addEventListener('gestureend', (e) => { e.preventDefault(); gLast = 1; }, { passive: false });
// 双指捏合（与 OrbitControls 的双指平移并行）
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
  if (pinch && e.touches.length < 2) { // 双指轻点 → 拉近该房间
    if (performance.now() - pinch.t < 260 && pinch.moved < 12) { const it = pickAt(pinch.cx, pinch.cy); if (it) { focusItem(it); postSelect(it); } }
    pinch = null;
  }
});
const zoomBtn = (f) => { const to = clamp(camera.zoom * f, minZoom, maxZ()); flyTo({ target: controls.target.clone(), zoom: to, theta: null, phi: null }, 260); };
const resetView = () => { unpin(); flyTo(viewFor(mode)); };
$('#zin').onclick = () => zoomBtn(1.6); $('#zout').onclick = () => zoomBtn(1 / 1.6); $('#zreset').onclick = resetView;

/* ---------------- 指针：悬停卡（每帧最多拾取一次）、点选（触屏延迟 250 ms 给双击）、双击 ---------------- */
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

/* ---------------- 拖动时降分辨率，停下 150 ms 后补一帧清晰画面 ---------------- */
let lastInteract = 0;
function touchInteract() { lastInteract = performance.now(); }
function setLowRes(on) {
  touchInteract();
  if (on === lowRes) return; lowRes = on;
  renderer.setPixelRatio(on ? dpr * 0.75 : dpr); renderer.setSize(innerWidth, innerHeight); needs = true;
}

/* ---------------- 自适应降档：交互中 1 s 内平均帧时 > 33 ms 就降一档（只改 DPR 和阴影） ---------------- */
let perfAcc = 0, perfN = 0, lastFrameT = 0;
function samplePerf(now, moving) {
  if (TIER_FIXED || tier >= 2) return;
  const dt = now - lastFrameT; lastFrameT = now;
  if (!moving || dt > 250) { perfAcc = 0; perfN = 0; return; }
  perfAcc += dt; perfN++;
  if (perfAcc >= 1000) { if (perfAcc / perfN > 33) setTier(tier + 1); perfAcc = 0; perfN = 0; }
}
function setTier(n) {
  n = Math.min(2, n); if (n <= tier) return; tier = n;
  dpr = dprFor(tier); renderer.setPixelRatio(lowRes ? dpr * 0.75 : dpr); renderer.setSize(innerWidth, innerHeight);
  if (tier >= 1) { furnG.forEach((g) => g && g.traverse((o) => { o.castShadow = false; })); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } sun.shadow.mapSize.set(1024, 1024); }
  if (tier >= 2) { sun.castShadow = false; }
  renderer.shadowMap.needsUpdate = true; needs = true;
  console.info('estate: tier →', tier);
}

/* ---------------- 传承导览 ---------------- */
// 导览：停靠环开场；塔顶浑天仪没有编号时插在山花家徽之后
const tourKey = (it) => (it.d.tour > 0 ? it.d.tour : it.d.kind === 'armillary' ? 2.5 : 99);
const TOUR = HITEMS.filter((it) => it.d.tour > 0 || it.d.kind === 'armillary').sort((a, b) => tourKey(a) - tourKey(b));
const VIEW_FIX = { landingRing: { theta: 0, phi: 1.1, w: 70 }, crest: { w: 13, phi: 1.25 }, armillary: { w: 13, phi: 1.15 } };   // 室外金饰拉近到能看清
let tourI = -1;
const tourEl = $('#tour');
function focusHeritage(it, fly = true) {
  const h = it.d, m = h.floor == null ? 'ext' : h.floor;
  if (mode !== m) setMode(m);
  pin(it, false);
  if (!fly) return;
  const v = { ...(h.view || {}), ...(h.floor == null ? VIEW_FIX[h.kind] || {} : {}) };
  const W = v.w || (h.floor != null ? 18 : h.kind === 'crest' ? 40 : 60);
  const y = h.floor != null ? FLOORS[h.floor].y : Math.max(0, h.y ?? 0);
  sph.setFromVector3(camera.position.clone().sub(controls.target));
  flyTo({ target: new THREE.Vector3(h.x, y, h.z), zoom: fitZoom(W, W * 0.66), theta: v.theta ?? (h.floor != null ? AZ : 0.25), phi: v.phi ?? (h.floor != null ? 0.82 : 1.0) }, 900);
}
function showTourText() {
  const it = TOUR[tourI]; if (!it) return; const h = it.d;
  tourEl.querySelector('.tx b').innerHTML = `${esc(nameOf(it))}<small>${tourI + 1} / ${TOUR.length}${h.era ? ' · ' + esc(h.era) : ''}</small>`;
  tourEl.querySelector('.tx span').textContent = LANG === 'en' ? h.caption_en || h.caption || '' : h.caption || '';
}
function tourGo(i) { if (!TOUR.length) return; hidePill(); tourI = (i + TOUR.length) % TOUR.length; tourEl.classList.add('on'); showTourText(); focusHeritage(TOUR[tourI]); syncNav(); }
function tourClose() { tourI = -1; tourEl.classList.remove('on'); syncNav(); }
function toggleTour() { if (tourI >= 0) tourClose(); else tourGo(0); }
tourEl.querySelector('.prev').onclick = () => tourGo(tourI - 1);
tourEl.querySelector('.next').onclick = () => tourGo(tourI + 1);
tourEl.querySelector('.x').onclick = tourClose;

/* ---------------- 键盘 / 消息 ---------------- */
const SEQ = [...FLOORS.map((f, i) => i), 'ext'];
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (['+', '=', '-', '_', '0'].includes(e.key)) { e.preventDefault(); if (e.key === '0') resetView(); else zoomBtn(e.key === '+' || e.key === '=' ? 1.6 : 1 / 1.6); return; }
  if (tourI >= 0 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); tourGo(tourI + (e.key === 'ArrowRight' ? 1 : -1)); return; }
  if (e.key === 'Escape' && tourI >= 0) { tourClose(); return; }
  if (!['PageUp', 'PageDown', '[', ']'].includes(e.key)) return; e.preventDefault();
  if (IN_FRAME) { post({ type: 'estate:key', key: e.key }); return; }
  const up = e.key === 'PageUp' || e.key === ']'; let i = SEQ.indexOf(mode === 'all' ? 'ext' : mode); i = Math.max(0, Math.min(SEQ.length - 1, i + (up ? 1 : -1))); setMode(SEQ[i], { fly: true });
});
function post(msg) { if (IN_FRAME) try { window.parent.postMessage(msg, '*'); } catch (e) { } }
window.addEventListener('message', (e) => {
  const d = e.data; if (!d || typeof d !== 'object' || typeof d.type !== 'string' || !d.type.startsWith('estate:')) return;
  if (d.type === 'estate:room') { const it = findByName(d.name); if (it) focusItem(it); else unpin(); }
  else if (d.type === 'estate:floor') { const m = parseFloor(d.floor); if (m != null) setMode(m, { fly: true }); }
  else if (d.type === 'estate:inset' && Number.isFinite(d.left)) { document.documentElement.style.setProperty('--inset', Math.max(6, d.left) + 'px'); frustum(); needs = true; }
  else if (d.type === 'estate:lang' && (d.lang === 'en' || d.lang === 'zh')) setLang(d.lang);
  else if (d.type === 'estate:theme' && (d.theme === 'light' || d.theme === 'dark')) { THEME = d.theme; document.documentElement.dataset.theme = THEME; needs = true; }
});
function setLang(l) { LANG = l; buildNav(); relabel(); frustum(); const it = cardFor; cardFor = null; if (it) showCard(it, cardAt?.[0], cardAt?.[1]); needs = true; }

/* ---------------- 尺寸 ---------------- */
addEventListener('resize', () => { frustum(); renderer.setSize(innerWidth, innerHeight); labelR.setSize(innerWidth, innerHeight); camera.zoom = clamp(camera.zoom, minZoom, maxZ()); camera.updateProjectionMatrix(); needs = true; });

/* ---------------- 循环（按需渲染） ---------------- */
const statsEl = $('#stats'); if (STATS) statsEl.style.display = 'block';
let rlT = 0, shadowFirst = false;
let frames = 0, fpsT = performance.now(), fps = 0, first = true, lastInfo = { calls: 0, triangles: 0 }, lastPulse = 0;
function loop(now) {
  requestAnimationFrame(loop);
  let moving = stepTween(now);
  if (!moving) moving = controls.update();
  else controls.update();
  const tg = controls.target; const cx = clamp(tg.x, -340, 340), cz = clamp(tg.z, -300, 320);   // 目标限制在岛上空
  if (cx !== tg.x || cz !== tg.z) { camera.position.x += cx - tg.x; camera.position.z += cz - tg.z; tg.x = cx; tg.z = cz; }
  if (!tween) targetY = tg.y;
  // 楼层展开动画
  let anim = false;
  floorG.forEach((g, i) => { const d = offTarget[i] - offs[i]; if (Math.abs(d) > 0.01) { offs[i] += d * 0.18; anim = true; } else offs[i] = offTarget[i]; g.position.y = offs[i]; floorLights[i].position.y = FLOORS[i].y + LIGHT_UP + offs[i]; });
  if (anim) { renderer.shadowMap.needsUpdate = true; for (const l of focusLights) if (l.userData.floor != null) l.position.y = l.userData.dy + offs[l.userData.floor]; }
  const visW = (camera.right - camera.left) / camera.zoom;
  fitShadow(visW < 300);
  updateSubs(visW);
  // 钉住房间的脉冲：15 Hz，2 s 后停
  if (pinned && now - pinT < 2000 && now - lastPulse > 66) { lastPulse = now; const k = 0.6 + 0.4 * Math.abs(Math.sin((now - pinT) / 420 * Math.PI)); hiPin.userData.fm.opacity = hiPin.userData.fillOp * (0.5 + k * 0.7); needs = true; }
  else if (pinned && now - pinT >= 2000 && hiPin.userData.fm.opacity !== hiPin.userData.fillOp) { hiPin.userData.fm.opacity = hiPin.userData.fillOp; needs = true; }
  if (lowRes && !down && !pinch && now - lastInteract > 150) setLowRes(false);
  if (roomLights.length && typeof mode === 'number' && now - rlT > 300) { rlT = now; assignRoomLights(false); }
  if (!pillDone && pill && pillT0 && !tween && tourI < 0 && now - Math.max(pillT0, lastInteract) > 4000) { pillDone = true; pill.textContent = tx('pill'); pill.classList.add('on'); }
  if (!(needs || moving || anim || STATS)) { lastFrameT = now; return; }
  needs = false;
  cullFurnAll();
  if (first && frames === 0 && !shadowFirst) { shadowFirst = true; renderer.shadowMap.needsUpdate = false; needs = true; }   // 首帧不画阴影贴图，下一帧补上
  else if (shadowFirst === true) { shadowFirst = 2; renderer.shadowMap.needsUpdate = true; }
  const tR = first ? performance.now() : 0;
  renderer.render(scene, camera); if (first) TB.firstRender = performance.now() - tR; lastInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  labelR.render(scene, camera); cullLabels();
  if (cardFor && !cardAt) placeCard();
  samplePerf(now, moving || anim);
  frames++;
  if (first) { first = false; onFirstFrame(); }
  if (STATS && now - fpsT > 500) { fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; statsEl.textContent = `T${tier} · ${fps.toFixed(0)} fps\n${lastInfo.calls} calls\n${(lastInfo.triangles / 1000).toFixed(0)}k tris\nbuild ${T_BUILD.toFixed(0)} ms`; }
}
function onFirstFrame() {
  window.__estateFirstFrame = true; if (window.__estateWatchdog) window.__estateWatchdog();
  const ld = $('#loading'); ld.classList.add('done'); setTimeout(() => { ld.innerHTML = ''; }, 500);
  window.__estate.firstFrameMs = performance.now() - T0;
  post({ type: 'estate:ready', floors: FLOORS.map((f) => f.id), rooms: ROOMS.filter((r) => !r.minor).map((r) => ({ name: r.name, en: enOf(r.name)[0], floor: FLOORS[r.floor].id, alias: r.alias })).concat(AREAS.map((a) => ({ name: a.name, en: enOf(a.name)[0], floor: 'ext', alias: a.alias }))) });
  // 开场推近：约 2 s（嵌入、减少动态、直接进楼层时不做）
  if (mode === 'ext' && !EMBED && !REDUCED && !tween) { const v = viewFor('ext'); v.ease = 'out'; flyTo(v, 2200); }
  // 空闲时逐层补建：屋顶家具先，然后逐层剖切、家具（家具按任务切片，每片 ≤ 12 ms）；开场推近结束后才开始
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 40));
  const jobs = [{ f: 4, k: 'furn' }]; FLOORS.forEach((f, i) => { jobs.push({ f: i, k: 'cut' }); if (i !== 4) jobs.push({ f: i, k: 'furn' }); });
  const run = (dl) => {
    const t0 = performance.now();
    while (jobs.length) {
      if (typeof mode === 'number') { const k = jobs.findIndex((j) => j.f === mode); if (k > 0) jobs.unshift(...jobs.splice(k, 1)); }
      const j = jobs[0]; let done = true;
      if (j.k === 'cut') ensureCut(j.f); else done = furnStep(j.f, 12);
      if (done) jobs.shift();
      if (performance.now() - t0 > 12 || (dl && dl.timeRemaining && dl.timeRemaining() < 4)) break;
    }
    if (jobs.length) schedule(); else window.__estate.allBuiltMs = performance.now() - T0;
  };
  const schedule = () => { if (tween) { setTimeout(schedule, 150); return; } idle(run, { timeout: 1000 }); };
  schedule();
  pillT0 = performance.now();
}
// 首次载入空闲 4 s 后，浮出一枚金色「◆ 传承导览」
const pill = $('#tourPill'); let pillT0 = 0, pillDone = EMBED || !TOUR.length;
function hidePill() { pillDone = true; if (pill) pill.classList.remove('on'); }
if (pill) pill.onclick = () => { hidePill(); tourGo(0); };

/* ---------------- 启动 ---------------- */
window.__estate = {
  setMode, focus: (n) => { const it = findByName(n); if (it) focusItem(it); return !!it; }, find: (n) => { const it = findByName(n); return it ? { kind: it.kind, name: it.d.name, id: it.d.id, floor: it.floor } : null; },
  tour: (i) => tourGo(i ?? 0), tier: () => tier,
  stats: () => ({ ...lastInfo, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length, build: T_BUILD, tier, times: TB, firstFrameMs: window.__estate.firstFrameMs, allBuiltMs: window.__estate.allBuiltMs }),
  camera, controls, renderer, scene, setLang,
};
buildNav(); relabel(); frustum();
const m0 = parseFloor(Q.get('floor')) ?? 'ext';
setMode(m0);
{ const v0 = viewFor(m0); let z = v0.zoom; if (m0 === 'ext' && !EMBED && !REDUCED) z *= 0.86; camera.zoom = clamp(z, minZoom, maxZ()); camera.updateProjectionMatrix(); placeCam(v0.target, v0.theta, v0.phi); targetY = v0.target.y; }
fitShadow(true);
extZoom0 = viewFor('ext').zoom;
// 首帧之前先把着色器编译好（有并行编译扩展时异步），estate:ready 仍在首帧画完时发
TB.preCompile = performance.now() - T0;
kick('compile'); await yieldUI();
{ const t0 = performance.now(); try { if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera); else renderer.compile(scene, camera); } catch (e) { } TB.compile = performance.now() - t0; }
kick('render');
requestAnimationFrame(loop);
