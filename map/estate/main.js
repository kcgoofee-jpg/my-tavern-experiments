// 三维室内查看器：模型加载、外观 / 楼层（剖切）、楼层条、房间与室外热点、房间卡、缩放交互、嵌入协议（说明见 index.html 顶部注释）
// 模型：加载由清单驱动（Estate3D Manifest 标准契约，map/core/scene3d-manifest.mjs 校验 / 解析，代码里不写死资源路径；嵌入时宿主给清单地址）。
//   site 部件（整岛 / 场地外观，烘焙光照）+ house 部件（室内体量，进楼层视图时才加载）。
// 数据（都来自清单）：房间表 data.rooms（精确多边形，房间以 node 对到包的节点）、室外热点 data.zones、房间叫法 / 子区域 / 载具 data.extras；
//   建筑名与楼层名（building、floors）、房间类别的颜色与名字（room_kinds）也在清单里，页面只留中性兜底。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { nodePictures } from '../core/pack-media.mjs';   // 设定包图片（K-R101）：来源规则与查看器同一份
import { bindRoomCustomEvents, getCustomName, setGalleryChatId } from '../ui/room-gallery-panel.js';   // PLACE-1b: 只留图集入口与旧的本机叫法（只读）；那两个「自定义名称 / 简介」输入框不再画
import { makePresetCluster, makeCompass, makeHintCard, makeIdleTimer, wheelAction, rotateOn } from '../ui/camera-controls.js';
import { Estate3D } from '../core/scene3d-manifest.mjs';   // Estate3D Manifest 标准契约（P3-A）：清单校验 / 路径解析 / describe 摘要
import { createRenderer as createGpu } from '../three/render-context.mjs';   // 全仓唯一的渲染器工厂（stencil:true → WebKit 上 24 位深度，N12）
import { fitNearFar, applyNearFar, depthLabel, sphereOfBox } from '../three/depth-fit.mjs';   // N12：near / far 贴合场景；调试叠层显示深度位数
import { createRenderGate, wireVisibility } from '../core/render-gate.mjs';   // Part 7-4：页面隐藏时渲染循环整个停掉
import { spots as stashSpots, placeOf, propGlow, describe as describeStash, PROP_R } from '../core/stash3d.mjs';   // Part 8-1：世界藏物表 → 三维落点（纯映射）
import { createWalker, tickClock, DEFAULT_ROUND_MS } from '../core/walk.mjs';   // Part 8-2：确定性时钟 + 三维插值（NPC 不瞬移）
import { normSchedule, placesAt } from '../core/routine.mjs';
import { normClock } from '../core/clock.mjs';
import { createCycle as createDayNight, apply as applyDayNight, applyGrade } from '../three/daynight.mjs';   // Part 9-1：昼夜环境（光 + 烘焙调色）
import { registerFX } from '../three/particles.mjs';                                                          // Part 9-2：fx 槽位粒子（雨雪 / 以太极光）
import { splitWalls } from './terrain.js';   // 地面陡面的石砌材质
import { createPresence } from './presence.js';   // S7-3：人物头像（聊天里落在房间里的人 + 日程里的人）
import { createLabelGuard } from './labels.js';   // S7-3：被楼体挡住的标注隐掉
import { createBackdrop, PERIOD_MIN } from '../three/backdrop.mjs';   // ESTATE-MODES-1 7c：分时段天空渐变 + 云海（与地标查看器共用）；PERIOD_MIN = 时钟胶囊的时段 → 关键帧时刻
import { flatColorOf, patchSurface, patchBackFace, applyNightFlat, applyGlow, isGlowMaterial } from '../three/night-look.mjs';   // A4：夜里把烘焙的日光对比抹平；D38：夜里亮的是窗
import { patchInterior, loadInteriors, armInteriors, aimInterior, interiorCount } from '../three/interior-look.mjs';   // INTERIOR-WINDOWS：窗后摆一间带纵深的房间
import { LayerRegistry } from '../core/layer-registry.mjs';                                                           // P3-C：fx 槽位按注册表契约挂载

const T0 = performance.now();
const Q = new URLSearchParams(location.search);
const IN_FRAME = window.parent !== window;
const EMBED = Q.get('embed') === '1' || location.protocol === 'about:' || location.protocol === 'blob:';
const SHELL = window.__shell === 'host';   // 壳模式（S7-3）：查看器的顶栏、楼层条、工具栏、抽屉与卡片就是这页的控件；本页只画画布、画布里的标注和人物头像
let STATS = Q.get('stats') === '1';   // ?stats=1 或查看器「调试：显示帧率」设置（estate:fps 消息，实时开关）
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const CAM = { autoRotate: false, wheelZoom: true, rm: REDUCED, idle: false };   // I-06: camera settings from the viewer (estate:camera) plus the runtime idle flag; nothing here writes a key
const COARSE = matchMedia('(pointer: coarse)').matches;
const LS = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
let LANG = (Q.get('lang') || LS('edenMapLang') || 'zh').startsWith('en') ? 'en' : 'zh';
let THEME = Q.get('theme') === 'light' ? 'light' : 'dark';
document.body.classList.toggle('embed', EMBED); document.body.classList.toggle('shell', SHELL);
document.documentElement.dataset.theme = THEME; document.documentElement.classList.toggle('light', THEME === 'light');
const $ = (s) => document.querySelector(s);
const app = $('#app');
// ---------------- UI v2 外壳（ui/chrome3d.js，spec §4）：视图分段 外观 / 楼层，楼层是二级条；控制列 标注 + − ⟲；抽屉 房间 · 关于（默认收起）----------------
document.getElementById('zoom')?.remove();
const aboutEl = document.createElement('div'); aboutEl.id = 'about';
const roomEl = document.createElement('div'); roomEl.id = 'roomPane'; if (!SHELL) roomEl.append(document.getElementById('card')); { const e = document.createElement('p'); e.id = 'cardEmpty'; roomEl.append(e); }
/** 壳模式的外壳替身：没有任何 DOM；查看器经 estate:inset 告诉本页它的右栏 / 抽屉盖住了多少 */
const shellChrome = () => { const ins = { right: 0, bottom: 0 }, subs = new Set(), no = () => {}; return { root: document.body, insets: () => ({ ...ins }), onInsets: (f) => subs.add(f), setInsets: (m) => { Object.assign(ins, m); subs.forEach((f) => f()); },
  sheet: { tab: '', open: false, state: 'peek', mode: 'sheet', setTab: no, set: no, label: no, down: () => false }, setView: no, setViews: no, showSub: no, setText: no, setTitle: no, setAuto: no, dragStart: no, dragEnd: no }; };
const C3 = SHELL ? shellChrome() : window.UI3D.create({ embed: EMBED, views: [{ id: 'ext', label: LANG === 'en' ? 'Exterior' : '外观' }, { id: 'sect', label: LANG === 'en' ? 'Floors' : '楼层' }], view: 'ext', sub: document.getElementById('floors'),
  onView: (v) => setMode(v === 'sect' ? (isFloor(mode) ? mode : lastFloor) : v, { fly: true, user: true }),
  controls: [{ id: 'lblBtn', icon: 'labels', pressed: true }, { id: 'zin', icon: 'in' }, { id: 'zout', icon: 'out' }, { id: 'zreset', icon: 'reset' }],
  tabs: [{ id: 'room', btnClass: 'roomTab', panel: roomEl }, { id: 'about', btnClass: 'aboutTab', panel: aboutEl }],
  onEsc: () => { if (IN_FRAME) post({ type: 'estate:key', key: 'Escape' }); else if (pinned) unpin(); } });
C3.setAuto(LS('edenMap3dAuto') === '1');   // 独立打开时的抽屉自动收起（高级设置，默认关）
let lastFloor = 0;   // 最近一次剖切的楼层（下标），FLOORS 读出后取第一层地上楼
const url = (p) => new URL(p, document.baseURI).href;   // 查看器用 blob + <base> 载入本页：相对地址按 <base> 解析
const kick = (phase) => { try { window.__estateKick && window.__estateKick(phase); } catch (e) { } };
const clamp = THREE.MathUtils.clamp;
let needs = true, rafId = 0, running = false, labelWait = 0, ctlLive = false, dragging = false, zoomedNow = null;   // 按需渲染的状态（见 wake / loop）

/* ---------------- 档位：低档 = 省流 / 慢网 / 内存 ≤ 4 GB（地图「省流」档 edenMapTierV2 = save 也算）；新款手机（iPhone 不报内存、安卓 ≥ 6 GB）走标准档 ---------------- */
const qTier = Q.get('tier');
const conn = navigator.connection || {};
const LOW = qTier != null ? /^(1|2|low|save)$/.test(qTier)
  : (LS('edenMapTierV2') === 'save' || !!conn.saveData || /(^|-)(2g|3g)$/.test(conn.effectiveType || '') || (navigator.deviceMemory || 8) <= 4);
const tier = LOW ? 1 : 0;
let DPR = Math.min(window.devicePixelRatio || 1, LS('edenMap3dQ') === '1' ? 1 : COARSE ? 2 : (window.devicePixelRatio || 2));   // 设置「显示 · 三维画质」省电 = 1 倍；手机（粗指针）封顶 2 倍（原先低档 1.5 + 关抗锯齿，边缘锯齿、贴图发糊，持续帧率 < 30 再降到 1.5，见 loop）；桌面不封顶，用满屏幕的物理像素比（2026-09-28）
if (LS('edenMap3dQ') === '1') document.documentElement.classList.add('noblur');   // 省电画质：不用毛玻璃
let lowRes = false;

/* ---------------- 渲染器（烘焙光照：MeshBasic，无色调映射；室内体量用 Lambert + 两盏灯） ---------------- */
const gpu = createGpu({ THREE, canvas: document.createElement('canvas'), tier: 'mid', alpha: true, powerPreference: 'high-performance' }), renderer = gpu.renderer;   // 抗锯齿开、不透明度通道开、stencil 在工厂里（强制 24 位深度）
renderer.setPixelRatio(DPR); renderer.setSize(innerWidth, innerHeight); renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping; renderer.localClippingEnabled = true;
app.prepend(renderer.domElement);
const labelR = new CSS2DRenderer({ element: $('#labels') }); labelR.setSize(innerWidth, innerHeight);
document.body.classList.add('grade');
const scene = new THREE.Scene();
const hemiL = new THREE.HemisphereLight('#f4efe6', '#8a8070', 2.2); scene.add(hemiL);
const sunL = new THREE.DirectionalLight('#fff1dc', 1.6); sunL.position.set(-0.55, 1, 0.45); scene.add(sunL);
/* Part 9-1：昼夜循环（世界时钟驱动，见 npcTick；map/three/daynight.mjs 管插值与减弱动效降级） */
// 起手先按正午（= 原来那张静态外观的观感）开画；查看器推来真实世界时钟后 1.6s 淡到当时的时段，避免开局闪一下夜里。
const dayNight = createDayNight({ clock: { day: 1, min: 750 }, reducedMotion: REDUCED, fadeSec: 1.6 });
let dayNightT = 0, dayNightPhase = '';

/* ---------------- 数据（P3-A：模型 / 数据文件地址全部来自清单，代码不再写死或拼装资源路径） ---------------- */
kick('data');
const MAN_URL = window.__sceneManifest ? new URL(window.__sceneManifest, document.baseURI).href : url('model/manifest.json');   // 嵌入时宿主注入 __sceneManifest（设定包的清单地址）；独立打开读同目录的 model/manifest.json
const M3D = Estate3D.normalize(await fetch(MAN_URL).then((r) => r.json()), { base: new URL('.', MAN_URL).href });
const MAN = M3D.manifest;   // 清单原样保留（未知字段容错）；地址一律经 M3D.parts / M3D.data（已按清单所在目录解析）
const getJSON = (u, dflt) => (u ? fetch(u).then((r) => r.json()).catch(() => dflt) : Promise.resolve(dflt));
const [CARD, ZDATA, EXTRAS] = await Promise.all([getJSON(M3D.data.rooms, { floors: [], rooms: [] }), getJSON(M3D.data.zones, { zones: [] }), getJSON(M3D.data.extras, {})]);
const F1Y = MAN.f1_z ?? 30;                                  // F1 地坪的世界标高（layout z）
const FLOORS = (CARD.floors || []).map((f) => ({ ...f, y: F1Y + f.z }));   // bottom to top
const FI = Object.fromEntries(FLOORS.map((f, i) => [f.id, i]));
const GROUND = Math.max(0, FLOORS.findIndex((f) => f.z >= 0));   // 第一层地上楼的下标
lastFloor = GROUND;
const CUT = 1.5;                                             // 剖切高度（楼面以上）
const V = (x, y, z) => new THREE.Vector3(x, z, -y);          // layout (x 东, y 北, z 上) → three
// 房间的英文叫法（搜索用）、可点的子区域、室外载具：清单的 data.extras（包数据）
const ALIAS = EXTRAS.room_alias || {};
let PICS = {};   // 房间名 -> 这个房间的包图片 [{ id, item, url }]：宿主按运行时节点树发来（estate:media），地址经 pack-media 的来源规则；没有 = 空
// 房间里的子区域（单独一个可点的热点，点开就是它自己的卡 / 图集）：data.extras.sub_rooms
const SUBS = (EXTRAS.sub_rooms || []).map((w) => ({ ...w, sub: true, en: w.i18n?.en?.name || '', whereEn: w.i18n?.en?.where || '' }));
const KIND = (k) => Estate3D.kindInfo(MAN, k, LANG);   // K-R131：清单里的颜色与名字，没声明的类别 = 生成的颜色 + 类别 id

