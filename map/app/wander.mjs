// NPC 漫游（Part 5-3 第二步，2026-09-30；Part 8-2 改成确定性时钟驱动）：人物标记（.chm，map/characters-view.mjs 画）换地方时不要瞬移。
// 驱动换成了纯前端的确定性时钟（core/walk.mjs 的 tickClock + core/routine.mjs 的日程表）：
//   世界时刻 = 起点时钟 + 页面开了多久折合的轮数——不读系统时间、不问模型、不等宿主推 MVU 变动。
//   同一个 (起点, 经过) 永远同一个时刻：截图对比、多端一致、回放都站得住（core/clock.mjs 的口径）。
// 挪人的时候禁止瞬移：渲染循环里按分量插值走过去（core/walk.mjs 的 createWalker，二维 [x, y]，三维页同款可复用到 [x, y, z]）。
//   「减少动态效果」/ 省流档：一步到位，不排队补间。
// 位置变化还有一路来自宿主：聊天 / MVU 写过位置的人由聊天接管（日程不覆盖 known 名单），那一路仍用 CSS 补间滑过去。
// 本模块不认识任何人，只看「这枚标记该在哪儿」。
import { registry } from './layer-host.mjs';
import { lean } from './sharpness-tiers.mjs';
import { aspect, cur, curData, viewer } from './state.mjs';
import { hereRes } from './locate.mjs';
import { P } from './plugins.mjs';
import { busOn } from './bus.mjs';
import { getJSON } from './json-cache.mjs';
import { packData } from './current-pack.mjs';
import { createWalker, tickClock, DEFAULT_DUR_MS, DEFAULT_ROUND_MS } from '../core/walk.mjs';
import { normSchedule, placesAt } from '../core/routine.mjs';
import { normClock } from '../core/clock.mjs';

const DUR = DEFAULT_DUR_MS;
const CSS_ID = 'wanderCss';
const CSS = `
.chm.walk { transition: transform ${DUR}ms cubic-bezier(.35, .1, .25, 1); }
@media (prefers-reduced-motion: reduce) { .chm.walk { transition: none; } }`;

let obs = null, on = false;
const last = new Map();   // key（一组人的名字）→ 上一次的 transform（OSD 写在内联样式里）

const rmq = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null);
const px = t => { const m = /matrix\(([^)]+)\)/.exec(t || '') || /matrix3d\(([^)]+)\)/.exec(t || ''); if (!m) return null;
  const v = m[1].split(',').map(Number); return Number.isFinite(v[v.length - 2]) && Number.isFinite(v[v.length - 1]) ? [v[v.length - 2], v[v.length - 1]] : null; };

function css() { if (document.getElementById(CSS_ID)) return;
  const s = document.createElement('style'); s.id = CSS_ID; s.textContent = CSS; document.head.appendChild(s); }

/* ---------------- 确定性时钟 + 插值引擎 ---------------- */
const walker = createWalker({ reduced: !!rmq()?.matches });
let sched = null, base = normClock(null), t0 = 0, rounds = -1, clock = base;
let timer = 0, raf = 0;
const reduced = () => !!rmq()?.matches;

/** 地点名 → 当前图上的归一化坐标 [nx, ny]（与 characters-view.mjs 的 where() 同一条解析：hereRes → 标记锚点） */
function coordsOf(place) {
  try {
    const r = typeof hereRes === 'function' ? hereRes(place) : null;
    if (!r || r.map !== cur || !r.marker) return null;
    const k = (curData?.markers || []).find(x => x.id === r.marker);
    return k && Number.isFinite(k.nx) ? [k.nx, k.ny * aspect] : null;
  } catch (e) { return null; }
}

/** 一次时钟 tick：到了下一轮就按日程表重派目标（没到就什么都不做） */
function tick() {
  if (!on || !sched) return;
  if (!t0) t0 = performance.now();   // 日程比挂载先到：从这一刻起算，不要把模块加载以来的时间一次性补推进去
  const r = tickClock(base, { now: performance.now(), t0 });
  if (r.rounds === rounds) return;
  rounds = r.rounds; clock = r.clock;
  retarget();
}
/** 日程表 → 目标坐标：聊天写过位置的人（known）不动，认不出坐标的（在别的图 / 没解析出来）不动 */
function retarget() {
  const now = performance.now();
  const known = (P.TCChars?.items || []).filter(c => c.src && c.src !== 'routine').map(c => c.name);
  let started = false;
  for (const { name, place } of placesAt(sched, clock, known)) {
    const p = coordsOf(place); if (!p) continue;
    if (walker.to(name, p, now)) started = true;
  }
  if (started) loop();
}
/** 渲染循环：还在走就每帧插值落位（OSD 的 overlay 直接改 location，不与它的 transform 打架） */
function loop(now) {
  raf = 0;
  const t = typeof now === 'number' ? now : performance.now();
  const { moving } = walker.step(t);
  applyWalk(t);
  if (moving && on) raf = requestAnimationFrame(loop);
}
/** 把插值坐标写到人物标记上：一枚标记上可能挂着好几个人，取其中正在走的那个 */
function applyWalk(now) {
  if (!viewer?.updateOverlay) return;
  for (const el of document.querySelectorAll('.chm')) {
    const name = (el.dataset?.chars || '').split('|').find(n => walker.has(n));
    if (!name) continue;
    const p = walker.at(name, now); if (!p || p.length < 2) continue;
    try { viewer.updateOverlay(el, new OpenSeadragon.Point(p[0], p[1])); } catch (e) {}
  }
}
/** 日程表 / 起点时钟（宿主推来；没推就按开局零点，时刻照样确定性推进） */
export function setWanderSchedule(raw) { sched = normSchedule(raw); if (!sched.byName || !Object.keys(sched.byName).length) sched = null; tick(); }
export function setWanderClock(c) {
  base = normClock(c); t0 = performance.now(); rounds = -1; clock = base; tick();
}
/** 切图：上一张图的像素位置 / 上一次的 transform 都没意义了 */
export function resetWander() { last.clear(); walker.clear(); rounds = -1; }

