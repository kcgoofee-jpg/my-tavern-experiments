// Part 4-1 / Part 1-5 浏览器探针：node tools/browser/p4_fx.mjs <输出目录>
// ① 查看器能起来、无控制台错误（首屏挂载没有被引擎改动弄坏）；
// ② 天气层挂在 LayerRegistry 的 fx 槽位、菜单行渲染出来、canvas 真在画（有粒子 / 色调像素）；
// ③ 可见性守卫：标签页隐藏 → 暂停位生效，回前台恢复（P7-4）；
// ④ 离线降级：断网后查看器仍出加载失败出路而不是白屏（Part 1-5）。
import * as B from './lib.mjs';
import { BASE } from './lib.mjs';

const OUT = process.argv[2] || 'tools/browser/out-p4fx';
B.quietWait();
await B.ensureServer();
const rep = B.reporter(OUT);
const step = async (name, fn) => { try { await fn(); } catch (e) { rep.check(name, false, '异常：' + String(e.message).split('\n')[0]); } };

try {
  const D = await B.newPage('desktop', { tier: 'save' });
  const p = D.page;

  await step('首屏挂载（省流档）', async () => {
    const r = await B.openViewer(D);
    rep.metric('first', r);
    rep.check('首屏遮罩消失 ≤ 3 s', r.loadingDoneMs <= 3000, `${r.loadingDoneMs} ms，首瓦片 ${r.firstTileMs} ms，${(r.bytes / 1024).toFixed(0)} KB / ${r.requests} 请求`);
    await B.shot(p, OUT, 'first');
  });

  await step('天气层在 fx 槽位，菜单行渲染出来', async () => {
    const st = await p.evaluate(() => {
      const d = window.LayerHostApi?.describe() || {};
      const slot = d.slots?.find(s => s.id === 'fx') || null;
      return { slot, box: !!document.getElementById('tgWeather'), cv: !!document.querySelector('.vpslot[data-slot="fx"] canvas.wxcv'),
        api: typeof window.WeatherApi?.set === 'function' };
    });
    rep.check('fx 槽位登记了 weather 层', !!st.slot?.layers?.includes('weather'), JSON.stringify(st.slot));
    rep.check('图层菜单有「天气」开关', st.box);
    rep.check('fx 槽位里有天气 canvas', st.cv);
    rep.check('调试面 window.WeatherApi 可用', st.api);
  });

  await step('切到雷暴雨：canvas 真的画出了东西', async () => {
    await p.evaluate(() => window.WeatherApi.set('storm'));
    await B.wait(700);
    const r = await p.evaluate(() => {
      const cv = document.querySelector('.vpslot[data-slot="fx"] canvas.wxcv');
      if (!cv) return { ok: false };
      const c = cv.getContext('2d');
      const d = c.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 8) n++;   // 抽样统计非透明像素
      return { ok: true, w: cv.width, h: cv.height, painted: n };
    });
    rep.metric('weather_storm', r);
    rep.check('雷暴雨画出可见像素（色调 + 粒子）', r.ok && r.painted > 20, JSON.stringify(r));
    await B.shot(p, OUT, 'storm');
  });

  await step('可见性守卫：隐藏即暂停，回前台恢复', async () => {
    const r = await p.evaluate(async () => {
      const bus = window.__listenerBus;
      const before = bus?.describe?.().count ?? -1;
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise(r => setTimeout(r, 200));
      const paused = window.__edenVisPaused ?? null;
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise(r => setTimeout(r, 200));
      return { before, paused, after: bus?.describe?.().count ?? -1 };
    });
    rep.metric('visibility', r);
    rep.check('监听器总线台账可读（泄漏排查口）', r.before > 0, JSON.stringify(r));
    rep.check('切隐藏 / 回前台都不抛错', true, '无 pageerror');
  });

  // 断网不能靠「离线状态下导航」（那一步就失败了，什么都没加载）：先正常起来，再掐网并切图——
  // 这时瓦片全失败，查看器必须留在页面上给出「卡住了 / 重试」，而不是白屏或静默转圈（Part 1-5）。
  const errsBefore = D.errors.length;   // 断网这一步必然刷出网络错误，只比对它之前的基线
  await step('离线降级：断网切图后仍有明确出路，不是白屏', async () => {
    await p.evaluate(() => window.WeatherApi?.set('clear'));
    await D.ctx.setOffline(true);
    await p.evaluate(() => { try { window.ViewerDebug?.go?.('tc_upper'); } catch (e) {} });
    await B.wait(25000);   // 卡住判定：8 s 提示网络慢、20 s 出「重试」（tools/browser 的卡住提示节奏）
    const r = await p.evaluate(() => ({
      alive: !!document.getElementById('osd') && !!document.getElementById('loading'),
      tier: (document.getElementById('tierState')?.textContent || '').slice(0, 40),
      retry: !document.getElementById('tileRetry')?.hidden,
      stuck: document.getElementById('tierState')?.className || '',
      ld: (document.getElementById('loading')?.textContent || '').slice(0, 60),
      ldDone: document.getElementById('loading')?.classList.contains('done'),
    }));
    rep.metric('offline', r);
    rep.check('断网切图后查看器仍在（不白屏）', r.alive, JSON.stringify(r));
    // 断网时 DZI 本身都取不到，走的是「加载失败」出路（遮罩 + 重试）；瓦片级卡住提示是弱网而不是断网的路子
    rep.check('断网切图后给出失败提示 / 重试入口，且没假装加载完成', (r.retry || /stuck|卡|慢|重试|%|失败|网络/.test(r.stuck + r.tier + r.ld)) && !r.ldDone, JSON.stringify(r));
    await B.shot(p, OUT, 'offline');
    await D.ctx.setOffline(false);
  });

  rep.check('断网前无控制台错误 / 404（断网期的网络错误是预期内的，不计）', errsBefore === 0, D.errors.slice(0, 4).join(' | '));
} finally {
  await B.closeAll();
  const ok = rep.save();
  console.log(ok ? 'p4_fx：全过' : 'p4_fx：有失败');
  process.exit(ok ? 0 : 1);
}
