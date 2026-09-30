// 启动：main / mainInner（并行取注册表、标记、派生数据、字典、here.mjs、core/protocol.mjs，建 OSD，发 ready）、启动失败出路。
// 核心各块按原内联脚本的顺序求值（副作用：监听器、window.I18N / EdenMap / TCNotify…）；兼容面 bridge.mjs 最后
import './state.mjs';
import './util.mjs';
import './tiers.mjs';
import './i18n.mjs';
import './topbar.mjs';
import './nav.mjs';
import './estate.mjs';
import './layers.mjs';
import './markers.mjs';
import './locate.mjs';
import './settings.mjs';
import './extapi.mjs';
import './shell.mjs';
import './host.mjs';
import './bridge.mjs';
import { initFpsMeter, suspendFpsMeter } from './fps.mjs';
import { initVisibilityGuard } from './visibility.mjs';
import { registerWeatherLayer } from './weather.mjs';
import { registerTrafficLayer } from './traffic.mjs';
import { registerQuestLayer } from './quests.mjs';
import { registerLootLayer } from './loot.mjs';   // Part 5-1：地上的发光拾取物（世界藏物表）
import { registerVisionLayer } from './vision.mjs';   // Part 5-2：巡逻岗哨的警戒视野锥 + 走过去的潜行判定
import { registerWanderLayer } from './wander.mjs';   // Part 5-3：人物标记换地方时滑过去（日程漫游的补间）
import { registerDepthHazeLayer } from './depthhaze.mjs';   // Part 8-3：纵深霾浓度 → 图层系统滤镜链（空气透视）
import { M, REG, cur, pendingHome, setM, setPendingHome, setREG, setViewer, viewer } from './state.mjs';
import { updateInsets } from './insets.mjs';
import { $, PR, PROTO, coarse, getJSON, jsonCache, narrow, post, setNarrow, setPR, SUB_ORIGIN } from './util.mjs';
import { TIERS, autoTier, declutter, effTier, homeMode, initProgress, onOpen, refit, setTier } from './tiers.mjs';
import { DICT, LANG, applyI18n, postState, setDICT, setLANG, setLang, t } from './i18n.mjs';
import { layoutHeader, warmOthers } from './topbar.mjs';
import { go } from './nav.mjs';
import { est, estateLook, estatePlan, retryEstate } from './estate.mjs';
import { closeCard } from './markers.mjs';
import { ALIAS, applyZoomLimit, focusStart, hereRes, jumpHere, markHere, setEstPlan, setHX, setUserMoved, startInScene, userMoved } from './locate.mjs';
import { initSettings } from './settings.mjs';
import { emEmit, enNames, rebuildHere, setEnNames } from './extapi.mjs';
import { firstRunHint, initE7, initShell } from './shell.mjs';
import { initLayerHost, registry, registerCoreLayers, renderLayerMenu } from './layerhost.mjs';
import { P } from './plugins.mjs';
import { PACK, initPack, packData, packEvents, rebase } from './pack.mjs';
import { buildRuntime } from './nodes-runtime.mjs';   // 节点树：面包屑 / 上一级 / 庄园替身都从它读（S2-A）
import { busOn } from './bus.mjs';
// 多地图查看器：地图注册表 data/maps.json（世界 → 天城三层 → 以后的庄园剖面……）。
// 底图都是 DZI 瓦片金字塔，只加载屏幕里看得见的部分；解码内存由屏幕大小和瓦片缓存上限决定。
// 档位 = 清晰度上限：最多加载到相当于 cap 像素宽的那一层瓦片（放大后差别明显）。
// 默认「自动」：按当前缩放下屏幕实际需要的像素选刚好够用的一档，放大时升、缩小时不降（已加载的瓦片不浪费）；手动选的档位照旧生效。
export async function main() { try { await mainInner(); } catch (e) { bootFail(e); } }
async function mainInner() {
  // 三个启动文件并行取（之前 derived.json 要等前两个取完才开始）
  let d, enDict, reg, mk, dict, hx;
  await initPack(getJSON);   // 设定包（core/pack.mjs）：一律取清单（eden 的在 viewer.html preload）
  const opt = k => (packData(k) ? getJSON(packData(k)) : Promise.resolve(null));
  [reg, mk, d, dict, hx, enDict] = await Promise.all([getJSON(packData('maps')).then(rebase), opt('world'), opt('derived'), window.__i18n,
    import(new URL('here.mjs', document.baseURI).href).catch(() => null), LANG === 'en' ? window.__i18n : getJSON('i18n/en.json'),
    import(new URL('core/protocol.mjs', document.baseURI).href).then(m => { setPR(m); }, () => null), packEvents]);
  setREG(reg); setM(mk || { places: [], fiefs: [], realms: [] });   // 没有世界图的包：空的世界地点表
  setDICT(dict); setHX(hx);
  // v0.9.6：选了 EN 但英文词典没取到时，整页退回中文（以前 LANG 仍是 en：面包屑英文、界面中文、变量映射英文，混在一起）
  if (!DICT || !Object.keys(DICT).length) { const zh = await getJSON('i18n/zh.json'); if (LANG !== 'zh') { setLANG('zh'); document.documentElement.lang = 'zh-CN'; } setDICT(zh || {}); }
  jsonCache.set('i18n/' + LANG + '.json', Promise.resolve(DICT));
  setEnNames(enDict?.names || null); rebuildHere();
  const nodes = plan => buildRuntime({ manifest: PACK, maps: REG, world: M, names: enDict?.names || null, plan });
  nodes(null);
  if (packData('rooms')) getJSON(packData('rooms')).then(p => { if (!p?.rooms) return; setEstPlan(p); rebuildHere(); nodes(p); markHere($('#here').value); }).catch(() => {});   // v0.9.6：卡设定分层房间进当前地点词表（不挡启动）   // 当前地点 → 落点的词表（中英都认；加上本机自定义叫法）
  post({ type: 'eden-map:boot', pct: .9 });   // 数据文件已到
  // Blender 地形重新生成后，「旷野高地」取新地形在奥伦境内的最高点
  if (d?.highland) Object.assign(M.places.find(p => p.id === 'highland'), d.highland);
  // 世界图上，天城各层地图里的地点（执法局、7 号井……）都归到「天城」
  // 开局地点的简易地图（groups.<id>.place）同理：地图里的地标归到世界图上对应的地点 / 封地
  for (const [gid, g] of Object.entries(REG.groups)) { const pl = g.place && [...M.places, ...M.fiefs].find(q => q.id === g.place), key = gid === 'tiancheng' ? '天城' : pl?.name; if (!key) continue;
    const A = ALIAS[key] ??= [key];
    for (const k of g.layers || []) { A.push(...(REG.maps[k].alias || [])); for (const v of Object.values(REG.maps[k].markers || {})) A.push(...(v.alias || [])); } }
  setNarrow(innerWidth <= 640);   // 等 iframe 布局完成后再判断，脚本刚执行时宽度可能还是 0
  const seg = $('#tiers');
  for (const x of [{ key: 'auto' }, ...TIERS]) { const b = document.createElement('button'); b.dataset.k = x.key;
    b.onclick = () => setTier(x.key); seg.appendChild(b); }
  registerCoreLayers(); registerWeatherLayer(); registerTrafficLayer(); registerQuestLayer(); registerLootLayer(); registerVisionLayer(); registerWanderLayer(); registerDepthHazeLayer(); renderLayerMenu(); initShell(); layoutHeader(); busOn({ key: 'boot.resize', type: 'resize', fn: layoutHeader });   // P3-C：#layList 由 LayerRegistry 数据驱动，先于 shell 绑定 / applyI18n 渲染
  applyI18n(); $('#status').textContent = t('loading');
  $('#estRetry').onclick = retryEstate; $('#estPlan').onclick = estatePlan;
  // Tab 到视野外的地标 / 事件点：浏览器会去滚动 OSD 的容器（overflow:hidden），这里撤掉滚动、改为平移地图把它带进视野
  $('#osd').addEventListener('focusin', e => { const el = e.target.closest?.('.mk, .ev, .realm'); if (!el) return;
    const unscroll = () => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { if (n.scrollTop) n.scrollTop = 0; if (n.scrollLeft) n.scrollLeft = 0; } };
    unscroll(); requestAnimationFrame(unscroll);
    const ov = viewer.getOverlayById(el), p = ov?.location; if (!p || p.width !== undefined) return;
    const b = viewer.viewport.getBounds(true), mx = b.width * .08, my = b.height * .08;
    if (p.x < b.x + mx || p.x > b.x + b.width - mx || p.y < b.y + my || p.y > b.y + b.height - my) viewer.viewport.panTo(new OpenSeadragon.Point(p.x, p.y)); });
  // 工具栏换行（英文更宽、窄窗口）时，信息卡跟着工具栏的实际高度往下挪，不压住第二行
  const hdr = $('header'); new ResizeObserver(() => document.documentElement.style.setProperty('--hdr', hdr.offsetHeight + 'px')).observe(hdr);
  document.querySelectorAll('#langSeg button').forEach(b => b.onclick = () => setLang(b.dataset.lang));
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => setTimeout(() => { estateLook(); postState(); }, 0));   // 自动主题跟随系统切换时
  // 画布像素密度随档位封顶：高分屏（手机 3x）上省流只画 1.25x，填充的像素少一半以上，选瓦片的层级也跟着降
  const devDpr = OpenSeadragon.getCurrentPixelDensityRatio;
  OpenSeadragon.getCurrentPixelDensityRatio = () => Math.min(devDpr(), effTier().dpr);
  window.__devDpr = devDpr;
  OpenSeadragon.pixelDensityRatio = OpenSeadragon.getCurrentPixelDensityRatio();
  setViewer(OpenSeadragon({
    element: $('#osd'), drawer: 'canvas', prefixUrl: 'vendor/openseadragon/images/',
    showNavigator: !narrow, showFullPageControl: false, showNavigationControl: false, navigatorPosition: 'BOTTOM_LEFT', navigatorWidth: '180px', navigatorHeight: '120px',   // 自绘缩放组 #zoom 替代 OSD 的拟物按钮（E5 V01）
    visibilityRatio: 1, constrainDuringPan: true, homeFillsViewer: true, minZoomImageRatio: 1,   // v0.9.6：这几项以前被上一行的注释吞掉了，手机世界图因此能被推到一边、留出大片空白
    maxZoomPixelRatio: 1.25, crossOriginPolicy: 'Anonymous', animationTime: .6, blendTime: 0, immediateRender: false, imageLoaderLimit: coarse ? 6 : 16,   /* 手机 / 低内存并发少一些（TT WebKit 实测） */ maxImageCacheCount: coarse ? 30 : 60,   /* 512px 瓦片：并发拉取，缓存约 60 MB */ minPixelRatio: effTier().ratio, gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true }, gestureSettingsTouch: { pinchRotate: false, flickEnabled: true },
    smoothTileEdgesMinZoom: Infinity,   // 瓦片有 1px 重叠，不需要放大时整屏再画一遍去接缝
  }));
  viewer.addHandler('open', onOpen);
  initLayerHost(viewer); registry.mountAll({ viewer }); viewer.addHandler('open', () => initLayerHost(viewer));   // P3-C：视口槽位容器 + 按注册序挂载图层
  initTileWorker();   // Part 3 §2：瓦片解码挪到后台线程（懒 import，拿不到就原路径，不挡启动）
  // 缩放组：+ / − 以视野中心缩放，复位 = 本图的初始视野
  $('#zIn').onclick = () => { setUserMoved(true); viewer.viewport.zoomBy(1.5); viewer.viewport.applyConstraints(); };
  $('#zOut').onclick = () => { setUserMoved(true); viewer.viewport.zoomBy(1 / 1.5); viewer.viewport.applyConstraints(); };
  $('#zHome').onclick = () => { setUserMoved(false); setPendingHome(false); focusStart(false); };
  // U15（手机「看全区」）：首屏按 view.phone 停在伊甸，点这里缩到整层全区（与聚焦、复位互不影响）
  $('#zAll').onclick = () => { setUserMoved(true); const b = viewer.world.getHomeBounds?.();
    if (b) { viewer.viewport.fitBounds(b, true); viewer.viewport.applyConstraints(); } else { setPendingHome(false); focusStart(false); } };
  const navH = () => document.documentElement.style.setProperty('--nav-h', (viewer.navigator?.element?.offsetHeight || 0) + 'px');
  viewer.addHandler('open', () => setTimeout(navH, 0)); addEventListener('resize', navH);
  // 打开失败（断网 / DZI 404）：撤掉「已加载」态——上一张图留下的 done 会把这条失败提示整个盖住，
  // 用户只看见一片空白、不知道发生了什么（浏览器探针 p4_fx 的断网降级项抓到）。重试按钮复用瓦片重试那颗。
  viewer.addHandler('open-failed', e => {
    const ld = $('#loading'); if (!ld) return;
    ld.hidden = false; ld.classList.remove('done'); ld.classList.add('over');
    const sp = ld.querySelector('span'); if (sp) sp.textContent = t('load_failed', { msg: e.message || '' });
    const acts = ld.querySelector('.acts'); if (acts) acts.hidden = false;
    const b = $('#tileRetry'); if (b) { b.hidden = false; b.textContent = t('estate.retry') === 'estate.retry' ? '重试' : t('estate.retry'); }
  });
  viewer.addHandler('canvas-drag', () => setUserMoved(true)); viewer.addHandler('canvas-scroll', () => setUserMoved(true)); viewer.addHandler('canvas-pinch', () => setUserMoved(true));
  let lastRs = 0, queued = false;
  const rescale = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false;
    if (!viewer.world.getItemCount()) return;
    const px = viewer.viewport.getContainerSize().x * viewer.viewport.getZoom(true);   // 整张图的屏幕宽度
    const rs = px / 1100; if (Math.abs(rs - lastRs) / (lastRs || 1) < .04) return; lastRs = rs;
    document.documentElement.style.setProperty('--rs', rs.toFixed(3));
    document.body.classList.toggle('far', px < 1700); document.body.classList.toggle('tiny', px < 800); }); };
  viewer.addHandler('animation', rescale); viewer.addHandler('resize', rescale); viewer.addHandler('open', () => setTimeout(rescale, 0));
  viewer.addHandler('animation-finish', autoTier); viewer.addHandler('resize', autoTier);
  viewer.addHandler('animation-finish', declutter); viewer.addHandler('resize', () => { homeMode(); declutter(); applyZoomLimit(); refit(); });
  // 插图命中范围会随平移 / 缩放变化，清晰度上限（是否按插图的分辨率放宽）也要跟着重算
  viewer.addHandler('animation-finish', () => { updateInsets(); applyZoomLimit(); });
  initProgress();
  // 图层开关的接线、存储与默认勾选收进 app/layerhost.mjs 的 registerCoreLayers（P3-C：#layList 由 LayerRegistry 数据驱动，键名不变）
  $('#here').oninput = () => markHere($('#here').value);
  $('#here').onchange = () => { markHere($('#here').value); emEmit('here', { value: $('#here').value, resolved: hereRes($('#here').value) }); };   // 单独打开查看器时：输入框改完（回车 / 失焦）= 模拟 MVU 地点更新
  initSettings(); initE7(); initFpsMeter();
  // P7-4：标签页切走 / 面板不可见时按下暂停位——FPS 读数循环停、三维子页停 rAF（模型与 GPU 资源留着，
  // 与 eden-map:sleep 的 estate:pause 同一条协议），切回来原样恢复。
  initVisibilityGuard({ target: $('#osd'), effects: {
    onPause: () => { suspendFpsMeter(true); est?.frame?.contentWindow?.postMessage({ type: 'estate:pause' }, SUB_ORIGIN); },
    onResume: () => { suspendFpsMeter(false); est?.frame?.contentWindow?.postMessage({ type: 'estate:resume' }, SUB_ORIGIN); },
  } });
  { let ct = 0; const cb = $('#creditBtn'), cr = $('#credit');
    const show = on => { cr.hidden = !on; cb.setAttribute('aria-expanded', on); clearTimeout(ct); if (on) ct = setTimeout(() => show(false), 6000); };
    cb.onclick = e => { e.stopPropagation(); show(cr.hidden); }; cr.onclick = () => show(false); window.__creditShow = show; }
  $('#cardX').onclick = () => closeCard(true);
  const qs = new URLSearchParams(location.search), q = qs.get('map');
  if (qs.get('here')) $('#here').value = qs.get('here');   // 调试：?here=主卧
  if (REG.maps[q] && REG.maps[q].status !== 'planned') go(q);
  else if (!startInScene()) go(REG.start);   // 用户 2026-09-28：总是先开世界图；跳到当前地点只在点「当前位置」时。
  // 唯一例外（任务三）：人**已经**在庄园（三维场景）里时跳过宏观世界层，直接下钻到庄园对应楼层——判定收在 locate.startInScene。
  $('#hereGo').onclick = () => jumpHere($('#here').value);
  P.TCEvents.init(); P.TCEvents.pollFeeds();   // 事态横条与花屏提示；外部事件数据源（maps.json 的 feeds，默认没有）
  post({ type: 'eden-map:ready', proto: PROTO });
  // 首张地图画出来后，空闲时预热其他地图：描述文件、点位数据、最粗的几层瓦片（切过去立刻有模糊版）
  let warmT = 0; const warmSoon = ms => (clearTimeout(warmT), warmT = setTimeout(() => (window.requestIdleCallback || (f => f()))(() => warmOthers(), { timeout: 3000 }), ms));
  viewer.addOnceHandler('tile-drawn', () => { warmSoon(1500); setTimeout(firstRunHint, 1600); viewer.addHandler('open', () => warmSoon(2500)); });   // 每到一张新图，再预热它的邻居（已预热过的跳过）
}
/**
 * Part 3 §2：把瓦片解码接到后台线程。懒 import（模块不到 / 浏览器不支持都不影响启动），
 * 装在 OSD 实例的瓦片源上——OSD 的 addJob / finish 与 tile-loaded 全部照旧，所以加载进度与「卡住了？重试」不受影响；
 * 任一瓦片解码失败都自动回原来的 new Image() 路径（dzi-worker.mjs 内部还有连续失败整会话停用的兜底）。
 */
function initTileWorker() {
  import('./dzi-worker.mjs').then(m => { try { m.installWorkerTiles(viewer); } catch (e) {} }).catch(() => {});
}
// 启动数据取不到时的出路（接手 review P0）：以前 main() 抛错就永远停在「加载中…」，连重试按钮都没有
function bootFail(e) {
  console.error('[地图] 启动失败', e);
  const ld = $('#loading'); if (!ld) return;
  ld.hidden = false; ld.classList.remove('thumb'); ld.classList.add('over');
  const sp = ld.querySelector('span'); if (sp) sp.textContent = t('boot_fail') === 'boot_fail' ? '地图数据没取到，检查网络后重试' : t('boot_fail');
  const acts = ld.querySelector('.acts'); if (acts) acts.hidden = false;
  const b = $('#tileRetry'); if (b) { b.hidden = false; b.textContent = t('estate.retry') === 'estate.retry' ? '重试' : t('estate.retry'); b.onclick = () => location.reload(); }
}
document.addEventListener('DOMContentLoaded', main);   // 两个 defer 脚本（地图库、事态层）执行完之后
