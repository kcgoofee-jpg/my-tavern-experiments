// The feature card (S7-1 T2, docs/settings-ia.md §4.1): one component for every AI-link feature. Header = health icon (a shape, never colour alone) + name + purpose + master switch;
// body = sub-options, "what it does now" (the exact text sent and its token estimate), one health line, learn-more. All text goes in through textContent. The pure `cardModel` decides every
// word and icon (tests/feature_card.test.mjs); `featureCard` only draws it and keeps the nodes so a new state patches them in place (focus, open state and typed values survive).
// FIX-3 (COPY-1): the four states draw glyphs from the one icon set (ui/icons.js check / alert / wait / off) instead of the text characters they used to be. The names are unchanged; the label still rides on aria-label.
import { uiTextOr } from './text-lookup.mjs';
import { iconSvg } from './dom-helpers.mjs';

export const ICONS = Object.freeze({ working: 'check', 'not-effective': 'alert', idle: 'wait', off: 'off' });
const tr = (k, zh, v) => uiTextOr(k, zh, v);
const REASON_ZH = { off: '已关闭', 'no-host-api': '这个酒馆助手版本没有所需接口（{name}）', skipped: '卡的提示词里已有这些字段，本轮跳过', empty: '还没有可注入的状态', 'no-place': '当前地点不在任何地图上', 'no-book': '附加世界书未安装或未绑定', 'no-tags': '最近的回复里没有事实标签', 'no-checks': '还没有发生检定', 'no-config': '端点配置不完整', 'no-consent': '还没有同意', endpoint: '上次请求失败（HTTP {status}）', waiting: '地图开着或正在生成时不运行', 'no-input': '没有找到聊天输入框' };

