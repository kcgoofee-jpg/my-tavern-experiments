// 设置各页控件的处理器（S7-1 T1）：页第一次打开、settings-pages.mjs 把行造出来之后才挂（onBuilt）；
// 带「启动时就要生效」的开关（减少动态、花屏特效、小地图、动作注入模式、编辑模式）直接读写存储，不依赖页里的控件在不在。
import { $ } from './dom-helpers.mjs';
import { post } from './protocol-stamp.mjs';
import { paintSegs, setLang, setTheme } from './i18n.mjs';
import { TIERS, setTier, tierLabels } from './sharpness-tiers.mjs';
import { estateLook } from './subpage3d-host.mjs';
import { firstRunHint } from './notice-layer.mjs';
import { plugins } from './plugins.mjs';
import * as TCCvd from './color-vision-mode.mjs';
import { setFpsMeter } from './fps.mjs';
import { setEdit, initEdit } from './pack-edit-view.mjs';
import { reproject } from './pack-live.mjs';
import { onBuilt } from './settings-pages.mjs';
import { showSet, kbdHelp } from './settings.mjs';

const get = k => { try { return LocalStore.get(k); } catch (e) { return null; } }, put = (k, v) => { try { LocalStore.set(k, v); } catch (e) {} };
export const rmPref = () => get('edenMapRM') || 'auto';
export const q3Pref = () => get('edenMap3dQ') || 'auto';
const rmNow = () => rmPref() === 'on' || (rmPref() === 'auto' && matchMedia('(prefers-reduced-motion: reduce)').matches);
function applyRM() { document.documentElement.classList.toggle('rm', rmPref() === 'on'); window.__reducedMotion = rmNow(); estateLook(); }
// 开关：存 '1' / '0'；控件的初值读存储（没存过用 def）
const sw = (id, key, def, fn) => { const c = $(id); if (!c) return; const v = get(key); c.checked = v !== null ? v === '1' : def;
  c.onchange = () => { put(key, c.checked ? '1' : '0'); fn?.(c.checked); }; };
const seg = (id, attr, fn) => $(id)?.addEventListener('click', e => { const b = e.target.closest(`button[data-${attr}]`); if (b) fn(b.dataset[attr === 'th' ? 'th' : attr]); });

/** 启动时：不需要设置页存在就能生效的存储项（原先挂在 initSettings 里，控件在 viewer.html 里现成） */
export function bootEffects() {
  applyRM(); matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', applyRM);
  const nofx = get('edenMapNoFx'); document.body.classList.toggle('nofx', nofx !== null ? nofx === '1' : matchMedia('(prefers-reduced-motion: reduce)').matches || rmPref() === 'on');
  document.body.classList.toggle('nominimap', get('edenMapMinimap') !== '1');   // U14：小地图默认关
  window.__injectMode = get('edenMapInject') || 'off';   // Part 6-4 动作注入模式：默认 off（地图不替玩家说话）
  initEdit();
}

onBuilt('home', () => {
  seg('#themeSeg', 'th', setTheme);
  document.querySelectorAll('#langSeg button').forEach(b => { b.onclick = () => setLang(b.dataset.lang); });
  const t = $('#tiers'); if (t) { for (const x of [{ key: 'auto' }, ...TIERS]) { const b = document.createElement('button'); b.dataset.k = x.key; b.onclick = () => setTier(x.key); t.appendChild(b); } tierLabels(); }
});
onBuilt('map', () => {
  seg('#rmSeg', 'rm', v => { put('edenMapRM', v); applyRM(); paintSegs(); });
  seg('#q3Seg', 'q', v => { put('edenMap3dQ', v); paintSegs(); estateLook(); });
  seg('#cvdSeg', 'cvd', v => { TCCvd.setMode(v); paintSegs(); estateLook(); });
  const fx = $('#optNoFx'); if (fx) { fx.checked = document.body.classList.contains('nofx'); fx.onchange = () => { document.body.classList.toggle('nofx', fx.checked); put('edenMapNoFx', fx.checked ? '1' : '0'); }; }
  sw('#optFog', 'edenMapFog', true, v => { $('#fogRow').hidden = !v; window.FogApi?.toggle(v); }); $('#fogRow').hidden = get('edenMapFog') === '0';
  $('#fogReset').onclick = () => window.FogApi?.reset();
  sw('#optMinimap', 'edenMapMinimap', false, v => document.body.classList.toggle('nominimap', !v));
  sw('#optAuto3d', 'edenMap3dAuto', false, () => estateLook());
});
onBuilt('people', () => {
  const cs = $('#optCharStats'), cm = $('#optCharMore');
  cs.checked = get('edenMapCharStats') !== '0'; cs.onchange = () => plugins.CharactersView.setStatsOn(cs.checked);   // v0.9.6 E2 / E13
  cm.checked = get('edenMapCharMore') !== '0'; cm.onchange = () => plugins.CharactersView.setMoreOn(cm.checked);
});
onBuilt('ai', () => {   // 动作注入（C10）：默认 off；切了要重画卡片才出现 / 消失入口
  $('#injSeg')?.addEventListener('click', e => { const b = e.target.closest('button[data-inj]'); if (!b) return;
    put('edenMapInject', b.dataset.inj); window.__injectMode = b.dataset.inj;
    paintSegs(); document.body.classList.toggle('inject', b.dataset.inj !== 'off'); window.MarkersApi?.closeCard?.(); });
});
onBuilt('update', () => { $('#linePick').onclick = () => { showSet(false); post({ type: 'eden-map:line-pick' }); }; });
onBuilt('adv', () => {
  sw('#optEdit', 'edenMapEdit', false, v => setEdit(v)); sw('#optPackRemote', 'edenMapPackRemote', false, () => reproject(true));   // S9b：编辑模式与「加载包里用链接给出的图片」（K-R100 / K-R101，默认关）
  sw('#optKeys', 'edenMapKeys', false); sw('#optTick', 'edenMapTick', true);   // Part 6-2 后台静默推演（宿主每 15 s 判一次，跑不跑由 background-scan-scheduler.mjs 的 plan 决定）
  sw('#optFps', 'edenMapFps', false, v => { setFpsMeter(v); estateLook(); });
  $('#kbdBtn').onclick = () => kbdHelp($('#kbdHelp').hidden);
  $('#hintAgain').onclick = () => { try { LocalStore.remove('edenMapHint'); LocalStore.remove('edenMapHintN'); } catch (e) {} showSet(false); firstRunHint(); };
  const hd = $('#hereDev'), h = $('#here');   // 开发者：单独打开时的「当前地点」输入（和顶栏那个是同一个值）
  if (hd && h) { hd.value = h.value; for (const ev of ['input', 'change']) hd.addEventListener(ev, () => { h.value = hd.value; h.dispatchEvent(new Event(ev)); }); hd.addEventListener('focus', () => { hd.value = h.value; }); }
});
