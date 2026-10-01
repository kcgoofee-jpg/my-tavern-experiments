// 地点卡底部的链接（大版本 2，从 viewer.html 内联脚本拆出；docs/design/arch-v2.md §6）：
//   meta.link   = 跨层 / 下钻通道 { map, marker?, label?, label_en? }（有些标记拿它做跨层跳转）
//   meta.link3d = 可选的第二个链接：看这个地点的三维模型 { map, label?, label_en? }，map 通常是 kind=estate（带 viewer3d）的地图
//   meta.gallery = 可选的图集入口 { id, label?, label_en? }，id 是节点 id；有包图片（K-R101）的地点才有；点开在地图面板里看这个地点的图集（包图片在前、你自己的私人图在后）
// 两个都有就都显示（通道在前）；目标图不存在或 status=planned 的不显示。纯函数：依赖通过 ctx 传入，node 单测 tests/card-links.test.mjs。
// 点击走查看器全局的 [data-go] 委托（document click → go(map)，data-focus = 落点标记）。
export function linkHtml(l, { REG, nm, t, esc }, kind = 'go') {
  if (!l || typeof l !== 'object' || !REG?.maps?.[l.map] || REG.maps[l.map].status === 'planned') return '';
  const fallback = kind === '3d' ? t('v3.enter') : t('goto', { title: nm(REG.maps[l.map], 'title') });
  const label = (nm(l, 'label') || fallback).replace(/\s*[→›>]\s*$/, '');
  return `<a data-go="${esc(l.map)}" data-focus="${esc(l.marker || '')}"${kind === '3d' ? ' data-link3d="1"' : ''} role="button" tabindex="0">${esc(label)}</a>`;
}
/** 这张图是不是「微观三维场景」（kind=estate：主场景剖面 / props 通用三维查看器都算）——只看注册表条目的版本，节点树在手时用 sceneOf */
export const isScene3d = (m) => !!m && m.kind === 'estate' && m.status !== 'planned';
/** 图 id 是不是三维场景：调用方给了 ctx.scene（节点树：这张图的视图是 model3d）就听它的，否则退回注册表条目 */
const sceneOf = (ctx, id) => (ctx.scene ? !!ctx.scene(id) : isScene3d(ctx.REG?.maps?.[id]));

/**
 * 任务三：这个实体关联的微观三维场景是什么？返回 { map, focus } 或 null。判据全是数据事实，不写死任何名字：
 *   ① 地标自己声明的 link3d（三维入口）→ 用它；
 *   ② 地标自己声明的 link 指向三维场景图（主场景 / 通用三维查看器）→ 那条通道本身就是三维入口；
 *   ③ 当前图**就是**三维场景（人已经在里面）→ 用当前图 + 落点名（进去后聚焦这一处 / 切到它的楼层）。
 * 都没有 → null（卡片不出现这个入口，绝不硬塞一个点了没反应的链接）。
 */
export function scene3dOf(meta, ctx = {}) {
  const { cur } = ctx;
  const focus = (ctx.nm ? ctx.nm(meta, 'name') : '') || meta?.name || '';
  if (sceneOf(ctx, meta?.link3d?.map)) return { map: meta.link3d.map, focus: meta.link3d.marker || focus };
  if (sceneOf(ctx, meta?.link?.map)) return { map: meta.link.map, focus: meta.link.marker || focus };
  if (sceneOf(ctx, cur)) return { map: cur, focus };
  return null;
}
/** 三维视口入口：有三维场景就一定有这一条。目标图正好是当前图时标 data-same（点了走「同图聚焦」而不是重新打开） */
export function scene3dHtml(meta, ctx) {
  const s = scene3dOf(meta, ctx);
  if (!s?.map) return '';
  const label = ctx.t('v3.enter');   // S7-3 U-31: the one primary action 「3D 查看」 / "View in 3D" of a place that has a 3D page (the page's title is the card's own)
  return `<a data-go="${ctx.esc(s.map)}" data-focus="${ctx.esc(s.focus || '')}" data-link3d="1"${s.map === ctx.cur ? ' data-same="1"' : ''} role="button" tabindex="0">${ctx.esc(label)}</a>`;
}
/** 卡片的全部链接：通道 + 三维 + 常驻三维视口入口（同一目标只出一个）+ 图集 */
export function linksHtml(meta, ctx) {
  const a = linkHtml(meta?.link, ctx, 'go');
  const b = meta?.link3d && meta.link3d.map !== meta?.link?.map ? linkHtml(meta.link3d, ctx, '3d') : '';
  const covered = new Set([meta?.link?.map, meta?.link3d?.map].filter(Boolean));   // 上面两条已经指到的地方不重复给入口
  const scene = scene3dOf(meta, ctx);
  const c = scene && !covered.has(scene.map) ? scene3dHtml(meta, ctx) : '';
  return a + b + c + galleryHtml(ctx.galleryOf ? ctx.galleryOf(meta) : meta?.gallery, ctx);
}
/** 房间图集入口（衣帽间等）：标签默认「图集」 */
export function galleryHtml(g, { nm, t, esc }) {
  if (!g || typeof g !== 'object' || typeof g.id !== 'string' || !/^[a-z0-9_-]+$/i.test(g.id)) return '';
  const label = (nm(g, 'label') || t('gallery')).replace(/\s*[→›>]\s*$/, '');
  return `<a data-gallery="${esc(g.id)}" role="button" tabindex="0">${esc(label)}</a>`;
}
// 点开图集：懒加载编辑模块里的 openPictures（它按节点 id 取包图片 + 私人图，开面板）；关掉后焦点回到入口
async function openGal(a) {
  const { openPictures } = await import('./pack-edit-view.mjs');
  openPictures(a.dataset.gallery, '', { onClose: () => { if (a.isConnected) a.focus({ preventScroll: true }); } });
}
// ---------------- Part 6-4：卡片上的「动作注入」入口 ----------------
// 查看器只说「点了哪个地点、想做什么」：post 一条 eden-map:action，文案与注入方式由宿主（tavern/place-action-injection.mjs）
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
    const { post } = await import('./protocol-stamp.mjs'); const { currentMapId } = await import('./state.mjs');
    post({ type: 'eden-map:action', kind: a.dataset.inject || 'go', name: a.dataset.name || '', map: currentMapId || '' });
  }
  document.addEventListener('click', e => { const a = e.target.closest?.('[data-gallery]'); if (a) { e.preventDefault(); openGal(a); } });
  document.addEventListener('keydown', e => { const a = (e.key === 'Enter' || e.key === ' ') && e.target.closest?.('[data-gallery]'); if (a) { e.preventDefault(); openGal(a); } });
}
if (typeof window !== 'undefined') window.CardLinksApi = { linkHtml, linksHtml, galleryHtml, injectHtml };
