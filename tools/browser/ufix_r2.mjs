// FIX-R2 probe (TT sweep-2 P2 batch, docs/todo.md U-FIX-8): one check per finding the browser can see, run inside the tavern host stub.
//   node tools/browser/ufix_r2.mjs [out dir] [--only=sw203,sw204,…]
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const args = process.argv.slice(2), OUT = args.find(a => !a.startsWith('--')) || '/tmp/ufix_r2';
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = k => !only.length || only.includes(k);
const rep = B.reporter(OUT);
B.quietWait();
const srv = await B.ensureServer();
const STAT = { 世界: { 当前日期: '新历2088年01月01日', 当前时刻: '23:00', 当日时段: '' } };

try {
  const P = await B.newPage('desktop', { tier: 'save', scheme: 'dark' });
  try {
    const H = await openHost(P, { here: '伊甸庄园·主卧', stat: STAT, chat: 'ufixr2', msgs: [{ message_id: 1, message: '绫濑遥走进主卧。' }, { message_id: 2, message: '绫濑遥坐下。' }] });
    await H.open();
    const p = P.page, vf = await H.viewer();

    if (want('sw203') || want('sw206')) {
      // SW2-03: the 高级 page keeps its layout when the pack picker's index arrives late; SW2-06: no empty 开发者 heading
      await p.route('**/packs/index.json', r => setTimeout(() => r.continue().catch(() => {}), 1500));
      await vf.evaluate(() => SettingsApi.open('adv')); await B.wait(300);
      const y0 = await vf.evaluate(() => document.getElementById('hintAgain')?.getBoundingClientRect().top ?? -1);
      await B.wait(2500);
      const y1 = await vf.evaluate(() => document.getElementById('hintAgain')?.getBoundingClientRect().top ?? -1);
      rep.check('SW2-03: 再看一次 does not move after the pack picker arrives (the rows are placed first)', y0 > 0 && Math.abs(y1 - y0) < 1, JSON.stringify({ y0, y1 }));
      const dev = await vf.evaluate(() => { const d = document.getElementById('devBox'); if (!d) return { none: true }; const rows = [...d.querySelectorAll('.hrow, label.row')].filter(r => !r.hidden); return { hidden: d.hidden, open: d.open, rows: rows.length, shown: d.getClientRects().length > 0 }; });
      rep.check('SW2-06: the 开发者 group is either absent or has rows to show', dev.none || dev.hidden || dev.rows > 0, JSON.stringify(dev));
      await B.shot(p, OUT, 'sw203-adv');
      await vf.evaluate(() => ViewerDebug.showSet(false));
    }

    if (want('sw204')) {
      await p.locator('#eden-map-root .em-tl-btn').click({ timeout: 4000 }).catch(() => {}); await B.wait(800);
      const lab = await p.evaluate(() => document.querySelector('#eden-map-root .em-tl-v')?.textContent || '');
      rep.check('SW2-04: replay at the newest floor names the live place', /伊甸庄园/.test(lab) && /聊天第 2 楼/.test(lab), lab);
      await p.locator('#eden-map-root .em-tl-x').click().catch(() => {}); await B.wait(300);
    }

    if (want('sw207')) {
      await vf.evaluate(() => ViewerDebug.go('tc_upper')); await B.wait(3000);
      await B.wait(600);   // the declutter pass runs 80 ms after the last move
      const r = await vf.evaluate(() => { const o = document.querySelector('#osd').getBoundingClientRect();
        return [...document.querySelectorAll('.mk')].map(m => [m.dataset.name, m.querySelector('.pin')?.getBoundingClientRect(), m.querySelector('.lab')?.getBoundingClientRect()])
          .filter(([, q, l]) => q?.width && l?.width && q.left >= o.left && q.right <= o.right && q.top >= o.top && q.bottom <= o.bottom)
          .filter(([, , l]) => l.top < o.top + 4).map(([n, , l]) => `${n} name top ${Math.round(l.top)} < frame ${Math.round(o.top)}`); });
      rep.check('SW2-07: on tc_upper the name of a pin at the top edge stays inside the frame', r.length === 0, r.join('; '));
      await B.shot(p, OUT, 'sw207-upper');
    }
  } finally { await P.close(); }
} catch (e) { rep.check('probe ran to the end', false, String(e.message).split('\n')[0]); }
const ok = rep.save(); await B.closeAll(); srv.stop();
process.exit(ok ? 0 : 1);
