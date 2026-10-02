// PLACE-1b probe 3D 标注唯一性：每一层里同一个节点、同一个名字只有一个可见标注（用户 2026-10-02：医疗与改造室在 B2 上标了两次）。
// B2 与 F1 各切一次，读三维页的标注台账与画布上真正可见的标注文字。1440 与 375 px。
//   node tools/browser/estate_labels_unique.mjs [out dir]
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/estate_labels_unique';
const rep = B.reporter(OUT);
B.quietWait();
const srv = await B.ensureServer();
const until = async (fn, ms = 8000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await B.wait(150); } };
const dups = (rows, key) => { const seen = new Map(), out = []; for (const r of rows) { const k = key(r); if (seen.has(k)) out.push(k); else seen.set(k, r.name); } return out; };
const visible = ef => ef.evaluate(() => {
  const on = [...document.querySelectorAll('.lbl')].filter(e => e.style.display !== 'none' && !e.classList.contains('hide') && e.firstChild.getBoundingClientRect().width > 0);
  return on.map(e => e.textContent);
});
try {
  for (const [w, preset] of [['1440', 'desktop'], ['375', 'phone']]) {
    const P = await B.newPage(preset, { tier: 'save', scheme: 'dark' });
    try {
      const H = await openHost(P, { here: '伊甸庄园·惩罚室', msgs: [], chat: 'elu-' + w });
      await H.open(); const vf = await H.viewer();
      await vf.evaluate(() => ViewerDebug.go('eden_estate'));
      const ef = await until(async () => { const el = await vf.$('#estate'); const fr = el && await el.contentFrame(); return fr && await fr.evaluate(() => !!window.__estate && window.__estateFirstFrame === true).catch(() => false) ? fr : null; }, 60000);
      if (!ef) throw new Error('no estate frame');
      for (const f of ['B2', 'F1']) {
        await until(() => vf.evaluate(id => !!document.querySelector(`#layers [data-floor="${id}"]`), f), 10000).catch(() => {});
        await vf.evaluate(id => document.querySelector(`#layers [data-floor="${id}"]`).click(), f);
        await B.wait(2500);
        const named = await ef.evaluate(() => window.__estate.labels.named());
        const byNode = dups(named.filter(r => r.node), r => `${r.floor}|${r.node}`);
        const byName = dups(named.filter(r => r.floor === f), r => `${r.floor}|${r.name}`);
        rep.check(`${w} ${f}: one label per node on that floor (${named.filter(r => r.floor === f).length} labelled)`, byNode.length === 0, JSON.stringify(byNode));
        rep.check(`${w} ${f}: no room name is labelled twice on that floor`, byName.length === 0, JSON.stringify(byName));
        const vis = await visible(ef), visDup = dups(vis.map(t => ({ name: t })), r => r.name);
        rep.check(`${w} ${f}: the visible labels on the floor carry no repeated name (${vis.length} visible)`, visDup.length === 0, JSON.stringify(visDup));
        if (f === 'B2') await B.shot(P.page, OUT, `${w}-b2-labels`);
      }
      const med = await ef.evaluate(() => window.__estate.labels.named().filter(r => r.name === '医疗与改造室').length);
      rep.check(`${w}: 医疗与改造室 is labelled at most once in the whole building`, med <= 1, String(med));
    } catch (e) { rep.check(`${w}: probe ran`, false, e.message.split('\n')[0]); await B.shot(P.page, OUT, `fail_${w}`).catch(() => {}); }
    await P.close();
  }
} finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(ok ? 'all passed' : 'failures'); process.exit(ok ? 0 : 1);