/** cardModel(def, st, ctx) -> everything the card shows. def = { id, name, purpose, more, cost?, tpl?, sw? }; st = one row of healthOf (or null); ctx = { saved, consent, tplPack, testOk } */
export function cardModel(def, st, ctx = {}) {
  const s = st || { on: false, state: 'off' }, state = s.state || 'off', st2 = def.noSwitch ? (s.on ? state : 'working') : state;
  const reason = s.reason ? tr('fc.reason.' + s.reason, REASON_ZH[s.reason] || s.reason, { name: s.text || '', status: s.stats?.status ?? '' }) : '';
  const needsConsent = !!def.consent && ctx.consent === false;
  const line = needsConsent ? tr('fc.reason.no-consent', REASON_ZH['no-consent']) : st2 === 'working' ? (Number.isFinite(s.floor) ? tr('fc.ok', '正常 · 上次生效：第 {f} 楼', { f: s.floor }) : tr('fc.ok0', '正常'))
    : st2 === 'not-effective' ? tr('fc.bad', '未生效：{r}', { r: reason }) : st2 === 'idle' ? (reason || tr('fc.idle', '等待下一次回复')) : tr('fc.off', '已关闭');
  const text = typeof s.text === 'string' && s.reason !== 'no-host-api' ? s.text : '';
  return {
    id: def.id, name: tr('fc.' + def.id + '.name', def.id), purpose: tr('fc.' + def.id + '.purpose', ''), more: tr('fc.' + def.id + '.more', ''), cost: def.cost ? tr('fc.' + def.id + '.cost', '') : '',
    on: !!s.on, canSwitch: !def.noSwitch, state: st2, icon: ICONS[st2] || 'off', iconLabel: tr('fc.st.' + st2, st2), line, text, tokens: Number.isFinite(s.tokens) ? s.tokens : null,
    now: text ? '' : (st2 === 'off' ? '' : tr('fc.none', '目前没有发送内容')), tokensText: Number.isFinite(s.tokens) ? tr('fc.tokens', '≈ {n} token', { n: s.tokens }) : '',
    tpl: def.tpl ? tr('fc.tpl', '模板：{s}', { s: tr(ctx.tplPack ? 'fc.tpl_pack' : 'fc.tpl_core', ctx.tplPack ? '本设定包' : '内核') }) : '', saved: !!ctx.saved ? tr('fc.saved', '已保存') : '',
    needsConsent, stats: s.stats || null,
  };
}
/** testVerdict(answer, asked) -> { take, pass }: the connection test answer counts only when its nonce is the one the form just sent; a stale stored answer never unlocks consent */
export const testVerdict = (t, asked) => { const take = !!(t && asked && asked.nonce && t.nonce === asked.nonce); return { take, pass: take && !!t.ok }; };
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const CSS = `.fcard{border:1px solid var(--line);border-radius:var(--r-l);margin:0 0 var(--sp-4);background:var(--surface)}.fcard>summary{display:flex;align-items:center;gap:var(--sp-4);min-height:var(--hit,44px);padding:var(--sp-3) var(--sp-5);cursor:pointer;list-style:none}.fcard>summary::-webkit-details-marker{display:none}
.fcard .fci{flex:none;width:24px;height:24px;display:grid;place-items:center;border-radius:50%;border:1px solid currentColor;font-weight:700;color:var(--muted)}.fcard .fci>svg{width:14px;height:14px;display:block}.fcard.st-working .fci{color:var(--ok)}.fcard.st-not-effective .fci{color:var(--alert)}
.fcard .fcn{flex:1;min-width:0;display:flex;flex-direction:column}.fcard .fcn b{font-weight:600}.fcard .fcn small,.fcard .fcbody small{display:block;margin:0;color:var(--muted);font-size:var(--fs-micro);line-height:1.45}
.fcard .fcsw{flex:none;min-width:var(--hit,44px);min-height:var(--hit,44px);display:flex;align-items:center;justify-content:flex-end}.fcard .fcbody{padding:0 var(--sp-5) var(--sp-5);display:flex;flex-direction:column;gap:var(--sp-3)}
.fcard .fcnow{margin:0;padding:var(--sp-3) var(--sp-4);border:1px dashed var(--line-strong);border-radius:var(--r-m);font:var(--fs-micro)/1.5 var(--font-mono);white-space:pre-wrap;overflow-wrap:anywhere;max-height:9em;overflow:auto}
.fcard .fch{margin:0;font-size:var(--fs-small);color:var(--ink-2)}.fcard .fcsaved{color:var(--ok)}.fcard .fcmore summary{cursor:pointer;color:var(--accent);font-size:var(--fs-small);min-height:var(--hit,44px);display:flex;align-items:center}.fcard .fcmore p{margin:0 0 var(--sp-3);font-size:var(--fs-small);color:var(--ink-2)}
.fcard .fcsub{display:flex;flex-direction:column;gap:var(--sp-3)}.fcard .fcsub .hrow input[type=number]{width:5em}.fcard .fcsub input[type=text],.fcard .fcsub input[type=url],.fcard .fcsub input[type=password],.fcard .fcsub select{min-width:0;width:100%;box-sizing:border-box;min-height:36px;font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line-strong);border-radius:var(--r-m);padding:4px 8px}
.fcard .fcsub label.row.fcfld{flex-direction:column;align-items:stretch;justify-content:flex-start;gap:var(--sp-1);min-height:0;text-align:left}.fcard .fcsub label.row.fcfld>span{align-self:flex-start;color:var(--ink-2);font-size:var(--fs-small)}.fcard .fcsub[hidden]{display:none}.fcard .fctag{font-size:var(--fs-micro);color:var(--muted);border:1px solid var(--line);border-radius:var(--r-pill);padding:0 var(--sp-3)}.fcard .fcact{display:flex;gap:var(--sp-4);flex-wrap:wrap}.fcard .btn:disabled{color:var(--muted);background:var(--surface-2);border-color:var(--line);cursor:not-allowed}`;
/** featureCard(def, hooks) -> { el, update(st, ctx) }. hooks = { onSwitch(on), subs(body, api) } ; def.sw = the switch's element id. */
export function featureCard(def, hooks = {}) {
  if (!document.getElementById('fcardCss')) { const s = el('style'); s.id = 'fcardCss'; s.textContent = CSS; document.head.appendChild(s); }
  const card = el('details', 'fcard'); card.dataset.card = def.id;
  const sum = el('summary'), ic = el('span', 'fci'), nm = el('span', 'fcn'), nb = el('b'), pu = el('small'), co = el('small'), sw = el('span', 'fcsw');
  ic.setAttribute('role', 'img'); nm.append(nb, pu, co); sum.append(ic, nm, sw);
  const sc = def.noSwitch ? null : el('input'); if (sc) { sc.type = 'checkbox'; sc.setAttribute('role', 'switch'); if (def.sw) sc.id = def.sw; sw.appendChild(sc); sc.addEventListener('change', () => hooks.onSwitch?.(sc.checked)); }
  const body = el('div', 'fcbody'), subs = el('div', 'fcsub'), tpl = el('small'), now = el('pre', 'fcnow'), tk = el('small'), none = el('small'), hl = el('p', 'fch'), sv = el('span', 'fcsaved'), more = el('details', 'fcmore'), ms = el('summary'), mp = el('p');
  if (def.nowId) now.id = def.nowId;
  more.append(ms, mp); hl.append(document.createTextNode(''), sv); body.append(subs, tpl, now, tk, none, hl, more); card.append(sum, body);
  const api = { card, subs, body, sw: sc };
  hooks.subs?.(subs, api);
  let prev = '';
  function update(st, ctx = {}) {
    const m = cardModel(def, st, ctx), key = JSON.stringify([m, ctx.lang]);
    card.className = 'fcard st-' + m.state; if (sc && document.activeElement !== sc) sc.checked = m.on;
    if (key === prev) return m; prev = key;
    ic.innerHTML = iconSvg(m.icon); ic.setAttribute('aria-label', m.iconLabel); nb.textContent = m.name; pu.textContent = m.purpose; co.textContent = m.cost; co.hidden = !m.cost;
    if (sc) sc.setAttribute('aria-label', m.name);
    subs.hidden = !(m.on || !m.canSwitch) && !m.needsConsent; tpl.textContent = m.tpl; tpl.hidden = !m.tpl;
    now.textContent = m.text; now.hidden = !m.text; tk.textContent = m.tokensText; tk.hidden = !m.text; none.textContent = m.now; none.hidden = !m.now;
    hl.firstChild.textContent = m.line; sv.textContent = m.saved ? ' · ' + m.saved : '';
    ms.textContent = tr('fc.more', '了解更多'); mp.textContent = m.more; hooks.update?.(m, api, st, ctx); return m;
  }
  return { el: card, update, api };
}
