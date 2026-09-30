// 庄园 / 三维子页宿主：openEstate（blob iframe + <base> + 失败钩子）、子页消息、通用三维查看器入口。
import { lp } from './loadprog.mjs';
import { REG, cur, pendingFocus, setPendingFocus, viewer } from './state.mjs';
import { $, PR, SUB_ORIGIN, announce, post, tx } from './util.mjs';
import { LANG, nm, postState } from './i18n.mjs';
import { getText, textCache } from './topbar.mjs';
import { applyCredit, go } from './nav.mjs';
import { focusAfterGo, onEsc, renderNav, stepLayer } from './layers.mjs';
import { untrackAll } from './markers.mjs';
import { estPlan, hereRes } from './locate.mjs';
import { q3Pref } from './settings.mjs';
import * as TCCvd from './cvd.mjs';
import { PACK } from './pack.mjs';   // 三维子页的包注入（__packId / __packStrings）：子页读不到清单，语言键与包内文案随页带进去
import { P } from './plugins.mjs';   // 空间化背包 TCInv：三维发光道具的「拿到手」对账
import { busOn } from './bus.mjs';
import { chatId } from './extapi.mjs';
import { setFpsMeter } from './fps.mjs';
import { standIn, zoneChildren } from './nodes-runtime.mjs';
import { trimTileCache } from './dzi-worker.mjs';   // Part 3 §5：吃紧时收紧 OSD 解码瓦片缓存
let lastTileCache = 1e9;   // 只减不增：三维页报的目标张数单调收紧，避免来回抖
// ---------------- 庄园剖面（kind=estate） ----------------
// 嵌入接口（换版时保持）：maps.json 的 src 指向页面（相对 map/）。这里 fetch 页面文本、在 <head> 后插入 <base href="页面所在目录">、
// 用 blob: iframe 显示（见 openEstate 里的说明；查看器本身是 srcdoc + <base> 加载的；jsDelivr 的 gh 线路把 .html 当纯文本返回，不能直接 iframe src）。
//   查看器 → 庄园：{ type: 'estate:room', name }（当前地点；庄园按房间名 / 别名高亮，匹配不到就取消高亮）、{ type: 'estate:inset', left }（左侧留白 px）
//   庄园 → 查看器：{ type: 'estate:ready' }（第一帧画完）、{ type: 'estate:key', key }（PageUp / PageDown / [ / ] 交给查看器切层）、
//                 { type: 'estate:fail', reason }（三维库或页面脚本加载失败）
// 三维库（three 0.160.0）随仓库放在 map/estate/vendor/，庄园页的 importmap 用相对路径，跟着 <base>（当前线路）走，没梯子也能加载。
// 兜底：旧版庄园页 importmap 里若还写着 jsDelivr / jsdmirror 的 npm 地址，注入 srcdoc 前改写成同一线路下的 estate/vendor/（E4 N01）。
export let est = null;   // { id, frame, ready }
// 休眠时把画好的庄园留着（隐藏 + 暂停渲染，GPU 资源不放）：再打开面板直接接着用，不再「加载 伊甸庄园…」。
// 宿主 SLEEP_MS（3 分钟）后整页卸载时才真正释放；省流 / 低内存（lean()）照旧休眠即拆。
export let estParked = null;
export function dropParked() { if (estParked) { estParked.frame.remove(); estParked = null; } }
// ---------------- Part 3 §3：三维上下文的排他租约 ----------------
// 稳态下本来就只有一个三维 iframe（est 是单例），但没有任何东西把这件事钉住：
//   庄园挂起（estParked）+ 再开一次三维 = 两个 live WebGL 上下文；离开庄园的淡出帧没及时摘掉也会撞。
// 所以每次发新租约前先把上一份彻底摘掉（weak frame 只摘不阻塞新页面加载），并在开新页面前同步清掉。
export let live3d = 0;   // 当前活着的三维帧数（自检 / 浏览器探针用）
let weak3d = null;       // 上一份租约的帧：新页面开始加载就摘掉（不等淡出）
export function release3d() {
  dropParked();
  if (weak3d) { try { weak3d.remove(); } catch (e) {} weak3d = null; }
  if (est?.frame) { const f = est.frame; est = null; try { f.remove(); } catch (e) {} }
  live3d = 0;
}
// ---------------- Part 3 §3：底图 → 三维的一次性转场（OSD 画布 → ImageBitmap → CanvasTexture）----------------
// OSD 是 Canvas2D（不是 WebGL），三维页是那个唯一的 GL 上下文：转场时把 OSD 画布拷成 ImageBitmap 交给三维页当背景，
// 三维页淡完就 close 位图；之后不再上传（不是每帧同步）。拍不到 / 不支持 → 走原来的 DOM 快照，行为不变。
const SNAP_MS = 400;
let snapT = 0, snapLast = 0, snapping = false, lastBitmap = null;
function stopTileTo3d(done = true) {   // done：三维页已经接管画面（之后 viewer.close() 会释放解码内存）
  if (!snapping) return;
  snapping = false; clearInterval(snapT); snapT = 0;
  if (!done) { try { lastBitmap?.close?.(); } catch (e) {} lastBitmap = null; }
}
async function snapshot2d() {
  const cv = viewer?.drawer?.canvas;
  if (!cv?.width || !cv?.height || typeof createImageBitmap !== 'function') return null;
  const now = performance.now();
  if (now - snapLast < SNAP_MS) return null;   // 节流：转场期间最多每 400 ms 一张
  snapLast = now;
  try { const bmp = await createImageBitmap(cv); try { lastBitmap?.close?.(); } catch (e) {} lastBitmap = bmp; return bmp; }
  catch (e) { return null; }
}
function postBackdrop(f) {
  const bmp = lastBitmap; if (!bmp) return false;
  lastBitmap = null;
  try { f.contentWindow?.postMessage({ type: 'v3d:backdrop', bitmap: bmp }, SUB_ORIGIN, [bmp]); return true; }
  catch (e) { try { bmp.close?.(); } catch (x) {} return false; }   // 传不过去就自己关掉，不留位图
}
/** 打开三维页期间把底图快照持续递过去；拿到 ready（或页面被换掉）就停 */
function startTileTo3d(f) {
  stopTileTo3d(false);
  snapping = true;
  const tick = () => { if (!snapping) return; snapshot2d().then(b => { if (b) postBackdrop(f); }).catch(() => {}); };
  tick();
  viewer?.addHandler?.('tile-drawn', tick);
  snapT = setInterval(tick, SNAP_MS);
  stopTileTo3d = done => {
    if (!snapping) return;
    snapping = false; clearInterval(snapT); snapT = 0;
    try { viewer?.removeHandler?.('tile-drawn', tick); } catch (e) {}
    if (!done) { try { lastBitmap?.close?.(); } catch (e) {} lastBitmap = null; }
  };
}
// 本次会话里庄园三维加载失败过：之后「自动跳到当前地点」不再进庄园，改落上层的伊甸地标（记在会话存储，重试成功后清掉）
const EST_FAIL_KEY = 'edenMapEstateFail';
export let estFail = TCStore.get(EST_FAIL_KEY) === '1';
export const setEstFail = on => { estFail = on; on ? TCStore.set(EST_FAIL_KEY, '1') : TCStore.remove(EST_FAIL_KEY); };
// 三维页的「平面替身」：节点树里它（或包着它的地方）落在平面图上的位置（上层的「伊甸庄园」地标）
export const estateStandIn = standIn;
const THREE_CDN = /https:\/\/cdn\.(?:jsdelivr\.net|jsdmirror\.com)\/npm\/three@0\.160\.0\//g;
// 注入庄园页的小脚本：模块脚本（main.js 或它 import 的三维库）加载失败时回传 estate:fail
const EST_HOOK = `<script>(function(){var f=0;function fail(r){if(f)return;f=1;try{parent.postMessage({type:'estate:fail',reason:r},'*')}catch(e){}}` +
  `addEventListener('error',function(e){var t=e.target;if(t&&t.tagName==='SCRIPT')fail('script')},true);` +
  `addEventListener('unhandledrejection',function(e){var m=String(e.reason&&e.reason.message||e.reason||'');if(/import|module|fetch/i.test(m))fail('import')})})()<\/script>`;
