// 未上图的地点（v0.9.6）。当前地点（MVU 的当前地点变量或 ⌖ 标签）认不出时（app/place-resolver.mjs 的落点是 null）：
//   不跳转；标题栏显示「未上图：<名字>」（嵌在酒馆里时由卡内脚本的标题栏显示，点它发 eden-map:unmapped-pick；单独打开时显示在查看器页头）。
//   点开 = 小选择器：把这个名字指派给一个地标、层 / 大区、庄园房间（含卡设定分层房间）/ 室外区域，或世界地名；也可以「忽略」。
//   存在聊天变量 eden_map.自定义（mvu-readers.mjs setCustom 的 alias / ignore；单独打开时存本机），存完立刻重建词表并跳过去。
// 查看器核心的状态与工具从 app/*.mjs 显式 import（arch-v2 §6 第 7 步）；别的外挂经 app/plugins.mjs 的 P 取（可能没加载，调用处带守卫）。这里不过滤任何文字（textContent / esc）。
import { M, REG } from './app/state.mjs';
import { announce } from './app/screen-reader-announce.mjs';
import { esc } from './app/dom-helpers.mjs';
import { post } from './app/protocol-stamp.mjs';
import { LANG } from './app/i18n.mjs';
import { estPlan, hereIdx, jumpHere } from './app/locate.mjs';
import { showSet } from './app/settings.mjs';
import { sheetVis } from './app/drawer-glue.mjs';
import { P, register } from './app/plugins.mjs';
const TCUnmapped = (() => {
  const T = (k, zh, v) => window.I18N.tx(k, zh, v);   // 共享 i18n 服务（viewer.html window.I18N）
  const embed = window.top !== window;
  let sent = null, name = null, value = '', chip = null, dlg = null, q = '', waitFor = null, opener = null;
  const KIND = { landmark: ['um.k_landmark', '地标'], layer: ['um.k_layer', '层 / 大区'], room: ['um.k_room', '房间'], area: ['um.k_area', '室外'], world: ['um.k_world', '世界地名'] };

  function update(v) {
    value = String(v ?? document.getElementById('here')?.value ?? '');
    name = hereIdx ? hereIdx.unmapped(value) : null;
    const sig = (name || '') + '\n' + value; if (sig !== sent) { sent = sig; post({ type: 'eden-map:unmapped', name }); }   // 卡内脚本的标题栏
    renderChip(); if (typeof sheetVis === 'function') sheetVis();   // 查看器抽屉 / 右栏跟着显示「放到地图上」
    if (waitFor && waitFor === value && !name) { waitFor = null; if (typeof jumpHere === 'function') jumpHere(value, true); }   // 刚指派完：立刻跳过去
  }
  function renderChip() {
    if (!chip) {
      const hd = document.querySelector('header'); if (!hd) return;
      chip = document.createElement('button'); chip.type = 'button'; chip.id = 'unmapped'; chip.className = 'btn';
      chip.onclick = e => { e.stopPropagation(); open(); };
      hd.insertBefore(chip, hd.querySelector('.grow'));
    }
    chip.hidden = !name || embed;   // 嵌在酒馆里：显示在卡内脚本的标题栏
    if (name) { chip.textContent = ''; const s = document.createElement('span'); s.textContent = T('um.chip', '未上图：{n}', { n: name }); chip.append(s); chip.title = T('um.tip', '地图认不出这个地点，点这里把它放到地图上'); }
  }

  // ---------- 候选：地标、层 / 大区、庄园房间 / 室外、世界地名 ----------
  function candidates() {
    const out = [], seen = new Set(), en = typeof LANG !== 'undefined' && LANG === 'en';
    const add = (key, kind, sub, extra = '') => { if (!key || seen.has(kind + '|' + key)) return; seen.add(kind + '|' + key); out.push({ key, kind, sub: sub || '', find: (key + ' ' + (sub || '') + ' ' + extra).toLowerCase() }); };
    if (typeof REG === 'undefined' || !REG) return out;
    const E = hereIdx?.estate, eTitle = E ? (en && REG.maps[E.id]?.title_en) || REG.maps[E.id]?.title || '' : '';
    if (E) {
      for (const r of estPlan?.rooms || []) if (r.name) add(r.name, 'room', `${eTitle} · ${r.floor}${r.kind === 'restricted' ? (en ? ' · not described' : ' · 不描述') : ''}`);
      for (const r of REG.maps[E.id]?.rooms || []) add(r, 'room', eTitle);
      for (const a of REG.maps[E.id]?.areas || []) add(a, 'area', eTitle);
    }
    for (const [id, m] of Object.entries(REG.maps)) {
      if (m.kind !== 'points' || m.status === 'planned') continue;
      const t = (en && m.title_en) || m.title || id, L = m.layer || {};
      if (L.name) add(L.name, 'layer', t, [L.sub, L.name_en].filter(Boolean).join(' '));
      for (const d of m.districts || []) add(d, 'layer', t);
      for (const k of Object.values(m.markers || {})) if (k.name && !(E && k.link?.map === E.id)) add(k.name, 'landmark', t, [k.name_en, ...(k.alias || [])].filter(Boolean).join(' '));
    }
    if (typeof M !== 'undefined' && M) for (const p of [...(M.places || []), ...(M.fiefs || []), ...(M.realms || [])]) add(p.name, 'world', T('um.k_world', '世界地名'), p.name_en || '');
    return out;
  }

  // ---------- 选择器 ----------
  function open() {
    if (!name) return;
    opener = document.activeElement;
    if (!dlg) {
      dlg = document.createElement('div'); dlg.id = 'umDlg'; dlg.hidden = true;
      dlg.innerHTML = `<div class="um-sheet" role="dialog" aria-modal="true" aria-labelledby="umH"><header><h2 id="umH" tabindex="-1"></h2><button type="button" class="um-x" data-close="1"></button></header>`
        + `<p class="um-lead"></p><input type="search" id="umQ" autocomplete="off" enterkeyhint="search"><div class="um-res" id="umRes"></div>`
        + `<footer><button type="button" class="btn" data-ignore="1"></button><button type="button" class="btn" data-close="1"></button></footer><p class="um-live" aria-live="polite"></p></div>`;
      document.body.appendChild(dlg);
      dlg.addEventListener('click', e => {
        if (e.target === dlg) return close();
        const b = e.target.closest('button'); if (!b) return; e.stopPropagation();
        if (b.dataset.close) close(); else if (b.dataset.ignore) ignore(); else if (b.dataset.k) assign(b.dataset.k, b.dataset.kind);
      });
      dlg.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
      dlg.querySelector('#umQ').addEventListener('input', e => { q = e.target.value; list(); });
    }
    q = ''; const n = name;
    dlg.querySelector('#umH').textContent = T('um.title', '把「{n}」放到地图上', { n });
    dlg.querySelector('.um-lead').textContent = T('um.lead', '选一个地方，以后当前地点写「{n}」就落到那里（只存在这个聊天里）。', { n });
    const qi = dlg.querySelector('#umQ'); qi.value = ''; qi.placeholder = T('um.search', '搜索地标、层、房间或世界地名'); qi.setAttribute('aria-label', qi.placeholder);
    dlg.querySelector('.um-x').setAttribute('aria-label', T('um.close', '关闭')); dlg.querySelector('.um-x').innerHTML = window.UIIcon ? UIIcon.svg('close') : '×';
    dlg.querySelector('footer [data-ignore]').textContent = T('um.ignore', '忽略');
    dlg.querySelector('footer [data-close]').textContent = T('um.cancel', '取消');
    list(); dlg.hidden = false; if (typeof showSet === 'function') showSet(false);
    setTimeout(() => qi.focus({ preventScroll: true }), 30);
  }
  function list() {
    const box = dlg.querySelector('#umRes'), all = candidates(), s = q.trim().toLowerCase();
    const hit = s ? all.filter(c => c.find.includes(s)) : all;
    const order = ['landmark', 'layer', 'room', 'area', 'world'];
    let h = '';
    for (const k of order) {
      const g = hit.filter(c => c.kind === k); if (!g.length) continue;
      const shown = s ? g.slice(0, 40) : g.slice(0, 12);
      h += `<section><h3>${esc(T(...KIND[k]))}<small>${g.length}</small></h3><ul>${shown.map(c => `<li><button type="button" data-k="${esc(c.key)}" data-kind="${k}"><b>${esc(c.key)}</b>${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</button></li>`).join('')}</ul>`
        + (g.length > shown.length ? `<p class="um-more">${esc(T('um.more', '还有 {n} 个，输入名字搜索', { n: g.length - shown.length }))}</p>` : '') + `</section>`;
    }
    box.innerHTML = h || `<p class="um-more">${esc(T('um.none', '没有找到'))}</p>`;
  }
  async function assign(key, kind) {
    const n = name; if (!n || typeof P.TCCustom === 'undefined') return;
    const ok = await P.TCCustom.setCustom(key, { alias: n, kind });
    if (!ok) { dlg.querySelector('.um-live').textContent = T('um.fail', '没存上，再试一次'); return; }
    waitFor = value; close();
    if (typeof announce === 'function') announce(T('um.done', '「{n}」→ {k}', { n, k: key }));
    update(value);   // 单独打开时已经生效；嵌在酒馆里等宿主推回新的自定义（apply → markHere → update）
  }
  async function ignore() {
    const n = name; if (!n || typeof P.TCCustom === 'undefined') return;
    await P.TCCustom.setCustom(n, { ignore: true }); close(); update(value);
  }
  function close() { if (!dlg || dlg.hidden) return; dlg.hidden = true; try { (opener && opener.isConnected ? opener : chip)?.focus?.({ preventScroll: true }); } catch (e) {} }

  const css = `
  #unmapped{flex:0 1 auto;min-width:0;max-width:40vw;overflow:hidden;white-space:nowrap;border-style:dashed;color:var(--ink);justify-content:flex-start}#unmapped>span{min-width:0;overflow:hidden;text-overflow:ellipsis}
  #unmapped[hidden]{display:none}
  #umDlg{position:fixed;inset:0;z-index:41;display:grid;place-items:center;background:color-mix(in srgb,var(--bg) 55%,transparent);color:var(--ink);font-family:var(--font-ui)}
  #umDlg[hidden]{display:none}
  #umDlg .um-sheet{box-sizing:border-box;width:min(480px,calc(100vw - 32px));max-height:min(80vh,640px);display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line-strong);border-radius:var(--r-l);box-shadow:var(--sh-3);overflow:hidden}
  #umDlg header{display:flex;align-items:center;gap:var(--sp-3);padding:var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-5);border-bottom:1px solid var(--line)}
  #umDlg h2{flex:1;margin:0;font-size:var(--fs-title);font-weight:600;outline:none;word-break:break-all}
  #umDlg .um-x{flex:none;width:var(--hit,44px);height:var(--hit,44px);border:0;background:none;color:var(--ink-2);font-size:20px;cursor:pointer;border-radius:var(--r-m)}
  #umDlg .um-lead{margin:var(--sp-4) var(--sp-5) 0;color:var(--muted);font-size:var(--fs-small)}
  #umDlg #umQ{margin:var(--sp-4) var(--sp-5);min-height:var(--hit,44px);box-sizing:border-box;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-m);color:var(--ink);font:inherit;padding:0 var(--sp-4)}
  #umDlg .um-res{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:0 var(--sp-5) var(--sp-4)}
  #umDlg section h3{display:flex;justify-content:space-between;margin:var(--sp-4) 0 var(--sp-2);font-size:var(--fs-small);color:var(--muted);font-weight:600}
  #umDlg ul{list-style:none;margin:0;padding:0;display:grid;gap:var(--sp-2)}
  #umDlg li button{display:flex;width:100%;min-height:var(--hit,44px);align-items:center;justify-content:space-between;gap:var(--sp-4);padding:0 var(--sp-4);box-sizing:border-box;border:1px solid var(--line);border-radius:var(--r-m);background:var(--surface-2);color:var(--ink);font:inherit;text-align:left;cursor:pointer}
  #umDlg li button:hover{border-color:var(--accent)}
  #umDlg li small{color:var(--muted);font-size:var(--fs-small);text-align:right;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #umDlg .um-more{color:var(--muted);font-size:var(--fs-small);margin:var(--sp-2) 0}
  #umDlg footer{display:flex;gap:var(--sp-3);justify-content:flex-end;padding:var(--sp-4) var(--sp-5);border-top:1px solid var(--line)}
  #umDlg footer .btn{min-height:var(--hit,44px)}
  #umDlg .um-live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  @media (max-width:640px){#umDlg{place-items:end stretch}#umDlg .um-sheet{width:100%;max-height:88vh;border-radius:var(--r-l) var(--r-l) 0 0}#unmapped{max-width:46vw}}`;
  { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }

  return { update, open, close, get name() { return name; } };
})();
register('TCUnmapped', TCUnmapped);
export { TCUnmapped };
