// v0.9.5 变量映射（换卡兼容，docs/content-compat.md「换卡兼容」）：地图要读的东西 → stat_data 里的路径。
// 默认 = 设定包自己声明的（core/profile.mjs：清单 vars + 叠加层 vars / entities，pack-profile.mjs 持有当前这份）；包没写或卡里没有就按常见字段名自动找
// （内核词表 core/vocab.mjs：地点 / 位置 / location、时刻 / 时间 / time、日期 / date、在场 / present……）；
// 用户可以在设置「变量映射」里从实际的 stat_data 树里另选，按角色卡存本机（edenMap:varmap:<卡>）。没有 MVU：一切退回聊天标签。
// 纯函数；不过滤任何值。
import { getProfile } from './pack-profile.mjs';
import { hasWord, slotFind } from '../core/vocab.mjs';

export const FIELDS = ['location', 'time', 'period', 'date', 'outfit', 'present', 'members', 'targets', 'reputation', 'stageField', 'gradeField', 'coreField', 'codeField', 'socialField', 'heightField', 'weightField', 'knownField', 'accessoryField', 'tierField'];
// v0.9.6（E2 / E13）：名册行里的「等级」「核心数值」字段名（不是路径）。默认是包声明的字段名；别的卡可另选，选「关闭」存 '-'
// v0.9.6（E13 其余字段）：人物卡「更多资料」里的代号 / 社会身份 / 身高 / 体重 / 外界知情 / 饰物，同样是行内字段名，可关闭
export const MORE_FIELDS = ['codeField', 'socialField', 'heightField', 'weightField', 'knownField', 'accessoryField'];
export const NAME_FIELDS = ['gradeField', 'coreField', ...MORE_FIELDS, 'tierField'], OFF = '-';
/** 映射项 → 名册槽位（core/profile.mjs SLOTS；包里字段的 `x-slot`） */
export const SLOT_OF = { stageField: 'stage', gradeField: 'grade', coreField: 'core', codeField: 'code', socialField: 'social', heightField: 'height', weightField: 'weight', knownField: 'known', accessoryField: 'accessory', tierField: 'tier' };
/** 每一项的默认：路径来自包的 vars，三张表的表名来自包的分组，行内字段名来自包声明的槽位字段。空 = 按字段名自动发现。
 *  阶段（扫描 = 卡里没有这个字段名，逐行扫文字）和战力默认空；阶段字段由名册行直接按包里的槽位读，不走映射 */
export function defaults(profile = getProfile()) {
  const d = Object.fromEntries(FIELDS.map(f => [f, '']));
  Object.assign(d, profile.paths, { present: profile.tables.present, members: profile.tables.members, targets: profile.tables.targets });
  for (const [f, slot] of Object.entries(SLOT_OF)) { const def = profile.slots?.[slot]; d[f] = def && f !== 'stageField' && !(def.kind === 'ladder' && def.scan) ? def.field : ''; }
  return d;
}
const plain = o => !!o && typeof o === 'object' && !Array.isArray(o);
const val = v => (Array.isArray(v) && v.length === 2 && typeof v[1] === 'string' && (v[0] === null || typeof v[0] !== 'object') ? v[0] : v);
export function get(obj, path) { if (!path) return undefined; let o = obj; for (const k of String(path || '').split('.').filter(Boolean)) { o = val(o); if (!plain(o) || !(k in o)) return undefined; o = o[k]; } return val(o); }
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
// 映射项 → [内核词表的类别, 值的种类]（core/vocab.mjs HAS）
const KIND = { location: ['location', 'text'], time: ['time', 'text'], period: ['period', 'text'], date: ['date', 'text'], outfit: ['outfit', 'object'], present: ['present', 'table'], reputation: ['reputation', 'number'] };
/** 自动映射：默认路径存在就用它，否则在路径清单里按字段名找（浅的优先）；找不到留 '' */
/** 名册表（以名字为键的表）行里出现过的字段名，供「等级 / 核心数值」下拉用 */
export function rowFields(stat) {
  const out = new Set(); if (!plain(stat)) return [];
  for (const t of Object.values(stat)) if (isTable(t)) for (const r of Object.values(val(t))) for (const k of Object.keys(val(r))) if (!k.startsWith('$')) out.add(k);
  return [...out];
}
export function detect(stat, profile = getProfile()) {
  const ps = paths(stat), out = {}, rf = rowFields(stat), D = defaults(profile);
  for (const f of FIELDS) {
    const d = D[f];
    if (NAME_FIELDS.includes(f)) { out[f] = rf.includes(d) ? d : slotFind(SLOT_OF[f], rf); continue; }
    const r = KIND[f], dv = d ? get(stat, d) : undefined;
    if (d && dv !== undefined && dv !== '') { out[f] = d; continue; }
    if (!r) { out[f] = ''; continue; }
    const hit = ps.filter(p => hasWord(r[0], p.path.split('.').pop()) && (p.kind === r[1] || (r[1] === 'object' && p.kind === 'text') || (r[1] === 'table' && p.kind === 'object')))
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
