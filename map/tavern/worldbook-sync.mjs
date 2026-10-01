// 世界书附加条目：写入 / 自动同步（docs/tavernhelper-audit.md A1；node 单测 tests/worldbook-sync.test.mjs）。
// 只动我们自己的一本书 BOOK（名字前缀取自包清单，见下面的 setPrefix）；永不改别的书、永不改卡自带世界书。写之前先给差异，用户点了才写。
// 条目内容随地图从 CDN 发（map/data/worldbook_addon.json，tools/build_worldbook_addon.py --ship 生成，按版本 ver 标记）。
// 每个我们的条目在 extra 里带 { eden_id: 稳定编号, eden_ver: 写入时的版本, eden_hash: 写入时内容的指纹 }：
//   - 按 eden_id 对应（名字可以被用户改）；
//   - 现有内容指纹 ≠ eden_hash → 用户改过，保留不覆盖（差异里列出来）；
//   - 没有 eden_id 的条目 = 用户自己加的，原样保留；
//   - 新版不再发的我们的条目 → 停用，不删。
// 绑定（全局 / 角色 / 聊天）：已经绑在哪里就保持；第一次由用户选；旧的带版本号的书（手动导入的「… v0.9.5」）可迁移到稳定名并按原绑定重绑，旧书默认留着，用户再确认才删。
// 书名 = 包的前缀（清单 worldbook.prefix，没写 = 包标题）+「·世界书附加条目」；宿主读到清单后调 setPrefix（没调用前是中性默认）。后缀是文案，留给 S4-4。
const SUFFIX = '世界书附加条目', reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export let PREFIX = 'Map·';
export let BOOK = PREFIX + SUFFIX;
export let LEGACY_RE = new RegExp('^' + reEsc(BOOK) + '\\s*v\\d[\\w.+-]*$');   // 手动导入的旧书：「<书名> v0.9.5」
export function setPrefix(p) {
  const v = String(p ?? '').trim(); if (!v) return BOOK;
  PREFIX = v + '·'; BOOK = PREFIX + SUFFIX; LEGACY_RE = new RegExp('^' + reEsc(BOOK) + '\\s*v\\d[\\w.+-]*$'); return BOOK;
}

export function hashText(s) { let h = 2166136261; for (const c of String(s ?? '')) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); }
const arr = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);
const own = e => e && typeof e === 'object' && e.extra && typeof e.extra.eden_id === 'string';

