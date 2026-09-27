// 天城 · 人物栏（查看器用，v0.9.2）：卡内脚本 eden-map.js 用 tavern/characters.mjs 从聊天标签和 MVU 找出人物与最新位置后发来 { items: [{name, place, floor, src, present?}], floor }。
// 本文件：落点（与玩家当前地点同一条解析链 here.mjs）、地图上的圆形头像框（同一处多人叠成一组）、事态横条里的「人物」页（列表 + 总开关 + 逐人开关）、飞过去。
// 与事态区分：事态 = 大类形状的小方块 / 图形 + 类型字；人物 = 圆形头像框 + 名字首字（或本机头像），颜色按名字哈希、避开事态大类色。
// 开关和头像只存本机 localStorage（按聊天分开）；不发请求（头像是用户自己给的 data: / http 地址时由浏览器加载那张图）。
// 读查看器的全局：viewer、REG、cur、curData、aspect、placeN、hereRes、estateStandIn、go、trackEl、untrack、showCard、closeCard、declutter、esc、$、M、toImg、LS、chatId。
const TCChars = (() => {
  const T = (k, zh, v = {}) => { const r = window.I18N?.t?.(k, v); if (r && r !== k) return r; return Object.entries(v).reduce((s, [a, b]) => s.split('{' + a + '}').join(b), zh); };
  let items = [], floor = 0, CM = null, prefs = { show: true, off: [] }, avatars = {}, els = [], flyName = null;
  const mod = () => CM ? Promise.resolve(CM) : import(new URL('tavern/characters.mjs', document.baseURI).href).then(m => (CM = m)).catch(() => null);
  const chat = () => (typeof chatId === 'string' ? chatId : '');
  const store = () => (typeof LS !== 'undefined' ? LS : null);
  function loadPrefs() { if (!CM) return; prefs = CM.readCharPrefs(store(), chat()); avatars = CM.readAvatars(store(), chat()); }
  const savePrefs = () => CM?.writeCharPrefs(store(), chat(), prefs);
  const color = n => CM ? CM.colorOf(n) : '#888';
  const ini = n => CM ? CM.initials(n) : String(n)[0];
  const visible = c => prefs.show && !prefs.off.includes(c.name);
  // v0.9.3：显示名（自定义，custom.js）与位置来源：MVU（在场人物的位置字段）/ 标签（聊天里的人物标签）/ 推断（在场但没写位置，按和你同处）
  const dn = n => (typeof TCCustom !== 'undefined' ? TCCustom.name(n) : n);
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
    const z = typeof TCEvents !== 'undefined' && TCEvents.zoneXY?.(r.map, c.place);   // 只知道城区（霓虹街、7 号井一带）：按城区大致标出，虚线框
    return z ? { map: r.map, ...z } : { map: r.map };
  }

  async function set(d) { await mod(); if (!Array.isArray(d.items)) return; items = d.items.slice(0, 60); floor = d.floor || 0; loadPrefs(); await render(); bar(); if (flyName && cur) fly(flyName); }
  let seq = 0;
  async function render() {
    for (const el of els) { if (typeof untrack === 'function') untrack(el); viewer?.removeOverlay(el); } els = [];
    if (!viewer || !cur || !viewer.world.getItemCount() || REG.maps[cur]?.kind === 'estate' || !CM) return;
    const my = ++seq, groups = new Map();
    for (const c of items.filter(visible)) { const w = await where(c); if (my !== seq) return; if (!w || w.map !== cur || w.nx == null) continue;
      const k = w.nx.toFixed(3) + ',' + w.ny.toFixed(3); if (!groups.has(k)) groups.set(k, { w, list: [] }); groups.get(k).list.push(c); }
    for (const { w, list } of groups.values()) {
      const el = document.createElement('div'); el.className = 'chm' + (w.approx ? ' approx' : ''); el.dataset.chars = list.map(c => c.name).join('|');
      el.innerHTML = '<span class="chg">' + list.slice(0, 3).map((c, i) => `<i class="av" style="--c:${color(c.name)};z-index:${3 - i}">${avatars[c.name] ? `<img alt="" referrerpolicy="no-referrer" src="${esc(avatars[c.name])}">` : esc(ini(c.name))}</i>`).join('')
        + (list.length > 3 ? `<i class="av more">+${list.length - 3}</i>` : '') + `<b>${esc(dn(list[0].name))}${list.length > 1 ? ' ' + esc(T('ch.more', '等 {n} 人', { n: list.length })) : ''}</b>` + '</span>';
      const label = list.map(c => `${dn(c.name)}（${c.place}）`).join('、');
      if (typeof trackEl === 'function') trackEl(el, () => card(list), T('ch.aria', '人物：{s}', { s: label }));
      placeN(el, w.nx, w.ny, OpenSeadragon.Placement.CENTER); els.push(el);
    }
    if (typeof declutter === 'function') declutter();
  }
  function card(list) {
    showCard(null, list.map(c => dn(c.name)).join('、'), 'inf', '', '', list[0].place);
    const tg = document.querySelector('#card .tag'); tg.textContent = T('ch.tag', '人物'); tg.className = 'tag data'; tg.style.background = color(list[0].name);
    const sv = document.querySelector('#card .src'); delete sv.dataset.note;
    const note = c => { const e = typeof TCCustom !== 'undefined' && TCCustom.entry(c.name); return e?.用途 ? ` · ${e.用途}` : ''; };
    if (list.length === 1) { const c = list[0]; sv.innerHTML = `<dl class="fields"><dt>${esc(T('ch.last', '最后出现'))}</dt><dd>${esc(c.present ? T('ch.with_you', '和你在一起') : T('ch.floor', '聊天第 {n} 楼', { n: c.floor }))}</dd><dt>${esc(T('ch.src', '来源'))}</dt><dd>${esc(srcOf(c) + note(c))}</dd></dl>`; return; }
    sv.innerHTML = `<dl class="fields">${list.map(c => `<dt>${esc(dn(c.name))}</dt><dd>${esc(when(c) + ' · ' + srcOf(c))}</dd>`).join('')}</dl>`;
  }
  // 飞过去：在别的图上就先切图，打开后再平移；只知道层的，切到那一层就好
  async function fly(name) {
    const c = items.find(x => x.name === name); flyName = null; if (!c) return;
    const w = await where(c); if (!w) { card([c]); return; }
    if (w.map !== cur) { flyName = name; if (typeof closeCard === 'function') closeCard(); pendingFocus = null; go(w.map); return; }
    if (w.nx == null) { card([c]); return; }
    userMoved = true; const vp = viewer.viewport, b = vp.getBounds(true), wd = Math.min(b.width, .25), h = wd * b.height / b.width;
    vp.fitBounds(new OpenSeadragon.Rect(w.nx - wd / 2, w.ny * aspect - h / 2, wd, h));
    setTimeout(() => card(items.filter(x => x.place === c.place && visible(x)).length ? items.filter(x => x.place === c.place) : [c]), 650);
  }
  function afterOpen() { render().then(() => { if (flyName) fly(flyName); }); }

  // ---------- 横条里的「人物」页 ----------
  const count = () => items.length;
  function bar() { if (typeof TCEvents !== 'undefined') TCEvents.renderBar?.(); }
  function pane(el) {
    el.innerHTML = `<label class="tg chall"><span>${esc(T('ch.show', '在地图上显示人物'))}</span><input type="checkbox" role="switch" ${prefs.show ? 'checked' : ''}></label>`
      + `<ul>${items.map(c => `<li><button type="button" class="chgo" data-n="${esc(c.name)}"><i class="av" style="--c:${color(c.name)}">${avatars[c.name] ? `<img alt="" referrerpolicy="no-referrer" src="${esc(avatars[c.name])}">` : esc(ini(c.name))}</i><b>${esc(dn(c.name))}</b><em><span class="chsrc src-${esc(c.src || 'infer')}">${esc(srcOf(c))}</span> ${esc(when(c))}</em><small>${esc(c.place)}</small></button>`
        + `<input type="checkbox" role="switch" data-n="${esc(c.name)}" aria-label="${esc(T('ch.toggle_one', '在地图上显示 {n}', { n: c.name }))}" ${prefs.off.includes(c.name) ? '' : 'checked'} ${prefs.show ? '' : 'disabled'}></li>`).join('')}</ul>`;
  }
  function onPane(e) {
    const inp = e.target.closest('input[type=checkbox]');
    if (inp && e.type === 'change') {
      if (inp.closest('.chall')) prefs.show = inp.checked;
      else { const n = inp.dataset.n; prefs.off = inp.checked ? prefs.off.filter(x => x !== n) : [...prefs.off, n]; }
      savePrefs(); render(); bar(); return;
    }
    const b = e.type === 'click' && e.target.closest('button.chgo'); if (b) { if (typeof TCEvents !== 'undefined') TCEvents.collapse(); fly(b.dataset.n); }
  }
  // 本机头像（EdenMap.setAvatar / removeAvatar 转到这里）
  async function setAvatar(name, src) { const C = await mod(); const ok = !!C && !!store() && C.setAvatar(store(), chat(), name, src); if (ok) { loadPrefs(); render(); bar(); } return ok; }
  async function removeAvatar(name) { const C = await mod(); const ok = !!C && !!store() && C.removeAvatar(store(), chat(), name); if (ok) { loadPrefs(); render(); bar(); } return ok; }
  function chatChanged() { loadPrefs(); render(); bar(); }

  const css = `
  .chm{position:relative;width:0;height:0;overflow:visible;pointer-events:auto;cursor:pointer;z-index:2;}
  .chm .chg{position:absolute;left:12px;top:-13px;display:flex;flex-wrap:nowrap;width:max-content;align-items:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,.7))}
  .chm .av,#evbar .chpane .av{--c:#888;flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;box-sizing:border-box;border:2px solid #fff;box-shadow:0 0 0 2px var(--c);background:var(--c);color:#fff;
    font:700 12px/1 var(--font-ui,sans-serif);font-style:normal;overflow:hidden;text-shadow:0 1px 1px rgba(0,0,0,.45)}
  .chm.approx .av:first-child{outline:1px dashed rgba(255,255,255,.7);outline-offset:3px}
  .chm .av+.av{margin-left:-9px}.chm .av.more{--c:#3a3f46;font-size:10px}
  .chm .av img,#evbar .chpane .av img{width:100%;height:100%;object-fit:cover}
  .chm b{margin-left:5px;font:600 var(--fs-micro,11px)/1.3 var(--font-ui,sans-serif);color:var(--map-label-ink,#fff);background:var(--map-label-bg,rgba(8,10,14,.8));padding:1px 7px;border-radius:var(--r-pill,999px);white-space:nowrap;max-width:12em;overflow:hidden;text-overflow:ellipsis}
  .chm.lhide b{visibility:hidden} body.far .chm b{display:none} body.nomarkers .chm{display:none}
  .chm:focus-visible .av{outline:2px solid var(--focus,#63b4be);outline-offset:3px}
  @media (pointer:coarse),(max-width:640px){.chm::before{content:'';position:absolute;left:-9px;top:50%;width:44px;height:44px;margin-top:-22px}}
  #evbar .chpane{padding:0 var(--sp-3,6px) var(--sp-3,6px)}
  #evbar .chpane .chall{padding:0 12px 0 var(--sp-3,6px);border-top:1px solid var(--line)}
  #evbar .chpane ul{list-style:none;margin:0;padding:0;max-height:34vh;max-height:34dvh;overflow-y:auto}
  #evbar .chpane li{display:flex;align-items:center;gap:var(--sp-5,12px);border-top:1px solid var(--line);padding-right:12px}
  #evbar .chpane .chgo{flex:1;min-width:0;display:grid;grid-template-columns:30px 1fr auto;gap:0 var(--sp-4,8px);align-items:center;padding:var(--sp-3,6px);border-radius:var(--r-m,8px);min-height:40px}
  #evbar .chpane .chgo:hover{background:var(--surface-2)}
  #evbar .chpane .chgo .av{grid-row:1/3}
  #evbar .chpane .chgo b{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #evbar .chpane .chgo em{font-style:normal;color:var(--muted);font-size:var(--fs-micro,11px);white-space:nowrap}
  #evbar .chpane .chsrc{display:inline-block;padding:0 5px;margin-right:2px;border:1px solid var(--line-strong,rgba(255,255,255,.25));border-radius:var(--r-pill,999px);font-size:10px;line-height:15px}
  #evbar .chpane .chsrc.src-mvu{border-color:var(--accent);color:var(--accent)}
  #evbar .chpane .chgo small{grid-column:2/-1;color:var(--muted);font-size:var(--fs-micro,11px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  @media (pointer:coarse),(max-width:640px){#evbar .chpane .chgo{min-height:44px}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  mod().then(loadPrefs);
  return { set, render: afterOpen, fly, count, pane, onPane, setAvatar, removeAvatar, chatChanged, get items() { return items.map(c => ({ ...c })); } };
})();