/* ---------------- 相机与控制（正交；缩放以光标为中心） ---------------- */
const BASE = 60, DIST = 1600;
const camera = new THREE.OrthographicCamera(-BASE, BASE, BASE, -BASE, 1, 5000);
let minZoom = 0.05, maxZoom = 20;
const barBox = () => C3.insets();   // UI v2：取景让开底部抽屉 / 右栏
function frustum() {
  const a = innerWidth / innerHeight; camera.left = -BASE * a; camera.right = BASE * a; camera.top = BASE; camera.bottom = -BASE; camera.updateProjectionMatrix();
  minZoom = Math.min(2 * BASE * a / 1400, 2 * BASE / 1100); maxZoom = 2 * BASE / 4;
  const b = barBox(), ox = Math.round(b.right / 2), oy = Math.round(b.bottom / 2);
  camera.setViewOffset(innerWidth, innerHeight, ox, oy, innerWidth, innerHeight);
}
frustum();
const fitZoom = (w, h) => {
  const b = barBox(); let uw = 1, uh = 1;
  uh = Math.max(0.55, 1 - (b.bottom + 8) / innerHeight); uw = Math.max(0.5, 1 - (b.right + 10) / innerWidth);
  return Math.min(2 * BASE * (innerWidth / innerHeight) * uw / w, 2 * BASE * uh / h);
};
const PORTRAIT = () => innerWidth / innerHeight < 0.8;
const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, { enableDamping: !REDUCED, dampingFactor: 0.14, rotateSpeed: 0.55, screenSpacePanning: true, enableZoom: false, minPolarAngle: 0.12, maxPolarAngle: 1.36 });
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.PAN };
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
// shift + 左键拖也当平移（触控板没有右键，笔记本习惯用 shift）：按下时临时换掉 LEFT 的动作，抬起再换回来
renderer.domElement.addEventListener('pointerdown', (e) => { if (e.button === 0 && e.shiftKey) { controls.mouseButtons.LEFT = THREE.MOUSE.PAN; const back = () => { controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE; removeEventListener('pointerup', back); }; addEventListener('pointerup', back); } }, { capture: true });
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
const polyBox = (rooms) => {   // 房间多边形的外包（layout 米）；没有房间 = 一个小方块
  const ps = rooms.flatMap((r) => r.poly || []); if (!ps.length) return { x0: -10, x1: 10, y0: -10, y1: 10 };
  return { x0: Math.min(...ps.map((p) => p[0])), x1: Math.max(...ps.map((p) => p[0])), y0: Math.min(...ps.map((p) => p[1])), y1: Math.max(...ps.map((p) => p[1])) };
};
const HOUSE_BOX = polyBox(CARD.rooms || []);

/* ---------------- UI 文案（COPY-1 定词：docs/copy-style.md。本页自己一张表，zh 为准、en 镜像；表外不留硬编码） ---------------- */
const TXT = {
  zh: { ext: '外观', sect: '楼层', hint: '拖动旋转 · 右键拖动或双指平移 · 滚轮平移，捏合或按住 Ctrl 缩放 · 双击房间或区域拉近 · 按 0 复位视野', zin: '放大', zout: '缩小', zreset: '复位视野', labels: '显示标注（L）', size: '面积', use: '说明', access: '出入', canvas: '{b}，{f}，{n} 人', person: '{name}，{room}', more: '还有 {n} 人', schedule: '按日程', estate: '室外', alias: '叫法', where: '位置', orig: '原名', loadingP: '加载模型 {p}', enter3d: '进入三维', expand: '展开', collapse: '收起', region: '房间与关于', rooms: '房间', roomsShort: '房', about: '关于', aboutShort: '关', empty: '点模型上的房间或区域，这里显示它的说明', top: '俯视', iso: '斜视 45°', front: '正面', free: '自由', pick: '拾取', hidden: '暗格：{v}', houseFail: '楼层模型没取到，检查网络后重试', retry: '重试' },
  en: { ext: 'Exterior', sect: 'Floors', hint: 'Drag to orbit · right-drag or two fingers to pan · wheel pans, pinch or Ctrl-drag zooms · double-click a room or area to zoom in · 0 resets the view', zin: 'Zoom in', zout: 'Zoom out', zreset: 'Reset view', labels: 'Show labels (L)', size: 'Area', use: 'Notes', access: 'Access', canvas: '{b}, {f}, {n} people', person: '{name}, {room}', more: '{n} more', schedule: 'By schedule', estate: 'Grounds', alias: 'Called', where: 'Where', orig: 'Original name', loadingP: 'Loading model {p}', enter3d: 'Enter 3D', expand: 'Expand', collapse: 'Collapse', region: 'Room and about', rooms: 'Room', roomsShort: 'R', about: 'About', aboutShort: 'A', empty: 'Tap a room or area on the model to read about it here', top: 'Top', iso: 'Iso 45°', front: 'Front', free: 'Free', pick: 'Pick up', hidden: 'hidden: {v}', houseFail: 'The floor model failed to load. Check the connection and retry.', retry: 'Retry' },
};
const tx = (k, v = {}) => (TXT[LANG][k] || TXT.zh[k] || k).replace(/\{(\w+)\}/g, (_, n) => v[n] ?? '');
const FL = () => Estate3D.floorList(MAN, LANG);   // K-R132: id + label (the id when the manifest gives none)
const floorLabel = (i) => FL()[i]?.label || FLOORS[i].id;
const floorName = (i) => (floorLabel(i) === FLOORS[i].id ? FLOORS[i].id : `${FLOORS[i].id} · ${floorLabel(i)}`);
const BLD = () => Estate3D.building(MAN, LANG);

/* ---------------- 背景：分时段的天空渐变 + 云海（map/three/backdrop.mjs，配色锚在昼夜关键帧的雾色上） ---------------- */
let SPH = null;   // 整岛包围球（near / far 取景用）
const backdrop = createBackdrop({ THREE, scene });
let lastEnvPhase = 'noon';   // 最近一次画背景用的时段（主题切换时重画同一时段）
const paintBackdrop = () => backdrop.paint({ phase: lastEnvPhase, light: THEME === 'light' });

/* ---------------- 加载：整岛外观 glb ---------------- */
const loadEl = $('#loading'), setLoadText = (s) => { const sp = loadEl.querySelector('span'); if (sp) sp.textContent = s; };
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
// 档位常数登记在清单 budget（各向异性过滤上限、低档内存阈值），这里只消费
const ANISO = MAN.budget?.anisotropy ?? 8, ANISO_LOW = MAN.budget?.anisotropy_low ?? 4;
// 模型缓存（Cache API，键 = 地址 + ?estv=manifest.v）：关掉面板再冷开也不重下；重出模型时改 manifest.json 的 v。拿不到 caches（file:// / 老浏览器）就直接下载
const GLB_CACHE = 'eden-estate-glb';
async function loadGlb(u, onProg) {
  const key = u + (u.includes('?') ? '&' : '?') + 'estv=' + (MAN.v || '0');
  let cache = null; try { cache = self.caches && await caches.open(GLB_CACHE); } catch (e) { }
  if (cache) try {
    const hit = await cache.match(key);
    if (hit) { const buf = await hit.arrayBuffer(); STAT.cached = (STAT.cached || 0) + 1; kick('glb'); return await loader.parseAsync(buf, u.replace(/[^/]*$/, '')); }
  } catch (e) { }
  const g = await new Promise((res, rej) => new THREE.FileLoader().setResponseType('arraybuffer').load(u, res, (e) => { kick('glb'); onProg && onProg(e); }, rej));
  if (cache) cache.put(key, new Response(g.slice(0), { headers: { 'content-type': 'model/gltf-binary' } })).then(() => cache.keys()).then((ks) => ks.forEach((r) => { if (r.url.startsWith(u) && r.url !== key) cache.delete(r); })).catch(() => { });
  return loader.parseAsync(g, u.replace(/[^/]*$/, ''));
}
const TB = {}, STAT = { tris: 0, bytes: 0, site: '', house: '' };
const siteFile = (LOW && M3D.parts.site.low) || M3D.parts.site.std;   // 清单已按所在目录解析；low 档缺失回落 std
STAT.site = siteFile.split('/').pop();
let t = performance.now();
const siteG = (await loadGlb(siteFile, (e) => { post({ type: 'estate:progress', loaded: e.loaded || 0, total: e.total || 0, what: 'glb' });   // fix3：字节进度给查看器的统一加载组件（map/ui/progress.mjs）
  if (e.total) { STAT.bytes = e.total; setLoadText(tx('loadingP', { p: Math.round(100 * e.loaded / e.total) + '%' })); } else setLoadText(tx('loadingP', { p: (e.loaded / 1048576).toFixed(1) + ' MB' })); })).scene;
TB.site = performance.now() - t;
kick('setup');
const MESH = {}, GROUNDS = [], SITE_EXTRA = [];
const shellClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e5);
siteG.traverse((o) => {
  if (!o.isMesh) return;
  const srcMat = o.material.name || '';   // glTF 材质名：夜里哪些面自己发光靠它认（窗 / 玻璃，包数据可点名）
  const map = o.material.map || null;
  if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = Math.min(LOW ? ANISO_LOW : ANISO, renderer.capabilities.getMaxAnisotropy()); map.minFilter = THREE.LinearMipmapLinearFilter; map.generateMipmaps = true; map.needsUpdate = true; }
  if (map && /^(ground|rock|site_[cew])/.test(o.name)) GROUNDS.push(o);
  o.material.dispose();
  const shell = o.name.startsWith('house_shell');
  o.material = new THREE.MeshBasicMaterial({ map, vertexColors: !map && !!o.geometry.attributes.color, side: shell ? THREE.DoubleSide : THREE.FrontSide, clippingPlanes: shell ? [shellClip] : null });
  if (o.material.vertexColors) o.material.color.setScalar(1.22);
  if (o.material.vertexColors) {   // 烘焙漏洞：个别顶点色是纯黑（湖岸东侧建筑屋顶成黑块）→ 补成石板屋顶灰
    const c = o.geometry.attributes.color, n = c.count; let k = 0;
    for (let i = 0; i < n; i++) if (c.getX(i) + c.getY(i) + c.getZ(i) < 0.03) { c.setXYZ(i, 0.36, 0.345, 0.33); k++; }
    if (k) { c.needsUpdate = true; STAT.blackFix = (STAT.blackFix || 0) + k; }
  }   // 顶点色烘焙逐点平均了阴影面，整体偏暗：提一点与贴图烘焙对齐
  MESH[o.name] = o; o.userData.srcMat = srcMat; STAT.tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
});
GROUNDS.forEach((o) => splitWalls(o, { THREE, renderer, scene, STAT, SITE_EXTRA }));
scene.add(siteG);
{ const bb = new THREE.Box3().setFromObject(siteG); SPH = sphereOfBox(bb); }   // near / far 取景量一次
backdrop.fit(siteG); paintBackdrop();
const HOUSE_SHELL = Object.values(MESH).filter((m) => m.name.startsWith('house_shell')), SITE_MESHES = Object.values(MESH).filter((m) => !m.name.startsWith('house_shell'));

