// 跟随分支解析（2026-09-28 没梯子卡在旧提交）：head.json 链 jsdmirror / jsDelivr / raw → GitHub contents → 本机；本机旧的不许赢
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { resolveFollow } from '../map/tavern/branch-follow.mjs';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const R = 'o/r', B = 'preview';
const H = (build, c = 'a') => ({ build, sha: c.repeat(40) });
const mock = table => async u => { for (const [k, v] of Object.entries(table)) if (u.includes(k)) { if (v instanceof Error) throw v; return v; } return null; };
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64');

test('GitHub 不通、jsDelivr 解析接口 null：分支路径 head.json 能用', async () => {
  const h = await resolveFollow(R, B, mock({ 'api.github.com': new Error('blocked'), 'data.jsdelivr.com': { version: null }, 'cdn.jsdmirror.com/gh/o/r@preview/map/data/head.json': H(80, 'b') }), H(1));
  assert.deepEqual(h, { build: 80, sha: 'b'.repeat(40), source: 'jsdmirror' });
});
test('多个来源取构建号最大的（缓存旧的输）', async () => {
  const h = await resolveFollow(R, B, mock({ jsdmirror: H(5), 'cdn.jsdelivr.net': H(7, 'c'), 'raw.githubusercontent.com/o/r/preview/': H(6) }), null);
  assert.equal(h.build, 7); assert.equal(h.source, 'jsdelivr');
});
test('CDN 全不通 → GitHub contents 接口（base64 的 head.json）', async () => {
  const h = await resolveFollow(R, B, mock({ 'api.github.com/repos/o/r/contents/map/data/head.json?ref=preview': { content: b64(H(9, 'd')) } }), null);
  assert.deepEqual(h, { build: 9, sha: 'd'.repeat(40), source: 'github' });
});
test('新增镜像（fastly / gcore / testingcf）也参与取最大；jsdmirror 落后不影响结果', async () => {
  const h = await resolveFollow(R, B, mock({ jsdmirror: H(1, 'a'), 'cdn.jsdelivr.net': H(1, 'a'), 'fastly.jsdelivr.net': H(1, 'a'), 'gcore.jsdelivr.net': H(12, 'c'), 'testingcf.jsdelivr.net': H(1, 'a'), raw: H(1, 'a') }), null);
  assert.deepEqual(h, { build: 12, sha: 'c'.repeat(40), source: 'gcore' });
});
test('缓存破坏参数按分钟取整，且每个源的 URL 里都带着', async () => {
  const seen = [];
  await resolveFollow(R, B, async u => { seen.push(u); return null; }, null).catch(() => {});
  const headUrls = seen.filter(u => u.includes('head.json') && !u.includes('api.github.com'));
  assert.equal(headUrls.length, 6);
  for (const u of headUrls) assert.match(u, /[?&](t|v)=\d+/);
  const nums = headUrls.map(u => Number(u.match(/[?&](?:t|v)=(\d+)/)[1]));
  assert.ok(nums.every(n => n === nums[0]));
});
test('本机记住的只在构建号更大时赢；什么都取不到才用本机', async () => {
  assert.equal((await resolveFollow(R, B, mock({ jsdmirror: H(3) }), H(10))).source, 'cache');
  assert.equal((await resolveFollow(R, B, mock({ jsdmirror: H(11) }), H(10))).source, 'jsdmirror');
  assert.equal((await resolveFollow(R, B, mock({}), H(10))).source, 'cache');
  assert.equal(await resolveFollow(R, B, mock({ jsdmirror: { build: 'x', sha: 'zz' } }), null), null);
});
test('加载器（build_preview_script --follow）嵌同一段解析，按 head.json 的提交号加载', async () => {
  const py = `import sys, json; sys.path.insert(0, 'tools'); import build_preview_script as b; print(json.dumps(b.build_follow('${B}', '${'f'.repeat(40)}', {'build': 2, 'sha': '${'e'.repeat(40)}'})))`;
  const d = JSON.parse(execFileSync('python3', ['-c', py], { cwd: ROOT, encoding: 'utf8' }));
  assert.ok(d.content.includes('async function resolveFollow(') && !d.content.includes('api.github.com/repos/${REPO}/commits'));
  const run = async (table, ls = {}) => {
    const imported = [], store = { ...ls };
    const win = { __edenMapImport: async u => { imported.push(u); if (!u.includes('jsdmirror')) return; }, __edenMapFetch: async u => { const v = await mock(table)(u); return { ok: v != null, json: async () => v }; } };
    const localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
    await new Function('window', 'localStorage', 'console', `return (async () => { ${d.content.replace('(async () => {', 'await (async () => {')} })()`)(win, localStorage, { info() {}, warn() {} });
    return { imported, store, win };
  };
  let r = await run({ 'cdn.jsdmirror.com/gh/o': null, 'api.github.com': new Error('x'), 'raw.githubusercontent.com': H(80, 'b') });
  assert.match(r.imported[0], new RegExp(`@${'b'.repeat(12)}/map/tavern/eden-map.js`)); assert.equal(r.win.__edenMapScript.build, 80); assert.equal(r.win.__edenMapScript.source, 'raw');
  assert.equal(JSON.parse(r.store.edenMapFollowHead).build, 80);
  r = await run({}, { edenMapFollowHead: JSON.stringify(H(1, 'c')) });   // 本机的比内置的旧：用内置
  assert.match(r.imported[0], new RegExp(`@${'e'.repeat(12)}/`)); assert.equal(r.win.__edenMapScript.source, 'baked');
});
