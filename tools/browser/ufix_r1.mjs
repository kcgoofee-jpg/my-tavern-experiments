// U-FIX-R1 probe (TT sweep-1 findings, docs/todo.md U-FIX-1…U-FIX-5): one check per finding the browser can see, run inside the tavern host stub.
//   node tools/browser/ufix_r1.mjs [out dir] [--only ufix3,ufix4,…]
// Each check names its finding id; on the tree before the fix it prints ✗, after the fix ✓.
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const args = process.argv.slice(2), OUT = args.find(a => !a.startsWith('--')) || '/tmp/ufix_r1';
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = k => !only.length || only.includes(k);
const rep = B.reporter(OUT);
B.quietWait();
const srv = await B.ensureServer();
const STAT = { 世界: { 当前日期: '新历2088年01月01日', 当前时刻: '23:00', 当日时段: '' } };

try {
  const P = await B.newPage('desktop', { tier: 'save', scheme: 'dark' });
  try {
    const H = await openHost(P, { here: '伊甸庄园·主卧', stat: STAT, chat: 'ufixr1' });
    await H.open();
    const p = P.page, vf = await H.viewer();
    const open = async (map, name) => { await vf.evaluate(m => ViewerDebug.go(m), map); await B.wait(2500); return vf.evaluate(n => { const m = document.querySelector(`.mk[data-name="${n}"]`); if (!m) return false; m._open(); return true; }, name); };

    if (want('ufix3')) {
      await vf.evaluate(() => window.SecurityView?.set(true)); await B.wait(600);
      const own = await open('tc_upper', '伊甸庄园'); await B.wait(400);
      const a = await vf.evaluate(() => document.querySelectorAll('#card .secbox').length);
      const other = await open('tc_mid', '天城议会'); await B.wait(400);
      const b = await vf.evaluate(() => document.querySelectorAll('#card .secbox').length);
      await vf.evaluate(() => ViewerDebug.showCard(null, '某人', '', '', '主卧')); await B.wait(300);
      const c = await vf.evaluate(() => document.querySelectorAll('#card .secbox').length);
      rep.check('U-FIX-3: the security block is on the owning place card only (own card 1, another place 0, a person card 0)', own && other && a === 1 && b === 0 && c === 0, JSON.stringify({ own, other, a, b, c }));
      await vf.evaluate(() => { window.SecurityView?.set(false); ViewerDebug.closeCard?.(); });
    }

    if (want('ufix4')) {
      await vf.evaluate(() => ViewerDebug.go('tc_upper')); await B.wait(2500);
      const before = await vf.evaluate(() => ({ tod: document.body.dataset.tod || '', night: document.body.classList.contains('nighttint') }));
      await p.locator('#eden-map-root .em-clock').click(); await B.wait(200);
      const pop = await p.evaluate(() => { const q = document.querySelector('#eden-map-root .em-clock-pop'); return q && !q.hidden ? [...q.querySelectorAll('button')].map(b => b.dataset.band) : null; });
      rep.check('U-FIX-4: a click on the clock chip opens the period popover (follow + the pack bands)', !!pop && pop[0] === '' && pop.length >= 3, JSON.stringify(pop));
      await p.keyboard.press('Escape'); await B.wait(200);
      const esc = await p.evaluate(() => ({ pop: document.querySelector('#eden-map-root .em-clock-pop')?.hidden, panel: document.querySelector('#eden-map-root .em-panel')?.hidden }));
      rep.check('U-FIX-4 / X-01: Esc closes only the popover (the map panel stays open)', esc.pop === true && esc.panel === false, JSON.stringify(esc));
      await p.locator('#eden-map-root .em-clock').click(); await B.wait(200);
      await p.locator('#eden-map-root .em-clock-pop button[data-band="day"]').click(); await B.wait(1500);
      const day = await vf.evaluate(() => ({ tod: document.body.dataset.tod || '', night: document.body.classList.contains('nighttint') }));
      const chip = await p.evaluate(() => { const c = document.querySelector('#eden-map-root .em-clock'); return { view: c.dataset.view || '', band: c.dataset.band, text: c.textContent.trim() }; });
      rep.check('U-FIX-4: picking 白天 turns the night look off; the chip marks the preview and keeps the chat time', (before.night || before.tod === 'night') && !day.night && day.tod === '' && chip.view === 'day' && chip.band === 'day' && /23:00/.test(chip.text), JSON.stringify({ before, day, chip }));
      await p.locator('#eden-map-root .em-clock').click(); await B.wait(200);
      await p.locator('#eden-map-root .em-clock-pop button[data-band="dusk"]').click(); await B.wait(1200);
      const dusk = await vf.evaluate(() => document.body.dataset.tod || '');
      await p.locator('#eden-map-root .em-clock').click(); await B.wait(200);
      await p.locator('#eden-map-root .em-clock-pop button[data-band=""]').click(); await B.wait(1500);
      const back = await vf.evaluate(() => ({ tod: document.body.dataset.tod || '', night: document.body.classList.contains('nighttint') }));
      rep.check('U-FIX-4: 黄昏 shows the dusk look, 跟随聊天时间 returns to the chat period', dusk === 'dusk' && (back.night || back.tod === 'night'), JSON.stringify({ dusk, back }));
      await B.shot(p, OUT, 'ufix4-clock');
    }
  } finally { await P.close(); }
} catch (e) { rep.check('probe ran to the end', false, String(e.message).split('\n')[0]); }
const ok = rep.save(); await B.closeAll(); srv.stop();
process.exit(ok ? 0 : 1);
