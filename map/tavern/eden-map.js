// 伊甸庄园 · 世界地图悬浮按钮（酒馆助手脚本）
// 卡内脚本只需一行：import 'https://cdn.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@<版本>/map/tavern/eden-map.js'
// 注入酒馆页面：右下角悬浮按钮 + 地图面板；面板内用 srcdoc 加载 viewer.html（<base> 指回仓库，相对资源照常加载）。
// 当前地点取 MVU 变量「世界.当前地点」，变量更新 / 切换聊天时推送给地图高亮。
// 天城事态：从最近 80 楼原文解析事件标签（events.mjs，两种写法都认），推给地图落点；角色所在层的活跃事件压成一句注入给模型。
// v0.9.3 MVU 联动（mvu.mjs）：只读 stat_data（世界时间、主角着装、在场人物）；自定义名称与用途存在聊天变量顶层键 eden_map（不进 stat_data，见 docs/content-compat.md）。
// C2 第 4 步（2026-09-28）拆成：入口（本文件：面板 / 查看器状态机、消息、MVU / 事态 / 自定义 / 自检 / 更新）+ host-routes.mjs（线路）
// + host-lifecycle.mjs（接管旧实例、挂 DOM、监听登记、清理钩子）+ host-th.mjs（酒馆助手适配、偏好、世界书全自动）。见 docs/agent-brief.md「模块地图」。
import { cdnFetch, thFn, fnOk, hostFn, packNs, createPrefs, createWbAuto } from './host-th.mjs';
import { createRoutes } from './host-routes.mjs';
import { createLife, takeOver, mount, install } from './host-lifecycle.mjs';
(() => {
  const SELF = new URL('../', import.meta.url).href;            // .../map/（脚本自己加载的位置）
  // 地基 A1 cdnFetch、设定包命名空间（NS / LS / lsGet / lsSet）：host-th.mjs
  const { PACK_IN, PACK_ID, wrapLS, LS, lsGet, lsSet } = packNs();
  const life = createLife(), { listen } = life;   // 监听登记与「死亡」标记（host-lifecycle.mjs）
  // 协议 v2（core/protocol.mjs，docs/design/arch-v2.md §3）：发出的消息盖 v；收到的消息按 schema 校验（模块没到时照旧处理）
  const PROTO = 2; let PRm = null;   // 与 core/protocol.mjs PROTO 一致（tests/protocol.test.mjs 检查）
  import(SELF + 'core/protocol.mjs').then(m => { PRm = m; }).catch(() => {});
  let FOGm = null, explored = {}; import(SELF + 'core/depth.mjs').then(m => { FOGm = m; explored = m.norm(explored); }).catch(() => {});   // 迷雾探索（eden_map.探索）
  let SRCm = null; import(SELF + 'tavern/sources.mjs').then(m => { SRCm = m; }).catch(() => {});   // 数据源注册表（arch-v2 §6 第 8 步）
  // 线路 / 版本推断：host-routes.mjs
  const { PKG, REPO, LINES, LINE_KEY, swappable, VER, tagOf, plainVer, baseFor, LINE_TTL, LINE_AT, race } = createRoutes({ SELF, PACK_IN });
  let line = null; try { line = (LS || localStorage).getItem(LINE_KEY); } catch (e) {}
  if (!LINES.some(l => l.key === line)) line = null;
  let BASE = baseFor(line);
  const pdoc = window.parent.document;
  const ID = 'eden-map-root';
  // 自检用（E6）：旧版脚本（v0.6.1）用同一个 id 但没有清理钩子；本页加载过哪些地图脚本地址；是不是「更新到新版本」切过来的
  const oldStyle = !!pdoc.getElementById('eden-map-root') && !window.parent.__edenMapCleanup;
  const switchedFrom = window.parent.__edenMapSwitch || null;
  // 地基 A3：多实例身份用 getScriptId()（同一脚本换版本 / 重载 id 不变，不再误报「另一个地图脚本」）；没有这个接口时退回脚本地址。登记在 __edenMapIds { 身份: 地址 }
  const OWNER = (() => { try { const id = thFn('getScriptId')?.(); if (typeof id === 'string' && id) return 's:' + id; } catch (e) {} return 'u:' + SELF; })();
  try { (window.parent.__edenMapIds ||= {})[OWNER] = SELF; } catch (e) {}
  // 地基 A4：偏好存脚本变量（host-th.mjs createPrefs；键表 = core/storage.mjs SCRIPT_KEYS）
  const prefs = createPrefs(LS), prefSync = prefs.sync, onStorage = prefs.onStorage;
  { const pl = prefs.obj()?.edenMapLine; if (pl && pl !== line && LINES.some(l => l.key === pl)) { line = pl; BASE = baseFor(line); } }   // 线路在上面已按本机读过：脚本变量优先
  window.addEventListener('storage', onStorage);
  takeOver(pdoc, ID, OWNER);   // 幂等：先清掉上一份（host-lifecycle.mjs）

  const root = mount(pdoc, ID, OWNER);   // 悬浮按钮 + 面板（样式与结构在 host-lifecycle.mjs）

  const fab = root.querySelector('.em-fab'), panel = root.querySelector('.em-panel'), frame = root.querySelector('.em-frame');
  const hereEl = root.querySelector('.em-here'), loadEl = root.querySelector('.em-load'), titleEl = root.querySelector('.em-title');
  const pickEl = root.querySelector('.em-pick'), lineBtn = root.querySelector('.em-line'), clockEl = root.querySelector('.em-clock');
  lineBtn.hidden = !swappable;
  // 标题栏跟着地图的语言与深浅主题（地图在 srcdoc 里，与酒馆页同源，设置存在同一个 localStorage；切换时地图发 eden-map:state {lang, theme}）
  const UI = { zh: { title: '新历 2088', clock: '世界时间', map: '地图', here: '当前地点：', line: '线路：', unset: '未选', close: '关闭', load: '加载地图 {p}%', open: '打开世界地图', fab: '世界地图', unm: '未上图：', unm_tip: '点这里把它放到地图上', pend: '等待本楼变量更新', stale: '本楼没有变量快照，显示的是上一楼的' },
    en: { title: 'NC 2088', clock: 'World time', map: 'Map', here: 'Location: ', line: 'Route: ', unset: 'not set', close: 'Close', load: 'Loading map {p}%', open: 'Open world map', fab: 'World map', unm: 'Not on map: ', unm_tip: 'Tap to place it on the map', pend: 'waiting for this reply\'s variable update', stale: 'no variable snapshot on this reply; showing the previous one' } };
  let UL = 'zh', mapTitle = ''; try { UL = (LS || localStorage).getItem('edenMapLang') === 'en' ? 'en' : 'zh'; } catch (e) {}
  const U = k => UI[UL][k];
  // 深 / 浅主题挂在根元素上（面板、自检提示一起换）；地图没开着时系统切换深浅也跟上（v0.9.5）
  const themeMq = window.parent.matchMedia?.('(prefers-color-scheme: light)');
  const hostTheme = th => root.classList.toggle('em-light', th === 'light' || (th === 'auto' && !!themeMq?.matches));
  const storedTheme = () => { try { return (LS || localStorage).getItem('edenMapTheme') || 'auto'; } catch (e) { return 'auto'; } };
  hostTheme(storedTheme());
  const onThemeMq = () => { if (storedTheme() === 'auto') hostTheme('auto'); };
  themeMq?.addEventListener?.('change', onThemeMq);
  // v0.9.6：线路按钮只写短名（「有梯子」/「Global」），完整说明放 title；以前「线路：没梯子」在手机上截成「线路：…」、英文「Route: C…」
  const showLine = () => { const l = LINES.find(x => x.key === line), full = l ? (UL === 'en' && l.name_en) || l.name : U('unset');
    lineBtn.textContent = '⇄ ' + (l ? (UL === 'en' ? l.short_en || l.name_en : l.name) : U('unset')); lineBtn.title = U('line') + full; lineBtn.setAttribute('aria-label', U('line') + full); };
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
      cdnFetch(baseFor(l.key) + 'data/maps.json', { cache: 'no-store', signal: ctl.signal })
        .then(r => { if (!r.ok) throw 0; const t = (performance.now() - t0) / 1000; ms.textContent = `延迟 ${t.toFixed(1)} 秒`; ms.className = 'ms ' + (t < 3 ? 'ok' : '');
          // 先测完的就是更快的线路：标「推荐」
          if (!row.querySelector('.rec')) ms.insertAdjacentHTML('beforeend', ' · <b class="rec">推荐</b>'); })
        .catch(() => { ms.textContent = '连不上'; ms.className = 'ms bad'; });
    }
    pickEl.hidden = false; loadEl.hidden = true;
  }
  function chooseLine(key) {
    const changed = key !== line; line = key; try { (LS || localStorage).setItem(LINE_KEY, key); (LS || localStorage).setItem(LINE_KEY + 'Manual', '1'); } catch (e) {} prefSync();
    showLine(); pickEl.hidden = true;
    if (changed) { BASE = baseFor(key); html = null; unloadViewer(); }
    loadViewer();
  }
  lineBtn.addEventListener('click', showPicker);

  async function autoLine(force = false) {
    if (!swappable) return true;
    let manual = false, at = 0; try { manual = (LS || localStorage).getItem(LINE_KEY + 'Manual') === '1'; at = +(LS || localStorage).getItem(LINE_AT) || 0; } catch (e) {}
    if (manual && line) return true;
    if (!force && line && Date.now() - at < LINE_TTL) return true;   // 24 小时内测过：直接用
    const key = await race();
    if (!key) return false;
    try { (LS || localStorage).setItem(LINE_AT, String(Date.now())); } catch (e) {}
    if (key !== line) { line = key; BASE = baseFor(key); html = null; try { (LS || localStorage).setItem(LINE_KEY, key); } catch (e) {} prefSync(); showLine(); }
    return true;
  }
  // 预加载：在看不见的面板里把地图程序、数据和首屏瓦片加载一遍（进浏览器缓存），然后休眠释放内存。点按钮时基本秒开
  let ghost = false, ghostT = 0, lineP = null;   // lineP：测速选线的结果（自检复用，不再多测一次）
  // 省流：系统省流（saveData）、2g / 3g、内存 ≤ 4 GB 时，后台只取地图程序（viewer.html）和启动 JSON，不开幽灵面板、不拉瓦片（E4 N02）
  // 触屏且网络 / 内存信息都拿不到（iOS WebKit）也按省流预热（E6）；这只影响后台预热，清晰度档位由地图自己定
  const touchUnknown = () => { const n = window.parent.navigator || navigator; return !n.connection && !('deviceMemory' in n) && !!window.parent.matchMedia?.('(pointer: coarse)').matches; };
  const lean = () => { const c = navigator.connection || {}; return !!c.saveData || /(^|-)(2g|3g)$/.test(c.effectiveType || '') || (navigator.deviceMemory || 8) <= 4 || touchUnknown(); };
  let preDone = null; const preP = new Promise(r => { preDone = r; });   // v0.9.5 开场自检等它：预加载结束（成功、失败、被用户点开打断都算）
  async function preload() {
    if (!panel.hidden || alive) return preDone();
    fab.classList.add('prep'); fab.title = '地图预加载中…';
    if (!(await (lineP = autoLine()))) { fab.classList.remove('prep'); fab.classList.add('fail'); fab.title = '地图线路都连不上，点开手动选择'; preDone(); return; }
    if (!panel.hidden || alive) { fab.classList.remove('prep'); preDone(); return; }   // 测速期间用户已经点开了
    if (lean()) {
      htmlProg = f => fab.style.setProperty('--p', Math.round(f * 80));
      try { await fetchHtml(); await Promise.all(['packs/eden/manifest.json', 'data/maps.json', 'data/world_markers.json', 'data/derived.json'].map(u => cdnFetch(BASE + u).catch(() => null)));
        fab.classList.remove('prep'); fab.title = '世界地图'; }
      catch (e) { fab.classList.remove('prep'); fab.classList.add('fail'); fab.title = '地图预加载失败，点开重试'; }
      finally { htmlProg = null; preDone(); }
      return;
    }
    ghost = true; panel.classList.add('em-ghost'); panel.hidden = false;
    ghostT = setTimeout(() => endGhost(false), 25000);   // 网络太慢也不无限挂着
    loadViewer();
  }
  function endGhost(ok) {
    preDone(); if (!ghost) return; ghost = false; clearTimeout(ghostT);
    // 失败不画满进度环（之前 endProg 会 setProg(100)，看起来像成功了，E4 N06）
    if (ok) endProg(); else { clearInterval(watchT); loadEl.hidden = true; }
    panel.hidden = true; panel.classList.remove('em-ghost'); sleepViewer();
    fab.classList.remove('prep'); fab.title = '世界地图';
    if (ok) { fab.classList.add('ready'); setTimeout(() => fab.classList.remove('ready'), 2000); }
    else { fab.classList.add('fail'); fab.title = '地图预加载失败，点开重试'; }
  }
  let html = null, here = '', alive = false, sent = null, killT = 0, unm = null;   // unm（v0.9.6）：地图说当前地点「未上图」时的名字
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
    const r = await cdnFetch(BASE + 'viewer.html'); if (!r.ok) throw new Error(r.status);
    const total = +r.headers.get('content-length') || 0; let t;
    if (r.body && total) {   // 按已收字节算进度
      const rd = r.body.getReader(), parts = []; let n = 0;
      for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); n += value.length; htmlProg?.(n / total); }
      t = new TextDecoder().decode(await new Blob(parts).arrayBuffer());
    } else t = await r.text();
    return t.replace('<head>', `<head><base href="${BASE}">` + (PACK_IN ? `<script>window.__tcPack=${JSON.stringify(PACK_IN).replace(/</g, '\\u003c')}</script>` : ''));
  })().catch(e => { html = null; throw e; });
  // 地基 A5：空闲预取在生成期间暂停（聊天首屏与流式输出优先），GENERATION_ENDED / STOPPED 后再补做
  const idleQ = [];
  const afterGen = f => { if (typeof GEN !== 'undefined' && GEN.generating) idleQ.push(f); else f(); };
  const flushIdle = () => { for (const f of idleQ.splice(0)) { try { if (!life.dead) f(); } catch (e) {} } };
  if (line || !swappable) (window.parent.requestIdleCallback || (f => setTimeout(f, 2000)))(() => afterGen(() => fetchHtml().catch(() => {})));
  // 每次真正打开地图（不是后台幽灵预加载）查一次更新：提示等面板关上再弹。通读 R1 / R2：打开面板时重读一次（开局切换、状态栏改变量可能没发事件）
  function scheduleAutoCheck() { if (typeof autoCheck === 'function') setTimeout(() => { if (!life.dead) { autoCheck().catch(() => {}); followCheck().catch(() => {}); } }, 3000); }
  // 打开：休眠中的地图直接唤醒；否则创建。关闭：先休眠（地图关掉底图、释放瓦片内存，脚本和数据留着），超时再销毁
  async function loadViewer() {
    clearTimeout(killT); if (typeof recomputeSoon === 'function') { recomputeSoon(0); pushSoon(0); }
    if (!ghost) scheduleAutoCheck();   // ghost（后台预加载）时跳过：真正打开时（fab 点开）补一次，见 fab click 里的 ghost 分支
    if (swappable && !line) return showPicker();   // 还没选线路：先选
    if (alive) { post({ type: 'eden-map:wake', fly: flyQ }); flyQ = null; sent = null; push(); sendEvents(); return; }   // fly：EdenMap.flyTo 唤醒面板时直接飞过去，不先回上次的图
    startProg(); htmlProg = f => setProg(f * 20);
    let doc;
    try { doc = await fetchHtml(); setProg(20); }
    catch (e) { try { (LS || localStorage).removeItem(LINE_AT); } catch (x) {} autoLine(true).catch(() => {});   // 这条线路失败：下次重测（v0.9.5）
      hintEl.textContent = '地图程序下载失败，可以重试或换一条线路'; actsEl.hidden = false; clearInterval(watchT); if (ghost) endGhost(false); return; }
    finally { htmlProg = null; }
    if (panel.hidden) return;   // 取页面期间面板又被关了
    frame.onload = () => { setHostToken(); push(); };
    setHostToken();
    frame.srcdoc = doc;
  }
  function unloadViewer() { alive = false; frame.onload = null; frame.removeAttribute('srcdoc'); frame.src = 'about:blank'; mapTitle = ''; showTitle(); }
  // 宿主令牌（2026-09-27 接手 review P1）：查看器只认带这个令牌的消息。脚本跑在卡片 iframe 里、查看器挂在宿主页上时
  // 「消息来源窗口」并不是查看器的 parent，所以只比对 e.source 会把真宿主也挡掉；令牌写在查看器窗口上，只有能碰到这个窗口的脚本才拿得到。
  const HOST_TOKEN = 'ek' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const setHostToken = () => { try { const w = frame.contentWindow; if (w) w.__edenHostToken = HOST_TOKEN; } catch (e) {} };
  function sleepViewer() {
    if (!alive) return unloadViewer();
    post({ type: 'eden-map:sleep' }); clearTimeout(killT); killT = setTimeout(unloadViewer, SLEEP_MS);
  }
  const post = msg => { if (!life.dead) { setHostToken(); frame.contentWindow?.postMessage({ ...msg, v: PROTO, t: HOST_TOKEN }, '*'); } };   // srcdoc 换页后属性会丢，每次发消息前补一次
  let flyQ = null;   // EdenMap.flyTo 在地图就绪前调用时排队
  // 地图 → 酒馆：ready 撤掉遮罩；state 更新面板标题。只接受来自本面板 iframe 的消息
  const onMsg = e => {
    if (e.source !== frame.contentWindow || (PRm && !PRm.accept(e.data, '（查看器 → 宿主）'))) return;
    if (e.data?.type === 'eden-map:boot') setProg(20 + e.data.pct * 30);
    if (e.data?.type === 'eden-map:ready') { post({ type: 'eden-map:lang', lang: UL }); sendBar(); sendAbout(); alive = true; sentClock = sentOutfit = charsSent = null; knowRooms(); sendCheck(); sendCustom(); sendTrips(); sendTh(); varSig = ''; refreshVarMap(); setProg(50); loadEl.classList.add('over'); sent = null; push(); sendEvents(); if (panel.hidden) sleepViewer(); }
    if (e.data?.type === 'eden-map:ready' && setQ) { const q = setQ; setQ = null; setTimeout(() => post({ type: 'eden-map:settings', page: q }), 0); }
    if (e.data?.type === 'eden-map:ready' && flyQ) { const q = flyQ; flyQ = null; setTimeout(() => inner()?.flyTo?.(q), 0); }   // EdenMap.flyTo 排队的
    if (e.data?.type === 'eden-map:progress' && !loadEl.hidden) setProg(50 + e.data.pct / 2);
    if (e.data?.type === 'eden-map:loaded') { endProg(); if (ghost) endGhost(true); }
    if (e.data?.type === 'eden-map:state') {
      if (e.data.lang && e.data.lang !== UL && UI[e.data.lang]) { UL = e.data.lang; try { (LS || localStorage).setItem('edenMapLang', UL); } catch (x) {} prefSync(); showLine(); push(); }   // 地图里切了语言：标题栏跟着换并记下（两边只有一个设置）
      if (e.data.theme) hostTheme(e.data.theme);
      if (e.data.hand && e.data.hand !== handPref) { handPref = e.data.hand; applyHand(true); }
      mapTitle = e.data.title || ''; showTitle(); }
    if (e.data?.type === 'eden-map:esc') close();   // 地图里没有可关的卡片 / 列表时，Esc 关闭面板
    if (e.data?.type === 'eden-map:line-pick') showPicker();
    if (e.data?.type === 'eden-map:storage-info' || e.data?.type === 'eden-map:storage-clean') {   // 设置「数据与映射」：存储占用、数据来源；清理 = 只留最近 5 个聊天的地图数据
      (async () => { let cleaned = null; const st = store();
        if (e.data.type === 'eden-map:storage-clean' && BG && st && Date.now() - (window.__edenCleanAt || 0) > 10000) { window.__edenCleanAt = Date.now();   // 只认本面板 iframe（onMsg 的 e.source 检查）；10 秒内只清一次
          try { cleaned = BG.sweep(st, chatId(), 5); } catch (x) { console.warn('[eden-map] 清理失败', x); cleaned = { error: true, dropped: [], freed: 0 }; } }
        else if (e.data.type === 'eden-map:storage-clean') cleaned = { limited: true, dropped: [], freed: 0, wait: Math.max(1, Math.ceil((10000 - (Date.now() - (window.__edenCleanAt || 0))) / 1000)) };   // 10 秒内再点：明确回「请稍后再试」，不再无声无息
        const [s, src] = await Promise.all([api.storage().catch(() => null), api.sources().catch(() => null)]);
        let cleanable = null; try { if (BG && st) { const c = chatId(); cleanable = Math.max(0, BG.chatsByAge(st, c).length + (c ? 1 : 0) - 5); } } catch (x) {}   // 与 sweep 同一算法，确认文案里的数字 = 实际会清的个数
        post({ type: 'eden-map:storage-result', cleanable, storage: s && { total: s.total, ours: s.ours, avatars: s.avatars, chats: Object.keys(s.chats || {}).length }, sources: src, cleaned: cleaned && { n: cleaned.dropped.length, bytes: cleaned.freed, error: !!cleaned.error, limited: !!cleaned.limited, wait: cleaned.wait || 0 } }); })(); }   // UI v2：线路选择在地图设置「高级」
    if (e.data?.type === 'eden-map:chrome') { chromeAt = { top: +e.data.top || 44, bottom: +e.data.bottom || 0 }; NT?.refresh(); }   // 抽屉高度：P2 提示放在它上方
    if (e.data?.type === 'eden-map:formbusy') { formBusy = !!e.data.on; NT?.refresh(); }
    if (e.data?.type === 'eden-map:notice' && e.data.n && typeof e.data.n === 'object') viewerNotice(e.data.n);   // 查看器的通知由宿主统一显示
    if (e.data?.type === 'eden-map:unmapped') { const n = typeof e.data.name === 'string' && e.data.name ? e.data.name : null; if (n !== unm) { unm = n; push(); } }   // v0.9.6：地图认不出当前地点 → 标题栏「未上图：…」
    if (e.data?.type === 'eden-map:emit' && e.data.ev === 'map') emit('map', e.data.data);   // 本机扩展：切图（E6）
    if (e.data?.type === 'eden-map:build') { viewerVer = e.data.version || null; if (checkFacts) finishCheck(); }   // 地图的版本（data/build.json）→ 自检比对
    if (e.data?.type === 'eden-map:update-now') switchVersion();   // 自检里点了「本次切换到新版本」
    // v0.9.3 自定义（地图设置里的「自定义」一栏）：地图只发请求，数据由这里写进聊天变量后再推回去
    if (e.data?.type === 'eden-map:custom-set') api.setCustom(e.data.key, e.data.patch || {});
    if (e.data?.type === 'eden-map:custom-reset') api.removeCustom(e.data.key);
    if (e.data?.type === 'eden-map:explore' && FOGm && custom) { const r = FOGm.visit(explored, e.data.map, e.data.name); if (r.changed) { explored = r.ex; saveRoot(); } }   // 迷雾探索：只在查看器开着迷雾时才发
    if (e.data?.type === 'eden-map:explore-reset' && custom) { explored = {}; saveRoot(); post({ type: 'eden-map:fog', explored }); }
    if (e.data?.type === 'eden-map:custom-sync') api.setWorldbookSync(!!e.data.on);
    if (e.data?.type === 'eden-map:splash') showSplash();   // 设置「重新显示开场自检」
    if (e.data?.type === 'eden-map:varmap-set') setVarUser(e.data.user);   // v0.9.5 设置「变量映射」
    if (e.data?.type === 'eden-map:compose' && typeof e.data.text === 'string') composeIn(e.data.text);   // v0.9.6 地图 → 聊天：只填不发
    if (e.data?.type === 'eden-map:th' && typeof e.data.op === 'string') onTh(e.data).catch(x => console.warn('[eden-map] 酒馆助手设置', x));   // 设置「数据与映射」「高级」：注入 / 类宏 / 世界书同步
    if (e.data?.type === 'eden-map:check-update') (channel() === 'follow' && SCRIPT.ref ? followUpdate() : checkUpdate()).then(r => post({ type: 'eden-map:update-result', ...r }));   // v0.9.6「检查更新」
  };
  window.parent.addEventListener('message', onMsg);
  // 合并顶栏：宿主栏的宽度告诉查看器，查看器顶栏右端让出这一段；线路按钮移进查看器设置「高级」
  const hbarEl = root.querySelector(".em-bar");
  const sendBar = () => { post({ type: 'eden-map:hostbar', w: Math.ceil(hbarEl.getBoundingClientRect().width), side: panel.classList.contains('em-left') ? 'left' : 'right' }); post(lineMsg()); };
  // fix3：设置「高级 · 加载线路」显示当前线路，以及是自动测速选的还是手动选的
  function lineMsg() { let manual = false; try { manual = (LS || localStorage).getItem(LINE_KEY + 'Manual') === '1'; } catch (e) {} const l = LINES.find(x => x.key === line);
    return { type: 'eden-map:line', swappable, name: l ? (UL === 'en' && l.name_en) || l.name : '', manual }; }
  let barRO = null; try { barRO = new ResizeObserver(() => { if (alive && !life.dead) sendBar(); }); barRO.observe(hbarEl); } catch (e) {}
  // ---------------- UI v2 唯一通知层（ui/notice.mjs，spec §3）：P0 强制更新 / P1 更新、自检、存储 / P2 新事态、查看器转来的提示 ----------------
  let NT = null, chromeAt = { top: 44, bottom: 0 }, formBusy = false;
  const ntReady = import(SELF + 'ui/notice.mjs').then(m => {
    NT = m.createNotices({ doc: pdoc, mount: root, root: '#' + ID, baseCls: 'em-ctoast', en: UL === 'en', busy: () => formBusy && !panel.hidden, inertEls: () => [frame, hbarEl],
      anchor: () => { if (panel.hidden || ghost) return null; const r = panel.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, top0: chromeAt.top, bottom0: chromeAt.bottom, modal: true }; } });
    return NT; }).catch(e => { console.warn('[eden-map] 通知层加载失败', e); return null; });
  // 查看器发来的通知（嵌入时它不自己画）：按钮点了回传 eden-map:notice-act
  function viewerNotice(n) {
    const lv = [0, 1, 2].includes(n.level) ? n.level : 2, key = 'vw:' + String(n.key || Date.now()).slice(0, 60);
    const push = () => NT?.push({ key, level: lv, title: String(n.title || ''), lines: (Array.isArray(n.lines) ? n.lines : []).map(String).slice(0, 6),
      actions: (Array.isArray(n.actions) ? n.actions : []).slice(0, 3).map(a => ({ label: String(a.label || ''), primary: !!a.primary, run: () => post({ type: 'eden-map:notice-act', key: n.key, id: a.id }) })) });
    NT ? push() : ntReady.then(push);
  }
  // v0.9.6 地图 → 聊天（tavern/compose.mjs）：卡片上「去这里」「追问这件事」的句子填进酒馆输入框；从不调用发送
  let CPm = null;
  async function composeIn(text) {
    try { CPm ??= await import(SELF + 'tavern/compose.mjs'); } catch (e) { return; }
    const how = CPm.insert(window.parent, text, typeof triggerSlash === 'function' ? triggerSlash : null);
    post({ type: 'eden-map:compose-done', ok: !!how, how });
  }
  // ---------------- v0.9.6 版本与检查更新 ----------------
  // 版本信息：预览 / 正式脚本在 import 前写 window.__edenMapScript = { version, code, channel: tag | follow | ref, ref, sha }（tools/build_preview_script.py 烘进去）；
  // 没有（旧脚本、本地）时按脚本地址推断，版本号与构建号取当前线路的 data/build.json。
  const SCRIPT = (() => { try { return window.__edenMapScript || window.parent.__edenMapScript || {}; } catch (e) { return {}; } })();
  const refOf = () => (SELF.match(/@([^/]+)\/map\/$/) || [])[1] || '';
  const channel = () => SCRIPT.channel || (VER ? 'tag' : swappable ? 'ref' : 'local');
  let aboutBuild = null;
  const buildNow = () => aboutBuild ??= cdnFetch(BASE + 'data/build.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
  async function sendAbout() { const b = await buildNow(), l = LINES.find(x => x.key === line);
    post({ type: 'eden-map:about', version: b?.version || SCRIPT.version || VER || null, code: b?.code || SCRIPT.code || null, channel: channel(),
      ref: SCRIPT.ref || (VER ? tagOf(VER) : refOf()), sha: SCRIPT.sha || null, build: Number.isInteger(SCRIPT.build) ? SCRIPT.build : null, source: SCRIPT.source || null, locked: !!SCRIPT.locked, line: l ? (UL === 'en' && l.name_en) || l.name : '' }); }
  // 查最新 map-v 标签（jsDelivr 数据接口，绕缓存），再取该标签的 build.json（走当前线路）；比较版本号。只报告，不安装
  async function followUpdate() {   // 跟随分支：设置里「检查更新」走 head.json 链（和加载器、followCheck 一样；不看正式版标签）
    const h = await followHead(); if (!h) return { status: 'fail', follow: true };
    return { status: followNewer(h) ? 'new' : 'latest', follow: true, build: h.build, sha: String(h.sha).slice(0, 12), source: h.source, cur: SCRIPT.build ?? null };
  }
  async function checkUpdate() {
    try {
      SC ??= await import(SELF + 'tavern/selfcheck.mjs');
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10000);
      const j = await cdnFetch(SC.UPDATE_API(REPO) + '?t=' + Date.now(), { cache: 'no-store', signal: ctl.signal }).then(r => r.ok ? r.json() : null).finally(() => clearTimeout(to));
      const latest = SC.latestTag(j); if (!latest) return { status: 'fail' };
      const host = (LINES.find(x => x.key === line) || LINES[0]).host || 'cdn.jsdelivr.net';
      const lb = await cdnFetch(`https://${host}/gh/${REPO}@${SC.tagOf(latest)}/map/data/build.json?t=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
      const cur = SC.buildVer(await buildNow()) || SCRIPT.version || VER;
      return { ...SC.updateVerdict(cur, latest, channel()), code: lb?.code || null, min: lb?.min_version || null, reason: lb?.force_reason || '', notes: `https://github.com/${REPO}/blob/${SC.tagOf(latest)}/CHANGELOG.md` };
    } catch (e) { return { status: 'fail' }; }
  }
  // ---------------- v0.9.5 变量映射（换卡兼容；tavern/adapter.mjs）：按角色卡存本机，缺了自动找；设置「变量映射」里可改 ----------------
  let varAD = null, varUser = {}, varMap = { location: '世界.当前地点' }, varSig = '', varCard = '';
  // A-3：一轮（同一个同步任务）只取一次 stat_data 快照；push / refreshVarMap / recompute / 自检共用，微任务里作废
  let statSnap;   // undefined = 本轮还没取
  // v0.9.9（docs/mvu-integration.md）：最新楼的当前 swipe 没有快照（生成中 / 新 swipe / 生成断在半路 / 解析失败）时，往前取最近一份快照并标「未确认」，不再读成空
  let SNP = null, snapState = 'ok', snapFloor = -1, snapTop = -1; const GEN = { since: 0, get generating() { return !!this.since && Date.now() - this.since < 180000; } };
  import(new URL('snapshot.mjs', import.meta.url).href).then(m => { SNP = m; pushSoon(0); }).catch(() => {});
  const readFloor = i => { const c = SillyTavern?.chat?.[i]; return c ? { vars: c.variables?.[c.swipe_id ?? 0], system: !!c.is_system, role: c.is_user ? 'user' : 'assistant' } : null; };
  const mvuStat = () => { if (statSnap !== undefined) return statSnap; let v = null, stt = 'ok';
    try { v = Mvu.getMvuData({ type: 'message', message_id: 'latest' })?.stat_data || null; } catch (e) {}
    if (SNP) { try { const ch = SillyTavern?.chat; if (Array.isArray(ch) && ch.length) { const r = SNP.pickStat(readFloor, ch.length - 1, { generating: GEN.generating }); snapFloor = r.floor; snapTop = r.top; if (!v || r.floor === r.top) v = r.stat || v; stt = v ? r.state : (typeof Mvu === 'undefined' ? 'ok' : r.state); } } catch (e) {} }
    snapState = stt; statSnap = v; queueMicrotask(() => { statSnap = undefined; }); return v; };
  const cardKey = () => { try { const c = SillyTavern.getContext(); return c.characters?.[c.characterId]?.avatar || c.name2 || ''; } catch (e) { return ''; } };
  import(SELF + 'tavern/adapter.mjs').then(m => { if (PACK_IN) m.useDefaults(PACK_IN.manifest?.vars); varAD = m; refreshVarMap(); push(); }).catch(() => {});
  function refreshVarMap() {
    if (!varAD) return; const card = cardKey(); if (card !== varCard) { varCard = card; varUser = varAD.readUser(LS || localStorage, card); }
    const st = mvuStat();
    varMap = varAD.effective(varUser, st);
    const sig = JSON.stringify([varMap, varUser, !!st]); if (sig !== varSig) { varSig = sig; sendVarMap(st); }
  }
  function sendVarMap(st) {
    if (!alive || !varAD) return; if (st === undefined) st = mvuStat();
    post({ type: 'eden-map:varmap', card: varCard, paths: varAD.paths(st), map: varMap, user: varUser, detected: varAD.detect(st), fields: varAD.rowFields?.(st) || [], mode: varAD.mode(typeof Mvu !== 'undefined', st, varMap) });
  }
  function setVarUser(u) { if (!varAD) return; varUser = u && typeof u === 'object' ? u : {}; varAD.writeUser(LS || localStorage, varCard, varUser); varSig = ''; refreshVarMap(); recomputeSoon(50); push(); if (checkP) checkP.then(() => { checkP = null; runCheck(); }); }   // 自检重跑，读法跟着变
  // 表格数据库插件（tavern/shujuku.mjs）：只读。MVU 读不到地点时，当前地点改读它的「全局 / 主角」表；它的表更新时重算
  let DBm = null, dbCb = null, dbApiRef = null, hereFromDb = false, hereSrc = 'mvu';   // hereSrc：当前地点来自 mvu / tag（标签对账，交互方式 d）/ db
  import(SELF + 'tavern/shujuku.mjs').then(m => { DBm = m; dbHook(); pushSoon(0); recomputeSoon(0); }).catch(() => {});
  const dbApi = () => { if (!DBm) return null; const a = DBm.findApi([window.parent, window.top]); if (a) dbHook(a); return a; };
  function dbHook(a) {   // 插件可能比地图晚加载：每次取接口时补登记一次更新回调
    a ||= DBm?.findApi([window.parent, window.top]); if (!a || a === dbApiRef || life.dead) return; dbApiRef = a;
    dbCb = () => { pushSoon(); recomputeSoon(); };
    try { a.registerTableUpdateCallback?.(dbCb); } catch (e) {}
  }
  const dbData = () => { const a = dbApi(); if (!a) return null; try { return a.exportTableAsJson(); } catch (e) { return null; } };
  function getHere() {
    let v = '';
    try {
      const st = mvuStat();
      v = String(varAD ? varAD.get(st, varMap.location) ?? '' : st?.世界?.当前地点 || '');
    } catch (e) {}
    hereFromDb = false; hereSrc = 'mvu';
    // 交互方式 (d) 标签对账：MVU 为准；本楼 MVU 还没有快照（生成中 / 缺快照）或读不到地点时，改用最新一楼正文里明确写的地点标签（⌖地点 …），标「来自正文」
    if (MDm && (snapState !== 'ok' || !v.trim()) && snapTop >= 0 && floorNow >= snapTop) { const e = msgCache.get(floorNow), t = e ? MDm.parseHereTag(e.m.raw) : null;
      if (t && floorNow > snapFloor) { const r = MDm.reconcile({ place: v, state: snapState }, t); if (r.source === 'tag') { v = r.place; hereSrc = 'tag'; } } }
    if (!v.trim() && DBm) { const d = dbData(); if (d) { v = DBm.protagonist(d).location; hereFromDb = !!v; } }
    return v;
  }
  // 标题栏显示用：{{user}} 换成酒馆里的用户名，取不到就去掉（发给地图的仍是原值，地图自己处理）
  const userName = s => { let n = ''; try { n = SillyTavern.getContext().name1 || ''; } catch (e) {} return String(s).replace(/\{\{user\}\}/g, n).trim(); };
  // MVU 变量在流式输出时会连续更新：合并成一次，地点没变就不打扰地图
  function push() {
    if (life.dead) return;
    refreshVarMap();
    { const h = getHere(); if (h !== here) unm = null; here = h; }   // 地点变了：等地图重新判断是否上图
    // 一个地点胶囊：MVU 里写了多处（「A / B」）只显示第一处，全文在 title；右侧省略
    const full = userName(here), parts = full.split(/\s*[\/／|｜]\s*/).filter(Boolean);
    hereEl.innerHTML = ''; if (parts[0]) { const a = pdoc.createElement('span'); a.className = 'em-nm'; a.textContent = unm ? U('unm') + userName(unm) : hereMod?.transitLabel?.(parts[0], UL === 'en') || parts[0]; hereEl.append(a); }
    hereEl.classList.toggle('em-unsure', snapState !== 'ok' && snapState !== 'none' && !!parts[0]);   // 未确认：显示上一份快照，灰掉 + 提示（不显示空白、不猜）
    hereEl.classList.toggle('em-unm', !!unm && !!parts[0]); if (unm && parts[0]) { hereEl.setAttribute('role', 'button'); hereEl.tabIndex = 0; } else { hereEl.removeAttribute('role'); hereEl.removeAttribute('tabindex'); }   // 途中（v0.9.5）：「A → B（途中）」
    if (parts.length > 1) { const b = pdoc.createElement('span'); b.className = 'em-more'; b.textContent = ` +${parts.length - 1}`; hereEl.append(b); } hereEl.title = full ? U('here') + full : '';
    if (full) hereEl.setAttribute('aria-label', unm ? U('unm') + userName(unm) + ' · ' + U('unm_tip') : U('here') + full); else hereEl.removeAttribute('aria-label');
    if (full && hereEl.classList.contains('em-unsure')) { const t = U(snapState === 'pending' ? 'pend' : 'stale'); hereEl.title += ' · ' + t; hereEl.setAttribute('aria-label', hereEl.getAttribute('aria-label') + ' · ' + t); }
    if (here !== hereShown) { hereShown = here; hereEl.classList.remove('em-full'); }   // 地点没变就别把用户刚点开的长胶囊收回去（接手 review P2）
    fab.classList.toggle('here', !!here);
    // bg：后台预加载中（面板不可见），地图据此不自动进庄园（E4 N03）
    if (!panel.hidden && alive) post({ type: 'eden-map:chat', id: chatId() });   // 当前聊天 id：本机自定义叫法按聊天分开存（E6）
    if (!panel.hidden && alive && here !== sent) { sent = here; post({ type: 'eden-map:here', value: here, bg: ghost }); }
    if (here !== emHere) { emHere = here; emit('here', { value: here }); emitMoved(here); }
    pushMvu();
  }
  // ---------------- v0.9.3：世界时间（标题栏 + 地图夜色）与主角着装（本人地点卡）；只读 stat_data，缺字段就不显示 ----------------
  let MV = null, clockSig = null, outfitSig = null, clock = null, outfitNow = null;
  import(new URL('mvu.mjs', import.meta.url).href).then(m => { MV = m; if (PACK_IN) { m.setVarRoot(PACK_IN.chatVar || 'tc_' + PACK_ID.replace(/-/g, '_')); m.setWbName(PACK_IN.manifest?.title || PACK_ID); } push(); loadCustom(); }).catch(e => console.warn('[eden-map] MVU 模块加载失败', e));
  function pushMvu() {
    if (!MV) return;
    const st = mvuStat(), w = MV.worldTime(st, varMap), lb = MV.clockLabel(w, UL);
    clock = { ...w, ...lb, night: MV.isNight(w), tod: MV.todPhase?.(w) || '' };   // tod：时段色调（v0.9.6）
    try { clock.pre = getLastMessageId() <= 0; } catch (e) { clock.pre = false; }   // fix3：聊天只有开场白（还没选开局）→ 数据是卡的 MVU 初始值，标「开局前 · 卡初始值」
    const cs = JSON.stringify(clock);
    if (cs !== clockSig) { clockSig = cs; const cap = (UI[UL] || UI.zh).clock; clockEl.hidden = !lb.short; clockEl.lastChild.textContent = lb.short + (clock.pre ? (UL === 'en' ? ' · pre-start' : ' · 开局前') : '');   // 用户 2026-09-28：时钟图标 + 「世界时间」提示，日期写成「1月3日」
      clockEl.title = (lb.full ? cap + '：' + lb.full : cap) + (clock.pre ? (UL === 'en' ? ' (before an opening is chosen: card initial values)' : '（开局前 · 卡初始值：还没选开局，时间 / 地点 / 人物来自卡的 MVU 初始变量）') : ''); clockEl.setAttribute('aria-label', clockEl.title); emit('clock', { ...clock }); sentClock = null; }
    if (alive && sentClock !== clockSig) { sentClock = clockSig; post({ type: 'eden-map:clock', ...clock }); }
    const o = MV.outfit(st, varMap.outfit), os = JSON.stringify(o);
    if (os !== outfitSig) { outfitSig = os; outfitNow = o; emit('outfit', { items: o ? { ...o } : null, text: MV.outfitText(o) }); sentOutfit = null; }
    if (alive && sentOutfit !== outfitSig) { sentOutfit = outfitSig; post({ type: 'eden-map:outfit', items: outfitNow, text: MV.outfitText(outfitNow) }); }
  }
  let sentClock = null, sentOutfit = null;
  let pushT = 0;
  const pushSoon = (ms = 150) => { clearTimeout(pushT); pushT = setTimeout(push, ms); };
  // 通读 R2：状态栏的删除按钮直接改 MVU（replaceMvuData），可能不发 VARIABLE_UPDATE_ENDED；面板开着时每 4 秒比一次变量的指纹，变了才重算
  const updT = setInterval(() => { if (!panel.hidden && !ghost && alive) { autoCheck().catch(() => {}); followCheck().catch(() => {}); } }, 10 * 60 * 1000);   // 面板开着：每 10 分钟查一次更新
  let statSig = ''; const pollT = setInterval(() => { if (panel.hidden || !alive) return; let s = ''; try { s = JSON.stringify(mvuStat()); } catch (e) {}
    if (s !== statSig) { const first = !statSig; statSig = s; if (!first) { recomputeSoon(0); pushSoon(0); } } }, 4000);
  // 通读 R4：玩家启用了卡的「角色图鉴CG」时，它的面板在右下角（z 10050），我们的悬浮按钮让到它下面
  // 表格数据库插件的全屏界面（#acu-app-v2，z 9000，开关只改 style.display）打开时，悬浮按钮先藏起来，不盖住它的按钮
  let acuEl = null; const acuObs = new MutationObserver(() => cgYield());
  const cgYield = () => { root.classList.toggle('em-yield', !!pdoc.querySelector('[id^="gallery-cg-root-"], [id^="gallery-cg-lightbox-"]'));
    const a = pdoc.getElementById('acu-app-v2'); if (a !== acuEl) { acuObs.disconnect(); acuEl = a; if (a) try { acuObs.observe(a, { attributes: true, attributeFilter: ['style', 'hidden', 'class'] }); } catch (e) {} }
    root.classList.toggle('em-dbui', !!a && a.style.display !== 'none' && !a.hidden && a.childElementCount > 0); };
  const cgObs = new MutationObserver(cgYield); try { cgObs.observe(pdoc.body, { childList: true }); } catch (e) {} cgYield();

  // ---------------- 天城事态 ----------------
  // 聊天记录是唯一真相：每次从最近 SCAN 楼原文重算（swipe / 删楼 / 编辑后自然一致），不另存状态
  const SCAN = 80, INJECT_ID = 'eden-map-events';   // 80 楼（E6）：未解除的事件在窗口内一直列出（events.mjs tierOf）
  const badge = root.querySelector('.em-badge');
  let events = [], floorNow = -1, seen = -1, injected = '', EVM = null;
  // 事态模块单独加载：加载失败只是没有事态功能，地图照常可用
  import(new URL('events.mjs', import.meta.url).href).then(m => { if (PACK_IN?.events) m.configure(PACK_IN.events, PACK_ID); EVM = m; recompute(); }).catch(e => console.warn('[eden-map] 事态模块加载失败', e));
  // 人物栏（v0.9.2）：人物位置标签 + MVU 人物表 → 每人最新位置；模块加载失败只是没有人物栏
  let CHM = null, chars = [], charSig = '', charsSent = null;   // charsSent：上一次发给地图的人物签名（没变就不重发）
  import(new URL('characters.mjs', import.meta.url).href).then(m => { CHM = m; recompute(); }).catch(e => console.warn('[eden-map] 人物模块加载失败', e));
  const chatKey = () => { try { return 'edenMapSeen:' + (SillyTavern.getContext().chatId || ''); } catch (e) { return 'edenMapSeen:'; } };
  function loadSeen() { try { seen = +(LS || localStorage).getItem(chatKey()); if (!Number.isFinite(seen)) seen = -1; } catch (e) { seen = -1; } }
  // A-3：每楼原文的解析按 (楼层, 原文) 缓存——原文没变就复用上次的 raw / text / 指纹 / 人物标签 / 行程条目；
  // 整轮输入（楼层、各楼指纹、stat_data、映射、自定义……）的签名没变就直接跳过；发送路径（GENERATION_AFTER_COMMANDS）只做注入需要的部分，
  // 标签改名 / 行程放到空闲时补做（restNow）。
  const msgCache = new Map();
  let roundSig = '', lastMsgs = [], restDue = false, restT = 0, custVer = 0;
  const perf = (k, ms) => { const P = window.parent.__edenMapPerf; if (P) (P[k] ||= []).push(ms); };
  function readMsgs() {
    let out = [];
    try {
      floorNow = getLastMessageId();
      if (floorNow >= 0) out = getChatMessages(`${Math.max(0, floorNow - SCAN)}-${floorNow}`, { role: 'assistant' }).map(m => {
        let msg = String(m.message || ''); const c0 = m.extra?._acu_original_content;   // 数据库插件「正文优化」改写过这一楼：原文存在 extra 里，改写丢掉的 ⌖ 标签从原文补回（只补标签，不动正文）
        if (typeof c0 === 'string' && c0.includes('⌖') && DBm) msg += DBm.lostTags(c0, msg);
        const c = msgCache.get(m.message_id);
        if (c && c.msg === msg) return c.m;
        const raw = msg.replace(/<%[\s\S]*?%>/g, '');   // 原文里可能还留着 EJS 模板源码，里面的示例标签不算事件
        const e = { msg, m: { floor: m.message_id, raw, text: raw.replace(/<UpdateVariable>[\s\S]*?(?:<\/UpdateVariable>|$)/gi, ' ') } };   // 变量更新块（含没闭合的）不参与标签解析（通读 R6）；raw 留给行程读 JSONPatch
        e.m.h = hashText(e.m.text) + (raw.length !== e.m.text.length ? '.' + hashText(raw) : ''); msgCache.set(m.message_id, e); return e.m;
      });
    } catch (e) { floorNow = -1; }
    if (msgCache.size > SCAN * 2) { const keep = new Set(out.map(m => m.floor)); for (const k of msgCache.keys()) if (!keep.has(k)) msgCache.delete(k); }
    return out;
  }
  function recompute(lite = false) {
    if (!EVM || life.dead) return;
    const t0 = performance.now();
    const { collect, summarize, layerOf } = EVM;
    const msgs = readMsgs(), st = mvuStat(), hereNow = getHere();
    let stSig = ''; try { stSig = JSON.stringify(st); } catch (e) {}
    let dbSig = ''; if (DBm && dbApiRef) { try { dbSig = JSON.stringify(DBm.characters(dbData())); } catch (e) {} }
    const sig = [floorNow, msgs.map(m => m.floor + ':' + m.h).join(), stSig, dbSig, varSig, custVer, customChat, chatId(), seen, wbState, !!regNow, !!CHM, !!MV, !!TRm, !!hereMod, hereNow].join('|');
    if (sig === roundSig) { if (!lite && restDue) restNow(); return; }
    roundSig = sig; lastMsgs = msgs;
    events = collect(msgs, floorNow);
    if (CHM) { const known = MV ? Object.values(MV.rosters(st, { present: varMap.present, members: varMap.members, targets: varMap.targets })).flatMap(r => r?.items?.map(i => i.name) || []) : [];
      const mc = CHM.mvuChars(st, hereNow, varMap.present), dd = DBm ? dbData() : null;
      if (dd) { const have = new Set(mc.map(c => c.name)); for (const c of DBm.characters(dd)) if (!have.has(c.name)) mc.push(c); }   // 数据库插件人物表里的位置（只读，MVU 优先）
      chars = CHM.collectChars(msgs, floorNow, mc, known);
      if (MV) { roster = MV.rosters(st, { present: varMap.present, members: varMap.members, targets: varMap.targets, stageField: varMap.stageField, gradeField: varMap.gradeField, coreField: varMap.coreField, codeField: varMap.codeField, socialField: varMap.socialField, heightField: varMap.heightField, weightField: varMap.weightField, knownField: varMap.knownField, accessoryField: varMap.accessoryField, tierField: varMap.tierField }); rep = MV.reputation(st, varMap.reputation); stageOrderFor(roster); portraitsFor(); }
      const sig = floorNow + '|' + chars.map(c => c.name + '@' + c.place + '#' + c.floor).join() + '|' + JSON.stringify(roster) + Object.keys(portraits).length + rep + (stageOrder || []).join();
      if (sig !== charSig) { charSig = sig; if (!panel.hidden && alive) sendChars(); emit('characters', { items: chars.map(c => ({ ...c })), floor: floorNow }); } }
    const fresh = events.filter(e => e.last > seen && e.tier !== 'fade').length;
    badge.hidden = !fresh; badge.textContent = fresh > 9 ? '9+' : fresh;
    if (fresh) tipOnce();
    restDue = true;
    if (!lite) restNow();   // 标签改名、行程；发送路径上推迟到空闲
    else { clearTimeout(restT); restT = setTimeout(() => (window.parent.requestIdleCallback || (f => f()))(() => { if (!life.dead && restDue) restNow(); }, { timeout: 1500 }), 0); }
    inject([summarize(events, layerOf(hereNow)), CHM ? CHM.summarizeChars(chars, 8, 160, floorNow) : '', MV && custom && !(custom.同步世界书 && wbState === 'bound') ? MV.summarizeCustom(custom) : ''].filter(Boolean).join('\n'));
    if (!lite) { stateInject(); checkpointStep(); }
    if (!panel.hidden && alive) sendEvents();
    if (subs.events.size) { const sig = floorNow + '|' + events.map(e => e.id + ':' + e.last + ':' + e.tier).join(); if (sig !== emEvSig) { emEvSig = sig; emit('events', { items: events.map(e => ({ ...e })), floor: floorNow, hereLayer: layerOf(here) }); } }
    perf(lite ? 'lite' : 'core', performance.now() - t0);
  }
  function restNow() { restDue = false; const t0 = performance.now(); customTags(lastMsgs); computeTrips(lastMsgs); perf('rest', performance.now() - t0); }
  function inject(text) {
    if (life.dead) return;
    if (text === injected) return; injected = text;
    try {
      uninjectPrompts([INJECT_ID]);
      if (text) injectPrompts([{ id: INJECT_ID, position: 'in_chat', depth: 4, role: 'system', content: text, should_scan: false }]);
    } catch (e) {}
  }
  // 发给地图：isNew = 上次打开面板之后才出现 / 更新的。打开时不再自动飞向未读事件（用户 2026-09-28：只在点了事件时飞）
  function sendEvents() {
    if (!alive) return;
    const visible = !panel.hidden && !ghost;   // 后台预加载（ghost）只把面板设成 visibility:hidden，panel.hidden 仍是 false——不能算「用户在看」
    const items = events.map(e => ({ ...e, isNew: e.last > seen }));
    if (charSig !== charsSent) { charsSent = charSig; sendChars(); }
    // 人物没变就不重发：面板开着时每 4 秒重建一次覆盖层与横条（2026-09-27 接手 review P2）
    post({ type: 'eden-map:events', v: 1, floor: floorNow, hereLayer: EVM ? EVM.layerOf(here) : '', items });
    // 只有用户真的看着面板才吃掉未读水位、清角标、记 localStorage（2026-09-27 接手 review P1：
    // 以前后台预加载会把水位推到最新并持久化，角标与「打开时飞向最新未读」从此永久失效——iPhone 走省流路径不预加载，所以手机上看不出来）
    if (visible) { if (floorNow >= 0) { seen = floorNow; try { (LS || localStorage).setItem(chatKey(), String(seen)); } catch (e) {} } badge.hidden = true; }
  }
  // v0.9.5 行程：最近 30 楼每楼的地点（MVU 那一楼的变量，拿不到就读原文里的 JSONPatch）+ 人物标签 → 最近 5 段（玩家、人物各 5），存进 eden_map.行程
  let TRm = null, trips = [], tripSig = ''; import(SELF + 'tavern/trips.mjs').then(m => { TRm = m; }).catch(() => {});
  function computeTrips(msgs) {
    if (!TRm || !MV || !custom || customChat !== chatId()) return;
    const kw = TRm.keywords(varUser.keywords || TRm.DEFAULT_KEYWORDS, !!varUser.fantasy), lp = '/' + String(varMap.location || '世界.当前地点').split('.').join('/'), recentMsgs = msgs.slice(-30), seq = [], tags = [];
    for (const m of recentMsgs) {
      const e = msgCache.get(m.floor), key = lp + '|' + varMap.time + '|' + !!CHM;   // 按 (楼层, 原文) 缓存：那一楼的变量由那一楼的原文决定
      if (!e?.trip || e.tripKey !== key || e.m !== m) {
        let st = null; try { st = Mvu.getMvuData({ type: 'message', message_id: m.floor })?.stat_data || null; } catch (x) {}
        const place = String(MV.get(st, varMap.location) ?? '').trim() || TRm.patchPlace(m.raw || m.text, lp), text = m.text.slice(0, 4000);
        const trip = { seq: { floor: m.floor, place, text, time: String(MV.get(st, varMap.time) ?? '') }, tags: CHM ? CHM.parseChars(m.text).map(c => ({ floor: m.floor, name: c.name, place: c.place, text })) : [] };
        if (!e || e.m !== m) { seq.push(trip.seq); tags.push(...trip.tags); continue; }
        e.trip = trip; e.tripKey = key;
      }
      seq.push(e.trip.seq); tags.push(...e.trip.tags);
    }
    const tr = s => hereMod?.parseTransit?.(s) || null;
    const next = TRm.recent([...TRm.playerTrips(seq, tr, kw), ...TRm.charTrips(tags, kw)], 5);
    const sig = JSON.stringify(next); if (sig === tripSig) return; tripSig = sig; trips = next; saveRoot(); sendTrips();
  }
  function sendTrips() { if (alive) post({ type: 'eden-map:trips', items: trips }); }
  function sendChars() { if (alive) post({ type: 'eden-map:chars', v: 1, floor: floorNow, items: chars, rosters: roster, rep, stageOrder, portraits }); }
  // v0.9.5 名册（只读）：在场 / 成员 / 目标三张表的名字、身份、阶段；主角声望。阶段的先后顺序从卡自带的脚本 / 正则文本里找（每个聊天找一次）
  let roster = null, rep = null, stageOrder = null, stageChat = null, stageMiss = '', portraits = {}, portChat = null;
  const cardTexts = () => { const texts = [], walk = (o, d = 0) => { if (d > 8 || texts.length > 4000) return; if (typeof o === 'string') { if (o.length > 20) texts.push(o); } else if (o && typeof o === 'object') for (const v of Object.values(o)) walk(v, d + 1); };
    // A-8：宿主 API 可能返回 Promise——有 thenable 时整体返回 Promise（调用方等它），否则仍同步返回数组
    const pend = [], take = (v, f) => { if (v && typeof v.then === 'function') pend.push(Promise.resolve(v).then(f, () => {})); else f(v); };
    try { if (fnOk('getCharData')) take(getCharData('current'), c => walk(c?.data?.extensions)); } catch (e) {}
    try { if (fnOk('getTavernRegexes')) take(getTavernRegexes({ scope: 'character' }), walk); } catch (e) {}
    return pend.length ? Promise.all(pend).then(() => texts) : texts; };
  const withTexts = f => { const t = cardTexts(); if (typeof t?.then !== 'function') return f(t); t.then(x => { f(x); sendChars(); }, () => {}); };
  // 原作头像（v0.9.5）：卡自带脚本里的默认立绘表，只收作者 CDN 的 /sfw/ 地址；每个聊天读一次，不复制图片
  function portraitsFor() { if (portChat === chatId()) return; portChat = chatId(); withTexts(t => { portraits = MV.findPortraits(t); }); }
  function stageOrderFor(r) {   // A-3：找不到也记住（同一聊天、同一组取值不再每轮扫一遍卡文本）
    const vals = (r?.targets?.items || []).map(i => i.stage).filter(Boolean), chat = chatId(); if (!vals.length || (stageChat === chat && stageOrder && vals.every(v => stageOrder.includes(v)))) return;
    const key = chat + '|' + [...new Set(vals)].sort().join('\u0001'); if (key === stageMiss) return;
    stageChat = chat; stageMiss = key; withTexts(t => { stageOrder = MV.findStageOrder(t, vals); stageMiss = stageOrder ? '' : key; });   // A-8：卡文本可能异步到
  }
  let tipShown = false; try { tipShown = !!(LS || localStorage).getItem('edenMapEvTip'); } catch (e) {}
  function tipOnce() {
    if (tipShown || !panel.hidden) return; tipShown = true; try { (LS || localStorage).setItem('edenMapEvTip', '1'); } catch (e) {}
    hostToast(UL === 'en' ? 'New events in Tiancheng' : '天城有新事态', [], 10000, null, false, { key: 'newev', level: 2, actions: [{ label: UL === 'en' ? 'View' : '查看', primary: true, run: () => fab.click() }] });   // UI v2：P2，不再挂在悬浮按钮上
  }
  let evT = 0;
  const recomputeSoon = (ms = 250) => { clearTimeout(evT); evT = setTimeout(recompute, ms); };

  // ---------------- 本机扩展接口 window.EdenMap（E6，docs/content-compat.md） ----------------
  // 在宿主页挂 window.EdenMap，转发给地图 iframe（srcdoc，与宿主同源，直接调用）；地图没开时直接读写本机 localStorage（同一份存储，同一套函数 here.mjs）。
  // 自定义叫法按聊天分开存（edenMap:chat:<聊天 id>:custom），拿不到聊天 id 时存全局 edenMap:custom。不联网、不上传、不进地址。
  // 宿主页上的方法都返回 Promise。on('here' | 'events' | 'map', fn)：here / events 由本脚本发（面板关着也发），map 由地图发。
  const chatId = () => { try { return String(SillyTavern.getContext().chatId || ''); } catch (e) { return ''; } };
  const subs = { here: new Set(), events: new Set(), map: new Set(), characters: new Set(), outfit: new Set(), clock: new Set(), custom: new Set() };
  let emHere = null, hereShown = null, emEvSig = '', roomsKnown = null, HXm = null, hereMod = null;
  function emit(ev, data) { for (const f of subs[ev]) { try { f(data); } catch (e) { console.warn('[EdenMap]', e); } } }
  const hx = () => (HXm ??= import(SELF + 'here.mjs'));
  hx().then(m => { hereMod = m; setTimeout(push, 0); }).catch(() => {});
  let CXm = null; const chx = () => (CXm ??= import(SELF + 'tavern/characters.mjs'));
  const inner = () => { if (!alive) return null; try { const w = frame.contentWindow; if (!w?.EdenMap) return null; w.__edenMapChat?.(chatId()); return w.EdenMap; } catch (e) { return null; } };
  function knowRooms() { try { const r = inner()?.getRooms().rooms; if (r?.length) roomsKnown = r; } catch (e) {} }
  const store = () => { try { return PACK_IN ? wrapLS(() => window.parent.localStorage) : window.parent.localStorage; } catch (e) { return null; } };

  // ---------------- v0.9.3 自定义名称与用途（聊天变量 eden_map.自定义；酒馆助手没有变量接口时退回本机 localStorage） ----------------
  // 不写进 stat_data：卡的 MVU zod 结构会丢掉未知键。删除一项要整块替换，所以写入优先用 updateVariablesWith / replaceVariables（insertOrAssignVariables 是深合并，删不掉键）。
  // 剧情标签 ⌖改名 / ⌖用途：只处理比 eden_map.标签楼 新的楼层，处理后记下楼层；每条在地图的事态横条上方提示一次。
  // 「同步到世界书」默认开（v0.9.5；自己关过的保持关）；有了第一项自定义才建世界书「伊甸地图·自定义·<聊天>」（一个常驻条目），当前聊天没有绑定聊天世界书时绑定到这个聊天。
  let custom = null, tagFloor = -1, customChat = null, toastQ = [], regP = null;
  const varsOk = () => fnOk('getVariables') && (fnOk('updateVariablesWith') || fnOk('replaceVariables') || fnOk('insertOrAssignVariables'));
  const lsCustomKey = () => 'edenMap:chat:' + (chatId() || '') + ':custom2';
  // A-11：聊天变量写失败时退回本机；读的时候先看本机有没有这份退回的数据（有就是比聊天变量新的），下次写变量成功再删掉它
  function readVars() {
    let fb = null; try { fb = JSON.parse((LS || localStorage).getItem(lsCustomKey()) || 'null'); } catch (e) {}
    if (fb && typeof fb === 'object') return fb;
    if (varsOk()) { try { const v = getVariables({ type: 'chat' })?.[MV.VAR_ROOT]; return v && typeof v === 'object' ? v : {}; } catch (e) {} }
    return {};
  }
  async function writeVars(root, chat) {
    if (life.dead) return false;
    if (chat !== chatId()) return false;   // 换聊天了：这次写入作废，不写进别的聊天
    if (varsOk()) {
      try {
        let same = false; try { same = JSON.stringify(getVariables({ type: 'chat' })?.[MV.VAR_ROOT]) === JSON.stringify(root); } catch (e) {}   // 幂等：内容没变不写（重放事件 / 两个实例不重复触发保存）
        if (same) { try { (LS || localStorage).removeItem(lsCustomKey()); } catch (e) {} return true; }
        if (fnOk('updateVariablesWith')) await updateVariablesWith(v => { v[MV.VAR_ROOT] = root; return v; }, { type: 'chat' });
        else if (fnOk('replaceVariables')) { const all = { ...(getVariables({ type: 'chat' }) || {}) }; all[MV.VAR_ROOT] = root; await replaceVariables(all, { type: 'chat' }); }
        else await insertOrAssignVariables({ [MV.VAR_ROOT]: root }, { type: 'chat' });
        try { (LS || localStorage).removeItem(lsCustomKey()); } catch (e) {}   // 之前退回本机的那份已经过时
        return true;
      } catch (e) { console.warn('[eden-map] 写聊天变量失败，改存本机', e); varsFailed = true; }
    }
    const r = BG ? BG.safeSet(LS || localStorage, lsCustomKey(), JSON.stringify(root), chat) : (() => { try { (LS || localStorage).setItem(lsCustomKey(), JSON.stringify(root)); return { ok: true }; } catch (e) { return { ok: false, reason: 'quota' }; } })();
    if (!r.ok) { storeWarn(r.reason); return false; }
    if (varsFailed) { varsFailed = false; storeWarn('vars'); }   // UI 不能再说「已保存到聊天」却悄悄存在本机
    return true;
  }
  // ---------------- A-13 本机存储预算（tavern/budget.mjs）：LRU 清旧聊天的地图键、头像上限；出问题时告诉用户（面板开着走地图的提示条，关着走宿主小提示） ----------------
  let BG = null, varsFailed = false; const warnAt = {};
  import(new URL('budget.mjs', import.meta.url).href).then(m => { BG = m; }).catch(() => {});
  function storeWarn(reason) {
    if (life.dead || Date.now() - (warnAt[reason] || 0) < 60000) return; warnAt[reason] = Date.now();
    const msg = BG ? BG.warnText(reason, UL === 'en') : '本机存储写入失败'; console.warn('[eden-map]', msg);
    if (!panel.hidden && alive && !ghost) { toastQ.push(msg); flushToasts(); return; }
    hostToast(UL === 'en' ? 'Map storage' : '地图存储', [msg], 12000);
  }
  function budgetSweep() {   // 启动空闲时：记下当前聊天刚用过，聊天数超了按 LRU 清最久的；量一下占用（EdenMap.storage() 可取）
    if (!BG) return; const ls = store(); if (!ls) return;
    BG.touch(ls, chatId()); const r = BG.sweep(ls, chatId()); if (r.dropped.length) console.info('[eden-map] 清理旧聊天的地图数据', r.dropped.length, '个聊天', r.freed, '字节');
  }
  const saveRoot = () => life.dead ? Promise.resolve(false) : writeVars({ 自定义: custom, 标签楼: tagFloor, 标签记录: tagLog, 楼层指纹: tagSeen, 行程: trips, ...(Object.keys(explored).length ? { 探索: explored } : {}), ...(cp ? { 检查点: cp } : {}) }, customChat);
  // 旧版（≤ 0.9.2）本机叫法 edenMap:chat:<id>:custom / edenMap:custom → 并进来，旧键改名为 *.migrated（不删）
  // 只在这个聊天还没有 eden_map.自定义 时迁移一次（全局旧键不改名，靠这个条件避免每个聊天、每次刷新重复并入）
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
    tagLog = Array.isArray(v.标签记录) ? v.标签记录.filter(r => r && Number.isFinite(r.floor) && typeof r.key === 'string').slice(-30) : [];
    tagSeen = v.楼层指纹 && typeof v.楼层指纹 === 'object' ? { ...v.楼层指纹 } : {};
    explored = FOGm ? FOGm.norm(v.探索) : (v.探索 && typeof v.探索 === 'object' ? v.探索 : {});
    checkpointResume(v.检查点);
    if (v.自定义 === undefined) { const mig = await migrateOld(); if (customChat !== id) return; if (mig) await saveRoot(); }
    else if (v.自定义?.同步世界书 === false && !v.自定义.同步手动) {   // 0.9.3 的数据：建过这一本世界书 = 自己关掉的，保持关；否则按新默认（开）
      const had = await wbExists(MV.wbName(id)); if (customChat !== id) return;
      custom = MV.normCustom(MV.syncMigrate(v.自定义, had)); custom.同步手动 = true; await saveRoot(); }   // 迁移结果立刻写回（否则下次加载会把新建的世界书当成「自己关过」）
    if (customChat !== id) return;
    customChanged(false);
  }
  function customChanged(save = true) {
    custVer++; if (save) saveRoot();
    sendCustom(); emit('custom', MV.normCustom(custom)); recomputeSoon(50);
    if (custom?.同步世界书 || wbState) syncWb(!!custom?.同步世界书).catch(e => console.warn('[eden-map] 同步世界书失败', e));
  }
  function sendCustom() { if (alive && custom) { post({ type: 'eden-map:custom', data: custom, vars: varsOk(), wb: wbOk(), wbState }); post({ type: 'eden-map:fog', explored }); } flushToasts(); }
  const wbOk = () => fnOk('createOrReplaceWorldbook') || fnOk('createWorldbook');
  async function wbExists(n) { try { return fnOk('getWorldbookNames') ? (await getWorldbookNames() || []).includes(n) : false; } catch (e) { return false; } }
  let wbState = '';
  // 世界书按聊天分开（MV.wbName(聊天 id)），不然绑定了同一本的聊天会互相注入；关掉同步时把条目停用（不删世界书）
  async function syncWb(on = true) {
    if (!wbOk()) { wbState = 'noapi'; return false; }
    const content = MV.wbContent(custom), WBN = MV.wbName(customChat);
    // 用到才建（v0.9.5）：还没有任何自定义时不建世界书；已经建过的照常写（条目停用）
    if (!content && !(await wbExists(WBN))) { wbState = on ? 'empty' : ''; sendCustom(); return true; }
    const entry = { name: MV.WB_ENTRY, enabled: on && !!content, strategy: { type: 'constant', keys: [] }, position: { type: 'after_character_definition', order: 903 }, content: content || '（空）',
      recursion: { prevent_incoming: true, prevent_outgoing: true } };
    if (fnOk('createOrReplaceWorldbook')) await createOrReplaceWorldbook(WBN, [entry]); else await createWorldbook(WBN, [entry]);
    if (!on) { wbState = ''; sendCustom(); return true; }
    // 绑定：当前聊天没有聊天世界书时绑定到这个聊天；已有别的就不动（在地图设置里提示手动启用）
    let bound = false;
    try { const cur = fnOk('getChatWorldbookName') ? getChatWorldbookName('current') : null;
      if (cur === WBN) bound = true; else if (!cur && fnOk('rebindChatWorldbook')) { await rebindChatWorldbook('current', WBN); bound = true; } } catch (e) {}
    if (!bound) try { bound = (fnOk('getGlobalWorldbookNames') && getGlobalWorldbookNames().includes(WBN)); } catch (e) {}
    wbState = bound ? 'bound' : 'unbound'; sendCustom(); return true;
  }
  // 标签用到的「类」：人物栏里的名字 → 人物；庄园房间 / 区域（maps.json）→ 房间 / 区域；其余当地标
  const reg = () => (regP ??= cdnFetch(BASE + 'data/maps.json').then(r => r.ok ? r.json() : null).catch(() => null));
  let regNow = null; reg().then(r => { regNow = r; });
  // 注：reg() 用的是当前线路的 maps.json（与地图同一份）；取不到时一律当地标
  function kindOf(key) {
    if (chars.some(c => c.name === key)) return 'character';
    const e = Object.values(regNow?.maps || {}).find(m => m.kind === 'estate');
    if (e?.rooms?.includes(key)) return 'room'; if (e?.areas?.includes(key)) return 'area';
    return 'landmark';
  }
  // 已用过的标签记在 eden_map.标签记录 [{ floor, key, op, prev }]（最多 30 条），处理过的楼层原文指纹记在 eden_map.楼层指纹 { 楼: 指纹 }（最近 100 楼）。
  // 某一楼的原文变了（重 roll / 编辑 / 删楼）：先撤销那一楼用过的标签，再按新原文重扫那一楼；比 标签楼 新的楼照常处理。
  let tagLog = [], tagSeen = {};
  const hashText = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  function customTags(msgs) {
    if (!MV || !custom || customChat !== chatId()) return;
    if (floorNow >= 0 && floorNow < tagFloor) tagFloor = floorNow;   // 删过楼：之后的新楼照常处理
    const lo = msgs.length ? msgs[0].floor : Infinity, have = new Map(msgs.map(m => [m.floor, m.text]));
    const changed = new Set(Object.keys(tagSeen).map(Number).filter(f => f >= lo && f <= tagFloor && hashText(have.get(f) ?? '') !== tagSeen[f]));
    let dirty = false, undone = 0;
    if (changed.size) {
      for (const r of tagLog.filter(r => changed.has(r.floor)).reverse()) {   // 倒序撤销：同一项被改过两次时回到最早的值
        const nx = MV.setCustom(custom, r.key, r.op === 'name' ? { name: r.prev || '' } : { note: r.prev || '' }); if (nx) { custom = nx; undone++; } }
      tagLog = tagLog.filter(r => !changed.has(r.floor)); dirty = true;
    }
    const todo = msgs.filter(m => changed.has(m.floor) || m.floor > tagFloor);
    const applied = [];
    for (const m of todo) {
      const before = MV.normCustom(custom), r = MV.applyTags(custom, [m], m.floor - 1, kindOf);
      for (const a of r.applied) { const e = before.items[a.key] || {}; tagLog.push({ floor: a.floor, key: a.key, op: a.op, prev: a.op === 'name' ? e.名 || '' : e.用途 || '' }); before.items[a.key] = { ...e, [a.op === 'name' ? '名' : '用途']: a.value }; }
      custom = r.custom; applied.push(...r.applied); tagSeen[m.floor] = hashText(m.text); dirty = true;
    }
    for (const f of changed) if (!have.has(f)) delete tagSeen[f];
    if (!dirty) return;
    tagFloor = Math.max(tagFloor, ...todo.map(m => m.floor));
    tagLog = tagLog.slice(-30); const keep = Object.keys(tagSeen).map(Number).sort((a, b) => b - a).slice(0, 100); tagSeen = Object.fromEntries(keep.map(f => [f, tagSeen[f]]));
    if (applied.length || undone) { toastQ.push(...applied.map(MV.tagToast)); customChanged(true); } else saveRoot();
  }
  function flushToasts() { if (!alive || !toastQ.length) return; post({ type: 'eden-map:toast', items: toastQ.splice(0) }); }
  // 头像压缩（与 map/chars.js 里那份一致）：面板没开、只走 EdenMap.setAvatar 时也压，否则同一张图在两条路径上行为不一样（接手 review P2）
  async function shrinkAvatar(src) {
    if (typeof src !== 'string' || !src.startsWith('data:image/') || src.length < 40000) return src;
    try {
      const img = new Image(); img.src = src; await img.decode();
      const k = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = pdoc.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const w = c.toDataURL('image/webp', .82); return w.startsWith('data:image/webp') ? w : c.toDataURL('image/jpeg', .82);
    } catch (e) { return src; }
  }
  const api = Object.freeze({
    // v0.9.3 自定义名称与用途（聊天变量 eden_map.自定义）：key = 标准名（房间 / 区域 / 地标 / 人物）；patch = { name?, note?, kind? }，传 '' 清掉
    async setCustom(key, patch = {}) { if (!MV || !custom) await loadCustom(); if (!MV) return false; await reg(); const k = String(key || '').trim(), r = MV.setCustom(custom, k, { ...patch, kind: patch.kind || custom.items[k]?.类 || kindOf(k) }); if (!r) return false; custom = r; customChanged(true); return true; },
    async removeCustom(key) { if (!MV || !custom) await loadCustom(); if (!MV) return false; const r = MV.removeCustom(custom, MV.findKey(custom, key) || key); if (!r) return false; custom = r; customChanged(true); return true; },
    async getCustom() { if (!MV || !custom) await loadCustom(); return { ...MV.normCustom(custom), storage: varsOk() ? 'chat' : 'local', worldbook: wbState ? { name: MV.wbName(customChat), state: wbState } : null }; },
    async setWorldbookSync(on) { if (!MV || !custom) await loadCustom(); const was = !!custom.同步世界书; custom = { ...custom, 同步世界书: !!on, 同步手动: true }; if (!on && was && !wbState) wbState = 'off'; customChanged(true); return true; },
    // 旧名字保留（≤ 0.9.2）：房间叫法 = 该房间的自定义显示名
    async setRoomAlias(name, room) { const rooms = roomsKnown || Object.values((await reg())?.maps || {}).find(m => m.kind === 'estate')?.rooms || null;
      if (rooms && (!rooms.includes(String(room).trim()) || rooms.includes(String(name).trim()))) return false; return api.setCustom(room, { name, kind: 'room' }); },
    async removeRoomAlias(name) { if (!MV || !custom) await loadCustom(); const k = MV?.findKey(custom, name); return !!k && k !== String(name).trim() && api.setCustom(k, { name: '' }); },
    async getRooms() { if (!MV || !custom) await loadCustom(); const rooms = roomsKnown || Object.values((await reg())?.maps || {}).find(m => m.kind === 'estate')?.rooms || [];
      return { rooms: [...rooms], alias: MV ? MV.aliasMap(custom, ['room']) : {}, chat: chatId() || null }; },
    getOutfit: async () => ({ items: outfitNow ? { ...outfitNow } : null, text: MV ? MV.outfitText(outfitNow) : '' }),   // 主角着装（只读 MVU 主角.着装）
    getClock: async () => (clock ? { ...clock } : null),   // 世界时间（只读 MVU 世界.当前日期 / 当前时刻 / 当日时段）
    // 人物头像（v0.9.2）：只存本机 localStorage（按聊天，拿不到聊天 id 时全局），不上传、不进地址；src = data:image/… 或 http(s) 图片地址
    // 面板看得见时交给地图（它自己提示）；面板关着 / 后台预加载 / 休眠时在这里写，满了用宿主提示条告诉用户（地图里的提示条此时看不见，A-13），再让地图重读
    async setAvatar(name, src) { const v = inner(); if (v && !panel.hidden && !ghost) return v.setAvatar(name, src); const C = await chx(), st = store(); if (!st) return false;
      const img = await shrinkAvatar(src), r = C.setAvatarEx ? C.setAvatarEx(st, chatId(), name, img) : { ok: C.setAvatar(st, chatId(), name, img) };
      if (!r.ok && (r.reason === 'cap' || r.reason === 'quota')) storeWarn(r.reason);
      if (r.ok && v) try { await v.setAvatar(name, img); } catch (e) {}   // 地图重写同一张（已有这个名字，不占新额度）并重画
      return r.ok; },
    storage: async () => { const st = store(); return BG && st ? BG.measure(st) : null; },   // A-13：本机存储占用（字节，UTF-16）
    async removeAvatar(name) { const v = inner(); if (v) return v.removeAvatar(name); const C = await chx(), st = store(); return !!st && C.removeAvatar(st, chatId(), name); },
    async getCharacters() { return { items: chars.map(c => ({ ...c })), floor: floorNow, rosters: roster ? JSON.parse(JSON.stringify(roster)) : null, reputation: rep }; },   // v0.9.5：rosters / reputation 只读
    // 三维查看器飞到热点（v1.0 测试件：{ map: 'dairy', hotspot: 'tank' }）：面板没开就先打开；地图就绪后转发
    async flyTo(t) { flyQ = t || null; if (panel.hidden && !ghost) { panel.hidden = false; await loadViewer(); } else if (ghost) fab.click();
      if (!flyQ) return true; const v = inner(); if (v?.flyTo) { flyQ = null; return v.flyTo(t); } return true; },
    // v0.9.6 只读：当前在用的数据来源（不含任何数据内容本身）。location = 当前地点来自哪里；characters = 人物栏各来源人数；
    // mvu = { present, mode: 'mvu' | 'mvu-partial' | 'tags' }；db = 表格数据库插件 { tables, location, chars } 或 null（没装）；tags = 聊天标签（⌖ / 人物标签）总在读
    async sources() {
      let st = null; try { st = mvuStat(); } catch (e) {}
      const hasMvu = typeof Mvu !== 'undefined', mode = varAD ? varAD.mode(hasMvu, st, varMap) : hasMvu ? 'mvu' : 'tags';
      let db = null; try { db = DBm ? DBm.facts(dbApi(), hereFromDb) : null; } catch (e) {}
      const ctx = { hasMvu, mode, db, here, hereFromDb, chars, varMap, vars: varsOk() };
      if (SRCm) return SRCm.summarize(ctx);   // 数据源注册表（tavern/sources.mjs）
      const byc = {}; for (const c of chars) byc[c.src || 'infer'] = (byc[c.src || 'infer'] || 0) + 1;
      return { location: here ? (hereFromDb ? 'db' : 'mvu') : 'none', mvu: { present: hasMvu, mode }, db, tags: true, characters: byc, varmap: { ...varMap } };
    },
    selfcheck: (o = {}) => { if (o?.show) showSplash(); return runCheck().then(() => ({ items: checkItems.map(i => ({ ...i })), at: checkAt })); },   // 启动自检的结果（只在本机）；{ show: true } 再显示开场自检卡（v0.9.5）
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
  async function wbFacts() { try { return await SC.collectWorldbook(hostFn); } catch (e) { return null; } }
  async function updateFacts() {   // 正式版才查；一天最多一次（不论成败），结果记在本机
    if (!VER || !swappable || !SC.swapVer(import.meta.url, VER)) return null;
    let c = null; try { c = JSON.parse(lsGet(UPD_KEY)); } catch (e) {}
    if (SC.dueCheck(c?.at, Date.now())) {
      let latest = c?.latest || null;
      try { const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
        const r = await cdnFetch(SC.UPDATE_API(REPO), { signal: ctl.signal }).finally(() => clearTimeout(to));
        if (r.ok) latest = SC.latestTag(await r.json()) || latest; } catch (e) {}
      c = { at: Date.now(), latest }; lsSet(UPD_KEY, JSON.stringify(c));
    }
    return c?.latest ? { current: VER, latest: c.latest, channel: updChannel() } : null;
  }
  function runCheck() {
    return checkP ??= (async () => {
      SC = await import(SELF + 'tavern/selfcheck.mjs');
      try { await Promise.race([waitGlobalInitialized('Mvu'), new Promise(r => setTimeout(r, 3000))]); } catch (e) {}
      let mvu = null;
      try { if (typeof Mvu !== 'undefined' && Mvu?.getMvuData) { const st = Mvu.getMvuData({ type: 'message', message_id: 'latest' })?.stat_data;
        refreshVarMap(); const hp = varMap.location || SC.HERE_PATH;
        mvu = { stat: !!st && typeof st === 'object', path: hp, here: !!st && SC.getPath(st, hp) !== undefined, candidates: st ? SC.findPaths(st).filter(p => p !== hp) : [],
          fields: st && MV ? { present: !!MV.presentList(st, varMap.present), clock: !!MV.worldTime(st, varMap).time, outfit: MV.get(st, varMap.outfit || '主角.着装') !== undefined } : null }; } } catch (e) { mvu = { stat: false }; }
      const varmode = varAD ? varAD.mode(typeof Mvu !== 'undefined' && !!Mvu?.getMvuData, mvuStat(), varMap) : null;
      const loads = [...new Set(Object.entries(window.parent.__edenMapIds || {}).filter(([k, u]) => k !== OWNER && u !== switchedFrom).map(([, u]) => u))];   // A3：按脚本身份，不按地址
      const ln = { swappable, name: (LINES.find(l => l.key === line) || {}).name || '',
        ok: !swappable ? null : lineP ? await lineP.then(ok => ok && fetchHtml().then(() => true, () => false), () => false) : html ? await html.then(() => true, () => false) : null };
      checkFacts = {
        api: { getChatMessages: fnOk('getChatMessages'), eventOn: fnOk('eventOn'), injectPrompts: fnOk('injectPrompts'), tavern_events: typeof tavern_events === 'object' },
        vars: varsOk(), ejs: (() => { try { return typeof (window.parent.EjsTemplate || globalThis.EjsTemplate) === 'object'; } catch (e) { return false; } })(),
        db: DBm ? (getHere(), DBm.facts(dbApi(), hereFromDb)) : null,
        mvu, varmode, dup: { others: loads, oldStyle, replaced: !root.isConnected }, line: ln, worldbook: await wbFacts(), version: { script: plainVer(VER), viewer: viewerVer }, update: await updateFacts(),
        // B3 卡身份（getCharData，旧办法回退）、B4 宿主版本（只报告）、B7 角色卡正则（只读）
        card: THm ? await THm.cardIdentity(thFn, () => SillyTavern.getContext()).catch(() => null) : null, host: THm ? THm.hostVersions(thFn) : null,
        regex: THm && thFn('getTavernRegexes') ? await Promise.resolve(thFn('getTavernRegexes')({ type: 'character', name: 'current' })).then(l => THm.regexFacts(l), () => null) : null,
      };
      checkFacts.conflicts = conflictsNow(); checkFacts.checkpoint = cpResume;   // (d)(e)
      cardId = checkFacts.card;
      // 世界书「缺少」先别急着报：酒馆刚启动时全局世界书设置可能还没加载完（v0.9.6 误报），6 秒后再查一次
      if (checkFacts.worldbook?.missing?.length) { await new Promise(r => setTimeout(r, 6000)); if (life.dead) return; checkFacts.worldbook = await wbFacts(); }
      finishCheck();
      if (checkFacts.update && SC.cmpVer(checkFacts.update.latest, VER) > 0 && lsGet(AUTO_UPD_KEY) === '1') switchVersion();   // 用户开了「自动更新到新正式版」
    })().catch(e => { console.warn('[eden-map] 自检失败', e); });
  }
  function finishCheck() {
    checkFacts.version.viewer = viewerVer; updInfo = checkFacts.update;
    checkItems = SC.evaluate(checkFacts); checkAt = Date.now();
    for (const i of checkItems) if (i.status === 'warn') console.warn('[eden-map] 自检', i.zh);
    sendCheck(); toastOnce(); scriptInfo();
  }
  function sendCheck() { if (alive && checkItems.length) post({ type: 'eden-map:selfcheck', items: checkItems, canUpdate: channel() !== 'latest' && !!(VER && swappable && SC?.swapVer(import.meta.url, VER)), autoUpdate: lsGet(AUTO_UPD_KEY) === '1' }); }
  // ---------------- v0.9.5 开场自检卡（tavern/splash.mjs）：导入后 / 换版本后第一次打开聊天时显示；不挡聊天 ----------------
  let SPm = null, splash = null;
  const splashDue = () => { try { return (LS || localStorage).getItem('edenMapSplashSeen') !== String(VER || 'dev'); } catch (e) { return false; } };
  async function showSplash() {
    SPm ??= await import(SELF + 'tavern/splash.mjs').catch(() => null); if (!SPm) return false;
    const lite = lean(), get = f => cdnFetch(BASE + f, { cache: 'force-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); });
    const bi = await buildNow();
    splash = SPm.openSplash({ root, id: ID, pdoc, ver: VER, en: UL === 'en', about: { version: bi?.version || SCRIPT.version || VER, code: bi?.code || SCRIPT.code, channel: channel(), ref: SCRIPT.ref || refOf() }, store: localStorage, cap: window.parent.__edenSplashCap || 25,
      checks: () => runCheck().then(() => checkItems),
      tasks: [
        { key: 'map', zh: '地图程序与当前一层的图块', en: 'Map program and current-layer tiles', run: () => { if (panel.hidden && !alive && !ghost) preload().catch(() => {}); return preP; } },
        { key: 'clouds', zh: '云图', en: 'Cloud sprites', skip: lite, run: () => Promise.all([1, 2, 3, 4, 5, 6].map(k => get(`art/clouds/puff${k}.png`))) },
      ],
      onStart: () => { splash = null; if (panel.hidden || ghost) { if (ghost) endGhost(true); panel.hidden = false; loadViewer(); } }, onClose: () => { splash = null; if (updWait) setTimeout(showUpdPrompt, 600); } });
    return true;
  }
  // 有 ⚠ 时弹一次小提示：同一版本、同一组警告只弹一次（点 × 或自动收起都算看过）；地图面板开着时不弹——
  // 面板里的设置 / 表单会被它盖住（v0.9.6 用户实测：盖住了变量映射表），警告在地图设置的「自检」一栏里都有；面板关上后再弹
  let toastWait = false;
  function toastOnce() {
    if (splash) return;   // 开场自检卡开着：警告已经列在卡里
    const sig = SC.warnSig(checkItems); if (!sig) return;
    const key = (VER || 'dev') + '|' + sig; if (key === lsGet(TOAST_KEY)) return;
    if (!panel.hidden && !ghost) { toastWait = true; return; }
    toastWait = false; lsSet(TOAST_KEY, key);
    // UI v2：P1 横幅「自检发现 N 项需要注意」→「查看」打开地图设置「更新与版本」（同一版本、同一组警告只出一次）
    const warns = checkItems.filter(i => i.status === 'warn'), L = UL === 'en' ? 'en' : 'zh';
    hostToast(UL === 'en' ? `Map self-check: ${warns.length} item(s) need attention` : `地图自检发现 ${warns.length} 项需要注意`, warns.map(w => '⚠ ' + w[L]), 0, null, false,
      { key: 'selfcheck', actions: [{ label: UL === 'en' ? 'View' : '查看', primary: true, run: () => openSettings('update') }] });
  }
  let setQ = null;   // 面板还没就绪时排队，eden-map:ready 后发（和 flyQ 一样）
  function openSettings(page) { if (alive && !panel.hidden && !ghost) { post({ type: 'eden-map:settings', page }); return; } setQ = page; if (panel.hidden || ghost) fab.click(); }
  // 通知层模块加载失败时的兜底（强制更新等不能悄悄丢）：最简单的一张卡，文字 + 自带按钮 + ×（P0 无 ×）
  function fallbackToast(title, lines, extra, o = {}) {
    const t = pdoc.createElement('div'); t.className = 'em-ctoast'; t.setAttribute('role', o.level === 0 ? 'alertdialog' : 'status');
    t.style.cssText = 'position:fixed;left:50vw;top:12px;transform:translateX(-50%);z-index:30003;max-width:min(420px,92vw);box-sizing:border-box;padding:10px 14px;border-radius:12px;background:var(--em-bg);color:var(--em-ink);border:1px solid var(--em-line-2);font:13px/1.5 var(--em-font)';
    const b = pdoc.createElement('b'); b.textContent = title; t.append(b); for (const l of lines || []) { const d = pdoc.createElement('div'); d.textContent = l; t.append(d); }
    if (o.level !== 0) { const x = pdoc.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', UI[UL].close); x.onclick = () => t.remove(); t.append(x); }
    extra?.(t); root.appendChild(t); return t;
  }
  // 宿主页提示（UI v2：全部进唯一通知层 ui/notice.mjs）。upd：更新提示（P1，力度 force 时 P0）；其余 P1。extra(el) 可以往里加链接、按钮
  let updEl = null; const ntTimers = {};
  function hostToast(title, lines, ms = 12000, extra = null, upd = false, o = {}) {
    if (!NT) { ntReady.then(n => { if (life.dead) return; if (n) hostToast(title, lines, ms, extra, upd, o); else fallbackToast(title, lines, extra, o); }); return null; }
    const key = o.key || (upd ? 'upd' : 'toast'), level = o.level ?? 1;
    clearTimeout(ntTimers[key]);
    const t = NT.push({ key, level, title, lines, actions: o.actions, build: extra ? el => extra(el) : null, ms: level === 2 ? ms || undefined : undefined });
    if (upd) updEl = t; else toastEl = t;
    if (ms && level !== 2) ntTimers[key] = setTimeout(() => { delete ntTimers[key]; if (NT?.get(key) === t) NT.remove(key); }, ms);
    return t;
  }
  // ---------------- 自动检查更新（设置「自动检查更新」默认开，存本机 edenMapAutoCheck）----------------
  // 实时：脚本加载后、每次打开地图时查一次，面板开着时每 10 分钟再查（两次至少隔 1 分钟）；一次 = jsDelivr 标签列表 + 新标签的 build.json（各约 1 KB，绕缓存），
  // 走当前线路，和「检查更新」按钮同一个 checkUpdate。有新版弹不挡操作的小提示：怎么更新 + 更新说明 +「稍后」（本次页面不再提示这个版本）/「此版本不再提示」。
  // 地图面板开着（设置 / 表单可能开着）或开场自检卡开着时不弹，关上后再弹（和自检小提示同一条规则）。
  const AUTO_CHECK_KEY = 'edenMapAutoCheck', UPD_SKIP_KEY = 'edenMapUpdSkip';
  let updPrompt = null, updWait = false;
  const updChannel = () => channel() === 'latest' && SCRIPT.locked ? 'locked' : channel();
  // 跟随分支预览（用户 2026-09-28）：打开时与面板开着每 10 分钟查分支最新提交；比加载的提交新 → 提示「有更新，刷新载入」（面板开着也弹，不自动刷新）
  let followSeen = null;
  // 2026-09-28：没梯子时 GitHub 接口不通 → 改用 tavern/follow.mjs（分支 head.json：jsdmirror / jsDelivr / raw 取构建号最大的，最后才 GitHub），和加载器同一套
  let FW = null;
  const fwGet = async u => { const c = new AbortController(), to = setTimeout(() => c.abort(), 5000);
    try { const r = await cdnFetch(u, { cache: 'no-store', signal: c.signal }); return r.ok ? await r.json() : null; } catch (e) { return null; } finally { clearTimeout(to); } };
  async function followHead() {
    FW ??= await import(SELF + 'tavern/follow.mjs').catch(() => null); if (!FW || !SCRIPT.ref) return null;
    return FW.resolveFollow(REPO, SCRIPT.ref, fwGet, null).catch(() => null);
  }
  // 比加载的新：有构建号比构建号；老加载器（没有构建号）比提交号
  const followNewer = h => !!h && (Number.isInteger(SCRIPT.build) ? h.build > SCRIPT.build : !!SCRIPT.sha && !String(h.sha).startsWith(SCRIPT.sha));
  async function followCheck() {
    if (life.dead || channel() !== 'follow' || !SCRIPT.ref) return;
    const h = await followHead(); if (!followNewer(h) || h.sha === followSeen || life.dead) return;
    followSeen = h.sha; const en = UL === 'en';
    hostToast(en ? 'Update available — reload to load it' : '有更新，刷新载入', [(en ? `Latest build #${h.build} · ` : `分支最新构建 #${h.build} · `) + String(h.sha).slice(0, 7)], 0, t => {
      t.classList.add('em-upd', 'em-follow'); const acts = pdoc.createElement('div'), b = pdoc.createElement('button'); acts.className = 'em-acts nt-acts'; b.className = 'nt-pri';
      b.type = 'button'; b.textContent = en ? 'Reload' : '刷新载入'; b.onclick = () => window.parent.location.reload(); acts.append(b); t.append(acts); }, true);
  }
  async function autoCheck() {
    SC ??= await import(SELF + 'tavern/selfcheck.mjs').catch(() => null); if (!SC?.autoCheckPlan || life.dead) return;
    let lastAt = 0; try { lastAt = window.parent.__edenMapCheckAt || 0; } catch (e) {}   // 挂在宿主页上：换版本 / 重注入脚本不重复查
    if (SC.autoCheckPlan({ enabled: lsGet(AUTO_CHECK_KEY) !== '0', channel: channel(), lastAt, now: Date.now() }) === 'skip') return;
    try { window.parent.__edenMapCheckAt = Date.now(); } catch (e) {}
    const r = await checkUpdate(); if (r.status === 'fail') return;
    const { latest, code, min, reason } = r;
    const cur = SC.buildVer(await buildNow()) || SCRIPT.version || VER, v = SC.updateVerdict(cur, latest, updChannel());
    if (life.dead) return;
    // 强制更新：最新正式版声明了 min_version 且当前更旧 → 常驻提示，只能「本次关闭」（按会话记，下次加载再弹），没有「此版本不再提示」
    let closed = null; try { closed = window.parent.__edenMapForceClosed || null; } catch (e) {}
    if (SC.mustUpdate(cur, min)) { if (closed !== min) { updPrompt = { ...v, latest: v.latest || min, current: cur, code, min, reason, force: true, notes: `https://github.com/${REPO}/blob/${SC.tagOf(v.latest || min)}/CHANGELOG.md` }; showUpdPrompt(); } return; }
    let later = null; try { later = window.parent.__edenMapUpdLater || null; } catch (e) {}
    if (!SC.shouldPrompt(v, lsGet(UPD_SKIP_KEY)) || v.latest === later || updEl?.isConnected) return;
    updPrompt = { ...v, code, notes: `https://github.com/${REPO}/blob/${SC.tagOf(v.latest)}/CHANGELOG.md` }; showUpdPrompt();
  }
  function showUpdPrompt() {
    if (!updPrompt || life.dead) return;
    if (splash || (!panel.hidden && !ghost)) { updWait = true; return; }   // 不盖住开着的面板 / 表单
    updWait = false; const u = updPrompt; updPrompt = null;
    if (u.force) {
      const F = SC.forceText(u.current, u.min, u.latest, updChannel(), u.reason, UL === 'en');
      return hostToast(F.title, F.lines, 0, t => {
        t.classList.add('em-upd', 'em-force'); t.__upd = u;
        const a = pdoc.createElement('a'); a.href = u.notes; a.target = '_blank'; a.rel = 'noopener'; a.textContent = F.notes; const d = pdoc.createElement('div'); d.append(a); t.append(d);
        const acts = pdoc.createElement('div'); acts.className = 'em-acts nt-acts';
        const cl = pdoc.createElement('button'); cl.type = 'button'; cl.className = 'em-later'; cl.textContent = F.close;
        cl.onclick = () => { try { window.parent.__edenMapForceClosed = u.min; } catch (e) {} t.remove(); };   // 只记在这次页面上：刷新后再弹
        acts.append(cl); t.append(acts);
      }, true, { level: 0, key: 'upd' });   // P0：没有 ×，只有「本次关闭」（次按钮）
    }
    const T = SC.updatePromptText(u.latest, updChannel(), UL === 'en');
    hostToast(T.title + (u.code ? ` · ${u.code}` : ''), [T.how], 0, t => {
      t.classList.add('em-upd'); t.__upd = u;
      const a = pdoc.createElement('a'); a.href = u.notes; a.target = '_blank'; a.rel = 'noopener'; a.textContent = T.notes; const d = pdoc.createElement('div'); d.append(a); t.append(d);
      const acts = pdoc.createElement('div'); acts.className = 'em-acts nt-acts';
      const later = pdoc.createElement('button'); later.type = 'button'; later.className = 'em-later'; later.textContent = T.later; later.onclick = () => { try { window.parent.__edenMapUpdLater = u.latest; } catch (e) {} t.remove(); };
      const skip = pdoc.createElement('button'); skip.type = 'button'; skip.className = 'em-skip'; skip.textContent = T.skip; skip.onclick = () => { lsSet(UPD_SKIP_KEY, u.latest); t.remove(); };
      if (T.act) { const go = pdoc.createElement('button'); go.type = 'button'; go.className = 'em-go nt-pri'; go.textContent = T.act;
        go.onclick = () => { t.remove(); if (T.actKind === 'reload') { try { window.parent.location.reload(); } catch (e) { try { location.reload(); } catch (x) {} } } else switchVersion(); }; acts.append(go); }
      acts.append(later, skip); t.append(acts);
    }, true);
  }
  function switchVersion() {   // 本次会话换成新正式版：加载新标签的同一个脚本，它会清掉这一份（要长期用，重新导入新版脚本）
    const nv = updInfo?.latest, url = nv && SC?.swapVer(import.meta.url, nv);
    if (!url || SC.cmpVer(nv, VER) <= 0) return;
    window.parent.__edenMapSwitch = SELF;
    import(url).catch(e => { console.warn('[eden-map] 切换到新版本失败', e); window.parent.__edenMapSwitch = switchedFrom; });
  }

  // ---------------- 交互方式 (a)(d)(e)（docs/interaction-modes.md；纯逻辑在 tavern/modes.mjs） ----------------
  // (a) 每次生成前把「地点、在场、时间、行程」压成一行（≤ 设置的 token 上限，默认 150）按固定 id、固定深度注入；重生 / swipe / 重载都覆盖同一条，不叠。
  //     数据没确认（pending / stale）时标「未确认」；卡的提示词里已经有的字段跳过；设置「数据与映射」开关（默认开），深度与上限在「高级」。
  // (e) 最小检查点：eden_map.检查点 = { 楼, swipe }（最后确认的楼层与 swipe），只在确认前进时写（幂等）；启动时对照，楼 / swipe 对不上就作废并从聊天记录重推。
  let MDm = null, stateNow = '', cardSkip = null, cardSkipChat = null, cp = null, cpResume = null;
  import(SELF + 'tavern/modes.mjs').then(m => { MDm = m; stateInject(); }).catch(() => {});
  async function cardSkipFor() {   // 卡的提示词文本（角色描述、场景、系统提示、历史后指令、卡内世界书）里引用了哪些 stat_data 字段；每个聊天算一次
    const c = chatId(); if (cardSkipChat === c && cardSkip) return cardSkip; cardSkipChat = c; cardSkip = {};
    try { const d = await Promise.resolve(thFn('getCharData')?.('current')); const x = d?.data || d || {};
      const texts = [x.description, x.personality, x.scenario, x.system_prompt, x.post_history_instructions, x.mes_example, x.first_mes, ...((x.character_book?.entries) || []).map(e => e?.content)];
      cardSkip = MDm ? MDm.cardHas(texts, varMap) : {}; } catch (e) {}
    return cardSkip;
  }
  function stateText(type) {
    const ch = SillyTavern?.chat; if (!MDm || !SNP || !Array.isArray(ch)) return '';
    const r = MDm.snapFor(SNP.pickStat, readFloor, ch.length - 1, { type });
    const st = r.stat, get = p => (st && varAD ? varAD.get(st, p) : undefined);
    let place = String(get(varMap.location) ?? '').trim(), state = r.state;
    if (hereSrc === 'tag' && type !== 'swipe' && type !== 'regenerate') { place = here; }   // (d) 正文标签兜底的地点
    const pres = MV && st ? (MV.presentList(st, varMap.present) || []).map(x => x.name) : [];
    const wt = MV && st ? MV.worldTime(st, varMap) : null, time = wt ? [wt.date, wt.time, wt.period].filter(Boolean).join(' ') : '';
    return MDm.stateLine({ here: userName(place), present: pres, time, trips: (trips || []).map(t => ({ ...t })), state, skip: cardSkip || {} }, +(lsGet('edenMapStateBudget') || 150));
  }
  function stateInject(type = 'normal') {
    if (life.dead || !MDm) return;
    const on = lsGet('edenMapStateInj') !== '0', text = on ? stateText(type) : '', depth = +(lsGet('edenMapStateDepth') ?? 2);
    const key = text + '|' + depth; if (key === stateNow) return; stateNow = key;
    MDm.applyState(thFn, text, depth);
    if (on && cardSkipChat !== chatId()) cardSkipFor().then(() => { stateNow = ''; stateInject(type); });
  }
  function checkpointStep() {   // 确认前进时写检查点（内容没变不写）
    if (!MDm || !custom || customChat !== chatId()) return;
    const top = snapTop, sw = SillyTavern?.chat?.[top]?.swipe_id;
    const n = MDm.nextCheckpoint(cp, { floor: snapFloor, top, swipe: sw, state: snapState });
    if (n !== cp) { cp = n; saveRoot(); }
  }
  function checkpointResume(v) {   // loadCustom 里：读检查点并对照聊天
    cp = v && typeof v === 'object' && Number.isInteger(v.楼) ? { 楼: v.楼, swipe: Number.isInteger(v.swipe) ? v.swipe : 0 } : null; cpResume = null;
    if (!MDm) return; const ch = SillyTavern?.chat; if (!Array.isArray(ch)) return;
    cpResume = MDm.resume(cp, i => { const c = ch[i]; if (!c) return null; const sv = c.variables?.[c.swipe_id ?? 0]; return { swipe: c.swipe_id ?? 0, hasStat: !!sv?.stat_data, role: c.is_user ? 'user' : 'assistant' }; }, ch.length - 1);
    if (cpResume.reason === 'swiped' || cpResume.reason === 'missing') cp = null;   // 作废：下次确认时重写
    if (cpResume.reason !== 'match' && cpResume.reason !== 'none') { statSig = ''; recomputeSoon(0); pushSoon(0); }
  }
  function conflictsNow() {   // 自检：最近 30 楼里 MVU 地点与正文地点标签不一致的楼（只列出，不改）
    if (!MDm || typeof Mvu === 'undefined') return [];
    const fl = []; for (const m of lastMsgs.slice(-30)) { let st = null; try { st = Mvu.getMvuData({ type: 'message', message_id: m.floor })?.stat_data || null; } catch (e) {}
      const mv = st && varAD ? String(varAD.get(st, varMap.location) ?? '') : ''; if (mv) fl.push({ floor: m.floor, mvu: mv, raw: m.raw }); }
    return MDm.conflicts(fl, 10);
  }

  // ---------------- 酒馆助手采纳（docs/tavernhelper-audit.md §2，B1–B9）：全部功能探测，缺接口静默跳过 ----------------
  let THm = null, macroOff = null, thBtns = null, cardId = null;
  const thReady = import(SELF + 'tavern/th.mjs').then(m => { THm = m; thInit(); return m; }).catch(() => null);
  function thInit() {
    if (life.dead) return;
    // B2 脚本按钮：浮动按钮之外的第二个入口（TH 脚本栏里的「地图」「地图自检」）；句柄走 listen，cleanup 自动撤
    try { thBtns = THm.scriptButtons(thFn); if (thBtns) {
      if (thBtns['地图']) listen(thBtns['地图'], () => { if (panel.hidden || ghost) fab.click(); });
      if (thBtns['地图自检']) listen(thBtns['地图自检'], () => { checkP = null; runCheck(); openSettings('update'); }); } } catch (e) {}
    // B6 正式入口：其它脚本 waitGlobalInitialized('EdenMap')；window.parent.EdenMap 别名保留一个版本
    try { thFn('initializeGlobal')?.('EdenMap', api); } catch (e) {}
    macroSet(lsGet('edenMapMacros') === '1');
  }
  // B9 类宏（默认关）：{{eden_here}} 当前地点、{{eden_route}} 最近一段行程；卡 / 预设作者自己引用
  function macroSet(on) {
    macroOff?.(); macroOff = null; if (!on || !THm || life.dead) return;
    macroOff = THm.registerMacros(thFn, k => (k === 'eden_here' ? userName(here) : (() => { const t = (trips || []).filter(x => !x.who).at(-1); return t ? `${t.from} → ${t.to}` : ''; })()));
  }
  // B8 广播：地图里的当前地点变了 → eventEmit('eden-map:moved', { from, to, source, at })；只发地点，不写 MVU / 数据库
  let movedFrom = null;
  function emitMoved(to) {
    if (movedFrom === null) { movedFrom = to; return; } if (to === movedFrom || life.dead) return;
    const from = movedFrom; movedFrom = to;
    try { thFn('eventEmit')?.('eden-map:moved', THm ? THm.movedPayload(from, to, { source: hereFromDb ? 'db' : hereSrc || 'mvu' }) : { from, to, at: Date.now() }); } catch (e) {}
  }
  // B5 脚本库说明：版本、通道、最后一次自检结论
  function scriptInfo() {
    if (!THm || !thFn('replaceScriptInfo')) return;
    try { thFn('replaceScriptInfo')(THm.scriptInfo({ version: plainVer(VER) || SCRIPT.version, channel: channel(), build: SCRIPT.build, checkAt, warns: checkItems.length ? checkItems.filter(i => i.status === 'warn').length : null, en: UL === 'en' })); } catch (e) {}
  }
  // B1 世界书附加条目 + 全自动 + eden-map:th 设置消息：host-th.mjs createWbAuto（整块原样搬过去，行为不变）
  let wbChatT = 0;
  const { wbAuto, sendTh, onTh } = createWbAuto({ SELF, LS, lsGet, lsSet, life, base: () => BASE, alive: () => alive, UL: () => UL, thBtns: () => thBtns,
    chatId, cardKey, post, hostToast, stateInject, macroSet, prefSync });

  // 悬浮按钮可拖动（避开酒馆输入栏等位置），位置按屏幕比例记住；轻点才打开面板
  const POS_KEY = 'edenMapFabPos';
  const placeFab = (fx, fy) => {
    const x = Math.min(Math.max(fx, 0), 1), y = Math.min(Math.max(fy, 0), 1);
    const vh = (typeof CSS === 'undefined' || CSS?.supports?.('height', '100dvh')) ? '100dvh' : '100vh';   // 老 WebView 没有 dvh，用了会让 top 失效、按钮落到聊天末尾
    fab.style.left = `calc(${x} * (100vw - 48px))`; fab.style.top = `calc(${y} * (${vh} - 48px))`;
    return [x, y];
  };
  try { const p = JSON.parse((LS || localStorage).getItem(POS_KEY)); if (p) placeFab(p[0], p[1]); } catch (e) {}
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
      const p = placeFab(r.left / (vw - 48), r.top / (vh - 48)); try { (LS || localStorage).setItem(POS_KEY, JSON.stringify(p)); } catch (err) {} prefSync(); } });

  // 单手（E7）：惯用手在地图设置里改（同源 localStorage；改了地图发 eden-map:state {hand}）
  // 惯用手选了左 / 右：悬浮按钮挪到那一侧（高度不变）并记住；自动 = 不动它（地图反过来按它在哪一半判断左右手）
  const HAND_KEY = 'edenMapHand';
  let handPref = 'auto'; try { handPref = (LS || localStorage).getItem(HAND_KEY) || 'auto'; } catch (e) {}
  const fabLeft = () => { const r = fab.getBoundingClientRect(); return r.left + r.width / 2 < window.parent.innerWidth / 2; };
  const applyHand = move => {
    if (move && (handPref === 'left' || handPref === 'right')) {
      const r = fab.getBoundingClientRect(), vh = window.parent.innerHeight, y = vh > 48 ? r.top / (vh - 48) : .85;
      const p = placeFab(handPref === 'left' ? .03 : .97, y); try { (LS || localStorage).setItem(POS_KEY, JSON.stringify(p)); } catch (e) {} prefSync();
    }
    panel.classList.toggle('em-left', handPref === 'left' || (handPref === 'auto' && fabLeft())); if (typeof sendBar === 'function' && alive) sendBar();
  };
  { let saved = null; try { saved = (LS || localStorage).getItem(POS_KEY); } catch (e) {}
    if (!saved && handPref === 'left') placeFab(.03, Math.max(0, (window.parent.innerHeight - 144) / Math.max(1, window.parent.innerHeight - 48))); }   // 没拖过：左手默认放左下
  applyHand(false);
  fab.addEventListener('pointerup', () => { if (dragged && handPref === 'auto') applyHand(false); });
  const close = () => { if (panel.hidden || ghost) return; panel.hidden = true; sleepViewer(); prefSync(); if (toastWait && SC) setTimeout(toastOnce, 400); if (updWait) setTimeout(showUpdPrompt, 600); };
  fab.addEventListener('click', async () => { if (dragged) return;
    if (ghost) { ghost = false; clearTimeout(ghostT); panel.classList.remove('em-ghost'); fab.classList.remove('prep'); sent = null; charsSent = null; push(); sendEvents(); scheduleAutoCheck(); return; }   // 预加载中被点开：直接显示，重新推一次地点（这次可以进庄园）；loadViewer 当时因为还在 ghost 跳过了查更新，这里补一次
    fab.classList.remove('fail'); NT?.remove('newev');   // 提示不留在面板后面（v0.9.2）
    if (!panel.hidden) return close(); toastEl?.remove();
    if (updEl?.isConnected && updEl.__upd) { updPrompt = updEl.__upd; updWait = true; } updEl?.remove();   // 更新提示也不盖在面板上：关上面板后再弹
    panel.hidden = false; await loadViewer(); });   // 面板打开：自检小提示不盖在面板上（v0.9.6）
  root.querySelector('.em-close').addEventListener('click', close);
  hereEl.addEventListener('click', () => { if (unm && hereEl.classList.contains('em-unm')) { post({ type: 'eden-map:unmapped-pick' }); return; } if (hereEl.title) hereEl.classList.toggle('em-full'); });   // v0.9.6：未上图 → 地图里打开指派选择器
  hereEl.addEventListener('keydown', e => { if (unm && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); post({ type: 'eden-map:unmapped-pick' }); } });
  // 宿主页的 Esc：只在焦点不在输入框里时关地图（在聊天框里按 Esc 不该把地图关掉，E5 r2 RP-6）
  const onKey = e => { if (e.key !== 'Escape' || e.isComposing || e.target?.closest?.('input, textarea, select, [contenteditable]') || panel.hidden) return;
    if (alive && !ghost) post({ type: 'eden-map:key', key: 'Escape' }); else close(); };   // §10.14：交给查看器按层关，最后它回 eden-map:esc 才关面板
  pdoc.addEventListener('keydown', onKey);

  (async () => {
    // 不 await：没装 MVU 时 waitGlobalInitialized 永远不返回，下面的楼层 / 聊天事件就一个都挂不上（只用聊天标签、或地点读数据库插件表的聊天，地图不跟着新楼更新）
    try { Promise.resolve(waitGlobalInitialized('Mvu')).then(() => listen(Mvu.events.VARIABLE_UPDATE_ENDED, () => { pushSoon(); recomputeSoon(); }), () => {}); } catch (e) {}   // MVU 人物表也会变（人物栏）
    listen(tavern_events.CHAT_CHANGED, () => pushSoon(300));
    listen(tavern_events.CHAT_CHANGED, () => { clearTimeout(wbChatT); wbChatT = setTimeout(() => { if (!life.dead) afterGen(() => wbAuto().catch(e => console.warn('[eden-map] 世界书自动', e))); }, 1500); });   // 换角色 / 聊天：新角色也挂上、聊天版本提醒
    listen(tavern_events.MESSAGE_SWIPED, () => pushSoon(300));
    listen(tavern_events.CHAT_CHANGED, () => { try { BG?.touch(store(), chatId()); } catch (e) {} injected = null; stateNow = ''; cardSkip = null; cp = null; trips = []; tripSig = ''; loadSeen(); custom = null; loadCustom().then(() => recomputeSoon(300)); });
    // 通读 R1：开局菜单用 setChatMessage(swipe_id) 换开场白，不一定触发 SWIPED；渲染 / 编辑事件也听，地点跟着刷新
    for (const k of ['MESSAGE_RECEIVED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_DELETED', 'MESSAGE_EDITED', 'CHARACTER_MESSAGE_RENDERED']) if (tavern_events[k]) listen(tavern_events[k], () => { recomputeSoon(); pushSoon(300); });   // 新楼、改楼、重 roll、删楼：重算
    // 生成前同步一次，注入的是最新态势（A-3：只做注入需要的部分；输入没变直接跳过；标签改名 / 行程推到空闲）
    // v0.9.9：生成状态（pending 指示）+ swipe 删除 + 切回前台（被系统挂起 / 断网恢复后事件可能丢了）→ 从聊天记录与楼层变量重新推导
    if (tavern_events.GENERATION_STARTED) listen(tavern_events.GENERATION_STARTED, (t, o, dry) => { if (!dry) { GEN.since = Date.now(); pushSoon(0); } });
    for (const k of ['GENERATION_ENDED', 'GENERATION_STOPPED']) if (tavern_events[k]) listen(tavern_events[k], () => { GEN.since = 0; setTimeout(flushIdle, 800); recomputeSoon(); pushSoon(300); });
    if (tavern_events.MESSAGE_SWIPE_DELETED) listen(tavern_events.MESSAGE_SWIPE_DELETED, () => { recomputeSoon(); pushSoon(300); });
    { const wake = () => { if (pdoc.visibilityState !== 'hidden' && !life.dead) { statSig = ''; recomputeSoon(0); pushSoon(0); } }; pdoc.addEventListener('visibilitychange', wake); window.parent.addEventListener('pageshow', wake); window.parent.addEventListener('online', wake);
      life.add(() => { pdoc.removeEventListener('visibilitychange', wake); window.parent.removeEventListener('pageshow', wake); window.parent.removeEventListener('online', wake); }); }
    if (tavern_events.GENERATION_AFTER_COMMANDS) listen(tavern_events.GENERATION_AFTER_COMMANDS, (type) => { clearTimeout(evT); recompute(true); stateNow = ''; stateInject(typeof type === 'string' ? type : 'normal'); });   // (a) 重生 / swipe：用被替换那一楼之前的状态
    push(); loadSeen(); recompute();
    (window.parent.requestIdleCallback || (f => setTimeout(f, 1500)))(() => { if (life.dead) return; afterGen(() => preload().catch(() => {})); try { budgetSweep(); } catch (e) {} setTimeout(() => { if (!life.dead) autoCheck().catch(() => {}); }, window.parent.__edenAutoCheckDelay ?? 6000); if (splashDue()) { lsSet('edenMapSplashSeen', String(VER || 'dev')); runCheck(); } else setTimeout(runCheck, 4000); setTimeout(() => { if (!life.dead) afterGen(() => wbAuto().catch(e => console.warn('[eden-map] 世界书自动同步失败', e))); }, 8000); });   // 打开聊天后空闲时：测速选线 + 预加载；稍后自检一次
  })();

  // 脚本被关闭或重载时清理注入的元素
  const cleanup = () => { if (life.dead) return; life.kill(); life.unlisten(); clearInterval(watchT); clearTimeout(quietT); clearInterval(pollT); clearInterval(updT); cgObs.disconnect(); acuObs.disconnect(); try { dbApiRef?.unregisterTableUpdateCallback?.(dbCb); } catch (e) {} clearTimeout(killT); clearTimeout(pushT); clearTimeout(evT); clearTimeout(restT); clearTimeout(ghostT); try { inject(''); } catch (e) {} root.remove(); window.parent.removeEventListener('message', onMsg); themeMq?.removeEventListener?.('change', onThemeMq); pdoc.removeEventListener('keydown', onKey);
    if (window.parent.EdenMap === api) delete window.parent.EdenMap; toastEl?.remove(); updEl?.remove(); splash?.el?.remove(); try { NT?.destroy(); barRO?.disconnect(); } catch (e) {}
    if (window.parent.__edenMapCleanup === cleanup) delete window.parent.__edenMapCleanup;
    try { const R = window.parent.__edenMapIds; if (R && R[OWNER] === SELF) delete R[OWNER]; } catch (e) {}   // 换版本 / 关掉脚本后不再算作「另一个地图脚本」
    try { for (const el of [...pdoc.querySelectorAll('[data-eden-owner]')]) if (el.getAttribute('data-eden-owner') === OWNER) el.remove(); } catch (e) {}
    prefs.stop(); window.removeEventListener('storage', onStorage); try { macroOff?.(); } catch (e) {} try { MDm?.applyState(thFn, '', 0); } catch (e) {} };   // 换版本 / 关掉脚本后不再算作「另一个地图脚本」（用户实测：换成 v0.9.3 后没刷新页面就误报）
  install(cleanup);   // __edenMapCleanup + pagehide（host-lifecycle.mjs）
})();
