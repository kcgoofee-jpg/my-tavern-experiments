// The unified item store (S6-2, docs/kernel-schema.md K-R74; design docs/entity-protocol.md §5): every item the map knows about lives in one place,
// `<chat var>.stash`, in one ASCII-keyed shape. Rows come from a pickup found in the message text (src 'text'), from a world-stash row the player took on the
// map (src 'map'), from the extension API (src 'api'), or from a v1 chat variable whose origin is not recognisable (src 'legacy'). The W12 virtual slot (the
// map's own account of the facts it captured) is `stash.slot`. The v1 keys are read only: V1_KEYS names them, `migrate` reads them once, nothing writes them
// (S10 removes the constant with the migration). Pure data in and out: no tavern global, no DOM, no storage; node tests feed it data directly.
import { itemId } from '../core/pickup.mjs';
import { slotNorm } from '../core/ledger.mjs';

/** The chat-variable keys of the v1 stores (inventory and slot). Read only; removed at S10 together with `migrate`. */
export const V1_KEYS = Object.freeze({ inventory: '仓库', slot: '槽位' });
export const SRC = ['text', 'map', 'api', 'legacy'];
/** The note of a text row; it reaches the digest line, so it stays verbatim. */
export const TEXT_NOTE = n => '正文拾取 · 第 ' + n + ' 楼';
const MAX_REMOVED = 200;
const NODE_RE = /^[a-z_][a-z0-9_]{0,63}$/;
const CUT = (s, n) => String(s ?? '').trim().slice(0, n);
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const msgOf = v => (Number.isInteger(v) ? v : null);
const nodeOf = v => (typeof v === 'string' && NODE_RE.test(v) ? v : '');
const qtyOf = v => { const q = Math.floor(+v); return Number.isFinite(q) && q > 1 ? Math.min(999, q) : undefined; };
const seqOf = (seq, items) => {
  const n = Math.max(Number(seq) || 0, ...Object.keys(items).map(i => +String(i).replace(/^i/, '') || 0));
  return Number.isFinite(n) && n > 0 ? n : Object.keys(items).length;
};

/** An empty store whose scan starts at `msgIndex` (null = the first scan anchors it). */
export const empty = msgIndex => {
  const m = Number.isInteger(msgIndex) && msgIndex >= 0 ? msgIndex : null;
  return { v: 1, items: {}, seq: 0, slot: null, removed: {}, since: m, upTo: m === null ? null : m - 1 };
};

function normRow(e) {
  if (!isObj(e)) return null;
  const name = CUT(e.name, 60);
  if (!name) return null;
  const src = SRC.includes(e.src) ? e.src : 'legacy';
  const row = { name, place: CUT(e.place, 60), map: CUT(e.map, 40), node: nodeOf(e.node), hidden: !!e.hidden };
  const note = CUT(e.note, 200); if (note) row.note = note;
  const qty = qtyOf(e.qty); if (qty) row.qty = qty;
  row.src = src; row.carried = typeof e.carried === 'boolean' ? e.carried : src === 'text' || src === 'map'; row.msgIndex = msgOf(e.msgIndex);
  const mark = typeof e.mark === 'string' ? CUT(e.mark, 16) : ''; if (mark) row.mark = mark;
  return row;
}

/** Validate a whole store: bad rows dropped, fields cut, quantities 2-999, tombstones <= 200 (the oldest go), `seq` finite. */
export function norm(raw) {
  const s = isObj(raw) ? raw : {};
  const items = {};
  for (const [id, e] of Object.entries(isObj(s.items) ? s.items : {})) { const row = normRow(e); if (row) items[CUT(id, 40) || 'i0'] = row; }
  const removed = {};
  const tomb = Object.entries(isObj(s.removed) ? s.removed : {}).filter(([, m]) => Number.isInteger(m)).sort((a, b) => a[1] - b[1]).slice(-MAX_REMOVED);
  for (const [id, m] of tomb) removed[CUT(id, 40)] = m;
  const out = { v: 1, items, seq: seqOf(s.seq, items), slot: slotNorm(s.slot), removed, since: msgOf(s.since), upTo: msgOf(s.upTo) };
  if (isObj(s.from)) out.from = { keys: (Array.isArray(s.from.keys) ? s.from.keys : []).filter(k => typeof k === 'string').map(k => CUT(k, 20)).slice(0, 4), msgIndex: msgOf(s.from.msgIndex) };
  return out;
}

