// 伊甸庄园 · 场景、相机、楼层剖切、标签、房间卡、缩放交互与嵌入协议（协议说明见 index.html 顶部注释）
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { initMaterials, initProtos, Batch, MATS } from './lib.js';
import { FLOORS, ROOMS, AREAS, SHAFTS, CUT, EN, FLOOR_EN, SRC_EN } from './plan.js';
import { buildHouse, buildWings, buildShafts, setRooms } from './building.js';
import { buildIsland, buildGardens } from './site.js';
import { furnish } from './furniture.js';

const T0 = performance.now();
const Q = new URLSearchParams(location.search);
const IN_FRAME = window.parent !== window;
const EMBED = Q.get('embed') === '1' || location.protocol === 'about:';
const STATS = Q.get('stats') === '1';
let LANG = Q.get('lang') === 'en' ? 'en' : 'zh';
let THEME = Q.get('theme') === 'light' ? 'light' : 'dark';
document.body.classList.toggle('embed', EMBED);
document.documentElement.dataset.theme = THEME;
const $ = (s) => document.querySelector(s);
const app = $('#app');
let needs = true;

/* ---------------- 渲染器 ---------------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
app.prepend(renderer.domElement);
const labelR = new CSS2DRenderer({ element: $('#labels') }); labelR.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
initMaterials(null); initProtos();
for (const m of Object.values(MATS)) if (m.envMapIntensity === 1) m.envMapIntensity = 0.42;

const hemi = new THREE.HemisphereLight('#e4ebf2', '#7a6d5a', 0.85); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0da', 2.7);
const SUN_DIR = new THREE.Vector3(-0.62, 1.0, 0.78).normalize();
sun.castShadow = true; const SM = matchMedia('(pointer: coarse)').matches ? 1536 : 2048; sun.shadow.mapSize.set(SM, SM);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);
let shadowTight = null;
function fitShadow(tight) {
  if (tight === shadowTight) return; shadowTight = tight;
  const c = sun.shadow.camera, h = tight ? 104 : 390;
  sun.target.position.set(0, 0, tight ? 4 : 0); sun.position.copy(SUN_DIR).multiplyScalar(800).add(sun.target.position);
  c.left = -h; c.right = h; c.top = h; c.bottom = -h; c.near = 300; c.far = 1500; c.updateProjectionMatrix();
  sun.target.updateMatrixWorld(); renderer.shadowMap.needsUpdate = true;
}

/* ---------------- 相机与控制 ---------------- */
const BASE = 60, DIST = 900;
const camera = new THREE.OrthographicCamera(-BASE, BASE, BASE, -BASE, 1, 3000);
let minZoom = 0.1, maxZoom = 20;
function frustum() {
  const a = innerWidth / innerHeight; camera.left = -BASE * a; camera.right = BASE * a; camera.top = BASE; camera.bottom = -BASE; camera.updateProjectionMatrix();
  minZoom = Math.min(2 * BASE * a / 820, 2 * BASE / 720); maxZoom = 2 * BASE / 7;
  // 左侧楼层条占掉的宽度：把画面中心往右挪一半
  const bar = document.getElementById('floors'), right = bar && bar.offsetWidth ? bar.getBoundingClientRect().right : 0;
  camera.setViewOffset(innerWidth, innerHeight, -Math.round(right / 2), 0, innerWidth, innerHeight);
}
frustum();
const fitZoom = (w, h) => { const bar = document.getElementById('floors'); const usable = Math.max(0.5, 1 - (bar ? bar.getBoundingClientRect().right + 10 : 0) / innerWidth); return Math.min(2 * BASE * (innerWidth / innerHeight) * usable / w, 2 * BASE / h); };
const PORTRAIT = () => innerWidth / innerHeight < 0.8;
const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, { enableDamping: true, dampingFactor: 0.14, rotateSpeed: 0.55, screenSpacePanning: true, enableZoom: false, minPolarAngle: 0.18, maxPolarAngle: 1.3 });
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.PAN };
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
const AZ = 0.62, POL = 0.93;
function placeCam(target, theta, phi) {
  camera.position.set(target.x + DIST * Math.sin(phi) * Math.sin(theta), target.y + DIST * Math.cos(phi), target.z + DIST * Math.sin(phi) * Math.cos(theta));
  controls.target.copy(target); camera.lookAt(target);
}

