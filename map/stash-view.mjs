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
import { itemGroups } from './core/entities.mjs';
const StashView = (() => {
  let items = [], stash = null, card = null;   // items: [{ id, 名, 地点, 层, 暗格, 说明?, 数量? }] (the place card's line); stash: the store rows (S6-2, null for an old host); card: the card's own rows
  function fromHost(d) {
    items = Array.isArray(d?.items) ? d.items : []; stash = Array.isArray(d?.stash?.rows) ? d.stash.rows : null; card = Array.isArray(d?.card?.rows) ? d.card.rows : null;
    try { refreshTabs('items'); } catch (e) { /* the drawer is not there yet */ }
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

  // ---------- the Items tab (K-R76; groups in core/entities.mjs itemGroups) ----------
  const CSS_ID = 'itemsCss';
  const CSS = `
.itpane { padding: var(--sp-4, 8px) var(--sp-5, 12px); }
.itgrp { margin: 0 0 var(--sp-5, 12px); }
.itgrp h4, .itgrp h5 { margin: var(--sp-3, 6px) 0 var(--sp-2, 4px); font: 600 var(--fs-small, 13px)/1.4 var(--font-ui, system-ui); color: var(--ink-2, inherit); }
.itgrp h5 { font-weight: 500; opacity: .85; }
.itgrp ul { list-style: none; margin: 0; padding: 0; }
.itrow { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2, 4px) var(--sp-4, 8px); padding: var(--sp-3, 6px) 0; border-bottom: 1px solid var(--line, rgba(255,255,255,.12)); }
.itrow b { font-weight: 600; overflow-wrap: anywhere; }
.itrow em { font-style: normal; font-family: var(--font-mono, monospace); opacity: .8; }
.itrow small { flex: 1 1 100%; opacity: .75; overflow-wrap: anywhere; }
.itrow button { margin-left: auto; min-height: 32px; padding: 0 var(--sp-4, 8px); border: 1px solid var(--line, rgba(255,255,255,.2)); border-radius: var(--r-2, 6px); background: var(--surface-2, transparent); color: inherit; cursor: pointer; font: inherit; }
.itrow button:disabled { opacity: .5; cursor: default; }
.itrow button:focus-visible { outline: 2px solid var(--focus, #63b4be); outline-offset: 2px; }
@media (pointer: coarse), (max-width: 640px) { .itrow button { min-height: 44px; min-width: 44px; } }`;
  const nodeOf = Object.assign(t => hereRes(t)?.node ?? null, { has: id => !!RT?.tree?.has?.(id) });
  const hereNow = () => hereRes(String(document.getElementById('here')?.value || '').replace('{{user}}', '')) || null;
  const worldRows = () => { try { return window.StashMarkersApi?.all?.() || []; } catch (e) { return []; } };
  function groups() {
    const h = hereNow();
    return itemGroups({ store: stash, legacy: items, world: worldRows(), card, here: h?.node ?? null, hereMarker: h?.marker || '', taken: new Set(items.map(r => r.id)), nodeOf });
  }
  const total = g => g.carried.length + g.here.length + g.other.reduce((n, o) => n + o.rows.length, 0) + g.card.length;
  /** where a place text takes the player: a room, a landmark, or just its map; null when it does not locate */
  function target(place) {
    const r = place ? hereRes(place) : null;
    if (!r) return null;
    return r.room ? { room: r.room } : r.marker ? { map: r.map, marker: r.marker } : r.map ? { map: r.map } : null;
  }
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  function button(text, fn) { const b = el('button', '', text); b.type = 'button'; b.addEventListener('click', () => fn(b)); return b; }
  function rowEl(e, o) {
    const d = e.data, li = el('li', 'itrow'), hid = d.hidden ? uiTextOr('inv.hidden', '暗格·') : '';
    li.append(el('b', '', hid + e.name));
    if (d.qty > 1) li.append(el('em', '', '×' + d.qty));
    const second = o.card ? (d.text || '') : o.carried ? (e.place ? uiTextOr('it.found_at', '拾于 {p}', { p: e.place }) : '') : e.place;
    if (second) li.append(el('small', '', second));
    const note = d.note || d.text || ''; if (note) li.title = note;
    if (o.take) li.append(button(uiTextOr('loot.pick', '拾取'), b => {
      post({ type: 'eden-map:loot', id: d.id, name: d.name, map: d.map || currentMapId, place: d.place || '', hidden: !!d.hidden }); b.disabled = true; }));
    const t = o.card ? null : target(e.place);
    if (t) li.append(button(uiTextOr('cu.fly', '在地图上看'), () => { if (t.room || t.marker) plugins.CustomNamesView?.flyTo(t); else go(t.map); }));
    return li;
  }
  function grp(root, key, title, rows, o) {
    if (!rows.length) return;
    const sec = el('section', 'itgrp'); sec.dataset.g = key;
    sec.append(el('h4', '', title)); const ul = el('ul'); for (const e of rows) ul.append(rowEl(e, o)); sec.append(ul); root.append(sec);
  }
  function renderPane(panel) {
    const root = panel.querySelector('.itpane'); if (!root) return;
    const g = groups(); root.textContent = '';
    grp(root, 'carried', uiTextOr('it.carried', '随身'), g.carried, { carried: true });
    const take = new Set(g.here.filter(e => e.source === 'world').map(e => e.id));
    if (g.here.length) { const sec = el('section', 'itgrp'); sec.dataset.g = 'here'; sec.append(el('h4', '', uiTextOr('it.here', '这里'))); const ul = el('ul'); for (const e of g.here) ul.append(rowEl(e, { take: take.has(e.id) })); sec.append(ul); root.append(sec); }
    if (g.other.length) {
      const sec = el('section', 'itgrp'); sec.dataset.g = 'other'; sec.append(el('h4', '', uiTextOr('it.other', '其他地点')));
      for (const o of g.other) { sec.append(el('h5', '', o.place || uiTextOr('it.unplaced', '未归位'))); const ul = el('ul'); for (const e of o.rows) ul.append(rowEl(e, {})); sec.append(ul); }
      root.append(sec);
    }
    grp(root, 'card', uiTextOr('it.card', '卡内物品栏'), g.card, { card: true });
  }
  provideTab('it', {
    hasData: () => total(groups()) > 0,
    label: () => { const n = groups().carried.length; return { html: esc(uiTextOr('it.tab', '物品')) + (n ? ' <em>' + n + '</em>' : ''), short: { n } }; },
    mount: panel => {
      if (!document.getElementById(CSS_ID)) { const st = document.createElement('style'); st.id = CSS_ID; st.textContent = CSS; document.head.appendChild(st); }
      panel.append(el('div', 'itpane'));
    },
    render: renderPane,
  });
  return { fromHost, decorate, get rows() { return items.map(i => ({ ...i })); }, get groups() { return groups(); } };
})();
register('StashView', StashView);
