// 设置里的酒馆助手功能（docs/tavernhelper-audit.md B1 / B9，docs/interaction-modes.md (a)）：
// 「数据与映射」：世界书附加条目（写入 / 自动同步，写前看差异）、状态注入开关、类宏开关；「高级」：注入深度与 token 上限。
// 真正读写都在卡内脚本（tavern/eden-map.js onTh）；这里只发 eden-map:th 请求、画 eden-map:th-state。单独打开（不在酒馆里）时整栏不显示。
import { $, esc, post, tx } from './util.mjs';

const W = { global: ['th.wb_global', '全局'], char: ['th.wb_char', '当前角色的附加世界书'], chat: ['th.wb_chat', '当前聊天'] };
let S = { prefs: null, wb: null, last: null, result: null, api: null }, diffShown = false, armed = 0, delArmed = '';

function sec(page, id, order) {
  let el = document.getElementById(id);
  if (!el) { el = document.createElement('div'); el.id = id; el.className = 'thbox'; }
  if (!el.isConnected) window.TCSettings?.registerSection(page, el, { order });   // 设置模块比本模块晚求值时：下一次状态到了再挂
  return el;
}
const when = t => { try { return new Date(t).toLocaleString(); } catch (e) { return ''; } };
const list = (a, n = 6) => (a || []).slice(0, n).map(esc).join('、') + ((a || []).length > n ? ' …' : '');