/* ---------------- Part 9-1 / 9-2：昼夜调色与 fx 槽位粒子 ---------------- */
// 外观这批是烘焙光照的 MeshBasic（不吃灯），昼夜只能靠调色：把每件材质的基准色记下来，按环境参数改 tint。
// 室内体量是真灯（Lambert），走 applyDayNight 的太阳 / 半球光那一支。
// 夜里再向每块烘焙面自己的平均色提（night-look.mjs）：烘焙的日光长影子和受光面对比抹平，只剩月光 / 环境光（A4）。
// 夜里亮的是窗：清单 x-night-glow 点的材质（没点就按材质名认窗 / 玻璃）加一层暖光，按世界坐标分格——每层亮度不同、约两成窗暗着。
const GLOW_LIST = MAN['x-night-glow'], GRADE_TARGETS = [], NIGHT_TARGETS = [], GLOW_TARGETS = [], GLOW_NAMES = [], CUT_TARGETS = [];   // 清单可点名夜里发光的材质（包数据；引擎里不写卡词）
for (const o of [...SITE_MESHES, ...HOUSE_SHELL, ...SITE_EXTRA]) {
  const m = o?.material; if (!m?.color?.setRGB || m.isShaderMaterial) continue;
  GRADE_TARGETS.push({ material: m, base: [m.color.r, m.color.g, m.color.b] });
  const shell = o.name.startsWith('house_shell');
  const glow = isGlowMaterial(o.userData.srcMat, GLOW_LIST);
  if (glow) GLOW_NAMES.push(o.userData.srcMat);
  const u = patchSurface(THREE, m, { flat: flatColorOf(THREE, o), back: shell ? [0.55, 0.52, 0.47] : null, glow });   // 截面色：浅灰（原先近黑，F2 剖切时翼楼成了黑块）；只在真的剖开时涂（applyMode 开 uCut）
  NIGHT_TARGETS.push({ u });
  if (shell) CUT_TARGETS.push(u);
  if (glow) { GLOW_TARGETS.push({ u }); patchInterior(THREE, m, { day: true }); }   // 窗：夜光之外再挂一层窗内景（没图集时 uIntOn=0，等于没挂）
}
// 窗内景图集（清单 x-interior，包数据）：异步到齐再打开，拿不到就一直是一层平光
loadInteriors(THREE, MAN['x-interior'], M3D.base, { low: LOW, aniso: LOW ? ANISO_LOW : ANISO }).then(armInteriors);
// 粒子按 LayerRegistry 契约注册在 fx 槽位（第 9 槽）；绘制仍用本页的渲染器 / 场景。
const FX_REG = new LayerRegistry();
const { engine: fx3d } = registerFX(FX_REG, {
  THREE, scene, quality: LOW ? .4 : 1, pixelRatio: DPR, reducedMotion: REDUCED, id: 'particles3d', order: 40,
  ortho: true,           // 这页是正交相机：点精灵不按距离衰减（不然粒子会被拉到几百米外缩成尘埃）
  box: [400, 180, 400],  // 整岛尺度（默认盒 60×40×60 米只够一间房）
  overrides: {           // 大场景微调：粒子调大调亮，极光当天幕
    rain: { size: 8, opacity: .6 }, snow: { size: 10 }, sand: { size: 14, opacity: .35 },
    aurora: { plane: { size: [1100, 360], position: [0, 230, -600] } },
  },
});
if (fx3d) {
  FX_REG.mountAll({ scene });
  fx3d.object.position.set(0, 100, 0);   // 粒子盒抬到岛面之上（默认盒心在世界原点，会整盒埋进地形里）
  scene.add(camera);                     // 相机进场景：极光要挂到它身上当天幕（见 attachAurora）
}
window.TCthreeFX = { set: (type, intensity) => fx3d?.setFXType(type, intensity) || null, describe: () => fx3d?.describe() || null,
  layers: () => FX_REG.describe() };
/** 极光天幕：把极光平面挂到相机上（加法混合、不写深度），按正交视野摆到天际线以上，绕岛 / 缩放都在 */
function attachAurora() {
  const m = fx3d?.object?.children?.find((o) => o.name === 'fx-aurora');
  if (!m) return;
  if (m.parent !== camera) camera.add(m);
  const w = (camera.right - camera.left) / camera.zoom, h = (camera.top - camera.bottom) / camera.zoom;
  m.position.set(0, h * .34, -(camera.near + 5));   // 紧贴近平面（加法混合、不写深度，原先 600 m 处；near 贴合场景后 600 m 在近平面之内会被裁掉）
  m.scale.set(w * 1.3 / 1100, h * .62 / 360, 1);
}

/* ---------------- 室内体量 glb（进楼层视图时才加载） ---------------- */
const houseClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e5);
const houseFloors = FLOORS.map(() => []);   // 每层 [struct, furn]
let houseState = 0;   // 0 未加载 / 1 加载中 / 2 好了 / -1 失败
function loadHouse() {
  if (houseState || !M3D.parts.house) return; houseState = 1; const t0 = performance.now();
  const file = (LOW && M3D.parts.house.low) || M3D.parts.house.std; STAT.house = file.split('/').pop();
  loadGlb(file).then((g) => {
    const root = g.scene; root.position.y = F1Y;
    for (const s of g.scenes || []) if (s !== root) for (const c of [...s.children]) root.add(c);   // E-14：f_B2_med（B2 医疗块）在第二个 scene 里，一并挂进默认场景
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, clippingPlanes: [houseClip] });
    patchBackFace(THREE, mat, [0.2, 0.18, 0.16]);
    root.traverse((o) => {
      if (!o.isMesh) return; o.material.dispose(); o.material = mat;
      const m = o.name.match(/^f_(B[12]|F[123])_/) || String(o.parent?.name || '').match(/^f_(B[12]|F[123])_/);   // 网格名不带楼层前缀时看它的节点（f_B2_med 里的 b2_cleanroom_panel）
      if (m) houseFloors[FI[m[1]]].push(o);
      STAT.tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    });
    scene.add(root); houseState = 2; TB.house = performance.now() - t0; applyMode(); wake();
  }).catch((e) => { console.warn('estate: house.glb', e); houseState = -1; applyMode(); });   // 失败在楼层视图里亮一行说明 + 重试（applyMode 里同步可见性）
}
const houseFailEl = $('#houseFail');
if (houseFailEl) { $('#houseRetry').textContent = tx('retry'); $('#houseRetry').onclick = () => { houseFailEl.hidden = true; houseState = 0; loadHouse(); }; }

