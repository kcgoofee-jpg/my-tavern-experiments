// 地点卡底部的链接（大版本 2，从 viewer.html 内联脚本拆出；docs/design/arch-v2.md §6）：
//   meta.link   = 跨层 / 下钻通道 { map, marker?, label?, label_en? }（有些标记拿它做跨层跳转）
//   meta.link3d = 可选的第二个链接：看这个地点的三维模型 { map, label?, label_en? }，map 通常是 kind=estate（带 viewer3d）的地图
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
  return a + b;
}
if (typeof window !== 'undefined') window.TCCardLinks = { linkHtml, linksHtml };
