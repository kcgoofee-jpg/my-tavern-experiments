// 宿主消息接口：来源 / 令牌检查、协议校验、按类型分派。
import { REG, cur, setCur, setSleeping, sleeping, viewer } from './state.mjs';
import { $ } from './dom-helpers.mjs';
import { PR, SUB_ORIGIN } from './protocol-stamp.mjs';
import { lean } from './sharpness-tiers.mjs';
import { setLang } from './i18n.mjs';
import { setSlowStop, slowStop, slowWarmAlt } from './topbar.mjs';
import { go, saveView, applyPeriod } from './map-switch.mjs';
import { dropParked, est, estFocus, estParked, estateLook, narrowNow, setEst, setEstFocus, setEstParked } from './subpage3d-host.mjs';
import { onEsc } from './map-level-nav.mjs';
import { untrackAll } from './markers.mjs';
import { hereRes, markHere, startInScene, userMoved } from './locate.mjs';
import { SettingsApi, setLine, about, renderAbout, renderSelfCheck, selfCheck, setAbout, setCardInfo, setSelfCheck, setUpdBusy, setUpdRes, updBusy, updRes, updSub } from './settings.mjs';
import { emEmit, setChat } from './extension-api.mjs';
import { flashOk } from './status-dot.mjs';
import { ntActs } from './notice-layer.mjs';
import { P } from './plugins.mjs';
import { busOn } from './bus.mjs';
// 嵌入酒馆（悬浮按钮面板）的消息接口：
//   酒馆 → 地图：eden-map:here {value}（当前地点）、eden-map:open {map}（直接打开某张地图）
//   地图 → 酒馆：eden-map:ready（可以撤掉加载遮罩）、eden-map:state {map, title}（当前地图，用于面板标题）
// 只认宿主：parent，或带宿主令牌的消息（宿主可能是挂着脚本的另一个 iframe）；外挂脚本（compose.js 等）共用这一个判断
function fromHost(e) {
  if (window.top === window || !e?.data) return false;
  if (e.origin && e.origin !== 'null' && e.origin !== self.origin) return false;   // v2：同源（srcdoc / 宿主同一 origin）
  if (e.source === window.parent) return true;
  const tok = (() => { try { return window.__edenHostToken || null; } catch (x) { return null; } })();
  return !!tok && e.data.t === tok;
}
window.__isFromHost = fromHost;
/**
 * 任务三（b）「人已经在庄园里就别再从宏观世界层过一遍」：宿主第一次推地点时若落点在三维场景
 * （庄园房间 / 室外区域）里，就直接下钻过去（楼层剖切由庄园页按地点自己做）。
 * 三个闸门把范围收紧到「启动那一次」，不打扰用户：
 *   ① 只给一次机会（sceneDrilled）；② 只在地图真的开着、且还停在初始世界图上时（后台休眠时 cur 为空 → 自动跳过，
 *   预加载不进三维，尊重 E4 N02 的省流决定）；③ 玩家自己动过视角 / 切过图就不再跳。
 */