/* ---------------- 房间（精确多边形）与室外热点 ---------------- */
const pickMat = new THREE.MeshBasicMaterial({ visible: false });
const roomG = FLOORS.map((f, i) => { const g = new THREE.Group(); g.name = 'rooms_' + f.id; g.visible = false; scene.add(g); return g; });
const ITEMS = [], ROOM_BY_NODE = new Map(), LBL_SEEN = new Set();   // node id → 它的（第一间）房间项；每层每个节点 / 名字只画一个标注
const polyShape = (poly) => new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
const flatGeo = (poly, y) => { const g = new THREE.ShapeGeometry(polyShape(poly)); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return g; };   // (x, y) → (x, y0, −y)
const bboxOf = (poly) => { const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; };
const PLATES = MAN['x-kind-plates'] === true;   // LEGEND-1 (D35): kind-coloured floor plates and the all-room edge lines are drawn only when the 3D manifest asks for them; the hover / pin highlight (mkHi) is the room boundary otherwise
const plateMats = {};
const plateMat = (kind) => (plateMats[kind] ||= new THREE.MeshBasicMaterial({ color: KIND(kind).color, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
const edgeMat = new THREE.LineBasicMaterial({ color: '#5a4a32', transparent: true, opacity: 0.55 });
const plates = FLOORS.map(() => []);
(CARD.rooms || []).concat(SUBS.filter((w) => (CARD.rooms || []).some((r) => r.id === w.parent))).forEach((r) => {
  const fi = FI[r.floor]; if (fi == null) return;
  const f = FLOORS[fi], bb = bboxOf(r.poly);
  if (PLATES) {
    const plate = new THREE.Mesh(flatGeo(r.poly, f.y + 0.06), plateMat(r.kind)); plate.renderOrder = 2; roomG[fi].add(plate); plates[fi].push(plate);
    const pts = r.poly.map(([x, y]) => V(x, y, f.y + 0.08)); pts.push(pts[0].clone());
    const edge = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), edgeMat); roomG[fi].add(edge); plates[fi].push(edge);
  }
  const pg = new THREE.ExtrudeGeometry(polyShape(r.poly), { depth: r.sub ? 2.5 : 2.4, bevelEnabled: false }); pg.rotateX(-Math.PI / 2); pg.translate(0, f.y, 0);
  const pick = new THREE.Mesh(pg, pickMat); roomG[fi].add(pick);
  const c = V((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2, f.y);
  const rank = r.sub ? 1 : KIND(r.kind).rank;
  const it = { kind: 'room', d: r, floor: fi, poly: r.poly, cx: c.x, cz: c.z, w: bb.x1 - bb.x0, dd: bb.y1 - bb.y0, y: f.y, rank, pick };
  if (r.node && !ROOM_BY_NODE.has(r.node)) ROOM_BY_NODE.set(r.node, it);   // 同一个节点的几间房：第一间代表它
  pick.userData.item = it;   // PLACE-1b：共用节点的几间房都还能点，只是共用一枚标注（LBL_SEEN，同名再由 updateLabelSet 的 A11 合并；用户 2026-10-02 截图：医疗与改造室 ×2）
  const lk = `${f.id}|${r.node || r.name}`; it.label = LBL_SEEN.has(lk) ? null : (LBL_SEEN.add(lk), mkLabel(roomG[fi], c.x, f.y + 1.2, c.z, 'room'));
  it.pri = (4 - rank) * 10000 + (r.area || 0); ITEMS.push(it);
});
const zoneG = new THREE.Group(); zoneG.name = 'zones'; scene.add(zoneG);
ZDATA.zones.forEach((z) => {
  const it = { kind: 'area', d: z, floor: null, cx: z.x, cz: -z.y, w: 2 * z.r, dd: 2 * z.r, y: z.z, round: true, rank: z.pri >= 8 ? 1 : z.pri >= 5 ? 2 : 3 };
  const hgt = Math.max(4, z.h + 2);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(z.r, z.r, hgt, 24), pickMat); m.position.set(z.x, z.z + hgt / 2 - 1, -z.y); m.userData.item = it; zoneG.add(m); it.pick = m;
  it.label = mkLabel(zoneG, z.x, z.z + z.h, -z.y, 'area'); it.pri = z.pri * 1000 + z.r;
  ITEMS.push(it);
});
// 室外载具（data.extras.vehicles，程序生成的悬浮车：无轮、离地悬停 + 柔光），可点；卡文字来自 data.extras.vehicle_card
const VEH = (EXTRAS.vehicles || []).filter((v) => v && v.kind === 'hover' && Number.isFinite(v.x) && Number.isFinite(v.y));
const VCARD = EXTRAS.vehicle_card || {};
const vText = (k) => (LANG === 'en' && VCARD.i18n?.en?.[k]) || VCARD[k];
const carG = new THREE.Group(); carG.name = 'vehicles'; scene.add(carG);
if (VEH.length) {
  const body = new THREE.MeshLambertMaterial({ color: '#2b2f36' }), glass = new THREE.MeshLambertMaterial({ color: '#8fa6b4' }), trim = new THREE.MeshLambertMaterial({ color: '#c9a45c' });
  const glow = new THREE.MeshBasicMaterial({ color: '#9fe6ff', transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
  const bodyG = new THREE.CapsuleGeometry(0.72, 3.9, 4, 12).rotateZ(Math.PI / 2).scale(1, 0.62, 1.25);
  const cabG = new THREE.CapsuleGeometry(0.55, 1.7, 4, 12).rotateZ(Math.PI / 2).scale(1, 0.7, 1.15);
  const glowG = new THREE.CircleGeometry(1, 32).scale(2.9, 1.2, 1).rotateX(-Math.PI / 2);
  VEH.forEach((v) => {
    const gz = F1Y, g = new THREE.Group(); g.position.copy(V(v.x, v.y, gz)); g.rotation.y = ((v.deg || 0) * Math.PI) / 180 - Math.PI / 2;
    const b = new THREE.Mesh(bodyG, body); b.position.y = 1.05; const c = new THREE.Mesh(cabG, glass); c.position.set(-0.3, 1.5, 0);
    const t = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.05, 0.05), trim); t.position.set(0, 1.0, 0.92); const t2 = t.clone(); t2.position.z = -0.92;
    const gl = new THREE.Mesh(glowG, glow); gl.position.y = 0.06; gl.renderOrder = 3;
    g.add(b, c, t, t2, gl); carG.add(g);
    const it = { kind: 'car', d: { name: VCARD.name || '', en: VCARD.i18n?.en?.name || '', id: v.id }, floor: null, cx: g.position.x, cz: g.position.z, w: 6, dd: 6, y: gz };
    const pk = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 2.6), pickMat); pk.position.y = 1.2; pk.userData.item = it; g.add(pk); it.pick = pk;
    it.label = mkLabel(g, 0, 3, 0, 'area'); it.pri = 100; it.rank = 3; ITEMS.push(it);
  });
}
function mkLabel(parent, x, y, z, cls) {
  const el = document.createElement('div'); el.className = 'lbl ' + cls; el.appendChild(document.createElement('span'));
  const o = new CSS2DObject(el); o.position.set(x, y, z); o.center.set(0.5, 0.5); o.visible = false; parent.add(o); return o;
}
/* ---------------- 三维藏物：地上的发光拾取物（Part 5-1 的三维一半，Part 8-1） ---------------- */
// 数据 = 设定包的世界藏物表（core/stash.mjs），查看器经 estate:stash 推来；落在哪个房间 / 区域由 core/stash3d.mjs 按名字对账。
// 拿到手的（estate:taken 的 id 集合）不再发光；点一下 = 拾起（发 estate:loot 给查看器，宿主写背包 + 按设置注入一句）。
// 三维这一半不自己实现藏物规则：与二维发光点（app/stash-markers.mjs）共用 core/stash.mjs 的口径，连呼吸周期都一样。
const propG = new THREE.Group(); propG.name = 'stash'; scene.add(propG);
const PROP_PLACES = ITEMS.map((it) => ({
  id: it.d.id, name: it.d.name,
  alias: [...(it.d.alias || []), ...(it.d.words || []), ...(it.d.synonyms || [])],
  floor: it.floor != null ? FLOORS[it.floor].id : null,
  x: it.cx, y: it.y, z: it.cz, r: it.kind === 'room' ? PROP_R : PROP_R * 2,
}));
const propMat = new THREE.MeshBasicMaterial({ color: '#e6c36a', transparent: true, opacity: 0.9, depthWrite: false });
const haloMat = new THREE.MeshBasicMaterial({ color: '#f6dfa6', transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
let stashRaw = null, propTaken = new Set(), props = [];
/** 这一层 / 这个模式下该不该亮：楼层视图看本层，外观只亮室外的（与 itemVisible 同一条口径） */
function propVisible(p) {
  const fi = p.floor != null ? FI[p.floor] : null;
  return isFloor(mode) ? fi === mode : fi == null;
}
function clearProps() {
  for (const g of props) { propG.remove(g); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  props = [];
}
/** 重画：藏物表来了 / 拿走一件 / 楼层变了都跑一遍（点数很少，整清整画最省心） */
function rebuildProps() {
  clearProps();
  if (!stashRaw) return 0;
  for (const p of stashSpots(stashRaw, { taken: propTaken, places: PROP_PLACES })) {
    const g = new THREE.Group(); g.position.set(p.x, p.y + 1.2, p.z);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(p.r * 0.42, 0), propMat);
    const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(p.r, 1), haloMat);
    const pk = new THREE.Mesh(new THREE.SphereGeometry(p.r * 1.5, 10, 8), pickMat); pk.userData.prop = p;
    g.add(core, halo, pk); propG.add(g);
    g.visible = propVisible(p); g.userData = { prop: p, pick: pk };
    props.push(g);
  }
  wake();
  return props.length;
}
/** 呼吸：一帧一次缩放 + 光晕明暗（与 core/stash.mjs 的 glow 同频；省流档 / 减少动态效果不呼吸，静态发光） */
function pulseProps(now) {
  if (LOW || REDUCED || !props.some((g) => g.visible)) return;   // 没有一枚在亮：不呼吸、不排帧
  const k = propGlow(now / 1000);
  haloMat.opacity = 0.18 + 0.26 * k;
  for (const g of props) g.scale.setScalar(0.86 + 0.28 * k);
  wake();
}
/** 射线先打发光道具：命中就拾起（道具比房间小，先判它才不会点一下变成选中房间） */
function pickProp(cx, cy) {
  const list = props.filter((g) => g.visible).map((g) => g.userData.pick);
  if (!list.length) return null;
  setRay(cx, cy);
  const hit = ray.intersectObjects(list, false)[0];
  return hit ? hit.object.userData.prop : null;
}
function takeProp(p) {
  propTaken.add(p.id);
  rebuildProps();
  post({ type: 'estate:loot', id: p.id, name: p.name, place: p.place || '', hidden: !!p.hidden, floor: p.floor ?? null });
}
function showPropTip(p, x, y) {
  if (tipFor !== p) { tip.innerHTML = `<div class="row"><em>${tx('pick')}</em>${esc(p.name)}${p.hidden ? `（${tx('hidden', { v: esc(p.hidden) })}）` : ''}</div>`; tipFor = p; }
  cardAt = [x, y]; placeCard(); tip.classList.add('on');
}

/* ---------------- NPC 头像：确定性时钟驱动的三维漫游（Part 8-2 的三维一半） ---------------- */
// 与二维查看器（app/wander.mjs）同一套零件：core/routine.mjs 的日程表 + core/walk.mjs 的 tickClock / createWalker，
// 只是坐标是三维的 [x, y, z]——插值引擎按分量算，二维三维走同一条公式。
// 时刻由「页面开着多久」推出来（不读系统时间、不问模型、不等宿主推 MVU 变动），换地方走一段过去，减少动态效果一步到位。
const PRES = createPresence({ THREE, CSS2DObject, scene, tx, wake, aria, onPerson: (name, dim) => post({ type: 'estate:person', name, dim }),
  roomOf: (node) => { const it = ROOM_BY_NODE.get(node); return it && { cx: it.cx, cz: it.cz, y: it.y, floor: it.d.floor, name: it.d.name }; },
  visibleOn: (floorId) => { const fi = FI[floorId]; return fi != null && mode === fi; } });
/** estate:people：聊天里位置落在这座楼里的人（查看器按和二维人物页同一条结果算好；只在列表变了才发）。日程里的同名者让位。 */
function setPeople(items) {
  const list = items.filter((p) => p && typeof p.name === 'string' && typeof p.room === 'string').slice(0, 30).map((p) => ({ name: p.name, room: p.room, floor: p.floor, color: p.color, avatar: p.avatar }));
  LOCATED = new Set(list.map((p) => p.name));
  for (const [n, e] of [...npcs]) if (LOCATED.has(n)) { try { e.o.element.remove(); } catch (err) {} npcG.remove(e.g); npcs.delete(n); }
  PRES.set(list); if (npcSched) npcRetarget(); wake();
}
const npcG = new THREE.Group(); npcG.name = 'npcs'; scene.add(npcG);
const npcWalker = createWalker({ reduced: REDUCED });
let npcSched = null, npcBase = normClock(null), npcT0 = 0, npcRounds = -1, npcClock = npcBase;
const npcs = new Map();   // 名字 → { el（CSS2D 头像）, floor }
let LOCATED = new Set();   // 聊天里位置落在这座楼的人（estate:people）：他们由头像组画，日程里的同名者不再画
/** 日程里的人的头像（presence.js：同一套按钮头像，虚线淡色 = 按日程站位） */
const npcChip = (name) => { const e = PRES.routineChip(name); npcG.add(e.g); return e; };
/** 一次时钟 tick：到了下一轮就按日程表重派站位 */
/** 时钟胶囊选的时段（U-FIX-4，宿主经 estate:period 推来；'' = 跟聊天时刻走）：三维与二维地图看同一档（PERIOD_MIN 与地标查看器共用一份） */
let periodOv = '';
const effClock = () => (periodOv ? { min: PERIOD_MIN[periodOv] } : npcClock);
function setPeriod(tod) { periodOv = PERIOD_MIN[tod] != null ? tod : ''; dayNight.setClock(effClock()); wake(); }
function npcTick() {
  if (!npcSched) return;
  if (!npcT0) npcT0 = performance.now();
  const r = tickClock(npcBase, { now: performance.now(), t0: npcT0 });
  if (r.rounds === npcRounds) return;
  npcRounds = r.rounds; npcClock = r.clock;
  dayNight.setClock(effClock());   // Part 9-1：确定性时钟驱动昼夜；时钟胶囊选了时段（U-FIX-4）就用那一档
  npcRetarget();
}
/** 日程表 → 站位：认不出落点的人（地点不在本页的房间 / 区域表里）不动，第一次出现直接落位 */
function npcRetarget() {
  const now = performance.now(); let started = false;
  for (const { name, place } of placesAt(npcSched, npcClock, [])) {
    const p = placeOf(PROP_PLACES, place); if (!p || LOCATED.has(name)) continue;
    let e = npcs.get(name); if (!e) { e = npcChip(name); npcs.set(name, e); }
    e.floor = p.floor;
    if (npcWalker.to(name, [p.x, p.y + 1.9, p.z], now)) started = true;
    else if (!npcWalker.has(name)) npcWalker.snap(name, [p.x, p.y + 1.9, p.z]);
  }
  if (started || npcWalker.moving()) wake();
}
/** 渲染循环里的一步：插值落位 + 跟着当前楼层显隐（楼层视图看本层、外观看室外） */
function npcStep(now) {
  if (!npcs.size) return;
  npcWalker.step(now);
  for (const [name, e] of npcs) {
    const p = npcWalker.at(name, now); if (!p || p.length < 3) continue;
    e.g.position.set(p[0], p[1], p[2]);
    const fi = e.floor != null ? FI[e.floor] : null;
    e.g.visible = isFloor(mode) ? fi === mode : fi == null;
  }
  if (npcWalker.moving()) wake();
}
/** 日程表 / 起点时钟（查看器推来；没推就不画人） */
function setNpcRoutine(schedule, clock) {
  npcSched = schedule ? normSchedule(schedule) : null;
  if (!npcSched?.byName || !Object.keys(npcSched.byName).length) npcSched = null;
  if (!npcSched) { clearNpcs(); wake(); return; }
  npcBase = normClock(clock); npcT0 = 0; npcRounds = -1; npcClock = npcBase;
  npcTick();
}
function clearNpcs() { for (const e of npcs.values()) { try { e.o.element.remove(); } catch (err) {} npcG.remove(e.g); } npcs.clear(); npcWalker.clear(); }

const enName = (d) => d.en || '';
const nameOf = (it) => {
  const d = it.d;
  if (it.kind === 'area' || it.kind === 'car') return LANG === 'en' ? d.en || d.name : d.name;
  const nm = d.name + (d.no ? ` ${d.no}` : '');
  return LANG === 'en' && enName(d) ? enName(d) : nm;
};
function relabel() {
  for (const it of ITEMS) { if (!it.label) continue; it.label.element.firstChild.textContent = nameOf(it); it.lw = 0; }
}

/* ---------------- 楼层条 ---------------- */
const floorsEl = $('#floors'); const BTN = {};
function buildNav() {
  floorsEl.innerHTML = ''; for (const k of Object.keys(BTN)) delete BTN[k];
  C3.setViews([{ id: 'ext', label: tx('ext') }, { id: 'sect', label: tx('sect') }]);
  for (let i = 0; i < FLOORS.length && !SHELL; i++) { const b = document.createElement('button'); b.type = 'button'; b.textContent = FLOORS[i].id; b.title = floorLabel(i);
    b.onclick = () => setMode(i, { fly: true, user: true }); floorsEl.appendChild(b); BTN[i] = b; }
  C3.setText({ expand: tx('expand'), collapse: tx('collapse'), region: tx('region') });
  C3.sheet.label('room', tx('rooms'), tx('roomsShort')); C3.sheet.label('about', tx('about'), tx('aboutShort'));
  roomEl.querySelector('#cardEmpty').textContent = tx('empty');
  const bd = BLD(); aboutEl.replaceChildren(...[['h2', bd.title], ['div', bd.subtitle, 'motto'], ['p', bd.summary], ['p', tx('hint')]].filter(([, t]) => t).map(([tag, t, c]) => { const e = document.createElement(tag); e.textContent = t; if (c) e.className = c; return e; }));
  C3.setTitle(bd.title);
  syncNav();
  if (!SHELL) { $('#lblBtn').title = tx('labels'); $('#lblBtn').setAttribute('aria-label', tx('labels'));
    for (const k of ['zin', 'zout', 'zreset']) { $('#' + k).title = tx(k); $('#' + k).setAttribute('aria-label', tx(k)); } }
  document.documentElement.lang = LANG === 'en' ? 'en' : 'zh-CN'; aria();
}
function syncNav() { for (const [k, b] of Object.entries(BTN)) { const on = String(mode) === k; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
  C3.setView(isFloor(mode) ? 'sect' : mode); C3.showSub(isFloor(mode)); if (isFloor(mode)) lastFloor = mode; }

/* ---------------- 模式：ext 外观 / 0..4 楼层视图（B2…F3） ---------------- */
let mode = 'ext';
const isFloor = (m) => typeof m === 'number';
const SITE_BOX = new THREE.Box3().setFromObject(siteG), SITE_C = SITE_BOX.getCenter(new THREE.Vector3()), SITE_S = SITE_BOX.getSize(new THREE.Vector3());
function viewFor(m) {
  const P_ = PORTRAIT();
  if (m === 'ext') {   // 外观取景：清单的 view.ext（layout 米：target、size = 宽 × 深 × 高），没有就按模型包围盒
    const e = MAN.view?.ext, th = AZ, ph = P_ ? 0.9 : 0.98, sz = e?.size || [SITE_S.x, SITE_S.z, SITE_S.y];
    const [w, h] = projExtent(sz[0], sz[1], sz[2], th, ph);
    return { target: e?.target ? V(...e.target) : SITE_C.clone(), zoom: P_ ? fitZoom(w * 0.62, 1) : fitZoom(w * 0.9, h * 0.95), theta: th, phi: ph };
  }
  const y = FLOORS[m].y, under = FLOORS[m].z < 0;   // 地下层：只取这一层的外包（加 8 m 边），地上层：整幢楼的外包（加 4 m 边）
  const fb = under ? polyBox((CARD.rooms || []).filter((r) => r.floor === FLOORS[m].id)) : HOUSE_BOX, c = V((fb.x0 + fb.x1) / 2, (fb.y0 + fb.y1) / 2, 0);
  const w0 = fb.x1 - fb.x0 + (under ? 8 : 4), d0 = fb.y1 - fb.y0 + (under ? 8 : 4), cx = c.x, cz = c.z;
  const th = AZ * 0.6, ph = 0.72; const [w, h] = projExtent(w0, d0, 5, th, ph);
  return { target: new THREE.Vector3(cx, y, cz), zoom: P_ ? fitZoom(w * 0.92, 1) : fitZoom(w * 1.08, h * 1.15), theta: th, phi: ph };
}
function applyMode() {
  const m = mode, fl = isFloor(m);
  const under = fl && FLOORS[m].z < 0;
  for (const s of SITE_MESHES) s.visible = !under;
  for (const s of SITE_EXTRA) if (s.name === 'ground_walls') s.visible = !under;
  for (const s of HOUSE_SHELL) s.visible = !under;   // 主楼外壳：外观原样；楼层视图切在楼面以上 1.5 m（地下层不显示）
  shellClip.constant = fl && !under ? FLOORS[m].y + CUT : 1e5;
  houseClip.constant = fl ? FLOORS[m].y + CUT : 1e5;
  for (const u of CUT_TARGETS) u.uCut.value = fl && !under ? 1 : 0;   // 墙真的被剖开时才涂截面色：外观视图里背面就是正常烘焙面
  PRES.refresh();
  roomG.forEach((g, i) => { g.visible = fl && i === m; });
  plates.forEach((ps, i) => ps.forEach((p) => { p.visible = fl && i === m; }));
  houseFloors.forEach((ms, i) => ms.forEach((o) => { o.visible = fl && i === m; }));
  zoneG.visible = m === 'ext'; carG.visible = m === 'ext'; if (houseFailEl) { houseFailEl.hidden = !(fl && houseState === -1); if (!houseFailEl.hidden) houseFailEl.querySelector('span').textContent = tx('houseFail'); }   // 楼层模型没取到：在楼层视图的位置给一行说明（带重试）
  for (const g of props) g.visible = propVisible(g.userData.prop);   // 藏物跟着模式走（楼层视图看本层、外观只亮室外）
  wake();
}
/** 画布是一张有名字的图：<建筑>，<楼层 / 视图>，<n> 人（U-25：iframe 不进 Tab 序，键盘走查看器） */
function aria() { const c = renderer.domElement; c.setAttribute('role', 'img'); c.setAttribute('aria-label', tx('canvas', { b: BLD().title, f: isFloor(mode) ? floorName(mode) : tx(mode), n: PRES.count() })); }
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
  else if (SHELL && !o.quiet) post(isFloor(mode) ? { type: 'estate:floor', floor: FLOORS[mode].id } : { type: 'estate:view', mode });   // the viewer's strip and segment follow the page
  aria();
}
const modeKey = (m) => (isFloor(m) ? FLOORS[m].id : m);
function itemVisible(it) {
  if (it.kind === 'area' || it.kind === 'car') return mode === 'ext';
  return mode === it.floor;
}
function parseFloor(f) {
  if (f == null) return null; const s = String(f).trim().toLowerCase();
  if (['ext', 'exterior', '外观', 'out'].includes(s)) return 'ext';
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
  for (const it of ITEMS) { if (!it.label) continue; const on = itemVisible(it); it.label.visible = on; it.label.element.classList.remove('occl'); if (on) labelSet.push(it); }
  const seen = new Set(); for (const it of labelSet.slice().sort((a, b) => b.pri - a.pri)) { const n = nameOf(it); if (seen.has(n)) { it.label.visible = false; it.label.element.classList.add('hide'); } else seen.add(n); }   // A11 (D42) + PLACE-1b (P3): 同名只留一枚标注（优先级最高的那间），其余仍然点得到；没有标注的项（LBL_SEEN 去重过的）跳过
  labelSet = labelSet.filter(it => it.label.visible); guard.dirty(); wake();
}
const guard = createLabelGuard({ THREE, camera, floors: FLOORS.map((f) => { const b = polyBox((CARD.rooms || []).filter((r) => r.floor === f.id)); return { y: f.y, z: f.z, box: { x0: b.x0, x1: b.x1, z0: -b.y1, z1: -b.y0 } }; }), building: { x0: HOUSE_BOX.x0, x1: HOUSE_BOX.x1, z0: -HOUSE_BOX.y1, z1: -HOUSE_BOX.y0 }, mode: () => mode,
  labels: () => labelSet.map((it) => ({ el: it.label.element, anchor: it.label, hot: it === pinned || it === hover })) });   // 一条射线对几个包围盒：不碰模型网格
const _v = new THREE.Vector3();
const topBarEl = C3.root.querySelector?.('.c3-top');
function cullLabels() {
  const W = innerWidth, H = innerHeight, placed = [];
  const topGuard = (topBarEl?.getBoundingClientRect().bottom || 0) + 4;   // 剖切等模式下二级条会加高顶栏：标签顶到顶栏下沿再留 4px，别被挡住（U11 修）
  const mpp = (camera.right - camera.left) / camera.zoom / Math.max(1, innerWidth);
  const list = labelSet.slice().sort((a, b) => (b === pinned) - (a === pinned) || (b === hover) - (a === hover) || b.pri - a.pri);
  for (const it of list) {
    const el = it.label.element, hot = it === pinned || it === hover;
    let ok = true;
    if (!hot) {
      if (it.kind === 'room') {
        if (it.rank === 3) ok = false;
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
        if (!it.lw && el.firstChild.offsetWidth > 0) { it.lw = el.firstChild.offsetWidth; it.lh = el.firstChild.offsetHeight || 18; } const lw = it.lw || el.textContent.length * 14 + 16, lh = it.lh || 22;   // UI-3D-1: a label hidden by the building measures 0: guess from its text, measure again next round, never cache the guess
        if (y - lh / 2 - 2 < topGuard) ok = false;   // 顶栏（含剖切楼层二级条）下沿以上不放标签，别被挡住/切字
        else {
          const r = [x - lw / 2 - 3, y - lh / 2 - 2, x + lw / 2 + 3, y + lh / 2 + 2];
          if (!hot) for (const p of placed) if (r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1]) { ok = false; break; }
          if (ok) placed.push(r);
        }
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
  if (!it) { h.visible = false; wake(); return; }
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
  h.visible = true; wake();
}

/* ---------------- 房间卡 ---------------- */
const card = $('#card');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shown = (t) => !!t && (LANG === 'zh' || !/[\u4e00-\u9fff]/.test(t));   // 数据里只有中文的说明，英文界面不显示
/** 一张卡的内容（独立页自己画；嵌入时发给查看器，由它画共用的地点卡）：{ title, sub, kind?, rows: [[label, text]], acts: [{ id, label, ... }] } */
function info(it) {
  const d = it.d, rows = [], acts = [], zh = LANG === 'zh';
  if (it.kind === 'car') {
    for (const r of (LANG === 'en' && VCARD.i18n?.en?.rows) || VCARD.rows || []) rows.push([r.label, r.text]);
    const a = (LANG === 'en' && VCARD.i18n?.en?.action) || VCARD.action; if (a?.label) acts.push({ id: 'zone', label: a.label, zone: VCARD.action?.zone });
    return { title: vText('name') || '', sub: vText('sub') || '', rows, acts };
  }
  if (it.kind === 'area') {
    if (d.alias?.length && zh) rows.push([tx('alias'), d.alias.filter((a) => /[\u4e00-\u9fff]/.test(a)).slice(0, 4).join('、')]);
    for (const c of childrenOf(it) || []) acts.push({ id: 'enter', label: tx('enter3d'), node: c.node, title: c.title });
    return { title: nameOf(it), sub: tx('estate') + (zh && d.en ? ' · ' + d.en : ''), rows: rows.filter((r) => r[1]), acts };
  }
  const k = KIND(d.kind), out = { title: nameOf(it), sub: floorName(it.floor) + (d.id ? ' · ' + d.id : ''), kind: { id: k.id, label: k.label, color: k.color }, rows, acts };
  if (d.sub) { const w = LANG === 'en' ? it.d.whereEn : d.where; if (w) rows.push([tx('where'), w]); }
  else if (Number.isFinite(d.area)) rows.push([tx('size'), `${Math.round(d.area)} ㎡`]);
  if (shown(d.note)) rows.push([tx('use'), d.note]);
  if (!d.sub && shown(d.access)) rows.push([tx('access'), d.access]);
  return out;
}
function cardHTML(it) {
  const o = info(it), d = it.d, custom = it.kind === 'room' ? getCustomName(d.name) : '', h = document.createElement('div');
  const t = document.createElement('h3'); t.append(custom || o.title); h.append(t);
  const sub = document.createElement('div'); sub.className = 'sub'; sub.textContent = o.sub; h.append(sub);
  if (custom && LANG === 'zh') rows(h, [[tx('orig'), o.title]]);
  rows(h, o.rows);
  if (o.acts.length) { const a = document.createElement('div'); a.className = 'acts'; for (const x of o.acts) { const b = document.createElement('button'); b.type = 'button'; b.className = x.id === 'enter' ? 'enter3d' : 'garage'; if (x.node) b.dataset.node = x.node; if (x.zone) b.dataset.zone = x.zone; if (x.title) b.title = x.title; b.textContent = x.label; a.append(b); } h.append(a); }
  return h.innerHTML;   // PLACE-1b：房间卡里那套只存本机的「自定义名称 / 简介」输入框去掉了，改由查看器那一个编辑器（名称与说明都进聊天变量与世界书）
}
function rows(h, list) { for (const [k, v] of list) { const r = document.createElement('div'); r.className = 'row'; const e = document.createElement('em'); e.textContent = k; r.append(e, v); h.append(r); } }
// 区域下挂着的子地图（宿主按运行时节点树发来的 estate:children）：有子节点的区域，卡片带「进入三维」、双击直接进
let CHILDREN = {};
const childrenOf = (it) => { const c = it?.kind === 'area' ? CHILDREN[it.d.id] : null; return c?.length ? c : null; };
let cardFor = null, cardAt = null;
const tip = $('#tip');
let tipFor = null;
function showCard(it, x, y) {
  if (x != null && it !== pinned) { if (tipFor !== it) { tip.textContent = info(it).title; tipFor = it; } cardAt = [x, y]; placeCard(); tip.classList.add('on'); return; }   // 悬停：只有名字的一枚小标签
  tip.classList.remove('on'); tipFor = null;
  if (SHELL) return;   // 壳模式：卡片是查看器的共用地点卡（estate:select）
  if (cardFor !== it) { card.innerHTML = cardHTML(it); cardFor = it; }
  cardAt = null; card.classList.add('on', 'pinned');
  if (it === pinned && C3.sheet.tab !== 'room' || !C3.sheet.open) C3.sheet.setTab('room', C3.sheet.state === 'full' ? 'full' : 'half');   // 点选 → 抽屉半开到「房间」
}
card.addEventListener('click', (e) => { const b = e.target.closest('.enter3d'); if (!b) return; e.stopPropagation(); post({ type: 'estate:go', node: b.dataset.node }); });
card.addEventListener('click', (e) => { const b = e.target.closest('.garage'); if (!b) return; e.stopPropagation(); const g = ITEMS.find((it) => it.kind === 'area' && it.d.id === b.dataset.zone); if (g) focusItem(g); });
card.dataset.lang = LANG;
bindRoomCustomEvents(card, { base: url('../'), pictures: (name) => PICS[name] || [], onOpenGallery: { refresh: () => { if (cardFor) { const it = cardFor; cardFor = null; showCard(it); } } } });
function placeCard() {
  if (!tipFor || !cardAt) return; let x, y;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  if (cardAt) [x, y] = cardAt; else { x = innerWidth - w - 16; y = 16; }
  if (x + w + 12 > innerWidth) x = Math.max(8, x - w - 44); if (y + h + 12 > innerHeight) y = innerHeight - h - 12; if (y < 8) y = 8;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
function hideCard(force) { tip.classList.remove('on'); tipFor = null; if (pinned && !force) return; card.classList.remove('on', 'pinned'); card.innerHTML = ''; cardFor = null; if (C3.sheet.tab === 'room' && C3.sheet.open) C3.sheet.set('peek'); }

/* ---------------- 拾取 / 悬停 / 点选 ---------------- */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
/** 屏幕坐标 → 射线（pickAt / pickProp 共用一条） */
function setRay(cx, cy) {
  const rc = renderer.domElement.getBoundingClientRect();
  ndc.set(((cx - rc.left) / rc.width) * 2 - 1, -((cy - rc.top) / rc.height) * 2 + 1); ray.setFromCamera(ndc, camera);
}
function pickAt(cx, cy) {
  setRay(cx, cy);
  const list = []; for (const it of ITEMS) if (itemVisible(it)) list.push(it.pick);
  const hits = ray.intersectObjects(list, false);
  if (!hits.length) return null;
  if (mode === 'ext') hits.sort((a, b) => (a.object.userData.item.d.r ?? 0) - (b.object.userData.item.d.r ?? 0));   // 区域：最具体（最小）的优先
  const sub = hits.find((h) => h.object.userData.item.d.sub);   // 套间里的子区域（衣帽间）压过外层房间
  if (sub && hits[0].object.userData.item.d.id === sub.object.userData.item.d.parent) return sub.object.userData.item;
  return hits[0].object.userData.item;
}
let pinned = null, hover = null, pinT = 0;
function pin(it, fly) { pinned = it; pinT = performance.now(); showHi(hiPin, it); showHi(hiHover, null); cardFor = null; showCard(it); wake(); if (fly) focusView(it); }
function unpin(quiet) { const had = pinned; pinned = null; showHi(hiPin, null); hideCard(true); wake(); if (SHELL && had && !quiet) post({ type: 'estate:select', name: null }); }   // quiet = the viewer asked for it (it closed its card itself)
const sph = new THREE.Spherical();
function focusView(it) {
  sph.setFromVector3(camera.position.clone().sub(controls.target));
  const [pw, ph] = projExtent(it.w, it.dd, 3, sph.theta, sph.phi);
  const pad = it.kind === 'room' ? 1.4 : 1.25;
  flyTo({ target: new THREE.Vector3(it.cx, it.y, it.cz), zoom: Math.min(fitZoom(pw * pad + 8, ph * pad + 8), it.kind === 'room' && isFloor(mode) ? viewFor(mode).zoom * 2 : Infinity), theta: null, phi: null });   // U-FIX-5 E1-01: a room keeps its floor around it (at most 2x the floor's framing)
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
  const base = d.name.replace(/[（(][^）)]*[）)]/g, '').replace(/\s*[×x]\s*\d+\s*$/, '').trim();   // 同 core/compat-v1-geo.mjs planWords：去括注 / 「 ×2」，「 / 」两侧各算一个叫法
  return [d.name, d.id, d.card_id, base, ...(base.split(/\s*[\/／]\s*/).filter((w) => [...w].length >= 2)), ...(d.alias || []), ...(d.words || []), ...(d.synonyms || []), ...(ALIAS[d.name] || [])];
}
// 旧编号 / 仓库以前自编的旧名（聊天里存过的）→ 现在的卡编号
const OLD = { ...(CARD.card_id_alias || {}), ...(CARD.retired_names || {}) };
function findByName(name, floor) {
  if (OLD[name]) name = OLD[name];
  const s = norm(name); if (!s) return null;
  let best = null, score = -1;
  for (const it of ITEMS) {
    if (floor != null && it.floor !== floor) continue;
    const rank = it.kind === 'room' ? (it.d.sub ? 5 : KIND(it.d.kind).rank === 1 ? 4 : 2) : it.d.pri >= 8 ? 1 : 3;
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
  if (CAM.rm) dur = 1;
  sph.setFromVector3(camera.position.clone().sub(controls.target));
  const to = { target: v.target.clone(), zoom: clamp(v.zoom, minZoom, maxZoom), theta: v.theta ?? sph.theta, phi: v.phi ?? sph.phi };
  let dt = to.theta - sph.theta; dt = Math.atan2(Math.sin(dt), Math.cos(dt));
  tween = { t0: performance.now(), dur, from: { target: controls.target.clone(), zoom: camera.zoom, theta: sph.theta, phi: sph.phi }, to, dt, ease: v.ease };
  wake();
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
  keepTargetY(); touchInteract(); wake();
}
let targetY = 12;
function keepTargetY() {
  _dir.subVectors(controls.target, camera.position).normalize(); if (Math.abs(_dir.y) < 1e-3) return;
  const s = (targetY - controls.target.y) / _dir.y; controls.target.addScaledVector(_dir, s); camera.position.addScaledVector(_dir, s);
}
// 滚轮：Mac 触控板捏合发 ctrlKey 的 wheel 事件 = 缩放（到光标）；普通两指划动（无 ctrlKey）= 平移；⌥ + 两指划动 = 旋转
function panBy(dx, dy) {
  const rc = renderer.domElement.getBoundingClientRect();
  const k = (camera.right - camera.left) / camera.zoom / Math.max(1, rc.width);
  const right = new THREE.Vector3(camera.matrixWorld.elements[0], 0, camera.matrixWorld.elements[2]).normalize();
  const fwd = new THREE.Vector3(camera.matrixWorld.elements[8], 0, camera.matrixWorld.elements[10]).normalize();
  const off = right.multiplyScalar(-dx * k).add(fwd.multiplyScalar(dy * k));
  camera.position.add(off); controls.target.add(off); touchInteract(); wake(); idleTimer?.markActive();
}
function rotateBy(dx, dy) {
  sph.setFromVector3(camera.position.clone().sub(controls.target));
  sph.theta -= dx * 0.0025; sph.phi = clamp(sph.phi + dy * 0.0025, controls.minPolarAngle, controls.maxPolarAngle);
  placeCam(controls.target, sph.theta, sph.phi); touchInteract(); wake(); idleTimer?.markActive();
}
window.addEventListener('wheel', (e) => { e.preventDefault(); }, { passive: false });
app.addEventListener('wheel', (e) => {
  e.preventDefault(); e.stopPropagation(); tween = null; idleTimer?.markActive();
  const act = wheelAction(e, CAM.wheelZoom);   // U-13: the mapping table is in ui/camera-controls.js
  if (act === 'rotate') { rotateBy(e.deltaX, e.deltaY); return; }
  if (act === 'pan') { panBy(e.deltaX, e.deltaY); return; }
  let dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 300 : 1);
  dy = clamp(dy, -150, 150);
  zoomAt(e.clientX, e.clientY, Math.exp(-dy * 0.011));
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
    if (performance.now() - pinch.t < 260 && pinch.moved < 12) {
      const pr = pickProp(pinch.cx, pinch.cy); if (pr) takeProp(pr);   // 触屏同上：先判发光道具
      else { const it = pickAt(pinch.cx, pinch.cy); if (it) { focusItem(it); postSelect(it); } }
    }
    pinch = null;
  }
});
const zoomBtn = (f) => { const to = clamp(camera.zoom * f, minZoom, maxZoom); flyTo({ target: controls.target.clone(), zoom: to, theta: null, phi: null }, 260); };
const resetView = () => { unpin(); flyTo(viewFor(mode)); };
// 标注开关（房间 / 区域名字签）：默认开，按查看者记在本机；L 键切换；关掉后点选 / 悬停卡照常
let labelsOn = LS('edenEstateLabels') !== '0';
function setLabels(on) {
  labelsOn = on; document.body.classList.toggle('nolabels', !on);
  const b = $('#lblBtn'); if (b) { b.setAttribute('aria-pressed', String(on)); b.title = tx('labels'); }
  try { localStorage.setItem('edenEstateLabels', on ? '1' : '0'); } catch (e) { }
  wake();
}
if (!SHELL) $('#lblBtn').onclick = () => setLabels(!labelsOn);
setLabels(labelsOn);
if (!SHELL) { $('#zin').onclick = () => zoomBtn(1.6); $('#zout').onclick = () => zoomBtn(1 / 1.6); $('#zreset').onclick = resetView; }

/* ---------------- 指针 ---------------- */
let down = null, lastTap = null, tapTimer = 0;
/** 点选 / 双击：告诉查看器选中了什么（它开共用的地点卡）：房间带 node 与 room，区域和载具带 zone（卡的标题、副标题、行与动作） */
function postSelect(it) {
  const fl = it.floor != null ? FLOORS[it.floor].id : null, m = { type: 'estate:select', name: it.d.name, floor: fl };
  if (it.kind === 'room') Object.assign(m, { node: it.d.node, room: { name: it.d.name, floor: fl, kind: it.d.kind, area: it.d.area, note: it.d.note || '', access: it.d.access || '' } });
  else { const o = info(it); m.name = o.title; m.zone = { title: o.title, sub: o.sub, rows: o.rows, acts: o.acts }; }
  post(m);
}
const cancelTap = () => { if (tapTimer) { clearTimeout(tapTimer); tapTimer = 0; } };
function tapPin(it) { if (it) { pin(it, false); postSelect(it); } else if (pinned) unpin(); }
// 拖动旋转前先把按下的那一点定为新轨道中心（挪 target 时相机同步挪同一位移，画面不跳）；命中不到（点在天空 / 空处）就不改
function retargetAt(cx, cy) {
  const it = pickAt(cx, cy);
  let p = null;
  if (it) p = new THREE.Vector3(it.cx, it.y, it.cz);
  else { const rc = renderer.domElement.getBoundingClientRect(); ndc.set(((cx - rc.left) / rc.width) * 2 - 1, -((cy - rc.top) / rc.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(SITE_MESHES, false)[0]; if (hit) p = hit.point; }
  if (!p) return;
  _dir.subVectors(p, controls.target); controls.target.copy(p); camera.position.add(_dir); wake();
}
renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType }; tween = null; idleTimer?.markActive();
  if (e.pointerType === 'mouse' && e.button === 0) retargetAt(e.clientX, e.clientY); });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; const type = down.type; down = null;
  if (moved > 7 || dt > 450 || pinch) return;
  const pr = pickProp(e.clientX, e.clientY); if (pr) { takeProp(pr); return; }   // 先判发光道具：点它就是拾起，不是选中房间
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
renderer.domElement.addEventListener('dblclick', (e) => {
  const pr = pickProp(e.clientX, e.clientY); if (pr) { takeProp(pr); return; }
  dbl(pickAt(e.clientX, e.clientY));
});
function dbl(it) { const c = childrenOf(it); if (c) { post({ type: 'estate:go', node: c[0].node }); return; } if (it) { focusItem(it); postSelect(it); } else resetView(); }
let hoverEv = null, hoverRaf = 0;
function doHover() {
  hoverRaf = 0; const e = hoverEv; if (!e) return;
  const pr = pickProp(e.clientX, e.clientY);
  if (pr) { if (hover) { hover = null; showHi(hiHover, null); wake(); } renderer.domElement.classList.add('pick'); showPropTip(pr, e.clientX + 16, e.clientY + 14); return; }
  const it = pickAt(e.clientX, e.clientY);
  if (it !== hover) { hover = it; showHi(hiHover, it && it !== pinned ? it : null); wake(); }
  if (it) showCard(it, e.clientX + 16, e.clientY + 14); else hideCard();
  renderer.domElement.classList.toggle('pick', !!it);
}
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || e.buttons) return;
  hoverEv = { clientX: e.clientX, clientY: e.clientY }; if (!hoverRaf) hoverRaf = requestAnimationFrame(doHover);
});
renderer.domElement.addEventListener('pointerleave', () => { hoverEv = null; hover = null; showHi(hiHover, null); hideCard(); wake(); });
controls.addEventListener('start', () => { tween = null; dragging = true; ctlLive = true; setLowRes(true); C3.dragStart(); wake(); });
controls.addEventListener('end', () => { dragging = false; C3.dragEnd(); wake(); });
C3.onInsets(() => { frustum(); wake(); });
controls.addEventListener('change', () => { wake(); touchInteract(); });
let lastInteract = 0;
function touchInteract() { lastInteract = performance.now(); }
function setLowRes(on) {
  touchInteract();
  if (on === lowRes) return; lowRes = on;
  renderer.setPixelRatio(on ? Math.max(1, DPR * 0.75) : DPR); renderer.setSize(innerWidth, innerHeight); wake();
}

