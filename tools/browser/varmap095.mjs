// v0.9.5 变量映射（换卡兼容）：别的卡（字段名不同）自动找到地点 / 时间 / 在场表；设置里改路径即生效、按卡存本机；恢复自动；自检写明读法；没有 MVU 退回标签。中性占位数据。
// 用法：node tools/browser/varmap095.mjs <输出目录> [--shots docs/reviews/custom_095/shots]
import * as B from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { openHost } from './host_stub.mjs';
import { FIELDS } from '../../map/tavern/adapter.mjs';   // 设置里每个可映射字段一个下拉框（v0.9.6 起 12 个，不写死）
const OUT = process.argv[2]; if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/varmap095.mjs <输出目录>'); process.exit(2); }
const si = process.argv.indexOf('--shots'), SHOTS = si > 0 ? path.resolve(process.argv[si + 1]) : null;
B.quietWait(); const srv = await B.ensureServer(); const rep = B.reporter(OUT);
const jpg = async (page, name) => { await B.shot(page, OUT, name); if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.jpg'), type: 'jpeg', quality: 72, scale: 'css' }); };
const OTHER = { world: { location: '天城·中层·辉光大教堂', time: '21:30', alt: '天城·下层·7 号井黑市' }, hero: { reputation: 40 }, present: { Ann: { role: 'guide' } } };
async function run(name, preset) {
  const P = await B.newPage(preset, { tier: 'save' });
  try {
    const H = await openHost(P, { stat: OTHER, rawStat: true, msgs: [], chat: 'v95-' + name });
    const p = P.page; await B.wait(1500);
    const chip = await p.evaluate(() => document.querySelector('#eden-map-root .em-here .em-nm')?.textContent || '');
    rep.check(`${name} 别的卡：自动找到 world.location → 标题栏地点`, /辉光大教堂/.test(chip), chip);
    const ch = await p.evaluate(() => window.EdenMap.getCharacters());
    rep.check(`${name} 自动找到在场表 present`, ch.items.some(c => c.name === 'Ann'), JSON.stringify(ch.items));
    await H.open(); const vf = await H.viewer(); await B.wait(800);
    await vf.evaluate(() => { closeCard(); showSet(true); document.querySelector('#vmBox').open = true; }); await B.wait(200);
    const ui = await vf.evaluate(() => ({ mode: document.querySelector('#vmBox summary small')?.textContent, n: document.querySelectorAll('#vmBox select').length, auto: document.querySelector('#vmBox select[data-f=location] option')?.textContent }));
    rep.check(`${name} 设置「变量映射」：读法 MVU、自动 = world.location`, ui.mode === 'MVU' && ui.n === FIELDS.length && /world\.location/.test(ui.auto || ''), JSON.stringify(ui));
    await jpg(p, `vm_${name}_settings`);
    await vf.evaluate(() => { const s = document.querySelector('#vmBox select[data-f=location]'); s.value = 'world.alt'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await B.wait(900);
    const chip2 = await p.evaluate(() => document.querySelector('#eden-map-root .em-here .em-nm')?.textContent || '');
    const ls = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('edenMap:varmap:')).map(k => localStorage.getItem(k)));
    rep.check(`${name} 改成 world.alt：地点跟着换，按卡存本机`, /7 号井/.test(chip2) && ls.some(v => /world\.alt/.test(v)), JSON.stringify({ chip2, ls }));
    await B.wait(1500); const sc = await p.evaluate(async () => (await window.EdenMap.selfcheck()).items.find(i => i.id === 'varmap'));
    rep.check(`${name} 自检写明读法`, sc?.status === 'ok' && /world\.alt/.test(sc.zh), JSON.stringify(sc));
    await vf.evaluate(() => document.querySelector('#vmBox [data-vmreset]').click()); await B.wait(900);
    const chip3 = await p.evaluate(() => document.querySelector('#eden-map-root .em-here .em-nm')?.textContent || '');
    rep.check(`${name} 全部恢复自动`, /辉光大教堂/.test(chip3), chip3);
    rep.check(`${name} 无脚本错误`, !P.errors.filter(e => !/http 404/.test(e)).length, P.errors.slice(0, 3).join(' | '));
  } catch (e) { rep.check(`${name} 运行`, false, e.message.split('\n')[0]); }
  finally { await P.close(); }
}
try { await run('desk', 'desktop'); if (!process.env.ONE) { await run('deskwk', 'desktopWk'); await run('phone', 'phone'); await run('iphone', 'iphone'); } }
finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
