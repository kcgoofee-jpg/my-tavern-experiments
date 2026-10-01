// Frozen v1 behaviour for the S6-2 parity tests; never edit.
// One round of the v1 host flow (map/tavern/loot-flow.mjs at origin/preview bb4d757a: scanPickups L69-77, ledgerSync L89-116, takeLoot L120-143, dice off)
// as pure functions over plain data. The audit, claim, carry and slot sink are the live modules (they are unchanged by S6-2); the store and the
// slot functions are the frozen copies next to this file.
//   state = { inv, slot, lootFacts, settled, carry, sink }     newState() makes one
//   v1Round(state, { text, msgIndex, place, worldRows, probe })    scanPickups + ledgerSync of one round (the host runs them in this order, after the inject)
//   v1Take(state, worldRow, msgIndex, d)                            takeLoot of a world row
import * as P from '../../map/core/pickup.mjs';
import * as S from '../../map/core/stash.mjs';
import { audit, carry, claim } from '../../map/core/ledger.mjs';
import { createSlotSink } from '../../map/tavern/settlement-guard.mjs';
import * as ST from './stash_store_v1_frozen.mjs';
import * as SL from './ledger_slot_v1_frozen.mjs';

export const newState = () => ({ inv: { items: {}, seq: 0 }, slot: null, lootFacts: [], settled: { claimed: [], floor: null, branch: null }, carry: { domains: [], floor: null }, sink: null });

export function v1Round(state, { text, msgIndex, place = '', worldRows = [], probe }) {
  const known = new Set();
  for (const r of worldRows) if (r?.name) known.add(r.name);
  for (const r of ST.rows(state.inv)) if (r?.名) known.add(r.名);
  if (text) {
    let facts = [];
    try { facts = P.scan(text, { known, floor: msgIndex, place }); } catch (e) { facts = []; }
    for (const f of facts) { if (state.lootFacts.some(x => x?.id === f.id)) continue; state.lootFacts.push(f); }
    while (state.lootFacts.length > 40) state.lootFacts.shift();
  }
  if (!state.lootFacts.length) return null;
  const assets = {};
  for (const [id, e] of Object.entries(state.inv?.items || {})) assets[id] = e?.名 || '';
  const aud = audit(state.lootFacts, { assets });
  carry(state.carry, aud.pending);
  const writable = aud.patches.filter(p => p.domain === 'assets');
  const cl = claim(state.settled, writable, { floor: msgIndex, branch: msgIndex + ':0' });
  let fixed = 0;
  for (const p of cl.fresh) {
    const row = worldRows.find(r => r.id === p.id);
    const put = row ? S.lootPut(row) : (p?.name ? { id: p.id, name: p.name, place: p.place || '', note: `正文拾取 · 第 ${Number.isInteger(p.floor) ? p.floor : msgIndex} 楼`, qty: 1 } : null);
    if (!put) continue;
    const res = ST.put(state.inv, put); if (!res.changed) continue;
    state.inv = res.inv; fixed++;
  }
  if (!state.sink) {
    state.sink = createSlotSink({
      declare: () => { state.slot = SL.slotDeclare(state.slot, state.probe, state.msgIndex); return true; },
      put: (key, rows) => { if (!state.slot) state.slot = SL.slotDeclare(state.slot, state.probe, state.msgIndex); state.slot = SL.slotPut(state.slot, rows, state.msgIndex); return true; },
    });
  }
  state.probe = probe; state.msgIndex = msgIndex;
  state.sink.bind(probe); state.sink.ensure(probe);
  for (const f of state.lootFacts) if (f?.id && !state.slot?.物?.[f.id]) state.sink.capture({ id: f.id, 名: f.name, 地点: f.place, floor: f.floor });
  state.sink.flush();
  return { fixed, pending: aud.pending.length, repeated: cl.repeated };
}

export function v1Take(state, row, msgIndex, d = {}) {
  const res = ST.put(state.inv, S.lootPut(row));
  if (!res.changed) return false;
  state.inv = res.inv;
  state.lootFacts.push({ kind: 'loot', id: row.id, name: row.name, place: row.place || d.place || '', map: row.map || d.map || '', hidden: !!row.hidden, qty: row.qty || 1, floor: msgIndex, authority: 'verified' });
  if (state.lootFacts.length > 40) state.lootFacts.shift();
  return true;
}

/** the two injected lines of the state (digest and slot line), as the v1 host builds them */
export const v1Lines = state => ({ digest: ST.digestLine(state.inv, 150), slot: SL.slotLine(state.slot) });
