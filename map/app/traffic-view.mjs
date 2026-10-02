// 城市车流 / 悬浮流光（Part 4-3）的查看器侧渲染：在 LayerRegistry 的 fx 槽位挂 canvas，
// 把 core/traffic.mjs 算出的归一化光点用 OSD 的 pixelFromPoint 换算到屏幕，画成带尾迹的流光。
// 路线数据来自当前图（curData.routes，与画航线的 SVG 同源、同一套归一化坐标）；没有路线的图一帧都不画。
// 节拍同天气层：可见性守卫按下暂停位即停（P7-4），省流档减车。
import { registry, declared } from './layer-host.mjs';
import { layerStore, saveVisible } from './declared-layers.mjs';
import { trafficField, routeList } from '../core/traffic.mjs';
import { canvasLayer, drawFlow, toScreen } from './block-canvas.mjs';
import { busOn } from './bus.mjs';
import { lean } from './sharpness-tiers.mjs';
import { currentMapData, osdViewer } from './state.mjs';

let night = false, seed = 7;
const quality = () => (lean() ? .5 : 1);

// 画布装配、rAF 与可见性守卫在 block-canvas.mjs（flow 积木，K-R80）；这里只给每帧画什么
const layer = canvasLayer({ key: 'traffic', slot: 'fx', cls: 'trcv', frame: (cx, t, W, H) => {
  const routes = currentMapData?.routes;
  if (routes?.length && osdViewer?.viewport) drawFlow(cx, { routes, t, seed, quality: quality(), night, toScreen, W, H });
} });

/** 时钟的夜（宿主推 eden-map:clock）→ 夜里流光更亮更长 */
export const trafficNight = v => { night = !!v; };
export const trafficRunning = () => layer.running();

let done = false;
export function registerTrafficLayer() {
  if (done) return registry.has('traffic'); done = true;
  registry.register(declared('traffic', { initialVisible: layerStore().traffic === '1', mount: () => { const ok = layer.mount(); if (ok !== false && !registry.isVisible('traffic')) layer.setVisible(false); return ok; }, unmount: () => layer.unmount(), setVisible: v => { saveVisible('traffic', v); layer.setVisible(v); } }));
  busOn({ key: 'traffic.hostMsg', type: 'message', fn: e => { if (window.__isFromHost?.(e) && e.data?.type === 'eden-map:clock') night = !!e.data.night; } });
  window.TrafficApi = { running: trafficRunning, night: trafficNight, describe: () => ({ cars: trafficField(routeList(currentMapData?.routes), { t: 0, seed, quality: quality(), night }).length, night }) };
  return true;
}