function renderWb() {
  const box = sec('data', 'thWb', 5), w = S.wb, P = S.prefs || {}, L = S.last;
  let h = `<h3>${esc(tx('th.wb', '世界书附加条目'))}</h3>`;
  if (!w) h += `<div class="hrow"><span>${esc(tx('th.wb_state', '状态'))}</span><button type="button" class="btn" id="wbLook">${esc(tx('th.wb_look', '检查'))}</button></div>`;
  else if (!w.api) h += `<small>${esc(tx('th.wb_noapi', '这个酒馆助手版本没有世界书写入接口：请照旧手动导入「世界书附加条目」文件'))}</small>`;
  else {
    const st = w.exists ? (w.plan && !w.plan.changed ? tx('th.wb_uptodate', '已是最新 {v}', { v: w.plan.to }) : tx('th.wb_old', '已安装 {v}，可更新到 {to}', { v: w.plan?.from || '?', to: w.plan?.to || '?' })) : tx('th.wb_none', '还没写入');
    h += `<div class="hrow"><span>${esc(w.book || '')}</span><span>${esc(st)}</span></div>`;
    if (w.exists) h += `<div class="hrow"><span>${esc(tx('th.wb_bound', '绑定'))}</span><span>${esc(w.where ? tx(...W[w.where]) : tx('th.wb_unbound', '没绑定（不会生效）'))}</span></div>`;
    if (L?.at) h += `<small>${esc(tx('th.wb_last', '上次同步 {t} · {v}', { t: when(L.at), v: L.ver || '?' }))}${L.auto ? ' · ' + esc(tx('th.wb_auto_tag', '自动')) : ''}</small>`;
    if (w.offline) h += `<small>${esc(tx('th.wb_offline', '取不到 CDN 上的条目（离线？）：稍后再试，或照旧手动导入'))}</small>`;
    const p = w.plan;
    if (p && diffShown) {
      h += `<div class="thdiff" role="status"><b>${esc(tx('th.wb_diff', '将要写入'))}</b>`
        + (p.first ? `<div>${esc(tx('th.wb_new_book', '新建一本书，{n} 条', { n: p.add.length }))}</div>` : '')
        + (!p.first && p.add.length ? `<div>${esc(tx('th.wb_add', '新增 {n}', { n: p.add.length }))}：${list(p.add)}</div>` : '')
        + (p.update.length ? `<div>${esc(tx('th.wb_upd', '更新 {n}', { n: p.update.length }))}：${list(p.update)}</div>` : '')
        + (p.keep.length ? `<div>${esc(tx('th.wb_keep', '你改过的 {n} 条保留不动', { n: p.keep.length }))}：${list(p.keep)}</div>` : '')
        + (p.retire.length ? `<div>${esc(tx('th.wb_retire', '新版不再用的 {n} 条停用（不删）', { n: p.retire.length }))}：${list(p.retire)}</div>` : '')
        + (p.user ? `<div>${esc(tx('th.wb_user', '你自己加的 {n} 条原样保留', { n: p.user }))}</div>` : '')
        + (!p.changed ? `<div>${esc(tx('th.wb_nochange', '没有变化'))}</div>` : '')
        + `<small>${esc(tx('th.wb_only', '只写这一本书，不碰其它世界书和角色卡'))}</small></div>`;
      const def = P.wbWhere || w.where || 'char';
      h += `<fieldset class="thwhere"><legend>${esc(w.where ? tx('th.wb_rebind_to', '改绑定到') : tx('th.wb_where', '写完绑定到'))}</legend>` + ['char', 'chat', 'global'].map(k => `<label><input type="radio" name="wbWhere" value="${k}" ${k === def ? 'checked' : ''}> ${esc(tx(...W[k]))}</label>`).join('') + `</fieldset>`;
      if (w.legacy?.length) h += `<label class="row"><input type="checkbox" id="wbMig" checked> ${esc(tx('th.wb_mig', '把旧书「{n}」的绑定换成新书（旧书留着）', { n: w.legacy[0] }))}</label>`;
      h += `<div class="hrow"><span></span><button type="button" class="btn primary" id="wbGo">${esc(armed ? tx('th.wb_confirm', '再点一次确认写入') : w.exists ? tx('th.wb_rebind_go', '改绑定') : tx('th.wb_write', '写入世界书'))}</button></div>`;
    } else h += `<div class="hrow"><span>${esc(tx('th.wb_state', '状态'))}</span><button type="button" class="btn" id="wbDiff">${esc(tx('th.wb_preview', '看差异'))}</button></div>`;
    if (S.result) h += `<small role="status">${esc(S.result.ok ? (S.result.reason === 'deleted' ? tx('th.wb_deleted', '已撤销（删除了这本书）') : tx('th.wb_done', '已写入')) : tx('th.wb_fail', '没写成（{r}）：可以照旧手动导入', { r: S.result.reason || '?' }))}</small>`;
    h += `<label class="row"><input type="checkbox" id="wbAuto" ${P.wbAuto !== false ? 'checked' : ''}> ${esc(tx('th.wb_autosync', '自动管理地图世界书'))}</label>`
      + `<small>${esc(tx('th.wb_autosync_hint', '开启自动同步世界书后，以后地图更新会自动更新这本书'))}</small>`;
    if (w.exists) h += `<div class="hrow"><span></span><button type="button" class="btn" id="wbUndo">${esc(delArmed === '__book__' ? tx('th.wb_undo_confirm', '再点一次：撤销（删除这本书，不能撤销）') : tx('th.wb_undo', '撤销（删除这本书）'))}</button></div>`;
    for (const n of w.legacy || []) h += `<div class="hrow"><span>${esc(tx('th.wb_legacy', '旧书 {n}', { n }))}</span><button type="button" class="btn" data-del="${esc(n)}">${esc(delArmed === n ? tx('th.wb_del_confirm', '再点一次：删除（不能撤销）') : tx('th.wb_del', '删除旧书'))}</button></div>`;
  }
  box.innerHTML = h;
  $('#wbLook')?.addEventListener('click', () => { diffShown = true; S.result = null; post({ type: 'eden-map:th', op: 'wb-inspect' }); });
  $('#wbDiff')?.addEventListener('click', () => { diffShown = true; S.result = null; post({ type: 'eden-map:th', op: 'wb-inspect' }); });
  const go = $('#wbGo'); if (go) go.onclick = () => {
    if (!armed || Date.now() - armed > 6000) { armed = Date.now(); renderWb(); return; }
    armed = 0; go.disabled = true; const r = box.querySelector('input[name="wbWhere"]:checked'), where = r ? r.value || null : null;
    if (S.wb?.exists && !(S.wb.plan && S.wb.plan.changed)) post({ type: 'eden-map:th', op: 'wb-rebind', where });
    else post({ type: 'eden-map:th', op: 'wb-write', where, migrate: $('#wbMig')?.checked ? S.wb.legacy[0] : null }); };
  const au = $('#wbAuto'); if (au) au.onchange = () => post({ type: 'eden-map:th', op: 'prefs', prefs: { wbAuto: au.checked } });
  $('#wbUndo')?.addEventListener('click', () => { if (delArmed !== '__book__') { delArmed = '__book__'; renderWb(); return; } delArmed = ''; S.result = null; post({ type: 'eden-map:th', op: 'wb-remove' }); });
  for (const b of box.querySelectorAll('button[data-del]')) b.onclick = () => { const n = b.dataset.del; if (delArmed !== n) { delArmed = n; renderWb(); return; } delArmed = ''; b.disabled = true; post({ type: 'eden-map:th', op: 'wb-del-legacy', name: n }); };
}

