// 四域状态结算账本（W11，docs/plans/llm-campaign.md）：地图侧的确定性物理事实 → 原子指令 → **四域独立校验**
// （资产 / 背包、NPC 坐标、世界事件、景深环境）→ 通过则分派到 LayerRegistry 的槽位；任何未验证或格式非法的
// 指令在解卷层直接丢弃并计数，绝不污染全局状态（机制口径：结构化变更优于自由文本；领域槽位解耦追踪：
// 四个子域各自校验，不让一个大 JSON 一次吞下去）。
// 六条纪律（后三条按参考卡《玄胤世界观》的状态结算引擎 / Canon Authority Gate 的逻辑对齐，见
// docs/plans/llm-campaign.md §9）：
//   ① 三个受限指令 OP_LOOT / OP_ROUTINE / OP_EVENT 以外的名字（含 OP_DEPTH 这类）一律丢弃——景深环境域
//      **只由本地确定性计算喂入**（envEntry），底层物理不交给大模型（零 Token 优先）。
//   ② throw-not-coerce（core/layer-registry.mjs normChain 同一口径）：字段类型 / 范围不对该条直接丢，绝不猜着转换。
//   ③ 漏项审计只补**单项**缺口 patch，不重写整表；语义不明确（认不出的东西 / 不在册的人）走待结算
//      （pending，保持旧值不猜值）。水位（claim）保证同一 patch 只发一次。
//   ④ **事实权威阶梯**（AUTHORITY）：陈述带着来源，但来源不等于真理——只有 canon / committed / verified 三级
//      授权转换能升格落盘；claim / hypothesis 一律停在待结算（玩家口述 / NPC 自称 / 假设句都不自证）。
//   ⑤ **只补别人没写的**：落盘里已有这一项（哪怕值不一样）就不覆盖——地图绝不与主 MVU / 卡内状态引擎抢写；
//      值不同记 stale-value 待结算，等主模型或卡那边确认。
//   ⑥ 待结算跨轮携带（carry，≤cap）与分支纪律（回退剪掉未来、同楼换分支作废本楼水位）。
// 每条 patch 带 why（凭据：为什么允许这一次升格），写盘前用 stripWhy 剥掉——凭据只用于审计与日志。
// 纯模块：数据进、计划出；不碰 DOM / 宿主全局 / 存储 / 网络（看门狗机检）；node 单测 tests/ledger_disentangle.test.mjs。
import { SLOTS, slotZ } from './layer-registry.mjs';
import { seedOf } from './rng.mjs';
import { exactWords } from './vocab.mjs';

/** 四个结算子域（顺序即分账顺序，稳定输出用） */
export const DOMAINS = ['assets', 'npc', 'events', 'depth'];
/** 域 → LayerRegistry 槽位（P3-C 契约；写错在模块加载时就炸，不留到运行期） */
export const SLOT_OF = Object.freeze({ assets: 'markers', npc: 'labels', events: 'events', depth: 'depth-haze' });
/** 受限 DSL：v1 就这三个（第四个域没有指令形） */
export const LEDGER_OPS = ['OP_LOOT', 'OP_ROUTINE', 'OP_EVENT'];
export const MAX_OPS = 3;         // 一拍最多解卷几个指令（多出来的丢弃并计数）
export const MAX_TEXT = 40;       // 名字 / 房间名截断
const MAX_ARG = 400;              // 一条指令的参数区最长扫描长度（防拖尾噪声连坐）

const DOMAIN_OF = Object.freeze({ OP_LOOT: 'assets', OP_ROUTINE: 'npc', OP_EVENT: 'events' });
/** 域 → 中文标签（注入摘要用；与 inventory.digestLine 同一口径，中文文案只出现在值里） */
export const DOMAIN_LABEL = Object.freeze({ assets: '资产/背包', npc: 'NPC坐标', events: '世界事件', depth: '景深环境' });
/** 世界事件类型白名单（通用词，不含任何卡片专有名词——卡的类型名由设定包 / events.mjs 那侧给） */
export const EVENT_TYPES = Object.freeze(['alert', 'pursuit', 'discovery', 'encounter', 'hazard', 'social']);
/**
 * 事实权威阶梯（纪律 ④，对照参考卡的 authority_order）：从高到低。陈述带来源，**来源不等于真理**——
 * canon（设定锁定）/ committed（已落盘的变量）/ verified（客观物理判定，地图侧事实默认这一级）可以升格；
 * claim（玩家口述 / NPC 自称）/ hypothesis（假设句、推演草案）只停在待结算，绝不自证。
 */