/* ---------------- 构建 ---------------- */
setRooms((fi) => ROOMS.filter((r) => r.floor === fi));
const full = FLOORS.map((f, i) => new Batch('full' + i)), cut = FLOORS.map((f, i) => new Batch('cut' + i)), site = new Batch('site');
buildHouse(full, cut, site); buildWings(site); buildIsland(scene, site); buildGardens(site);
scene.add(site.build());
const fullG = full.map((b) => { const g = b.build(); scene.add(g); return g; });
const floorG = FLOORS.map((f, i) => { const g = new THREE.Group(); g.name = 'floor' + i; const c = cut[i].build(); g.add(c); g.userData.cut = c; scene.add(g); return g; });
const shaftG = buildShafts(floorG);
const furnG = [];
function ensureFurn(i) {
  if (furnG[i]) return; const b = new Batch('furn' + i); furnish(b, i); furnG[i] = b.build(); floorG[i].add(furnG[i]);
  renderer.shadowMap.needsUpdate = true; needs = true;
}
ensureFurn(4);
const T_BUILD = performance.now() - T0;

/* ---------------- 数据项：房间 / 区域 / 竖井 ---------------- */
const pickMat = new THREE.MeshBasicMaterial({ visible: false });
const ITEMS = [];
ROOMS.forEach((r) => {
  const [x0, x1, z0, z1] = r.r, f = FLOORS[r.floor];
  const it = { kind: 'room', d: r, floor: r.floor, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, dd: z1 - z0, y: f.y };
  const m = new THREE.Mesh(new THREE.BoxGeometry(it.w, CUT + 0.2, it.dd), pickMat); m.position.set(it.cx, f.y + (CUT + 0.2) / 2, it.cz); m.userData.item = it; floorG[r.floor].add(m); it.pick = m;
  const lp = r.lp || [it.cx, it.cz];
  it.label = mkLabel(floorG[r.floor], lp[0], f.y + (r.floor === 4 ? 1.9 : CUT + 0.9), lp[1], 'room');
  it.pri = it.w * it.dd * (r.minor ? 0.2 : 1); ITEMS.push(it);
});
AREAS.forEach((a) => {
  const it = { kind: 'area', d: a, floor: null, cx: a.x, cz: a.z, w: a.w || a.r * 2, dd: a.d || a.r * 2, y: 0, round: !!a.r || !!a.ell };
  const hgt = a.pri >= 10 ? 30 : a.name.includes('楼') || a.name.includes('机库') || a.name === '温室' ? 16 : 1.5;
  const g = it.round ? new THREE.CylinderGeometry(1, 1, hgt, 32).scale(it.w / 2, 1, it.dd / 2) : new THREE.BoxGeometry(it.w, hgt, it.dd);
  const m = new THREE.Mesh(g, pickMat); m.position.set(a.x, hgt / 2, a.z); m.userData.item = it; scene.add(m); it.pick = m;
  it.label = mkLabel(scene, a.x, a.y, a.z, 'area'); it.pri = a.pri * 1000; ITEMS.push(it);
});
SHAFTS.forEach((s) => {
  const [x0, x1, z0, z1] = s.r; const it = { kind: 'shaft', d: s, floor: null, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, dd: z1 - z0, picks: [] };
  shaftG.forEach((g) => g.children.forEach((c) => { if (c.userData.shaft === s) { c.userData.item = it; it.picks.push(c); } }));
  ITEMS.push(it);
});
const floorTags = FLOORS.map((f, i) => mkLabel(floorG[i], -44, f.y + 0.6, 13, 'floor'));

