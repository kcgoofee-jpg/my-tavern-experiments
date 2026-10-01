// 通知层与首次打开提示：嵌入时交给宿主统一显示，单独打开时自己渲染同一个组件 ui/notice.mjs（S5-2 自 shell.mjs 拆出，行为不变）。
// 本模块求值时有两个副作用：load 之后空闲时预取通知组件、挂 window.showNotice（启动顺序与拆分前一致：由 app/boot.mjs 经 i18n 的导入链最早求值）。
import { $, afterLoadIdle } from './dom-helpers.mjs';
import { post } from './protocol-stamp.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { LANG } from './i18n.mjs';
import { narrowNow } from './subpage3d-host.mjs';
import { SettingsApi } from './settings.mjs';
// ---------------- 通知（§3）：嵌入时交给宿主统一显示（eden-map:notice）；单独打开时自己渲染同一个组件 ui/notice.mjs ----------------
export let noticeLayer = null, noticeQueue = [];
const formBusy = () => { const a = document.activeElement; return !!a && !$('#setPop').hidden && $('#setPop').contains(a) && a.matches('input:not([type=checkbox]), textarea, select, [contenteditable]'); };
let ntLoad = null;
// 单独打开时通知组件不在首屏取：页面 load 后空闲时预取，或第一次 notify() 时取（v2b 冷开包体）；嵌入时由宿主渲染
afterLoadIdle(() => loadNotices());
function loadNotices() {
  if (window.top !== window || ntLoad) return; ntLoad = true;
  import(new URL('ui/notice.mjs', document.baseURI).href).then(m => {
    noticeLayer = m.createNotices({ doc: document, mount: document.body, baseCls: 'vw-nt', en: LANG === 'en', busy: formBusy, inertEls: () => [$('#app'), $('#setPop'), $('#layPop')],
      anchor: () => { const st = $('#stage').getBoundingClientRect(); return { left: st.left, top: st.top, width: st.width - (parseFloat(getComputedStyle($('#stage')).getPropertyValue('--rail-w-now')) || 0), height: st.height, top0: 0, bottom0: window.ViewerDrawer && !ViewerDrawer.el.hidden && ViewerDrawer.mode === 'sheet' ? ViewerDrawer.el.offsetHeight : 0, modal: true }; } });
    for (const n of noticeQueue.splice(0)) noticeLayer.push(n);
  }).catch(() => {});
}
function notify(n) {   // n = { key, level, title, lines, actions: [{ label, run | msg }] }
  if (window.top !== window) { n = { ...n, actions: (n.actions || []).map((a, i) => ({ ...a, id: a.id ?? 'a' + i })) };
    const { onClose, build, ...plain } = n; n = plain;   // 函数不能 postMessage（DataCloneError）；嵌入时由宿主渲染，关闭回调不跨窗口
    post({ type: 'eden-map:notice', n: { ...n, actions: n.actions.map(a => ({ label: a.label, primary: a.primary, id: a.id })) } }); if (n.actions.length) { ntActs[n.key] = n.actions; const ks = Object.keys(ntActs); if (ks.length > 20) delete ntActs[ks[0]]; } return; }
  if (noticeLayer) noticeLayer.push(n); else { noticeQueue.push(n); loadNotices(); }
}
export const ntActs = {};
export function noticeRefresh() { noticeLayer?.refresh(); if (window.top !== window) post({ type: 'eden-map:formbusy', on: formBusy() }); }
window.showNotice = notify;
// 大版本 2 · 产品：第一次打开时的三步提示（P1 横幅，可关；本机只出一次，edenMapHint）。?hint=1 强制再出（测试 / 截图）
export function firstRunHint() {
  let seen = false; try { seen = LocalStore.get('edenMapHint') === '1' && !/[?&]hint=1/.test(location.search); } catch (e) {}
  if (seen) return; const done = () => { try { LocalStore.set('edenMapHint', '1'); } catch (e) {} };
  const emb = window.top !== window;
  notify({ key: 'hint', level: 1, title: uiTextOr('hint.title', '三步上手'), onClose: done, lines: [
    uiTextOr('hint.1', '① 点地图上的地标看介绍；有三维模型的地点从卡片进三维视图。') + (emb ? uiTextOr('hint.1b', '卡片底部的「去这里」「追问这件事」只填进聊天输入框，不会替你发送。') : ''),
    uiTextOr('hint.2', '② 地图默认打开世界地图；想看你现在在哪，点「当前位置」跳过去并高亮；地点认不出时会显示「未上图」，点它就能放到地图上。'),
    (narrowNow() ? uiTextOr('hint.3', '③ 切层、标注、人物、三维画质都在设置里（手机上是右下角 ⋯）。') : uiTextOr('hint.3d', '③ 切层、标注、人物、三维画质都在右上角的设置里。')),
    uiTextOr('hint.4', '④ 改历史楼层 / 重生成：swipe、删楼、改楼、开分支地图都会自动重算；只有手改历史楼层里的位置文字不会回头重算（地图不跟着变）——改在最后一楼，或在那一楼开分支重生成。')],
    actions: [{ label: uiTextOr('hint.settings', '打开设置'), run: () => { done(); SettingsApi.open('home'); } }, { label: uiTextOr('hint.ok', '知道了'), primary: true, run: done }] });
  // 只有关掉或点了按钮才算看过；没理它，下次打开还会出（最多 3 次，之后不再打扰）
  try { const n = +(LocalStore.get('edenMapHintN') || 0) + 1; LocalStore.set('edenMapHintN', String(n)); if (n >= 3) done(); } catch (e) {}
}
