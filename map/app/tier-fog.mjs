// 城外雾与分层合成（FOG-1，D39 / D40）。自成一块，挂点只有数据（maps.json 的 alt.composite）与既有的开关联动：
// (a) 羽化边缘：组内分层底图的外缘 ~8 %（短边）平滑渐隐进雾（CSS mask 跟着底图矩形走），没有矩形硬边，只渐隐画面、标记照常；
// (b) 合成模式（maps.json alt.composite，开关沿用「显示下方城市」的名字与默认）：画布三层 ——
//     本层底图（当前时段）→ 掩模小图 destination-in 抠出岛 → 下一层底图 destination-over 垫底；
//     掩模 / 下一层图 id / 位移（斜视版对齐用，D41）全部来自数据，引擎不写死任何一层；
// (c) 高空霾：合成开着时垫一层按时段上色的高空霾（径向 + 细噪点，城在雾下读得远），挂在 base 槽位。
// 时段 = 世界时钟的有效档位（与底图换档同一来源）；颜色一律走 ui/tokens.css 的 --fog-* 令牌。
// 减少动态：霾与羽化都是静态；省流：掩模是一张随包发布的小图。
import { mapRegistry, currentMapId, osdViewer } from './state.mjs';
import { altOn, ALT_KEY } from './map-switch.mjs';
import { periodNow } from './period-now.mjs';
import { pickPeriod } from '../core/period-pick.mjs';
import { baseFrame } from '../core/base-frame.mjs';
import { artUrl } from './current-pack.mjs';
import { plugins } from './plugins.mjs';
import { slotEl } from './layer-host.mjs';
import { busOn } from './bus.mjs';

// 组内分层（与 scale-handoff 同一判定）：这张图属于一个「世界图地点有自己地图」的组
export const tierOf = id => { const m = mapRegistry?.maps?.[id]; return m && m.kind === 'points' && m.group && mapRegistry.groups[m.group]?.place ? m.group : null; };
// 令牌取值（ui/tokens.css；period 为空按 day）
const varOf = k => { try { return getComputedStyle(document.documentElement).getPropertyValue(k).trim(); } catch (e) { return ''; } };
export const fogColors = period => { const p = period || 'day'; return { fog: varOf(`--fog-${p}`) || '#e9edee', hi: varOf(`--fog-${p}-hi`) || '#f6f8f8' }; };

// ---------------- (a) 羽化边缘 ----------------
// 遮罩只挂在 OSD 那一块画布上（data-fade 由 updateFeather 打）：画布之外的槽位（标记、地名、霾、雾、漂移云）都不淡，
// 「只淡画面，标记照常清楚」。地图区的底色同时换成当前时段的雾色 —— 画布外缘渐隐进来时底下就是雾，不是页面底色。
const CSS = `body[data-tierfeather] #osd { background: var(--fog-day); }
body[data-tierfeather][data-tod=dawn] #osd { background: var(--fog-dawn); }
body[data-tierfeather][data-tod=dusk] #osd { background: var(--fog-dusk); }
body[data-tierfeather][data-tod=night] #osd { background: var(--fog-night); }
#osd canvas[data-fade] { -webkit-mask-image: var(--fe-mask); mask-image: var(--fe-mask);
  -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
  -webkit-mask-size: var(--fe-w, 100%) var(--fe-h, 100%); mask-size: var(--fe-w, 100%) var(--fe-h, 100%);
  -webkit-mask-position: var(--fe-x, 0) var(--fe-y, 0); mask-position: var(--fe-x, 0) var(--fe-y, 0); }
.tc-haze { position: absolute; inset: 0; pointer-events: none; transition: background var(--dur-3);
  background: radial-gradient(115% 92% at 50% 44%, color-mix(in srgb, var(--haze-c, var(--fog-day)) 10%, transparent) 30%, color-mix(in srgb, var(--haze-c, var(--fog-day)) 62%, transparent) 100%); }
.tc-haze::after { content: ''; position: absolute; inset: 0; background-image: var(--haze-n, none); background-size: 160px 160px; opacity: .45; }
/* A7（FOG-1）：没有时段底图的图（世界 / 各地点图）按时段整体调色（色阶 + 蓝移 + 晕影）；与 nighttint 互斥（custom-tint.mjs 判定 data-gradetod） */
body[data-gradetod] #osd canvas { filter: var(--grade-day); transition: filter .6s; }
body[data-gradetod=dawn] #osd canvas { filter: var(--grade-dawn); }
body[data-gradetod=dusk] #osd canvas { filter: var(--grade-dusk); }
body[data-gradetod=night] #osd canvas { filter: var(--grade-night); }
body[data-gradetod=dawn] #osd::after { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: var(--zl-1); background: radial-gradient(ellipse at 50% 42%, transparent 52%, var(--vig-dawn)); mix-blend-mode: multiply; }
body[data-gradetod=dusk] #osd::after { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: var(--zl-1); background: radial-gradient(ellipse at 50% 42%, transparent 52%, var(--vig-dusk)); mix-blend-mode: multiply; }
body[data-gradetod=night] #osd::after { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: var(--zl-1); background: radial-gradient(ellipse at 50% 42%, transparent 46%, var(--vig-night)); mix-blend-mode: multiply; }`;
let cssDone = false;
function injectCss() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.id = 'tierFogCss'; s.textContent = CSS; document.head.appendChild(s); }

