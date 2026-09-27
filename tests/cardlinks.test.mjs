// 地点卡链接（map/app/cardlinks.mjs）：通道 meta.link + 可选的三维 meta.link3d；以及查看器接线
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { linkHtml, linksHtml } from '../map/app/cardlinks.mjs';

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
  assert.match(mk, /extra: econHtml\(meta\) \+ links\(meta\)/); assert.match(mk, /TCCardLinks\.linksHtml\(meta, linkCtx\)/);
  assert.match(v, /<script type="module" src="app\/cardlinks\.mjs"/);
  assert.match(readFileSync(new URL('../tools/check_maps.py', import.meta.url), 'utf8'), /link3d/);
});
test('房间图集入口 meta.gallery：标签、默认文案、坏 id 不出', async () => {
  const { galleryHtml } = await import('../map/app/cardlinks.mjs');
  const t2 = k => ({ gallery: '图集' }[k] || k), c = { ...ctx, t: t2 };
  assert.match(linksHtml({ link: { map: 'tc_low' }, gallery: { id: 'wardrobe', label: '主卧衣帽间图集' } }, c), /data-go="tc_low"[\s\S]*data-gallery="wardrobe"[^>]*>主卧衣帽间图集</);
  assert.match(galleryHtml({ id: 'wardrobe' }, c), />图集</);
  assert.equal(galleryHtml({ id: '../x' }, c), ''); assert.equal(galleryHtml(null, c), '');
  const m = JSON.parse(readFileSync(new URL('../map/data/maps.json', import.meta.url), 'utf8'));
  assert.equal(m.maps.tc_upper.markers.eden.gallery.id, 'wardrobe');
});
