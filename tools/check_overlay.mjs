// Validates map/packs/<id>/overlay.v2.json (docs/kernel-schema.md K-R67) against the pack it belongs to. Called by tools/check_pack.py.
//   node tools/check_overlay.mjs <pack id>      prints one problem per line, exit 1 when there are any (a pack without an overlay passes)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fromV1 } from '../map/core/compat-v1.mjs';
import { buildTree } from '../map/core/nodes.mjs';
import { applyOverlay, applyOverlayEvents, applyOverlayVars, applyOverlayEntities, applyOverlayUi } from '../map/core/overlay-v2.mjs';
import { validate2 } from '../map/core/pack-v2.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url)), id = process.argv[2];
const J = p => (p && fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
const dir = ROOT + 'map/packs/' + id + '/', file = dir + 'overlay.v2.json';
if (!id || !fs.existsSync(file)) process.exit(0);
const manifest = J(dir + 'manifest.json'), base = id === 'eden' ? ROOT + 'map/' : dir, data = manifest?.data || {};
const inputs = { manifest, maps: J(base + data.maps), world: J(base + data.world), plan: J(base + data.rooms), names: J(ROOT + 'map/packs/eden/names.en.json'), events: J(base + data.events) };
const ov = J(file), errs = [], ID = /^[a-z][a-z0-9_]{0,63}$/, WORD = /^[^\n]{1,60}$/;
const evOnly = ov && ov.nodes === undefined && ['events', 'llm', 'vars', 'entities', 'ui'].some(k => ov[k] && typeof ov[k] === 'object');
if (!ov || ov.schema !== 2 || !(Array.isArray(ov.nodes) || evOnly)) { console.log(`${id}: overlay.v2.json needs "schema": 2 and a "nodes" array`); process.exit(1); }
ov.nodes ||= [];
const baseNodes = fromV1(inputs).pack.nodes || [], have = new Set(baseNodes.map(n => n.id)), seen = new Set();
const words = (o, k) => { if (o[k] === undefined) return; if (!Array.isArray(o[k]) || o[k].some(w => typeof w !== 'string' || !WORD.test(w))) errs.push(`${id}: node ${o.id}: ${k} must be a list of words (1-60 characters, one line)`); else if (o[k].length > (k === 'alias' ? 64 : 256)) errs.push(`${id}: node ${o.id}: too many ${k}`); };
for (const o of ov.nodes) {
  if (!o || typeof o.id !== 'string' || !ID.test(o.id)) { errs.push(`${id}: overlay node with a bad id ${JSON.stringify(o?.id)}`); continue; }
  if (seen.has(o.id)) errs.push(`${id}: overlay lists node ${o.id} twice`); seen.add(o.id);
  if (!have.has(o.id) && (typeof o.name !== 'string' || !o.name)) errs.push(`${id}: new node ${o.id} needs a name`);
  words(o, 'alias'); words(o, 'hints');
  if (o.at !== undefined && !(o.at && Number.isFinite(o.at.x) && Number.isFinite(o.at.y))) errs.push(`${id}: node ${o.id}: at needs numeric x and y`);
}
const merged = applyOverlay(baseNodes, ov), all = new Set(merged.nodes.map(n => n.id));
for (const p of merged.problems) errs.push(`${id}: overlay problem ${JSON.stringify(p)}`);
for (const n of merged.nodes) {
  if (n.parent !== undefined && !all.has(n.parent)) errs.push(`${id}: node ${n.id}: parent ${n.parent} does not exist`);
  if (Array.isArray(n.alias) && ![...n.alias, ...(n.hints || [])].includes(n.name)) errs.push(`${id}: node ${n.id}: alias does not list the name (put the name in hints to keep it weak)`);
}
if (ov.events !== undefined) {   // K-R68: the merged events block must pass the kernel's own schema, and only the keys an overlay may carry are allowed
  const r = applyOverlayEvents(fromV1(inputs).pack.events, ov);
  for (const p of r.problems) errs.push(`${id}: overlay events problem ${JSON.stringify(p)}`);
  const v = validate2({ id, schema: 2, title: manifest?.title || id, events: r.events });
  for (const p of v.problems || []) if (String(p.path || '').startsWith('events')) errs.push(`${id}: overlay events: ${JSON.stringify(p)}`);
}
for (const [k, apply, field] of [['vars', applyOverlayVars, 'vars'], ['entities', applyOverlayEntities, 'entities']]) {   // K-R69: the merged block must pass the kernel's own schema
  if (ov[k] === undefined) continue;
  const r = apply(fromV1(inputs).pack[k], ov);
  for (const p of r.problems) errs.push(`${id}: overlay ${k} problem ${JSON.stringify(p)}`);
  const v = validate2({ id, schema: 2, title: manifest?.title || id, [k]: r[field] }, { trusted: true });
  for (const p of v.problems || []) if (String(p.path || '').startsWith(k)) errs.push(`${id}: overlay ${k}: ${JSON.stringify(p)}`);
}
if (ov.ui !== undefined) {   // K-R70: the merged ui block goes through the same functions and the kernel's own schema
  const up = [], merged_ui = applyOverlayUi(fromV1(inputs).pack.ui, ov.ui, up);
  for (const p of up) errs.push(`${id}: overlay ui problem ${JSON.stringify(p)}`);
  const v = validate2({ id, schema: 2, title: manifest?.title || id, ui: merged_ui }, { trusted: true });
  for (const p of v.problems || []) if (String(p.path || '').startsWith('ui') && !/^ui\.(start|levels)/.test(String(p.path))) errs.push(`${id}: overlay ui: ${JSON.stringify(p)}`);
}
const tree = buildTree(merged.nodes, { title: manifest?.title });
for (const p of tree.problems) errs.push(`${id}: tree problem ${JSON.stringify(p)}`);
for (const e of errs) console.log(e);
process.exit(errs.length ? 1 : 0);