/* ---------------- 键盘 / 消息 ---------------- */
const SEQ = [...FLOORS.map((f, i) => i), 'ext'];
window.addEventListener('keydown', (e) => {
  if (SHELL && !e.isComposing) { if (e.key === 'Escape') { post({ type: 'estate:esc' }); return; } if (['1', '2'].includes(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) { post({ type: 'estate:key', key: e.key }); return; } }   // the viewer owns Esc and the view keys
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (['+', '=', '-', '_', '0'].includes(e.key)) { e.preventDefault(); if (e.key === '0') resetView(); else zoomBtn(e.key === '+' || e.key === '=' ? 1.6 : 1 / 1.6); return; }
  if ((e.key === 'l' || e.key === 'L') && !e.target.closest?.('input,textarea')) { setLabels(!labelsOn); return; }
  if (e.target?.closest?.('input,textarea')) return;
  const PAN = { w: [0, -40], s: [0, 40], a: [-40, 0], d: [40, 0], ArrowUp: [0, -40], ArrowDown: [0, 40], ArrowLeft: [-40, 0], ArrowRight: [40, 0] };
  if (PAN[e.key]) { e.preventDefault(); panBy(...PAN[e.key]); return; }
  if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); rotateBy(-70, 0); return; }
  if (e.key === 'e' || e.key === 'E') { e.preventDefault(); rotateBy(70, 0); return; }
  if (e.key === 'r' || e.key === 'R') { e.preventDefault(); rotateBy(0, -70); return; }
  if (e.key === 'f' || e.key === 'F') { e.preventDefault(); rotateBy(0, 70); return; }
  if (!['PageUp', 'PageDown', '[', ']'].includes(e.key)) return; e.preventDefault();
  if (IN_FRAME) { post({ type: 'estate:key', key: e.key }); return; }
  const up = e.key === 'PageUp' || e.key === ']'; let i = SEQ.indexOf(mode); i = Math.max(0, Math.min(SEQ.length - 1, i + (up ? 1 : -1))); setMode(SEQ[i], { fly: true });
});
// 卡设定房间（查看器的「自定义 → 在地图上看」会带 card: { name, floor, poly }）：直接取精确多边形那一间
function focusRoomMsg(name, c) {
  let it = c && c.name === name ? findCard(c) : null;
  if (!it) it = findByName(name) || ITEMS.find((x) => x.kind === 'area' && x.d.id === name);   // 区域也可以按 id 指（宿主的 data-focus / 子地图的锚点是区域 id）
  if (it) focusItem(it); else unpin();
}
function post(msg) { if (IN_FRAME) try { window.parent.postMessage(msg, '*'); } catch (e) { } }
window.addEventListener('message', (e) => {
  if (IN_FRAME && e.source !== window.parent) return;
  const d = e.data; if (!d || typeof d !== 'object' || typeof d.type !== 'string' || !d.type.startsWith('estate:')) return;
  if (d.type === 'estate:room') focusRoomMsg(d.name, d.card);
  else if (d.type === 'estate:children' && d.zones && typeof d.zones === 'object') { CHILDREN = d.zones; cardFor = null; tipFor = null; if (pinned) showCard(pinned); }
  else if (d.type === 'estate:floor') { const m = parseFloor(d.floor); if (m != null) setMode(m, { fly: true, quiet: true }); }
  else if (d.type === 'estate:view' && ['ext', 'sect'].includes(d.mode)) setMode(d.mode === 'sect' ? (isFloor(mode) ? mode : lastFloor) : d.mode, { fly: true, quiet: true });   // S7-3: the viewer's segment / keys 1 2 (D38: exterior + floors, x-ray removed)
  else if (d.type === 'estate:period' && typeof d.tod === 'string') setPeriod(d.tod);   // U-FIX-4：时钟胶囊选的时段（'' = 跟聊天时刻）
  else if (d.type === 'estate:cam') { if (d.op === 'in') zoomBtn(1.6); else if (d.op === 'out') zoomBtn(1 / 1.6); else if (d.op === 'reset') resetView(); }   // the viewer's toolbar
  else if (d.type === 'estate:labels' && typeof d.on === 'boolean') setLabels(d.on);
  else if (d.type === 'estate:select') { const it = typeof d.node === 'string' ? ITEMS.find((x) => x.kind === 'room' && x.d.node === d.node) : null; if (it) { focusItem(it); postSelect(it); } else if (pinned) unpin(true); }   // a room from the viewer's list (by node id), or the viewer closed its card
  else if (d.type === 'estate:people' && Array.isArray(d.items)) setPeople(d.items);
  else if (d.type === 'estate:inset') { if (Number.isFinite(d.left)) document.documentElement.style.setProperty('--inset', Math.max(6, d.left) + 'px'); if (SHELL) C3.setInsets({ right: Math.max(0, d.right | 0), bottom: Math.max(0, d.bottom | 0) }); frustum(); wake(); }
  else if (d.type === 'estate:camera') { if (typeof d.autoRotate === 'boolean') CAM.autoRotate = d.autoRotate; if (typeof d.wheelZoom === 'boolean') CAM.wheelZoom = d.wheelZoom; if (typeof d.rm === 'boolean') { CAM.rm = d.rm || REDUCED; controls.enableDamping = !CAM.rm; } applyRotate(); }   // I-06: settings and reduced motion without a reload
  else if (d.type === 'estate:pause') { paused = true; }   // 查看器休眠：停渲染循环，模型与 GPU 资源留着
  else if (d.type === 'estate:dispose') { disposeGpu(); post({ type: 'estate:disposed' }); }   // S7-2 I-05: the viewer is about to remove this parked frame: release the GL context now and say so
  else if (d.type === 'estate:resume' && paused && !disposed) { paused = false; resumeT = performance.now(); wake(); }
  else if (d.type === 'estate:lang' && (d.lang === 'en' || d.lang === 'zh')) setLang(d.lang);
  else if (d.type === 'estate:quality' && typeof d.q === 'string') {   // 设置「三维画质」即时生效
    DPR = Math.min(window.devicePixelRatio || 1, d.q === '1' ? 1 : COARSE ? 2 : (window.devicePixelRatio || 2)); document.documentElement.classList.toggle('noblur', d.q === '1');
    renderer.setPixelRatio(lowRes ? Math.max(1, DPR * 0.75) : DPR); renderer.setSize(innerWidth, innerHeight); wake(); }
  else if (d.type === 'estate:theme' && (d.theme === 'light' || d.theme === 'dark')) { THEME = d.theme; document.documentElement.dataset.theme = THEME; document.documentElement.classList.toggle('light', THEME === 'light'); paintBackdrop(); }
  else if (d.type === 'estate:cvd' && typeof d.mode === 'string') { document.documentElement.dataset.cvd = d.mode; document.documentElement.classList.toggle('cvd', d.mode !== '0'); }   // 色觉模式（E7）：本页当前没有按类别上色的材质，只留 CSS 钩子给以后加
  else if (d.type === 'estate:fps' && typeof d.on === 'boolean') { STATS = d.on; statsEl.classList.toggle('on', d.on); if (!d.on) statsEl.textContent = ''; frames = 0; fpsT = performance.now(); wake(); }
  else if (d.type === 'estate:chat' && typeof d.id === 'string') setGalleryChatId(d.id);   // 房间图集「仅本聊天」作用域
  else if (d.type === 'estate:media' && d.rooms && typeof d.rooms === 'object') {   // K-R101：包图片按房间名；https 的只在宿主说开关开着时才给地址
    PICS = Object.fromEntries(Object.entries(d.rooms).map(([name, p]) => [name, Array.isArray(p) ? p.filter((x) => x && typeof x.id === 'string').map((x) => ({ id: x.id, item: x.item, url: nodePictures({ [x.id]: x.item }, [x.id], { base: '', remoteOn: d.remote === true })[0]?.url ?? null })) : []]));
  }
  else if (d.type === 'estate:stash') { stashRaw = Array.isArray(d.items) && LS('edenMapOn:stash3d') === '1' ? { items: d.items } : null; rebuildProps(); }   // Part 8-1：世界藏物表（INV-2：三维藏物暂停，edenMapOn:stash3d = '1' 才收）
  else if (d.type === 'estate:taken') { propTaken = new Set(Array.isArray(d.ids) ? d.ids.filter((x) => typeof x === 'string') : []); rebuildProps(); }   // 已经在手里的：地上不再发光
  else if (d.type === 'estate:routine') setNpcRoutine(d.schedule, d.clock);   // Part 8-2：日程表 + 起点时钟 → 三维里的人自己去该去的地方
});
function setLang(l) { LANG = l; card.dataset.lang = LANG; buildNav(); relabel(); frustum(); const it = cardFor; cardFor = null; if (it) showCard(it, cardAt?.[0], cardAt?.[1]); wake(); }
addEventListener('resize', () => { frustum(); renderer.setSize(innerWidth, innerHeight); labelR.setSize(innerWidth, innerHeight); camera.zoom = clamp(camera.zoom, minZoom, maxZoom); camera.updateProjectionMatrix(); wake(); });