export const AUTHORITY = Object.freeze(['canon', 'committed', 'verified', 'claim', 'hypothesis']);
export const AUTHORITY_DEFAULT = 'verified';
/** 这条来源能不能升格落盘（认不出的来源 = 不能，fail-closed） */
export const promotable = src => { const i = AUTHORITY.indexOf(String(src ?? AUTHORITY_DEFAULT)); return i >= 0 && i <= AUTHORITY.indexOf('verified'); };
/** 事实行 / patch 上的来源字段（两个名字都认：authority 优先，src 次之） */
const srcOf = f => String(f?.authority ?? f?.src ?? AUTHORITY_DEFAULT);
/** 按 kind / op 推域（待结算行、外部事实行都可能只带 kind） */
const domainOfKind = f => DOMAIN_OF[f?.op] || (f?.kind === 'loot' ? 'assets' : f?.kind === 'routine' ? 'npc' : f?.kind === 'event' ? 'events' : null);

// 槽位契约在加载期对拍：SLOT_OF 里写的名字必须是 layers.SLOTS 的真成员（改槽位表会立刻炸这里）
for (const d of DOMAINS) { if (!SLOTS.includes(SLOT_OF[d])) throw new Error(`ledger: 域 ${d} 的槽位 ${SLOT_OF[d]} 不在 layers.SLOTS`); slotZ(SLOT_OF[d]); }

export const domainOf = op => DOMAIN_OF[op] || null;
export const slotOf = d => (DOMAINS.includes(d) ? SLOT_OF[d] : null);

const clip = (v, n) => [...String(v ?? '').trim()].slice(0, n).join('');
const isName = (v, n = MAX_TEXT) => typeof v === 'string' && clip(v, n).length >= 1;
const q3 = n => Math.round(n * 1000) / 1000;
/** 归一化坐标（0–1，y 向下；与 points / spatial-contract.mjs 同一套）；非有限或出界 → null（绝不夹取猜测） */
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
  const out = { domain: 'assets', op: 'OP_LOOT', id: String(f.id), name: clip(f.name, 60), key: factKey(f), why: '正文物理拾取 + 世界藏物表核对（verified）' };
  if (f.place) out.place = clip(f.place, 60);
  if (f.map) out.map = clip(f.map, 40);
  if (f.hidden) out.hidden = true;
  const q = Math.floor(Number(f.qty));
  if (Number.isFinite(q) && q > 1) out.qty = Math.min(999, q);
  return out;
}

/** 待结算行（带域与理由，供 carry 跨轮携带）：why 是**为什么不落盘**，不是不足的证据 */
const pendingRow = (f, key, why) => ({ domain: domainOfKind(f), kind: f.kind, key, why, ...(Number.isInteger(+f.floor) ? { floor: +f.floor } : {}) });