function mkLabel(parent, x, y, z, cls) {
  const el = document.createElement('div'); el.className = 'lbl ' + cls; el.appendChild(document.createElement('span'));
  const o = new CSS2DObject(el); o.position.set(x, y, z); o.center.set(0.5, 0.5); o.visible = false; parent.add(o); return o;
}
const nameOf = (it) => LANG === 'en' ? (EN[it.d.name] || [it.d.name])[0] : it.d.name;
const useOf = (it) => LANG === 'en' ? (EN[it.d.name] || [, it.d.use])[1] : it.d.use;
const floorName = (i) => LANG === 'en' ? `${FLOORS[i].label} · ${FLOOR_EN[i]}` : `${FLOORS[i].label} · ${FLOORS[i].name}`;
function relabel() {
  for (const it of ITEMS) if (it.label) { it.label.element.firstChild.textContent = nameOf(it); it.lw = 0; }
  floorTags.forEach((o, i) => { o.element.firstChild.textContent = floorName(i); });
}

/* ---------------- UI 文案 ---------------- */
const TXT = {
  zh: { ext: '外观', all: '全部', shafts: '竖井', title: '伊甸庄园', sub: '新古典主义府邸 · 剖切模型', hint: '拖动旋转 · 右键 / 双指平移 · 滚轮 / 捏合缩放 · 双击房间拉近，双击空白复位', zin: '放大', zout: '缩小', zreset: '复位', floor: '楼层', size: '尺寸', use: '用途', src: '出处', thru: '贯穿 1F–5F', estate: '室外', dia: '直径', loading: '加载中…' },
  en: { ext: 'Exterior', all: 'All', shafts: 'Shafts', title: 'Eden Manor', sub: 'Neoclassical mansion · cutaway', hint: 'Drag to orbit · right-drag / two fingers to pan · wheel / pinch to zoom · double-click a room to zoom in, empty space to reset', zin: 'Zoom in', zout: 'Zoom out', zreset: 'Reset', floor: 'Floor', size: 'Size', use: 'Use', src: 'Source', thru: 'through 1F–5F', estate: 'Grounds', dia: 'diameter', loading: 'Loading…' },
};
const t = (k) => TXT[LANG][k];
const floorsEl = $('#floors'); const BTN = {};
function buildNav() {
  floorsEl.innerHTML = '';
  const add = (key, html, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = html; if (cls) b.className = cls; b.onclick = () => (key === 'shafts' ? toggleShafts() : setMode(key, { fly: true, user: true })); floorsEl.appendChild(b); BTN[key] = b; return b; };
  add('ext', t('ext')); add('all', t('all')); floorsEl.appendChild(document.createElement('hr'));
  for (let i = 4; i >= 0; i--) add(i, `${FLOORS[i].label}<small>${LANG === 'en' ? FLOOR_EN[i] : FLOORS[i].name}</small>`);
  floorsEl.appendChild(document.createElement('hr'));
  add('shafts', `<b></b>${t('shafts')}`, 'tog');
  syncNav();
  $('#title h1').textContent = t('title'); $('#title p').textContent = t('sub'); $('#hint').textContent = t('hint');
  $('#zin').title = t('zin'); $('#zout').title = t('zout'); $('#zreset').title = t('zreset'); document.documentElement.lang = LANG === 'en' ? 'en' : 'zh-CN';
}
function syncNav() { for (const [k, b] of Object.entries(BTN)) { if (k === 'shafts') b.classList.toggle('act', showShafts); else b.classList.toggle('on', String(mode) === k); } }

