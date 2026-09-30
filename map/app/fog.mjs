// 迷雾探索（P3，2026-09-28 起默认开；设置「显示 · 迷雾探索」可关）：没到过的地点图钉变暗、收起地名，底图盖一层遮罩，到过的地点周围挖开。
// 默认开着也不会一片全黑：markHere（locate.mjs）每次都会把解析出的当前地点记一次到访（here() 内部再判断 on()），新聊天 / 中途导入的聊天一进来就先挖开当前地点。
// 到访 = 当前地点解析到这张图的某个标记（markHere）。记录按聊天：嵌在酒馆里发给宿主存进聊天变量 eden_map.探索；单独打开存本机。
// 从 viewer.html 拆出的模块（arch-v2 §6）：核心状态与工具从 state / util 显式 import；存储统一走 core/storage.mjs 适配器
// （P3-A 收口：FOG_KEY / FOG_LOCAL_KEY 只在 core/storage.mjs 定义，这里不再写死键名；直连适配器后 get 套登记默认值——
//   用户从没动过开关时 on() 按登记的 def '1' 生效，与设置页默认勾选、KEYS 登记一致，原先镜像不套默认值导致默认开悄悄失效）。
import { REG, cur, viewer } from './state.mjs';
import { $, post } from './util.mjs';
import { registry } from './layerhost.mjs';
import { markHere } from './locate.mjs';
import { norm, visit, known, count } from '../core/depth.mjs';
import { cssFilter } from '../core/layers.mjs';
import * as TCStore from '../core/storage.mjs';
const { FOG_KEY, FOG_LOCAL_KEY } = TCStore;
const embedded = () => window.top !== window;
let ex = embedded() ? {} : norm(TCStore.json(FOG_LOCAL_KEY, {}));
const on = () => TCStore.get(FOG_KEY) === '1';
// Part 8-3：空气透视滤镜链（core/haze.mjs 算的，depth-haze 槽那层挂同一条）——迷雾遮罩跟着当前纵深一起发灰发糊
let hazeChain = [];
const hazeCss = () => cssFilter(hazeChain);
function setHaze(chain) {
  hazeChain = Array.isArray(chain) ? chain : [];
  const cv = document.getElementById('fogCv'); if (cv) cv.style.filter = hazeCss();
}
const eligible = () => { const m = REG?.maps?.[cur]; return !!m && m.kind === 'points' && m.status !== 'planned'; };
function paint() {
  document.getElementById('fogCv')?.remove();
  const act = on() && eligible() && !!viewer?.world?.getItemCount();
  document.body.classList.toggle('fogon', act);
  const mks = [...document.querySelectorAll('.mk')];
  for (const e of mks) e.classList.toggle('fogged', act && !known(ex, cur, e.dataset.name) && !e.classList.contains('here'));
  if (!act) return;
  const b = viewer.world.getItemAt(0).getBounds(), W = 512, H = Math.max(1, Math.round(W * b.height / b.width));
  const cv = document.createElement('canvas'); cv.id = 'fogCv'; cv.width = W; cv.height = H; cv.setAttribute('aria-hidden', 'true');
  const g = cv.getContext('2d'); if (!g) return;
  g.fillStyle = document.documentElement.classList.contains('light') ? 'rgba(239,234,224,.55)' : 'rgba(8,10,14,.55)'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out'; const R = W * .07;
  for (const e of mks) { if (e.classList.contains('fogged')) continue; const p = viewer.getOverlayById(e)?.location; if (!p) continue;
    const x = (p.x - b.x) / b.width * W, y = (p.y - b.y) / b.height * H, gr = g.createRadialGradient(x, y, 0, x, y, R);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.6, 'rgba(0,0,0,.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - R, y - R, 2 * R, 2 * R); }
  cv.style.pointerEvents = 'none';
  cv.style.filter = hazeCss();   // Part 8-3：与 depth-haze 槽同一条滤镜链（空气透视）
  viewer.addOverlay({ element: cv, location: b });   // 层叠归 #fogCv 的 --zv-fog 槽位常量（fog 槽，在标记之下），不再 prepend 抢 DOM 顺序
}
/** markHere 解析出落点后调用：r = hereRes() 的结果 */
let mute = false;   // 时间轴回放（Part 5-4）：重放过去楼层时不把过去的地点记成「到访」
function here(r) {
  if (mute || !on() || !r?.map || !r.marker) return;
  const name = REG?.maps?.[r.map]?.markers?.[r.marker]?.name; if (!name) return;
  const v = visit(ex, r.map, name); if (!v.changed) return; ex = v.ex;
  if (embedded()) post({ type: 'eden-map:explore', map: r.map, name }); else TCStore.set(FOG_LOCAL_KEY, JSON.stringify(ex));
  if (r.map === cur) paint();
}
const setFog = v => { TCStore.set(FOG_KEY, v ? '1' : '0'); if (v && typeof markHere === 'function') markHere($('#here').value); paint(); };
registry.register({ id: 'fog', slot: 'fog', kind: 'canvas', initialVisible: on(), setVisible: setFog });   // P3-C：迷雾作为 fog 槽的 canvas 图层受 Registry 调度
window.TCFog = {
  paint, here, on, count: () => count(ex), raw: () => ex, setHaze,   // raw = 到访台账本体（纵深摘要算探索度用）
  mute(v) { mute = !!v; },   // 回放期间静默探索记录（host.mjs 在 eden-map:here replay 时包住 markHere）
  set(raw) { ex = norm(raw); paint(); },                 // 宿主推来（换聊天 / 加载）
  toggle(v) { registry.setVisible('fog', v); },
  reset() { ex = {}; if (embedded()) post({ type: 'eden-map:explore-reset' }); else TCStore.remove(FOG_LOCAL_KEY); paint(); },
};
