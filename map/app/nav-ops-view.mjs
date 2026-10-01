// The kernel layer `nav-ops` (docs/layers-schema.md §9, K-R86, I-04): what the background navigator suggests, drawn on the open map. The host keeps the navigator's validated
// OP_CLUE / OP_MARKER rows for the session (tavern/nav-ops.mjs: stamped with the floor and the map of the player's place, aged out after 20 messages, at most 12 per list) and
// sends them in `eden-map:ops`. A clue is placed where its place name is drawn on the open map (the node tree and marker anchors, as the other place texts), else at its own
// coordinates on the map it was stamped with; it pulses and grows with its urgency (1..3). A marker sits at its coordinates on its map with its label. Nothing here is stored:
// a chat change clears it (the host sends empty lists). The menu row shows only while the layer holds something for the open map.
import { registry, declared } from './layer-host.mjs';
import { layerStore, saveVisible } from './declared-layers.mjs';
import { pointEl, labelEl, ensureCss } from './block-overlay.mjs';
import { placeAt } from './declared-sources.mjs';
import { currentMapId, aspect, osdViewer } from './state.mjs';
import { busOn } from './bus.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { LANG } from './i18n.mjs';

const ID = 'nav-ops';
let ops = { clues: [], markers: [] }, els = [], count = 0, hooked = false, timer = 0;
const unit = v => typeof v === 'number' && v >= 0 && v <= 1;
const rows = v => (Array.isArray(v) ? v.filter(r => r && typeof r === 'object').slice(-12) : []);

/** opFeatures(ops, { map, at }) -> [{ at, label?, kind: 'clue' | 'marker', urgency }] for the open map `map`; `at(name)` = where that place is drawn on it (null when it is not) */
export function opFeatures(o, { map, at = placeAt } = {}) {
  const out = [];
  for (const c of rows(o?.clues)) {
    const name = typeof c.name === 'string' ? c.name : '', a = (name && at(name)) || (c.map === map && unit(c.nx) && unit(c.ny) ? [c.nx, c.ny] : null);
    if (a) out.push({ at: a, label: name, kind: 'clue', urgency: Math.min(3, Math.max(1, Math.round(Number(c.urgency)) || 1)) });
  }
  for (const m of rows(o?.markers)) if (m.map === map && unit(m.nx) && unit(m.ny)) out.push({ at: [m.nx, m.ny], label: typeof m.label === 'string' ? m.label : '', kind: 'marker', urgency: 1 });
  return out;
}

function clear() { for (const e of els) { try { osdViewer.removeOverlay(e); } catch (x) {} try { e.remove(); } catch (x) {} } els = []; }
function put(el, at, placement) { try { osdViewer.addOverlay({ element: el, location: new OpenSeadragon.Point(at[0], at[1] * aspect), placement }); els.push(el); } catch (e) {} }
export function drawNavOps() {
  clear();
  const feats = currentMapId && osdViewer?.world?.getItemCount?.() ? opFeatures(ops, { map: currentMapId }) : [];
  count = feats.length;
  const row = document.getElementById('lyr-' + ID); if (row) row.hidden = count < 1;
  if (!count || !registry.get(ID)?.visible) return;
  ensureCss();
  const tip = uiTextOr('nav.hint', '领航员建议'), P = OpenSeadragon.Placement;
  for (const f of feats) {
    const clue = f.kind === 'clue', el = pointEl({ label: f.label }, { color: clue ? '#ffd68c' : '--accent', opacity: 1, size: clue ? 8 + 4 * f.urgency : 10, pulse: clue }, LANG);
    el.classList.add('lyr-tip'); el.title = tip; el.dataset.nav = f.kind; put(el, f.at, P.CENTER);
    if (!clue && f.label) { const l = labelEl({ label: f.label }, { tone: 'chip', size: 'micro', opacity: 1 }, LANG); l.dataset.nav = 'label'; put(l, f.at, P.BOTTOM); }
  }
}
const later = () => { clearTimeout(timer); timer = setTimeout(drawNavOps, 0); };
function hook() {
  if (hooked) return; hooked = true;
  try { osdViewer?.addHandler('open', later); } catch (e) {}
  try { new MutationObserver(later).observe(document.body, { attributes: true, attributeFilter: ['data-map'] }); } catch (e) {}
  busOn({ key: 'navops.hostMsg', type: 'message', fn: e => { if (!window.__isFromHost?.(e) || e.data?.type !== 'eden-map:ops') return; ops = { clues: rows(e.data.clues), markers: rows(e.data.markers) }; later(); } });
}
/** registerNavOpsLayer() (boot): the kernel layer nav-ops; on by default (the navigator itself is the opt-in), its stored choice in `edenMapLayers`. */
export function registerNavOpsLayer() {
  if (registry.has(ID)) return true;
  registry.register(declared(ID, { initialVisible: layerStore()[ID] !== '0', countNow: () => count, mount: () => { hook(); later(); return true; }, unmount: clear,
    setVisible: v => { saveVisible(ID, v); drawNavOps(); } }));
  window.NavOpsApi = { describe: () => ({ clues: ops.clues.length, markers: ops.markers.length, drawn: els.length, count }) };
  return true;
}
