// node tools/browser/openings.mjs <输出目录> —— 开局关键地点（maps.json openings）在各层默认视野的截图：桌面 1440 与 375 手机
import { ensureServer, newPage, openViewer, closeAll } from './lib.mjs';
const out = process.argv[2] || '/tmp/openings';
await ensureServer();
const res = [];
for (const preset of ['desktop', 'phone']) {
  for (const map of ['world', 'tc_upper', 'tc_mid', 'tc_low']) {
    const P = await newPage(preset); await openViewer(P, { map });
    await P.page.waitForTimeout(2500);
    const ops = await P.page.$$eval('.mk.op', es => es.map(e => e.dataset.name + ' ' + e.querySelector('.lab').dataset.op + (e.classList.contains('lhide') ? '(label hidden)' : '')));
    const f = `${out}/${map}_${preset}.png`; await P.page.screenshot({ path: f });
    res.push({ preset, map, ops, errors: P.errors }); await P.ctx.close();
  }
}
console.log(JSON.stringify(res, null, 1)); await closeAll(); process.exit(0);
