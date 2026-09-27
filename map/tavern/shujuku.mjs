// 表格数据库插件兼容（只读）：有的用户同时启用了一个「数据库 / 自动填表」扩展（全局对象 AutoCardUpdaterAPI，
// 把剧情整理成若干张表，存在聊天楼层里、经世界书条目注入）。地图只在它存在时读它导出的表：
//   - 主角当前所在地点 / 当前时间（默认模板的「全局数据表」一类）：MVU 读不到地点时作为地点来源；
//   - 带「姓名 + 位置 / 所在地点」列的人物表：补人物位置（src 'db'）。
// 从不写它的数据、不调用它的填表 / 导入接口。纯函数；eden-map.js 在宿主页取对象，node 单测 tests/shujuku.test.mjs。
// 导出格式：{ <sheetKey>: { name, content: [[表头…], [行…], …] }, … }；表头第 0 列通常是行号（row_id / null）。

const plain = o => !!o && typeof o === 'object' && !Array.isArray(o);
const str = v => (v == null ? '' : String(v).trim());
// 地点列按优先级：详细地点 / 所在地点 / 地点 / 位置 → 次要地区 → 主要地区（插件 9.x 默认模板：当前详细地点、当前次要地区、当前主要地区）
export const LOC_COLS = [/^(主角)?(当前)?(详细|具体|所在)?(地点|位置|所在地|场景)$|^(主角)?当前所在地点$|^(current[ _-]?)?(location|place|scene)$/i, /次要地区|^(当前)?地区$|sub[ _-]?region|^area$/i, /主要地区|^region$/i];
export const LOC_COL = LOC_COLS[0];
export const TIME_COL = /^(当前)?(时间|时刻)$|^(current[ _-]?)?time$/i;
export const NAME_COL = /^(姓名|名字|角色名?|人物|name)$/i;
const PROTAG_SHEET = /全局|主角|global|protagonist|player/i;

/** 宿主页上的插件接口（window.parent / top 上的 AutoCardUpdaterAPI）；没有返回 null */
export function findApi(wins) {
  for (const w of wins) { try { const a = w?.AutoCardUpdaterAPI; if (a && typeof a.exportTableAsJson === 'function') return a; } catch (e) {} }
  return null;
}
/** 导出数据 → [{ key, name, header: [], rows: [[]] }]；格式不对的表跳过 */
export function sheets(data) {
  const out = [];
  if (!plain(data)) return out;
  for (const [key, s] of Object.entries(data)) {
    if (!plain(s) || !Array.isArray(s.content) || !Array.isArray(s.content[0])) continue;
    out.push({ key, name: str(s.name) || key, header: s.content[0].map(str), rows: s.content.slice(1).filter(Array.isArray) });
  }
  return out;
}
const col = (header, re) => header.findIndex((h, i) => i > 0 && re.test(h));
const locCols = header => LOC_COLS.map(re => col(header, re)).filter(i => i > 0);
/** 主角当前地点 / 时间：优先「全局 / 主角」表，其次任何有地点列、没有姓名列的表；取最后一行非空值 */
export function protagonist(data) {
  const ss = sheets(data).filter(s => col(s.header, NAME_COL) < 0 || PROTAG_SHEET.test(s.name));
  ss.sort((a, b) => (PROTAG_SHEET.test(b.name) ? 1 : 0) - (PROTAG_SHEET.test(a.name) ? 1 : 0));
  let location = '', time = '', sheet = '';
  for (const s of ss) {
    const lis = locCols(s.header), ti = col(s.header, TIME_COL);
    if (!lis.length && ti < 0) continue;
    for (let r = s.rows.length - 1; r >= 0; r--) {   // 最后一行起，取第一个非空的（详细地点优先，空了退到地区）
      const li = lis.find(i => str(s.rows[r][i]));
      if (!location && li) { location = str(s.rows[r][li]); sheet ||= s.name; }
      if (!time && ti > 0 && str(s.rows[r][ti])) time = str(s.rows[r][ti]);
      if (location && time) break;
    }
    if (location) break;
  }
  return { location, time, sheet };
}
/** 人物位置：表里同时有姓名列和地点列（且不是「全局 / 主角」表）→ [{ name, place }]，名字去重，最多 40 人 */
export function characters(data, max = 40) {
  const out = [], seen = new Set();
  for (const s of sheets(data)) {
    if (PROTAG_SHEET.test(s.name)) continue;
    const ni = col(s.header, NAME_COL), li = locCols(s.header)[0] ?? -1;
    if (ni < 0 || li < 0) continue;
    for (const r of s.rows) {
      const name = str(r[ni]).slice(0, 40), place = str(r[li]).slice(0, 60);
      if (!name || !place || seen.has(name)) continue;
      seen.add(name); out.push({ name, place });
      if (out.length >= max) return out;
    }
  }
  return out;
}
/** 自检事实：api 不在 → null；在 → { tables: 表数, location: 读到的地点是否用上（MVU 没有地点时）, chars: 人物数 } */
export function facts(api, usedLocation) {
  if (!api) return null;
  let data = null; try { data = api.exportTableAsJson(); } catch (e) {}
  return { tables: sheets(data).length, location: !!usedLocation && !!protagonist(data).location, chars: characters(data).length };
}
/** 「正文优化」改写前的原文里有、改写后没有的 ⌖ 标签（隐藏 span 或裸标签，一行一个）→ 附加文本（'' = 没丢） */
export function lostTags(original, now) {
  const tags = String(original || '').match(/<span[^>]*display:\s*none[^>]*>\s*⌖[^<]*<\/span>|⌖[^<\n]+/g) || [];
  const miss = [...new Set(tags)].filter(t => !String(now || '').includes((t.match(/⌖[^<]*/) || [t])[0].trim()));
  return miss.length ? '\n' + miss.join('\n') : '';
}