/**
 * 漏项审计器：地图物理事实 vs 宿主实际落盘状态，只补缺口。
 * facts：物理事实行 [{ kind:'loot', id, name, place?, map?, hidden?, qty?, floor?, authority? } |
 *                        { kind:'routine', npc, room, floor? } | { kind:'event', type, level, at, floor? }]
 *   authority / src 走纪律 ④ 的权威阶梯（缺省 verified = 地图侧客观物理判定）；claim / hypothesis 不落盘。
 * landed：宿主状态视图 { assets:{ id: 名 }, npc:{ npc: 房间 }, events:{ key: true } }（缺省 = 那一域无数据，不做断定）
 * 返回 { patches, pending, ok, keys }：
 *   - patches 只含**单项**缺口（资产域一行 / NPC 域一个位移 / 事件域一条），永不重写整表，每条带 why 凭据；
 *   - pending 是待结算（no-landed 那一域没视图 / not-promoted 来源不够 / unresolved 语义不明确 /
 *     unknown-npc 不在册 / stale-value 落盘里有值只是不一样）——保持旧值，不猜、不抢写；
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
    if (!promotable(srcOf(f))) { pending.push(pendingRow(f, key, 'not-promoted')); continue; }   // 纪律 ④：陈述不自证
    if (f.kind === 'loot') {
      if (!A) { pending.push(pendingRow(f, key, 'no-landed')); continue; }                  // 那一域没有落盘视图：不下断言
      if (Object.prototype.hasOwnProperty.call(A, String(f.id))) { ok++; continue; }          // 已经落盘，不重复写
      if (!String(f.id || '').trim() || !isName(f.name, 60)) { pending.push(pendingRow(f, key, 'unresolved')); continue; }
      patches.push(lootPatch(f));
    } else if (f.kind === 'routine') {
      const npc = String(f.npc || ''), room = String(f.room || '');
      if (!npc || !room) { pending.push(pendingRow(f, key, 'unresolved')); continue; }
      if (!N) { pending.push(pendingRow(f, key, 'no-landed')); continue; }
      if (Object.prototype.hasOwnProperty.call(N, npc)) {
        if (String(N[npc]) === room) { ok++; continue; }
        pending.push(pendingRow(f, key, 'stale-value'));   // 纪律 ⑤：落盘里已有值（哪怕不一样）→ 不覆盖，等那头确认
        continue;
      }
      pending.push(pendingRow(f, key, 'unknown-npc'));   // 不在册的人：可能只是还没登场，不替世界造人
    } else if (f.kind === 'event') {
      if (!EVENT_TYPES.includes(String(f.type))) { pending.push(pendingRow(f, key, 'unresolved')); continue; }
      if (!E) { pending.push(pendingRow(f, key, 'no-landed')); continue; }
      const k = [f.type, f.level ?? 0, Array.isArray(f.at) ? f.at.join(',') : ''].join('|');
      if (E[k]) { ok++; continue; }
      const at = Array.isArray(f.at) && f.at.length === 2 ? [c01(f.at[0]), c01(f.at[1])] : null;
      patches.push({ domain: 'events', op: 'OP_EVENT', type: String(f.type), level: Number.isInteger(f.level) ? f.level : 0, at: at && at[0] != null && at[1] != null ? at : null, key, why: '地图事件落点（verified）' });
    }
  }
  return { patches, pending, ok, keys };
}

/** 写盘形状：剥掉 why 凭据（凭据只进审计与日志，不进落盘数据——参考卡 stripWhy 同一口径） */
export function stripWhy(rows) {
  const one = r => { if (!r || typeof r !== 'object') return r; const { why, ...rest } = r; return rest; };
  return Array.isArray(rows) ? rows.map(one) : one(rows);
}

/**
 * 待结算跨轮携带（纪律 ⑥，对照参考卡的 pending-domain carry）：把本轮未决的**域**带进下一轮，
 * 上限 cap（参考卡取 4），跨聊天清空。返回携带的域数组（下一轮的注入 / 聚焦提示用它）。
 */
export function carry(state, pendings, { cap = 4 } = {}) {
  if (!state || typeof state !== 'object') state = { domains: [], floor: null };
  const out = [];
  for (const p of Array.isArray(pendings) ? pendings : []) {
    const d = p?.domain || domainOfKind(p);
    if (d && DOMAINS.includes(d) && !out.includes(d)) out.push(d);
  }
  state.domains = out.slice(0, Math.max(0, Math.round(+cap) || 0));
  return state.domains.slice();
}

/** 待结算一行的注入文案（一轮一行；没有待结算 → ''）。宿主把它并进既有注入数组，不开新通道。 */
export function carryLine(state, label = DOMAIN_LABEL) {
  const ds = (state?.domains || []).map(d => label[d] || d);
  return ds.length ? `[地图结算·待确认领域] ${ds.join('、')}` : '';
}

/**
 * 水位：同一 patch / 同一事实只放行一次（会话级 state = { claimed:[{key,floor,branch}], floor, branch }，宿主持有、原地更新）。
 * 分支纪律（纪律 ⑥，对照参考卡的 docket 分支策略）：
 *   - 回退（本轮的 floor 小于记录里的 floor）→ 剪掉未来：未来的补发作废（重写历史后不该再补旧账）；
 *   - 同一楼换了分支（branch 变 = swipe / 重生成）→ 该楼记录整批作废，重新结算；
 *   - 同楼同分支再跑 → 记录保留（幂等：同一件只补一次，也挡住「玩家用掉道具后被审计器复活」）。
 * 返回 { fresh, repeated, pruned }；同一批里的重复键也只留第一条。
 */
