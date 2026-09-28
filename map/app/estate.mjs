// 庄园 / 三维子页宿主：openEstate（blob iframe + <base> + 失败钩子）、子页消息、通用三维查看器入口。
import { REG, cur, pendingFocus, setPendingFocus, viewer } from './state.mjs';
import { $, PR, SUB_ORIGIN, announce, post, tx } from './util.mjs';
import { LANG, nm, postState } from './i18n.mjs';
import { getText, textCache } from './topbar.mjs';
import { go } from './nav.mjs';
import { focusAfterGo, onEsc, renderNav, stepLayer } from './layers.mjs';
import { untrackAll } from './markers.mjs';
import { estPlan, hereRes } from './locate.mjs';
import { q3Pref, showSet } from './settings.mjs';
import * as TCCvd from './cvd.mjs';
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
// 本次会话里庄园三维加载失败过：之后「自动跳到当前地点」不再进庄园，改落上层的伊甸地标（记在会话存储，重试成功后清掉）
const EST_FAIL_KEY = 'edenMapEstateFail';
export let estFail = TCStore.get(EST_FAIL_KEY) === '1';
export const setEstFail = on => { estFail = on; on ? TCStore.set(EST_FAIL_KEY, '1') : TCStore.remove(EST_FAIL_KEY); };
// 庄园的「平面替身」：链接到它的那个地标（上层的「伊甸庄园」）
export function estateStandIn(eid) {
  for (const [k, L] of Object.entries(REG.maps)) for (const [mk, v] of Object.entries(L.markers || {})) if (v.link?.map === eid && L.status !== 'planned') return { map: k, marker: mk };
  return null;
}
const THREE_CDN = /https:\/\/cdn\.(?:jsdelivr\.net|jsdmirror\.com)\/npm\/three@0\.160\.0\//g;
// 注入庄园页的小脚本：模块脚本（main.js 或它 import 的三维库）加载失败时回传 estate:fail
const EST_HOOK = `<script>(function(){var f=0;function fail(r){if(f)return;f=1;try{parent.postMessage({type:'estate:fail',reason:r},'*')}catch(e){}}` +
  `addEventListener('error',function(e){var t=e.target;if(t&&t.tagName==='SCRIPT')fail('script')},true);` +
  `addEventListener('unhandledrejection',function(e){var m=String(e.reason&&e.reason.message||e.reason||'');if(/import|module|fetch/i.test(m))fail('import')})})()<\/script>`;
