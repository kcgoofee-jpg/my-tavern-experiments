// 空间化背包 · 查看器侧（Part 5-1）：宿主推来的 eden-map:inv（聊天变量 eden_map.仓库）落在地点卡上——
// 打开某房间的地点卡，能看到这里存放 / 藏起来的东西（CRPG 搜刮感）。编辑走宿主 EdenMap.setInv / removeInv
//（本机扩展接口，docs/content-compat.md）；单独打开地图（无宿主）时没有数据源，列表为空不显示。
// 插件模式与 custom-names-view.mjs 一致（app/plugins.mjs 的 P.StashView；没加载时调用处带守卫）。
import { esc } from './app/dom-helpers.mjs';
import { register } from './app/plugins.mjs';
import { uiTextOr } from './app/text-lookup.mjs';
import { provideTab, refreshTabs } from './app/tabs.mjs';   // the drawer's tab registry (S6-1): the Items tab (K-R76) is provided from here
import { hereRes } from './app/locate.mjs';
import { RT } from './app/nodes-runtime.mjs';
import { currentMapId } from './app/state.mjs';
import { go } from './app/map-switch.mjs';
import { post } from './app/protocol-stamp.mjs';
import { plugins } from './app/plugins.mjs';
import { itemGroups, foldByPlace, mergeRows } from './core/entities.mjs';
import { chatId } from './app/extension-api.mjs';
import * as HX from './hide-ui.mjs';
const StashView = (() => {
  let items = [], stash = null, card = null;   // items: [{ id, 名, 地点, 层, 暗格, 说明?, 数量? }] (the place card's line); stash: the store rows (S6-2, null for an old host); card: the card's own rows
  function fromHost(d) {
    items = Array.isArray(d?.items) ? d.items : []; stash = Array.isArray(d?.stash?.rows) ? d.stash.rows : null; card = Array.isArray(d?.card?.rows) ? d.card.rows : null;
    if (Array.isArray(d?.stash?.notItems)) hid = new Set(d.stash.notItems.filter(n => typeof n === 'string'));   // the host's list of names marked "not an item" (its rows are already left out of the store rows)
    try { refreshTabs('items'); } catch (e) { /* the drawer is not there yet */ }
    renderAll();
  }
  /** 地点卡装饰（markers.mjs 在 CustomNamesView.decorateCard 之后调）：先清旧行（卡片复用），该地点有存放物才加一行 */
  function decorate(el, title) {
    const c = document.getElementById('card'); if (!c || c.hidden) return;
    const ex = c.querySelector('.extra'); if (!ex) return;
    ex.querySelectorAll('.cu-inv').forEach(n => n.remove());
    const key = title || el?.dataset?.name;
    const here = items.filter(i => i.地点 === key);
    if (!here.length) return;
    const p = document.createElement('p'); p.className = 'cu-inv';
    p.innerHTML = `<b>${esc(uiTextOr('inv.stored', '存放'))}</b> `;
    p.append(document.createTextNode(here.map(rowText).join('、')));
    ex.prepend(p);
  }
  const rowText = e => (e.暗格 ? uiTextOr('inv.hidden', '暗格·') + e.名 : e.名) + (e.数量 > 1 ? '×' + e.数量 : '');

  // ---------- the Items tab (K-R76; groups in core/entities.mjs itemGroups; folds by pickup place in foldByPlace) ----------
  // DRAWER-1: carried rows fold into collapsible groups by pickup place (same-name rows merge into ×N); a row (or a group's pin) takes you to the map, so there is no
  // repeated "show on map" button; a small × says "this is not an item" (the host keeps the name in the chat's map variable, the rows stay in the store for a restore).
  const CSS_ID = 'itemsCss';
  const CSS = `
.itpane { padding: var(--sp-4, 8px) var(--sp-5, 12px); }
.itgrp { margin: 0 0 var(--sp-5, 12px); }
.itgrp h4 { margin: var(--sp-3, 6px) 0 var(--sp-2, 4px); font: 600 var(--fs-small, 13px)/1.4 var(--font-ui, system-ui); color: var(--ink-2, inherit); }
.itph { display: flex; align-items: center; margin: var(--sp-2, 4px) 0 0; font: 500 var(--fs-small, 13px)/1.4 var(--font-ui, system-ui); color: var(--ink-2, inherit); }
.itph .itfold { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: var(--sp-3, 6px); min-height: 32px; padding: 0 var(--sp-2, 4px); border: 0; background: none; color: inherit; font: inherit; cursor: pointer; text-align: left; border-radius: var(--r-s, 4px); }
.itph .itfold:hover { background: var(--surface-2, rgba(255,255,255,.06)); }
.itph .itfold svg { flex: none; width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; transition: transform var(--dur-1, .12s); }
.itph .itfold[aria-expanded=false] svg { transform: rotate(-90deg); }
.itph + [role=list] { padding-left: var(--sp-6, 16px); }
.itph em, .itrow em { font-style: normal; font-family: var(--font-mono, monospace); opacity: .8; }
.itrow { display: flex; align-items: center; gap: var(--sp-2, 4px) var(--sp-4, 8px); border-bottom: 1px solid var(--line, rgba(255,255,255,.12)); }
.itrow .itgo, .itrow .itplain { flex: 1 1 auto; min-width: 0; display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--sp-2, 4px) var(--sp-4, 8px); padding: var(--sp-3, 6px) 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; }
.itrow .itgo { cursor: pointer; border-radius: var(--r-s, 4px); }
.itrow .itgo:hover { background: var(--surface-2, rgba(255,255,255,.06)); }
.itrow b { font-weight: 600; overflow-wrap: anywhere; }
.itrow small { flex: 1 1 100%; opacity: .75; overflow-wrap: anywhere; }
.itrow .itpin, .itph .itpin { flex: none; width: 28px; height: 28px; display: inline-grid; place-items: center; padding: 0; border: 0; border-radius: var(--r-s, 4px); background: none; color: var(--muted, inherit); opacity: 0; cursor: pointer; }
.itrow .itgo .itpin { margin-left: auto; opacity: 0; pointer-events: none; }
.itrow:hover .itpin, .itgo:focus-visible .itpin, .itph:hover .itpin, .itph .itpin:focus-visible { opacity: .85; }
.itpin svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.itrow .take { flex: none; white-space: nowrap; min-height: 28px; padding: 0 var(--sp-4, 8px); border: 1px solid var(--line, rgba(255,255,255,.2)); border-radius: var(--r-2, 6px); background: var(--surface-2, transparent); color: inherit; cursor: pointer; font: inherit; }
.itrow .take:disabled { opacity: .5; cursor: default; }
.itfold:focus-visible, .itgo:focus-visible, .take:focus-visible, .itpin:focus-visible { outline: 2px solid var(--focus, #63b4be); outline-offset: 2px; }
.ithid { padding: var(--sp-2, 4px) 0; }
@media (pointer: coarse), (max-width: 640px) { .itph .itfold, .itrow .itgo, .itrow .itplain { min-height: 44px; } .itrow .take, .itph .itpin, .itrow .itpin { min-height: 44px; min-width: 44px; } .itrow .itgo .itpin { opacity: .5; } }`;
  const nodeOf = Object.assign(t => hereRes(t)?.node ?? null, { has: id => !!RT?.tree?.has?.(id) });
  const hereNow = () => hereRes(String(document.getElementById('here')?.value || '').replace('{{user}}', '')) || null;
  const worldRows = () => { try { return window.StashMarkersApi?.all?.() || []; } catch (e) { return []; } };
  let hid = new Set(), showHid = false;   // names the player marked "not an item" in this chat (the host's list, plus the click that has not come back yet)
  const keep = r => !hid.has(r?.name ?? r?.名);
  function groups() {
    const h = hereNow();
    return itemGroups({ store: stash && stash.filter(keep), legacy: items.filter(keep), world: worldRows(), card, here: h?.node ?? null, hereMarker: h?.marker || '', taken: new Set(items.map(r => r.id)), nodeOf });
  }
  const total = g => g.carried.length + g.here.length + g.other.reduce((n, o) => n + o.rows.length, 0) + g.card.length;
  /** where a place text takes the player: a room, a landmark, or just its map; null when it does not locate */
  function target(place) {
    const r = place ? hereRes(place) : null;
    if (!r) return null;
    return r.room ? { room: r.room } : r.marker ? { map: r.map, marker: r.marker } : r.map ? { map: r.map } : null;
  }
  const jump = t => { if (t.room || t.marker) plugins.CustomNamesView?.flyTo(t); else go(t.map); };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const ICON = { pin: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.5s4.5-4.2 4.5-7.8a4.5 4.5 0 0 0-9 0c0 3.6 4.5 7.8 4.5 7.8z"/><circle cx="8" cy="6.7" r="1.6"/></svg>', chev: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5"/></svg>' };
  const icon = (cls, svg, label) => { const b = el('button', cls); b.type = 'button'; b.innerHTML = svg; b.setAttribute('aria-label', label); b.title = label; return b; };
  const flyLabel = () => uiTextOr('cu.fly', '在地图上看');
  /** one row: `r` = { name, qty, e } (merged); o = { place (where the row takes you), take, card } */
  function rowEl(r, o) {
    const e = r.e, d = e.data, li = el('div', 'itrow'), hidTxt = d.hidden ? uiTextOr('inv.hidden', '暗格·') : '';
    const t = o.card ? null : target(o.place === undefined ? e.place : o.place);
    const body = t ? el('button', 'itgo') : el('div', 'itplain');
    if (t) { body.type = 'button'; body.title = flyLabel(); body.setAttribute('aria-label', flyLabel() + ' · ' + r.name); body.addEventListener('click', () => jump(t)); }
    body.append(el('b', '', hidTxt + r.name));
    if (r.qty > 1) body.append(el('em', '', '×' + r.qty));
    const second = o.card ? (d.text || '') : '';
    if (second) body.append(el('small', '', second));
    if (t) { const pin = el('span', 'itpin'); pin.innerHTML = ICON.pin; body.append(pin); }
    li.setAttribute('role', 'listitem'); li.append(body);
    const note = d.note || d.text || ''; if (note) li.title = note;
    if (o.take) { const b = el('button', 'take', uiTextOr('loot.pick', '拾取')); b.type = 'button'; b.addEventListener('click', () => {
      post({ type: 'eden-map:loot', id: d.id, name: d.name, map: d.map || currentMapId, place: d.place || '', hidden: !!d.hidden }); b.disabled = true; }); li.append(b); }
    if (!o.card && !o.take) { const x = document.createElement('span'); x.innerHTML = HX.hideBtn(r.name, uiTextOr('it.not_item', '这不是物品')); li.append(x.firstChild); }
    return li;
  }
  // ---- fold state (per chat, local; not a preference): the keys of the groups the player closed ----
  const foldKey = () => 'edenMap:chat:' + (chatId || 'local') + ':itgrp';
  const folded = () => { try { return new Set(JSON.parse(LocalStore.get(foldKey()) || '[]')); } catch (e) { return new Set(); /* nothing stored or unreadable: every group is open */ } };
  function toggleFold(k) { const f = folded(); f.has(k) ? f.delete(k) : f.add(k); LocalStore.set(foldKey(), JSON.stringify([...f].slice(-100))); }   // LocalStore never throws
  /** a place group: a fold header (chevron, place, count) with a pin to its place on hover, then its rows. place '' = no place (no pin, label "unplaced") */
  function placeGroup(sec, fk, grp, o) {
    const open = !folded().has(fk), name = grp.place || uiTextOr('it.unplaced', '未归位'), t = grp.place ? target(grp.place) : null;
    const h = el('div', 'itph'), f = el('button', 'itfold'); f.type = 'button'; f.setAttribute('aria-expanded', open ? 'true' : 'false');
    f.innerHTML = ICON.chev; f.append(el('span', '', name), el('em', '', String(grp.units))); f.addEventListener('click', () => { toggleFold(fk); renderAll(); });
    h.append(f); if (t) { const p = icon('itpin', ICON.pin, flyLabel() + ' · ' + name); p.addEventListener('click', () => jump(t)); h.append(p); }
    sec.append(h);
    if (open) { const ul = el('div'); ul.setAttribute('role', 'list'); for (const r of grp.rows) ul.append(rowEl(r, { ...(typeof o === 'function' ? o(r) : o), place: grp.place })); sec.append(ul); }
  }
  function flat(sec, rows, o) { const ul = el('div'); ul.setAttribute('role', 'list'); for (const r of rows) ul.append(rowEl(r, typeof o === 'function' ? o(r) : o)); sec.append(ul); }
  const section = (root, key, title) => { const sec = el('section', 'itgrp'); sec.dataset.g = key; sec.append(el('h4', '', title)); root.append(sec); return sec; };
  let panelNow = null;
  const renderAll = () => { if (panelNow) renderPane(panelNow); };
  function renderPane(panel) {
    const root = panel.querySelector('.itpane'); if (!root) return; panelNow = panel;
    const g = groups(); root.textContent = '';
    if (g.carried.length) { const sec = section(root, 'carried', uiTextOr('it.carried', '随身')); for (const grp of foldByPlace(g.carried)) placeGroup(sec, 'c|' + grp.place, grp, {}); }
    if (g.here.length) {
      const sec = section(root, 'here', uiTextOr('it.here', '这里')), take = new Set(g.here.filter(e => e.source === 'world').map(e => e.id)), fold = foldByPlace(g.here);
      const one = r => ({ take: take.has(r.e.id) });   // several pickup places here: fold by place; one: a plain list
      if (fold.length > 1) for (const grp of fold) placeGroup(sec, 'h|' + grp.place, grp, one);
      else flat(sec, mergeRows(g.here), one);
    }
    if (g.other.length) { const sec = section(root, 'other', uiTextOr('it.other', '其他地点')); for (const o of g.other) { const rows = mergeRows(o.rows); placeGroup(sec, 'o|' + o.place, { place: o.place, rows, units: rows.reduce((n, r) => n + r.qty, 0) }, {}); } }
    if (g.card.length) flat(section(root, 'card', uiTextOr('it.card', '卡内物品栏')), g.card.map(e => ({ name: e.name, qty: Math.max(1, Math.floor(+e.data?.qty) || 1), floor: null, e })), { card: true });
    const names = [...hid]; if (names.length) {
      const box = el('div', 'ithid'); box.innerHTML = HX.hiddenToggle(names.length, showHid);
      if (showHid) box.insertAdjacentHTML('beforeend', '<div role="list">' + names.map(n => HX.hiddenRow(n, esc(n), 'div')).join('') + '</div>');
      root.append(box);
    }
  }
  function onPane(ev) {
    const r = HX.route(ev); if (!r) return;
    if (r.act === 'toggle') showHid = !showHid;
    else { r.act === 'hide' ? hid.add(r.key) : hid.delete(r.key); post({ type: 'eden-map:hide', kind: 'item', key: r.key, on: r.act === 'hide' }); if (!hid.size) showHid = false; refreshTabs('items'); }
    renderAll();
  }
  provideTab('it', {
    hasData: () => total(groups()) > 0 || hid.size > 0,
    label: () => { const n = groups().carried.length; return { html: esc(uiTextOr('it.tab', '物品')) + (n ? ' <em>' + n + '</em>' : ''), short: { n } }; },
    mount: panel => {
      if (!document.getElementById(CSS_ID)) { const st = document.createElement('style'); st.id = CSS_ID; st.textContent = CSS; document.head.appendChild(st); }
      HX.ensureCss(); const pane = el('div', 'itpane'); pane.addEventListener('click', onPane); panel.append(pane);
    },
    render: renderPane,
  });
  return { fromHost, decorate, get rows() { return items.map(i => ({ ...i })); }, get groups() { return groups(); } };
})();
register('StashView', StashView);
