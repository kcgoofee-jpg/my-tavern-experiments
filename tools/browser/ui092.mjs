// v0.9.2 界面去重 / 查错：模拟酒馆宿主页（host_stub.mjs）里打开面板，下层 + 一条骚乱事态 + 开卡，截图矩阵并量几处重叠。
// 用法：node tools/browser/ui092.mjs <输出目录> [--only desk,deskwk,en,phone,iphone]
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2];
if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/ui092.mjs <输出目录>'); process.exit(2); }
const oi = process.argv.indexOf('--only'), ONLY = oi > 0 ? new Set(process.argv[oi + 1].split(',')) : null;
B.quietWait();
const srv = await B.ensureServer();
const rep = B.reporter(OUT);
// 用户实测时 MVU「世界.当前地点」里写了两处（「A / B」）
const HERE = '天城上层·D区·罗斯柴尔德岛·东翼休息室 / 天城下层·地基区·十一区码头';
const MSGS = [
  { message_id: 40, message: '<span style="display:none" data-tcmap="类型=骚乱;层=下层;地点=天城下层血肉磨坊;标题=拳场外人群推搡;等级=2;状态=发生中;来源=血肉磨坊"></span>' },
  { message_id: 41, message: '<span style="display:none">⌖人物 雷恩 @ 下层·7号井</span> <span style="display:none">⌖人物 艾琳 @ 中层·霓虹街</span>' },
];
const STAT = { 在场人物: { 米拉: { 身份: '向导' }, 卡尔: { 身份: '司机' } } };
// 重叠：两个元素的包围盒相交面积（px²）
const overlap = (f, a, b) => f.evaluate(([a, b]) => { const A = document.querySelector(a)?.getBoundingClientRect(), Bx = document.querySelector(b)?.getBoundingClientRect();
  if (!A || !Bx || !A.width || !Bx.width) return 0; return Math.round(Math.max(0, Math.min(A.right, Bx.right) - Math.max(A.left, Bx.left)) * Math.max(0, Math.min(A.bottom, Bx.bottom) - Math.max(A.top, Bx.top))); }, [a, b]);

async function run(name, preset, opts = {}) {
  if (ONLY && !ONLY.has(name)) return;
  const P = await B.newPage(preset, { tier: 'save', lang: opts.lang, scheme: opts.scheme });
  try {
    const H = await openHost(P, { here: HERE, msgs: MSGS, stat: STAT });
    await H.open();
    const p = P.page, vf = await H.viewer();
    await vf.evaluate(() => go('tc_low')); await B.wait(2500);
    await B.shot(p, OUT, `${name}_map`);
    // 打开事态卡：列表里点第一条
    await vf.evaluate(() => document.querySelector('#evbar .evtab').click()); await B.wait(300);
    await B.shot(p, OUT, `${name}_list`);
    await vf.evaluate(() => document.querySelector('#evbar ol button[data-id]')?.click()); await B.wait(2600);
    await B.shot(p, OUT, `${name}_card`);
    const hb = await p.evaluate(() => { const q = s => document.querySelector('#eden-map-root ' + s)?.getBoundingClientRect(); const els = ['.em-title', '.em-here', '.em-line', '.em-close'].map(q).filter(r => r && r.width);
      let hit = 0; for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i], b = els[j]; if (a.right > b.left + 1 && b.right > a.left + 1) hit++; }
      const h = document.querySelector('#eden-map-root .em-here');
      return { hit, title: document.querySelector('#eden-map-root .em-title').textContent, here: h.textContent, tip: h.title, clipped: h.scrollWidth > h.clientWidth + 1 && getComputedStyle(h).textOverflow !== 'ellipsis' }; });
    rep.check(`${name} 标题栏各项不重叠、地点不溢出`, !hb.hit && !hb.clipped, JSON.stringify(hb));
    const crumb = await vf.evaluate(() => document.querySelector('#crumbs').textContent);
    rep.check(`${name} 标题栏不重复层名`, !/[上中下]层|Tier/.test(hb.title), `title=${hb.title} crumbs=${crumb}`);
    const cd = await vf.evaluate(() => ({ tag: document.querySelector('#card .tag').textContent, sub: document.querySelector('#card .sub').textContent, place: document.querySelector('#card dl.fields dd')?.textContent || '' }));
    rep.check(`${name} 事态卡大类只出现一次`, !!cd.tag && !cd.sub.includes(cd.tag), JSON.stringify(cd));
    rep.check(`${name} 事态卡地点不重复层名`, (cd.place.match(/下层|Lower/g) || []).length <= 1, cd.place);
    const ov = await overlap(vf, '.ev.hot i', '.mk[data-name="血肉磨坊"] .lab');
    const labHidden = await vf.evaluate(() => { const m = document.querySelector('.mk[data-name="血肉磨坊"]'); return !m || getComputedStyle(m.querySelector('.lab')).visibility === 'hidden'; });
    rep.check(`${name} 事态点与地名标签不重叠`, labHidden || !ov, `overlap=${ov} labHidden=${labHidden}`);
    const lay = await vf.evaluate(() => { const b = document.querySelector('#layers button[data-go="tc_low"]'); return { dot: getComputedStyle(b.querySelector('.hd')).display !== 'none', n: b.querySelector('.evn').textContent }; });
    rep.check(`${name} 层按钮只有一种红色标记`, !(lay.dot && lay.n), JSON.stringify(lay));
    rep.check(`${name} 无脚本错误`, !P.errors.filter(e => !/http 404/.test(e)).length, P.errors.slice(0, 3).join(' | '));
  } catch (e) { rep.check(`${name} 运行`, false, e.message.split('\n')[0]); }
  finally { await P.close(); }
}
try {
  await run('desk', 'desktop');
  await run('deskwk', 'desktopWk');
  await run('en', 'desktop', { lang: 'en', scheme: 'light' });
  await run('phone', 'phone');
  await run('iphone', 'iphone');
} finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
