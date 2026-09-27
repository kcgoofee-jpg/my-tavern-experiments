// v0.9.5 开场自检卡：第一次（这一版）打开聊天时出现；自检逐项打勾；后台加载没完进度不到 100；超时写「后台继续加载」；「开始」打开地图；设置 / EdenMap.selfcheck({show:true}) 可再开；两种主题。
// 用法：node tools/browser/splash095.mjs <输出目录> [--shots docs/reviews/custom_095/shots]
import * as B from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { openHost } from './host_stub.mjs';
const OUT = process.argv[2]; if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/splash095.mjs <输出目录>'); process.exit(2); }
const si = process.argv.indexOf('--shots'), SHOTS = si > 0 ? path.resolve(process.argv[si + 1]) : null;
B.quietWait(); const srv = await B.ensureServer(); const rep = B.reporter(OUT);
const jpg = async (page, name) => { await B.shot(page, OUT, name); if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.jpg'), type: 'jpeg', quality: 72, scale: 'css' }); };
async function run(name, preset, scheme = 'dark') {
  const P = await B.newPage(preset, { tier: 'std', scheme });
  try {
    await P.ctx.addInitScript(() => { if (window.top === window) window.__edenSplashCap = 8; });
    // 云图故意慢 20 秒：看进度卡在 100 以下
    await P.page.route('**/art/clouds/puff1.png', async r => { await new Promise(x => setTimeout(x, 20000)); r.continue().catch(() => {}); });
    const H = await openHost(P, { here: '天城·中层·天城执法局总局', msgs: [], stat: {}, chat: 's95-' + name, splash: true });
    const p = P.page;
    await p.waitForSelector('#eden-map-root .em-splash', { timeout: 15000 });
    await B.wait(3500);
    const s1 = await p.evaluate(() => { const e = document.querySelector('#eden-map-root .em-splash'); return { t: e.querySelector('h2').textContent, n: e.querySelectorAll('li.on').length, pc: +e.querySelector('.pb').getAttribute('aria-valuenow'), st: e.querySelector('.st').textContent, lean: e.querySelectorAll('ul.tk li.skip').length }; });
    rep.check(`${name} 第一次打开聊天：开场卡出现，自检逐项打勾，进度 < 100`, /伊甸地图/.test(s1.t) && s1.n >= 5 && s1.pc > 20 && (s1.lean ? s1.pc <= 100 : s1.pc < 100), JSON.stringify(s1));
    await jpg(p, `sp_${name}_${scheme}`);
    await B.wait(6000);
    const s2 = await p.evaluate(() => { const e = document.querySelector('#eden-map-root .em-splash'); return { pc: +e.querySelector('.pb').getAttribute('aria-valuenow'), st: e.querySelector('.st').textContent }; });
    rep.check(`${name} 超过上限秒数：到 100 并写「后台继续加载」（省流时加载项少，可能已全部就绪）`, s2.pc === 100 && /后台继续加载|全部就绪/.test(s2.st), JSON.stringify(s2));
    const chat = await p.evaluate(() => { const r = document.querySelector('#eden-map-root .em-splash').getBoundingClientRect(); const e = document.elementFromPoint(40, 40); return { w: r.width, top: e && !e.closest('#eden-map-root') }; });
    rep.check(`${name} 不挡聊天（左上角仍是宿主页）`, chat.top, JSON.stringify(chat));
    await p.evaluate(() => document.querySelector('#eden-map-root .em-splash .go').click()); await B.wait(2500);
    const opened = await p.evaluate(() => ({ gone: !document.querySelector('#eden-map-root .em-splash'), panel: !document.querySelector('#eden-map-root .em-panel').hidden }));
    rep.check(`${name} 「开始」：关卡、打开地图`, opened.gone && opened.panel, JSON.stringify(opened));
    const again = await p.evaluate(async () => { await window.EdenMap.selfcheck({ show: true }); await new Promise(r => setTimeout(r, 400)); return !!document.querySelector('#eden-map-root .em-splash'); });
    await p.evaluate(() => document.querySelector('#eden-map-root .em-splash .x').click());
    const vf = await H.viewer(); await vf.evaluate(() => { showSet(true); document.querySelector('#splashAgain').click(); }); await B.wait(600);
    const again2 = await p.evaluate(() => !!document.querySelector('#eden-map-root .em-splash'));
    rep.check(`${name} EdenMap.selfcheck({show:true}) 与设置「重新显示开场自检」都能再开`, again && again2);
    const seen = await p.evaluate(() => localStorage.getItem('edenMapSplashSeen'));
    rep.check(`${name} 记下本版已显示（下次安静）`, !!seen, seen);
    rep.check(`${name} 无脚本错误`, !P.errors.filter(e => !/http 404/.test(e)).length, P.errors.slice(0, 3).join(' | '));
  } catch (e) { rep.check(`${name} 运行`, false, e.message.split('\n')[0]); }
  finally { await P.close(); }
}
try { await run('desk', 'desktop'); if (!process.env.ONE) { await run('desk', 'desktop', 'light'); await run('deskwk', 'desktopWk'); await run('phone', 'phone'); await run('iphone', 'iphone', 'light'); } }
finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