/* ---------------- 循环（按需渲染） ---------------- */
const statsEl = $('#stats'); if (STATS) statsEl.classList.add('on');
let frames = 0, fpsT = performance.now(), fps = 0, first = true, lastInfo = { calls: 0, triangles: 0 }, lastPulse = 0, lastPropPulse = 0;
let paused = false, resumeT = 0, disposed = false;
/** I-05: stop the loop and release the renderer and its GL context (pagehide does not fire on a parked frame, so the viewer asks with estate:dispose) */
function disposeGpu() { if (disposed) return; disposed = true; paused = true; try { gpu.dispose(); } catch (e) {} }
addEventListener('pagehide', disposeGpu);
// Part 7-4 视口可见性节流：页面切后台 / 视口不可见 → 停排帧（GPU 与循环全歇）；恢复时若没被休眠就重启循环
const gate = createRenderGate({
  onResume: () => { if (!paused) { resumeT = performance.now(); wake(); } },
});
wireVisibility(gate, document);
/** 按需渲染（U-16）：画一帧的理由才排下一帧——相机在动 / 飞行 / 缓动 / 过渡 / 自动旋转 / 有人在走 / 标注一轮没做完；什么都没有时一个 rAF 也不排（空闲 = 0 帧）。wake()：有事要重画 */
function wake() { needs = true; if (running && !rafId) rafId = requestAnimationFrame(loop); }
function loop(now) {
  rafId = 0;
  if (paused || gate.hidden) return;
  let moving = stepTween(now);
  if (ctlLive || controls.autoRotate || moving) { const ch = controls.update(); moving = moving || ch; if (!ch && !dragging && !controls.autoRotate) ctlLive = false; }
  const tg = controls.target; const cx = clamp(tg.x, -360, 360), cz = clamp(tg.z, -300, 300);
  if (cx !== tg.x || cz !== tg.z) { camera.position.x += cx - tg.x; camera.position.z += cz - tg.z; tg.x = cx; tg.z = cz; }
  if (!tween) targetY = tg.y;
  const mpp = (camera.right - camera.left) / camera.zoom / Math.max(1, innerWidth), zoomed = mode !== 'ext' || mpp < 0.1;
  if (zoomed !== zoomedNow) { zoomedNow = zoomed; document.body.classList.toggle('zoomed', zoomed); }
  let anim = false;
  if (pinned && now - pinT < 2000 && now - lastPulse > 66) { lastPulse = now; const k = 0.6 + 0.4 * Math.abs(Math.sin((now - pinT) / 420 * Math.PI)); hiPin.userData.fm.opacity = hiPin.userData.fillOp * (0.5 + k * 0.7); needs = true; }
  if (pinned && now - pinT < 2000) anim = true;
  npcStep(now);   // 日程里的人的头像：插值落位 + 跟着当前楼层显隐
  // Part 9-1 / 9-2：昼夜环境与粒子。过渡期间（世界时钟刚跳过一档）每帧都要重画，稳定后只在换时段时改一次。
  const dm = dayNightT ? Math.min(.1, (now - dayNightT) / 1000) : 0; dayNightT = now;
  const env9 = dayNight.update(dm);
  if (!dayNight.settled || env9.phase !== dayNightPhase) {
    dayNightPhase = env9.phase;
    applyDayNight({ THREE, env: env9, targets: { sun: sunL, hemi: hemiL } });   // 室内真灯
    applyGrade({ env: env9, materials: GRADE_TARGETS });                        // 室外烘焙调色
    applyNightFlat({ env: env9, targets: NIGHT_TARGETS });                      // 夜里把烘焙的日光对比抹平（A4）
    applyGlow({ env: env9, targets: GLOW_TARGETS });                              // 夜里的窗光（清单点名的窗 / 玻璃材质）
    lastEnvPhase = env9.phase; paintBackdrop();                                 // 分时段天空 + 云海（ESTATE-MODES-1 7c）
    fx3d?.setFXType(env9.night ? 'aurora' : 'none', env9.night ? .45 : 0);      // 夜里高空以太流光
    attachAurora();                                                            // 极光天幕：挂到相机上，绕岛怎么转都在
    needs = true;
  }
  const fr9 = fx3d?.update(dm);                                                 // 粒子只在别的原因画帧时才前进（空闲时不为它排帧）
  if (fr9?.drawCalls && fr9.type === 'aurora') attachAurora();
  if (lowRes && !down && !pinch && now - lastInteract > 150) setLowRes(false);
  const again = moving || !!tween || !dayNight.settled || npcWalker.moving() || lowRes || anim || controls.autoRotate || ctlLive || STATS;
  if (needs || moving || STATS) {
    needs = false;
    if (now - lastPropPulse > 66) { lastPropPulse = now; pulseProps(now); }   // 发光拾取物的呼吸：只在这一帧本来就要画时跟着变（core/stash3d.mjs 的 propGlow）
    adapt(now, moving); fitDepth(); aimInterior(camera);   // 窗内景：每帧把眼睛位置递给窗材质（interior-look.mjs）
    renderer.render(scene, camera); lastInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    labelR.render(scene, camera); cullLabels();
    if (cardFor && !cardAt) placeCard();
    frames++; window.__estate && (window.__estate.renders = (window.__estate.renders || 0) + 1);   // read by tools/browser/raf_pause.mjs (a still camera renders nothing)
    if (first) { first = false; onFirstFrame(); }
    if (resumeT) { window.__estate.resumeFrameMs = performance.now() - resumeT; resumeT = 0; }
    if (STATS && now - fpsT > 500) { fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; statsEl.textContent = `T${tier} · ${fps.toFixed(0)} fps · ${depthLabel(renderer.getContext())}\n${lastInfo.calls} calls\n${(lastInfo.triangles / 1000).toFixed(0)}k tris\n${STAT.site}${STAT.house ? ' + ' + STAT.house : ''}`; }
  }
  // 标注的遮挡一轮（≤ 4 Hz，分帧做完；相机停了也要把最后一轮做完）
  const w = guard.tick(now);
  if (w > 0 && !labelWait) labelWait = setTimeout(() => { labelWait = 0; wake(); }, w);
  if ((again || w < 0) && !rafId) rafId = requestAnimationFrame(loop);   // wake() may already have queued the next frame during this one
}
/** near / far 贴合整岛包围球（正交深度线性：range 越小分辨率越高）；缩得很远时云海要看到更深，远侧按视野放宽。随缩放 / 视角 / 平移每帧重算，变化小于 0.5 m 不动投影 */
function fitDepth() {
  if (!SPH) return;
  const view = (camera.top - camera.bottom) / camera.zoom;
  if (applyNearFar(camera, fitNearFar({ ...SPH, eye: camera.position, kind: 'ortho', farExtra: Math.min(2000, view * 1.2) }))) attachAurora();
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
  post({ type: 'estate:ready', floors: FL(), rooms: (CARD.rooms || []).map((r) => ({ name: r.name, node: r.node, floor: r.floor, kind: r.kind, area: r.area })), building: BLD(), kinds: [...new Set((CARD.rooms || []).map((r) => r.kind))].map(KIND) });
  if (mode === 'ext' && !EMBED && !REDUCED && !tween) { const v = viewFor('ext'); v.ease = 'out'; flyTo(v, 2000); }
  // 空闲时预取室内体量（低档不预取，等进楼层视图再取）
  if (!LOW) (window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(() => loadHouse(), { timeout: 4000 });
}

/* ---------------- 启动 ---------------- */
window.__estate = {
  setMode: (m) => setMode(parseFloor(m) ?? m, { fly: true }), focus: (n) => { const it = findByName(n); if (it) focusItem(it); return !!it; },
  find: (n) => { const it = findByName(n); return it ? { kind: it.kind, name: it.d.name, id: it.d.id, floor: it.floor != null ? FLOORS[it.floor].id : null } : null; },
  pick: (n) => { const it = findByName(n) || ITEMS.find((x) => x.kind === 'area' && x.d.id === n); if (it) { focusItem(it); postSelect(it); } return !!it; },   // 点选（探针用）：选中并告诉查看器
  view: (theta, phi) => { tween = null; placeCam(controls.target, theta, phi); wake(); },   // 机位（探针用）：绕目标的方位 / 俯仰角
  focusCard: (c) => focusRoomMsg(c.name, c), mode: () => mode, houseState: () => houseState, pinned: () => pinned && { kind: pinned.kind, name: pinned.d.name, id: pinned.d.id },
  plates: () => ({ on: PLATES, meshes: plates.reduce((n, ps) => n + ps.length, 0) }), hi: () => ({ pin: hiPin.visible, hover: hiHover.visible }),   // LEGEND-1 probe: no plate meshes unless the manifest asks; the highlight is the room boundary
  tier: () => tier, dpr: () => DPR, paused: () => paused, cam: () => ({ ...CAM, rotating: controls.autoRotate }),
  stats: () => ({ ...lastInfo, depth: depthLabel(renderer.getContext()), near: camera.near, far: camera.far, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length, tier, low: LOW, files: STAT, times: TB, firstFrameMs: window.__estate.firstFrameMs, tris: STAT.tris }),
  describe: () => Estate3D.describe(MAN, { base: M3D.base }),   // Estate3D 标准摘要（{ id, glbPath, floors, hotspots, budget, license }）
  props: { set: (raw) => { stashRaw = raw && Array.isArray(raw.items) ? raw : null; rebuildProps(); },   // 世界藏物表（探针 / 浏览器测试用）
    taken: (ids) => { propTaken = new Set(ids || []); rebuildProps(); },
    now: () => props.length, list: () => props.filter((g) => g.visible).map((g) => g.userData.prop),
    screen: () => props.filter((g) => g.visible).map((g) => { const v = g.getWorldPosition(new THREE.Vector3()).project(camera);
      return { id: g.userData.prop.id, x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; }),   // 屏幕坐标（探针 / 浏览器测试点它用）
    pick: (x, y) => pickProp(x, y)?.id || null,   // 射线在这一屏坐标上打到了哪一枚（没有 = null）
    summary: () => describeStash(props.filter((g) => g.visible).map((g) => g.userData.prop)) },
  npcs: { set: setNpcRoutine,   // 日程表 + 起点时钟（探针 / 浏览器测试用）
    now: () => npcs.size, list: () => [...npcs.keys()],
    at: (name, now) => npcWalker.at(name, now == null ? performance.now() : now),
    floor: name => npcs.get(name)?.floor ?? null,
    describe: () => ({ ...npcWalker.describe(), clock: npcClock, rounds: npcRounds, scheduled: !!npcSched }) },
  dayNight: { setClock: (c) => dayNight.setClock(c), describe: () => ({ ...dayNight.describe(), graded: GRADE_TARGETS.length }), period: () => periodOv, setPeriod },   // Part 9-1（探针 / 浏览器测试用）
  nightLook: () => ({ glow: [...new Set(GLOW_NAMES)], glowOn: GLOW_TARGETS.length, uGlow: GLOW_TARGETS[0]?.u.uGlow.value ?? 0, uNight: NIGHT_TARGETS[0]?.u.uNight.value ?? 0, flat: NIGHT_TARGETS.filter(t => t.u.uFlatOn.value).length, phase: lastEnvPhase, interior: interiorCount() }),   // D38 探针：夜里该亮的窗亮了没有（interior = 挂上窗内景的窗材质数）
  fx: { set: (type, intensity) => fx3d?.setFXType(type, intensity) || null, describe: () => fx3d?.describe() || null,
    layers: () => FX_REG.describe(), mounted: () => !!fx3d?.object?.parent },                                                        // Part 9-2
  people: { set: setPeople, list: () => PRES.list, chips: () => [...document.querySelectorAll('.pc')].map((b) => b.dataset.name || b.textContent), count: () => PRES.count(), located: () => [...LOCATED] },   // S7-3（探针用）
  rect: (node) => { const it = ROOM_BY_NODE.get(node); if (!it) return null; const f = FLOORS[it.floor], b = bboxOf(it.poly), pts = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]].map(([x, y]) => V(x, y, f.y + 1.9).project(camera));   // 房间在屏幕上的外包（探针用）
    const xs = pts.map((v) => (v.x + 1) / 2 * innerWidth), ys = pts.map((v) => (1 - v.y) / 2 * innerHeight); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; },
  labels: { guard, hits: (node) => { const it = ROOM_BY_NODE.get(node); return !!(it && it.label && it.label.element.classList.contains('occl')); }, named: () => ITEMS.filter(i => i.label).map(i => ({ node: i.d.node || '', name: nameOf(i), floor: i.floor == null ? '' : FLOORS[i.floor].id })) },
  camera, controls, renderer, scene, setLang, fit: fitDepth,   // fit：探针换机位后手动重算 near / far（正式交互走 loop）
};
buildNav(); relabel(); frustum();
const m0 = parseFloor(Q.get('floor')) ?? 'ext';
setMode(m0);
{ const v0 = viewFor(m0); let z = v0.zoom; if (m0 === 'ext' && !EMBED && !REDUCED) z *= 0.8; camera.zoom = clamp(z, minZoom, maxZoom); camera.updateProjectionMatrix(); placeCam(v0.target, v0.theta, v0.phi); targetY = v0.target.y; }

