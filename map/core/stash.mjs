// 世界藏物表（Part 5-1 第二步，2026-09-30）：道具有真实的空间归属——哪张图、哪个地标标记、哪个暗格。
// 与聊天变量 eden_map.仓库（tavern/stash-store.mjs）的分工：
//   本表 = 世界里本来就藏着的东西（设定包作者写在 manifest.data.stash 指向的 JSON 里），
//   仓库 = 玩家已经拿到手的东西。两边用同一个 id 对账：已经在手里了，地上就不再发光。
// 数据形状（键一律 ASCII，tools/check_ascii.py 要查；显示名放值里）：
//   { items: [ { id?, map, marker, place, name, hidden?, note?, dc?, qty? } ] }
//   map = 地图 id（空 = 任意图）；marker = 该图 data 里的标记 id；hidden = 暗格名（暗格里藏的东西发现的难度 +3）。
// 纯核心：不碰 DOM / 存储 / 酒馆全局；node 单测 tests/stash.test.mjs。
const CUT = (s, n) => [...String(s ?? '').trim()].slice(0, n).join('');
const NUM = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const fnv = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

export const DC_DEFAULT = 10;      // 搜刮检定默认难度（d20 ≥ DC 才找到）
export const DC_HIDDEN_BONUS = 3;  // 藏在暗格里：难度加值
export const MAX_ROWS = 200;       // 一张包里最多收多少行（多余丢弃，防止误粘贴一大坨）

/** 稳定 id（ASCII）：没给 id 的行由 map|marker|place|name 混出来——加了新项不会让旧 id 漂移 */
export function rowId(row) {
  return 's' + fnv([row?.map, row?.marker, row?.place, row?.name].join('|')).toString(36);
}

/** 规范化：坏行丢弃、字段裁剪、难度夹到 1–30、数量 >1 才记。返回 { items: Row[] }（保持数据里的先后顺序）。 */
export function normStash(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const arr = Array.isArray(src.items) ? src.items : [];
  const items = [];
  for (const e of arr.slice(0, MAX_ROWS)) {
    if (!e || typeof e !== 'object') continue;
    const name = CUT(e.name ?? e.名, 60); if (!name) continue;   // 没有名字的行不知道地上发光什么
    const map = CUT(e.map ?? e.图, 40), marker = CUT(e.marker ?? e.标记, 40);
    const place = CUT(e.place ?? e.地点, 60) || marker;
    const row = { id: CUT(e.id, 40) || '', name, map, marker, place, hidden: CUT(e.hidden ?? e.暗格, 60), note: CUT(e.note ?? e.说明, 200) };
    const dc = Math.round(NUM(e.dc ?? e.难度, DC_DEFAULT));
    row.dc = Math.max(1, Math.min(30, dc));
    const q = Math.floor(NUM(e.qty ?? e.数量, 1));
    if (q > 1) row.qty = Math.min(999, q);
    if (!row.id) row.id = rowId(row);
    items.push(row);
  }
  return { items };
}

/** 过滤 + 排除已到手的：{ map, place, marker, taken }（taken = Set<string> 或 (id)=>bool）；hidden 传 true / false 按暗格筛。
 *  map 为空的行 = 任意图都算；place 既比对地点名也比比对标记 id。 */
export function rows(stash, q = {}) {
  const items = (stash?.items ? (Array.isArray(stash.items) ? stash.items : null) : null) || normStash(stash).items;
  const taken = q.taken;
  const has = id => (taken instanceof Set ? taken.has(id) : typeof taken === 'function' ? !!taken(id) : Array.isArray(taken) ? taken.includes(id) : false);
  return items.filter(r =>
    (!q.map || !r.map || r.map === q.map) &&
    (!q.marker || r.marker === q.marker) &&
    (!q.place || r.place === q.place || r.marker === q.place) &&
    (q.hidden === undefined || !!r.hidden === !!q.hidden) &&
    !has(r.id));
}

/** 在这張图上可见的藏物：'|' 之外还要按到这里来過 / 已经搜出來过过滤——这里只管地图维度（谁看不见由调用方决定） */
export const onMap = (stash, map, taken) => rows(stash, { map, taken });

/** 检定难度：暗格里的更难找（+3） */
export function dcOf(row) {
  return Math.max(1, Math.min(30, (Math.round(NUM(row?.dc, DC_DEFAULT)) || DC_DEFAULT) + (row?.hidden ? DC_HIDDEN_BONUS : 0)));
}

/** 一次搜刮检定（d20 + 加值 ≥ DC）：roll 由调用方给（想要确定性就用 core/rng.mjs 的 rng(seed)）。
 *  返回 { found, roll, mod, dc, margin }；roll 夹到 1–20。 */
export function search(row, roll, mod = 0) {
  const dc = dcOf(row);
  const r = Math.max(1, Math.min(20, Math.round(NUM(roll, 0))));
  const m = Math.round(NUM(mod, 0)), total = r + m;
  return { found: total >= dc, roll: r, mod: m, dc, margin: total - dc };
}

/** 呼吸系数 0–1（渲染层画发光拾取物用；纯函数才能对拍） */
export const glow = (t, period = 2.4) => .5 + .5 * Math.sin((NUM(t, 0) / (NUM(period, 2.4) || 2.4)) * Math.PI * 2);

/** 找到之后交给 inventory.put 的一行（英文参数，tavern/stash-store.mjs 口径） */
export function lootPut(row) {
  const where = row?.hidden ? `藏在${row.hidden}` : '';
  const note = [where, row?.note].filter(Boolean).join('：');
  return { id: row?.id, name: row?.name, place: row?.place, map: row?.map, hidden: !!row?.hidden, ...(note ? { note } : {}), qty: row?.qty || 1 };
}
