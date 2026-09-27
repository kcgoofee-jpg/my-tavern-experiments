// v0.9.5 人物栏名册（只读）：在场 / 成员 / 目标分组（可折叠）、身份、阶段小签（顺序从卡自带脚本文本里找）、伊甸地点卡的声望条。数据全是中性占位。
// 用法：node tools/browser/roster095.mjs <输出目录> [--shots docs/reviews/custom_095/shots]
import * as B from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { openHost } from './host_stub.mjs';
const OUT = process.argv[2]; if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/roster095.mjs <输出目录>'); process.exit(2); }
const si = process.argv.indexOf('--shots'), SHOTS = si > 0 ? path.resolve(process.argv[si + 1]) : null;
B.quietWait(); const srv = await B.ensureServer(); const rep = B.reporter(OUT);
const jpg = async (page, name) => { await B.shot(page, OUT, name); if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.jpg'), type: 'jpeg', quality: 72, scale: 'css' }); };
const STAT = { 世界: { 当前地点: '天城·上层·伊甸庄园' }, 主角: { 声望: 62 },
  表一: { 甲一: { 身份: '园丁' }, 甲二: { 身份: '厨师' } }, 在场人物: { 乙一: { 身份: '访客' } }, 表三: { 丙一: { 身份: '商人', 进度: '第二步' } } };
const CHAR = { data: { extensions: { scripts: [{ content: "const S = z.enum(['第一步', '第二步', '第三步', '第四步']);" }] } } };
async function run(name, preset) {
  const P = await B.newPage(preset, { tier: 'save' });
  try {
    const H = await openHost(P, { here: '天城·上层·伊甸庄园', msgs: [], stat: STAT, chat: 'r95-' + name, charData: CHAR });
    const p = P.page; await B.wait(1200);
    const api = await p.evaluate(() => window.EdenMap.getCharacters());
    rep.check(`${name} EdenMap.getCharacters：rosters / reputation（只读）`, api.rosters?.members?.items?.length === 2 && api.rosters.targets.items[0].stage === '第二步' && api.reputation === 62, JSON.stringify({ r: api.rosters?.targets, rep: api.reputation }));
    await H.open(); const vf = await H.viewer();
    await vf.evaluate(() => { closeCard(); document.querySelector('#evbar .chtab').click(); }); await B.wait(500);
    const vis = await vf.evaluate(() => { const e = document.querySelector('#evbar .chgrp'); return !!e && e.getBoundingClientRect().height > 0; });
    rep.check(`${name} 人物页签展开可见`, vis);
    const g = await vf.evaluate(() => [...document.querySelectorAll('#evbar .chgrp')].map(d => ({ g: d.dataset.g, s: d.querySelector('summary').textContent, n: d.querySelectorAll('li').length, open: d.open })));
    const chip = await vf.evaluate(() => { const c = document.querySelector('#evbar .chgrp[data-g=targets] .chstage'); return c ? { t: c.textContent, dots: c.querySelectorAll('b').length, on: c.querySelectorAll('b.on').length } : null; });
    rep.check(`${name} 人物页签：在场 / 庄园成员 / 目标三组，身份显示`, g.length === 3 && g[0].g === 'present' && g[1].n === 2 && g[2].n === 1 && /园丁|厨师/.test(await vf.evaluate(() => document.querySelector('#evbar .chgrp[data-g=members]').textContent)), JSON.stringify(g));
    rep.check(`${name} 目标的阶段小签：原样文字 + 按卡里顺序的进度点（2 / 4）`, chip?.t === '第二步' && chip.dots === 4 && chip.on === 2, JSON.stringify(chip));
    await jpg(p, `ro_${name}_pane`);
    await vf.evaluate(() => document.querySelector('#evbar .chgrp[data-g=members] summary').click()); await B.wait(200);
    const cl = await vf.evaluate(() => [document.querySelector('#evbar .chgrp[data-g=members]').open, localStorage.getItem('edenMapChGroups')]);
    rep.check(`${name} 分组可折叠，折叠状态记在本机`, cl[0] === false && /members/.test(cl[1] || ''), JSON.stringify(cl));
    // 伊甸地点卡：声望条
    await vf.evaluate(() => { TCEvents.collapse(); go('tc_upper'); }); await B.wait(2500);
    const m = await vf.evaluate(() => { const el = [...document.querySelectorAll('.mk')].find(e => e.dataset.name === '伊甸庄园'); el._open(); const r = document.querySelector('#card .cu-rep'); return r ? { v: r.querySelector('meter').value, t: r.textContent } : null; });
    rep.check(`${name} 伊甸地点卡：庄园声望 62（meter）`, m?.v === 62 && /62/.test(m.t), JSON.stringify(m));
    await jpg(p, `ro_${name}_eden_rep`);
    rep.check(`${name} 无脚本错误`, !P.errors.filter(e => !/http 404/.test(e)).length, P.errors.slice(0, 3).join(' | '));
  } catch (e) { rep.check(`${name} 运行`, false, e.message.split('\n')[0]); }
  finally { await P.close(); }
}
try { await run('desk', 'desktop'); await run('deskwk', 'desktopWk'); await run('phone', 'phone'); await run('iphone', 'iphone'); }
finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
