// 活体世界氛围（Part 4-1）的查看器侧渲染：在 LayerRegistry 的 fx 槽位挂一块顶层透明 canvas，
// 画雨 / 沙尘 / 雪的粒子、全屏色调与雷暴雨的闪电。数学与预设表在 core/weather.mjs（纯，单测覆盖），这里只画。
//
// 驱动：宿主推来的事态（eden-map:events）经 weatherFromStory 判天气、时钟（eden-map:clock）判夜；
// 两条消息都只认宿主（window.__isFromHost，与 app/host-messages.mjs 同一道闸）。
// 节拍：可见性守卫按下暂停位就停 rAF（P7-4），省流档粒子减半——面板关着 / 标签页在后台一帧都不画。
import { registry, slotEl } from './layer-host.mjs';
import { weatherOf, particleField, lightningAt, weatherFromStory, tintOf } from '../core/weather.mjs';
import { busOn } from './bus.mjs';
import { visibilityGuard } from './visibility.mjs';
import { lean } from './sharpness-tiers.mjs';

let id = 'clear', night = false, seed = 1;
let cv = null, cx = null, raf = 0, t0 = 0, W = 0, H = 0, mounted = false;

const quality = () => (lean() ? .5 : 1);   // 省流：粒子减半

function size() {
  const host = cv?.parentElement; if (!host || !cv) return;
  const r = host.getBoundingClientRect();
  W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
  const dpr = Math.min(2, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  cx?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function frame(ts) {
  if (!cx || !raf) return;
  if (!t0) t0 = ts;
  const t = (ts - t0) / 1000, p = weatherOf(id);
  cx.clearRect(0, 0, W, H);
  const tint = tintOf(id);
  if (tint) { cx.fillStyle = tint; cx.fillRect(0, 0, W, H); }
  for (const q of particleField(p, { w: W, h: H, t, seed, quality: quality() })) {
    const sp = Math.hypot(q.vx, q.vy) || 1;
    cx.strokeStyle = q.color; cx.lineWidth = q.width;
    cx.beginPath(); cx.moveTo(q.x, q.y); cx.lineTo(q.x - q.vx / sp * q.len, q.y - q.vy / sp * q.len); cx.stroke();
  }
  const l = lightningAt(p, { t, seed });
  if (l.alpha > 0) { cx.fillStyle = `rgba(232,240,255,${l.alpha.toFixed(3)})`; cx.fillRect(0, 0, W, H); }
  raf = requestAnimationFrame(frame);
}
function start() { if (raf || !cx) return; t0 = 0; raf = requestAnimationFrame(frame); }
function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; if (cx) cx.clearRect(0, 0, W, H); }

/** 直接指定天气（调试 / 以后的设置项）；认不出就是 clear */
export function setWeather(next) { id = weatherOf(next).id; if (id === 'clear') { stop(); if (cx) cx.clearRect(0, 0, W, H); } else start(); return id; }
/** 由事态文本推天气（宿主推事件时调用） */
export function setWeatherFromStory(texts, opts) { const w = weatherFromStory(texts, { night, ...(opts || {}) }); return setWeather(w.id); }
export const weatherNow = () => weatherOf(id);
export const weatherNight = v => { night = !!v; };

let done = false;
/** 登记 fx 槽位图层（boot 调一次；槽位容器没就绪时安静返回 false，open 后会重试） */
export function registerWeatherLayer() {
  if (done) return registry.has('weather'); done = true;
  registry.register({
    id: 'weather', slot: 'fx', kind: 'canvas', order: 10, initialVisible: true,
    menu: { order: 45, boxId: 'tgWeather', labelKey: 'weather', label: '天气', titleKey: 'weather_title', title: '按剧情与时段渲染雨 / 沙尘 / 雪与闪电' },
    mount: () => {
      const host = slotEl('fx'); if (!host) return false;
      cv = document.createElement('canvas');
      cv.className = 'wxcv'; cv.setAttribute('aria-hidden', 'true');
      Object.assign(cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
      host.appendChild(cv); cx = cv.getContext('2d'); mounted = true; size();
      if (id !== 'clear') start();
      return true;
    },
    unmount: () => { stop(); mounted = false; try { cv?.remove(); } catch (e) {} cv = null; cx = null; },
    setVisible: v => { if (!mounted) return; if (v) { cv.style.display = ''; if (id !== 'clear') start(); } else { cv.style.display = 'none'; stop(); } },
  });
  // 宿主消息：事态 → 天气、时钟 → 夜（只认宿主，与 app/host-messages.mjs 同一道闸）
  busOn({ key: 'weather.hostMsg', type: 'message', fn: e => {
    if (!window.__isFromHost?.(e)) return;
    const d = e.data; if (!d) return;
    if (d.type === 'eden-map:clock') night = !!d.night;
    if (d.type === 'eden-map:events' && Array.isArray(d.items)) {
      setWeatherFromStory(d.items.map(i => [i.title, i.sub, i.text].filter(Boolean).join(' ')));
    }
  } });
  busOn({ key: 'weather.resize', type: 'resize', fn: () => size() });
  visibilityGuard.subscribe(paused => { paused ? stop() : (registry.isVisible('weather') && id !== 'clear' ? start() : null); });
  window.WeatherApi = { set: setWeather, fromStory: setWeatherFromStory, now: weatherNow, describe: () => weatherOf(id).id };
  return true;
}
