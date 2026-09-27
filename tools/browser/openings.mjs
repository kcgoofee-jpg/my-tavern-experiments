// node tools/browser/openings.mjs <输出目录> —— 开局关键地点（maps.json openings）在各层默认视野的截图：桌面 1440 与 375 手机
import { ensureServer, newPage, openViewer, closeAll } from './lib.mjs';
const out = process.argv[2] || '/tmp/openings';
const srv = await ensureServer();   // 自己起的服务跑完要关（端口隔离后不再复用别人的）
const res = []; let fail = 0;   // 有脚本错误 / 某图一个标记都没有 / 运行异常 → 退出码 1（C-测试缺口：以前无条件 exit 0）
try {
for (const preset of ['desktop', 'phone']) {
  for (const map of ['world', 'tc_upper', 'tc_mid', 'tc_low']) {
    const P = await newPage(preset); await openViewer(P, { map });
    await P.page.waitForTimeout(2500);
    const ops = await P.page.$$eval('.mk.op', es => es.map(e => e.dataset.name + ' ' + e.querySelector('.lab').dataset.op + (e.classList.contains('lhide') ? '(label hidden)' : '')));
    const f = `${out}/${map}_${preset}.png`; await P.page.screenshot({ path: f });
    // v0.9.6 起地图上不再显示「开局 N」金标（.mk.op 为空是正常的），只要求有标记、无脚本错误
    const marks = await P.page.$$eval('.mk', es => es.length), ok = !P.errors.length && marks > 0; if (!ok) fail++;
    res.push({ preset, map, ok, marks, ops, errors: P.errors }); await P.ctx.close();
  }
}
} catch (e) { fail++; res.push({ error: String(e?.stack || e) }); }
console.log(JSON.stringify(res, null, 1)); await closeAll(); srv.stop();
console.log(fail ? `有失败：${fail}` : '全部通过'); process.exit(fail ? 1 : 0);
