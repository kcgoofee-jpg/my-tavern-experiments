// v0.9.5 人物栏名册（只读）：在场 / 成员 / 目标分组（可折叠）、身份、阶段小签（顺序从卡自带脚本文本里找）、伊甸地点卡的声望条。数据全是中性占位。
// 用法：node tools/browser/roster095.mjs <输出目录> [--shots docs/reviews/custom_095/shots]
import * as B from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { openHost } from './host_stub.mjs';
import { fileURLToPath } from 'node:url';
// the members table of the chat holds 2 rows; the pack's fallback roster (manifest.data.roster) adds the people the table lacks (mvu-readers.mjs `rosters`: "MVU wins, the setting fills the gaps")
const FALLBACK = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../map/data/fallback_roster.json', import.meta.url)), 'utf8')).members;
const MEMBERS = 2 + FALLBACK.filter(m => !['甲一', '甲二'].includes(m.name)).length;
const OUT = process.argv[2]; if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/roster095.mjs <输出目录>'); process.exit(2); }
const si = process.argv.indexOf('--shots'), SHOTS = si > 0 ? path.resolve(process.argv[si + 1]) : null;
B.quietWait(); const srv = await B.ensureServer(); const rep = B.reporter(OUT);
const jpg = async (page, name) => { await B.shot(page, OUT, name); if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.jpg'), type: 'jpeg', quality: 72, scale: 'css' }); };
const STAT = { 世界: { 当前地点: '天城·上层·伊甸庄园' }, 主角: { 声望: 62 },
  表一: { 甲一: { 身份: '园丁', 级别: 'B', 数值: 72 }, 甲二: { 身份: '厨师' } }, 在场人物: { 乙一: { 身份: '访客' } }, 表三: { 丙一: { 身份: '商人', 进度: '第二步' } } };
const PURL = 'https://cdn.jsdelivr.net/gh/Yehehua1311/placeholder@main/A/sfw/A_1.png';
const CHAR = { data: { extensions: { scripts: [{ content: "const S = z.enum(['第一步', '第二步', '第三步', '第四步']);" }, { content: `const defaultPortraits = { "甲一": "${PURL}" };` }] } } };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
async function run(name, preset, charAsync = false) {
  const P = await B.newPage(preset, { tier: 'save' });
  try {
    await P.page.route('https://cdn.jsdelivr.net/gh/Yehehua1311/**', r => r.fulfill({ contentType: 'image/png', body: PNG }));
    const H = await openHost(P, { here: '天城·上层·伊甸庄园', msgs: [], stat: STAT, chat: 'r95-' + name, charData: CHAR, charAsync });
    const p = P.page; await B.wait(1200);
    const api = await p.evaluate(() => window.EdenMap.getCharacters());
    rep.check(`${name} EdenMap.getCharacters：rosters / reputation（只读）`, api.rosters?.members?.items?.length === MEMBERS && api.rosters.targets.items[0].stage === '第二步' && api.reputation === 62, JSON.stringify({ r: api.rosters?.targets, rep: api.reputation }));
    await H.open(); const vf = await H.viewer();
    await vf.evaluate(() => { ViewerDebug.closeCard(); document.querySelector('#evbar .chtab').click(); }); await B.wait(500);
    const vis = await vf.evaluate(() => { const e = document.querySelector('#evbar .chgrp'); return !!e && e.getBoundingClientRect().height > 0; });
    rep.check(`${name} 人物页签展开可见`, vis);
    const g = await vf.evaluate(() => [...document.querySelectorAll('#evbar .chgrp')].map(d => ({ g: d.dataset.g, s: d.querySelector('summary').textContent, n: d.querySelectorAll('li').length, open: d.open })));
    const chip = await vf.evaluate(() => { const c = document.querySelector('#evbar .chgrp[data-g=targets] .chstage'); return c ? { t: c.textContent, dots: c.querySelectorAll('b').length, on: c.querySelectorAll('b.on').length } : null; });
    rep.check(`${name} 人物页签：在场 / 庄园成员 / 目标三组，身份显示`, g.length === 3 && g[0].g === 'present' && g[1].n === MEMBERS && g[2].n === 1 && /园丁|厨师/.test(await vf.evaluate(() => document.querySelector('#evbar .chgrp[data-g=members]').textContent)), JSON.stringify(g));
    rep.check(`${name} 目标的阶段小签：原样文字 + 按卡里顺序的进度点（2 / 4）`, chip?.t === '第二步' && chip.dots === 4 && chip.on === 2, JSON.stringify(chip));
    await jpg(p, `ro_${name}_pane`);
    // v0.9.6 E2 / E13：成员的等级 / 核心数值（字段名走变量映射；这里的中性字段默认不认，映射后显示「档 n」），设置开关可关
    const st0 = await vf.evaluate(() => !!document.querySelector('#evbar .chstat'));
    await vf.evaluate(() => ViewerDebug.post({ type: 'eden-map:varmap-set', user: { gradeField: '级别', coreField: '数值' } }));
    await vf.waitForFunction(() => !!document.querySelector('#evbar .chgrp[data-g=members] .chstat'), null, { timeout: 8000 }).catch(() => {});
    const st1 = await vf.evaluate(() => document.querySelector('#evbar .chgrp[data-g=members] .chstat')?.textContent || '');
    await vf.evaluate(() => { ViewerDebug.showSet(true); document.querySelector('#optCharStats').click(); ViewerDebug.showSet(false); }); await B.wait(300);
    const st2 = await vf.evaluate(() => !!document.querySelector('#evbar .chstat'));
    await vf.evaluate(() => { ViewerDebug.showSet(true); document.querySelector('#optCharStats').click(); ViewerDebug.showSet(false); ViewerDebug.post({ type: 'eden-map:varmap-set', user: {} }); }); await B.wait(300);
    rep.check(`${name} 名册数值：映射前不显示；映射后「B · 档 4 72」；「人物栏显示数值」关掉即隐藏`, !st0 && st1 === 'B · 档 4 72' && !st2, JSON.stringify({ st0, st1, st2 }));
    const lean0 = await vf.evaluate(() => CharactersView.portOn());   // 省流档（测试用 save）默认关
    await vf.evaluate(() => { ViewerDebug.showSet(true); document.querySelector('#optPort').click(); ViewerDebug.showSet(false); }); await B.wait(300);
    const av = await vf.evaluate(() => document.querySelector('#evbar .chgrp[data-g=members] img')?.getAttribute('src') || '');
    await vf.evaluate(() => { ViewerDebug.showSet(true); document.querySelector('#optPort').click(); ViewerDebug.showSet(false); }); await B.wait(300);
    const av2 = await vf.evaluate(() => document.querySelector('#evbar .chgrp[data-g=members] .av').textContent);
    await vf.evaluate(() => { ViewerDebug.showSet(true); document.querySelector('#optPort').click(); ViewerDebug.showSet(false); });
    const dbg = await vf.evaluate(() => [CharactersView.hasPortraits, CharactersView.portOn(), document.querySelector('#evbar .chgrp[data-g=members] .av')?.outerHTML]);
    rep.check(`${name} 原作头像：卡里立绘表的 /sfw/ 地址；省流默认关；打开后用卡里立绘表的 /sfw/ 地址；关掉退回首字`, lean0 === false && av === PURL && av2 === '甲', JSON.stringify({ lean0, av, av2, dbg }));
    await vf.evaluate(() => document.querySelector('#evbar .chgrp[data-g=members] summary').click()); await B.wait(200);
    const cl = await vf.evaluate(() => [document.querySelector('#evbar .chgrp[data-g=members]').open, localStorage.getItem('edenMapChGroups')]);
    rep.check(`${name} 分组可折叠，折叠状态记在本机`, cl[0] === false && /members/.test(cl[1] || ''), JSON.stringify(cl));
    // 伊甸地点卡：声望条
    await vf.evaluate(() => { EventsView.collapse(); ViewerDebug.go('tc_upper'); }); await B.wait(2500);
    const m = await vf.evaluate(() => { const el = [...document.querySelectorAll('.mk')].find(e => e.dataset.name === '伊甸庄园'); el._open(); const r = document.querySelector('#card .cu-rep'); return r ? { v: r.querySelector('meter').value, t: r.textContent } : null; });
    rep.check(`${name} 伊甸地点卡：庄园声望 62（meter）`, m?.v === 62 && /62/.test(m.t), JSON.stringify(m));
    await jpg(p, `ro_${name}_eden_rep`);
    rep.check(`${name} 无脚本错误`, !P.errors.filter(e => !/http 404/.test(e)).length, P.errors.slice(0, 3).join(' | '));
  } catch (e) { rep.check(`${name} 运行`, false, e.message.split('\n')[0]); }
  finally { await P.close(); }
}
try { await run('desk', 'desktop'); await run('deskasync', 'desktop', true); if (!process.env.ONE) { await run('deskwk', 'desktopWk'); await run('phone', 'phone'); await run('iphone', 'iphone'); } }
finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
