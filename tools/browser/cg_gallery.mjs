// K-R106 media source: the person card's gallery section and the place card's scenes, driven by synthetic card data (a fake name, fake picture paths on the first pack's allowed host;
// the pictures themselves are answered by a routed 1x1 png, nothing is fetched from the network). Desktop, then 375 px once.
// 用法：node tools/browser/cg_gallery.mjs <输出目录>
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2];
if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/cg_gallery.mjs <输出目录>'); process.exit(2); }
B.quietWait();
const srv = await B.ensureServer();
const rep = B.reporter(OUT);
const HERE = '天城下层·施粥站', HOST = 'https://cdn.jsdelivr.net/gh/Yehehua1311/synthetic@main/';
const url = (who, folder, n) => `${HOST}${who}/${folder}/${who}_${n}.png`;
const CARD = { data: { extensions: { tavern_helper: { scripts: [{ data: {} }, { data: { characters: [
  { name: 'Aria', image: url('aria', 'sfw', 0), behaviors: { sfw: [1, 2, 3].map(n => url('aria', 'sfw', n)), 口交: [1, 2].map(n => url('aria', 'nsfw/x', n)), 性交: [] } },
  { name: 'Bram', image: url('bram', 'sfw', 0), behaviors: { sfw: [url('bram', 'sfw', 1)] } },
] } }] } } } };
const MSGS = [
  { message_id: 40, message: 'Aria waved. [Aria][sfw][2] and [Nobody][sfw][1]' },
  { message_id: 41, message: '```\n[Bram][sfw][1]\n```\n<think>[Aria][sfw][1]</think>' },
  { message_id: 42, message: '[Aria][口交][4] [口交][sfw][1]' },
];
const STAT = { 在场人物: { Aria: { 身份: '向导' } } };   // one person with the player, so the map opens a single-person card
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

