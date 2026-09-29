// node tests/version097.test.mjs —— 版本号规则：第 4 段小修补丁（0.9.6 < 0.9.6.1 < 0.9.7）、新系列 S2 从 0 重新数（S2:0.1.0 > 0.9.x，标签 map-s2-v…）、
// 强制更新 min_version；JS（selfcheck.mjs）与 Python（tools/verlib.py、check_version.py、version_code.py、build_preview_script.py）同一套
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as S from '../map/tavern/selfcheck.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };

t('cmpVer：第 4 段、系列', () => {
  const order = ['0.9.5', '0.9.6', '0.9.6.1', '0.9.6.2', '0.9.7', '0.10.0', 'S2:0.1.0', 'S2:0.1.0.1', 'S2:0.2.0', 'S3:0.0.1'];
  for (let i = 0; i + 1 < order.length; i++) { assert.equal(S.cmpVer(order[i], order[i + 1]), -1, order[i] + ' < ' + order[i + 1]); assert.equal(S.cmpVer(order[i + 1], order[i]), 1); }
  assert.equal(S.cmpVer('0.9.6', '0.9.6.0'), 0); assert.equal(S.cmpVer('S1:0.9.6', '0.9.6'), 0);
});
t('标签 ↔ 版本', () => {
  assert.equal(S.tagOf('0.9.6.1'), 'map-v0.9.6.1'); assert.equal(S.tagOf('S2:0.1.0'), 'map-s2-v0.1.0');
  assert.equal(S.verOfTag('map-s2-v0.1.0.3'), 'S2:0.1.0.3'); assert.equal(S.verOfTag('map-s1-v0.9.6'), '0.9.6'); assert.equal(S.verOfTag('map-v1'), null);
  assert.equal(S.fmtVer('S2:0.1.0'), 'S2 v0.1.0'); assert.equal(S.fmtVer('0.9.6.1'), 'v0.9.6.1');
  assert.equal(S.buildVer({ version: '0.1.0', code: 'S2-0100-R-0001' }), 'S2:0.1.0'); assert.equal(S.buildVer({ version: '0.9.6', code: 'S1-0906-R-0290' }), '0.9.6');
});
t('latestTag：两种标签都认，按（系列, 版本）取最新', () => {
  assert.equal(S.latestTag({ versions: ['map-v0.9.6', 'map-v0.9.6.1', 'map-v0.4.0', 'main'] }), '0.9.6.1');
  assert.equal(S.latestTag({ versions: [{ version: 'map-v0.9.9' }, { version: 'map-s2-v0.1.0' }] }), 'S2:0.1.0');
});
t('swapVer：两种标签地址互换', () => {
  const u = 'https://cdn.jsdelivr.net/gh/o/r@map-v0.9.6/map/tavern/eden-map.js';
  assert.equal(S.swapVer(u, '0.9.6.1'), u.replace('map-v0.9.6', 'map-v0.9.6.1'));
  assert.equal(S.swapVer(u, 'S2:0.1.0'), u.replace('map-v0.9.6', 'map-s2-v0.1.0'));
  assert.equal(S.swapVer(u.replace('map-v0.9.6', 'map-s2-v0.1.0'), 'S2:0.1.1'), u.replace('map-v0.9.6', 'map-s2-v0.1.1'));
  assert.equal(S.swapVer('https://x/gh/o/r@main/map/x.js', '0.9.7'), null);
});
t('updateVerdict / 强制更新：系列与补丁都算', () => {
  assert.equal(S.updateVerdict('0.9.6', '0.9.6.1', 'tag').status, 'new');
  assert.equal(S.updateVerdict('0.9.9', 'S2:0.1.0', 'tag').status, 'new');
  assert.equal(S.updateVerdict('S2:0.1.0', '0.9.9', 'tag').status, 'latest');
  assert.equal(S.mustUpdate('0.9.5', '0.9.6'), true); assert.equal(S.mustUpdate('0.9.6', '0.9.6'), false); assert.equal(S.mustUpdate('0.9.9', 'S2:0.1.0'), true);
  assert.equal(S.mustUpdate('0.9.6', null), false); assert.equal(S.mustUpdate('0.9.6', 'garbage'), false);
  const f = S.forceText('0.9.5', '0.9.6', '0.9.7', 'tag'); assert.match(f.title, /已停止支持/); assert.match(f.lines.join(), /重新导入/); assert.equal(f.close, '本次关闭');
  assert.match(S.forceText('0.9.5', '0.9.6', '0.9.7', 'follow', '安全修复').lines[0], /安全修复/);
});
t('evaluate：更新项的文案用 fmtVer', () => {
  const r = S.evaluate({ api: {}, mvu: null, dup: { others: [] }, line: { swappable: false }, worldbook: null, version: {}, update: { current: '0.9.9', latest: 'S2:0.1.0' } });
  assert.match(r.find(i => i.id === 'update').zh, /S2 v0\.1\.0/);
});

