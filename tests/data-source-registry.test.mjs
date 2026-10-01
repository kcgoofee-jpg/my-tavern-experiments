// 数据源注册表（map/tavern/data-source-registry.mjs，arch-v2 §6 第 8 步）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SOURCES, summarize, byId, BRANCHES, branchOf, branchUrl } from '../map/tavern/data-source-registry.mjs';
import { SCHEMA } from '../map/core/protocol.mjs';
import { HOST_SRC } from './_host_src.mjs';

test('登记项齐全、id 唯一、有中英文名', () => {
  assert.deepEqual(SOURCES.map(s => s.id), ['mvu', 'db', 'tags', 'vars']);
  for (const s of SOURCES) { assert.ok(s.label && s.label_en && s.feeds.length); assert.equal(byId(s.id), s); }
});
test('summarize 与 v0.9.6 形状兼容，另加 list', () => {
  const r = summarize({ hasMvu: true, mode: 'mvu', here: 'x', chars: [{ src: 'mvu' }, {}, { src: 'mvu' }], varMap: { a: 1 }, vars: true });
  assert.equal(r.location, 'mvu'); assert.deepEqual(r.mvu, { present: true, mode: 'mvu' }); assert.deepEqual(r.characters, { mvu: 2, infer: 1 });
  assert.deepEqual(r.list.filter(x => x.active).map(x => x.id), ['mvu', 'tags', 'vars']);
  const d = summarize({ hasMvu: false, mode: 'tags', db: { tables: 3, location: true }, here: 'y', hereFromDb: true });
  assert.equal(d.location, 'db'); assert.deepEqual(d.list.filter(x => x.active).map(x => x.id), ['db', 'tags']);
  assert.equal(summarize().location, 'none');
});
test('接线：宿主 sources() 走注册表；设置页显示在读的来源；i18n 有每个来源的名字', () => {
  assert.match(HOST_SRC, /dataSourceRegistryModule\.summarize\(ctx\)/);
  assert.match(readFileSync(new URL('../map/app/data-mapping-settings.mjs', import.meta.url), 'utf8'), /s\.src_list/);
  for (const l of ['zh', 'en']) { const d = JSON.parse(readFileSync(new URL(`../map/i18n/${l}.json`, import.meta.url), 'utf8')); for (const s of SOURCES) assert.ok(d['s.src_' + s.id], l + ' ' + s.id); }
});

test('分支注册表（版本分支切换）：只有 main / preview；镜像与标签折算；branchUrl 只换 gh 线路的 ref', () => {
  assert.deepEqual(BRANCHES.map(b => b.id), ['main', 'preview']);
  for (const b of BRANCHES) { assert.ok(b.id && b.label && b.label_en); }
  assert.equal(branchOf('main'), 'main');
  assert.equal(branchOf('preview'), 'preview');
  assert.equal(branchOf('cloud/tc-mid-low'), 'preview');   // 旧兼容镜像 → preview（docs/branching.md）
  assert.equal(branchOf('map-v0.9.6'), 'main');            // 发版标签属于发版线
  assert.equal(branchOf('map-s2-v0.1.0'), 'main');
  assert.equal(branchOf('f' + '0'.repeat(39)), null);      // 提交号认不出（跟随加载器按提交号加载）
  assert.equal(branchOf(''), null); assert.equal(branchOf(null), null);
  const u = 'https://cdn.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@preview/map/tavern/eden-map.js';
  assert.equal(branchUrl(u, 'main'), 'https://cdn.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@main/map/tavern/eden-map.js');
  assert.equal(branchUrl(u, 'preview'), u);
  const t = 'https://cdn.jsdelivr.net/gh/kcgoofee-jpg/my-tavern-experiments@map-v0.9.6/map/tavern/eden-map.js';
  assert.equal(branchUrl(t, 'preview'), u);
  assert.equal(branchUrl('https://registry.npmmirror.com/tiancheng-map-assets/0.9.6/files/map/tavern/eden-map.js', 'main'), null);
  assert.equal(branchUrl('http://localhost:8000/map/tavern/eden-map.js', 'main'), null);
  assert.equal(branchUrl(u, 'cloud/tc-mid-low'), null);    // 只接受注册表里的分支
});

test('接线：分支切换的消息与界面都在（宿主 switchBranch / 设置下拉 / 协议登记 / i18n）', () => {
  const host = HOST_SRC;
  assert.match(host, /eden-map:switch-branch/);
  assert.match(host, /function switchBranch\(/);
  assert.match(readFileSync(new URL('../map/app/settings.mjs', import.meta.url), 'utf8'), /branchSel/);
  assert.match(readFileSync(new URL('../map/viewer.html', import.meta.url), 'utf8'), /branchBox/);
  assert.ok('eden-map:switch-branch' in SCHEMA, '协议 SCHEMA 登记了 switch-branch');
  for (const l of ['zh', 'en']) { const d = JSON.parse(readFileSync(new URL(`../map/i18n/${l}.json`, import.meta.url), 'utf8')); for (const k of ['s.branch', 's.branch_hint', 's.branch_na']) assert.ok(d[k], l + ' ' + k); }
});
