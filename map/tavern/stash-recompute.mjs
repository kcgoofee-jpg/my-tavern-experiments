// Recompute and reconciliation of the unified item store from the chat messages (S6-2, docs/kernel-schema.md K-R75; design docs/entity-protocol.md §5.6).
// The store is a cache of the chat: every text row is the product of scanning one message, every other row of an action the host recorded (a map pickup, an
// extension-API call). `step` is the live fold the host runs each round; `recompute` rebuilds a store from scratch out of the messages and the recorded
// actions; `reconcile` says whether the two agree item for item. Pure data in and out: no tavern global, no DOM, no storage.
//   msg = { msgIndex, text, place }      ctx = { worldNames, vocab, probe }      probe = ledger.slotProbe(stat) or null
import * as P from '../core/pickup.mjs';
import { slotDeclare, slotPut } from '../core/ledger.mjs';
import * as S from './stash-store.mjs';
import { hashText } from './context.mjs';

const num = v => (Number.isInteger(v) ? v : null);
/** a text row's fingerprint: the message text and the scan rules it was read with (new rules -> the row is replayed once) */
const markOf = text => hashText(text) + '.' + P.SCAN_VER;
const keyOf = (a, b) => (a === b ? 0 : a === null ? -1 : b === null ? 1 : a - b);
/** what a save has to keep: the rows, the slot, the tombstones (the scan position is not worth a write on its own) */
const content = s => JSON.stringify([s.items, s.slot, s.removed, s.seq]);
/** the slot without the `added` counter slotPut leaves on it */
const cleanSlot = slot => { if (!slot) return null; const { added, ...rest } = slot; return rest; };

/** The slot after putting the facts into it (declared first); only facts it does not hold yet, so an older record keeps its message. Without a probe or rows: unchanged.
 *  The host uses it for the map pickups, whose slot facts follow one round later (as in v1). */
export function captureSlot(cur, rows, probe, msgIndex) {
  if (!probe || !rows.length) return cur.slot;
  const base = slotDeclare(cur.slot, probe, msgIndex), held = cur.slot?.facts || {};
  const fresh = rows.filter(r => !held[r.id]);
  return cleanSlot(slotPut({ ...base, facts: base.facts || held }, fresh, msgIndex));
}

/** The map pickups among the host's session facts whose slot fact is not in the slot yet: a map row's slot fact follows the row by one round (the v1 timing). */
export const mapFactRows = (stash, facts) => (Array.isArray(facts) ? facts : [])
  .filter(f => f?.id && stash?.items?.[f.id]?.src === 'map' && !stash.slot?.facts?.[f.id]).map(f => ({ id: f.id, name: f.name, place: f.place, msgIndex: num(f.floor) }));

/** Scan one message: every pickup fact becomes a text row (unless the item is already in the store or was removed at or after this message) and a slot fact. */
export function scanMessage(stash, msg, ctx = {}) {
  let cur = S.norm(stash);
  const mi = num(msg?.msgIndex), text = String(msg?.text ?? '');
  if (mi === null) return { stash: cur, added: 0 };
  const known = new Set([...(ctx.worldNames || []), ...Object.values(cur.items).map(r => r.name)]);
  let facts = [];
  try { facts = P.scan(text, { known, floor: mi, place: msg.place || '', vocab: ctx.vocab }); } catch (e) { facts = []; }
  let added = 0;
  const mark = markOf(text);
  for (const f of facts) {
    if (cur.items[f.id] || cur.removed[f.id] >= mi) continue;
    const r = S.put(cur, { id: f.id, name: f.name, place: f.place || '', note: S.TEXT_NOTE(mi), qty: 1, src: 'text', carried: true, msgIndex: mi, mark });
    if (r.changed) { cur = r.stash; added++; }
  }
  const slot = captureSlot(cur, facts.map(f => ({ id: f.id, name: f.name, place: f.place, msgIndex: mi })), ctx.probe, mi);
  return { stash: { ...cur, slot, upTo: Math.max(cur.upTo ?? mi, mi) }, added };
}

