// 控制列：层切换条 / 缩放旁的 #dock、标注开关、「⋯」设置首页的动作（返回上一级 / 看全区 / 标注；HEADER-1：当前位置在缩放组的定位图标，关闭在宿主的 ×）（S5-2 自 shell.mjs 拆出，行为不变）。
import { mapRegistry, currentMapId } from './state.mjs';
import { $, iconSvg } from './dom-helpers.mjs';
import { announce } from './screen-reader-announce.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { localName, uiText } from './i18n.mjs';
import { narrowNow } from './subpage3d-host.mjs';
import { showSet } from './settings.mjs';
import { onBuilt } from './settings-pages.mjs';
import { parentMap } from './nodes-runtime.mjs';
// 控制列 #dock：手机 = ⋯（设置首页，含上一级 / 关闭地图 / 切层）+ 缩放；桌面 = 层切换 + 缩放 + 标注。位置跟着抽屉（--sheet-h）/ 右栏（--rail-w-now）
export function makeDock() {
  const dock = document.createElement('div'), tb = document.createElement('button'); dock.id = 'dock';
  tb.type = 'button'; tb.id = 'thumbBtn'; tb.className = 'btn ic'; tb.dataset.i18nAria = tb.dataset.i18nTitle = 'more';
  tb.setAttribute('aria-controls', 'setPop'); tb.setAttribute('aria-expanded', 'false'); tb.innerHTML = iconSvg('more');
  tb.setAttribute('aria-label', uiText('more')); tb.title = uiText('more');
  dock.append(tb, $('#layers'), $('#zoom')); $('#stage').appendChild(dock); return dock;
}

// 标注开关：开 =「Aa」+ 强调底色；关 = 带斜杠的「Aa」+ 灰色（不只靠颜色区分）
export function paintLbl() { const on = $('#tgLabels').checked, b = $('#lblTog'); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.innerHTML = iconSvg(on ? 'labels' : 'labelsOff'); }
export function toggleLabels(on) {
  const cb = $('#tgLabels'); cb.checked = on ?? !cb.checked;
  // P3-C：地名层可见性统一走 LayerRegistry（descriptor 同步勾选框 / body 类 / 按钮涂装）；Registry 未就绪时退回原样
  if (window.LayerHostApi) window.LayerHostApi.registry.setVisible('labels', cb.checked);
  else document.body.classList.toggle('nolabels', !cb.checked);
  paintLbl(); announce(uiTextOr(cb.checked ? 's.labels_on' : 's.labels_off', cb.checked ? '标注已显示' : '标注已隐藏'));
}
export function initLabelToggle() {
  $('#lblTog').onclick = () => toggleLabels();
  $('#tgLabels').addEventListener('change', paintLbl);
}

export function initActs() {
  const tb = $('#thumbBtn'), pop = $('#setPop');
  // 「⋯」：设置首页，顶上是够得着的「返回上一级」「当前位置」「关闭地图」（手机上顶栏和酒馆面板的 × 都在最上面；这一行在首页第一次打开时才造）
  tb.onclick = e => { e.stopPropagation(); showSet(pop.hidden); };
  onBuilt('home', () => {
    $('#actUp').addEventListener('click', () => showSet(false));
    $('#actAll').onclick = () => { showSet(false); $('#zAll').click(); };
    $('#actLbl').onclick = () => { toggleLabels(); };
    setActs(); });
}

export function setActs() { const up = $('#actUp'), par = currentMapId && parentMap(currentMapId), nar = narrowNow(); if (!up) return;   // 首页还没建（设置没开过）：没有可摆的
  up.hidden = !(nar && par && mapRegistry.maps[par]); if (!up.hidden) { up.dataset.go = par; up.textContent = uiText('act_up', { title: localName(mapRegistry.maps[par], 'title') }); }
  $('#setPop .acts').hidden = !nar && up.hidden; }
