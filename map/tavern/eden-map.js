// 伊甸庄园 · 世界地图悬浮按钮（酒馆助手脚本）
// 卡内脚本只需一行：import 'https://cdn.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@<版本>/map/tavern/eden-map.js'
// 注入酒馆页面：右下角悬浮按钮 + 地图面板；面板内用 srcdoc 加载 viewer.html（<base> 指回仓库，相对资源照常加载）。
// 当前地点取 MVU 变量「世界.当前地点」，变量更新 / 切换聊天时推送给地图高亮。
// 天城事态：从最近 40 楼原文解析事件标签（events.mjs，两种写法都认），推给地图落点；角色所在层的活跃事件压成一句注入给模型。
(() => {
  const SELF = new URL('../', import.meta.url).href;            // .../map/（脚本自己加载的位置）
  // 线路：地图的图片和数据可以走不同的 CDN 节点。gh 线路路径格式相同，只换域名；npm 线路路径不同（包名 / 版本 / files/map/），单独拼。本地测试地址不换
  const PKG = 'tiancheng-map-assets', REPO = 'kcgoofee-jpg/my-tavern-experiments';
  const LINES = [
    { key: 'vpn', name: '有梯子', sub: '官方 CDN · jsDelivr', host: 'cdn.jsdelivr.net' },
    { key: 'cn', name: '没梯子', sub: '国内镜像 · jsdmirror', host: 'cdn.jsdmirror.com' },
    // npm 包的国内镜像：首次 npm publish 并验证后再把 enabled 改成 true
    { key: 'npm', name: 'npm 镜像', sub: '国内 · npmmirror', enabled: false, url: v => `https://registry.npmmirror.com/${PKG}/${v}/files/map/` },
  ].filter(l => l.enabled !== false);
  const LINE_KEY = 'edenMapLine';
  const swappable = /(^|\.)(jsdelivr\.net|jsdmirror\.com|npmmirror\.com)$/.test(new URL(SELF).host);
  // 当前版本：gh 标签 map-v<版本>，或 npm 路径里的版本号
  const VER = (SELF.match(/@map-v([\d.]+)\//) || SELF.match(new RegExp(`/${PKG}/([\\d.]+)/files/`)) || [])[1] || null;
  let line = null; try { line = localStorage.getItem(LINE_KEY); } catch (e) {}
  if (!LINES.some(l => l.key === line)) line = null;
  const baseFor = key => {
    if (!swappable || !key) return SELF;
    const l = LINES.find(x => x.key === key);
    if (l.url) return VER ? l.url(VER) : SELF;                    // npm 线路：需要知道版本号
    if (VER) return `https://${l.host}/gh/${REPO}@map-v${VER}/map/`;
    const u = new URL(SELF); u.host = l.host; return u.href;     // 不知道版本（例如指向分支）：只换域名
  };
  let BASE = baseFor(line);
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
  /* 后台预加载：面板照常排版但不可见、不接收点击，地图在里面把首屏加载进缓存 */
  #${ID} .em-panel.em-ghost { visibility: hidden; pointer-events: none; }
  /* 悬浮按钮上的预加载进度环；完成后短暂显示一圈绿色 */
  #${ID} .em-fab.prep::before, #${ID} .em-fab.ready::before { content: ''; position: absolute; inset: -4px; border-radius: 50%; border: 2px solid transparent; }
  #${ID} .em-fab.prep::before { border: 0; background: conic-gradient(#e6c36a calc(var(--p, 0) * 1%), rgba(230,195,106,.18) 0);
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px)); mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px)); }
  #${ID} .em-fab.ready::before { border-color: rgba(123,216,143,.8); animation: em-fade 1.8s forwards; }
  @keyframes em-spin { to { transform: rotate(360deg); } }
  @keyframes em-fade { to { opacity: 0; } }
  #${ID} .em-badge { position: absolute; left: -4px; top: -4px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: #f08a24; color: #111; font: 700 11px/18px system-ui, sans-serif; text-align: center; box-shadow: 0 0 0 2px #0d1117; }
  #${ID} .em-badge[hidden] { display: none; }
  #${ID} .em-tip { position: absolute; right: 56px; top: 8px; width: max-content; max-width: 180px; padding: 6px 10px; border-radius: 8px; background: #1b2128; border: 1px solid #f08a24; color: #e6edf3; font: 12px/1.5 system-ui, sans-serif; box-shadow: 0 6px 16px rgba(0,0,0,.5); pointer-events: none; }
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
  /* 线路选择（首次使用时弹出；标题栏「线路」可重新选） */
  #${ID} .em-pick { position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; background: #14171c; color: #eef1f4; padding: 16px; }
  #${ID} .em-pick[hidden] { display: none; }
  #${ID} .em-pick h3 { margin: 0 0 6px; font-size: 18px; text-align: center; }
  #${ID} .em-pick p { margin: 0 0 16px; color: #9aa3ad; font-size: 13px; text-align: center; }
  #${ID} .em-pick .row { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
  #${ID} .em-pick button { width: 200px; padding: 14px 16px; border-radius: 10px; border: 1px solid rgba(255,255,255,.18); background: #1c2027; color: #eef1f4;
    font: inherit; text-align: left; cursor: pointer; transition: border-color .15s, background .15s, transform .08s; }
  #${ID} .em-pick button:hover { border-color: #e6c36a; background: #232830; }
  #${ID} .em-pick button:active { transform: scale(.97); }
  #${ID} .em-pick button b { display: block; font-size: 16px; }
  #${ID} .em-pick button small { display: block; color: #9aa3ad; font-size: 12px; margin-top: 2px; }
  #${ID} .em-pick button .ms { display: block; margin-top: 8px; font-size: 12px; color: #9aa3ad; }
  #${ID} .em-pick button .ms .rec { color: #e6c36a; display: inline; font-size: 12px; }
  #${ID} .em-pick button .ms.ok { color: #7bd88f; } #${ID} .em-pick button .ms.bad { color: #ff7a7a; }
  #${ID} .em-bar .em-line { font-size: 12px; padding: 3px 8px; border: 1px solid rgba(255,255,255,.18); border-radius: 6px; color: #9aa3ad; }
  #${ID} .em-bar .em-line:hover { color: #e6c36a; border-color: #e6c36a; }
  #${ID} .em-load > div { text-align: center; }
  #${ID} .em-load .bar { width: 200px; height: 4px; margin: 10px auto 0; border-radius: 2px; background: rgba(255,255,255,.12); overflow: hidden; }
  #${ID} .em-load .bar i { display: block; height: 100%; width: 0; background: #e6c36a; transition: width .25s; }
  #${ID} .em-load .hint { margin-top: 8px; font-size: 12px; color: #e6c36a; min-height: 1em; }
  #${ID} .em-load .acts { margin-top: 8px; display: flex; gap: 8px; justify-content: center; }
  #${ID} .em-load .acts[hidden] { display: none; }
  #${ID} .em-load .acts button { font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,.25); background: #1c2027; color: #eef1f4; cursor: pointer; }
  #${ID} .em-load .acts button:hover { border-color: #e6c36a; }
  /* 地图程序就绪后遮罩变半透明：先看到模糊地图，进度卡片浮在上面 */
  #${ID} .em-load.over { background: transparent; pointer-events: none; }
  #${ID} .em-load.over > div { background: rgba(20,23,28,.88); padding: 12px 18px; border-radius: 10px; border: 1px solid rgba(255,255,255,.14); pointer-events: auto; }
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
  <span class="em-badge" hidden></span>
