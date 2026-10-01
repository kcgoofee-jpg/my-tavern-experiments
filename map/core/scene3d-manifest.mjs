// 三维资产清单（Estate3D Manifest）标准契约（P3-A 任务 2，docs/reviews/architecture_and_stream_perf.md §7）：
// 主场景（map/estate/model/manifest.json）与地标（map/props/<id>/manifest.json）共用同一套 Schema，
// 运行时（map/estate/main.js、map/props/viewer3d.html）只经这里拿模型地址 / 数据文件路径 / 档位兜底——
// 查看器代码不写死、不拼装资源相对路径（tests/estate3d_manifest.test.mjs 机检 + 账实对拍）。
// 纯函数：不碰 DOM / 存储 / 网络。Schema（v1）：
//   id       必填。资产 id（主场景 = 清单自带的 id，地标 = 目录名）
//   glb      必填。三形：'x.glb'（单部件，= std 档）｜ { std, low? }（单部件两档）｜ { <part>: { std, low? } }（多部件；主场景 site / house）
//            地标旧写法 glb + glb_low 也认（glb_low 并进部件 low 档）
//   floors   可选。楼层 id：string 或 { id }（主场景与分层房间表的楼层对拍）
//   hotspots 可选。[{ id, … }]（地标热点；主场景的室外热点在 data.zones 文件里，不进清单）
//   budget   可选。体积 / 档位预算（旧地标的 per-group budgets 也认，describe 原样带出）
//   license  可选。署名与许可（旧地标的 credit 也认 → { credit }）
//   data     可选。{ rooms?, zones?, extras? } 数据文件路径，相对清单所在目录解析
//   building 可选（K-R132）。{ title, subtitle?, summary?, i18n?: { <lang>: { title?, subtitle?, summary? } } }；楼层的名字在 floors[] 的 label / i18n 上（building.floors 不收）
//   room_kinds 可选（K-R131）。{ <kind>: { color: '#rrggbb', label, rank?: 1 | 2 | 3, i18n?: { <lang>: { label } } } }；rank = 标注优先级（1 最先显示，缺省 2）；没声明的房间类别 = 生成的色盲友好色，名字 = 类别 id
//   view     可选。{ ext?: { target: [x, y, z], size: [w, d, h] } } 外观取景（米，layout 坐标）；缺省按模型包围盒
//   其余字段原样保留（容错：未知字段不报错、不丢——_说明 / v / f1_z / groups / camera / section / flows 都走这条）
// 路径解析：给了 base（清单 URL）就解析成绝对地址；档位兜底：low 档缺失回落 std。
import { recheck } from './pack-v2-spec.mjs';
import { kindColor } from './kind-palette.mjs';
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const text = v => (typeof v === 'string' && v.trim() !== '' ? v : '');   // plain text only: callers put it on the page with textContent
const okPart = g => typeof g === 'string' ? { std: g }
  : g && typeof g === 'object' && typeof g.std === 'string' ? (g.low == null ? { std: g.std } : { std: g.std, low: g.low }) : null;