async function run(name, preset) {
  const P = await B.newPage(preset, { tier: 'save' });
  try {
    await P.page.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'image/png', body: PNG }));
    const H = await openHost(P, { here: HERE, msgs: MSGS, stat: STAT, chat: 'cg-' + name, charData: CARD });
    await H.open();
    const p = P.page, vf = await H.viewer();
    await vf.evaluate(() => { ViewerDebug.closeCard(); ViewerDebug.go('tc_low'); }); await B.wait(2500);
    await vf.waitForFunction(() => window.GalleryView?.scenes.length >= 3, null, { timeout: 8000 }).catch(() => {});
    const s0 = await vf.evaluate(() => ({ chars: GalleryView.table?.chars.map(c => c.name), scenes: GalleryView.scenes.map(s => [s.floor, s.who || s.name, s.cat, s.n, !!s.url, s.place]), sw: GalleryView.on, avail: GalleryView.available }));
    rep.check(`${name} the table and the chat's tags reach the viewer (code block counts, think block does not, unknown name and category-as-name are no scenes)`,
      s0.chars?.join() === 'Aria,Bram' && JSON.stringify(s0.scenes.map(s => s.slice(0, 4))) === JSON.stringify([[40, 'Aria', 'sfw', 2], [41, 'Bram', 'sfw', 1], [42, 'Aria', '口交', 4]]) && s0.sw && s0.avail, JSON.stringify(s0));
    // person card: sections grouped by category, nothing requested until a group is opened
    P.errors.length = 0; let reqs = 0; p.on('request', r => { if (r.url().startsWith(HOST) || r.url().includes('/synthetic@main/')) reqs++; });
    await vf.evaluate(() => CharactersView.cardOf('Aria')); await B.wait(800);
    const c1 = await vf.evaluate(() => { const s = document.querySelector('#card .cg-sec'); return s ? { h: s.querySelector('h3')?.textContent, cats: [...s.querySelectorAll('details.cg-cat')].map(d => d.querySelector('summary').textContent.replace(/\s+/g, ' ').trim()), imgs: s.querySelectorAll('img').length } : null; });
    rep.check(`${name} person card: gallery section by category (declared order, empty category left out), no picture requested before a group is opened`, !!c1 && c1.h === '原作图鉴' && c1.cats.length === 3 && /^sfw 3/.test(c1.cats[0]) && /^口交 2/.test(c1.cats[1]) && c1.imgs === 0 && reqs === 0, JSON.stringify({ c1, reqs }));
    await vf.evaluate(() => document.querySelector('#card .cg-sec details.cg-cat').open = true); await B.wait(800);
    const c2 = await vf.evaluate(() => { const g = [...document.querySelectorAll('#card .cg-sec details.cg-cat')[0].querySelectorAll('img.cg-th')]; return { n: g.length, lazy: g.every(i => i.loading === 'lazy'), host: g.every(i => i.src.startsWith('https://cdn.jsdelivr.net/gh/Yehehua1311/')), noref: g.every(i => i.referrerPolicy === 'no-referrer') }; });
    rep.check(`${name} opening a group builds its lazy thumbnails (3, allowed host, no referrer)`, c2.n === 3 && c2.lazy && c2.host && c2.noref, JSON.stringify(c2));
    await vf.evaluate(() => [...document.querySelectorAll('#card .cg-sec details.cg-cat')].at(-1).open = true); await B.wait(500);
    const tl = await vf.evaluate(() => [...document.querySelectorAll('#card .cg-sec ol.cg-list li')].map(li => li.textContent.replace(/\s+/g, ' ').trim()));
    rep.check(`${name} person timeline in floor order with the place`, tl.length === 2 && /40/.test(tl[0]) && /sfw #2/.test(tl[0]) && /42/.test(tl[1]) && tl.every(t => t.includes('施粥站')), JSON.stringify(tl));
    await B.shot(p, OUT, `cg_${name}_person`);
    if (preset === 'phone') { const fit = await vf.evaluate(() => { const c = document.querySelector('#card'), g = c.querySelector('.cg-sec'), r = c.getBoundingClientRect();   // the card's own close button is outside this section
        return { sec: g.scrollWidth, secw: g.clientWidth, doc: document.documentElement.scrollWidth, vw: innerWidth, wide: [...g.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > r.right + 1).length }; });
      rep.check(`${name} 375 px: the gallery section fits the card, no horizontal page scroll`, fit.sec <= fit.secw + 1 && fit.doc <= fit.vw + 1 && fit.wide === 0, JSON.stringify(fit)); }
    // place card: scenes here
    await vf.evaluate(h => ViewerDebug.showCard(null, h, '', '', h), HERE); await B.wait(800);
    const pl = await vf.evaluate(() => { const s = document.querySelector('#card .cg-scenes'); return s ? { h: s.querySelector('h4')?.textContent, rows: [...s.querySelectorAll('li')].map(li => li.textContent.replace(/\s+/g, ' ').trim()), imgs: s.querySelectorAll('img').length } : null; });
    rep.check(`${name} place card: "scenes here" lists the scenes at this place (3, with the character and category)`, !!pl && pl.rows.length === 3 && /Aria/.test(pl.rows[0]) && /Bram/.test(pl.rows[1]) && /口交 #4/.test(pl.rows[2]), JSON.stringify(pl));
    await B.shot(p, OUT, `cg_${name}_place`);
    // nothing stored
    const st = await p.evaluate(() => ({ ls: Object.keys(localStorage).filter(k => (localStorage.getItem(k) || '').includes('synthetic@main')), vars: JSON.stringify(window.__vars || {}).includes('synthetic@main') }));
    const vs = await vf.evaluate(() => Object.keys(localStorage).filter(k => (localStorage.getItem(k) || '').includes('synthetic@main')));
    rep.check(`${name} no address is stored (local storage, chat variable)`, !st.ls.length && !vs.length && !st.vars, JSON.stringify({ st, vs }));
    // the switch: off -> nothing rendered; on -> back
    await vf.evaluate(() => GalleryView.setOn(false)); await B.wait(600);
    const off = await vf.evaluate(() => ({ sec: !!document.querySelector('#card .cg-sec, #card .cg-scenes'), key: localStorage.getItem('edenMapGallery') }));
    await vf.evaluate(() => CharactersView.cardOf('Aria')); await B.wait(600);
    const off2 = await vf.evaluate(() => ({ sec: !!document.querySelector('#card .cg-sec, #card .cg-scenes') }));
    rep.check(`${name} switch off: nothing rendered on either card`, !off.sec && off.key === '0' && !off2.sec, JSON.stringify({ off, off2 }));
    await vf.evaluate(() => GalleryView.setOn(true)); await B.wait(1200);
    await vf.evaluate(() => CharactersView.cardOf('Aria')); await B.wait(600);
    rep.check(`${name} switch on again: the viewer asks the host and the sections come back`, await vf.evaluate(() => !!document.querySelector('#card .cg-sec')));
    rep.check(`${name} no script errors`, !P.errors.filter(e => !/http 404/.test(e)).length, P.errors.slice(0, 3).join(' | '));
  } catch (e) { rep.check(`${name} run`, false, e.message.split('\n')[0]); }
  finally { await P.close(); }
}
try { await run('desk', 'desktop'); await run('phone', 'phone'); }
finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? 'all passed' : 'failures'} → ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
