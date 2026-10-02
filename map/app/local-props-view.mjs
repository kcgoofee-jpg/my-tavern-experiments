// The kernel layer `local-props` and the prop methods of `EdenMap` (docs/layers-schema.md §11, K-R88, E-03): the user's own props (files kept in this browser, app/prop-store.mjs) placed on flat
// maps. A placement is { prop, map, at } (`at` = fractions of the view's width and height) stored per chat in `edenMap:chat:<chat id>:props` (at most 200); it is the user's own decoration,
// local to this device, never a chat fact and never injected. An image is drawn as an <img> with its object URL, a glb as the `cube` icon with its name (placing a glb inside a 3D page
// is the editor's job, S9b). `placeProp(id, { pick: true })` captures the next click on the map. The row shows only while the open map holds a placement.
import * as storage from '../core/storage.mjs';
import { normPlacements, normPlacement, PROP_LIMITS } from '../core/prop-pack.mjs';
import { registry, declared } from './layer-host.mjs';
import { layerStore, saveVisible } from './declared-layers.mjs';
import { ensureCss } from './block-overlay.mjs';
import { addProp as storeAdd, removeStoredProp, listProps, loadProps, urlOf, metaOf, onPropsChange } from './prop-store.mjs';
import { currentMapId, aspect, osdViewer } from './state.mjs';
import { chatId } from './extension-api.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { iconSvg } from './dom-helpers.mjs';
import { busOn, busOff } from './bus.mjs';

const ID = 'local-props';
let els = [], count = 0, hooked = false, timer = 0, pick = null;
const key = () => 'edenMap:chat:' + (chatId || 'local') + ':props';
const read = () => normPlacements(storage.json(key(), []));
const write = list => { try { storage.set(key(), JSON.stringify(list.slice(-PROP_LIMITS.placements))); } catch (e) {} later(); };

function clear() { for (const e of els) { try { osdViewer.removeOverlay(e); } catch (x) {} try { e.remove(); } catch (x) {} } els = []; }
function propEl(p) {
  const m = metaOf(p.prop), url = urlOf(p.prop); if (!m) return null;
  const el = document.createElement('div'); el.className = 'lyr lyr-pt lyr-prop lyr-tip'; el.dataset.slot = 'markers'; el.dataset.prop = p.prop; el.title = m.name;
  el.style.setProperty('--ls', '32px'); el.style.setProperty('--lo', '1');
  if (m.type === 'glb' || !url) { const i = document.createElement('i'); i.className = 'ic'; i.style.setProperty('--ls', '22px'); i.innerHTML = iconSvg('cube'); el.appendChild(i); const t = document.createElement('span'); t.textContent = m.name; el.appendChild(t); }   // kernel icon markup; the name is text
  else { const im = document.createElement('img'); im.src = url; im.alt = m.name; el.appendChild(im); }
  return el;
}
/** drawLocalProps(): the placements of the open map as overlays; the row follows the count */
export function drawLocalProps() {
  clear();
  const here = currentMapId && osdViewer?.world?.getItemCount?.() ? read().filter(p => p.map === currentMapId && metaOf(p.prop)) : [];
  count = here.length;
  const row = document.getElementById('lyr-' + ID); if (row) row.hidden = count < 1;
  if (!count || !registry.get(ID)?.visible) return;
  ensureCss();
  for (const p of here) { const el = propEl(p); if (!el) continue; try { osdViewer.addOverlay({ element: el, location: new OpenSeadragon.Point(p.at[0], p.at[1] * aspect), placement: OpenSeadragon.Placement.CENTER }); els.push(el); } catch (e) {} }
}
const later = () => { clearTimeout(timer); timer = setTimeout(drawLocalProps, 0); };
function hook() {
  if (hooked) return; hooked = true;
  try { osdViewer?.addHandler('open', later); } catch (e) {}
  try { new MutationObserver(later).observe(document.body, { attributes: true, attributeFilter: ['data-map'] }); } catch (e) {}
  busOn({ key: 'localprops.chat', type: 'message', fn: e => { if (window.__isFromHost?.(e) && e.data?.type === 'eden-map:chat') later(); } });
  onPropsChange(later); loadProps();
}
export function registerLocalPropsLayer() {
  if (registry.has(ID)) return true;
  registry.register(declared(ID, { initialVisible: layerStore()[ID] === '1', countNow: () => count, mount: () => { hook(); later(); return true; }, unmount: clear, setVisible: v => { saveVisible(ID, v); drawLocalProps(); } }));
  window.LocalPropsApi = { describe: () => ({ count, drawn: els.length, placements: read().length }) };
  return true;
}

/** A placement turns the layer on (it starts hidden since INV-2) and says so once, through the notice layer */
function reveal() {
  if (layerStore()[ID] === '1') return;
  if (registry.has(ID)) registry.setVisible(ID, true); else saveVisible(ID, true);   // setVisible stores '1' through the layer's own hook
  if (layerStore()[ID] !== '1') saveVisible(ID, true);
  window.showNotice?.({ level: 2, key: 'props-shown', title: uiTextOr('props.shown', 'Placed; the layer is now on') });
  later();
}

// ---- the EdenMap methods (K-R88) ----
export const addProp = (file, o) => storeAdd(file, o);
export const props = () => listProps();
export async function removeProp(id) { const ok = await removeStoredProp(String(id)); if (ok) write(read().filter(p => p.prop !== id)); return ok; }
export function unplaceProp(id, map) { const all = read(), rest = all.filter(p => !(p.prop === id && p.map === map)); write(rest); return rest.length < all.length; }
function cancelPick(why) { if (!pick) return; const p = pick; pick = null; try { osdViewer.removeHandler('canvas-click', p.h); } catch (e) {} busOff('localprops.esc'); p.res({ ok: false, reason: why }); }
/** placeProp(id, { map, at } | { pick: true }) -> Promise<{ ok, map?, at?, reason? }>; pick = the next click on the open map (Escape cancels) */
export async function placeProp(id, t = {}) {
  await loadProps(); if (!metaOf(id)) return { ok: false, reason: 'no-prop' };
  if (!t.pick) {
    const p = normPlacement({ prop: id, map: t.map, at: t.at }); if (!p) return { ok: false, reason: 'placement' };
    write([...read(), p]); reveal(); return { ok: true, map: p.map, at: p.at };
  }
  cancelPick('replaced');
  return new Promise(res => {
    const h = ev => {
      if (!ev.quick) return;
      const v = osdViewer.viewport.pointFromPixel(ev.position), at = [v.x, v.y / aspect];
      if (at.some(n => !(n >= 0 && n <= 1))) return;   // outside the picture: keep waiting
      ev.preventDefaultAction = true; pick = null; osdViewer.removeHandler('canvas-click', h); busOff('localprops.esc');
      const p = normPlacement({ prop: id, map: currentMapId, at }); if (p) { write([...read(), p]); reveal(); }
      res(p ? { ok: true, map: p.map, at: p.at } : { ok: false, reason: 'placement' });
    };
    pick = { res, h }; osdViewer.addHandler('canvas-click', h);
    busOn({ key: 'localprops.esc', type: 'keydown', target: document, fn: e => { if (e.key === 'Escape') cancelPick('cancel'); } });
  });
}
