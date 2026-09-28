// 统一加载进度组件（fix3，用户 2026-09-28「加载没有进度」）：平面瓦片、庄园三维、道具三维、图集等所有要加载的地方共用这一个。
// 能算出比例（字节 loaded/total、瓦片 已到/需要）就显示确定的百分比；算不出就显示不确定状态：标签 + 已用时间（每秒更新）。
// 失败 / 很慢时给「重试」（onRetry 为空就不出按钮，由调用方自己的按钮处理）。
// 用法：const p = mountProgress(容器, { label, labelEl, onRetry, doc, lang })
//   p.label(文字)   p.set(loaded, total, unit?)（total 缺 = 不确定；unit 'bytes' 显示 MB）   p.pct(0–100)
//   p.slow(文字?)   p.fail(文字?)   p.done()   p.reset(文字?)   p.el
// labelEl：已有的标签元素（查看器 #loading span 等），组件接着用它写字，旧代码继续写那个元素也不冲突。
// ES 模块；也挂到 window.UIProgress 给普通脚本（map/ui/gallery.js）用。纯 DOM，不发请求。
const CSS = `
.uiprog{display:grid;justify-items:center;gap:6px;min-width:min(260px,80vw);font-variant-numeric:tabular-nums}
.uiprog-bar{position:relative;width:min(240px,70vw);height:4px;border-radius:2px;background:var(--line,rgba(255,255,255,.18));overflow:hidden}
.uiprog-bar i{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--accent,#c9a45c);transition:width .2s}
.uiprog.ind .uiprog-bar i{width:30%;animation:uiprog-ind 1.2s ease-in-out infinite}
@keyframes uiprog-ind{0%{left:-30%}100%{left:100%}}
@media (prefers-reduced-motion:reduce){.uiprog.ind .uiprog-bar i{animation:none;width:100%;opacity:.35}}
.rm .uiprog.ind .uiprog-bar i{animation:none;width:100%;opacity:.35}
.uiprog-m{font-size:var(--fs-micro,11px);color:var(--muted,#9aa);letter-spacing:0}
.uiprog.bad .uiprog-bar i{background:var(--danger,#d66);width:100%;animation:none}
.uiprog-retry{min-height:36px;padding:0 14px;border-radius:var(--r-m,8px);border:1px solid var(--accent,#c9a45c);background:var(--accent,#c9a45c);color:var(--on-accent,#111);font:600 var(--fs-small,12px)/1 var(--font-ui,sans-serif);cursor:pointer}
.uiprog-retry[hidden]{display:none}`;
const TXT = { zh: { el: '已 {s} 秒', retry: '重试', slow: '加载较慢…', fail: '加载失败' }, en: { el: '{s}s', retry: 'Retry', slow: 'Loading slowly…', fail: 'Failed to load' } };
const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const mb = n => (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';
export function mountProgress(host, o = {}) {
  const doc = o.doc || host.ownerDocument || document, L = TXT[o.lang === 'en' || doc.documentElement.lang === 'en' ? 'en' : 'zh'];
  if (!doc.getElementById('uiprog-css')) { const s = doc.createElement('style'); s.id = 'uiprog-css'; s.textContent = CSS; doc.head.appendChild(s); }
  const el = doc.createElement('div'); el.className = 'uiprog ind'; el.setAttribute('role', 'progressbar'); el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', '100');
  const lab = o.labelEl || doc.createElement('span'); if (!o.labelEl) { lab.className = 'uiprog-l'; el.appendChild(lab); }
  const bar = doc.createElement('div'); bar.className = 'uiprog-bar'; bar.innerHTML = '<i></i>';
  const meta = doc.createElement('span'); meta.className = 'uiprog-m';
  const btn = doc.createElement('button'); btn.type = 'button'; btn.className = 'uiprog-retry'; btn.textContent = L.retry; btn.hidden = true;
  if (o.onRetry) btn.onclick = () => o.onRetry();
  el.append(bar, meta, btn);
  if (o.labelEl) lab.after(el); else host.appendChild(el);
  let t0 = Date.now(), p = null, extra = '', tick = 0, state = '';
  const paint = () => {
    const s = Math.floor((Date.now() - t0) / 1000), el2 = fmt(L.el, { s });
    el.classList.toggle('ind', p == null && state !== 'fail');
    bar.firstChild.style.width = p == null ? '' : p + '%';
    if (p == null) { el.removeAttribute('aria-valuenow'); meta.textContent = [extra, el2].filter(Boolean).join(' · '); }
    else { el.setAttribute('aria-valuenow', String(p)); meta.textContent = [p + '%', extra, s >= 3 ? el2 : ''].filter(Boolean).join(' · '); }
    el.setAttribute('aria-valuetext', (lab.textContent || '') + ' ' + meta.textContent);
  };
  const run = () => { clearInterval(tick); tick = setInterval(paint, 1000); };
  const api = {
    el,
    label(t) { lab.textContent = t; paint(); return api; },
    pct(v) { p = v == null || !isFinite(v) ? null : Math.max(0, Math.min(100, Math.round(v))); extra = ''; paint(); return api; },
    set(loaded, total, unit) {
      if (total > 0) { p = Math.max(0, Math.min(100, Math.round(loaded / total * 100))); extra = unit === 'bytes' ? `${mb(loaded)} / ${mb(total)}` : `${loaded} / ${total}`; }
      else { p = null; extra = loaded > 0 ? (unit === 'bytes' ? mb(loaded) : String(loaded)) : ''; }
      paint(); return api; },
    slow(t) { state = 'slow'; if (t) lab.textContent = t; else if (!lab.textContent) lab.textContent = L.slow; btn.hidden = !o.onRetry; paint(); return api; },
    fail(t) { state = 'fail'; el.classList.add('bad'); lab.textContent = t || L.fail; btn.hidden = !o.onRetry; clearInterval(tick); paint(); return api; },
    done() { state = 'done'; clearInterval(tick); p = 100; paint(); return api; },
    reset(t) { state = ''; el.classList.remove('bad'); btn.hidden = true; p = null; extra = ''; t0 = Date.now(); if (t != null) lab.textContent = t; run(); paint(); return api; },
    get elapsed() { return Date.now() - t0; },
  };
  run(); paint();
  return api;
}
if (typeof window !== 'undefined') window.UIProgress = { mount: mountProgress };
