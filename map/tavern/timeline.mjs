// 时间轴回放 / 剧情时间机器（Part 5-4）的纯核心：算出「第 N 楼当时地图上该显示什么」——
// 那一楼 MVU 变量里的当前地点（读不到就退回正文里最后一次写地点的 JSONPatch）、那一楼的时刻、
// 那一楼谁在哪（MVU 人物表优先，正文 ⌖人物 标签补齐 MVU 没说到的人）。
// 取数全由调用方注入（宿主给真实读楼函数，node 单测喂假数据）；本模块不碰酒馆全局 / DOM / 存储，也不做缓存（缓存在调用方）。
// 与 SessionSnapshot（tavern/context.mjs）的分工：那边录的是「消息 + MVU 状态」用于整场重放，
// 这里只回答「某一楼的地图上该画什么」——楼层 → here / time / chars。
const str = (v, n = 120) => { try { return v == null ? '' : String(v).trim().slice(0, n); } catch (e) { return ''; } };
const safe = (fn, d = null) => { try { const v = fn?.(); return v === undefined ? d : v; } catch (e) { return d; } };
/** 变量路径 → JSON 指针：点位（世界.当前地点）与 eject指针（/世界/当前地点）两种写法都收 */
const pt = p => { const s = str(p, 200); return !s ? '' : (s.startsWith('/') ? s : '/' + s.split('.').join('/')); };

/** 楼层号：只认 ≥ 0 的整数，其它一律 -1（拖到开局之前就是没有得看） */
export function floorOf(v) {
  if (v === null || v === undefined || v === '') return -1;
  if (typeof v === 'string' && !v.trim()) return -1;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : -1;
}

/**
 * 某一楼的世界状态：{ floor, here, time, chars }；楼层号不合法返回 null。
 * deps: getRaw(floor) → 正文；perFloorStat(floor) → 该楼 stat_data（没有 = null）；
 *       mvuGet(stat, path) / mvuChars(stat, here, presentKey) / varMap { location, time, present }；
 *       parseChars(正文) → [{name, place}]；patchPlace(正文, 路径) → 地点（JSONPatch 兜底）；lp = 地点变量路径。
 */
export function floorState(f, deps = {}) {
  const floor = floorOf(f); if (floor < 0) return null;
  const d = deps && typeof deps === 'object' ? deps : {};
  const lpLoc = pt(d.lp) || pt(d.varMap?.location) || '/世界/当前地点';
  const lpTime = pt(d.varMap?.time);
  const stat = safe(() => d.perFloorStat?.(floor), null) || null;
  const raw = str(safe(() => d.getRaw?.(floor), '') || '', 200000);
  const here = safe(() => str(typeof d.mvuGet === 'function' && stat ? d.mvuGet(stat, lpLoc) : '', 120), '')
    || safe(() => (typeof d.patchPlace === 'function' ? str(d.patchPlace(raw, lpLoc), 120) : ''), '');
  const time = lpTime ? safe(() => str(typeof d.mvuGet === 'function' && stat ? d.mvuGet(stat, lpTime) : '', 40), '') : '';
  const chars = [], seen = new Set();
  if (typeof d.mvuChars === 'function' && stat) {
    for (const c of safe(() => d.mvuChars(stat, here, str(d.varMap?.present, 80)), []) || []) {
      const name = str(c?.name, 60); if (!name || seen.has(name)) continue;
      seen.add(name); chars.push({ name, place: str(c?.place, 120), floor, src: c?.present ? 'infer' : 'mvu' });
    }
  }
  if (typeof d.parseChars === 'function') {
    for (const c of safe(() => d.parseChars(raw), []) || []) {
      const name = str(c?.name, 60); if (!name || seen.has(name)) continue;
      seen.add(name); chars.push({ name, place: str(c?.place, 120), floor, src: 'tag' });
    }
  }
  return { floor, here, time, chars };
}

/** 一段时间窗里的玩家足迹 [{ floor, here, time }]：重画历史轨迹用——同一个地点连着好几楼只留第一处 */
export function walk(from, to, deps = {}, step = 1) {
  const a = floorOf(from), b = floorOf(to), out = [];
  if (a < 0 || b < a) return out;
  const st = Math.max(1, Math.round(Number(step) || 1) || 1);
  for (let f = a; f <= b; f += st) {
    const s = floorState(f, deps);
    if (!s || !s.here) continue;
    const prev = out[out.length - 1];
    if (prev && prev.here === s.here) continue;
    out.push({ floor: f, here: s.here, time: s.time });
  }
  return out;
}

/** 这一楼有没有得看：有地点 / 有时刻 / 有人，三条里有任意一条就算有（拖到没内容的一楼不至于连标题都不给） */
export const hasState = s => !!s && (!!s.here || !!s.time || !!(s.chars && s.chars.length));
