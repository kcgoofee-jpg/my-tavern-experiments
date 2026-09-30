// 版本信息与检查更新（P2 解耦）：tests/host_about.test.mjs —— 全部走桩，不需要浏览器 / CDN。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createAbout } from '../map/tavern/host-about.mjs';
import * as SRC from '../map/tavern/sources.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LINES = [{ key: 'auto', name: '自动', host: 'cdn.jsdelivr.net' }, { key: 'cn', name: '有梯子', host: 'fastly.jsdelivr.net' }];

function mk(over = {}) {
  const calls = [];
  const json = async url => ({ ok: true, json: async () => (over.data?.(url) ?? null) });
  const d = {
    cdnFetch: async (url, opt) => { calls.push(url); if (over.fetch) return over.fetch(url, opt); return json(url); },
    post: m => calls.push(m), base: () => 'https://cdn.example/gh/r@preview/map/', REPO: 'o/r',
    SELF: 'https://cdn.example/gh/o/r@preview/map/', VER: null, tagOf: v => 'map-v' + v, LINES, swappable: true,
    SCRIPT: {}, lineKey: () => 'auto', lang: () => 'zh',
    followHead: async () => over.head ?? null, followNewer: h => !!over.newer?.(h),
    loadSelfcheck: async () => over.SC ?? null, loadSources: async () => SRC,
    ...(over.deps || {}),
  };
  return { ab: createAbout(d), calls };
}

test('channel：标签版 / 跟随分支 / 本地三种口径', () => {
  assert.equal(mk({ deps: { VER: '0.9.7', SCRIPT: {} } }).ab.channel(), 'tag');
  assert.equal(mk({ deps: { swappable: true } }).ab.channel(), 'ref');
  assert.equal(mk({ deps: { swappable: false } }).ab.channel(), 'local');
  assert.equal(mk({ deps: { SCRIPT: { channel: 'follow' } } }).ab.channel(), 'follow', '烘焙信息优先');
});

test('refOf 从脚本地址里取钉住的 ref', () => {
  assert.equal(mk().ab.refOf(), 'preview');
  assert.equal(mk({ deps: { SELF: 'file:///tmp/map/' } }).ab.refOf(), '');
});

test('buildNow 只取一次（后续复用同一个 Promise）', async () => {
  const { ab, calls } = mk({ data: () => ({ version: '0.9.8', code: 100 }) });
  const a = await ab.buildNow(), b = await ab.buildNow();
  assert.deepEqual(a, { version: '0.9.8', code: 100 });
  assert.equal(b, a);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /data\/build\.json\?t=/);
});

test('sendAbout 发标准 about 载荷（版本 / 渠道 / 线路 / 分支）', async () => {
  const { ab, calls } = mk({ deps: { SCRIPT: { version: '0.9.8', build: 12, ref: 'preview', locked: true } }, data: () => ({ version: '0.9.8', code: 100 }) });
  await ab.sendAbout();
  const m = calls.find(c => c?.type === 'eden-map:about');
  assert.ok(m);
  assert.equal(m.version, '0.9.8'); assert.equal(m.code, 100);
  assert.equal(m.channel, 'ref'); assert.equal(m.ref, 'preview'); assert.equal(m.branch, 'preview');
  assert.equal(m.locked, true); assert.equal(m.line, '自动');
  assert.deepEqual(m.branches.map(b => b.id), ['main', 'preview']);
  assert.equal(m.branchSw, true);
});

test('sendAbout 英文线路名与取数失败都不影响发出', async () => {
  const { ab, calls } = mk({ deps: { lang: () => 'en', LINES: [{ key: 'auto', name: '自动', name_en: 'Auto' }] }, fetch: async () => ({ ok: false }) });
  await ab.sendAbout();
  const m = calls.find(c => c?.type === 'eden-map:about');
  assert.equal(m.line, 'Auto');
  assert.equal(m.version, null, '取不到 build.json 就留空，不猜');
});

test('followUpdate：跟随分支头指针比对，取不到即 fail', async () => {
  const { ab } = mk({ head: { build: 20, sha: 'abcdef1234567890', source: 'gh' }, newer: () => true });
  assert.deepEqual(await ab.followUpdate(), { status: 'new', follow: true, build: 20, sha: 'abcdef123456', source: 'gh', cur: null });
  const b = mk({ head: null });
  assert.deepEqual(await b.ab.followUpdate(), { status: 'fail', follow: true });
  const c = mk({ head: { build: 20, sha: 'abc' }, newer: () => false });
  assert.equal((await c.ab.followUpdate()).status, 'latest');
});

test('checkUpdate：正式版标签比对，按注入的 selfcheck 裁决', async () => {
  const SC = { UPDATE_API: r => `https://data.jsdelivr.com/v1/packages/gh/${r}`, latestTag: () => 'map-v0.9.9', tagOf: t => t,
    buildVer: b => b?.version, updateVerdict: (cur, latest) => ({ status: 'new', latest, current: cur }) };
  const { ab, calls } = mk({ SC, data: url => (url.includes('@map-v0.9.9') ? { code: 200, min_version: '0.9.0', force_reason: 'x' } : null) });
  const v = await ab.checkUpdate();
  assert.equal(v.status, 'new');
  assert.equal(v.code, 200); assert.equal(v.min, '0.9.0'); assert.equal(v.reason, 'x');
  assert.match(v.notes, /blob\/map-v0\.9\.9\/CHANGELOG\.md/);
  assert.ok(calls.some(u => typeof u === 'string' && u.includes('fastly') === false));
});

test('checkUpdate 的降级路径：没有标签 / 取数抛错 / 自检模块没加载，一律 fail 不抛', async () => {
  const noTag = { UPDATE_API: () => 'u', latestTag: () => null, tagOf: t => t, buildVer: () => null, updateVerdict: () => ({}) };
  assert.deepEqual(await mk({ SC: noTag }).ab.checkUpdate(), { status: 'fail' });
  assert.deepEqual(await mk({ SC: null }).ab.checkUpdate(), { status: 'fail' }, '自检模块没加载');
  const boom = { ...noTag, UPDATE_API: () => { throw new Error('boom'); } };
  assert.deepEqual(await mk({ SC: boom }).ab.checkUpdate(), { status: 'fail' });
});

test('入口已改为装配 host-about（本段实现不在 eden-map.js 里）', () => {
  const src = readFileSync(join(ROOT, 'map/tavern/eden-map.js'), 'utf8');
  assert.ok(src.includes("from './host-about.mjs'"));
  assert.ok(src.includes('createAbout({'));
  assert.ok(!src.includes('async function checkUpdate()'), '旧的检查更新实现必须已经搬走');
});
