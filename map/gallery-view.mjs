// The pack's media source in the viewer (K-R106): a gallery section on the person card (the card script's own pictures, grouped by category, loaded only when a group is
// opened), and the chat's tagged scenes on the place card ("scenes here") and as one person's timeline. Read only: the host sends the card's picture table and the scenes
// resolved from the chat (eden-map:media); nothing is stored here but the user's switch, every address goes through a recheck before it reaches an attribute, all text is
// set with textContent, and no picture is ever put into a message. Plugin mode like stash-view.mjs (app/plugins.mjs P.GalleryView; callers guard).
import { register, plugins } from './app/plugins.mjs';
import { uiTextOr } from './app/text-lookup.mjs';
import { packOverlay, packV2 } from './app/current-pack.mjs';
import { hereRes } from './app/locate.mjs';
import { go } from './app/map-switch.mjs';
import { post } from './app/protocol-stamp.mjs';
import { SettingsApi } from './app/settings.mjs';
import { esc } from './app/dom-helpers.mjs';
import { viewerUrlOk } from './core/portrait-lookup.mjs';
import { gallerySpec, galleryUrlOk } from './core/gallery-spec.mjs';
import { scenesAt, timelineOf, categoryRows, charOf } from './core/gallery-scenes.mjs';

const GalleryView = (() => {
  const KEY = 'edenMapGallery', SHOW = 60;
  let table = null, scenes = [], cats = [], remembered = null, seen = false;   // seen: this chat's card had a table (the settings row stays after the switch clears it)   // table: the card's pictures as sent; scenes: the chat's tags resolved; remembered: what the open card was drawn for
  const ent = () => packV2?.entities || packOverlay?.entities || null;
  const spec = () => gallerySpec(ent()?.gallery);
  /** the user's switch: default on */
  const on = () => { try { return window.LocalStore?.get(KEY) !== '0'; } catch (e) { return true; } };
  /** the settings row on 人物与物品 (it used to sit in the custom-names box): shown once this chat's card had a picture table */
  function galRow() {
    let box = document.getElementById('galBox');
    if (!box) { box = document.createElement('div'); box.id = 'galBox'; SettingsApi.registerSection('people', box, { order: 50 }); box.addEventListener('change', e => { if (e.target.id === 'optGal') setOn(e.target.checked); }); }
    box.innerHTML = seen ? `<label class="row"><span>${esc(uiTextOr('ch.gal_opt', '显示图鉴与场景'))}</span><input type="checkbox" role="switch" id="optGal" ${on() ? 'checked' : ''}></label><small>${esc(uiTextOr('ch.gal_hint', '读取卡自带的图鉴脚本里的图（只读、不复制、不保存地址），人物卡里按类别列出，并把聊天里写出的图鉴标记在地点卡、人物卡里按楼层列出；不会往聊天消息里插图'))}</small>` : '';
  }
  /** every address goes through here before an attribute: the image shape, then the pack's hosts and this source's folder rules once more */
  const okUrl = u => { const s = spec(); return typeof u === 'string' && !!u && viewerUrlOk(u) && !!s && galleryUrlOk(ent()?.avatar, s, u); };
  const clean = list => (Array.isArray(list) ? list : []).map(u => (okUrl(u) ? u : ''));
  const str = (v, n) => (typeof v === 'string' ? [...v].slice(0, n).join('') : '');
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  function thumb(url, label) {
    const i = el('img', 'cg-th'); i.alt = ''; i.loading = 'lazy'; i.decoding = 'async'; i.referrerPolicy = 'no-referrer'; if (label) i.title = label;
    i.addEventListener('error', () => { i.hidden = true; }); i.src = url; return i;
  }
  function fromHost(d) {
    if (!d || d.on === false) { table = null; scenes = []; cats = []; }
    else {
      if (Array.isArray(d.cats)) cats = d.cats.map(c => str(c, 20)).filter(Boolean).slice(0, 12);
      if (Array.isArray(d.chars)) seen = seen || d.chars.length > 0;
      if (Array.isArray(d.chars)) table = { chars: d.chars.slice(0, 200).map(c => ({ name: str(c?.name, 40), cover: okUrl(c?.cover) ? c.cover : '', sets: Object.fromEntries(cats.filter(k => Array.isArray(c?.sets?.[k])).map(k => [k, clean(c.sets[k].slice(0, 500))])) })).filter(c => c.name) };
      if (Array.isArray(d.scenes)) scenes = d.scenes.slice(-600).map(s => ({ floor: Number.isInteger(s?.floor) ? s.floor : 0, i: Number.isInteger(s?.i) ? s.i : 0, place: str(s?.place, 80), node: str(s?.node, 80), name: str(s?.name, 40), who: str(s?.who, 40),
        cat: str(s?.cat, 20), n: Number.isInteger(s?.n) ? s.n : 0, url: okUrl(s?.url) ? s.url : '' })).filter(s => s.name);
    }
    try { galRow(); } catch (e) { /* the settings box is not there yet */ }
    redraw();
  }
  const has = () => !!table?.chars?.length;
  const nodeOf = p => hereRes(p)?.node || '';
  function target(place) { const r = place ? hereRes(place) : null; return r ? (r.room ? { room: r.room } : r.marker ? { map: r.map, marker: r.marker } : r.map ? { map: r.map } : null) : null; }
  const floorText = n => uiTextOr('ev.floor', '聊天第 {n} 楼', { n });
  function sceneLi(s, withPlace, withWho) {
    const li = el('li', 'cg-row');
    li.append(el('b', '', floorText(s.floor)), el('span', 'cg-w', [withWho ? (s.who || s.name) : '', s.cat + ' #' + s.n].filter(Boolean).join(' · ')));
    if (withPlace && s.place) { const t = target(s.place), b = el(t ? 'button' : 'small', 'cg-pl', s.place); if (t) { b.type = 'button'; b.addEventListener('click', () => { if (t.room || t.marker) plugins.CustomNamesView?.flyTo(t); else go(t.map); }); } li.append(b); }
    if (s.url) li.append(thumb(s.url, s.cat + ' #' + s.n));
    return li;
  }
  /** a list that builds its rows only when opened (nothing is requested before) */
  function lazyDetails(summary, count, build, open) {
    const d = el('details', 'cg-cat'), s = el('summary', '', summary); s.append(' ', el('small', '', String(count))); d.append(s);
    let built = false; const fill = () => { if (built || !d.open) return; built = true; d.append(build()); };
    d.addEventListener('toggle', fill); if (open) d.open = true; fill(); return d;
  }
  /** the person card: the card's pictures by category, then the person's scenes by floor. Call after the card is drawn. */
  function person(name) {
    remembered = { kind: 'person', name };
    const c = document.getElementById('card'), ex = c?.querySelector('.extra'); if (!ex) return;
    ex.querySelectorAll('.cg-sec').forEach(n => n.remove());
    if (!on() || !has()) return;
    const rows = categoryRows(table, { tag: { categories: cats } }, name), tl = timelineOf(scenes, name);
    if (!rows.length && !tl.length) return;
    const sec = el('section', 'cg-sec'); sec.append(el('h3', '', uiTextOr('ch.gal', '图鉴')));
    for (const r of rows) sec.append(lazyDetails(r.cat, r.items.length, () => { const g = el('div', 'cg-grid'); for (const it of r.items) g.append(thumb(it.url, '#' + it.n)); return g; }));
    if (tl.length) sec.append(lazyDetails(uiTextOr('ch.gal_tl', '出现的场景'), tl.length, () => { const ol = el('ol', 'cg-list'); for (const s of tl.slice(-SHOW)) ol.append(sceneLi(s, true, false)); return ol; }));
    ex.append(sec);
  }
  /** the place card (markers.mjs decorate): "scenes here" */
  function decorate(el0, title) {
    remembered = { kind: 'place', el: el0, title };
    const c = document.getElementById('card'); if (!c || c.hidden) return;
    const ex = c.querySelector('.extra'); if (!ex) return;
    ex.querySelectorAll('.cg-scenes').forEach(n => n.remove());
    if (!on() || !scenes.length) return;
    const key = title || el0?.dataset?.name || '', here = scenesAt(scenes, { node: nodeOf(key), place: key }, nodeOf);
    if (!here.length) return;
    const sec = el('section', 'cg-scenes'); sec.append(el('h4', '', uiTextOr('pl.scenes', '此处的场景')));
    sec.append(lazyDetails(uiTextOr('pl.scenes_n', '按楼层'), here.length, () => { const ol = el('ol', 'cg-list'); for (const s of here.slice(-SHOW)) ol.append(sceneLi(s, false, true)); return ol; }, here.length <= 3));
    ex.append(sec);
  }
  function redraw() {
    const c = document.getElementById('card'); if (!c || c.hidden || !remembered) return;
    if (remembered.kind === 'person') person(remembered.name); else decorate(remembered.el, remembered.title);
  }
  function setOn(v) {
    try { window.LocalStore?.set(KEY, v ? '1' : '0'); } catch (e) { /* private window */ }
    if (v) post({ type: 'eden-map:media-ask' }); redraw();
  }
  const css = `
  #card .cg-sec,#card .cg-scenes{margin-top:var(--sp-4,8px);border-top:1px solid var(--line,rgba(255,255,255,.12))}
  #card .cg-sec h3,#card .cg-scenes h4{margin:var(--sp-3,6px) 0;font:600 var(--fs-small,13px)/1.4 var(--font-ui,system-ui);color:var(--ink-2,inherit)}
  #card .cg-cat>summary{display:flex;align-items:center;gap:6px;min-height:36px;cursor:pointer;font-size:var(--fs-small,13px);color:var(--ink-2,inherit)}
  #card .cg-cat>summary small{color:var(--muted,inherit);font-size:var(--fs-micro,11px)}
  #card .cg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:var(--sp-2,4px);padding:var(--sp-2,4px) 0}
  #card .cg-grid .cg-th{width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:var(--r-s,4px);background:var(--surface-2,rgba(255,255,255,.06))}
  #card .cg-list{list-style:none;margin:0;padding:0}
  #card .cg-row{display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-2,4px) var(--sp-4,8px);padding:var(--sp-2,4px) 0;border-bottom:1px solid var(--line,rgba(255,255,255,.08));font-size:var(--fs-small,13px)}
  #card .cg-row .cg-w{overflow-wrap:anywhere}
  #card .cg-row .cg-pl{order:3;flex:1 1 100%;text-align:left;background:none;border:0;padding:0;color:var(--accent,inherit);font:inherit;cursor:pointer;min-height:32px;text-decoration:underline;overflow-wrap:anywhere}
  #card .cg-row small.cg-pl{text-decoration:none;color:var(--muted,inherit)}
  #card .cg-row .cg-th{order:2;margin-left:auto;width:48px;height:64px;object-fit:cover;border-radius:var(--r-s,4px);background:var(--surface-2,rgba(255,255,255,.06))}
  @media (pointer:coarse),(max-width:640px){#card .cg-cat>summary{min-height:44px}#card .cg-row .cg-pl{min-height:44px}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  try { (window.requestIdleCallback || setTimeout)(() => post({ type: 'eden-map:media-ask' })); } catch (e) { /* no host */ }
  return { fromHost, person, decorate, setOn, get on() { return on(); }, get available() { return seen; }, get scenes() { return scenes.map(s => ({ ...s })); }, get table() { return table; }, charOf: n => charOf(table, n) };
})();
register('GalleryView', GalleryView);
export { GalleryView };
