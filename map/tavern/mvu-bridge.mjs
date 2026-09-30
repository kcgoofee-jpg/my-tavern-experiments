// MVUBridge（P2 解耦第一步，docs/reviews/architecture_and_stream_perf.md §3）：宿主脚本的数据流读取收口。
// 原来散落在 eden-map.js 里的 mvuStat（A-3 微任务快照）、getHere（MVU → 标签对账 → 表格数据库三级兜底）、
// refreshVarMap / setVarUser（tavern/adapter.mjs 变量映射编排）、readVars（A-11 聊天变量 → 本机退回）全部搬来这里，
// 并统一编排 snapshot.mjs（快照选取）、shujuku.mjs（表格数据库只读）、mvu.mjs（时间 / 着装 / 名册 / 立绘，按需加载）。
//
// 宿主隔离契约：本模块是 map/tavern/ 里唯一允许直接触碰 Mvu / SillyTavern 全局变量的模块
// （tests/mvu_bridge.test.mjs 按源码机械检查），其他业务模块一律经这里拿数据。
// 桥自己不碰 DOM、不发消息、不做 UI——变化通过构造参数的回调（onMvuLoad / onTableUpdate / onRoster）告诉宿主；
// 底层四个模块全是纯函数，node 单测桩出全局变量即可覆盖（无浏览器）。
import { thFn, fnOk } from './host-th.mjs';
import * as SNP from './snapshot.mjs';
import * as AD from './adapter.mjs';
import * as DB from './shujuku.mjs';
import * as MDm from './modes.mjs';
import * as SAN from './sanitize.mjs';
import * as RS from '../core/roster.mjs';

export class MVUBridge {
  /** o = { life?, pack?, packId?, lang?(): 'zh'|'en', isGenerating?(): bool, storage?(): StorageLike,
   *      wins?(): object[]（表格数据库接口从哪些窗口找；默认宿主页 window.parent / top）,
   *      floorNow?(): number, lastRaw?(): string|null（最新助手楼原文，标签对账用）,
   *      onMvuLoad?(mvuModule), onTableUpdate?(), onRoster?()（卡文本异步到、立绘 / 阶段序变了 → 宿主重发） } */
  constructor(o = {}) {
    this.o = o;
    o.wins ||= () => { try { return [window.parent, window.top]; } catch (e) { return []; } };
    // 快照选取状态（v0.9.9，docs/mvu-integration.md）：mvuStat() 每次更新。
    // snapFloor = 用的快照在几楼、snapTop = 最新非隐藏楼、snapState = ok|pending|stale|none（UI「未确认」与注入标注用）
    this.snapFloor = -1; this.snapTop = -1; this.snapState = 'ok';
    this.varEpoch = 0;   // VARIABLE_UPDATE_ENDED 代数（W11 结算时序守卫；markVarUpdate 推进）
    // 变量映射（adapter）：按角色卡存本机的用户映射 + 生效映射 + 变化签名（宿主 round 签名引用 varSig）
    this.varCard = ''; this.varUser = {}; this.varMap = { location: '世界.当前地点' }; this.varSig = '';
    // here 的来源标注：'mvu' | 'tag'（正文标签兜底，交互方式 d）| 'preset'（社区预设状态栏兜底，Part 7）；hereFromDb = 地点读自表格数据库插件
    this.hereSrc = 'mvu'; this.hereFromDb = false;
    // 名册附属（每聊天读一次卡文本，A-3）：原作默认立绘表 + 阶段先后序
    this.portraits = {}; this.stageOrder = null;
    // 名册装配系统（P3-B，core/roster.mjs）：桥注册它拥有的三个来源；宿主再补 chat / baibai（聊天原文与扩展接口在宿主）。
    // 发给查看器的 eden-map:chars.rosters 三表载荷照旧出自 rosters()（向后兼容）；装配系统供 known 名单、立绘挂载与 describe 摘要消费。
    this.roster = new RS.RosterSystem();
    // 保底名册（Pack 0 数据挂载点 manifest.data.roster，通用化 v1）：宿主按清单路径取到后 setFallbackMembers 注入；
    // 没给就没有兜底行——引擎不写死任何卡的人名。
    this.fallbackMembers = Array.isArray(o.fallbackMembers) ? o.fallbackMembers : [];
    this.roster.use('mvu', { rows: () => this.MV ? RS.mvuRows(this.rosters()) : [] });
    this.roster.use('table-db', { rows: () => RS.placeRows(this.dbCharacters(), 'table-db') });
    this.roster.use('fallback', { rows: () => RS.fallbackRows(this.fallbackMembers) });
    if (o.pack) AD.useDefaults(o.pack.manifest?.vars);   // 设定包：默认映射路径按清单换（eden 不动）
    // mvu.mjs 按需加载（纯函数集；失败只是没有 MVU 联动功能）。设定包的聊天变量键 / 自定义世界书名在这里配置。
    this.MV = null;
    this.mvuReady = import(new URL('mvu.mjs', import.meta.url).href).then(m => {
      if (o.life?.dead) return null;
      if (o.pack) { m.setVarRoot(o.pack.chatVar || 'tc_' + String(o.packId || 'pack').replace(/-/g, '_')); m.setWbName(o.pack.manifest?.title || o.packId); }
      this.MV = m; o.onMvuLoad?.(m); return m;
    }).catch(e => { try { console.warn('[eden-map] MVU 模块加载失败', e); } catch (x) {} return null; });
  }

