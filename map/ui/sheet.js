// UI v2 · 唯一的底部抽屉 / 桌面右栏（docs/design/ui-v2/spec.md §2.2、§10.2–10.3、§10.10、§10.12）。
// 平面图查看器（viewer.html：事态 · 人物 · 地点）和三维外壳（ui/chrome3d.js：部件 · 流向 · 说明）共用。普通脚本，挂 window.UISheet。
//   const s = UISheet.create({ host, id, tabs: [{ id, label, short, btnClass }], lead, text: { expand, collapse, region }, railKey, onState });
//   s.set('peek' | 'half' | 'full', { focus }) · s.down() → 降一档（已收起返回 false）· s.cycle() · s.setTab(id, state?) · s.tab · s.state · s.mode（'sheet' | 'rail'）
//   s.label(id, html, short?) · s.showTab(id, on) · s.panel(id) · s.button(id) · s.el · s.head · s.lead
// 三档：收起（柄 + 一行摘要）/ 半开（容器 40%）/ 全开（容器 80%）；高度按 iframe 容器算（dvh 在酒馆 iframe 里不可靠）。
// 桌面 ≥ 900 或横屏矮屏（高 < 480）：右栏（收起 = 48 px 竖条；半开 360；全开 480，左边缘可拖宽到 min(720, 50vw)，按本机记住）。
// 等价操作（WCAG 2.5.7）：文字按钮循环 收起 → 半开 → 全开；拖柄、列表到顶继续下拉只是加速方式。
(function () {
  if (window.UISheet) return;
  const CSS = `
.uis{position:absolute;z-index:9;left:0;right:0;bottom:0;box-sizing:border-box;display:flex;flex-direction:column;background:var(--surface,#151b20);color:var(--ink,#d5dde4);
  border-top:1px solid var(--line,rgba(255,255,255,.12));border-radius:var(--r-l,12px) var(--r-l,12px) 0 0;box-shadow:var(--sh-3,0 12px 32px rgba(0,0,0,.38));
  font:var(--fs-body,14px)/1.5 var(--font-ui,system-ui,sans-serif);height:calc(var(--sheet-peek,56px) + env(safe-area-inset-bottom));padding-bottom:env(safe-area-inset-bottom);
  transition:height var(--dur-2,200ms) var(--ease-out,ease),width var(--dur-2,200ms) var(--ease-out,ease);touch-action:pan-y;overscroll-behavior:contain}
.uis[hidden]{display:none}
.uis[data-state="half"]{height:var(--sheet-half,40%)}
.uis[data-state="full"]{height:var(--sheet-full,80%)}
.uis.drag{transition:none}
@media (prefers-reduced-motion:reduce){.uis{transition:none}}
html.rm .uis{transition:none}
.uis-grip{flex:none;height:18px;margin-bottom:-6px;display:grid;place-items:center;cursor:grab;touch-action:none}
.uis-grip::before{content:'';position:absolute;left:0;right:0;top:0;height:48px}
.uis-grip i{width:36px;height:4px;border-radius:999px;background:color-mix(in srgb,var(--ink,#d5dde4) 55%,transparent)}
.uis-head{flex:none;position:relative;display:flex;align-items:center;gap:var(--sp-3,6px);min-height:44px;padding:0 var(--sp-4,8px) var(--sp-2,4px);touch-action:none}
.uis-lead{flex:none;display:flex;align-items:center}
.uis-lead:empty{display:none}
.uis-tabs{flex:1 1 auto;min-width:0;display:flex;gap:var(--sp-2,4px);overflow-x:auto;scrollbar-width:none}
.uis-tabs::-webkit-scrollbar{display:none}
.uis-tabs [role=tab]{flex:none;display:inline-flex;align-items:center;gap:var(--sp-3,6px);min-height:36px;padding:0 var(--sp-5,12px);border:1px solid var(--line,rgba(255,255,255,.12));
  border-radius:var(--r-m,8px);background:transparent;color:var(--ink,#d5dde4);font:500 var(--fs-control,13px)/1.2 var(--font-ui,system-ui);cursor:pointer;white-space:nowrap;position:relative}
.uis-tabs [role=tab][hidden]{display:none}
.uis-tabs [role=tab]:hover{background:var(--surface-2,rgba(255,255,255,.06))}
.uis-tabs [role=tab][aria-selected=true]{background:var(--accent,#e6c36a);border-color:var(--accent,#e6c36a);color:var(--on-accent,#1a1406);font-weight:700}
.uis-tabs [role=tab] em{font-style:normal;font-family:var(--font-mono,monospace);opacity:.85}
.uis-tabs [role=tab]:focus-visible,.uis-tog:focus-visible{outline:2px solid var(--focus,#63b4be);outline-offset:2px}
.uis-tog{flex:none;display:inline-flex;align-items:center;gap:4px;min-height:36px;padding:0 var(--sp-4,8px);border:1px solid var(--line,rgba(255,255,255,.12));border-radius:var(--r-m,8px);
  background:transparent;color:var(--ink,#d5dde4);font:500 var(--fs-control,13px)/1 var(--font-ui,system-ui);cursor:pointer;white-space:nowrap}
.uis-tog:hover{background:var(--surface-2,rgba(255,255,255,.06))}
.uis-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 var(--sp-4,8px) var(--sp-4,8px)}
.uis[data-state="peek"] .uis-body{display:none}
.uis-body>[role=tabpanel][hidden]{display:none}
@media (pointer:coarse),(max-width:640px){.uis-tabs [role=tab],.uis-tog{min-height:44px}}
/* 桌面 / 横屏矮屏：右栏 */
.uis.rail{top:0;left:auto;right:0;bottom:0;height:auto!important;width:var(--rail-now,360px);border-top:0;border-left:1px solid var(--line,rgba(255,255,255,.12));border-radius:0;padding-bottom:0}
.uis.rail .uis-grip{position:absolute;left:-5px;top:0;bottom:0;width:10px;height:auto;margin:0;cursor:ew-resize;z-index:2}
.uis.rail .uis-grip::before{left:0;right:0;top:0;bottom:0;height:auto}
.uis.rail .uis-grip i{display:none}
.uis.rail .uis-head{padding:var(--sp-4,8px) var(--sp-4,8px) var(--sp-3,6px)}
.uis.rail[data-state="peek"]{width:var(--col-w,48px)}
.uis.rail[data-state="peek"] .uis-grip{display:none}
.uis.rail[data-state="peek"] .uis-head{flex-direction:column;align-items:stretch;padding:var(--sp-3,6px) 2px;gap:var(--sp-3,6px)}
.uis.rail[data-state="peek"] .uis-lead{display:none}
.uis.rail[data-state="peek"] .uis-tabs{flex-direction:column;overflow:visible}
.uis.rail[data-state="peek"] .uis-tabs [role=tab]{flex-direction:column;gap:0;padding:6px 0;justify-content:center;line-height:1.25}
.uis.rail[data-state="peek"] .uis-tabs [role=tab] .l{display:none}
.uis.rail[data-state="peek"] .uis-tabs [role=tab] .s{display:block}
.uis.rail[data-state="peek"] .uis-tog{order:-1;justify-content:center;padding:0}
.uis.rail[data-state="peek"] .uis-tog .t{display:none}
.uis-tabs [role=tab] .s{display:none}
.uis.rail[data-state="full"] .uis-body.two{columns:2;column-gap:var(--sp-6,16px)}
`;
  const RAIL_MQ = '(min-width: 900px), (max-height: 480px) and (orientation: landscape)';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function create(o) {
    if (!document.getElementById('uis-css')) { const s = document.createElement('style'); s.id = 'uis-css'; s.textContent = CSS; document.head.appendChild(s); }
    const T = Object.assign({ expand: '展开', collapse: '收起', region: '抽屉', resize: '拖动调整宽度' }, o.text || {});
    const el = document.createElement('section'); el.className = 'uis'; if (o.id) el.id = o.id;
    el.dataset.state = 'peek'; el.setAttribute('aria-label', T.region);
    el.innerHTML = '<div class="uis-grip" aria-hidden="true"><i></i></div><div class="uis-head"><div class="uis-lead"></div><div class="uis-tabs" role="tablist"></div>' +
      '<button type="button" class="uis-tog" aria-expanded="false"><span class="t"></span><span aria-hidden="true" class="a"></span></button></div><div class="uis-body"></div>';
    const grip = el.firstChild, head = el.querySelector('.uis-head'), tabsEl = el.querySelector('.uis-tabs'), tog = el.querySelector('.uis-tog'), body = el.querySelector('.uis-body'), lead = el.querySelector('.uis-lead');
    const tabs = new Map();
    let state = 'peek', tab = null, prevOpen = 'half';
    const mq = matchMedia(o.railMq || RAIL_MQ);
    const mode = () => (mq.matches ? 'rail' : 'sheet');
    const railKey = o.railKey || null;
    let railW = 360; try { railW = +localStorage.getItem(railKey) || 360; } catch (e) {}
    function addTab(t) {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.id = (o.id || 'uis') + '-t-' + t.id;
      if (t.btnClass) b.className = t.btnClass; b.dataset.tab = t.id; b.setAttribute('aria-selected', 'false'); b.tabIndex = -1;
      const p = t.panel || document.createElement('div'); p.setAttribute('role', 'tabpanel'); if (!p.id) p.id = (o.id || 'uis') + '-p-' + t.id; p.hidden = true;
      p.setAttribute('aria-labelledby', b.id); b.setAttribute('aria-controls', p.id);
      tabsEl.appendChild(b); body.appendChild(p); tabs.set(t.id, { b, p }); label(t.id, t.label || t.id, t.short);
      b.addEventListener('click', () => { if (tab === t.id && state !== 'peek') set('peek', { focus: true }); else setTab(t.id, state === 'peek' ? prevOpen : state); });
    }
    function label(id, html, short) { const x = tabs.get(id); if (!x) return; x.b.innerHTML = `<span class="l">${html}</span><span class="s" aria-hidden="true">${short != null ? short : ''}</span>`; }
    function showTab(id, on) { const x = tabs.get(id); if (!x) return; x.b.hidden = !on; if (!on && tab === id) { const nx = [...tabs.keys()].find(k => !tabs.get(k).b.hidden); if (nx) setTab(nx, state === 'peek' ? null : state); else tab = null; } paintTabs(); }
    function paintTabs() {
      for (const [k, x] of tabs) { const on = k === tab; x.b.setAttribute('aria-selected', on ? 'true' : 'false'); x.b.tabIndex = on ? 0 : -1; x.p.hidden = !on; }
      if (!tab || tabs.get(tab)?.b.hidden) { const f = [...tabs.values()].find(x => !x.b.hidden); if (f) f.b.tabIndex = 0; }
    }
    function paint() {
      const m = mode(); el.classList.toggle('rail', m === 'rail'); el.dataset.state = state; el.dataset.mode = m;
      const open = state !== 'peek'; tog.setAttribute('aria-expanded', open ? 'true' : 'false');
      tog.querySelector('.t').textContent = open ? T.collapse : T.expand;
      tog.querySelector('.a').textContent = m === 'rail' ? (open ? '▸' : '◂') : (open ? '▾' : '▴');
      tog.title = open ? T.collapse : T.expand; if (m === 'rail' && !open) tog.setAttribute('aria-label', T.expand); else tog.removeAttribute('aria-label');
      if (m === 'rail') el.style.setProperty('--rail-now', (state === 'full' ? Math.max(railW, 480) : railW) + 'px'); else el.style.removeProperty('--rail-now');
      body.classList.toggle('two', !!o.twoColumns);
      report();
    }
    // 占位报告：宿主（控制列、通知层）按抽屉实际占的高度 / 宽度避让
    let lastRep = '', repQ = false;
    function report() {
      if (repQ) return; repQ = true;   // 同一帧只量一次
      requestAnimationFrame(() => { repQ = false;
        const r = el.hidden ? null : el.getBoundingClientRect(), m = mode();
        const h = !r ? 0 : m === 'rail' ? 0 : Math.round(r.height), w = !r ? 0 : m === 'rail' ? Math.round(r.width) : 0;
        const k = [h, w, state, m, tab].join('|'); if (k === lastRep) return; lastRep = k;
        const host = o.host; host.style.setProperty('--sheet-h', h + 'px'); host.style.setProperty('--rail-w-now', w + 'px');
        o.onState?.({ state, tab, mode: m, h, w });
      });
    }
    function set(s, opt = {}) {
      if (!['peek', 'half', 'full'].includes(s)) return;
      if (s !== 'peek') prevOpen = s;
      const was = state; state = s; paint();
      if (opt.focus) { if (s === 'peek') tog.focus({ preventScroll: true }); else (tabs.get(tab)?.b || tog).focus({ preventScroll: true }); }
      if (was !== s) setTimeout(report, 260);
    }
    function setTab(id, s) {
      if (!tabs.has(id)) return; const x = tabs.get(id); if (x.b.hidden) x.b.hidden = false;
      tab = id; paintTabs(); if (s) set(s); else paint();
    }
    const down = () => { if (state === 'peek') return false; set(state === 'full' ? 'half' : 'peek'); return true; };
    const cycle = () => set(state === 'peek' ? 'half' : state === 'half' ? 'full' : 'peek', { focus: true });
    tog.addEventListener('click', e => { e.stopPropagation(); if (mode() === 'rail') set(state === 'peek' ? prevOpen : 'peek', { focus: true }); else cycle(); });
    // 标签页：←→ / Home / End 切换（tablist 规范）
    tabsEl.addEventListener('keydown', e => {
      const vis = [...tabs.values()].filter(x => !x.b.hidden).map(x => x.b), i = vis.indexOf(document.activeElement); if (i < 0) return;
      const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: vis.length - 1, ArrowDown: mode() === 'rail' && state === 'peek' ? i + 1 : null, ArrowUp: mode() === 'rail' && state === 'peek' ? i - 1 : null }[e.key];
      if (j == null) return; e.preventDefault(); const b = vis[(j + vis.length) % vis.length]; b.focus(); setTab(b.dataset.tab, state === 'peek' ? null : state);
    });
    // 拖柄（手机）：竖拖吸附到最近一档；桌面右栏：左边缘横拖改宽度。拖动不透传给地图
    let dr = null;
    const startDrag = e => {
      if (e.button > 0 || e.target.closest('button,a,input,select,textarea,[role=tab]')) return;
      const m = mode(); if (m === 'rail' && !grip.contains(e.target)) return;
      dr = { id: e.pointerId, x: e.clientX, y: e.clientY, h: el.getBoundingClientRect().height, w: el.getBoundingClientRect().width, H: o.host.getBoundingClientRect().height, m, moved: false };
      try { e.target.setPointerCapture(e.pointerId); } catch (x) {}
      e.stopPropagation();
    };
    grip.addEventListener('pointerdown', startDrag); head.addEventListener('pointerdown', startDrag);
    const move = e => {
      if (!dr || e.pointerId !== dr.id) return; e.stopPropagation(); if (e.cancelable) e.preventDefault();
      if (dr.m === 'rail') { const w = clamp(dr.w - (e.clientX - dr.x), 280, Math.min(720, innerWidth * .5)); dr.moved = true; el.classList.add('drag'); el.style.setProperty('--rail-now', w + 'px'); dr.nw = w; return; }
      const dy = e.clientY - dr.y; if (!dr.moved && Math.abs(dy) < 6) return; dr.moved = true; el.classList.add('drag');
      el.style.height = clamp(dr.h - dy, 40, dr.H * .8) + 'px';
    };
    const end = e => {
      if (!dr || e.pointerId !== dr.id) return; const d = dr; dr = null; el.classList.remove('drag');
      if (d.m === 'rail') { if (d.moved && d.nw) { railW = Math.round(d.nw); try { localStorage.setItem(railKey, String(railW)); } catch (x) {} if (state === 'peek') set('half'); else paint(); } return; }
      const hh = el.getBoundingClientRect().height; el.style.height = '';
      if (!d.moved) return;
      const H = d.H, cand = [['peek', 56], ['half', H * .4], ['full', H * .8]];
      let best = cand[0]; for (const c of cand) if (Math.abs(c[1] - hh) < Math.abs(best[1] - hh)) best = c;
      if (Math.abs(hh - d.h) > 40 && best[0] === state) best = cand[clamp(cand.findIndex(c => c[0] === state) + (hh > d.h ? 1 : -1), 0, 2)];   // 拖得明显但还没过半：也换一档
      set(best[0]);
    };
    for (const n of [grip, head]) { n.addEventListener('pointermove', move); n.addEventListener('pointerup', end); n.addEventListener('pointercancel', end); }
    // 列表滚到顶后继续下拉 = 降一档（触屏）
    let ts = null;
    body.addEventListener('touchstart', e => { ts = body.scrollTop <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null; }, { passive: true });
    body.addEventListener('touchmove', e => { if (ts == null || mode() === 'rail') return; if (e.touches[0].clientY - ts > 56) { ts = null; down(); } }, { passive: true });
    const onMq = () => paint(), onRs = () => { if (mode() === 'rail' && railW > innerWidth * .5) railW = Math.max(280, Math.round(innerWidth * .5)); paint(); };
    mq.addEventListener?.('change', onMq); addEventListener('resize', onRs);
    const ro = new ResizeObserver(report); ro.observe(el);
    const destroy = () => { mq.removeEventListener?.('change', onMq); removeEventListener('resize', onRs); ro.disconnect(); el.remove(); };
    for (const t of o.tabs || []) addTab(t);
    o.host.appendChild(el); paintTabs(); paint();
    return {
      el, head, body, lead, grip, set, setTab, destroy, down, cycle, label, showTab, addTab, report,
      panel: id => tabs.get(id)?.p || null, button: id => tabs.get(id)?.b || null,
      get state() { return state; }, get tab() { return tab; }, get mode() { return mode(); }, get open() { return state !== 'peek'; },
      text(t) { Object.assign(T, t); paint(); }, hide(on) { el.hidden = !!on; report(); },
    };
  }
  window.UISheet = { create, RAIL_MQ };
})();
