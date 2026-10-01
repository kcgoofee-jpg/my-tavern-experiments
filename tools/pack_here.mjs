// Builder-side helper: the current-location engine (app/place-resolver.mjs, the node tree) of a shipped pack, built from its v1 files + overlay.v2.json.
//   import { packHere } from './pack_here.mjs';  const h = packHere('eden');  h.here('伊甸庄园·书房')  ->  { level, map, node, ... } | null     packHere('town') works the same
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeHere } from '../map/app/place-resolver.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const J = p => (fs.existsSync(ROOT + p) ? JSON.parse(fs.readFileSync(ROOT + p, 'utf8')) : null);
export function packHere(id = 'eden', custom = null) {
  const dir = `map/packs/${id}/`, manifest = J(dir + 'manifest.json'), base = id === 'eden' ? 'map/' : dir, d = manifest.data || {};
  return makeHere({ manifest, maps: J(base + d.maps), world: d.world ? J(base + d.world) : null, plan: d.rooms ? J(base + d.rooms) : null, custom,
    names: id === 'eden' ? J('map/packs/eden/names.en.json') : null, events: d.events && d.events !== 'builtin' ? J(base + d.events) : null, overlay: d.overlay ? J(base + d.overlay) : null });
}
