// 四域状态结算账本（W11，docs/plans/llm-campaign.md）：地图侧的确定性物理事实 → 原子指令 → **四域独立校验**
// （资产 / 背包、NPC 坐标、世界事件、景深环境）→ 通过则分派到 LayerRegistry 的槽位；任何未验证或格式非法的
// 指令在解卷层直接丢弃并计数，绝不污染全局状态（对照 WorldCoder：结构化变更优于自由文本；对照 DST 分账：
// 四个子域各自校验，不让一个大 JSON 一次吞下去）。
// 三条纪律：
//   ① 三个受限指令 OP_LOOT / OP_ROUTINE / OP_EVENT 以外的名字（含 OP_DEPTH 这类）一律丢弃——景深环境域
//      **只由本地确定性计算喂入**（envEntry），底层物理不交给大模型（零 Token 优先）。
//   ② throw-not-coerce（core/layers.mjs normChain 同一口径）：字段类型 / 范围不对该条直接丢，绝不猜着转换。
//   ③ 漏项审计只补**单项**缺口 patch，不重写整表；语义不明确（认不出的东西 / 不在册的人）走待结算
//      （pending，保持旧值不猜值）。水位（claim）保证同一 patch 只发一次。
// 纯模块：数据进、计划出；不碰 DOM / 宿主全局 / 存储 / 网络（看门狗机检）；node 单测 tests/ledger_disentangle.test.mjs。
import { SLOTS, slotZ } from './layers.mjs';
import { seedOf } from './rng.mjs';

/** 四个结算子域（顺序即分账顺序，稳定输出用） */
export const DOMAINS = ['assets', 'npc', 'events', 'depth'];
/** 域 → LayerRegistry 槽位（P3-C 契约；写错在模块加载时就炸，不留到运行期） */
export const SLOT_OF = Object.freeze({ assets: 'markers', npc: 'labels', events: 'events', depth: 'depth-haze' });
/** 受限 DSL：v1 就这三个（第四个域没有指令形） */
export const OPS = ['OP_LOOT', 'OP_ROUTINE', 'OP_EVENT'];
export const MAX_OPS = 3;         // 一拍最多解卷几个指令（多出来的丢弃并计数）
export const MAX_TEXT = 40;       // 名字 / 房间名截断
const MAX_ARG = 400;              // 一条指令的参数区最长扫描长度（防拖尾噪声连坐）

const DOMAIN_OF = Object.freeze({ OP_LOOT: 'assets', OP_ROUTINE: 'npc', OP_EVENT: 'events' });
/** 世界事件类型白名单（通用词，不含任何卡片专有名词——卡的类型名由设定包 / events.mjs 那侧给） */
export const EVENT_TYPES = Object.freeze(['alert', 'pursuit', 'discovery', 'encounter', 'hazard', 'social']);

// 槽位契约在加载期对拍：SLOT_OF 里写的名字必须是 layers.SLOTS 的真成员（改槽位表会立刻炸这里）
for (const d of DOMAINS) { if (!SLOTS.includes(SLOT_OF[d])) throw new Error(`ledger: 域 ${d} 的槽位 ${SLOT_OF[d]} 不在 layers.SLOTS`); slotZ(SLOT_OF[d]); }

export const domainOf = op => DOMAIN_OF[op] || null;
export const slotOf = d => (DOMAINS.includes(d) ? SLOT_OF[d] : null);

const clip = (v, n) => [...String(v ?? '').trim()].slice(0, n).join('');
const isName = (v, n = MAX_TEXT) => typeof v === 'string' && clip(v, n).length >= 1;
const q3 = n => Math.round(n * 1000) / 1000;
/** 归一化坐标（0–1，y 向下；与 points / spatial.mjs 同一套）；非有限或出界 → null（绝不夹取猜测） */
const c01 = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 1 ? q3(n) : null; };
/** 比率（0–1）：雾 / 霾浓度、DC 之外的强度量 */
const r01 = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 1 ? q3(n) : null; };

