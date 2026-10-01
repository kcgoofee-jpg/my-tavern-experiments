// 设置页的行表（S7-1 T1，docs/settings-ia.md §2、§3）：#setPop 的每个子页第一次打开时才按这张表造出来（启动路径上什么都不造），
// 每一行保留原来的控件 id 和 data-i18n 键。页里别的模块用 SettingsApi.registerSection 登记的栏（带 data-order）夹在表里的行之间；
// 页建好后依次跑 onBuilt 登记的接线函数。搜索用的静态索引也来自这张表（没打开过的页同样搜得到）。
import { uiTextOr } from './text-lookup.mjs';

const I = 'data-i18n';   // the helpers below build the attribute from this name, so the key-coverage test only sees the literal keys of the table
const seg = (id, key, zh, btns) => `<div class="hrow"><span id="${id}Lbl" ${I}="${key}">${zh}</span><div class="seg" id="${id}" role="group" aria-labelledby="${id}Lbl">${btns}</div></div>`;
const b = (a, v, key, zh) => `<button type="button" data-${a}="${v}" ${I}="${key}">${zh}</button>`;
const sw = (id, key, zh, hint, hk, extra = '') => `<label class="row"><span ${I}="${key}">${zh}</span><input type="checkbox" role="switch" id="${id}"${extra}></label>${hint ? `<small ${I}="${hk}">${hint}</small>` : ''}`;
const grp = (pg, key, zh, sub, zhSub, id = '') => `<button type="button" data-page="${pg}"${id ? ` id="${id}"` : ''}><b ${I}="${key}">${zh}</b><span${sub ? ` ${I}="${sub}"` : ` id="${id}Sub"`}>${zhSub}</span></button>`;

