// Declared layers, sources (docs/layers-schema.md §3.2, K-R81): where the features of a pack layer come from, for the open view.
// inline (data.features) · file:<path> (read once, re-checked) · view:routes / view:markers (the open view's data) · events / people / items / routine
// (what the entity adapters and the routine already hold; nothing is invented, brief rule 8). `mvu:<path>` = the host-fed value of a card variable (K-R86): a list of place names,
// an object's keys or one string, placed like the other place texts. `ops` belongs to the kernel layer nav-ops (its own module): no features here.
// Every feature comes back in the 0..1 frame of the open view (`at` / `pts`) with `view` = the open view; a node feature is placed where the
// current-location engine draws that node's name, and dropped when it is not drawn on this map.
import { parseSource, normFeature, LIMITS } from '../core/layer-spec.mjs';
import { routesAsFeatures, markersAsFeatures } from '../core/layer-geometry.mjs';
import { eventOf, personOf } from '../core/entities.mjs';
import { currentMapId, currentMapData } from './state.mjs';
import { plugins } from './plugins.mjs';
import { hereRes, drawnAt } from './locate.mjs';
import { RT } from './nodes-runtime.mjs';
import { getJSON } from './json-cache.mjs';
import { routineNow } from './wander.mjs';

const files = new Map();   // layer id -> the normalised features of its file (a sound layer: its data object), or null while loading / when it failed
let values = {};   // K-R86: the last `eden-map:layer-data` values { <path>: value }
export const setValues = v => { values = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
export const hostValues = () => values;
/** valueNames(v) -> the place names a host-fed value holds: a list (strings and numbers), an object's keys, or one string; at most 200, text only. */
export const valueNames = v => { if (Array.isArray(v) && v.length === 2 && Array.isArray(v[0]) && typeof v[1] === 'string') v = v[0];   // an old-format [list, note] pair
  return (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v) : v === undefined || v === null ? [] : [v]).filter(x => ['string', 'number'].includes(typeof x) && String(x).trim()).map(x => String(x).trim()).filter(x => !x.startsWith('…')).slice(0, 200); };
/** soundData(layer) -> the ambience data of a sound layer: inline `data`, or the file loaded for its `file:` source. */
export const soundData = layer => (parseSource(layer.source || 'inline')?.kind === 'file' ? files.get(layer.id) || null : layer.data || null);

/** A place text -> [x, y] on the open view, or null (the path the trips layer uses: hereRes, then drawnAt, then the marker's anchor). */
export function placeAt(text) {
  try {
    const d = drawnAt(hereRes(text), text);
    if (!d || d.map !== currentMapId || !d.marker) return null;
    const k = (currentMapData?.markers || []).find(x => x.id === d.marker);
    return k ? [k.ax ?? k.nx, k.ay ?? k.ny] : null;
  } catch (e) { return null; }
}
const nodeAt = id => { const n = RT?.tree?.get?.(id); return n ? placeAt(n.name || n.title || id) : null; };
const KIND = /^[a-z][a-z0-9_-]{0,31}$/;
const kindOf = k => (typeof k === 'string' && KIND.test(k) ? k : undefined);
const point = (at, label, kind, id) => (at ? { view: currentMapId, at, ...(label ? { label: String(label).slice(0, 60) } : {}), ...(kindOf(kind) ? { kind } : {}), ...(id ? { id: String(id).slice(0, 64) } : {}) } : null);

/** loadFile(layer, base) -> reads a `file:` source once; the path is re-checked to stay under the pack's base and the size under the limit. */
export function loadFile(layer, base, onDone) {
  const src = parseSource(layer.source);
  if (src?.kind !== 'file' || files.has(layer.id)) return;
  files.set(layer.id, null);
  let url; try { url = new URL(src.arg, 'http://pack.invalid/' + (base || '')); } catch (e) { return; }
  if (!url.pathname.startsWith('/' + (base || ''))) return;
  getJSON((base || '') + src.arg).then(j => {
    if (!j || typeof j !== 'object' || JSON.stringify(j).length > LIMITS.fileBytes) return;
    if (layer.type === 'sound') { files.set(layer.id, j); onDone?.(); return; }
    if (!Array.isArray(j.features)) return;
    files.set(layer.id, j.features.slice(0, LIMITS.features).map(f => normFeature(f, layer.type, { view: layer.applies?.views?.length === 1 ? layer.applies.views[0] : undefined })).filter(Boolean));
    onDone?.();
  }).catch(() => {});
}
export const forgetFiles = () => files.clear();

/** sourceFeatures(layer) -> the raw features of the layer's source on the open view (before the view / kind filter). */
export function sourceFeatures(layer) {
  const src = parseSource(layer.source || 'inline'); if (!src) return [];
  const on = currentMapId, data = currentMapData;
  switch (src.kind) {
    case 'inline': return layer.data?.features || [];
    case 'file': return files.get(layer.id) || [];
    case 'view': return (src.arg === 'routes' ? routesAsFeatures(data?.routes) : markersAsFeatures(data?.markers)).map(f => ({ ...f, view: on }));
    case 'events': return (plugins.EventsView?.events || []).map(r => { const e = eventOf(r, null); return point(placeAt(e.place), r.title || r.text || e.name, e.name, e.id); }).filter(Boolean);
    case 'people': return (plugins.CharactersView?.items || []).map(r => { const p = personOf(r, null); return point(placeAt(p.place), p.name, r.group || r.kind, p.id); }).filter(Boolean);
    case 'items': {
      const mk = id => { const k = (data?.markers || []).find(x => x.id === id); return k ? [k.ax ?? k.nx, k.ay ?? k.ny] : null; };
      const a = (globalThis.StashMarkersApi?.rows?.() || []).map(r => point(mk(r.marker), r.name, undefined, r.id));   // the stash markers' rows: on this map, hidden ones only where the player stands
      const here = (() => { try { return hereRes(String(document.getElementById('here')?.value || '').replace('{{user}}', ''))?.marker || ''; } catch (e) { return ''; } })();
      const b = (plugins.StashView?.rows || []).filter(r => r['地点'] && (!r['暗格'] || placeAt(r['地点']) && drawnAt(hereRes(r['地点']), r['地点'])?.marker === here)).map(r => point(placeAt(r['地点']), r['名'], undefined, r.id));
      return [...a, ...b].filter(Boolean);
    }
    case 'routine': return routineNow().map(r => point(placeAt(r.place), r.name, r.id, r.name)).filter(Boolean);
    case 'mvu': return valueNames(values[src.arg]).map(n => point(placeAt(n), n, undefined, n)).filter(Boolean);
    default: return [];   // ops: the kernel layer nav-ops draws the navigator's rows itself
  }
}

/** viewFeatures(layer) -> the features to draw now: on the open view, the kind filter applied, node features given their position. */
export function viewFeatures(layer) {
  const kinds = layer.filter?.kinds, out = [];
  for (const f of sourceFeatures(layer)) {
    if (!f || (f.view !== undefined && f.view !== currentMapId)) continue;
    if (kinds?.length && !kinds.includes(f.kind)) continue;
    if (!f.at && !f.pts) { const at = f.node ? nodeAt(f.node) : null; if (!at) continue; out.push({ ...f, at }); } else out.push(f);
    if (out.length >= LIMITS.features) break;
  }
  return out;
}
