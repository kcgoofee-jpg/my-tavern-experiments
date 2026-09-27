// 通用房间图集：openGallery(set, { lang, base, start, onClose })，set 取自 map/data/room_galleries.json 的一项。
// 大图懒加载（当前张 + 预取相邻两张），手机左右滑，桌面 ← → / Esc。
let el = null, st = null;
const CSS = `
.rg{position:fixed;inset:0;z-index:50;background:rgba(8,7,5,.93);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#eee4cc;font:13px/1.5 system-ui,sans-serif;touch-action:pan-y;user-select:none;-webkit-user-select:none}
.rg .rg-img{max-width:min(96vw,1600px);max-height:calc(100vh - 150px);object-fit:contain;border-radius:4px;box-shadow:0 10px 40px rgba(0,0,0,.5);background:#1b1812;-webkit-user-drag:none}
.rg .rg-cap{margin:10px 16px 6px;text-align:center;max-width:720px}.rg .rg-cap b{color:#c9a45c;font-weight:500;margin-right:8px}
.rg .rg-th{display:flex;gap:6px;overflow-x:auto;max-width:96vw;padding:4px}
.rg .rg-th img{width:72px;height:48px;object-fit:cover;opacity:.5;cursor:pointer;border:1px solid transparent;border-radius:3px}.rg .rg-th img.on{opacity:1;border-color:#c9a45c}
.rg button{all:unset;cursor:pointer;position:absolute;color:#eee4cc;font-size:28px;line-height:1;padding:10px 14px;border-radius:50%;background:rgba(0,0,0,.35)}
.rg button:hover,.rg button:focus-visible{background:rgba(201,164,92,.5)}
.rg .rg-x{top:12px;right:12px;font-size:22px}.rg .rg-p{left:12px;top:50%}.rg .rg-n{right:12px;top:50%}
@media (max-width:640px){.rg .rg-p,.rg .rg-n{display:none}}`;
const url = (im, t = '') => st.base + st.set.dir + im.f + t + '.jpg';
function show(i) {
  const imgs = st.set.images, n = imgs.length; st.i = ((i % n) + n) % n;
  const im = imgs[st.i], cap = st.lang === 'en' ? im.en || im.zh : im.zh;
  const img = el.querySelector('.rg-img'); img.src = url(im); img.alt = cap;
  const c = el.querySelector('.rg-cap'); c.innerHTML = `<b>${st.i + 1} / ${n}</b>`; c.append(cap);
  el.querySelectorAll('.rg-th img').forEach((t, k) => t.classList.toggle('on', k === st.i));
  for (const d of [1, -1]) new Image().src = url(imgs[(st.i + d + n) % n]);
}
function key(e) {
  if (e.key === 'Escape') closeGallery(); else if (e.key === 'ArrowRight') show(st.i + 1); else if (e.key === 'ArrowLeft') show(st.i - 1); else return;
  e.preventDefault(); e.stopImmediatePropagation();
}
export const galleryOpen = () => !!el;
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
