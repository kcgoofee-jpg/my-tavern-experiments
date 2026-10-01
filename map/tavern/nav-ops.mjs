// Navigator overlays (docs/layers-schema.md §9, K-R86, I-04): the host side of OP_CLUE / OP_MARKER. The navigator's validated ops (operation-dsl `apply` -> clues, markers)
// are kept for the session, each row stamped with the floor and the map of the player's current place; rows older than 20 messages are dropped and each list holds at
// most 12. Session only: nothing here is persisted or written anywhere (the chat log stays the only truth). Pure: no DOM, no host globals.
export const OPS_LIMITS = Object.freeze({ age: 20, cap: 12, routes: 3 });   // S8-4b K-R113: the suggested routes (the same ageing, at most 3) ride along in this state
export const EMPTY = Object.freeze({ clues: Object.freeze([]), markers: Object.freeze([]), routes: Object.freeze([]) });
const keep = (rows, floor) => rows.filter(r => !Number.isFinite(floor) || !Number.isFinite(r.floor) || floor - r.floor <= OPS_LIMITS.age);

/** age(state, floor) -> the state without rows older than 20 messages. */
export const age = (state, floor) => ({ clues: keep(state.clues, floor), markers: keep(state.markers, floor), routes: keep(state.routes || [], floor) });
/** add(state, d, { floor, map }) -> the state with the clues, markers and routes of one navigator run appended, stamped `{ floor, map }`, aged, capped at 12 per list and 3 routes (newest kept). */
export function add(state, d, { floor, map } = {}) {
  const stamp = { floor: Number.isFinite(floor) ? floor : null, map: typeof map === 'string' && map ? map : null }, one = extra => (Array.isArray(extra) ? extra : []).map(r => ({ ...r, ...stamp }));
  const s = age(state || EMPTY, floor);
  return { clues: [...s.clues, ...one(d?.clues)].slice(-OPS_LIMITS.cap), markers: [...s.markers, ...one(d?.markers)].slice(-OPS_LIMITS.cap), routes: [...s.routes, ...one(d?.routes)].slice(-OPS_LIMITS.routes) };
}
/** sig(state) -> a string that changes when a row is added or dropped. */
export const sig = state => JSON.stringify([state.clues, state.markers, state.routes]);