  // ---------------- 全局访问（本模块独占） ----------------
  #mvu() { return typeof Mvu !== 'undefined' ? Mvu : null; }
  #chat() { try { return SillyTavern?.chat; } catch (e) { return undefined; } }
  mvuPresent() { return typeof Mvu !== 'undefined'; }
  mvuUsable() { return this.mvuPresent() && typeof this.#mvu()?.getMvuData === 'function'; }
  stContext() { return SillyTavern.getContext(); }
  chatLen() { const ch = this.#chat(); return Array.isArray(ch) && ch.length ? ch.length : -1; }
  chatAt(i) { const ch = this.#chat(); return ch && typeof ch === 'object' ? ch[i] ?? null : null; }
  swipeAt(i) { return this.#chat()?.[i]?.swipe_id; }
  cardKey() { try { const c = SillyTavern.getContext(); return c.characters?.[c.characterId]?.avatar || c.name2 || ''; } catch (e) { return ''; } }
  chatId() { try { return String(SillyTavern.getContext().chatId || ''); } catch (e) { return ''; } }
  // 标题栏显示用：{{user}} 换成酒馆里的用户名，取不到就去掉（发给地图的仍是原值，地图自己处理）
  userName(s) { let n = ''; try { n = SillyTavern.getContext().name1 || ''; } catch (e) {} return String(s).replace(/\{\{user\}\}/g, n).trim(); }
  // 酒馆助手接口在不在（A-11 读写路径共用）
  #varsOk() { return fnOk('getVariables') && (fnOk('updateVariablesWith') || fnOk('replaceVariables') || fnOk('insertOrAssignVariables')); }
  #store() { try { return this.o.storage?.() ?? null; } catch (e) { return null; } }

  // ---------------- stat_data 快照 ----------------
  /** 楼层读取（snapshot.mjs / modes.mjs 的 readFloor 契约）：该楼当前 swipe 的变量 + 隐藏 / 角色标注 */
  readFloor(i) { const c = SillyTavern?.chat?.[i]; return c ? { vars: c.variables?.[c.swipe_id ?? 0], system: !!c.is_system, role: c.is_user ? 'user' : 'assistant' } : null; }
  get pickStat() { return SNP.pickStat; }
  #statSnap;   // A-3：一轮（同一个同步任务）只取一次 stat_data 快照；微任务里作废。undefined = 本轮还没取
  /** 最新楼的 stat_data（v0.9.9）：Mvu 全局读一仛建底，再按 snapshot.mjs 的规则往前找最近快照、标未确认 */
  mvuStat() {
    if (this.#statSnap !== undefined) return this.#statSnap;
    let v = null, stt = 'ok';
    try { v = this.#mvu()?.getMvuData?.({ type: 'message', message_id: 'latest' })?.stat_data || null; } catch (e) {}
    try { const n = this.chatLen(); if (n > 0) { const r = SNP.pickStat(i => this.readFloor(i), n, { generating: this.o.isGenerating?.() || false });
      this.snapFloor = r.floor; this.snapTop = r.top; if (!v || r.floor === r.top) v = r.stat || v; stt = v ? r.state : (this.mvuPresent() ? r.state : 'ok'); } } catch (e) {}
    this.snapState = stt; this.#statSnap = v; queueMicrotask(() => { this.#statSnap = undefined; }); return v;
  }
  /** 变量已变（VARIABLE_UPDATE_ENDED）：立刻丢掉本轮快照，下次读取重拿。映射签名不清（未确认的推送仍按签名去重） */
  invalidate() { this.#statSnap = undefined; }
  // 变量更新代数（W11 结算时序守卫，docs/plans/llm-campaign.md）：每次 VARIABLE_UPDATE_ENDED +1。
  // 宿主必须在事件处理器里先调 markVarUpdate()（作废快照 + 落代数），推送 / 重算 / 结算放行都排在它后面——
  // 地图侧的写入（账本补发、空间状态）只在事件收尾放行，绝不落在主 MVU 的更新窗口里（tests/mvu_lifecycle.test.mjs）。
  markVarUpdate() { this.invalidate(); this.varEpoch += 1; return this.varEpoch; }
  varUpdateSeq() { return this.varEpoch; }
  /** 某一楼的 stat_data（行程 / 冲突对账用；那一楼没有返回 null） */
  perFloorStat(floor) { try { return this.#mvu()?.getMvuData?.({ type: 'message', message_id: floor })?.stat_data || null; } catch (e) { return null; } }
  /** Mvu 全局的 latest 原样读（自检用，不走快照选取） */
  rawLatestStat() { try { return this.#mvu()?.getMvuData?.({ type: 'message', message_id: 'latest' })?.stat_data ?? null; } catch (e) { return null; } }

  // ---------------- 变量映射（adapter.mjs） ----------------
  /** 换卡 / 改映射后重算生效映射。返回「签名变了」（宿主据此发 eden-map:varmap） */
  refreshVarMap() {
    const card = this.cardKey(); if (card !== this.varCard) { this.varCard = card; this.varUser = AD.readUser(this.#store(), card); }
    const st = this.mvuStat();
    this.varMap = AD.effective(this.varUser, st);
    const sig = JSON.stringify([this.varMap, this.varUser, !!st]); if (sig === this.varSig) return false;
    this.varSig = sig; return true;
  }
  /** 设置「变量映射」里改过的：按角色卡写本机，作废签名并重算（返回值同 refreshVarMap） */
  setVarUser(u) { this.varUser = u && typeof u === 'object' ? u : {}; AD.writeUser(this.#store(), this.varCard, this.varUser); this.varSig = ''; return this.refreshVarMap(); }
  /** eden-map:varmap 的载荷（发设置「变量映射」用） */
  varmapView() { const st = this.mvuStat();
    return { card: this.varCard, paths: AD.paths(st), map: this.varMap, user: this.varUser, detected: AD.detect(st), fields: AD.rowFields?.(st) || [], mode: this.varmode() }; }
  /** 读法：'mvu' | 'mvu-partial' | 'tags'（adapter.mode；hasMvu 缺省 = Mvu 全局在） */
  varmode(hasMvu = this.mvuPresent()) { return AD.mode(hasMvu, this.mvuStat(), this.varMap); }
  /** adapter 读法取值（含 [值, 说明] 旧格式拆包） */
  getPath(st, p) { return AD.get(st, p); }
  /** mvu.mjs 读法取值（行程用，与 getPath 同语义） */
  mvuGet(st, p) { return this.MV ? this.MV.get(st, p) : undefined; }

  // ---------------- 角色卡身份（任务四）：UI 面板只经这里取，绝不自己摸宿主全局 ----------------
  #parent() { try { return window.parent; } catch (e) { return null; } }
  /**
   * 角色卡信息（版权申明页用）：降级链——酒馆助手 getCharData('current') → 本窗口 SillyTavern 上下文
   * → 父级窗口的同名接口（独立窗口 / 上下文被隔离时本窗口读不到全局）。
   * 三级都拿不到返回 null，由调用方显示安全占位：面板读不到卡信息**不等于**「未接入酒馆」，
   * 绝不报那种虚假错误（旧版 settings.mjs 直接读 window.SillyTavern，嵌在 iframe 里 100% 误报）。
   */
  async cardInfo() {
    const pick = (c, src) => {
      const d = c?.data && typeof c.data === 'object' ? c.data : (c && typeof c === 'object' ? c : {});
      const name = String(d.name || c?.name || '').trim();
      if (!name && !d.creator && !d.character_version) return null;
      return { name, creator: String(d.creator || '').trim(), version: String(d.character_version || '').trim(), avatar: String(c?.avatar || ''),
        tags: Array.isArray(d.tags) ? d.tags.map(String).slice(0, 12) : [], notes: String(d.creator_notes || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200), src };
    };
    try { const r = pick(await thFn('getCharData')?.('current'), 'getCharData'); if (r) return r; } catch (e) {}
    try { const c = this.stContext(); const r = pick(c?.characters?.[c.characterId], 'context'); if (r) return r; } catch (e) {}
    const p = this.#parent();
    try { const g = p?.TavernHelper?.getCharData; const r = typeof g === 'function' ? pick(await g('current'), 'parent-th') : null; if (r) return r; } catch (e) {}
    try { const c = p?.SillyTavern?.getContext?.(); const r = pick(c?.characters?.[c.characterId], 'parent-st'); if (r) return r; } catch (e) {}
    return null;
  }

  // ---------------- 当前地点（四级兜底） ----------------
  /** MVU 映射 → 正文标签对账（交互方式 d）→ 表格数据库插件 → 社区预设状态栏（Part 7）。ctx 可覆盖 floorNow / lastRaw（缺省用构造参数）。 */
  here(ctx = {}) {
    const floorNow = ctx.floorNow ?? this.o.floorNow?.() ?? -1;
    const raw = ctx.lastRaw !== undefined ? ctx.lastRaw : this.o.lastRaw?.() ?? null;
    const { snapState, snapFloor, snapTop } = this;   // mvuStat() 更新的快照状态
    let v = '';
    try { const st = this.mvuStat(); v = String(AD.get(st, this.varMap.location) ?? ''); } catch (e) {}
    this.hereFromDb = false; this.hereSrc = 'mvu';
    // 标签对账：MVU 为准；本楼 MVU 还没有快照（生成中 / 缺快照）或读不到地点时，改用最新一楼正文里明确写的地点标签（⌖地点 …），标「来自正文」
    if (MDm && (snapState !== 'ok' || !v.trim()) && snapTop >= 0 && floorNow >= snapTop) { const t = raw != null ? MDm.parseHereTag(raw) : null;
      if (t && floorNow > snapFloor) { const r = MDm.reconcile({ place: v, state: snapState }, t); if (r.source === 'tag') { v = r.place; this.hereSrc = 'tag'; } } }
    if (!v.trim()) { const d = this.#dbData(); if (d) { v = DB.protagonist(d).location; this.hereFromDb = !!v; } }
    if (!v.trim() && raw) { const h = SAN.presetHereHint(raw); if (h.here) { v = h.here; this.hereSrc = 'preset'; } }   // Part 7：社区预设状态栏的「地点：…」也认（兜底链最后一级）
    return v;
  }

  // ---------------- 世界时间 / 着装 / 名册（mvu.mjs，加载后可用） ----------------
  /** 标题栏时钟：{ date, time, period, short, full, night, tod, pre }（缺字段是 ''；pre = 聊天只有开场白） */
  clock(st = this.mvuStat()) {
    const MV = this.MV; if (!MV) return null;
    const w = MV.worldTime(st, this.varMap), lb = MV.clockLabel(w, this.o.lang?.() === 'en' ? 'en' : 'zh');
    const c = { ...w, ...lb, night: MV.isNight(w), tod: MV.todPhase?.(w) || '' };   // tod：时段色调（v0.9.6）
    try { c.pre = (thFn('getLastMessageId')?.() ?? 1) <= 0; } catch (e) { c.pre = false; }   // fix3：还没选开局 → 卡的 MVU 初始值
    return c;
  }
  /** 主角着装：{ items, text }（items = null 表示没有） */
  outfit(st = this.mvuStat()) { const MV = this.MV; const o = MV ? MV.outfit(st, this.varMap.outfit) : null; return { items: o, text: MV ? MV.outfitText(o) : '' }; }
  /** 名册三张表（在场 / 成员 / 目标；含设定兜底名册），映射里的行内字段名全量生效 */
  rosters(st = this.mvuStat()) { const m = this.varMap; return this.MV ? this.MV.rosters(st, { present: m.present, members: m.members, targets: m.targets, stageField: m.stageField, gradeField: m.gradeField, coreField: m.coreField, codeField: m.codeField, socialField: m.socialField, heightField: m.heightField, weightField: m.weightField, knownField: m.knownField, accessoryField: m.accessoryField, tierField: m.tierField }, this.fallbackMembers) : { present: null, members: null, targets: null }; }
  /** 包的保底名册（manifest.data.roster，宿主异步取到后注入）；有货返回 true（宿主据此重发名册） */
  setFallbackMembers(rows) { this.fallbackMembers = Array.isArray(rows) ? rows.filter(r => r && typeof r === 'object') : []; return this.fallbackMembers.length > 0; }
  reputation(st = this.mvuStat()) { return this.MV ? this.MV.reputation(st, this.varMap.reputation) : null; }
  // 名册装配系统（P3-B 契约，core/roster.mjs）：统一 rows() 行、已知名单（人物栏短名对齐用）、标准化摘要。
  // chat / baibai 两个来源由宿主经 this.roster.use() 登记（聊天原文在流水线、柏宝绘接口在扩展）。
  rosterRows(ctx) { return this.roster.rows(ctx); }
  rosterNames(ctx) { return this.roster.names(ctx); }
  rosterSummary(ctx) { return this.roster.describe(ctx); }
  presentNames(st) { return (this.MV?.presentList(st, this.varMap.present) || []).map(x => x.name); }
  worldTimeOf(st) { return this.MV ? this.MV.worldTime(st, this.varMap) : null; }
  // 原作立绘表与阶段序（每聊天读一次卡文本；卡文本可能异步到 → onRoster 通知宿主重发）
  #portChat = null; #stageChat = null; #stageMiss = '';
  portraitsFor() { if (this.#portChat === this.chatId()) return; this.#portChat = this.chatId();
    this.#withTexts(t => { this.portraits = this.MV ? this.MV.findPortraits(t) : {}; this.roster.attachPortraits(this.portraits); }); }
  stageOrderFor(r) {   // A-3：找不到也记住（同一聊天、同一组取值不再每轮扫一遍卡文本）
    const vals = (r?.targets?.items || []).map(i => i.stage).filter(Boolean), chat = this.chatId(); if (!vals.length || (this.#stageChat === chat && this.stageOrder && vals.every(v => this.stageOrder.includes(v)))) return;
    const key = chat + '|' + [...new Set(vals)].sort().join('\u0001'); if (key === this.#stageMiss) return;
    this.#stageChat = chat; this.#stageMiss = key;
    this.#withTexts(t => { this.stageOrder = this.MV ? this.MV.findStageOrder(t, vals) : null; this.#stageMiss = this.stageOrder ? '' : key; });
  }
  // 卡自带脚本 / 正则文本（A-8：宿主 API 可能返回 Promise——有 thenable 时整体等它）
  #cardTexts() {
    const texts = [], walk = (o, d = 0) => { if (d > 8 || texts.length > 4000) return; if (typeof o === 'string') { if (o.length > 20) texts.push(o); } else if (o && typeof o === 'object') for (const v of Object.values(o)) walk(v, d + 1); };
    const pend = [], take = (v, f) => { if (v && typeof v.then === 'function') pend.push(Promise.resolve(v).then(f, () => {})); else f(v); };
    try { const g = thFn('getCharData'); if (g) take(g('current'), c => walk(c?.data?.extensions)); } catch (e) {}
    try { const r = thFn('getTavernRegexes'); if (r) take(r({ scope: 'character' }), walk); } catch (e) {}
    return pend.length ? Promise.all(pend).then(() => texts) : texts;
  }
  #withTexts(f) { const t = this.#cardTexts(); if (typeof t?.then !== 'function') return f(t); t.then(x => { f(x); this.o.onRoster?.(); }, () => {}); }

  // ---------------- 自定义数据的变量读写（A-11） ----------------
  #lsKey() { return 'edenMap:chat:' + (this.chatId() || '') + ':custom2'; }
  /** 聊天变量顶层键（eden_map / 设定包的键）：先看本机有没有退回的数据（有 = 比聊天变量新），再读聊天变量 */
  readVars() {
    let fb = null; try { fb = JSON.parse(this.#store()?.getItem?.(this.#lsKey()) || 'null'); } catch (e) {}
    if (fb && typeof fb === 'object') return fb;
    if (this.#varsOk()) { try { const v = thFn('getVariables')?.({ type: 'chat' })?.[this.MV?.VAR_ROOT || 'eden_map']; return v && typeof v === 'object' ? v : {}; } catch (e) {} }
    return {};
  }

  // ---------------- 表格数据库插件（shujuku.mjs，只读） ----------------
  #dbApiRef = null; #dbCb = null;
  #findApi() { return DB.findApi(this.o.wins()); }
  #dbHook(a) {   // 插件可能比地图晚加载：每次取接口时补登记一次更新回调
    a ||= this.#findApi(); if (!a || a === this.#dbApiRef || this.o.life?.dead) return a;
    this.#dbApiRef = a; this.#dbCb = () => this.o.onTableUpdate?.();
    try { a.registerTableUpdateCallback?.(this.#dbCb); } catch (e) {}
    return a;
  }
  #dbApi() { const a = this.#findApi(); if (a) this.#dbHook(a); return a; }
  #dbData() { const a = this.#dbApi(); if (!a) return null; try { return a.exportTableAsJson(); } catch (e) { return null; } }
  /** 插件人物表里的位置（MVU 优先，宿主补进人物栏用）；没装返回 [] */
  dbCharacters() { const d = this.#dbData(); return d ? DB.characters(d) : []; }
  /** recompute 的轮次签名用：人物表的指纹（没装 / 还没碰到接口返回 ''，跳过导出） */
  dbSig() { if (!this.#dbApiRef) return ''; try { return JSON.stringify(DB.characters(this.#dbData())); } catch (e) { return ''; } }
  /** 自检 / 数据来源用的事实：{ tables, location, chars } 或 null（没装） */
  dbFacts(fresh = false) { if (fresh) this.here({}); const a = this.#dbApi(); return a ? DB.facts(a, this.hereFromDb) : null; }
  /** 「正文优化」改写丢掉的 ⌖ 标签从原文补回（shujuku.lostTags 直通） */
  lostTags(original, now) { return DB.lostTags(original, now); }
  disposeDb() { try { this.#dbApiRef?.unregisterTableUpdateCallback?.(this.#dbCb); } catch (e) {} }

  // ---------------- MVU 事件（宿主经 whenMvu / varUpdateEvent 挂到自己的 life 上） ----------------
  #whenMvuP = null;
  /** waitGlobalInitialized('Mvu')：没装 MVU 时也照常落定（不 reject），宿主接着挂楼层事件 */
  whenMvu() { this.#whenMvuP ??= new Promise(res => { try { Promise.resolve(thFn('waitGlobalInitialized')?.('Mvu')).then(res, res); } catch (e) { res(); } }); return this.#whenMvuP; }
  varUpdateEvent() { return this.#mvu()?.events?.VARIABLE_UPDATE_ENDED || null; }

  // ---------------- 会话快照导出（Session Replay，只读） ----------------
  /** 只读导出 MVU 状态与聊天变量（SessionSnapshot 的 mvu 段，契约在 map/tavern/context.mjs）。
   *  o.floors = 楼层号数组：附带每楼 stat_data（computeTrips 回放的每楼变量表）。
   *  不写任何状态、不作废快照缓存——录制绝不改变正常游戏模式的运行逻辑。 */
  dumpState(o = {}) {
    const out = { stat: this.mvuStat(), vars: this.readVars() };
    if (Array.isArray(o.floors)) { out.floors = {}; for (const f of o.floors) { const s = this.perFloorStat(f); if (s) out.floors[f] = s; } }
    return out;
  }

  // ---------------- 标准摘要（P2 契约） ----------------
  /** 一轮读取的完整快照（每窗口摘要口径，arch-v2 §0 第 3 条）：{ here, clock, outfit, rosters, portraits, custom }。
   *  这里的 here 是字符串地点；来源标注看 hereSrc / hereFromDb。rosters 含 reputation 的入口在 reputation()。 */
  read(ctx = {}) {
    const st = this.mvuStat();
    return { here: this.here(ctx), clock: this.clock(st), outfit: this.outfit(st), rosters: this.rosters(st), portraits: { ...this.portraits }, custom: this.readVars() };
  }
}
