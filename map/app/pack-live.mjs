// Showing a schema-2 pack in the viewer without a reload (docs/kernel-schema.md K-R95, K-R96, K-R100): project it, swap the registry and the node runtime, and draw the open map again at the same
// zoom when its picture or its markers changed. Used when the automatic pack grows (host-messages.mjs) and when edit mode changes the draft (pack-edit-view.mjs).
// `basePack()` is the last pack shown before the filter; `setFilter(fn)` installs the edit draft (fn(pack) -> pack) that every swap applies; `reproject()` shows the base again through it.
import { mapRegistry, currentMapId, setCurrentMapId, setMapRegistry, sleeping, osdViewer } from './state.mjs';
import { $ } from './dom-helpers.mjs';
import { go, srcKey } from './map-switch.mjs';
import { markHere } from './locate.mjs';
import { rebuildHere } from './extension-api.mjs';
import { seedJSON } from './json-cache.mjs';
import { buildRuntimeV2, RT } from './nodes-runtime.mjs';
import { projectV2 } from '../core/pack-v2-view.mjs';
import { packV2 as loaded, PACK } from './current-pack.mjs';
import * as storage from '../core/storage.mjs';

let base = null, filter = null, baseDir = '';
const layoutSig = m => (m ? JSON.stringify([srcKey(m.base), Object.keys(m.markers || {})]) : '');
export const basePack = () => base || loaded;
export const setFilter = fn => { filter = typeof fn === 'function' ? fn : null; };
/** The pack pictures of every place that has some, by place name: { <name>: [{ id, item }] } (the 3D page re-checks the sources itself, K-R101). */
export const roomMedia = () => { const t = RT?.tree, out = {}; if (!t) return out;
  for (const id of t.ids()) { const n = t.get(id); if (Array.isArray(n?.media) && n.media.length && n.name) out[n.name] = n.media.filter(m => RT.media?.[m]).map(m => ({ id: m, item: RT.media[m] })); }
  return out; };
export const remoteOn = () => { try { return storage.get('edenMapPackRemote') === '1'; } catch (e) { return false; } };
/** Where the pack's own pictures are read from: nothing for a foreign pack (card, file), the pack folder otherwise. */
export const packBase = () => (window.__tcPack?.trust === 'foreign' ? '' : PACK?.base ?? '');
export async function swapPack(pack, { base: dir, force = false } = {}) {
  if (!mapRegistry) return;
  base = pack; if (dir !== undefined) baseDir = dir;
  const shown = filter ? filter(pack) : pack, v2 = projectV2(shown, { base: baseDir, remoteOn: remoteOn() }), cur = currentMapId, was = cur ? layoutSig(mapRegistry.maps[cur]) : '', b = cur && osdViewer?.viewport?.getBounds?.(true);
  seedJSON(v2.files); setMapRegistry(v2.registry); buildRuntimeV2(shown, v2.registry); rebuildHere();
  if (cur && !sleeping && (force || was !== layoutSig(v2.registry.maps[cur]))) {
    setCurrentMapId(null);
    if (v2.registry.maps[cur]) { await go(cur); if (b) osdViewer.addOnceHandler('open', () => osdViewer.viewport.fitBounds(b, true)); } else await go(v2.registry.start);
  }
  markHere($('#here').value || '');
}
export const reproject = (force = false) => (basePack() ? swapPack(basePack(), { base: baseDir || packBase(), force }) : Promise.resolve());
