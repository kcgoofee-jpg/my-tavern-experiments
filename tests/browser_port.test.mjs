// tools/browser/lib.mjs 的端口隔离：默认端口按工作树路径哈希；端口上是别的目录的服务时不复用，自己换端口起
import test from 'node:test';
import { fileURLToPath } from 'node:url';   // .pathname 会把中文路径百分号编码（主 checkout 在「性能/」下）
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const wait = ms => new Promise(r => setTimeout(r, ms));

test('ensureServer skips a foreign server on the default port', { timeout: 60000 }, async t => {
  delete process.env.EDEN_PORT; delete process.env.EDEN_BASE;
  let B; try { B = await import('../tools/browser/lib.mjs'); } catch (e) { return t.skip('no playwright: ' + e.message.split('\n')[0]); }
  assert.ok(B.PORT >= 5200 && B.PORT < 6000);
  const port0 = B.PORT;
  try { await fetch(`http://localhost:${port0}/`); return t.skip(`默认端口 ${port0} 已有服务（上次测试留下的？）`); } catch (e) {}
  const other = mkdtempSync(join(tmpdir(), 'foreign-')); writeFileSync(join(other, 'viewer.html'), 'x');
  const foreign = spawn('python3', [join(ROOT, 'tools/cors_server.py'), String(port0), other], { stdio: 'ignore' });
  let srv;
  try {
    for (let i = 0; i < 50; i++) { await wait(100); try { await fetch(`http://localhost:${port0}/viewer.html`); break; } catch (e) {} }
    assert.equal(await (await fetch(`http://localhost:${port0}/__root`)).text(), realpathSync(other));
    srv = await B.ensureServer();
    assert.notEqual(B.PORT, port0, 'moved off the foreign port');
    assert.equal(await (await fetch(B.BASE + '__root')).text(), realpathSync(join(ROOT, 'map')));
  } finally { srv?.stop(); foreign.kill(); rmSync(other, { recursive: true, force: true }); }
});