let maskUrl = '', maskAsp = 0;
function featherMask(asp) {   // 底图纵横比对应的羽化矩形（平滑步进，边上是 0，中心 1）
  if (maskUrl && Math.abs(maskAsp - asp) < .001) return maskUrl;
  const W = 256, H = Math.max(2, Math.round(W * asp)), f = Math.max(4, Math.round(Math.min(W, H) * .08));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), img = g.createImageData(W, H), D = img.data;
  const ss = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; D[i] = D[i + 1] = D[i + 2] = 255;
    D[i + 3] = Math.round(255 * ss(x / f) * ss((W - 1 - x) / f) * ss(y / f) * ss((H - 1 - y) / f));
  }
  g.putImageData(img, 0, 0); maskUrl = cv.toDataURL('image/png'); maskAsp = asp; return maskUrl;
}
function updateFeather() {
  const cv = osdViewer?.drawer?.canvas, it = osdViewer?.world.getItemAt(0);
  if (!tierOf(currentMapId) || !cv || !it || typeof OpenSeadragon === 'undefined') { delete document.body.dataset.tierfeather; if (cv) delete cv.dataset.fade; return; }
  const b = it.getBounds(true), vp = osdViewer.viewport;
  const tl = vp.pixelFromPoint(new OpenSeadragon.Point(b.x, b.y), true), br = vp.pixelFromPoint(new OpenSeadragon.Point(b.x + b.width, b.y + b.height), true);
  const w = Math.max(1, br.x - tl.x), h = Math.max(1, br.y - tl.y), r = document.documentElement;
  injectCss(); document.body.dataset.tierfeather = '1'; cv.dataset.fade = '1';
  r.style.setProperty('--fe-mask', `url("${featherMask(b.height / b.width)}")`);
  r.style.setProperty('--fe-x', `${Math.round(tl.x)}px`); r.style.setProperty('--fe-y', `${Math.round(tl.y)}px`);
  r.style.setProperty('--fe-w', `${Math.round(w)}px`); r.style.setProperty('--fe-h', `${Math.round(h)}px`);
}

// ---------------- (b) 合成模式 + (c) 高空霾 ----------------
const EMPTY = { id: null, mask: null, under: null, underSrc: '' };
let comp = { ...EMPTY }, hazeEl = null, noiseUrl = '';
// 合成计划来自数据：alt.composite = { under: <map id>, mask: <小图>, offset?: [nx, ny] }（offset 斜视对齐用，D41）
const planOf = id => { const m = mapRegistry?.maps?.[id], c = m?.alt?.composite; return c?.mask && mapRegistry.maps[c.under] ? c : null; };
const active = id => { const m = mapRegistry?.maps?.[id]; return !!m && !!planOf(id) && altOn(id); };
const frameOf = id => { const f = baseFrame(mapRegistry.maps[id]?.view?.extent_m); return { x: f.x, y: f.y, width: f.width }; };
const underSrcOf = c => { const um = mapRegistry.maps[c.under]; return pickPeriod(um.periods, periodNow()).src || um.base; };
const rmIt = it => { if (it) try { osdViewer.world.removeItem(it); } catch (e) { console.warn('[tier-fog] remove failed', e); } };

