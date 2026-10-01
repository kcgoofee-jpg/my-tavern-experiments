// 从 viewer.html 内联脚本拆出（大版本 2，docs/design/arch-v2.md §6 第 6 步）。外部模块标签按 <base> 解析，srcdoc 里也安全。
// 核心状态与工具显式 import（app/state、util、nav…）；切层包装经 map-switch.mjs 的 setGo 注册。在所有外挂模块之后、DOMContentLoaded（main）之前执行。
// ---------------- 云（方案 B，v0.9.2；原型 map/_proto/clouds.html，说明 docs/clouds.md §6）----------------
// 自成一块，挂点只有两处：① 经 setGo 包一层 go()（天城层与层之间的切层转场）；② 监听 body[data-map] 与「显示下方城市」开关（漂移云显隐）。
// (a) 漂移：只在上层、云开（没勾「显示下方城市」）时；远近两层，拖动视差 0.85 / 1.2。精灵 art/clouds/puff1–6.png 与瓦片同一基址（jsDelivr 线路也通），用到才加载。
// (b) 切层：9 条斜带 × 3 团从两头扫入 → 全白里换层 → 往两侧散开；转场中点一下跳过。
// 减少动态效果：不漂移、直接换层。省流（lean()）：不漂移、零精灵请求，切层用白幕淡入淡出。
import { REG, cur, depthData, viewer } from './state.mjs';
import { $ } from './dom-helpers.mjs';
import { narrow } from './viewport-mode.mjs';
import { registry } from './layer-host.mjs';
import { altDepth, channel, parallaxOn } from '../core/depth.mjs';
import { lean } from './sharpness-tiers.mjs';
import { altOn, go, setGo } from './map-switch.mjs';
import { viewField } from './nodes-runtime.mjs';   // 包说哪些图有漂移云：视图上的 x-clouds（K-R70）
import { busOn } from './bus.mjs';   // P2-3：全局监听统一登记（键重复先摘旧的，卸载可一把摘净）
(() => {
  const RMq = matchMedia('(prefers-reduced-motion: reduce)'), RM = () => RMq.matches;
  const ANG = 35 * Math.PI / 180, UX = Math.cos(ANG), UY = -Math.sin(ANG), PX = -UY, PY = UX, AR = 440 / 800;
  const SPR = k => `art/clouds/puff${k % 6 + 1}.png`;
  // 默认视野下约 5–8 团看得见（原型太稀）：远层小、慢、淡，近层大、快、稍浓
  const LAYERS = { far: { n: 11, size: [.42, .62], op: [.3, .45], dur: [70, 95], par: .85 }, near: { n: 6, size: [.62, .85], op: [.38, .5], dur: [42, 58], par: 1.2 } };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const isTC = id => { const m = REG?.maps?.[id]; return !!m && m.kind === 'points' && !!m.group; };
  const want = () => !!viewField(cur, 'x-clouds') && !altOn(cur) && !RM() && !lean();
  let box = null, lay = {}, anims = [], shown = false, acc = { far: [0, 0], near: [0, 0] }, last = null, hooked = false;
  const size = () => { const c = viewer.container; return [c.clientWidth, c.clientHeight]; };
  function mount() {
    if (box?.isConnected) return true;
    const dc = viewer?.drawer?.canvas; if (!dc?.parentNode) return false;
    box = document.createElement('div'); box.className = 'cl-drift'; box.setAttribute('aria-hidden', 'true');
    for (const id of ['far', 'near']) { lay[id] = document.createElement('div'); box.appendChild(lay[id]); }
    dc.after(box); return true;                                  // 底图画布之上、标记叠加层之下
  }
  function build() {
    anims.forEach(a => a.cancel()); anims = []; for (const id in lay) lay[id].replaceChildren();
    const [vw, vh] = size(), D = Math.hypot(vw, vh); let s = 0;
    const nk = vw > vh ? .8 : 1;                                  // 横屏同样团数会显得挤：少 20 %
    for (const [id, L] of Object.entries(LAYERS)) for (let k = 0, n = Math.round(L.n * nk); k < n; k++) {
      const el = new Image(); el.alt = ''; el.decoding = 'async'; el.src = SPR(s++);
      const w = D * rnd(...L.size), h = w * AR; el.style.width = w + 'px';
      const off = (k / n - .5) * D * .95 + rnd(-.06, .06) * D;
      const cx = vw / 2 + PX * off - w / 2, cy = vh / 2 + PY * off - h / 2, T = D * .6 + w * .5;
      const op = rnd(...L.op), dur = rnd(...L.dur) * 1000;
      lay[id].appendChild(el);
      anims.push(el.animate([
        { transform: `translate3d(${cx - UX * T}px,${cy - UY * T}px,0)`, opacity: 0 },
        { opacity: op, offset: .12 }, { opacity: op, offset: .88 },
        { transform: `translate3d(${cx + UX * T}px,${cy + UY * T}px,0)`, opacity: 0 }], { duration: dur, iterations: Infinity, delay: -((k * .618 + (id === 'near') * .31) % 1) * dur,   /* 黄金比例错相：可见团数稳定 */ easing: 'linear' }));
    }
  }
  // U16：云片的视差系数取自 upper_depth.json 的 parallax 通道（同一份数据、同一套公式，不在本模块另写常数）。
  // 近层对应最高的云片 c1（离相机最近），远层对应最低的 c3；以最近那张为 1 归一，保留原本远 .85 / 近 1.2 的手感。
  function parOf(id) {
    const base = LAYERS[id].par, cfg = depthData;
    if (!cfg?.cloud_sheets?.length) return base;                   // 没有纵深数据（别的层 / 取不到）：沿用原手感
    if (!parallaxOn(cfg) || narrow || RM()) return 0;              // 总开关关、手机、减少动态效果：视差关（云不随平移位移）
    const alts = cfg.cloud_sheets.map(s => s.alt).sort((a, b) => b - a), hi = alts[0], lo = alts[alts.length - 1];
    const at = a => channel('parallax', altDepth(a, cfg), cfg), ref = at(hi);
    return ref ? base * at(id === 'near' ? hi : lo) / ref : base;
  }
  function pan() {                                                // 视差：按底图屏幕位移累加；超出半屏时淡出重排（不跳）
    if (!shown) return;
    const vp = viewer.viewport, c = vp.getCenter(true), sc = size()[0] / vp.getBounds(true).width;
    if (last) { const dx = -(c.x - last.x) * sc, dy = -(c.y - last.y) * sc;
      for (const id in LAYERS) { const a = acc[id], p = parOf(id); a[0] += dx * p; a[1] += dy * p; lay[id].style.transform = `translate3d(${a[0]}px,${a[1]}px,0)`; } }
    last = c;
    const [vw, vh] = size();
    if (!box.classList.contains('fade') && (Math.abs(acc.near[0]) > vw * .6 || Math.abs(acc.near[1]) > vh * .6)) reset(true);
  }
  function reset(soft) {
    const apply = () => { acc = { far: [0, 0], near: [0, 0] }; last = null; for (const id in lay) lay[id].style.transform = ''; if (shown) build(); box.classList.remove('fade'); };
    if (soft) { box.classList.add('fade'); setTimeout(apply, 300); } else apply();
  }
  function hide() { shown = false; anims.forEach(a => a.cancel()); anims = []; if (box) { for (const id in lay) lay[id].replaceChildren(); box.hidden = true; } }
  function sync() {
    if (!viewer) return;
    if (!hooked) { hooked = true;
      viewer.addHandler('animation', pan); viewer.addHandler('viewport-change', pan);
      let rt; viewer.addHandler('resize', () => { clearTimeout(rt); rt = setTimeout(() => shown && reset(false), 150); });
      viewer.addHandler('close', () => { if (cur == null) hide(); });
    }
    if (!want()) return hide();
    if (!shown && mount()) { shown = true; box.hidden = false; reset(false); }
  }
  new MutationObserver(() => setTimeout(sync, 0)).observe(document.body, { attributes: true, attributeFilter: ['data-map'] });
  busOn({ key: 'clouds.altToggle', target: document, type: 'change', fn: e => { if (e.target?.id === 'tgAltBox') setTimeout(sync, 0); } });
  RMq.addEventListener?.('change', sync);
  busOn({ key: 'clouds.visibility', target: document, type: 'visibilitychange', fn: () => anims.forEach(a => document.hidden ? a.pause() : a.play()) });

  // ---------- 切层转场（v0.9.6：短的升 / 降，替换原来的大云团扫屏）----------
  // 用户实测 v0.9.5：「✓ 已加载」之后大团模糊云还停在中层 / 下层上面——Web Animations 的 finished 在 WKWebView 里可能一直不 resolve，
  // 云团停在 fill: forwards 的不透明状态。现在：各层共用同一平面范围（3000×1875 m），切层保持当前 x / y（groupView），
  // 只做 ≈ 420 ms 的升降：旧画面放大淡出（往下）或缩小淡出（往上），新图从反方向轻微缩放淡入。
  // 每一步都有硬超时，finally 里无条件清场；减少动态效果：直接换层。
  let busy = false;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const idx = id => REG.groups[REG.maps[id].group].layers.indexOf(id);
  const drawn = ms => new Promise(r => { const t = setTimeout(r, ms); viewer.addOnceHandler('tile-drawn', () => { clearTimeout(t); setTimeout(r, 30); }); });
  const within = (p, ms) => Promise.race([p, wait(ms)]);
  async function riseSink(id, run) {
    const down = idx(id) > idx(cur), src = viewer.drawer?.canvas, osd = $('#osd'); let snap = null;
    if (src?.width) { snap = document.createElement('canvas'); snap.width = src.width; snap.height = src.height; snap.className = 'snap tier-snap'; snap.style.setProperty('z-index', 'var(--zu-snap)');
      try { snap.getContext('2d').drawImage(src, 0, 0); $('#stage').appendChild(snap); } catch (e) { snap = null; } }
    const anims = [];
    try {
      await run(); await within(drawn(600), 700);
      const D = 420, E = 'cubic-bezier(.3,.7,.3,1)';
      if (snap) anims.push(snap.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: `scale(${down ? 1.14 : .88})`, opacity: 0 }], { duration: D, easing: E, fill: 'forwards' }));
      anims.push(osd.animate([{ transform: `scale(${down ? .94 : 1.06})`, opacity: .35 }, { transform: 'scale(1)', opacity: 1 }], { duration: D, easing: E }));
      await within(Promise.all(anims.map(a => a.finished.catch(() => {}))), D + 250);
    } finally { anims.forEach(a => { try { a.cancel(); } catch (e) {} }); snap?.remove(); osd.style.transform = ''; osd.style.opacity = ''; }
  }
  const go0 = go;
  setGo(async function (id, ...rest) {                             // 挂点 ①：只包天城层与层之间的切换，其余原样
    if (busy || RM() || !viewer || id === cur || !isTC(cur) || !isTC(id) || REG.maps[cur].group !== REG.maps[id].group || !viewer.world.getItemCount()) return go0(id, ...rest);
    busy = true; let p;
    try { await riseSink(id, () => (p = go0(id, ...rest))); } catch (e) { if (!p) p = go0(id, ...rest); }
    finally { busy = false; }
    return p;
  });
  window.__clouds = { sync, state: () => ({ shown, drift: anims.length, busy, cover: !!document.querySelector('.tier-snap'), rm: RM(), lean: lean(), n: box ? box.querySelectorAll('img').length : 0,
    visible: box && shown ? [...box.querySelectorAll('img')].filter(el => { const r = el.getBoundingClientRect(), s = viewer.container.getBoundingClientRect();
      return +getComputedStyle(el).opacity > .15 && r.right > s.left + r.width * .3 && r.left < s.right - r.width * .3 && r.bottom > s.top + r.height * .3 && r.top < s.bottom - r.height * .3; }).length : 0 }) };
  // P3-C：漂移云登记为 depth-haze 槽的 dom 图层（槽位容器 .vpslot[data-slot="depth-haze"] 挂好后由 boot 的 mountAll 调 mount）
  registry.register({ id: 'clouds', slot: 'depth-haze', kind: 'dom', mount: () => sync(), unmount: () => hide(), setVisible: v => (v ? sync() : hide()) });
})();
