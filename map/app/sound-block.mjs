// The `sound` building block (docs/layers-schema.md §12, K-R89): procedural ambience for a pack-declared layer. The pure engine is core/ambience.mjs (recipes, rules, mixing plan);
// this file connects a plan to Web Audio (filtered noise and harmonic oscillators, no audio files) for the declared-layer host, which owns the menu row and the stored choice.
// Audio never starts by itself: a sound row is off until the user switches it on (core/layer-geometry initialVisible), the AudioContext is created only after a user gesture
// (switching the row on is one; a stored "on" waits for the first click or key), and it is suspended while the page is hidden or no sound layer is live (visible and applicable).
// The scene set follows the open view, the day / night band (`eden-map:clock`) and the weather (WeatherApi); a plan whose scene ids did not change only moves the gains.
import { normAmbience, planFor } from '../core/ambience.mjs';
import { currentMapId } from './state.mjs';
import { busOn, busOff } from './bus.mjs';

const NOISE_S = 2.5, THROTTLE = 2000;
const layers = new Map();   // layer id -> { live, ab, src, sig, nodes: Map(scene id -> { set, stop }), plan }
let ctx = null, master = null, night = false, hooked = false, armed = false, wait = 0, last = 0, noise = null;

const gestured = () => { try { return !!navigator.userActivation?.hasBeenActive; } catch (e) { return false; } };
const anyLive = () => [...layers.values()].some(s => s.live);
function ensureCtx() {
  if (ctx) return ctx;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  return ctx;
}
const noiseBuf = () => {
  if (noise) return noise;
  noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * NOISE_S), ctx.sampleRate);
  const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
};
/** one scene = a small node graph: { set(gain), stop() } */
function buildScene(recipe, gain) {
  const g = ctx.createGain(); g.gain.value = gain; g.connect(master);
  const stops = [];
  if (recipe.kind === 'noise') {
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
  for (const p of s.plan) s.nodes.set(p.id, buildScene(p.recipe, p.gain));
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
  window.SoundApi = { describe: () => [...layers].map(([id, s]) => ({ id, active: s.live && !!ctx && ctx.state !== 'closed', scenes: s.live ? (s.plan || []).map(p => p.id) : [] })), contexts: () => (ctx ? 1 : 0) };
}

/** soundLayer(layer, { id, data }) -> { mount, unmount, setVisible, live(on) } for the declared-layer host; `data()` returns the ambience data of the layer (inline or its loaded file) */
export function soundLayer(layer, { id = layer.id, data = () => layer.data } = {}) {
  const s = { live: false, ab: null, src: undefined, sig: '', nodes: new Map(), plan: [], data };
  layers.set(id, s);
  return {
    mount() { hook(); return true; },
    unmount() { s.live = false; replan(s); layers.delete(id); if (!anyLive()) settle(); },
    setVisible() {},   // the host stores the choice and calls live() with visible && applicable
    live(on) { on = !!on; if (on === s.live) { if (on) replan(s); return; } s.live = on; settle(); },
  };
}
