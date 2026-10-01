// The AI link page (S7-1 T2, docs/settings-ia.md §4): the ten feature cards C1-C10 (ids digest, state, macros, dice, ledger, spatial, wbJit, wbXtal, nav, inject), each with its prefs key, sub-options
// and i18n keys (fc.<id>.name / purpose / more, fc.reason.<code>, fc.<id>.cost). Cards are built when the page first opens; the host's `eden-map:th-state` (prefs + health) patches them in place.
// The viewer only posts `eden-map:th` ops; every text is shown through textContent (feature-card.mjs). The page says it is watched (op `watch`) so the host sends the full health only then.
import { $ } from './dom-helpers.mjs';
import { post } from './protocol-stamp.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { PACK } from './current-pack.mjs';
import { featureCard } from './feature-card.mjs';
import { onBuilt, onShow, onLeave, registerIndex } from './settings-pages.mjs';
import { navForm } from './ai-nav-form.mjs';
import { onThState } from './tavernhelper-settings.mjs';
import { setInjectMode } from './settings-wire.mjs';

const tr = (k, zh, v) => uiTextOr(k, zh, v);
export const th = (op, extra = {}) => post({ type: 'eden-map:th', op, ...extra });
export const setPrefs = prefs => th('prefs', { prefs });
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const row = (labelKey, zh, ctl) => { const r = el('label', 'row'), s = el('span', '', tr(labelKey, zh)); r.append(s, ctl); return r; };
const num = (id, min, max, step, onChange) => { const i = el('input'); i.type = 'number'; i.id = id; i.min = min; i.max = max; i.step = step; i.addEventListener('change', () => onChange(+i.value)); return i; };
const box = id => { const c = el('input'); c.type = 'checkbox'; c.setAttribute('role', 'switch'); if (id) c.id = id; return c; };

export const ST = { prefs: null, health: null, providers: null, navTest: null };   // the last th-state, as far as the cards need it
const cards = {}, saved = {}, pending = {}, FIELDS = ['here', 'present', 'time', 'trips'];
const DEFS = [
  { id: 'digest', noSwitch: true, cost: true },
  { id: 'state', sw: 'thInjOn', pref: 'inj', cost: true, tpl: true, nowId: 'thInjPreview' },
  { id: 'macros', sw: 'thMacro', pref: 'macros' }, { id: 'dice', sw: 'thDice', pref: 'dice' }, { id: 'ledger', sw: 'thLedgerWrite', pref: 'ledgerWrite' },
  { id: 'spatial', sw: 'thSpatial', pref: 'spatial', cost: true, tpl: true }, { id: 'wbJit', sw: 'thWbJit', pref: 'wbJit' }, { id: 'wbXtal', sw: 'thWbXtal', pref: 'wbXtal' },
  { id: 'nav', sw: 'thNav', pref: 'nav', cost: true, consent: true }, { id: 'inject', sw: 'thInject' },
];
export const CARD_KEYS = DEFS.map(d => d.id);
const link = (cls, key, zh, fn) => { const b = el('button', 'btn ' + cls, tr(key, zh)); b.type = 'button'; b.addEventListener('click', fn); return b; };
const goWb = () => { window.SettingsApi.open('data'); document.getElementById('thWb')?.scrollIntoView({ block: 'center' }); };

