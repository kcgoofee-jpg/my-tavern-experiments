// v0.9.5 行程：途中地点（「A至B的…」）→ 标题栏「A → B（途中）」、地图上两端之间的虚线弧 + 中点的玩家点；终点认不出时起点画「前往 B」。
// 用法：node tools/browser/trips095.mjs <输出目录> [--shots docs/reviews/custom_095/shots]
import * as B from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { openHost } from './host_stub.mjs';
const OUT = process.argv[2]; if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/trips095.mjs <输出目录>'); process.exit(2); }
const si = process.argv.indexOf('--shots'), SHOTS = si > 0 ? path.resolve(process.argv[si + 1]) : null;
B.quietWait(); const srv = await B.ensureServer(); const rep = B.reporter(OUT);
const jpg = async (page, name) => { await B.shot(page, OUT, name); if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.jpg'), type: 'jpeg', quality: 72, scale: 'css' }); };
const errs = P => P.errors.filter(e => !/http 404/.test(e));
const HERE = '天城上层·罗斯柴尔德岛至伊甸庄园的私人载具舱内';
async function run(name, preset) {
  const P = await B.newPage(preset, { tier: 'save' });
  try {
    const H = await openHost(P, { here: HERE, msgs: [], stat: {}, chat: 't95-' + name });
    const p = P.page; await B.wait(1500);
    const chip = await p.evaluate(() => document.querySelector('#eden-map-root .em-here .em-nm')?.textContent);
    rep.check(`${name} 标题栏：「罗斯柴尔德岛 → 伊甸庄园（途中）」`, chip === '罗斯柴尔德岛 → 伊甸庄园（途中）', chip);
    await H.open(); const vf = await H.viewer(); await B.wait(1500);
    await vf.evaluate(() => ViewerDebug.jumpHere(document.getElementById('here').value)); await B.wait(2500);   // 用户 2026-09-28：打开总是先世界图，跳到当前地点要点「当前位置」
    const d = await vf.evaluate(() => ({ cur: ViewerDebug.currentMapId, arc: document.querySelectorAll('svg.trip.transit').length, you: document.querySelectorAll('.tripin.you').length }));
    rep.check(`${name} 「当前位置」落到上层，两端之间一条虚线弧 + 玩家点`, d.cur === 'tc_upper' && d.arc === 1 && d.you === 1, JSON.stringify(d));
    await jpg(p, `tr_${name}_transit`);
    await vf.evaluate(() => { document.querySelector('.tripin.you')._open(); }); await B.wait(300);
    const c = await vf.evaluate(() => document.querySelector('#card').hidden ? '' : document.querySelector('#card h2').textContent);
    rep.check(`${name} 点玩家点：卡片写「A → B（途中）」和交通工具`, /→ 伊甸庄园（途中）/.test(c), c);
    // 终点认不出：起点画「前往 …」
    await vf.evaluate(() => { ViewerDebug.closeCard(); document.getElementById('here').value = '天城·中层·天城执法局总局前往某个没写过的地方'; ViewerDebug.go('tc_mid'); }); await B.wait(2500);
    const e = await vf.evaluate(() => ({ arc: document.querySelectorAll('svg.trip').length, lab: document.querySelector('.tripin.edge b')?.textContent }));
    rep.check(`${name} 终点认不出：起点「前往 …」，不画弧`, e.arc === 0 && /^前往 /.test(e.lab || ''), JSON.stringify(e));
    // 最近的行程：原文里的 JSONPatch（MVU 那一楼拿不到地点时）+ 人物标签
    const JP = pl => `<UpdateVariable><JSONPatch>[{"op":"replace","path":"/世界/当前地点","value":"${pl}"}]</JSONPatch></UpdateVariable>`;
    await H.setMsgs([{ message_id: 10, message: JP('天城·中层·天城执法局总局') + '<span style="display:none">⌖人物 甲 @ 中层·天城执法局总局</span>' },
      { message_id: 12, message: '坐悬浮车离开。' + JP('天城·中层·辉光大教堂') + '<span style="display:none">⌖人物 甲 @ 中层·辉光大教堂</span>' }], { 世界: { 当前地点: '' } });
    await p.evaluate(() => { window.__stub.here = ''; window.__fire('r'); }); await B.wait(1200);
    await vf.evaluate(() => { document.getElementById('here').value = ''; ViewerDebug.closeCard(); ViewerDebug.go('tc_mid'); }); await B.wait(2500);
    const v = await H.vars(), tv = await vf.evaluate(() => ({ items: TripsView.items, me: document.querySelectorAll('svg.trip.hist.m-air:not(.ch)').length, ch: document.querySelectorAll('svg.trip.hist.ch').length }));
    rep.check(`${name} 行程：玩家一段（悬浮车 → 空中虚线弧）+ 人物一段（细线），存进聊天变量 eden_map.行程`, tv.me === 1 && tv.ch === 1 && v?.eden_map?.行程?.length === 2 && !('stat_data' in v), JSON.stringify({ tv, n: v?.eden_map?.行程?.length }));
    await jpg(p, `tr_${name}_history`);
    const card = await vf.evaluate(() => { document.querySelector('.tripin.hit')._open(); return document.querySelector('#card .sub').textContent; });
    rep.check(`${name} 点一段行程：卡片写楼层与方式`, /第 1[02] 楼/.test(card) && /空中|方式未知/.test(card), card);
    await vf.evaluate(() => { ViewerDebug.closeCard(); document.querySelector('#tgTripsBox').click(); }); await B.wait(200);
    const off = await vf.evaluate(() => document.querySelectorAll('svg.trip.hist').length);
    await vf.evaluate(() => document.querySelector('#tgTripsBox').click());
    rep.check(`${name} 图层菜单「行程」关掉即隐藏（默认开）`, off === 0);
    rep.check(`${name} 无脚本错误`, !errs(P).length, errs(P).slice(0, 3).join(' | '));
  } catch (e) { rep.check(`${name} 运行`, false, e.message.split('\n')[0]); }
  finally { await P.close(); }
}
try { await run('desk', 'desktop'); if (!process.env.ONE) { await run('deskwk', 'desktopWk'); await run('phone', 'phone'); await run('iphone', 'iphone'); } }
finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
