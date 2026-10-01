// Planning a route in the viewer (docs/kernel-schema.md K-R111, K-R113, docs/transit-schema.md §4.5, §5.1, §7): a place card gets a "route from where you are" link when the pack has a transit network and
// both places attach to it; choosing it draws the plan on the kernel layer `route-plan` (always on, no menu row), opens the plan card and tells the host (`eden-map:route-plan`: the viewer only sends
// intents, the host holds the plan). The host's echo (`eden-map:route`) replaces the local plan; a new location re-plans or, on arrival, clears. Suggestions (`eden-map:ops` `routes`, at most 3) are planned
// the same way and drawn dashed; their end point opens a card with the reason and "use this route". Pack text reaches the page only through esc() / textContent; line colours only as `--lc`.
import { registry, declared } from './layer-host.mjs';
import { drawOverlay, cssColor, inkFor, ensureCss } from './block-overlay.mjs';
import { planLayers } from '../core/transit-geometry.mjs';
import { showCard, closeCard, trackEl, untrack } from './markers.mjs';
import { graphNow, ready, posOn, stationView, endOf, planBetween, endPosOn, nameOf, lineLabel, modeText, viewTitle } from './transit-env.mjs';
import { RT } from './nodes-runtime.mjs';
import { currentMapId, aspect, osdViewer, mapRegistry } from './state.mjs';
import { post } from './protocol-stamp.mjs';
import { register } from './plugins.mjs';
import { esc } from './dom-helpers.mjs';
import { busOn } from './bus.mjs';
import { uiText, translateName, LANG } from './i18n.mjs';

const ID = 'route-plan', LIMIT = 3, CSS = `
.rtlegs { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 4px; }
.rtleg { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; font: 500 var(--fs-small, 13px)/1.4 var(--font-ui, system-ui); }
.rtleg small { color: var(--muted); }
.rtleg.chg { color: var(--muted); }
.rtbadge { display: inline-block; min-width: 1.6em; padding: 0 5px; text-align: center; border-radius: var(--r-pill, 999px); background: var(--lc, var(--accent)); color: var(--lc-ink, #fff); font-weight: 700; }
.rtwarn { margin: 6px 0 0; color: var(--alert); font: 600 var(--fs-small, 13px)/1.4 var(--font-ui, system-ui); }
.rtwhy { margin: 6px 0 0; font: 500 var(--fs-small, 13px)/1.5 var(--font-ui, system-ui); }`;
let user = null, sug = [], drawn = [], hits = [], count = 0, gen = 0, opsGen = 0, hooked = false, timer = 0, quiet = false;   // user = { plan, ends }; sug = [{ plan, ends, why }]

const hereText = () => String(document.getElementById('here')?.value || '').replace('{{user}}', '');
const endName = (e, node) => (node ? translateName(RT?.tree?.get?.(node)?.name || '') : '') || e?.name || '';
const clearDrawn = () => { for (const h of drawn) h.remove(); drawn = []; for (const el of hits) { untrack(el); try { osdViewer.removeOverlay(el); } catch (e) {} } hits = []; };
const sameNode = (a, b) => !!a && !!b && (a === b || !!RT?.tree && (RT.tree.isAncestor(a, b) || RT.tree.isAncestor(b, a)));
const row = () => { const r = document.getElementById('lyr-' + ID); if (r) r.hidden = true; };

/** draw(): every plan that has a leg on the open view, through the S8-2 blocks on the `trips` slot (a user plan solid, a suggestion dashed with a tap target on its end point) */
async function draw() {
  const my = ++gen; clearDrawn();
  const g = graphNow(), view = currentMapId;
  if (!g || !view || mapRegistry?.maps?.[view]?.kind !== 'points' || !osdViewer?.world?.getItemCount?.() || !(user || sug.length)) { count = 0; row(); return; }
  await ready();
  if (my !== gen) return;
  ensureCss(); count = 0;
  for (const it of [...sug.map(s => ({ ...s, suggested: true })), ...(user ? [{ ...user, suggested: false }] : [])]) {
    const opts = { posOf: posOn(view), endPos: endPosOn(it.ends, view), viewOf: stationView, suggested: it.suggested, viewTitle, aspect };
    for (const l of planLayers(g, it.plan, view, opts)) { const f = { ...l, slot: 'trips' }; count += f.features.length; drawn.push(drawOverlay({ viewer: osdViewer, layer: f, features: f.features, aspect, lang: LANG })); }
    const at = it.suggested ? opts.endPos('to') || (() => { const last = it.plan.legs.at(-1)?.stops?.at(-1); return last ? posOn(view)(last) : null; })() : null;
    if (at) {   // a tap target on the suggestion's end point
      const el = document.createElement('div'); el.className = 'tripin hit';
      osdViewer.addOverlay({ element: el, location: new OpenSeadragon.Point(at[0], at[1] * aspect), placement: OpenSeadragon.Placement.CENTER });
      const open = () => openCard(it, true); el._open = open; trackEl(el, open, uiText('rt.suggested')); hits.push(el);
    }
  }
  row();
}
const later = (ms = 0) => { clearTimeout(timer); timer = setTimeout(draw, ms); };

