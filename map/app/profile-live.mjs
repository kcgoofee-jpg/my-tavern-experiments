// Settings profiles (PROFILE-1): after a profile's values are written to the store, make them take effect without a reload, the way a single switch
// change does: each preference key has one effect that calls the module that owns the setting (theme, language, layers, 3D look, host prefs ...).
// Keys with no entry here are read from the store every time they are used, so the stored value is already enough.
import { $ } from './dom-helpers.mjs';
import { post } from './protocol-stamp.mjs';
import { paintSegs, setLang, setTheme, postState } from './i18n.mjs';
import { setTier, tierLabels } from './sharpness-tiers.mjs';
import { estateLook } from './subpage3d-host.mjs';
import { plugins } from './plugins.mjs';
import * as Cvd from './color-vision-mode.mjs';
import { setFpsMeter } from './fps.mjs';
import { applyRM, setInjectMode } from './settings-wire.mjs';
import { syncGlassClock } from './theme.mjs';
import { registry, renderLayerMenu } from './layer-host.mjs';
import { layerStore } from './declared-layers.mjs';
import { LAYER_DEFAULTS } from '../core/profiles.mjs';
import { initialVisible } from '../core/layer-geometry.mjs';

const get = k => { try { return LocalStore.get(k); } catch (e) { return null; } };
const on = (k, def) => { const v = get(k); return v === null ? def : v === '1'; };
const motionDefault = () => get('edenMapRM') === 'on' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const fx = () => { const v = get('edenMapNoFx'); document.body.classList.toggle('nofx', v !== null ? v === '1' : motionDefault()); };

/** the layers whose visibility a profile carries: every registered layer the stored blob (or the routes key) can decide */
function layers() {
  const blob = layerStore();
  for (const rec of registry.ordered()) {
    const id = rec.id; let want;
    if (id === 'routes') want = get('edenMapRoutes') !== '0';
    else if (id in blob || id in LAYER_DEFAULTS) want = blob[id] === '1' ? true : blob[id] === '0' ? false : LAYER_DEFAULTS[id];
    else if (rec.menu && rec.origin !== 'kernel' && rec.source !== 'kernel') want = initialVisible(rec, blob[id]);
    else continue;
    if (registry.isVisible(id) !== want) registry.setVisible(id, want);
  }
  renderLayerMenu();
}

