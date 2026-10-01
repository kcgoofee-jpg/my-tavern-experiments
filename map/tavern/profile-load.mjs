// The tavern script's variable and roster declarations (docs/kernel-schema.md K-R37..K-R44, K-R69): fetches a pack's manifest (unless the caller has it) and the overlay.v2.json the manifest
// declares as data.overlay, and returns the profile (core/profile.mjs) for MVUBridge.useProfile. Nothing here touches the host; the caller passes the fetcher.
//   loadPackProfile({ fetchJSON(rel) -> Promise<json|null>, packId, manifest? }) -> profile | null     (rel is relative to map/, as the viewer's data paths are)
import { profileFromV1 } from '../core/profile.mjs';
import { profileFromV2 } from './pack-runtime-v2.mjs';

export async function loadPackProfile({ fetchJSON, packId = 'eden', manifest = null } = {}) {
  const dir = 'packs/' + packId + '/', base = packId === 'eden' ? '' : dir;
  const man = manifest || await fetchJSON(dir + 'manifest.json');
  if (!man) return null;
  if (man.schema === 2) return profileFromV2(man);   // schema-2 pack (injected by the pack gate, S9-2): its blocks are inline, no file fetch
  const at = man.data && man.data.overlay;
  return profileFromV1({ manifest: man, overlay: typeof at === 'string' ? await fetchJSON(base + at) : null });
}
