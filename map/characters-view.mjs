// 人物栏（查看器用，v0.9.2）：卡内脚本 eden-map.js 用 tavern/characters-parse.mjs 从聊天标签和 MVU 找出人物与最新位置后发来 { items: [{name, place, floor, src, present?}], floor }。
// 本文件：落点（与玩家当前地点同一条解析链 app/place-resolver.mjs，画在哪里由 app/spot.mjs 定）、地图上的圆形头像框（同一处多人叠成一组）、事态横条里的「人物」页（列表 + 总开关 + 逐人开关）、飞过去。
// 与事态区分：事态 = 大类形状的小方块 / 图形 + 类型字；人物 = 圆形头像框 + 名字首字（或本机头像），颜色按名字哈希、避开事态大类色。
// 开关和头像只存本机 localStorage（按聊天分开）；不发请求（头像是用户自己给的 data: / http 地址时由浏览器加载那张图）。
// 查看器核心的状态与工具从 app/*.mjs 显式 import（arch-v2 §6 第 7 步）；别的外挂经 app/plugins.mjs 的 P 取（可能没加载，调用处带守卫）。
import { mapRegistry, aspect, currentMapId, currentMapData, pendingFocus, setPendingFocus, osdViewer } from './app/state.mjs';
import { packOverlay } from './app/current-pack.mjs';
import { everyone, groupLabel, groupList, paneModel } from './core/people.mjs';   // 人物页的分组：包声明几组就画几节（S4-4）
import { $, afterLoadIdle, esc } from './app/dom-helpers.mjs';
import { getJSON } from './app/json-cache.mjs';
import { declutter, leanBg } from './app/sharpness-tiers.mjs';
import { LANG, translateName } from './app/i18n.mjs';
import { go } from './app/map-switch.mjs';
import { closeCard, placeN, showCard, trackEl, untrack } from './app/markers.mjs';
import { drawnAt, hereRes, setUserMoved, userMoved } from './app/locate.mjs';
import { packStorage, chatId } from './app/extension-api.mjs';
import { plugins, register } from './app/plugins.mjs';
import * as TCCvd from './app/color-vision-mode.mjs';
import { uiTextOr } from './app/text-lookup.mjs';
import { SettingsApi } from './app/settings.mjs';
import { portraitFor, viewerUrlOk } from './core/portrait-lookup.mjs';
import { RT } from './app/nodes-runtime.mjs';
import { provideTab, saveTabSeen, tabContext, tabSeen } from './app/tabs.mjs';   // the drawer's tab registry (S6-1)
import { peopleSections } from './core/entities.mjs';   // the present group's sections by level (K-R73)
const CharactersView = (() => {
  let portraits = {}, rosters = null, groups = null, rep = null, stageOrder = null, items = [], floor = 0, CM = null, prefs = { show: true, off: [] }, avatars = {}, els = [], flyName = null;
  const mod = () => CM ? Promise.resolve(CM) : import(new URL('tavern/characters-parse.mjs', document.baseURI).href).then(m => { CM = m; loadPrefs(); return m; }).catch(() => null);   // 首屏不取：页面 load 后空闲时预取，或第一次用到（有人物 / 改头像）时取；取到就读本机偏好
  const chat = () => (typeof chatId === 'string' ? chatId : '');
  const store = () => (typeof packStorage !== 'undefined' ? packStorage : null);
  function loadPrefs() { if (!CM) return; prefs = CM.readCharPrefs(store(), chat()); avatars = CM.readAvatars(store(), chat()); }
  const savePrefs = () => CM?.writeCharPrefs(store(), chat(), prefs);
  // 色觉模式（E7）：颜色只用来分组、不代表状态，但换一套色相表更容易在红绿 / 蓝黄色弱下彼此分开；每个框本来就有首字/头像做第二线索
  const color = n => CM ? CM.colorOf(n, TCCvd.charHues() || undefined) : '#888';
  const ini = n => CM ? CM.initials(n) : String(n)[0];
  // 头像：本机设置的优先；否则「使用原作头像」开着时用卡自带的立绘表（宿主按包的规则放行的地址，懒加载，失败退回首字）
  const PK_ = 'edenMapPortraits', portOn = () => { try { const v = LocalStore.get(PK_); return v == null ? !(typeof leanBg === 'function' && leanBg()) : v === '1'; } catch (e) { return true; } };
  // 设置「人物与物品」里的「使用原作头像」一行（原先挂在自定义栏里）：读到了头像才出现；开关本身仍存本机（PK_）
  function portRow() {
    let box = document.getElementById('chPortBox');
    if (!box) { box = document.createElement('div'); box.id = 'chPortBox'; SettingsApi.registerSection('people', box, { order: 40 }); box.addEventListener('change', e => { if (e.target.id === 'optPort') api.setPortOn(e.target.checked); }); }
    box.innerHTML = Object.values(portraits).some(okUrl) ? `<label class="row"><span>${esc(uiTextOr('ch.port', '使用原作头像'))}</span><input type="checkbox" role="switch" id="optPort" ${portOn() ? 'checked' : ''}></label><small>${esc(uiTextOr('ch.port_hint', '人物没有自己设的头像时，用卡里自带的立绘（按需加载）；省流时默认关。取不到的人显示名字首字（不是故障，可以自己设头像）'))}</small>` : '';
  }
  const okUrl = viewerUrlOk;   // 地址放行由宿主按包的 avatar 规则做过（K-R43）；这里只认图片地址的形状（I-22：以前这里只放作者 CDN，别的图床的立绘被丢）
  // 状态栏里玩家自己设的头像（卡的状态栏存在同源 localStorage：eden_custom_portraits = { 名: 地址 }、eden_portrait_<名> = data URL），只读
  const barAv = n => { try { const short = String(n).split(/[·・]/)[0]; for (const k of [n, short]) { const d = localStorage.getItem('eden_portrait_' + k); if (d && d.startsWith('data:image/')) return d; }
    const m = JSON.parse(localStorage.getItem('eden_custom_portraits') || '{}'); const u = m[n] || m[short]; return typeof u === 'string' && /^(https:|data:image\/)/.test(u) ? u : ''; } catch (e) { return ''; } };
  const cardPort = n => portraitFor(portraits, n);
  const avOf = n => avatars[n] || barAv(n) || (portOn() ? cardPort(n) : '');
  const avImg = n => { const u = avOf(n); return u ? `<img alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${esc(u)}" data-i="${esc(ini(n))}" onerror="this.replaceWith(this.dataset.i)">` : ''; };
  const visible = c => prefs.show && !prefs.off.includes(c.name);
  // v0.9.3：显示名（自定义，custom.js）与位置来源：MVU（在场人物的位置字段）/ 标签（聊天里的人物标签）/ 同处（在场但没写位置，默认和你同处）
  const dn = n => (typeof plugins.CustomNamesView !== 'undefined' ? plugins.CustomNamesView.name(n) : n);
  const srcOf = c => c.src === 'mvu' ? uiTextOr('ch.src_mvu', 'MVU') : c.src === 'tag' ? uiTextOr('ch.src_tag', '标签') : c.src === 'routine' ? uiTextOr('ch.src_routine', '日程') : uiTextOr('ch.src_infer', '同处');
  // 2026-09-28 待查 1/2/6：开局前不按「和你在一起」显示；在场表久未变降级为未知；「同处」加悬停说明来源和楼层
  const when = c => c.prelude ? uiTextOr('ch.pre', '开局前 · 卡初始值') : c.stale ? uiTextOr('ch.stale', '未知 · 在场表 {n} 楼未变', { n: c.stale }) : c.present ? uiTextOr('ch.with_you', '和你在一起') : uiTextOr('ev.floor', '第 {n} 楼', { n: c.floor });
  const lastSeen = c => c.prelude ? uiTextOr('ch.pre', '开局前 · 卡初始值') : c.stale ? uiTextOr('ch.stale', '未知 · 在场表 {n} 楼未变', { n: c.stale }) : c.present ? uiTextOr('ch.with_you', '和你在一起') : uiTextOr('ch.floor', '聊天第 {n} 楼', { n: c.floor });
  const srcTip = c => {
    if (c.src !== 'infer' && !c.stale) return '';
    const s = c.prelude ? uiTextOr('ch.infer_pre', '剧情还没开始：这是卡的初始在场表，开始后按聊天标签 / MVU 更新')
      : c.stale ? uiTextOr('ch.infer_stale', '在场表 {n} 楼没变，不再按同处显示；上次明确位置在第 {f} 楼', { n: c.stale, f: c.floor })
      : uiTextOr('ch.infer_hint', '人在在场表里但没写位置，默认和你同处');
    return ` title="${esc(s)}"`;
  };

  // 地点 → { map, nx, ny } / { map }（只知道层）/ null
  const markerXY = async (map, id) => { const m = mapRegistry.maps[map]; if (!m?.data) return null; const d = map === currentMapId ? currentMapData : await getJSON(m.data);
    const k = d?.markers?.find(x => x.id === id); return k ? { nx: k.ax ?? k.nx, ny: k.ay ?? k.ny } : null; };
  async function where(c) {
    const d = drawnAt(hereRes(c.place), c.place); if (!d?.marker) return d;   // the node tree places it (app/spot.mjs); only a landmark needs its point from the map's data
    const p = await markerXY(d.map, d.marker); return p ? { map: d.map, marker: d.marker, ...p } : { map: d.map };   // marker kept: A11 (D42) uses it to let the avatar replace the pin
  }

  async function set(d) { await mod(); if (!Array.isArray(d.items)) return; const hadP = Object.values(portraits).some(okUrl); items = d.items.slice(0, 60); rosters = d.rosters || null; groups = Array.isArray(d.groups) ? d.groups : null; rep = Number.isFinite(d.rep) ? d.rep : null; stageOrder = Array.isArray(d.stageOrder) ? d.stageOrder : null; portraits = d.portraits && typeof d.portraits === 'object' ? d.portraits : {}; if (hadP !== Object.values(portraits).some(okUrl)) portRow(); floor = d.floor || 0; loadPrefs(); await render(); bar(); if (flyName && currentMapId) fly(flyName); }
  let seq = 0, pinEls = [];   // A11 (D42): the pins whose spots the avatar stack took over (class removed again on the next render)
  async function render() {
    for (const el of els) { if (typeof untrack === 'function') untrack(el); osdViewer?.removeOverlay(el); } els = [];
    for (const e of pinEls) e.classList.remove('replaced'); pinEls = [];
    plugins.EstateShell?.people();   // a 3D building open: the same people, drawn in its rooms (S7-3; it sends only when the list changed)
    if (!osdViewer || !currentMapId || !osdViewer.world.getItemCount() || mapRegistry.maps[currentMapId]?.kind === 'estate' || !CM) return;
    const my = ++seq, groups = new Map();
    for (const c of items.filter(visible)) { const w = await where(c); if (my !== seq) return; if (!w || w.map !== currentMapId || w.nx == null) continue;
      const k = w.nx.toFixed(3) + ',' + w.ny.toFixed(3); if (!groups.has(k)) groups.set(k, { w, list: [] }); groups.get(k).list.push(c); }
    for (const { w, list } of groups.values()) {
      // A11 (D42): one marker per spot — where the group sits on a landmark, its avatar replaces the pin (initials when there is no photo, a count for several people);
      // the current-location pin stays (the here ring is its own signal)
      if (w.marker) { const pin = document.querySelector(`.mk[data-mid="${CSS.escape(w.marker)}"]`);
        if (pin && !pin.classList.contains('here') && !pin.classList.contains('replaced')) { pin.classList.add('replaced'); pinEls.push(pin); } }
      const el = document.createElement('div'); el.className = 'chm' + (w.approx ? ' approx' : ''); el.dataset.chars = list.map(c => c.name).join('|');
      el.innerHTML = '<span class="chg">' + list.slice(0, 3).map((c, i) => `<i class="av" style="--c:${color(c.name)};z-index:${3 - i}">${avImg(c.name) || esc(ini(c.name))}</i>`).join('')
        + (list.length > 3 ? `<i class="av more">+${list.length - 3}</i>` : '') + `<b>${esc(dn(list[0].name))}${list.length > 1 ? ' ' + esc(uiTextOr('ch.more', '等 {n} 人', { n: list.length })) : ''}</b>` + '</span>';
      const label = list.map(c => `${dn(c.name)}（${c.place}）`).join('、');
      if (typeof trackEl === 'function') trackEl(el, () => card(list), uiTextOr('ch.aria', '人物：{s}', { s: label }));
      placeN(el, w.nx, w.ny, OpenSeadragon.Placement.CENTER); els.push(el);
    }
    if (typeof declutter === 'function') declutter();
  }
  function card(list) {
    showCard(null, list.map(c => dn(c.name)).join('、'), '', '', list[0].place);
    if (typeof plugins.ComposeView !== 'undefined') plugins.ComposeView.attach({ go: list[0].place || '', ask: list.length === 1 ? dn(list[0].name) : '' });   // v0.9.6 地图 → 聊天
    const tg = document.querySelector('#card .tag'); tg.textContent = uiTextOr('ch.tag', '人物'); tg.className = 'tag data'; tg.style.background = color(list[0].name);
    const sv = document.querySelector('#card .src'); delete sv.dataset.note;
    const note = c => { const e = typeof plugins.CustomNamesView !== 'undefined' && plugins.CustomNamesView.entry(c.name); return e?.用途 ? ` · ${e.用途}` : ''; };
    if (list.length === 1) { const c = list[0]; const id = identity(c.name), it = rosterItem(c.name);
      sv.innerHTML = `<dl class="fields">${id ? `<dt>${esc(uiTextOr('ch.identity', '身份'))}</dt><dd>${esc(id)}</dd>` : ''}${it?.tier ? `<dt>${esc(uiTextOr('ch.tier', '战力'))}</dt><dd><span class="chtier">${esc(it.tier)}</span></dd>` : ''}${c.roster ? (c.place ? `<dt>${esc(uiTextOr('ev.k_place', '地点'))}</dt><dd>${esc(c.place)}</dd>` : '') : `<dt>${esc(uiTextOr('ch.last', '最后出现'))}</dt><dd>${esc(lastSeen(c))}</dd><dt>${esc(uiTextOr('ch.src', '来源'))}</dt><dd>${esc(srcOf(c) + note(c))}</dd>`}</dl>${moreHtml(it, id)}`;
      document.getElementById('card').classList.toggle('person2', !!sv.querySelector('details.chmore'));   // 桌面：有「更多资料」时人物卡两栏
      sv.querySelector('details.chmore')?.addEventListener('toggle', e => { try { LocalStore.set(MO_OPEN, e.target.open ? '1' : '0'); } catch (x) {} });
      if (typeof plugins.GalleryView !== 'undefined') plugins.GalleryView.person(c.name);   // K-R106: the card script's own pictures and this person's scenes
      editAct(c.name);   // PLACE-1b：人物卡也用那一个编辑器（用途对人物不显示）
      return; }
    sv.innerHTML = `<dl class="fields">${list.map(c => `<dt>${esc(dn(c.name))}</dt><dd>${esc(when(c) + ' · ' + srcOf(c))}</dd>`).join('')}</dl>`;
  }
  // 飞过去：在别的图上就先切图，打开后再平移；只知道层的，切到那一层就好
  async function fly(name) {
    const c = items.find(x => x.name === name); flyName = null; if (!c) return;
    if (plugins.EstateShell?.holds?.(name)) { card([c]); return; }   // a person drawn in the open 3D building: the card opens here, no flight to the 2D map
    const w = await where(c); if (!w) { card([c]); return; }
    if (w.map !== currentMapId) { flyName = name; if (typeof closeCard === 'function') closeCard(); setPendingFocus(null); go(w.map); return; }
    if (w.nx == null) { card([c]); return; }
    setUserMoved(true); const vp = osdViewer.viewport, b = vp.getBounds(true), wd = Math.min(b.width, .25), h = wd * b.height / b.width;
    vp.fitBounds(new OpenSeadragon.Rect(w.nx - wd / 2, w.ny * aspect - h / 2, wd, h));
    setTimeout(() => card(items.filter(x => x.place === c.place && visible(x)).length ? items.filter(x => x.place === c.place) : [c]), 650);
  }
  /** 名册里的人（不一定在图上）开人物卡 */
  function cardOf(name) { const c = items.find(x => x.name === name); if (c) return fly(name); if (!rosterItem(name)) return; card([{ name, place: '', floor: 0, roster: true }]); }
  /** the person's card where the viewer already is (the 3D view's chip: no flying to the 2D map) */
  function cardHere(name) { const c = items.find(x => x.name === name) || (rosterItem(name) ? { name, place: '', floor: 0, roster: true } : null); if (c) card([c]); }
  function afterOpen() { render().then(() => { if (flyName) fly(flyName); }); }
  /** PLACE-1b：人物卡上的「编辑」——与地点同一个编辑器（app/place-editor.mjs），用途字段对人物不显示 */
  function editAct(name) {
    const ex = document.querySelector('#card .extra'); if (!ex) return;
    ex.querySelectorAll('.pr-acts').forEach(n => n.remove());
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = uiTextOr('pr.edit', '编辑');
    b.addEventListener('click', () => import('./app/place-editor.mjs').then(m => m.openPlaceEditor(name, { person: true })));
    const box = document.createElement('div'); box.className = 'pr-acts'; box.append(b); ex.prepend(box);
  }

  // ---------- 横条里的「人物」页 ----------
  const glist = () => groupList({ groups, rosters, declared: packOverlay?.entities?.groups });   // 分组：宿主发来的 groups 优先；旧宿主只发 rosters 时按包声明的组
  const glabel = g => groupLabel(g, LANG, k => window.I18N.t(k));
  const count = () => everyone(glist(), items).size;   // fix3：同一人只算一次
  function bar() { if (typeof plugins.EventsView !== 'undefined') plugins.EventsView.renderBar?.(); }
  // 人物页签的标签与「新」角标（原 events-view renderBar 里的同一段：同样的 html、{ n, fresh }、「看过」规则，经 tabSeen / saveTabSeen）
  function chLabel() {
    const S = window.ViewerDrawer, chN = count(), SEEN = tabSeen(), chNames = chN ? items.map(c => c.name || c.名字 || '').filter(Boolean) : [];
    if (!SEEN.ch) { SEEN.ch = new Set(chNames); saveTabSeen(); }
    if (S.open && S.tab === 'ch' && chNames.some(n => !SEEN.ch.has(n))) { chNames.forEach(n => SEEN.ch.add(n)); saveTabSeen(); }
    const chFresh = chNames.filter(n => !SEEN.ch.has(n)).length;
    return { html: `<i class="shp sh-circle" aria-hidden="true"></i>${esc(uiTextOr('ch.tab', '人物'))} <em>${chN}</em>${chFresh ? `<b class="nd" aria-hidden="true"></b>` : ''}`, short: { n: chN, fresh: chFresh } };
  }
  // v0.9.5 名册（只读，卡内脚本按表的位置发现）：身份、阶段；分组可折叠（折叠状态存本机）
  const identity = n => { for (const g of glist()) { const it = g.items.find(i => i.name === n); if (it?.identity) return it.identity; } return ''; };
  const rosterItem = n => { for (const g of glist()) { const it = g.items.find(i => i.name === n); if (it) return it; } return null; };
  // v0.9.6（E13 其余字段 / E16）：人物卡「更多资料」——代号、社会身份（公开身份）、身高 / 体重、知情度、饰物；只读，字段名走变量映射（可关闭）；设置「人物卡显示更多资料」（本机 edenMapCharMore，默认开）
  const MO_KEY = 'edenMapCharMore', MO_OPEN = 'edenMapCharMoreOpen';
  const moreOn = () => { try { return LocalStore.get(MO_KEY) !== '0'; } catch (e) { return true; } };
  const moreOpen = () => { try { return LocalStore.get(MO_OPEN) === '1'; } catch (e) { return false; } };
  // 包给槽位字段起了名字（overlay entities.fields 的 label / i18n）就用包的名字；没给就走词典 ch.m_*（包文案可换）
  const slotLabel = slot => { const f = (packOverlay?.entities?.fields || []).find(x => x?.['x-slot'] === slot); return f?.i18n?.[LANG]?.label || (LANG === 'zh' ? f?.label : '') || ''; };
  function moreRows(it, id = '') {
    const m = it?.more; if (!m) return [];
    const r = [], hw = [m.height != null && m.height !== '' ? (typeof m.height === 'number' ? m.height + ' cm' : m.height) : '', m.weight != null && m.weight !== '' ? (typeof m.weight === 'number' ? m.weight + ' kg' : m.weight) : ''].filter(Boolean).join(' · ');
    if (m.code) r.push([uiTextOr('ch.m_code', '代号'), m.code]);
    if (m.social && m.social !== id) r.push([uiTextOr('ch.m_social', '社会身份'), m.social]);
    if (hw) r.push([uiTextOr('ch.m_hw', '身高 / 体重'), hw]);
    if (m.known != null) r.push([slotLabel('known') || uiTextOr('ch.m_known', '知情度'), m.known === true || m.known === '是' || m.known === 'true' ? uiTextOr('ch.m_yes', '知情') : m.known === false || m.known === '否' || m.known === 'false' ? uiTextOr('ch.m_no', '不知情') : String(m.known)]);
    if (m.accessory) r.push([uiTextOr('ch.m_acc', '饰物'), m.accessory]);
    return r;
  }
  const moreHtml = (it, id) => { if (!moreOn()) return ''; const r = moreRows(it, id); if (!r.length) return '';
    return `<details class="chmore" ${moreOpen() ? 'open' : ''}><summary>${esc(uiTextOr('ch.more_h', '更多资料'))}</summary><dl class="fields">${r.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></details>`; };
  const GK = 'edenMapChGroups', closed = (() => { try { return new Set(JSON.parse(LocalStore.get(GK) || '[]')); } catch (e) { return new Set(); } })();
  const stageChip = s => { if (!s) return ''; const i = stageOrder ? stageOrder.indexOf(s) : -1, n = stageOrder?.length || 0;
    return `<span class="chstage" ${i >= 0 ? `style="--p:${(i + 1) / n}" title="${esc(uiTextOr('ch.stage_of', '第 {i} / {n} 步', { i: i + 1, n }))}"` : ''}>${i >= 0 ? `<i aria-hidden="true">${Array.from({ length: n }, (_, k) => `<b class="${k <= i ? 'on' : ''}"></b>`).join('')}</i>` : ''}${esc(s)}</span>`; };
  function row(c) {
    const id = identity(c.name), it = rosterItem(c.name);
    return `<li><button type="button" class="chgo" data-n="${esc(c.name)}"><i class="av" style="--c:${color(c.name)}">${avImg(c.name) || esc(ini(c.name))}${c.present ? `<s class="avb" title="${esc(uiTextOr('ch.with_you', '和你在一起'))}"></s>` : ''}</i><b>${esc(dn(c.name))}</b><em><span class="chsrc src-${esc(c.src || 'infer')}"${srcTip(c)}>${esc(srcOf(c))}</span> ${esc(when(c))}${it ? stageChip(it.stage) + statChip(it) + tierChip(it) : ''}</em><small>${esc((id ? id + ' · ' : '') + c.place)}</small></button>`
      + `<label class="chsw"><input type="checkbox" role="switch" data-n="${esc(c.name)}" aria-label="${esc(uiTextOr('ch.toggle_one', '在地图上显示 {n}', { n: c.name }))}" ${prefs.off.includes(c.name) ? '' : 'checked'} ${prefs.show ? '' : 'disabled'}></label></li>`;
  }
  // v0.9.6（E2 / E13）：名册行的等级、核心数值与档位名（字段名由变量映射定，只读）；设置「人物栏显示数值」关掉就不显示（本机 edenMapCharStats，默认开）
  const statsOn = () => { try { return LocalStore.get('edenMapCharStats') !== '0'; } catch (e) { return true; } };
  const statChip = it => { if (!statsOn() || (!it.grade && it.core == null)) return '';
    const t = [it.grade, it.core != null ? `${it.coreStage ? it.coreStage + ' ' : ''}${it.core}` : ''].filter(Boolean).join(' · ');
    return `<span class="chstat" title="${esc([it.grade ? uiTextOr('ch.grade', '等级') + ' ' + it.grade : '', it.core != null ? `${it.coreKey || ''} ${it.core}` : ''].filter(Boolean).join(' · '))}">${esc(t)}</span>`; };
  // v0.9.6 E1 战力小签（只读，卡里写明才有）
  const tierChip = it => it?.tier ? `<span class="chtier" title="${esc(uiTextOr('ch.tier', '战力'))}">${esc(it.tier)}</span>` : '';
  const badgesOf = it => { const h = stageChip(it.stage) + statChip(it) + tierChip(it); return h ? `<em>${h}</em>` : ''; };   // N10 (16): no badges, no empty badge row
  function rosterRow(it) {
    const c = items.find(x => x.name === it.name);
    const body = `<i class="av" style="--c:${color(it.name)}">${avImg(it.name) || esc(ini(it.name))}</i><b>${esc(dn(it.name))}</b>${badgesOf(it)}<small>${esc(it.identity || '')}${c ? ' · ' + esc(c.place) : ''}</small>`;
    return c ? `<li><button type="button" class="chgo" data-n="${esc(it.name)}">${body}</button></li>` : `<li><button type="button" class="chgo chro" data-card="${esc(it.name)}">${body}</button></li>`;   // v0.9.6：不在图上的名册成员也能开人物卡
  }
  function group(id, label, n, inner, raw) {   // raw: the body is already markup (the present group's sections), not a list of rows
    return `<details class="chgrp" data-g="${esc(id)}" ${closed.has(id) ? '' : 'open'}><summary>${esc(label)} <small>${n}</small></summary>${raw ? inner : `<ul>${inner}</ul>`}</details>`;
  }
  // 在场组按层级分节（K-R73）：宏观 = 全部展开，微观 = 只有「和你在一起」展开；用户开合记在 closed 里（sec:<键> = 用户合上，sec+:<键> = 用户展开）
  const secOpen = (key, mode) => closed.has('sec+:' + key) ? true : closed.has('sec:' + key) ? false : mode === 'macro' ? true : key === 'here';
  const nodeName = id => { const n = RT?.tree.get(id); return n?.i18n?.[LANG]?.name || translateName(n?.name ?? id); };
  const secLabel = s => s.key === 'here' ? uiTextOr('ch.with_you', '和你在一起') : s.key.startsWith('n:') ? nodeName(s.node) : s.key === 'map' ? uiTextOr('ch.sec_map', '本图其他位置') : s.key === 'else' ? uiTextOr('ch.sec_else', '其他地图') : uiTextOr('ch.sec_unknown', '位置未知');
  function sections(extra, ctx) {
    const here = hereRes(String($('#here')?.value || '').replace('{{user}}', ''))?.node ?? null;
    const people = items.map(c => ({ node: hereRes(c.place)?.node ?? null, present: !!c.present, row: c, html: row(c) })).concat(extra.map(it => ({ node: null, present: true, row: it, html: rosterRow(it) })));
    const secs = peopleSections({ people, tree: RT?.tree, owner: ctx.owner, here, mode: ctx.mode });
    return secs.length ? `<div class="chsecs">${secs.map(s => `<details class="chsec" data-sec="${esc(s.key)}" ${secOpen(s.key, ctx.mode) ? 'open' : ''}><summary>${esc(secLabel(s))} <small>${s.rows.length}</small></summary><ul>${s.rows.map(r => r.html).join('')}</ul></details>`).join('')}</div>` : '';
  }
  function pane(el) {
    // fix3（用户 2026-09-28）：同一人既在场又在名册里时只列在「在场」一次（在场行带名册的阶段 / 数值），名册组只列不在场的，组名后注明「另 N 人在场」
    // S4-4：分节来自包声明的名册组（core/people.mjs），不再是写死的在场 / 成员 / 目标三节
    const M = paneModel(glist(), items, glabel), extra = M.present.extra, secs = sections(extra, tabContext());
    const also = n => n ? ' · ' + uiTextOr('ch.also_here', '另 {n} 人在场', { n }) : '';
    const ck = typeof plugins.CustomNamesView !== 'undefined' ? plugins.CustomNamesView.clock : null, of = typeof plugins.CustomNamesView !== 'undefined' ? plugins.CustomNamesView.outfit : null;
    // fix3：还没选开局（聊天只有开场白那一楼）时，人物 / 时间 / 地点都来自卡的 MVU 初始值，明确标出来
    const pre = ck?.pre ? `<p class="chpre" role="note">${esc(uiTextOr('ch.pre', '开局前 · 卡初始值'))}<small>${esc(uiTextOr('ch.pre_tip', '还没选开局：下面是卡的 MVU 初始变量，选了开局后按剧情更新'))}</small></p>` : '';
    // fix3（用户 2026-09-28）：着装属于人（主角），放在人物页顶部「你」这一行，不再挂在地点卡上
    const me = of?.text ? `<div class="chme"><i class="av me" aria-hidden="true">${esc(uiTextOr('ch.me_i', '你'))}</i><b>${esc(uiTextOr('ch.me', '你（主角）'))}</b><small title="${esc(of.items ? Object.entries(of.items).map(([k, v]) => `${k}：${v}`).join('\n') : of.text)}">${esc(uiTextOr('cu.outfit', '着装：{s}', { s: of.text }))}</small></div>` : '';
    el.innerHTML = pre + me + `<label class="tg chall"><span>${esc(uiTextOr('ch.show', '在地图上显示人物'))}</span><input type="checkbox" role="switch" ${prefs.show ? 'checked' : ''}></label><small class="chring">${esc(uiTextOr('ch.ring_note', '头像边框的颜色只用来区分不同的人，不代表阵营或身份。'))}</small><div class="chgrps">`
      + (secs ? group(M.present.id, M.present.label, items.length + extra.length, secs, true) : group(M.present.id, M.present.label, items.length + extra.length, items.map(row).join('') + extra.map(rosterRow).join('')))
      + M.others.map(g => group(g.id, g.label, g.rest.length + also(g.also), g.rest.map(rosterRow).join(''))).join('') + '</div>';
    for (const d of el.querySelectorAll('details.chgrp')) d.addEventListener('toggle', () => { d.open ? closed.delete(d.dataset.g) : closed.add(d.dataset.g); try { LocalStore.set(GK, JSON.stringify([...closed])); } catch (e) {} });
    for (const d of el.querySelectorAll('details.chsec')) { let was = d.open; d.addEventListener('toggle', () => {   // a toggle event that only repeats the state the markup was drawn with is not the user's choice
      if (d.open === was) return; was = d.open; const k = d.dataset.sec; closed.delete(d.open ? 'sec:' + k : 'sec+:' + k); closed.add(d.open ? 'sec+:' + k : 'sec:' + k);
      try { LocalStore.set(GK, JSON.stringify([...closed])); } catch (e) {} }); }
  }
  function onPane(e) {
    const inp = e.target.closest('input[type=checkbox]');
    if (inp && e.type === 'change') {
      if (inp.closest('.chall')) prefs.show = inp.checked;
      else { const n = inp.dataset.n; prefs.off = inp.checked ? prefs.off.filter(x => x !== n) : [...prefs.off, n]; }
      savePrefs(); render(); bar(); return;
    }
    const b = e.type === 'click' && e.target.closest('button.chgo'); if (b) { if (typeof plugins.EventsView !== 'undefined') plugins.EventsView.collapse(); if (b.dataset.card) cardOf(b.dataset.card); else fly(b.dataset.n); }
  }
  // 本机头像（EdenMap.setAvatar / removeAvatar 转到这里）
  // data URL 头像先压到 160 px 的 webp / jpeg（和状态栏共用 localStorage 额度，通读 R3）
  async function shrink(src) {
    if (typeof src !== 'string' || !src.startsWith('data:image/') || src.length < 40000) return src;
    try { const img = new Image(); img.src = src; await img.decode(); const k = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const w = c.toDataURL('image/webp', .82); return w.startsWith('data:image/webp') ? w : c.toDataURL('image/jpeg', .82); } catch (e) { return src; }
  }
  async function setAvatar(name, src) { src = await shrink(src); const C = await mod(); if (!C || !store()) return false;
    const r = C.setAvatarEx ? C.setAvatarEx(store(), chat(), name, src) : { ok: C.setAvatar(store(), chat(), name, src) }, ok = r.ok;
    if (!ok && C.warnText && (r.reason === 'cap' || r.reason === 'quota') && typeof plugins.CustomNamesView !== 'undefined') plugins.CustomNamesView.toast([C.warnText(r.reason, typeof LANG !== 'undefined' && LANG === 'en')]);   // A-13：满了要说，不悄悄失败
    if (ok) { loadPrefs(); render(); bar(); } return ok; }
  async function removeAvatar(name) { const C = await mod(); const ok = !!C && !!store() && C.removeAvatar(store(), chat(), name); if (ok) { loadPrefs(); render(); bar(); } return ok; }
  function chatChanged() { loadPrefs(); render(); bar(); }

  const css = `
  .mk.replaced{pointer-events:none}   /* A11 (D42): the avatar stack takes the spot; the pin and its label stay out of the way */
  .mk.replaced .mki{visibility:hidden}
  .chm{position:relative;width:0;height:0;overflow:visible;pointer-events:auto;cursor:pointer;z-index:calc(var(--zv-markers) + 1)}
  .chm .chg{position:absolute;left:12px;top:-16px;display:flex;flex-wrap:nowrap;width:max-content;align-items:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,.7))}
  /* fix3（用户 2026-09-28）：头像只留一圈人物色描边（2px），不再白边 + 外圈双层；状态（和你在一起）用右下角小圆点单独表示 */
  .chm .av,#evbar .chpane .av{--c:#888;position:relative;flex:none;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;box-sizing:border-box;border:2px solid var(--c);box-shadow:none;background:var(--c);color:#fff;
    font:700 14px/1 var(--font-ui,sans-serif);font-style:normal;text-shadow:0 1px 1px rgba(0,0,0,.45)}
  .chm .av img,#evbar .chpane .av img{border-radius:50%}
  #evbar .chpane .av{width:40px;height:40px;font-size:16px}
  #evbar .chpane .av .avb{position:absolute;right:-2px;bottom:-2px;width:12px;height:12px;border-radius:50%;background:var(--accent);border:2px solid var(--surface,#111);box-sizing:border-box}
  #evbar .chpane .av.me{--c:var(--surface-2,#333);color:var(--ink);border-color:var(--line-strong,rgba(255,255,255,.3))}
  #evbar .chpane .chme{display:grid;grid-template-columns:40px 1fr;gap:0 var(--sp-4,8px);align-items:center;padding:var(--sp-3,6px);border-top:1px solid var(--line)}
  #evbar .chpane .chme .av{grid-row:1/3}#evbar .chpane .chme b{font-weight:600}
  #evbar .chpane .chme small{color:var(--ink-2);font-size:var(--fs-micro,11px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #evbar .chpane .chpre{margin:var(--sp-3,6px);padding:var(--sp-3,6px) var(--sp-4,8px);border:1px dashed var(--line-strong,rgba(255,255,255,.3));border-radius:var(--r-m,8px);font-size:var(--fs-small,12px);font-weight:600;color:var(--ink)}
  #evbar .chpane .chpre small{display:block;font-weight:400;color:var(--muted);font-size:var(--fs-micro,11px)}
  .chm.approx .av:first-child{outline:1px dashed rgba(255,255,255,.7);outline-offset:3px}
  .chm .av+.av{margin-left:-10px;box-shadow:-1px 0 0 1px rgba(0,0,0,.35)}.chm .av.more{--c:#3a3f46;font-size:var(--fs-micro,11px)}
  .chm .av img,#evbar .chpane .av img{width:100%;height:100%;object-fit:cover}
  .chm b{margin-left:5px;font:600 var(--fs-micro,11px)/1.3 var(--font-ui,sans-serif);color:var(--map-label-ink,#fff);background:var(--map-label-bg,rgba(8,10,14,.8));padding:1px 7px;border-radius:var(--r-pill,999px);white-space:nowrap;max-width:12em;overflow:hidden;text-overflow:ellipsis}
  .chm.lhide b{visibility:hidden} body.far .chm b{display:none} body.nomarkers .chm{display:none}
  .chm:focus-visible .av{outline:2px solid var(--focus,#63b4be);outline-offset:3px}
  @media (pointer:coarse),(max-width:640px){.chm::before{content:'';position:absolute;left:-9px;top:50%;width:44px;height:44px;margin-top:-22px}}
  #evbar .chpane{padding:0 var(--sp-3,6px) var(--sp-3,6px)}
  #evbar .chpane .chall{padding:0 12px 0 var(--sp-3,6px);border-top:1px solid var(--line)}
  #evbar .chpane .chring{display:block;padding:0 var(--sp-3,6px) var(--sp-3,6px);color:var(--muted);font-size:var(--fs-micro,11px);line-height:1.45}
  #evbar .chpane .chgrps{overflow:visible}
  #evbar .chpane ul{list-style:none;margin:0;padding:0}
  #evbar .chpane summary{display:flex;align-items:center;gap:6px;min-height:40px;padding:0 var(--sp-3,6px);cursor:pointer;font-size:var(--fs-small,12px);font-weight:600;color:var(--ink-2);border-top:1px solid var(--line)}
  #evbar .chpane summary small{color:var(--muted);font-weight:400;font-size:var(--fs-micro,11px)}
  #evbar .chpane summary{list-style:none}#evbar .chpane summary::-webkit-details-marker{display:none}#evbar .chpane summary::before{content:'';width:6px;height:6px;border:solid var(--muted);border-width:0 1.5px 1.5px 0;transform:rotate(-45deg);margin:0 4px 0 2px;transition:transform var(--dur-1,120ms)}#evbar .chpane details[open]>summary::before{transform:rotate(45deg)}
  #evbar .chpane .chro{cursor:pointer}
  #evbar .chpane .chsec>summary{padding-left:var(--sp-5,12px)}
  #evbar .chpane .chsec ul{list-style:none;margin:0;padding:0}
  #card details.chmore{margin-top:var(--sp-4);border-top:1px solid var(--line)}
  #card details.chmore summary{display:flex;align-items:center;gap:6px;min-height:36px;cursor:pointer;list-style:none;font-size:var(--fs-small);color:var(--ink-2);font-weight:600}
  #card details.chmore summary::-webkit-details-marker{display:none}
  #card details.chmore summary::before{content:'';width:6px;height:6px;border:solid var(--muted);border-width:0 1.5px 1.5px 0;transform:rotate(-45deg);margin:0 4px 0 2px;transition:transform var(--dur-1,120ms)}
  #card details.chmore[open] summary::before{transform:rotate(45deg)}
  #card details.chmore dl.fields{margin-top:0}
  .chtier,#evbar .chpane .chtier{display:inline-flex;align-items:center;margin-left:4px;padding:0 6px;border:1px solid var(--accent);border-radius:var(--r-pill,999px);font-size:var(--fs-micro,11px);line-height:15px;color:var(--accent);white-space:nowrap}
  #card dd .chtier{margin-left:0}
  @media (min-width:900px) and (pointer:fine){
    #card.person2{width:560px}
    #card.person2 .src{display:grid;grid-template-columns:1fr 1fr;gap:0 var(--sp-6,16px);align-items:start}
    #card.person2 details.chmore{margin-top:var(--sp-4);border-top:0;border-left:1px solid var(--line);padding-left:var(--sp-5,12px)}
    #card.person2 details.chmore summary{min-height:28px}
  }
  @media (pointer:coarse),(max-width:640px){#card details.chmore summary{min-height:44px}}
  #evbar .chpane .chstage{display:inline-flex;align-items:center;gap:4px;padding:0 6px;border:1px solid var(--line-strong,rgba(255,255,255,.25));border-radius:var(--r-pill,999px);font-size:var(--fs-micro,11px);line-height:15px;color:var(--ink-2)}
  #evbar .chpane .chstat{display:inline-flex;align-items:center;margin-left:4px;padding:0 6px;border:1px solid var(--line-strong,rgba(255,255,255,.25));border-radius:var(--r-pill,999px);font-size:var(--fs-micro,11px);line-height:15px;color:var(--ink-2);font-variant-numeric:tabular-nums}
  #evbar .chpane .chstage i{display:inline-flex;gap:2px}#evbar .chpane .chstage i b{width:5px;height:5px;border-radius:50%;background:var(--line-strong,rgba(255,255,255,.25))}
  #evbar .chpane .chstage i b.on{background:var(--accent)}
  @media (pointer:coarse),(max-width:640px){#evbar .chpane summary{min-height:44px}}
  #evbar .chpane li{display:flex;align-items:center;gap:var(--sp-5,12px);border-top:1px solid var(--line);padding-right:12px}
  #evbar .chpane .chgo{flex:1;min-width:0;display:grid;grid-template-columns:40px 1fr auto;gap:0 var(--sp-4,8px);align-items:center;padding:var(--sp-3,6px);border-radius:var(--r-m,8px);min-height:52px}
  #evbar .chpane .chgo:hover{background:var(--surface-2)}
  #evbar .chpane .chgo .av{grid-row:1/3}
  #evbar .chpane .chgo b{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #evbar .chpane .chgo em{font-style:normal;color:var(--muted);font-size:var(--fs-micro,11px);white-space:nowrap}
  #evbar .chpane .chsrc{display:inline-block;padding:0 5px;margin-right:2px;border:1px solid var(--line-strong,rgba(255,255,255,.25));border-radius:var(--r-pill,999px);font-size:var(--fs-micro,11px);line-height:15px}
  #evbar .chpane .chsrc.src-mvu{border-color:var(--accent);color:var(--accent)}
  #evbar .chpane .chgo small{grid-column:2/-1;color:var(--muted);font-size:var(--fs-micro,11px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #evbar .chpane .chsw{flex:none;display:grid;place-items:center;min-width:44px;min-height:44px;margin:0}
  @media (pointer:coarse),(max-width:640px){#evbar .chpane .chgo{min-height:44px}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  afterLoadIdle(mod);
  provideTab('ch', { hasData: () => count() > 0, label: chLabel, render: el => pane(el) });
  TCCvd.onChange(() => afterOpen());   // 换色觉模式（E7）后头像框重新取色
  const api = { cardHere, color, portOn, setMoreOn(on) { try { LocalStore.set(MO_KEY, on ? '1' : '0'); } catch (e) {} }, cardOf, setStatsOn(on) { try { LocalStore.set('edenMapCharStats', on ? '1' : '0'); } catch (e) {} bar(); }, get statsOn() { return statsOn(); }, setPortOn(on) { try { LocalStore.set(PK_, on ? '1' : '0'); } catch (e) {} render(); bar(); }, get hasPortraits() { return Object.values(portraits).some(okUrl); }, get rep() { return rep; }, identity, set, render: afterOpen, fly, count, pane, onPane, setAvatar, removeAvatar, chatChanged, get items() { return items.map(c => ({ ...c })); }, get rows() { return items.map(c => ({ name: c.name, place: c.place, color: color(c.name), avatar: avOf(c.name), shown: visible(c) })); } };   // rows: what the 3D view draws (S7-3)
  return api;
})();
register('CharactersView', CharactersView);
export { CharactersView };