export function claim(state, rows, { floor = null, branch = null } = {}) {
  if (!state || !Array.isArray(state.claimed)) state = { claimed: [], floor: null, branch: null };
  const f = Number.isInteger(floor) ? floor : state.floor;
  const b = branch == null ? state.branch : String(branch);
  let pruned = 0;
  if (Number.isInteger(floor) && state.claimed.some(c => c && typeof c === 'object')) {
    const keep = [];
    for (const c of state.claimed) {
      if (!c || typeof c !== 'object') { keep.push(c); continue; }                    // 老格式（裸字符串键）：无从判断分支，保留
      if (c.floor > floor) { pruned++; continue; }                                     // 回退：未来作废
      if (c.floor === floor && String(c.branch) !== String(b)) { pruned++; continue; } // 同楼换分支：本楼作废
      keep.push(c);
    }
    state.claimed = keep;
  }
  state.floor = f ?? null; state.branch = b;
  const has = k => state.claimed.some(c => (typeof c === 'string' ? c : c?.key) === k);
  const fresh = [], seen = new Set();
  let repeated = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    const k = r?.key || factKey(r);
    if (!k || seen.has(k) || has(k)) { repeated++; continue; }
    seen.add(k); fresh.push(r);
  }
  state.claimed = state.claimed.concat(fresh.map(r => ({ key: r.key || factKey(r), floor: f ?? null, branch: b }))).slice(-200);   // 有界（长会话不涨内存）
  return { fresh, repeated, pruned };
}

// ---------------- 虚拟账本槽位（W12 / 任务一）：Schema 缺失自愈拦截 ----------------
// 老旧 / 非标卡片的 stat_data 里常常一个背包字段都没有，模型在 CoT 里判断「无处可写」就放弃更新，
// 于是客观物理事实（拾取）凭空消失。这里的拦截分两步，两步都**不写宿主 stat_data**：
//   ① 探路：宿主 stat_data 里认得出背包字段（词表见 core/vocab.mjs EXACT.inventory）就记住它的路径，拾取只补缺口、不重复写；
//   ② 认不出来 = 由地图自己声明一个**虚拟槽位**（随地图自己的 stash 存储，见 tavern/stash-store.mjs），捕获的增量强制落到那里，
//      下一轮把槽位与已知事实一起回注——事实永远有地方落，模型不必也不该去变量结构里新开字段。
// 为什么不在 stat_data 里 `stat_data.物品栏 ||= {}`：卡的 MVU 带 zod 结构，未知键会被丢掉还可能触发校验报错
// （docs/reviews/mvu_093/r1_author.md P1-2 原作者的明确要求；eden-map.js「不写进 stat_data」同一口径）。
// S6-2：槽位的形状改为 ASCII 键 { name, path, virtual, msgIndex, facts: { <id>: { name, msgIndex, place? } } }（docs/kernel-schema.md K-R74）。
/** 背包字段名候选（认得就用它当槽位名；认不出用第一个），大小写不敏感；词表在内核词表里 */
export const SLOT_KEYS = Object.freeze(exactWords('inventory'));
const SLOT_LOWER = SLOT_KEYS.map(k => k.toLowerCase());
const SLOT_DEPTH = 2;         // 探路深度：顶层 + 一层子表（「资产.物品栏」这种也认）
const MAX_FACTS = 200;        // 槽位账上最多记多少件（与 stash 行数上限同量级）
const plainObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const slotIndexOf = k => SLOT_LOWER.indexOf(String(k ?? '').toLowerCase());
const msgOf = v => (Number.isInteger(v) ? v : null);
/** 深度优先找一个能当背包用的字段：返回 { key, path } 或 null（只认对象值，字符串 / 数字不当容器） */
function findSlot(stat) {
  const walk = (o, pre, d) => {
    let best = null;
    for (const [k, v] of Object.entries(o)) {
      if (!plainObj(v)) continue;
      const i = slotIndexOf(k);
      if (i >= 0 && !best) best = { key: k, path: pre ? pre + '.' + k : k, rank: i };
      else if (i >= 0 && best && i < best.rank) best = { key: k, path: pre ? pre + '.' + k : k, rank: i };
      if (d < SLOT_DEPTH) { const deep = walk(v, pre ? pre + '.' + k : k, d + 1); if (deep && (!best || deep.rank < best.rank)) best = deep; }
    }
    return best;
  };
  return plainObj(stat) ? walk(stat, '', 1) : null;
}
/**
 * 槽位探测：入参是宿主 stat_data 快照（不传 = 空结构，按「无字段」算）。
 * 返回 { key, path, virtual }：virtual = true 表示宿主没有任何背包字段，槽位由地图自建。
 */
export function slotProbe(stat) {
  const hit = findSlot(stat);
  return hit ? { key: hit.key, path: hit.path, virtual: false } : { key: SLOT_KEYS[0], path: '', virtual: true };
}
/** 槽位声明（幂等、只补不覆盖）：prev = 上一轮的声明，probe = slotProbe 的结果。名 / 路径 / 虚拟性任一变了才换新声明 */
export function slotDeclare(prev, probe, msgIndex = null) {
  const p = typeof probe?.key === 'string' && probe.key ? probe : slotProbe(null);
  const cur = plainObj(prev) ? prev : null;
  if (cur && cur.name === p.key && cur.path === (p.path || '') && !!cur.virtual === !!p.virtual) return cur;
  return { name: p.key, path: p.path || '', virtual: !!p.virtual, msgIndex: msgOf(msgIndex) };
}
/** 增量写入（同 id 覆盖，绝不重写整表）：rows = [{ id, name | 名, place | 地点?, msgIndex | floor? }]；
 *  返回新的槽位对象（多一个 added = 这一批新增了几件）；没有合法行时原样返回。 */
