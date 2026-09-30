// Known probe failures (baseline): tools/browser/known-failures.json = [{ probe, check, since, reason, owner_step }].
// A failing check whose name contains `check` (same probe) is reported as KNOWN and does not turn the exit code red;
// any other failure still does. A listed check that passes again is reported as FIXED so the entry can be removed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(new URL('./known-failures.json', import.meta.url));
export const probeName = (argv1 = process.argv[1]) => path.basename(argv1 || '', '.mjs');

export function loadKnown(file = FILE) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return []; }
}

export function knownFor(probe, checkName, list = loadKnown()) {
  return list.find(k => k.probe === probe && checkName.includes(k.check)) || null;
}

// Keeps the bookkeeping for one probe run: call judge(name, pass) per check, then done() for the end-of-run notes.
export function tracker(probe = probeName(), list = loadKnown()) {
  const passed = new Set();
  return {
    judge(name, pass) {
      const k = pass ? null : knownFor(probe, name, list);
      if (pass) for (const e of list) if (e.probe === probe && name.includes(e.check)) passed.add(e);
      return k;
    },
    fixed() { return list.filter(e => e.probe === probe && passed.has(e)); },
  };
}