/* ---------------- 模式：ext / all / 0..4 ---------------- */
let mode = 'ext', showShafts = true;
const EXPL = 8.5;
const offs = FLOORS.map(() => 0), offTarget = FLOORS.map(() => 0);
function viewFor(m) {
  const P = PORTRAIT();
  if (m === 'ext') return { target: new THREE.Vector3(0, 6, P ? 18 : 30), zoom: P ? fitZoom(140, 1) : fitZoom(250, 150), theta: AZ, phi: POL };
  if (m === 'all') return { target: new THREE.Vector3(0, 19, 0), zoom: P ? fitZoom(100, 1) : fitZoom(120, 116), theta: AZ, phi: 0.86 };
  return { target: new THREE.Vector3(0, FLOORS[m].y, 1), zoom: P ? fitZoom(72, 1) : fitZoom(94, 62), theta: AZ, phi: 0.8 };
}
function setMode(m, o = {}) {
  if (typeof m === 'string' && /^\d$/.test(m)) m = +m;
  mode = m;
  fullG.forEach((g, i) => { g.visible = m === 'ext' || (typeof m === 'number' && i < m); });
  floorG.forEach((g, i) => {
    const on = m === 'all' || m === i || (m === 'ext' && i === 4);
    g.visible = on; g.userData.cut.visible = m !== 'ext';
    if (on) ensureFurn(i);
    shaftG[i].visible = showShafts && m !== 'ext' && on;
    offTarget[i] = m === 'all' ? i * EXPL : 0;
  });
  if (pinned && !itemVisible(pinned)) unpin();
  hover = null; hideCard(true);
  syncNav(); updateLabelSet(); renderer.shadowMap.needsUpdate = true; needs = true;
  if (o.fly) flyTo(viewFor(m));
  if (o.user) post({ type: 'estate:floor', floor: modeKey(m) });
}
const modeKey = (m) => (typeof m === 'number' ? FLOORS[m].id : m);
function toggleShafts() { showShafts = !showShafts; shaftG.forEach((g, i) => { g.visible = showShafts && mode !== 'ext' && floorG[i].visible; }); syncNav(); needs = true; renderer.shadowMap.needsUpdate = true; }
function itemVisible(it) {
  if (it.kind === 'area') return mode === 'ext';
  if (it.kind === 'shaft') return mode !== 'ext' && showShafts;
  return mode === 'all' || mode === it.floor;
}
function parseFloor(f) {
  if (f == null) return null; const s = String(f).trim().toLowerCase();
  if (['ext', 'exterior', '外观', 'out'].includes(s)) return 'ext';
  if (['all', '全部', 'cutaway'].includes(s)) return 'all';
  const n = s.match(/(\d)/); if (n) { const k = +n[1]; if (k >= 1 && k <= 5) return k - 1; }
  return null;
}

/* ---------------- 标签：按模式、缩放与重叠筛选 ---------------- */
let labelSet = [];
function updateLabelSet() {
  labelSet = [];
  for (const it of ITEMS) { if (!it.label) continue; const on = itemVisible(it) && it.kind !== 'shaft'; it.label.visible = on; if (on) labelSet.push(it); }
  floorTags.forEach((o) => { o.visible = mode === 'all'; });
}
const _v = new THREE.Vector3();
function cullLabels() {
  const W = innerWidth, H = innerHeight, placed = [];
  const visW = (camera.right - camera.left) / camera.zoom;
  const list = labelSet.slice().sort((a, b) => (b === pinned) - (a === pinned) || b.pri - a.pri);
  for (const it of list) {
    const el = it.label.element;
    let ok = true;
    if (it.kind === 'area' && visW > 520 && it.d.pri < 8) ok = false;
    if (it.kind === 'area' && visW < 60 && it.d.pri < 10) ok = false;
    if (it.kind === 'room' && mode === 'all' && visW > 150 && it.pri < 150) ok = false;
    it.label.getWorldPosition(_v).project(camera);
    const x = (_v.x + 1) / 2 * W, y = (1 - _v.y) / 2 * H;
    if (!it.lw) { it.lw = el.firstChild.offsetWidth || 60; it.lh = el.firstChild.offsetHeight || 18; }
    const r = [x - it.lw / 2 - 3, y - it.lh / 2 - 2, x + it.lw / 2 + 3, y + it.lh / 2 + 2];
    if (ok && it !== pinned) for (const p of placed) if (r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1]) { ok = false; break; }
    if (ok) placed.push(r);
    el.classList.toggle('hide', !ok); el.classList.toggle('hot', it === pinned);
  }
}

