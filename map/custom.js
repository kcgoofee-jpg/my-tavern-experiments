// 天城 · MVU 联动的查看器部分（v0.9.3）：自定义名称与用途、世界时间的夜色、本人地点卡的着装、剧情改名的一次性提示。
// 数据：嵌在酒馆里时由卡内脚本 eden-map.js 推来（eden-map:custom / clock / outfit / toast），修改请求发回去（eden-map:custom-set / custom-reset / custom-sync），
//       由它写进聊天变量 eden_map.自定义；单独打开地图（没有宿主）时存本机 localStorage（与卡内脚本没有变量接口时同一个键）。
// 纯函数在 tavern/mvu.mjs（数据）与 tavern/picker.mjs（v0.9.5 选择器分组、搜索、飞行目标、校验）。这里不过滤任何文字，原样显示（textContent / esc）。
// 读查看器的全局：REG、cur、hereIdx、rebuildHere、markHere、chatId、LS、esc、tx、post、LANG、showSet。
const TCCustom = (() => {
  const T = (k, zh, v = {}) => { const r = window.I18N?.t?.(k, v); if (r && r !== k) return r; return Object.entries(v).reduce((s, [a, b]) => s.split('{' + a + '}').join(b), zh); };
  const embed = window.top !== window;
  let MV = null, data = { items: {}, 同步世界书: true }, host = null, clock = null, outfit = null, toastT = 0;
  const ready = import(new URL('tavern/mvu.mjs', document.baseURI).href).then(m => { MV = m; if (!host) loadLocal(); return m; }).catch(() => null);
  const lsKey = () => 'edenMap:chat:' + (typeof chatId === 'string' ? chatId : '') + ':custom2';
  // 单独打开（或宿主还没推来）：本机存储；旧版 here.mjs 的房间叫法一并迁移进来显示
  function loadLocal() {
    if (!MV) return; let o = {}; try { o = JSON.parse(LS?.getItem(lsKey()) || '{}') || {}; } catch (e) {}
    data = MV.normCustom(o.自定义);
    try { const old = typeof HX !== 'undefined' && HX ? HX.readCustom(LS, typeof chatId === 'string' ? chatId : '').rooms : null; if (old && Object.keys(old).length) data = MV.migrateRooms(data, old).custom; } catch (e) {}
    apply();
  }
  function saveLocal() { try { LS?.setItem(lsKey(), JSON.stringify({ 自定义: data })); return true; } catch (e) { return false; } }

  // ---------- 给其他部分用 ----------
  const name = key => (data.items?.[key]?.名) || key;
  const entry = key => data.items?.[key] || null;
  /** here.mjs buildIndex 的 custom 参数：房间 / 地标的自定义叫法 */
  // v0.9.6：区域、层 / 大区、世界地名的叫法，和「未上图」里选了「忽略」的名字
  function index() { if (!MV) return null; return { rooms: MV.aliasMap(data, ['room']), areas: MV.aliasMap(data, ['area']), marks: MV.aliasMap(data, ['landmark']), layers: MV.aliasMap(data, ['layer']), world: MV.aliasMap(data, ['world']), ignore: data.忽略 || [] }; }
  function apply() {
    if (typeof rebuildHere === 'function') rebuildHere();
    relabel(); renderUI();
    if (typeof TCChars !== 'undefined') { TCChars.render(); }
    if (typeof markHere === 'function' && typeof REG !== 'undefined' && REG) markHere(document.getElementById('here')?.value || '');
  }
  // 地图上的地名标签：有自定义显示名就换（dataset.name 仍是标准名，当前地点匹配不受影响）
  function relabel() {
    for (const el of document.querySelectorAll('.mk')) {
      const lab = el.querySelector('.lab'), tn = lab?.firstChild; if (!tn || tn.nodeType !== 3) continue;
      if (el.dataset.dn == null) el.dataset.dn = tn.nodeValue;
      const e = entry(el.dataset.name); tn.nodeValue = e?.名 || el.dataset.dn; el.classList.toggle('cu', !!e?.名);
    }
  }
  // 地点卡：显示名 + 标准名、用途；本人所在地点的卡再加一行着装（截断，全文在 title）
  function decorateCard(el, title) {
    const c = document.getElementById('card'); if (!c || c.hidden) return;
    const key = el?.dataset?.name || title, e = entry(key), ex = c.querySelector('.extra');
    if (e?.名) { c.querySelector('h2').textContent = e.名; const sb = c.querySelector('.sub'); sb.textContent = key + (sb.textContent ? ' · ' + sb.textContent : ''); }
    if (e?.用途) { const p = document.createElement('p'); p.className = 'cu-note'; p.innerHTML = `<b>${esc(T('cu.note', '用途'))}</b> `; p.append(document.createTextNode(e.用途)); ex.prepend(p); }
    const isEden = el?.dataset?.name && typeof REG !== 'undefined' && Object.values(REG.maps).some(m => Object.values(m.markers || {}).some(v => v.name === el.dataset.name && v.link && REG.maps[v.link.map]?.kind === 'estate'));
    const rp = typeof TCChars !== 'undefined' ? TCChars.rep : null;
    if (isEden && rp != null) { const p = document.createElement('p'); p.className = 'cu-rep';   // v0.9.5 主角声望（只读，0–100）
      p.innerHTML = `<b>${esc(T('ch.rep', '庄园声望'))}</b><meter min="0" max="100" low="30" high="70" optimum="100" value="${rp}"></meter><span>${Math.round(rp)}</span>`; ex.prepend(p); }
    if (roomNote && el?.dataset?.name && typeof REG !== 'undefined' && Object.values(REG.maps).some(m => Object.values(m.markers || {}).some(v => v.name === el.dataset.name && v.link && REG.maps[v.link.map]?.kind === 'estate'))) {
      const r = roomNote, re = entry(r), p = document.createElement('p'); p.className = 'cu-note cu-room'; roomNote = null;
      p.innerHTML = `<b>${esc(T('cu.room_here', '要看的房间'))}</b> `; p.append(document.createTextNode((re?.名 ? `${re.名}（${r}）` : r) + (re?.用途 ? ' · ' + re.用途 : ''))); ex.prepend(p); }
    if (outfit?.text && el?.classList?.contains('here')) { const p = document.createElement('p'); p.className = 'cu-outfit'; p.textContent = T('cu.outfit', '着装：{s}', { s: outfit.text });
      if (outfit.items) p.title = Object.entries(outfit.items).map(([k, v]) => `${k}：${v}`).join('\n'); ex.prepend(p); }
  }

  // ---------- 夜色（上层、中层；设置里可关，默认开） ----------
  const NIGHT_KEY = 'edenMapNight';
  const nightOn = () => { try { return localStorage.getItem(NIGHT_KEY) !== '0'; } catch (e) { return true; } };
  // v0.9.6（B11 / C1）：按时段分四档（晨 / 日 / 暮 / 夜）；颜色只参考 docs/drafts/upper_tod_*.jpg 的整体色调，不另出图。夜档保留旧的 nighttint 类
  function night() { const m = document.body.dataset.map, tier = m === 'tc_upper' || m === 'tc_mid', on = nightOn() && tier;
    const tod = on ? (clock?.tod || (clock?.night ? 'night' : '')) : '';
    document.body.classList.toggle('nighttint', tod === 'night');
    if (tod && tod !== 'day') document.body.dataset.tod = tod; else delete document.body.dataset.tod; }
  new MutationObserver(night).observe(document.body, { attributes: true, attributeFilter: ['data-map'] });

  // ---------- 剧情改名的一次性提示（地图顶部居中，5 秒；不压住展开的事态 / 人物列表） ----------
  function toast(items) {   // UI v2：走唯一通知层（P2，嵌入时由宿主统一显示）；旧的 #cuToast 只在通知层不可用时兜底
    const msg = items.join('；'); if (!msg) return;
    if (typeof window.TCNotify === 'function') { window.TCNotify({ level: 2, key: 'cu-' + Date.now(), title: msg }); return; }
    let el = document.getElementById('cuToast');
    if (!el) { el = document.createElement('div'); el.id = 'cuToast'; el.setAttribute('role', 'status'); document.getElementById('stage').appendChild(el); }
    el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 5000);
  }

  // ---------- 设置里的「自定义」一栏（入口 + 同步 / 存储 / 夜色）与「自定义」对话框（v0.9.5） ----------
  // 对话框三页：list 已有的自定义（卡片：原名 → 新名、用途摘要、来源；编辑 / 重置 / 在地图上看）→ pick 选择器（搜索 + 按层 / 楼层分组）→ edit 表单（校验、字数）。
  // 点卡片或选择器里的「在地图上看」= flyTo({ map, marker | room | area | character })。
  const KIND = { room: ['cu.room', '房间'], area: ['cu.area', '区域'], landmark: ['cu.landmark', '地标'], character: ['cu.character', '人物'], layer: ['cu.layer', '层 / 大区'], world: ['cu.world', '世界地名'] };
  let listQ = '', PK = null, plan = null, view = 'list', editing = null, query = '', opener = null, resetArm = null, resetT = 0, flyMsg = '';
  const pk = () => (PK ? Promise.resolve(PK) : import(new URL('tavern/picker.mjs', document.baseURI).href).then(m => (PK = m)));
  const planP = () => (plan ? Promise.resolve(plan) : Promise.all([import(new URL('estate/plan.js', document.baseURI).href).catch(() => ({})), fetch(new URL('data/eden_estate_rooms.json', document.baseURI)).then(r => (r.ok ? r.json() : null)).catch(() => null)])
    .then(([m, card]) => (plan = { ...m, CARD: card })));   // 卡设定分层房间（B2–F3）
  // v0.9.7：查看器套上本机卡原名绑定后的房间数据（estPlan，见 viewer bindPlan）优先；没有就用原始数据（占位「（按原卡）」）
  const cardPlan = () => (typeof estPlan !== 'undefined' && estPlan) || plan?.CARD || null;
  function groups() {
    if (!PK || typeof REG === 'undefined' || !REG) return [];
    return PK.buildGroups({ reg: REG, plan: plan && { ...plan, CARD: cardPlan() }, chars: typeof TCChars !== 'undefined' ? TCChars.items.map(c => c.name) : [], lang: typeof LANG !== 'undefined' ? LANG : 'zh' });
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
    if (!box) { box = document.createElement('div'); box.id = 'cuBox'; if (window.TCSettings) TCSettings.registerSection('data', box, { order: 20 }); else { const sc = document.getElementById('selfCheck'); sc ? pop.insertBefore(box, sc) : pop.appendChild(box); }
      box.addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) { e.stopPropagation(); openDlg(b); } }); box.addEventListener('change', onChange); }
    const n = Object.keys(data.items || {}).length;
    box.innerHTML = `<h3>${esc(T('cu.title', '自定义'))}</h3>`
      + `<button type="button" class="btn cu-open" data-open="1"><span>${esc(T('cu.manage', '名称与用途'))}</span><em>${esc(n ? T('cu.count', '{n} 项', { n }) : T('cu.none', '还没有'))}</em></button>`
      + (embed && host ? `<label><span>${esc(T('cu.sync', '同步到世界书'))}</span><input type="checkbox" role="switch" id="cuSync" ${data.同步世界书 ? 'checked' : ''} ${host.wb ? '' : 'disabled'}></label>`
        + `<small>${esc(host.wb ? T('cu.sync_hint2', '默认开：有了第一项自定义才建世界书「伊甸地图·自定义」（每个聊天一本，一个常驻条目）。关掉只停用条目，不删世界书') : T('cu.sync_noapi', '酒馆助手没有世界书接口，不能同步'))}</small>`
        + (data.同步世界书 && host.wbState === 'unbound' ? `<small class="cu-warn">${esc(T('cu.sync_unbound', '这个聊天已经绑定了别的聊天世界书：请在世界书设置里手动启用「伊甸地图·自定义」'))}</small>` : '') : '')
      + `<small>${esc(host ? (host.vars ? T('cu.store_chat', '存在这个聊天的变量里（换设备、导出聊天都跟着走）；摘要会作为背景发给模型') : T('cu.store_local', '酒馆助手没有变量接口：只存本机浏览器')) : T('cu.store_local2', '单独打开地图：只存本机浏览器'))}</small>`
      + `<label><span>${esc(T('cu.night', '按时段给上层、中层加色调（清晨 / 傍晚 / 夜间）'))}</span><input type="checkbox" role="switch" id="optNight" ${nightOn() ? 'checked' : ''}></label>`
      + (typeof TCChars !== 'undefined' && TCChars.hasPortraits ? `<label><span>${esc(T('ch.port', '使用原作头像'))}</span><input type="checkbox" role="switch" id="optPort" ${TCChars.portOn() ? 'checked' : ''}></label><small>${esc(T('ch.port_hint', '人物没有自己设的头像时，用卡里自带的原作立绘（作者 Yehehua，图片在作者的 CDN 上，按需加载）；省流时默认关。只收作者 CDN 上的立绘：卡里另有几位的立绘放在别的图床，本站不加载，这些人显示名字首字（不是故障，可以自己设头像）'))}</small>` : '');
    if (dlg && !dlg.hidden) renderDlg(false);
  }
  function onChange(ev) {
    if (ev.target.id === 'optNight') { try { localStorage.setItem(NIGHT_KEY, ev.target.checked ? '1' : '0'); } catch (e) {} night(); }
    if (ev.target.id === 'cuSync') setSync(ev.target.checked);
    if (ev.target.id === 'optPort') TCChars.setPortOn(ev.target.checked);
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
  async function openDlg(from, v = 'list', key = null) {
    await Promise.all([pk(), planP(), ready]).catch(() => {});
    if (!dlg) mkDlg(); opener = from || document.activeElement; view = v; editing = key; query = ''; flyMsg = ''; resetArm = null;
    dlg.hidden = false; document.body.classList.add('cudlg'); renderDlg(true);
  }
  function closeDlg(restore = true) {
    if (!dlg || dlg.hidden) return; dlg.hidden = true; document.body.classList.remove('cudlg');
    if (!restore) return;
    if (!(opener?.isConnected && opener.offsetParent)) { if (window.TCSettings) TCSettings.open('data'); else if (document.getElementById('setPop')?.hidden && typeof showSet === 'function') showSet(true); opener = document.querySelector('#cuBox .cu-open'); }
    opener?.focus({ preventScroll: true });
  }
  const ic = d => `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="${d}"/></svg>`;
  const IC = { x: 'M4 4l8 8M12 4l-8 8', back: 'M10 3L5 8l5 5', pin: 'M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 1 0-9 0C3.5 9.8 8 14 8 14zM8 8.2a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4z', edit: 'M3 13h3l7-7-3-3-7 7v3z', plus: 'M8 3v10M3 8h10', undo: 'M4 6h6a3 3 0 0 1 0 6H6M4 6l3-3M4 6l3 3' };
  const excerpt = (s, n = 42) => { const a = [...String(s || '')]; return a.length > n ? a.slice(0, n).join('') + '…' : a.join(''); };
  function renderDlg(focus) {
    const body = dlg.querySelector('.cu-body'), h = dlg.querySelector('h2'), back = dlg.querySelector('[data-back]'), x = dlg.querySelector('[data-close]');
    back.hidden = view === 'list'; back.innerHTML = ic(IC.back); back.setAttribute('aria-label', T('cu.back', '返回'));
    x.innerHTML = ic(IC.x); x.setAttribute('aria-label', T('close', '关闭'));
    h.textContent = view === 'pick' ? T('cu.pick_title', '选一个对象') : view === 'edit' ? (entry(editing) ? T('cu.edit_title', '编辑') : T('cu.add_title', '添加自定义')) : T('cu.dlg_title', '名称与用途');
    if (view === 'list') body.innerHTML = listHtml();
    else if (view === 'pick') { body.innerHTML = pickHtml(); pickResults(); }
    else body.innerHTML = editHtml();
    if (focus) {
      const f = view === 'pick' ? (matchMedia('(pointer: coarse)').matches ? null : body.querySelector('input[type=search]')) : view === 'edit' ? body.querySelector('input[name=name]') : h;
      (f || h).focus({ preventScroll: true }); if (f?.select && view === 'edit') f.select();
    }
  }
  function listHtml() {
    const items = Object.entries(data.items || {});
    const add = `<button type="button" class="btn pri cu-add" data-pick="1">${ic(IC.plus)}<span>${esc(T('cu.add2', '添加：选房间、地标或人物'))}</span></button>`;
    const msg = flyMsg ? `<p class="cu-msg" role="status">${esc(flyMsg)}</p>` : '';
    if (!items.length) return add + msg + `<div class="cu-emptybox"><p>${esc(T('cu.empty2', '还没有自定义。可以给地点起个自己的叫法，或写一句用途；模型会把它当作背景。例如：'))}</p><ul>`
      + [[T('cu.ex1a', '书房'), T('cu.ex1b', '星图室'), T('cu.ex1', '整理旧地图')], [T('cu.ex2a', '7 号井黑市'), T('cu.ex2b', '老井'), T('cu.ex2', '周五下午去补货')], [T('cu.ex3a', '温室'), '', T('cu.ex3', '冬天在这里喝茶')]]
        .map(([a, b, c]) => `<li><b>${esc(a)}</b>${b ? ` → <b>${esc(b)}</b>` : ''}<small>${esc(T('cu.note', '用途'))}：${esc(c)}</small></li>`).join('') + `</ul></div>`;
    const lq = listQ.trim().toLowerCase(), shown = lq ? items.filter(([k, e]) => [k, e.名, e.用途, ...(e.别名 || [])].some(s => s && s.toLowerCase().includes(lq))) : items;
    const filt = items.length > 5 ? `<input type="search" id="cuLQ" class="cu-lq" autocomplete="off" aria-label="${esc(T('cu.list_search', '在已有的自定义里找'))}" placeholder="${esc(T('cu.list_search', '在已有的自定义里找'))}" value="${esc(listQ)}">` : '';
    return add + msg + filt + `<ul class="cu-cards">` + shown.map(([k, e]) => {
      const src = e.源 === '标签' ? ['tag', T('cu.src_tag', '剧情标签')] : ['man', T('cu.src_manual', '手动')], arm = resetArm === k;
      return `<li class="cu-card"><button type="button" class="cu-main" data-fly="${esc(k)}" aria-label="${esc(T('cu.fly_aria', '在地图上看 {n}', { n: e.名 || k }))}">`
        + `<span class="cu-names">${e.名 ? `<s>${esc(k)}</s><i aria-hidden="true">→</i><b>${esc(e.名)}</b>` : `<b>${esc(k)}</b>`}</span>`
        + (e.用途 ? `<span class="cu-ex">${esc(excerpt(e.用途))}</span>` : '')
        + `<span class="cu-tags"><em>${esc(T(...(KIND[e.类] || KIND.landmark)))}</em><em class="src-${src[0]}">${esc(src[1])}</em></span></button>`
        + ((e.别名 || []).length ? `<span class="cu-al"><small>${esc(T('cu.aliases', '也叫'))}</small>${e.别名.map(a => `<button type="button" class="chip" data-unalias="${esc(k)}" data-a="${esc(a)}" aria-label="${esc(T('cu.unalias', '去掉叫法 {a}', { a }))}">${esc(a)} ×</button>`).join('')}</span>` : '')   // v0.9.6：叫法（含「未上图」指派的）可单独去掉
        + `<span class="cu-acts"><button type="button" class="btn" data-edit="${esc(k)}">${ic(IC.edit)}<span>${esc(T('cu.edit', '编辑'))}</span></button>`
        + `<button type="button" class="btn${arm ? ' warn' : ''}" data-reset="${esc(k)}">${ic(IC.undo)}<span>${esc(arm ? T('cu.reset_sure', '确认重置') : T('cu.reset', '重置'))}</span></button>`
        + `<button type="button" class="btn" data-fly="${esc(k)}">${ic(IC.pin)}<span>${esc(T('cu.fly', '在地图上看'))}</span></button></span></li>`;
    }).join('') + `</ul>`;
  }
  function pickHtml() {
    const gs = groups();
    return `<div class="cu-search"><input type="search" id="cuQ" autocomplete="off" enterkeyhint="search" aria-controls="cuRes" aria-label="${esc(T('cu.search', '搜索名称、叫法或用途'))}" placeholder="${esc(T('cu.search', '搜索名称、叫法或用途'))}" value="${esc(query)}"></div>`
      + `<div class="cu-chips" role="group" aria-label="${esc(T('cu.groups', '分组'))}">${gs.map(g => `<button type="button" class="chip" data-jump="${esc(g.id)}">${esc(g.short || g.label)}</button>`).join('')}</div>`
      + `<div id="cuRes" class="cu-res"></div>`;
  }
  function pickResults() {
    const box = dlg.querySelector('#cuRes'); if (!box) return;
    const gs = PK.filterGroups(groups(), query, data, T('cu.best', '最匹配'));
    if (!gs.length) { box.innerHTML = `<p class="cu-none">${esc(T('cu.no_match', '没有找到「{q}」。试试标准名、你起的名字或用途里的词', { q: query }))}</p>`; dlg.querySelector('.cu-chips').hidden = true; return; }
    dlg.querySelector('.cu-chips').hidden = !!query;
    box.innerHTML = gs.map(g => `<section data-g="${esc(g.id)}"><h4>${esc(g.label)} <small>${g.items.length}</small></h4><ul>` + g.items.map(it => {
      const e = entry(it.key);
      return `<li><button type="button" class="cu-row" data-pickkey="${esc(it.key)}"><b>${esc(e?.名 || it.key)}</b>${e?.名 ? `<small>${esc(it.key)}</small>` : ''}${it.sub && !e?.用途 ? `<span>${esc(it.sub)}</span>` : ''}${e?.用途 ? `<span class="cu-u">${esc(T('cu.note', '用途'))}：${esc(excerpt(e.用途, 30))}</span>` : ''}</button>`
        + `<button type="button" class="cu-ic" data-fly="${esc(it.key)}" aria-label="${esc(T('cu.fly_aria', '在地图上看 {n}', { n: e?.名 || it.key }))}" title="${esc(T('cu.fly', '在地图上看'))}">${ic(IC.pin)}</button></li>`;
    }).join('') + `</ul></section>`).join('');
  }
  function editHtml() {
    const e = entry(editing) || {}, it = PK?.findItem(groups(), editing), kd = kindOf(editing), nu = [...(e.用途 || '')].length;
    return `<form class="cu-form" novalidate><p class="cu-target"><b>${esc(editing)}</b><em>${esc(T(...(KIND[kd] || KIND.landmark)))}</em>${it ? `<small>${esc(it.group)}</small>` : ''}`
      + `<button type="button" class="btn" data-fly="${esc(editing)}">${ic(IC.pin)}<span>${esc(T('cu.fly', '在地图上看'))}</span></button></p>`
      + `<label class="col" for="cuName"><span>${esc(T('cu.name', '显示名'))} <small>${esc(T('cu.name_hint', '留空 = 用标准名'))}</small></span></label>`
      + `<input type="text" id="cuName" name="name" maxlength="${MV?.MAX_NAME || 40}" value="${esc(e.名 || '')}" placeholder="${esc(editing)}" aria-describedby="cuNameErr"><small class="cu-err" id="cuNameErr" aria-live="polite"></small>`
      + `<label class="col" for="cuNote"><span>${esc(T('cu.note', '用途'))} <small>${esc(T('cu.note_hint', '一句话，模型会当作背景'))}</small></span></label>`
      + `<textarea id="cuNote" name="note" rows="3" maxlength="${MV?.MAX_NOTE || 200}" aria-describedby="cuNoteCnt cuNoteErr">${esc(e.用途 || '')}</textarea>`
      + `<div class="cu-cnt"><small class="cu-err" id="cuNoteErr" aria-live="polite"></small><small id="cuNoteCnt">${nu} / ${MV?.MAX_NOTE || 200}</small></div>`
      + `<span class="cu-acts"><button type="submit" class="btn pri">${esc(T('cu.save', '保存'))}</button><button type="button" class="btn" data-back="1">${esc(T('cu.cancel', '取消'))}</button></span></form>`;
  }
  const ERR = { too_long: ['cu.err_long', '太长了'], dup_std: ['cu.err_dup_std', '和另一个地点 / 人物的标准名重名，地点匹配会分不清'], dup_name: ['cu.err_dup', '和另一项的显示名重名'], empty: ['cu.err_empty', '至少填一项（想恢复原样用「重置」）'] };
  function check(show) {
    const f = dlg.querySelector('form'); if (!f || !PK) return true;
    const r = PK.validate({ key: editing, name: f.elements.name.value, note: f.elements.note.value, custom: data, keys: allKeys(), maxName: MV?.MAX_NAME, maxNote: MV?.MAX_NOTE });
    const nu = [...f.elements.note.value.trim()].length, max = MV?.MAX_NOTE || 200, cnt = dlg.querySelector('#cuNoteCnt');
    cnt.textContent = `${nu} / ${max}`; cnt.classList.toggle('near', nu > max * .9);
    const nm = r.name && (show || r.name !== 'empty') ? T(...ERR[r.name]) : '', nt = r.note ? T(...ERR[r.note]) : '';
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
    else if (d.pick) { view = 'pick'; renderDlg(true); }
    else if (d.pickkey != null) { editing = d.pickkey; view = 'edit'; renderDlg(true); }
    else if (d.edit != null) { editing = d.edit; view = 'edit'; renderDlg(true); }
    else if (d.jump) { const s = dlg.querySelector(`section[data-g="${CSS.escape(d.jump)}"]`); s?.scrollIntoView({ block: 'start' }); s?.querySelector('button')?.focus({ preventScroll: true }); }
    else if (d.reset != null) {
      if (resetArm !== d.reset) { resetArm = d.reset; clearTimeout(resetT); resetT = setTimeout(() => { resetArm = null; if (!dlg.hidden && view === 'list') renderDlg(false); }, 4000); renderDlg(false); dlg.querySelector(`[data-reset="${CSS.escape(d.reset)}"]`)?.focus(); return; }
      resetArm = null; const k = d.reset; removeCustom(k).then(ok => { if (ok) say(T('cu.reset_done', '已重置 {n}', { n: k })); setTimeout(() => { if (!dlg.hidden) (dlg.querySelector('[data-edit]') || dlg.querySelector('.cu-add'))?.focus(); }, 60); });
    }
    else if (d.fly != null) fly(d.fly);
    else if (d.unalias != null) { const k = d.unalias, a = d.a; setCustom(k, { unalias: a }).then(ok => { if (ok) say(T('cu.unalias_done', '已去掉叫法 {a}', { a })); }); }
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
      if (!ok) { dlg.querySelector('#cuNameErr').textContent = T('cu.err_save', '没存上，请再试一次'); return; }
      view = 'list'; editing = null; renderDlg(false); say(T('cu.saved', '已保存')); dlg.querySelector(`[data-edit="${CSS.escape(key)}"]`)?.focus();
    });
  }
  // 点了「在地图上看」：关掉对话框和设置，飞过去；飞不了（人物不在人物栏、找不到地点）就留在对话框里说明
  async function fly(key) {
    await pk(); const t = targetOf(key);
    const r = t ? await flyTo(t) : false;
    if (r) { closeDlg(false); if (typeof showSet === 'function') showSet(false); return; }
    flyMsg = T('cu.fly_none', '「{n}」现在不在地图上（人物要先在人物栏里出现）', { n: entry(key)?.名 || key });
    if (view === 'list') renderDlg(false); else say(flyMsg);
  }

  // ---------- 飞行（EdenMap.flyTo 也走这里） ----------
  // 地标：切到那一层并打开地点卡；庄园房间 / 室外：进庄园并聚焦（estate:room），庄园不可用（本次会话加载失败过）时落到上层的伊甸并在地点卡里写上要看的房间；人物：人物栏的飞行。
  let roomNote = null;
  async function flyTo(target) {
    const M = await pk().catch(() => null), t = M?.normTarget(target); if (!t || typeof REG === 'undefined' || !REG) return false;
    if (typeof closeCard === 'function') closeCard();
    if (t.character) {
      const norm = s => String(s || '').trim().toLowerCase(), want = norm(MV?.findKey(data, t.character) || t.character);
      const c = typeof TCChars !== 'undefined' && TCChars.items.find(c => norm(c.name) === want); if (!c) return false;
      TCChars.fly(c.name); return true;
    }
    if (t.room || t.area) {
      const name = t.room || t.area, eid = t.map && REG.maps[t.map]?.kind === 'estate' ? t.map : Object.keys(REG.maps).find(k => REG.maps[k].kind === 'estate');
      if (!eid) return false;
      if (!(typeof estFail !== 'undefined' && estFail) && REG.maps[eid].status !== 'planned') {
        roomNote = null; estFocus = name;
        const CP = cardPlan(), cr = t.floor && CP?.rooms?.find(r => r.floor === t.floor && (r.name === name || r.card_id === name));   // 卡设定分层房间：多边形随 estate:room 发给庄园页画框
        window.estCard = cr ? { name, floor: cr.floor, kind: cr.kind, area: cr.area, poly: cr.poly, z: (CP.floors.find(f => f.id === cr.floor) || {}).z } : null; if (cur === eid) estateRoom(); else { pendingFocus = null; go(eid); } return true;
      }
      const s = estateStandIn(eid); if (!s) return false; roomNote = name; return flyMarker(s.map, s.marker);
    }
    if (t.marker && REG.maps[t.map]?.markers?.[t.marker]) { roomNote = null; return flyMarker(t.map, t.marker); }
    return false;
  }
  function flyMarker(map, id) {
    if (map !== cur) { pendingFocus = id; go(map); return true; }
    const nm = REG.maps[map].markers[id].name, el = [...document.querySelectorAll('.mk')].find(e => e.dataset.name === nm), k = curData?.markers?.find(x => x.id === id);
    if (k && viewer?.viewport) { userMoved = true; viewer.viewport.panTo(new OpenSeadragon.Point(k.ax ?? k.nx, (k.ay ?? k.ny) * aspect)); }
    if (el) setTimeout(() => { cardFrom = el; el._open(); }, 350);
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
  function setClock(c) { clock = c; night(); }
  function setOutfit(o) { outfit = o && o.text ? o : null; }
  function chatChanged() { if (!host) ready.then(loadLocal); }

  const css = `
  #cuBox{margin-top:var(--sp-5);padding-top:var(--sp-5);border-top:1px solid var(--line)}
  #cuBox .cu-open{display:flex;width:100%;min-height:var(--hit,44px);justify-content:space-between;align-items:center;gap:var(--sp-4);margin:0 0 var(--sp-4);padding:0 var(--sp-5);box-sizing:border-box}
  #cuBox .cu-open em{font-style:normal;color:var(--muted);font-size:var(--fs-small)}
  #cuBox small.cu-warn{color:var(--alert)}
  /* 对话框：桌面居中 560 宽；≤ 640 全屏底板 */
  #cuDlg{position:fixed;inset:0;z-index:40;display:grid;place-items:center;background:color-mix(in srgb,var(--bg) 55%,transparent);color:var(--ink);font-family:var(--font-ui)}
  #cuDlg[hidden]{display:none}
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
  body[data-tod=dawn] #osd::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:1;background:linear-gradient(180deg,rgba(255,196,200,.16),rgba(214,200,230,.10));mix-blend-mode:multiply;transition:opacity .6s}
  body[data-tod=dusk] #osd::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:1;background:linear-gradient(180deg,rgba(255,170,120,.22),rgba(200,140,150,.16));mix-blend-mode:multiply;transition:opacity .6s}
  @media (prefers-reduced-motion:reduce){body.nighttint #osd::after,body[data-tod] #osd::after{transition:none}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  document.addEventListener('DOMContentLoaded', () => renderUI());
  return { name, entry, index, relabel, decorateCard, flyTo, openDlg, dlgKey, fromHost, setClock, setOutfit, toast, chatChanged, setCustom, removeCustom, setSync, renderUI,
    get data() { return MV ? MV.normCustom(data) : { items: {} }; }, get outfit() { return outfit ? { ...outfit } : null; }, get clock() { return clock ? { ...clock } : null; }, ready };
})();
