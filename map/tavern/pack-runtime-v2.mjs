// The host side of schema-2 packs (docs/kernel-schema.md K-R90, K-R91, K-R99, K-R103; docs/zero-config.md §2.4, §2.6, §9). Plain functions: the caller passes `fetch`.
//   profileFromV2(pack) / geoFromV2(pack)   what profile-load.mjs and event-geo-load.mjs return for an injected schema-2 pack (no v1 file fetch)
//   importPack(src, env) / parseEmbedded    K-R99 URL / file import and K-R91 embedded packs: size caps, JSON, schema 2, validate2 as foreign
//   gateLlm(pack, hashes)                   K-R103: a foreign pack's `llm` block reaches the host only while its stored hash equals the block's
import { profileOf } from '../core/profile.mjs';
import { validate2, resolveBlocks, withDefaults } from '../core/pack-v2.mjs';
import { BLOCKS } from '../core/pack-v2-spec.mjs';
import { buildTree } from '../core/nodes.mjs';
import { makeGeo, taxonomyOf } from '../core/event-geo.mjs';
import { fnv36 } from '../core/lexicon.mjs';

export const MAX_URL_BYTES = 8 << 20, MAX_EMBED_BYTES = 1 << 20;   // Z-12: 8 MB read from a URL or a file, 1 MB embedded in a card
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

export const profileFromV2 = pack => profileOf(pack);
/** The node tree and event taxonomy of a schema-2 pack as the tavern script needs them (`lang`: the pack's own language, else the UI language). */
export function geoFromV2(pack, { lang } = {}) {
  const p = withDefaults(pack);
  return makeGeo({ tree: buildTree(Array.isArray(p.nodes) ? p.nodes : [], { title: p.title }), views: isObj(p.views) ? p.views : {}, lang: p.lang || lang, lexicon: p.lexicon, transit: p.transit, ...taxonomyOf(p) });
}

// ---- K-R103 ----
const canon = v => (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : isObj(v) ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v) ?? 'null');
export const llmHash = llm => fnv36(canon(llm));
/** `hashes` = the stored `edenMapPackLlm` object { <pack id>: <hash> }. Returns { pack, has, hash, on, changed }: `pack` has no `llm` unless the stored hash equals the block's;
 *  `changed` = a hash is stored for this pack but differs (a passive note, the switch reads as off). A shipped pack is never touched. */
export function gateLlm(pack, hashes, trust = 'foreign') {
  const llm = pack?.llm, has = isObj(llm) && Object.keys(llm).length > 0;
  if (trust === 'shipped' || !has) return { pack, has, hash: has ? llmHash(llm) : '', on: has, changed: false };
  const hash = llmHash(llm), stored = isObj(hashes) ? hashes[pack.id] : undefined, on = stored === hash;
  if (on) return { pack, has, hash, on, changed: false };
  const { llm: _drop, ...rest } = pack;
  return { pack: rest, has, hash, on: false, changed: typeof stored === 'string' && stored !== hash };
}

// ---- K-R91 / K-R99 ----
const fail = (code, detail) => ({ pack: null, problems: [{ code, path: 'manifest', ...(detail !== undefined ? { detail } : {}) }] });
/** A pack text -> { pack, problems }; pack null = refused. Schema 2 only; `inline`: every block must be inline (a card cannot carry files). Validated as foreign; ids of `shipped` packs are refused (K-R63). */
export function parsePack(text, { cap = MAX_EMBED_BYTES, inline = false, shipped = [] } = {}) {
  if (typeof text !== 'string' || !text.trim()) return fail('empty');
  if (new TextEncoder().encode(text).length > cap) return fail('limit-size');
  let m; try { m = JSON.parse(text); } catch (e) { return fail('json'); }
  return checkManifest(m, { inline, shipped, maxBytes: cap });   // Z-12: the document limit is the read cap (1 MB embedded, 8 MB for a stored URL / file pack)
}
export function checkManifest(m, { inline = false, shipped = [], maxBytes, source } = {}) {
  if (!isObj(m)) return fail('type', 'object');
  if (m.schema !== 2) return fail('schema', m.schema);
  if (inline) for (const k of BLOCKS) if (typeof m[k] === 'string') return fail('not-inline', k);
  return validate2(m, { trusted: false, shipped, maxBytes, source });
}

/** Reads a fetch Response as text with a streaming cap: throws `limit-size` once more than `cap` bytes arrive (the rest is cancelled). */
export async function readCapped(res, cap = MAX_URL_BYTES) {
  const len = +res.headers?.get?.('content-length') || 0;
  if (len > cap) { try { await res.body?.cancel?.(); } catch (e) {} throw new Error('limit-size'); }
  if (!res.body?.getReader) { const t = await res.text(); if (new TextEncoder().encode(t).length > cap) throw new Error('limit-size'); return t; }
  const rd = res.body.getReader(), parts = []; let n = 0;
  for (;;) {
    const { done, value } = await rd.read(); if (done) break;
    n += value.length; if (n > cap) { try { await rd.cancel(); } catch (e) {} throw new Error('limit-size'); }
    parts.push(value);
  }
  return new TextDecoder().decode(await new Blob(parts).arrayBuffer());
}

/** K-R99: { kind: 'url', url } | { kind: 'file', text } -> { pack, problems, text? }. A URL must be https; blocks given as paths are fetched from the URL's folder (they must stay under it) and
 *  are refused for a file. `env.fetch(url)` must send no credentials and no referrer (the host's cdnFetch). `text` is what to keep for offline starts (the manifest as read, blocks inlined). */
export async function importPack(src, env) {
  const shipped = env.shipped || [];
  let text = '', folder = '';
  try {
    if (src.kind === 'url') {
      const u = new URL(String(src.url || '')); if (u.protocol !== 'https:') return fail('not-https');
      folder = new URL('./', u).href;
      const r = await env.fetch(u.href); if (!r.ok) return fail('fetch', r.status);
      text = await readCapped(r);
    } else if (src.kind === 'file') { text = String(src.text ?? ''); if (new TextEncoder().encode(text).length > MAX_URL_BYTES) return fail('limit-size'); }
    else return fail('kind');
  } catch (e) { return fail(e && e.message === 'limit-size' ? 'limit-size' : 'fetch'); }
  let m; try { m = JSON.parse(text); } catch (e) { return fail('json'); }
  if (!isObj(m)) return fail('type', 'object');
  if (m.schema !== 2) return fail('schema', m.schema);
  const problems = [];
  if (BLOCKS.some(k => typeof m[k] === 'string')) {   // blocks as paths: only for a URL pack, under its folder, inside one shared byte budget
    let left = MAX_URL_BYTES;
    const get = async rel => {
      if (!folder) throw new Error('file');
      const u = new URL(rel, folder); if (!u.href.startsWith(folder)) throw new Error('outside');
      const r = await env.fetch(u.href); if (!r.ok) throw new Error('fetch');
      const t = await readCapped(r, left); left -= t.length; return JSON.parse(t);
    };
    const r = await resolveBlocks(m, get); m = r.manifest; problems.push(...r.problems);
    text = JSON.stringify(m);   // the copy kept for offline starts holds every block
  }
  const v = checkManifest(m, { shipped, source: src.kind });   // K-R66 by source: a URL / file pack may be 8 MB
  return { pack: v.pack, problems: [...problems, ...v.problems], text };
}
