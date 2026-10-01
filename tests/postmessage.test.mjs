// A-6：子页只认嵌入它的查看器；查看器往同源子页发消息用具体 origin（静态检查；运行时由 tools/browser/viewer3d_perf.mjs、accept.mjs --only estate 覆盖）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const rd = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('estate / viewer3d message listeners require e.source === parent', () => {
  assert.match(rd('map/estate/main.js'), /addEventListener\('message', \(e\) => \{\n\s*if \(IN_FRAME && e\.source !== window\.parent\) return;/);
  assert.match(rd('map/props/viewer3d.html'), /addEventListener\('message', e => \{\n\s*if \(e\.source !== parent\) return;/);
});

test('viewer: host listener checks source, subframe posts use SUB_ORIGIN', () => {
  // 查看器本体 = viewer.html + map/app/*.mjs（arch-v2 §6 第 6 步拆出的模块）
  const v = ['map/viewer.html', ...readdirSync(new URL('../map/app/', import.meta.url)).filter(f => f.endsWith('.mjs')).map(f => 'map/app/' + f)].map(rd).join('\n');
  assert.match(v, /function fromHost\(e\) \{[\s\S]{0,400}if \(e\.source === window\.parent\) return true;/);
  assert.match(v, /if \(!fromHost\(e\) \|\| \(protocol && !protocol\.accept\(e\.data/);
  assert.match(v, /if \(!subpageSession \|\| e\.source !== subpageSession\.frame\.contentWindow \|\| \(protocol && !protocol\.accept/);
  assert.match(rd('map/app/protocol-stamp.mjs'), /export const SUB_ORIGIN = /);
  for (const f of ['map/app/subpage3d-host.mjs', 'map/app/host-messages.mjs']) assert.match(rd(f), /import \{[^}]*\bSUB_ORIGIN\b[^}]*\} from '\.\/protocol-stamp\.mjs'/, f);
  const bad = v.split('\n').filter(l => /(contentWindow\??|\bw)\.postMessage\([^;]*'\*'\)/.test(l));
  assert.deepEqual(bad, [], 'subframe postMessage with "*"');
});

test('compose.js 回执只认宿主（arch-v2 §6 第 3 步）', () => {
  assert.match(rd('map/compose-view.mjs'), /eden-map:compose-done' \|\| !window\.__isFromHost\?\.\(e\)\) return;/);
});
test('eden-map.js：只收本面板 iframe 的消息并按协议校验', () => {
  assert.match(rd('map/tavern/eden-map.js'), /if \(e\.source !== frame\.contentWindow \|\| \(protocolModule && !protocolModule\.accept\(e\.data/);
});
