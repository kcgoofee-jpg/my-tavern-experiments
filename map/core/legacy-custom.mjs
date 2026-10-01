// The user's own room names of the first versions (<= 0.9.2), kept on this machine: with a chat id per chat under "edenMap:chat:<id>:custom", else
// globally under "edenMap:custom"; the value is JSON { rooms: { name: room } }. Read-only here: tavern/mvu-readers.mjs `migrateRooms` folds them into the chat variable.
// store = an object with getItem (localStorage; a fake in tests). Nothing goes online; bad data never throws.
export const customKey = chat => (chat ? `edenMap:chat:${chat}:custom` : 'edenMap:custom');
export function readCustom(store, chat) {
  let o = null; try { o = JSON.parse(store?.getItem(customKey(chat)) || 'null'); } catch (e) {}
  const rooms = {};
  if (o && o.rooms && typeof o.rooms === 'object') for (const [k, v] of Object.entries(o.rooms)) if (typeof k === 'string' && typeof v === 'string' && k && v) rooms[k] = v;
  return { rooms };
}
