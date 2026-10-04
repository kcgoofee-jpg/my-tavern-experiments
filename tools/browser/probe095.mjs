// v0.9.5 性能 P1：线路测速。脚本从「CDN」地址加载（两个 CDN 域名都路由到本地文件），看：测速请求是 data/maps.json?probe=<时间戳>（2026-09-29 重做后按 字节/毫秒 打分，
// 不再是 build.json 赛跑、也不再取消慢的那条）；分高的线路胜出；24 小时内再打开不重测；手动选的线路优先。
// 用法：node tools/browser/probe095.mjs <输出目录>
import * as B from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { openHost } from './host_stub.mjs';
const OUT = process.argv[2]; if (!OUT) { console.log('用法：node tools/browser/probe095.mjs <输出目录>'); process.exit(2); }
B.quietWait(); const srv = await B.ensureServer(); const rep = B.reporter(OUT);
const PREFIX = '/npm/eden-map-engine@0.9.7/map/';   // U-FIX-12: the lines are the npm table; the base carries a numeric version so the line is swappable
async function run(name, preset) {
  const P = await B.newPage(preset, { tier: 'save' });
  try {
    const seen = [], aborted = [];
    const serve = (delay) => async r => { const u = new URL(r.request().url()); if (/maps\.json/.test(u.pathname)) seen.push(u.host + u.pathname + (u.search ? '?' : ''));
      if (delay && /maps\.json/.test(u.pathname) && u.search.startsWith('?probe=')) await new Promise(x => setTimeout(x, delay));
      const f = path.join(B.REPO_ROOT, 'map', decodeURIComponent(u.pathname.slice(u.pathname.indexOf('/map/') + 5)));
      if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' }).catch(() => {});
      r.fulfill({ status: 200, body: fs.readFileSync(f), headers: { 'access-control-allow-origin': '*', 'content-type': f.endsWith('.js') || f.endsWith('.mjs') ? 'text/javascript' : f.endsWith('.json') ? 'application/json' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' } }).catch(() => aborted.push(u.host)); };
    await P.ctx.route('https://cdn.jsdelivr.net/**', serve(0));
    await P.ctx.route('https://unpkg.com/**', serve(0));
    await P.ctx.route('https://registry.npmmirror.com/**', serve(1500));   // U-FIX-12: the slow line is now npmmirror (npm-cn), not the gh mirror
    P.page.on('requestfailed', q => { if (/build\.json/.test(q.url())) aborted.push(new URL(q.url()).host); });
    await openHost(P, { msgs: [], stat: {}, chat: 'p95-' + name, scriptBase: 'https://cdn.jsdelivr.net' + PREFIX });
    await B.wait(6000);
    const ls = await P.page.evaluate(() => ({ line: localStorage.getItem('edenMapLine'), at: +localStorage.getItem('edenMapLineAt') }));
    const probes = seen.filter(s => /maps\.json\?/.test(s)), mapsProbe = seen.filter(s => /maps\.json/.test(s));
    rep.check(`${name} 测速取 maps.json?probe=（带时间戳），两条线路都测`, probes.length >= 2 && probes.some(s => s.startsWith('cdn.jsdelivr.net')) && probes.some(s => s.startsWith('registry.npmmirror.com')), JSON.stringify({ probes, mapsProbe: mapsProbe.length }));
    rep.check(`${name} 分高的胜出（jsDelivr，镜像被人为拖慢 1.5 s）`, ls.line === 'npm-js' && ls.at > 0, JSON.stringify({ ls, aborted }));
    seen.length = 0; await P.page.reload(); await P.page.waitForSelector('#eden-map-root .em-fab'); await B.wait(5000);
    rep.check(`${name} 24 小时内再打开：不重测`, !seen.some(s => /maps\.json\?probe=/.test(s))   /* 只看测速请求（maps.json?probe=；build.json?t= 是关于 / 检查更新，不算测速） */, JSON.stringify(seen));
    await P.page.evaluate(() => { localStorage.setItem('edenMapLine', 'npm-js'); localStorage.setItem('edenMapLineManual', '1'); localStorage.removeItem('edenMapLineAt'); });
    seen.length = 0; await P.page.reload(); await P.page.waitForSelector('#eden-map-root .em-fab'); await B.wait(5000);
    rep.check(`${name} 手动选过：不测、不改`, !seen.some(s => /maps\.json\?probe=/.test(s))   /* 只看测速请求（maps.json?probe=；build.json?t= 是关于 / 检查更新，不算测速） */ && (await P.page.evaluate(() => localStorage.getItem('edenMapLine'))) === 'npm-js', JSON.stringify(seen));
  } catch (e) { rep.check(`${name} 运行`, false, e.message.split('\n')[0]); }
  finally { await P.close(); }
}
try { await run('desk', 'desktop'); await run('deskwk', 'desktopWk'); }
finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