/** The v1 inventory, normalised exactly as v1 did (same cuts, same `seq`): { items: { id: { 名, 地点, 层, 暗格, 说明?, 数量? } }, seq }. */
function normV1(raw) {
  const items = {};
  for (const [id, e] of Object.entries(isObj(raw?.items) ? raw.items : {})) {
    if (!isObj(e)) continue;
    const name = CUT(e.名, 60); if (!name) continue;
    const row = { 名: name, 地点: CUT(e.地点, 60), 层: CUT(e.层, 40), 暗格: !!e.暗格 };
    const note = CUT(e.说明, 200); if (note) row.说明 = note;
    const qty = qtyOf(e.数量); if (qty) row.数量 = qty;
    items[CUT(id, 40) || 'i0'] = row;
  }
  return { items, seq: seqOf(raw?.seq, items) };
}

/** Where a v1 row came from, by its id: a name-derived id = found in text; a world-stash id = taken on the map; anything else is not recognisable. */
const originOf = (id, name, worldIds) => (itemId(name) === id ? 'text' : worldIds.has(id) || /^s[0-9a-z]{1,8}$/.test(id) ? 'map' : 'legacy');

/** The v1 slot -> the ASCII slot (null when it is not a v1 slot). */
function slotV1(raw) {
  if (!isObj(raw) || typeof raw.名 !== 'string') return null;
  const facts = {};
  for (const [id, f] of Object.entries(isObj(raw.物) ? raw.物 : {})) if (isObj(f)) facts[id] = { name: f.名, msgIndex: msgOf(f.楼), ...(f.地点 ? { place: f.地点 } : {}) };
  return slotNorm({ name: raw.名, path: raw.路径 ?? '', virtual: !!raw.虚拟, msgIndex: msgOf(raw.楼), facts });
}

/** The store of a chat variable. `root.stash` present -> validated, not migrated; else the v1 keys (once) -> { stash, migrated: true }; else an empty store.
 *  Never mutates `root`. `worldIds` = the ids of the world-stash rows (they may load later: see `retag`). */
export function migrate(root, { msgIndex = null, worldIds } = {}) {
  const r = isObj(root) ? root : {};
  if (isObj(r.stash)) return { stash: norm(r.stash), migrated: false };
  const keys = [V1_KEYS.inventory, V1_KEYS.slot].filter(k => isObj(r[k]));
  if (!keys.length) return { stash: empty(msgIndex), migrated: false };
  const ids = worldIds instanceof Set ? worldIds : new Set(worldIds || []);
  const v1 = normV1(r[V1_KEYS.inventory]), items = {};
  for (const [id, e] of Object.entries(v1.items)) {
    const src = originOf(id, e.名, ids);
    const row = { name: e.名, place: e.地点, map: e.层, node: '', hidden: e.暗格 };
    if (e.说明) row.note = e.说明;
    if (e.数量) row.qty = e.数量;
    items[id] = { ...row, src, carried: src !== 'legacy', msgIndex: null };
  }
  const base = empty(msgIndex);
  return { stash: { ...base, items, seq: v1.seq, slot: slotV1(r[V1_KEYS.slot]), from: { keys, msgIndex: msgOf(msgIndex) } }, migrated: true };
}

/** Find a row by id or name: [id, row], else null. */
export function findRow(stash, idOrName) {
  const k = String(idOrName ?? '').trim();
  if (!k) return null;
  const items = stash?.items || {};
  if (items[k]) return [k, items[k]];
  return Object.entries(items).find(([, e]) => e.name === k || e.name.toLowerCase() === k.toLowerCase()) || null;
}

/** Add or update one row. A given id that exists updates it; a new given id creates it (external systems); no id: found by name, else numbered i<seq+1>.
 *  An absent field keeps the old value. -> { stash, changed }; no name = no change. */
