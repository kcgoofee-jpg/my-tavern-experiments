// 世界书附加条目：写入 / 自动同步（docs/tavernhelper-audit.md A1；node 单测 tests/wbsync.test.mjs）。
// 只动我们自己的一本书 BOOK（名字前缀「伊甸地图·」）；永不改别的书、永不改卡自带世界书。写之前先给差异，用户点了才写。
// 条目内容随地图从 CDN 发（map/data/worldbook_addon.json，tools/build_worldbook_addon.py --ship 生成，按版本 ver 标记）。
// 每个我们的条目在 extra 里带 { eden_id: 稳定编号, eden_ver: 写入时的版本, eden_hash: 写入时内容的指纹 }：
//   - 按 eden_id 对应（名字可以被用户改）；
//   - 现有内容指纹 ≠ eden_hash → 用户改过，保留不覆盖（差异里列出来）；
//   - 没有 eden_id 的条目 = 用户自己加的，原样保留；
//   - 新版不再发的我们的条目 → 停用，不删。
// 绑定（全局 / 角色 / 聊天）：已经绑在哪里就保持；第一次由用户选；旧的带版本号的书（手动导入的「… v0.9.5」）可迁移到稳定名并按原绑定重绑，旧书默认留着，用户再确认才删。
export const PREFIX = '伊甸地图·';
export const BOOK = PREFIX + '世界书附加条目';
export const LEGACY_RE = /^伊甸地图·世界书附加条目\s*v\d[\w.+-]*$/;

export function hashText(s) { let h = 2166136261; for (const c of String(s ?? '')) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); }
const arr = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);
const own = e => e && typeof e === 'object' && e.extra && typeof e.extra.eden_id === 'string';

/** CDN 上的发布物 → { ver, entries: [TH 条目（部分字段）+ extra] } */
export function shipped(ship) {
  if (!ship || typeof ship.ver !== 'string' || !Array.isArray(ship.entries)) return null;
  return { ver: ship.ver, version: ship.version || '', entries: ship.entries.filter(e => e && typeof e.id === 'string').map(e => {
    const { id, ...rest } = e; return { ...rest, extra: { eden_id: id, eden_ver: ship.ver, eden_hash: hashText(e.content) } }; }) };
}
/** 已装书的版本标记：我们的条目里最多的那个 eden_ver */
export function installedVer(entries) {
  const n = {}; for (const e of arr(entries)) if (own(e) && e.extra.eden_ver) n[e.extra.eden_ver] = (n[e.extra.eden_ver] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}
const edited = e => own(e) && e.extra.eden_hash && hashText(e.content) !== e.extra.eden_hash;

/** 差异：installed = 现有条目数组或 null（书不存在） */
export function plan(installed, ship) {
  const S = shipped(ship); if (!S) return null;
  const cur = installed ? arr(installed) : null, byId = new Map((cur || []).filter(own).map(e => [e.extra.eden_id, e]));
  const out = { first: !cur, from: cur ? installedVer(cur) : null, to: S.ver, version: S.version, add: [], update: [], keep: [], same: [], retire: [], user: 0 };
  for (const e of S.entries) {
    const c = byId.get(e.extra.eden_id);
    if (!c) out.add.push(e.name);
    else if (edited(c)) out.keep.push(c.name || e.name);
    else if (c.content === e.content && c.name === e.name && c.extra.eden_ver === S.ver) out.same.push(e.name);
    else if (c.content === e.content && c.name === e.name) out.same.push(e.name);   // 只有版本标记不同：写时顺手更新标记
    else out.update.push(e.name);
  }
  const ids = new Set(S.entries.map(e => e.extra.eden_id));
  for (const c of cur || []) { if (!own(c)) out.user++; else if (!ids.has(c.extra.eden_id) && c.enabled !== false) out.retire.push(c.name); }
  out.changed = out.first || out.add.length + out.update.length + out.retire.length > 0 || out.from !== S.ver;
  return out;
}
/** 把发布物合进现有条目（updateWorldbookWith 的 updater 用）：保留用户条目、用户改过的条目、用户的启用开关与 uid */
export function merge(installed, ship) {
  const S = shipped(ship); if (!S) return arr(installed);
  const cur = arr(installed), byId = new Map(S.entries.map(e => [e.extra.eden_id, e])), seen = new Set(), out = [];
  for (const c of cur) {
    if (!own(c)) { out.push(c); continue; }
    const e = byId.get(c.extra.eden_id); seen.add(c.extra.eden_id);
    if (!e) { out.push({ ...c, enabled: false }); continue; }                       // 新版不再发：停用，不删
    if (edited(c)) { out.push(c); continue; }                                        // 用户改过：原样保留
    out.push({ ...c, ...e, uid: c.uid, enabled: c.enabled !== false, extra: { ...(c.extra || {}), ...e.extra } });   // 用户关掉的条目保持关
  }
  for (const e of S.entries) if (!seen.has(e.extra.eden_id)) out.push({ ...e });
  return out;
}

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
  if (!st.exists && o.auto) return { ok: false, reason: 'missing', plan: p };   // 自动同步不替用户新建书（被删了 = 用户的决定）
  try {
    if (!st.exists) {
      const ents = S.entries.map(e => ({ ...e }));
      if (fn('createWorldbook')) await fn('createWorldbook')(BOOK, ents); else await fn('createOrReplaceWorldbook')(BOOK, ents);
    } else if (p.changed) {
      if (fn('updateWorldbookWith')) await fn('updateWorldbookWith')(BOOK, cur => merge(cur, ship));
      else await fn('replaceWorldbook')(BOOK, merge(st.entries, ship));
    }
    let bound = st.where;
    if (o.migrate && LEGACY_RE.test(o.migrate)) { const d = await rebindRename(fn, o.migrate, BOOK); if (d.length) bound = d[0]; }
    if (!bound && o.where) bound = (await bind(fn, BOOK, o.where)) ? o.where : null;
    return { ok: true, plan: p, bound, wrote: st.exists ? p.changed : true };
  } catch (e) { return { ok: false, reason: 'error', plan: p, error: String(e?.message || e).slice(0, 120) }; }
}
/** 删旧书（用户第二次确认才调）：只允许带版本号的旧名 */
export async function deleteLegacy(fn, name) { if (!LEGACY_RE.test(name) || !fn('deleteWorldbook')) return false; try { return !!(await fn('deleteWorldbook')(name)); } catch (e) { return false; } }
/** 撤销：删除我们自己的书（用户在「数据与映射」二次确认才调） */
export async function removeBook(fn) { if (!fn('deleteWorldbook')) return false; try { return !!(await fn('deleteWorldbook')(BOOK)); } catch (e) { return false; } }