/** Rebuild what one message gave: its text rows and slot facts go (a row or fact that another channel owns stays), then the message is scanned again. */
export function replayMessage(stash, msg, ctx = {}) {
  const cur = S.norm(stash), mi = num(msg?.msgIndex);
  const items = Object.fromEntries(Object.entries(cur.items).filter(([, r]) => !(r.src === 'text' && r.msgIndex === mi)));
  let slot = cur.slot;
  if (slot) {
    const facts = Object.fromEntries(Object.entries(slot.facts).filter(([id, f]) => f.msgIndex !== mi || (items[id] && items[id].src !== 'text')));
    slot = { ...slot, facts };
  }
  return scanMessage({ ...cur, items, slot }, msg, ctx);
}

/** U-FIX-6: the chat is shorter than the store's scan position (a branch carried another chat's store, or messages were deleted). The text rows of messages
 *  that no longer exist go (they are recomputable from the chat; rows of other channels stay), and the store scans again from the newest message. */
function reanchor(cur, newest) {
  const items = Object.fromEntries(Object.entries(cur.items).filter(([, r]) => !(r.src === 'text' && r.msgIndex > newest)));
  let slot = cur.slot;
  if (slot) slot = { ...slot, facts: Object.fromEntries(Object.entries(slot.facts || {}).filter(([id, f]) => !(f.msgIndex > newest) || (items[id] && items[id].src !== 'text'))) };
  return { ...cur, items, slot, since: Math.min(cur.since ?? newest, newest), upTo: newest - 1 };
}

/** The live fold of one round: replay the messages whose text changed since their rows were made, scan the messages after `upTo` (never before `since`),
 *  and scan the newest message again (a swipe or an edit of it may now say something else). A store without a start anchors on the newest message.
 *  -> { stash, changed, added, replayed }; `changed` = the rows, slot or tombstones differ (the scan position alone is not a change worth a write). */
export function step(stash, msgs, ctx = {}) {
  const start = S.norm(stash);
  const list = (Array.isArray(msgs) ? msgs : []).filter(m => num(m?.msgIndex) !== null).sort((a, b) => a.msgIndex - b.msgIndex);
  if (!list.length) return { stash: start, changed: false, added: 0, replayed: 0 };
  let cur = start, added = 0, replayed = 0;
  const newest = list[list.length - 1];
  if (cur.since === null) cur = { ...cur, since: newest.msgIndex, upTo: newest.msgIndex - 1 };
  else if (cur.since > newest.msgIndex || (cur.upTo ?? -Infinity) >= newest.msgIndex) cur = reanchor(cur, newest.msgIndex);
  const byIndex = new Map(list.map(m => [m.msgIndex, m]));
  const stale = [...new Set(Object.values(cur.items).filter(r => r.src === 'text' && r.mark && byIndex.has(r.msgIndex) && r.mark !== markOf(byIndex.get(r.msgIndex).text)).map(r => r.msgIndex))].sort((a, b) => a - b);
  const done = new Set();
  for (const mi of stale) { const r = replayMessage(cur, byIndex.get(mi), ctx); cur = r.stash; added += r.added; replayed++; done.add(mi); }
  const upTo0 = cur.upTo ?? -Infinity;
  for (const m of list) {
    if (m.msgIndex <= upTo0 || m.msgIndex < cur.since) continue;
    const r = scanMessage(cur, m, ctx); cur = r.stash; added += r.added; done.add(m.msgIndex);
  }
  if (!done.has(newest.msgIndex) && newest.msgIndex >= cur.since) { const r = scanMessage(cur, newest, ctx); cur = r.stash; added += r.added; }
  cur = S.norm(cur);
  return { stash: cur, changed: content(cur) !== content(start), added, replayed };
}

/** Apply one recorded action: { kind: 'put', row, msgIndex } or { kind: 'remove', id, msgIndex }. A map pickup also gives the slot a fact (ctx.probe).
 *  A removal of a row that is not in the store leaves a tombstone anyway: it is the record of the removal. */
export function applyAction(stash, action, ctx = {}) {
  const cur = S.norm(stash), mi = num(action?.msgIndex);
  if (action?.kind === 'put' && action.row) {
    const r = action.row, res = S.put(cur, { ...r, id: r.id, src: r.src, carried: r.carried, msgIndex: mi });
    if (!res.changed) return res.stash;
    const slot = r.src === 'map' ? captureSlot(res.stash, [{ id: r.id, name: r.name, place: r.place, msgIndex: mi }], ctx.probe, mi) : res.stash.slot;
    return { ...res.stash, slot };
  }
  if (action?.kind === 'remove' && action.id) {
    const res = S.remove(cur, action.id, mi);
    if (res.changed) return res.stash;
    return mi === null ? cur : S.norm({ ...cur, removed: { ...cur.removed, [action.id]: mi } });
  }
  return cur;
}

