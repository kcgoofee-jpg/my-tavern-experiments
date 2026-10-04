// Module-init order in map/app must not decide whether the map boots. The viewer's entry graph is
// evaluated as one unit when a bundler is in play, so a top-level read of a binding from a module
// on the far side of an import cycle fires before that module's body runs (seen as
// `Cannot read properties of undefined (reading 'init' / 'collapse')` in the PERF-BUNDLE study).
// Two defences live here:
//   1. the boot path reads a separate script's plugin registration only through optional chains
//      (events-view.mjs is its own <script> in viewer.html, so the registration is never ordered
//      relative to the app modules);
//   2. a ratchet over the static import graph: the amount of cycle in map/app may only shrink.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR = fileURLToPath(new URL('../map/app/', import.meta.url));
const files = readdirSync(DIR).filter(f => f.endsWith('.mjs'));

const graph = () => {
  const g = {};
  for (const f of files) {
    const src = readFileSync(path.join(DIR, f), 'utf8');
    const deps = new Set();
    for (const m of src.matchAll(/import\s+(?:[\s\S]*?from\s+)?['"](\.[^'"]+)['"]/g)) {
      const dep = path.normalize(path.join(DIR, m[1]));
      if (dep.startsWith(DIR)) deps.add(dep);
    }
    g[f] = [...deps].map(d => path.relative(DIR, d));
  }
  return g;
};

// Tarjan SCC; a cycle "exists" where an SCC has more than one member (self-imports are excluded)
function sccs(g) {
  const idx = {}, low = {}, on = {}, st = [], out = [];
  let c = 0;
  const strong = v => {
    idx[v] = low[v] = c++; st.push(v); on[v] = true;
    for (const w of g[v]) {
      if (idx[w] === undefined) { strong(w); low[v] = Math.min(low[v], low[w]); }
      else if (on[w]) low[v] = Math.min(low[v], idx[w]);
    }
    if (low[v] === idx[v]) {
      const scc = [];
      for (;;) { const w = st.pop(); on[w] = false; scc.push(w); if (w === v) break; }
      if (scc.length > 1) out.push(scc);
    }
  };
  for (const v of Object.keys(g)) if (idx[v] === undefined) strong(v);
  return out;
}

// Snapshot 2026-10-04 (FIX-4): two SCCs, 34 modules involved. Cutting these cycles is its own
// refactor step (a greedy minimum feedback edge set spans 60+ imports); until then the count may
// only shrink, never grow.
const SNAP_NODES = 34;
const SNAP_EDGES = 146;

test('the boot path never reads events-view registration unguarded', () => {
  for (const [f, re] of [
    ['boot.mjs', /plugins\.EventsView\?\.(init|pollFeeds)\?\.\(\)/g],
    ['map-switch.mjs', /plugins\.EventsView\?\.collapse\?\.\(\)/g],
  ]) {
    const src = readFileSync(path.join(DIR, f), 'utf8');
    const hits = [...src.matchAll(re)];
    assert.ok(hits.length > 0, `${f} keeps its optional-chained EventsView calls`);
    assert.ok(!/plugins\.EventsView\.[\w$]*\(/.test(src.replace(/plugins\.EventsView\?\.[\w$]*\?\.\(\)/g, '')),
      `${f} has no unguarded plugins.EventsView call left`);
  }
});

test('module-init cycle ratchet over map/app: no new cycles (snapshot 2026-10-04, FIX-4)', () => {
  const g = graph();
  const comps = sccs(g);
  const nodes = comps.reduce((n, s) => n + s.length, 0);
  const edges = comps.reduce((n, s) => n + s.reduce((m, v) => m + g[v].filter(d => s.includes(d)).length, 0), 0);
  assert.ok(nodes <= SNAP_NODES, `cyclic modules went ${SNAP_NODES} -> ${nodes} (allowed: shrink); new cycles came from: ${comps.map(s => s.join(', ')).join(' | ')}`);
  assert.ok(edges <= SNAP_EDGES, `intra-cycle imports went ${SNAP_EDGES} -> ${edges} (allowed: shrink)`);
});
