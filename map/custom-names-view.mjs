// MVU 联动的查看器部分（v0.9.3）：自定义名称与用途、世界时间的夜色、本人地点卡的着装、剧情改名的一次性提示。
// 数据：嵌在酒馆里时由卡内脚本 eden-map.js 推来（eden-map:custom / clock / outfit / toast），修改请求发回去（eden-map:custom-set / custom-reset / custom-sync），
//       由它写进聊天变量 eden_map.自定义；单独打开地图（没有宿主）时存本机 localStorage（与卡内脚本没有变量接口时同一个键）。
// 纯函数在 tavern/mvu-readers.mjs（数据）与 tavern/picker.mjs（v0.9.5 选择器分组、搜索、飞行目标、校验）。这里不过滤任何文字，原样显示（textContent / esc）。
// 查看器核心的状态与工具从 app/*.mjs 显式 import（arch-v2 §6 第 7 步）；别的外挂经 app/plugins.mjs 的 P 取（可能没加载，调用处带守卫）。
import { mapRegistry, aspect, currentMapId, currentMapData, pendingFocus, setPendingFocus, osdViewer } from './app/state.mjs';
import { PACK, packData } from './app/current-pack.mjs'; import { worldbookPrefix } from './core/pack.mjs';
import { esc } from './app/dom-helpers.mjs';
import { post } from './app/protocol-stamp.mjs';
import { LANG } from './app/i18n.mjs';
import { mountProgress } from './ui/progress.mjs';
import { go } from './app/map-switch.mjs';
import { estFail, estFocus, estateRoom, estateStandIn, setEstFocus } from './app/subpage3d-host.mjs';
import { cardFrom, closeCard, setCardFrom } from './app/markers.mjs';
import { estPlan, placeIndex, hereRes, markHere, setUserMoved, userMoved } from './app/locate.mjs'; import { readCustom } from './core/legacy-custom.mjs';
import { SettingsApi, showSet } from './app/settings.mjs';
import { packStorage, chatId, rebuildHere } from './app/extension-api.mjs';
import { plugins, register } from './app/plugins.mjs';
import { createTint, NIGHT_KEY } from './custom-tint.mjs'; import { createOutfit } from './custom-outfit.mjs'; import { createHints } from './custom-hints.mjs'; import { createDialogView } from './custom-dialog-view.mjs';
import { uiTextOr } from './app/text-lookup.mjs';
const CustomNamesView = (() => {
  const embed = window.top !== window;
  let MV = null, data = { items: {}, 同步世界书: true }, host = null, clock = null;
  const ready = import(new URL('tavern/mvu-readers.mjs', document.baseURI).href).then(m => { MV = m; if (!host) loadLocal(); return m; }).catch(() => null);
  const lsKey = () => 'edenMap:chat:' + (typeof chatId === 'string' ? chatId : '') + ':custom2';
  // 单独打开（或宿主还没推来）：本机存储；旧版（core/legacy-custom.mjs readCustom）的房间叫法一并迁移进来显示
  function loadLocal() {
    if (!MV) return; let o = {}; try { o = JSON.parse(packStorage?.getItem(lsKey()) || '{}') || {}; } catch (e) {}
    data = MV.normCustom(o.自定义);
    try { const old = readCustom(packStorage, typeof chatId === 'string' ? chatId : '').rooms; if (old && Object.keys(old).length) data = MV.migrateRooms(data, old).custom; } catch (e) {}
    apply();
  }
  function saveLocal() { try { packStorage?.setItem(lsKey(), JSON.stringify({ 自定义: data })); return true; } catch (e) { return false; } }

  // ---------- 给其他部分用 ----------
  const name = key => (data.items?.[key]?.名) || key;
  const entry = key => data.items?.[key] || null;
  /** app/place-resolver.mjs makeHere 的 custom 参数：房间 / 地标的自定义叫法 */
  // v0.9.6：区域、层 / 大区、世界地名的叫法，和「未上图」里选了「忽略」的名字
  function index() { if (!MV) return null; return { rooms: MV.aliasMap(data, ['room']), areas: MV.aliasMap(data, ['area']), marks: MV.aliasMap(data, ['landmark']), layers: MV.aliasMap(data, ['layer']), world: MV.aliasMap(data, ['world']), ignore: data.忽略 || [] }; }
  function apply() {
    if (typeof rebuildHere === 'function') rebuildHere();
    relabel(); renderUI();
    if (typeof plugins.CharactersView !== 'undefined') { plugins.CharactersView.render(); }
    if (typeof markHere === 'function' && typeof mapRegistry !== 'undefined' && mapRegistry) markHere(document.getElementById('here')?.value || '');
  }
  // 地图上的地名标签：有自定义显示名就换（dataset.name 仍是标准名，当前地点匹配不受影响）
  function relabel() {
    for (const el of document.querySelectorAll('.mk')) {
      const lab = el.querySelector('.lab'), tn = lab?.firstChild; if (!tn || tn.nodeType !== 3) continue;
      if (el.dataset.dn == null) el.dataset.dn = tn.nodeValue;
      const e = entry(el.dataset.name); tn.nodeValue = e?.名 || el.dataset.dn; el.classList.toggle('cu', !!e?.名);
    }
  }
  // 地点卡：显示名 + 标准名、用途
  const homeMark = name => { const e = placeIndex?.estate?.id, st = e && estateStandIn(e); return !!name && !!st && mapRegistry.maps[st.map]?.markers?.[st.marker]?.name === name; };   // 主场景的三维页在平面图上的替身地标（节点树给出）
  function decorateCard(el, title) {
    const c = document.getElementById('card'); if (!c || c.hidden) return;
    const key = title || el?.dataset?.name, e = entry(key), ex = c.querySelector('.extra'); ex.querySelectorAll('.cu-rep').forEach(n => n.remove());   // v16：按标题取条目（el 可能是上一张卡的标记），并清掉旧声望行
    if (e?.名) { c.querySelector('h2').textContent = e.名; const sb = c.querySelector('.sub'); sb.textContent = key + (sb.textContent ? ' · ' + sb.textContent : ''); }
    if (e?.用途) { const p = document.createElement('p'); p.className = 'cu-note'; p.innerHTML = `<b>${esc(uiTextOr('cu.note', '用途'))}</b> `; p.append(document.createTextNode(e.用途)); ex.prepend(p); }
    const rp = typeof plugins.CharactersView !== 'undefined' ? plugins.CharactersView.rep : null;
    if (homeMark(el?.dataset?.name) && rp != null) { const p = document.createElement('p'); p.className = 'cu-rep';   // v0.9.5 主角声望（只读，0–100）
      p.innerHTML = `<b>${esc(uiTextOr('ch.rep', '声望'))}</b><meter min="0" max="100" low="30" high="70" optimum="100" value="${rp}"></meter><span>${Math.round(rp)}</span>`; ex.prepend(p); }
    if (roomNote && homeMark(el?.dataset?.name)) {
      const r = roomNote, re = entry(r), p = document.createElement('p'); p.className = 'cu-note cu-room'; roomNote = null;
      p.innerHTML = `<b>${esc(uiTextOr('cu.room_here', '要看的房间'))}</b> `; p.append(document.createTextNode((re?.名 ? `${re.名}（${r}）` : r) + (re?.用途 ? ' · ' + re.用途 : ''))); ex.prepend(p); }
    // fix3（用户 2026-09-28）：着装属于人，不挂在地点卡上——改在人物页顶部「你（主角）」一行显示（characters-view.mjs）
  }

  // 夜色（custom-tint.mjs）、本人着装（custom-outfit.mjs）、剧情改名的一次性提示（custom-hints.mjs）、对话框 HTML 构件（custom-dialog-view.mjs）：S5-1 从本文件拆出
  const { night, nightOn, todNow } = createTint({ getClock: () => clock }), OF = createOutfit(), { toast } = createHints(), V = createDialogView({ uiTextOr }), { ic, IC, excerpt } = V;

  // ---------- 设置里的「自定义」一栏（入口 + 同步 / 存储 / 夜色）与「自定义」对话框（v0.9.5） ----------
  // 对话框三页：list 已有的自定义（卡片：原名 → 新名、用途摘要、来源；编辑 / 重置 / 在地图上看）→ pick 选择器（搜索 + 按层 / 楼层分组）→ edit 表单（校验、字数）。
  // 点卡片或选择器里的「在地图上看」= flyTo({ map, marker | room | area | character })。
  let listQ = '', PK = null, plan = null, view = 'list', editing = null, query = '', opener = null, resetArm = null, resetT = 0, flyMsg = '';
  const pk = () => (PK ? Promise.resolve(PK) : import(new URL('tavern/picker.mjs', document.baseURI).href).then(m => (PK = m)));
  const planP = () => (plan ? Promise.resolve(plan) : !packData('rooms') ? Promise.resolve(plan = {}) : Promise.all([import(new URL('estate/plan.js', document.baseURI).href).catch(() => ({})), fetch(new URL(packData('rooms'), document.baseURI)).then(r => (r.ok ? r.json() : null)).catch(() => null)])
    .then(([m, card]) => (plan = { ...m, CARD: card })));   // 卡设定分层房间（B2–F3）
  const cardPlan = () => (typeof estPlan !== 'undefined' && estPlan) || plan?.CARD || null;
  function groups() {
    if (!PK || typeof mapRegistry === 'undefined' || !mapRegistry) return [];
    return PK.buildGroups({ reg: mapRegistry, plan: plan && { ...plan, CARD: cardPlan() }, chars: typeof plugins.CharactersView !== 'undefined' ? plugins.CharactersView.items.map(c => c.name) : [], lang: typeof LANG !== 'undefined' ? LANG : 'zh' });
  }
  const allKeys = () => groups().flatMap(g => g.items.map(i => i.key));
  function targetOf(key) {
    const it = PK && PK.findItem(groups(), key); if (it) return it.target;
    const e = entry(key); if (e?.类 === 'character') return { character: key };
    if (e?.类 === 'room' || e?.类 === 'area') return { [e.类]: key };
    const r = typeof hereRes === 'function' ? hereRes(key) : null; return r?.marker ? { map: r.map, marker: r.marker } : null;
  }
  const kindOf = key => (PK && PK.findItem(groups(), key)?.kind) || entry(key)?.类 || 'landmark';

  // 设置栏：入口按钮 + 同步到世界书（默认开）+ 存在哪 + 夜色
  function renderUI() {
    const pop = document.getElementById('setPop'); if (!pop) return;
    let box = document.getElementById('cuBox');
    if (!box) { box = document.createElement('div'); box.id = 'cuBox'; if (window.SettingsApi) SettingsApi.registerSection('data', box, { order: 20 }); else { const sc = document.getElementById('selfCheck'); sc ? pop.insertBefore(box, sc) : pop.appendChild(box); }
      box.addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) { e.stopPropagation(); openDlg(b); } }); box.addEventListener('change', onChange);
      for (const ev of ['pointerenter', 'focusin']) box.addEventListener(ev, () => { if (!depsOk) (window.requestIdleCallback || setTimeout)(warm); }, { once: true }); }
    const n = Object.keys(data.items || {}).length;
    box.innerHTML = `<h3>${esc(uiTextOr('cu.title', '自定义'))}</h3>`
      + `<button type="button" class="btn cu-open" data-open="1"><span>${esc(uiTextOr('cu.manage', '名称与用途'))}</span><em>${esc(n ? uiTextOr('cu.count', '{n} 项', { n }) : uiTextOr('cu.none', '还没有'))}</em></button>`
      + (embed && host ? `<label><span>${esc(uiTextOr('cu.sync', '同步到世界书'))}</span><input type="checkbox" role="switch" id="cuSync" ${data.同步世界书 ? 'checked' : ''} ${host.wb ? '' : 'disabled'}></label>`
        + `<small>${esc(host.wb ? uiTextOr('cu.sync_hint2', '默认开：有了第一项自定义才建世界书「{book}」（每个聊天一本，一个常驻条目）。关掉只停用条目，不删世界书', { book: worldbookPrefix(PACK, PACK?.id) + '·自定义' }) : uiTextOr('cu.sync_noapi', '酒馆助手没有世界书接口，不能同步'))}</small>`
        : '')   // 任务二：书没绑上由卡内脚本静默水合（tavern/wb_jit.bindPlan + eden-map.js silentBind），前端不再提示玩家去后台手动勾
      + `<small>${esc(host ? (host.vars ? uiTextOr('cu.store_chat', '存在这个聊天的变量里（换设备、导出聊天都跟着走）；摘要会作为背景发给模型') : uiTextOr('cu.store_local', '酒馆助手没有变量接口：只存本机浏览器')) : uiTextOr('cu.store_local2', '单独打开地图：只存本机浏览器'))}</small>`
      + `<label><span>${esc(uiTextOr('cu.night', '按时段给上层、中层加色调与昼夜底图（清晨 / 傍晚 / 夜间）'))}</span><input type="checkbox" role="switch" id="optNight" ${nightOn() ? 'checked' : ''}></label>`
      + (typeof plugins.CharactersView !== 'undefined' && plugins.CharactersView.hasPortraits ? `<label><span>${esc(uiTextOr('ch.port', '使用原作头像'))}</span><input type="checkbox" role="switch" id="optPort" ${plugins.CharactersView.portOn() ? 'checked' : ''}></label><small>${esc(uiTextOr('ch.port_hint', '人物没有自己设的头像时，用卡里自带的原作立绘（作者 Yehehua，图片在作者 CDN 与作者用的另外两个图床上，按需加载）；省流时默认关。只取作者声明的立绘，且不碰卡里受限分类的图；取不到的人显示名字首字（不是故障，可以自己设头像）'))}</small>` : '');
    if (dlg && !dlg.hidden) renderDlg(false);
  }
  function onChange(ev) {
    if (ev.target.id === 'optNight') { try { LocalStore.set(NIGHT_KEY, ev.target.checked ? '1' : '0'); } catch (e) {} night(); }
    if (ev.target.id === 'cuSync') setSync(ev.target.checked);
    if (ev.target.id === 'optPort') plugins.CharactersView.setPortOn(ev.target.checked);
  }

  // ---------- 对话框 ----------
  let dlg = null;
  function mkDlg() {
    dlg = document.createElement('div'); dlg.id = 'cuDlg'; dlg.hidden = true;
    dlg.innerHTML = `<div class="cu-sheet" role="dialog" aria-modal="true" aria-labelledby="cuDlgT"><header><button type="button" class="cu-ic" data-back="1" hidden></button><h2 id="cuDlgT" tabindex="-1"></h2><button type="button" class="cu-ic" data-close="1"></button></header><div class="cu-body"></div><p class="cu-live a11y" role="status" aria-live="polite"></p></div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('click', onDlgClick); dlg.addEventListener('input', onInput); dlg.addEventListener('submit', e => { e.preventDefault(); save(); });
    dlg.addEventListener('keydown', onKey);
  }
  // fix3（用户 2026-09-28「打开自定义卡顿」）：以前先等 选择器模块 + 主场景房间表（分层房间表）+ MVU 模块全部到齐才开对话框；
  // 现在列表页立刻打开（只用已有数据），这些在后台取，进「选一个对象 / 编辑」时才等（等的时候显示统一加载组件）；设置「数据与映射」一打开就空闲预取
  const deps = () => Promise.all([pk(), planP(), ready]).catch(() => {});
  let depsOk = false; const warm = () => deps().then(() => { depsOk = true; });
  async function openDlg(from, v = 'list', key = null) {
    if (!dlg) mkDlg(); opener = from || document.activeElement; view = v; editing = key; query = ''; flyMsg = ''; resetArm = null;
    dlg.hidden = false; document.body.classList.add('cudlg');
    if (v !== 'list' && !depsOk) { loadingBody(); await warm(); if (dlg.hidden) return; }
    renderDlg(true); if (!depsOk) warm();
  }
  function loadingBody() { const b = dlg.querySelector('.cu-body'); b.innerHTML = ''; mountProgress(b, { lang: LANG }).label(uiTextOr('cu.loading', '正在准备地点与房间列表…')); }
  async function go2(v) { if (!depsOk) { view = v; loadingBody(); await warm(); if (dlg.hidden || view !== v) return; } view = v; renderDlg(true); }
  function closeDlg(restore = true) {
    if (!dlg || dlg.hidden) return; dlg.hidden = true; document.body.classList.remove('cudlg');
    if (!restore) return;
    if (!(opener?.isConnected && opener.offsetParent)) { if (window.SettingsApi) SettingsApi.open('data'); else if (document.getElementById('setPop')?.hidden && typeof showSet === 'function') showSet(true); opener = document.querySelector('#cuBox .cu-open'); }
    opener?.focus({ preventScroll: true });
  }
  function renderDlg(focus) {
    const body = dlg.querySelector('.cu-body'), h = dlg.querySelector('h2'), back = dlg.querySelector('[data-back]'), x = dlg.querySelector('[data-close]');
    back.hidden = view === 'list'; back.innerHTML = ic(IC.back); back.setAttribute('aria-label', uiTextOr('cu.back', '返回'));
    x.innerHTML = ic(IC.x); x.setAttribute('aria-label', uiTextOr('close', '关闭'));
    h.textContent = view === 'pick' ? uiTextOr('cu.pick_title', '选一个对象') : view === 'edit' ? (entry(editing) ? uiTextOr('cu.edit_title', '编辑') : uiTextOr('cu.add_title', '添加自定义')) : uiTextOr('cu.dlg_title', '名称与用途');
    if (view === 'list') body.innerHTML = V.listHtml({ data, flyMsg, listQ, resetArm });
    else if (view === 'pick') { body.innerHTML = V.pickHtml({ gs: groups(), query }); pickResults(); }
    else body.innerHTML = V.editHtml({ editing, e: entry(editing) || {}, it: PK?.findItem(groups(), editing), kd: kindOf(editing), MV });
    if (focus) {
      const f = view === 'pick' ? (matchMedia('(pointer: coarse)').matches ? null : body.querySelector('input[type=search]')) : view === 'edit' ? body.querySelector('input[name=name]') : h;
      (f || h).focus({ preventScroll: true }); if (f?.select && view === 'edit') f.select();
    }
  }
  function pickResults() {
    const box = dlg.querySelector('#cuRes'); if (!box) return;
    const gs = PK.filterGroups(groups(), query, data, uiTextOr('cu.best', '最匹配'));
    if (!gs.length) { box.innerHTML = `<p class="cu-none">${esc(uiTextOr('cu.no_match', '没有找到「{q}」。试试标准名、你起的名字或用途里的词', { q: query }))}</p>`; dlg.querySelector('.cu-chips').hidden = true; return; }
    dlg.querySelector('.cu-chips').hidden = !!query;
    box.innerHTML = V.resultsHtml(gs, entry);
  }
  const ERR = { too_long: ['cu.err_long', '太长了'], dup_std: ['cu.err_dup_std', '和另一个地点 / 人物的标准名重名，地点匹配会分不清'], dup_name: ['cu.err_dup', '和另一项的显示名重名'], empty: ['cu.err_empty', '至少填一项（想恢复原样用「重置」）'] };
  function check(show) {
    const f = dlg.querySelector('form'); if (!f || !PK) return true;
    const r = PK.validate({ key: editing, name: f.elements.name.value, note: f.elements.note.value, custom: data, keys: allKeys(), maxName: MV?.MAX_NAME, maxNote: MV?.MAX_NOTE });
    const nu = [...f.elements.note.value.trim()].length, max = MV?.MAX_NOTE || 200, cnt = dlg.querySelector('#cuNoteCnt');
    cnt.textContent = `${nu} / ${max}`; cnt.classList.toggle('near', nu > max * .9);
    const nm = r.name && (show || r.name !== 'empty') ? uiTextOr(...ERR[r.name]) : '', nt = r.note ? uiTextOr(...ERR[r.note]) : '';
    dlg.querySelector('#cuNameErr').textContent = nm; dlg.querySelector('#cuNoteErr').textContent = nt;
    f.elements.name.setAttribute('aria-invalid', nm ? 'true' : 'false'); f.elements.note.setAttribute('aria-invalid', nt ? 'true' : 'false');
    f.querySelector('[type=submit]').setAttribute('aria-disabled', r.ok ? 'false' : 'true');
    return r.ok;
  }
  function onInput(ev) {
    if (ev.target.id === 'cuQ') { query = ev.target.value; pickResults(); }
    else if (ev.target.id === 'cuLQ') { listQ = ev.target.value; const pos = ev.target.selectionStart; renderDlg(false); const i = dlg.querySelector('#cuLQ'); i.focus(); i.setSelectionRange(pos, pos); }
    else if (ev.target.form) check(false);
  }
  function say(s) { const l = dlg?.querySelector('.cu-live'); if (l) { l.textContent = ''; setTimeout(() => { l.textContent = s; }, 30); } }
  function onDlgClick(ev) {
    if (ev.target === dlg) return closeDlg();
    const b = ev.target.closest('button'); if (!b) return; ev.stopPropagation();
    const d = b.dataset;
    if (d.close) closeDlg();
    else if (d.back) { view = view === 'edit' && !entry(editing) ? 'pick' : 'list'; renderDlg(true); }
    else if (d.pick) go2('pick');
    else if (d.pickkey != null) { editing = d.pickkey; go2('edit'); }
    else if (d.edit != null) { editing = d.edit; go2('edit'); }
    else if (d.jump) { const s = dlg.querySelector(`section[data-g="${CSS.escape(d.jump)}"]`); s?.scrollIntoView({ block: 'start' }); s?.querySelector('button')?.focus({ preventScroll: true }); }
    else if (d.reset != null) {
      if (resetArm !== d.reset) { resetArm = d.reset; clearTimeout(resetT); resetT = setTimeout(() => { resetArm = null; if (!dlg.hidden && view === 'list') renderDlg(false); }, 4000); renderDlg(false); dlg.querySelector(`[data-reset="${CSS.escape(d.reset)}"]`)?.focus(); return; }
      resetArm = null; const k = d.reset; removeCustom(k).then(ok => { if (ok) say(uiTextOr('cu.reset_done', '已重置 {n}', { n: k })); setTimeout(() => { if (!dlg.hidden) (dlg.querySelector('[data-edit]') || dlg.querySelector('.cu-add'))?.focus(); }, 60); });
    }
    else if (d.fly != null) fly(d.fly);
    else if (d.unalias != null) { const k = d.unalias, a = d.a; setCustom(k, { unalias: a }).then(ok => { if (ok) say(uiTextOr('cu.unalias_done', '已去掉叫法 {a}', { a })); }); }
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (view !== 'list') { view = view === 'edit' && !entry(editing) ? 'pick' : 'list'; renderDlg(true); } else closeDlg(); return; }
    if (e.key === 'Enter' && e.target.id === 'cuQ') { e.preventDefault(); dlg.querySelector('#cuRes .cu-row')?.focus(); return; }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (e.target.classList.contains('cu-row') || e.target.id === 'cuQ')) {
      const rows = [...dlg.querySelectorAll('#cuRes .cu-row')], i = rows.indexOf(e.target), n = e.key === 'ArrowDown' ? i + 1 : i - 1;
      e.preventDefault(); if (n < 0) dlg.querySelector('#cuQ')?.focus(); else rows[Math.min(n, rows.length - 1)]?.focus(); return; }
    if (e.key !== 'Tab') return;
    const f = [...dlg.querySelectorAll('button, input, textarea, [tabindex="0"]')].filter(x => x.offsetParent && !x.disabled); if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
  }
  // 查看器的全局按键（捕获阶段）先问这里：对话框开着时一律不交给地图（Esc 不会顺带关掉设置或整个面板；[ ] 不切层）
  function dlgKey(e) { if (!dlg || dlg.hidden) return false; if (!dlg.contains(e.target)) { onKey(e); if (e.key === 'Tab' && !e.defaultPrevented) { e.preventDefault(); dlg.querySelector('h2').focus(); } } return true; }
  function save() {
    if (!check(true)) { dlg.querySelector('[aria-invalid=true]')?.focus(); return; }
    const f = dlg.querySelector('form'), key = editing;
    setCustom(key, { name: f.elements.name.value, note: f.elements.note.value, kind: kindOf(key), source: 'manual' }).then(ok => {
      if (!ok) { dlg.querySelector('#cuNameErr').textContent = uiTextOr('cu.err_save', '没存上，请再试一次'); return; }
      view = 'list'; editing = null; renderDlg(false); say(uiTextOr('cu.saved', '已保存')); dlg.querySelector(`[data-edit="${CSS.escape(key)}"]`)?.focus();
    });
  }
  // 点了「在地图上看」：关掉对话框和设置，飞过去；飞不了（人物不在人物栏、找不到地点）就留在对话框里说明
  async function fly(key) {
    await pk(); const t = targetOf(key);
    const r = t ? await flyTo(t) : false;
    if (r) { closeDlg(false); if (typeof showSet === 'function') showSet(false); return; }
    flyMsg = uiTextOr('cu.fly_none', '「{n}」现在不在地图上（人物要先在人物栏里出现）', { n: entry(key)?.名 || key });
    if (view === 'list') renderDlg(false); else say(flyMsg);
  }

  // ---------- 飞行（EdenMap.flyTo 也走这里） ----------
  // 地标：切到那一层并打开地点卡；主场景房间 / 室外：进主场景并聚焦（estate:room），主场景不可用（本次会话加载失败过）时落到平面图上的替身地标并在地点卡里写上要看的房间；人物：人物栏的飞行。
  let roomNote = null;
  async function flyTo(target) {
    const M = await pk().catch(() => null), t = M?.normTarget(target); if (!t || typeof mapRegistry === 'undefined' || !mapRegistry) return false;
    if (typeof closeCard === 'function') closeCard();
    if (t.character) {
      const norm = s => String(s || '').trim().toLowerCase(), want = norm(MV?.findKey(data, t.character) || t.character);
      const c = typeof plugins.CharactersView !== 'undefined' && plugins.CharactersView.items.find(c => norm(c.name) === want); if (!c) return false;
      plugins.CharactersView.fly(c.name); return true;
    }
    if (t.room || t.area) {
      const name = t.room || t.area, eid = placeIndex?.estate?.id;
      if (!eid) return false;
      if (!(typeof estFail !== 'undefined' && estFail) && mapRegistry.maps[eid].status !== 'planned') {
        roomNote = null; setEstFocus(name);
        const CP = cardPlan(), cr = t.floor && CP?.rooms?.find(r => r.floor === t.floor && (r.name === name || r.card_id === name));   // 卡设定分层房间：多边形随 estate:room 发给主场景页画框
        window.__selectedRoomPlan = cr ? { name, storey: cr.floor, kind: cr.kind, area: cr.area, poly: cr.poly, z: (CP.floors.find(f => f.id === cr.floor) || {}).z } : null; if (currentMapId === eid) estateRoom(); else { setPendingFocus(null); go(eid); } return true;
      }
      const s = estateStandIn(eid); if (!s) return false; roomNote = name; return flyMarker(s.map, s.marker);
    }
    if (t.marker && mapRegistry.maps[t.map]?.markers?.[t.marker]) { roomNote = null; return flyMarker(t.map, t.marker); }
    return false;
  }
  function flyMarker(map, id) {
    if (map !== currentMapId) { setPendingFocus(id); go(map); return true; }
    const nm = mapRegistry.maps[map].markers[id].name, el = [...document.querySelectorAll('.mk')].find(e => e.dataset.name === nm), k = currentMapData?.markers?.find(x => x.id === id);
    if (k && osdViewer?.viewport) { setUserMoved(true); osdViewer.viewport.panTo(new OpenSeadragon.Point(k.ax ?? k.nx, (k.ay ?? k.ny) * aspect)); }
    if (el) setTimeout(() => { setCardFrom(el); el._open(); }, 350);
    return true;
  }

  // ---------- 读写（EdenMap 也走这里） ----------
  async function setCustom(key, patch) {
    const M = MV || await ready; if (!M) return false;
    if (embed && host) { if (!M.setCustom(data, key, patch)) return false; post({ type: 'eden-map:custom-set', key, patch }); return true; }
    const r = M.setCustom(data, key, patch); if (!r) return false; data = r; saveLocal(); apply(); return true;
  }
  async function removeCustom(key) {
    const M = MV || await ready; if (!M) return false; key = M.findKey(data, key) || key; if (!data.items[key]) return false;
    if (embed && host) { post({ type: 'eden-map:custom-reset', key }); return true; }
    data = M.removeCustom(data, key); saveLocal(); apply(); return true;
  }
  function setSync(on) { if (embed && host) post({ type: 'eden-map:custom-sync', on: !!on }); }
  // 宿主推来的
  function fromHost(d) { host = { vars: !!d.vars, wb: !!d.wb, wbState: d.wbState || '' }; ready.then(M => { if (!M) return; data = M.normCustom(d.data); apply(); }); }
  const preTag = () => document.body.classList.toggle('prestart', !!clock?.pre);   // 开局前（卡初始值）：宿主标题栏的时钟另有标注
  function setClock(c) { const was = !!clock?.pre; clock = c; night(); if (was !== !!c?.pre) { plugins.EventsView?.renderBar?.(); preTag(); } }
  function chatChanged() { if (!host) ready.then(loadLocal); }

  const css = `
  #cuBox{margin-top:var(--sp-5);padding-top:var(--sp-5);border-top:1px solid var(--line)}
  #cuBox .cu-open{display:flex;width:100%;min-height:var(--hit,44px);justify-content:space-between;align-items:center;gap:var(--sp-4);margin:0 0 var(--sp-4);padding:0 var(--sp-5);box-sizing:border-box}
  #cuBox .cu-open em{font-style:normal;color:var(--muted);font-size:var(--fs-small)}
  #cuBox small.cu-warn{color:var(--alert)}
  /* 对话框：桌面居中 560 宽；≤ 640 全屏底板 */
  #cuDlg{position:fixed;inset:0;z-index:40;display:grid;place-items:center;background:color-mix(in srgb,var(--bg) 55%,transparent);color:var(--ink);font-family:var(--font-ui)}
  #cuDlg[hidden]{display:none}
  #cuDlg .cu-res section,#cuDlg .cu-cards>li{content-visibility:auto;contain-intrinsic-size:auto 220px}   /* fix3：长列表只排版看得见的部分 */
  #cuDlg .cu-cards>li{contain-intrinsic-size:auto 120px}
  #cuDlg .cu-body .uiprog{margin:var(--sp-6) auto}
  #cuDlg .cu-sheet{width:min(560px,calc(100vw - 32px));max-height:min(86vh,760px);display:flex;flex-direction:column;background:var(--surface);color:var(--ink);border:1px solid var(--line-strong);border-radius:var(--r-l);box-shadow:var(--sh-3);overflow:hidden}
  #cuDlg header{display:flex;align-items:center;gap:var(--sp-2);padding:var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-5);border-bottom:1px solid var(--line)}
  #cuDlg header h2{flex:1;margin:0;font-size:var(--fs-title);font-weight:600;outline:none}
  #cuDlg header [data-back]:not([hidden])+h2{margin-left:-4px}
  #cuDlg .cu-ic{flex:none;width:var(--hit,44px);height:var(--hit,44px);display:grid;place-items:center;border:0;border-radius:var(--r-m);background:none;color:var(--ink-2);cursor:pointer}
  #cuDlg .cu-ic:hover{background:var(--surface-2);color:var(--ink)}
  #cuDlg .ico{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
  #cuDlg .cu-body{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:var(--sp-5)}
  #cuDlg .btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--sp-3);min-height:var(--hit,44px);padding:0 var(--sp-5);box-sizing:border-box;font:inherit;font-size:var(--fs-control);color:var(--ink);background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-m);cursor:pointer}
  #cuDlg .btn:hover{border-color:var(--line-strong)}
  #cuDlg .btn.pri{background:var(--accent);border-color:var(--accent);color:var(--on-accent);font-weight:600}
  #cuDlg .btn.warn{border-color:var(--alert);color:var(--alert)}
  #cuDlg .btn[aria-disabled=true]{opacity:.55}
  #cuDlg .cu-add{width:100%;margin-bottom:var(--sp-5)}
  #cuDlg .cu-lq{margin-bottom:var(--sp-5)}
  #cuDlg .cu-msg{margin:0 0 var(--sp-5);padding:var(--sp-4) var(--sp-5);border-radius:var(--r-m);background:var(--accent-weak);font-size:var(--fs-small);line-height:1.5}
  #cuDlg .cu-emptybox{padding:var(--sp-5);border:1px dashed var(--line-strong);border-radius:var(--r-m);color:var(--ink-2);font-size:var(--fs-small);line-height:1.6}
  #cuDlg .cu-emptybox p{margin:0 0 var(--sp-4)}
  #cuDlg .cu-emptybox ul{margin:0;padding:0;list-style:none;display:grid;gap:var(--sp-4)}
  #cuDlg .cu-emptybox li b{color:var(--ink);font-weight:600}
  #cuDlg .cu-emptybox li small{display:block;color:var(--muted);font-size:var(--fs-small)}
  #cuDlg .cu-cards{list-style:none;margin:0;padding:0;display:grid;gap:var(--sp-4)}
  #cuDlg .cu-card{border:1px solid var(--line);border-radius:var(--r-m);background:var(--surface-2);overflow:hidden}
  #cuDlg .cu-main{display:flex;flex-direction:column;align-items:stretch;gap:var(--sp-2);width:100%;min-height:var(--hit,44px);padding:var(--sp-4) var(--sp-5);border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
  #cuDlg .cu-main:hover{background:var(--accent-weak)}
  #cuDlg .cu-names{display:flex;flex-wrap:wrap;align-items:baseline;gap:var(--sp-3);font-size:var(--fs-body);word-break:break-all}
  #cuDlg .cu-al{display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-2);padding:0 var(--sp-5) var(--sp-3)}
  #cuDlg .cu-al small{color:var(--muted)}
  #cuDlg .cu-names s{text-decoration:none;color:var(--muted);font-size:var(--fs-small)}
  #cuDlg .cu-names i{font-style:normal;color:var(--muted)}
  #cuDlg .cu-names b{font-weight:600}
  #cuDlg .cu-ex{color:var(--ink-2);font-size:var(--fs-small);line-height:1.5;word-break:break-all}
  #cuDlg .cu-tags{display:flex;gap:var(--sp-3)}
  #cuDlg .cu-tags em,#cuDlg .cu-target em{font-style:normal;font-size:var(--fs-micro);padding:1px var(--sp-3);border-radius:var(--r-pill);border:1px solid var(--line);color:var(--ink-2)}
  #cuDlg .cu-tags em.src-tag{border-color:var(--line-strong);color:var(--accent)}
  #cuDlg .cu-card .cu-acts{display:flex;border-top:1px solid var(--line)}
  #cuDlg .cu-card .cu-acts .btn{flex:1;border:0;border-radius:0;background:none;min-width:0;padding:0 var(--sp-3)}
  #cuDlg .cu-card .cu-acts .btn+.btn{border-left:1px solid var(--line)}
  #cuDlg .cu-card .cu-acts .btn:hover{background:var(--surface-2)}
  #cuDlg .cu-card .cu-acts .btn.warn{color:var(--alert)}
  #cuDlg .cu-search{position:sticky;top:calc(-1 * var(--sp-5));z-index:1;margin:calc(-1 * var(--sp-5)) calc(-1 * var(--sp-5)) 0;padding:var(--sp-5);background:var(--surface)}
  #cuDlg input[type=search],#cuDlg input[type=text],#cuDlg textarea{width:100%;box-sizing:border-box;min-height:var(--hit,44px);padding:var(--sp-4) var(--sp-5);font:inherit;font-size:16px;color:var(--ink);background:var(--bg);border:1px solid var(--line-strong);border-radius:var(--r-m)}
  #cuDlg textarea{resize:vertical;line-height:1.5}
  #cuDlg input::placeholder,#cuDlg textarea::placeholder{color:var(--muted);opacity:1}
  #cuDlg [aria-invalid=true]{border-color:var(--alert)}
  #cuDlg .cu-chips{display:flex;gap:var(--sp-3);overflow-x:auto;padding:0 0 var(--sp-4);scrollbar-width:none}
  #cuDlg .cu-chips[hidden]{display:none}
  #cuDlg .chip{flex:none;min-height:var(--hit,44px);padding:0 var(--sp-5);border:1px solid var(--line);border-radius:var(--r-pill);background:none;color:var(--ink-2);font:inherit;font-size:var(--fs-small);cursor:pointer;white-space:nowrap}
  #cuDlg .chip:hover{border-color:var(--line-strong);color:var(--ink)}
  #cuDlg .cu-res section{margin-bottom:var(--sp-5)}
  #cuDlg .cu-res h4{margin:0;padding:var(--sp-3) 0;font-size:var(--fs-small);font-weight:600;color:var(--muted);border-bottom:1px solid var(--line)}
  #cuDlg .cu-res h4 small{font-weight:400}
  #cuDlg .cu-res ul{list-style:none;margin:0;padding:0}
  #cuDlg .cu-res li{display:flex;align-items:stretch;border-bottom:1px solid var(--line)}
  #cuDlg .cu-row{flex:1;min-width:0;min-height:var(--hit,44px);display:flex;flex-wrap:wrap;align-items:baseline;gap:0 var(--sp-3);padding:var(--sp-3) var(--sp-3);border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
  #cuDlg .cu-row:hover{background:var(--accent-weak)}
  #cuDlg .cu-row b{font-weight:600;font-size:var(--fs-body)}
  #cuDlg .cu-row small{color:var(--muted);font-size:var(--fs-small)}
  #cuDlg .cu-row span{flex-basis:100%;color:var(--ink-2);font-size:var(--fs-small);line-height:1.45;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #cuDlg .cu-row .cu-u{color:var(--accent)}
  #cuDlg .cu-none{color:var(--ink-2);font-size:var(--fs-small);line-height:1.6}
  #cuDlg .cu-form{display:flex;flex-direction:column;gap:var(--sp-3)}
  #cuDlg .cu-target{display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-3) var(--sp-4);margin:0 0 var(--sp-4);padding:0 0 var(--sp-5);border-bottom:1px solid var(--line)}
  #cuDlg .cu-target b{font-size:var(--fs-title);font-weight:600}
  #cuDlg .cu-target small{color:var(--muted);font-size:var(--fs-small)}
  #cuDlg .cu-target .btn{margin-left:auto}
  #cuDlg label.col{font-size:var(--fs-small);color:var(--ink-2);margin-top:var(--sp-4)}
  #cuDlg label.col small{color:var(--muted);font-size:var(--fs-micro)}
  #cuDlg .cu-err{color:var(--alert);font-size:var(--fs-small);min-height:0}
  #cuDlg .cu-err:empty{display:none}
  #cuDlg .cu-cnt{display:flex;justify-content:space-between;gap:var(--sp-4)}
  #cuDlg #cuNoteCnt{margin-left:auto;color:var(--muted);font-size:var(--fs-small);font-variant-numeric:tabular-nums}
  #cuDlg #cuNoteCnt.near{color:var(--alert)}
  #cuDlg .cu-form .cu-acts{display:flex;gap:var(--sp-4);margin-top:var(--sp-5)}
  #cuDlg .cu-form .cu-acts .btn{flex:1}
  #cuDlg .a11y{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
  @media (max-width:640px){
    #cuDlg{place-items:stretch}
    #cuDlg .cu-sheet{width:100vw;max-height:none;height:100dvh;border:0;border-radius:0;padding-bottom:env(safe-area-inset-bottom)}
    #cuDlg .cu-body{padding:var(--sp-5) var(--sp-6)}
    #cuDlg .cu-search{margin:calc(-1 * var(--sp-5)) calc(-1 * var(--sp-6)) 0;padding:var(--sp-5) var(--sp-6)}
    #cuDlg .cu-card .cu-acts .btn span{font-size:var(--fs-small)}
    #cuDlg .cu-form .cu-acts{position:sticky;bottom:calc(-1 * var(--sp-5));margin:var(--sp-5) calc(-1 * var(--sp-6)) calc(-1 * var(--sp-5));padding:var(--sp-4) var(--sp-6) var(--sp-5);background:var(--surface);border-top:1px solid var(--line)}
  }
  #card .cu-note,#card .cu-outfit{margin:0 0 var(--sp-3,6px);font-size:var(--fs-micro);line-height:1.5;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #card .cu-note{white-space:normal}
  #card .cu-rep{display:flex;align-items:center;gap:var(--sp-4);margin:0 0 var(--sp-3);font-size:var(--fs-micro)}#card .cu-rep b{color:var(--muted);font-weight:600}#card .cu-rep meter{flex:1;max-width:140px;height:8px}#card .cu-rep span{font-variant-numeric:tabular-nums;color:var(--ink)}#card .cu-note b{color:var(--muted);font-weight:600}
  #cuToast{position:absolute;left:50%;transform:translateX(-50%);top:var(--sp-5,12px);z-index:7;max-width:min(420px,calc(100% - 24px));box-sizing:border-box;padding:8px 14px;border-radius:var(--r-m,8px);
    background:var(--surface);color:var(--ink);border:1px solid var(--accent);box-shadow:0 6px 20px rgba(0,0,0,.3);font-size:var(--fs-micro);line-height:1.5}
  #cuToast[hidden]{display:none}
  body.nighttint #osd::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:1;background:radial-gradient(ellipse at 50% 40%,rgba(20,32,70,.18),rgba(6,10,28,.38));mix-blend-mode:multiply;transition:opacity .6s}
  body[data-tod=dawn]:not([data-base-tod]) #osd::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:1;background:linear-gradient(180deg,rgba(255,196,200,.16),rgba(214,200,230,.10));mix-blend-mode:multiply;transition:opacity .6s}
  body[data-tod=dusk]:not([data-base-tod]) #osd::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:1;background:linear-gradient(180deg,rgba(255,170,120,.22),rgba(200,140,150,.16));mix-blend-mode:multiply;transition:opacity .6s}
  @media (prefers-reduced-motion:reduce){body.nighttint #osd::after,body[data-tod] #osd::after{transition:none}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  document.addEventListener('DOMContentLoaded', () => renderUI());
  return { name, entry, index, relabel, decorateCard, flyTo, openDlg, dlgKey, fromHost, setClock, setOutfit: OF.setOutfit, toast, chatChanged, setCustom, removeCustom, setSync, renderUI, todNow, nightOn,
    get data() { return MV ? MV.normCustom(data) : { items: {} }; }, get outfit() { return OF.outfit ? { ...OF.outfit } : null; }, get clock() { return clock ? { ...clock } : null; }, ready };
})();
register('CustomNamesView', CustomNamesView);
export { CustomNamesView };
