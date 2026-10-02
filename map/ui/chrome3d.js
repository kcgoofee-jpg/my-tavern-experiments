// UI v2 · 三维查看器外壳（docs/design/ui-v2/spec.md §4，U7 / U11 / U12）：主场景（estate/index.html + main.js）与道具查看器（props/viewer3d.html）共用。
// 普通脚本，依赖 ui/sheet.js（UISheet）与 ui/tokens.css；挂 window.UI3D。
//   const C = UI3D.create({ title, views: [{ id, label }], view, onView(id), sub: el, controls: [{ id, label, html, title, onClick, pressed }], tabs: [{ id, label, short, panel }], text, onEsc, embed });
//   C.setView(id) · C.showSub(on) · C.sheet（UISheet）· C.insets() → { bottom, right }（抽屉 / 右栏占的像素，模型取景时让开）· C.onInsets(fn)
//   C.dragged()：模型被拖动 / 旋转超过 300 ms 时调；设置「高级 · 三维抽屉自动收起」开了（默认关，§10.5）才收起抽屉
// 布局：顶上一条（独立打开时带标题）= 视图分段（外观 / 内透 / 剖切），剖切时下面一条二级条（楼层按钮或高度滑条）；
// 右下控制列 标注 + − 复位（导览等），图标都来自 ui/icons.js（docs/design/ui-v2/icons.md）；底部唯一抽屉（桌面右栏），默认收起、首次打开也不展开（U12）。
(function () {
  if (window.UI3D) return;
  const CSS = `
#c3{position:fixed;inset:0;pointer-events:none;z-index:var(--zu-c3)}
#c3 .c3-top{position:absolute;top:calc(var(--sp-4,8px) + env(safe-area-inset-top));left:var(--sp-4,8px);right:calc(var(--rail-w-now,0px) + var(--sp-4,8px));display:flex;flex-direction:column;align-items:center;gap:var(--sp-3,6px)}
#c3 .c3-row{display:flex;align-items:center;gap:var(--sp-4,8px);max-width:100%}
#c3 .c3-top>*,#c3 .c3-row>*{pointer-events:auto}
#c3 .c3-title{align-self:flex-start;display:flex;align-items:center;gap:var(--sp-4,8px);min-height:44px;padding:0 var(--sp-5,12px);border-radius:var(--r-glass,14px);background:var(--glass-2,var(--surface,#151b20));border:1px solid var(--glass-line,rgba(255,255,255,.12));font:700 var(--fs-body,14px)/1.2 var(--font-ui,system-ui);color:var(--ink,#d5dde4);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#c3 .c3-title:empty{display:none}
/* UI-COH-1: the 3D strips use the same glass, radius and selection grammar as the 2D chrome (docs/ui-coherence.md §1 / §4) */
#c3 .c3-seg,#c3 .c3-sub{display:inline-flex;gap:2px;padding:2px;border:1px solid var(--glass-line,rgba(255,255,255,.12));border-radius:var(--r-glass,14px);background:var(--glass-1,var(--surface,#151b20));box-shadow:var(--elev-float,var(--sh-2,0 6px 20px rgba(0,0,0,.3)));max-width:100%;overflow-x:auto;scrollbar-width:none}
#c3 .c3-sub:empty,#c3 .c3-sub[hidden]{display:none}
#c3 .c3-seg button,#c3 .c3-sub button{flex:none;min-height:40px;min-width:48px;padding:0 var(--sp-5,12px);border:0;border-radius:var(--r-m,8px);background:transparent;color:var(--ink,#d5dde4);font:500 var(--fs-control,13px)/1 var(--font-ui,system-ui);cursor:pointer}
#c3 .c3-seg button:hover,#c3 .c3-sub button:hover{background:var(--surface-2,rgba(255,255,255,.06))}
#c3 .c3-seg button[aria-checked=true],#c3 .c3-sub button.on{background:var(--accent-weak,rgba(230,195,106,.16));color:var(--ink,#d5dde4);font-weight:700;box-shadow:inset 3px 0 0 var(--accent,#e6c36a)}
#c3 .c3-sub button[aria-pressed=true]{background:var(--accent-weak,rgba(230,195,106,.16));color:var(--ink,#d5dde4);font-weight:700;box-shadow:inset 3px 0 0 var(--accent,#e6c36a)}
#c3 .c3-col{position:absolute;right:calc(var(--rail-w-now,0px) + var(--sp-5,12px));bottom:calc(var(--sheet-h,0px) + var(--sp-5,12px));display:flex;flex-direction:column;gap:var(--sp-1,2px);padding:var(--sp-2,4px);
  background:var(--glass-1,var(--surface,#151b20));border:1px solid var(--glass-line,rgba(255,255,255,.12));border-radius:var(--r-glass,14px);box-shadow:var(--elev-float,var(--sh-2,0 6px 20px rgba(0,0,0,.3)));pointer-events:auto;transition:bottom var(--dur-2,200ms) var(--ease-out,ease),right var(--dur-2,200ms) var(--ease-out,ease)}
#c3 .c3-col button{width:40px;height:40px;display:grid;place-items:center;border:0;border-radius:var(--r-m,8px);background:transparent;color:var(--ink,#d5dde4);font:600 15px/1 var(--font-ui,system-ui);cursor:pointer}
#c3 .c3-col button:hover{background:var(--surface-2,rgba(255,255,255,.06));color:var(--accent,#e6c36a)}
#c3 .c3-col button[aria-pressed=false]{color:var(--muted,#8591a0)}
#c3 .c3-col button[hidden]{display:none}
#c3 .c3-col svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
#c3 .c3-col button[aria-pressed=true]{background:var(--accent-weak,rgba(230,195,106,.16));color:var(--accent,#e6c36a)}
#c3 .uis{pointer-events:auto}
#c3 :focus-visible{outline:2px solid var(--focus,#63b4be);outline-offset:2px}
body.c3full #c3 .c3-col{visibility:hidden}
@media (max-width:640px),(pointer:coarse){#c3 .c3-col button{width:44px;height:44px}#c3 .c3-seg button,#c3 .c3-sub button{min-height:44px;min-width:44px;padding:0 var(--sp-4,8px)}}
@media (max-width:640px){#c3 .c3-title{display:none}}
@media (prefers-reduced-transparency:reduce){#c3 *{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}}
html.noblur *,html.noblur *::before,html.noblur *::after{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
@media (min-width:641px){#c3 .c3-top{align-items:flex-end}#c3.c3-embed .c3-top{align-items:center}}
@media (pointer:coarse){#c3 .c3-col,#c3 .c3-seg,#c3 .c3-sub{-webkit-backdrop-filter:none;backdrop-filter:none}}
`;
  // 旧键名 → 图标集名；复位 = 取景框（fit），标注 = Aa（关时带斜杠，按 aria-pressed 自动换）
  const ICON = { in: 'plus', out: 'minus', reset: 'fit', label: 'labels', labels: 'labels', tour: 'tour' };
  const TAB_ICON = { room: 'room', legend: 'legend', about: 'info', info: 'info', parts: 'parts', flows: 'flows' };
  const svg = k => (window.UIIcon ? UIIcon.svg(ICON[k] || k) : '');
  function create(o) {
    if (!document.getElementById('c3-css')) { const s = document.createElement('style'); s.id = 'c3-css'; s.textContent = CSS; document.head.appendChild(s); }
    const root = document.createElement('div'); root.id = 'c3'; if (o.embed) root.classList.add('c3-embed');
    root.innerHTML = '<div class="c3-top"><div class="c3-title"></div><div class="c3-row"><div class="c3-seg" role="radiogroup"></div></div><div class="c3-sub" hidden></div></div><div class="c3-col" role="toolbar"></div>';
    document.body.appendChild(root);
    const seg = root.querySelector('.c3-seg'), sub = root.querySelector('.c3-sub'), col = root.querySelector('.c3-col'), titleEl = root.querySelector('.c3-title');
    if (!o.embed && o.title) titleEl.textContent = o.title;
    root.setAttribute('role', 'region'); if (o.title) root.setAttribute('aria-label', o.title); seg.setAttribute('aria-label', (o.text && o.text.views) || '视图');
    if (o.sub) sub.appendChild(o.sub);
    let view = o.view || o.views?.[0]?.id;
    function paintViews() { for (const b of seg.children) { const on = b.dataset.v === view; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; } }
    function setViews(list) {
      seg.innerHTML = ''; for (const v of list || []) { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.v = v.id; b.textContent = v.label; if (v.btnId) b.id = v.btnId;
        b.onclick = () => { view = v.id; paintViews(); o.onView?.(v.id); }; seg.appendChild(b); }
      paintViews();
    }
    seg.addEventListener('keydown', e => { const bs = [...seg.children], i = bs.indexOf(document.activeElement); if (i < 0) return; const j = { ArrowRight: i + 1, ArrowLeft: i - 1 }[e.key]; if (j == null) return;
      e.preventDefault(); const b = bs[(j + bs.length) % bs.length]; b.focus(); b.click(); });
    setViews(o.views);
    function setControls(list) {
      col.innerHTML = ''; for (const c of list || []) { const b = document.createElement('button'); b.type = 'button'; if (c.id) b.id = c.id; b.innerHTML = c.html || svg(c.icon); b.title = c.title || ''; b.setAttribute('aria-label', c.title || c.label || '');
        if (c.pressed != null) b.setAttribute('aria-pressed', String(!!c.pressed)); if (c.icon === 'label' || c.icon === 'labels') b.dataset.lbl = '1'; b.onclick = c.onClick; col.appendChild(b); }
      paintLbl();
    }
    // 标注按钮：aria-pressed 一变就换图标（开 = Aa，关 = 斜杠 Aa），调用方只管 aria-pressed
    function paintLbl() { for (const b of col.querySelectorAll('[data-lbl]')) { const on = b.getAttribute('aria-pressed') !== 'false'; if (b.dataset.on !== String(on)) { b.dataset.on = String(on); b.innerHTML = svg(on ? 'labels' : 'labelsOff'); } } }
    new MutationObserver(paintLbl).observe(col, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
    setControls(o.controls);
    const ins = new Set();
    const sheet = UISheet.create({ host: root, id: o.sheetId || 'c3sheet', tabs: (o.tabs || []).map(t => ({ icon: TAB_ICON[t.id], ...t })), text: o.text, railKey: 'edenMap3dRailW',
      onState: ({ state, mode }) => { document.body.classList.toggle('c3full', state === 'full' && mode === 'sheet'); col.inert = state === 'full' && mode === 'sheet'; for (const f of ins) try { f(insets()); } catch (e) {} } });
    if (o.tabs?.length) sheet.setTab(o.tabs[0].id);
    const insets = () => { const cs = getComputedStyle(root); return { bottom: parseFloat(cs.getPropertyValue('--sheet-h')) || 0, right: parseFloat(cs.getPropertyValue('--rail-w-now')) || 0 }; };
    // Esc：抽屉降一档；已收起就交给页面（嵌入时再交给查看器）
    addEventListener('keydown', e => { if (e.key !== 'Escape' || e.isComposing) return; if (document.querySelector('.rg, .nt-p0:not([hidden]) > *')) return; e.preventDefault(); if (!sheet.down()) o.onEsc?.(); else if (sheet.state === 'peek') sheet.el.querySelector('.uis-tog')?.focus(); });
    let auto = false, dragT = 0;
    return {
      root, sheet, seg, sub, col, insets, onInsets: f => ins.add(f),
      setView(id) { view = id; paintViews(); }, get view() { return view; }, setViews, setControls,
      showSub(on) { sub.hidden = !on; }, setTitle(t) { if (!o.embed) titleEl.textContent = t || ''; if (t) root.setAttribute('aria-label', t); }, setText(t) { sheet.text(t); },
      setAuto(on) { auto = !!on; },
      dragStart() { clearTimeout(dragT); dragT = setTimeout(() => { if (auto && sheet.open && sheet.mode === 'sheet') sheet.set('peek'); }, 300); }, dragEnd() { clearTimeout(dragT); },
      control: id => col.querySelector('#' + id),
    };
  }
  window.UI3D = { create, ICON };
})();
