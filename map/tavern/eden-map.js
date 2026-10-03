// 地图悬浮按钮（酒馆助手脚本）
// 卡内脚本只需一行：import 'https://cdn.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@<版本>/map/tavern/eden-map.js'
// 注入酒馆页面：右下角悬浮按钮 + 地图面板；面板内用 srcdoc 加载 viewer.html（<base> 指回仓库，相对资源照常加载）。
// 当前地点取 MVU 变量（路径由设定包的 vars 给出，缺了按字段名自动找），变量更新 / 切换聊天时推送给地图高亮。
// 事态：从最近 80 楼原文解析事件标签（events.mjs，两种写法都认），推给地图落点；角色所在层的活跃事件压成一句注入给模型。
// v0.9.3 MVU 联动（mvu-readers.mjs）：只读 stat_data（世界时间、主角着装、在场人物）；自定义名称与用途存在聊天变量顶层键 eden_map（不进 stat_data，见 docs/content-compat.md）。
// C2 第 4 步（2026-09-28）拆成：入口（本文件：面板 / 查看器状态机、消息、MVU / 事态 / 自定义 / 自检 / 更新）+ host-routes.mjs（线路）
// + host-lifecycle.mjs（接管旧实例、挂 DOM、监听登记、清理钩子）+ host-tavernhelper.mjs（酒馆助手适配、偏好、世界书全自动）。见 docs/agent-brief.md「模块地图」。
// S5-1（2026-10-01）再拆出八个 flow 模块（stash-flow（S6-2 前叫 loot-flow）/ chars-flow / root-store / host-api / host-checks / llm-flow / modes-flow / timeline-flow，各是 createX(host)）：
// 下面的 host 依赖袋是它们取入口变量与函数的唯一通道；入口留着面板 / 查看器状态机、重算调度、监听登记与清理。
import '../core/logbuf.mjs'; import { redirected } from './follow-gate.mjs'; import './pack-gate.mjs'; // 反馈日志缓冲：最先 import，模块求值即安装，启动日志不丢（v0.9.6 报告「(none)」根因）
import { cdnFetch, thFn, packNs, createPrefs } from './host-tavernhelper.mjs';
import { createRoutes, scoreText } from './host-routes.mjs';
import { createLife, takeOver, mount, install, watchVisible, chainText } from './host-lifecycle.mjs';
import { createAbout } from './host-about.mjs';
import { createLlmFlow } from './llm-flow.mjs';
import { createRouteFlow } from './route-flow.mjs';
import { createStashFlow } from './stash-flow.mjs';
import { createCharsFlow } from './chars-flow.mjs';
import { createTimelineFlow } from './timeline-flow.mjs';
import { createHostApi } from './host-api.mjs';
import { createRootStore } from './root-store.mjs';
import { createHostChecks } from './host-checks.mjs';
import { createModesFlow } from './modes-flow.mjs';
import { hostStr } from './host-strings.mjs'; import { updateChannel, artBase } from './follow-pin.mjs'; import { nextRoute } from './tile-route.mjs'; import { createBootWatchdog } from './viewer-boot.mjs';   // P2 解耦：版本信息与检查更新（取数 / 发消息由入口注入）；viewer-boot：查看器起不来时的重挂（见 mountFrame）
(() => { if (redirected) return;   // 分支路径加载的旧入口：门卫已换成 @<sha> 的入口（follow-gate.mjs），这里什么也不挂
  const scriptBase = new URL('../', import.meta.url).href;            // .../map/（脚本自己加载的位置）
  // 地基 A1 cdnFetch、设定包命名空间（NS / LS / lsGet / lsSet）：host-tavernhelper.mjs
  const { PACK_IN, PACK_ID, MAN, wrapLS, LS, lsGet, lsSet } = packNs(scriptBase); let MANv = PACK_IN?.manifest || null; MAN.then(m => { MANv = m || MANv; }); const HS = (k, en) => hostStr(MANv, k, en ? 'en' : 'zh');   // MAN：包清单（Promise）；MANv = 到了之后的同步副本，HS = 宿主文案（清单 strings，没到 / 没写就是中性默认）
  const life = createLife(), { listen } = life;   // 监听登记与「死亡」标记（host-lifecycle.mjs）
  // 协议 v2（core/protocol.mjs，docs/design/arch-v2.md §3）：发出的消息盖 v；收到的消息按 schema 校验（模块没到时照旧处理）
  const PROTO = 2; let protocolModule = null;   // 与 core/protocol.mjs PROTO 一致（tests/protocol.test.mjs 检查）
  import(scriptBase + 'core/protocol.mjs').then(m => { protocolModule = m; }).catch(e => console.warn('[map] eden-map: protocol import failed', e));
  let explorationLedgerModule = null, explored = {}; import(scriptBase + 'core/exploration-ledger.mjs').then(m => { explorationLedgerModule = m; explored = m.norm(explored); }).catch(e => console.warn('[map] eden-map: exploration-ledger import failed', e));   // 迷雾探索（eden_map.探索）
  let dataSourceRegistryModule = null; import(scriptBase + 'tavern/data-source-registry.mjs').then(m => { dataSourceRegistryModule = m; }).catch(e => console.warn('[map] eden-map: data-source-registry import failed', e));   // 数据源注册表（arch-v2 §6 第 8 步）
  // 线路 / 版本识别：host-routes.mjs
  const { PKG, PKGS, LINES, LINE_KEY, swappable, VER, tagOf, plainVer, baseFor, LINE_TTL, LINE_AT, race, measure, deadLines } = createRoutes({ scriptBase, PACK_IN, manifest: MAN, fetchJSON: u => cdnFetch(u).then(r => (r.ok ? r.json() : null)), line: () => line });
  let line = null; try { line = (LS || localStorage).getItem(LINE_KEY); } catch (e) { /* storage unavailable (private mode / quota): keep the default */ }
  if (!LINES.some(l => l.key === line)) line = null;
  let BASE = baseFor(line);
  const pdoc = window.parent.document;
  const ID = 'eden-map-root';
  // 自检用（E6）：旧版脚本（v0.6.1）用同一个 id 但没有清理钩子；本页加载过哪些地图脚本地址；是不是「更新到新版本」切过来的
  const oldStyle = !!pdoc.getElementById('eden-map-root') && !window.parent.__edenMapCleanup;
  const switchedFrom = window.parent.__edenMapSwitch || null;
  // 地基 A3：多实例身份用 getScriptId()（同一脚本换版本 / 重载 id 不变，不再误报「另一个地图脚本」）；没有这个接口时退回脚本地址。登记在 __edenMapIds { 身份: 地址 }
  const scriptOwner = (() => { try { const id = thFn('getScriptId')?.(); if (typeof id === 'string' && id) return 's:' + id; } catch (e) {} return 'u:' + scriptBase; })();
  try { (window.parent.__edenMapIds ||= {})[scriptOwner] = scriptBase; } catch (e) { /* host page not reachable: nothing to do */ }
  // 地基 A4：偏好存脚本变量（host-tavernhelper.mjs createPrefs；键表 = core/storage.mjs SCRIPT_KEYS）
  const prefs = createPrefs(LS), prefSync = prefs.sync, onStorage = prefs.onStorage;
  { const pl = prefs.obj()?.edenMapLine; if (pl && pl !== line && LINES.some(l => l.key === pl)) { line = pl; BASE = baseFor(line); } }   // 线路在上面已按本机读过：脚本变量优先
  window.addEventListener('storage', onStorage);
  takeOver(pdoc, ID, scriptOwner);   // 幂等：先清掉上一份（host-lifecycle.mjs）

  const root = mount(pdoc, ID, scriptOwner);   // 悬浮按钮 + 面板（样式与结构在 host-lifecycle.mjs）

  const fab = root.querySelector('.em-fab'), panel = root.querySelector('.em-panel'), frame = root.querySelector('.em-frame');
  const hereEl = root.querySelector('.em-here'), loadEl = root.querySelector('.em-load'), titleEl = root.querySelector('.em-title');
  const pickEl = root.querySelector('.em-pick'), lineBtn = root.querySelector('.em-line'), clockEl = root.querySelector('.em-clock');
  lineBtn.hidden = !swappable;
  // 标题栏跟着地图的语言与深浅主题（地图在 srcdoc 里，与酒馆页同源，设置存在同一个 localStorage；切换时地图发 eden-map:state {lang, theme}）
  const UI = { zh: { title: '新历 2088', clock: '世界时间', map: '地图', here: '当前地点：', line: '线路：', unset: '未选', close: '关闭', load: '加载地图 {p}%', open: '打开世界地图', fab: '世界地图', unm: '未上图：', unm_tip: '点这里把它放到地图上', pend: '等待本楼变量更新', stale: '本楼没有变量快照，显示的是上一楼的', probe: '测速中…', dead: '连不上', toosmall: '响应过小（未计分）', rec: '推荐', dropped: '有线路连不上，已自动换到「{p}」', allDown: '三条线路都连不上，稍后重试，或点标题栏的「⇄」手动选一条', stall: '地图程序没启动，正在重试…', hop: '这条线路没响应，正在换一条…' },
    en: { title: 'NC 2088', clock: 'World time', map: 'Map', here: 'Location: ', line: 'Route: ', unset: 'not set', close: 'Close', load: 'Loading map {p}%', open: 'Open world map', fab: 'World map', unm: 'Not on map: ', unm_tip: 'Tap to place it on the map', pend: 'waiting for this reply\'s variable update', stale: 'no variable snapshot on this reply; showing the previous one', probe: 'Measuring…', dead: 'unreachable', toosmall: 'response too small to score', rec: 'Recommended', dropped: 'some routes are unreachable; switched to "{p}"', allDown: 'All three routes are unreachable. Try again later, or tap "⇄" in the title bar to pick one', stall: 'The map did not start, retrying…', hop: 'This route did not answer, switching…' } };
  let uiLang = 'zh', mapTitle = ''; try { uiLang = (LS || localStorage).getItem('edenMapLang') === 'en' ? 'en' : 'zh'; } catch (e) { /* storage unavailable (private mode / quota): keep the default */ }
  const U = k => UI[uiLang][k];
  // 深 / 浅主题挂在根元素上（面板、自检提示一起换）；地图没开着时系统切换深浅也跟上（v0.9.5）
  const themeMq = window.parent.matchMedia?.('(prefers-color-scheme: light)');
  const hostTheme = th => root.classList.toggle('em-light', th === 'light' || (th === 'auto' && !!themeMq?.matches));
  const storedTheme = () => { try { return (LS || localStorage).getItem('edenMapTheme') || 'auto'; } catch (e) { return 'auto'; } };
  hostTheme(storedTheme());
  const onThemeMq = () => { if (storedTheme() === 'auto') hostTheme('auto'); };
  themeMq?.addEventListener?.('change', onThemeMq);
  // v0.9.6：线路按钮只写短名（「有梯子」/「Global」），完整说明放 title；以前「线路：没梯子」在手机上截成「线路：…」、英文「Route: C…」
  const showLine = () => { const l = LINES.find(x => x.key === line), full = l ? (uiLang === 'en' && l.name_en) || l.name : U('unset');
    lineBtn.textContent = '⇄ ' + (l ? (uiLang === 'en' ? l.short_en || l.name_en : l.name) : U('unset')); lineBtn.title = U('line') + full; lineBtn.setAttribute('aria-label', U('line') + full); };
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
  function chooseLine(key, auto) {   // auto：查看器报告瓦片全部失败后自动换线（N13）——不记「手动」，下次照常测速
    const changed = key !== line; line = key; try { (LS || localStorage).setItem(LINE_KEY, key); if (!auto) (LS || localStorage).setItem(LINE_KEY + 'Manual', '1'); } catch (e) { /* storage unavailable (private mode / quota): keep the default */ } prefSync();
    showLine(); pickEl.hidden = true;
    if (changed) { BASE = baseFor(key); html = null; unloadViewer(); }
    loadViewer();
  }
  lineBtn.addEventListener('click', showPicker);

  async function autoLine(force = false) {
    if (!swappable) return true;
    let manual = false, at = 0; try { manual = (LS || localStorage).getItem(LINE_KEY + 'Manual') === '1'; at = +(LS || localStorage).getItem(LINE_AT) || 0; } catch (e) { /* storage unavailable (private mode / quota): keep the default */ }
    if (manual && line) return true;
    if (!force && line && Date.now() - at < LINE_TTL) return true;   // 24 小时内测过：直接用
    const key = await race(line);   // 把当前线路传进去：没快 30% 以上就不换（见 host-routes.PROBE_MARGIN）
    if (!key) { hostToast(U('allDown'), [], 9000, null, false, { key: 'linedown' }); fab.classList.add('fail'); fab.title = U('allDown'); if (panel.hidden) fab.click(); return false; }   // 三条都连不上：说能做什么的话（重试 / 手动选），并把面板打开
    try { (LS || localStorage).setItem(LINE_AT, String(Date.now())); } catch (e) { /* storage unavailable */ } if (deadLines().length) hostToast(U('dropped').replace('{p}', LINES.find(l => l.key === key)?.name || U('unset')), [], 6000, null, false, { key: 'linedrop' });   // 有线路连不上：给用户一句人话（DIST-2 / COPY-1）
    if (key !== line) { line = key; BASE = baseFor(key); html = null; try { (LS || localStorage).setItem(LINE_KEY, key); } catch (e) { /* storage unavailable (private mode / quota): keep the default */ } prefSync(); showLine(); }
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
      // 省流预热清单（通用化 v1：按包取；数据文件 = 清单 preload 列，第一个包也一样）
      const pb = PACK_ID === 'eden' ? '' : 'packs/' + PACK_ID + '/', pf = (await MAN)?.preload || [];
      try { await fetchHtml(); await Promise.all([...(PACK_IN?.manifest ? [] : ['packs/' + PACK_ID + '/manifest.json']), ...pf.map(p => pb + p)].map(u => cdnFetch(BASE + u).catch(() => null)));
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
  let html = null, here = '', alive = false, sent = null, killT = 0, unm = null, docNow = '';   // unm（v0.9.6）：地图说当前地点「未上图」时的名字
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
    const pkgs = await PKGS.table(), art = artBase(BASE, (() => { try { return (window.__edenMapScript || window.parent.__edenMapScript || {}).art; } catch (e) { return ''; } })());
    return t.replace('<head>', `<head><base href="${BASE}"><script>${PKGS.src(pkgs, art)}</script>` + (PACK_IN ? `<script>window.__tcPack=${JSON.stringify(PACK_IN).replace(/</g, '\\u003c')}</script>` : ''));
  })().catch(e => { html = null; throw e; });
  // 生成状态（GEN）：GENERATION_STARTED 置位，ENDED / STOPPED 清零，180 s 超时自动清（断网 / 被杀后 ENDED 永远不来）。
  // 必须在下面 afterGen 之前声明：typeof 也躲不开 TDZ——const 还没初始化时读它照样抛 ReferenceError，而 afterGen 开局就被调。
  const GEN = { since: 0, get generating() { return !!this.since && Date.now() - this.since < 180000; } };
  // 地基 A5：空闲预取在生成期间暂停（聊天首屏与流式输出优先），GENERATION_ENDED / STOPPED 后再补做
  const idleQ = [];
  const afterGen = f => { if (GEN.generating) idleQ.push(f); else f(); };
  const flushIdle = () => { for (const f of idleQ.splice(0)) { try { if (!life.dead) f(); } catch (e) {} } };
  if (line || !swappable) (window.parent.requestIdleCallback || (f => setTimeout(f, 2000)))(() => afterGen(() => fetchHtml().catch(e => console.warn('[map] eden-map: html prefetch failed', e))));
  // 每次真正打开地图（不是后台幽灵预加载）查一次更新：提示等面板关上再弹。通读 R1 / R2：打开面板时重读一次（开局切换、状态栏改变量可能没发事件）
  function scheduleAutoCheck() { if (typeof autoCheck === 'function') setTimeout(() => { if (!life.dead) { autoCheck().catch(e => console.warn('[map] eden-map: auto update check failed', e)); followCheck().catch(e => console.warn('[map] eden-map: follow check failed', e)); } }, 3000); }
  // 打开：休眠中的地图直接唤醒；否则创建。关闭：先休眠（地图关掉底图、释放瓦片内存，脚本和数据留着），超时再销毁
  async function loadViewer() {
    clearTimeout(killT); if (typeof recomputeSoon === 'function') { recomputeSoon(0); pushSoon(0); }
    if (!ghost) scheduleAutoCheck();   // ghost（后台预加载）时跳过：真正打开时（fab 点开）补一次，见 fab click 里的 ghost 分支
    if (swappable && !line) return showPicker();   // 还没选线路：先选
    if (alive) { post({ type: 'eden-map:wake', fly: flyQ }); flyQ = null; sent = null; push(); sendEvents(); return; }   // fly：EdenMap.flyTo 唤醒面板时直接飞过去，不先回上次的图
    startProg(); htmlProg = f => setProg(f * 20);
    let doc;
    try { doc = await fetchHtml(); setProg(20); }
    catch (e) { try { (LS || localStorage).removeItem(LINE_AT); } catch (x) { /* storage unavailable (private mode / quota): keep the default */ } autoLine(true).catch(e => console.warn('[map] eden-map: line re-probe failed', e));   // 这条线路失败：下次重测（v0.9.5）
      hintEl.textContent = '地图程序下载失败，可以重试或换一条线路'; actsEl.hidden = false; clearInterval(watchT); if (ghost) endGhost(false); return; }
    finally { htmlProg = null; }
    if (panel.hidden) return;   // 取页面期间面板又被关了
    docNow = doc; mountFrame();
  }
  function mountFrame() { frame.onload = () => { BW.saw(); setHostToken(); push(); }; setHostToken(); frame.srcdoc = docNow; BW.arm(); }   // arm：挂上就开始计时，查看器第一条消息到达就停（F-TT：子资源卡住时自己重挂）
  function unloadViewer() { BW.stop(); alive = false; frame.onload = null; frame.removeAttribute('srcdoc'); frame.src = 'about:blank'; mapTitle = ''; showTitle(); }
  // 宿主令牌（2026-09-27 接手 review P1）：查看器只认带这个令牌的消息。脚本跑在卡片 iframe 里、查看器挂在宿主页上时
  // 「消息来源窗口」并不是查看器的 parent，所以只比对 e.source 会把真宿主也挡掉；令牌写在查看器窗口上，只有能碰到这个窗口的脚本才拿得到。
  const HOST_TOKEN = 'ek' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const setHostToken = () => { try { const w = frame.contentWindow; if (w) w.__edenHostToken = HOST_TOKEN; } catch (e) {} };
  function sleepViewer() {
    if (!alive) return unloadViewer();
    post({ type: 'eden-map:sleep' }); clearTimeout(killT); killT = setTimeout(unloadViewer, SLEEP_MS);
  }
  const post = msg => { if (!life.dead) { setHostToken(); frame.contentWindow?.postMessage({ ...msg, v: PROTO, t: HOST_TOKEN }, '*'); } }; const resendVisible = watchVisible(panel, frame, on => post({ type: 'eden-map:visible', on }));   // srcdoc 换页后属性会丢，每次发消息前补一次；S7-2：面板开关 / 滚出视口告诉查看器
  const BW = createBootWatchdog({ base: () => BASE, onStall: (n, next) => { if (n) { hintEl.textContent = next ? U('hop') : U('stall'); actsEl.hidden = false; } }, onMount: b => { if (b && b !== BASE) { BASE = b; html = null; } unloadViewer(); loadViewer(); } }); life.add(BW.stop);   // F-TT（tavern/viewer-boot.mjs）：查看器挂上之后一直没有启动消息 = 有子资源永远没取回 → 同一个域名重挂，再逐个换镜像域名重挂
  let flyQ = null, tileSwitchAt = 0;   // EdenMap.flyTo 在地图就绪前调用时排队；tileSwitchAt：上次自动换线的时间（N13）
  // 地图 → 酒馆：ready 撤掉遮罩；state 更新面板标题。只接受来自本面板 iframe 的消息
  const onMsg = e => {
    if (e.source !== frame.contentWindow || (protocolModule && !protocolModule.accept(e.data, '（查看器 → 宿主）'))) return;
    if (e.data?.type === 'eden-map:boot') { BW.saw(); setProg(20 + e.data.pct * 30); }
    if (e.data?.type === 'eden-map:ready') { post({ type: 'eden-map:lang', lang: uiLang }); resendVisible(); sendBar(); sendAbout(); sendCardInfo(); alive = true; CF.sentClock = CF.sentOutfit = charsSent = null; CF.resetLayerSent(); LL.sendOps(true); RF.onReady(); HA.replayLayers(); knowRooms(); sendCheck(); sendCustom(); sendInv(); sendTrips(); sendRoutine(); sendTh(); mvuBridge.varSig = ''; refreshVarMap(); setProg(50); loadEl.classList.add('over'); sent = null; push(); sendEvents(); if (panel.hidden) sleepViewer(); }
    if (e.data?.type === 'eden-map:ready' && CK.setQ) { const q = CK.setQ; CK.setQ = null; setTimeout(() => post({ type: 'eden-map:settings', page: q }), 0); }
    if (e.data?.type === 'eden-map:ready' && flyQ) { const q = flyQ; flyQ = null; setTimeout(() => inner()?.flyTo?.(q), 0); }   // EdenMap.flyTo 排队的
    if (e.data?.type === 'eden-map:progress' && !loadEl.hidden) setProg(50 + e.data.pct / 2);
    if (e.data?.type === 'eden-map:loaded') { endProg(); if (ghost) endGhost(true); }
    if (e.data?.type === 'eden-map:state') {
      if (e.data.lang && e.data.lang !== uiLang && UI[e.data.lang]) { uiLang = e.data.lang; try { (LS || localStorage).setItem('edenMapLang', uiLang); } catch (x) { /* storage unavailable (private mode / quota): keep the default */ } prefSync(); showLine(); push(); }   // 地图里切了语言：标题栏跟着换并记下（两边只有一个设置）
      if (e.data.theme) hostTheme(e.data.theme);
      if (e.data.hand && e.data.hand !== handPref) { handPref = e.data.hand; applyHand(true); }
      mapTitle = e.data.title || ''; showTitle(); }
    if (e.data?.type === 'eden-map:esc') { if (e.data.from === 'key' && !TL.tlEl.hidden) TL.tlExit(); else close(); }   // 地图里没有可关的卡片 / 列表时 Esc 先关回放条（宿主自己的一层，X-01），再关面板；× 按钮直接关
    if (e.data?.type === 'eden-map:line-pick') showPicker(); if (e.data?.type === 'eden-map:tiles-failed') { const k = nextRoute({ lines: LINES, current: line, swappable, lastAt: tileSwitchAt }); post({ type: 'eden-map:tiles-route', switched: !!k, line: k || undefined }); if (k) { tileSwitchAt = Date.now(); setTimeout(() => chooseLine(k, true), 400); } }   // N13：瓦片全挂 → 自动换到另一条线路一次（之后再失败才由查看器提示）
    if (e.data?.type === 'eden-map:chat-reset') RS.resetChat(); if (e.data?.type === 'eden-map:storage-info' || e.data?.type === 'eden-map:storage-clean') {   // 设置「数据与映射」：存储占用、数据来源；清理 = 只留最近 5 个聊天的地图数据
      (async () => { let cleaned = null; const st = store();
        if (e.data.type === 'eden-map:storage-clean' && RS.storageBudget && st && Date.now() - (window.__edenCleanAt || 0) > 10000) { window.__edenCleanAt = Date.now();   // 只认本面板 iframe（onMsg 的 e.source 检查）；10 秒内只清一次
          try { cleaned = RS.storageBudget.sweep(st, chatId(), 5); } catch (x) { console.warn('[eden-map] 清理失败', x); cleaned = { error: true, dropped: [], freed: 0 }; } }
        else if (e.data.type === 'eden-map:storage-clean') cleaned = { limited: true, dropped: [], freed: 0, wait: Math.max(1, Math.ceil((10000 - (Date.now() - (window.__edenCleanAt || 0))) / 1000)) };   // 10 秒内再点：明确回「请稍后再试」，不再无声无息
        const [s, src] = await Promise.all([api.storage().catch(() => null), api.sources().catch(() => null)]);
        let cleanable = null; try { if (RS.storageBudget && st) { const c = chatId(); cleanable = Math.max(0, RS.storageBudget.chatsByAge(st, c).length + (c ? 1 : 0) - 5); } } catch (x) {}   // 与 sweep 同一算法，确认文案里的数字 = 实际会清的个数
        post({ type: 'eden-map:storage-result', cleanable, storage: s && { total: s.total, ours: s.ours, avatars: s.avatars, chats: Object.keys(s.chats || {}).length }, sources: src, cleaned: cleaned && { n: cleaned.dropped.length, bytes: cleaned.freed, error: !!cleaned.error, limited: !!cleaned.limited, wait: cleaned.wait || 0 } }); })(); }   // UI v2：线路选择在地图设置「高级」
    if (e.data?.type === 'eden-map:chrome') { chromeAt = { top: +e.data.top || 44, bottom: +e.data.bottom || 0 }; NT?.refresh(); }   // 抽屉高度：P2 提示放在它上方
    if (e.data?.type === 'eden-map:formbusy') { formBusy = !!e.data.on; NT?.refresh(); }
    if (e.data?.type === 'eden-map:notice' && e.data.n && typeof e.data.n === 'object') viewerNotice(e.data.n);   // 查看器的通知由宿主统一显示
    if (e.data?.type === 'eden-map:unmapped') { const n = typeof e.data.name === 'string' && e.data.name ? e.data.name : null; if (n !== unm) { unm = n; push(); } }   // v0.9.6：地图认不出当前地点 → 标题栏「未上图：…」
    if (e.data?.type === 'eden-map:emit' && e.data.ev === 'map') emit('map', e.data.data);   // 本机扩展：切图（E6）
    if (e.data?.type === 'eden-map:build') { CK.viewerVer = e.data.version || null; if (CK.checkFacts) finishCheck(); }   // 地图的版本（data/build.json）→ 自检比对
    if (e.data?.type === 'eden-map:update-now') switchVersion();   // 自检里点了「本次切换到新版本」
    if (e.data?.type === 'eden-map:switch-branch' && typeof e.data.branch === 'string') switchBranch(e.data.branch);   // 设置「更新与版本」→ 版本分支切换（main / preview）
    // v0.9.3 自定义（地图设置里的「自定义」一栏）：地图只发请求，数据由这里写进聊天变量后再推回去
    if (e.data?.type === 'eden-map:custom-set') api.setCustom(e.data.key, e.data.patch || {});
    if (e.data?.type === 'eden-map:custom-reset') api.removeCustom(e.data.key); else if (e.data?.type === 'eden-map:place-edit') RS.placeEdit(e.data.id, e.data.patch); else if (e.data?.type === 'eden-map:place-undo') RS.placeUndo(e.data.id);   // PLACE-1a: the record editor
    if (e.data?.type === 'eden-map:route-plan') RF.onPlan(e.data);   // K-R111: the user's route plan (re-checked, held, echoed)
    if (e.data?.type === 'eden-map:explore' && explorationLedgerModule && RS.custom && !(e.data.chat && e.data.chat !== chatId())) { const r = explorationLedgerModule.visit(explored, e.data.map, e.data.name); if (r.changed) { explored = r.ex; saveRoot(); } }   // 迷雾探索：只在查看器开着迷雾时才发，丢掉换聊天瞬间还带着上一个聊天地点的到访
    if (e.data?.type === 'eden-map:explore-reset' && RS.custom) { explored = {}; saveRoot(); post({ type: 'eden-map:fog', explored }); }
    if (e.data?.type === 'eden-map:custom-sync') api.setWorldbookSync(!!e.data.on);
    if (e.data?.type === 'eden-map:splash') showSplash();   // 设置「重新显示开场自检」
    if (e.data?.type === 'eden-map:varmap-set') setVarUser(e.data.user);   // v0.9.5 设置「变量映射」
    if (e.data?.type === 'eden-map:compose' && typeof e.data.text === 'string') composeIn(e.data.text, e.data.ooc);   // v0.9.6 地图 → 聊天：只填不发
    if (e.data?.type === 'eden-map:action') injectAction(e.data);   // Part 6-4：点 POI → 注入动作（默认关，见 tavern/place-action-injection.mjs）
    if (e.data?.type === 'eden-map:loot') takeLoot(e.data);   // Part 5-1：点了地上的发光拾取物 → 先写背包，再按设置注入一句; if (e.data?.type === 'eden-map:hide') RS.onHide(e.data);   // DRAWER-1: hide an event / mark an item as not an item (stored in the chat variable)
    if (e.data?.type === 'eden-map:stealth') stealthCheck(e.data);   // Part 5-2：这次移动穿过了谁的视野 → 按难度注入一句检定
    if ((e.data?.type === 'eden-map:th' && typeof e.data.op === 'string') || e.data?.type === 'eden-map:pack-pick') onTh(e.data).catch(x => console.warn('[eden-map] 酒馆助手设置', x));   // 设置「数据与映射」「高级」：注入 / 类宏 / 世界书同步
    if (e.data?.type === 'eden-map:check-update') (updateChannel({ channel: channel(), ref: SCRIPT.ref || AB.refOf() }) === 'follow' && (SCRIPT.ref || AB.refOf()) ? followUpdate() : checkUpdate()).then(r => post({ type: 'eden-map:update-result', ...r }));   // v0.9.6「检查更新」
  };
  window.parent.addEventListener('message', onMsg);
  // 合并顶栏：宿主栏的宽度告诉查看器，查看器顶栏右端让出这一段；线路按钮移进查看器设置「高级」
  const hbarEl = root.querySelector(".em-bar");
  const sendBar = () => { post({ type: 'eden-map:hostbar', w: Math.ceil(hbarEl.getBoundingClientRect().width), side: panel.classList.contains('em-left') ? 'left' : 'right' }); post(lineMsg()); };
  // fix3：设置「高级 · 加载线路」显示当前线路，以及是自动测速选的还是手动选的
  function lineMsg() { let manual = false; try { manual = (LS || localStorage).getItem(LINE_KEY + 'Manual') === '1'; } catch (e) { /* storage unavailable (private mode / quota): keep the default */ } const l = LINES.find(x => x.key === line);
    return { type: 'eden-map:line', swappable, name: l ? (uiLang === 'en' && l.name_en) || l.name : '', manual }; }
  let barRO = null; try { barRO = new ResizeObserver(() => { if (alive && !life.dead) sendBar(); }); barRO.observe(hbarEl); } catch (e) {}
  // ---------------- UI v2 唯一通知层（ui/notice.mjs，spec §3）：P0 强制更新 / P1 更新、自检、存储 / P2 新事态、查看器转来的提示 ----------------
  let NT = null, chromeAt = { top: 44, bottom: 0 }, formBusy = false;
  const ntReady = import(scriptBase + 'ui/notice.mjs').then(m => {
    NT = m.createNotices({ doc: pdoc, mount: root, root: '#' + ID, baseCls: 'em-ctoast', en: uiLang === 'en', busy: () => formBusy && !panel.hidden, inertEls: () => [frame, hbarEl],
      anchor: () => { if (panel.hidden || ghost) return null; const r = panel.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, top0: chromeAt.top, bottom0: chromeAt.bottom, modal: true }; } });
    return NT; }).catch(e => { console.warn('[eden-map] 通知层加载失败', e); return null; });
  // 查看器发来的通知（嵌入时它不自己画）：按钮点了回传 eden-map:notice-act
  function viewerNotice(n) {
    const lv = [0, 1, 2].includes(n.level) ? n.level : 2, key = 'vw:' + String(n.key || Date.now()).slice(0, 60);
    const push = () => NT?.push({ key, level: lv, title: String(n.title || ''), lines: (Array.isArray(n.lines) ? n.lines : []).map(String).slice(0, 6),
      actions: (Array.isArray(n.actions) ? n.actions : []).slice(0, 3).map(a => ({ label: String(a.label || ''), primary: !!a.primary, run: () => post({ type: 'eden-map:notice-act', key: n.key, id: a.id }) })) });
    NT ? push() : ntReady.then(push);
  }
  // v0.9.6 地图 → 聊天（tavern/compose-templates.mjs）：卡片上「去这里」「追问这件事」的句子填进酒馆输入框；从不调用发送
  // ---------------- 任务三 泄露防御网（tavern/tavernhelper-api.mjs createLeakFence）：只清显示，不动聊天记录 ----------------
  // 卡片没消费掉的占位符 / 模型整段吐出来的状态栏 HTML 源码会糊在聊天界面上。这里在**渲染之后**把那一楼
  // 元素里的泄露节点与泄露文本洗掉——纯净化函数在 sanitize.mjs（stripLeaks / hasLeak，纯字符串进出），
  // 本模块只负责取元素。**聊天记录一个字节都不动**（docs/rejected.md #8：不审核、不过滤用户聊天内容）。
  let LKF = null;   // 在下面的 thReady 里装配（tavernhelper-api.mjs 只加载一次）
  const leakSweep = id => { try { return LKF ? LKF.sweep(id) : 0; } catch (e) { return 0; } };

  let composeTemplatesModule = null;
  async function composeIn(text, ooc) {
    try { composeTemplatesModule ??= await import(scriptBase + 'tavern/compose-templates.mjs'); } catch (e) { return; }
    const how = composeTemplatesModule.insert(window.parent, text, typeof triggerSlash === 'function' ? triggerSlash : null);
    post({ type: 'eden-map:compose-done', ok: !!how, how, ooc: !!ooc }); HA.facts.inject = { ...HA.facts.inject, lastOk: !!how, floor: floorNow };   // health: the host input was (not) found
  }
  // ---------------- Part 6-2 后台静默推演 ----------------
  // 面板关着时，隔一阵把新楼层以只读方式扫一遍（补齐事态 / 人物 / 行程的缓存），玩家再开地图就是热的。
  // 三条底线：只读（不写变量、不注入、不发消息给查看器）；面板活着或正在生成一律让路；每次只扫增量且封顶 60 楼。
  // 调度判定纯函数在 tavern/background-scan-scheduler.mjs（node 单测覆盖），这里只做取数与记账。
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
        contextPipeline.readMsgs(list, floorNow);   // 只读：只喂缓存，不 recompute、不发消息、不写变量
      }
    } catch (e) {}
    tickLed = TICK.ledger(tickLed, { now: Date.now(), floorNow, ms: performance.now() - t0, n: win.n });
    perf('tick', performance.now() - t0);
    return 'ran';
  }
  async function startTick() {
    try { TICK ??= await import(scriptBase + 'tavern/background-scan-scheduler.mjs'); } catch (e) { TICK = null; return; }
    clearInterval(tickT);
    tickT = setInterval(() => { tickOnce().catch(() => {}); }, 15000);   // 心跳 15 s，跑不跑由 plan() 决定
  }

  // 依赖袋（S5-1）：拆出去的 flow 模块经它取宿主的变量 / 函数；活的变量是取存器，函数是晚绑定转发（模块先于定义被创建时也不会撞暂时性死区）
  let chatSwitched = () => {}; const host = { entryUrl: import.meta.url, autoCache: null, onChatSwitch: () => chatSwitched(),
    get alive() { return alive; }, get BASE() { return BASE; }, get storageBudget() { return RS.storageBudget; }, get mvuBridge() { return CF.mvuBridge; }, buildNow: (...a) => buildNow(...a),
    get cardId() { return HA.cardId; }, set cardId(v) { HA.cardId = v; }, cardKey: (...a) => CF.cardKey(...a), changedInv: (...a) => LF.changedInv(...a),
    channel: (...a) => channel(...a), get chars() { return chars; }, chatId: (...a) => CF.chatId(...a), get checkAt() { return CK.checkAt; },
    get checkItems() { return CK.checkItems; }, get checkP() { return CK.checkP; }, set checkP(v) { CK.checkP = v; }, checkpointResume: (...a) => MO.checkpointResume(...a),
    checkUpdate: (...a) => checkUpdate(...a), get CHM() { return CHM; }, get clock() { return CF.clock; }, get clockEl() { return clockEl; },
    composeIn: (...a) => composeIn(...a), conflictsNow: (...a) => MO.conflictsNow(...a), get cp() { return MO.cp; }, set cp(v) { MO.cp = v; },
    get cpResume() { return MO.cpResume; }, get contextPipeline() { return CF.contextPipeline; }, get custom() { return RS.custom; }, set custom(v) { RS.custom = v; },
    customChanged: (...a) => RS.customChanged(...a), get customChat() { return RS.customChat; }, get custVer() { return custVer; }, set custVer(v) { custVer = v; },
    emit: (...a) => HA.emit(...a), endGhost: (...a) => endGhost(...a), get events() { return events; },
    get explored() { return explored; }, set explored(v) { explored = v; }, eventsSummary: () => (EVM ? EVM.summarize(events, EVM.layerOf(getHere())) : ''), get fab() { return fab; }, fallbackToast: (...a) => fallbackToast(...a),
    fetchHtml: (...a) => fetchHtml(...a), get floorNow() { return floorNow; }, get flyQ() { return flyQ; }, set flyQ(v) { flyQ = v; }, get explorationLedgerModule() { return explorationLedgerModule; },
    get frame() { return frame; }, get FRm() { return LF.FRm; }, get frState() { return LF.frState; }, get GEN() { return GEN; }, get ghost() { return ghost; },
    get here() { return here; }, hostToast: (...a) => CK.hostToast(...a), HS: (...a) => HS(...a), get html() { return html; }, get ID() { return ID; },
    get stash() { return LF.stash; }, set stash(v) { LF.stash = v; }, get ledgerRecord() { return LF.ledgerRecord; }, set ledgerRecord(v) { LF.ledgerRecord = v; }, get stashStoreModule() { return LF.stashStoreModule; }, get keyframesModule() { return TL.keyframesModule; }, kfReset: (...a) => TL.kfReset(...a),
    get kfView() { return TL.kfView; }, set kfView(v) { TL.kfView = v; }, kindOf: (...a) => RS.kindOf(...a), lean: (...a) => lean(...a), placeKeyOf: (...a) => RS.placeKeyOf(...a),
    get life() { return life; }, get line() { return line; }, get lineP() { return lineP; }, get LINES() { return LINES; }, get listen() { return listen; },
    get LKF() { return LKF; }, set LKF(v) { LKF = v; }, loadCustom: (...a) => RS.loadCustom(...a), loadViewer: (...a) => loadViewer(...a), get LS() { return LS; },
    get lsGet() { return lsGet; }, get lsSet() { return lsSet; }, macroSet: (...a) => RF.macroSet(...a), get MAN() { return MAN; }, get mvuReaders() { return CF.mvuReaders; },
    mvuStat: (...a) => CF.mvuStat(...a), get NT() { return NT; }, get ntReady() { return ntReady; }, get oldStyle() { return oldStyle; },
    openSettings: (...a) => CK.openSettings(...a), get outfitNow() { return CF.outfitNow; }, get scriptOwner() { return scriptOwner; }, get PACK_ID() { return PACK_ID; },
    get PACK_IN() { return PACK_IN; }, get panel() { return panel; }, get pdoc() { return pdoc; }, get plainVer() { return plainVer; },
    pointsFor: (...a) => MO.pointsFor(...a), post: (...a) => post(...a), get prefSync() { return prefSync; }, preload: (...a) => preload(...a), get preP() { return preP; },
    push: (...a) => push(...a), pushSoon: (...a) => pushSoon(...a), readVars: (...a) => CF.readVars(...a), recomputeSoon: (...a) => recomputeSoon(...a),
    refreshVarMap: (...a) => CF.refreshVarMap(...a), refOf: (...a) => AB.refOf(...a), reg: (...a) => RS.reg(...a), get regNow() { return RS.regNow; }, get rep() { return rep; }, get REPO() { return REPO; },
    get root() { return root; }, get roster() { return roster; }, runCheck: (...a) => CK.runCheck(...a), saveRoot: (...a) => RS.saveRoot(...a),
    get SCRIPT() { return SCRIPT; }, scriptInfo: (...a) => HA.scriptInfo(...a), get scriptBase() { return scriptBase; }, sendEvents: (...a) => sendEvents(...a),
    sendTrips: (...a) => CF.sendTrips(...a), showSplash: (...a) => CK.showSplash(...a),
    get SpatialM() { return MO.SpatialM; }, get spatialNow() { return MO.spatialNow; }, get dataSourceRegistryModule() { return dataSourceRegistryModule; }, set dataSourceRegistryModule(v) { dataSourceRegistryModule = v; },
    stateInject: (...a) => MO.stateInject(...a), injectPreview: () => MO.injectPreview(), get statSig() { return statSig; }, set statSig(v) { statSig = v; }, store: (...a) => RS.store(...a),
    storeWarn: (...a) => RS.storeWarn(...a), get swappable() { return swappable; }, get switchedFrom() { return switchedFrom; }, get tavernhelperApiModule() { return HA.tavernhelperApiModule; },
    get tlWalk() { return TL.tlWalk; }, set tlWalk(v) { TL.tlWalk = v; }, get transitMod() { return HA.transitMod; }, get tripsParseModule() { return CF.tripsParseModule; }, get UI() { return UI; },
    get uiLang() { return uiLang; }, userName: (...a) => CF.userName(...a), varsOk: (...a) => RS.varsOk(...a), get VER() { return VER; }, get worldbookJitModule() { return LL.worldbookJitModule; },
    get WBSm() { return LL.WBSm; }, get wbState() { return RS.wbState; }, set wbState(v) { RS.wbState = v; }, get wrapLS() { return wrapLS; }, addRoutes: (...a) => LL.addRoutes(...a), get facts() { return HA.facts; }, navFacts: () => LL.navFacts(), navSchedule: () => LL.navSchedule(), xtalClear: () => LL.xtalClear(), macroVal: (...a) => RF.macroValue(...a), flyMark: p => '<span style="display:none" data-eden-fly="' + p.replace(/"/g, '') + '"></span>',
  };
  const LL = createLlmFlow(host), { jitRound, xtalRound } = LL, RF = createRouteFlow(host);   // K-R111: the planned route and the class macros

  // W8 世界书 → 地图（{{eden_fly}} 宏的接收半边）：最新助手楼里出现 data-eden-fly 标记就解析落点、
  // 经协议里一直登记却无发送方的 eden-map:fly 聚焦过去（app/host-messages.mjs → CustomNamesView.flyTo，2D / 主场景房间 / 三维热点通吃）。
  // 每楼只飞一次（flyFloor 水位）；落点认不出就安静放过——绝不猜。
  // 任务二：提取走 th.flyTarget——除了已展开的隐藏标记，也认没被消费的字面宏 {{eden_fly: 地点}}，
  // 且外面裹着未闭合注释 / Prism 标记 / 截断标签时照样锚得住（正则在整段原文里扫，不依赖容器闭合）。
  let flyFloor = -1;
  function flyScan() {
    if (!MO.SpatialM || life.dead || floorNow <= flyFloor) return;
    const raw = contextPipeline.msgCache.get(floorNow)?.m?.raw || '';
    if (!HA.tavernhelperApiModule?.flyTarget) return;                  // th 模块还没到：不消费水位，下一轮 recompute 再试
    const place = HA.tavernhelperApiModule.flyTarget(raw);
    if (!place) { flyFloor = floorNow; return; }   // 没标记：水位直接前进
    // 注册表 / 落点还没就绪：不消费水位，下一轮 recompute 再试（异步飞跃守卫）；认不出落点才安静放弃
    if (!RS.regNow) return;
    let loc = null;
    try { loc = MO.SpatialM.locate(RS.regNow, place); } catch (e) { return; }   // 守卫层异常同样不消费水位
    if (!loc) { flyFloor = floorNow; return; }
    flyFloor = floorNow;
    const target = loc.markerId ? { map: loc.mapId, marker: loc.markerId } : (loc.room ? { map: loc.mapId, room: loc.room } : { map: loc.mapId });
    try { post({ type: 'eden-map:fly', target }); } catch (e) {}
  }


  const LF = createStashFlow(host), { frState, gate, gateFlush, injectAction, ledgerSync, lootFacts, scanPickups, sendInv, settleCarry, stealthCheck, takeLoot } = LF;

  // ---------------- v0.9.6 版本与检查更新（P2 解耦：实现在 tavern/host-about.mjs，这里只留装配） ----------------
  // 版本信息：预览 / 正式脚本在 import 前写 window.__edenMapScript = { version, code, channel: tag | follow | ref, ref, sha }（tools/build_preview_script.py 烘进去）；
  // 没有（旧脚本、本地）时按脚本地址判定，版本号与构建号取当前线路的 data/build.json。
  const SCRIPT = (() => { try { return window.__edenMapScript || window.parent.__edenMapScript || {}; } catch (e) { return {}; } })();
  const AB = createAbout({ cdnFetch, post, base: () => BASE, REPO, scriptBase, VER, tagOf, LINES, swappable, SCRIPT,
    lineKey: () => line, lang: () => (uiLang === 'en' ? 'en' : 'zh'), followHead: () => followHead(),
    followNewer: h => followNewer(h),   // 包一层：followNewer 是下面的 const，直接传绑定会在装配时就撞 TDZ
    loadSelfcheck: async () => (CK.SC ??= await import(scriptBase + 'tavern/selfcheck.mjs')),
    loadSources: async () => (dataSourceRegistryModule ??= await import(scriptBase + 'tavern/data-source-registry.mjs')) });
  const sendAbout = () => AB.sendAbout(), checkUpdate = () => AB.checkUpdate(), followUpdate = () => AB.followUpdate();
  // 任务四：版权申明页的角色卡信息由这里（经桥的三级降级）取，推给查看器——面板不再自己摸 window.SillyTavern
  // （嵌在 iframe 里那个全局 100% 读不到，旧版于是永远报「未接入酒馆」的假错）。
  const sendCardInfo = () => { mvuBridge.cardInfo().then(card => { if (!life.dead) post({ type: 'eden-map:cardinfo', card: card || null, tried: mvuBridge.cardTried }); }).catch(() => {}); };
  const channel = () => AB.channel(), buildNow = () => AB.buildNow();   // 自检页与强制更新判断要用同一个口径
  const CF = createCharsFlow(host), { mvuBridge, contextPipeline, chatId, computeTrips, getHere, mvuStat, pushMvu, refreshVarMap, sendChars, sendRoutine, sendTrips, setVarUser, userName } = CF;
  // MVU 变量在流式输出时会连续更新：合并成一次，地点没变就不打扰地图
  function push() {
    if (life.dead) return;
    refreshVarMap();
    { const h = getHere(); if (h !== here) unm = null; here = h; }   // 地点变了：等地图重新判断是否上图
    // 一个地点胶囊：MVU 里写了多处（「A / B」）只显示第一处，全文在 title；右侧省略
    const full = userName(here), parts = full.split(/\s*[\/／|｜]\s*/).filter(Boolean);
    hereEl.innerHTML = ''; if (parts[0]) { const a = pdoc.createElement('span'); a.className = 'em-nm'; a.textContent = unm ? U('unm') + userName(unm) : HA.transitMod?.transitLabel?.(parts[0], uiLang === 'en') || CF.placeText(parts[0]) || chainText(parts[0]); hereEl.append(a); }
    hereEl.classList.toggle('em-unsure', mvuBridge.snapState !== 'ok' && mvuBridge.snapState !== 'none' && !!parts[0]);   // 未确认：显示上一份快照，灰掉 + 提示（不显示空白、不猜）
    hereEl.classList.toggle('em-unm', !!unm && !!parts[0]); if (unm && parts[0]) { hereEl.setAttribute('role', 'button'); hereEl.tabIndex = 0; } else { hereEl.removeAttribute('role'); hereEl.removeAttribute('tabindex'); }   // 途中（v0.9.5）：「A → B（途中）」
    if (parts.length > 1) { const b = pdoc.createElement('span'); b.className = 'em-more'; b.textContent = ` +${parts.length - 1}`; hereEl.append(b); } hereEl.title = full ? U('here') + full : '';
    if (full) hereEl.setAttribute('aria-label', unm ? U('unm') + userName(unm) + ' · ' + U('unm_tip') : U('here') + full); else hereEl.removeAttribute('aria-label');
    if (full && hereEl.classList.contains('em-unsure')) { const t = U(mvuBridge.snapState === 'pending' ? 'pend' : 'stale'); hereEl.title += ' · ' + t; hereEl.setAttribute('aria-label', hereEl.getAttribute('aria-label') + ' · ' + t); }
    if (here !== hereShown) { hereShown = here; hereEl.classList.remove('em-full'); }   // 地点没变就别把用户刚点开的长胶囊收回去（接手 review P2）
    fab.classList.toggle('here', !!here);
    // bg：后台预加载中（面板不可见），地图据此不自动进主场景（E4 N03）
    if (!panel.hidden && alive) post({ type: 'eden-map:chat', id: chatId() });   // 当前聊天 id：本机自定义叫法按聊天分开存（E6）
    if (!panel.hidden && alive && here !== sent) { sent = here; post({ type: 'eden-map:here', value: here, bg: ghost }); }
    if (here !== emHere) { emHere = here; emit('here', { value: here }); emitMoved(here); RF.onHere(here); }
    pushMvu(); if (root.classList.contains('em-replay')) root.dispatchEvent(new Event('em-replay-repaint'));   // a replay is on: the pill and the clock keep the replay state
  }
  let pushT = 0;
  const pushSoon = (ms = 150) => { clearTimeout(pushT); pushT = setTimeout(push, ms); };
  // 通读 R2：状态栏的删除按钮直接改 MVU（replaceMvuData），可能不发 VARIABLE_UPDATE_ENDED；面板开着时每 4 秒比一次变量的指纹，变了才重算
  const updT = setInterval(() => { if (!panel.hidden && !ghost && alive) { autoCheck().catch(e => console.warn('[map] eden-map: auto update check failed', e)); followCheck().catch(e => console.warn('[map] eden-map: follow check failed', e)); } }, 10 * 60 * 1000);   // 面板开着：每 10 分钟查一次更新
  let statSig = ''; const pollT = setInterval(() => { if (panel.hidden || !alive || pdoc.hidden) return;   // G2（P1）：后台标签页静默——隐藏时定时器已被钳制，别再 stringify 整份 stat_data 占主线程；切回前台由 wake() 无损补算
    let s = ''; try { s = JSON.stringify(mvuStat()); } catch (e) { /* unparsable value: keep the default */ }
    if (s !== statSig) { const first = !statSig; statSig = s; if (!first) { recomputeSoon(0); pushSoon(0); } } }, 4000);
  // 通读 R4：玩家启用了卡的「角色图鉴CG」时，它的面板在右下角（z 10050），我们的悬浮按钮让到它下面
  // 表格数据库插件的全屏界面（#acu-app-v2，z 9000，开关只改 style.display）打开时，悬浮按钮先藏起来，不盖住它的按钮
  let acuEl = null; const acuObs = new MutationObserver(() => cgYield());
  const cgYield = () => { root.classList.toggle('em-yield', !!pdoc.querySelector('[id^="gallery-cg-root-"], [id^="gallery-cg-lightbox-"]'));
    const a = pdoc.getElementById('acu-app-v2'); if (a !== acuEl) { acuObs.disconnect(); acuEl = a; if (a) try { acuObs.observe(a, { attributes: true, attributeFilter: ['style', 'hidden', 'class'] }); } catch (e) {} }
    root.classList.toggle('em-dbui', !!a && a.style.display !== 'none' && !a.hidden && a.childElementCount > 0); };
  const cgObs = new MutationObserver(cgYield); try { cgObs.observe(pdoc.body, { childList: true }); } catch (e) {} cgYield();

  // ---------------- 事态 ----------------
  // 聊天记录是唯一真相：每次从最近 SCAN 楼原文重算（swipe / 删楼 / 编辑后自然一致），不另存状态
  const INJECT_ID = 'eden-map-events';   // 窗口楼数（80，E6）在流水线里（contextPipeline.SCAN）：未解除的事件在窗口内一直列出（events.mjs tierOf）
  const badge = root.querySelector('.em-badge');
  let events = [], floorNow = -1, seen = -1, injected = '', EVM = null;
  // 事态模块单独加载：加载失败只是没有事态功能，地图照常可用
  import(new URL('events-parse.mjs', import.meta.url).href).then(async m => { try { m.setGeo(await (await import(new URL('event-geo-load.mjs', import.meta.url).href)).loadEventGeo({ fetchJSON: rel => cdnFetch(BASE + rel).then(r => r.ok ? r.json() : null).catch(() => null), packId: PACK_ID, manifest: await MAN, events: PACK_IN?.events, lang: uiLang })); } catch (e) { try { m.setGeo(null); } catch (x) {} console.warn('[eden-map] 事态落点的节点树没建出来：事件只列出、不上图', e); } EVM = m; recompute(); }).catch(e => console.warn('[eden-map] 事态模块加载失败', e));
  // 人物栏（v0.9.2）：人物位置标签 + MVU 人物表 → 每人最新位置；模块加载失败只是没有人物栏
  let CHM = null, chars = [], charSig = '', charsSent = null;   // charsSent：上一次发给地图的人物签名（没变就不重发）
  import(new URL('characters-parse.mjs', import.meta.url).href).then(m => { CHM = m; recompute(); }).catch(e => console.warn('[eden-map] 人物模块加载失败', e));
  const chatKey = () => 'edenMapSeen:' + chatId();
  function loadSeen() { try { seen = +(LS || localStorage).getItem(chatKey()); if (!Number.isFinite(seen)) seen = -1; } catch (e) { seen = -1; } }
  // A-3：每楼原文的解析按 (楼层, 原文) 缓存、整轮输入的签名没变就跳过——都在流水线里（tavern/context.mjs，node 单测）；
  // 发送路径（GENERATION_AFTER_COMMANDS）只做注入需要的部分，标签改名 / 行程放到空闲时补做（restNow）。
  let restDue = false, restT = 0, custVer = 0;   // 调度状态：空闲补做与自定义版本号（轮次签名的输入）
  const perf = (k, ms) => { const P = window.parent.__perfSamples; if (P) (P[k] ||= []).push(ms); };
  function readMsgs() {
    let list = null;
    try { floorNow = getLastMessageId(); if (floorNow >= 0) list = getChatMessages(`${Math.max(0, floorNow - contextPipeline.SCAN)}-${floorNow}`, { role: 'assistant' }); } catch (e) { floorNow = -1; }
    const out = contextPipeline.readMsgs(list, floorNow); CF.oocRead(out, floorNow); return out;   // D32: the player's OOC map corrections (user floors) are read with the window
  }
  function recompute(lite = false) {
    if (!EVM || life.dead) return;
    const t0 = performance.now();
    const { summarize, layerOf } = EVM;
    const msgs = readMsgs(), st = mvuStat(), hereNow = getHere(); try { AP?.round(msgs, hereNow); } catch (e) { console.warn('[eden-map] automatic pack round', e); }
    let stSig = ''; try { stSig = JSON.stringify(st); } catch (e) { /* unparsable value: keep the default */ }
    // 一轮的纯计算（签名去重、事件收集、人物栏 / 名册、新事态数）在流水线里（tavern/context.mjs）；这里只做取数与副作用
    const r = contextPipeline.round({ floorNow, msgs, stSig, dbSig: mvuBridge.dbSig(), varSig: mvuBridge.varSig, custVer, customChat: RS.customChat, chatId: chatId(), seen, wbState: RS.wbState,
      hasReg: !!RS.regNow, hasCHM: !!CHM, hasMV: !!CF.mvuReaders, hasTRm: !!CF.tripsParseModule, hasHereMod: !!HA.transitMod, hereNow, collect: EVM.collect, oocChars: CF.ooc.chars, oocSig: CF.ooc.sig,
      charsDeps: CHM ? {
        mvuChars: CHM.mvuChars(st, hereNow, mvuBridge.varMap.present),
        known: mvuBridge.rosterNames({ msgs }),   // P3-B：五来源统一装配的已知名单（MVU 名册 + 聊天标签 + 数据库 + 保底 + 柏宝绘）
        dbCharacters: mvuBridge.dbCharacters(),
        collectChars: CHM.collectChars,
        rosters: CF.mvuReaders ? mvuBridge.rosters(st) : null, reputation: CF.mvuReaders ? mvuBridge.reputation(st) : null,
        presentKey: mvuBridge.varMap.present ? String(mvuBridge.varMap.present).split('.').pop() : '',
      } : null });
    if (!r.changed) { if (!lite && restDue) restNow(); gateFlush('round'); return; }
    events = r.events;
    if (r.chars) { chars = r.chars;
      // 日程漫游（Part 5-3）：聊天 / MVU 没接管的人物按世界时刻补位（不覆盖已有位置）
      if (CF.routineModule && CF.rtSched) { const minute = CF.routineModule.minuteOf(CF.clock?.time || ''); if (minute != null) for (const w of CF.routineModule.whoWhere(CF.rtSched, minute, chars.map(c => c.name))) chars.push({ name: w.name, place: w.place, floor: floorNow, src: 'routine' }); }
      if (CF.mvuReaders) { roster = r.roster; rep = r.rep; mvuBridge.stageOrderFor(roster); mvuBridge.portraitsFor(); }
      const sig = floorNow + '|' + chars.map(c => c.name + '@' + c.place + '#' + c.floor).join() + '|' + JSON.stringify(roster) + Object.keys(mvuBridge.portraits).length + rep + (mvuBridge.stageOrder || []).join();
      if (sig !== charSig) { charSig = sig; if (alive) sendChars(); emit('characters', { items: chars.map(c => ({ ...c })), floor: floorNow }); } }   // 名册无条件发：面板关着时查看器也要靠它决定人物栏显隐（兜底名册 2026-09-29）
    const fresh = r.fresh;
    badge.hidden = !fresh; badge.textContent = fresh > 9 ? '9+' : fresh;
    if (fresh) tipOnce();
    if (TL.timelineModule && floorNow >= 1) tlBtn.hidden = false;   // 有历史可回放：标题栏出现时间轴按钮（Part 5-4）
    restDue = true;
    if (!lite) restNow();   // 标签改名、行程；发送路径上推迟到空闲
    else { clearTimeout(restT); restT = setTimeout(() => (window.parent.requestIdleCallback || (f => f()))(() => { if (!life.dead && restDue) restNow(); }, { timeout: 1500 }), 0); }
    const frLine = LF.FRm ? LF.FRm.digest(frState) : '';   // W2：未注入过的失败报告追加一行（注入后置水位，不重复）
    // W11：待结算跨轮携带（上一轮没结完的域）并进同一行——不开新通道，也不新增注入 id
    const carryLine = LF.ledgerModule ? LF.ledgerModule.carryLine(settleCarry) : '';
    // W12：虚拟账本槽位声明（任务一）——本卡变量里有没有背包栏、地图账上现记几件，一并回注成已知事实
    const slotMsg = LF.ledgerModule ? LF.ledgerModule.slotLine(LF.stash?.slot) : '';
    inject([summarize(events, layerOf(hereNow)), CHM ? CHM.summarizeChars(chars, 8, 160, floorNow) : '', CF.mvuReaders && RS.custom && !(RS.custom.同步世界书 && RS.wbState === 'bound') ? CF.mvuReaders.summarizeCustom(RS.custom) : '', LF.stashStoreModule && lsGet('edenMapInvInj') !== '0' ? LF.stashStoreModule.digestLine(LF.stash, 150) : '', slotMsg, frLine, carryLine].filter(Boolean).join('\n'));
    if (frLine) LF.FRm.markInjected(frState);
    scanPickups(msgs, hereNow);   // 任务一：本轮正文里的客观获取动作先入账，下面的结算闸门放行时一并补发（漏写变量也丢不了）
    gate()?.request('sync', ledgerSync);   // W11：本轮的结算（漏项审计 + 单项补发）入队，末尾才放行——读取期间不写变量
    if (!lite) { stateInject(); spatialInject(); jitRound().catch(() => {}); xtalRound().catch(() => {}); checkpointStep(); }
    if (!panel.hidden && alive) sendEvents();
    flyScan();   // W8：最新楼里的 data-eden-fly 标记（{{eden_fly}} 宏展开）→ eden-map:fly 聚焦地图
    if (subs.events.size) { const sig = floorNow + '|' + events.map(e => e.id + ':' + e.last + ':' + e.tier).join(); if (sig !== emEvSig) { emEvSig = sig; emit('events', { items: events.map(e => ({ ...e })), floor: floorNow, hereLayer: layerOf(here) }); } }
    gateFlush('round');   // W11：本轮收尾才放行结算写入（MVU 在场时这一拍排在 VARIABLE_UPDATE_ENDED 处理器的尾部）
    perf(lite ? 'lite' : 'core', performance.now() - t0);
  }
  function restNow() { restDue = false; const t0 = performance.now(); customTags(contextPipeline.lastMsgs); computeTrips(contextPipeline.lastMsgs); perf('rest', performance.now() - t0); }
  function inject(text) {
    if (life.dead) return; HA.facts.digest = { text, floor: floorNow };   // health (feature-health.mjs): what the digest sent this round
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
    LL.opEvents = LL.opEvents.filter(e => floorNow - e.floor <= 20); LL.sendOps(); RF.onRound(floorNow);   // W5 领航员叠加事件：20 楼衰减，会话级不进真相
    const items = events.map(e => ({ ...e, isNew: e.last > seen })).concat(LL.opEvents.map(e => ({ ...e, isNew: false })));
    if (charSig !== charsSent) { charsSent = charSig; sendChars(); }
    // 人物没变就不重发：面板开着时每 4 秒重建一次覆盖层与横条（2026-09-27 接手 review P2）
    post({ type: 'eden-map:events', v: 1, floor: floorNow, hereLayer: EVM ? EVM.layerOf(here) : '', items });
    // 只有用户真的看着面板才吃掉未读水位、清角标、记 localStorage（2026-09-27 接手 review P1：
    // 以前后台预加载会把水位推到最新并持久化，角标与「打开时飞向最新未读」从此永久失效——iPhone 走省流路径不预加载，所以手机上看不出来）
    if (visible) { if (floorNow >= 0) { seen = floorNow; try { (LS || localStorage).setItem(chatKey(), String(seen)); } catch (e) { /* storage unavailable (private mode / quota): keep the default */ } } badge.hidden = true; }
  }
  let roster = null, rep = null;
  let tipShown = false; try { tipShown = !!(LS || localStorage).getItem('edenMapEvTip'); } catch (e) { /* storage unavailable (private mode / quota): keep the default */ }
  function tipOnce() {
    if (tipShown || !panel.hidden) return; tipShown = true; try { (LS || localStorage).setItem('edenMapEvTip', '1'); } catch (e) { /* storage unavailable (private mode / quota): keep the default */ }
    MAN.then(() => hostToast(HS('ev.toast', uiLang === 'en'), [], 10000, null, false, { key: 'newev', level: 2, actions: [{ label: uiLang === 'en' ? 'View' : '查看', primary: true, run: () => fab.click() }] }));   // UI v2：P2，不再挂在悬浮按钮上
  }
  let evT = 0;
  const recomputeSoon = (ms = 250) => { clearTimeout(evT); evT = setTimeout(recompute, ms); };

  const TL = createTimelineFlow(host), { tlBtn, tlCache, tlEl, tlExit } = TL;

  const HA = createHostApi(host), { api, emit, emitMoved, exposed, inner, knowRooms, onTh, sendTh, subs, wbAuto } = HA;
  let emHere = null, hereShown = null, emEvSig = '';
  const RS = createRootStore(host), { budgetSweep, customTags, loadCustom, saveRoot, sendCustom, store } = RS;  let AP = null; if (PACK_IN?.source === 'auto') import(new URL('auto-pack.mjs', import.meta.url).href).then(m => { AP = m.createAutoPack(host); recomputeSoon(0); }).catch(e => console.warn('[eden-map] automatic pack', e));   // S9-3: growth, only for the automatic pack


  const CK = createHostChecks(host), { autoCheck, finishCheck, followCheck, followHead, followNewer, hostToast, runCheck, sendCheck, showSplash, showUpdPrompt, splashDue, switchBranch, switchVersion, toastOnce } = CK;
  // 通知层模块加载失败时的兜底（强制更新等不能悄悄丢）：最简单的一张卡，文字 + 自带按钮 + ×（P0 无 ×）
  function fallbackToast(title, lines, extra, o = {}) {
    const t = pdoc.createElement('div'); t.className = 'em-ctoast'; t.setAttribute('role', o.level === 0 ? 'alertdialog' : 'status');
    t.style.cssText = 'position:fixed;left:50vw;top:12px;transform:translateX(-50%);z-index:var(--zh-top);max-width:min(420px,92vw);box-sizing:border-box;padding:10px 14px;border-radius:12px;background:var(--em-bg);color:var(--em-ink);border:1px solid var(--em-line-2);font:13px/1.5 var(--em-font)';
    const b = pdoc.createElement('b'); b.textContent = title; t.append(b); for (const l of lines || []) { const d = pdoc.createElement('div'); d.textContent = l; t.append(d); }
    if (o.level !== 0) { const x = pdoc.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', UI[uiLang].close); x.onclick = () => t.remove(); t.append(x); }
    extra?.(t); root.appendChild(t); return t;
  }

  const MO = createModesFlow(host), { MDm, checkpointStep, spatialInject, stateInject } = MO;

  let wbChatT = 0;

  // 悬浮按钮可拖动（避开酒馆输入栏等位置），位置按屏幕比例记住；轻点才打开面板
  const POS_KEY = 'edenMapFabPos';
  const placeFab = (fx, fy) => {
    const x = Math.min(Math.max(fx, 0), 1), y = Math.min(Math.max(fy, 0), 1);
    const vh = (typeof CSS === 'undefined' || CSS?.supports?.('height', '100dvh')) ? '100dvh' : '100vh';   // 老 WebView 没有 dvh，用了会让 top 失效、按钮落到聊天末尾
    fab.style.left = `calc(${x} * (100vw - 48px))`; fab.style.top = `calc(${y} * (${vh} - 48px))`;
    return [x, y];
  };
  try { const p = JSON.parse((LS || localStorage).getItem(POS_KEY)); if (p) placeFab(p[0], p[1]); } catch (e) { /* storage unavailable (private mode / quota): keep the default */ }
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
      const p = placeFab(r.left / (vw - 48), r.top / (vh - 48)); try { (LS || localStorage).setItem(POS_KEY, JSON.stringify(p)); } catch (err) { /* storage unavailable (private mode / quota): keep the default */ } prefSync(); } });

  // 单手（E7）：惯用手在地图设置里改（同源 localStorage；改了地图发 eden-map:state {hand}）
  // 惯用手选了左 / 右：悬浮按钮挪到那一侧（高度不变）并记住；自动 = 不动它（地图反过来按它在哪一半判断左右手）
  const HAND_KEY = 'edenMapHand';
  let handPref = 'auto'; try { handPref = (LS || localStorage).getItem(HAND_KEY) || 'auto'; } catch (e) { /* storage unavailable (private mode / quota): keep the default */ }
  const fabLeft = () => { const r = fab.getBoundingClientRect(); return r.left + r.width / 2 < window.parent.innerWidth / 2; };
  const applyHand = move => {
    if (move && (handPref === 'left' || handPref === 'right')) {
      const r = fab.getBoundingClientRect(), vh = window.parent.innerHeight, y = vh > 48 ? r.top / (vh - 48) : .85;
      const p = placeFab(handPref === 'left' ? .03 : .97, y); try { (LS || localStorage).setItem(POS_KEY, JSON.stringify(p)); } catch (e) { /* storage unavailable (private mode / quota): keep the default */ } prefSync();
    }
    panel.classList.toggle('em-left', handPref === 'left' || (handPref === 'auto' && fabLeft())); if (typeof sendBar === 'function' && alive) sendBar();
  };
  { let saved = null; try { saved = (LS || localStorage).getItem(POS_KEY); } catch (e) { /* storage unavailable (private mode / quota): keep the default */ }
    if (!saved && handPref === 'left') placeFab(.03, Math.max(0, (window.parent.innerHeight - 144) / Math.max(1, window.parent.innerHeight - 48))); }   // 没拖过：左手默认放左下
  applyHand(false);
  fab.addEventListener('pointerup', () => { if (dragged && handPref === 'auto') applyHand(false); });
  const close = () => { if (panel.hidden || ghost) return; panel.hidden = true; sleepViewer(); prefSync(); tlExit(); if (CK.toastWait && CK.SC) setTimeout(toastOnce, 400); if (CK.updWait) setTimeout(showUpdPrompt, 600); };
  fab.addEventListener('click', async () => { if (dragged) return;
    if (ghost) { ghost = false; clearTimeout(ghostT); panel.classList.remove('em-ghost'); fab.classList.remove('prep'); sent = null; charsSent = null; push(); sendEvents(); scheduleAutoCheck(); return; }   // 预加载中被点开：直接显示，重新推一次地点（这次可以进主场景）；loadViewer 当时因为还在 ghost 跳过了查更新，这里补一次
    fab.classList.remove('fail'); NT?.remove('newev');   // 提示不留在面板后面（v0.9.2）
    if (!panel.hidden) return close(); CK.toastEl?.remove();
    if (CK.updEl?.isConnected && CK.updEl.__upd) { CK.updPrompt = CK.updEl.__upd; CK.updWait = true; } CK.updEl?.remove();   // 更新提示也不盖在面板上：关上面板后再弹
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
    // W11 变量更新生命周期（顺序即契约）：作废快照 + 落代数 → 推送 → 重算 → 本轮末尾放行结算。
    // 地图侧的写入排在 VARIABLE_UPDATE_ENDED 收尾之后，绝不落在这个更新窗口里（tests/mvu_lifecycle.test.mjs）。
    // 第三个参数 true = 排在所有同事件处理器之后（eventMakeLast）：结算必须晚于宿主 / 卡内状态引擎的写
    try { mvuBridge.whenMvu().then(() => { const ev = mvuBridge.varUpdateEvent(); if (ev) listen(ev, () => { mvuBridge.markVarUpdate(); pushSoon(); recomputeSoon(); gateFlush('ended'); }, true); }); } catch (e) {}   // MVU 人物表也会变（人物栏）
    listen(tavern_events.CHAT_CHANGED, () => pushSoon(300));
    listen(tavern_events.CHAT_CHANGED, () => { clearTimeout(wbChatT); wbChatT = setTimeout(() => { if (!life.dead) afterGen(() => wbAuto().catch(e => console.warn('[eden-map] 世界书自动', e))); }, 1500); });   // 换角色 / 聊天：新角色也挂上、聊天版本提醒
    listen(tavern_events.MESSAGE_SWIPED, () => pushSoon(300));
    chatSwitched = () => { try { RS.storageBudget?.touch(store(), chatId()); } catch (e) {} LL.jitReset(); injected = null; MO.stateNow = ''; MO.cardSkip = null; MO.cp = null; contextPipeline.reset(); gate()?.drop('chat'); LF.resetChat(); LL.resetOps(); RF.onChat(); loadSeen(); RS.custom = null; if (TL.tlOn) { TL.tlOn = false; tlEl.hidden = true; tlBtn.classList.remove('on'); } tlCache.clear(); loadCustom().then(() => { recomputeSoon(300); sendCardInfo(); }); }; listen(tavern_events.CHAT_CHANGED, () => chatSwitched());
    // 通读 R1：开局菜单用 setChatMessage(swipe_id) 换开场白，不一定触发 SWIPED；渲染 / 编辑事件也听，地点跟着刷新
    for (const k of ['MESSAGE_RECEIVED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_DELETED', 'MESSAGE_EDITED', 'CHARACTER_MESSAGE_RENDERED']) if (tavern_events[k]) listen(tavern_events[k], () => { recomputeSoon(); pushSoon(300); });   // 新楼、改楼、重 roll、删楼：重算
    // 任务三：渲染之后再走一遍泄露防御网（占位符 / 整段状态栏 HTML 源码糊在界面上时抹掉；干净就什么都不做）
    if (tavern_events.CHARACTER_MESSAGE_RENDERED) listen(tavern_events.CHARACTER_MESSAGE_RENDERED, id => leakSweep(id));
    if (tavern_events.MESSAGE_RECEIVED) listen(tavern_events.MESSAGE_RECEIVED, id => { setTimeout(() => leakSweep(id), 0); });   // 刚到的楼：等它渲染完再洗一次
    // 生成前同步一次，注入的是最新态势（A-3：只做注入需要的部分；输入没变直接跳过；标签改名 / 行程推到空闲）
    // v0.9.9：生成状态（pending 指示）+ swipe 删除 + 切回前台（被系统挂起 / 断网恢复后事件可能丢了）→ 从聊天记录与楼层变量重新推导
    if (tavern_events.GENERATION_STARTED) listen(tavern_events.GENERATION_STARTED, (t, o, dry) => { if (!dry) { GEN.since = Date.now(); pushSoon(0); } });
    for (const k of ['GENERATION_ENDED', 'GENERATION_STOPPED']) if (tavern_events[k]) listen(tavern_events[k], () => { GEN.since = 0; setTimeout(flushIdle, 800); recomputeSoon(); pushSoon(300); });
    if (tavern_events.MESSAGE_SWIPE_DELETED) listen(tavern_events.MESSAGE_SWIPE_DELETED, () => { recomputeSoon(); pushSoon(300); });
    { const wake = () => { if (pdoc.visibilityState !== 'hidden' && !life.dead) { statSig = ''; recomputeSoon(0); pushSoon(0); post({ type: 'eden-map:wake' }); } }; pdoc.addEventListener('visibilitychange', wake); window.parent.addEventListener('pageshow', wake); window.parent.addEventListener('online', wake);   // G3（P1）：切回前台顺手叫醒查看器（唤醒消息此前只用于休眠恢复）——宿主数据推送之外，查看器也能即时自刷新
      life.add(() => { pdoc.removeEventListener('visibilitychange', wake); window.parent.removeEventListener('pageshow', wake); window.parent.removeEventListener('online', wake); }); }
    if (tavern_events.GENERATION_AFTER_COMMANDS) listen(tavern_events.GENERATION_AFTER_COMMANDS, (type) => { clearTimeout(evT); recompute(true); MO.stateNow = ''; stateInject(typeof type === 'string' ? type : 'normal'); });   // (a) 重生 / swipe：用被替换那一楼之前的状态
    push(); loadSeen(); recompute(); stateInject(); startTick();   // interaction-modes.mjs 经桥静态可用（原动态加载后补一次注入，改为启动序列里统一做）
    (window.parent.requestIdleCallback || (f => setTimeout(f, 1500)))(() => { if (life.dead) return; afterGen(() => preload().catch(e => console.warn('[map] eden-map: preload failed', e))); try { budgetSweep(); } catch (e) {} setTimeout(() => { if (!life.dead) autoCheck().catch(() => {}); }, window.parent.__autoCheckDelay ?? 6000); if (splashDue()) { lsSet('edenMapSplashSeen', String(VER || 'dev')); runCheck(); } else setTimeout(runCheck, 4000); setTimeout(() => { if (!life.dead) afterGen(() => wbAuto().catch(e => console.warn('[eden-map] 世界书自动同步失败', e))); }, 8000); });   // 打开聊天后空闲时：测速选线 + 预加载；稍后自检一次
  })();

  // 脚本被关闭或重载时清理注入的元素
  const cleanup = () => { if (life.dead) return; life.kill(); life.unlisten(); clearInterval(watchT); clearTimeout(quietT); clearInterval(pollT); clearInterval(updT); clearInterval(tickT); cgObs.disconnect(); acuObs.disconnect(); try { mvuBridge.disposeDb(); } catch (e) {} clearTimeout(killT); clearTimeout(pushT); clearTimeout(evT); clearTimeout(restT); clearTimeout(ghostT); try { inject(''); } catch (e) {} try { root.querySelector('.em-clock')?.emDispose?.(); } catch (e) { console.warn('[eden-map] clock popup teardown', e); } root.remove(); window.parent.removeEventListener('message', onMsg); themeMq?.removeEventListener?.('change', onThemeMq); pdoc.removeEventListener('keydown', onKey);
    if (window.parent.EdenMap === exposed) delete window.parent.EdenMap; CK.toastEl?.remove(); CK.updEl?.remove(); CK.splash?.el?.remove(); try { NT?.destroy(); barRO?.disconnect(); } catch (e) {}
    if (window.parent.__edenMapCleanup === cleanup) delete window.parent.__edenMapCleanup;
    try { const R = window.parent.__edenMapIds; if (R && R[scriptOwner] === scriptBase) delete R[scriptOwner]; } catch (e) { /* host page not reachable: nothing to do */ }   // 换版本 / 关掉脚本后不再算作「另一个地图脚本」
    try { for (const el of [...pdoc.querySelectorAll('[data-eden-owner]')]) if (el.getAttribute('data-eden-owner') === scriptOwner) el.remove(); } catch (e) {}
    prefs.stop(); window.removeEventListener('storage', onStorage); try { RF.macroSet(false); } catch (e) {} try { MDm?.applyState(thFn, '', 0); } catch (e) {} };   // 换版本 / 关掉脚本后不再算作「另一个地图脚本」（用户实测：换成 v0.9.3 后没刷新页面就误报）
  install(cleanup);   // __edenMapCleanup + pagehide（host-lifecycle.mjs）
})();
