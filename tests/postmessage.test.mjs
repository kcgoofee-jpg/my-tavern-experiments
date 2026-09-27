// A-6：子页只认嵌入它的查看器；查看器往同源子页发消息用具体 origin（静态检查；运行时由 tools/browser/viewer3d_perf.mjs、accept.mjs --only estate 覆盖）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const rd = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('estate / viewer3d message listeners require e.source === parent', () => {
  assert.match(rd('map/estate/main.js'), /addEventListener\('message', \(e\) => \{\n\s*if \(IN_FRAME && e\.source !== window\.parent\) return;/);
  assert.match(rd('map/props/viewer3d.html'), /addEventListener\('message', e => \{\n\s*if \(e\.source !== parent\) return;/);
});

test('viewer: host listener checks source, subframe posts use SUB_ORIGIN', () => {
  const v = rd('map/viewer.html');
  assert.match(v, /function fromHost\(e\) \{[\s\S]{0,400}if \(e\.source === window\.parent\) return true;/);
  assert.match(v, /if \(!fromHost\(e\) \|\| \(PR && !PR\.accept\(e\.data/);
  assert.match(v, /if \(!est \|\| e\.source !== est\.frame\.contentWindow \|\| \(PR && !PR\.accept/);
  assert.ok(v.indexOf('const SUB_ORIGIN') > 0 && v.indexOf('const SUB_ORIGIN') < v.indexOf('SUB_ORIGIN)'), 'SUB_ORIGIN declared before first use');
  const bad = v.split('\n').filter(l => /(contentWindow\??|\bw)\.postMessage\([^;]*'\*'\)/.test(l));
  assert.deepEqual(bad, [], 'subframe postMessage with "*"');
});

test('compose.js 回执只认宿主（arch-v2 §6 第 3 步）', () => {
  assert.match(rd('map/compose.js'), /eden-map:compose-done' \|\| !window\.__fromHost\?\.\(e\)\) return;/);
});
test('eden-map.js：只收本面板 iframe 的消息并按协议校验', () => {
  assert.match(rd('map/tavern/eden-map.js'), /if \(e\.source !== frame\.contentWindow \|\| \(PRm && !PRm\.accept\(e\.data/);
});