function estateActs(state) {   // state: '' 隐藏；'slow' 仍在加载；'fail' 失败
  const ld = $('#loading'), acts = ld.querySelector('.acts'), ti = nm(REG.maps[cur] || {}, 'title');
  acts.hidden = !state; $('#estRetry').hidden = $('#estPlan').hidden = false; $('#tileRetry').hidden = true;
  if (state === 'slow') lp().slow(tx('estate.slow', '庄园三维模型加载较慢…可以继续等，或先看平面图'));
  if (state === 'fail') { lp().fail(tx('estate.failed', '庄园三维模型加载失败：当前网络连不上三维库')); ld.classList.remove('done'); }
  if (state) { ld.classList.add('over'); announce(ld.querySelector('span').textContent); }
}
export function retryEstate() { const id = cur, m = REG.maps[id]; if (m?.kind !== 'estate') return; setEstFail(false); stopTileTo3d(false); release3d(); openEstate(id, m, true); }
export function estatePlan() {   // 看平面图：回上层并聚焦伊甸（打开它的地点卡）；本次会话不再自动进庄园（庄园挂起时每次都会再等 12 秒）
  const s = estateStandIn(cur); if (!s) return; setEstFail(true); setPendingFocus(s.marker); go(s.map);
}
export async function openEstate(id, m, hadPrev) {
  document.body.classList.add('estate'); renderNav();
  if (estParked?.id === id) {   // 从休眠里接回来：取消隐藏、恢复渲染，走一遍 ready 之后的同步
    est = estParked; estParked = null; const f = est.frame; f.style.visibility = ''; live3d = 1;
    $('#loading').classList.add('done'); estateActs('');
    f.contentWindow?.postMessage({ type: 'estate:resume' }, SUB_ORIGIN);
    applyCredit(m);   // 署名（ⓘ）：没有署名词条时收起来，不留空框（任务三）
    estateLook(); estateInset(); estateRoom(); estateFocusPending(); focusAfterGo(); postState(); post({ type: 'eden-map:loaded' });
    return;
  }
  // Part 3 §3：发新租约前把上一份彻底摘掉（挂起的、淡出中的都算），保证任何时刻只有一个活着的三维上下文
  if (estParked?.id !== id) { stopTileTo3d(false); release3d(); }
  applyCredit(m);   // 署名（ⓘ）：没有署名词条时收起来，不留空框（任务三）
  const ld = $('#loading'), ti = nm(m, 'title'); ld.classList.remove('done', 'thumb'); ld.classList.remove('over'); estateActs('');   // v0.9.6：三维页加载时用整屏加载页，不再露出上一张图 + 一个「加载中」小条
  if (m.cover) { ld.style.setProperty('--loading-cover', `url(${matchMedia('(max-width: 600px)').matches ? m.cover.src_800 || m.cover.src : m.cover.src})`); ld.classList.add('cover'); }
  else { ld.classList.remove('cover'); ld.style.removeProperty('--loading-cover'); }
  lp().reset(tx('estate.loading', `加载 ${ti}…`, { title: ti }));   // fix3：统一进度组件——先不确定（已用时间），三维页报来字节进度后显示百分比
  postState();
  const url = new URL(m.viewer3d ? 'props/viewer3d.html' : m.src, document.baseURI).href;   // viewer3d：通用三维查看器 + props/<id>/manifest.json（见 v3d 段）
  let html;
  for (let i = 0; i < 2 && !html; i++) { try { html = await getText(url); } catch (e) { textCache.delete(url); if (!i) await new Promise(r => setTimeout(r, 400)); } }   // 预热失败过一次也再试一次（接手 review P1）
  if (cur !== id) return;
  if (!html) { estateActs('fail'); lp().fail(tx('estate.fail', '庄园页面加载失败')); return; }
  const old = est?.frame; if (old && old.parentNode) old.remove(); weak3d = old || null;   // 旧帧留个引用：新页面一就绪就摘（不等淡出）
  const f = document.createElement('iframe'); f.id = 'estate'; f.title = nm(m, 'title');
  const vend = new URL('vendor/', url).href;
  // 用 blob: 地址而不是 srcdoc：Tauri Tavern 的 WKWebView 里第三层 srcdoc iframe（宿主 → 查看器 srcdoc → 庄园）永远不加载（TT 实测 P0）。
  // blob 由查看器自己的窗口创建（同源），<base> 照旧，相对资源按线路解析；加载完就回收。
  const packStr = PACK?.strings, hasStr = packStr && Object.keys(packStr).length;
  const doc = html.replace(/<head>/i, `<head><base href="${new URL('.', url).href}">${EST_HOOK}<script>window.__packId=${JSON.stringify(PACK?.id || 'eden')}<\/script>${hasStr ? `<script>window.__packStrings=${JSON.stringify(packStr).replace(/</g, '\\u003c')}<\/script>` : ''}${m.viewer3d ? `<script>window.__V3D_MODEL=${JSON.stringify(String(m.viewer3d))}<\/script>` : ''}`)
    .replace(/(["'])https:\/\/cdn\.(?:jsdelivr\.net|jsdmirror\.com)\/npm\/three@0\.160\.0\/build\/three\.module(?:\.min)?\.js\1/g, `$1${vend}three.module.min.js$1`)
    .replace(new RegExp(THREE_CDN.source + 'examples\\/jsm\\/', 'g'), vend + 'jsm/');
  const blob = URL.createObjectURL(new Blob([doc], { type: 'text/html' })); f.src = blob;
  f.addEventListener('load', () => { setTimeout(() => URL.revokeObjectURL(blob), 0); if (est?.frame === f) { estateLook(); startTileTo3d(f); } });   // 首帧前就带上语言与主题，并开始递底图
  $('#stage').appendChild(f);
  est = { id, frame: f, ready: false };
  live3d = 1;
  // 12 秒还没画出第一帧：给出路（重试 / 看平面图），庄园继续在后台加载，画好了照常切过去
  setTimeout(() => { if (est?.frame === f && f.isConnected && !est.ready && !est.failed) estateActs('slow'); }, 12000);
}
function onEstateFail(reason) {
  if (!est || est.ready) return;
  stopTileTo3d(false);
  if (reason === 'timeout') return estateActs('slow');   // 只是慢（庄园页自己的超时），不说成「连不上三维库」（E5 r2 弱网 W4）
  est.failed = true; setEstFail(true); estateActs('fail');
}
function onEstateReady() {
  const f = est.frame; est.ready = true; if (estFail) setEstFail(false);
  if (weak3d && weak3d !== f) { try { weak3d.remove(); } catch (e) {} weak3d = null; }   // 上一份租约在这里收尾
  stopTileTo3d(true);   // 三维页已经接管画面：不再上传底图快照
  f.classList.add('on'); estateActs(''); lp().done(); $('#loading').classList.add('done'); focusAfterGo();
  estateLook(); estateInset(); estateRoom(); estateFocusPending(); estateStash(); estateNpcs();
  post({ type: 'eden-map:loaded' });
  // 庄园淡入完成后再关掉瓦片地图（释放解码内存）
  setTimeout(() => { if (est?.frame === f && REG.maps[cur]?.kind === 'estate') { viewer.close(); untrackAll(); viewer.clearOverlays(); } }, 240);
}
// 离开庄园：返回 iframe，由调用方在新底图画出来后淡出移除
export function leaveEstate() {
  document.body.classList.remove('estate'); estateActs('');
  try { setFpsMeter(window.TCStore?.get('edenMapFps') === '1'); } catch (e) {}   // 三维子页关掉了，外层顶栏那份 FPS 读数回来（配 estateLook 的 setFpsMeter(false)）
  if (!est) return null;
  stopTileTo3d(false);
  const f = est.frame, ready = est.ready; est = null; live3d = 0;
  if (weak3d === f) weak3d = null;
  if (!ready) { f.remove(); return null; }
  return f;   // 调用方（nav.go）在新底图画出来后淡出移除；新的三维租约会在 release3d 里把它提前摘掉
}
function estateInset() {
  if (!est?.ready) return;
  est.frame.contentWindow?.postMessage({ type: 'estate:inset', left: 6 }, SUB_ORIGIN);   // UI v2：三维页自带控制列与抽屉，查看器在庄园时不放层切换器
}
export const narrowNow = () => innerWidth <= 640;
// 庄园页的语言与主题跟着查看器（庄园页在 srcdoc 里读不到 URL 参数，所以载入后与切换时发消息）
export function estateLook() {
  const w = est?.frame.contentWindow; if (!w) return;
  w.postMessage({ type: 'estate:lang', lang: LANG }, SUB_ORIGIN);
  w.postMessage({ type: 'estate:theme', theme: document.documentElement.classList.contains('light') ? 'light' : 'dark' }, SUB_ORIGIN);
  w.postMessage({ type: 'estate:quality', q: q3Pref() }, SUB_ORIGIN);   // 改画质不用重载
  w.postMessage({ type: 'estate:cvd', mode: TCCvd.mode() }, SUB_ORIGIN);   // 色觉模式（E7）：庄园 / 三维页换配色，不重载
  let fps = false; try { fps = window.TCStore?.get('edenMapFps') === '1'; } catch (e) {}
  w.postMessage({ type: 'estate:fps', on: fps }, SUB_ORIGIN);   // 调试：显示帧率——三维子页自己画一份（画布角上，带 tier / draws），开着子页时外层顶栏那份就该让位，不然同时看到两个数字（U，2026-09-28）
  setFpsMeter(false);
  w.postMessage({ type: 'estate:children', zones: estateZones(est.id) }, SUB_ORIGIN);   // 区域下的子地图（运行时节点树）：三维页据此给区域卡加「进入三维」，语言切换时标题跟着重发
  w.postMessage({ type: 'estate:chat', id: chatId || '' }, SUB_ORIGIN);   // 房间图集「按聊天」作用域用：庄园页读不到 SillyTavern 上下文，靠这条消息拿 chatId
}
// Part 8-1：世界藏物表下发给三维页（宿主 → 查看器 app/loot.mjs → 庄园）；已在手里的 id 一并下发给它对账。
// 三维页据此在房间 / 区域里放发光道具，点起来回 estate:loot，这里转成 eden-map:loot 交给宿主写背包。
export function estateStash() {
  const w = est?.frame?.contentWindow; if (!w) return;
  w.postMessage({ type: 'estate:stash', items: window.TCLoot?.all?.() || [] }, SUB_ORIGIN);
  w.postMessage({ type: 'estate:taken', ids: (P.TCInv?.rows || []).map(r => r.id).filter(Boolean) }, SUB_ORIGIN);
}
// Part 8-2：日程表 + 起点时钟下发给三维页（宿主 → 查看器 app/wander.mjs → 庄园）。
// 三维页用同一套 core/walk.mjs 自己推进世界时刻，把人挪到下一段该在的地方（三维坐标插值，不瞬移）。
export function estateNpcs() {
  const w = est?.frame?.contentWindow; if (!w) return;
  const d = window.TCWander?.describe?.() || {};
  w.postMessage({ type: 'estate:routine', schedule: window.TCWander?.scheduleOf?.() || null, clock: d.clock || null }, SUB_ORIGIN);
}
// S2-B：三维页里区域下的子地图 { 区域 id: [{ node, title }] }；从子地图返回（面包屑 / 上一级带 data-focus）时把落点区域聚焦
const estateZones = id => Object.fromEntries(Object.entries(zoneChildren(id)).map(([z, ks]) => [z, ks.map(k => ({ node: k, title: nm(REG.maps[k], 'title') }))]));
function estateFocusPending() { const f = pendingFocus; if (f) { setPendingFocus(null); estateFocus(f); } }
/**
 * 任务三：把某个名字交给三维页聚焦（地点卡里的【进入三维视口】指到的就是当前这张三维图时用）。
 * 三维页自己按房间名 / 别名 / 热点找人，找不到就安静不动。没开 / 没就绪 → false。
 */
export function estateFocus(name) {
  const n = String(name ?? '').trim();
  if (!est?.ready || !n) return false;
  est.frame.contentWindow?.postMessage({ type: 'estate:room', name: n }, SUB_ORIGIN);
  return true;
}
export let estFocus = null;   // v0.9.5：「自定义」里点了某个房间 / 室外区域 → 庄园聚焦它（优先于当前地点，地点变了就清掉）
export function estateRoom() { if (!est?.ready) return; const v = ($('#here').value || '').replace('{{user}}', ''), r = hereRes(v);
  // v0.9.6：卡设定分层房间（r.std + r.floor）→ 按 { room, floor } 落点：庄园页切到该层并画框（受限房间只画素框）
  const cr = !estFocus && r?.std && r.floor ? estPlan?.rooms?.find(x => x.floor === r.floor && x.name === r.std) : null;
  const cc = cr ? { name: cr.name, floor: cr.floor, kind: cr.kind, area: cr.area, poly: cr.poly, z: (estPlan.floors.find(f => f.id === cr.floor) || {}).z } : null;
  est.frame.contentWindow?.postMessage({ type: 'estate:room', name: estFocus || (cc ? cc.name : r?.custom ? r.room : v), card: estFocus && window.estCard?.name === estFocus ? window.estCard : cc }, SUB_ORIGIN); }   // 自定义叫法：庄园页收到的是对应的标准房间名
window.TC3d = { live: () => live3d, release: release3d, snapping: () => snapping, stopSnap: stopTileTo3d, SNAP_MS };   // Part 3 §3：三维租约自检（tests / 浏览器探针）
window.addEventListener('message', e => {
  if (!est || e.source !== est.frame.contentWindow || (PR && !PR.accept(e.data, '（子页 → 查看器）'))) return;
  if (e.data?.type === 'estate:ready') onEstateReady();
  if (e.data?.type === 'estate:go' && typeof e.data.node === 'string' && Object.values(zoneChildren(est.id)).flat().includes(e.data.node)) go(e.data.node);   // 只认当前三维页区域下的子地图
  if (e.data?.type === 'estate:fail') onEstateFail(e.data.reason);
  if (e.data?.type === 'estate:progress' && !est.ready) lp().set(e.data.loaded, e.data.total, 'bytes');   // fix3：glb 字节进度
  // Part 3 §5：三维页报「内存 / 显存吃紧」→ 收紧 OSD 的解码瓦片缓存（只减不增，避免来回抖）
  if (e.data?.type === 'v3d:viewport' && Number.isFinite(e.data.tileCache)) {
    const n = Math.max(4, e.data.tileCache | 0);
    if (n < lastTileCache) { lastTileCache = n; try { trimTileCache(n); } catch (err) {} }
  }
  if (e.data?.type === 'estate:key' && e.data.key === 'Escape') onEsc();
  else if (e.data?.type === 'estate:key') stepLayer({ PageUp: -1, '[': -1, PageDown: 1, ']': 1 }[e.data.key] || 0);
  // Part 8-1：三维里点起了一枚发光道具 → 交给宿主写背包 + 按设置注入一句（与二维发光点同一条 eden-map:loot）
  if (e.data?.type === 'estate:loot' && typeof e.data.id === 'string') {
    post({ type: 'eden-map:loot', id: e.data.id, name: String(e.data.name || ''), map: cur, place: String(e.data.place || ''), hidden: !!e.data.hidden });
  }
});
// 藏物表 / 背包有更新：庄园开着就再推一次（拿到手的东西从三维里消失）
busOn({ key: 'estate.lootMsg', type: 'message', fn: e => {
  if (!window.__fromHost?.(e)) return;
  const t = e.data?.type;
  if (t === 'eden-map:stash' || t === 'eden-map:inv') setTimeout(estateStash, 0);
  if (t === 'eden-map:routine' || t === 'eden-map:clock') setTimeout(estateNpcs, 0);   // 日程 / 时刻变了：三维里的人重新站位
} });
addEventListener('resize', () => estateInset());
// ---------------- 通用三维查看器（props/viewer3d.html，maps.json 里带 viewer3d 的 kind=estate 地图） ----------------
// EdenMap.flyTo({ map, hotspot })：切到该图（没开就先切），查看器就绪后发 v3d:fly；hotspot = 清单 hotspots[].id。
let v3dPending = null;
export function v3dFly({ map, hotspot } = {}) {
  if (!REG?.maps[map]?.viewer3d) return false;
  if (cur === map && est?.ready) { est.frame.contentWindow?.postMessage({ type: 'v3d:fly', hotspot }, SUB_ORIGIN); return true; }
  v3dPending = hotspot || null; go(map); return true;
}
window.addEventListener('message', e => { if (e.data?.type !== 'estate:ready' || !est || e.source !== est.frame.contentWindow || !v3dPending) return;
  est.frame.contentWindow.postMessage({ type: 'v3d:fly', hotspot: v3dPending }, SUB_ORIGIN); v3dPending = null; });
export function setEstFocus(v) { return (estFocus = v); }
export function setEstParked(v) { return (estParked = v); }
export function setEst(v) { return (est = v); }
