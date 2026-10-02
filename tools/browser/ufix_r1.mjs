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
  const P = await B.newPage('desktop', { tier: 'save', scheme: 'dark', init: [() => { try { localStorage.setItem('edenMapFps', '1'); } catch (e) {} }, {}] });   // S-05: a stale debug flag from older builds
  try {
    const H = await openHost(P, { here: '伊甸庄园·主卧', stat: STAT, chat: 'ufixr1', msgs: [{ message_id: 3, message: '绫濑遥从地上捡起了一把「黄铜钥匙」，收进口袋。' }] });
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

    if (want('ufix2')) {
      await B.wait(1500);
      const inv = await vf.evaluate(async () => { window.ViewerDrawer?.setTab?.('it', 'half'); await new Promise(r => setTimeout(r, 800)); const t = document.body.innerText; window.ViewerDrawer?.set?.('peek'); return t.includes('黄铜钥匙'); });
      rep.check('U-FIX-2: the pickup sentence puts 黄铜钥匙 into Items (host stub, one assistant message)', inv, String(inv));
    }

    if (want('ufix5')) {
      const go = async m => { await vf.evaluate(m => ViewerDebug.go(m), m); await B.wait(m === 'eden_estate' ? 9000 : 3000); };
      const hud = await vf.evaluate(() => !!document.getElementById('fpsMeter') && getComputedStyle(document.getElementById('fpsMeter')).display !== 'none');
      rep.check('U-FIX-5 S-05: a stale edenMapFps = 1 no longer shows the debug fps HUD', !hud, String(hud));
      // H2-01: the place field names the building and the room
      const here = await p.evaluate(() => document.querySelector('#eden-map-root .em-here .em-nm')?.textContent || '');
      rep.check('U-FIX-5 H2-01: the place field reads 「楼 · 房间」', here === '伊甸庄园 · 主卧', here);
      // U-01: names stay inside the map edge (the pin on the map)
      await go('tc_upper');
      const clip = await vf.evaluate(() => { const o = document.querySelector('#osd').getBoundingClientRect(), S = window.ViewerDrawer, d = S?.el && !S.el.hidden ? S.el.getBoundingClientRect() : null, R = d?.width && d.left > o.left + o.width / 2 ? Math.min(o.right, d.left) : o.right;
        return [...document.querySelectorAll('.mk:not(.lhide)')].map(m => [m.dataset.name, m.querySelector('.lab')?.getBoundingClientRect(), m.querySelector('.pin')?.getBoundingClientRect()])
          .filter(([n, l, q]) => l?.width && q?.width && q.left >= o.left && q.right <= R && getComputedStyle(document.querySelector(`.mk[data-name="${CSS.escape(n)}"] .lab`)).visibility !== 'hidden')
          .filter(([, l]) => l.left < o.left - 1 || l.right > R + 1).map(([n, l]) => `${n} ${Math.round(l.left)}–${Math.round(l.right)}`); });
      rep.check('U-FIX-5 U-01 / L-01: on tc_upper no visible name runs past the map edge or under the side rail', clip.length === 0, clip.join('; '));
      // W-01: the world keeps no floor buttons of the 3D building
      await go('eden_estate'); await go('world');
      const w = await vf.evaluate(() => ({ floors: document.querySelectorAll('#layers [data-floor]').length, levels: document.querySelectorAll('#layers [data-go]:not([data-act])').length }));
      rep.check('U-FIX-5 W-01: the world view shows no floor or tier buttons of the previous map', w.floors === 0 && w.levels === 0, JSON.stringify(w));
      // E5-03: a new card opens at its top
      await go('tc_mid');
      const top = await vf.evaluate(async () => { const open = n => document.querySelector(`.mk[data-name="${n}"]`)?._open(); open('天城议会'); await new Promise(r => setTimeout(r, 400));
        const sc = document.querySelector('#card').closest('.uis-body') || document.querySelector('#card'); const pad = document.createElement('div'); pad.style.height = '3000px'; document.querySelector('#card .extra').append(pad); sc.scrollTop = 400; const was = sc.scrollTop;
        open('法师塔'); await new Promise(r => setTimeout(r, 400)); return { was, now: sc.scrollTop }; });
      rep.check('U-FIX-5 E5-03: opening another card starts at the top of the drawer', top.was > 0 && top.now === 0, JSON.stringify(top));
      await vf.evaluate(() => ViewerDebug.closeCard?.());
      // R-01 / D1-01 / X-01: the replay bar shows 「聊天第 N 楼」 first; Esc closes the replay bar, not the map
      await p.evaluate(() => { const b = document.querySelector('#eden-map-root .em-tl-btn'); if (b) { b.hidden = false; b.click(); } }); await B.wait(800);
      const tl = await p.evaluate(() => { const v = document.querySelector('#eden-map-root .em-tl-v'); return { text: v?.textContent || '', clipped: v ? v.scrollWidth > v.clientWidth + 1 && v.clientWidth < 60 : true, shown: !document.querySelector('#eden-map-root .em-tl').hidden }; });
      rep.check('U-FIX-5 R-01 / D1-01: the replay label starts with 「聊天第 N 楼」 and is not cut to 「第 …」', tl.shown && /^聊天第 \d+ 楼/.test(tl.text) && !tl.clipped, JSON.stringify(tl));
      await p.locator('#eden-map-root .em-bar').click({ position: { x: 5, y: 5 } }).catch(() => {}); await p.keyboard.press('Escape'); await B.wait(800);
      const ex = await p.evaluate(() => ({ tl: document.querySelector('#eden-map-root .em-tl').hidden, panel: document.querySelector('#eden-map-root .em-panel').hidden }));
      rep.check('U-FIX-5 X-01: Esc with the replay bar open closes the replay bar only', ex.tl === true && ex.panel === false, JSON.stringify(ex));
      // S-02: data page words are neutral (no internal ids)
      const data = await vf.evaluate(async () => { SettingsApi.open('data'); await new Promise(r => setTimeout(r, 1200)); return document.querySelector('#setPop .spage[data-page="data"]')?.innerText || ''; });
      const raw = ['eden_map', 'infer', '\nmvu\n'].filter(w => data.includes(w));
      rep.check('U-FIX-5 S-02: 数据与映射 shows no raw ids (eden_map, infer, mvu)', raw.length === 0, raw.join(', '));
      // S-01: the four rows carry a description
      const hints = await vf.evaluate(async () => { SettingsApi.open('map'); SettingsApi.open('adv'); await new Promise(r => setTimeout(r, 800)); return ['s.rm_hint', 's.auto3d_hint', 's.rot3d_hint', 's.wheel3d_hint'].map(k => !!document.querySelector(`#setPop [data-i18n="${k}"]`)); });
      rep.check('U-FIX-5 S-01: 减少动态 / 三维抽屉 / 三维空闲旋转 / 鼠标滚轮缩放 have a description', hints.every(Boolean), JSON.stringify(hints));
      await vf.evaluate(() => SettingsApi.close?.());
    }
  } finally { await P.close(); }
} catch (e) { rep.check('probe ran to the end', false, String(e.message).split('\n')[0]); }
const ok = rep.save(); await B.closeAll(); srv.stop();
process.exit(ok ? 0 : 1);
