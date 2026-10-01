// Overlay building blocks (docs/layers-schema.md §2.3, K-R80): `point`, `label`, `line` and `area` features drawn as map overlays that follow the base map.
// `line` / `area` share one SVG per layer per view (viewBox 0 0 1000 1000*aspect, non-scaling strokes); `point` / `label` are small HTML elements
// placed at their position. All pack text goes in with textContent; every colour, icon name and number is re-checked here before it reaches a
// style or markup (K-R64), and colours reach CSS only through custom properties. The styles live in one injected <style> (the stash-markers pattern).
import { SLOTS } from '../core/layer-registry.mjs';
import { recheck } from '../core/pack-v2-spec.mjs';
import { styleFor, pathD, circlePath } from '../core/layer-geometry.mjs';
import { iconSvg } from './dom-helpers.mjs';

const CSS_ID = 'lyrCss', NS = 'http://www.w3.org/2000/svg', HEX8 = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, ICON = /^[a-z][a-z0-9-]{0,31}$/;
const CSS = `
${SLOTS.map(s => `.lyr[data-slot="${s}"] { z-index: var(--zv-${s}); }`).join('\n')}
.lyr-svg { pointer-events: none; overflow: visible; }
.lyr-svg path { fill: none; stroke: var(--lc); stroke-width: var(--lw); stroke-dasharray: var(--ld); opacity: var(--lo); vector-effect: non-scaling-stroke; stroke-linecap: round; stroke-linejoin: round; }
.lyr-svg path.halo { stroke: rgba(8,10,14,.28); stroke-width: calc(var(--lw) + 1.4px); stroke-dasharray: none; }
.lyr-svg path.fill { fill: var(--lf); fill-opacity: var(--lfo); }
.lyr-pt { pointer-events: none; color: var(--lc); opacity: var(--lo); }
.lyr-pt i { display: block; width: var(--ls); height: var(--ls); border-radius: 50%; background: currentColor; border: 1.5px solid var(--map-label-ink, #fff8); box-sizing: border-box; }
.lyr-pt i.ic { background: none; border: 0; border-radius: 0; } .lyr-pt i.ic svg { width: 100%; height: 100%; display: block; }
.lyr-pt i.ic img { width: 100%; height: 100%; object-fit: contain; display: block; }
.lyr-pt.lyr-tip { pointer-events: auto; }
.lyr-prop { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.lyr-prop img { display: block; width: var(--ls, 32px); height: auto; max-height: 64px; object-fit: contain; }
.lyr-prop span { font: 500 var(--fs-micro, 11px)/1.4 var(--font-ui, system-ui); color: var(--map-label-ink, #fff); text-shadow: 0 0 3px #000c; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lyr-pt.pulse i { animation: lyrPulse 2.4s ease-in-out infinite; }
.lyr-lb { pointer-events: none; width: max-content; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--map-label-ink, #fff); opacity: var(--lo);
  font: 500 var(--lfs, var(--fs-micro, 11px))/1.5 var(--font-ui, system-ui); }
.lyr-lb.chip { padding: 1px 6px; border-radius: var(--r-pill, 999px); background: var(--map-label-bg, #14121ae6); border: 1px solid var(--map-label-line, #ffffff26); box-shadow: var(--sh-1); }
.lyr-lb.plain { text-shadow: 0 0 3px #000c, 0 0 1px #000; }
.lgsw { display: inline-block; width: 18px; height: 0; margin-right: 6px; vertical-align: middle; border-top: 2px solid var(--sw); }
.lgsw[data-dash] { border-top-style: dashed; }
.lgsw[data-shape="dot"] { width: 10px; height: 10px; border: 0; border-radius: 50%; background: var(--sw); }
.lgsw[data-shape="fill"] { width: 14px; height: 10px; border: 1px solid var(--sw); background: color-mix(in srgb, var(--sw) 30%, transparent); }
@keyframes lyrPulse { 0%, 100% { transform: scale(1); opacity: .85; } 50% { transform: scale(1.35); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .lyr-pt.pulse i { animation: none; transform: scale(1.2); } }`;

/** ensureCss(): the one injected <style id="lyrCss"> (overlay blocks and the legend swatch); idempotent. */
export function ensureCss() {
  if (typeof document === 'undefined' || document.getElementById(CSS_ID)) return;
  const s = document.createElement('style'); s.id = CSS_ID; s.textContent = CSS; document.head.appendChild(s);
}
/** cssColor(c) -> a value for a CSS custom property: `#rrggbb[aa]` as is, a kernel token name as var(--name), anything else null. */
export const cssColor = c => (typeof c === 'string' && HEX8.test(c) ? c : recheck.tokenName(c) ? `var(${c})` : null);
const color = (c, fallback = '--accent') => cssColor(c) || `var(${fallback})`;
let propUrl = () => null;   // K-R88: a local layer's `icon: "prop:<id>"` is shown through the object URL of the user's own picture (set by prop-store.mjs); a pack cannot name one
export const setPropResolver = fn => { propUrl = typeof fn === 'function' ? fn : () => null; };
const text = (f, lang) => (f.i18n?.[lang]?.label ?? f.label ?? '');

