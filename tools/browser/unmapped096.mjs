// v0.9.6「未上图」：当前地点认不出时不跳转、标题栏显示「未上图：<名字>」，点开选择器指派到地标 / 房间 / 层 / 世界地名或「忽略」，
// 存进 eden_map.自定义 后立刻生效（跳过去、提示消失）；自定义面板里列出叫法并可去掉。375（Chromium 触屏）与桌面，单独打开与嵌在酒馆宿主页里各跑一遍。
// 用法：node tools/browser/unmapped096.mjs <输出目录>
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2];
if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/unmapped096.mjs <输出目录>'); process.exit(2); }
B.quietWait();
const srv = await B.ensureServer();
const rep = B.reporter(OUT);
const errs = P => P.errors.filter(e => !/http 404/.test(e));
const setHere = (f, v) => f.evaluate(v => { const i = document.getElementById('here'); i.value = v; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); }, v);

async function standalone(name, preset) {
  const P = await B.newPage(preset, { tier: 'save' });
  try {
    const p = P.page;
    await B.openViewer(P, { map: 'tc_mid', here: '月面基地' }); await B.wait(1500);
    const s0 = await p.evaluate(() => ({ cur: ViewerDebug.currentMapId, chip: !document.getElementById('unmapped')?.hidden, text: document.getElementById('unmapped')?.textContent, w: document.getElementById('unmapped')?.getBoundingClientRect().right, vw: innerWidth }));
    rep.check(`${name} 单独打开：认不出的地点不跳转，页头「未上图：月面基地」`, s0.cur === 'tc_mid' && s0.chip && s0.text === '未上图：月面基地' && s0.w <= s0.vw, JSON.stringify(s0));
    await B.shot(p, OUT, `um_${name}_chip`);
    await p.locator('#unmapped').click(); await B.wait(300);
    const d = await p.evaluate(() => ({ open: !document.getElementById('umDlg').hidden, groups: [...document.querySelectorAll('#umDlg section h3')].map(h => h.firstChild.nodeValue), sheet: document.querySelector('#umDlg .um-sheet').getBoundingClientRect().width, vw: innerWidth }));
    rep.check(`${name} 选择器：地标 / 层 / 庄园房间 / 室外 / 世界地名五组，不超出屏宽`, d.open && d.groups.length === 5 && d.sheet <= d.vw, JSON.stringify(d));
    await p.locator('#umQ').fill('女仆长寝室'); await B.wait(200);
    await B.shot(p, OUT, `um_${name}_picker`);
    await p.locator('#umDlg li button[data-k="女仆长寝室"]').first().click(); await B.wait(3000);
    const s1 = await p.evaluate(() => ({ cur: ViewerDebug.currentMapId, chip: !document.getElementById('unmapped').hidden, dlg: document.getElementById('umDlg').hidden, c: CustomNamesView.data.items['女仆长寝室'], r: ViewerDebug.hereRes('月面基地') }));
    rep.check(`${name} 指派到卡设定房间：存下叫法、立刻认得（F2）并跳进庄园（省流档落到上层伊甸替身），提示消失`, !s1.chip && s1.dlg && s1.c?.别名?.includes('月面基地') && s1.r?.floor === 'F2' && ['eden_estate', 'tc_upper'].includes(s1.cur), JSON.stringify(s1));
    // 地标
    await setHere(p, '老码头酒吧'); await B.wait(600);
    await p.locator('#unmapped').click(); await B.wait(300);
    await p.locator('#umQ').fill('执法局'); await B.wait(200);
    await p.locator('#umDlg li button[data-kind="landmark"]').first().click(); await B.wait(3000);
    const s2 = await p.evaluate(() => ({ cur: ViewerDebug.currentMapId, r: ViewerDebug.hereRes('老码头酒吧'), chip: !document.getElementById('unmapped').hidden }));
    rep.check(`${name} 指派到地标：落到该层并聚焦`, s2.r?.level === 3 && s2.cur === s2.r.map && !s2.chip, JSON.stringify(s2));
    // 忽略
    await setHere(p, '梦境深处'); await B.wait(600);
    await p.locator('#unmapped').click(); await B.wait(300);
    await p.locator('#umDlg footer [data-ignore]').click(); await B.wait(500);
    const s3 = await p.evaluate(() => ({ chip: !document.getElementById('unmapped').hidden, ig: CustomNamesView.data.忽略 }));
    rep.check(`${name} 忽略：提示消失，名字记进 忽略`, !s3.chip && s3.ig?.includes('梦境深处'), JSON.stringify(s3));
    // 自定义面板：列出叫法，可去掉
    await p.evaluate(() => { ViewerDebug.showSet(true); document.querySelector('#cuBox .cu-open').click(); }); await B.wait(500);
    const al = await p.evaluate(() => [...document.querySelectorAll('#cuDlg [data-unalias]')].map(b => b.dataset.a));
    await B.shot(p, OUT, `um_${name}_custom`);
    await p.locator('#cuDlg [data-a="老码头酒吧"]').click(); await B.wait(500);
    const s4 = await p.evaluate(() => ({ r: ViewerDebug.hereRes('老码头酒吧'), left: [...document.querySelectorAll('#cuDlg [data-unalias]')].map(b => b.dataset.a) }));
    rep.check(`${name} 自定义面板列出叫法，去掉后不再认得`, al.includes('月面基地') && al.includes('老码头酒吧') && !s4.r && !s4.left.includes('老码头酒吧'), JSON.stringify({ al, s4 }));
    rep.check(`${name} 无页面错误`, !errs(P).length, errs(P).join(' | ').slice(0, 300));
  } catch (e) { rep.check(`${name} 运行`, false, String(e).slice(0, 300)); }
  finally { await P.ctx.close(); }
}

