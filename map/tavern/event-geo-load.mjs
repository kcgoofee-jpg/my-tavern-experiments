// The tavern script's event geography (docs/kernel-schema.md K-R24, K-R67): fetches what a pack's node tree is built from (its schema-1 files and the
// overlay.v2.json its manifest declares as data.overlay) and returns a geo for events.mjs `setGeo`. Nothing here touches the host; the caller passes the fetcher.
//   loadEventGeo({ fetchJSON(rel) -> Promise<json|null>, packId, manifest?, events? }) -> geo | null     (rel is relative to map/, as the viewer's data paths are)
import { geoFromV1 } from '../core/event-geo.mjs';

export async function loadEventGeo({ fetchJSON, packId = 'eden', manifest = null, events = null } = {}) {
  const dir = 'packs/' + packId + '/', base = packId === 'eden' ? '' : dir;
  const man = manifest || await fetchJSON(dir + 'manifest.json'), d = man?.data || {};
  const at = k => (d[k] && d[k] !== 'builtin' ? fetchJSON(base + d[k]) : Promise.resolve(null));
  const [maps, world, plan, tax, overlay, en] = await Promise.all([at('maps'), at('world'), at('rooms'), events ? Promise.resolve(events) : at('events'), at('overlay'), packId === 'eden' ? fetchJSON('i18n/en.json') : null]);
  return maps ? geoFromV1({ manifest: man || { id: packId }, maps, world, plan, events: tax, overlay, names: en?.names || null }) : null;
}
