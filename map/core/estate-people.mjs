// The people a 3D building shows (docs/ui-refactor.md U-27 / U-28, S7-3 T8): the people the chat places in rooms of this building, as the list the viewer sends to the 3D page.
// The same people rows and the same node resolution as the 2D people tab; nothing new is stored. Pure: no DOM, no storage, no host globals.
//   buildEstatePeople({ rows, rooms, nodeOf, max? }) -> [{ name, room, floor, color, avatar? }]   `room` is the node id of the room the person stands in
//     rows    [{ name, place, color, avatar?, shown }]  the people rows (CharactersView): `shown` = the person is switched on and 「在地图上显示人物」 is on
//     rooms   [{ node, floor }]                         the building's rooms (from the 3D page's ready message); a node with several rooms stands for the first
//     nodeOf  place text -> node id | null              the viewer's node resolution (locate result `node`)
//   avatarOk(url): only an https address or an inline image up to 64 KB is passed to the page; anything else is left out (the chip shows the initials).
//   sameList(a, b): the lists are equal (the viewer sends `estate:people` only when the list changes).
export const MAX_CHIPS = 30, MAX_AVATAR = 64 * 1024;
export const avatarOk = u => typeof u === 'string' && ((/^https:\/\//.test(u) && u.length <= 2048) || (/^data:image\//.test(u) && u.length <= MAX_AVATAR));

export function buildEstatePeople({ rows = [], rooms = [], nodeOf = () => null, max = MAX_CHIPS } = {}) {
  const at = new Map();   // node id -> floor of its first room
  for (const r of rooms) if (r && typeof r.node === 'string' && !at.has(r.node)) at.set(r.node, r.floor ?? null);
  const out = [], seen = new Set();
  for (const c of rows) {
    if (!c || !c.shown || typeof c.name !== 'string' || !c.name || seen.has(c.name)) continue;
    const node = typeof c.place === 'string' && c.place ? nodeOf(c.place) : null;
    if (!node || !at.has(node)) continue;
    seen.add(c.name);
    const p = { name: c.name, room: node, floor: at.get(node), color: typeof c.color === 'string' ? c.color : '' };
    if (avatarOk(c.avatar)) p.avatar = c.avatar;
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}
export const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);
