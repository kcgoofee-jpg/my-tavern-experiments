// i18n 与主题：LANG/DICT/t/tr/nm、setLang、setTheme、postState；window.I18N 是外挂与子页共用的服务。
import { REG, cur, viewer } from './state.mjs';
import { PACK } from './pack.mjs';
import { $, esc, getJSON, post, tx } from './util.mjs';
import { applyTier, drawOverlays, tierLabels } from './tiers.mjs';
import { mapChrome } from './nav.mjs';
import { estateLook } from './estate.mjs';
import { renderNav } from './layers.mjs';
import { closeCard } from './markers.mjs';
import { q3Pref, renderAbout, renderSelfCheck, rmPref, setPage, setPageNow } from './settings.mjs';
import { emMapChanged } from './extapi.mjs';
import { placeEmpty, stDotLabel } from './shell.mjs';
import { P } from './plugins.mjs';
import * as TCCvd from './cvd.mjs';
// ---------------- 界面语言（中 / EN）与主题（自动 / 浅色 / 深色）----------------
// 界面文字在 i18n/zh.json、en.json；地名的英文在 maps.json 的 *_en 字段，世界图地名在 en.json 的 names。设定原文（地点卡正文）不翻译。
export let LANG = window.__lang || 'zh', DICT = {};
const fmt = (s, v) => { for (const [a, b] of Object.entries(v || {})) s = String(s).split('{' + a + '}').join(b); return s; };
// 包内文案（manifest.strings，通用化 v1 接入）：键 = i18n 键、值不分语言；英文变体写「键@en」（缺了退回无后缀值）。
// 包没配的键照旧走核心字典——用来换掉核心文案里带本卡口径的说法（如占位提示里的 MVU 路径）。
export const t = (k, v) => { const s = PACK?.strings, o = s && (LANG === 'en' ? s[k + '@en'] ?? s[k] : s[k]); return fmt(o != null && o !== '' ? o : DICT[k] ?? k, v); };
export const tr = z => LANG === 'en' ? (DICT.names?.[z] || z) : z;
export const nm = (o, k = 'name') => { const z = o?.[k] ?? ''; return LANG === 'en' ? (o?.[k + '_en'] || tr(z)) : z; };
// 共享 i18n 服务（arch-v2 §6 第 6 步 i18n 块）：外挂脚本与 app/*.mjs 都走这里，不再各自带一份 T()。
// tx(键, 中文兜底, 变量)：字典里有就用字典，没有（字典没到 / 键缺）就用兜底并代入变量
window.I18N = { get lang() { return LANG; }, t, nm, tr, fmt, tx: (k, zh, v) => { const r = t(k, v); return r && r !== k ? r : fmt(zh ?? k, v); } };
export function applyI18n() {
  document.title = t('page_title');
  try { if (typeof P.TCVarMap !== 'undefined') P.TCVarMap.render?.(); } catch (e) {}
  try { if (typeof P.TCCompose !== 'undefined') P.TCCompose.renderUI(); } catch (e) {}   // v0.9.6 填入聊天的模板   // 变量映射面板：手机「⋯」抽屉里切语言时也要跟着换（接手 review P2）
  document.querySelectorAll('[data-i18n]').forEach(e => e.textContent = t(e.dataset.i18n));
  document.querySelectorAll('[data-i18n-title]').forEach(e => e.title = t(e.dataset.i18nTitle));
  document.querySelectorAll('[data-i18n-ph]').forEach(e => e.placeholder = t(e.dataset.i18nPh));
  document.querySelectorAll('[data-i18n-aria]').forEach(e => e.setAttribute('aria-label', t(e.dataset.i18nAria)));
  tierLabels();
  paintSegs();
  $('#setBtn').setAttribute('aria-label', tx('settings_title', '设置'));
  $('#upBtn').setAttribute('aria-label', tx('s.up', '上一级')); $('#upBtn').title = tx('s.up', '上一级');
  window.TCSheet?.text({ expand: tx('s.expand', '展开'), collapse: tx('s.collapse', '收起'), region: tx('s.sheet', '事态、人物与地点') });
  if (window.TCSheet) { TCSheet.label('pl', esc(tx('s.place', '地点')), {}); $('#cardEmpty').dataset.um = '-'; placeEmpty(typeof P.TCUnmapped !== 'undefined' ? P.TCUnmapped.name : null); }
  stDotLabel(); renderSelfCheck(); renderAbout(); setPage(setPageNow, true);
}
export async function setLang(l) {
  if (l === LANG) return;
  const dict = await getJSON('i18n/' + l + '.json'); if (!dict) return;
  LANG = l; DICT = dict; document.documentElement.lang = l === 'en' ? 'en' : 'zh-CN';
  try { TCStore.set('edenMapLang', l); } catch (e) {}
  applyI18n(); closeCard(); estateLook();
  if (cur) { mapChrome(REG.maps[cur]); renderNav(); if (viewer.world.getItemCount()) { drawOverlays(); applyTier(); } postState(); }
}
export function setTheme(th) {
  if (!['auto', 'light', 'dark'].includes(th)) return; window.__theme = th;
  try { TCStore.set('edenMapTheme', window.__theme); } catch (e) {}
  window.__applyTheme(); paintSegs(); estateLook(); postState();
}
// 设置「显示」页的分段控件：主题、减少动态、三维画质（语言、清晰度、惯用手各自有 paint）
export function paintSegs() {
  const on = (sel, attr, v) => document.querySelectorAll(sel).forEach(b => { const x = b.dataset[attr] === v; b.classList.toggle('on', x); b.setAttribute('aria-pressed', x); });
  on('#themeSeg button', 'th', window.__theme); on('#rmSeg button', 'rm', rmPref()); on('#q3Seg button', 'q', q3Pref()); on('#cvdSeg button', 'cvd', TCCvd.mode());
  on('#injSeg button', 'inj', window.__edenInject || 'off');   // Part 6-4 动作注入模式
  document.querySelectorAll('#langSeg button').forEach(b => { b.classList.toggle('on', b.dataset.lang === LANG); b.setAttribute('aria-pressed', b.dataset.lang === LANG); });
}
const themeNow = () => document.documentElement.classList.contains('light') ? 'light' : 'dark';
// 当前地图、标题、语言、主题 → 酒馆（面板标题栏跟着换语言和深浅）
export function postState() { if (cur && REG?.maps[cur]) { post({ type: 'eden-map:state', map: cur, title: nm(REG.maps[cur], 'title'), lang: LANG, theme: themeNow(), hand: window.__hand }); emMapChanged(); } }   // hand（E7）：卡内脚本据此把悬浮按钮挪到拇指侧
export function setLANG(v) { return (LANG = v); }
export function setDICT(v) { return (DICT = v); }
