// 天城 · 人物栏（查看器用，v0.9.2）：卡内脚本 eden-map.js 用 tavern/characters.mjs 从聊天标签和 MVU 找出人物与最新位置后发来 { items: [{name, place, floor, src, present?}], floor }。
// 本文件：落点（与玩家当前地点同一条解析链 here.mjs）、地图上的圆形头像框（同一处多人叠成一组）、事态横条里的「人物」页（列表 + 总开关 + 逐人开关）、飞过去。
// 与事态区分：事态 = 大类形状的小方块 / 图形 + 类型字；人物 = 圆形头像框 + 名字首字（或本机头像），颜色按名字哈希、避开事态大类色。
// 开关和头像只存本机 localStorage（按聊天分开）；不发请求（头像是用户自己给的 data: / http 地址时由浏览器加载那张图）。
// 查看器核心的状态与工具从 app/*.mjs 显式 import（arch-v2 §6 第 7 步）；别的外挂经 app/plugins.mjs 的 P 取（可能没加载，调用处带守卫）。
import { M, REG, aspect, cur, curData, pendingFocus, setPendingFocus, viewer } from './app/state.mjs';
import { afterLoadIdle, esc, getJSON, toImg } from './app/util.mjs';
import { declutter, leanBg } from './app/tiers.mjs';
import { LANG } from './app/i18n.mjs';
import { go } from './app/nav.mjs';
import { estateStandIn } from './app/estate.mjs';
import { closeCard, placeN, showCard, trackEl, untrack } from './app/markers.mjs';
import { hereRes, setUserMoved, userMoved } from './app/locate.mjs';
import { LS, chatId } from './app/extapi.mjs';
import { P, register } from './app/plugins.mjs';
import * as TCCvd from './app/cvd.mjs';
const TCChars = (() => {
  const T = (k, zh, v) => window.I18N.tx(k, zh, v);   // 共享 i18n 服务（viewer.html window.I18N）
  let portraits = {}, rosters = null, rep = null, stageOrder = null, items = [], floor = 0, CM = null, prefs = { show: true, off: [] }, avatars = {}, els = [], flyName = null;
  const mod = () => CM ? Promise.resolve(CM) : import(new URL('tavern/characters.mjs', document.baseURI).href).then(m => { CM = m; loadPrefs(); return m; }).catch(() => null);   // 首屏不取：页面 load 后空闲时预取，或第一次用到（有人物 / 改头像）时取；取到就读本机偏好
  const chat = () => (typeof chatId === 'string' ? chatId : '');
  const store = () => (typeof LS !== 'undefined' ? LS : null);
  function loadPrefs() { if (!CM) return; prefs = CM.readCharPrefs(store(), chat()); avatars = CM.readAvatars(store(), chat()); }
  const savePrefs = () => CM?.writeCharPrefs(store(), chat(), prefs);
  // 色觉模式（E7）：颜色只用来分组、不代表状态，但换一套色相表更容易在红绿 / 蓝黄色弱下彼此分开；每个框本来就有首字/头像做第二线索
  const color = n => CM ? CM.colorOf(n, TCCvd.charHues() || undefined) : '#888';
  const ini = n => CM ? CM.initials(n) : String(n)[0];
  // 头像：本机设置的优先；否则「使用原作头像」开着时用卡自带的立绘表（只收作者 CDN 的 /sfw/ 地址，懒加载，失败退回首字）
  const PK_ = 'edenMapPortraits', portOn = () => { try { const v = TCStore.get(PK_); return v == null ? !(typeof leanBg === 'function' && leanBg()) : v === '1'; } catch (e) { return true; } };
  const okUrl = u => /^https:\/\/cdn\.jsdelivr\.net\/gh\/Yehehua1311\/[^?#]*\/sfw\/[^?#]+\.(png|jpe?g|webp)$/i.test(u || '');
  // 状态栏里玩家自己设的头像（卡的状态栏存在同源 localStorage：eden_custom_portraits = { 名: 地址 }、eden_portrait_<名> = data URL），只读
  const barAv = n => { try { const short = String(n).split(/[·・]/)[0]; for (const k of [n, short]) { const d = localStorage.getItem('eden_portrait_' + k); if (d && d.startsWith('data:image/')) return d; }
    const m = JSON.parse(localStorage.getItem('eden_custom_portraits') || '{}'); const u = m[n] || m[short]; return typeof u === 'string' && /^(https:|data:image\/)/.test(u) ? u : ''; } catch (e) { return ''; } };
  const cardPort = n => { const u = portraits[n] || portraits[String(n).split(/[·・]/)[0]]; return okUrl(u) ? u : ''; };
  const avOf = n => avatars[n] || barAv(n) || (portOn() ? cardPort(n) : '');
  const avImg = n => { const u = avOf(n); return u ? `<img alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${esc(u)}" data-i="${esc(ini(n))}" onerror="this.replaceWith(this.dataset.i)">` : ''; };
  const visible = c => prefs.show && !prefs.off.includes(c.name);
  // v0.9.3：显示名（自定义，custom.js）与位置来源：MVU（在场人物的位置字段）/ 标签（聊天里的人物标签）/ 推断（在场但没写位置，按和你同处）
  const dn = n => (typeof P.TCCustom !== 'undefined' ? P.TCCustom.name(n) : n);
  const srcOf = c => c.src === 'mvu' ? T('ch.src_mvu', 'MVU') : c.src === 'tag' ? T('ch.src_tag', '标签') : T('ch.src_infer', '推断');
  const when = c => c.present ? T('ch.with_you', '和你在一起') : T('ev.floor', '第 {n} 楼', { n: c.floor });

  // 地点 → { map, nx, ny } / { map }（只知道层）/ null
  const markerXY = async (map, id) => { const m = REG.maps[map]; if (!m?.data) return null; const d = map === cur ? curData : await getJSON(m.data);
    const k = d?.markers?.find(x => x.id === id); return k ? { nx: k.ax ?? k.nx, ny: k.ay ?? k.ny } : null; };
  async function where(c) {
    let r = typeof hereRes === 'function' ? hereRes(c.place) : null; if (!r || !REG.maps[r.map]) return null;
    if (REG.maps[r.map].kind === 'estate') { const s = estateStandIn(r.map); if (!s) return { map: r.map, estate: true }; r = { ...r, map: s.map, marker: s.marker }; }
    if (r.marker) { const p = await markerXY(r.map, r.marker); return p ? { map: r.map, ...p } : { map: r.map }; }
    if (r.place && typeof M !== 'undefined' && M) { const p = [...(M.places || []), ...(M.fiefs || [])].find(q => q.name === r.place); if (p) { const [nx, ny] = toImg(p.x, p.y); return { map: r.map, nx, ny }; } }
    const z = typeof P.TCEvents !== 'undefined' && P.TCEvents.zoneXY?.(r.map, c.place);   // 只知道城区（霓虹街、7 号井一带）：按城区大致标出，虚线框
    return z ? { map: r.map, ...z } : { map: r.map };
  }

  async function set(d) { await mod(); if (!Array.isArray(d.items)) return; const hadP = Object.values(portraits).some(okUrl); items = d.items.slice(0, 60); rosters = d.rosters || null; rep = Number.isFinite(d.rep) ? d.rep : null; stageOrder = Array.isArray(d.stageOrder) ? d.stageOrder : null; portraits = d.portraits && typeof d.portraits === 'object' ? d.portraits : {}; if (hadP !== Object.values(portraits).some(okUrl) && typeof P.TCCustom !== 'undefined') P.TCCustom.renderUI(); floor = d.floor || 0; loadPrefs(); await render(); bar(); if (flyName && cur) fly(flyName); }
  let seq = 0;
  async function render() {
    for (const el of els) { if (typeof untrack === 'function') untrack(el); viewer?.removeOverlay(el); } els = [];
    if (!viewer || !cur || !viewer.world.getItemCount() || REG.maps[cur]?.kind === 'estate' || !CM) return;
    const my = ++seq, groups = new Map();
    for (const c of items.filter(visible)) { const w = await where(c); if (my !== seq) return; if (!w || w.map !== cur || w.nx == null) continue;
      const k = w.nx.toFixed(3) + ',' + w.ny.toFixed(3); if (!groups.has(k)) groups.set(k, { w, list: [] }); groups.get(k).list.push(c); }
    for (const { w, list } of groups.values()) {
      const el = document.createElement('div'); el.className = 'chm' + (w.approx ? ' approx' : ''); el.dataset.chars = list.map(c => c.name).join('|');
      el.innerHTML = '<span class="chg">' + list.slice(0, 3).map((c, i) => `<i class="av" style="--c:${color(c.name)};z-index:${3 - i}">${avImg(c.name) || esc(ini(c.name))}</i>`).join('')
        + (list.length > 3 ? `<i class="av more">+${list.length - 3}</i>` : '') + `<b>${esc(dn(list[0].name))}${list.length > 1 ? ' ' + esc(T('ch.more', '等 {n} 人', { n: list.length })) : ''}</b>` + '</span>';
      const label = list.map(c => `${dn(c.name)}（${c.place}）`).join('、');
      if (typeof trackEl === 'function') trackEl(el, () => card(list), T('ch.aria', '人物：{s}', { s: label }));
      placeN(el, w.nx, w.ny, OpenSeadragon.Placement.CENTER); els.push(el);
    }
    if (typeof declutter === 'function') declutter();
  }
  function card(list) {
    showCard(null, list.map(c => dn(c.name)).join('、'), 'inf', '', '', list[0].place);
    if (typeof P.TCCompose !== 'undefined') P.TCCompose.attach({ go: list[0].place || '', ask: list.length === 1 ? dn(list[0].name) : '' });   // v0.9.6 地图 → 聊天
    const tg = document.querySelector('#card .tag'); tg.textContent = T('ch.tag', '人物'); tg.className = 'tag data'; tg.style.background = color(list[0].name);
    const sv = document.querySelector('#card .src'); delete sv.dataset.note;
    const note = c => { const e = typeof P.TCCustom !== 'undefined' && P.TCCustom.entry(c.name); return e?.用途 ? ` · ${e.用途}` : ''; };
    if (list.length === 1) { const c = list[0]; const id = identity(c.name), it = rosterItem(c.name);
      sv.innerHTML = `<dl class="fields">${id ? `<dt>${esc(T('ch.identity', '身份'))}</dt><dd>${esc(id)}</dd>` : ''}${it?.tier ? `<dt>${esc(T('ch.tier', '战力'))}</dt><dd><span class="chtier">${esc(it.tier)}</span></dd>` : ''}${c.roster ? (c.place ? `<dt>${esc(T('ev.k_place', '地点'))}</dt><dd>${esc(c.place)}</dd>` : '') : `<dt>${esc(T('ch.last', '最后出现'))}</dt><dd>${esc(c.present ? T('ch.with_you', '和你在一起') : T('ch.floor', '聊天第 {n} 楼', { n: c.floor }))}</dd><dt>${esc(T('ch.src', '来源'))}</dt><dd>${esc(srcOf(c) + note(c))}</dd>`}</dl>${moreHtml(it, id)}`;
      document.getElementById('card').classList.toggle('person2', !!sv.querySelector('details.chmore'));   // 桌面：有「更多资料」时人物卡两栏
      sv.querySelector('details.chmore')?.addEventListener('toggle', e => { try { TCStore.set(MO_OPEN, e.target.open ? '1' : '0'); } catch (x) {} });
      return; }
    sv.innerHTML = `<dl class="fields">${list.map(c => `<dt>${esc(dn(c.name))}</dt><dd>${esc(when(c) + ' · ' + srcOf(c))}</dd>`).join('')}</dl>`;
  }
  // 飞过去：在别的图上就先切图，打开后再平移；只知道层的，切到那一层就好
  async function fly(name) {
    const c = items.find(x => x.name === name); flyName = null; if (!c) return;
    const w = await where(c); if (!w) { card([c]); return; }
    if (w.map !== cur) { flyName = name; if (typeof closeCard === 'function') closeCard(); setPendingFocus(null); go(w.map); return; }
    if (w.nx == null) { card([c]); return; }
    setUserMoved(true); const vp = viewer.viewport, b = vp.getBounds(true), wd = Math.min(b.width, .25), h = wd * b.height / b.width;
    vp.fitBounds(new OpenSeadragon.Rect(w.nx - wd / 2, w.ny * aspect - h / 2, wd, h));
    setTimeout(() => card(items.filter(x => x.place === c.place && visible(x)).length ? items.filter(x => x.place === c.place) : [c]), 650);
  }
  /** 名册里的人（不一定在图上）开人物卡 */
  function cardOf(name) { const c = items.find(x => x.name === name); if (c) return fly(name); if (!rosterItem(name)) return; card([{ name, place: '', floor: 0, roster: true }]); }
  function afterOpen() { render().then(() => { if (flyName) fly(flyName); }); }

  // ---------- 横条里的「人物」页 ----------
  const count = () => new Set([...items.map(c => c.name), ...['present', 'members', 'targets'].flatMap(g => (rosters?.[g]?.items || []).map(i => i.name))]).size;   // fix3：同一人只算一次
  function bar() { if (typeof P.TCEvents !== 'undefined') P.TCEvents.renderBar?.(); }
  // v0.9.5 名册（只读，卡内脚本按表的位置发现）：身份、阶段；分组可折叠（折叠状态存本机）
  const identity = n => { for (const g of ['present', 'members', 'targets']) { const it = rosters?.[g]?.items?.find(i => i.name === n); if (it?.identity) return it.identity; } return ''; };
  const rosterItem = n => { for (const g of ['present', 'members', 'targets']) { const it = rosters?.[g]?.items?.find(i => i.name === n); if (it) return it; } return null; };
  // v0.9.6（E13 其余字段 / E16）：人物卡「更多资料」——代号、社会身份（公开身份）、身高 / 体重、外界知情、饰物；只读，字段名走变量映射（可关闭）；设置「人物卡显示更多资料」（本机 edenMapCharMore，默认开）
  const MO_KEY = 'edenMapCharMore', MO_OPEN = 'edenMapCharMoreOpen';
  const moreOn = () => { try { return TCStore.get(MO_KEY) !== '0'; } catch (e) { return true; } };
  const moreOpen = () => { try { return TCStore.get(MO_OPEN) === '1'; } catch (e) { return false; } };
  function moreRows(it, id = '') {
    const m = it?.more; if (!m) return [];
    const r = [], hw = [m.height != null && m.height !== '' ? (typeof m.height === 'number' ? m.height + ' cm' : m.height) : '', m.weight != null && m.weight !== '' ? (typeof m.weight === 'number' ? m.weight + ' kg' : m.weight) : ''].filter(Boolean).join(' · ');
    if (m.code) r.push([T('ch.m_code', '代号'), m.code]);
    if (m.social && m.social !== id) r.push([T('ch.m_social', '社会身份'), m.social]);
    if (hw) r.push([T('ch.m_hw', '身高 / 体重'), hw]);
    if (m.known != null) r.push([T('ch.m_known', '外界知情'), m.known === true || m.known === '是' || m.known === 'true' ? T('ch.m_yes', '知情') : m.known === false || m.known === '否' || m.known === 'false' ? T('ch.m_no', '不知情') : String(m.known)]);
    if (m.accessory) r.push([T('ch.m_acc', '饰物'), m.accessory]);
    return r;
  }
  const moreHtml = (it, id) => { if (!moreOn()) return ''; const r = moreRows(it, id); if (!r.length) return '';
    return `<details class="chmore" ${moreOpen() ? 'open' : ''}><summary>${esc(T('ch.more_h', '更多资料'))}</summary><dl class="fields">${r.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></details>`; };
  const GK = 'edenMapChGroups', closed = (() => { try { return new Set(JSON.parse(TCStore.get(GK) || '[]')); } catch (e) { return new Set(); } })();
  const stageChip = s => { if (!s) return ''; const i = stageOrder ? stageOrder.indexOf(s) : -1, n = stageOrder?.length || 0;
    return `<span class="chstage" ${i >= 0 ? `style="--p:${(i + 1) / n}" title="${esc(T('ch.stage_of', '第 {i} / {n} 步', { i: i + 1, n }))}"` : ''}>${i >= 0 ? `<i aria-hidden="true">${Array.from({ length: n }, (_, k) => `<b class="${k <= i ? 'on' : ''}"></b>`).join('')}</i>` : ''}${esc(s)}</span>`; };
  function row(c) {
    const id = identity(c.name), it = rosterItem(c.name);
    return `<li><button type="button" class="chgo" data-n="${esc(c.name)}"><i class="av" style="--c:${color(c.name)}">${avImg(c.name) || esc(ini(c.name))}${c.present ? `<s class="avb" title="${esc(T('ch.with_you', '和你在一起'))}"></s>` : ''}</i><b>${esc(dn(c.name))}</b><em><span class="chsrc src-${esc(c.src || 'infer')}">${esc(srcOf(c))}</span> ${esc(when(c))}${it ? stageChip(it.stage) + statChip(it) + tierChip(it) : ''}</em><small>${esc((id ? id + ' · ' : '') + c.place)}</small></button>`
      + `<label class="chsw"><input type="checkbox" role="switch" data-n="${esc(c.name)}" aria-label="${esc(T('ch.toggle_one', '在地图上显示 {n}', { n: c.name }))}" ${prefs.off.includes(c.name) ? '' : 'checked'} ${prefs.show ? '' : 'disabled'}></label></li>`;
  }
  // v0.9.6（E2 / E13）：名册行的等级、核心数值与档位名（字段名由变量映射定，只读）；设置「人物栏显示数值」关掉就不显示（本机 edenMapCharStats，默认开）
  const statsOn = () => { try { return TCStore.get('edenMapCharStats') !== '0'; } catch (e) { return true; } };
  const statChip = it => { if (!statsOn() || (!it.grade && it.core == null)) return '';
    const t = [it.grade, it.core != null ? `${it.coreStage ? it.coreStage + ' ' : ''}${it.core}` : ''].filter(Boolean).join(' · ');
    return `<span class="chstat" title="${esc([it.grade ? T('ch.grade', '等级') + ' ' + it.grade : '', it.core != null ? `${it.coreKey || ''} ${it.core}` : ''].filter(Boolean).join(' · '))}">${esc(t)}</span>`; };
  // v0.9.6 E1 战力小签（只读，卡里写明才有）
  const tierChip = it => it?.tier ? `<span class="chtier" title="${esc(T('ch.tier', '战力'))}">${esc(it.tier)}</span>` : '';
  function rosterRow(it) {
    const c = items.find(x => x.name === it.name);
    const body = `<i class="av" style="--c:${color(it.name)}">${avImg(it.name) || esc(ini(it.name))}</i><b>${esc(dn(it.name))}</b><em>${stageChip(it.stage)}${statChip(it)}${tierChip(it)}</em><small>${esc(it.identity || '')}${c ? ' · ' + esc(c.place) : ''}</small>`;
    return c ? `<li><button type="button" class="chgo" data-n="${esc(it.name)}">${body}</button></li>` : `<li><button type="button" class="chgo chro" data-card="${esc(it.name)}">${body}</button></li>`;   // v0.9.6：不在图上的名册成员也能开人物卡
  }
  function group(id, label, n, inner) {
    return `<details class="chgrp" data-g="${id}" ${closed.has(id) ? '' : 'open'}><summary>${esc(label)} <small>${n}</small></summary><ul>${inner}</ul></details>`;
  }
  function pane(el) {
    const presNames = new Set(items.map(c => c.name)), extra = (rosters?.present?.items || []).filter(i => !presNames.has(i.name));
    // fix3（用户 2026-09-28）：同一人既在场又在名册里时只列在「在场」一次（在场行带名册的阶段 / 数值），名册组只列不在场的，组名后注明「另 N 人在场」
    const here = new Set([...presNames, ...extra.map(i => i.name)]), memAll = rosters?.members?.items || [], tgtAll = rosters?.targets?.items || [];
    const mem = memAll.filter(i => !here.has(i.name)), tgt = tgtAll.filter(i => !here.has(i.name));
    const also = n => n ? ' · ' + T('ch.also_here', '另 {n} 人在场', { n }) : '';
    const ck = typeof P.TCCustom !== 'undefined' ? P.TCCustom.clock : null, of = typeof P.TCCustom !== 'undefined' ? P.TCCustom.outfit : null;
    // fix3：还没选开局（聊天只有开场白那一楼）时，人物 / 时间 / 地点都来自卡的 MVU 初始值，明确标出来
    const pre = ck?.pre ? `<p class="chpre" role="note">${esc(T('ch.pre', '开局前 · 卡初始值'))}<small>${esc(T('ch.pre_tip', '还没选开局：下面是卡的 MVU 初始变量，选了开局后按剧情更新'))}</small></p>` : '';
    // fix3（用户 2026-09-28）：着装属于人（主角），放在人物页顶部「你」这一行，不再挂在地点卡上
    const me = of?.text ? `<div class="chme"><i class="av me" aria-hidden="true">${esc(T('ch.me_i', '你'))}</i><b>${esc(T('ch.me', '你（主角）'))}</b><small title="${esc(of.items ? Object.entries(of.items).map(([k, v]) => `${k}：${v}`).join('\n') : of.text)}">${esc(T('cu.outfit', '着装：{s}', { s: of.text }))}</small></div>` : '';
    el.innerHTML = pre + me + `<label class="tg chall"><span>${esc(T('ch.show', '在地图上显示人物'))}</span><input type="checkbox" role="switch" ${prefs.show ? 'checked' : ''}></label><div class="chgrps">`
      + group('present', T('ch.g_present', '在场'), items.length + extra.length, items.map(row).join('') + extra.map(rosterRow).join(''))
      + (memAll.length ? group('members', T('ch.g_members', '庄园成员'), mem.length + also(memAll.length - mem.length), mem.map(rosterRow).join('')) : '')
      + (tgtAll.length ? group('targets', T('ch.g_targets', '目标'), tgt.length + also(tgtAll.length - tgt.length), tgt.map(rosterRow).join('')) : '') + '</div>';
    for (const d of el.querySelectorAll('details.chgrp')) d.addEventListener('toggle', () => { d.open ? closed.delete(d.dataset.g) : closed.add(d.dataset.g); try { TCStore.set(GK, JSON.stringify([...closed])); } catch (e) {} });
  }
  function onPane(e) {
    const inp = e.target.closest('input[type=checkbox]');
    if (inp && e.type === 'change') {
      if (inp.closest('.chall')) prefs.show = inp.checked;
      else { const n = inp.dataset.n; prefs.off = inp.checked ? prefs.off.filter(x => x !== n) : [...prefs.off, n]; }
      savePrefs(); render(); bar(); return;
    }
    const b = e.type === 'click' && e.target.closest('button.chgo'); if (b) { if (typeof P.TCEvents !== 'undefined') P.TCEvents.collapse(); if (b.dataset.card) cardOf(b.dataset.card); else fly(b.dataset.n); }
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
    if (!ok && C.warnText && (r.reason === 'cap' || r.reason === 'quota') && typeof P.TCCustom !== 'undefined') P.TCCustom.toast([C.warnText(r.reason, typeof LANG !== 'undefined' && LANG === 'en')]);   // A-13：满了要说，不悄悄失败
    if (ok) { loadPrefs(); render(); bar(); } return ok; }
  async function removeAvatar(name) { const C = await mod(); const ok = !!C && !!store() && C.removeAvatar(store(), chat(), name); if (ok) { loadPrefs(); render(); bar(); } return ok; }
  function chatChanged() { loadPrefs(); render(); bar(); }

  const css = `
  .chm{position:relative;width:0;height:0;overflow:visible;pointer-events:auto;cursor:pointer;z-index:2;}
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
  #evbar .chpane .chgrps{overflow:visible}
  #evbar .chpane ul{list-style:none;margin:0;padding:0}
  #evbar .chpane summary{display:flex;align-items:center;gap:6px;min-height:40px;padding:0 var(--sp-3,6px);cursor:pointer;font-size:var(--fs-small,12px);font-weight:600;color:var(--ink-2);border-top:1px solid var(--line)}
  #evbar .chpane summary small{color:var(--muted);font-weight:400;font-size:var(--fs-micro,11px)}
  #evbar .chpane summary{list-style:none}#evbar .chpane summary::-webkit-details-marker{display:none}#evbar .chpane summary::before{content:'';width:6px;height:6px;border:solid var(--muted);border-width:0 1.5px 1.5px 0;transform:rotate(-45deg);margin:0 4px 0 2px;transition:transform var(--dur-1,120ms)}#evbar .chpane details[open]>summary::before{transform:rotate(45deg)}
  #evbar .chpane .chro{cursor:pointer}
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
  TCCvd.onChange(() => afterOpen());   // 换色觉模式（E7）后头像框重新取色
  return { color, portOn, setMoreOn(on) { try { TCStore.set(MO_KEY, on ? '1' : '0'); } catch (e) {} }, cardOf, setStatsOn(on) { try { TCStore.set('edenMapCharStats', on ? '1' : '0'); } catch (e) {} bar(); }, get statsOn() { return statsOn(); }, setPortOn(on) { try { TCStore.set(PK_, on ? '1' : '0'); } catch (e) {} render(); bar(); }, get hasPortraits() { return Object.values(portraits).some(okUrl); }, get rep() { return rep; }, identity, set, render: afterOpen, fly, count, pane, onPane, setAvatar, removeAvatar, chatChanged, get items() { return items.map(c => ({ ...c })); } };
})();
register('TCChars', TCChars);
export { TCChars };
