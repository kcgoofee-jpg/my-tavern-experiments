// 三维藏物（Part 8-1 第一步，2026-09-30）：把世界藏物表（core/stash.mjs）里登记的东西放到三维场景的真实坐标上。
// 分工：core/stash.mjs 管「世界上藏着什么」；本模块管「藏在三维空间的哪一点」——纯映射，不认识庄园数据长什么样，
// 落点由调用方（map/estate/main.js）按自己的房间 / 区域表喂进来（{ id, name, alias, floor, x, y, z }）。
// 映射规则与庄园页点选房间同源：地点名 / 标记 id / 别名都能对上，同名的取先登记的那一处（数据里的先后顺序）。
// 已经拿到手的（taken）不落点；暗格的照旧落点，要不要显示由调用方按「人就在这儿」决定（与二维发光点同一个口径）。
// 纯核心：不碰 DOM / 存储 / 酒馆全局（机检 tools/check_architecture.py）；node 单测 tests/stash3d.test.mjs。
import { rows, glow } from './stash.mjs';

/** 道具占位网格的默认半径（米）：三维里的一枚小光球，二维发光点对应的那个东西 */
export const PROP_R = 0.8;
/** 呼吸周期（秒）：与 stash.glow 的默认周期一致，二维光点和三维光球同频 */
export const GLOW_PERIOD = 2.4;

const CUT = (s, n) => [...String(s ?? '').trim()].slice(0, n).join('');
const NUM = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
/** 名字归一：去括注 / 大小写 / 空白（「主卧（套间）」= 「主卧」） */
const normName = s => String(s ?? '').trim().toLowerCase().replace(/[（(][^）)]*[）)]/g, '').replace(/\s+/g, '');

/** 一处落点里的所有叫法（名字 / id / 别名）→ 归一后的集合 */
function keysOf(p) {
  const out = new Set();
  for (const k of [p?.name, p?.id, ...(Array.isArray(p?.alias) ? p.alias : [])]) {
    if (typeof k !== 'string') continue;
    const n = normName(k); if (n) out.add(n);
  }
  return out;
}

/** 落点表 × 一个地点名 → 那一处落点（名字 / id / 别名归一后比对）；认不出 = null。
 *  藏物落点与「谁现在该站在哪儿」走同一套对账：名字归一只此一处。 */
export function placeOf(places, name) {
  const want = normName(name); if (!want) return null;
  const list = Array.isArray(places) ? places : [];
  return list.find(p => p && typeof p === 'object' && Number.isFinite(NUM(p.x, NaN)) && keysOf(p).has(want)) || null;
}

/**
 * 藏物 → 三维落点：{ id, name, hidden, place, floor, x, y, z, r }[]。
 * places = [{ id, name, alias?, floor?, x, y, z, r? }]（x/y/z 用调用方自己的坐标系，本模块不改）。
 * 认不出落点的行丢掉（不知道该往哪儿放，就不放）；给了 floor（含 null = 室外）就只出该层的——楼层切换时只画当前层；
 * 不写 floor 这个键 = 不限层（全部落点）。
 */
export function spots(stash, opt = {}) {
  const list = rows(stash, { map: opt.map, taken: opt.taken });
  const places = Array.isArray(opt.places) ? opt.places.filter(p => p && typeof p === 'object' && Number.isFinite(NUM(p.x, NaN))) : [];
  const wantFloor = 'floor' in opt ? (opt.floor ?? null) : undefined;   // undefined = 不限层
  const out = [];
  for (const r of list) {
    const hit = placeOf(places, r.place) || placeOf(places, r.marker);
    if (!hit || (wantFloor !== undefined && (hit.floor ?? null) !== wantFloor)) continue;
    out.push({
      id: r.id, name: r.name, hidden: !!r.hidden, place: r.place || r.marker || '',
      floor: hit.floor == null ? null : hit.floor,
      x: NUM(hit.x, 0), y: NUM(hit.y, 0), z: NUM(hit.z, 0), r: Math.max(0.2, NUM(hit.r, PROP_R)),
    });
  }
  return out;
}

/** 呼吸系数 0–1（渲染层画微光环绕用；与 core/stash.mjs 的 glow 同一个函数，这里只固定周期口径） */
export const propGlow = (t, period = GLOW_PERIOD) => glow(t, period);

/** 标准摘要（上下文预算 / 三维页自检）：{ total, hidden, floors } */
export function describe(list) {
  const arr = Array.isArray(list) ? list : [];
  return { total: arr.length, hidden: arr.filter(s => s.hidden).length, floors: [...new Set(arr.map(s => s.floor ?? null))].sort() };
}

export const Stash3D = { PROP_R, GLOW_PERIOD, placeOf, spots, propGlow, describe };
