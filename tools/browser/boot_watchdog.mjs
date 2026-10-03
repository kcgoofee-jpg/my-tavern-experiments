// F-TT（I-36）：查看器有一个子资源永远不落地时，地图要自己起来，不能 silently 停在「加载中…」。
// 现场：Mac TauriTavern 的 WKWebView 从某个 gh 镜像取 vendor/openseadragon/openseadragon.min.js 与设定包数据时，
// 镜像只回响应头不回响应体（Playwright 的 WebKit 与 Chromium 都能复现同一个现象），于是查看器文档的
// DOMContentLoaded 永不触发、启动函数不跑，一条 eden-map:boot 都没有。这里用 route 把那一个请求挂掉第一次，
// 等看门狗（tavern/viewer-boot.mjs）到点重挂之后它放行，断言地图自己起来了。
// 用法：EDEN_PORT=5187 node tools/browser/boot_watchdog.mjs <输出目录>   （CI 里跑 WebKit）
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2];
if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/boot_watchdog.mjs <输出目录>'); process.exit(2); }
B.quietWait();
const srv = await B.ensureServer();
const rep = B.reporter(OUT);
const OSD = B.BASE + 'vendor/openseadragon/openseadragon.min.js';

try {
  for (const preset of ['desktopWk', 'desktop']) {
    const P = await B.newPage(preset, { tier: 'save', init: [() => { try { if (!sessionStorage.getItem('__ftt')) { sessionStorage.setItem('__ftt', '1'); localStorage.clear(); localStorage.setItem('edenMapSplashSeen', 'dev'); localStorage.setItem('edenMapHint', '1'); localStorage.setItem('edenMapLine', 'vpn'); } } catch (e) {} }] });
    const p = P.page;
    let osdHits = 0, stalled = null;
    await p.route(OSD, async r => {   // 第一次永远不回（模拟镜像只回响应头），之后放行
      osdHits += 1;
      if (osdHits === 1) { stalled = Date.now(); return new Promise(() => {}); }
      await r.continue();
    });
    const H = await openHost(P, { here: '天城中层·霓虹街', msgs: [{ message_id: 3, message: '⌖火灾｜中层·霓虹街｜2｜仓库起火' }] });
    await p.locator('#eden-map-root .em-fab').click();
    const booted = await p.waitForFunction(() => {
      const f = document.querySelector('#eden-map-root .em-frame');
      try { return !!f?.contentDocument?.getElementById('loading')?.classList.contains('done'); } catch (e) { return false; }
    }, null, { timeout: 75000 }).then(() => true).catch(() => false);
    const ms = stalled ? Date.now() - stalled : -1;
    rep.check(`${preset} 子资源卡住后地图自己起来了`, booted, `osd 请求 ${osdHits} 次，看门狗等了 ${ms} ms`);
    rep.check(`${preset} 看门狗至少重挂过一次`, osdHits >= 2, `osd 请求 ${osdHits} 次`);
    const hint = await p.evaluate(() => document.querySelector('#eden-map-root .em-load .hint')?.textContent || '');
    rep.check(`${preset} 界面上说了正在重试 / 换线路`, /重试|换一条/.test(hint) || booted, `提示「${hint}」`);
    await P.close();
  }
} catch (e) {
  rep.check('boot_watchdog 探针跑完', false, String(e).slice(0, 200));
}
srv.stop();
process.exit(rep.save() ? 0 : 1);
