// Builder-side helper (tools/build_worldbook_addon.py): the node tree of the shipped eden data, as the viewer builds it (map/app/nodes-runtime.mjs).
// Prints JSON { chain: { <map id>: [ancestor names, top-down, root left out] }, node: { <map id>: <node name> } }; a map that is only
// a view of a 3D page (no node of its own) has neither entry. Usage: node tools/node_chain.mjs
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeRuntime } from '../map/app/nodes-runtime.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const J = p => (fs.existsSync(ROOT + p) ? JSON.parse(fs.readFileSync(ROOT + p, 'utf8')) : null);
const maps = J('map/data/maps.json');
const rt = makeRuntime({ manifest: J('map/packs/eden/manifest.json'), maps, world: J('map/data/world_markers.json'), names: J('map/packs/eden/names.en.json'), plan: J('map/data/eden_estate_rooms.json') });
const chain = {}, node = {};
for (const id of Object.keys(maps.maps)) {
  if (!rt.tree.has(id)) continue;
  chain[id] = rt.tree.ancestors(id).reverse().filter(a => a !== rt.tree.root).map(a => rt.tree.get(a).name);
  node[id] = rt.tree.get(id).name;
}
process.stdout.write(JSON.stringify({ chain, node }));
