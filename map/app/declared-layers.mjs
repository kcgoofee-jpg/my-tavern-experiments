// The declared-layer host (docs/layers-schema.md §2-§7, K-R79..K-R84): draws the layers a pack declares in its `layers` block with the kernel's
// building blocks. Each new layer registers on the LayerRegistry (so the menu, the visibility switch and the slot order are the registry's own),
// reads its features for the open view (declared-sources.mjs), asks `registry.applicable` whether it is live, and draws through block-overlay.mjs
// (point, label, line, area) or block-canvas.mjs (flow, particles, tint). Inapplicable = nothing drawn, no rAF, menu row hidden (L-06, until S7 greys it).
// Visibility is stored in one key `edenMapLayers` (L-08). The legend tab reads layerLegendRows(). Pure rules live in core/layer-geometry.mjs.
import * as storage from '../core/storage.mjs';
import { initialVisible, legendRowsOf, flowKinds, flowRoutes, styleFor, cssToRgb } from '../core/layer-geometry.mjs';
import { registry, packLayers } from './layer-host.mjs';
import { canvasLayer, drawFlow, drawParticles, drawTint, toScreen } from './block-canvas.mjs';
import { drawOverlay, cssColor, ensureCss } from './block-overlay.mjs';
import { loadFile, viewFeatures, forgetFiles } from './declared-sources.mjs';
import { currentMapId, aspect, osdViewer } from './state.mjs';
import { RT } from './nodes-runtime.mjs';
import { PACK } from './current-pack.mjs';
import { LANG } from './i18n.mjs';
import { lean } from './sharpness-tiers.mjs';
import { busOn } from './bus.mjs';
import { normClock, periodOf } from '../core/clock.mjs';

const KEY = 'edenMapLayers', CANVAS = ['flow', 'particles', 'tint'], OVERLAY = ['point', 'line', 'area', 'label'];
const states = new Map();   // layer id -> { layer, feats, app, count, h, cl }
const listeners = new Set();
let night = false, period = null, hooked = false, timer = 0;

const store = () => storage.json(KEY, {}) || {};
const saveVisible = (id, v) => { try { storage.set(KEY, JSON.stringify({ ...store(), [id]: v ? '1' : '0' })); } catch (e) {} };
const seedOf = id => 1 + [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 9973, 7);
/** a colour of the pack, resolved for a canvas: a hex as is, a token name read from the page's computed style */
const canvasColor = c => { const v = cssColor(c); if (!v) return '#ffffff'; if (!v.startsWith('var(')) return v; try { return getComputedStyle(document.documentElement).getPropertyValue(c).trim() || '#ffffff'; } catch (e) { return '#ffffff'; } };
const rgbOfColor = c => cssToRgb(canvasColor(c));

/** layerContext() -> the context `registry.applicable` reads (design §5): open view, its kind, owner node and ancestors, node type, period band, dark */
export function layerContext(count) {
  const view = currentMapId, owner = view ? RT?.host?.(view) ?? null : null;
  return { view, kind: view ? RT?.kind?.(view) ?? null : null, owner, ancestors: owner ? RT?.tree?.ancestors?.(owner) ?? [] : [], nodeType: owner ? RT?.tree?.get?.(owner)?.type ?? null : null, period, dark: night, count };
}

function frameOf(st) {
  const { layer } = st;
  if (layer.type === 'particles') return (cx, t, W, H) => drawParticles(cx, { preset: styleFor(layer).preset, t, seed: seedOf(layer.id), quality: lean() ? .5 : 1, W, H });
  if (layer.type === 'tint') return (cx, t, W, H) => { const s = styleFor(layer); drawTint(cx, { color: canvasColor(s.color), opacity: s.opacity, W, H }); };
  return (cx, t, W, H) => {   // flow
    if (!st.feats.length || !osdViewer?.viewport) return;
    const p = layer.style?.path, sp = p ? { ...styleFor({ type: 'line', style: p }), color: canvasColor(p.color ?? styleFor(layer).color) } : null;
    drawFlow(cx, { routes: flowRoutes(st.feats), t, seed: seedOf(layer.id), quality: lean() ? .5 : 1, night, toScreen, W, H, kinds: flowKinds(layer, st.feats, rgbOfColor),
      path: sp ? { color: sp.color, width: sp.width, dash: sp.dash, opacity: sp.opacity } : undefined });
  };
}