/* ---------------- 高亮框 ---------------- */
function mkHi(color, lineOp, fillOp) {
  const g = new THREE.Group(); g.renderOrder = 6;
  const lm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: lineOp, depthWrite: false });
  const fm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: fillOp, depthWrite: false, side: THREE.DoubleSide });
  const bars = [0, 1, 2, 3].map(() => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), lm));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), fm);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2), lm); const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), fm);
  g.add(...bars, fill, ring, disc); g.userData = { bars, fill, ring, disc, lm, fm, lineOp, fillOp }; g.visible = false; scene.add(g); return g;
}
const hiPin = mkHi('#e6c36a', 0.95, 0.2), hiHover = mkHi('#f3dfa2', 0.55, 0.1);
function showHi(h, it) {
  if (!it) { h.visible = false; return; }
  const u = h.userData, parent = it.kind === 'room' ? floorG[it.floor] : scene;
  if (h.parent !== parent) parent.add(h);
  const y = it.kind === 'room' ? it.y + 0.06 : it.kind === 'shaft' ? 0 : (it.d.pri >= 10 ? 1.3 : it.d.name === '停靠平台' ? 0.6 : 0.5);
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
  if (it.kind === 'shaft') { const f = typeof mode === 'number' ? mode : 0; h.position.y = 0; u.fill.position.y = u.bars[0].position.y = FLOORS[f].y + 0.1; for (const b of u.bars) b.position.y = FLOORS[f].y + 0.14; if (h.parent !== floorG[f]) floorG[f].add(h); }
  h.visible = true;
}

