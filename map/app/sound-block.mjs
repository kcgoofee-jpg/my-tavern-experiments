// The `sound` building block (docs/layers-schema.md §12, K-R89): ambience for a pack-declared layer. The pure engine is core/ambience.mjs (recipes, rules, mixing plan);
// this file connects a plan to Web Audio for the declared-layer host, which owns the menu row and the stored choice: synthesized scenes (filtered noise, harmonic oscillators)
// and `file` scenes — the pack's own seamless audio loops (.ogg with an optional .mp3 fallback), fetched once per url, decoded, looped sample-accurately; a failed fetch or
// decode leaves that scene silent (self-heal, no dialog). Audio never starts by itself: a sound row is off until the user switches it on (core/layer-geometry initialVisible),
// the AudioContext is created only after a user gesture (switching the row on is one; a stored "on" waits for the first click or key), and it is suspended while the page is
// hidden or no sound layer is live (visible and applicable).
// The scene set follows the open view, the day / night band (`eden-map:clock`) and the weather (WeatherApi); a plan whose scene ids did not change only moves the gains.
import { normAmbience, planFor } from '../core/ambience.mjs';
import { currentMapId } from './state.mjs';
import { busOn, busOff } from './bus.mjs';

const NOISE_S = 2.5, THROTTLE = 2000;
const layers = new Map();   // layer id -> { live, ab, src, sig, nodes: Map(scene id -> { set, stop }), plan, base }
const loaded = new Set();   // file urls whose AudioBuffer is ready this page
let ctx = null, master = null, night = false, hooked = false, armed = false, wait = 0, last = 0, noise = null;

const gestured = () => { try { return !!navigator.userActivation?.hasBeenActive; } catch (e) { return false; } };
const anyLive = () => [...layers.values()].some(s => s.live);
function ensureCtx() {
  if (ctx) return ctx;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  return ctx;
}
const urlCache = new Map();
/** fileBuf(url) -> the decoded loop buffer (one fetch + decode per url per page; failures cache as null and stay silent). */
function fileBuf(url) {
  if (!urlCache.has(url)) urlCache.set(url, fetch(url)
    .then(r => (r.ok ? r.arrayBuffer() : null))
    .then(b => (b && ctx && ctx.decodeAudioData(b)))
    .then(buf => { if (buf) loaded.add(url); return buf; })
    .catch(() => null));
  return urlCache.get(url);
}
const noiseBuf = () => {
  if (noise) return noise;
  noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * NOISE_S), ctx.sampleRate);
  const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
};
/** one scene = a small node graph: { set(gain), stop() } */
function buildScene(recipe, gain, base) {
  const g = ctx.createGain(); g.gain.value = gain; g.connect(master);
  const stops = [];
  if (recipe.kind === 'file') {   // the pack's loop: start once the buffer is ready; a scene stopped before that never starts (silent self-heal)
    let live = true;
    stops.push(() => { live = false; });
    const url = (base || '') + recipe.src;
    fileBuf(url).then(buf => (buf || !recipe.alt ? buf : fileBuf((base || '') + recipe.alt))).then(buf => {
      if (!live || !buf || !ctx || ctx.state === 'closed') return;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(g);
      try { src.start(0, Math.random() * buf.duration); } catch (e) { try { src.start(0); } catch (e2) { console.warn('[map] sound-block: loop start failed', e2); } }
      stops.push(() => { try { src.stop(); } catch (e) { console.warn('[map] sound-block: loop stop failed', e); } });
    }).catch(e => console.warn('[map] sound-block: file loop scene failed', e));
  } else if (recipe.kind === 'noise') {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf(); src.loop = true; let last = src;
    if (recipe.filter) { const f = ctx.createBiquadFilter(); f.type = recipe.filter.type || 'bandpass'; f.frequency.value = recipe.filter.freq || 500; f.Q.value = recipe.filter.q ?? 1; src.connect(f); last = f; }
    last.connect(g); src.start(0, Math.random() * NOISE_S); stops.push(() => src.stop());
  } else {
    for (const [i, h] of (recipe.harmonics || [1]).entries()) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = (recipe.freq || 55) * (i + 1);
      const og = ctx.createGain(); og.gain.value = h; o.connect(og); og.connect(g); o.start(); stops.push(() => o.stop());
    }
  }
  if (recipe.lfo) {   // gain breathing; the random wave is two incommensurable sines
    const rates = recipe.lfo.wave === 'random' ? [recipe.lfo.rate, recipe.lfo.rate * 1.618] : [recipe.lfo.rate];
    const depth = ctx.createGain(); depth.gain.value = (recipe.lfo.depth || 0) * gain; depth.connect(g.gain);
    for (const r of rates) { const lo = ctx.createOscillator(); lo.frequency.value = r; lo.connect(depth); lo.start(); stops.push(() => lo.stop()); }
  }
  return { set: v => g.gain.setTargetAtTime(v, ctx.currentTime, 0.4), stop() { for (const s of stops) try { s(); } catch (e) {} try { g.disconnect(); } catch (e) {} } };
}
const ambienceOf = (s, data) => { if (data !== s.src) { s.src = data; s.ab = data ? normAmbience(data) : null; s.sig = ''; } return s.ab; };

