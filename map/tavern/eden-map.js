// 伊甸庄园 · 世界地图悬浮按钮（酒馆助手脚本）
// 卡内脚本只需一行：import 'https://cdn.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@<版本>/map/tavern/eden-map.js'
// 注入酒馆页面：右下角悬浮按钮 + 地图面板；面板内用 srcdoc 加载 viewer.html（<base> 指回仓库，相对资源照常加载）。
// 当前地点取 MVU 变量「世界.当前地点」，变量更新 / 切换聊天时推送给地图高亮。
(() => {
  const BASE = new URL('../', import.meta.url).href;            // .../map/
  const pdoc = window.parent.document;
  const ID = 'eden-map-root';
  pdoc.getElementById(ID)?.remove();

  const root = pdoc.createElement('div');
  root.id = ID;
  root.innerHTML = `
<style>
  /* 只用视口单位定位：酒馆的 <html> 带 transform，会成为 fixed 的包含块且高度为 0 */
  #${ID} .em-fab { position: fixed; left: calc(100vw - 66px); top: calc(100dvh - 144px); z-index: 30000; width: 48px; height: 48px; border-radius: 50%;
    border: 1px solid rgba(230,195,106,.7); background: rgba(20,23,28,.9); color: #e6c36a; cursor: pointer;
    box-shadow: 0 4px 14px rgba(0,0,0,.45); display: grid; place-items: center; touch-action: none; }
  #${ID} .em-fab svg { width: 24px; height: 24px; }
  #${ID} .em-fab.here::after { content: ''; position: absolute; right: 4px; top: 4px; width: 9px; height: 9px; border-radius: 50%; background: #ff5a5a; }
  #${ID} .em-panel { position: fixed; z-index: 30001; left: 50vw; top: 50dvh; transform: translate(-50%, -50%);
    width: min(1200px, 94vw); height: min(820px, 88vh); background: #14171c; border: 1px solid rgba(255,255,255,.16);
    border-radius: 12px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.6); display: grid; grid-template-rows: auto 1fr;
    contain: layout paint style; }   /* 面板内的重排、重绘不波及酒馆页面 */
  #${ID} .em-panel[hidden] { display: none; }
  #${ID} .em-bar { display: flex; align-items: center; gap: 10px; padding: 6px 10px; color: #eef1f4; font-size: 13px;
    border-bottom: 1px solid rgba(255,255,255,.12); }
  #${ID} .em-bar .em-here { color: #9aa3ad; margin-left: auto; }
  #${ID} .em-bar button { background: none; border: 0; color: #9aa3ad; font-size: 20px; cursor: pointer; line-height: 1; }
  #${ID} .em-body { position: relative; min-height: 0; contain: strict; }
  #${ID} iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #14171c; }
  /* 地图程序就绪前的加载遮罩（就绪后由地图自己显示瓦片进度） */
  #${ID} .em-load { position: absolute; inset: 0; display: grid; place-items: center; background: #14171c; color: #9aa3ad; font-size: 14px; }
  #${ID} .em-load[hidden] { display: none; }
  #${ID} .em-load i { display: block; width: 160px; height: 3px; margin-top: 10px; border-radius: 2px; background: linear-gradient(90deg, transparent, #e6c36a, transparent) 0 0 / 50% 100% no-repeat, rgba(255,255,255,.1); animation: em-slide 1s linear infinite; }
  @keyframes em-slide { from { background-position: -80px 0, 0 0; } to { background-position: 160px 0, 0 0; } }
  /* 手机：面板全屏，关闭按钮加大 */
  @media (max-width: 640px) {
    #${ID} .em-panel { width: 100vw; height: 100dvh; border: 0; border-radius: 0; }
    #${ID} .em-bar { padding: calc(4px + env(safe-area-inset-top)) 8px 4px; font-size: 12px; }
    #${ID} .em-bar .em-here { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    #${ID} .em-bar button { font-size: 28px; padding: 0 6px; }
  }
</style>
<button class="em-fab" title="世界地图" aria-label="打开世界地图">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>
</button>
<div class="em-panel" hidden>
  <div class="em-bar"><b class="em-title">新历 2088 · 地图</b><span class="em-here"></span><button class="em-close" aria-label="关闭">×</button></div>
  <div class="em-body"><iframe class="em-frame" title="地图"></iframe><div class="em-load" hidden><div>正在加载地图程序…<i></i></div></div></div>
</div>`;
  pdoc.body.appendChild(root);

  const fab = root.querySelector('.em-fab'), panel = root.querySelector('.em-panel'), frame = root.querySelector('.em-frame');
  const hereEl = root.querySelector('.em-here'), loadEl = root.querySelector('.em-load'), titleEl = root.querySelector('.em-title');
  let html = null, here = '', alive = false, sent = null, killT = 0;
  const SLEEP_MS = 3 * 60 * 1000;   // 关闭后地图程序保留 3 分钟：期间再打开秒开；超时才整个销毁

  // 页面 HTML 只取一次；脚本加载后空闲时预取，第一次打开少等一个请求
  const fetchHtml = () => html ??= fetch(BASE + 'viewer.html').then(r => r.text()).then(t => t.replace('<head>', `<head><base href="${BASE}">`))
    .catch(e => { html = null; throw e; });
  (window.parent.requestIdleCallback || (f => setTimeout(f, 2000)))(() => fetchHtml().catch(() => {}));
  // 打开：休眠中的地图直接唤醒；否则创建。关闭：先休眠（地图关掉底图、释放瓦片内存，脚本和数据留着），超时再销毁
  async function loadViewer() {
    clearTimeout(killT);
    if (alive) { post({ type: 'eden-map:wake' }); sent = null; push(); return; }
    loadEl.hidden = false;
    let doc;
    try { doc = await fetchHtml(); }
    catch (e) { loadEl.firstElementChild.textContent = '地图加载失败，请检查网络后重新打开'; return; }
    if (panel.hidden) return;   // 取页面期间面板又被关了
    frame.onload = () => push();
    frame.srcdoc = doc;
  }
  function unloadViewer() { alive = false; frame.onload = null; frame.removeAttribute('srcdoc'); frame.src = 'about:blank'; titleEl.textContent = '新历 2088 · 地图'; }
  function sleepViewer() {
    if (!alive) return unloadViewer();
    post({ type: 'eden-map:sleep' }); clearTimeout(killT); killT = setTimeout(unloadViewer, SLEEP_MS);
  }
  const post = msg => frame.contentWindow?.postMessage(msg, '*');
  // 地图 → 酒馆：ready 撤掉遮罩；state 更新面板标题。只接受来自本面板 iframe 的消息
  const onMsg = e => {
    if (e.source !== frame.contentWindow) return;
    if (e.data?.type === 'eden-map:ready') { alive = true; loadEl.hidden = true; sent = null; push(); if (panel.hidden) sleepViewer(); }
    if (e.data?.type === 'eden-map:state') titleEl.textContent = `新历 2088 · ${e.data.title}`;
  };
  window.parent.addEventListener('message', onMsg);
  function getHere() {
    try {
      const d = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
      return _.get(d, 'stat_data.世界.当前地点', '') || '';
    } catch (e) { return ''; }
  }
  // MVU 变量在流式输出时会连续更新：合并成一次，地点没变就不打扰地图
  function push() {
    here = getHere();
    hereEl.textContent = here ? `当前地点：${here}` : '';
    fab.classList.toggle('here', !!here);
    if (!panel.hidden && alive && here !== sent) { sent = here; post({ type: 'eden-map:here', value: here }); }
  }
  let pushT = 0;
  const pushSoon = (ms = 150) => { clearTimeout(pushT); pushT = setTimeout(push, ms); };

  // 悬浮按钮可拖动（避开酒馆输入栏等位置），位置按屏幕比例记住；轻点才打开面板
  const POS_KEY = 'edenMapFabPos';
  const placeFab = (fx, fy) => {
    const x = Math.min(Math.max(fx, 0), 1), y = Math.min(Math.max(fy, 0), 1);
    fab.style.left = `calc(${x} * (100vw - 48px))`; fab.style.top = `calc(${y} * (100dvh - 48px))`;
    return [x, y];
  };
  try { const p = JSON.parse(localStorage.getItem(POS_KEY)); if (p) placeFab(p[0], p[1]); } catch (e) {}
  let drag = null, dragged = false;
  fab.addEventListener('pointerdown', e => { const r = fab.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY };
    dragged = false; fab.setPointerCapture(e.pointerId); });
  let raf = 0, last = null;   // 拖动：每帧最多改一次位置
  fab.addEventListener('pointermove', e => { if (!drag) return;
    if (!dragged && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return; dragged = true;
    last = e; if (raf) return;
    raf = window.parent.requestAnimationFrame(() => { raf = 0; if (!drag || !last) return;
      const vw = window.parent.innerWidth, vh = window.parent.innerHeight;
      placeFab((last.clientX - drag.dx) / (vw - 48), (last.clientY - drag.dy) / (vh - 48)); }); });
  fab.addEventListener('pointerup', e => { if (!drag) return; drag = null;
    if (dragged) { const r = fab.getBoundingClientRect(), vw = window.parent.innerWidth, vh = window.parent.innerHeight;
      const p = placeFab(r.left / (vw - 48), r.top / (vh - 48)); try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch (err) {} } });

  const close = () => { if (panel.hidden) return; panel.hidden = true; sleepViewer(); };
  fab.addEventListener('click', async () => { if (dragged) return; if (!panel.hidden) return close(); panel.hidden = false; await loadViewer(); });
  root.querySelector('.em-close').addEventListener('click', close);
  pdoc.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  (async () => {
    try { await waitGlobalInitialized('Mvu'); eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, () => pushSoon()); } catch (e) {}
    eventOn(tavern_events.CHAT_CHANGED, () => pushSoon(300));
    eventOn(tavern_events.MESSAGE_SWIPED, () => pushSoon(300));
    push();
  })();

  // 脚本被关闭或重载时清理注入的元素
  window.addEventListener('pagehide', () => { clearTimeout(killT); clearTimeout(pushT); root.remove(); window.parent.removeEventListener('message', onMsg); });
})();