async function embedded(name, preset) {
  const P = await B.newPage(preset, { tier: 'save' });
  try {
    const H = await openHost(P, { here: '月面基地', chat: 'um96-' + name });
    const p = P.page;
    await H.open(); const vf = await H.viewer(); await B.wait(800);
    const t0 = await p.evaluate(() => { const h = document.querySelector('#eden-map-root .em-here'); return { unm: h.classList.contains('em-unm'), text: h.textContent, role: h.getAttribute('role') }; });
    const v0 = await vf.evaluate(() => ({ cur: ViewerDebug.currentMapId, own: !document.getElementById('unmapped')?.hidden }));
    rep.check(`${name} 酒馆里：标题栏「未上图：月面基地」（可点），地图不跳、页头不重复显示`, t0.unm && t0.text === '未上图：月面基地' && t0.role === 'button' && !v0.own, JSON.stringify({ t0, v0 }));
    await B.shot(p, OUT, `um_${name}_host_chip`);
    await p.locator('#eden-map-root .em-here').click(); await B.wait(500);
    const open = await vf.evaluate(() => !document.getElementById('umDlg').hidden);
    rep.check(`${name} 点标题栏打开地图里的选择器`, open);
    await B.shot(p, OUT, `um_${name}_host_picker`);
    await vf.locator('#umQ').fill('中层'); await B.wait(200);
    await vf.locator('#umDlg li button[data-kind="layer"]').first().click(); await B.wait(3000);
    const v1 = await vf.evaluate(() => ({ cur: ViewerDebug.currentMapId, r: ViewerDebug.hereRes('月面基地') }));
    const t1 = await p.evaluate(() => ({ unm: document.querySelector('#eden-map-root .em-here').classList.contains('em-unm'), vars: JSON.stringify(window.__vars || {}) }));
    rep.check(`${name} 指派到层：写进聊天变量 eden_map.自定义，标题栏恢复，跳到该层`, v1.r?.level === 4 && v1.cur === v1.r.map && !t1.unm && /月面基地/.test(t1.vars), JSON.stringify({ v1, t1: { ...t1, vars: t1.vars.slice(0, 200) } }));
    rep.check(`${name} 无页面错误`, !errs(P).length, errs(P).join(' | ').slice(0, 300));
  } catch (e) { rep.check(`${name} 运行`, false, String(e).slice(0, 300)); }
  finally { await P.ctx.close(); }
}

try {
  await standalone('desk', 'desktop'); await standalone('phone', 'phone');
  await embedded('desk', 'desktop'); await embedded('phone', 'phone');
}
finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
