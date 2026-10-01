// i18n 与主题：LANG/DICT/t/tr/nm、setLang、setTheme、postState；window.I18N 是外挂与子页共用的服务。
import { mapRegistry, currentMapId, osdViewer } from './state.mjs';
import { PACK } from './current-pack.mjs';
import { $, esc } from './dom-helpers.mjs';
import { getJSON } from './json-cache.mjs';
import { post } from './protocol-stamp.mjs';
import { uiTextOr } from './text-lookup.mjs';
import { applyTier, drawOverlays, tierLabels } from './sharpness-tiers.mjs';
import { mapChrome } from './map-switch.mjs';
import { estateLook } from './subpage3d-host.mjs';
import { renderNav } from './map-level-nav.mjs';
import { closeCard } from './markers.mjs';
import { q3Pref, renderAbout, renderSelfCheck, rmPref, setPage, setPageNow } from './settings.mjs';
import { emMapChanged, enNames } from './extension-api.mjs';
import { placeEmpty } from './drawer-glue.mjs';
import { stDotLabel } from './status-dot.mjs';
import { plugins } from './plugins.mjs';
import * as TCCvd from './color-vision-mode.mjs';
// ---------------- 界面语言（中 / EN）与主题（自动 / 浅色 / 深色）----------------
// 界面文字在 i18n/zh.json、en.json；地名的英文在 maps.json 的 *_en 字段，世界图地名在设定包清单 data.names.en 指向的对照表。地点卡正文不翻译。
export let LANG = window.__lang || 'zh', DICT = {};
const fmt = (s, v) => { for (const [a, b] of Object.entries(v || {})) s = String(s).split('{' + a + '}').join(b); return s; };
// 包内文案（manifest.strings，通用化 v1 接入）：键 = i18n 键、值不分语言；英文变体写「键@en」（缺了退回无后缀值）。
// 包没配的键照旧走核心字典——用来换掉核心文案里带本卡口径的说法（如占位提示里的 MVU 路径）。
export const uiText = (k, v) => { const s = PACK?.strings, o = s && (LANG === 'en' ? s[k + '@en'] ?? s[k] : s[k]); return fmt(o != null && o !== '' ? o : DICT[k] ?? k, v); };
export const translateName = z => LANG === 'en' ? (enNames?.[z] || z) : z;   // 英文地名来自包的对照表（清单 data.names.en，boot 读入 extapi 的 enNames）；没有就是中文原文
export const localName = (o, k = 'name') => { const z = o?.[k] ?? ''; return LANG === 'en' ? (o?.[k + '_en'] || translateName(z)) : z; };
// 共享 i18n 服务（arch-v2 §6 第 6 步 i18n 块）：外挂脚本与 app/*.mjs 都走这里，不再各自带一份 T()。
// tx(键, 中文兜底, 变量)：字典里有就用字典，没有（字典没到 / 键缺）就用兜底并代入变量
window.I18N = { get lang() { return LANG; }, t: uiText, nm: localName, tr: translateName, fmt, tx: (k, zh, v) => { const r = uiText(k, v); return r && r !== k ? r : fmt(zh ?? k, v); } };
/** applyI18nTo(root): 翻译一棵刚建出来的子树（设置页第一次打开时用；整页的 applyI18n 不必为它重跑） */
export function applyI18nTo(root) {
  root.querySelectorAll('[data-i18n]').forEach(e => { e.textContent = uiText(e.dataset.i18n); });
  root.querySelectorAll('[data-i18n-title]').forEach(e => { e.title = uiText(e.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-ph]').forEach(e => { e.placeholder = uiText(e.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-aria]').forEach(e => e.setAttribute('aria-label', uiText(e.dataset.i18nAria)));
  paintSegs();
}
export function applyI18n() {
  document.title = uiText('page_title');
  try { if (typeof plugins.StatPathMappingView !== 'undefined') plugins.StatPathMappingView.render?.(); } catch (e) {}
  try { if (typeof plugins.ComposeView !== 'undefined') plugins.ComposeView.renderUI(); } catch (e) {}   // v0.9.6 填入聊天的模板   // 变量映射面板：手机「⋯」抽屉里切语言时也要跟着换（接手 review P2）
  document.querySelectorAll('[data-i18n]').forEach(e => e.textContent = uiText(e.dataset.i18n));
  document.querySelectorAll('[data-i18n-title]').forEach(e => e.title = uiText(e.dataset.i18nTitle));
  document.querySelectorAll('[data-i18n-ph]').forEach(e => e.placeholder = uiText(e.dataset.i18nPh));
  document.querySelectorAll('[data-i18n-aria]').forEach(e => e.setAttribute('aria-label', uiText(e.dataset.i18nAria)));
  tierLabels();
  paintSegs();
  $('#setBtn').setAttribute('aria-label', uiTextOr('settings_title', '设置'));
  $('#upBtn').setAttribute('aria-label', uiTextOr('s.up', '上一级')); $('#upBtn').title = uiTextOr('s.up', '上一级');
  window.ViewerDrawer?.text({ expand: uiTextOr('s.expand', '展开'), collapse: uiTextOr('s.collapse', '收起'), region: uiTextOr('s.sheet', '事态、人物与地点') });
  if (window.ViewerDrawer) { ViewerDrawer.label('pl', esc(uiTextOr('s.place', '地点')), {}); $('#cardEmpty').dataset.um = '-'; placeEmpty(typeof plugins.UnmappedPlacePicker !== 'undefined' ? plugins.UnmappedPlacePicker.name : null); }
  stDotLabel(); renderSelfCheck(); renderAbout(); setPage(setPageNow, true);
}
export async function setLang(l) {
  if (l === LANG) return;
  const dict = await getJSON('i18n/' + l + '.json'); if (!dict) return;
  LANG = l; DICT = dict; document.documentElement.lang = l === 'en' ? 'en' : 'zh-CN';
  try { LocalStore.set('edenMapLang', l); } catch (e) {}
  applyI18n(); closeCard(); estateLook();
  if (currentMapId) { mapChrome(mapRegistry.maps[currentMapId]); renderNav(); if (osdViewer.world.getItemCount()) { drawOverlays(); applyTier(); } postState(); }
}
export function setTheme(th) {
  if (!['auto', 'light', 'dark'].includes(th)) return; window.__theme = th;
  try { LocalStore.set('edenMapTheme', window.__theme); } catch (e) {}
  window.__applyTheme(); paintSegs(); estateLook(); postState();
}
// 设置「显示」页的分段控件：主题、减少动态、三维画质（语言、清晰度、惯用手各自有 paint）
export function paintSegs() {
  const on = (sel, attr, v) => document.querySelectorAll(sel).forEach(b => { const x = b.dataset[attr] === v; b.classList.toggle('on', x); b.setAttribute('aria-pressed', x); });
  on('#themeSeg button', 'th', window.__theme); on('#rmSeg button', 'rm', rmPref()); on('#q3Seg button', 'q', q3Pref()); on('#cvdSeg button', 'cvd', TCCvd.mode());
  on('#injSeg button', 'inj', window.__injectMode || 'off');   // Part 6-4 动作注入模式
  document.querySelectorAll('#langSeg button').forEach(b => { b.classList.toggle('on', b.dataset.lang === LANG); b.setAttribute('aria-pressed', b.dataset.lang === LANG); });
}
const themeNow = () => document.documentElement.classList.contains('light') ? 'light' : 'dark';
// 当前地图、标题、语言、主题 → 酒馆（面板标题栏跟着换语言和深浅）
export function postState() { if (currentMapId && mapRegistry?.maps[currentMapId]) { post({ type: 'eden-map:state', map: currentMapId, title: localName(mapRegistry.maps[currentMapId], 'title'), lang: LANG, theme: themeNow(), hand: window.__hand }); emMapChanged(); } }   // hand（E7）：卡内脚本据此把悬浮按钮挪到拇指侧
export function setLANG(v) { return (LANG = v); }
export function setDICT(v) { return (DICT = v); }
