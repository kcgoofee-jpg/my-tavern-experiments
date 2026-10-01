// FROZEN COPY of map/tavern/stat-path-mapping.mjs as of head #172 (S4-2 oracle): the first pack's variable paths, roster slots, core cuts, tier words, portrait rules and discovery regexes as they lived in engine code,
// kept only so tests/*_shadow.test.mjs can prove the pack data + kernel vocabulary read the same, and so tools/gen_eden_vars_v2.mjs can derive the pack's blocks.
// Do not edit; do not import from the engine. Changes: the import paths.
// v0.9.5 变量映射（换卡兼容，docs/content-compat.md「换卡兼容」）：地图要读的东西 → stat_data 里的路径。
// 默认 = 这张卡；缺了就按常见字段名自动找（地点 / 位置 / location、时刻 / 时间 / time、日期 / date、在场 / present……）；
// 用户可以在设置「变量映射」里从实际的 stat_data 树里另选，按角色卡存本机（edenMap:varmap:<卡>）。没有 MVU：一切退回聊天标签。
// 纯函数；不过滤任何值。
export const FIELDS = ['location', 'time', 'period', 'date', 'outfit', 'present', 'members', 'targets', 'reputation', 'stageField', 'gradeField', 'coreField', 'codeField', 'socialField', 'heightField', 'weightField', 'knownField', 'accessoryField', 'tierField'];
// v0.9.6（E2 / E13）：名册行里的「等级」「核心数值」字段名（不是路径）。默认是这张卡的字段名；别的卡可另选，选「关闭」存 '-'
// v0.9.6（E13 其余字段）：人物卡「更多资料」里的代号 / 社会身份 / 身高 / 体重 / 外界知情 / 饰物，同样是行内字段名，可关闭
export const MORE_FIELDS = ['codeField', 'socialField', 'heightField', 'weightField', 'knownField', 'accessoryField'];
export const NAME_FIELDS = ['gradeField', 'coreField', ...MORE_FIELDS, 'tierField'], OFF = '-';
// 默认字段名不在名册行里时，按字段名自动找（换卡兼容）
export const MORE_RX = { gradeField: /.等级$|^grade$|rank/i, coreField: /..值$|core/i, codeField: /代号|codename|alias/i, socialField: /社会身份|公开身份|身份$|occupation/i, heightField: /身高|height/i, weightField: /体重|weight/i, knownField: /外界知情|知情|public/i, accessoryField: /饰物|配饰|项圈|accessor/i,
  tierField: /战力|战斗力|实力等级|超凡阶|combat|power|tier/i };   // E1 战力小签：这张卡的名册没有战力字段，默认空、按名找
// 默认 = 这张卡的字段名（照抄卡）；不在名册行里时按字段名形状自动发现（MORE_RX），用户仍可在映射里另选
export const DEFAULT_MAP = { location: '世界.当前地点', time: '世界.当前时刻', period: '世界.当日时段', date: '世界.当前日期', outfit: '主角.着装',
  present: '', members: '', targets: '', reputation: '', stageField: '', gradeField: '母畜等级', coreField: '母畜值',
  codeField: '母畜代号', socialField: '社会身份', heightField: '身高', weightField: '体重', knownField: '外界知情', accessoryField: '项圈', tierField: '' };   // 空 = 按位置 / 通用字段名自动发现（mvu-readers.mjs rosters / reputation）
/** 设定包（通用化）：换默认路径。非 eden 包先全部清空（按字段名自动发现），再套清单 vars 里给的（只收已知字段、字符串值） */
export function useDefaults(vars) {
  for (const k of Object.keys(DEFAULT_MAP)) DEFAULT_MAP[k] = '';
  for (const [k, v] of Object.entries(vars || {})) if (k in DEFAULT_MAP && typeof v === 'string' && v.length <= 80) DEFAULT_MAP[k] = v;
  return DEFAULT_MAP;
}
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
/** 名册表（以名字为键的表）行里出现过的字段名，供「等级 / 核心数值」下拉用 */
export function rowFields(stat) {
  const out = new Set(); if (!plain(stat)) return [];
  for (const t of Object.values(stat)) if (isTable(t)) for (const r of Object.values(val(t))) for (const k of Object.keys(val(r))) if (!k.startsWith('$')) out.add(k);
  return [...out];
}
export function detect(stat) {
  const ps = paths(stat), out = {}, rf = rowFields(stat);
  for (const f of FIELDS) {
    const d = DEFAULT_MAP[f];
    if (NAME_FIELDS.includes(f)) { out[f] = rf.includes(d) ? d : MORE_RX[f] ? rf.find(k => MORE_RX[f].test(k)) || '' : ''; continue; }
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