let sceneDrilled = false;
function trySceneDrill(value) {
  if (sceneDrilled || userMoved || !cur || cur !== REG?.start) return;
  sceneDrilled = true;
  startInScene(value);
}
if (window.top !== window) {
  document.body.classList.add('embed');   // viewer.html 末尾的前置脚本已经打过；单独加载本模块（测试）时也成立
  const onHostMsg = e => {
    // 只认宿主（2026-09-27 接手 review P1）：以前任何同源窗口都能改当前地点、强制切图、注入假数据。
    // 宿主可能是 window.parent（脚本跑在顶层页），也可能是宿主页里挂着脚本的另一个 iframe（外挂脚本挂在卡片 iframe 里）——
    // 所以除了 parent，还认宿主写在查看器窗口上的令牌（eden-map.js 的 HOST_TOKEN）。同源脚本理论上能去读那个属性，
    // 这里是「挡住无意/顺手来一发」而不是同源隔离，真正的隔离要靠酒馆本身。
    if (!fromHost(e) || (PR && !PR.accept(e.data, '（宿主 → 查看器）'))) return;
    // bg = 酒馆在后台预加载（面板不可见）：不进庄园，也不消耗「打开后第一次一定跳」的资格
    if (e.data?.type === 'eden-map:here') { if (($('#here').value || '') !== (e.data.value || '')) setEstFocus(null); $('#here').value = e.data.value || '';
      try { if (e.data.replay) P.FogApi?.mute?.(true); } catch (x) {}   // 时间轴回放（Part 5-4）：图钉照走，探索不记账
      markHere(e.data.value);
      try { if (e.data.replay) P.FogApi?.mute?.(false); } catch (x) {}
      emEmit('here', { value: e.data.value || '', resolved: hereRes(e.data.value || ''), replay: !!e.data.replay });
      trySceneDrill(e.data.value); }   // 任务三（b）：人已经在三维场景里 → 这一次跳过宏观世界层
    if (e.data?.type === 'eden-map:unmapped-pick' && typeof P.UnmappedPlacePicker !== 'undefined') P.UnmappedPlacePicker.open();   // v0.9.6 标题栏「未上图」
    if (e.data?.type === 'eden-map:open') go(e.data.map);
    if (e.data?.type === 'eden-map:events') { P.EventsView.set(e.data); emEmit('events', { items: e.data.items, floor: e.data.floor, hereLayer: e.data.hereLayer }); }   // 卡内脚本从聊天里解析、合并好的事态 {items, floor, fly}
    if (e.data?.type === 'eden-map:chat') { setChat(e.data.id); estateLook(); }   // 聊天切换：庄园页（三维）里房间图集「仅本聊天」作用域用的 chatId 得跟着重发一次，不然还在用切换前那个聊天的 id（bug fix）
    if (e.data?.type === 'eden-map:lang' && ['zh', 'en'].includes(e.data.lang)) setLang(e.data.lang);   // v0.9.6：嵌入时语言以卡内脚本（标题栏）为准，两边只有一个设置
    if (e.data?.type === 'eden-map:about') { setAbout(e.data); renderAbout(); }   // v0.9.6 版本与检查更新
    if (e.data?.type === 'eden-map:cardinfo') setCardInfo(e.data.card);   // 任务四：角色卡信息（版权申明页）由卡内脚本经桥取来，面板不自己摸宿主全局
    if (e.data?.type === 'eden-map:update-result') { setUpdBusy(false); setUpdRes(e.data); renderAbout(); }
    if (e.data?.type === 'eden-map:chars') { P.CharactersView.set(e.data); emEmit('characters', { items: e.data.items, floor: e.data.floor }); }   // 人物栏（v0.9.2）
    if (e.data?.type === 'eden-map:custom') P.CustomNamesView.fromHost(e.data);   // v0.9.3：自定义名称与用途（聊天变量）
    if (e.data?.type === 'eden-map:inv' && typeof P.StashView !== 'undefined') P.StashView.fromHost(e.data);   // 空间化背包（Part 5-1）：地点卡「存放」行
    if (e.data?.type === 'eden-map:clock') { P.CustomNamesView.setClock(e.data); applyPeriod(); }   // 世界时间 → 夜色 / 多时段底图
    if (e.data?.type === 'eden-map:outfit') P.CustomNamesView.setOutfit(e.data);   // 主角着装 → 本人地点卡
    if (e.data?.type === 'eden-map:fly') P.CustomNamesView.flyTo(e.data.target);   // v0.9.5 EdenMap.flyTo(target)
    if (e.data?.type === 'eden-map:varmap' && typeof P.StatPathMappingView !== 'undefined') P.StatPathMappingView.set(e.data);   // v0.9.5 变量映射（换卡兼容）
    if (e.data?.type === 'eden-map:trips') P.TripsView.set(e.data.items || []);   // v0.9.5 最近的行程（卡内脚本从每楼的地点和人物标签推出）
    if (e.data?.type === 'eden-map:toast') P.CustomNamesView.toast(e.data.items || []);   // 剧情改名 / 用途的一次性提示
    if (e.data?.type === 'eden-map:selfcheck') { const first = !selfCheck; setSelfCheck(e.data); renderSelfCheck(); updSub(); if (first && !selfCheck.items?.some(i => i.status === 'warn')) flashOk(); }   // 自检全部正常：只在状态点闪一次 ✓（§3）
    if (e.data?.type === 'eden-map:hostbar') { const w = Math.max(0, Math.min(400, +e.data.w || 0)) + 'px', left = e.data.side === 'left' && narrowNow(); document.documentElement.style.setProperty('--hostbar-w', left ? '0px' : w); document.documentElement.style.setProperty('--hostbar-l', left ? w : '0px'); }   // 合并顶栏（§2.1）：宿主栏（地点胶囊 + ✕）浮在查看器顶栏右端
    if (e.data?.type === 'eden-map:key' && e.data.key === 'Escape') onEsc();   // 焦点在宿主页时宿主把 Esc 转过来（§10.14）
    if (e.data?.type === 'eden-map:line') setLine(e.data);   // fix3：线路行常驻，显示当前线路 / 自动或手动 / 不可切换的原因
    if (e.data?.type === 'eden-map:storage-result') window.renderStorageSettings?.(e.data);
    if (e.data?.type === 'eden-map:fog') window.FogApi?.set(e.data.explored);   // 迷雾探索：这个聊天到过的地点   // 线路选择在设置「高级」
    if (e.data?.type === 'eden-map:settings' && typeof e.data.page === 'string') SettingsApi.open(e.data.page);
    if (e.data?.type === 'eden-map:notice-act') { const a = ntActs[e.data.key]?.find(x => x.id === e.data.id); delete ntActs[e.data.key]; try { a?.run?.(); } catch (x) { console.warn('[地图] 通知按钮', x); } }   // 卡内脚本的启动自检结果（E6）   // 当前聊天 id：本机自定义叫法按聊天分开存（E6）
    // 面板关闭时休眠：关掉底图（释放已解码的瓦片），脚本与数据留着；再打开时唤醒，重新打开当前地图
    if (e.data?.type === 'eden-map:sleep' && viewer) { saveView(); setSleeping(cur || REG?.start || null); setCur(null); if (est?.ready && !lean()) { dropParked(); setEstParked(est); est.frame.style.visibility = 'hidden'; est.frame.contentWindow?.postMessage({ type: 'estate:pause' }, SUB_ORIGIN); } else est?.frame.remove(); setEst(null); document.body.classList.remove('estate'); viewer.close(); untrackAll(); viewer.clearOverlays(); setTimeout(() => { if (sleeping) slowWarmAlt(); }, 3000); }
    if (e.data?.type === 'eden-map:wake' && sleeping) { setSlowStop(true); const id = sleeping; setSleeping(null); go(id); if (e.data.fly) P.CustomNamesView.flyTo(e.data.fly); }   // 先开图再飞：fly 目标认不出时不会留下空舞台（接手 review P2）
    else if (e.data?.type === 'eden-map:wake') { markHere($('#here').value || ''); if (e.data.fly) P.CustomNamesView.flyTo(e.data.fly); }   // G3（P1）：不在休眠也响应（宿主在标签页切回前台时广播，docs/reviews/architecture_and_stream_perf.md §1.4）——当前地点标记重画一遍，其余图层由宿主紧随的数据推送刷新
  };
  busOn({ key: 'host.hostMsg', type: 'message', fn: onHostMsg });   // P2-3：登记进总线（键重复先摘旧的，卸载一把摘净）
  // 核心模块在地图库下载完才求值（以前内联脚本在解析期就挂好监听）：这之前宿主发来的消息由 viewer.html 末尾的前置脚本排队，这里按原顺序补处理
  const early = window.__bufferedHostMessages; window.__bufferedHostMessages = null;
  if (window.__hostMessageTap) window.removeEventListener('message', window.__hostMessageTap);
  for (const e of early || []) onHostMsg(e);
}
