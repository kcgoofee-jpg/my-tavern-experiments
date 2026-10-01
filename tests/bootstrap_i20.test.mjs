// I-20：用户导入的预览脚本带内联引导——先取 head.json（no-store + 分钟参数），再按提交号 import 入口；全失败才退回分支路径
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHA = 'b'.repeat(40);
const gen = (ref, args = '') => {
  const py = `import sys, json; sys.path.insert(0, 'tools'); import build_preview_script as b
print(json.dumps({'branch': b.is_branch(${JSON.stringify(ref)}), 'd': b.build_follow(${JSON.stringify(ref)}, '${'f'.repeat(40)}', {'build': 2, 'sha': '${'e'.repeat(40)}'})}))`;
  return JSON.parse(execFileSync('python3', ['-c', py], { cwd: ROOT, encoding: 'utf8' }));
};
const run = async (content, { head, failImport = u => false, ls = {} }) => {
  const imported = [], fetched = [], init = [];
  const win = {
    __edenMapImport: async u => { imported.push(u); if (failImport(u)) throw new Error('import'); },
    __edenMapFetch: async (u, o) => { fetched.push([u, o]); const v = head(u); return { ok: v != null, json: async () => v }; },
  };
  const localStorage = { getItem: k => ls[k] ?? null, setItem: () => {} };
  await new Function('window', 'localStorage', 'console', `return (async () => { ${content.replace('(async () => {', 'await (async () => {')} })()`)(win, localStorage, { info() {}, warn() {} });
  return { imported, fetched, win };
};

test('分支名 = 带引导的脚本；提交号 / 标签 = 照旧', () => {
  for (const r of ['preview', 'main', 'feature-x']) assert.equal(gen(r).branch, true, r);
  for (const r of ['a225973', SHA, 'map-v0.9.7', 'map-s2-v0.1.0']) assert.equal(gen(r).branch, false, r);
});

test('生成的脚本含引导：no-store + 分钟参数取 head.json，且从不先 import 分支地址', async () => {
  const { d } = gen('preview');
  assert.match(d.content, /cache: 'no-store'/); assert.match(d.content, /async function resolveFollow\(/);
  assert.match(d.content, /Math\.floor\(Date\.now\(\) \/ 60000\)/);
  const r = await run(d.content, { head: u => (u.includes('jsdelivr.net') && u.includes('head.json') ? { build: 190, sha: SHA } : null) });
  assert.ok(r.fetched.length >= 6 && r.fetched.every(([, o]) => o.cache === 'no-store'));
  assert.ok(r.fetched.filter(([u]) => u.includes('head.json')).every(([u]) => /[?&](t|v)=\d+/.test(u)));
  assert.equal(r.imported.length, 1);
  assert.equal(r.imported[0], `https://cdn.jsdmirror.com/gh/kcgoofee-jpg/my-tavern-experiments@${'b'.repeat(12)}/map/tavern/eden-map.js`);
  assert.ok(!r.imported.some(u => /@preview\//.test(u)), '成功时从不 import 分支地址');
  assert.deepEqual([r.win.__edenMapScript.sha, r.win.__edenMapScript.build, r.win.__edenMapScript.channel], ['b'.repeat(12), 190, 'follow']);
});

test('head 全取不到：用内置提交号，不是分支地址；提交号地址全失败：最后退回 @preview', async () => {
  const { d } = gen('preview');
  let r = await run(d.content, { head: () => null });
  assert.match(r.imported[0], new RegExp(`@${'e'.repeat(12)}/map/tavern/eden-map.js`));
  assert.ok(!r.imported.some(u => /@preview\//.test(u)));
  r = await run(d.content, { head: () => null, failImport: u => !/@preview\//.test(u) });
  assert.ok(r.imported.slice(0, -1).every(u => !/@preview\//.test(u)), '分支地址排在所有提交号地址之后');
  assert.match(r.imported.at(-1), /@preview\/map\/tavern\/eden-map\.js$/);
});

test('正式版（--tag）加载器不变：不含分支引导', () => {
  const py = `import sys, json; sys.path.insert(0, 'tools'); import build_preview_script as b; print(json.dumps(b.build_release('map-v0.9.7')))`;
  const d = JSON.parse(execFileSync('python3', ['-c', py], { cwd: ROOT, encoding: 'utf8' }));
  assert.ok(!d.content.includes('resolveFollow') && d.content.includes('edenMapLatestTag'));
});
