// S4-1 probe: the event taxonomy, screen effect and default-off come from the pack's events block, not from type names.
//   node tools/browser/events_fx.mjs [outDir] [--shots ~/eden-map-review/s4]
// Checks: (1) a glitch-type event posted through the script's own parser turns the screen effect on (body[data-glitch], the note), a closed one turns it off;
// (2) an item that carries `fx: glitch` on another type triggers it (declaration, not a name); an item of the glitch type WITHOUT fx (an older script) still does, resolved by the viewer;
// (3) the effect does not depend on the type name: an item with neither fx nor a glitch type does nothing; (4) the default-off type is hidden on the map until the user touches the legend;
// (5) items without group / icon / colour (navigator ops) are filled from the taxonomy; (6) the legend lists the pack's groups in its order.
import path from 'node:path';
import os from 'node:os';
import * as B from './lib.mjs';

const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/events_fx';
const shotsAt = process.argv.indexOf('--shots'), SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1].replace(/^~/, os.homedir()) : null;
B.quietWait();
const srv = await B.ensureServer(), rep = B.reporter(OUT);
try {
  const P = await B.newPage('desktop'), p = P.page;
  await B.openViewer(P, { map: 'tc_mid' }); await B.wait(800);
  const fr = p.mainFrame(), glitch = () => p.evaluate(() => ({ lv: document.body.dataset.glitch || '', note: !document.querySelector('#glitchNote')?.hidden }));
  const evs = () => p.evaluate(() => ({ dots: document.querySelectorAll('.ev').length, list: document.querySelectorAll('#evlist li').length,
    legend: [...document.querySelectorAll('.evleg button')].map(b => b.dataset.g), off: localStorage.getItem('edenMapEvOff') }));

  await B.postEvents(fr, [{ floor: 50, text: '<span style="display:none">⌖网络攻击｜中层·商业区｜3｜全息广告被劫持</span>' }], true); await B.wait(700);
  let g = await glitch(); rep.check('glitch-type event (parsed by the script): effect on, strongest level, note shown', g.lv === '3' && g.note, JSON.stringify(g));
  if (SHOTS) await B.shot(p, SHOTS, 'glitch');
  await B.shot(p, OUT, 'glitch');
  let s = await evs(); rep.check('the legend lists the pack\'s groups, in its order', s.legend.length >= 1 && s.legend[0] === '媒体', s.legend.join(','));

  await B.postEvents(fr, [{ floor: 51, text: '<span style="display:none">⌖网络攻击｜中层·商业区｜0｜广告屏恢复</span>' }], true); await B.wait(700);
  g = await glitch(); rep.check('closing the event turns the effect off', g.lv === '' && !g.note, JSON.stringify(g));

  const item = (over) => ({ id: 'x' + Math.random().toString(36).slice(2, 7), key: 'k', cat: '火灾', layer: '中层', place: '商业区', lvl: 2, text: 't', src: '', first: 60, last: 60, count: 1, closed: false, tier: 'live', isNew: true, ...over });
  const post = items => p.evaluate(m => TCEvents.set(m), { type: 'eden-map:events', items, floor: 60 });
  await post([item({ cat: '火灾', fx: { block: 'glitch' } })]); await B.wait(500);
  g = await glitch(); rep.check('an item that declares fx: glitch on another type triggers it (declaration, not name)', g.lv === '2' && g.note, JSON.stringify(g));
  await post([item({ cat: '网络攻击' })]); await B.wait(500);
  g = await glitch(); rep.check('the glitch type without fx in the item (older script): resolved by the viewer', g.lv === '2', JSON.stringify(g));
  await post([item({ cat: '火灾' })]); await B.wait(500);
  g = await glitch(); rep.check('a type without the glitch block does nothing', g.lv === '', JSON.stringify(g));

  await post([item({ cat: '降雨', lvl: 1, text: 'rain' }), item({ cat: '火灾', text: 'fire' })]); await B.wait(500);
  s = await evs(); rep.check('the default-off type is hidden on the map and in the list until the legend is touched', s.off === null && s.dots === 1 && s.list === 1, JSON.stringify(s));
  await p.evaluate(() => { const b = document.querySelector('.evleg button'); b && b.click(); }); await B.wait(300);
  s = await evs(); rep.check('touching the legend stores the user filter (no default any more)', s.off !== null, JSON.stringify(s));

  await post([{ cat: '火灾', layer: '中层', place: '商业区', lvl: 2, text: 'op', src: 'op', floor: 60, last: 60, first: 60, id: 'op1', key: 'op1', count: 1, closed: false, tier: 'live' }]); await B.wait(500);
  const op = await p.evaluate(() => TCEvents.events.find(e => e.id === 'op1'));
  rep.check('items without group / icon / colour are filled from the taxonomy', op && op.grp === '灾害' && op.ch === '火' && /^#/.test(op.color), JSON.stringify(op && [op.grp, op.ch, op.color]));
  rep.check('no page errors', P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
} finally { await B.closeAll(); srv.stop(); }
process.exit(rep.save() ? 0 : 1);