function estateActs(state) {   // state: '' 隐藏；'slow' 仍在加载；'fail' 失败
  const ld = $('#loading'), acts = ld.querySelector('.acts'), ti = nm(REG.maps[cur] || {}, 'title');
  acts.hidden = !state; $('#estRetry').hidden = $('#estPlan').hidden = false; $('#tileRetry').hidden = true;
  if (state === 'slow') ld.querySelector('span').textContent = tx('estate.slow', '庄园三维模型加载较慢…可以继续等，或先看平面图');
  if (state === 'fail') { ld.querySelector('span').textContent = tx('estate.failed', '庄园三维模型加载失败：当前网络连不上三维库'); ld.classList.remove('done'); }
  if (state) { ld.classList.add('over'); announce(ld.querySelector('span').textContent); }
}
export function retryEstate() { const id = cur, m = REG.maps[id]; if (m?.kind !== 'estate') return; setEstFail(false); est?.frame.remove(); est = null; openEstate(id, m, true); }
export function estatePlan() {   // 看平面图：回上层并聚焦伊甸（打开它的地点卡）；本次会话不再自动进庄园（庄园挂起时每次都会再等 12 秒）
  const s = estateStandIn(cur); if (!s) return; setEstFail(true); setPendingFocus(s.marker); go(s.map);
}
export async function openEstate(id, m, hadPrev) {
  document.body.classList.add('estate'); renderNav();
  if (estParked?.id === id) {   // 从休眠里接回来：取消隐藏、恢复渲染，走一遍 ready 之后的同步
    est = estParked; estParked = null; const f = est.frame; f.style.visibility = '';
    $('#loading').classList.add('done'); estateActs('');
    f.contentWindow?.postMessage({ type: 'estate:resume' }, SUB_ORIGIN);
    $('#credit').textContent = $('#credit').title = nm(m, 'credit'); $('#creditBtn').hidden = !nm(m, 'credit');
    estateLook(); estateInset(); estateRoom(); focusAfterGo(); postState(); post({ type: 'eden-map:loaded' });
    return;
  }
  dropParked();
  $('#credit').textContent = $('#credit').title = nm(m, 'credit'); $('#creditBtn').hidden = !nm(m, 'credit'); window.__creditShow?.(false);
  const ld = $('#loading'), ti = nm(m, 'title'); ld.classList.remove('done', 'thumb'); ld.classList.remove('over'); estateActs('');   // v0.9.6：三维页加载时用整屏加载页，不再露出上一张图 + 一个「加载中」小条
  if (m.cover) { ld.style.setProperty('--loading-cover', `url(${matchMedia('(max-width: 600px)').matches ? m.cover.src_800 || m.cover.src : m.cover.src})`); ld.classList.add('cover'); }
  else { ld.classList.remove('cover'); ld.style.removeProperty('--loading-cover'); }
  ld.querySelector('span').textContent = tx('estate.loading', `加载 ${ti}…`, { title: ti });
  postState();
  const url = new URL(m.viewer3d ? 'props/viewer3d.html' : m.src, document.baseURI).href;   // viewer3d：通用三维查看器 + props/<id>/manifest.json（见 v3d 段）
  let html;
  for (let i = 0; i < 2 && !html; i++) { try { html = await getText(url); } catch (e) { textCache.delete(url); if (!i) await new Promise(r => setTimeout(r, 400)); } }   // 预热失败过一次也再试一次（接手 review P1）
  if (cur !== id) return;
  if (!html) { estateActs('fail'); ld.querySelector('span').textContent = tx('estate.fail', '庄园页面加载失败'); return; }
  const old = est?.frame; if (old && old.parentNode) old.remove();
  const f = document.createElement('iframe'); f.id = 'estate'; f.title = nm(m, 'title');
  const vend = new URL('vendor/', url).href;
  // 用 blob: 地址而不是 srcdoc：Tauri Tavern 的 WKWebView 里第三层 srcdoc iframe（宿主 → 查看器 srcdoc → 庄园）永远不加载（TT 实测 P0）。
  // blob 由查看器自己的窗口创建（同源），<base> 照旧，相对资源按线路解析；加载完就回收。
  const doc = html.replace(/<head>/i, `<head><base href="${new URL('.', url).href}">${EST_HOOK}${m.viewer3d ? `<script>window.__V3D_MODEL=${JSON.stringify(String(m.viewer3d))}<\/script>` : ''}`)
    .replace(/(["'])https:\/\/cdn\.(?:jsdelivr\.net|jsdmirror\.com)\/npm\/three@0\.160\.0\/build\/three\.module(?:\.min)?\.js\1/g, `$1${vend}three.module.min.js$1`)
    .replace(new RegExp(THREE_CDN.source + 'examples\\/jsm\\/', 'g'), vend + 'jsm/');
  const blob = URL.createObjectURL(new Blob([doc], { type: 'text/html' })); f.src = blob;
  f.addEventListener('load', () => { setTimeout(() => URL.revokeObjectURL(blob), 0); if (est?.frame === f) estateLook(); });   // 首帧前就带上语言与主题，少闪一下
  $('#stage').appendChild(f);
  est = { id, frame: f, ready: false };
  // 12 秒还没画出第一帧：给出路（重试 / 看平面图），庄园继续在后台加载，画好了照常切过去
  setTimeout(() => { if (est?.frame === f && f.isConnected && !est.ready && !est.failed) estateActs('slow'); }, 12000);
}
function onEstateFail(reason) {
  if (!est || est.ready) return;
  if (reason === 'timeout') return estateActs('slow');   // 只是慢（庄园页自己的超时），不说成「连不上三维库」（E5 r2 弱网 W4）
  est.failed = true; setEstFail(true); estateActs('fail');
}
function onEstateReady() {
  const f = est.frame; est.ready = true; if (estFail) setEstFail(false);
  f.classList.add('on'); estateActs(''); $('#loading').classList.add('done'); focusAfterGo();
  estateLook(); estateInset(); estateRoom();
  post({ type: 'eden-map:loaded' });
  // 庄园淡入完成后再关掉瓦片地图（释放解码内存）
  setTimeout(() => { if (est?.frame === f && REG.maps[cur]?.kind === 'estate') { viewer.close(); untrackAll(); viewer.clearOverlays(); } }, 240);
}
// 离开庄园：返回 iframe，由调用方在新底图画出来后淡出移除
export function leaveEstate() {
  document.body.classList.remove('estate'); estateActs('');
  if (!est) return null;
  const f = est.frame, ready = est.ready; est = null;
  if (!ready) { f.remove(); return null; }
  return f;
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
  w.postMessage({ type: 'estate:fps', on: fps }, SUB_ORIGIN);   // 调试：显示帧率——庄园页 / props 查看器各自画在自己的画布角上
}
export let estFocus = null;   // v0.9.5：「自定义」里点了某个房间 / 室外区域 → 庄园聚焦它（优先于当前地点，地点变了就清掉）
export function estateRoom() { if (!est?.ready) return; const v = ($('#here').value || '').replace('{{user}}', ''), r = hereRes(v);
  // v0.9.6：卡设定分层房间（r.std + r.floor）→ 按 { room, floor } 落点：庄园页切到该层并画框（受限房间只画素框）
  const cr = !estFocus && r?.std && r.floor ? estPlan?.rooms?.find(x => x.floor === r.floor && x.name === r.std) : null;
  const cc = cr ? { name: cr.name, floor: cr.floor, kind: cr.kind, area: cr.area, poly: cr.poly, z: (estPlan.floors.find(f => f.id === cr.floor) || {}).z } : null;
  est.frame.contentWindow?.postMessage({ type: 'estate:room', name: estFocus || (cc ? cc.name : r?.custom ? r.room : v), card: estFocus && window.estCard?.name === estFocus ? window.estCard : cc }, SUB_ORIGIN); }   // 自定义叫法：庄园页收到的是对应的标准房间名
window.addEventListener('message', e => {
  if (!est || e.source !== est.frame.contentWindow || (PR && !PR.accept(e.data, '（子页 → 查看器）'))) return;
  if (e.data?.type === 'estate:ready') onEstateReady();
  if (e.data?.type === 'estate:fail') onEstateFail(e.data.reason);
  if (e.data?.type === 'estate:key' && e.data.key === 'Escape') onEsc();
  else if (e.data?.type === 'estate:key') stepLayer({ PageUp: -1, '[': -1, PageDown: 1, ']': 1 }[e.data.key] || 0);
});
addEventListener('resize', () => estateInset());
// ---------------- 通用三维查看器（props/viewer3d.html，maps.json 里带 viewer3d 的 kind=estate 地图） ----------------
// 测试入口：maps.json 里 test: true 的 viewer3d 地图，在设置弹层底部各放一个按钮（不进层切换器、不参与当前地点匹配）。
// EdenMap.flyTo({ map, hotspot })：切到该图（没开就先切），查看器就绪后发 v3d:fly；hotspot = 清单 hotspots[].id。
let v3dPending = null;
export function v3dEntries() {
  if (!REG) return;
  for (const [id, m] of Object.entries(REG.maps)) { if (!m.test || !m.viewer3d) continue;
    let b = document.getElementById('v3dTest_' + id);
    if (!b) { b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.id = 'v3dTest_' + id; b.style.marginTop = 'var(--sp-4)';
      b.onclick = () => { showSet(false); go(id); }; $('#v3dTests').appendChild(b); }
    b.textContent = nm(m, 'title'); }
}
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
