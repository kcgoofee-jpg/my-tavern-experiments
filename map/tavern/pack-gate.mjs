// The pack gate (docs/kernel-schema.md K-R90..K-R92, K-R99, K-R103; docs/zero-config.md §2): one script serves every card. The entry imports this module first (eden-map.js, line 11); its top-level
// `await` resolves the pack of the current card and sets `window.__tcPack` before the entry's synchronous start reads it (exactly what a script with a baked pack gives today).
// Order (K-R90): 0 the user's choice for this card, or a pack baked into the script; 1 a pack embedded in the card (K-R91); 2 the best index match (K-R92); 3 the automatic pack
// (S9-3: derived from the card by auto-pack.mjs, loaded only here). The legacy-default pack (core/pack.mjs DEFAULT_ID) leaves `window.__tcPack` undefined: the host starts exactly as before S9.
// A refused source falls through and leaves a problem in `window.__packProblems`; nothing blocks. Reads only the card (through mvu-bridge `hostAccess`), its own worldbooks, the top-level
// keys of the chat variables, the shipped index and the user's choice; writes only this browser's `edenMapPackPick` / `edenMapPackLlm` and the pack store.
import { redirected } from './follow-gate.mjs';
import { cdnFetch, thFn } from './host-tavernhelper.mjs';
import { hostAdapter } from './host-adapter.mjs';
import { hostAccess } from './mvu-bridge.mjs';
import { readCardBasics, readCardBooks, readCardSource, cardKey, embeddedText } from './card-source.mjs';
import { parsePack, importPack, gateLlm, MAX_URL_BYTES } from './pack-runtime-v2.mjs';
import { bestMatch, rowsOf } from '../core/pack-index.mjs';
import { DEFAULT_ID, ID_RE, chatVarOf } from '../core/pack.mjs';
import { validate2, resolveBlocks } from '../core/pack-v2.mjs';
import { fnv36, cut } from '../core/lexicon.mjs';
import { packStore } from '../core/pack-store-db.mjs';

export const PICK_KEY = 'edenMapPackPick', LLM_KEY = 'edenMapPackLlm';   // never pack-namespaced: read before any pack is known (core/storage.mjs)
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