/* ---------------- 房间卡 ---------------- */
const card = $('#card');
function cardHTML(it) {
  const d = it.d, zh = LANG === 'zh';
  let sub, size;
  if (it.kind === 'room') { sub = floorName(it.floor); size = `${it.w} × ${it.dd} m · ${Math.round(it.w * it.dd)} ㎡`; }
  else if (it.kind === 'area') { sub = t('estate'); size = it.round ? `${t('dia')} ${it.w} m` : `${it.w} × ${it.dd} m`; }
  else { sub = t('thru'); size = `${it.w} × ${it.dd} m`; }
  const si = { '世界书': 0, 'ROADMAP': 1, '推断': 2 }[d.src] ?? 2;
  const srcName = zh ? d.src : SRC_EN[d.src] || d.src;
  const note = zh && d.note ? d.note : '';
  const alt = zh ? (EN[d.name] || [''])[0] : d.name;
  return `<h3>${nameOf(it)}</h3><div class="sub">${sub}${alt ? ' · ' + alt : ''}</div>` +
    `<div class="row"><em>${t('size')}</em>${size}</div><div class="row"><em>${t('use')}</em>${useOf(it)}</div>` +
    `<div class="src"><b class="s${si}">${srcName}</b>${note}</div>`;
}
let cardFor = null, cardAt = null;
function showCard(it, x, y) {
  if (cardFor !== it) { card.innerHTML = cardHTML(it); cardFor = it; }
  cardAt = x == null ? null : [x, y]; placeCard(); card.classList.add('on');
}
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
  // 最具体的优先（面积最小）
  hits.sort((a, b) => (a.object.userData.item.w * a.object.userData.item.dd) - (b.object.userData.item.w * b.object.userData.item.dd));
  return hits[0].object.userData.item;
}
let pinned = null, hover = null;
function pin(it, fly) {
  pinned = it; showHi(hiPin, it); showHi(hiHover, null); showCard(it); needs = true;
  if (fly) focusView(it);
}
function unpin() { pinned = null; showHi(hiPin, null); hideCard(true); needs = true; }
function focusView(it) {
  const y = it.kind === 'room' ? it.y + (mode === 'all' ? offTarget[it.floor] : 0) : it.kind === 'area' ? 0 : FLOORS[typeof mode === 'number' ? mode : 0].y;
  // 等轴投影下房间外接尺寸（按当前方位角）
  sph.setFromVector3(camera.position.clone().sub(controls.target));
  const c = Math.abs(Math.cos(sph.theta)), s = Math.abs(Math.sin(sph.theta));
  const pw = it.w * c + it.dd * s, ph = (it.w * s + it.dd * c) * Math.cos(sph.phi) + 3;
  const pad = it.kind === 'room' ? 1.25 : 1.12;
  flyTo({ target: new THREE.Vector3(it.cx, y, it.cz), zoom: fitZoom(pw * pad + 3, ph * pad + 6), theta: null, phi: null });
}
function focusItem(it) {
  if (it.kind === 'room' && mode !== it.floor) setMode(it.floor);
  if (it.kind === 'area' && mode !== 'ext') setMode('ext');
  if (it.kind === 'shaft' && mode === 'ext') setMode(0);
  pin(it, true);
}
function findByName(name) {
  const s = String(name || '').trim(); if (!s) return null;
  let best = null, score = -1; const low = s.toLowerCase();
  for (const it of ITEMS) {
    const d = it.d, rank = it.kind === 'room' ? 3 : it.kind === 'area' ? (d.pri >= 10 ? 1 : 2) : 2;
    const keys = [d.name, ...(d.alias || []), (EN[d.name] || [])[0]].filter(Boolean);
    for (const k of keys) {
      const kl = k.toLowerCase(); let sc = -1;
      if (low === kl) sc = 10000; else if (low.includes(kl)) sc = rank * 100 + kl.length; else continue;
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
  const to = { target: v.target.clone(), zoom: THREE.MathUtils.clamp(v.zoom, minZoom, maxZoom), theta: v.theta ?? sph.theta, phi: v.phi ?? sph.phi };
  let dt = to.theta - sph.theta; dt = Math.atan2(Math.sin(dt), Math.cos(dt));
  tween = { t0: performance.now(), dur, from: { target: controls.target.clone(), zoom: camera.zoom, theta: sph.theta, phi: sph.phi }, to, dt };
  needs = true;
}
function stepTween(now) {
  if (!tween) return false;
  let k = Math.min(1, (now - tween.t0) / tween.dur); const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const f = tween.from, to = tween.to;
  const tg = f.target.clone().lerp(to.target, e);
  camera.zoom = Math.exp(Math.log(f.zoom) + (Math.log(to.zoom) - Math.log(f.zoom)) * e); camera.updateProjectionMatrix();
  placeCam(tg, f.theta + tween.dt * e, f.phi + (to.phi - f.phi) * e);
  if (k >= 1) tween = null;
  return true;
}

/* ---------------- 缩放：滚轮 / 触控板捏合 / 双指捏合 / 按钮 ---------------- */
const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _dir = new THREE.Vector3();
function zoomAt(cx, cy, f) {
  tween = null;
  const rc = renderer.domElement.getBoundingClientRect();
  const nx = ((cx - rc.left) / rc.width) * 2 - 1, ny = -((cy - rc.top) / rc.height) * 2 + 1;
  _p0.set(nx, ny, 0).unproject(camera);
  const z = THREE.MathUtils.clamp(camera.zoom * f, minZoom, maxZoom); if (z === camera.zoom) return;
  camera.zoom = z; camera.updateProjectionMatrix();
  _p1.set(nx, ny, 0).unproject(camera);
  _p0.sub(_p1); camera.position.add(_p0); controls.target.add(_p0);
  keepTargetY(); needs = true;
}
let targetY = 6;
function keepTargetY() {  // 沿视线把轴心滑回原高度（正交相机下画面不变）
  _dir.subVectors(controls.target, camera.position).normalize(); if (Math.abs(_dir.y) < 1e-3) return;
  const s = (targetY - controls.target.y) / _dir.y; controls.target.addScaledVector(_dir, s); camera.position.addScaledVector(_dir, s);
}
app.addEventListener('wheel', (e) => {
  e.preventDefault(); e.stopPropagation();
  let dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 300 : 1);
  dy = THREE.MathUtils.clamp(dy, -150, 150);
  zoomAt(e.clientX, e.clientY, Math.exp(-dy * (e.ctrlKey ? 0.011 : 0.0021)));
}, { passive: false, capture: true });
// 双指捏合（与 OrbitControls 的双指平移并行）
let pinch = null;
app.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) { const [a, b] = e.touches; pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), t: performance.now(), moved: 0, cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2 }; }
}, { passive: false });
app.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (e.touches.length === 2 && pinch) { const [a, b] = e.touches; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); const cx = (a.clientX + b.clientX) / 2, cy = (a.clientY + b.clientY) / 2;
    if (pinch.d > 0) zoomAt(cx, cy, d / pinch.d); pinch.moved += Math.abs(d - pinch.d) + Math.hypot(cx - pinch.cx, cy - pinch.cy); pinch.d = d; pinch.cx = cx; pinch.cy = cy; }
}, { passive: false });
app.addEventListener('touchend', (e) => {
  if (pinch && e.touches.length < 2) { // 双指轻点 → 拉近该房间
    if (performance.now() - pinch.t < 260 && pinch.moved < 12) { const it = pickAt(pinch.cx, pinch.cy); if (it) { focusItem(it); post({ type: 'estate:select', name: it.d.name, floor: it.floor != null ? FLOORS[it.floor].id : null }); } }
    pinch = null;
  }
});
const zoomBtn = (f) => { const rc = renderer.domElement.getBoundingClientRect(); const z0 = camera.zoom; const to = THREE.MathUtils.clamp(z0 * f, minZoom, maxZoom); flyTo({ target: controls.target.clone(), zoom: to, theta: null, phi: null }, 260); };
$('#zin').onclick = () => zoomBtn(1.6); $('#zout').onclick = () => zoomBtn(1 / 1.6); $('#zreset').onclick = () => { unpin(); flyTo(viewFor(mode)); };

