// S7-3 T8 probe (P3-2): the 3D interior viewer needs no word of the first pack. The fixture pack pack3d-min (tests/fixtures/pack3d-min: one GLB, two floors, three rooms, no building words)
// opens in the main shell: the level strip shows its floor ids, a room card opens from the building's room list, a person placed in a room lands as a chip, and no word of the first
// pack's manifest (title, floors, kind labels) is in the 3D page's DOM text or its accessible names.
//   node tools/browser/estate_generic.mjs [out dir]
import * as B from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/estate_generic';
const FIX = fileURLToPath(new URL('../../tests/fixtures/pack3d-min/', import.meta.url)), EDEN = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../map/estate/model/manifest.json', import.meta.url)), 'utf8'));
const WORDS = [EDEN.building.title, EDEN.building.subtitle, EDEN.building.summary, EDEN.building.i18n.en.title, ...EDEN.floors.flatMap(f => [f.label, f.i18n.en.label]), ...Object.values(EDEN.room_kinds).flatMap(k => [k.label, k.i18n.en.label]), '伊甸', '庄园', 'Eden'];
const rep = B.reporter(OUT);
B.quietWait();
const srv = await B.ensureServer();
const until = async (fn, ms = 8000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await B.wait(150); } };
try {
  for (const [w, preset] of [['1440', 'desktop'], ['375', 'phone']]) {
    const P = await B.newPage(preset, { tier: 'save', scheme: 'dark' });
    try {
      await P.ctx.route('**/packs/pack3d-min/**', route => { const rel = new URL(route.request().url()).pathname.split('/packs/pack3d-min/')[1], f = path.join(FIX, rel);
        if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return route.fulfill({ status: 404, body: 'nope' });
        route.fulfill({ status: 200, body: fs.readFileSync(f), contentType: f.endsWith('.json') ? 'application/json' : f.endsWith('.glb') ? 'model/gltf-binary' : 'text/plain', headers: { 'access-control-allow-origin': '*' } }); });
      const pg = P.page; await pg.goto(B.BASE + 'viewer.html?pack=pack3d-min', { waitUntil: 'commit' });
      await pg.waitForFunction(() => window.ViewerDebug?.currentMapId === 'hall', null, { timeout: 40000 }).catch(() => {});
      const ef = await until(async () => { const el = await pg.$('#estate'); const fr = el && await el.contentFrame(); return fr && await fr.evaluate(() => window.__estateFirstFrame === true).catch(() => false) ? fr : null; }, 60000);
      rep.check(`${w}: the fixture pack opens its 3D building page in the shell`, !!ef && await ef.evaluate(() => document.body.classList.contains('shell')), JSON.stringify({ map: await pg.evaluate(() => window.ViewerDebug?.currentMapId) }));
      if (!ef) throw new Error('no estate frame');
      await B.wait(1500);
      const strip = await pg.evaluate(() => [...document.querySelectorAll('#layers [data-floor]')].map(b => b.dataset.floor));
      rep.check(`${w}: the level strip shows its floor ids`, strip.join() === 'L2,L1', strip.join());
      const list = await pg.evaluate(() => [...document.querySelectorAll('#cardEmpty .v3room')].map(b => b.textContent));
      rep.check(`${w}: the drawer's place tab lists the three rooms by floor`, ['Atrium', 'Workshop', 'Loft'].every(n => list.includes(n)), list.join());
      await pg.evaluate(() => { document.querySelector('#cardEmpty .v3rooms details')?.setAttribute('open', ''); [...document.querySelectorAll('#cardEmpty .v3room')].find(b => b.textContent === 'Atrium')?.click(); }); await B.wait(1500);
      const card = await pg.evaluate(() => ({ title: document.getElementById('cardTitle')?.textContent, shown: !document.getElementById('card').hidden, text: document.getElementById('card').textContent }));
      rep.check(`${w}: a room card opens (title, kind label = the kind id, area)`, card.shown && card.title === 'Atrium' && /hall/.test(card.text) && /192/.test(card.text), JSON.stringify(card).slice(0, 220));
      await pg.evaluate(() => { document.dispatchEvent(new Event('x')); CharactersView.set({ items: [{ name: 'Mira', place: 'Atrium', floor: 1, src: 'tag' }] }); }); await B.wait(800);
      const chip = await until(async () => (await ef.evaluate(() => [...document.querySelectorAll('.pc')].map(b => b.dataset.name))).includes('Mira'), 6000);
      rep.check(`${w}: a person placed in the Atrium lands as a chip in that room`, chip, '');
      const leak = await ef.evaluate(words => { const t = document.documentElement.innerText + ' ' + [...document.querySelectorAll('[aria-label],[title]')].map(e => (e.getAttribute('aria-label') || '') + ' ' + (e.title || '')).join(' ') + ' ' + document.title; return words.filter(x => x && t.includes(x)); }, WORDS);
      const vleak = await pg.evaluate(words => { const t = document.getElementById('cardEmpty').textContent + document.getElementById('card').textContent + document.getElementById('layers').textContent + (document.getElementById('v3seg')?.textContent || ''); return words.filter(x => x && t.includes(x)); }, WORDS);
      rep.check(`${w}: no word of the first pack's manifest is in the page or the shell's 3D surfaces`, !leak.length && !vleak.length, JSON.stringify({ leak, vleak }));
      await B.shot(pg, OUT, `${w}-generic`);
    } catch (e) { rep.check(`${w}: run`, false, String(e?.message || e).split('\n')[0]); }
    await P.close();
  }
} finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(ok ? '全部通过' : '有失败'); process.exit(ok ? 0 : 1);
