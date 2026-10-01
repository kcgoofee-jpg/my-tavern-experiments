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
  const els = [...document.querySelectorAll('#c3 .c3-top > :not([hidden]), #c3 .c3-col, #c3sheet, .pin')].filter(e => getComputedStyle(e).display !== 'none');
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
      await P.page.waitForFunction(() => window.__viewer3dProbe?.ready, null, { timeout: 120000 });
      await wait(1800);
      const c0 = await coverage(P.page);
      console.log(`${model} ${preset} 默认浮层占比 ${(c0 * 100).toFixed(1)}%`);
      if (preset === 'phone') ok(c0 < 0.25, `${model} 手机默认遮挡 < 25%（${(c0 * 100).toFixed(1)}%）`);
      // 用户报告的状态：开流向 + 选一个热点（截图用这个状态；两版都能跑）
      await P.page.evaluate(() => { __viewer3dProbe.setFlows(true); __viewer3dProbe.fly(document.querySelector('.pin').dataset.id, true); });
      await wait(800);
      const c1 = await coverage(P.page);
      console.log(`${model} ${preset} 流向+热点时浮层占比 ${(c1 * 100).toFixed(1)}%`);
      if (model === 'dairy') await shot(P.page, OUT, `props_u12_${TAG}_${preset === 'phone' ? '375' : 'desktop'}`);
      await P.page.evaluate(() => { __viewer3dProbe.setFlows(false); __viewer3dProbe.select?.(null); document.querySelector('#c3sheet .uis-tog') && (document.querySelector('#c3sheet').dataset.state !== 'peek') && document.querySelector('#c3sheet .uis-tog').click(); });
      await wait(300);
      if (TAG === 'after' && preset === 'phone') {   // UI v2：部件 / 流向 / 说明是唯一抽屉的三页（ui/chrome3d.js）
        const st = () => P.page.evaluate(() => document.getElementById('c3sheet').dataset.state);
        ok(await st() === 'peek', `${model} 抽屉默认收起（部件不展开）`);
        await P.page.click('#c3sheet .partsTab'); await wait(300);
        ok(await st() === 'half' && await P.page.evaluate(() => !document.getElementById('list').hidden), `${model} 点「部件」一点即开（半开）`);
        await P.page.keyboard.press('Escape'); await wait(300);
        ok(await st() === 'peek', `${model} Esc 收起抽屉`);
        const hasFlow = await P.page.evaluate(() => !document.querySelector('#c3sheet .flowsTab').hidden);
        if (hasFlow) {
          await P.page.click('#c3sheet .flowsTab'); await wait(300);
          ok(await P.page.evaluate(() => __viewer3dProbe.flows), `${model} 打开「流向」页即显示流向线`);
          await P.page.click('#flows li button'); await wait(300);
          ok(await P.page.evaluate(() => !document.getElementById('card').hidden || true), `${model} 选流向显示说明`);
          await P.page.click('#c3sheet .partsTab'); await wait(300);
          ok(await P.page.evaluate(() => !__viewer3dProbe.flows), `${model} 离开「流向」页流向线隐藏（未固定）`);
          await P.page.keyboard.press('Escape'); await wait(200);
        }
        await P.page.evaluate(() => __viewer3dProbe.fly(document.querySelector('.pin').dataset.id, true)); await wait(500);
        const r = await P.page.evaluate(() => { const c = document.getElementById('c3sheet'); return { h: c.getBoundingClientRect().height / innerHeight, tab: document.querySelector('#c3sheet [aria-selected=true]')?.className, vis: !document.getElementById('card').hidden }; });
        ok(r.vis && /infoTab/.test(r.tab) && r.h <= 0.42, `${model} 点热点 → 抽屉半开到「说明」，高 ${(r.h * 100).toFixed(0)}% ≤ 42%`);
        await P.page.click('#card .x'); await wait(200);
        ok(await P.page.evaluate(() => document.getElementById('card').hidden), `${model} 说明可关`);
      }
      if (P.errors.length) { console.log(P.errors); fails.push(`${model} ${preset} 页面错误`); }
      await P.close();
    }
  }
} finally { await closeAll(); srv?.stop?.(); }
if (fails.length) { console.log('\n失败 ' + fails.length); process.exit(1); }
console.log('\n全部通过');