function pathEl(d, cls) { const e = document.createElementNS(NS, 'path'); e.setAttribute('d', d); if (cls) e.setAttribute('class', cls); return e; }
function strokeVars(e, s) {
  e.style.setProperty('--lc', color(s.color)); e.style.setProperty('--lw', String(s.width)); e.style.setProperty('--lo', String(s.opacity));
  e.style.setProperty('--ld', Array.isArray(s.dash) && s.dash.length ? s.dash.join(' ') : 'none');
}

/** svgLayer(layer, features, { aspect }) -> the SVG element of a `line` / `area` layer (one per layer per view), or null when no feature has a path. */
export function svgLayer(layer, features, { aspect = 1 } = {}) {
  ensureCss();
  const VW = 1000, VH = 1000 * aspect, svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'lyr lyr-svg'); svg.dataset.slot = layer.slot; svg.dataset.layer = layer.id;
  let n = 0;
  for (const f of features) {
    const d = f.pts ? pathD(f.pts, layer.type === 'area' || !!f.closed, VW, VH) : f.at && f.r ? circlePath(f.at, f.r, VW, VH) : '';
    if (!d) continue;
    const s = styleFor(layer, f.kind);
    if (layer.type === 'line' && s.halo) { const h = pathEl(d, 'halo'); strokeVars(h, s); svg.appendChild(h); }
    const p = pathEl(d, layer.type === 'area' ? 'fill' : '');
    strokeVars(p, s);
    if (layer.type === 'area') { p.style.setProperty('--lf', color(s.fill, s.color)); p.style.setProperty('--lfo', String(s.fill_opacity)); }
    svg.appendChild(p); n++;
  }
  return n ? svg : null;
}

/** pointEl(feature, style, lang) -> the HTML element of a `point` feature (constant screen size; `pulse` animates, reduced motion makes it static). */
export function pointEl(f, s, lang = 'zh') {
  ensureCss();
  const el = document.createElement('div'); el.className = 'lyr lyr-pt' + (s.pulse ? ' pulse' : '');
  el.dataset.slot = 'markers';
  el.style.setProperty('--lc', color(s.color)); el.style.setProperty('--lo', String(s.opacity)); el.style.setProperty('--ls', `${s.size}px`);
  const dot = document.createElement('i');
  if (typeof s.icon === 'string' && /^prop:[A-Za-z0-9_-]{1,64}$/.test(s.icon)) { const u = propUrl(s.icon.slice(5)); if (u) { const im = document.createElement('img'); im.src = u; im.alt = ''; dot.className = 'ic'; dot.appendChild(im); } }
  else if (typeof s.icon === 'string' && ICON.test(s.icon)) { const svg = iconSvg(s.icon); if (svg) { dot.className = 'ic'; dot.innerHTML = svg; } }   // kernel icon markup, chosen by a re-checked name
  el.appendChild(dot);
  const label = text(f, lang);
  if (label) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', label); } else el.setAttribute('aria-hidden', 'true');
  return el;
}

/** labelEl(feature, style, lang) -> the HTML element of a `label` feature (text only; `tone` chip | plain, `size` micro | small | body). */
export function labelEl(f, s, lang = 'zh') {
  ensureCss();
  const el = document.createElement('div'), label = text(f, lang);
  el.className = 'lyr lyr-lb ' + (s.tone === 'plain' ? 'plain' : 'chip'); el.dataset.slot = 'labels';
  el.textContent = label; el.style.setProperty('--lo', String(s.opacity));
  el.style.setProperty('--lfs', `var(--fs-${['micro', 'small', 'body'].includes(s.size) ? s.size : 'micro'})`);
  if (label) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', label); } else el.setAttribute('aria-hidden', 'true');
  return el;
}

/**
 * drawOverlay({ viewer, layer, features, aspect, lang }) -> { count, remove() }: draws a layer's features as overlays of the OSD viewer.
 * Features carry `at` / `pts` in the 0..1 frame of the view (a node feature must have been given its `at` by the caller).
 */
export function drawOverlay({ viewer, layer, features, aspect = 1, lang = 'zh' }) {
  const els = []; let count = 0;
  const add = (element, location, placement) => { try { viewer.addOverlay({ element, location, ...(placement ? { placement } : {}) }); els.push(element); } catch (e) {} };
  if (layer.type === 'line' || layer.type === 'area') {
    const svg = svgLayer(layer, features, { aspect });
    if (svg) { add(svg, new OpenSeadragon.Rect(0, 0, 1, aspect)); count = features.length; }
  } else if (layer.type === 'point' || layer.type === 'label') {
    for (const f of features) {
      if (!f.at) continue;
      const s = styleFor(layer, f.kind), el = (layer.type === 'point' ? pointEl : labelEl)(f, s, lang);
      add(el, new OpenSeadragon.Point(f.at[0], f.at[1] * aspect), OpenSeadragon.Placement.CENTER); count++;
    }
  }
  return { count, remove() { for (const el of els) { try { viewer.removeOverlay(el); } catch (e) {} try { el.remove(); } catch (e) {} } els.length = 0; } };
}