/** 引号配对表（'…' "…" “…”。引号内允许逗号；不解析嵌套结构，嵌套括号在配对阶段已排除） */
const QUOTE_PAIR = { "'": "'", '"': '"', '\u201c': '\u201d', '\u300c': '\u300d' };
/** 括号内参数区 → 参数数组（裸词与引号词混用；每段两侧空白剥掉） */
function splitArgs(body) {
  const out = []; let cur = '', q = '';
  for (const c of String(body)) {
    if (q) { if (c === q) q = ''; else cur += c; continue; }
    if (QUOTE_PAIR[c]) { q = QUOTE_PAIR[c]; continue; }
    if (c === ',') { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** 各指令的字段校验（throw-not-coerce：缺 / 错类型就 throw，由 unmarshal 捕获并按域计数丢弃） */
const CHECK = {
  OP_LOOT: a => {
    const [id, x, y] = a;
    if (!isName(id) || typeof id !== 'string' || /\s/.test(id)) throw new TypeError('ledger: OP_LOOT 的 item_id 必须是无空白的非空字符串');
    const ax = c01(x), ay = c01(y);
    if (ax == null || ay == null) throw new TypeError('ledger: OP_LOOT 的坐标必须是 0–1 的数值');
    return { domain: 'assets', op: 'OP_LOOT', id: clip(id, MAX_TEXT), at: [ax, ay] };
  },
  OP_ROUTINE: a => {
    const [npc, room] = a;
    if (!isName(npc) || !isName(room)) throw new TypeError('ledger: OP_ROUTINE 需要 npc_id 与 target_room');
    return { domain: 'npc', op: 'OP_ROUTINE', npc: clip(npc, MAX_TEXT), room: clip(room, MAX_TEXT) };
  },
  OP_EVENT: a => {
    const [type, level, x, y] = a;
    if (!EVENT_TYPES.includes(String(type))) throw new TypeError('ledger: OP_EVENT 的 type 不在白名单');
    const lv = Number(level);
    if (!Number.isInteger(lv) || lv < 0 || lv > 3) throw new TypeError('ledger: OP_EVENT 的 level 必须是 0–3 的整数');
    const ax = c01(x), ay = c01(y);
    if (ax == null || ay == null) throw new TypeError('ledger: OP_EVENT 的坐标必须是 0–1 的数值');
    return { domain: 'events', op: 'OP_EVENT', type: String(type), level: lv, at: [ax, ay] };
  },
};

/**
 * 解卷：文本里的 `OP_XXX(a, b, …)` 微语法 → 四域分账计划。
 * 返回 { domains:{assets,npc,events,depth}, dropped:{各域, total}, hash }；同名指令按出现顺序保序。
 * 第四域（景深环境）不由文本喂入：只认 ctx.env 的本地确定性事实（envEntry），文本里写 OP_DEPTH 之类会被丢弃。
 */
export function unmarshal(text, ctx = {}) {
  const s = String(text || '');
  const domains = { assets: [], npc: [], events: [], depth: [] };
  const dropped = { assets: 0, npc: 0, events: 0, depth: 0, total: 0 };
  const re = /OP_([A-Z_]+)\s*\(/g;
  let n = 0;
  for (let m; (m = re.exec(s));) {
    const name = 'OP_' + m[1];
    const body = s.slice(re.lastIndex);
    let end = -1, depth = 1;
    for (let i = 0, cap = Math.min(body.length, MAX_ARG); i < cap; i++) {
      const c = body[i];
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (!depth) { end = i; break; } }
    }
    if (end < 0) { dropped.total++; break; }        // 括号没闭合：整段到此为止（防一条坏指令连坐后面全部）
    re.lastIndex += end + 1;
    const dom = domainOf(name);
    if (n >= MAX_OPS) { dropped.total++; if (dom) dropped[dom]++; continue; }   // 每拍上限
    if (!dom) { dropped.total++; continue; }                                     // 白名单之外（含 OP_DEPTH）→ 丢弃
    let entry = null;
    try { entry = CHECK[name](splitArgs(body.slice(0, end))); } catch (e) { entry = null; }
    if (!entry) { dropped[dom]++; dropped.total++; continue; }
    domains[entry.domain].push(entry); n++;
  }
  const env = envEntry(ctx.env); if (env) domains.depth.push(env);
  return { domains, dropped, hash: s ? seedOf(s).toString(36) : '' };
}

/**
 * 景深环境域的**唯一**入口（本地确定性事实，不由 DSL 喂）：{ fog?, haze?, tod? }。
 * fog / haze 是 core/depth.describe() 的 exploredRatio / currentHaze（0–1 比率），tod 是时段名。
 * 三项全缺 → null（宁缺毋滥，不产出空指令）。
 */
export function envEntry(env) {
  if (!env || typeof env !== 'object') return null;
  const fog = r01(env.fog), haze = r01(env.haze);
  const tod = typeof env.tod === 'string' ? clip(env.tod, 12) : '';
  if (fog == null && haze == null && !tod) return null;
  return { domain: 'depth', op: 'OP_ENV', ...(fog != null ? { fog } : {}), ...(haze != null ? { haze } : {}), ...(tod ? { tod } : {}) };
}

/** 计划 → 分域投递：{ domain, slot, entries }[]（槽位隔离分发；宿主 / 查看器只按自己的槽位取） */
export function dispatch(plan) {
  return DOMAINS.map(d => ({ domain: d, slot: SLOT_OF[d], entries: (plan?.domains?.[d] || []).map(e => ({ ...e })) }));
}

/** 一条物理事实的稳定键（水位 / 去重用）：三个域同一口径，纯字符串拼接，不依赖对象键序 */
export function factKey(f) {
  const k = f?.kind || f?.op || '', id = f?.id || f?.npc || f?.type || '';
  const at = Array.isArray(f?.at) && f.at.length === 2 ? f.at.join(',') : '';
  return [k, id, f?.place || f?.room || '', at, f?.floor ?? ''].join('|');
}

/** 物化一条缺口 patch 的形状：资产域补的是一行**完整单项**（inventory.put 口径），不是整表 */
function lootPatch(f) {
  const out = { domain: 'assets', op: 'OP_LOOT', id: String(f.id), name: clip(f.name, 60), key: factKey(f) };
  if (f.place) out.place = clip(f.place, 60);
  if (f.map) out.map = clip(f.map, 40);
  if (f.hidden) out.hidden = true;
  const q = Math.floor(Number(f.qty));
  if (Number.isFinite(q) && q > 1) out.qty = Math.min(999, q);
  return out;
}

/**
 * 漏项审计器：地图物理事实 vs 宿主实际落盘状态，只补缺口。
 * facts：物理事实行 [{ kind:'loot', id, name, place?, map?, hidden?, qty?, floor? } | { kind:'routine', npc, room, floor? } |
 *                        { kind:'event', type, level, at, floor? }]
 * landed：宿主状态视图 { assets:{ id: 名 }, npc:{ npc: 房间 }, events:{ key: true } }（缺省 = 那一域无数据，不做断定）
 * 返回 { patches, pending, ok, keys }：
 *   - patches 只含**单项**缺口（资产域一行 / NPC 域一个位移 / 事件域一条），永不重写整表；
 *   - pending 是待结算（语义不明确：认不出的东西、不在册的人）——保持旧值，不猜；
 *   - ok = 已落盘无需补的条数；keys = 本轮考量的全部事实键（水位用）。
 */
export function audit(facts, landed = {}) {
  const A = landed?.assets && typeof landed.assets === 'object' ? landed.assets : null;
  const N = landed?.npc && typeof landed.npc === 'object' ? landed.npc : null;
  const E = landed?.events && typeof landed.events === 'object' ? landed.events : null;
  const patches = [], pending = [], keys = [];
  let ok = 0;
  for (const f of Array.isArray(facts) ? facts : []) {
    if (!f || typeof f !== 'object') continue;
    const key = factKey(f); keys.push(key);
    if (f.kind === 'loot') {
      if (!A) { pending.push({ ...f, key, why: 'no-landed' }); continue; }                  // 那一域没有落盘视图：不下断言
      if (Object.prototype.hasOwnProperty.call(A, String(f.id))) { ok++; continue; }          // 已经落盘，不重复写
      if (!String(f.id || '').trim() || !isName(f.name, 60)) { pending.push({ ...f, key, why: 'unresolved' }); continue; }
      patches.push(lootPatch(f));
    } else if (f.kind === 'routine') {
      const npc = String(f.npc || ''), room = String(f.room || '');
      if (!npc || !room) { pending.push({ ...f, key, why: 'unresolved' }); continue; }
      if (!N) { pending.push({ ...f, key, why: 'no-landed' }); continue; }
      if (Object.prototype.hasOwnProperty.call(N, npc)) {
        if (String(N[npc]) === room) { ok++; continue; }
        patches.push({ domain: 'npc', op: 'OP_ROUTINE', npc: clip(npc, MAX_TEXT), room: clip(room, MAX_TEXT), key });
        continue;
      }
      pending.push({ ...f, key, why: 'unknown-npc' });   // 不在册的人：可能只是还没登场，不替世界造人
    } else if (f.kind === 'event') {
      if (!EVENT_TYPES.includes(String(f.type))) { pending.push({ ...f, key, why: 'unresolved' }); continue; }
      if (!E) { pending.push({ ...f, key, why: 'no-landed' }); continue; }
      const k = [f.type, f.level ?? 0, Array.isArray(f.at) ? f.at.join(',') : ''].join('|');
      if (E[k]) { ok++; continue; }
      const at = Array.isArray(f.at) && f.at.length === 2 ? [c01(f.at[0]), c01(f.at[1])] : null;
      patches.push({ domain: 'events', op: 'OP_EVENT', type: String(f.type), level: Number.isInteger(f.level) ? f.level : 0, at: at && at[0] != null && at[1] != null ? at : null, key });
    }
  }
  return { patches, pending, ok, keys };
}

/**
 * 水位：同一 patch / 同一事实只放行一次（会话级 state = { claimed:[], floor }，宿主持有、原地更新）。
 * 返回 { fresh, repeated }；同一批里的重复键也只留第一条。
 */
export function claim(state, rows, { floor = null } = {}) {
  if (!state || !Array.isArray(state.claimed)) state = { claimed: [], floor: null };
  if (Number.isInteger(floor)) state.floor = floor;
  const fresh = [], seen = new Set();
  let repeated = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    const k = r?.key || factKey(r);
    if (!k || seen.has(k) || state.claimed.includes(k)) { repeated++; continue; }
    seen.add(k); fresh.push(r);
  }
  state.claimed = state.claimed.concat(fresh.map(r => r.key || factKey(r))).slice(-200);   // 有界（长会话不涨内存）
  return { fresh, repeated };
}

/** 标准摘要（自检 / 设置页）：四域各自的槽位与条数、丢弃数、待结指数 */
export function describe(plan, state = null) {
  const counts = {};
  for (const d of DOMAINS) counts[d] = (plan?.domains?.[d] || []).length;
  return {
    domains: DOMAINS.map(d => ({ domain: d, slot: SLOT_OF[d], n: counts[d] })),
    dropped: plan?.dropped?.total || 0, floor: state?.floor ?? null, claimed: state?.claimed?.length || 0,
  };
}

export const Ledger = { DOMAINS, SLOT_OF, OPS, MAX_OPS, EVENT_TYPES, domainOf, slotOf, unmarshal, envEntry, dispatch, factKey, audit, claim, describe };