// ---------- Python 工具 ----------
const py = (code) => execFileSync('python3', ['-c', code], { cwd: path.join(ROOT, 'tools'), encoding: 'utf-8' }).trim();
t('verlib.py 与 JS 排序一致', () => {
  const vs = ['S2:0.1.0', '0.9.6.1', '0.9.7', '0.9.6', 'S2:0.1.0.1', '0.10.0'];
  const pyOrder = JSON.parse(py(`import verlib, json; print(json.dumps(sorted(${JSON.stringify(vs)}, key=verlib.key)))`));
  assert.deepEqual(pyOrder, vs.slice().sort(S.cmpVer));
  assert.equal(py(`import verlib; print(verlib.code_seg('0.9.6.1'), verlib.tag_of('S2:0.1.0'), verlib.display('S2:0.1.0'))`), '0906p1 map-s2-v0.1.0 S2 v0.1.0');
});
// 临时仓库里跑 version_code.py + check_version.py（不碰真仓库）
function tmpRepo(version, extraBuild = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ver097-')); fs.mkdirSync(path.join(d, 'tools')); fs.mkdirSync(path.join(d, 'map/data'), { recursive: true });
  for (const f of ['verlib.py', 'check_version.py', 'version_code.py', 'build_preview_script.py']) fs.copyFileSync(path.join(ROOT, 'tools', f), path.join(d, 'tools', f));
  fs.writeFileSync(path.join(d, 'VERSION'), version + '\n');
  fs.writeFileSync(path.join(d, 'README.md'), `当前发布版本 \`${version}\`\n`);
  fs.writeFileSync(path.join(d, 'CHANGELOG.md'), `## ${version}（未发版）\n\n## 0.9.6\n`);
  fs.writeFileSync(path.join(d, 'map/data/build.json'), JSON.stringify(extraBuild));
  const g = (...a) => execFileSync('git', a, { cwd: d, stdio: 'pipe' });
  g('init', '-q'); g('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'x');
  return d;
}
const run = (d, f, ...a) => spawnSync('python3', [path.join('tools', f), ...a], { cwd: d, encoding: 'utf-8' });
t('version_code.py：0.9.6.1 → 0906p1；S2:0.1.0 → S2-0100；保留 min_version / force_reason', () => {
  let d = tmpRepo('0.9.6.1', { min_version: '0.9.5', force_reason: '旧版有数据丢失问题' });
  let r = run(d, 'version_code.py'); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /^S1-0906p1-R-0002/);
  let b = JSON.parse(fs.readFileSync(path.join(d, 'map/data/build.json'), 'utf-8'));
  assert.deepEqual([b.version, b.min_version, b.force_reason], ['0.9.6.1', '0.9.5', '旧版有数据丢失问题']);
  r = run(d, 'check_version.py'); assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /标签 map-v0\.9\.6\.1/);
  d = tmpRepo('S2:0.1.0'); r = run(d, 'version_code.py'); assert.match(r.stdout, /^S2-0100-R-/);
  b = JSON.parse(fs.readFileSync(path.join(d, 'map/data/build.json'), 'utf-8')); assert.equal(b.version, '0.1.0');
  r = run(d, 'check_version.py'); assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /标签 map-s2-v0\.1\.0/);
});
t('check_version.py：系列不符、min_version 比本版新 → 错误；0.9.6 不误认 0.9.6.1 的小节', () => {
  let d = tmpRepo('S2:0.1.0', { version: '0.1.0', code: 'S1-0100-R-0002' }); let r = run(d, 'check_version.py');
  assert.equal(r.status, 1); assert.match(r.stdout, /系列/);
  d = tmpRepo('0.9.6.1', { version: '0.9.6.1', code: 'S1-0906p1-R-0002', min_version: '0.9.7' }); r = run(d, 'check_version.py');
  assert.equal(r.status, 1); assert.match(r.stdout, /min_version/);
  d = tmpRepo('0.9.6.1'); fs.writeFileSync(path.join(d, 'CHANGELOG.md'), '## 0.9.6.1\n'); fs.writeFileSync(path.join(d, 'VERSION'), '0.9.6\n'); fs.writeFileSync(path.join(d, 'README.md'), '当前发布版本 `0.9.6`\n');
  fs.writeFileSync(path.join(d, 'map/data/build.json'), JSON.stringify({ version: '0.9.6', code: 'S1-0906-R-0002' }));
  r = run(d, 'check_version.py'); assert.equal(r.status, 1); assert.match(r.stdout, /CHANGELOG 没有「## 0\.9\.6」/);
});
t('build_preview_script.py --tag：认 map-v0.9.6.1 / map-s2-v0.1.0，拒绝别的写法', () => {
  const d = tmpRepo('S2:0.1.0');
  let r = run(d, 'build_preview_script.py', '--tag', 'map-v0.9.6.1.2.3', '--out', d); assert.notEqual(r.status, 0); assert.match(r.stderr, /发版标签应形如/);
  execFileSync('git', ['tag', 'map-s2-v0.1.0'], { cwd: d });
  r = run(d, 'build_preview_script.py', '--tag', 'map-s2-v0.1.0', '--out', d); assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(fs.readFileSync(path.join(d, 'eden-map-S2 v0.1.0.json'), 'utf-8')); assert.equal(j.name, '【地图】伊甸地图'); assert.match(j.content, /BAKED = "map-s2-v0\.1\.0"/);
  r = run(d, 'build_preview_script.py', '--tag', 'map-v0.9.6.1', '--out', d); assert.equal(r.status, 2);   // 与 VERSION 不一致（且标签不存在）
});
// ---------- 正式版加载器（build_preview_script.py --tag 的脚本内容）：每次加载解析最新正式版，离线退回烘进来的标签 ----------
import vm from 'node:vm';
const loaderSrc = (() => { const d = tmpRepo('0.9.6'); execFileSync('git', ['tag', 'map-v0.9.6'], { cwd: d });
  const r = run(d, 'build_preview_script.py', '--tag', 'map-v0.9.6', '--out', d, '--pointer', 'main'); assert.equal(r.status, 0, r.stderr);
  return JSON.parse(fs.readFileSync(path.join(d, 'eden-map-v0.9.6.json'), 'utf-8')).content; })();   // C3-① 英文化
async function load({ list = null, pointer = null, ls = {}, failImport = [] } = {}) {
  const store = { ...ls }, imported = [], fetched = [];
  const win = { localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } },
    fetch: async u => { fetched.push(u); if (u.startsWith('https://data.jsdelivr.com/') && list) return { ok: true, json: async () => ({ versions: list.map(v => ({ version: v })) }) };
      if (u.includes('/map/data/latest.json') && pointer) return { ok: true, json: async () => pointer }; throw new Error('offline'); },
    __edenMapImport: async u => { imported.push(u); if (failImport.some(f => u.includes(f))) throw new Error('404'); } };
  win.window = win; const ctx = vm.createContext({ ...win, AbortController, setTimeout, clearTimeout, console: { warn() {}, info() {} } });
  ctx.window = ctx; vm.runInContext(loaderSrc.replace(/\(async \(\) => \{/, 'globalThis.__done = (async () => {'), ctx); await ctx.__done;
  return { imported, fetched, store, script: ctx.__edenMapScript };
}
const tagIn = u => (u.match(/@(map-[^/]+)\//) || [])[1];
const tests = [
  ['标签列表有更新的正式版 → 加载它（含第 4 段与新系列）', async () => {
    let r = await load({ list: ['map-v0.9.5', 'map-v0.9.6', 'map-v0.9.6.1', 'main'] }); assert.equal(tagIn(r.imported[0]), 'map-v0.9.6.1'); assert.equal(r.imported.length, 1);
    assert.equal(r.script.version, '0.9.6.1'); assert.equal(r.store.edenMapLatestTag, 'map-v0.9.6.1');
    r = await load({ list: ['map-v0.9.9', 'map-s2-v0.1.0'] }); assert.equal(tagIn(r.imported[0]), 'map-s2-v0.1.0'); assert.equal(r.script.version, 'S2:0.1.0'); }],
  ['标签列表取不到 → 读 latest.json 指针', async () => { const r = await load({ pointer: { tag: 'map-v0.9.7' } }); assert.equal(tagIn(r.imported[0]), 'map-v0.9.7'); assert.ok(r.fetched.some(u => u.includes('@main/map/data/latest.json'))); }],
  ['全离线 → 上次成功的；再没有 → 烘进来的标签', async () => {
    assert.equal(tagIn((await load({ ls: { edenMapLatestTag: 'map-v0.9.8' } })).imported[0]), 'map-v0.9.8');
    assert.equal(tagIn((await load()).imported[0]), 'map-v0.9.6'); }],
  ['不会比烘进来的更旧；新标签的代码加载失败 → 退回烘进来的标签', async () => {
    assert.equal(tagIn((await load({ list: ['map-v0.9.1'] })).imported[0]), 'map-v0.9.6');
    const r = await load({ list: ['map-v0.9.7'], failImport: ['map-v0.9.7'] }); assert.deepEqual([...new Set(r.imported.map(tagIn))], ['map-v0.9.7', 'map-v0.9.6']); }],
  ['锁定当前版本 → 不联网，固定用锁定的标签', async () => {
    const r = await load({ list: ['map-v0.9.9'], ls: { edenMapLockTag: 'map-v0.9.6' } }); assert.equal(tagIn(r.imported[0]), 'map-v0.9.6'); assert.equal(r.fetched.length, 0); assert.equal(r.script.locked, true); }],
];
for (const [name, f] of tests) { await f(); n++; console.log('ok 加载器：' + name); }
console.log(`${n} 项通过`);