/** one pass: features for the open view, applicability, then draw / clear; hides the menu row of an inapplicable layer; tells the legend */
export function refreshDeclared() {
  for (const [id, st] of states) {
    const rec = registry.get(id); if (!rec) continue;
    let feats = [];
    try { feats = currentMapId ? viewFeatures(st.layer) : []; } catch (e) {}
    const app = registry.applicable(id, layerContext(feats.length));
    Object.assign(st, { feats, app, count: feats.length });
    const on = rec.visible && app;
    if (st.cl) st.cl.setVisible(on);
    else { st.h?.remove(); st.h = null; if (on && feats.length && osdViewer?.world?.getItemCount?.()) st.h = drawOverlay({ viewer: osdViewer, layer: st.layer, features: feats, aspect, lang: LANG }); }
    const row = document.getElementById('lyr-' + id); if (row) row.hidden = !!rec.menu?.hidden || !app;
  }
  for (const fn of listeners) { try { fn(); } catch (e) {} }
}
const later = () => { clearTimeout(timer); timer = setTimeout(refreshDeclared, 0); };

function hook() {
  if (hooked) return; hooked = true;
  try { osdViewer?.addHandler('open', later); } catch (e) {}
  try { new MutationObserver(later).observe(document.body, { attributes: true, attributeFilter: ['data-map'] }); } catch (e) {}
  busOn({ key: 'declared.resize', type: 'resize', fn: later });
  busOn({ key: 'declared.hostMsg', type: 'message', fn: e => {
    if (!window.__isFromHost?.(e)) return;
    const t = e.data?.type;
    if (t === 'eden-map:clock') { night = !!e.data.night; try { period = periodOf(normClock(e.data).min).id; } catch (x) {} later(); }
    else if (['eden-map:events', 'eden-map:chars', 'eden-map:stash', 'eden-map:inv', 'eden-map:here'].includes(t)) later();
  } });
}

function declare(layer) {
  const id = layer.id, st = { layer, feats: [], app: true, count: 0, h: null, cl: null };
  states.set(id, st);
  const canvas = CANVAS.includes(layer.type);
  if (canvas) st.cl = canvasLayer({ key: 'lyr.' + id, slot: layer.slot, cls: 'lyr-cv', still: true, frame: frameOf(st), idle: () => !st.app || (layer.type === 'flow' && !st.feats.length) });
  loadFile(layer, PACK?.base ?? '', later);
  registry.register({ id, slot: layer.slot, kind: canvas ? 'canvas' : 'osd', order: 50, type: layer.type, origin: 'pack', source: layer.source, style: layer.style, filter: layer.filter,
    menu: layer.menu ? { ...layer.menu, id: 'lyr-' + id, boxId: 'lyrBox-' + id } : undefined, applies: layer.applies, legend: layer.legend,
    initialVisible: initialVisible(layer, store()[id]),
    mount: () => { hook(); const ok = st.cl ? st.cl.mount() : true; later(); return ok; },
    unmount: () => { st.cl?.unmount(); st.h?.remove(); st.h = null; },
    setVisible: v => { saveVisible(id, v); refreshDeclared(); } });
}

/** initDeclaredLayers() (boot, after applyPackLayers): registers every pack layer that has a block this step draws; `sound` and the host-fed sources wait for S8-3 */
export function initDeclaredLayers() {
  forgetFiles();
  const rows = packLayers.filter(l => l.origin === 'pack' && (CANVAS.includes(l.type) || OVERLAY.includes(l.type)) && !registry.has(l.id));
  if (rows.length) ensureCss();
  for (const l of rows) declare(l);
  window.DeclaredLayersApi = { describe: () => [...states].map(([id, s]) => ({ id, type: s.layer.type, slot: s.layer.slot, visible: !!registry.get(id)?.visible, applicable: s.app, count: s.count })) };
  return rows.length;
}

/** layerLegendRows() -> the legend groups of the registered, visible, applicable layers in menu order (K-R84) */
export function layerLegendRows() {
  const recs = registry.menuRows().filter(r => r.legend?.length && r.visible && registry.applicable(r.id, states.has(r.id) ? layerContext(states.get(r.id).count) : layerContext(undefined)));
  return legendRowsOf(recs, LANG);
}
export const onLegendChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
