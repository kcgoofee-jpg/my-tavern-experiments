// 设置里的酒馆助手功能（docs/tavernhelper-audit.md B1 / B9，docs/interaction-modes.md (a)）：
// 「数据与映射」：世界书附加条目（写入 / 自动同步，写前看差异）；状态注入、类宏等开关在「AI 联动」页的功能卡片里（app/ai-cards.mjs）。
// 真正读写都在卡内脚本（tavern/eden-map.js onTh）；这里只发 eden-map:th 请求、画 eden-map:th-state。单独打开（不在酒馆里）时整栏不显示。
import { $, esc } from './dom-helpers.mjs';
import { post } from './protocol-stamp.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { busOn } from './bus.mjs';   // P2-3：全局监听统一登记
import { setAiSum } from './settings.mjs';

const W = { global: ['th.wb_global', '全局'], char: ['th.wb_char', '当前角色的附加世界书'], chat: ['th.wb_chat', '当前聊天'] };
let S = { prefs: null, wb: null, last: null, result: null, api: null, turnIds: null }, diffShown = false, armed = 0, delArmed = '';

function sec(page, id, order) {
  let el = document.getElementById(id);
  if (!el) { el = document.createElement('div'); el.id = id; el.className = 'thbox'; }
  if (!el.isConnected) window.SettingsApi?.registerSection(page, el, { order });   // 设置模块比本模块晚求值时：下一次状态到了再挂
  return el;
}
const when = t => { try { return new Date(t).toLocaleString(); } catch (e) { return ''; } };
const list = (a, n = 6) => (a || []).slice(0, n).map(esc).join('、') + ((a || []).length > n ? ' …' : '');

