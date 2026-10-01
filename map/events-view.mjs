// 地图事件层（查看器用）——「态势看板」
// 事件从哪来：①聊天里前端载体带的隐藏标签，由卡内脚本 eden-map.js 用 tavern/events-parse.mjs 解析、合并、老化后发来（items）；
//            ②可选的外部数据源（maps.json 的 feeds），也交给 events.mjs 解析，和聊天事件一起显示。
// 一条事件（events.mjs 的输出）：{ id, key, cat, layer, place, lvl, text, src, code, time, scope, dur, xy, status, first, last, count, closed, tier, isNew }
// 本文件只负责：落点（地名 → 坐标）、图标、事态列表、飞过去；按类型声明的屏幕特效（花屏）与世界图角标在 events-fx.mjs。类型、大类、图标、颜色、特效、默认隐藏都是设定包的数据（events 块，tavern/events-parse.mjs 读取）。设计见 docs/map-events.md。
// 查看器核心的状态与工具从 app/*.mjs 显式 import（arch-v2 §6 第 7 步）；别的外挂经 app/plugins.mjs 的 P 取（可能没加载，调用处带守卫）。
// 界面文字走查看器的 window.I18N（键在 i18n/*.json 的 ev.*）；类别、大类、层、状态名英文在设定包的英文地名表（清单 data.names.en）。事件标题、地点、发布方是剧情原文，不翻译。
import { mapRegistry, aspect, currentMapId, osdViewer } from './app/state.mjs';
import { $, esc } from './app/dom-helpers.mjs';
import { announce } from './app/screen-reader-announce.mjs';
import { coarse } from './app/viewport-mode.mjs';
import { getJSON } from './app/json-cache.mjs';
import { registry, declared } from './app/layer-host.mjs';
import { declutter, tabOrder } from './app/sharpness-tiers.mjs';
import { go } from './app/map-switch.mjs';
import { updateLayerBadges } from './app/map-level-nav.mjs';
import { cardFrom, closeCard, placeN, setCardFrom, showCard, trackEl, untrack } from './app/markers.mjs';
import { setUserMoved, userMoved } from './app/locate.mjs';
import { plugins, register } from './app/plugins.mjs';
import { eventGeo, eventLevel } from './app/nodes-runtime.mjs';
import { hash01, spotOf } from './core/event-geo.mjs';
import * as TCCvd from './app/color-vision-mode.mjs';
import { createEventsFx } from './events-fx.mjs';
import { uiTextOr } from './app/text-lookup.mjs';
import { provideTab, refreshTabs, saveTabSeen, tabSeen } from './app/tabs.mjs';   // the drawer's tab registry (S6-1): visibility, labels, fallback tab and the people pane live there
const EventsView = (() => {
  const tn = z => (z && window.I18N?.tr?.(z)) || z || '';
  const where = e => [tn(e.layer), e.place].filter(Boolean).join('·');
  // 当前这一层的事件不再写层名（面包屑、层按钮已经说了）；别的层照写（v0.9.2）
  const whereHere = e => mapOf(e) === currentMapId && e.place ? e.place : where(e);
  const srcNew = e => e.src && !(e.place || '').includes(e.src) ? e.src : '';   // 发布方就是地点本身（「血肉磨坊」）时不再重复
  const look = c => { const r = EVM?.classify(c); return r ? [r.icon, r.color ?? TCCvd.NEUTRAL] : ['!', TCCvd.NEUTRAL]; };   // 只给没带图标 / 颜色的事件（旧脚本、领航员）兜底：按类型名查设定包的分类
  // 色觉模式（E7）：开着时大类颜色换成 TCCvd 的安全色板，形状（SHAPES）与图标字不变；lk() 结果的颜色统一走 gcol(grp) 而不是原始色
  const lk = e => { const r = e.ch && e.color ? [e.ch, e.color] : look(e.cat); return [r[0], TCCvd.safeColor(TCCvd.isEnabled() ? gcol(grpOf(e)) : r[1])]; };   // 颜色只收 #rrggbb（K-R64 / I-09：e.color 来自聊天脚本），别的一律中性色
  // 图例与筛选（v2）：各大类的颜色；点一个大类 = 在地图、列表、层计数里隐藏它（记在本机）。大类表在 events.mjs 加载、装入设定包的分类后取（taxNow）
  let GROUPS = {}, ORDER = [], XCVD = {};
  const gcol = g => TCCvd.safeColor(TCCvd.groupColor(g, GROUPS[g] || TCCvd.NEUTRAL, XCVD[g]));   // 关时原色板，开时 CVD 安全色板
  let SHAPES = {};   // 大类形状（色弱也分得清，E4 N30）：大类的 shape
  const shp = g => 'sh-' + (SHAPES[g] || 'square');
  const OFF_KEY = 'edenMapEvOff';
  // 类型级默认关（用户 2026-09-29）：设定包在类型上写 x-default-off；OFF_KEY 从没存过（用户没动过筛选）时由 taxNow 种入，不主动落盘——第一次点图例筛选后完全跟用户走。
  const off = new Set((() => { try { const v = LocalStore.get(OFF_KEY); return v == null ? [] : JSON.parse(v) || []; } catch (e) { return []; } })());
  const grpOf = e => e.grp || '其他';
  const offed = e => off.has(grpOf(e)) || off.has('type:' + e.cat);   // 关掉的大类 / 类型
  let taxFor = null /* 已取过的分类（events 块对象），换了才重取 */, tab = 'ev', items = [], floor = 0, feedItems = [], shown = true, flyId = null, EVM = null, lastFly = null;
  const said = new Set();   // 已经播报过的新事件（读屏）
  const markersOf = {};                                    // 地图 id → 点位数据（按需加载）
  const all = () => items.concat(feedItems);
  const vis = () => all().filter(e => !offed(e));   // 筛选后看得见的
  // 落点由节点树定（core/event-geo.mjs，K-R24）：卡内脚本盖了 node 的用 node；老脚本只发 layer + place，就按文字再定位一次；node 为 null = 认不出地点，只列出、不上图（K-01 B）
  const tierNow = () => { const S = window.ScaleHandoffApi; return S?.isTier(currentMapId) ? currentMapId : S?.lastTier || eventLevel(mapRegistry); };
  const memo = new WeakMap();
  function placeOf(e) {
    const g = eventGeo(); if (!g || e.node === null) return null;
    const hit = memo.get(e); if (hit?.g === g) return hit.p;
    const p = (e.node && g.placeNode(e.node)) || g.place([e.layer, e.place].filter(Boolean).join('·'));
    memo.set(e, { g, p }); return p;
  }
  // 事态所在的地图：城郊（外围一圈）画在当前所在的那层；没有地点的不属于任何地图
  const mapOf = e => { const p = placeOf(e); return !p ? '' : p.ring ? tierNow() : p.map || ''; };
  const listed = e => { const m = mapOf(e); return !m || !!mapRegistry.maps[m]; };
  const live = e => !e.closed && e.tier !== 'fade';

  // 地点 → 坐标（core/event-geo.mjs spotOf）：城郊一圈 → 世界图只画节点自己的位置 → 显式坐标 → 地标（或它上面最近有地标的地方）→ 城区节点的 at（加一点固定抖动）→ 只知道层：按地点哈希放在中部，标成「位置不详」
  function pos(e) {
    const p = placeOf(e), mid = mapOf(e), m = mapRegistry.maps[mid], g = eventGeo();
    if (!p || !m) return { nx: .5, ny: .5, approx: true, none: true };
    return spotOf(g, p, { key: e.key || e.id, xy: e.xy, markers: markersOf[mid], world: m.kind === 'world' });
  }
  // 人物栏用（chars.js）：只知道城区时给一个大致坐标；认不出返回 null
  function zoneXY(mid, place) {
    const g = eventGeo(), p = g?.place(place), sp = p && g.spot(p.node);
    return sp && sp.map === mid ? { nx: sp.x + (hash01(place) - .5) * .03, ny: sp.y + (hash01(place + '~') - .5) * .04, approx: true } : null; }
  async function loadMarkers() {
    await Promise.all([...new Set(all().map(mapOf))].filter(id => mapRegistry.maps[id]?.data && !markersOf[id] && mapRegistry.maps[id].status !== 'planned')
      .map(id => getJSON(mapRegistry.maps[id].data).then(d => { markersOf[id] = new Map((d?.markers || []).map(k => [k.id, { nx: k.nx, ny: k.ny, name: mapRegistry.maps[id].markers?.[k.id]?.name }])); }).catch(() => {})));
  }

  // ---------- 输入 ----------
  // 卡内脚本发来：{ items, floor, fly }（旧版云端协议 { list, last } 也兼容：交给 events.mjs 重新解析）
  async function set(d) {
    if (!EVM) await mod();   // 分类在事件模块里（设定包的 events 块）：第一批事件来之前先装好
    taxNow();
    const before = new Set(all().map(e => e.id));
    if (Array.isArray(d.items)) { items = d.items.map(enrich); floor = d.floor || 0; }
    else if (Array.isArray(d.list)) { const m = await mod(); if (!m) return;
      floor = d.last || 0; items = m.collect(d.list.map(o => ({ floor: o.mes ?? floor, text: tagText(o) })), floor); }
    // 读屏播报：新出现的进行中事件（每条只播一次）
    const fresh = all().filter(e => live(e) && (e.isNew || (before.size && !before.has(e.id))) && !said.has(e.id));
    for (const e of fresh) said.add(e.id);
    if (fresh.length && typeof announce === 'function') announce(uiTextOr('ev.sr_new', '新增 {n} 起事态：', { n: fresh.length }) + fresh.slice(0, 3).map(e => `${tn(e.cat)}·${e.text || ''}（${where(e)}）`).join('；'));
    await loadMarkers(); render(); renderBar(); badges();
    if (flyId && currentMapId && osdViewer.world.getItemCount() && flyTo(flyId)) flyId = null;
  }
  const enrich = e => (!EVM || (e.grp && e.ch && e.color) ? e : (r => ({ ...e, grp: r.grp, ch: r.icon, color: r.color, rare: r.rare, type: r.type, ...(r.fx ? { fx: r.fx } : {}) }))(EVM.classify(e.cat)));   // 没带大类 / 图标 / 颜色的事件（旧版脚本、领航员的 op）：按类型名查当前分类补齐
  const tagText = o => `<span data-tcmap="${Object.entries(o).filter(([k]) => k !== 'mes' && k !== 'src').map(([k, v]) => `${k}=${String(v).replace(/[;"]/g, ' ')}`).join(';')}"></span>`;
  // 按文档的 <base> 解析（srcdoc 里的内联 / 经典脚本做 import() 时 Chrome 会按宿主页地址解析相对路径，取到 tavern/tavern/…）
  const geoSync = m => (m?.setGeo(eventGeo()), m);   // 事件模块的落点用同一棵节点树（建筑平面到了、树重建后也跟着换）
  function taxNow() {   // 装入当前树的事件分类，再取大类表 / 形状 / 默认隐藏（分类没变就什么都不做）
    if (!EVM) return; geoSync(EVM);
    const tx = EVM.taxonomy(); if (tx === taxFor) return; taxFor = tx;
    GROUPS = Object.fromEntries(tx.groups.map(g => [g.label, g.color])); XCVD = Object.fromEntries(tx.groups.map(g => [g.label, g['x-cvd']])); SHAPES = Object.fromEntries(tx.groups.map(g => [g.label, g.shape])); ORDER = EVM.legend().map(g => g.label);
    try { if (LocalStore.get(OFF_KEY) == null) for (const n of EVM.defaultOff()) off.add('type:' + n); } catch (e) {}
  }
  const mod = () => EVM ? Promise.resolve(geoSync(EVM)) : import(new URL('tavern/events-parse.mjs', document.baseURI).href).then(m => geoSync(EVM = m)).catch(() => null);
  // 外部数据源：maps.json 顶层 feeds: [{label, url, every}]（url 返回 {events: [与标签相同的中文字段]}）；状态改成已解除前一直显示
  async function pollFeeds() {
    const feeds = mapRegistry?.feeds || []; if (!feeds.length) return;
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
    if (!osdViewer || !currentMapId || !osdViewer.world.getItemCount()) return;
    for (const el of layerEls) { if (typeof untrack === 'function') untrack(el); osdViewer.removeOverlay(el); } layerEls = [];   // 追踪器先 destroy，不留监听（E4 N11）
    if (mapRegistry.maps[currentMapId]?.kind === 'estate') return;   // 主场景剖面（iframe）不画事态点
    const world = mapRegistry.maps[currentMapId]?.kind === 'world';
    if (world) worldBadge();
    // 正在飞往的那一条即使已淡出也画出来，落点上不会空（E4 N17）；世界图只画城外的事件（E4 N15）
    const here = vis().filter(e => mapOf(e) === currentMapId && (e.tier !== 'fade' || e.id === lastFly)).slice(0, 50);    // 手机上叠加层不超过 50 个
    const seen = {}, onMk = new Set();
    for (const e of here) {
      const p = pos(e); if (p.none) continue; if (p.name) onMk.add(p.name);
      const k = `${p.nx.toFixed(3)},${p.ny.toFixed(3)}`, n = seen[k] = (seen[k] || 0) + 1;   // 同一地点多条：绕一小圈错开
      const a = n * 2.4, r = n > 1 ? .006 * Math.sqrt(n) : 0, [ch, color] = lk(e);
      const el = document.createElement('div');
      el.className = `ev ${shp(grpOf(e))} ${e.closed ? 'ev-cleared' : 'ev-active'} sev${Math.max(1, e.lvl)} tier-${e.tier}${p.approx ? ' approx' : ''}${e.isNew && live(e) ? ' ev-new' : ''}`;
      el.style.setProperty('--c', color); el.style.setProperty('--k', TCCvd.inkOn(color)); el.dataset.ev = e.id;
      el.innerHTML = `<i aria-hidden="true">${esc(ch)}</i><b>${esc(e.text || e.cat)}</b>`;
      el.title = `${tn(e.cat)} · ${e.place || tn(e.layer)}`;
      const label = `${tn(e.cat)}${e.closed ? '（' + uiTextOr('ev.cleared', '已解除') + '）' : ''} · ${e.text || ''} · ${where(e)}`;
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
    const p = pos(e), st = e.closed ? uiTextOr('ev.cleared', '已解除') : tn(e.status) || uiTextOr('ev.ongoing', '发生中');
    const rare = e.rare >= 4 ? uiTextOr('ev.rare4', '（传说级）') : e.rare >= 3 ? uiTextOr('ev.rare3', '（罕见）') : '';
    const lv = Math.max(1, e.lvl);
    showCard(null, e.text || tn(e.cat), '', '', `${tn(e.cat)}${rare}`);   // 大类只在顶上的色块里出现一次（v0.9.2）
    if (typeof plugins.ComposeView !== 'undefined') plugins.ComposeView.attach({ go: e.place || '', ask: e.text || tn(e.cat) });   // v0.9.6 地图 → 聊天
    const rows = [
      [uiTextOr('ev.k_place', '地点'), esc(whereHere(e)) + (p.approx ? `<br><small>${esc(placeOf(e) ? uiTextOr('ev.approx', '（位置不详，按所在层大致标出）') : uiTextOr('ev.unplaced', '（认不出地点：只列出，不上图）'))}</small>` : '')],
      [uiTextOr('ev.k_state', '等级 / 状态'), `<span class="bars" aria-label="${esc(uiTextOr('ev.k_lvl', '等级') + ' ' + lv + '/3')}">${'▮'.repeat(lv)}${'▯'.repeat(3 - lv)}</span>　${esc(st)}`],
      e.time && [uiTextOr('ev.k_time', '时间'), esc(e.time)], e.code && [uiTextOr('ev.k_code', '编号'), esc(e.code)],
      [uiTextOr('ev.k_src', '来源'), esc(e.feed ? e.src || uiTextOr('ev.feed_default', '外部数据源')
        : (srcNew(e) || !e.src ? uiTextOr('ev.src_floor', '{src} · 聊天第 {n} 楼', { src: srcNew(e) || uiTextOr('ev.unsigned', '未署名'), n: e.first }) : uiTextOr('ev.floor', '第 {n} 楼', { n: e.first })) + (e.count > 1 ? uiTextOr('ev.updates', '起，更新 {n} 次', { n: e.count - 1 }) : ''))],
    ].filter(Boolean);
    const sv = document.querySelector('#card .src'); delete sv.dataset.note;   // 事态卡的正文不是地点说明，不加「原文（中文）」说明
    sv.innerHTML = `<dl class="fields">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
    const t = document.querySelector('#card .tag'); t.textContent = e.grp ? tn(e.grp) : uiTextOr('ev.tag', '事态'); t.className = 'tag data'; t.style.background = lk(e)[1]; t.style.color = TCCvd.inkOn(lk(e)[1]);
    if (kbdFly) { kbdFly = false; document.getElementById('cardTitle')?.focus({ preventScroll: true }); }
  }
  function flyTo(id) {
    const e = all().find(x => x.id === id), mid = e && mapOf(e);
    if (e && !mid) { SH()?.set('peek'); if (typeof closeCard === 'function') closeCard(); card(e, null); return true; }   // 认不出地点：只开卡片
    if (!e || !mapRegistry.maps[mid] || mapRegistry.maps[mid].status === 'planned') return !!e;
    // 飞之前收起列表、关掉卡片：落点不被挡住（E4 N14）
    SH()?.set('peek');
    if (typeof closeCard === 'function') closeCard();
    lastFly = id;
    if (mid !== currentMapId) { flyId = id; go(mid); return false; }
    const p = pos(e);
    if (p.none) { card(e, null); return true; }   // 世界图上认不出的地名：只开卡片
    if (!document.querySelector(`.ev[data-ev="${CSS.escape(id)}"]`)) render();   // 已淡出的事件：补画出来
    const W = Math.max(1, $('#osd').clientWidth), H = $('#osd').clientHeight, w = mapRegistry.maps[mid].kind === 'world' ? .3 : .22, h = w * (H / W);
    // 落点放在「卡片以外的可见区域」中心：桌面扣掉右侧卡片，手机扣掉底部抽屉（约 45%），再扣掉底部横条
    const nar = innerWidth <= 640, occR = nar ? 0 : Math.min(334, W * .5), occB = nar ? H * .45 : 44;
    const ox = occR / 2 / W * w, oy = occB / 2 / H * h;
    setUserMoved(true);
    const vp = osdViewer.viewport, target = new OpenSeadragon.Rect(p.nx + ox - w / 2, p.ny * aspect + oy - h / 2, w, h), now = vp.getBounds(true);
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
    osdViewer.addOverlay({ element: el, location: new OpenSeadragon.Point(p.nx, p.ny * aspect), placement: OpenSeadragon.Placement.CENTER });
    setTimeout(() => osdViewer.removeOverlay(el), 2200);
  }
  // 打开某张图之后（onOpen 里调用）：画点；如果有待飞的事件，飞过去
  function afterOpen() { render(); renderBar(); if (flyId && flyTo(flyId)) flyId = null; }

  // ---------- 事态列表（底部横条，点开是列表） ----------
  // UI v2：事态 / 人物是唯一抽屉（ui/sheet.js，viewer.html 建）的两个标签页；抽屉三档由它管，这里只填内容和标签文字
  const SH = () => window.ViewerDrawer || null;
  const isOpenNow = () => !!SH()?.open;
  provideTab('ev', { hasData: () => !!all().filter(listed).length && shown });
  function renderBar() {
    const S = SH(); if (!S) return;
    const bar = S.el, every = all().filter(listed), list = every.filter(e => !offed(e));
    // 页签显隐、抽屉收起、选中页、人物页签（标签 + 内容）由页签注册表管（app/tabs.mjs，S6-1）；这里只填事态页
    refreshTabs('events');
    if (!S.panel('ev')) return;   // the pack's ui.tabs left the events tab out
    tab = S.tab || tab; const open = S.open;
    const SEEN = tabSeen();
    taxNow();
    const n = list.filter(live).length, evk = e => e.id + '@' + (e.last || 0), fresh0 = list.filter(e => e.isNew && !SEEN.ev.has(evk(e))),
      fresh = open && S.tab === 'ev' ? (fresh0.forEach(e => SEEN.ev.add(evk(e))), fresh0.length && saveTabSeen(), 0) : fresh0.length, hid = ORDER.filter(g => off.has(g)).length + (off.has('其他') ? 1 : 0) + [...off].filter(k => k.startsWith('type:')).length;
    // 标签：大类形状点（最新一条，进行中优先）+「事态 N」+ 新事态红点；完整摘要在面板第一行
    const top = list.filter(live).sort((a, b) => (b.last || 0) - (a.last || 0))[0] || list[0];
    S.label('ev', `<i class="shp ${shp(top ? grpOf(top) : '其他')}" style="--c:${top ? lk(top)[1] : 'var(--muted)'}" aria-hidden="true"></i>${esc(uiTextOr('ev.tab', '事态'))} <em>${n || list.length}</em>${fresh ? `<b class="nd" aria-label="${esc(uiTextOr('ev.bar_new', '{n} 条新', { n: fresh }))}"></b>` : ''}`, { n: n || list.length, fresh });
    const sum = bar.querySelector('.evsum');
    if (sum) sum.innerHTML = `<span class="sum">${esc(n ? uiTextOr('ev.bar_live', '{n} 起进行中', { n }) : uiTextOr('ev.bar_none', '暂无进行中'))}${list.length !== n ? ' · ' + esc(uiTextOr('ev.bar_total', '共 {n} 起事态', { n: list.length })) : ''}${hid ? ' · ' + esc(uiTextOr('ev.filtered', '已隐藏 {n} 类', { n: hid })) : ''}</span>${fresh ? `<span class="new">${esc(uiTextOr('ev.bar_new', '{n} 条新', { n: fresh }))}</span>` : ''}`;
    // 图例：9 个大类都列出（没有事件的变淡），数字 = 该类条数；点一下隐藏 / 恢复
    const cnt = {}; for (const e of list) cnt[grpOf(e)] = (cnt[grpOf(e)] || 0) + 1;   // 用筛选后的：默认关的类型不涨图例数字（整组关掉的组照列，off.has(g)）
    const gs = ORDER.concat(cnt.其他 ? ['其他'] : []).filter(g => cnt[g] || off.has(g));   // 只列有事件的大类和已隐藏的（v0.9.2：9 个空类占两行）
    bar.querySelector('.evleg').innerHTML = gs.map(g => `<button type="button" data-g="${esc(g)}" class="${off.has(g) ? 'off' : ''}${cnt[g] ? '' : ' none'}" style="--c:${gcol(g)}" aria-pressed="${off.has(g) ? 'false' : 'true'}"><i class="shp ${shp(g)}" aria-hidden="true"></i>${esc(tn(g))}${cnt[g] ? `<em>${cnt[g]}</em>` : ''}</button>`).join('')
      + (hintOnce() ? `<small>${esc(uiTextOr('ev.legend_hint', '点大类可隐藏 / 显示'))}</small>` : ''); bar.querySelector('.evleg').title = uiTextOr('ev.legend_hint', '点大类可隐藏 / 显示');
    // 列表项：li 里包一个真正的 <button>（原来 li 上的 role=button 让 axe 报 list / aria-allowed-role，E4b R08）
    bar.querySelector('ol').innerHTML = list.map(e => `<li class="tier-${e.tier}${e.isNew ? ' isnew' : ''}${e.closed ? ' closed' : ''}" style="--c:${lk(e)[1]}"><button type="button" data-id="${esc(e.id)}"><i class="shp ${shp(grpOf(e))}" aria-hidden="true"></i><b>${esc(tn(e.cat))}${e.closed ? ' · ' + esc(uiTextOr('ev.cleared', '已解除')) : ''}${e.isNew ? `<span class="nb">${esc(uiTextOr('ev.new', '新'))}</span>` : ''} <em>${esc(whereHere(e))}</em></b><em>${esc(e.feed ? uiTextOr('ev.feed', '数据源') : uiTextOr('ev.floor', '第 {n} 楼', { n: e.last }))}</em><small>${esc(e.text || '')}${srcNew(e) ? ' —— ' + esc(srcNew(e)) : ''}</small></button></li>`).join('');
  }
  // 图例提示只在第一次展开时出现一行（之后在 title 里），不常驻占一行（v0.9.2）
  let hintSeen = null;
  function hintOnce() { if (!isOpenNow()) return false; if (hintSeen === null) { try { hintSeen = !!LocalStore.get('edenMapLegHint'); LocalStore.set('edenMapLegHint', '1'); } catch (e) { hintSeen = true; } } return !hintSeen; }
  function updateToggle() {
    // P3-C：「事态」行由 LayerRegistry 菜单渲染（app/layer-host.mjs renderLayerMenu）；这里只更新计数文案与显隐
    const tg = document.getElementById('tgEvents'); if (!tg) return;
    const act = vis().filter(e => mapOf(e) === currentMapId && live(e)).length;
    tg.querySelector('span').textContent = act ? uiTextOr('ev.toggle_n', '事态 {n}', { n: act }) : uiTextOr('ev.toggle', '事态');
    tg.hidden = !all().length;
  }
  // 屏幕特效（花屏）与世界图事态数角标：events-fx.mjs（S5-1 拆出）
  const { applyGlitch, worldBadge } = createEventsFx({ uiTextOr, all, vis, live, mapOf, isShown: () => shown, floorNow: () => floor, evm: () => EVM });

  const css = `
  .ev{--c:#fff;position:relative;display:flex;align-items:center;gap:4px;transform:translate(-11px,-11px);pointer-events:auto;cursor:pointer;filter:drop-shadow(0 1px 2px rgba(0,0,0,.8))}
  /* 图标 = 大类色的形状底（i::before，按大类裁成圆 / 方 / 菱 / 三角……，色弱也分得清）+ 类型字；描边和光晕在 i 上，不被裁掉 */
  .ev i{width:20px;height:20px;display:grid;place-items:center;font:700 11px/1 var(--font-ui,sans-serif);font-style:normal;color:var(--k,#0b0b0b);position:relative;z-index:var(--zl-0);filter:drop-shadow(0 0 1px #000) drop-shadow(0 0 4px var(--c))}
  /* 色觉模式（E7）：图标加黑描边 + 白外晕，任何底图上都留出对比度（tests/color-vision-mode.test.mjs），形状（i::before 的裁形）本来就是第二线索 */
  html.cvd .ev i{filter:drop-shadow(1.2px 0 0 #000) drop-shadow(-1.2px 0 0 #000) drop-shadow(0 1.2px 0 #000) drop-shadow(0 -1.2px 0 #000) drop-shadow(0 0 1.5px #fff)}
  html.cvd .evleg button i,html.cvd #evbar li i{box-shadow:0 0 0 1px rgba(0,0,0,.55)}
  .ev i::before{content:'';position:absolute;inset:0;z-index:var(--zl-under);border-radius:4px;background:linear-gradient(145deg,#fff 0,var(--c) 45%,color-mix(in srgb,var(--c) 60%,#000) 100%)}
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
  body:not([data-glow="1"]) .ev i{filter:drop-shadow(0 0 1px #000) drop-shadow(0 1px 1px rgba(0,0,0,.6))}   /* 光晕只在声明了 --glow-text 的视图（规范 3.4；body[data-glow]，app/theme.mjs） */
  /* 触屏：图标周围 44×44 的透明热区（E4 N25） */
  @media (pointer:coarse),(max-width:640px){.ev::before{content:'';position:absolute;left:-12px;top:50%;width:44px;height:44px;margin-top:-22px}}
  .ev b{font:600 var(--fs-micro,11px)/1.3 var(--font-ui,sans-serif);color:var(--map-label-ink,#fff);background:var(--map-label-bg,rgba(8,10,14,.8));padding:1px 6px;border-radius:var(--r-s,4px);border-left:2px solid var(--c);white-space:nowrap;max-width:14em;overflow:hidden;text-overflow:ellipsis}
  .ev.lhide b{visibility:hidden}
  .ev{z-index:var(--zv-events)}
  .ev-new i::after{content:'';position:absolute;inset:-5px;border-radius:7px;border:2px solid var(--c);animation:evpulse 1.6s ease-out 5;will-change:transform,opacity}
  .ev-new.sev3 i::after{animation-duration:.9s;animation-iteration-count:9}
  /* 已解除 / 余波：图标变灰、变淡；文字标签不整体降透明度（对比度，E5 V20） */
  .ev.tier-after i{opacity:.65}.ev-cleared i{opacity:.55}.ev-cleared i::before{background:#80868d}.ev-cleared i{filter:drop-shadow(0 0 1px #000)}.ev-cleared b{border-left-color:#80868d;color:#d0d4d8}
  .ev.approx i{outline:1px dashed rgba(255,255,255,.6);outline-offset:3px}
  .ev.hot i{outline:2px solid var(--map-label-ink,#fff);outline-offset:3px}
  .ev:focus-visible i{outline:2px solid var(--focus,#63b4be);outline-offset:4px}   /* 键盘焦点（E4b R07） */
  body.far .ev b{display:none} body.noevents .ev{display:none} .mk.evon{visibility:hidden}
  /* 世界图城市标记上的事态数：全站唯一的红 */
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
  /* 抽屉里的事态页（UI v2）：摘要一行 + 图例 + 列表；抽屉本身的样式在 ui/sheet.js */
  #evbar .evtab .shp{width:10px;height:10px;background:var(--c);flex:none}
  #evbar .chtab .shp{width:10px;height:10px;border-radius:50%;background:transparent;box-shadow:inset 0 0 0 2px currentColor}
  #evbar [role=tab] .nd{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--alert);margin-left:2px;box-shadow:0 0 0 2px var(--surface)}
  #evbar .evsum{display:flex;gap:var(--sp-4,8px);align-items:baseline;padding:var(--sp-2,4px) var(--sp-3,6px) var(--sp-3,6px);font-size:var(--fs-small,12px);color:var(--ink-2)}
  #evbar .sum{font-variant-numeric:tabular-nums;min-width:0}
  #evbar .new{color:var(--accent);font-weight:700;white-space:nowrap}
  #evbar ol{list-style:none;margin:0;padding:0 var(--sp-1,2px) var(--sp-3,6px)}
  #evbar li>button{font:inherit;color:inherit;background:none;border:0;margin:0;text-align:left;cursor:pointer;-webkit-appearance:none;appearance:none}
  #evbar li>button:focus-visible{outline:2px solid var(--focus);outline-offset:-2px}
  .evleg{display:flex;flex-wrap:wrap;gap:var(--sp-2,4px);padding:var(--sp-1,2px) var(--sp-3,6px) var(--sp-3,6px);align-items:center}
  .evleg button{font:inherit;color:inherit;background:none;margin:0;cursor:pointer;-webkit-appearance:none;appearance:none}
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
  /* U 待办 5a（2026-09-28）：阶段 / 数值 / 战力小签太多时另起一行，不挤在名字后面重叠 */
  #evbar li em{grid-column:2/-1;display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:2px}
  #evbar li.tier-fade b,#evbar li.closed b{color:var(--ink-2);font-weight:500}
  #evbar li .nb{display:inline-block;margin-left:4px;padding:0 5px;border-radius:var(--r-s,4px);background:var(--accent-weak);color:var(--accent);font-size:var(--fs-micro,11px);font-weight:700;line-height:16px;vertical-align:1px}
  #evbar li em{font-style:normal;color:var(--muted);font-size:var(--fs-micro,11px)}
  /* 触屏：横条 44、列表行 44、图例 36（放在按钮样式之后，不被覆盖；E4b R05） */
  @media (pointer:coarse),(max-width:640px){#evbar li>button{min-height:44px} .evleg button{min-height:44px;padding:0 12px}}
  @media (max-width:640px){#glitchNote{top:8px;left:auto;right:8px;transform:none}}
  #glitchNote{position:absolute;left:50%;top:10px;transform:translateX(-50%);z-index:var(--zu-glitch);padding:3px 10px;border-radius:var(--r-s,4px);background:rgba(6,20,26,.88);border:1px solid #3de0ff;color:#3de0ff;font:600 var(--fs-small,12px)/1.5 var(--font-mono,monospace);text-shadow:-1px 0 #ff3d9a,1px 0 #3de0ff;pointer-events:none}
  #glitchNote[hidden]{display:none}
  /* 花屏：间歇发作（约 3 秒一次、每次半秒多），只动叠加层的 transform / 背景；底图滤镜只在桌面开，手机上省掉 */
  body[data-glitch]:not([data-glitch=""]) #stage::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:var(--zl-3);mix-blend-mode:screen;opacity:0;
    background:repeating-linear-gradient(0deg,rgba(61,224,255,.1) 0 2px,transparent 2px 5px),
      linear-gradient(90deg,transparent 0 30%,rgba(255,61,154,.22) 30% 34%,transparent 34% 71%,rgba(61,224,255,.24) 71% 73%,transparent 73%);
    background-size:100% 100%,100% 37%;animation:gltear 3.1s steps(1) infinite}
  body[data-glitch="3"] #stage::before{content:'';position:absolute;inset:0;pointer-events:none;z-index:var(--zl-3);opacity:0;
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
    const S = SH(), stage = $('#stage'); if (!$('#glitchNote')) stage.insertAdjacentHTML('beforeend', '<div id="glitchNote" hidden></div>');
    if (!S) return;
    const pe = S.panel('ev'), pc = S.panel('ch');
    if (pe) {
      pe.innerHTML = '<div class="evsum"></div><div class="evleg" role="group"></div><ol id="evlist"></ol>';
      pe.querySelector('.evleg').setAttribute('aria-label', uiTextOr('ev.legend_aria', '按大类筛选'));
      pe.querySelector('.evleg').addEventListener('click', e => { const b = e.target.closest('button[data-g]'); if (!b) return;
        const g = b.dataset.g; off.has(g) ? off.delete(g) : off.add(g); try { LocalStore.set(OFF_KEY, JSON.stringify([...off])); } catch (err) {}
        render(); renderBar(); badges(); });
      // 点列表项飞过去；卡片关闭（× / Esc）后焦点回到事态标签
      pe.querySelector('ol').addEventListener('click', e => { const b = e.target.closest('button[data-id]'); if (!b) return;
        kbdFly = e.detail === 0; if (typeof cardFrom !== 'undefined') setCardFrom(S.button('ev')); flyTo(b.dataset.id); });
    }
    if (pc) {
      pc.classList.add('chpane'); pc.id = 'chpane';
      pc.addEventListener('change', e => plugins.CharactersView.onPane(e)); pc.addEventListener('click', e => plugins.CharactersView.onPane(e));
    }
    if (coarse) document.body.classList.add('coarse');
  }
  // 层切换器上的事态数：某张地图上未解除的事件条数（查看器的 updateLayerBadges 读取）
  const countOn = id => vis().filter(e => mapOf(e) === id && live(e)).length;
  const badges = () => { if (typeof updateLayerBadges === 'function') updateLayerBadges(); };
  const collapse = () => { const S = SH(); if (S?.open) S.set('peek'); };
  // 换色觉模式（设置 → 显示）后重画点、图例、事态横条（E7）
  TCCvd.onChange(() => { afterOpen(); if ($('#evbar')) renderBar(); });
  // P3-C：事态点层登记为 events 槽的 osd 图层；「事态」菜单行由 LayerRegistry 渲染（行内勾选 → setVisible → 这里的调度）
  registry.register(declared('events', { initialVisible: shown,
    setVisible: v => { shown = v; document.body.classList.toggle('noevents', !v); renderBar(); applyGlitch(); } }));
  return { init, set, zoneXY, renderBar: () => $('#evbar') && renderBar(), render: afterOpen, pollFeeds, flyTo, countOn, collapse, isOpen: () => isOpenNow() && !SH()?.el.hidden, get events() { return all(); } };
})();
register('EventsView', EventsView);
export { EventsView };