/* ---------------- CSS 补间那一半（宿主推来位置变化的老路子） ---------------- */
function glide(el, key) {
  const target = el.style.transform || '';
  const prev = last.get(key);
  last.set(key, target);
  if (!prev || prev === target) return;
  const a = px(prev), b = px(target);
  if (!a || !b) return;
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 900) return;   // 跨图 / 传送：直接出现，不要横穿整张图
  el.style.transform = prev;                                 // 回到上一次的位置
  void el.offsetWidth;                                       // 强制一次布局：下面这一下才动画得起来
  el.classList.add('walk');
  requestAnimationFrame(() => { try { el.style.transform = target; } catch (e) {} });
  setTimeout(() => { try { el.classList.remove('walk'); } catch (e) {} }, DUR + 60);
}

/** 扫一遍当前的人物标记：只处理新出现的（characters-view.mjs 每次重画都是全新元素） */
export function scanWander() {
  if (!on) return 0;
  let n = 0;
  for (const el of document.querySelectorAll('.chm')) {
    const key = el.dataset?.chars; if (!key || el.dataset.wander) continue;
    el.dataset.wander = '1';
    const walking = key.split('|').some(x => walker.has(x));
    if (walking) applyWalk(performance.now());   // 正在按日程走：坐标由插值引擎说了算，不再套 CSS 补间
    else glide(el, key);
    n++;
  }
  return n;
}

let done = false;
export function registerWanderLayer() {
  if (done) return registry.has('wander'); done = true;
  css();
  registry.register({
    id: 'wander', slot: 'interaction', kind: 'dom', order: 20, initialVisible: true,
    menu: { order: 50, boxId: 'tgWander', labelKey: 'wander.layer', label: '漫游', titleKey: 'wander.layer_title', title: '人物标记换地方时滑过去，不瞬移（日程表按世界时刻挪人）' },
    mount: () => {
      on = true;
      if (!t0) t0 = performance.now();
      if (!timer) timer = setInterval(tick, Math.min(15000, DEFAULT_ROUND_MS));   // 时钟节拍：到点才推，中间不空转
      try {
        const host = viewer?.drawer?.canvas?.parentNode || document.querySelector('.openseadragon-canvas');
        if (host && !obs) { obs = new MutationObserver(() => setTimeout(scanWander, 0)); obs.observe(host, { childList: true, subtree: true }); }
      } catch (e) {}
      return true;
    },
    unmount: () => { on = false; stop(); try { obs?.disconnect(); } catch (e) {} obs = null; last.clear(); walker.clear(); },
    setVisible: v => { on = !!v && !lean() && !rmq()?.matches; if (on && !t0) t0 = performance.now(); if (!on) stop(); if (on) tick(); },
  });
  // 省流档与「减少动态效果」：不滑（标记照常更新位置）
  on = !lean() && !rmq()?.matches;
  busOn({ key: 'wander.hostMsg', type: 'message', fn: e => {
    if (!window.__fromHost?.(e)) return;
    const d = e.data; if (!d) return;
    if (d.type === 'eden-map:routine') setWanderSchedule(d.schedule);
    else if (d.type === 'eden-map:clock') setWanderClock(d);
    else if (d.type === 'eden-map:here' || d.type === 'eden-map:chars') setTimeout(retarget, 0);
  } });
  // 单独打开（没宿主推日程）时，按包里那份日程表走（清单 data.routine；包没声明 = 没有）
  setTimeout(() => { if (!sched && packData('routine')) getJSON(packData('routine')).then(v => { if (v && !sched) setWanderSchedule(v); }).catch(() => {}); }, 0);
  window.TCWander = { scan: scanWander, reset: resetWander, now: () => last.size, schedule: setWanderSchedule, clock: setWanderClock, tick, retarget, walker,
    scheduleOf: () => sched,   // 日程表本体（庄园三维页要同一张表挪人）
    describe: () => ({ ...walker.describe(), on, clock, rounds, scheduled: !!sched, reduced: reduced() }) };
  return true;
}
function stop() {
  if (timer) { clearInterval(timer); timer = 0; }
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
}
export const wanderOn = () => on && !!cur;
