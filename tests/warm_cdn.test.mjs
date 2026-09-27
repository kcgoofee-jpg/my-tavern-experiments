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
  for (const f of ['map/viewer.html', 'map/data/maps.json', 'map/art/world.dzi', 'map/estate/index.html', 'map/ui/gallery.js']) assert.ok(l.includes(f), f);
  assert.equal(run('--count'), String(l.length));
});
