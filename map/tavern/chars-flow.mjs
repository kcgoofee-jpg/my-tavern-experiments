// 人物与世界时间流：MVUBridge / 上下文流水线装配、世界时间与着装、名册 / 立绘 / 行程 / 日程漫游转发给查看器（S5-1 自 eden-map.js 原样搬出）。
// 工厂风格同 host-*.mjs：createX(host) 只在入口调用一次；host 是入口给的依赖袋（活的变量 = 取 / 存器，函数 = 晚绑定转发），DEPS 是本模块要用的全部键。
import { ContextPipeline } from './context.mjs';
import { resolveTags } from './sanitize.mjs';
import { MVUBridge } from './mvu-bridge.mjs';
import { cdnFetch } from './host-tavernhelper.mjs';
export const DEPS = [
  'GEN', 'LS', 'MAN', 'PACK_ID', 'PACK_IN', 'scriptBase', 'UI', 'clockEl', 'emit', 'life', 'loadCustom', 'post', 'push', 'pushSoon', 'recomputeSoon',
  'runCheck', 'saveRoot', 'BASE', 'CHM', 'uiLang', 'alive', 'chars', 'checkP', 'custom', 'customChat', 'floorNow', 'rep', 'roster', 'transitMod', 'reg', 'regNow',
];
export function createCharsFlow(host) {
  for (const k of DEPS) if (!(k in host)) throw new Error('chars-flow: missing dep ' + k);
  const { GEN, LS, MAN, PACK_ID, PACK_IN, scriptBase, UI, clockEl, emit, life, loadCustom, post, push, pushSoon, recomputeSoon, runCheck, saveRoot } = host;
  // ---------------- MVUBridge（P2 解耦第一步，docs/reviews/architecture_and_stream_perf.md §3）----------------
  // 变量映射（v0.9.5，换卡兼容）、stat_data 快照选取（v0.9.9）、当前地点三级兜底（MVU → 标签对账 → 表格数据库插件，
  // 只读）、自定义数据的变量读写（A-11）全部收进 map/tavern/mvu-bridge.mjs——宿主脚本里唯一允许直接碰
  // Mvu / SillyTavern 全局的模块（隔离契约，tests/mvu_bridge.test.mjs 机械检查）。这里只留调度与 UI：
  // 桥经 onMvuLoad / onTableUpdate / onRoster 回调通知「变了」，宿主决定何时推送 / 重算。
  let mvuReaders = null;   // mvu-readers.mjs（纯函数集）由桥加载；这里拿模块引用给自定义 / 注入等纯调用用
  const contextPipeline = new ContextPipeline({   // 聊天上下文流水线（tavern/context.mjs）：先建（下面 mvuBridge 的标签对账要读它的消息缓存）
    stripTags: resolveTags(k => { try { return (LS || localStorage).getItem(k); } catch (e) { return null; } }),
  });
  // I-21：场景头里的地点认不认得出节点（K-R105）：节点树定位模块与注册表都到了才算；之前一律「认不出」= 沿用变量值（旧行为），到了再推一次
  let locateM = null;
  const resolves = place => { try { return !!(locateM && host.regNow && locateM.locate(host.regNow, place)); } catch (e) { return false; } };
  const mvuBridge = new MVUBridge({
    life, pack: PACK_IN, packId: PACK_ID, manifest: MAN, resolves,
    lang: () => (host.uiLang === 'en' ? 'en' : 'zh'), isGenerating: () => GEN.generating,
    storage: () => LS || localStorage,
    floorNow: () => host.floorNow, lastRaw: () => (host.floorNow >= 0 ? contextPipeline.msgCache.get(host.floorNow)?.m?.raw ?? null : null),
    onMvuLoad: m => { mvuReaders = m; push(); loadCustom(); },
    onTableUpdate: () => { pushSoon(); recomputeSoon(); },
    onRoster: () => sendChars(), fetchJSON: rel => cdnFetch(host.BASE + rel).then(r => r.ok ? r.json() : null).catch(() => null), onProfile: () => { sendVarMap(); push(); recomputeSoon(); sendChars(); },   // 包的变量与名册声明（清单 vars + 叠加层，K-R69）由桥取；到之前按字段名自动找
  });
  Promise.all([import(scriptBase + 'tavern/spatial-contract.mjs'), host.reg?.()]).then(([m]) => { locateM = m; if (!life.dead) push(); }).catch(() => {});
  // P3-B 名册装配（core/roster.mjs）：mvu / table-db / fallback 三个来源桥里已注册；chat / baibai 只有宿主有——
  // 聊天 ⌖人物 标签在流水线的消息窗口里、柏宝绘外貌库按需加载。临时名册拼装（known 名单 flatMap）由装配系统统一输出。
  mvuBridge.roster.use('chat', { rows: ctx => !host.CHM || !Array.isArray(ctx?.msgs) ? [] : ctx.msgs.flatMap(m => host.CHM.parseChars(m.text).map(c => ({ name: c.name, place: c.place, source: 'chat' }))) });
  let imagegenBridgeModule = null; import(scriptBase + 'tavern/imagegen-bridge.mjs').then(m => { imagegenBridgeModule = m; }).catch(() => {});   // 可选依赖：没装 / 加载失败只是没有柏宝绘来源
  mvuBridge.roster.use('baibai', { rows: () => imagegenBridgeModule ? imagegenBridgeModule.characters().list : [] });
  // 保底名册（Pack 0 数据挂载点 manifest.data.roster，通用化 v1 前是 mvu-readers.mjs 的硬编码数组）：包声明了才取；
  // eden（无注入的内置默认）走内置档路径。取不到就没有兜底行，不挡启动。
  MAN.then(man => { const rp = man?.data?.roster, rb = PACK_ID === 'eden' ? '' : 'packs/' + PACK_ID + '/';   // 路径读自包清单 data.roster；没声明 = 没有兜底行
    if (rp) return cdnFetch(host.BASE + rb + rp).then(r => r.ok ? r.json() : null).then(j => { if (mvuBridge.setFallbackMembers(j?.members || [])) { recomputeSoon(); sendChars(); } }); }).catch(() => {});
  // 桥接口的宿主侧薄别名：原有调用点（chatId / userName / mvuStat / getHere / readVars）不用逐个改
  const chatId = () => mvuBridge.chatId(), cardKey = () => mvuBridge.cardKey(), userName = s => mvuBridge.userName(s);
  const mvuStat = () => mvuBridge.mvuStat(), getHere = () => mvuBridge.here(), readVars = () => mvuBridge.readVars();
  function refreshVarMap() { if (mvuBridge.refreshVarMap()) sendVarMap(); }   // 桥重算映射并返回「签名变了」；宿主只管发
  function sendVarMap() { if (!host.alive) return; post({ type: 'eden-map:varmap', ...mvuBridge.varmapView() }); }
  function setVarUser(u) { if (mvuBridge.setVarUser(u)) sendVarMap(); recomputeSoon(50); push(); if (host.checkP) host.checkP.then(() => { host.checkP = null; runCheck(); }); }   // 自检重跑，读法跟着变

  // ---------------- v0.9.3：世界时间（标题栏 + 地图夜色）与主角着装（本人地点卡）；只读 stat_data，缺字段就不显示 ----------------
  // mvu-readers.mjs 的加载与设定包配置（setVarRoot / setWbName）在桥里；桥加载好后经 onMvuLoad 把模块交给这里（纯函数调用用）
  let clockSig = null, outfitSig = null, clock = null, outfitNow = null;
  function pushMvu() {
    if (!mvuReaders) return;
    clock = mvuBridge.clock();   // { date, time, period, short, full, night, tod, pre }
    const cs = JSON.stringify(clock);
    if (cs !== clockSig) { clockSig = cs; const cap = (UI[host.uiLang] || UI.zh).clock; clockEl.hidden = !clock.short; clockEl.lastChild.textContent = clock.short + (clock.pre ? (host.uiLang === 'en' ? ' · pre-start' : ' · 开局前') : '');   // 用户 2026-09-28：时钟图标 + 「世界时间」提示，日期写成「1月3日」
      clockEl.title = (clock.full ? cap + '：' + clock.full : cap) + (clock.pre ? (host.uiLang === 'en' ? ' (before an opening is chosen: card initial values)' : '（开局前 · 卡初始值：还没选开局，时间 / 地点 / 人物来自卡的 MVU 初始变量）') : ''); clockEl.setAttribute('aria-label', clockEl.title); emit('clock', { ...clock }); sentClock = null; }
    if (host.alive && sentClock !== clockSig) { sentClock = clockSig; post({ type: 'eden-map:clock', ...clock }); }
    const o = mvuBridge.outfit(), os = JSON.stringify(o.items);
    if (os !== outfitSig) { outfitSig = os; outfitNow = o.items; emit('outfit', { items: o.items ? { ...o.items } : null, text: o.text }); sentOutfit = null; }
    if (host.alive && sentOutfit !== outfitSig) { sentOutfit = outfitSig; post({ type: 'eden-map:outfit', items: outfitNow, text: o.text }); }
  }
  let sentClock = null, sentOutfit = null;

  // v0.9.5 行程：最近 30 楼每楼的地点（MVU 那一楼的变量，拿不到就读原文里的 JSONPatch）+ 人物标签 → 最近 5 段（玩家、人物各 5），存进 eden_map.行程
  let tripsParseModule = null; import(scriptBase + 'tavern/trips-parse.mjs').then(m => { tripsParseModule = m; }).catch(() => {});

  // NPC 日常漫游（Part 5-3，core/routine.mjs）：包数据 manifest.data.routine 的日程表；聊天没提到的人物按世界时刻落在该在的地方
  let routineModule = null, rtSched = null; import(scriptBase + 'core/routine.mjs').then(m => { routineModule = m; if (rtCfg) { rtSched = m.normSchedule(rtCfg); sendRoutine(); recomputeSoon(50); } }).catch(() => {});
  let rtCfg = null;
  { const rp = PACK_IN?.manifest?.data?.routine; if (rp) { const rb = PACK_ID === 'eden' ? '' : 'packs/' + PACK_ID + '/';   // 与保底名册同一算法：eden 的路径相对 map/，其它包相对 packs/<id>/
    cdnFetch(host.BASE + rb + rp).then(r => r.ok ? r.json() : null).then(j => { rtCfg = j; if (routineModule && j) { rtSched = routineModule.normSchedule(j); sendRoutine(); recomputeSoon(50); } }).catch(() => {}); } }
  // Part 8-2：日程表整张推给查看器——那边用确定性时钟（core/walk.mjs）自己挪人，不再等宿主推 MVU 变动
  function sendRoutine() { if (host.alive && rtSched) post({ type: 'eden-map:routine', schedule: rtCfg || rtSched }); }
  function computeTrips(msgs) {
    if (!tripsParseModule || !mvuReaders || !host.custom || host.customChat !== chatId()) return;
    const r = contextPipeline.computeTrips(msgs, { tripsParseModule, CHM: host.CHM, perFloorStat: f => mvuBridge.perFloorStat(f), mvuGet: (s, p) => mvuBridge.mvuGet(s, p), varMap: mvuBridge.varMap,
      keywords: mvuBridge.varUser.keywords || tripsParseModule.DEFAULT_KEYWORDS, fantasy: !!mvuBridge.varUser.fantasy, parseTransit: s => host.transitMod?.parseTransit?.(s) || null });
    if (r.changed) { saveRoot(); sendTrips(); }   // 行程变了才写聊天变量、才发地图
  }
  function sendTrips() { if (host.alive) post({ type: 'eden-map:trips', items: contextPipeline.trips }); }
  function sendChars() { if (host.alive) post({ type: 'eden-map:chars', v: 1, floor: host.floorNow, items: host.chars, rosters: host.roster, groups: mvuBridge.groupsView(host.roster), rep: host.rep, stageOrder: mvuBridge.stageOrder, portraits: mvuBridge.portraits }); }
  // v0.9.5 名册（只读）：在场 / 成员 / 目标三张表 + 主角声望的表对象在这里（发地图用）；
  // 阶段先后序与原作立绘表在桥里（每聊天读一次卡文本，mvuBridge.stageOrder / mvuBridge.portraits）
  return {
    mvuBridge, cardKey, chatId, get clock() { return clock; }, computeTrips, contextPipeline, getHere, get mvuReaders() { return mvuReaders; }, mvuStat, get outfitNow() { return outfitNow; }, pushMvu,
    readVars, refreshVarMap, get routineModule() { return routineModule; }, get rtSched() { return rtSched; }, sendChars, sendRoutine, sendTrips,
    get sentClock() { return sentClock; }, set sentClock(v) { sentClock = v; }, get sentOutfit() { return sentOutfit; }, set sentOutfit(v) { sentOutfit = v; },
    setVarUser, get tripsParseModule() { return tripsParseModule; }, userName,
  };
}
