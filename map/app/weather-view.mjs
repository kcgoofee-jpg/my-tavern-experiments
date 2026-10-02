// 活体世界氛围（Part 4-1）的查看器侧渲染：在 LayerRegistry 的 fx 槽位挂一块顶层透明 canvas，
// 画雨 / 沙尘 / 雪的粒子、全屏色调与雷暴雨的闪电。数学与预设表在 core/weather.mjs（纯，单测覆盖），这里只画。
//
// 驱动：宿主推来的事态（eden-map:events）经 weatherFromStory 判天气、时钟（eden-map:clock）判夜；
// 两条消息都只认宿主（window.__isFromHost，与 app/host-messages.mjs 同一道闸）。
// 节拍：可见性守卫按下暂停位就停 rAF（P7-4），省流档粒子减半——面板关着 / 标签页在后台一帧都不画。
import { registry, declared } from './layer-host.mjs';
import { weatherOf, weatherFromStory } from '../core/weather.mjs';
import { canvasLayer, drawParticles } from './block-canvas.mjs';
import { busOn } from './bus.mjs';
import { lean } from './sharpness-tiers.mjs';
import { layerStore, saveVisible } from './declared-layers.mjs';

let id = 'clear', night = false, seed = 1;

const quality = () => (lean() ? .5 : 1);   // 省流：粒子减半

// 画布装配、rAF 与可见性守卫在 block-canvas.mjs（particles 积木，K-R80）；晴天不跑 rAF（idle）
const layer = canvasLayer({ key: 'weather', slot: 'fx', cls: 'wxcv', idle: () => id === 'clear',
  frame: (cx, t, W, H) => drawParticles(cx, { preset: id, t, seed, quality: quality(), W, H }) });

/** 直接指定天气（调试 / 以后的设置项）；认不出就是 clear */
export function setWeather(next) { id = weatherOf(next).id; if (id === 'clear') layer.stop(); else layer.start(); return id; }
/** 由事态文本推天气（宿主推事件时调用） */
export function setWeatherFromStory(texts, opts) { const w = weatherFromStory(texts, { night, ...(opts || {}) }); return setWeather(w.id); }
export const weatherNow = () => weatherOf(id);
export const weatherNight = v => { night = !!v; };

let done = false;
/** 登记 fx 槽位图层（boot 调一次；槽位容器没就绪时安静返回 false，open 后会重试） */
export function registerWeatherLayer() {
  if (done) return registry.has('weather'); done = true;
  registry.register(declared('weather', { initialVisible: layerStore().weather !== '0', mount: () => layer.mount(), unmount: () => layer.unmount(), setVisible: v => { saveVisible('weather', v); layer.setVisible(v); } }));
  // 宿主消息：事态 → 天气、时钟 → 夜（只认宿主，与 app/host-messages.mjs 同一道闸）
  busOn({ key: 'weather.hostMsg', type: 'message', fn: e => {
    if (!window.__isFromHost?.(e)) return;
    const d = e.data; if (!d) return;
    if (d.type === 'eden-map:clock') night = !!d.night;
    if (d.type === 'eden-map:events' && Array.isArray(d.items)) {
      setWeatherFromStory(d.items.map(i => [i.title, i.sub, i.text].filter(Boolean).join(' ')));
    }
  } });
  window.WeatherApi = { set: setWeather, fromStory: setWeatherFromStory, now: weatherNow, describe: () => weatherOf(id).id };
  return true;
}