/* ---------------- 视角预设 + 指北针 · 空闲自动旋转（默认关） · 首次操作提示卡 ---------------- */
let presets = null, compass = null, idleTimer = null;
if (!EMBED) {   // 嵌入到查看器里时用查看器自己的控制列 / 提示，这几件只在独立打开时加
  const V4 = ['top', 'iso', 'front', 'free'];
  presets = makePresetCluster({ presets: V4.map(id => ({ id, label: tx(id) })), style: { bottom: '92px', right: '12px' } });
  presets.el.querySelectorAll('button').forEach((b, i) => { b.onclick = () => applyPreset(V4[i]); });
  presets.setActive('free');
  compass = makeCompass({ style: { bottom: '52px', right: '12px' }, onReset: () => applyPreset('front') });
  controls.addEventListener('change', () => { sph.setFromVector3(camera.position.clone().sub(controls.target)); compass.setHeading(sph.theta); });
  makeHintCard({ storageKey: 'edenEstateHintSeen', lines: LANG === 'en' ? [
    '<b>Drag</b> orbits around the point you press on', '<b>Wheel</b>: scroll to pan, hold Ctrl to zoom to the cursor, hold Alt to rotate',
    '<b>Right-drag / Shift-drag / two-finger drag</b> pans', '<b>Double-click</b> a room or area to fly to it, empty space or <b>0</b> resets the view',
    '<b>WASD / arrows</b> pan · <b>Q / E</b> rotate · <b>R / F</b> tilt · the zoom keys or the wheel zoom',
  ] : [
    '<b>拖动</b>：绕按下的那一点旋转', '<b>滚轮</b>：直接划动是平移，按住 Ctrl 缩放到光标，按住 Alt 划动是旋转',
    '<b>右键拖 / Shift 拖 / 双指拖</b> 平移', '<b>双击</b> 房间或区域拉近，双击空白或按 <b>0</b> 复位视野',
    '<b>WASD / 方向键</b> 平移 · <b>Q / E</b> 旋转 · <b>R / F</b> 俯仰 · 缩放键或滚轮缩放',
  ] });
}
function applyPreset(id) {
  tween = null; presets?.setActive(id);
  if (id === 'free') return;
  const dist = DIST;
  if (id === 'top') { sph.theta = AZ; sph.phi = 0.18; }
  else if (id === 'iso') { sph.theta = AZ; sph.phi = 0.98; }
  else if (id === 'front') { sph.theta = 0; sph.phi = 1.15; }
  placeCam(controls.target, sph.theta, sph.phi); wake();
}
/** I-06 / U-23: rotation is runtime state (the setting or the idle timer); it never writes the key, and reduced motion turns it off */
function applyRotate() { controls.autoRotate = rotateOn({ setting: CAM.autoRotate, idle: CAM.idle, rm: CAM.rm }); controls.autoRotateSpeed = 0.4; wake(); }
CAM.autoRotate = LS('edenMap3dAutoRotate') === '1'; CAM.wheelZoom = LS('edenMap3dWheelZoom') !== '0'; applyRotate();
idleTimer = makeIdleTimer(30000, () => { CAM.idle = true; applyRotate(); }, () => { CAM.idle = false; applyRotate(); });
['pointerdown', 'wheel', 'keydown'].forEach((ev) => window.addEventListener(ev, () => { idleTimer.markActive(); presets?.setActive('free'); }, { passive: true, capture: true }));
idleTimer.markActive();
controls.addEventListener('start', () => idleTimer.markActive());

kick('render');
running = true; wake();
setInterval(() => { if (!paused && !gate.hidden && npcSched) { npcTick(); wake(); } }, Math.min(15000, DEFAULT_ROUND_MS));   // 世界时钟的节拍（暂停 / 隐藏时不跑）