export function put(stash, { id, name, place, map, node, note, hidden, qty, src = 'api', carried, msgIndex, mark } = {}) {
  const cur = norm(stash), nm = CUT(name, 60);
  if (!nm) return { stash: cur, changed: false };
  const given = CUT(id, 40), key = given || (findRow(cur, nm)?.[0] || 'i' + (cur.seq + 1)), old = cur.items[key];
  const from = SRC.includes(src) ? src : 'api';
  const row = { name: nm, place: place !== undefined ? CUT(place, 60) : (old?.place || ''), map: map !== undefined ? CUT(map, 40) : (old?.map || ''),
    node: node !== undefined ? nodeOf(node) : (old?.node || ''), hidden: hidden !== undefined ? !!hidden : !!old?.hidden };
  const n2 = CUT(note, 200); if (n2) row.note = n2; else if (old?.note && note === undefined) row.note = old.note;
  const q = qtyOf(qty === undefined ? old?.qty : qty); if (q) row.qty = q;
  row.src = from; row.carried = typeof carried === 'boolean' ? carried : from === 'text' || from === 'map'; row.msgIndex = msgOf(msgIndex) ?? old?.msgIndex ?? null;
  if (from === 'text' && (mark || old?.mark)) row.mark = mark || old.mark;
  return { stash: norm({ ...cur, items: { ...cur.items, [key]: row }, seq: Math.max(cur.seq, Number(String(key).replace(/^i/, '')) || 0) }), changed: true };
}

/** Remove a row (id or name). A removed text row leaves a tombstone `removed[id] = msgIndex`. -> { stash, changed }. */
export function remove(stash, idOrName, msgIndex) {
  const cur = norm(stash), hit = findRow(cur, idOrName);
  if (!hit) return { stash: cur, changed: false };
  const items = { ...cur.items }; delete items[hit[0]];
  const removed = hit[1].src === 'text' && Number.isInteger(msgIndex) ? { ...cur.removed, [hit[0]]: msgIndex } : cur.removed;
  return { stash: norm({ ...cur, items, removed }), changed: true };
}

/** The world stash may load after the migration ran: v1 rows of unknown origin, in a migrated store, whose id is a world row id become map rows. Idempotent. */
export function retag(stash, worldIds) {
  const cur = norm(stash), ids = worldIds instanceof Set ? worldIds : new Set(worldIds || []);
  if (!cur.from || !ids.size) return { stash: cur, changed: false };
  let changed = false;
  const items = {};
  for (const [id, e] of Object.entries(cur.items)) {
    if (e.src === 'legacy' && e.msgIndex === null && ids.has(id)) { items[id] = { ...e, src: 'map', carried: true }; changed = true; } else items[id] = e;
  }
  return { stash: changed ? { ...cur, items } : cur, changed };
}

/** Query: { place?, map?, name?, hidden?, carried? } all matching rows `{ id, ...row }`, sorted by place (code-point order; no place sorts as 未归位), stable. */
export function rows(stash, q = {}) {
  const out = Object.entries(norm(stash).items)
    .filter(([, e]) => (!q.place || e.place === q.place) && (!q.map || e.map === q.map) && (!q.name || e.name.includes(q.name))
      && (q.hidden === undefined || e.hidden === !!q.hidden) && (q.carried === undefined || e.carried === !!q.carried))
    .map(([id, e]) => ({ id, ...e }));
  return out.sort((a, b) => (a.place || '未归位') < (b.place || '未归位') ? -1 : (a.place || '未归位') > (b.place || '未归位') ? 1 : 0);   // code-point order: no ICU, reproducible tests
}

/** What `eden-map:inv.items` and `EdenMap.getInv()` carry (P-08, the external contract until S10): `[{ id, 名, 地点, 层, 暗格, 说明?, 数量? }]` in `rows()` order. */
export const wireRows = stash => rows(stash).map(e => ({ id: e.id, 名: e.name, 地点: e.place, 层: e.map, 暗格: e.hidden, ...(e.note ? { 说明: e.note } : {}), ...(e.qty ? { 数量: e.qty } : {}) }));

/** The injected digest, one line (<= cap characters), grouped by place: byte-identical to v1 over the same rows. Empty store = ''. */
export function digestLine(stash, cap = 150) {
  const all = rows(stash);
  if (!all.length) return '';
  const byPlace = new Map();
  for (const e of all) {
    const k = (e.place || '未归位') + (e.hidden ? '·暗格' : '');
    if (!byPlace.has(k)) byPlace.set(k, []);
    byPlace.get(k).push(e.name + (e.qty > 1 ? '×' + e.qty : ''));
  }
  let out = '随身仓与藏物：';
  for (const [p, list] of byPlace) out += `${p} ${list.join('、')}；`;
  out = out.replace(/；$/, '');
  return out.length > cap ? out.slice(0, cap - 1) + '…' : out;
}