/* ---------------- 指针：悬停卡、点选、双击 ---------------- */
let down = null, lastTap = null;
renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType }; tween = null; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; const type = down.type; down = null;
  if (moved > 7 || dt > 450 || pinch) return;
  const it = pickAt(e.clientX, e.clientY);
  if (type !== 'mouse') {
    const now = performance.now();
    if (lastTap && now - lastTap.t < 330 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) { lastTap = null; dbl(it); return; }
    lastTap = { t: now, x: e.clientX, y: e.clientY };
  }
  if (it) { pin(it, false); post({ type: 'estate:select', name: it.d.name, floor: it.floor != null ? FLOORS[it.floor].id : null }); } else if (pinned) unpin();
});
renderer.domElement.addEventListener('dblclick', (e) => { dbl(pickAt(e.clientX, e.clientY)); });
function dbl(it) { if (it) focusItem(it); else { unpin(); flyTo(viewFor(mode)); } }
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || e.buttons) return;
  const it = pickAt(e.clientX, e.clientY);
  if (it !== hover) { hover = it; showHi(hiHover, it && it !== pinned ? it : null); needs = true; }
  if (it) showCard(it, e.clientX + 16, e.clientY + 14); else hideCard();
  renderer.domElement.style.cursor = it ? 'pointer' : '';
});
renderer.domElement.addEventListener('pointerleave', () => { hover = null; showHi(hiHover, null); hideCard(); needs = true; });
controls.addEventListener('start', () => { tween = null; });
controls.addEventListener('change', () => { needs = true; });

