// 清晰度档位、省流判断、加载进度、叠加层与标注避让（原内联主脚本「清晰度上限」「加载进度」两区 + 档位常量）。
import { labelCaps, tierOf } from '../core/label-tiers.mjs';
import { visibilityGuard } from './visibility.mjs';
import { loadingProgress } from './load-progress.mjs';
import { mapRegistry, aspect, currentMapId, pendingFocus, setAspect, setCurrentMapId, setPendingFocus, osdViewer } from './state.mjs';
import { $ } from './dom-helpers.mjs';
import { announce, setSrQ, srQ, srT } from './screen-reader-announce.mjs';
import { post } from './protocol-stamp.mjs';
import { localName, uiText } from './i18n.mjs';
import { go } from './map-switch.mjs';
import { baseFrame } from '../core/base-frame.mjs';
import { focusAfterGo } from './map-level-nav.mjs';
import { cardFrom, pointOverlays, setCardFrom, untrackAll, worldOverlays } from './markers.mjs';
import { applyZoomLimit, focusStart, markHere, setUserMoved, userMoved } from './locate.mjs';
import { resetInsets, updateInsets } from './hires-inset-tiles.mjs';
import { plugins } from './plugins.mjs';
export const TIERS = [   // 名称在 i18n/*.json 的 tier_<key>
  { key: 'save', cap: 2000, ratio: 1, dpr: 1.25 },
  { key: 'std', cap: 4000, ratio: .8, dpr: 2 },
  { key: 'hd', cap: 8000, ratio: .5, dpr: 3 },
];
const TIER_KEY = 'edenMapTierV2';   // 存过档位（省流 / 标准 / 清晰 / 自动）的继续沿用；没存过的默认自动
export let tier = 'auto';
try { tier = LocalStore.get(TIER_KEY) || 'auto'; } catch (e) {}
if (tier !== 'auto' && !TIERS.some(t => t.key === tier)) tier = 'auto';
export let autoKey = 'save';   // 自动档当前实际用的一档（只升不降）
export const effTier = () => TIERS.find(x => x.key === (tier === 'auto' ? autoKey : tier));
// 自动档的上限：默认「清晰」（用户 2026-09-27：手机也上调一档）；只有低内存（≤ 4 GB）、省流模式或 2g / 3g 网络才封顶到「标准」
const autoMax = () => { const c = navigator.connection || {};
  return (navigator.deviceMemory || 8) <= 4 || c.saveData || /(^|-)(2g|3g)$/.test(c.effectiveType || '') ? 'std' : 'hd'; };
// 省流模式：系统省流（saveData）、2g / 3g、内存 ≤ 4 GB、或手动选了「省流」档：不在后台预热别的地图的瓦片，只取 HTML 与 JSON（E4 N02）
export const lean = () => { const c = navigator.connection || {};
  return !!c.saveData || /(^|-)(2g|3g)$/.test(c.effectiveType || '') || (navigator.deviceMemory || 8) <= 4 || tier === 'save'; };