</button>
<div class="em-panel" hidden>
  <div class="em-bar"><b class="em-title">新历 2088 · 地图</b><span class="em-here"></span><button class="em-line" title="切换加载线路"></button><button class="em-close" aria-label="关闭">×</button></div>
  <div class="em-body"><iframe class="em-frame" title="地图"></iframe><div class="em-load" hidden><div><span class="txt">加载地图 0%</span><div class="bar"><i></i></div><div class="hint"></div><div class="acts" hidden><button class="retry">重试</button><button class="swap">换线路</button></div></div></div>
    <div class="em-pick" hidden><div><h3>选择加载线路</h3><p>地图图片较多，按你的网络选一条更快的线路；之后可以点标题栏的「线路」切换</p><div class="row"></div></div></div></div>
</div>`;
  pdoc.body.appendChild(root);

  const fab = root.querySelector('.em-fab'), panel = root.querySelector('.em-panel'), frame = root.querySelector('.em-frame');
  const hereEl = root.querySelector('.em-here'), loadEl = root.querySelector('.em-load'), titleEl = root.querySelector('.em-title');
  const pickEl = root.querySelector('.em-pick'), lineBtn = root.querySelector('.em-line');
  lineBtn.hidden = !swappable;
  const showLine = () => { lineBtn.textContent = `线路：${LINES.find(l => l.key === line)?.name || '未选'}`; };
  showLine();
  // 线路选择：每条线路现场测一次延迟（取一个小文件），连不上的标红
  function showPicker() {
    const row = pickEl.querySelector('.row'); row.innerHTML = '';
    for (const l of LINES) {
      const b = pdoc.createElement('button'); b.innerHTML = `<b>${l.name}</b><small>${l.sub}</small><span class="ms">测速中…</span>`;
      b.onclick = () => chooseLine(l.key); row.appendChild(b);
      const ms = b.querySelector('.ms'), t0 = performance.now(), ctl = new AbortController(); setTimeout(() => ctl.abort(), 8000);
      fetch(baseFor(l.key) + 'data/maps.json', { cache: 'no-store', signal: ctl.signal })
        .then(r => { if (!r.ok) throw 0; const t = (performance.now() - t0) / 1000; ms.textContent = `延迟 ${t.toFixed(1)} 秒`; ms.className = 'ms ' + (t < 3 ? 'ok' : '');
          // 先测完的就是更快的线路：标「推荐」
          if (!row.querySelector('.rec')) ms.insertAdjacentHTML('beforeend', ' · <b class="rec">推荐</b>'); })
        .catch(() => { ms.textContent = '连不上'; ms.className = 'ms bad'; });
    }
    pickEl.hidden = false; loadEl.hidden = true;
  }
  function chooseLine(key) {
    const changed = key !== line; line = key; try { localStorage.setItem(LINE_KEY, key); localStorage.setItem(LINE_KEY + 'Manual', '1'); } catch (e) {}
    showLine(); pickEl.hidden = true;
    if (changed) { BASE = baseFor(key); html = null; unloadViewer(); }
    loadViewer();
  }
  lineBtn.addEventListener('click', showPicker);

  // 自动选线：所有线路同时取一个小文件，最先成功的就是最快的。用户手动选过就尊重手动选择
  function probe(key) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 6000);
    return fetch(baseFor(key) + 'data/maps.json', { cache: 'no-store', signal: ctl.signal })
      .then(r => { if (!r.ok) throw 0; return key; }).finally(() => clearTimeout(to));
  }
  async function autoLine() {
    if (!swappable) return true;
    let manual = false; try { manual = localStorage.getItem(LINE_KEY + 'Manual') === '1'; } catch (e) {}
    if (manual && line) return true;
    const key = await Promise.any(LINES.map(l => probe(l.key))).catch(() => null);
    if (!key) return false;
    if (key !== line) { line = key; BASE = baseFor(key); html = null; try { localStorage.setItem(LINE_KEY, key); } catch (e) {} showLine(); }
    return true;
  }
  // 预加载：在看不见的面板里把地图程序、数据和首屏瓦片加载一遍（进浏览器缓存），然后休眠释放内存。点按钮时基本秒开
  let ghost = false, ghostT = 0;
  async function preload() {
    if (!panel.hidden || alive) return;
    fab.classList.add('prep'); fab.title = '地图预加载中…';
    if (!(await autoLine())) { fab.classList.remove('prep'); fab.title = '地图线路都连不上，点开手动选择'; return; }
    if (!panel.hidden || alive) { fab.classList.remove('prep'); return; }   // 测速期间用户已经点开了
    ghost = true; panel.classList.add('em-ghost'); panel.hidden = false;
    ghostT = setTimeout(() => endGhost(false), 25000);   // 网络太慢也不无限挂着
    loadViewer();
  }
  function endGhost(ok) {
    if (!ghost) return; ghost = false; clearTimeout(ghostT); endProg();
    panel.hidden = true; panel.classList.remove('em-ghost'); sleepViewer();
    fab.classList.remove('prep'); fab.title = '世界地图'; if (ok) { fab.classList.add('ready'); setTimeout(() => fab.classList.remove('ready'), 2000); }
  }
  let html = null, here = '', alive = false, sent = null, killT = 0;
  // 统一加载进度：地图程序 0–20%、启动 20–50%、首屏图块 50–100%。只增不减；8 秒没进展提示网络慢，20 秒提示卡住
  const txtEl = loadEl.querySelector('.txt'), barEl = loadEl.querySelector('.bar i'), hintEl = loadEl.querySelector('.hint'), actsEl = loadEl.querySelector('.acts');
  let pct = 0, lastMove = 0, watchT = 0, quietT = 0;
  function startProg() {
    pct = 0; lastMove = Date.now(); setProg(0); hintEl.textContent = ''; actsEl.hidden = true;
    loadEl.classList.remove('over'); loadEl.hidden = false;   // 不论快慢都显示进度
    clearInterval(watchT); watchT = setInterval(() => {
      const idle = (Date.now() - lastMove) / 1000;
      if (idle > 20) { hintEl.textContent = '好像卡住了：可以重试，或换一条线路'; actsEl.hidden = false; }
      else if (idle > 8) { hintEl.textContent = '网络较慢，仍在加载…'; actsEl.hidden = !swappable; }
    }, 1000);
  }
  function setProg(p) {
    p = Math.max(pct, Math.min(100, Math.round(p)));
    if (p > pct) { lastMove = Date.now(); hintEl.textContent = ''; actsEl.hidden = true; }
    pct = p; txtEl.textContent = `加载地图 ${pct}%`; barEl.style.width = pct + '%'; fab.style.setProperty('--p', pct);
  }
  function endProg() { clearInterval(watchT); setProg(100); clearTimeout(quietT); quietT = setTimeout(() => { loadEl.hidden = true; loadEl.classList.remove('over'); }, 350); }   // 在 100% 停一下再收起
  loadEl.querySelector('.retry').addEventListener('click', () => { html = null; unloadViewer(); loadViewer(); });
  loadEl.querySelector('.swap').addEventListener('click', () => { endProg(); showPicker(); });
  const SLEEP_MS = 3 * 60 * 1000;   // 关闭后地图程序保留 3 分钟：期间再打开秒开；超时才整个销毁

  // 页面 HTML 只取一次；脚本加载后空闲时预取，第一次打开少等一个请求
  let htmlProg = null;   // 当前这次打开的进度回调（预取和打开共用一个请求）
  const fetchHtml = () => html ??= (async () => {
    const r = await fetch(BASE + 'viewer.html'); if (!r.ok) throw new Error(r.status);
    const total = +r.headers.get('content-length') || 0; let t;
    if (r.body && total) {   // 按已收字节算进度
      const rd = r.body.getReader(), parts = []; let n = 0;
      for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); n += value.length; htmlProg?.(n / total); }
      t = new TextDecoder().decode(await new Blob(parts).arrayBuffer());
    } else t = await r.text();
    return t.replace('<head>', `<head><base href="${BASE}">`);
  })().catch(e => { html = null; throw e; });
  if (line || !swappable) (window.parent.requestIdleCallback || (f => setTimeout(f, 2000)))(() => fetchHtml().catch(() => {}));
  // 打开：休眠中的地图直接唤醒；否则创建。关闭：先休眠（地图关掉底图、释放瓦片内存，脚本和数据留着），超时再销毁
  async function loadViewer() {
    clearTimeout(killT);
    if (swappable && !line) return showPicker();   // 还没选线路：先选
    if (alive) { post({ type: 'eden-map:wake' }); sent = null; push(); sendEvents(); return; }
    startProg(); htmlProg = f => setProg(f * 20);
    let doc;
    try { doc = await fetchHtml(); setProg(20); }
    catch (e) { hintEl.textContent = '地图程序下载失败'; actsEl.hidden = false; clearInterval(watchT); return; }
    finally { htmlProg = null; }
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
    if (e.data?.type === 'eden-map:boot') setProg(20 + e.data.pct * 30);
    if (e.data?.type === 'eden-map:ready') { alive = true; setProg(50); loadEl.classList.add('over'); sent = null; push(); sendEvents(); if (panel.hidden) sleepViewer(); }
    if (e.data?.type === 'eden-map:progress' && !loadEl.hidden) setProg(50 + e.data.pct / 2);
    if (e.data?.type === 'eden-map:loaded') { endProg(); if (ghost) endGhost(true); }
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

  // ---------------- 天城事态 ----------------
  // 聊天记录是唯一真相：每次从最近 SCAN 楼原文重算（swipe / 删楼 / 编辑后自然一致），不另存状态
  const SCAN = 40, INJECT_ID = 'eden-map-events';
  const badge = root.querySelector('.em-badge');
  let events = [], floorNow = -1, seen = -1, injected = '', EVM = null;
  // 事态模块单独加载：加载失败只是没有事态功能，地图照常可用
  import(new URL('events.mjs', import.meta.url).href).then(m => { EVM = m; recompute(); }).catch(e => console.warn('[eden-map] 事态模块加载失败', e));
  const chatKey = () => { try { return 'edenMapSeen:' + (SillyTavern.getContext().chatId || ''); } catch (e) { return 'edenMapSeen:'; } };
  function loadSeen() { try { seen = +localStorage.getItem(chatKey()); if (!Number.isFinite(seen)) seen = -1; } catch (e) { seen = -1; } }
  function recompute() {
    if (!EVM) return;
    const { collect, summarize, layerOf } = EVM;
    let msgs = [];
    try {
      floorNow = getLastMessageId();
      if (floorNow >= 0) msgs = getChatMessages(`${Math.max(0, floorNow - SCAN)}-${floorNow}`, { role: 'assistant' })
        .map(m => ({ floor: m.message_id, text: m.message || '' }));
    } catch (e) { floorNow = -1; }
    events = collect(msgs, floorNow);
    const fresh = events.filter(e => e.last > seen && e.tier !== 'fade').length;
    badge.hidden = !fresh; badge.textContent = fresh > 9 ? '9+' : fresh;
    if (fresh) tipOnce();
    inject(summarize(events, layerOf(getHere())));
    if (!panel.hidden && alive) sendEvents();
  }
  function inject(text) {
    if (text === injected) return; injected = text;
    try {
      uninjectPrompts([INJECT_ID]);
      if (text) injectPrompts([{ id: INJECT_ID, position: 'in_chat', depth: 4, role: 'system', content: text, should_scan: false }]);
    } catch (e) {}
  }
  // 发给地图：isNew = 上次打开面板之后才出现 / 更新的；fly = 打开时要飞过去的最新未读事件
  function sendEvents() {
    if (!alive) return;
    const items = events.map(e => ({ ...e, isNew: e.last > seen }));
    const fly = items.find(e => e.isNew && e.tier !== 'fade')?.id || null;
    post({ type: 'eden-map:events', v: 1, floor: floorNow, hereLayer: EVM ? EVM.layerOf(here) : '', items, fly });
    if (!panel.hidden) { seen = floorNow; try { localStorage.setItem(chatKey(), String(seen)); } catch (e) {} badge.hidden = true; }
  }
  let tipShown = false; try { tipShown = !!localStorage.getItem('edenMapEvTip'); } catch (e) {}
  function tipOnce() {
    if (tipShown || !panel.hidden) return; tipShown = true; try { localStorage.setItem('edenMapEvTip', '1'); } catch (e) {}
    const t = pdoc.createElement('div'); t.className = 'em-tip'; t.textContent = '天城有新事态：点开地图查看位置'; fab.appendChild(t);
    setTimeout(() => t.remove(), 6000);
  }
  let evT = 0;
  const recomputeSoon = (ms = 250) => { clearTimeout(evT); evT = setTimeout(recompute, ms); };

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

  const close = () => { if (panel.hidden || ghost) return; panel.hidden = true; sleepViewer(); };
  fab.addEventListener('click', async () => { if (dragged) return;
    if (ghost) { ghost = false; clearTimeout(ghostT); panel.classList.remove('em-ghost'); fab.classList.remove('prep'); sendEvents(); return; }   // 预加载中被点开：直接显示
    if (!panel.hidden) return close(); panel.hidden = false; await loadViewer(); });
  root.querySelector('.em-close').addEventListener('click', close);
  pdoc.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  (async () => {
    try { await waitGlobalInitialized('Mvu'); eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, () => pushSoon()); } catch (e) {}
    eventOn(tavern_events.CHAT_CHANGED, () => pushSoon(300));
    eventOn(tavern_events.MESSAGE_SWIPED, () => pushSoon(300));
    eventOn(tavern_events.CHAT_CHANGED, () => { injected = null; loadSeen(); recomputeSoon(300); });
    for (const k of ['MESSAGE_RECEIVED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_DELETED']) if (tavern_events[k]) eventOn(tavern_events[k], () => recomputeSoon());   // 新楼、改楼、重 roll、删楼：重算
    if (tavern_events.GENERATION_AFTER_COMMANDS) eventOn(tavern_events.GENERATION_AFTER_COMMANDS, () => { clearTimeout(evT); recompute(); });   // 生成前同步一次，注入的是最新态势
    push(); loadSeen(); recompute();
    (window.parent.requestIdleCallback || (f => setTimeout(f, 1500)))(() => preload());   // 打开聊天后空闲时：测速选线 + 预加载
  })();

  // 脚本被关闭或重载时清理注入的元素
  window.addEventListener('pagehide', () => { clearTimeout(killT); clearTimeout(pushT); clearTimeout(evT); inject(''); root.remove(); window.parent.removeEventListener('message', onMsg); });
})();
