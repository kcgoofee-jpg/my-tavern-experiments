// 城外雾与分层合成（FOG-1，D39 / D40；OBLIQUE-CODE F 斜视合成与外圈）。自成一块，挂点只有数据
// （maps.json 的 alt.composite / views.oblique.composite / views.oblique.outskirts）与既有的开关联动：
// (a) 羽化边缘：组内分层底图的外缘 ~8 %（短边）平滑渐隐进雾（CSS mask 跟着底图矩形走），没有矩形硬边，只渐隐画面、标记照常；
//     斜视图有外圈时遮罩并集扩到外圈（外圈整幅可见，只在本层主图的边缘渐隐进外圈）；
// (b) 合成模式：俯视 = maps.json alt.composite（开关沿用「显示下方城市」的名字与默认）——本层底图（当前时段）→ 掩模 destination-in 抠出岛
//     → 下一层底图 destination-over 垫底；斜视主视图 = views.oblique.composite 常开——本层是带 alpha 的岛图，不用掩模，
//     下一层斜视图按相机文件摆放（公式 F，D41 的 offset 由相机解出），外圈垫在最底下；
// (c) 高空霾：合成开着时垫一层按时段上色的高空霾（径向 + 细噪点，城在雾下读得远），挂在 base 槽位；
//     斜视里「显示下方城市」开 = 霾薄（城市透出），关 = 霾加厚到近乎不透明（云海）。
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
import { viewOf, periodsOf, modeOf, camOf, loadCam, loadCamPath, rectFor, baseOf as oblBase } from './oblique.mjs';

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
.tc-haze { position: absolute; inset: 0; pointer-events: none; transition: background var(--dur-3), opacity var(--dur-3);
  opacity: var(--haze-o, 1);
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

let maskUrl = '', maskAsp = 0, maskKey = '';
function featherMask(asp) {   // 底图纵横比对应的羽化矩形（平滑步进，边上是 0，中心 1）
  if (maskUrl && maskKey === '' && Math.abs(maskAsp - asp) < .001) return maskUrl;
  const W = 256, H = Math.max(2, Math.round(W * asp)), f = Math.max(4, Math.round(Math.min(W, H) * .08));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), img = g.createImageData(W, H), D = img.data;
  const ss = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; D[i] = D[i + 1] = D[i + 2] = 255;
    D[i + 3] = Math.round(255 * ss(x / f) * ss((W - 1 - x) / f) * ss(y / f) * ss((H - 1 - y) / f));
  }
  g.putImageData(img, 0, 0); maskUrl = cv.toDataURL('image/png'); maskAsp = asp; maskKey = ''; return maskUrl;
}
// 外圈并集的羽化矩形：整幅不透明，只有本层主图矩形的边缘按 ~8 %（主图短边）平滑渐隐 —— 主图渐隐进外圈，外圈整幅可见，
// 远处的雾浓淡由外圈成图自己带（边缝已是雾色令牌的颜色，画布外就是雾底色）
function unionMask(asp, rel) {
  const key = asp.toFixed(4) + '|' + [rel.x, rel.y, rel.w, rel.h].map(v => v.toFixed(3)).join(',');
  if (maskUrl && maskKey === key) return maskUrl;
  const W = 256, H = Math.max(2, Math.round(W * asp));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), img = g.createImageData(W, H), D = img.data;
  const ss = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
  const mx0 = rel.x * W, mx1 = (rel.x + rel.w) * W, my0 = rel.y * H, my1 = (rel.y + rel.h) * H;
  const f = Math.max(4, Math.round(Math.min(mx1 - mx0, my1 - my0) * .08));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; D[i] = D[i + 1] = D[i + 2] = 255;
    const inside = x >= mx0 && x <= mx1 && y >= my0 && y <= my1;
    D[i + 3] = inside ? Math.round(255 * ss(Math.min(x - mx0, mx1 - x, y - my0, my1 - y) / f)) : 255;
  }
  g.putImageData(img, 0, 0); maskUrl = cv.toDataURL('image/png'); maskAsp = asp; maskKey = key; return maskUrl;
}
function updateFeather() {
  const cv = osdViewer?.drawer?.canvas, it = osdViewer?.world.getItemAt(0);
  if (!tierOf(currentMapId) || !cv || !it || typeof OpenSeadragon === 'undefined') { delete document.body.dataset.tierfeather; if (cv) delete cv.dataset.fade; return; }
  const b = it.getBounds(true), vp = osdViewer.viewport;
  let u = { x: b.x, y: b.y, width: b.width, height: b.height };
  if (comp.ring) { const rb = comp.ring.getBounds(true), x1 = Math.max(u.x + u.width, rb.x + rb.width), y1 = Math.max(u.y + u.height, rb.y + rb.height);
    u = { x: Math.min(u.x, rb.x), y: Math.min(u.y, rb.y), width: x1 - Math.min(u.x, rb.x), height: y1 - Math.min(u.y, rb.y) }; }
  const rel = { x: (b.x - u.x) / u.width, y: (b.y - u.y) / u.height, w: b.width / u.width, h: b.height / u.height };
  const tl = vp.pixelFromPoint(new OpenSeadragon.Point(u.x, u.y), true), br = vp.pixelFromPoint(new OpenSeadragon.Point(u.x + u.width, u.y + u.height), true);
  const w = Math.max(1, br.x - tl.x), h = Math.max(1, br.y - tl.y), r = document.documentElement;
  injectCss(); document.body.dataset.tierfeather = '1'; cv.dataset.fade = '1';
  r.style.setProperty('--fe-mask', `url("${comp.ring ? unionMask(u.height / u.width, rel) : featherMask(b.height / b.width)}")`);
  r.style.setProperty('--fe-x', `${Math.round(tl.x)}px`); r.style.setProperty('--fe-y', `${Math.round(tl.y)}px`);
  r.style.setProperty('--fe-w', `${Math.round(w)}px`); r.style.setProperty('--fe-h', `${Math.round(h)}px`);
}

