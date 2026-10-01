// Frozen v1 behaviour for the S6-2 parity tests; never edit. Verbatim copy of the W12 slot functions of map/core/ledger.mjs (SLOT_ROOT .. slotSave) at origin/preview bb4d757a.
const clip = (v, n) => [...String(v ?? '').trim()].slice(0, n).join('');
export const SLOT_ROOT = '槽位';
/** 背包字段名候选（认得就用它当槽位名；认不出用第一个），大小写不敏感 */
export const SLOT_KEYS = Object.freeze(['物品栏', '背包', '道具栏', '道具', '物品', '储物', '行囊', '仓库', 'inventory', 'backpack', 'items', 'bag', 'storage']);
const SLOT_LOWER = SLOT_KEYS.map(k => k.toLowerCase());
const SLOT_DEPTH = 2;         // 探路深度：顶层 + 一层子表（「资产.物品栏」这种也认）
const plainObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const slotIndexOf = k => SLOT_LOWER.indexOf(String(k ?? '').toLowerCase());
/** 深度优先找一个能当背包用的字段：返回 { key, path } 或 null（只认对象值，字符串 / 数字不当容器） */
function findSlot(stat) {
  const walk = (o, pre, d) => {
    let best = null;
    for (const [k, v] of Object.entries(o)) {
      if (!plainObj(v)) continue;
      const i = slotIndexOf(k);
      if (i >= 0 && !best) best = { key: k, path: pre ? pre + '.' + k : k, rank: i };
      else if (i >= 0 && best && i < best.rank) best = { key: k, path: pre ? pre + '.' + k : k, rank: i };
      if (d < SLOT_DEPTH) { const deep = walk(v, pre ? pre + '.' + k : k, d + 1); if (deep && (!best || deep.rank < best.rank)) best = deep; }
    }
    return best;
  };
  return plainObj(stat) ? walk(stat, '', 1) : null;
}
/**
 * 槽位探测：入参是宿主 stat_data 快照（不传 = 空结构，按「无字段」算）。
 * 返回 { key, path, virtual }：virtual = true 表示宿主没有任何背包字段，槽位由地图自建。
 */
export function slotProbe(stat) {
  const hit = findSlot(stat);
  return hit ? { key: hit.key, path: hit.path, virtual: false } : { key: SLOT_KEYS[0], path: '', virtual: true };
}
/** 槽位声明（幂等、只补不覆盖）：prev = 上一轮的声明，probe = slotProbe 的结果。名 / 路径 / 虚拟性任一变了才换新声明 */
export function slotDeclare(prev, probe, floor = null) {
  const p = typeof probe?.key === 'string' && probe.key ? probe : slotProbe(null);
  const cur = plainObj(prev) ? prev : null;
  if (cur && cur.名 === p.key && cur.路径 === (p.path || '') && !!cur.虚拟 === !!p.virtual) return cur;
  return { 名: p.key, 路径: p.path || '', 虚拟: !!p.virtual, 楼: Number.isInteger(floor) ? floor : null };
}
/** 增量写入（同 id 覆盖，绝不重写整表）：rows = [{ id, 名 | name, 地点?, 楼? }]；
 *  返回新的槽位对象（多一个 added = 这一批新增了几件）；没有合法行时原样返回。 */
export function slotPut(cur, rows, floor = null) {
  const base = plainObj(cur) ? cur : slotDeclare(null, slotProbe(null), floor);
  const 物 = { ...(plainObj(base.物) ? base.物 : {}) };
  let added = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    const id = clip(r?.id ?? r?.key, 40), name = clip(r?.name ?? r?.名, 60);
    if (!id || !name) continue;
    const row = { 名: name, 楼: Number.isInteger(r?.floor) ? r.floor : (Number.isInteger(floor) ? floor : null) };
    const place = clip(r?.地点 ?? r?.place, 60); if (place) row.地点 = place;
    if (!物[id] || 物[id].名 !== name || 物[id].地点 !== row.地点) added++;   // 同名同址 = 已在账上，不算新增
    物[id] = row;
  }
  return { ...base, 物, 件: Object.keys(物).length, added };
}
/**
 * 槽位回注文案（一轮一行；没有槽位 → ''）。**只陈述地图自己的账本**，不点名卡里的字段：
 * 附加规则不许引用卡片的字段名（docs/reviews/mvu_093/r1_author.md P1-1），所以这里只说「有 / 没有槽位」与件数。
 */
export function slotLine(slot, cap = 120) {
  if (!plainObj(slot) || !slot.名) return '';
  const n = Number(slot.件) || 0;
  const out = slot.虚拟
    ? `[地图账本·槽位] 本卡变量没有背包字段：地图已自建槽位「${slot.名}」，拾取事实一律记进地图账本（现 ${n} 件），不写变量也不会丢。`
    : `[地图账本·槽位] 本卡的背包栏由地图按缺口对齐（现 ${n} 件）；已有的不重复写。`;
  return out.length > cap ? out.slice(0, cap - 1) + '…' : out;
}
/** 槽位 → 落盘形状（写进聊天变量：eden_map.槽位）；空槽位返回 null（不写空壳） */
export const slotSave = slot => (plainObj(slot) && slot.名 && Number(slot.件) > 0 ? slot : null);
export const SLOT_V1 = { SLOT_ROOT, SLOT_KEYS, slotProbe, slotDeclare, slotPut, slotLine, slotSave };
