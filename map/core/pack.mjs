// 设定包（pack）配置接口（通用化，docs/generalize/README.md）：核心只通过这里拿「这张卡」的东西——
// 数据文件路径（地图注册表、世界地点、派生数据、房间平面、卡原名绑定、事件分类）、本机存储键前缀、聊天变量顶层键、CDN 仓库、主题强调色、标题。
// 包 = map/packs/<id>/manifest.json（结构见 map/data/schema/pack.schema.json）。内置的 eden 包不用额外请求（EDEN 与 packs/eden/manifest.json 一致，tests/pack.test.mjs 检查）。
// 纯函数 + 一个可选的 fetch：查看器（app/boot.mjs）、宿主（tavern/eden-map.js）、node 单测、tools/*.py 的校验共用同一套规则。
export const DEFAULT_ID = 'eden';
export const ID_RE = /^[a-z][a-z0-9_-]{1,31}$/;
/** 本机存储键前缀：不可配置，由包 id 推出（首帧前置脚本要同步算出来，不能等清单）。eden 沿用历史前缀 edenMap（老用户的键原样可读，不用迁移）。 */
export const prefixOf = id => (!id || id === DEFAULT_ID ? 'edenMap' : `tcp.${id}.`);
/** 核心代码里登记的键都写成 edenMap*（core/storage.mjs KEYS）；按包换前缀。eden 下原样返回。 */
export function nsKey(k, id) {
  if (typeof k !== 'string' || !id || id === DEFAULT_ID || !k.startsWith('edenMap')) return k;
  return prefixOf(id) + k.slice(7);
}
/** 聊天变量顶层键：eden 历史名 eden_map；其它包默认 tc_<id>（清单 chat.var 可改） */
export const chatVarOf = (id, m) => m?.chat?.var || (!id || id === DEFAULT_ID ? 'eden_map' : `tc_${id.replace(/-/g, '_')}`);

// 内置 eden 包（与 map/packs/eden/manifest.json 同步；数据文件仍在 map/data，另一条线还在往里加地标，不搬家）
export const EDEN = Object.freeze({
  id: 'eden', schema: 1, title: '伊甸庄园 · 天城', title_en: 'Eden Manor · Tiancheng',
  chat: { var: 'eden_map' },
  data: { maps: 'data/maps.json', world: 'data/world_markers.json', derived: 'data/derived.json', rooms: 'data/eden_estate_rooms.json', events: 'builtin' },
  cdn: { repo: 'kcgoofee-jpg/my-tavern-experiments', npm: 'tiancheng-map-assets' },
  theme: { accent: '#e6c36a' },
  worldbook: { addon: 'tools/build_worldbook_addon.py' },
});

