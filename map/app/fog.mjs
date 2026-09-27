// 迷雾探索（P3，默认关；设置「显示 · 迷雾探索」打开）：没到过的地点图钉变暗、收起地名，底图盖一层遮罩，到过的地点周围挖开。
// 到访 = 当前地点解析到这张图的某个标记（markHere）。记录按聊天：嵌在酒馆里发给宿主存进聊天变量 eden_map.探索；单独打开存本机。
// 从 viewer.html 拆出的模块（arch-v2 §6）：核心状态与工具从 state / util 显式 import，TCStore 是首帧前置的经典全局；查看器经 window.TCFog 调用（都带 ?. 守卫）。
import { REG, cur, viewer } from './state.mjs';
import { $, post } from './util.mjs';
import { markHere } from './locate.mjs';
import { norm, visit, known, count } from '../core/fog.mjs';
const KEY = 'edenMapFog', LOCAL = 'edenMap:chat:local:fog';
const embedded = () => window.top !== window;
let ex = embedded() ? {} : norm(TCStore.json(LOCAL, {}));
const on = () => TCStore.get(KEY) === '1';
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
  viewer.addOverlay({ element: cv, location: b }); cv.parentElement?.prepend(cv);   // 放在图钉下面
}
/** markHere 解析出落点后调用：r = hereRes() 的结果 */
function here(r) {
  if (!on() || !r?.map || !r.marker) return;
  const name = REG?.maps?.[r.map]?.markers?.[r.marker]?.name; if (!name) return;
  const v = visit(ex, r.map, name); if (!v.changed) return; ex = v.ex;
  if (embedded()) post({ type: 'eden-map:explore', map: r.map, name }); else TCStore.set(LOCAL, JSON.stringify(ex));
  if (r.map === cur) paint();
}
window.TCFog = {
  paint, here, on, count: () => count(ex),
  set(raw) { ex = norm(raw); paint(); },                 // 宿主推来（换聊天 / 加载）
  toggle(v) { TCStore.set(KEY, v ? '1' : '0'); if (v && typeof markHere === 'function') markHere($('#here').value); paint(); },
  reset() { ex = {}; if (embedded()) post({ type: 'eden-map:explore-reset' }); else TCStore.remove(LOCAL); paint(); },
};
