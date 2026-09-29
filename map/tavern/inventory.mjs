// 空间化背包 / 储物箱（Part 5-1，2026-09-30）：搜刮到的道具有实际空间归属——放在哪个房间、哪个暗格，
// 聊天没提也在地点卡上能看到（查看器 TCInv），并压成一行注入给模型（模型据此演「回书房取账本」）。
// 存储位置：聊天变量 eden_map.仓库（与 自定义 / 行程 同一份 saveRoot 大块；不进 stat_data，卡 MVU 结构会丢未知键）。
// 纯数据进出：不碰酒馆全局、不碰 DOM。node 单测直接喂数据（tests/inventory.test.mjs）。
// 字段沿用自定义的中文键口径：名 / 地点 / 层 / 暗格 / 说明 / 数量。

const CUT = (s, n) => String(s ?? '').trim().slice(0, n);

/** 规范化整仓：坏行丢弃、字段裁剪、数量收敛 2–999（1 不写，等于默认）、seq 收敛为有限数。 */
export function norm(data) {
  const src = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const items = {};
  for (const [id, e] of Object.entries(src.items || {})) {
    if (!e || typeof e !== 'object') continue;
    const name = CUT(e.名, 60);
    if (!name) continue;
    const row = { 名: name, 地点: CUT(e.地点, 60), 层: CUT(e.层, 40), 暗格: !!e.暗格 };
    const note = CUT(e.说明, 200); if (note) row.说明 = note;
    const qty = Math.floor(+e.数量);
    if (Number.isFinite(qty) && qty > 1) row.数量 = Math.min(999, qty);
    items[CUT(id, 40) || 'i0'] = row;
  }
  const seq = Math.max(Number(src.seq) || 0, ...Object.keys(items).map(i => +String(i).replace(/^i/, '') || 0));
  return { items, seq: Number.isFinite(seq) && seq > 0 ? seq : Object.keys(items).length };
}

/** 按名 / id 找条目：返回 [id, row]；找不到 null。 */
export function findRow(inv, idOrName) {
  const k = String(idOrName ?? '').trim();
  if (!k) return null;
  const items = inv?.items || {};
  if (items[k]) return [k, items[k]];
  const hit = Object.entries(items).find(([, e]) => e.名 === k || e.名.toLowerCase() === k.toLowerCase());
  return hit || null;
}

/** 新增 / 更新一项：{ name, place?, map?, note?, hidden?, qty?, id? }。给定的 id 已存在 → 更新；
 *  给了没用过的 id → 按它新建（外部系统对接）；没给 id → 按名找，找不到自动编号 i<seq+1>。
 *  地点等空字段缺省 = 不动旧值。返回 { inv, changed }；没有名字 = 不动。 */
export function put(inv, { name, place, map, note, hidden, qty, id } = {}) {
  const nm = CUT(name, 60);
  if (!nm) return { inv: norm(inv), changed: false };
  const cur = norm(inv), given = CUT(id, 40);
  const key = given ? given : (findRow(cur, nm)?.[0] || 'i' + (cur.seq + 1));
  const old = cur.items[key];
  const row = {
    名: nm,
    地点: place !== undefined ? CUT(place, 60) : (old?.地点 || ''),
    层: map !== undefined ? CUT(map, 40) : (old?.层 || ''),
    暗格: hidden !== undefined ? !!hidden : !!old?.暗格,
  };
  const n2 = CUT(note, 200); if (n2) row.说明 = n2; else if (old?.说明 && note === undefined) row.说明 = old.说明;
  const q = qty === undefined ? old?.数量 : Math.floor(+qty);
  if (Number.isFinite(q) && q > 1) row.数量 = Math.min(999, q);
  const items = { ...cur.items, [key]: row };
  const seq = Math.max(cur.seq, Number(String(key).replace(/^i/, '')) || 0);
  return { inv: norm({ items, seq }), changed: true };
}

/** 移除一项（id 或名字）。返回 { inv, changed }。 */
export function remove(inv, idOrName) {
  const hit = findRow(norm(inv), idOrName);
  if (!hit) return { inv: norm(inv), changed: false };
  const items = { ...norm(inv).items }; delete items[hit[0]];
  return { inv: norm({ items, seq: norm(inv).seq }), changed: true };
}

/** 查询：{ place?, map?, name?, hidden? } 全部命中的行（地点升序，同地点保持写入顺序）。rows = [{ id, 名, 地点, 层, 暗格, 说明?, 数量? }]。 */
export function rows(inv, q = {}) {
  const items = norm(inv).items;
  const out = Object.entries(items)
    .filter(([, e]) => (!q.place || e.地点 === q.place) && (!q.map || e.层 === q.map)
      && (!q.name || e.名.includes(q.name)) && (q.hidden === undefined || e.暗格 === !!q.hidden))
    .map(([id, e]) => ({ id, ...e }));
  return out.sort((a, b) => (a.地点 || '未归位') < (b.地点 || '未归位') ? -1 : (a.地点 || '未归位') > (b.地点 || '未归位') ? 1 : 0);   // 码点比较：不依赖 ICU，测试可复现
}

/** 注入摘要（一行，≤ cap 字）：按地点归组——「书房·暗格：机密账本；客厅：现金×3」。空仓 = ''。 */
export function digestLine(inv, cap = 150) {
  const all = rows(inv);
  if (!all.length) return '';
  const byPlace = new Map();
  for (const e of all) {
    const k = (e.地点 || '未归位') + (e.暗格 ? '·暗格' : '');
    if (!byPlace.has(k)) byPlace.set(k, []);
    byPlace.get(k).push(e.名 + (e.数量 > 1 ? '×' + e.数量 : ''));
  }
  let out = '随身仓与藏物：';
  for (const [p, list] of byPlace) out += `${p} ${list.join('、')}；`;
  out = out.replace(/；$/, '');
  return out.length > cap ? out.slice(0, cap - 1) + '…' : out;
}
