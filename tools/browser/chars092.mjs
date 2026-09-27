// v0.9.2 人物栏：模拟酒馆宿主页（host_stub.mjs，桩出酒馆助手）里验收——自动发现、页签、地图头像框、开关（按聊天记住）、飞过去、本机头像、注入摘要。
// 用法：node tools/browser/chars092.mjs <输出目录> [--shots docs/reviews/characters_092/shots]
import * as B from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2];
if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/chars092.mjs <输出目录>'); process.exit(2); }
const si = process.argv.indexOf('--shots'), SHOTS = si > 0 ? path.resolve(process.argv[si + 1]) : null;
B.quietWait();
const srv = await B.ensureServer();
const rep = B.reporter(OUT);
const HERE = '天城下层·施粥站';
const MSGS = [
  { message_id: 40, message: '<span style="display:none" data-tcmap="类型=骚乱;层=下层;地点=血肉磨坊;标题=拳场外人群推搡;等级=2;状态=发生中"></span>⌖人物 艾琳 @ 下层·7号井' },
  { message_id: 41, message: '<span style="display:none">⌖人物 雷恩 @ 下层·7号井</span> <span style="display:none">⌖人物 艾琳 @ 中层·霓虹街</span>' },
];
const STAT = { 在场人物: { 莉娜: { 身份: '向导' }, 卡尔: { 身份: '司机' } } };
const jpg = async (page, name) => { await B.shot(page, OUT, name); if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name + '.jpg'), type: 'jpeg', quality: 70, scale: 'css' }); };