function replan(s) {
  const ab = ambienceOf(s, s.data());
  if (!s.live || !ab || !ctx) { for (const n of s.nodes.values()) n.stop(); s.nodes.clear(); s.sig = ''; s.plan = []; return; }
  let weather = ''; try { weather = window.WeatherApi?.now?.()?.id || ''; } catch (e) {}
  s.plan = planFor(ab, { map: currentMapId, night, weather });
  const sig = s.plan.map(p => p.id).join(',');
  if (sig === s.sig) { for (const p of s.plan) s.nodes.get(p.id)?.set(p.gain); return; }
  for (const n of s.nodes.values()) n.stop(); s.nodes.clear();
  for (const p of s.plan) s.nodes.set(p.id, buildScene(p.recipe, p.gain, s.base));
  s.sig = sig;
}
/** settle(userGesture): create / resume / suspend the context to match the layers' state, then replan every layer */
function settle(userGesture = false) {
  if (anyLive()) {
    if (!ctx && !(userGesture || gestured())) { armGesture(); return; }
    if (!ensureCtx()) return;
    if (!document.hidden) ctx.resume?.().catch(() => {});
    master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.3);
  } else if (ctx) { master.gain.setTargetAtTime(0, ctx.currentTime, 0.1); ctx.suspend?.().catch(() => {}); }
  for (const s of layers.values()) replan(s);
}
function armGesture() {   // a stored "on" waits for the first click or key before the context is made
  if (armed) return; armed = true;
  const go = () => { armed = false; busOff('sound.g1'); busOff('sound.g2'); settle(true); };
  busOn({ key: 'sound.g1', type: 'pointerdown', target: document, fn: go }); busOn({ key: 'sound.g2', type: 'keydown', target: document, fn: go });
}
function soon() {   // message-driven changes (clock, events): at most one replan per 2 s
  if (wait) return; wait = setTimeout(() => { wait = 0; last = Date.now(); for (const s of layers.values()) replan(s); }, Math.max(0, THROTTLE - (Date.now() - last)));
}
function hook() {
  if (hooked) return; hooked = true;
  busOn({ key: 'sound.hostMsg', type: 'message', fn: e => { if (!window.__isFromHost?.(e)) return; const t = e.data?.type; if (t === 'eden-map:clock') { night = !!e.data.night; soon(); } else if (t === 'eden-map:events') soon(); } });
  busOn({ key: 'sound.visible', type: 'visibilitychange', target: document, fn: () => { if (!ctx) return; if (document.hidden) ctx.suspend?.().catch(() => {}); else if (anyLive()) ctx.resume?.().catch(() => {}); } });
  window.SoundApi = { describe: () => [...layers].map(([id, s]) => ({ id, active: s.live && !!ctx && ctx.state !== 'closed', scenes: s.live ? (s.plan || []).map(p => p.id) : [],
      gains: s.live ? (s.plan || []).map(p => +p.gain.toFixed(3)) : [],
      loops: s.live ? (s.plan || []).filter(p => p.recipe.kind === 'file').map(p => ({ id: p.id, ready: loaded.has((s.base || '') + p.recipe.src) })) : [] })),
    contexts: () => (ctx ? 1 : 0), state: () => (ctx ? ctx.state : 'none') };
}

/** soundLayer(layer, { id, data, base }) -> { mount, unmount, setVisible, live(on) } for the declared-layer host; `data()` returns the ambience data of the layer (inline or its loaded file), `base` is the pack's base (a `file` recipe's src is relative to it) */
export function soundLayer(layer, { id = layer.id, data = () => layer.data, base = '' } = {}) {
  const s = { live: false, ab: null, src: undefined, sig: '', nodes: new Map(), plan: [], data, base };
  layers.set(id, s);
  return {
    mount() { hook(); return true; },
    unmount() { s.live = false; replan(s); layers.delete(id); if (!anyLive()) settle(); },
    setVisible() {},   // the host stores the choice and calls live() with visible && applicable
    live(on) { on = !!on; if (on === s.live) { if (on) replan(s); return; } s.live = on; settle(); },
  };
}