/** the host-owned prefs (AI link cards): key -> [pref name of the host's `prefs` op, value from the stored string] */
const num = (d, lo, hi) => v => { const n = Math.round(+v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const CADENCE = [120000, 300000, 600000];
export const HOST_PREFS = {
  edenMapStateInj: ['inj', v => v !== '0'], edenMapStateDepth: ['depth', num(2, 0, 20)], edenMapStateBudget: ['budget', num(150, 40, 400)],
  edenMapStateOmit: ['stateOmit', v => { try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch (e) { return []; } }],
  edenMapInvInj: ['invInj', v => v !== '0'], edenMapMacros: ['macros', v => v === '1'], edenMapWbOn: ['wbOn', v => v !== '0'],
  edenMapDice: ['dice', v => v === '1'], edenMapLedgerWrite: ['ledgerWrite', v => v === '1'], edenMapSpatial: ['spatial', v => v === '1'],
  edenMapSpatialBudget: ['spatialBudget', num(120, 60, 240)], edenMapSpatialDepth: ['spatialDepth', num(2, 0, 20)], edenMapWbJit: ['wbJit', v => v === '1'], edenMapWbXtal: ['wbXtal', v => v === '1'], edenMapTurnIds: ['turnIds', v => v === '1'],
  edenMapNavCadence: ['navCadence', v => (CADENCE.includes(+v) ? +v : 120000)],
};
const hostDefault = k => ({ edenMapStateInj: '1', edenMapStateDepth: '2', edenMapStateBudget: '150', edenMapStateOmit: '[]', edenMapInvInj: '1', edenMapWbOn: '1', edenMapSpatialBudget: '120', edenMapSpatialDepth: '2', edenMapNavCadence: '120000' })[k] ?? '0';

/** every effect: key -> () => void (the new value is already in the store) */
const LIVE = {
  edenMapTheme: () => setTheme(get('edenMapTheme') || 'auto'),
  edenMapLang: () => setLang(get('edenMapLang') || 'zh'),
  edenMapHand: () => { window.__hand = get('edenMapHand') || 'auto'; window.__applyHand?.(); postState(); },
  edenMapRM: () => { applyRM(); paintSegs(); fx(); },
  edenMapNoFx: fx,
  edenMap3dQ: () => { paintSegs(); estateLook(); },
  edenMapCvd: () => { Cvd.setMode(get('edenMapCvd') || '0'); paintSegs(); estateLook(); },
  edenMapMinimap: () => document.body.classList.toggle('nominimap', !on('edenMapMinimap', false)),
  edenMapFog: () => { const v = on('edenMapFog', true); const r = $('#fogRow'); if (r) r.hidden = !v; window.FogApi?.toggle(v); },
  edenMap3dAuto: () => estateLook(), edenMap3dAutoRotate: () => estateLook(), edenMap3dWheelZoom: () => estateLook(),
  edenMapCharStats: () => plugins.CharactersView?.setStatsOn(on('edenMapCharStats', true)),
  edenMapCharMore: () => plugins.CharactersView?.setMoreOn(on('edenMapCharMore', true)),
  edenMapDebugFps: () => { setFpsMeter(on('edenMapDebugFps', false)); estateLook(); },
  edenMapTierV2: () => { setTier(get('edenMapTierV2') || 'auto'); tierLabels(); },
  edenMapGlassClock: () => syncGlassClock(),
  edenMapInject: () => setInjectMode(get('edenMapInject') || 'off'),
  edenMapLayers: layers, edenMapRoutes: layers,
};
/** switches in the settings pages whose control state is read from the store only when the page is built: [control id, key, default] */
const SWITCHES = [['#optNoFx', 'edenMapNoFx'], ['#optFog', 'edenMapFog', true], ['#optMinimap', 'edenMapMinimap'], ['#optAuto3d', 'edenMap3dAuto'], ['#opt3dRotate', 'edenMap3dAutoRotate'], ['#opt3dWheel', 'edenMap3dWheelZoom', true],
  ['#optCharStats', 'edenMapCharStats', true], ['#optCharMore', 'edenMapCharMore', true], ['#optKeys', 'edenMapKeys'], ['#optTick', 'edenMapTick', true], ['#optFps', 'edenMapDebugFps'], ['#optGlassClock', 'edenMapGlassClock'], ['#optPort', 'edenMapPortraits', true]];

/** refresh the open settings page: switches, segmented controls, the hand control */
export function syncControls() {
  for (const [sel, key, def = false] of SWITCHES) { const c = $(sel); if (!c) continue; c.checked = key === 'edenMapNoFx' ? document.body.classList.contains('nofx') : on(key, def); }
  paintSegs(); tierLabels();
  document.querySelectorAll('#handSeg button').forEach(b => { const x = b.dataset.hand === (window.__hand || 'auto'); b.classList.toggle('on', x); b.setAttribute('aria-pressed', x); });
}

/** applyChanged(keys): run the effects of the changed keys once each, tell the host about its prefs, then refresh the page */
export function applyChanged(keys) {
  const done = new Set(), host = {};
  for (const k of keys) {
    const fn = LIVE[k]; if (fn && !done.has(fn)) { done.add(fn); try { fn(); } catch (e) { console.warn('[profile] live', k, e); } }
    if (HOST_PREFS[k]) { const [name, conv] = HOST_PREFS[k]; host[name] = conv(get(k) ?? hostDefault(k)); }
  }
  if (Object.keys(host).length && window.top !== window) post({ type: 'eden-map:th', op: 'prefs', prefs: host });
  syncControls();
}
