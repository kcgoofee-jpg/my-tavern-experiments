// 天城 · 地图事件层（查看器用）
// 事件从哪来：①聊天里前端载体（新闻快讯、执法局告示……）带的隐藏标签 data-tcmap，由卡内脚本 eden-map.js 扫描后发过来；
//            ②可选的外部数据源（maps.json 的 feeds），自己填 API 独立更新。
// 一条事件（归一化后）：{ key, tag, label, title, place, sev, status, t, mes, src, map, marker, nx, ny, approx, glitch }
// 字段刻意对齐犯罪分析工具的最小表（tag / t / 位置），以后做热力、预测（KDE、predspot 一类）可以直接导出。
// 设计与标签格式见 docs/map-events.md。本文件只读查看器的全局变量（viewer、REG、cur、curData、aspect、getJSON、placeN、showCard、esc）。
const TCEvents = (() => {
  // 事件类型：中文关键词 → 类型、显示字、颜色（按真实事件地图的惯例：火警红橙、警务蓝、治安紫、基础设施灰、网络青）
  const TYPES = [
    { tag: 'fire', label: '火灾', ch: '火', color: '#ff5a2a', words: ['火灾', '起火', '火警', '失火', '燃烧'] },
    { tag: 'blast', label: '爆炸', ch: '爆', color: '#ff2a2a', words: ['爆炸', '爆燃'] },
    { tag: 'armed', label: '持械', ch: '警', color: '#e0182d', words: ['持械', '枪击', '枪战', '武装', '劫持'] },
    { tag: 'robbery', label: '抢劫', ch: '劫', color: '#c23bd6', words: ['抢劫', '劫案'] },
    { tag: 'theft', label: '盗窃', ch: '盗', color: '#9a5cff', words: ['盗窃', '失窃', '偷盗', '入室', '闯入'] },
    { tag: 'riot', label: '骚乱', ch: '乱', color: '#e08a24', words: ['骚乱', '斗殴', '冲突', '暴动', '聚集'] },
    { tag: 'police', label: '执法', ch: '管', color: '#3d7dff', words: ['执法', '管控', '封锁', '搜查', '通缉', '检查'] },
    { tag: 'transit', label: '交通', ch: '轨', color: '#f0c020', words: ['事故', '轨道', '停运', '坠毁', '交通'] },
    { tag: 'outage', label: '停电', ch: '电', color: '#9aa4b5', words: ['停电', '断电', '断供', '以太中断'] },
    { tag: 'cyber', label: '网络攻击', ch: '网', color: '#3de0ff', words: ['网络攻击', '入侵', '骇入', '信号干扰', '电子攻击'] },
    { tag: 'weather', label: '天气', ch: '气', color: '#7fd6ff', words: ['天气', '气候', '暴雨', '酸雨', '雾'] },
    { tag: 'medical', label: '急救', ch: '救', color: '#37c5b0', words: ['急救', '伤亡', '医疗'] },
    { tag: 'barrier', label: '结界', ch: '界', color: '#e6c36a', words: ['结界'] },
  ];
  const OTHER = { tag: 'other', label: '事件', ch: '!', color: '#cfd8e0', words: [] };
  const typeOf = s => TYPES.find(t => t.words.some(w => (s || '').includes(w))) || OTHER;
  const LAYER_WORDS = [['tc_upper', ['上层', '悬浮', '浮岛']], ['tc_low', ['下层', '地基', '井']], ['tc_mid', ['中层', '霓虹']]];
  const STATUS = s => /解除|结束|恢复|已控制|扑灭/.test(s || '') ? 'cleared' : /处置|处理|调查|进行/.test(s || '') ? 'handling' : 'active';
  let raw = [], last = 0, events = [], shown = true, badge = null;
  const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619); return (h >>> 0) / 4294967296; };

  // 地点 → 哪张图、哪个标记：先按各图标记的名称与别名（最长匹配），再按层的关键词落到该层的大致位置（approx）
  async function resolve(e) {
    const place = `${e.地点 || ''} ${e.层 || ''}`;
    let best = null;
    for (const [mid, m] of Object.entries(REG.maps)) {
      if (m.status === 'planned' || m.kind !== 'points') continue;
      for (const [id, mk] of Object.entries(m.markers || {})) {
        for (const w of [mk.name, ...(mk.alias || [])]) if (w && place.includes(w) && (!best || w.length > best.len)) best = { map: mid, marker: id, len: w.length };
      }
    }
    let map = best?.map || (LAYER_WORDS.find(([, ws]) => ws.some(w => place.includes(w))) || ['tc_mid'])[0];
    if (e.层) map = (LAYER_WORDS.find(([, ws]) => ws.some(w => e.层.includes(w))) || [map])[0];
    const d = REG.maps[map]?.data ? await getJSON(REG.maps[map].data) : null;
    const k = best && best.map === map ? d?.markers?.find(q => q.id === best.marker) : null;
    const xy = (e.坐标 || '').split(/[,，]/).map(Number);
    if (xy.length === 2 && xy.every(v => v >= 0 && v <= 1)) return { map, marker: null, nx: xy[0], ny: xy[1], approx: false };
    if (k) return { map, marker: best.marker, nx: k.nx, ny: k.ny, approx: false };
    // 没对上具体地点：按地点文字的哈希放在该层中部一圈（同一地点每次落在同一处），标成「位置不详」
    const h1 = hash(e.地点 || e.标题), h2 = hash((e.地点 || '') + '#');
    return { map, marker: null, nx: .2 + .6 * h1, ny: .2 + .6 * h2, approx: true };
  }
  async function normalize(list) {
    const byKey = new Map();
    for (const r of list) {
      const ty = typeOf(r.类型 || r.标题);
      const key = r.编号 || `${ty.tag}|${r.地点 || ''}|${r.标题 || ''}`;
      const pos = await resolve(r);
      const e = { key, tag: ty.tag, label: ty.label, ch: ty.ch, color: ty.color, title: r.标题 || ty.label, place: r.地点 || '', sev: Math.max(1, Math.min(3, parseInt(r.等级) || 2)),
        status: STATUS(r.状态), statusText: r.状态 || '', t: r.时间 || '', mes: r.mes ?? null, src: r.src || 'chat', srcLabel: r.来源 || '', ...pos };
      if (ty.tag === 'cyber') e.glitch = { scope: r.范围 || r.层 || r.地点 || '全城', level: e.sev, until: r.mes == null ? Infinity : r.mes + (parseInt(r.持续) || 3) }   // 数据源的事件没有楼层：状态改成已恢复前一直生效;
      byKey.set(key, { ...(byKey.get(key) || {}), ...e });            // 同一事件后来的标签（例如「已解除」）覆盖前面的
    }
    return [...byKey.values()];
  }
  // 卡内脚本发来的原始标签：{ list: [{类型, 地点, 标题, 等级, 状态, 时间, mes, ...}], last: 最新楼层号 }
  async function set(list, lastMes) { raw = list || []; last = lastMes || 0; events = await normalize(raw.concat(feedRaw)); render(); }

  // 外部数据源：maps.json 顶层 feeds: [{label, url, every}]（url 返回 {events: [同样的中文字段]}）
  let feedRaw = [];
  async function pollFeeds() {
    const feeds = REG?.feeds || []; if (!feeds.length) return;
    const got = await Promise.all(feeds.map(f => fetch(f.url, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)
      .then(d => (d?.events || []).map(e => ({ ...e, src: 'feed', 来源: e.来源 || f.label })))));
    feedRaw = got.flat(); events = await normalize(raw.concat(feedRaw)); render();
    setTimeout(pollFeeds, Math.max(60, Math.min(...feeds.map(f => f.every || 300))) * 1000);
  }

  // ---------- 画 ----------
  let layerEls = [];
  function render() {
    if (!viewer || !cur || !viewer.world.getItemCount()) return;
    for (const el of layerEls) viewer.removeOverlay(el); layerEls = [];
    if (REG.maps[cur]?.kind === 'world') { worldBadge(); updateToggle([]); applyGlitch(); return; }
    const here = events.filter(e => e.map === cur && (last - (e.mes ?? last) < 80 || e.src === 'feed'));   // 太久以前的事件不再显示
    const seen = {};
    for (const e of here) {
      const k = `${e.nx.toFixed(3)},${e.ny.toFixed(3)}`, n = seen[k] = (seen[k] || 0) + 1;   // 同一地点多条：绕一小圈错开
      const a = n * 2.4, r = n > 1 ? .006 * Math.sqrt(n) : 0;
      const el = document.createElement('div'); el.className = `ev ev-${e.status} sev${e.sev}${e.approx ? ' approx' : ''}`; el.style.setProperty('--c', e.color);
      el.innerHTML = `<i>${esc(e.ch)}</i><b>${esc(e.title)}</b>`;
      el.title = `${e.label} · ${e.title}`;
      new OpenSeadragon.MouseTracker({ element: el, clickHandler: () => showCard(null, `${e.label} · ${e.title}`, 'inf', detail(e)) });
      placeN(el, e.nx + Math.cos(a) * r, e.ny + Math.sin(a) * r * 1.6, OpenSeadragon.Placement.CENTER); layerEls.push(el);
    }
    document.body.classList.toggle('noevents', !shown);
    updateToggle(here);
    applyGlitch();
  }
  function detail(e) {
    const st = { active: '发生中', handling: '处置中', cleared: '已解除' }[e.status];
    return [e.place && `地点：${e.place}${e.approx ? '（位置不详，按所在层大致标出）' : ''}`, `等级：${'▮'.repeat(e.sev)}${'▯'.repeat(3 - e.sev)}　状态：${e.statusText || st}`,
      e.t && `时间：${e.t}`, e.src === 'feed' ? `来源：${e.srcLabel || '外部数据源'}` : e.mes != null ? `来源：聊天第 ${e.mes} 楼` : ''].filter(Boolean).join('\n');
  }
  function updateToggle(here) {
    let tg = document.getElementById('tgEvents');
    if (!tg) {
      tg = document.createElement('label'); tg.className = 'tg'; tg.id = 'tgEvents';
      tg.innerHTML = '<input type="checkbox" checked><span>事件</span>';
      tg.querySelector('input').onchange = ev => { shown = ev.target.checked; document.body.classList.toggle('noevents', !shown); };
      document.getElementById('tgMarkers')?.closest('label')?.after(tg);
    }
    const act = here.filter(e => e.status !== 'cleared').length;
    tg.querySelector('span').textContent = act ? `事件 ${act}` : '事件';
    tg.hidden = !events.length;
  }
  // 网络攻击：当前地图（或全城）在攻击持续期内「花屏」——色散、错位、马赛克块，强度随等级
  function applyGlitch() {
    const lv = Math.max(0, ...events.filter(e => e.glitch && e.status !== 'cleared' && last <= e.glitch.until &&
      (/全城|天城/.test(e.glitch.scope) || e.map === cur || (LAYER_WORDS.find(([m]) => m === cur)?.[1] || []).some(w => e.glitch.scope.includes(w)))).map(e => e.glitch.level));
    document.body.dataset.glitch = lv || '';
  }
  // 世界图：天城内部未解除的事件汇成天城标记上的一个数字角标
  function worldBadge() {
    const n = events.filter(e => e.status !== 'cleared' && e.map !== 'world' && (last - (e.mes ?? last) < 80 || e.src === 'feed')).length;
    const el = [...document.querySelectorAll('.mk')].find(x => x.dataset.name === '天城');
    const lab = el?.querySelector('.lab'); if (lab) { if (n) lab.dataset.ev = n; else delete lab.dataset.ev; }
  }
  const css = `
  .ev{--c:#fff;display:flex;align-items:center;gap:4px;transform:translate(-11px,-11px);pointer-events:auto;cursor:pointer;filter:drop-shadow(0 1px 2px rgba(0,0,0,.8))}
  .ev i{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font:700 11px/1 'PingFang SC',sans-serif;font-style:normal;color:#0b0b0b;
    background:radial-gradient(circle at 35% 30%,#fff 0,var(--c) 45%,color-mix(in srgb,var(--c) 60%,#000) 100%);box-shadow:0 0 0 2px rgba(0,0,0,.55),0 0 10px var(--c);position:relative}
  .ev b{font:600 11px/1.3 'PingFang SC',sans-serif;color:#fff;background:rgba(8,10,14,.78);padding:1px 6px;border-radius:3px;border-left:2px solid var(--c);white-space:nowrap;max-width:14em;overflow:hidden;text-overflow:ellipsis}
  .ev-active i::after{content:'';position:absolute;inset:-4px;border-radius:50%;border:2px solid var(--c);animation:evpulse 1.6s ease-out infinite}
  .ev-active.sev3 i::after{animation-duration:.9s}
  .ev-cleared{opacity:.45}.ev-cleared i{background:#777;box-shadow:0 0 0 2px rgba(0,0,0,.55)}
  .ev.approx i{outline:1px dashed rgba(255,255,255,.6);outline-offset:3px}
  body.far .ev b{display:none} body.noevents .ev{display:none}
  .mk .lab[data-ev]::after{content:attr(data-ev);display:inline-block;margin-left:6px;min-width:15px;height:15px;padding:0 4px;border-radius:8px;background:#e0182d;color:#fff;font:700 10px/15px 'PingFang SC',sans-serif;text-align:center;vertical-align:1px;box-shadow:0 0 6px rgba(224,24,45,.8)}
  @keyframes evpulse{from{transform:scale(1);opacity:.9}to{transform:scale(2.4);opacity:0}}
  /* 花屏：底图色散错位 + 横向撕裂 + 马赛克块；只动 transform / filter / 背景，手机也跑得动 */
  body[data-glitch] #osd{animation:glshift 2.2s steps(1) infinite}
  body[data-glitch="1"] #osd{filter:saturate(1.4) contrast(1.1)}
  body[data-glitch="2"] #osd{filter:saturate(1.8) contrast(1.25) hue-rotate(-12deg)}
  body[data-glitch="3"] #osd{filter:saturate(2.2) contrast(1.4) hue-rotate(-25deg)}
  body[data-glitch]:not([data-glitch=""]) #stage::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:3;mix-blend-mode:screen;
    background:repeating-linear-gradient(0deg,rgba(61,224,255,.08) 0 2px,transparent 2px 5px),
      linear-gradient(90deg,transparent 0 30%,rgba(255,61,154,.18) 30% 34%,transparent 34% 71%,rgba(61,224,255,.2) 71% 73%,transparent 73%);
    background-size:100% 100%,100% 37%;animation:gltear .7s steps(3) infinite}
  body[data-glitch="3"] #stage::before{content:'';position:absolute;inset:0;pointer-events:none;z-index:3;opacity:.35;
    background:conic-gradient(from 90deg at 50% 50%,#3de0ff 0 25%,transparent 0 50%,#ff3d9a 0 75%,transparent 0) 0 0/26px 26px;
    -webkit-mask:linear-gradient(transparent 0 22%,#000 22% 31%,transparent 31% 58%,#000 58% 63%,transparent 63%);mask:linear-gradient(transparent 0 22%,#000 22% 31%,transparent 31% 58%,#000 58% 63%,transparent 63%);
    animation:glmask 1.3s steps(2) infinite}
  body[data-glitch]:not([data-glitch=""]) .mk .lab{text-shadow:-1px 0 #3de0ff,1px 0 #ff3d9a}
  @keyframes glshift{0%,86%,100%{transform:none}88%{transform:translate(-6px,1px)}91%{transform:translate(4px,-2px) skewX(-2deg)}94%{transform:translate(-2px,0)}}
  @keyframes gltear{0%{background-position:0 0,0 10%}50%{background-position:0 3px,0 55%}100%{background-position:0 1px,0 85%}}
  @keyframes glmask{0%{-webkit-mask-position:0 0;mask-position:0 0}100%{-webkit-mask-position:0 40%;mask-position:0 40%}}
  @media (prefers-reduced-motion:reduce){body[data-glitch] #osd,body[data-glitch] #stage::after,body[data-glitch] #stage::before,.ev-active i::after{animation:none}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  return { set, render, pollFeeds, typeOf, get events() { return events; } };
})();