function noise() {   // 细噪点纹理（一次性，固定种子），霾不是一块平涂
  if (noiseUrl) return noiseUrl;
  const W = 64, cv = document.createElement('canvas'); cv.width = W; cv.height = W;
  const g = cv.getContext('2d'), img = g.createImageData(W, W), D = img.data;
  const h = (x, y) => { let q = Math.imul(x, 374761393) ^ Math.imul(y, 668265263); q = Math.imul(q ^ (q >>> 13), 1274126177); return ((q ^ (q >>> 16)) >>> 0) / 4294967296; };
  for (let i = 0; i < W * W; i++) { const a = Math.round(38 * h(i % W, Math.floor(i / W))); D[i * 4 + 3] = a; }
  g.putImageData(img, 0, 0); noiseUrl = cv.toDataURL('image/png'); return noiseUrl;
}
function veil(on) {
  if (!on) { hazeEl?.remove(); return; }
  const host = slotEl('base'); if (!host) return;   // 槽位容器没挂好：下一次 sync 再挂
  if (!hazeEl) hazeEl = document.createElement('div');
  hazeEl.className = 'tc-haze'; hazeEl.setAttribute('aria-hidden', 'true');
  hazeEl.style.setProperty('--haze-c', fogColors(periodNow()).fog);
  hazeEl.style.setProperty('--haze-n', `url("${noise()}")`);
  if (hazeEl.parentNode !== host) host.appendChild(hazeEl);
}
const altOff = () => { try { LocalStore.remove(ALT_KEY + currentMapId); } catch (e) { console.warn('[tier-fog] alt key', e); } const b = document.getElementById('tgAltBox'); if (b) b.checked = false; };
function clearComp() { rmIt(comp.mask); rmIt(comp.under); comp = { ...EMPTY }; veil(false); }
function ensureComp() {
  const id = currentMapId;
  if (!osdViewer?.world.getItemCount()) return;
  if (!active(id)) { if (comp.id) clearComp(); return; }
  const c = planOf(id);
  if (comp.id && comp.id !== id) clearComp();
  comp.id = id; injectCss(); veil(true);
  const src = underSrcOf(c), uf = frameOf(c.under), f = frameOf(id), off = Array.isArray(c.offset) ? c.offset : [0, 0];
  if (!comp.under || comp.underSrc !== src) {   // 时段变了 → 下一层底图跟着换
    rmIt(comp.under); comp.under = null; comp.underSrc = src;
    osdViewer.addTiledImage({ tileSource: src, x: uf.x + off[0], y: uf.y + off[1], width: uf.width, compositeOperation: 'destination-over',
      success: e => { comp.under = e.item; }, error: () => { console.warn('[tier-fog] under map failed', src); altOff(); clearComp(); } });
  }
  if (!comp.mask) osdViewer.addTiledImage({ tileSource: { type: 'image', url: artUrl(c.mask) }, x: f.x, y: f.y, width: f.width, index: 1, compositeOperation: 'destination-in',
    success: e => { comp.mask = e.item; }, error: () => { console.warn('[tier-fog] mask failed', c.mask); altOff(); clearComp(); } });   // 掩模坏了退回普通底图（静默自愈）
}
let queued = 0;
function sync() { clearTimeout(queued); queued = setTimeout(() => { injectCss(); updateFeather(); ensureComp(); }, 60); }
function init() {
  if (typeof osdViewer === 'undefined' || !osdViewer || typeof osdViewer.addHandler !== 'function') return false;
  osdViewer.addHandler('open', () => { comp = { ...EMPTY }; veil(false); sync(); });   // go() 整个换世界：引用全失效，按新图重挂
  osdViewer.addHandler('animation', updateFeather);
  osdViewer.addHandler('viewport-change', updateFeather);
  return true;
}
const t0 = setInterval(() => { if (init()) { clearInterval(t0); sync(); } }, 100);
new MutationObserver(() => sync()).observe(document.body, { attributes: true, attributeFilter: ['data-map'] });
busOn({ key: 'tier-fog.altToggle', target: document, type: 'change', fn: e => { if (e.target?.id === 'tgAltBox') sync(); } });
busOn({ key: 'tier-fog.clock', type: 'message', fn: e => { if (!window.__isFromHost?.(e)) return; if (e.data?.type === 'eden-map:clock') sync(); } });
window.__tierFogProbe = { state: () => ({ period: periodNow(), feather: document.body.dataset.tierfeather || '',
  comp: active(currentMapId) ? { id: comp.id, mask: !!comp.mask, under: !!comp.under, underSrc: comp.underSrc } : null,
  veil: !!document.querySelector('.tc-haze') }) };
