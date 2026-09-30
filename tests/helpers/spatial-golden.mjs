// The spatial contract the card script injects (map/tavern/spatial.mjs) for the places of the recorded session fixtures and a sweep of every
// name and alias of the first pack, over the shipped registry and points files. `golden()` computes it; tests/fixtures/spatial_golden.json holds
// what it gave before the contract was built from the node tree (S3-3 T2): the texts of the fixtures in full, the sweep as one hash per word.
//   node tests/helpers/spatial-golden.mjs > tests/fixtures/spatial_golden.json      (only to re-pin on purpose)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as S from '../../map/tavern/spatial.mjs';
import { fnv36 } from '../../map/core/lexicon.mjs';
import { edenInputs } from './eden-inputs.mjs';
import { sessionPlaces } from './session-places.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const reg = edenInputs().maps, pts = {};
for (const [id, m] of Object.entries(reg.maps)) if (m.data && fs.existsSync(ROOT + 'map/' + m.data)) pts[id] = JSON.parse(fs.readFileSync(ROOT + 'map/' + m.data, 'utf8'));

/** One place -> everything the script injects or activates for it. */
export function contractOf(text) {
  const loc = S.locate(reg, text), by = loc?.mapId ? { [loc.mapId]: pts[loc.mapId] || null } : {};
  return { loc, coord: S.coordView({ reg, here: text, pointsByMap: by, t: .5, fog: .62 }), tight: S.coordView({ reg, here: text, pointsByMap: by, t: .25, budget: 40 }), active: [...S.activationOf(reg, text, by, { near: 3 })].sort() };
}
export const wordsOfPack = async () => {
  const { makeRuntime } = await import('../../map/app/nodes-runtime.mjs'), rt = makeRuntime(edenInputs());
  const w = new Set(rt.tree.ids().flatMap(id => { const n = rt.tree.get(id); return [n.name, ...(n.alias || [])]; }).filter(s => typeof s === 'string' && s));
  for (const [id, m] of Object.entries(reg.maps)) for (const k of Object.values(m.markers || {})) if (m.layer?.name && k.name) w.add(`${m.layer.name}·${k.name}`);
  return [...w].sort();
};
export async function golden() {
  const fixtures = {};
  for (const f of ['session_a.json', 'session_b.json']) for (const p of Object.values(sessionPlaces(f)).flat()) fixtures[p] = contractOf(p);
  const sweep = {};
  for (const w of await wordsOfPack()) sweep[w] = fnv36(JSON.stringify(contractOf(w)));
  return { fixtures, sweep };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) process.stdout.write(JSON.stringify(await golden(), null, 1) + '\n');
