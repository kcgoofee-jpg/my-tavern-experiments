// I-17: the follow fix replayed in the simulated host with the values of the user's live chat (location 光辉联邦废弃据点,
// 03:18 on 2088-01-02): the viewer's location label, the top-bar clock per floor, and the settings injection preview line.
// Usage: node tools/browser/replay_i17.mjs <output dir>
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';
const OUT = process.argv[2]; if (!OUT || OUT.startsWith('--')) { console.log('usage: node tools/browser/replay_i17.mjs <output dir>'); process.exit(2); }
B.quietWait(); const srv = await B.ensureServer(); const rep = B.reporter(OUT);
const PLACE = '光辉联邦废弃据点', DATE = '新历2088年01月02日';
const FL = [['02:41', '凌晨'], ['03:05', '凌晨'], ['03:18', '凌晨']];
const stat = ([t, p]) => ({ 世界: { 当前日期: DATE, 当前时刻: t, 当日时段: p } });
try {
  const P = await B.newPage('desktop', { tier: 'save' });
  // the real tavern exposes SillyTavern.chat (one variables entry per floor); the stub host does not, so install a live one
  await P.ctx.addInitScript(() => { window.__chat = []; window.__thInstall = w => { w.SillyTavern.chat = window.__chat; }; });
  const setChat = n => P.page.evaluate(([n, st]) => { window.__chat.length = 0; window.__chat.push({ is_user: true, swipe_id: 0, variables: [] });
    for (let i = 0; i < n; i++) window.__chat.push({ is_user: false, swipe_id: 0, variables: [{ stat_data: { 世界: { 当前地点: st.here, ...st.floors[i] } } }] }); }, [n, { here: PLACE, floors: FL.map(stat).map(x => x.世界) }]);
  const H = await openHost(P, { here: PLACE, stat: stat(FL[0]), msgs: [{ message_id: 1, message: '到了。' }], chat: 'i17', ls: { edenMapLine: 'cn' } });
  await setChat(1); await H.open(); const vf = await H.viewer();
  const clock = () => P.page.evaluate(() => { const e = document.querySelector('#eden-map-root .em-clock'); return e ? { hidden: e.hidden, text: e.lastChild?.textContent || '', title: e.title } : null; });
  for (let i = 0; i < FL.length; i++) {
    if (i) await setChat(i + 1);
    if (i) await H.setMsgs([{ message_id: 1, message: '到了。' }, { message_id: 1 + i, message: '继续。' }], stat(FL[i]));
    const c = await clock(), want = `1月2日 ${FL[i][0]}`;
    console.log(`  floor ${i + 1} top-bar time: ${JSON.stringify(c)}`);
    rep.check(`floor ${i + 1}: top-bar time = 世界.当前时刻 (${FL[i][0]})`, !!c && !c.hidden && c.text === want, JSON.stringify(c));
  }
  const loc = await vf.evaluate(() => ({ here: document.querySelector('#here')?.value || '', hereGo: !document.querySelector('#hereGo')?.hidden,
    named: [...document.querySelectorAll('.mk.here')].map(e => e.dataset.name), unmapped: !!document.querySelector('#umBtn:not([hidden]), .um-chip:not([hidden])') }));
  console.log('  location label:', JSON.stringify(loc));
  rep.check('location: label keeps the text as written, realm placed (current-position button shown, not unmapped)', loc.here === PLACE && loc.hereGo, JSON.stringify(loc));
  await vf.evaluate(() => SettingsApi.open('data')); await B.wait(1500);
  const pv = await vf.evaluate(() => document.querySelector('#thInjPreview')?.textContent || '');
  console.log('  injection preview:', pv); console.log('  injected:', JSON.stringify(await H.injected()));
  rep.check('settings preview carries 地点 and 时间', /地点：光辉联邦废弃据点/.test(pv) && /时间：.*03:18/.test(pv), pv);
  rep.check('the injected text carries 地点 and 时间', /地点：光辉联邦废弃据点/.test(await H.injected()) && /03:18/.test(await H.injected()));
  rep.check('no script errors', !P.errors.filter(e => !/http 404/.test(e)).length, P.errors.slice(0, 3).join(' | '));
  await P.close(); await B.closeAll();
} finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? 'all passed' : 'failures'} -> ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
