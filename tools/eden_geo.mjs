// Builder-side helper: the event geography of a shipped pack (its v1 files + overlay.v2.json) as a geo for tavern/events.mjs `setGeo`.
//   import { packGeo } from './eden_geo.mjs';  E.setGeo(packGeo('eden'))          packGeo('town') works the same
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { geoFromV1 } from '../map/core/event-geo.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const J = p => (fs.existsSync(ROOT + p) ? JSON.parse(fs.readFileSync(ROOT + p, 'utf8')) : null);
export function packGeo(id = 'eden') {
  const dir = `map/packs/${id}/`, manifest = J(dir + 'manifest.json'), base = id === 'eden' ? 'map/' : dir, d = manifest.data || {};
  return geoFromV1({ manifest, maps: J(base + d.maps), world: d.world ? J(base + d.world) : null, plan: d.rooms ? J(base + d.rooms) : null,
    names: id === 'eden' ? J('map/i18n/en.json')?.names : null, events: d.events && d.events !== 'builtin' ? J(base + d.events) : null, overlay: d.overlay ? J(base + d.overlay) : null });
}