/** The actions that rebuild everything the messages cannot: the rows of the map, api and legacy channels as puts and the tombstones as removes, ordered by
 *  message (none first), then in the order they were recorded. */
export function actionsOf(stash) {
  const cur = S.norm(stash);
  const puts = Object.entries(cur.items).filter(([, r]) => r.src !== 'text').map(([id, r]) => ({ kind: 'put', row: { id, ...r }, msgIndex: r.msgIndex }));
  const gone = Object.entries(cur.removed).map(([id, m]) => ({ kind: 'remove', id, msgIndex: m }));
  return [...puts, ...gone].sort((a, b) => keyOf(a.msgIndex, b.msgIndex));
}

/** Fold from an empty store: the actions of no message first, then every message from `since` in order (the scan, then the actions recorded at that message).
 *  An action at a floor that holds no message is applied between the messages around it. */
export function recompute(msgs, { since = null, actions = [], removed, worldNames, vocab, probe } = {}) {
  const ctx = { worldNames, vocab, probe };
  let cur = S.empty(since);
  if (removed) cur = S.norm({ ...cur, removed });
  const todo = [...(Array.isArray(actions) ? actions : [])].sort((a, b) => keyOf(num(a?.msgIndex), num(b?.msgIndex)));
  const list = (Array.isArray(msgs) ? msgs : []).filter(m => num(m?.msgIndex) !== null).sort((a, b) => a.msgIndex - b.msgIndex);
  let i = 0;
  const flush = upto => { while (i < todo.length && (num(todo[i].msgIndex) === null || todo[i].msgIndex <= upto)) cur = applyAction(cur, todo[i++], ctx); };
  for (const m of list) {
    if (since !== null && m.msgIndex < since) continue;
    flush(m.msgIndex - 1);
    cur = scanMessage(cur, m, ctx).stash;
    flush(m.msgIndex);
  }
  flush(Infinity);
  return cur;
}

const FIELDS = ['name', 'src', 'carried', 'msgIndex', 'qty', 'hidden', 'note', 'mark'];
/** Compare a stored store with a recomputed one. missing = in the recompute only, extra = in the store only, changed = [{ id, fields }]; slot facts count as `slot:<id>`.
 *  `comparePlace`: also compare the places (the caller used the same places). -> { ok, missing, extra, changed } */
export function reconcile(stored, recomputed, { comparePlace = false } = {}) {
  const a = S.norm(stored), b = S.norm(recomputed), missing = [], extra = [], changed = [];
  const fields = comparePlace ? [...FIELDS, 'place'] : FIELDS;
  const diff = (x, y, list) => list.filter(f => x[f] !== y[f]);
  for (const id of Object.keys(b.items)) { if (!a.items[id]) { missing.push(id); continue; } const f = diff(a.items[id], b.items[id], fields); if (f.length) changed.push({ id, fields: f }); }
  for (const id of Object.keys(a.items)) if (!b.items[id]) extra.push(id);
  const sa = a.slot, sb = b.slot;
  if (sa && sb) { const f = diff(sa, sb, ['name', 'path', 'virtual']); if (f.length) changed.push({ id: 'slot', fields: f }); }
  else if (sa || sb) (sa ? extra : missing).push('slot');
  const fa = sa?.facts || {}, fb = sb?.facts || {}, ff = comparePlace ? ['name', 'msgIndex', 'place'] : ['name', 'msgIndex'];
  for (const id of Object.keys(fb)) { if (!fa[id]) { missing.push('slot:' + id); continue; } const f = diff(fa[id], fb[id], ff); if (f.length) changed.push({ id: 'slot:' + id, fields: f }); }
  for (const id of Object.keys(fa)) if (!fb[id]) extra.push('slot:' + id);
  return { ok: !missing.length && !extra.length && !changed.length, missing, extra, changed };
}