function renderInj() {
  const box = sec('data', 'thInj', 6), P = S.prefs || {}, A = S.api || {};
  box.innerHTML = `<h3>${esc(tx('th.inj', '状态注入'))}</h3>`
    + `<label class="row"><input type="checkbox" id="thInjOn" ${P.inj !== false ? 'checked' : ''} ${A.inject === false ? 'disabled' : ''}> ${esc(tx('th.inj_on', '每次生成前注入一行当前状态（地点、在场、时间、行程）'))}</label>`
    + `<small>${esc(tx('th.inj_note', '约 150 token；卡的提示词里已有的字段自动跳过；数据还没确认时标「未确认」。深度和上限在「高级」'))}</small>`
    + `<label class="row"><input type="checkbox" id="thMacro" ${P.macros ? 'checked' : ''} ${A.macros === false ? 'disabled' : ''}> ${esc(tx('th.macros', '提供宏 {{eden_here}} / {{eden_route}}（给卡或预设作者引用）'))}</label>`;
  $('#thInjOn').onchange = e => post({ type: 'eden-map:th', op: 'prefs', prefs: { inj: e.target.checked } });
  $('#thMacro').onchange = e => post({ type: 'eden-map:th', op: 'prefs', prefs: { macros: e.target.checked } });
  const adv = sec('adv', 'thAdv', 80);
  adv.innerHTML = `<h3>${esc(tx('th.inj', '状态注入'))}</h3>`
    + `<div class="hrow"><label for="thDepth">${esc(tx('th.depth', '注入深度（楼层，0 = 最后）'))}</label><input id="thDepth" type="number" min="0" max="20" step="1" value="${+P.depth || 2}"></div>`
    + `<div class="hrow"><label for="thBudget">${esc(tx('th.budget', 'token 上限'))}</label><input id="thBudget" type="number" min="40" max="400" step="10" value="${+P.budget || 150}"></div>`;
  $('#thDepth').onchange = e => post({ type: 'eden-map:th', op: 'prefs', prefs: { depth: +e.target.value } });
  $('#thBudget').onchange = e => post({ type: 'eden-map:th', op: 'prefs', prefs: { budget: +e.target.value } });
}

export function applyState(d) {
  S = { ...S, prefs: d.prefs || S.prefs, last: d.last ?? S.last, api: d.api || S.api, wb: d.wb || S.wb, result: d.result || (d.wb ? null : S.result) };
  if (d.result) { diffShown = false; armed = 0; }
  renderInj(); renderWb();
}

if (typeof window !== 'undefined' && window.top !== window) {
  const css = document.createElement('style');
  css.textContent = '.thbox .thdiff,.thbox .thconsent{margin:6px 0;padding:8px 10px;border:1px solid var(--line-2,#8886);border-radius:10px;font-size:12.5px;line-height:1.5}.thbox .thdiff div{overflow-wrap:anywhere}.thbox .thwhere{border:0;margin:6px 0;padding:0;display:flex;flex-wrap:wrap;gap:4px 12px}.thbox .thwhere legend{padding:0;margin-bottom:2px}.thbox input[type=number]{width:5em}';
  document.head.appendChild(css);
  window.addEventListener('message', e => { if (e.data?.type === 'eden-map:th-state' && (window.__fromHost ? window.__fromHost(e) : e.source === window.parent)) applyState(e.data); });
  // 状态由卡内脚本在 eden-map:ready 后主动推（sendTh）；不读 CDN，差异要点「看差异」才取
}
