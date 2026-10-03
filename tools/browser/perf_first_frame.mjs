// PERF-BUNDLE：地图首帧时间（Q-33）。冷 / 热各跑 N 次，报中位数与范围，外加请求数与字节数。
//
// 「首帧」= 查看器的加载层拿到 done（与 tools/browser/boot_watchdog.mjs 同一个判据）：那是底图第一张瓦片
// 上屏的时刻。计时从点悬浮按钮开始，不含聊天页自己的加载。
// 冷 = 每次一个全新的浏览器上下文（没有 HTTP 缓存）；热 = 同一个上下文里重新开面板。
// 本机服务是 tools/cors_server.py（localhost），所以这里的绝对值**比真实 CDN 小得多**：每个请求的 DNS +
// TLS + 连接建立都省掉了。请求数与字节数才是能搬走的那个量。
//
// 用法：node tools/browser/perf_first_frame.mjs [输出目录] [--runs=3] [--label=xxx]
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const OUT = argv.find(a => !a.startsWith('--')) || '/tmp/perf_first_frame';
const RUNS = Number((argv.find(a => a.startsWith('--runs=')) || '--runs=3').split('=')[1]) || 3;
const LABEL = (argv.find(a => a.startsWith('--label=')) || '--label=run').split('=')[1] || 'run';
// 人为给本机请求加的往返延迟（毫秒）。localhost 上每个请求几乎不要钱，于是 322 次请求�� 0.5 秒测不出
// 「一次一次取」的真实代价；CDN 上每个请求要付 DNS + TCP + TLS + 往返，而且模块是逐级发现的（瀑布）。
// 加一个固定延迟把这一层补回来，前后两次跑用同一个值，差值才可搬走。默认 0 = 纯本机。
const DELAY = Number((argv.find(a => a.startsWith('--delay=')) || '--delay=0').split('=')[1]) || 0;
const CONN = Number((argv.find(a => a.startsWith('--conn=')) || '--conn=6').split('=')[1]) || 0;

const med = a => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2); };
const rng = a => `${med(a)}（${Math.min(...a)}–${Math.max(...a)}）`;
const FIRST_FRAME = () => {
  const f = document.querySelector('#eden-map-root .em-frame');
  try { return !!f?.contentDocument?.getElementById('loading')?.classList.contains('done'); } catch (e) { return false; }
};
const HERE = { here: '天城中层·霓虹街', msgs: [{ message_id: 3, message: '⌖火灾｜中层·霓虹街｜2｜仓库起火' }] };

B.quietWait();
const srv = await B.ensureServer();
const rows = [];
try {
  for (const preset of ['desktop', 'desktopWk']) {
    for (const mode of ['cold', 'warm']) {
      const times = [], problems = [];
      let net = { n: 0, bytes: 0 };
      for (let i = 0; i < RUNS; i++) {
        const P = await B.newPage(preset, { tier: 'save', init: [() => { try { if (!sessionStorage.getItem('__pf')) { sessionStorage.setItem('__pf', '1'); localStorage.clear(); localStorage.setItem('edenMapSplashSeen', 'dev'); localStorage.setItem('edenMapHint', '1'); } } catch (e) {} }] });
        const p = P.page;
        const seen = new Map();
        // 人为补上「一个域名同时只有 6 个连接」：HTTP/1.1 下浏览器就是按这个数并发的（6 条/host），
        // 而 Playwright 的 route 拦截不走这条限制，不加它的话几百个请求会一起飞出去，延迟被摊平，
        // 于是「少发 80 个请求」在墙上，看不出来。CONN 可调；设 0 = 不限连接（纯本机行为）。
        if (DELAY) {
          let inFlight = 0; const waiters = [];
          await p.route(B.BASE + '**', async r => {
            if (CONN) { if (inFlight >= CONN) await new Promise(res => waiters.push(res)); inFlight++; }
            await B.wait(DELAY);
            try { await r.continue(); } finally { inFlight--; const w = waiters.shift(); if (w) w(); }
          });
        }
        p.on('request', r => { if (r.url().startsWith(B.BASE)) seen.set(r.url(), 0); });
        p.on('response', async r => { const h = r.headers()['content-length']; if (seen.has(r.url()) && h) seen.set(r.url(), Number(h)); });
        if (mode === 'warm') {                       // 先跑一次把缓存捂热，同一个上下文里再计时
          const H0 = await openHost(P, HERE);
          await p.locator('#eden-map-root .em-fab').click();
          await p.waitForFunction(`(${FIRST_FRAME})()`, null, { timeout: 90000 }).catch(() => false);
          await p.evaluate(() => document.querySelector('#eden-map-root .em-fab')?.click());
          await B.wait(700);
        }
        seen.clear();
        const H = await openHost(P, HERE);
        await p.locator('#eden-map-root .em-fab').click();
        const t0 = Date.now();
        const ok = await p.waitForFunction(`(${FIRST_FRAME})()`, null, { timeout: 90000 }).then(() => true).catch(() => false);
        const ms = Date.now() - t0;
        if (mode === 'cold') net = { n: seen.size, bytes: [...seen.values()].reduce((a, b) => a + b, 0) };
        if (ok) times.push(ms); else problems.push(`第 ${i + 1} 次没到首帧`);
        problems.push(...P.errors.filter(e => /pageerror|console error/.test(e)).slice(0, 2));
        await P.close();
      }
      rows.push({ preset, mode, times, net, problems });
      const flag = times.length === RUNS && !problems.length ? '✓' : '✗';
      console.log(`${flag} ${preset.padEnd(10)} ${mode.padEnd(5)} ${times.length ? rng(times) + ' ms' : '无数据'}  n=${RUNS}  delay=${DELAY}ms conn=${CONN || '∞'}` +
        (mode === 'cold' ? `  请求 ${net.n} 个 / ${(net.bytes / 1024).toFixed(0)} KB` : '') +
        (problems.length ? `\n    ${problems.join('\n    ')}` : ''));
    }
  }
} catch (e) {
  console.log('✗ 探针跑完前抛错：' + String(e).slice(0, 300));
}
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/${LABEL}.json`, JSON.stringify({ label: LABEL, runs: RUNS, rows }, null, 2));
srv.stop();
await B.closeAll();
process.exit(0);
