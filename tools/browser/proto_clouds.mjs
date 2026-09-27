// 云动效原型 map/_proto/clouds.html：375 宽 Chromium / WebKit 帧率、减少动态 / 省流、切层转场截图序列。
// node tools/browser/proto_clouds.mjs [输出目录]；截图序列另存 docs/drafts/clouds_coc_anim_*.jpg（Chromium）
import * as B from './lib.mjs';
import path from 'node:path'; import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
const OUT = process.argv[2] || '/tmp/proto_clouds'; fs.mkdirSync(OUT, { recursive: true });
const URL = B.BASE + '_proto/clouds.html';
B.quietWait(); await B.ensureServer();
const R = {};
const open = async (preset, q = '') => {
  const P = await B.newPage(preset, { scheme: 'light' });
  await P.page.goto(URL + q, { waitUntil: 'load' }); await P.page.waitForFunction(() => [...document.images].every(i => i.complete)); await B.wait(600);
  return P;
};
for (const preset of ['phone', 'iphone']) {
  const P = await open(preset); const pg = P.page; const r = R[preset] = {};
  r.state = await pg.evaluate(() => window.__state());
  r.drift = await pg.evaluate(() => window.__measure(4000));
  const m = pg.evaluate(() => window.__measure(1600)); await pg.evaluate(() => { window.__coc(); }); r.coc = await m;
  await B.wait(400);
  const f = pg.evaluate(() => window.__measure(1100)); await pg.evaluate(() => { window.__fade(); }); r.fade = await f;
  r.layerAfter = (await pg.evaluate(() => window.__state())).layer;
  r.errors = P.errors; await P.close();
  // 减少动态：没有漂移，切层立即完成
  const Q = await open(preset, '?rm=1'); const t0 = Date.now();
  await Q.page.evaluate(() => window.__coc()); r.rm = { ...(await Q.page.evaluate(() => window.__state())), swapMs: Date.now() - t0 }; await Q.close();
  // 省流 / 低内存：没有漂移，不加载云精灵
  const L = await open(preset, '?lite=1'); r.lite = { ...(await L.page.evaluate(() => window.__state())), puffRequests: L.net.list.filter(x => /puff/.test(x[0])).length }; await L.close();
}
// 截图序列（Chromium 375）：漂移中 → 合拢 → 全白 → 散开
const shots = [['1_drift', null], ['2_closing', 230], ['3_cover', 520], ['4_parting', 1000]];
for (const [name, t] of shots) {
  const P = await open('phone');
  if (t !== null) { await P.page.evaluate(() => { window.__coc(); }); await B.wait(t); }
  const p = path.join(OUT, `anim_${name}.png`); await P.page.screenshot({ path: p });
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', p, '--out', path.join(B.REPO_ROOT, 'docs', 'drafts', `clouds_coc_anim_${name}.jpg`)]);
  await P.close();
}
await B.closeAll();
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify(R, null, 1));