/* ---------------- 键盘 / 消息 ---------------- */
const SEQ = [0, 1, 2, 3, 4, 'ext'];
window.addEventListener('keydown', (e) => {
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
addEventListener('resize', () => { frustum(); renderer.setSize(innerWidth, innerHeight); labelR.setSize(innerWidth, innerHeight); camera.zoom = THREE.MathUtils.clamp(camera.zoom, minZoom, maxZoom); camera.updateProjectionMatrix(); needs = true; });

/* ---------------- 循环 ---------------- */
const statsEl = $('#stats'); if (STATS) statsEl.style.display = 'block';
let frames = 0, fpsT = performance.now(), fps = 0, first = true, lastInfo = { calls: 0, triangles: 0 };
function loop(now) {
  requestAnimationFrame(loop);
  let moving = stepTween(now);
  if (!moving) moving = controls.update();
  else controls.update();
  // 目标限制在岛上空
  const tg = controls.target; const cx = THREE.MathUtils.clamp(tg.x, -340, 340), cz = THREE.MathUtils.clamp(tg.z, -300, 320);
  if (cx !== tg.x || cz !== tg.z) { camera.position.x += cx - tg.x; camera.position.z += cz - tg.z; tg.x = cx; tg.z = cz; }
  if (!tween) targetY = tg.y;
  // 楼层展开动画
  let anim = false;
  floorG.forEach((g, i) => { const d = offTarget[i] - offs[i]; if (Math.abs(d) > 0.01) { offs[i] += d * 0.18; anim = true; } else offs[i] = offTarget[i]; g.position.y = offs[i]; });
  if (anim) renderer.shadowMap.needsUpdate = true;
  const visW = (camera.right - camera.left) / camera.zoom;
  fitShadow(visW < 300);
  if (pinned) { const k = 0.6 + 0.4 * Math.abs(Math.sin(now / 420)); hiPin.userData.fm.opacity = hiPin.userData.fillOp * (0.5 + k * 0.7); }
  if (!(needs || moving || anim || STATS || pinned)) return;
  needs = false;
  renderer.render(scene, camera); lastInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  labelR.render(scene, camera); cullLabels();
  if (cardFor && !cardAt) placeCard();
  frames++;
  if (first) { first = false; onFirstFrame(); }
  if (STATS && now - fpsT > 500) { fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; statsEl.textContent = `${fps.toFixed(0)} fps\n${lastInfo.calls} calls\n${(lastInfo.triangles / 1000).toFixed(0)}k tris\nbuild ${T_BUILD.toFixed(0)} ms`; }
}
function onFirstFrame() {
  $('#loading').classList.add('done');
  window.__estate.firstFrameMs = performance.now() - T0;
  post({ type: 'estate:ready', floors: FLOORS.map((f) => f.id), rooms: ROOMS.filter((r) => !r.minor).map((r) => ({ name: r.name, en: (EN[r.name] || [])[0], floor: FLOORS[r.floor].id, alias: r.alias })).concat(AREAS.map((a) => ({ name: a.name, en: (EN[a.name] || [])[0], floor: 'ext', alias: a.alias }))) });
  // 室内在空闲时补建
  let i = 0; const idle = window.requestIdleCallback || ((f) => setTimeout(f, 60));
  const next = () => { while (i < 4 && furnG[i]) i++; if (i >= 4) return; ensureFurn(i); if (!floorG[i].visible) needs = false; i++; idle(next); };
  idle(next);
}

/* ---------------- 启动 ---------------- */
window.__estate = { setMode, focus: (n) => { const it = findByName(n); if (it) focusItem(it); return !!it; }, stats: () => ({ ...lastInfo, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, build: T_BUILD }), camera, controls, renderer, scene, setLang };
buildNav(); relabel(); frustum();
const m0 = parseFloor(Q.get('floor')) ?? 'ext';
setMode(m0);
const v0 = viewFor(m0); camera.zoom = THREE.MathUtils.clamp(v0.zoom, minZoom, maxZoom); camera.updateProjectionMatrix(); placeCam(v0.target, v0.theta, v0.phi); targetY = v0.target.y;
fitShadow(true);
requestAnimationFrame(loop);