// 触屏且拿不到网络 / 内存信息（iOS WebKit 两个都没有）：按省流处理，但只用于后台预热和「自动进 3D 主场景」；清晰度自动档上限 autoMax() 不受影响（用户 2026-09-27 定，E6）
const touchUnknown = !navigator.connection && !('deviceMemory' in navigator) && matchMedia('(pointer: coarse)').matches;
export const leanBg = () => lean() || touchUnknown;
// ---------------- 加载进度：已完成 / (已完成 + 正在加载) ----------------
export function initProgress() {
  let done = 0, ok = 0, bad = 0, hideT = 0, firstLoaded = false;
  const ts = $('#tierState');
  const upd = () => {
    let busy = 0; for (let i = 0; i < osdViewer.world.getItemCount(); i++) busy += osdViewer.world.getItemAt(i)._tilesLoading || 0;
    // 还没有任何瓦片请求（done = 0、busy = 0）时不报 100%：慢网下曾经先显示 100% 再掉回 9%（E4 N05）
    if (!busy && !done) { $('#prog').hidden = true; return; }
    // 这一批瓦片全部失败（线路断了）：不报 100%、不说「已加载」、不撤遮罩，给「重试」（E5 r2 弱网 W1）
    if (!busy && bad && !ok) { tilesFailed(); clearTimeout(hideT); hideT = setTimeout(() => { done = ok = bad = 0; }, 200); return; }
    const pct = busy ? Math.round(done / (done + busy) * 100) : 100;
    $('#prog').hidden = !busy; $('#prog i').style.width = pct + '%';
    if (!$('#loading').classList.contains('done') && mapRegistry.maps[currentMapId]?.kind !== 'estate') { loadingProgress().label(uiText('loading_title', { title: localName(mapRegistry.maps[currentMapId], 'title') })).set(done, done + busy); loadingProgress().el.dataset.unit = 'tiles'; }   // fix3：统一进度组件，瓦片 已到 / 需要
    if (!firstLoaded) post({ type: 'eden-map:progress', pct });
    if (busy) { clearTimeout(tsT2); ts.textContent = uiText('busy_pct', { pct }); ts.className = 'busy'; }
    else if (ts.className === 'busy') tsOk();
    // 当前地图首屏瓦片都到了：告诉酒馆（后台预加载据此收尾）
    if (!busy && done && !firstLoaded) { firstLoaded = true; post({ type: 'eden-map:loaded' }); }
    // 在 100% 停一下再淡出；期间换了地图（例如跳去主场景）就不撤，免得撤掉主场景的遮罩（E4 N08）
    clearTimeout(hideT); if (!busy) { if (done) { const at = currentMapId; setTimeout(() => { if (currentMapId === at && mapRegistry.maps[currentMapId]?.kind !== 'estate') { $('#loading').classList.add('done'); loadingProgress().done(); } }, 350); } hideT = setTimeout(() => { done = ok = bad = 0; $('#prog').hidden = true; }, 200); }
  };
  osdViewer.addHandler('open', () => { done = ok = bad = 0; tileActs(false); if (mapRegistry.maps[currentMapId]?.kind !== 'estate') loadingProgress().reset(); upd(); });
  osdViewer.addHandler('tile-loaded', () => { done++; ok++; lastTile = Date.now(); tileActs(false); upd(); });
  // 卡住提示：还有图块在加载，但 8 秒没有新图块到达 → 网络慢；20 秒 → 可点击重试（重新请求当前地图的图块）
  let lastTile = Date.now();
  const stuckTick = () => {
    let busy = 0; for (let i = 0; i < osdViewer.world.getItemCount(); i++) busy += osdViewer.world.getItemAt(i)._tilesLoading || 0;
    const idle = (Date.now() - lastTile) / 1000;
    if (!busy) { lastTile = Date.now(); return; }
    if (idle > 20) { ts.textContent = uiText('stuck'); ts.className = 'busy stuck'; }
    else if (idle > 8 && !ts.classList.contains('stuck')) { ts.textContent = uiText('slow', { pct: ts.textContent.match(/\d+%/)?.[0] || '' }); }
  };
  let stuckT = 0;   // S7-2: the 1 s watcher runs only while the map can be seen (docs/ui-refactor.md 4): no timer for a closed panel, a hidden document or a 3D view over the map
  visibilityGuard.subscribe(paused => { clearInterval(stuckT); stuckT = paused ? 0 : setInterval(stuckTick, 1000); });
  ts.addEventListener('click', () => { if (!ts.classList.contains('stuck')) return; if (!$('#tileRetry').hidden) return retryTiles(); ts.className = 'busy'; lastTile = Date.now();
    osdViewer.world.resetItems(); for (let i = 0; i < osdViewer.world.getItemCount(); i++) osdViewer.world.getItemAt(i)._needsUpdate = true; osdViewer.forceRedraw(); });
  osdViewer.addHandler('tile-load-failed', () => { done++; bad++; upd(); });
  $('#tileRetry').onclick = retryTiles;
  osdViewer.addHandler('update-viewport', () => { if (!$('#prog').hidden || osdViewer.world.getItemAt(0)?._tilesLoading) upd(); });
  // 首屏：第一张瓦片画出来就撤掉遮罩（模糊版先出，随后变清晰）
  osdViewer.addHandler('tile-drawn', () => $('#loading').classList.add('over'));
}