/** 行表：[{ page, rows: [{ k: 行键, o: 顺序, h: 标记 }] }]。顺序数与 registerSection 的 order 同一把尺。 */
export const TABLE = [
  { page: 'home', rows: [
    { k: 'acts', o: 0, h: `<div class="acts" hidden><button type="button" class="btn" id="actUp" hidden></button><button type="button" class="btn" id="actHere" hidden data-i18n="here_go">当前位置</button><button type="button" class="btn" id="actAll" data-i18n="zoom_all">看全区</button><button type="button" class="btn" id="actLbl" data-i18n="labels_tog">显示标注</button><button type="button" class="btn" id="actClose" hidden data-i18n="act_close">关闭地图</button></div>` },
    { k: 'search', o: 10, h: `<input type="search" id="setQ" data-i18n-ph="s.search" placeholder="搜索设置" autocomplete="off"><div id="setHits"></div>` },
    { k: 'common', o: 20, h: `<h3 class="scom" data-i18n="s.common">常用</h3>`
      + seg('themeSeg', 'theme_title', '界面主题', b('th', 'auto', 'theme_auto', '自动') + b('th', 'light', 'theme_light', '浅色') + b('th', 'dark', 'theme_dark', '深色')).replace('class="hrow"', 'class="hrow scomrow"')
      + seg('langSeg', 'lang_title', '界面语言', `<button type="button" data-lang="zh">中</button><button type="button" data-lang="en">EN</button>`).replace('class="hrow"', 'class="hrow scomrow"')
      + `<div class="hrow scomrow"><span id="tierLbl" data-i18n="tier_group">清晰度</span><div class="seg" id="tiers" role="group" aria-labelledby="tierLbl"></div></div><small id="tierWhy" class="na scomrow" hidden></small>`
      + seg('handSeg', 'hand', '惯用手', b('hand', 'auto', 'hand_auto', '自动') + b('hand', 'left', 'hand_left', '左手') + b('hand', 'right', 'hand_right', '右手')).replace('class="hrow"', 'class="hrow scomrow"') },
    { k: 'lyrow', o: 30, h: `<button type="button" class="btn lyrow" data-page="map"><span data-i18n="s.layers_row">图层</span><em id="lyN"></em></button>` },
    { k: 'groups', o: 40, h: `<nav class="sgroups">` + grp('map', 's.map', '地图与图层', 's.map_sub', '图层 · 迷雾 · 小地图 · 色调 · 三维')
      + grp('people', 's.people', '人物与物品', 's.people_sub', '数值 · 更多资料 · 头像 · 图鉴')
      + grp('ai', 's.ai', 'AI 联动', '', '', 'aiGroup') + grp('data', 's.data', '数据与映射', 's.data_sub', '变量映射 · 别名 · 存储')
      + grp('update', 's.update', '更新与版本', '', '', 'updGroup') + grp('adv', 's.adv', '高级', 's.adv_sub', '地图包 · 编辑模式 · 快捷键 · 开发者')
      + grp('license', 's.license', '版权申明', 's.license_sub', '卡片来源 · 地图开源 · 免责') + `</nav>` },
  ] },
  { page: 'map', rows: [
    { k: 'rm', o: 20, h: seg('rmSeg', 's.rm', '减少动态', b('rm', 'auto', 's.follow_sys', '跟随系统') + b('rm', 'on', 's.on', '开') + b('rm', 'off', 's.off', '关')) },
    { k: 'nofx', o: 30, h: sw('optNoFx', 'no_fx', '关闭花屏特效', '出现花屏时不再闪烁、撕裂，只显示「数据链路受扰」文字', 'no_fx_hint') },
    { k: 'fog', o: 40, h: sw('optFog', 's.fog', '迷雾探索', '没去过的地点变暗、盖一层薄雾；按聊天记住去过哪里（存在这个聊天的变量里）', 's.fog_hint')
      + `<div class="hrow" id="fogRow" hidden><span data-i18n="s.fog_reset_l">清空这个聊天的探索记录</span><button type="button" class="btn" id="fogReset" data-i18n="s.fog_reset">清空</button></div>` },
    { k: 'minimap', o: 50, h: sw('optMinimap', 's.minimap', '左下角小地图', '地图角落显示当前视野在全图中的位置（默认关）', 's.minimap_hint') },
    { k: 'cvd', o: 70, h: seg('cvdSeg', 's.cvd', '色觉模式', b('cvd', '0', 's.cvd_off', '关') + b('cvd', 'rg', 's.cvd_rg', '红绿') + b('cvd', 'by', 's.cvd_by', '蓝黄')) + `<small data-i18n="s.cvd_hint">事态、图例、人物头像等换成色盲安全配色，并加形状 / 描边区分；同步给子页面与三维页</small>` },
    { k: 'd3', o: 80, h: `<h3 data-i18n="s.map3d">三维</h3>` + seg('q3Seg', 's.q3d', '三维画质', b('q', 'auto', 'tier_auto', '自动') + b('q', '1', 's.q_low', '省电') + b('q', '2', 's.q_high', '清晰')) + `<small data-i18n="s.q3d_hint">三维页的像素比上限：省电 = 1 倍，清晰 = 最多 2 倍（锯齿更少，更费电）</small>`
      + sw('optAuto3d', 's.auto3d', '三维抽屉：拖动模型时自动收起', '', '')
      + sw('opt3dRotate', 's.rot3d', '三维：空闲 30 秒后自动旋转', '', '') + sw('opt3dWheel', 's.wheel3d', '鼠标滚轮缩放（触控板捏合不受影响）', '', '') },
  ] },
  { page: 'people', rows: [
    { k: 'stats', o: 10, h: sw('optCharStats', 'char_stats', '人物栏显示数值', '名册里显示成员的等级与核心数值（字段在「变量映射」里指定或关闭）', 'char_stats_hint', ' checked') },
    { k: 'more', o: 20, h: sw('optCharMore', 'char_more', '人物卡显示更多资料', '人物卡里可展开的一栏：代号、社会身份、身高 / 体重、知情度、饰物（字段在「变量映射」里指定或关闭）', 'char_more_hint', ' checked') },
    { k: 'src', o: 30, h: `<div class="hrow"><span data-i18n="s.ch_src">人物来源</span><span id="chSrc" class="muted"></span></div>` },
  ] },
  { page: 'data', rows: [{ k: 'stor', o: 0, h: `<div id="storBox"></div>` }] },
  { page: 'update', rows: [
    { k: 'about', o: 0, h: `<div id="aboutBox"></div><div id="branchBox"></div>` },
    { k: 'line', o: 20, h: `<div class="hrow" id="lineRow"><span data-i18n="s.line">加载线路</span><button type="button" class="btn" id="linePick" data-i18n="s.line_pick">选择线路</button></div><small id="lineNow" class="na"></small>` },
  ] },
  { page: 'license', rows: [{ k: 'lic', o: 0, h: `<div id="licBox"></div>` }] },
  { page: 'adv', rows: [
    { k: 'pack', o: 10, h: `<div id="packBox"></div>` },
    { k: 'edit', o: 20, h: `<b data-i18n="s.edit_group">编辑模式</b><label class="row" data-i18n-title="s.edit_hint" title="打开后可以拖动图钉、改上级、加叫法、给地点加图片，导出成设定包；草稿只在这台设备上，私人图片不会被导出"><span data-i18n="s.edit_mode">编辑模式（调整地图、加图片）</span><input type="checkbox" role="switch" id="optEdit"></label>`
      + `<label class="row"><span data-i18n="s.pack_remote">加载设定包里用链接给出的图片</span><input type="checkbox" role="switch" id="optPackRemote"></label>` },
    { k: 'kbd', o: 30, h: `<div class="hrow kbdrow"><label for="optKeys" data-i18n="s.keys">单字母快捷键（L、M、/、? 与事态操作字母角标，默认关）</label><span class="kbdctl"><button type="button" class="btn" id="kbdBtn" data-i18n="s.kbd_show">查看</button><input type="checkbox" role="switch" id="optKeys"></span></div><div id="kbdHelp" hidden></div>` },
    { k: 'tick', o: 40, h: sw('optTick', 's.tick', '后台静默推演', '面板关着时每 60 秒把新楼层只读扫一遍，缓存补齐——下次开地图就是热的；不写变量、不注入、生成中让路', 's.tick_hint') },
    { k: 'hint', o: 50, h: `<div class="hrow"><span data-i18n="s.hint_again">上手提示</span><button type="button" class="btn" id="hintAgain" data-i18n="s.hint_show">再看一次</button></div>` },
    { k: 'dev', o: 90, h: `<details id="devBox"><summary data-i18n="s.dev">开发者</summary><div class="hrow"><span data-i18n="s.build">版本编码</span><button type="button" id="build" class="btn" data-i18n-title="build_title" title="版本编码，点击复制诊断信息"></button></div>`
      + `<label class="row"><span data-i18n="s.fps">调试：显示帧率</span><input type="checkbox" role="switch" id="optFps"></label><div class="hrow" id="hereRow"><label for="hereDev" data-i18n="here">当前地点</label><input id="hereDev" data-i18n-ph="here_ph" placeholder="模拟 MVU：世界.当前地点" value=""></div></details>` },
  ] },
  { page: 'ai', rows: [] },
];

