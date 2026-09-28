// 设置弹层：分页、TCSettings.registerSection、搜索、initSettings、关于 / 检查更新、自检。
import { $, esc, post, tx } from './util.mjs';
import { LANG, paintSegs, setTheme } from './i18n.mjs';
import { buildInfo } from './topbar.mjs';
import { estateLook, narrowNow, v3dEntries } from './estate.mjs';
import { firstRunHint, noticeRefresh, setActs } from './shell.mjs';
import { P } from './plugins.mjs';
import * as TCCvd from './cvd.mjs';
// ---------------- 设置（UI v2 §5）：首页 = 分组列表（+ 手机上的快捷：上一级、当前位置、关闭地图、切层、图层开关）；子页 显示 / 人物 / 数据与映射 / 更新与版本 / 高级 ----------------
// 模块向指定页注册自己的一栏：TCSettings.registerSection(page, el, { order })，不再 insertBefore(#selfCheck)。
export let setPageNow = 'home', setPrev = null;
const PAGES = { home: ['settings_title', '设置'], display: ['s.display', '显示'], people: ['s.people', '人物'], data: ['s.data', '数据与映射'], update: ['s.update', '更新与版本'], adv: ['s.adv', '高级'] };
export function setPage(pg, quiet) {
  if (!PAGES[pg]) pg = 'home'; setPageNow = pg;
  document.querySelectorAll('#setPop .spage').forEach(x => { x.hidden = x.dataset.page !== pg; });
  $('#setBack').hidden = pg === 'home'; $('#setTitle').textContent = tx(...PAGES[pg]);
  if (!quiet) { $('#setPop').scrollTop = 0; const f = pg === 'home' ? ($('#setQ')?.offsetParent ? $('#setQ') : $('#setPop .sgroups button')) : $('#setBack'); f?.focus({ preventScroll: true }); }
  if (pg === 'update') renderSelfCheck();
  if (pg === 'people') { const n = typeof P.TCChars !== 'undefined' ? P.TCChars.count() : 0; $('#chSrc').textContent = tx('s.ch_src_n', `当前聊天 ${n} 人`, { n }); }
  if (pg === 'adv') v3dEntries();
  if (pg === 'data') { if (window.top !== window) post({ type: 'eden-map:storage-info' }); else window.renderStorage?.(null); }
}
export const TCSettings = window.TCSettings = {
  registerSection(page, el, o = {}) { const pg = document.querySelector(`#setPop .spage[data-page="${page}"]`) || document.querySelector('#setPop .spage[data-page="adv"]'); if (!pg || !el) return;
    el.dataset.order = o.order ?? 50; const after = [...pg.children].find(c => c.dataset.order != null && +c.dataset.order > +el.dataset.order); after ? pg.insertBefore(el, after) : pg.appendChild(el); },
  open(page = 'home') { showSet(true); setPage(page); },
  get page() { return setPageNow; },
};
// 设置里的搜索（桌面首屏顶，§5）：按每一行的文字找，结果点一下进那一页并高亮那一行
function setSearch(q) {
  const box = $('#setHits'); box.innerHTML = ''; q = q.trim().toLowerCase(); $('#setPop .sgroups').hidden = !!q; if (!q) return;
  const rows = []; for (const pg of document.querySelectorAll('#setPop .spage:not([data-page="home"])'))
    for (const r of pg.querySelectorAll(':scope > .row, :scope > .hrow, :scope > label, details > summary, #aboutBox > label, #selfCheck > b, #cuBox .cu-open, #cmpBox > summary')) {
      const txt = (r.textContent || '').trim(); if (txt && txt.toLowerCase().includes(q)) rows.push([pg.dataset.page, r, txt.slice(0, 40)]); }
  if (!rows.length) { box.innerHTML = `<small>${esc(tx('s.no_hit', '没有找到'))}</small>`; return; }
  for (const [pg, r, txt] of rows.slice(0, 12)) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn';
    b.innerHTML = `${esc(txt)}<small>${esc(tx(...PAGES[pg]))}</small>`;
    b.onclick = () => { setPage(pg); r.closest('details')?.setAttribute('open', ''); r.scrollIntoView({ block: 'center' }); r.classList.add('found'); setTimeout(() => r.classList.remove('found'), 1600); (r.querySelector('input, button') || r).focus?.({ preventScroll: true }); };
    box.appendChild(b); }
}
export const rmPref = () => { try { return TCStore.get('edenMapRM') || 'auto'; } catch (e) { return 'auto'; } };
export const q3Pref = () => { try { return TCStore.get('edenMap3dQ') || 'auto'; } catch (e) { return 'auto'; } };
const rmNow = () => rmPref() === 'on' || (rmPref() === 'auto' && matchMedia('(prefers-reduced-motion: reduce)').matches);
function applyRM() { document.documentElement.classList.toggle('rm', rmPref() === 'on'); window.__rm = rmNow(); estateLook(); }
export function initSettings() {
  const btn = $('#setBtn'), pop = $('#setPop');
  const firstIn = el => el.querySelector('button:not([hidden]), input, [tabindex="0"]');
  let opener = null;
  showSet = (on, page) => { const was = !pop.hidden; pop.hidden = !on; btn.setAttribute('aria-expanded', on ? 'true' : 'false'); $('#thumbBtn')?.setAttribute('aria-expanded', on ? 'true' : 'false');
    document.body.classList.toggle('setopen', !!on);
    if (on) { showLay(false); if (!was) { opener = document.activeElement; setPrev = window.TCSheet ? { tab: TCSheet.tab, top: TCSheet.body.scrollTop } : null; setPage(page || 'home', true); pop.scrollTop = 0; firstIn(pop)?.focus({ preventScroll: true }); setActs(); } }
    else if (was) { $('#setQ').value = ''; setSearch(''); if (setPrev && window.TCSheet) { if (setPrev.tab) TCSheet.setTab(setPrev.tab); TCSheet.body.scrollTop = setPrev.top; } setPrev = null; noticeRefresh(); } };
  $('#setX').onclick = e => { e.stopPropagation(); showSet(false); };
  $('#setBack').onclick = e => { e.stopPropagation(); setPage('home'); };
  pop.querySelector('.sgroups').addEventListener('click', e => { const b = e.target.closest('button[data-page]'); if (b) setPage(b.dataset.page); });
  $('#setQ').addEventListener('input', e => setSearch(e.target.value));
  btn.onclick = e => { e.stopPropagation(); showSet(pop.hidden); };
  // 目标已被重绘移出文档（如「检查更新」按钮点完即重绘）不算点在外面
  const gone = t => t instanceof Node && !t.isConnected;
  document.addEventListener('click', e => { if (!pop.hidden && !narrowNow() && !gone(e.target) && !pop.contains(e.target) && !btn.contains(e.target) && !e.target.closest?.('#thumbBtn, .rg, #cuDlg, #umDlg')) showSet(false); });
  // 「图层 ▾」弹层：挂在按钮下方、右对齐
  const lb = $('#layBtn'), lp = $('#layPop');
  showLay = on => { lp.hidden = !on; lb.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) { showSet(false); const r = lb.getBoundingClientRect(); lp.style.left = Math.max(8, Math.min(innerWidth - lp.offsetWidth - 8, r.right - lp.offsetWidth)) + 'px'; firstIn(lp)?.focus({ preventScroll: true }); } };
  lb.onclick = e => { e.stopPropagation(); showLay(lp.hidden); };
  // 弹层里 Tab 循环，不跑回地图（焦点陷阱，关闭后回到入口）
  for (const el of [pop, lp]) el.addEventListener('keydown', e => { if (e.key !== 'Tab') return;
    const f = [...el.querySelectorAll('button, input, summary, select, [tabindex="0"]')].filter(x => x.offsetParent && !x.disabled); if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } });
  document.addEventListener('click', e => { if (!lp.hidden && !gone(e.target) && !lp.contains(e.target) && !lb.contains(e.target)) showLay(false); });
  // 表单正在编辑时通知先不出（§3）
  pop.addEventListener('focusin', noticeRefresh); pop.addEventListener('focusout', () => setTimeout(noticeRefresh, 0));
  { const cs = $('#optCharStats'); try { cs.checked = TCStore.get('edenMapCharStats') !== '0'; } catch (e) {} cs.onchange = () => P.TCChars.setStatsOn(cs.checked); }   // v0.9.6 E2 / E13
  { const cm = $('#optCharMore'); try { cm.checked = TCStore.get('edenMapCharMore') !== '0'; } catch (e) {} cm.onchange = () => P.TCChars.setMoreOn(cm.checked); }   // v0.9.6 E13 其余字段
  // 关闭花屏特效：只停动画和滤镜，「⚠ 数据链路受扰」文字照常显示；系统开了「减少动态效果」时默认勾上（E4 N24）
  const fx = $('#optNoFx'); let nofx = matchMedia('(prefers-reduced-motion: reduce)').matches || rmPref() === 'on';
  try { const v = TCStore.get('edenMapNoFx'); if (v !== null) nofx = v === '1'; } catch (e) {}
  fx.checked = nofx; document.body.classList.toggle('nofx', nofx);
  fx.onchange = () => { document.body.classList.toggle('nofx', fx.checked); try { TCStore.set('edenMapNoFx', fx.checked ? '1' : '0'); } catch (e) {} };
  // 显示：主题、减少动态（跟随系统 / 开 / 关）、三维画质（三维页像素比上限）
  $('#themeSeg').addEventListener('click', e => { const b = e.target.closest('button[data-th]'); if (b) setTheme(b.dataset.th); });
  $('#rmSeg').addEventListener('click', e => { const b = e.target.closest('button[data-rm]'); if (!b) return; try { TCStore.set('edenMapRM', b.dataset.rm); } catch (x) {} applyRM(); paintSegs(); });
  $('#q3Seg').addEventListener('click', e => { const b = e.target.closest('button[data-q]'); if (!b) return; try { TCStore.set('edenMap3dQ', b.dataset.q); } catch (x) {} paintSegs(); estateLook(); });
  $('#cvdSeg').addEventListener('click', e => { const b = e.target.closest('button[data-cvd]'); if (!b) return; TCCvd.setMode(b.dataset.cvd); paintSegs(); estateLook(); });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', applyRM); applyRM();
  // 高级：三维抽屉自动收起（默认关，§10.5）、单字母快捷键（默认开）、调试帧率、线路（嵌入时由卡内脚本换线路）
  const sw = (id, key, def, fn) => { const c = $(id); let on = def; try { const v = TCStore.get(key); if (v !== null) on = v === '1'; } catch (e) {} c.checked = on;
    c.onchange = () => { try { TCStore.set(key, c.checked ? '1' : '0'); } catch (e) {} fn?.(c.checked); }; };
  sw('#optFog', 'edenMapFog', false, v => { $('#fogRow').hidden = !v; window.TCFog?.toggle(v); }); $('#fogRow').hidden = TCStore.get('edenMapFog') !== '1';
  $('#fogReset').onclick = () => window.TCFog?.reset();
  sw('#optAuto3d', 'edenMap3dAuto', false, () => estateLook()); sw('#optKeys', 'edenMapKeys', true); sw('#optFps', 'edenMapFps', false, () => estateLook());
  $('#linePick').onclick = () => { showSet(false); post({ type: 'eden-map:line-pick' }); };
  $('#kbdBtn').onclick = () => kbdHelp($('#kbdHelp').hidden);
  $('#hintAgain').onclick = () => { try { TCStore.remove('edenMapHint'); TCStore.remove('edenMapHintN'); } catch (e) {} showSet(false); firstRunHint(); };
}
// 设置「数据与映射」→ app/storage-ui.mjs（arch-v2 §6 第 6 步 settings-ui 的第一块）
export function kbdHelp(on) {
  const b = $('#kbdHelp'); b.hidden = !on; $('#kbdBtn').setAttribute('aria-expanded', on ? 'true' : 'false'); if (!on) return;
  const K = [['Esc', tx('k.esc', '关闭最上面一层 / 抽屉降一档')], ['[ ]  PgUp PgDn', tx('k.layer', '切换上下层')], ['L', tx('k.l', '标注开关')], ['+ −', tx('k.zoom', '缩放')], ['0', tx('k.home', '复位视野')],
    ['/', tx('k.search', '设置搜索')], ['M', tx('k.m', '变量映射')], ['?', tx('k.help', '快捷键表')]];
  b.innerHTML = `<dl>${K.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}
export let showSet = () => {}, showLay = () => {};
// v0.9.6「关于 / 检查更新」：卡内脚本发来 eden-map:about { version, code, channel: tag | follow | ref | local, ref, sha, line }；
// 「检查更新」发 eden-map:check-update，卡内脚本查最新 map-v 标签的 build.json（走当前线路、绕缓存）后回 eden-map:update-result。不自动安装。
// 单独打开（不在酒馆里）时只显示地图自己的 build.json。
export let about = null, updRes = null, updBusy = false;
export function renderAbout() {
  const box = $('#aboutBox'); if (!box) return; const en = LANG === 'en';
  const a = about || {}, ver = a.version || buildInfo?.version || '', code = a.code || buildInfo?.code || '';
  const ch = { tag: tx('about.ch_tag', `固定版本 ${a.ref || ''}`, { ref: a.ref || '' }), follow: tx('about.ch_follow', `跟随分支 ${a.ref || ''}（每次打开取最新提交）`, { ref: a.ref || '' }),
    latest: a.locked ? tx('about.ch_locked', `已锁定 ${a.ref || ''}`, { ref: a.ref || '' }) : tx('about.ch_latest', `自动用最新正式版（当前 ${a.ref || ''}）`, { ref: a.ref || '' }),
    ref: tx('about.ch_ref', `预览提交 ${a.ref || ''}`, { ref: a.ref || '' }), local: tx('about.ch_local', '本地 / 单独打开') }[a.channel || (window.top === window ? 'local' : '')] || '';
  const SRC = { jsdmirror: 'jsdmirror', jsdelivr: 'jsDelivr', raw: 'GitHub raw', github: 'GitHub API', cache: tx('about.src_cache', '本机缓存'), baked: tx('about.src_baked', '脚本内置') };
  // 跟随分支预览：标题直接说「跟随分支预览 · 构建 #N」，不挂正式版号（v0.9.5 之类），免得被当成已发版本（2026-09-28 修）
  let h = a.channel === 'follow' && a.build != null
    ? `<b>${esc(tx('about.title_follow', '跟随分支预览'))}</b> · ${esc(tx('about.follow_build', '构建 #{n} · 来源 {s}', { n: a.build, s: SRC[a.source] || a.source || '?' }))}`
    : `<b>${esc(tx('about.title', '地图版本'))}</b> v${esc(ver || '?')}${code ? ` · <span style="font-family:var(--font-mono)">${esc(code)}</span>` : ''}`;
  if (ch) h += `<br>${esc(ch)}${a.sha ? ` · ${esc(String(a.sha).slice(0, 7))}` : ''}`;
  if (a.line) h += `<br>${esc(tx('about.line', '线路：{l}', { l: a.line }))}`;
  if (window.top !== window) h += `<br><button type="button" class="btn" id="updBtn" ${updBusy ? 'disabled' : ''}>${esc(updBusy ? tx('about.checking', '检查中…') : tx('about.check', '检查更新'))}</button>`;
  const r = updRes;
  if (r) {
    const how = a.channel === 'follow' ? tx('about.how_follow', '跟随版会自动用上新版本：刷新酒馆页面即可') : tx('about.how_tag', '固定版不会自己变：导入新版脚本「【地图】伊甸地图 v{v}」（同名覆盖）', { v: r.latest || '' });
    if (r.follow) h += `<div class="res" role="status">${esc(r.status === 'fail' ? tx('about.fail', '检查失败：连不上更新接口，稍后再试')
      : tx(r.status === 'new' ? 'about.follow_new' : 'about.follow_latest', r.status === 'new' ? '分支有新构建 #{n}（来源 {s}）：刷新酒馆页面即可' : '已是最新（最新构建 #{n} · 来源 {s}）', { n: r.build, s: SRC[r.source] || r.source || '?' }))}</div>`;
    else h += `<div class="res" role="status">${r.status === 'latest' ? esc(tx('about.latest', '已是最新（v{v}）', { v: r.latest || ver }))
      : r.status === 'new' ? `${esc(tx('about.new', '有新版 v{v}', { v: r.latest }))}${r.code ? ' · ' + esc(r.code) : ''}<br><a href="${esc(r.notes || '')}" target="_blank" rel="noopener">${esc(tx('about.notes', '更新说明'))}</a><br>${esc(how)}`
      : esc(tx('about.fail', '检查失败：连不上更新接口，稍后再试'))}</div>`;
  }
  box.innerHTML = h; updSub();
  if (window.top !== window) {   // v0.9.6「自动检查更新」（默认开；卡内脚本启动时读 edenMapAutoCheck，同源 localStorage）
    const lb = document.createElement('label'); lb.innerHTML = `<span>${esc(tx('about.auto_check', '自动检查更新'))}</span><input type="checkbox" role="switch" id="optAutoCheck">`;
    const cb = lb.querySelector('input'); let on = true; try { on = TCStore.get('edenMapAutoCheck') !== '0'; } catch (e) {}
    cb.checked = on; cb.onchange = () => { try { TCStore.set('edenMapAutoCheck', cb.checked ? '1' : '0'); } catch (e) {} }; box.appendChild(lb);
  }
  if (a.channel === 'latest' && a.ref) {   // 0.9.6 起的正式版加载器：「锁定当前版本」（高级，默认关）——加载器固定用这个标签，不再自动换新版
    const lb = document.createElement('label'); lb.innerHTML = `<span>${esc(tx('about.lock', '锁定当前版本'))}</span><input type="checkbox" role="switch" id="optLockVer">`;
    const cb = lb.querySelector('input'); let on = false; try { on = !!TCStore.get('edenMapLockTag'); } catch (e) {}
    cb.checked = on; cb.onchange = () => { try { if (cb.checked) TCStore.set('edenMapLockTag', a.ref); else TCStore.remove('edenMapLockTag'); } catch (e) {} }; box.appendChild(lb);
  }
  const b = $('#updBtn'); if (b) b.onclick = () => { updBusy = true; updRes = null; renderAbout(); post({ type: 'eden-map:check-update' }); setTimeout(() => { if (updBusy && !updRes) { updBusy = false; updRes = { status: 'fail' }; renderAbout(); } }, 15000); };
  if (updRes) updBusy = false;
}
// 设置里的「自检」一栏：✓ / ⚠ 列表（中 / EN）、新正式版的「本次切换」按钮、「自动更新到新正式版」开关（默认关，存本机 edenMapAutoUpdate）
export let selfCheck = null;
// 设置首页「更新与版本」那一行的摘要：版本号 + 自检 ⚠ 数
export function updSub() { const el = $('#updSub'); if (!el) return; const v = about?.version || buildInfo?.version || '', w = (selfCheck?.items || []).filter(i => i.status === 'warn').length;
  el.textContent = [v ? 'v' + String(v).replace(/^S\d+:/, '') : '', w ? tx('s.sc_warn', `自检 ${w} 项 ⚠`, { n: w }) : tx('s.update_sub', '检查更新 · 自检')].filter(Boolean).join(' · '); el.classList.toggle('warn', !!w); }
export function renderSelfCheck() {
  if (!selfCheck?.items) return;
  let box = document.getElementById('selfCheck');
  if (!box) { box = document.createElement('div'); box.id = 'selfCheck'; TCSettings.registerSection('update', box, { order: 80 }); }
  const L = LANG === 'en' ? 'en' : 'zh', mark = { ok: '✓', warn: '⚠', skip: '–', info: '↑' };
  box.innerHTML = `<b>${esc(tx('selfcheck.title', '自检'))}</b><ul>${selfCheck.items.map(i => `<li class="${esc(i.status)}">${mark[i.status] || ''} ${esc(i[L] || i.zh)}</li>`).join('')}</ul>`;
  { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.id = 'splashAgain'; b.textContent = tx('selfcheck.splash', '重新显示开场自检');   // v0.9.5
    b.onclick = () => { showSet(false); post({ type: 'eden-map:splash' }); }; box.appendChild(b); }
  updSub();
  if (selfCheck.items.some(i => i.id === 'update')) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = tx('selfcheck.update_now', '本次切换到新版本');
    b.onclick = () => post({ type: 'eden-map:update-now' }); box.appendChild(b);
    const n = document.createElement('small'); n.textContent = tx('selfcheck.update_note', '只对这次打开的页面生效；要长期使用，请重新导入新版脚本'); box.appendChild(n);
  }
  if (selfCheck.canUpdate) {
    const lb = document.createElement('label'); lb.innerHTML = `<span>${esc(tx('selfcheck.auto_update', '自动更新到新正式版'))}</span><input type="checkbox" role="switch" id="optAutoUpd">`;
    const cb = lb.querySelector('input'); let on = !!selfCheck.autoUpdate; try { on = TCStore.get('edenMapAutoUpdate') === '1'; } catch (e) {}
    cb.checked = on; cb.onchange = () => { try { TCStore.set('edenMapAutoUpdate', cb.checked ? '1' : '0'); } catch (e) {} };
    box.appendChild(lb);
  }
}
export function setAbout(v) { return (about = v); }
export function setUpdBusy(v) { return (updBusy = v); }
export function setUpdRes(v) { return (updRes = v); }
export function setSelfCheck(v) { return (selfCheck = v); }
