// U12：三维查看器（挤奶厅 / 大教堂 / 首相府）浮层遮挡检查。
// 用法：node tools/browser/props_u12.mjs [before|after]   → docs/drafts/props_u12_<tag>_{375,desktop}.png
// 断言（手机 375 默认状态）：浮层（顶栏、流向、部件、说明卡、热点编号）并集占画面 < 25%；
// 另查：流向 / 部件一次点开，点画面外自动收起；选热点后手机说明卡高 ≤ 42% 视口，可关。
import path from 'node:path';
import { newPage, shot, closeAll, wait, BASE, ensureServer } from './lib.mjs';

const TAG = process.argv[2] || 'after';
const OUT = path.resolve('docs/drafts');
const srv = await ensureServer();
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m); };

// 16 px 网格采样浮层并集占比
const coverage = page => page.evaluate(() => {
  const els = [...document.querySelectorAll('#top > *, #flows, #list, #card, .pin')].filter(e => getComputedStyle(e).display !== 'none');
  const R = els.map(e => e.classList.contains('pin') ? e.firstElementChild.getBoundingClientRect() : e.getBoundingClientRect()).filter(r => r.width && r.height);
  const W = innerWidth, H = innerHeight; let n = 0, hit = 0;
  for (let y = 4; y < H; y += 8) for (let x = 4; x < W; x += 8) { n++; if (R.some(r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) hit++; }
  return hit / n;
});

try {
  for (const model of ['dairy', 'cathedral', 'pm_residence']) {
    for (const preset of ['phone', 'desktop']) {
      const P = await newPage(preset);
      await P.page.goto(`${BASE}props/viewer3d.html?model=${model}`);
      await P.page.waitForFunction(() => window.__v3d?.ready, null, { timeout: 120000 });
      await wait(1800);
      const c0 = await coverage(P.page);
      console.log(`${model} ${preset} 默认浮层占比 ${(c0 * 100).toFixed(1)}%`);
      if (preset === 'phone') ok(c0 < 0.25, `${model} 手机默认遮挡 < 25%（${(c0 * 100).toFixed(1)}%）`);
      // 用户报告的状态：开流向 + 选一个热点（截图用这个状态；两版都能跑）
      await P.page.evaluate(() => { const b = document.getElementById('flowBtn'); if (!b.hidden) b.click(); __v3d.fly(document.querySelector('.pin').dataset.id, true); });
      await wait(800);
      const c1 = await coverage(P.page);
      console.log(`${model} ${preset} 流向+热点时浮层占比 ${(c1 * 100).toFixed(1)}%`);
      if (model === 'dairy') await shot(P.page, OUT, `props_u12_${TAG}_${preset === 'phone' ? '375' : 'desktop'}`);
      await P.page.evaluate(() => { const b = document.getElementById('flowBtn'); if (!b.hidden) b.click(); __v3d.select?.(null); document.querySelector('#card .x')?.click(); });
      await wait(300);
      if (TAG === 'after' && preset === 'phone') {
        ok(await P.page.evaluate(() => document.getElementById('list').hidden), `${model} 部件默认收起`);
        await P.page.click('#listBtn'); await wait(200);
        ok(await P.page.evaluate(() => !document.getElementById('list').hidden), `${model} 部件一点即开`);
        await P.page.mouse.click(187, 200); await wait(300);
        ok(await P.page.evaluate(() => document.getElementById('list').hidden), `${model} 点画面外收起部件`);
        const hasFlow = await P.page.evaluate(() => !document.getElementById('flowBtn').hidden);
        if (hasFlow) {
          await P.page.click('#flowBtn'); await wait(200);
          ok(await P.page.evaluate(() => document.getElementById('flows').hidden), `${model} 流向开启时图例默认收起`);
          ok(await P.page.evaluate(() => !document.getElementById('legendBtn').hidden), `${model} 图例按钮出现`);
          await P.page.click('#legendBtn'); await wait(200);
          ok(await P.page.evaluate(() => !document.getElementById('flows').hidden), `${model} 图例一点即开`);
          await P.page.click('#flows li button'); await wait(300);
          ok(await P.page.evaluate(() => document.getElementById('flows').hidden), `${model} 选流向后图例自动收起`);
          await P.page.click('#card .x'); await wait(200);
          await P.page.click('#flowBtn'); await wait(200);
        }
        await P.page.evaluate(() => __v3d.fly(document.querySelector('.pin').dataset.id, true)); await wait(400);
        const r = await P.page.evaluate(() => { const c = document.getElementById('card'); return { h: c.getBoundingClientRect().height / innerHeight, vis: !c.hidden }; });
        ok(r.vis && r.h <= 0.42, `${model} 说明卡底部面板高 ${(r.h * 100).toFixed(0)}% ≤ 42%`);
        await P.page.click('#card .x'); await wait(200);
        ok(await P.page.evaluate(() => document.getElementById('card').hidden), `${model} 说明卡可关`);
      }
      if (P.errors.length) { console.log(P.errors); fails.push(`${model} ${preset} 页面错误`); }
      await P.close();
    }
  }
} finally { await closeAll(); srv?.stop?.(); }
if (fails.length) { console.log('\n失败 ' + fails.length); process.exit(1); }
console.log('\n全部通过');
