// 设置弹层：分页、SettingsApi.registerSection、搜索、initSettings、关于 / 检查更新、自检。
import { creditSections } from './credits-extra.mjs';
import { $, esc } from './dom-helpers.mjs';
import { post } from './protocol-stamp.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { buildDate, buildLine, buildTag, viewerHead } from './about-build.mjs';
import { cardState, cardStateText } from './card-state.mjs';
const loadedAt = Date.now();
import { LANG, applyI18nTo } from './i18n.mjs';
import { buildInfo } from './topbar.mjs';
import { tierAvail } from './sharpness-tiers.mjs';
import { buildPage, isBuilt, pageEl, placeIn, runLeave, runShow, searchIndex } from './settings-pages.mjs';
import { hostAdapter } from '../tavern/host-adapter.mjs';   // F0：查看器读宿主全局的唯一出口（版权申明页的卡信息兜底探测）
import { bootEffects } from './settings-wire.mjs';
import { narrowNow } from './subpage3d-host.mjs';
import { noticeRefresh } from './notice-layer.mjs';
import { setActs } from './control-column.mjs';
import { plugins } from './plugins.mjs';
import { PACK } from './current-pack.mjs';
import { ignoredKeys } from '../core/locked-strings.mjs';
import { mountFeedbackButton } from './feedback.mjs';
import { busOn } from './bus.mjs';   // P2-3：全局监听统一登记
import { renderPackBox } from './pack-settings.mjs';   // S9-2：高级页的「地图包」
// ---------------- 设置（S7-1，docs/settings-ia.md）：首页 = 常用 + 分组列表；子页 地图与图层 / 人物与物品 / AI 联动 / 数据与映射 / 更新与版本 / 高级 / 版权申明 ----------------
// 子页第一次打开时才由 settings-pages.mjs 造出来；模块向指定页注册自己的一栏：SettingsApi.registerSection(page, el, { order })。display 是 map 的旧名（保留一版）。
export let setPageNow = 'home', setPrev = null;
const PAGES = { home: ['settings_title', '设置'], map: ['s.map', '地图与图层'], people: ['s.people', '人物与物品'], ai: ['s.ai', 'AI 联动'], data: ['s.data', '数据与映射'], update: ['s.update', '更新与版本'], adv: ['s.adv', '高级'], license: ['s.license', '版权申明'] };
const ALIAS = { display: 'map' };
const LAZY = { ai: () => import('./ai-cards.mjs') }, lazy = {};   // 页的代码也按需加载（AI 联动页的卡片模块）：加载完再建页
export function setPage(pg, quiet) {
  pg = ALIAS[pg] || pg; if (!PAGES[pg]) pg = 'home'; if (pg !== setPageNow) runLeave(setPageNow); setPageNow = pg;
  if (LAZY[pg] && !lazy[pg]) { lazy[pg] = 1; LAZY[pg]().then(() => { lazy[pg] = 2; if (setPageNow === pg) setPage(pg, quiet); }).catch(() => { lazy[pg] = 0; }); }
  if ((!quiet || !$('#setPop').hidden) && (!LAZY[pg] || lazy[pg] === 2)) buildPage(pg, applyI18nTo);   // 启动路径上不造页：只有设置开着才建
  document.querySelectorAll('#setPop .spage').forEach(x => { x.hidden = x.dataset.page !== pg; });
  $('#setBack').hidden = pg === 'home'; $('#setTitle').textContent = uiTextOr(...PAGES[pg]);
  if (!quiet) { $('#setPop').scrollTop = 0; const f = pg === 'home' ? ($('#setQ')?.offsetParent ? $('#setQ') : $('#setPop .sgroups button')) : $('#setBack'); f?.focus({ preventScroll: true }); }
  if (!isBuilt(pg)) return;
  if (pg === 'home') { renderHome(); tierAvail(); if (window.top !== window && !aiSum) post({ type: 'eden-map:th', op: 'state' }); }   // 首页的 AI 联动摘要要宿主的 healthSum
  if (pg === 'update') { renderAbout(); renderSelfCheck(); renderLine(); }
  if (pg === 'license') renderLicense();
  if (pg === 'people') { const n = typeof plugins.CharactersView !== 'undefined' ? plugins.CharactersView.count() : 0; $('#chSrc').textContent = uiTextOr('s.ch_src_n', `当前聊天 ${n} 人`, { n }); }
  if (pg === 'adv') renderPackBox();
  if (pg === 'map') tierAvail();
  if (pg === 'ai' && window.top !== window) post({ type: 'eden-map:th', op: 'state' });
  runShow(pg);
  if (pg === 'data') { if (window.top !== window) { post({ type: 'eden-map:storage-info' }); post({ type: 'eden-map:th', op: 'state' }); } else window.renderStorageSettings?.(null); }
}
export const SettingsApi = window.SettingsApi = {
  registerSection(page, el, o = {}) { const pg = pageEl(ALIAS[page] || page) || pageEl('adv'); if (!pg || !el) return; placeIn(pg, el, o.order ?? 50); },
  open(page = 'home') { showSet(true); setPage(page); },
  get page() { return setPageNow; },
};
// 首页的摘要：更新那行是构建行，AI 联动那行在嵌入时才有（健康摘要由宿主随 th-state 送来），图层行（手机）显示开着的层数
export function renderHome() {
  updSub();
  const emb = window.top !== window, ai = $('#aiGroup'); if (ai) { ai.hidden = !emb; const s = $('#aiGroupSub'); if (s && emb) { const h = aiSum; s.textContent = h ? uiTextOr('s.ai_sub', `${h.n} 项开启 · ${h.m} 项未生效`, { n: h.n, m: h.m }) : uiTextOr('s.ai_sub0', '读取中…'); s.classList.toggle('warn', !!h?.m); } }
  const n = $('#lyN'); if (n) { const k = document.querySelectorAll('#layPop #layList input:checked, #setPop .more #layList input:checked').length; n.textContent = uiTextOr('s.layers_n', `${k} 开`, { n: k }); }
}
export let aiSum = null;
export function setAiSum(v) { aiSum = v && typeof v === 'object' ? { n: +v.n || 0, m: +v.m || 0 } : null; if (isBuilt('home')) renderHome(); }
// 版权申明页：角色卡信息 + 地图项目与免责声明。不做真伪鉴定，只提示风险。
// 卡信息**不在这里摸宿主全局**（任务四）：优先用卡内脚本经桥（mvu-bridge.cardInfo 的三级降级）推来的
// eden-map:cardinfo；没有才自己探父级窗口（同源 srcdoc 才碰得到）；全都没有 = 安全占位。
// 旧版直接读本窗口的酒馆全局——嵌在 iframe 里那个全局必然读不到，于是永远误报「未接入酒馆」。
// F0：探测这一步也进适配层（hostAdapter.ui.probeContext / probeCharName），这一层不再自己点宿主对象。
export function cardOf() {
  if (cardInfo) return cardInfo;
  const pick = (c, src) => {
    const d = c?.data && typeof c.data === 'object' ? c.data : (c && typeof c === 'object' ? c : {});
    const name = String(d.name || c?.name || '').trim();
    if (!name && !d.creator && !d.character_version) return null;
    return { name, creator: String(d.creator || '').trim(), version: String(d.character_version || '').trim(), avatar: String(c?.avatar || ''),
      tags: Array.isArray(d.tags) ? d.tags.map(String).slice(0, 12) : [], notes: String(d.creator_notes || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200), src };
  };
  for (const w of [window.parent, window]) {
    try { const c = hostAdapter.ui.probeContext(w); const r = pick(c?.characters?.[c.characterId], 'probe'); if (r) return r; } catch (e) {}
    try { const n = hostAdapter.ui.probeCharName(w); if (n) return { name: String(n), creator: '', version: '', avatar: '', tags: [], notes: '', src: 'probe' }; } catch (e) {}
  }
  return null;
}
function renderLicense() {
  const box = $('#licBox'); if (!box) return; box.innerHTML = '';
  const label = (t) => { const b = document.createElement('b'); b.textContent = t; b.style.cssText = 'display:block;margin:var(--sp-4) 0 var(--sp-2)'; box.appendChild(b); };
  const row = (k, v, warn) => { const r = document.createElement('div'); r.className = 'row'; r.innerHTML = `<span${warn ? ' style="color:var(--warn,#c66)"' : ''}>${esc(k)}</span><code style="max-width:62%;text-align:right;word-break:break-all;white-space:normal">${esc(v)}</code>`; box.appendChild(r); };
  label(uiTextOr('s.lic_card', '角色卡信息（自动读取）'));
  const d = cardOf();
  if (!d) { const t = cardStateText(cardState({ embedded: window.top !== window, card: d, tried: cardTried })); row(uiTextOr('s.lic_state', '状态'), uiTextOr(t[0], t[1], t[2]), false); }
  else {
    if (d.name) row(uiTextOr('s.lic_name', '角色名'), d.name);
    if (d.creator) row(uiTextOr('s.lic_creator', '作者'), d.creator);
    if (d.version) row(uiTextOr('s.lic_ver', '版本'), d.version);
    if (d.tags.length) row(uiTextOr('s.lic_tags', '标签'), d.tags.join('、'));
    if (d.notes) row(uiTextOr('s.lic_notes', '作者注'), d.notes);
    if (!d.creator && !d.version && !d.tags.length && !d.notes) row(uiTextOr('s.lic_state', '状态'), uiTextOr('s.lic_unknown', '未读到本卡的作者或来源信息：卡片可能经转卖、搬运，存在数据风险，也可能损害原作者权益。建议只从原作者或授权渠道获取卡片。'), true);
  }
  label(uiTextOr('s.lic_map', '地图项目'));
  { const cr = PACK?.credits, pk = cr?.pack?.[0];   // 署名取自包清单的 credits（K-R70 随附）：仓库、地图作者、原作者；包没写就不出这一行
    if (pk?.url) row(uiTextOr('s.lic_repo', '空间地图（开源）'), String(pk.url).replace(/^https:\/\//, ''));
    if (pk?.name) row(uiTextOr('s.lic_map_by', '地图开发'), pk.name);
    if (cr?.card?.creator) row(uiTextOr('s.lic_orig', '原作角色卡'), uiTextOr('s.lic_orig_v', '{creator}（类脑社区）原创；地图是经授权的二次创作（2026-09-27 起）', { creator: cr.card.creator }));
    if (typeof cr?.card?.url === 'string' && /^https:\/\//.test(cr.card.url)) { const r = document.createElement('div'), a = document.createElement('a'); r.className = 'row'; a.href = cr.card.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = uiTextOr('s.lic_post_go', '打开');   // 原作发布帖的链接来自包的 credits.card.url（包数据；引擎里没有卡名）
      r.append(Object.assign(document.createElement('span'), { textContent: uiTextOr('s.lic_post', '原作发布帖') }), a); box.appendChild(r); } }
  box.append(...creditSections());   // HEADER-1: this map's source line and the related project
  label(uiTextOr('s.lic_disc', '免责声明'));
  const p = document.createElement('small'); p.style.cssText = 'display:block;line-height:1.5;opacity:.75';
  p.textContent = uiTextOr('s.lic_disc_v', '地图为粉丝演绎：地点与形制以原作设定为准，地图仅作补充呈现，不对地图内容的准确性负责。三维模型的贴图与纹理来自 Poly Haven 与 ambientCG（CC0 协议）。');
  box.appendChild(p);
}

// 设置里的搜索（桌面首屏顶，§5）：静态索引（行表 + 卡片的名称 / 用途 / 子项文字，没打开过的页也搜得到）加上已在页里的栏；点一下建页、展开对应卡片并滚到那一行
function setSearch(q) {
  const box = $('#setHits'); box.innerHTML = ''; q = q.trim().toLowerCase(); $('#setPop .sgroups').hidden = !!q; if (!q) return;
  const hits = searchIndex().filter(e => e.text.toLowerCase().includes(q) && (e.page !== 'ai' || window.top !== window)).map(e => ({ ...e, label: e.label.slice(0, 40) }));
  const seen = new Set(hits.map(h => h.page + '|' + h.label));
  for (const pg of document.querySelectorAll('#setPop .spage:not([data-page="home"])'))
    for (const r of pg.querySelectorAll(':scope > .row, :scope > .hrow, :scope > label, details > summary, #aboutBox > label, #branchBox > .hrow, #licBox > label, #selfCheck > b, #cuBox .cu-open, #cmpBox > summary')) {
      const txt = (r.textContent || '').trim().slice(0, 40); if (txt && txt.toLowerCase().includes(q) && !seen.has(pg.dataset.page + '|' + txt)) { seen.add(pg.dataset.page + '|' + txt); hits.push({ page: pg.dataset.page, label: txt, el: r }); } }
  if (!hits.length) { box.innerHTML = `<small>${esc(uiTextOr('s.no_hit', '没有找到'))}</small>`; return; }
  for (const h of hits.slice(0, 12)) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn';
    b.innerHTML = `${esc(h.label)}<small>${esc(uiTextOr(...PAGES[h.page]))}</small>`;
    b.onclick = () => { setPage(h.page); const root = pageEl(h.page), r = h.el?.isConnected ? h.el : (h.card && root.querySelector(`[data-card="${h.card}"]`)) || root.querySelector(`[data-rk="${h.key}"]`) || root;
      r.closest?.('details')?.setAttribute('open', ''); if (h.card) r.setAttribute?.('open', ''); r.scrollIntoView({ block: 'center' }); r.classList.add('found'); setTimeout(() => r.classList.remove('found'), 1600); (r.querySelector?.('input, button') || r).focus?.({ preventScroll: true }); };
    box.appendChild(b); }
}
export { rmPref, q3Pref } from './settings-wire.mjs';
export function initSettings() {
  performance.mark('s7:init0');
  const btn = $('#setBtn'), pop = $('#setPop');
  const firstIn = el => el.querySelector('button:not([hidden]), input, [tabindex="0"]');
  let opener = null;
  showSet = (on, page) => { const was = !pop.hidden; pop.hidden = !on; btn.setAttribute('aria-expanded', on ? 'true' : 'false'); $('#thumbBtn')?.setAttribute('aria-expanded', on ? 'true' : 'false');
    document.body.classList.toggle('setopen', !!on);
    if (on) { showLay(false); if (!was) { opener = document.activeElement; setPrev = window.ViewerDrawer ? { tab: ViewerDrawer.tab, top: ViewerDrawer.body.scrollTop } : null; setPage(page || 'home', true); pop.scrollTop = 0; firstIn(pop)?.focus({ preventScroll: true }); setActs(); } }
    else if (was) { runLeave(setPageNow); if ($('#setQ')) { $('#setQ').value = ''; setSearch(''); } if (setPrev && window.ViewerDrawer) { if (setPrev.tab) ViewerDrawer.setTab(setPrev.tab); ViewerDrawer.body.scrollTop = setPrev.top; } setPrev = null; noticeRefresh(); } };
  $('#setX').onclick = e => { e.stopPropagation(); showSet(false); };
  $('#setBack').onclick = e => { e.stopPropagation(); setPage('home'); };
  pop.addEventListener('click', e => { const b = e.target.closest('.sgroups button[data-page], .lyrow[data-page]'); if (b) setPage(b.dataset.page); });   // 首页的分组列表与手机的图层行（页是第一次点开时才建的，用委托）
  pop.addEventListener('input', e => { if (e.target.id === 'setQ') setSearch(e.target.value); });
  btn.onclick = e => { e.stopPropagation(); showSet(pop.hidden); };
  // 目标已被重绘移出文档（如「检查更新」按钮点完即重绘）不算点在外面
  const gone = t => t instanceof Node && !t.isConnected;
  busOn({ key: 'settings.outsideClick', target: document, type: 'click', fn: e => { if (!pop.hidden && !narrowNow() && !gone(e.target) && !pop.contains(e.target) && !btn.contains(e.target) && !e.target.closest?.('#thumbBtn, .rg, #cuDlg, #umDlg')) showSet(false); } });
  // 「图层 ▾」弹层：挂在按钮下方、右对齐
  const lb = $('#layBtn'), lp = $('#layPop');
  showLay = on => {
    // S7-2 B1 (docs/ui-refactor.md 5.9): on a phone (or whenever the list is not in the popover) the layer action opens the 地图与图层 page: the popover never opens empty
    if (on && (narrowNow() || !lp.querySelector('#layList'))) { lp.hidden = true; lb.setAttribute('aria-expanded', 'false'); showSet(true, 'map'); return; }
    lp.hidden = !on; lb.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) { showSet(false); const r = lb.getBoundingClientRect(); lp.style.left = Math.max(8, Math.min(innerWidth - lp.offsetWidth - 8, r.right - lp.offsetWidth)) + 'px'; firstIn(lp)?.focus({ preventScroll: true }); } };
  lb.onclick = e => { e.stopPropagation(); showLay(lp.hidden); };
  // 弹层里 Tab 循环，不跑回地图（焦点陷阱，关闭后回到入口）
  for (const el of [pop, lp]) el.addEventListener('keydown', e => { if (e.key !== 'Tab') return;
    const f = [...el.querySelectorAll('button, input, summary, select, [tabindex="0"]')].filter(x => x.offsetParent && !x.disabled); if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } });
  busOn({ key: 'settings.layerOutsideClick', target: document, type: 'click', fn: e => { if (!lp.hidden && !gone(e.target) && !lp.contains(e.target) && !lb.contains(e.target)) showLay(false); } });
  // 表单正在编辑时通知先不出（§3）
  pop.addEventListener('focusin', noticeRefresh); pop.addEventListener('focusout', () => setTimeout(noticeRefresh, 0));
  bootEffects();
  try { performance.measure('s7:settings-init', 's7:init0'); } catch (e) {}   // S7-1 boot budget: the synchronous settings work between reload and first frame is reported (<= 5 ms)
}
// 设置「数据与映射」→ app/data-mapping-settings.mjs（arch-v2 §6 第 6 步 settings-ui 的第一块）
export function kbdHelp(on) {
  const b = $('#kbdHelp'); b.hidden = !on; $('#kbdBtn').setAttribute('aria-expanded', on ? 'true' : 'false'); if (!on) return;
  const K = [['Esc', uiTextOr('k.esc', '关闭最上面一层 / 抽屉降一档')], ['[ ]  PgUp PgDn', uiTextOr('k.layer', '切换上下层')], ['L', uiTextOr('k.l', '标注开关')], ['+ −', uiTextOr('k.zoom', '缩放')], ['0', uiTextOr('k.home', '复位视野')],
    ['/', uiTextOr('k.search', '设置搜索')], ['M', uiTextOr('k.m', '变量映射')], ['?', uiTextOr('k.help', '快捷键表')], [',', uiTextOr('k.comma', '设置')], ['1 2', uiTextOr('k.modes', '三维视图：外观 / 楼层')]];
  b.innerHTML = `<dl>${K.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}
export let showSet = () => {}, showLay = () => {};
// fix3（用户 2026-09-28）：「加载线路」一直显示——当前线路 + 自动测速 / 手动选择；不能换线路时灰掉并写原因（单独打开 / 脚本地址固定）
let lineInfo = null;
export function setLine(d) { lineInfo = d; renderLine(); }
export function renderLine() {
  const b = $('#linePick'), n = $('#lineNow'); if (!b || !n) return;
  const emb = window.top !== window, d = lineInfo;
  if (!emb) { b.disabled = true; n.textContent = uiTextOr('s.line_na_solo', '单独打开地图时不适用：线路由酒馆里的卡内脚本选择'); return; }
  if (!d) { b.disabled = true; n.textContent = uiTextOr('s.line_wait', '等待卡内脚本报告线路…'); return; }
  if (!d.swappable) { b.disabled = true; n.textContent = uiTextOr('s.line_na_fixed', '不可切换：当前脚本从固定地址加载（本地 / 预览），没有备用线路'); return; }
  b.disabled = false;
  n.innerHTML = esc(uiTextOr('s.line_now', '当前：')) + `<b>${esc(d.name || uiTextOr('s.line_unset', '未选'))}</b> · ` + esc(d.manual ? uiTextOr('s.line_manual', '手动选择') : uiTextOr('s.line_auto', '自动测速选中（24 小时内有效）'));
}
// v0.9.6「关于 / 检查更新」：卡内脚本发来 eden-map:about { version, code, channel: tag | follow | ref | local, ref, sha, line }；
// 「检查更新」发 eden-map:check-update，卡内脚本查最新 map-v 标签的 build.json（走当前线路、绕缓存）后回 eden-map:update-result。不自动安装。
// 单独打开（不在酒馆里）时只显示地图自己的 build.json。
export let about = null, updRes = null, updBusy = false;
export let cardInfo = null, cardTried = null;   // 任务四：卡内脚本推来的角色卡信息（见 setCardInfo）
export function renderAbout() {
  const box = $('#aboutBox'); if (!box) return; const en = LANG === 'en';
  const a = about || {}, ver = a.version || buildInfo?.version || '';
  const ch = { tag: uiTextOr('about.ch_tag', `固定版本 ${a.ref || ''}`, { ref: a.ref || '' }), follow: uiTextOr('about.ch_follow', `跟随分支 ${a.ref || ''}（每次打开取最新提交）`, { ref: a.ref || '' }),
    latest: a.locked ? uiTextOr('about.ch_locked', `已锁定 ${a.ref || ''}`, { ref: a.ref || '' }) : uiTextOr('about.ch_latest', `自动用最新正式版（当前 ${a.ref || ''}）`, { ref: a.ref || '' }),
    ref: a.pinned ? uiTextOr('about.ch_pin', `固定提交 @${a.pinned}`, { sha: a.pinned }) : uiTextOr('about.ch_ref', `预览提交 ${a.ref || ''}`, { ref: a.ref || '' }), local: uiTextOr('about.ch_local', '本地 / 单独打开') }[a.channel || (window.top === window ? 'local' : '')] || '';
  const SRC = { jsdmirror: 'jsdmirror', jsdelivr: 'jsDelivr', raw: 'GitHub raw', github: 'GitHub API', cache: uiTextOr('about.src_cache', '本机缓存'), baked: uiTextOr('about.src_baked', '脚本内置') };
  // 跟随分支预览：标题直接说「跟随分支预览 · 构建 #N」，不挂正式版号（v0.9.5 之类），免得被当成已发版本（2026-09-28 修）
  let h = a.channel === 'follow' && a.build != null
    ? `<b>${esc(uiTextOr('about.title_follow', '跟随分支预览'))}</b> · ${esc(uiTextOr('about.follow_build', '构建 #{n} · 来源 {s}', { n: a.build, s: SRC[a.source] || a.source || '?' }))}`
    : `<b>${esc(uiTextOr('about.title', '地图版本'))}</b>`;
  if (ch) h += `<br>${esc(ch)}${a.sha && !a.pinned ? ` · ${esc(String(a.sha).slice(0, 7))}` : ''}`;
  { const bl = buildLine(a, uiTextOr, loadedAt); if (bl) h += `<br><span id="buildLine">${esc(bl)}</span>`; }   // I-15：始终说明正在跑哪个构建
  { const vh = viewerHead(renderAbout); if (vh && Number.isInteger(a.build) && vh.build !== a.build) h += `<br><span id="buildMismatch">${esc(uiTextOr('about.build_mismatch', '地图文件构建 head #{n} · {d}（和脚本不一致）', { n: vh.build, d: buildDate(vh, loadedAt) }))}</span>`; }   // P2-3：脚本和地图文件的构建不一致时两行都给出
  if (a.line) h += `<br>${esc(uiTextOr('about.line', '线路：{l}', { l: a.line }))}`;
  if (window.top !== window) h += `<br><button type="button" class="btn" id="updBtn" ${updBusy ? 'disabled' : ''}>${esc(updBusy ? uiTextOr('about.checking', '检查中…') : uiTextOr('about.check', '检查更新'))}</button>`;
  const r = updRes;
  if (r) {
    const how = a.channel === 'follow' ? uiTextOr('about.how_follow', '跟随版会自动用上新版本：刷新酒馆页面即可') : uiTextOr('about.how_tag', '固定版不会自己变：导入新版脚本「{script} v{v}」（同名覆盖）', { v: r.latest || '', script: uiTextOr('app.script', '【地图】空间地图') });
    if (r.follow) h += `<div class="res" role="status">${esc(r.status === 'fail' ? uiTextOr('about.fail', '检查失败：连不上更新接口，稍后再试')
      : uiTextOr(r.status === 'new' ? 'about.follow_new' : 'about.follow_latest', r.status === 'new' ? '分支有新构建 #{n}（来源 {s}）：刷新酒馆页面即可' : '已是最新（最新构建 #{n} · 来源 {s}）', { n: r.build, s: SRC[r.source] || r.source || '?' }))}</div>`;
    else h += `<div class="res" role="status">${r.status === 'latest' ? esc(uiTextOr('about.latest', '已是最新（v{v}）', { v: r.latest || ver }))
      : r.status === 'new' ? `${esc(uiTextOr('about.new', '有新版 v{v}', { v: r.latest }))}${r.code ? ' · ' + esc(r.code) : ''}<br><a href="${esc(r.notes || '')}" target="_blank" rel="noopener">${esc(uiTextOr('about.notes', '更新说明'))}</a><br>${esc(how)}`
      : esc(uiTextOr('about.fail', '检查失败：连不上更新接口，稍后再试'))}</div>`;
  }
  box.innerHTML = h; updSub(); mountFeedbackButton(box);
  if (window.top !== window) {   // v0.9.6「自动检查更新」（默认开；卡内脚本启动时读 edenMapAutoCheck，同源 localStorage）
    const lb = document.createElement('label'); lb.innerHTML = `<span>${esc(uiTextOr('about.auto_check', '自动检查更新'))}</span><input type="checkbox" role="switch" id="optAutoCheck">`;
    const cb = lb.querySelector('input'); let on = true; try { on = LocalStore.get('edenMapAutoCheck') !== '0'; } catch (e) {}
    cb.checked = on; cb.onchange = () => { try { LocalStore.set('edenMapAutoCheck', cb.checked ? '1' : '0'); } catch (e) {} }; box.appendChild(lb);
  }
  if (a.channel === 'latest' && a.ref) {   // 0.9.6 起的正式版加载器：「锁定当前版本」（高级，默认关）——加载器固定用这个标签，不再自动换新版
    const lb = document.createElement('label'); lb.innerHTML = `<span>${esc(uiTextOr('about.lock', '锁定当前版本'))}</span><input type="checkbox" role="switch" id="optLockVer">`;
    const cb = lb.querySelector('input'); let on = false; try { on = !!LocalStore.get('edenMapLockTag'); } catch (e) {}
    cb.checked = on; cb.onchange = () => { try { if (cb.checked) LocalStore.set('edenMapLockTag', a.ref); else LocalStore.remove('edenMapLockTag'); } catch (e) {} }; box.appendChild(lb);
  }
  // 版本分支切换（main / preview 双轨，docs/branching.md）：宿主随 about 发 branches / branch（当前）/ branchSw（地址可换）。
  // 切换 = 本次会话立即从目标分支重载脚本（宿主 switchBranch，新实例接管旧的）；长期使用要重新导入该分支的脚本。
  { const bb = $('#branchBox'); if (bb) { bb.innerHTML = '';
    if (window.top !== window && (a.branches || []).length) {
      const h = document.createElement('div'); h.className = 'hrow';
      h.innerHTML = `<span>${esc(uiTextOr('s.branch', '版本分支'))}</span><select id="branchSel"${a.branchSw ? '' : ' disabled'}>` +
        (a.branch === 'pin' ? `<option value="" selected>${esc(uiTextOr('about.ch_pin', `固定提交 @${a.pinned || ''}`, { sha: a.pinned || '' }))}</option>` : '') +   // I-23：钉在提交的脚本不属于任何分支，选择器如实显示，不冒充正式版通道
        a.branches.map(o => `<option value="${esc(o.id)}"${a.branch === o.id ? ' selected' : ''}>${esc(LANG === 'en' && o.label_en ? o.label_en : o.label)}</option>`).join('') + '</select>';
      if (!a.branchSw) h.title = uiTextOr('s.branch_na', '不可切换：当前脚本不是从分支地址加载');
      else h.querySelector('select').onchange = () => { const v = h.querySelector('select').value; if (v) post({ type: 'eden-map:switch-branch', branch: v }); };
      bb.append(h);
      if (a.branchSw) { const sm = document.createElement('small'); sm.textContent = uiTextOr('s.branch_hint', '切换后本次会话立即从该分支重新加载地图脚本；要长期使用请重新导入该分支的脚本'); bb.append(sm); }
    } } }
  const b = $('#updBtn'); if (b) b.onclick = () => { updBusy = true; updRes = null; renderAbout(); post({ type: 'eden-map:check-update' }); setTimeout(() => { if (updBusy && !updRes) { updBusy = false; updRes = { status: 'fail' }; renderAbout(); } }, 15000); };
  if (updRes) updBusy = false;
}
// 设置里的「自检」一栏：✓ / ⚠ 列表（中 / EN）、新正式版的「本次切换」按钮、「自动更新到新正式版」开关（默认关，存本机 edenMapAutoUpdate）
export let selfCheck = null;
// 设置首页「更新与版本」那一行的摘要：构建行 head #N · 日期 + 自检 ⚠ 数（和更新页同一份 about 状态源）
export function updSub() { const el = $('#updGroupSub'); if (!el) return; const w = (selfCheck?.items || []).filter(i => i.status === 'warn').length;
  const tag = about && Number.isInteger(about.build) ? buildTag(about, uiTextOr, loadedAt) : '';
  el.textContent = [tag || uiTextOr('s.update_sub0', '检查更新 · 自检'), w ? uiTextOr('s.sc_warn', `自检 ${w} 项 ⚠`, { n: w }) : ''].filter(Boolean).join(' · '); el.classList.toggle('warn', !!w); }
export function renderSelfCheck() {
  if (!selfCheck?.items) return;
  const items = [...selfCheck.items, ...ignoredKeys(PACK?.strings).map(k => ({ id: 'locked:' + k, status: 'info', zh: `包的文案 ${k} 被忽略：这条文字由内核固定`, en: `The pack's text for ${k} is ignored: the core fixes this text` }))];   // §2.7：一个被忽略的键一行
  let box = document.getElementById('selfCheck');
  if (!box) { box = document.createElement('div'); box.id = 'selfCheck'; SettingsApi.registerSection('update', box, { order: 80 }); }
  const L = LANG === 'en' ? 'en' : 'zh', mark = { ok: '✓', warn: '⚠', skip: '–', info: '↑' };
  // 世界书那一条红线（自检项 worldbook，warn）：加一个「一键写入世界书」按钮，跳到「数据与映射」页并打开看差异（跟点 wbLook/wbDiff 一样）；
  // API 不可用（自检文案已经只剩手动导入提示）时不出这个按钮，只留手动那行小字
  const wbWarn = items.find(i => i.id === 'worldbook' && i.status === 'warn');
  box.innerHTML = `<b>${esc(uiTextOr('selfcheck.title', '自检'))}</b><ul>${items.map(i => `<li class="${esc(i.status)}">${mark[i.status] || ''} ${esc(i[L] || i.zh)}`
    + (i === wbWarn ? `<div class="hrow"><span></span><button type="button" class="btn primary" id="scWbGo">${esc(uiTextOr('selfcheck.wb_go', '一键写入世界书'))}</button></div><small>${esc(uiTextOr('selfcheck.wb_manual', '也可以照旧手动导入「{book}」并在世界书里设为全局', { book: wbWarn.book || '' }))}</small>` : '') + `</li>`).join('')}</ul>`;
  { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.id = 'splashAgain'; b.textContent = uiTextOr('selfcheck.splash', '重新显示开场自检');   // v0.9.5
    b.onclick = () => { showSet(false); post({ type: 'eden-map:splash' }); }; box.appendChild(b); }
  $('#scWbGo')?.addEventListener('click', () => { setPage('data'); const el = document.getElementById('thWb'); el?.scrollIntoView({ block: 'center' }); ($('#wbDiff') || $('#wbLook'))?.click(); });
  updSub();
  if (selfCheck.items.some(i => i.id === 'update')) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = uiTextOr('selfcheck.update_now', '本次切换到新版本');
    b.onclick = () => post({ type: 'eden-map:update-now' }); box.appendChild(b);
    const n = document.createElement('small'); n.textContent = uiTextOr('selfcheck.update_note', '只对这次打开的页面生效；要长期使用，请重新导入新版脚本'); box.appendChild(n);
  }
  if (selfCheck.canUpdate) {
    const lb = document.createElement('label'); lb.innerHTML = `<span>${esc(uiTextOr('selfcheck.auto_update', '自动更新到新正式版'))}</span><input type="checkbox" role="switch" id="optAutoUpd">`;
    const cb = lb.querySelector('input'); let on = !!selfCheck.autoUpdate; try { on = LocalStore.get('edenMapAutoUpdate') === '1'; } catch (e) {}
    cb.checked = on; cb.onchange = () => { try { LocalStore.set('edenMapAutoUpdate', cb.checked ? '1' : '0'); } catch (e) {} };
    box.appendChild(lb);
  }
}
export function setAbout(v) { return (about = v); }
// 任务四：卡内脚本推来的角色卡信息（经 mvu-bridge.cardInfo）。到了就重画一次版权申明页（正开着才画）
export function setCardInfo(v, tried) {
  cardInfo = v && typeof v === 'object' ? v : null; cardTried = Array.isArray(tried) ? tried : null;
  if (setPageNow === 'license') renderLicense();
  import('./profile-section.mjs').then(m => m.onCardChange?.()).catch(e => console.warn('[map] profile onCardChange', e));
  return cardInfo;
}
export function setUpdBusy(v) { return (updBusy = v); }
export function setUpdRes(v) { return (updRes = v); }
export function setSelfCheck(v) { return (selfCheck = v); }
