// 伊甸庄园 · 世界地图悬浮按钮（酒馆助手脚本）
// 卡内脚本只需一行：import 'https://cdn.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@<版本>/map/tavern/eden-map.js'
// 注入酒馆页面：右下角悬浮按钮 + 地图面板；面板内用 srcdoc 加载 viewer.html（<base> 指回仓库，相对资源照常加载）。
// 当前地点取 MVU 变量「世界.当前地点」，变量更新 / 切换聊天时推送给地图高亮。
// 天城事态：从最近 80 楼原文解析事件标签（events.mjs，两种写法都认），推给地图落点；角色所在层的活跃事件压成一句注入给模型。
// v0.9.3 MVU 联动（mvu.mjs）：只读 stat_data（世界时间、主角着装、在场人物）；自定义名称与用途存在聊天变量顶层键 eden_map（不进 stat_data，见 docs/content-compat.md）。
// C2 第 4 步（2026-09-28）拆成：入口（本文件：面板 / 查看器状态机、消息、MVU / 事态 / 自定义 / 自检 / 更新）+ host-routes.mjs（线路）
// + host-lifecycle.mjs（接管旧实例、挂 DOM、监听登记、清理钩子）+ host-th.mjs（酒馆助手适配、偏好、世界书全自动）。见 docs/agent-brief.md「模块地图」。
import '../core/logbuf.mjs'; // 反馈日志缓冲：最先 import，模块求值即安装，启动日志不丢（v0.9.6 报告「(none)」根因）
import { cdnFetch, thFn, fnOk, hostFn, packNs, createPrefs, createWbAuto, fnGuard } from './host-th.mjs';
import { EDEN_API, guardApi } from './edenapi.mjs';
import { resolveTags } from './sanitize.mjs';   // Part 7：社区预设净化（标签表设置）
import { createRoutes, scoreText } from './host-routes.mjs';
import { createLife, takeOver, mount, install } from './host-lifecycle.mjs';
import { MVUBridge } from './mvu-bridge.mjs';   // P2 解耦：数据流读取收口（Mvu / SillyTavern 全局只在这一个模块里）
import { ContextPipeline } from './context.mjs';   // P2 解耦：聊天上下文交互流水线（窗口 / 事件 / 人物 / 标签 / 行程的纯计算）
import { createAbout } from './host-about.mjs';   // P2 解耦：版本信息与检查更新（取数 / 发消息由入口注入）
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
  // 线路 / 版本识别：host-routes.mjs
  const { PKG, REPO, LINES, LINE_KEY, swappable, VER, tagOf, plainVer, baseFor, LINE_TTL, LINE_AT, race, measure } = createRoutes({ SELF, PACK_IN });
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
  const UI = { zh: { title: '新历 2088', clock: '世界时间', map: '地图', here: '当前地点：', line: '线路：', unset: '未选', close: '关闭', load: '加载地图 {p}%', open: '打开世界地图', fab: '世界地图', unm: '未上图：', unm_tip: '点这里把它放到地图上', pend: '等待本楼变量更新', stale: '本楼没有变量快照，显示的是上一楼的', probe: '测速中…', dead: '连不上', toosmall: '响应过小（未计分）', rec: '推荐' },
    en: { title: 'NC 2088', clock: 'World time', map: 'Map', here: 'Location: ', line: 'Route: ', unset: 'not set', close: 'Close', load: 'Loading map {p}%', open: 'Open world map', fab: 'World map', unm: 'Not on map: ', unm_tip: 'Tap to place it on the map', pend: 'waiting for this reply\'s variable update', stale: 'no variable snapshot on this reply; showing the previous one', probe: 'Measuring…', dead: 'unreachable', toosmall: 'response too small to score', rec: 'Recommended' } };
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
  // 线路选择：每条线路现场按「真读完 105 KB 的字节 / 毫秒」测一次（host-routes.measure），连不上的标红。
  // 2026-09-29 修：以前是「取一个小文件、谁先答完谁推荐」——既不是带宽，也会被几十毫秒的噪声决定；
  // 现在等全部测完，取分数最高的标「推荐」，并把实测速度写在按钮上（可核对，不再只写「延迟 x 秒」）。
  function showPicker() {
    const row = pickEl.querySelector('.row'); row.innerHTML = '';
    const btns = [], results = [];
    for (const l of LINES) {
      const b = pdoc.createElement('button'); b.innerHTML = `<b>${l.name}</b><small>${l.sub}</small><span class="ms">${U('probe')}</span>`;
      b.onclick = () => chooseLine(l.key); row.appendChild(b); btns.push([l.key, b]);
      measure(l.key).then((r) => {
        results.push(r);
        const ms = b.querySelector('.ms');
        if (!r.ok) { ms.textContent = r.reason === 'small' ? U('toosmall') : U('dead'); ms.className = 'ms bad'; }
        else { ms.textContent = scoreText(r.score); ms.className = 'ms ok'; }
        if (results.length === LINES.length) {   // 全部测完再给「推荐」，不再是谁先答完谁推荐
          const good = results.filter((x) => x.ok).sort((a, b2) => b2.score - a.score);
          if (good.length) { const best = btns.find(([k]) => k === good[0].key); best?.[1].querySelector('.ms')?.insertAdjacentHTML('beforeend', ` · <b class="rec">${U('rec')}</b>`); }
        }
      });
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
    const key = await race(line);   // 把当前线路传进去：没快 30% 以上就不换（见 host-routes.PROBE_MARGIN）
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
      // 省流预热清单（通用化 v1：按包取；数据文件 = 清单 preload 列；内置 eden 无注入时用 Pack 0 默认档，与以前逐字相同）
      const pb = PACK_ID === 'eden' ? '' : 'packs/' + PACK_ID + '/';
      const pf = (PACK_IN?.manifest?.preload) || (PACK_ID === 'eden' ? ['data/maps.json', 'data/world_markers.json', 'data/derived.json'] : []);
      try { await fetchHtml(); await Promise.all(['packs/' + PACK_ID + '/manifest.json', ...pf.map(p => pb + p)].map(u => cdnFetch(BASE + u).catch(() => null)));
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
  // 生成状态（GEN）：GENERATION_STARTED 置位，ENDED / STOPPED 清零，180 s 超时自动清（断网 / 被杀后 ENDED 永远不来）。
  // 必须在下面 afterGen 之前声明：typeof 也躲不开 TDZ——const 还没初始化时读它照样抛 ReferenceError，而 afterGen 开局就被调。
  const GEN = { since: 0, get generating() { return !!this.since && Date.now() - this.since < 180000; } };
  // 地基 A5：空闲预取在生成期间暂停（聊天首屏与流式输出优先），GENERATION_ENDED / STOPPED 后再补做
  const idleQ = [];
  const afterGen = f => { if (GEN.generating) idleQ.push(f); else f(); };
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
    if (e.data?.type === 'eden-map:ready') { post({ type: 'eden-map:lang', lang: UL }); sendBar(); sendAbout(); alive = true; sentClock = sentOutfit = charsSent = null; knowRooms(); sendCheck(); sendCustom(); sendInv(); sendTrips(); sendTh(); BR.varSig = ''; refreshVarMap(); setProg(50); loadEl.classList.add('over'); sent = null; push(); sendEvents(); if (panel.hidden) sleepViewer(); }
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
    if (e.data?.type === 'eden-map:switch-branch' && typeof e.data.branch === 'string') switchBranch(e.data.branch);   // 设置「更新与版本」→ 版本分支切换（main / preview）
    // v0.9.3 自定义（地图设置里的「自定义」一栏）：地图只发请求，数据由这里写进聊天变量后再推回去
    if (e.data?.type === 'eden-map:custom-set') api.setCustom(e.data.key, e.data.patch || {});
    if (e.data?.type === 'eden-map:custom-reset') api.removeCustom(e.data.key);
    if (e.data?.type === 'eden-map:explore' && FOGm && custom) { const r = FOGm.visit(explored, e.data.map, e.data.name); if (r.changed) { explored = r.ex; saveRoot(); } }   // 迷雾探索：只在查看器开着迷雾时才发
    if (e.data?.type === 'eden-map:explore-reset' && custom) { explored = {}; saveRoot(); post({ type: 'eden-map:fog', explored }); }
    if (e.data?.type === 'eden-map:custom-sync') api.setWorldbookSync(!!e.data.on);
    if (e.data?.type === 'eden-map:splash') showSplash();   // 设置「重新显示开场自检」
    if (e.data?.type === 'eden-map:varmap-set') setVarUser(e.data.user);   // v0.9.5 设置「变量映射」
    if (e.data?.type === 'eden-map:compose' && typeof e.data.text === 'string') composeIn(e.data.text);   // v0.9.6 地图 → 聊天：只填不发
    if (e.data?.type === 'eden-map:action') injectAction(e.data);   // Part 6-4：点 POI → 注入动作（默认关，见 tavern/action.mjs）
    if (e.data?.type === 'eden-map:loot') takeLoot(e.data);   // Part 5-1：点了地上的发光拾取物 → 先写背包，再按设置注入一句
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
  // ---------------- Part 6-2 后台静默推演 ----------------
  // 面板关着时，隔一阵把新楼层以只读方式扫一遍（补齐事态 / 人物 / 行程的缓存），玩家再开地图就是热的。
  // 三条底线：只读（不写变量、不注入、不发消息给查看器）；面板活着或正在生成一律让路；每次只扫增量且封顶 60 楼。
  // 调度判定纯函数在 tavern/tick.mjs（node 单测覆盖），这里只做取数与记账。
  let TICK = null, tickLed = null, tickT = 0;
  async function tickOnce() {
    const iv = TICK ? TICK.intervalOf(k => { try { return (LS || localStorage).getItem(k); } catch (e) { return null; } }) : 0;
    const p = TICK ? TICK.plan(Date.now(), { lastAt: tickLed?.lastAt || 0, intervalMs: iv, alive, generating: GEN.generating, dead: life.dead }) : { run: false };
    if (!p.run) return p.reason;
    const win = TICK.pick(floorNow, tickLed?.lastFloor ?? -1);
    const t0 = performance.now();
    try {
      if (win.n > 0 && typeof getChatMessages === 'function') {
        const list = getChatMessages(`${win.from}-${win.to}`, { role: 'assistant' });
        CTX.readMsgs(list, floorNow);   // 只读：只喂缓存，不 recompute、不发消息、不写变量
      }
    } catch (e) {}
    tickLed = TICK.ledger(tickLed, { now: Date.now(), floorNow, ms: performance.now() - t0, n: win.n });
    perf('tick', performance.now() - t0);
    return 'ran';
  }
  async function startTick() {
    try { TICK ??= await import(SELF + 'tavern/tick.mjs'); } catch (e) { TICK = null; return; }
    clearInterval(tickT);
    tickT = setInterval(() => { tickOnce().catch(() => {}); }, 15000);   // 心跳 15 s，跑不跑由 plan() 决定
  }

  // Part 6-4 地图驱动的双向动作注入：查看器只说「点了哪个 POI、想干什么」，文案与注入方式全在这里按设置决定。
  // 模式默认 off——地图不该在玩家没点头的情况下替他说话；compose 只填不发（与「去这里」同一条底线），sys 走 /sys 静默注入。
  let ACm = null;
  async function injectAction(d) {
    try { ACm ??= await import(SELF + 'tavern/action.mjs'); } catch (err) { return; }
    const get = k => { try { return (LS || localStorage).getItem(k); } catch (err) { return ''; } };
    const mode = ACm.modeOf(get);
    if (mode === 'off') return;
    const a = ACm.buildAction({ mode, kind: d?.kind, name: d?.name, map: d?.map, tpls: ACm.readTpl(get, UL), lang: UL, item: d?.item });
    if (!a) return;
    if (mode === 'sys') { const cmd = ACm.slashOf(a, 'sys');
      if (cmd && typeof triggerSlash === 'function') { try { triggerSlash(cmd); return; } catch (err) {} } }
    composeIn(a.text);   // sys 却没有 triggerSlash 时退回「只填不发」，绝不自动发送
  }

  // Part 5-1 拾取地上的藏物（core/stash.mjs 的行）：地图只说「拿了哪个 id」，真实性由这里核对——
  // 认不出的 id 一律不动背包（不替世界凭空变出东西）；认出了就写进 eden_map.仓库（同一份聊天变量，模型自己看得见）。
  function takeLoot(d) {
    try {
      if (!STm || !stash || !INVm || !d?.id) return;
      const row = STm.rows(stash, {}).find(r => r.id === d.id);
      if (!row) return;
      const res = INVm.put(inv, STm.lootPut(row));
      if (!res.changed) return;
      inv = res.inv; changedInv();   // 写变量 + 推地图（拿到手的光点会消失）
      injectAction({ kind: 'loot', name: row.place || d.place || '', map: row.map || d.map || '', item: row.name });
    } catch (err) {}
  }

  // ---------------- v0.9.6 版本与检查更新（P2 解耦：实现在 tavern/host-about.mjs，这里只留装配） ----------------
  // 版本信息：预览 / 正式脚本在 import 前写 window.__edenMapScript = { version, code, channel: tag | follow | ref, ref, sha }（tools/build_preview_script.py 烘进去）；
  // 没有（旧脚本、本地）时按脚本地址判定，版本号与构建号取当前线路的 data/build.json。
  const SCRIPT = (() => { try { return window.__edenMapScript || window.parent.__edenMapScript || {}; } catch (e) { return {}; } })();
  const AB = createAbout({ cdnFetch, post, base: () => BASE, REPO, SELF, VER, tagOf, LINES, swappable, SCRIPT,
    lineKey: () => line, lang: () => (UL === 'en' ? 'en' : 'zh'), followHead: () => followHead(),
    followNewer: h => followNewer(h),   // 包一层：followNewer 是下面的 const，直接传绑定会在装配时就撞 TDZ
    loadSelfcheck: async () => (SC ??= await import(SELF + 'tavern/selfcheck.mjs')),
    loadSources: async () => (SRCm ??= await import(SELF + 'tavern/sources.mjs')) });
  const sendAbout = () => AB.sendAbout(), checkUpdate = () => AB.checkUpdate(), followUpdate = () => AB.followUpdate();
  const channel = () => AB.channel(), buildNow = () => AB.buildNow();   // 自检页与强制更新判断要用同一个口径
  // ---------------- MVUBridge（P2 解耦第一步，docs/reviews/architecture_and_stream_perf.md §3）----------------
  // 变量映射（v0.9.5，换卡兼容）、stat_data 快照选取（v0.9.9）、当前地点三级兜底（MVU → 标签对账 → 表格数据库插件，
  // 只读）、自定义数据的变量读写（A-11）全部收进 map/tavern/mvu-bridge.mjs——宿主脚本里唯一允许直接碰
  // Mvu / SillyTavern 全局的模块（隔离契约，tests/mvu_bridge.test.mjs 机械检查）。这里只留调度与 UI：
  // 桥经 onMvuLoad / onTableUpdate / onRoster 回调通知「变了」，宿主决定何时推送 / 重算。
  let MV = null;   // mvu.mjs（纯函数集）由桥加载；这里拿模块引用给自定义 / 注入等纯调用用
  const CTX = new ContextPipeline({   // 聊天上下文流水线（tavern/context.mjs）：先建（下面 BR 的标签对账要读它的消息缓存）
    stripTags: resolveTags(k => { try { return (LS || localStorage).getItem(k); } catch (e) { return null; } }),
  });
  const BR = new MVUBridge({
    life, pack: PACK_IN, packId: PACK_ID,
    lang: () => (UL === 'en' ? 'en' : 'zh'), isGenerating: () => GEN.generating,
    storage: () => LS || localStorage,
    floorNow: () => floorNow, lastRaw: () => (floorNow >= 0 ? CTX.msgCache.get(floorNow)?.m?.raw ?? null : null),
    onMvuLoad: m => { MV = m; push(); loadCustom(); },
    onTableUpdate: () => { pushSoon(); recomputeSoon(); },
    onRoster: () => sendChars(),
  });
  // P3-B 名册装配（core/roster.mjs）：mvu / table-db / fallback 三个来源桥里已注册；chat / baibai 只有宿主有——
  // 聊天 ⌖人物 标签在流水线的消息窗口里、柏宝绘外貌库按需加载。临时名册拼装（known 名单 flatMap）由装配系统统一输出。
  BR.roster.use('chat', { rows: ctx => !CHM || !Array.isArray(ctx?.msgs) ? [] : ctx.msgs.flatMap(m => CHM.parseChars(m.text).map(c => ({ name: c.name, place: c.place, source: 'chat' }))) });
  let BBm = null; import(SELF + 'tavern/baibai.mjs').then(m => { BBm = m; }).catch(() => {});   // 可选依赖：没装 / 加载失败只是没有柏宝绘来源
  BR.roster.use('baibai', { rows: () => BBm ? BBm.characters().list : [] });
  // 保底名册（Pack 0 数据挂载点 manifest.data.roster，通用化 v1 前是 mvu.mjs 的硬编码数组）：包声明了才取；
  // eden（无注入的内置默认）走内置档路径。取不到就没有兜底行，不挡启动。
  { const rp = (PACK_IN?.manifest?.data?.roster) || (PACK_ID === 'eden' ? 'data/fallback_roster.json' : null);
    if (rp) { const rb = PACK_ID === 'eden' ? '' : 'packs/' + PACK_ID + '/';
      cdnFetch(BASE + rb + rp).then(r => r.ok ? r.json() : null).then(j => { if (BR.setFallbackMembers(j?.members || [])) { recomputeSoon(); sendChars(); } }).catch(() => {}); } }
  // 桥接口的宿主侧薄别名：原有调用点（chatId / userName / mvuStat / getHere / readVars）不用逐个改
  const chatId = () => BR.chatId(), cardKey = () => BR.cardKey(), userName = s => BR.userName(s);
  const mvuStat = () => BR.mvuStat(), getHere = () => BR.here(), readVars = () => BR.readVars();
  function refreshVarMap() { if (BR.refreshVarMap()) sendVarMap(); }   // 桥重算映射并返回「签名变了」；宿主只管发
  function sendVarMap() { if (!alive) return; post({ type: 'eden-map:varmap', ...BR.varmapView() }); }
  function setVarUser(u) { if (BR.setVarUser(u)) sendVarMap(); recomputeSoon(50); push(); if (checkP) checkP.then(() => { checkP = null; runCheck(); }); }   // 自检重跑，读法跟着变
  // MVU 变量在流式输出时会连续更新：合并成一次，地点没变就不打扰地图
  function push() {
    if (life.dead) return;
    refreshVarMap();
    { const h = getHere(); if (h !== here) unm = null; here = h; }   // 地点变了：等地图重新判断是否上图
    // 一个地点胶囊：MVU 里写了多处（「A / B」）只显示第一处，全文在 title；右侧省略
    const full = userName(here), parts = full.split(/\s*[\/／|｜]\s*/).filter(Boolean);
    hereEl.innerHTML = ''; if (parts[0]) { const a = pdoc.createElement('span'); a.className = 'em-nm'; a.textContent = unm ? U('unm') + userName(unm) : hereMod?.transitLabel?.(parts[0], UL === 'en') || parts[0]; hereEl.append(a); }
    hereEl.classList.toggle('em-unsure', BR.snapState !== 'ok' && BR.snapState !== 'none' && !!parts[0]);   // 未确认：显示上一份快照，灰掉 + 提示（不显示空白、不猜）
    hereEl.classList.toggle('em-unm', !!unm && !!parts[0]); if (unm && parts[0]) { hereEl.setAttribute('role', 'button'); hereEl.tabIndex = 0; } else { hereEl.removeAttribute('role'); hereEl.removeAttribute('tabindex'); }   // 途中（v0.9.5）：「A → B（途中）」
    if (parts.length > 1) { const b = pdoc.createElement('span'); b.className = 'em-more'; b.textContent = ` +${parts.length - 1}`; hereEl.append(b); } hereEl.title = full ? U('here') + full : '';
    if (full) hereEl.setAttribute('aria-label', unm ? U('unm') + userName(unm) + ' · ' + U('unm_tip') : U('here') + full); else hereEl.removeAttribute('aria-label');
    if (full && hereEl.classList.contains('em-unsure')) { const t = U(BR.snapState === 'pending' ? 'pend' : 'stale'); hereEl.title += ' · ' + t; hereEl.setAttribute('aria-label', hereEl.getAttribute('aria-label') + ' · ' + t); }
    if (here !== hereShown) { hereShown = here; hereEl.classList.remove('em-full'); }   // 地点没变就别把用户刚点开的长胶囊收回去（接手 review P2）
    fab.classList.toggle('here', !!here);
    // bg：后台预加载中（面板不可见），地图据此不自动进庄园（E4 N03）
    if (!panel.hidden && alive) post({ type: 'eden-map:chat', id: chatId() });   // 当前聊天 id：本机自定义叫法按聊天分开存（E6）
    if (!panel.hidden && alive && here !== sent) { sent = here; post({ type: 'eden-map:here', value: here, bg: ghost }); }
    if (here !== emHere) { emHere = here; emit('here', { value: here }); emitMoved(here); }
    pushMvu();
  }
  // ---------------- v0.9.3：世界时间（标题栏 + 地图夜色）与主角着装（本人地点卡）；只读 stat_data，缺字段就不显示 ----------------
  // mvu.mjs 的加载与设定包配置（setVarRoot / setWbName）在桥里；桥加载好后经 onMvuLoad 把模块交给这里（纯函数调用用）
  let clockSig = null, outfitSig = null, clock = null, outfitNow = null;
  function pushMvu() {
    if (!MV) return;
    clock = BR.clock();   // { date, time, period, short, full, night, tod, pre }
    const cs = JSON.stringify(clock);
    if (cs !== clockSig) { clockSig = cs; const cap = (UI[UL] || UI.zh).clock; clockEl.hidden = !clock.short; clockEl.lastChild.textContent = clock.short + (clock.pre ? (UL === 'en' ? ' · pre-start' : ' · 开局前') : '');   // 用户 2026-09-28：时钟图标 + 「世界时间」提示，日期写成「1月3日」
      clockEl.title = (clock.full ? cap + '：' + clock.full : cap) + (clock.pre ? (UL === 'en' ? ' (before an opening is chosen: card initial values)' : '（开局前 · 卡初始值：还没选开局，时间 / 地点 / 人物来自卡的 MVU 初始变量）') : ''); clockEl.setAttribute('aria-label', clockEl.title); emit('clock', { ...clock }); sentClock = null; }
    if (alive && sentClock !== clockSig) { sentClock = clockSig; post({ type: 'eden-map:clock', ...clock }); }
    const o = BR.outfit(), os = JSON.stringify(o.items);
    if (os !== outfitSig) { outfitSig = os; outfitNow = o.items; emit('outfit', { items: o.items ? { ...o.items } : null, text: o.text }); sentOutfit = null; }
    if (alive && sentOutfit !== outfitSig) { sentOutfit = outfitSig; post({ type: 'eden-map:outfit', items: outfitNow, text: o.text }); }
  }
  let sentClock = null, sentOutfit = null;
  let pushT = 0;
  const pushSoon = (ms = 150) => { clearTimeout(pushT); pushT = setTimeout(push, ms); };
  // 通读 R2：状态栏的删除按钮直接改 MVU（replaceMvuData），可能不发 VARIABLE_UPDATE_ENDED；面板开着时每 4 秒比一次变量的指纹，变了才重算
  const updT = setInterval(() => { if (!panel.hidden && !ghost && alive) { autoCheck().catch(() => {}); followCheck().catch(() => {}); } }, 10 * 60 * 1000);   // 面板开着：每 10 分钟查一次更新
  let statSig = ''; const pollT = setInterval(() => { if (panel.hidden || !alive || pdoc.hidden) return;   // G2（P1）：后台标签页静默——隐藏时定时器已被钳制，别再 stringify 整份 stat_data 占主线程；切回前台由 wake() 无损补算
    let s = ''; try { s = JSON.stringify(mvuStat()); } catch (e) {}
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
  const INJECT_ID = 'eden-map-events';   // 窗口楼数（80，E6）在流水线里（CTX.SCAN）：未解除的事件在窗口内一直列出（events.mjs tierOf）
  const badge = root.querySelector('.em-badge');
  let events = [], floorNow = -1, seen = -1, injected = '', EVM = null;
  // 事态模块单独加载：加载失败只是没有事态功能，地图照常可用
  import(new URL('events.mjs', import.meta.url).href).then(m => { if (PACK_IN?.events) m.configure(PACK_IN.events, PACK_ID); EVM = m; recompute(); }).catch(e => console.warn('[eden-map] 事态模块加载失败', e));
  // 人物栏（v0.9.2）：人物位置标签 + MVU 人物表 → 每人最新位置；模块加载失败只是没有人物栏
  let CHM = null, chars = [], charSig = '', charsSent = null;   // charsSent：上一次发给地图的人物签名（没变就不重发）
  import(new URL('characters.mjs', import.meta.url).href).then(m => { CHM = m; recompute(); }).catch(e => console.warn('[eden-map] 人物模块加载失败', e));
  const chatKey = () => 'edenMapSeen:' + chatId();
  function loadSeen() { try { seen = +(LS || localStorage).getItem(chatKey()); if (!Number.isFinite(seen)) seen = -1; } catch (e) { seen = -1; } }
  // A-3：每楼原文的解析按 (楼层, 原文) 缓存、整轮输入的签名没变就跳过——都在流水线里（tavern/context.mjs，node 单测）；
  // 发送路径（GENERATION_AFTER_COMMANDS）只做注入需要的部分，标签改名 / 行程放到空闲时补做（restNow）。
  let restDue = false, restT = 0, custVer = 0;   // 调度状态：空闲补做与自定义版本号（轮次签名的输入）
  const perf = (k, ms) => { const P = window.parent.__edenMapPerf; if (P) (P[k] ||= []).push(ms); };
  function readMsgs() {
    let list = null;
    try { floorNow = getLastMessageId(); if (floorNow >= 0) list = getChatMessages(`${Math.max(0, floorNow - CTX.SCAN)}-${floorNow}`, { role: 'assistant' }); } catch (e) { floorNow = -1; }
    return CTX.readMsgs(list, floorNow);
  }
  function recompute(lite = false) {
    if (!EVM || life.dead) return;
    const t0 = performance.now();
    const { summarize, layerOf } = EVM;
    const msgs = readMsgs(), st = mvuStat(), hereNow = getHere();
    let stSig = ''; try { stSig = JSON.stringify(st); } catch (e) {}
    // 一轮的纯计算（签名去重、事件收集、人物栏 / 名册、新事态数）在流水线里（tavern/context.mjs）；这里只做取数与副作用
    const r = CTX.round({ floorNow, msgs, stSig, dbSig: BR.dbSig(), varSig: BR.varSig, custVer, customChat, chatId: chatId(), seen, wbState,
      hasReg: !!regNow, hasCHM: !!CHM, hasMV: !!MV, hasTRm: !!TRm, hasHereMod: !!hereMod, hereNow, collect: EVM.collect,
      charsDeps: CHM ? {
        mvuChars: CHM.mvuChars(st, hereNow, BR.varMap.present),
        known: BR.rosterNames({ msgs }),   // P3-B：五来源统一装配的已知名单（MVU 名册 + 聊天标签 + 数据库 + 保底 + 柏宝绘）
        dbCharacters: BR.dbCharacters(),
        collectChars: CHM.collectChars,
        rosters: MV ? BR.rosters(st) : null, reputation: MV ? BR.reputation(st) : null,
        presentKey: BR.varMap.present ? String(BR.varMap.present).split('.').pop() : '',
      } : null });
    if (!r.changed) { if (!lite && restDue) restNow(); return; }
    events = r.events;
    if (r.chars) { chars = r.chars;
      // 日程漫游（Part 5-3）：聊天 / MVU 没接管的人物按世界时刻补位（不覆盖已有位置）
      if (RTm && rtSched) { const minute = RTm.minuteOf(clock?.time || ''); if (minute != null) for (const w of RTm.whoWhere(rtSched, minute, chars.map(c => c.name))) chars.push({ name: w.name, place: w.place, floor: floorNow, src: 'routine' }); }
      if (MV) { roster = r.roster; rep = r.rep; BR.stageOrderFor(roster); BR.portraitsFor(); }
      const sig = floorNow + '|' + chars.map(c => c.name + '@' + c.place + '#' + c.floor).join() + '|' + JSON.stringify(roster) + Object.keys(BR.portraits).length + rep + (BR.stageOrder || []).join();
      if (sig !== charSig) { charSig = sig; if (alive) sendChars(); emit('characters', { items: chars.map(c => ({ ...c })), floor: floorNow }); } }   // 名册无条件发：面板关着时查看器也要靠它决定人物栏显隐（兜底名册 2026-09-29）
    const fresh = r.fresh;
    badge.hidden = !fresh; badge.textContent = fresh > 9 ? '9+' : fresh;
    if (fresh) tipOnce();
    if (TLm && floorNow >= 1) tlBtn.hidden = false;   // 有历史可回放：标题栏出现时间轴按钮（Part 5-4）
    restDue = true;
    if (!lite) restNow();   // 标签改名、行程；发送路径上推迟到空闲
    else { clearTimeout(restT); restT = setTimeout(() => (window.parent.requestIdleCallback || (f => f()))(() => { if (!life.dead && restDue) restNow(); }, { timeout: 1500 }), 0); }
    inject([summarize(events, layerOf(hereNow)), CHM ? CHM.summarizeChars(chars, 8, 160, floorNow) : '', MV && custom && !(custom.同步世界书 && wbState === 'bound') ? MV.summarizeCustom(custom) : '', INVm && lsGet('edenMapInvInj') !== '0' ? INVm.digestLine(inv, 150) : ''].filter(Boolean).join('\n'));
    if (!lite) { stateInject(); checkpointStep(); }
    if (!panel.hidden && alive) sendEvents();
    if (subs.events.size) { const sig = floorNow + '|' + events.map(e => e.id + ':' + e.last + ':' + e.tier).join(); if (sig !== emEvSig) { emEvSig = sig; emit('events', { items: events.map(e => ({ ...e })), floor: floorNow, hereLayer: layerOf(here) }); } }
    perf(lite ? 'lite' : 'core', performance.now() - t0);
  }
  function restNow() { restDue = false; const t0 = performance.now(); customTags(CTX.lastMsgs); computeTrips(CTX.lastMsgs); perf('rest', performance.now() - t0); }
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
  let TRm = null; import(SELF + 'tavern/trips.mjs').then(m => { TRm = m; }).catch(() => {});
  // 空间化背包（Part 5-1，tavern/inventory.mjs）：聊天变量 eden_map.仓库；地点卡显示 + 注入摘要，模型据此演「回房间取东西」
  let INVm = null; import(SELF + 'tavern/inventory.mjs').then(m => { INVm = m; sendInv(); }).catch(() => {});
  let inv = { items: {}, seq: 0 };
  function sendInv() { if (alive) post({ type: 'eden-map:inv', items: INVm ? INVm.rows(inv) : [] }); }
  function changedInv(save = true) { if (save) saveRoot(); sendInv(); }
  // 世界藏物表（Part 5-1，core/stash.mjs）：包数据 manifest.data.stash 的行整张推给查看器（它以当前图自己筛），
  // 拿到手的东西由背包的 id 对账——不再在地上发光。
  let STm = null, stash = null, stashRaw = null;
  import(SELF + 'core/stash.mjs').then(m => { STm = m; if (stashRaw) { stash = m.normStash(stashRaw); sendStash(); } }).catch(() => {});
  { const sp = PACK_IN?.manifest?.data?.stash; if (sp) { const sb = PACK_ID === 'eden' ? '' : 'packs/' + PACK_ID + '/';
    cdnFetch(BASE + sb + sp).then(r => r.ok ? r.json() : null).then(j => { stashRaw = j; if (STm && j) { stash = STm.normStash(j); sendStash(); } }).catch(() => {}); } }
  function sendStash() { if (alive && STm) post({ type: 'eden-map:stash', items: STm.rows(stash || {}, {}) }); }
  // NPC 日常漫游（Part 5-3，tavern/routine.mjs）：包数据 manifest.data.routine 的日程表；聊天没提到的人物按世界时刻落在该在的地方
  let RTm = null, rtSched = null; import(SELF + 'tavern/routine.mjs').then(m => { RTm = m; if (rtCfg) { rtSched = m.normSchedule(rtCfg); recomputeSoon(50); } }).catch(() => {});
  let rtCfg = null;
  { const rp = PACK_IN?.manifest?.data?.routine; if (rp) { const rb = PACK_ID === 'eden' ? '' : 'packs/' + PACK_ID + '/';   // 与保底名册同一算法：eden 的路径相对 map/，其它包相对 packs/<id>/
    cdnFetch(BASE + rb + rp).then(r => r.ok ? r.json() : null).then(j => { rtCfg = j; if (RTm && j) { rtSched = RTm.normSchedule(j); recomputeSoon(50); } }).catch(() => {}); } }
  function computeTrips(msgs) {
    if (!TRm || !MV || !custom || customChat !== chatId()) return;
    const r = CTX.computeTrips(msgs, { TRm, CHM, perFloorStat: f => BR.perFloorStat(f), mvuGet: (s, p) => BR.mvuGet(s, p), varMap: BR.varMap,
      keywords: BR.varUser.keywords || TRm.DEFAULT_KEYWORDS, fantasy: !!BR.varUser.fantasy, parseTransit: s => hereMod?.parseTransit?.(s) || null });
    if (r.changed) { saveRoot(); sendTrips(); }   // 行程变了才写聊天变量、才发地图
  }
  function sendTrips() { if (alive) post({ type: 'eden-map:trips', items: CTX.trips }); }
  function sendChars() { if (alive) post({ type: 'eden-map:chars', v: 1, floor: floorNow, items: chars, rosters: roster, rep, stageOrder: BR.stageOrder, portraits: BR.portraits }); }
  // v0.9.5 名册（只读）：在场 / 成员 / 目标三张表 + 主角声望的表对象在这里（发地图用）；
  // 阶段先后序与原作立绘表在桥里（每聊天读一次卡文本，BR.stageOrder / BR.portraits）
  let roster = null, rep = null;
  let tipShown = false; try { tipShown = !!(LS || localStorage).getItem('edenMapEvTip'); } catch (e) {}
  function tipOnce() {
    if (tipShown || !panel.hidden) return; tipShown = true; try { (LS || localStorage).setItem('edenMapEvTip', '1'); } catch (e) {}
    hostToast(UL === 'en' ? 'New events in Tiancheng' : '天城有新事态', [], 10000, null, false, { key: 'newev', level: 2, actions: [{ label: UL === 'en' ? 'View' : '查看', primary: true, run: () => fab.click() }] });   // UI v2：P2，不再挂在悬浮按钮上
  }
  let evT = 0;
  const recomputeSoon = (ms = 250) => { clearTimeout(evT); evT = setTimeout(recompute, ms); };

  // ---------------- 时间轴回放（Part 5-4，tavern/timeline.mjs）：标题栏 ⏱ 进出，拖动滑块把地图退回那一楼 ----------------
  const tlBtn = root.querySelector('.em-tl-btn'), tlEl = root.querySelector('.em-tl'), tlR = root.querySelector('.em-tl-r'), tlV = root.querySelector('.em-tl-v');
  let TLm = null, tlOn = false; const tlCache = new Map();
  import(SELF + 'tavern/timeline.mjs').then(m => { TLm = m; if (floorNow >= 0) tlBtn.hidden = false; }).catch(() => {});
  function tlState(f) {
    if (!TLm || f < 0) return null;
    if (tlCache.has(f)) return tlCache.get(f);
    let st = null;
    try {
      st = TLm.floorState(f, {
        getRaw: x => { try { return getChatMessages(x + '-' + x)?.[0]?.message || ''; } catch (e) { return ''; } },
        perFloorStat: x => BR.perFloorStat(x), mvuGet: (s, p) => BR.mvuGet(s, p), varMap: BR.varMap,
        parseChars: CHM?.parseChars, mvuChars: CHM?.mvuChars, patchPlace: TRm?.patchPlace,
        lp: '/' + String(BR.varMap.location || '世界.当前地点').split('.').join('/'),
      });
    } catch (e) {}
    if (st) { tlCache.set(f, st); if (tlCache.size > 240) tlCache.delete(tlCache.keys().next().value); }
    return st;
  }
  function tlScrub(f) {
    f = Math.max(0, Math.min(floorNow, Math.round(f)));
    const st = tlState(f);
    tlV.textContent = (st?.here ? `${st.here} · ` : '') + (st?.time ? st.time + ' · ' : '') + `第 ${f} 楼`;
    if (!st || !alive) return;
    post({ type: 'eden-map:here', value: st.here, replay: true });   // 查看器只重画；探索记录已被 replay 静默
    post({ type: 'eden-map:chars', v: 1, floor: f, items: st.chars, replay: true });
  }
  function tlEnter() { if (!TLm || floorNow < 1) return; tlOn = true; tlEl.hidden = false; tlBtn.classList.add('on'); tlR.max = floorNow; tlR.value = floorNow; tlScrub(floorNow); }
  function tlExit() {
    if (!tlOn) return; tlOn = false; tlEl.hidden = true; tlBtn.classList.remove('on');
    if (life.dead) return;
    push(); if (alive) { post({ type: 'eden-map:chars', v: 1, floor: floorNow, items: chars, rosters: roster, rep, stageOrder: BR.stageOrder, portraits: BR.portraits }); sendEvents(); }   // 回当下：地点 / 人物 / 事态全部重推
  }
  tlBtn.addEventListener('click', () => (tlOn ? tlExit() : tlEnter()));
  tlEl.querySelector('.em-tl-x').addEventListener('click', tlExit);
  tlR.addEventListener('input', () => tlScrub(+tlR.value));

  // ---------------- 本机扩展接口 window.EdenMap（E6，docs/content-compat.md） ----------------
  // 在宿主页挂 window.EdenMap，转发给地图 iframe（srcdoc，与宿主同源，直接调用）；地图没开时直接读写本机 localStorage（同一份存储，同一套函数 here.mjs）。
  // 自定义叫法按聊天分开存（edenMap:chat:<聊天 id>:custom），拿不到聊天 id 时存全局 edenMap:custom。不联网、不上传、不进地址。
  // 宿主页上的方法都返回 Promise。on('here' | 'events' | 'map', fn)：here / events 由本脚本发（面板关着也发），map 由地图发。
  const subs = { here: new Set(), events: new Set(), map: new Set(), characters: new Set(), outfit: new Set(), clock: new Set(), custom: new Set() };
  let emHere = null, hereShown = null, emEvSig = '', roomsKnown = null, HXm = null, hereMod = null;
  function emit(ev, data) { for (const f of subs[ev]) { try { f(data); } catch (e) { console.warn('[EdenMap]', e); } } }
  const hx = () => (HXm ??= import(SELF + 'here.mjs'));
  hx().then(m => { hereMod = m; setTimeout(push, 0); }).catch(() => {});
  let CXm = null; const chx = () => (CXm ??= import(SELF + 'tavern/characters.mjs'));
  const inner = () => { if (!alive) return null; try { const w = frame.contentWindow; if (!w?.EdenMap) return null; fnGuard('EdenMap.__chat', w.__edenMapChat, 1)?.(chatId()); return w.EdenMap; } catch (e) { return null; } };   // G6：跨窗口拿到的是查看器的 EdenMap——每个调用点先过守卫（handoff 准则 1）
  function knowRooms() { try { const g = fnGuard('EdenMap.getRooms', inner()?.getRooms, 0); const r = g ? g().rooms : null; if (r?.length) roomsKnown = r; } catch (e) {} }
  const store = () => { try { return PACK_IN ? wrapLS(() => window.parent.localStorage) : window.parent.localStorage; } catch (e) { return null; } };

  // ---------------- v0.9.3 自定义名称与用途（聊天变量 eden_map.自定义；酒馆助手没有变量接口时退回本机 localStorage） ----------------
  // 不写进 stat_data：卡的 MVU zod 结构会丢掉未知键。删除一项要整块替换，所以写入优先用 updateVariablesWith / replaceVariables（insertOrAssignVariables 是深合并，删不掉键）。
  // 剧情标签 ⌖改名 / ⌖用途：只处理比 eden_map.标签楼 新的楼层，处理后记下楼层；每条在地图的事态横条上方提示一次。
  // 「同步到世界书」默认开（v0.9.5；自己关过的保持关）；有了第一项自定义才建世界书「伊甸地图·自定义·<聊天>」（一个常驻条目），当前聊天没有绑定聊天世界书时绑定到这个聊天。
  let custom = null, customChat = null, toastQ = [], regP = null;   // 标签楼层状态（tagFloor / tagLog / tagSeen）在流水线里（CTX.tag）
  const varsOk = () => fnOk('getVariables') && (fnOk('updateVariablesWith') || fnOk('replaceVariables') || fnOk('insertOrAssignVariables'));
  const lsCustomKey = () => 'edenMap:chat:' + (chatId() || '') + ':custom2';   // A-11 本机退回的键（读取在桥里，写入后清掉它）
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
  const saveRoot = () => life.dead ? Promise.resolve(false) : writeVars({ 自定义: custom, 标签楼: CTX.tag.floor, 标签记录: CTX.tag.log, 楼层指纹: CTX.tag.seen, 行程: CTX.trips, 仓库: inv, ...(Object.keys(explored).length ? { 探索: explored } : {}), ...(cp ? { 检查点: cp } : {}) }, customChat);
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
    const v = readVars(); custom = MV.normCustom(v.自定义);   // 标签楼层 / 记录 / 指纹整块换进流水线（撤销-重放状态机的状态）
    CTX.tag = { floor: Number.isFinite(+v.标签楼) && v.标签楼 !== null ? +v.标签楼 : -1,
      log: Array.isArray(v.标签记录) ? v.标签记录.filter(r => r && Number.isFinite(r.floor) && typeof r.key === 'string').slice(-30) : [],
      seen: v.楼层指纹 && typeof v.楼层指纹 === 'object' ? { ...v.楼层指纹 } : {} };
    explored = FOGm ? FOGm.norm(v.探索) : (v.探索 && typeof v.探索 === 'object' ? v.探索 : {});
    inv = INVm ? INVm.norm(v.仓库) : { items: {}, seq: 0 };   // 空间化背包（Part 5-1）
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
  // 剧情标签 ⌖改名 / ⌖用途（v0.9.3）：撤销-重放状态机在流水线里（tavern/context.mjs customTags，node 单测）；
  // 这里只做守卫与副作用——有应用 / 撤销走 customChanged（提示 + 保存 + 世界书），纯指纹收紧只 saveRoot。
  function customTags(msgs) {
    if (!MV || !custom || customChat !== chatId()) return;
    const r = CTX.customTags(custom, msgs, floorNow, kindOf);
    if (!r) return;
    custom = r.custom; CTX.tag = r.tag;
    if (r.applied.length || r.undone) { toastQ.push(...r.applied.map(MV.tagToast)); customChanged(true); } else saveRoot();
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
    // 空间化背包（Part 5-1）：setInv('机密账本', { place: '书房', map: 'estate', hidden: true, note: '塞在书架第三层' })；removeInv('机密账本')；getInv() 只读
    async setInv(name, patch = {}) { if (!INVm) return false; const r = INVm.put(inv, { name, ...patch }); if (!r.changed) return false; inv = r.inv; changedInv(); return true; },
    async removeInv(key) { if (!INVm) return false; const r = INVm.remove(inv, key); if (!r.changed) return false; inv = r.inv; changedInv(); return true; },
    getInv: async () => (INVm ? INVm.rows(inv) : []),
    getOutfit: async () => ({ items: outfitNow ? { ...outfitNow } : null, text: MV ? MV.outfitText(outfitNow) : '' }),   // 主角着装（只读 MVU 主角.着装）
    getClock: async () => (clock ? { ...clock } : null),   // 世界时间（只读 MVU 世界.当前日期 / 当前时刻 / 当日时段）
    // 人物头像（v0.9.2）：只存本机 localStorage（按聊天，拿不到聊天 id 时全局），不上传、不进地址；src = data:image/… 或 http(s) 图片地址
    // 面板看得见时交给地图（它自己提示）；面板关着 / 后台预加载 / 休眠时在这里写，满了用宿主提示条告诉用户（地图里的提示条此时看不见，A-13），再让地图重读
    async setAvatar(name, src) { const v = inner(), setS = v ? fnGuard('EdenMap.setAvatar', v.setAvatar, 2) : null; if (setS && !panel.hidden && !ghost) return setS(name, src); const C = await chx(), st = store(); if (!st) return false;
      const img = await shrinkAvatar(src), r = C.setAvatarEx ? C.setAvatarEx(st, chatId(), name, img) : { ok: C.setAvatar(st, chatId(), name, img) };
      if (!r.ok && (r.reason === 'cap' || r.reason === 'quota')) storeWarn(r.reason);
      if (r.ok && v) try { await fnGuard('EdenMap.setAvatar', v.setAvatar, 2)?.(name, img); } catch (e) {}   // 地图重写同一张（已有这个名字，不占新额度）并重画
      return r.ok; },
    storage: async () => { const st = store(); return BG && st ? BG.measure(st) : null; },   // A-13：本机存储占用（字节，UTF-16）
    async removeAvatar(name) { const v = inner(), rm = v ? fnGuard('EdenMap.removeAvatar', v.removeAvatar, 1) : null; if (rm) return rm(name); const C = await chx(), st = store(); return !!st && C.removeAvatar(st, chatId(), name); },
    async getCharacters() { return { items: chars.map(c => ({ ...c })), floor: floorNow, rosters: roster ? JSON.parse(JSON.stringify(roster)) : null, reputation: rep }; },   // v0.9.5：rosters / reputation 只读
    // 三维查看器飞到热点（v1.0 测试件：{ map: 'dairy', hotspot: 'tank' }）：面板没开就先打开；地图就绪后转发
    async flyTo(t) { flyQ = t || null; if (panel.hidden && !ghost) { panel.hidden = false; await loadViewer(); } else if (ghost) fab.click();
      if (!flyQ) return true; const v = inner(), fly = v ? fnGuard('EdenMap.flyTo', v.flyTo, 1) : null; if (fly) { flyQ = null; return fly(t); } return true; },
    // v0.9.6 只读：当前在用的数据来源（不含任何数据内容本身）。location = 当前地点来自哪里；characters = 人物栏各来源人数；
    // mvu = { present, mode: 'mvu' | 'mvu-partial' | 'tags' }；db = 表格数据库插件 { tables, location, chars } 或 null（没装）；tags = 聊天标签（⌖ / 人物标签）总在读
    async sources() {
      const hasMvu = BR.mvuPresent(), mode = BR.varmode();
      const db = BR.dbFacts();
      const ctx = { hasMvu, mode, db, here, hereFromDb: BR.hereFromDb, chars, varMap: { ...BR.varMap }, vars: varsOk() };
      if (SRCm) return SRCm.summarize(ctx);   // 数据源注册表（tavern/sources.mjs）
      const byc = {}; for (const c of chars) byc[c.src || 'infer'] = (byc[c.src || 'infer'] || 0) + 1;
      return { location: here ? (BR.hereFromDb ? 'db' : 'mvu') : 'none', mvu: { present: hasMvu, mode }, db, tags: true, characters: byc, varmap: { ...BR.varMap } };
    },
    selfcheck: (o = {}) => { if (o?.show) showSplash(); return runCheck().then(() => ({ items: checkItems.map(i => ({ ...i })), at: checkAt })); },   // 启动自检的结果（只在本机）；{ show: true } 再显示开场自检卡（v0.9.5）
    on(ev, fn) { if (subs[ev] && typeof fn === 'function') subs[ev].add(fn); return api; },
    off(ev, fn) { if (subs[ev]) fn ? subs[ev].delete(fn) : subs[ev].clear(); return api; },
  });
  const exposed = guardApi(api, EDEN_API);   // G6（P0）：暴露面逐项过守卫（类型 + 形参个数，契约在 tavern/edenapi.mjs）；内部调用仍走原 api
  window.parent.EdenMap = exposed;

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
      try { await Promise.race([BR.whenMvu(), new Promise(r => setTimeout(r, 3000))]); } catch (e) {}
      let mvu = null;
      try { if (BR.mvuUsable()) { const st = BR.rawLatestStat();
        refreshVarMap(); const hp = BR.varMap.location || SC.HERE_PATH;
        mvu = { stat: !!st && typeof st === 'object', path: hp, here: !!st && SC.getPath(st, hp) !== undefined, candidates: st ? SC.findPaths(st).filter(p => p !== hp) : [],
          fields: st && MV ? { present: !!MV.presentList(st, BR.varMap.present), clock: !!MV.worldTime(st, BR.varMap).time, outfit: MV.get(st, BR.varMap.outfit || '主角.着装') !== undefined } : null }; } } catch (e) { mvu = { stat: false }; }
      const varmode = BR.varmode(BR.mvuUsable());
      const loads = [...new Set(Object.entries(window.parent.__edenMapIds || {}).filter(([k, u]) => k !== OWNER && u !== switchedFrom).map(([, u]) => u))];   // A3：按脚本身份，不按地址
      const ln = { swappable, name: (LINES.find(l => l.key === line) || {}).name || '',
        ok: !swappable ? null : lineP ? await lineP.then(ok => ok && fetchHtml().then(() => true, () => false), () => false) : html ? await html.then(() => true, () => false) : null };
      checkFacts = {
        api: { getChatMessages: fnOk('getChatMessages'), eventOn: fnOk('eventOn'), injectPrompts: fnOk('injectPrompts'), tavern_events: typeof tavern_events === 'object' },
        vars: varsOk(), ejs: (() => { try { return typeof (window.parent.EjsTemplate || globalThis.EjsTemplate) === 'object'; } catch (e) { return false; } })(),
        db: BR.dbFacts(true),
        mvu, varmode, dup: { others: loads, oldStyle, replaced: !root.isConnected }, line: ln, worldbook: await wbFacts(), version: { script: plainVer(VER), viewer: viewerVer }, update: await updateFacts(),
        // B3 卡身份（getCharData，旧办法回退）、B4 宿主版本（只报告）、B7 角色卡正则（只读）
        card: THm ? await THm.cardIdentity(thFn, () => BR.stContext()).catch(() => null) : null, host: THm ? THm.hostVersions(thFn) : null,
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
  async function switchBranch(br) {   // 设置「更新与版本」→ 版本分支（main / preview 双轨）：本次会话从目标分支重载同一个脚本，新实例 takeOver 接管这一份；长期使用请重新导入该分支的脚本
    if (!SRCm) { try { SRCm = await import(SELF + 'tavern/sources.mjs'); } catch (e) {} }
    const url = SRCm ? SRCm.branchUrl(import.meta.url, br) : null;
    if (!url || life.dead) return;
    window.parent.__edenMapSwitch = SELF;
    import(url).catch(e => { console.warn('[eden-map] 切换分支失败', e); window.parent.__edenMapSwitch = switchedFrom; });
  }

  // ---------------- 交互方式 (a)(d)(e)（docs/interaction-modes.md；纯逻辑在 tavern/modes.mjs） ----------------
  // (a) 每次生成前把「地点、在场、时间、行程」压成一行（≤ 设置的 token 上限，默认 150）按固定 id、固定深度注入；重生 / swipe / 重载都覆盖同一条，不叠。
  //     数据没确认（pending / stale）时标「未确认」；卡的提示词里已经有的字段跳过；设置「数据与映射」开关（默认开），深度与上限在「高级」。
  // (e) 最小检查点：eden_map.检查点 = { 楼, swipe }（最后确认的楼层与 swipe），只在确认前进时写（幂等）；启动时对照，楼 / swipe 对不上就作废并从聊天记录重推。
  let stateNow = '', cardSkip = null, cardSkipChat = null, cp = null, cpResume = null;
  const MDm = BR.modes;   // 纯逻辑模块（modes.mjs）经桥静态引入，求值即用（原来动态加载后补一次 stateInject，改在启动序列里）
  async function cardSkipFor() {   // 卡的提示词文本（角色描述、场景、系统提示、历史后指令、卡内世界书）里引用了哪些 stat_data 字段；每个聊天算一次
    const c = chatId(); if (cardSkipChat === c && cardSkip) return cardSkip; cardSkipChat = c; cardSkip = {};
    try { const d = await Promise.resolve(thFn('getCharData')?.('current')); const x = d?.data || d || {};
      const texts = [x.description, x.personality, x.scenario, x.system_prompt, x.post_history_instructions, x.mes_example, x.first_mes, ...((x.character_book?.entries) || []).map(e => e?.content)];
      cardSkip = MDm ? MDm.cardHas(texts, BR.varMap) : {}; } catch (e) {}
    return cardSkip;
  }
  function stateText(type) {
    const n = BR.chatLen(); if (!MDm || n < 0) return '';
    const r = MDm.snapFor(BR.pickStat, i => BR.readFloor(i), n - 1, { type });
    const st = r.stat, get = p => (st ? BR.getPath(st, p) : undefined);
    let place = String(get(BR.varMap.location) ?? '').trim(), state = r.state;
    if (BR.hereSrc === 'tag' && type !== 'swipe' && type !== 'regenerate') { place = here; }   // (d) 正文标签兜底的地点
    const pres = st ? BR.presentNames(st) : [];
    const wt = st ? BR.worldTimeOf(st) : null, time = wt ? [wt.date, wt.time, wt.period].filter(Boolean).join(' ') : '';
    return MDm.stateLine({ here: userName(place), present: pres, time, trips: (CTX.trips || []).map(t => ({ ...t })), state, skip: cardSkip || {} }, +(lsGet('edenMapStateBudget') || 150));
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
    const top = BR.snapTop, sw = BR.swipeAt(top);
    const n = MDm.nextCheckpoint(cp, { floor: BR.snapFloor, top, swipe: sw, state: BR.snapState });
    if (n !== cp) { cp = n; saveRoot(); }
  }
  function checkpointResume(v) {   // loadCustom 里：读检查点并对照聊天
    cp = v && typeof v === 'object' && Number.isInteger(v.楼) ? { 楼: v.楼, swipe: Number.isInteger(v.swipe) ? v.swipe : 0 } : null; cpResume = null;
    if (!MDm) return; const n = BR.chatLen(); if (n < 0) return;
    cpResume = MDm.resume(cp, i => { const c = BR.chatAt(i); if (!c) return null; const sv = c.variables?.[c.swipe_id ?? 0]; return { swipe: c.swipe_id ?? 0, hasStat: !!sv?.stat_data, role: c.is_user ? 'user' : 'assistant' }; }, n - 1);
    if (cpResume.reason === 'swiped' || cpResume.reason === 'missing') cp = null;   // 作废：下次确认时重写
    if (cpResume.reason !== 'match' && cpResume.reason !== 'none') { statSig = ''; recomputeSoon(0); pushSoon(0); }
  }
  function conflictsNow() {   // 自检：最近 30 楼里 MVU 地点与正文地点标签不一致的楼（只列出，不改）
    if (!MDm || !BR.mvuPresent()) return [];
    const fl = []; for (const m of CTX.lastMsgs.slice(-30)) { const st = BR.perFloorStat(m.floor);
      const mv = st ? String(BR.getPath(st, BR.varMap.location) ?? '') : ''; if (mv) fl.push({ floor: m.floor, mvu: mv, raw: m.raw }); }
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
    try { thFn('initializeGlobal')?.('EdenMap', guardApi(api, EDEN_API)); } catch (e) {}
    macroSet(lsGet('edenMapMacros') === '1');
  }
  // B9 类宏（默认关）：{{eden_here}} 当前地点、{{eden_route}} 最近一段行程；卡 / 预设作者自己引用
  function macroSet(on) {
    macroOff?.(); macroOff = null; if (!on || !THm || life.dead) return;
    macroOff = THm.registerMacros(thFn, k => (k === 'eden_here' ? userName(here) : (() => { const t = (CTX.trips || []).filter(x => !x.who).at(-1); return t ? `${t.from} → ${t.to}` : ''; })()));
  }
  // B8 广播：地图里的当前地点变了 → eventEmit('eden-map:moved', { from, to, source, at })；只发地点，不写 MVU / 数据库
  let movedFrom = null;
  function emitMoved(to) {
    if (movedFrom === null) { movedFrom = to; return; } if (to === movedFrom || life.dead) return;
    const from = movedFrom; movedFrom = to;
    try { thFn('eventEmit')?.('eden-map:moved', THm ? THm.movedPayload(from, to, { source: BR.hereFromDb ? 'db' : BR.hereSrc || 'mvu' }) : { from, to, at: Date.now() }); } catch (e) {}
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
  const close = () => { if (panel.hidden || ghost) return; panel.hidden = true; sleepViewer(); prefSync(); tlExit(); if (toastWait && SC) setTimeout(toastOnce, 400); if (updWait) setTimeout(showUpdPrompt, 600); };
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
    try { BR.whenMvu().then(() => { const ev = BR.varUpdateEvent(); if (ev) listen(ev, () => { BR.invalidate(); pushSoon(); recomputeSoon(); }); }); } catch (e) {}   // MVU 人物表也会变（人物栏）
    listen(tavern_events.CHAT_CHANGED, () => pushSoon(300));
    listen(tavern_events.CHAT_CHANGED, () => { clearTimeout(wbChatT); wbChatT = setTimeout(() => { if (!life.dead) afterGen(() => wbAuto().catch(e => console.warn('[eden-map] 世界书自动', e))); }, 1500); });   // 换角色 / 聊天：新角色也挂上、聊天版本提醒
    listen(tavern_events.MESSAGE_SWIPED, () => pushSoon(300));
    listen(tavern_events.CHAT_CHANGED, () => { try { BG?.touch(store(), chatId()); } catch (e) {} injected = null; stateNow = ''; cardSkip = null; cp = null; CTX.reset(); loadSeen(); custom = null; if (tlOn) { tlOn = false; tlEl.hidden = true; tlBtn.classList.remove('on'); } tlCache.clear(); loadCustom().then(() => recomputeSoon(300)); });
    // 通读 R1：开局菜单用 setChatMessage(swipe_id) 换开场白，不一定触发 SWIPED；渲染 / 编辑事件也听，地点跟着刷新
    for (const k of ['MESSAGE_RECEIVED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_DELETED', 'MESSAGE_EDITED', 'CHARACTER_MESSAGE_RENDERED']) if (tavern_events[k]) listen(tavern_events[k], () => { recomputeSoon(); pushSoon(300); });   // 新楼、改楼、重 roll、删楼：重算
    // 生成前同步一次，注入的是最新态势（A-3：只做注入需要的部分；输入没变直接跳过；标签改名 / 行程推到空闲）
    // v0.9.9：生成状态（pending 指示）+ swipe 删除 + 切回前台（被系统挂起 / 断网恢复后事件可能丢了）→ 从聊天记录与楼层变量重新推导
    if (tavern_events.GENERATION_STARTED) listen(tavern_events.GENERATION_STARTED, (t, o, dry) => { if (!dry) { GEN.since = Date.now(); pushSoon(0); } });
    for (const k of ['GENERATION_ENDED', 'GENERATION_STOPPED']) if (tavern_events[k]) listen(tavern_events[k], () => { GEN.since = 0; setTimeout(flushIdle, 800); recomputeSoon(); pushSoon(300); });
    if (tavern_events.MESSAGE_SWIPE_DELETED) listen(tavern_events.MESSAGE_SWIPE_DELETED, () => { recomputeSoon(); pushSoon(300); });
    { const wake = () => { if (pdoc.visibilityState !== 'hidden' && !life.dead) { statSig = ''; recomputeSoon(0); pushSoon(0); post({ type: 'eden-map:wake' }); } }; pdoc.addEventListener('visibilitychange', wake); window.parent.addEventListener('pageshow', wake); window.parent.addEventListener('online', wake);   // G3（P1）：切回前台顺手叫醒查看器（唤醒消息此前只用于休眠恢复）——宿主数据推送之外，查看器也能即时自刷新
      life.add(() => { pdoc.removeEventListener('visibilitychange', wake); window.parent.removeEventListener('pageshow', wake); window.parent.removeEventListener('online', wake); }); }
    if (tavern_events.GENERATION_AFTER_COMMANDS) listen(tavern_events.GENERATION_AFTER_COMMANDS, (type) => { clearTimeout(evT); recompute(true); stateNow = ''; stateInject(typeof type === 'string' ? type : 'normal'); });   // (a) 重生 / swipe：用被替换那一楼之前的状态
    push(); loadSeen(); recompute(); stateInject(); startTick();   // modes.mjs 经桥静态可用（原动态加载后补一次注入，改为启动序列里统一做）
    (window.parent.requestIdleCallback || (f => setTimeout(f, 1500)))(() => { if (life.dead) return; afterGen(() => preload().catch(() => {})); try { budgetSweep(); } catch (e) {} setTimeout(() => { if (!life.dead) autoCheck().catch(() => {}); }, window.parent.__edenAutoCheckDelay ?? 6000); if (splashDue()) { lsSet('edenMapSplashSeen', String(VER || 'dev')); runCheck(); } else setTimeout(runCheck, 4000); setTimeout(() => { if (!life.dead) afterGen(() => wbAuto().catch(e => console.warn('[eden-map] 世界书自动同步失败', e))); }, 8000); });   // 打开聊天后空闲时：测速选线 + 预加载；稍后自检一次
  })();

  // 脚本被关闭或重载时清理注入的元素
  const cleanup = () => { if (life.dead) return; life.kill(); life.unlisten(); clearInterval(watchT); clearTimeout(quietT); clearInterval(pollT); clearInterval(updT); clearInterval(tickT); cgObs.disconnect(); acuObs.disconnect(); try { BR.disposeDb(); } catch (e) {} clearTimeout(killT); clearTimeout(pushT); clearTimeout(evT); clearTimeout(restT); clearTimeout(ghostT); try { inject(''); } catch (e) {} root.remove(); window.parent.removeEventListener('message', onMsg); themeMq?.removeEventListener?.('change', onThemeMq); pdoc.removeEventListener('keydown', onKey);
    if (window.parent.EdenMap === exposed) delete window.parent.EdenMap; toastEl?.remove(); updEl?.remove(); splash?.el?.remove(); try { NT?.destroy(); barRO?.disconnect(); } catch (e) {}
    if (window.parent.__edenMapCleanup === cleanup) delete window.parent.__edenMapCleanup;
    try { const R = window.parent.__edenMapIds; if (R && R[OWNER] === SELF) delete R[OWNER]; } catch (e) {}   // 换版本 / 关掉脚本后不再算作「另一个地图脚本」
    try { for (const el of [...pdoc.querySelectorAll('[data-eden-owner]')]) if (el.getAttribute('data-eden-owner') === OWNER) el.remove(); } catch (e) {}
    prefs.stop(); window.removeEventListener('storage', onStorage); try { macroOff?.(); } catch (e) {} try { MDm?.applyState(thFn, '', 0); } catch (e) {} };   // 换版本 / 关掉脚本后不再算作「另一个地图脚本」（用户实测：换成 v0.9.3 后没刷新页面就误报）
  install(cleanup);   // __edenMapCleanup + pagehide（host-lifecycle.mjs）
})();