/** CDN 上的发布物 → { ver, aliases, entries: [TH 条目（部分字段）+ extra] }。aliases 单一来源 map/data/worldbook_aliases.json（build_worldbook_addon.py --ship 嵌进发布物） */
export function shipped(ship) {
  if (!ship || typeof ship.ver !== 'string' || !Array.isArray(ship.entries)) return null;
  const ids = ship.aliases && typeof ship.aliases.ids === 'object' && ship.aliases.ids ? ship.aliases.ids : {};
  return { ver: ship.ver, version: ship.version || '', aliases: { ids }, entries: ship.entries.filter(e => e && typeof e.id === 'string').map(e => {
    const { id, ...rest } = e; return { ...rest, extra: { eden_id: id, eden_ver: ship.ver, eden_hash: hashText(e.content) } }; }) };
}
/** 已装书的版本标记：我们的条目里最多的那个 eden_ver */
export function installedVer(entries) {
  const n = {}; for (const e of arr(entries)) if (own(e) && e.extra.eden_ver) n[e.extra.eden_ver] = (n[e.extra.eden_ver] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}
const edited = e => own(e) && e.extra.eden_hash && hashText(e.content) !== e.extra.eden_hash;
export const RETIRED_ORDER = 1;   // 退役条目：不删、不停用，只把插入顺序降到最低（旧聊天仍可能用到）
/** 旧编号 → 新编号（别名表可以连环：a→b→c；有环就停） */
function resolveId(id, ids) { const seen = new Set(); while (ids[id] && !seen.has(id)) { seen.add(id); id = ids[id]; } return id; }
/** 现有条目：别名换成新编号，按编号分组；每组一个「主条目」（优先没改过的），其余：没改过的重复 → 丢，改过的 → 留（绝不删用户改过的内容） */
function normalize(cur, S) {
  const ids = S.aliases.ids, out = [], prim = new Map(), extras = [];
  for (const c0 of cur) {
    if (!own(c0)) { out.push({ c: c0 }); continue; }
    const nid = resolveId(c0.extra.eden_id, ids), c = nid === c0.extra.eden_id ? c0 : { ...c0, extra: { ...c0.extra, eden_id: nid } };
    const p = prim.get(nid);
    if (!p) { const slot = { c }; prim.set(nid, slot); out.push(slot); continue; }
    if (edited(p.c) && !edited(c)) { extras.push(p.c); p.c = c; continue; }   // 没改过的那份当主条目，改过的留作额外一份
    if (edited(c)) extras.push(c);                                             // 没改过的重复：丢
  }
  return { list: out.map(x => x.c), extras, prim };
}
const conflictOf = (c, e) => edited(c) && hashText(c.content) !== e.extra.eden_hash && c.extra.eden_hash !== e.extra.eden_hash;

/** 差异：installed = 现有条目数组或 null（书不存在） */
export function plan(installed, ship) {
  const S = shipped(ship); if (!S) return null;
  const cur = installed ? arr(installed) : null, N = normalize(cur || [], S), byId = new Map(N.list.filter(own).map(e => [e.extra.eden_id, e]));
  const out = { first: !cur, from: cur ? installedVer(cur) : null, to: S.ver, version: S.version, add: [], update: [], keep: [], conflict: [], same: [], retire: [], dup: 0, alias: 0, user: 0 };
  for (const c of cur || []) if (own(c) && resolveId(c.extra.eden_id, S.aliases.ids) !== c.extra.eden_id) out.alias++;
  out.dup = (cur || []).filter(own).length - N.list.filter(own).length - N.extras.length;   // 丢掉的（没改过的）重复条数
  let flag = 0;
  for (const e of S.entries) {
    const c = byId.get(e.extra.eden_id);
    if (!c) out.add.push(e.name);
    else if (edited(c) && hashText(c.content) !== e.extra.eden_hash) { const k = conflictOf(c, e); (k ? out.conflict : out.keep).push(c.name || e.name); if (k ? c.extra.eden_conflict?.hash !== e.extra.eden_hash : !!c.extra.eden_conflict) flag++; }
    else if (c.content === e.content && c.name === e.name && !c.extra.eden_retired && !c.extra.eden_conflict && !c.extra.eden_dup && c.extra.eden_hash === e.extra.eden_hash) out.same.push(e.name);   // 只有版本标记不同：写时顺手更新标记
    else out.update.push(e.name);
  }
  const ids = new Set(S.entries.map(e => e.extra.eden_id));
  for (const c of cur || []) if (!own(c)) out.user++;
  for (const c of N.list) if (own(c) && !ids.has(c.extra.eden_id) && !c.extra.eden_retired) out.retire.push(c.name);
  out.changed = out.first || out.add.length + out.update.length + out.retire.length + out.alias + out.dup > 0 || out.from !== S.ver || flag > 0 || N.extras.some(c => !c.extra.eden_dup);
  return out;
}
const lowered = (c, ver) => ({ ...c, position: { ...(c.position || {}), order: RETIRED_ORDER }, extra: { ...c.extra, eden_retired: c.extra.eden_retired || ver, eden_order: c.extra.eden_order ?? c.position?.order ?? null } });
/** 把发布物合进现有条目（updateWorldbookWith 的 updater 用）：保留用户条目、用户改过的条目、用户的启用开关与 uid；幂等（再跑一次结果不变） */
export function merge(installed, ship) {
  const S = shipped(ship); if (!S) return arr(installed);
  const N = normalize(arr(installed), S), byId = new Map(S.entries.map(e => [e.extra.eden_id, e])), seen = new Set(), out = [];
  for (const c of N.list) {
    if (!own(c)) { out.push(c); continue; }
    const e = byId.get(c.extra.eden_id); seen.add(c.extra.eden_id);
    if (!e) { out.push(lowered(c, S.ver)); continue; }                               // 新版不再发：降优先级，不删不停用
    if (edited(c) && hashText(c.content) !== e.extra.eden_hash) {                     // 用户改过：内容原样保留
      const { eden_conflict, eden_retired, eden_order, ...x } = c.extra;
      const pos = eden_retired ? { ...(c.position || {}), order: eden_order ?? e.position?.order } : c.position;
      out.push({ ...c, position: pos, extra: conflictOf(c, e) ? { ...x, eden_conflict: { ver: S.ver, hash: e.extra.eden_hash, content: e.content } } : x }); continue; }
    const { eden_conflict, eden_retired, eden_order, ...x } = c.extra || {};
    out.push({ ...c, ...e, uid: c.uid, enabled: c.enabled !== false, extra: { ...x, ...e.extra } });   // 用户关掉的条目保持关
  }
  for (const c of N.extras) out.push(lowered({ ...c, extra: { ...c.extra, eden_dup: true } }, S.ver));   // 改过的重复副本：留着，降优先级
  for (const e of S.entries) if (!seen.has(e.extra.eden_id)) out.push({ ...e });
  return out;
}
/** 「你改过，上游也改了」的条目名单（UI 标出来） */
export function conflicts(entries) { return arr(entries).filter(c => own(c) && c.extra.eden_conflict).map(c => ({ name: c.name, ver: c.extra.eden_conflict.ver })); }

// ---------------- 绑定 ----------------
/** 书现在绑在哪：{ global, char, chat }（查不了的一项为 null） */
export async function bindingOf(fn, name) {
  const g = async (n, ...a) => { const f = fn(n); if (!f) return undefined; try { return await f(...a); } catch (e) { return undefined; } };
  const gl = await g('getGlobalWorldbookNames'), ch = await g('getCharWorldbookNames', 'current'), ct = await g('getChatWorldbookName', 'current');
  return { global: Array.isArray(gl) ? gl.includes(name) : null, char: ch ? (ch.primary === name || arr(ch.additional).includes(name)) : null, chat: ct === undefined ? null : ct === name };
}
const where = b => (b.global ? 'global' : b.char ? 'char' : b.chat ? 'chat' : null);
/** 绑定到 w（global / char / chat）；只加我们的书，别的绑定原样保留。角色卡绑定写的是卡的「附加世界书」列表（rebindCharWorldbooks），不改卡内容 */
export async function bind(fn, name, w) {
  if (w === 'global' && fn('getGlobalWorldbookNames') && fn('rebindGlobalWorldbooks')) { const l = arr(await fn('getGlobalWorldbookNames')()); if (!l.includes(name)) await fn('rebindGlobalWorldbooks')([...l, name]); return true; }
  if (w === 'char' && fn('getCharWorldbookNames') && fn('rebindCharWorldbooks')) { const c = await fn('getCharWorldbookNames')('current') || { primary: null, additional: [] };
    if (c.primary !== name && !arr(c.additional).includes(name)) await fn('rebindCharWorldbooks')('current', { primary: c.primary ?? null, additional: [...arr(c.additional), name] }); return true; }
  if (w === 'chat' && fn('rebindChatWorldbook')) { const cur = fn('getChatWorldbookName') ? await fn('getChatWorldbookName')('current') : null; if (cur && cur !== name) return false; if (cur !== name) await fn('rebindChatWorldbook')('current', name); return true; }
  return false;
}
/** 旧名 → 新名：在旧名出现的每一处绑定里换成新名（其余书的顺序、别的书都不动） */
export async function rebindRename(fn, from, to) {
  const b = await bindingOf(fn, from), done = [];
  if (b.global && fn('rebindGlobalWorldbooks')) { const l = arr(await fn('getGlobalWorldbookNames')()); await fn('rebindGlobalWorldbooks')([...new Set(l.map(n => (n === from ? to : n)))]); done.push('global'); }
  if (b.char && fn('rebindCharWorldbooks')) { const c = await fn('getCharWorldbookNames')('current'); await fn('rebindCharWorldbooks')('current', { primary: c.primary === from ? to : c.primary, additional: [...new Set(arr(c.additional).map(n => (n === from ? to : n)))] }); done.push('char'); }
  if (b.chat && fn('rebindChatWorldbook')) { await fn('rebindChatWorldbook')('current', to); done.push('chat'); }
  return done;
}
export async function findLegacy(fn) { try { const all = fn('getWorldbookNames') ? arr(await fn('getWorldbookNames')()) : []; return all.filter(n => typeof n === 'string' && LEGACY_RE.test(n)); } catch (e) { return []; } }

const canWrite = fn => !!(fn('getWorldbook') && fn('getWorldbookNames') && (fn('updateWorldbookWith') || fn('replaceWorldbook')) && (fn('createWorldbook') || fn('createOrReplaceWorldbook')));

/** 现状：{ api, exists, entries, plan, binding, legacy } —— 不写任何东西 */
export async function inspect(fn, ship) {
  if (!canWrite(fn)) return { api: false };
  let names = []; try { names = arr(await fn('getWorldbookNames')()); } catch (e) {}
  const exists = names.includes(BOOK); let entries = null;
  if (exists) { try { entries = arr(await fn('getWorldbook')(BOOK)); } catch (e) { return { api: true, exists, error: 'read' }; } }
  const binding = exists ? await bindingOf(fn, BOOK) : null;
  return { api: true, exists, entries, plan: ship ? plan(entries, ship) : null, binding, where: binding ? where(binding) : null, legacy: names.filter(n => LEGACY_RE.test(n)) };
}

/**
 * 写入 / 更新。o = { consent: 用户点了确认, where: 第一次绑定到哪（global / char / chat / null 不绑）, migrate: 旧书名（按它的绑定重绑）, auto: 自动同步（不新建书） }
 * 返回 { ok, reason?, plan, bound? }；只对 BOOK 调写接口。
 */
export async function sync(fn, ship, o = {}) {
  const S = shipped(ship); if (!S) return { ok: false, reason: 'offline' };
  const st = await inspect(fn, ship); if (!st.api) return { ok: false, reason: 'noapi' }; if (st.error) return { ok: false, reason: st.error };
  const p = st.plan;
  if (!o.consent) return { ok: false, reason: 'consent', plan: p };
  if (!st.exists && o.auto && !o.create) return { ok: false, reason: 'missing', plan: p };   // 自动模式要建书必须由 autoRun 判定过（没有墓碑）
  try {
    if (!st.exists) {
      const ents = S.entries.map(e => ({ ...e }));
      if (fn('createWorldbook')) {
        const made = await fn('createWorldbook')(BOOK, ents);
        if (made === false) {                                                   // 别的标签页刚建好：不覆盖，改为合并
          if (fn('updateWorldbookWith')) await fn('updateWorldbookWith')(BOOK, cur => merge(cur, ship)); else await fn('replaceWorldbook')(BOOK, merge(arr(await fn('getWorldbook')(BOOK)), ship));
        }
      } else if (o.auto) return { ok: false, reason: 'noapi', plan: p };          // 自动模式永不用 createOrReplace（会冲掉用户改过的条目）
      else await fn('createOrReplaceWorldbook')(BOOK, ents);
    } else if (p.changed) {
      if (fn('updateWorldbookWith')) await fn('updateWorldbookWith')(BOOK, cur => merge(cur, ship));
      else await fn('replaceWorldbook')(BOOK, merge(st.entries, ship));
    }
    let bound = st.where;
    try {   // 书已写好：绑定失败不算写入失败（下次再试）
      if (o.migrate && LEGACY_RE.test(o.migrate) && !st.where) { const d = await rebindRename(fn, o.migrate, BOOK); if (d.length) bound = d[0]; }
      if (!bound && o.where) bound = (await bind(fn, BOOK, o.where)) ? o.where : null;
    } catch (e) { bound = bound || null; }
    return { ok: true, plan: p, bound, wrote: st.exists ? p.changed : true };
  } catch (e) { return { ok: false, reason: 'error', plan: p, error: String(e?.message || e).slice(0, 120) }; }
}
/** 删旧书（用户第二次确认才调）：只允许带版本号的旧名 */
export async function deleteLegacy(fn, name) { if (!LEGACY_RE.test(name) || !fn('deleteWorldbook')) return false; try { return !!(await fn('deleteWorldbook')(name)); } catch (e) { return false; } }
/** 撤销：删除我们自己的书（用户在「数据与映射」二次确认才调） */
export async function removeBook(fn) { if (!fn('deleteWorldbook')) return false; try { return !!(await fn('deleteWorldbook')(BOOK)); } catch (e) { return false; } }

// ---------------- 全自动（用户 2026-09-28 决定）：打开地图时自动建书 + 挂到当前角色附加世界书；版本变了静默同步 ----------------
// 用户意图：总开关关 → 什么都不做；用户删过书（墓碑）→ 不再自动建；已经绑在任何地方 → 不改绑定。
/** 纯判定：o = { on, api, exists, tombstone, legacy: [旧书名], ship: 取到了发布物 } → 'off' | 'noapi' | 'offline' | 'tomb' | 'migrate' | 'create' | 'sync' */
export function autoDecision(o) {
  if (!o.on) return 'off';
  if (!o.api) return 'noapi';
  if (!o.ship) return 'offline';
  if (o.exists) return 'sync';
  if (o.tombstone) return 'tomb';
  return o.legacy && o.legacy.length ? 'migrate' : 'create';
}
/** 跨标签页互斥：navigator.locks（拿不到就跳过这一轮，别的标签页在做）；没有锁接口就直接跑——merge 幂等 + createWorldbook 不覆盖，重复跑也不会出重复书 / 条目 */
export async function withLock(name, f, nav = globalThis.navigator) {
  const L = nav && nav.locks && typeof nav.locks.request === 'function' ? nav.locks : null;
  if (!L) return f();
  return L.request(name, { ifAvailable: true }, lock => (lock ? f() : { ok: false, reason: 'busy' }));
}
/**
 * 一轮自动：o = { on, tombstone, charKey: 当前角色的稳定键（头像文件名）, boundChars: [我们自动绑过的角色键] }。
 * 返回 { action, ok, plan?, bound?, wrote?, boundChar? }。
 * create：新建书 → 绑到当前角色附加世界书（没有当前角色 → 当前聊天没有聊天世界书时绑聊天；都不行就不绑）。
 * migrate：有旧的带版本号的书 → 建新书并把旧书的每一处绑定换成新书（旧书留着），避免两本同时注入。
 * sync：书在 → 合并（没变化不写）。
 * 每个角色只自动绑一次：当前角色没绑、也没全局 / 聊天绑定、且不在 boundChars 里 → 绑到它的附加世界书并返回 boundChar；
 * 在 boundChars 里却没绑 = 用户自己解绑的，不再绑。
 */
export async function autoRun(fn, ship, o = {}) {
  const st = await inspect(fn, ship);
  const act = autoDecision({ on: o.on !== false, api: st.api, exists: st.exists, tombstone: !!o.tombstone, legacy: st.legacy, ship: !!shipped(ship) });
  if (!['create', 'migrate', 'sync'].includes(act)) return { action: act, ok: false };
  if (st.error) return { action: act, ok: false, reason: st.error };
  let hasChar = false; try { hasChar = !!(fn('getCharWorldbookNames') && await fn('getCharWorldbookNames')('current')); } catch (e) {}
  let r;
  if (act === 'sync' && !st.plan.changed) r = { ok: true, plan: st.plan, wrote: false, bound: st.where };
  else r = await sync(fn, ship, { consent: true, auto: true, create: act !== 'sync', where: act === 'sync' ? null : hasChar ? 'char' : 'chat', migrate: act === 'migrate' ? st.legacy[0] : null });
  if (!r.ok) return { action: act, ...r };
  const key = o.charKey || '', done = new Set(arr(o.boundChars));
  if (hasChar && key) {
    const b = await bindingOf(fn, BOOK);
    if (b.char) r = { ...r, bound: r.bound || 'char', boundChar: done.has(key) ? undefined : key };      // 已绑（也记下，免得以后解绑又被绑回去）
    else if (!b.global && !b.chat && !done.has(key)) { try { if (await bind(fn, BOOK, 'char')) r = { ...r, bound: 'char', boundChar: key }; } catch (e) {} }
  }
  return { action: act, ...r };
}
/** 每聊天版本提醒：prev = 这个聊天上次记下的版本（没有 = 新聊天 / 第一次）；返回要不要提醒 */
export function chatReminder(prev, cur) { return !!(prev && cur && prev !== cur); }
