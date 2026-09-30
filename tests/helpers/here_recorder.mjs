// Stands in for map/here.mjs inside a child process (see here_hooks.mjs): same exports, but buildIndex remembers what it
// was given and resolveHere records { value, cfg, v1 } for every call on such an index. The list is written to the file
// named by HERE_RECORD when the process exits.
import { writeFileSync } from 'node:fs';
import * as real from '../../map/here.mjs?real';
export * from '../../map/here.mjs?real';

const cfg = new WeakMap(), calls = [];
export function buildIndex(reg, world = null, names = null, custom = null, plan = null) {
  const idx = real.buildIndex(reg, world, names, custom, plan);
  cfg.set(idx, { world: !!world, names: !!names, plan: !!plan, custom: custom ? JSON.parse(JSON.stringify(custom)) : null });
  return idx;
}
export function resolveHere(value, idx) {
  const r = real.resolveHere(value, idx);
  if (idx && cfg.has(idx) && typeof value === 'string') calls.push({ value, cfg: cfg.get(idx), v1: r });
  return r;
}
process.on('exit', () => { if (process.env.HERE_RECORD) writeFileSync(process.env.HERE_RECORD, JSON.stringify(calls)); });