export function slotPut(cur, rows, msgIndex = null) {
  const base = plainObj(cur) ? cur : slotDeclare(null, slotProbe(null), msgIndex);
  const facts = { ...(plainObj(base.facts) ? base.facts : {}) };
  let added = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    const id = clip(r?.id ?? r?.key, 40), name = clip(r?.name ?? r?.名, 60);
    if (!id || !name) continue;
    const row = { name, msgIndex: msgOf(r?.msgIndex) ?? msgOf(r?.floor) ?? msgOf(msgIndex) };
    const place = clip(r?.place ?? r?.地点, 60); if (place) row.place = place;
    if (!facts[id] || facts[id].name !== name || facts[id].place !== row.place) added++;   // 同名同址 = 已在账上，不算新增
    facts[id] = row;
  }
  return { ...base, facts, added };
}
/**
 * 槽位回注文案（一轮一行；没有槽位 → ''）。**只陈述地图自己的账本**，不点名卡里的字段：
 * 附加规则不许引用卡片的字段名（docs/reviews/mvu_093/r1_author.md P1-1），所以这里只说「有 / 没有槽位」与件数。
 */
export function slotLine(slot, cap = 120) {
  if (!plainObj(slot) || !slot.name) return '';
  const n = plainObj(slot.facts) ? Object.keys(slot.facts).length : 0;
  const out = slot.virtual
    ? `[地图账本·槽位] 本卡变量没有背包字段：地图已自建槽位「${slot.name}」，拾取事实一律记进地图账本（现 ${n} 件），不写变量也不会丢。`
    : `[地图账本·槽位] 本卡的背包栏由地图按缺口对齐（现 ${n} 件）；已有的不重复写。`;
  return out.length > cap ? out.slice(0, cap - 1) + '…' : out;
}
/** 槽位 → 落盘形状；没有名字或没有事实的槽位返回 null（不写空壳） */
export const slotSave = slot => (plainObj(slot) && slot.name && plainObj(slot.facts) && Object.keys(slot.facts).length ? slot : null);
/** 校验落盘的槽位（读回时用）：形状不对 → null；字段裁剪，最多 MAX_FACTS 件。 */
export function slotNorm(raw) {
  if (!plainObj(raw) || typeof raw.name !== 'string' || !raw.name.trim()) return null;
  const facts = {};
  for (const [id, f] of Object.entries(plainObj(raw.facts) ? raw.facts : {})) {
    if (Object.keys(facts).length >= MAX_FACTS) break;
    const k = clip(id, 40), name = clip(f?.name, 60);
    if (!k || !plainObj(f) || !name) continue;
    const row = { name, msgIndex: msgOf(f.msgIndex) }, place = clip(f.place, 60); if (place) row.place = place;
    facts[k] = row;
  }
  return { name: clip(raw.name, 60), path: clip(raw.path, 80), virtual: !!raw.virtual, msgIndex: msgOf(raw.msgIndex), facts };
}

/** 标准摘要（自检 / 设置页）：四域各自的槽位与条数、丢弃数、水位与待结算携带 */
export function describe(plan, state = null, carryState = null) {
  const counts = {};
  for (const d of DOMAINS) counts[d] = (plan?.domains?.[d] || []).length;
  return {
    domains: DOMAINS.map(d => ({ domain: d, slot: SLOT_OF[d], n: counts[d] })),
    dropped: plan?.dropped?.total || 0, floor: state?.floor ?? null, claimed: state?.claimed?.length || 0,
    branch: state?.branch ?? null, carried: carryState?.domains || [],
  };
}

export const Ledger = { DOMAINS, SLOT_OF, DOMAIN_LABEL, OPS: LEDGER_OPS, MAX_OPS, EVENT_TYPES, AUTHORITY, AUTHORITY_DEFAULT, promotable,
  domainOf, slotOf, unmarshal, envEntry, dispatch, factKey, audit, stripWhy, carry, carryLine, claim, describe,
  SLOT_KEYS, slotProbe, slotDeclare, slotPut, slotLine, slotSave, slotNorm };