/** sub-options per card: built once into the card's body; `update` refreshes their values from the prefs and the health row */
const SUBS = {
  digest: (s, api) => { const c = box('thInv'); c.addEventListener('change', () => setPrefs({ invInj: c.checked })); s.append(row('fc.digest.inv', '携带物品行', c)); api.inv = c; },
  state: (s, api) => {
    api.fs = {}; const f = el('div', 'fcsub'); for (const k of FIELDS) { const c = box('thF_' + k), tag = el('span', 'fctag'), r = row('fc.f.' + k, k, c); r.insertBefore(tag, c); api.fs[k] = { c, tag }; c.addEventListener('change', () => setPrefs({ stateOmit: FIELDS.filter(x => !api.fs[x].c.checked) })); f.append(r); }
    api.dep = num('thDepth', 0, 20, 1, v => setPrefs({ depth: v })); api.bud = num('thBudget', 40, 400, 10, v => setPrefs({ budget: v }));
    s.append(f, row('th.depth', '注入深度（楼层，0 = 最后）', api.dep), row('th.budget', 'token 上限', api.bud)); api.body.id = 'thAdv';
  },
  spatial: (s, api) => { api.bud = num('thSpBudget', 60, 240, 10, v => setPrefs({ spatialBudget: v })); api.dep = num('thSpDepth', 0, 20, 1, v => setPrefs({ spatialDepth: v })); s.append(row('fc.spatial.budget', 'token 上限', api.bud), row('th.depth', '注入深度（楼层，0 = 最后）', api.dep)); },
  wbJit: (s, api) => { api.go = link('fcgo', 'fc.go_wb', '打开附加世界书设置', goWb); s.append(api.go); },
  wbXtal: (s, api) => { api.go = link('fcgo', 'fc.go_wb', '打开附加世界书设置', goWb); s.append(api.go, link('fcclear', 'fc.xtal_clear', '清空已写入记录（保留墓碑）', () => th('xtal-clear'))); },
  nav: (s, api) => navForm(s, api),
  inject: (s, api) => {
    const seg = el('div', 'seg'); seg.id = 'injSeg'; seg.setAttribute('role', 'group');
    for (const [v, k, zh] of [['off', 'inj.off', '关'], ['compose', 'inj.compose', '填输入框'], ['sys', 'inj.sys', '系统指令']]) { const b = el('button', '', tr(k, zh)); b.type = 'button'; b.dataset.inj = v; b.addEventListener('click', () => { setInjectMode(v); th('state'); }); seg.append(b); }
    const h = el('div', 'hrow'); h.append(el('span', '', tr('s.inject', '动作注入')), seg); s.append(h, el('small', '', tr('s.inject_hint', '')));
    const c = document.getElementById('cmpBox'); if (c) api.body.appendChild(c);   // the compose templates box (compose-view.mjs) lives inside this card
  },
};
let builtLang = '', pageRoot = null;
function build(root) {
  pageRoot = root; builtLang = document.documentElement.lang;
  if (window.top === window) { root.appendChild(el('p', 'fch', tr('fc.solo', '单独打开地图时没有聊天：AI 联动只在酒馆里工作'))); return; }
  const live = el('div', 'sr-only'); live.id = 'fcLive'; live.setAttribute('aria-live', 'polite'); root.append(live);
  const wrap = el('div'); wrap.id = 'thInj'; root.append(wrap);
  for (const d of DEFS) {
    const c = featureCard(d, { subs: SUBS[d.id] ? (s, api) => SUBS[d.id](s, api) : null, onSwitch: on => {
      if (d.id === 'inject') setInjectMode(on ? 'compose' : 'off'); else { pending[d.id] = { k: d.pref, v: on }; setPrefs({ [d.pref]: on }); }
      saved[d.id] = 0; th('state'); } });
    cards[d.id] = c; wrap.append(c.el);
  }
  render();
}
let lastAnn = 0, prevState = {};
export function render() {
  if (!Object.keys(cards).length) return;
  if (pageRoot && builtLang !== document.documentElement.lang) { const c = document.getElementById('cmpBox'); c?.remove(); pageRoot.replaceChildren(); for (const k of Object.keys(cards)) delete cards[k]; build(pageRoot); if (c) cards.inject?.api.body.appendChild(c); patchSubs(); return; }   // the language changed: rebuild the cards in the new words
  const H = ST.health || {}, P = ST.prefs || {}, now = Date.now(), ctx = { lang: document.documentElement.lang, consent: P.navConsent, tplPack: !!PACK?.llm, testOk: ST.navTest?.ok };
  for (const d of DEFS) {
    const c = cards[d.id], p = pending[d.id]; if (p && P[p.k] === p.v) { saved[d.id] = now + 3000; delete pending[d.id]; setTimeout(render, 3100); }
    const row = d.id === 'inject' ? { ...(H.inject || { on: false, state: 'off' }), on: (window.__injectMode || 'off') !== 'off' } : H[d.id];
    const m = c.update(row && (d.id === 'inject' && !row.on ? { on: false, state: 'off' } : row), { ...ctx, saved: saved[d.id] > now });
    c.api.update?.(P, row);
    if (prevState[d.id] && prevState[d.id] !== m.state && now - lastAnn > 5000) { lastAnn = now; $('#fcLive').textContent = `${m.name}: ${m.line}`; }
    prevState[d.id] = m.state;
  }
}
/** values of the sub-options, patched from the prefs (skipped while the user types in that field) */
const setVal = (i, v) => { if (i && document.activeElement !== i && v != null) i.value = v; };
function patchSubs() {
  const P = ST.prefs || {}, H = ST.health || {};
  const a = n => cards[n]?.api; if (!a('state')) return;
  if (a('digest').inv && document.activeElement !== a('digest').inv) a('digest').inv.checked = P.invInj !== false;
  const sa = a('state'), fl = H.state?.fields || {}; for (const k of FIELDS) { const f = sa.fs[k]; f.c.checked = !(P.stateOmit || []).includes(k); f.tag.textContent = fl[k] === 'card' ? tr('fc.f.card', '卡里已有') : fl[k] === 'omitted' ? tr('fc.f.omitted', '已去掉') : fl[k] === 'sent' ? tr('fc.f.sent', '发送') : ''; }
  setVal(sa.dep, P.depth); setVal(sa.bud, P.budget); setVal(a('spatial').dep, P.spatialDepth); setVal(a('spatial').bud, P.spatialBudget);
  for (const n of ['wbJit', 'wbXtal']) a(n).go.hidden = H[n]?.reason !== 'no-book';
  a('nav').patch?.(P, H.nav, ST);
}
/** the host's th-state (relayed by tavernhelper-settings.mjs): keep the prefs / health the cards need, then patch them */
export function aiState(d) {
  for (const k of ['prefs', 'health', 'providers', 'navTest']) if (d[k]) ST[k] = d[k];
  if (Object.keys(cards).length) { render(); patchSubs(); }
}
onThState(aiState);
let watched = false;
const watch = on => { if (watched === on || window.top === window) return; watched = on; th('watch', { ai: on }); };
let shown = false;
onBuilt('ai', build); onShow('ai', () => { shown = true; watch(true); render(); patchSubs(); }); onLeave('ai', () => { shown = false; watch(false); });
addEventListener('message', e => { if (e.data?.type === 'eden-map:sleep') watch(false); else if (e.data?.type === 'eden-map:wake' && shown) watch(true); });   // a closed map does not keep the health polling
// search: names, purposes and sub-option words of the cards are found even before the page was opened
registerIndex(() => window.top === window ? [] : DEFS.map(d => ({ page: 'ai', card: d.id, key: d.id, label: tr('fc.' + d.id + '.name', d.id), text: [tr('fc.' + d.id + '.name', ''), tr('fc.' + d.id + '.purpose', ''), tr('fc.' + d.id + '.sub', '')].join(' ') })));