// ---------------- (b) 合成模式 + (c) 高空霾 + (d) 外圈 ----------------
const EMPTY = { id: null, mask: null, under: null, underSrc: '', ring: null, ringSrc: '' };
let comp = { ...EMPTY }, hazeEl = null, noiseUrl = '';
// 合成计划来自数据：俯视 alt.composite = { under: <map id>, mask: <小图>, offset?: [nx, ny] }；
// 斜视 views.oblique.composite = { below: <map id>, haze?: 'period' }（岛图自带 alpha，掩模不用，对齐由相机文件解出）
const planOf = id => { const m = mapRegistry?.maps?.[id]; if (!m) return null;
  const ob = modeOf(m) === 'oblique', c = ob ? viewOf(m)?.composite : m?.alt?.composite;
  if (!c || !mapRegistry.maps[c.below || c.under]) return null;
  if (!ob && !c.mask) return null;   // 俯视合成要有掩模；斜视底图自带 alpha
  return { ...c, under: c.under || c.below, ob };
};
const active = id => { const p = planOf(id); return !!p && (p.ob || altOn(id)); };
const frameOf = id => { const f = baseFrame(mapRegistry.maps[id]?.view?.extent_m); return { x: f.x, y: f.y, width: f.width }; };
const underSrcOf = (c, ob) => { const um = mapRegistry.maps[c.under]; return pickPeriod(periodsOf(um), periodNow()).src || oblBase(um); };
const rmIt = it => { if (it) try { osdViewer.world.removeItem(it); } catch (e) { console.warn('[tier-fog] remove failed', e); } };

