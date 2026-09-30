// 地点卡底部的链接（大版本 2，从 viewer.html 内联脚本拆出；docs/design/arch-v2.md §6）：
//   meta.link   = 跨层 / 下钻通道 { map, marker?, label?, label_en? }（有些标记拿它做跨层跳转）
//   meta.link3d = 可选的第二个链接：看这个地点的三维模型 { map, label?, label_en? }，map 通常是 kind=estate（带 viewer3d）的地图
//   meta.gallery = 可选的房间图集入口 { id, label?, label_en? }，id 是 data/room_galleries.json 的键；点开直接在地图面板里看图集（不用先进三维庄园）
// 两个都有就都显示（通道在前）；目标图不存在或 status=planned 的不显示。纯函数：依赖通过 ctx 传入，node 单测 tests/cardlinks.test.mjs。
// 点击走查看器全局的 [data-go] 委托（document click → go(map)，data-focus = 落点标记）。
export function linkHtml(l, { REG, nm, t, esc }, kind = 'go') {
  if (!l || typeof l !== 'object' || !REG?.maps?.[l.map] || REG.maps[l.map].status === 'planned') return '';
  const fallback = kind === '3d' ? t('view3d', { title: nm(REG.maps[l.map], 'title') }) : t('goto', { title: nm(REG.maps[l.map], 'title') });
  const label = (nm(l, 'label') || fallback).replace(/\s*[→›>]\s*$/, '');
  return `<a data-go="${esc(l.map)}" data-focus="${esc(l.marker || '')}"${kind === '3d' ? ' data-link3d="1"' : ''} role="button" tabindex="0">${esc(label)}</a>`;
}
/** 卡片的全部链接：通道 + 三维（同一张图只出一个） */
export function linksHtml(meta, ctx) {
  const a = linkHtml(meta?.link, ctx, 'go');
  const b = meta?.link3d && meta.link3d.map !== meta?.link?.map ? linkHtml(meta.link3d, ctx, '3d') : '';
  return a + b + galleryHtml(meta?.gallery, ctx);
}
/** 房间图集入口（衣帽间等）：标签默认「图集」 */
export function galleryHtml(g, { nm, t, esc }) {
  if (!g || typeof g !== 'object' || typeof g.id !== 'string' || !/^[a-z0-9_-]+$/i.test(g.id)) return '';
  const label = (nm(g, 'label') || t('gallery')).replace(/\s*[→›>]\s*$/, '');
  return `<a data-gallery="${esc(g.id)}" role="button" tabindex="0">${esc(label)}</a>`;
}
// 点开图集：懒加载 ui/gallery.js 与 data/room_galleries.json（按 <base> 解析，srcdoc 里也安全）；关掉后焦点回到入口
let GALS = null;
async function openGal(a) {
  const base = new URL('.', document.baseURI).href;   // 目录（图集按 base + dir + 文件名拼地址）
  const [{ openGallery }, sets] = await Promise.all([import(new URL('ui/gallery.js', base).href),
    GALS ? Promise.resolve(GALS) : fetch(new URL('data/room_galleries.json', base)).then(r => r.ok ? r.json() : null).catch(() => null)]);
  if (sets) GALS = sets; const set = sets?.[a.dataset.gallery]; if (!set) return;
  openGallery(set, { lang: window.I18N?.lang || 'zh', base, onClose: () => { if (a.isConnected) a.focus({ preventScroll: true }); } });
}
// ---------------- Part 6-4：卡片上的「动作注入」入口 ----------------
// 查看器只说「点了哪个地点、想做什么」：post 一条 eden-map:action，文案与注入方式由宿主（tavern/action.mjs）
// 按设置决定。模式默认 off 时这个链接根本不渲染——不让地图在玩家没点头的情况下替他说话。
export function injectHtml(meta, { t, esc, nm, mode } = {}) {
  if (!mode || mode === 'off') return '';
  const name = (nm ? nm(meta, 'name') : '') || meta?.name || '';   // 点位卡的标题字段是 name（英文时取 name_en）
  if (!name) return '';
  const label = mode === 'sys' ? t('act.sys', '注入系统指令') : t('act.compose', '填入输入框');
  return `<a data-inject="go" data-name="${esc(name)}" role="button" tabindex="0">${esc(label)}</a>`;
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', e => { const a = e.target.closest?.('[data-inject]'); if (a) { e.preventDefault(); injectFrom(a); } });
  document.addEventListener('keydown', e => { const a = (e.key === 'Enter' || e.key === ' ') && e.target.closest?.('[data-inject]'); if (a) { e.preventDefault(); injectFrom(a); } });
  async function injectFrom(a) {
    const { post } = await import('./util.mjs'); const { cur } = await import('./state.mjs');
    post({ type: 'eden-map:action', kind: a.dataset.inject || 'go', name: a.dataset.name || '', map: cur || '' });
  }
  document.addEventListener('click', e => { const a = e.target.closest?.('[data-gallery]'); if (a) { e.preventDefault(); openGal(a); } });
  document.addEventListener('keydown', e => { const a = (e.key === 'Enter' || e.key === ' ') && e.target.closest?.('[data-gallery]'); if (a) { e.preventDefault(); openGal(a); } });
}
if (typeof window !== 'undefined') window.TCCardLinks = { linkHtml, linksHtml, galleryHtml, injectHtml };
