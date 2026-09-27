// 天城 · 地图 → 聊天（v0.9.6）：地点卡 / 事件卡 / 人物卡底部两个按钮「去这里」「追问这件事」，把模板句（tavern/compose.mjs）
// 发给卡内脚本填进酒馆输入框——**只填不发**。只在嵌在酒馆里时显示。设置里「填入聊天的模板」可改（本机）。
// 读查看器的全局：esc、post、LANG、$。
const TCCompose = (() => {
  const T = (k, zh, v = {}) => { const r = window.I18N?.t?.(k, v); if (r && r !== k) return r; return Object.entries(v).reduce((s, [a, b]) => s.split('{' + a + '}').join(b), zh); };
  let CM = null, open = false;
  const mod = () => CM ? Promise.resolve(CM) : import(new URL('tavern/compose.mjs', document.baseURI).href).then(m => (CM = m)).catch(() => null);
  const embedded = () => window.top !== window || !!window.__composeTest;
  const lang = () => (typeof LANG !== 'undefined' && LANG === 'en' ? 'en' : 'zh');
  const st = () => { try { return localStorage; } catch (e) { return null; } };
  /** 卡片底部的按钮行：o = { go: 地点名（可空）, ask: 主题名（可空） }；o 为空 = 去掉 */
  function attach(o) {
    const c = document.getElementById('card'); if (!c) return;
    c.querySelector('.cmp')?.remove();
    if (!o || !embedded() || (!o.go && !o.ask)) return;
    const row = document.createElement('div'); row.className = 'cmp';
    const b = (k, lbl, name) => { if (!name) return; const e = document.createElement('button'); e.type = 'button'; e.className = 'btn'; e.dataset.cmp = k; e.dataset.name = name; e.textContent = lbl;
      e.title = T('cmp.tip', '填进聊天输入框（不会发送）'); row.appendChild(e); };
    b('go', T('cmp.go', '去这里'), o.go); b('ask', T('cmp.ask', '追问这件事'), o.ask);
    c.appendChild(row);
  }
  async function onClick(e) {
    const btn = e.target.closest?.('#card .cmp [data-cmp]'); if (!btn) return;
    e.stopPropagation(); const M = await mod(); if (!M) return;
    const tpl = M.read(st(), lang()), text = M.fill(tpl[btn.dataset.cmp], btn.dataset.name);
    if (text) post({ type: 'eden-map:compose', text });
  }
  document.addEventListener('click', onClick);
  // 卡内脚本回话：填进去了没有
  addEventListener('message', e => { if (e.data?.type !== 'eden-map:compose-done' || !window.__fromHost?.(e)) return;   // 只认宿主（arch-v2：以前任何窗口都能弹这条提示）
    if (typeof TCCustom !== 'undefined') TCCustom.toast([e.data.ok ? T('cmp.done', '已填入聊天输入框（未发送）') : T('cmp.fail', '没找到酒馆输入框')]); });
  // ---------- 设置：填入聊天的模板 ----------
  async function renderUI() {
    const pop = document.getElementById('setPop'); if (!pop || !embedded()) return;
    const M = await mod(); if (!M) return;
    let box = document.getElementById('cmpBox');
    if (!box) { box = document.createElement('details'); box.id = 'cmpBox'; if (window.TCSettings) TCSettings.registerSection('data', box, { order: 30 }); else { const at = document.getElementById('vmBox') || document.getElementById('selfCheck'); at ? pop.insertBefore(box, at) : pop.appendChild(box); }
      box.addEventListener('toggle', () => { open = box.open; }); box.addEventListener('change', onChange); box.addEventListener('click', ev => { if (ev.target.closest('[data-cmpreset]')) { ev.stopPropagation(); M.write(st(), {}); renderUI(); } }); }
    box.open = open;
    const cur = M.read(st(), lang()), d = M.DEFAULTS[lang()];
    box.innerHTML = `<summary><h3>${esc(T('cmp.title', '填入聊天的模板'))}</h3></summary>`
      + `<small>${esc(T('cmp.hint', '卡片上的「去这里」「追问这件事」把这句话填进酒馆输入框，不会自动发送。{name} = 地点 / 事件 / 人物名'))}</small>`
      + `<label class="vm-row"><span>${esc(T('cmp.go', '去这里'))}</span><input type="text" data-cmpk="go" maxlength="120" placeholder="${esc(d.go)}" value="${esc(cur.go === d.go ? '' : cur.go)}"></label>`
      + `<label class="vm-row"><span>${esc(T('cmp.ask', '追问这件事'))}</span><input type="text" data-cmpk="ask" maxlength="120" placeholder="${esc(d.ask)}" value="${esc(cur.ask === d.ask ? '' : cur.ask)}"></label>`
      + `<button type="button" class="btn" data-cmpreset="1">${esc(T('cmp.reset', '恢复默认'))}</button>`;
  }
  function onChange(e) { e.stopPropagation(); if (!CM) return; const o = {}; for (const i of document.querySelectorAll('#cmpBox input[data-cmpk]')) o[i.dataset.cmpk] = i.value; CM.write(st(), o); }
  const css = `
  #card .cmp{display:flex;flex-wrap:wrap;gap:var(--sp-4);margin-top:var(--sp-5)}
  #card .cmp .btn{flex:1 1 auto;min-height:40px;padding:0 var(--sp-5);font-size:var(--fs-small)}
  @media (pointer:coarse),(max-width:640px){#card .cmp .btn{min-height:44px}}
  #cmpBox{margin-top:var(--sp-5);padding-top:var(--sp-5);border-top:1px solid var(--line)}
  #cmpBox summary{display:flex;align-items:baseline;gap:var(--sp-4);min-height:var(--hit,44px);cursor:pointer;list-style:none}
  #cmpBox summary::-webkit-details-marker{display:none}
  #cmpBox summary h3{margin:0}
  #cmpBox summary::after{content:'';margin-left:auto;width:7px;height:7px;border:solid var(--muted);border-width:0 1.5px 1.5px 0;transform:rotate(45deg);align-self:center}
  #cmpBox[open] summary::after{transform:rotate(-135deg)}
  #cmpBox .vm-row{display:grid;grid-template-columns:minmax(6em,auto) 1fr;gap:var(--sp-4);align-items:center;min-height:var(--hit,44px)}
  #cmpBox .vm-row span{font-size:var(--fs-small);color:var(--ink-2)}
  #cmpBox input[type=text]{min-width:0;width:100%;min-height:36px;box-sizing:border-box;font:inherit;font-size:var(--fs-control);color:var(--ink);background:var(--bg);border:1px solid var(--line-strong);border-radius:var(--r-m);padding:4px 8px}
  #cmpBox .btn{margin-top:var(--sp-4);min-height:var(--hit,44px)}`;
  const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  mod(); document.addEventListener('DOMContentLoaded', () => renderUI());
  return { attach, renderUI };
})();
