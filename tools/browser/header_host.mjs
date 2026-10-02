// HEADER-1 host half: in the simulated host the place pill reads the resolved name for 「<floor word> <room>」, the pending / stale state is not italic or dimmed,
// and while the replay bar is on the pill and the clock read 「回放」 (accent outline, tooltip names the floor).
//   node tools/browser/header_host.mjs <output dir> [--shots dir]
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';
const OUT = process.argv[2]; if (!OUT || OUT.startsWith('--')) { console.log('usage: node tools/browser/header_host.mjs <output dir> [--shots dir]'); process.exit(2); }
const si = process.argv.indexOf('--shots'), SHOTS = si > 0 ? process.argv[si + 1] : null;
B.quietWait(); await B.ensureServer(); const rep = B.reporter(OUT);
try {
  const P = await B.newPage('desktop', { tier: 'save' }), p = P.page;
  await P.ctx.addInitScript(() => { window.__chat = []; window.__thInstall = w => { w.SillyTavern.chat = window.__chat; }; });
  const PLACE = '地下二层 惩罚室';
  const H = await openHost(P, { here: PLACE, stat: { 世界: { 当前日期: '新历2088年01月02日', 当前时刻: '03:05', 当日时段: '凌晨' } }, msgs: [{ message_id: 1, message: '到了。' }, { message_id: 2, message: '继续。' }], chat: 'header1', ls: { edenMapLine: 'cn' } });
  await H.open(); await B.wait(2500);
  const pill = () => p.evaluate(() => { const e = document.querySelector('#eden-map-root .em-here'), cs = e && getComputedStyle(e); return e ? { text: e.querySelector('.em-nm')?.textContent || '', rp: e.dataset.rp || '', title: e.title, italic: cs.fontStyle, opacity: cs.opacity } : null; });
  const a = await pill();
  rep.check('the pill shows the resolved name 「伊甸庄园 · 惩罚室」 for 「地下二层 惩罚室」', a?.text === '伊甸庄园 · 惩罚室', JSON.stringify(a));
  rep.check('the pill is not italic or dimmed', a?.italic !== 'italic' && a?.opacity === '1', JSON.stringify(a));
  if (SHOTS) await B.shot(p, SHOTS, 'pill_resolved');
  const tl = p.locator('#eden-map-root .em-tl-btn');
  await tl.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  if (await tl.isVisible()) {
    await tl.click(); await B.wait(500);
    const r = await p.evaluate(() => ({ cls: document.getElementById('eden-map-root').classList.contains('em-replay'), pill: document.querySelector('#eden-map-root .em-here')?.dataset.rp || '', tip: document.querySelector('#eden-map-root .em-here')?.title || '' }));
    rep.check('replay on: the place pill reads 「回放」 and its tooltip names the floor', r.cls && r.pill === '回放' && /楼/.test(r.tip), JSON.stringify(r));
    if (process.env.DBG) console.log(JSON.stringify(await p.evaluate(() => { const e = document.querySelector('#eden-map-root .em-here'), c = getComputedStyle(e), r = e.getBoundingClientRect(); return { disp: c.display, w: r.width, h: r.height, fd: c.flexDirection, pos: c.position, cls: e.className, html: e.outerHTML.slice(0, 200), bef: getComputedStyle(e, '::before').content, bw: getComputedStyle(e, '::before').width }; })));
    if (SHOTS) await B.shot(p, SHOTS, 'replay_on');
    await p.locator('#eden-map-root .em-tl-x').click(); await B.wait(400);
    const o = await p.evaluate(() => ({ cls: document.getElementById('eden-map-root').classList.contains('em-replay'), rp: document.querySelector('#eden-map-root .em-here')?.dataset.rp || '' }));
    rep.check('replay off: the live values are back', !o.cls && !o.rp, JSON.stringify(o));
  } else rep.check('the replay button is available in the simulated host', false, 'hidden');
  const errs = P.errors.filter(x => !/favicon|ERR_BLOCKED|net::|http 404/i.test(x));
  rep.check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally { await B.closeAll(); }
process.exit(rep.save() ? 0 : 1);