function renderWb() {
  const box = sec('data', 'thWb', 5), w = S.wb, P = S.prefs || {}, L = S.last;
  let h = `<h3>${esc(uiTextOr('th.wb', '世界书附加条目'))}</h3>`
    + `<label class="row"><input type="checkbox" id="wbOn" ${P.wbOn !== false ? 'checked' : ''}> ${esc(uiTextOr('th.wb_on', '自动管理地图世界书（总开关）'))}</label>`
    + `<small>${esc(uiTextOr('th.wb_on_hint', '开着时：打开地图自动建好这本书并挂到当前角色的附加世界书，地图更新后静默同步（每个版本只提示一次）。关掉 = 全部不自动做。'))}</small>`;
  if (P.wbOn !== false && P.wbTomb) h += `<small>${esc(uiTextOr('th.wb_tomb', '你删过这本书，所以不会再自动建；想要回来就点下面的「写入世界书」'))}</small>`;
  if (!w) h += `<div class="hrow"><span>${esc(uiTextOr('th.wb_state', '状态'))}</span><button type="button" class="btn" id="wbLook">${esc(uiTextOr('th.wb_look', '检查'))}</button></div>`;
  else if (!w.api) h += `<small>${esc(uiTextOr('th.wb_noapi', '这个酒馆助手版本没有世界书写入接口：请照旧手动导入「世界书附加条目」文件'))}</small>`;
  else {
    const st = w.exists ? (w.plan && !w.plan.changed ? uiTextOr('th.wb_uptodate', '已是最新 {v}', { v: w.plan.toLabel || w.plan.to }) : uiTextOr('th.wb_old', '已安装 {v}，可更新到 {to}', { v: w.plan?.fromLabel || w.plan?.from || '?', to: w.plan?.toLabel || w.plan?.to || '?' })) : uiTextOr('th.wb_none', '还没写入');
    h += `<div class="hrow"><span>${esc(w.book || '')}</span><span>${esc(st)}</span></div>`;
    if (w.exists) h += `<div class="hrow"><span>${esc(uiTextOr('th.wb_bound', '绑定'))}</span><span>${esc(w.where ? uiTextOr(...W[w.where]) : uiTextOr('th.wb_unbound', '没绑定（不会生效）'))}</span></div>`;
    if (L?.at) h += `<small>${esc(uiTextOr('th.wb_last', '上次同步 {t} · {v}', { t: when(L.at), v: L.label || L.ver || '?' }))}${L.auto ? ' · ' + esc(uiTextOr('th.wb_auto_tag', '自动')) : ''}</small>`;
    if (w.offline) h += `<small>${esc(uiTextOr('th.wb_offline', '取不到 CDN 上的条目（离线？）：稍后再试，或照旧手动导入'))}</small>`;
    const p = w.plan;
    if (p && diffShown) {
      h += `<div class="thdiff" role="status"><b>${esc(uiTextOr('th.wb_diff', '将要写入'))}</b>`
        + (p.first ? `<div>${esc(uiTextOr('th.wb_new_book', '新建一本书，{n} 条', { n: p.add.length }))}</div>` : '')
        + (!p.first && p.add.length ? `<div>${esc(uiTextOr('th.wb_add', '新增 {n}', { n: p.add.length }))}：${list(p.add)}</div>` : '')
        + (p.update.length ? `<div>${esc(uiTextOr('th.wb_upd', '更新 {n}', { n: p.update.length }))}：${list(p.update)}</div>` : '')
        + (p.keep.length ? `<div>${esc(uiTextOr('th.wb_keep', '你改过的 {n} 条保留不动', { n: p.keep.length }))}：${list(p.keep)}</div>` : '')
        + (p.conflict?.length ? `<div>${esc(uiTextOr('th.wb_conflict', '你改过，上游也改了 {n} 条（保留你的，上游新内容记在条目里）', { n: p.conflict.length }))}：${list(p.conflict)}</div>` : '')
        + (p.retire.length ? `<div>${esc(uiTextOr('th.wb_retire', '新版不再用的 {n} 条降为最低优先级（不删）', { n: p.retire.length }))}：${list(p.retire)}</div>` : '')
        + (p.user ? `<div>${esc(uiTextOr('th.wb_user', '你自己加的 {n} 条原样保留', { n: p.user }))}</div>` : '')
        + (!p.changed ? `<div>${esc(uiTextOr('th.wb_nochange', '没有变化'))}</div>` : '')
        + `<small>${esc(uiTextOr('th.wb_only', '只写这一本书，不碰其它世界书和角色卡'))}</small></div>`;
      const def = P.wbWhere || w.where || 'char';
      h += `<fieldset class="thwhere"><legend>${esc(w.where ? uiTextOr('th.wb_rebind_to', '改绑定到') : uiTextOr('th.wb_where', '写完绑定到'))}</legend>` + ['char', 'chat', 'global'].map(k => `<label><input type="radio" name="wbWhere" value="${k}" ${k === def ? 'checked' : ''}> ${esc(uiTextOr(...W[k]))}</label>`).join('') + `</fieldset>`;
      if (w.legacy?.length) h += `<label class="row"><input type="checkbox" id="wbMig" checked> ${esc(uiTextOr('th.wb_mig', '把旧书「{n}」的绑定换成新书（旧书留着）', { n: w.legacy[0] }))}</label>`;
      h += `<div class="hrow"><span></span><button type="button" class="btn primary" id="wbGo">${esc(armed ? uiTextOr('th.wb_confirm', '再点一次确认写入') : w.exists ? uiTextOr('th.wb_rebind_go', '改绑定') : uiTextOr('th.wb_write', '写入世界书'))}</button></div>`;
    } else h += `<div class="hrow"><span>${esc(uiTextOr('th.wb_state', '状态'))}</span><button type="button" class="btn" id="wbDiff">${esc(uiTextOr('th.wb_preview', '看差异'))}</button></div>`;
    if (S.result) h += `<small role="status">${esc(S.result.ok ? (S.result.reason === 'deleted' ? uiTextOr('th.wb_deleted', '已撤销（删除了这本书）') : uiTextOr('th.wb_done', '已写入')) : uiTextOr('th.wb_fail', '没写成（{r}）：可以照旧手动导入', { r: S.result.reason || '?' }))}</small>`;
    if (w.exists) h += `<div class="hrow"><span></span><button type="button" class="btn" id="wbUndo">${esc(delArmed === '__book__' ? uiTextOr('th.wb_undo_confirm', '再点一次：撤销（删除这本书，不能撤销）') : uiTextOr('th.wb_undo', '撤销（删除这本书）'))}</button></div>`;
    for (const n of w.legacy || []) h += `<div class="hrow"><span>${esc(uiTextOr('th.wb_legacy', '旧书 {n}', { n }))}</span><button type="button" class="btn" data-del="${esc(n)}">${esc(delArmed === n ? uiTextOr('th.wb_del_confirm', '再点一次：删除（不能撤销）') : uiTextOr('th.wb_del', '删除旧书'))}</button></div>`;
  }
  box.innerHTML = h;
  $('#wbLook')?.addEventListener('click', () => { diffShown = true; S.result = null; post({ type: 'eden-map:th', op: 'wb-inspect' }); });
  $('#wbDiff')?.addEventListener('click', () => { diffShown = true; S.result = null; post({ type: 'eden-map:th', op: 'wb-inspect' }); });
  const go = $('#wbGo'); if (go) go.onclick = () => {
    if (!armed || Date.now() - armed > 6000) { armed = Date.now(); renderWb(); return; }
    armed = 0; go.disabled = true; const r = box.querySelector('input[name="wbWhere"]:checked'), where = r ? r.value || null : null;
    if (S.wb?.exists && !(S.wb.plan && S.wb.plan.changed)) post({ type: 'eden-map:th', op: 'wb-rebind', where });
    else post({ type: 'eden-map:th', op: 'wb-write', where, migrate: $('#wbMig')?.checked ? S.wb.legacy[0] : null }); };
  const au = $('#wbOn'); if (au) au.onchange = () => post({ type: 'eden-map:th', op: 'prefs', prefs: { wbOn: au.checked } });
  $('#wbUndo')?.addEventListener('click', () => { if (delArmed !== '__book__') { delArmed = '__book__'; renderWb(); return; } delArmed = ''; S.result = null; post({ type: 'eden-map:th', op: 'wb-remove' }); });
  for (const b of box.querySelectorAll('button[data-del]')) b.onclick = () => { const n = b.dataset.del; if (delArmed !== n) { delArmed = n; renderWb(); return; } delArmed = ''; b.disabled = true; post({ type: 'eden-map:th', op: 'wb-del-legacy', name: n }); };
}