/** env = { win, base (…/map/), entry (entry module URL), fetch, access, store, get, set, chatKeys, reimport, lang, budget } */
export function createGate(env) {
  const baked = isObj(env.win.__tcPack) && ID_RE.test(env.win.__tcPack.id || '') ? env.win.__tcPack : null;   // a pack baked into the script counts as the user's choice (Z-17)
  const cache = new Map(); let indexP = null, current = null, restarts = 0, busy = null, again = false;
  const getJson = async rel => { const r = await env.fetch(env.base + rel); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
  const index = async () => { const j = await (indexP ??= getJson('packs/index.json').then(j => (j && j.schema === 1 && Array.isArray(j.packs) ? j : null)).catch(() => null)); if (!j) indexP = null; return j; };   // a failed read is tried again next time
  const readJ = k => { try { const v = JSON.parse(env.get(k) || 'null'); return isObj(v) ? v : {}; } catch (e) { return {}; } };
  const writeJ = (k, o) => { try { env.set(k, JSON.stringify(o)); } catch (e) {} };
  const setPick = (key, choice) => { const o = readJ(PICK_KEY); delete o[key]; if (choice) o[key] = choice; for (const k of Object.keys(o).slice(0, Math.max(0, Object.keys(o).length - 50))) delete o[k]; writeJ(PICK_KEY, o); };

  // ---- result builders: { id, source, trust, legacy?, tc (the object for window.__tcPack) } ----
  function foreign(pack, source, problems = []) {
    const g = gateLlm(pack, readJ(LLM_KEY), 'foreign');   // K-R103: the model text only while the stored hash matches
    return { id: pack.id, source, trust: 'foreign', problems, llm: { has: g.has, on: g.on, changed: g.changed, hash: g.hash },
      tc: { id: pack.id, chatVar: chatVarOf(pack.id, g.pack), manifest: g.pack, schema: 2, source, trust: 'foreign' } };
  }
  async function shipped(id, source, idx) {
    if (!rowsOf(idx).some(r => r.id === id) || !ID_RE.test(id)) return null;
    if (id === DEFAULT_ID) return { id, source, trust: 'shipped', legacy: true, problems: [] };
    const dir = 'packs/' + id + '/', man = await getJson(dir + 'manifest.json');
    if (man.schema === 2) {
      const rb = await resolveBlocks(man, p => getJson(dir + p)), v = validate2(rb.manifest, { trusted: true });
      return v.pack ? { id, source, trust: 'shipped', problems: [...rb.problems, ...v.problems], tc: { id, chatVar: chatVarOf(id, v.pack), manifest: v.pack, schema: 2, source, trust: 'shipped' } } : null;
    }
    const ev = man.data && man.data.events;   // built the way tools/build_preview_script.py pack_stamp builds it
    return { id, source, trust: 'shipped', problems: [], tc: { id, chatVar: chatVarOf(id, man), manifest: man, events: ev && ev !== 'builtin' ? await getJson(dir + ev) : null, schema: 1, source, trust: 'shipped' } };
  }
  const auto = async (card, known) => {   // tier 3 (K-R95): the automatic pack, derived from the card; loaded here and nowhere else, so the first pack never reaches auto-pack.mjs
    try {
      const A = await (env.loadAuto ? env.loadAuto() : import('./auto-pack.mjs')), src = await readCardSource(env.access, known);
      const cache = await (env.chatAuto ? env.chatAuto('c_' + fnv36((card.name || '') + '\n' + card.avatar)) : null), r = A.resolveAuto(src, { uiLang: env.lang(), cache }), f = foreign(r.pack, 'auto', r.problems);
      return { ...f, tc: { ...f.tc, fp: r.fp, rev: 1 } };   // rev 1 = the pack as injected; each growth sends the next one (eden-map:pack)
    } catch (e) {   // a card that cannot be read still gets the root-only pack
      const name = card.name || '', id = 'c_' + fnv36(name + '\n' + card.avatar), v = validate2({ id, schema: 2, title: name ? cut(name, 80) : env.lang() === 'en' ? 'Map' : '地图' });
      return foreign(v.pack, 'auto', v.problems);
    }
  };

  async function fromChoice(ch, key, idx, ids, note) {
    if (ch.startsWith('index:')) { const id = ch.slice(6); if (ids.includes(id)) return shipped(id, 'choice', idx); note('choice-missing', 'choice', id); return null; }
    const file = ch === 'file', url = ch.slice(4); let v = null;
    if (!file && ch.startsWith('url:')) {   // a URL is fetched again at each start; the last good copy serves when that fails (K-R99)
      const r = await importPack({ kind: 'url', url }, { fetch: env.fetch, shipped: ids });
      if (r.pack) { v = r; env.store.put(key, { kind: 'url', url, text: r.text }); } else note('import-refused', 'choice', r.problems[0] && r.problems[0].code);
    } else if (!file) return null;
    if (!v) { const rec = await env.store.get(key); if (rec && rec.kind === (file ? 'file' : 'url') && (file || rec.url === url)) { const p = parsePack(rec.text, { cap: MAX_URL_BYTES, shipped: ids }); if (p.pack) v = p; } }
    return v && v.pack ? foreign(v.pack, 'choice', v.problems) : null;
  }

  /** K-R90 for the current card. Returns { id, source, trust, key, problems, tc?, legacy? }. */
  async function resolve() {
    const problems = [], note = (code, from, detail) => problems.push({ code, from, ...(detail !== undefined ? { detail: String(detail).slice(0, 80) } : {}) });
    const { card } = await readCardBasics(env.access), key = cardKey(card);
    let src = cache.get(key);   // per card key for the session: the books and the embedded text (the chat variables are read fresh)
    if (!src) { const books = card ? await readCardBooks(env.access) : []; cache.set(key, src = { emb: embeddedText(card, books), titles: books.flatMap(b => b.entries.map(e => e.title)).filter(Boolean) }); }
    const idx = await index(), ids = rowsOf(idx).map(r => r.id), done = r => ({ ...r, key, problems: [...problems, ...(r.problems || [])] });
    const ch = readJ(PICK_KEY)[key];
    if (typeof ch === 'string' && ch !== 'automatic') { try { const r = await fromChoice(ch, key, idx, ids, note); if (r) return done(r); } catch (e) { note('choice-failed', 'choice', e && e.message); } }
    if (baked) return done({ id: baked.id, source: 'baked', trust: 'shipped', tc: baked });
    if (src.emb) { const v = parsePack(src.emb.text, { inline: true, shipped: ids }); if (v.pack) return done(foreign(v.pack, 'card', v.problems)); note('embedded-refused', 'card', v.problems[0] && v.problems[0].code); }
    if (!idx) { note('index-unavailable', 'index'); return done({ id: DEFAULT_ID, source: 'default', trust: 'shipped', legacy: true }); }   // cannot tell which pack the card has: the legacy default, as before S9 (never an empty automatic pack because of a network hiccup)
    const m = bestMatch(idx, { card: card || {}, titles: src.titles, chatKeys: await env.chatKeys(), chatVarOf: id => chatVarOf(id) });
    if (m) { try { const r = await shipped(m.id, 'index', idx); if (r) return done(r); } catch (e) { note('index-pack-failed', 'index', m.id); } }
    return done(card ? await auto(card, { card }) : { id: DEFAULT_ID, source: 'default', trust: 'shipped', legacy: true });   // no card read: the legacy default, as before S9
  }

  function apply(r) {
    current = { id: r.id, source: r.source, key: r.key, llm: r.llm || null, trust: r.trust };
    if (r.legacy) delete env.win.__tcPack;
    else env.win.__tcPack = r.tc === baked ? baked : { ...r.tc, problems: (r.problems || []).slice(0, 20), ...(r.llm ? { llm: r.llm } : {}) };
    env.win.__packProblems = r.problems || [];
  }
  async function restart(key) {   // Z-19: stop the running instance (the takeover path), clear what modules keep of its pack, start the entry again; a new query each time so A -> B -> A evaluates it again
    restarts++;
    try { env.win.parent.__edenMapCleanup?.(); } catch (e) {}
    try { await env.reset?.(); } catch (e) {}
    return Promise.resolve(env.reimport(new URL('eden-map.js', env.entry).href + '?k=' + encodeURIComponent(key) + '&r=' + restarts)).catch(e => { try { console.warn('[eden-map] pack switch: restart failed', e); } catch (x) {} });
  }
  const same = r => !!current && r.id === current.id && r.source === current.source;
  function onChat() {   // the host's chat-change event: a new card resolves again; a changed pack id or source restarts the instance
    if (busy) { again = true; return busy; }
    return (busy = (async () => { try { const r = await resolve(); if (!same(r)) { apply(r); await restart(r.key); } } catch (e) {} finally { busy = null; if (again) { again = false; onChat(); } } })());
  }
  async function start() {
    const p = resolve().catch(() => null); let t = 0;
    const r = await Promise.race([p, new Promise(res => { t = setTimeout(() => res(null), env.budget); })]); clearTimeout(t);
    if (r) apply(r);
    else { apply(baked ? { id: baked.id, source: 'baked', trust: 'shipped', tc: baked } : { id: DEFAULT_ID, source: 'default', trust: 'shipped', legacy: true }); p.then(late => { if (late && !same(late)) { apply(late); restart(late.key); } }); }   // over budget: start with what we have, correct by a restart
    try { window.parent.__edenGateOff?.(); } catch (e) {}   // a restart on a new build evaluates this module again: retire the previous gate's handler, or every chat change runs one gate per past build
    try { const ev = hostAdapter.events.name('CHAT_CHANGED');
      if (hostAdapter.ok('eventOn') && ev) { const h = hostAdapter.events.on(ev, onChat); window.parent.__edenGateOff = () => { try { if (typeof h?.stop === 'function') h.stop(); else hostAdapter.events.off(ev, onChat); } catch (e) {} delete window.parent.__edenGateOff; }; } } catch (e) {}
    return current;
  }
  /** `eden-map:pack-pick` (K-R99): validate, store, set the choice, resolve again and restart. Returns { ok, id?, source?, problems }. */
  async function pick(msg) {
    const { card } = await readCardBasics(env.access), key = cardKey(card), idx = await index(), ids = rowsOf(idx).map(r => r.id), k = msg && msg.kind, bad = p => ({ ok: false, problems: p.slice(0, 5) });
    let choice = null;
    if (k === 'automatic') await env.store.remove(key);
    else if (k === 'index') { if (!ids.includes(msg.id)) return bad([{ code: 'index-missing' }]); choice = 'index:' + msg.id; }
    else if (k === 'url' || k === 'file') {
      const r = await importPack(k === 'url' ? { kind: 'url', url: msg.url } : { kind: 'file', text: msg.text }, { fetch: env.fetch, shipped: ids });
      if (!r.pack) return bad(r.problems);
      await env.store.put(key, { kind: k, url: msg.url, text: r.text }); choice = k === 'url' ? 'url:' + msg.url : 'file';
    } else return bad([{ code: 'kind' }]);
    setPick(key, choice);
    const r = await resolve(); apply(r); await restart(key);
    return { ok: true, id: r.id, source: r.source, problems: r.problems.slice(0, 10) };
  }
  /** K-R103: the go-live switch of the running foreign pack: stores (or clears) its text hash, resolves again and restarts. */
  async function setLlm(on) {
    if (!current || !current.llm || !current.llm.has) return false;
    const o = readJ(LLM_KEY); if (on) o[current.id] = current.llm.hash; else delete o[current.id]; writeJ(LLM_KEY, o);
    const r = await resolve(); apply(r); await restart(r.key); return true;
  }
  return { start, resolve, pick, setLlm, onChat, get current() { return current; } };
}

const realEnv = () => {
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  return { win: window, base: new URL('../', import.meta.url).href, entry: import.meta.url, fetch: cdnFetch, access: hostAccess(), store: packStore, get,
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
    chatAuto: async id => { try { const v = await thFn('getVariables')?.({ type: 'chat' }), o = v && v[chatVarOf(id)]; return isObj(o) ? o.auto : null; } catch (e) { return null; } },   // the droppable cache of the automatic pack (K-R95)
    chatKeys: async () => { try { const v = await thFn('getVariables')?.({ type: 'chat' }); return isObj(v) ? Object.keys(v).filter(k => isObj(v[k])) : []; } catch (e) { return []; } },
    reset: async () => { const [P, R] = await Promise.all([import('./pack-profile.mjs'), import('./mvu-readers.mjs')]); P.setProfile(null); R.setVarRoot('eden_map'); },   // the two modules that keep the running pack's declarations (the others are set again by the new instance's start)
    reimport: u => import(u), lang: () => (get('edenMapLang') === 'en' ? 'en' : 'zh'), budget: 300 };
};
export const gate = !redirected && typeof window !== 'undefined' ? createGate(realEnv()) : null;
if (gate) await gate.start();
export const pick = msg => (gate ? gate.pick(msg) : Promise.resolve({ ok: false, problems: [{ code: 'no-gate' }] }));
export const setLlm = on => (gate ? gate.setLlm(on) : Promise.resolve(false));
