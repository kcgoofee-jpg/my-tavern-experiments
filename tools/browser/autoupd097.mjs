// v0.9.7 自动检查更新 / 强制更新 / 本机存储提示：模拟 jsDelivr 上有更新的正式版（路由拦截，不联网）。
// 用法：EDEN_PORT=5391 node tools/browser/autoupd097.mjs [输出目录]
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';
const OUT = process.argv[2] || '/tmp/autoupd097';
B.quietWait(); const srv = await B.ensureServer(); const rep = B.reporter(OUT);
const q = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? { text: e.innerText, role: e.getAttribute('role') } : null; }, sel);

async function page({ latest = 'map-v9.9.9', build = { version: '9.9.9', code: 'S1-9909-R-0001' }, channel = 'follow', ls = null, delay = 300 } = {}) {
  const P = await B.newPage('desktop', { tier: 'save' }), hits = { api: 0, build: 0 };
  await P.ctx.addInitScript(([ch, d]) => { if (window.top === window) { window.__edenMapScript = { channel: ch, ref: 'cloud/test' }; window.__autoCheckDelay = d; } }, [channel, delay]);
  await P.ctx.route('https://data.jsdelivr.com/**', r => { hits.api++; r.fulfill({ contentType: 'application/json', body: JSON.stringify({ versions: [{ version: 'map-v0.9.5' }, { version: latest }] }) }); });
  await P.ctx.route(/\/gh\/.*@map-.*\/map\/data\/build\.json/, r => { hits.build++; r.fulfill({ contentType: 'application/json', body: JSON.stringify(build) }); });
  const H = await openHost(P, { here: '天城·中层·辉光大教堂', ls, chat: 'upd097' });
  return { P, p: P.page, H, hits };
}
// 1 有新版：弹提示（跟随分支 → 刷新），说明链接指向新标签；「此版本不再提示」后刷新不再弹
{
  const { P, p, hits } = await page();
  await p.waitForSelector('#eden-map-root .em-upd', { timeout: 15000 }).catch(() => {});
  const t = await q(p, '#eden-map-root .em-upd');
  rep.check('new_prompt', !!t && /地图有新版 v9\.9\.9/.test(t.text) && /刷新/.test(t.text) && /稍后/.test(t.text) && /此版本不再提示/.test(t.text), JSON.stringify(t));
  const href = await p.evaluate(() => document.querySelector('#eden-map-root .em-upd a')?.href);
  rep.check('notes_link', /blob\/map-v9\.9\.9\/CHANGELOG\.md$/.test(href || ''), href);
  rep.check('one_fetch', hits.api === 1, JSON.stringify(hits));
  await B.shot(p, OUT, 'upd_prompt');
  await p.click('#eden-map-root .em-upd .em-skip');
  const skip = await p.evaluate(() => ({ el: !!document.querySelector('#eden-map-root .em-upd'), ls: localStorage.getItem('edenMapUpdSkip') }));
  rep.check('skip_version', !skip.el && skip.ls === '9.9.9', JSON.stringify(skip));
  await p.reload(); await p.waitForSelector('#eden-map-root .em-fab'); await B.wait(2500);
  rep.check('skip_persists_realtime', !(await q(p, '#eden-map-root .em-upd')) && hits.api === 2, JSON.stringify(hits));   // 实时：每次加载都查（不再 6 小时节流），跳过的版本不再弹
  await p.evaluate(() => { window.__edenMapCheckAt = 0; }); await p.click('#eden-map-root .em-fab'); await B.wait(5000);
  rep.check('check_on_open', hits.api === 3, JSON.stringify(hits));
  await P.ctx.close();
}
// 2 面板开着不弹，关上再弹；「稍后」只关这一次；钉版本文案 = 重新导入
{
  const { P, p, H } = await page({ channel: 'tag', delay: 2500 });
  await H.open();
  await B.wait(2500);
  rep.check('defer_while_panel_open', !(await q(p, '#eden-map-root .em-upd')));
  await p.click('#eden-map-root .em-close'); await B.wait(1200);
  const t = await q(p, '#eden-map-root .em-upd');
  rep.check('shows_after_close', !!t && /重新导入新版脚本「【地图】伊甸地图 v9\.9\.9」/.test(t.text), JSON.stringify(t));
  await p.click('#eden-map-root .em-upd .em-later');
  rep.check('later_closes', !(await q(p, '#eden-map-root .em-upd')));
  await P.ctx.close();
}
// 2b 正式版加载器（channel latest）：文案 = 刷新即可；锁定时 = 去解锁
{
  const { P, p } = await page({ channel: 'latest' });
  await p.waitForSelector('#eden-map-root .em-upd', { timeout: 15000 }).catch(() => {});
  const t = await q(p, '#eden-map-root .em-upd');
  rep.check('latest_loader_text', !!t && /脚本每次加载最新正式版/.test(t.text), JSON.stringify(t));
  await P.ctx.close();
}
// 3 强制更新：min_version 高于当前 → 红框、role=alert、没有「此版本不再提示」；本次关闭后刷新再弹
{
  const { P, p } = await page({ latest: 'map-s2-v0.1.0', build: { version: '0.1.0', code: 'S2-0100-R-0001', min_version: 'S2:0.1.0', force_reason: '旧版读不了新数据格式' } });
  await p.waitForSelector('#eden-map-root .em-force', { timeout: 15000 }).catch(() => {});
  let t = await q(p, '#eden-map-root .em-force');
  rep.check('force_prompt', !!t && t.role === 'alertdialog' && /* UI v2：P0 阻断卡 */  /已停止支持/.test(t.text) && /旧版读不了新数据格式/.test(t.text) && /本次关闭/.test(t.text) && !/此版本不再提示/.test(t.text), JSON.stringify(t));
  const href = await p.evaluate(() => document.querySelector('#eden-map-root .em-force a')?.href);
  rep.check('force_series_tag', /blob\/map-s2-v0\.1\.0\//.test(href || ''), href);
  await B.shot(p, OUT, 'force_prompt');
  await p.click('#eden-map-root .em-force .em-later'); await B.wait(300);
  rep.check('force_close_session', !(await q(p, '#eden-map-root .em-force')));
  await p.reload(); await p.waitForSelector('#eden-map-root .em-fab'); await p.waitForSelector('#eden-map-root .em-force', { timeout: 10000 }).catch(() => {});
  rep.check('force_reappears_next_load', !!(await q(p, '#eden-map-root .em-force')));
  await P.ctx.close();
}
// 4 设置关掉「自动检查更新」→ 不联网、不弹；本地脚本（没有版本信息）也不查
{
  const { P, p, hits } = await page({ ls: { edenMapAutoCheck: '0' } }); await B.wait(3000);
  rep.check('toggle_off_no_fetch', hits.api === 0 && !(await q(p, '#eden-map-root .em-upd')), JSON.stringify(hits));
  await P.ctx.close();
  const b = await page({ channel: undefined }); await b.p.evaluate(() => { delete window.__edenMapScript; }); await B.wait(3000);
  await b.P.ctx.close();
}
// 5 设置里的开关（地图「关于」），默认开，切换写 edenMapAutoCheck
{
  const { P, p, H } = await page({ ls: { edenMapUpdSkip: '9.9.9' } });
  await H.open(); const vf = await H.viewer();
  const sw = await vf.evaluate(() => { ViewerDebug.renderAbout(); const c = document.getElementById('optAutoCheck'); if (!c) return null; const was = c.checked; c.click(); return { was, ls: localStorage.getItem('edenMapAutoCheck') }; });
  rep.check('setting_toggle', sw && sw.was === true && sw.ls === '0', JSON.stringify(sw));
  await P.ctx.close();
}
// 6 本机存储：头像超上限 → 宿主提示条告诉用户（面板关着）
{
  const { P, p } = await page({ ls: { edenMapUpdSkip: '9.9.9' } }); await B.wait(1500);
  const r = await p.evaluate(async () => { const img = 'data:image/png;base64,' + 'A'.repeat(200); const out = [];
    for (let i = 0; i < 25; i++) out.push(await window.EdenMap.setAvatar('人' + i, img)); return { last: out[24], ok: out.filter(Boolean).length, st: await window.EdenMap.storage() }; });
  await B.wait(300); const t = await q(p, '#eden-map-root .em-ctoast:not(.em-upd)');
  rep.check('avatar_cap_warns', r.last === false && r.ok === 24 && !!t && /头像已达上限/.test(t.text), JSON.stringify({ ...r, st: r.st && { ours: r.st.ours, avatars: r.st.avatars }, t }));
  await P.ctx.close();
}
// 跟随分支（2026-09-28 起走 head.json 链）：GitHub 不通、jsDelivr 解析接口 null，jsdmirror 分支路径的 head.json 构建号更大 → 「有更新，刷新载入」；同构建不提示
for (const [build, want] of [[81, true], [80, false]]) {
  const P = await B.newPage('desktop', { tier: 'save' });
  await P.ctx.addInitScript(() => { if (window.top === window) { window.__edenMapScript = { channel: 'follow', ref: 'cloud/test', sha: 'aaaaaaaaaaaa', build: 80, source: 'jsdmirror' }; window.__autoCheckDelay = 999999; } });
  await P.ctx.route('https://api.github.com/**', r => r.abort());
  await P.ctx.route('https://raw.githubusercontent.com/**', r => r.abort());
  await P.ctx.route('https://data.jsdelivr.com/**', r => r.fulfill({ contentType: 'application/json', body: '{"versions":[],"version":null}' }));
  await P.ctx.route(/\/gh\/[^@]+@cloud\/test\/map\/data\/head\.json/, r => r.request().url().includes('jsdmirror') ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ build, sha: 'b'.repeat(40) }) }) : r.abort());
  const H = await openHost(P, { here: '天城·中层·辉光大教堂', chat: 'fol' + want }); await H.open();
  if (want) await P.page.waitForSelector('#eden-map-root .em-follow', { timeout: 15000 }).catch(() => {}); else await B.wait(8000);
  const t = await q(P.page, '#eden-map-root .em-follow');
  rep.check(`follow_${want ? 'newer' : 'same'}`, want ? !!t && /有更新，刷新载入/.test(t.text) && /#81/.test(t.text) : !t, JSON.stringify(t));
  if (want) await B.shot(P.page, OUT, 'follow_notice');
  // 「检查更新」同一条链：回 update-result { follow, build, source }
  const r = await P.page.evaluate(() => new Promise(res => { const f = document.querySelector('#eden-map-root iframe'); const on = e => { if (e.data?.type === 'eden-map:update-result') { removeEventListener('message', on); res(e.data); } };
    f.contentWindow.addEventListener('message', on); f.contentWindow.Function("parent.postMessage({ type: 'eden-map:check-update' }, '*')")(); setTimeout(() => res(null), 8000); }));
  rep.check(`follow_check_${want ? 'new' : 'latest'}`, !!r && r.follow && r.build === build && r.source === 'jsdmirror' && r.status === (want ? 'new' : 'latest'), JSON.stringify(r));
  await P.ctx.close();
}
const ok = rep.save(); await B.closeAll(); srv.stop(); process.exit(ok ? 0 : 1);
