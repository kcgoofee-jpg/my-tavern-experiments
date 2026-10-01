// arch-v2 §3：消息协议（map/core/protocol.mjs）——schema 校验、版本兼容、总线；以及「每个发送点的类型都登记在 SCHEMA」静态清点
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PROTO, SCHEMA, check, accept, envelope, createBus, sameOrigin } from '../map/core/protocol.mjs';
const rd = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('版本：缺 v = v1 照收；更新版本照收；非法版本丢', () => {
  assert.equal(check({ type: 'eden-map:loaded' }).ok, true);
  assert.equal(check({ type: 'eden-map:loaded', v: PROTO + 3 }).ok, true);
  assert.equal(check({ type: 'eden-map:loaded', v: 'x' }).ok, false);
  assert.equal(check({ type: 'eden-map:loaded', v: 0 }).ok, false);
});
test('字段类型：必填 / 可缺 / any', () => {
  assert.equal(check({ type: 'eden-map:compose', text: 'hi' }).ok, true);
  assert.equal(check({ type: 'eden-map:compose' }).why, 'field:text');
  assert.equal(check({ type: 'eden-map:compose', text: 3 }).ok, false);
  assert.equal(check({ type: 'eden-map:unmapped', name: null }).ok, true);
  assert.equal(check({ type: 'eden-map:settings', page: 'data' }).ok, true);
  assert.equal(check({ type: 'eden-map:notice', n: [] }).ok, false);
  assert.equal(check({ type: 'eden-map:trips', items: {} }).ok, false);
});
test('未知类型：丢；更新版本的未知类型不告警', () => {
  assert.equal(check({ type: 'eden-map:nope' }).why, 'unknown');
  assert.equal(check({ type: 'eden-map:nope', v: PROTO + 1 }).why, 'newer-unknown');
  assert.equal(check(null).ok, false); assert.equal(check('x').ok, false);
  const w = console.warn; let n = 0; console.warn = () => n++;
  try { accept({ type: 'eden-map:nope', v: PROTO + 1 }); accept({ type: 'other:thing' }); accept({ type: 'eden-map:bad1' }); accept({ type: 'eden-map:bad1' }); } finally { console.warn = w; }
  assert.equal(n, 1, '只对本命名空间告警、同一原因只告警一次');
});
test('envelope 盖版本；总线：来源检查 + 校验 + 分发 + dispose', () => {
  assert.deepEqual(envelope('eden-map:esc'), { type: 'eden-map:esc', v: PROTO });
  const L = new Set(), self = { addEventListener: (t, f) => L.add(f), removeEventListener: (t, f) => L.delete(f), origin: 'https://o' };
  const sent = []; const peer = { postMessage: (m, o) => sent.push([m, o]) };
  const bus = createBus({ self, peer: () => peer, accept: e => e.source === peer, extra: () => ({ t: 'tok' }) });
  const got = []; bus.on('eden-map:compose', m => got.push(m.text));
  const fire = (data, source = peer) => { for (const f of L) f({ data, source, origin: 'https://o' }); };
  fire({ type: 'eden-map:compose', text: 'a' }); fire({ type: 'eden-map:compose', text: 'b' }, {}); fire({ type: 'eden-map:compose' });
  assert.deepEqual(got, ['a']);
  bus.send('eden-map:esc', {}); assert.deepEqual(sent[0][0], { type: 'eden-map:esc', v: PROTO, t: 'tok' });
  bus.dispose(); assert.equal(L.size, 0);
  assert.ok(sameOrigin({ origin: 'null' }, self) && sameOrigin({ origin: 'https://o' }, self) && !sameOrigin({ origin: 'https://evil' }, self));
});
test('静态清点：仓库里每个发送的消息类型都登记在 SCHEMA', () => {
  const files = ['map/viewer.html', 'map/tavern/eden-map.js', 'map/tavern/host-th.mjs', 'map/tavern/host-routes.mjs', 'map/tavern/host-lifecycle.mjs', 'map/tavern/llm-flow.mjs', 'map/tavern/loot-flow.mjs', 'map/tavern/chars-flow.mjs', 'map/tavern/timeline-flow.mjs', 'map/tavern/host-api.mjs', 'map/tavern/root-store.mjs', 'map/tavern/host-checks.mjs', 'map/tavern/modes-flow.mjs', 'map/estate/main.js', 'map/estate/index.html', 'map/props/viewer3d.html',
    ...readdirSync(new URL('../map/', import.meta.url)).filter(f => /\.(js|mjs)$/.test(f)).map(f => 'map/' + f),
    ...readdirSync(new URL('../map/app/', import.meta.url)).filter(f => f.endsWith('.mjs')).map(f => 'map/app/' + f)];
  const miss = new Set();
  for (const f of files) for (const m of rd(f).matchAll(/type:\s*'((?:eden-map|estate|v3d):[\w-]+)'/g)) if (!SCHEMA[m[1]]) miss.add(`${m[1]}（${f}）`);
  assert.deepEqual([...miss], []);
});
test('宿主 PROTO 与 core/protocol.mjs 一致；settings / notice-act 可缺字段（设置首页深链、无 key 的通知按钮）', () => {
  assert.match(rd('map/tavern/eden-map.js'), new RegExp(`const PROTO = ${PROTO};`));
  assert.match(rd('map/app/util.mjs'), new RegExp(`const PROTO = ${PROTO};`));
  assert.equal(check({ type: 'eden-map:settings' }).ok, true); assert.equal(check({ type: 'eden-map:notice-act' }).ok, true);
});
test('真实负载：outfit 是对象（mvu.outfit）、events / chars 带 v:1 也照收', () => {
  assert.equal(check({ type: 'eden-map:outfit', items: { 上衣: '白衬衫' }, text: '着装：白衬衫' }).ok, true);
  assert.equal(check({ type: 'eden-map:outfit', items: null, text: '' }).ok, true);
  assert.equal(check({ type: 'eden-map:events', v: 1, floor: 3, items: [] }).ok, true);
  assert.equal(check({ type: 'eden-map:chars', v: 1, items: [], rosters: {} }).ok, true);
});
test('S2-B: estate:children (viewer → page) and estate:go (page → viewer) are registered with their shapes', () => {
  assert.equal(SCHEMA['estate:children'][0], 'viewer→sub'); assert.equal(SCHEMA['estate:go'][0], 'sub→viewer');
  assert.ok(check(envelope('estate:children', { zones: { dairy: [{ node: 'dairy', title: 'x' }] } })).ok);
  assert.ok(check(envelope('estate:children', { zones: {} })).ok);
  assert.equal(check(envelope('estate:children', {})).why, 'field:zones');
  assert.equal(check(envelope('estate:children', { zones: [] })).why, 'field:zones');
  assert.ok(check(envelope('estate:go', { node: 'dairy' })).ok);
  assert.equal(check(envelope('estate:go', {})).why, 'field:node');
  assert.equal(check(envelope('estate:go', { node: 3 })).why, 'field:node');
});