// 瓦片线路失败：遮罩上给「重试」，顶栏显示「卡住了？点此重试」；重试 = 重新请求当前地图的瓦片
function tileActs(on) { const b = $('#tileRetry'); if (!on) $('#loading')?.classList.remove('dock'); if (!b || b.hidden === !on) return; b.hidden = !on;
  const acts = $('#loading .acts'); if (on) { acts.hidden = false; $('#estRetry').hidden = $('#estPlan').hidden = true; } else if ($('#estRetry').hidden) acts.hidden = true; }
// N13：整批瓦片都失败时先问宿主能不能换到另一条线路（宿主自动换线并重载查看器，不弹提示）；宿主没答 / 没得换才显示提示。每次打开只问一次
let routeAsk = 0, routeT = 0, routeMoving = false;
function tilesFailed() {
  const ts = $('#tierState'); clearTimeout(tsT2); ts.textContent = uiText('stuck'); ts.className = 'busy stuck'; $('#prog').hidden = true;
  if (mapRegistry.maps[currentMapId]?.kind === 'estate' || routeMoving) return;
  if (!routeAsk) { routeAsk = Date.now(); post({ type: 'eden-map:tiles-failed' }); routeT = setTimeout(showTilesFailed, 900); return; }   // 单独打开（没有宿主）：900 ms 没有答复就提示
  if (!routeT) showTilesFailed();
}
function showTilesFailed() {
  routeT = 0; const first = $('#tileRetry').hidden, ld = $('#loading'); ld.classList.remove('done'); loadingProgress().fail(uiText('tiles_failed')); tileActs(true); ld.classList.add('dock');   // dock：提示停在顶部，不盖住地图中央
  if (first) announce(uiText('tiles_failed'));   // 每批失败都会进来：只在第一次播报（E5 r3 无障碍 F-13）
}
export function tilesRoute(d) {   // 宿主的答复（eden-map:tiles-route）
  clearTimeout(routeT); routeT = 0;
  if (d.switched) { routeMoving = true; const ld = $('#loading'); ld.classList.remove('done'); ld.classList.add('dock'); loadingProgress().label(uiText('route_switching')); announce(uiText('route_switching')); } else if (routeAsk) showTilesFailed();
}
function retryTiles() {   // 失败的瓦片 OSD 不会再请求（resetItems 不清失败记录），所以按原视野重新打开当前地图
  setSrQ([]); clearTimeout(srT); const sp = $('#loading span'); sp.tabIndex = -1; sp.focus({ preventScroll: true });   // 按钮隐藏前先把焦点给提示文字，不掉到 body
  tileActs(false); const id = currentMapId, v = osdViewer.viewport.getBounds(); if (!id) return;
  setCurrentMapId(null); setUserMoved(true); go(id).then(() => osdViewer.addOnceHandler('open', () => osdViewer.viewport.fitBounds(v, true)));
}
// 「✓ 已加载」：只在加载遮罩消失之后出现（E5 V13），--ok 色 1.5 秒后淡成 --muted，再 1.5 秒收起
let tsT2 = 0;
function tsOk(n = 0) {
  const ts = $('#tierState'); clearTimeout(tsT2);
  if (!$('#loading').classList.contains('done') && n < 40) { ts.textContent = ''; ts.className = ''; tsT2 = setTimeout(() => tsOk(n + 1), 400); return; }
  ts.textContent = uiText('loaded'); ts.className = 'ok';
  tsT2 = setTimeout(() => { if (ts.className !== 'ok') return; ts.className = '';
    tsT2 = setTimeout(() => { if (ts.textContent === uiText('loaded') && !ts.className) ts.textContent = ''; }, 1500); }, 1500);
}
// ---------------- 清晰度上限 ----------------
// 不能改 source.maxLevel（OSD 会按它重算每层比例，请求不存在的瓦片），所以包一层选层函数（OSD 5.0.1 内部方法，已随仓库固定版本）。
function capLevels(it) {
  if (it._capWrapped) return; it._capWrapped = true;
  const orig = it._getLevelsInterval.bind(it);
  it._getLevelsInterval = () => { const r = orig(); r.highestLevel = Math.min(r.highestLevel, it._capLevel ?? 99); r.lowestLevel = Math.min(r.lowestLevel, r.highestLevel); return r; };
}
// setTier：用户选档（记下来）；applyTier：按实际生效的一档设上限（自动档升档时只调它，不改存档）
export function setTier(key) {
  tier = key; try { LocalStore.set(TIER_KEY, key); } catch (e) {}
  if (key === 'auto') { autoTier(true); if (osdViewer?.world.getItemAt(0)) return; }
  applyTier();
}
export function tierLabels() {
  const tt = effTier(), base = osdViewer?.world.getItemAt(0), px = base ? Math.min(tt.cap, base.source.dimensions.x) : tt.cap;
  document.querySelectorAll('#tiers button').forEach(b => { b.classList.toggle('on', b.dataset.k === tier); b.setAttribute('aria-pressed', b.dataset.k === tier);
    b.textContent = uiText('tier_' + b.dataset.k);   // 像素数对玩家没意义，放进 title（E5 V21）
    const cap = (TIERS.find(x => x.key === b.dataset.k) || tt).cap;
    b.title = b.dataset.k === 'auto' ? uiText('tier_auto_title') + (tier === 'auto' ? ' · ' + uiText('tier_now', { px }) : '') : uiText('tier_cap', { px: cap }); });
  if (currentMapId && mapRegistry?.maps[currentMapId] && $('#tiers')) $('#tiers').title = uiText(tier === 'auto' ? 'tier_status_auto' : 'tier_status', { title: localName(mapRegistry.maps[currentMapId], 'title'), px });
  tierAvail();
}
// fix3（用户 2026-09-28）：不适用的档位不再悄悄消失，而是灰掉并写明原因——三维页（清晰度只管平面瓦片）/ 地图还没打开 / 本图原图不够大（和低一档一样）
export function tierAvail() {
  const why = $('#tierWhy'), bs = [...document.querySelectorAll('#tiers button')]; if (!bs.length) return;
  const est = document.body.classList.contains('estate') || mapRegistry?.maps?.[currentMapId]?.kind === 'estate', base = osdViewer?.world?.getItemAt(0), W = base?.source?.dimensions?.x || 0;
  let msg = '';
  if (est) msg = uiText('tier_na_3d');
  else if (!base) msg = uiText('tier_na_none');
  for (const b of bs) {
    let off = !!msg, tip = '';
    const i = TIERS.findIndex(x => x.key === b.dataset.k);
    if (!off && i > 0 && W && TIERS[i - 1].cap >= W && tier !== b.dataset.k) { off = true; tip = uiText('tier_na_small', { px: W, prev: uiText('tier_' + TIERS[i - 1].key) }); }
    b.disabled = off; b.setAttribute('aria-disabled', off ? 'true' : 'false'); if (tip) b.title = tip;
    if (tip && !msg) msg = tip;
  }
  if (why) { why.textContent = msg; why.hidden = !msg; }
}
// 自动档：屏幕实际需要的像素 = 视口宽 × devicePixelRatio ÷ 可见部分占图宽的比例，取刚好够用的一档；只升不降
export function autoTier(force) {
  if (tier !== 'auto' || !osdViewer) return;
  const base = osdViewer.world.getItemAt(0); if (!base) return;
  const vis = Math.min(1, osdViewer.viewport.getBounds(true).width);   // 可见宽度 / 图宽（图宽 = 1）
  const need = osdViewer.viewport.getContainerSize().x * (window.__deviceDpr?.() || devicePixelRatio || 1) / Math.max(vis, 1e-3);
  const max = TIERS.findIndex(x => x.key === autoMax());
  let j = TIERS.findIndex(x => x.cap >= need * .9); if (j < 0) j = TIERS.length - 1;
  j = Math.max(Math.min(j, max), TIERS.findIndex(x => x.key === autoKey));
  if (TIERS[j].key !== autoKey || force === true) { autoKey = TIERS[j].key; applyTier(); }
}
export function applyTier() {
  tierLabels();
  osdViewer?._updatePixelDensityRatio?.();   // 新档位的像素密度上限（变了会自动重设画布）
  const tt = effTier(), base = osdViewer?.world.getItemAt(0);
  if (!base) return;
  const scale = Math.min(1, tt.cap / base.source.dimensions.x);   // 相对底图原始宽度；叠加层按同比例
  for (let i = 0; i < osdViewer.world.getItemCount(); i++) {
    const it = osdViewer.world.getItemAt(i); capLevels(it);
    it._capLevel = Math.min(it.source.maxLevel, Math.ceil(Math.log2(it.source.dimensions.x * scale)));
    it.minPixelRatio = tt.ratio; it._needsUpdate = true; it._needsDraw = true;
  }
  osdViewer.forceRedraw();
  // 切档后如果没有新瓦片要拉（降档或已缓存），也给一个明确的「已加载」
  const ts = $('#tierState'); ts.textContent = uiText('switching'); ts.className = 'busy';
  setTimeout(() => { let busy = 0; for (let i = 0; i < osdViewer.world.getItemCount(); i++) busy += osdViewer.world.getItemAt(i)._tilesLoading || 0;
    if (!busy && ts.textContent === uiText('switching')) tsOk(); }, 900);
}
export function onOpen() {
  resetInsets();   // 旧世界已经被 viewer.open() 整个换掉，插图记录清空，新地图按需重新补上
  if (mapRegistry.maps[currentMapId]?.kind === 'estate') return;   // 打开旧底图期间已经切去主场景
  const it = osdViewer.world.getItemAt(0), sz = it.getContentSize(); setAspect(baseFrame(mapRegistry.maps[currentMapId]?.view?.extent_m).aspect || sz.y / sz.x);   // 视图框的比例优先（N13），没有范围的图才看图自己的形状
  applyTier(); applyZoomLimit(); homeMode(); drawOverlays(); focusStart(true); autoTier(); updateInsets();
  if (pendingFocus) { const el = [...document.querySelectorAll('.mk')].find(e => e.dataset.name === mapRegistry.maps[currentMapId].markers?.[pendingFocus]?.name);
    setPendingFocus(null); if (el) { setCardFrom(el); el._open(); } }
  focusAfterGo();
}
// 叠加层（标记、结界圈、事件）：打开地图时画；切换语言时重画
export function drawOverlays() {
  untrackAll(); osdViewer.clearOverlays();
  if (mapRegistry.maps[currentMapId].kind === 'world') worldOverlays(); else pointOverlays();
  if (typeof plugins.SecurityView !== 'undefined') plugins.SecurityView.afterOpen();   // v0.9.6 安保叠加层
  plugins.EventsView.render(); plugins.CharactersView.render(); plugins.CustomNamesView.relabel(); plugins.TripsView.render();   // 自定义显示名（v0.9.3）；人物层（chars.js，v0.9.2）；事件层（events.js）：聊天前端里的事件标签、外部数据源
  applyOverlayToggle(); markHere($('#here').value); tabOrder(); declutter(); window.FogApi?.paint();
}
// 竖屏（手机）：允许缩到整张图横向放进屏幕（上下留边），不再只能看到半张图（E4 N13）
// v0.9.6：面板从预加载（桌面尺寸）变成手机全屏、横竖屏切换后，用户没动过就按新尺寸重新取景并居中（手机世界图偏到一边的 P1）
let refitT = 0;
export function refit() { clearTimeout(refitT); refitT = setTimeout(() => { if (!osdViewer?.world.getItemCount() || mapRegistry?.maps[currentMapId]?.kind === 'estate') return;
  if (!userMoved) focusStart(true); else osdViewer.viewport.applyConstraints(true); }, 60); }