/** 清单里的 GLB 部件表 { <part>: { std, low? } }；兼容三种 glb 写法与地标的 glb_low 旧字段。坏 glb 返回 {} */
export function glbParts(raw) {
  const out = {}, g = raw?.glb, add = (k, v) => { const p = okPart(v); if (p) out[k] = p; };
  if (typeof g === 'string') add('main', g);
  else if (g && typeof g === 'object' && typeof g.std === 'string') add('main', g);
  else if (g && typeof g === 'object') for (const [k, v] of Object.entries(g)) add(k, v);
  if (out.main && !out.main.low && typeof raw?.glb_low === 'string') out.main.low = raw.glb_low;
  return out;
}
const resolvePath = (p, base) => p == null ? null : (base ? new URL(p, base).href : p);
/** 部件 part 在 tier（'std' | 'low'）下的地址；low 档缺失回落 std；部件未知回落主部件（main，再不行第一个）；都没有返回 null */
export function resolveGlb(raw, tier = 'std', part = 'main', base = null) {
  const parts = glbParts(raw), g = parts[part] || parts.main || Object.values(parts)[0];
  if (!g) return null;
  return resolvePath(tier === 'low' ? (g.low ?? g.std) : g.std, base);
}
/** Schema 校验：返回错误列表（空 = 通过）。只卡真正会让运行时跑不起来的两条：id 缺失、一个可解析的 glb 都没有 */
export function validate(raw) {
  const errs = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['manifest is not an object'];
  if (typeof raw.id !== 'string' || !raw.id.trim()) errs.push('id: required non-empty string');
  const parts = glbParts(raw);
  if (!Object.keys(parts).length) errs.push('glb: no resolvable part (need string | {std,low} | {part:{std,low}})');
  return errs.concat(validateBuilding(raw));
}
/** K-R131 / K-R132 / K-R104 floors: the optional pack words of a building. Returns the error list; a manifest without these fields has none. */
function validateBuilding(raw) {
  const errs = [], b = raw?.building, k = raw?.room_kinds;
  if (b !== undefined && !(isObj(b) && ('min' in b || 'max' in b))) {   // a landmark manifest's `building: { min, max }` is its bounding box (viewer3d.html), not the K-R132 block
    if (!isObj(b)) errs.push('building: must be an object');
    else {
      if ('floors' in b) errs.push('building.floors: not allowed (floor labels are `label` / `i18n` on the floors[] items)');
      if (!text(b.title)) errs.push('building.title: required plain text');
      for (const k of ['subtitle', 'summary']) if (b[k] !== undefined && typeof b[k] !== 'string') errs.push(`building.${k}: must be a string`);
    }
  }
  if (k !== undefined) {
    if (!isObj(k)) errs.push('room_kinds: must be an object');
    else for (const [id, v] of Object.entries(k)) {
      if (recheck.id(id) === null) errs.push(`room_kinds.${id}: kind id must match ^[a-z][a-z0-9_]{0,63}$`);
      if (!isObj(v)) { errs.push(`room_kinds.${id}: must be an object`); continue; }
      if (recheck.hex(v.color) === null) errs.push(`room_kinds.${id}.color: must be #rrggbb`);
      if (!text(v.label)) errs.push(`room_kinds.${id}.label: required plain text`);
      if (v.rank !== undefined && ![1, 2, 3].includes(v.rank)) errs.push(`room_kinds.${id}.rank: must be 1, 2 or 3`);
    }
  }
  if (Array.isArray(raw?.floors)) raw.floors.forEach((f, i) => { if (isObj(f) && f.label !== undefined && typeof f.label !== 'string') errs.push(`floors[${i}].label: must be a string`); });
  return errs;
}
const L = (o, lang, key) => text(lang && o?.i18n?.[lang]?.[key]) || text(o?.[key]);
/** K-R132: the building's words in `lang`, with neutral fallbacks (title "Building", no subtitle, no summary). */
export function building(raw, lang = 'zh') {
  const b = isObj(raw?.building) && !('min' in raw.building || 'max' in raw.building) ? raw.building : null;
  return { title: L(b, lang, 'title') || 'Building', subtitle: L(b, lang, 'subtitle'), summary: L(b, lang, 'summary') };
}
/** K-R104 + K-R132: the floors in order, `{ id, label }` (label = the floor id when the item has none). */
export function floorList(raw, lang = 'zh') {
  const ids = Array.isArray(raw?.floors) ? raw.floors : [];
  return ids.map(f => (typeof f === 'string' ? { id: f, label: f } : { id: f?.id, label: L(f, lang, 'label') || f?.id })).filter(f => typeof f.id === 'string' && f.id);
}
/** K-R131: the declared kind table with colour and label chosen for `lang` ([] when the manifest declares none); invalid entries are dropped. */
export function roomKinds(raw, lang = 'zh') {
  const k = isObj(raw?.room_kinds) ? raw.room_kinds : {}, out = [];
  for (const [id, v] of Object.entries(k)) { const color = isObj(v) ? recheck.hex(v.color) : null, label = L(v, lang, 'label'); if (recheck.id(id) !== null && color && label) out.push({ id, color, label, rank: [1, 2, 3].includes(v.rank) ? v.rank : 2 }); }
  return out;
}
/** K-R131: colour and label of one kind: the declared ones, else a generated colour (core/kind-palette.mjs) and the kind id as its label. */
export function kindInfo(raw, kind, lang = 'zh') {
  return roomKinds(raw, lang).find(k => k.id === kind) || { id: kind, color: kindColor(kind), label: String(kind ?? ''), rank: 2 };
}

/** 标准化：路径按 base（清单 URL）解析成绝对地址；未知字段原样保留在 manifest。不抛错，错误走 errors */
export function normalize(raw, { base = null } = {}) {
  const errors = validate(raw), parts = glbParts(raw), out = {};
  for (const [k, g] of Object.entries(parts)) out[k] = { std: resolvePath(g.std, base), ...(g.low != null ? { low: resolvePath(g.low, base) } : {}) };
  const d = raw?.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? raw.data : {}, data = {};
  for (const k of ['rooms', 'zones', 'extras']) if (typeof d[k] === 'string') data[k] = resolvePath(d[k], base);
  return { ok: !errors.length, errors, id: raw?.id ?? null, parts: out, data, base, manifest: raw && typeof raw === 'object' ? raw : null };
}
/** 标准化摘要（上下文预算 / 多卡通用契约）：{ id, glbPath, floors, hotspots, budget, license }，固定六键。
//  glbPath = 主部件在 tier 下的地址（main 优先，多部件取第一个）；主部件缺失（Schema 不合格）为 null */
export function describe(raw, { tier = 'std', base = null } = {}) {
  const ids = a => Array.isArray(a) ? a.map(x => (typeof x === 'string' ? x : x?.id)).filter(x => typeof x === 'string' && x) : [];
  const parts = glbParts(raw), primary = parts.main ? 'main' : Object.keys(parts)[0];
  return {
    id: raw?.id ?? null,
    glbPath: validate(raw).length ? null : resolveGlb(raw, tier === 'low' ? 'low' : 'std', primary, base),
    floors: ids(raw?.floors),
    hotspots: ids(raw?.hotspots),
    budget: raw?.budget ?? raw?.budgets ?? null,
    license: raw?.license ?? (raw?.credit != null ? { credit: raw.credit } : null),
  };
}
export const Estate3D = { SCHEMA: 1, glbParts, resolveGlb, validate, normalize, describe, building, floorList, roomKinds, kindInfo };
