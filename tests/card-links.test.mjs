// 地点卡链接（map/app/card-links.mjs）：通道 meta.link + 可选的三维 meta.link3d；以及查看器接线
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { linkHtml, linksHtml } from '../map/app/card-links.mjs';

const REG = { maps: { tc_low: { title: '天城下层' }, lm_x: { title: '某地标', kind: 'estate', viewer3d: 'x' }, plan: { title: '规划中', status: 'planned' } } };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nm = (o, k = 'title') => o?.[k] || '';
const t = (k, v = {}) => ({ goto: '前往{title}', view3d: '查看三维模型' }[k] || k).replace(/\{(\w+)\}/g, (_, n) => v[n] ?? '');
const ctx = { REG, nm, t, esc };

test('只有 link：一个通道链接（和以前一样）', () => {
  const h = linksHtml({ link: { map: 'tc_low', marker: 'w7' } }, ctx);
  assert.equal((h.match(/<a /g) || []).length, 1);
  assert.match(h, /data-go="tc_low" data-focus="w7"/); assert.match(h, />前往天城下层</); assert.doesNotMatch(h, /data-link3d/);
});
test('link + link3d：两个链接，通道在前、三维在后', () => {
  const h = linksHtml({ link: { map: 'tc_low', marker: 'w7' }, link3d: { map: 'lm_x' } }, ctx);
  assert.equal((h.match(/<a /g) || []).length, 2);
  assert.ok(h.indexOf('data-go="tc_low"') < h.indexOf('data-go="lm_x"'));
  assert.match(h, /data-go="lm_x" data-focus="" data-link3d="1"[^>]*>查看三维模型</);
});
test('只有 link3d；自定义文案去掉尾箭头；转义', () => {
  assert.match(linksHtml({ link3d: { map: 'lm_x', label: '看模型 →' } }, ctx), />看模型</);
  assert.match(linkHtml({ map: 'lm_x', label: '<b>x' }, ctx, '3d'), /&lt;b&gt;x/);
});
test('目标不存在 / 规划中 / 与通道同图：不出第二个', () => {
  assert.equal(linksHtml({ link3d: { map: 'nope' } }, ctx), '');
  assert.equal(linksHtml({ link3d: { map: 'plan' } }, ctx), '');
  assert.equal((linksHtml({ link: { map: 'lm_x' }, link3d: { map: 'lm_x' } }, ctx).match(/<a /g) || []).length, 1);
  assert.equal(linksHtml({}, ctx), ''); assert.equal(linksHtml(null, ctx), '');
});
test('查看器接线：标记卡用 linksHtml(meta)，模块标签在，check_maps 校验 link3d', () => {
  const v = readFileSync(new URL('../map/viewer.html', import.meta.url), 'utf8'), mk = readFileSync(new URL('../map/app/markers.mjs', import.meta.url), 'utf8');
  assert.match(mk, /extra: (?:\(\) => )?econHtml\(meta\) \+ links\(meta\)/); assert.match(mk, /CardLinksApi\.linksHtml\(meta, linkCtx\)/);
  assert.match(v, /<script type="module" src="app\/card-links\.mjs"/);
  assert.match(readFileSync(new URL('../tools/check_maps.py', import.meta.url), 'utf8'), /link3d/);
});
test('任务三：三维视口入口常驻（link 指三维场景不重复出；人已在三维场景里就有；没有场景不硬塞）', async () => {
  const { scene3dOf, linksHtml: L, isScene3d } = await import('../map/app/card-links.mjs');
  const REG2 = { maps: { tc_low: { title: '天城下层', kind: 'points' }, eden: { title: '伊甸庄园', kind: 'estate' },
    plan: { title: '规划中', kind: 'estate', status: 'planned' } } };
  const c = { REG: REG2, nm, t, esc };
  assert.equal(isScene3d(REG2.maps.eden), true); assert.equal(isScene3d(REG2.maps.tc_low), false); assert.equal(isScene3d(REG2.maps.plan), false);
  // 地标的通道本身指到庄园：那条链接就是三维入口，不再重复出第二条
  const h1 = L({ link: { map: 'eden', label: '进入伊甸庄园' } }, c);
  assert.equal((h1.match(/<a /g) || []).length, 1); assert.match(h1, />进入伊甸庄园</);
  // 人在庄园里（当前图 = 三维场景）：任意地标卡都有「进入三维视口」，且带 data-same（点了走同图聚焦而不是重开）
  const h2 = L({ name: '书房' }, { ...c, cur: 'eden' });
  assert.equal((h2.match(/<a /g) || []).length, 1);
  assert.match(h2, /data-go="eden" data-focus="书房" data-link3d="1" data-same="1"/);
  // 既没有 link 也没有三维场景：一个链接都不出（绝不硬塞点了没反应的入口）
  assert.equal(L({ name: '某处' }, c), '');
  assert.equal(scene3dOf({ link3d: { map: 'plan' } }, c), null, '规划中的三维场景不算');
  assert.equal(scene3dOf({ name: '书房' }, { ...c, cur: 'tc_low' }), null);
});
test('房间图集入口 meta.gallery：标签、默认文案、坏 id 不出', async () => {
  const { galleryHtml } = await import('../map/app/card-links.mjs');
  const t2 = k => ({ gallery: '图集' }[k] || k), c = { ...ctx, t: t2 };
  assert.match(linksHtml({ link: { map: 'tc_low' }, gallery: { id: 'wardrobe', label: '主卧衣帽间图集' } }, c), /data-go="tc_low"[\s\S]*data-gallery="wardrobe"[^>]*>主卧衣帽间图集</);
  assert.match(galleryHtml({ id: 'wardrobe' }, c), />图集</);
  assert.equal(galleryHtml({ id: '../x' }, c), ''); assert.equal(galleryHtml(null, c), '');
  // 衣帽间渲染图已移出通用图集（U，2026-09-28）：eden 标记不再挂 gallery 字段，走 closet/ 的三维 / 热点入口
  const m = JSON.parse(readFileSync(new URL('../map/data/maps.json', import.meta.url), 'utf8'));
  assert.equal(m.maps.tc_upper.markers.eden.gallery, undefined);
});
