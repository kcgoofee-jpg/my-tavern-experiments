// The map's own settlement record (docs/kernel-schema.md K-R78; design docs/entity-protocol.md §8). Pure: no DOM, no globals, no storage.
// The npc and events domains of the settlement audit (core/ledger.mjs audit) have somewhere to write that is not the card's `stat_data`: the chat variable's
// `ledger` key, { npc: { <name>: { place, node, msgIndex, src: 'routine' } }, events: { <id>: { type, level, node, msgIndex } } }, at most CAP entries each.
// The record is a droppable cache: every entry is recomputable from the chat and the schedule. Only holes are written, never an existing entry.
//   recordNorm(raw)                  validate a stored record (bad entries dropped, fields cut, the oldest by msgIndex go over the cap)
//   recordPut(rec, patches, msgIndex)  apply the audit's npc / events patches -> { rec, added }; an entry that is already there is kept
//   recordLanded(rec)                the landed views the audit reads: { npc: { name: place }, events: { id: true } }
//   describeRecord(rec)              { npc: n, events: n }
export const CAP = 200;
const NODE_RE = /^[a-z_][a-z0-9_]{0,63}$/;
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const cut = (s, n) => [...String(s ?? '').trim()].slice(0, n).join('');
const msgOf = v => (Number.isInteger(v) ? v : null);
const nodeOf = v => (typeof v === 'string' && NODE_RE.test(v) ? v : '');
const newest = obj => Object.fromEntries(Object.entries(obj).sort((a, b) => (a[1].msgIndex ?? -1) - (b[1].msgIndex ?? -1)).slice(-CAP));   // the oldest go first

export function recordNorm(raw) {
  const r = isObj(raw) ? raw : {}, npc = {}, events = {};
  for (const [name, e] of Object.entries(isObj(r.npc) ? r.npc : {})) {
    const n = cut(name, 60), place = isObj(e) ? cut(e.place, 60) : '';
    if (n && place) npc[n] = { place, node: nodeOf(e.node), msgIndex: msgOf(e.msgIndex), src: 'routine' };
  }
  for (const [id, e] of Object.entries(isObj(r.events) ? r.events : {})) {
    const k = cut(id, 40), type = isObj(e) ? cut(e.type, 40) : '';
    if (k && type) events[k] = { type, level: Math.max(0, Math.min(3, Math.floor(+e.level) || 0)), node: nodeOf(e.node), msgIndex: msgOf(e.msgIndex) };
  }
  return { npc: newest(npc), events: newest(events) };
}

export function recordPut(rec, patches, msgIndex = null) {
  const cur = recordNorm(rec), npc = { ...cur.npc }, events = { ...cur.events }, at = msgOf(msgIndex);
  let added = 0;
  for (const p of Array.isArray(patches) ? patches : []) {
    if (!isObj(p)) continue;
    if (p.domain === 'npc') {
      const n = cut(p.npc, 60), place = cut(p.room ?? p.place, 60);
      if (n && place && !npc[n]) { npc[n] = { place, node: nodeOf(p.node), msgIndex: at, src: 'routine' }; added++; }
    } else if (p.domain === 'events') {
      const k = cut(p.id, 40), type = cut(p.type, 40);
      if (k && type && !events[k]) { events[k] = { type, level: Math.max(0, Math.min(3, Math.floor(+p.level) || 0)), node: nodeOf(p.node), msgIndex: at }; added++; }
    }
  }
  return { rec: { npc: newest(npc), events: newest(events) }, added };
}

export const recordLanded = rec => {
  const r = recordNorm(rec);
  return { npc: Object.fromEntries(Object.entries(r.npc).map(([n, e]) => [n, e.place])), events: Object.fromEntries(Object.keys(r.events).map(k => [k, true])) };
};
export const describeRecord = rec => { const r = recordNorm(rec); return { npc: Object.keys(r.npc).length, events: Object.keys(r.events).length }; };
