// AMBIENT-SOUND probe: the eden tier-ambience sound layer (docs/layers-schema.md §12, K-R89 amended) — per-tier file loops, quieter at night, silent when hidden, no autoplay before a gesture.
//   node tools/browser/ambient_sound.mjs <out dir>
// Checks:
//   (a) tc_mid: the row exists with the pack's label, unticked, no AudioContext, the layer listed inactive
//   (b) a real click makes exactly one AudioContext; the middle tier plays crowd + rail at the rule gains; both file buffers are ready
//   (c) the tiers swap: tc_upper wind + birds, tc_low factory + steam
//   (d) eden-map:clock night: the upper tier keeps only wind, the middle only rail, the low keeps both quieter (gains drop)
//   (e) the page hidden suspends the context, visible resumes it
//   (f) unticking silences (no scene) and stores "0"
//   (g) a stored "on" waits: no AudioContext before the first real click; after it the scenes play
//   (h) all twelve loop files serve 200 from the pack base
import path from 'node:path';
import * as B from './lib.mjs';

const OUT = process.argv[2] || '/tmp/ambient_sound';
const rep = B.reporter(OUT);
const srv = await B.ensureServer();
const initEden = [o => {
  try { if (o.layers) localStorage.setItem('edenMapLayers', o.layers); } catch (e) {}
  try { const A = window.AudioContext; window.__acCount = 0; if (A) window.AudioContext = class extends A { constructor(...a) { super(...a); window.__acCount++; } }; } catch (e) {}   // counts the AudioContexts this page makes
}, { layers: '' }];
const frameOf = P => P.page.frames().find(f => f.url().includes('viewer.html'));
const ready = async f => { await f.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 30000, polling: 50 }).catch(() => {}); await B.wait(1500); };
async function openEden(P, q = '') {
  await P.page.setViewportSize({ width: 1440, height: 1300 });   // the 19-row layer pop has no inner scroll; at 900 px the ambience row would fall off the framed viewport
  const f = await B.openInHost(P, B.BASE + 'viewer.html' + q); await ready(f);
  await f.evaluate(() => ViewerDebug.showLay(true)); await B.wait(300);
  return f;
}
const hostPost = (P, m) => P.page.evaluate(msg => document.getElementById('f').contentWindow.postMessage(msg, '*'), { v: 2, ...m });
const go = async (f, id) => { await f.evaluate(m => ViewerDebug.go(m), id); await B.wait(2600); };   // the replan is throttled to 2 s
const row = (f, id) => f.evaluate(i => { const l = document.getElementById('lyr-' + i); return l ? { hidden: l.hidden, checked: !!l.querySelector('input')?.checked, text: l.querySelector('span')?.textContent } : null; }, id);
const sound = f => f.evaluate(() => ({ ac: window.__acCount, state: window.SoundApi?.state?.() || 'none',
  layer: (window.SoundApi?.describe?.() || []).find(d => d.id === 'tier-ambience') || null }));