let lastTh = {};
// TURN-IDS（docs/turn-ids.md 项 3）：诊断环——最近被校验拦下的标签（地点 / 人物 / 事件）与原因，只展示不改写。
// 开关本体在「AI 联动」页的功能卡片（app/ai-cards.mjs turnIds）；没开过且没有记录时这一节不出现。
const TI_KIND = { place: 'ti.kind.place', char: 'ti.kind.char', event: 'ti.kind.event' };
function renderTurnIds() {
  const t = S.turnIds; if (!t) return;
  const items = Array.isArray(t.items) ? t.items : [];
  if (!t.on && !items.length) return;
  const box = sec('data', 'thTurnIds', 6);
  let h = `<h3>${esc(uiTextOr('ti.title', '本轮词表与校验'))}</h3>`
    + `<small>${esc(uiTextOr(t.on ? 'ti.hint' : 'ti.off_hint', t.on ? '校验开着：下面记录最近被拦下的标签（最多 16 条）。被拦下的写法不会上图，其余照常。' : '这一功能当前关闭；下面留着上次开启时的记录。'))}</small>`;
  h += items.length ? items.map(x => `<div class="thdiff"><b>${esc(uiTextOr(TI_KIND[x.kind] || 'ti.kind.char', x.kind || '?'))}</b> ${esc(uiTextOr('ti.reason.' + x.code, x.code || '?'))}`
    + `<div>${esc(String(x.text || '').slice(0, 60))}</div>`
    + `<div>${esc(uiTextOr('ti.floor', '第 {n} 楼', { n: Number.isFinite(+x.floor) ? +x.floor : '?' }))} · ${esc(x.at ? when(x.at) : '')}</div></div>`).join('')
    : `<small>${esc(uiTextOr('ti.none', '这一局还没有标签被拦下'))}</small>`;
  box.innerHTML = h;
}
const thListeners = new Set();
/** onThState(fn): the cards get the last prefs / health now and every later th-state (the module is only loaded when the AI link page first opens) */
export function onThState(fn) { thListeners.add(fn); fn(lastTh); }
export function applyState(d) {
  const wbRes = d.result && !d.result.navTest ? d.result : null;   // the AI advisor's test answer rides in `result` too: it is not a worldbook result
  S = { ...S, inject: d.inject || S.inject, prefs: d.prefs || S.prefs, last: d.last ?? S.last, api: d.api || S.api, wb: d.wb || S.wb, result: wbRes || (d.wb || d.result ? null : S.result), turnIds: d.turnIds || S.turnIds };
  if (wbRes) { diffShown = false; armed = 0; }
  if (d.healthSum) setAiSum(d.healthSum);
  lastTh = { ...lastTh, ...Object.fromEntries(['prefs', 'health', 'providers'].filter(k => d[k]).map(k => [k, d[k]])), ...(d.result?.navTest ? { navTest: d.result.navTest } : {}) };
  for (const f of thListeners) try { f(lastTh); } catch (e) {}
  delete lastTh.navTest;   // a test answer is delivered once   // the AI link page (ai-cards.mjs, loaded on demand) subscribes here
  renderWb();
  renderTurnIds();
}

if (typeof window !== 'undefined' && window.top !== window) {
  const css = document.createElement('style');
  css.textContent = '.thbox .thdiff,.thbox .thconsent{margin:6px 0;padding:8px 10px;border:1px solid var(--line-2,#8886);border-radius:10px;font-size:12.5px;line-height:1.5}.thbox .thdiff div{overflow-wrap:anywhere}.thbox .thwhere{border:0;margin:6px 0;padding:0;display:flex;flex-wrap:wrap;gap:4px 12px}.thbox .thwhere legend{padding:0;margin-bottom:2px}.thbox input[type=number]{width:5em}';
  document.head.appendChild(css);
  busOn({ key: 'th-ui.hostMsg', type: 'message', fn: e => { if (e.data?.type === 'eden-map:th-state' && (window.__isFromHost ? window.__isFromHost(e) : e.source === window.parent)) applyState(e.data); } });
  // 状态由卡内脚本在 eden-map:ready 后主动推（sendTh）；不读 CDN，差异要点「看差异」才取
}
