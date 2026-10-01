// 地图 → 聊天（v0.9.6）：地点卡 / 事件卡 / 人物卡底部两个按钮「去这里」「追问这件事」，把模板句（tavern/compose-templates.mjs）
// 发给卡内脚本填进酒馆输入框——**只填不发**。只在嵌在酒馆里时显示。设置里「填入聊天的模板」可改（本机）。
// 查看器核心的状态与工具从 app/*.mjs 显式 import（arch-v2 §6 第 7 步）；别的外挂经 app/plugins.mjs 的 P 取（可能没加载，调用处带守卫）。
import { nsStore } from './core/pack.mjs';
import { esc } from './app/dom-helpers.mjs';
import { post } from './app/protocol-stamp.mjs';
import { LANG } from './app/i18n.mjs';
import { SettingsApi } from './app/settings.mjs';
import { plugins, register } from './app/plugins.mjs';
import { uiTextOr } from './app/text-lookup.mjs';
const ComposeView = (() => {
  let CM = null, open = false;
  const mod = () => CM ? Promise.resolve(CM) : import(new URL('tavern/compose-templates.mjs', document.baseURI).href).then(m => (CM = m)).catch(() => null);
  const embedded = () => window.top !== window;
  const lang = () => (typeof LANG !== 'undefined' && LANG === 'en' ? 'en' : 'zh');
  const st = () => { try { return nsStore(localStorage, window.__packId); } catch (e) { return null; } };
  /** 卡片底部的按钮行：o = { go: 地点名（可空）, ask: 主题名（可空） }；o 为空 = 去掉 */
  function attach(o) {
    const c = document.getElementById('card'); if (!c) return;
    c.querySelector('.cmp')?.remove();
    if (!o || !embedded() || (!o.go && !o.ask)) return;
    const row = document.createElement('div'); row.className = 'cmp';
    const b = (k, lbl, name) => { if (!name) return; const e = document.createElement('button'); e.type = 'button'; e.className = 'btn'; e.dataset.cmp = k; e.dataset.name = name; e.textContent = lbl;
      e.title = uiTextOr('cmp.tip', '填进聊天输入框（不会发送）'); row.appendChild(e); };
    b('go', uiTextOr('cmp.go', '去这里'), o.go); b('ask', uiTextOr('cmp.ask', '追问这件事'), o.ask);
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
  addEventListener('message', e => { if (e.data?.type !== 'eden-map:compose-done' || !window.__isFromHost?.(e)) return;   // 只认宿主（arch-v2：以前任何窗口都能弹这条提示）
    if (typeof plugins.CustomNamesView !== 'undefined') plugins.CustomNamesView.toast([e.data.ok ? uiTextOr('cmp.done', '已填入聊天输入框（未发送）') : uiTextOr('cmp.fail', '没找到酒馆输入框')]); });
  // ---------- 设置：填入聊天的模板 ----------
  async function renderUI() {
    const pop = document.getElementById('setPop'); if (!pop || !embedded()) return;
    const M = await mod(); if (!M) return;
    let box = document.getElementById('cmpBox');
    if (!box) { box = document.createElement('details'); box.id = 'cmpBox'; { const card = document.querySelector('#setPop [data-card="inject"] .fcbody'); if (card) card.appendChild(box); else if (window.SettingsApi) SettingsApi.registerSection('ai', box, { order: 30 }); }   // inside the AI link page's map-actions card when that is built else { const at = document.getElementById('vmBox') || document.getElementById('selfCheck'); at ? pop.insertBefore(box, at) : pop.appendChild(box); }
      box.addEventListener('toggle', () => { open = box.open; }); box.addEventListener('change', onChange); box.addEventListener('click', ev => { if (ev.target.closest('[data-cmpreset]')) { ev.stopPropagation(); M.write(st(), {}); renderUI(); }
        const x = ev.target.closest('[data-cmpex]'); if (x) { ev.stopPropagation(); const e = EX[lang()][+x.dataset.cmpex]; M.write(st(), { go: e.go, ask: e.ask }); renderUI(); } });
      box.addEventListener('input', preview); }
    box.open = open;
    const cur = M.read(st(), lang()), d = M.DEFAULTS[lang()];
    box.innerHTML = `<summary><h3>${esc(uiTextOr('cmp.title', '填入聊天的模板'))}</h3></summary>`
      + `<small>${esc(uiTextOr('cmp.hint', '卡片上的「去这里」「追问这件事」把这句话填进酒馆输入框，不会自动发送。{name} = 地点 / 事件 / 人物名'))}</small>`
      + `<dl class="cmp-ph"><dt><code>{name}</code></dt><dd>${esc(uiTextOr('cmp.ph_name', '卡片上的名字（地点 / 事件 / 人物）；模板里没写 {name} 时，名字接在句尾'))}</dd></dl>`
      + `<div class="cmp-ex" role="group" aria-label="${esc(uiTextOr('cmp.ex', '示例（点一下套用）'))}"><small>${esc(uiTextOr('cmp.ex', '示例（点一下套用）'))}</small>${EX[lang()].map((x, i) => `<button type="button" class="btn" data-cmpex="${i}" title="${esc(x.go + ' / ' + x.ask)}">${esc(x.label)}</button>`).join('')}</div>`
      + `<label class="vm-row"><span>${esc(uiTextOr('cmp.go', '去这里'))}</span><input type="text" data-cmpk="go" maxlength="120" placeholder="${esc(d.go)}" value="${esc(cur.go === d.go ? '' : cur.go)}"></label>`
      + `<label class="vm-row"><span>${esc(uiTextOr('cmp.ask', '追问这件事'))}</span><input type="text" data-cmpk="ask" maxlength="120" placeholder="${esc(d.ask)}" value="${esc(cur.ask === d.ask ? '' : cur.ask)}"></label>`
      + `<div class="cmp-pv" aria-live="polite"></div>`
      + `<button type="button" class="btn" data-cmpreset="1">${esc(uiTextOr('cmp.reset', '恢复默认'))}</button>`;
    preview();
  }
  // fix3（用户 2026-09-28）：示例模板（点一下套用）+ 实时预览（按示例名字「示例地点」填出来的句子）
  const EX = { zh: [{ label: '默认', go: '前往{name}。', ask: '关于{name}，' }, { label: '第一人称', go: '我动身前往{name}。', ask: '我想多了解一下{name}：' }, { label: '旁白提示', go: '（场景切换到{name}）', ask: '（请详细描写{name}的情况）' }],
    en: [{ label: 'Default', go: 'Go to {name}. ', ask: 'About {name}, ' }, { label: 'First person', go: 'I head to {name}. ', ask: 'I want to know more about {name}: ' }, { label: 'Narrator cue', go: '(Scene moves to {name}) ', ask: '(Describe {name} in detail) ' }] };
  function preview() {
    const pv = document.querySelector('#cmpBox .cmp-pv'); if (!pv || !CM) return; const d = CM.DEFAULTS[lang()], name = uiTextOr('cmp.pv_name', '示例地点');
    const v = k => document.querySelector(`#cmpBox input[data-cmpk="${k}"]`)?.value.trim() || d[k];
    pv.innerHTML = `<small>${esc(uiTextOr('cmp.pv', '预览（名字 = {name}）', { name }))}</small>` + ['go', 'ask'].map(k => `<div><b>${esc(k === 'go' ? uiTextOr('cmp.go', '去这里') : uiTextOr('cmp.ask', '追问这件事'))}</b><q>${esc(CM.fill(v(k), name))}</q></div>`).join('');
  }
  function onChange(e) { e.stopPropagation(); if (!CM) return; const o = {}; for (const i of document.querySelectorAll('#cmpBox input[data-cmpk]')) o[i.dataset.cmpk] = i.value; CM.write(st(), o); preview(); }
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
  #cmpBox .btn{margin-top:var(--sp-4);min-height:var(--hit,44px)}
  #cmpBox .cmp-ph{display:grid;grid-template-columns:auto 1fr;gap:2px var(--sp-4);margin:var(--sp-4) 0;font-size:var(--fs-micro)}
  #cmpBox .cmp-ph dd{margin:0;color:var(--ink-2)}#cmpBox code{font-family:var(--font-mono);color:var(--accent)}
  #cmpBox .cmp-ex{display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-3)}#cmpBox .cmp-ex small{flex-basis:100%;color:var(--muted)}
  #cmpBox .cmp-ex .btn{margin-top:0;min-height:36px;font-size:var(--fs-small)}
  #cmpBox .cmp-pv{margin-top:var(--sp-4);padding:var(--sp-3) var(--sp-4);border:1px dashed var(--line-strong);border-radius:var(--r-m);font-size:var(--fs-small)}
  #cmpBox .cmp-pv small{display:block;color:var(--muted)}#cmpBox .cmp-pv b{font-weight:600;margin-right:var(--sp-4);color:var(--ink-2)}#cmpBox .cmp-pv q{quotes:'「' '」'}`;
  const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  mod(); document.addEventListener('DOMContentLoaded', () => renderUI());
  return { attach, renderUI };
})();
register('ComposeView', ComposeView);
export { ComposeView };