try {
  const P = await B.newPage('desktop', { lang: 'zh', tier: 'save', scheme: 'dark', init: initEden });
  const f = await openEden(P, '?map=tc_mid');

  const a0 = { r: await row(f, 'tier-ambience'), s: await sound(f) };
  rep.check('(a) tc_mid: the tier-ambience row exists with the pack\'s label, unticked; no AudioContext; SoundApi lists the layer inactive',
    a0.r && !a0.r.hidden && !a0.r.checked && a0.r.text === '天城环境声' && a0.s.ac === 0 && a0.s.layer?.id === 'tier-ambience' && !a0.s.layer.active && !a0.s.layer.scenes.length, JSON.stringify(a0));

  await f.click('#lyr-tier-ambience'); await B.wait(3000);
  const b0 = { r: await row(f, 'tier-ambience'), s: await sound(f) };
  rep.check('(b) a real click: exactly one AudioContext, running; tc_mid plays crowd + rail at the rule gains 0.16 / 0.13',
    b0.r?.checked && b0.s.ac === 1 && b0.s.state === 'running' && b0.s.layer?.active && b0.s.layer.scenes.join() === 'crowd,rail' && b0.s.layer.gains.join() === '0.16,0.13', JSON.stringify(b0));
  rep.check('(b) both file loops of the middle tier fetched and decoded (ogg ready)', b0.s.layer?.loops?.length === 2 && b0.s.layer.loops.every(l => l.ready), JSON.stringify(b0.s.layer?.loops));

  await go(f, 'tc_upper');
  const c1 = await sound(f);
  rep.check('(c) tc_upper plays wind + birds (gains 0.2 / 0.14)', c1.layer?.scenes.join() === 'wind,birds' && c1.layer.gains.join() === '0.2,0.14' && c1.layer.loops.every(l => l.ready), JSON.stringify(c1));
  await go(f, 'tc_low');
  const c2 = await sound(f);
  rep.check('(c) tc_low plays factory + steam (gains 0.18 / 0.12)', c2.layer?.scenes.join() === 'factory,steam' && c2.layer.gains.join() === '0.18,0.12', JSON.stringify(c2));

  await hostPost(P, { type: 'eden-map:clock', night: true }); await B.wait(2800);
  const d1 = await sound(f);
  rep.check('(d) night on tc_low: the same two scenes, quieter (0.1 / 0.07)', d1.layer?.scenes.join() === 'factory,steam' && d1.layer.gains.join() === '0.1,0.07', JSON.stringify(d1));
  await go(f, 'tc_mid');
  const d2 = await sound(f);
  rep.check('(d) night on tc_mid: only the rail hum is left', d2.layer?.scenes.join() === 'rail', JSON.stringify(d2));
  await go(f, 'tc_upper');
  const d3 = await sound(f);
  rep.check('(d) night on tc_upper: only the wind, no birds', d3.layer?.scenes.join() === 'wind' && d3.layer.gains.join() === '0.1', JSON.stringify(d3));

  await f.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); }); await B.wait(1200);
  const e1 = await sound(f);
  rep.check('(e) the page hidden suspends the AudioContext', e1.state === 'suspended' && e1.ac === 1, JSON.stringify(e1));
  await f.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); }); await B.wait(1200);
  const e2 = await sound(f);
  rep.check('(e) visible again resumes it (still one context, the scenes still listed)', e2.state === 'running' && e2.ac === 1 && e2.layer?.scenes.join() === 'wind', JSON.stringify(e2));

  await f.click('#lyr-tier-ambience', { position: { x: 20, y: 8 } }); await B.wait(900);   // the wrapped row is tall; its center can fall outside the framed viewport
  const g1 = { r: await row(f, 'tier-ambience'), s: await sound(f), st: await f.evaluate(() => localStorage.getItem('edenMapLayers')) };
  rep.check('(f) unticking silences the layer (no active scene) and stores "tier-ambience":"0"', g1.r?.checked === false && !g1.s.layer?.active && g1.s.layer?.scenes.length === 0 && /"tier-ambience":"0"/.test(g1.st || ''), JSON.stringify(g1));
  await P.ctx.close();

  {   // (g) a stored "on" waits for the first real click
    const Q = await B.newPage('desktop', { lang: 'zh', tier: 'save', scheme: 'dark', init: [initEden[0], { layers: JSON.stringify({ 'tier-ambience': '1' }) }] });
    const g = await openEden(Q, '?map=tc_mid');
    const s0 = await sound(g), r0 = await row(g, 'tier-ambience');
    rep.check('(g) a stored "on": the row reads ticked and no AudioContext exists before a user gesture', r0?.checked && s0.ac === 0, JSON.stringify({ r0, s0 }));
    await Q.page.mouse.click(400, 400); await B.wait(3000);
    const s1 = await sound(g);
    rep.check('(g) after the first real click the context is made and the middle-tier loops play', s1.ac === 1 && s1.layer?.active && s1.layer.scenes.join() === 'crowd,rail' && s1.layer.loops.every(l => l.ready), JSON.stringify(s1));
    await Q.ctx.close();
  }

  {   // (h) the twelve loop files serve from the pack base
    const R = await B.newPage('desktop', { lang: 'zh', tier: 'save', scheme: 'dark' });
    await R.page.goto(B.BASE + 'viewer.html', { waitUntil: 'commit' }); await ready(R.page);
    const files = await R.page.evaluate(async () => { const ids = ['wind', 'birds', 'crowd', 'rail', 'factory', 'steam'];
      const out = {}; for (const id of ids) { const r = {}; for (const ext of ['ogg', 'mp3']) { try { const x = await fetch('packs/eden/ambient/' + id + '.' + ext); r[ext] = x.ok ? (await x.blob()).size : 0; } catch (e) { r[ext] = 0; } } out[id] = r; } return out; });
    const bad = Object.entries(files).filter(([, r]) => !r.ogg || !r.mp3 || r.ogg > 400 * 1024 || r.mp3 > 400 * 1024);
    rep.check('(h) all twelve loops fetch 200 from the pack base and each is ≤ 400 KB', bad.length === 0, JSON.stringify(files));
    rep.check('no page errors (loops page)', !R.errors.length, R.errors.join(' | '));
    await R.ctx.close();
  }
  rep.check('no page errors (eden ambience)', !P.errors.length, P.errors.join(' | '));
} catch (err) { rep.check('probe ran to the end', false, String(err?.stack || err).slice(0, 1600)); }
const ok = rep.save();
await B.closeAll(); srv.stop();
console.log(ok ? '全部通过' : '有失败');
process.exit(ok ? 0 : 1);