const str = (v, max = 200) => typeof v === 'string' && v.length > 0 && v.length <= max;
const relOk = p => str(p, 200) && !/^[a-z]+:|^\/|(^|\/)\.\.(\/|$)|\\/i.test(p);   // 只收包内 / map 内相对路径，不收外链与上跳
/** 校验清单：返回问题列表（空 = 通过）。与 pack.schema.json 同一套规则的子集（运行时够用，完整校验在 tools/check_pack.py）。 */
export function validate(m) {
  const errs = [];
  if (!m || typeof m !== 'object' || Array.isArray(m)) return ['清单不是对象'];
  if (!ID_RE.test(m.id || '')) errs.push('id 只能是小写字母开头的 2–32 位 a-z0-9_-');
  if (m.schema !== 1) errs.push('schema 必须是 1');
  if (!str(m.title, 80)) errs.push('title 必填（≤ 80 字）');
  if (!m.data || !relOk(m.data.maps)) errs.push('data.maps 必填，且是相对路径');
  for (const [k, v] of Object.entries(m.data || {})) if (v !== 'builtin' && !relOk(v)) errs.push(`data.${k} 不是相对路径`);
  if (m.chat?.var !== undefined && !/^[A-Za-z_][A-Za-z0-9_]{0,31}$/.test(m.chat.var)) errs.push('chat.var 只能是字母数字下划线');
  if (m.theme?.accent !== undefined && !/^#[0-9a-fA-F]{6}$/.test(m.theme.accent)) errs.push('theme.accent 要写成 #rrggbb');
  if (m.cdn?.repo !== undefined && !/^[\w.-]+\/[\w.-]+$/.test(m.cdn.repo)) errs.push('cdn.repo 要写成 owner/repo');
  return errs;
}
/**
 * 解析成核心用的形状：路径都换成相对 map/ 的（eden 的 data/*；其它包 packs/<id>/*），补默认值。
 * base = 清单所在目录（相对 map/），内置 eden 为 ''。
 */
export function resolve(m, base = m?.id === DEFAULT_ID ? '' : `packs/${m?.id}/`) {
  const data = {};
  for (const [k, v] of Object.entries(m.data || {})) data[k] = v === 'builtin' ? v : base + v;
  return {
    id: m.id, title: m.title, title_en: m.title_en || m.title, base,
    prefix: prefixOf(m.id), chatVar: chatVarOf(m.id, m),
    data, cdn: { ...(m.cdn || {}) }, theme: { accent: '#e6c36a', ...(m.theme || {}) },
    features: { world: !!data.world, estate: !!data.rooms, ...(m.features || {}) },
    strings: m.strings || {},
  };
}
export const EDEN_RESOLVED = resolve(EDEN, '');
/** 当前包 id：宿主注入的 window.__tcPack.id > 地址 ?pack= > eden。不合法的 id 退回 eden。 */
export function currentId(w = globalThis) {
  let id = null;
  try { id = w.__tcPack?.id || new URLSearchParams(w.location?.search || '').get('pack'); } catch (e) {}
  return id && ID_RE.test(id) ? id : DEFAULT_ID;
}
/** 取包：eden 直接返回内置；其它包 fetch packs/<id>/manifest.json（宿主注入了完整清单时不再请求）。失败抛错，由调用方退回 eden 或报错。 */
export async function load(id = currentId(), { base = '', fetchJSON, injected } = {}) {
  if (id === DEFAULT_ID) return EDEN_RESOLVED;
  let m = injected?.manifest;
  if (!m) {
    const get = fetchJSON || (u => fetch(u).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }));
    m = await get(`${base}packs/${id}/manifest.json`);
  }
  const errs = validate(m); if (m.id !== id) errs.push(`清单 id（${m.id}）与请求的包（${id}）不一致`);
  if (errs.length) throw new Error('设定包清单不合格：' + errs.join('；'));
  return resolve(m);
}
/**
 * 包里的 maps.json 写包内相对路径（art/town.dzi、town_up.json）；核心按 map/ 取文件，这里补上包目录。
 * 只改 base / data / cover / overlay.src / alt.base；外链、以 ../ 或 / 开头的不动；viewer3d 页面（src）是核心页面，不改。返回新对象。
 */
export function rebaseRegistry(reg, base) {
  if (!base || !reg?.maps) return reg;
  const fix = p => (typeof p === 'string' && p && !/^([a-z]+:|\/|\.\.\/)/i.test(p) ? base + p : p);
  const maps = {};
  for (const [id, m] of Object.entries(reg.maps)) {
    const n = { ...m };
    for (const k of ['base', 'data', 'cover']) if (n[k]) n[k] = fix(n[k]);
    if (n.overlay?.src) n.overlay = { ...n.overlay, src: fix(n.overlay.src) };
    if (n.alt?.base) n.alt = { ...n.alt, base: fix(n.alt.base) };
    maps[id] = n;
  }
  return { ...reg, maps };
}
/** 反向：实际键 → 核心里的 edenMap* 名；本包的键还原，eden 的原生 edenMap* 键藏起来（null），别的键原样。预算清理（tavern/budget.mjs）因此只看见、只清本包的数据。 */
export function unNsKey(k, id) {
  if (typeof k !== 'string' || !id || id === DEFAULT_ID) return k;
  const p = prefixOf(id); return k.startsWith(p) ? 'edenMap' + k.slice(p.length) : k.startsWith('edenMap') || k === 'edenEstateLabels' ? null : k;
}
/** 本机存储的包命名空间：包一层 Storage（eden 原样返回同一个对象）。key(i) 走 unNsKey，调用方遍历时跳过 null。 */
export function nsStore(ls, id) {
  if (!ls || !id || id === DEFAULT_ID) return ls;
  const N = k => nsKey(k, id);
  return { getItem: k => ls.getItem(N(k)), setItem: (k, v) => ls.setItem(N(k), v), removeItem: k => ls.removeItem(N(k)), key: i => unNsKey(ls.key(i), id), get length() { return ls.length; } };
}
