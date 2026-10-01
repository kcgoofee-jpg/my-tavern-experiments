// 启动自检、开场自检卡、宿主提示、自动检查更新与版本切换（S5-1 自 eden-map.js 原样搬出）。
// 工厂风格同 host-*.mjs：createX(host) 只在入口调用一次；host 是入口给的依赖袋（活的变量 = 取 / 存器，函数 = 晚绑定转发），DEPS 是本模块要用的全部键。
import { cdnFetch, fnOk, hostFn, thFn } from './host-tavernhelper.mjs';
import { worldbookPrefix } from '../core/pack.mjs';
import { parseScriptBase, contentBase, entryUrl, updateChannel } from './follow-pin.mjs';
export const DEPS = [
  'mvuBridge', 'HS', 'ID', 'LINES', 'LS', 'MAN', 'scriptOwner', 'PACK_ID', 'REPO', 'SCRIPT', 'scriptBase', 'VER', 'buildNow', 'channel', 'checkUpdate', 'conflictsNow',
  'endGhost', 'fab', 'fallbackToast', 'fetchHtml', 'lean', 'life', 'loadViewer', 'lsGet', 'lsSet', 'ntReady', 'oldStyle', 'panel', 'pdoc', 'plainVer',
  'post', 'preP', 'preload', 'refreshVarMap', 'root', 'scriptInfo', 'swappable', 'switchedFrom', 'varsOk', 'BASE', 'mvuReaders', 'NT', 'dataSourceRegistryModule', 'tavernhelperApiModule', 'uiLang',
  'alive', 'cardId', 'cpResume', 'ghost', 'html', 'line', 'lineP', 'refOf',
];
export function createHostChecks(host) {
  for (const k of DEPS) if (!(k in host)) throw new Error('host-checks: missing dep ' + k);
  const { mvuBridge, HS, ID, LINES, LS, MAN, scriptOwner, PACK_ID, REPO, SCRIPT, scriptBase, VER, buildNow, channel, checkUpdate, conflictsNow, endGhost, fab, fallbackToast, fetchHtml, lean, life, loadViewer, lsGet, lsSet, ntReady, oldStyle, panel, pdoc, plainVer, post, preP, preload, refreshVarMap, root, scriptInfo, swappable, switchedFrom, varsOk } = host;
  // ---------------- 启动自检（E6；判定逻辑在 selfcheck.mjs，node 单测） ----------------
  // 每次页面加载空闲时跑一次：酒馆助手接口、MVU 的当前地点变量、重复的地图脚本、线路（复用测速结果）、世界书附加条目（查得到才查）、脚本与地图版本。
  // 结果：地图设置里的「自检」一栏（✓ / ⚠，中 / EN）；有 ⚠ 时弹一次小提示（同一组警告只提示一次，不按聊天重复）；EdenMap.selfcheck() 取结果。
  // 正式版（钉了 map-v 标签）另外每天最多查一次 jsDelivr 数据接口的最新标签；有新版本时自检里给「本次切换」按钮，设置「自动更新到新正式版」默认关。
  // 除了这一个查询，不发任何请求；不上传、不统计。
  let SC = null, checkP = null, checkFacts = null, checkItems = [], checkAt = 0, viewerVer = null, updInfo = null, toastEl = null;
  const UPD_KEY = 'edenMapUpdate', AUTO_UPD_KEY = 'edenMapAutoUpdate', TOAST_KEY = 'edenMapCheckToast';
  async function wbFacts() { try { return await SC.collectWorldbook(hostFn); } catch (e) { return null; } }
  async function wbWhere() { try { const W = await import(scriptBase + 'tavern/worldbook-sync.mjs'), man = await MAN; if (!man) return undefined; W.setPrefix(worldbookPrefix(man, PACK_ID)); const b = await W.bindingOf(hostFn, W.BOOK); return b.char ? 'char' : b.global ? 'global' : b.chat ? 'chat' : 'none'; } catch (e) { return undefined; } }   // N15
  const wbBook = async () => { try { const man = await MAN, m = await import(scriptBase + 'tavern/worldbook-sync.mjs'); if (man) m.setPrefix(worldbookPrefix(man, PACK_ID)); return man ? m.BOOK : ''; } catch (e) { return ''; } };   // 自检文案里的书名（= 世界书附加条目那本）
  async function updateFacts() {   // 正式版才查；一天最多一次（不论成败），结果记在本机
    if (!VER || !swappable || !SC.swapVer(host.entryUrl, VER)) return null;
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
      SC = await import(scriptBase + 'tavern/selfcheck.mjs');
      try { await Promise.race([mvuBridge.whenMvu(), new Promise(r => setTimeout(r, 3000))]); } catch (e) {}
      let mvu = null;
      try { if (mvuBridge.mvuUsable()) { const st = mvuBridge.rawLatestStat();
        refreshVarMap(); const hp = mvuBridge.varMap.location || '';
        mvu = { stat: !!st && typeof st === 'object', path: hp, here: !!st && SC.getPath(st, hp) !== undefined, candidates: st ? SC.findPaths(st).filter(p => p !== hp) : [],
          fields: st && host.mvuReaders ? { present: !!host.mvuReaders.presentList(st, mvuBridge.varMap.present), clock: !!host.mvuReaders.worldTime(st, mvuBridge.varMap).time, outfit: !!mvuBridge.varMap.outfit && host.mvuReaders.getByPath(st, mvuBridge.varMap.outfit) !== undefined } : null }; } } catch (e) { mvu = { stat: false }; }
      const varmode = mvuBridge.varmode(mvuBridge.mvuUsable());
      const loads = [...new Set(Object.entries(window.parent.__edenMapIds || {}).filter(([k, u]) => k !== scriptOwner && u !== switchedFrom).map(([, u]) => u))];   // A3：按脚本身份，不按地址
      const ln = { swappable, name: (LINES.find(l => l.key === host.line) || {}).name || '',
        ok: !swappable ? null : host.lineP ? await host.lineP.then(ok => ok && fetchHtml().then(() => true, () => false), () => false) : host.html ? await host.html.then(() => true, () => false) : null };
      checkFacts = {
        api: { getChatMessages: fnOk('getChatMessages'), eventOn: fnOk('eventOn'), injectPrompts: fnOk('injectPrompts'), tavern_events: typeof tavern_events === 'object' },
        vars: varsOk(), ejs: (() => { try { return typeof (window.parent.EjsTemplate || globalThis.EjsTemplate) === 'object'; } catch (e) { return false; } })(),
        db: mvuBridge.dbFacts(true),
        mvu, varmode, dup: { others: loads, oldStyle, replaced: !root.isConnected }, line: ln, worldbook: await wbFacts(), wbWhere: await wbWhere(), wbBook: await wbBook(), version: { script: plainVer(VER), viewer: viewerVer }, update: await updateFacts(),
        // B3 卡身份（getCharData，旧办法回退）、B4 宿主版本（只报告）、B7 角色卡正则（只读）
        card: host.tavernhelperApiModule ? await host.tavernhelperApiModule.cardIdentity(thFn, () => mvuBridge.stContext()).catch(() => null) : null, host: host.tavernhelperApiModule ? host.tavernhelperApiModule.hostVersions(thFn) : null,
        regex: host.tavernhelperApiModule && thFn('getTavernRegexes') ? await Promise.resolve(thFn('getTavernRegexes')({ type: 'character', name: 'current' })).then(l => host.tavernhelperApiModule.regexFacts(l), () => null) : null,
      };
      checkFacts.conflicts = conflictsNow(); checkFacts.checkpoint = host.cpResume;   // (d)(e)
      host.cardId = checkFacts.card;
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
  function sendCheck() { if (host.alive && checkItems.length) post({ type: 'eden-map:selfcheck', items: checkItems, canUpdate: channel() !== 'latest' && !!(VER && swappable && SC?.swapVer(host.entryUrl, VER)), autoUpdate: lsGet(AUTO_UPD_KEY) === '1' }); }
  // ---------------- v0.9.5 开场自检卡（tavern/splash.mjs）：导入后 / 换版本后第一次打开聊天时显示；不挡聊天 ----------------
  let splashModule = null, splash = null;
  const splashDue = () => { try { return (LS || localStorage).getItem('edenMapSplashSeen') !== String(VER || 'dev'); } catch (e) { return false; } };
  async function showSplash() {
    splashModule ??= await import(scriptBase + 'tavern/splash.mjs').catch(() => null); if (!splashModule) return false;
    const lite = lean(), get = f => cdnFetch(host.BASE + f, { cache: 'force-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); });
    const bi = await buildNow(); await MAN;
    splash = splashModule.openSplash({ root, id: ID, pdoc, ver: VER, en: host.uiLang === 'en', name: HS('app.name', host.uiLang === 'en'), about: { version: bi?.version || SCRIPT.version || VER, code: bi?.code || SCRIPT.code, channel: channel(), ref: SCRIPT.ref || host.refOf() }, store: localStorage, cap: window.parent.__splashCap || 25,
      checks: () => runCheck().then(() => checkItems),
      tasks: [
        { key: 'map', zh: '地图程序与当前一层的图块', en: 'Map program and current-layer tiles', run: () => { if (panel.hidden && !host.alive && !host.ghost) preload().catch(() => {}); return preP; } },
        { key: 'clouds', zh: '云图', en: 'Cloud sprites', skip: lite, run: () => Promise.all([1, 2, 3, 4, 5, 6].map(k => get(`art/clouds/puff${k}.png`))) },
      ],
      onStart: () => { splash = null; if (panel.hidden || host.ghost) { if (host.ghost) endGhost(true); panel.hidden = false; loadViewer(); } }, onClose: () => { splash = null; if (updWait) setTimeout(showUpdPrompt, 600); } });
    return true;
  }
  // 有 ⚠ 时弹一次小提示：同一版本、同一组警告只弹一次（点 × 或自动收起都算看过）；地图面板开着时不弹——
  // 面板里的设置 / 表单会被它盖住（v0.9.6 用户实测：盖住了变量映射表），警告在地图设置的「自检」一栏里都有；面板关上后再弹
  let toastWait = false;
  function toastOnce() {
    if (splash) return;   // 开场自检卡开着：警告已经列在卡里
    const sig = SC.warnSig(checkItems); if (!sig) return;
    const key = (VER || 'dev') + '|' + sig; if (key === lsGet(TOAST_KEY)) return;
    if (!panel.hidden && !host.ghost) { toastWait = true; return; }
    toastWait = false; lsSet(TOAST_KEY, key);
    // UI v2：P1 横幅「自检发现 N 项需要注意」→「查看」打开地图设置「更新与版本」（同一版本、同一组警告只出一次）
    const warns = checkItems.filter(i => i.status === 'warn'), L = host.uiLang === 'en' ? 'en' : 'zh';
    hostToast(host.uiLang === 'en' ? `Map self-check: ${warns.length} item(s) need attention` : `地图自检发现 ${warns.length} 项需要注意`, warns.map(w => '⚠ ' + w[L]), 0, null, false,
      { key: 'selfcheck', actions: [{ label: host.uiLang === 'en' ? 'View' : '查看', primary: true, run: () => openSettings('update') }] });
  }
  let setQ = null;   // 面板还没就绪时排队，eden-map:ready 后发（和 flyQ 一样）
  function openSettings(page) { if (host.alive && !panel.hidden && !host.ghost) { post({ type: 'eden-map:settings', page }); return; } setQ = page; if (panel.hidden || host.ghost) fab.click(); }

  // 宿主页提示（UI v2：全部进唯一通知层 ui/notice.mjs）。upd：更新提示（P1，力度 force 时 P0）；其余 P1。extra(el) 可以往里加链接、按钮
  let updEl = null; const ntTimers = {};
  function hostToast(title, lines, ms = 12000, extra = null, upd = false, o = {}) {
    if (!host.NT) { ntReady.then(n => { if (life.dead) return; if (n) hostToast(title, lines, ms, extra, upd, o); else fallbackToast(title, lines, extra, o); }); return null; }
    const key = o.key || (upd ? 'upd' : 'toast'), level = o.level ?? 1;
    clearTimeout(ntTimers[key]);
    const t = host.NT.push({ key, level, title, lines, actions: o.actions, build: extra ? el => extra(el) : null, ms: level === 2 ? ms || undefined : undefined });
    if (upd) updEl = t; else toastEl = t;
    if (ms && level !== 2) ntTimers[key] = setTimeout(() => { delete ntTimers[key]; if (host.NT?.get(key) === t) host.NT.remove(key); }, ms);
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
  // 2026-09-28：没梯子时 GitHub 接口不通 → 改用 tavern/branch-follow.mjs（分支 head.json：jsdmirror / jsDelivr / raw 取构建号最大的，最后才 GitHub），和加载器同一套
  let FW = null;
  const fwGet = async u => { const c = new AbortController(), to = setTimeout(() => c.abort(), 5000);
    try { const r = await cdnFetch(u, { cache: 'no-store', signal: c.signal }); return r.ok ? await r.json() : null; } catch (e) { return null; } finally { clearTimeout(to); } };
  async function followHead(branch) {   // branch 缺省 = 脚本自己的 ref；钉在提交号的脚本问 About 要预览分支的头（I-23）
    FW ??= await import(scriptBase + 'tavern/branch-follow.mjs').catch(() => null); const br = branch || SCRIPT.ref || host.refOf?.(); if (!FW || !br) return null;
    return FW.resolveFollow(REPO, br, fwGet, null).catch(() => null);
  }
  // 比加载的新：有构建号比构建号；老加载器（没有构建号）比提交号
  const followNewer = h => !!h && (Number.isInteger(SCRIPT.build) ? h.build > SCRIPT.build : !!SCRIPT.sha && !String(h.sha).startsWith(SCRIPT.sha));
  async function followCheck() {
    if (life.dead || updateChannel({ channel: channel(), ref: SCRIPT.ref || host.refOf?.() }) !== 'follow' || !(SCRIPT.ref || host.refOf?.())) return;
    const h = await followHead(); if (!followNewer(h) || h.sha === followSeen || life.dead) return;
    followSeen = h.sha; const en = host.uiLang === 'en';
    hostToast(en ? 'Update available — reload to load it' : '有更新，刷新载入', [(en ? `Latest build #${h.build} · ` : `分支最新构建 #${h.build} · `) + String(h.sha).slice(0, 7)], 0, t => {
      t.classList.add('em-upd', 'em-follow'); const acts = pdoc.createElement('div'), b = pdoc.createElement('button'); acts.className = 'em-acts nt-acts'; b.className = 'nt-pri';
      b.type = 'button'; b.textContent = en ? 'Reload' : '刷新载入'; b.onclick = () => switchToHead(h); acts.append(b); t.append(acts); }, true);
  }
  // 发现更新的分支头：整页刷新（I-29b）——就地接管会漏掉旧 viewer 文档（每次约 8 MB）；加载器每次都以 no-store 重取 head.json，刷新后载入的就是新头
  function switchToHead(h) { try { window.parent.location.reload(); } catch (e) { console.warn('[eden-map] 刷新页面失败', e); } }
  async function autoCheck() {
    SC ??= await import(scriptBase + 'tavern/selfcheck.mjs').catch(() => null); if (!SC?.autoCheckPlan || life.dead) return;
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
    if (splash || (!panel.hidden && !host.ghost)) { updWait = true; return; }   // 不盖住开着的面板 / 表单
    updWait = false; const u = updPrompt; updPrompt = null;
    if (u.force) {
      const F = SC.forceText(u.current, u.min, u.latest, updChannel(), u.reason, host.uiLang === 'en', { script: HS('app.script', host.uiLang === 'en') });
      return hostToast(F.title, F.lines, 0, t => {
        t.classList.add('em-upd', 'em-force'); t.__upd = u;
        const a = pdoc.createElement('a'); a.href = u.notes; a.target = '_blank'; a.rel = 'noopener'; a.textContent = F.notes; const d = pdoc.createElement('div'); d.append(a); t.append(d);
        const acts = pdoc.createElement('div'); acts.className = 'em-acts nt-acts';
        const cl = pdoc.createElement('button'); cl.type = 'button'; cl.className = 'em-later'; cl.textContent = F.close;
        cl.onclick = () => { try { window.parent.__edenMapForceClosed = u.min; } catch (e) {} t.remove(); };   // 只记在这次页面上：刷新后再弹
        acts.append(cl); t.append(acts);
      }, true, { level: 0, key: 'upd' });   // P0：没有 ×，只有「本次关闭」（次按钮）
    }
    const T = SC.updatePromptText(u.latest, updChannel(), host.uiLang === 'en', { script: HS('app.script', host.uiLang === 'en') });
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
    const nv = updInfo?.latest, url = nv && SC?.swapVer(host.entryUrl, nv);
    if (!url || SC.cmpVer(nv, VER) <= 0) return;
    window.parent.__edenMapSwitch = scriptBase;
    import(url).catch(e => { console.warn('[eden-map] 切换到新版本失败', e); window.parent.__edenMapSwitch = switchedFrom; });
  }
  async function switchBranch(br) {   // 设置「更新与版本」→ 版本分支（main / preview 双轨）：本次会话从目标分支重载同一个脚本，新实例 takeOver 接管这一份；长期使用请重新导入该分支的脚本
    if (!host.dataSourceRegistryModule) { try { host.dataSourceRegistryModule = await import(scriptBase + 'tavern/data-source-registry.mjs'); } catch (e) {} }
    const url = host.dataSourceRegistryModule ? host.dataSourceRegistryModule.branchUrl(host.entryUrl, br) : null;
    if (!url || life.dead) return;
    window.parent.__edenMapSwitch = scriptBase;
    import(url).catch(e => { console.warn('[eden-map] 切换分支失败', e); window.parent.__edenMapSwitch = switchedFrom; });
  }
  return {
    autoCheck, get checkAt() { return checkAt; }, get checkFacts() { return checkFacts; }, get checkItems() { return checkItems; },
    get checkP() { return checkP; }, set checkP(v) { checkP = v; }, finishCheck, followCheck, followHead, followNewer, hostToast, openSettings, runCheck,
    get SC() { return SC; }, set SC(v) { SC = v; }, sendCheck, get setQ() { return setQ; }, set setQ(v) { setQ = v; }, showSplash, showUpdPrompt,
    get splash() { return splash; }, splashDue, switchBranch, switchVersion, get toastEl() { return toastEl; }, toastOnce, get toastWait() { return toastWait; },
    get updEl() { return updEl; }, get updPrompt() { return updPrompt; }, set updPrompt(v) { updPrompt = v; },
    get updWait() { return updWait; }, set updWait(v) { updWait = v; }, get viewerVer() { return viewerVer; }, set viewerVer(v) { viewerVer = v; },
  };
}
