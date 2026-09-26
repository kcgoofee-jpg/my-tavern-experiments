// 天城 · 地图事件层（查看器用）——「城市态势看板」
// 事件从哪来：①聊天里前端载体带的隐藏标签，由卡内脚本 eden-map.js 用 tavern/events.mjs 解析、合并、老化后发来（items）；
//            ②可选的外部数据源（maps.json 的 feeds），也交给 events.mjs 解析，和聊天事件一起显示。
// 一条事件（events.mjs 的输出）：{ id, key, cat, layer, place, lvl, text, src, code, time, scope, dur, xy, status, first, last, count, closed, tier, isNew }
// 本文件只负责：落点（地名 → 坐标）、图标、事态列表、飞过去、网络攻击花屏、世界图角标。设计见 docs/map-events.md。
// 读查看器的全局变量：viewer、REG、cur、curData、aspect、getJSON、placeN、showCard、esc、go、coarse、$。
// 界面文字走查看器的 window.I18N（键在 i18n/*.json 的 ev.*）；类别、大类、层、状态名英文在 en.json 的 names。事件标题、地点、发布方是剧情原文，不翻译。
const TCEvents = (() => {
  const T = (k, zh, v = {}) => { const r = window.I18N?.t?.(k, v); if (r && r !== k) return r;
    return Object.entries(v).reduce((s, [a, b]) => s.split('{' + a + '}').join(b), zh); };
  const tn = z => (z && window.I18N?.tr?.(z)) || z || '';
  const where = e => tn(e.layer) + (e.place ? '·' + e.place : '');
  const LOOK = {   // 类别 → 图标字、颜色（真实事件地图的惯例：火警红橙、警务蓝、治安紫、基础设施灰、网络青）
    火灾: ['火', '#ff5a2a'], 爆炸: ['爆', '#ff2a2a'], 持械: ['警', '#e0182d'], 凶案: ['案', '#c2263a'], 抢劫: ['劫', '#c23bd6'], 盗窃: ['盗', '#9a5cff'],
    通缉: ['缉', '#3d7dff'], 检查点管控: ['管', '#f08a24'], 黑市查抄: ['查', '#9fe870'], 骚乱: ['乱', '#e08a24'], 交通事故: ['轨', '#f0c020'],
    停电: ['电', '#9aa4b5'], 网络攻击: ['网', '#3de0ff'], 气候故障: ['气', '#7fd6ff'], 结界事故: ['界', '#e6c36a'], 空域巡查: ['巡', '#d9a441'],
    政策: ['政', '#6f9be0'], 公共直播: ['播', '#e0182d'], 民生: ['民', '#e8d08a'], 军事调动: ['军', '#a3b18a'], 急救: ['救', '#37c5b0'], 其他: ['!', '#cfd8e0'],
  };
  const look = c => LOOK[c] || LOOK.其他;
  const lk = e => e.ch && e.color ? [e.ch, e.color] : look(e.cat);   // events.mjs 给的图标字与大类颜色优先（v2：9 个大类 = 9 种颜色）
  // 图例与筛选（v2）：9 个大类的颜色；点一个大类 = 在地图、列表、层计数里隐藏它（记在本机）。大类表在 events.mjs 加载后取，加载前用这份
  let GROUPS = { 空防: '#d9a441', 气候: '#7fd6ff', 治安: '#3d7dff', 政治: '#6f9be0', 媒体: '#3de0ff', 民生: '#e8d08a', 军事: '#a3b18a', 灾害: '#ff5a2a', 人物: '#d7a6e8' };
  let ORDER = Object.keys(GROUPS);
  const OFF_KEY = 'edenMapEvOff';
  const off = new Set((() => { try { return JSON.parse(localStorage.getItem(OFF_KEY)) || []; } catch (e) { return []; } })());
  const grpOf = e => e.grp || '其他';
  let grpLoaded = false;
  const MAP_OF = { 上层: 'tc_upper', 中层: 'tc_mid', 下层: 'tc_low', 天城外: 'world' };
  // 城区关键词 → 平面坐标（x ∈ [-15, 15]、y ∈ [-9.375, 9.375]，与 Blender 同一平面；位置为推断）
  const ZONES = {
    tc_mid: [[/核心|高区/, 3.5, 3.8], [/霓虹街|商业/, -5, -2.5], [/C区|检查点/, 4.6, -6.9], [/外围|居住/, -12, 6.5], [/军营|环城/, -13, 0], [/大学|星渊/, -8.2, 6.4], [/议会/, .6, -2.3]],
    tc_low: [[/7号井|七号井|井口/, 4.6, -6.9], [/工业|工厂|货运|铁路|厂/, 7, -7.5], [/贫民|棚户|城寨|城中村/, -6, 1], [/哨所|前沿/, -12.3, -6.6], [/施粥|旧教堂/, 8.4, .5], [/拳场|磨坊/, -5.8, -3.3], [/地基/, 0, 0]],
    tc_upper: [],
  };
  let items = [], floor = 0, feedItems = [], shown = true, flyId = null, open = false, EVM = null;
  const markersOf = {};                                    // 地图 id → 点位数据（按需加载）
  const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619); return (h >>> 0) / 4294967296; };
  const all = () => items.concat(feedItems);
  const vis = () => all().filter(e => !off.has(grpOf(e)));   // 筛选后看得见的
  const mapOf = e => MAP_OF[e.layer] || 'tc_mid';
  const live = e => !e.closed && e.tier !== 'fade';

  // 地点 → 坐标：①显式坐标 ②该层地图的地标名 / 别名（最长匹配）③城区关键词 ④只知道层：按地点哈希放在中部一圈，标成「位置不详」
  function pos(e) {
    const mid = mapOf(e), m = REG.maps[mid];
    const xy = (e.xy || '').split(/[,，]/).map(Number);
    if (xy.length === 2 && xy.every(v => v >= 0 && v <= 1)) return { nx: xy[0], ny: xy[1] };
    let best = null;
    for (const k of markersOf[mid] || []) { const meta = m?.markers?.[k.id]; if (!meta) continue;
      for (const w of [meta.name, ...(meta.alias || [])]) if (w && e.place && (e.place.includes(w) || w.includes(e.place)) && (!best || w.length > best.len)) best = { k, len: w.length }; }
    if (best) return { nx: best.k.nx, ny: best.k.ny, marker: true };
    const j = hash(e.key || e.id), j2 = hash((e.key || e.id) + '~');
    for (const [re, x, y] of ZONES[mid] || []) if (re.test(e.place)) return { nx: (x + 15) / 30 + (j - .5) * .04, ny: (9.375 - y) / 18.75 + (j2 - .5) * .06 };
    return { nx: .2 + .6 * j, ny: .2 + .6 * j2, approx: true };
  }
  async function loadMarkers() {
    await Promise.all(Object.values(MAP_OF).filter(id => REG.maps[id]?.data && !markersOf[id] && REG.maps[id].status !== 'planned')
      .map(id => getJSON(REG.maps[id].data).then(d => { markersOf[id] = d?.markers || []; }).catch(() => {})));
  }

  // ---------- 输入 ----------
  // 卡内脚本发来：{ items, floor, fly }（旧版云端协议 { list, last } 也兼容：交给 events.mjs 重新解析）
  async function set(d) {
    if (Array.isArray(d.items)) { items = d.items; floor = d.floor || 0; }
    else if (Array.isArray(d.list)) { const m = await mod(); if (!m) return;
      floor = d.last || 0; items = m.collect(d.list.map(o => ({ floor: o.mes ?? floor, text: tagText(o) })), floor); }
    if (d.fly) flyId = d.fly;
    await loadMarkers(); render(); renderBar(); badges();
    if (flyId && cur && viewer.world.getItemCount() && flyTo(flyId)) flyId = null;
  }
  const tagText = o => `<span data-tcmap="${Object.entries(o).filter(([k]) => k !== 'mes' && k !== 'src').map(([k, v]) => `${k}=${String(v).replace(/[;"]/g, ' ')}`).join(';')}"></span>`;
  // 按文档的 <base> 解析（srcdoc 里的内联 / 经典脚本做 import() 时 Chrome 会按宿主页地址解析相对路径，取到 tavern/tavern/…）
  const mod = () => EVM ? Promise.resolve(EVM) : import(new URL('tavern/events.mjs', document.baseURI).href).then(m => (EVM = m)).catch(() => null);
  // 外部数据源：maps.json 顶层 feeds: [{label, url, every}]（url 返回 {events: [与标签相同的中文字段]}）；状态改成已解除前一直显示
  async function pollFeeds() {
    const feeds = REG?.feeds || []; if (!feeds.length) return;
    const m = await mod(); if (!m) return;
    const got = await Promise.all(feeds.map(f => fetch(f.url, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)
      .then(d => (d?.events || []).flatMap(o => m.parseMarks(tagText(o)).map(e => ({ ...e, id: 'feed:' + (e.code || m.hash(e.cat + e.place + e.text)),
        key: e.code || e.cat + e.place, first: floor, last: floor, count: 1, closed: e.lvl === 0, tier: e.lvl === 0 ? 'after' : 'live', src: e.src || f.label, feed: true }))))));
    feedItems = got.flat(); await loadMarkers(); render(); renderBar(); badges();
    setTimeout(pollFeeds, Math.max(60, Math.min(...feeds.map(f => f.every || 300))) * 1000);
  }

  // ---------- 地图上的点 ----------
  let layerEls = [];
  function render() {
    if (!viewer || !cur || !viewer.world.getItemCount()) return;
    for (const el of layerEls) viewer.removeOverlay(el); layerEls = [];
    if (REG.maps[cur]?.kind === 'estate') return;   // 庄园剖面（iframe）不画事态点
    if (REG.maps[cur]?.kind === 'world') { worldBadge(); applyGlitch(); updateToggle(); return; }
    const here = vis().filter(e => mapOf(e) === cur && e.tier !== 'fade').slice(0, 50);    // 手机上叠加层不超过 50 个
    const seen = {};
    for (const e of here) {
      const p = pos(e), k = `${p.nx.toFixed(3)},${p.ny.toFixed(3)}`, n = seen[k] = (seen[k] || 0) + 1;   // 同一地点多条：绕一小圈错开
      const a = n * 2.4, r = n > 1 ? .006 * Math.sqrt(n) : 0, [ch, color] = lk(e);
      const el = document.createElement('div');
      el.className = `ev ${e.closed ? 'ev-cleared' : 'ev-active'} sev${Math.max(1, e.lvl)} tier-${e.tier}${p.approx ? ' approx' : ''}${e.isNew && live(e) ? ' ev-new' : ''}`;
      el.style.setProperty('--c', color); el.dataset.ev = e.id;
      el.innerHTML = `<i>${esc(ch)}</i><b>${esc(e.text || e.cat)}</b>`;
      el.title = `${tn(e.cat)} · ${e.place || tn(e.layer)}`;
      new OpenSeadragon.MouseTracker({ element: el, clickHandler: () => card(e, el) });
      placeN(el, p.nx + Math.cos(a) * r, p.ny + Math.sin(a) * r * 1.6, OpenSeadragon.Placement.CENTER); layerEls.push(el);
    }
    document.body.classList.toggle('noevents', !shown);
    updateToggle(); applyGlitch();
  }
  function card(e, el) {
    document.querySelectorAll('.ev.hot').forEach(x => x.classList.remove('hot')); el?.classList.add('hot');
    const p = pos(e), st = e.closed ? T('ev.cleared', '已解除') : tn(e.status) || T('ev.ongoing', '发生中');
    const rare = e.rare >= 4 ? T('ev.rare4', '（传说级）') : e.rare >= 3 ? T('ev.rare3', '（罕见）') : '';
    showCard(null, `${tn(e.cat)} · ${e.text || ''}`, 'inf', [
      e.grp && T('ev.f_cat', '分类：{grp} · {cat}', { grp: tn(e.grp), cat: tn(e.cat) }) + rare,
      T('ev.f_place', '地点：{place}', { place: where(e) }) + (p.approx ? T('ev.approx', '（位置不详，按所在层大致标出）') : ''),
      T('ev.f_lvl', '等级：{bars}　状态：{st}', { bars: '▮'.repeat(Math.max(1, e.lvl)) + '▯'.repeat(3 - Math.max(1, e.lvl)), st }),
      e.time && T('ev.f_time', '时间：{v}', { v: e.time }), e.code && T('ev.f_code', '编号：{v}', { v: e.code }),
      e.feed ? T('ev.f_src_feed', '来源：{src}', { src: e.src || T('ev.feed_default', '外部数据源') })
        : T('ev.f_src', '来源：{src} · 聊天第 {n} 楼', { src: e.src || T('ev.unsigned', '未署名'), n: e.first }) + (e.count > 1 ? T('ev.updates', '起，更新 {n} 次', { n: e.count - 1 }) : ''),
    ].filter(Boolean).join('\n'));
    const t = document.querySelector('#card .tag'); t.textContent = T('ev.tag', '天城事态'); t.style.background = lk(e)[1]; t.style.color = '#111';
    delete document.querySelector('#card .src').dataset.note;   // 事态卡不是设定原文，不加「原文（中文）」说明
  }
  function flyTo(id) {
    const e = all().find(x => x.id === id), mid = e && mapOf(e);
    if (!e || !REG.maps[mid] || REG.maps[mid].status === 'planned' || REG.maps[mid].kind === 'world') return !!e;
    if (mid !== cur) { flyId = id; go(mid); return false; }
    const p = pos(e), w = .22, h = w * ($('#osd').clientHeight / Math.max(1, $('#osd').clientWidth));
    userMoved = true;
    const vp = viewer.viewport, target = new OpenSeadragon.Rect(p.nx - w / 2, p.ny * aspect - h / 2, w, h), now = vp.getBounds(true);
    // 飞行：离得远就先拉远（把起点和目标一起框进来），再俯冲下去；近的直接平移。落地时雷达扫描 + 定位环收缩
    const far = Math.hypot(now.x + now.width / 2 - p.nx, now.y + now.height / 2 - p.ny * aspect) > Math.max(now.width, w) * .9;
    clearTimeout(flyT);
    if (far && !reduce) {
      const x0 = Math.min(now.x, target.x), y0 = Math.min(now.y, target.y), x1 = Math.max(now.x + now.width, target.x + w), y1 = Math.max(now.y + now.height, target.y + h);
      vp.fitBounds(new OpenSeadragon.Rect(x0 - .02, y0 - .02, x1 - x0 + .04, y1 - y0 + .04));
      flyT = setTimeout(() => { vp.fitBounds(target); flyT = setTimeout(() => land(e, p), 900); }, 750);
    } else { vp.fitBounds(target, !!reduce); flyT = setTimeout(() => land(e, p), reduce ? 0 : 700); }
    return true;
  }
  let flyT = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function land(e, p) {
    card(e, document.querySelector(`.ev[data-ev="${CSS.escape(e.id)}"]`));
    if (reduce) return;
    const el = document.createElement('div'); el.className = 'ev-radar'; el.style.setProperty('--c', lk(e)[1]);
    el.innerHTML = '<span></span><span></span><span></span><i></i>';
    viewer.addOverlay({ element: el, location: new OpenSeadragon.Point(p.nx, p.ny * aspect), placement: OpenSeadragon.Placement.CENTER });
    setTimeout(() => viewer.removeOverlay(el), 2200);
  }
  // 打开某张图之后（onOpen 里调用）：画点；如果有待飞的事件，飞过去
  function afterOpen() { render(); renderBar(); if (flyId && flyTo(flyId)) flyId = null; }

  // ---------- 事态列表（底部横条，点开是列表） ----------
  function renderBar() {
    const bar = $('#evbar'), every = all().filter(e => REG.maps[mapOf(e)]), list = every.filter(e => !off.has(grpOf(e)));
    bar.hidden = !every.length || !shown; if (bar.hidden) return;
    if (!grpLoaded) { grpLoaded = true; mod().then(m => { if (m?.GROUPS) { GROUPS = m.GROUPS; ORDER = m.GROUP_ORDER || Object.keys(m.GROUPS).filter(g => g !== '其他'); renderBar(); } }); }   // 有事件时才取大类表
    const n = list.filter(live).length, fresh = list.filter(e => e.isNew).length, hid = ORDER.filter(g => off.has(g)).length + (off.has('其他') ? 1 : 0);
    bar.querySelector('button').innerHTML = `<i class="dot"></i><span>${esc(n ? T('ev.bar_live', '{n} 起进行中', { n }) : T('ev.bar_none', '暂无进行中'))} · ${esc(T('ev.bar_total', '共 {n} 起事态', { n: list.length }))}${hid ? ' · ' + esc(T('ev.filtered', '已隐藏 {n} 类', { n: hid })) : ''}</span>${fresh ? `<span class="new">${esc(T('ev.bar_new', '{n} 条新', { n: fresh }))}</span>` : ''}<span class="tog">${esc(open ? T('ev.collapse', '收起 ▾') : T('ev.expand', '展开 ▴'))}</span>`;
    bar.dataset.open = open ? '1' : '0';
    // 图例：9 个大类都列出（没有事件的变淡），数字 = 该类条数；点一下隐藏 / 恢复
    const cnt = {}; for (const e of every) cnt[grpOf(e)] = (cnt[grpOf(e)] || 0) + 1;
    const gs = ORDER.concat(cnt.其他 ? ['其他'] : []);
    bar.querySelector('.evleg').innerHTML = gs.map(g => `<button type="button" data-g="${esc(g)}" class="${off.has(g) ? 'off' : ''}${cnt[g] ? '' : ' none'}" style="--c:${GROUPS[g] || '#cfd8e0'}" aria-pressed="${off.has(g) ? 'false' : 'true'}"><i></i>${esc(tn(g))}${cnt[g] ? `<em>${cnt[g]}</em>` : ''}</button>`).join('')
      + `<small>${esc(T('ev.legend_hint', '点大类可隐藏 / 显示'))}</small>`;
    bar.querySelector('ol').innerHTML = list.map(e => `<li data-id="${esc(e.id)}" class="tier-${e.tier}${e.isNew ? ' isnew' : ''}" style="--c:${lk(e)[1]}"><i></i><b>${esc(tn(e.cat))}${e.closed ? ' · ' + esc(T('ev.cleared', '已解除')) : ''} <em>${esc(where(e))}</em></b><em>${esc(e.feed ? T('ev.feed', '数据源') : T('ev.floor', '第 {n} 楼', { n: e.last }))}</em><small>${esc(e.text || '')}${e.src ? ' —— ' + esc(e.src) : ''}</small></li>`).join('');
  }
  function updateToggle() {
    let tg = document.getElementById('tgEvents');
    if (!tg) {
      tg = document.createElement('label'); tg.className = 'tg'; tg.id = 'tgEvents';
      tg.innerHTML = '<input type="checkbox" checked><span></span>';
      tg.querySelector('input').onchange = ev => { shown = ev.target.checked; document.body.classList.toggle('noevents', !shown); renderBar(); applyGlitch(); };
      document.getElementById('tgMarkers')?.closest('label')?.after(tg);
    }
    const act = vis().filter(e => mapOf(e) === cur && live(e)).length;
    tg.querySelector('span').textContent = act ? T('ev.toggle_n', '事态 {n}', { n: act }) : T('ev.toggle', '事态');
    tg.hidden = !all().length;
  }
  // 网络攻击：受影响的层（或全城）在持续期内「花屏」：间歇的色散、横向撕裂、马赛克块，强度随等级；配 ⚠ 与「数据链路受扰」，一看就知道是剧情
  function applyGlitch() {
    const lv = !shown ? 0 : Math.max(0, ...all().filter(e => e.cat === '网络攻击' && !e.closed && (e.feed || floor - e.last <= (e.dur || 3)) &&
      (/全城|天城/.test(e.scope) || mapOf(e) === cur || (e.scope && MAP_OF[e.scope.replace(/\s/g, '').slice(0, 2)] === cur))).map(e => Math.max(1, e.lvl)));
    document.body.dataset.glitch = lv || '';
    $('#glitchNote').hidden = !lv; $('#glitchNote').textContent = T('ev.glitch', '⚠ 数据链路受扰');
  }
  // 世界图：天城内部未解除的事件汇成天城标记上的一个数字角标
  function worldBadge() {
    const n = vis().filter(e => live(e) && mapOf(e) !== 'world').length;
    const lab = [...document.querySelectorAll('.mk')].find(x => x.dataset.name === '天城')?.querySelector('.lab');
    if (lab) { if (n) lab.dataset.ev = n; else delete lab.dataset.ev; }
  }

  const css = `
  .ev{--c:#fff;display:flex;align-items:center;gap:4px;transform:translate(-11px,-11px);pointer-events:auto;cursor:pointer;filter:drop-shadow(0 1px 2px rgba(0,0,0,.8))}
  .ev i{width:20px;height:20px;border-radius:5px;transform:rotate(0);display:grid;place-items:center;font:700 11px/1 'PingFang SC',sans-serif;font-style:normal;color:#0b0b0b;
    background:linear-gradient(145deg,#fff 0,var(--c) 45%,color-mix(in srgb,var(--c) 60%,#000) 100%);box-shadow:0 0 0 2px rgba(0,0,0,.55),0 0 8px var(--c);position:relative}
  .ev.sev2 i{width:22px;height:22px}.ev.sev3 i{width:25px;height:25px;font-size:13px}
  .ev b{font:600 11px/1.3 'PingFang SC',sans-serif;color:#fff;background:rgba(8,10,14,.78);padding:1px 6px;border-radius:3px;border-left:2px solid var(--c);white-space:nowrap;max-width:14em;overflow:hidden;text-overflow:ellipsis}
  .ev-new i::after{content:'';position:absolute;inset:-5px;border-radius:7px;border:2px solid var(--c);animation:evpulse 1.6s ease-out 5;will-change:transform,opacity}
  .ev-new.sev3 i::after{animation-duration:.9s;animation-iteration-count:9}
  .ev.tier-after{opacity:.6}.ev-cleared{opacity:.45}.ev-cleared i{background:#777;box-shadow:0 0 0 2px rgba(0,0,0,.55)}
  .ev.approx i{outline:1px dashed rgba(255,255,255,.6);outline-offset:3px}
  .ev.hot i{outline:2px solid #fff;outline-offset:3px}
  body.far .ev b{display:none} body.noevents .ev{display:none}
  .mk .lab[data-ev]::after{content:attr(data-ev);display:inline-block;margin-left:6px;min-width:15px;height:15px;padding:0 4px;border-radius:8px;background:#e0182d;color:#fff;font:700 10px/15px 'PingFang SC',sans-serif;text-align:center;vertical-align:1px;box-shadow:0 0 6px rgba(224,24,45,.8)}
  .ev-radar{--c:#fff;width:0;height:0;pointer-events:none;position:relative}
  .ev-radar span{position:absolute;left:-60px;top:-60px;width:120px;height:120px;border-radius:50%;border:2px solid var(--c);opacity:0;animation:evradar 1.5s ease-out forwards}
  .ev-radar span:nth-child(2){animation-delay:.25s}.ev-radar span:nth-child(3){animation-delay:.5s}
  .ev-radar i{position:absolute;left:-36px;top:-36px;width:72px;height:72px;border:2px solid var(--c);border-radius:4px;box-shadow:0 0 12px var(--c);animation:evlock .9s cubic-bezier(.2,.8,.2,1) forwards}
  .ev-radar i::before,.ev-radar i::after{content:'';position:absolute;background:var(--c)}
  .ev-radar i::before{left:50%;top:-10px;bottom:-10px;width:1px}.ev-radar i::after{top:50%;left:-10px;right:-10px;height:1px}
  @keyframes evradar{0%{transform:scale(.1);opacity:.9}100%{transform:scale(1);opacity:0}}
  @keyframes evlock{0%{transform:scale(2.4) rotate(45deg);opacity:0}60%{opacity:1}100%{transform:scale(.45) rotate(0);opacity:0}}
  @keyframes evpulse{from{transform:scale(1);opacity:.9}to{transform:scale(2.2);opacity:0}}
  #evbar{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);z-index:6;max-width:min(460px,calc(100% - 16px));width:max-content;background:rgba(13,17,23,.92);border:1px solid rgba(240,138,36,.6);border-radius:12px;font-size:12px;color:#e6edf3;box-shadow:0 6px 18px rgba(0,0,0,.5)}
  #evbar[hidden]{display:none}
  #evbar>button{all:unset;box-sizing:border-box;display:flex;gap:8px;align-items:center;width:100%;padding:6px 12px;cursor:pointer}
  #evbar>button:active{opacity:.7}
  #evbar .dot{width:8px;height:8px;transform:rotate(45deg);background:#f08a24;flex:none}
  #evbar .new{color:#f08a24;font-weight:700;white-space:nowrap} #evbar .tog{margin-left:auto;color:#8b949e;white-space:nowrap}
  #evbar ol{list-style:none;margin:0;padding:0 6px 6px;max-height:38vh;overflow-y:auto}
  #evbar[data-open="0"] ol,#evbar[data-open="0"] .evleg{display:none}
  .evleg{display:flex;flex-wrap:wrap;gap:4px;padding:2px 8px 6px;align-items:center}
  .evleg button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:10px;border:1px solid rgba(255,255,255,.14);font-size:11px;line-height:16px;cursor:pointer;color:#e6edf3;white-space:nowrap}
  .evleg button i{width:8px;height:8px;border-radius:2px;background:var(--c);flex:none}
  .evleg button em{font-style:normal;color:#8b949e}
  .evleg button.none{opacity:.45}.evleg button.off{opacity:.35;text-decoration:line-through}.evleg button.off i{background:transparent;box-shadow:inset 0 0 0 1px var(--c)}
  .evleg button:hover{border-color:var(--c)}.evleg button:active{opacity:.6}.evleg button:focus-visible{outline:2px solid var(--c);outline-offset:1px}
  .evleg small{color:#8b949e;font-size:10.5px;margin-left:2px}
  #evbar li{display:grid;grid-template-columns:12px 1fr auto;gap:2px 8px;align-items:baseline;padding:6px;border-top:1px solid rgba(255,255,255,.08);cursor:pointer}
  #evbar li:hover{background:rgba(255,255,255,.05)} #evbar li:active{opacity:.6}
  #evbar li i{width:8px;height:8px;transform:rotate(45deg);background:var(--c);align-self:center}
  #evbar li b{font-weight:600} #evbar li small{color:#8b949e;font-size:11px;grid-column:2/-1}
  #evbar li.tier-fade{opacity:.5} #evbar li.isnew b::after{content:' NEW';color:#f08a24;font-size:10px}
  #evbar li em{font-style:normal;color:#8b949e;font-size:11px}
  @media (max-width:640px){body #evbar{left:96px;right:8px;transform:none;width:auto;max-width:none;bottom:calc(8px + env(safe-area-inset-bottom));z-index:9} body #evbar ol{max-height:34vh}}
  #glitchNote{position:absolute;left:50%;top:10px;transform:translateX(-50%);z-index:7;padding:3px 10px;border-radius:6px;background:rgba(6,20,26,.85);border:1px solid #3de0ff;color:#3de0ff;font:600 12px/1.5 ui-monospace,Menlo,monospace;text-shadow:-1px 0 #ff3d9a,1px 0 #3de0ff;pointer-events:none}
  #glitchNote[hidden]{display:none}
  /* 花屏：间歇发作（约 3 秒一次、每次半秒多），只动叠加层的 transform / 背景；底图滤镜只在桌面开，手机上省掉 */
  body[data-glitch]:not([data-glitch=""]) #stage::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:3;mix-blend-mode:screen;opacity:0;
    background:repeating-linear-gradient(0deg,rgba(61,224,255,.1) 0 2px,transparent 2px 5px),
      linear-gradient(90deg,transparent 0 30%,rgba(255,61,154,.22) 30% 34%,transparent 34% 71%,rgba(61,224,255,.24) 71% 73%,transparent 73%);
    background-size:100% 100%,100% 37%;animation:gltear 3.1s steps(1) infinite}
  body[data-glitch="3"] #stage::before{content:'';position:absolute;inset:0;pointer-events:none;z-index:3;opacity:0;
    background:conic-gradient(from 90deg at 50% 50%,#3de0ff 0 25%,transparent 0 50%,#ff3d9a 0 75%,transparent 0) 0 0/26px 26px;
    -webkit-mask:linear-gradient(transparent 0 22%,#000 22% 31%,transparent 31% 58%,#000 58% 63%,transparent 63%);mask:linear-gradient(transparent 0 22%,#000 22% 31%,transparent 31% 58%,#000 58% 63%,transparent 63%);
    animation:glmask 3.1s steps(1) infinite}
  body:not(.coarse)[data-glitch]:not([data-glitch=""]) #osd{animation:glshift 3.1s steps(1) infinite}
  body:not(.coarse)[data-glitch="2"] #osd,body:not(.coarse)[data-glitch="3"] #osd{filter:saturate(1.6) contrast(1.2) hue-rotate(-14deg)}
  body[data-glitch]:not([data-glitch=""]) .mk .lab{text-shadow:-1px 0 #3de0ff,1px 0 #ff3d9a}
  @keyframes glshift{0%,80%,100%{transform:none}82%{transform:translate(-6px,1px)}86%{transform:translate(4px,-2px) skewX(-2deg)}90%{transform:translate(-2px,0)}}
  @keyframes gltear{0%,78%{opacity:0}80%{opacity:1;background-position:0 0,0 10%}86%{opacity:1;background-position:0 3px,0 55%}92%{opacity:1;background-position:0 1px,0 85%}96%,100%{opacity:0}}
  @keyframes glmask{0%,80%{opacity:0}82%{opacity:.4;-webkit-mask-position:0 0;mask-position:0 0}90%{opacity:.4;-webkit-mask-position:0 40%;mask-position:0 40%}94%,100%{opacity:0}}
  @media (prefers-reduced-motion:reduce){body[data-glitch] #osd,body[data-glitch] #stage::after,body[data-glitch] #stage::before,.ev-new i::after{animation:none}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function init() {
    const stage = $('#stage');
    if (!$('#evbar')) stage.insertAdjacentHTML('beforeend', '<div id="evbar" hidden data-open="0"><button type="button"></button><div class="evleg"></div><ol></ol></div><div id="glitchNote" hidden></div>');
    $('#evbar .evleg').addEventListener('click', e => { const b = e.target.closest('button[data-g]'); if (!b) return;
      const g = b.dataset.g; off.has(g) ? off.delete(g) : off.add(g); try { localStorage.setItem(OFF_KEY, JSON.stringify([...off])); } catch (err) {}
      render(); renderBar(); badges(); });
    $('#evbar > button').addEventListener('click', () => { open = !open; renderBar(); });
    $('#evbar ol').addEventListener('click', e => { const li = e.target.closest('li'); if (li) flyTo(li.dataset.id); });
    if (coarse) document.body.classList.add('coarse');
  }
  // 层切换器上的事态数：某张地图上未解除的事件条数（查看器的 updateLayerBadges 读取）
  const countOn = id => vis().filter(e => mapOf(e) === id && live(e)).length;
  const badges = () => { if (typeof updateLayerBadges === 'function') updateLayerBadges(); };
  return { init, set, render: afterOpen, pollFeeds, flyTo, countOn, get events() { return all(); } };
})();
