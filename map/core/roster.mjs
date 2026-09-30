// CharacterRosterSystem（P3-B，docs/reviews/architecture_and_stream_perf.md §5）：多源名册统一装配。
// 名册与人物数据此前散在五个异构来源里，各自形状、各自的临时拼装（宿主 known 名单 flatMap、桥 rosters() 的兜底合并、
// 查看器各自认字段）。本模块把「接入」收敛成一个统一契约：
//
//   统一数据行（RosterRow）：
//     { name, displayName?, role?, location?, status?, tags?, source, present?, raw? }
//     name 标准化人名（空白归一、40 字内截断）；source ∈ SOURCES；present = 在场（计入 activeCount）；raw 透传来源原始行。
//
//   统一来源接口（Uniform Source Interface）：每个接入方实现 provider.rows(ctx): RosterRow[]，
//   经 system.use(source, provider) 登记。五个内置来源与优先级（冲突时高者为准）：
//     'mvu'      MVU 变量名册（mvu-bridge.mjs rosters() 的提取；实时状态，最高优先）
//     'chat'     聊天正文 ⌖人物 标签（context.mjs 流水线的消息窗口）
//     'table-db' 表格数据库插件人物表（shujuku.mjs，只读持久化）
//     'fallback' 卡片初始保底名册（mvu.mjs FALLBACK_MEMBERS；无数据场景的初始展示）
//     'baibai'   柏宝绘外貌与立绘库（baibai.mjs characters().list）
//
//   合并仲裁：同一人（标准化同名，或与已登记别名互认）合一行；字段级别高优先级来源的非空值胜出、空值让位给低优先级，
//   tags 并集去重，raw 浅合并（高优先级键胜）。来源差异到行为止——UI / 查看器拿合并后的标准行，不再认来源。
//
//   立绘挂载：attachPortraits(map) 按标准姓名（含别名）把立绘 / CG 挂到行上（row.portrait），名单里没有的人安静跳过；
//   describe().unmappedPortraits 报告挂不上的立绘数。标准化摘要契约：describe(): { total, activeCount, sourceCounts, unmappedPortraits }。
//
// 纯函数 / 纯类：不碰 DOM、不碰酒馆全局、不碰存储（tests/character_roster.test.mjs 机检）。
// 宿主接线在 mvu-bridge.mjs（桥注册 mvu / table-db / fallback 三个来源）+ tavern/eden-map.js（宿主注册 chat / baibai）；
// 发给查看器的 eden-map:chars 载荷：rosters 仍出自桥的 rosters()（向后兼容），各组另以 groups 逐组发出（桥 groupsView）。

/** 内置来源与优先级序（下标越大优先级越高；baibai 只补别人没有的） */
export const SOURCES = ['mvu', 'chat', 'table-db', 'fallback', 'baibai'];

/** 标准化人名：空白归一、去首尾、40 字内截断（与人物栏 mvu.mjs 的名字上限一致） */
export const normName = s => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
const clean = v => { const s = String(v ?? '').trim(); return !s || s === 'undefined' || s === 'null' ? '' : s.slice(0, 200); };

// ---------------- 五个来源的行适配（来源各自的原始形状 → RosterRow） ----------------

/** MVU 名册（mvu-bridge rosters() 的 { <组 id>: 表 | null }）→ 行；presentId = 在场组的 id（缺省 'present'）。
 *  在场组的人 status '在场' + present；其余各组 identity → role，阶段 / 等级进 tags。
 *  src '设定' 的兜底行跳过——它们由 fallback 来源供给（来源账目不混，合并结果不变）。 */
export function mvuRows(rosters, presentId = 'present') {
  const out = [];
  if (!rosters || typeof rosters !== 'object') return out;
  for (const g of Object.keys(rosters)) {
    const t = rosters[g];
    if (!t || typeof t !== 'object' || !Array.isArray(t.items)) continue;
    for (const it of t.items) {
      if (!it || typeof it !== 'object' || it.src === '设定') continue;
      const name = normName(it.name); if (!name) continue;
      const role = clean(it.identity), stage = clean(it.stage), grade = clean(it.grade);
      const tags = [stage, grade].filter(Boolean);
      out.push({
        name, source: 'mvu', ...(role ? { role } : {}),
        ...(g === presentId ? { status: '在场', present: true } : {}),
        ...(tags.length ? { tags } : {}), raw: it,
      });
    }
  }
  return out;
}

/** 位置行（聊天 ⌖人物 标签 / 表格数据库人物表的 [{ name, place }]）→ 行；source = 'chat' | 'table-db' */
export function placeRows(list, source) {
  const out = [];
  for (const it of Array.isArray(list) ? list : []) {
    const name = normName(it?.name); if (!name) continue;
    out.push({ name, ...(clean(it.place) ? { location: clean(it.place) } : {}), source });
  }
  return out;
}

/** 卡片保底名册（FALLBACK_MEMBERS / [{ name, identity }]）→ 行 */
export function fallbackRows(members) {
  const out = [];
  for (const m of Array.isArray(members) ? members : []) {
    const name = normName(m?.name); if (!name) continue;
    out.push({ name, ...(clean(m.identity) ? { role: clean(m.identity) } : {}), source: 'fallback', raw: m });
  }
  return out;
}

/** 柏宝绘外貌库（baibai.characters().list）→ 行；外貌 / tag 原样进 raw，UI 按名取用 */
export function baibaiRows(list) {
  const out = [];
  for (const c of Array.isArray(list) ? list : []) {
    const name = normName(c?.name); if (!name) continue;
    out.push({ name, source: 'baibai', raw: c });
  }
  return out;
}