async function run(name, preset) {
  const P = await B.newPage(preset, { tier: 'save' });
  try {
    const H = await openHost(P, { here: HERE, msgs: MSGS, stat: STAT, chat: 'c-' + name });
    await H.open();
    const p = P.page, vf = await H.viewer();
    await vf.evaluate(() => { closeCard(); go('tc_low'); }); await B.wait(2500);
    const s0 = await vf.evaluate(() => ({ n: TCChars.count(), names: TCChars.items.map(c => c.name + '@' + c.place + '#' + c.floor), chm: document.querySelectorAll('.chm').length, groups: [...document.querySelectorAll('.chm')].map(e => e.dataset.chars) }));
    rep.check(`${name} 自动发现 4 人（标签最新楼为准 + MVU 在场）`, s0.n === 4 && s0.names.includes('艾琳@中层·霓虹街#41'), JSON.stringify(s0.names));
    rep.check(`${name} 下层画出头像框，同处多人成一组`, s0.groups.includes('雷恩') && s0.groups.some(g => g.includes('莉娜') && g.includes('卡尔')), JSON.stringify(s0.groups));
    const shape = await vf.evaluate(() => { const a = document.querySelector('.chm .av'), e = document.querySelector('.ev i'); return { av: getComputedStyle(a).borderRadius, ev: e ? getComputedStyle(e).width : null }; });
    rep.check(`${name} 人物是圆形头像框（与事态方块不同）`, shape.av === '50%', JSON.stringify(shape));
    const ov = await vf.evaluate(() => { const r = [...document.querySelectorAll('.chm .av, .ev i')].map(x => x.getBoundingClientRect()); let n = 0;
      for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const a = r[i], b = r[j]; if (a.width && b.width && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4 && a.left !== b.left) { const same = false; n += same ? 0 : 1; } } return n; });
    rep.metric(name + '_icon_overlap', ov);
    // 页签
    await vf.evaluate(() => document.querySelector('#evbar .chtab').click()); await B.wait(300);
    const pane = await vf.evaluate(() => ({ tab: document.querySelector('#evbar').dataset.tab, rows: document.querySelectorAll('#evbar .chpane li').length, evListHidden: getComputedStyle(document.querySelector('#evbar ol')).display === 'none' }));
    rep.check(`${name} 「人物」页签：同一横条、4 行、事态列表收起`, pane.tab === 'ch' && pane.rows === 4 && pane.evListHidden, JSON.stringify(pane));
    await jpg(p, `chars_${name}_pane`);
    // 逐人开关
    await vf.evaluate(() => { const i = document.querySelector('#evbar .chpane input[data-n="雷恩"]'); i.checked = false; i.dispatchEvent(new Event('change', { bubbles: true })); }); await B.wait(400);
    const off1 = await vf.evaluate(() => ![...document.querySelectorAll('.chm')].some(e => e.dataset.chars.split('|').includes('雷恩')));
    rep.check(`${name} 逐人关掉后地图上不再显示`, off1);
    // 总开关 + 按聊天记住
    await vf.evaluate(() => { const i = document.querySelector('#evbar .chpane .chall input'); i.checked = false; i.dispatchEvent(new Event('change', { bubbles: true })); }); await B.wait(400);
    const off2 = await vf.evaluate(() => ({ n: document.querySelectorAll('.chm').length, ls: localStorage.getItem('edenMap:chat:' + chatId + ':chars') }));
    rep.check(`${name} 总开关关掉：地图无人物，存本机（按聊天）`, off2.n === 0 && /"show":false/.test(off2.ls || '') && /雷恩/.test(off2.ls), JSON.stringify(off2));
    await vf.evaluate(() => { const i = document.querySelector('#evbar .chpane .chall input'); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); const j = document.querySelector('#evbar .chpane input[data-n="雷恩"]'); j.checked = true; j.dispatchEvent(new Event('change', { bubbles: true })); }); await B.wait(400);
    // 头像（宿主页 EdenMap）
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const okA = await p.evaluate(src => window.EdenMap.setAvatar('雷恩', src), png); await B.wait(500);
    const img = await vf.evaluate(() => !!document.querySelector('.chm[data-chars="雷恩"] img'));
    const bad = await p.evaluate(() => window.EdenMap.setAvatar('雷恩', 'javascript:alert(1)'));
    rep.check(`${name} EdenMap.setAvatar：本机头像显示；非图片地址拒绝`, okA && img && !bad, JSON.stringify({ okA, img, bad }));
    // 飞过去：艾琳在中层
    await vf.evaluate(() => document.querySelector('#evbar .chpane button.chgo[data-n="艾琳"]').click()); await B.wait(4000);
    const fl = await vf.evaluate(() => ({ cur, chm: [...document.querySelectorAll('.chm')].map(e => e.dataset.chars), card: document.querySelector('#card').hidden ? null : document.querySelector('#card h2').textContent }));
    rep.check(`${name} 点人物飞到中层并开卡`, fl.cur === 'tc_mid' && fl.chm.includes('艾琳') && fl.card === '艾琳', JSON.stringify(fl));
    await jpg(p, `chars_${name}_fly`);
    const inj = await H.injected();
    rep.check(`${name} 注入摘要含人物位置（同处合并）`, /人物位置/.test(inj) && /与你同处：/.test(inj) && /艾琳@中层·霓虹街/.test(inj), inj.slice(0, 160));
    // 新人物自动加入
    await H.setMsgs([...MSGS, { message_id: 42, message: '⌖人物 奥托 @ 中层·C区检查点' }]); await B.wait(800);
    const n2 = await vf.evaluate(() => TCChars.count());
    rep.check(`${name} 新楼出现新人物：自动加入`, n2 === 5, 'n=' + n2);
    const on = await p.evaluate(() => new Promise(r => { window.EdenMap.on('characters', d => r(d.items.length)); window.__stub.msgs.push({ message_id: 43, message: '⌖人物 米娅 @ 上层·银冠堡' }); window.__fire('r'); setTimeout(() => r(-1), 3000); }));
    rep.check(`${name} on('characters') 推送`, on === 6, 'items=' + on);
    rep.check(`${name} 无脚本错误`, !P.errors.filter(e => !/http 404/.test(e)).length, P.errors.slice(0, 3).join(' | '));
  } catch (e) { rep.check(`${name} 运行`, false, e.message.split('\n')[0]); }
  finally { await P.close(); }
}
try { await run('desk', 'desktop'); await run('deskwk', 'desktopWk'); await run('phone', 'phone'); await run('iphone', 'iphone'); }
finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
