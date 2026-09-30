// NPC 漫游的补间（Part 5-3 第二步，2026-09-30）：人物标记（.chm，map/chars.mjs 画）换地方时不要瞬移——
// 先把它按回上一次的位置，再放开让它自己滑过去（CSS transition 只在这一段时间内挂在这一枚元素上，
// 平移 / 缩放时 OSD 每帧都在改写 transform，常挂会让头像在拖动时拖影）。
// 位置变化来自宿主：世界时刻变了 → 日程表把人放到下一段该在的地方（tavern/routine.mjs），
// 聊天写过位置的人由聊天接管（标记本来就不动）。本模块不认识任何人，只看「这枚标记挪了没有」。
import { registry } from './layerhost.mjs';
import { lean } from './tiers.mjs';
import { cur, viewer } from './state.mjs';

const DUR = 1200, MAX_PX = 900;
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

function glide(el, key) {
  const target = el.style.transform || '';
  const prev = last.get(key);
  last.set(key, target);
  if (!prev || prev === target) return;
  const a = px(prev), b = px(target);
  if (!a || !b) return;
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) > MAX_PX) return;   // 跨图 / 传送：直接出现，不要横穿整张图
  el.style.transform = prev;                                   // 回到上一次的位置
  void el.offsetWidth;                                         // 强制一次布局：下面这一下才动画得起来
  el.classList.add('walk');
  requestAnimationFrame(() => { try { el.style.transform = target; } catch (e) {} });
  setTimeout(() => { try { el.classList.remove('walk'); } catch (e) {} }, DUR + 60);
}

/** 扫一遍当前的人物标记：只处理新出现的（chars.mjs 每次重画都是全新元素） */
export function scanWander() {
  if (!on) return 0;
  let n = 0;
  for (const el of document.querySelectorAll('.chm')) {
    const key = el.dataset?.chars; if (!key || el.dataset.wander) continue;
    el.dataset.wander = '1'; glide(el, key); n++;
  }
  return n;
}

/** 切图：上一张图的像素位置没有意义了 */
export function resetWander() { last.clear(); }

let done = false;
export function registerWanderLayer() {
  if (done) return registry.has('wander'); done = true;
  css();
  registry.register({
    id: 'wander', slot: 'interaction', kind: 'dom', order: 20, initialVisible: true,
    menu: { order: 50, boxId: 'tgWander', labelKey: 'wander.layer', label: '漫游', titleKey: 'wander.layer_title', title: '人物标记换地方时滑过去，不瞬移（日程表按世界时刻挪人）' },
    mount: () => {
      on = true;
      try {
        const host = viewer?.drawer?.canvas?.parentNode || document.querySelector('.openseadragon-canvas');
        if (host && !obs) { obs = new MutationObserver(() => setTimeout(scanWander, 0)); obs.observe(host, { childList: true, subtree: true }); }
      } catch (e) {}
      return true;
    },
    unmount: () => { on = false; try { obs?.disconnect(); } catch (e) {} obs = null; last.clear(); },
    setVisible: v => { on = !!v && !lean() && !rmq()?.matches; if (!on) last.clear(); },
  });
  // 省流档与「减少动态效果」：不滑（标记照常更新位置）
  on = !lean() && !rmq()?.matches;
  window.TCWander = { scan: scanWander, reset: resetWander, now: () => last.size };
  return true;
}
export const wanderOn = () => on && !!cur;
