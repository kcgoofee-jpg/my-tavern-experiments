// E7：卡内脚本（map/tavern/eden-map.js）在模拟酒馆宿主页里的单手联动（悬浮按钮、面板关闭按钮跟着惯用手走）。
// 用法：EDEN_PORT=5187 node tools/browser/e7_host.mjs <输出目录> [--shots docs/drafts]
// 宿主页 = 一个 375 × 812 的页面 + 一个隐藏的「卡片」iframe（里面桩出酒馆助手的全局函数，再 import eden-map.js）；脚本把悬浮按钮和面板注入宿主页。
import * as B from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/e7_host.mjs <输出目录> [--shots docs/drafts]'); process.exit(2); }
const si = process.argv.indexOf('--shots'), SHOTS = si > 0 ? path.resolve(process.argv[si + 1]) : null;
B.quietWait();
const srv = await B.ensureServer();
const rep = B.reporter(OUT);
const STUB = `<script>
  window.Mvu = { getMvuData: () => ({ stat_data: { 世界: { 当前地点: '天城中层·霓虹街' } } }), events: { VARIABLE_UPDATE_ENDED: 'v' } };
  window._ = { get: (o, p, d) => p.split('.').reduce((a, k) => a?.[k], o) ?? d };
  window.SillyTavern = { getContext: () => ({ name1: '玩家', chatId: 'e7' }) };
  window.tavern_events = { CHAT_CHANGED: 'c', MESSAGE_SWIPED: 's', MESSAGE_RECEIVED: 'r' };
  window.eventOn = () => {}; window.waitGlobalInitialized = async () => {}; window.injectPrompts = () => {}; window.uninjectPrompts = () => {};
  window.getLastMessageId = () => 3; window.getChatMessages = () => [{ message_id: 3, message: '⌖火灾｜中层·霓虹街｜2｜仓库起火' }];
<\/script><script type="module" src="${B.BASE}tavern/eden-map.js"><\/script>`;
const HOST = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0;background:#2a2a2a;height:100vh;color:#aaa;font:14px sans-serif"><p style="padding:12px">酒馆宿主页（模拟）</p>
<iframe id=card style="display:none" srcdoc="${STUB.replace(/[^\x00-\x7f]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")).replace(/"/g, "&quot;")}"></iframe></body>`;   // 桩里的中文转成 \uXXXX：WebKit 的 srcdoc 内联脚本会按 Latin-1 解错
const jpg = async (page, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const f = path.join(SHOTS, `ui_e7_${name}.jpg`);
  await page.screenshot({ path: f, type: 'jpeg', quality: 70, scale: 'css' }); console.log('  截图', path.relative(process.cwd(), f), (fs.statSync(f).size / 1024).toFixed(0) + ' KB'); };
const fabBox = page => page.evaluate(() => { const r = document.querySelector('#eden-map-root .em-fab').getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; });

try {
  for (const preset of ['phone', 'iphone']) {
    const P = await B.newPage(preset, { tier: 'save', init: [() => { try { if (!sessionStorage.getItem('__h')) { sessionStorage.setItem('__h', '1'); localStorage.clear(); localStorage.setItem('edenMapHand', 'left'); localStorage.setItem('edenMapLine', 'vpn'); localStorage.setItem('edenMapSplashSeen', 'dev'); localStorage.setItem('edenMapHint', '1'); } } catch (e) {} }] });   // 开场自检卡（v0.9.5，每版一次）与上手提示横幅（v2 P1，2026-09-29 起四条更长）都盖在面板上会吃掉点击：与 host_stub 一样预先标记已看过
    const p = P.page, W = p.viewportSize().width;
    await p.route(B.BASE + '__e7host.html', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: HOST }));
    await p.goto(B.BASE + '__e7host.html'); await p.waitForSelector('#eden-map-root .em-fab', { timeout: 15000 });
    const f0 = await fabBox(p);
    rep.check(`${preset} 左手：悬浮按钮默认在左下`, f0.cx < W / 2 && f0.cy > 812 * .6, `中心 (${Math.round(f0.cx)}, ${Math.round(f0.cy)})`);
    await jpg(p, `${preset}_host_left_fab`);
    await p.locator('#eden-map-root .em-fab').click();
    await p.waitForFunction(() => { const f = document.querySelector('#eden-map-root .em-frame'); try { return f?.contentDocument?.getElementById("loading")?.classList.contains("done"); } catch (e) { return false; } }, null, { timeout: 30000 }).catch(() => {});
    await B.wait(1500);
    const closeLeft = await p.evaluate(() => { const r = document.querySelector('#eden-map-root .em-close').getBoundingClientRect(); return r.left + r.width / 2 < innerWidth / 2; });
    rep.check(`${preset} 左手：面板标题栏的关闭按钮在左上`, closeLeft);
    await jpg(p, `${preset}_host_left_panel`);
    // 地图里改成右手：悬浮按钮挪到右边
    const vf = await (await p.$('#eden-map-root .em-frame')).contentFrame();
    await vf.evaluate(() => { showSet(true); document.querySelector('#handSeg button[data-hand="right"]').click(); showSet(false); });
    await B.wait(400);
    await vf.evaluate(() => closeCard());   // 打开时飞到新事态会开卡片，卡片抽屉开着时停靠栏让位
    await vf.locator('#thumbBtn').click(); await B.wait(300);
    const hasClose = await vf.evaluate(() => !document.querySelector('#actClose').hidden);
    await vf.locator('#actClose').click(); await B.wait(500);
    const st = await p.evaluate(() => ({ hidden: document.querySelector('#eden-map-root .em-panel').hidden, pos: localStorage.getItem('edenMapFabPos') }));
    rep.check(`${preset} 地图抽屉「关闭地图」关掉面板`, hasClose && st.hidden, JSON.stringify(st));
    const f1 = await fabBox(p);
    rep.check(`${preset} 改成右手后悬浮按钮挪到右边（高度不变）`, f1.cx > W / 2 && Math.abs(f1.cy - f0.cy) < 4, `中心 (${Math.round(f1.cx)}, ${Math.round(f1.cy)})`);
    await jpg(p, `${preset}_host_right_fab`);
    rep.check(`${preset} 无脚本错误`, !P.errors.filter(e => !/http 404/.test(e)).length, P.errors.slice(0, 3).join(' | '));
    await P.close(); await B.closeAll();
  }
} finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
