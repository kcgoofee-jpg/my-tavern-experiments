// 天城 · MVU 联动的查看器部分（v0.9.3）：自定义名称与用途、世界时间的夜色、本人地点卡的着装、剧情改名的一次性提示。
// 数据：嵌在酒馆里时由卡内脚本 eden-map.js 推来（eden-map:custom / clock / outfit / toast），修改请求发回去（eden-map:custom-set / custom-reset / custom-sync），
//       由它写进聊天变量 eden_map.自定义；单独打开地图（没有宿主）时存本机 localStorage（与卡内脚本没有变量接口时同一个键）。
// 纯函数在 tavern/mvu.mjs。这里不过滤任何文字，原样显示（textContent / esc）。
// 读查看器的全局：REG、cur、hereIdx、rebuildHere、markHere、chatId、LS、esc、tx、post、LANG、showSet。
const TCCustom = (() => {
  const T = (k, zh, v = {}) => { const r = window.I18N?.t?.(k, v); if (r && r !== k) return r; return Object.entries(v).reduce((s, [a, b]) => s.split('{' + a + '}').join(b), zh); };
  const embed = window.top !== window;
  let MV = null, data = { items: {}, 同步世界书: false }, host = null, clock = null, outfit = null, toastT = 0;
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
  function index() { if (!MV) return null; return { rooms: MV.aliasMap(data, ['room']), marks: MV.aliasMap(data, ['landmark']) }; }
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
    if (outfit?.text && el?.classList?.contains('here')) { const p = document.createElement('p'); p.className = 'cu-outfit'; p.textContent = T('cu.outfit', '着装：{s}', { s: outfit.text });
      if (outfit.items) p.title = Object.entries(outfit.items).map(([k, v]) => `${k}：${v}`).join('\n'); ex.prepend(p); }
  }

  // ---------- 夜色（上层、中层；设置里可关，默认开） ----------
  const NIGHT_KEY = 'edenMapNight';
  const nightOn = () => { try { return localStorage.getItem(NIGHT_KEY) !== '0'; } catch (e) { return true; } };
  function night() { const m = document.body.dataset.map; document.body.classList.toggle('nighttint', !!clock?.night && nightOn() && (m === 'tc_upper' || m === 'tc_mid')); }
  new MutationObserver(night).observe(document.body, { attributes: true, attributeFilter: ['data-map'] });

  // ---------- 剧情改名的一次性提示（事态横条上方，5 秒） ----------
  function toast(items) {
    let el = document.getElementById('cuToast');
    if (!el) { el = document.createElement('div'); el.id = 'cuToast'; el.setAttribute('role', 'status'); document.getElementById('stage').appendChild(el); }
    el.textContent = items.join('；'); el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 5000);
    if (typeof announce === 'function') announce(el.textContent);
  }

  // ---------- 设置里的「自定义」一栏：列表、编辑、重置 ----------
  function targets() {   // 可以自定义的对象：庄园房间 / 区域、各层地标、人物栏里的人
    const out = [], R = typeof REG !== 'undefined' ? REG : null; if (!R) return out;
    for (const m of Object.values(R.maps)) {
      if (m.kind === 'estate') { for (const r of m.rooms || []) out.push([r, 'room']); for (const a of m.areas || []) out.push([a, 'area']); }
      if (m.kind === 'points') for (const k of Object.values(m.markers || {})) out.push([k.name, 'landmark']);
    }
    if (typeof TCChars !== 'undefined') for (const c of TCChars.items) out.push([c.name, 'character']);
    const seen = new Set(); return out.filter(([n]) => !seen.has(n) && seen.add(n));
  }
  const KIND = { room: ['cu.room', '房间'], area: ['cu.area', '区域'], landmark: ['cu.landmark', '地标'], character: ['cu.character', '人物'] };
  let editing = null;
  function renderUI() {
    const pop = document.getElementById('setPop'); if (!pop) return;
    let box = document.getElementById('cuBox');
    if (!box) { box = document.createElement('div'); box.id = 'cuBox'; const sc = document.getElementById('selfCheck'); sc ? pop.insertBefore(box, sc) : pop.appendChild(box);
      box.addEventListener('click', onClick); box.addEventListener('change', onChange); box.addEventListener('submit', e => { e.preventDefault(); save(); }); }
    const items = Object.entries(data.items || {});
    const list = items.map(([k, e]) => `<li><div><b>${esc(e.名 || k)}</b>${e.名 ? `<small>${esc(k)}</small>` : ''}<em>${esc(T(...KIND[e.类] || KIND.landmark))}</em>${e.用途 ? `<p>${esc(e.用途)}</p>` : ''}</div>`
      + `<span class="cu-acts"><button type="button" class="btn" data-edit="${esc(k)}">${esc(T('cu.edit', '编辑'))}</button><button type="button" class="btn" data-reset="${esc(k)}">${esc(T('cu.reset', '重置'))}</button></span></li>`).join('');
    const opts = targets().map(([n, kd]) => `<option value="${esc(n)}">${esc(T(...KIND[kd]))}</option>`).join('');
    const e = editing != null ? entry(editing) || {} : null;
    box.innerHTML = `<h3>${esc(T('cu.title', '自定义'))}</h3>`
      + (items.length ? `<ul>${list}</ul>` : `<small>${esc(T('cu.empty', '还没有自定义。给房间、地标、人物起个名字或写一句用途：'))}</small>`)
      + (e ? `<form class="cu-form"><label class="col"><span>${esc(T('cu.target', '对象（标准名）'))}</span><input type="text" name="key" list="cuTargets" maxlength="40" value="${esc(editing)}" ${editing ? 'readonly' : ''} required></label><datalist id="cuTargets">${opts}</datalist>`
        + `<label class="col"><span>${esc(T('cu.name', '显示名'))}</span><input type="text" name="name" maxlength="40" value="${esc(e.名 || '')}"></label>`
        + `<label class="col"><span>${esc(T('cu.note', '用途'))}</span><textarea name="note" rows="2" maxlength="200">${esc(e.用途 || '')}</textarea></label>`
        + `<span class="cu-acts"><button type="submit" class="btn pri">${esc(T('cu.save', '保存'))}</button><button type="button" class="btn" data-cancel="1">${esc(T('cu.cancel', '取消'))}</button></span></form>`
        : `<button type="button" class="btn" data-add="1">${esc(T('cu.add', '添加'))}</button>`)
      + (embed && host ? `<label><span>${esc(T('cu.sync', '同步到世界书'))}</span><input type="checkbox" role="switch" id="cuSync" ${data.同步世界书 ? 'checked' : ''} ${host.wb ? '' : 'disabled'}></label>`
        + `<small>${esc(host.wb ? T('cu.sync_hint', '打开后写入世界书「伊甸地图·自定义」（一个常驻条目）；默认关。关掉不删除该世界书') : T('cu.sync_noapi', '酒馆助手没有世界书接口，不能同步'))}</small>` : '')
      + `<small>${esc(host ? (host.vars ? T('cu.store_chat', '存在这个聊天的变量里（换设备、导出聊天都跟着走）；摘要会作为背景发给模型') : T('cu.store_local', '酒馆助手没有变量接口：只存本机浏览器')) : T('cu.store_local2', '单独打开地图：只存本机浏览器'))}</small>`
      + `<label><span>${esc(T('cu.night', '夜间给上层、中层加一层夜色'))}</span><input type="checkbox" role="switch" id="optNight" ${nightOn() ? 'checked' : ''}></label>`;
    if (e) box.querySelector(editing ? 'input[name=name]' : 'input[name=key]')?.focus({ preventScroll: true });
  }
  function onClick(ev) {
    const b = ev.target.closest('button'); if (!b) return; ev.stopPropagation();
    if (b.dataset.add) { editing = ''; renderUI(); }
    else if (b.dataset.cancel) { editing = null; renderUI(); }
    else if (b.dataset.edit != null) { editing = b.dataset.edit; renderUI(); }
    else if (b.dataset.reset != null) removeCustom(b.dataset.reset);
  }
  function onChange(ev) {
    if (ev.target.id === 'optNight') { try { localStorage.setItem(NIGHT_KEY, ev.target.checked ? '1' : '0'); } catch (e) {} night(); }
    if (ev.target.id === 'cuSync') setSync(ev.target.checked);
  }
  function save() {
    const f = document.querySelector('#cuBox form'); if (!f) return;
    const F = f.elements, key = F.key.value.trim(), kd = (targets().find(([n]) => n === key) || [, entry(key)?.类 || 'landmark'])[1];
    if (!key) return; editing = null;
    setCustom(key, { name: F.name.value, note: F.note.value, kind: kd });
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
  function fromHost(d) { host = { vars: !!d.vars, wb: !!d.wb }; ready.then(M => { if (!M) return; data = M.normCustom(d.data); apply(); }); }
  function setClock(c) { clock = c; night(); }
  function setOutfit(o) { outfit = o && o.text ? o : null; }
  function chatChanged() { if (!host) ready.then(loadLocal); }

  const css = `
  #cuBox{margin-top:var(--sp-5);padding-top:var(--sp-5);border-top:1px solid var(--line)}
  #cuBox ul{list-style:none;margin:0 0 var(--sp-4);padding:0;max-height:40vh;overflow-y:auto}
  #cuBox li{display:flex;gap:var(--sp-4);align-items:flex-start;justify-content:space-between;padding:var(--sp-3,6px) 0;border-top:1px solid var(--line)}
  #cuBox li:first-child{border-top:0}#cuBox li>div{min-width:0}
  #cuBox li b{font-weight:600;word-break:break-all}#cuBox li small{display:inline;margin:0 0 0 6px}
  #cuBox li em{font-style:normal;color:var(--muted);font-size:var(--fs-micro);margin-left:6px}
  #cuBox li p{margin:2px 0 0;color:var(--muted);font-size:var(--fs-micro);line-height:1.45;word-break:break-all}
  #cuBox .cu-acts{display:flex;gap:6px;flex:none}#cuBox .btn{min-height:32px;padding:0 10px}
  #cuBox form{display:flex;flex-direction:column;gap:var(--sp-3,6px);margin:0 0 var(--sp-4)}
  #cuBox label.col{flex-direction:column;align-items:stretch;gap:2px;min-height:0;cursor:default;font-size:var(--fs-micro);color:var(--muted)}
  #cuBox input[type=text],#cuBox textarea{font:inherit;font-size:var(--fs-control);color:var(--ink);background:var(--surface-2);border:1px solid var(--line-strong);border-radius:var(--r-m,8px);padding:6px 8px;min-height:32px;box-sizing:border-box;width:100%}
  #cuBox textarea{resize:vertical}#cuBox .btn.pri{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
  #card .cu-note,#card .cu-outfit{margin:0 0 var(--sp-3,6px);font-size:var(--fs-micro);line-height:1.5;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #card .cu-note{white-space:normal}#card .cu-note b{color:var(--muted);font-weight:600}
  #cuToast{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(var(--sp-5,12px) + 56px);z-index:7;max-width:min(420px,calc(100% - 24px));box-sizing:border-box;padding:8px 14px;border-radius:var(--r-m,8px);
    background:var(--surface);color:var(--ink);border:1px solid var(--accent);box-shadow:0 6px 20px rgba(0,0,0,.3);font-size:var(--fs-micro);line-height:1.5}
  #cuToast[hidden]{display:none}
  body.nighttint #osd::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:1;background:radial-gradient(ellipse at 50% 40%,rgba(20,32,70,.18),rgba(6,10,28,.38));mix-blend-mode:multiply;transition:opacity .6s}
  @media (prefers-reduced-motion:reduce){body.nighttint #osd::after{transition:none}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  document.addEventListener('DOMContentLoaded', () => renderUI());
  return { name, entry, index, relabel, decorateCard, fromHost, setClock, setOutfit, toast, chatChanged, setCustom, removeCustom, setSync, renderUI,
    get data() { return MV ? MV.normCustom(data) : { items: {} }; }, get outfit() { return outfit ? { ...outfit } : null; }, get clock() { return clock ? { ...clock } : null; }, ready };
})();
