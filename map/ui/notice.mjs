// UI v2 · 唯一的通知层（docs/design/ui-v2/spec.md §3、§10.9）。宿主页（tavern/eden-map.js）渲染全部通知；查看器嵌入时把自己的通知 postMessage 给宿主，
// 单独打开时查看器自己用同一个组件渲染。
//   P0 阻断：区域中间的卡片，遮住地图；不能关（没有 ×），按钮右主左次；打开时焦点落在主按钮；P1 / P2 暂停排队。role=alertdialog
//   P1 需要处理：顶栏下方一条横幅（role=region + 标题）；可关；多条折叠成「还有 N 条」，点开逐条看
//   P2 信息：抽屉上方的小提示（aria-live=polite）；默认 6 s，带「撤销」≥ 10 s；悬停 / 聚焦时暂停；同时只 1 条，其余排队
// 规则：同时最多 1 个 P0 + 1 条 P1 + 1 条 P2；busy()（表单正在编辑）时 P1 / P2 先不出，refresh() 后补上。
//   const N = createNotices({ doc, mount, baseCls, anchor, busy, en });
//   N.push({ key, level: 0 | 1 | 2, title, lines: [], cls: [], actions: [{ label, cls, primary, run, keep }], ms, onClose, build(el) }) → el（可能还没显示）
//   N.remove(key) · N.has(key) · N.get(key) · N.refresh() · N.list()
// anchor() → { left, top, width, height, top0, bottom0, modal } | null（null = 整个视口）；top0 = 顶栏高度，bottom0 = 抽屉占的高度。
const CSS = (root) => `
${root} .nt-layer{position:fixed;z-index:var(--zh-top);pointer-events:none;font:var(--nt-fs,13px)/1.5 var(--nt-font,system-ui,sans-serif);color:var(--ink,#d5dde4)}
${root} .nt-layer [hidden]{display:none!important}
${root} .nt-p1>*,${root} .nt-p2>*,${root} .nt-p0>*{pointer-events:auto}
${root} .nt-p0.nt-modal{pointer-events:auto}
${root} .nt-item{box-sizing:border-box;position:relative;background:var(--glass-2,#151b20);color:var(--ink,#d5dde4);border:1px solid var(--glass-line,rgba(255,255,255,.22));
  border-radius:var(--r-glass,12px);box-shadow:var(--elev-panel,0 6px 20px rgba(0,0,0,.3));padding:10px 48px 10px 14px;overflow-wrap:anywhere}
${root} .nt-item>b.nt-t{display:block;color:var(--accent,#e6c36a);font-weight:700}
${root} .nt-item a{color:var(--accent,#e6c36a)}
${root} .nt-item .nt-x{position:absolute;right:2px;top:2px;width:44px;height:44px;border:0;background:none;color:var(--muted,#8591a0);font:18px/1 system-ui;cursor:pointer;border-radius:8px}
${root} .nt-item .nt-x:hover{color:var(--ink,#d5dde4)}
${root} .nt-acts{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;justify-content:flex-end}
${root} .nt-acts button{height:36px;min-width:44px;padding:0 14px;border:1px solid var(--glass-line,rgba(255,255,255,.22));border-radius:8px;background:transparent;color:var(--ink,#d5dde4);font:inherit;font-weight:500;cursor:pointer}
${root} .nt-acts button.nt-pri{background:var(--accent,#e6c36a)!important;border-color:var(--accent,#e6c36a)!important;color:var(--on-accent,#1a1406)!important;font-weight:700}
${root} .nt-item :focus-visible{outline:2px solid var(--focus,#63b4be);outline-offset:2px}
${root} .nt-p1{position:absolute;left:8px;right:8px;display:flex;flex-direction:column;gap:6px;align-items:center}
${root} .nt-p1 .nt-item{width:min(560px,100%);border-left:3px solid var(--accent,#e6c36a)}
${root} .nt-p1 .nt-item.nt-force,${root} .nt-p1 .nt-item.em-force{border-color:var(--alert,#ff5a5a)}
${root} .nt-more{width:min(560px,100%);box-sizing:border-box;display:flex;align-items:center;gap:8px;justify-content:space-between;padding:4px 6px 4px 14px;border-radius:var(--r-glass,12px);
  background:var(--glass-2,#151b20);border:1px solid var(--glass-line,rgba(255,255,255,.22));color:var(--ink,#d5dde4);box-shadow:0 6px 20px rgba(0,0,0,.3)}
${root} .nt-more span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${root} .nt-more button{flex:none;height:36px;min-width:44px;padding:0 12px;border:1px solid var(--glass-line,rgba(255,255,255,.22));border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer}
${root} .nt-p2{position:absolute;left:8px;right:8px;display:flex;justify-content:center}
${root} .nt-p2 .nt-item{background:var(--glass-1,#151b20);width:max-content;max-width:min(440px,100%);border-radius:999px;padding:8px 16px}
${root} .nt-p2 .nt-item.nt-has-acts{border-radius:var(--r-glass,12px);padding:10px 14px}
${root} .nt-p2 .nt-item>b.nt-t{display:inline;margin-right:6px}
${root} .nt-p2 .nt-item .nt-x{display:none}
@media (pointer:coarse){${root} .nt-p2 .nt-item:not(.nt-has-acts){pointer-events:none}}   /* 触屏：纯提示药丸不挡下面的点击（手机上盖住人物卡「追问」按钮 6 秒——悬停暂停只对鼠标有意义，带撤销的照常可点） */
${root} .nt-p2 .nt-acts{display:inline-flex;margin:0 0 0 10px;vertical-align:middle}
${root} .nt-p0{position:absolute;inset:0;display:grid;place-items:center;padding:16px;box-sizing:border-box}
${root} .nt-p0.nt-modal{background:color-mix(in srgb,var(--glass-2,#151b20) 72%,transparent)}
${root} .nt-p0 .nt-item{width:min(420px,100%);padding:14px 16px;border:1px solid var(--alert,#ff5a5a);box-shadow:var(--elev-modal,0 12px 32px rgba(0,0,0,.38))}
${root} .nt-p0 .nt-item>b.nt-t{color:var(--alert,#ff5a5a)}
${root} .nt-p0 .nt-item .nt-x{display:none}
${root} .nt-p0.nt-top{align-items:start}
@media (prefers-reduced-motion:no-preference){${root} .nt-item{animation:nt-in .2s cubic-bezier(.2,.8,.2,1)}}
@keyframes nt-in{from{opacity:0;transform:translateY(4px)}}
@media (max-width:640px),(pointer:coarse){${root} .nt-acts button,${root} .nt-more button{height:44px}}
`;
const detach = n => n?.parentNode?.removeChild(n);   // 调用方可以把 el.remove 改成「从队列移除」，这里不走它
export function createNotices({ doc = document, mount, root = 'body', baseCls = '', anchor = () => null, busy = () => false, en = false, onChange, inertEls } = {}) {
  if (!doc.getElementById('nt-css-' + baseCls)) { const s = doc.createElement('style'); s.id = 'nt-css-' + baseCls; s.textContent = CSS(root); (doc.head || mount).appendChild(s); }
  const layer = doc.createElement('div'); layer.className = 'nt-layer'; mount.appendChild(layer);
  const p0 = doc.createElement('div'), p1 = doc.createElement('div'), p2 = doc.createElement('div');
  p0.className = 'nt-p0'; p1.className = 'nt-p1'; p2.className = 'nt-p2'; p2.setAttribute('aria-live', 'polite');
  layer.append(p1, p2, p0);
  // P0 打开时：背景 inert（查看器 / 面板），Tab 限在卡片里，关闭后焦点回原处（§3、§10.9）
  let p0Ret = null, inertOn = false, dead = false;
  const setInert = on => { inertOn = on; for (const n of (typeof inertEls === 'function' ? inertEls() : [])) { try { n.inert = on; } catch (e) {} } };
  p0.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); return; } if (e.key !== 'Tab') return;
    const f = [...p0.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled); if (!f.length) return; const i = f.indexOf(doc.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); } });
  const items = new Map(); let p2Cur = null, p2T = 0, p2Left = 0, p2Start = 0, p1Open = false, lang = en;
  const txt = (zh, e) => (lang ? e : zh);
  function place() {
    const a = anchor() || null, W = doc.defaultView;
    const r = a || { left: 0, top: 0, width: W.innerWidth, height: W.innerHeight, top0: 0, bottom0: 0 };
    Object.assign(layer.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    p1.style.top = ((r.top0 || 0) + 8) + 'px'; p2.style.bottom = ((r.bottom0 || 0) + 12) + 'px';
    p0.classList.toggle('nt-modal', !!(a && a.modal)); p0.classList.toggle('nt-top', !a);
  }
  function el(it) {
    const d = doc.createElement('div'); d.className = ['nt-item', baseCls, 'nt-l' + it.level, ...(it.cls || [])].filter(Boolean).join(' ');
    if (it.level === 0) { d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-modal', 'true'); }
    else if (it.level === 1) { d.setAttribute('role', 'region'); }
    else d.setAttribute('role', 'status');
    const t = doc.createElement('b'); t.className = 'nt-t'; t.textContent = it.title || ''; d.appendChild(t);
    if (it.level === 1 && it.title) { t.id = 'nt-' + Math.random().toString(36).slice(2, 8); d.setAttribute('aria-labelledby', t.id); }
    if (it.level !== 0 && it.closable !== false) { const x = doc.createElement('button'); x.type = 'button'; x.className = 'nt-x'; x.setAttribute('aria-label', txt('关闭', 'Close')); x.textContent = '×'; x.onclick = () => remove(it.key, 'x'); d.appendChild(x); }
    for (const l of it.lines || []) { const x = doc.createElement('div'); x.textContent = l; d.appendChild(x); }
    if (it.actions?.length) {
      const acts = doc.createElement('div'); acts.className = 'nt-acts em-acts'; d.classList.add('nt-has-acts');
      // 右主左次：主按钮排最后
      for (const a of [...it.actions].sort((x, y) => (x.primary ? 1 : 0) - (y.primary ? 1 : 0))) {
        const b = doc.createElement('button'); b.type = 'button'; b.textContent = a.label; b.className = [a.cls, a.primary ? 'nt-pri' : ''].filter(Boolean).join(' ');
        b.onclick = () => { try { a.run?.(); } finally { if (!a.keep) remove(it.key, 'act'); } }; acts.appendChild(b);
      }
      d.appendChild(acts);
    }
    it.build?.(d);
    if (it.level === 2) {   // 悬停 / 聚焦时暂停计时
      const pause = () => { if (p2Cur !== it || !p2T) return; clearTimeout(p2T); p2T = 0; p2Left = Math.max(1500, p2Left - (Date.now() - p2Start)); };
      const resume = () => { if (p2Cur !== it || p2T || d.matches(':hover') || d.contains(doc.activeElement)) return; p2Start = Date.now(); p2T = setTimeout(() => remove(it.key, 'timeout'), p2Left); };
      d.addEventListener('pointerenter', pause); d.addEventListener('focusin', pause); d.addEventListener('pointerleave', resume); d.addEventListener('focusout', () => setTimeout(() => { if (!dead) resume(); }, 0));
    }
    return d;
  }
  function render() {
    place();
    const all = [...items.values()], z = all.filter(i => i.level === 0), hold = z.length > 0 || busy();
    // P0：只显示最早的一个
    const top0 = z[0] || null;
    for (const i of z) if (i !== top0 && i.el.isConnected) detach(i.el);
    if (top0 && !top0.el.isConnected) { p0.replaceChildren(top0.el); if (!p0Ret) p0Ret = doc.activeElement; setInert(true); setTimeout(() => (top0.el.querySelector('.nt-pri') || top0.el.querySelector('button'))?.focus({ preventScroll: true }), 30); }
    if (!top0) { p0.replaceChildren(); if (p0Ret || inertOn) { setInert(false); const r = p0Ret; p0Ret = null; try { r?.isConnected && r.focus({ preventScroll: true }); } catch (e) {} } }
    p0.hidden = !top0;
    // P1：一条横幅 + 「还有 N 条」
    const ones = all.filter(i => i.level === 1);
    p1.replaceChildren(); p1.hidden = hold || !ones.length;
    if (!hold && ones.length) {
      const shown = p1Open ? ones : ones.slice(0, 1); for (const i of shown) p1.appendChild(i.el);
      if (ones.length > 1) {
        const m = doc.createElement('div'); m.className = 'nt-more';
        const rest = ones.slice(1).map(i => i.title).join(' · ');
        m.innerHTML = `<span></span><button type="button"></button>`;
        m.querySelector('span').textContent = p1Open ? txt('共 ' + ones.length + ' 条', ones.length + ' notices') : txt(`还有 ${ones.length - 1} 条：`, `${ones.length - 1} more: `) + rest;
        const b = m.querySelector('button'); b.textContent = p1Open ? txt('收起', 'Less') : txt('展开', 'Show'); b.setAttribute('aria-expanded', p1Open ? 'true' : 'false');
        b.onclick = () => { p1Open = !p1Open; render(); }; p1.appendChild(m);
      } else p1Open = false;
    }
    // P2：同时 1 条，其余排队
    const twos = all.filter(i => i.level === 2);
    if (hold) { if (p2Cur) { clearTimeout(p2T); p2T = 0; } p2.replaceChildren(); p2.hidden = true; }
    else {
      p2.hidden = false;
      if (p2Cur && !items.has(p2Cur.key)) p2Cur = null;
      if (!p2Cur && twos.length) { p2Cur = twos[0]; p2Left = p2Cur.ms || (p2Cur.actions?.length ? 10000 : 6000); }
      if (p2Cur) { if (!p2Cur.el.isConnected) p2.replaceChildren(p2Cur.el); if (!p2T && !p2Cur.el.matches(':hover')) { p2Start = Date.now(); const k = p2Cur.key; p2T = setTimeout(() => remove(k, 'timeout'), p2Left); } }
      else p2.replaceChildren();
    }
    onChange?.(all);
  }
  function push(it) {
    it = { level: 2, ...it }; it.key = it.key || 'n' + Math.random().toString(36).slice(2, 9);
    const old = items.get(it.key); if (old) { if (old === p2Cur) { clearTimeout(p2T); p2T = 0; p2Cur = null; } detach(old.el); }
    it.el = el(it); it.el.__nt = it; it.el.remove = () => remove(it.key, 'api'); items.set(it.key, it); render(); return it.el;
  }
  function remove(key, why) {
    const it = items.get(key); if (!it) return false; items.delete(key); detach(it.el);
    if (it === p2Cur) { clearTimeout(p2T); p2T = 0; p2Cur = null; }
    try { it.onClose?.(why || 'api'); } catch (e) {}
    render(); return true;
  }
  const onResize = () => place(); doc.defaultView.addEventListener('resize', onResize);
  return {
    push, remove, refresh: render, has: k => items.has(k), get: k => items.get(k)?.el || null, list: () => [...items.values()].map(i => ({ key: i.key, level: i.level, title: i.title })),
    setLang(e) { lang = !!e; render(); }, get blocking() { return !p0.hidden && !!p0.firstChild; }, destroy() { dead = true; setInert(false); doc.defaultView.removeEventListener('resize', onResize); layer.remove(); items.clear(); clearTimeout(p2T); }, layer,
  };
}
