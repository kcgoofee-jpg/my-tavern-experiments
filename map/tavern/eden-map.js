// 伊甸庄园 · 世界地图悬浮按钮（酒馆助手脚本）
// 卡内脚本只需一行：import 'https://cdn.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@<版本>/map/tavern/eden-map.js'
// 注入酒馆页面：右下角悬浮按钮 + 地图面板；面板内用 srcdoc 加载 viewer.html（<base> 指回仓库，相对资源照常加载）。
// 当前地点取 MVU 变量「世界.当前地点」，变量更新 / 切换聊天时推送给地图高亮。
// 天城事态：从最近 80 楼原文解析事件标签（events.mjs，两种写法都认），推给地图落点；角色所在层的活跃事件压成一句注入给模型。
// v0.9.3 MVU 联动（mvu.mjs）：只读 stat_data（世界时间、主角着装、在场人物）；自定义名称与用途存在聊天变量顶层键 eden_map（不进 stat_data，见 docs/content-compat.md）。
(() => {
  const SELF = new URL('../', import.meta.url).href;            // .../map/（脚本自己加载的位置）
  // 线路：地图的图片和数据可以走不同的 CDN 节点。gh 线路路径格式相同，只换域名；npm 线路路径不同（包名 / 版本 / files/map/），单独拼。本地测试地址不换
  const PKG = 'tiancheng-map-assets', REPO = 'kcgoofee-jpg/my-tavern-experiments';
  const LINES = [
    { key: 'vpn', name: '有梯子', name_en: 'Global CDN', sub: '官方 CDN · jsDelivr', host: 'cdn.jsdelivr.net' },
    { key: 'cn', name: '没梯子', name_en: 'CN mirror', sub: '国内镜像 · jsdmirror', host: 'cdn.jsdmirror.com' },
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
  // 自检用（E6）：旧版脚本（v0.6.1）用同一个 id 但没有清理钩子；本页加载过哪些地图脚本地址；是不是「更新到新版本」切过来的
  const oldStyle = !!pdoc.getElementById('eden-map-root') && !window.parent.__edenMapCleanup;
  const switchedFrom = window.parent.__edenMapSwitch || null;
  try { (window.parent.__edenMapLoads ||= []).push(SELF); } catch (e) {}
  // 幂等：脚本被重复注入（换卡、热重载）时先清掉上一份的元素和全部监听，只留一个悬浮按钮、一套监听
  try { window.parent.__edenMapCleanup?.(); } catch (e) {}
  pdoc.getElementById(ID)?.remove();

  const root = pdoc.createElement('div');
  root.id = ID;
  root.innerHTML = `
<style>
  /* 设计令牌（map/ui/tokens.css 的同名值；宿主页里不另发请求，所以内联一份）：唯一的金 #e6c36a、唯一的红 #ff5a5a；面板跟随地图的深 / 浅主题（E5） */
  #${ID} { --em-gold: #e6c36a; --em-alert: #ff5a5a; --em-on-alert: #1a0606; --em-ok: #7bd88f; --em-focus: #63b4be;
    --em-bg: #151b20; --em-surface-2: rgba(255,255,255,.06); --em-line: rgba(255,255,255,.12); --em-line-2: rgba(255,255,255,.22); --em-ink: #d5dde4; --em-muted: #8591a0; --em-accent: #e6c36a; --em-on-accent: #1a1406;
    --em-font: "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", system-ui, sans-serif; }
  #${ID} .em-panel.em-light { --em-bg: #f8f5ee; --em-surface-2: rgba(20,23,26,.05); --em-line: rgba(20,23,26,.16); --em-line-2: rgba(20,23,26,.26); --em-ink: #1b1a17; --em-muted: #635e54;
    --em-accent: #7a5d22; --em-on-accent: #fff; --em-alert: #c0392b; --em-on-alert: #fff; --em-ok: #23733b; --em-focus: #2d6c75; }
  #${ID} :focus-visible { outline: 2px solid var(--em-focus); outline-offset: 2px; }
  /* 只用视口单位定位：酒馆的 <html> 带 transform，会成为 fixed 的包含块且高度为 0 */
  #${ID} .em-fab { position: fixed; left: calc(100vw - 66px); top: calc(100dvh - 144px); z-index: 30000; width: 48px; height: 48px; border-radius: 50%;
    border: 1px solid rgba(230,195,106,.7); background: rgba(21,27,32,.92); color: var(--em-gold); cursor: pointer;
    box-shadow: 0 6px 20px rgba(0,0,0,.35); display: grid; place-items: center; touch-action: none; transition: transform 120ms; }
  #${ID} .em-fab:active { transform: scale(.97); }
  #${ID} .em-fab svg { width: 24px; height: 24px; }
  /* 后台预加载：面板照常排版但不可见、不接收点击，地图在里面把首屏加载进缓存 */
  #${ID} .em-panel.em-ghost { visibility: hidden; pointer-events: none; }
  /* 悬浮按钮上的预加载进度环；完成后短暂显示一圈绿色 */
  #${ID} .em-fab.prep::before, #${ID} .em-fab.ready::before { content: ''; position: absolute; inset: -4px; border-radius: 50%; border: 2px solid transparent; }
  #${ID} .em-fab.prep::before { border: 0; background: conic-gradient(var(--em-gold) calc(var(--p, 0) * 1%), rgba(230,195,106,.18) 0);
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px)); mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px)); }
  #${ID} .em-fab.ready::before { border-color: rgba(123,216,143,.8); animation: em-fade 1.8s forwards; }
  /* 预加载失败：红色虚线环（不画满，不像成功），点开重试 */
  #${ID} .em-fab.fail::before { content: ''; position: absolute; inset: -4px; border-radius: 50%; border: 2px dashed var(--em-alert); }
  @keyframes em-spin { to { transform: rotate(360deg); } }
  @keyframes em-fade { to { opacity: 0; } }
  /* 新事态数：事态计数 = 唯一的红（规范 --alert），深字保证 11 px 的对比度 */
  #${ID} .em-badge { font-variant-numeric: tabular-nums; position: absolute; left: -4px; top: -4px; min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box; border-radius: 999px; background: var(--em-alert); color: var(--em-on-alert);
    font: 700 11px/18px "IBM Plex Mono", ui-monospace, Menlo, monospace; text-align: center; box-shadow: 0 0 0 2px #151b20; }
  #${ID} .em-badge[hidden] { display: none; }
  #${ID} .em-tip { position: absolute; right: 56px; top: 8px; width: max-content; max-width: 180px; padding: 6px 10px; border-radius: 8px; background: #151b20; border: 1px solid rgba(230,195,106,.6); color: #d5dde4;
    font: 12px/1.5 var(--em-font); box-shadow: 0 6px 20px rgba(0,0,0,.3); pointer-events: none; }
  #${ID} .em-tip.em-tip-r { right: auto; left: 56px; }   /* 悬浮按钮在左半边（左手）：提示朝右 */
  #${ID} .em-fab.here::after { content: ''; position: absolute; right: 4px; top: 4px; width: 8px; height: 8px; border-radius: 50%; background: #ff5a5a; box-shadow: 0 0 0 2px #151b20; }
  #${ID} .em-panel { position: fixed; z-index: 30001; left: 50vw; top: 50dvh; transform: translate(-50%, -50%);
    width: min(1200px, 94vw); height: min(820px, 88vh); height: min(820px, 88dvh); grid-template-columns: minmax(0, 1fr); background: var(--em-bg); border: 1px solid var(--em-line-2); color: var(--em-ink); font-family: var(--em-font);
    border-radius: 12px; overflow: hidden; box-shadow: 0 12px 32px rgba(0,0,0,.38), 0 24px 64px rgba(0,0,0,.3); display: grid; grid-template-rows: auto 1fr;
    contain: layout paint style; }   /* 面板内的重排、重绘不波及酒馆页面 */
  #${ID} .em-panel[hidden] { display: none; }
  /* 标题栏（44）：标题 · 当前地点 · 线路 · 关闭 */
  #${ID} .em-bar { display: flex; align-items: center; gap: 10px; min-height: 44px; box-sizing: border-box; padding: 0 6px 0 14px; color: var(--em-ink); font-size: 13px;
    border-bottom: 1px solid var(--em-line); }
  #${ID} .em-bar .em-title { font-weight: 700; letter-spacing: .04em; }
  #${ID} .em-bar .em-here { color: var(--em-muted); margin-left: auto; font-size: 12px; min-width: 0; flex: 0 1 auto; max-width: 46%; overflow: hidden; white-space: nowrap; display: flex; align-items: center; }
  #${ID} .em-bar .em-here .em-nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  #${ID} .em-bar .em-here .em-more { flex: none; margin-left: 2px; color: var(--em-ink); }
  #${ID} .em-bar .em-here.em-full .em-nm { white-space: normal; }
  #${ID} .em-bar .em-here::before { content: ''; display: inline-block; width: 6px; height: 6px; margin-right: 6px; border-radius: 50%; background: var(--em-alert); vertical-align: 1px; }
  #${ID} .em-bar .em-here:empty { display: none; }
  #${ID} .em-bar .em-here.em-full { white-space: normal; max-width: 60%; line-height: 1.35; padding: 4px 0; }   /* 触屏没有悬停：点一下看全文 */
  #${ID} .em-bar button { font: inherit; cursor: pointer; }
  #${ID} .em-bar .em-close { flex: none; width: 36px; height: 36px; display: grid; place-items: center; background: none; border: 0; border-radius: 8px; color: var(--em-muted); padding: 0; }
  #${ID} .em-bar .em-close:hover { background: var(--em-surface-2); color: var(--em-ink); }
  #${ID} .em-bar .em-close svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; }
  #${ID} .em-bar, #${ID} .em-body { min-width: 0; }   /* 标题栏的长地点 / 线路按钮不再把面板撑出屏幕（E5 r2 P0：关闭按钮曾被推到 404–585 px） */
  #${ID} .em-bar .em-title { min-width: 0; }
  #${ID} .em-bar .em-clock { flex: none; color: var(--em-muted); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; margin-left: -4px; }
  #${ID} .em-bar .em-clock[hidden] { display: none; }
  #${ID} .em-body { position: relative; min-height: 0; contain: strict; }
  #${ID} iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: var(--em-bg); }
  /* 地图程序就绪前的加载遮罩（就绪后由地图自己显示瓦片进度） */
  #${ID} .em-load { position: absolute; inset: 0; display: grid; place-items: center; background: var(--em-bg); color: var(--em-ink); font-size: 13px; }
  #${ID} .em-load[hidden] { display: none; }
  /* 线路选择（首次使用时弹出；标题栏「线路」可重新选） */
  #${ID} .em-pick { position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; background: var(--em-bg); color: var(--em-ink); padding: 16px; }
  #${ID} .em-pick[hidden] { display: none; }
  #${ID} .em-pick h3 { margin: 0 0 6px; font-size: 17px; text-align: center; }
  #${ID} .em-pick p { margin: 0 0 16px; color: var(--em-muted); font-size: 13px; text-align: center; }
  #${ID} .em-pick .row { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
  #${ID} .em-pick button { width: 200px; padding: 14px 16px; border-radius: 12px; border: 1px solid var(--em-line-2); background: var(--em-surface-2); color: var(--em-ink);
    font: inherit; text-align: left; cursor: pointer; transition: border-color 120ms, background 120ms, transform 120ms; }
  #${ID} .em-pick button:hover { border-color: var(--em-accent); }
  #${ID} .em-pick button:active { transform: scale(.97); }
  #${ID} .em-pick button b { display: block; font-size: 15px; }
  #${ID} .em-pick button small { display: block; color: var(--em-muted); font-size: 12px; margin-top: 2px; }
  #${ID} .em-pick button .ms { display: block; margin-top: 8px; font-size: 12px; color: var(--em-muted); }
  #${ID} .em-pick button .ms .rec { color: var(--em-accent); display: inline; font-size: 12px; }
  #${ID} .em-pick button .ms.ok { color: var(--em-ok); } #${ID} .em-pick button .ms.bad { color: var(--em-alert); }
  #${ID} .em-bar .em-line { font-size: 12px; height: 28px; padding: 0 10px; border: 1px solid var(--em-line-2); border-radius: 8px; background: transparent; color: var(--em-muted); white-space: nowrap; flex: none; }
  #${ID} .em-bar .em-line:hover { color: var(--em-accent); border-color: var(--em-accent); }
  #${ID} .em-load > div { text-align: center; }
  #${ID} .em-load .txt { font-variant-numeric: tabular-nums; }
  #${ID} .em-load .bar { width: 200px; height: 3px; margin: 10px auto 0; border-radius: 2px; background: var(--em-line); overflow: hidden; }
  #${ID} .em-load .bar i { display: block; height: 100%; width: 0; background: var(--em-accent); transition: width .25s; }
  #${ID} .em-load .hint { margin-top: 8px; font-size: 12px; color: var(--em-accent); min-height: 1em; }
  #${ID} .em-load .acts { margin-top: 8px; display: flex; gap: 8px; justify-content: center; }
  #${ID} .em-load .acts[hidden] { display: none; }
  #${ID} .em-load .acts button { font: inherit; font-size: 13px; height: 36px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--em-line-2); background: transparent; color: var(--em-ink); cursor: pointer; }
  #${ID} .em-load .acts button:first-child { background: var(--em-accent); border-color: var(--em-accent); color: var(--em-on-accent); font-weight: 700; }
  #${ID} .em-load .acts button:hover { border-color: var(--em-accent); }
  /* 地图程序就绪后遮罩变透明：先看到模糊地图，进度卡片（实底）浮在上面 */
  #${ID} .em-load.over { background: transparent; pointer-events: none; }
  #${ID} .em-load.over > div { background: var(--em-bg); padding: 12px 18px; border-radius: 12px; border: 1px solid var(--em-line); box-shadow: 0 6px 20px rgba(0,0,0,.3); pointer-events: auto; }
  @keyframes em-slide { from { background-position: -80px 0, 0 0; } to { background-position: 160px 0, 0 0; } }
  /* 手机：面板全屏，关闭按钮 44 */
  @media (max-width: 640px) {
    #${ID} .em-panel { width: 100vw; height: 100dvh; border: 0; border-radius: 0; }
    #${ID} .em-bar { padding: env(safe-area-inset-top) 2px 0 10px; font-size: 13px; gap: 8px; }
    #${ID} .em-bar .em-here { overflow: hidden; white-space: nowrap; min-width: 0; }
    #${ID} .em-bar .em-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 0 1 auto; }
    #${ID} .em-bar .em-here { flex: 1 1 0; }
    #${ID} .em-bar .em-line { white-space: nowrap; flex: none; max-width: 6.5em; overflow: hidden; text-overflow: ellipsis; }   /* 手机上标题、线路都不折行（用户实测：「没梯 / 子」断行） */
    #${ID} .em-bar .em-title { max-width: 42%; }
    #${ID} .em-bar .em-here { min-width: 4.5em; }   /* 线路按钮不再把「当前地点」挤成 0 宽（E5 r3 手机 N-01） */
    #${ID} .em-bar .em-close { width: 44px; height: 44px; }
    #${ID} .em-bar .em-close svg { width: 22px; height: 22px; }
    #${ID} .em-panel.em-left .em-close { order: -1; }   /* 左手（E7）：关闭按钮到左上，离左手拇指近一些；底部还有地图菜单里的「关闭地图」 */
    #${ID} .em-panel.em-left .em-bar { padding: env(safe-area-inset-top) 10px 0 2px; }
  }
</style>
<button class="em-fab" title="世界地图" aria-label="打开世界地图">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>
  <span class="em-badge" hidden></span>
</button>
<div class="em-panel" hidden>
  <div class="em-bar"><b class="em-title">新历 2088</b><span class="em-clock" hidden></span><span class="em-here"></span><button class="em-line" title="切换加载线路"></button><button class="em-close" aria-label="关闭"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>
  <div class="em-body"><iframe class="em-frame" title="地图"></iframe><div class="em-load" hidden><div><span class="txt">加载地图 0%</span><div class="bar"><i></i></div><div class="hint"></div><div class="acts" hidden><button class="retry">重试</button><button class="swap">换线路</button></div></div></div>
    <div class="em-pick" hidden><div><h3>选择加载线路</h3><p>地图图片较多，按你的网络选一条更快的线路；之后可以点标题栏的「线路」切换</p><div class="row"></div></div></div></div>
</div>`;
  pdoc.body.appendChild(root);

  const fab = root.querySelector('.em-fab'), panel = root.querySelector('.em-panel'), frame = root.querySelector('.em-frame');
  const hereEl = root.querySelector('.em-here'), loadEl = root.querySelector('.em-load'), titleEl = root.querySelector('.em-title');
  const pickEl = root.querySelector('.em-pick'), lineBtn = root.querySelector('.em-line'), clockEl = root.querySelector('.em-clock');
  lineBtn.hidden = !swappable;
  // 标题栏跟着地图的语言与深浅主题（地图在 srcdoc 里，与酒馆页同源，设置存在同一个 localStorage；切换时地图发 eden-map:state {lang, theme}）
  const UI = { zh: { title: '新历 2088', map: '地图', here: '当前地点：', line: '线路：', unset: '未选', close: '关闭', load: '加载地图 {p}%', open: '打开世界地图', fab: '世界地图' },
    en: { title: 'NC 2088', map: 'Map', here: 'Location: ', line: 'Route: ', unset: 'not set', close: 'Close', load: 'Loading map {p}%', open: 'Open world map', fab: 'World map' } };
  let UL = 'zh', mapTitle = ''; try { UL = localStorage.getItem('edenMapLang') === 'en' ? 'en' : 'zh'; } catch (e) {}
  const U = k => UI[UL][k];
  { let th = 'auto'; try { th = localStorage.getItem('edenMapTheme') || 'auto'; } catch (e) {}
    panel.classList.toggle('em-light', th === 'light' || (th === 'auto' && window.parent.matchMedia?.('(prefers-color-scheme: light)').matches)); }
  const showLine = () => { const l = LINES.find(x => x.key === line); lineBtn.textContent = U('line') + (l ? (UL === 'en' && l.name_en) || l.name : U('unset')); };
  // v0.9.2：标题只写纪年，层名只在地图的面包屑里出现一次
  const showTitle = () => { titleEl.textContent = U('title'); root.querySelector('.em-close').setAttribute('aria-label', U('close'));
    fab.setAttribute('aria-label', U('open')); if (!fab.classList.contains('prep') && !fab.classList.contains('fail')) fab.title = U('fab'); };
  showLine(); showTitle();
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
  let ghost = false, ghostT = 0, lineP = null;   // lineP：测速选线的结果（自检复用，不再多测一次）
  // 省流：系统省流（saveData）、2g / 3g、内存 ≤ 4 GB 时，后台只取地图程序（viewer.html）和启动 JSON，不开幽灵面板、不拉瓦片（E4 N02）
  // 触屏且网络 / 内存信息都拿不到（iOS WebKit）也按省流预热（E6）；这只影响后台预热，清晰度档位由地图自己定
  const touchUnknown = () => { const n = window.parent.navigator || navigator; return !n.connection && !('deviceMemory' in n) && !!window.parent.matchMedia?.('(pointer: coarse)').matches; };
  const lean = () => { const c = navigator.connection || {}; return !!c.saveData || /(^|-)(2g|3g)$/.test(c.effectiveType || '') || (navigator.deviceMemory || 8) <= 4 || touchUnknown(); };
  async function preload() {
    if (!panel.hidden || alive) return;
    fab.classList.add('prep'); fab.title = '地图预加载中…';
    if (!(await (lineP = autoLine()))) { fab.classList.remove('prep'); fab.classList.add('fail'); fab.title = '地图线路都连不上，点开手动选择'; return; }
    if (!panel.hidden || alive) { fab.classList.remove('prep'); return; }   // 测速期间用户已经点开了
    if (lean()) {
      htmlProg = f => fab.style.setProperty('--p', Math.round(f * 80));
      try { await fetchHtml(); await Promise.all(['data/maps.json', 'data/world_markers.json', 'data/derived.json'].map(u => fetch(BASE + u).catch(() => null)));
        fab.classList.remove('prep'); fab.title = '世界地图'; }
      catch (e) { fab.classList.remove('prep'); fab.classList.add('fail'); fab.title = '地图预加载失败，点开重试'; }
      finally { htmlProg = null; }
      return;
    }
    ghost = true; panel.classList.add('em-ghost'); panel.hidden = false;
    ghostT = setTimeout(() => endGhost(false), 25000);   // 网络太慢也不无限挂着
    loadViewer();
  }
  function endGhost(ok) {
    if (!ghost) return; ghost = false; clearTimeout(ghostT);
    // 失败不画满进度环（之前 endProg 会 setProg(100)，看起来像成功了，E4 N06）
    if (ok) endProg(); else { clearInterval(watchT); loadEl.hidden = true; }
    panel.hidden = true; panel.classList.remove('em-ghost'); sleepViewer();
    fab.classList.remove('prep'); fab.title = '世界地图';
    if (ok) { fab.classList.add('ready'); setTimeout(() => fab.classList.remove('ready'), 2000); }
    else { fab.classList.add('fail'); fab.title = '地图预加载失败，点开重试'; }
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
    pct = p; txtEl.textContent = U('load').replace('{p}', pct); barEl.style.width = pct + '%'; fab.style.setProperty('--p', pct);
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
    catch (e) { hintEl.textContent = '地图程序下载失败，可以重试或换一条线路'; actsEl.hidden = false; clearInterval(watchT); if (ghost) endGhost(false); return; }
    finally { htmlProg = null; }
    if (panel.hidden) return;   // 取页面期间面板又被关了
    frame.onload = () => push();
    frame.srcdoc = doc;
  }
  function unloadViewer() { alive = false; frame.onload = null; frame.removeAttribute('srcdoc'); frame.src = 'about:blank'; mapTitle = ''; showTitle(); }
  function sleepViewer() {
    if (!alive) return unloadViewer();
    post({ type: 'eden-map:sleep' }); clearTimeout(killT); killT = setTimeout(unloadViewer, SLEEP_MS);
  }
  const post = msg => frame.contentWindow?.postMessage(msg, '*');
  // 地图 → 酒馆：ready 撤掉遮罩；state 更新面板标题。只接受来自本面板 iframe 的消息
  const onMsg = e => {
    if (e.source !== frame.contentWindow) return;
    if (e.data?.type === 'eden-map:boot') setProg(20 + e.data.pct * 30);
    if (e.data?.type === 'eden-map:ready') { alive = true; sentClock = sentOutfit = null; knowRooms(); sendCheck(); sendCustom(); setProg(50); loadEl.classList.add('over'); sent = null; push(); sendEvents(); if (panel.hidden) sleepViewer(); }
    if (e.data?.type === 'eden-map:progress' && !loadEl.hidden) setProg(50 + e.data.pct / 2);
    if (e.data?.type === 'eden-map:loaded') { endProg(); if (ghost) endGhost(true); }
    if (e.data?.type === 'eden-map:state') {
      if (e.data.lang && e.data.lang !== UL && UI[e.data.lang]) { UL = e.data.lang; showLine(); push(); }
      if (e.data.theme) panel.classList.toggle('em-light', e.data.theme === 'light');
      if (e.data.hand && e.data.hand !== handPref) { handPref = e.data.hand; applyHand(true); }
      mapTitle = e.data.title || ''; showTitle(); }
    if (e.data?.type === 'eden-map:esc') close();   // 地图里没有可关的卡片 / 列表时，Esc 关闭面板
    if (e.data?.type === 'eden-map:emit' && e.data.ev === 'map') emit('map', e.data.data);   // 本机扩展：切图（E6）
    if (e.data?.type === 'eden-map:build') { viewerVer = e.data.version || null; if (checkFacts) finishCheck(); }   // 地图的版本（data/build.json）→ 自检比对
    if (e.data?.type === 'eden-map:update-now') switchVersion();   // 自检里点了「本次切换到新版本」
    // v0.9.3 自定义（地图设置里的「自定义」一栏）：地图只发请求，数据由这里写进聊天变量后再推回去
    if (e.data?.type === 'eden-map:custom-set') api.setCustom(e.data.key, e.data.patch || {});
    if (e.data?.type === 'eden-map:custom-reset') api.removeCustom(e.data.key);
    if (e.data?.type === 'eden-map:custom-sync') api.setWorldbookSync(!!e.data.on);
  };
  window.parent.addEventListener('message', onMsg);
  function getHere() {
    try {
      const d = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
      return _.get(d, 'stat_data.世界.当前地点', '') || '';
    } catch (e) { return ''; }
  }
  // 标题栏显示用：{{user}} 换成酒馆里的用户名，取不到就去掉（发给地图的仍是原值，地图自己处理）
  const userName = s => { let n = ''; try { n = SillyTavern.getContext().name1 || ''; } catch (e) {} return String(s).replace(/\{\{user\}\}/g, n).trim(); };
  // MVU 变量在流式输出时会连续更新：合并成一次，地点没变就不打扰地图
  function push() {
    here = getHere();
    // 一个地点胶囊：MVU 里写了多处（「A / B」）只显示第一处，全文在 title；右侧省略
    const full = userName(here), parts = full.split(/\s*[\/／|｜]\s*/).filter(Boolean);
    hereEl.innerHTML = ''; if (parts[0]) { const a = pdoc.createElement('span'); a.className = 'em-nm'; a.textContent = parts[0]; hereEl.append(a); }
    if (parts.length > 1) { const b = pdoc.createElement('span'); b.className = 'em-more'; b.textContent = ` +${parts.length - 1}`; hereEl.append(b); } hereEl.title = full ? U('here') + full : '';
    if (full) hereEl.setAttribute('aria-label', U('here') + full); else hereEl.removeAttribute('aria-label');
    hereEl.classList.remove('em-full');
    fab.classList.toggle('here', !!here);
    // bg：后台预加载中（面板不可见），地图据此不自动进庄园（E4 N03）
    if (!panel.hidden && alive) post({ type: 'eden-map:chat', id: chatId() });   // 当前聊天 id：本机自定义叫法按聊天分开存（E6）
    if (!panel.hidden && alive && here !== sent) { sent = here; post({ type: 'eden-map:here', value: here, bg: ghost }); }
    if (here !== emHere) { emHere = here; emit('here', { value: here }); }
    pushMvu();
  }
  // ---------------- v0.9.3：世界时间（标题栏 + 地图夜色）与主角着装（本人地点卡）；只读 stat_data，缺字段就不显示 ----------------
  let MV = null, clockSig = null, outfitSig = null, clock = null, outfitNow = null;
  import(new URL('mvu.mjs', import.meta.url).href).then(m => { MV = m; push(); loadCustom(); }).catch(e => console.warn('[eden-map] MVU 模块加载失败', e));
  function pushMvu() {
    if (!MV) return;
    const st = mvuStat(), w = MV.worldTime(st), lb = MV.clockLabel(w);
    clock = { ...w, ...lb, night: MV.isNight(w) };
    const cs = JSON.stringify(clock);
    if (cs !== clockSig) { clockSig = cs; clockEl.hidden = !lb.short; clockEl.textContent = lb.short; clockEl.title = lb.full; if (lb.full) clockEl.setAttribute('aria-label', lb.full); emit('clock', { ...clock }); sentClock = null; }
    if (alive && sentClock !== clockSig) { sentClock = clockSig; post({ type: 'eden-map:clock', ...clock }); }
    const o = MV.outfit(st), os = JSON.stringify(o);
    if (os !== outfitSig) { outfitSig = os; outfitNow = o; emit('outfit', { items: o ? { ...o } : null, text: MV.outfitText(o) }); sentOutfit = null; }
    if (alive && sentOutfit !== outfitSig) { sentOutfit = outfitSig; post({ type: 'eden-map:outfit', items: outfitNow, text: MV.outfitText(outfitNow) }); }
  }
  let sentClock = null, sentOutfit = null;
  let pushT = 0;
  const pushSoon = (ms = 150) => { clearTimeout(pushT); pushT = setTimeout(push, ms); };

  // ---------------- 天城事态 ----------------
  // 聊天记录是唯一真相：每次从最近 SCAN 楼原文重算（swipe / 删楼 / 编辑后自然一致），不另存状态
  const SCAN = 80, INJECT_ID = 'eden-map-events';   // 80 楼（E6）：未解除的事件在窗口内一直列出（events.mjs tierOf）
  const badge = root.querySelector('.em-badge');
  let events = [], floorNow = -1, seen = -1, injected = '', EVM = null;
  // 事态模块单独加载：加载失败只是没有事态功能，地图照常可用
  import(new URL('events.mjs', import.meta.url).href).then(m => { EVM = m; recompute(); }).catch(e => console.warn('[eden-map] 事态模块加载失败', e));
  // 人物栏（v0.9.2）：人物位置标签 + MVU 人物表 → 每人最新位置；模块加载失败只是没有人物栏
  let CHM = null, chars = [], charSig = '';
  import(new URL('characters.mjs', import.meta.url).href).then(m => { CHM = m; recompute(); }).catch(e => console.warn('[eden-map] 人物模块加载失败', e));
  const mvuStat = () => { try { return Mvu.getMvuData({ type: 'message', message_id: 'latest' })?.stat_data || null; } catch (e) { return null; } };
  const chatKey = () => { try { return 'edenMapSeen:' + (SillyTavern.getContext().chatId || ''); } catch (e) { return 'edenMapSeen:'; } };
  function loadSeen() { try { seen = +localStorage.getItem(chatKey()); if (!Number.isFinite(seen)) seen = -1; } catch (e) { seen = -1; } }
  function recompute() {
    if (!EVM) return;
    const { collect, summarize, layerOf } = EVM;
    let msgs = [];
    try {
      floorNow = getLastMessageId();
      if (floorNow >= 0) msgs = getChatMessages(`${Math.max(0, floorNow - SCAN)}-${floorNow}`, { role: 'assistant' })
        .map(m => ({ floor: m.message_id, text: String(m.message || '').replace(/<%[\s\S]*?%>/g, '') }));   // 原文里可能还留着 EJS 模板源码，里面的示例标签不算事件
    } catch (e) { floorNow = -1; }
    events = collect(msgs, floorNow);
    if (CHM) { chars = CHM.collectChars(msgs, floorNow, CHM.mvuChars(mvuStat(), getHere()));
      const sig = floorNow + '|' + chars.map(c => c.name + '@' + c.place + '#' + c.floor).join();
      if (sig !== charSig) { charSig = sig; if (!panel.hidden && alive) sendChars(); emit('characters', { items: chars.map(c => ({ ...c })), floor: floorNow }); } }
    const fresh = events.filter(e => e.last > seen && e.tier !== 'fade').length;
    badge.hidden = !fresh; badge.textContent = fresh > 9 ? '9+' : fresh;
    if (fresh) tipOnce();
    customTags(msgs);
    inject([summarize(events, layerOf(getHere())), CHM ? CHM.summarizeChars(chars) : '', MV && custom ? MV.summarizeCustom(custom) : ''].filter(Boolean).join('\n'));
    if (!panel.hidden && alive) sendEvents();
    if (subs.events.size) { const sig = floorNow + '|' + events.map(e => e.id + ':' + e.last + ':' + e.tier).join(); if (sig !== emEvSig) { emEvSig = sig; emit('events', { items: events.map(e => ({ ...e })), floor: floorNow, hereLayer: layerOf(here) }); } }
  }
  function inject(text) {
    if (text === injected) return; injected = text;
    try {
      uninjectPrompts([INJECT_ID]);
      if (text) injectPrompts([{ id: INJECT_ID, position: 'in_chat', depth: 4, role: 'system', content: text, should_scan: false }]);
    } catch (e) {}
  }
  // 发给地图：isNew = 上次打开面板之后才出现 / 更新的；fly = 打开时要飞过去的最新未读事件
  // fly 只在打开面板的那一次带上：面板开着时新楼的事件只更新列表和点，不把地图拉走、不关玩家正在看的卡（E5 r2 RP P1）
  let flyNext = true;
  function sendEvents() {
    if (!alive) return;
    const items = events.map(e => ({ ...e, isNew: e.last > seen }));
    const fly = flyNext && !panel.hidden && !ghost ? items.find(e => e.isNew && e.tier !== 'fade')?.id || null : null;
    if (!panel.hidden && !ghost && (fly || floorNow >= 0)) flyNext = false;   // 刚载入时先发的空列表不消耗「打开时飞一次」（E5 r3 RP3-1）
    sendChars();
    post({ type: 'eden-map:events', v: 1, floor: floorNow, hereLayer: EVM ? EVM.layerOf(here) : '', items, fly });
    if (!panel.hidden) { seen = floorNow; try { localStorage.setItem(chatKey(), String(seen)); } catch (e) {} badge.hidden = true; }
  }
  function sendChars() { if (alive) post({ type: 'eden-map:chars', v: 1, floor: floorNow, items: chars }); }
  let tipShown = false; try { tipShown = !!localStorage.getItem('edenMapEvTip'); } catch (e) {}
  function tipOnce() {
    if (tipShown || !panel.hidden) return; tipShown = true; try { localStorage.setItem('edenMapEvTip', '1'); } catch (e) {}
    const t = pdoc.createElement('div'); t.className = 'em-tip' + (fabLeft() ? ' em-tip-r' : ''); t.textContent = '天城有新事态：点开地图查看位置'; fab.appendChild(t);
    setTimeout(() => t.remove(), 6000);
  }
  let evT = 0;
  const recomputeSoon = (ms = 250) => { clearTimeout(evT); evT = setTimeout(recompute, ms); };

  // ---------------- 本机扩展接口 window.EdenMap（E6，docs/content-compat.md） ----------------
  // 在宿主页挂 window.EdenMap，转发给地图 iframe（srcdoc，与宿主同源，直接调用）；地图没开时直接读写本机 localStorage（同一份存储，同一套函数 here.mjs）。
  // 自定义叫法按聊天分开存（edenMap:chat:<聊天 id>:custom），拿不到聊天 id 时存全局 edenMap:custom。不联网、不上传、不进地址。
  // 宿主页上的方法都返回 Promise。on('here' | 'events' | 'map', fn)：here / events 由本脚本发（面板关着也发），map 由地图发。
  const chatId = () => { try { return String(SillyTavern.getContext().chatId || ''); } catch (e) { return ''; } };
  const subs = { here: new Set(), events: new Set(), map: new Set(), characters: new Set(), outfit: new Set(), clock: new Set(), custom: new Set() };
  let emHere = null, emEvSig = '', roomsKnown = null, HXm = null;
  function emit(ev, data) { for (const f of subs[ev]) { try { f(data); } catch (e) { console.warn('[EdenMap]', e); } } }
  const hx = () => (HXm ??= import(SELF + 'here.mjs'));
  let CXm = null; const chx = () => (CXm ??= import(SELF + 'tavern/characters.mjs'));
  const inner = () => { if (!alive) return null; try { const w = frame.contentWindow; if (!w?.EdenMap) return null; w.__edenMapChat?.(chatId()); return w.EdenMap; } catch (e) { return null; } };
  function knowRooms() { try { const r = inner()?.getRooms().rooms; if (r?.length) roomsKnown = r; } catch (e) {} }
  const store = () => { try { return window.parent.localStorage; } catch (e) { return null; } };

  // ---------------- v0.9.3 自定义名称与用途（聊天变量 eden_map.自定义；酒馆助手没有变量接口时退回本机 localStorage） ----------------
  // 不写进 stat_data：卡的 MVU zod 结构会丢掉未知键。删除一项要整块替换，所以写入优先用 updateVariablesWith / replaceVariables（insertOrAssignVariables 是深合并，删不掉键）。
  // 剧情标签 ⌖改名 / ⌖用途：只处理比 eden_map.标签楼 新的楼层，处理后记下楼层；每条在地图的事态横条上方提示一次。
  // 「同步到世界书」默认关；打开时才建世界书「伊甸地图·自定义」（一个常驻条目），当前聊天没有绑定聊天世界书时绑定到这个聊天。
  let custom = null, tagFloor = -1, customChat = null, toastQ = [], regP = null;
  const varsOk = () => fnOk('getVariables') && (fnOk('updateVariablesWith') || fnOk('replaceVariables') || fnOk('insertOrAssignVariables'));
  const lsCustomKey = () => 'edenMap:chat:' + (chatId() || '') + ':custom2';
  function readVars() {
    if (varsOk()) { try { const v = getVariables({ type: 'chat' })?.[MV.VAR_ROOT]; return v && typeof v === 'object' ? v : {}; } catch (e) {} }
    try { return JSON.parse(localStorage.getItem(lsCustomKey()) || '{}') || {}; } catch (e) { return {}; }
  }
  async function writeVars(root) {
    if (varsOk()) {
      try {
        if (fnOk('updateVariablesWith')) await updateVariablesWith(v => { v[MV.VAR_ROOT] = root; return v; }, { type: 'chat' });
        else if (fnOk('replaceVariables')) { const all = { ...(getVariables({ type: 'chat' }) || {}) }; all[MV.VAR_ROOT] = root; await replaceVariables(all, { type: 'chat' }); }
        else await insertOrAssignVariables({ [MV.VAR_ROOT]: root }, { type: 'chat' });
        return true;
      } catch (e) { console.warn('[eden-map] 写聊天变量失败，改存本机', e); }
    }
    try { localStorage.setItem(lsCustomKey(), JSON.stringify(root)); return true; } catch (e) { return false; }
  }
  const saveRoot = () => writeVars({ 自定义: custom, 标签楼: tagFloor });
  // 旧版（≤ 0.9.2）本机叫法 edenMap:chat:<id>:custom / edenMap:custom → 并进来，旧键改名为 *.migrated（不删）
  async function migrateOld() {
    const H = await hx().catch(() => null), st = store(); if (!H || !st) return false;
    let any = false;
    for (const k of [H.customKey(chatId()), H.customKey('')]) {
      const rooms = (() => { try { return JSON.parse(st.getItem(k) || 'null')?.rooms || null; } catch (e) { return null; } })();
      if (!rooms || !Object.keys(rooms).length) continue;
      const r = MV.migrateRooms(custom, rooms); custom = r.custom; any = true;
      if (k !== H.customKey('')) { try { st.setItem(k + '.migrated', st.getItem(k)); st.removeItem(k); } catch (e) {} }
    }
    return any;
  }
  async function loadCustom() {
    if (!MV) return;
    const id = chatId(); customChat = id;
    const v = readVars(); custom = MV.normCustom(v.自定义); tagFloor = Number.isFinite(+v.标签楼) && v.标签楼 !== null ? +v.标签楼 : -1;
    if (await migrateOld()) await saveRoot();
    if (customChat !== id) return;
    customChanged(false);
  }
  function customChanged(save = true) {
    if (save) saveRoot();
    sendCustom(); emit('custom', MV.normCustom(custom)); recomputeSoon(50);
    if (custom?.同步世界书) syncWb().catch(e => console.warn('[eden-map] 同步世界书失败', e));
  }
  function sendCustom() { if (alive && custom) post({ type: 'eden-map:custom', data: custom, vars: varsOk(), wb: wbOk() }); flushToasts(); }
  const wbOk = () => fnOk('createOrReplaceWorldbook') || fnOk('createWorldbook');
  let wbState = '';
  async function syncWb() {
    if (!wbOk()) { wbState = 'noapi'; return false; }
    const content = MV.wbContent(custom);
    const entry = { name: MV.WB_ENTRY, enabled: !!content, strategy: { type: 'constant', keys: [] }, position: { type: 'after_character_definition', order: 903 }, content: content || '（空）',
      recursion: { prevent_incoming: true, prevent_outgoing: true } };
    if (fnOk('createOrReplaceWorldbook')) await createOrReplaceWorldbook(MV.WB_NAME, [entry]); else await createWorldbook(MV.WB_NAME, [entry]);
    // 绑定：当前聊天没有聊天世界书时绑定到这个聊天；已有别的就不动（在地图设置里提示手动启用）
    let bound = false;
    try { const cur = fnOk('getChatWorldbookName') ? getChatWorldbookName('current') : null;
      if (cur === MV.WB_NAME) bound = true; else if (!cur && fnOk('rebindChatWorldbook')) { await rebindChatWorldbook('current', MV.WB_NAME); bound = true; } } catch (e) {}
    if (!bound) try { bound = (fnOk('getGlobalWorldbookNames') && getGlobalWorldbookNames().includes(MV.WB_NAME)); } catch (e) {}
    wbState = bound ? 'bound' : 'unbound'; sendCustom(); return true;
  }
  // 标签用到的「类」：人物栏里的名字 → 人物；庄园房间 / 区域（maps.json）→ 房间 / 区域；其余当地标
  const reg = () => (regP ??= fetch(BASE + 'data/maps.json').then(r => r.ok ? r.json() : null).catch(() => null));
  let regNow = null; reg().then(r => { regNow = r; });
  // 注：reg() 用的是当前线路的 maps.json（与地图同一份）；取不到时一律当地标
  function kindOf(key) {
    if (chars.some(c => c.name === key)) return 'character';
    const e = Object.values(regNow?.maps || {}).find(m => m.kind === 'estate');
    if (e?.rooms?.includes(key)) return 'room'; if (e?.areas?.includes(key)) return 'area';
    return 'landmark';
  }
  function customTags(msgs) {
    if (!MV || !custom || customChat !== chatId()) return;
    if (floorNow >= 0 && floorNow < tagFloor) tagFloor = floorNow;   // 删过楼：之后的新楼照常处理
    const r = MV.applyTags(custom, msgs, tagFloor, kindOf);
    if (r.last === tagFloor && !r.applied.length) return;
    custom = r.custom; tagFloor = r.last;
    if (r.applied.length) { toastQ.push(...r.applied.map(MV.tagToast)); customChanged(true); } else saveRoot();
  }
  function flushToasts() { if (!alive || !toastQ.length) return; post({ type: 'eden-map:toast', items: toastQ.splice(0) }); }
  const api = Object.freeze({
    // v0.9.3 自定义名称与用途（聊天变量 eden_map.自定义）：key = 标准名（房间 / 区域 / 地标 / 人物）；patch = { name?, note?, kind? }，传 '' 清掉
    async setCustom(key, patch = {}) { if (!MV || !custom) await loadCustom(); if (!MV) return false; await reg(); const k = String(key || '').trim(), r = MV.setCustom(custom, k, { ...patch, kind: patch.kind || custom.items[k]?.类 || kindOf(k) }); if (!r) return false; custom = r; customChanged(true); return true; },
    async removeCustom(key) { if (!MV || !custom) await loadCustom(); if (!MV) return false; const r = MV.removeCustom(custom, MV.findKey(custom, key) || key); if (!r) return false; custom = r; customChanged(true); return true; },
    async getCustom() { if (!MV || !custom) await loadCustom(); return { ...MV.normCustom(custom), storage: varsOk() ? 'chat' : 'local', worldbook: wbState || null }; },
    async setWorldbookSync(on) { if (!MV || !custom) await loadCustom(); custom = { ...custom, 同步世界书: !!on }; customChanged(true); if (!on) wbState = ''; return true; },
    // 旧名字保留（≤ 0.9.2）：房间叫法 = 该房间的自定义显示名
    async setRoomAlias(name, room) { const rooms = roomsKnown || Object.values((await reg())?.maps || {}).find(m => m.kind === 'estate')?.rooms || null;
      if (rooms && (!rooms.includes(String(room).trim()) || rooms.includes(String(name).trim()))) return false; return api.setCustom(room, { name, kind: 'room' }); },
    async removeRoomAlias(name) { if (!MV || !custom) await loadCustom(); const k = MV?.findKey(custom, name); return !!k && k !== String(name).trim() && api.setCustom(k, { name: '' }); },
    async getRooms() { if (!MV || !custom) await loadCustom(); const rooms = roomsKnown || Object.values((await reg())?.maps || {}).find(m => m.kind === 'estate')?.rooms || [];
      return { rooms: [...rooms], alias: MV ? MV.aliasMap(custom, ['room']) : {}, chat: chatId() || null }; },
    getOutfit: async () => ({ items: outfitNow ? { ...outfitNow } : null, text: MV ? MV.outfitText(outfitNow) : '' }),   // 主角着装（只读 MVU 主角.着装）
    getClock: async () => (clock ? { ...clock } : null),   // 世界时间（只读 MVU 世界.当前日期 / 当前时刻 / 当日时段）
    // 人物头像（v0.9.2）：只存本机 localStorage（按聊天，拿不到聊天 id 时全局），不上传、不进地址；src = data:image/… 或 http(s) 图片地址
    async setAvatar(name, src) { const v = inner(); if (v) return v.setAvatar(name, src); const C = await chx(), st = store(); return !!st && C.setAvatar(st, chatId(), name, src); },
    async removeAvatar(name) { const v = inner(); if (v) return v.removeAvatar(name); const C = await chx(), st = store(); return !!st && C.removeAvatar(st, chatId(), name); },
    async getCharacters() { return { items: chars.map(c => ({ ...c })), floor: floorNow }; },
    selfcheck: () => runCheck().then(() => ({ items: checkItems.map(i => ({ ...i })), at: checkAt })),   // 启动自检的结果（只在本机）
    on(ev, fn) { if (subs[ev] && typeof fn === 'function') subs[ev].add(fn); return api; },
    off(ev, fn) { if (subs[ev]) fn ? subs[ev].delete(fn) : subs[ev].clear(); return api; },
  });
  window.parent.EdenMap = api;

  // ---------------- 启动自检（E6；判定逻辑在 selfcheck.mjs，node 单测） ----------------
  // 每次页面加载空闲时跑一次：酒馆助手接口、MVU「世界.当前地点」、重复的地图脚本、线路（复用测速结果）、世界书附加条目（查得到才查）、脚本与地图版本。
  // 结果：地图设置里的「自检」一栏（✓ / ⚠，中 / EN）；有 ⚠ 时弹一次小提示（同一组警告只提示一次，不按聊天重复）；EdenMap.selfcheck() 取结果。
  // 正式版（钉了 map-v 标签）另外每天最多查一次 jsDelivr 数据接口的最新标签；有新版本时自检里给「本次切换」按钮，设置「自动更新到新正式版」默认关。
  // 除了这一个查询，不发任何请求；不上传、不统计。
  let SC = null, checkP = null, checkFacts = null, checkItems = [], checkAt = 0, viewerVer = null, updInfo = null, toastEl = null;
  const UPD_KEY = 'edenMapUpdate', AUTO_UPD_KEY = 'edenMapAutoUpdate', TOAST_KEY = 'edenMapCheckToast';
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const fnOk = n => { try { return typeof window[n] === 'function' || typeof globalThis[n] === 'function'; } catch (e) { return false; } };
  async function wbFacts() {   // 世界书：酒馆助手的新接口（getWorldbook）或旧接口（getLorebookEntries）；都没有 / 出错 → null（跳过）
    try {
      const names = new Set(), add = n => { if (n && typeof n === 'string') names.add(n); };
      let listed = false;
      if (fnOk('getGlobalWorldbookNames')) { listed = true; (await getGlobalWorldbookNames() || []).forEach(add); }
      else if (fnOk('getLorebookSettings')) { listed = true; ((await getLorebookSettings())?.selected_global_lorebooks || []).forEach(add); }
      if (fnOk('getCharWorldbookNames')) { listed = true; const c = await getCharWorldbookNames('current'); add(c?.primary); (c?.additional || []).forEach(add); }
      else if (fnOk('getCharLorebooks')) { listed = true; const c = await getCharLorebooks(); add(c?.primary); (c?.additional || []).forEach(add); }
      if (fnOk('getChatWorldbookName')) { listed = true; add(await getChatWorldbookName('current')); }
      else if (fnOk('getChatLorebook')) { listed = true; add(await getChatLorebook()); }
      const get = fnOk('getWorldbook') ? async n => (await getWorldbook(n) || []).map(e => ({ name: e.name, enabled: e.enabled }))
        : fnOk('getLorebookEntries') ? async n => (await getLorebookEntries(n) || []).map(e => ({ name: e.comment, enabled: e.enabled })) : null;
      if (!listed || !get) return null;
      const entries = []; for (const n of names) { try { entries.push(...await get(n)); } catch (e) {} }
      return { missing: SC.wbMissing(entries), lore: entries.some(e => e && e.enabled !== false && String(e.name || '').startsWith(SC.LORE_PREFIX)) };
    } catch (e) { return null; }
  }
  async function updateFacts() {   // 正式版才查；一天最多一次（不论成败），结果记在本机
    if (!VER || !swappable || !SC.swapVer(import.meta.url, VER)) return null;
    let c = null; try { c = JSON.parse(lsGet(UPD_KEY)); } catch (e) {}
    if (SC.dueCheck(c?.at, Date.now())) {
      let latest = c?.latest || null;
      try { const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
        const r = await fetch(SC.UPDATE_API(REPO), { credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal }).finally(() => clearTimeout(to));
        if (r.ok) latest = SC.latestTag(await r.json()) || latest; } catch (e) {}
      c = { at: Date.now(), latest }; lsSet(UPD_KEY, JSON.stringify(c));
    }
    return c?.latest ? { current: VER, latest: c.latest } : null;
  }
  function runCheck() {
    return checkP ??= (async () => {
      SC = await import(SELF + 'tavern/selfcheck.mjs');
      try { await Promise.race([waitGlobalInitialized('Mvu'), new Promise(r => setTimeout(r, 3000))]); } catch (e) {}
      let mvu = null;
      try { if (typeof Mvu !== 'undefined' && Mvu?.getMvuData) { const st = Mvu.getMvuData({ type: 'message', message_id: 'latest' })?.stat_data;
        mvu = { stat: !!st && typeof st === 'object', here: !!st && SC.getPath(st, SC.HERE_PATH) !== undefined, candidates: st ? SC.findPaths(st).filter(p => p !== SC.HERE_PATH) : [],
          fields: st && MV ? { present: !!MV.presentList(st), clock: !!MV.worldTime(st).time, outfit: MV.get(st, '主角.着装') !== undefined } : null }; } } catch (e) { mvu = { stat: false }; }
      const loads = [...new Set((window.parent.__edenMapLoads || []).filter(u => u !== SELF && u !== switchedFrom))];
      const ln = { swappable, name: (LINES.find(l => l.key === line) || {}).name || '',
        ok: !swappable ? null : lineP ? await lineP.then(ok => ok && fetchHtml().then(() => true, () => false), () => false) : html ? await html.then(() => true, () => false) : null };
      checkFacts = {
        api: { getChatMessages: fnOk('getChatMessages'), eventOn: fnOk('eventOn'), injectPrompts: fnOk('injectPrompts'), tavern_events: typeof tavern_events === 'object' },
        vars: varsOk(), ejs: (() => { try { return typeof (window.parent.EjsTemplate || globalThis.EjsTemplate) === 'object'; } catch (e) { return false; } })(),
        mvu, dup: { others: loads, oldStyle, replaced: !root.isConnected }, line: ln, worldbook: await wbFacts(), version: { script: VER, viewer: viewerVer }, update: await updateFacts(),
      };
      finishCheck();
      if (checkFacts.update && SC.cmpVer(checkFacts.update.latest, VER) > 0 && lsGet(AUTO_UPD_KEY) === '1') switchVersion();   // 用户开了「自动更新到新正式版」
    })().catch(e => { console.warn('[eden-map] 自检失败', e); });
  }
  function finishCheck() {
    checkFacts.version.viewer = viewerVer; updInfo = checkFacts.update;
    checkItems = SC.evaluate(checkFacts); checkAt = Date.now();
    for (const i of checkItems) if (i.status === 'warn') console.warn('[eden-map] 自检', i.zh);
    sendCheck(); toastOnce();
  }
  function sendCheck() { if (alive && checkItems.length) post({ type: 'eden-map:selfcheck', items: checkItems, canUpdate: !!(VER && swappable && SC?.swapVer(import.meta.url, VER)), autoUpdate: lsGet(AUTO_UPD_KEY) === '1' }); }
  function toastOnce() {   // 有 ⚠ 时弹一次小提示；同一组警告不再弹（换聊天也不弹）
    const sig = SC.warnSig(checkItems); if (!sig || sig === lsGet(TOAST_KEY)) return; lsSet(TOAST_KEY, sig);
    toastEl?.remove(); const t = toastEl = pdoc.createElement('div'); t.setAttribute('role', 'status');
    t.style.cssText = 'position:fixed;left:50vw;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom) + 76px);z-index:30002;max-width:min(420px,92vw);box-sizing:border-box;padding:10px 40px 10px 14px;border-radius:10px;background:#151b20;color:#d5dde4;border:1px solid rgba(230,195,106,.6);box-shadow:0 6px 20px rgba(0,0,0,.35);font:12px/1.55 "PingFang SC","Noto Sans SC",system-ui,sans-serif';
    const warns = checkItems.filter(i => i.status === 'warn'), L = UL === 'en' ? 'en' : 'zh';
    t.innerHTML = `<b style="color:#e6c36a">${UL === 'en' ? 'Map self-check' : '地图自检'}</b><button type="button" aria-label="${UI[UL].close}" style="position:absolute;right:4px;top:4px;width:32px;height:32px;border:0;background:none;color:#8591a0;font:18px/1 system-ui;cursor:pointer">×</button>`;
    for (const w of warns) { const d = pdoc.createElement('div'); d.textContent = '⚠ ' + w[L]; t.appendChild(d); }
    t.querySelector('button').onclick = () => t.remove(); pdoc.body.appendChild(t); setTimeout(() => t.remove(), 20000);
  }
  function switchVersion() {   // 本次会话换成新正式版：加载新标签的同一个脚本，它会清掉这一份（要长期用，重新导入新版脚本）
    const nv = updInfo?.latest, url = nv && SC?.swapVer(import.meta.url, nv);
    if (!url || SC.cmpVer(nv, VER) <= 0) return;
    window.parent.__edenMapSwitch = SELF;
    import(url).catch(e => { console.warn('[eden-map] 切换到新版本失败', e); window.parent.__edenMapSwitch = switchedFrom; });
  }

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

  // 单手（E7）：惯用手在地图设置里改（同源 localStorage；改了地图发 eden-map:state {hand}）
  // 惯用手选了左 / 右：悬浮按钮挪到那一侧（高度不变）并记住；自动 = 不动它（地图反过来按它在哪一半判断左右手）
  const HAND_KEY = 'edenMapHand';
  let handPref = 'auto'; try { handPref = localStorage.getItem(HAND_KEY) || 'auto'; } catch (e) {}
  const fabLeft = () => { const r = fab.getBoundingClientRect(); return r.left + r.width / 2 < window.parent.innerWidth / 2; };
  const applyHand = move => {
    if (move && (handPref === 'left' || handPref === 'right')) {
      const r = fab.getBoundingClientRect(), vh = window.parent.innerHeight, y = vh > 48 ? r.top / (vh - 48) : .85;
      const p = placeFab(handPref === 'left' ? .03 : .97, y); try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch (e) {}
    }
    panel.classList.toggle('em-left', handPref === 'left' || (handPref === 'auto' && fabLeft()));
  };
  { let saved = null; try { saved = localStorage.getItem(POS_KEY); } catch (e) {}
    if (!saved && handPref === 'left') placeFab(.03, Math.max(0, (window.parent.innerHeight - 144) / Math.max(1, window.parent.innerHeight - 48))); }   // 没拖过：左手默认放左下
  applyHand(false);
  fab.addEventListener('pointerup', () => { if (dragged && handPref === 'auto') applyHand(false); });
  const close = () => { if (panel.hidden || ghost) return; panel.hidden = true; flyNext = true; sleepViewer(); };
  fab.addEventListener('click', async () => { if (dragged) return;
    if (ghost) { ghost = false; clearTimeout(ghostT); panel.classList.remove('em-ghost'); fab.classList.remove('prep'); sent = null; push(); sendEvents(); return; }   // 预加载中被点开：直接显示，重新推一次地点（这次可以进庄园）
    fab.classList.remove('fail'); fab.querySelectorAll('.em-tip').forEach(t => t.remove());   // 提示不留在面板后面（v0.9.2）
    if (!panel.hidden) return close(); panel.hidden = false; await loadViewer(); });
  root.querySelector('.em-close').addEventListener('click', close);
  hereEl.addEventListener('click', () => { if (hereEl.title) hereEl.classList.toggle('em-full'); });
  // 宿主页的 Esc：只在焦点不在输入框里时关地图（在聊天框里按 Esc 不该把地图关掉，E5 r2 RP-6）
  const onKey = e => { if (e.key === 'Escape' && !e.target?.closest?.('input, textarea, select, [contenteditable]')) close(); };
  pdoc.addEventListener('keydown', onKey);

  (async () => {
    try { await waitGlobalInitialized('Mvu'); eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, () => { pushSoon(); recomputeSoon(); }); } catch (e) {}   // MVU 人物表也会变（人物栏）
    eventOn(tavern_events.CHAT_CHANGED, () => pushSoon(300));
    eventOn(tavern_events.MESSAGE_SWIPED, () => pushSoon(300));
    eventOn(tavern_events.CHAT_CHANGED, () => { injected = null; loadSeen(); custom = null; loadCustom().then(() => recomputeSoon(300)); });
    for (const k of ['MESSAGE_RECEIVED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_DELETED']) if (tavern_events[k]) eventOn(tavern_events[k], () => recomputeSoon());   // 新楼、改楼、重 roll、删楼：重算
    if (tavern_events.GENERATION_AFTER_COMMANDS) eventOn(tavern_events.GENERATION_AFTER_COMMANDS, () => { clearTimeout(evT); recompute(); });   // 生成前同步一次，注入的是最新态势
    push(); loadSeen(); recompute();
    (window.parent.requestIdleCallback || (f => setTimeout(f, 1500)))(() => { preload().catch(() => {}); setTimeout(runCheck, 4000); });   // 打开聊天后空闲时：测速选线 + 预加载；稍后自检一次
  })();

  // 脚本被关闭或重载时清理注入的元素
  const cleanup = () => { clearTimeout(killT); clearTimeout(pushT); clearTimeout(evT); try { inject(''); } catch (e) {} root.remove(); window.parent.removeEventListener('message', onMsg); pdoc.removeEventListener('keydown', onKey);
    if (window.parent.EdenMap === api) delete window.parent.EdenMap; toastEl?.remove();
    if (window.parent.__edenMapCleanup === cleanup) delete window.parent.__edenMapCleanup; };
  window.parent.__edenMapCleanup = cleanup;
  window.addEventListener('pagehide', cleanup);
})();