/** legRows(plan) -> the card's list items (text only; the colour of a ride leg goes through data-lc) */
function legRows(g, plan) {
  const out = [], T = g.transit;
  plan.legs.forEach((l, i) => {
    const st = l.stops, first = st.length ? nameOf(st[0]) : endName(plan.from, plan.from.node), last = st.length ? nameOf(st.at(-1)) : endName(plan.to, plan.to.node);
    const [a, b] = l.kind === 'walk' && st.length === 1 ? (i === 0 ? [endName(plan.from, plan.from.node), first] : [first, endName(plan.to, plan.to.node)]) : [first, last];
    const prev = plan.legs[i - 1];
    if (l.kind === 'ride' && prev?.kind === 'ride' && prev.line !== l.line) out.push(`<li class="rtleg chg">${esc(uiText('rt.change'))} · ${esc(first)} <small>${esc(uiText('rt.min', { min: Math.round(g.options.transfer_min + (g.lines.get(l.line)?.wait || 0)) }))}</small></li>`);
    const ln = l.kind === 'ride' ? g.lines.get(l.line) : null, how = ln ? lineLabel(l.line) : l.kind === 'walk' ? uiText('rt.walk') : modeText(l.mode);
    const badge = ln ? `<b class="rtbadge" data-lc="${esc(ln.color)}">${esc(ln.number || '')}</b>` : '';
    out.push(`<li class="rtleg">${badge}<span>${esc(how)}</span><span>${esc(a)} → ${esc(b)}</span><small>${l.kind === 'ride' ? esc(uiText('rt.stops', { n: Math.max(1, st.length - 1) })) + ' · ' : ''}${esc(uiText('rt.min', { min: Math.max(1, Math.round(l.min)) }))}</small></li>`);
  });
  return out.join('');
}
/** openCard(item, suggested): the plan card (title from → to, summary, the legs, the danger line, "clear" or "use this route") */
function openCard(it, suggested) {
  const g = graphNow(); if (!g) return;
  const p = it.plan, title = `${endName(p.from, p.from.node)} → ${endName(p.to, p.to.node)}`;
  const tail = (p.danger >= 2 ? `<p class="rtwarn">${esc(uiText('rt.danger', { n: p.danger }))}</p>` : '') + (suggested && it.why ? `<p class="rtwhy">${esc(it.why)}</p>` : '')
    + `<a role="button" tabindex="0" ${suggested ? 'data-route-adopt' : 'data-route-clear'}>${esc(uiText(suggested ? 'rt.adopt' : 'rt.clear'))}</a>`;
  quiet = true;
  try { showCard(null, suggested ? `${uiText('rt.suggested')} · ${title}` : title, '', `<ol class="rtlegs">${legRows(g, p)}</ol>${tail}`, uiText('rt.sub', { min: p.min, changes: p.changes })); } finally { quiet = false; }
  for (const b of document.querySelectorAll('#card .extra [data-lc]')) { const c = cssColor(b.dataset.lc); if (c) { b.style.setProperty('--lc', c); b.style.setProperty('--lc-ink', inkFor(c)); } }
}
const send = plan => post({ type: 'eden-map:route-plan', plan: plan ?? null });
function setUser(plan, ends, { open = true, tell = true } = {}) {
  user = plan ? { plan, ends } : null; if (tell) send(plan); later();
  if (plan && open) openCard(user, false);
}
const adopt = () => { const hit = sug.find(s => document.querySelector('#card h2')?.textContent.includes(endName(s.plan.from, s.plan.from.node))) || sug[0]; if (!hit) return; sug = sug.filter(s => s !== hit); setUser({ ...hit.plan, src: 'user' }, hit.ends); };

