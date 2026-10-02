// UI-3D-1 probe: the 3D floor strip shows floor codes only (full names in aria / title), the zoom stack has no visible text, and on the B1 section no two visible room labels overlap.
//   node tools/browser/ui3d1.mjs [out dir]     (1440 and 375 px; shots land in the out dir)
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/ui3d1';
const rep = B.reporter(OUT);
B.quietWait();
const srv = await B.ensureServer();
const until = async (fn, ms = 6000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await B.wait(150); } };
const labels = ef => ef.evaluate(() => [...document.querySelectorAll('.lbl')].filter(e => e.style.display !== 'none' && !e.classList.contains('hide') && !e.classList.contains('occl') && e.firstChild.getBoundingClientRect().width > 0).map(e => { const r = e.firstChild.getBoundingClientRect(); return { t: e.textContent, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; }));
const hits = ls => { const o = []; for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) { const a = ls[i], b = ls[j]; if (a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0) o.push(a.t + ' / ' + b.t); } return o; };
try {
  for (const [w, preset] of [['1440', 'desktop'], ['375', 'phone']]) {
    const P = await B.newPage(preset, { tier: 'save', scheme: 'dark' });
    try {
      const H = await openHost(P, { here: '伊甸庄园·主调教室', msgs: [], chat: 'u3-' + w }); await H.open(); const vf = await H.viewer();
      await vf.evaluate(() => ViewerDebug.go('eden_estate'));
      const ef = await until(async () => { const el = await vf.$('#estate'); const fr = el && await el.contentFrame(); return fr && await fr.evaluate(() => !!window.__estate && window.__estateFirstFrame === true).catch(() => false) ? fr : null; }, 60000);
      if (!ef) throw new Error('no estate frame');
      await B.wait(1500);
      await until(() => vf.evaluate(() => !!document.querySelector('#layers [data-floor="B1"]')), 8000);
      const strip = await vf.evaluate(() => [...document.querySelectorAll('#layers [data-floor]')].map(b => ({ id: b.dataset.floor, text: b.textContent.trim(), aria: b.getAttribute('aria-label') || '', title: b.title, small: b.querySelectorAll('small').length })));
      rep.check(`${w}: the strip shows the floor codes only, full names in aria-label and title`, strip.length >= 5 && strip.every(s => s.text === s.id && s.small === 0 && s.aria.length > s.id.length && s.title), JSON.stringify(strip));
      const z = await vf.evaluate(() => [...document.querySelectorAll('#zoom button')].map(b => ({ id: b.id, text: b.textContent.trim(), aria: b.getAttribute('aria-label') || '', title: b.title })));
      rep.check(`${w}: the zoom stack has no visible text, every button has aria-label and tooltip`, z.length >= 4 && z.every(b => b.text === '' && b.aria && b.title), JSON.stringify(z));
      const dockTxt = await vf.evaluate(() => [...document.querySelectorAll('#zoom button, #dock > button, #v3btn')].filter(b => b.getBoundingClientRect().width > 0).map(b => ({ id: b.id, text: b.textContent.trim() })).filter(b => b.text));
      rep.check(`${w}: no compact button in the dock carries visible text`, dockTxt.length === 0, JSON.stringify(dockTxt));
      const ooc = await vf.evaluate(async () => { const b = document.getElementById('oocBtn'); if (!b) return null; const r0 = b.getBoundingClientRect(); b.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise(r => setTimeout(r, 300)); const m = document.getElementById('oocMenu'); const items = [...m.querySelectorAll('[data-ooc]')].map(x => x.textContent); const open = !m.hidden; m.querySelector('[data-ooc]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); return { text: b.textContent.trim(), aria: b.getAttribute('aria-label'), w: r0.width, items, open, closed: m.hidden }; });
      rep.check(`${w}: the map has an icon-only 「提醒 AI」 entry that opens the template menu and closes after a pick`, !!ooc && ooc.text === '' && ooc.aria === '提醒 AI' && ooc.w >= 40 && ooc.items.length === 4 && ooc.open && ooc.closed, JSON.stringify(ooc));
      await vf.evaluate(() => document.querySelector('#layers [data-floor="B1"]').click()); await B.wait(3500);
      await B.shot(P.page, OUT, `${w}-b1`);
      const ls = await labels(ef), bad = hits(ls);
      rep.check(`${w}: on B1 no two visible room labels overlap (${ls.length} labels)`, ls.length > 0 && bad.length === 0, JSON.stringify(bad));
      // orbit and zoom: the labels are re-planned on every move; the planned set never overlaps (a label hidden by the building and shown again keeps its real width)
      const box = await (await vf.$('#estate')).boundingBox(), cx = box.x + box.width * 0.45, cy = box.y + box.height * 0.5, sweep = [];
      for (const [dx, dy, wheel] of [[160, 0, 0], [-300, 0, 0], [450, 0, 0], [0, 60, 0], [300, 0, 0], [300, 0, 0], [0, 0, 400], [120, -40, -300], [250, 0, 0], [-200, 30, 0]]) {
        await P.page.mouse.move(cx, cy); await P.page.mouse.down(); await P.page.mouse.move(cx + dx, cy + dy, { steps: 8 }); await P.page.mouse.up();
        if (wheel) await P.page.mouse.wheel(0, wheel); await B.wait(900);
        const l2 = await labels(ef), b2 = hits(l2); if (b2.length) sweep.push(b2.join('; ')); else if (process.env.DUMP) console.log(l2.map(x => x.t).join(','));
      }
      await B.shot(P.page, OUT, `${w}-b1-after-orbit`);
      rep.check(`${w}: after orbiting and zooming on B1 no two visible room labels overlap`, sweep.length === 0, JSON.stringify(sweep));
    } catch (e) { rep.check(`${w}: probe ran`, false, e.message.split('\n')[0]); }
    await P.close();
  }
} finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(ok ? 'all passed' : 'failures'); process.exit(ok ? 0 : 1);