// ---------------- 装配系统 ----------------

export class RosterSystem {
  constructor() {
    this.#providers = new Map();   // source → { provider, priority }
    this.#portraits = null;        // attachPortraits 挂进来的 { 人名: 立绘地址 }
  }
  #providers; #portraits;

  /** 登记一个来源（同源重复登记 = 替换）。provider 必须有 rows(ctx)。priority 缺省按 SOURCES 序（越靠前越权威），未知来源排在所有内置之后 */
  use(source, provider, opts = {}) {
    if (typeof source !== 'string' || !source) return false;
    if (!provider || typeof provider.rows !== 'function') return false;
    const i = SOURCES.indexOf(source);
    const priority = Number.isInteger(opts.priority) ? opts.priority : (i >= 0 ? SOURCES.length - i : -(this.#providers.size + 1));
    this.#providers.set(source, { provider, priority });
    return true;
  }

  /** 按优先级高 → 低拉全各行（防御性：单源抛错 / 返回非数组只废自己一个来源） */
  #pull(ctx) {
    const out = [];
    for (const [, { provider }] of [...this.#providers.entries()].sort((a, b) => b[1].priority - a[1].priority)) {
      let rows;
      try { rows = provider.rows(ctx || {}); } catch (e) { rows = null; }
      if (!Array.isArray(rows)) continue;
      for (const r of rows) { const n = this.#norm(r); if (n) out.push(n); }
    }
    return out;
  }

  /** 任意来源行 → 标准行；没有 name 的丢弃。place / identity 是两个常见来源别名，顺手认掉 */
  #norm(r) {
    if (!r || typeof r !== 'object') return null;
    const name = normName(r.name); if (!name) return null;
    const row = { name, source: r.source };
    const role = clean(r.role ?? r.identity); if (role) row.role = role;
    const loc = clean(r.location ?? r.place); if (loc) row.location = loc;
    const st = clean(r.status); if (st) row.status = st;
    const dn = normName(r.displayName); if (dn && dn !== name) row.displayName = dn;
    if (Array.isArray(r.tags)) { const t = [...new Set(r.tags.map(clean).filter(Boolean))]; if (t.length) row.tags = t; }
    if (r.present) { row.present = true; if (!row.status) row.status = '在场'; }
    if (r.raw && typeof r.raw === 'object') row.raw = r.raw;
    if (SOURCES.includes(row.source)) return row;
    row.source = 'fallback';   // 非内置来源标不了账：归入保底档，不让脏 source 流出去
    return row;
  }

  /** 合并后的标准行（每次现算，不缓存）。别名互认：行名撞上已登记行的 displayName（或反之）并入那一行 */
  rows(ctx) {
    const merged = new Map(), alias = new Map();
    for (const r of this.#pull(ctx)) {
      let key = r.name;
      if (!merged.has(key) && alias.has(key)) key = alias.get(key);   // 这个人按别名登记过
      const t = merged.get(key);
      if (!t) {
        merged.set(key, { ...r });
        if (r.displayName) alias.set(r.displayName, key);
        continue;
      }
      for (const k of ['displayName', 'role', 'location', 'status']) if (!t[k] && r[k]) t[k] = r[k];   // 高优先级空缺才让位
      if (r.present) { t.present = true; if (!t.status) t.status = '在场'; }
      if (r.tags?.length) t.tags = [...new Set([...(t.tags || []), ...r.tags])];
      if (r.raw && typeof r.raw === 'object') t.raw = { ...r.raw, ...(typeof t.raw === 'object' && t.raw ? t.raw : {}) };
    }
    const rows = [...merged.values()];
    this.#attach(rows);
    return rows;
  }

  /** 已登记所有人的标准名（宿主给人物栏做短名对齐用） */
  names(ctx) { return this.rows(ctx).map(r => r.name); }

  /** 立绘 / CG 按标准姓名挂载（含别名匹配）；名单里没有的人安静跳过，重复调用 = 整体替换 */
  attachPortraits(map) { this.#portraits = map && typeof map === 'object' && !Array.isArray(map) ? map : null; }

  /** 给一批行挂 portrait；返回没挂上的人名数（describe 的 unmappedPortraits）。纯读 #portraits，可重复调用 */
  #attach(rows) {
    const p = this.#portraits;
    if (!p) return 0;
    const left = new Map();
    for (const [k, v] of Object.entries(p)) { const n = normName(k); if (n && typeof v === 'string' && v) left.set(n, v); }
    for (const r of rows) {
      const hit = left.get(r.name) ?? (r.displayName ? left.get(r.displayName) : null);
      if (hit) { r.portrait = hit; left.delete(r.name); if (r.displayName) left.delete(r.displayName); }
    }
    return left.size;
  }

  /** 标准化摘要（单窗口上下文预算口径，arch-v2 §0 第 3 条）：{ total, activeCount, sourceCounts, unmappedPortraits } */
  describe(ctx) {
    const rows = this.rows(ctx);
    const sourceCounts = {};
    for (const s of SOURCES) sourceCounts[s] = 0;
    for (const r of rows) sourceCounts[r.source] = (sourceCounts[r.source] || 0) + 1;
    return { total: rows.length, activeCount: rows.filter(r => r.present).length, sourceCounts, unmappedPortraits: this.#attach(rows) };
  }
}
