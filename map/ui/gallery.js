// 通用房间图集：openGallery(set, { lang, base, start, onClose })，set 取自 map/data/room_galleries.json 的一项。
// 大图懒加载（当前张 + 预取相邻两张），手机左右滑，桌面 ← → / Esc。
import { mountProgress } from './progress.mjs';   // fix3：统一加载进度组件（大图加载中 / 失败重试）
let el = null, st = null;
const CSS = `
.rg{position:fixed;inset:0;z-index:50;box-sizing:border-box;padding:calc(var(--bar-h,44px) + 12px + env(safe-area-inset-top,0px)) 0 8px;background:rgba(8,7,5,.93);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#eee4cc;font:13px/1.5 system-ui,sans-serif;touch-action:pan-y;user-select:none;-webkit-user-select:none}
.rg .rg-img{max-width:min(96vw,1600px);max-height:calc(100vh - 206px - env(safe-area-inset-top,0px));object-fit:contain;border-radius:4px;box-shadow:0 10px 40px rgba(0,0,0,.5);background:#1b1812;-webkit-user-drag:none}
.rg .rg-cap{margin:10px 16px 6px;text-align:center;max-width:720px}.rg .rg-cap b{color:var(--gold,#e6c36a);font-weight:500;margin-right:8px}
.rg .rg-th{display:flex;gap:6px;overflow-x:auto;max-width:96vw;padding:4px}
.rg .rg-th img{width:72px;height:48px;object-fit:cover;opacity:.5;cursor:pointer;border:1px solid transparent;border-radius:3px}.rg .rg-th img.on{opacity:1;border-color:var(--gold,#e6c36a)}
.rg button{all:unset;cursor:pointer;position:absolute;color:#eee4cc;font-size:28px;line-height:1;padding:10px 14px;border-radius:50%;background:rgba(0,0,0,.35)}
.rg button:focus-visible{outline:2px solid var(--focus,#63b4be);outline-offset:2px}.rg button:hover,.rg button:focus-visible{background:color-mix(in srgb,var(--gold,#e6c36a) 50%,transparent)}
.rg button{min-width:var(--hit,44px);min-height:var(--hit,44px);box-sizing:border-box;text-align:center}.rg .rg-x{top:calc(8px + env(safe-area-inset-top,0px));right:calc(8px + env(safe-area-inset-right,0px));font-size:22px}.rg .rg-p{left:12px;top:50%}.rg .rg-n{right:12px;top:50%}
@media (max-width:640px){.rg .rg-p,.rg .rg-n{display:none}}
.rg .rg-lp{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);padding:10px 16px;border-radius:10px;background:rgba(0,0,0,.55)}.rg .rg-lp[hidden]{display:none}
.rg .rg-lp .uiprog-retry{position:static;font-size:13px;line-height:1;border-radius:8px;padding:8px 14px;background:var(--gold,#e6c36a);color:#111}`;
const url = (im, t = '') => st.base + st.set.dir + im.f + t + '.jpg';
function show(i) {
  const imgs = st.set.images, n = imgs.length; st.i = ((i % n) + n) % n;
  const im = imgs[st.i], cap = st.lang === 'en' ? im.en || im.zh : im.zh;
  const img = el.querySelector('.rg-img'), lp = st.lp, zh = st.lang !== 'en';
  lp.el.hidden = false; lp.reset(zh ? `加载第 ${st.i + 1} / ${n} 张…` : `Loading ${st.i + 1} / ${n}…`);
  img.onload = () => { lp.done(); lp.el.hidden = true; }; img.onerror = () => lp.fail(zh ? '图片加载失败' : 'Image failed to load');
  img.src = url(im); img.alt = cap; if (img.complete && img.naturalWidth) { lp.done(); lp.el.hidden = true; }
  const c = el.querySelector('.rg-cap'); c.innerHTML = `<b>${st.i + 1} / ${n}</b>`; c.append(cap);
  el.querySelectorAll('.rg-th img').forEach((t, k) => t.classList.toggle('on', k === st.i));
  for (const d of [1, -1]) new Image().src = url(imgs[(st.i + d + n) % n]);
}
function key(e) {
  if (e.key === 'Escape') closeGallery(); else if (e.key === 'ArrowRight') show(st.i + 1); else if (e.key === 'ArrowLeft') show(st.i - 1); else return;
  e.preventDefault(); e.stopImmediatePropagation();
}
export function closeGallery() {
  if (!el) return; const cb = st?.onClose;
  el.remove(); el = null; st = null; removeEventListener('keydown', key, true); cb?.();
}
export function openGallery(set, { lang = 'zh', base = '', start = 0, onClose } = {}) {
  if (!set?.images?.length) return;
  closeGallery();
  if (!document.getElementById('rg-css')) { const s = document.createElement('style'); s.id = 'rg-css'; s.textContent = CSS; document.head.append(s); }
  st = { set, lang, base, i: 0, onClose };
  const zh = lang !== 'en', t = zh ? set.title : set.title_en || set.title;
  el = document.createElement('div'); el.className = 'rg';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', t);
  el.innerHTML = `<img class="rg-img" decoding="async" draggable="false"><div class="rg-cap"></div><div class="rg-th"></div>` +
    `<button class="rg-x" type="button" aria-label="${zh ? '关闭' : 'Close'}">✕</button>` +
    `<button class="rg-p" type="button" aria-label="${zh ? '上一张' : 'Previous'}">‹</button>` +
    `<button class="rg-n" type="button" aria-label="${zh ? '下一张' : 'Next'}">›</button>`;
  st.lp = mountProgress(el, { lang, onRetry: () => { const i = st.i; el.querySelector('.rg-img').removeAttribute('src'); show(i); } }); st.lp.el.classList.add('rg-lp');
  const th = el.querySelector('.rg-th');
  set.images.forEach((im, k) => {
    const i = document.createElement('img'); i.loading = 'lazy'; i.alt = ''; i.src = url(im, '_t');
    i.onclick = (e) => { e.stopPropagation(); show(k); }; th.append(i);
  });
  el.querySelector('.rg-x').onclick = (e) => { e.stopPropagation(); closeGallery(); };
  el.querySelector('.rg-p').onclick = (e) => { e.stopPropagation(); show(st.i - 1); };
  el.querySelector('.rg-n').onclick = (e) => { e.stopPropagation(); show(st.i + 1); };
  let sx = null, sy = 0, swiped = false;
  el.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; swiped = false; });
  el.addEventListener('pointerup', (e) => {
    if (sx == null) return; const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) { swiped = true; show(st.i + (dx < 0 ? 1 : -1)); }
  });
  el.addEventListener('click', (e) => { if (e.target === el && !swiped) closeGallery(); });
  document.body.append(el); addEventListener('keydown', key, true);
  show(start); el.querySelector('.rg-x').focus();
}
