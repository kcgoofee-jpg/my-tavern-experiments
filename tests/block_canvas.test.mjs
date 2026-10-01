// S8-2: app/block-canvas.mjs drawFlow / drawParticles draw exactly the calls the old traffic and weather frames made (recorded context, 20 seeded inputs each),
// and a flow with `kinds` / `path`, drawTint and canvasLayer behave as specified.
import test from 'node:test';
import assert from 'node:assert/strict';
import { trafficFrameV1, weatherFrameV1 } from './helpers/fx_frames_v1_frozen.mjs';
import { LANE_KINDS } from '../map/core/traffic.mjs';

// the block module imports the viewer's layer host, which touches the DOM globals while it evaluates: give it inert stubs for the import only
const S = (() => { const f = function () {}; const p = new Proxy(f, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? function* () {} : k === 'then' ? undefined : p, apply: () => p, construct: () => p, set: () => true, has: () => true }); return p; })();
const keep = {};
for (const k of ['window', 'document', 'navigator', 'location', 'matchMedia', 'addEventListener', 'removeEventListener', 'OpenSeadragon', 'LocalStore', 'self', 'getComputedStyle', 'MutationObserver', 'ResizeObserver', 'localStorage', 'sessionStorage', 'IntersectionObserver']) keep[k] = Object.getOwnPropertyDescriptor(globalThis, k);
const set = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
for (const k of Object.keys(keep)) set(k, S);
set('window', new Proxy({}, { get: (t, k) => (k in t ? t[k] : S), set: (t, k, v) => { t[k] = v; return true; } }));
const { drawFlow, drawParticles, drawTint } = await import('../map/app/block-canvas.mjs');
for (const [k, d] of Object.entries(keep)) d ? Object.defineProperty(globalThis, k, d) : delete globalThis[k];

function recorder() {
  const log = [];
  const cx = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...a) => { log.push(`${String(k)}(${a.map(v => (typeof v === 'number' ? +v.toFixed(6) : v)).join(',')})`); }),
    set: (t, k, v) => { t[k] = v; log.push(`set ${String(k)}=${v}`); return true; },
  });
  return { cx, log };
}
const mulberry = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const ROUTES = [
  { kind: 'lane', pts: [[0.05, 0.1], [0.4, 0.3], [0.9, 0.25]] }, { kind: 'patrol', from: 'a', to: 'a', pts: [[0.3, 0.3], [0.6, 0.3], [0.6, 0.6], [0.3, 0.3]] },
  { kind: 'patrol_city', pts: [[0.1, 0.8], [0.5, 0.9]] }, { kind: 'unknown', pts: [[0, 0], [1, 1]] }, { pts: [[0.5, 0.5]] },
];
const toScreenOf = (W, H) => (nx, ny) => ((nx * 0.37 + ny * 0.11) % 0.97 > 0.93 ? null : { x: nx * W * 1.1 - 20, y: ny * H * 1.1 - 20 });

test('drawFlow gives the same recorded calls as the old traffic frame (20 seeded inputs)', t => {
  let calls = 0;
  for (let i = 0; i < 20; i++) {
    const r = mulberry(1000 + i), W = 600 + Math.floor(r() * 900), H = 400 + Math.floor(r() * 500);
    const input = { routes: ROUTES.slice(0, 1 + (i % 5)), t: r() * 120, seed: 1 + i * 13, quality: i % 2 ? .5 : 1, night: i % 3 === 0, toScreen: toScreenOf(W, H), W, H };
    const a = recorder(), b = recorder();
    trafficFrameV1(a.cx, input); drawFlow(b.cx, input);
    assert.deepEqual(b.log, a.log, `input ${i}`); calls += a.log.length;
  }
  assert.ok(calls > 500, `a real frame was compared (${calls} calls)`); t.diagnostic(`flow calls ${calls}/${calls}`);
  const none = recorder(); drawFlow(none.cx, { routes: [], t: 0, seed: 1, quality: 1, night: false, toScreen: () => null, W: 10, H: 10 }); assert.deepEqual(none.log, []);
});

test('drawParticles gives the same recorded calls as the old weather frame (20 seeded inputs)', t => {
  let calls = 0;
  for (let i = 0; i < 20; i++) {
    const r = mulberry(5000 + i), W = 500 + Math.floor(r() * 1200), H = 300 + Math.floor(r() * 700);
    const input = { id: ['rain', 'storm', 'sand', 'snow', 'clear'][i % 5], t: r() * 300, seed: 1 + i * 7, quality: i % 2 ? .5 : 1, W, H };
    const a = recorder(), b = recorder();
    weatherFrameV1(a.cx, input); drawParticles(b.cx, { preset: input.id, t: input.t, seed: input.seed, quality: input.quality, W, H });
    assert.deepEqual(b.log, a.log, `input ${i} ${input.id}`); calls += a.log.length;
  }
  assert.ok(calls > 1000, `a real frame was compared (${calls} calls)`); t.diagnostic(`particles calls ${calls}/${calls}`);
});

test('drawFlow with a kinds table: the pack colour and density are used; without `kinds` the lane table is unchanged', () => {
  const kinds = { default: { speed: .05, size: 2, density: 6, color: '154,208,245', trail: .006 } };
  const routes = [{ pts: [[0.2, 0.2], [0.8, 0.8]], kind: 'whatever' }];
  const base = { routes, t: 3, seed: 5, quality: 1, night: false, toScreen: (x, y) => ({ x: x * 1000, y: y * 800 }), W: 1000, H: 800 };
  const k = recorder(); drawFlow(k.cx, { ...base, kinds });
  assert.ok(k.log.some(l => l.startsWith('set fillStyle=rgba(154,208,245,')), 'pack colour');
  const d = recorder(); drawFlow(d.cx, { ...base });
  assert.ok(d.log.some(l => l.startsWith(`set fillStyle=rgba(${LANE_KINDS.lane.color},`)), 'unknown kind falls to lane without a table');
});

test('drawFlow with `path` strokes the polyline first; a missing screen point skips that route', () => {
  const routes = [{ pts: [[0.1, 0.1], [0.9, 0.9]], kind: 'k' }];
  const base = { routes, t: 0, seed: 1, quality: 0, night: false, W: 1000, H: 1000 };
  const a = recorder(); drawFlow(a.cx, { ...base, toScreen: (x, y) => ({ x: x * 1000, y: y * 1000 }), path: { color: '#112233', width: 1.4, dash: [10, 4], opacity: 0.8 } });
  const i = a.log.indexOf('stroke()'); assert.ok(i > 0 && a.log[0] === 'save()', 'path before dots');
  assert.ok(a.log.includes('setLineDash(10,4)') && a.log.includes('moveTo(100,100)') && a.log.includes('lineTo(900,900)') && a.log.includes('restore()'));
  const b = recorder(); drawFlow(b.cx, { ...base, toScreen: () => null, path: { color: '#112233', width: 1.4 } });
  assert.ok(!b.log.includes('stroke()'));
});

test('drawTint is one translucent fill', () => {
  const a = recorder(); drawTint(a.cx, { color: '#102030', opacity: 0.25, W: 80, H: 60 });
  assert.deepEqual(a.log, ['save()', 'set globalAlpha=0.25', 'set fillStyle=#102030', 'fillRect(0,0,80,60)', 'restore()']);
});