addEventListener('orientationchange', () => setTimeout(refit, 250));
export function homeMode() { const cs = osdViewer.viewport.getContainerSize(); osdViewer.viewport.homeFillsViewer = !(cs.y > cs.x); }
// Tab 顺序 = 空间顺序：叠加层按「先上后下、同一行先左后右」重新排列 DOM（位置由 OSD 的 style 决定，不受 DOM 顺序影响）
export function tabOrder() {
  const box = osdViewer.overlaysContainer || osdViewer.canvas; if (!box) return;
  const row = aspect * .08, items = [];
  for (const el of box.querySelectorAll('.mk, .ev, .realm')) { const p = osdViewer.getOverlayById(el)?.location; if (p && p.width === undefined) items.push([Math.round(p.y / row), p.x, el.parentElement === box ? el : el.parentElement]); }
  items.sort((a, b) => a[0] - b[0] || a[1] - b[1]); for (const [, , w] of items) box.appendChild(w);   // OSD 把每个叠加层包在一个 wrapper 里，移动 wrapper
}
// 地标名避让：按优先级（当前地点 / 选中 > 首府、钻入 > 本层默认聚焦 > 有跨层通道 > 其余）保留，和更重要的标签重叠的才隐藏（E4 N13）
let declT = 0;
// E5（R14 / L2）：事态点也参加避让。事态图标是可点的，永远保留并当作障碍：压在图标上的普通地标名隐藏（当前地点、首府除外）；
// 世界图国名（.realm）排在首府之后保留，「中小国」小字最后；事态的文字标签和已保留的标签重叠时收起，只留图标
export let declutterMs = 0;   // the duration of the last pass (read through the debug surface)
// U-FIX-5 U-01 / L-01: a name whose pin is on the map but whose label runs past the map's left / right edge (or under the side rail) slides back inside; the pin stays
function clampLabels() {
  const osd = $('#osd')?.getBoundingClientRect(); if (!osd?.width) return;
  const S = window.ViewerDrawer, dr = S?.el && !S.el.hidden ? S.el.getBoundingClientRect() : null;
  const right = dr?.width && dr.left > osd.left + osd.width / 2 && dr.left < osd.right ? dr.left : osd.right, L = osd.left + 6, R = right - 6;
  const labs = [...document.querySelectorAll('.mk .lab')]; labs.forEach(l => l.style.removeProperty('--ldx'));
  const rs = labs.map(l => [l, l.getBoundingClientRect(), l.closest('.mk')?.querySelector('.pin')?.getBoundingClientRect()]);
  for (const [l, r, p] of rs) { if (!r.width || !p?.width || p.right < osd.left || p.left > right) continue; const dx = r.left < L ? L - r.left : r.right > R ? R - r.right : 0; if (dx) l.style.setProperty('--ldx', Math.round(dx) + 'px'); }
}
export function declutter() { clearTimeout(declT); declT = setTimeout(() => {
  const t0 = performance.now(); clampLabels();
  const mks = [...document.querySelectorAll('.mk')], evs = [...document.querySelectorAll('.ev, .chm')], words = [...document.querySelectorAll('.realm, .minor')];
  if (!mks.length && !evs.length) return;
  const rank = e => e.classList.contains('here') || e.classList.contains('active') ? 0 : e.classList.contains('capital') || e.classList.contains('op') ? 1 : e.dataset.focus ? 2 : e.dataset.link ? 3 : 4;
  [...mks, ...evs, ...words].forEach(e => e.classList.remove('lhide'));
  const hit = (r, k, g = 4) => r.left < k.right + g && r.right > k.left - g && r.top < k.bottom + 2 && r.bottom > k.top - 2;
  const seen = new Map(), box = e => { if (!e) return null; if (seen.has(e)) return seen.get(e); const r = e.getBoundingClientRect(), v = r.width ? r : null; seen.set(e, v); return v; };   // 同一轮只量一次，routeGaps 复用
  const ic = evs.flatMap(e => [...e.querySelectorAll(':scope > i, :scope > .chg > i')].map(i => [e, box(i)])).filter(x => x[1]), icons = ic.map(x => x[1]), kept = [];
  const place = (e, r, avoidIcons) => { if (!r) return; if (kept.some(k => hit(r, k)) || (avoidIcons && icons.some(k => hit(r, k, 0)))) e.classList.add('lhide'); else kept.push(r); };
  const sorted = mks.sort((a, b) => rank(a) - rank(b)), caps = labelCaps(innerWidth <= 640); let placed = 0;
  const tier = e => { if (e.classList.contains('lhide')) return; const lr = box(e.querySelector('.lab')); if (lr && (lr.right < 0 || lr.left > innerWidth || lr.bottom < 0 || lr.top > innerHeight)) return; const t = tierOf(++placed, caps); e.classList.toggle('l1', t === 'l1'); if (!t && rank(e) > 0) e.classList.add('lhide'); };   // L1 names stay visible on far islands (the upper tier shows its major places at the default zoom); the caps hide the rest
  // 控制列（手机半开抽屉时横排贴在抽屉上沿）当障碍：压在它下面的地名收起，不再被按钮盖住（v2 门控遗留）
  const dk = $('#dock'), dockR = []; if (dk && !dk.hidden && getComputedStyle(dk).display !== 'none') for (const c of dk.children) { const r = c.offsetParent && box(c); if (r) { kept.push(r); dockR.push(r); } }
  for (const sel of ['#foot', '#hereGo', 'header']) { const x = $(sel), r = x && x.offsetParent !== null && box(x); if (r) kept.push(r); }   // more HUD rects are obstacles (N10 9): the level strip and the zoom column are in the dock above
  for (const e of sorted.filter(e => rank(e) <= 1)) { place(e, box(e.querySelector('.lab')), false); if (rank(e) === 0) e.classList.remove('lhide'); tier(e); }   // the player's place and the open card are never hidden
  for (const e of words.filter(e => e.classList.contains('realm'))) { const r = box(e.querySelector('b')); if (r) kept.push(r); }
  // v0.9.2：事态标题先于普通地名：事态点所在的地名收起，只留一条标签（事态标题）
  for (const e of evs.sort((a, b) => (+b.className.match(/sev(\d)/)?.[1] || 0) - (+a.className.match(/sev(\d)/)?.[1] || 0))) {
    const b = e.querySelector('b'), r = b && getComputedStyle(b).display !== 'none' ? box(b) : null; if (!r) continue;
    if (kept.some(k => hit(r, k)) || ic.some(([x, k]) => x !== e && hit(r, k, 0))) e.classList.add('lhide'); else kept.push(r);
  }
  for (const e of sorted.filter(e => rank(e) > 1)) { const r = box(e.querySelector('.lab')), pin = box(e.querySelector('.pin'));
    if (pin && icons.some(k => hit(pin, k, 6))) e.classList.add('lhide'); else place(e, r, true);
    tier(e);
    e.classList.toggle('undock', !!(pin && dockR.some(k => hit(pin, k, 4)))); }   // 图钉压在控制列下：整个标记让开（免得点到按钮下面的图钉）
  for (const e of words.filter(e => e.classList.contains('minor'))) place(e, box(e), true);
  routeGaps(box); declutterMs = performance.now() - t0;
}, 80); }
// measure：declutter 同一轮已量过的标签框（带缓存的 box），避让后直接复用，不再对每个标签二次 getBoundingClientRect
export function routeGaps(measure) {
  const svg = document.querySelector('.routes'); if (!svg || document.body.classList.contains('noroutes')) return;
  const g = svg.querySelector('.gaps'), m = svg.getScreenCTM?.(); if (!g || !m) return; const inv = m.inverse(), P = (x, y) => new DOMPoint(x, y).matrixTransform(inv);
  const M = measure || (e => { const r = e.getBoundingClientRect(); return r.width ? r : null; });
  const rs = [...document.querySelectorAll('.mk:not(.lhide) .lab, .chm .av, .ev:not(.lhide) b')].map(M).filter(Boolean);
  const html = rs.map(r => { const a = P(r.left - 3, r.top - 3), b = P(r.right + 3, r.bottom + 3); return `<rect x="${a.x.toFixed(1)}" y="${a.y.toFixed(1)}" width="${(b.x - a.x).toFixed(1)}" height="${(b.y - a.y).toFixed(1)}" rx="4" fill="#000"/>`; }).join('');
  if (html !== g.__h) { g.__h = html; g.innerHTML = html; }   // 没变就不重写遮罩（WebKit 重栅格化）
}
export function applyOverlayToggle() {
  const on = $('#tgBorders').checked, m = mapRegistry.maps[currentMapId];
  if (m?.overlay?.type === 'dzi') osdViewer.world.getItemAt(1)?.setOpacity(on ? 1 : 0);
  document.querySelectorAll('.barriers').forEach(e => e.style.visibility = on ? '' : 'hidden');
}