/** decorate(el, name): the route link on a place card (async: positions of places on other maps come from their points files); no plan, no link, no message */
async function decorate(el, name) {
  if (quiet || !el?.dataset?.name || !graphNow()) return;
  const here = hereText(); if (!here) return;
  const [a, b] = await Promise.all([endOf(here), endOf(el.dataset.name)]);
  const plan = planBetween(a, b, { src: 'user' }), x = document.querySelector('#card .extra');
  if (!plan || !x || document.querySelector('#card h2')?.textContent !== name || x.querySelector('[data-route]')) return;
  const l = document.createElement('a'); l.setAttribute('role', 'button'); l.tabIndex = 0; l.dataset.route = '1'; l.textContent = uiText('rt.link', { min: plan.min });
  l.addEventListener('click', () => setUser(plan, { from: a, to: b })); l.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setUser(plan, { from: a, to: b }); } });
  x.appendChild(l);
}

async function onRoute(plan) {   // the host's copy is the truth
  if (!plan) { user = null; later(); return; }
  if (user && JSON.stringify(user.plan) === JSON.stringify(plan)) return;
  const [a, b] = await Promise.all([endOf(endName(plan.from, plan.from.node)), endOf(endName(plan.to, plan.to.node))]);
  user = { plan, ends: { from: a ? { ...a, node: plan.from.node ?? a.node } : { node: plan.from.node, name: plan.from.name, pos: null }, to: b ? { ...b, node: plan.to.node ?? b.node } : { node: plan.to.node, name: plan.to.name, pos: null } } }; later();
}
async function onHere(value) {   // arrival clears, else a new plan from the new location to the same destination
  if (!user || typeof value !== 'string') return;
  const dest = user.ends.to, a = await endOf(value.replace('{{user}}', ''));
  if (!a || !user) return;
  if (sameNode(a.node, dest.node)) { setUser(null, null); return; }
  const plan = planBetween(a, dest, { src: 'user' });
  if (plan) setUser(plan, { from: a, to: dest }, { open: false });
}
async function onOps(rows) {
  const g = graphNow(), list = Array.isArray(rows) ? rows.filter(r => r && typeof r === 'object').slice(0, LIMIT) : [], mine = ++opsGen;
  if (!g || !list.length) { if (sug.length) { sug = []; later(); } return; }
  await ready();
  const out = [];
  for (const r of list) {
    const [a, b] = await Promise.all([endOf(String(r.from || '')), endOf(String(r.to || ''))]);
    const from = a ? { ...a, node: r.fromNode ?? a.node } : r.fromNode ? { node: r.fromNode, name: String(r.from || ''), pos: null } : null, to = b ? { ...b, node: r.toNode ?? b.node } : r.toNode ? { node: r.toNode, name: String(r.to || ''), pos: null } : null;
    const plan = planBetween(from, to, { src: 'op' }); if (plan) out.push({ plan, ends: { from, to }, why: typeof r.why === 'string' ? r.why : '' });
  }
  if (mine === opsGen) { sug = out; later(); }
}

function hook() {
  if (hooked) return; hooked = true;
  try { osdViewer?.addHandler('open', () => later()); } catch (e) {}
  try { new MutationObserver(() => later()).observe(document.body, { attributes: true, attributeFilter: ['data-map'] }); } catch (e) {}
  busOn({ key: 'routes.resize', type: 'resize', fn: () => later() });
  busOn({ key: 'routes.hostMsg', type: 'message', fn: e => {
    if (!window.__isFromHost?.(e)) return;
    const d = e.data, t = d?.type;
    if (t === 'eden-map:route') onRoute(d.plan); else if (t === 'eden-map:here' && !d.replay) onHere(d.value); else if (t === 'eden-map:ops') onOps(d.routes);
  } });
  const act = e => { const t = e.target?.closest?.('#card [data-route-clear], #card [data-route-adopt]'); if (!t || (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ')) return; e.preventDefault(); if (t.hasAttribute('data-route-adopt')) adopt(); else { setUser(null, null); closeCard(true); } };
  busOn({ key: 'routes.cardClick', type: 'click', target: document, fn: act }); busOn({ key: 'routes.cardKey', type: 'keydown', target: document, fn: act });
}

/** registerRoutePlanLayer() (boot): the kernel layer route-plan (always on, no menu row) and the card plugin */
export function registerRoutePlanLayer() {
  if (registry.has(ID)) return true;
  if (!document.getElementById('routePlanCss')) { const s = document.createElement('style'); s.id = 'routePlanCss'; s.textContent = CSS; document.head.appendChild(s); }
  registry.register(declared(ID, { initialVisible: true, countNow: () => count, mount: () => { hook(); later(); return true; }, unmount: () => { gen++; clearDrawn(); }, setVisible: () => later() }));
  register('RoutePlanView', { decorate, describe: () => ({ user: user?.plan ?? null, suggestions: sug.length, count, drawn: drawn.length }), set: (plan, ends) => setUser(plan, ends) });
  return true;
}
