// v0.9.5 变量映射（换卡兼容，docs/content-compat.md「换卡兼容」）：地图要读的东西 → stat_data 里的路径。
// 默认 = 这张卡；缺了就按常见字段名自动找（地点 / 位置 / location、时刻 / 时间 / time、日期 / date、在场 / present……）；
// 用户可以在设置「变量映射」里从实际的 stat_data 树里另选，按角色卡存本机（edenMap:varmap:<卡>）。没有 MVU：一切退回聊天标签。
// 纯函数；不过滤任何值。
export const FIELDS = ['location', 'time', 'period', 'date', 'outfit', 'present', 'members', 'targets', 'reputation', 'stageField'];
export const DEFAULT_MAP = { location: '世界.当前地点', time: '世界.当前时刻', period: '世界.当日时段', date: '世界.当前日期', outfit: '主角.着装',
  present: '', members: '', targets: '', reputation: '', stageField: '' };   // 空 = 按位置 / 通用字段名自动发现（mvu.mjs rosters / reputation）
const plain = o => !!o && typeof o === 'object' && !Array.isArray(o);
const val = v => (Array.isArray(v) && v.length === 2 && typeof v[1] === 'string' && (v[0] === null || typeof v[0] !== 'object') ? v[0] : v);
export function get(obj, path) { let o = obj; for (const k of String(path || '').split('.').filter(Boolean)) { o = val(o); if (!plain(o) || !(k in o)) return undefined; o = o[k]; } return val(o); }
const isTable = t => { t = val(t); const v = plain(t) ? Object.values(t) : []; return v.length > 0 && v.every(x => plain(val(x))); };
/** stat_data 的路径清单（深 3 层）：[{ path, kind: 'text' | 'number' | 'object' | 'table' }]；以名字为键的表只列表本身，不展开到每个人 */
export function paths(stat, depth = 3) {
  const out = [];
  const walk = (o, pre, d) => {
    for (const [k, raw] of Object.entries(o)) {
      if (k.startsWith('$')) continue;
      const v = val(raw), p = pre ? pre + '.' + k : k;
      if (plain(v)) { const tbl = isTable(v); out.push({ path: p, kind: tbl ? 'table' : 'object' }); if (!tbl && d < depth) walk(v, p, d + 1); }
      else if (typeof v === 'number') out.push({ path: p, kind: 'number' });
      else if (typeof v === 'string' || typeof v === 'boolean') out.push({ path: p, kind: 'text' });
    }
  };
  if (plain(stat)) walk(stat, '', 1);
  return out;
}
const RX = { location: [/当前地点|所在地|地点|位置|location|place/i, 'text'], time: [/时刻|时间|time|clock/i, 'text'], period: [/时段|period|phase/i, 'text'],
  date: [/日期|date/i, 'text'], outfit: [/着装|服装|衣着|outfit|clothes/i, 'object'], present: [/在场|present|nearby/i, 'table'], reputation: [/声望|reputation|名望/i, 'number'] };
/** 自动映射：默认路径存在就用它，否则在路径清单里按字段名找（浅的优先）；找不到留 '' */
export function detect(stat) {
  const ps = paths(stat), out = {};
  for (const f of FIELDS) {
    const d = DEFAULT_MAP[f];
    const r = RX[f], dv = d ? get(stat, d) : undefined;
    if (d && dv !== undefined && dv !== '') { out[f] = d; continue; }
    if (!r) { out[f] = ''; continue; }
    const hit = ps.filter(p => r[0].test(p.path.split('.').pop()) && (p.kind === r[1] || (r[1] === 'object' && p.kind === 'text') || (r[1] === 'table' && p.kind === 'object')))
      .sort((a, b) => a.path.split('.').length - b.path.split('.').length)[0];
    out[f] = hit ? hit.path : d && dv !== undefined ? d : '';
  }
  return out;
}
/** 生效的映射：自动映射 + 用户改过的（只收已知字段、字符串） */
export function effective(user, stat) {
  const out = detect(stat);
  for (const f of FIELDS) if (typeof user?.[f] === 'string' && user[f].trim()) out[f] = user[f].trim();
  return out;
}
/** 读法：'mvu'（有 MVU 且读得到地点）、'mvu-partial'（有 MVU 但地点没映射上）、'tags'（没有 MVU：一切退回聊天标签） */
export function mode(hasMvu, stat, map) {
  if (!hasMvu || !plain(stat)) return 'tags';
  return map?.location && get(stat, map.location) !== undefined ? 'mvu' : 'mvu-partial';
}
/** 按角色卡存的键 */
export const storeKey = card => 'edenMap:varmap:' + String(card || 'default').slice(0, 120);
/** 旅行方式关键词：用户在映射里改过的覆盖默认（{ air: [...], ... }）；fantasy = 是否启用通用奇幻词 */
export function readUser(st, card) { try { const o = JSON.parse(st?.getItem(storeKey(card)) || '{}'); return plain(o) ? o : {}; } catch (e) { return {}; } }
export function writeUser(st, card, o) { try { if (!o || !Object.keys(o).length) st.removeItem(storeKey(card)); else st.setItem(storeKey(card), JSON.stringify(o)); return true; } catch (e) { return false; } }
