// 启动：main / mainInner（并行取注册表、标记、派生数据、字典、core/protocol.mjs，建 OSD，发 ready）、启动失败出路。
// 核心各块按原内联脚本的顺序求值（副作用：监听器、window.I18N / EdenMap / showNotice…）；调试面 viewer-debug.mjs 最后
import './state.mjs';
import './coordinates.mjs';
import './dom-helpers.mjs';
import './viewport-mode.mjs';
import './protocol-stamp.mjs';
import './screen-reader-announce.mjs';
import './json-cache.mjs';
import './text-lookup.mjs';
import './sharpness-tiers.mjs';
import './i18n.mjs';
import './topbar.mjs';
import './map-switch.mjs';
import './subpage3d-host.mjs';
import './map-level-nav.mjs';
import './markers.mjs';
import './locate.mjs';
import './settings.mjs';
import './extension-api.mjs';
import './control-column.mjs';
import './drawer-glue.mjs';
import './notice-layer.mjs';
import './status-dot.mjs';
import './one-hand-mode.mjs';
import './quick-zoom.mjs';
import './host-messages.mjs';
import './viewer-debug.mjs';
import { initFpsMeter, suspendFpsMeter } from './fps.mjs';
import { initVisibilityGuard } from './visibility.mjs';
import { registerWeatherLayer } from './weather-view.mjs';
import { registerTrafficLayer } from './traffic-view.mjs';
import { registerQuestLayer } from './quests-view.mjs';
import { registerLootLayer } from './stash-markers.mjs';   // Part 5-1：地上的发光拾取物（世界藏物表）
import { registerVisionLayer } from './vision-view.mjs';   // Part 5-2：巡逻岗哨的警戒视野锥 + 走过去的潜行判定
import { registerWanderLayer } from './wander.mjs';   // Part 5-3：人物标记换地方时滑过去（日程漫游的补间）
import { registerDepthHazeLayer } from './depth-haze.mjs';   // Part 8-3：纵深霾浓度 → 图层系统滤镜链（空气透视）
import { worldData, mapRegistry, currentMapId, pendingHome, setWorldData, setPendingHome, setMapRegistry, setOsdViewer, osdViewer } from './state.mjs';
import { updateInsets } from './hires-inset-tiles.mjs';
import { $ } from './dom-helpers.mjs';
import { protocol, PROTO, post, setProtocol, SUB_ORIGIN } from './protocol-stamp.mjs';
import { coarse, narrow, setNarrow } from './viewport-mode.mjs';
import { getJSON, jsonCache, seedJSON } from './json-cache.mjs';
import { TIERS, autoTier, declutter, effTier, homeMode, initProgress, onOpen, refit, setTier } from './sharpness-tiers.mjs';
import { DICT, LANG, applyI18n, postState, setDICT, setLANG, setLang, uiText } from './i18n.mjs';
import { layoutHeader, warmOthers } from './topbar.mjs';
import { go } from './map-switch.mjs';
import { subpageSession, estateLook, estatePlan, retryEstate } from './subpage3d-host.mjs';
import { closeCard } from './markers.mjs';
import { ALIAS, applyZoomLimit, focusStart, hereRes, jumpHere, markHere, setEstPlan, setUserMoved, startInScene, userMoved } from './locate.mjs';
import { initSettings } from './settings.mjs';
import { emEmit, enNames, rebuildHere, setEnNames } from './extension-api.mjs';
import { firstRunHint } from './notice-layer.mjs';
import { initE7 } from './one-hand-mode.mjs';
import { initShell } from './drawer-glue.mjs';
import { registerNavOpsLayer } from './nav-ops-view.mjs';   // K-R86: the navigator's clues and marks
import { registerTransitLayer } from './transit-view.mjs';   // K-R110: the pack's transit network
import { registerRoutePlanLayer } from './route-plan-view.mjs';   // K-R111: route planning
import { registerLocalPropsLayer } from './local-props-view.mjs';   // K-R88: the user's own props on flat maps
import { initDeclaredLayers } from './declared-layers.mjs';   // K-R80: the pack's declared layers draw with the kernel's building blocks
import { initLayerHost, registry, registerCoreLayers, renderLayerMenu, applyPackLayers } from './layer-host.mjs';
import { plugins } from './plugins.mjs';
import { PACK, initPack, packData, packEvents, packNames, packOverlay, packTax, setOverlay, rebase, packV2, packProblems } from './current-pack.mjs';
import { projectV2 } from '../core/pack-v2-view.mjs';   // schema-2 包到注册表形状的投影（K-R96）
import { buildRuntime, buildRuntimeV2 } from './nodes-runtime.mjs';   // 节点树：面包屑 / 上一级 / 主场景替身都从它读（S2-A）
import { applyTheme } from './theme.mjs';   // 包的分视图主题（K-R70）：一个 <style id="packTheme">
import { busOn } from './bus.mjs';
// 多地图查看器：地图注册表 data/maps.json（世界 → 城市各层 → 以后的室内剖面……）。
// 底图都是 DZI 瓦片金字塔，只加载屏幕里看得见的部分；解码内存由屏幕大小和瓦片缓存上限决定。
// 档位 = 清晰度上限：最多加载到相当于 cap 像素宽的那一层瓦片（放大后差别明显）。
// 默认「自动」：按当前缩放下屏幕实际需要的像素选刚好够用的一档，放大时升、缩小时不降（已加载的瓦片不浪费）；手动选的档位照旧生效。
export async function main() { try { await mainInner(); } catch (e) { bootFail(e); } }
async function mainInner() {
  // 三个启动文件并行取（之前 derived.json 要等前两个取完才开始）
  let d, enNamesP, reg, mk, dict, overlay;
  await initPack(getJSON);   // 设定包（core/pack.mjs）：一律取清单（eden 的在 viewer.html preload）
  const opt = k => (packData(k) ? getJSON(packData(k)) : Promise.resolve(null));
  const v2 = packV2 ? projectV2(packV2, { base: PACK.base }) : null;   // schema-2 包：投影出注册表与虚拟点位文件，不取 v1 数据文件（清单没有 data）
  if (v2) { seedJSON(v2.files); if (packProblems.length || v2.problems.length) console.warn('[地图] 设定包有问题', [...packProblems, ...v2.problems]); }
  [reg, mk, d, dict, enNamesP, , , overlay] = await Promise.all([v2 ? v2.registry : getJSON(packData('maps')).then(rebase), opt('world'), opt('derived'), window.__dictionaryPromise,
    packNames('en') ? getJSON(packNames('en')) : null,   // 包的英文地名表（清单 data.names.en）；没声明的包：英文下地名退回中文
    import(new URL('core/protocol.mjs', document.baseURI).href).then(m => { setProtocol(m); }, () => null), packEvents,
    opt('overlay')]);   // 包旁边的 v2 叠加层（K-R67），清单 data.overlay 声明了才取；没声明的包行为和以前一样
  setOverlay(overlay); setMapRegistry(reg); setWorldData(mk || { places: [], fiefs: [], realms: [] });   // 没有世界图的包：空的世界地点表
  setDICT(dict);
  // v0.9.6：选了 EN 但英文词典没取到时，整页退回中文（以前 LANG 仍是 en：面包屑英文、界面中文、变量映射英文，混在一起）
  if (!DICT || !Object.keys(DICT).length) { const zh = await getJSON('i18n/zh.json'); if (LANG !== 'zh') { setLANG('zh'); document.documentElement.lang = 'zh-CN'; } setDICT(zh || {}); }
  jsonCache.set('i18n/' + LANG + '.json', Promise.resolve(DICT));
  setEnNames(enNamesP || null); rebuildHere();
  const nodes = v2 ? () => buildRuntimeV2(packV2, v2.registry) : plan => buildRuntime({ manifest: PACK, maps: mapRegistry, world: worldData, names: enNamesP || null, plan, overlay: packOverlay, events: packTax });
  const rt0 = nodes(null); applyTheme(rt0?.ui); applyPackLayers(rt0?.layers || []);   // K-R79: the pack's layers rows adjust the kernel layers (registry.patch) and wait for S8-2 to draw
  if (packData('rooms')) getJSON(packData('rooms')).then(p => { if (!p?.rooms) return; setEstPlan(p); rebuildHere(); nodes(p); markHere($('#here').value); }).catch(() => {});   // v0.9.6：卡设定分层房间进当前地点词表（不挡启动）   // 当前地点 → 落点的词表（中英都认；加上本机自定义叫法）
  post({ type: 'eden-map:boot', pct: .9 });   // 数据文件已到
  // Blender 地形重新生成后，「旷野高地」取新地形在奥伦境内的最高点
  if (d?.highland) Object.assign(worldData.places.find(p => p.id === 'highland'), d.highland);
  // 世界图上，某个城市各层地图里的地点都归到它在世界图上的地点
  // 开局地点的简易地图（groups.<id>.place）同理：地图里的地标归到世界图上对应的地点 / 封地
  for (const p of [...worldData.places, ...worldData.fiefs, ...(worldData.realms || [])]) if (Array.isArray(p.here_words) && p.name) ALIAS[p.name] = p.here_words.filter(w => typeof w === 'string');   // 世界图地点自己的「当前地点」词表（here_words，数据里的顺序）：在主场景 / 各层里的地点归到它
  for (const [gid, g] of Object.entries(mapRegistry.groups)) { const pl = g.place && [...worldData.places, ...worldData.fiefs].find(q => q.id === g.place), key = pl?.name; if (!key) continue;   // 组的地点叫什么就用什么名字（gid 不特判）
    const A = ALIAS[key] ??= [key];
    for (const k of g.layers || []) { A.push(...(mapRegistry.maps[k].alias || [])); for (const v of Object.values(mapRegistry.maps[k].markers || {})) A.push(...(v.alias || [])); } }
  setNarrow(innerWidth <= 640);   // 等 iframe 布局完成后再判断，脚本刚执行时宽度可能还是 0
  const seg = $('#tiers');
  for (const x of [{ key: 'auto' }, ...TIERS]) { const b = document.createElement('button'); b.dataset.k = x.key;
    b.onclick = () => setTier(x.key); seg.appendChild(b); }
  registerCoreLayers(); registerWeatherLayer(); registerTrafficLayer(); registerQuestLayer(); registerLootLayer(); registerVisionLayer(); registerWanderLayer(); registerDepthHazeLayer(); registerNavOpsLayer(); registerLocalPropsLayer(); registerTransitLayer(); registerRoutePlanLayer(); initDeclaredLayers(); renderLayerMenu(); initShell(); layoutHeader(); busOn({ key: 'boot.resize', type: 'resize', fn: layoutHeader });   // P3-C：#layList 由 LayerRegistry 数据驱动，先于 shell 绑定 / applyI18n 渲染
  applyI18n(); $('#status').textContent = uiText('loading');
  $('#estRetry').onclick = retryEstate; $('#estPlan').onclick = estatePlan;
  // Tab 到视野外的地标 / 事件点：浏览器会去滚动 OSD 的容器（overflow:hidden），这里撤掉滚动、改为平移地图把它带进视野
  $('#osd').addEventListener('focusin', e => { const el = e.target.closest?.('.mk, .ev, .realm'); if (!el) return;
    const unscroll = () => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { if (n.scrollTop) n.scrollTop = 0; if (n.scrollLeft) n.scrollLeft = 0; } };
    unscroll(); requestAnimationFrame(unscroll);
    const ov = osdViewer.getOverlayById(el), p = ov?.location; if (!p || p.width !== undefined) return;
    const b = osdViewer.viewport.getBounds(true), mx = b.width * .08, my = b.height * .08;
    if (p.x < b.x + mx || p.x > b.x + b.width - mx || p.y < b.y + my || p.y > b.y + b.height - my) osdViewer.viewport.panTo(new OpenSeadragon.Point(p.x, p.y)); });
  // 工具栏换行（英文更宽、窄窗口）时，信息卡跟着工具栏的实际高度往下挪，不压住第二行
  const hdr = $('header'); new ResizeObserver(() => document.documentElement.style.setProperty('--hdr', hdr.offsetHeight + 'px')).observe(hdr);
  document.querySelectorAll('#langSeg button').forEach(b => b.onclick = () => setLang(b.dataset.lang));
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => setTimeout(() => { estateLook(); postState(); }, 0));   // 自动主题跟随系统切换时
  // 画布像素密度随档位封顶：高分屏（手机 3x）上省流只画 1.25x，填充的像素少一半以上，选瓦片的层级也跟着降
  const devDpr = OpenSeadragon.getCurrentPixelDensityRatio;
  OpenSeadragon.getCurrentPixelDensityRatio = () => Math.min(devDpr(), effTier().dpr);
  window.__deviceDpr = devDpr;
  OpenSeadragon.pixelDensityRatio = OpenSeadragon.getCurrentPixelDensityRatio();
  setOsdViewer(OpenSeadragon({
    element: $('#osd'), drawer: 'canvas', prefixUrl: 'vendor/openseadragon/images/',
    showNavigator: !narrow, showFullPageControl: false, showNavigationControl: false, navigatorPosition: 'BOTTOM_LEFT', navigatorWidth: '180px', navigatorHeight: '120px',   // 自绘缩放组 #zoom 替代 OSD 的拟物按钮（E5 V01）
    visibilityRatio: 1, constrainDuringPan: true, homeFillsViewer: true, minZoomImageRatio: 1,   // v0.9.6：这几项以前被上一行的注释吞掉了，手机世界图因此能被推到一边、留出大片空白
    maxZoomPixelRatio: 1.25, crossOriginPolicy: 'Anonymous', animationTime: .6, blendTime: 0, immediateRender: false, imageLoaderLimit: coarse ? 6 : 16,   /* 手机 / 低内存并发少一些（TT WebKit 实测） */ maxImageCacheCount: coarse ? 30 : 60,   /* 512px 瓦片：并发拉取，缓存约 60 MB */ minPixelRatio: effTier().ratio, gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true }, gestureSettingsTouch: { pinchRotate: false, flickEnabled: true },
    smoothTileEdgesMinZoom: Infinity,   // 瓦片有 1px 重叠，不需要放大时整屏再画一遍去接缝
  }));
  osdViewer.addHandler('open', onOpen);
  initLayerHost(osdViewer); registry.mountAll({ viewer: osdViewer }); osdViewer.addHandler('open', () => initLayerHost(osdViewer));   // P3-C：视口槽位容器 + 按注册序挂载图层
  initTileWorker();   // Part 3 §2：瓦片解码挪到后台线程（懒 import，拿不到就原路径，不挡启动）
  // 缩放组：+ / − 以视野中心缩放，复位 = 本图的初始视野
  $('#zIn').onclick = () => { setUserMoved(true); osdViewer.viewport.zoomBy(1.5); osdViewer.viewport.applyConstraints(); };
  $('#zOut').onclick = () => { setUserMoved(true); osdViewer.viewport.zoomBy(1 / 1.5); osdViewer.viewport.applyConstraints(); };
  $('#zHome').onclick = () => { setUserMoved(false); setPendingHome(false); focusStart(false); };
  // U15（手机「看全区」）：首屏按 view.phone 停在起始地点，点这里缩到整层全区（与聚焦、复位互不影响）
  $('#zAll').onclick = () => { setUserMoved(true); const b = osdViewer.world.getHomeBounds?.();
    if (b) { osdViewer.viewport.fitBounds(b, true); osdViewer.viewport.applyConstraints(); } else { setPendingHome(false); focusStart(false); } };
  const navH = () => document.documentElement.style.setProperty('--nav-h', (osdViewer.navigator?.element?.offsetHeight || 0) + 'px');
  osdViewer.addHandler('open', () => setTimeout(navH, 0)); addEventListener('resize', navH);
  // 打开失败（断网 / DZI 404）：撤掉「已加载」态——上一张图留下的 done 会把这条失败提示整个盖住，
  // 用户只看见一片空白、不知道发生了什么（浏览器探针 p4_fx 的断网降级项抓到）。重试按钮复用瓦片重试那颗。
  osdViewer.addHandler('open-failed', e => {
    const ld = $('#loading'); if (!ld) return;
    ld.hidden = false; ld.classList.remove('done'); ld.classList.add('over');
    const sp = ld.querySelector('span'); if (sp) sp.textContent = uiText('load_failed', { msg: e.message || '' });
    const acts = ld.querySelector('.acts'); if (acts) acts.hidden = false;
    const b = $('#tileRetry'); if (b) { b.hidden = false; b.textContent = uiText('estate.retry') === 'estate.retry' ? '重试' : uiText('estate.retry'); }
  });
  osdViewer.addHandler('canvas-drag', () => setUserMoved(true)); osdViewer.addHandler('canvas-scroll', () => setUserMoved(true)); osdViewer.addHandler('canvas-pinch', () => setUserMoved(true));
  let lastRs = 0, queued = false;
  const rescale = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false;
    if (!osdViewer.world.getItemCount()) return;
    const px = osdViewer.viewport.getContainerSize().x * osdViewer.viewport.getZoom(true);   // 整张图的屏幕宽度
    const rs = px / 1100; if (Math.abs(rs - lastRs) / (lastRs || 1) < .04) return; lastRs = rs;
    document.documentElement.style.setProperty('--rs', rs.toFixed(3));
    document.body.classList.toggle('far', px < 1700); document.body.classList.toggle('tiny', px < 800); }); };
  osdViewer.addHandler('animation', rescale); osdViewer.addHandler('resize', rescale); osdViewer.addHandler('open', () => setTimeout(rescale, 0));
  osdViewer.addHandler('animation-finish', autoTier); osdViewer.addHandler('resize', autoTier);
  osdViewer.addHandler('animation-finish', declutter); osdViewer.addHandler('resize', () => { homeMode(); declutter(); applyZoomLimit(); refit(); });
  // 插图命中范围会随平移 / 缩放变化，清晰度上限（是否按插图的分辨率放宽）也要跟着重算
  osdViewer.addHandler('animation-finish', () => { updateInsets(); applyZoomLimit(); });
  initProgress();
  // 图层开关的接线、存储与默认勾选收进 app/layer-host.mjs 的 registerCoreLayers（P3-C：#layList 由 LayerRegistry 数据驱动，键名不变）
  $('#here').oninput = () => markHere($('#here').value);
  $('#here').onchange = () => { markHere($('#here').value); emEmit('here', { value: $('#here').value, resolved: hereRes($('#here').value) }); };   // 单独打开查看器时：输入框改完（回车 / 失焦）= 模拟 MVU 地点更新
  initSettings(); initE7(); initFpsMeter();
  // P7-4：标签页切走 / 面板不可见时按下暂停位——FPS 读数循环停、三维子页停 rAF（模型与 GPU 资源留着，
  // 与 eden-map:sleep 的 estate:pause 同一条协议），切回来原样恢复。
  initVisibilityGuard({ target: $('#osd'), effects: {
    onPause: () => { suspendFpsMeter(true); subpageSession?.frame?.contentWindow?.postMessage({ type: 'estate:pause' }, SUB_ORIGIN); },
    onResume: () => { suspendFpsMeter(false); subpageSession?.frame?.contentWindow?.postMessage({ type: 'estate:resume' }, SUB_ORIGIN); },
  } });
  { let ct = 0; const cb = $('#creditBtn'), cr = $('#credit');
    const show = on => { cr.hidden = !on; cb.setAttribute('aria-expanded', on); clearTimeout(ct); if (on) ct = setTimeout(() => show(false), 6000); };
    cb.onclick = e => { e.stopPropagation(); show(cr.hidden); }; cr.onclick = () => show(false); window.__showCredits = show; }
  $('#cardX').onclick = () => closeCard(true);
  const qs = new URLSearchParams(location.search), q = qs.get('map');
  if (qs.get('here')) $('#here').value = qs.get('here');   // 调试：?here=主卧
  if (mapRegistry.maps[q] && mapRegistry.maps[q].status !== 'planned') go(q);
  else if (!startInScene()) go(mapRegistry.start);   // 用户 2026-09-28：总是先开世界图；跳到当前地点只在点「当前位置」时。
  // 唯一例外（任务三）：人**已经**在主场景（三维场景）里时跳过宏观世界层，直接下钻到主场景对应楼层——判定收在 locate.startInScene。
  $('#hereGo').onclick = () => jumpHere($('#here').value);
  plugins.EventsView.init(); plugins.EventsView.pollFeeds();   // 事态横条与花屏提示；外部事件数据源（maps.json 的 feeds，默认没有）
  post({ type: 'eden-map:ready', proto: PROTO });
  // 首张地图画出来后，空闲时预热其他地图：描述文件、点位数据、最粗的几层瓦片（切过去立刻有模糊版）
  let warmT = 0; const warmSoon = ms => (clearTimeout(warmT), warmT = setTimeout(() => (window.requestIdleCallback || (f => f()))(() => warmOthers(), { timeout: 3000 }), ms));
  osdViewer.addOnceHandler('tile-drawn', () => { warmSoon(1500); setTimeout(firstRunHint, 1600); osdViewer.addHandler('open', () => warmSoon(2500)); });   // 每到一张新图，再预热它的邻居（已预热过的跳过）
}
/**
 * Part 3 §2：把瓦片解码接到后台线程。懒 import（模块不到 / 浏览器不支持都不影响启动），
 * 装在 OSD 实例的瓦片源上——OSD 的 addJob / finish 与 tile-loaded 全部照旧，所以加载进度与「卡住了？重试」不受影响；
 * 任一瓦片解码失败都自动回原来的 new Image() 路径（dzi-worker.mjs 内部还有连续失败整会话停用的兜底）。
 */
function initTileWorker() {
  import('./dzi-worker.mjs').then(m => { try { m.installWorkerTiles(osdViewer); } catch (e) {} }).catch(() => {});
}
// 启动数据取不到时的出路（接手 review P0）：以前 main() 抛错就永远停在「加载中…」，连重试按钮都没有
function bootFail(e) {
  console.error('[地图] 启动失败', e);
  const ld = $('#loading'); if (!ld) return;
  ld.hidden = false; ld.classList.remove('thumb'); ld.classList.add('over');
  const sp = ld.querySelector('span'); if (sp) sp.textContent = uiText('boot_fail') === 'boot_fail' ? '地图数据没取到，检查网络后重试' : uiText('boot_fail');
  const acts = ld.querySelector('.acts'); if (acts) acts.hidden = false;
  const b = $('#tileRetry'); if (b) { b.hidden = false; b.textContent = uiText('estate.retry') === 'estate.retry' ? '重试' : uiText('estate.retry'); b.onclick = () => location.reload(); }
}
document.addEventListener('DOMContentLoaded', main);   // 两个 defer 脚本（地图库、事态层）执行完之后
