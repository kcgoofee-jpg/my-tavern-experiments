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
    border-radius: 12px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.6); display: grid; grid-template-rows: auto 1fr; }
  #${ID} .em-panel[hidden] { display: none; }
  #${ID} .em-bar { display: flex; align-items: center; gap: 10px; padding: 6px 10px; color: #eef1f4; font-size: 13px;
    border-bottom: 1px solid rgba(255,255,255,.12); }
  #${ID} .em-bar .em-here { color: #9aa3ad; margin-left: auto; }
  #${ID} .em-bar button { background: none; border: 0; color: #9aa3ad; font-size: 20px; cursor: pointer; line-height: 1; }
  #${ID} iframe { width: 100%; height: 100%; border: 0; background: #14171c; }
</style>
<button class="em-fab" title="世界地图" aria-label="打开世界地图">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>
</button>
<div class="em-panel" hidden>
  <div class="em-bar"><b>新历 2088 · 世界地图</b><span class="em-here"></span><button class="em-close" aria-label="关闭">×</button></div>
  <iframe class="em-frame" title="世界地图"></iframe>
</div>`;
  pdoc.body.appendChild(root);

  const fab = root.querySelector('.em-fab'), panel = root.querySelector('.em-panel'), frame = root.querySelector('.em-frame');
  const hereEl = root.querySelector('.em-here');
  let html = null, here = '';

  // 打开时才创建地图，关闭时销毁（释放已解码的大图内存）；页面 HTML 只取一次
  async function loadViewer() {
    html ??= (await fetch(BASE + 'viewer.html').then(r => r.text())).replace('<head>', `<head><base href="${BASE}">`);
    frame.onload = () => push();
    frame.srcdoc = html;
  }
  function unloadViewer() { frame.onload = null; frame.removeAttribute('srcdoc'); frame.src = 'about:blank'; }
  function getHere() {
    try {
      const d = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
      return _.get(d, 'stat_data.世界.当前地点', '') || '';
    } catch (e) { return ''; }
  }
  function push() {
    here = getHere();
    hereEl.textContent = here ? `当前地点：${here}` : '';
    fab.classList.toggle('here', !!here);
    if (!panel.hidden) frame.contentWindow?.postMessage({ type: 'eden-map:here', value: here }, '*');
  }

  const close = () => { if (panel.hidden) return; panel.hidden = true; unloadViewer(); };
  fab.addEventListener('click', async () => { if (!panel.hidden) return close(); panel.hidden = false; await loadViewer(); });
  root.querySelector('.em-close').addEventListener('click', close);
  pdoc.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  (async () => {
    try { await waitGlobalInitialized('Mvu'); eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, () => setTimeout(push, 0)); } catch (e) {}
    eventOn(tavern_events.CHAT_CHANGED, () => setTimeout(push, 300));
    eventOn(tavern_events.MESSAGE_SWIPED, () => setTimeout(push, 300));
    push();
  })();

  // 脚本被关闭或重载时清理注入的元素
  window.addEventListener('pagehide', () => root.remove());
})();
