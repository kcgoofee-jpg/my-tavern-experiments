// Builder-side helper: the place records of a shipped pack (map/core/place-record.mjs, K-R134) as the viewer computes them.
// tools/build_worldbook_addon.py calls `node tools/place_records.mjs [pack id]` and writes the room entries from this output; tests import loadPack().
// Prints JSON { records: [{ parentKeys (the building's name and other names), anchor (the marker id on the flat map), id, name, kind, parent, floors, where, desc, access, facts, alias, wb, keys, hasText, text }], shared: { name: true } }.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fromV1 } from '../map/core/compat-v1.mjs';
import { records, entryText, entryKeys, hasText, sharedNames } from '../map/core/place-record.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const J = p => (fs.existsSync(ROOT + p) ? JSON.parse(fs.readFileSync(ROOT + p, 'utf8')) : null);

/** The place sources of a pack: its node list (schema-1 files + overlay, as the viewer builds it) and the data files the records read. */
export function loadPack(id = 'eden') {
  const dir = `map/packs/${id}/`, manifest = J(dir + 'manifest.json'), base = id === 'eden' ? 'map/' : dir, d = manifest.data || {};
  const maps = J(base + d.maps), plan = d.rooms ? J(base + d.rooms) : null;
  const { pack } = fromV1({ manifest, maps, world: d.world ? J(base + d.world) : null, plan, names: d.names?.en ? J(d.names.en.startsWith('packs/') ? 'map/' + d.names.en : base + d.names.en) : null,
    overlay: d.overlay ? J(d.overlay.startsWith('packs/') ? 'map/' + d.overlay : base + d.overlay) : null });
  const model = id === 'eden' ? 'map/estate/model/' : '', mm = model ? J(model + 'manifest.json') : null;
  const points = {}; for (const [k, m] of Object.entries(maps.maps || {})) if (m?.data) { const p = J(base + m.data); if (p?.markers) points[k] = { markers: p.markers.map(({ id, nx, ny, ax, ay }) => ({ id, nx, ny, ax, ay })) }; }
  return { nodes: pack.nodes, plan, addon: d.addon_places ? J(base + d.addon_places)?.places : (id === 'eden' ? J('map/data/addon_places.json')?.places : null), building: mm?.building || null,
    zones: model ? J(model + 'zones.json')?.zones : null, extras: model ? J(model + 'extras.json') : null, points };
}
export function dump(pack) {
  const sh = sharedNames(pack), all = records(pack), by = new Map(all.map(r => [r.id, r]));
  return { records: all.map(r => ({ parentKeys: by.get(r.parent) ? entryKeys(by.get(r.parent)) : [], anchor: r.anchor, id: r.id, name: r.name, kind: r.kind, parent: r.parent, floors: r.floors.map(f => f.id), where: r.where, desc: r.desc, access: r.access, facts: r.facts, alias: r.alias,
    keys: entryKeys(r), hasText: hasText(r), text: entryText(r) })), shared: sh };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) process.stdout.write(JSON.stringify(dump(loadPack(process.argv[2] || 'eden'))));