function noise() {   // 细噪点纹理（一次性，固定种子），霾不是一块平涂
  if (noiseUrl) return noiseUrl;
  const W = 64, cv = document.createElement('canvas'); cv.width = W; cv.height = W;
  const g = cv.getContext('2d'), img = g.createImageData(W, W), D = img.data;
  const h = (x, y) => { let q = Math.imul(x, 374761393) ^ Math.imul(y, 668265263); q = Math.imul(q ^ (q >>> 13), 1274126177); return ((q ^ (q >>> 16)) >>> 0) / 4294967296; };
  for (let i = 0; i < W * W; i++) { const a = Math.round(38 * h(i % W, Math.floor(i / W))); D[i * 4 + 3] = a; }
  g.putImageData(img, 0, 0); noiseUrl = cv.toDataURL('image/png'); return noiseUrl;
}
function veil(on, thin) {
  if (!on) { hazeEl?.remove(); return; }
  const host = slotEl('base'); if (!host) return;   // 槽位容器没挂好：下一次 sync 再挂
  if (!hazeEl) hazeEl = document.createElement('div');
  hazeEl.className = 'tc-haze'; hazeEl.setAttribute('aria-hidden', 'true');
  hazeEl.style.setProperty('--haze-c', fogColors(periodNow()).fog);
  hazeEl.style.setProperty('--haze-n', `url("${noise()}")`);
  hazeEl.style.setProperty('--haze-o', thin ? '.5' : '1');   // 斜视合成：开「显示下方城市」= 霾薄，城市从云隙透出；关 = 云海（近乎不透明）
  if (hazeEl.parentNode !== host) host.appendChild(hazeEl);
}
const altOff = () => { try { LocalStore.remove(ALT_KEY + currentMapId); } catch (e) { console.warn('[tier-fog] alt key', e); } const b = document.getElementById('tgAltBox'); if (b) b.checked = false; };
function clearComp() { rmIt(comp.mask); rmIt(comp.under); comp = { ...EMPTY }; veil(false); }
// 外圈（批 4；views.oblique.outskirts）：同一朝向更大画框的低清环，垫在本层主图（和合成下一层）之下；摆放由外圈自己的相机文件算（公式 F）
function ensureRing(id) {
  const m = mapRegistry?.maps?.[id], o = modeOf(m) === 'oblique' ? viewOf(m)?.outskirts : null;
  if (!o?.cam) { rmIt(comp.ring); comp.ring = null; comp.ringSrc = ''; return; }
  const src = pickPeriod(o.periods, periodNow()).src;
  if (comp.ring && comp.ringSrc === (src || '')) return;
  rmIt(comp.ring); comp.ring = null; comp.ringSrc = src || '';
  if (!src) return;
  loadCamPath(o.cam).then(cb => { if (currentMapId !== id || !cb) return; const r = rectFor(cb, id);
    if (!r) return;
    osdViewer.addTiledImage({ tileSource: src, x: r.x, y: r.y, width: r.width, compositeOperation: 'destination-over',   // 高度由图自己的纵横比给出（OSD 不收 width+height）
      success: e => { comp.ring = e.item; sync(); }, error: () => console.warn('[tier-fog] outskirts failed', src) });
  });
}
function ensureComp() {
  const id = currentMapId;
  if (!osdViewer?.world.getItemCount()) return;
  const plan = planOf(id);
  if (!active(id)) { if (comp.id) clearComp(); ensureRing(id); return; }   // 斜视图的外圈独立于合成开关
  const c = plan;
  if (comp.id && comp.id !== id) clearComp();
  comp.id = id; injectCss(); veil(true, c.ob ? !altOn(id) : false);
  if (c.ob && !camOf(c.under)) { loadCam(c.under).then(() => { if (currentMapId === id) sync(); }); return; }   // 相机没到：先不摆，到了再摆（静默自愈）
  const src = underSrcOf(c, c.ob), uf = frameOf(c.under), f = frameOf(id), off = Array.isArray(c.offset) ? c.offset : [0, 0];
  const place = c.ob ? rectFor(camOf(c.under), id) || uf : { x: uf.x + off[0], y: uf.y + off[1], width: uf.width };
  if (!comp.under || comp.underSrc !== src) {   // 时段变了 → 下一层底图跟着换
    rmIt(comp.under); comp.under = null; comp.underSrc = src;
    osdViewer.addTiledImage({ tileSource: src, x: place.x, y: place.y, width: place.width, compositeOperation: 'destination-over',   // 高度由图自己的纵横比给出
      success: e => { comp.under = e.item; }, error: () => { console.warn('[tier-fog] under map failed', src); if (!c.ob) { altOff(); clearComp(); } } });
  }
  if (!c.ob && !comp.mask) osdViewer.addTiledImage({ tileSource: { type: 'image', url: artUrl(c.mask) }, x: f.x, y: f.y, width: f.width, index: 1, compositeOperation: 'destination-in',
    success: e => { comp.mask = e.item; }, error: () => { console.warn('[tier-fog] mask failed', c.mask); altOff(); clearComp(); } });   // 掩模坏了退回普通底图（静默自愈）
  ensureRing(id);
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
