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
  // 当前这一层的事件不再写层名（面包屑、层按钮已经说了）；别的层照写（v0.9.2）
  const whereHere = e => mapOf(e) === cur && e.place ? e.place : where(e);
  const srcNew = e => e.src && !(e.place || '').includes(e.src) ? e.src : '';   // 发布方就是地点本身（「血肉磨坊」）时不再重复
  const LOOK = {   // 类别 → 图标字、颜色（真实事件地图的惯例：火警红橙、警务蓝、治安紫、基础设施灰、网络青）
    火灾: ['火', '#ff5a2a'], 爆炸: ['爆', '#ff2a2a'], 持械: ['警', '#e0182d'], 凶案: ['案', '#c2263a'], 抢劫: ['劫', '#c23bd6'], 盗窃: ['盗', '#9a5cff'],
    通缉: ['缉', '#3d7dff'], 检查点管控: ['管', '#f08a24'], 黑市查抄: ['查', '#9fe870'], 骚乱: ['乱', '#e08a24'], 交通事故: ['轨', '#f0c020'],
    停电: ['电', '#9aa4b5'], 网络攻击: ['网', '#3de0ff'], 气候故障: ['气', '#7fd6ff'], 结界事故: ['界', '#e6c36a'], 空域巡查: ['巡', '#d9a441'],
    政策: ['政', '#6f9be0'], 公共直播: ['播', '#e0182d'], 民生: ['民', '#e8d08a'], 军事调动: ['军', '#a3b18a'], 急救: ['救', '#37c5b0'], 其他: ['!', '#cfd8e0'],
  };
  const look = c => LOOK[c] || LOOK.其他;
  const lk = e => e.ch && e.color ? [e.ch, e.color] : look(e.cat);   // events.mjs 给的图标字与大类颜色优先（v2：9 个大类 = 9 种颜色）
  // 图例与筛选（v2）：9 个大类的颜色；点一个大类 = 在地图、列表、层计数里隐藏它（记在本机）。大类表在 events.mjs 加载后取，加载前用这份
  let GROUPS = { 空防: '#d9a441', 气候: '#7fd6ff', 治安: '#3d7dff', 政治: '#6f9be0', 媒体: '#d03ca8', 民生: '#e8d08a', 军事: '#a3b18a', 灾害: '#ff5a2a', 人物: '#d7a6e8' };
  let ORDER = Object.keys(GROUPS);
  // 大类形状（色弱也分得清，E4 N30）：与 events.mjs 的 SHAPES 一致，模块加载后以模块为准
  let SHAPES = { 空防: 'hex', 气候: 'circle', 治安: 'square', 政治: 'penta', 媒体: 'diamond', 民生: 'octa', 军事: 'tri-down', 灾害: 'tri', 人物: 'ring', 其他: 'square' };
  const shp = g => 'sh-' + (SHAPES[g] || 'square');
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
  let tab = 'ev', items = [], floor = 0, feedItems = [], shown = true, flyId = null, open = false, EVM = null, lastFly = null, glitchLv = 0;
  const said = new Set();   // 已经播报过的新事件（读屏）
  const markersOf = {};                                    // 地图 id → 点位数据（按需加载）
  const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619); return (h >>> 0) / 4294967296; };
  const all = () => items.concat(feedItems);
  const vis = () => all().filter(e => !off.has(grpOf(e)));   // 筛选后看得见的
  // v0.9.6：城外 / 异兽类（天城外、又没认出具体的世界地名）落在「天城周边」过渡环里：显示在当前所在的天城层（不在天城时算中层）
  const RE_RING = /外围|城外|郊|异兽|兽潮|野兽|清剿|荒野|边境|防线/;
  const isRing = e => e.layer === '天城外' && RE_RING.test((e.place || '') + (e.cat || '')) && !worldPos(e.place);
  const tierNow = () => { const S = window.TCScale; return S?.isTier(cur) ? cur : S?.lastTier || 'tc_mid'; };
  const mapOf = e => (isRing(e) ? tierNow() : MAP_OF[e.layer] || 'tc_mid');
  const live = e => !e.closed && e.tier !== 'fade';

  // 地点 → 坐标：①显式坐标 ②该层地图的地标名 / 别名（最长匹配）③城区关键词 ④只知道层：按地点哈希放在中部一圈，标成「位置不详」
  // 天城外（世界图）的地名 → 世界图坐标：地点、封地、国名里最长的匹配（E4 N15）
  function worldPos(place) {
    if (!place || typeof M === 'undefined' || !M) return null;
    let best = null;
    const see = (name, x, y) => { if (name && (place.includes(name) || (name.length >= 2 && name.includes(place))) && (!best || name.length > best.len)) best = { len: name.length, x, y }; };
    for (const p of [...(M.places || []), ...(M.fiefs || [])]) see(p.name, p.x, p.y);
    for (const r of M.realms || []) see(r.name, r.c?.[0], r.c?.[1]);
    if (!best || best.x == null) return null;
    const [nx, ny] = toImg(best.x, best.y); return { nx, ny, marker: true };
  }
  function pos(e) {
    const mid = mapOf(e), m = REG.maps[mid];
    if (m?.kind === 'world') return worldPos(e.place) || { nx: .5, ny: .5, approx: true, none: true };
    if (isRing(e)) { const a = hash(e.key || e.id) * Math.PI * 2, r = .62 + .5 * hash((e.key || e.id) + '#');   // 城边外 0.6–1.1 个城宽（约 2–3 km）一圈
      return { nx: .5 + Math.cos(a) * r, ny: .5 + Math.sin(a) * r * .8, approx: true, ring: true }; }
    const xy = (e.xy || '').split(/[,，]/).map(Number);
    if (xy.length === 2 && xy.every(v => v >= 0 && v <= 1)) return { nx: xy[0], ny: xy[1] };
    let best = null;
    for (const k of markersOf[mid] || []) { const meta = m?.markers?.[k.id]; if (!meta) continue;
      for (const w of [meta.name, ...(meta.alias || [])]) if (w && e.place && (e.place.includes(w) || w.includes(e.place)) && (!best || w.length > best.len)) best = { k, len: w.length }; }
    if (best) return { nx: best.k.nx, ny: best.k.ny, marker: true, name: m.markers[best.k.id].name };
    const j = hash(e.key || e.id), j2 = hash((e.key || e.id) + '~');
    for (const [re, x, y] of ZONES[mid] || []) if (re.test(e.place)) return { nx: (x + 15) / 30 + (j - .5) * .04, ny: (9.375 - y) / 18.75 + (j2 - .5) * .06 };
    return { nx: .2 + .6 * j, ny: .2 + .6 * j2, approx: true };
  }
  // 人物栏用（chars.js）：只知道城区时按城区关键词给一个大致坐标；认不出返回 null
  function zoneXY(mid, place) { const j = hash(place), j2 = hash(place + '~');
    for (const [re, x, y] of ZONES[mid] || []) if (re.test(place)) return { nx: (x + 15) / 30 + (j - .5) * .03, ny: (9.375 - y) / 18.75 + (j2 - .5) * .04, approx: true };
    return null; }
  async function loadMarkers() {
    await Promise.all(Object.values(MAP_OF).filter(id => REG.maps[id]?.data && !markersOf[id] && REG.maps[id].status !== 'planned')
      .map(id => getJSON(REG.maps[id].data).then(d => { markersOf[id] = d?.markers || []; }).catch(() => {})));
  }

  // ---------- 输入 ----------
  // 卡内脚本发来：{ items, floor, fly }（旧版云端协议 { list, last } 也兼容：交给 events.mjs 重新解析）
  async function set(d) {
    const before = new Set(all().map(e => e.id));
    if (Array.isArray(d.items)) { items = d.items; floor = d.floor || 0; }
    else if (Array.isArray(d.list)) { const m = await mod(); if (!m) return;
      floor = d.last || 0; items = m.collect(d.list.map(o => ({ floor: o.mes ?? floor, text: tagText(o) })), floor); }
    if (d.fly) flyId = d.fly;
    // 读屏播报：新出现的进行中事件（每条只播一次）
    const fresh = all().filter(e => live(e) && (e.isNew || (before.size && !before.has(e.id))) && !said.has(e.id));
    for (const e of fresh) said.add(e.id);
    if (fresh.length && typeof announce === 'function') announce(T('ev.sr_new', '新增 {n} 起事态：', { n: fresh.length }) + fresh.slice(0, 3).map(e => `${tn(e.cat)}·${e.text || ''}（${where(e)}）`).join('；'));
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
    for (const el of layerEls) { if (typeof untrack === 'function') untrack(el); viewer.removeOverlay(el); } layerEls = [];   // 追踪器先 destroy，不留监听（E4 N11）
    if (REG.maps[cur]?.kind === 'estate') return;   // 庄园剖面（iframe）不画事态点
    const world = REG.maps[cur]?.kind === 'world';
    if (world) worldBadge();
    // 正在飞往的那一条即使已淡出也画出来，落点上不会空（E4 N17）；世界图只画天城外的事件（E4 N15）
    const here = vis().filter(e => mapOf(e) === cur && (e.tier !== 'fade' || e.id === lastFly)).slice(0, 50);    // 手机上叠加层不超过 50 个
    const seen = {}, onMk = new Set();
    for (const e of here) {
      const p = pos(e); if (p.none) continue; if (p.name) onMk.add(p.name);
      const k = `${p.nx.toFixed(3)},${p.ny.toFixed(3)}`, n = seen[k] = (seen[k] || 0) + 1;   // 同一地点多条：绕一小圈错开
      const a = n * 2.4, r = n > 1 ? .006 * Math.sqrt(n) : 0, [ch, color] = lk(e);
      const el = document.createElement('div');
      el.className = `ev ${shp(grpOf(e))} ${e.closed ? 'ev-cleared' : 'ev-active'} sev${Math.max(1, e.lvl)} tier-${e.tier}${p.approx ? ' approx' : ''}${e.isNew && live(e) ? ' ev-new' : ''}`;
      el.style.setProperty('--c', color); el.dataset.ev = e.id;
      el.innerHTML = `<i aria-hidden="true">${esc(ch)}</i><b>${esc(e.text || e.cat)}</b>`;
      el.title = `${tn(e.cat)} · ${e.place || tn(e.layer)}`;
      const label = `${tn(e.cat)}${e.closed ? '（' + T('ev.cleared', '已解除') + '）' : ''} · ${e.text || ''} · ${where(e)}`;
      if (typeof trackEl === 'function') trackEl(el, () => card(e, el), label); else new OpenSeadragon.MouseTracker({ element: el, clickHandler: () => card(e, el) });
      placeN(el, p.nx + Math.cos(a) * r, p.ny + Math.sin(a) * r * 1.6, OpenSeadragon.Placement.CENTER); layerEls.push(el);
    }
    // v0.9.2：事态落在某个地标上时，这个地标（针脚 + 地名）让位给事态点，只留一条标签；当前地点的针脚照常显示
    document.querySelectorAll('.mk').forEach(m => m.classList.toggle('evon', shown && onMk.has(m.dataset.name) && !m.classList.contains('here')));
    document.body.classList.toggle('noevents', !shown);
    updateToggle(); applyGlitch();
    if (typeof tabOrder === 'function') tabOrder();
    if (typeof declutter === 'function') declutter();   // 事态点也参加标签避让（E5 R14）
  }
  // 事态卡（规范 3.2 卡片）：tag = 大类（数据色底 + 深字）；标题 = 事件本身；副标题 = 大类 · 类型（不再和字段区重复）；字段区两列网格
  let kbdFly = false;   // 从列表用键盘飞过去：落地开卡后焦点放到卡片标题（E4b R06）
  function card(e, el) {
    document.querySelectorAll('.ev.hot').forEach(x => x.classList.remove('hot')); el?.classList.add('hot');
    const p = pos(e), st = e.closed ? T('ev.cleared', '已解除') : tn(e.status) || T('ev.ongoing', '发生中');
    const rare = e.rare >= 4 ? T('ev.rare4', '（传说级）') : e.rare >= 3 ? T('ev.rare3', '（罕见）') : '';
    const lv = Math.max(1, e.lvl);
    showCard(null, e.text || tn(e.cat), 'inf', '', '', `${tn(e.cat)}${rare}`);   // 大类只在顶上的色块里出现一次（v0.9.2）
    const rows = [
      [T('ev.k_place', '地点'), esc(whereHere(e)) + (p.approx ? `<br><small>${esc(T('ev.approx', '（位置不详，按所在层大致标出）'))}</small>` : '')],
      [T('ev.k_state', '等级 / 状态'), `<span class="bars" aria-label="${esc(T('ev.k_lvl', '等级') + ' ' + lv + '/3')}">${'▮'.repeat(lv)}${'▯'.repeat(3 - lv)}</span>　${esc(st)}`],
      e.time && [T('ev.k_time', '时间'), esc(e.time)], e.code && [T('ev.k_code', '编号'), esc(e.code)],
      [T('ev.k_src', '来源'), esc(e.feed ? e.src || T('ev.feed_default', '外部数据源')
        : (srcNew(e) || !e.src ? T('ev.src_floor', '{src} · 聊天第 {n} 楼', { src: srcNew(e) || T('ev.unsigned', '未署名'), n: e.first }) : T('ev.floor', '第 {n} 楼', { n: e.first })) + (e.count > 1 ? T('ev.updates', '起，更新 {n} 次', { n: e.count - 1 }) : ''))],
    ].filter(Boolean);
    const sv = document.querySelector('#card .src'); delete sv.dataset.note;   // 事态卡不是设定原文，不加「原文（中文）」说明
    sv.innerHTML = `<dl class="fields">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
    const t = document.querySelector('#card .tag'); t.textContent = e.grp ? tn(e.grp) : T('ev.tag', '天城事态'); t.className = 'tag data'; t.style.background = lk(e)[1];
    if (kbdFly) { kbdFly = false; document.getElementById('cardTitle')?.focus({ preventScroll: true }); }
  }
  function flyTo(id) {
    const e = all().find(x => x.id === id), mid = e && mapOf(e);
    if (!e || !REG.maps[mid] || REG.maps[mid].status === 'planned') return !!e;
    // 飞之前收起列表、关掉卡片：落点不被挡住（E4 N14）
    if (open) { open = false; renderBar(); }
    if (typeof closeCard === 'function') closeCard();
    lastFly = id;
    if (mid !== cur) { flyId = id; go(mid); return false; }
    const p = pos(e);
    if (p.none) { card(e, null); return true; }   // 世界图上认不出的地名：只开卡片
    if (!document.querySelector(`.ev[data-ev="${CSS.escape(id)}"]`)) render();   // 已淡出的事件：补画出来
    const W = Math.max(1, $('#osd').clientWidth), H = $('#osd').clientHeight, w = REG.maps[mid].kind === 'world' ? .3 : .22, h = w * (H / W);
    // 落点放在「卡片以外的可见区域」中心：桌面扣掉右侧卡片，手机扣掉底部抽屉（约 45%），再扣掉底部横条
    const nar = innerWidth <= 640, occR = nar ? 0 : Math.min(334, W * .5), occB = nar ? H * .45 : 44;
    const ox = occR / 2 / W * w, oy = occB / 2 / H * h;
    userMoved = true;
    const vp = viewer.viewport, target = new OpenSeadragon.Rect(p.nx + ox - w / 2, p.ny * aspect + oy - h / 2, w, h), now = vp.getBounds(true);
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
  const rmq = matchMedia('(prefers-reduced-motion: reduce)');
  let reduce = rmq.matches; rmq.addEventListener?.('change', () => { reduce = rmq.matches; });   // 系统设置中途改了也生效（E4 N24）
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
    // 人物页（v0.9.2，chars.js）：和事态同一条横条，两个页签；哪边都没有内容才藏起横条
    const chN = typeof TCChars !== 'undefined' ? TCChars.count() : 0, hasEv = !!every.length && shown;
    bar.hidden = !hasEv && !chN; if (bar.hidden) return;
    if (tab === 'ev' && !hasEv) tab = 'ch'; if (tab === 'ch' && !chN) tab = 'ev';
    bar.dataset.tab = tab;
    const ct = bar.querySelector('.chtab'); ct.hidden = !chN; ct.setAttribute('aria-expanded', open && tab === 'ch' ? 'true' : 'false');
    ct.innerHTML = `<i class="shp sh-circle" aria-hidden="true"></i>${esc(T('ch.tab', '人物'))}<em>${chN}</em>`;
    if (open && tab === 'ch') TCChars.pane(bar.querySelector('.chpane'));
    if (!grpLoaded) { grpLoaded = true; mod().then(m => { if (m?.GROUPS) { GROUPS = m.GROUPS; ORDER = m.GROUP_ORDER || Object.keys(m.GROUPS).filter(g => g !== '其他'); if (m.SHAPES) SHAPES = m.SHAPES; renderBar(); } }); }   // 有事件时才取大类表
    const n = list.filter(live).length, fresh = list.filter(e => e.isNew).length, hid = ORDER.filter(g => off.has(g)).length + (off.has('其他') ? 1 : 0);
    const tb = bar.querySelector(':scope > button'); tb.hidden = !hasEv; tb.setAttribute('aria-expanded', open && tab === 'ev' ? 'true' : 'false');
    // 左侧形状点 = 最新一条（进行中优先）的大类
    const top = list.filter(live).sort((a, b) => (b.last || 0) - (a.last || 0))[0] || list[0];
    tb.innerHTML = `<i class="shp ${shp(top ? grpOf(top) : '其他')}" style="--c:${top ? lk(top)[1] : 'var(--muted)'}" aria-hidden="true"></i><span class="sum">${esc(n ? T('ev.bar_live', '{n} 起进行中', { n }) : T('ev.bar_none', '暂无进行中'))}${list.length !== n ? ' · ' + esc(T('ev.bar_total', '共 {n} 起事态', { n: list.length })) : ''}${hid ? ' · ' + esc(T('ev.filtered', '已隐藏 {n} 类', { n: hid })) : ''}</span>${fresh ? `<span class="new">${esc(T('ev.bar_new', '{n} 条新', { n: fresh }))}</span>` : ''}<span class="sr-only">${esc(open ? T('ev.collapse', '收起') : T('ev.expand', '展开'))}</span><svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 10l4-4 4 4"/></svg>`;
    bar.dataset.open = open ? '1' : '0'; document.body.classList.toggle('evopen', open);   // 手机上列表展开时停靠栏 / 层条让位（v0.9.2 人物栏审阅 P1）
    // 图例：9 个大类都列出（没有事件的变淡），数字 = 该类条数；点一下隐藏 / 恢复
    const cnt = {}; for (const e of every) cnt[grpOf(e)] = (cnt[grpOf(e)] || 0) + 1;
    const gs = ORDER.concat(cnt.其他 ? ['其他'] : []).filter(g => cnt[g] || off.has(g));   // 只列有事件的大类和已隐藏的（v0.9.2：9 个空类占两行）
    bar.querySelector('.evleg').innerHTML = gs.map(g => `<button type="button" data-g="${esc(g)}" class="${off.has(g) ? 'off' : ''}${cnt[g] ? '' : ' none'}" style="--c:${GROUPS[g] || '#cfd8e0'}" aria-pressed="${off.has(g) ? 'false' : 'true'}"><i class="shp ${shp(g)}" aria-hidden="true"></i>${esc(tn(g))}${cnt[g] ? `<em>${cnt[g]}</em>` : ''}</button>`).join('')
      + (hintOnce() ? `<small>${esc(T('ev.legend_hint', '点大类可隐藏 / 显示'))}</small>` : ''); bar.querySelector('.evleg').title = T('ev.legend_hint', '点大类可隐藏 / 显示');
    // 列表项：li 里包一个真正的 <button>（原来 li 上的 role=button 让 axe 报 list / aria-allowed-role，E4b R08）
    bar.querySelector('ol').innerHTML = list.map(e => `<li class="tier-${e.tier}${e.isNew ? ' isnew' : ''}${e.closed ? ' closed' : ''}" style="--c:${lk(e)[1]}"><button type="button" data-id="${esc(e.id)}"><i class="shp ${shp(grpOf(e))}" aria-hidden="true"></i><b>${esc(tn(e.cat))}${e.closed ? ' · ' + esc(T('ev.cleared', '已解除')) : ''}${e.isNew ? `<span class="nb">${esc(T('ev.new', '新'))}</span>` : ''} <em>${esc(whereHere(e))}</em></b><em>${esc(e.feed ? T('ev.feed', '数据源') : T('ev.floor', '第 {n} 楼', { n: e.last }))}</em><small>${esc(e.text || '')}${srcNew(e) ? ' —— ' + esc(srcNew(e)) : ''}</small></button></li>`).join('');
  }
  // 图例提示只在第一次展开时出现一行（之后在 title 里），不常驻占一行（v0.9.2）
  let hintSeen = null;
  function hintOnce() { if (!open) return false; if (hintSeen === null) { try { hintSeen = !!localStorage.getItem('edenMapLegHint'); localStorage.setItem('edenMapLegHint', '1'); } catch (e) { hintSeen = true; } } return !hintSeen; }
  function updateToggle() {
    let tg = document.getElementById('tgEvents');
    if (!tg) {
      tg = document.createElement('label'); tg.className = 'tg'; tg.id = 'tgEvents';
      tg.innerHTML = '<span></span><input type="checkbox" role="switch" checked>';
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
    if (lv && !glitchLv && typeof announce === 'function') announce(T('ev.glitch', '⚠ 数据链路受扰').replace(/^⚠\s*/, ''));   // 花屏开始时播报一次
    glitchLv = lv;
  }
  // 世界图：天城内部未解除的事件汇成天城标记上的一个数字角标
  function worldBadge() {
    const n = vis().filter(e => live(e) && mapOf(e) !== 'world').length;
    const lab = [...document.querySelectorAll('.mk')].find(x => x.dataset.name === '天城')?.querySelector('.lab');
    if (lab) { if (n) lab.dataset.ev = n; else delete lab.dataset.ev; }
  }

  const css = `
  .ev{--c:#fff;position:relative;display:flex;align-items:center;gap:4px;transform:translate(-11px,-11px);pointer-events:auto;cursor:pointer;filter:drop-shadow(0 1px 2px rgba(0,0,0,.8))}
  /* 图标 = 大类色的形状底（i::before，按大类裁成圆 / 方 / 菱 / 三角……，色弱也分得清）+ 类型字；描边和光晕在 i 上，不被裁掉 */
  .ev i{width:20px;height:20px;display:grid;place-items:center;font:700 11px/1 var(--font-ui,sans-serif);font-style:normal;color:#0b0b0b;position:relative;z-index:0;filter:drop-shadow(0 0 1px #000) drop-shadow(0 0 4px var(--c))}
  .ev i::before{content:'';position:absolute;inset:0;z-index:-1;border-radius:4px;background:linear-gradient(145deg,#fff 0,var(--c) 45%,color-mix(in srgb,var(--c) 60%,#000) 100%)}
  .ev.sev2 i{width:22px;height:22px}.ev.sev3 i{width:25px;height:25px;font-size:13px}
  .ev.sh-circle i::before,.ev.sh-ring i::before,i.shp.sh-circle,i.shp.sh-ring{border-radius:50%}
  .ev.sh-ring i::before{box-shadow:inset 0 0 0 2.5px rgba(0,0,0,.55)} i.shp.sh-ring{box-shadow:inset 0 0 0 2px rgba(0,0,0,.6)}
  .ev.sh-square i::before,i.shp.sh-square{border-radius:3px}
  .ev.sh-diamond i::before,i.shp.sh-diamond{clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);inset:-3px}
  .ev.sh-tri i::before,i.shp.sh-tri{clip-path:polygon(50% 0,100% 100%,0 100%);inset:-5px -4px -1px}
  .ev.sh-tri i{place-items:end center;padding-bottom:1px;box-sizing:border-box}
  .ev.sh-tri-down i::before,i.shp.sh-tri-down{clip-path:polygon(0 0,100% 0,50% 100%);inset:-1px -4px -5px}
  .ev.sh-tri-down i{place-items:start center;padding-top:1px;box-sizing:border-box}
  .ev.sh-hex i::before,i.shp.sh-hex{clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%);inset:0 -3px}
  .ev.sh-octa i::before,i.shp.sh-octa{clip-path:polygon(30% 0,70% 0,100% 30%,100% 70%,70% 100%,30% 100%,0 70%,0 30%)}
  .ev.sh-penta i::before,i.shp.sh-penta{clip-path:polygon(0 0,100% 0,100% 62%,50% 100%,0 62%);inset:0 0 -3px}
  .ev.sh-penta i{place-items:start center;padding-top:3px;box-sizing:border-box}
  body:not([data-map="tc_mid"]) .ev i{filter:drop-shadow(0 0 1px #000) drop-shadow(0 1px 1px rgba(0,0,0,.6))}   /* 光晕只在中层（规范 3.4） */
  /* 触屏：图标周围 44×44 的透明热区（E4 N25） */
  @media (pointer:coarse),(max-width:640px){.ev::before{content:'';position:absolute;left:-12px;top:50%;width:44px;height:44px;margin-top:-22px}}
  .ev b{font:600 var(--fs-micro,11px)/1.3 var(--font-ui,sans-serif);color:var(--map-label-ink,#fff);background:var(--map-label-bg,rgba(8,10,14,.8));padding:1px 6px;border-radius:var(--r-s,4px);border-left:2px solid var(--c);white-space:nowrap;max-width:14em;overflow:hidden;text-overflow:ellipsis}
  .ev.lhide b{visibility:hidden}
  .ev{z-index:2}
  .ev-new i::after{content:'';position:absolute;inset:-5px;border-radius:7px;border:2px solid var(--c);animation:evpulse 1.6s ease-out 5;will-change:transform,opacity}
  .ev-new.sev3 i::after{animation-duration:.9s;animation-iteration-count:9}
  /* 已解除 / 余波：图标变灰、变淡；文字标签不整体降透明度（对比度，E5 V20） */
  .ev.tier-after i{opacity:.65}.ev-cleared i{opacity:.55}.ev-cleared i::before{background:#80868d}.ev-cleared i{filter:drop-shadow(0 0 1px #000)}.ev-cleared b{border-left-color:#80868d;color:#d0d4d8}
  .ev.approx i{outline:1px dashed rgba(255,255,255,.6);outline-offset:3px}
  .ev.hot i{outline:2px solid var(--map-label-ink,#fff);outline-offset:3px}
  .ev:focus-visible i{outline:2px solid var(--focus,#63b4be);outline-offset:4px}   /* 键盘焦点（E4b R07） */
  body.far .ev b{display:none} body.noevents .ev{display:none} .mk.evon{visibility:hidden}
  /* 世界图「天城」上的事态数：全站唯一的红 */
  .mk .lab[data-ev]::after{content:attr(data-ev);display:inline-block;margin-left:6px;min-width:16px;height:16px;padding:0 5px;box-sizing:border-box;border-radius:var(--r-pill,999px);background:var(--alert,#ff5a5a);color:var(--on-alert,#1a0606);font:700 var(--fs-micro,11px)/16px var(--font-mono,monospace);text-align:center;vertical-align:1px}
  .ev-radar{--c:#fff;width:0;height:0;pointer-events:none;position:relative}
  .ev-radar span{position:absolute;left:-60px;top:-60px;width:120px;height:120px;border-radius:50%;border:2px solid var(--c);opacity:0;animation:evradar 1.5s ease-out forwards}
  .ev-radar span:nth-child(2){animation-delay:.25s}.ev-radar span:nth-child(3){animation-delay:.5s}
  .ev-radar i{position:absolute;left:-36px;top:-36px;width:72px;height:72px;border:2px solid var(--c);border-radius:4px;box-shadow:0 0 12px var(--c);animation:evlock .9s cubic-bezier(.2,.8,.2,1) forwards}
  .ev-radar i::before,.ev-radar i::after{content:'';position:absolute;background:var(--c)}
  .ev-radar i::before{left:50%;top:-10px;bottom:-10px;width:1px}.ev-radar i::after{top:50%;left:-10px;right:-10px;height:1px}
  @keyframes evradar{0%{transform:scale(.1);opacity:.9}100%{transform:scale(1);opacity:0}}
  @keyframes evlock{0%{transform:scale(2.4) rotate(45deg);opacity:0}60%{opacity:1}100%{transform:scale(.45) rotate(0);opacity:0}}
  @keyframes evpulse{from{transform:scale(1);opacity:.9}to{transform:scale(2.2);opacity:0}}
  /* 事态横条（提示条）：Panel 规格，底部居中；左侧是最新事态的大类形状，「N 条新」用强调色 700，SVG chevron（E5 V03：不再用橙色描边） */
  #evbar{position:absolute;left:50%;bottom:var(--sp-5,12px);transform:translateX(-50%);z-index:6;max-width:min(480px,calc(100% - 24px));width:max-content;box-sizing:border-box;
    background:var(--surface-glass);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border:1px solid var(--line);border-radius:var(--r-l,12px);box-shadow:var(--sh-2);
    font-size:var(--fs-small,12px);color:var(--ink)}
  #evbar[data-open="1"]{background:var(--surface);-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:var(--sh-3)}
  #evbar[hidden]{display:none}
  #evbar button{font:inherit;color:inherit;background:none;border:0;margin:0;text-align:left;cursor:pointer;-webkit-appearance:none;appearance:none}
  #evbar{display:flex;flex-wrap:wrap;align-items:stretch}#evbar>.evleg,#evbar>ol,#evbar>.chpane{flex:1 0 100%}
  #evbar[data-open="0"] .chpane,#evbar[data-tab="ch"] .evleg,#evbar[data-tab="ch"] ol,#evbar[data-tab="ev"] .chpane{display:none!important}
  #evbar>button[hidden]{display:none}
  #evbar>.chtab{flex:none;display:flex;gap:var(--sp-3,6px);align-items:center;min-height:36px;padding:0 var(--sp-5,12px);border-left:1px solid var(--line)!important;border-radius:0 var(--r-l,12px) var(--r-l,12px) 0;white-space:nowrap}
  #evbar>.chtab .shp{width:10px;height:10px;border-radius:50%;background:transparent;box-shadow:inset 0 0 0 2px var(--ink)}#evbar>.chtab em{font-style:normal;color:var(--muted);font-family:var(--font-mono)}
  #evbar>.chtab[aria-expanded="true"],#evbar>button:first-child[aria-expanded="true"]{color:var(--accent)}
  #evbar>button:first-child{box-sizing:border-box;display:flex;gap:var(--sp-4,8px);align-items:center;flex:1 1 auto;min-height:36px;padding:0 var(--sp-5,12px);border-radius:var(--r-l,12px);transition:background var(--dur-1)}
  #evbar>button:hover{background:var(--surface-2)}
  #evbar>button:active{transform:scale(.99)}
  #evbar>button:focus-visible,#evbar li>button:focus-visible{outline:2px solid var(--focus);outline-offset:-2px}
  #evbar>button .shp{width:10px;height:10px;background:var(--c);flex:none}
  #evbar .sum{font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
  #evbar .new{color:var(--accent);font-weight:700;white-space:nowrap}
  #evbar .chev{margin-left:auto;width:14px;height:14px;flex:none;fill:none;stroke:var(--muted);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;transition:transform var(--dur-2)}
  #evbar[data-open="1"] .chev{transform:rotate(180deg)}
  #evbar ol{list-style:none;margin:0;padding:0 var(--sp-3,6px) var(--sp-3,6px);max-height:38vh;max-height:38dvh;overflow-y:auto}
  #evbar[data-open="0"] ol,#evbar[data-open="0"] .evleg{display:none}
  .evleg{display:flex;flex-wrap:wrap;gap:var(--sp-2,4px);padding:var(--sp-1,2px) var(--sp-4,8px) var(--sp-3,6px);align-items:center;border-top:1px solid var(--line)}
  .evleg button{box-sizing:border-box;display:inline-flex;align-items:center;gap:var(--sp-2,4px);min-height:24px;padding:0 var(--sp-4,8px);border-radius:var(--r-pill,999px);border:1px solid var(--line)!important;font-size:var(--fs-micro,11px);line-height:1.4;white-space:nowrap;transition:border-color var(--dur-1),background var(--dur-1)}
  .evleg button i{width:9px;height:9px;border-radius:2px;background:var(--c);flex:none}
  .evleg button em{font-style:normal;color:var(--muted);font-family:var(--font-mono)}
  /* 状态用颜色和文字表达（E5 V20）：没有事件 = 淡字；隐藏 = 删除线 + 空心形状 */
  .evleg button.none{color:var(--muted)}
  .evleg button.off{color:var(--muted);text-decoration:line-through;border-style:dashed!important}.evleg button.off i{background:transparent;box-shadow:inset 0 0 0 1.5px var(--c)}
  .evleg button:hover{border-color:var(--c)!important;background:var(--surface-2)}.evleg button:active{transform:scale(.97)}.evleg button:focus-visible{outline:2px solid var(--focus);outline-offset:1px}
  .evleg small{color:var(--muted);font-size:var(--fs-micro,11px);margin-left:2px}
  #evbar li{border-top:1px solid var(--line)}
  #evbar li>button{display:grid;grid-template-columns:12px 1fr auto;gap:2px var(--sp-4,8px);align-items:baseline;width:100%;box-sizing:border-box;padding:var(--sp-3,6px);border-radius:var(--r-m,8px);transition:background var(--dur-1)}
  #evbar li>button:hover{background:var(--surface-2)} #evbar li>button:active{transform:scale(.99)}
  #evbar li i{width:10px;height:10px;background:var(--c);align-self:center} #evbar li.closed i{background:var(--muted)}
  #evbar li b{font-weight:600} #evbar li small{color:var(--muted);font-size:var(--fs-micro,11px);grid-column:2/-1}
  #evbar li.tier-fade b,#evbar li.closed b{color:var(--ink-2);font-weight:500}
  #evbar li .nb{display:inline-block;margin-left:4px;padding:0 5px;border-radius:var(--r-s,4px);background:var(--accent-weak);color:var(--accent);font-size:var(--fs-micro,11px);font-weight:700;line-height:16px;vertical-align:1px}
  #evbar li em{font-style:normal;color:var(--muted);font-size:var(--fs-micro,11px)}
  /* 触屏：横条 44、列表行 44、图例 36（放在按钮样式之后，不被覆盖；E4b R05） */
  @media (pointer:coarse),(max-width:640px){#evbar>button{min-height:44px}#evbar>.chtab{min-height:44px} #evbar li>button{min-height:44px} .evleg button{min-height:44px;padding:0 12px}}
  @media (max-width:640px){body.evopen #dock,body.evopen #layers{visibility:hidden} body.evopen #evbar{right:8px!important;left:8px!important} body #evbar{left:calc(var(--layers-w,0px) + 8px);right:8px;transform:none;width:auto;max-width:none;bottom:calc(var(--sp-5,12px) + env(safe-area-inset-bottom));z-index:9} body #evbar ol{max-height:34vh;max-height:34dvh}
    body #glitchNote{top:60px;left:auto;right:8px;transform:none}}
  #glitchNote{position:absolute;left:50%;top:10px;transform:translateX(-50%);z-index:7;padding:3px 10px;border-radius:var(--r-s,4px);background:rgba(6,20,26,.88);border:1px solid #3de0ff;color:#3de0ff;font:600 var(--fs-small,12px)/1.5 var(--font-mono,monospace);text-shadow:-1px 0 #ff3d9a,1px 0 #3de0ff;pointer-events:none}
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
  /* 减少动态效果 / 设置里「关闭花屏特效」：花屏动画与滤镜全停（!important：原规则优先级更高，之前 reduce 只停掉了马赛克，E4 N24），文字提示照常 */
  @media (prefers-reduced-motion:reduce){body[data-glitch] #osd,body[data-glitch] #stage::after,body[data-glitch] #stage::before,.ev-new i::after{animation:none!important}body[data-glitch] #osd{filter:none!important}}
  body.nofx[data-glitch] #osd,body.nofx[data-glitch] #stage::after,body.nofx[data-glitch] #stage::before{animation:none!important;filter:none!important}
  body.nofx[data-glitch] .mk .lab{text-shadow:none}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function init() {
    const stage = $('#stage');
    if (!$('#evbar')) stage.insertAdjacentHTML('beforeend', '<div id="evbar" hidden data-open="0" data-tab="ev"><button type="button"></button><button type="button" class="chtab" hidden aria-controls="chpane"></button><div class="evleg" role="group"></div><ol></ol><div class="chpane" id="chpane"></div></div><div id="glitchNote" hidden></div>');
    $('#evbar .evleg').setAttribute('aria-label', T('ev.legend_aria', '按大类筛选'));
    $('#evbar .evleg').addEventListener('click', e => { const b = e.target.closest('button[data-g]'); if (!b) return;
      const g = b.dataset.g; off.has(g) ? off.delete(g) : off.add(g); try { localStorage.setItem(OFF_KEY, JSON.stringify([...off])); } catch (err) {}
      render(); renderBar(); badges(); });
    $('#evbar > button').setAttribute('aria-controls', 'evlist'); $('#evbar ol').id = 'evlist';
    $('#evbar > button').addEventListener('click', () => { open = !(open && tab === 'ev'); tab = 'ev'; renderBar(); });
    $('#evbar .chtab').addEventListener('click', () => { open = !(open && tab === 'ch'); tab = 'ch'; renderBar(); });
    const cp = $('#evbar .chpane'); cp.addEventListener('change', e => TCChars.onPane(e)); cp.addEventListener('click', e => TCChars.onPane(e));
    // 点列表项飞过去；卡片关闭（× / Esc）后焦点回到横条按钮（列表已收起）
    $('#evbar ol').addEventListener('click', e => { const b = e.target.closest('button[data-id]'); if (!b) return;
      kbdFly = e.detail === 0; if (typeof cardFrom !== 'undefined') cardFrom = $('#evbar > button'); flyTo(b.dataset.id); });
    if (coarse) document.body.classList.add('coarse');
  }
  // 层切换器上的事态数：某张地图上未解除的事件条数（查看器的 updateLayerBadges 读取）
  const countOn = id => vis().filter(e => mapOf(e) === id && live(e)).length;
  const badges = () => { if (typeof updateLayerBadges === 'function') updateLayerBadges(); };
  const collapse = () => { if (!open) return; open = false; if ($('#evbar')) renderBar(); };
  return { init, set, zoneXY, renderBar: () => $('#evbar') && renderBar(), render: afterOpen, pollFeeds, flyTo, countOn, collapse, isOpen: () => open && !$('#evbar')?.hidden, get events() { return all(); } };
})();
