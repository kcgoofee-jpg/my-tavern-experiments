// C-11：warm_cdn 只预热运行时文件
import test from 'node:test';
import { fileURLToPath } from 'node:url';   // .pathname 会把中文路径百分号编码（主 checkout 在「性能/」下）
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const run = (...a) => execFileSync('bash', ['tools/warm_cdn.sh', 'HEAD', ...a], { cwd: ROOT, encoding: 'utf8' }).trim();

test('warm list excludes non-runtime files, keeps runtime ones', () => {
  const l = run('--list').split('\n');
  const bad = l.filter(f => /\.(md|py|txt)$|^map\/(shots|_proto)\/|\/reviews\/|^map\/(world|world_draft\d*|tiancheng)\.html$|^docs\//.test(f));
  assert.deepEqual(bad, []);
  for (const f of ['map/viewer.html', 'map/data/maps.json', 'map/art/world.dzi', 'map/estate/index.html', 'map/ui/sheet.js']) assert.ok(l.includes(f), f);
  assert.equal(run('--count'), String(l.length));
});

// 2026-09-30 增量预热：--full 与默认等价；--diff 只出改动 + 头指针。
// 基线显式传 HEAD（CI 是 fetch-depth 1 的浅克隆，没有父提交，--diff 会自动升级成全量——那也是对的行为）
test('--full equals the default full list; --diff is a small subset with the head pointers', () => {
  const full = run('--list').split('\n');
  assert.deepEqual(run('--full', '--list').split('\n'), full);
  const diff = run('--diff', 'HEAD', '--list').split('\n');   // 空改动：只剩头指针
  assert.deepEqual(diff, ['map/data/head.json', 'map/tavern/eden-map.js']);
  for (const f of diff) assert.ok(full.includes(f), `not in full list: ${f}`);
  assert.equal(run('--diff', 'HEAD', '--count'), String(diff.length));
});
