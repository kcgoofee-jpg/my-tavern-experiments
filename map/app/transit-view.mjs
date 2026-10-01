// The kernel layer `transit` (docs/kernel-schema.md K-R110, docs/transit-schema.md §4): the pack's transit network drawn as a thematic map over the open view: districts tinted by function with
// the outline of their danger level, lines (octilinear, shared segments side by side), links, stations and interchanges, line badges and a label hierarchy. It draws only through the S8-2
// building blocks (core/transit-geometry.mjs builds the synthetic layers, app/block-overlay.mjs draws them). Off by default (stored in `edenMapLayers`); its menu row and legend rows show only
// where the open view has something. The same style element carries the marker label ranks of the thematic schematic (K-R114): `data-rank` 1..3 on a marker sets the size of its label.
import { registry, declared } from './layer-host.mjs';
import { layerStore, saveVisible, legendChanged } from './declared-layers.mjs';
import { drawOverlay, ensureCss } from './block-overlay.mjs';
import { transitLayers } from '../core/transit-geometry.mjs';
import { PALETTE, DANGER } from '../core/thematic.mjs';
import { lineName } from '../core/transit-spec.mjs';
import { graphNow, ready, posOn, nodePosOn, stationView, hasMarkerOn, nameOf, viewTitle } from './transit-env.mjs';
import { currentMapId, aspect, osdViewer, mapRegistry } from './state.mjs';
import { declutter } from './sharpness-tiers.mjs';
import { busOn } from './bus.mjs';
import { uiText, LANG } from './i18n.mjs';

const ID = 'transit', CSS = `
.lyr-lb.badge { background: var(--lc); color: var(--lc-ink); border-color: transparent; }
.mk[data-rank="1"] .lab { font-size: var(--fs-body); font-weight: 700; }
.mk[data-rank="2"] .lab { font-size: var(--fs-small); }
.mk[data-rank="3"] .lab { font-size: var(--fs-micro); opacity: .85; }`;
let drawn = [], count = 0, gen = 0, hooked = false, timer = 0, legendSig = '';

const clear = () => { for (const h of drawn) h.remove(); drawn = []; };
const syncRow = () => { const row = document.getElementById('lyr-' + ID); if (row) row.hidden = count < 1; };
const kindsOn = layers => new Set(layers.flatMap(l => l.features.map(f => f.kind)));

/** legendOf(layers, transit) -> { rows, by }: one row per function and per danger level present on the view, one per line drawn (K-R84); `by` gives each row its swatch */
function legendOf(layers, T) {
  const ks = kindsOn(layers), rows = [], by = {}, fns = new Set(), dgs = new Set();
  for (const k of ks) { const m = /^d-([a-z_]+)-(\d)$/.exec(k); if (m) { fns.add(m[1]); if (+m[2] > 0) dgs.add(+m[2]); } }
  for (const fn of [...fns].sort()) { rows.push({ label: uiText('transit.fn.' + fn), kind: 'f-' + fn }); by['f-' + fn] = { color: T.style?.functions?.[fn]?.color || PALETTE[fn] || PALETTE.other, width: 6 }; }
  for (const n of [...dgs].sort()) { rows.push({ label: uiText('transit.danger.' + n), kind: 'g' + n }); by['g' + n] = { color: DANGER[n].color, width: DANGER[n].width + 1, dash: DANGER[n].dash }; }
  for (const l of T.lines || []) if (ks.has('l-' + l.id) || ks.has('n-' + l.id)) { rows.push({ label: lineName(T, l.id, LANG), kind: 'l-' + l.id }); by['l-' + l.id] = { color: l.color, width: T.style?.width || 4 }; }
  return { rows, by };
}

async function draw() {
  const my = ++gen; clear();
  const g = graphNow(), view = currentMapId;
  if (!g || !view || mapRegistry?.maps?.[view]?.kind !== 'points' || !osdViewer?.world?.getItemCount?.()) { count = 0; syncRow(); return; }
  await ready();
  if (my !== gen) return;
  const layers = transitLayers(g, view, { posOf: posOn(view), viewOf: stationView, nodePos: nodePosOn(view), lang: LANG, t: uiText, nameOf, hasMarker: hasMarkerOn(view), viewTitle, aspect });
  count = layers.reduce((n, l) => n + l.features.length, 0); syncRow();
  const rec = registry.get(ID), on = !!rec?.visible && count > 0, lg = on ? legendOf(layers, g.transit) : { rows: [], by: {} };
  if (rec) Object.assign(rec, { legend: lg.rows, style: { by: lg.by } });   // the registry record the legend reads (K-R84)
  const sig = JSON.stringify([on, lg.rows, lg.by]); if (sig !== legendSig) { legendSig = sig; legendChanged(); }
  if (!on) return;
  ensureCss();
  for (const l of layers) drawn.push(drawOverlay({ viewer: osdViewer, layer: l, features: l.features, aspect, lang: LANG }));
  declutter();
}
const later = (ms = 0) => { clearTimeout(timer); timer = setTimeout(draw, ms); };
function hook() {
  if (hooked) return; hooked = true;
  try { osdViewer?.addHandler('open', () => later()); } catch (e) {}
  try { new MutationObserver(() => later()).observe(document.body, { attributes: true, attributeFilter: ['data-map'] }); } catch (e) {}
  try { new MutationObserver(() => later()).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] }); } catch (e) {}
  busOn({ key: 'transit.resize', type: 'resize', fn: () => later() });
  busOn({ key: 'transit.hostMsg', type: 'message', fn: e => { if (!window.__isFromHost?.(e)) return; const t = e.data?.type; if (t === 'eden-map:pack') later(500); else if (t === 'eden-map:here') later(); } });
}

/** registerTransitLayer() (boot): the kernel layer `transit`; off unless the user ticked it (`edenMapLayers`). Also injects the style of the badge chip and the marker label ranks. */
export function registerTransitLayer() {
  if (registry.has(ID)) return true;
  if (!document.getElementById('transitCss')) { const s = document.createElement('style'); s.id = 'transitCss'; s.textContent = CSS; document.head.appendChild(s); }
  registry.register(declared(ID, { initialVisible: layerStore()[ID] === '1', countNow: () => count, mount: () => { hook(); later(); return true; }, unmount: () => { gen++; clear(); },
    setVisible: v => { saveVisible(ID, v); later(); } }));
  window.TransitViewApi = { describe: () => ({ count, drawn: drawn.length, legend: registry.get(ID)?.legend?.length ?? 0, graph: !!graphNow() }), redraw: draw };
  return true;
}