const CSS = `#setPop .scom{margin:var(--sp-5) 0 var(--sp-2)}#setPop .lyrow{display:flex;width:100%;justify-content:space-between;align-items:center;min-height:var(--hit,44px);margin-bottom:var(--sp-4)}#setPop .lyrow em{font-style:normal;color:var(--muted)}#setPop .lyrow::after{content:'›';color:var(--muted)}
@media (min-width:641px){#setPop .lyrow{display:none}}
@media (max-width:640px){.spage[data-page="home"]{display:flex;flex-direction:column}.spage[data-page="home"]>.acts{order:0}.spage[data-page="home"]>#setQ{order:1}.spage[data-page="home"]>#setHits{order:2}.spage[data-page="home"]>.lyrow{order:3}.spage[data-page="home"]>.sgroups{order:4}.spage[data-page="home"]>.scom,.spage[data-page="home"]>.scomrow{order:5}}
#setPop .kbdrow label{flex:1 1 auto;min-width:0;white-space:normal;min-height:0}#setPop .kbdrow .kbdctl{flex:none;display:flex;align-items:center;gap:var(--sp-4)}#setPop .kbdrow .btn{min-height:36px}
#devBox summary{min-height:var(--hit,44px);display:flex;align-items:center;cursor:pointer;font-weight:600}#devBox .hrow input{min-width:0;width:11em}`;

