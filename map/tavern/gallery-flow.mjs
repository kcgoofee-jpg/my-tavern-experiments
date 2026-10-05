// The pack's media source on the host side (K-R106, docs/kernel-schema.md): read the card script's picture table at run time, find every tag the model wrote in the chat,
// and send the viewer { chars, scenes }. Read only, and nothing is kept: the table is read from the card each chat, the scenes are recomputed from the floors' text each round,
// no address is written to a variable or to local storage, and no picture is ever put into a message (the card's own script does that).
// Factory style like the other *-flow.mjs: createGalleryFlow(host) is called once by chars-flow.mjs; DEPS are the host keys it reads.
import { thFn } from './host-tavernhelper.mjs';
import { hostAdapter } from './host-adapter.mjs';
import { getProfile } from './pack-profile.mjs';
import { parseText } from './msgtext.mjs';
import { gallerySpec, readTable, galleryUrlOk } from '../core/gallery-spec.mjs';
import { collectScenes, mediaSig } from '../core/gallery-scenes.mjs';
export const DEPS = ['alive', 'floorNow', 'frame', 'life', 'lsGet', 'mvuBridge', 'post'];
export const SWITCH_KEY = 'edenMapGallery';   // default on (the user's decision for this source); '0' = off

export function createGalleryFlow(host) {
  for (const k of DEPS) if (!(k in host)) throw new Error('gallery-flow: missing dep ' + k);
  let spec = null, specOf = null, table = null, tableChat = null, tableSig = '', sent = null, timer = 0, loading = false, wasOn = false, resend = true, sentTable = '', lastChat = null;
  const cache = new Map();   // floor -> { msg, text }: only the tag scan's input, droppable
  const on = () => { try { return host.lsGet(SWITCH_KEY) !== '0'; } catch (e) { return true; } };
  const chat = () => { try { return host.mvuBridge.chatId() || ''; } catch (e) { return ''; } };
  const specNow = () => { const g = getProfile().gallery; if (g !== specOf) { specOf = g; spec = gallerySpec(g); table = null; tableChat = null; } return spec; };
  /** The card's script data, structured (getCharData -> data.extensions); may arrive as a promise. Read once per chat. */
  function loadTable() {
    if (!spec || loading || tableChat === chat()) return;
    loading = true; const mine = chat();
    const done = c => { loading = false; tableChat = mine; const urlOk = u => galleryUrlOk(getProfile().avatar, spec, u);
      try { table = readTable(spec, c?.data?.extensions, urlOk); } catch (e) { table = { chars: [] }; }
      tableSig = table.chars.map(c => c.name + ':' + Object.values(c.sets).map(l => l.length).join('.')).join(';'); resend = true; schedule(0); };
    try { const g = thFn('getCharData'); const r = g ? g('current') : null; if (r && typeof r.then === 'function') r.then(done, () => done(null)); else done(r); } catch (e) { done(null); }
  }
  function floors() {
    let list = []; try { const top = host.floorNow; if (top >= 0) list = hostAdapter.chat.messages(`0-${top}`, { role: 'assistant' }) || []; } catch (e) { list = []; }
    const keep = new Set(), out = [], open = spec.tag.open;
    for (const m of list) {
      const f = m?.message_id, msg = typeof m?.message === 'string' ? m.message : ''; if (!Number.isInteger(f) || !msg.includes(open)) continue;
      keep.add(f); let c = cache.get(f); if (!c || c.msg !== msg) { c = { msg, text: parseText(msg) }; cache.set(f, c); }
      out.push({ floor: f, text: c.text, raw: msg });
    }
    for (const k of [...cache.keys()]) if (!keep.has(k)) cache.delete(k);
    return out;
  }
  function run() {
    timer = 0; if (host.life.dead || !host.alive) return;
    if (chat() !== lastChat) { lastChat = chat(); reset(); }
    if (!on()) { if (wasOn) { wasOn = false; sent = null; host.post({ type: 'eden-map:media', on: false }); } return; }
    if (!specNow()) { if (wasOn) { wasOn = false; host.post({ type: 'eden-map:media', on: false }); } return; }
    wasOn = true; loadTable(); if (!table) return;
    let rows = []; try { rows = host.mvuBridge.rosterRows({ msgs: [] }); } catch (e) { rows = []; }
    const scenes = collectScenes({ spec, table, floors: floors(), placeOf: (f, raw) => host.mvuBridge.floorPlace(f, raw).place || '', rosterRows: rows });
    const sig = chat() + '|' + tableSig + '|' + mediaSig(scenes);
    if (sig === sent && !resend) return;
    const withTable = resend || sentTable !== tableSig;
    sent = sig; sentTable = tableSig; resend = false;
    host.post({ type: 'eden-map:media', on: true, id: spec.id, cats: spec.tag.categories, ...(withTable ? { chars: table.chars } : {}), scenes });
  }
  function schedule(ms = 400) { if (timer) clearTimeout(timer); timer = setTimeout(run, ms); }
  /** The viewer asks (it loaded, or its switch was turned on): send everything again. */
  const force = () => { resend = true; sent = null; schedule(0); };
  try { const onAsk = e => { if (e.data?.type === 'eden-map:media-ask' && e.source === host.frame?.contentWindow && !host.life.dead) force(); }; window.parent.addEventListener('message', onAsk); host.life?.add?.(() => window.parent.removeEventListener('message', onAsk)); } catch (e) { /* no page around (unit tests) */ }
  /** A new chat: the card's table and the floors' scan input are read again. */
  function reset() { table = null; tableChat = null; cache.clear(); sent = null; sentTable = ''; resend = true; }
  return { schedule, force, reset, get table() { return table; }, get spec() { return spec; } };
}