const built = new Set(), hooks = {}, shows = {}, leaves = {};
export const isBuilt = pg => built.has(pg);
export const pageEl = pg => document.querySelector(`#setPop .spage[data-page="${pg}"]`);
/** 把一栏按 order 放进页里（registerSection 与建页共用：夹在已有的带顺序的栏之间） */
export function placeIn(pg, el, order) { el.dataset.order = order; const after = [...pg.children].find(c => c !== el && c.dataset.order != null && +c.dataset.order > +order); after ? pg.insertBefore(el, after) : pg.appendChild(el); }
/** onBuilt(page, fn(pageEl))：页建好时跑；页已经建好就立刻跑。接线函数只在这里挂控件的处理器，不依赖启动时就有 DOM。 */
export function onBuilt(pg, fn) { if (built.has(pg)) fn(pageEl(pg)); else (hooks[pg] ||= []).push(fn); }
/** onShow(page, fn): 每次这一页（已建好）被显示时跑（页内容随状态变的栏在这里重画）；runShow 由 settings.mjs 的 setPage 调 */
export const onShow = (pg, fn) => { (shows[pg] ||= []).push(fn); };
export const runShow = pg => { for (const f of shows[pg] || []) try { f(); } catch (e) { console.warn('[settings] page show', pg, e); } };
/** onLeave(page, fn): when another page (or nothing: the sheet closed) replaces this one; runLeave is called by settings.mjs */
export const onLeave = (pg, fn) => { (leaves[pg] ||= []).push(fn); };
export const runLeave = pg => { for (const f of leaves[pg] || []) try { f(); } catch (e) { console.warn('[settings] page leave', pg, e); } };
/** buildPage(page, translate): 第一次调用造出这页的行并跑接线；之后什么都不做。返回页元素。 */
export function buildPage(pg, translate) {
  const root = pageEl(pg); if (!root || built.has(pg)) return root;
  built.add(pg);
  if (!document.getElementById('setPagesCss')) { const s = document.createElement('style'); s.id = 'setPagesCss'; s.textContent = CSS; document.head.appendChild(s); }
  for (const r of TABLE.find(t => t.page === pg)?.rows || []) {
    const t = document.createElement('template'); t.innerHTML = r.h;
    for (const el of [...t.content.children]) { el.dataset.rk = r.k; placeIn(root, el, r.o); }
  }
  translate?.(root);
  for (const f of hooks[pg] || []) try { f(root); } catch (e) { console.warn('[settings] page wiring', pg, e); }
  delete hooks[pg]; return root;
}
// 搜索用的静态索引：每行的 data-i18n 键与中文兜底（当前语言的文字查 uiTextOr）；卡片与其它模块用 registerIndex 补充
const extra = [];
export const registerIndex = fn => { extra.push(fn); };
export function searchIndex() {
  const out = [];
  for (const { page, rows } of TABLE) for (const r of rows) {
    const pairs = [...r.h.matchAll(new RegExp(I + '="([^"]+)"[^>]*>([^<]*)<', 'g'))].map(m => [m[1], m[2]]);
    if (pairs.length) out.push({ page, key: r.k, text: pairs.map(([k, zh]) => uiTextOr(k, zh)).join(' '), label: uiTextOr(pairs[0][0], pairs[0][1]) });
  }
  for (const f of extra) out.push(...f());
  return out;
}
